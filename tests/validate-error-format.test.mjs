// Tests for the per-tool cause list in validate's final throw (Commit G).
// Pins the new behavior; the 3 prefix-only tests in validate-command.test.mjs remain unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCommand } from '../bin/commands/validate.mjs';

const TOOLKIT = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';

function withTempDir(prefix, fn) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return (async () => {
    try {
      return await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  })();
}

function makeValidConfig() {
  return {
    source: './source',
    tools: {
      opencode: { enabled: true },
      'claude-code': { enabled: true },
    },
    default_tools: ['opencode', 'claude-code'],
  };
}

test('validate: final throw includes per-tool cause lines (loadAdapter path)', async () => {
  // --tools=ghost1,ghost2 — both tools fail at loadAdapter with the
  // canonical "Tool ... is not configured" message. The final throw must
  // include one cause line per failed tool.
  await withTempDir('aitk-validate-', (projectDir) => {
    const config = makeValidConfig();
    return validateCommand({
      flags: { tools: 'ghost1,ghost2' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: TOOLKIT,
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        // Prefix preserved (parity with the 3 pre-existing tests).
        assert.match(err.message, /2 validation error/);
        // NEW: cause list. Each failed tool gets its own line in the throw.
        assert.match(err.message, /ghost1: Tool "ghost1" is not configured/, 'must list ghost1 cause');
        assert.match(err.message, /ghost2: Tool "ghost2" is not configured/, 'must list ghost2 cause');
      }
    );
  });
});

test('validate: final throw includes per-tool cause line for adapter.validate() failure', async () => {
  // Set up a fake toolkit with an adapter whose validate() throws 'boom'.
  // The catch around adapter.validate must capture the message into the
  // cause list.
  await withTempDir('aitk-validate-', (projectDir) => {
    const fakeRoot = join(projectDir, 'fake-toolkit');
    mkdirSync(join(fakeRoot, 'adapters/broken'), { recursive: true });
    writeFileSync(
      join(fakeRoot, 'adapters/broken/adapter.mjs'),
      `export async function validate() { throw new Error('boom'); }`
    );
    const config = {
      source: './source',
      tools: { broken: {} },
      default_tools: ['broken'],
    };
    return validateCommand({
      flags: { tools: 'broken' },
      config,
      configPath: '/x.json',
      projectDir,
      toolkitRoot: fakeRoot,
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /1 validation error/);
        // Cause line must surface the adapter's error message verbatim.
        assert.match(err.message, /broken: boom/, 'must list broken adapter cause');
      }
    );
  });
});

test('validate: success path throws nothing (sanity check — no regression)', async () => {
  // Regression guard: happy path must not throw after the cause-list change.
  const config = JSON.parse(
    (await import('node:fs')).readFileSync(`${TOOLKIT}/ai-toolkit.config.json`, 'utf8')
  );
  await withTempDir('aitk-validate-', (projectDir) =>
    validateCommand({
      flags: {},
      config,
      configPath: `${TOOLKIT}/ai-toolkit.config.json`,
      projectDir,
      toolkitRoot: TOOLKIT,
    })
  );
  assert.ok(true, 'happy path did not throw');
});
