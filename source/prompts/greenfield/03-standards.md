# Standards: the standards JSON

This step normalizes the interview answers into **one** structured object.
Every value in it carries its provenance, so the developer can audit what
is theirs and what is a catalog default.

## Output (strict JSON)

Return ONLY a JSON object — no explanations, no markdown wrapper, no code
fence around the returned value.

## Schema

The object has four top-level keys: `meta`, `stack`, `standards` and
`open_questions`.

- `meta` — counts and provenance summary (plain values, no origin).
- `stack` — the toolchain facts.
- `standards` — the engineering standards, grouped by concern.
- `open_questions` — the paths of every field whose origin is `pending`.

Every leaf is an object `{ "value": …, "origin": … }`. `origin` is one of
`confirmed`, `default` or `pending`.

```json
{
  "meta": {
    "stack_id": "<stack-id>",
    "stack_source": "detected|interview|unknown",
    "detected_manifests": ["package.json"],
    "answered": 12,
    "defaulted": 21,
    "pending": 3
  },
  "stack": {
    "id": { "value": "<stack-id>", "origin": "confirmed|default|pending" },
    "language": { "value": "<language>", "origin": "confirmed|default|pending" },
    "language_version": { "value": "<version>", "origin": "confirmed|default|pending" },
    "package_manager": { "value": "<manager>", "origin": "confirmed|default|pending" },
    "test_framework": { "value": "<runner>", "origin": "confirmed|default|pending" },
    "linter": { "value": "<linter>", "origin": "confirmed|default|pending" },
    "formatter": { "value": "<formatter>", "origin": "confirmed|default|pending" },
    "framework": { "value": null, "origin": "confirmed|default|pending" }
  },
  "standards": {
    "code_style": {
      "naming_files": { "value": "<convention>", "origin": "confirmed|default|pending" },
      "naming_classes": { "value": "<convention>", "origin": "confirmed|default|pending" },
      "naming_functions": { "value": "<convention>", "origin": "confirmed|default|pending" },
      "naming_variables": { "value": "<convention>", "origin": "confirmed|default|pending" },
      "naming_constants": { "value": "<convention>", "origin": "confirmed|default|pending" },
      "imports_order": { "value": "<rule>", "origin": "confirmed|default|pending" },
      "error_handling_pattern": { "value": "<pattern>", "origin": "confirmed|default|pending" },
      "async_pattern": { "value": "<pattern>", "origin": "confirmed|default|pending" },
      "export_style": { "value": "<style>", "origin": "confirmed|default|pending" },
      "comments": { "value": "<policy>", "origin": "confirmed|default|pending" }
    },
    "architecture": {
      "structure_type": { "value": "<type>", "origin": "confirmed|default|pending" },
      "layer_flow": { "value": "<flow>", "origin": "confirmed|default|pending" },
      "module_layout": { "value": "<layout>", "origin": "confirmed|default|pending" },
      "dependency_direction": { "value": "<rule>", "origin": "confirmed|default|pending" },
      "directory_conventions": { "value": "<convention>", "origin": "confirmed|default|pending" }
    },
    "testing": {
      "framework": { "value": "<runner>", "origin": "confirmed|default|pending" },
      "test_naming": { "value": "<convention>", "origin": "confirmed|default|pending" },
      "test_placement": { "value": "<location>", "origin": "confirmed|default|pending" },
      "test_style": { "value": "<style>", "origin": "confirmed|default|pending" },
      "coverage_gate": { "value": "<threshold>", "origin": "confirmed|default|pending" }
    },
    "git_ci": {
      "branching": { "value": "<strategy>", "origin": "confirmed|default|pending" },
      "commit_style": { "value": "<style>", "origin": "confirmed|default|pending" },
      "ci_platform": { "value": "<platform>", "origin": "confirmed|default|pending" },
      "required_checks": { "value": "<checks>", "origin": "confirmed|default|pending" },
      "review_policy": { "value": "<policy>", "origin": "confirmed|default|pending" }
    },
    "cross_cutting": {
      "auth": { "value": "<strategy>", "origin": "confirmed|default|pending" },
      "logging": { "value": "<approach>", "origin": "confirmed|default|pending" },
      "errors": { "value": "<approach>", "origin": "confirmed|default|pending" },
      "validation": { "value": "<approach>", "origin": "confirmed|default|pending" },
      "i18n": { "value": "<approach>", "origin": "confirmed|default|pending" },
      "cache": { "value": "<approach>", "origin": "confirmed|default|pending" },
      "feature_flags": { "value": "<approach>", "origin": "confirmed|default|pending" },
      "rate_limiting": { "value": "<approach>", "origin": "confirmed|default|pending" }
    },
    "product": {
      "documentation": { "value": "<policy>", "origin": "confirmed|default|pending" },
      "accessibility": { "value": "<policy>", "origin": "confirmed|default|pending" },
      "license": { "value": "<license>", "origin": "confirmed|default|pending" },
      "performance_budget": { "value": "<budget>", "origin": "confirmed|default|pending" }
    }
  },
  "open_questions": ["<field path whose origin is pending>"]
}
```

> `stack.id` is the pack's identifier (for example `node-typescript`), not
> a free-form name. It carries an origin like every other leaf: `confirmed`
> when q1 was answered, `default` when it came from the catalog file's
> stack signature, `pending` when neither happened.

## Provenance rules

| Origin | Meaning | Requirements |
|--------|---------|--------------|
| `confirmed` | The developer stated it in the interview. | The value must be traceable to one answer in one question. |
| `default` | It comes verbatim from the stack's defaults catalog. | The value MUST name **the catalog file that supplied the winning value** — `defaults/_baseline.md` or the catalog that supplied it. |
| `pending` | Neither — the developer did not answer it and the catalog has no value for it. | `value` MUST be `null` and the field MUST appear in `open_questions`. |

Additional rules:

- A value with `origin: "default"` MUST be copied **verbatim** from the
  catalog row. Never reword it, never merge two rows.
- A per-stack row wins over the baseline row for the same field path.
- **Provenance of a merged value**: the winning value's `origin` is
  `default` and it MUST name **the catalog file that supplied the winning
  value** — when the leaf overrode the base, the marker names the **leaf**
  (for example `[default: defaults/nextjs.md]`), **never the base's file**.
- When the detected stack has no catalog file, only the baseline applies
  and every stack-specific field stays `pending`.
- `meta.answered` counts **questions** (12 + the Tier-2 count), not
  fields. `meta.defaulted` and `meta.pending` count **fields**.
- `meta.stack_source` is `detected` when the stack came from the
  manifest scan, `interview` when the developer answered q1, `unknown`
  when neither happened.
- `open_questions` lists the field paths, sorted, with no duplicates.

## Catalog chains

A framework catalog inherits part of its defaults from a base catalog.
The leaf's `## Stack signature` carries exactly one inheritance line — the
literal form is:

```text
- Inherits from: `node-typescript`
```

The base catalogs carry none.

The 4 chains (leaf → root) and their resolved sets (base first, leaf
last):

| Leaf | Chain (leaf → root) | Resolved set (base first, leaf last) |
|---|---|---|
| `react` | `react` → `node-typescript` | `node-typescript` → `react` |
| `nextjs` | `nextjs` → `react` → `node-typescript` | `node-typescript` → `react` → `nextjs` |
| `express` | `express` → `node-typescript` | `node-typescript` → `express` |
| `fastapi` | `fastapi` → `python` | `python` → `fastapi` |

**Merge order**: baseline → base catalog → … → leaf catalog. A later
catalog's value for a field **wins**.

| Section | Merge rule |
|---|---|
| `## Defaults` | merge **field-level** — the leaf-most catalog that declares a field supplies its value; a base row is used only when no leaf row exists. |
| `## Tier 2 questions` | merge **whole-section** — the leaf's table wins; if the leaf omits the section, the base's table is used. Never merged row by row. |
| `## Prescribed patterns` | merge **whole-section** — the leaf's section wins; if the leaf omits it, the base's is used. |

The optional section (`## Verification loop` / `## Verification tooling`)
follows the same whole-section rule.

## How to derive each field

1. **Start from the interview.** For every leaf in the `fields` array of an
   answered question, set `origin: "confirmed"` and the value the
   developer chose. A partially answered bundle leaves the unanswered
   fields to step 2.
2. **Fill from the catalog.** For every leaf that is still unset, look it
   up through the resolved set — the baseline first, then the base
   catalog, … up to the leaf catalog. The **leaf-most** catalog that
   declares the field supplies the value: a later catalog's value for a
   field wins. Copy the value verbatim and set `origin: "default"`,
   naming the file that supplied it.
3. **Leave the rest pending.** If neither the interview nor the catalog
   provides a value, set `value: null`, `origin: "pending"` and add the
   path to `open_questions`.
4. **Count.** Set `meta.answered` to the number of questions the
   developer actually answered, `meta.defaulted` to the number of leaves
   with `origin: "default"`, and `meta.pending` to the number of leaves
   with `origin: "pending"`.
5. **Sort `open_questions`** alphabetically so two runs with the same
   answers produce byte-identical output.

## Rules

- Do not invent a value. A field with no confirmed answer and no catalog
  row is `pending` — never a plausible guess.
- Do not merge two catalog rows into one value.
- Do not drop a field: every leaf of the schema appears in the output,
  even when its value is `null`.
- Do not reword a `default` value; copy it verbatim.
- No emojis in the output.
- The output is JSON only — no prose before or after it.
