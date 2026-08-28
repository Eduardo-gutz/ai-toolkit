import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dispatch, shouldRunMain } from '../bin/ai-toolkit.mjs';

// ─── Helpers ────────────────────────────────────────────────

/**
 * Capture stdout/stderr/exit during a dispatch call.
 * Returns the captured buffers; mutates with the injected functions.
 */
async function capture(fn) {
  const stdout = [];
  const stderr = [];
  let exitCode = null;
  const stdoutFn = (...args) => stdout.push(args.join(' '));
  const stderrFn = (...args) => stderr.push(args.join(' '));
  const exitFn = (code) => { exitCode = code; };
  await fn({ stdout: stdoutFn, stderr: stderrFn, exit: exitFn });
  return { stdout: stdout.join('\n'), stderr: stderr.join('\n'), exitCode };
}

/** A no-op command registry that lets us observe what dispatch passes through. */
function testCommands(impl) {
  return {
    testcmd: { fn: impl, desc: 'Test command' },
  };
}

/** Escape a string for use inside a RegExp. */
function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Create a tempdir, yield it to fn(), then clean up. */
function withTempDir(prefix, fn) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── --help / -h (Fix 1.1) ──────────────────────────────────

test('dispatch: --help exits 0 (was 1 before Fix 1.1)', async () => {
  const { exitCode, stdout } = await capture((inject) =>
    dispatch({ argv: ['--help'], ...inject })
  );
  assert.equal(exitCode, 0, '--help must exit 0 per POSIX');
  assert.match(stdout, /Usage: ai-toolkit <command>/);
});

test('dispatch: -h exits 0', async () => {
  const { exitCode } = await capture((inject) =>
    dispatch({ argv: ['-h'], ...inject })
  );
  assert.equal(exitCode, 0);
});

test('dispatch: no args shows help and exits 0', async () => {
  const { exitCode, stdout } = await capture((inject) =>
    dispatch({ argv: [], ...inject })
  );
  assert.equal(exitCode, 0);
  assert.match(stdout, /Usage: ai-toolkit <command>/);
});

// ─── --version / -v ─────────────────────────────────────────

test('dispatch: --version exits 0 and prints 0.1.0 (Fix 1.3)', async () => {
  const { exitCode, stdout } = await capture((inject) =>
    dispatch({ argv: ['--version'], ...inject })
  );
  assert.equal(exitCode, 0);
  assert.equal(stdout, '0.1.0');
});

test('dispatch: -v exits 0', async () => {
  const { exitCode } = await capture((inject) =>
    dispatch({ argv: ['-v'], ...inject })
  );
  assert.equal(exitCode, 0);
});

// ─── Unknown command ────────────────────────────────────────

test('dispatch: unknown command → stderr + help + exit 1', async () => {
  const { exitCode, stdout, stderr } = await capture((inject) =>
    dispatch({ argv: ['banana'], ...inject })
  );
  assert.equal(exitCode, 1);
  assert.match(stderr, /Unknown command: banana/);
  assert.match(stdout, /Usage: ai-toolkit/);
});

// ─── Help text integrity ────────────────────────────────────

test('dispatch: add command description has <type> <name> (Fix 1.2)', async () => {
  const { stdout } = await capture((inject) =>
    dispatch({ argv: ['--help'], ...inject })
  );
  assert.doesNotMatch(stdout, /<type>name>/, 'typo from review must be gone');
  assert.match(stdout, /add\s+Add a resource.*<type> <name>/);
});

// ─── Command dispatch with injected registry ────────────────

test('dispatch: invokes the named command with parsed flags', async () => {
  const observed = {};
  await capture((inject) =>
    dispatch({
      argv: ['testcmd', '--project=/tmp/x', '--yes'],
      env: {},
      commands: testCommands(async (ctx) => {
        Object.assign(observed, ctx);
      }),
      ...inject,
    })
  );
  assert.equal(observed.flags.yes, true);
  assert.equal(observed.flags.project, '/tmp/x');
  assert.equal(resolve(observed.projectDir), resolve('/tmp/x'));
});

test('dispatch: --global resolves projectDir to $HOME/.ai-toolkit (Fix 1.5)', async () => {
  const observed = {};
  await capture((inject) =>
    dispatch({
      argv: ['testcmd', '--global'],
      env: { HOME: '/fake/home' },
      commands: testCommands(async (ctx) => {
        Object.assign(observed, ctx);
      }),
      ...inject,
    })
  );
  assert.equal(resolve(observed.projectDir), resolve('/fake/home/.ai-toolkit'));
});

test('dispatch: defaults projectDir to cwd when no flag given', async () => {
  const observed = {};
  const cwd = process.cwd();
  await capture((inject) =>
    dispatch({
      argv: ['testcmd'],
      env: {},
      commands: testCommands(async (ctx) => {
        Object.assign(observed, ctx);
      }),
      ...inject,
    })
  );
  assert.equal(resolve(observed.projectDir), resolve(cwd));
});

// ─── configPath fallback chain (Fix 1.4 + 1.5) ──────────────

test('dispatch: cwd fallback loads ai-toolkit.config.json from injected cwd', async () => {
  await withTempDir('aitk-cwd-fb-', (dir) => {
    writeFileSync(
      join(dir, 'ai-toolkit.config.json'),
      JSON.stringify({ default_profile: 'TEST_CWD_PROFILE' })
    );
    return capture((inject) =>
      dispatch({
        argv: ['testcmd'],
        env: {},
        cwd: dir,
        commands: testCommands(async (ctx) => {
          assert.match(ctx.configPath, new RegExp(`${escape(dir)}/ai-toolkit\\.config\\.json$`));
          assert.equal(ctx.config.default_profile, 'TEST_CWD_PROFILE');
        }),
        ...inject,
      })
    );
  });
});

test('dispatch: projectDir = injected cwd when no flag', async () => {
  await withTempDir('aitk-cwd-proj-', (dir) =>
    capture((inject) => {
      let observedProjectDir;
      return dispatch({
        argv: ['testcmd'],
        env: {},
        cwd: dir,
        commands: testCommands(async (ctx) => { observedProjectDir = ctx.projectDir; }),
        ...inject,
      }).then(() => {
        assert.equal(resolve(observedProjectDir), resolve(dir));
      });
    })
  );
});

test('dispatch: --global picks $HOME/.ai-toolkit/ over bundled', async () => {
  await withTempDir('aitk-home-', (home) => {
    const globalDir = join(home, '.ai-toolkit');
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, 'ai-toolkit.config.json'),
      JSON.stringify({ default_profile: 'GLOBAL_WINS' })
    );
    return capture((inject) =>
      dispatch({
        argv: ['testcmd', '--global'],
        env: { HOME: home },
        commands: testCommands(async (ctx) => {
          assert.equal(ctx.config.default_profile, 'GLOBAL_WINS');
          assert.match(
            ctx.configPath,
            new RegExp(`${escape(globalDir)}/ai-toolkit\\.config\\.json$`)
          );
        }),
        ...inject,
      })
    );
  });
});

test('dispatch: --global falls back to bundled when no home config exists', async () => {
  await withTempDir('aitk-home-empty-', (home) =>
    capture((inject) =>
      dispatch({
        argv: ['testcmd', '--global'],
        env: { HOME: home },
        commands: testCommands(async (ctx) => {
          // HOME has no .ai-toolkit/ → falls through to bundled (last candidate).
          assert.match(ctx.configPath, /ai-toolkit\.config\.json$/);
          assert.ok(ctx.config, 'bundled config should be loaded as fallback');
        }),
        ...inject,
      })
    )
  );
});

test('dispatch: explicit --config wins over fallback chain', async () => {
  await capture((inject) => {
    let observed;
    return dispatch({
      argv: ['testcmd', '--config=/definitely/not/a/real/path.json'],
      env: {},
      commands: testCommands(async (ctx) => { observed = ctx; }),
      ...inject,
    }).then(() => {
      assert.equal(observed.config, null, 'config is null when --config path does not exist');
      assert.equal(resolve(observed.configPath), resolve('/definitely/not/a/real/path.json'));
    });
  });
});

// ─── Error path (Fix 3.1) ───────────────────────────────────

test('dispatch: command errors get the [cmd] Error prefix', async () => {
  const { stderr, exitCode } = await capture((inject) =>
    dispatch({
      argv: ['testcmd'],
      env: {},
      commands: {
        testcmd: {
          fn: async () => { throw new Error('boom'); },
          desc: 'always fails',
        },
      },
      ...inject,
    })
  );
  assert.equal(exitCode, 1);
  assert.match(stderr, /\[testcmd\] Error: boom/);
});

test('dispatch: errors include stack when DEBUG is set', async () => {
  const { stderr } = await capture((inject) =>
    dispatch({
      argv: ['testcmd'],
      env: { DEBUG: '1' },
      commands: {
        testcmd: {
          fn: async () => { throw new Error('boom'); },
          desc: 'always fails',
        },
      },
      ...inject,
    })
  );
  assert.match(stderr, /Error: boom/);
  assert.match(stderr, /at /, 'stack trace present when DEBUG=1');
});

test('dispatch: errors hide stack when DEBUG is not set', async () => {
  const { stderr } = await capture((inject) =>
    dispatch({
      argv: ['testcmd'],
      env: {},
      commands: {
        testcmd: {
          fn: async () => { throw new Error('boom'); },
          desc: 'always fails',
        },
      },
      ...inject,
    })
  );
  assert.doesNotMatch(stderr, /at .*\.mjs:\d+/, 'no stack frames when DEBUG is unset');
});

// ─── Positional args propagation ────────────────────────────

test('dispatch: passes positional args to the command', async () => {
  const observed = {};
  await capture((inject) =>
    dispatch({
      argv: ['testcmd', 'foo', 'bar', '--yes'],
      env: {},
      commands: testCommands(async (ctx) => {
        Object.assign(observed, ctx);
      }),
      ...inject,
    })
  );
  assert.deepEqual(observed.args, ['foo', 'bar']);
});

test('dispatch: -- separator sends everything after to positional', async () => {
  const observed = {};
  await capture((inject) =>
    dispatch({
      argv: ['testcmd', '--yes', '--', 'skills', '../etc/passwd'],
      env: {},
      commands: testCommands(async (ctx) => {
        Object.assign(observed, ctx);
      }),
      ...inject,
    })
  );
  assert.deepEqual(observed.args, ['skills', '../etc/passwd']);
  assert.equal(observed.flags.yes, true);
});

// ─── shouldRunMain (H1) ─────────────────────────────────────

test('shouldRunMain: same path → true', () => {
  const realPath = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit/bin/ai-toolkit.mjs';
  const sameUrl = `file://${realPath}`;
  assert.equal(shouldRunMain(realPath, sameUrl), true);
});

test('shouldRunMain: different paths → false', () => {
  const realPath = '/some/real/path.mjs';
  const fakePath = '/different/path.mjs';
  assert.equal(shouldRunMain(fakePath, `file://${realPath}`), false);
});

test('shouldRunMain: empty argv1 → false', () => {
  const realPath = '/some/real/path.mjs';
  assert.equal(shouldRunMain('', `file://${realPath}`), false);
});

test('shouldRunMain: argv1 path that does not exist still compares structurally', () => {
  // canonicalPath falls back to resolve() when realpathSync throws.
  const ghost = '/definitely/does/not/exist.mjs';
  const sameGhost = '/definitely/does/not/exist.mjs';
  assert.equal(shouldRunMain(ghost, `file://${sameGhost}`), true);
  assert.equal(shouldRunMain(ghost, 'file:///different.mjs'), false);
});

// ─── Bonus: malformed JSON, --global vs --project, help completeness ──

test('dispatch: malformed JSON in config → caught and prefixed with [cmd]', async () => {
  await withTempDir('aitk-malformed-', (dir) => {
    writeFileSync(join(dir, 'ai-toolkit.config.json'), '{ not valid json');
    return capture((inject) =>
      dispatch({
        argv: ['testcmd'],
        env: {},
        cwd: dir,
        commands: testCommands(async () => {}),
        ...inject,
      })
    ).then(({ stderr, exitCode }) => {
      assert.equal(exitCode, 1);
      assert.match(stderr, /\[testcmd\] Error:/);
    });
  });
});

test('dispatch: --global wins over --project when both given', async () => {
  await withTempDir('aitk-precedence-', (project) => {
    const home = mkdtempSync(join(tmpdir(), 'aitk-precedence-home-'));
    try {
      const globalDir = join(home, '.ai-toolkit');
      mkdirSync(globalDir, { recursive: true });
      writeFileSync(join(project, 'ai-toolkit.config.json'),
        JSON.stringify({ default_profile: 'PROJECT' }));
      writeFileSync(join(globalDir, 'ai-toolkit.config.json'),
        JSON.stringify({ default_profile: 'GLOBAL' }));
      return capture((inject) =>
        dispatch({
          argv: ['testcmd', '--global', `--project=${project}`],
          env: { HOME: home },
          commands: testCommands(async (ctx) => {
            // --global currently wins (flags.global is checked before flags.project).
            assert.equal(ctx.config.default_profile, 'GLOBAL');
          }),
          ...inject,
        })
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

test('dispatch: showHelp lists all 7 commands', async () => {
  const { stdout } = await capture((inject) =>
    dispatch({ argv: ['--help'], ...inject })
  );
  for (const cmd of ['init', 'sync', 'list', 'validate', 'doctor', 'add', 'remove']) {
    assert.match(stdout, new RegExp(`\\b${cmd}\\b`), `help should list command: ${cmd}`);
  }
});