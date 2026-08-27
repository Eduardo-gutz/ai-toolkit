# Schema for source/agents/

Each agent is a single Markdown file with YAML frontmatter (the system prompt lives in the markdown body). The schema below is the **canonical, tool-agnostic** format; each adapter (`adapters/opencode/`, `adapters/claude-code/`) translates to its native dialect.

## Required frontmatter

- `name` (string) — unique identifier, lowercase letters/digits/hyphens, regex `^[a-z0-9]+(-[a-z0-9]+)*$`. **Required by Claude Code**; opencode uses the filename as the name but stores it in frontmatter too.
- `description` (string) — when the agent should be used. **Required by both tools**. **≤220 chars** (per `AGENT_DEFINITION_GUIDE.md` §9.1).

## Optional frontmatter (canonical, tool-agnostic)

- `mode` (string) — `primary` (main thread), `subagent` (delegable), or `all` (both). opencode reads directly; Claude Code ignores it (decides primary/subagent by invocation context).
- `temperature` (float, 0.0–1.0) — per-role appropriateness:
  - Revisión determinista (reviewer, qa) = `0.1`
  - Implementación disciplinada (coder) = `0.2`
  - Brainstorming / generación abierta > `0.5`
  - Default: omitted (runtime chooses).
- `tools` (object) — **opencode format**: map of `tool-name: true | false` (e.g., `read: true, edit: false`). Each tool enabled explicitly; missing = disabled. **Both opencode and Claude Code use the same canonical format** (lowercase tool names). The adapter adds the corresponding PascalCase mapping only if needed (e.g., Claude Code historically used PascalCase; verify per tool).
- `permission` (object) — opencode granular permissions map. Claude Code adapter maps `permission.bash` to `tools`/`disallowedTools`. Subkeys:
  - `permission.edit` (object) — `<glob>: allow | deny`. Use `deny` for sensitive paths (`.git/`, `node_modules/`, `source/`).
  - `permission.write` (object) — `<glob>: allow | deny`. Default deny if absent.
  - `permission.bash` (object) — `<pattern>: allow | deny | ask`. Use `ask` as safe default; `allow` for read-only commands and explicitly-allowed test runners; `deny` for destructive operations (`rm -rf`, `nc`, `eval`, `sudo`, `chmod 777`, `npm publish`, git mutations).
  - `permission.task` (object) — `<pattern>: allow | deny`. Controls delegation to subagents.
  - `permission.skills` (object) — `<pattern>: allow | deny`. Controls skill loading.
- `tags` (string[]) — internal, used for grouping/filtering in profiles.

## Removed / deprecated fields

These are forbidden or non-portable. **Do NOT include them** in the canonical schema:

- ~~`model`~~ — **Do NOT hardcode.** Per `WHY.md` §4.1, the model comes from runtime configuration. If a particular model is recommended for a role, document it in the body, not in frontmatter.
- ~~`color`~~, ~~`steps`~~ — opencode-only fields, non-portable. The runtime may color agents in its own way.
- ~~`webfetch: false`~~, ~~`websearch: false`~~ — Claude Code-only fields. To disable in opencode, **omit** the tool from the `tools` array. To disable in Claude Code, add the tool to `disallowedTools` in the adapter.
- ~~`tools` as a map~~ (`read: true, edit: false`) — opencode used to accept this but the canonical form is the lowercase array. Map form is ambiguous (does `false` mean "explicitly deny" or "absent"?) and breaks Claude Code portability.

## Body

Markdown content = the system prompt. The body should follow the structure in `AGENT_DEFINITION_GUIDE.md` §3 (7 secciones de la anatomía):

1. **Rol / Identidad** — primera frase = rol en 1 oración (sin floritura).
2. **Principios vinculantes** — Leyes de Hierro + Contratos del Proyecto, **o** constitución equivalente (e.g., Categorías + Severidades como en `code-reviewer.md` / `qa.md`).
3. **Flujo de trabajo** — 5–7 fases numeradas con criterio de salida explícito. Si el agente no tiene flujo (responder preguntas de un dominio), declarar omisión y razón.
4. **Formato de respuesta** — output contract con bloques de nombre exacto. Si el output será parseado por otro agent, usar nombres consistentes (e.g., `🔴 ROJO` / `🟢 VERDE` / `📦 HANDOFF`).
5. **Anti-patrones** — tabla `| Usuario dice | Tú respondes | Aplica |` con ≥5 entradas y respuestas accionables.
6. **Límites del rol** — 3–6 bullets, sin duplicar los anti-patrones (esos son casos específicos; los límites son la política general).

Secciones opcionales según el rol:
- **Precedencia entre principios** (cuando pueden chocar): jerarquía explícita de mayor a menor.
- **Criterios de salida por fase** (si el agente tiene flujo con transiciones complejas).
- **Diagramas ASCII** del flujo (los LLMs parsean mejor ASCII que prosa).

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

# Backend Engineer (ES)

You are a senior backend engineer. You implement APIs following TDD strict and the project's AGENTS.md. You never commit without a failing test observed.

## Principios vinculantes

1. **Test primero, siempre.** ...
2. **No anticipar abstracciones.** ...

## Flujo de trabajo

0. SETUP → 1. ROJO → 2. VERDE → 3. REFACTOR → 4. HANDOFF

## Formato de respuesta

🔴 ROJO / 🟢 VERDE / 🔵 REFACTOR / 📦 HANDOFF

## Anti-patrones a resistir

| El dev dice… | Tú respondes |
|---|---|
| "Escribe la implementación primero" | "Test primero, fallo observado, código mínimo." |

## Límites del rol

- No haces commits.
- No modificas archivos del proyecto.
```

## Validation pre-publication

Before merging an agent, verify against `AGENT_DEFINITION_GUIDE.md` §9:

**Frontmatter**:
- [ ] `description` ≤220 chars
- [ ] `name` matches regex `^[a-z0-9]+(-[a-z0-9]+)*$`
- [ ] `tools` is array lowercase (no map)
- [ ] Sin `model`, `color`, `steps`, `webfetch: false`, `websearch: false`
- [ ] `permission.bash` tiene deny explícito para `nc`, `eval`, `sudo`, `chmod 777`, `npm publish`
- [ ] `temperature` apropiado al rol (revisión = 0.1, implementación = 0.2)
- [ ] `mode` correcto (`primary` solo si es el main thread; `subagent`/`all` para agentes delegables)

**Cuerpo**:
- [ ] Primera frase = identidad (1 oración)
- [ ] Principios divididos en Leyes de Hierro + Contratos del Proyecto (o constitución equivalente)
- [ ] Precedencia entre principios declarada explícitamente (si hay principios que pueden chocar)
- [ ] Flujo de trabajo con criterio de salida por fase (o justificación de omisión)
- [ ] Output contract con bloques de nombre exacto
- [ ] Anti-patrones: ≥5 con respuesta accionable (idealmente columna "Aplica" con vínculo a la regla/dimensión)
- [ ] Límites del rol: 3–6 bullets, sin duplicar anti-patrones

**Operación**:
- [ ] Si review-only: `write`/`edit` no en `tools` array
- [ ] Si delega: `task` en `tools` array
- [ ] Si NO debe commits: bash deny para `git commit`, `git add`, `git push`, etc.
- [ ] Si sensible (e.g., QA): bash deny para `rm -rf`, `nc` (justificación explícita si `curl` se permite)

**Portabilidad**:
- [ ] El agent funciona tanto en opencode como en Claude Code (con el adapter)
- [ ] Las tools listadas son nombres lowercase (opencode-native)
- [ ] Sin campos opencode-only en el frontmatter canónico

## Adapters

Cada adapter (`adapters/<tool>/`) implementa la transformación del schema canónico al dialecto nativo:

- **`adapters/opencode/`** — usa `permission.bash` map tal cual; tools lowercase directos.
- **`adapters/claude-code/`** — convierte `tools` lowercase → PascalCase; convierte `permission.bash` map → `disallowedTools` (todo lo que sea `deny`); convierte `permission.edit`/`write` map → ajustes de `Write`/`Edit` allowlist.

El schema canónico es **el contrato** entre `source/agents/` y los adapters. Cambios al schema requieren actualizar los adapters en lockstep.
