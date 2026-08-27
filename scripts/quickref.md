# Quick Reference — ai-toolkit CLI

> The installer is `bin/ai-toolkit.mjs`. All commands run from the toolkit repo.

## ⚙️ Setup (first time only)

```bash
# Install dependencies
npm install
```

## 🧪 Demo (clean, reproducible)

```bash
bash scripts/test-installer.sh                 # Uses /tmp/ai-toolkit-demo
bash scripts/test-installer.sh /tmp/my-test    # Custom target
```

## 🚀 Using the installer in a real project

### Install everything (opencode + claude-code)

```bash
# From your project root
node /path/to/ai-toolkit/bin/ai-toolkit.mjs init \
  --tools=opencode,claude-code \
  --project=$PWD \
  --yes
```

### What you get in your project

```
<your-project>/
├── .ai-toolkit.json       # State file (tracks installations)
├── AGENTS.md              # Rules (concatenated, both tools)
├── CLAUDE.md              # Claude Code only — imports AGENTS.md
├── .opencode/
│   └── agents/            # Symlinks to source/agents/*.md
└── .claude/
    ├── agents/            # Symlinks to source/agents/*.md (named same)
    └── skills/            # Symlinks to source/skills/*/SKILL.md
```

> **All files are copies** → changes in the toolkit source require `sync` to be picked up (no live change detection; trade-off for stability across npx cache cleans).

## 📋 Commands

| Command | Use case |
|---|---|
| `init --tools=...` | First-time install in a project |
| `sync` | Re-install (idempotent); pick up new resources |
| `list` | Show what's installed in the project |
| `validate` | Check source integrity (no I/O) |
| `doctor` | Diagnose installer health |
| `add <type> <name>` | Add a specific resource (e.g., `add agents coder`) |
| `remove <type> <name>` | Remove a specific resource |

## 🔧 Common flags

| Flag | Effect |
|---|---|
| `--tools=opencode,claude-code` | Override target tools (default: `config.default_tools`) |
| `--project=<path>` | Target project directory (default: cwd) |
| `--global` | Shorthand for `--project=$HOME/.ai-toolkit` (user-level) |
| `--config=<path>` | Path to `ai-toolkit.config.json` (default: toolkit's own) |
| `--profile=<name>` | Use a specific profile from config |
| `--yes` | Skip interactive prompts (CI mode) |
| `--help` | Show help |
| `--version` | Show version |

## 🌐 Per-project vs global

The installer can target any directory — the distinction is just where symlinks point.

| Mode | Command | What happens |
|---|---|---|
| **Per-project** (typical) | `init --project=$PWD` | Symlinks point to source. Project has its own `.ai-toolkit.json` state file. |
| **Global** (user-level) | `init --global` | Symlinks point to source. State file goes to `~/.ai-toolkit/.ai-toolkit.json`. Affects all your projects that symlink to `~/.ai-toolkit/`. |
| **Custom** | `init --project=$HOME/.config/ai-toolkit` | Same as global, but at a different path. |

Each target has its **own independent state file**. They don't interfere with each other. Use `list` with the same flag to see what's in each:

```bash
ai-toolkit list --project=$PWD          # What's in this project
ai-toolkit list --global                # What's in user-level
```

## 🧪 Test

```bash
npm test                                    # 28 tests, all passing
node --test $(find tests -name '*.test.mjs')  # Same, explicit
```

## 🔍 Inspect what was installed

```bash
# See the state file
cat .ai-toolkit.json

# See installed files (all are regular files, NOT symlinks)
find .opencode .claude -type f
```

## ✅ Validate source integrity

```bash
# Validate frontmatter in source/ (catches YAML issues before install)
npm run validate:frontmatter

# Or use the script directly:
node scripts/validate-frontmatter.mjs
```

This catches:
- Missing `name` or `description` fields
- Invalid `name` (regex `^[a-z0-9]+(-[a-z0-9]+)*$`)
- Mismatched filename/folder vs `name`
- Description too long (agent: >220, skill: >1024)
- YAML parse errors (unquoted `:`, unclosed quotes, etc.)

Exit 0 = all OK; exit 1 = errors (listed in output).

## ⚠️ Known issues with source

Several source files have malformed YAML frontmatter and are **skipped with warnings** (not failed):

- `source/agents/qa.md` (description has unquoted `:`)
- `source/agents/task-builder.md`
- `source/skills/{adb-qa,backend,frontend}.md` (descriptions have unquoted `:` and `()`)

To fix, quote the `description:` value: `description: "..."` (or use `>` block scalar).
