// bin/commands/sync.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseToolsFlag } from '../lib/parse-tools-flag.mjs';
import { parseTypesFlag } from '../lib/parse-types-flag.mjs';
import { loadAdapter } from '../../adapters/_shared/load-adapter.mjs';
import { readState, writeState } from '../../adapters/_shared/state.mjs';

/**
 * Filesystem markers per tool: if any of these paths exist in the project
 * directory, the tool is considered physically installed. Used by sync as a
 * FALLBACK for recovery scenarios (state file empty/missing) and to verify
 * state-based detection candidates (so stale state entries are filtered).
 */
const TOOL_FS_MARKERS = {
  opencode: ['.opencode/agents', '.opencode/skills', 'opencode.json'],
  'claude-code': ['.claude/agents', '.claude/skills', 'CLAUDE.md', '.mcp.json'],
};

function isInstalledOnFs(projectDir, tool) {
  const markers = TOOL_FS_MARKERS[tool] || [];
  return markers.some((m) => existsSync(resolve(projectDir, m)));
}

/**
 * Detect which tools to sync.
 *
 * Resolution:
 *   1. State is the PRIMARY source of truth: when state.tools has at least
 *      one tool, return those (filtered through config.tools whitelist AND
 *      fs-marker verification — a state entry with no fs markers is treated
 *      as stale and filtered out, so the adapter doesn't re-install what
 *      the user manually removed).
 *   2. When state.tools is empty (state file missing or freshly written
 *      without tools), fall back to fs-marker detection. This is the
 *      RECOVERY scenario — print it so the user knows to run `init`.
 *
 * Constrained to tools also in config.tools: auto-detect never picks up a
 * tool that isn't configured.
 */
function detectInstalledTools(projectDir, configTools) {
  const state = readState(projectDir);
  const stateToolKeys = Object.keys(state.tools || {});

  if (stateToolKeys.length > 0) {
    // State is primary. Filter through config.tools whitelist AND fs-marker
    // verification. Stale entries (in state, no fs markers) get filtered here
    // and then pruned from state by the post-sync step.
    return stateToolKeys.filter(
      (t) => configTools[t] && isInstalledOnFs(projectDir, t)
    );
  }

  // Fallback: fs-marker detection (recovery scenario).
  const installed = [];
  for (const tool of Object.keys(TOOL_FS_MARKERS)) {
    if (!configTools[tool]) continue;
    if (isInstalledOnFs(projectDir, tool)) {
      installed.push(tool);
    }
  }
  if (installed.length > 0) {
    console.log(
      `Note: state file is empty; auto-detecting from filesystem markers. ` +
      `Run 'ai-toolkit init' to register properly.`
    );
  }
  return installed;
}

/**
 * Reinstall toolkit resources to a project for one or more tools (idempotent).
 *
 * --tools is AUTHORITATIVE: when provided (even value-less, parsed as `null`),
 * filesystem/state detection is skipped and the explicit list is used. This
 * means `sync --tools=claude-code` will install claude-code into a project
 * that doesn't have it on disk — equivalent to `init` for that tool. Omitting
 * --tools triggers the state-based auto-detection (with fs fallback).
 *
 * Resolution:
 *   tools: --tools > state-based detect (with fs fallback if state is empty)
 *   types: --types (when provided) filters adapter sync to those types only;
 *          sync doesn't validate against ALL_TYPES because the adapter's
 *          `want(t)` filter handles unknown types gracefully (silently skipped).
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
export async function syncCommand({ flags, config, configPath, projectDir, toolkitRoot }) {
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

  // Parse --types first so its errors surface even when no tools end up being synced.
  const types = parseTypesFlag(flags);

  const explicitTools = parseToolsFlag(flags);
  let tools;
  let explicitEmpty = false;
  if (explicitTools !== null) {
    // User passed --tools explicitly. Respect it; skip filesystem/state detection.
    tools = explicitTools;
    if (tools.length === 0) explicitEmpty = true;
  } else {
    // No --tools: auto-detect (state primary, fs fallback).
    const installed = detectInstalledTools(projectDir, config.tools);
    if (installed.length === 0) {
      console.log(`Nothing to sync in ${projectDir} (no toolkit files present).`);
      console.log(`Tip: run \`ai-toolkit init --tools=<...>\` to set up.`);
      return;
    }
    tools = installed;
  }
  if (tools.length === 0) {
    const validTools = Object.keys(config.tools).join(', ');
    if (explicitEmpty) {
      throw new Error(
        `You passed --tools with an empty value. Use --tools=${validTools} ` +
        `(omit --tools to auto-detect from state).`
      );
    }
    // Defensive: should not reach here because the no-flags path early-returns.
    throw new Error(
      `No tools detected. Use --tools=${validTools}, or ensure state file (.ai-toolkit.json) reflects installed tools.`
    );
  }

  console.log(`Syncing ai-toolkit in ${projectDir}...`);

  let installed = 0;
  const errors = [];

  for (const tool of tools) {
    // Defense-in-depth: skip tools whose config value is malformed (array).
    // The whitelist check + path resolution + dynamic import is delegated
    // to loadAdapter (single source of truth — guards against --tools
    // injection by validating against config.tools BEFORE any path is
    // constructed).
    if (Array.isArray(config.tools[tool])) {
      console.warn(`Tool "${tool}" not configured properly. Skipping.`);
      continue;
    }

    try {
      const adapter = await loadAdapter(tool, config, toolkitRoot);
      await adapter.sync({
        source: resolve(toolkitRoot, config.source || './source'),
        target: projectDir,
        config,
        types,
      });
      console.log(`  ✓ ${tool} synced.`);
      installed++;
    } catch (err) {
      console.error(`  ✗ ${tool}: ${err.message}`);
      errors.push({ tool, message: err.message });
    }
  }

  if (installed === 0) {
    if (errors.length > 0) {
      throw new Error(`All tools failed:\n${errors.map(e => `  ${e.tool}: ${e.message}`).join('\n')}`);
    }
    console.warn('No tools were synced. Check that --tools matches config.tools entries.');
    return;
  }

  // Prune state.tools to drop entries for CONFIGURED tools that weren't
  // synced this run AND are no longer physically installed. We deliberately
  // leave entries for tools NOT in config.tools — sync doesn't know about
  // them and shouldn't delete state it doesn't own (could be a future
  // adapter or third-party data). The fs-marker check is critical: a tool
  // not synced this run may simply mean the user used selective --tools,
  // not that the tool is gone — leaving the entry preserves the on-disk
  // install (otherwise .claude/ files would become orphaned, invisible to
  // future sync/list/doctor). Only runs when we actually synced at least
  // one tool — the early-return "Nothing to sync" path leaves state untouched.
  const state = readState(projectDir);
  const syncedKeys = new Set(tools);
  const configuredKeys = new Set(Object.keys(config.tools || {}));
  let pruned = false;
  for (const key of Object.keys(state.tools || {})) {
    if (configuredKeys.has(key) && !syncedKeys.has(key) && !isInstalledOnFs(projectDir, key)) {
      delete state.tools[key];
      pruned = true;
    }
  }
  if (pruned) writeState(projectDir, state);

  console.log(`\nDone.`);
}
