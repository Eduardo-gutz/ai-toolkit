# Async and Promise

> **Official sources:** https://www.typescriptlang.org/docs/handbook/2/narrowing.html#the-unknown-type (useUnknownInCatchVariables) · https://typescript-eslint.io/rules/no-floating-promises/

## 1. Promise<T>

An `async` function always returns `Promise<T>`. If you declare `async function foo(): T` (without `Promise<>`), TS errors.

```ts
async function fetchUser(): Promise<User> { /* ... */ }
async function fetchUser(): User { /* ❌ Error */ }
```

## 2. Awaited<T>

`Awaited<T>` extracts the resolved type from a `Promise` or thenable. For `Promise<Promise<X>>`, it unwraps recursively.

```ts
type P = Promise<string>;
type S = Awaited<P>; // string

type P2 = Promise<Promise<number>>;
type N = Awaited<P2>; // number
```

### Deriving the return type of an existing function

```ts
async function fetchUser() { return { id: '1', name: 'Ana' }; }
type FetchedUser = Awaited<ReturnType<typeof fetchUser>>;
// { id: string; name: string }
```

### Promise.all

```ts
const [user, orders] = await Promise.all([fetchUser(), fetchOrders()]);
type User = Awaited<ReturnType<typeof fetchUser>>;
type Orders = Awaited<ReturnType<typeof fetchOrders>>;
```

## 3. `no-floating-promises` (typescript-eslint)

This rule catches created but never awaited/then'd/catch'd promises:

```ts
// ❌ Floating promise
async function updateUser(id: string) {
  await api.patch(`/users/${id}`, { name: 'New' });
}

function handler() {
  updateUser('1'); // ❌ Promise ignored
}

// ✅ GOOD — explicit
function handler() {
  void updateUser('1'); // discard the result on purpose
  // or
  updateUser('1').catch(err => console.error(err));
}
```

Enable in `eslint.config.js`:

```js
{
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
  },
}
```

## 4. `await-thenable`

`await` only works over `Promise` or thenable. This rule enforces it:

```ts
// ❌ await over something that is not Promise
const value = 42;
const result = await value; // ❌ Error
```

## 5. `no-misused-promises`

Prevents passing `Promise` where a value is expected (or vice versa):

```ts
// ❌ Passing Promise where a value is expected
const handleClick = (handler: () => void) => { /* ... */ };
button.addEventListener('click', async () => { /* ... */ });
// ❌ handler expects () => void, receives () => Promise<void>
```

## 6. `try/catch` with `unknown`

With `useUnknownInCatchVariables: true` (part of `strict`), `catch (e)` gives `e: unknown`. Narrow before use:

```ts
try {
  await api.post('/endpoint', data);
} catch (e: unknown) {
  if (e instanceof Error) {
    console.error(e.message);
    if (e.cause instanceof Error) {
      console.error('Caused by:', e.cause.message);
    }
  } else if (typeof e === 'string') {
    console.error(e);
  } else {
    console.error('Unknown error');
  }
}
```

> ⚠️ **Do not use `any` for `e`** — that disables the checker and is exactly what `unknown` is for.

## 7. `Promise.allSettled` vs `Promise.all`

| Function | If one fails | Returns |
|---|---|---|
| `Promise.all` | Rejects with the first error | `T[]` |
| `Promise.allSettled` | Continues | `{ status: 'fulfilled', value: T } \| { status: 'rejected', reason: unknown }[]` |

```ts
const results = await Promise.allSettled([
  fetchUser(),
  fetchOrders(),
]);

const succeeded = results
  .filter((r): r is PromiseFulfilledResult<User> => r.status === 'fulfilled')
  .map(r => r.value);

const failed = results
  .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  .map(r => r.reason); // unknown
```

## 8. Top-level await (ESM)

In ESM modules (`"type": "module"` or `module: "NodeNext"`/`"ESNext"`), you can use `await` at the module level:

```ts
// config.ts
const config = await loadConfig(); // OK at top-level ESM
export { config };
```

In CommonJS it does not work. Nor for Node < 14.

## 9. Common errors

| Error | Cause | Solution |
|---|---|---|
| `await is only valid in async functions` | Missing `async` on the function | Add `async` before the declaration |
| `Property 'X' does not exist on type 'Promise<Y>'` | You forgot `await` | Add `await` or use `.then()` |
| `await Promise.resolve()` works but `await 42` fails | `await` only over thenable | Normal, add `async` or return `Promise.resolve(value)` |
| `no-floating-promises` complains on event handler | You passed `async` directly | Use `void` or explicit `.catch()` |
| `catch (e)` gives `unknown` | `useUnknownInCatchVariables` active | Narrow with `instanceof Error` |
