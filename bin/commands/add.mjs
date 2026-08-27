// bin/commands/add.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { listAgents } from '../../adapters/_shared/agents-walker.mjs';
import { listSkills } from '../../adapters/_shared/skills-walker.mjs';
import { listMcps } from '../../adapters/_shared/canonical-mcp.mjs';
import { listRules } from '../../adapters/_shared/rules-renderer.mjs';

export async function addCommand({ flags, config, args = [], projectDir, toolkitRoot }) {
  if (!config) throw new Error(`Config not found. Run \`ai-toolkit init\` first.`);

  const [type, name] = args;
  if (!type || !name) {
    throw new Error('Usage: ai-toolkit add <type> <name>\n  type: agents | skills | mcps | rules');
  }

  // Verify the resource exists in source
  const sourceDir = resolve(toolkitRoot, config.source || './source');
  let exists = false;
  switch (type) {
    case 'agents':
      exists = listAgents(sourceDir).some((a) => a.name === name);
      break;
    case 'skills':
      exists = listSkills(sourceDir).some((s) => s.name === name);
      break;
    case 'mcps':
      exists = listMcps(sourceDir).some((m) => m.name === name);
      break;
    case 'rules':
      exists = listRules(sourceDir).some((r) => r.name === `${name}.md`);
      break;
    default:
      throw new Error(`Unknown type: ${type}`);
  }

  if (!exists) {
    throw new Error(`Resource "${type}:${name}" not found in source.`);
  }

  // Sync all configured tools to pick up the addition
  const tools = flags.tools ? flags.tools.split(',') : Object.keys(config.tools || {});
  for (const tool of tools) {
    const adapterPath = resolve(toolkitRoot, `adapters/${tool}/adapter.mjs`);
    if (!existsSync(adapterPath)) continue;
    const adapter = await import(adapterPath);
    await adapter.sync({ source: sourceDir, target: projectDir, config });
  }

  console.log(`Added ${type}:${name} to ${tools.length} tool(s).`);
}