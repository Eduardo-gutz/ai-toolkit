// adapters/_shared/prompt-pack.mjs
//
// Shared logic for installing a *prompt pack* into a target project.
//
// A prompt pack is a directory under <toolkitRoot>/source/prompts/<dir>/
// containing:
//   - a conductor file (00-conductor.md) that orchestrates the chain,
//   - numbered supporting files (01-…09-…) run one at a time,
//   - optional assets (e.g. a defaults/ catalog) copied verbatim.
//
// Who owns what:
//   - THIS module owns: the pack registry (PROMPT_PACKS), reading a pack
//     from the canonical source, rewriting the conductor's cross-file
//     references, and validating that every registered file is present.
//   - THIS module does NOT own: where the output lands, how the files are
//     named in the target, or the tool-specific frontmatter. Each adapter
//     decides that (e.g. claude-code uses `./01-…`, opencode uses `@01-…`).
//
// This helper does NOT modify the source tree — it only reads.

import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * The canonical registry of prompt packs shipped by the toolkit.
 *
 * Frozen registry: adding a pack is a deliberate, reviewed change. The
 * ordering of the entries is canonical (`bootstrap` first, then
 * `greenfield`) — do not reorder without updating the docs that list them.
 *
 * Each entry declares:
 *   - `id`       — the registry key (also the user-facing command name).
 *   - `dir`      — directory name under `source/prompts/`.
 *   - `conductor`— the orchestrator file name inside the pack.
 *   - `supporting`— numbered supporting files, in canonical run order.
 *   - `assets`   — extra files copied verbatim (may be empty).
 *
 * @type {Readonly<Record<string, Readonly<{
 *   id: string,
 *   dir: string,
 *   conductor: string,
 *   supporting: readonly string[],
 *   assets: readonly string[],
 * }>>>}
 */
export const PROMPT_PACKS = Object.freeze({
  bootstrap: Object.freeze({
    id: 'bootstrap',
    dir: 'bootstrap',
    conductor: '00-conductor.md',
    // Canonical order, matching the source's numerical ordering (01..09).
    supporting: Object.freeze([
      '01-pre-flight.md',
      '02-discovery.md',
      '03-stack.md',
      '04-architecture.md',
      '05-code-style.md',
      '06-conventions.md',
      '07-examples.md',
      '08-agents-md.md',
      '09-prune.md',
    ]),
    assets: Object.freeze([]),
  }),
  greenfield: Object.freeze({
    id: 'greenfield',
    dir: 'greenfield',
    conductor: '00-conductor.md',
    // Canonical order, matching the source's numerical ordering (01..09).
    supporting: Object.freeze([
      '01-pre-flight.md',
      '02-interview.md',
      '03-standards.md',
      '04-stack.md',
      '05-architecture.md',
      '06-code-style.md',
      '07-conventions.md',
      '08-agents-md.md',
      '09-prune.md',
    ]),
    assets: Object.freeze([
      'defaults/_baseline.md',
      'defaults/node-typescript.md',
      'defaults/python.md',
      'defaults/react-native.md',
      'defaults/react.md',
      'defaults/nextjs.md',
      'defaults/express.md',
      'defaults/fastapi.md',
      'defaults/php.md',
      'defaults/android.md',
      'defaults/ios.md',
    ]),
  }),
});

/**
 * Resolve a pack id to its registry entry.
 *
 * @param {string} packId - the pack id (e.g. `bootstrap`, `greenfield`)
 * @returns {Readonly<{id: string, dir: string, conductor: string, supporting: readonly string[], assets: readonly string[]}>}
 * @throws {Error} if the pack id is not registered
 */
export function getPromptPack(packId) {
  const pack = PROMPT_PACKS[packId];
  if (!pack) {
    const known = Object.keys(PROMPT_PACKS).join(', ');
    throw new Error(
      `Unknown prompt pack "${packId}". Known packs: ${known}.`
    );
  }
  return pack;
}

/**
 * List every file a pack declares, resolved to absolute paths.
 *
 * @param {string} source - absolute path to the toolkit's `source/` directory
 * @param {object} pack - a pack registry entry
 * @returns {{name: string, path: string}[]} conductor first, then supporting, then assets
 */
function resolvePackFiles(source, pack) {
  const dir = join(source, 'prompts', pack.dir);
  return [pack.conductor, ...pack.supporting, ...pack.assets].map((name) => ({
    name,
    path: join(dir, name),
  }));
}

/**
 * Find every file a pack declares that is absent from the source tree.
 *
 * @param {string} source - absolute path to the toolkit's `source/` directory
 * @param {object} pack - a pack registry entry
 * @returns {{name: string, path: string}[]} the missing files (empty when complete)
 */
function findMissingFiles(source, pack) {
  return resolvePackFiles(source, pack).filter((file) => !existsSync(file.path));
}

/**
 * Build the error thrown when a pack's files are missing from the source.
 *
 * The message lists EVERY missing file (not just the first) so the
 * `ai-toolkit validate` output is actionable in a single pass.
 *
 * @param {object} pack - a pack registry entry
 * @param {{name: string, path: string}[]} missing
 * @returns {Error}
 */
function missingFilesError(pack, missing) {
  const lines = missing.map((file) => `  - ${file.path}`);
  return new Error(
    `Prompt pack "${pack.id}" is incomplete. Missing ${missing.length} file(s) under ` +
    `source/prompts/${pack.dir}/:\n${lines.join('\n')}`
  );
}

/**
 * Read a prompt pack from the canonical source tree.
 *
 * Every file the pack declares must be present — the pack is read as a
 * unit so a half-installed pack can never reach the target.
 *
 * @param {string} source - absolute path to the toolkit's `source/` directory
 *                          (e.g. `<toolkitRoot>/source`)
 * @param {string} packId - the pack id (e.g. `bootstrap`, `greenfield`)
 * @returns {{id: string, conductor: string, supportingFiles: {name: string, content: string}[], assets: {name: string, content: string}[]}}
 *   `conductor` — contents of the pack's conductor file.
 *   `supportingFiles` — the numbered supporting files, in registry order.
 *   `assets` — the asset files, in registry order (empty for `bootstrap`).
 * @throws {Error} if the pack id is unknown, or if any declared file is absent
 */
export function readPromptPack(source, packId) {
  const pack = getPromptPack(packId);
  const missing = findMissingFiles(source, pack);
  if (missing.length > 0) {
    throw missingFilesError(pack, missing);
  }

  const dir = join(source, 'prompts', pack.dir);
  const read = (name) => readFileSync(join(dir, name), 'utf8');

  return {
    id: pack.id,
    conductor: read(pack.conductor),
    supportingFiles: pack.supporting.map((name) => ({ name, content: read(name) })),
    assets: pack.assets.map((name) => ({ name, content: read(name) })),
  };
}

/**
 * The directory part of a pack file name, with its trailing separator
 * (e.g. `defaults/` for `defaults/_baseline.md`).
 *
 * @param {string} name - a pack file name
 * @returns {string} the directory prefix, or '' for a root-level file
 */
function nameDirectory(name) {
  const separator = name.lastIndexOf('/');
  return separator === -1 ? '' : name.slice(0, separator + 1);
}

/**
 * Escape a string so it can be used literally inside a RegExp.
 *
 * @param {string} value - the string to escape
 * @returns {string} the escaped string
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collect the directory-scoped prefixes a mapping implies.
 *
 * A pack file may live in a subdirectory (e.g. `defaults/_baseline.md`).
 * The conductor then references it as `./defaults/<name>.md` — and may
 * also reference a *placeholder* (`./defaults/<stack>.md`) that names no
 * declared file, which the literal rewrite cannot touch. The tool's own
 * prefix comes from the mapping (`@defaults/_baseline.md` → `@`,
 * `./defaults/_baseline.md` → `./`), so the placeholder must be rewritten
 * with that same prefix.
 *
 * The prefix is reported even when the rewrite is a no-op (Claude Code's
 * `./` form already matches the source), because the provenance-marker
 * normalizer needs it to strip a leaked prefix.
 *
 * @param {readonly string[]} fileNames - the pack file names to consider
 * @param {Readonly<Record<string, string>>} pathMapping - name → replacement
 * @returns {{directory: string, prefix: string, from: string, to: string}[]}
 */
function directoryScopedPrefixes(fileNames, pathMapping) {
  const prefixes = [];
  const seen = new Set();
  for (const name of fileNames) {
    const to = pathMapping[name];
    if (to === undefined) continue;
    const directory = nameDirectory(name);
    if (directory === '' || seen.has(directory)) continue;
    // The replacement must end with the name — otherwise the tool prefix
    // cannot be derived from it. The directory is consumed only once a
    // valid mapping value has produced its prefix, so a sibling with a
    // conforming value can still yield the rewrite.
    if (!to.endsWith(name)) continue;
    seen.add(directory);
    const prefix = to.slice(0, to.length - name.length);
    prefixes.push({
      directory,
      prefix,
      from: `./${directory}`,
      to: `${prefix}${directory}`,
    });
  }
  return prefixes;
}

/**
 * Restore the NEUTRAL form of a provenance marker.
 *
 * A `[default: …]` marker records the catalog file a value came from.
 * That value is copied verbatim into the generated `.context/` files,
 * where a tool-specific prefix (`./`, `@`) means nothing — it would name
 * a path that does not exist. The path rewrites cannot tell a marker
 * apart from a prose reference, so a marker written as
 * `[default: ./defaults/x.md]` inherits the prefix and leaks it into the
 * generated files.
 *
 * This restores the neutral form for every marker that names a declared
 * pack file: the file name stays, the tool prefix goes. Only the prefix
 * the tool actually uses is stripped — a marker that carries some OTHER
 * prefix is left alone, because that is a different mistake (a wrong
 * path), not a leaked tool prefix.
 *
 * @param {string} content - the content to normalize
 * @param {readonly string[]} fileNames - the pack file names, longest first
 * @param {readonly string[]} prefixes - the tool prefixes to strip
 * @returns {string} the normalized content
 */
function normalizeProvenanceMarkers(content, fileNames, prefixes) {
  let result = content;
  // The optional prefix group: the real tool prefixes only.
  const prefixGroup = prefixes.length > 0
    ? `(?:${prefixes.map(escapeRegExp).join('|')})?`
    : '';
  for (const name of fileNames) {
    // `[default: ./defaults/react.md]` → `[default: defaults/react.md]`.
    const pattern = new RegExp(
      `(\\[default:\\s*)${prefixGroup}(${escapeRegExp(name)})`,
      'g'
    );
    result = result.replace(pattern, `$1$2`);
  }
  return result;
}

/**
 * Write a pack file into a target WITHOUT clobbering what the user owns.
 *
 * `init` must never destroy something the user owns. A file that is
 * already at the destination is:
 *
 *   - IDENTICAL to what the toolkit would write → the toolkit's own file;
 *     it is left exactly as it is.
 *   - DIFFERENT → the user's file, or one they edited. It is left alone
 *     and reported as a conflict.
 *
 * With `force` (the `sync` path) the file is always written: propagating
 * a source change is exactly what `sync` is for.
 *
 * @param {string} path - absolute path of the file to write
 * @param {string} content - the content the toolkit would write
 * @param {{force?: boolean}} [options]
 * @returns {Promise<'written'|'unchanged'|'conflict'>} what happened
 */
export async function writePackFile(path, content, options = {}) {
  const { force = false } = options;
  if (!force) {
    let existing = null;
    try {
      existing = await readFile(path, 'utf8');
    } catch {
      existing = null;
    }
    if (existing !== null) {
      return existing === content ? 'unchanged' : 'conflict';
    }
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return 'written';
}

/**
 * Rewrite the conductor's cross-file references according to a tool's
 * mapping.
 *
 * The conductor references its siblings as `./<name>` (e.g.
 * `./01-pre-flight.md`, `./defaults/_baseline.md`). Each adapter rewrites
 * those to its native format (e.g. `./01-…` for Claude Code, `@01-…` for
 * OpenCode).
 *
 * A *placeholder* reference (`./defaults/<stack>.md`) names no declared
 * file, so it is not covered by the literal rewrite. It is rewritten
 * through its directory instead, so it follows the same tool convention
 * as the literal names.
 *
 * The mapping shape is `{ '01-pre-flight.md': './01-pre-flight.md', … }`.
 * A name that does not appear in the mapping is left unchanged.
 *
 * A provenance marker (`[default: …]`) is NOT a reference the agent
 * opens — it is data that ends up inside the generated `.context/`
 * files. It therefore keeps the NEUTRAL relative path, whatever prefix
 * the tool uses for a reference. See `normalizeProvenanceMarkers`.
 *
 * @param {string} conductorContent - the raw conductor body
 * @param {readonly string[]} fileNames - the pack file names to consider
 *   (the union of the pack's `supporting` and `assets`)
 * @param {Readonly<Record<string, string>>} [pathMapping] - name → replacement
 * @returns {string} the rewritten content
 */
export function adaptPackPaths(conductorContent, fileNames, pathMapping = {}) {
  let result = conductorContent;
  // Longest name first, so a name that is a prefix of another never
  // shadows it (e.g. `defaults/_baseline.md` before a shorter sibling).
  const ordered = [...fileNames].sort((a, b) => b.length - a.length);
  for (const name of ordered) {
    const to = pathMapping[name];
    if (to === undefined) continue;
    result = result.split(`./${name}`).join(to);
  }
  // The placeholder form of a directory-scoped reference (`./defaults/<stack>.md`)
  // names no declared file, so the literal rewrite above leaves it
  // untouched. Rewrite its directory prefix so it follows the same tool
  // convention as the literal names.
  for (const { from, to } of directoryScopedPrefixes(ordered, pathMapping)) {
    // The reference is already in the target form — nothing to rewrite.
    if (from === to) continue;
    result = result.split(from).join(to);
  }
  // A marker is data, not a reference: strip any tool prefix a rewrite
  // may have handed it, so the generated files always record the neutral
  // relative path.
  const prefixes = new Set();
  for (const name of ordered) {
    const to = pathMapping[name];
    if (typeof to !== 'string') continue;
    if (!to.endsWith(name)) continue;
    const prefix = to.slice(0, to.length - name.length);
    if (prefix.length > 0) prefixes.add(prefix);
  }
  return normalizeProvenanceMarkers(result, ordered, [...prefixes]);
}

/**
 * Verify that every file a pack declares exists in the source tree.
 *
 * By default the pack is REQUIRED: the source must ship it, complete.
 *
 * With `required: false` a source that does not ship the pack at all is
 * accepted: the pack directory is simply absent, so there is nothing to
 * validate. A pack directory that EXISTS but misses one of its files is
 * still an error — a half-present pack would install a broken command.
 *
 * @param {string} source - absolute path to the toolkit's `source/` directory
 * @param {string} packId - the pack id (e.g. `bootstrap`, `greenfield`)
 * @param {{required?: boolean}} [options]
 *   `required` — whether the source must ship this pack (default `true`).
 * @returns {{ok: true}}
 * @throws {Error} if the pack id is unknown, or if any declared file is absent
 *   (the message lists every missing file path)
 */
export function validatePromptPack(source, packId, options = {}) {
  const { required = true } = options;
  const pack = getPromptPack(packId);
  const dir = join(source, 'prompts', pack.dir);
  if (!required && !existsSync(dir)) {
    // The source does not ship this pack — nothing to validate.
    return { ok: true };
  }
  const missing = findMissingFiles(source, pack);
  if (missing.length > 0) {
    throw missingFilesError(pack, missing);
  }
  return { ok: true };
}
