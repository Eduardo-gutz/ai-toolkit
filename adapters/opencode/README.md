# opencode adapter

Translates canonical source content into opencode's native formats and
writes them into the target project.

## Targets (relative to project root)

- **Agents** → `.opencode/agents/<name>.md`
  - Frontmatter: `description` (req), `mode`, `model`, `permission`, etc.
  - Filename = agent name.
- **Skills** → `.claude/skills/<name>/SKILL.md` (recommended; shared with
  Claude Code) OR `.opencode/skills/<name>/SKILL.md`.
  - opencode reads both, and also `.claude/skills/` for compat. Default to
    `.claude/skills/` for cross-tool sharing.
- **Rules** → `AGENTS.md` at project root.
- **MCPs** → `opencode.json` under `mcp`. Merge with any existing project
  config (don't clobber unrelated keys).
- **Commands** → `.opencode/commands/<name>.md` (Phase 1+).

## opencode quirks to remember

- Config files are MERGED, not replaced. Adapter must merge `opencode.json`
  with whatever exists, not overwrite.
- Frontmatter `tools` (deprecated) → use `permission` map instead.
- `permission` map supports per-tool glob patterns.
- MCP `type: "local"`/`"remote"` (NOT `stdio`/`http`).
- opencode LEE `.claude/skills/` — no need to duplicate.

## Adapter contract

```js
export async function install({ source, target, config }) { /* … */ }
export async function sync({ source, target, config }) { /* … */ }
export async function remove({ target, config }) { /* … */ }
export async function validate({ source, config }) { /* … */ }
```

Implementation status: planned (Phase 1).
