---
name: typescript
description: TypeScript language best practices (handbook, Do's and Don'ts, utility types, strict tsconfig, typescript-eslint). Read when the user explicitly asks about TypeScript patterns, types, or when the project requires type-level decisions. Do NOT auto-trigger from generic mentions of "type", "interface", or "refactor" — only load when the user names TypeScript directly or asks for type-level guidance in a TS project. Does NOT cover framework-specific decisions (React, NestJS, FastAPI, etc.) — those are separate skills.
disable-model-invocation: true
---

# TypeScript

Skill stack-específica del **lenguaje TypeScript**. Complementaria a `frontend`, `backend`, `react-native-expo` y las skills de framework.

**Fuentes oficiales** (no invención): TypeScript Handbook, Do's and Don'ts, Utility Types, Advanced Types, TSConfig Reference, typescript-eslint Shared Configs.

> **Cómo se activa:** Solo cuando el usuario la pide explícitamente o hace una pregunta type-level en un proyecto TS. Esta skill **no se auto-dispara** desde menciones genéricas de "tipar", "interface" o "refactor".

---

## Convenciones que esta skill impone (y dónde cede)

1. **La arquitectura del proyecto gana sobre los defaults de esta skill.** Antes de proponer `tsconfig`, naming, estructura de carpetas o patrón de tipos, leer `AGENTS.md`, `code-style.md`, `architecture.md` o `.context/*` del proyecto. Si el proyecto define convenciones (path aliases, naming de types, dónde viven los types compartidos, reglas de eslint custom, etc.), esas mandan. Esta skill solo aporta cuando el proyecto no define una convención explícita.

2. **Cualquier código TS de ejemplo sigue el estilo del contexto donde se va a usar.**
   - Si el ejemplo es **UI / React**, este código es **complementario** a la skill de UI/React del proyecto: aplica convenciones de arrow functions, `FC<Props>`, helpers no-UI como `function`, etc.
   - Si el ejemplo es **backend / Node / Deno / Bun**, sigue las convenciones del proyecto (puede ser CommonJS, ESM, arrow o `function` — no asumas).
   - Si el ejemplo es **lógica pura / util / type-level**, da igual la sintaxis siempre que compile. Usa la forma más legible.

3. **`strict: true` por defecto en proyectos nuevos.** Si el proyecto no define lo contrario en `AGENTS.md`, esta skill asume `strict: true` y propone los flags adicionales de la §1 abajo. Si el proyecto YA está en modo no-strict, **no** fuerces un upgrade sin hablarlo con el usuario.

4. **`any` casi siempre está mal.** Solo permitido en migración de JS→TS o para tipar una API externa sin tipos disponibles. En TS maduro, `unknown` + narrowing. La regla del proyecto (`@typescript-eslint/no-explicit-any: error`) gana.

5. **Recomendación oficial > preferencia personal.** TypeScript Handbook y Do's and Don'ts son la fuente. Si una práctica contradice "lo que se hacía antes", gana la doc actual.

6. **Naming:** `PascalCase` para types/interfaces/enums. Type parameters: `T` para uno solo, `TKey`/`TValue`/`TItem` para varios. No `IUser`/`TUser` (prefijo Hungarian no es idiomático en TS moderno).

7. **`interface` vs `type`:** `interface` para shapes que se extienden o implementan; `type` para unions, intersections, tuples, mapped types, funciones. `@typescript-eslint/consistent-type-definitions` puede forzar uno u otro.

---

## Tabla de contenidos

| Archivo | Cubre |
|---|---|
| [`references/tsconfig.md`](references/tsconfig.md) | `tsconfig.json` por dominio (Node, browser, bundler, library), flags, module resolution, target |
| [`references/linting.md`](references/linting.md) | `typescript-eslint` v8+ (base vs type-aware), Prettier, flat config |
| [`references/utility-types.md`](references/utility-types.md) | `Partial`/`Required`/`Readonly`/`Pick`/`Omit`/`Record`/`Exclude`/`Extract`/`NonNullable`/`ReturnType`/`Parameters`/`Awaited`/`NoInfer` con ejemplos |
| [`references/narrowing.md`](references/narrowing.md) | `typeof`/`instanceof`/`in`, type predicates, discriminated unions, exhaustiveness |
| [`references/async.md`](references/async.md) | `Promise<T>`, `Awaited<T>`, `no-floating-promises`, `try/catch` con `unknown` |
| [`references/anti-patterns.md`](references/anti-patterns.md) | Lista completa de Do's and Don'ts con anti-patrón → alternativa |

---

## Cheatsheet — decisiones rápidas

| Necesidad | Solución canónica |
|---|---|
| Tipo de retorno de una función existente | `ReturnType<typeof fn>` |
| Params de una función existente | `Parameters<typeof fn>` |
| Promise desenvuelta | `Awaited<T>` |
| Update parcial de un objeto | `Partial<T>` o `Partial<Pick<T, K>>` |
| Quitar campos sensibles antes de exponer | `Omit<User, 'password'>` |
| Diccionario tipado | `Record<Union, V>` |
| Quitar `null`/`undefined` | `NonNullable<T>` |
| Forzar presencia de campos opcionales | `Required<T>` |
| Estado con variantes | Discriminated union + `assertNever(x: never)` (ver [`references/narrowing.md`](references/narrowing.md)) |
| Valor que puede venir de JSON sin tipo | `unknown` + narrowing con type predicate |
| Reducir un `Promise.all<T1, T2, T3>` | `Awaited<typeof promise>` por cada elemento |
| Configurar tsconfig para Vite/Next/etc. | `target: ES2022`, `module: ESNext`, `moduleResolution: bundler` (ver [`references/tsconfig.md`](references/tsconfig.md)) |
| Configurar tsconfig para Node | `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext` |

---

## Primitivos, any/unknown/never, null/undefined

**Primitivos en minúscula.** NUNCA los wrappers: `string` ✅, `String` ❌. Regla oficial: *"Don't ever use the types `Number`, `String`, `Boolean`, `Symbol`, or `Object`."*

**`any` vs `unknown` vs `never`:**
- `any` desactiva el checker. Solo en migración; **nunca** en TS maduro.
- `unknown` requiere narrowing antes de usar.
- `never` para funciones que lanzan, loops infinitos y exhaustiveness checks.

```ts
// ✅ BIEN — narrowing con unknown
function parse(input: unknown): string | number {
  if (typeof input === 'string') return input.toUpperCase();
  if (typeof input === 'number') return input.toFixed(2);
  throw new Error('Invalid input');
}

// ✅ BIEN — exhaustiveness con never
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

**`void` en callbacks cuyo retorno se ignora**: usa `() => void`, no `() => any`. Regla oficial: *"Using `void` is safer because it prevents you from accidentally using the return value."*

**`null`/`undefined` con `strictNullChecks`:** `string` no acepta `null`. Usa `User | null` (puede ser null) o `{ name?: string }` (puede no estar presente). Con `exactOptionalPropertyTypes: true`, `?:` y `| undefined` no son intercambiables. En `catch`, `e` es `unknown` — narrow con `instanceof Error`.

---

## Object types: `interface` vs `type`

```ts
interface User { id: string; name: string }
interface Admin extends User { permissions: string[] }

type Status = 'idle' | 'loading' | 'success' | 'error';
type Pair = [string, number];
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Ver tabla §Utility types abajo para más; casos detallados en [`references/utility-types.md`](references/utility-types.md).

---

## Funciones

**Tipos de retorno:** inferencia cuando es obvio; explícito en exports, APIs públicas, o inferencia no trivial. `explicit-module-boundary-types` fuerza tipos en exports; `explicit-function-return-type` los fuerza en todos lados (estricto, solo si la API es muy estable).

**Overloads — específico primero, general al final:**

```ts
// ❌ NUNCA — el general eclipsa al específico
function process(input: string | number): string;
function process(input: string): string;

// ✅ SÍ — específico primero
function process(input: string): string;
function process(input: string | number): string;
function process(input: string | number): string { /* impl */ }
```

> Regla oficial: *"Don't put more general overloads before more specific overloads."*

**Optional parameters:** solo cuando **realmente** son opcionales. En **callbacks**, **no** uses optional parameters (la aridad debe ser estable): `(err: Error | null, result: string | null) => void`, no `(err, result?) => void`.

**Genéricos:** nombra los type parameters (`TKey`, `TValue`) cuando haya más de uno. Limita con constraints (`<T extends Constraint>`) cuando la función lo requiera. No declares type parameters que no usas.

```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }
```

---

## Reusabilidad de código TS

Antes de escribir cualquier utility, type o helper:

1. **Busca en el proyecto** (`grep`/`glob`): `src/utils/`, `src/lib/`, `src/shared/`, `src/types/`, `modules/<feature>/types.ts` o `schemas.ts`.
2. **Busca en el stdlib de TS** los utility types que ya hacen la transformación. Si `Partial`/`Pick`/`Omit`/`Record`/`Exclude`/`Extract`/`ReturnType`/`Parameters`/`Awaited`/`NonNullable`/`Required`/`Readonly` lo resuelven, no escribas un tipo nuevo.
3. **Utility type custom** → documenta el "por qué" (no el "qué" — el nombre ya lo dice).
4. **Reusar en 2+ lugares** → extrae. **1 solo lugar** → no extraigas (YAGNI).
5. **Reuable existente al que le falta un caso** → extiéndelo con un type parameter antes de duplicar.

---

## Output contract

Cuando esta skill está activa, el código TypeScript que produce el agente debe:

1. Compilar sin errores con `tsc --noEmit` corriendo el `tsconfig.json` del proyecto. Sin warnings de tipo.
2. Pasar el linter (ESLint con typescript-eslint + Prettier) sin warnings ni errores.
3. No usar `any` salvo justificación explícita en comentario.
4. Usar `unknown` + narrowing cuando el tipo no es conocido de entrada.
5. Usar los utility types del stdlib para transformaciones comunes.
6. Usar discriminated unions para estados o resultados con variantes; campo discriminante literal.
7. Usar type predicates solo cuando el guard no es built-in.
8. No usar `// @ts-ignore`. Si es necesario, `// @ts-expect-error: <razón>`.
9. Exhaustiveness con `never` en switches sobre unions de literals.
10. Imports/exports type explícitos con `import type` y `export type`. `verbatimModuleSyntax: true` lo enforce.
11. Naming: types/interfaces en `PascalCase`. Type parameters con `T` para uno, `TKey`/`TValue` para varios.
12. Tests con tipos verificados: al menos un test verifica el tipo de retorno de una función pública (`expectTypeOf` de Vitest).

Si un paso no se cumple, decirlo en el handoff. No esconder `any` con un cast.

---

## Reglas operativas para el agente

1. **Lee `AGENTS.md` / `code-style.md` del proyecto antes de proponer tsconfig, naming o estructura.** Si el proyecto define convenciones, esas ganan.
2. **Cita la URL oficial** (typescriptlang.org/docs/handbook/...) al final de cada recomendación técnica específica.
3. **Si el usuario pregunta algo fuera del scope de TS** (React específico, framework backend, etc.), responde brevemente y sugiere la skill apropiada. No fuerces esta skill.
4. **No instales dependencias por tu cuenta.** Recomienda el comando y deja que el usuario lo corra.
5. **Si el usuario da una instrucción explícita que contradice la doc oficial**, sigue al usuario pero advierte el trade-off en 1-2 frases.
6. **Para "qué versión de X"**, prioriza siempre la última visible en `typescriptlang.org` o el repo del paquete en GitHub.
