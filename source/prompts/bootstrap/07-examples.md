# Examples: generate `.context/examples/*`

You are an AI agent. Your job is to generate **at least 3 files** in the
target repo: `<repo>/.context/examples/`.

Each file documents a recurring pattern in the project (router,
service, model, test, UI component, hook, etc.) with a **real** snippet
from the repo and a replication checklist.

## Inputs

- Target repo: path of the repo to analyze.
- Discovery JSON: the complete JSON produced by `02-discovery.md`. You
  especially need `samples`, `structure`, `cross_cutting`.
- List of `.context/` files already generated in previous steps
  (`stack.md`, `architecture.md`, `code-style.md`, `conventions.md` —
  omit any the conductor skipped). Used to avoid repeating explanations
  that are already in other `.context/` files.

## Output

**Multiple files**: `<repo>/.context/examples/<name>.md` — at least 3.

Suggested names (pick the ones that apply to the repo):

- `router.md` or `controller.md` — for the HTTP endpoint pattern.
- `service.md` or `use-case.md` — for business logic.
- `model.md` or `entity.md` or `dto.md` — for model/DTO.
- `repository.md` — if there is a separate persistence layer.
- `test.md` — for the test pattern.
- `component.md` or `ui-component.md` — for UI components.
- `hook.md` — for hooks/composables.
- `migration.md` — if applicable.
- `job.md` or `worker.md` — if there are workers.

If the repo has fewer than 3 clear patterns, return what you find and
warn the conductor.

If the folder `<repo>/.context/examples/` already exists, **ask the
user** before overwriting files (show them which files you would create
and which you would overwrite).

## Absolute rules

- **Real snippets, not invented.** Every code snippet must come from a
  file in the repo, cited with `path/to/file:line`. If you want to
  simplify (drop irrelevant imports, shorten logic), mark it
  explicitly: "Simplified snippet from `<path>`, line N to M".
- Do not invent patterns. If the repo has no clear pattern, do not
  write a file for it.
- Do not add emojis.
- Cite real paths (verify they exist).
- If a discovery JSON sample is `null`, **do not** write a file for
  that category.

## Expected structure of each file

Each file in `.context/examples/<name>.md` must have this structure:

````markdown
# <Pattern name>

> Real example from the repo. **Replicate this pattern when creating
> similar code**, unless the team says otherwise.

## What it is

<1-2 sentences explaining what pattern this file documents.>

## When to use it

<List of bullets with cases where this pattern applies.>

- When you need <case 1>.
- When you add <case 2>.
- ...

## When NOT to use it

<Optional. If the pattern has limits, list them.>

- Do not use for <case where it does not apply>.

## Real example from the project

<Real snippet from the repo, with the cited path.>

### `<path/to/file>` (lines N-M)

```<language>
<real snippet, copied or simplified>
```

**Why it is a good example:**

- <reason 1>
- <reason 2>

## Pattern anatomy

<Description of the parts of the snippet, in order.>

1. **<part 1>**: <what it does> (lines N-N).
2. **<part 2>**: <what it does> (lines N-N).
3. **<part 3>**: <what it does> (lines N-N).

## Replication checklist

<Use `- [ ]` to mark each item.>

- [ ] The new file is in the correct folder (`<path>`).
- [ ] Imports follow the repo order (third-party first).
- [ ] The file name follows the `<pattern>` convention.
- [ ] The main symbol name follows `<convention>`.
- [ ] The symbol signature matches the pattern (params, return).
- [ ] Errors are handled with `<error pattern>`.
- [ ] Logging is at the expected points.
- [ ] The test covers at least `<case 1>` and `<case 2>`.
- [ ] If you added a new pattern (not documented here), you updated
      `.context/code-style.md` or created a new file in
      `.context/examples/`.

## Observed variants

<If you found variants of the pattern in the repo, list them briefly.>

- **Variant A**: <description> (see `<path>`).
- **Variant B**: <description> (see `<path>`).

## Anti-patterns to avoid

<Optional. If the repo has "incorrect" ways to implement this pattern
seen in old code or outdated examples, list them with the path.>

- <anti-pattern 1> — example in `<path>`.
````

## How to choose which patterns to document

Use `samples` from the discovery JSON as the starting point. Each
non-`null` category in `samples` is a candidate for a file.

Pick **at least 3** patterns. Prioritize those that:

1. Have a valid sample (not `null`) in the discovery JSON.
2. Are recurring (more than one file in the repo follows this
   pattern).
3. Are non-obvious (not visible by looking at the code for the first
   time).

If you have more than 5 candidates, prioritize:

1. Router / controller (if the repo is backend).
2. Service / use case.
3. Test.
4. UI component (if the repo is frontend).
5. Model / DTO.
6. Hook / composable.

## How to choose the snippet

For each pattern:

1. Take the sample from the discovery JSON.
2. If you want to verify it is truly representative, read 2-3 more
   files of the same type and compare. If the sample is an outlier
   (simpler or more complex than the rest), pick another.
3. Read the file and pick a 10-30 line block that shows the pattern
   in action. Ideally: imports + declaration + 1-2 representative
   functions.
4. Cite the path and the line range (`path/to/file:10-40`).

## If the discovery JSON has null samples

Do not write files for categories with `samples` as `null`. If more
than 3 categories are `null`, return only what you have and warn the
conductor that the minimum of 3 examples was not reached.

## Final output

Return to the conductor:

- The list of files created, with full paths.
- The contents of each file.
- A short note (1-2 lines) confirming how many files were created and
  whether the minimum of 3 was reached.
- If the minimum was not reached, explain why (which patterns were
  `null` in the discovery JSON).