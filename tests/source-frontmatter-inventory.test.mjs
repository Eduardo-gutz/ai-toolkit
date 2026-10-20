import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

// ─── Constants ──────────────────────────────────────────────

/**
 * Absolute path to the toolkit root (where source/ and scripts/ live).
 * The validator is run with `cwd` = this path so it walks `<root>/source/`.
 */
const TOOLKIT_ROOT = join(import.meta.dirname, '..');

const VALIDATOR = join(TOOLKIT_ROOT, 'scripts/validate-frontmatter.mjs');

/** Agent description cap, mirrored from scripts/validate-frontmatter.mjs:15. */
const AGENT_MAX_DESC = 220;

// ─── Helpers ────────────────────────────────────────────────

/**
 * Run the frontmatter validator as a subprocess against the real source/ tree.
 * Returns { status, stdout, stderr }.
 */
function runValidatorOnSource() {
  return spawnSync('node', [VALIDATOR], {
    cwd: TOOLKIT_ROOT,
    encoding: 'utf8',
  });
}

/** Concatenate stdout + stderr for output assertions. */
function getOutput(result) {
  return (result.stdout || '') + (result.stderr || '');
}

/**
 * Read an agent file's frontmatter and return the parsed object.
 * Throws a descriptive error if the file is missing.
 */
function readAgentFrontmatter(name) {
  const file = join(TOOLKIT_ROOT, 'source', 'agents', `${name}.md`);
  if (!existsSync(file)) {
    throw new Error(`Expected source agent file to exist: ${file}`);
  }
  const raw = readFileSync(file, 'utf8');
  return { file, frontmatter: matter(raw).data || {} };
}

// ─── Inventory check (closes the gap from the ui-ux-designer plan) ──

test('source-frontmatter-inventory: validator passes on real source/ tree', () => {
  const result = runValidatorOnSource();
  assert.equal(
    result.status,
    0,
    `Expected validator exit 0, got ${result.status}\n` +
      `stderr: ${result.stderr}\n` +
      `stdout: ${result.stdout}`,
  );
  assert.match(
    getOutput(result),
    /All source frontmatter valid/,
    'Validator should report success when every source/ file passes',
  );
});

// ─── Targeted regression: ui-ux-designer description must be ≤220 chars ──

test('source-frontmatter-inventory: ui-ux-designer.md description is ≤220 chars (regression for ui-ux-designer plan STEP 9 miss)', () => {
  const { file, frontmatter } = readAgentFrontmatter('ui-ux-designer');

  assert.ok(
    typeof frontmatter.description === 'string',
    `${file}: frontmatter.description must be a string`,
  );

  const len = frontmatter.description.length;
  assert.ok(
    len <= AGENT_MAX_DESC,
    `${file}: description exceeds ${AGENT_MAX_DESC} chars (got ${len}). ` +
      `Original bug: "Multi-runtime." pushed the description to 222 chars, ` +
      `which the agents-walker would skip. Truncated to "Multi-rt" (216 chars).`,
  );
});