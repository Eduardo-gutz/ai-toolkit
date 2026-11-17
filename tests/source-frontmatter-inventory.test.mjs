import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

/**
 * Collect every regular file under `dir`, recursively.
 * Returns paths relative to `dir`, sorted for deterministic output.
 *
 * The walk is hand-rolled on purpose: `readdirSync(dir, { recursive: true })`
 * needs Node >= 20.1.0, but package.json declares `engines.node >= 20.0.0`.
 */
function listFilesRecursively(dir, prefix = '') {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...listFilesRecursively(join(dir, entry.name), relativePath));
    } else if (entry.isFile()) {
      found.push(relativePath);
    }
  }
  return found.sort();
}

/**
 * Find the single contract line that contains `needle`.
 * Returns undefined when no line matches.
 * Throws when more than one line matches: a duplicated contract line would
 * silently retarget the guard instead of failing loudly.
 */
function findContractLine(file, needle) {
  const matches = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.includes(needle));
  assert.ok(
    matches.length <= 1,
    `${file}: expected exactly one contract line containing ${JSON.stringify(needle)}, ` +
      `found ${matches.length} — a duplicated contract line would silently retarget the guard`,
  );
  return matches[0];
}

/**
 * Find the planner's `> Origin:` rule line.
 * Throws a descriptive assertion when the rule is missing.
 */
function findOriginRule(file) {
  const rule = findContractLine(file, '`> Origin:` is repo-relative');
  assert.ok(rule, `${file}: body must contain the "> Origin:" rule`);
  return rule;
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

// ─── Plan location contract: the plan lives in the task folder ──

test('source-frontmatter-inventory: the task-planner writes its plan inside the .tasks folder', () => {
  const agentsDir = join(TOOLKIT_ROOT, 'source', 'agents');

  // (a) No file under source/agents/ may point at the legacy `.opencode/plans/`
  // root. The walk is recursive: a contract nested in a subdirectory is covered
  // too — a flat top-level scan would skip it without notice.
  const offenders = listFilesRecursively(agentsDir)
    .filter((name) => readFileSync(join(agentsDir, name), 'utf8').includes('.opencode/plans'))
    .map((name) => join('source', 'agents', name));
  assert.deepEqual(
    offenders,
    [],
    `Expected no agent contract to reference the legacy .opencode/plans root, ` +
      `but found it in: ${offenders.join(', ')}`,
  );

  const { file, frontmatter } = readAgentFrontmatter('task-planner');

  // (b) The planner may write only inside .tasks/ — nothing else.
  assert.equal(
    frontmatter.permission?.write?.['.tasks/**'],
    'allow',
    `${file}: permission.write[".tasks/**"] must be "allow"`,
  );
  assert.equal(
    frontmatter.permission?.write?.['*'],
    'deny',
    `${file}: permission.write["*"] must stay "deny"`,
  );

  // (d) The planner may create the task folder it writes into.
  assert.equal(
    frontmatter.permission?.bash?.['mkdir -p .tasks/*'],
    'allow',
    `${file}: permission.bash["mkdir -p .tasks/*"] must be "allow"`,
  );

  // (c) The planner body names the plan destination inside the task folder.
  // A separate `plan.md` assertion is redundant: the literal `plan.md` is a
  // substring of the pattern above, so it can never fail independently.
  const body = readFileSync(file, 'utf8');
  assert.match(
    body,
    /\.tasks\/<prefix>-<id>\/plan\.md/,
    `${file}: body must name the plan destination .tasks/<prefix>-<id>/plan.md`,
  );
});

// ─── Origin rule: positional provenance, both branches ──

test('source-frontmatter-inventory: the task-planner Origin rule does not hardcode the story filename pattern', () => {
  const { file } = readAgentFrontmatter('task-planner');
  const rule = findOriginRule(file);
  assert.doesNotMatch(
    rule,
    /\.tasks\/<prefix>-<id>\/<prefix>-<id>\.md/,
    `${file}: the Origin rule must not hardcode .tasks/<prefix>-<id>/<prefix>-<id>.md — ` +
      `a folder holding several sub-stories contains 001-frontend.md, not <prefix>-<id>.md`,
  );
});

test('source-frontmatter-inventory: the task-planner Origin rule defines the free-form branch', () => {
  const { file } = readAgentFrontmatter('task-planner');
  const rule = findOriginRule(file);
  assert.match(
    rule,
    /\*\*Without a user story\*\*[^\n]*\.tasks\/<NNN>-<slug>\//,
    `${file}: the Origin rule must define the free-form branch — with no user story, ` +
      `> Origin: carries the repo-relative path of the task folder just created`,
  );
});

test('source-frontmatter-inventory: the task-planner Origin rule defines the with-user-story branch', () => {
  const { file } = readAgentFrontmatter('task-planner');
  const rule = findOriginRule(file);
  assert.match(
    rule,
    /\*\*With a user story\*\*/,
    `${file}: the Origin rule must name the with-user-story branch — that is the ` +
      `planner's normal path, and an undefined branch leaves > Origin: without a value`,
  );
  assert.match(
    rule,
    /\*\*With a user story\*\*[^\n]*same task folder/,
    `${file}: the with-user-story branch must point at the story file living in the ` +
      `same task folder as the plan, whatever its name`,
  );
});

// ─── Shared numbering: the prohibition binds both agents ──

test('source-frontmatter-inventory: the shared-numbering rule binds the folder-number prohibition to both agents', () => {
  const { file } = readAgentFrontmatter('task-builder');
  const rule = findContractLine(file, '**Shared numbering**');
  assert.ok(rule, `${file}: body must contain the "Shared numbering" rule`);
  assert.match(
    rule,
    /Neither agent reuses a number whose folder already exists/,
    `${file}: the shared-numbering rule must state the prohibition for both agents — ` +
      `an imperative with no subject binds it to the planner alone`,
  );
});