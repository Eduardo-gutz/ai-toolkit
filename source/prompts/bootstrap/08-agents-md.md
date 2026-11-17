# Agents.md: generate `AGENTS.md` (root)

You are an AI agent. Your job is to generate **a single file** at the
root of the target repo: `AGENTS.md`.

This is the **last** sub-prompt of the bootstrap. Its output references
all `.context/` files generated in the previous steps.

## Inputs

- Target repo: path of the repo to analyze.
- Discovery JSON: the complete JSON produced by `02-discovery.md`. You
  especially need `repo` (to detect the stack and describe the project
  in one line), `existing_docs` (so you do not overwrite a previous
  `AGENTS.md`), and `samples` (to anchor the rules).
- List of `.context/*.md` files generated in steps 2 to 6
  (`stack.md`, `architecture.md`, `code-style.md`, `conventions.md`).
  Omit any the conductor skipped.
- List of `.context/examples/*.md` files generated in step 6.

## Output

**A single file**: `<repo>/AGENTS.md` (project root).

### Idempotency rules (important)

Unlike the other sub-prompts, `AGENTS.md` usually **exists already**
(may have been created by a human or by a previous bootstrap run).

**The file is edited only when strictly necessary.** On a re-run, if the
existing `AGENTS.md` already satisfies the rules **and** the
`## Context index` matches the `.context/` artifacts actually present,
you **must leave the file byte-identical** — no rewrite, no reformat,
no reordering, no re-stamping. Report **"no change"** to the conductor.
This is the **default outcome of a repeat run** — it is not an error and
not a warning.

Rules:

1. **If it does not exist** → generate from scratch.
2. **If it exists and has recognizable format** (header `# AGENTS.md`,
   sections for "Forbidden", "Scope", "Priority") → **merge**, and the
   merge is **diff-based and minimal**:
   - Keep every existing section the new output does not define.
   - Do not rewrite a section the new output defines unless its content
     actually changed.
   - Keep the custom sections of the current file that are not in the
     new output (internal links, extra rules, credentials, contacts).
   - Replace or add only the sections the new output defines.
3. **If it exists but has no recognizable format** (it is notes,
   link-only, etc.) → **ask the user** before overwriting. Show them
   the proposed diff section by section.
4. **Edit only when strictly necessary** — exactly one of these triggers
   fires:
   1. a **new rule** was confirmed or derived from the repo, or a
      previously `[pending]` rule was resolved;
   2. the developer **overrode** a rule;
   3. a `.context/` artifact was **added or removed** (then the index
      table gains or loses exactly the corresponding row — nothing else
      changes);
   4. the user explicitly asked for a change to it.

   When none of them fires → report **"no change"** and do not touch the
   file.

In any case, return to the conductor a note about what you did
(generate from scratch / merge / ask / no change).

## Absolute rules

- Do not invent: if you did not find a rule in the code or in the
  discovery JSON, declare it as "pending" or "not found".
- Do not copy rules from other projects. Analyze ONLY this repo.
- Do not add emojis (UX/voice decision, not the agent's).
- Cite real paths with `path/to/file:line`.
- The header must be **~10-15 lines**, not bloated with welcome text
  or decoration.
- The tone must be concise and factual. No verbosity.
- Prohibitive rules must be **specific and verifiable**, not generic
  ("don't use bad practices" is bad, "don't use `any` in TypeScript"
  is good).

### AGENTS.md is an index, not a living context

`AGENTS.md` holds **only** two things:

1. **The rules** — the general rule, the scope, the forbidden list, the
   priority on conflicts, and the workflow.
2. **The index** of the `.context/` artifacts (the `## Context index`
   section).

`AGENTS.md` must **NOT** hold:

- Project state.
- Component or module inventories.
- Lists of services, endpoints or files that enumerate the project.
- Status or progress comments ("the auth module is in progress").
- TODO lists.
- Counts or inventories that drift as the project changes.
- Any observation about the project's current state ("there are 12
  services", "3 endpoints are pending review").

Anything that describes **what exists right now** belongs in the
`.context/` file that owns the subject: `architecture.md` owns the
structure, `stack.md` owns the stack, `code-style.md` owns the
conventions, `conventions.md` owns the non-obvious contracts (response
format, auth, special headers, etc.).

Every rule must be a **durable statement** ("use X for Y", "tests live
in Y") — never an observation about the current state. The one-line
project description in `## General rule` stays at stack/framework level
— it must not grow into a feature list or a status summary.

## Expected output structure

The `AGENTS.md` file must have this structure (in this order):

```markdown
# AGENTS.md — Agent behavior guide

## General rule

> Analyze → Reuse → Create with consistency → Document if it's a new pattern.

This project is <1-line description based on `repo.stack`,
`repo.framework>`. Existing code is the source of truth: replicate its
patterns, do not invent new ones.

## Scope

- Which files/folders can be touched without permission (inferred from
  `structure.top_dirs` and `structure.src_dirs`).
- What to do with bugs outside scope (open an issue, do not fix in the
  same PR).
- Mandatory flow for changes (inferred from `architecture.md` — e.g.
  router → service → repository).

## Forbidden

<Concrete and actionable list, specific to the detected stack. Each
prohibition points to a concrete file in the repo (not generic).>

- DO NOT <prohibition 1> (see `<path>`).
- DO NOT <prohibition 2> (see `<path>`).
- DO NOT commit `<file>` (credentials, generated files, etc.).
- DO NOT install packages without explicit confirmation.
- DO NOT commit without user confirmation.

## Priority on conflicts

<This section is fixed — it is the agent's behavior contract.>

1. Explicit user instruction.
2. Examples in `.context/examples/`.
3. Existing code.
4. `.context/*.md` (stack, architecture, code-style, conventions).
5. Generic documentation for the stack/language.

## Workflow

### Before creating

- Check `.context/examples/` to see if a pattern is already
  documented.
- Reuse existing helpers, services, types — do not create parallel
  ones.
- Read `.context/*.md` (stack, architecture, code-style, conventions)
  to understand the project context.

### While creating

- Replicate existing patterns:
  - Naming: see `.context/code-style.md` → "Naming conventions"
    section.
  - File structure: see `.context/architecture.md` → "File naming
    conventions" section.
  - Error handling: see `.context/code-style.md` → "Error handling"
    section.
  - Tests: see `.context/code-style.md` → "Tests" section.

### After creating

- If you introduced a new pattern (not documented in `.context/`),
  document it following the template in `.context/examples/`.
- If you modified config or i18n keys, verify you did not break the
  existing flow.
- Run the linter and tests before declaring the work done.

## When in doubt → ask, don't invent

<1-2 lines reinforcing the no-assume rule.>

## Context index

| File                                 | What it covers                                          |
|--------------------------------------|---------------------------------------------------------|
| `.context/stack.md`                  | Tech stack, versions, usage rules                       |
| `.context/architecture.md`           | Structure, layers, domains, work unit flow              |
| `.context/code-style.md`             | Linter, formatter, naming, code patterns                |
| `.context/conventions.md`            | Non-obvious contracts (response format, auth, etc.)     |
| `.context/examples/<name>.md`        | Real repo examples, with replication checklist          |
| (omit rows for skipped files)        |                                                         |

**How to read this directory:** start with `AGENTS.md` (this file),
then `.context/stack.md` and `.context/architecture.md`. Move on to
`.context/code-style.md` and `.context/conventions.md` when you are
about to write code. Use `.context/examples/` as a reference when
implementing a known pattern.
```

## How to derive each section

### General rule

One line for the project type, based on `repo.stack` and
`repo.framework`. Examples:

- "This project is a Node.js + Express + Prisma API."
- "This project is a React + Vite + TanStack Query web app."
- "This project is a Go + Gin + GORM service."

If `repo.framework` is `null`, adjust: "This project is a Node.js
service with native HTTP."

### Scope

Infer from:

- `structure.top_dirs`: which folders are source code?
- `structure.src_dirs`: what are the main subfolders?
- `existing_docs`: is there a README or CONTRIBUTING that already
  defines the scope?

For the mandatory flow, look at `.context/architecture.md` (if it
exists) and extract the dominant pattern. If it does not exist, infer
from the discovery JSON.

### Forbidden

Infer from real code. Typical examples:

- If the repo has `tsconfig.json` with `strict: true` →
  "DO NOT use `any` (see `tsconfig.json`)."
- If there are separate `repositories/` → "DO NOT import the ORM
  directly in routers; always via repositories."
- If there is `.gitignore` with `.env` → "DO NOT commit `.env` or
  credentials."
- If there are mandatory tests → "DO NOT merge without tests passing."

Avoid generic prohibitions like "don't use bad practices" or "be
neat". Each prohibition must point to a concrete file.

### Context index

Generate one row per `.context/` file the conductor passed to you.
Omit any that were skipped (do not list `conventions.md` if the
conductor decided to skip it).

## Tone and style

- **Concise, factual.** No verbosity.
- **Verifiable.** Each claim points to a file in the repo.
- **No emojis.**
- **No exclamation marks, no emojis, no welcome text.**
- The header ("General rule" section) must fit in **~10-15 lines**
  including the quote and the project description.

## Final output

Return to the conductor:

- The complete contents of the `AGENTS.md` file you just created (or
  the resulting merge), or a "no change" note when the existing file was
  left untouched.
- A short note (1-2 lines) confirming:
  - Whether you generated from scratch, merged with an existing one, or
    left the file untouched (no change).
  - Whether you found a previous `AGENTS.md` and decided to merge vs
    ask.
  - How many rows the context index has.