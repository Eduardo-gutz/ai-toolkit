// adapters/_shared/bootstrap-renderer.mjs
//
// Legacy facade over the pack-aware shared renderer.
//
// The generic renderer lives in `adapters/_shared/prompt-pack.mjs` and
// serves every prompt pack (bootstrap, greenfield). This module keeps the
// *bootstrap-specific* public surface stable so existing adapters and
// their tests keep working unchanged:
//
//   BOOTSTRAP_CONDUCTOR_FILE, BOOTSTRAP_SUPPORTING_FILES,
//   readBootstrapSource(source)       → { conductor: string, supportingFiles: string[] }
//   adaptConductorPaths(content, map) → string
//
// Note the shape difference, which is deliberate and preserved:
//   - readBootstrapSource returns supporting files as an array of STRINGS
//     (the legacy contract).
//   - readPromptPack returns supporting files as an array of
//     { name, content } OBJECTS (the pack-aware contract).
//
// Who owns what:
//   - prompt-pack.mjs owns: the registry, reading a pack, rewriting paths,
//     validating a pack.
//   - THIS module owns: only the bootstrap-specific naming and the legacy
//     string-array shape.
//
// This helper does NOT modify `source/prompts/bootstrap/` — it only reads.
// It also does not know where each output goes: the adapter decides its
// structure (SKILL.md vs command.md, ./0X vs @0X, etc.).

import { PROMPT_PACKS, readPromptPack, adaptPackPaths } from './prompt-pack.mjs';

/** The bootstrap pack's conductor file name. */
export const BOOTSTRAP_CONDUCTOR_FILE = PROMPT_PACKS.bootstrap.conductor;

/**
 * The bootstrap pack's 9 supporting files.
 *
 * Canonical order, alphabetical by name. Matches the source's numerical
 * ordering (01..09). Derived from the shared pack registry, so a new
 * supporting file added to the source must be registered there in its
 * corresponding position.
 */
export const BOOTSTRAP_SUPPORTING_FILES = PROMPT_PACKS.bootstrap.supporting;

/**
 * Reads the 10 files from the canonical bootstrap source.
 *
 * @param {string} source - absolute path to the toolkit's source/ directory
 *                          (e.g. `<toolkitRoot>/source`)
 * @returns {{ conductor: string, supportingFiles: string[] }}
 *   conductor: contents of `00-conductor.md`
 *   supportingFiles: array of the 9 supporting files in canonical order
 * @throws if any file is missing
 */
export function readBootstrapSource(source) {
  const pack = readPromptPack(source, 'bootstrap');
  return {
    conductor: pack.conductor,
    supportingFiles: pack.supportingFiles.map((file) => file.content),
  };
}

/**
 * Rewrites the conductor's `./0X-<name>.md` sub-prompt paths according to
 * the tool's mapping. The conductor references these paths when listing the
 * 9 sub-prompts; each adapter rewrites them to its native format (e.g.
 * `./0X-...` for Claude Code, `@0X-...` for OpenCode).
 *
 * The mapping shape is `{ '01-pre-flight.md': './01-pre-flight.md', ... }`.
 * If a name does not appear in the mapping, the original `./...` path is
 * left unchanged.
 *
 * @param {string} conductorContent
 * @param {Object<string, string>} pathMapping
 * @returns {string}
 */
export function adaptConductorPaths(conductorContent, pathMapping) {
  return adaptPackPaths(conductorContent, BOOTSTRAP_SUPPORTING_FILES, pathMapping);
}

