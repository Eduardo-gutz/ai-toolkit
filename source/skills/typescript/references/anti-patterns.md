# Anti-patrones — Do's and Don'ts

> **Fuente oficial:** https://www.typescriptlang.org/docs/handbook/2/types-from-types.html · https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html · https://typescript-eslint.io/rules/

## 1. Tipos primitivos

| ❌ Anti-patrón | ✅ Alternativa | Por qué |
|---|---|---|
| `String`, `Number`, `Boolean`, `Symbol`, `Object` (mayúsculas) | `string`, `number`, `boolean`, `symbol`, `object` | *"Don't ever use the types `Number`, `String`, `Boolean`, `Symbol`, or `Object`."* — Handbook. Los mayúsculas son wrappers de objeto; los minúscula son primitivos. |
| `Function` (tipo genérico) | `(args: X) => Y` específica | `Function` no dice nada sobre args ni retorno. |

```ts
// ❌
function fn(cb: Function) { /* ... */ }

// ✅
function fn(cb: (err: Error | null, result: string) => void) { /* ... */ }
```

## 2. `any` vs `unknown`

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| `any` declarado explícitamente | `unknown` + narrowing (ver `references/narrowing.md`) |
| `as any` para "arreglar" un error de tipo | `as unknown as X` + narrow, o arreglar el tipo real |
| `any` en APIs externas sin tipos | `unknown` + un type guard o validación runtime |

```ts
// ❌ — any desactiva el checker para TODO el código que lo toca
function process(data: any) {
  return data.foo.bar.baz; // ¿Y si data es null? No hay forma de saber.
}

// ✅ — unknown fuerza a narrowar
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'foo' in data) {
    const foo = data.foo as { bar?: { baz?: string } };
    return foo.bar?.baz;
  }
}
```

**`any` permitido solo en:**
- Migración gradual de JS a TS (con `// TODO: type this` o equivalente).
- Tipar APIs externas que no tienen tipos (temporalmente, mientras se consigue el `.d.ts`).
- Tests con mocks (con `eslint-disable-next-line @typescript-eslint/no-explicit-any` justificado).

Activar `@typescript-eslint/no-explicit-any: error` en producción.

## 3. Type assertions

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| `// @ts-ignore` sin razón | `// @ts-expect-error: <razón>` o arreglar el tipo |
| `!` non-null assertion indiscriminado | Validar primero (`if (x !== null) { x.foo }`) |
| Type assertion innecesaria | Quitar el cast — si el tipo es el correcto, no hace falta |

```ts
// ❌ — ts-ignore esconde un problema real
// @ts-ignore
const x = something.nope.unknown;

// ✅ — ts-expect-error documenta el "por qué" y falla si el problema se arregla
// @ts-expect-error: third-party types are wrong in this version, fixed in 2.4.0
const x = something.nope.unknown;

// ❌ — non-null assertion puede reventar
function process(user: User | null) {
  return user!.id; // 💥 si user es null
}

// ✅ — narrow primero
function process(user: User | null) {
  if (!user) throw new Error('user is null');
  return user.id;
}
```

## 4. `==` vs `===`

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| `==` / `!=` | `===` / `!==` |

```ts
// ❌ — '== null' también matchea undefined (regla vieja, no idiomática en TS moderno)
if (value == null) { /* ... */ }

// ✅ — explícito
if (value === null || value === undefined) { /* ... */ }
```

`eslint: eqeqeq` lo enforce.

## 5. Overloads

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| General antes que específico | Específico primero, general al final |

```ts
// ❌ NUNCA — el general eclipsa al específico
function process(input: string | number): string;
function process(input: string): string;

// ✅ SÍ
function process(input: string): string;
function process(input: string | number): string;
function process(input: string | number): string { /* impl */ }
```

> *"Don't put more general overloads before more specific overloads."*

## 6. Optional parameters en callbacks

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| `(err, result?) => void` | `(err: Error \| null, result: string \| null) => void` |

En callbacks, la aridad debe ser estable. El receptor siempre llama con el mismo número de args.

## 7. `enum`

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| `enum` (mayoría de casos) | `as const` object o union de literals |

```ts
// ❌ — enum compila a un objeto runtime que no tree-shakea bien
enum Status { Idle, Loading, Success, Error }

// ✅ — type literal + objeto readonly
const Status = {
  Idle: 'idle',
  Loading: 'loading',
  Success: 'success',
  Error: 'error',
} as const;
type Status = typeof Status[keyof typeof Status];
// 'idle' | 'loading' | 'success' | 'error'
```

**`enum` permitido solo cuando:**
- Interoperabilidad con APIs externas que lo esperan (Java, C#, etc.).
- Equipos grandes con convención de enum ya establecida.

## 8. `interface` vs `type`

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| `type` para shape que se extiende | `interface extends ...` |
| `interface` para union | `type A = 'x' \| 'y'` |

Ver SKILL.md §"Object types" para la guía completa.

## 9. Decorators

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| Mezclar legacy (`experimentalDecorators`) y TC39 decorators | Elegir uno y ser consistente |

```jsonc
// Legacy (NestJS, TypeORM hasta v0.3)
{ "experimentalDecorators": true, "emitDecoratorMetadata": true }

// TC39 (Stage 3, TS 5.0+)
// No se necesita flag — es el default moderno
```

## 10. Imports / Exports

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| `import { X } from 'y'` cuando `X` es solo tipo | `import type { X } from 'y'` o `import { type X }` |
| Mezclar default y named exports inconsistentemente | Seguir la convención del proyecto |

```ts
// ❌ — fuerza a Node/bundler a importar el archivo aunque solo uses el tipo
import { User } from './types';

// ✅
import type { User } from './types';
```

`verbatimModuleSyntax: true` lo enforce automáticamente.

## 11. Naming

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| `IUser` (prefijo Hungarian) | `User` |
| `TUser` (template parameter con prefijo) | `T` o `TUser` solo si `T` colisiona |
| `user_type` (snake_case) | `User` (PascalCase) |
| `userInfo` para un type | `UserInfo` |

## 12. `void` como tipo de retorno

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| Callback retorna `any` | `() => void` |

```ts
// ❌
arr.forEach((item) => doSomething(item)); // doSomething puede retornar algo sin warning

// ✅
arr.forEach((item: T): void => doSomething(item));
```

> *"Using `void` is safer because it prevents you from accidentally using the return value."*

## 13. Type aliases vs tipos inline

| ❌ Anti-patrón | ✅ Alternativa |
|---|---|
| Repetir un shape inline en 3+ lugares | Extraer a un type alias |

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

## 14. `as const` mal aplicado

```ts
// ❌ — no tree-shakea bien, no da literal types
const config = { host: 'localhost', port: 3000 };

// ✅ — readonly + literal types
const config = { host: 'localhost', port: 3000 } as const;
// config.host: 'localhost' (literal, no string)
// config.port: 3000 (literal, no number)
```

## 15. Lista rápida de reglas typescript-eslint que activan automáticamente

| Regla | Qué enforce |
|---|---|
| `no-explicit-any` | No `any` |
| `no-unused-vars` | No vars/imports sin usar |
| `consistent-type-imports` | `import type` para types |
| `ban-types` | No `Object`/`Function`/`<any>` |
| `no-namespace` | No `namespace` |
| `no-non-null-assertion` | No `!` |
| `no-magic-numbers` | No números literales (configurable) |
| `eqeqeq` | Solo `===`/`!==` |
| `prefer-nullish-coalescing` | `??` en vez de `\|\|` cuando aplica |
| `prefer-optional-chain` | `?.` en vez de `&&` chains |
| `no-floating-promises` | No promises sin await (requiere type-aware) |
| `no-misused-promises` | No Promise donde se espera valor (type-aware) |
| `await-thenable` | `await` solo sobre Promise (type-aware) |
| `no-unnecessary-condition` | No narrowing redundante (type-aware) |
