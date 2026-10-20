# ai-toolkit

Single source of truth for AI agent configurations (agents, skills, MCPs,
rules, prompts) rendered to multiple AI coding tools via per-tool adapters.

## Architecture

```
SOURCE (this repo)  →  ADAPTERS (one per tool)  →  PROJECT destination
     tool-agnostic         tool-specific            .claude/, .opencode/, …
```

Source content lives in `source/`, one folder per resource type. Adapters in
`adapters/` translate the canonical form into each tool's native format and
write the result into a target project. The CLI in `bin/` orchestrates.

## Supported tools

- **opencode** (`.opencode/agents/`, `.opencode/skills/`, `opencode.json`, `AGENTS.md`)
- **claude-code** (`.claude/agents/`, `.claude/skills/`, `.mcp.json`, `CLAUDE.md` + `AGENTS.md`)

## Layout

```
ai-toolkit/
├── source/
│   ├── agents/      Markdown files w/ YAML frontmatter (canonical agent defs)
│   ├── skills/      Agent Skills standard format (one folder per skill)
│   ├── mcps/        Canonical MCP server definitions (JSON)
│   ├── rules/       Rule files (markdown) merged into AGENTS.md/CLAUDE.md
│   └── prompts/     Reusable prompt templates
│
├── adapters/
│   ├── _shared/     Cross-adapter helpers (renderers, transformers)
│   ├── opencode/    opencode adapter
│   └── claude-code/ Claude Code adapter
│
├── bin/             CLI entry point
├── tests/           Golden-file tests for each adapter
├── ai-toolkit.config.json
├── package.json
└── README.md
```

## Design principles

1. **Skills are portable.** Source uses the
   [Agent Skills](https://agentskills.io/) open spec — frontmatter
   `name`+`description` minimum, plus `license`, `compatibility`, `metadata`,
   `allowed-tools`. The same files render to Claude Code, opencode, Cursor,
   GitHub Copilot, etc.
2. **Rules are written once** as `AGENTS.md`. Claude Code gets a `CLAUDE.md`
   that imports it via `@AGENTS.md` (or a symlink).
3. **Agents and MCPs need translation** — each tool has its own shape. The
   canonical form is in `source/`; adapters transform per tool.
4. **No generated files are committed** to consuming projects — regenerate
   with the CLI.

## Init behavior

`init` manages the target project's `.gitignore` for you. After installing
for each tool that succeeded, it ensures the file contains a managed
marker block (`# >>> ai-toolkit (managed — do not edit between markers) >>>` /
`# <<< ai-toolkit <<<`) listing the per-tool directories (`.opencode/`,
`.claude/`), the rules body (`AGENTS.md`), `CLAUDE.md` (when Claude Code
is installed), and the state file (`.ai-toolkit.json` by default, or your
custom `install.state_file`). Existing user content outside the markers is
preserved verbatim, and a second `init` against the same project is a
no-op (the block is replaced in place, never duplicated). `sync` and
`remove` deliberately leave `.gitignore` alone.

## Status

**Shipped**: Phase 0 (design) + Phase 1 (opencode adapter + CLI) + Phase 2 (claude-code adapter + shared helpers) + Phase 0.5 (security hardening: path traversal closed, adapter injection closed for all commands after loadAdapter migration, value-less flag crashes fixed).

**Next**: Phase 1.5 — interactive init fix (`select` → `checkbox`) + `CLAUDE.md` with `@AGENTS.md` import.

Test status: **380/380 passing** (+11 gitignore-management tests).

See `.context/WHY.md` for the full design history and roadmap.
