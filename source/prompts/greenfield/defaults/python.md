# Stack defaults — python

## Stack signature

- stack_id: python
- Detection signals: `pyproject.toml`, `requirements.txt`, `Pipfile`,
  `setup.py` or `setup.cfg` at the top level, with no `package.json`.
- Serves: Python projects — services, scripts, data pipelines and
  libraries.
- Override rule: this file wins over the baseline for the same field path.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | python | the catalog file the stack_hint resolves to. |
| `stack.language` | Python | the python catalog exists for Python projects. |
| `stack.language_version` | 3.11 or newer | the release line with the best supported performance and typing features. |
| `stack.package_manager` | uv | the modern resolver that manages the virtual environment and the lockfile together. |
| `stack.test_framework` | pytest | the runner the Python ecosystem standardises on. |
| `stack.linter` | Ruff | fast, and it covers both linting and import rules. |
| `stack.formatter` | Ruff format | the formatter that ships with the linter, so the two never disagree. |
| `stack.framework` | none — the framework is chosen per service | a Python project picks FastAPI, Django or nothing per service. |
| `standards.testing.framework` | pytest | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | the tree is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `app/core + app/modules/<feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `helpers → repository` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (__init__.py → modules; modules → core, services; no cross-module imports)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase snake_case directories` | Python reads snake_case directories as native; kebab-case would fight the tooling. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| python: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| python: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| python: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |
| python: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| python: how many approvals does a change need? | one approving review / two approving reviews / no review required | `standards.git_ci.review_policy` |

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
app/
  __init__.py
  core/
    config/settings.py
    helpers/tax_helper.py
    utils/format_date.py
    models/auth/auth_model.py
  modules/billing/
    helpers/invoice_helper.py
    services/billing_service.py
    repository/invoice_repository.py
    models/invoice_model.py
  services/
    stripe/stripe_service.py
```

### Module layout

```
alembic.ini                    # Alembic configuration, at the project root
alembic/                       # the migrations — outside the package
  env.py
  script.py.mako
  versions/
app/                           # the import root
  __init__.py                  # public API of the package
  config.py                    # root-level configuration
  core/                        # shared by the project
    config/                    # configuration loading and validation
    database/                  # connection and repository implementations
      models/                  # ORM entities — the persistence model
      repositories/            # implementations of the modules' ports
    errors/                    # base application errors
    logger.py                  # structured logger
    auth/                      # authentication and authorization
    helpers/                   # reusable business-tied utilities, 2+ modules
    utils/                     # generic functions, no business logic
    models/                    # shared types, by domain
  modules/                     # one module per business feature
    <feature>/
      __init__.py              # the public surface of the module
      helpers/                 # reusable business-tied utilities
      services/                # this module's business logic; the critical, private part stays here
        <feature>_service.py   # the contract
        <feature>_adapters.py  # the implementation per backend
      repository/              # the port: the Protocol, not the implementation
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


def test_rejects_invoice_when_total_is_negative():
    # arrange, act, assert
    ...
```

### Error shape

```
class BillingValidationError(Exception):
    """Raised when an invoice does not satisfy the billing rules."""

    code = "BILLING_VALIDATION"

    def __init__(self, message: str) -> None:
        super().__init__(message)
```
