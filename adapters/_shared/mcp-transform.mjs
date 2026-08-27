/**
 * Normalize variable expansion: ${env:VAR} → ${VAR}
 * opencode accepts both; claude-code only accepts ${VAR}.
 * @param {object} envOrHeaders
 * @returns {object} new object with normalized vars
 */
function normalizeEnv(envOrHeaders) {
  if (!envOrHeaders) return {};
  const out = {};
  for (const [k, v] of Object.entries(envOrHeaders)) {
    const normalized = typeof v === 'string' ? v.replace(/\$\{env:([^}]+)\}/g, '${$1}') : v;
    out[k] = normalized;
  }
  return out;
}

/**
 * Canonical → opencode MCP shape.
 * opencode uses:
 *   stdio → { type: "local", command: [command, ...args], environment: {...} }
 *   http/sse → { type: "remote", url, headers }
 * Variable expansion: ${env:VAR} preserved (opencode native).
 * @param {object} def - canonical MCP definition
 * @returns {object} opencode MCP config
 */
export function canonicalToOpencode(def) {
  const base = {
    enabled: def.enabled !== false,
  };
  if (def.description) base.description = def.description;
  if (def.timeout) base.timeout = def.timeout;

  if (def.transport === 'stdio') {
    return {
      ...base,
      type: 'local',
      command: [def.command, ...(def.args || [])],
      environment: normalizeEnv(def.env),
    };
  }
  return {
    ...base,
    type: 'remote',
    url: def.url,
    headers: normalizeEnv(def.headers),
  };
}

/**
 * Canonical → Claude Code MCP shape.
 * Claude Code uses:
 *   stdio → { type: "stdio", command, args, env }
 *   http → { type: "http", url, headers }
 *   sse → { type: "sse", url, headers }
 *   ws → { type: "ws", url }
 * Variable expansion: ${env:VAR} → ${VAR}.
 * @param {object} def - canonical MCP definition
 * @returns {object} Claude Code MCP config
 */
export function canonicalToClaudeCode(def) {
  const typeMap = {
    stdio: 'stdio',
    http: 'http',
    sse: 'sse',
    ws: 'ws',
  };

  const result = {
    type: typeMap[def.transport],
  };
  if (def.description) result.description = def.description;

  if (def.transport === 'stdio') {
    result.command = def.command;
    result.args = def.args || [];
    if (def.env) result.env = normalizeEnv(def.env);
  } else {
    result.url = def.url;
    if (def.headers) result.headers = normalizeEnv(def.headers);
  }
  return result;
}