# Utility Types — Referencia

> **Fuente oficial:** https://www.typescriptlang.org/docs/handbook/utility-types.html

Todos los utility types están en **global scope** — no importes nada.

## 1. Modificadores

### `Partial<T>` — todas las props opcionales

```ts
interface User { id: string; name: string; email: string }
type UserUpdate = Partial<User>;
// { id?: string; name?: string; email?: string }
```

Uso: payloads de `PATCH`/`PUT` parciales, defaults en factories.

### `Required<T>` — todas las props obligatorias

```ts
interface Config { debug?: boolean; verbose?: boolean }
type StrictConfig = Required<Config>;
// { debug: boolean; verbose: boolean }
```

### `Readonly<T>` — todas las props de solo lectura

```ts
type FrozenUser = Readonly<User>;
// { readonly id: string; readonly name: string; ... }

const u: FrozenUser = { id: '1', name: 'Ana' };
u.name = 'Bea'; // ❌ Error
```

Uso: state inmutable, props de React, configs.

## 2. Selección

### `Pick<T, K>` — subset de props

```ts
interface User { id: string; email: string; password: string; createdAt: Date }
type UserSummary = Pick<User, 'id' | 'email'>;
// { id: string; email: string }
```

Uso: view models, DTOs.

### `Omit<T, K>` — todo excepto K

```ts
type UserResponse = Omit<User, 'password'>;
// { id: string; email: string; createdAt: Date }
type CreateUser = Omit<User, 'id' | 'createdAt'>;
// { email: string; password: string }
```

### `Record<K, V>` — diccionario tipado

```ts
type Status = 'idle' | 'loading' | 'success' | 'error';
type StatusMessages = Record<Status, string>;
// { idle: string; loading: string; success: string; error: string }

// Equivalente a:
type StatusMessages = {
  idle: string;
  loading: string;
  success: string;
  error: string;
};
```

`Record<K, V>` con union `K` **obliga** a tener todas las keys. Útil para enums-like.

## 3. Uniones

### `Exclude<T, U>` — quitar miembros

```ts
type Status = 'idle' | 'loading' | 'success' | 'error';
type ActiveStatus = Exclude<Status, 'idle'>;
// 'loading' | 'success' | 'error'

// Quitar null/undefined:
type NonNullable<T> = T extends null | undefined ? never : T;
```

### `Extract<T, U>` — intersección de uniones

```ts
type A = 'a' | 'b' | 'c';
type B = 'b' | 'c' | 'd';
type Common = Extract<A, B>;
// 'b' | 'c'
```

### `NonNullable<T>` — quitar `null`/`undefined`

```ts
type MaybeString = string | null | undefined;
type DefiniteString = NonNullable<MaybeString>;
// string
```

## 4. Funciones

### `ReturnType<T>` — tipo de retorno de una función

```ts
function fetchUser() { return Promise.resolve({ id: '1', name: 'Ana' }); }
type FetchedUser = Awaited<ReturnType<typeof fetchUser>>;
// { id: string; name: string }
```

### `Parameters<T>` — tuple de params

```ts
function createUser(email: string, age: number, admin: boolean) { /* ... */ }
type CreateUserParams = Parameters<typeof createUser>;
// [email: string, age: number, admin: boolean]

type FirstParam = CreateUserParams[0];
// string
```

### `Awaited<T>` — desenvolver Promise/thenable

```ts
type P = Promise<Promise<string>>;
type S = Awaited<P>;
// string

// Promise.all:
const promises = [Promise.resolve(1), Promise.resolve('a')];
type Results = Awaited<typeof promises[number]>;
// number | string
```

### `NoInfer<T>` — bloquear inferencia en un parámetro (TS 5.4+)

```ts
// ❌ Sin NoInfer: TS infiere T desde el array, no desde el literal
function createLogger<T extends string>(name: T, levels: T[]) { /* ... */ }
const logger = createLogger('info', ['info', 'warn', 'error']);
// T se infiere como 'info' | 'warn' | 'error' (no 'info')

// ✅ Con NoInfer: T se infiere solo desde `name`
function createLogger<T extends string>(name: NoInfer<T>, levels: T[]) { /* ... */ }
const logger = createLogger('info', ['info', 'warn', 'error']);
// T es 'info', y 'warn'/'error' causarían error (que es lo que queremos)
```

Uso típico: funciones donde un parámetro es la fuente de verdad y otros deben ser consistentes con él.

## 5. Casos compuestos

### DTOs de update

```ts
interface User { id: string; email: string; password: string; createdAt: Date; name: string }

// Update parcial:
type UserUpdate = Partial<Pick<User, 'email' | 'name'>>;

// Update con campos sensibles explícitos (no se puede cambiar password sin más):
type AdminUserUpdate = Partial<Pick<User, 'email' | 'name' | 'password'>>;
```

### View models

```ts
type UserCard = Pick<User, 'id' | 'name'> & { isAdmin: boolean };
type UserDetail = User & { lastLogin: Date; sessions: Session[] };
```

### Funciones de React

```ts
type Event<T extends keyof JSX.IntrinsicElements> = React.ChangeEvent<JSX.IntrinsicElements[T]>;
```

### Reducción de tipos derivados

```ts
const config = {
  host: 'localhost',
  port: 3000,
  secure: true,
} as const;

type Config = typeof config;
type Host = Config['host'];        // 'localhost' (literal)
type Port = Config['port'];        // 3000 (literal)
```

## 6. Custom utility types (cuándo vale la pena)

Solo escribí un utility type custom cuando:
- Lo vas a usar en **2+ lugares** (YAGNI en otro caso).
- **No existe** en el stdlib una combinación que lo resuelva.
- El "qué" del nombre no es suficiente — necesitás documentar el "por qué".

```ts
// ✅ Justificado: el nombre no comunica el "por qué"
type Branded<T, B extends string> = T & { readonly __brand: B };
type UserId = Branded<string, 'UserId'>;
type OrderId = Branded<string, 'OrderId'>;

// Evitas pasar un UserId donde se espera OrderId
const getOrder = (id: OrderId) => { /* ... */ };
const userId = 'u_123' as UserId;
getOrder(userId); // ❌ Error: UserId no es asignable a OrderId
```

## 7. Recursos

- [Utility Types handbook](https://www.typescriptlang.org/docs/handbook/utility-types.html) — referencia completa.
- [Type Manipulation](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html) — mapped types, conditional types, infer.
- [Cheat sheets de React TypeScript](https://react-typescript-cheatsheet.netlify.app/) — patrones específicos de React (no parte de esta skill pero complementario).
