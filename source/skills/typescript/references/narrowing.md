# Type Narrowing and Discriminated Unions

> **Official sources:** https://www.typescriptlang.org/docs/handbook/2/narrowing.html · https://www.typescriptlang.org/docs/handbook/2/types-from-types.html · https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

## 1. Built-in narrowing

### `typeof` for primitives

```ts
function process(value: string | number) {
  if (typeof value === 'string') {
    return value.toUpperCase(); // value: string
  }
  return value.toFixed(2);     // value: number
}
```

`typeof` covers: `string`, `number`, `bigint`, `boolean`, `symbol`, `object`, `function`, `undefined`.

### `instanceof` for classes

```ts
function handleError(e: unknown) {
  if (e instanceof Error) {
    console.log(e.message); // e: Error
  }
}
```

### `in` for properties

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

Caution: `""`, `0`, `NaN`, `false`, `null`, `undefined` are falsy. If you need to distinguish, use `== null` or `=== undefined`.

## 2. Type predicates (`x is T`)

When the guard is not built-in, write a function with a type predicate:

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

### Type predicates for narrowing `unknown`

```ts
const isUser = (x: unknown): x is User =>
  typeof x === 'object' && x !== null && 'id' in x && typeof (x as User).id === 'string';

function handle(input: unknown) {
  if (isUser(input)) {
    console.log(input.id); // OK
  }
}
```

For more complex validation (JSON from a backend), consider a runtime validation library only if the project uses one (Zod, Valibot, ArkType, etc.). **This skill does not recommend them by default** — see convention 3 of SKILL.md.

## 3. Discriminated unions

Key pattern for states or results with variants. Each member of the union has a common literal field that TS uses to narrow.

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

### The discriminant must be **literal**

```ts
// ✅ GOOD
type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'success'; data: string } | { kind: 'error'; err: Error };

// ❌ BAD — string is not literal, TS cannot narrow
type Status = { kind: string };
```

### Discriminant with `tag` or `type` also works

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

## 4. Exhaustiveness with `never`

When you cover a union with `switch`, add a `default: assertNever(s)` that **forces** a TS error if you add a new case to the union.

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

// If you add 'cancelled' to Status, the switch fails with:
//   Argument of type '"cancelled"' is not assignable to parameter of type 'never'
```

### Variant with `satisfies`

```ts
const labels: Record<Status, string> = {
  pending: 'Loading...',
  success: 'Done',
  error: 'Failed',
};
// If you add 'cancelled' to Status, this object fails with Property '"cancelled"' is missing
```

`Record<Status, string>` is another way to enforce exhaustiveness, useful when the mapping is 1:1 with strings.

## 5. Assertion functions

A function that throws if the assertion fails. The type is narrowed in the rest of the scope.

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

Alternative form: `asserts condition`.

## 6. Common cases

### Array narrowing

```ts
function firstElement<T>(arr: T[]): T | undefined {
  return arr[0]; // with noUncheckedIndexedAccess: T | undefined
}

const items = ['a', 'b', 'c'];
const head = firstElement(items);
if (head !== undefined) {
  console.log(head.toUpperCase());
}
```

### Object narrowing with `Object.keys`

`Object.keys(obj)` returns `string[]`, not the specific keys of `obj`. To narrow:

```ts
function getValues<T extends object>(obj: T): Array<T[keyof T]> {
  return Object.keys(obj).map(k => obj[k as keyof T]);
}
```

Or use a custom type guard if you need to guarantee the key.

### Error narrowing

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

## 7. Common traps

| Trap | Solution |
|---|---|
| Narrowing is lost after an await | Re-narrow after the await or use `asserts` |
| `if (value !== null)` does not narrow `value` | Make sure to use `===`/`!==`, not `==`/`!=` |
| Optional discriminant (`kind?: string`) | Make it required: `kind: 'loading'` |
| Narrowing a union with `kind: string` (not literal) | Use literal: `kind: 'loading' as const` |
| Narrowing in an async callback | Capture the narrowed variable **before** the await |
