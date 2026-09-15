# Discovery: analyze the target repo

Your job is to read the repo and produce a structured JSON summary that
other sub-prompts will consume. You do NOT generate context yet — you
only produce the discovery JSON. File generation lives in steps 2 to 7
of the conductor.

## Inputs

- Target repo: absolute path or relative to the conductor's `cwd`.
- Pre-flight result (optional, only to confirm access works).

## Output (strict JSON)

Return ONLY the JSON. No explanations, no markdown, no surrounding
prose. The conductor will parse it and pass it to the following steps.

```json
{
  "repo": {
    "path": "<absolute path of the repo>",
    "stack": "node|python|go|rust|java|kotlin|php|ruby|dart|elixir|deno|typescript|javascript|csharp|swift|unknown",
    "framework": "<main framework or null>",
    "language_version": "<exact version from manifest or 'unknown'>",
    "package_manager": "npm|pnpm|yarn|bun|poetry|pip|cargo|go mod|maven|gradle|composer|bundle|pub|hex|deno|unknown",
    "test_framework": "<main framework or null>",
    "linter": "<linter or null>",
    "formatter": "<formatter or null>"
  },
  "manifests": {
    "<manifest name>": {
      "<key manifest fields>"
    }
  },
  "structure": {
    "type": "monorepo|layered|feature-based|flat|hybrid|unknown",
    "top_dirs": [
      "<top-level dirs of the repo>"
    ],
    "src_dirs": [
      "<dirs inside the source code, up to 1 level deep>"
    ]
  },
  "samples": {
    "router": "<path to the most representative router/controller or null>",
    "service": "<path to the most representative service/use case or null>",
    "model": "<path to the most representative model/DTO/entity or null>",
    "test": "<path to the most representative real test, not a hello-world template, or null>",
    "ui_component": "<path to the most representative UI component or null if not applicable>",
    "config_or_migration": "<path to the most representative config/migration file or null if not applicable>"
  },
  "cross_cutting": {
    "auth": "<how auth is implemented, or 'none'>",
    "logging": "<what is used for logging, or 'none'>",
    "errors": "<how errors are handled, or 'unknown'>",
    "validation": "<how input is validated, or 'none'>",
    "i18n": "<framework or 'none'>",
    "cache": "<caching strategy, or 'none'>",
    "feature_flags": "<feature flags system, or 'none'>",
    "rate_limiting": "<rate limiting strategy, or 'none'>"
  },
  "existing_docs": [
    "<relative paths of existing docs/guide files>"
  ],
  "conventions_observed": {
    "naming_files": "<observed pattern, e.g. 'kebab-case.ts'>",
    "naming_classes": "<observed pattern or 'unknown'>",
    "naming_functions": "<observed pattern or 'unknown'>",
    "naming_variables": "<observed pattern or 'unknown'>",
    "naming_constants": "<observed pattern or 'unknown'>",
    "imports_order": "<observed order or 'unknown'>",
    "error_handling_pattern": "<try/catch, Result type, exceptions, etc., or 'unknown'>",
    "async_pattern": "callback|promise|async-await|rxjs|coroutines|goroutines|unknown",
    "export_style": "named|default|both|unknown",
    "test_naming": "<observed pattern, e.g. '*.test.ts' or '*.spec.py'>"
  },
  "ci_cd": {
    "platform": "github-actions|gitlab-ci|bitbucket-pipelines|circleci|jenkins|travis|none",
    "checks": [
      "<list of observable CI checks (lint, test, build, etc.)>"
    ]
  },
  "env_and_secrets": {
    "env_file": "<path to .env.example or similar, or null>",
    "secrets_manager": "<Vault, AWS Secrets Manager, Doppler, etc., or 'none'>",
    "config_strategy": "<how config is loaded (dotenv, figlet, etc.) or 'unknown'>"
  }
}
```

## How to derive each field

### 1. Stack and versions (`repo.*`)

Read the manifests at the top level:

- `package.json` → `engines.node`, `dependencies`, `devDependencies`.
- `pyproject.toml` → `[project]`, `[tool.poetry.dependencies]`,
  `[tool.poetry.group.*.dependencies]`.
- `go.mod` → the first line `go X.Y`.
- `Cargo.toml` → `[package].version` and `[dependencies]`.
- `pom.xml` or `build.gradle*` → `<java.version>` or `sourceCompatibility`.
- `composer.json` → `require`.
- `Gemfile` and `*.gemspec` → versions.
- `pubspec.yaml` → `environment`.
- `deno.json` or `deno.jsonc` → `tasks`, `imports`.

Report **exact** versions (do not put `^1.0.0` if the lockfile has
`1.2.3`; consult the lockfile if it exists).

### 2. Complete manifests (`manifests.*`)

For each relevant manifest, include the key fields in a sub-object
(omit fields that do not apply or are noise):

- `package.json` → `name`, `version`, `type`, `scripts`, `engines`,
  `dependencies`, `devDependencies`.
- `pyproject.toml` → `name`, `version`, `requires-python`, `dependencies`,
  `[tool.*]`.
- `go.mod` → `module`, `go`, `require`.
- Etc.

Do not copy the entire file — only the fields that matter so a
subsequent sub-prompt can generate context without re-parsing.

### 3. Structure (`structure.*`)

List `top_dirs` with `ls <repo>` (excluding loose files like
`.gitignore`). Then, for each directory that looks like source code
(`src/`, `app/`, `lib/`, `pkg/`, `cmd/`, `internal/`, `app/`), list one
more level of subdirectories.

For `type`, infer heuristically:

- `monorepo` → if there are `packages/`, `apps/`, `services/`, `libs/`
  or a workspace config (`pnpm-workspace.yaml`, `lerna.json`,
  `nx.json`, `turbo.json`).
- `layered` → if there is clear separation like `controllers/`,
  `services/`, `models/`, `repositories/` (or `routers/`, `handlers/`).
- `feature-based` → if there are folders by domain/feature
  (`users/`, `auth/`, `billing/`) rather than by technical layer.
- `flat` → everything is almost at the same level, no clear structure.
- `hybrid` → mix of layers and features (e.g.
  `app/users/{controllers,services,models}/`).
- `unknown` → could not infer with certainty.

### 4. Samples (`samples.*`)

Pick real files, not the simplest nor the most complex. Rules:

- `router`: the most "typical" endpoint — POST for create or GET for
  list with auth/validation. Avoid health checks or debug endpoints.
- `service`: the most representative business logic — something with
  composition of calls, not a trivial getter.
- `model`: the central domain entity (not an auxiliary join table).
- `test`: a test with several `expect`/`assert` calls and at least one
  mock or fixture (not the `1 + 1 === 2` boilerplate).
- `ui_component`: if the repo has UI, a component with state, typed
  props and styles (not a trivial wrapper).
- `config_or_migration`: the file that defines the persistent data
  structure (Prisma schema, initial migration, SQLAlchemy model).

If you did not find a valid sample for a category, return `null` for
that key. Do not invent.

### 5. Cross-cutting concerns (`cross_cutting.*`)

For each concern, look for evidence in the code:

- `auth`: is there auth middleware? JWT, session, OAuth? Where is it
  defined?
- `logging`: which library? Is there a logger configured in the entry
  point?
- `errors`: is there a base error class? Is `try/catch` or Result types
  used? Is there a centralized error middleware?
- `validation`: Zod, Joi, Pydantic, class-validator? Where is it called?
- `i18n`: are there translation files? Which library?
- `cache`: Redis, in-memory memoization, HTTP caching headers?
- `feature_flags`: LaunchDarkly, Unleash, env vars?
- `rate_limiting`: express-rate-limit, slowapi, nginx?

If you found no evidence, return `"none"`.

### 6. Existing documentation (`existing_docs`)

List relative paths (to the root of the target repo) for:

- `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- Any file in `docs/`.
- Previous `AGENTS.md` (if it exists, important for step 7).
- `.cursor/`, `.windsurf/`, `.github/copilot-instructions.md`.
- Any style guide in the repo (`STYLE.md`, `docs/style.md`, etc.).

### 7. Observed conventions (`conventions_observed.*`)

Infer from samples, not documentation. Looking at the actual files:

- `naming_files`: kebab-case, snake_case, camelCase, PascalCase? With or
  without duplicated extension (`*.test.ts` vs `*.spec.ts`)?
- `naming_classes`: PascalCase by convention, is it respected?
- `naming_functions`: camelCase (JS/TS/Java/Python) or snake_case
  (Python/Ruby) depending on the language.
- `naming_variables`: is there a prefix (`_`, `$`, `g_`, `m_`)?
- `imports_order`: are they ordered (alphabetical, by layer, etc.)? Is
  there a separate import group for third-party?
- `error_handling_pattern`: try/catch? Result/Either? custom exceptions?
- `async_pattern`: promises, async-await, callbacks, observables?
- `export_style`: named exports, default exports, a mix?
- `test_naming`: `*.test.ts`, `*.spec.ts`, `test_*.py`, `*_test.go`?

If you cannot infer with confidence, return `"unknown"`.

### 8. CI/CD (`ci_cd.*`)

Look for `.github/workflows/`, `.gitlab-ci.yml`,
`bitbucket-pipelines.yml`, `.circleci/`, `Jenkinsfile`, `.travis.yml`.
Identify the platform and the most visible checks (`lint`, `test`,
`build`, `deploy`, etc.).

### 9. Environment and secrets (`env_and_secrets.*`)

- `env_file`: is there `.env.example`, `.env.template`, `.env.sample`?
- `secrets_manager`: is there integration with Vault, AWS Secrets
  Manager, Doppler?
- `config_strategy`: dotenv, figlet, conf, viper, pydantic-settings?

## Absolute rules

- If you cannot read a file, set the field to `null` or `"unknown"` —
  do not invent.
- If the repo has no manifests, return `repo.stack: "unknown"` and warn
  in the pre-flight `notes` (do not add it here).
- If you found no samples for a category, return `null` for that key.
- Cite real paths with `path/to/file:line` when reporting something
  concrete (in the sample description, not in the final JSON — the JSON
  is paths only).
- **Return ONLY the JSON**. No explanations, no prose, no markdown.
  The conductor will parse it.

## If pre-flight failed

**Do not continue**. Return the same JSON with all fields as `null` or
`"unknown"` and an extra `error` field with the failure description.