// bin/lib/parse-flags.mjs — argv → { flags, positional }

// Boolean toggles: presence = true, value-less or explicit value both set true.
// Other flags: value-less = false (Fase 0 fix for `flags.tools.split` crash).
const BOOLEAN_FLAGS = new Set(['yes', 'global']);

/**
 * Parse CLI argv into { flags, positional }.
 *
 * Contract:
 *   --flag=value         → flags.flag = value
 *   --flag value         → flags.flag = value (next arg if no leading '--')
 *   --flag               → flags.flag = false (caller decides)
 *   --                   → everything after is positional
 *   bare words           → collected in positional[]
 *
 * Boolean flags (yes, global): presence = true. `--yes=false` becomes true.
 *
 * Rationale: value-less = false was a Fase 0 fix that broke `--yes`/`--global`
 * (which used to be `true`); BOOLEAN_FLAGS restores them as pure booleans.
 *
 * @param {string[]} args
 * @returns {{ flags: object, positional: string[] }}
 */
export function parseFlags(args) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }

    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const eqIdx = arg.indexOf('=');

    // Boolean flag with --flag=value: discard value, set true.
    if (eqIdx !== -1) {
      const key = arg.slice(2, eqIdx);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        continue;
      }
      const value = arg.slice(eqIdx + 1);
      flags[key] = value;
      continue;
    }

    const key = arg.slice(2);

    // Boolean flag without value: presence = true; do not consume next arg.
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = true;
      continue;
    }

    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = false;
    }
  }

  return { flags, positional };
}
