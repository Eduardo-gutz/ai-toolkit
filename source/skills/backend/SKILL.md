---
name: backend
description: >
  Backend and APIs across any stack (Node, Python, Go, PHP, Java, Ruby, Rust, etc.) and any DB. Use when implementing, refactoring, reviewing, or testing services, repositories, controllers, endpoints, business logic, persistence, integrations, queues, jobs, workers, events, GraphQL resolvers, gRPC services. Prescribes modular architecture: `core/` (cross-cutting infra) + `modules/<feature>/` (self-contained: models, schemas, repositories, service, routes, dependencies). Trigger phrases: implement endpoint, create service, add repository, API REST, handler, controller, middleware, migration, integration test, etc. Do NOT use for frontend, native mobile, or pure DevOps.
---

# Backend General

Apply this skill when the agent operates on the **backend and API layer of a system**. The skill is **stack-agnostic** and **DB-agnostic**: it captures the rules that hold across Node, Python, Go, PHP, Java, Ruby, Rust, and any database. Stack-specific conventions (e.g., "use NestJS decorators", "migrations with Alembic") belong to a separate stack-specific skill, not here.

**Scope.** HTTP/REST/GraphQL/gRPC endpoints, application services, data repositories, domain logic, integrations with external services, background queues and jobs, domain events, authentication and authorization, input validation, persistence, migrations, observability, and the test suite that covers them. Cross-layer: if a feature crosses to the client (UI), define the API contract in code and emit the handoff; do not improvise the presentation layer.

---

## 1. Stack detection (do this first)

Before writing any code, identify the project's stack by reading the manifests:

| Manifest / Path | What it tells you |
|---|---|
| `package.json` | Node/JS/TS — framework, runtime, scripts, ORM/ODM, validators |
| `pyproject.toml` / `requirements.txt` / `setup.py` / `Pipfile` | Python — framework, ORM, validators, ASGI/WSGI server |
| `go.mod` | Go — modules, libraries, DB driver |
| `composer.json` | PHP — framework, packages, migrations |
| `pom.xml` / `build.gradle` / `build.gradle.kts` | Java/Kotlin — framework, dependencies |
| `Gemfile` | Ruby — framework, gems |
| `Cargo.toml` | Rust — crates, framework |
| `Dockerfile` / `docker-compose.yml` | Services, DB, queues, cache — topology |
| `prisma/schema.prisma` / `drizzle.config.*` / `alembic.ini` / `artisan` | ORM/migrations |
| `migrations/`, `db/migrate/`, `*.sql` | DB schema |
| `tests/`, `__tests__/`, `*_test.go`, `*_test.py`, `*.test.ts` | Test framework |
| `openapi.yaml` / `swagger.json` / `*.proto` / `schema.graphql` | API contracts |
| `AGENTS.md` | Project conventions (language, code-style, layers) |
| `code-style.md` or equivalent | Formal code style |
| `ls src/` / `find src -type d -maxdepth 2` | Folder structure — does `core/`, `modules/`, `dependencies/` exist? Are there already created modules? |

If a stack-specific skill exists (e.g., `nestjs`, `fastapi`, `laravel`, `go-http`), load it after detection. The stack-specific skill overrides this skill's defaults; this skill is the floor that always holds.

---

## 2. Modular architecture (mandatory default)

The backend project architecture is **always modular by feature**, unless `AGENTS.md` explicitly declares another structure and the human confirms it. This is the reference structure:

```
__tests__/              # Tests mirroring the same structure as app
├── conftest.py
app/
├── core/                       # Cross-cutting infrastructure (NOT a module)
│   ├── config.py               # Config loading (env vars, secrets, feature flags)
│   ├── database.py             # Engine, session factory, declarative base
│   ├── errors.py               # Domain error hierarchy
│   ├── logging.py              # Structured logger, request_id
│   ├── security.py             # Hashing, JWT, signing, crypto
│   ├── middleware/             # Global middleware (request_id, CORS, security headers)
│   ├── events.py               # Global event bus, base for publishers/handlers
│   ├── exceptions.py           # Global exception filters / handlers
│   └── ...
│
├── modules/                    # One folder per business feature
│   └── <feature>/              # e.g., auth/, users/, billing/, orders/
│       ├── __init__.py         # Exposes the public router
│       ├── models.py           # Module's ORM models (own tables)
│       ├── schemas.py          # Pydantic / DTO (request + response)
│       ├── repositories.py     # Data access for the module
│       ├── service.py          # Business logic of the module
│       ├── routes.py           # HTTP endpoints (module router)
│       ├── dependencies.py     # FastAPI/framework dependencies for the module
│       ├── events.py           # Own publishers/handlers (optional)
│       ├── jobs.py             # Background jobs for the module (optional)
│
├── dependencies/               # Globally reusable dependencies
│   ├── auth.py                 # current_user, require_role, require_permission
│   ├── database.py             # get_db, get_session, get_transaction
│   ├── rate_limit.py           # rate_limit_per_ip, rate_limit_per_user
│   ├── pagination.py           # pagination_params, paginate
│   └── ...
│
├── models/                     # Shared cross-module models (only if any)
├── schemas/                    # Shared cross-module schemas (only if any)
│
├── migrations/                 # DB migrations (Alembic, Prisma, etc.)
│
├── main.py                     # Bootstrap: app instance, mount each module's routers
└── pyproject.toml / package.json
```

**Modular architecture rules:**

1. **Each feature is a self-contained module.** Everything for the module lives inside `modules/<feature>/`. If a model, schema, repository, or service is used by only one module, it goes inside the module. Do not promote it to `core/`, `models/`, or `schemas/` for the sake of promotion.
2. **`core/` is for cross-cutting infrastructure, not business logic.** `core/` contains: config, DB engine, base errors, logging, security primitives, global middleware, event bus. It does NOT contain: user logic, auth logic (beyond primitives), payments logic, etc.
3. **`dependencies/` is for cross-module reusable dependencies.** A dependency goes here if two or more modules use it. If only one module uses it, it goes in `modules/<feature>/dependencies.py`.
4. **Root `models/` and `schemas/` only for genuinely shared types.** If the `Money` type is used by `billing/` and `orders/`, it goes in `schemas/money.py` at the root. If only `billing/` uses it, it goes in `modules/billing/schemas.py`.
5. **Each module exposes a router.** `modules/<feature>/routes.py` defines a `router` (FastAPI), `Router` (Express), `Module` (NestJS), or equivalent. `main.py` mounts them. A module does not import `main.py`.
6. **Modules communicate via service calls or events, not by direct data access.** `modules/orders/service.py` does not import `modules/users/repositories.py` directly; it calls `modules/users/service.py` or subscribes to a `user.created` event.
7. **Centralized migrations.** A single `migrations/` folder for all migrations, even if they belong to several modules. The migration carries the module name in the message (`0001_create_users_table`).
8. **`__init__.py` of the module exposes only the public router.** No services, repositories, or schemas — those are internal module details, consumed via service call.

**Mapping to the project stack (how it looks in each one):**

| Stack | Module equivalent |
|---|---|
| **Python + FastAPI** | `modules/<feature>/` with `routes.py` (`APIRouter`), `service.py`, `repositories.py`, `models.py` (SQLAlchemy), `schemas.py` (Pydantic), `dependencies.py` |
| **Node + NestJS** | `modules/<feature>/` with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `entities/`, `dto/` (NestJS already prescribes it — align with it) |
| **Node + Express** | `modules/<feature>/` with `routes.ts`, `service.ts`, `repositories.ts`, `models.ts`, `schemas.ts` (Zod/TypeBox), `dependencies.ts` |
| **Go** | `internal/modules/<feature>/` with `handler.go`, `service.go`, `repository.go`, `model.go`, `schema.go` |
| **PHP + Laravel** | `app/Modules/<Feature>/` with `Http/Controllers/`, `Services/`, `Repositories/`, `Models/`, `Requests/`, `Resources/` (Laravel does not prescribe this by default — adapt it) |
| **Java + Spring Boot** | `modules/<feature>/` as a package with `controller/`, `service/`, `repository/`, `model/`, `dto/` (Spring does not prescribe it — adapt it) |
| **Python + Django** | `apps/<feature>/` with `models.py`, `views.py`, `serializers.py`, `services.py`, `repositories.py`, `urls.py` (Django uses "apps", which is the same concept) |
| **Rust** | `crates/<feature>/` or `src/modules/<feature>/` with `handler.rs`, `service.rs`, `repository.rs`, `model.rs`, `schema.rs` |

**Before starting a new module, scan with `grep`/`glob` what already exists:**

- `src/core/` → `config.py`, `errors.py`, `database.py`, `security.py`, `logging.py`, `middleware/` — read each one before adding anything new.
- `src/dependencies/` → `auth.py`, `database.py`, `rate_limit.py` — confirm what is there before duplicating.
- `src/modules/<feature>/` → if it already exists, open it, read its `service.py`, `repositories.py`, `routes.py`, `dependencies.py`, `events.py` if it exists. Reuse what is there.
- `src/models/` and `src/schemas/` at the root → only if your feature needs cross-module shared types.
- `migrations/` → read the last one to understand the schema state and the migration format.

**Precedence rules with other architectures:**

- If the project's `AGENTS.md` declares an explicit architecture (Hexagonal, Clean, DDD by layers), respect it. This skill describes the default; the project's contract wins.
- If the project already has modules but with another internal structure (e.g., a module has `controller/`, `service/`, `repository/` as subfolders instead of flat files), respect the local convention.
- If there are no modules yet and you will create the first one, apply this structure.

---

## 3. Universal BE patterns (apply by default)

These hold across all stacks. Learn the idiomatic expression of the stack for each one; do not invent a parallel pattern.

1. **Modular architecture by feature.** The code is organized into self-contained `modules/<feature>/` (see §2). Each feature has its own `models.py`, `schemas.py`, `repositories.py`, `service.py`, `routes.py`, `dependencies.py`. Features communicate via service calls or events, never by direct cross-module data access. `core/` is for cross-cutting infrastructure, not business logic. `dependencies/` is for globally reusable dependencies.
2. **Clear layers with unidirectional dependencies within each module.** `routes.py` → `service.py` → `repositories.py` → DB. The inner layer does not know the outer. `routes.py` does not call `repositories.py` directly; it goes through the service. The service does not know the request/response schema; it operates with domain types.
3. **Validation at the boundary, not in the domain.** The route (controller/resolver/handler) validates the input with the project's schema (Pydantic, Zod, class-validator). The service assumes valid input and focuses on business logic. If a service receives an unvalidated dict, it is badly designed.
4. **Typed errors in the domain, translated at the boundary.** Services raise module errors (`UserNotFound`, `EmailAlreadyTaken`) defined in `modules/<feature>/` or imported from `core/errors.py`. The global exception filter / error handler (in `core/`) translates them to the project's error response format (status code + body shape).
5. **Repositories behind interfaces or abstractions.** The service depends on `UserRepository` (interface or type), not on the concrete implementation. This enables swapping (memory, SQL, mock) and testing. The concrete implementation lives in `modules/<feature>/repositories.py`.
6. **Explicit transactions where applicable.** If an operation touches multiple resources, all writes go in one transaction. If the transaction crosses modules, it lives in `core/database.py` (helper `transactional()`) and each module contributes its operations. Do not use transactions if you do not need them.
7. **Idempotency keys on non-idempotent operations.** Any POST that creates a resource or any mutation the client can retry (network failure) accepts an `Idempotency-Key` header. If you have already processed that key, you return the same response without reprocessing. The key is persisted in `core/` (not in each module).
8. **Structured logging with context.** Every log includes `request_id` (from `core/middleware/`), `user_id` (if applicable), and the event. JSON format in production. The logger is injected from `core/logging.py`; modules do not instantiate their own loggers.
9. **Observability: metrics, logs, traces.** HTTP requests with latency, status code, route. DB queries with duration. Counted errors. Instrumentation lives in `core/` (middleware, decorators); modules use it without reinventing it.
10. **Config from the environment, not hardcoded.** All config (URLs, credentials, feature flags, secrets) loads in `core/config.py` from env vars or a secret manager. Modules receive config via dependency injection, they do not read it directly.
11. **Correct HTTP status codes.** `200` success, `201` created, `204` no body, `400` invalid input, `401` not authenticated, `403` not authorized, `404` not found, `409` conflict, `422` semantic validation, `429` rate limited, `500` internal error, `503` service unavailable. The error → status code mapping lives in `core/` (exception handlers), not in each module.
12. **Consistent pagination.** `limit`/`offset` or cursor-based, depending on the project. The pagination helper lives in `dependencies/pagination.py` and is injected in the routes that need it.
13. **API versioning.** Prefix in the path (`/api/v1/...`) or header. Versioning is applied in `main.py` when mounting each module's routers, not in each individual module.
14. **Health checks.** Endpoint `/health` (liveness) and `/ready` (readiness, including DB and dependencies) in `main.py` or in a `core/health/` module. Load balancers and orchestrators need them.
15. **Idempotent and observable background jobs.** A job can be re-executed (retry); the handler must be idempotent. Jobs live in `modules/<feature>/jobs.py` or, if cross-module, in a `core/jobs/` module. Failed jobs go to a dead-letter queue with enough context to investigate.
16. **Idempotent events with causal id.** A published event carries a unique `event_id`. Publishers live in `modules/<feature>/events.py`; the bus lives in `core/events.py`. Consumers deduplicate by `event_id` before processing (at-least-once + dedupe, not exactly-once).

---

## 4. Security (non-negotiable floor)

This **is not a polish step**. An endpoint without validation, without correct auth/authz, or with unescaped output is insecure, not "code that passes the tests".

- **Validation of ALL external input.** Request body, query params, path params, relevant headers. Use the project's validator/schema (Zod, Yup, class-validator, Pydantic, etc.). Reject invalid input with `400` and a specific message.
- **Output encoding / escaping.** NEVER concatenate user input in HTML responses, SQL, shell commands, or filesystem paths without escaping. Use the framework's escaping (auto-escaped templates, parameterized queries, `exec.Command` with args, not `sh -c`).
- **SQL injection prevention.** ALWAYS parameterized queries. Never string concatenation. If the ORM does it, follow its conventions. If you write raw SQL, use the driver's binder.
- **Authentication.** Each protected endpoint requires valid auth. The exception is explicitly public endpoints (`/health`, `/login`, `/signup` — and only those). Verify the token/session in middleware, not in each controller.
- **Authorization.** Auth ≠ Authz. An authenticated user may not be authorized for a specific resource. Verify ownership/role/permission before executing the action.
- **Rate limiting.** Public endpoints and mutation endpoints carry rate limit. Auth endpoints (login, signup, password reset) carry stricter rate limit. Return `429` with `Retry-After` when exceeded.
- **Secrets out of code.** API keys, DB passwords, signing keys, encryption keys — from env vars or a secret manager. The code never has them. If the project has a config helper, use it.
- **CORS configured correctly.** No `Access-Control-Allow-Origin: *` in APIs with auth. Explicit list of allowed origins.
- **Security headers.** `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` (or CSP `frame-ancestors`), `Referrer-Policy`. Whatever the framework provides by default; do not remove them.
- **Errors without leaking internals.** A `500` never returns stack trace, SQL query, or internal path to the client. Log the detail internally; to the client only `{"error": "Internal server error", "request_id": "..."}`.
- **Audit log for sensitive actions.** Login, logout, password change, permission change, access to sensitive data — with `user_id`, `action`, `resource`, `timestamp`, `request_id`, `result`.
- **Dependency scanning.** If the project has Dependabot/Renovate/snyk/trivy, do not ignore its alerts. If it does not, flag it in the handoff.

---

## 5. Response states and validation (checklist)

Each endpoint or handler must define and test:

| State | When | Status code | Body shape |
|---|---|---|---|
| **Success** | Operation completed | `200`, `201`, `204` | Expected data, with response schema shape |
| **Invalid input** | Schema validation fails | `400` | `{"error": "validation", "details": [...]}` |
| **Not authenticated** | Token missing or invalid | `401` | `{"error": "unauthenticated"}` |
| **Not authorized** | Valid auth but no permission | `403` | `{"error": "forbidden"}` |
| **Not found** | Resource does not exist | `404` | `{"error": "not_found"}` |
| **Conflict** | Resource state does not allow the action (e.g., duplicate email) | `409` | `{"error": "conflict", "reason": "..."}` |
| **Semantic validation** | Input passes schema but violates business rule | `422` | `{"error": "unprocessable", "details": [...]}` |
| **Rate limit** | Too many requests | `429` | `{"error": "rate_limited", "retry_after": <seconds>}` |
| **Internal error** | Unhandled exception | `500` | `{"error": "internal", "request_id": "..."}` |
| **Service unavailable** | Dependency down (DB, external API) | `503` | `{"error": "service_unavailable", "retry_after": <seconds>}` |

An endpoint that only handles the happy path is incomplete.

---

## 6. BE testing

Three layers, all required for non-trivial features.

### Unit tests

- **Pure functions and services with mocked dependencies.** Mock the service's dependencies (repositories, HTTP clients, loggers) at the boundary. Do not mock the ORM or DB driver.
- **One behavior per test.** Multiple asserts are fine if they verify the same logical result.
- **Branch and edge case coverage.** Null/None, empty lists, timeouts, rate limits, dependency errors.
- **Determinism.** No `time.sleep`, no `Date.now()`, no real network. Use fake timers and seeded fixtures.

### Integration tests

- **Test the full endpoint or interaction with a real DB.** Use Testcontainers (Postgres, MySQL, Redis in ephemeral Docker) or the project's testing DB. Do not use the production DB.
- **Isolated setup and teardown.** Each test creates its fixtures and cleans them up. No shared state between tests.
- **Validate the full API contract.** Request → response, status code, headers, body shape. Include the error states (see §5).
- **Auth/authz tested with real tokens.** A test with invalid token, a test without token, a test with a user-without-permission token.
- **No real network to external APIs.** MSW, WireMock, VCR, or mocks at the HTTP client level.

### Contract tests

- **Validate that client and server speak the same language.** Consumer-driven contract tests (Pact, etc.) or schema validation (OpenAPI/JSON Schema on the response).
- **Broken in CI = blocking.** If the contract changes without updating the client, the test breaks before reaching prod.

### E2E tests (if applicable)

- **Full system flows.** Signup, login, purchase, etc. Slow, flakies are a risk — use them only for critical paths.
- **CI-friendly.** Headless, parallel, no dependency on external services (staging API only if stable and the test is robust).

---

## 7. Cross-cutting rules (apply to every change)

These are inherited from the orchestrator agent's contracts but reiterated here for self-containment:

- **All code in English.** Identifiers, error messages, logs, test descriptions, comments, schema field names, API field names. Client-visible error strings go in the project's language (they can be localized, but the codes and field names are always in English).
- **No redundant comments.** A comment that restates the code is noise. A comment that explains a non-obvious *why* (workaround, counterintuitive decision, reference to RFC/ticket) is welcome. The code is the *what*; the comment is the *why*.
- **No hardcoded credentials.** API keys, DB passwords, signing keys, encryption keys, default admin passwords — any of these is a blocker. Reference them from env vars or a secret manager. If you find a credential in the code, it is a Blocker finding.
- **No commits.** This skill does not commit. The orchestrator agent emits a handoff; the human versions.

---

## 8. Anti-patterns to reject

| The user says… | You respond… |
|---|---|
| "Skip the test, the code is obvious" | "If it is obvious, the test is one line. Write it." |
| "Add a test for X while implementing Y" | "One cycle per behavior. Enqueue X for the next cycle." |
| "Mock the entire DB" | "Mock at the repository level, not the ORM. We want to know that the queries are correct. For integration tests, use Testcontainers or the testing DB." |
| "Use this custom pattern I prefer" | "I evaluate it against the project's existing patterns. If it clashes, I flag it and propose the project's path." |
| "Skip input validation" | "Boundary validation is part of 'code that passes'. An endpoint that accepts unvalidated input is not 'minimum code', it is insecure code." |
| "Do not do logging" | "I do structured logging with request_id, in the format the project already uses. It is part of coherence and observability." |
| "Always return 200" | "I use the correct status code. `201` on create, `204` no body, `400` invalid input, `404` not found, `409` conflict, `500` internal error. Clients need it." |
| "Hardcode the DB URL" | "Reference it from env vars or the config service. The URL is environment-specific." |
| "Put credentials in the code, it's just dev" | "No. Dev code ends up in production. If you need a default value, use a `.env.example` file with placeholders, not real credentials." |
| "Don't worry about auth" | "Every protected endpoint requires auth. If the endpoint must be public, confirm it explicitly; by default, everything requires auth." |
| "Commit this" | "I do not commit. The orchestrator agent emits a handoff; you version." |

---

## 9. Output contract

When this skill is active and the agent is asked to implement a backend task, the response must include:

1. **Stack detection summary** — which framework, ORM, DB, validator, test framework the project uses, and whether modules already exist (`ls src/modules/`) or if the first one must be created.
2. **Affected module** — whether the change creates a new module, modifies an existing one, or adds code to `core/` / `dependencies/`. List files created/modified with their exact location (`modules/<feature>/...`).
3. **Identified reusables** — services, repositories, dependencies, shared schemas, errors that the new code will leverage (from `core/`, `dependencies/`, other modules, or root `models/`/`schemas/`).
4. **For each behavior**: RED → GREEN → REFACTOR with the same structure the orchestrator agent uses (test first, minimum code in the correct module, then refactor + security + error states + observability).
5. **Security verification** — explicit confirmation that the code passes validation, auth/authz, escaping, status codes, no-credentials checks. If a check does not apply, say so.
6. **Response state coverage** — for each endpoint/handler, list which status codes are implemented and which are deferred.
7. **Tests summary** — what is covered at unit level, what at integration level, what at contract level, what is intentionally left uncovered. Indicate the tests path (e.g., `modules/<feature>/tests/test_routes.py`).
8. **Client contract gap** — if the implementation defines an API the client does not yet consume, list the expected contract (endpoint, method, request shape, response shape, error shape).
9. **External dependency contract gap** — if the code calls an external API or internal service, document the assumed contract.
10. **Migrations / schema changes** — if the code requires DB changes, list the necessary migrations (in `migrations/`) and their reversibility, indicating which module they belong to.
11. **Inter-module communication** — if the feature crosses modules, document how they communicate (direct service call, event published in `modules/<feature>/events.py`, subscription from another module).
12. **Handoff** — modified files (with their path in the modular structure), reusables leveraged, contracts followed, passing tests, suggested commit message, notes.

If a step cannot be completed, say so explicitly and propose a follow-up. Do not silently skip validation, auth, logging, status codes, security, or tests.
