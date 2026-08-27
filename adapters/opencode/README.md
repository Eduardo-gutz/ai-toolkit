# opencode adapter

Translates canonical source content into opencode's native formats and
writes them into the target project.

## Targets (relative to project root)

- **Agents** → `.opencode/agents/<name>.md`
  - Frontmatter: `description` (req), `mode`, `model`, `permission`, etc.
  - Filename = agent name.
- **Skills** → `.opencode/skills/<name>/SKILL.md` (opencode native path).
  - When installing for claude-code too, skills go to `.claude/skills/` (Claude Code's native path). Each tool reads from its own folder.
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
- (Old compat note: opencode used to read from `.claude/skills/` for compat. We now use the native `.opencode/skills/` path.)

## Adapter contract

```js
export async function install({ source, target, config }) { /* … */ }
export async function sync({ source, target, config }) { /* … */ }
export async function remove({ target, config }) { /* … */ }
export async function validate({ source, config }) { /* … */ }
```

Implementation status: planned (Phase 1).
