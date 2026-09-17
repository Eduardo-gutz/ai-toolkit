import { mkdir, writeFile, readFile, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { listAgents } from '../_shared/agents-walker.mjs';
import { listSkills, listSkillFiles } from '../_shared/skills-walker.mjs';
import { listMcps } from '../_shared/canonical-mcp.mjs';
import { canonicalToOpencode } from '../_shared/mcp-transform.mjs';
import { listRules, renderRules } from '../_shared/rules-renderer.mjs';
import { installResource } from '../_shared/install.mjs';
import { removeIfEmpty, removeJsonKeys, readJsonConfig } from '../_shared/cleanup-if-empty.mjs';
import { assertSafeName } from '../_shared/safe-name.mjs';
import { makeResourcePaths, makeCleanupDirs } from '../_shared/tool-paths.mjs';
import {
  readBootstrapSource,
  adaptConductorPaths,
  BOOTSTRAP_SUPPORTING_FILES,
} from '../_shared/bootstrap-renderer.mjs';
import {
  readState,
  writeState,
  recordInstalled,
  recordSync,
  recordRemoved,
  recordRulesOwnership,
  releaseRulesOwnership,
  pruneEmpty,
} from '../_shared/state.mjs';
import { createLifecycle } from '../_shared/lifecycle-registry.mjs';

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
const OPENCODE_MCP_KEY = 'mcp';
const OPENCODE_SKILL_FILE = 'SKILL.md';
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
 *          Empty/missing = install all five advertised types.
 *          'commands' is accepted for forward-compat but is a no-op
 *          (walker deferred per WHY.md §8 Fase 3).
 * @returns {Promise<object>} the state object (post-write). Callers that
 *   ignored the previous return value remain compatible.
 */
export async function install({ source, target, config, types }) {
  const state = readState(target);
  const want = (t) => !types || types.includes(t);

  if (want('agents')) await installAgents(source, target, state);
  if (want('skills')) await installSkills(source, target, state);
  if (want('mcps'))   await installMcps(source, target, state, config);
  if (want('rules'))  await installRules(source, target, state);

  // Run lifecycle extras (e.g., bootstrap, future lint rules).
  for (const hook of lifecycle.install) {
    try {
      await hook({ source, target });
    } catch (err) {
      console.warn(`[opencode] lifecycle hook failed: ${err.message}. Continuing.`);
    }
  }

  writeState(target, state);
  return state;
}

/**
 * Sync = reinstall resources (idempotent). When `types` is provided,
 * only those types are reinstalled; otherwise all supported types.
 *
 * Sync always rewrites all resources. There is no mtime/etag check; this
 * is intentional for parity with `install --force`. If you need to preserve
 * manual edits in the target, do not run `sync` after manual changes.
 *
 * @param {{source: string, target: string, config: object, types?: string[]}} args
 */
export async function sync({ source, target, config, types }) {
  const state = await install({ source, target, config, types });
  // Bootstrap may have been skipped by install() (idempotent default).
  // Force re-install so source modifications to source/prompts/bootstrap/
  // propagate to the target. This is the sync propagation fix: previously
  // sync no-op'd against existing bootstrap dirs, so changes never
  // reached the target. Other 4 content types (agents/skills/mcps/rules)
  // already overwrite on sync; bootstrap now joins them.
  // IMPORTANT: this MUST run BEFORE the lifecycle.sync loop below so the
  // wipe + recreate completes before any other sync-only hook fires.
  if (typeof installBootstrap === 'function') {
    try {
      await installBootstrap({ source, target }, { force: true });
    } catch (err) {
      console.warn(`[opencode] bootstrap reinstall failed: ${err.message}. Continuing.`);
    }
  }
  recordSync(state, 'opencode');
  // Iterate lifecycle.sync extras — registry-wide contract: every public
  // lifecycle method (install/sync/remove) walks its corresponding array.
  // lifecycle.sync is reserved for extras that fire only on sync, not on a
  // fresh install. installBootstrap is NOT pushed here: the direct call
  // above (with force=true) handles the wipe + recreate. Pushing it here
  // too would trigger a third invocation with force=false, producing a
  // spurious "already exists" log in the idempotent path.
  for (const hook of lifecycle.sync) {
    try {
      await hook({ source, target });
    } catch (err) {
      console.warn(`[opencode] lifecycle hook failed: ${err.message}. Continuing.`);
    }
  }
  writeState(target, state);
}

/**
 * Remove resources installed by ai-toolkit from the target project.
 * When `types` is provided, only resources of those types are removed.
 *
 * `source` is optional but REQUIRED when removing rules — without it the
 * adapter can't re-render AGENTS.md to reflect the remaining rules.
 *
 * @param {{target: string, source?: string, config: object, types?: string[]}} args
 */
export async function remove({ target, source, config, types }) {
  let state;
  try {
    state = readState(target);
  } catch (err) {
    // State file exists but is unreadable — refuse to remove, since we
    // can't tell which resources this tool actually owns.
    console.warn(`[opencode] state unreadable: ${err.message}. Skipping remove.`);
    return;
  }

  // Snapshot: did this adapter have mcps BEFORE remove? (state-based, NOT
  // filtered by --types). postRemoveCleanup uses hadMcps to decide whether
  // the `mcp` key in opencode.json should be cleaned up. Filtering by the
  // types argument here would cause the `mcp` key to be deleted on a
  // --types=[agents,skills] remove even though mcps are still in state.
  // willRemoveRules/willRemoveMcps (filtered by --types) gate the
  // releaseRulesOwnership call and AGENTS.md re-render logic, but are NOT
  // used for filesystem deletion decisions.
  const hadMcps = !!state.tools?.opencode?.mcps;
  const willRemoveRules = !types || types.includes('rules');
  const willRemoveMcps = !types || types.includes('mcps');

  // Track whether this run re-rendered AGENTS.md — if so, postRemoveCleanup
  // must NOT delete it (the tool just wrote content there).
  let agentsMdRerendered = false;

  for (const [type, names] of Object.entries(state.tools?.opencode || {})) {
    if (types && !types.includes(type)) continue;
    for (const name of Object.keys(names)) {
      if (type === 'rules') {
        // Rules are concatenated — re-render AGENTS.md without the deleted rule.
        // If write fails, do NOT recordRemoved (state stays consistent with disk).
        if (!source) {
          console.warn(
            `[opencode] cannot re-render AGENTS.md without source. ` +
            `State will diverge from filesystem until next \`ai-toolkit sync\`.`
          );
          recordRemoved(state, 'opencode', type, name);
          continue;
        }
        const remainingSourceRules = listRules(source).filter((r) => r.name !== name);
        if (remainingSourceRules.length === 0) {
          // No rules left in source — let postRemoveCleanup decide whether to
          // delete AGENTS.md (based on ownership). Don't re-render a stub:
          // if this adapter is the last owner, the file gets deleted; if not,
          // another adapter's rules remain and AGENTS.md should reflect them.
          recordRemoved(state, 'opencode', type, name);
          continue;
        }
        const agentsBody = renderRules(remainingSourceRules, {
          intro: `These rules are applied to **${state.installed_at || 'this project'}** by ai-toolkit. Source: \`source/rules/\`. Edit rules in the source repo, not here.`,
        });
        try {
          await writeFile(join(target, AGENTS_MD), agentsBody);
          agentsMdRerendered = true;
          recordRemoved(state, 'opencode', type, name);
        } catch (err) {
          console.warn(
            `[opencode] failed to re-render AGENTS.md while removing rule '${name}': ${err.message}. ` +
            `Skipping recordRemoved to keep state consistent with disk.`
          );
        }
      } else {
        await removeResource(target, type, name);
        recordRemoved(state, 'opencode', type, name);
      }
    }
  }

  // Release AGENTS.md ownership — only the LAST owner will delete the file.
  // Skipped when --types excludes rules: releasing ownership for a type that
  // wasn't removed would falsely empty agents_md_owners and let
  // postRemoveCleanup delete AGENTS.md on a non-rules remove.
  if (willRemoveRules) {
    releaseRulesOwnership(state, 'opencode');
  }

  // Drop empty parent keys so postRemoveCleanup's ownership check sees a
  // clean state. Without this, the legacy fallback sees this tool as "still
  // registered" even when its own entries are gone.
  pruneEmpty(state);

  writeState(target, state);

  // Run lifecycle extras (e.g., bootstrap uninstall, future lint rules)
  // BEFORE postRemoveCleanup. If the bootstrap artifacts were the only
  // occupants of `.opencode/commands/` (file) and
  // `.opencode/commands/bootstrap/` (subdir), the previous order
  // (postRemoveCleanup first, then uninstallBootstrap) left
  // `.opencode/commands/` and `.opencode/` as orphan empty dirs after
  // the bootstrap artifacts were finally removed — postRemoveCleanup saw
  // the non-empty dirs and skipped. Iterating lifecycle.remove first
  // guarantees postRemoveCleanup finds the parent dirs empty and removes
  // them. (This is the M1 fix; the lifecycle registry preserves the order
  // but generalizes the mechanism so future extras get the same
  // treatment.)
  for (const hook of lifecycle.remove) {
    try {
      await hook({ target });
    } catch (err) {
      console.warn(`[opencode] lifecycle hook failed: ${err.message}. Continuing.`);
    }
  }

  await postRemoveCleanup(target, state, 'opencode', {
    hadMcps,
    agentsMdRerendered,
  });
}

/**
 * Best-effort cleanup of the structure install() created.
 * Each step is a no-op if the path doesn't exist or isn't empty.
 * Respects state.agents_md_owners to avoid deleting AGENTS.md that another
 * adapter still depends on.
 *
 * @param {string} target
 * @param {object} state - current state (after recordRemoved loop)
 * @param {string} toolName
 * @param {object} [options]
 * @param {boolean} [options.hadMcps] - did this adapter have mcps before
 *   remove? (state-based, NOT filtered by --types) Used together with the
 *   current state (post-loop) to decide if the `mcp` key in opencode.json
 *   should be cleaned up — never touches files the user may have created.
 * @param {boolean} [options.agentsMdRerendered] - did this run re-render
 *   AGENTS.md while removing rules? If yes, AGENTS.md was just written by
 *   this tool — keep it (don't delete).
 */
async function postRemoveCleanup(target, state, toolName, options = {}) {
  // .opencode/commands is the immediate parent of the bootstrap artifacts
  // (`bootstrap.md` + `bootstrap/` subdir). After uninstallBootstrap deletes
  // both, .opencode/commands/ is empty but still EXISTS — so without this
  // explicit cleanup, the .opencode/ removeIfEmpty below sees a non-empty
  // parent (it has `commands/` as a subdir) and skips, leaving
  // .opencode/commands/ + .opencode/ as orphan dirs after `remove --purge`.
  // claude-code's bootstrap lives one level deeper (under .claude/skills/),
  // so its postRemoveCleanup catches the orphan naturally.
  // No-op when .opencode/commands/ is non-empty (user-added commands) or
  // already absent (bootstrap never installed).
  await removeIfEmpty(`${target}/.opencode/commands`);
  await removeIfEmpty(`${target}/.opencode/agents`);
  await removeIfEmpty(`${target}/.opencode/skills`);
  await removeIfEmpty(`${target}/.opencode`);

  // Decide whether to delete AGENTS.md based on ownership.
  //   - Legacy state (no agents_md_owners): only delete if no other tool is
  //     registered in state.tools (conservative — we can't track ownership
  //     accurately in legacy mode).
  //   - New state: only delete if no owner remains after releaseRulesOwnership.
  //   - Skip deletion entirely if we just re-rendered AGENTS.md in this run.
  const shouldDeleteAgentsMd = !options.agentsMdRerendered && (
    state.agents_md_owners === undefined
      ? Object.keys(state.tools || {}).filter((t) => t !== toolName).length === 0
      : state.agents_md_owners.length === 0
  );

  if (shouldDeleteAgentsMd) {
    const agentsMd = `${target}/AGENTS.md`;
    if (existsSync(agentsMd)) {
      await unlink(agentsMd);
    }
  }

  // MCP keys: only delete the JSON key if this adapter HAD mcps at some
  // point (so the file's `mcp` key is something we installed, not user-
  // created) AND state now has no mcps entries left (so the key is
  // obsolete). If state still has mcps — e.g. on a --types=[agents,skills]
  // remove — leave the file untouched; the surviving mcps need the key.
  const stillHasMcps = !!state.tools?.opencode?.mcps;
  if (options.hadMcps && !stillHasMcps) {
    await removeJsonKeys(`${target}/${OPENCODE_CONFIG}`, OPENCODE_MCP_KEY);
  }
}

/**
 * Shallow smoke test: walks source/<type>/ and returns { ok: true } if
 * none throw. Does NOT check semantic validity of resources, nor that
 * target exists (validate runs BEFORE install). For deeper checks, use
 * the `validate` CLI command.
 * @returns {Promise<{ok: true}>}
 */
// validate runs BEFORE install — target doesn't exist yet. Walkers read
// from source/ only.
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

// ─── Bootstrap command (OpenCode) ─────────────────────────────────────────
//
// Single source of truth: <source>/prompts/bootstrap/ in the toolkit repo.
// installBootstrap() renders an OpenCode command at .opencode/commands/
// with frontmatter (command spec compliant) + the conductor body (paths
// adjusted to @0X-... references) + 9 supporting files (byte-by-byte copies).
//
// Source files are NEVER modified by this adapter. The conductor lives in
// toolkit source as `source/prompts/bootstrap/00-conductor.md`.

const OPENCODE_BOOTSTRAP_FILE = '.opencode/commands/bootstrap.md';
const OPENCODE_BOOTSTRAP_SUBDIR = '.opencode/commands/bootstrap';
const OPENCODE_BOOTSTRAP_FRONTMATTER = `---
description: >
  Initializes the project context guide (AGENTS.md + .context/).
  Runs 9 sequential steps with isolated sub-agents.
subtask: false
---
`;

/**
 * Install or re-install the bootstrap command in the target project.
 *
 * By default (force=false): idempotent — skip if the bootstrap subdir
 * already exists. Safe for `init` (don't clobber existing).
 *
 * With force=true: wipe and recreate the bootstrap artifacts
 * (`bootstrap.md` + `bootstrap/` subdir) unconditionally. Required for
 * `sync` so source modifications propagate.
 *
 * OpenCode uses the `@filename` syntax to reference files relative to the
 * command's location (unlike Claude Code, which uses `./filename`).
 *
 * @param {{source: string, target: string}} args
 * @param {{force?: boolean}} [options]
 * @returns {Promise<{installed: boolean}>}
 */
export async function installBootstrap({ source, target }, options = {}) {
  const { force = false } = options;
  const bootstrapFile = join(target, OPENCODE_BOOTSTRAP_FILE);
  const bootstrapSubdir = join(target, OPENCODE_BOOTSTRAP_SUBDIR);

  // OpenCode: check the supporting files subdir (the canonical "parent dir"
  // for the artifacts, mirroring the Claude adapter's check on
  // `.claude/skills/bootstrap/`). An orphaned `bootstrap.md` without its
  // subdir would not be detected here, but such a state is broken anyway
  // (the command references files that don't exist) and reinstalling
  // recovers it.
  if (existsSync(bootstrapSubdir)) {
    if (!force) {
      console.log(
        `  → Bootstrap command already exists at ${OPENCODE_BOOTSTRAP_FILE}. ` +
        `Skipping (delete the file/dir to reinstall).`
      );
      return { installed: false };
    }
    // force=true: wipe existing artifacts so source changes propagate.
    // The outer existsSync check guarantees bootstrapSubdir exists here,
    // so no inner check needed. `rm({force:true})` is a no-op on missing
    // paths but skipping the redundant check keeps the intent obvious.
    await rm(bootstrapSubdir, { recursive: true, force: true });
    if (existsSync(bootstrapFile)) {
      await rm(bootstrapFile, { force: true });
    }
  }

  const { conductor, supportingFiles } = readBootstrapSource(source);

  // OpenCode: conductor paths are rewritten to `@0X-...` (OpenCode's native
  // reference syntax for sibling files of the command).
  const pathMapping = Object.fromEntries(
    BOOTSTRAP_SUPPORTING_FILES.map((name) => [name, `@${name}`])
  );
  const adjustedConductor = adaptConductorPaths(conductor, pathMapping);

  await mkdir(bootstrapSubdir, { recursive: true });
  await writeFile(bootstrapFile, OPENCODE_BOOTSTRAP_FRONTMATTER + adjustedConductor);

  for (let i = 0; i < BOOTSTRAP_SUPPORTING_FILES.length; i++) {
    await writeFile(
      join(target, OPENCODE_BOOTSTRAP_SUBDIR, BOOTSTRAP_SUPPORTING_FILES[i]),
      supportingFiles[i]
    );
  }

  return { installed: true };
}

/**
 * Remove the bootstrap command from the target project.
 * Idempotent: skip if neither bootstrap artifact exists.
 *
 * Removes `.opencode/commands/bootstrap.md` and the supporting files
 * in `.opencode/commands/bootstrap/`. Robust to orphan states — deletes
 * whichever artifacts exist, leaves the filesystem clean either way.
 *
 * @param {{target: string}} args
 * @returns {Promise<{removed: boolean}>} true if any artifact was removed,
 *   false if neither existed
 */
export async function uninstallBootstrap({ target }) {
  const bootstrapFile = join(target, OPENCODE_BOOTSTRAP_FILE);
  const bootstrapSubdir = join(target, OPENCODE_BOOTSTRAP_SUBDIR);

  if (!existsSync(bootstrapFile) && !existsSync(bootstrapSubdir)) {
    return { removed: false };
  }

  if (existsSync(bootstrapSubdir)) {
    await rm(bootstrapSubdir, { recursive: true, force: true });
  }
  if (existsSync(bootstrapFile)) {
    await rm(bootstrapFile, { force: true });
  }
  return { removed: true };
}

// ─── Lifecycle registry ───────────────────────────────────────────────────
//
// Lifecycle hooks: adding a new extra (lint rules, security hooks,
// templates) = push to the right arrays. install/sync/remove iterate them
// generically with try/catch + console.warn so a misbehaving extra doesn't
// break the whole lifecycle. This makes the adapter "open to extensions":
// a new extra is one push, not 12 points of maintenance across the two
// adapters.
//
// install() runs lifecycle.install hooks AFTER installing agents/skills/
// mcps/rules and BEFORE writeState. sync() reuses install() so it
// automatically picks up install-time extras; lifecycle.sync is reserved
// for extras that should fire only on sync, not on a fresh install. Note:
// installBootstrap is intentionally NOT pushed to lifecycle.sync — the
// direct call in sync() (with force=true) handles the wipe + recreate.
// Future sync-only extras (e.g., lint rules) should push to lifecycle.sync.
// remove() runs lifecycle.remove BEFORE postRemoveCleanup to preserve the
// M1 ordering invariant (extras that may leave empty parents must run
// before the cleanup pass that sweeps them up). The explicit
// `removeIfEmpty('.opencode/commands')` in postRemoveCleanup stays there
// — it is part of the structural cleanup, not an extra.
const lifecycle = createLifecycle();
lifecycle.install.push(installBootstrap);
// lifecycle.sync is intentionally empty — reserved for future sync-only
// extras (e.g., lint rules). Do NOT push installBootstrap here.
lifecycle.remove.push(uninstallBootstrap);

export { lifecycle };

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

    const dstMd = join(dstDir, OPENCODE_SKILL_FILE);
    await installResource(join(skill.dir, OPENCODE_SKILL_FILE), dstMd);

    for (const file of listSkillFiles(skill.dir)) {
      const dstFile = join(dstDir, file.relative);
      await mkdir(dirname(dstFile), { recursive: true });
      await installResource(file.absolute, dstFile);
    }

    recordInstalled(state, 'opencode', 'skills', skill.name);
  }
}

/**
 * Install MCPs by merging canonical definitions into the user's opencode.json.
 * @param {{}} config - reserved for future MCP runtime overrides; unused for now
 */
async function installMcps(source, target, state, config) {
  const mcps = listMcps(source);
  if (mcps.length === 0) return;

  const configPath = join(target, OPENCODE_CONFIG);
  const existing = await readJsonConfig(configPath, {});

  const mcpSection = existing[OPENCODE_MCP_KEY] || {};
  for (const mcp of mcps) {
    mcpSection[mcp.name] = canonicalToOpencode(mcp.definition);
    recordInstalled(state, 'opencode', 'mcps', mcp.name);
  }

  existing[OPENCODE_MCP_KEY] = mcpSection;
  // 2-space indent: matches toolkit convention, produces stable git diffs.
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

  // Both branches wrote AGENTS.md (or a stub) — claim ownership so
  // postRemoveCleanup knows not to delete it if other tools still depend on it.
  recordRulesOwnership(state, 'opencode');
}

async function removeResource(target, type, name) {
  // Type 'rules' is intentionally absent — rules live in AGENTS.md (concatenated),
  // and the caller (remove()) handles them inline by re-rendering AGENTS.md and
  // never delegates to this helper. Adding a case here would mask the no-op.
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
      const cfg = await readJsonConfig(configPath, {});
      if (cfg[OPENCODE_MCP_KEY]?.[name]) {
        delete cfg[OPENCODE_MCP_KEY][name];
        await writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n');
      }
      break;
    }
  }
}