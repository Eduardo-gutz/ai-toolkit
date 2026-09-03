// adapters/_shared/load-adapter.mjs
//
// Single entry point for resolving and dynamically importing an adapter.
// All commands must go through this instead of doing
// `resolve(toolkitRoot, 'adapters/${tool}/adapter.mjs')` themselves — that
// pattern allowed unvalidated user input (--tools=../../tmp/evil) to load
// arbitrary code as an "adapter", with only an existence check as guard.
//
// Security model: WHITELIST via config.tools. The kit trusts config — if you
// can write to your own config file you already control the machine. But the
// user-controlled --tools flag must be checked against that whitelist BEFORE
// any path is constructed.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load an adapter module, validating the tool name against config.
 *
 * @param {string} tool             — adapter name (e.g. "opencode", "claude-code")
 * @param {object} config           — the loaded ai-toolkit.config.json
 * @param {string} toolkitRoot      — absolute path to the toolkit install
 * @returns {Promise<object>}        — the adapter's exports (install/sync/remove/validate)
 * @throws  if the tool is not whitelisted in config.tools
 * @throws  if the adapter module does not exist
 */
export async function loadAdapter(tool, config, toolkitRoot) {
  // 1. Whitelist check — defense against --tools=../../evil injection.
  // Fail closed: an empty or absent config.tools explicitly rejects all tools.
  // We will not load any adapter unless the operator has named the tool.
  const configured = config && config.tools ? Object.keys(config.tools) : [];
  if (configured.length === 0) {
    throw new Error(
      `Tool "${tool}" is not configured. config.tools is empty or missing. ` +
      `Add an entry to your ai-toolkit.config.json under "tools" before using this command.`
    );
  }
  if (!configured.includes(tool)) {
    throw new Error(
      `Tool "${tool}" is not configured. Valid tools: ${configured.join(', ')}`
    );
  }

  // 2. Construct the path (now safe — tool is whitelisted).
  const adapterPath = resolve(toolkitRoot, `adapters/${tool}/adapter.mjs`);

  // 3. Existence check.
  if (!existsSync(adapterPath)) {
    throw new Error(`Adapter not found for "${tool}" at ${adapterPath}`);
  }

  // 4. Dynamic import.
  return import(adapterPath);
}
