// Tests for the greenfield prompt pack source tree.
//
// source/prompts/greenfield/ is the source of truth for the /greenfield
// command: 1 conductor + 9 numbered supporting prompts + a defaults/
// catalog of 11 stack files (1 baseline + 6 base stacks + 4 framework
// tiers).
//
// Behavior under test:
//   - All 10 prompt files exist and are non-empty.
//   - The conductor references every registered supporting file and the
//     baseline asset (as ./0X-… / ./defaults/…).
//   - The ```json block in 03-standards.md parses and its leaf paths are
//     exactly the standards schema leaf list.
//   - The 12 Tier-1 question anchors are present in 02-interview.md and
//     each maps to a leaf of that schema.
//   - Every ## Defaults field path in the 11 catalog files resolves to a
//     schema leaf.
//   - STRICT DEFAULTING: no catalog file provides a default for any of the
//     18 fields that no Tier-1 question closes — those stay in the explicit
//     pending allowlist of _baseline.md.
//   - _baseline.md reconciles against the schema leaf list: every leaf is
//     either defaulted by the baseline or explicitly listed as pending.
//   - The registry and the defaults/ directory agree in both directions.
//   - stack_hint uses exactly the 11-value vocabulary.
//   - The catalog has two classes: a base catalog owns all 14
//     stack-specific fields, a framework catalog owns 9 and inherits the
//     rest through an explicit `Inherits from:` chain.
//   - The greenfield 08-agents-md.md reports "no change" to the conductor
//     in its idempotency preamble and declares the 4 concrete .context/
//     artifacts in its ## Context index table (and never .context/examples/).
//   - The greenfield discoverability surfaces (the context-interviewer
//     agent + the two adapters' greenfield frontmatter) scope greenfield
//     by RELEVANCE — "nothing substantive to extract", never "no code".
//
// Reads from the real toolkit (not a fixture) because source/prompts/ is
// the canonical reference; if it changes, the tests document that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';

import { PROMPT_PACKS } from '../adapters/_shared/prompt-pack.mjs';

const TOOLKIT_ROOT = join(import.meta.dirname, '..');
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');
const PACK_DIR = join(TOOLKIT_SOURCE, 'prompts', 'greenfield');
const DEFAULTS_DIR = join(PACK_DIR, 'defaults');

const PROMPT_FILES = [
  '00-conductor.md',
  '01-pre-flight.md',
  '02-interview.md',
  '03-standards.md',
  '04-stack.md',
  '05-architecture.md',
  '06-code-style.md',
  '07-conventions.md',
  '08-agents-md.md',
  '09-prune.md',
];

const CATALOG_FILES = [
  '_baseline.md',
  'node-typescript.md',
  'python.md',
  'react-native.md',
  'react.md',
  'nextjs.md',
  'express.md',
  'fastapi.md',
  'php.md',
  'android.md',
  'ios.md',
];

// The canonical 11-value stack_hint vocabulary, in order: the 10 ids a
// catalog resolves to, plus `unknown` (no catalog matches it). The q1
// option list is these same ids plus `other`.
const STACK_IDS = [
  'node-typescript',
  'python',
  'react-native',
  'react',
  'nextjs',
  'express',
  'fastapi',
  'php',
  'android',
  'ios',
  'unknown',
];

// The pipe form of the vocabulary, derived from the id list so the string
// and the list cannot drift.
const STACK_HINT_VOCABULARY = STACK_IDS.join(' | ');

// The two catalog classes. A base catalog owns all 10 stack-specific
// fields and inherits from nothing; a framework catalog owns only the 5
// framework-shaped fields and inherits the rest through its chain.
const BASE_CATALOGS = [
  'node-typescript.md',
  'python.md',
  'react-native.md',
  'php.md',
  'android.md',
  'ios.md',
];

const FRAMEWORK_CATALOGS = [
  'react.md',
  'nextjs.md',
  'express.md',
  'fastapi.md',
];

// The base every framework catalog declares through `Inherits from:`.
const CATALOG_CHAIN = {
  'react.md': 'node-typescript',
  'nextjs.md': 'react',
  'express.md': 'node-typescript',
  'fastapi.md': 'python',
};

// The resolved chain of every framework catalog: base first, leaf last.
const EXPECTED_CHAINS = {
  'react.md': ['node-typescript.md', 'react.md'],
  'nextjs.md': ['node-typescript.md', 'react.md', 'nextjs.md'],
  'express.md': ['node-typescript.md', 'express.md'],
  'fastapi.md': ['python.md', 'fastapi.md'],
};

// The 9 fields a framework catalog owns: its own identity plus the 4
// framework-shaped ones, plus the 4 architecture fields (the tree shape,
// the layer flow, the allowed arrows and the folder casing) — a framework
// names its own folders, so it cannot inherit them from the base. The
// other 5 come from the base.
const FRAMEWORK_OWNED_FIELDS = [
  'stack.id',
  'stack.framework',
  'stack.test_framework',
  'standards.testing.framework',
  'standards.architecture.structure_type',
  'standards.architecture.module_layout',
  'standards.architecture.layer_flow',
  'standards.architecture.dependency_direction',
  'standards.architecture.directory_conventions',
];

// The generic (non-stack-specific) fields a framework catalog must never
// declare — those come from _baseline.md.
//
// NOTE: the guard below is the `deepEqual` on FRAMEWORK_OWNED_FIELDS. It
// asserts the field set EXACTLY, so a framework catalog that declared a
// generic field would fail on the set mismatch — a pattern list on top of
// it could never fire and would only hide the real rule.
const GENERIC_FIELD_NOTE =
  'a framework catalog declares exactly the framework-owned fields; every ' +
  'generic field comes from _baseline.md';

// The standards schema leaf paths — the canonical list from the plan's
// 03-standards.md schema. Every value carries {value, origin}.
const SCHEMA_LEAVES = [
  'stack.id',
  'stack.language',
  'stack.language_version',
  'stack.package_manager',
  'stack.test_framework',
  'stack.linter',
  'stack.formatter',
  'stack.framework',
  'standards.code_style.naming_files',
  'standards.code_style.naming_classes',
  'standards.code_style.naming_functions',
  'standards.code_style.naming_variables',
  'standards.code_style.naming_constants',
  'standards.code_style.imports_order',
  'standards.code_style.error_handling_pattern',
  'standards.code_style.async_pattern',
  'standards.code_style.export_style',
  'standards.code_style.comments',
  'standards.architecture.structure_type',
  'standards.architecture.layer_flow',
  'standards.architecture.module_layout',
  'standards.architecture.dependency_direction',
  'standards.architecture.directory_conventions',
  'standards.testing.framework',
  'standards.testing.test_naming',
  'standards.testing.test_placement',
  'standards.testing.test_style',
  'standards.testing.coverage_gate',
  'standards.git_ci.branching',
  'standards.git_ci.commit_style',
  'standards.git_ci.ci_platform',
  'standards.git_ci.required_checks',
  'standards.git_ci.review_policy',
  'standards.cross_cutting.auth',
  'standards.cross_cutting.logging',
  'standards.cross_cutting.errors',
  'standards.cross_cutting.validation',
  'standards.cross_cutting.i18n',
  'standards.cross_cutting.cache',
  'standards.cross_cutting.feature_flags',
  'standards.cross_cutting.rate_limiting',
  'standards.product.documentation',
  'standards.product.accessibility',
  'standards.product.license',
  'standards.product.performance_budget',
];

// The 27 leaves closed by the 12 mandatory Tier-1 questions.
const TIER1_CLOSED = new Set([
  'stack.id',
  'stack.language',
  'stack.language_version',
  'stack.package_manager',
  'standards.architecture.structure_type',
  'standards.architecture.module_layout',
  'standards.architecture.directory_conventions',
  'standards.architecture.dependency_direction',
  'standards.architecture.layer_flow',
  'standards.code_style.naming_files',
  'standards.code_style.naming_functions',
  'standards.code_style.naming_classes',
  'standards.code_style.naming_variables',
  'standards.code_style.naming_constants',
  'standards.code_style.imports_order',
  'standards.code_style.export_style',
  'standards.code_style.error_handling_pattern',
  'standards.code_style.async_pattern',
  'standards.testing.framework',
  'standards.testing.test_naming',
  'standards.testing.test_placement',
  'standards.git_ci.commit_style',
  'standards.git_ci.branching',
  'standards.git_ci.ci_platform',
  'standards.cross_cutting.errors',
  'standards.cross_cutting.logging',
  'standards.cross_cutting.validation',
]);

// The 18 leaves that NO Tier-1 question closes. Under STRICT DEFAULTING
// these must stay pending — the baseline must NOT supply a generic default
// for any of them.
const UNASKED = SCHEMA_LEAVES.filter((leaf) => !TIER1_CLOSED.has(leaf));

// The stack-specific fields are the ones a per-stack catalog file provides
// (and that the baseline leaves pending when no per-stack file exists).
//
// The set has three parts:
//   1. the 7 toolchain fields (language, version, package manager, test
//      runner, linter, formatter, framework) plus `stack.id`, which the
//      per-stack file owns because it IS that stack;
//   2. the 2 Tier-1 fields a per-stack file overrides —
//      `standards.architecture.structure_type` (Q2) and
//      `standards.testing.framework` (Q10) — so they have a stack-specific
//      value when the developer takes the "use the defaults" escape hatch;
//   3. the 4 architecture fields that name REAL folders — the tree shape,
//      the layer vocabulary, the allowed arrows and the folder casing. They
//      are stack-specific because `src/core + src/modules/<feature>` is not
//      the tree of a Python project and `routes → controller → helpers` is
//      not the layer flow of a React one. A generic default for them would
//      describe a tree that does not exist in the stack.
//
// This list mirrors the plan's STACK_SPECIFIC list (step 3).
const STACK_SPECIFIC = new Set([
  'stack.id',
  'stack.language',
  'stack.language_version',
  'stack.package_manager',
  'stack.test_framework',
  'stack.linter',
  'stack.formatter',
  'stack.framework',
  'standards.architecture.structure_type',
  'standards.architecture.module_layout',
  'standards.architecture.layer_flow',
  'standards.architecture.dependency_direction',
  'standards.architecture.directory_conventions',
  'standards.testing.framework',
]);

// The four sections every catalog file declares, in canonical order.
const CATALOG_REQUIRED_SECTIONS = [
  '## Stack signature',
  '## Defaults',
  '## Tier 2 questions',
  '## Prescribed patterns',
];

// The optional sections a catalog file may declare, and where they may
// appear: `_baseline.md` declares the pending allowlist; a per-stack file
// may declare at most one verification section.
const CATALOG_OPTIONAL_SECTIONS = {
  '_baseline.md': ['## Pending allowlist'],
  'node-typescript.md': ['## Verification loop', '## Verification tooling'],
  'python.md': ['## Verification loop', '## Verification tooling'],
  'react-native.md': ['## Verification loop', '## Verification tooling'],
  'react.md': [],
  'nextjs.md': [],
  'express.md': [],
  'fastapi.md': [],
  'php.md': ['## Verification loop', '## Verification tooling'],
  'android.md': ['## Verification loop', '## Verification tooling'],
  'ios.md': ['## Verification loop', '## Verification tooling'],
};

// The unasked fields that NO catalog file may ever default.
const UNASKED_NEVER_DEFAULTED = UNASKED.filter((leaf) => !STACK_SPECIFIC.has(leaf));

// The 12 mandatory Tier-1 question anchors.
const TIER1_ANCHORS = [
  'stack.id',
  'standards.architecture.structure_type',
  'standards.architecture.module_layout',
  'standards.architecture.dependency_direction',
  'standards.code_style.naming_files',
  'standards.code_style.naming_functions',
  'standards.code_style.imports_order',
  'standards.code_style.error_handling_pattern',
  'standards.code_style.async_pattern',
  'standards.testing.framework',
  'standards.git_ci.commit_style',
  'standards.cross_cutting.errors',
];

function readPackFile(name) {
  return readFileSync(join(PACK_DIR, name), 'utf8');
}

/**
 * Read a file of the extractive (bootstrap) pack.
 * @param {string} name
 * @returns {string}
 */
function readBootstrapPackFile(name) {
  return readFileSync(join(TOOLKIT_SOURCE, 'prompts', 'bootstrap', name), 'utf8');
}

/**
 * Extract the "### 4. Greenfield detection" section of a pre-flight prompt.
 * @param {string} preflight
 * @returns {string}
 */
function greenfieldSection(preflight) {
  const start = preflight.indexOf('### 4. Greenfield detection');
  assert.ok(start !== -1,
    'the pre-flight must have a "### 4. Greenfield detection" section');
  const end = preflight.indexOf('\n## ', start);
  assert.ok(end > start,
    'the greenfield section must be followed by another "## " section');
  return preflight.slice(start, end);
}

/**
 * Extract the "## Output" section of a pre-flight prompt.
 * @param {string} preflight
 * @returns {string}
 */
function outputSection(preflight) {
  const start = preflight.indexOf('## Output');
  assert.ok(start !== -1, 'the pre-flight must have a "## Output" section');
  const end = preflight.indexOf('\n## ', start);
  assert.ok(end > start,
    'the output section must be followed by another "## " section');
  return preflight.slice(start, end);
}

/**
 * Parse the stack_hint id list out of the `## Rules` clause of a
 * pre-flight prompt. The clause states the ids as a prose list — comma-
 * or pipe-separated — so the bullet is collected (with its wrapped
 * continuation lines) and the ids are split out of it.
 * @param {string} content - the pre-flight markdown
 * @returns {string[]} the declared ids, in declaration order
 */
function rulesStackHintIds(content) {
  const start = content.indexOf('## Rules\n');
  assert.notEqual(start, -1, 'the pre-flight must have a "## Rules" section');
  const rest = content.slice(start + '## Rules\n'.length);
  const end = rest.search(/\n##\s/);
  const section = end === -1 ? rest : rest.slice(0, end);

  const bullet = section
    .split(/\n(?=\s*-\s)/)
    .find((part) => part.includes('`stack_hint`') && /exactly (eleven|11) values/i.test(part));
  assert.ok(bullet, 'the ## Rules section must declare the stack_hint value list');

  const marker = bullet.match(/exactly (?:eleven|11) values?\s*:?\s*/i);
  assert.ok(marker, 'the ## Rules clause must state how many values it lists');

  return [...bullet.slice(marker.index + marker[0].length).matchAll(/`([^`]+)`/g)]
    .flatMap((match) => match[1].split('|'))
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

/**
 * Normalize markdown prose for regex matching: drop the backticks and the
 * emphasis markers and collapse the line breaks, so a phrase may span two
 * source lines and is not broken by markdown formatting.
 * @param {string} content
 * @returns {string}
 */
function flatten(content) {
  return content.replace(/[`*]/g, '').replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Extract the first fenced ```json block from a markdown file.
 * @param {string} content
 * @returns {string} the raw JSON text
 */
function firstJsonBlock(content) {
  const match = content.match(/```json\n([\s\S]*?)```/);
  assert.ok(match, 'file must contain a ```json fenced block');
  return match[1];
}

/**
 * Extract the JSON payload of the fenced block that carries `marker`.
 *
 * The agent's QUESTION_BANK block is a plain fence (not tagged `json`)
 * whose first line is the marker itself, so the payload starts right
 * after the marker.
 *
 * @param {string} content
 * @param {string} marker
 * @returns {object} the parsed JSON payload
 */
function jsonBlockAfterMarker(content, marker) {
  const re = /```(?:json)?\n([\s\S]*?)```/g;
  for (const match of content.matchAll(re)) {
    const markerAt = match[1].indexOf(marker);
    if (markerAt === -1) continue;
    return JSON.parse(match[1].slice(markerAt + marker.length).trim());
  }
  assert.fail(`no fenced block carries the "${marker}" marker`);
}

/**
 * Collect the leaf paths of a standards JSON object. A leaf is an object
 * carrying a `value` key (the {value, origin} provenance shape).
 * @param {object} node
 * @param {string} [prefix]
 * @returns {string[]}
 */
function collectLeaves(node, prefix = '') {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  if ('value' in node) return [prefix];
  const out = [];
  for (const [key, child] of Object.entries(node)) {
    out.push(...collectLeaves(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

/**
 * Extract the markdown table rows of a section.
 * @param {string} content
 * @param {string} heading - the section heading (e.g. '## Defaults')
 * @returns {string[][]} the parsed rows (cells), excluding the header and separator
 */
function sectionRows(content, heading) {
  const start = content.indexOf(`${heading}\n`);
  assert.ok(start !== -1, `file must contain the "${heading}" section`);
  const rest = content.slice(start + heading.length + 1);
  const nextHeading = rest.search(/\n##\s/);
  const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const rows = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    // Skip the header row and the separator row.
    if (cells.every((c) => c === '' || /^-+$/.test(c))) continue;
    rows.push(cells);
  }
  // Drop the header row (first non-separator row) — detect by the separator
  // that follows it.
  const lines = body.split('\n').filter((l) => l.trim().startsWith('|'));
  const headerIdx = lines.findIndex((l) => /^\|[\s:-]+\|[\s:|-]*$/.test(l.trim().replace(/[^|\s:-]/g, '')) );
  return headerIdx === -1 ? rows : rows.slice(1);
}

/**
 * Collect the field paths declared in a catalog file's `## Defaults` table.
 * @param {string} content
 * @returns {string[]}
 */
function defaultsFields(content) {
  return sectionRows(content, '## Defaults').map((row) => row[0].replace(/`/g, '').trim());
}

/**
 * Collect the field paths declared in a catalog file's `## Tier 2 questions` table.
 * @param {string} content
 * @returns {string[]}
 */
function tier2Fields(content) {
  const rows = sectionRows(content, '## Tier 2 questions');
  // The table shape is | Question | Options | Field | → the field is the last cell.
  return rows.map((row) => row[row.length - 1].replace(/`/g, '').trim());
}

/**
 * Collect the field paths listed in a catalog file's `## Pending allowlist` table.
 * @param {string} content
 * @returns {string[]}
 */
function allowlistFields(content) {
  if (!content.includes('## Pending allowlist')) return [];
  return sectionRows(content, '## Pending allowlist').map((row) => row[0].replace(/`/g, '').trim());
}

/**
 * Read a catalog file from the defaults/ directory.
 * @param {string} name - the file name (e.g. 'nextjs.md')
 * @returns {string}
 */
/**
 * Extract the `### Module layout` tree of a catalog file.
 *
 * @param {string} content - the catalog content
 * @returns {string} the tree, or '' when the block is absent
 */
function moduleLayoutTree(content) {
  const start = content.indexOf('### Module layout');
  if (start === -1) return '';
  const block = content.slice(start);
  const fenced = block.match(/```\n([\s\S]*?)```/);
  return fenced ? fenced[1] : '';
}

/**
 * Collect the folder names a tree declares, with their exact casing.
 *
 * @param {string} tree - the module layout tree
 * @returns {Set<string>} the folder names
 */
function treeFolders(tree) {
  const folders = new Set();
  for (const line of tree.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][\w-]*)\//);
    if (match) folders.add(match[1]);
  }
  return folders;
}

/**
 * Collect the folders declared INSIDE the module block of a tree.
 *
 * A tree declares shared code at the root (`core/`) and one block per
 * business feature (`modules/<feature>/`). The module block is the one
 * that owns the module's own folders. The root also declares a
 * `services/` folder for third-party communication, so a rule about the
 * module's own folders must not read the root.
 *
 * @param {string} tree - the module layout tree
 * @returns {Set<string>} the module-level folder names
 */
function moduleTreeFolders(tree) {
  const folders = new Set();
  let inModule = false;
  let moduleIndent = 0;
  for (const line of tree.split('\n')) {
    const match = line.match(/^(\s*)([A-Za-z_][\w-]*)\/\s*(#.*)?$/);
    if (!match) continue;
    const indent = match[1].length;
    const name = match[2];

    if (!inModule) {
      // The module block is `modules/` or `Modules/`; its children are the
      // module's own folders.
      if (name !== 'modules' && name !== 'Modules') continue;
      inModule = true;
      moduleIndent = indent;
      continue;
    }

    // A folder at the module's own level (a sibling of `modules/`) ends
    // the block.
    if (indent <= moduleIndent) {
      inModule = false;
      continue;
    }
    folders.add(name);
  }
  return folders;
}

/**
 * Assert that every provenance marker records a NEUTRAL catalog path.
 *
 * A marker names the catalog file a value came from. The value is copied
 * verbatim into the generated `.context/` files, where it must be a plain
 * relative path — `defaults/<file>.md` — with no prefix of any kind.
 * The placeholder form (`defaults/<stack>.md`) is the one other shape a
 * marker is allowed to take.
 *
 * @param {string[]} markers - the markers found in a file
 * @param {string} where - the file the markers came from
 */
function assertMarkerShape(markers, where) {
  const SHAPES = [
    /^defaults\/[A-Za-z0-9._-]+\.md$/,
    /^defaults\/<[a-z-]+>\.md$/,
    /^<file>$/,
    /…/,
  ];
  for (const marker of markers) {
    const value = marker.slice('[default:'.length, -1).trim();
    assert.ok(
      SHAPES.some((shape) => shape.test(value)),
      `${where}: the marker "${marker}" must record a neutral catalog path — ` +
      'expected `defaults/<file>.md`, with no prefix'
    );
  }
}

function readCatalog(name) {
  return readFileSync(join(DEFAULTS_DIR, name), 'utf8');
}

/**
 * Collect the `## Defaults` rows of a catalog file as a field → value map.
 * @param {string} content
 * @returns {Map<string, string>}
 */
function defaultsMap(content) {
  const map = new Map();
  for (const row of sectionRows(content, '## Defaults')) {
    map.set(row[0].replace(/`/g, '').trim(), row[1]);
  }
  return map;
}

/**
 * Extract the base catalog id a catalog declares through its
 * `- Inherits from:` line.
 * @param {string} content
 * @returns {string|null} the base catalog id, or null when none is declared
 */
function inheritsFrom(content) {
  const match = content.match(/^- Inherits from: `([^`]+)`[ \t]*$/m);
  return match ? match[1] : null;
}

/**
 * Resolve a catalog's inheritance chain from the files themselves: the
 * chain is ordered base first, leaf last. The walk stops at a repeated id
 * so a cycle cannot hang the test.
 * @param {string} name - the leaf catalog file name
 * @returns {string[]} the resolved chain, base first and leaf last
 */
function resolveChain(name) {
  const chain = [];
  const visited = new Set();
  let current = name;
  while (current) {
    if (visited.has(current)) break;
    visited.add(current);
    chain.unshift(current);
    const base = inheritsFrom(readCatalog(current));
    current = base ? `${base}.md` : null;
  }
  return chain;
}

/**
 * Merge a catalog's chain into the effective `## Defaults` set: the merge
 * is field-level and the leaf wins on overlap.
 * @param {string} name - the leaf catalog file name
 * @returns {Map<string, string>} the merged field → value map
 */
function mergedDefaults(name) {
  const merged = new Map();
  for (const file of resolveChain(name)) {
    for (const [field, value] of defaultsMap(readCatalog(file))) {
      merged.set(field, value);
    }
  }
  return merged;
}

/**
 * Extract the first-cell values of the `## Context index` table of a
 * generator prompt — the concrete `.context/` artifact rows it declares.
 * @param {string} content
 * @returns {string[]}
 */
function contextIndexRows(content) {
  const headerIdx = content.indexOf('| File');
  assert.ok(headerIdx !== -1,
    'the prompt must declare a context index table with a "File" column');
  const rows = [];
  for (const line of content.slice(headerIdx).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      // The table ends at the first non-table line once the rows started.
      if (rows.length > 0) break;
      continue;
    }
    rows.push(trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|').map((cell) => cell.trim().replace(/`/g, '')));
  }
  // Drop the header row and the separator row.
  return rows.slice(2).map((row) => row[0]);
}

test('greenfield: all 10 prompt files exist and are non-empty', () => {
  for (const name of PROMPT_FILES) {
    const path = join(PACK_DIR, name);
    assert.ok(existsSync(path), `${name} must exist at ${path}`);
    const content = readPackFile(name);
    assert.ok(content.length > 0, `${name} must be non-empty`);
  }
});

test('greenfield: the conductor references every supporting file and the baseline asset', () => {
  const conductor = readPackFile('00-conductor.md');

  for (const name of PROMPT_FILES.filter((n) => n !== '00-conductor.md')) {
    assert.ok(conductor.includes(`./${name}`),
      `conductor must reference ./${name}`);
  }
  assert.ok(conductor.includes('./defaults/_baseline.md'),
    'conductor must reference ./defaults/_baseline.md');
  assert.ok(conductor.includes('./defaults/<stack>.md'),
    'conductor must reference the per-stack asset ./defaults/<stack>.md');
});

test('greenfield: 03-standards.md ships a parseable JSON schema with the exact leaf list', () => {
  const content = readPackFile('03-standards.md');
  const schema = JSON.parse(firstJsonBlock(content));

  const leaves = collectLeaves(schema).sort();
  assert.deepEqual(leaves, [...SCHEMA_LEAVES].sort(),
    'the standards schema must declare exactly the canonical leaf list');

  // Every leaf carries the provenance pair.
  const walk = (node) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
    if ('value' in node) {
      assert.ok('origin' in node, 'every leaf must carry an origin');
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(schema);
});

test('greenfield: 02-interview.md declares the 12 Tier-1 anchors and the escape hatch', () => {
  const content = readPackFile('02-interview.md');

  for (const anchor of TIER1_ANCHORS) {
    assert.ok(content.includes(anchor),
      `02-interview.md must reference the Tier-1 anchor "${anchor}"`);
    assert.ok(SCHEMA_LEAVES.includes(anchor),
      `Tier-1 anchor "${anchor}" must be a leaf of the standards schema`);
  }

  assert.ok(content.includes('use the defaults'),
    '02-interview.md must document the "use the defaults" escape hatch');
  assert.ok(/12/.test(content), '02-interview.md must state the 12-question budget');
});

test('greenfield: 02-interview.md declares EXACTLY 12 Tier-1 questions, q1..q12', () => {
  // The plan's acceptance is that the Tier-1 question count does not drop
  // below 12. Asserting the anchors are present is not enough: a 13th
  // question, a duplicated row or a reworded anchor would still pass. The
  // table itself is the contract, so parse it and count the rows.
  const content = readPackFile('02-interview.md');
  const rows = sectionRows(content, '## The 12 mandatory questions');

  assert.equal(rows.length, 12,
    'the mandatory Tier-1 table must declare exactly 12 questions');

  const ids = rows.map((row) => row[0].replace(/`/g, '').trim());
  assert.deepEqual(ids, ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12'],
    'the Tier-1 question ids must be q1..q12, in order');
  assert.equal(new Set(ids).size, ids.length,
    'the Tier-1 question ids must be unique');
});

test('greenfield: 01-pre-flight.md uses the exact stack_hint vocabulary', () => {
  const content = readPackFile('01-pre-flight.md');

  assert.ok(content.includes('"greenfield"'), '01-pre-flight.md must expose a greenfield field');
  assert.ok(content.includes('stack_hint'), '01-pre-flight.md must expose a stack_hint field');
  assert.ok(content.includes(STACK_HINT_VOCABULARY),
    `01-pre-flight.md must declare the exact vocabulary "${STACK_HINT_VOCABULARY}"`);
});

test('greenfield: the generator prompts render the provenance markers', () => {
  for (const name of ['04-stack.md', '05-architecture.md', '06-code-style.md', '07-conventions.md', '08-agents-md.md']) {
    const content = readPackFile(name);
    assert.ok(content.includes('[confirmed]'), `${name} must render the [confirmed] marker`);
    assert.ok(content.includes('[default'), `${name} must render the [default: …] marker`);
    assert.ok(content.includes('[pending]'), `${name} must render the [pending] marker`);
  }
});


test('greenfield: every layer in a catalog layer_flow names a folder its own tree declares', () => {
  // The generated architecture.md has one section per layer, and the layer
  // names ARE folders (see 05-architecture.md). A layer_flow that names a
  // folder the tree does not have produces an architecture document that
  // describes a structure the project does not have.
  for (const name of CATALOG_FILES) {
    if (name === '_baseline.md') continue;
    const content = readCatalog(name);
    const flow = defaultsMap(content).get('standards.architecture.layer_flow');
    assert.ok(flow, `${name} must declare a layer_flow`);
    // The value is written in backticks in the table cell.
    const bareFlow = flow.replace(/`/g, '');

    const tree = moduleLayoutTree(content);
    assert.ok(tree, `${name} must declare a "### Module layout" tree`);
    const folders = treeFolders(tree);

    for (const raw of bareFlow.split('\u2192').map((part) => part.trim())) {
      if (!raw) continue;
      // A layer may be a folder, a file, or a pattern (`app/<route>.tsx`).
      // What it always names is its first path segment.
      const segment = raw.split('/')[0];
      assert.ok(folders.has(segment),
        `${name}: the layer "${raw}" names "${segment}", which the module layout tree does not declare ` +
        `(the tree has: ${[...folders].sort().join(', ')})`);
    }
  }
});

test('greenfield: a provenance marker in the SOURCE never carries a path prefix', () => {
  // A `[default: …]` marker is DATA: it is copied verbatim into the
  // generated `.context/` files, where a path prefix (`./`, `@`) would name
  // a path that does not exist. The adapters strip a prefix before
  // installing, so a prefixed marker would not break the install — it
  // would break the source's own contract, and hide the fact that the
  // marker is not a reference. This guard keeps the source honest.
  for (const name of CATALOG_FILES) {
    const content = readCatalog(name);
    const markers = content.match(/\[default:[^\]]*\]/g) ?? [];
    assertMarkerShape(markers, name);
  }

  // The same rule applies to the pack's own prompts: a marker there is
  // copied into the generated files too.
  for (const name of PROMPT_FILES) {
    const content = readPackFile(name);
    const markers = content.match(/\[default:[^\]]*\]/g) ?? [];
    assertMarkerShape(markers, name);
  }
});

test('greenfield: the catalog ships exactly 11 files, each with the four required sections', () => {
  const onDisk = readdirSync(DEFAULTS_DIR).filter((f) => f.endsWith('.md')).sort();
  assert.deepEqual(onDisk, [...CATALOG_FILES].sort(),
    'the defaults/ directory must contain exactly the 11 catalog files');

  for (const name of CATALOG_FILES) {
    const content = readFileSync(join(DEFAULTS_DIR, name), 'utf8');
    for (const heading of ['## Stack signature', '## Defaults', '## Tier 2 questions', '## Prescribed patterns']) {
      assert.ok(content.includes(heading), `${name} must contain the "${heading}" section`);
    }
  }
});

test('greenfield: a catalog file declares only the allowed sections, in order', () => {
  // The contract (source/prompts/_schema.md): the four required sections,
  // in this order, plus AT MOST ONE optional section — `## Pending
  // allowlist` for the baseline, or a `## Verification loop` /
  // `## Verification tooling` section for a per-stack file — placed between
  // `## Tier 2 questions` and `## Prescribed patterns`.
  for (const name of CATALOG_FILES) {
    const content = readFileSync(join(DEFAULTS_DIR, name), 'utf8');
    const headings = content
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.trim());

    const required = headings.filter((h) => CATALOG_REQUIRED_SECTIONS.includes(h));
    assert.deepEqual(required, CATALOG_REQUIRED_SECTIONS,
      `${name} must declare the four required sections, in canonical order`);

    const optional = headings.filter((h) => !CATALOG_REQUIRED_SECTIONS.includes(h));
    const allowed = CATALOG_OPTIONAL_SECTIONS[name];
    assert.ok(optional.length <= 1,
      `${name} must declare at most one optional section (got: ${optional.join(', ')})`);
    for (const heading of optional) {
      assert.ok(allowed.includes(heading),
        `${name} must not declare the section "${heading}" — allowed: ${allowed.join(', ') || 'none'}`);
    }

    if (optional.length > 0) {
      const optionalIdx = headings.indexOf(optional[0]);
      const tier2Idx = headings.indexOf('## Tier 2 questions');
      const patternsIdx = headings.indexOf('## Prescribed patterns');
      assert.ok(optionalIdx > tier2Idx && optionalIdx < patternsIdx,
        `${name} must place "${optional[0]}" between "## Tier 2 questions" and "## Prescribed patterns"`);
    }
  }
});

test('greenfield: the registry and the defaults/ directory agree in both directions', () => {
  const registered = [...PROMPT_PACKS.greenfield.assets].sort();
  const onDisk = readdirSync(DEFAULTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `defaults/${f}`)
    .sort();

  assert.deepEqual(onDisk, registered,
    'the defaults/ directory and PROMPT_PACKS.greenfield.assets must list the same files');
});

test('greenfield: every catalog Defaults field path resolves to a schema leaf', () => {
  for (const name of CATALOG_FILES) {
    const content = readFileSync(join(DEFAULTS_DIR, name), 'utf8');
    const fields = defaultsFields(content);
    assert.ok(fields.length > 0, `${name} must declare at least one default`);
    for (const field of fields) {
      assert.ok(SCHEMA_LEAVES.includes(field),
        `${name} declares "${field}", which is not a leaf of the standards schema`);
    }
  }
});

test('greenfield: STRICT DEFAULTING — the baseline never defaults a field that no question closes', () => {
  const baseline = readFileSync(join(DEFAULTS_DIR, '_baseline.md'), 'utf8');
  for (const field of defaultsFields(baseline)) {
    assert.ok(!UNASKED.includes(field),
      `_baseline.md must NOT provide a generic default for "${field}" — ` +
      'unasked fields stay pending and belong in the explicit pending allowlist');
  }
});

test('greenfield: STRICT DEFAULTING — no catalog file ever defaults a non-stack-specific unasked field', () => {
  for (const name of CATALOG_FILES) {
    const content = readFileSync(join(DEFAULTS_DIR, name), 'utf8');
    for (const field of defaultsFields(content)) {
      assert.ok(!UNASKED_NEVER_DEFAULTED.includes(field),
        `${name} must NOT provide a generic default for "${field}" — ` +
        'unasked fields stay pending and belong in the explicit pending allowlist');
    }
  }
});

test('greenfield: every per-stack file provides the stack-specific fields the baseline leaves pending', () => {
  const stackSpecificUnasked = [...UNASKED].filter((leaf) => STACK_SPECIFIC.has(leaf));
  assert.equal(stackSpecificUnasked.length, 4,
    'the stack-specific fields left pending by the baseline are the 4 toolchain ones');

  for (const name of CATALOG_FILES.filter((f) => f !== '_baseline.md')) {
    // The MERGED set: a framework catalog inherits stack.linter and
    // stack.formatter from its base instead of declaring them.
    const fields = [...mergedDefaults(name).keys()];
    for (const field of stackSpecificUnasked) {
      assert.ok(fields.includes(field),
        `${name} must provide the stack-specific default for "${field}" ` +
        '(it stays pending only when no per-stack file matches)');
    }
  }
});

// ─── Step 12 — the two catalog classes and the inheritance chain ─────────

test('greenfield: every base catalog declares EXACTLY the 14 stack-specific fields and no inheritance', () => {
  // The plan's STACK_SPECIFIC list, the catalog files and this guard must
  // agree: a base catalog owns the stack-specific fields, and nothing else.
  // A field the catalog declares that the guard does not know about is a
  // field nothing protects.
  for (const name of BASE_CATALOGS) {
    const content = readCatalog(name);
    const fields = defaultsFields(content);
    assert.deepEqual(
      [...fields].sort(),
      [...STACK_SPECIFIC].sort(),
      `${name} must declare exactly the 14 stack-specific fields (got: ${fields.join(', ')})`
    );
    assert.equal(inheritsFrom(content), null,
      `${name} is a base catalog — it must not declare an "Inherits from:" line`);
  }
});

test('greenfield: every framework catalog declares the 9 framework-owned fields and one inheritance', () => {
  for (const name of FRAMEWORK_CATALOGS) {
    const content = readCatalog(name);
    const fields = defaultsFields(content);

    assert.deepEqual(
      [...fields].sort(),
      [...FRAMEWORK_OWNED_FIELDS].sort(),
      `${name} must declare exactly the 9 framework-owned fields (got: ${fields.join(', ')}) — ` +
      GENERIC_FIELD_NOTE
    );

    const signature = content.slice(
      content.indexOf('## Stack signature'),
      content.indexOf('## Defaults')
    );
    const declarations = signature.match(/^- Inherits from: `[^`]+`[ \t]*$/gm) || [];
    assert.equal(declarations.length, 1,
      `${name} must declare exactly one "Inherits from:" line in its Stack signature`);
    assert.equal(inheritsFrom(content), CATALOG_CHAIN[name],
      `${name} must inherit from "${CATALOG_CHAIN[name]}"`);
  }
});

test('greenfield: every catalog chain terminates at a base catalog — no cycle', () => {
  for (const name of FRAMEWORK_CATALOGS) {
    const chain = resolveChain(name);

    assert.deepEqual(chain, EXPECTED_CHAINS[name],
      `${name} must resolve to the chain ${EXPECTED_CHAINS[name].join(' → ')}`);
    assert.equal(new Set(chain).size, chain.length,
      `${name} must not repeat a catalog in its chain`);
    assert.ok(BASE_CATALOGS.includes(chain[0]),
      `${name} chain must start at a base catalog (got "${chain[0]}")`);
    assert.equal(chain[chain.length - 1], name,
      `${name} chain must end at the leaf`);
    assert.equal(inheritsFrom(readCatalog(chain[0])), null,
      `${name} chain must terminate — "${chain[0]}" must not inherit from anything`);
  }
});

test('greenfield: the merged Defaults of a framework catalog cover all 14 stack-specific fields', () => {
  for (const name of FRAMEWORK_CATALOGS) {
    const merged = mergedDefaults(name);

    assert.deepEqual(
      [...merged.keys()].sort(),
      [...STACK_SPECIFIC].sort(),
      `${name} must cover all 14 stack-specific fields once merged (got: ${[...merged.keys()].join(', ')})`
    );

    // The leaf wins on overlap: every row the leaf declares keeps its value.
    for (const [field, value] of defaultsMap(readCatalog(name))) {
      assert.equal(merged.get(field), value,
        `${name}: the leaf row for "${field}" must win the merge`);
    }
  }
});

test('greenfield: under nextjs the merged stack.framework is the nextjs row, not react\'s', () => {
  const merged = mergedDefaults('nextjs.md');
  const reactValue = defaultsMap(readCatalog('react.md')).get('stack.framework');

  assert.notEqual(merged.get('stack.framework'), reactValue,
    'the nextjs leaf must override the react row for stack.framework');
  assert.equal(merged.get('stack.framework'),
    defaultsMap(readCatalog('nextjs.md')).get('stack.framework'),
    'the merged stack.framework must be the nextjs row');
});

test('greenfield: _baseline.md defaults none of the 14 stack-specific fields', () => {
  const fields = defaultsFields(readCatalog('_baseline.md'));
  for (const field of STACK_SPECIFIC) {
    assert.ok(!fields.includes(field),
      `_baseline.md must not default "${field}" — the stack catalogs own it`);
  }
});

test('greenfield: _baseline.md reconciles against the schema leaf list', () => {
  const content = readFileSync(join(DEFAULTS_DIR, '_baseline.md'), 'utf8');
  const covered = new Set(defaultsFields(content));
  const pending = new Set(allowlistFields(content));

  assert.ok(pending.size > 0, '_baseline.md must declare an explicit pending allowlist');

  for (const field of pending) {
    assert.ok(SCHEMA_LEAVES.includes(field),
      `_baseline.md allowlists "${field}", which is not a leaf of the standards schema`);
    assert.ok(!covered.has(field),
      `_baseline.md must not both default and allowlist "${field}"`);
  }

  const reconciled = new Set([...covered, ...pending]);
  for (const leaf of SCHEMA_LEAVES) {
    assert.ok(reconciled.has(leaf),
      `_baseline.md must either default "${leaf}" or list it in the pending allowlist`);
  }

  // Every unasked field must be pending, never defaulted.
  for (const field of UNASKED) {
    assert.ok(pending.has(field),
      `_baseline.md must list the unasked field "${field}" in the pending allowlist`);
    assert.ok(!covered.has(field),
      `_baseline.md must NOT default the unasked field "${field}"`);
  }
});

test('greenfield: every Tier-2 question closes a leaf no Tier-1 question closes', () => {
  for (const name of CATALOG_FILES) {
    const content = readFileSync(join(DEFAULTS_DIR, name), 'utf8');
    const fields = tier2Fields(content);
    assert.ok(fields.length <= 5,
      `${name} must declare at most 5 Tier-2 questions (got ${fields.length})`);
    assert.ok(fields.length > 0, `${name} must declare at least one Tier-2 question`);
    for (const field of fields) {
      assert.ok(SCHEMA_LEAVES.includes(field),
        `${name} Tier-2 question closes "${field}", which is not a leaf of the standards schema`);
      assert.ok(!TIER1_CLOSED.has(field),
        `${name} Tier-2 question closes "${field}", which a Tier-1 question already closes`);
    }
  }
});

test('greenfield: every catalog file names a stack_id traceable in its own file', () => {
  const expectedIds = {
    '_baseline.md': 'baseline',
    'node-typescript.md': 'node-typescript',
    'python.md': 'python',
    'react-native.md': 'react-native',
    'react.md': 'react',
    'nextjs.md': 'nextjs',
    'express.md': 'express',
    'fastapi.md': 'fastapi',
    'php.md': 'php',
    'android.md': 'android',
    'ios.md': 'ios',
  };

  for (const name of CATALOG_FILES) {
    const content = readFileSync(join(DEFAULTS_DIR, name), 'utf8');
    const signature = content.slice(
      content.indexOf('## Stack signature'),
      content.indexOf('## Defaults')
    );
    const stackId = expectedIds[name];
    assert.ok(signature.includes(`stack_id: ${stackId}`),
      `${name} must declare "stack_id: ${stackId}" in its Stack signature section`);

    // The stack id must also be traceable in the Tier-2 section or the
    // Defaults table of the same file.
    const rest = content.slice(content.indexOf('## Defaults'));
    assert.ok(rest.includes(stackId),
      `${name} must reference its stack_id ("${stackId}") in its Defaults or Tier 2 sections`);
  }
});

test('greenfield: the catalog mentions each stack toolchain and never the hardcoded package id', () => {
  const read = (name) => readFileSync(join(DEFAULTS_DIR, name), 'utf8').toLowerCase();

  const rn = read('react-native.md');
  for (const needle of ['expo', 'expo-router', '@testing-library/react-native', 'eslint-config-expo', 'prettier']) {
    assert.ok(rn.includes(needle), `react-native.md must mention "${needle}"`);
  }

  const android = read('android.md');
  for (const needle of ['adb', 'gradle', 'kotlin']) {
    assert.ok(android.includes(needle), `android.md must mention "${needle}"`);
  }

  const ios = read('ios.md');
  for (const needle of ['swift', 'xcodebuild']) {
    assert.ok(ios.includes(needle), `ios.md must mention "${needle}"`);
  }
  assert.ok(ios.includes('swiftpm'),
    'ios.md must mention SwiftPM');
  assert.ok(/no .*ios .*(skill|tool)/.test(ios),
    'ios.md must state that the toolkit has no iOS QA skill');

  for (const name of CATALOG_FILES) {
    assert.ok(!read(name).includes('com.egsolutions.zumapos'),
      `${name} must NOT copy the adb-qa skill's hardcoded package id`);
  }
});

test('greenfield: 08-agents-md.md drops the .context/examples/ references', () => {
  const content = readPackFile('08-agents-md.md');
  assert.ok(!content.includes('.context/examples/'),
    'the greenfield pack has no .context/examples/ — 08-agents-md.md must not reference it');
});

const AGENT_PATH = join(TOOLKIT_SOURCE, 'agents', 'context-interviewer.md');

/**
 * Read the context-interviewer agent and split frontmatter from body.
 * @returns {{frontmatter: object, body: string}}
 */
function readInterviewerAgent() {
  const raw = readFileSync(AGENT_PATH, 'utf8');
  const parsed = matter(raw);
  return { frontmatter: parsed.data || {}, body: parsed.content };
}

test('greenfield: the context-interviewer agent exists and declares valid frontmatter', () => {
  assert.ok(existsSync(AGENT_PATH),
    `the context-interviewer agent must exist at ${AGENT_PATH}`);

  const { frontmatter } = readInterviewerAgent();

  assert.equal(frontmatter.name, 'context-interviewer',
    'the agent name must match its filename');
  assert.equal(frontmatter.mode, 'subagent',
    'the interviewer is a subagent — the conductor owns the human channel');
  assert.equal(typeof frontmatter.description, 'string',
    'the agent must declare a description');
  assert.ok(frontmatter.description.length <= 220,
    `the description must be at most 220 chars (got ${frontmatter.description.length})`);
  assert.ok(frontmatter.description.toLowerCase().includes('greenfield'),
    'the description must scope the agent to greenfield projects');
});

test('greenfield: the context-interviewer agent declares tools as a map, not an array', () => {
  const { frontmatter } = readInterviewerAgent();

  assert.ok(frontmatter.tools !== undefined, 'the agent must declare its tools');
  assert.equal(typeof frontmatter.tools, 'object',
    'tools must be an object/map');
  assert.ok(!Array.isArray(frontmatter.tools),
    'tools must be an object/map — the frontmatter validator rejects an array');
  for (const [tool, enabled] of Object.entries(frontmatter.tools)) {
    assert.equal(typeof enabled, 'boolean', `tools.${tool} must be a boolean`);
  }
});

test('greenfield: the context-interviewer agent denies writes and destructive commands', () => {
  const { frontmatter } = readInterviewerAgent();

  assert.equal(frontmatter.permission?.write?.['**'], 'deny',
    'the agent must not write files');
  assert.equal(frontmatter.permission?.edit?.['**'], 'deny',
    'the agent must not edit files');

  const bash = frontmatter.permission?.bash || {};
  const requiredDenies = [
    'rm -rf*', 'rm -f *', 'nc *', 'eval *', 'sudo *', 'chmod 777 *', 'npm publish *',
    'git add *', 'git commit *', 'git push*', 'git checkout *', 'git reset *',
    'git stash *', 'git merge *', 'git rebase *', 'git tag *',
  ];
  for (const pattern of requiredDenies) {
    assert.equal(bash[pattern], 'deny',
      `permission.bash must deny "${pattern}"`);
  }
});

test('greenfield: the context-interviewer agent declares both output contracts and its workflow', () => {
  const { body } = readInterviewerAgent();

  assert.ok(body.includes('📋 QUESTION_BANK'),
    'the body must declare the 📋 QUESTION_BANK output contract');
  assert.ok(body.includes('📋 STANDARDS'),
    'the body must declare the 📋 STANDARDS output contract');

  assert.ok(body.includes('## Workflow'),
    'the body must declare a ## Workflow section');
  assert.ok(body.includes('exit criterion'),
    'the workflow must declare an exit criterion per phase');

  assert.ok(body.includes('## Anti-patterns'),
    'the body must declare a ## Anti-patterns section');
  const antiPatternRows = body
    .slice(body.indexOf('## Anti-patterns'))
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .length;
  assert.ok(antiPatternRows >= 5,
    `the anti-patterns table must have at least 5 rows (got ${antiPatternRows})`);

  assert.ok(body.includes('## Role limits'),
    'the body must declare a ## Role limits section');
});

test('greenfield: the context-interviewer agent states the 12-question contract and the bundle rule', () => {
  const { body } = readInterviewerAgent();

  assert.ok(/12/.test(body), 'the body must state the 12-question Tier-1 contract');
  assert.ok(body.includes('fields'),
    'the body must state the bundle rule (every question declares its fields)');
  assert.ok(/closed by exactly (one|1)/i.test(body),
    'the body must state that a schema field is closed by exactly one question');
  assert.ok(/cannot talk to the human|does not talk to the human/i.test(body),
    'the body must state that the agent cannot talk to the human directly');
});

test('greenfield: the context-interviewer agent q1 options match the interview contract', () => {
  // The agent is the runtime producer of the QUESTION_BANK, so its q1
  // template must offer exactly the options the interview contract
  // defines. The two shipped artifacts must not drift apart.
  const { body } = readInterviewerAgent();
  const agentBank = jsonBlockAfterMarker(body, '📋 QUESTION_BANK');
  const agentQ1 = agentBank.questions.find((question) => question.id === 'q1');
  assert.ok(agentQ1, 'the QUESTION_BANK template must declare a q1 question');

  const interviewExample = JSON.parse(firstJsonBlock(readPackFile('02-interview.md')));

  assert.deepEqual(agentQ1.options, interviewExample.options,
    'the agent q1 options must equal the interview contract q1 options');
});

test('greenfield: the discoverability descriptions scope by relevance, not by the absence of code', async () => {
  // The greenfield surface widened: greenfield is the DEFAULT and only
  // substantive content turns it false. The shipped descriptions decide
  // whether the surfaces show up in the tool UI and how the agent scopes
  // itself, so they must not under-describe a scaffold repo as "no code".
  const { frontmatter } = readInterviewerAgent();
  const agentDescription = frontmatter.description.replace(/\s+/g, ' ');

  assert.ok(!/no code/.test(agentDescription),
    'the agent description must not scope greenfield to "no code"');
  assert.match(agentDescription, /nothing substantive to extract patterns from/,
    'the agent description must scope greenfield by substantive content');

  const surfaces = [
    { adapter: 'claude-code', path: '.claude/skills/greenfield/SKILL.md' },
    { adapter: 'opencode', path: '.opencode/commands/greenfield.md' },
  ];
  for (const { adapter, path } of surfaces) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'aitk-gf-desc-'));
    const mod = await import(`../adapters/${adapter}/adapter.mjs`);
    await mod.installGreenfield({ source: TOOLKIT_SOURCE, target: tmpDir });

    const installed = readFileSync(join(tmpDir, path), 'utf8');
    const fm = installed
      .slice(installed.indexOf('---\n') + 4, installed.indexOf('\n---\n'))
      .replace(/\s+/g, ' ');

    assert.ok(!/no code/.test(fm),
      `${adapter}: the greenfield description must not scope greenfield to "no code"`);
    assert.match(fm, /nothing substantive to extract patterns from/,
      `${adapter}: the greenfield description must scope greenfield by substantive content`);
  }
});

// ─── Registry-driven completeness (added in the step-9 review) ─────────────

test('greenfield: the conductor references every REGISTERED supporting file and asset', () => {
  const conductor = readPackFile('00-conductor.md');
  const pack = PROMPT_PACKS.greenfield;

  for (const name of pack.supporting) {
    assert.ok(conductor.includes(`./${name}`),
      `the conductor must reference the registered supporting file "./${name}"`);
  }

  // The per-stack assets are referenced through the `./defaults/<stack>.md`
  // template — the stack is only known at runtime — but the baseline is
  // referenced by name.
  assert.ok(conductor.includes('./defaults/_baseline.md'),
    'the conductor must reference the registered baseline asset "./defaults/_baseline.md"');
  assert.ok(conductor.includes('./defaults/<stack>.md'),
    'the conductor must reference the per-stack assets through "./defaults/<stack>.md"');
});

test('greenfield: 02-interview.md declares EXACTLY 12 Tier-1 questions', () => {
  const content = readPackFile('02-interview.md');

  // The mandatory question table lists one row per question, keyed q1..qN.
  const questionRows = content
    .split('\n')
    .filter((line) => /^\|\s*q\d+\s*\|/.test(line.trim()));

  assert.equal(questionRows.length, 12,
    `the mandatory question table must hold exactly 12 questions (got ${questionRows.length})`);

  // Each row must anchor on a Tier-1 anchor, and no anchor may repeat.
  const anchors = questionRows.map((row) => {
    const cells = row.split('|').map((c) => c.trim());
    return cells[2].replace(/`/g, '');
  });
  assert.deepEqual([...anchors].sort(), [...TIER1_ANCHORS].sort(),
    'the 12 questions must anchor on exactly the 12 canonical Tier-1 fields');
  assert.equal(new Set(anchors).size, 12,
    'a schema field may be closed by exactly ONE question — no anchor may repeat');
});

test('greenfield: 01-pre-flight.md declares EXACTLY the 11 stack_hint values', () => {
  const content = readPackFile('01-pre-flight.md');

  const vocabularyLine = content
    .split('\n')
    .find((line) => line.includes('node-typescript | python'));
  assert.ok(vocabularyLine, 'the vocabulary line must exist');

  const values = vocabularyLine
    .replace(/`/g, '')
    .split('|')
    .map((v) => v.trim())
    .filter((v) => v !== '' && !v.includes('stack_hint') && !v.startsWith('node-typescript |'));

  assert.deepEqual(values, STACK_IDS,
    `the stack_hint vocabulary must hold exactly the 11 canonical values (got ${values.join(', ')})`);
});

test('greenfield: the ## Rules clause lists the same 11 stack_hint values', () => {
  const content = readPackFile('01-pre-flight.md');

  // Parsed, not substring-matched: the clause states the ids as a prose
  // list (comma- or pipe-separated), so the ids are split out of the
  // bullet and compared as a set against the canonical vocabulary.
  const ids = rulesStackHintIds(content);

  assert.equal(ids.length, STACK_IDS.length,
    `the ## Rules clause must list exactly ${STACK_IDS.length} ids (got ${ids.length}: ${ids.join(', ')})`);
  assert.deepEqual([...new Set(ids)].sort(), [...STACK_IDS].sort(),
    `the ## Rules clause must list the 11 canonical ids (got ${ids.join(', ')})`);
});

test('greenfield: the ## Output format JSON lists the same 11 stack_hint values', () => {
  const content = readPackFile('01-pre-flight.md');

  const start = content.indexOf('## Output format');
  assert.notEqual(start, -1, 'the pre-flight must have an "## Output format" section');
  const json = JSON.parse(firstJsonBlock(content.slice(start)));
  assert.equal(typeof json.stack_hint, 'string',
    'the output JSON must declare a stack_hint string');

  // The JSON lists the ids pipe-separated — parsed, never substring-matched.
  const ids = json.stack_hint
    .split('|')
    .map((id) => id.trim())
    .filter((id) => id !== '');

  assert.equal(ids.length, STACK_IDS.length,
    `the output JSON must declare exactly ${STACK_IDS.length} stack_hint values (got ${ids.length}: ${ids.join(', ')})`);
  assert.deepEqual([...new Set(ids)].sort(), [...STACK_IDS].sort(),
    `the output JSON must declare the 11 canonical stack_hint values (got ${ids.join(', ')})`);
});

// ─── Amendment 11.1 — greenfield detection by RELEVANCE, not existence ────

test('greenfield: 01-pre-flight.md derives greenfield from RELEVANCE, not from existence', () => {
  const preflight = readPackFile('01-pre-flight.md');
  const section = greenfieldSection(preflight);
  const flat = section.replace(/\s+/g, ' ').toLowerCase();
  const output = outputSection(preflight).replace(/\s+/g, ' ').toLowerCase();

  // Greenfield is the DEFAULT — the repo stays greenfield unless it holds
  // substantive material to derive standards from.
  assert.match(flat, /greenfield is the default/,
    'the pre-flight must state that greenfield is the default');
  assert.match(flat, /unless it holds substantive/,
    'the pre-flight must tie the default to the absence of substantive content');

  // `greenfield: false` requires substantive content.
  assert.match(flat, /greenfield: false/,
    'the pre-flight must say what turns the flag to false');
  assert.match(flat, /substantive content/,
    'the pre-flight must require substantive content for greenfield: false');
  for (const criterion of [
    /real behavior/,
    /meaningful test suite/,
    /non-default rules/,
    /pre-commit/,
    /repeated pattern/,
  ]) {
    assert.match(flat, criterion,
      'the substantive-content criteria must be listed in the greenfield section');
  }

  // The non-substantive exclusions — none of them may turn the flag to false.
  for (const exclusion of [
    /empty director/,
    /\.gitignore/,
    /license/,
    /lockfile/,
    /readme\.md/,
    /no technical content/,
    /\.git\//,
    /node_modules/,
    /build output/,
    /dist\//,
    /coverage\//,
    /generator boilerplate/,
    /hello-world/,
    /single placeholder test/,
    /defaults or generated/,
  ]) {
    assert.match(flat, exclusion,
      'the non-substantive exclusions must be listed in the greenfield section');
  }

  // The manifest scan no longer drives the greenfield flag — but the
  // `stack_hint` selection is unchanged.
  assert.match(flat, /manifest scan is fully independent/,
    'the pre-flight must state that the manifest scan is fully independent');
  assert.match(flat, /stack_detected: "ok"/,
    'the pre-flight must state that a manifest still sets stack_detected');
  assert.match(flat, /stack_hint: "node-typescript"/,
    'the pre-flight must state that a manifest still selects the catalog file');
  assert.match(flat, /scaffold is not substantive/,
    'the pre-flight must state that a scaffold is not substantive');

  // The tie-breaker.
  assert.match(flat, /when in doubt\s*→\s*`?greenfield: true`?/,
    'the pre-flight must state the "when in doubt → greenfield: true" tie-breaker');

  // The notes entry must record the evidence behind the decision.
  assert.match(flat, /notes/,
    'the pre-flight must require the notes entry that carries the evidence');
  assert.match(flat, /evidence/,
    'the pre-flight must require the notes entry to record the evidence');
  assert.match(output, /evidence/,
    'the output section must require the evidence behind the greenfield decision');

  // The output field description asks about substantive content.
  assert.match(output, /does this repo lack substantive content to extract patterns from/,
    'the greenfield field description must ask about substantive content');
  assert.ok(!/brand-new project with nothing to extract from/.test(output),
    'the obsolete "brand-new project with nothing to extract from" description must be gone');

  // The obsolete existence-based rule is gone.
  assert.ok(!/no source files/.test(flat),
    'the obsolete "no source files" condition must be gone');
  assert.ok(!/no recognizable manifest/.test(flat),
    'the obsolete "no recognizable manifest" condition must be gone');
  for (const dir of ['src/', 'lib/', 'app/', 'pkg/', 'internal/']) {
    assert.ok(!section.includes(dir),
      `the obsolete existence condition must not name the "${dir}" directory`);
  }
  for (const ext of ['*.ts', '*.py', '*.go']) {
    assert.ok(!section.includes(ext),
      `the obsolete existence condition must not name the "${ext}" extension`);
  }
});

// ─── Amendment 11.2 — AGENTS.md is an index, not a living context ─────────

test('greenfield: 08-agents-md.md declares AGENTS.md as an index, not a living context', () => {
  const content = readPackFile('08-agents-md.md');
  const flat = flatten(content);

  // (a) The expected output structure carries the Context index section.
  assert.ok(content.includes('## Context index'),
    'the expected output structure must declare a "## Context index" section');
  assert.match(content, /\|\s*File\s*\|\s*What it covers\s*\|/,
    'the context index must be a table with the "File" and "What it covers" columns');
  assert.match(content, /How to read this directory/,
    'the context index must state how to read the directory');
  assert.match(flat, /derive this section only from the \.context\/ files actually present/,
    'the prompt must say the index is derived only from the .context/ files actually present');
  assert.match(flat, /omit the rows for skipped artifacts/,
    'the prompt must say the rows for skipped artifacts are omitted');

  // (b) The index-not-living-context contract.
  assert.match(flat, /agents\.md is an index, not a living context/,
    'the prompt must declare the "index, not a living context" contract');
  assert.match(flat, /must not hold/,
    'the prompt must list what the file must NOT hold');
  for (const forbidden of [
    /project state/,
    /component or module inventories/,
    /lists of services, endpoints or files/,
    /status or progress comments/,
    /todo lists/,
    /drift as the project changes/,
  ]) {
    assert.match(flat, forbidden,
      'the prompt must name what the file must NOT hold');
  }
  assert.match(flat, /belongs in the \.context\/ file that owns the subject/,
    'the prompt must route current-state observations to the .context/ file that owns the subject');
  assert.match(flat, /architecture\.md owns the structure/,
    'the prompt must name the owner of each kind of observation');
  assert.match(flat, /durable statement/,
    'the prompt must require every rule to be a durable statement');
  assert.match(flat, /stays at stack\/framework level/,
    'the prompt must keep the General rule one-liner at stack/framework level');
  assert.match(flat, /feature list/,
    'the prompt must forbid the General rule one-liner from becoming a feature list');
  assert.match(flat, /status summary/,
    'the prompt must forbid the General rule one-liner from becoming a status summary');

  // (c) The minimal-edit idempotency rule and its four triggers.
  assert.match(flat, /edited only when strictly necessary/,
    'the prompt must state that the file is edited only when strictly necessary');
  assert.match(flat, /must leave the file byte-identical/,
    'the prompt must state that an unchanged file is left byte-identical');
  for (const trigger of [
    /new rule/,
    /overrode/,
    /added or removed/,
    /explicitly asked/,
  ]) {
    assert.match(flat, trigger,
      'the prompt must state the four strictly-necessary edit triggers');
  }
  assert.match(flat, /report "no change" and do not touch the file/,
    'the prompt must report "no change" and leave the file untouched');
  assert.match(flat, /default outcome of a repeat run/,
    'the prompt must state that "no change" is the default outcome of a repeat run');
  assert.match(flat, /not an error/,
    'the prompt must state that "no change" is not an error');
  assert.match(flat, /not a warning/,
    'the prompt must state that "no change" is not a warning');

  // (d) The merge is diff-based and minimal.
  assert.match(flat, /diff-based and minimal/,
    'the prompt must state that the merge is diff-based and minimal');
  assert.match(flat, /keep every existing section the new output does not define/,
    'the prompt must keep every existing section the new output does not define');
  assert.match(flat, /unless its content actually changed/,
    'the prompt must rewrite a defined section only when its content actually changed');
});

test('greenfield: 08-agents-md.md reports "no change" to the conductor when nothing changed', () => {
  const content = readPackFile('08-agents-md.md');
  const flat = flatten(content);

  // The idempotency preamble (the "must leave the file byte-identical"
  // paragraph) tells the conductor the outcome. Rule 4 restates it as a
  // rule; the preamble is the sentence the conductor actually reads.
  assert.match(flat, /report "no change" to the conductor/,
    'the idempotency preamble must report "no change" to the conductor');
});

test('greenfield: the context index table declares the 4 concrete .context/ artifacts', () => {
  const content = readPackFile('08-agents-md.md');
  const declared = contextIndexRows(content);

  for (const artifact of [
    '.context/stack.md',
    '.context/architecture.md',
    '.context/code-style.md',
    '.context/conventions.md',
  ]) {
    assert.ok(declared.includes(artifact),
      `the context index table must declare the "${artifact}" row`);
  }
  assert.ok(!declared.some((cell) => cell.includes('.context/examples/')),
    'the context index table must not declare a .context/examples/ row');
});

test('bootstrap: 08-agents-md.md declares AGENTS.md as an index, not a living context', () => {
  const content = readBootstrapPackFile('08-agents-md.md');
  const flat = flatten(content);

  // (b) The index-not-living-context contract.
  assert.match(flat, /agents\.md is an index, not a living context/,
    'the prompt must declare the "index, not a living context" contract');
  assert.match(flat, /must not hold/,
    'the prompt must list what the file must NOT hold');
  for (const forbidden of [
    /project state/,
    /component or module inventories/,
    /lists of services, endpoints or files/,
    /status or progress comments/,
    /todo lists/,
    /drift as the project changes/,
  ]) {
    assert.match(flat, forbidden,
      'the prompt must name what the file must NOT hold');
  }
  assert.match(flat, /belongs in the \.context\/ file that owns the subject/,
    'the prompt must route current-state observations to the .context/ file that owns the subject');
  assert.match(flat, /architecture\.md owns the structure/,
    'the prompt must name the owner of each kind of observation');
  assert.match(flat, /durable statement/,
    'the prompt must require every rule to be a durable statement');
  assert.match(flat, /stays at stack\/framework level/,
    'the prompt must keep the General rule one-liner at stack/framework level');
  assert.match(flat, /feature list/,
    'the prompt must forbid the General rule one-liner from becoming a feature list');
  assert.match(flat, /status summary/,
    'the prompt must forbid the General rule one-liner from becoming a status summary');

  // (c) The minimal-edit idempotency rule and its four triggers.
  assert.match(flat, /edited only when strictly necessary/,
    'the prompt must state that the file is edited only when strictly necessary');
  assert.match(flat, /must leave the file byte-identical/,
    'the prompt must state that an unchanged file is left byte-identical');
  for (const trigger of [
    /new rule/,
    /overrode/,
    /added or removed/,
    /explicitly asked/,
  ]) {
    assert.match(flat, trigger,
      'the prompt must state the four strictly-necessary edit triggers');
  }
  assert.match(flat, /report "no change" and do not touch the file/,
    'the prompt must report "no change" and leave the file untouched');
  assert.match(flat, /default outcome of a repeat run/,
    'the prompt must state that "no change" is the default outcome of a repeat run');
  assert.match(flat, /not an error/,
    'the prompt must state that "no change" is not an error');
  assert.match(flat, /not a warning/,
    'the prompt must state that "no change" is not a warning');

  // (d) The merge is diff-based and minimal.
  assert.match(flat, /diff-based and minimal/,
    'the prompt must state that the merge is diff-based and minimal');
  assert.match(flat, /keep every existing section the new output does not define/,
    'the prompt must keep every existing section the new output does not define');
  assert.match(flat, /unless its content actually changed/,
    'the prompt must rewrite a defined section only when its content actually changed');
});

// ─── QA follow-up 11.3 — the stack_hint precedence rule ─────────────────

// The 10 catalog rules, most specific first. The first match wins.
const STACK_PRECEDENCE_ORDER = [
  'react-native',
  'nextjs',
  'express',
  'react',
  'fastapi',
  'android',
  'ios',
  'php',
  'python',
  'node-typescript',
];

test('greenfield: 01-pre-flight.md declares the stack_hint precedence rule before the scan', () => {
  const content = readPackFile('01-pre-flight.md');

  // §3 owns the manifest scan.
  const sectionStart = content.indexOf('### 3. Stack detection');
  const sectionEnd = content.indexOf('\n### 4.', sectionStart);
  assert.ok(sectionStart !== -1,
    'the pre-flight must have a "### 3. Stack detection" section');
  assert.ok(sectionEnd > sectionStart,
    'the stack detection section must be followed by the greenfield section');
  const section = content.slice(sectionStart, sectionEnd);

  // The rule must be stated BEFORE the reader starts matching.
  const scanStart = section.indexOf('Look for manifests at the top level');
  assert.ok(scanStart !== -1,
    'the stack detection section must declare the manifest scan');
  const precedenceStart = section.indexOf('Precedence');
  assert.ok(precedenceStart !== -1,
    'the stack detection section must declare a precedence rule');
  assert.ok(precedenceStart < scanStart,
    'the precedence rule must be stated BEFORE the manifest scan starts');

  const block = flatten(section.slice(precedenceStart, scanStart));

  // (a) The order — most specific first, first match wins. The chain is
  // ONE line and is parsed by splitting on the arrow: an indexOf-based
  // check would read 'react' inside 'react-native'.
  const chainLine = section
    .split('\n')
    .find((line) => line.includes('→') && line.includes('node-typescript'));
  assert.ok(chainLine,
    'the precedence chain must be declared on a single line');

  const ids = chainLine
    .split('→')
    .map((part) => part.replace(/[`\s]/g, ''))
    .filter((part) => part !== '');

  assert.deepEqual(ids, [...STACK_PRECEDENCE_ORDER, 'unknown'],
    `the precedence chain must be the canonical 11-entry order (got: ${ids.join(' → ')})`);

  assert.match(block, /first match wins/,
    'the precedence rule must state that the first match wins');

  // (b) The least specific rule loses to every other match.
  assert.match(block, /node-typescript is the least specific/,
    'the precedence rule must state that node-typescript is the least specific');
  assert.match(block, /loses to every other match/,
    'the precedence rule must state that node-typescript loses to every other match');
  assert.equal(ids[ids.length - 2], 'node-typescript',
    'node-typescript must be the last catalog rule, right before unknown');

  // (c) react-native wins over the rules it would otherwise fire.
  assert.match(block, /react-native wins over android and ios/,
    'the precedence rule must state that react-native wins over android and ios');
  assert.match(block, /react-native wins over react/,
    'the precedence rule must state that react-native wins over react');

  // (d) nextjs wins over react and over node-typescript. The assertion is
  // anchored to the nextjs bullet itself: matching the flattened block
  // would let the "node-typescript is the least specific" bullet satisfy
  // it on its own.
  const nextjsStart = section.indexOf('- `nextjs`');
  assert.notEqual(nextjsStart, -1,
    'the precedence rule must state a nextjs bullet');
  const nextjsEnd = section.indexOf('\n- ', nextjsStart);
  const nextjsBullet = flatten(
    section.slice(nextjsStart, nextjsEnd === -1 ? undefined : nextjsEnd));

  assert.match(nextjsBullet,
    /nextjs wins over react \(next\.js includes react\) and over node-typescript/,
    'the precedence rule must state that nextjs wins over react and over node-typescript');

  // (e) express wins over react — the server shape outranks the UI library.
  assert.match(block, /express wins over react/,
    'the precedence rule must state that express wins over react');

  // (f) fastapi wins over python.
  assert.match(block, /fastapi wins over python/,
    'the precedence rule must state that fastapi wins over python');

  // (g) No match stays unknown.
  assert.match(block, /no rule matches.*unknown/,
    'the precedence rule must keep "unknown" as the result when no rule matches');

  // (h) The known limitation — one catalog per run, overridable at q1.
  assert.match(block, /resolves to one catalog/,
    'the precedence rule must state that a React + Express monorepo resolves to one catalog');
  assert.match(block, /q1/,
    'the precedence rule must state that the interview q1 lets the developer override');
});

test('greenfield: 01-pre-flight.md documents the polyglot limitation for every framework mix', () => {
  const content = readPackFile('01-pre-flight.md');
  const sectionStart = content.indexOf('### 3. Stack detection');
  const sectionEnd = content.indexOf('\n### 4.', sectionStart);
  const section = content.slice(sectionStart, sectionEnd);

  const limitationStart = section.indexOf('Known limitation');
  assert.notEqual(limitationStart, -1,
    'the stack detection section must state the known limitation');

  // The paragraph runs until the manifest scan starts.
  const scanStart = section.indexOf('Look for manifests at the top level');
  const block = flatten(section.slice(limitationStart, scanStart));

  // The general rule: a repo matching several frameworks resolves to ONE
  // catalog — not one catalog per framework.
  assert.match(block, /one catalog/,
    'the known limitation must state that a polyglot repo resolves to one catalog');
  assert.match(block, /several|more than one|multiple/,
    'the known limitation must state the general polyglot rule, not a single example');

  // Both mixes QA measured must be documented.
  assert.match(block, /react \+ express/,
    'the known limitation must name the React + Express case');
  assert.match(block, /react \+ fastapi/,
    'the known limitation must name the React + FastAPI case');

  // The developer can override the detected stack at q1.
  assert.match(block, /q1/,
    'the known limitation must state that the interview q1 lets the developer override');
});

// ─── Step 12 — the prompts must express the 11-value model ─────────────

test('greenfield: 02-interview.md q1 lists all 11 stack ids and the other option', () => {
  const content = readPackFile('02-interview.md');
  const rows = sectionRows(content, '## The 12 mandatory questions');
  const q1 = rows.find((row) => row[0].replace(/`/g, '').trim() === 'q1');
  assert.ok(q1, 'the Tier-1 table must declare a q1 row');

  // The options cell holds the backticked option tokens.
  const tokens = [...q1[q1.length - 1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);

  // The `other` token carries its explanatory parenthetical; strip it so
  // the cell compares against the canonical vocabulary.
  const stripped = tokens.map((token) => token.replace(/\s*\([^)]*\)$/, ''));

  assert.deepEqual(stripped, [...STACK_IDS, 'other'],
    `the q1 options must list the 11 stack ids plus "other", in canonical order (got: ${stripped.join(', ')})`);

  // The QUESTION_BANK example carries the same list.
  const example = JSON.parse(firstJsonBlock(content));
  assert.deepEqual(example.options, [...STACK_IDS, 'other'],
    'the QUESTION_BANK example must list the 11 stack ids plus "other"');
});

test('greenfield: 01-pre-flight.md mentions the 4 framework detection signals', () => {
  const content = readPackFile('01-pre-flight.md');
  const start = content.indexOf('### 3. Stack detection');
  const end = content.indexOf('\n### 4.', start);
  const section = content.slice(start, end);

  for (const signal of ['next.config', 'express', 'fastapi', 'requirements']) {
    assert.ok(section.includes(signal),
      `the manifest scan must mention the "${signal}" detection signal`);
  }
  assert.ok(section.includes('`next`'),
    'the manifest scan must mention the "next" dependency signal');
  assert.ok(section.includes('`react`'),
    'the manifest scan must mention the "react" dependency signal');
});

test('greenfield: the conductor resolves the catalog chain and passes the resolved set', () => {
  const conductor = readPackFile('00-conductor.md');
  const flat = flatten(conductor);

  assert.match(flat, /inherits from/,
    'the conductor must state that the catalog declares an "Inherits from:" line');
  assert.match(flat, /resolve[sd]? the chain/,
    'the conductor must state that it resolves the chain');
  assert.match(flat, /base first and the leaf last/,
    'the conductor must state the chain order (base first, leaf last)');
  assert.match(flat, /cycle/,
    'the conductor must state the cycle guard');
  assert.match(flat, /resolved catalog chain|resolved set/,
    'the conductor must pass the resolved catalog chain downstream');

  // Step 2 is where the resolved set is actually handed over.
  const step2Start = conductor.indexOf('### Step 2');
  const step2End = conductor.indexOf('### Step 3');
  assert.ok(step2Start !== -1 && step2End > step2Start,
    'the conductor must declare a "### Step 2" section');
  const step2 = flatten(conductor.slice(step2Start, step2End));

  assert.match(step2, /resolved catalog chain/,
    'Step 2 must pass the resolved catalog chain to the interviewer agent');
  assert.match(step2, /base first and the leaf last/,
    'Step 2 must pass the chain base first and the leaf last');
  assert.match(step2, /defaults\/_baseline\.md/,
    'Step 2 must pass the baseline together with the resolved chain');

  // The 4 chains are named so the runtime agent resolves them without
  // guessing.
  for (const chain of [
    'react → node-typescript',
    'nextjs → react → node-typescript',
    'express → node-typescript',
    'fastapi → python',
  ]) {
    assert.ok(flat.includes(chain),
      `the conductor must name the chain "${chain}"`);
  }
});

test('greenfield: 03-standards.md states the merge order, the section rules and the provenance rule', () => {
  const content = readPackFile('03-standards.md');
  const flat = flatten(content);

  assert.ok(content.includes('## Catalog chains'),
    '03-standards.md must declare a "## Catalog chains" section');

  // The merge order: baseline → base → … → leaf, and the later value wins.
  assert.match(flat, /baseline → base catalog → … → leaf catalog/,
    'the merge order must be baseline → base catalog → … → leaf catalog');
  assert.match(flat, /later catalog's value for a field wins/,
    'the merge must state that a later catalog wins on the same field');

  // The whole-section rule.
  assert.match(flat, /tier 2 questions.*merge whole-section/,
    'the Tier-2 questions must merge whole-section');
  assert.match(flat, /prescribed patterns.*merge whole-section/,
    'the prescribed patterns must merge whole-section');

  // The provenance rule: the marker names the file that supplied the
  // winning value — the leaf when the leaf overrode the base.
  assert.match(flat, /the catalog file that supplied the winning value/,
    'the provenance rule must name the file that supplied the winning value');
  assert.match(flat, /\[default: defaults\/nextjs\.md\]/,
    'the provenance rule must show the leaf marker as the example');
  assert.match(flat, /never the base's file/,
    'the provenance rule must forbid naming the base when the leaf overrode it');

  // The 4 chains are listed.
  for (const chain of [
    'react → node-typescript',
    'nextjs → react → node-typescript',
    'express → node-typescript',
    'fastapi → python',
  ]) {
    assert.ok(flat.includes(chain),
      `the Catalog chains section must list the chain "${chain}"`);
  }
});

test('greenfield: 03-standards.md provenance table names the catalog file that supplied a default value', () => {
  const content = readPackFile('03-standards.md');
  const rows = sectionRows(content, '## Provenance rules');

  // Scoped to the TABLE row: the sibling bullet in "Additional rules" states
  // the same rule, so a file-wide match would not notice a deleted row.
  const defaultRow = rows.find((row) => row[0].replace(/`/g, '').trim() === 'default');
  assert.ok(defaultRow,
    'the provenance table must declare a "default" row');
  assert.ok(defaultRow.length >= 3,
    'the "default" row must declare an Origin, a Meaning and a Requirements cell');

  const requirements = flatten(defaultRow[2]);
  assert.match(requirements, /catalog file that supplied the winning value/,
    'the "default" row must state that the value names the catalog file that supplied the winning value');
});

test('greenfield: each framework catalog declares 5 Tier-2 questions and the 4 prescribed-pattern sub-blocks', () => {
  for (const name of FRAMEWORK_CATALOGS) {
    const content = readCatalog(name);
    const fields = tier2Fields(content);
    assert.equal(fields.length, 5,
      `${name} must declare exactly 5 Tier-2 questions (got ${fields.length})`);
    for (const sub of ['### Naming', '### Module layout', '### Test shape', '### Error shape']) {
      assert.ok(content.includes(sub),
        `${name} must declare the "${sub}" sub-block`);
    }
  }
});

test('greenfield: the bootstrap pre-flight carries no stack_hint precedence rule', () => {
  const content = readBootstrapPackFile('01-pre-flight.md');
  const flat = flatten(content);

  // The bootstrap pack selects NO catalog file — there is no stack_hint to
  // resolve, so a precedence rule there would be a rule for a signal that
  // does not exist.
  assert.ok(!content.includes('stack_hint'),
    'the bootstrap pre-flight must not declare a stack_hint — it selects no catalog file');
  assert.ok(!/precedence/.test(flat),
    'the bootstrap pre-flight must not carry a stack_hint precedence rule');
});

test('greenfield: the AGENTS.md routing sentence names the owner of every indexed artifact', () => {
  // The routing sentence must cover the 4 indexed .context/ artifacts, not
  // 3 — a convention with no route is a convention that lands nowhere.
  for (const [pack, read] of [
    ['greenfield', readPackFile],
    ['bootstrap', readBootstrapPackFile],
  ]) {
    const flat = flatten(read('08-agents-md.md'));

    assert.match(flat, /belongs in the \.context\/ file that owns the subject/,
      `${pack}: the prompt must route current-state observations to the .context/ file that owns the subject`);
    assert.match(flat, /architecture\.md owns the structure/,
      `${pack}: the routing sentence must name the owner of the structure`);
    assert.match(flat, /stack\.md owns the stack/,
      `${pack}: the routing sentence must name the owner of the stack`);
    assert.match(flat, /code-style\.md owns the conventions/,
      `${pack}: the routing sentence must name the owner of the conventions`);
    assert.match(flat, /conventions\.md owns the non-obvious contracts/,
      `${pack}: the routing sentence must name the owner of the non-obvious contracts`);
    assert.match(flat, /response format, auth, special headers/,
      `${pack}: the routing sentence must say which contracts conventions.md owns`);
  }
});

test('greenfield: the node-typescript catalog treats package.json as the detection signal', () => {
  const content = readFileSync(join(DEFAULTS_DIR, 'node-typescript.md'), 'utf8');
  const flat = flatten(content);

  // The catalog signature must agree with the pre-flight rule: a bare
  // package.json selects the catalog, and tsconfig.json only marks the
  // project as TypeScript.
  assert.match(flat, /detection signals: package\.json/,
    'the node-typescript signature must make package.json the detection signal');
  assert.match(flat, /tsconfig\.json is the typescript indicator/,
    'the node-typescript signature must name tsconfig.json as the TypeScript indicator');
  assert.match(flat, /not required to select this catalog file/,
    'the node-typescript signature must say tsconfig.json is not required to select the catalog');
});

test('greenfield: no catalog describes helpers as the home of business logic', () => {
  // The developer's rule: a helper is a reusable utility tied to the
  // business (calculate the IVA, validate the age, compute the IMC) — NOT
  // the place where business logic lives. The business logic goes in the
  // template, the components, the hooks and the thunks; the only exception
  // is critical, private logic that is kept and tested minutely, which
  // belongs in the module's `services/`.
  //
  // A catalog that calls `helpers/` the home of business logic teaches the
  // opposite rule in every generated architecture.md, so the wording is
  // guarded here rather than left to review.
  for (const name of CATALOG_FILES) {
    if (name === '_baseline.md') continue;
    const content = readCatalog(name);
    const tree = moduleLayoutTree(content);
    assert.ok(tree, `${name} must declare a "### Module layout" tree`);

    for (const line of tree.split('\n')) {
      const match = line.match(/^\s*([Hh]elpers)\/\s+(#\s*.*)?$/);
      if (!match) continue;
      const comment = (match[2] || '').toLowerCase();
      assert.ok(!comment.includes('business logic'),
        `${name}: the helpers folder is described as "${match[2].trim()}" — ` +
        `helpers hold reusable utilities, not business logic`);
    }
  }
});

test('greenfield: every catalog that names helpers names services too', () => {
  // The two rules above are a pair: if a catalog sends business logic to
  // `services/`, it needs a `services/` folder in its tree to send it to.
  // A catalog with a helpers folder and no services folder has nowhere to
  // put the critical, private logic.
  //
  // The folder must live INSIDE the module: the tree also declares a
  // root-level `services/` for third-party communication, and that one does
  // not hold the module's own logic.
  for (const name of CATALOG_FILES) {
    if (name === '_baseline.md') continue;
    const content = readCatalog(name);
    const tree = moduleLayoutTree(content);
    const moduleFolders = moduleTreeFolders(tree);
    if (!moduleFolders.has('helpers') && !moduleFolders.has('Helpers')) continue;
    assert.ok(moduleFolders.has('services') || moduleFolders.has('Services'),
      `${name}: the module declares a helpers folder but no services folder — ` +
      `critical, private logic needs one`);
  }
});
