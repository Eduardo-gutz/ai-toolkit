import { mkdir, writeFile, readFile, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { listAgents } from '../_shared/agents-walker.mjs';
import { listSkills, listSkillFiles } from '../_shared/skills-walker.mjs';
import { listMcps } from '../_shared/canonical-mcp.mjs';
import { canonicalToClaudeCode } from '../_shared/mcp-transform.mjs';
import { listRules, renderRules, renderClaudeMdImport } from '../_shared/rules-renderer.mjs';
import { installResource } from '../_shared/install.mjs';
import { removeIfEmpty, removeJsonKeys, readJsonConfig } from '../_shared/cleanup-if-empty.mjs';
import { assertSafeName } from '../_shared/safe-name.mjs';
import { makeResourcePaths, makeCleanupDirs } from '../_shared/tool-paths.mjs';
import {
  readBootstrapSource,
  adaptConductorPaths,
  BOOTSTRAP_SUPPORTING_FILES,
} from '../_shared/bootstrap-renderer.mjs';
import { PROMPT_PACKS, readPromptPack, adaptPackPaths, validatePromptPack, writePackFile } from '../_shared/prompt-pack.mjs';
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
const CLAUDE_ROOT = '.claude';
const CLAUDE_MCP_KEY = 'mcpServers';
const CLAUDE_SKILL_FILE = 'SKILL.md';
const AGENTS_MD = 'AGENTS.md';
const CLAUDE_MD = 'CLAUDE.md';

/**
 * Filesystem markers used by `sync`'s auto-detect fallback. If any of these
 * paths exist in the project directory, the tool is considered physically
 * installed. Read by sync.mjs via the loaded adapter module. Defining
 * markers HERE (not in the command) keeps the OCP contract: adding a new
 * tool only requires creating its adapter with its own `fsMarkers` —
 * sync.mjs does not need to change.
 */
export const fsMarkers = [CLAUDE_AGENTS_DIR, CLAUDE_SKILLS_DIR, CLAUDE_MD, CLAUDE_MCP_FILE];

/**
 * Install resources from source to target project for Claude Code.
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
      console.warn(`[claude-code] lifecycle hook failed: ${err.message}. Continuing.`);
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
      console.warn(`[claude-code] bootstrap reinstall failed: ${err.message}. Continuing.`);
    }
  }
  // The greenfield pack has the same wipe+recreate requirement: sync must
  // propagate source modifications to source/prompts/greenfield/.
  // This MUST also run BEFORE the lifecycle.sync loop below, so the
  // wipe + recreate completes before any other sync-only hook fires.
  {
    try {
      await installGreenfield({ source, target }, { force: true });
    } catch (err) {
      console.warn(`[claude-code] greenfield reinstall failed: ${err.message}. Continuing.`);
    }
  }
  recordSync(state, 'claude-code');
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
      console.warn(`[claude-code] lifecycle hook failed: ${err.message}. Continuing.`);
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
    console.warn(`[claude-code] state unreadable: ${err.message}. Skipping remove.`);
    return;
  }

  // Snapshot: did this adapter have rules/mcps BEFORE remove (state-based,
  // NOT filtered by --types). postRemoveCleanup uses hadRules to decide
  // whether CLAUDE.md can be deleted (it imports AGENTS.md), and hadMcps
  // to decide whether the mcpServers key in .mcp.json should be cleaned
  // up. Filtering by the types argument here would cause CLAUDE.md to be
  // deleted on a --types=[agents,skills] remove even though rules are
  // still in state — and AGENTS.md (which CLAUDE.md imports) persists.
  // willRemoveRules/willRemoveMcps (filtered by --types) gate the
  // releaseRulesOwnership call and AGENTS.md re-render logic, but are NOT
  // used for filesystem deletion decisions.
  const hadRules = !!state.tools?.['claude-code']?.rules;
  const hadMcps = !!state.tools?.['claude-code']?.mcps;
  const willRemoveRules = !types || types.includes('rules');
  const willRemoveMcps = !types || types.includes('mcps');

  // Track whether this run re-rendered AGENTS.md — if so, postRemoveCleanup
  // must NOT delete it (the tool just wrote content there).
  let agentsMdRerendered = false;

  for (const [type, names] of Object.entries(state.tools?.['claude-code'] || {})) {
    if (types && !types.includes(type)) continue;
    for (const name of Object.keys(names)) {
      if (type === 'rules') {
        // Rules are concatenated — re-render AGENTS.md without the deleted rule.
        // If write fails, do NOT recordRemoved (state stays consistent with disk).
        if (!source) {
          // No source → can't re-render. Best-effort: just recordRemoved and
          // warn. State will diverge from disk until next install/sync.
          console.warn(
            `[claude-code] cannot re-render AGENTS.md without source. ` +
            `State will diverge from filesystem until next \`ai-toolkit sync\`.`
          );
          recordRemoved(state, 'claude-code', type, name);
          continue;
        }
        const remainingSourceRules = listRules(source).filter((r) => r.name !== name);
        if (remainingSourceRules.length === 0) {
          // No rules left in source — let postRemoveCleanup decide whether to
          // delete AGENTS.md (based on ownership). Don't re-render a stub:
          // if this adapter is the last owner, the file gets deleted; if not,
          // another adapter's rules remain and AGENTS.md should reflect them.
          recordRemoved(state, 'claude-code', type, name);
          continue;
        }
        const agentsBody = renderRules(remainingSourceRules, {
          intro: `These rules are applied to **${state.installed_at || 'this project'}** by ai-toolkit. Source: \`source/rules/\`. Edit rules in the source repo, not here.`,
        });
        try {
          await writeFile(join(target, AGENTS_MD), agentsBody);
          agentsMdRerendered = true;
          recordRemoved(state, 'claude-code', type, name);
        } catch (err) {
          console.warn(
            `[claude-code] failed to re-render AGENTS.md while removing rule '${name}': ${err.message}. ` +
            `Skipping recordRemoved to keep state consistent with disk.`
          );
        }
      } else {
        await removeResource(target, type, name);
        recordRemoved(state, 'claude-code', type, name);
      }
    }
  }

  // Release AGENTS.md ownership — only the LAST owner will delete the file.
  // Skipped when --types excludes rules: releasing ownership for a type that
  // wasn't removed would falsely empty agents_md_owners and let
  // postRemoveCleanup delete AGENTS.md on a non-rules remove.
  if (willRemoveRules) {
    releaseRulesOwnership(state, 'claude-code');
  }

  // Drop empty parent keys (e.g. {agents: {}, mcps: {}, rules: {}}) so that
  // postRemoveCleanup's ownership check sees a clean state. Without this,
  // the legacy fallback sees this tool as "still registered" even when its
  // own entries are gone.
  pruneEmpty(state);

  writeState(target, state);

  // Run lifecycle extras (e.g., bootstrap uninstall, future lint rules)
  // BEFORE postRemoveCleanup. If the bootstrap subdir was the only
  // occupant of `.claude/skills/`, the previous order (postRemoveCleanup
  // first, then uninstallBootstrap) left `.claude/skills/` and `.claude/`
  // as orphan empty dirs after the bootstrap dir was finally removed —
  // postRemoveCleanup saw the non-empty skills dir and skipped. Iterating
  // lifecycle.remove first guarantees postRemoveCleanup finds the parent
  // dirs empty and removes them. (This is the M1 fix; the lifecycle
  // registry preserves the order but generalizes the mechanism so future
  // extras get the same treatment.)
  for (const hook of lifecycle.remove) {
    try {
      await hook({ target });
    } catch (err) {
      console.warn(`[claude-code] lifecycle hook failed: ${err.message}. Continuing.`);
    }
  }

  await postRemoveCleanup(target, state, 'claude-code', {
    hadRules,
    hadMcps,
    agentsMdRerendered,
  });
}

/**
 * Best-effort cleanup of the structure install() created.
 * Each step is a no-op if the path doesn't exist or isn't empty.
 * Respects state.agents_md_owners to avoid deleting AGENTS.md/CLAUDE.md
 * that another adapter still depends on.
 *
 * @param {string} target
 * @param {object} state - current state (after recordRemoved loop)
 * @param {string} toolName
 * @param {object} [options]
 * @param {boolean} [options.hadRules] - did this adapter have rules before
 *   remove? (state-based, NOT filtered by --types) Used to decide if
 *   CLAUDE.md can be deleted (claude-code only).
 * @param {boolean} [options.hadMcps] - did this adapter have mcps before
 *   remove? (state-based, NOT filtered by --types) Used together with the
 *   current state (post-loop) to decide if the mcpServers key in .mcp.json
 *   should be cleaned up — never touches files the user may have created.
 * @param {boolean} [options.agentsMdRerendered] - did this run re-render
 *   AGENTS.md while removing rules? If yes, AGENTS.md was just written by
 *   this tool — keep it (don't delete).
 */
async function postRemoveCleanup(target, state, toolName, options = {}) {
  await removeIfEmpty(`${target}/.claude/agents`);
  await removeIfEmpty(`${target}/.claude/skills`);
  await removeIfEmpty(`${target}/.claude`);

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

  // CLAUDE.md (claude-code only) — drop it only if this adapter never had
  // rules to begin with; otherwise AGENTS.md (still around) needs CLAUDE.md
  // to import from.
  if (!options.hadRules) {
    const claudeMd = `${target}/CLAUDE.md`;
    if (existsSync(claudeMd)) {
      await unlink(claudeMd);
    }
  }

  // MCP keys: only delete the JSON key if this adapter HAD mcps at some
  // point (so the file's mcpServers key is something we installed, not
  // user-created) AND state now has no mcps entries left (so the key is
  // obsolete). If state still has mcps — e.g. on a --types=[agents,skills]
  // remove — leave the file untouched; the surviving mcps need the key.
  const stillHasMcps = !!state.tools?.['claude-code']?.mcps;
  if (options.hadMcps && !stillHasMcps) {
    await removeJsonKeys(`${target}/.mcp.json`, CLAUDE_MCP_KEY);
  }
}

/**
 * Smoke test: walks source/<type>/ and returns { ok: true } if none throw,
 * then verifies every registered prompt pack the source SHIPS is complete.
 *
 * The pack check is strict about the files of a pack that is present: a
 * missing pack file throws an error naming every absent file, so
 * `ai-toolkit validate` points at the exact file to restore. A source that
 * ships no prompts at all is not a broken pack — the check is skipped for
 * the packs it does not have.
 *
 * @returns {Promise<{ok: true}>}
 */
// validate runs BEFORE install — target doesn't exist yet. Walkers read
// from source/ only.
export async function validate({ source, config }) {
  listAgents(source);
  listSkills(source);
  listMcps(source);
  listRules(source);
  // Every registered prompt pack the source ships must be complete: a
  // half-present pack would install a broken command into the target.
  // `required: false` — a source with no prompts/ directory ships no pack,
  // which is not a broken pack.
  validatePromptPack(source, 'bootstrap', { required: false });
  validatePromptPack(source, 'greenfield', { required: false });
  return { ok: true };
}

// Thin wrapper over makeResourcePaths — see adapters/_shared/tool-paths.mjs.
export const resourcePaths = makeResourcePaths({
  agentsDir: CLAUDE_AGENTS_DIR,
  skillsDir: CLAUDE_SKILLS_DIR,
  assertSafeName,
});

// Thin wrapper over makeCleanupDirs — see adapters/_shared/tool-paths.mjs.
export const cleanupDirs = makeCleanupDirs({ rootDir: CLAUDE_ROOT });

// ─── Bootstrap skill (Claude Code) ────────────────────────────────────────
//
// Single source of truth: <source>/prompts/bootstrap/ in the toolkit repo.
// installBootstrap() renders a Claude Code skill at .claude/skills/bootstrap/
// with frontmatter (skill spec compliant) + the conductor body (paths adjusted
// to ./0X-... relative refs) + 9 supporting files (byte-by-byte copies).
//
// Source files are NEVER modified by this adapter. The conductor lives in
// toolkit source as `source/prompts/bootstrap/00-conductor.md`.

const CLAUDE_BOOTSTRAP_DIR = '.claude/skills/bootstrap';
const CLAUDE_BOOTSTRAP_SKILL = 'SKILL.md';
const CLAUDE_BOOTSTRAP_FRONTMATTER = `---
name: bootstrap
description: >
  Initializes the project context guide (AGENTS.md + .context/).
  Runs 9 sequential steps with isolated sub-agents. Trigger:
  "/bootstrap" or when the developer asks to initialize the context.
disable-model-invocation: true
context: fork
---
`;

/**
 * Install or re-install the bootstrap skill in the target project.
 *
 * By default (force=false): idempotent — skip if the bootstrap dir
 * already exists. Safe for `init` (don't clobber existing).
 *
 * With force=true: wipe and recreate the bootstrap dir unconditionally.
 * Required for `sync` so source modifications propagate.
 *
 * @param {{source: string, target: string}} args
 * @param {{force?: boolean}} [options]
 * @returns {Promise<{installed: boolean}>}
 */
export async function installBootstrap({ source, target }, options = {}) {
  const { force = false } = options;
  const bootstrapDir = join(target, CLAUDE_BOOTSTRAP_DIR);

  if (existsSync(bootstrapDir) && !force) {
    console.log(
      `  → Bootstrap skill already exists at ${CLAUDE_BOOTSTRAP_DIR}/. ` +
      `Skipping (delete the directory to reinstall).`
    );
    return { installed: false };
  }

  // Read the whole pack BEFORE touching the target: a missing or incomplete
  // source pack must throw without destroying the existing install and
  // without leaving a half-written bootstrap dir behind.
  const { conductor, supportingFiles } = readBootstrapSource(source);

  if (existsSync(bootstrapDir)) {
    // force=true: wipe existing so source changes propagate.
    await rm(bootstrapDir, { recursive: true, force: true });
  }

  // Claude Code: conductor paths are rewritten to `./0X-...` (relative to
  // the skill directory).
  const pathMapping = Object.fromEntries(
    BOOTSTRAP_SUPPORTING_FILES.map((name) => [name, `./${name}`])
  );
  const adjustedConductor = adaptConductorPaths(conductor, pathMapping);

  await mkdir(bootstrapDir, { recursive: true });
  await writeFile(
    join(bootstrapDir, CLAUDE_BOOTSTRAP_SKILL),
    CLAUDE_BOOTSTRAP_FRONTMATTER + adjustedConductor
  );

  for (let i = 0; i < BOOTSTRAP_SUPPORTING_FILES.length; i++) {
    await writeFile(
      join(bootstrapDir, BOOTSTRAP_SUPPORTING_FILES[i]),
      supportingFiles[i]
    );
  }

  return { installed: true };
}

/**
 * Remove the bootstrap skill from the target project.
 * Idempotent: skip if the bootstrap dir doesn't exist.
 *
 * Removes the entire `.claude/skills/bootstrap/` directory.
 *
 * @param {{target: string}} args
 * @returns {Promise<{removed: boolean}>} true if removed, false if already absent
 */
export async function uninstallBootstrap({ target }) {
  const bootstrapDir = join(target, CLAUDE_BOOTSTRAP_DIR);

  if (!existsSync(bootstrapDir)) {
    return { removed: false };
  }

  await rm(bootstrapDir, { recursive: true, force: true });
  return { removed: true };
}

// ─── Greenfield skill (Claude Code) ───────────────────────────────────────
//
// Single source of truth: <source>/prompts/greenfield/ in the toolkit repo.
// installGreenfield() renders a Claude Code skill at .claude/skills/greenfield/
// with frontmatter + the conductor body (paths adjusted to ./0X-... and
// ./defaults/... relative refs) + 9 supporting files and 11 catalog assets
// (byte-by-byte copies).
//
// The greenfield skill deliberately does NOT declare `context: fork`, unlike
// the bootstrap skill: the interview needs the human channel, and a forked
// skill runs isolated without one.
//
// Source files are NEVER modified by this adapter.

const CLAUDE_GREENFIELD_DIR = '.claude/skills/greenfield';
const CLAUDE_GREENFIELD_SKILL = 'SKILL.md';
const CLAUDE_GREENFIELD_FRONTMATTER = `---
name: greenfield
description: >
  Initializes the project context guide (AGENTS.md + .context/) for a
  NEW/greenfield project with nothing substantive to extract patterns from.
  Interviews the developer for their standards and fills the rest from
  the detected stack defaults. Trigger: "/greenfield".
disable-model-invocation: true
---
`;

/**
 * Install or re-install the greenfield skill in the target project.
 *
 * The pack's ENTRY POINT is `SKILL.md`, inside the skill directory. The
 * directory alone is not an install: a leftover or hand-made directory
 * must not make the skill disappear, and `init` must never clobber a
 * skill the toolkit did not write.
 *
 * By default (force=false): idempotent — skip when the skill is already
 * installed; REPAIR a partial install (a directory without `SKILL.md`).
 * Safe for `init` (don't clobber existing).
 *
 * With force=true: wipe and recreate the greenfield dir unconditionally.
 * Required for `sync` so source modifications propagate.
 *
 * @param {{source: string, target: string}} args
 * @param {{force?: boolean}} [options]
 * @returns {Promise<{installed: boolean}>}
 */
export async function installGreenfield({ source, target }, options = {}) {
  const { force = false } = options;
  const greenfieldDir = join(target, CLAUDE_GREENFIELD_DIR);
  const skillFile = join(greenfieldDir, CLAUDE_GREENFIELD_SKILL);

  // Read the whole pack BEFORE touching the target: a missing or incomplete
  // source pack must throw without destroying the existing install and
  // without leaving a half-written greenfield dir behind.
  const { conductor, supportingFiles, assets } = readPromptPack(source, 'greenfield');

  // Claude Code: conductor paths are rewritten to `./0X-...` and
  // `./defaults/...` (relative to the skill directory).
  const pathMapping = Object.fromEntries(
    [...PROMPT_PACKS.greenfield.supporting, ...PROMPT_PACKS.greenfield.assets]
      .map((name) => [name, `./${name}`])
  );
  const packFileNames = Object.keys(pathMapping);
  const adjustedConductor = adaptPackPaths(conductor, packFileNames, pathMapping);

  // The supporting files reference their pack siblings too (e.g. the
  // interview prompt points at the standards prompt and at the catalog).
  // Rewrite those references with the very same mapping, so the whole
  // installed skill speaks one syntax. Claude Code's native form is the
  // same relative `./` form, so this rewrite is a no-op there.
  const adjustedSupportingFiles = supportingFiles.map((file) => ({
    name: file.name,
    content: adaptPackPaths(file.content, packFileNames, pathMapping),
  }));

  // What this adapter would write. A file already at the destination that
  // matches it byte for byte is the toolkit's own; one that does not is
  // the user's (or one they edited) and must not be touched.
  const expectedSkill = CLAUDE_GREENFIELD_FRONTMATTER + adjustedConductor;

  const dirExists = existsSync(greenfieldDir);
  const skillExists = existsSync(skillFile);

  if (!force) {
    if (dirExists && skillExists) {
      const actual = await readFile(skillFile, 'utf8');
      if (actual === expectedSkill) {
        console.log(
          `  → Greenfield skill already installed at ${CLAUDE_GREENFIELD_DIR}/. ` +
          `Skipping.`
        );
      } else {
        console.log(
          `  → ${CLAUDE_GREENFIELD_DIR}/${CLAUDE_GREENFIELD_SKILL} differs from the ` +
          `toolkit version. Skipping — remove it to install /greenfield.`
        );
      }
      return { installed: false };
    }
    if (dirExists && !skillExists) {
      // A partial install: the directory exists but the skill's entry
      // point does not. Completing it only adds the pack's own files; a
      // file already there that the toolkit did not write is left alone.
      console.log(
        `  → Greenfield directory found without ${CLAUDE_GREENFIELD_SKILL}. ` +
        `Completing the install.`
      );
    }
  }

  if (force && existsSync(greenfieldDir)) {
    // force=true: wipe existing so source changes propagate. This is what
    // `sync` does — restoring the source is its whole job.
    await rm(greenfieldDir, { recursive: true, force: true });
  }

  const conflicts = [];
  const skillResult = await writePackFile(skillFile, expectedSkill, { force });
  if (skillResult === 'conflict') conflicts.push(skillFile);

  for (const file of adjustedSupportingFiles) {
    const dst = join(greenfieldDir, file.name);
    const result = await writePackFile(dst, file.content, { force });
    if (result === 'conflict') conflicts.push(dst);
  }

  for (const asset of assets) {
    const dst = join(greenfieldDir, asset.name);
    const result = await writePackFile(dst, asset.content, { force });
    if (result === 'conflict') conflicts.push(dst);
  }

  if (conflicts.length > 0) {
    console.log(
      `  → ${conflicts.length} file(s) left untouched because they differ from the toolkit version:\n` +
      conflicts.map((path) => `      ${path}`).join('\n')
    );
  }

  return { installed: true };
}

/**
 * Remove the greenfield skill from the target project.
 * Idempotent: skip if the greenfield dir doesn't exist.
 *
 * Removes the entire `.claude/skills/greenfield/` directory.
 *
 * @param {{target: string}} args
 * @returns {Promise<{removed: boolean}>} true if removed, false if already absent
 */
export async function uninstallGreenfield({ target }) {
  const greenfieldDir = join(target, CLAUDE_GREENFIELD_DIR);

  if (!existsSync(greenfieldDir)) {
    return { removed: false };
  }

  await rm(greenfieldDir, { recursive: true, force: true });
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
// before the cleanup pass that sweeps them up).
const lifecycle = createLifecycle();
lifecycle.install.push(installBootstrap);
lifecycle.install.push(installGreenfield);
// lifecycle.sync is intentionally empty — reserved for future sync-only
// extras (e.g., lint rules). Do NOT push installBootstrap or
// installGreenfield here: the direct calls in sync() (with force=true)
// handle the wipe + recreate.
lifecycle.remove.push(uninstallBootstrap);
lifecycle.remove.push(uninstallGreenfield);

export { lifecycle };

async function installAgents(source, target, state) {
  const agents = listAgents(source);
  const agentsDir = join(target, CLAUDE_AGENTS_DIR);
  await mkdir(agentsDir, { recursive: true });

  for (const agent of agents) {
    const dst = join(target, CLAUDE_AGENTS_DIR, `${agent.name}.md`);
    const rendered = renderAgent(agent);
    await writeFile(dst, rendered);
    recordInstalled(state, 'claude-code', 'agents', agent.name);
  }
}

/** Re-serialize agent with `name` in frontmatter (Claude Code requirement). */
export function renderAgent(agent) {
  const frontmatter = agent.frontmatter.name
    ? agent.frontmatter
    : { ...agent.frontmatter, name: agent.name };
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${formatYamlValue(value)}`);
  }
  lines.push('---', '');
  lines.push(agent.body);
  return lines.join('\n');
}

function formatYamlValue(value) {
  if (typeof value === 'string') {
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

    const dstMd = join(dstDir, CLAUDE_SKILL_FILE);
    await installResource(join(skill.dir, CLAUDE_SKILL_FILE), dstMd);

    for (const file of listSkillFiles(skill.dir)) {
      const dstFile = join(dstDir, file.relative);
      await mkdir(dirname(dstFile), { recursive: true });
      await installResource(file.absolute, dstFile);
    }

    recordInstalled(state, 'claude-code', 'skills', skill.name);
  }
}

/**
 * Install MCPs by merging canonical definitions into the user's .mcp.json.
 * @param {{}} config - reserved for future MCP runtime overrides; unused for now
 */
async function installMcps(source, target, state, config) {
  const mcps = listMcps(source);
  if (mcps.length === 0) return;

  const configPath = join(target, CLAUDE_MCP_FILE);
  const existing = await readJsonConfig(configPath, {});

  const mcpSection = existing[CLAUDE_MCP_KEY] || {};
  for (const mcp of mcps) {
    mcpSection[mcp.name] = canonicalToClaudeCode(mcp.definition);
    recordInstalled(state, 'claude-code', 'mcps', mcp.name);
  }

  existing[CLAUDE_MCP_KEY] = mcpSection;
  // 2-space indent: matches toolkit convention, produces stable git diffs.
  await writeFile(configPath, JSON.stringify(existing, null, 2) + '\n');
}

async function installRules(source, target, state) {
  await writeAgentsMd(source, target, state, 'claude-code');
  await writeClaudeMd(target);
}

async function writeAgentsMd(source, target, state, toolName) {
  const rules = listRules(source);

  // Always write AGENTS.md (Claude Code may reference it via @AGENTS.md).
  if (rules.length > 0) {
    const agentsBody = renderRules(rules, {
      intro: `These rules are applied to **${state.installed_at || 'this project'}** by ai-toolkit. Source: \`source/rules/\`. Edit rules in the source repo, not here.`,
    });
    await writeFile(join(target, AGENTS_MD), agentsBody);

    for (const rule of rules) {
      recordInstalled(state, toolName, 'rules', rule.name);
    }
  } else {
    // Even with no rules, ensure AGENTS.md exists for CLAUDE.md to reference.
    const agentsPath = join(target, AGENTS_MD);
    if (!existsSync(agentsPath)) {
      await writeFile(agentsPath, `# Project Rules\n\nNo rules defined yet.\n`);
    }
  }

  // Both branches wrote AGENTS.md (or a stub) — claim ownership so
  // postRemoveCleanup knows not to delete it if other tools still depend on it.
  recordRulesOwnership(state, toolName);
}

async function writeClaudeMd(target) {
  // Always write CLAUDE.md (Claude Code requires it; references AGENTS.md).
  await writeFile(join(target, CLAUDE_MD), renderClaudeMdImport());
}

async function removeResource(target, type, name) {
  // Type 'rules' is intentionally absent — rules live in AGENTS.md (concatenated),
  // and the caller (remove()) handles them inline by re-rendering AGENTS.md and
  // never delegates to this helper. Adding a case here would mask the no-op.
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
      const cfg = await readJsonConfig(configPath, {});
      if (cfg[CLAUDE_MCP_KEY]?.[name]) {
        delete cfg[CLAUDE_MCP_KEY][name];
        await writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n');
      }
      break;
    }
  }
}