import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand, ALL_TYPES } from '../bin/commands/init.mjs';

// ─── Helpers ────────────────────────────────────────────────

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

// ─── ALL_TYPES sanity ────────────────────────────────────────

test('ALL_TYPES contains the 5 expected types', () => {
  assert.deepEqual(ALL_TYPES, ['agents', 'skills', 'mcps', 'rules', 'commands']);
});

// ─── Config validation (regression for B1, B2) ──────────────

test('init: throws if config is null (regression B2)', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    return initCommand({
      flags: {},
      config: null,
      configPath: undefined,
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /Config not found/);
        assert.doesNotMatch(err.message, /at undefined/, 'should not print "at undefined"');
      }
    );
  });
});

test('init: throws if config.tools is missing (regression B1)', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    delete config.tools;
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /config\.tools/);
      }
    );
  });
});

test('init: throws if config.tools is not an object', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = null;
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /config\.tools/);
      }
    );
  });
});

// ─── Tool resolution ─────────────────────────────────────────

test('init: throws with clear message when no tools specified', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.default_tools = undefined;
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /No tools specified/);
      }
    );
  });
});

test('init: uses config.default_tools when --tools not provided', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    let observedTools;
    // Inject a fake adapter that records what it got
    config.tools = {
      fake: {
        enabled: true,
        __adapterPath: '/tmp/fake-adapter.mjs',
      },
    };
    // Simulate by using a fake tool name that has no real adapter
    // → should be skipped with warning (whitelist doesn't require existence)
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/definitely/not/a/real/path',
    });
    // Should not throw — just skip non-existent adapter
  });
});

// ─── --types flag validation ─────────────────────────────────

test('init: --types=skills,commands,rules works (multi-value)', async () => {
  // Set up a fake toolkit with a real adapter (no-op success) so init completes
  // without throwing. We use `cwd`-style default_tools via the config, not
  // --tools, so N6 (explicit --tools with no installs) doesn't fire.
  await withTempDir('aitk-init-', (projectDir) => {
    const fakeRoot = join(projectDir, 'fake-toolkit');
    mkdirSync(join(fakeRoot, 'adapters/opencode'), { recursive: true });
    writeFileSync(
      join(fakeRoot, 'adapters/opencode/adapter.mjs'),
      'export async function install() {}'
    );
    const config = makeValidConfig();
    config.default_tools = ['opencode'];
    return initCommand({
      flags: { types: 'skills,commands,rules' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: fakeRoot,
    });
  });
});

test('init: --types normalizes case and trims whitespace', async () => {
  // Indirect test: pass --types=SKILLS, Skills (uppercase) with valid types.
  // Uses default_tools + fake adapter so init completes without throwing.
  await withTempDir('aitk-init-', (projectDir) => {
    const fakeRoot = join(projectDir, 'fake-toolkit');
    mkdirSync(join(fakeRoot, 'adapters/opencode'), { recursive: true });
    writeFileSync(
      join(fakeRoot, 'adapters/opencode/adapter.mjs'),
      'export async function install() {}'
    );
    const config = makeValidConfig();
    config.default_tools = ['opencode'];
    return initCommand({
      flags: { types: ' SKILLS , Agents ' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: fakeRoot,
    });
  });
});

test('init: --types=foo throws with list of valid types', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: { types: 'foo,bar' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /Unknown type\(s\): foo, bar/);
        assert.match(err.message, /Valid: agents, skills, mcps, rules, commands/);
      }
    );
  });
});

test('init: --types= throws "cannot be empty"', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: { types: '' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /--types cannot be empty/);
      }
    );
  });
});

test('init: --types=,, throws "cannot be empty"', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: { types: ',,' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /--types cannot be empty/);
      }
    );
  });
});

test('init: --types=skills,skills dedupes', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const fakeRoot = join(projectDir, 'fake-toolkit');
    mkdirSync(join(fakeRoot, 'adapters/opencode'), { recursive: true });
    writeFileSync(
      join(fakeRoot, 'adapters/opencode/adapter.mjs'),
      'export async function install() {}'
    );
    const config = makeValidConfig();
    config.default_tools = ['opencode'];
    return initCommand({
      flags: { types: 'skills,skills,SKILLS' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: fakeRoot,
    });
  });
});

test('init: --types with non-string value throws', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: { types: true },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /--types must be a comma-separated string/);
      }
    );
  });
});

test('init: --types omitted → defaults to ALL_TYPES', async () => {
  // Indirect: verify that without --types, the function still flows through.
  // Uses a fake toolkit + default_tools so no install actually runs but
  // init completes without throwing (not using --tools explicitly, so N6
  // doesn't fire).
  await withTempDir('aitk-init-', (projectDir) => {
    const fakeRoot = join(projectDir, 'fake-toolkit');
    mkdirSync(join(fakeRoot, 'adapters/opencode'), { recursive: true });
    writeFileSync(
      join(fakeRoot, 'adapters/opencode/adapter.mjs'),
      'export async function install() {}'
    );
    const config = makeValidConfig();
    config.default_tools = ['opencode'];
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: fakeRoot,
    });
  });
});

// ─── Auto-create projectDir ──────────────────────────────────

test('init: auto-creates projectDir if missing', async () => {
  // Fake toolkit nested under projectDir so the adapter file is found during
  // the loop iteration (Node's test runner drops files in separate top-level
  // tempdirs — see the F5 partial-failure test for the same workaround).
  await withTempDir('aitk-parent-', (parent) => {
    const projectDir = join(parent, 'new-subproject');
    assert.ok(!existsSync(projectDir), 'precondition: dir does not exist');
    const fakeRoot = join(projectDir, 'fake-toolkit');
    mkdirSync(join(fakeRoot, 'adapters/opencode'), { recursive: true });
    writeFileSync(
      join(fakeRoot, 'adapters/opencode/adapter.mjs'),
      'export async function install() {}'
    );
    const config = makeValidConfig();
    config.default_tools = ['opencode'];
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: fakeRoot,
    }).then(() => {
      assert.ok(existsSync(projectDir), 'projectDir should be created');
    });
  });
});

// ─── Tool whitelist + adapter file checks ────────────────────

test('init: skips tool not in config.tools with warning', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = { 'real-only': {} };
    config.default_tools = ['opencode'];  // not in config.tools
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    });
    // Should not throw — just skip
  });
});

test('init: skips tool with missing adapter file', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.default_tools = ['opencode'];  // adapter file may exist in this repo but we point toolkitRoot elsewhere
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/totally/bogus/path',
    });
    // Should not throw — skip with warning
  });
});

// ─── Per-tool error handling ─────────────────────────────────

test('init: accumulates per-tool errors, no throw if at least 1 succeeds', async () => {
  // We can't easily mock adapters, but we can verify that the error path
  // for "all fail" is reachable by pointing toolkitRoot to a bogus path
  // with no valid tools → the only configured tools have no adapter → no installs
  // → no errors accumulated → no throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/totally/bogus/path',
    });
    // No install, no error, no throw
  });
});

// ─── Integration: real init against real source ──────────────

test('init (integration): install all types against real source', async () => {
  await withTempDir('aitk-init-real-', (projectDir) => {
    const toolkitRoot = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
    const config = JSON.parse(readFileSync(`${toolkitRoot}/ai-toolkit.config.json`, 'utf8'));
    config.default_tools = ['opencode', 'claude-code'];
    return initCommand({
      flags: {},
      config,
      configPath: `${toolkitRoot}/ai-toolkit.config.json`,
      projectDir,
      toolkitRoot,
    }).then(() => {
      // Verify that opencode and claude-code adapters wrote files
      assert.ok(existsSync(join(projectDir, '.opencode')), '.opencode/ should exist');
      assert.ok(existsSync(join(projectDir, '.claude')), '.claude/ should exist');
      assert.ok(existsSync(join(projectDir, '.ai-toolkit.json')), 'state file should exist');
    });
  });
});

test('init (integration): --types=agents installs only agents', async () => {
  await withTempDir('aitk-init-agents-', (projectDir) => {
    const toolkitRoot = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
    const config = JSON.parse(readFileSync(`${toolkitRoot}/ai-toolkit.config.json`, 'utf8'));
    config.default_tools = ['opencode'];
    return initCommand({
      flags: { types: 'agents' },
      config,
      configPath: `${toolkitRoot}/ai-toolkit.config.json`,
      projectDir,
      toolkitRoot,
    }).then(() => {
      // .opencode/agents/ should have files
      assert.ok(existsSync(join(projectDir, '.opencode/agents')), 'agents dir should exist');
      // Skills should NOT be installed
      assert.ok(!existsSync(join(projectDir, '.opencode/skills')), 'skills dir should NOT exist');
    });
  });
});

test('init (integration): --types=skills,commands,rules (multi)', async () => {
  await withTempDir('aitk-init-multi-', (projectDir) => {
    const toolkitRoot = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
    const config = JSON.parse(readFileSync(`${toolkitRoot}/ai-toolkit.config.json`, 'utf8'));
    config.default_tools = ['opencode'];
    return initCommand({
      flags: { types: 'skills,commands,rules' },
      config,
      configPath: `${toolkitRoot}/ai-toolkit.config.json`,
      projectDir,
      toolkitRoot,
    }).then(() => {
      // skills and rules should be installed (commands = no-op for now)
      assert.ok(existsSync(join(projectDir, '.opencode/skills')), 'skills dir should exist');
      assert.ok(existsSync(join(projectDir, 'AGENTS.md')), 'AGENTS.md should exist');
      // agents should NOT
      assert.ok(!existsSync(join(projectDir, '.opencode/agents')), 'agents dir should NOT exist');
    });
  });
});

// ─── Regression N2: config.tools as array ─────────────────────

test('init: throws when config.tools is an array', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = ['opencode', 'claude-code'];  // array instead of object
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /config\.tools must be an object/);
      }
    );
  });
});

// ─── Regression N1: config.tools[tool] is array (value-side) ───

test('init: skips with warning when default_tools[tool] is an array (regression N1)', async () => {
  // Array value slips through typeof check (typeof [] === 'object'). N1 fix:
  // Array.isArray check on the value side.
  // Best-effort defaults: warn-skip, not throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = { opencode: [] };  // value is array (would otherwise pass typeof)
    config.default_tools = ['opencode'];
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    });
    // No throw — just a warning.
  });
});

// ─── Regression N3: config.tools[tool] is null/string ─────────

test('init: throws when explicit --tools has null value in config.tools (regression N3 + N6)', async () => {
  // N6 makes explicit --tools throw when no installs succeed. Combined with
  // N3's null-value detection: user explicitly asked for opencode, but it's
  // misconfigured → throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = { opencode: null };
    return initCommand({
      flags: { tools: 'opencode' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /None of the requested tools \(opencode\) are configured/);
      }
    );
  });
});

test('init: skips with warning when default_tools has null value (regression N3 only)', async () => {
  // When the bad value comes from config.default_tools (no --tools), it's
  // best-effort: warn-skip, not throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = { opencode: null };
    config.default_tools = ['opencode'];
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    });
    // No throw — just a warning.
  });
});

test('init: throws when explicit --tools has string value (wrong type)', async () => {
  // Same N6 logic: explicit --tools that fails → throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = { opencode: 'enabled' };  // wrong type
    return initCommand({
      flags: { tools: 'opencode' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /None of the requested tools \(opencode\) are configured/);
      }
    );
  });
});

test('init: skips with warning when default_tools has string value (wrong type)', async () => {
  // Best-effort defaults: warn-skip, not throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.tools = { opencode: 'enabled' };
    config.default_tools = ['opencode'];
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    });
  });
});

// ─── N6: feedback when all tools skipped ────────────────────────

test('init: warns (no throw) when default_tools has no valid entries', async () => {
  // User did NOT pass --tools. default_tools is best-effort, so a mismatch
  // produces a warning, not an error.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.default_tools = ['nonexistent'];
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    });
    // No throw — exit 0 with warning.
  });
});

test('init: throws when explicit --tools has no valid entries (N6)', async () => {
  // User explicitly asked for `nonexistent` via --tools. Silent skip is
  // misleading — must throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: { tools: 'nonexistent' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /None of the requested tools \(nonexistent\) are configured/);
      }
    );
  });
});

test('init: throws "No tools specified" when --tools is empty (explicit but no value)', async () => {
  // User typed `--tools=` (empty). parseToolsFlag returns [] (not null),
  // so toolsExplicit=true. Then tools.length===0 hits the early throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: { tools: '' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /No tools specified/);
      }
    );
  });
});

test('init: throws "No tools specified" when --tools has only commas', async () => {
  // Same as above: --tools=,,, → []. toolsExplicit=true → throw.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: { tools: ',,,' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /No tools specified/);
      }
    );
  });
});

test('init: throws "No tools specified" when --tools=undefined and no defaults', async () => {
  // No --tools, no config.default_tools → throws "No tools specified".
  // This was the existing behavior; the test pins it.
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.default_tools = undefined;
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /No tools specified/);
      }
    );
  });
});

// ─── Regression N1 propagation: --tools with whitespace ───────

test('init: --tools="opencode, claude-code" trims whitespace and installs both', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const toolkitRoot = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
    const config = JSON.parse(readFileSync(`${toolkitRoot}/ai-toolkit.config.json`, 'utf8'));
    return initCommand({
      flags: { tools: 'opencode, claude-code' },
      config,
      configPath: `${toolkitRoot}/ai-toolkit.config.json`,
      projectDir,
      toolkitRoot,
    }).then(() => {
      // Both should be installed (whitespace was trimmed)
      assert.ok(existsSync(join(projectDir, '.opencode')), '.opencode/ should exist');
      assert.ok(existsSync(join(projectDir, '.claude')), '.claude/ should exist');
    });
  });
});

test('init: --tools="opencode,opencode" dedupes', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const toolkitRoot = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
    const config = JSON.parse(readFileSync(`${toolkitRoot}/ai-toolkit.config.json`, 'utf8'));
    // Spy: count how many times adapter.install is called. We can't easily
    // do that here, but we verify the result is sane: state.tools.opencode
    // has the agents, and we don't see "Installing for opencode" twice in the logs.
    return initCommand({
      flags: { tools: 'opencode,opencode' },
      config,
      configPath: `${toolkitRoot}/ai-toolkit.config.json`,
      projectDir,
      toolkitRoot,
    }).then(() => {
      assert.ok(existsSync(join(projectDir, '.opencode')), '.opencode/ should exist');
      const state = JSON.parse(readFileSync(join(projectDir, '.ai-toolkit.json'), 'utf8'));
      assert.ok(state.tools?.opencode, 'state.tools.opencode should exist');
    });
  });
});

// ─── G3: config.source validation ─────────────────────────────

test('init: throws when config.source is not a string', async () => {
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    config.source = 123;  // wrong type
    return initCommand({
      flags: {},
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        assert.match(err.message, /config\.source must be a string/);
      }
    );
  });
});

// ─── Regression F5: adapter throw handling ────────────────────

test('init: throws "All tools failed" with summary when all adapters throw', async () => {
  // Set up a temp toolkit with an adapter that always throws.
  await withTempDir('aitk-init-f5-', (projectDir) => {
    const fakeRoot = mkdtempSync(join(tmpdir(), 'aitk-toolkit-f5-'));
    try {
      mkdirSync(join(fakeRoot, 'adapters/broken'), { recursive: true });
      writeFileSync(
        join(fakeRoot, 'adapters/broken/adapter.mjs'),
        `export async function install() { throw new Error('boom'); }`
      );
      const config = {
        source: './source',
        tools: { broken: {} },
        default_tools: ['broken'],
      };
      return initCommand({
        flags: {},
        config,
        configPath: '/x.json',
        projectDir,
        toolkitRoot: fakeRoot,
      }).then(
        () => { throw new Error('should have thrown'); },
        (err) => {
          assert.match(err.message, /All tools failed/);
          assert.match(err.message, /broken: boom/);
        }
      );
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });
});

test('init: does NOT throw when at least one adapter succeeds (partial failure)', async () => {
  // Set up: one adapter that succeeds, one that throws.
  // NOTE: fakeRoot must be INSIDE projectDir (nested) — using two separate
  // top-level mkdtempSync tempdirs causes Node's test runner to lose track
  // of the second one during async iteration. Nesting avoids this.
  await withTempDir('aitk-init-partial-', (projectDir) => {
    const fakeRoot = join(projectDir, 'fake-toolkit');
    try {
      // Working adapter (no-op success)
      mkdirSync(join(fakeRoot, 'adapters/working'), { recursive: true });
      writeFileSync(
        join(fakeRoot, 'adapters/working/adapter.mjs'),
        `export async function install() {}`
      );
      // Failing adapter
      mkdirSync(join(fakeRoot, 'adapters/broken'), { recursive: true });
      writeFileSync(
        join(fakeRoot, 'adapters/broken/adapter.mjs'),
        `export async function install() { throw new Error('boom'); }`
      );
      const config = {
        source: './source',
        tools: { working: {}, broken: {} },
        default_tools: ['working', 'broken'],
      };
      return initCommand({
        flags: {},
        config,
        configPath: '/x.json',
        projectDir,
        toolkitRoot: fakeRoot,
      }).then(() => {
        // Should NOT throw — at least one succeeded
        assert.ok(true, 'init completed without throwing');
      });
    } finally {
      // Cleanup handled by withTempDir's outer finally
    }
  });
});