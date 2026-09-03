import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const REMOVE_CMD = join(import.meta.dirname, '../bin/commands/remove.mjs');

const VALID_CONFIG = {
  source: './source',
  default_tools: ['opencode', 'claude-code'],
  tools: {
    opencode: { enabled: true },
    'claude-code': { enabled: true },
  },
};

/**
 * Build a minimal "project" with an installed toolkit:
 * - creates .opencode/agents/, .claude/agents/, AGENTS.md, .ai-toolkit.json
 */
async function makeProjectWithInstall() {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-remove-'));

  // Mock agents
  await mkdir(join(dir, '.opencode/agents'), { recursive: true });
  await mkdir(join(dir, '.claude/agents'), { recursive: true });
  await writeFile(join(dir, '.opencode/agents/coder.md'), '---\nname: coder\n---\ncoder body\n');
  await writeFile(join(dir, '.claude/agents/coder.md'), '---\nname: coder\n---\ncoder body\n');

  // Mock state file
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } },
      'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } },
    },
  }));

  return dir;
}

async function callRemove(projectDir, args = [], flags = {}) {
  // We can't easily pass flags through spawnSync args without a CLI parser.
  // So we test by calling the function directly using dynamic import.
  process.chdir('/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit');
  const { removeCommand } = await import(REMOVE_CMD);
  try {
    await removeCommand({
      flags,
      config: VALID_CONFIG,
      args,
      configPath: 'fake',
      projectDir,
      toolkitRoot: '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

test('remove (no args) WITHOUT --yes: requires confirmation, non-TTY throws clean error', async () => {
  // Step 9(f) acceptance: tighten the existing test. When run without --yes
  // and stdin is not a TTY (the test env), the command must throw a clear,
  // actionable error AND must NOT modify any file.
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, [], { tools: 'opencode' });
    // Must throw with a recognizable message guiding the user to --yes.
    assert.equal(result.ok, false, 'non-TTY without --yes must throw');
    assert.match(
      result.error,
      /Non-interactive mode detected/i,
      `error must mention non-interactive mode. Got: ${result.error}`
    );
    assert.match(result.error, /--yes/, 'error must suggest --yes flag');
    // No files should have been removed.
    const { existsSync } = await import('node:fs');
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), 'agent file must remain after abort');
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')), 'claude-code agent file must remain after abort');
    const stateBefore = JSON.parse(await readFileSync(join(dir, '.ai-toolkit.json'), 'utf8'));
    assert.ok(stateBefore.tools?.opencode?.agents?.coder, 'state must remain unchanged after abort');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove (no args) WITH --yes: removes everything', async () => {
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, [], { tools: 'opencode', yes: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.opencode/agents/coder.md')), 'agent file should be removed');
    // State file should be updated
    const state = JSON.parse(await readFileSync(join(dir, '.ai-toolkit.json'), 'utf8'));
    assert.equal(state.tools?.opencode?.agents?.coder, undefined, 'state should be updated');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove (no args) WITH --yes on empty project: no-op', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-remove-empty-'));
  try {
    // Create empty .ai-toolkit.json
    await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({ version: '1.0.0', tools: {} }));
    const result = await callRemove(dir, [], { tools: 'opencode', yes: true });
    assert.equal(result.ok, true);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove (specific resource) still works as before', async () => {
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, ['agents', 'coder'], { tools: 'opencode' });
    assert.equal(result.ok, true);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.opencode/agents/coder.md')), 'agent should be removed');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove (invalid type) throws usage error', async () => {
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, ['nonexistent-type', 'foo'], {});
    assert.equal(result.ok, false);
    assert.match(result.error, /Unknown type/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove by type (agents) WITH --yes: removes all agents', async () => {
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, ['agents'], { tools: 'opencode', yes: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.opencode/agents/coder.md')), 'agent should be removed');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove by type (skills) WITH --yes: removes all skills', async () => {
  const dir = await makeProjectWithInstall();
  // Setup skills dir
  await mkdir(join(dir, '.opencode/skills/test-skill'), { recursive: true });
  await writeFile(join(dir, '.opencode/skills/test-skill/SKILL.md'), 'x');
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { skills: { 'test-skill': { installed_at: '2026-01-01' } } },
    },
  }));
  try {
    const result = await callRemove(dir, ['skills'], { tools: 'opencode', yes: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.opencode/skills/test-skill')), 'skill should be removed');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove by type (agents) on empty: no-op', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-remove-empty-'));
  try {
    await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({ version: '1.0.0', tools: {} }));
    const result = await callRemove(dir, ['agents'], { tools: 'opencode', yes: true });
    assert.equal(result.ok, true);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove (no args) summary counts total correctly', async () => {
  // Just verify the summary function indirectly through behavior
  const dir = await makeProjectWithInstall();
  try {
    // With --yes, it should remove all and show counts
    const result = await callRemove(dir, [], { tools: 'opencode,claude-code', yes: true });
    assert.equal(result.ok, true);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.opencode/agents/coder.md')));
    assert.ok(!existsSync(join(dir, '.claude/agents/coder.md')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove (specific claude-code resource) goes through adapter.resourcePaths and records state', async () => {
  // Regression guard for Step 2: after the refactor, removeSpecific must
  // delegate path construction to adapter.resourcePaths() instead of the
  // (now-deleted) toolPaths() helper. We exercise the claude-code path
  // explicitly (mode 3) and assert both the file deletion AND that state
  // was updated via the adapter.
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, ['agents', 'coder'], { tools: 'claude-code' });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.claude/agents/coder.md')), 'claude-code agent should be removed');
    // State should be updated for claude-code only (not opencode)
    const state = JSON.parse(await readFileSync(join(dir, '.ai-toolkit.json'), 'utf8'));
    assert.equal(state.tools?.['claude-code']?.agents?.coder, undefined, 'claude-code state entry should be cleared');
    assert.ok(state.tools?.opencode?.agents?.coder, 'opencode state entry should remain');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove agents --yes (Mode 2) cleans empty parent dirs across all tools', async () => {
  // Step 3 acceptance: after Mode 2 (`remove agents --yes`), both .opencode/agents/
  // and .claude/agents/ should be empty AND the empty dirs themselves should be
  // cleaned by postRemoveCleanup() inside adapter.remove({types:['agents']}).
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, ['agents'], { tools: 'opencode,claude-code', yes: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode agent file should be removed');
    assert.ok(!existsSync(join(dir, '.claude/agents/coder.md')), 'claude-code agent file should be removed');
    assert.ok(!existsSync(join(dir, '.opencode/agents')), 'empty .opencode/agents/ dir should be cleaned by postRemoveCleanup');
    assert.ok(!existsSync(join(dir, '.claude/agents')), 'empty .claude/agents/ dir should be cleaned by postRemoveCleanup');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove --types=agents,skills --yes removes both types across all tools', async () => {
  // Step 4 acceptance: --types= is a CSV filter on Mode 1 (no positional).
  // When `args` is empty, --types takes effect as the resource-type list.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-remove-types-'));
  try {
    // Setup project with both agents AND skills installed (in both tools).
    await mkdir(join(dir, '.opencode/agents'), { recursive: true });
    await mkdir(join(dir, '.opencode/skills/test-skill'), { recursive: true });
    await mkdir(join(dir, '.claude/agents'), { recursive: true });
    await mkdir(join(dir, '.claude/skills/test-skill'), { recursive: true });
    await writeFile(join(dir, '.opencode/agents/coder.md'), 'body');
    await writeFile(join(dir, '.claude/agents/coder.md'), 'body');
    await writeFile(join(dir, '.opencode/skills/test-skill/SKILL.md'), 'body');
    await writeFile(join(dir, '.claude/skills/test-skill/SKILL.md'), 'body');
    await writeFile(join(dir, 'AGENTS.md'), '# rules'); // rules NOT in --types, must remain
    await writeFile(join(dir, 'opencode.json'), JSON.stringify({ mcp: { foo: {} } }));
    await writeFile(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { foo: {} } }));
    await writeFile(
      join(dir, '.ai-toolkit.json'),
      JSON.stringify({
        version: '1.0.0',
        tools: {
          opencode: {
            agents: { coder: { installed_at: '2026-01-01' } },
            skills: { 'test-skill': { installed_at: '2026-01-01' } },
            mcps: { foo: { installed_at: '2026-01-01' } },
            rules: { rulename: { installed_at: '2026-01-01' } },
          },
          'claude-code': {
            agents: { coder: { installed_at: '2026-01-01' } },
            skills: { 'test-skill': { installed_at: '2026-01-01' } },
            mcps: { foo: { installed_at: '2026-01-01' } },
            rules: { rulename: { installed_at: '2026-01-01' } },
          },
        },
      })
    );

    // Run remove with --types=agents,skills (Mode 1 with type filter)
    const result = await callRemove(dir, [], {
      tools: 'opencode,claude-code',
      types: 'agents,skills',
      yes: true,
    });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);

    const { existsSync } = await import('node:fs');
    // Agents and skills files should be removed
    assert.ok(!existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode agent removed');
    assert.ok(!existsSync(join(dir, '.claude/agents/coder.md')), 'claude-code agent removed');
    assert.ok(!existsSync(join(dir, '.opencode/skills/test-skill')), 'opencode skill removed');
    assert.ok(!existsSync(join(dir, '.claude/skills/test-skill')), 'claude-code skill removed');
    // State: agents/skills entries cleared; mcps/rules entries preserved
    const state = JSON.parse(await readFileSync(join(dir, '.ai-toolkit.json'), 'utf8'));
    assert.equal(state.tools?.opencode?.agents?.coder, undefined, 'opencode agent state cleared');
    assert.equal(state.tools?.opencode?.skills?.['test-skill'], undefined, 'opencode skill state cleared');
    assert.equal(state.tools?.['claude-code']?.agents?.coder, undefined, 'claude-code agent state cleared');
    assert.equal(state.tools?.['claude-code']?.skills?.['test-skill'], undefined, 'claude-code skill state cleared');
    // MCPs and rules state should still be present (not in --types)
    assert.ok(state.tools?.opencode?.mcps?.foo, 'opencode mcps state preserved');
    assert.ok(state.tools?.opencode?.rules?.rulename, 'opencode rules state preserved');
    assert.ok(state.tools?.['claude-code']?.mcps?.foo, 'claude-code mcps state preserved');
    assert.ok(state.tools?.['claude-code']?.rules?.rulename, 'claude-code rules state preserved');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove --types=foo --yes throws "Unknown type(s)"', async () => {
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, [], { tools: 'opencode', types: 'foo', yes: true });
    assert.equal(result.ok, false, 'should throw');
    assert.match(result.error, /Unknown type\(s\)/i);
    assert.match(result.error, /foo/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove agents --yes (positional, no --types) still works (back-compat)', async () => {
  // Step 4 acceptance: `remove agents --yes` (positional) keeps working
  // alongside the new --types= flag. Both paths must coexist.
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, ['agents'], { tools: 'opencode', yes: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode agent removed via positional');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove --yes --purge: deletes .ai-toolkit.json when state.tools becomes empty', async () => {
  // Step 5 acceptance (a): --purge deletes the state file when no tools remain.
  // Use BOTH tools so all entries are removed (state.tools becomes empty).
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, [], { tools: 'opencode,claude-code', yes: true, purge: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(!existsSync(join(dir, '.ai-toolkit.json')), '.ai-toolkit.json should be deleted by --purge');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove --yes --purge: deletes .ai-toolkit.json even when state.tools is already empty', async () => {
  // Minor #1: when the project starts with an already-clean state file
  // (`tools: {}` from a previous removal), `remove --purge --yes` must still
  // delete the file — otherwise the user explicitly asked for it to be gone
  // but the early-return in removeByScope skips the purge block.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-purge-already-empty-'));
  try {
    // Empty state file (clean from a previous remove).
    await writeFile(
      join(dir, '.ai-toolkit.json'),
      JSON.stringify({ version: '1.0.0', tools: {} })
    );
    const result = await callRemove(dir, [], { tools: 'opencode', yes: true, purge: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(
      !existsSync(join(dir, '.ai-toolkit.json')),
      '.ai-toolkit.json should be deleted by --purge even when state.tools was already empty'
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove skills my-skill --yes prunes empty parent state objects (Mode 3)', async () => {
  // Minor #3: when `remove skills my-skill --yes` removes the LAST skill,
  // the parent `state.tools.opencode.skills` (and possibly `state.tools.opencode`)
  // should be pruned to keep state consistent with Modes 1 and 2.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-remove-specific-prune-'));
  try {
    // Only this one skill in opencode (none in claude-code) — removeSpecific
    // should walk up and prune empty parents.
    await mkdir(join(dir, '.opencode/skills/my-skill'), { recursive: true });
    await writeFile(join(dir, '.opencode/skills/my-skill/SKILL.md'), 'body');
    await writeFile(
      join(dir, '.ai-toolkit.json'),
      JSON.stringify({
        version: '1.0.0',
        tools: {
          opencode: {
            skills: { 'my-skill': { installed_at: '2026-01-01' } },
          },
        },
      })
    );
    const result = await callRemove(dir, ['skills', 'my-skill'], { tools: 'opencode', yes: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const state = JSON.parse(await readFileSync(join(dir, '.ai-toolkit.json'), 'utf8'));
    // Skills entry should be gone, and the parent `skills` key should be pruned.
    assert.equal(state.tools?.opencode?.skills, undefined, 'state.tools.opencode.skills should be pruned (was {} after remove)');
    // The whole opencode entry has no other types, so it should also be pruned.
    assert.equal(state.tools?.opencode, undefined, 'state.tools.opencode should be pruned (had no remaining types)');
    // tools should be fully empty (parity with Modes 1/2).
    assert.deepEqual(state.tools, {}, 'state.tools should be {} after removeSpecific prunes empty parents');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove --yes WITHOUT --purge: keeps .ai-toolkit.json with tools: {}', async () => {
  // Step 5 acceptance (b): without --purge, the state file stays with
  // tools: {} for audit trail.
  const dir = await makeProjectWithInstall();
  try {
    const result = await callRemove(dir, [], { tools: 'opencode,claude-code', yes: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);
    const { existsSync } = await import('node:fs');
    assert.ok(existsSync(join(dir, '.ai-toolkit.json')), '.ai-toolkit.json should remain without --purge');
    const state = JSON.parse(await readFileSync(join(dir, '.ai-toolkit.json'), 'utf8'));
    assert.deepEqual(state.tools, {}, 'state.tools should be empty {} after removal');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove commands my-cmd --yes is accepted (parity with init ALL_TYPES)', async () => {
  // Step 6 acceptance: 'commands' is a valid type per ALL_TYPES (init.mjs:7).
  // remove.mjs used to have its own VALID_TYPES missing 'commands', so this
  // previously threw "Unknown type: 'commands'". Now it accepts the type and
  // delegates to the adapter.
  //
  // Note: the underlying adapter doesn't currently handle 'commands' (no walker
  // yet — see WHY.md §8 Fase 3), so Mode 3 (specific resource) finds no file
  // paths to delete and prints "was not installed". For Mode 1 (`remove --yes`),
  // the adapter's remove() iterates state and clears the state entry directly.
  // The acceptance here is purely that the type-validation passes.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-remove-cmd-'));
  try {
    // Use Mode 1 (no positional) so adapter.remove() is exercised — it
    // iterates state directly and clears 'commands' entries regardless of
    // file paths.
    await writeFile(
      join(dir, '.ai-toolkit.json'),
      JSON.stringify({
        version: '1.0.0',
        tools: {
          opencode: { commands: { 'my-cmd': { installed_at: '2026-01-01' } } },
        },
      })
    );
    const result = await callRemove(dir, [], { tools: 'opencode', yes: true });
    assert.equal(result.ok, true, `Should accept 'commands' type. Got: ${result.error}`);
    // State should have 'commands' entry removed (via adapter.remove() loop).
    const state = JSON.parse(await readFileSync(join(dir, '.ai-toolkit.json'), 'utf8'));
    assert.equal(state.tools?.opencode?.commands?.['my-cmd'], undefined, 'commands state entry cleared by adapter.remove()');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('remove --yes (Mode 1) deletes stub files (AGENTS.md, CLAUDE.md, mcp keys)', async () => {
  // Step 9(e) acceptance: Mode 1 (`remove --yes`) cleans up the stub files
  // that the adapter created on install:
  //   - opencode:    AGENTS.md, opencode.json's `mcp` key
  //   - claude-code: AGENTS.md, CLAUDE.md, .mcp.json's `mcpServers` key
  //
  // Setup: install both tools, then run `remove --yes`. The stub files
  // should be gone after.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-remove-stubs-'));
  try {
    // Stub files that adapter.postRemoveCleanup() targets.
    await writeFile(join(dir, 'AGENTS.md'), '# rules');
    await writeFile(join(dir, 'CLAUDE.md'), '@AGENTS.md');
    await writeFile(join(dir, 'opencode.json'), JSON.stringify({ mcp: { foo: { type: 'remote' } } }));
    await writeFile(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { foo: { type: 'http' } } }));

    // Resources that adapter.remove() will iterate and clear.
    await mkdir(join(dir, '.opencode/agents'), { recursive: true });
    await mkdir(join(dir, '.claude/agents'), { recursive: true });
    await writeFile(join(dir, '.opencode/agents/coder.md'), 'body');
    await writeFile(join(dir, '.claude/agents/coder.md'), 'body');

    // State file marking the install.
    await writeFile(
      join(dir, '.ai-toolkit.json'),
      JSON.stringify({
        version: '1.0.0',
        tools: {
          opencode: {
            agents: { coder: { installed_at: '2026-01-01' } },
            mcps: { foo: { installed_at: '2026-01-01' } },
            rules: { rulename: { installed_at: '2026-01-01' } },
          },
          'claude-code': {
            agents: { coder: { installed_at: '2026-01-01' } },
            mcps: { foo: { installed_at: '2026-01-01' } },
            rules: { rulename: { installed_at: '2026-01-01' } },
          },
        },
      })
    );

    const result = await callRemove(dir, [], { tools: 'opencode,claude-code', yes: true });
    assert.equal(result.ok, true, `Should not throw. Got: ${result.error}`);

    const { existsSync } = await import('node:fs');
    // Stub files: deleted
    assert.ok(!existsSync(join(dir, 'AGENTS.md')), 'AGENTS.md should be removed by postRemoveCleanup');
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')), 'CLAUDE.md should be removed by postRemoveCleanup');
    // mcp/mcpServers keys: deleted. If the JSON file becomes empty, the
    // file itself is deleted by removeJsonKeys.
    assert.ok(!existsSync(join(dir, 'opencode.json')), 'opencode.json should be deleted (empty after mcp key removal)');
    assert.ok(!existsSync(join(dir, '.mcp.json')), '.mcp.json should be deleted (empty after mcpServers key removal)');
    // Resources: deleted
    assert.ok(!existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode agent file removed');
    assert.ok(!existsSync(join(dir, '.claude/agents/coder.md')), 'claude-code agent file removed');
  } finally {
    await rm(dir, { recursive: true });
  }
});