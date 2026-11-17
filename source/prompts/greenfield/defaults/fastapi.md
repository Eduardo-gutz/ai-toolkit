# Stack defaults — fastapi

## Stack signature

- stack_id: fastapi
- Detection signals: `fastapi` in the `pyproject.toml` dependencies
  (`[project].dependencies` or `[tool.poetry.dependencies]`), or `fastapi`
  in a top-level `requirements*.txt`.
- Serves: FastAPI projects — HTTP APIs and async services with typed
  request and response models.
- Inherits from: `python`
- Override rule: this file wins over its base for the same field path, and
  the base's rows fill what this file omits.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | fastapi | the catalog file the stack_hint resolves to. |
| `stack.framework` | FastAPI with Pydantic v2 | the framework and the model library the catalog prescribes. |
| `stack.test_framework` | pytest with httpx | the runner and the HTTP client that drives the app the way a client does. |
| `standards.testing.framework` | pytest with httpx | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | the tree is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `app/core + app/modules/<feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `routes → controller → dependencies → helpers → repository` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (main.py → modules; modules → core, services; no cross-module imports)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase snake_case directories` | Python reads snake_case directories as native; kebab-case would fight the tooling. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| fastapi: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| fastapi: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| fastapi: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |
| fastapi: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| fastapi: how many approvals does a change need? | one approving review / two approving reviews / no review required | `standards.git_ci.review_policy` |

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
app/
  main.py
  core/
    config/settings.py
    helpers/tax_helper.py
    utils/format_date.py
    models/auth/auth_model.py
  modules/billing/
    routes/billing_router.py
    controller/billing_controller.py
    dependencies/billing_dependencies.py
    helpers/invoice_helper.py
    services/billing_service.py
    repository/invoice_repository.py
    schemas/invoice_schema.py
    models/invoice_model.py
```

### Module layout

```
alembic.ini                    # Alembic configuration, at the project root
alembic/                       # the migrations — outside the package
  env.py
  script.py.mako
  versions/
app/                           # the import root
  main.py                      # entry: uvicorn app.main:app
  core/                        # shared by the project
    config/                    # settings
    database/                  # connection and repository implementations
      models/                  # ORM entities — the persistence model
      repositories/            # implementations of the modules' ports
    errors/                    # base application errors
    logger.py                  # structured logger
    http/                      # middleware and exception handlers
      middleware/
    auth/                      # authentication and authorization
    helpers/                   # reusable business-tied utilities, 2+ modules
    utils/                     # generic functions, no business logic
    models/                    # shared types, by domain
  modules/                     # one module per business feature
    <feature>/
      routes/                  # the APIRouter this module declares
      controller/              # the endpoints as classes + this module's business logic: parse, validate, translate, respond
      dependencies/            # the module's Depends providers — its composition point
      helpers/                 # reusable business-tied utilities
      services/                # this module's critical, private logic
        <feature>_service.py   # the contract
        <feature>_adapters.py  # the implementation per backend
      repository/              # the port: the Protocol, not the implementation
      schemas/                 # Pydantic request and response models
      models/                  # this module's domain model
      errors.py                # this module's typed errors
  services/                    # outbound communication with third parties
    <third-party>/
      <third_party>_service.py
tests/                         # tests at the root, mirroring the package
  core/
  modules/
    <feature>/
```

### Test shape

```
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.anyio
async def test_rejects_invoice_when_total_is_negative():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/billing/invoices", json={"total": -1})

    assert response.status_code == 400
```

### Error shape

```
class BillingValidationError(Exception):
    """Raised when an invoice does not satisfy the billing rules."""

    code = "BILLING_VALIDATION"

    def __init__(self, message: str) -> None:
        super().__init__(message)
```
