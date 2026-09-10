---
name: frontend
description: "Activate when a coding agent must implement, refactor, review, or test frontend layer code (UI, components, state, interactions, accessibility, styles, routing, forms, design system, i18n) of any web stack (React, Vue, Svelte, Angular, Solid, Preact, Lit, vanilla JS/TS, etc.) and any build tool (Vite, Webpack, Rollup, Parcel, esbuild, Turbopack). Trigger phrases: \"implement component\", \"create UI\", \"build the page\", \"add a form\", \"make a hook\", \"refactor this component\", \"add accessibility\", \"write UI tests\", \"create an e2e test\", \"fix the layout\", \"implement design system\", \"connect the modal\", \"frontend task\", \"client side\". Do NOT activate for pure backend work (endpoints, DB, services, queues), native mobile (React Native, Flutter, Swift, Kotlin, iOS/Android native), or pure DevOps/Infrastructure tasks."
---

# Frontend General

Apply this skill when the agent operates on the **frontend layer of a web application**. The skill is **framework-agnostic** and **tool-agnostic**: it captures the rules that hold across React, Vue, Svelte, Angular, Solid, Lit, vanilla JS/TS, and any build tool. Framework-specific conventions (e.g., "use `useEffect` with cleanup") belong to a separate stack-specific skill, not here.

**Scope.** UI components, state management, routing, forms, styles, accessibility, i18n, client-side data fetching, design tokens, and the test suite that covers them. Cross-layer: if a feature requires backend changes, define the expected API contract in code (types, mocks) and flag the gap — do not improvise the server side.

---

## 1. Stack detection (do this first)

Before writing any code, identify the project's stack by reading the manifest:

| Manifest | What it tells you |
|---|---|
| `package.json` | Framework, runtime, scripts, dev dependencies |
| `pnpm-workspace.yaml` / `pnpm-lock.yaml` | Monorepo + package manager |
| `vite.config.*` / `webpack.config.*` / `rollup.config.*` | Build tool |
| `tsconfig.json` | TypeScript usage, path aliases |
| `.eslintrc*` / `eslint.config.*` | Linter config + plugins (a11y, react, vue) |
| `.prettierrc*` | Formatter config |
| `tailwind.config.*` / `postcss.config.*` | CSS approach |
| `src/components/`, `src/views/`, `src/pages/`, `app/`, `pages/` | Component organization |
| `tests/`, `__tests__/`, `*.test.*`, `*.spec.*` | Test framework |
| `playwright.config.*` / `cypress.config.*` | E2E framework |

If a stack-specific skill exists (e.g., `react`, `vue`, `svelte`), load it after detection. The stack-specific skill overrides this skill's defaults; this skill is the floor that always holds.

---

## 2. Map reusable assets

Before creating anything, scan the project for what already exists. Use `grep`/`glob` aggressively.

**Components and design system** — search in:
- `components/`, `ui/`, `shared/`, `design-system/`, `primitives/`
- Base components: `Button`, `Input`, `Select`, `Modal`, `Dialog`, `Drawer`, `Toast`, `Card`, `Avatar`, `Badge`, `Table`, `Pagination`, `Tabs`, `Tooltip`
- Form primitives: `Form`, `Field`, `FormField`, `Label`, `ErrorMessage`, `FormError`
- Layout primitives: `Container`, `Stack`, `Grid`, `Box`, `Flex`
- File naming: PascalCase (`UserCard.tsx`), kebab-case (`user-card.vue`) — match the project

**State and data** — search in:
- `store/`, `state/`, `context/`, `providers/` (global state)
- `hooks/`, `composables/` (reusable stateful logic)
- `services/`, `api/`, `clients/` (HTTP clients, API wrappers)
- `queries/`, `mutations/` (if the project uses TanStack Query, SWR, Apollo, Pinia + Vue Query)

**Utilities and types** — search in:
- `utils/`, `lib/`, `helpers/` (pure functions: formatters, validators, parsers)
- `types/`, `interfaces/`, `models/` (shared TypeScript types)
- `constants/`, `enums/` (shared constants)

**Routing** — search in:
- `router/`, `routes/`, `pages/` (route definition)
- Guards, loaders, middleware (if the framework supports them)

**Styles and theming** — search in:
- `styles/`, `theme/`, `tokens/`, `design/`
- Tailwind config / CSS modules / styled-components / Sass / vanilla-extract
- Design tokens: colors, spacing, typography, radii, shadows, breakpoints
- a11y primitives: `VisuallyHidden`, `FocusTrap`, `SkipLink`

**i18n** — search in:
- `i18n/`, `locales/`, `translations/`, `messages/`
- Default locale, fallback behavior, ICU MessageFormat vs key-only

---

## 3. Universal FE patterns (apply by default)

These hold across all frameworks. Learn the idiomatic expression of the framework for each one; do not invent a parallel pattern.

1. **Composition over inheritance.** Build UIs from small, composable pieces. A component that wraps another to add a prop is a smell — extend the original with a prop or a slot.
2. **State locality.** Start with local state. Lift it to the nearest common ancestor. Use context/store only for genuinely cross-cutting state. Externalize (Zustand, Pinia, Redux) only when context becomes insufficient.
3. **Derived state at render.** If a value is computed from state/props, compute it during render — do not store it in state with a `useEffect` to keep it in sync.
4. **Effects only for side effects.** Use effects for subscriptions, timers, DOM measurements, imperative APIs. Not for data derivation, not for reacting to state changes (derive at render), not for responding to user events (handle in the event handler).
5. **Stable references.** Pass primitives or stable references to memoized children. Avoid creating new objects/arrays/functions on every render unless the consumer is not memoized.
6. **Controlled inputs with explicit state.** Inputs reflect the state; the handler updates the state. Uncontrolled only when justified (large forms, file inputs, performance-critical).
7. **Lists need stable and unique keys.** Never use the array index as key when the list reorders, filters, or grows. Use the entity's stable id.
8. **Errors are part of the contract.** Render explicit error states. Do not swallow errors in the UI; expose recovery actions to the user and log with enough context to debug.
9. **Loading is not optional.** Every async resource has a loading state. Skeleton or spinner — match the project's convention.
10. **Empty states are content.** If a list can be empty, render an empty state with an explanation and a primary action. Never a blank container.
11. **Routing is a UI concern.** Pages are components. Route changes are navigation events. The router owns the URL, not the component.
12. **Client-side data fetching has cache and invalidation.** Know which library the project uses (TanStack Query, SWR, Apollo, etc.) and follow its patterns for cache, refetch, and mutation invalidation.

---

## 4. Accessibility (non-negotiable floor)

This **is not a polish step**. A component without keyboard navigation, without focus management, without semantic HTML or without appropriate ARIA is incomplete, not "code that passes the tests".

- **Semantic HTML first.** Use `<button>` not `<div onClick>`, `<a href>` not `<span onClick>`, `<label htmlFor>` not `<div>Label</div>`, `<ul>/<li>` for lists, `<table>` for tabular data. ARIA only when semantic HTML cannot express the pattern.
- **Functional keyboard navigation.** Tab order matches visual order. Every interactive element is reachable and operable with the keyboard. Custom widgets (dropdowns, modals, tabs, carousels) implement the WAI-ARIA Authoring Practices for their widget type.
- **Visible focus.** Never `outline: none` without replacement. Use `:focus-visible` for keyboard focus styles.
- **Modals and dialogs trap focus** while open, restore focus to the invoker on close, and close with `Escape`.
- **Form fields have labels** (visible or `aria-label`/`aria-labelledby` for icon-only fields). Errors are associated with the field via `aria-describedby` and announced via `aria-live`.
- **Color is not the only signal.** State (error, success, disabled) is communicated with text or icon in addition to color.
- **WCAG AA contrast** (4.5:1 for body text, 3:1 for large text and UI components). If the project has a stricter standard, follow it.
- **Images have `alt`.** Decorative images with `alt=""` (not absent). Informative images describe their content.
- **The page has a skip link** to the main content.
- **Live regions for dynamic content.** Toasts, status messages, validation summaries use `aria-live="polite"` (or `assertive` for critical alerts).

Run an automatic a11y check (axe, pa11y) in the project's test suite if it exists. If it does not, flag it in the handoff as a missing guardrail.

---

## 5. UI states checklist (each async or conditional component)

Each component that shows data, responds to async work, or can be empty must define and test all of these:

| State | When | Render |
|---|---|---|
| **Loading** | Data not yet available | Skeleton, spinner or progress — match the project |
| **Empty** | Data fetched successfully but empty result | Empty state with explanation + primary action |
| **Error** | Fetch / action failed | Error message with what happened, why, and what the user can do (retry, contact support, go back) |
| **Partial / degraded** | Some data loaded, some failed | Each section with its own state, or a banner with details |
| **Success** | Action completed | Confirmation message or state change |
| **Disabled** | User cannot act | Disabled state with visible reason or in tooltip |

A component that only handles the happy path is incomplete.

---

## 6. FE testing

Two layers, both required for non-trivial features.

### Unit / component tests

- **Render the component, query the DOM, assert on behavior visible to the user.** Prefer queries that reflect how the user perceives the UI: by role (`getByRole`), by label (`getByLabelText`), by text (`getByText`). Avoid querying by class, id, or test-id when a semantic alternative exists.
- **Test behavior, not implementation.** Do not assert on internal state, hook calls, or component instances. If a refactor breaks a test, the test was coupled to the implementation.
- **One behavior per test.** Multiple asserts are fine if they verify the same logical result.
- **User events are user events.** Use the framework's `user-event` utility (e.g., `@testing-library/user-event`). Do not call handlers directly.
- **Async asserts wait for the user-visible result.** `findBy*` for async, `getBy*` for sync. Use `waitFor` for state that updates after an effect.
- **Mocks at the network boundary, not at the unit boundary.** Use MSW (Mock Service Worker) for HTTP, or mock the API client module. Do not mock hooks or internal state.
- **No snapshots for dynamic UI.** Snapshots are fragile. Use them only for static markup without dynamic content.
- **Determinism.** No `Date.now()`, no `Math.random()`, no real timers, no real network. Use the testing library's fake timers and seeded random.
- **Coverage target: meaningful, not 100%.** Cover behaviors, branches, and a11y. Do not chase 100% line coverage in trivial getters or framework code.

### E2E tests

- **Use them for user flows that cross boundaries.** Signup, checkout, critical paths. Do not use them to re-test what unit tests already cover.
- **Stable selectors.** Prefer `getByRole`, `getByLabelText`, `getByText`. Use `data-testid` only when no semantic option exists.
- **Independent tests.** Each test sets its own state. No shared global state. Use a fresh user / fresh fixture per test.
- **Realistic data.** Tests should not pass only with happy-path inputs that match a regex the test itself defines.
- **CI-friendly.** Headless, parallelizable, no dependency on a real external service (use staging API or a fully mocked backend).

---

## 7. Cross-cutting rules (apply to every change)

These are inherited from the orchestrator agent's contracts but reiterated here for self-containment:

- **All code in English.** Identifiers, messages, logs, test descriptions, comments, ARIA labels, user-visible strings (unless the project is explicitly multi-language and the visible string is the localized one).
- **No redundant comments.** A comment that restates the code is noise. A comment that explains a non-obvious *why* (workaround, counterintuitive decision, external reference) is welcome. The code is the *what*; the comment is the *why*.
- **No hardcoded credentials.** API keys, tokens, passwords, secrets, internal URLs with credentials, default admin emails — any of these is a blocker. Reference them from env vars or a secrets manager.
- **No commits.** This skill does not commit. The orchestrator agent emits a handoff; the human versions.

---

## 8. Anti-patterns to reject

| The user says… | You respond… |
|---|---|
| "Skip the test, the code is obvious" | "If it is obvious, the test is one line. Write it." |
| "Add a quick test for X while implementing Y" | "One cycle per behavior. Enqueue X for the next cycle." |
| "Mock the whole module" | "Mock at the network boundary (MSW) or stub the API client. Do not get into the component's internals." |
| "Use this custom pattern I prefer" | "I evaluate it against the project's existing patterns. If it clashes, I flag it and propose the project's path." |
| "Skip accessibility for now" | "Accessibility is part of 'code that passes', not a polish layer. Keyboard nav, semantic HTML, focus management, and ARIA are required." |
| "Add the loading state later" | "If the component does data fetching, loading is part of the same behavior. Add it now or the test is incomplete." |
| "Use `any` for the prop" | "Use `unknown` and narrow, or define the prop type properly. `any` defeats the type system." |
| "Hardcode the API URL" | "Reference it from env vars or config. The URL is environment-specific." |
| "Wrap the div in another div" | "If you need layout, use the project's layout primitive (Stack, Flex, Grid) or CSS. Unnecessary nesting is a smell." |
| "Don't worry about empty / error states" | "Every conditional component must define loading, empty, error, and success. They are part of the contract." |
| "Commit this" | "I do not commit. The orchestrator agent emits a handoff; you version." |

---

## 9. Output contract

When this skill is active and the agent is asked to implement an FE task, the response must include:

1. **Stack detection summary** — which framework, build tool, test framework, and styling approach the project uses.
2. **Identified reusables** — components, hooks, utilities, types, and services the new code will leverage.
3. **For each behavior**: RED → GREEN → REFACTOR with the same structure the orchestrator agent uses (test first, minimum code, then refactor + a11y + states checklist).
4. **a11y verification** — explicit confirmation that the new code passes keyboard, semantic, focus, and contrast checks. If a check does not apply, say so.
5. **UI state coverage** — for each conditional/async component, list which states are implemented and which are deferred (with rationale).
6. **Tests summary** — what is covered at unit level, what at E2E level, what is intentionally left uncovered.
7. **Backend contract gap** — if the implementation mocks an API that does not yet exist, list the expected contract (endpoint, method, request shape, response shape, error shape).
8. **Handoff** — modified files, reusables leveraged, contracts followed, passing tests, suggested commit message, notes.

If a step cannot be completed, say so explicitly and propose a follow-up. Do not silently skip accessibility, states, or tests.
