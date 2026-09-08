import { mkdir, writeFile, readFile, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { listAgents } from '../_shared/agents-walker.mjs';
import { listSkills, listSkillFiles } from '../_shared/skills-walker.mjs';
import { listMcps } from '../_shared/canonical-mcp.mjs';
import { canonicalToOpencode } from '../_shared/mcp-transform.mjs';
import { listRules, renderRules } from '../_shared/rules-renderer.mjs';
import { installResource } from '../_shared/install.mjs';
import { removeIfEmpty, removeJsonKeys } from '../_shared/cleanup-if-empty.mjs';
import { assertSafeName } from '../_shared/safe-name.mjs';
import { makeResourcePaths, makeCleanupDirs } from '../_shared/tool-paths.mjs';
import {
  readState,
  writeState,
  recordInstalled,
  recordSync,
  recordRemoved,
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
const OPENCODE_ROOT = '.opencode';
const AGENTS_MD = 'AGENTS.md';

/**
 * Filesystem markers used by `sync`'s auto-detect fallback. If any of these
 * paths exist in the project directory, the tool is considered physically
 * installed. Read by sync.mjs via the loaded adapter module. Defining
 * markers HERE (not in the command) keeps the OCP contract: adding a new
 * tool only requires creating its adapter with its own `fsMarkers` —
 * sync.mjs does not need to change.
 */
export const fsMarkers = [OPENCODE_AGENTS_DIR, OPENCODE_SKILLS_DIR, OPENCODE_CONFIG];

/**
 * Install resources from source to target project for opencode.
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
  recordSync(state, 'opencode');
  writeState(target, state);
}

/**
 * Remove resources installed by ai-toolkit from the target project.
 * When `types` is provided, only resources of those types are removed.
 * @param {{target: string, config: object, types?: string[]}} args
 */
export async function remove({ target, config, types }) {
  const state = readState(target);

  for (const [type, names] of Object.entries(state.tools?.opencode || {})) {
    if (types && !types.includes(type)) continue;
    for (const name of Object.keys(names)) {
      await removeResource(target, type, name);
      recordRemoved(state, 'opencode', type, name);
    }
  }

  writeState(target, state);

  await postRemoveCleanup(target);
}

/**
 * Best-effort cleanup of the structure install() created.
 * Each step is a no-op if the path doesn't exist or isn't empty.
 */
async function postRemoveCleanup(target) {
  await removeIfEmpty(`${target}/.opencode/agents`);
  await removeIfEmpty(`${target}/.opencode/skills`);
  await removeIfEmpty(`${target}/.opencode`);

  const agentsMd = `${target}/AGENTS.md`;
  if (existsSync(agentsMd)) {
    await unlink(agentsMd);
  }

  await removeJsonKeys(`${target}/opencode.json`, 'mcp');
}

/** Smoke test: ensure no broken resources. */
export async function validate({ source, config }) {
  listAgents(source);
  listSkills(source);
  listMcps(source);
  listRules(source);
  return { ok: true };
}

// Thin wrapper over makeResourcePaths — see adapters/_shared/tool-paths.mjs.
export const resourcePaths = makeResourcePaths({
  agentsDir: OPENCODE_AGENTS_DIR,
  skillsDir: OPENCODE_SKILLS_DIR,
  assertSafeName,
});

// Thin wrapper over makeCleanupDirs — see adapters/_shared/tool-paths.mjs.
export const cleanupDirs = makeCleanupDirs({ rootDir: OPENCODE_ROOT });

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