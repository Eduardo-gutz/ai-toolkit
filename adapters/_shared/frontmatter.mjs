import matter from 'gray-matter';

const AGENT_REQUIRED = ['description'];
const SKILL_REQUIRED = ['name', 'description'];
const RULE_REQUIRED = [];

/**
 * Parse a markdown file with YAML frontmatter.
 * @param {string} content - file content
 * @returns {{ frontmatter: object, body: string, raw: string }}
 */
export function parseMarkdown(content) {
  const parsed = matter(content);
  return {
    frontmatter: parsed.data || {},
    body: parsed.content || '',
    raw: content,
  };
}

/**
 * Validate agent frontmatter against canonical schema (source/agents/_schema.md).
 * @param {object} fm - frontmatter object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgentFrontmatter(fm) {
  const errors = [];
  for (const field of AGENT_REQUIRED) {
    if (!fm[field]) errors.push(`Missing required field: ${field}`);
  }
  if (fm.description && fm.description.length > 220) {
    errors.push(`description exceeds 220 chars (got ${fm.description.length})`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate skill frontmatter against Agent Skills spec (source/skills/_schema.md).
 * @param {object} fm - frontmatter object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSkillFrontmatter(fm) {
  const errors = [];
  for (const field of SKILL_REQUIRED) {
    if (!fm[field]) errors.push(`Missing required field: ${field}`);
  }
  if (fm.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) {
    errors.push(`name must match ^[a-z0-9]+(-[a-z0-9]+)*$`);
  }
  if (fm.description && fm.description.length > 1024) {
    errors.push(`description exceeds 1024 chars (got ${fm.description.length})`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate rule frontmatter (no required fields per source/rules/_schema.md).
 * @param {object} fm
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRuleFrontmatter(fm) {
  return { valid: true, errors: [] };
}