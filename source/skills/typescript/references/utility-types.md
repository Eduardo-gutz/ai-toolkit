# Utility Types — Reference

> **Official source:** https://www.typescriptlang.org/docs/handbook/utility-types.html

All utility types are in **global scope** — do not import anything.

## 1. Modifiers

### `Partial<T>` — all props optional

```ts
interface User { id: string; name: string; email: string }
type UserUpdate = Partial<User>;
// { id?: string; name?: string; email?: string }
```

Use: partial `PATCH`/`PUT` payloads, defaults in factories.

### `Required<T>` — all props required

```ts
interface Config { debug?: boolean; verbose?: boolean }
type StrictConfig = Required<Config>;
// { debug: boolean; verbose: boolean }
```

### `Readonly<T>` — all props read-only

```ts
type FrozenUser = Readonly<User>;
// { readonly id: string; readonly name: string; ... }

const u: FrozenUser = { id: '1', name: 'Ana' };
u.name = 'Bea'; // ❌ Error
```

Use: immutable state, React props, configs.

## 2. Selection

### `Pick<T, K>` — subset of props

```ts
interface User { id: string; email: string; password: string; createdAt: Date }
type UserSummary = Pick<User, 'id' | 'email'>;
// { id: string; email: string }
```

Use: view models, DTOs.

### `Omit<T, K>` — everything except K

```ts
type UserResponse = Omit<User, 'password'>;
// { id: string; email: string; createdAt: Date }
type CreateUser = Omit<User, 'id' | 'createdAt'>;
// { email: string; password: string }
```

### `Record<K, V>` — typed dictionary

```ts
type Status = 'idle' | 'loading' | 'success' | 'error';
type StatusMessages = Record<Status, string>;
// { idle: string; loading: string; success: string; error: string }

// Equivalent to:
type StatusMessages = {
  idle: string;
  loading: string;
  success: string;
  error: string;
};
```

`Record<K, V>` with a `K` union **forces** having all keys. Useful for enum-like patterns.

## 3. Unions

### `Exclude<T, U>` — remove members

```ts
type Status = 'idle' | 'loading' | 'success' | 'error';
type ActiveStatus = Exclude<Status, 'idle'>;
// 'loading' | 'success' | 'error'

// Remove null/undefined:
type NonNullable<T> = T extends null | undefined ? never : T;
```

### `Extract<T, U>` — union intersection

```ts
type A = 'a' | 'b' | 'c';
type B = 'b' | 'c' | 'd';
type Common = Extract<A, B>;
// 'b' | 'c'
```

### `NonNullable<T>` — remove `null`/`undefined`

```ts
type MaybeString = string | null | undefined;
type DefiniteString = NonNullable<MaybeString>;
// string
```

## 4. Functions

### `ReturnType<T>` — function return type

```ts
function fetchUser() { return Promise.resolve({ id: '1', name: 'Ana' }); }
type FetchedUser = Awaited<ReturnType<typeof fetchUser>>;
// { id: string; name: string }
```

### `Parameters<T>` — params tuple

```ts
function createUser(email: string, age: number, admin: boolean) { /* ... */ }
type CreateUserParams = Parameters<typeof createUser>;
// [email: string, age: number, admin: boolean]

type FirstParam = CreateUserParams[0];
// string
```

### `Awaited<T>` — unwrap Promise/thenable

```ts
type P = Promise<Promise<string>>;
type S = Awaited<P>;
// string

// Promise.all:
const promises = [Promise.resolve(1), Promise.resolve('a')];
type Results = Awaited<typeof promises[number]>;
// number | string
```

### `NoInfer<T>` — block inference on a parameter (TS 5.4+)

```ts
// ❌ Without NoInfer: TS infers T from the array, not from the literal
function createLogger<T extends string>(name: T, levels: T[]) { /* ... */ }
const logger = createLogger('info', ['info', 'warn', 'error']);
// T is inferred as 'info' | 'warn' | 'error' (not 'info')

// ✅ With NoInfer: T is inferred only from `name`
function createLogger<T extends string>(name: NoInfer<T>, levels: T[]) { /* ... */ }
const logger = createLogger('info', ['info', 'warn', 'error']);
// T is 'info', and 'warn'/'error' would cause an error (which is what we want)
```

Typical use: functions where one parameter is the source of truth and others must be consistent with it.

## 5. Compound cases

### Update DTOs

```ts
interface User { id: string; email: string; password: string; createdAt: Date; name: string }

// Partial update:
type UserUpdate = Partial<Pick<User, 'email' | 'name'>>;

// Update with explicit sensitive fields (password cannot be changed without more):
type AdminUserUpdate = Partial<Pick<User, 'email' | 'name' | 'password'>>;
```

### View models

```ts
type UserCard = Pick<User, 'id' | 'name'> & { isAdmin: boolean };
type UserDetail = User & { lastLogin: Date; sessions: Session[] };
```

### React functions

```ts
type Event<T extends keyof JSX.IntrinsicElements> = React.ChangeEvent<JSX.IntrinsicElements[T]>;
```

### Derived type reduction

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

## 6. Custom utility types (when are they worth it)

Only write a custom utility type when:
- You will use it in **2+ places** (YAGNI otherwise).
- There is **no** stdlib combination that solves it.
- The name's "what" is not enough — you need to document the "why".

```ts
// ✅ Justified: the name does not communicate the "why"
type Branded<T, B extends string> = T & { readonly __brand: B };
type UserId = Branded<string, 'UserId'>;
type OrderId = Branded<string, 'OrderId'>;

// Avoids passing a UserId where OrderId is expected
const getOrder = (id: OrderId) => { /* ... */ };
const userId = 'u_123' as UserId;
getOrder(userId); // ❌ Error: UserId is not assignable to OrderId
```

## 7. Resources

- [Utility Types handbook](https://www.typescriptlang.org/docs/handbook/utility-types.html) — complete reference.
- [Type Manipulation](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html) — mapped types, conditional types, infer.
- [React TypeScript cheat sheets](https://react-typescript-cheatsheet.netlify.app/) — React-specific patterns (not part of this skill but complementary).
