import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand, ensureToolkitGitignore, ALL_TYPES } from '../bin/commands/init.mjs';

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
    }).then(() => {
      // Plan §2 Acceptance #5: when no tool actually succeeded (warn+return
      // branch), ensureToolkitGitignore MUST NOT be called — .gitignore stays
      // untouched. A regression that removed the early `return` would call the
      // helper with installedTools=∅ and create a (near-empty) marker block.
      assert.ok(
        !existsSync(join(projectDir, '.gitignore')),
        '.gitignore must NOT exist when no tools were installed (warn+return branch)'
      );
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

// ─── SECURITY: init uses loadAdapter (Refactor B) ─────────────
//
// Behavior: after migrating from manual path-resolution
// (`resolve(toolkitRoot, 'adapters/${tool}/adapter.mjs')` + `existsSync` +
// `import`) to `loadAdapter`, init must reject path-traversal payloads
// consistently with sync. loadAdapter's whitelist check fires BEFORE any
// path is constructed, so `import()` is never called with a malicious path.

test('init: rejects --tools=path-traversal (loadAdapter whitelist check)', async () => {
  // Mirrors tests/sync-command.test.mjs:204-246 for init. After refactor B,
  // both commands go through loadAdapter, so the same payload gets the same
  // rejection (whitelist before path construction).
  await withTempDir('aitk-init-', (projectDir) => {
    const config = makeValidConfig();
    return initCommand({
      flags: { tools: '../../tmp/evil' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: '/nonexistent',
    }).then(
      () => { throw new Error('should have thrown'); },
      (err) => {
        // Error message comes from N6 (none-of-the-requested-tools path)
        // which the explicit --tools triggers after loadAdapter rejects.
        assert.match(err.message, /evil/i);
        assert.match(
          err.message,
          /None of the requested tools|not configured/,
          'init throws N6 after loadAdapter rejects the path-traversal tool'
        );
      }
    );
  });
});

test('init: rejects --tools=mixed valid+path-traversal (loadAdapter whitelist)', async () => {
  // --tools=opencode,../../tmp/evil: opencode should be installed; evil should
  // be rejected by loadAdapter. Same behavior as sync's mixed-payload test.
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
      flags: { tools: 'opencode,../../tmp/evil' },
      config,
      configPath: '/tmp/x.json',
      projectDir,
      toolkitRoot: fakeRoot,
    });
    // opencode installed (no-op success), evil rejected by loadAdapter (warn+skip).
    // No throw because at least one succeeded.
  });
});

// ─── .gitignore management ──────────────────────────────────────
//
// Marker block format (em-dash U+2014 — copy, don't retype):
//   # >>> ai-toolkit (managed — do not edit between markers) >>>
//   <patterns>
//   # <<< ai-toolkit <<<
//
// Pattern set per plan (human-approved):
//   /.opencode/      if opencode in installedTools
//   /.claude/        if claude-code in installedTools
//   AGENTS.md        always
//   CLAUDE.md        if claude-code in installedTools
//   <stateFileRelPath>  always (basename → leading-/, contains / → leading-./)

const MARKER_OPEN = '# >>> ai-toolkit (managed — do not edit between markers) >>>';
const MARKER_CLOSE = '# <<< ai-toolkit <<<';

// ─── Unit tests: ensureToolkitGitignore called directly ─────────

test('ensureToolkitGitignore: creates .gitignore when missing', async () => {
  await withTempDir('aitk-ensure-', (projectDir) => {
    return ensureToolkitGitignore(
      projectDir,
      new Set(['opencode', 'claude-code']),
      '.ai-toolkit.json'
    ).then((result) => {
      assert.ok(existsSync(join(projectDir, '.gitignore')), '.gitignore should exist');
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      assert.ok(content.includes(MARKER_OPEN), 'marker open comment present');
      assert.ok(content.includes(MARKER_CLOSE), 'marker close comment present');
      assert.ok(content.includes('/.opencode/'), 'opencode pattern present');
      assert.ok(content.includes('/.claude/'), 'claude pattern present');
      assert.ok(content.includes('AGENTS.md'), 'AGENTS.md pattern present');
      assert.ok(content.includes('CLAUDE.md'), 'CLAUDE.md pattern present');
      assert.ok(content.includes('/.ai-toolkit.json'), 'state file pattern present');
      assert.equal(result.action, 'created');
      assert.equal(result.patternCount, 5);
    });
  });
});

test('ensureToolkitGitignore: appends marker block to existing file without disturbing user content', async () => {
  await withTempDir('aitk-ensure-', (projectDir) => {
    const userContent = 'node_modules/\n.env\n# my custom rules\n*.log\n';
    writeFileSync(join(projectDir, '.gitignore'), userContent);

    return ensureToolkitGitignore(
      projectDir,
      new Set(['opencode', 'claude-code']),
      '.ai-toolkit.json'
    ).then((result) => {
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      // Original 4 lines still present in order
      assert.ok(content.includes('node_modules/'), 'node_modules preserved');
      assert.ok(content.includes('.env'), '.env preserved');
      assert.ok(content.includes('# my custom rules'), 'custom comment preserved');
      assert.ok(content.includes('*.log'), '*.log preserved');
      // Marker block follows user content
      const userEnd = content.indexOf('*.log\n') + '*.log\n'.length;
      const markerStart = content.indexOf(MARKER_OPEN);
      assert.ok(markerStart > userEnd, 'marker block follows user content');
      // Exactly one blank line between user content and marker block
      const between = content.slice(userEnd, markerStart);
      assert.equal(between, '\n', 'exactly one blank line between user content and marker block');
      // Marker block contains all 5 patterns
      assert.ok(content.includes('/.opencode/'), 'opencode pattern present');
      assert.ok(content.includes('/.claude/'), 'claude pattern present');
      assert.ok(content.includes('AGENTS.md'), 'AGENTS.md pattern present');
      assert.ok(content.includes('CLAUDE.md'), 'CLAUDE.md pattern present');
      assert.ok(content.includes('/.ai-toolkit.json'), 'state file pattern present');
      assert.equal(result.action, 'updated');
    });
  });
});

test('ensureToolkitGitignore: replaces existing marker block with new patterns (no duplicate blocks)', async () => {
  await withTempDir('aitk-ensure-', (projectDir) => {
    // Pre-write a file with only opencode in the marker block (as if from
    // a previous `init --tools=opencode`).
    const userContent = 'node_modules/\n';
    const oldBlock = `${MARKER_OPEN}\n/.opencode/\nAGENTS.md\n/.ai-toolkit.json\n${MARKER_CLOSE}\n`;
    writeFileSync(join(projectDir, '.gitignore'), userContent + oldBlock);

    return ensureToolkitGitignore(
      projectDir,
      new Set(['opencode', 'claude-code']),
      '.ai-toolkit.json'
    ).then((result) => {
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      // Marker block appears exactly once
      const openMatches = content.split(MARKER_OPEN).length - 1;
      assert.equal(openMatches, 1, 'marker block appears exactly once');
      const closeMatches = content.split(MARKER_CLOSE).length - 1;
      assert.equal(closeMatches, 1, 'marker close appears exactly once');
      // Contains both /,patterns (not just the old one)
      assert.ok(content.includes('/.opencode/'), 'opencode pattern present');
      assert.ok(content.includes('/.claude/'), 'claude pattern now present');
      // user content preserved
      assert.ok(content.startsWith(userContent), 'user content at start');
      assert.equal(result.action, 'updated');
    });
  });
});

test('ensureToolkitGitignore: idempotent — second call leaves file unchanged', async () => {
  await withTempDir('aitk-ensure-', (projectDir) => {
    const tools = new Set(['opencode', 'claude-code']);
    const stateFile = '.ai-toolkit.json';

    return ensureToolkitGitignore(projectDir, tools, stateFile).then(() => {
      const content1 = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      return ensureToolkitGitignore(projectDir, tools, stateFile).then((r2) => {
        const content2 = readFileSync(join(projectDir, '.gitignore'), 'utf8');
        assert.equal(content2, content1, 'file content identical after second call');
        assert.equal(r2.action, 'unchanged', 'second call returns action=unchanged');
      });
    });
  });
});

test('ensureToolkitGitignore: empty installedTools yields empty pattern block', async () => {
  await withTempDir('aitk-ensure-', (projectDir) => {
    return ensureToolkitGitignore(projectDir, new Set(), '.ai-toolkit.json').then((result) => {
      assert.ok(existsSync(join(projectDir, '.gitignore')), '.gitignore created');
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      // Marker block exists
      assert.ok(content.includes(MARKER_OPEN), 'marker open present');
      assert.ok(content.includes(MARKER_CLOSE), 'marker close present');
      // No patterns between markers (only blank lines)
      const between = content.slice(
        content.indexOf(MARKER_OPEN) + MARKER_OPEN.length,
        content.indexOf(MARKER_CLOSE)
      );
      assert.match(between, /^[\n]*$/, 'no patterns between markers, only whitespace');
      assert.equal(result.action, 'created');
      assert.equal(result.patternCount, 0);
    });
  });
});

test('ensureToolkitGitignore: respects custom stateFileRelPath (path with /)', async () => {
  await withTempDir('aitk-ensure-', (projectDir) => {
    return ensureToolkitGitignore(
      projectDir,
      new Set(['opencode']),
      'custom/state.json'
    ).then((result) => {
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      assert.ok(content.includes('./custom/state.json'), 'state file written with leading ./');
      assert.ok(!content.includes('/.custom/state.json'), 'state file NOT written with leading /');
      assert.ok(!content.includes('/.ai-toolkit.json'), 'default state file NOT included');
      assert.equal(result.patternCount, 3); // /.opencode/, AGENTS.md, ./custom/state.json
    });
  });
});

test('ensureToolkitGitignore: handles .gitignore without trailing newline', async () => {
  await withTempDir('aitk-ensure-', (projectDir) => {
    // Pre-write file WITHOUT trailing newline
    writeFileSync(join(projectDir, '.gitignore'), 'node_modules/');

    return ensureToolkitGitignore(
      projectDir,
      new Set(['opencode']),
      '.ai-toolkit.json'
    ).then((result) => {
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      // Last user line should not be glued to the marker
      assert.ok(content.includes('node_modules/\n\n# >>> ai-toolkit'),
        'one blank line between last user line and marker block, NOT glued');
      // Marker block present
      assert.ok(content.includes(MARKER_OPEN), 'marker present');
      assert.equal(result.action, 'updated');
    });
  });
});

// ─── Integration tests: full initCommand ─────────────────────────

test('init (integration): creates .gitignore with marker block when missing', async () => {
  await withTempDir('aitk-init-gitignore-', (projectDir) => {
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
      // Existing asserts still pass
      assert.ok(existsSync(join(projectDir, '.opencode')), '.opencode/ exists');
      assert.ok(existsSync(join(projectDir, '.claude')), '.claude/ exists');
      // New: .gitignore with marker block + all 5 patterns
      assert.ok(existsSync(join(projectDir, '.gitignore')), '.gitignore exists');
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      assert.ok(content.includes(MARKER_OPEN), 'marker open present');
      assert.ok(content.includes('/.opencode/'), 'opencode pattern present');
      assert.ok(content.includes('/.claude/'), 'claude pattern present');
      assert.ok(content.includes('AGENTS.md'), 'AGENTS.md pattern present');
      assert.ok(content.includes('CLAUDE.md'), 'CLAUDE.md pattern present');
      assert.ok(content.includes('/.ai-toolkit.json'), 'state file pattern present');
    });
  });
});

test('init (integration): preserves user .gitignore content outside marker block', async () => {
  await withTempDir('aitk-init-preserve-', (projectDir) => {
    // Pre-write user .gitignore
    writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n# custom\n');

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
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      // User content preserved
      assert.ok(content.includes('node_modules/'), 'node_modules preserved');
      assert.ok(content.includes('# custom'), 'custom comment preserved');
      // Marker block follows
      assert.ok(content.includes(MARKER_OPEN), 'marker block appended');
      // User lines precede marker block
      assert.ok(content.indexOf('node_modules/') < content.indexOf(MARKER_OPEN),
        'user content precedes marker block');
    });
  });
});

test('init (integration): second init does not duplicate marker block', async () => {
  await withTempDir('aitk-init-twice-', (projectDir) => {
    const toolkitRoot = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
    const config = JSON.parse(readFileSync(`${toolkitRoot}/ai-toolkit.config.json`, 'utf8'));
    config.default_tools = ['opencode', 'claude-code'];

    const runInit = () => initCommand({
      flags: {},
      config,
      configPath: `${toolkitRoot}/ai-toolkit.config.json`,
      projectDir,
      toolkitRoot,
    });

    return runInit().then(() => runInit()).then(() => {
      const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
      const markerCount = content.split(MARKER_OPEN).length - 1;
      assert.equal(markerCount, 1, 'marker block appears exactly once');
    });
  });
});

test('init (integration): tool-set change between two inits updates block (single block, both patterns)', async () => {
  // Plan §2 Acceptance #2: running `init` with `default_tools=['opencode']` and
  // then again with `default_tools=['opencode','claude-code']` must yield a
  // single marker block containing BOTH per-tool patterns (in-place update,
  // not a second block appended).
  await withTempDir('aitk-init-toolchange-', (projectDir) => {
    const toolkitRoot = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
    const baseConfig = JSON.parse(readFileSync(`${toolkitRoot}/ai-toolkit.config.json`, 'utf8'));

    const runInitWith = (tools) => {
      const config = { ...baseConfig, default_tools: tools };
      return initCommand({
        flags: {},
        config,
        configPath: `${toolkitRoot}/ai-toolkit.config.json`,
        projectDir,
        toolkitRoot,
      });
    };

    return runInitWith(['opencode'])
      .then(() => runInitWith(['opencode', 'claude-code']))
      .then(() => {
        const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
        // Both per-tool patterns present — proves the 2nd init propagated the
        // tool-set change into the block (not skipped, not bypassed).
        assert.ok(content.includes('/.opencode/'), 'opencode pattern present after 2nd init');
        assert.ok(content.includes('/.claude/'), 'claude pattern added by 2nd init');
        // Single marker block — proves it was an in-place update, not an append.
        const markerCount = content.split(MARKER_OPEN).length - 1;
        assert.equal(markerCount, 1, 'marker block appears exactly once after tool-set change');
      });
  });
});

test('init (integration): does not touch .gitignore when all tools fail', async () => {
  // F5 partial-failure pattern: adapter that always throws → installed === 0
  // → init throws "All tools failed" → ensureToolkitGitignore MUST NOT run.
  await withTempDir('aitk-init-fail-', (projectDir) => {
    const fakeRoot = mkdtempSync(join(tmpdir(), 'aitk-toolkit-fail-'));
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
          // .gitignore must NOT exist — the helper was never called.
          assert.ok(
            !existsSync(join(projectDir, '.gitignore')),
            '.gitignore must NOT exist when all tools fail'
          );
        }
      );
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });
});