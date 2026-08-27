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