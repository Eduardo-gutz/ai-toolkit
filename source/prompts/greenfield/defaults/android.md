# Stack defaults — android

## Stack signature

- stack_id: android
- Detection signals: `build.gradle`, `build.gradle.kts`,
  `settings.gradle`, `settings.gradle.kts` or `gradle.properties` at the
  top level, with no `package.json`.
- Serves: native Android projects — Kotlin or Java, Gradle build, and
  either Jetpack Compose or the View system.
- Override rule: this file wins over the baseline for the same field path.

## Defaults

| Field | Value | Rationale |
|---|---|---|
| `stack.id` | android | the catalog file the stack_hint resolves to. |
| `stack.language` | Kotlin | the language the Android toolchain and the Jetpack libraries target. |
| `stack.language_version` | 2.0 or newer | the Kotlin release line the current Android Gradle Plugin supports. |
| `stack.package_manager` | Gradle | the build system that also resolves the project's dependencies. |
| `stack.test_framework` | JUnit | the runner the Android Gradle Plugin wires into the `test` task by default. |
| `stack.linter` | Android Lint | the linter the Android Gradle Plugin ships with. |
| `stack.formatter` | ktlint | the formatter the Kotlin ecosystem pairs with the Android lint rules. |
| `stack.framework` | Android SDK with Jetpack Compose | the modern UI toolkit the Android Gradle Plugin templates ship with. |
| `standards.testing.framework` | JUnit | the runner the catalog prescribes for this stack. |
| `standards.architecture.structure_type` | feature-based | the Android module layout is organized by feature, not by technical layer. |
| `standards.architecture.module_layout` | `app/src/main/java/<package>/<feature>` | the catalog prescribes the tree: one Gradle module per business feature, each split into `data/`, `domain/` and `ui/`. |
| `standards.architecture.layer_flow` | `ui → domain → data` | the order the layers read in, and the vocabulary the generated architecture.md uses for its layer sections. |
| `standards.architecture.dependency_direction` | `inward (ui → domain → data)` | the arrows are the only ones allowed: the entry point mounts the modules, a module reaches core, services and redux, and no module ever imports another. |
| `standards.architecture.directory_conventions` | `lowercase kebab-case directories` | the folder casing the stack's own tooling reads as native. |

## Tier 2 questions

At most 5 stack-specific questions. They close the leaves that no Tier-1
question closes and that the baseline deliberately leaves pending.

| Question | Options | Field |
|---|---|---|
| android: how do you write a test — one behavior per test, or a scenario per test? | one behavior per test / scenario per test / test doubles over real collaborators | `standards.testing.test_style` |
| android: which checks must pass before a change merges? | lint and tests / lint, tests and type check / lint, tests, type check and build | `standards.git_ci.required_checks` |
| android: what accessibility target does the app commit to? | WCAG 2.1 AA / WCAG 2.2 AA / platform guidelines only / not defined yet | `standards.product.accessibility` |
| android: how much documentation does the project carry? | README per module plus public API docs / README at the root only / docs site plus READMEs | `standards.product.documentation` |
| android: what is the comment policy? | explain why, never what / minimal comments, public API documented / no comments, rely on naming | `standards.code_style.comments` |

## Verification loop

The device-verification toolchain for this stack is `adb`:

1. `adb devices` — list the connected devices and pick the target.
2. `adb install -r <apk>` — install the freshly built APK, replacing the
   previous one.
3. `adb shell am start -n <package>/<activity>` — launch the app.
4. `adb logcat` — read the runtime log.
5. `adb shell screencap` — capture the screen.
6. `adb shell uiautomator dump` — dump the view hierarchy.

> The application id is **read from the project** — `app.json` or the
> `applicationId` in `build.gradle`. It is never hardcoded in the catalog.

## Prescribed patterns

Templates, not extractions — a greenfield project has no code to extract
from. Copy them as starting shapes and adjust them.

### Naming

```
src/main/java/com/example/billing/
  BillingActivity.kt
  BillingViewModel.kt
  const val BILLING_MAX_RETRIES = 3
```

### Module layout

```
app/src/main/java/<package>/
  <feature>/
    data/
    domain/
    ui/
```

### Test shape

```
class BillingViewModelTest {
    @Test
    fun `rejects an invoice when the total is negative`() {
        // arrange, act, assert
    }
}
```

### Error shape

```
class BillingValidationException(
    message: String,
) : IllegalArgumentException(message) {
    val code: String = "BILLING_VALIDATION"
}
```
