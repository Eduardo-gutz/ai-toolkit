import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultState,
  recordRulesOwnership,
  releaseRulesOwnership,
} from '../adapters/_shared/state.mjs';

test('recordRulesOwnership: adds tool name on first call', () => {
  const state = createDefaultState();
  recordRulesOwnership(state, 'opencode');
  assert.deepEqual(state.agents_md_owners, ['opencode']);
});

test('recordRulesOwnership: is idempotent on repeated calls', () => {
  const state = createDefaultState();
  recordRulesOwnership(state, 'opencode');
  recordRulesOwnership(state, 'opencode');
  recordRulesOwnership(state, 'opencode');
  assert.deepEqual(state.agents_md_owners, ['opencode']);
});

test('recordRulesOwnership: tracks multiple distinct tools', () => {
  const state = createDefaultState();
  recordRulesOwnership(state, 'opencode');
  recordRulesOwnership(state, 'claude-code');
  assert.deepEqual(state.agents_md_owners, ['opencode', 'claude-code']);
});

test('releaseRulesOwnership: removes tool name', () => {
  const state = createDefaultState();
  recordRulesOwnership(state, 'opencode');
  recordRulesOwnership(state, 'claude-code');
  releaseRulesOwnership(state, 'opencode');
  assert.deepEqual(state.agents_md_owners, ['claude-code']);
});

test('releaseRulesOwnership: is no-op when tool not registered', () => {
  const state = createDefaultState();
  recordRulesOwnership(state, 'opencode');
  releaseRulesOwnership(state, 'claude-code');
  assert.deepEqual(state.agents_md_owners, ['opencode']);
});

test('releaseRulesOwnership: legacy state without agents_md_owners → no throw', () => {
  const state = { version: '1.0.0', tools: {} };  // legacy shape
  assert.doesNotThrow(() => releaseRulesOwnership(state, 'opencode'));
  assert.equal(state.agents_md_owners, undefined);
});

test('recordRulesOwnership: lazy-inits on legacy state', () => {
  const state = { version: '1.0.0', tools: {} };  // legacy shape
  recordRulesOwnership(state, 'opencode');
  assert.deepEqual(state.agents_md_owners, ['opencode']);
});

test('releaseRulesOwnership: empty after last owner leaves', () => {
  const state = createDefaultState();
  recordRulesOwnership(state, 'opencode');
  releaseRulesOwnership(state, 'opencode');
  assert.deepEqual(state.agents_md_owners, []);
});

test('createDefaultState: includes agents_md_owners as empty array', () => {
  const state = createDefaultState();
  assert.ok(Array.isArray(state.agents_md_owners));
  assert.equal(state.agents_md_owners.length, 0);
});
