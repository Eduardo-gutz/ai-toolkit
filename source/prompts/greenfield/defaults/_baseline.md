# Stack defaults — baseline

The generic fallback catalog. Every stack that has no dedicated catalog
file loads this file **alone**, and every stack-specific field then stays
`pending`.

## Stack signature

- stack_id: baseline
- Detection signals: none — this file is the fallback for every stack,
  including the `unknown` stack_hint.
- Serves: any project whose stack has no dedicated catalog file. When
  `stack_hint` is `unknown`, only this baseline applies and every
  stack-specific field stays pending.
- Override rule: a per-stack catalog file wins over this baseline for the
  same field path.

## Defaults

Generic, stack-neutral defaults. They apply when the developer did not
answer a question and the per-stack file has nothing to say.

| Field | Value | Rationale |
|---|---|---|
| `standards.code_style.naming_files` | kebab-case | the baseline default: kebab-case reads the same across every language the catalog covers. |
| `standards.code_style.naming_classes` | PascalCase | the baseline default for type and class names. |
| `standards.code_style.naming_functions` | camelCase | the baseline default for functions and methods. |
| `standards.code_style.naming_variables` | camelCase | the baseline default for local and module-level variables. |
| `standards.code_style.naming_constants` | UPPER_SNAKE_CASE | the baseline default, so constants stand out in a file scan. |
| `standards.code_style.imports_order` | external → internal → relative | the baseline default: groups the code you did not write first. |
| `standards.code_style.export_style` | named exports | the baseline default: explicit names survive a refactor. |
| `standards.code_style.error_handling_pattern` | throw typed error classes | the baseline default: one error type per failure mode. |
| `standards.code_style.async_pattern` | async/await | the baseline default, so every call site reads the same. |
| `standards.testing.test_naming` | mirrors the source file name with the runner's test suffix | the baseline default, so a test is found by the file it covers. |
| `standards.testing.test_placement` | next to the source file it covers | the baseline default, so the test travels with the code. |
| `standards.git_ci.commit_style` | Conventional Commits | the baseline default: the commit type is machine-readable. |
| `standards.git_ci.branching` | trunk-based | the baseline default: short-lived branches, no long-lived forks. |
| `standards.git_ci.ci_platform` | GitHub Actions | the baseline default, the most common hosted CI. |
| `standards.cross_cutting.errors` | typed error classes carrying a stable error code | the baseline default, so a caller can branch on the code and not the message. |
| `standards.cross_cutting.logging` | structured logger with levels | the baseline default, so logs are queryable instead of free text. |
| `standards.cross_cutting.validation` | schema validation at the boundary | the baseline default, so invalid input never reaches the domain. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that this baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| Baseline: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| Baseline: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| Baseline: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |
| Baseline: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| Baseline: how many approvals does a change need? | one approving review / two approving reviews / no review required | `standards.git_ci.review_policy` |

## Pending allowlist

Every schema leaf this baseline does **not** default. They stay `pending`
(value `null`, listed in `open_questions`) unless one of the 12 Tier-1
questions confirms them or a matching per-stack catalog file supplies a
stack-specific default.

Generic defaults are deliberately **not** invented for them: a plausible
guess is indistinguishable from a decision the project never made.

| Field | Why it stays pending |
|---|---|
| `stack.id` | the stack identifier is decided by the interview or by the manifest scan, never by a generic default. |
| `stack.language` | the language depends on the detected stack; only a per-stack file can name it. |
| `stack.language_version` | the runtime version depends on the detected stack. |
| `stack.package_manager` | the package manager depends on the detected stack. |
| `stack.test_framework` | the test runner depends on the detected stack. |
| `stack.linter` | the linter depends on the detected stack and on the developer's tooling. |
| `stack.formatter` | the formatter depends on the detected stack and on the developer's tooling. |
| `stack.framework` | whether the project uses a framework at all is a project decision. |
| `standards.architecture.structure_type` | layered, feature-based, flat and monorepo are all defensible; the developer decides. It stays pending here only when no per-stack catalog matches — every catalog that names a stack prescribes one. |
| `standards.architecture.module_layout` | the tree shape is stack-specific: `src/core + src/modules/<feature>` in TypeScript, `app/core + app/modules/<feature>` in Python, `src/Core + src/Modules/<Feature>` under PSR-4. Only a catalog that names the stack can prescribe one. |
| `standards.architecture.layer_flow` | the layer vocabulary is stack-specific: a UI stack reads `routes → components → hooks → helpers → interfaces`, a backend reads `routes → controller → helpers → repository`. Only a catalog that names the stack can prescribe one. |
| `standards.architecture.dependency_direction` | the allowed arrows name real folders, so they are stack-specific: `inward (App → modules; modules → core, services, redux)` is not the rule of a backend. |
| `standards.architecture.directory_conventions` | the folder casing is stack-specific: snake_case in Python, PascalCase under PSR-4, kebab-case in TypeScript. |
| `standards.code_style.comments` | the comment policy is a team preference with no technically correct answer. |
| `standards.testing.framework` | the test runner depends on the detected stack. |
| `standards.testing.test_style` | one-behavior and scenario styles are both defensible. |
| `standards.testing.coverage_gate` | a coverage threshold is a project commitment, not a convention. |
| `standards.git_ci.required_checks` | the required checks depend on the CI platform and the team's risk appetite. |
| `standards.git_ci.review_policy` | the review policy is a team agreement. |
| `standards.cross_cutting.auth` | the authentication strategy depends on the product, not on the stack. |
| `standards.cross_cutting.i18n` | whether the product is translated is a product decision. |
| `standards.cross_cutting.cache` | the caching strategy depends on the workload. |
| `standards.cross_cutting.feature_flags` | using feature flags at all is a team convention. |
| `standards.cross_cutting.rate_limiting` | rate limiting depends on the product's exposure. |
| `standards.product.documentation` | the documentation level is a team commitment. |
| `standards.product.accessibility` | the accessibility target is a product commitment. |
| `standards.product.license` | the license is the project's legal choice. |
| `standards.product.performance_budget` | a performance budget needs real numbers from the product. |

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
my-feature/
  MyFeatureController.ts
  myFeatureService.ts
  MY_FEATURE_MAX_RETRIES
```

### Module layout

```
src/
  my-feature/
    domain/
    data/
    ui/
```

### Test shape

```
// One behavior per test. The name states the behavior, not the method.
describe('MyFeatureService', () => {
  it('rejects a request when the payload is empty', () => {
    // arrange, act, assert
  });
});
```

### Error shape

```
// One error type per failure mode, with a stable machine-readable code.
class MyFeatureNotFoundError extends Error {
  readonly code = 'MY_FEATURE_NOT_FOUND';

  constructor(id: string) {
    super(`My feature ${id} was not found`);
  }
}
```
