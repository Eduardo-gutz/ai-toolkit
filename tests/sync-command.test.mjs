import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SYNC_CMD = join(import.meta.dirname, '../bin/commands/sync.mjs');
const TOOLKIT = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
const VALID_CONFIG_FULL = {
  source: './source',
  default_tools: ['opencode', 'claude-code'],
  tools: {
    opencode: { enabled: true },
    'claude-code': { enabled: true },
  },
};

const VALID_CONFIG_OPENCODE_ONLY = {
  source: './source',
  default_tools: ['opencode'],
  tools: {
    opencode: { enabled: true },
  },
};

async function callSync(projectDir, flags = {}) {
  process.chdir(TOOLKIT);
  const { syncCommand } = await import(SYNC_CMD);
  try {
    await syncCommand({
      flags,
      config: VALID_CONFIG_FULL,
      configPath: 'fake',
      projectDir,
      toolkitRoot: TOOLKIT,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Helpers: build a project with concrete filesystem markers (=source of truth).
async function makeOpencodeProject() {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-oc-'));
  await mkdir(join(dir, '.opencode/agents'), { recursive: true });
  await mkdir(join(dir, '.opencode/skills'), { recursive: true });
  await writeFile(join(dir, '.opencode/agents/coder.md'), 'coder');
  await writeFile(join(dir, 'AGENTS.md'), 'AGENTS');
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: { opencode: { agents: { coder: { installed_at: '2026-01-01' } } } },
  }));
  return dir;
}

async function makeClaudeProject() {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-cc-'));
  await mkdir(join(dir, '.claude/agents'), { recursive: true });
  await mkdir(join(dir, '.claude/skills'), { recursive: true });
  await writeFile(join(dir, '.claude/agents/coder.md'), 'coder');
  await writeFile(join(dir, 'CLAUDE.md'), 'CLAUDE');
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: { 'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } } },
  }));
  return dir;
}

async function makeBothProject() {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-both-'));
  await mkdir(join(dir, '.opencode/agents'), { recursive: true });
  await mkdir(join(dir, '.claude/agents'), { recursive: true });
  await writeFile(join(dir, '.opencode/agents/coder.md'), 'coder');
  await writeFile(join(dir, '.claude/agents/coder.md'), 'coder');
  await writeFile(join(dir, 'AGENTS.md'), 'AGENTS');
  await writeFile(join(dir, 'CLAUDE.md'), 'CLAUDE');
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } },
      'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } },
    },
  }));
  return dir;
}

// ─── Override (--tools flag) ─────────────────────────────────────

test('sync: --tools=opencode syncs opencode', async () => {
  const dir = await makeBothProject();
  try {
    const result = await callSync(dir, { tools: 'opencode' });
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
    // Selective sync must not delete the claude-code state entry or its fs files.
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')), '.claude/ untouched by selective sync');
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(updated.tools?.['claude-code'], 'claude-code remains in state');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --tools=claude-code syncs claude-code', async () => {
  const dir = await makeBothProject();
  try {
    const result = await callSync(dir, { tools: 'claude-code' });
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')));
    // Selective sync must not delete the opencode state entry or its fs files.
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), '.opencode/ untouched by selective sync');
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(updated.tools?.opencode, 'opencode remains in state');
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── Selective --tools must NOT prune non-synced configured tools ─────

test('sync: --tools selective preserves non-synced configured tools that are still installed (regression iter 3)', async () => {
  // Regression for the iter 3 bug: when --tools=opencode is used on a
  // project with BOTH opencode and claude-code installed, the prune loop
  // used to delete the claude-code state entry even though .claude/ files
  // were still on disk — leaving orphaned fs files invisible to future
  // sync/list/doctor. The fix: prune also checks fs markers (a tool not
  // synced this run is only prunable if it's not actually installed).
  const dir = await makeBothProject();
  try {
    const result = await callSync(dir, { tools: 'opencode' });
    assert.equal(result.ok, true);
    // opencode synced; claude-code files still on disk (untouched).
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode synced');
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')), '.claude/ files untouched by selective sync');
    // State: BOTH tools preserved (no silent deletion of claude-code).
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(updated.tools?.opencode, 'opencode remains in state');
    assert.ok(updated.tools?.['claude-code'], 'claude-code remains in state (selective --tools must not delete entries for still-installed tools)');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --tools=opencode,claude-code syncs both', async () => {
  const dir = await makeBothProject();
  try {
    const result = await callSync(dir, { tools: 'opencode,claude-code' });
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --tools=invalid-tool is rejected with error', async () => {
  // loadAdapter rejects unwhitelisted tools. The error is caught and
  // accumulated in errors[]. With only invalid tools, sync throws
  // "All tools failed" (don't silently skip — silent skip is a security
  // antipattern because it hides attempted injections).
  const dir = await makeBothProject();
  try {
    const result = await callSync(dir, { tools: 'foobar' });
    assert.equal(result.ok, false, 'sync must reject unwhitelisted tools, not silently skip');
    assert.match(result.error, /All tools failed/);
    assert.match(result.error, /foobar/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: rejects tools not in config.tools', async () => {
  const dir = await makeOpencodeProject();
  process.chdir(TOOLKIT);
  const { syncCommand } = await import(SYNC_CMD);
  try {
    // --tools=claude-code but config only has opencode → loadAdapter rejects
    // claude-code, caught, errors[]=[claude-code], installed=0 → throws.
    await assert.rejects(
      syncCommand({
        flags: { tools: 'claude-code' },
        config: VALID_CONFIG_OPENCODE_ONLY,
        configPath: 'fake',
        projectDir: dir,
        toolkitRoot: TOOLKIT,
      }),
      /All tools failed[\s\S]*claude-code/
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── Security: path-traversal / adapter injection ──────────────

test('sync: rejects path-traversal --tools=../../tmp/evil (no external code loaded)', async () => {
  // Defense-in-depth regression: a malicious --tools value that tries to
  // escape the toolkit must NEVER resolve a path or import any module
  // outside the toolkit. loadAdapter's whitelist check rejects the tool
  // before path construction.
  //
  // Old behavior (resolve + existsSync + dynamic import with a
  // pre-existing `!config.tools[tool]` guard): warn-skipped, returned
  // ok=true. New behavior (loadAdapter): rejected, error captured, sync
  // throws "All tools failed".
  const dir = await makeOpencodeProject();
  try {
    const r = await callSync(dir, { tools: '../../tmp/evil' });
    assert.equal(r.ok, false, 'sync must reject unwhitelisted tools, not silently skip');
    assert.match(r.error, /All tools failed/);
    assert.match(r.error, /evil/);
    assert.match(r.error, /not configured/i);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: rejects path-traversal even when mixed with valid --tools', async () => {
  // --tools=opencode,../../tmp/evil: opencode should sync successfully
  // (installed=1, no throw); evil should be captured in errors[] (logged
  // via console.error but not propagated because at least one tool succeeded).
  // Old behavior (warn-skip): console.error was NOT called for evil.
  // New behavior (loadAdapter): evil rejection is logged via console.error.
  const logsErr = [];
  const originalErr = console.error;
  console.error = (...args) => logsErr.push(args.join(' '));
  const dir = await makeOpencodeProject();
  try {
    const result = await callSync(dir, { tools: 'opencode,../../tmp/evil' });
    assert.equal(result.ok, true, 'sync completed (opencode succeeded)');
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode synced');
    const allErrLogs = logsErr.join('\n');
    assert.match(allErrLogs, /evil.*not configured/i, 'evil rejection must be logged');
  } finally {
    console.error = originalErr;
    await rm(dir, { recursive: true });
  }
});

// ─── Filesystem-based detection (no --tools) ─────────────────────

test('sync: with only opencode on fs, syncs opencode (NOT claude)', async () => {
  const dir = await makeOpencodeProject();
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
    assert.ok(!existsSync(join(dir, '.claude')), '.claude should not be created');
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')), 'CLAUDE.md should not be created');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: with only claude on fs, syncs claude (NOT opencode)', async () => {
  // Regression test for the bug where AGENTS.md was wrongly used as an opencode
  // marker. Claude-only installs always have AGENTS.md (CLAUDE.md imports it),
  // so the sync was misreading it as "opencode is installed too" and creating
  // a stray .opencode/ directory. After the fix, AGENTS.md is not a marker
  // and sync must NOT touch anything opencode.
  const dir = await makeClaudeProject();
  try {
    // Sanity: makeClaudeProject sets up CLAUDE.md, .claude/, AGENTS.md but
    // the state intentionally has nothing for opencode. The filesystem
    // markers for claude-only install are CLAUDE.md, .claude/agents, etc.
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')), 'claude agents should be synced');
    assert.ok(!existsSync(join(dir, '.opencode')), '.opencode/ must NOT be created in claude-only project');
    assert.ok(!existsSync(join(dir, 'opencode.json')), 'opencode.json must NOT be created in claude-only project');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: explicit bug — only AGENTS.md + CLAUDE.md (no .opencode/) → still NOT opencode', async () => {
  // The exact scenario that triggered the original bug:
  //   - claude-code-only install created AGENTS.md + CLAUDE.md + .claude/
  //   - sync wrongly used AGENTS.md as opencode marker
  //   - sync then created .opencode/ "noise" even though user only chose claude
  //
  // This test simulates the minimal filesystem state of a claude-only project
  // and asserts that sync must NOT create any opencode files, period.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-claudeonly-'));
  await mkdir(join(dir, '.claude/agents'), { recursive: true });
  await writeFile(join(dir, '.claude/agents/coder.md'), 'coder');
  await writeFile(join(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  await writeFile(join(dir, 'AGENTS.md'), '# Project Rules\n');
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: { 'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } } },
  }));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    // The agent was kept (claude adapter re-installed it).
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')));
    // The fix: no .opencode/ noise.
    assert.ok(!existsSync(join(dir, '.opencode')), 'NO .opencode/ in claude-only project');
    assert.ok(!existsSync(join(dir, 'opencode.json')), 'NO opencode.json in claude-only project');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: with both on fs, syncs both', async () => {
  const dir = await makeBothProject();
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── Stale-state pruning (the original bug) ──────────────────────

test('sync: stale claude-code in state (no fs markers) is pruned, .claude not created', async () => {
  // State-based detection (Behavior 2): state is the LIST of candidates; fs
  // markers verify reality. Stale entries (in state, no fs markers) get pruned
  // by Behavior 1 without writing any files. This is the unified behavior.
  const dir = await makeOpencodeProject();
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } },
      'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } }, // stale
    },
  }));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode synced (in state AND on fs)');
    assert.ok(!existsSync(join(dir, '.claude')), '.claude NOT created from stale state entry');
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(updated.tools?.opencode, 'opencode remains in state');
    assert.ok(!updated.tools?.['claude-code'], 'stale claude-code pruned from state');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: stale opencode in state (no fs markers) is pruned, .opencode not created', async () => {
  // Symmetric case: state has both, fs has only claude. opencode is stale.
  const dir = await makeClaudeProject();
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } }, // stale
      'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } },
    },
  }));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')), 'claude synced (in state AND on fs)');
    assert.ok(!existsSync(join(dir, '.opencode')), '.opencode NOT created from stale state entry');
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(updated.tools?.['claude-code'], 'claude-code remains in state');
    assert.ok(!updated.tools?.opencode, 'stale opencode pruned from state');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: prunes stale state entries after sync', async () => {
  const dir = await makeOpencodeProject();
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } },
      'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } }, // stale
    },
  }));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(!updated.tools?.['claude-code'], 'stale claude-code should be pruned from state');
    assert.ok(updated.tools?.opencode, 'opencode should remain in state');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: pruning preserves version and other top-level state fields', async () => {
  // Pruning must only touch state.tools — version, installed_at, last_sync_at,
  // and any future top-level fields must survive the rewrite.
  const dir = await makeOpencodeProject();
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.2.3',
    installed_at: '2026-02-01T00:00:00.000Z',
    last_sync_at: '2026-02-02T00:00:00.000Z',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } },
      'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } }, // stale
    },
  }));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.equal(updated.version, '1.2.3', 'version must survive pruning');
    assert.equal(updated.installed_at, '2026-02-01T00:00:00.000Z', 'installed_at must survive pruning');
    assert.ok(updated.last_sync_at, 'last_sync_at must be set after sync');
    assert.ok(!updated.tools?.['claude-code'], 'stale entry pruned');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: does NOT touch state when there is nothing to sync (early return)', async () => {
  // The early-return "Nothing to sync" path must not rewrite the state file.
  // Pruning only runs when we actually synced at least one tool (installed > 0).
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-noop-state-'));
  const originalState = {
    version: '1.0.0',
    tools: {
      'claude-code': { agents: { coder: { installed_at: '2026-01-01' } } }, // would be stale, but we should not touch it
    },
  };
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify(originalState));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.deepEqual(updated.tools, originalState.tools, 'state.tools must be untouched when nothing synced');
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── State-based detection (Behavior 2) ─────────────────────────

test('sync: state-based detection — state is primary when non-empty', async () => {
  // State has opencode; fs has opencode markers. Detection picks opencode
  // from state (not from fs). After sync, opencode is still in state and
  // pruned of nothing (it was synced).
  const dir = await makeOpencodeProject();
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(updated.tools?.opencode, 'opencode remains in state');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: hybrid detection — state entry with no fs markers is treated as stale', async () => {
  // State says opencode is installed, but fs has NO opencode markers
  // (user manually removed the files). Hybrid detection (state is LIST,
  // fs verifies reality) must skip the entry — sync writes nothing.
  //
  // This is the discriminating test: pure state-based would sync anyway;
  // pure fs-based would naturally see nothing; hybrid explicitly filters.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-stale-state-'));
  // Set up state with opencode (but NO fs markers).
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } },
    },
  }));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true, 'sync completes without throwing (no tools synced, no errors)');
    // No fs writes for opencode (hybrid detection filtered the stale entry).
    assert.ok(!existsSync(join(dir, '.opencode')), 'no .opencode/ created (stale state entry was filtered)');
    assert.ok(!existsSync(join(dir, 'opencode.json')), 'no opencode.json created');
    assert.ok(!existsSync(join(dir, 'AGENTS.md')), 'no AGENTS.md created');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: empty state + fs markers triggers fs fallback (recovery)', async () => {
  // State file has no tools but fs has markers. This is the recovery
  // scenario: state file was lost but the toolkit left files behind. Sync
  // should warn and use fs markers to detect, then sync normally.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-recover-'));
  // Build only fs markers, NO .ai-toolkit.json (readState returns default empty).
  await mkdir(join(dir, '.opencode/agents'), { recursive: true });
  await writeFile(join(dir, '.opencode/agents/coder.md'), 'coder');
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode synced via fs fallback');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: empty state + fs markers falls back to fs even for claude-only project', async () => {
  // Symmetric fallback: state empty, fs has only claude markers → sync claude.
  // The fs fallback must respect config.tools whitelist.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-recover-claude-'));
  await mkdir(join(dir, '.claude/agents'), { recursive: true });
  await writeFile(join(dir, '.claude/agents/coder.md'), 'coder');
  await writeFile(join(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')), 'claude synced via fs fallback');
    assert.ok(!existsSync(join(dir, '.opencode')), 'no opencode from fallback (claude-only fs)');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: state tools filtered by config.tools whitelist', async () => {
  // State lists a tool that's not in config.tools → it must be filtered out
  // of the synced set. After sync, the unknown tool's state entry MUST be
  // preserved (the prune loop is gated on config.tools: it only deletes
  // entries for KNOWN tools that weren't synced; unknown entries are left
  // alone). And no `.unknown-tool/` directory is created.
  //
  // This test exercises the early-return "Nothing to sync" path (no fs
  // markers). For the actual-scenario variant where opencode is synced AND
  // unknown-tool survives the prune, see "prune preserves unknown tools".
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-whitelist-'));
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } },
      'unknown-tool': { agents: { coder: { installed_at: '2026-01-01' } } },
    },
  }));
  // No fs markers for any tool (so even fs fallback wouldn't pick anything).
  try {
    process.chdir(TOOLKIT);
    const { syncCommand } = await import(SYNC_CMD);
    // Only opencode is in config.tools.
    await syncCommand({
      flags: {},
      config: VALID_CONFIG_OPENCODE_ONLY,
      configPath: '/x.json',
      projectDir: dir,
      toolkitRoot: TOOLKIT,
    });
    // Sync was a no-op. Now verify the side effects on state and fs:
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    // The early-return "Nothing to sync" path leaves state untouched.
    assert.ok(updated.tools?.opencode, 'opencode remains in state');
    assert.ok(updated.tools?.['unknown-tool'], 'unknown-tool remains in state (sync does not touch entries for tools it does not know about)');
    // And no fs writes for the unknown tool.
    assert.ok(!existsSync(join(dir, '.unknown-tool')), 'no .unknown-tool/ directory created');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: prune preserves unknown tools in state (config-only filter)', async () => {
  // Discriminating test for the prune loop. State has opencode (configured)
  // and 'unknown-tool' (NOT configured). Sync actually runs opencode (via
  // fs markers + state detection). After sync:
  //   - opencode stays in state (was synced)
  //   - unknown-tool stays in state (sync doesn't know about it)
  //
  // Old behavior (prune deletes any key not in syncedKeys): unknown-tool
  // gets silently deleted from state. This test FAILS RED with old code.
  // New behavior (prune filters by configuredKeys): unknown-tool preserved.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-prune-unknown-'));
  // Set up fs markers for opencode so state-based detection actually runs it.
  await mkdir(join(dir, '.opencode/agents'), { recursive: true });
  await writeFile(join(dir, '.opencode/agents/coder.md'), 'coder');
  // State has BOTH opencode (configured) and unknown-tool (not configured).
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({
    version: '1.0.0',
    tools: {
      opencode: { agents: { coder: { installed_at: '2026-01-01' } } },
      'unknown-tool': { agents: { coder: { installed_at: '2026-01-01' } } },
    },
  }));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
    // opencode synced successfully.
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), 'opencode synced');
    // State after sync: BOTH keys preserved (unknown-tool was not configured).
    const updated = JSON.parse(
      await readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(updated.tools?.opencode, 'opencode remains in state');
    assert.ok(
      updated.tools?.['unknown-tool'],
      'unknown-tool must be preserved in state (prune only affects configured keys)'
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: warns and uses fs fallback when state file is empty but fs has markers', async () => {
  // Recovery scenario: state file is missing/empty but fs has markers (e.g.,
  // user manually removed .ai-toolkit.json). sync must warn and proceed via
  // fs-based detection, not silently do nothing.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-recover-warn-'));
  await mkdir(join(dir, '.opencode/agents'), { recursive: true });
  await writeFile(join(dir, '.opencode/agents/coder.md'), 'coder');
  // No .ai-toolkit.json — readState returns default empty state.

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  let result;
  try {
    result = await callSync(dir, {});
  } finally {
    console.log = originalLog;
    await rm(dir, { recursive: true });
  }
  assert.equal(result.ok, true);
  const allLogs = logs.join('\n');
  assert.match(
    allLogs,
    /state file is empty|auto-detecting from filesystem/i,
    'should print recovery warning when falling back to fs markers'
  );
  assert.match(
    allLogs,
    /init/,
    'warning should hint at running init to register properly'
  );
});

// ─── Empty/no-project cases ──────────────────────────────────────

test('sync: empty project, no fs markers → no-op (prints tip, no error)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-empty-'));
  await writeFile(join(dir, '.ai-toolkit.json'), JSON.stringify({ version: '1.0.0' }));
  try {
    const result = await callSync(dir, {});
    assert.equal(result.ok, true);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: throws if no config found', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-'));
  process.chdir(TOOLKIT);
  const { syncCommand } = await import(SYNC_CMD);
  try {
    let caught = null;
    try {
      await syncCommand({
        flags: {},
        config: null,
        configPath: 'fake',
        projectDir: dir,
        toolkitRoot: TOOLKIT,
      });
    } catch (e) {
      caught = e.message;
    }
    assert.ok(caught);
    assert.match(caught, /Config not found/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: idempotent (multiple syncs do not duplicate)', async () => {
  // Setup filesystem markers first; filesystem detection finds opencode.
  const dir = await makeOpencodeProject();
  try {
    const r1 = await callSync(dir, {});
    const r2 = await callSync(dir, {});
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── --types support (G1) ─────────────────────────────────────

test('sync: --types=agents installs only agents (no skills/rules)', async () => {
  // Setup opencode filesystem markers first so filesystem detection finds it
  // (auto-detect is the new default when --tools is not explicit).
  const dir = await makeOpencodeProject();
  try {
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
    assert.ok(existsSync(join(dir, '.opencode/skills')));
    assert.ok(existsSync(join(dir, 'AGENTS.md')));
    // Now sync with --types=agents
    const r = await callSync(dir, { types: 'agents' });
    assert.equal(r.ok, true);
    // Files still exist (sync is idempotent — doesn't remove others)
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
    // Skills + rules files are still there (we don't delete on selective sync)
    assert.ok(existsSync(join(dir, '.opencode/skills')));
    assert.ok(existsSync(join(dir, 'AGENTS.md')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --types with whitespace trims correctly', async () => {
  // Use makeOpencodeProject (not mkdtemp) so fs markers + state are present
  // and the types filter is actually exercised. A bare mkdtemp causes sync
  // to early-return "Nothing to sync" and --types never reaches the adapter.
  const dir = await makeOpencodeProject();
  try {
    const r = await callSync(dir, { types: ' skills , agents ' });
    assert.equal(r.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), 'agents synced (trimmed types passed to adapter)');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --types=invalid throws', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-types-bad-'));
  try {
    const r = await callSync(dir, { types: 123 });
    assert.equal(r.ok, false);
    assert.match(r.error, /--types must be a comma-separated string/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --types= throws "cannot be empty"', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-types-empty-'));
  try {
    const r = await callSync(dir, { types: ',,' });
    assert.equal(r.ok, false);
    assert.match(r.error, /--types cannot be empty/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --tools="opencode, claude-code" with whitespace installs both', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-tools-ws-'));
  try {
    const r = await callSync(dir, { tools: 'opencode, claude-code' });
    assert.equal(r.ok, true);
    assert.ok(existsSync(join(dir, '.opencode')));
    assert.ok(existsSync(join(dir, '.claude')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── Regression: config.tools validation (F1) ──────────────────

test('sync: throws if config.tools is missing (regression F1)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-notools-'));
  try {
    process.chdir(TOOLKIT);
    const { syncCommand } = await import(SYNC_CMD);
    const badConfig = { ...VALID_CONFIG_FULL };
    delete badConfig.tools;
    await assert.rejects(
      syncCommand({
        flags: {},
        config: badConfig,
        configPath: '/x.json',
        projectDir: dir,
        toolkitRoot: TOOLKIT,
      }),
      /config\.tools must be an object/
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: throws if config.tools is an array', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-arrtools-'));
  try {
    process.chdir(TOOLKIT);
    const { syncCommand } = await import(SYNC_CMD);
    const badConfig = { ...VALID_CONFIG_FULL, tools: ['opencode'] };
    await assert.rejects(
      syncCommand({
        flags: {},
        config: badConfig,
        configPath: '/x.json',
        projectDir: dir,
        toolkitRoot: TOOLKIT,
      }),
      /config\.tools must be an object/
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── H1: config.tools[tool] = [] (array as value) ─────────────

test('sync: skips with warning when config.tools[tool] is an array (H1)', async () => {
  // Array value slips through typeof check (typeof [] === 'object').
  // Best-effort defaults: warn-skip, not throw.
  // Sync's contract is broader than init's — unknown tools warn-skip
  // rather than throw, because sync is idempotent and best-effort.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-toolarrval-'));
  try {
    process.chdir(TOOLKIT);
    const { syncCommand } = await import(SYNC_CMD);
    const config = {
      ...VALID_CONFIG_FULL,
      tools: { opencode: [] },  // value is array
      default_tools: ['opencode'],
    };
    // Should not throw — sync best-effort
    await syncCommand({
      flags: {},
      config,
      configPath: '/x.json',
      projectDir: dir,
      toolkitRoot: TOOLKIT,
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── Regression: --tools whitespace + dedupe (F3) ─────────────

test('sync: --tools="opencode, claude-code" trims whitespace', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-toolsws-'));
  try {
    const r = await callSync(dir, { tools: 'opencode, claude-code' });
    assert.equal(r.ok, true);
    assert.ok(existsSync(join(dir, '.opencode')));
    assert.ok(existsSync(join(dir, '.claude')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --tools="opencode,opencode" dedupes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-toolsdup-'));
  try {
    const r = await callSync(dir, { tools: 'opencode,opencode' });
    assert.equal(r.ok, true);
    assert.ok(existsSync(join(dir, '.opencode')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --tools=, (explicit empty) gives "empty value" error (regression F3)', async () => {
  // User passed --tools explicitly but with empty value. Error must mention
  // --tools empty value (not "state file" — that's a no-flags error path).
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-toolsblank-'));
  try {
    const r = await callSync(dir, { tools: ',,' });
    assert.equal(r.ok, false);
    assert.match(r.error, /empty value/i, 'error should mention --tools empty value');
    assert.doesNotMatch(r.error, /state file/i, 'error should not mention state file (user explicitly passed --tools)');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --tools error lists config.tools (derived, not hardcoded)', async () => {
  // Minor #8: the example tool list in the error message is derived from
  // config.tools, not hardcoded to "opencode,claude-code". Use a custom
  // config to verify the derived list flows through.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-toolsderived-'));
  process.chdir(TOOLKIT);
  const { syncCommand } = await import(SYNC_CMD);
  try {
    const customConfig = {
      source: './source',
      tools: {
        'my-tool-a': { enabled: true },
        'my-tool-b': { enabled: true },
      },
      default_tools: ['my-tool-a', 'my-tool-b'],
    };
    let caught = null;
    try {
      await syncCommand({
        flags: { tools: ',,' },
        config: customConfig,
        configPath: '/x.json',
        projectDir: dir,
        toolkitRoot: TOOLKIT,
      });
    } catch (e) {
      caught = e.message;
    }
    assert.ok(caught, 'expected throw for empty --tools');
    assert.match(caught, /my-tool-a/, 'derived list includes custom tool a');
    assert.match(caught, /my-tool-b/, 'derived list includes custom tool b');
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── --types filter (F4) ──────────────────────────────────────

test('sync: --types=agents passes types to adapter (integration)', async () => {
  // Setup filesystem markers so auto-detect picks up opencode.
  const dir = await makeOpencodeProject();
  try {
    const r = await callSync(dir, { types: 'agents' });
    assert.equal(r.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --types with whitespace trims correctly', async () => {
  // Use makeOpencodeProject (not mkdtemp) so fs markers + state are present
  // and the types filter is actually exercised. A bare mkdtemp causes sync
  // to early-return "Nothing to sync" and --types never reaches the adapter.
  const dir = await makeOpencodeProject();
  try {
    const r = await callSync(dir, { types: ' skills , agents ' });
    assert.equal(r.ok, true);
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')), 'agents synced (trimmed types passed to adapter)');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --types= throws "cannot be empty"', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-typesempty-'));
  try {
    const r = await callSync(dir, { types: ',,' });
    assert.equal(r.ok, false);
    assert.match(r.error, /--types cannot be empty/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --types=invalid throws "must be comma-separated"', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-typesbad-'));
  try {
    const r = await callSync(dir, { types: 123 });
    assert.equal(r.ok, false);
    assert.match(r.error, /--types must be a comma-separated string/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── Regression: per-tool error accumulation (F5) ─────────────

test('sync: throws "All tools failed" when all adapters throw', async () => {
  // Set up a temp toolkit with an adapter that always throws.
  // Use --tools=broken explicitly to bypass filesystem detection (broken
  // isn't in TOOL_FS_MARKERS, so auto-detect would skip it).
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-f5-'));
  const fakeRoot = join(dir, 'fake-toolkit');
  try {
    await mkdir(join(fakeRoot, 'adapters/broken'), { recursive: true });
    await writeFile(join(fakeRoot, 'adapters/broken/adapter.mjs'), `export async function sync() { throw new Error('boom'); }`);
    process.chdir(TOOLKIT);
    const { syncCommand } = await import(SYNC_CMD);
    const config = {
      source: './source',
      tools: { broken: {} },
      default_tools: ['broken'],
    };
    await assert.rejects(
      syncCommand({
        flags: { tools: 'broken' },
        config,
        configPath: '/x.json',
        projectDir: dir,
        toolkitRoot: fakeRoot,
      }),
      /All tools failed/
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: partial failure (1 ok, 1 fail) does NOT throw', async () => {
  // Set up: working adapter + failing adapter in a fake toolkit.
  // fakeRoot nested under projectDir to avoid Node test runner issues
  // with separate top-level tempdirs (see init-command tests).
  //
  // Use --tools=working,broken explicitly: working/broken are NOT in
  // TOOL_FS_MARKERS, so auto-detect (no --tools) would skip them both and
  // sync would early-return "Nothing to sync" — the partial-failure path
  // would never run. With explicit --tools, both adapters actually execute.
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-partial-'));
  const fakeRoot = join(dir, 'fake-toolkit');
  const logsErr = [];
  const originalErr = console.error;
  console.error = (...args) => logsErr.push(args.join(' '));
  try {
    await mkdir(join(fakeRoot, 'adapters/working'), { recursive: true });
    await writeFile(join(fakeRoot, 'adapters/working/adapter.mjs'), `export async function sync() {}`);
    await mkdir(join(fakeRoot, 'adapters/broken'), { recursive: true });
    await writeFile(join(fakeRoot, 'adapters/broken/adapter.mjs'), `export async function sync() { throw new Error('boom'); }`);
    process.chdir(TOOLKIT);
    const { syncCommand } = await import(SYNC_CMD);
    const config = {
      source: './source',
      tools: { working: {}, broken: {} },
      default_tools: ['working', 'broken'],
    };
    // Should not throw — at least one succeeded.
    await syncCommand({
      flags: { tools: 'working,broken' },
      config,
      configPath: '/x.json',
      projectDir: dir,
      toolkitRoot: fakeRoot,
    });
    // Verify both adapters actually ran (the partial-failure path was exercised).
    const allErrLogs = logsErr.join('\n');
    assert.match(allErrLogs, /broken.*boom/, 'broken adapter error must be logged via console.error');
  } finally {
    console.error = originalErr;
    await rm(dir, { recursive: true });
  }
});
