// Tests for adapters/_shared/lifecycle-registry.mjs.
//
// createLifecycle() returns a plain object with three independent arrays
// (install, sync, remove) that adapters populate with their lifecycle
// hooks. Adapters iterate these arrays in install/sync/remove to invoke
// extras (bootstrap install/uninstall, future lint rules, etc.) without
// having to modify the lifecycle methods themselves each time a new extra
// is added.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle } from '../../adapters/_shared/lifecycle-registry.mjs';

test('createLifecycle: returns object with 3 empty arrays', () => {
  const lc = createLifecycle();
  assert.deepEqual(lc.install, []);
  assert.deepEqual(lc.sync, []);
  assert.deepEqual(lc.remove, []);
});

test('createLifecycle: arrays are independent between calls', () => {
  const a = createLifecycle();
  const b = createLifecycle();
  a.install.push(() => {});
  assert.equal(b.install.length, 0);
  assert.equal(a.install.length, 1);
});

test('createLifecycle: arrays can hold hooks and iterate in order', async () => {
  const lc = createLifecycle();
  const calls = [];
  lc.install.push(async () => { calls.push('a'); });
  lc.install.push(async () => { calls.push('b'); });
  for (const hook of lc.install) await hook({ source: '', target: '' });
  assert.deepEqual(calls, ['a', 'b']);
});