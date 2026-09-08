import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readState } from '../../../adapters/_shared/state.mjs';

const FIXTURES = join(import.meta.dirname, '../../fixtures/source');

test('claude-code: agent rendered to .claude/agents/ with name in frontmatter', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const agentPath = join(tmpDir, '.claude/agents/test-agent.md');
  const exists = await fileExists(agentPath);
  assert.ok(exists, 'agent file should exist');

  const content = await readFile(agentPath);
  assert.ok(content.includes('name: test-agent'), 'name in frontmatter');
  assert.ok(content.includes('description:'), 'description in frontmatter');
});

test('claude-code: skill installed to .claude/skills/', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const skillPath = join(tmpDir, '.claude/skills/test-skill/SKILL.md');
  const exists = await fileExists(skillPath);
  assert.ok(exists, 'skill file should exist');
});

test('claude-code: MCP merged into .mcp.json', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const configPath = join(tmpDir, '.mcp.json');
  const cfg = JSON.parse(await readFile(configPath));
  assert.ok(cfg.mcpServers, 'mcpServers section should exist');
  assert.ok(cfg.mcpServers['test-mcp']);
  assert.equal(cfg.mcpServers['test-mcp'].type, 'http');
});

test('claude-code: rules rendered to AGENTS.md + CLAUDE.md', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const agentsExists = await fileExists(join(tmpDir, 'AGENTS.md'));
  const claudeExists = await fileExists(join(tmpDir, 'CLAUDE.md'));
  assert.ok(agentsExists, 'AGENTS.md should exist');
  assert.ok(claudeExists, 'CLAUDE.md should exist');

  const claudeContent = await readFile(join(tmpDir, 'CLAUDE.md'));
  assert.ok(claudeContent.includes('AGENTS.md'), 'CLAUDE.md should reference AGENTS.md');
});

test('claude-code: state file records installations', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const state = readState(tmpDir);
  assert.ok(state.tools['claude-code'], 'state should track claude-code');
  assert.ok(state.tools['claude-code'].agents['test-agent']);
});

test('claude-code: validate is a no-op smoke test', async () => {
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  const result = await adapter.validate({ source: FIXTURES, config: {} });
  assert.equal(result.ok, true);
});

test('claude-code: installRules records AGENTS.md ownership (with rules)', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const state = readState(tmpDir);
  assert.ok(
    state.agents_md_owners.includes('claude-code'),
    `state.agents_md_owners should include 'claude-code', got: ${JSON.stringify(state.agents_md_owners)}`
  );
});

test('claude-code: installRules records AGENTS.md ownership (no rules branch)', async () => {
  // Source with no rules directory → installRules hits the else branch,
  // which still writes a stub AGENTS.md. Ownership must be recorded.
  const tmpDir = await mkTmp();
  const sourceDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: sourceDir, target: tmpDir, config: {} });

  const state = readState(tmpDir);
  assert.ok(
    state.agents_md_owners.includes('claude-code'),
    'should own AGENTS.md even when no rules are installed'
  );
});

test('claude-code: remove — empty state, no crash', async () => {
  // Fresh project with state already clean — remove should be a graceful no-op.
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await assert.doesNotReject(
    adapter.remove({ target: tmpDir, config: {} })
  );
});

test('claude-code: remove — single tool with rules cleans AGENTS.md, keeps CLAUDE.md', async () => {
  // Install with rules, then remove everything. With only this tool as owner,
  // AGENTS.md is deleted (legitimate, no other owner). CLAUDE.md is KEPT
  // because this adapter originally had rules — user may have customized
  // CLAUDE.md (it imports AGENTS.md, which is now gone, but the user can
  // repair it themselves). Per plan §1.4: "CLAUDE.md only deletes if adapter
  // had no rules before remove."
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  assert.ok(await fileExists(join(tmpDir, 'AGENTS.md')), 'pre: AGENTS.md exists');
  assert.ok(await fileExists(join(tmpDir, 'CLAUDE.md')), 'pre: CLAUDE.md exists');

  await adapter.remove({ target: tmpDir, config: {} });

  assert.equal(await fileExists(join(tmpDir, 'AGENTS.md')), false, 'AGENTS.md deleted');
  assert.ok(await fileExists(join(tmpDir, 'CLAUDE.md')), 'CLAUDE.md kept (adapter had rules)');
});

test('claude-code: remove — single tool with NO rules cleans both AGENTS.md and CLAUDE.md', async () => {
  // Install with a source that has no rules directory → installRules hits the
  // else branch (writes stub AGENTS.md) but state.tools[toolName].rules is
  // never populated. After remove: hadRules=false, so CLAUDE.md gets dropped.
  const tmpDir = await mkTmp();
  const sourceDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: sourceDir, target: tmpDir, config: {} });

  assert.ok(await fileExists(join(tmpDir, 'AGENTS.md')), 'pre: AGENTS.md exists');
  assert.ok(await fileExists(join(tmpDir, 'CLAUDE.md')), 'pre: CLAUDE.md exists');

  await adapter.remove({ target: tmpDir, config: {} });

  assert.equal(await fileExists(join(tmpDir, 'AGENTS.md')), false, 'AGENTS.md deleted');
  assert.equal(await fileExists(join(tmpDir, 'CLAUDE.md')), false, 'CLAUDE.md deleted (no rules)');
});

test('claude-code: remove — cross-tool AGENTS.md persists', async () => {
  // Install both adapters with rules. Remove only opencode. AGENTS.md must
  // persist because claude-code still owns it.
  const tmpDir = await mkTmp();
  const claude = await import('../../../adapters/claude-code/adapter.mjs');
  const opencode = await import('../../../adapters/opencode/adapter.mjs');

  await claude.install({ source: FIXTURES, target: tmpDir, config: {} });
  await opencode.install({ source: FIXTURES, target: tmpDir, config: {} });

  assert.ok(await fileExists(join(tmpDir, 'AGENTS.md')), 'pre: AGENTS.md exists');

  await opencode.remove({ target: tmpDir, config: {} });

  // AGENTS.md should STILL exist — claude-code still owns it.
  assert.ok(
    await fileExists(join(tmpDir, 'AGENTS.md')),
    'AGENTS.md persists when other tool still owns it'
  );
});

test('claude-code: remove — legacy state without agents_md_owners, no other tools, deletes AGENTS.md', async () => {
  // Legacy state (no agents_md_owners) and this is the only tool registered.
  // Fallback: delete AGENTS.md because no one else owns it.
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  // Strip ownership field to simulate legacy state.
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

test('claude-code: remove — legacy state, other tools registered, AGENTS.md persists', async () => {
  // Legacy state (no agents_md_owners) but other tools registered in state.tools.
  // Conservative fallback: don't delete AGENTS.md.
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  // Add a phantom tool to state.tools (simulates another adapter having installed).
  const { writeState } = await import('../../../adapters/_shared/state.mjs');
  const state = readState(tmpDir);
  delete state.agents_md_owners;
  state.tools['opencode'] = { rules: { 'test-rule': { installed_at: new Date().toISOString() } } };
  writeState(tmpDir, state);

  await adapter.remove({ target: tmpDir, config: {} });

  // AGENTS.md must persist because the legacy fallback sees another tool registered.
  assert.ok(
    await fileExists(join(tmpDir, 'AGENTS.md')),
    'AGENTS.md persists in legacy fallback when other tools are registered'
  );
});

test('claude-code: remove — corrupted state file, logs warning, does not throw', async () => {
  // State file with invalid JSON — remove should warn and skip, not crash.
  const tmpDir = await mkTmp();
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(tmpDir, '.ai-toolkit.json'), '{ this is not json');

  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await assert.doesNotReject(
    adapter.remove({ target: tmpDir, config: {} })
  );
});

test('claude-code: remove with --types=[agents,skills] preserves rules + mcps state AND filesystem', async () => {
  // Regression: when --types filters to [agents,skills], the snapshots
  // hadRules/hadMcps were captured BEFORE the filter was applied. This
  // caused postRemoveCleanup to delete AGENTS.md and the mcpServers key
  // from .mcp.json even though those types were NOT in the filter.
  //
  // Setup: install full source (all 4 types: agents, skills, mcps, rules).
  // Pre-conditions: AGENTS.md, CLAUDE.md, .mcp.json with mcpServers all exist.
  // Act: remove({types:['agents','skills']}).
  // Assertions:
  //   - state: agents/skills gone, mcps + rules state preserved
  //   - filesystem (regression guards):
  //       * AGENTS.md still exists (rules were not removed)
  //       * CLAUDE.md still exists (rules were not removed)
  //       * .mcp.json still contains the mcpServers key with test-mcp
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  // Pre-conditions on filesystem.
  assert.ok(await fileExists(join(tmpDir, 'AGENTS.md')), 'pre: AGENTS.md exists');
  assert.ok(await fileExists(join(tmpDir, 'CLAUDE.md')), 'pre: CLAUDE.md exists');
  const mcpBefore = JSON.parse(await readFile(join(tmpDir, '.mcp.json')));
  assert.ok(
    mcpBefore.mcpServers?.['test-mcp'],
    'pre: .mcp.json contains mcpServers.test-mcp'
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
    state.tools?.['claude-code']?.agents,
    undefined,
    'state.agents pruned after remove'
  );
  assert.equal(
    state.tools?.['claude-code']?.skills,
    undefined,
    'state.skills pruned after remove'
  );
  assert.ok(
    state.tools?.['claude-code']?.mcps?.['test-mcp'],
    'state.mcps preserved (not in --types)'
  );
  assert.ok(
    state.tools?.['claude-code']?.rules?.['test-rule.md'],
    'state.rules.test-rule.md preserved (not in --types)'
  );
  assert.ok(
    state.tools?.['claude-code']?.rules?.['test-rule-two.md'],
    'state.rules.test-rule-two.md preserved (not in --types)'
  );

  // ── Filesystem regression assertions (the bug) ──────────────────────────
  // AGENTS.md MUST persist because rules were NOT removed (hadRules + the
  // release-ownership path must both respect the --types filter).
  assert.ok(
    await fileExists(join(tmpDir, 'AGENTS.md')),
    'AGENTS.md preserved when --types excludes rules (hadRules must respect types filter)'
  );
  // CLAUDE.md MUST persist: it imports AGENTS.md (verified in test L44-56),
  // and Claude Code needs CLAUDE.md as its entry point to the rules. If
  // AGENTS.md persists, CLAUDE.md must persist too. hadRules must remain
  // state-based (NOT filtered by --types) so this holds when --types
  // excludes rules but state still has rules registered.
  assert.ok(
    await fileExists(join(tmpDir, 'CLAUDE.md')),
    'CLAUDE.md preserved when --types excludes rules (hadRules must be state-based, not types-filtered)'
  );
  // .mcp.json's mcpServers key MUST persist because mcps were NOT removed.
  const mcpAfter = JSON.parse(await readFile(join(tmpDir, '.mcp.json')));
  assert.ok(
    mcpAfter.mcpServers?.['test-mcp'],
    '.mcp.json mcpServers key preserved when --types excludes mcps (hadMcps must respect types filter)'
  );
});

test('claude-code: remove rules re-renders AGENTS.md without deleted rule (T4)', async () => {
  // Install with both rules. Trim state to ONLY 'test-rule-two.md'.
  // remove({types:['rules']}) iterates state, finds 'test-rule-two.md', re-renders
  // AGENTS.md with remaining source rules (filtering out 'test-rule-two.md'),
  // which leaves just 'test-rule.md' from source.
  const tmpDir = await mkTmp();
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  await adapter.install({ source: FIXTURES, target: tmpDir, config: {} });

  const state = readState(tmpDir);
  delete state.tools['claude-code'].rules['test-rule.md'];
  const { writeState } = await import('../../../adapters/_shared/state.mjs');
  writeState(tmpDir, state);

  await adapter.remove({
    target: tmpDir,
    source: FIXTURES,
    config: {},
    types: ['rules'],
  });

  // AGENTS.md re-rendered: contains test-rule (from source), NOT test-rule-two.
  const after = await readFile(join(tmpDir, 'AGENTS.md'));
  assert.ok(
    !after.includes('Test Rule Two'),
    'AGENTS.md no longer contains the deleted rule (test-rule-two)'
  );
  assert.ok(after.includes('Test Rule\n'), 'AGENTS.md re-rendered with the remaining source rule');
});

test('claude-code: renderAgent does not mutate agent input (T11)', async () => {
  // renderAgent normalizes frontmatter by adding `name` if missing. It must
  // NOT mutate the input object (M9) — the walker reuses the parsed object
  // across calls, so in-place mutation would corrupt subsequent reads.
  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  const agent = {
    name: 'foo',
    file: '/tmp/foo.md',
    frontmatter: { description: 'A test agent', mode: 'all' },  // no `name`
    body: '# Body',
  };
  const before = JSON.stringify(agent.frontmatter);
  adapter.renderAgent(agent);
  const after = JSON.stringify(agent.frontmatter);
  assert.equal(before, after, 'renderAgent must not mutate the input frontmatter');
});

test('claude-code: remove with corrupted .mcp.json does not throw (T10)', async () => {
  // User-edited .mcp.json that became invalid JSON — removeResource for mcps
  // must not crash; readJsonConfig should fall back to {}.
  const tmpDir = await mkTmp();
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(tmpDir, '.mcp.json'), '{ this is not valid json');

  const adapter = await import('../../../adapters/claude-code/adapter.mjs');
  const { writeState } = await import('../../../adapters/_shared/state.mjs');
  const state = {
    version: '1.0.0',
    installed_at: null,
    last_sync_at: null,
    tools: {},
    agents_md_owners: [],
  };
  state.tools['claude-code'] = {
    agents: {},
    skills: {},
    mcps: { 'test-mcp': { installed_at: '2026-01-01' } },
    rules: {},
  };
  writeState(tmpDir, state);

  await assert.doesNotReject(
    adapter.remove({ target: tmpDir, config: {}, types: ['mcps'] })
  );
});

// ─── helpers ────────────────────────────────────────────────────────────

import { mkdtemp, readFile as _readFile, lstat } from 'node:fs/promises';
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