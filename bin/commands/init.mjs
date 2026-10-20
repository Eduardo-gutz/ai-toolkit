// bin/commands/init.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseToolsFlag } from '../lib/parse-tools-flag.mjs';
import { parseTypesFlag } from '../lib/parse-types-flag.mjs';
import { loadAdapter } from '../../adapters/_shared/load-adapter.mjs';

export const ALL_TYPES = Object.freeze(['agents', 'skills', 'mcps', 'rules', 'commands']);

// Marker block delimiters used by `ensureToolkitGitignore`. Em-dash is U+2014
// (not a hyphen) — copy this constant, do not retype the literal.
const GITIGNORE_MARKER_OPEN = '# >>> ai-toolkit (managed — do not edit between markers) >>>';
const GITIGNORE_MARKER_CLOSE = '# <<< ai-toolkit <<<';

/**
 * Compute the per-tool .gitignore pattern set for the target project.
 *
 * Pattern rules (human-approved, see plan §1):
 *   - `/.opencode/`        if `opencode` in `installedTools`
 *   - `/.claude/`          if `claude-code` in `installedTools`
 *   - `AGENTS.md`          always (rules body)
 *   - `CLAUDE.md`          if `claude-code` in `installedTools` (only meaningful there)
 *   - state file           always; basename → leading `/`, path with `/` → leading `./`
 *                          (e.g. `.ai-toolkit.json` → `/.ai-toolkit.json`;
 *                          `custom/state.json` → `./custom/state.json`)
 *
 * Empty `installedTools` is defensively treated as "no patterns" — useful for
 * direct unit tests that probe edge cases. In normal flow `initCommand` only
 * invokes the helper after `installed > 0`, so this branch rarely fires.
 *
 * Caller contract for `stateFileRelPath` (plan §Assumptions/Risk): it MUST be
 * a project-relative path inside the project root — i.e. a basename (e.g.
 * `.ai-toolkit.json`) or a forward-slash path that does not escape the root
 * via leading `/` or `..` segments. Absolute paths (e.g. `/etc/passwd`,
 * `C:\foo`), `..`-prefixed paths (e.g. `../secrets.json`), and backslash
 * separators are NOT supported for the .gitignore pattern and will produce
 * an invalid entry. Configure `config.install.state_file` to a project-
 * relative path; the helper does not validate this.
 *
 * @param {Set<string>} installedTools - tool names that succeeded
 * @param {string} stateFileRelPath    - project-relative state file path
 * @returns {string[]}                 - ordered pattern list (stable order for diffs)
 */
function buildGitignorePatterns(installedTools, stateFileRelPath) {
  if (installedTools.size === 0) return [];
  const patterns = [];
  if (installedTools.has('opencode')) patterns.push('/.opencode/');
  if (installedTools.has('claude-code')) patterns.push('/.claude/');
  patterns.push('AGENTS.md');
  if (installedTools.has('claude-code')) patterns.push('CLAUDE.md');
  // State file: basename → leading /; path with / → leading ./
  const statePattern = stateFileRelPath.includes('/')
    ? `./${stateFileRelPath}`
    : `/${stateFileRelPath}`;
  patterns.push(statePattern);
  return patterns;
}

/**
 * Render the toolkit-managed marker block as a string. Patterns appear one
 * per line, sandwiched between the open/close marker comments. The block
 * always ends with a single trailing newline so concatenation to user
 * content is straightforward.
 *
 * @param {string[]} patterns - ordered patterns (from buildGitignorePatterns)
 * @returns {string}           - the marker block including final newline
 */
function renderMarkerBlock(patterns) {
  return `${GITIGNORE_MARKER_OPEN}\n${patterns.join('\n')}\n${GITIGNORE_MARKER_CLOSE}\n`;
}

/**
 * Ensure `<projectDir>/.gitignore` contains a toolkit-managed marker block
 * with the patterns for the installed tools. Idempotent: a second call with
 * the same inputs is a no-op; with different tools the existing block is
 * replaced in place (never duplicated). User content outside the markers
 * is preserved byte-for-byte.
 *
 * The block format:
 *   # >>> ai-toolkit (managed — do not edit between markers) >>>
 *   <one pattern per line>
 *   # <<< ai-toolkit <<<
 *
 * Returns:
 *   - `{ action: 'created', patternCount }`  — file did not exist; written fresh
 *   - `{ action: 'updated', patternCount }`  — block was inserted or replaced
 *   - `{ action: 'unchanged', patternCount }`— block already matched; no write
 *   - `{ action: 'skipped', reason }`        — I/O error; logged, not thrown
 *
 * Defensive: any I/O error (read, write, permission, ENOENT race) is logged
 * via `console.warn` and the function returns `{ action: 'skipped', reason }`.
 * It NEVER throws — matches the per-tool-error accumulation convention in
 * `initCommand` (errors are warnings; throws only on full failure).
 *
 * NOTE: This helper is intentionally out of scope for `sync` and `remove`
 * (see plan §4.3, §Open Question 3). Only `init` invokes it.
 *
 * @param {string} projectDir           - target project directory
 * @param {Set<string>} installedTools  - tool names whose install succeeded
 * @param {string} stateFileRelPath     - project-relative state file path
 * @returns {Promise<{action: string, patternCount?: number, reason?: string}>}
 */
export async function ensureToolkitGitignore(projectDir, installedTools, stateFileRelPath) {
  const gitignorePath = join(projectDir, '.gitignore');
  const patterns = buildGitignorePatterns(installedTools, stateFileRelPath);
  const newBlock = renderMarkerBlock(patterns);

  try {
    let existing = '';
    let fileExisted = false;
    let existingHadBlock = false;
    let existingHadTrailingNewline = false;
    if (existsSync(gitignorePath)) {
      fileExisted = true;
      existing = await readFile(gitignorePath, 'utf8');
      existingHadTrailingNewline = existing.endsWith('\n');
      existingHadBlock = existing.includes(GITIGNORE_MARKER_OPEN)
        && existing.includes(GITIGNORE_MARKER_CLOSE);
    }

    if (!existingHadBlock) {
      // Append the block, ensuring exactly one blank line between user
      // content and the marker block regardless of trailing-newline state.
      const separator = existing.length === 0
        ? ''
        : (existingHadTrailingNewline ? '\n' : '\n\n');
      await writeFile(gitignorePath, existing + separator + newBlock);
      // `created` only when the file did not exist before; `updated` when
      // we appended to an existing file (matches plan §1 acceptance).
      return {
        action: fileExisted ? 'updated' : 'created',
        patternCount: patterns.length,
      };
    }

    // Existing block present — find the slice between the markers and
    // replace it with the new block contents. Preserves everything outside
    // the markers byte-for-byte.
    const openIdx = existing.indexOf(GITIGNORE_MARKER_OPEN);
    const closeIdx = existing.indexOf(GITIGNORE_MARKER_CLOSE);
    const before = existing.slice(0, openIdx);
    const afterStart = closeIdx + GITIGNORE_MARKER_CLOSE.length;
    const after = existing.slice(afterStart);
    const newContent = before + newBlock + (after.startsWith('\n') ? after.slice(1) : after);

    if (newContent === existing) {
      return { action: 'unchanged', patternCount: patterns.length };
    }
    await writeFile(gitignorePath, newContent);
    return { action: 'updated', patternCount: patterns.length };
  } catch (err) {
    console.warn(`  ⚠ Skipped .gitignore management: ${err.message}`);
    return { action: 'skipped', reason: err.message };
  }
}

/**
 * Install toolkit resources to a project for one or more tools.
 *
 * Resolution:
 *   tools: --tools > config.default_tools
 *   types: subset of ['agents', 'skills', 'mcps', 'rules', 'commands'].
 *          Empty/missing = install all five advertised types.
 *          'commands' is accepted for forward-compat but is a no-op
 *          (walker deferred per WHY.md §8 Fase 3).
 *
 * The per-tool bootstrap skill/command (rendered by the adapter's
 * `installBootstrap`) runs unconditionally per tool — it's a meta-install
 * providing a /bootstrap command to the agent, not a content type. The
 * `--types` filter only applies to the 5 content types listed above; it
 * does NOT gate the bootstrap install — a user passing
 * `--tools=claude-code --types=agents` will still get the bootstrap skill.
 * The bootstrap is invoked via the adapter's lifecycle registry
 * (lifecycle.install), so init never calls `adapter.installBootstrap`
 * directly — the registry is the single source of truth.
 *
 * Auto-creates projectDir if missing. Does NOT touch state directly —
 * adapters handle their own per-resource state writes.
 *
 * Errors are accumulated per-tool; throws only if ALL tools fail.
 *
 * @param {object} args
 * @param {object} args.flags      - parsed CLI flags (tools, types, project, global, yes)
 * @param {object} args.config     - loaded ai-toolkit.config.json
 * @param {string} args.configPath - resolved config path (for error messages)
 * @param {string} args.projectDir - target project directory
 * @param {string} args.toolkitRoot - absolute path to toolkit installation
 */
export async function initCommand({ flags, config, configPath, projectDir, toolkitRoot }) {
  if (!config) {
    throw new Error(
      `Config not found${configPath ? ` at ${configPath}` : ' in any search path'}. ` +
      `Run from a project with ai-toolkit.config.json, or pass --config=<path>.`
    );
  }
  if (!config.tools || typeof config.tools !== 'object' || Array.isArray(config.tools)) {
    throw new Error(
      'config.tools must be an object mapping tool name to config. ' +
      'Example: { "tools": { "opencode": {...}, "claude-code": {...} } }'
    );
  }

  if (config.source !== undefined && typeof config.source !== 'string') {
    throw new Error('config.source must be a string path.');
  }

  const toolsFromFlags = parseToolsFlag(flags);
  const tools = toolsFromFlags ?? config.default_tools ?? [];
  // True only when the user explicitly passed --tools (even if empty after parsing).
  // Used later to distinguish "user intent violated" from "best-effort defaults missed".
  const toolsExplicit = toolsFromFlags !== null;
  if (tools.length === 0) {
    throw new Error('No tools specified. Use --tools=opencode,claude-code or set config.default_tools.');
  }

  const types = parseTypesFlag(flags, ALL_TYPES) ?? [...ALL_TYPES];

  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
    console.log(`  → Created ${projectDir}`);
  }

  const errors = [];
  let installed = 0;
  const installedTools = new Set();

  for (const tool of tools) {
    if (!config.tools[tool] || typeof config.tools[tool] !== 'object' || Array.isArray(config.tools[tool])) {
      console.warn(`Tool "${tool}" not configured properly. Skipping.`);
      continue;
    }

    let adapter;
    try {
      adapter = await loadAdapter(tool, config, toolkitRoot);
    } catch (err) {
      console.warn(`Adapter not loaded for "${tool}": ${err.message}. Skipping.`);
      continue;
    }

    console.log(`Installing for ${tool}...`);
    try {
      await adapter.install({
        source: resolve(toolkitRoot, config.source || './source'),
        target: projectDir,
        config,
        types,
      });
      console.log(`  ✓ ${tool} installed.`);
      installed++;
      installedTools.add(tool);
    } catch (err) {
      console.error(`  ✗ ${tool}: ${err.message}`);
      errors.push({ tool, message: err.message });
    }

    // Bootstrap skill/command is installed via the adapter's lifecycle
    // registry inside adapter.install() above (lifecycle.install has
    // installBootstrap pushed for each tool that supports it). Init must
    // NOT call adapter.installBootstrap directly here — doing so would
    // double-invoke on a fresh install and emit duplicate log lines on
    // idempotent re-runs. The registry is the single source of truth; the
    // adapter owns logging for its own extras (e.g., the "Bootstrap skill
    // already exists..." message comes from installBootstrap itself on the
    // idempotent path).
  }

  if (installed === 0) {
    if (errors.length > 0) {
      throw new Error(`All tools failed:\n${errors.map(e => `  ${e.tool}: ${e.message}`).join('\n')}`);
    }
    if (toolsExplicit) {
      // User explicitly asked for these tools via --tools. Silent skip is misleading.
      throw new Error(
        `None of the requested tools (${tools.join(', ')}) are configured. ` +
        `Check that --tools matches config.tools entries in your ai-toolkit.config.json.`
      );
    }
    console.warn('No tools were installed. Check that --tools matches config.tools entries.');
    return;
  }

  // At least one tool succeeded — manage the project's .gitignore with a
  // marker block covering the per-tool dirs, the rules body (AGENTS.md),
  // CLAUDE.md if claude-code installed, and the state file. The helper is
  // idempotent (block-replace, not line-level dedupe), defensive (never
  // throws), and is the only call site in the CLI — sync and remove are
  // deliberately out of scope per plan §4.3.
  const stateFileRelPath = config.install?.state_file ?? '.ai-toolkit.json';
  const gitignoreResult = await ensureToolkitGitignore(projectDir, installedTools, stateFileRelPath);
  switch (gitignoreResult.action) {
    case 'created':
      console.log(`  ✓ Created .gitignore with toolkit patterns (${gitignoreResult.patternCount})`);
      break;
    case 'updated':
      console.log(`  ✓ Updated .gitignore with toolkit patterns (${gitignoreResult.patternCount})`);
      break;
    case 'unchanged':
      console.log(`  → .gitignore already contains toolkit patterns`);
      break;
    case 'skipped':
      // helper already logged the warn; nothing more to say
      break;
  }
}