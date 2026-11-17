# Imports

Copied verbatim from zuma_pos/.opencode/ (2026-08-21). These will be adapted over time as the canonical schema and adapters evolve (Phase 1+).

## Source mapping

| Destination | Source (zuma_pos/.opencode/) |
|---|---|
| `agents/coder.md`         | `agents/coder.md` (314 lines) |
| `agents/code-reviewer.md` | `agents/code-reviewer.md` (174 lines) |
| `agents/qa.md`            | `agents/qa.md` (362 lines) |
| `agents/orchestator.md`   | `agents/orchestator.md` (487 lines) |
| `agents/task-planner.md`  | `agents/task-planner.md` (192 lines) |
| `agents/task-builder.md`  | `agents/task-builder.md` (64 lines) |
| `skills/frontend/`        | `skills/frontend/SKILL.md` (196 lines) |
| `skills/backend/`         | `skills/backend/SKILL.md` (267 lines) |
| `skills/typescript/`      | `skills/typescript/SKILL.md` + 6 references (1,319 lines total) |
| `skills/react-native-expo/` | `skills/react-native-expo/SKILL.md` + 6 references (2,297 lines total) |
| `skills/adb-qa/`          | `skills/adb-qa/SKILL.md` + 4 references (zuma_pos-specific, see below) |
| `skills/frontend-design/` | `skills/frontend-design/SKILL.md` + LICENSE.txt (Anthropic official) |

## Notes

- **Frontmatter**: agents use opencode format (`mode`, `permission` map, `tools` as keys). The Claude Code adapter will transform these.
- **Language**: agents and skills body are in English. Kept as-is; internationalization is not in scope.
- **`disable-model-invocation: true`** on `typescript` and `react-native-expo` is a Claude Code extension field. opencode ignores unknown frontmatter fields, so it is portable, but the signal is lost on the opencode side.
- **`adb-qa` skill** is hardcoded to `com.egsolutions.zumapos` package name. Generalize in a future iteration; kept as-is for now since it is the reference implementation.

## Not imported (project-specific, not toolkit)

- `AGENTS.md` — project rules for zuma_pos, not the toolkit.
- `skills-lock.json` — project metadata.
- `.opencode/package.json`, `.opencode/package-lock.json`, `.opencode/node_modules/` — opencode runtime.
- `.opencode/plans/` — generated implementation plans. **Not imported**; kept as a historical record of the `zuma_pos` repo. Plans now live at `.tasks/<prefix>-<id>/plan.md`.
- `.opencode/skills/adb-qa-workspace/` — workspace artifacts from a specific iteration (review.html, grading JSON).
