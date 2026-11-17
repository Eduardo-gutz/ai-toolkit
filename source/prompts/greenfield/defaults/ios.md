# Stack defaults — ios

## Stack signature

- stack_id: ios
- Detection signals: `Package.swift`, `*.xcodeproj`, `*.xcworkspace` or a
  `Podfile` at the top level, with no `package.json` and no Gradle files.
- Serves: native iOS projects — Swift, SwiftPM or Xcode projects, with
  SwiftUI or UIKit.
- Override rule: this file wins over the baseline for the same field path.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | ios | the catalog file the stack_hint resolves to. |
| `stack.language` | Swift | the language the iOS SDK and the Xcode templates target. |
| `stack.language_version` | 5.9 or newer | the Swift release line that ships with the current Xcode. |
| `stack.package_manager` | SwiftPM | the package manager the Swift toolchain ships with. |
| `stack.test_framework` | XCTest | the runner the Xcode toolchain ships with. |
| `stack.linter` | SwiftLint | the linter the Swift community standardises on. |
| `stack.formatter` | swift-format | the formatter the Swift toolchain ships with. |
| `stack.framework` | SwiftUI with UIKit where needed | the modern UI framework, with the legacy one available per view. |
| `standards.testing.framework` | XCTest | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | the Xcode project layout is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `Sources/<Feature>` | the catalog prescribes the tree: shared code in `core/`, one folder per business feature in `modules/`. |
| `standards.architecture.layer_flow` | `UI → Domain → Data` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (ui → domain → data)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase kebab-case directories` | the folder casing the stack's own tooling reads as native. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| ios: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| ios: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| ios: what accessibility target does the app commit to? | WCAG 2.1 AA / WCAG 2.2 AA / platform guidelines only / not defined yet | `standards.product.accessibility` |
| ios: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| ios: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |

## Verification tooling

> **The toolkit ships no iOS QA skill.** There is no `xcrun simctl` or
> Xcode verification skill in the pack, so the device-verification tooling
> for this stack stays `pending` until the project defines it.

The toolchain the project will use is the standard Apple one — `swift`
(the build driver), `xcodebuild` (the CI entry point) and SwiftPM (the
dependency manager). Which simulator or device runner the project adopts
is a project decision and is therefore left undecided here.

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
Sources/
  Billing/
    BillingView.swift
    BillingViewModel.swift
    let billingMaxRetries = 3
```

### Module layout

```
Sources/
  <Feature>/
    Data/
    Domain/
    UI/
```

### Test shape

```
import XCTest

final class BillingViewModelTests: XCTestCase {
    func testRejectsInvoiceWhenTotalIsNegative() {
        // arrange, act, assert
    }
}
```

### Error shape

```
enum BillingError: Error {
    case validation(code: String, message: String)
}
```
