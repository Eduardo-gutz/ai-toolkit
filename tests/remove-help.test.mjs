// Smoke test for the `remove` command's help text. Step 8 expands the
// description in bin/ai-toolkit.mjs to mention --types= and --purge, and
// the README's usage line. We assert the help output includes both flags
// so docs drift is caught in CI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../bin/ai-toolkit.mjs');

test('help text mentions --types= and --purge for remove command', () => {
  const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `--help should exit 0. stderr: ${result.stderr}`);
  const help = result.stdout;

  // Find the remove line in the help output.
  const removeLine = help.split('\n').find((l) => /\bremove\b/.test(l));
  assert.ok(removeLine, 'help output should mention `remove`');

  // Per plan §8: the description should mention both --types= and --purge.
  // We don't assert exact wording (brittle) — just that both tokens appear
  // somewhere in the `remove` line OR in the global flags block above it.
  assert.match(help, /--types=/, 'help should mention --types=');
  assert.match(help, /--purge/, 'help should mention --purge');
});

test('README remove usage line lists --types= and --purge', async () => {
  const fs = await import('node:fs/promises');
  const readme = await fs.readFile(join(__dirname, '../bin/README.md'), 'utf8');
  const lines = readme.split('\n');
  const removeLine = lines.find((l) => /\bremove\b/.test(l));
  assert.ok(removeLine, 'bin/README.md should mention `remove`');
  assert.match(removeLine, /--types=/, 'README remove line should list --types=');
  assert.match(removeLine, /--purge/, 'README remove line should list --purge');
});
