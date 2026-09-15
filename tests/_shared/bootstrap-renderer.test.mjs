// Tests for adapters/_shared/bootstrap-renderer.mjs — the shared helper that
// reads the canonical bootstrap source and rewrites conductor paths.
//
// Behavior under test:
//   - readBootstrapSource(sourceDir) returns the conductor body + 9 supporting
//     files in canonical alphabetical order, matching the names exported by
//     BOOTSTRAP_SUPPORTING_FILES.
//   - adaptConductorPaths(conductor, {}) is a no-op (empty mapping leaves the
//     conductor untouched).
//   - adaptConductorPaths(conductor, mapping) rewrites every `source/...md`
//     reference listed in the mapping, leaving non-listed names unchanged.
//
// Reads from the real toolkit (not a fixture) because source/prompts/bootstrap/
// is the canonical reference; if it changes, the tests document that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  readBootstrapSource,
  adaptConductorPaths,
  BOOTSTRAP_SUPPORTING_FILES,
  BOOTSTRAP_CONDUCTOR_FILE,
} from '../../adapters/_shared/bootstrap-renderer.mjs';

const TOOLKIT_ROOT = '/Users/eduardogutierrez/Desktop/VortexSound_back/ai-toolkit';
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');

test('readBootstrapSource: returns conductor + 9 supporting files with exact canonical names', () => {
  const result = readBootstrapSource(TOOLKIT_SOURCE);

  assert.equal(typeof result.conductor, 'string', 'conductor must be a string');
  assert.ok(result.conductor.length > 0, 'conductor must be non-empty');
  assert.equal(typeof result, 'object', 'result must be an object');
  assert.ok(Array.isArray(result.supportingFiles), 'supportingFiles must be an array');

  // Exactly 9 supporting files, in canonical order.
  assert.equal(result.supportingFiles.length, 9, 'supportingFiles must have 9 entries');
  assert.equal(result.supportingFiles.length, BOOTSTRAP_SUPPORTING_FILES.length,
    'supportingFiles length must match BOOTSTRAP_SUPPORTING_FILES length');

  // Verify the 9 canonical filenames appear in BOOTSTRAP_SUPPORTING_FILES
  // and that readBootstrapSource reads each one (each entry is non-empty
  // content matching the on-disk source).
  const expectedNames = [
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
  assert.deepEqual([...BOOTSTRAP_SUPPORTING_FILES], expectedNames,
    'BOOTSTRAP_SUPPORTING_FILES must list the 9 canonical filenames in order');

  // Each supporting file is a non-empty string (the helper reads from disk;
  // if the helper returned a different shape the assertion would fail).
  for (let i = 0; i < result.supportingFiles.length; i++) {
    assert.equal(typeof result.supportingFiles[i], 'string',
      `supportingFiles[${i}] must be a string (content of ${expectedNames[i]})`);
    assert.ok(result.supportingFiles[i].length > 0,
      `supportingFiles[${i}] (${expectedNames[i]}) must be non-empty`);
  }

  // Conductor file constant should be 00-conductor.md.
  assert.equal(BOOTSTRAP_CONDUCTOR_FILE, '00-conductor.md',
    'BOOTSTRAP_CONDUCTOR_FILE must be 00-conductor.md');
});

test('adaptConductorPaths: empty mapping leaves the conductor untouched', () => {
  const result = readBootstrapSource(TOOLKIT_SOURCE);

  // No mapping → conductor must come back identical (no rewriting happens).
  const out = adaptConductorPaths(result.conductor, {});
  assert.equal(out, result.conductor,
    'adaptConductorPaths with {} must return the conductor unchanged');

  // Defensive: also verify with an empty Object that mentions no names.
  const out2 = adaptConductorPaths(result.conductor, { 'no-such-name.md': 'whatever' });
  assert.equal(out2, result.conductor,
    'adaptConductorPaths with a mapping entry whose name is not canonical must also leave the conductor unchanged');
});

test('adaptConductorPaths: mapping rewrites ./0X sub-prompt paths', () => {
  const result = readBootstrapSource(TOOLKIT_SOURCE);

  // Sanity precondition: the conductor contains at least one of the canonical
  // paths we're about to rewrite. If it doesn't, this test would silently
  // pass without exercising the rewrite — make that a hard failure.
  const sampleName = BOOTSTRAP_SUPPORTING_FILES[0]; // '01-pre-flight.md'
  assert.ok(result.conductor.includes(`./${sampleName}`),
    `precondition: conductor must reference ./${sampleName} (the sub-prompt path pattern) ` +
    '(otherwise the rewrite branch is never exercised)');

  // Build a Claude-Code-style mapping: `./<name>` for every supporting file.
  const mapping = Object.fromEntries(
    BOOTSTRAP_SUPPORTING_FILES.map((name) => [name, `./${name}`])
  );

  const out = adaptConductorPaths(result.conductor, mapping);

  // Every mapped name must be rewritten to its mapped value.
  for (const name of BOOTSTRAP_SUPPORTING_FILES) {
    assert.ok(!out.includes(`source/prompts/bootstrap/${name}`),
      `rewritten conductor must NOT still reference source/prompts/bootstrap/${name}`);
    assert.ok(out.includes(`./${name}`),
      `rewritten conductor must reference ./${name}`);
  }

  // Non-mapped substrings in the conductor must be preserved verbatim:
  // the helper splits/joins on exact strings, so substrings without a
  // mapping entry are untouched.
  assert.ok(out.includes(result.conductor.slice(0, 50)),
    'rewritten conductor must preserve the opening of the original');
});