// bin/commands/validate.mjs
import { resolve } from 'node:path';
import { loadAdapter } from '../../adapters/_shared/load-adapter.mjs';
import { parseToolsFlag } from '../lib/parse-tools-flag.mjs';

/**
 * Validate canonical source against adapter requirements.
 * Each tool's adapter.validate() smoke-tests the source layout.
 *
 * STRICT: throws if ANY tool fails (unlike init's best-effort skip).
 *
 * @param {object} args
 * @param {object} args.flags
 * @param {object} args.config
 * @param {string} args.configPath
 * @param {string} args.projectDir
 * @param {string} args.toolkitRoot
 */
export async function validateCommand({ flags, config, configPath, projectDir, toolkitRoot }) {
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

  const explicitTools = parseToolsFlag(flags);
  const tools = explicitTools !== null ? explicitTools : Object.keys(config.tools || {});
  const sourceDir = resolve(toolkitRoot, config.source || './source');
  const errors = [];

  console.log(`Validating canonical source at ${resolve(sourceDir)}...`);

  for (const tool of tools) {
    // loadAdapter is the single source of truth for whitelist validation;
    // its throw is caught and accumulated as a strict-mode error.
    let adapter;
    try {
      adapter = await loadAdapter(tool, config, toolkitRoot);
    } catch (err) {
      console.error(`  ✗ ${tool}: ${err.message}`);
      errors.push({ tool, message: err.message });
      continue;
    }

    try {
      await adapter.validate({ source: sourceDir, config });
      console.log(`  ✓ ${tool}: source valid.`);
    } catch (err) {
      console.error(`  ✗ ${tool}: ${err.message}`);
      errors.push({ tool, message: err.message });
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s) found.`);
    // Shape mirrors init.mjs#98 / remove.mjs#207. Prefix preserved for tests/validate-command.test.mjs (L191/212/245) asserting /N validation error/.
    // Throw (not process.exit) so tests can catch the rejection via validateCommand(...).catch(...).
    throw new Error(
      `${errors.length} validation error(s):\n` +
      errors.map((e) => `  ${e.tool}: ${e.message}`).join('\n')
    );
  } else {
    console.log(`\nAll valid.`);
  }
}
