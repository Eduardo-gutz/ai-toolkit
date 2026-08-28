// bin/commands/init.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { select } from '@inquirer/prompts';
import { readState, writeState } from '../../adapters/_shared/state.mjs';

export async function initCommand({ flags, config, configPath, projectDir, toolkitRoot }) {
  if (!config) {
    throw new Error(`Config not found at ${configPath}. Run \`ai-toolkit init\` from a project with ai-toolkit.config.json.`);
  }

  console.log(`Initializing ai-toolkit in ${projectDir}...`);

  // Auto-create project directory if missing.
  // --yes OR non-TTY: create without asking. Otherwise: prompt.
  if (!existsSync(projectDir)) {
    if (flags.yes || !process.stdin.isTTY) {
      mkdirSync(projectDir, { recursive: true });
      console.log(`  → Created ${projectDir}`);
    } else {
      const { confirm } = await import('@inquirer/prompts');
      const ok = await confirm({
        message: `Directory ${projectDir} does not exist. Create it?`,
        default: true,
      });
      if (!ok) {
        throw new Error(`Aborted. Create the directory manually or re-run with --yes.`);
      }
      mkdirSync(projectDir, { recursive: true });
    }
  }

  const defaultTools = config.default_tools || ['opencode', 'claude-code'];

  // Determine tools. Priority: --tools (explicit) > --yes/non-TTY (defaults) > prompt.
  let tools;
  if (flags.tools) {
    // Explicit user choice — always honored, even with --yes.
    tools = flags.tools.split(',');
  } else if (flags.yes || !process.stdin.isTTY) {
    // Non-interactive: use defaults from config.
    tools = defaultTools;
  } else {
    // Interactive: prompt the user.
    tools = await select({
      message: 'Which tools do you want to install for?',
      choices: defaultTools.map((t) => ({ name: t, value: t })),
    });
  }

  const profileName = flags.profile || config.default_profile || 'minimal';
  const profile = config.profiles?.[profileName];
  if (!profile) {
    throw new Error(`Profile "${profileName}" not found in config.`);
  }

  for (const tool of tools) {
    if (!config.tools[tool]) {
      console.warn(`Tool "${tool}" not configured. Skipping.`);
      continue;
    }

    console.log(`Installing for ${tool}...`);
    const adapterPath = resolve(toolkitRoot, `adapters/${tool}/adapter.mjs`);
    if (!existsSync(adapterPath)) {
      console.warn(`Adapter not at ${adapterPath}. Skipping ${tool}.`);
      continue;
    }

    const adapter = await import(adapterPath);
    await adapter.install({
      source: resolve(toolkitRoot, config.source || './source'),
      target: projectDir,
      config,
    });
    console.log(`  ✓ ${tool} installed.`);
  }

  // Note: when installing for both opencode and claude-code, skills go to
  // BOTH .opencode/skills/ and .claude/skills/ (one for each tool's native
  // path). When installing only for opencode, only .opencode/skills/ is
  // created. claude-code-only install puts them in .claude/skills/.
  // Each tool reads from its own folder.

  // Write state metadata LAST. If any adapter above failed (or the user
  // SIGINT'd), state stays as it was before this run — no half-truth about
  // installed_at or profile. Adapters have already written their per-tool
  // entries during install(); this only adds global metadata.
  const state = readState(projectDir);
  state.installed_at = new Date().toISOString();
  state.profile = profileName;
  writeState(projectDir, state);

  console.log(`\nDone. State file: ${resolve(projectDir, '.ai-toolkit.json')}`);
}