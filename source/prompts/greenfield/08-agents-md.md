# Agents.md: generate `AGENTS.md` (root)

You are an AI agent. Your job is to generate **a single file** at the
root of the target repo: `AGENTS.md`.

This is the **last** sub-prompt of the greenfield chain. Its output
references all `.context/` files generated in the previous steps.

## Inputs

- Target repo: path of the repo to initialize.
- Standards JSON: the complete JSON produced by `03-standards.md`. You
  especially need `stack.*` (to describe the project in one line) and
  `standards.*` (the rules themselves).
- List of `.context/*.md` files generated in steps 3 to 6 (`stack.md`,
  `architecture.md`, `code-style.md`, `conventions.md`). Omit any the
  conductor skipped.

## Output

**A single file**: `<repo>/AGENTS.md` (project root).

### Idempotency rules (important)

Unlike the other sub-prompts, `AGENTS.md` usually **exists already**
(may have been created by a human or by a previous run).

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
   1. a **new rule** was confirmed in the interview, or a previously
      `[pending]` rule was resolved;
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

- **Every asserted value carries its provenance marker.** The legend is
  written once, right after the header:

  ```markdown
  > Provenance legend — `[confirmed]`: the developer stated it in the
  > interview. `[default: <file>]`: it comes verbatim from the stack
  > defaults catalog. `[pending]`: undecided — the value is `null` and it
  > is listed in `open_questions`.
  ```

  Then every rule that asserts a value renders its marker, for example
  `Conventional Commits — [confirmed]`,
  `trunk-based — [default: defaults/_baseline.md]` or
  `Authentication — [pending]`.
- A `[default: …]` marker MUST name the catalog file the value came from.
- A `[pending]` rule MUST say the decision is still open — never assert a
  plausible substitute.
- Do not invent rules. A rule that no confirmed value supports is not
  written.
- Do not add emojis (UX/voice decision, not the agent's).
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

This project is <1-line description based on `stack.language` and
`stack.framework`. The standards in `.context/` are the source of truth:
follow them, do not invent new ones.

<provenance legend>

## Scope

- Which files/folders can be touched without permission (derived from
  `standards.architecture.module_layout`).
- What to do with bugs outside scope (open an issue, do not fix in the
  same change).
- Mandatory flow for changes (derived from `architecture.md` — e.g.
  router → service → repository).

## Forbidden

<Concrete and actionable list, specific to the detected stack. Each
prohibition points to a concrete rule in `.context/`, not a generic one.>

- DO NOT <prohibition 1> (see `.context/code-style.md`).
- DO NOT <prohibition 2> (see `.context/architecture.md`).
- DO NOT commit `<file>` (credentials, generated files, etc.).
- DO NOT install packages without explicit confirmation.
- DO NOT commit without user confirmation.

## Priority on conflicts

<This section is fixed — it is the agent's behavior contract.>

1. Explicit user instruction.
2. The prescribed patterns in `.context/code-style.md`.
3. The standards in `.context/*.md` (stack, architecture, code-style,
   conventions).
4. The stack defaults catalog (`./defaults/<stack>.md`).
5. Generic documentation for the stack/language.

## Workflow

### Before creating

- Read `.context/*.md` (stack, architecture, code-style, conventions) to
  understand the project context.
- Reuse existing helpers, services, types — do not create parallel
  ones.

### While creating

- Replicate the documented patterns:
  - Naming: see `.context/code-style.md` → "Naming conventions" section.
  - File structure: see `.context/architecture.md` → "Folder tree"
    section.
  - Error handling: see `.context/code-style.md` → "Error handling"
    section.
  - Tests: see `.context/code-style.md` → "Tests" section.

### After creating

- If you introduced a new pattern, document it next to the other
  prescribed patterns in `.context/code-style.md`.
- If you modified config or i18n keys, verify you did not break the
  existing flow.

## Context index

| File                                 | What it covers                                       |
|--------------------------------------|------------------------------------------------------|
| `.context/stack.md`                  | Tech stack, versions, usage rules                    |
| `.context/architecture.md`           | Structure, layers, domains, work unit flow           |
| `.context/code-style.md`             | Linter, formatter, naming, code patterns             |
| `.context/conventions.md`            | Non-obvious contracts (response format, auth, etc.)  |
| (omit rows for skipped files)        |                                                      |

**How to read this directory:** start with `AGENTS.md` (this file),
then `.context/stack.md` and `.context/architecture.md`. Move on to
`.context/code-style.md` and `.context/conventions.md` when you are
about to write code.
```

## How to derive each section

### General rule

One line describing the project, built from `stack.language` and
`stack.framework` with their markers. The second paragraph states that
`.context/` is the source of truth.

### Scope

Derive the touchable paths from `standards.architecture.module_layout` and
the change flow from `standards.architecture.layer_flow`.

### Forbidden

Build the list from the confirmed standards — never from generic advice.
A prohibition must point at the `.context/` section that states the rule.
A rule whose source is `[pending]` cannot become a prohibition: it goes in
the "Open decisions" section instead.

Add the "Open decisions" section (only when there is at least one
`[pending]` value) listing the pending field paths and their names, so the
developer can settle them:

```markdown
## Open decisions

The following standards are still undecided — do not guess them:

- Authentication — [pending]
- Coverage gate — [pending]
```

### Priority on conflicts

Fixed, as shown above. Priority 2 is the prescribed patterns in
`.context/code-style.md` — this pack produces no extracted-snippet
directory, because a greenfield project has no code to extract from.

### Workflow

Fixed, as shown above. The "Before creating" checklist reads the context
files only: this pack produces no extracted-snippet directory, because a
greenfield project has no code to extract from.

### Context index

Derive this section **only** from the `.context/` files actually present
in the target repo: one row per artifact generated in this run. Omit the
rows for skipped artifacts — do not list a file that does not exist.
