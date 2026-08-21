# Async y Promise

> **Fuentes oficiales:** https://www.typescriptlang.org/docs/handbook/2/narrowing.html#the-unknown-type (useUnknownInCatchVariables) · https://typescript-eslint.io/rules/no-floating-promises/

## 1. Promise<T>

Una función `async` siempre retorna `Promise<T>`. Si declarás `async function foo(): T` (sin `Promise<>`), TS da error.

```ts
async function fetchUser(): Promise<User> { /* ... */ }
async function fetchUser(): User { /* ❌ Error */ }
```

## 2. Awaited<T>

`Awaited<T>` extrae el tipo resuelto de una `Promise` o `thenable`. Para `Promise<Promise<X>>`, desenvuelve recursivamente.

```ts
type P = Promise<string>;
type S = Awaited<P>; // string

type P2 = Promise<Promise<number>>;
type N = Awaited<P2>; // number
```

### Derivar el tipo de retorno de una función existente

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

Esta regla atrapa promesas creadas pero nunca awaited/then'd/catch'd:

```ts
// ❌ Floating promise
async function updateUser(id: string) {
  await api.patch(`/users/${id}`, { name: 'New' });
}

function handler() {
  updateUser('1'); // ❌ Promise ignored
}

// ✅ BIEN — explícito
function handler() {
  void updateUser('1'); // descarta el resultado a propósito
  // o
  updateUser('1').catch(err => console.error(err));
}
```

Activar en `eslint.config.js`:

```js
{
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
  },
}
```

## 4. `await-thenable`

`await` solo funciona sobre `Promise` o `thenable`. Esta regla lo enforce:

```ts
// ❌ await sobre algo que no es Promise
const value = 42;
const result = await value; // ❌ Error
```

## 5. `no-misused-promises`

Previene pasar `Promise` donde se espera valor (o viceversa):

```ts
// ❌ Pasar Promise donde se espera valor
const handleClick = (handler: () => void) => { /* ... */ };
button.addEventListener('click', async () => { /* ... */ });
// ❌ handler espera () => void, recibe () => Promise<void>
```

## 6. `try/catch` con `unknown`

Con `useUnknownInCatchVariables: true` (parte de `strict`), `catch (e)` da `e: unknown`. Narrow antes de usar:

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

> ⚠️ **No uses `any` para `e`** — eso desactiva el checker y es exactamente lo que `unknown` está para resolver.

## 7. `Promise.allSettled` vs `Promise.all`

| Función | Si una falla | Retorna |
|---|---|---|
| `Promise.all` | Rechaza con el primer error | `T[]` |
| `Promise.allSettled` | Continúa | `{ status: 'fulfilled', value: T } \| { status: 'rejected', reason: unknown }[]` |

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

En módulos ESM (`"type": "module"` o `module: "NodeNext"`/`"ESNext"`), podés usar `await` a nivel de módulo:

```ts
// config.ts
const config = await loadConfig(); // OK en top-level ESM
export { config };
```

En CommonJS no funciona. Para Node < 14 tampoco.

## 9. Errores comunes

| Error | Causa | Solución |
|---|---|---|
| `await is only valid in async functions` | Falta `async` en la función | Agrega `async` antes de la declaración |
| `Property 'X' does not exist on type 'Promise<Y>'` | Olvidaste `await` | Agrega `await` o usa `.then()` |
| `await Promise.resolve()` funciona pero `await 42` falla | `await` solo sobre thenable | Normal, agregá `async` o devolvé `Promise.resolve(value)` |
| `no-floating-promises` se queja en event handler | Pasaste `async` directamente | Usa `void` o `.catch()` explícito |
| `catch (e)` da `unknown` | `useUnknownInCatchVariables` activo | Narrow con `instanceof Error` |
