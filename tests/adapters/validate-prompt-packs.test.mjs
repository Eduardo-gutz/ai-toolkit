// Tests for the prompt-pack validation wired into both adapters'
// validate() smoke test.
//
// `ai-toolkit validate` must cover EVERY registered prompt pack — not just
// the extractive bootstrap one. When a pack file is missing from the
// canonical source, the adapter's validate() must throw an error that
// names the missing file path(s), so the CLI output is actionable.
//
// Behavior under test:
//   - validate() passes against the real, complete source tree.
//   - validate() throws when a greenfield pack file is missing, and the
//     message names that file verbatim.
//   - validate() throws when a bootstrap pack file is missing, and the
//     message names that file verbatim.
//   - When SEVERAL files are missing, the message names EVERY one of them
//     (not just the first).
//
// Source of truth: source/prompts/ in the toolkit repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { PROMPT_PACKS } from '../../adapters/_shared/prompt-pack.mjs';

const TOOLKIT_ROOT = join(import.meta.dirname, '../..');
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');

const ADAPTERS = {
  'claude-code': '../../adapters/claude-code/adapter.mjs',
  opencode: '../../adapters/opencode/adapter.mjs',
};

const CONFIG = { source: './source', tools: {}, default_tools: [] };

/**
 * Build a fake `source/` tree holding every file of every registered
 * prompt pack, then delete the files listed in `omit`.
 *
 * The fake tree is a byte-for-byte copy of the canonical packs so the
 * only variable under test is the presence/absence of the omitted files.
 *
 * @param {string[]} [omit] - source-relative paths to delete, e.g.
 *   `prompts/greenfield/06-code-style.md`
 * @returns {string} absolute path to the fake `source/` directory
 */
function buildFakeSource(omit = []) {
  const root = mkdtempSync(join(tmpdir(), 'aitk-validate-packs-'));
  const source = join(root, 'source');

  for (const pack of Object.values(PROMPT_PACKS)) {
    const dir = join(source, 'prompts', pack.dir);
    mkdirSync(dir, { recursive: true });
    for (const name of [pack.conductor, ...pack.supporting, ...pack.assets]) {
      const dst = join(dir, name);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, readFileSync(join(TOOLKIT_SOURCE, 'prompts', pack.dir, name)));
    }
  }

  for (const rel of omit) {
    rmSync(join(source, rel), { force: true });
  }

  return source;
}

/**
 * Assert that `validate()` rejects with a message naming `fileName`.
 *
 * @param {string} adapterPath - import path of the adapter module
 * @param {string} source - the `source/` directory to validate
 * @param {string} fileName - the file name that must appear in the error
 */
async function assertValidateNames(adapterPath, source, fileName) {
  const adapter = await import(adapterPath);
  await assert.rejects(
    () => adapter.validate({ source, config: CONFIG }),
    (err) => {
      assert.ok(
        err.message.includes(fileName),
        `error message must name the missing file "${fileName}" — got: ${err.message}`
      );
      return true;
    },
    'validate() must throw when a prompt pack file is missing'
  );
}

for (const [tool, adapterPath] of Object.entries(ADAPTERS)) {
  test(`${tool}: validate() passes against the complete canonical source`, async () => {
    const adapter = await import(adapterPath);
    const result = await adapter.validate({ source: TOOLKIT_SOURCE, config: CONFIG });
    assert.deepEqual(result, { ok: true }, 'validate() must report ok for a complete source');
  });

  test(`${tool}: validate() throws naming a missing greenfield pack file`, async () => {
    const source = buildFakeSource(['prompts/greenfield/06-code-style.md']);
    await assertValidateNames(adapterPath, source, '06-code-style.md');
  });

  test(`${tool}: validate() throws naming a missing bootstrap pack file`, async () => {
    const source = buildFakeSource(['prompts/bootstrap/02-discovery.md']);
    await assertValidateNames(adapterPath, source, '02-discovery.md');
  });

  test(`${tool}: validate() names EVERY missing pack file, not just the first`, async () => {
    // Two files of the SAME pack are missing — the error must name both,
    // not stop at the first one it hits.
    const source = buildFakeSource([
      'prompts/greenfield/06-code-style.md',
      'prompts/greenfield/09-prune.md',
    ]);
    const adapter = await import(adapterPath);
    await assert.rejects(
      () => adapter.validate({ source, config: CONFIG }),
      (err) => {
        for (const name of ['06-code-style.md', '09-prune.md']) {
          assert.ok(
            err.message.includes(name),
            `error message must name "${name}" — got: ${err.message}`
          );
        }
        return true;
      },
      'validate() must throw listing every missing file'
    );
  });

  test(`${tool}: validate() skips a pack the source does not ship at all`, async () => {
    // A source tree that ships NO prompts directory is not a broken pack.
    // The pack check must be skipped instead of reporting every registered
    // pack file as missing — otherwise a source that simply has no prompts
    // (e.g. the tracked fixture used by the adapter integration tests)
    // fails validation with a message pointing at the toolkit's own source.
    const root = mkdtempSync(join(tmpdir(), 'aitk-validate-nopacks-'));
    const source = join(root, 'source');
    mkdirSync(source, { recursive: true });

    const adapter = await import(adapterPath);
    const result = await adapter.validate({ source, config: CONFIG });
    assert.deepEqual(result, { ok: true },
      'validate() must skip the pack check when the source ships no prompts');
  });
}
