// Tests for adapters/_shared/tool-paths.mjs (factories).
// Verifies the contract at module boundary, not through a specific adapter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeResourcePaths, makeCleanupDirs } from '../adapters/_shared/tool-paths.mjs';

const FAKE_ASSERT_SAFE_NAME = () => {};

test('makeResourcePaths: agents type returns <target>/<agentsDir>/<name>.md', () => {
  const resourcePaths = makeResourcePaths({
    agentsDir: '.claude/agents',
    skillsDir: '.claude/skills',
    assertSafeName: FAKE_ASSERT_SAFE_NAME,
  });
  assert.deepEqual(
    resourcePaths('agents', 'coder', '/tmp/proj'),
    ['/tmp/proj/.claude/agents/coder.md'],
  );
});

test('makeResourcePaths: skills type returns <target>/<skillsDir>/<name>', () => {
  const resourcePaths = makeResourcePaths({
    agentsDir: '.claude/agents',
    skillsDir: '.claude/skills',
    assertSafeName: FAKE_ASSERT_SAFE_NAME,
  });
  assert.deepEqual(
    resourcePaths('skills', 'my-skill', '/tmp/proj'),
    ['/tmp/proj/.claude/skills/my-skill'],
  );
});

test('makeResourcePaths: mcps and rules return [] (not file-per-resource)', () => {
  const resourcePaths = makeResourcePaths({
    agentsDir: '.opencode/agents',
    skillsDir: '.opencode/skills',
    assertSafeName: FAKE_ASSERT_SAFE_NAME,
  });
  assert.deepEqual(resourcePaths('mcps', 'mcp-foo', '/tmp/proj'), []);
  assert.deepEqual(resourcePaths('rules', 'rule-foo', '/tmp/proj'), []);
});

test('makeResourcePaths: unknown type returns []', () => {
  const resourcePaths = makeResourcePaths({
    agentsDir: '.x/agents',
    skillsDir: '.x/skills',
    assertSafeName: FAKE_ASSERT_SAFE_NAME,
  });
  assert.deepEqual(resourcePaths('not-a-type', 'foo', '/tmp/proj'), []);
});

test('makeResourcePaths: delegates name validation to assertSafeName', () => {
  // Asserts assertSafeName is called with (name, type) BEFORE path construction.
  let captured = null;
  const stubAssert = (name, type) => { captured = { name, type }; };
  const resourcePaths = makeResourcePaths({
    agentsDir: '.x/agents',
    skillsDir: '.x/skills',
    assertSafeName: stubAssert,
  });
  resourcePaths('agents', 'coder', '/tmp/proj');
  assert.deepEqual(captured, { name: 'coder', type: 'agents' });
});

test('makeResourcePaths: propagates throw from assertSafeName', () => {
  const strictAssert = (name, type) => {
    throw new Error(`Invalid ${type} name "${name}"`);
  };
  const resourcePaths = makeResourcePaths({
    agentsDir: '.x/agents',
    skillsDir: '.x/skills',
    assertSafeName: strictAssert,
  });
  assert.throws(
    () => resourcePaths('agents', '..', '/tmp/proj'),
    /Invalid agents name "\.\."/,
  );
});

test('makeCleanupDirs: returns agents, skills, rootDir in order', () => {
  const cleanupDirs = makeCleanupDirs({ rootDir: '.claude' });
  assert.deepEqual(cleanupDirs('/tmp/proj'), [
    '/tmp/proj/.claude/agents',
    '/tmp/proj/.claude/skills',
    '/tmp/proj/.claude',
  ]);
});

test('makeCleanupDirs: works for arbitrary rootDir', () => {
  const cleanupDirs = makeCleanupDirs({ rootDir: '.opencode' });
  assert.deepEqual(cleanupDirs('/tmp/proj'), [
    '/tmp/proj/.opencode/agents',
    '/tmp/proj/.opencode/skills',
    '/tmp/proj/.opencode',
  ]);
});
