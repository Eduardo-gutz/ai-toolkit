# bin/

CLI entry points. `bin/ai-toolkit.mjs` is the main command.

## Commands

```
ai-toolkit init [--tools=opencode,claude-code] [--project=<path>] [--global] [--yes]
ai-toolkit sync [--tools=<list>] [--project=<path>] [--global]
ai-toolkit validate [--tools=<list>]
ai-toolkit remove [<type> [<name>]] [--types=<csv>] [--tools=<list>] [--yes] [--purge]
```

## Status

**Shipped**: 4 commands implemented (init, sync, validate, remove; Fases 0, 0.5, 1, 2).

Flag types (Fase 0.5):
- **Value-bearing** (`--tools`, `--project`, `--config`): value-less = use config default.
- **Boolean** (`--yes`, `--global`): presence = true. `--yes=false` is treated as `--yes=true` (the flag has no "off" state).
