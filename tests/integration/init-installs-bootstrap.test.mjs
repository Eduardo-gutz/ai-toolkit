// Integration tests: initCommand invoca installBootstrap en cada adapter
// que lo exponga. Backward-compatible: si un adapter no expone
// installBootstrap, init debe seguir funcionando (no rompe).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
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
