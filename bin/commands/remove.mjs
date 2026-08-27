// bin/commands/remove.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readState,
  writeState,
  recordRemoved,
} from '../../adapters/_shared/state.mjs';

export async function removeCommand({ flags, config, args = [], projectDir, toolkitRoot }) {
  if (!config) throw new Error(`Config not found. Run \`ai-toolkit init\` first.`);

  const [type, name] = args;
  if (!type || !name) {
    throw new Error('Usage: ai-toolkit remove <type> <name>\n  type: agents | skills | mcps | rules');
  }

  const tools = flags.tools ? flags.tools.split(',') : Object.keys(config.tools || {});
  let removed = false;

  for (const tool of tools) {
    const adapterPath = resolve(toolkitRoot, `adapters/${tool}/adapter.mjs`);
    if (!existsSync(adapterPath)) continue;

    // Use the adapter's remove function for the specific resource
    const adapter = await import(adapterPath);
    const { rm } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const paths = toolPaths(tool, type, name, projectDir);
    for (const p of paths) {
      try {
        await rm(p, { recursive: true, force: true });
        removed = true;
      } catch {}
    }

    // Update state
    const state = readState(projectDir);
    recordRemoved(state, tool, type, name);
    writeState(projectDir, state);
  }

  if (removed) {
    console.log(`Removed ${type}:${name} from ${tools.length} tool(s).`);
  } else {
    console.warn(`${type}:${name} was not installed.`);
  }
}

function toolPaths(tool, type, name, projectDir) {
  if (tool === 'opencode') {
    if (type === 'agents') return [`${projectDir}/.opencode/agents/${name}.md`];
    if (type === 'skills') return [`${projectDir}/.claude/skills/${name}`];
    return [];
  }
  if (tool === 'claude-code') {
    if (type === 'agents') return [`${projectDir}/.claude/agents/${name}.md`];
    if (type === 'skills') return [`${projectDir}/.claude/skills/${name}`];
    return [];
  }
  return [];
}