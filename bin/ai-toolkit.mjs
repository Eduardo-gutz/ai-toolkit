#!/usr/bin/env node
// bin/ai-toolkit.mjs — main CLI entry point
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCommand } from './commands/init.mjs';
import { syncCommand } from './commands/sync.mjs';
import { validateCommand } from './commands/validate.mjs';
import { removeCommand } from './commands/remove.mjs';
import { parseFlags } from './lib/parse-flags.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VERSION = '0.1.0';

const COMMANDS = {
  init: {
    fn: initCommand,
    desc: 'Initialize a target project with toolkit config',
  },
  sync: {
    fn: syncCommand,
    desc: 'Regenerate target project config from source (idempotent)',
  },
  validate: {
    fn: validateCommand,
    desc: 'Validate source canonical format and config',
  },
  remove: {
    fn: removeCommand,
    desc: 'Remove resources [--types=<csv>] [--tools=<list>] [--yes] [--purge]',
  },
};

function showHelp(print = console.log) {
  print(`ai-toolkit v${VERSION}

Usage: ai-toolkit <command> [args]

Commands:`);
  for (const [name, { desc }] of Object.entries(COMMANDS)) {
    print(`  ${name.padEnd(10)} ${desc}`);
  }
  print(`
Global flags:
  --config=<path>    Path to ai-toolkit.config.json. Searched in this order:
                     (1) --config, (2) --global ($HOME/.ai-toolkit/),
                     (3) projectDir/, (4) toolkit bundled.
  --tools=<a,b>      Tools to install (e.g., opencode, claude-code). For init: omit value to use config.default_tools.
                      For sync: omit value = auto-detect from state file (.ai-toolkit.json) with filesystem fallback.
  --types=<csv>      Resource types to install: agents, skills, mcps, rules, commands. Default: all.
  --project=<path>   Target project directory (default: cwd). Use $HOME or absolute path for global installs.
  --global           Boolean. Shorthand for --project=$HOME/.ai-toolkit. Use to install to your user-level config.
  --yes              Boolean. Non-interactive mode: use defaults, don't prompt. Required for destructive commands in CI.
  --help, -h         Show this help
  --version, -v      Show version

Flag types:
  - Value-bearing flags (--tools, --types, --project, --config): --flag alone = use config default.
  - Boolean flags (--yes, --global): --flag alone = true. --yes=false is treated as --yes=true.

Examples:
  # Per-project, explicit tools (recommended)
  ai-toolkit init --tools=opencode,claude-code --project=$PWD

  # Non-interactive (CI mode): use config.default_tools, no prompts
  ai-toolkit init --yes --project=$PWD

  # Global (user-level), explicit tools
  ai-toolkit init --tools=opencode,claude-code --global

  # Combined: explicit tools + non-interactive + global
  ai-toolkit init --tools=opencode,claude-code --global --yes

Note: --tools and --yes are NOT redundant. --tools says "which", --yes says "don't ask". Use --tools for precision, --yes for CI/automation.`);
}

/**
 * Resolve the config path using a fallback chain.
 *
 * Order (Fix 1.4 + 1.5):
 *   1. --config=<path>      explicit (always wins)
 *   2. --global             $HOME/.ai-toolkit/ai-toolkit.config.json (if HOME available)
 *   3. projectDir           <projectDir>/ai-toolkit.config.json (default: cwd)
 *   4. toolkitRoot          <toolkitRoot>/ai-toolkit.config.json (bundled; lets `doctor`
 *                            self-test from any cwd when no project config is nearby)
 *
 * Returns the first path that exists on disk. If none exist, returns the
 * LAST candidate so error messages always have a real path to show.
 */
function resolveConfigPath({ flags, projectDir, toolkitRoot, env = process.env }) {
  if (flags.config) return resolve(flags.config);

  const home = env.HOME || env.USERPROFILE;
  const candidates = [];
  if (flags.global && home) {
    candidates.push(resolve(home, '.ai-toolkit', 'ai-toolkit.config.json'));
  }
  candidates.push(resolve(projectDir, 'ai-toolkit.config.json'));
  candidates.push(resolve(toolkitRoot, 'ai-toolkit.config.json'));

  return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1];
}

/**
 * Main dispatch logic. Exported for unit testing (Fix 2.2).
 *
 * @param {object} args
 * @param {string[]} args.argv     - argv slice (without node / script)
 * @param {object}   [args.env]    - env vars (default: process.env)
 * @param {string}   [args.cwd]    - working directory (default: process.cwd())
 * @param {Function} [args.stdout] - (default: console.log)
 * @param {Function} [args.stderr] - (default: console.error)
 * @param {Function} [args.exit]   - (default: process.exit)
 * @param {object}   [args.commands] - command registry (default: COMMANDS)
 */
export async function dispatch({
  argv,
  env = process.env,
  cwd = process.cwd(),
  stdout = console.log,
  stderr = console.error,
  exit = process.exit,
  commands = COMMANDS,
}) {
  const cmd = argv[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    showHelp(stdout);
    exit(0); // Fix 1.1: --help must exit 0 (POSIX convention)
    return;
  }

  if (cmd === '--version' || cmd === '-v') {
    stdout(VERSION);
    exit(0);
    return;
  }

  if (!commands[cmd]) {
    stderr(`Unknown command: ${cmd}`);
    showHelp(stdout);
    exit(1);
    return;
  }

  const { flags, positional } = parseFlags(argv.slice(1));
  const toolkitRoot = resolve(__dirname, '..');

  // Resolve projectDir: --global → ~/.ai-toolkit/; --project=<path> → <path>; else cwd.
  let projectDir;
  if (flags.global) {
    projectDir = resolve(env.HOME || env.USERPROFILE || process.cwd(), '.ai-toolkit');
  } else if (flags.project) {
    projectDir = resolve(flags.project);
  } else {
    projectDir = cwd;
  }

  const configPath = resolveConfigPath({ flags, projectDir, toolkitRoot, env });

  try {
    const config = existsSync(configPath)
      ? JSON.parse(readFileSync(configPath, 'utf8'))
      : null;
    await commands[cmd].fn({
      flags,
      config,
      configPath,
      projectDir,
      toolkitRoot,
      args: positional,
    });
  } catch (err) {
    stderr(`[${cmd}] Error: ${err.message}`); // Fix 3.1: prefix with command name
    if (env.DEBUG) stderr(err.stack);
    exit(1);
  }
}

async function main() {
  await dispatch({ argv: process.argv.slice(2) });
}

// Only run main() when this file is executed directly, not when imported
// (e.g. by tests). We compare canonical paths so the check survives:
//   - symlinks (npm link, npm install -g, macOS /var → /private/var)
//   - non-existent argv[1] paths (e.g. when imported by tests)
//   - relative vs absolute paths
function canonicalPath(p) {
  if (!p) return '';
  try { return realpathSync(p); }
  catch { return resolve(p); }
}

/**
 * Decide whether this module should run `main()` for the given entry script.
 * Exported for unit testing.
 *
 * @param {string} [argv1]      - process.argv[1] (defaults to real value)
 * @param {string} [moduleUrl]  - import.meta.url (defaults to real value)
 * @returns {boolean}
 */
export function shouldRunMain(argv1 = process.argv[1], moduleUrl = import.meta.url) {
  return canonicalPath(argv1) === canonicalPath(fileURLToPath(moduleUrl));
}

const isMain = shouldRunMain();
if (isMain) main();