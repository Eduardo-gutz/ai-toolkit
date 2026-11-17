# Stack defaults — react-native

## Stack signature

- stack_id: react-native
- Detection signals: `app.json` with an `expo` key, `expo` in the
  `package.json` dependencies, or `babel.config.js` together with
  `metro.config.js`.
- Serves: React Native projects built with Expo — the mobile toolchain the
  toolkit's own `react-native-expo` skill targets.
- Override rule: this file wins over the baseline for the same field path.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | react-native | the catalog file the stack_hint resolves to. |
| `stack.language` | TypeScript | the react-native catalog targets TypeScript projects, the Expo default. |
| `stack.language_version` | 20 or newer | the Node.js release line the Expo CLI and the Metro bundler support. |
| `stack.package_manager` | npm | the package manager that ships with the Node.js toolchain. |
| `stack.test_framework` | Jest | the runner the Expo template configures out of the box. |
| `stack.linter` | eslint-config-expo | the lint configuration that ships with the Expo template. |
| `stack.formatter` | Prettier | the formatter the Expo template pairs with eslint-config-expo. |
| `stack.framework` | Expo SDK 55 or newer with expo-router | the first Expo release whose default template ships the top-level `src/` directory this catalog's tree assumes; expo-router is the file-based router the toolkit's react-native-expo skill documents. |
| `standards.testing.framework` | Jest with @testing-library/react-native | the runner and the renderer the Expo template pairs with. |
| `standards.architecture.structure_type` | feature-based | the expo-router file-based layout is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `src/app + src/core + src/modules/<feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `app/<route>.tsx → routes → components → hooks → helpers → interfaces` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (src/app/_layout → modules; modules → core, services, redux; no cross-module imports)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase kebab-case directories` | the folder casing the stack's own tooling reads as native. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| react-native: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| react-native: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| react-native: what accessibility target does the app commit to? | WCAG 2.1 AA / WCAG 2.2 AA / platform guidelines only / not defined yet | `standards.product.accessibility` |
| react-native: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| react-native: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
src/
  app/
    _layout.tsx
    billing.tsx
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
  app/                            # expo-router routes
    _layout.tsx                   # root layout: providers
    index.tsx
    +not-found.tsx
    (tabs)/                       # route group, no URL segment
      _layout.tsx
      index.tsx
  core/                           # shared by the project
    components/                   # cross-platform design system, by size
      atoms/                      # indivisible pieces
      molecules/                  # composed from atoms
      organisms/                  # shared domain units
    helpers/                      # reusable business-tied utilities, 2+ modules
    utils/                        # generic functions, no business logic
    hooks/                        # reusable React hooks
    context/                      # shared context, by domain
    interfaces/                   # shared types, by domain
    config/                       # environment and global constants
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
      __tests__/                  # colocated tests
  services/                       # outbound communication with third parties
    native/                       # device modules
      <module>.service.ts         # camera, notifications, secure storage, push
    <third-party>/
      <third-party>.service.ts
  redux/                          # global state
    slices/<domain>/              # mirrors modules/<domain>/
      <domain>.slice.ts
      <domain>.thunk.ts
    store.ts                      # assembles the slices
    provider.ts                   # the store Provider
    hooks.ts                      # typed store hooks
  main.ts                         # only when the project registers its own root
```

### Test shape

```
import { render, screen } from '@testing-library/react-native';

describe('BillingScreen', () => {
  it('shows an error when the invoice total is negative', () => {
    render(<BillingScreen total={-1} />);
    // assert on the rendered output
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
