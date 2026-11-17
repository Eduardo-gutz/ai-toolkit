// Tests for the greenfield hint added to the extractive `/bootstrap` pack.
//
// `/bootstrap` reads the code that already exists. When the repo is
// brand-new there is nothing to extract, so the pre-flight must detect
// that case and the conductor must offer the `/greenfield` alternative.
//
// Behavior under test:
//   - 01-pre-flight.md declares a `greenfield` boolean in its output JSON
//     and describes how it is derived (relevance: greenfield is the
//     default, and only substantive content turns the flag to false).
//   - 00-conductor.md Step 0 explains both commands, warns that the
//     extractive flow has nothing to extract, asks whether to redirect to
//     `/greenfield`, and states that "yes" stops the chain.
//   - The new literal `/greenfield` survives the bootstrap path rewrite
//     untouched (it is not a `./0X-…` sibling reference).
//
// Source of truth: source/prompts/bootstrap/ in the toolkit repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { adaptConductorPaths } from '../adapters/_shared/bootstrap-renderer.mjs';

const TOOLKIT_ROOT = join(import.meta.dirname, '..');
const BOOTSTRAP_DIR = join(TOOLKIT_ROOT, 'source/prompts/bootstrap');

const PREFLIGHT = readFileSync(join(BOOTSTRAP_DIR, '01-pre-flight.md'), 'utf8');
const CONDUCTOR = readFileSync(join(BOOTSTRAP_DIR, '00-conductor.md'), 'utf8');

/**
 * Extract the Step 0 section of the conductor (from its heading up to the
 * Step 1 heading).
 *
 * @param {string} conductor - the conductor markdown
 * @returns {string} the Step 0 section
 */
function step0Section(conductor) {
  const start = conductor.indexOf('### Step 0');
  const end = conductor.indexOf('### Step 1');
  assert.ok(start !== -1, 'conductor must have a "### Step 0" heading');
  assert.ok(end > start, 'conductor must have a "### Step 1" heading after Step 0');
  return conductor.slice(start, end);
}

/**
 * Extract the first fenced ```json block from a markdown file.
 *
 * @param {string} content - markdown content
 * @returns {string} the raw JSON text
 */
function firstJsonBlock(content) {
  const match = content.match(/```json\n([\s\S]*?)```/);
  assert.ok(match, 'file must contain a ```json fenced block');
  return match[1];
}

/**
 * Extract the "### 4. Greenfield detection" section of a pre-flight prompt.
 *
 * @param {string} preflight - the pre-flight markdown
 * @returns {string} the greenfield detection section
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
 *
 * @param {string} preflight - the pre-flight markdown
 * @returns {string} the output section
 */
function outputSection(preflight) {
  const start = preflight.indexOf('## Output');
  assert.ok(start !== -1, 'the pre-flight must have a "## Output" section');
  const end = preflight.indexOf('\n## ', start);
  assert.ok(end > start,
    'the output section must be followed by another "## " section');
  return preflight.slice(start, end);
}

test('bootstrap: 01-pre-flight.md output JSON declares a greenfield boolean', () => {
  const json = JSON.parse(firstJsonBlock(PREFLIGHT));
  assert.ok(
    Object.prototype.hasOwnProperty.call(json, 'greenfield'),
    'the pre-flight output JSON must declare a "greenfield" field'
  );
  assert.equal(typeof json.greenfield, 'boolean',
    'the greenfield field must be a boolean placeholder');
  assert.ok(PREFLIGHT.includes('"greenfield"'),
    '01-pre-flight.md must document the greenfield field');
});

test('bootstrap: 01-pre-flight.md derives greenfield from RELEVANCE, not from existence', () => {
  const section = greenfieldSection(PREFLIGHT);
  const flat = section.replace(/\s+/g, ' ').toLowerCase();
  const output = outputSection(PREFLIGHT).replace(/\s+/g, ' ').toLowerCase();

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

  // The manifest scan no longer drives the greenfield flag.
  assert.match(flat, /manifest scan is fully independent/,
    'the pre-flight must state that the manifest scan is fully independent');

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

test('bootstrap: 01-pre-flight.md keeps its broad manifest detection untouched', () => {
  // The extractive pack selects no catalog file, so its manifest list must
  // stay broader than the greenfield pack's 7-value vocabulary.
  for (const manifest of ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'composer.json', 'pubspec.yaml']) {
    assert.ok(PREFLIGHT.includes(manifest),
      `the broad manifest detection must keep "${manifest}"`);
  }
});

test('bootstrap: conductor Step 0 mentions /greenfield', () => {
  const step0 = step0Section(CONDUCTOR);
  assert.ok(step0.includes('/greenfield'),
    'Step 0 must mention the /greenfield command');
});

test('bootstrap: conductor Step 0 explains how both commands work', () => {
  const step0 = step0Section(CONDUCTOR);
  assert.match(step0, /extractive/i,
    'Step 0 must describe /bootstrap as the extractive flow');
  assert.match(step0, /generative/i,
    'Step 0 must describe /greenfield as the generative flow');
});

test('bootstrap: conductor Step 0 warns that the extractive flow has nothing to extract', () => {
  const step0 = step0Section(CONDUCTOR);
  assert.match(step0, /nothing to extract/i,
    'Step 0 must warn that /bootstrap has nothing to extract');
});

test('bootstrap: conductor Step 0 asks whether to redirect to /greenfield', () => {
  const step0 = step0Section(CONDUCTOR);
  assert.match(step0, /switch to/i,
    'Step 0 must ask whether to switch to /greenfield');
});

test('bootstrap: conductor Step 0 states that "yes" stops the chain', () => {
  const step0 = step0Section(CONDUCTOR);
  assert.match(step0, /stop/i,
    'Step 0 must state that answering yes stops the chain');
  assert.match(step0, /steps? 1\s*[-–]\s*8/i,
    'Step 0 must state that steps 1-8 do not run');
});

test('bootstrap: the /greenfield literal survives the bootstrap path rewrite', () => {
  const adapted = adaptConductorPaths(CONDUCTOR, {
    '01-pre-flight.md': '@01-pre-flight.md',
    '02-discovery.md': '@02-discovery.md',
  });
  assert.ok(adapted.includes('/greenfield'),
    'the /greenfield literal must survive the path rewrite');
  assert.ok(!adapted.includes('@greenfield'),
    'the /greenfield literal must not be rewritten into a sibling path');
  assert.ok(!adapted.includes('./greenfield'),
    'the /greenfield literal must not be written as a broken ./greenfield path');
});
