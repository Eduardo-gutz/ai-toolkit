import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

const STATE_FILE = '.ai-toolkit.json';
const STATE_VERSION = '1.0.0';

/**
 * Read the state file from a target project.
 * Returns a default empty state if the file doesn't exist.
 * @param {string} targetDir - project directory
 * @returns {object}
 */
export function readState(targetDir) {
  const file = join(targetDir, STATE_FILE);
  if (!existsSync(file)) {
    return createDefaultState();
  }
  try {
    const raw = readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`State file corrupted at ${file}: ${err.message}`);
  }
}

/**
 * Write the state file to a target project.
 * @param {string} targetDir
 * @param {object} state
 */
export function writeState(targetDir, state) {
  const file = join(targetDir, STATE_FILE);
  const content = JSON.stringify(state, null, 2) + '\n';
  writeFileSync(file, content);
}

/**
 * Create a fresh default state object.
 * @returns {object}
 */
export function createDefaultState() {
  return {
    version: STATE_VERSION,
    installed_at: null,
    last_sync_at: null,
    tools: {},
    agents_md_owners: [],
  };
}

/**
 * Record that this tool wrote AGENTS.md (or owns it). Used by postRemoveCleanup
 * to decide whether the file can be safely deleted on remove — only the LAST
 * tool with rules registered may delete it. Idempotent.
 * @param {object} state
 * @param {string} toolName
 */
export function recordRulesOwnership(state, toolName) {
  if (!state.agents_md_owners) {
    // Legacy fallback: state from before ownership tracking existed.
    state.agents_md_owners = [];
  }
  if (!state.agents_md_owners.includes(toolName)) {
    state.agents_md_owners.push(toolName);
  }
}

/**
 * Release ownership of AGENTS.md for a tool. Called by postRemoveCleanup when
 * a tool has just removed its rules — leaves the file intact if other tools
 * still own it. No-op on legacy state (nothing to release).
 * @param {object} state
 * @param {string} toolName
 */
export function releaseRulesOwnership(state, toolName) {
  if (!state.agents_md_owners) return;
  state.agents_md_owners = state.agents_md_owners.filter((t) => t !== toolName);
}

/**
 * Record that a resource was installed under a specific tool.
 * @param {object} state
 * @param {string} tool - tool name (e.g., 'opencode', 'claude-code')
 * @param {string} type - resource type ('agents', 'skills', 'mcps', 'rules')
 * @param {string} name - resource name
 */
export function recordInstalled(state, tool, type, name) {
  if (!state.tools) {
    state.tools = {};
  }
  if (!state.tools[tool]) {
    state.tools[tool] = {};
  }
  if (!state.tools[tool][type]) {
    state.tools[tool][type] = {};
  }
  state.tools[tool][type][name] = {
    installed_at: new Date().toISOString(),
  };
}

/**
 * Record that a sync happened for a tool.
 * @param {object} state
 * @param {string} tool
 */
export function recordSync(state, tool) {
  state.last_sync_at = new Date().toISOString();
  if (!state.tools[tool]) state.tools[tool] = {};
}

/**
 * Get list of resources of a type installed for a tool.
 * @param {object} state
 * @param {string} tool
 * @param {string} type
 * @returns {string[]}
 */
export function getInstalled(state, tool, type) {
  return Object.keys(state.tools?.[tool]?.[type] || {});
}

/**
 * Remove a resource from state.
 * @param {object} state
 * @param {string} tool
 * @param {string} type
 * @param {string} name
 */
export function recordRemoved(state, tool, type, name) {
  if (state.tools?.[tool]?.[type]?.[name]) {
    delete state.tools[tool][type][name];
  }
}

/**
 * Delete the state file from a target project. Symmetric to writeState.
 * Silently no-ops if the file doesn't exist (the common case after a
 * `remove --purge` second run, or after a fresh project).
 *
 * Async because unlink() returns a Promise — must be awaited so callers
 * (e.g., `remove --purge`) can verify the file is gone before continuing.
 *
 * @param {string} targetDir
 * @returns {Promise<void>}
 */
export async function deleteState(targetDir) {
  const file = join(targetDir, STATE_FILE);
  try {
    await unlink(file);
  } catch (err) {
    // ENOENT (file already gone) is expected; rethrow other errors.
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Recursively prune empty parent keys from `state.tools`. After a series
 * of `recordRemoved(...)` calls, parents like `state.tools[tool][type]` may
 * remain as empty objects `{}`. This cleans them so
 * `Object.keys(state.tools).length === 0` is true when nothing remains —
 * a precondition for `remove --purge` to delete the state file.
 *
 * Mutates and returns `state`.
 *
 * @param {object} state
 * @returns {object} the same state object, mutated
 */
export function pruneEmpty(state) {
  if (!state || !state.tools) return state;

  for (const tool of Object.keys(state.tools)) {
    const toolData = state.tools[tool];
    if (!toolData || typeof toolData !== 'object') {
      delete state.tools[tool];
      continue;
    }
    for (const type of Object.keys(toolData)) {
      const typeData = toolData[type];
      if (
        !typeData
        || typeof typeData !== 'object'
        || Object.keys(typeData).length === 0
      ) {
        delete toolData[type];
      }
    }
    if (Object.keys(toolData).length === 0) {
      delete state.tools[tool];
    }
  }
  return state;
}