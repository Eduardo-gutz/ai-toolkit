// bin/commands/sync.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseToolsFlag } from '../lib/parse-tools-flag.mjs';
import { parseTypesFlag } from '../lib/parse-types-flag.mjs';

/**
 * Reinstall toolkit resources to a project for one or more tools (idempotent).
 *
 * Resolution:
 *   tools: --tools > config.default_tools
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

  const tools = parseToolsFlag(flags) ?? config.default_tools ?? [];
  if (tools.length === 0) {
    throw new Error('No tools specified. Use --tools=opencode,claude-code or set config.default_tools.');
  }

  const types = parseTypesFlag(flags);

  console.log(`Syncing ai-toolkit in ${projectDir}...`);

  let installed = 0;
  const errors = [];

  for (const tool of tools) {
    if (!config.tools[tool] || typeof config.tools[tool] !== 'object') {
      console.warn(`Tool "${tool}" not configured properly. Skipping.`);
      continue;
    }
    const adapterPath = resolve(toolkitRoot, `adapters/${tool}/adapter.mjs`);
    if (!existsSync(adapterPath)) {
      console.warn(`Adapter not found for ${tool}. Skipping.`);
      continue;
    }

    try {
      const adapter = await import(adapterPath);
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

  console.log(`\nDone.`);
}