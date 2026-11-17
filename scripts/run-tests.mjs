#!/usr/bin/env node
// scripts/run-tests.mjs — Run every test file in its own Node process.
//
// WHY THIS EXISTS
// ---------------
// `node --test` is a supervisor: it spawns one child per test file and reads
// the child's stdout. On that SAME pipe the runner multiplexes two unrelated
// producers:
//
//   1. the runner's own V8-serialized event frames
//      (`FF 0F | uint32 size | v8 payload`), and
//   2. whatever the test code (or the code it imports) writes to stdout.
//
// When the stray stdout bytes happen to mimic a frame header, the parent
// aborts the ENTIRE run with
//
//   Error: Unable to deserialize cloned data due to invalid or unsupported version.
//
// and reports a RANDOM test file as failed — even though every assertion
// inside it passed. The reported file changes from run to run.
//
// This is an upstream Node.js bug:
//   - nodejs/node#66164 (confirmed-bug)
//   - fixed by nodejs/node#66273 ("test_runner: do not crash on stdout that
//     mimics a v8 frame"), which landed on `main` but is NOT included in any
//     v24.x release — and this project supports Node >= 20.
//
// Running each file in its OWN process removes the supervisor and the
// misinterpreted pipe, while keeping the properties the suite relies on:
// one process per file (isolation between suites is unchanged), the `spec`
// reporter, and a non-zero exit code when a test fails.
//
// Usage:
//   node scripts/run-tests.mjs              → run every tests/**/*.test.mjs
//   node scripts/run-tests.mjs <substring>  → run only files whose path
//                                              contains <substring>
//
// A test file that never finishes would hang the whole run — in CI that
// is a job that hangs until the pipeline kills it, not a red build. Every
// file therefore gets a wall-clock budget; a file that exceeds it is
// killed and reported as a failure. Override with AI_TOOLKIT_TEST_TIMEOUT_MS.

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TESTS_DIR = join(ROOT, 'tests');

/** Maximum number of test files executed at the same time. */
const DEFAULT_CONCURRENCY = 8;

/** Wall-clock budget for a single test file, in milliseconds. */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Read the per-file timeout from the environment.
 *
 * @returns {number} the timeout in milliseconds
 */
function readTimeoutMs() {
  const raw = process.env.AI_TOOLKIT_TEST_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Recursively collect every `*.test.mjs` file under a directory.
 *
 * @param {string} dir - absolute directory to walk
 * @param {string[]} [found] - accumulator (internal)
 * @returns {string[]} absolute file paths, sorted for deterministic order
 */
function findTestFiles(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      findTestFiles(full, found);
    } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Run a single test file in its own Node process.
 *
 * The file gets a wall-clock budget. When it expires the child is killed
 * and the file is reported as a FAILURE (not as a hang) — a suite that
 * cannot finish must never look green.
 *
 * @param {string} file - absolute path to the test file
 * @param {number} timeoutMs - wall-clock budget for the file
 * @returns {Promise<{file: string, code: number|null, output: string, durationMs: number}>}
 */
function runFile(file, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    // `--test-reporter=spec` without `--test` keeps the reporter but skips
    // the supervisor — the whole point of this runner.
    // `detached` gives the child its own process group, so the timeout can
    // kill the WHOLE group: a grandchild that inherited stdout would
    // otherwise keep the pipe open and the runner would wait forever.
    const child = spawn(process.execPath, ['--test-reporter=spec', file], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let output = '';
    let timedOut = false;
    let settled = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });

    const settle = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        file,
        // A file that ran out of its budget is a FAILURE, whatever exit
        // code the process happened to produce.
        code: timedOut ? 1 : code,
        output,
        durationMs: Date.now() - startedAt,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      output += `\n✖ TIMEOUT — the file exceeded ${timeoutMs}ms and was killed.\n`;
      try {
        // Kill the process group first: a surviving grandchild would hold
        // the pipes open and `close` would never fire.
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      // Destroy the pipes so the runner never waits on a survivor, and
      // settle NOW instead of waiting for a `close` that may not come.
      child.stdout?.destroy();
      child.stderr?.destroy();
      settle(1);
    }, timeoutMs);
    // Do not hold the event loop open for the timer's sake.
    if (typeof timer.unref === 'function') timer.unref();

    child.on('error', (error) => {
      output += `\n✖ Could not run the file: ${error.message}\n`;
      settle(1);
    });
    child.on('close', (code) => { settle(code); });
  });
}

/**
 * Print a per-file result line and the file's captured output.
 *
 * @param {{file: string, code: number|null, output: string, durationMs: number}} result
 */
function report(result) {
  const rel = relative(ROOT, result.file).split(sep).join('/');
  const ok = result.code === 0;
  const mark = ok ? '✓' : '✗';
  process.stdout.write(`${mark} ${rel} (${result.durationMs}ms)\n`);
  if (result.output.trim()) {
    process.stdout.write(result.output.endsWith('\n') ? result.output : `${result.output}\n`);
  }
}

/**
 * Run the discovered test files with a bounded concurrency.
 *
 * @param {string[]} files - absolute test file paths
 * @param {number} concurrency - max files in flight
 * @param {number} timeoutMs - wall-clock budget for each file
 * @returns {Promise<{failed: {file: string, code: number|null}[], durationMs: number}>}
 */
async function runAll(files, concurrency, timeoutMs) {
  const failed = [];
  const startedAt = Date.now();
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= files.length) return;
      const result = await runFile(files[index], timeoutMs);
      report(result);
      if (result.code !== 0) {
        failed.push({ file: result.file, code: result.code });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, worker);
  await Promise.all(workers);
  return { failed, durationMs: Date.now() - startedAt };
}

/**
 * Entry point: discover, filter, run and summarize.
 *
 * @returns {Promise<void>} resolves once the summary has been printed
 */
async function main() {
  const filter = process.argv[2];
  let files = findTestFiles(TESTS_DIR).sort();
  if (filter) {
    files = files.filter((file) => relative(ROOT, file).includes(filter));
  }
  if (files.length === 0) {
    process.stdout.write('No test files found.\n');
    process.exitCode = 1;
    return;
  }

  const { failed, durationMs } = await runAll(files, DEFAULT_CONCURRENCY, readTimeoutMs());

  process.stdout.write('\n');
  if (failed.length > 0) {
    process.stdout.write('✖ failing test files:\n');
    for (const entry of failed) {
      process.stdout.write(`  ✖ ${relative(ROOT, entry.file).split(sep).join('/')} (exit ${entry.code})\n`);
    }
    process.stdout.write(
      `\n✖ ${failed.length} of ${files.length} test file(s) failed (${durationMs}ms).\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`✓ ${files.length} test file(s) passed (${durationMs}ms).\n`);
}

await main();
