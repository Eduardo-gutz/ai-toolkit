import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const VALIDATOR = join(import.meta.dirname, '../scripts/validate-frontmatter.mjs');

async function makeFixture(opts = {}) {
  // Use a unique prefix per test to avoid path conflicts in parallel runs
  const prefix = `aitk-validate-${opts.suffix || Math.random().toString(36).slice(2)}-`;
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const agents = join(dir, 'source/agents');
  const skills = join(dir, 'source/skills');
  await mkdir(agents, { recursive: true });
  await mkdir(join(skills, 'good-skill'), { recursive: true });
  await mkdir(join(skills, 'bad-skill'), { recursive: true });

  // Good agent
  await writeFile(join(agents, 'good-agent.md'), `---
name: good-agent
description: "A well-formed agent with a properly quoted description."
mode: all
---
Body
`);

  // Good skill
  await writeFile(join(skills, 'good-skill/SKILL.md'), `---
name: good-skill
description: A well-formed skill description.
---
Body
`);

  if (opts.badAgent) {
    await writeFile(join(agents, 'bad-agent.md'), `---
name: bad-agent
description: Missing quote and has : colon
mode: all
---
Body
`);
  }
  if (opts.badSkillLength) {
    await writeFile(join(skills, 'bad-skill/SKILL.md'), `---
name: bad-skill
description: "${'x'.repeat(1100)}"
---
Body
`);
  }
  if (opts.badSkillParse) {
    await writeFile(join(skills, 'bad-skill/SKILL.md'), `---
name: bad-skill
description: This has unquoted : colon
---
Body
`);
  }

  return dir;
}

function runValidator(cwd) {
  return spawnSync('node', [VALIDATOR], { cwd, encoding: 'utf8' });
}

function getOutput(result) {
  return (result.stdout || '') + (result.stderr || '');
}

test('validator: passes with all-good fixtures', async () => {
  const dir = await makeFixture();
  try {
    const result = runValidator(dir);
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`);
    assert.match(getOutput(result), /All source frontmatter valid/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validator: fails on bad agent YAML', async () => {
  const dir = await makeFixture({ badAgent: true, suffix: 'badagent' });
  try {
    const result = runValidator(dir);
    assert.equal(result.status, 1, `Expected exit 1, got ${result.status}`);
    assert.match(getOutput(result), /YAML parse error/);
    assert.match(getOutput(result), /bad-agent/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validator: fails on skill description too long', async () => {
  const dir = await makeFixture({ badSkillLength: true, suffix: 'badlen' });
  try {
    const result = runValidator(dir);
    assert.equal(result.status, 1);
    assert.match(getOutput(result), /exceeds 1024 chars/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validator: fails on skill YAML parse error', async () => {
  const dir = await makeFixture({ badSkillParse: true, suffix: 'badparse' });
  try {
    const result = runValidator(dir);
    assert.equal(result.status, 1);
    assert.match(getOutput(result), /YAML parse error/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validator: handles missing source/ directory gracefully', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aitk-empty-'));
  try {
    const result = runValidator(dir);
    assert.equal(result.status, 0, 'Should pass when no source files exist');
    assert.match(getOutput(result), /All source frontmatter valid/);
  } finally {
    await rm(dir, { recursive: true });
  }
});