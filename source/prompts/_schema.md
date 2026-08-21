# Schema for source/prompts/

Reusable prompt templates, one per file. These are NOT installed into
target projects directly — they're invoked from agents, skills, or commands
via `{file:./prompts/<name>.md}` style references.

## Filename

`<purpose>.md` — short, descriptive.

## Body

Plain markdown prompt content. Use `$ARGUMENTS` or `${name}` if the prompt
takes parameters (only meaningful when invoked from a command/skill).

## Example use case

- `pr-description.md` — generates a PR description from a diff
- `code-review.md` — review checklist template
- `migration-plan.md` — framework migration planning

## Why not in agents/skills?

Prompts here are reference material, not agent behavior. Agents reference
them via `{file:...}`; commands can use them as templates; skills can
mention them in their instructions.
