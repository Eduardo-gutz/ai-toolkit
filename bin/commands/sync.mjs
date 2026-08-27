// bin/commands/sync.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function syncCommand({ flags, config, configPath, projectDir, toolkitRoot }) {
  if (!config) {
    throw new Error(`Config not found at ${configPath}. Run \`ai-toolkit init\` first.`);
  }

  const defaultTools = config.default_tools || ['opencode', 'claude-code'];
  const tools = flags.tools ? flags.tools.split(',') : defaultTools;

  console.log(`Syncing ai-toolkit in ${projectDir}...`);

  for (const tool of tools) {
    if (!config.tools[tool]) continue;
    const adapterPath = resolve(toolkitRoot, `adapters/${tool}/adapter.mjs`);
    if (!existsSync(adapterPath)) {
      console.warn(`Adapter not found for ${tool}. Skipping.`);
      continue;
    }
    const adapter = await import(adapterPath);
    await adapter.sync({
      source: resolve(toolkitRoot, config.source || './source'),
      target: projectDir,
      config,
    });
    console.log(`  ✓ ${tool} synced.`);
  }

  console.log(`\nDone.`);
}