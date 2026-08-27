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