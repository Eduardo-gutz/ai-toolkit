# Schema for source/agents/

Each agent is a single Markdown file with YAML frontmatter.

## Required frontmatter

- `name` (string) — unique identifier, lowercase letters/digits/hyphens,
  regex `^[a-z0-9]+(-[a-z0-9]+)*$`. This is required by Claude Code;
  opencode uses the filename as the name but stores it in frontmatter too.
- `description` (string) — when the agent should be used. Required by both
  opencode and Claude Code. Keep under 1024 chars.

## Optional frontmatter (canonical, tool-agnostic)

- `mode` (string) — `primary`, `subagent`, or `all`. opencode reads this
  directly; Claude Code ignores it (Claude Code decides primary/subagent by
  where it's invoked from).
- `model` (string) — full model ID like `anthropic/claude-sonnet-4-5` or
  alias `sonnet`, `opus`, `haiku`. Read by both.
- `prompt` (string) — full system prompt. May also live in the markdown body
  (the body itself becomes the prompt).
- `tools` (string[]) — Claude Code allowlist of tool names.
- `permission` (object) — opencode granular permissions map. Adapter maps
  to `tools`/`disallowedTools` for Claude Code.
- `tags` (string[]) — internal, used for grouping/filtering.

## Body

Markdown content = the system prompt. Use `$ARGUMENTS` or `${name}` style
placeholders only if the agent is also invoked as a command (rare).

## Filename

Should match `name`. The adapter will rename/warn if mismatched.

## Example

```markdown
---
name: backend-engineer
description: Implements APIs, services, and business logic in Node + TypeScript
mode: subagent
model: sonnet
tools: [Read, Write, Edit, Bash, Glob, Grep]
permission:
  bash: allow
  edit: allow
---

You are a senior backend engineer. Follow these conventions:
- Use TypeScript strict mode
- Validate inputs with Zod
- ...
```
