// Tests for adapters/_shared/safe-name.mjs.
// Pins the regex + length cap so a future refactor cannot silently weaken it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeName } from '../adapters/_shared/safe-name.mjs';

test('assertSafeName: accepts a normal alphanumeric name', () => {
  assertSafeName('coder', 'agents');
  assertSafeName('my-skill_v2.0', 'skills');
});

test('assertSafeName: rejects empty string', () => {
  assert.throws(
    () => assertSafeName('', 'agents'),
    /Invalid agents name: must be a non-empty string/,
  );
});

test('assertSafeName: rejects non-string input', () => {
  assert.throws(
    () => assertSafeName(undefined, 'agents'),
    /Invalid agents name: must be a non-empty string/,
  );
  assert.throws(
    () => assertSafeName(null, 'skills'),
    /Invalid skills name: must be a non-empty string/,
  );
  assert.throws(
    () => assertSafeName(123, 'agents'),
    /Invalid agents name: must be a non-empty string/,
  );
});

test('assertSafeName: rejects names longer than 128 chars', () => {
  const longName = 'a'.repeat(129);
  assert.throws(
    () => assertSafeName(longName, 'agents'),
    /max 128 chars/,
  );
});

test('assertSafeName: rejects "." and ".."', () => {
  assert.throws(() => assertSafeName('.', 'agents'), /Invalid agents name "\."/);
  assert.throws(() => assertSafeName('..', 'agents'), /Invalid agents name "\.\."/);
});

test('assertSafeName: rejects names starting with "."', () => {
  assert.throws(
    () => assertSafeName('.hidden', 'skills'),
    /Invalid skills name "\.hidden": cannot start with "\."/,
  );
});

test('assertSafeName: rejects path-traversal and shell-meta characters', () => {
  // Path-traversal
  assert.throws(
    () => assertSafeName('../foo', 'agents'),
    /Invalid agents name "\.\.\/foo"/,
  );
  // Slash (separators)
  assert.throws(
    () => assertSafeName('foo/bar', 'skills'),
    /Invalid skills name "foo\/bar"/,
  );
  // Shell meta (only safe chars allowed)
  assert.throws(
    () => assertSafeName('foo;rm', 'agents'),
    /Invalid agents name "foo;rm"/,
  );
  // Space (not in regex)
  assert.throws(
    () => assertSafeName('foo bar', 'agents'),
    /Invalid agents name "foo bar"/,
  );
});
