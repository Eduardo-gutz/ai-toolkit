# Conductor: project bootstrap (AGENTS.md + .context/)

You are the orchestrator. Your job is to generate the project's context
guide by running 9 sub-prompts in strict sequence, one at a time, each
as a sub-agent with isolated context.

## Pre-condition

Before starting, verify that your tool supports sub-agent delegation
(delegating to a sub-agent with its own prompt and context separate
from the conductor). If it does not, tell the user:

> "Your tool does not support sub-agents. To use this flow, run the
>  prompts manually. List in order:
>  1. ./01-pre-flight.md
>  2. ./02-discovery.md
>  3. ./03-stack.md
>  4. ./04-architecture.md
>  5. ./05-code-style.md
>  6. ./06-conventions.md (optional)
>  7. ./07-examples.md
>  8. ./08-agents-md.md
>  9. ./09-prune.md
>
>  Open a new chat for each one, paste the content as the system prompt,
>  and pass the result to the next one."

## Hard rules

1. **Strictly sequential** — do not advance to step N+1 until N is complete.
2. **Total isolation** — each sub-prompt runs in its own sub-agent. The
   sub-agent does not see your history.
3. **One task per invocation** — never combine two steps into the same
   sub-agent.
4. **Idempotent** — if the destination file already exists, the sub-agent
   must ask before overwriting (except `AGENTS.md`, which has its own
   rules in its prompt — see `08-agents-md.md`).
5. **Do not run the sub-prompts yourself** — always delegate to the
   sub-agent. The conductor orchestrates; it does not generate target
   content.
6. **Output language** — the output of each sub-prompt goes in the
   developer's language (if unclear, default to English; use Spanish if
   the developer prefers Spanish).
7. **The discovery result is structured JSON** (see `02-discovery.md`).
   Pass it complete to the input of each subsequent sub-prompt.

## Chain

### Step 0 — Pre-flight

Load `./01-pre-flight.md`.
Invoke the sub-agent with the contents of that file + the path to the
target repo. Wait for the result. If it fails, **do not continue** —
report to the user.

#### Greenfield branch

If the pre-flight result carries `greenfield: true`, the repo has
nothing substantive to extract from. Before running step 1, explain the
two commands to the developer:

- `/bootstrap` — **extractive**: reads the code that already exists and
  produces `.context/` + `AGENTS.md` from what it finds.
- `/greenfield` — **generative**: for a project with nothing substantive
  to extract from yet; interviews the developer for their standards and
  fills the rest from the detected stack's defaults.

Then warn the developer: in a repo with nothing substantive to extract
from, `/bootstrap` has nothing to extract and would produce empty or
pending context.

Then ask: "This project looks new — switch to `/greenfield`?"

- **Yes** → **stop the chain**: steps 1–8 do not run. Tell the developer
  to start `/greenfield` in a clean turn.
- **No** → continue with `/bootstrap` as usual (step 1 onward).

### Step 1 — Discovery

Load `./02-discovery.md`.
Invoke the sub-agent. The output is a structured JSON (schema defined in
`02-discovery.md`).
**Save this JSON in your context** — you will pass it to steps 2 through 7.

### Step 2 — Stack (.context/stack.md)

Load `./03-stack.md`.
Invoke the sub-agent passing:

- Contents of the sub-prompt file.
- Discovery JSON (Step 1).
- Target repo path.

Expected output: `.context/stack.md` created in the target.

### Step 3 — Architecture (.context/architecture.md)

Same as above with `04-architecture.md`. Input: discovery JSON. Expected
output: `.context/architecture.md`.

### Step 4 — Code style (.context/code-style.md)

Same as above with `05-code-style.md`. Input: discovery JSON. Expected
output: `.context/code-style.md`.

### Step 5 — Conventions (.context/conventions.md) — OPTIONAL

Ask the user: "Do you want to generate `.context/conventions.md`? It is
optional if the project has no non-obvious contracts (response format,
auth, special headers, etc.)."

- If YES → same as above with `06-conventions.md`. Input: discovery JSON.
- If NO → mark it as skipped, continue to step 6.

### Step 6 — Examples (.context/examples/)

Same as above with `07-examples.md`. Input: discovery JSON + list of
`.context/` files already generated (steps 2 to 5; omit skipped ones).
Expected output: at least 3 files in `.context/examples/` (one per
recurring pattern in the repo).

### Step 7 — Agents.md (last, references the others)

Load `./08-agents-md.md`.
Invoke the sub-agent passing:

- Contents of the sub-prompt file.
- Discovery JSON.
- List of `.context/` files generated in steps 2 to 6 (omit skipped ones).
- List of `examples/` files generated in step 6.
- Target repo path.

Expected output: `AGENTS.md` at the root of the target.

### Step 8 — Prune + gap analysis (at the end, full context)

Load `./09-prune.md`.
Invoke the sub-agent passing:

- Contents of the sub-prompt file.
- Discovery JSON (Step 1).
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

## If a sub-prompt fails

> **Note:** A pre-flight failure (`Step 0`) is the only one treated as
> fatal — without repo access, the following steps cannot run.
> For `Step 1` onward, offer the user retry/skip/abort.

- Report to the user what failed and why (include the sub-agent output).
- Ask: retry? skip? abort?
- **If retry** → do not continue until it passes.
- **If skip** → mark it as skipped and continue with the next one. Warn
  that the output may be incomplete.
- **If abort** → stop the chain. Report what completed and what remained
  pending.

## Sub-agent invocation per tool

### Claude Code (Task)

```
Task(
  subagent_type: "general-purpose",
  description: "Bootstrap Step 1 — Pre-flight",
  prompt: `<contents of the sub-prompt file>

---

Additional input:
- Target repo: <path>
- Discovery JSON: <the complete JSON if applicable>

Return only: the sub-prompt result (text of the generated file,
or structured error). Do NOT explain your reasoning to the conductor —
only the final output.`
)
```

Wait for the Task result before continuing to the next step.

### Cursor

Unverified. The exact syntax depends on your version and configuration.

To invoke sub-agents in Cursor:

1. If you have a custom agent defined in `.cursor/agents/`, use `@agent-name <task>`.
2. If you use Cursor Composer (multi-file edits), open a new chat, paste the sub-prompt content as the first message, and pass the discovery JSON + repo path as the second message.
3. Consult https://docs.cursor.com for the current syntax for your version.

Fallback: if neither option works, use the "Manual (no sub-agents)" flow below.

### Cascade / Windsurf (native sub-agents)

Invoke the sub-prompt via the tool's native mechanism, passing the file
contents as the sub-agent prompt + additional input. Wait for the
response before the next step.

### Manual (no sub-agents)

For each step:

1. Open a new chat in your tool.
2. Paste the sub-prompt file contents as the system prompt or first
   instruction.
3. Paste the discovery JSON + repo path as the second message (user
   message).
4. Wait for the agent's full response.
5. Copy the output and apply it manually to the target (create the file
   with the content the agent returned).
6. Return to the main chat and say: "Step N complete. Output: [1-2 line
   summary]".

## End-to-end example (Claude Code, Node + Express + Prisma repo)

Developer: "I have a new repo at `/tmp/example`. Run the bootstrap
conductor."

Conductor (turn 1):
- Verifies the Task tool is available.
- Calls `Task(subagent_type="general-purpose", prompt=01-pre-flight.md
  + "/tmp/example")`.
- Sub-agent result: "Access OK. Stack detected: Node 20 + Express +
  Prisma".

Conductor (turn 2):
- Calls `Task` with `02-discovery.md` + "/tmp/example".
- Result: JSON with `repo`, `manifests`, `structure`, `samples`,
  `cross_cutting`, `conventions_observed`.

Conductor (turn 3):
- Saves the discovery JSON in its context.
- Calls `Task` with `03-stack.md` + discovery JSON + "/tmp/example".
- Result: `.context/stack.md` created with 7 technologies.

Conductor (turns 4 to 7):
- Same pattern for architecture, code-style, conventions (if
  applicable), examples.
- Each returns: "File X created".

Conductor (turn 8):
- Calls `Task` with `08-agents-md.md` + discovery + `.context/` list +
  "/tmp/example".
- Result: "AGENTS.md created with an index of 5 `.context/` files".

Conductor (turn 9, final):
"Chain complete. Files created:
- .context/stack.md
- .context/architecture.md
- .context/code-style.md
- .context/conventions.md (optional generated)
- .context/examples/{router,service,test}.md (3 files)
- AGENTS.md
Total: 8 files. 0 failures. 0 skipped (conventions generated)."

## After the chain

Summarize for the user:

- Files created (with full paths).
- Files skipped (conventions if not generated).
- Files failed (if any, with the reason).
- Approximate time (if available).
- **Prune + gap suggestions (Step 8)** — always, even if the list is empty.

If the user wants to iterate on a generated file, they can ask to
regenerate just that step by invoking the corresponding sub-prompt
(e.g. "regenerate `.context/stack.md`" → conductor runs only step 2).

If the user approves the prune suggestions, they can invoke step 8
with "apply" or "execute" so the agent deletes the safe-to-remove
resources.