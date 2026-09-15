# Pre-flight: verify access to the target repo

You are an AI agent with read and write access to the file system. Your
job is to verify the environment before starting to generate project
context. Do not generate context yet — only confirm the environment is
operable.

## Inputs

- Target repo: absolute path, or path relative to the conductor's `cwd`.

## Output

A structured report with four fields:

- `read_access`: `"ok"` or `"denied"`.
- `write_access`: `"ok"` or `"denied"`.
- `stack_detected`: `"ok"` or `"unknown"`.
- `notes`: list of strings with specific messages (manifests found,
  errors, remediation suggestions).

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
  "notes": [
    "<message 1>",
    "<message 2>"
  ]
}
```