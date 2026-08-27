// bin/commands/validate.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function validateCommand({ flags, config, configPath, projectDir, toolkitRoot }) {
  if (!config) {
    throw new Error(`Config not found at ${configPath}.`);
  }

  const tools = flags.tools ? flags.tools.split(',') : Object.keys(config.tools || {});
  const sourceDir = resolve(toolkitRoot, config.source || './source');
  let errors = 0;

  console.log(`Validating canonical source at ${resolve(sourceDir)}...`);

  for (const tool of tools) {
    if (!config.tools[tool]) continue;
    const adapterPath = resolve(toolkitRoot, `adapters/${tool}/adapter.mjs`);
    if (!existsSync(adapterPath)) {
      console.warn(`Adapter not found for ${tool}.`);
      errors++;
      continue;
    }
    try {
      const adapter = await import(adapterPath);
      await adapter.validate({ source: sourceDir, config });
      console.log(`  ✓ ${tool}: source valid.`);
    } catch (err) {
      console.error(`  ✗ ${tool}: ${err.message}`);
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} error(s) found.`);
    process.exit(1);
  } else {
    console.log(`\nAll valid.`);
  }
}