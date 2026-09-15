// adapters/_shared/bootstrap-renderer.mjs
//
// Shared logic for installing the /bootstrap command in adapters that
// support it (claude-code, opencode). The conductor and supporting files
// live in <toolkitRoot>/source/prompts/bootstrap/ as the single source of
// truth; each adapter only renders in its native format.
//
// This helper does NOT modify `source/prompts/bootstrap/` — it only reads.
// It also does not know where each output goes: the adapter decides its
// structure (SKILL.md vs command.md, ./0X vs @0X, etc.).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BOOTSTRAP_CONDUCTOR_FILE = '00-conductor.md';

// Canonical order, alphabetical by name. Matches the source's numerical
// ordering (01..08). Any new supporting file added to the source must appear
// here in its corresponding position.
export const BOOTSTRAP_SUPPORTING_FILES = Object.freeze([
  '01-pre-flight.md',
  '02-discovery.md',
  '03-stack.md',
  '04-architecture.md',
  '05-code-style.md',
  '06-conventions.md',
  '07-examples.md',
  '08-agents-md.md',
]);

/**
 * Reads the 9 files from the canonical bootstrap source.
 *
 * @param {string} source - absolute path to the toolkit's source/ directory
 *                          (e.g. `<toolkitRoot>/source`)
 * @returns {{ conductor: string, supportingFiles: string[] }}
 *   conductor: contents of `00-conductor.md`
 *   supportingFiles: array of the 8 supporting files in canonical order
 * @throws if any file is missing
 */
export function readBootstrapSource(source) {
  const sourceDir = join(source, 'prompts', 'bootstrap');
  const conductor = readFileSync(join(sourceDir, BOOTSTRAP_CONDUCTOR_FILE), 'utf8');
  const supportingFiles = BOOTSTRAP_SUPPORTING_FILES.map((name) =>
    readFileSync(join(sourceDir, name), 'utf8')
  );
  return { conductor, supportingFiles };
}

/**
 * Rewrites the conductor's `./0X-<name>.md` sub-prompt paths according to
 * the tool's mapping. The conductor references these paths when listing the
 * 8 sub-prompts; each adapter rewrites them to its native format (e.g.
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
  let result = conductorContent;
  for (const name of BOOTSTRAP_SUPPORTING_FILES) {
    if (pathMapping[name] === undefined) continue;
    const from = `./${name}`;
    const to = pathMapping[name];
    result = result.split(from).join(to);
  }
  return result;
}

