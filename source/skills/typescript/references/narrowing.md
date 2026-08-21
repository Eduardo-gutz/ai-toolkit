# Type Narrowing y Discriminated Unions

> **Fuentes oficiales:** https://www.typescriptlang.org/docs/handbook/2/narrowing.html · https://www.typescriptlang.org/docs/handbook/2/types-from-types.html · https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

## 1. Narrowing built-in

### `typeof` para primitivos

```ts
function process(value: string | number) {
  if (typeof value === 'string') {
    return value.toUpperCase(); // value: string
  }
  return value.toFixed(2);     // value: number
}
```

`typeof` cubre: `string`, `number`, `bigint`, `boolean`, `symbol`, `object`, `function`, `undefined`.

### `instanceof` para clases

```ts
function handleError(e: unknown) {
  if (e instanceof Error) {
    console.log(e.message); // e: Error
  }
}
```

### `in` para propiedades

```ts
interface Bird { fly(): void }
interface Fish { swim(): void }
type Animal = Bird | Fish;

function move(a: Animal) {
  if ('fly' in a) {
    a.fly();   // a: Bird
  } else {
    a.swim();  // a: Fish
  }
}
```

### Truthiness checks

```ts
function print(value: string | null) {
  if (value) {
    console.log(value.toUpperCase()); // value: string (no null)
  }
}
```

Cuidado: `""`, `0`, `NaN`, `false`, `null`, `undefined` son falsy. Si necesitas distinguir, usa `== null` o `=== undefined`.

## 2. Type predicates (`x is T`)

Cuando el guard no es built-in, escribí una función con type predicate:

```ts
interface Cat { kind: 'cat'; meow(): void }
interface Dog { kind: 'dog'; bark(): void }
type Animal = Cat | Dog;

const isCat = (a: Animal): a is Cat => a.kind === 'cat';

const animals: Animal[] = [...];
const cats = animals.filter(isCat);
// cats: Cat[]
// cats[0].meow() // OK
// cats[0].bark() // Error
```

### Type predicates para narrowing de `unknown`

```ts
const isUser = (x: unknown): x is User =>
  typeof x === 'object' && x !== null && 'id' in x && typeof (x as User).id === 'string';

function handle(input: unknown) {
  if (isUser(input)) {
    console.log(input.id); // OK
  }
}
```

Para validación más compleja (JSON de un backend), considera una librería de validación runtime solo si el proyecto la usa (Zod, Valibot, ArkType, etc.). **Esta skill no las recomienda por defecto** — ver convención 3 del SKILL.md.

## 3. Discriminated unions

Patrón clave para estados o resultados con variantes. Cada miembro de la union tiene un campo literal común que TS usa para narrowar.

```ts
type Result<T, E> =
  | { kind: 'ok'; value: T }
  | { kind: 'err'; error: E };

const handle = (r: Result<string, Error>): string => {
  if (r.kind === 'ok') {
    return r.value.toUpperCase(); // r.value: string
  }
  return r.error.message;          // r.error: Error
};
```

### El discriminante debe ser **literal**

```ts
// ✅ BIEN
type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'success'; data: string } | { kind: 'error'; err: Error };

// ❌ MAL — string no es literal, TS no puede narrowar
type Status = { kind: string };
```

### Discriminante con `tag` o `type` también funciona

```ts
type Event =
  | { type: 'click'; x: number; y: number }
  | { type: 'keypress'; key: string }
  | { type: 'focus' };

const handle = (e: Event): void => {
  switch (e.type) {
    case 'click':   console.log(e.x, e.y); return;
    case 'keypress': console.log(e.key); return;
    case 'focus':   return;
  }
};
```

## 4. Exhaustiveness con `never`

Cuando cubrís una union con `switch`, agregá un `default: assertNever(s)` que **fuerza** un error de TS si añadís un caso nuevo a la union.

```ts
type Status = 'pending' | 'success' | 'error';

const assertNever = (x: never): never => {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
};

const label = (s: Status): string => {
  switch (s) {
    case 'pending': return 'Loading...';
    case 'success': return 'Done';
    case 'error':   return 'Failed';
    default:        return assertNever(s);
  }
};

// Si añades 'cancelled' a Status, el switch falla con:
//   Argument of type '"cancelled"' is not assignable to parameter of type 'never'
```

### Variante con `satisfies`

```ts
const labels: Record<Status, string> = {
  pending: 'Loading...',
  success: 'Done',
  error: 'Failed',
};
// Si añades 'cancelled' a Status, este objeto falla con Property '"cancelled"' is missing
```

`Record<Status, string>` es otra forma de enforce exhaustividad, útil cuando el mapeo es 1:1 con strings.

## 5. Assertion functions

Una función que lanza si la aserción falla. El tipo se narrowa en el resto del scope.

```ts
function assertDefined<T>(value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error('Value is null or undefined');
  }
}

function process(user: User | null) {
  assertDefined(user);
  // user: User (narrowed)
  console.log(user.id);
}
```

Forma alternativa: `asserts condition`.

## 6. Casos comunes

### Narrowing de arrays

```ts
function firstElement<T>(arr: T[]): T | undefined {
  return arr[0]; // con noUncheckedIndexedAccess: T | undefined
}

const items = ['a', 'b', 'c'];
const head = firstElement(items);
if (head !== undefined) {
  console.log(head.toUpperCase());
}
```

### Narrowing de objetos con `Object.keys`

`Object.keys(obj)` retorna `string[]`, no las keys específicas de `obj`. Para narrowar:

```ts
function getValues<T extends object>(obj: T): Array<T[keyof T]> {
  return Object.keys(obj).map(k => obj[k as keyof T]);
}
```

O usa un type guard custom si necesitás garantizar la key.

### Narrowing de errores

```ts
try {
  // ...
} catch (e: unknown) { // useUnknownInCatchVariables
  if (e instanceof Error) {
    console.log(e.message);
  } else if (typeof e === 'string') {
    console.log(e);
  } else {
    console.log('Unknown error');
  }
}
```

## 7. Trampas comunes

| Trampa | Solución |
|---|---|
| Narrowing se pierde después de un await | Re-narrow después del await o usa `asserts` |
| `if (value !== null)` no narrowa `value` | Asegurate de usar `===`/`!==`, no `==`/`!=` |
| Discriminante opcional (`kind?: string`) | Hazlo obligatorio: `kind: 'loading'` |
| Narrowing de union con `kind: string` (no literal) | Usa literal: `kind: 'loading' as const` |
| Narrowing en callback async | Captura la variable narrowada **antes** del await |
