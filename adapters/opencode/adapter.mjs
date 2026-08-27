import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { listAgents } from '../_shared/agents-walker.mjs';
import { listSkills, readSkill, listSkillFiles } from '../_shared/skills-walker.mjs';
import { listMcps, readMcp } from '../_shared/canonical-mcp.mjs';
import { canonicalToOpencode } from '../_shared/mcp-transform.mjs';
import { listRules, renderRules } from '../_shared/rules-renderer.mjs';
import { installResource } from '../_shared/install.mjs';
import {
  readState,
  writeState,
  recordInstalled,
  recordSync,
  recordRemoved,
  getInstalled,
} from '../_shared/state.mjs';

/**
 * opencode adapter.
 * Targets (relative to project root):
 *   - agents  → .opencode/agents/<name>.md
 *   - skills  → .opencode/skills/<name>/ (opencode native path)
 *   - MCPs    → opencode.json (under "mcp" key, merged)
 *   - rules   → AGENTS.md (concatenated)
 *
 * Per design: skills go to .opencode/skills/ (opencode native path). When opencode and claude-code are both installed, both tools' skills live in their own respective folders.
 * Per install.mjs: files are COPIED (not symlinked) for stability across npx cache cleans.
 * Trade-off: source changes require `sync` to propagate.
 */

const OPENCODE_AGENTS_DIR = '.opencode/agents';
const OPENCODE_SKILLS_DIR = '.opencode/skills';
const OPENCODE_CONFIG = 'opencode.json';
const AGENTS_MD = 'AGENTS.md';

/**
 * Install all resources from source to target project for opencode.
 * @param {{source: string, target: string, config: object}} args
 */
export async function install({ source, target, config }) {
  const state = readState(target);
  state.installed_at = new Date().toISOString();

  await installAgents(source, target, state);
  await installSkills(source, target, state);
  await installMcps(source, target, state, config);
  await installRules(source, target, state);

  writeState(target, state);
}

/**
 * Sync = reinstall all resources (idempotent).
 * @param {{source: string, target: string, config: object}} args
 */
export async function sync({ source, target, config }) {
  await install({ source, target, config });
  const state = readState(target);
  recordSync(state, 'opencode');
  writeState(target, state);
}

/**
 * Remove all resources installed by ai-toolkit from the target project.
 * @param {{target: string, config: object}} args
 */
export async function remove({ target, config }) {
  const state = readState(target);

  for (const [type, names] of Object.entries(state.tools?.opencode || {})) {
    for (const name of Object.keys(names)) {
      await removeResource(target, type, name);
      recordRemoved(state, 'opencode', type, name);
    }
  }

  writeState(target, state);
}

/**
 * Validate canonical source against opencode adapter requirements.
 * @param {{source: string, config: object}} args
 */
export async function validate({ source, config }) {
  // Loaders already validate per-resource (throw on error).
  // This is a smoke test to ensure no broken resources.
  listAgents(source);
  listSkills(source);
  listMcps(source);
  listRules(source);
  return { ok: true };
}

// ─── Internal helpers ─────────────────────────────────────────────────

async function installAgents(source, target, state) {
  const agents = listAgents(source);
  const agentsDir = join(target, OPENCODE_AGENTS_DIR);
  await mkdir(agentsDir, { recursive: true });

  for (const agent of agents) {
    const dst = join(target, OPENCODE_AGENTS_DIR, `${agent.name}.md`);
    await installResource(agent.file, dst);
    recordInstalled(state, 'opencode', 'agents', agent.name);
  }
}

async function installSkills(source, target, state) {
  const skills = listSkills(source);
  const skillsBase = join(target, OPENCODE_SKILLS_DIR);

  for (const skill of skills) {
    const dstDir = join(skillsBase, skill.name);
    await mkdir(dstDir, { recursive: true });

    const dstMd = join(dstDir, 'SKILL.md');
    await installResource(join(skill.dir, 'SKILL.md'), dstMd);

    for (const file of listSkillFiles(skill.dir)) {
      const dstFile = join(dstDir, file.relative);
      await mkdir(dirname(dstFile), { recursive: true });
      await installResource(file.absolute, dstFile);
    }

    recordInstalled(state, 'opencode', 'skills', skill.name);
  }
}

async function installMcps(source, target, state, config) {
  const mcps = listMcps(source);
  if (mcps.length === 0) return;

  const configPath = join(target, OPENCODE_CONFIG);
  let existing = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(await readFile(configPath, 'utf8'));
    } catch {
      existing = {};
    }
  }

  const mcpSection = existing.mcp || {};
  for (const mcp of mcps) {
    mcpSection[mcp.name] = canonicalToOpencode(mcp.definition);
    recordInstalled(state, 'opencode', 'mcps', mcp.name);
  }

  existing.mcp = mcpSection;
  await writeFile(configPath, JSON.stringify(existing, null, 2) + '\n');
}

async function installRules(source, target, state) {
  const rules = listRules(source);
  const dst = join(target, AGENTS_MD);

  if (rules.length > 0) {
    const body = renderRules(rules, {
      intro: `These rules are applied to **${state.installed_at || 'this project'}** by ai-toolkit. Source: \`source/rules/\`. Edit rules in the source repo, not here.`,
    });
    await writeFile(dst, body);
    for (const rule of rules) {
      recordInstalled(state, 'opencode', 'rules', rule.name);
    }
  } else {
    // No rules: ensure AGENTS.md exists so opencode has a file to read.
    // (Parity with claude-code adapter; both always write AGENTS.md.)
    if (!existsSync(dst)) {
      await writeFile(dst, `# Project Rules\n\nNo rules defined yet. Run \`ai-toolkit sync\` after adding rules to source/rules/.\n`);
    }
  }
}

async function removeResource(target, type, name) {
  switch (type) {
    case 'agents': {
      const dst = join(target, OPENCODE_AGENTS_DIR, `${name}.md`);
      await rm(dst, { force: true });
      break;
    }
    case 'skills': {
      const dst = join(target, OPENCODE_SKILLS_DIR, name);
      await rm(dst, { recursive: true, force: true });
      break;
    }
    case 'mcps': {
      const configPath = join(target, OPENCODE_CONFIG);
      if (existsSync(configPath)) {
        const cfg = JSON.parse(await readFile(configPath, 'utf8'));
        if (cfg.mcp?.[name]) {
          delete cfg.mcp[name];
          await writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n');
        }
      }
      break;
    }
    case 'rules': {
      // Rules are concatenated — don't delete individual files.
      // Instead, re-render without the deleted rule.
      break;
    }
  }
}