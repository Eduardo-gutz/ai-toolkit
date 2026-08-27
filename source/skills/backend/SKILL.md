---
name: backend
description: >
  Backend and APIs across any stack (Node, Python, Go, PHP, Java, Ruby, Rust, etc.) and any DB. Use when implementing, refactoring, reviewing, or testing services, repositories, controllers, endpoints, business logic, persistence, integrations, queues, jobs, workers, events, GraphQL resolvers, gRPC services. Prescribes modular architecture: `core/` (cross-cutting infra) + `modules/<feature>/` (self-contained: models, schemas, repositories, service, routes, dependencies). Trigger phrases: implement endpoint, create service, add repository, API REST, handler, controller, middleware, migration, integration test, etc. Do NOT use for frontend, native mobile, or pure DevOps.
---

# Backend General

Aplica esta skill cuando el agente opera sobre la **capa de backend y APIs de un sistema**. La skill es **stack-agnóstica** y **DB-agnóstica**: captura las reglas que se mantienen en Node, Python, Go, PHP, Java, Ruby, Rust y cualquier base de datos. Las convenciones específicas de stack (e.g., "usa decoradores de NestJS", "migrations con Alembic") pertenecen a una skill stack-específica separada, no aquí.

**Scope.** Endpoints HTTP/REST/GraphQL/gRPC, servicios de aplicación, repositorios de datos, lógica de dominio, integraciones con servicios externos, colas y jobs en background, eventos de dominio, autenticación y autorización, validación de input, persistencia, migraciones, observability y la suite de tests que los cubre. Cruce de capas: si una feature cruza al cliente (UI), defines el contrato de la API en el código y emites el handoff; no improvises la capa de presentación.

---

## 1. Detección de stack (hazlo primero)

Antes de escribir cualquier código, identifica el stack del proyecto leyendo los manifiestos:

| Manifiesto / Path | Qué te dice |
|---|---|
| `package.json` | Node/JS/TS — framework, runtime, scripts, ORM/ODM, validadores |
| `pyproject.toml` / `requirements.txt` / `setup.py` / `Pipfile` | Python — framework, ORM, validadores, ASGI/WSGI server |
| `go.mod` | Go — módulos, librerías, driver de DB |
| `composer.json` | PHP — framework, paquetes, migraciones |
| `pom.xml` / `build.gradle` / `build.gradle.kts` | Java/Kotlin — framework, dependencias |
| `Gemfile` | Ruby — framework, gemas |
| `Cargo.toml` | Rust — crates, framework |
| `Dockerfile` / `docker-compose.yml` | Servicios, DB, colas, cache — topología |
| `prisma/schema.prisma` / `drizzle.config.*` / `alembic.ini` / `artisan` | ORM/migraciones |
| `migrations/`, `db/migrate/`, `*.sql` | Esquema de DB |
| `tests/`, `__tests__/`, `*_test.go`, `*_test.py`, `*.test.ts` | Framework de tests |
| `openapi.yaml` / `swagger.json` / `*.proto` / `schema.graphql` | Contratos de API |
| `AGENTS.md` | Convenciones del proyecto (idioma, code-style, capas) |
| `code-style.md` o equivalente | Estilo de código formal |
| `ls src/` / `find src -type d -maxdepth 2` | Estructura de carpetas — ¿existe `core/`, `modules/`, `dependencies/`? ¿hay módulos ya creados? |

Si existe una skill stack-específica (e.g., `nestjs`, `fastapi`, `laravel`, `go-http`), cárgala después de la detección. La skill stack-específica sobrescribe los defaults de esta; esta skill es el piso que siempre se mantiene.

---

## 2. Arquitectura modular (default obligatorio)

La arquitectura del proyecto backend **siempre es modular por feature**, salvo que el `AGENTS.md` declare explícitamente otra estructura y el humano lo confirme. Esta es la estructura de referencia:

```
__tests__/              # Tests reflejando la misma estructura que app
├── conftest.py
app/
├── core/                       # Infraestructura transversal (NO es un módulo)
│   ├── config.py               # Carga de configuración (env vars, secrets, feature flags)
│   ├── database.py             # Engine, session factory, base declarativa
│   ├── errors.py               # Jerarquía de errores del dominio
│   ├── logging.py              # Logger estructurado, request_id
│   ├── security.py             # Hashing, JWT, signing, crypto
│   ├── middleware/             # Middleware globales (request_id, CORS, security headers)
│   ├── events.py               # Event bus global, base para publishers/handlers
│   ├── exceptions.py           # Exception filters / handlers globales
│   └── ...
│
├── modules/                    # Una carpeta por feature de negocio
│   └── <feature>/              # e.g., auth/, users/, billing/, orders/
│       ├── __init__.py         # Expone el router público
│       ├── models.py           # ORM models del módulo (tablas propias)
│       ├── schemas.py          # Pydantic / DTO (request + response)
│       ├── repositories.py     # Acceso a datos del módulo
│       ├── service.py          # Lógica de negocio del módulo
│       ├── routes.py           # Endpoints HTTP (router del módulo)
│       ├── dependencies.py     # FastAPI/framework dependencies del módulo
│       ├── events.py           # Publishers/handlers propios (opcional)
│       ├── jobs.py             # Background jobs del módulo (opcional)
│
├── dependencies/               # Dependencies globales reutilizables
│   ├── auth.py                 # current_user, require_role, require_permission
│   ├── database.py             # get_db, get_session, get_transaction
│   ├── rate_limit.py           # rate_limit_per_ip, rate_limit_per_user
│   ├── pagination.py           # pagination_params, paginate
│   └── ...
│
├── models/                     # Modelos compartidos cross-module (solo si los hay)
├── schemas/                    # Schemas compartidos cross-module (solo si los hay)
│
├── migrations/                 # Migraciones de DB (Alembic, Prisma, etc.)
│
├── main.py                     # Bootstrap: instancia app, monta routers de cada módulo
└── pyproject.toml / package.json
```

**Reglas de la arquitectura modular:**

1. **Cada feature es un módulo autocontenido.** Todo lo del módulo vive dentro de `modules/<feature>/`. Si un modelo, schema, repository o service solo lo usa un módulo, va dentro del módulo. No lo asciendas a `core/`, `models/`, o `schemas/` por ascender.
2. **`core/` es para infraestructura transversal, no para lógica de negocio.** `core/` contiene: config, DB engine, errores base, logging, security primitives, middleware globales, event bus. NO contiene: lógica de usuarios, de auth (más allá de primitives), de pagos, etc.
3. **`dependencies/` es para dependencies reutilizables cross-module.** Una dependency va aquí si dos o más módulos la usan. Si solo un módulo la usa, va en `modules/<feature>/dependencies.py`.
4. **`models/` y `schemas/` raíz solo para tipos genuinamente compartidos.** Si el tipo `Money` lo usan `billing/` y `orders/`, va en `schemas/money.py` raíz. Si solo lo usa `billing/`, va en `modules/billing/schemas.py`.
5. **Cada módulo expone un router.** `modules/<feature>/routes.py` define un `router` (FastAPI), `Router` (Express), `Module` (NestJS), o equivalente. `main.py` los monta. Un módulo no importa `main.py`.
6. **Los módulos se comunican vía service calls o eventos, no por acceso directo a datos.** `modules/orders/service.py` no importa `modules/users/repositories.py` directamente; llama a `modules/users/service.py` o se suscribe a un evento `user.created`.
7. **Migraciones centralizadas.** Una sola carpeta `migrations/` para todas las migraciones, incluso si pertenecen a varios módulos. La migration lleva el nombre del módulo en el mensaje (`0001_create_users_table`).
8. **`__init__.py` del módulo expone solo el router público.** Nada de servicios, repositorios ni schemas — esos son detalles internos del módulo, consumidos vía service call.

**Mapping al stack del proyecto (cómo se ve en cada uno):**

| Stack | Equivalente del módulo |
|---|---|
| **Python + FastAPI** | `modules/<feature>/` con `routes.py` (`APIRouter`), `service.py`, `repositories.py`, `models.py` (SQLAlchemy), `schemas.py` (Pydantic), `dependencies.py` |
| **Node + NestJS** | `modules/<feature>/` con `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `entities/`, `dto/` (NestJS ya lo prescribe — alinéalo) |
| **Node + Express** | `modules/<feature>/` con `routes.ts`, `service.ts`, `repositories.ts`, `models.ts`, `schemas.ts` (Zod/TypeBox), `dependencies.ts` |
| **Go** | `internal/modules/<feature>/` con `handler.go`, `service.go`, `repository.go`, `model.go`, `schema.go` |
| **PHP + Laravel** | `app/Modules/<Feature>/` con `Http/Controllers/`, `Services/`, `Repositories/`, `Models/`, `Requests/`, `Resources/` (Laravel no lo prescribe por default — adáptalo) |
| **Java + Spring Boot** | `modules/<feature>/` como package con `controller/`, `service/`, `repository/`, `model/`, `dto/` (Spring no lo prescribe — adáptalo) |
| **Python + Django** | `apps/<feature>/` con `models.py`, `views.py`, `serializers.py`, `services.py`, `repositories.py`, `urls.py` (Django usa "apps", que es el mismo concepto) |
| **Rust** | `crates/<feature>/` o `src/modules/<feature>/` con `handler.rs`, `service.rs`, `repository.rs`, `model.rs`, `schema.rs` |

**Antes de empezar un módulo nuevo, escanea con `grep`/`glob` lo que ya existe:**

- `src/core/` → `config.py`, `errors.py`, `database.py`, `security.py`, `logging.py`, `middleware/` — lee cada uno antes de añadir nada nuevo.
- `src/dependencies/` → `auth.py`, `database.py`, `rate_limit.py` — confirma qué hay antes de duplicar.
- `src/modules/<feature>/` → si ya existe, ábrelo, lee su `service.py`, `repositories.py`, `routes.py`, `dependencies.py`, `events.py` si existe. Reusa lo que haya.
- `src/models/` y `src/schemas/` raíz → solo si tu feature necesita tipos compartidos cross-module.
- `migrations/` → lee la última para entender el estado del schema y el formato de las migrations.

**Reglas de precedencia con otras arquitecturas:**

- Si el `AGENTS.md` del proyecto declara arquitectura explícitamente (Hexagonal, Clean, DDD por capas), respeta esa. Esta skill describe el default; el contrato del proyecto gana.
- Si el proyecto ya tiene módulos pero con otra estructura interna (e.g., un módulo tiene `controller/`, `service/`, `repository/` como subcarpetas en vez de archivos planos), respeta la convención local.
- Si no hay módulos aún y vas a crear el primero, aplica esta estructura.

---

## 3. Patrones BE universales (aplica por default)

Estos se mantienen en todos los stacks. Aprende la expresión idiomática del stack para cada uno; no inventes un patrón paralelo.

1. **Arquitectura modular por feature.** El código se organiza en `modules/<feature>/` autocontenidos (ver §2). Cada feature tiene su propio `models.py`, `schemas.py`, `repositories.py`, `service.py`, `routes.py`, `dependencies.py`. Las features se comunican vía service calls o eventos, nunca por acceso directo a datos entre módulos. `core/` es para infraestructura transversal, no para lógica de negocio. `dependencies/` es para dependencies globales reutilizables.
2. **Capas claras con dependencias unidireccionales dentro de cada módulo.** `routes.py` → `service.py` → `repositories.py` → DB. La capa interna no conoce a la externa. `routes.py` no llama directamente a `repositories.py`; pasa por el service. El service no conoce el request/response schema; opera con tipos de dominio.
3. **Validación en el boundary, no en el dominio.** El route (controller/resolver/handler) valida el input con el schema del proyecto (Pydantic, Zod, class-validator). El service asume input válido y se enfoca en la lógica de negocio. Si un service recibe un dict sin validar, está mal diseñado.
4. **Errores tipados en el dominio, traducidos en el boundary.** Los services lanzan errores del módulo (`UserNotFound`, `EmailAlreadyTaken`) definidos en `modules/<feature>/` o importados de `core/errors.py`. El exception filter / error handler global (en `core/`) los traduce al formato de error response del proyecto (status code + body shape).
5. **Repositorios detrás de interfaces o abstracciones.** El service depende de `UserRepository` (interfaz o type), no de la implementación concreta. Esto permite swap (memoria, SQL, mock) y testeo. La implementación concreta vive en `modules/<feature>/repositories.py`.
6. **Transacciones explícitas donde aplique.** Si una operación toca múltiples recursos, todas las escrituras van en una transacción. Si la transacción cruza módulos, está en `core/database.py` (helper `transactional()`) y cada módulo aporta sus operaciones. No uses transacciones si no las necesitas.
7. **Idempotency keys en operaciones no-idempotentes.** Cualquier POST que cree un recurso o cualquier mutación que el cliente pueda reintentar (network failure) acepta un `Idempotency-Key` header. Si ya procesaste esa key, devuelves la misma respuesta sin re-procesar. La key se persiste en `core/` (no en cada módulo).
8. **Logging estructurado con contexto.** Cada log incluye `request_id` (del `core/middleware/`), `user_id` (si aplica), y el evento. Formato JSON en producción. El logger se inyecta desde `core/logging.py`; los módulos no instancian loggers propios.
9. **Observability: métricas, logs, traces.** Requests HTTP con latencia, status code, ruta. Queries a DB con duración. Errores contados. La instrumentación vive en `core/` (middleware, decorators); los módulos la usan sin reinventarla.
10. **Config desde el environment, no hardcodeada.** Toda config (URLs, credenciales, feature flags, secretos) se carga en `core/config.py` desde env vars o un secret manager. Los módulos reciben config vía dependency injection, no la leen directamente.
11. **Status codes HTTP correctos.** `200` éxito, `201` creado, `204` sin body, `400` input inválido, `401` no autenticado, `403` no autorizado, `404` no existe, `409` conflicto, `422` validación semántica, `429` rate limited, `500` error interno, `503` servicio no disponible. El mapping error → status code vive en `core/` (exception handlers), no en cada módulo.
12. **Paginación consistente.** `limit`/`offset` o cursor-based, según el proyecto. El helper de paginación vive en `dependencies/pagination.py` y se inyecta en los routes que lo necesiten.
13. **Versionado de API.** Prefijo en la ruta (`/api/v1/...`) o header. El versionado se aplica en `main.py` al montar los routers de cada módulo, no en cada módulo individual.
14. **Health checks.** Endpoint `/health` (liveness) y `/ready` (readiness, incluyendo DB y dependencias) en `main.py` o en un módulo `core/health/`. Lo necesitan los load balancers y orquestadores.
15. **Background jobs idempotentes y observables.** Un job puede re-ejecutarse (retry); el handler debe ser idempotente. Los jobs viven en `modules/<feature>/jobs.py` o, si son cross-module, en un módulo `core/jobs/`. Jobs fallidos van a dead-letter queue con contexto suficiente para investigar.
16. **Eventos idempotentes con causal id.** Un evento publicado lleva un `event_id` único. Los publishers viven en `modules/<feature>/events.py`; el bus vive en `core/events.py`. Los consumers deduplican por `event_id` antes de procesar (al menos una vez + dedupe, no exactamente una vez).

---

## 4. Seguridad (piso no negociable)

Esto **no es un paso de pulido**. Un endpoint sin validación, sin auth/authz correctos, o con output no escapado está inseguro, no es "código que pasa los tests".

- **Validación de TODO el input externo.** Request body, query params, path params, headers relevantes. Usa el validador/schema del proyecto (Zod, Yup, class-validator, Pydantic, etc.). Rechaza input inválido con `400` y un mensaje específico.
- **Output encoding / escaping.** NUNCA concatenes input del usuario en responses HTML, SQL, comandos de shell, o paths de filesystem sin escapar. Usa el escaping del framework (templates auto-escaped, queries parametrizadas, `exec.Command` con args, no `sh -c`).
- **SQL injection prevention.** SIEMPRE queries parametrizadas. Nunca concatenación de strings. Si el ORM lo hace, sigue sus convenciones. Si escribes SQL crudo, usa el binder del driver.
- **Autenticación.** Cada endpoint protegido requiere auth válida. La excepción son endpoints explícitamente públicos (`/health`, `/login`, `/signup` — y solo esos). Verifica el token/sesión en middleware, no en cada controller.
- **Autorización.** Auth ≠ Authz. Un usuario autenticado puede no estar autorizado para un recurso específico. Verifica ownership/role/permission antes de ejecutar la acción.
- **Rate limiting.** Endpoints públicos y de mutación llevan rate limit. Endpoints de auth (login, signup, password reset) llevan rate limit más estricto. Devuelve `429` con `Retry-After` cuando se excede.
- **Secretos fuera del código.** API keys, DB passwords, signing keys, encryption keys — desde env vars o un secret manager. El código nunca los tiene. Si el proyecto tiene un helper de config, úsalo.
- **CORS configurado correctamente.** No `Access-Control-Allow-Origin: *` en APIs con auth. Lista explícita de origins permitidos.
- **Security headers.** `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` (o CSP `frame-ancestors`), `Referrer-Policy`. Lo que el framework provee por default; no los quites.
- **Errores sin filtrar internals.** Un `500` nunca devuelve stack trace, query SQL, o path interno al cliente. Loguea el detalle internamente; al cliente solo `{"error": "Internal server error", "request_id": "..."}`.
- **Audit log para acciones sensibles.** Login, logout, cambio de password, cambio de permisos, accesos a datos sensibles — con `user_id`, `action`, `resource`, `timestamp`, `request_id`, `result`.
- **Dependency scanning.** Si el proyecto tiene Dependabot/Renovate/snyk/trivy, no ignores sus alertas. Si no las tiene, flagea en el handoff.

---

## 5. Estados de respuesta y validación (checklist)

Cada endpoint o handler debe definir y testear:

| Estado | Cuándo | Status code | Body shape |
|---|---|---|---|
| **Éxito** | Operación completada | `200`, `201`, `204` | Data esperada, con shape del schema de respuesta |
| **Input inválido** | Schema validation falla | `400` | `{"error": "validation", "details": [...]}` |
| **No autenticado** | Falta token o es inválido | `401` | `{"error": "unauthenticated"}` |
| **No autorizado** | Auth válida pero sin permiso | `403` | `{"error": "forbidden"}` |
| **No encontrado** | Recurso no existe | `404` | `{"error": "not_found"}` |
| **Conflicto** | Estado del recurso no permite la acción (e.g., email duplicado) | `409` | `{"error": "conflict", "reason": "..."}` |
| **Validación semántica** | Input pasa schema pero viola regla de negocio | `422` | `{"error": "unprocessable", "details": [...]}` |
| **Rate limit** | Demasiadas requests | `429` | `{"error": "rate_limited", "retry_after": <segundos>}` |
| **Error interno** | Excepción no manejada | `500` | `{"error": "internal", "request_id": "..."}` |
| **Servicio no disponible** | Dependencia caída (DB, API externa) | `503` | `{"error": "service_unavailable", "retry_after": <segundos>}` |

Un endpoint que solo maneja el happy path está incompleto.

---

## 6. Testing BE

Tres capas, todas requeridas para features no triviales.

### Tests unitarios

- **Funciones puras y servicios con dependencias mockeadas.** Mockea las dependencias del servicio (repositorios, clientes HTTP, loggers) en el boundary. No mockees el ORM o el driver de DB.
- **Un comportamiento por test.** Múltiples asserts están bien si verifican el mismo resultado lógico.
- **Cobertura de ramas y edge cases.** Null/None, listas vacías, timeouts, rate limits, errores de dependencias.
- **Determinismo.** Sin `time.sleep`, sin `Date.now()`, sin red real. Usa fake timers y fixtures seeded.

### Tests de integración

- **Prueban el endpoint completo o la interacción con DB real.** Usa Testcontainers (Postgres, MySQL, Redis en Docker efímero) o la DB de testing del proyecto. No uses la DB de producción.
- **Setup y teardown aislados.** Cada test crea sus fixtures y los limpia. No hay estado compartido entre tests.
- **Validan el contrato de la API completo.** Request → response, status code, headers, body shape. Incluyen los estados de error (ver §5).
- **Auth/authz testeados con tokens reales.** Un test con token inválido, un test sin token, un test con token de usuario sin permiso.
- **Sin red real a APIs externas.** MSW, WireMock, VCR, o mocks a nivel de cliente HTTP.

### Tests de contrato

- **Validan que el cliente y el servidor hablan el mismo idioma.** Consumer-driven contract tests (Pact, etc.) o schema validation (OpenAPI/JSON Schema en el response).
- **Rotos en CI = bloqueante.** Si el contrato cambia sin actualizar el cliente, el test rompe antes de llegar a prod.

### Tests E2E (si aplica)

- **Flujos completos del sistema.** Signup, login, compra, etc. Lentos, flakies son un riesgo — úsalos solo para los paths críticos.
- **CI-friendly.** Headless, paralelos, sin dependencia de servicios externos (staging API solo si es estable y el test es robusto).

---

## 7. Reglas transversales (aplican a cada cambio)

Estas se heredan de los contratos del agente orquestador pero se reiteran aquí para autocontención:

- **Todo el código en inglés.** Identificadores, mensajes de error, logs, descripciones de tests, comentarios, schema field names, API field names. Strings de error visibles al cliente van en el idioma del proyecto (pueden ser localized, pero los codes y field names siempre en inglés).
- **Sin comentarios redundantes.** Un comentario que re-statea el código es ruido. Un comentario que explica un *por qué* no obvio (workaround, decisión contraintuitiva, referencia a RFC/ticket) es bienvenido. El código es el *qué*; el comentario es el *por qué*.
- **Sin credenciales hardcodeadas.** API keys, DB passwords, signing keys, encryption keys, default admin passwords — cualquiera de estos es un blocker. Referéncialos desde env vars o un secret manager. Si encuentras una credencial en el código, es hallazgo Blocker.
- **Sin commits.** Esta skill no commitea. El agente orquestador emite un handoff; el humano versiona.

---

## 8. Anti-patrones a rechazar

| El usuario dice… | Tú respondes… |
|---|---|
| "Sáltate el test, el código es obvio" | "Si es obvio, el test es una línea. Escríbelo." |
| "Añade un test para X mientras implementas Y" | "Un ciclo por comportamiento. Encola X para el próximo ciclo." |
| "Mockea toda la DB" | "Mockea a nivel de repository, no del ORM. Queremos saber que las queries son correctas. Para tests de integración, usa Testcontainers o la DB de testing." |
| "Usa este patrón custom que prefiero" | "Lo evalúo contra los patrones existentes del proyecto. Si choca, lo flageo y propongo la vía del proyecto." |
| "Sáltate la validación de input" | "La validación en el boundary es parte de 'código que pasa'. Un endpoint que acepta input sin validar no es 'código mínimo', es código inseguro." |
| "No hagas logging" | "Sí hago logging estructurado con request_id, en el formato que el proyecto ya usa. Es parte de la coherencia y de la observability." |
| "Devuelve siempre 200" | "Uso el status code correcto. `201` al crear, `204` sin body, `400` input inválido, `404` no encontrado, `409` conflicto, `500` error interno. Los clientes lo necesitan." |
| "Hardcodea la URL de la DB" | "Referénciala desde env vars o el config service. La URL es environment-specific." |
| "Pon las credenciales en el código, es solo dev" | "No. El código de dev termina en producción. Si necesitas un valor default, usa un archivo `.env.example` con placeholders, no credenciales reales." |
| "No te preocupes por la auth" | "Cada endpoint protegido requiere auth. Si el endpoint debe ser público, confírmalo explícitamente; por default, todo requiere auth." |
| "Commitea esto" | "No commiteo. El agente orquestador emite un handoff; tú versionas." |

---

## 9. Output contract

Cuando esta skill está activa y al agente le piden implementar una tarea de backend, la respuesta debe incluir:

1. **Resumen de detección de stack** — qué framework, ORM, DB, validador, framework de tests usa el proyecto, y si ya hay módulos (`ls src/modules/`) o si hay que crear el primero.
2. **Módulo afectado** — si el cambio crea un módulo nuevo, modificar uno existente, o agregar code a `core/` / `dependencies/`. Listar archivos creados/modificados con su ubicación exacta (`modules/<feature>/...`).
3. **Reusables identificados** — services, repositories, dependencies, schemas compartidos, errors que el código nuevo aprovechará (de `core/`, `dependencies/`, otros módulos, o raíz `models/`/`schemas/`).
4. **Para cada comportamiento**: RED → GREEN → REFACTOR con la misma estructura que usa el agente orquestador (test primero, código mínimo en el módulo correcto, luego refactor + seguridad + estados de error + observability).
5. **Verificación de seguridad** — confirmación explícita de que el código pasa los chequeos de validación, auth/authz, escaping, status codes, no-credentials. Si un chequeo no aplica, decirlo.
6. **Cobertura de estados de respuesta** — para cada endpoint/handler, listar qué status codes están implementados y cuáles se difieren.
7. **Resumen de tests** — qué está cubierto a nivel unitario, qué a nivel de integración, qué a nivel de contrato, qué se deja intencionalmente sin cubrir. Indicar la ruta de los tests (e.g., `modules/<feature>/tests/test_routes.py`).
8. **Brecha de contrato con el cliente** — si la implementación define una API que el cliente aún no consume, listar el contrato esperado (endpoint, método, request shape, response shape, error shape).
9. **Brecha de contrato con dependencias externas** — si el código llama a una API externa o servicio interno, documentar el contrato asumido.
10. **Migraciones / cambios de schema** — si el código requiere cambios en DB, listar las migraciones necesarias (en `migrations/`) y su reversibilidad, indicando a qué módulo pertenecen.
11. **Comunicación entre módulos** — si la feature cruza módulos, documentar cómo se comunican (service call directo, evento publicado en `modules/<feature>/events.py`, subscription desde otro módulo).
12. **Handoff** — archivos modificados (con su path en la estructura modular), reusables aprovechados, contratos seguidos, tests pasando, mensaje de commit sugerido, notas.

Si un paso no se puede completar, decirlo explícitamente y proponer un follow-up. No saltarse silenciosamente validación, auth, logging, status codes, seguridad, o tests.
