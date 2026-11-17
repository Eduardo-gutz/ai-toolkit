// Tests for the data-loss safety of installBootstrap() in both adapters.
//
// installBootstrap() re-installs the bootstrap command with force=true
// (that is what `sync` does). The legacy implementation wiped the target
// directory BEFORE reading the source pack, so an incomplete source pack
// left the user with the bootstrap command DELETED and nothing written
// back — the failure destroyed the previous install.
//
// The greenfield installer already reads the whole pack before touching the
// target (see installGreenfield). These tests pin the same guarantee for
// the bootstrap installer.
//
// Behavior under test:
//   - installBootstrap({force: true}) rejects when the source pack is
//     incomplete.
//   - The pre-existing bootstrap artifacts in the target SURVIVE that
//     rejection (nothing is wiped before the source is known to be good).
//
// Source of truth: source/prompts/bootstrap/ in the toolkit repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PROMPT_PACKS } from '../../adapters/_shared/prompt-pack.mjs';

const TOOLKIT_ROOT = join(import.meta.dirname, '../..');
const TOOLKIT_SOURCE = join(TOOLKIT_ROOT, 'source');

const ADAPTERS = {
  'claude-code': {
    adapterPath: '../../adapters/claude-code/adapter.mjs',
    // The existence probe and the artifacts that must survive.
    probe: '.claude/skills/bootstrap',
    artifacts: ['.claude/skills/bootstrap/SKILL.md'],
  },
  opencode: {
    adapterPath: '../../adapters/opencode/adapter.mjs',
    probe: '.opencode/commands/bootstrap',
    artifacts: ['.opencode/commands/bootstrap.md', '.opencode/commands/bootstrap/01-pre-flight.md'],
  },
};

/**
 * Build a `source/` tree whose bootstrap pack is missing one file.
 *
 * @param {string} missing - the file name to leave out of the pack
 * @returns {string} absolute path to the fake `source/` directory
 */
function buildIncompleteSource(missing) {
  const root = mkdtempSync(join(tmpdir(), 'aitk-boot-safety-'));
  const source = join(root, 'source');
  const pack = PROMPT_PACKS.bootstrap;
  const dir = join(source, 'prompts', pack.dir);
  mkdirSync(dir, { recursive: true });

  for (const name of [pack.conductor, ...pack.supporting]) {
    if (name === missing) continue;
    copyFileSync(join(TOOLKIT_SOURCE, 'prompts', pack.dir, name), join(dir, name));
  }
  return source;
}

/**
 * Create a target that already carries a bootstrap install.
 *
 * @param {string[]} artifacts - target-relative paths to create
 * @returns {string} absolute path to the target directory
 */
function buildTargetWithInstall(artifacts) {
  const target = mkdtempSync(join(tmpdir(), 'aitk-boot-target-'));
  for (const rel of artifacts) {
    const dst = join(target, rel);
    mkdirSync(join(dst, '..'), { recursive: true });
    writeFileSync(dst, 'PRE-EXISTING INSTALL\n');
  }
  return target;
}

for (const [tool, spec] of Object.entries(ADAPTERS)) {
  test(`${tool}: installBootstrap(force) rejects an incomplete source pack`, async () => {
    const source = buildIncompleteSource('05-code-style.md');
    const target = buildTargetWithInstall(spec.artifacts);
    const adapter = await import(spec.adapterPath);

    try {
      await assert.rejects(
        () => adapter.installBootstrap({ source, target }, { force: true }),
        /incomplete/i,
        'installBootstrap must reject when the source pack is incomplete'
      );
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`${tool}: installBootstrap(force) keeps the previous install when the source pack is incomplete`, async () => {
    const source = buildIncompleteSource('05-code-style.md');
    const target = buildTargetWithInstall(spec.artifacts);
    const adapter = await import(spec.adapterPath);

    try {
      await assert.rejects(() => adapter.installBootstrap({ source, target }, { force: true }));

      for (const rel of spec.artifacts) {
        assert.ok(
          existsSync(join(target, rel)),
          `${rel} must survive a failed reinstall — the target must not be wiped ` +
          'before the source pack is known to be complete'
        );
      }
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });
}
