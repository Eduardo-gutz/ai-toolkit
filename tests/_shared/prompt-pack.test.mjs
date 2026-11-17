// Tests for adapters/_shared/prompt-pack.mjs — the pack-aware shared
// renderer that reads a prompt pack (conductor + supporting files +
// assets) from the canonical source and rewrites the conductor's
// cross-file references.
//
// Behavior under test:
//   - PROMPT_PACKS is the frozen registry with exactly two packs
//     (bootstrap, greenfield), each declaring dir/conductor/supporting/assets.
//   - readPromptPack(source, 'bootstrap') returns the conductor + the 9
//     supporting files and an EMPTY assets list.
//   - readPromptPack(source, 'greenfield') returns the conductor + 9
//     supporting files + 11 catalog assets.
//   - readPromptPack(source, 'does-not-exist') throws with the pack id.
//   - adaptPackPaths rewrites BOTH ./<supporting>.md and ./<asset>.md
//     references, and leaves unmapped names untouched.
//   - The legacy bootstrap-renderer.mjs public API is unchanged.
//
// Reads from the real toolkit (not a fixture) because source/prompts/ is
// the canonical reference; if it changes, the tests document that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PROMPT_PACKS,
  readPromptPack,
  adaptPackPaths,
  validatePromptPack,
} from '../../adapters/_shared/prompt-pack.mjs';
import {
  readBootstrapSource,
  adaptConductorPaths,
  BOOTSTRAP_SUPPORTING_FILES,
  BOOTSTRAP_CONDUCTOR_FILE,
} from '../../adapters/_shared/bootstrap-renderer.mjs';

const TOOLKIT_ROOT = join(import.meta.dirname, '../..');
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');

const BOOTSTRAP_SUPPORTING = [
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

const GREENFIELD_SUPPORTING = [
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

const GREENFIELD_ASSETS = [
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

test('prompt-pack: PROMPT_PACKS registers exactly the bootstrap and greenfield packs', () => {
  assert.deepEqual(Object.keys(PROMPT_PACKS), ['bootstrap', 'greenfield'],
    'PROMPT_PACKS must register exactly two packs, bootstrap first');

  for (const id of Object.keys(PROMPT_PACKS)) {
    const pack = PROMPT_PACKS[id];
    assert.equal(pack.id, id, `pack ${id} must carry its own id`);
    assert.equal(typeof pack.dir, 'string', `pack ${id} must declare a dir`);
    assert.equal(pack.conductor, '00-conductor.md', `pack ${id} must declare a conductor file`);
    assert.ok(Array.isArray(pack.supporting), `pack ${id} must declare a supporting array`);
    assert.ok(Array.isArray(pack.assets), `pack ${id} must declare an assets array`);
    assert.ok(Object.isFrozen(pack), `pack ${id} must be frozen`);
    assert.ok(Object.isFrozen(pack.supporting), `pack ${id}.supporting must be frozen`);
    assert.ok(Object.isFrozen(pack.assets), `pack ${id}.assets must be frozen`);
  }
});

test('prompt-pack: the bootstrap pack declares the 9 legacy supporting files and no assets', () => {
  assert.deepEqual([...PROMPT_PACKS.bootstrap.supporting], BOOTSTRAP_SUPPORTING,
    'bootstrap.supporting must list the 9 legacy supporting files in order');
  assert.deepEqual([...PROMPT_PACKS.bootstrap.assets], [],
    'bootstrap has no assets');
  assert.equal(PROMPT_PACKS.bootstrap.dir, 'bootstrap',
    'bootstrap pack lives in prompts/bootstrap/');
});

test('prompt-pack: the greenfield pack declares 9 supporting files and 11 catalog assets', () => {
  assert.deepEqual([...PROMPT_PACKS.greenfield.supporting], GREENFIELD_SUPPORTING,
    'greenfield.supporting must list the 9 supporting files in order');
  assert.deepEqual([...PROMPT_PACKS.greenfield.assets], GREENFIELD_ASSETS,
    'greenfield.assets must list the 11 catalog files in order');
  assert.equal(PROMPT_PACKS.greenfield.dir, 'greenfield',
    'greenfield pack lives in prompts/greenfield/');
});

test('prompt-pack: the greenfield registry lists 11 assets and every one exists on disk', () => {
  const assets = PROMPT_PACKS.greenfield.assets;

  assert.equal(assets.length, 11,
    `the greenfield registry must list 11 catalog assets (got ${assets.length})`);
  assert.equal(new Set(assets).size, assets.length,
    'the greenfield registry must not list the same asset twice');

  for (const name of assets) {
    const path = join(TOOLKIT_SOURCE, 'prompts', 'greenfield', name);
    assert.ok(existsSync(path),
      `the registered asset "${name}" must exist at ${path}`);
  }
});

test('prompt-pack: readPromptPack returns the bootstrap pack with 9 supporting files and no assets', () => {
  const pack = readPromptPack(TOOLKIT_SOURCE, 'bootstrap');

  assert.equal(pack.id, 'bootstrap', 'pack id must be echoed back');
  assert.equal(typeof pack.conductor, 'string', 'conductor must be a string');
  assert.ok(pack.conductor.length > 0, 'conductor must be non-empty');

  assert.equal(pack.supportingFiles.length, 9, 'bootstrap must expose 9 supporting files');
  assert.deepEqual(pack.supportingFiles.map((f) => f.name), BOOTSTRAP_SUPPORTING,
    'supporting file names must match the registry order');
  for (const file of pack.supportingFiles) {
    assert.equal(typeof file.content, 'string', `${file.name} content must be a string`);
    assert.ok(file.content.length > 0, `${file.name} content must be non-empty`);
  }

  assert.deepEqual(pack.assets, [], 'bootstrap must expose no assets');
});

test('prompt-pack: readPromptPack returns the greenfield pack with 9 supporting files and 11 assets', () => {
  const pack = readPromptPack(TOOLKIT_SOURCE, 'greenfield');

  assert.equal(pack.id, 'greenfield', 'pack id must be echoed back');
  assert.equal(typeof pack.conductor, 'string', 'conductor must be a string');
  assert.ok(pack.conductor.length > 0, 'conductor must be non-empty');

  assert.equal(pack.supportingFiles.length, 9, 'greenfield must expose 9 supporting files');
  assert.deepEqual(pack.supportingFiles.map((f) => f.name), GREENFIELD_SUPPORTING,
    'supporting file names must match the registry order');

  assert.equal(pack.assets.length, 11, 'greenfield must expose 11 catalog assets');
  assert.deepEqual(pack.assets.map((f) => f.name), GREENFIELD_ASSETS,
    'asset names must match the registry order');

  for (const file of [...pack.supportingFiles, ...pack.assets]) {
    assert.equal(typeof file.content, 'string', `${file.name} content must be a string`);
    assert.ok(file.content.length > 0, `${file.name} content must be non-empty`);
  }
});

test('prompt-pack: readPromptPack throws with the pack id when the pack is unknown', () => {
  assert.throws(
    () => readPromptPack(TOOLKIT_SOURCE, 'does-not-exist'),
    (err) => {
      assert.ok(err instanceof Error, 'must throw an Error');
      assert.ok(err.message.includes('does-not-exist'),
        `error message must name the unknown pack id (got: ${err.message})`);
      return true;
    },
    'readPromptPack must throw for an unregistered pack id'
  );
});

test('prompt-pack: readPromptPack throws with the missing file path when a registered file is absent', () => {
  const tmpSource = mkdtempSync(join(tmpdir(), 'aitk-pack-empty-'));
  assert.throws(
    () => readPromptPack(tmpSource, 'bootstrap'),
    (err) => {
      assert.ok(err instanceof Error, 'must throw an Error');
      assert.ok(err.message.includes('00-conductor.md'),
        `error message must name the missing file (got: ${err.message})`);
      return true;
    },
    'readPromptPack must throw when a registered pack file is missing'
  );
});

test('prompt-pack: adaptPackPaths rewrites supporting and asset references', () => {
  const content = [
    'See ./01-pre-flight.md then ./defaults/_baseline.md,',
    'but leave ./not-registered.md alone.',
  ].join('\n');

  const out = adaptPackPaths(
    content,
    ['01-pre-flight.md', 'defaults/_baseline.md'],
    {
      '01-pre-flight.md': '@01-pre-flight.md',
      'defaults/_baseline.md': '@defaults/_baseline.md',
    }
  );

  assert.ok(out.includes('@01-pre-flight.md'), 'supporting reference must be rewritten');
  assert.ok(out.includes('@defaults/_baseline.md'), 'asset reference must be rewritten');
  assert.ok(out.includes('./not-registered.md'), 'unmapped reference must be left untouched');
  assert.ok(!out.includes('./01-pre-flight.md'), 'the original supporting reference must be gone');
  assert.ok(!out.includes('./defaults/_baseline.md'), 'the original asset reference must be gone');
});

test('prompt-pack: adaptPackPaths leaves the content untouched for an empty mapping', () => {
  const content = 'See ./01-pre-flight.md and ./defaults/_baseline.md.';
  const out = adaptPackPaths(content, ['01-pre-flight.md'], {});
  assert.equal(out, content, 'an empty mapping must return the content verbatim');
});

test('prompt-pack: adaptPackPaths rewrites the placeholder form of a directory-scoped reference', () => {
  const content = [
    'See ./defaults/_baseline.md plus',
    './defaults/<stack>.md (for example ./defaults/node-typescript.md).',
    'Leave ./not-registered.md alone.',
  ].join('\n');

  const out = adaptPackPaths(
    content,
    ['defaults/_baseline.md', 'defaults/node-typescript.md'],
    {
      'defaults/_baseline.md': '@defaults/_baseline.md',
      'defaults/node-typescript.md': '@defaults/node-typescript.md',
    }
  );

  assert.ok(out.includes('@defaults/<stack>.md'),
    'the placeholder reference must be rewritten to the tool syntax');
  assert.ok(!out.includes('./defaults/'),
    'no "./defaults/" reference may survive the rewrite');
  assert.ok(out.includes('@defaults/_baseline.md'),
    'the literal asset reference must be rewritten to the tool syntax');
  assert.ok(out.includes('@defaults/node-typescript.md'),
    'the literal example must be rewritten to the tool syntax');
  assert.ok(out.includes('./not-registered.md'),
    'an unmapped reference must be left untouched');
});

test('prompt-pack: adaptPackPaths rewrites a directory-scoped reference when a sibling mapping value is non-conforming', () => {
  const content = 'See ./defaults/<stack>.md.';

  // The longest name in the directory carries a mapping value that does
  // not end with the name, so its tool prefix cannot be derived from it.
  // The shorter sibling still yields a valid prefix.
  const out = adaptPackPaths(
    content,
    ['defaults/node-typescript.md', 'defaults/_baseline.md'],
    {
      'defaults/node-typescript.md': '@wrong/node-typescript.md',
      'defaults/_baseline.md': '@defaults/_baseline.md',
    }
  );

  assert.ok(out.includes('@defaults/<stack>.md'),
    'a valid sibling mapping must still produce the directory rewrite');
  assert.ok(!out.includes('./defaults/'),
    'no "./defaults/" reference may survive the rewrite');
});

test('prompt-pack: adaptPackPaths keeps the relative form when the mapping uses it', () => {
  const content = 'See ./defaults/_baseline.md plus ./defaults/<stack>.md.';

  const out = adaptPackPaths(
    content,
    ['defaults/_baseline.md'],
    { 'defaults/_baseline.md': './defaults/_baseline.md' }
  );

  assert.ok(out.includes('./defaults/<stack>.md'),
    'the placeholder reference must keep the relative form');
  assert.ok(!out.includes('@defaults/'),
    'the relative form must not be rewritten to the "@" form');
});

test('prompt-pack: validatePromptPack accepts the canonical source', () => {
  const result = validatePromptPack(TOOLKIT_SOURCE, 'bootstrap');
  assert.deepEqual(result, { ok: true }, 'validatePromptPack must return {ok: true}');
});

test('prompt-pack: validatePromptPack throws naming every missing file', () => {
  const tmpSource = mkdtempSync(join(tmpdir(), 'aitk-pack-empty-'));
  assert.throws(
    () => validatePromptPack(tmpSource, 'bootstrap'),
    (err) => {
      assert.ok(err instanceof Error, 'must throw an Error');
      assert.ok(err.message.includes('00-conductor.md'),
        `error message must name the missing conductor (got: ${err.message})`);
      assert.ok(err.message.includes('01-pre-flight.md'),
        `error message must name the missing supporting file (got: ${err.message})`);
      return true;
    },
    'validatePromptPack must list every missing file'
  );
});

test('prompt-pack: the legacy bootstrap-renderer public API is unchanged', () => {
  assert.equal(BOOTSTRAP_CONDUCTOR_FILE, '00-conductor.md',
    'BOOTSTRAP_CONDUCTOR_FILE must stay 00-conductor.md');
  assert.deepEqual([...BOOTSTRAP_SUPPORTING_FILES], BOOTSTRAP_SUPPORTING,
    'BOOTSTRAP_SUPPORTING_FILES must stay the 9 canonical names in order');

  const source = readBootstrapSource(TOOLKIT_SOURCE);
  assert.equal(typeof source.conductor, 'string', 'legacy conductor must stay a string');
  assert.ok(Array.isArray(source.supportingFiles), 'legacy supportingFiles must stay an array');
  assert.equal(source.supportingFiles.length, 9, 'legacy supportingFiles must hold 9 entries');
  assert.equal(typeof source.supportingFiles[0], 'string',
    'legacy supportingFiles entries must stay strings');

  const unchanged = adaptConductorPaths(source.conductor, {});
  assert.equal(unchanged, source.conductor,
    'adaptConductorPaths with {} must return the conductor verbatim');
});

test('prompt-pack: adaptPackPaths strips a tool prefix from a provenance marker', () => {
  // A `[default: …]` marker is DATA: it is copied verbatim into the
  // generated `.context/` files, where the tool's prefix would name a
  // path that does not exist. The marker must therefore come out NEUTRAL
  // — for every tool, whatever prefix that tool uses.
  const files = ['defaults/react.md', 'defaults/_baseline.md'];
  const opencode = Object.fromEntries(files.map((name) => [name, `@${name}`]));
  const claude = Object.fromEntries(files.map((name) => [name, `./${name}`]));

  for (const [tool, mapping] of [['opencode', opencode], ['claude-code', claude]]) {
    const source = 'Value — [default: ./defaults/react.md]\n';
    const result = adaptPackPaths(source, files, mapping);
    assert.equal(result, 'Value — [default: defaults/react.md]\n',
      `${tool}: the marker must come out neutral — the prefix must not leak ` +
      'into the generated files');
  }
});

test('prompt-pack: adaptPackPaths leaves an already-neutral marker untouched', () => {
  const files = ['defaults/react.md'];
  const mapping = Object.fromEntries(files.map((name) => [name, `@${name}`]));
  const source = 'Value — [default: defaults/react.md]\n';
  assert.equal(adaptPackPaths(source, files, mapping), source,
    'a neutral marker must survive the rewrite unchanged');
});

test('prompt-pack: adaptPackPaths does not silently normalize a foreign marker prefix', () => {
  // Only the TOOL's own prefix is stripped. A marker carrying some other
  // prefix is a different mistake — a wrong path — and the normalizer
  // must not quietly turn it into a valid-looking marker. It has to stay
  // visibly wrong, so the source guard can reject it.
  const files = ['defaults/react.md'];
  const mapping = Object.fromEntries(files.map((name) => [name, `@${name}`]));
  const source = 'Value — [default: ../defaults/react.md]\n';
  const result = adaptPackPaths(source, files, mapping);
  assert.notEqual(result, 'Value — [default: defaults/react.md]\n',
    'a marker with a prefix that is not the tool\'s must NOT be normalized ' +
    'into the neutral form — it would hide a wrong path');
});
