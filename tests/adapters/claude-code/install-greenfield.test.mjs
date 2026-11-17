// Tests for claude-code adapter's installGreenfield().
//
// installGreenfield({source, target}) renders the /greenfield skill from
// the canonical source at <source>/prompts/greenfield/. It produces:
//   - <target>/.claude/skills/greenfield/SKILL.md        (frontmatter + conductor body, paths adjusted)
//   - <target>/.claude/skills/greenfield/01..09.md       (9 supporting files, byte-by-byte copies)
//   - <target>/.claude/skills/greenfield/defaults/*.md   (11 catalog assets, byte-by-byte copies)
//
// Idempotency: if the greenfield skill directory already exists, the
// function detects it and aborts (no overwrite, no crash).
//
// Source of truth: source/prompts/greenfield/ in the toolkit repo.
// These tests read from the real toolkit (not a fixture) because the
// source is the canonical reference; if it changes, the tests document it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOOTSTRAP_SUPPORTING_FILES } from '../../../adapters/_shared/bootstrap-renderer.mjs';

const TOOLKIT_ROOT = join(import.meta.dirname, '../../..');
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');
const ADAPTER_PATH = '../../../adapters/claude-code/adapter.mjs';

const SUPPORTING_FILES = [
  '01-pre-flight.md',
  '02-interview.md',
  '03-standards.md',
  '04-stack.md',
  '05-architecture.md',
  '06-code-style.md',
  '07-conventions.md',
  '08-agents-md.md',
  '09-prune.md',
];

const ASSET_FILES = [
  'defaults/_baseline.md',
  'defaults/node-typescript.md',
  'defaults/python.md',
  'defaults/react-native.md',
  'defaults/react.md',
  'defaults/nextjs.md',
  'defaults/express.md',
  'defaults/fastapi.md',
  'defaults/php.md',
  'defaults/android.md',
  'defaults/ios.md',
];

async function mkTmp() {
  return mkdtemp(join(tmpdir(), 'aitk-gf-cc-'));
}

async function fileExists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

test('claude-code: installGreenfield is exported as a function', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.equal(typeof adapter.installGreenfield, 'function', 'installGreenfield must be exported');
});

test('claude-code: installGreenfield creates .claude/skills/greenfield/SKILL.md with valid frontmatter', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const skillMdPath = join(tmpDir, '.claude/skills/greenfield/SKILL.md');
  assert.ok(
    await fileExists(skillMdPath),
    'SKILL.md should exist at .claude/skills/greenfield/SKILL.md'
  );

  const content = await readFile(skillMdPath, 'utf8');

  assert.ok(content.startsWith('---\n'), 'SKILL.md should start with YAML frontmatter delimiter');
  assert.ok(content.includes('\n---\n'), 'SKILL.md should have closing YAML frontmatter delimiter');

  assert.match(content, /name: greenfield/, 'frontmatter must include "name: greenfield"');
  assert.match(
    content,
    /disable-model-invocation: true/,
    'frontmatter must include "disable-model-invocation: true"'
  );
  assert.match(content, /description:/, 'frontmatter must include a "description" field');
  assert.doesNotMatch(content, /context: fork/,
    'the greenfield skill must NOT declare "context: fork" (the interview needs the human channel)');
});

test('claude-code: installGreenfield rewrites conductor paths to ./0X-... and ./defaults/...', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const skillMdPath = join(tmpDir, '.claude/skills/greenfield/SKILL.md');
  const content = await readFile(skillMdPath, 'utf8');

  assert.ok(
    !content.includes('source/prompts/'),
    'SKILL.md body must not contain raw "source/prompts/" paths'
  );

  for (const name of SUPPORTING_FILES) {
    assert.ok(
      content.includes(`./${name}`),
      `SKILL.md body must reference "./${name}" after path rewriting`
    );
  }
  assert.ok(
    content.includes('./defaults/_baseline.md'),
    'SKILL.md body must reference "./defaults/_baseline.md" after path rewriting'
  );
});

test('claude-code: the installed greenfield body references every catalog file with ./defaults/', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const content = await readFile(join(tmpDir, '.claude/skills/greenfield/SKILL.md'), 'utf8');

  assert.ok(
    !content.includes('@defaults/'),
    'the installed SKILL.md body must not contain an "@defaults/" path — Claude Code references its sibling files with "./"'
  );
  assert.ok(
    content.includes('./defaults/<stack>.md'),
    'the installed SKILL.md body must keep the "<stack>" placeholder, in the "./defaults/" form'
  );
  assert.ok(
    content.includes('./defaults/node-typescript.md'),
    'the installed SKILL.md body must keep the literal catalog example, in the "./defaults/" form'
  );
});

test('claude-code: installGreenfield copies the 9 supporting files and the 11 assets byte-by-byte', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const baseDir = join(tmpDir, '.claude/skills/greenfield');

  for (const name of SUPPORTING_FILES) {
    const dst = join(baseDir, name);
    assert.ok(await fileExists(dst), `supporting file ${name} should exist at ${dst}`);

    const dstContent = await readFile(dst, 'utf8');
    const srcContent = await readFile(join(TOOLKIT_SOURCE, 'prompts/greenfield', name), 'utf8');
    assert.equal(dstContent, srcContent, `${name} must be a byte-by-byte copy of the source`);
  }

  for (const name of ASSET_FILES) {
    const dst = join(baseDir, name);
    assert.ok(await fileExists(dst), `asset ${name} should exist at ${dst}`);

    const dstContent = await readFile(dst, 'utf8');
    const srcContent = await readFile(join(TOOLKIT_SOURCE, 'prompts/greenfield', name), 'utf8');
    assert.equal(dstContent, srcContent, `${name} must be a byte-by-byte copy of the source`);
  }
});

test('claude-code: every pack-file reference in the installed greenfield tree uses the ./ syntax', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const baseDir = join(tmpDir, '.claude/skills/greenfield');
  const installed = [
    join(baseDir, 'SKILL.md'),
    ...SUPPORTING_FILES.map((name) => join(baseDir, name)),
  ];

  for (const path of installed) {
    const content = await readFile(path, 'utf8');
    assert.ok(!content.includes('@defaults/'),
      `${path} must not reference a catalog with the "@defaults/" form`);
    assert.doesNotMatch(content, /@0[0-9]-[A-Za-z0-9-]*\.md/,
      `${path} must not reference a sibling prompt with the "@0N-..." form`);
  }
});

test('claude-code: the installed 02-interview.md keeps the catalog placeholder and the standards reference in the ./ syntax', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const content = await readFile(
    join(tmpDir, '.claude/skills/greenfield/02-interview.md'), 'utf8');

  assert.ok(content.includes('./defaults/<stack>.md'),
    'the catalog placeholder must survive, in the "./defaults/" form');
  assert.ok(content.includes('./03-standards.md'),
    'the reference to the standards prompt must survive, in the "./" form');
});

test('claude-code: the greenfield path rewrite never produces a doubled relative prefix', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const baseDir = join(tmpDir, '.claude/skills/greenfield');
  const installed = [
    join(baseDir, 'SKILL.md'),
    ...SUPPORTING_FILES.map((name) => join(baseDir, name)),
  ];

  for (const path of installed) {
    const content = await readFile(path, 'utf8');
    assert.ok(!content.includes('././'), `${path} must not contain a doubled "./" prefix`);
    // Only pack-file references carry the tool prefix — an unrelated "@"
    // (e.g. "@context-interviewer") must stay untouched.
    assert.ok(!/@(?:defaults\/|0[0-9]-)/.test(content),
      `${path} must not reference a pack file with the "@" prefix`);
  }
});

test('claude-code: installGreenfield is idempotent (second call detects existing, no crash)', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const skillMdPath = join(tmpDir, '.claude/skills/greenfield/SKILL.md');
  const firstContent = await readFile(skillMdPath, 'utf8');
  const firstMtime = (await lstat(skillMdPath)).mtimeMs;

  await assert.doesNotReject(
    adapter.installGreenfield({
      source: TOOLKIT_SOURCE,
      target: tmpDir,
    }),
    'second installGreenfield call must not throw'
  );

  assert.ok(await fileExists(skillMdPath), 'SKILL.md still exists after second call');
  const secondContent = await readFile(skillMdPath, 'utf8');
  assert.equal(secondContent, firstContent, 'SKILL.md content unchanged after idempotent re-run');
  const secondMtime = (await lstat(skillMdPath)).mtimeMs;
  assert.equal(secondMtime, firstMtime, 'SKILL.md mtime unchanged (not rewritten)');
});

test('claude-code: installGreenfield with force:true wipes the skill dir and recreates it', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  // Plant a stale file that must not survive the forced reinstall.
  const stalePath = join(tmpDir, '.claude/skills/greenfield/stale.md');
  await writeFile(stalePath, '# stale');

  await adapter.installGreenfield(
    { source: TOOLKIT_SOURCE, target: tmpDir },
    { force: true }
  );

  assert.equal(await fileExists(stalePath), false,
    'force:true must wipe the greenfield dir before recreating it');
  assert.ok(
    await fileExists(join(tmpDir, '.claude/skills/greenfield/SKILL.md')),
    'force:true must recreate SKILL.md'
  );
  assert.ok(
    await fileExists(join(tmpDir, '.claude/skills/greenfield/defaults/_baseline.md')),
    'force:true must recreate the catalog assets'
  );
});

test('claude-code: installGreenfield leaves the bootstrap skill untouched', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });
  const bootstrapSkill = join(tmpDir, '.claude/skills/bootstrap/SKILL.md');
  const bootstrapContent = await readFile(bootstrapSkill, 'utf8');

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  assert.ok(await fileExists(bootstrapSkill),
    'installGreenfield must not remove the bootstrap skill');
  assert.equal(await readFile(bootstrapSkill, 'utf8'), bootstrapContent,
    'installGreenfield must not modify the bootstrap skill');
});

test('claude-code: the bootstrap install stays byte-for-byte identical when the greenfield pack is installed', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const bootstrapPaths = [
    join(tmpDir, '.claude/skills/bootstrap/SKILL.md'),
    ...BOOTSTRAP_SUPPORTING_FILES.map((name) => join(tmpDir, '.claude/skills/bootstrap', name)),
  ];
  const before = new Map();
  for (const path of bootstrapPaths) {
    before.set(path, await readFile(path, 'utf8'));
  }

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  for (const path of bootstrapPaths) {
    assert.equal(await readFile(path, 'utf8'), before.get(path),
      `installGreenfield must leave ${path} byte-for-byte identical`);
  }
});

test('claude-code: uninstallGreenfield is exported as a function', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.equal(typeof adapter.uninstallGreenfield, 'function', 'uninstallGreenfield must be exported');
});

test('claude-code: uninstallGreenfield removes the greenfield skill dir', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });
  const greenfieldDir = join(tmpDir, '.claude/skills/greenfield');
  assert.ok(await fileExists(greenfieldDir), 'pre: greenfield dir exists');

  const result = await adapter.uninstallGreenfield({ target: tmpDir });

  assert.equal(result.removed, true, 'returns {removed: true} when the dir existed');
  assert.equal(await fileExists(greenfieldDir), false, 'greenfield dir removed');
});

test('claude-code: uninstallGreenfield is idempotent (skip when not present)', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);
  const result = await adapter.uninstallGreenfield({ target: tmpDir });

  assert.equal(result.removed, false, 'returns {removed: false} when the dir does not exist');
});

test('claude-code: a provenance marker never carries a tool prefix', async () => {
  // A `[default: …]` marker is DATA: it is copied verbatim into the
  // generated `.context/` files, where a path prefix would name a path
  // that does not exist.
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const installed = join(tmpDir, '.claude/skills/greenfield');
  const files = [
    join(installed, '04-stack.md'),
    join(installed, '05-architecture.md'),
    join(installed, '06-code-style.md'),
    join(installed, '07-conventions.md'),
    join(installed, '08-agents-md.md'),
  ];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const markers = content.match(/\[default:[^\]]*\]/g) ?? [];
    for (const marker of markers) {
      assert.ok(!marker.includes('./'),
        `${file}: the marker "${marker}" must not carry a relative prefix — ` +
        'a marker records a neutral relative path');
    }
  }
});

test('claude-code: a partial install (the directory without SKILL.md) is completed', async () => {
  // The directory alone is not an install: a leftover directory must not
  // make the skill disappear.
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await mkdir(join(tmpDir, '.claude/skills/greenfield'), { recursive: true });

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const skillPath = join(tmpDir, '.claude/skills/greenfield/SKILL.md');
  assert.ok(await fileExists(skillPath),
    'the skill must be installed when the directory existed without SKILL.md');
  const content = await readFile(skillPath, 'utf8');
  assert.match(content, /name: greenfield/, 'the installed skill must be the toolkit\'s');
});

test('claude-code: a user file inside the skill directory is not overwritten', async () => {
  // The skill directory is the user's directory too. A file that is there
  // and differs from the toolkit's version must be left alone and
  // reported, not replaced.
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  const dir = join(tmpDir, '.claude/skills/greenfield');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '05-architecture.md'), 'MY PRECIOUS USER CONTENT\n');

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const content = await readFile(join(dir, '05-architecture.md'), 'utf8');
  assert.equal(content, 'MY PRECIOUS USER CONTENT\n',
    'the user\'s file must survive the install');
});

test('claude-code: an EDITED toolkit skill is not silently overwritten', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });
  const skillPath = join(tmpDir, '.claude/skills/greenfield/SKILL.md');
  await writeFile(skillPath, 'EDITED BY THE USER\n');

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const content = await readFile(skillPath, 'utf8');
  assert.equal(content, 'EDITED BY THE USER\n',
    'the user\'s edit must survive `init`');
});
