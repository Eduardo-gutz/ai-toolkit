// bin/commands/init.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseToolsFlag } from '../lib/parse-tools-flag.mjs';
import { parseTypesFlag } from '../lib/parse-types-flag.mjs';
import { loadAdapter } from '../../adapters/_shared/load-adapter.mjs';

export const ALL_TYPES = Object.freeze(['agents', 'skills', 'mcps', 'rules', 'commands']);

/**
 * Install toolkit resources to a project for one or more tools.
 *
 * Resolution:
 *   tools: --tools > config.default_tools
 *   types: --types > ALL_TYPES (default: agents, skills, mcps, rules, commands)
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
    } catch (err) {
      console.error(`  ✗ ${tool}: ${err.message}`);
      errors.push({ tool, message: err.message });
    }
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
  }
}