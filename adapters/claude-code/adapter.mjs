import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { listAgents } from '../_shared/agents-walker.mjs';
import { listSkills, readSkill, listSkillFiles } from '../_shared/skills-walker.mjs';
import { listMcps, readMcp } from '../_shared/canonical-mcp.mjs';
import { canonicalToClaudeCode } from '../_shared/mcp-transform.mjs';
import { listRules, renderRules, renderClaudeMdImport } from '../_shared/rules-renderer.mjs';
import { installResource } from '../_shared/install.mjs';
import {
  readState,
  writeState,
  recordInstalled,
  recordSync,
  recordRemoved,
} from '../_shared/state.mjs';

/**
 * Claude Code adapter.
 * Targets (relative to project root):
 *   - agents  → .claude/agents/<name>.md (name REQUIRED in frontmatter)
 *   - skills  → .claude/skills/<name>/
 *   - MCPs    → .mcp.json (under "mcpServers" key, merged)
 *   - rules   → AGENTS.md + CLAUDE.md (CLAUDE.md imports via reference)
 *
 * Per WHY.md §4.2: AGENTS.md is the rules body, CLAUDE.md imports it.
 */

const CLAUDE_AGENTS_DIR = '.claude/agents';
const CLAUDE_SKILLS_DIR = '.claude/skills';
const CLAUDE_MCP_FILE = '.mcp.json';
const AGENTS_MD = 'AGENTS.md';
const CLAUDE_MD = 'CLAUDE.md';

/**
 * Install resources from source to target project for Claude Code.
 * @param {{source: string, target: string, config: object, types: string[]}} args
 *   types: subset of ['agents', 'skills', 'mcps', 'rules', 'commands'].
 *          Empty/missing = install all four supported types.
 *          'commands' is silently ignored here (no walker yet).
 */
export async function install({ source, target, config, types }) {
  const state = readState(target);
  const want = (t) => !types || types.includes(t);

  if (want('agents')) await installAgents(source, target, state);
  if (want('skills')) await installSkills(source, target, state);
  if (want('mcps'))   await installMcps(source, target, state, config);
  if (want('rules'))  await installRules(source, target, state);
  // types.includes('commands') → no-op (deferred)

  writeState(target, state);
}

/**
 * Sync = reinstall resources (idempotent). When `types` is provided,
 * only those types are reinstalled; otherwise all supported types.
 * @param {{source: string, target: string, config: object, types?: string[]}} args
 */
export async function sync({ source, target, config, types }) {
  await install({ source, target, config, types });
  const state = readState(target);
  recordSync(state, 'claude-code');
  writeState(target, state);
}

/**
 * Remove resources installed by ai-toolkit from the target project.
 * When `types` is provided, only resources of those types are removed.
 * @param {{target: string, config: object, types?: string[]}} args
 */
export async function remove({ target, config, types }) {
  const state = readState(target);

  for (const [type, names] of Object.entries(state.tools?.['claude-code'] || {})) {
    if (types && !types.includes(type)) continue;
    for (const name of Object.keys(names)) {
      await removeResource(target, type, name);
      recordRemoved(state, 'claude-code', type, name);
    }
  }

  writeState(target, state);
}

/**
 * Validate canonical source against claude-code adapter requirements.
 * @param {{source: string, config: object}} args
 */
export async function validate({ source, config }) {
  // Smoke test: ensure no broken resources.
  listAgents(source);
  listSkills(source);
  listMcps(source);
  listRules(source);
  return { ok: true };
}

// ─── Internal helpers ─────────────────────────────────────────────────

async function installAgents(source, target, state) {
  const agents = listAgents(source);
  const agentsDir = join(target, CLAUDE_AGENTS_DIR);
  await mkdir(agentsDir, { recursive: true });

  for (const agent of agents) {
    // Claude Code REQUIRES `name` in agent frontmatter (claude-code/README.md).
    // Our canonical schema already includes it; verify defensively.
    if (!agent.frontmatter.name) {
      agent.frontmatter.name = agent.name;
    }

    const dst = join(target, CLAUDE_AGENTS_DIR, `${agent.name}.md`);
    const rendered = renderAgent(agent);
    await writeFile(dst, rendered);
    recordInstalled(state, 'claude-code', 'agents', agent.name);
  }
}

/**
 * Re-serialize an agent file with its frontmatter.
 * Required because Claude Code mandates `name` in frontmatter; we need to
 * normalize the file content.
 */
function renderAgent(agent) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(agent.frontmatter)) {
    lines.push(`${key}: ${formatYamlValue(value)}`);
  }
  lines.push('---', '');
  lines.push(agent.body);
  return lines.join('\n');
}

function formatYamlValue(value) {
  if (typeof value === 'string') {
    // Quote strings with special chars
    if (/[:#\n"']/.test(value)) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

async function installSkills(source, target, state) {
  const skills = listSkills(source);
  const skillsBase = join(target, CLAUDE_SKILLS_DIR);

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

    recordInstalled(state, 'claude-code', 'skills', skill.name);
  }
}

async function installMcps(source, target, state, config) {
  const mcps = listMcps(source);
  if (mcps.length === 0) return;

  const configPath = join(target, CLAUDE_MCP_FILE);
  let existing = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(await readFile(configPath, 'utf8'));
    } catch {
      existing = {};
    }
  }

  const mcpSection = existing.mcpServers || {};
  for (const mcp of mcps) {
    mcpSection[mcp.name] = canonicalToClaudeCode(mcp.definition);
    recordInstalled(state, 'claude-code', 'mcps', mcp.name);
  }

  existing.mcpServers = mcpSection;
  await writeFile(configPath, JSON.stringify(existing, null, 2) + '\n');
}

async function installRules(source, target, state) {
  const rules = listRules(source);

  // Always write AGENTS.md (Claude Code may reference it via @AGENTS.md).
  if (rules.length > 0) {
    const agentsBody = renderRules(rules, {
      intro: `These rules are applied to **${state.installed_at || 'this project'}** by ai-toolkit. Source: \`source/rules/\`. Edit rules in the source repo, not here.`,
    });
    await writeFile(join(target, AGENTS_MD), agentsBody);

    for (const rule of rules) {
      recordInstalled(state, 'claude-code', 'rules', rule.name);
    }
  } else {
    // Even with no rules, ensure AGENTS.md exists for CLAUDE.md to reference.
    const agentsPath = join(target, AGENTS_MD);
    if (!existsSync(agentsPath)) {
      await writeFile(agentsPath, `# Project Rules\n\nNo rules defined yet.\n`);
    }
  }

  // Always write CLAUDE.md (Claude Code requires it; references AGENTS.md).
  await writeFile(join(target, CLAUDE_MD), renderClaudeMdImport());
}

async function removeResource(target, type, name) {
  switch (type) {
    case 'agents': {
      const dst = join(target, CLAUDE_AGENTS_DIR, `${name}.md`);
      await rm(dst, { force: true });
      break;
    }
    case 'skills': {
      const dst = join(target, CLAUDE_SKILLS_DIR, name);
      await rm(dst, { recursive: true, force: true });
      break;
    }
    case 'mcps': {
      const configPath = join(target, CLAUDE_MCP_FILE);
      if (existsSync(configPath)) {
        const cfg = JSON.parse(await readFile(configPath, 'utf8'));
        if (cfg.mcpServers?.[name]) {
          delete cfg.mcpServers[name];
          await writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n');
        }
      }
      break;
    }
    case 'rules': {
      // Rules are concatenated — don't delete individual files.
      // Re-render would be the proper fix (sync with filtered rules list).
      break;
    }
  }
}