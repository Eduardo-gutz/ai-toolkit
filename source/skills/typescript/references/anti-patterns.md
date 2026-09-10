# Anti-patterns — Do's and Don'ts

> **Official source:** https://www.typescriptlang.org/docs/handbook/2/types-from-types.html · https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html · https://typescript-eslint.io/rules/

## 1. Primitive types

| ❌ Anti-pattern | ✅ Alternative | Why |
|---|---|---|
| `String`, `Number`, `Boolean`, `Symbol`, `Object` (capitalized) | `string`, `number`, `boolean`, `symbol`, `object` | *"Don't ever use the types `Number`, `String`, `Boolean`, `Symbol`, or `Object`."* — Handbook. The capitalized ones are object wrappers; the lowercase ones are primitives. |
| `Function` (generic type) | Specific `(args: X) => Y` | `Function` says nothing about args or return. |

```ts
// ❌
function fn(cb: Function) { /* ... */ }

// ✅
function fn(cb: (err: Error | null, result: string) => void) { /* ... */ }
```

## 2. `any` vs `unknown`

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| `any` declared explicitly | `unknown` + narrowing (see `references/narrowing.md`) |
| `as any` to "fix" a type error | `as unknown as X` + narrow, or fix the real type |
| `any` on external APIs without types | `unknown` + a type guard or runtime validation |

```ts
// ❌ — any disables the checker for ALL code that touches it
function process(data: any) {
  return data.foo.bar.baz; // What if data is null? No way to know.
}

// ✅ — unknown forces narrowing
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'foo' in data) {
    const foo = data.foo as { bar?: { baz?: string } };
    return foo.bar?.baz;
  }
}
```

**`any` allowed only in:**
- Gradual migration from JS to TS (with `// TODO: type this` or equivalent).
- Typing external APIs that have no types (temporarily, while you get the `.d.ts`).
- Tests with mocks (with `eslint-disable-next-line @typescript-eslint/no-explicit-any` justified).

Enable `@typescript-eslint/no-explicit-any: error` in production.

## 3. Type assertions

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| `// @ts-ignore` without reason | `// @ts-expect-error: <reason>` or fix the type |
| `!` non-null assertion indiscriminate | Validate first (`if (x !== null) { x.foo }`) |
| Unnecessary type assertion | Remove the cast — if the type is correct, the cast is not needed |

```ts
// ❌ — ts-ignore hides a real problem
// @ts-ignore
const x = something.nope.unknown;

// ✅ — ts-expect-error documents the "why" and fails if the problem gets fixed
// @ts-expect-error: third-party types are wrong in this version, fixed in 2.4.0
const x = something.nope.unknown;

// ❌ — non-null assertion can blow up
function process(user: User | null) {
  return user!.id; // 💥 if user is null
}

// ✅ — narrow first
function process(user: User | null) {
  if (!user) throw new Error('user is null');
  return user.id;
}
```

## 4. `==` vs `===`

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| `==` / `!=` | `===` / `!==` |

```ts
// ❌ — '== null' also matches undefined (old rule, not idiomatic in modern TS)
if (value == null) { /* ... */ }

// ✅ — explicit
if (value === null || value === undefined) { /* ... */ }
```

`eslint: eqeqeq` enforces it.

## 5. Overloads

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| General before specific | Specific first, general at the end |

```ts
// ❌ NEVER — the general eclipses the specific
function process(input: string | number): string;
function process(input: string): string;

// ✅ YES
function process(input: string): string;
function process(input: string | number): string;
function process(input: string | number): string { /* impl */ }
```

> *"Don't put more general overloads before more specific overloads."*

## 6. Optional parameters in callbacks

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| `(err, result?) => void` | `(err: Error \| null, result: string \| null) => void` |

In callbacks, the arity must be stable. The receiver always calls with the same number of args.

## 7. `enum`

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| `enum` (most cases) | `as const` object or union of literals |

```ts
// ❌ — enum compiles to a runtime object that does not tree-shake well
enum Status { Idle, Loading, Success, Error }

// ✅ — literal type + readonly object
const Status = {
  Idle: 'idle',
  Loading: 'loading',
  Success: 'success',
  Error: 'error',
} as const;
type Status = typeof Status[keyof typeof Status];
// 'idle' | 'loading' | 'success' | 'error'
```

**`enum` allowed only when:**
- Interoperability with external APIs that expect it (Java, C#, etc.).
- Large teams with an established enum convention.

## 8. `interface` vs `type`

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| `type` for a shape that extends | `interface extends ...` |
| `interface` for a union | `type A = 'x' \| 'y'` |

See SKILL.md §"Object types" for the full guide.

## 9. Decorators

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| Mixing legacy (`experimentalDecorators`) and TC39 decorators | Choose one and be consistent |

```jsonc
// Legacy (NestJS, TypeORM up to v0.3)
{ "experimentalDecorators": true, "emitDecoratorMetadata": true }

// TC39 (Stage 3, TS 5.0+)
// No flag needed — it is the modern default
```

## 10. Imports / Exports

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| `import { X } from 'y'` when `X` is only a type | `import type { X } from 'y'` or `import { type X }` |
| Mixing default and named exports inconsistently | Follow the project's convention |

```ts
// ❌ — forces Node/bundler to import the file even if you only use the type
import { User } from './types';

// ✅
import type { User } from './types';
```

`verbatimModuleSyntax: true` enforces it automatically.

## 11. Naming

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| `IUser` (Hungarian prefix) | `User` |
| `TUser` (template parameter with prefix) | `T` or `TUser` only if `T` collides |
| `user_type` (snake_case) | `User` (PascalCase) |
| `userInfo` for a type | `UserInfo` |

## 12. `void` as return type

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| Callback returns `any` | `() => void` |

```ts
// ❌
arr.forEach((item) => doSomething(item)); // doSomething can return something without warning

// ✅
arr.forEach((item: T): void => doSomething(item));
```

> *"Using `void` is safer because it prevents you from accidentally using the return value."*

## 13. Type aliases vs inline types

| ❌ Anti-pattern | ✅ Alternative |
|---|---|
| Repeating a shape inline in 3+ places | Extract to a type alias |

```ts
// ❌
function getUser(): { id: string; name: string } { /* ... */ }
function updateUser(): { id: string; name: string } { /* ... */ }
function listUsers(): { id: string; name: string }[] { /* ... */ }

// ✅
type UserSummary = { id: string; name: string };
function getUser(): UserSummary { /* ... */ }
function updateUser(): UserSummary { /* ... */ }
function listUsers(): UserSummary[] { /* ... */ }
```

## 14. `as const` misapplied

```ts
// ❌ — does not tree-shake well, does not give literal types
const config = { host: 'localhost', port: 3000 };

// ✅ — readonly + literal types
const config = { host: 'localhost', port: 3000 } as const;
// config.host: 'localhost' (literal, not string)
// config.port: 3000 (literal, not number)
```

## 15. Quick list of typescript-eslint rules that activate automatically

| Rule | What it enforces |
|---|---|
| `no-explicit-any` | No `any` |
| `no-unused-vars` | No unused vars/imports |
| `consistent-type-imports` | `import type` for types |
| `ban-types` | No `Object`/`Function`/`<any>` |
| `no-namespace` | No `namespace` |
| `no-non-null-assertion` | No `!` |
| `no-magic-numbers` | No literal numbers (configurable) |
| `eqeqeq` | Only `===`/`!==` |
| `prefer-nullish-coalescing` | `??` instead of `\|\|` when applicable |
| `prefer-optional-chain` | `?.` instead of `&&` chains |
| `no-floating-promises` | No un-awaited promises (requires type-aware) |
| `no-misused-promises` | No Promise where a value is expected (type-aware) |
| `await-thenable` | `await` only over Promise (type-aware) |
| `no-unnecessary-condition` | No redundant narrowing (type-aware) |
