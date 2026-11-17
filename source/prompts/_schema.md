# Schema for source/prompts/

Reusable prompt **packs**. Each pack is a directory under
`source/prompts/<pack>/` that the adapters copy into the target project
as a tool-specific command or skill.

## Pack layout

```
source/prompts/<pack>/
├── 00-conductor.md      # the orchestrator (required)
├── 01-…09-….md         # numbered supporting prompts, one per chain step
└── <assets>/            # optional: files copied verbatim next to the pack
    └── …\.md
```

- `00-conductor.md` — **required**. Names the chain, delegates each step
  to a sub-agent, and references its siblings as `./01-….md` and
  `./<assets>/…`.
- Numbered supporting files — run one at a time, in numeric order. The
  conductor must list every file it loads.
- Asset subdirectories — optional. Copied byte-for-byte into the target
  (e.g. the greenfield stack-defaults catalog).

## Registering a pack

Every pack must be registered in `PROMPT_PACKS`
(`adapters/_shared/prompt-pack.mjs`) with the shape
`{ id, dir, conductor, supporting, assets }`. The registry is the single
source of truth: the shared renderer reads the pack from it, the adapters
install from it, and `ai-toolkit validate` checks that every registered
file is present.

The shared renderer (`adapters/_shared/prompt-pack.mjs`) is
**pack-agnostic** — it reads a pack, rewrites the conductor's `./<name>`
references into each tool's native syntax (`./01-…` for Claude Code,
`@01-…` for OpenCode), and validates completeness.
`adapters/_shared/bootstrap-renderer.mjs` is the legacy facade kept for
the bootstrap pack's public API.

## Current packs

| Pack | Kind | Directory |
|---|---|---|
| `bootstrap` | Extractive — derives the context from the code that already exists | `source/prompts/bootstrap/` |
| `greenfield` | Generative — interviews the developer, fills the rest from the stack defaults | `source/prompts/greenfield/` |

## Filename

`<purpose>.md` — short, descriptive. Supporting files are prefixed with
their chain step number (`01-`, `02-`, …) so the run order stays visible
in the file listing.

## Body

Plain markdown prompt content. Use `$ARGUMENTS` or `${name}` if the prompt
takes parameters (only meaningful when invoked from a command/skill).

## Catalog file shape

A pack may ship a **catalog** of asset files (the greenfield pack ships
`defaults/`). A catalog file declares these four sections, in this order:

1. `## Stack signature` — the detection signals and the `stack_id` it serves.
2. `## Defaults` — the `| Field | Value | Rationale |` table.
3. `## Tier 2 questions` — the `| Question | Options | Field |` table.
4. `## Prescribed patterns` — the canonical templates.

A catalog file may declare **at most one** optional section, placed
between `## Tier 2 questions` and `## Prescribed patterns`:

| Optional section | Used by | Purpose |
|---|---|---|
| `## Pending allowlist` | the baseline file | the schema leaves this baseline deliberately leaves `pending` |
| `## Verification loop` | a per-stack file | the device-verification toolchain for that stack |
| `## Verification tooling` | a per-stack file | the toolchain the project will use, and what is still undecided |

### Catalog classes

A catalog file belongs to one of two classes — **base** or **framework**
(the *leaf* of a chain):

| Class | `## Stack signature` | `## Defaults` |
|---|---|---|
| **base** | carries no inheritance line | owns **all 14** stack-specific fields |
| **framework** | carries exactly one inheritance line | owns **9** of them; inherits the other 5 through its chain |

The inheritance line is literal:

```text
- Inherits from: `node-typescript`
```

A base catalog carries none; a framework catalog carries exactly one.

**The 14 stack-specific fields** are the 7 toolchain fields, `stack.id`,
the 5 architecture fields and `standards.testing.framework`. Concretely:

| Group | Fields |
|---|---|
| Toolchain | `stack.language`, `stack.language_version`, `stack.package_manager`, `stack.test_framework`, `stack.linter`, `stack.formatter`, `stack.framework` |
| Identity | `stack.id` |
| Architecture | `standards.architecture.structure_type`, `standards.architecture.module_layout`, `standards.architecture.layer_flow`, `standards.architecture.dependency_direction`, `standards.architecture.directory_conventions` |
| Testing | `standards.testing.framework` |

A **framework** catalog owns **9** of them: `stack.id`, `stack.framework`,
`stack.test_framework`, `standards.testing.framework`,
`standards.architecture.structure_type` and the **4** architecture fields
that name real folders. It inherits the remaining **5** (the toolchain
fields it shares with its base) through its chain.

> Why the architecture fields are stack-specific: they name concrete
> folders. `src/core + src/modules/<feature>` is not the tree of a Python
> project, and `routes → controller → helpers → repository` is not the
> layer flow of a React one. A generic default would describe a tree that
> does not exist in the stack.

### Merge rules

The resolved chain is merged base first, leaf last:

| Section | Merge rule |
|---|---|
| `## Defaults` | **field-level** — the leaf-most catalog that declares a field supplies its value; a base row is used only when no leaf row exists. |
| `## Tier 2 questions` | **whole-section** — the leaf's table wins; if the leaf omits the section, the base's table is used. Never merged row by row. |
| `## Prescribed patterns` | **whole-section** — the leaf's section wins; if the leaf omits it, the base's is used. |

### Provenance

The `[default: …]` marker names the file that supplied the **winning**
value — when the leaf overrode the base, the marker names the **leaf**
(for example `[default: defaults/nextjs.md]`), never the base's file.

### Path references vs provenance markers

A pack file mixes two kinds of path, and they are rewritten differently:

| Kind | Example | Rule |
|---|---|---|
| **A reference the agent opens** | ``Read `./defaults/react.md` `` | carries the tool's prefix (`./` for Claude Code, `@` for OpenCode) |
| **A provenance marker** | `[default: defaults/react.md]` | **always neutral** — no tool prefix |

The marker is data: it is copied verbatim into the generated `.context/`
files, where a tool-specific prefix would name a path that does not
exist. The adapters rewrite references and leave markers neutral — so a
marker in the source must be written WITHOUT a prefix.

> Writing `[default: ./defaults/react.md]` in the source is a mistake. The
> adapters strip the prefix before installing, so the installed pack is
> still correct — but the source should not carry it.

## Example packs

- `bootstrap` — **extractive**: reads the code that already exists and
  derives `.context/` + `AGENTS.md` from what it finds.
- `greenfield` — **generative**: interviews the developer for their
  standards and fills the rest from the detected stack's defaults.

## Why a pack and not a single prompt?

A pack is installed **as** a command or a skill in the target project —
`.claude/skills/greenfield/SKILL.md`, `.opencode/commands/greenfield.md` —
not as reference material an agent merely reads. The pack directory is what
makes a multi-step, multi-file workflow installable: the conductor and its
numbered steps travel together and stay in sync.
