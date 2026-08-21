# Shared adapter helpers

Cross-adapter utilities. Each helper is a single module with a clear
purpose; adapters import what they need.

## Planned modules (Phase 1+)

- `frontmatter.mjs` — parse/validate YAML frontmatter, expose helpers for
  required fields per resource type.
- `canonical-mcp.mjs` — load + validate canonical MCP definitions from
  `source/mcps/`. Provides the shape adapters consume.
- `mcp-transform.mjs` — pure functions: `canonicalToOpencode(def)` and
  `canonicalToClaudeCode(def)`. No I/O — easy to unit test.
- `skills-walker.mjs` — walk `source/skills/<name>/SKILL.md`, validate
  frontmatter against Agent Skills spec.
- `agents-walker.mjs` — walk `source/agents/<name>.md`, validate canonical
  agent schema.
- `rules-renderer.mjs` — concat rule files into `AGENTS.md` body.
- `state.mjs` — read/write `.ai-toolkit.json` state file in target project.
- `merge-strategy.mjs` — decide merge vs replace vs symlink per resource.

## Conventions

- ES modules (`type: module` in package.json).
- Pure functions where possible (no hidden I/O).
- Throws with helpful messages on validation errors.
- Each helper has a sibling test in `tests/`.
