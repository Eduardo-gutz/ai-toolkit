# Claude Code adapter

Translates canonical source content into Claude Code's native formats and
writes them into the target project.

## Targets (relative to project root)

- **Agents (subagents)** → `.claude/agents/<name>.md`
  - Frontmatter REQ: `name`, `description`.
  - Filename does NOT need to match name (name is in frontmatter).
- **Skills** → `.claude/skills/<name>/SKILL.md`. Same Agent Skills spec
  as opencode reads.
- **Rules** → `CLAUDE.md` at project root, importing `AGENTS.md` via
  `@AGENTS.md` (or symlink). The adapter generates both files; `AGENTS.md`
  holds the rules body, `CLAUDE.md` is a 2-line stub that imports it.
- **MCPs** → `.mcp.json` at project root, under `mcpServers`. Variable
  expansion uses `${VAR}` syntax (not `{env:VAR}`).
- **Commands** → legacy `.claude/commands/<name>.md` OR equivalent skills
  in `.claude/skills/`. Phase 1 will use commands for simplicity.

## Claude Code quirks

- **`name` in agent frontmatter REQUIRED**, must be lowercase + hyphens,
  regex `^[a-z0-9]+(-[a-z0-9]+)*$`. No `:` allowed (reserved for plugin
  namespaces).
- **`tools` is an allowlist**; `disallowedTools` is denylist.
- **MCP `type`**: `stdio`/`http`/`sse`/`ws` (NOT `local`/`remote`).
- **`.mcp.json` requires workspace trust** on first run — note this in
  installer output.
- **MCP variable expansion**: `${VAR}` and `${VAR:-default}` (not
  `{env:VAR}`).
- **Custom commands merged into skills** — `.claude/commands/deploy.md` ≡
  `.claude/skills/deploy/SKILL.md`. Phase 1 prefers the skills form.

## Adapter contract

```js
export async function install({ source, target, config }) { /* … */ }
export async function sync({ source, target, config }) { /* … */ }
export async function remove({ target, config }) { /* … */ }
export async function validate({ source, config }) { /* … */ }
```

Implementation status: planned (Phase 1, after opencode adapter validates
the canonical shape).
