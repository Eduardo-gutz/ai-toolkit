import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readState, writeState, getInstalled } from '../../../adapters/_shared/state.mjs';
import { readAgent } from '../../../adapters/_shared/agents-walker.mjs';
import { canonicalToOpencode } from '../../../adapters/_shared/mcp-transform.mjs';
import { listRules, renderRules } from '../../../adapters/_shared/rules-renderer.mjs';

const FIXTURES = join(import.meta.dirname, '../../fixtures/source');

test('opencode: agent file is copied to .opencode/agents/', async () => {
  const tmpDir = await mkTmp();
  await initAdapter(tmpDir);

  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const agentPath = join(tmpDir, '.opencode/agents/test-agent.md');
  const exists = await fileExists(agentPath);
  assert.ok(exists, 'agent file should exist');

  // Should be a regular file (copy), NOT a symlink.
  const isLink = await isSymlink(agentPath);
  assert.equal(isLink, false, 'agent should be a copy, not a symlink');
});

test('opencode: skill installed to .opencode/skills/', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const skillPath = join(tmpDir, '.opencode/skills/test-skill/SKILL.md');
  const exists = await fileExists(skillPath);
  assert.ok(exists, 'skill file should exist');
});

test('opencode: MCP merged into opencode.json', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const configPath = join(tmpDir, 'opencode.json');
  const cfg = JSON.parse(await readFile(configPath));
  assert.ok(cfg.mcp, 'mcp section should exist');
  assert.ok(cfg.mcp['test-mcp'], 'test-mcp should be present');
  assert.equal(cfg.mcp['test-mcp'].type, 'remote');
  assert.equal(cfg.mcp['test-mcp'].url, 'https://example.com/mcp');
});

test('opencode: rules rendered to AGENTS.md', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const agentsPath = join(tmpDir, 'AGENTS.md');
  const exists = await fileExists(agentsPath);
  assert.ok(exists, 'AGENTS.md should exist');

  const content = await readFile(agentsPath);
  assert.ok(content.includes('Test Rule'), 'should include first rule');
  assert.ok(content.includes('Test Rule Two'), 'should include second rule');
});

test('opencode: state file records installations', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const state = readState(tmpDir);
  assert.ok(state.tools.opencode, 'state should track opencode');
  assert.ok(state.tools.opencode.agents['test-agent']);
  assert.ok(state.tools.opencode.skills['test-skill']);
  assert.ok(state.tools.opencode.mcps['test-mcp']);
});

test('opencode: validate is a no-op smoke test', async () => {
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  const result = await adapter.validate({ source: FIXTURES, config: {} });
  assert.equal(result.ok, true);
});

test('opencode: installRules records AGENTS.md ownership (with rules)', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const state = readState(tmpDir);
  assert.ok(
    state.agents_md_owners.includes('opencode'),
    `state.agents_md_owners should include 'opencode', got: ${JSON.stringify(state.agents_md_owners)}`
  );
});

test('opencode: installRules records AGENTS.md ownership (no rules branch)', async () => {
  // Source with no rules directory → installRules hits the else branch,
  // which still writes a stub AGENTS.md. Ownership must be recorded.
  const tmpDir = await mkTmp();
  const sourceDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: sourceDir, target: tmpDir, config: {} });

  const state = readState(tmpDir);
  assert.ok(
    state.agents_md_owners.includes('opencode'),
    'should own AGENTS.md even when no rules are installed'
  );
});

test('opencode: remove — empty state, no crash', async () => {
  // Fresh project with state already clean — remove should be a graceful no-op.
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await assert.doesNotReject(
    adapter.remove({ target: tmpDir, config: {} })
  );
});

test('opencode: remove — single tool cleans AGENTS.md', async () => {
  // Install with rules, then remove everything. With only this tool as owner,
  // AGENTS.md should be deleted (opencode has no CLAUDE.md).
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  assert.ok(await fileExists(join(tmpDir, 'AGENTS.md')), 'pre: AGENTS.md exists');

  await adapter.remove({ target: tmpDir, config: {} });

  assert.equal(await fileExists(join(tmpDir, 'AGENTS.md')), false, 'AGENTS.md deleted');
});

test('opencode: remove — cross-tool AGENTS.md persists', async () => {
  // Install both adapters with rules. Remove only claude-code. AGENTS.md must
  // persist because opencode still owns it.
  const tmpDir = await mkTmp();
  const claude = await import('../../../adapters/claude-code/adapter.mjs');
  const opencode = await import('../../../adapters/opencode/adapter.mjs');

  await claude.install({ source: FIXTURES, target: tmpDir, config: {} });
  await opencode.install({ source: FIXTURES, target: tmpDir, config: {} });

  assert.ok(await fileExists(join(tmpDir, 'AGENTS.md')), 'pre: AGENTS.md exists');

  await claude.remove({ target: tmpDir, config: {} });

  // AGENTS.md should STILL exist — opencode still owns it.
  assert.ok(
    await fileExists(join(tmpDir, 'AGENTS.md')),
    'AGENTS.md persists when other tool still owns it'
  );
});

test('opencode: remove — legacy state, no other tools, deletes AGENTS.md', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const { writeState } = await import('../../../adapters/_shared/state.mjs');
  const state = readState(tmpDir);
  delete state.agents_md_owners;
  writeState(tmpDir, state);

  await adapter.remove({ target: tmpDir, config: {} });

  assert.equal(
    await fileExists(join(tmpDir, 'AGENTS.md')),
    false,
    'AGENTS.md deleted in legacy fallback when only this tool is registered'
  );
});

test('opencode: remove — legacy state, other tools registered, AGENTS.md persists', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const { writeState } = await import('../../../adapters/_shared/state.mjs');
  const state = readState(tmpDir);
  delete state.agents_md_owners;
  state.tools['claude-code'] = { rules: { 'test-rule': { installed_at: new Date().toISOString() } } };
  writeState(tmpDir, state);

  await adapter.remove({ target: tmpDir, config: {} });

  assert.ok(
    await fileExists(join(tmpDir, 'AGENTS.md')),
    'AGENTS.md persists in legacy fallback when other tools are registered'
  );
});

test('opencode: remove — corrupted state file, logs warning, does not throw', async () => {
  const tmpDir = await mkTmp();
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(tmpDir, '.ai-toolkit.json'), '{ this is not json');

  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await assert.doesNotReject(
    adapter.remove({ target: tmpDir, config: {} })
  );
});

test('opencode: remove rules re-renders AGENTS.md without deleted rule (T4)', async () => {
  // Install with rules X and Y. Trim state to ONLY 'test-rule-two.md'.
  // remove({types:['rules']}) re-renders AGENTS.md with remaining source rules.
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const state = readState(tmpDir);
  delete state.tools.opencode.rules['test-rule.md'];
  const { writeState } = await import('../../../adapters/_shared/state.mjs');
  writeState(tmpDir, state);

  await adapter.remove({
    target: tmpDir,
    source: FIXTURES,
    config: {},
    types: ['rules'],
  });

  const after = await readFile(join(tmpDir, 'AGENTS.md'));
  assert.ok(
    !after.includes('Test Rule Two'),
    'AGENTS.md no longer contains the deleted rule (test-rule-two)'
  );
  assert.ok(after.includes('Test Rule\n'), 'AGENTS.md re-rendered with the remaining source rule');
});

test('opencode: remove with --types=[agents,skills] preserves rules + mcps state AND filesystem', async () => {
  // Regression mirror of the claude-code T-filter test: --types=[agents,skills]
  // must NOT touch mcps/rules. Setup: install full source. Remove only
  // agents + skills. Expectations:
  //   - state: agents/skills pruned, mcps + rules preserved
  //   - AGENTS.md still exists (rules were not removed)
  //   - opencode.json.mcp['test-mcp'] still exists (mcps were not removed)
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  // Pre-conditions on filesystem.
  assert.ok(await fileExists(join(tmpDir, 'AGENTS.md')), 'pre: AGENTS.md exists');
  const opencodeBefore = JSON.parse(await readFile(join(tmpDir, 'opencode.json')));
  assert.ok(
    opencodeBefore.mcp?.['test-mcp'],
    'pre: opencode.json contains mcp.test-mcp'
  );

  // Act: scoped remove (only agents + skills).
  await adapter.remove({
    target: tmpDir,
    source: FIXTURES,
    config: {},
    types: ['agents', 'skills'],
  });

  // State assertions: agents/skills pruned, mcps + rules preserved.
  const state = readState(tmpDir);
  assert.equal(
    state.tools?.opencode?.agents,
    undefined,
    'state.agents pruned after remove'
  );
  assert.equal(
    state.tools?.opencode?.skills,
    undefined,
    'state.skills pruned after remove'
  );
  assert.ok(
    state.tools?.opencode?.mcps?.['test-mcp'],
    'state.mcps preserved (not in --types)'
  );
  assert.ok(
    state.tools?.opencode?.rules?.['test-rule.md'],
    'state.rules.test-rule.md preserved (not in --types)'
  );
  assert.ok(
    state.tools?.opencode?.rules?.['test-rule-two.md'],
    'state.rules.test-rule-two.md preserved (not in --types)'
  );

  // ── Filesystem regression assertions ───────────────────────────────────
  // AGENTS.md MUST persist because rules were NOT removed.
  assert.ok(
    await fileExists(join(tmpDir, 'AGENTS.md')),
    'AGENTS.md preserved when --types excludes rules'
  );
  // opencode.json's `mcp` key MUST persist because mcps were NOT removed.
  // hadMcps is state-based; postRemoveCleanup now also checks state so the
  // key is left untouched when mcps survive.
  const opencodeAfter = JSON.parse(await readFile(join(tmpDir, 'opencode.json')));
  assert.ok(
    opencodeAfter.mcp?.['test-mcp'],
    'opencode.json mcp key preserved when --types excludes mcps'
  );
});

test('opencode: remove with corrupted opencode.json does not throw (T10)', async () => {
  // User-edited opencode.json that became invalid JSON — removeResource for
  // mcps must not crash; readJsonConfig should fall back to {}.
  const tmpDir = await mkTmp();
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(tmpDir, 'opencode.json'), '{ this is not valid json');

  const { writeState } = await import('../../../adapters/_shared/state.mjs');
  const state = {
    version: '1.0.0',
    installed_at: null,
    last_sync_at: null,
    tools: {},
    agents_md_owners: [],
  };
  state.tools.opencode = {
    agents: {},
    skills: {},
    mcps: { 'test-mcp': { installed_at: '2026-01-01' } },
    rules: {},
  };
  writeState(tmpDir, state);

  const adapter = await import('../../../adapters/opencode/adapter.mjs');
  await assert.doesNotReject(
    adapter.remove({ target: tmpDir, config: {}, types: ['mcps'] })
  );
});

// ─── helpers ────────────────────────────────────────────────────────────

import { mkdtemp, readFile as _readFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

async function mkTmp() {
  return mkdtemp(join(tmpdir(), 'ai-toolkit-test-'));
}

async function readFile(path) {
  return _readFile(path, 'utf8');
}

async function fileExists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(path) {
  try {
    const s = await lstat(path);
    return s.isSymbolicLink();
  } catch {
    return false;
  }
}

async function initAdapter(targetDir) {
  // No-op for now
}