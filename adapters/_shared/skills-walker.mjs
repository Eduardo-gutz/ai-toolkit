import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarkdown, validateSkillFrontmatter } from './frontmatter.mjs';

/**
 * Walk source/skills/ and return one entry per skill folder containing SKILL.md.
 * @param {string} sourceDir - path to source/ root
 * @param {object} [options]
 * @param {function(string): void} [options.warn] - callback for non-fatal warnings
 * @returns {Array<{name: string, dir: string, frontmatter: object, body: string}>}
 */
export function listSkills(sourceDir, options = {}) {
  const warn = options.warn || ((msg) => console.warn(`[skills-walker] ${msg}`));
  const skillsDir = join(sourceDir, 'skills');
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !d.name.startsWith('_'));

  const skills = [];
  for (const dir of entries) {
    const skillMd = join(skillsDir, dir.name, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    try {
      const skill = readSkill(sourceDir, dir.name);
      if (skill) skills.push(skill);
    } catch (err) {
      warn(`Skipping skill "${dir.name}": ${err.message.split('\n')[0]}`);
    }
  }
  return skills;
}

/**
 * Read a single skill by name (folder name).
 * @param {string} sourceDir
 * @param {string} name
 * @returns {{name: string, dir: string, frontmatter: object, body: string} | null}
 */
export function readSkill(sourceDir, name) {
  const skillDir = join(sourceDir, 'skills', name);
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) return null;
  const raw = readFileSync(skillMd, 'utf8');
  const { frontmatter, body } = parseMarkdown(raw);

  const validation = validateSkillFrontmatter(frontmatter);
  if (!validation.valid) {
    throw new Error(
      `Skill "${name}" frontmatter invalid:\n  - ${validation.errors.join('\n  - ')}`,
    );
  }

  return { name, dir: skillDir, frontmatter, body };
}

/**
 * List supporting files in a skill folder (scripts/, references/, assets/, etc.).
 * Excludes SKILL.md and hidden files.
 * @param {string} skillDir
 * @returns {string[]} absolute paths
 */
export function listSkillFiles(skillDir) {
  if (!existsSync(skillDir)) return [];
  const result = [];
  function walk(dir, base = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.name !== 'SKILL.md') {
        result.push({ absolute: full, relative: rel });
      }
    }
  }
  walk(skillDir);
  return result;
}