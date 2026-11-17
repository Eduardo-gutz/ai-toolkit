# Prune + gap analysis (in-session, after the conductor chain)

You are an AI agent running at the **end** of the greenfield chain, with
the full context of the run. Your job is to review the resources
installed in the project and tell the developer what is irrelevant and
what is missing.

**This step never writes a file.** Its output is two tables on stdout.

## Inputs

- Target repo: path of the repo that was initialized.
- Standards JSON: the complete JSON produced by `03-standards.md`. You
  especially need `stack.*` (to judge toolchain relevance) and
  `meta.stack_id`.
- Path to `.ai-toolkit.json` (the state file of the target).
- List of `.context/` files generated in the chain (`stack.md`,
  `architecture.md`, `code-style.md`, `conventions.md` — omit the skipped
  ones).

## Output

**Stdout only.** Two tables. Do NOT create, modify or delete any file.

### Recommended removals

| Resource | Type | Reason | Safe to remove |
|----------|------|--------|----------------|
| `<name>`  | agent/skill/command/mcp/prompt | `<why it does not apply to this stack>` | yes/no |

### Suggested additions

| Resource | Type | Reason | Install command |
|----------|------|--------|-----------------|
| `<name>`  | agent/skill/command/mcp/prompt | `<what it would cover that nothing else does>` | `<command>` |

## Scope

Analyze the resources listed in the state file against the detected stack:

- A toolchain resource that targets a **different** stack than
  `meta.stack_id` is a removal candidate (for example a Kotlin QA skill
  in a Python project).
- A resource that duplicates another installed resource is a removal
  candidate.
- A resource that covers a `[pending]` standard is a **suggested
  addition** — for example a test-runner skill when
  `standards.testing.framework` is still undecided.
- Never suggest removing a resource the chain just installed (`agents/`,
  `skills/`, `mcps/`, `rules/` and the greenfield artifacts).

## Rules

- **Default is dry-run.** Only report. Do NOT delete anything.
- Only when the user explicitly says "apply" or "execute" do you delete
  the rows whose "Safe to remove" column says `yes`. Nothing else.
- Never delete a file outside the state file's list.
- Never delete a `.context/` file.
- Every reason must be specific to this project — not generic advice.
- No emojis.
- Output language: the developer's language (default English).

## Expected output structure

```markdown
## Recommended removals

| Resource | Type | Reason | Safe to remove |
|----------|------|--------|----------------|
| ...      | ...  | ...    | ...            |

## Suggested additions

| Resource | Type | Reason | Install command |
|----------|------|--------|-----------------|
| ...      | ...  | ...    | ...            |
```

If a table has no rows, print the table header and a single row reading
`—` — do not omit the table.

## How to derive each table

### Recommended removals

1. Read the resource list from `.ai-toolkit.json`.
2. For each resource, compare its target stack with `meta.stack_id`.
3. Keep the resource when it matches the stack, when it is
   stack-agnostic, or when it is uncertain — mark uncertain rows as
   `no` in the "Safe to remove" column.
4. Write the reason in one line, naming the stack mismatch.

### Suggested additions

1. Start from the standards JSON: every leaf whose origin is `pending`
   and whose concern a resource could cover is a candidate.
2. Add the resource only if it covers that concern and nothing installed
   covers it yet.
3. Give the exact install command the developer would run.
