import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
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

// ─── Happy path: validate against real toolkit ────────────────

test('validate: happy path with real config + real toolkit → "All valid."', async () => {
  // Use the project's own ai-toolkit.config.json + source/. All resources
  // are valid (otherwise the existing source/ would be broken); the command
  // must return cleanly without throwing.
  const config = JSON.parse(readFileSync(`${TOOLKIT}/ai-toolkit.config.json`, 'utf8'));
  await withTempDir('aitk-validate-', (projectDir) =>
    validateCommand({
      flags: {},
      config,
      configPath: `${TOOLKIT}/ai-toolkit.config.json`,
      projectDir,
      toolkitRoot: TOOLKIT,
    })
  );
  // No throw → success.
  assert.ok(true, 'validate completed without throwing on real config');
});

// ─── Error: config is null (parity with init/sync) ─────────────

test('validate: config is null + configPath undefined → does NOT print "at undefined"', async () => {
  // Regression for refactor C: before parity, the error message was
  //   `Config not found at ${configPath}.`
  // which becomes "Config not found at undefined." when configPath is null.
  // After parity (init.mjs:30-33 / sync.mjs:97-100), the message omits the
  // "at <path>" suffix when configPath is missing and points the user at
  // the --config flag.
  await withTempDir('aitk-validate-', (projectDir) =>
    validateCommand({
      flags: {},
      config: null,
      configPath: undefined,
      projectDir,
      toolkitRoot: TOOLKIT,
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /Config not found/);
        assert.doesNotMatch(err.message, /at undefined/, 'should not print "at undefined"');
        assert.match(err.message, /--config=<path>/, 'should hint at --config flag (parity with init/sync)');
      }
    )
  );
});

test('validate: config is null + configPath set → message includes path', async () => {
  // When configPath IS provided, the message retains the "at <path>" suffix.
  // Mirrors init.mjs:30 and sync.mjs:97.
  await withTempDir('aitk-validate-', (projectDir) =>
    validateCommand({
      flags: {},
      config: null,
      configPath: '/some/explicit/path.json',
      projectDir,
      toolkitRoot: TOOLKIT,
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /Config not found at \/some\/explicit\/path\.json/);
      }
    )
  );
});

// ─── Error: config.tools is an array (parity with init/sync) ───

test('validate: config.tools is an array → throws shape error (parity with init/sync)', async () => {
  // Regression for refactor C: before parity, validate silently treated
  // config.tools as an array and used Object.keys on it (yielding "0","1"),
  // then the pre-check `!config.tools[tool]` made each tool pass through
  // with a warn+skip — total: no errors, no throw. After parity, validate
  // throws the same shape error as init/sync: "config.tools must be an object".
  await withTempDir('aitk-validate-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = ['opencode', 'claude-code'];  // array, not object
    return validateCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: TOOLKIT,
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /config\.tools must be an object/);
        assert.match(err.message, /Example:/, 'message should include a usage example');
      }
    );
  });
});

test('validate: config.tools is null → throws shape error', async () => {
  // Mirror of the array case: null slips through typeof check (typeof null === 'object').
  // After parity, Array.isArray + null both fail the shape check.
  await withTempDir('aitk-validate-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = null;
    return validateCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: TOOLKIT,
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /config\.tools must be an object/);
      }
    );
  });
});

// ─── Error: config.source is wrong type (parity with init) ─────

test('validate: config.source is a number → throws type error (parity with init)', async () => {
  // Regression for refactor C: before parity, resolve() got a number and
  // threw an unhelpful TypeError ("path must be a string..."). After parity
  // (init.mjs:42-44), validate throws a clean "config.source must be a string".
  await withTempDir('aitk-validate-', (projectDir) => {
    const config = makeValidConfig();
    config.source = 123;
    return validateCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: TOOLKIT,
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /config\.source must be a string/);
      }
    );
  });
});

// ─── Error: --tools=tool-not-configured (pre-check elimination) ──

test('validate: --tools=tool-not-configured → throws validation error (pre-check eliminated)', async () => {
  // Regression for refactor C: before parity, the pre-check at the start of
  // the tools loop did `if (!config.tools[tool]) { warn; continue; }`,
  // silently skipping non-configured tools. After parity, the pre-check is
  // eliminated (loadAdapter is the single source of truth for whitelist
  // validation). The loadAdapter throw is caught and counted as an error;
  // the final `if (errors > 0)` throws.
  await withTempDir('aitk-validate-', (projectDir) => {
    const config = makeValidConfig();
    // opencode is configured; ghost is not. --tools=opencode,ghost.
    return validateCommand({
      flags: { tools: 'opencode,ghost' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: TOOLKIT,
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /1 validation error/, 'final throw after accumulating errors');
      }
    );
  });
});

test('validate: --tools=only-not-configured → throws validation error', async () => {
  // Same as above but ALL tools are unconfigured (no positive tools to
  // validate). Pre-check would have skipped all of them; post-parity, every
  // one gets caught by loadAdapter and counted as an error.
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
        assert.match(err.message, /2 validation error/);
      }
    );
  });
});

// ─── Error: adapter.validate throws → caught + counted ──────────

test('validate: adapter.validate throws → counted as error', async () => {
  // Regression test for the catch around adapter.validate (validate.mjs:33-39).
  // Set up a fake toolkit with an adapter whose validate() throws. Verify
  // the error is caught and the final throw fires.
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
        assert.match(err.message, /1 validation error/, 'error counted and final throw fires');
      }
    );
  });
});
