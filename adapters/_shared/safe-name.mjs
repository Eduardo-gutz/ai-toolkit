// Reject path-traversal and shell-meta in resource names. CLI args were
// once interpolated directly into filesystem paths (e.g.
// `${projectDir}/.claude/skills/${name}`) — a `--tools=..` would escape.
//
// Rules: 1..128 chars; ASCII letters/digits/'_'/'-'/'.'; cannot start
// with '.'; cannot be exactly '.' or '..'.
//
// @param {string} name
// @param {string} type - resource label for error messages
// @throws {Error} when name violates any rule
export function assertSafeName(name, type) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`Invalid ${type} name: must be a non-empty string`);
  }
  if (name.length > 128) {
    throw new Error(`Invalid ${type} name "${name}": max 128 chars`);
  }
  if (name === '.' || name === '..') {
    throw new Error(`Invalid ${type} name "${name}"`);
  }
  if (name.startsWith('.')) {
    throw new Error(`Invalid ${type} name "${name}": cannot start with "."`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(
      `Invalid ${type} name "${name}". ` +
      `Allowed: letters, digits, "_", "-", "." (not as first char)`
    );
  }
}
