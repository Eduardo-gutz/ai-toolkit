// bin/commands/remove.mjs
import { resolve, sep } from 'node:path';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { confirm } from '@inquirer/prompts';
import {
  readState,
  writeState,
  recordRemoved,
  deleteState,
  pruneEmpty,
} from '../../adapters/_shared/state.mjs';
import { loadAdapter } from '../../adapters/_shared/load-adapter.mjs';
import { parseToolsFlag } from '../lib/parse-tools-flag.mjs';
import { parseTypesFlag } from '../lib/parse-types-flag.mjs';
import { ALL_TYPES } from './init.mjs';

/**
 * Validate that a resource name is safe to use in file paths.
 *
 * SECURITY: previously, names from CLI args were interpolated directly into
 * filesystem paths (e.g. `${projectDir}/.claude/skills/${name}`), which meant
 *   `ai-toolkit remove skills ..`
 * would resolve to the parent of the project and `rm -rf` it. This rejects
 * any path-traversal characters and limits to a safe alphabet.
 *
 * Rules:
 *   - 1..128 chars
 *   - ASCII letters, digits, '-', '_', '.'
 *   - Cannot start with '.'
 *   - Cannot be exactly '.' or '..'
 */
function assertSafeName(name, type) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`Invalid ${type} name: must be a non-empty string`);
  }
  if (name.length > 128) {
    throw new Error(`Invalid ${type} name "${name}": max 128 chars`);
  }
  if (name === '.' || name === '..') {
    throw new Error(`Invalid ${type} name "${name}"`);
  }
  if (name.startsWith('.')) {
    throw new Error(`Invalid ${type} name "${name}": cannot start with "."`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(
      `Invalid ${type} name "${name}". ` +
      `Allowed: letters, digits, "_", "-", "." (not as first char)`
    );
  }
}

/**
 * Build a project-relative path and verify it stays inside the project root.
 *
 * SECURITY: belt-and-braces alongside assertSafeName. Even if a future bug
 * accepts a weird name, this guarantees the resolved absolute path is a
 * descendant of projectDir — refuses anything that escapes (e.g. via absolute
 * paths or relative traversal).
 */
function resolveSafe(projectDir, ...segments) {
  const projectResolved = resolve(projectDir);
  const candidate = resolve(projectResolved, ...segments);
  if (candidate !== projectResolved && !candidate.startsWith(projectResolved + sep)) {
    throw new Error(
      `Path "${candidate}" escapes project directory "${projectResolved}"`
    );
  }
  return candidate;
}

/**
 * Parse `flags.tools` robustly. See bin/lib/parse-tools-flag.mjs for the
 * shared implementation; this is a re-export so callers don't have to
 * import from `../lib/`.
 */
export { parseToolsFlag } from '../lib/parse-tools-flag.mjs';

export async function removeCommand({ flags, config, args = [], projectDir, toolkitRoot }) {
  if (!config) throw new Error(`Config not found. Run \`ai-toolkit init\` first.`);

  const explicitTools = parseToolsFlag(flags);
  const configuredTools = Object.keys(config.tools || {});
  const tools = explicitTools !== null ? explicitTools : configuredTools;

  // Parse --types once. Returns string[]|null:
  //   - string[] when --types=agents,skills (validated against ALL_TYPES)
  //   - null when --types is absent OR value-less (treated as "all types")
  // Throws "Unknown type(s): ..." for invalid CSV entries.
  const parsedTypes = parseTypesFlag(flags, ALL_TYPES);

  const [type, name] = args;

  // Validate positional type up-front (rejects "remove bogus foo" before any
  // adapter call). --types is already validated by parseTypesFlag; this
  // catches the legacy positional path.
  if (type && !ALL_TYPES.includes(type)) {
    throw new Error(
      `Unknown type: "${type}". Valid types: ${ALL_TYPES.join(', ')}`
    );
  }

  // Mode 3: type + name → specific resource (--types is ignored for specific)
  if (type && name) {
    return await removeSpecific({ flags, config, type, name, projectDir, toolkitRoot, tools });
  }

  // Mode 1 / Mode 2: resolve typeFilter with priority positional > --types > null.
  //   - remove agents (positional, no --types) → filter = 'agents'  (back-compat)
  //   - --types=agents,skills (no positional)   → filter = ['agents','skills']
  //   - remove (no positional, no --types)     → filter = null (all)
  // Plan §4: "as the resource-type list for Mode 2 (when no positional type)" —
  // so positional takes precedence when present.
  let typeFilter;
  if (type) {
    // Positional type is already validated up-front.
    typeFilter = type;
  } else if (parsedTypes) {
    typeFilter = parsedTypes;
  } else {
    typeFilter = null;
  }

  return await removeByScope({ flags, config, projectDir, toolkitRoot, tools, typeFilter });
}

/**
 * Remove all resources (or all of a single type) from the project.
 * Uses the adapter's remove() for full removal, or a filtered
 * iteration for type-scoped removal.
 *
 * @param {object} args
 * @param {string|null|string[]} args.typeFilter
 *   - null → remove all types (Mode 1, no --types, no positional)
 *   - string → single type filter (back-compat: `remove agents`)
 *   - string[] → CSV list filter (`--types=agents,skills`)
 */
async function removeByScope({ flags, config, projectDir, toolkitRoot, tools, typeFilter }) {
  const state = readState(projectDir);
  const summary = summarizeState(state, tools, typeFilter);

  if (summary.total === 0) {
    // --purge: still attempt to delete the state file even when nothing is
    // installed. The user explicitly asked for it to be gone; we must not
    // silently skip because the early-return is "nothing to remove".
    if (isPurgeRequested(flags.purge)) {
      await finalizeStateAfterRemoval(projectDir, flags.purge, null);
      return;
    }
    const filterLabel = formatTypeFilter(typeFilter);
    console.log(filterLabel
      ? `No ${filterLabel} installed.`
      : 'Nothing to remove. State is clean.');
    return;
  }

  // Show what will be removed
  const scopeLabel = formatTypeFilter(typeFilter) || 'all resources';
  console.log(`Will remove ${scopeLabel}:`);
  for (const [tool, types] of Object.entries(summary.byTool)) {
    for (const [type, names] of Object.entries(types)) {
      console.log(`  [${tool}] ${type}: ${Object.keys(names).join(', ')}`);
    }
  }

  // Confirm (skip with --yes)
  if (!flags.yes) {
    if (!process.stdin.isTTY) {
      throw new Error(
        `Non-interactive mode detected. Re-run with --yes to confirm removal of ${scopeLabel}.`
      );
    }
    const ok = await confirm({
      message: `Proceed with removal? (${summary.total} resource(s) will be deleted)`,
      default: false,
    });
    if (!ok) {
      console.log('Aborted. Nothing was removed.');
      return;
    }
  }

  // Normalize typeFilter to string[] for adapter.remove({types})
  const types = typeFilter === null
    ? undefined            // adapter.remove({}) → remove all
    : (Array.isArray(typeFilter) ? typeFilter : [typeFilter]);

  if (types) {
    // Type-scoped: delegate to each adapter's remove({ types }) — same code
    // path as Mode 1, just filtered. Errors are accumulated per tool
    // (mirror sync.mjs:148-173) and only throw when ALL fail.
    let installed = 0;
    const errors = [];
    for (const tool of tools) {
      try {
        const adapter = await loadAdapter(tool, config, toolkitRoot);
        await adapter.remove({ target: projectDir, config, types });
        console.log(`  ✓ ${tool}: ${types.join(', ')} removed`);
        installed++;
      } catch (err) {
        console.warn(`  ✗ ${tool}: ${err.message}`);
        errors.push({ tool, message: err.message });
      }
    }
    if (installed === 0 && errors.length > 0) {
      throw new Error(`All tools failed:\n${errors.map((e) => `  ${e.tool}: ${e.message}`).join('\n')}`);
    }
  } else {
    // All: use each adapter's remove() via loadAdapter (whitelist enforced).
    // adapter.remove() calls postRemoveCleanup() internally to remove empty
    // dirs and stub files, so we don't drive adapter.cleanupDirs() from here.
    for (const tool of tools) {
      try {
        const adapter = await loadAdapter(tool, config, toolkitRoot);
        await adapter.remove({ target: projectDir, config });
        console.log(`  ✓ ${tool}: removed`);
      } catch (err) {
        console.warn(`  ✗ ${tool}: ${err.message}`);
      }
    }
  }

  console.log(`\nDone. ${typeFilter ? `Run \`ai-toolkit init\` to re-install ${formatTypeFilter(typeFilter)}.` : `Run \`ai-toolkit init\` to re-install.`}`);

  // Prune state unconditionally so the audit trail is clean:
  // recordRemoved() leaves empty parent keys (state.tools[tool][type] = {})
  // behind; without pruneEmpty, state.tools would never become truly empty.
  const finalState = readState(projectDir);
  pruneEmpty(finalState);

  // Finalize state per the --purge decision (shared with removeSpecific).
  await finalizeStateAfterRemoval(projectDir, flags.purge, finalState);
}

/**
 * Persist (or delete) the state file after a removal, honoring the
 * --purge flag. Shared by removeByScope (Mode 1/2) and removeSpecific (Mode 3)
 * so both paths produce consistent audit trails.
 *
 * @param {string} projectDir
 * @param {*} purgeFlagValue - the raw value of flags.purge (see isPurgeRequested)
 * @param {object} [prunedState] - the already-pruned state to persist when
 *   --purge is set but state is non-empty, or when --purge is absent.
 *   Defaults to re-reading from disk.
 */
async function finalizeStateAfterRemoval(projectDir, purgeFlagValue, prunedState) {
  const statePath = resolve(projectDir, '.ai-toolkit.json');
  const stateExisted = existsSync(statePath);
  const state = prunedState || readState(projectDir);
  pruneEmpty(state);
  const isEmpty = Object.keys(state.tools || {}).length === 0;

  if (isPurgeRequested(purgeFlagValue)) {
    if (isEmpty) {
      await deleteState(projectDir);
      if (stateExisted) {
        console.log('State file deleted (.ai-toolkit.json) — purge complete.');
      } else {
        console.log('No state file to delete (already clean).');
      }
      return;
    }
    // --purge requested but state still has resources: persist the pruned
    // state so the file stays valid; print what we kept.
    writeState(projectDir, state);
    console.log('State file retained (some tools still have resources).');
    return;
  }

  // No --purge: persist the pruned audit trail so the state file looks
  // clean ({ tools: {} } when fully removed) instead of leaving empty
  // parent objects around.
  writeState(projectDir, state);
}

/**
 * Decide whether the user requested `--purge`. The flag is value-bearing
 * (NOT in parse-flags BOOLEAN_FLAGS), so the value space is unusual.
 * Accepts:
 *   - `'true'` (--purge=true or --purge true)
 *   - `false` (value-less --purge — plan §5 explicit)
 *   - `true` (defensive — doesn't occur with current parseFlags)
 * Rejects:
 *   - `'false'` (explicit --purge=false)
 *   - `undefined` (flag absent)
 */
function isPurgeRequested(flagValue) {
  return flagValue === true || flagValue === 'true' || flagValue === false;
}

/**
 * Normalize typeFilter (string | string[] | null) into a human-readable label.
 *   null        → ''  (caller decides "all resources")
 *   'agents'    → 'agents'
 *   ['agents','skills'] → 'agents,skills'
 */
function formatTypeFilter(typeFilter) {
  if (typeFilter === null || typeFilter === undefined) return '';
  if (Array.isArray(typeFilter)) return typeFilter.join(',');
  return String(typeFilter);
}

/**
 * Remove a specific resource (type + name).
 *
 * SECURITY:
 *   - assertSafeName() rejects path-traversal and shell-meta characters.
 *   - loadAdapter() enforces the tool whitelist AND returns adapter.resourcePaths()
 *     which validates the name again (defense-in-depth: same regex as the
 *     command-level check).
 *   - Each path returned by adapter.resourcePaths() is run through resolveSafe()
 *     to confirm containment inside projectDir before rm — defense-in-depth
 *     against any future adapter bug that escapes the project boundary.
 */
async function removeSpecific({ flags, config, type, name, projectDir, toolkitRoot, tools }) {
  // Validate name BEFORE doing any I/O. Throws clearly.
  assertSafeName(name, type);

  let removed = false;
  let lastPrunedState = null;

  for (const tool of tools) {
    let adapter;
    try {
      adapter = await loadAdapter(tool, config, toolkitRoot);
    } catch (err) {
      console.warn(`  ⚠ ${tool}: ${err.message}`);
      continue;
    }

    let paths;
    try {
      paths = adapter.resourcePaths(type, name, projectDir);
    } catch (err) {
      console.warn(`  ⚠ ${tool}: ${err.message}`);
      continue;
    }

    // Defense-in-depth: confirm every returned path stays inside projectDir.
    // resolveSafe throws if a path escapes — aborts before rm can run.
    const safePaths = [];
    for (const p of paths) {
      try {
        safePaths.push(resolveSafe(projectDir, p));
      } catch (err) {
        console.warn(`  ⚠ ${tool}: ${err.message}`);
      }
    }

    for (const p of safePaths) {
      try {
        await rm(p, { recursive: true, force: true });
        removed = true;
      } catch (err) {
        // Real errors (EACCES, EBUSY) are no longer hidden.
        console.warn(`  ⚠ ${tool}: failed to remove ${p}: ${err.message}`);
      }
    }

    if (safePaths.length > 0) {
      const state = readState(projectDir);
      recordRemoved(state, tool, type, name);
      // Prune empty parents so this Mode stays consistent with Modes 1+2
      // (which iterate via adapter.remove() and naturally leave state.tools
      // empty when all resources are gone). Without this, removing the last
      // resource of a type leaves state.tools[tool][type] = {} behind.
      pruneEmpty(state);
      writeState(projectDir, state);
      lastPrunedState = state;
    }
  }

  // Honor --purge: if the last per-tool removal left state fully empty,
  // delete the file (or keep it, depending on flags.purge). Shared helper
  // with removeByScope so the audit trail is consistent across modes.
  if (lastPrunedState) {
    await finalizeStateAfterRemoval(projectDir, flags.purge, lastPrunedState);
  }

  if (removed) {
    console.log(`Removed ${type}:${name} from ${tools.length} tool(s).`);
  } else {
    console.warn(`${type}:${name} was not installed.`);
  }
}

/**
 * Build a summary of what's installed per tool, optionally filtered by type.
 * @param {object} state
 * @param {string[]} tools
 * @param {string|null|string[]} typeFilter
 *   - null → count all types
 *   - string → only that type
 *   - string[] → only types in the list
 * @returns {{ total: number, byTool: object }}
 */
function summarizeState(state, tools, typeFilter = null) {
  const matches = Array.isArray(typeFilter)
    ? (t) => typeFilter.includes(t)
    : typeFilter === null
      ? () => true
      : (t) => t === typeFilter;
  const summary = { total: 0, byTool: {} };
  for (const tool of tools) {
    const toolData = state.tools?.[tool];
    if (!toolData) continue;
    for (const [type, names] of Object.entries(toolData)) {
      if (!matches(type)) continue;
      for (const name of Object.keys(names)) {
        if (!summary.byTool[tool]) summary.byTool[tool] = {};
        if (!summary.byTool[tool][type]) summary.byTool[tool][type] = {};
        summary.byTool[tool][type][name] = true;
        summary.total++;
      }
    }
  }
  return summary;
}
