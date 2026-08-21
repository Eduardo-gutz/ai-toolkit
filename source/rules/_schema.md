# Schema for source/rules/

Each rule is a single Markdown file. Rules are concatenated (in
alphabetical order) and rendered into a single `AGENTS.md` file at the
target project. For Claude Code, the adapter also generates a `CLAUDE.md`
that imports the `AGENTS.md`.

## Filename

`<topic>.md`. Filename is informational; content is what matters.

## Body

Plain markdown. Use headings and bullets. Keep concise — these files are
loaded into context on every session.

## Recommended structure per rule file

```markdown
# Topic Name

## Context
When this rule applies (one or two sentences).

## Rules
- Specific, verifiable rule 1
- Specific, verifiable rule 2
- ...

## Examples
<short example>
```

## Rendering

The adapter concatenates all enabled rules (in profile order, alphabetical
within profile) into a single markdown stream and wraps them in a generated
`AGENTS.md` (and `CLAUDE.md` that imports it).

## Don't put in rules/

- Long reference material → use a skill instead
- Multi-step procedures → use a skill instead
- Project-specific facts → put in the consuming project's own `AGENTS.md`,
  not in the toolkit (the toolkit is shared across projects)
