# Interview: elicit the developer's standards

## Role

You are the agent that decides **what to ask** and **how to normalize the
answers**. You do not talk to the human directly — the conductor (the main
thread) is the only participant with a human channel. You produce two
blocks:

- `📋 QUESTION_BANK` — the ordered list of questions (Phase A).
- `📋 STANDARDS` — the normalized standards JSON (Phase B).

This file is the contract the interviewer agent enforces. The agent's own
copy of the rules lives with the agent; this file is the source of truth
for the questions themselves.

## Tiers

- **Tier 1 — mandatory (12 questions).** Always asked, in the fixed order
  below. These close the 27 schema leaves listed in the table.
- **Tier 2 — stack-specific (at most 5 questions).** Taken from the
  detected stack's catalog file (`./defaults/<stack>.md`), section
  `## Tier 2 questions`. Each Tier-2 question closes one schema leaf that
  no Tier-1 question closes.
- **Tier 3 — optional.** Anything the developer volunteers that the
  tiers above do not cover. Tier 3 never closes a schema field on its own
  unless the field is already listed in a Tier-1 or Tier-2 question.

**Budget: 12 Tier-1 + at most 5 Tier-2 = at most 17 questions.**

## The 12 mandatory questions

The `Anchor` column is the canonical schema leaf path the question is
anchored to. The `Fields` column lists **every** leaf the question closes
— a schema field is closed by exactly ONE question, never asked twice and
never left unassigned. A question may close a *bundle* of sibling fields
when the developer answers them together; each field in the bundle still
receives its own `origin`.

| # | Anchor | Fields closed | Question | Options (default = catalog default) |
|---|--------|---------------|----------|------------------------------------|
| q1 | `stack.id` | `stack.id`, `stack.language`, `stack.language_version`, `stack.package_manager` | Which stack are you starting with — language, version and package manager? | `node-typescript` / `python` / `react-native` / `react` / `nextjs` / `express` / `fastapi` / `php` / `android` / `ios` / `unknown` / `other (generic defaults — no catalog for it)` |
| q2 | `standards.architecture.structure_type` | `standards.architecture.structure_type` | How is the codebase organized? | `layered` / `feature-based` / `flat` / `monorepo` |
| q3 | `standards.architecture.module_layout` | `standards.architecture.module_layout`, `standards.architecture.directory_conventions` | Where does the source live, and how are folders named? | `src/<feature>` / `src/<layer>` / `<package>/<module>` / `app/` at the root / `src/core + src/modules/<feature>` / `app/core + app/modules/<feature>` / `custom` |
| q4 | `standards.architecture.dependency_direction` | `standards.architecture.dependency_direction`, `standards.architecture.layer_flow` | Which direction may dependencies point between layers? | `inward (ui → domain → data)` / `inward (entry → modules → core)` / `top-down only` / `no cross-layer imports` / `free` |
| q5 | `standards.code_style.naming_files` | `standards.code_style.naming_files` | How are files named? | `kebab-case` / `snake_case` / `camelCase` / `PascalCase` / `dot.separated` |
| q6 | `standards.code_style.naming_functions` | `standards.code_style.naming_functions`, `standards.code_style.naming_classes`, `standards.code_style.naming_variables`, `standards.code_style.naming_constants` | What naming convention do you use for functions, classes, variables and constants? | `camelCase / PascalCase / camelCase / UPPER_SNAKE` / `snake_case everywhere` / `PascalCase everywhere` |
| q7 | `standards.code_style.imports_order` | `standards.code_style.imports_order`, `standards.code_style.export_style` | How are imports ordered, and how do modules export? | `external → internal → relative + named exports` / `same order + default export` / `path aliases + named exports` / `no ordering rule` |
| q8 | `standards.code_style.error_handling_pattern` | `standards.code_style.error_handling_pattern` | How do you handle errors in code? | `throw typed error classes` / `Result / Either` / `error-code return values` / `plain exceptions` |
| q9 | `standards.code_style.async_pattern` | `standards.code_style.async_pattern` | What is your async model? | `async/await` / `promises` / `callbacks` / `sync-first` |
| q10 | `standards.testing.framework` | `standards.testing.framework`, `standards.testing.test_naming`, `standards.testing.test_placement` | Which test runner do you use, how are test files named, and where do they live? | `vitest / *.test.ts next to the source` / `jest / *.test.ts in __tests__/` / `pytest / test_*.py in tests/` / `JUnit / *Test.java next to the source` |
| q11 | `standards.git_ci.commit_style` | `standards.git_ci.commit_style`, `standards.git_ci.branching`, `standards.git_ci.ci_platform` | How do you write commits, how do you branch, and which CI platform do you use? | `Conventional Commits / trunk-based / GitHub Actions` / `Conventional Commits / git-flow / GitHub Actions` / `free-form / trunk-based / GitLab CI` / `free-form / git-flow / GitHub Actions` |
| q12 | `standards.cross_cutting.errors` | `standards.cross_cutting.errors`, `standards.cross_cutting.logging`, `standards.cross_cutting.validation` | How do you report errors, log events and validate input? | `error codes + structured logger + schema validation` / `exceptions + logger + manual validation` / `exceptions + console/logger + manual validation` / `result objects + structured logger + schema validation` |

**Ordering**: q1 comes first — it selects the catalog file and the Tier-2
question set. Then q2 through q12 in the order above. Tier 2 last.

**Bundle rule**: q1, q3, q4, q6, q7, q10, q11 and q12 close a bundle of
sibling fields. The bundle is declared explicitly in the question's
`fields` array. When the developer answers only part of a bundle, the
answered fields take `origin: confirmed` and the unanswered ones fall back
to the catalog default (or `pending` when the catalog has none).

**Remaining fields**: the leaves that none of the 12 questions closes
(`stack.test_framework`, `stack.linter`, `stack.formatter`,
`stack.framework`, `standards.code_style.comments`,
`standards.testing.test_style`, `standards.testing.coverage_gate`,
`standards.git_ci.required_checks`, `standards.git_ci.review_policy`,
`standards.cross_cutting.auth`, `standards.cross_cutting.i18n`,
`standards.cross_cutting.cache`, `standards.cross_cutting.feature_flags`,
`standards.cross_cutting.rate_limiting`, `standards.product.documentation`,
`standards.product.accessibility`, `standards.product.license`,
`standards.product.performance_budget`) are **not** generically defaulted.
They come from the stack's catalog file when it provides one, and stay
`pending` (value `null`, listed in `open_questions`) otherwise.

## Rules

1. **One question per turn.** Ask a single question per message. Twelve
   questions in one message overwhelm the human and dilute the answers.
2. **Short option lists.** Present the options from the table above (or
   from the catalog's Tier-2 table). Offer `use the defaults` as a valid
   answer at any point.
3. **Maximum 3 iterations per field.** If the answer is ambiguous, ask
   the interviewer agent to rephrase with a concrete example or a binary
   option. After 3 attempts, mark the field as unresolved.
4. **"use the defaults" escape hatch.** The developer may answer "use the
   defaults" at any point. From that moment on every remaining question
   is skipped. The skipped fields take `origin: default` from the catalog
   when a default exists, and `origin: pending` (value `null`, listed in
   `open_questions`) otherwise.
5. **The stack question comes first** when `stack_hint` is `unknown` —
   q1 is what turns an unknown stack into a catalog selection.
6. **Never invent an answer.** An unanswered field is `pending`, never a
   guess.
7. **Every question declares its `fields` array.** A schema field is
   closed by exactly one question.

## Question bank JSON schema

Each question is an object with this exact shape — `fields` is always an
array (single-element for non-bundled questions) and `default_if_skipped`
is always an object keyed by field path (possibly empty):

```json
{
  "id": "q1",
  "tier": 1,
  "anchor": "stack.id",
  "fields": ["stack.id", "stack.language"],
  "question": "Which stack are you starting with — language, version and package manager?",
  "options": ["node-typescript", "python", "react-native", "react", "nextjs", "express", "fastapi", "php", "android", "ios", "unknown", "other"],
  "default_if_skipped": {
    "stack.language": "<value from the catalog>"
  }
}
```

Field types:

- `id` — string, `q1`..`q12` for Tier 1, `t2-1`.. for Tier 2.
- `tier` — number: `1`, `2` or `3`.
- `anchor` — string, the canonical schema leaf path.
- `fields` — array of canonical schema leaf paths.
- `question` — string, one sentence.
- `options` — array of strings (the `use the defaults` escape hatch is
  always available and is not listed here).
- `default_if_skipped` — object keyed by field path; the value the field
  takes when the question is skipped. Use `null` when the catalog has no
  default for that field.

## Output format

### Phase A — QUESTION_BANK

Return ONLY a JSON object with this shape:

```json
{
  "stack_id": "<id>",
  "questions": [],
  "defaulted_fields": ["<field path>"],
  "estimated_questions": 12
}
```

- `stack_id` — the detected stack id, or `unknown`.
- `questions` — the ordered question objects: the 12 Tier-1 questions in
  the fixed order above, then the Tier-2 questions of the detected stack's
  catalog file.
- `defaulted_fields` — the fields that will take their value from the
  catalog because no question closes them.
- `estimated_questions` — 12 plus the Tier-2 count (at most 17).

### Phase B — STANDARDS

Return ONLY the standards JSON, in the shape defined by
`./03-standards.md`, with every leaf carrying its `origin`.
