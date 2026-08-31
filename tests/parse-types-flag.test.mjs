// Tests for the shared bin/lib/parse-types-flag.mjs helper.
//
// The helper parses the --types flag (e.g., --types=agents,skills) with
// consistent trim/lowercase/dedupe semantics. It's reused by init.mjs (with
// ALL_TYPES whitelist) and any future command that needs --types filtering.
//
// Keep these tests in sync with the helper's documented contract:
//   - undefined or false → null (caller falls back to defaults)
//   - empty after parsing → throws "cannot be empty"
//   - non-string value → throws "must be comma-separated string"
//   - if validTypes given, unknown types → throws with the valid list

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTypesFlag } from '../bin/lib/parse-types-flag.mjs';

const flagsWith = (types) => ({ types });
const ALL_TYPES = ['agents', 'skills', 'mcps', 'rules', 'commands'];

// ─── Default behavior (no validTypes) ─────────────────────────

test('parseTypesFlag: undefined → null (caller falls back to defaults)', () => {
  assert.equal(parseTypesFlag({}), null);
});

test('parseTypesFlag: false → null (value-less --types)', () => {
  assert.equal(parseTypesFlag(flagsWith(false)), null);
});

test('parseTypesFlag: single type → [type]', () => {
  assert.deepEqual(parseTypesFlag(flagsWith('agents')), ['agents']);
});

test('parseTypesFlag: comma-separated → array', () => {
  assert.deepEqual(parseTypesFlag(flagsWith('agents,skills')), ['agents', 'skills']);
});

// ─── Normalization (trim, lowercase, dedupe) ──────────────────

test('parseTypesFlag: whitespace around entries is trimmed', () => {
  assert.deepEqual(parseTypesFlag(flagsWith(' agents , skills ')), ['agents', 'skills']);
});

test('parseTypesFlag: case is normalized to lowercase', () => {
  assert.deepEqual(parseTypesFlag(flagsWith('AGENTS,Skills,MCPS')), ['agents', 'skills', 'mcps']);
});

test('parseTypesFlag: duplicates are deduped', () => {
  assert.deepEqual(parseTypesFlag(flagsWith('agents,agents,AGENTS')), ['agents']);
});

test('parseTypesFlag: empty entries from extra commas are filtered', () => {
  assert.deepEqual(parseTypesFlag(flagsWith('agents,,skills,')), ['agents', 'skills']);
});

// ─── Rejection cases ──────────────────────────────────────────

test('parseTypesFlag: empty string → throws "cannot be empty"', () => {
  assert.throws(() => parseTypesFlag(flagsWith('')), /--types cannot be empty/);
});

test('parseTypesFlag: only commas → throws "cannot be empty"', () => {
  assert.throws(() => parseTypesFlag(flagsWith(',,,')), /--types cannot be empty/);
});

test('parseTypesFlag: non-string value (number) → throws "must be comma-separated string"', () => {
  assert.throws(() => parseTypesFlag(flagsWith(123)), /--types must be a comma-separated string/);
});

test('parseTypesFlag: non-string value (array) → throws "must be comma-separated string"', () => {
  assert.throws(() => parseTypesFlag(flagsWith(['agents'])), /--types must be a comma-separated string/);
});

test('parseTypesFlag: non-string value (true) → throws "must be comma-separated string"', () => {
  assert.throws(() => parseTypesFlag(flagsWith(true)), /--types must be a comma-separated string/);
});

// ─── validTypes whitelist (when provided) ─────────────────────

test('parseTypesFlag: validTypes not provided → accepts any non-empty value', () => {
  // Without a whitelist, the helper does NOT reject unknown types.
  // Caller (e.g., sync.mjs) decides what to do with them.
  assert.deepEqual(parseTypesFlag(flagsWith('anything')), ['anything']);
});

test('parseTypesFlag: with validTypes, all-valid → array', () => {
  assert.deepEqual(
    parseTypesFlag(flagsWith('agents,skills'), ALL_TYPES),
    ['agents', 'skills']
  );
});

test('parseTypesFlag: with validTypes, one unknown → throws with list', () => {
  assert.throws(
    () => parseTypesFlag(flagsWith('agents,bogus'), ALL_TYPES),
    /Unknown type\(s\): bogus.*Valid: agents, skills, mcps, rules, commands/
  );
});

test('parseTypesFlag: with validTypes, all unknown → throws with list', () => {
  assert.throws(
    () => parseTypesFlag(flagsWith('foo,bar'), ALL_TYPES),
    /Unknown type\(s\): foo, bar/
  );
});

test('parseTypesFlag: with validTypes, empty array → throws "cannot be empty"', () => {
  // Empty happens before validTypes check, so the error is the same.
  assert.throws(() => parseTypesFlag(flagsWith(''), ALL_TYPES), /--types cannot be empty/);
});

test('parseTypesFlag: with validTypes, dedupe applies before whitelist check', () => {
  // 'agents' (valid) + 'agents' (dup) + 'bogus' (invalid) → should fail on bogus.
  assert.throws(
    () => parseTypesFlag(flagsWith('agents,agents,bogus'), ALL_TYPES),
    /Unknown type\(s\): bogus/
  );
});