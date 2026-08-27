import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
  };
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