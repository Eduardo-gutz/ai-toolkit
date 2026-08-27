// bin/commands/list.mjs
import { readState, getInstalled } from '../../adapters/_shared/state.mjs';

export async function listCommand({ flags, config, projectDir }) {
  const state = readState(projectDir);
  const tools = flags.tools ? flags.tools.split(',') : Object.keys(state.tools || {});

  if (tools.length === 0) {
    console.log('No resources installed yet. Run `ai-toolkit init` first.');
    return;
  }

  console.log(`Installed resources in ${projectDir}:`);
  for (const tool of tools) {
    const installed = state.tools?.[tool];
    if (!installed) {
      console.log(`\n  [${tool}] (not installed)`);
      continue;
    }

    console.log(`\n  [${tool}]`);
    for (const [type, names] of Object.entries(installed)) {
      const list = Object.keys(names);
      if (list.length === 0) continue;
      console.log(`    ${type}: ${list.join(', ')}`);
    }
  }
}