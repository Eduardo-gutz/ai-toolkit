import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarkdown, validateAgentFrontmatter } from './frontmatter.mjs';

/**
 * Walk source/agents/ and return one entry per agent.
 * @param {string} sourceDir
 * @param {object} [options]
 * @param {function(string): void} [options.warn] - callback for non-fatal warnings
 * @returns {Array<{name: string, file: string, frontmatter: object, body: string}>}
 */
export function listAgents(sourceDir, options = {}) {
  const warn = options.warn || ((msg) => console.warn(`[agents-walker] ${msg}`));
  const agentsDir = join(sourceDir, 'agents');
  if (!existsSync(agentsDir)) return [];

  const entries = readdirSync(agentsDir, { withFileTypes: true })
    .filter((f) => f.isFile())
    .filter((f) => f.name.endsWith('.md'))
    .filter((f) => !f.name.startsWith('_'));

  const agents = [];
  for (const entry of entries) {
    const name = entry.name.replace(/\.md$/, '');
    try {
      const agent = readAgent(sourceDir, name);
      if (agent) agents.push(agent);
    } catch (err) {
      warn(`Skipping agent "${name}": ${err.message.split('\n')[0]}`);
    }
  }
  return agents;
}

/**
 * Read a single agent by name (filename without .md).
 * @param {string} sourceDir
 * @param {string} name
 * @returns {{name: string, file: string, frontmatter: object, body: string} | null}
 */
export function readAgent(sourceDir, name) {
  const file = join(sourceDir, 'agents', `${name}.md`);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8');
  const { frontmatter, body } = parseMarkdown(raw);

  const validation = validateAgentFrontmatter(frontmatter);
  if (!validation.valid) {
    throw new Error(
      `Agent "${name}" frontmatter invalid:\n  - ${validation.errors.join('\n  - ')}`,
    );
  }

  return { name, file, frontmatter, body };
}