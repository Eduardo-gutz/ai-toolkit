# Stack defaults — nextjs

## Stack signature

- stack_id: nextjs
- Detection signals: `next` in the `package.json` dependencies
  (`dependencies` or `devDependencies`), or a top-level `next.config.js`,
  `next.config.mjs`, `next.config.ts` or `next.config.cjs`.
- Serves: Next.js projects built with the App Router — web applications
  and sites that render on the server and hydrate in the browser.
- Inherits from: `react`
- Override rule: this file wins over its base for the same field path, and
  the base's rows fill what this file omits.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | nextjs | the catalog file the stack_hint resolves to. |
| `stack.framework` | Next.js 15 with the App Router | the framework release line and the router the catalog prescribes. |
| `stack.test_framework` | Vitest with @testing-library/react | the runner and the renderer that query the DOM the way a user does. |
| `standards.testing.framework` | Vitest with @testing-library/react | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | the App Router organizes the tree by route and feature, not by technical layer. |
| `standards.architecture.module_layout` | `src/app + src/core + src/modules/<feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `app/page.tsx → routes → components → hooks → helpers → interfaces` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (app/layout → modules; modules → core, services, redux; no cross-module imports)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase kebab-case directories` | the folder casing the stack's own tooling reads as native. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| nextjs: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| nextjs: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| nextjs: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |
| nextjs: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| nextjs: how many approvals does a change need? | one approving review / two approving reviews / no review required | `standards.git_ci.review_policy` |

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
src/
  app/
    layout.tsx
    billing/page.tsx
  core/
    components/atoms/Button.tsx
    helpers/tax.helper.ts
    utils/formatDate.util.ts
  modules/billing/
    components/BillingCard.tsx
    helpers/tax.helper.ts
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
  app/                            # App Router — the route table
    layout.tsx                    # root layout: html, body, providers
    page.tsx
    loading.tsx
    error.tsx
    not-found.tsx
    (group)/                      # route group, no URL segment
      page.tsx
    <segment>/                    # one segment per feature
      layout.tsx
      page.tsx
      [dynamicId]/                # dynamic segment
        page.tsx
  core/                           # shared by the project
    components/                   # client-side design system, by size
      atoms/                      # indivisible pieces
      molecules/                  # composed from atoms
      organisms/                  # shared domain units
    server/                       # server-only, never shipped to the browser
      auth/                       # server session, guards
      database/                   # db client, pool, transactions
      sdk/                        # server-side SDKs
    helpers/                      # reusable business-tied utilities, 2+ modules
    utils/                        # generic functions, no business logic
    hooks/                        # reusable React hooks
    context/                      # shared context, by domain
    interfaces/                   # shared types, by domain
    config/                       # environment and global constants
      env.ts                      # public env vs private env
  modules/                        # one module per business feature
    <feature>/
      components/                 # this module's components
      helpers/                    # reusable business-tied utilities
      routes/                     # the routes this module contributes
      hooks/                      # this module's hooks
      context/                    # this module's context
      interfaces/                 # this module's types
      services/                   # this module's critical, private logic
        <feature>.service.ts      # the contract
        <feature>.adapters.ts     # the implementation per backend
      server/                     # actions, queries, server-only code
      __tests__/                  # colocated tests
  services/                       # outbound communication with third parties
    <third-party>/
      <third-party>.service.ts
  redux/                          # global client state
    slices/<domain>/              # mirrors modules/<domain>/
      <domain>.slice.ts
      <domain>.thunk.ts
    store.ts                      # assembles the slices
    provider.ts                   # the store Provider
    hooks.ts                      # typed store hooks
  middleware.ts                   # Next middleware, runs at the edge
```

### Test shape

```
// A route component is a server component by default. The 'use client'
// directive belongs only in the leaf that needs interactivity.
import { render, screen } from '@testing-library/react';

describe('BillingSummary', () => {
  it('shows the invoice total', () => {
    render(<BillingSummary total={120} />);
    expect(screen.getByRole('status').textContent).toMatch(/120/);
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
