#!/usr/bin/env node
// bin/ai-toolkit.mjs — main CLI entry point
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCommand } from './commands/init.mjs';
import { syncCommand } from './commands/sync.mjs';
import { listCommand } from './commands/list.mjs';
import { validateCommand } from './commands/validate.mjs';
import { doctorCommand } from './commands/doctor.mjs';
import { addCommand } from './commands/add.mjs';
import { removeCommand } from './commands/remove.mjs';

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
  list: {
    fn: listCommand,
    desc: 'List installed resources [--tools=opencode,claude-code]',
  },
  validate: {
    fn: validateCommand,
    desc: 'Validate source canonical format and config',
  },
  doctor: {
    fn: doctorCommand,
    desc: 'Diagnose installer health (tool version, env, paths)',
  },
  add: {
    fn: addCommand,
    desc: 'Add a resource to the target project <type>name>',
  },
  remove: {
    fn: removeCommand,
    desc: 'Remove a resource from the target project <type>name>',
  },
};

function showHelp() {
  console.log(`ai-toolkit v${VERSION}

Usage: ai-toolkit <command> [args]

Commands:`);
  for (const [name, { desc }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(10)} ${desc}`);
  }
  console.log(`
Global flags:
  --config=<path>    Path to ai-toolkit.config.json (default: ./ai-toolkit.config.json)
  --tools=<a,b>      Tools to install (e.g., opencode,claude-code). Overrides config.default_tools.
  --profile=<name>   Override profile (minimal, backend, etc.)
  --project=<path>   Target project directory (default: cwd). Use $HOME or absolute path for global installs.
  --global           Shorthand for --project=$HOME/.ai-toolkit. Use to install to your user-level config.
  --yes              Non-interactive: use defaults, don't prompt. Implies config.default_tools if --tools not given.
  --help, -h         Show this help
  --version, -v      Show version

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

function loadConfig(configPath) {
  const resolved = resolve(configPath);
  if (!existsSync(resolved)) {
    throw new Error(`Config not found at ${resolved}. Run \`ai-toolkit init\` first.`);
  }
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value;
    } else if (arg.startsWith('--')) {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[arg.slice(2)] = next;
        i++;
      } else {
        flags[arg.slice(2)] = true;
      }
    }
  }
  return flags;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    showHelp();
    process.exit(cmd ? 1 : 0);
  }

  if (cmd === '--version' || cmd === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  if (!COMMANDS[cmd]) {
    console.error(`Unknown command: ${cmd}`);
    showHelp();
    process.exit(1);
  }

  const flags = parseFlags(args.slice(1));
  const positional = args.slice(1).filter((a) => !a.startsWith('--'));
  const configPath = flags.config
    ? resolve(flags.config)
    : resolve(__dirname, '../ai-toolkit.config.json');

  // Resolve projectDir: --global → ~/.ai-toolkit/; --project=<path> → <path>; else cwd.
  let projectDir;
  if (flags.global) {
    projectDir = resolve(process.env.HOME || process.env.USERPROFILE || process.cwd(), '.ai-toolkit');
  } else if (flags.project) {
    projectDir = resolve(flags.project);
  } else {
    projectDir = process.cwd();
  }

  // Toolkit root = where the CLI binary lives (bin/..).
  const toolkitRoot = resolve(__dirname, '..');

  try {
    const config = existsSync(configPath) ? loadConfig(configPath) : null;
    await COMMANDS[cmd].fn({
      flags,
      config,
      configPath,
      projectDir,
      toolkitRoot,
      args: positional,
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();