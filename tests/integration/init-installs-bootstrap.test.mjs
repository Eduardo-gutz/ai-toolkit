// Integration tests: initCommand invoca installBootstrap en cada adapter
// que lo exponga. Backward-compatible: si un adapter no expone
// installBootstrap, init debe seguir funcionando (no rompe).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOOLKIT_ROOT = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
const INIT_CMD = join(import.meta.dirname, '../../bin/commands/init.mjs');

function makeConfig(tools, defaultTools) {
  return {
    source: './source',
    tools: Object.fromEntries(tools.map((t) => [t, { enabled: true }])),
    default_tools: defaultTools,
  };
}

async function callInit(projectDir, config, flags = {}, toolkitRoot = TOOLKIT_ROOT) {
  const { initCommand } = await import(INIT_CMD);
  return initCommand({
    flags,
    config,
    configPath: 'fake',
    projectDir,
    toolkitRoot,
  });
}

test('init: --tools=claude-code creates .claude/skills/bootstrap/', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-init-bs-cc-'));
  try {
    const config = makeConfig(['claude-code'], []);
    await callInit(projectDir, config, { tools: 'claude-code' });

    assert.ok(
      existsSync(join(projectDir, '.claude/skills/bootstrap/SKILL.md')),
      '.claude/skills/bootstrap/SKILL.md should exist after init'
    );
    assert.ok(
      existsSync(join(projectDir, '.claude/skills/bootstrap/01-pre-flight.md')),
      'first supporting file should be copied'
    );
    assert.ok(
      existsSync(join(projectDir, '.claude/skills/bootstrap/08-agents-md.md')),
      'last supporting file should be copied'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('init: --tools=opencode creates .opencode/commands/bootstrap.md + bootstrap/', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-init-bs-oc-'));
  try {
    const config = makeConfig(['opencode'], []);
    await callInit(projectDir, config, { tools: 'opencode' });

    assert.ok(
      existsSync(join(projectDir, '.opencode/commands/bootstrap.md')),
      '.opencode/commands/bootstrap.md should exist after init'
    );
    assert.ok(
      existsSync(join(projectDir, '.opencode/commands/bootstrap/01-pre-flight.md')),
      'first supporting file should be copied under .opencode/commands/bootstrap/'
    );
    assert.ok(
      existsSync(join(projectDir, '.opencode/commands/bootstrap/08-agents-md.md')),
      'last supporting file should be copied'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('init: --tools=claude-code,opencode creates bootstrap for BOTH adapters', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-init-bs-both-'));
  try {
    const config = makeConfig(['claude-code', 'opencode'], []);
    await callInit(projectDir, config, { tools: 'claude-code,opencode' });

    // claude-code side
    assert.ok(
      existsSync(join(projectDir, '.claude/skills/bootstrap/SKILL.md')),
      '.claude/skills/bootstrap/SKILL.md should exist'
    );
    // opencode side
    assert.ok(
      existsSync(join(projectDir, '.opencode/commands/bootstrap.md')),
      '.opencode/commands/bootstrap.md should exist'
    );
    assert.ok(
      existsSync(join(projectDir, '.opencode/commands/bootstrap/')),
      '.opencode/commands/bootstrap/ dir should exist'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('init: adapters without installBootstrap are skipped gracefully (backward-compat)', async () => {
  // Custom adapter (declared in config.tools) without installBootstrap.
  // init should still complete without throwing — installBootstrap is
  // optional. We assert that nothing crashed and the adapter ran.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-init-bs-bwc-'));
  const fakeRoot = join(projectDir, 'fake-toolkit');
  try {
    mkdirSync(join(fakeRoot, 'adapters/legacy'), { recursive: true });
    writeFileSync(
      join(fakeRoot, 'adapters/legacy/adapter.mjs'),
      `export async function install() {}`
    );
    const config = makeConfig(['legacy'], []);
    await callInit(projectDir, config, { tools: 'legacy' }, fakeRoot);
    // No throw → backward-compat works.
    assert.ok(true, 'init completed for adapter without installBootstrap');
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// ─── sync + remove handle bootstrap ───────────────────────────────────────
//
// Regression tests for two bugs:
//   1. adapter.sync() did not invoke installBootstrap(), so changes to
//      source/prompts/bootstrap/ never propagated to the target unless the
//      user also ran init.
//   2. adapter.remove() did not invoke uninstallBootstrap(), so the
//      `.claude/skills/bootstrap/` (or `.opencode/commands/bootstrap*`) dir
//      was orphaned after the tool was removed.
//
// Fix: both lifecycle methods now call the bootstrap helpers (with
// typeof === 'function' guards for backward-compat with adapters that don't
// expose them).
//
// Note: installBootstrap is idempotent (skips if dir exists), so the literal
// "init → modify source → sync → verify target reflects changes" sequence
// doesn't fully exercise the propagation path (sync's installBootstrap call
// would no-op on the existing dir). The realistic use case the fix enables
// is documented in installBootstrap: "To force a reinstall, delete the
// directory manually or run `sync` afterwards." — i.e. the user wipes the
// target dir to force a refresh. These tests exercise that path.

const CLAUDE_ADAPTER_PATH = join(TOOLKIT_ROOT, 'adapters/claude-code/adapter.mjs');
const OPENCODE_ADAPTER_PATH = join(TOOLKIT_ROOT, 'adapters/opencode/adapter.mjs');

test('sync: re-installs bootstrap skill when target dir was removed (claude-code)', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-sync-bs-'));
  try {
    const config = makeConfig(['claude-code'], []);
    await callInit(projectDir, config, { tools: 'claude-code' });

    const bootstrapDir = join(projectDir, '.claude/skills/bootstrap');
    assert.ok(existsSync(join(bootstrapDir, 'SKILL.md')), 'pre: bootstrap created by init');

    // Simulate user wiping the target dir to force a fresh install on sync.
    rmSync(bootstrapDir, { recursive: true, force: true });
    assert.equal(existsSync(bootstrapDir), false, 'pre: bootstrap dir removed');

    // adapter.sync() must now invoke installBootstrap() (the bug fix).
    const adapter = await import(CLAUDE_ADAPTER_PATH);
    await adapter.sync({
      source: join(TOOLKIT_ROOT, 'source'),
      target: projectDir,
      config,
      types: ['agents', 'skills', 'mcps', 'rules'],
    });

    // Bootstrap must be back — proves sync now installs it when missing.
    assert.ok(
      existsSync(join(bootstrapDir, 'SKILL.md')),
      'sync re-created bootstrap/SKILL.md (sync invokes installBootstrap)'
    );
    assert.ok(
      existsSync(join(bootstrapDir, '01-pre-flight.md')),
      'sync re-created supporting files (sync invokes installBootstrap fully)'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// ─── sync forces re-install (force=true) to propagate source changes ─────
//
// After the force=true fix, sync wipes + recreates the bootstrap dir on
// every run. This is intentional: the other 4 content types already
// overwrote on sync (writeFile with default overwrite=true), so the
// bootstrap was the only content type where sync silently no-op'd against
// existing data. The trade-off: user customizations to the bootstrap dir
// are NOT preserved across sync — but neither are customizations to agents
// or skills. Sync = "make target exactly match source", full stop.
//
// init preserves customizations (default force=false → skip if exists).

test('sync: re-installs bootstrap on every run, wiping user customization (claude-code)', async () => {
  // Regression test for the propagation bug: previously sync relied on
  // installBootstrap's idempotent skip, so source modifications (and any
  // pre-existing user customization of the target) never propagated. Now
  // sync calls installBootstrap with force=true → wipe + recreate.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-sync-bs-force-cc-'));
  try {
    const config = makeConfig(['claude-code'], []);
    await callInit(projectDir, config, { tools: 'claude-code' });

    const skillPath = join(projectDir, '.claude/skills/bootstrap/SKILL.md');
    assert.ok(existsSync(skillPath), 'pre: SKILL.md exists after init');

    // User customizes SKILL.md manually (e.g., adds a comment block).
    const CUSTOM_MARKER = '\n\n# USER CUSTOMIZATION\n';
    const originalContent = readFileSync(skillPath, 'utf8');
    writeFileSync(skillPath, originalContent + CUSTOM_MARKER);
    assert.ok(
      readFileSync(skillPath, 'utf8').includes(CUSTOM_MARKER),
      'pre: user customization written'
    );

    // adapter.sync() must wipe + recreate, dropping the customization.
    const adapter = await import(CLAUDE_ADAPTER_PATH);
    await adapter.sync({
      source: join(TOOLKIT_ROOT, 'source'),
      target: projectDir,
      config,
      types: ['agents', 'skills', 'mcps', 'rules'],
    });

    const finalContent = readFileSync(skillPath, 'utf8');
    assert.ok(
      !finalContent.includes(CUSTOM_MARKER),
      'sync (force=true) wipes user customization in bootstrap'
    );
    // SKILL.md must still be valid (non-empty) after the wipe + recreate.
    assert.ok(finalContent.length > 100, 'sync re-creates bootstrap content from source');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('sync: re-installs bootstrap command on every run, wiping user customization (opencode)', async () => {
  // Parity with the claude-code regression: opencode's sync must also
  // force a wipe + recreate of the bootstrap command so source modifications
  // propagate and user customizations don't survive sync.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-sync-bs-force-oc-'));
  try {
    const config = makeConfig(['opencode'], []);
    await callInit(projectDir, config, { tools: 'opencode' });

    const commandFile = join(projectDir, '.opencode/commands/bootstrap.md');
    assert.ok(existsSync(commandFile), 'pre: bootstrap.md exists after init');

    const CUSTOM_MARKER = '\n\n# USER CUSTOMIZATION\n';
    const originalContent = readFileSync(commandFile, 'utf8');
    writeFileSync(commandFile, originalContent + CUSTOM_MARKER);
    assert.ok(
      readFileSync(commandFile, 'utf8').includes(CUSTOM_MARKER),
      'pre: user customization written'
    );

    const adapter = await import(OPENCODE_ADAPTER_PATH);
    await adapter.sync({
      source: join(TOOLKIT_ROOT, 'source'),
      target: projectDir,
      config,
      types: ['agents', 'skills', 'mcps', 'rules'],
    });

    const finalContent = readFileSync(commandFile, 'utf8');
    assert.ok(
      !finalContent.includes(CUSTOM_MARKER),
      'sync (force=true) wipes user customization in bootstrap.md'
    );
    assert.ok(
      finalContent.length > 100,
      'sync re-creates bootstrap command content from source'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('init: second run is still idempotent (does NOT wipe existing bootstrap) (claude-code)', async () => {
  // Regression guard: the force=true fix must NOT leak into init. Init
  // calls installBootstrap WITHOUT options (default force=false) so
  // re-running init on a project with existing bootstrap is still a no-op.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-init-idempotent-cc-'));
  try {
    const config = makeConfig(['claude-code'], []);
    await callInit(projectDir, config, { tools: 'claude-code' });

    const skillPath = join(projectDir, '.claude/skills/bootstrap/SKILL.md');
    const CUSTOM_MARKER = '\n\n# USER CUSTOMIZATION\n';
    const originalContent = readFileSync(skillPath, 'utf8');
    writeFileSync(skillPath, originalContent + CUSTOM_MARKER);

    // Second init must preserve the customization (default force=false).
    await callInit(projectDir, config, { tools: 'claude-code' });

    assert.ok(
      readFileSync(skillPath, 'utf8').includes(CUSTOM_MARKER),
      'init (default force=false) preserves user customization on idempotent re-run'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('init: second run is still idempotent (does NOT wipe existing bootstrap) (opencode)', async () => {
  // Regression guard for opencode: same contract as claude-code — init must
  // remain idempotent (default force=false), so user customization of the
  // bootstrap command survives a second `ai-toolkit init`.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-init-idempotent-oc-'));
  try {
    const config = makeConfig(['opencode'], []);
    await callInit(projectDir, config, { tools: 'opencode' });

    const commandFile = join(projectDir, '.opencode/commands/bootstrap.md');
    const CUSTOM_MARKER = '\n\n# USER CUSTOMIZATION\n';
    const originalContent = readFileSync(commandFile, 'utf8');
    writeFileSync(commandFile, originalContent + CUSTOM_MARKER);

    await callInit(projectDir, config, { tools: 'opencode' });

    assert.ok(
      readFileSync(commandFile, 'utf8').includes(CUSTOM_MARKER),
      'init (default force=false) preserves user customization on idempotent re-run (opencode)'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('remove: cleans up bootstrap skill (claude-code)', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-remove-bs-'));
  try {
    const config = makeConfig(['claude-code'], []);
    await callInit(projectDir, config, { tools: 'claude-code' });

    const bootstrapDir = join(projectDir, '.claude/skills/bootstrap');
    assert.ok(existsSync(join(bootstrapDir, 'SKILL.md')), 'pre: bootstrap created by init');

    // adapter.remove() must now invoke uninstallBootstrap() (the bug fix).
    const adapter = await import(CLAUDE_ADAPTER_PATH);
    await adapter.remove({
      target: projectDir,
      source: join(TOOLKIT_ROOT, 'source'),
      config,
    });

    // Bootstrap must be gone — proves remove now uninstalls it.
    assert.equal(
      existsSync(bootstrapDir),
      false,
      'remove deleted .claude/skills/bootstrap/ (remove invokes uninstallBootstrap)'
    );
    // Defense in depth: no orphan supporting files left behind.
    assert.equal(
      existsSync(join(bootstrapDir, '01-pre-flight.md')),
      false,
      'remove cleaned up supporting files (no orphan)'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('remove: cleans up orphan .opencode/commands/ dir (opencode)', async () => {
  // Regression test for QA iter 1 (M1 follow-up).
  //
  // M1 swapped the order of uninstallBootstrap and postRemoveCleanup, which
  // fixed claude-code (bootstrap lives under .claude/skills/ — once that
  // subdir is gone, removeIfEmpty('.claude/skills') can clean the parent).
  // But opencode's bootstrap has TWO artifacts at the same level:
  //   .opencode/commands/bootstrap.md  (file)
  //   .opencode/commands/bootstrap/   (subdir with 9 supporting files)
  // After uninstallBootstrap removes both, .opencode/commands/ is empty but
  // still EXISTS — so removeIfEmpty('.opencode') sees a non-empty parent
  // (it has `commands/` as a subdir) and skips. Net result: orphan
  // .opencode/commands/ + .opencode/ dirs after `remove --purge`.
  //
  // The fix calls removeIfEmpty('.opencode/commands') between
  // uninstallBootstrap and postRemoveCleanup, so the parent dir is removed
  // before removeIfEmpty('.opencode') runs.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-remove-bs-oc-orphan-'));
  try {
    const config = makeConfig(['opencode'], []);
    await callInit(projectDir, config, { tools: 'opencode' });

    // Pre: bootstrap artifacts exist under .opencode/commands/.
    assert.ok(
      existsSync(join(projectDir, '.opencode/commands/bootstrap.md')),
      'pre: bootstrap.md created by init'
    );
    assert.ok(
      existsSync(join(projectDir, '.opencode/commands/bootstrap/')),
      'pre: bootstrap/ subdir created by init'
    );

    // adapter.remove() must clean up the parent .opencode/commands/ dir too.
    const adapter = await import(OPENCODE_ADAPTER_PATH);
    await adapter.remove({
      target: projectDir,
      source: join(TOOLKIT_ROOT, 'source'),
      config,
    });

    // Sanity: both artifacts must be gone (precondition for the orphan dir).
    assert.equal(
      existsSync(join(projectDir, '.opencode/commands/bootstrap.md')),
      false,
      'remove deleted .opencode/commands/bootstrap.md'
    );
    assert.equal(
      existsSync(join(projectDir, '.opencode/commands/bootstrap/')),
      false,
      'remove deleted .opencode/commands/bootstrap/ subdir'
    );

    // Primary assertion: parent .opencode/commands/ must be gone too.
    // Before fix: this dir exists but is empty (orphan).
    assert.equal(
      existsSync(join(projectDir, '.opencode/commands')),
      false,
      'remove cleaned up empty parent .opencode/commands/ (no orphan dir)'
    );

    // Defense in depth: top-level .opencode/ should also be gone.
    assert.equal(
      existsSync(join(projectDir, '.opencode')),
      false,
      'remove cleaned up empty .opencode/ (no orphan dir)'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// ─── Major #1 regression: lifecycle.sync must be iterated ─────────────────
//
// The lifecycle registry promises three symmetric arrays (install/sync/remove)
// and each public method (install/sync/remove) is responsible for iterating
// the corresponding array. install() and remove() iterate theirs; sync() did
// NOT iterate lifecycle.sync — so any hook pushed only to sync (and reserved
// for "fires only on sync, not on fresh install") was declared but never
// invoked. This test pins the contract: a hook pushed ONLY to lifecycle.sync
// must be invoked by sync() but NOT by install().
//
// Discriminator: install() reaches lifecycle.install (so its own loop
// implicitly re-runs bootstrap etc. on sync); sync() must ALSO reach
// lifecycle.sync independently. Without the fix, the probe attached here
// never fires (sync body's only call site for extras is the implicit
// install() above, which uses lifecycle.install — and we deliberately push
// the probe only to sync, not to install).

test('sync: iterates lifecycle.sync — hook pushed only to sync[] fires on sync() (claude-code)', async () => {
  // Push a probe ONLY to lifecycle.sync — NOT to lifecycle.install.
  // After adapter.sync() returns, the probe must have been called at least
  // once. Today: sync() never iterates lifecycle.sync, so the probe stays
  // at 0 calls → assertion fails. After the fix: sync() iterates
  // lifecycle.sync (between recordSync and writeState), the probe fires,
  // assertion passes.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-sync-lcs-cc-'));
  try {
    const adapter = await import(CLAUDE_ADAPTER_PATH);
    let syncProbeCalls = 0;
    const probe = async () => { syncProbeCalls++; };
    adapter.lifecycle.sync.push(probe);
    try {
      const config = makeConfig(['claude-code'], []);
      await adapter.sync({
        source: join(TOOLKIT_ROOT, 'source'),
        target: projectDir,
        config,
        types: ['agents', 'skills', 'mcps', 'rules'],
      });
      assert.ok(
        syncProbeCalls >= 1,
        'adapter.sync() must invoke hooks registered in lifecycle.sync (Major #1 fix: sync now iterates sync[])'
      );
    } finally {
      const idx = adapter.lifecycle.sync.lastIndexOf(probe);
      if (idx !== -1) adapter.lifecycle.sync.splice(idx, 1);
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('sync: iterates lifecycle.sync — hook pushed only to sync[] fires on sync() (opencode)', async () => {
  // Symmetric counterpart for the opencode adapter — same Major #1 contract.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-sync-lcs-oc-'));
  try {
    const adapter = await import(OPENCODE_ADAPTER_PATH);
    let syncProbeCalls = 0;
    const probe = async () => { syncProbeCalls++; };
    adapter.lifecycle.sync.push(probe);
    try {
      const config = makeConfig(['opencode'], []);
      await adapter.sync({
        source: join(TOOLKIT_ROOT, 'source'),
        target: projectDir,
        config,
        types: ['agents', 'skills', 'mcps', 'rules'],
      });
      assert.ok(
        syncProbeCalls >= 1,
        'adapter.sync() must invoke hooks registered in lifecycle.sync (Major #1 fix applies to opencode too)'
      );
    } finally {
      const idx = adapter.lifecycle.sync.lastIndexOf(probe);
      if (idx !== -1) adapter.lifecycle.sync.splice(idx, 1);
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// ─── Major #2 regression: init must not call installBootstrap directly ─────
//
// After the lifecycle refactor, `adapter.install()` already iterates
// lifecycle.install (which has installBootstrap pushed). Calling
// installBootstrap AGAIN directly from init.mjs = double invocation +
// duplicate log lines ("X bootstrap installed" / "X bootstrap skipped").
// The registry must be the single source of truth, so init.mjs must
// delegate to the adapter's lifecycle and stop invoking installBootstrap
// directly.
//
// Discriminator: on a fresh install, init.mjs's direct block emits
//   "  ✓ claude-code bootstrap installed."
// because the direct call returns {installed: true}. The adapter's own
// installBootstrap is silent on success (only logs when the dir already
// exists). So the presence of "X bootstrap installed" lines in init's
// console.log output is exclusive to the direct call block. Same for
// "X bootstrap skipped (already installed)." on idempotent re-runs — the
// adapter path emits its own "Bootstrap command already exists at..."
// message instead, but init's direct block chains on top of it.

test('init: no per-tool bootstrap log line on fresh install (registry path is silent on success)', async () => {
  // Fresh project (no bootstrap yet). On a fresh install, installBootstrap
  // returns {installed: true} silently (no console.log). The line
  // "  ✓ claude-code bootstrap installed." exists ONLY in init.mjs's
  // direct-block. Today: line is emitted → assertion fails. After fix:
  // the direct-block is gone → no such line → assertion passes.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-init-nopwrap-'));
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const config = makeConfig(['claude-code'], []);
    await callInit(projectDir, config, { tools: 'claude-code' });

    // Bootstrap must still be installed — proving the lifecycle.install path
    // covers what the direct block used to do (defense for behavior parity).
    assert.ok(
      existsSync(join(projectDir, '.claude/skills/bootstrap/SKILL.md')),
      'bootstrap still installed via lifecycle (regression guard for production behavior)'
    );

    const allLogs = logs.join('\n');
    assert.doesNotMatch(
      allLogs,
      /claude-code bootstrap installed\b/,
      'init must NOT emit "  ✓ X bootstrap installed." (Major #2: lifecycle.registry is sole source of truth)'
    );
    assert.doesNotMatch(
      allLogs,
      /claude-code bootstrap skipped\b/,
      'init must NOT emit "  → X bootstrap skipped (already installed)." (Major #2)'
    );
  } finally {
    console.log = originalLog;
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('init: no per-tool bootstrap log line on idempotent re-run (opencode)', async () => {
  // Idempotent re-run: bootstrap already on disk. Today's direct block
  // emits "  → opencode bootstrap skipped (already installed)." on top of
  // the adapter's own "Bootstrap command already exists at..." message.
  // After fix: only the adapter's own message remains — the "X bootstrap
  // skipped" line is gone.
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-init-nopwrap-oc-'));
  const config = makeConfig(['opencode'], []);
  // First run: creates bootstrap.
  await callInit(projectDir, config, { tools: 'opencode' });

  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.join(' '));
  try {
    // Second run: idempotent.
    await callInit(projectDir, config, { tools: 'opencode' });
    const allLogs = logs.join('\n');
    assert.doesNotMatch(
      allLogs,
      /opencode bootstrap skipped\b/,
      'init must NOT emit "  → X bootstrap skipped (already installed)." on idempotent re-run (Major #2)'
    );
    assert.doesNotMatch(
      allLogs,
      /opencode bootstrap installed\b/,
      'init must NOT emit "  ✓ X bootstrap installed." on idempotent re-run (Major #2)'
    );
  } finally {
    console.log = originalLog;
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// ─── sync propagates source modifications ─────────────────────────────────
//
// The propagation fix (force=true in sync) means edits to source files
// under source/prompts/bootstrap/ now reach the target on `sync`. These
// tests build a tiny fake source (10 files: 1 conductor + 9 supporting)
// with a unique marker, install from it, modify the conductor on disk,
// sync, and assert the new marker reaches the target SKILL.md /
// bootstrap.md. Uses the adapter directly so we can point at the fake
// source (the CLI commands resolve source from the toolkit root).
//
// NOTE: the fake source has a custom conductor that does NOT reference
// the 9 supporting files by name — installBootstrap does path rewriting
// even when the references are absent (it splits on `./0X-...` patterns
// that simply don't match), so no special handling is required.

const FAKE_BOOTSTRAP_FILES = [
  '00-conductor.md',
  '01-pre-flight.md',
  '02-discovery.md',
  '03-stack.md',
  '04-architecture.md',
  '05-code-style.md',
  '06-conventions.md',
  '07-examples.md',
  '08-agents-md.md',
  '09-prune.md',
];

async function buildFakeSourceDir({ withMarker = '' } = {}) {
  const fakeRoot = mkdtempSync(join(tmpdir(), 'aitk-sync-fake-src-'));
  const bootstrapSrcDir = join(fakeRoot, 'prompts/bootstrap');
  mkdirSync(bootstrapSrcDir, { recursive: true });

  // Conductor carries the marker (or a placeholder when none).
  const conductorBody = withMarker
    ? `${withMarker}\n\n# Conductor\nBody content.\n`
    : '# Conductor\nInitial body content.\n';
  writeFileSync(join(bootstrapSrcDir, '00-conductor.md'), conductorBody);

  // Supporting files: minimal stub. installBootstrap copies them byte-by-
  // byte, so any content works — they're not parsed.
  for (const name of FAKE_BOOTSTRAP_FILES.slice(1)) {
    writeFileSync(join(bootstrapSrcDir, name), `# ${name}\nStub content.\n`);
  }

  return { fakeRoot, bootstrapSrcDir };
}

test('sync: propagates source modifications to bootstrap (claude-code)', async () => {
  // The bug this guards against: previously sync's installBootstrap call
  // was idempotent (skipped if dir existed), so any modification to the
  // canonical conductor under source/prompts/bootstrap/ was invisible on
  // the target until the user manually deleted the bootstrap dir. force=true
  // closes that gap.
  const { fakeRoot, bootstrapSrcDir } = await buildFakeSourceDir();
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-sync-bs-propagate-cc-'));
  try {
    const config = makeConfig(['claude-code'], []);
    const adapter = await import(CLAUDE_ADAPTER_PATH);

    // Initial install from fake source.
    await adapter.install({
      source: fakeRoot,
      target: projectDir,
      config,
      types: ['agents', 'skills', 'mcps', 'rules'],
    });
    const skillPath = join(projectDir, '.claude/skills/bootstrap/SKILL.md');
    assert.ok(existsSync(skillPath), 'init wrote bootstrap from fake source');

    // Modify the fake source: append a unique marker to the conductor.
    const MARKER_V2 = `# UPDATED-MARKER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fakeConductorPath = join(bootstrapSrcDir, '00-conductor.md');
    const prevSource = readFileSync(fakeConductorPath, 'utf8');
    writeFileSync(fakeConductorPath, `${prevSource}\n${MARKER_V2}\n`);

    // Sync. force=true must wipe + recreate, picking up the new conductor.
    await adapter.sync({
      source: fakeRoot,
      target: projectDir,
      config,
      types: ['agents', 'skills', 'mcps', 'rules'],
    });

    const finalContent = readFileSync(skillPath, 'utf8');
    assert.ok(
      finalContent.includes(MARKER_V2),
      'sync propagates source conductor update to target SKILL.md (force=true wipe+recreate)'
    );
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('sync: propagates source modifications to bootstrap (opencode)', async () => {
  // Parity with claude-code: opencode's sync must also propagate source
  // modifications. The fake source has a custom conductor; sync must
  // pick up the new conductor and emit it in the rendered bootstrap.md.
  const { fakeRoot, bootstrapSrcDir } = await buildFakeSourceDir();
  const projectDir = mkdtempSync(join(tmpdir(), 'aitk-sync-bs-propagate-oc-'));
  try {
    const config = makeConfig(['opencode'], []);
    const adapter = await import(OPENCODE_ADAPTER_PATH);

    await adapter.install({
      source: fakeRoot,
      target: projectDir,
      config,
      types: ['agents', 'skills', 'mcps', 'rules'],
    });
    const commandFile = join(projectDir, '.opencode/commands/bootstrap.md');
    assert.ok(existsSync(commandFile), 'init wrote bootstrap command from fake source');

    const MARKER_V2 = `# UPDATED-MARKER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fakeConductorPath = join(bootstrapSrcDir, '00-conductor.md');
    const prevSource = readFileSync(fakeConductorPath, 'utf8');
    writeFileSync(fakeConductorPath, `${prevSource}\n${MARKER_V2}\n`);

    await adapter.sync({
      source: fakeRoot,
      target: projectDir,
      config,
      types: ['agents', 'skills', 'mcps', 'rules'],
    });

    const finalContent = readFileSync(commandFile, 'utf8');
    assert.ok(
      finalContent.includes(MARKER_V2),
      'sync propagates source conductor update to target bootstrap.md (force=true wipe+recreate)'
    );
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  }
});
