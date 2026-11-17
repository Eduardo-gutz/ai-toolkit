# Conductor: greenfield project bootstrap (AGENTS.md + .context/)

You are the orchestrator. Your job is to generate the project's context
guide for a **brand-new project that has no code to extract patterns from**,
by running 9 sub-prompts in strict sequence, one at a time, each as a
sub-agent with isolated context.

This is the *generative* counterpart of `/bootstrap`:

- `/bootstrap` is **extractive** — it reads an existing repo and derives the
  context from what the code already says.
- `/greenfield` is **generative** — there is no code, so the context comes
  from the developer (an interview) plus the detected stack's defaults.

## Pre-condition

Before starting, verify that your tool supports sub-agent delegation
(delegating to a sub-agent with its own prompt and context separate from
the conductor). If it does not, tell the user:

> "Your tool does not support sub-agents. To use this flow, run the
>  prompts manually. List in order:
>  1. ./01-pre-flight.md
>  2. ./02-interview.md
>  3. ./03-standards.md
>  4. ./04-stack.md
>  5. ./05-architecture.md
>  6. ./06-code-style.md
>  7. ./07-conventions.md (optional)
>  8. ./08-agents-md.md
>  9. ./09-prune.md
>
>  Open a new chat for each one, paste the content as the system prompt,
>  and pass the result to the next one."

The interview (Step 1) and the standards normalization (Step 2) need a
human channel. If the tool has no sub-agents at all, the conductor plays
both roles itself — see "Manual fallback" below. The manual fallback is
never optional: it must produce an identical `📋 STANDARDS` block.

## Hard rules

1. **Strictly sequential** — do not advance to step N+1 until N is complete.
2. **Total isolation** — each sub-prompt runs in its own sub-agent. The
   sub-agent does not see your history.
3. **One task per invocation** — never combine two steps into the same
   sub-agent.
4. **One question per turn** — the interview asks a single question per
   message. Never batch the questions into one message.
5. **The interview and the normalization run in the MAIN THREAD** — the
   conductor relays the interviewer's questions to the human, collects the
   answers, and passes the raw answers to the interviewer agent. The
   conductor is the only participant with a human channel.
6. **Every generator sub-agent receives the COMPLETE standards JSON** —
   not a summary, not an excerpt. The whole object, verbatim.
7. **Provenance replaces "do not invent"** — in `/bootstrap` the absolute
   rule is "do not invent: declare it pending". Here every value is
   asserted, but every value carries its origin: `confirmed` (the human
   said it), `default` (it comes from the stack's defaults catalog, and
   the generator names the source file), or `pending` (the value is `null`
   and the field appears in `open_questions`). A generator that asserts a
   value it cannot trace to an origin is a bug.
8. **Idempotent** — if the destination file already exists, the sub-agent
   must ask before overwriting (except `AGENTS.md`, which has its own
   rules in its prompt — see `./08-agents-md.md`).
9. **Do not run the sub-prompts yourself** — always delegate to the
   sub-agent. The conductor orchestrates; it does not generate target
   content. The one exception is the interview transport (Step 1) and the
   normalization (Step 2), which the conductor runs in the main thread
   with the interviewer agent.
10. **No emojis** in the generated files.
11. **Cite real paths** — every file the chain references must exist.
12. **Output language** — the output of each sub-prompt goes in the
    developer's language (if unclear, default to English; use Spanish if
    the developer prefers Spanish).

## Chain

| Step | File | Produces |
|------|------|----------|
| 0 — Pre-flight | `./01-pre-flight.md` | pre-flight JSON |
| 1 — Interview | `./02-interview.md` | question bank + collected answers |
| 2 — Standards | `./03-standards.md` | standards JSON |
| 3 — Stack | `./04-stack.md` | `.context/stack.md` |
| 4 — Architecture | `./05-architecture.md` | `.context/architecture.md` |
| 5 — Code style | `./06-code-style.md` | `.context/code-style.md` |
| 6 — Conventions (OPTIONAL) | `./07-conventions.md` | `.context/conventions.md` |
| 7 — Agents.md | `./08-agents-md.md` | `AGENTS.md` |
| 8 — Prune | `./09-prune.md` | stdout tables only |

There is **no** `.context/examples/` in this pack: every snippet in
`/bootstrap`'s examples must come from a real repo file, and a greenfield
project has none. The prescribed patterns live in `.context/code-style.md`
instead, each one labelled `[default]`.

### Step 0 — Pre-flight

Load `./01-pre-flight.md`.
Invoke the sub-agent with the contents of that file + the path to the
target repo. Wait for the result. If it fails, **do not continue** —
report to the user.

The pre-flight JSON carries the `stack_hint`, which selects the defaults
catalog file: `./defaults/_baseline.md` plus
`./defaults/<stack>.md` (for example `./defaults/node-typescript.md`).

**Resolve the catalog chain.** A framework catalog's `## Stack signature`
carries exactly one inheritance line — the literal form is:

```text
- Inherits from: `node-typescript`
```

The base catalogs carry none. When the selected catalog declares one, the
conductor resolves the chain: read the leaf, follow its `Inherits from:`
to the base, and keep going — building the resolved set **base first and
the leaf last**. The 4 chains (leaf → root) are:

- `react` → `node-typescript`
- `nextjs` → `react` → `node-typescript`
- `express` → `node-typescript`
- `fastapi` → `python`

Keep the set of visited ids: if the next id was already visited, stop at
the repeat and use the files read so far (a cycle is a content bug — the
pre-flight notes it, the pack still runs). The catalog set passed
downstream is the **baseline plus the full chain**.

If `greenfield` is `false` in the pre-flight result, the repo already
has substantive code to extract patterns from — tell the developer that
`/bootstrap` is the right command for a repo with existing code, and ask
whether to continue here anyway.

### Step 1 — Interview (main-thread transport)

Load `./02-interview.md`.
Ask the interviewer agent for the question bank, then relay each question
to the human, one per turn, and collect the answers.

**Do not** run the generator steps yet — the interview must complete first.

### Step 2 — Standards (main-thread transport)

Load `./03-standards.md`.
Pass the raw answers + the catalog content (`./defaults/_baseline.md`
plus the **resolved catalog chain**, base first and the leaf last) to the
interviewer agent and ask it to normalize the answers into the standards
JSON.

**Save this JSON in your context** — you will pass it complete to steps 3
through 7.

### Step 3 — Stack (.context/stack.md)

Load `./04-stack.md`.
Invoke the sub-agent passing:

- Contents of the sub-prompt file.
- Standards JSON (Step 2).
- Target repo path.

Expected output: `.context/stack.md` created in the target.

### Step 4 — Architecture (.context/architecture.md)

Same as above with `./05-architecture.md`. Input: standards JSON. Expected
output: `.context/architecture.md`.

### Step 5 — Code style (.context/code-style.md)

Same as above with `./06-code-style.md`. Input: standards JSON. Expected
output: `.context/code-style.md`.

### Step 6 — Conventions (.context/conventions.md) — OPTIONAL

Ask the user: "Do you want to generate `.context/conventions.md`? It is
optional if the project has no non-obvious contracts (response format,
auth, special headers, etc.)."

- If YES → same as above with `./07-conventions.md`. Input: standards JSON.
- If NO → mark it as skipped, continue to step 7.

### Step 7 — Agents.md (last, references the others)

Load `./08-agents-md.md`.
Invoke the sub-agent passing:

- Contents of the sub-prompt file.
- Standards JSON.
- List of `.context/` files generated in steps 3 to 6 (omit skipped ones).
- Target repo path.

Expected output: `AGENTS.md` at the root of the target.

### Step 8 — Prune + gap analysis (at the end, full context)

Load `./09-prune.md`.
Invoke the sub-agent passing:

- Contents of the sub-prompt file.
- Standards JSON (Step 2).
- Path to `.ai-toolkit.json` (state file of the target).
- Path to the target repo.

The sub-agent analyzes which resources were installed (agents, skills,
commands, prompts, MCPs) and cross-checks them against the `.context/`
files to determine:

- Which resources are NOT relevant to the project (candidates for removal).
- Which resources are MISSING but would be useful (suggestions for addition).

**Output**: stdout only (does NOT create any file). Two tables:

- Recommended removals (resource, type, reason, safe-to-remove).
- Suggested additions (resource, type, reason, install-command).

**Default**: dry-run (only reports, does NOT touch anything).
**With "apply" or "execute"**: the agent deletes the rows marked
`safe-to-remove: yes`.

The developer reviews the suggestions and decides.

## The interview (main-thread transport)

The human channel belongs to the conductor. The interviewer agent supplies
the *questions* and the *normalization*; it never talks to the human
directly.

1. Ask the interviewer agent (sub-agent type `context-interviewer`) for the
   question bank, passing the detected `stack_id` and the standards schema.
2. Relay the bank to the human, **one question per turn**.
3. Collect the raw answers. If an answer is ambiguous, ask the interviewer
   agent how to rephrase it (maximum 3 iterations per field).
4. If the human answers "use the defaults" at any point, stop asking. Every
   remaining question is skipped; the skipped fields take their origin
   from the catalog when a default exists, and `pending` otherwise.
5. Ask the interviewer agent to normalize the raw answers into the
   standards JSON.

The interviewer agent's contract is defined in `./02-interview.md`. Its two
output blocks are `📋 QUESTION_BANK` and `📋 STANDARDS`.

## Sub-agent invocation per tool

### Claude Code (Task)

For the generation steps (0, 3, 4, 5, 6, 7, 8):

```
Task(
  subagent_type: "general-purpose",
  description: "Greenfield Step 3 — Stack",
  prompt: `<contents of the sub-prompt file>

---

Additional input:
- Target repo: <path>
- Standards JSON: <the complete JSON if applicable>

Return only: the sub-prompt result (text of the generated file,
or structured error). Do NOT explain your reasoning to the conductor —
only the final output.`
)
```

For the interview steps (1 and 2):

```
Task(
  subagent_type: "context-interviewer",
  description: "Greenfield Step 1 — Question bank",
  prompt: `<contents of ./02-interview.md>

---

Additional input:
- stack_id: <detected stack id>
- Standards schema: <the schema block>

Return only the 📋 QUESTION_BANK block.`
)
```

Wait for the Task result before continuing to the next step.

### OpenCode

Invoke the interviewer agent as `@context-interviewer` and the generation
sub-agents with the native mechanism, passing the file contents as the
sub-agent prompt + additional input. Wait for the response before the
next step.

### Cursor

Unverified. The exact syntax depends on your version and configuration.

To invoke sub-agents in Cursor:

1. If you have a custom agent defined in `.cursor/agents/`, use `@agent-name <task>`.
2. If you use Cursor Composer (multi-file edits), open a new chat, paste the sub-prompt content as the first message, and pass the standards JSON + repo path as the second message.
3. Consult https://docs.cursor.com for the current syntax for your version.

Fallback: if neither option works, use the "Manual fallback" flow below.

### Cascade / Windsurf (native sub-agents)

Invoke the sub-prompt via the tool's native mechanism, passing the file
contents as the sub-agent prompt + additional input. Wait for the
response before the next step.

### Manual fallback

If the runtime does not support custom sub-agent types, the conductor
plays the interviewer itself:

1. Read `./02-interview.md` and the catalog file
   (`./defaults/_baseline.md` plus `./defaults/<stack>.md`).
2. Ask the human the Tier-1 questions in order, one per turn, then the
   Tier-2 questions of the detected stack's catalog file.
3. Apply the same rules: one question per turn, short option lists, at
   most 3 iterations per field, and the "use the defaults" escape hatch.
4. Normalize the answers into the standards JSON using the schema in
   `./03-standards.md`, applying the provenance rules.
5. Emit the identical `📋 STANDARDS` block.

The manual fallback must produce the same `📋 STANDARDS` block as the
agent path. If the two diverge, the agent path wins.

## If a sub-prompt fails

> **Note**: A pre-flight failure (`Step 0`) is the only one treated as
> fatal — without repo access, the following steps cannot run.
> For `Step 1` onward, offer the user retry/skip/abort.

- Report to the user what failed and why (include the sub-agent output).
- Ask: retry? skip? abort?
- **If retry** → do not continue until it passes.
- **If skip** → mark it as skipped and continue with the next one. Warn
  that the output may be incomplete.
- **If abort** → stop the chain. Report what completed and what remained
  pending.

If the interview fails, the chain cannot continue past Step 2: the
standards JSON is the input of every generator step.

## End-to-end example

```
Developer: /greenfield

Conductor → Step 0 (sub-agent): reads the target dir.
            → {"read_access":"ok","write_access":"ok","stack_detected":"ok",
               "stack_hint":"node-typescript","greenfield":false,
               "notes":["package.json found"]}

Conductor → Step 1 (interviewer agent): 📋 QUESTION_BANK with 12 Tier-1
            questions + 4 Tier-2 questions for node-typescript.
Conductor → Human: "Which stack are you starting with — language, version
            and package manager?" (one question per turn)
            … 16 questions asked, 16 answers collected …

Conductor → Step 2 (interviewer agent): raw answers + catalog content.
            → 📋 STANDARDS with 45 leaves, each carrying an origin.

Conductor → Step 3 (sub-agent): standards JSON + ./04-stack.md
            → .context/stack.md
Conductor → Step 4 (sub-agent): → .context/architecture.md
Conductor → Step 5 (sub-agent): → .context/code-style.md
Conductor → Step 6: developer declined → skipped
Conductor → Step 7 (sub-agent): → AGENTS.md
Conductor → Step 8 (sub-agent): → two stdout tables (dry-run)
```

## After the chain

- Report which files were created and which step was skipped.
- Report the `open_questions` — the fields whose origin is `pending`. Those
  are the decisions the developer still has to make; they are listed in the
  standards JSON and are visible in the generated `.context/` files as
  `[pending]` markers.
- Suggest `/greenfield` again later, once the pending fields are decided:
  re-running the chain is idempotent and only rewrites what changed.
