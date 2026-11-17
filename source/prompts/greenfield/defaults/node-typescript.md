# Stack defaults — node-typescript

## Stack signature

- stack_id: node-typescript
- Detection signals: `package.json` — `tsconfig.json` is the TypeScript
  indicator (it marks the project as TypeScript, but it is not required to
  select this catalog file), and no native mobile project markers
  (`app.json` with an `expo` key, `pubspec.yaml`, `*.xcodeproj`).
- Serves: Node.js projects written in TypeScript — services, CLIs and
  libraries.
- Override rule: this file wins over the baseline for the same field path.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | node-typescript | the catalog file the stack_hint resolves to. |
| `stack.language` | TypeScript | the node-typescript catalog exists for TypeScript projects. |
| `stack.language_version` | 20 or newer | the Node.js release line with stable ESM and the built-in test runner. |
| `stack.package_manager` | npm | the package manager that ships with the Node.js toolchain. |
| `stack.test_framework` | Vitest | fast, ESM-native, and it reuses the existing TypeScript configuration. |
| `stack.linter` | ESLint | the linter the TypeScript ecosystem standardises on. |
| `stack.formatter` | Prettier | the formatter ESLint and the TypeScript community pair with. |
| `stack.framework` | none — the framework is chosen per module | a Node.js project is a library or a service before it is a framework. |
| `standards.testing.framework` | Vitest | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | the tree is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `src/core + src/modules/<feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `helpers → repository` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (index.ts → modules; modules → core, services; no cross-module imports)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase kebab-case directories` | the folder casing the stack's own tooling reads as native. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| node-typescript: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| node-typescript: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| node-typescript: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |
| node-typescript: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| node-typescript: how many approvals does a change need? | one approving review / two approving reviews / no review required | `standards.git_ci.review_policy` |

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
src/
  core/
    config/env.ts
    helpers/tax.helper.ts
    utils/formatDate.util.ts
    interfaces/auth/auth.interface.ts
  modules/billing/
    helpers/invoice.helper.ts
    services/billing.service.ts
    repository/invoice.repository.ts
    interfaces/billing.interface.ts
    index.ts
  services/
    firebase/firebase.service.ts
```

### Module layout

```
src/
  index.ts                        # public API of the package
  core/                           # shared by the project
    config/                       # environment and global constants
    database/                     # connection, migrations, repository implementations
      repositories/               # implementations of the modules' ports
    errors/                       # base application errors
    logger/                       # structured logger
    helpers/                      # reusable business-tied utilities, 2+ modules
    utils/                        # generic functions, no business logic
    interfaces/                   # shared types, by domain
  modules/                        # one module per business feature
    <feature>/
      helpers/                    # reusable business-tied utilities
      services/                   # this module's business logic; the critical, private part stays here
      repository/                 # the port: the interface, not the implementation
      interfaces/                 # this module's types
      index.ts                    # the public surface of the module
      __tests__/                  # colocated tests
  services/                       # outbound communication with third parties
    <third-party>/
      <third-party>.service.ts
```

### Test shape

```
import { describe, it, expect } from 'vitest';

describe('BillingService', () => {
  it('rejects an invoice when the total is negative', () => {
    // arrange, act, assert
  });
});
```

### Error shape

```
export class BillingValidationError extends Error {
  readonly code = 'BILLING_VALIDATION';

  constructor(message: string) {
    super(message);
    this.name = 'BillingValidationError';
  }
}
```
