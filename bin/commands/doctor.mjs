// bin/commands/doctor.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readState } from '../../adapters/_shared/state.mjs';

export async function doctorCommand({ flags, config, configPath, projectDir, toolkitRoot }) {
  console.log(`ai-toolkit doctor — ${projectDir}\n`);

  let issues = 0;

  if (config) {
    console.log(`  ✓ Config at ${resolve(configPath)}`);
  } else {
    console.error(`  ✗ Config not found at ${resolve(configPath)}. Run \`ai-toolkit init\`.`);
    issues++;
  }

  if (existsSync(resolve(projectDir, '.ai-toolkit.json'))) {
    console.log(`  ✓ State file present.`);
    try {
      const state = readState(projectDir);
      console.log(`    Last sync: ${state.last_sync_at || '(never)'}`);
    } catch (err) {
      console.error(`  ✗ State file corrupted: ${err.message}`);
      issues++;
    }
  } else {
    console.warn(`  ⚠ State file not found. Run \`ai-toolkit init\`.`);
  }

  for (const tool of ['opencode', 'claude-code']) {
    const path = resolve(toolkitRoot, `adapters/${tool}/adapter.mjs`);
    if (existsSync(path)) {
      console.log(`  ✓ ${tool} adapter available.`);
    } else {
      console.error(`  ✗ ${tool} adapter missing at ${path}.`);
      issues++;
    }
  }

  const sourceDir = resolve(toolkitRoot, config?.source || './source');
  if (existsSync(resolve(sourceDir))) {
    console.log(`  ✓ Source at ${resolve(sourceDir)}`);
  } else {
    console.error(`  ✗ Source missing at ${resolve(sourceDir)}.`);
    issues++;
  }

  console.log(`\n${issues === 0 ? 'No issues found.' : `${issues} issue(s) found.`}`);
}