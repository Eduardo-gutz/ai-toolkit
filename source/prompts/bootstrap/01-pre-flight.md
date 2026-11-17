# Pre-flight: verify access to the target repo

You are an AI agent with read and write access to the file system. Your
job is to verify the environment before starting to generate project
context. Do not generate context yet — only confirm the environment is
operable.

## Inputs

- Target repo: absolute path, or path relative to the conductor's `cwd`.

## Output

A structured report with five fields:

- `read_access`: `"ok"` or `"denied"`.
- `write_access`: `"ok"` or `"denied"`.
- `stack_detected`: `"ok"` or `"unknown"`.
- `greenfield`: `true` or `false` — does this repo lack substantive
  content to extract patterns from? `true` is the default; `false` means
  the repo already holds substantive content to extract patterns from.
- `notes`: list of strings with specific messages (manifests found,
  errors, remediation suggestions, and the evidence behind the
  `greenfield` decision).

If something failed, return the field as `"denied"` or `"unknown"` as
applicable and explain the specific failure in `notes` (do not return a
"everything OK" report if any check failed).

## Checks

### 1. Read access

Verify you can list and read the target repo:

- `ls <repo-target>` or native equivalent — should list at least one
  file (usually a manifest or a README).
- `cat <repo-target>/README.md` (if it exists) — should return content.
- List 2 or 3 expected manifests: `package.json`, `pyproject.toml`,
  `go.mod`, `Cargo.toml`, `pom.xml`, etc., as applicable.

If you cannot read files from the repo:

- Return `read_access: "denied"`.
- In `notes`, indicate: "I have no read access to the repo. Paste the
  key files manually (`README.md`, manifests, 2-3 representative code
  files) or use a tool with file search enabled."

### 2. Write access

Verify you can create files in the target:

- `mkdir -p <repo-target>/.context` (or equivalent — `New-Item -ItemType
  Directory` in PowerShell).
- `echo test > <repo-target>/.context/.write-test` (or `os.WriteFile`).
- Verify the file exists with `ls` or `cat`.
- Clean up: `rm <repo-target>/.context/.write-test`. If the file was
  created inside a `.context/` directory that did not exist before, you
  may leave the directory; do not delete `.context/` entirely.

If you cannot write to the target:

- Return `write_access: "denied"`.
- In `notes`, indicate: "I have read access but no write access to
  `<path>`. Tell me if you want me to generate the files elsewhere or
  pass them as code blocks for you to paste manually."

### 3. Basic stack detection

Look for manifests at the top level of the repo:

- `package.json` → Node/JavaScript/TypeScript.
- `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py`, `setup.cfg`
  → Python.
- `go.mod` → Go.
- `Cargo.toml` → Rust.
- `pom.xml`, `build.gradle`, `build.gradle.kts` → Java/Kotlin.
- `composer.json` → PHP.
- `Gemfile` → Ruby.
- `pubspec.yaml` → Dart/Flutter.
- `mix.exs` → Elixir.
- `deno.json`, `deno.jsonc` → Deno.

If you found at least one recognizable manifest:

- Return `stack_detected: "ok"`.
- In `notes`, list the manifest(s) found (with the `name` or `package`
  field if available).

If you did NOT find any recognizable manifest:

- Return `stack_detected: "unknown"`.
- In `notes`, indicate: "The repo has no recognizable manifest. Paste
  the stack manually or tell me what it is before continuing."

### 4. Greenfield detection

**Greenfield is the default.** The repo is `greenfield: true` unless it
holds substantive material to derive standards from. The mere existence
of directories or files is irrelevant — a repo can be full of files and
still be greenfield.

`greenfield: false` requires **substantive content**. The repo contains
at least one of:

- **Source files that implement real behavior** beyond generator
  boilerplate (domain logic, not a template entry point).
- **A meaningful test suite** — assertions against real behavior, not a
  placeholder (`expect(1).toBe(1)`, `assert True`).
- **Lint/format configuration with non-default rules**, or a pre-commit
  configuration.
- **Several distinct modules/packages** that already show an established,
  repeated pattern worth extracting.

The following are explicitly **NOT substantive** — on their own they
never turn the flag to `false`:

- Empty directories.
- Boilerplate repo files: `.gitignore`, `LICENSE`, `CHANGELOG.md`,
  `.editorconfig`, lockfiles (`package-lock.json`, `poetry.lock`,
  `Podfile.lock`, …).
- A `README.md` with no technical content (a title and a one-line
  description).
- Tooling directories (`.git/`, `.idea/`, `.vscode/`, `node_modules/`)
  and build outputs (`dist/`, `build/`, `.next/`, `coverage/`,
  `DerivedData/`, `vendor/`).
- Generator boilerplate: `index.js`/`main.ts` with only a
  `console.log`/hello-world, `__init__.py`, a hello-world `main.py`, an
  `App.tsx` from a template, `MainActivity.kt`/`MainActivity.java` from
  the Android template, `ContentView.swift`/`AppDelegate.swift` from the
  Xcode template, `create-expo-app` output, a bare `AndroidManifest.xml`.
- A single placeholder test.
- Config files whose values are all defaults or generated.

**Tie-breaker: when in doubt → `greenfield: true`.**

**The manifest scan is fully independent of the greenfield flag.** A repo
with `package.json` returns `stack_detected: "ok"` **and**
`greenfield: true` — a scaffold is not substantive. The absence of a
manifest no longer implies greenfield, and a manifest never implies
`greenfield: false`. The broad manifest detection above is unchanged: it
still selects no stack catalog file.

**The `notes` entry must record the evidence**: what was found, and why
it is (or is not) substantive — so the redirect suggestion is auditable.
Example shape:

> "Found package.json and 3 scaffold files (index.js with a console.log,
> README.md with no technical content) — no substantive content to extract
> patterns from; greenfield: true. The extractive bootstrap has nothing
> substantive to extract; `/greenfield` is the right command for this
> project."

> This check does NOT change the manifest detection above: the
> extractive pack keeps its broad manifest list and selects no stack
> catalog file. The two checks are now **fully independent**:
> `greenfield` is an additional signal only, decided by relevance, never
> by the presence or absence of a manifest.

## If any check fails

**Stop**. Do not proceed to discovery or generation. Return the report
with the field as `"denied"` or `"unknown"` and a specific message in
`notes`. The conductor will decide how to proceed (ask the user, abort,
etc.).

## Rules

- Do not improvise — if you cannot verify, report `"unknown"`.
- Do not run destructive actions (install packages, delete project
  files, commit, etc.).
- The write test must be cleaned up afterwards — do not leave the
  `.write-test` file in the target.
- Do not read manifest contents in depth at this step: discovery handles
  that. Only confirm they exist.

## Output format

Return ONLY a JSON object with this shape. No explanations, no markdown:

```json
{
  "read_access": "ok|denied",
  "write_access": "ok|denied",
  "stack_detected": "ok|unknown",
  "greenfield": true,
  "notes": [
    "<message 1>",
    "<message 2>"
  ]
}
```