// Tests for the opencode adapter's per-resource path helpers.
//
// resourcePaths(type, name, target) → paths that install() created for that
//   resource. Used by the `remove` command to delete files.
// cleanupDirs(target) → directories to attempt removeIfEmpty() on after bulk
//   removal. These are the same dirs the current postRemoveCleanup() empties.
//
// SECURITY: resourcePaths() must validate the name via assertSafeName (same
// regex as remove.mjs) so a malicious name is rejected before any path is
// constructed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const ADAPTER_PATH = '../../../adapters/opencode/adapter.mjs';

test('opencode: resourcePaths returns empty array for unknown type', async () => {
  const adapter = await import(ADAPTER_PATH);
  const paths = adapter.resourcePaths('not-a-type', 'foo', '/tmp/proj');
  assert.deepEqual(paths, []);
});

test('opencode: resourcePaths returns empty array for mcps/rules (not file-per-resource)', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.deepEqual(adapter.resourcePaths('mcps', 'mcp-foo', '/tmp/proj'), []);
  assert.deepEqual(adapter.resourcePaths('rules', 'rule-foo', '/tmp/proj'), []);
});

test('opencode: resourcePaths(agents, name, target) returns <target>/.opencode/agents/<name>.md', async () => {
  const adapter = await import(ADAPTER_PATH);
  const paths = adapter.resourcePaths('agents', 'coder', '/tmp/proj');
  assert.deepEqual(paths, ['/tmp/proj/.opencode/agents/coder.md']);
});

test('opencode: resourcePaths(skills, name, target) returns <target>/.opencode/skills/<name>', async () => {
  const adapter = await import(ADAPTER_PATH);
  const paths = adapter.resourcePaths('skills', 'my-skill', '/tmp/proj');
  assert.deepEqual(paths, ['/tmp/proj/.opencode/skills/my-skill']);
});

test('opencode: resourcePaths rejects path-traversal names', async () => {
  const adapter = await import(ADAPTER_PATH);
  assert.throws(
    () => adapter.resourcePaths('agents', '..', '/tmp/proj'),
    /Invalid agents name/i,
  );
  assert.throws(
    () => adapter.resourcePaths('agents', '../foo', '/tmp/proj'),
    /Invalid agents name/i,
  );
  assert.throws(
    () => adapter.resourcePaths('skills', 'foo/bar', '/tmp/proj'),
    /Invalid skills name/i,
  );
  assert.throws(
    () => adapter.resourcePaths('agents', '.hidden', '/tmp/proj'),
    /Invalid agents name/i,
  );
});

test('opencode: cleanupDirs(target) returns agents, skills, .opencode', async () => {
  const adapter = await import(ADAPTER_PATH);
  const dirs = adapter.cleanupDirs('/tmp/proj');
  assert.deepEqual(dirs, [
    '/tmp/proj/.opencode/agents',
    '/tmp/proj/.opencode/skills',
    '/tmp/proj/.opencode',
  ]);
});
