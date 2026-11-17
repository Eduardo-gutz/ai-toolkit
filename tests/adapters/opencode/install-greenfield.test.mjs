// Tests for opencode adapter's installGreenfield().
//
// installGreenfield({source, target}) renders the /greenfield command from
// the canonical source at <source>/prompts/greenfield/. It produces:
//   - <target>/.opencode/commands/greenfield.md                (frontmatter + conductor body, paths adjusted)
//   - <target>/.opencode/commands/greenfield/01..09.md         (9 supporting files, byte-by-byte copies)
//   - <target>/.opencode/commands/greenfield/defaults/*.md     (11 catalog assets, byte-by-byte copies)
//
// Idempotency: if the greenfield command directory already exists, the
// function detects it and aborts (no overwrite, no crash).
//
// Source of truth: source/prompts/greenfield/ in the toolkit repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOOTSTRAP_SUPPORTING_FILES } from '../../../adapters/_shared/bootstrap-renderer.mjs';

const TOOLKIT_ROOT = join(import.meta.dirname, '../../..');
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');
const ADAPTER_PATH = '../../../adapters/opencode/adapter.mjs';

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

// A pack-file reference in the canonical (tool-neutral) source form:
// `./defaults/<stack>.md` or `./03-standards.md`. The adapters rewrite it
// to the tool's native syntax; a supporting file that carries none stays
// a byte-by-byte copy of the source.
const PACK_REFERENCE = /\.\/(?:defaults\/[^`\s]*\.md|0[0-9]-[^`\s]*\.md)/;

async function mkTmp() {
  return mkdtemp(join(tmpdir(), 'aitk-gf-oc-'));
}

async function fileExists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

test('opencode: installGreenfield is exported as a function', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.equal(typeof adapter.installGreenfield, 'function', 'installGreenfield must be exported');
});

test('opencode: installGreenfield creates .opencode/commands/greenfield.md with valid frontmatter', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const commandMdPath = join(tmpDir, '.opencode/commands/greenfield.md');
  assert.ok(
    await fileExists(commandMdPath),
    'command file should exist at .opencode/commands/greenfield.md'
  );

  const content = await readFile(commandMdPath, 'utf8');

  assert.ok(content.startsWith('---\n'), 'command file should start with YAML frontmatter delimiter');
  assert.ok(content.includes('\n---\n'), 'command file should have closing YAML frontmatter delimiter');

  assert.match(content, /subtask: false/, 'frontmatter must include "subtask: false"');
  assert.match(content, /description:/, 'frontmatter must include a "description" field');
  assert.doesNotMatch(content, /context: fork/,
    'the greenfield command must not declare "context: fork"');
});

test('opencode: installGreenfield rewrites conductor paths to @0X-... and @defaults/...', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const commandMdPath = join(tmpDir, '.opencode/commands/greenfield.md');
  const content = await readFile(commandMdPath, 'utf8');

  assert.ok(
    !content.includes('source/prompts/'),
    'command body must not contain raw "source/prompts/" paths'
  );

  for (const name of SUPPORTING_FILES) {
    assert.ok(
      content.includes(`@${name}`),
      `command body must reference "@${name}" after path rewriting`
    );
  }
  assert.ok(
    content.includes('@defaults/_baseline.md'),
    'command body must reference "@defaults/_baseline.md" after path rewriting'
  );
});

test('opencode: the installed greenfield body references every catalog file with @defaults/', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const content = await readFile(join(tmpDir, '.opencode/commands/greenfield.md'), 'utf8');

  assert.ok(
    !content.includes('./defaults/'),
    'the installed command body must not contain a bare "./defaults/" path — OpenCode references its files with "@"'
  );
  assert.ok(
    content.includes('@defaults/<stack>.md'),
    'the installed command body must keep the "<stack>" placeholder, in the "@defaults/" form'
  );
  assert.ok(
    content.includes('@defaults/node-typescript.md'),
    'the installed command body must keep the literal catalog example, in the "@defaults/" form'
  );
});

test('opencode: installGreenfield installs the 9 supporting files and copies the 11 assets byte-by-byte', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const baseDir = join(tmpDir, '.opencode/commands/greenfield');

  for (const name of SUPPORTING_FILES) {
    const dst = join(baseDir, name);
    assert.ok(await fileExists(dst), `supporting file ${name} should exist at ${dst}`);

    const dstContent = await readFile(dst, 'utf8');
    const srcContent = await readFile(join(TOOLKIT_SOURCE, 'prompts/greenfield', name), 'utf8');

    // A supporting file that carries no pack-file reference is copied
    // byte-by-byte. One that does carries the tool-native reference
    // syntax instead — asserted by the path-rewrite tests below.
    if (!PACK_REFERENCE.test(srcContent)) {
      assert.equal(dstContent, srcContent,
        `${name} carries no pack-file reference — it must be a byte-by-byte copy of the source`);
    }
  }

  for (const name of ASSET_FILES) {
    const dst = join(baseDir, name);
    assert.ok(await fileExists(dst), `asset ${name} should exist at ${dst}`);

    const dstContent = await readFile(dst, 'utf8');
    const srcContent = await readFile(join(TOOLKIT_SOURCE, 'prompts/greenfield', name), 'utf8');
    assert.equal(dstContent, srcContent, `${name} must be a byte-by-byte copy of the source`);
  }
});

test('opencode: every pack-file reference in the installed greenfield tree uses the @ syntax', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const baseDir = join(tmpDir, '.opencode/commands/greenfield');
  const installed = [
    join(tmpDir, '.opencode/commands/greenfield.md'),
    ...SUPPORTING_FILES.map((name) => join(baseDir, name)),
  ];

  for (const path of installed) {
    const content = await readFile(path, 'utf8');
    assert.ok(!content.includes('./defaults/'),
      `${path} must not reference a catalog with the "./defaults/" form`);
    assert.doesNotMatch(content, /\.\/0[0-9]-[A-Za-z0-9-]*\.md/,
      `${path} must not reference a sibling prompt with the "./0N-..." form`);
  }
});

test('opencode: the installed 02-interview.md keeps the catalog placeholder and the standards reference in the @ syntax', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const content = await readFile(
    join(tmpDir, '.opencode/commands/greenfield/02-interview.md'), 'utf8');

  assert.ok(content.includes('@defaults/<stack>.md'),
    'the catalog placeholder must survive, in the "@defaults/" form');
  assert.ok(content.includes('@03-standards.md'),
    'the reference to the standards prompt must survive, in the "@" form');
});

test('opencode: the greenfield path rewrite never produces a double or mixed prefix', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const baseDir = join(tmpDir, '.opencode/commands/greenfield');
  const installed = [
    join(tmpDir, '.opencode/commands/greenfield.md'),
    ...SUPPORTING_FILES.map((name) => join(baseDir, name)),
  ];

  for (const path of installed) {
    const content = await readFile(path, 'utf8');
    assert.ok(!content.includes('@@'), `${path} must not contain a double "@" prefix`);
    assert.ok(!content.includes('@./'), `${path} must not contain a mixed "@./" prefix`);
  }
});

test('opencode: installGreenfield is idempotent (second call detects existing, no crash)', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const commandMdPath = join(tmpDir, '.opencode/commands/greenfield.md');
  const firstContent = await readFile(commandMdPath, 'utf8');
  const firstMtime = (await lstat(commandMdPath)).mtimeMs;

  await assert.doesNotReject(
    adapter.installGreenfield({
      source: TOOLKIT_SOURCE,
      target: tmpDir,
    }),
    'second installGreenfield call must not throw'
  );

  assert.ok(await fileExists(commandMdPath), 'command file still exists after second call');
  const secondContent = await readFile(commandMdPath, 'utf8');
  assert.equal(secondContent, firstContent, 'command file content unchanged after idempotent re-run');
  const secondMtime = (await lstat(commandMdPath)).mtimeMs;
  assert.equal(secondMtime, firstMtime, 'command file mtime unchanged (not rewritten)');
});

test('opencode: installGreenfield with force:true wipes the artifacts and recreates them', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  // Plant a stale file that must not survive the forced reinstall.
  const stalePath = join(tmpDir, '.opencode/commands/greenfield/stale.md');
  await writeFile(stalePath, '# stale');

  await adapter.installGreenfield(
    { source: TOOLKIT_SOURCE, target: tmpDir },
    { force: true }
  );

  assert.equal(await fileExists(stalePath), false,
    'force:true must wipe the greenfield dir before recreating it');
  assert.ok(
    await fileExists(join(tmpDir, '.opencode/commands/greenfield.md')),
    'force:true must recreate greenfield.md'
  );
  assert.ok(
    await fileExists(join(tmpDir, '.opencode/commands/greenfield/defaults/_baseline.md')),
    'force:true must recreate the catalog assets'
  );
});

test('opencode: installGreenfield leaves the bootstrap command untouched', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });
  const bootstrapCommand = join(tmpDir, '.opencode/commands/bootstrap.md');
  const bootstrapContent = await readFile(bootstrapCommand, 'utf8');

  await adapter.installGreenfield({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  assert.ok(await fileExists(bootstrapCommand),
    'installGreenfield must not remove the bootstrap command');
  assert.equal(await readFile(bootstrapCommand, 'utf8'), bootstrapContent,
    'installGreenfield must not modify the bootstrap command');
});

test('opencode: the bootstrap install stays byte-for-byte identical when the greenfield pack is installed', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installBootstrap({
    source: TOOLKIT_SOURCE,
    target: tmpDir,
  });

  const bootstrapPaths = [
    join(tmpDir, '.opencode/commands/bootstrap.md'),
    ...BOOTSTRAP_SUPPORTING_FILES.map((name) => join(tmpDir, '.opencode/commands/bootstrap', name)),
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

test('opencode: uninstallGreenfield is exported as a function', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.equal(typeof adapter.uninstallGreenfield, 'function', 'uninstallGreenfield must be exported');
});

test('opencode: uninstallGreenfield removes greenfield.md and the greenfield/ subdir', async () => {
  const tmpDir = await mkTmp();
  const commandFile = join(tmpDir, '.opencode/commands/greenfield.md');
  const supportDir = join(tmpDir, '.opencode/commands/greenfield');
  await mkdir(join(supportDir, 'defaults'), { recursive: true });
  await writeFile(commandFile, '# dummy');
  await writeFile(join(supportDir, 'defaults/_baseline.md'), '# dummy');
  assert.ok(await fileExists(commandFile), 'pre: greenfield.md exists');
  assert.ok(await fileExists(supportDir), 'pre: greenfield/ subdir exists');

  const adapter = await import(ADAPTER_PATH);
  const result = await adapter.uninstallGreenfield({ target: tmpDir });

  assert.equal(result.removed, true, 'returns {removed: true} when artifacts existed');
  assert.equal(await fileExists(commandFile), false, 'greenfield.md removed');
  assert.equal(await fileExists(supportDir), false, 'greenfield/ subdir removed');
});

test('opencode: uninstallGreenfield handles orphan state (only one artifact present)', async () => {
  const tmpDir = await mkTmp();
  const commandFile = join(tmpDir, '.opencode/commands/greenfield.md');
  await mkdir(join(tmpDir, '.opencode/commands'), { recursive: true });
  await writeFile(commandFile, '# orphan command');
  assert.ok(await fileExists(commandFile), 'pre: greenfield.md exists');
  assert.equal(
    await fileExists(join(tmpDir, '.opencode/commands/greenfield')),
    false,
    'pre: greenfield/ subdir absent (orphan state)'
  );

  const adapter = await import(ADAPTER_PATH);
  const result = await adapter.uninstallGreenfield({ target: tmpDir });

  assert.equal(result.removed, true, 'returns {removed: true} when command file exists');
  assert.equal(await fileExists(commandFile), false, 'orphan greenfield.md removed');
});

test('opencode: uninstallGreenfield is idempotent (skip when not present)', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);
  const result = await adapter.uninstallGreenfield({ target: tmpDir });

  assert.equal(result.removed, false, 'returns {removed: false} when neither artifact exists');
});

test('opencode: a provenance marker never carries the tool prefix', async () => {
  // A `[default: …]` marker is DATA: it is copied verbatim into the
  // generated `.context/` files, where a tool-specific prefix would name
  // a path that does not exist. The source must not carry a prefix, and
  // the adapter strips one if it ever does.
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const installed = join(tmpDir, '.opencode/commands/greenfield');
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
      assert.ok(!marker.includes('@'),
        `${file}: the marker "${marker}" must not carry the OpenCode prefix — ` +
        'a marker records a neutral relative path');
      assert.ok(!marker.includes('./'),
        `${file}: the marker "${marker}" must not carry a relative prefix — ` +
        'a marker records a neutral relative path');
    }
  }
});

test('opencode: installGreenfield does NOT overwrite a greenfield.md the toolkit did not write', async () => {
  // `init` is non-destructive. A command the user wrote at the same path
  // must survive — and the supporting files must NOT be attached to it.
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  const userCommand = '---\ndescription: my own command\n---\nMY OWN COMMAND BODY\n';
  const commandPath = join(tmpDir, '.opencode/commands/greenfield.md');
  await mkdir(join(tmpDir, '.opencode/commands'), { recursive: true });
  await writeFile(commandPath, userCommand);

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const content = await readFile(commandPath, 'utf8');
  assert.equal(content, userCommand,
    'the user\'s own command must survive the install untouched');
  assert.ok(
    !(await fileExists(join(tmpDir, '.opencode/commands/greenfield'))),
    'the supporting files must not be installed next to a command the toolkit does not own'
  );
});

test('opencode: a partial install (supporting files without the command) is completed', async () => {
  // A leftover directory must not make the command disappear: the pack
  // is only installed when BOTH artifacts are there.
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await mkdir(join(tmpDir, '.opencode/commands/greenfield'), { recursive: true });
  await writeFile(join(tmpDir, '.opencode/commands/greenfield/leftover.md'), 'kept\n');

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const commandPath = join(tmpDir, '.opencode/commands/greenfield.md');
  assert.ok(await fileExists(commandPath),
    'the command file must be installed when only the supporting directory existed');
  const content = await readFile(commandPath, 'utf8');
  assert.match(content, /subtask: false/, 'the installed command must be the toolkit\'s');
  assert.ok(
    await fileExists(join(tmpDir, '.opencode/commands/greenfield/leftover.md')),
    'a file already in the directory must not be deleted'
  );
});

test('opencode: a partial install (the toolkit\'s command without its files) is completed', async () => {
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });
  await rm(join(tmpDir, '.opencode/commands/greenfield'), { recursive: true, force: true });

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  assert.ok(
    await fileExists(join(tmpDir, '.opencode/commands/greenfield/01-pre-flight.md')),
    'the supporting files must be restored when the toolkit\'s own command lost them'
  );
});

test('opencode: an EDITED toolkit command is not silently overwritten', async () => {
  // The toolkit owns a file only while its content is byte-for-byte what
  // the toolkit writes. The moment the user edits it, it is theirs: `init`
  // reports the difference and changes nothing. `sync` (force) is the path
  // that restores the source version.
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });
  const commandPath = join(tmpDir, '.opencode/commands/greenfield.md');
  await writeFile(commandPath, 'EDITED BY THE USER\n');

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const content = await readFile(commandPath, 'utf8');
  assert.equal(content, 'EDITED BY THE USER\n',
    'the user\'s edit must survive `init`');
});

test('opencode: a user file inside the supporting directory is not overwritten', async () => {
  // The supporting directory is the user's directory too. A file that is
  // there and differs from the toolkit's version must be left alone and
  // reported, not replaced.
  const tmpDir = await mkTmp();
  const adapter = await import(ADAPTER_PATH);

  const subdir = join(tmpDir, '.opencode/commands/greenfield');
  await mkdir(subdir, { recursive: true });
  await writeFile(join(subdir, '05-architecture.md'), 'MY PRECIOUS USER CONTENT\n');

  await adapter.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

  const content = await readFile(join(subdir, '05-architecture.md'), 'utf8');
  assert.equal(content, 'MY PRECIOUS USER CONTENT\n',
    'the user\'s file must survive the install');
});
