import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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

test('sync: --tools=invalid-tool is skipped gracefully', async () => {
  const dir = await makeBothProject();
  try {
    const result = await callSync(dir, { tools: 'foobar' });
    assert.equal(result.ok, true);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: skips tools not in config.tools', async () => {
  const dir = await makeOpencodeProject();
  process.chdir(TOOLKIT);
  const { syncCommand } = await import(SYNC_CMD);
  try {
    await syncCommand({
      flags: { tools: 'claude-code' },
      config: VALID_CONFIG_OPENCODE_ONLY,
      configPath: 'fake',
      projectDir: dir,
      toolkitRoot: TOOLKIT,
    });
    // claude-code should be silently skipped
  } finally {
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

test('sync: stale claude-code in state (no fs markers) does NOT trigger install', async () => {
  // Project only has opencode on fs; state has stale claude-code entry.
  // Sync should ignore the stale entry (don't recreate .claude/).
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
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
    assert.ok(!existsSync(join(dir, '.claude')), '.claude should NOT be created from stale state');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: stale opencode in state (no fs markers) does NOT trigger install', async () => {
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
    assert.ok(existsSync(join(dir, '.claude/agents/coder.md')));
    assert.ok(!existsSync(join(dir, '.opencode')), '.opencode should NOT be created from stale state');
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
      await (await import('node:fs/promises')).readFile(join(dir, '.ai-toolkit.json'), 'utf8')
    );
    assert.ok(!updated.tools?.['claude-code'], 'stale claude-code should be pruned from state');
    assert.ok(updated.tools?.opencode, 'opencode should remain in state');
  } finally {
    await rm(dir, { recursive: true });
  }
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
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-idem-'));
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
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-types-agents-'));
  try {
    // First install everything
    await callSync(dir, {});
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
    assert.ok(existsSync(join(dir, '.opencode/skills')));
    assert.ok(existsSync(join(dir, 'AGENTS.md')));
    // Now sync with --types=agents
    await callSync(dir, { types: 'agents' });
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
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-types-ws-'));
  try {
    const r = await callSync(dir, { types: ' skills , agents ' });
    assert.equal(r.ok, true);
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

test('sync: --tools= throws "No tools specified" (regression F3)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-toolsblank-'));
  try {
    const r = await callSync(dir, { tools: '' });
    assert.equal(r.ok, false);
    assert.match(r.error, /No tools specified/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ─── --types filter (F4) ──────────────────────────────────────

test('sync: --types=agents passes types to adapter (integration)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-types-agents-'));
  try {
    const r = await callSync(dir, { types: 'agents' });
    assert.equal(r.ok, true);
    // After sync with --types=agents, agents files exist.
    assert.ok(existsSync(join(dir, '.opencode/agents/coder.md')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('sync: --types with whitespace trims correctly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-typesws-'));
  try {
    const r = await callSync(dir, { types: ' skills , agents ' });
    assert.equal(r.ok, true);
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
        flags: {},
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
  const dir = await mkdtemp(join(tmpdir(), 'aitk-sync-partial-'));
  const fakeRoot = join(dir, 'fake-toolkit');
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
      flags: {},
      config,
      configPath: '/x.json',
      projectDir: dir,
      toolkitRoot: fakeRoot,
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});
