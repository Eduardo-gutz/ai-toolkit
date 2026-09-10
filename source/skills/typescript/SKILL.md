---
name: typescript
description: TypeScript language best practices (handbook, Do's and Don'ts, utility types, strict tsconfig, typescript-eslint). Read when the user explicitly asks about TypeScript patterns, types, or when the project requires type-level decisions. Do NOT auto-trigger from generic mentions of "type", "interface", or "refactor" — only load when the user names TypeScript directly or asks for type-level guidance in a TS project. Does NOT cover framework-specific decisions (React, NestJS, FastAPI, etc.) — those are separate skills.
disable-model-invocation: true
---

# TypeScript

Stack-specific skill for the **TypeScript language**. Complementary to `frontend`, `backend`, `react-native-expo` and the framework skills.

**Official sources** (no invention): TypeScript Handbook, Do's and Don'ts, Utility Types, Advanced Types, TSConfig Reference, typescript-eslint Shared Configs.

> **How it is activated:** Only when the user explicitly asks for it or makes a type-level question in a TS project. This skill **does not auto-trigger** from generic mentions of "typing", "interface" or "refactor".

---

## Conventions this skill enforces (and where it yields)

1. **The project's architecture wins over this skill's defaults.** Before proposing `tsconfig`, naming, folder structure, or type patterns, read `AGENTS.md`, `code-style.md`, `architecture.md` or `.context/*` of the project. If the project defines conventions (path aliases, types naming, where shared types live, custom eslint rules, etc.), those win. This skill only contributes when the project does not define an explicit convention.

2. **Any example TS code follows the style of the context where it will be used.**
   - If the example is **UI / React**, this code is **complementary** to the project's UI/React skill: apply arrow function conventions, `FC<Props>`, non-UI helpers as `function`, etc.
   - If the example is **backend / Node / Deno / Bun**, follow the project's conventions (it can be CommonJS, ESM, arrow or `function` — do not assume).
   - If the example is **pure logic / util / type-level**, the syntax does not matter as long as it compiles. Use the most readable form.

3. **`strict: true` by default in new projects.** If the project does not define otherwise in `AGENTS.md`, this skill assumes `strict: true` and proposes the additional flags from §1 below. If the project is ALREADY in non-strict mode, **do not** force an upgrade without discussing it with the user.

4. **`any` is almost always wrong.** Only allowed in JS→TS migration or to type an external API without available types. In mature TS, `unknown` + narrowing. The project's rule (`@typescript-eslint/no-explicit-any: error`) wins.

5. **Official recommendation > personal preference.** The TypeScript Handbook and Do's and Don'ts are the source. If a practice contradicts "what we used to do", the current docs win.

6. **Naming:** `PascalCase` for types/interfaces/enums. Type parameters: `T` for one, `TKey`/`TValue`/`TItem` for several. No `IUser`/`TUser` (Hungarian prefix is not idiomatic in modern TS).

7. **`interface` vs `type`:** `interface` for shapes that are extended or implemented; `type` for unions, intersections, tuples, mapped types, functions. `@typescript-eslint/consistent-type-definitions` can force one or the other.

---

## Table of contents

| File | Covers |
|---|---|
| [`references/tsconfig.md`](references/tsconfig.md) | `tsconfig.json` by domain (Node, browser, bundler, library), flags, module resolution, target |
| [`references/linting.md`](references/linting.md) | `typescript-eslint` v8+ (base vs type-aware), Prettier, flat config |
| [`references/utility-types.md`](references/utility-types.md) | `Partial`/`Required`/`Readonly`/`Pick`/`Omit`/`Record`/`Exclude`/`Extract`/`NonNullable`/`ReturnType`/`Parameters`/`Awaited`/`NoInfer` with examples |
| [`references/narrowing.md`](references/narrowing.md) | `typeof`/`instanceof`/`in`, type predicates, discriminated unions, exhaustiveness |
| [`references/async.md`](references/async.md) | `Promise<T>`, `Awaited<T>`, `no-floating-promises`, `try/catch` with `unknown` |
| [`references/anti-patterns.md`](references/anti-patterns.md) | Complete Do's and Don'ts list with anti-pattern → alternative |

---

## Cheatsheet — quick decisions

| Need | Canonical solution |
|---|---|
| Return type of an existing function | `ReturnType<typeof fn>` |
| Params of an existing function | `Parameters<typeof fn>` |
| Unwrapped Promise | `Awaited<T>` |
| Partial update of an object | `Partial<T>` or `Partial<Pick<T, K>>` |
| Remove sensitive fields before exposing | `Omit<User, 'password'>` |
| Typed dictionary | `Record<Union, V>` |
| Remove `null`/`undefined` | `NonNullable<T>` |
| Force presence of optional fields | `Required<T>` |
| State with variants | Discriminated union + `assertNever(x: never)` (see [`references/narrowing.md`](references/narrowing.md)) |
| Value that may come from untyped JSON | `unknown` + narrowing with type predicate |
| Unwrap a `Promise.all<T1, T2, T3>` | `Awaited<typeof promise>` for each element |
| Configure tsconfig for Vite/Next/etc. | `target: ES2022`, `module: ESNext`, `moduleResolution: bundler` (see [`references/tsconfig.md`](references/tsconfig.md)) |
| Configure tsconfig for Node | `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext` |

---

## Primitives, any/unknown/never, null/undefined

**Primitives lowercase.** NEVER the wrappers: `string` ✅, `String` ❌. Official rule: *"Don't ever use the types `Number`, `String`, `Boolean`, `Symbol`, or `Object`."*

**`any` vs `unknown` vs `never`:**
- `any` disables the checker. Only in migration; **never** in mature TS.
- `unknown` requires narrowing before use.
- `never` for functions that throw, infinite loops, and exhaustiveness checks.

```ts
// ✅ GOOD — narrowing with unknown
function parse(input: unknown): string | number {
  if (typeof input === 'string') return input.toUpperCase();
  if (typeof input === 'number') return input.toFixed(2);
  throw new Error('Invalid input');
}

// ✅ GOOD — exhaustiveness with never
type Status = 'pending' | 'success' | 'error';
const assertNever = (x: never): never => { throw new Error(`Unhandled case: ${String(x)}`); };
const handle = (s: Status): string => {
  switch (s) {
    case 'pending': return '...';
    case 'success': return '...';
    case 'error':   return '...';
    default:        return assertNever(s);
  }
};
```

**`void` for callbacks whose return is ignored**: use `() => void`, not `() => any`. Official rule: *"Using `void` is safer because it prevents you from accidentally using the return value."*

**`null`/`undefined` with `strictNullChecks`:** `string` does not accept `null`. Use `User | null` (can be null) or `{ name?: string }` (may not be present). With `exactOptionalPropertyTypes: true`, `?:` and `| undefined` are not interchangeable. In `catch`, `e` is `unknown` — narrow with `instanceof Error`.

---

## Object types: `interface` vs `type`

```ts
interface User { id: string; name: string }
interface Admin extends User { permissions: string[] }

type Status = 'idle' | 'loading' | 'success' | 'error';
type Pair = [string, number];
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

See table §Utility types below for more; detailed cases in [`references/utility-types.md`](references/utility-types.md).

---

## Functions

**Return types:** inference when obvious; explicit on exports, public APIs, or non-trivial inference. `explicit-module-boundary-types` forces types on exports; `explicit-function-return-type` forces them everywhere (strict, only if the API is very stable).

**Overloads — specific first, general at the end:**

```ts
// ❌ NEVER — the general eclipses the specific
function process(input: string | number): string;
function process(input: string): string;

// ✅ YES — specific first
function process(input: string): string;
function process(input: string | number): string;
function process(input: string | number): string { /* impl */ }
```

> Official rule: *"Don't put more general overloads before more specific overloads."*

**Optional parameters:** only when **really** optional. In **callbacks**, **do not** use optional parameters (arity must be stable): `(err: Error | null, result: string | null) => void`, not `(err, result?) => void`.

**Generics:** name the type parameters (`TKey`, `TValue`) when there is more than one. Limit with constraints (`<T extends Constraint>`) when the function requires it. Do not declare type parameters you do not use.

```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }
```

---

## TS code reusability

Before writing any utility, type, or helper:

1. **Search the project** (`grep`/`glob`): `src/utils/`, `src/lib/`, `src/shared/`, `src/types/`, `modules/<feature>/types.ts` or `schemas.ts`.
2. **Search the TS stdlib** for utility types that already do the transformation. If `Partial`/`Pick`/`Omit`/`Record`/`Exclude`/`Extract`/`ReturnType`/`Parameters`/`Awaited`/`NonNullable`/`Required`/`Readonly` solve it, do not write a new type.
3. **Custom utility type** → document the "why" (not the "what" — the name already says that).
4. **Reuse in 2+ places** → extract. **Only 1 place** → do not extract (YAGNI).
5. **Existing reusable missing a case** → extend it with a type parameter before duplicating.

---

## Output contract

When this skill is active, the TypeScript code the agent produces must:

1. Compile without errors with `tsc --noEmit` running the project's `tsconfig.json`. Without type warnings.
2. Pass the linter (ESLint with typescript-eslint + Prettier) without warnings or errors.
3. Not use `any` unless explicitly justified in a comment.
4. Use `unknown` + narrowing when the type is not known up front.
5. Use the stdlib utility types for common transformations.
6. Use discriminated unions for states or results with variants; literal discriminant field.
7. Use type predicates only when the guard is not built-in.
8. Not use `// @ts-ignore`. If necessary, `// @ts-expect-error: <reason>`.
9. Exhaustiveness with `never` in switches over literal unions.
10. Explicit type imports/exports with `import type` and `export type`. `verbatimModuleSyntax: true` enforces it.
11. Naming: types/interfaces in `PascalCase`. Type parameters with `T` for one, `TKey`/`TValue` for several.
12. Tests with verified types: at least one test verifies the return type of a public function (`expectTypeOf` from Vitest).

If a step is not met, say so in the handoff. Do not hide `any` behind a cast.

---

## Operative rules for the agent

1. **Read `AGENTS.md` / `code-style.md` of the project before proposing tsconfig, naming, or structure.** If the project defines conventions, those win.
2. **Cite the official URL** (typescriptlang.org/docs/handbook/...) at the end of each specific technical recommendation.
3. **If the user asks something outside TS scope** (React-specific, backend framework, etc.), respond briefly and suggest the appropriate skill. Do not force this skill.
4. **Do not install dependencies on your own.** Recommend the command and let the user run it.
5. **If the user gives an explicit instruction that contradicts the official docs**, follow the user but warn about the trade-off in 1-2 sentences.
6. **For "what version of X"**, always prioritize the latest visible on `typescriptlang.org` or the package repo on GitHub.
