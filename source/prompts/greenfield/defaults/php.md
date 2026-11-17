# Stack defaults — php

## Stack signature

- stack_id: php
- Detection signals: `composer.json` at the top level, with no
  `package.json`.
- Serves: PHP projects — web applications built on a framework and
  libraries published to Packagist.
- Override rule: this file wins over the baseline for the same field path.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | php | the catalog file the stack_hint resolves to. |
| `stack.language` | PHP | the php catalog exists for PHP projects. |
| `stack.language_version` | 8.3 or newer | the release line with the supported type declarations. |
| `stack.package_manager` | Composer | the package manager the PHP ecosystem standardises on. |
| `stack.test_framework` | PHPUnit | the runner the PHP ecosystem standardises on. |
| `stack.linter` | PHP_CodeSniffer | the linter that pairs with the PSR coding standard. |
| `stack.formatter` | PHP-CS-Fixer | the formatter the PHP ecosystem pairs with the coding standard. |
| `stack.framework` | none — the framework is chosen per project | a PHP project picks Laravel, Symfony or nothing. |
| `standards.testing.framework` | PHPUnit | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | the tree is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `src/Core + src/Modules/<Feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `Routes → Controllers → Helpers → Repositories` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (index.php → Modules; Modules → Core, Services; no cross-module imports)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `PascalCase directories (PSR-4)` | PSR-4 binds the namespace to the directory, so the directory must be PascalCase. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| php: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| php: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| php: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |
| php: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| php: how many approvals does a change need? | one approving review / two approving reviews / no review required | `standards.git_ci.review_policy` |

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
src/
  Core/
    Config/env.php
    Helpers/TaxHelper.php
    Interfaces/Billing/InvoiceInterface.php
  Modules/Billing/
    Routes/BillingRoutes.php
    Controllers/BillingController.php
    Helpers/InvoiceHelper.php
    Services/BillingService.php
    Repositories/InvoiceRepositoryInterface.php
    Interfaces/InvoiceInterface.php
  Services/
    Stripe/StripeService.php
public/
  index.php
```

### Module layout

```
src/
  Core/                           # shared by the project
    Config/                       # the mechanism: load and validate settings
    Database/                     # connection and repository implementations
      Repositories/
    Errors/                       # base application errors
    Logger/                       # structured logger
    Http/                         # middleware and exception handler
      Middleware/
    Security/                     # authentication and authorization
    Helpers/                      # reusable business-tied utilities, 2+ modules
    Interfaces/                   # shared types, by domain
  Modules/                        # one module per business feature
    <Feature>/
      Routes/                     # the URL table this module declares
      Controllers/                # HTTP semantics + this module's business logic: parse, validate, respond
      Helpers/                    # reusable business-tied utilities
      Services/                   # this module's critical, private logic
        <Feature>Service.php      # the contract
        <Feature>Adapters.php     # the implementation per backend
      Repositories/               # the port and its implementation
        <Entity>RepositoryInterface.php
      Interfaces/                 # this module's types
      Exceptions/                 # this module's typed errors
      Tests/                      # colocated tests
  Services/                       # outbound communication with third parties
    <ThirdParty>/
      <ThirdParty>Service.php
  Config/                         # the values: env, flags, deployment settings
    env.php
public/
  index.php                       # front controller
```

### Test shape

```
<?php

final class BillingServiceTest extends TestCase
{
    public function testRejectsInvoiceWhenTotalIsNegative(): void
    {
        // arrange, act, assert
    }
}
```

### Error shape

```
<?php

final class BillingValidationError extends RuntimeException
{
    public const CODE = 'BILLING_VALIDATION';
}
```
