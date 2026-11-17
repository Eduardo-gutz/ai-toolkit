// Tests for scripts/run-tests.mjs — the project's canonical test entry
// point (`npm test`).
//
// The runner replaces `node --test 'tests/**/*.test.mjs'` because the
// upstream supervisor can abort the whole run on stray stdout (see the
// header of scripts/run-tests.mjs). It therefore owns three behaviours the
// suite depends on, and none of them were covered:
//
//   - a path filter selects the files to run, and a successful run exits 0;
//   - a filter that matches nothing is an ERROR (exit 1), not a silent
//     green run — otherwise a typo'd filter looks like a passing suite;
//   - a failing test file makes the runner exit 1 and names the failing
//     path in the summary.
//
// Behavior under test:
//   (a) filter matching one file  → exit 0.
//   (b) filter matching nothing   → exit 1 + "No test files found.".
//   (c) a deliberately failing file → exit 1 + the failing path in the
//       summary.
//   (d) a file that never finishes  → killed at the timeout and reported
//       as a FAILURE, so a hang can never look like a green suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TOOLKIT_ROOT = join(import.meta.dirname, '../..');
const RUNNER = join(TOOLKIT_ROOT, 'scripts', 'run-tests.mjs');

/**
 * Run the test runner with a path filter.
 *
 * @param {string} filter - the path substring to filter on
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
function runWithFilter(filter) {
  const result = spawnSync(process.execPath, [RUNNER, filter], {
    cwd: TOOLKIT_ROOT,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('run-tests: a filter matching exactly one file runs it and exits 0', () => {
  const result = runWithFilter('tests/safe-name.test.mjs');

  assert.equal(result.status, 0,
    `a successful filtered run must exit 0 — stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /1 test file\(s\) passed/,
    'the summary must report the single file as passed');
  assert.doesNotMatch(result.stdout, /No test files found/,
    'the runner must not report an empty selection');
});

test('run-tests: a filter matching nothing exits 1 and says no test files were found', () => {
  const result = runWithFilter('zzz-no-such-test-file-zzz');

  assert.equal(result.status, 1,
    'a filter that matches nothing must exit 1 — an empty run is not a green run');
  assert.match(result.stdout, /No test files found\./,
    'the runner must state that no test file matched the filter');
});

test('run-tests: a failing test file exits 1 and is named in the summary', () => {
  // The fixture lives under tests/ because that is the only tree the
  // runner scans. It is removed in the finally block.
  const name = `zz-run-tests-fixture-${process.pid}-${Date.now()}.test.mjs`;
  const relPath = join('tests', name);
  const absPath = join(TOOLKIT_ROOT, relPath);

  writeFileSync(
    absPath,
    "import { test } from 'node:test';\n" +
    "test('deliberately failing fixture', () => { throw new Error('boom'); });\n"
  );

  try {
    const result = runWithFilter(relPath);

    assert.equal(result.status, 1,
      `a failing test file must make the runner exit 1 — stdout:\n${result.stdout}`);

    // The path must appear in the runner's OWN summary — not only in the
    // captured reporter output of the failing file, which also mentions it.
    const summaryIdx = result.stdout.indexOf('✖ failing test files:');
    assert.ok(summaryIdx !== -1,
      `the runner must print a failing-test-files summary — stdout:\n${result.stdout}`);
    const summary = result.stdout.slice(summaryIdx);
    assert.ok(summary.includes(relPath),
      `the summary must name the failing test file "${relPath}" — summary:\n${summary}`);
    assert.match(summary, /1 of 1 test file\(s\) failed/,
      'the summary must report the failing file count');
  } finally {
    rmSync(absPath, { force: true });
  }
});

test('run-tests: a file that never finishes is killed at the timeout and reported as a failure', () => {
  // A hanging test file used to hang the runner forever: in CI that is a
  // job that stalls until the pipeline kills it, not a red build. The
  // runner owns a wall-clock budget per file and reports the expiry as
  // a failure.
  const name = `zz-run-tests-hang-${process.pid}-${Date.now()}.test.mjs`;
  const relPath = join('tests', name);
  const absPath = join(TOOLKIT_ROOT, relPath);

  writeFileSync(
    absPath,
    "import { test } from 'node:test';\n" +
    "test('never finishes', async () => { await new Promise(() => {}); });\n"
  );

  try {
    const result = spawnSync(process.execPath, [RUNNER, relPath], {
      cwd: TOOLKIT_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, AI_TOOLKIT_TEST_TIMEOUT_MS: '2000' },
    });

    assert.equal(result.status, 1,
      `a hanging file must make the runner exit 1 — stdout:\n${result.stdout}`);

    const summaryIdx = result.stdout.indexOf('✖ failing test files:');
    assert.ok(summaryIdx !== -1,
      `the runner must print a failing-test-files summary — stdout:\n${result.stdout}`);
    const summary = result.stdout.slice(summaryIdx);
    assert.ok(summary.includes(relPath),
      `the summary must name the timed-out test file "${relPath}" — summary:\n${summary}`);
    assert.match(result.stdout, /TIMEOUT/,
      'the runner must say the file timed out, not that it failed an assertion');
  } finally {
    rmSync(absPath, { force: true });
  }
});
