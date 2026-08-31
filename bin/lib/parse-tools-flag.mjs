// bin/lib/parse-tools-flag.mjs

/**
 * Parse the `--tools` flag robustly. Returns:
 *   - `string[]` when the user provided `--tools=opencode,claude-code`
 *   - `null` when the user did NOT provide `--tools` (fall back to config)
 *
 * Rejects:
 *   - `--tools=true` (boolean value)  → throws (caller probably meant a flag)
 *   - `--tools=123` (number)           → throws
 *
 * Accepts:
 *   - `--tools=opencode,claude-code`   → ["opencode", "claude-code"]
 *   - `--tools= opencode`              → ["opencode"] (whitespace trimmed... no: kept literal)
 *   - `--tools=foo,,bar`               → ["foo", "bar"] (filter empty entries)
 *   - `--tools` (value-less, flags.tools===false)  → null (fall back)
 *   - (flag not given at all)          → null (fall back)
 *
 * The whitelist check (rejecting tools not in config.tools) is delegated to
 * loadAdapter; this helper is purely syntactic.
 *
 * @param {object} flags - the flags object from parseFlags()
 * @returns {string[]|null}
 */
export function parseToolsFlag(flags) {
  if (flags.tools === undefined) {
    return null;
  }
  if (flags.tools === false) {
    // User typed `--tools` without a value. Per Fase 0 design this is
    // treated as "use config default" (NOT as a single tool named "").
    return null;
  }
  if (typeof flags.tools !== 'string') {
    throw new Error(
      '--tools must be a comma-separated string like --tools=opencode,claude-code'
    );
  }
  return [...new Set(
    flags.tools.split(',').map(s => s.trim()).filter(Boolean)
  )];
}
