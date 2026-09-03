// Tests for the path-traversal / sanitization hardening in remove.mjs.
//
// BEFORE PHASE 0:
//   ai-toolkit remove skills ..
//     → resolved to <projectDir>/.claude/skills/..
//     → rm -rf of parent directory.
//
// AFTER PHASE 0:
//   ai-toolkit remove skills ..
//     → throw Error("Invalid skills name '..'") before any rm().

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { removeCommand } from '../bin/commands/remove.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALID_CONFIG = {
  source: './source',
  default_tools: ['opencode', 'claude-code'],
  tools: {
    opencode: { enabled: true },
    'claude-code': { enabled: true },
  },
};

/**
 * Build a project that has both tools installed with safe resources, then
 * put a sentinel sibling directory outside the project to confirm removal
 * never escapes the project boundary.
 */
async function makeProjectWithSentinel() {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-remove-safety-'));
  await mkdir(join(dir, '.opencode/agents'), { recursive: true });
  await mkdir(join(dir, '.opencode/skills/coder'), { recursive: true });
  await mkdir(join(dir, '.claude/agents'), { recursive: true });
  await mkdir(join(dir, '.claude/skills/coder'), { recursive: true });

  // Sentinel: a sibling directory we MUST NOT touch.
  const parent = dirname(dir);
  const sentinelName = `SENTINEL-${dir.split('/').pop()}`;
  const sentinelDir = join(parent, sentinelName);
  await mkdir(sentinelDir, { recursive: true });
  await writeFile(join(sentinelDir, 'DO_NOT_TOUCH.txt'), 'sentinel');

  await writeFile(join(dir, '.opencode/agents/coder.md'), 'coder body');
  await writeFile(join(dir, '.claude/agents/coder.md'), 'coder body');
  await writeFile(join(dir, '.opencode/skills/coder/SKILL.md'), 'skill');
  await writeFile(join(dir, '.claude/skills/coder/SKILL.md'), 'skill');
  await writeFile(
    join(dir, '.ai-toolkit.json'),
    JSON.stringify({
      version: '1.0.0',
      tools: {
        opencode: {
          agents: { coder: { installed_at: '2026-01-01' } },
          skills: { coder: { installed_at: '2026-01-01' } },
        },
        'claude-code': {
          agents: { coder: { installed_at: '2026-01-01' } },
          skills: { coder: { installed_at: '2026-01-01' } },
        },
      },
    })
  );

  return { dir, sentinelDir };
}

async function callRemove(dir, args, flags = { yes: true }) {
  try {
    await removeCommand({
      flags,
      config: VALID_CONFIG,
      configPath: 'fake',
      projectDir: dir,
      toolkitRoot: '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit',
      args,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── REGRESSION: path traversal must be REJECTED ─────────

test('remove: rejects name=".." (parent of project)', async () => {
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    const result = await callRemove(dir, ['skills', '..']);
    assert.equal(result.ok, false, 'should throw');
    assert.match(result.error, /Invalid skills name/i);
    // The sentinel directory MUST still exist (not deleted).
    assert.ok(existsSync(sentinelDir), 'sibling directory must NOT be touched');
    assert.ok(existsSync(join(sentinelDir, 'DO_NOT_TOUCH.txt')), 'sentinel file must remain');
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});

test('remove: rejects name="../foo"', async () => {
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    const result = await callRemove(dir, ['agents', '../foo']);
    assert.equal(result.ok, false);
    assert.match(result.error, /Invalid agents name/i);
    assert.ok(existsSync(sentinelDir));
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});

test('remove: rejects name with shell metacharacters', async () => {
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    const result = await callRemove(dir, ['skills', 'foo;rm -rf /']);
    assert.equal(result.ok, false);
    assert.match(result.error, /Invalid skills name/i);
    assert.ok(existsSync(sentinelDir));
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});

test('remove: rejects name starting with "."', async () => {
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    const result = await callRemove(dir, ['agents', '.hidden']);
    assert.equal(result.ok, false);
    assert.match(result.error, /Invalid agents name/i);
    assert.ok(existsSync(sentinelDir));
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});

test('remove: args ["agents", ""] falls through to mode 2 (remove all of type)', async () => {
  // Empty-name falls through to removeByScope(typeFilter='agents'), which is
  // the existing behavior; the safety guard is for traversal patterns in
  // non-empty names, not for "user typed nothing". This test pins the routing.
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    const result = await callRemove(dir, ['agents', '']);
    assert.equal(result.ok, true);
    // Sentinel still untouched.
    assert.ok(existsSync(sentinelDir));
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});

test('remove: rejects name with path separator', async () => {
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    const result = await callRemove(dir, ['skills', 'foo/bar']);
    assert.equal(result.ok, false);
    // The slash-foo name fails the regex.
    assert.match(result.error, /Invalid skills name/i);
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});

// ─── Sanity: legitimate names still work ────────────────

test('remove: legitimate name "coder" still removes cleanly', async () => {
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    const result = await callRemove(dir, ['agents', 'coder']);
    assert.equal(result.ok, true, 'should succeed for legitimate name');
    // Sentinel must still exist.
    assert.ok(existsSync(sentinelDir));
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});

test('remove: legitimate name with underscore and digit', async () => {
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    const result = await callRemove(dir, ['agents', 'agent_v2']);
    // It may legitimately NOT be installed (state doesn't list agent_v2),
    // but it must NOT crash and must NOT touch the sentinel.
    assert.equal(result.ok, true);
    assert.ok(existsSync(sentinelDir));
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});

// ─── Edge: --tools without value uses config.default ─────

test('remove: --tools without value (now flags.tools=false) falls back to config', async () => {
  const { dir, sentinelDir } = await makeProjectWithSentinel();
  try {
    // flags.tools === false is the new contract: user typed --tools alone.
    // The command must interpret this as "fall back to config" — NOT crash
    // trying flags.tools.split(','), and NOT pass it as a tool name.
    const result = await callRemove(dir, ['agents', 'coder'], { tools: false, yes: true });
    // Must not crash.
    assert.equal(result.ok, true);
  } finally {
    await rm(dir, { recursive: true });
    await rm(sentinelDir, { recursive: true });
  }
});
