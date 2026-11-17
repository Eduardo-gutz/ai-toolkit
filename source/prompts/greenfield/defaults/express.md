# Stack defaults — express

## Stack signature

- stack_id: express
- Detection signals: `express` in the `package.json` dependencies
  (`dependencies` or `devDependencies`).
- Serves: Express projects — HTTP APIs, web servers and
  backend-for-frontend layers.
- Inherits from: `node-typescript`
- Override rule: this file wins over its base for the same field path, and
  the base's rows fill what this file omits.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | express | the catalog file the stack_hint resolves to. |
| `stack.framework` | Express 5 | the Express release line the catalog prescribes. |
| `stack.test_framework` | Vitest with supertest | the runner and the HTTP-level assertion library the catalog pairs with. |
| `standards.testing.framework` | Vitest with supertest | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | the tree is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `src/core + src/modules/<feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `routes → controller → helpers → repository` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (app.ts → modules; modules → core, services; no cross-module imports)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase kebab-case directories` | the folder casing the stack's own tooling reads as native. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| express: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| express: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| express: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |
| express: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| express: how many approvals does a change need? | one approving review / two approving reviews / no review required | `standards.git_ci.review_policy` |

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
    routes/billing.routes.ts
    controller/billing.controller.ts
    helpers/invoice.helper.ts
    services/billing.service.ts
    repository/invoice.repository.ts
    interfaces/billing.interface.ts
  services/
    firebase/firebase.service.ts
```

### Module layout

```
src/
  app.ts                          # factory: creates the app, mounts middleware + routers
  server.ts                       # entry: listen()
  index.ts                        # public API of the package
  core/                           # shared by the project
    config/                       # environment and global constants
    database/                     # connection, migrations, repository implementations
      repositories/               # implementations of the modules' ports
    errors/                       # base application errors
    logger/                       # structured logger
    http/                         # HTTP middleware and pagination
      middleware/
    auth/                         # authentication and authorization
    helpers/                      # reusable business-tied utilities, 2+ modules
    utils/                        # generic functions, no business logic
    interfaces/                   # shared types, by domain
  modules/                        # one module per business feature
    <feature>/
      routes/                     # the URLs this module mounts
      controller/                 # HTTP semantics + this module's business logic: parse, validate, respond
      helpers/                    # reusable business-tied utilities
      services/                   # this module's critical, private logic
      repository/                 # the port: the interface, not the implementation
      schemas/                    # validation schemas, at the boundary
      interfaces/                 # this module's types
      errors.ts                   # this module's typed errors
      __tests__/                  # colocated tests
  services/                       # outbound communication with third parties
    <third-party>/
      <third-party>.service.ts
```

### Test shape

```
import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { app } from '../src/app';

describe('POST /billing/invoices', () => {
  it('rejects an invoice when the total is negative', async () => {
    const response = await request(app)
      .post('/billing/invoices')
      .send({ total: -1 });

    expect(response.status).toBe(400);
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
