// Tests for opencode adapter's installBootstrap().
//
// installBootstrap({source, target}) renders the /bootstrap command from
// the canonical source at <source>/prompts/bootstrap/. It produces:
//   - <target>/.opencode/commands/bootstrap.md                          (with frontmatter + conductor body, paths adjusted to @0X-...)
//   - <target>/.opencode/commands/bootstrap/01..09.md                   (9 supporting files, byte-by-byte copies)
//
// Idempotency: if the bootstrap command directory already exists, the function
// detects it and aborts (no overwrite, no crash) — re-running is a safe no-op.
//
// Source of truth: source/prompts/bootstrap/ in the toolkit repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOOLKIT_ROOT = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');
const ADAPTER_PATH = '../../../adapters/opencode/adapter.mjs';

const SUPPORTING_FILES = [
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

async function mkTmp() {
  return mkdtemp(join(tmpdir(), 'aitk-bs-oc-'));
}

async function fileExists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

test('opencode: installBootstrap is exported as a function', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.equal(typeof adapter.installBootstrap, 'function', 'installBootstrap must be exported');
});

test('opencode: installBootstrap creates .opencode/commands/bootstrap.md with valid frontmatter', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const commandMdPath = join(tmpDir, '.opencode/commands/bootstrap.md');
  assert.ok(
    await fileExists(commandMdPath),
    'command file should exist at .opencode/commands/bootstrap.md'
  );

  const content = await readFile(commandMdPath, 'utf8');

  // Frontmatter must start with --- and end with --- (parseable as YAML).
  assert.ok(content.startsWith('---\n'), 'command file should start with YAML frontmatter delimiter');
  assert.ok(content.includes('\n---\n'), 'command file should have closing YAML frontmatter delimiter');

  // Required fields per the spec.
  assert.match(content, /subtask: false/, 'frontmatter must include "subtask: false"');
  assert.match(content, /description:/, 'frontmatter must include a "description" field');
});

test('opencode: installBootstrap rewrites conductor paths to @0X-...', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const commandMdPath = join(tmpDir, '.opencode/commands/bootstrap.md');
  const content = await readFile(commandMdPath, 'utf8');

  // Body must NOT contain the raw source path.
  assert.ok(
    !content.includes('source/prompts/bootstrap/'),
    'command body must not contain raw "source/prompts/bootstrap/" paths'
  );

  // Body must contain rewritten paths of the form @0X-<name>.md for all 9 supporting files.
  for (const name of SUPPORTING_FILES) {
    assert.ok(
      content.includes(`@${name}`),
      `command body must reference "@${name}" after path rewriting`
    );
  }
});

test('opencode: installBootstrap copies all 9 supporting files byte-by-byte to .opencode/commands/bootstrap/', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const baseDir = join(tmpDir, '.opencode/commands/bootstrap');
  for (const name of SUPPORTING_FILES) {
    const dst = join(baseDir, name);
    assert.ok(await fileExists(dst), `supporting file ${name} should exist at ${dst}`);

    // Byte-by-byte copy: contents must match the source exactly.
    const dstContent = await readFile(dst, 'utf8');
    const srcContent = await readFile(join(TOOLKIT_SOURCE, 'prompts/bootstrap', name), 'utf8');
    assert.equal(dstContent, srcContent, `${name} must be a byte-by-byte copy of the source`);
  }
});

test('opencode: installBootstrap is idempotent (second call detects existing, no crash)', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  // First install: should create everything.
  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const commandMdPath = join(tmpDir, '.opencode/commands/bootstrap.md');
  const firstContent = await readFile(commandMdPath, 'utf8');
  const firstMtime = (await lstat(commandMdPath)).mtimeMs;

  // Second install: should NOT throw and should NOT overwrite (idempotency).
  await assert.doesNotReject(
    adapter.installBootstrap({
      source: TOOLKIT_SOURCE,
      target: tmpDir,
    }),
    'second installBootstrap call must not throw'
  );

  // Verify file is unchanged after second call.
  assert.ok(await fileExists(commandMdPath), 'command file still exists after second call');
  const secondContent = await readFile(commandMdPath, 'utf8');
  assert.equal(secondContent, firstContent, 'command file content unchanged after idempotent re-run');
  const secondMtime = (await lstat(commandMdPath)).mtimeMs;
  assert.equal(secondMtime, firstMtime, 'command file mtime unchanged (not rewritten)');
});

// ─── uninstallBootstrap ─────────────────────────────────────────────────
//
// uninstallBootstrap({target}) removes the OpenCode /bootstrap command
// artifacts: `.opencode/commands/bootstrap.md` + `.opencode/commands/bootstrap/`
// (supporting files). It is invoked by adapter.remove() so `ai-toolkit remove`
// cleans up the bootstrap command (preventing orphaned files after removal).
//
// Idempotent: returns {removed: false} when neither artifact exists, so it's
// safe to call even when installBootstrap was never run. Robust to orphan
// states (one of the two artifacts deleted independently — should still clean
// up the surviving one).

import { mkdirSync, writeFileSync } from 'node:fs';

test('opencode: uninstallBootstrap is exported as a function', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.equal(typeof adapter.uninstallBootstrap, 'function', 'uninstallBootstrap must be exported');
});

test('opencode: uninstallBootstrap removes bootstrap.md and bootstrap/ subdir', async () => {
  // Setup: create both artifacts manually (faster than a real
  // installBootstrap round-trip; isolates uninstallBootstrap from
  // installBootstrap so a regression in either surfaces independently).
  const tmpDir = await mkTmp();
  const commandFile = join(tmpDir, '.opencode/commands/bootstrap.md');
  const supportDir = join(tmpDir, '.opencode/commands/bootstrap');
  mkdirSync(supportDir, { recursive: true });
  writeFileSync(commandFile, '# dummy');
  writeFileSync(join(supportDir, '01-pre-flight.md'), '# dummy');
  assert.ok(await fileExists(commandFile), 'pre: bootstrap.md exists');
  assert.ok(await fileExists(supportDir), 'pre: bootstrap/ subdir exists');

  const adapter = await import(ADAPTER_PATH);
  const result = await adapter.uninstallBootstrap({ target: tmpDir });

  assert.equal(result.removed, true, 'returns {removed: true} when artifacts existed');
  assert.equal(await fileExists(commandFile), false, 'bootstrap.md removed');
  assert.equal(await fileExists(supportDir), false, 'bootstrap/ subdir removed');
});

test('opencode: uninstallBootstrap handles orphan state (only one artifact present)', async () => {
  // Setup: only the command file exists, subdir is absent (e.g. someone
  // deleted the subdir manually). uninstallBootstrap must still clean up
  // the surviving artifact without throwing.
  const tmpDir = await mkTmp();
  const commandFile = join(tmpDir, '.opencode/commands/bootstrap.md');
  mkdirSync(join(tmpDir, '.opencode/commands'), { recursive: true });
  writeFileSync(commandFile, '# orphan command');
  assert.ok(await fileExists(commandFile), 'pre: bootstrap.md exists');
  assert.equal(
    await fileExists(join(tmpDir, '.opencode/commands/bootstrap')),
    false,
    'pre: bootstrap/ subdir absent (orphan state)'
  );

  const adapter = await import(ADAPTER_PATH);
  const result = await adapter.uninstallBootstrap({ target: tmpDir });

  assert.equal(result.removed, true, 'returns {removed: true} when command file exists');
  assert.equal(await fileExists(commandFile), false, 'orphan bootstrap.md removed');
});
