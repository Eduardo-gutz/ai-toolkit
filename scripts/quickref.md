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
│   └── agents/            # Copies of source/agents/*.md
└── .claude/
    ├── agents/            # Copies of source/agents/*.md (named same)
    └── skills/            # Copies of source/skills/*/SKILL.md
```

> **All files are copies** → changes in the toolkit source require `sync` to be picked up (no live change detection; trade-off for stability across npx cache cleans).

## 📋 Commands

| Command | Use case |
|---|---|
| `init --tools=...` | First-time install in a project |
| `sync` | Re-install (idempotent); pick up new resources |
| `validate` | Check source integrity (no I/O) |
| `remove <type> <name>` | Remove a specific resource |

## 🔧 Common flags

| Flag | Effect |
|---|---|
| `--tools=opencode,claude-code` | **For init**: override target tools (default: `config.default_tools`). **For sync**: omit value = auto-detect from `.ai-toolkit.json` state file (filesystem fallback when state is empty). |
| `--project=<path>` | Target project directory (default: cwd) |
| `--global` | Shorthand for `--project=$HOME/.ai-toolkit` (user-level) |
| `--config=<path>` | Path to `ai-toolkit.config.json` (default: toolkit's own) |
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

Each target has its **own independent state file**. They don't interfere with each other.

## 🧪 Test

```bash
npm test                                    # 330 tests, all passing
node --test $(find tests -name '*.test.mjs')  # Same, explicit
```

**Coverage notes**:
- `parseFlags` (Fase 0.5): 23 unit tests cover happy path + value-less flags + boolean flags + `--config=path/with=equals.json` + POSIX separator.
- `loadAdapter` (Fase 0): 9 tests cover whitelist (rejects tools not in `config.tools`), path-traversal, absolute paths, empty config.
- `remove-safety` (Fase 0): 9 tests use a **sentinel** directory outside the project to verify `remove skills ..` cannot escape.
- `parse-tools-flag` (Fase 0.5): 11 tests cover null/false/empty/number/array/object/true.

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

