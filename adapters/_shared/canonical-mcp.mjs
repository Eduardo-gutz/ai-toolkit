import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const VALID_TRANSPORTS = ['stdio', 'http', 'sse', 'ws'];

/**
 * Walk source/mcps/ and return one entry per MCP JSON file.
 * @param {string} sourceDir
 * @returns {Array<{name: string, file: string, definition: object}>}
 */
export function listMcps(sourceDir) {
  const mcpsDir = join(sourceDir, 'mcps');
  if (!existsSync(mcpsDir)) return [];

  const entries = readdirSync(mcpsDir, { withFileTypes: true })
    .filter((f) => f.isFile())
    .filter((f) => f.name.endsWith('.json'))
    .filter((f) => !f.name.startsWith('_'));

  const mcps = [];
  for (const entry of entries) {
    const name = entry.name.replace(/\.json$/, '');
    const def = readMcp(sourceDir, name);
    if (def) mcps.push({ name, file: join(mcpsDir, entry.name), definition: def });
  }
  return mcps;
}

/**
 * Read and validate a single MCP definition by name (filename without .json).
 * @param {string} sourceDir
 * @param {string} name
 * @returns {object | null}
 * @throws if definition is invalid
 */
export function readMcp(sourceDir, name) {
  const file = join(sourceDir, 'mcps', `${name}.json`);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8');
  let def;
  try {
    def = JSON.parse(raw);
  } catch (err) {
    throw new Error(`MCP "${name}" is not valid JSON: ${err.message}`);
  }
  validateMcp(def);
  return def;
}

/**
 * Validate a canonical MCP definition.
 * @param {object} def
 * @throws if invalid
 */
export function validateMcp(def) {
  if (!def.name) throw new Error('MCP missing required field: name');
  if (!def.transport) throw new Error(`MCP "${def.name}" missing required field: transport`);
  if (!VALID_TRANSPORTS.includes(def.transport)) {
    throw new Error(`MCP "${def.name}" has invalid transport "${def.transport}". Must be one of: ${VALID_TRANSPORTS.join(', ')}`);
  }
  if (def.transport === 'stdio') {
    if (!def.command) throw new Error(`stdio MCP "${def.name}" missing required field: command`);
  } else {
    if (!def.url) throw new Error(`${def.transport} MCP "${def.name}" missing required field: url`);
  }
  if (def.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def.name)) {
    throw new Error(`MCP name "${def.name}" must match ^[a-z0-9]+(-[a-z0-9]+)*$`);
  }
}