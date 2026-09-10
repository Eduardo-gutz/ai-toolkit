# State and data layer

> **Official sources:** https://tanstack.com/query/latest · https://react-hook-form.com/ · https://orm.drizzle.team/docs/connect-expo-sqlite · https://docs.expo.dev/versions/latest/sdk/securestore/ · https://docs.expo.dev/versions/latest/sdk/async-storage/ · https://docs.expo.dev/versions/latest/sdk/sqlite/ · https://docs.expo.dev/versions/latest/sdk/auth-session/ · https://docs.expo.dev/guides/authentication/ · https://docs.expo.dev/guides/google-authentication/

## 1. Server state — TanStack Query v5

**When to use it:** any data that lives outside the client and is requested/updated over the network. If the data is local and synchronous, TanStack Query is overkill.

### Minimum setup

```tsx
import { FC } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

const queryClient = new QueryClient();

const App: FC<{}> = () => (
  <QueryClientProvider client={queryClient}>
    <Example />
  </QueryClientProvider>
);

const Example: FC<{}> = () => {
  const { isPending, error, data } = useQuery({
    queryKey: ['repoData'],
    queryFn: () => fetch('https://api.github.com/repos/TanStack/query').then(r => r.json()),
  });
  if (isPending) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;
  return <Text>{data?.name}</Text>;
};

export default App;
```

### Query keys

> *"If your query function depends on a variable, include it in your query key."*

```tsx
useQuery({ queryKey: ['todos'], ... })                          // list
useQuery({ queryKey: ['todo', 5], ... })                        // detail by id
useQuery({ queryKey: ['todos', { status, page }], ... })        // params
useQuery({ queryKey: ['todos', status, page], ... })            // <- different from the previous one
```

Rule: order in the array matters; in objects it does not.

### States

| State | Meaning |
|---|---|
| `isPending` / `status === 'pending'` | no data |
| `isError` / `status === 'error'` | failed |
| `isSuccess` / `status === 'success'` | has data |
| `isFetching` | a `queryFn` is running (includes background) |
| `fetchStatus: 'paused'` | wants to fetch but no network (Network Mode) |

### Important defaults

| Option | Default | Note |
|---|---|---|
| `staleTime` | `0` | Raise to `2*60*1000` to avoid refetches. `'static'` blocks completely. |
| `gcTime` | `5 min` | After this the cache is collected |
| `retry` | `3` queries / `0` mutations, exponential backoff | |
| `refetchOnMount` / `Window` / `Reconnect` | `true` | |

### Mutations + optimistic updates

```tsx
const useUpdateTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTodo,
    onMutate: async (newTodo, ctx) => {
      await ctx.client.cancelQueries({ queryKey: ['todos'] });
      const previousTodos = ctx.client.getQueryData(['todos']);
      ctx.client.setQueryData(['todos'], old => [...old, newTodo]);
      return { previousTodos };
    },
    onError: (err, newTodo, onMutateResult, ctx) => {
      ctx.client.setQueryData(['todos'], onMutateResult.previousTodos);
    },
    onSettled: (data, error, vars, onMutateResult, ctx) =>
      ctx.client.invalidateQueries({ queryKey: ['todos'] }),
  });
};
```

### Infinite queries (pagination)

```tsx
import { FC } from 'react';

const ProjectsList: FC<{}> = () => {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['projects'],
    queryFn: async ({ pageParam }) => {
      const res = await fetch('/api/projects?cursor=' + pageParam);
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  // render...
};
```

## 2. Client state — what does the official docs say?

**Expo does not prescribe a "global client state" library.** React official recommends `useState` + `useReducer` + Context for what is not server state, and discourages putting server state inside global stores.

Expo's [Local-first](https://docs.expo.dev/guides/local-first/) guide mentions **Legend-State** and **TinyBase** as reactives when you build a local-first architecture.

Measurable community consensus in RN (npm downloads 2025-2026):

| Library | Bundle | When |
|---|---|---|
| **Zustand** | ~1 KB | De facto standard for small global store. Middlewares: `persist`, `immer`, `mmkv`. |
| **Jotai** | ~3 KB | Atomic model, fine re-renders. Many independent pieces. |
| **Redux Toolkit** | ~10 KB | Large teams / strict debug / RTK Query if you want all-in-one. |
| **Context API** | 0 KB | 1-2 values that change rarely (theme, locale). NOT for state that changes a lot. |

### When NOT to use a global store

- The data comes from the server → TanStack Query.
- The data is local and only used by 1 component → `useState`/`useReducer`.
- The data is local, read by the whole app, and changes a lot → Context NO (re-renders); use Zustand/Jotai.

## 3. Forms — `react-hook-form`

### Default: RHF native validation (without schema validation)

**This skill recommends by default the built-in `react-hook-form` validation** via the `rules` prop on each `Controller`. A schema (Zod/Valibot/Yup) is only introduced when the user explicitly asks for it or the project already uses one.

```tsx
import { Controller, useForm } from 'react-hook-form';
import { View, Text, TextInput, Pressable } from 'react-native';

type RegisterFormValues = {
  email: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
};

const RegisterScreen: FC<{}> = () => {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    mode: 'onBlur',
    defaultValues: { email: '', password: '', confirmPassword: '', terms: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    // call the repository, save token, navigate
  });

  return (
    <View>
      <Controller
        control={control}
        name="email"
        rules={{
          required: 'Email is required',
          pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
        }}
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <TextInput
              placeholder="you@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
            {errors.email?.message && <Text style={styles.error}>{errors.email.message}</Text>}
          </View>
        )}
      />

      <Controller
        control={control}
        name="password"
        rules={{
          required: 'Password is required',
          minLength: { value: 8, message: 'Minimum 8 characters' },
          validate: {
            hasUpper: (v) => /[A-Z]/.test(v) || 'Must include an uppercase letter',
            hasNumber: (v) => /\d/.test(v) || 'Must include a number',
          },
        }}
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <TextInput secureTextEntry onBlur={onBlur} onChangeText={onChange} value={value} />
            {errors.password?.message && <Text style={styles.error}>{errors.password.message}</Text>}
          </View>
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        rules={{
          required: 'Confirm your password',
          validate: (v, formValues) => v === formValues.password || 'Passwords do not match',
        }}
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <TextInput secureTextEntry onBlur={onBlur} onChangeText={onChange} value={value} />
            {errors.confirmPassword?.message && <Text style={styles.error}>{errors.confirmPassword.message}</Text>}
          </View>
        )}
      />

      <Controller
        control={control}
        name="terms"
        rules={{ validate: (v) => v === true || 'You must accept the terms' }}
        render={({ field: { onChange, value } }) => (
          <Pressable onPress={() => onChange(!value)}>
            <Text>{value ? '☑' : '☐'} I accept the terms</Text>
            {errors.terms?.message && <Text style={styles.error}>{errors.terms.message}</Text>}
          </Pressable>
        )}
      />

      <Pressable onPress={onSubmit} disabled={isSubmitting}>
        <Text>{isSubmitting ? 'Submitting...' : 'Create account'}</Text>
      </Pressable>
    </View>
  );
};

export default RegisterScreen;

const styles = { error: { color: 'red' } };
```

**Why `Controller` and NOT `register`:** the official react-hook-form docs explicitly recommend `Controller` for React Native inputs (`TextInput`, etc.). `register` is meant for native HTML inputs that receive `ref`.

**`mode: 'onBlur'`** balances noise (re-validate on each keystroke) and delayed feedback (re-validate only on submit).

### Opt-in: validation with schema (Zod / Valibot / Yup)

**Only when the user asks or the project already uses one.** Supported official resolvers: Yup, Zod, Superstruct, Joi, Vest, class-validator, io-ts, Nope, computed-types, typanion, Ajv, TypeBox, ArkType, Valibot, TypeSchema, effect-ts, VineJS, fluentvalidation-ts, ata-validator, any Standard Schema.

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  firstName: z.string().min(1),
  age: z.number().int().positive(),
});

const Form: FC<{}> = () => {
  const { handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });
  // ...
};

export default Form;
```

> ⚠️ **Zod v4** + `@hookform/resolvers` requires `@hookform/resolvers ^3.10` and `tsconfig.json` with `"moduleResolution": "bundler"` (or `"node16"`/`"nodenext"`).

### `useController` (hook, instead of the component)

`field` exposes `onChange / onBlur / value / name / ref / disabled`. `fieldState`: `invalid / isTouched / isDirty / error`.

```tsx
// UI component — arrow function with FC<Props>
const ControlledInput: FC<UseControllerProps<FormValues>> = (props) => {
  const { field, fieldState } = useController(props);
  return (
    <View>
      <TextInput {...field} placeholder={props.name} />
      {fieldState.invalid && <Text>invalid</Text>}
    </View>
  );
};
```

## 4. Local storage — decision matrix

| Need | Library | URL |
|---|---|---|
| Secrets (tokens, refresh tokens, password) | **`expo-secure-store`** | https://docs.expo.dev/versions/latest/sdk/securestore/ |
| Non-sensitive KV (preferences, UI flags, drafts) | **`@react-native-async-storage/async-storage`** | https://docs.expo.dev/versions/latest/sdk/async-storage/ |
| Fast KV, **synchronous**, high performance | **`react-native-mmkv`** v4 (Nitro Module) | https://github.com/mrousavy/react-native-mmkv |
| Relational data / queries / joins / sync | **`expo-sqlite`** + optional **Drizzle ORM** | https://docs.expo.dev/versions/latest/sdk/sqlite/ + https://orm.drizzle.team/docs/connect-expo-sqlite |
| Reactive DB ORM-style with integrated sync | **WatermelonDB** | https://watermelondb.dev/docs/Installation |
| SQLite-backed KV as a drop-in for AsyncStorage | **`expo-sqlite/kv-store`** | https://docs.expo.dev/versions/latest/sdk/sqlite/#key-value-storage |

### `expo-secure-store`

```ts
import * as SecureStore from 'expo-secure-store';

// pure helpers (no UI) — use function
async function saveToken(token) {
  await SecureStore.setItemAsync('access_token', token);
}

async function readToken() {
  return SecureStore.getItemAsync('access_token');
}
```

> Official quotes:
> - *"Large payloads can be rejected by the underlying platform. Historically, some iOS releases refused values above roughly 2048 bytes."*
> - *"On Android … will not be preserved upon app uninstallation."*
> - *"On iOS … will persist across app uninstallations if the app is reinstalled with the same bundle ID."*
> - Accessibility limits: `WHEN_UNLOCKED` (default), `AFTER_FIRST_UNLOCK`, `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`.
> - **Android auto-backup:** exclude `SecureStore` from backup or the keys are invalidated.

### AsyncStorage

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// pure helper
async function saveDraft(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
```

> **DO NOT use for secrets.** *"On native platforms … you can secure things like access tokens locally using `expo-secure-store` … This is different to AsyncStorage which is not secure."*

### MMKV

> *"~30x faster than AsyncStorage"*; *"Fully synchronous calls, no async/await, no Promises, no Bridge."*

Requires `react-native >= 0.76` (v4) + `npx expo prebuild` (does not run in pure Expo Go).

```ts
import { createMMKV, useMMKVString } from 'react-native-mmkv';

export const storage = createMMKV({
  id: `user-${userId}-storage`,
  encryptionKey: 'hunter2',
  encryptionType: 'AES-256',
});

// UI hook — arrow function
const useTheme = () => {
  const [theme, setTheme] = useMMKVString('theme');
  return { theme, setTheme };
};
```

### SQLite (`expo-sqlite`)

Modern API with named methods (`runAsync` / `getFirstAsync` / `getAllAsync`), transactions (`withTransactionAsync` / `withExclusiveTransactionAsync`), hooks (`useSQLiteContext`, `<SQLiteProvider>`), tagged template literals `sql\`...\``.

```ts
import * as SQLite from 'expo-sqlite';

const db = await SQLite.openDatabaseAsync('app.db');

await db.execAsync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`);

const row = await db.getFirstAsync<{ id: number; value: string }>(
  'SELECT * FROM todos WHERE id = ?', 1,
);

await db.withTransactionAsync(async () => {
  await db.runAsync('UPDATE todos SET value = ? WHERE id = ?', 'hi', 1);
});
```

DevTools inspector: `Shift+M` in CLI → Open expo-sqlite.

### Drizzle ORM + Expo SQLite

```ts
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

const expo = openDatabaseSync('db.db', { enableChangeListener: true });
const db = drizzle(expo);

const getAllUsers = async () => db.select().from(users);
```

Live queries with `useLiveQuery` require `enableChangeListener: true`. Needs `drizzle-kit` + `babel-plugin-inline-import` + Metro config to bundle migrations `.sql`.

### WatermelonDB

Requires Babel with `["@babel/plugin-proposal-decorators", { "legacy": true }]` and optional JSI. Current version 0.27.1. Designed for apps with their **own sync engine** and reactive queries; overkill if you only need local CRUD.

## 5. HTTP — fetch vs axios

**Official position:** The Expo docs and default templates do not recommend axios over fetch. React 19 and Expo SDK 54+ come with `fetch` globally available (Hermes / WHATWG Fetch). `fetch` is standard, requires no polyfill, supports streams, AbortController, FormData, full `Request/Response` types.

**When to use axios:** if you need declarative interceptors, automatic JSON transformation, better DX for upload progress, or a unified error shape.

### `fetch` + `AbortController` pattern (default)

```ts
// pure helper (no UI)
async function apiFetch(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

### `axios` + interceptors pattern

```ts
import axios from 'axios';

export const api = axios.create({ baseURL: API_BASE, timeout: 10_000 });

api.interceptors.request.use(cfg => {
  const token = getAccessToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
```

### Retry, timeout, cancellation

- `fetch` → `AbortController`. Retry is done by TanStack Query (`retry: 3`, backoff).
- `axios` → `timeout`, `signal: controller.signal` (accepts `AbortController` since 0.22), custom `adapter`, `axios-retry`.

## 6. Authentication

### `expo-auth-session` (web-based OAuth/OIDC)

Universal rules from the official guide:
1. Call `WebBrowser.maybeCompleteAuthSession()` to close the popup.
2. Build redirects with `AuthSession.makeRedirectUri()`.
3. Use `AuthSession.useAuthRequest()` (hook) — async loading without blocking.
4. Wait for `request` before enabling the button.
5. On web only invoke `promptAsync` from user interaction.
6. **Expo Go does not work for OAuth** → you need a Development Build + custom scheme.

```tsx
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
};

const useGitHubAuth = () => {
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: 'CLIENT_ID',
      scopes: ['identity'],
      redirectUri: makeRedirectUri({ scheme: 'your.app' }),
    },
    discovery,
  );
  return { request, response, promptAsync };
};
```

PKCE is enabled by default (`usePKCE: true`).

### `expo-apple-authentication`

> *"Any app that includes third-party authentication options **must** provide Apple authentication as an option to comply with App Store Review guidelines."*

Platforms: iOS, tvOS, Expo Go. **Not Android, not web.**

```tsx
import { FC } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';

const SignInWithAppleButton: FC<{}> = () => (
  <AppleAuthentication.AppleAuthenticationButton
    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
    cornerRadius={5}
    style={{ width: 200, height: 44 }}
    onPress={async () => {
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
      } catch (e) {
        if (e.code === 'ERR_REQUEST_CANCELED') { /* canceled */ }
      }
    }}
  />
);

export default SignInWithAppleButton;
```

> ⚠️ `identityToken` is a JWT; **verify the signature** with Apple's public key. `user` (stable id) is stored in SecureStore/backend. `fullName` and `email` **only come in the first login** — persist from the first response.

### Google Sign-In

The official docs recommend:
- `react-native-nitro-google-signin` — includes **Android Credential Manager** for free.
- `@react-native-google-signin/google-signin` — Credential Manager only on the paid plan.

> *"The legacy Google Sign-In SDK for Android is deprecated and Google recommends migrating to Android Credential Manager."*

Both require Development Build (not Expo Go) + `expo prebuild`. For Android you need the SHA-1 from Play App Signing (production) and from the `.apk`/`.aab` (testing) in Firebase / Google Cloud.

### Store the session

> *"Securely store the auth on your device"* → **`expo-secure-store`** (NEVER AsyncStorage).

## 7. Quick summary

```
Does the data live on a server?
├─ Yes → TanStack Query v5
│       ├─ paginated list → useInfiniteQuery
│       └─ write → useMutation + invalidateQueries
└─ No → is it a secret? → expo-secure-store
      └─ is it a small non-sensitive KV? → AsyncStorage (or MMKV if you need sync/speed)
         └─ is it relational with joins/queries? → expo-sqlite (+ Drizzle)
            └─ do you have a sync engine? → WatermelonDB

Do you need a form?
└─ react-hook-form + Controller (RN) + native validation (rules={...})
   Schema validation (Zod/Valibot/Yup) ONLY if the user asks for it

Do you need shared UI state across screens?
└─ 1-2 values that change rarely → Context API
   Complex state or changes a lot → Zustand / Jotai
   Large team / strict debug → Redux Toolkit

Do you need authentication?
├─ OAuth/OIDC web → expo-auth-session
├─ iOS native    → expo-apple-authentication (mandatory if you have other providers)
├─ Google        → @react-native-google-signin/google-signin or react-native-nitro-google-signin
└─ Store tokens → expo-secure-store (NEVER AsyncStorage)
```

## 8. Install commands

```sh
# Server state
npm i @tanstack/react-query

# Forms (without schema validation)
npm i react-hook-form
# Schema validation (opt-in, only if the user asks for it)
npm i @hookform/resolvers zod        # or valibot / yup

# Secure / non-sensitive storage
npx expo install expo-secure-store
npx expo install @react-native-async-storage/async-storage

# Fast (sync) storage — requires prebuild
npx expo install react-native-mmkv react-native-nitro-modules
npx expo prebuild

# SQLite + ORM
npx expo install expo-sqlite
npm i drizzle-orm
npm i -D drizzle-kit babel-plugin-inline-import

# Auth
npx expo install expo-auth-session expo-crypto
npx expo install expo-apple-authentication     # iOS-only
npx expo install @react-native-google-signin/google-signin

# Connectivity (for TanStack Query retry)
npx expo install expo-network
```
