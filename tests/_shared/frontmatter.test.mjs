import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, validateAgentFrontmatter, validateSkillFrontmatter } from '../../adapters/_shared/frontmatter.mjs';

test('parseMarkdown: splits frontmatter and body', () => {
  const md = `---
name: foo
description: bar
---
# Body
Hello world.
`;
  const result = parseMarkdown(md);
  assert.equal(result.frontmatter.name, 'foo');
  assert.equal(result.frontmatter.description, 'bar');
  assert.ok(result.body.includes('# Body'));
  assert.ok(result.body.includes('Hello world.'));
});

test('parseMarkdown: handles missing frontmatter', () => {
  const md = '# Just a body\nNo frontmatter here.';
  const result = parseMarkdown(md);
  assert.deepEqual(result.frontmatter, {});
  assert.equal(result.body.trim(), md);
});

test('validateAgentFrontmatter: passes with description', () => {
  const result = validateAgentFrontmatter({ description: 'A valid agent description.' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateAgentFrontmatter: fails without description', () => {
  const result = validateAgentFrontmatter({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('description')));
});

test('validateAgentFrontmatter: fails on > 220 char description', () => {
  const long = 'x'.repeat(221);
  const result = validateAgentFrontmatter({ description: long });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('220')));
});

test('validateSkillFrontmatter: passes with name + description', () => {
  const result = validateSkillFrontmatter({ name: 'foo', description: 'bar' });
  assert.equal(result.valid, true);
});

test('validateSkillFrontmatter: fails without name', () => {
  const result = validateSkillFrontmatter({ description: 'bar' });
  assert.equal(result.valid, false);
});

test('validateSkillFrontmatter: fails on invalid name pattern', () => {
  const result = validateSkillFrontmatter({ name: 'Bad_Name', description: 'bar' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('^[a-z0-9]+')));
});

test('validateSkillFrontmatter: fails on > 1024 char description', () => {
  const long = 'x'.repeat(1025);
  const result = validateSkillFrontmatter({ name: 'foo', description: long });
  assert.equal(result.valid, false);
});