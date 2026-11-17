# Pre-flight: verify access and detect the stack (greenfield)

You are an AI agent with read and write access to the file system. Your
job is to verify the environment before starting to generate project
context for a **brand-new project**. Do not generate context yet — only
confirm the environment is operable and classify the stack.

## Inputs

- Target repo: absolute path, or path relative to the conductor's `cwd`.

## Output

A structured report with six fields:

- `read_access`: `"ok"` or `"denied"`.
- `write_access`: `"ok"` or `"denied"`.
- `stack_detected`: `"ok"` or `"unknown"` — did you find a recognizable
  manifest?
- `stack_hint`: which defaults catalog file the greenfield pack must load.
  The vocabulary is exactly:
  `node-typescript | python | react-native | react | nextjs | express | fastapi | php | android | ios | unknown`
- `greenfield`: `true` or `false` — does this repo lack substantive
  content to extract patterns from? `true` is the default; `false` means
  the repo already holds substantive content to extract patterns from.
- `notes`: list of strings with specific messages (manifests found, errors,
  remediation suggestions, and the evidence behind the `greenfield`
  decision).

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
  `composer.json`, `build.gradle`, `Package.swift`, etc., as applicable.

If you cannot read files from the repo:

- Return `read_access: "denied"`.
- In `notes`, indicate: "I have no read access to the repo. Paste the
  key files manually (`README.md`, manifests) or use a tool with file
  search enabled."

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

### 3. Stack detection (manifest scan)

**Precedence — first match wins.** When more than one rule below matches,
apply this order and take the first rule that fires:

`react-native` → `nextjs` → `express` → `react` → `fastapi` → `android` → `ios` → `php` → `python` → `node-typescript` → `unknown`

Every rule is stated with the reason it wins:

- `react-native` **wins over** `react` — a React Native project includes
  React.
- `react-native` **wins over** `android` and `ios`, because a React
  Native / Expo project carries native `android/` and `ios/` subprojects
  (Gradle and Xcode files) that would otherwise fire the Android and iOS
  rules.
- `nextjs` **wins over** `react` (Next.js includes React) and over
  `node-typescript` (a Next.js project is more than a bare `package.json`).
- `express` **wins over** `react` — an `express` dependency implies a
  **server-side project shape** (routing, middleware, layering) that is
  more structurally consequential than a UI library, and React is
  frequently present **transitively** (a dashboard's server rendering, a
  shared UI package). The server shape decides the architecture defaults,
  so it outranks the UI library.
- `fastapi` **wins over** `python` — FastAPI *is* a Python project; the
  same shape as `react-native` over `react`.
- `node-typescript` is the **least specific** rule (a bare `package.json`),
  so it loses to every other match.
- When **no** rule matches, the result is `unknown`.

**Known limitation.** The pack selects **one** catalog: a polyglot repo
that matches several frameworks resolves to **one** catalog — the first
match in the precedence chain wins. A React + Express monorepo resolves to
**one** catalog (`express`); a React + FastAPI monorepo resolves to **one**
catalog (`react`, because `react` outranks `fastapi` in the chain). The
interview's **q1** lists every stack id, so the developer can override the
detected choice — the catalog file for the chosen stack is the one used.

Look for manifests at the top level of the repo:

- `package.json` → `node-typescript`.
- `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py`, `setup.cfg`
  → `python`.
- `app.json` with an `expo` key, `expo` in `package.json` dependencies,
  `babel.config.js` + `metro.config.js` → `react-native`.
- `next` in `package.json` dependencies (or `devDependencies`), or a
  top-level `next.config.js` / `next.config.mjs` / `next.config.ts` /
  `next.config.cjs` → `nextjs`.
- `react` in `package.json` dependencies (or `devDependencies`), **and** no
  `next`/`expo` marker → `react`.
- `express` in `package.json` dependencies (or `devDependencies`) →
  `express`.
- `fastapi` in `pyproject.toml` dependencies (`[project].dependencies` /
  `[tool.poetry.dependencies]`) or in a `requirements*.txt` → `fastapi`.
- `composer.json` → `php`.
- `build.gradle`, `build.gradle.kts`, `settings.gradle`,
  `settings.gradle.kts`, `gradle.properties` → `android`.
- `Package.swift`, `*.xcodeproj`, `*.xcworkspace`, `Podfile` → `ios`.

Any other manifest (`go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`,
`pubspec.yaml`, `mix.exs`, `deno.json`, `*.csproj`, `Package.resolved`
without an Xcode project, …) means the stack is **not** in the catalog:
return `stack_hint: "unknown"`.

If you found at least one recognizable manifest:

- Return `stack_detected: "ok"`.
- In `notes`, list the manifest(s) found (with the `name` or `package`
  field if available).

If you did NOT find any recognizable manifest:

- Return `stack_detected: "unknown"`.
- Return `stack_hint: "unknown"`.
- In `notes`, indicate: "The repo has no recognizable manifest. The
  generic baseline defaults will be used and every stack-specific field
  stays pending until the interview confirms it."

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
with `package.json` returns `stack_detected: "ok"` and
`stack_hint: "node-typescript"` **and** `greenfield: true` — a scaffold
is not substantive. The absence of a manifest no longer implies
greenfield, and a manifest never implies `greenfield: false`. The
`stack_hint` selection is unchanged: a recognized manifest still selects
the defaults catalog file, whatever the greenfield flag says.

**The `notes` entry must record the evidence**: what was found, and why
it is (or is not) substantive. Example shape:

> "Found package.json and 3 scaffold files (index.js with a console.log,
> README.md with no technical content) — no substantive content to extract
> patterns from; greenfield: true."

> A `greenfield: true` result means this pack is the right one. If the
> repo already holds substantive content, `/bootstrap` is the right
> command — it extracts the context from what the code already says.

## If any check fails

**Stop**. Do not proceed to the interview or to generation. Return the
report with the field as `"denied"` or `"unknown"` and a specific message
in `notes`. The conductor will decide how to proceed (ask the user, abort,
etc.).

## Rules

- Do not improvise — if you cannot verify, report `"unknown"`.
- Do not run destructive actions (install packages, delete project files,
  commit, etc.).
- The write test must be cleaned up afterwards — do not leave the
  `.write-test` file in the target.
- Do not read manifest contents in depth at this step: the interview and
  the standards step handle that. Only confirm they exist.
- `stack_hint` must be one of exactly eleven values:
  `node-typescript | python | react-native | react | nextjs | express | fastapi | php | android | ios | unknown`. Never invent a new one.

## Output format

Return ONLY a JSON object with this shape. No explanations, no markdown:

```json
{
  "read_access": "ok|denied",
  "write_access": "ok|denied",
  "stack_detected": "ok|unknown",
  "stack_hint": "node-typescript|python|react-native|react|nextjs|express|fastapi|php|android|ios|unknown",
  "greenfield": true,
  "notes": [
    "<message 1>",
    "<message 2>"
  ]
}
```
