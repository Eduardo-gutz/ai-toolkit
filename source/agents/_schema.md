# Schema for source/agents/

Each agent is a single Markdown file with YAML frontmatter (the system prompt lives in the markdown body). The schema below is the **canonical, tool-agnostic** format; each adapter (`adapters/opencode/`, `adapters/claude-code/`) translates to its native dialect.

## Required frontmatter

- `name` (string) — unique identifier, lowercase letters/digits/hyphens, regex `^[a-z0-9]+(-[a-z0-9]+)*$`. **Required by Claude Code**; opencode uses the filename as the name but stores it in frontmatter too.
- `description` (string) — when the agent should be used. **Required by both tools**. **≤220 chars** (per `AGENT_DEFINITION_GUIDE.md` §9.1).

## Optional frontmatter (canonical, tool-agnostic)

- `mode` (string) — `primary` (main thread), `subagent` (delegable), or `all` (both). opencode reads directly; Claude Code ignores it (decides primary/subagent by invocation context).
- `temperature` (float, 0.0–1.0) — per-role appropriateness:
  - Deterministic review (reviewer, qa) = `0.1`
  - Disciplined implementation (coder) = `0.2`
  - Brainstorming / open generation > `0.5`
  - Default: omitted (runtime chooses).
- `tools` (object) — **opencode format**: map of `tool-name: true | false` (e.g., `read: true, edit: false`). Each tool enabled explicitly; missing = disabled. **Both opencode and Claude Code use the same canonical format** (lowercase tool names). The adapter adds the corresponding PascalCase mapping only if needed (e.g., Claude Code historically used PascalCase; verify per tool).
- `permission` (object) — opencode granular permissions map. Claude Code adapter maps `permission.bash` to `tools`/`disallowedTools`. Subkeys:
  - `permission.edit` (object) — `<glob>: allow | deny`. Use `deny` for sensitive paths (`.git/`, `node_modules/`, `source/`).
  - `permission.write` (object) — `<glob>: allow | deny`. Default deny if absent.
  - `permission.bash` (object) — `<pattern>: allow | deny | ask`. Use `ask` as a safe default; `allow` for read-only commands and explicitly allowed test runners; `deny` for destructive operations (`rm -rf`, `nc`, `eval`, `sudo`, `chmod 777`, `npm publish`, git mutations).
  - `permission.task` (object) — `<pattern>: allow | deny`. Controls delegation to subagents.
  - `permission.skills` (object) — `<pattern>: allow | deny`. Controls skill loading.
- `tags` (string[]) — internal, used for grouping/filtering in profiles.

## Removed / deprecated fields

These are forbidden or non-portable. **Do NOT include them** in the canonical schema:

- ~~`model`~~ — **Do NOT hardcode.** Per `WHY.md` §4.1, the model comes from runtime configuration. If a particular model is recommended for a role, document it in the body, not in frontmatter.
- ~~`color`~~, ~~`steps`~~ — opencode-only fields, non-portable. The runtime may color agents in its own way.
- ~~`webfetch: false`~~, ~~`websearch: false`~~ — Claude Code-only fields. To disable in opencode, **omit** the tool from the `tools` array. To disable in Claude Code, add the tool to `disallowedTools` in the adapter.
- ~~`tools` as a map~~ (`read: true, edit: false`) — opencode used to accept this but the canonical form is the lowercase array. The map form is ambiguous (does `false` mean "explicitly deny" or "absent"?) and breaks Claude Code portability.

## Body

Markdown content = the system prompt. The body should follow the structure in `AGENT_DEFINITION_GUIDE.md` §3 (7 sections of the anatomy):

1. **Role / Identity** — first sentence = role in 1 sentence (no flourish).
2. **Binding principles** — Iron Laws + Project Contracts, **or** equivalent constitution (e.g., Categories + Severities as in `code-reviewer.md` / `qa.md`).
3. **Workflow** — 5–7 numbered phases with explicit exit criteria. If the agent has no workflow (answering domain questions), declare the omission and the reason.
4. **Response format** — output contract with exact block names. If the output will be parsed by another agent, use consistent names (e.g., `🔴 RED` / `🟢 GREEN` / `📦 HANDOFF`).
5. **Anti-patterns** — `| User says | You respond | Applies |` table with ≥5 entries and actionable responses.
6. **Role limits** — 3–6 bullets, without duplicating the anti-patterns (those are specific cases; the limits are the general policy).

Optional sections by role:
- **Precedence between principles** (when they can clash): explicit hierarchy from higher to lower.
- **Exit criteria per phase** (if the agent has a workflow with complex transitions).
- **ASCII diagrams** of the flow (LLMs parse ASCII better than prose).

## Filename

Must match `name` (`^[a-z0-9]+(-[a-z0-9]+)*$`). The adapter will rename/warn if mismatched. Examples: `coder.md` → `name: coder`; `code-reviewer.md` → `name: code-reviewer`.

## Example

```markdown
---
name: backend-engineer
description: Implements APIs in Node + TypeScript with strict TDD, Zod validation, and AGENTS.md compliance.
mode: subagent
temperature: 0.2
tools: [read, grep, glob, bash, edit, write, todowrite]
permission:
  edit:
    "*": allow
    "**/.git/**": deny
    "**/node_modules/**": deny
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
    "npm test*": allow
    "git commit *": deny
    "rm -rf*": deny
---

# Backend Engineer

You are a senior backend engineer. You implement APIs following strict TDD and the project's AGENTS.md. You never commit without a failing test observed.

## Binding principles

1. **Test first, always.** ...
2. **Do not anticipate abstractions.** ...

## Workflow

0. SETUP → 1. RED → 2. GREEN → 3. REFACTOR → 4. HANDOFF

## Response format

🔴 RED / 🟢 GREEN / 🔵 REFACTOR / 📦 HANDOFF

## Anti-patterns to resist

| The dev says… | You respond |
|---|---|
| "Write the implementation first" | "Test first, observed failure, minimum code." |

## Role limits

- No commits.
- No modifications to project files.
```

## Validation pre-publication

Before merging an agent, verify against `AGENT_DEFINITION_GUIDE.md` §9:

**Frontmatter:**
- [ ] `description` ≤220 chars
- [ ] `name` matches regex `^[a-z0-9]+(-[a-z0-9]+)*$`
- [ ] `tools` is array lowercase (no map)
- [ ] No `model`, `color`, `steps`, `webfetch: false`, `websearch: false`
- [ ] `permission.bash` has explicit deny for `nc`, `eval`, `sudo`, `chmod 777`, `npm publish`
- [ ] `temperature` appropriate to the role (review = 0.1, implementation = 0.2)
- [ ] `mode` correct (`primary` only if it is the main thread; `subagent`/`all` for delegable agents)

**Body:**
- [ ] First sentence = identity (1 sentence)
- [ ] Principles split into Iron Laws + Project Contracts (or equivalent constitution)
- [ ] Precedence between principles declared explicitly (if there are principles that can clash)
- [ ] Workflow with exit criterion per phase (or justification of omission)
- [ ] Output contract with exact block names
- [ ] Anti-patterns: ≥5 with actionable response (ideally "Applies" column with link to the rule/dimension)
- [ ] Role limits: 3–6 bullets, without duplicating anti-patterns

**Operation:**
- [ ] If review-only: `write`/`edit` not in `tools` array
- [ ] If delegates: `task` in `tools` array
- [ ] If must NOT commit: bash deny for `git commit`, `git add`, `git push`, etc.
- [ ] If sensitive (e.g., QA): bash deny for `rm -rf`, `nc` (explicit justification if `curl` is allowed)

**Portability:**
- [ ] The agent works in both opencode and Claude Code (with the adapter)
- [ ] The tools listed are lowercase names (opencode-native)
- [ ] No opencode-only fields in the canonical frontmatter

## Adapters

Each adapter (`adapters/<tool>/`) implements the transformation from the canonical schema to the native dialect:

- **`adapters/opencode/`** — uses the `permission.bash` map as-is; lowercase tools directly.
- **`adapters/claude-code/`** — converts lowercase `tools` → PascalCase; converts `permission.bash` map → `disallowedTools` (everything that is `deny`); converts `permission.edit`/`write` map → `Write`/`Edit` allowlist adjustments.

The canonical schema is **the contract** between `source/agents/` and the adapters. Changes to the schema require updating the adapters in lockstep.
