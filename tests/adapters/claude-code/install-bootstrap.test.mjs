// Tests for claude-code adapter's installBootstrap().
//
// installBootstrap({source, target}) renders the /bootstrap skill from
// the canonical source at <source>/prompts/bootstrap/. It produces:
//   - <target>/.claude/skills/bootstrap/SKILL.md    (with frontmatter + conductor body, paths adjusted)
//   - <target>/.claude/skills/bootstrap/01..09.md   (9 supporting files, byte-by-byte copies)
//
// Idempotency: if the bootstrap skill directory already exists, the function
// detects it and aborts (no overwrite, no crash) — re-running is a safe no-op.
//
// Source of truth: source/prompts/bootstrap/ in the toolkit repo.
// These tests read from the real toolkit (not a fixture) because the source
// is the canonical reference; if it changes, the tests document that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOOLKIT_ROOT = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');
const ADAPTER_PATH = '../../../adapters/claude-code/adapter.mjs';

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
  return mkdtemp(join(tmpdir(), 'aitk-bs-cc-'));
}

async function fileExists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

test('claude-code: installBootstrap is exported as a function', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.equal(typeof adapter.installBootstrap, 'function', 'installBootstrap must be exported');
});

test('claude-code: installBootstrap creates .claude/skills/bootstrap/SKILL.md with valid frontmatter', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const skillMdPath = join(tmpDir, '.claude/skills/bootstrap/SKILL.md');
  assert.ok(await fileExists(skillMdPath), 'SKILL.md should exist at .claude/skills/bootstrap/SKILL.md');

  const content = await readFile(skillMdPath, 'utf8');

  // Frontmatter must start with --- and end with --- (parseable as YAML).
  assert.ok(content.startsWith('---\n'), 'SKILL.md should start with YAML frontmatter delimiter');
  assert.ok(content.includes('\n---\n'), 'SKILL.md should have closing YAML frontmatter delimiter');

  // Required fields per the spec.
  assert.match(content, /name: bootstrap/, 'frontmatter must include "name: bootstrap"');
  assert.match(
    content,
    /disable-model-invocation: true/,
    'frontmatter must include "disable-model-invocation: true"'
  );
  assert.match(content, /context: fork/, 'frontmatter must include "context: fork"');
  assert.match(content, /description:/, 'frontmatter must include a "description" field');
});

test('claude-code: installBootstrap rewrites conductor paths to ./0X-...', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const skillMdPath = join(tmpDir, '.claude/skills/bootstrap/SKILL.md');
  const content = await readFile(skillMdPath, 'utf8');

  // Body must NOT contain the raw source path.
  assert.ok(
    !content.includes('source/prompts/bootstrap/'),
    'SKILL.md body must not contain raw "source/prompts/bootstrap/" paths'
  );

  // Body must contain rewritten paths of the form ./0X-<name>.md for all 9 supporting files.
  for (const name of SUPPORTING_FILES) {
    assert.ok(
      content.includes(`./${name}`),
      `SKILL.md body must reference "./${name}" after path rewriting`
    );
  }
});

test('claude-code: installBootstrap copies all 9 supporting files byte-by-byte', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const baseDir = join(tmpDir, '.claude/skills/bootstrap');
  for (const name of SUPPORTING_FILES) {
    const dst = join(baseDir, name);
    assert.ok(await fileExists(dst), `supporting file ${name} should exist at ${dst}`);

    // Byte-by-byte copy: contents must match the source exactly.
    const dstContent = await readFile(dst, 'utf8');
    const srcContent = await readFile(join(TOOLKIT_SOURCE, 'prompts/bootstrap', name), 'utf8');
    assert.equal(dstContent, srcContent, `${name} must be a byte-by-byte copy of the source`);
  }
});

test('claude-code: installBootstrap is idempotent (second call detects existing, no crash)', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  // First install: should create everything.
  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const skillMdPath = join(tmpDir, '.claude/skills/bootstrap/SKILL.md');
  const firstContent = await readFile(skillMdPath, 'utf8');
  const firstMtime = (await lstat(skillMdPath)).mtimeMs;

  // Second install: should NOT throw and should NOT overwrite (idempotency).
  await assert.doesNotReject(
    adapter.installBootstrap({
      source: TOOLKIT_SOURCE,
      target: tmpDir,
    }),
    'second installBootstrap call must not throw'
  );

  // Verify file is unchanged after second call.
  assert.ok(await fileExists(skillMdPath), 'SKILL.md still exists after second call');
  const secondContent = await readFile(skillMdPath, 'utf8');
  assert.equal(secondContent, firstContent, 'SKILL.md content unchanged after idempotent re-run');
  const secondMtime = (await lstat(skillMdPath)).mtimeMs;
  assert.equal(secondMtime, firstMtime, 'SKILL.md mtime unchanged (not rewritten)');
});
