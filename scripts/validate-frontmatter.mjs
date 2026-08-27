#!/usr/bin/env node
// scripts/validate-frontmatter.mjs — Validate all source frontmatter.
// Exits 0 if all OK, 1 if any errors found.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import matter from 'gray-matter';

const ROOT = process.cwd();
const SOURCE = join(ROOT, 'source');
const AGENTS_DIR = join(SOURCE, 'agents');
const SKILLS_DIR = join(SOURCE, 'skills');

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const AGENT_MAX_DESC = 220;
const SKILL_MAX_DESC = 1024;

const errors = [];
const warnings = [];

function fail(file, msg) {
  errors.push(`✗ ${file}: ${msg}`);
}
function warn(file, msg) {
  warnings.push(`⚠ ${file}: ${msg}`);
}

function checkAgent(file) {
  const name = basename(file, '.md');
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    fail(file, `cannot read: ${e.message}`);
    return;
  }

  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    fail(file, `YAML parse error: ${e.message.split('\n')[0]}`);
    return;
  }

  const fm = parsed.data || {};

  // name
  if (!fm.name) {
    fail(file, 'missing required field: name');
  } else if (!NAME_RE.test(fm.name)) {
    fail(file, `name "${fm.name}" must match regex ${NAME_RE}`);
  } else if (fm.name !== name) {
    fail(file, `name "${fm.name}" does not match filename "${name}"`);
  }

  // description
  if (!fm.description) {
    fail(file, 'missing required field: description');
  } else if (typeof fm.description !== 'string') {
    fail(file, `description must be a string (got ${typeof fm.description})`);
  } else if (fm.description.length > AGENT_MAX_DESC) {
    fail(file, `description exceeds ${AGENT_MAX_DESC} chars (got ${fm.description.length})`);
  }

  // tools (if present) must be an object (map) — opencode format
  if (fm.tools !== undefined) {
    if (typeof fm.tools !== 'object' || Array.isArray(fm.tools) || fm.tools === null) {
      fail(file, `tools must be an object/map (got ${Array.isArray(fm.tools) ? 'array' : typeof fm.tools})`);
    } else {
      for (const [tool, enabled] of Object.entries(fm.tools)) {
        if (typeof tool !== 'string' || !/^[a-z][a-z0-9-]*$/.test(tool)) {
          fail(file, `tools key "${tool}" must be lowercase identifier (e.g., read, write, bash)`);
        }
        if (typeof enabled !== 'boolean') {
          fail(file, `tools.${tool} must be boolean (got ${typeof enabled})`);
        }
      }
    }
  }

  // permission (if present) must be object
  if (fm.permission !== undefined && typeof fm.permission !== 'object') {
    fail(file, `permission must be an object (got ${typeof fm.permission})`);
  }
}

function checkSkill(skillMd) {
  const skillDir = basename(SKILLS_DIR); // not used, kept for clarity
  const name = basename(join(skillMd, '..')); // parent folder name
  let raw;
  try {
    raw = readFileSync(skillMd, 'utf8');
  } catch (e) {
    fail(skillMd, `cannot read: ${e.message}`);
    return;
  }

  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    fail(skillMd, `YAML parse error: ${e.message.split('\n')[0]}`);
    return;
  }

  const fm = parsed.data || {};

  // name
  if (!fm.name) {
    fail(skillMd, 'missing required field: name');
  } else if (!NAME_RE.test(fm.name)) {
    fail(skillMd, `name "${fm.name}" must match regex ${NAME_RE}`);
  } else if (fm.name !== name) {
    fail(skillMd, `name "${fm.name}" does not match folder "${name}"`);
  }

  // description
  if (!fm.description) {
    fail(skillMd, 'missing required field: description');
  } else if (typeof fm.description !== 'string') {
    fail(skillMd, `description must be a string (got ${typeof fm.description})`);
  } else if (fm.description.length > SKILL_MAX_DESC) {
    fail(skillMd, `description exceeds ${SKILL_MAX_DESC} chars (got ${fm.description.length})`);
  }
}

// ── Walk agents/ ────────────────────────────────────────────────────────
if (existsSync(AGENTS_DIR)) {
  const agentFiles = readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => join(AGENTS_DIR, f));
  for (const f of agentFiles) checkAgent(f);
} else {
  warn(AGENTS_DIR, 'agents directory does not exist');
}

// ── Walk skills/<name>/SKILL.md ────────────────────────────────────────
if (existsSync(SKILLS_DIR)) {
  const skillFolders = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'));
  for (const folder of skillFolders) {
    const skillMd = join(SKILLS_DIR, folder.name, 'SKILL.md');
    if (!existsSync(skillMd)) {
      warn(join(SKILLS_DIR, folder.name), 'SKILL.md not found');
      continue;
    }
    checkSkill(skillMd);
  }
} else {
  warn(SKILLS_DIR, 'skills directory does not exist');
}

// ── Report ──────────────────────────────────────────────────────────────
if (warnings.length > 0) {
  console.warn('Warnings:');
  warnings.forEach((w) => console.warn('  ' + w));
  console.warn('');
}
if (errors.length > 0) {
  console.error('Errors:');
  errors.forEach((e) => console.error('  ' + e));
  console.error(`\n${errors.length} error(s) found.`);
  process.exit(1);
} else {
  console.log('✓ All source frontmatter valid.');
}