// bin/lib/parse-types-flag.mjs

/**
 * Parse the `--types` flag robustly.
 *
 * Returns:
 *   - `string[]` when user provided `--types=agents,skills` (trimmed, lowercased, deduped)
 *   - `null` when user did NOT provide `--types` (caller falls back to defaults)
 *
 * Rejects:
 *   - `--types=` (empty)               → throws "cannot be empty"
 *   - `--types=true` (non-string)      → throws "must be comma-separated string"
 *   - `--types=foo` (when validTypes)  → throws "Unknown type(s): foo. Valid: ..."
 *
 * Whitespace tolerant: `--types= Skills , agents ` → `['skills', 'agents']`
 *
 * Case-insensitive: `--types=AGENTS` → `['agents']`
 *
 * The `validTypes` whitelist is optional. Without it, the parser accepts any
 * non-empty string array (caller is responsible for downstream validation).
 * This lets `bin/commands/sync.mjs` reuse the helper without depending on
 * init's `ALL_TYPES` constant.
 *
 * @param {object} flags - parsed CLI flags (looks for flags.types)
 * @param {string[]} [validTypes] - optional whitelist for validation
 * @returns {string[]|null}
 */
export function parseTypesFlag(flags, validTypes) {
  if (flags.types === undefined || flags.types === false) return null;

  if (typeof flags.types !== 'string') {
    throw new Error('--types must be a comma-separated string like --types=agents,skills');
  }

  const result = [...new Set(
    flags.types.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  )];

  if (result.length === 0) {
    throw new Error('--types cannot be empty. Use --types=agents,skills or omit for all.');
  }

  if (validTypes) {
    const invalid = result.filter(t => !validTypes.includes(t));
    if (invalid.length > 0) {
      throw new Error(
        `Unknown type(s): ${invalid.join(', ')}. Valid: ${validTypes.join(', ')}`
      );
    }
  }

  return result;
}