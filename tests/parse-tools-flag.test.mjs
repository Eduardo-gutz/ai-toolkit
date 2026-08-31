// Tests for the shared bin/lib/parse-tools-flag.mjs helper.
//
// The helper centralizes the "did the user pass --tools, and if so, what
// tools?" logic. Before Fase 0.5, four command files duplicated this logic
// with a meaningless second parameter — now there's one source of truth.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseToolsFlag } from '../bin/lib/parse-tools-flag.mjs';

const flagsWith = (tools) => ({ tools });

test('parseToolsFlag: undefined → null (fall back to config)', () => {
  assert.equal(parseToolsFlag({}), null);
});

test('parseToolsFlag: false → null (user typed --tools alone)', () => {
  // Value-less --tools becomes flags.tools = false in parseFlags.
  // parseToolsFlag treats this as "fall back to config".
  assert.equal(parseToolsFlag(flagsWith(false)), null);
});

test('parseToolsFlag: empty string → empty array (whitelist will reject)', () => {
  // "" → [""]? No, filter(Boolean) drops empty entries, so we get [].
  assert.deepEqual(parseToolsFlag(flagsWith('')), []);
});

test('parseToolsFlag: single tool → [tool]', () => {
  assert.deepEqual(parseToolsFlag(flagsWith('opencode')), ['opencode']);
});

test('parseToolsFlag: comma-separated → array', () => {
  assert.deepEqual(
    parseToolsFlag(flagsWith('opencode,claude-code')),
    ['opencode', 'claude-code']
  );
});

test('parseToolsFlag: empty entries filtered', () => {
  assert.deepEqual(parseToolsFlag(flagsWith('opencode,,claude-code,')), ['opencode', 'claude-code']);
});

test('parseToolsFlag: number → throws', () => {
  assert.throws(() => parseToolsFlag(flagsWith(123)), /comma-separated string/);
});

test('parseToolsFlag: array → throws', () => {
  assert.throws(() => parseToolsFlag(flagsWith(['opencode'])), /comma-separated string/);
});

test('parseToolsFlag: object → throws', () => {
  assert.throws(() => parseToolsFlag(flagsWith({ opencode: true })), /comma-separated string/);
});

test('parseToolsFlag: null → throws (not undefined, not false)', () => {
  // null is explicitly NOT undefined/false — it's a misuse.
  assert.throws(() => parseToolsFlag(flagsWith(null)), /comma-separated string/);
});

test('parseToolsFlag: true → throws (boolean value, not allowed)', () => {
  // flags.tools=true should not happen via parseFlags anymore (boolean
  // flags use BOOLEAN_FLAGS set), but defend in depth.
  assert.throws(() => parseToolsFlag(flagsWith(true)), /comma-separated string/);
});

// ─── Regression N1: trim + dedupe ────────────────────────────

test('parseToolsFlag: whitespace around entries is trimmed', () => {
  assert.deepEqual(
    parseToolsFlag(flagsWith(' opencode , claude-code ')),
    ['opencode', 'claude-code']
  );
});

test('parseToolsFlag: leading whitespace on single value', () => {
  assert.deepEqual(parseToolsFlag(flagsWith('  opencode  ')), ['opencode']);
});

test('parseToolsFlag: duplicates are deduped', () => {
  assert.deepEqual(
    parseToolsFlag(flagsWith('opencode,opencode,claude-code')),
    ['opencode', 'claude-code']
  );
});

test('parseToolsFlag: case is preserved (not lowercased)', () => {
  // Tools like 'claude-code' have case-sensitive identifiers — don't lowercase.
  assert.deepEqual(
    parseToolsFlag(flagsWith('Claude-Code,OpenCode')),
    ['Claude-Code', 'OpenCode']
  );
});
