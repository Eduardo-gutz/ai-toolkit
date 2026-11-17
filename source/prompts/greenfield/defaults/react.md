# Stack defaults — react

## Stack signature

- stack_id: react
- Detection signals: `react` in the `package.json` dependencies
  (`dependencies` or `devDependencies`), with no `next` marker (`next` in
  the dependencies, or a top-level `next.config.{js,mjs,ts,cjs}`) and no
  Expo marker (`expo` in the dependencies, `app.json` with an `expo` key,
  or `babel.config.js` together with `metro.config.js`).
- Serves: React projects built with Vite — single-page applications,
  design systems and shared UI packages.
- Inherits from: `node-typescript`
- Override rule: this file wins over its base for the same field path, and
  the base's rows fill what this file omits.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | react | the catalog file the stack_hint resolves to. |
| `stack.framework` | React 19 with Vite | the React release line and the build tool the catalog prescribes. |
| `stack.test_framework` | Vitest with @testing-library/react | the runner and the renderer that query the DOM the way a user does. |
| `standards.testing.framework` | Vitest with @testing-library/react | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | a component tree is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `src/core + src/modules/<feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `routes → components → hooks → helpers → interfaces` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (App → modules; modules → core, services, redux; no cross-module imports)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase kebab-case directories` | the folder casing the stack's own tooling reads as native. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| react: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| react: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| react: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |
| react: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| react: how many approvals does a change need? | one approving review / two approving reviews / no review required | `standards.git_ci.review_policy` |

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
src/
  core/
    components/atoms/Button.tsx
    helpers/tax.helper.ts
    utils/formatDate.util.ts
    hooks/useDebounce.ts
  modules/billing/
    components/BillingCard.tsx
    helpers/tax.helper.ts
    routes/billing.routes.tsx
    hooks/useBilling.ts
    services/billing.service.ts
    interfaces/billing.interface.ts
  redux/slices/billing/
    billing.slice.ts
    billing.thunk.ts
```

### Module layout

```
src/
  core/                            # shared by the project
    components/                    # design system, by size
      atoms/                       # indivisible pieces
      molecules/                   # composed from atoms
      organisms/                   # shared domain units
    helpers/                       # reusable business-tied utilities, 2+ modules
    utils/                         # generic functions, no business logic
    hooks/                         # reusable React hooks
    context/                       # shared context, by domain
    interfaces/                    # shared types, by domain
    config/                        # environment and global constants
  modules/                         # one module per business feature
    <feature>/
      components/                  # this module's components
      helpers/                     # reusable business-tied utilities
      routes/                      # the routes + the page template
      hooks/                       # this module's hooks
      context/                     # this module's context
      interfaces/                  # this module's types
      services/                    # this module's critical, private logic
      __tests__/                   # colocated tests
  services/                        # outbound communication with third parties
    <third-party>/
      <third-party>.service.ts
  redux/                           # global state
    slices/<domain>/               # mirrors modules/<domain>/
      <domain>.slice.ts
      <domain>.thunk.ts            # incoming-data handling
    store.ts                       # assembles the slices
    provider.ts                    # the store Provider
    hooks.ts                       # typed store hooks
  App.tsx                          # root: providers + router
  index.ts                         # entry point
```

### Test shape

```
import { render, screen } from '@testing-library/react';

describe('BillingPanel', () => {
  it('shows an error when the invoice total is negative', () => {
    render(<BillingPanel total={-1} />);
    expect(screen.getByRole('alert').textContent).toMatch(/negative/i);
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
