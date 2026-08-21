# Schema for source/skills/

Each skill is a folder containing a `SKILL.md` file, following the
[Agent Skills](https://agentskills.io/) open standard.

## Layout

```
my-skill/
├── SKILL.md           # Required: metadata + instructions
├── scripts/           # Optional: executable code
├── references/        # Optional: docs loaded on demand
├── assets/            # Optional: templates, images, etc.
└── ...                # Any other files
```

## Required SKILL.md frontmatter

- `name` (string) — matches the folder name. Regex `^[a-z0-9]+(-[a-z0-9]+)*$`,
  1-64 chars.
- `description` (string) — what the skill does and when to use it. 1-1024
  chars. Combined with `when_to_use` (if present) capped at 1536 chars in
  Claude Code listings.

## Optional SKILL.md frontmatter (Agent Skills spec, portable)

- `license` (string) — license name
- `compatibility` (string, ≤500 chars) — intended products / system reqs
- `metadata` (object) — free-form key/value
- `allowed-tools` (string) — space- or comma-separated list

## Optional Claude Code extensions (NOT portable to opencode at full fidelity)

- `when_to_use`, `argument-hint`, `arguments`
- `disable-model-invocation`, `user-invocable`
- `disallowed-tools`, `model`, `effort`
- `context` (`fork`), `agent`, `background`
- `hooks`, `paths`, `shell`

opencode ignores unknown frontmatter fields, so Claude Code extensions are
safe to include — they just won't have an effect on opencode.

## Body

Markdown instructions. Use `` !`command` `` for shell output injection
(supported by both opencode and Claude Code) and `@path/to/file` for file
references (Claude Code native; opencode uses the same syntax).

## Install target

By default, the claude-code adapter writes to `.claude/skills/<name>/`. The
opencode adapter can write there too, OR to `.opencode/skills/<name>/`.
opencode reads from `.claude/skills/` natively, so installing only to
`.claude/skills/` is the simplest cross-tool approach.

## Example

```
source/skills/backend-general/
└── SKILL.md
```

```markdown
---
name: backend-general
description: General backend engineering conventions for Node + TypeScript APIs
license: MIT
compatibility: opencode, claude-code
allowed-tools: Read, Grep, Glob
---

When implementing backend code:

- Use TypeScript strict mode
- Validate inputs with Zod
- ...
```
