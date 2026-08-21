# Estado y capa de datos

> **Fuentes oficiales:** https://tanstack.com/query/latest · https://react-hook-form.com/ · https://orm.drizzle.team/docs/connect-expo-sqlite · https://docs.expo.dev/versions/latest/sdk/securestore/ · https://docs.expo.dev/versions/latest/sdk/async-storage/ · https://docs.expo.dev/versions/latest/sdk/sqlite/ · https://docs.expo.dev/versions/latest/sdk/auth-session/ · https://docs.expo.dev/guides/authentication/ · https://docs.expo.dev/guides/google-authentication/

## 1. Server state — TanStack Query v5

**Cuándo usarlo:** cualquier dato que viva fuera del cliente y se pida/actualice por red. Si el dato es local y síncrono, TanStack Query sobra.

### Setup mínimo

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
useQuery({ queryKey: ['todos'], ... })                          // lista
useQuery({ queryKey: ['todo', 5], ... })                        // detalle por id
useQuery({ queryKey: ['todos', { status, page }], ... })        // params
useQuery({ queryKey: ['todos', status, page], ... })            // <- distinto del anterior
```

Regla: el orden en el array sí importa; en objects no.

### Estados

| Estado | Significado |
|---|---|
| `isPending` / `status === 'pending'` | sin datos |
| `isError` / `status === 'error'` | falló |
| `isSuccess` / `status === 'success'` | hay datos |
| `isFetching` | hay un `queryFn` corriendo (incluye background) |
| `fetchStatus: 'paused'` | quiere fetch pero no hay red (Network Mode) |

### Defaults importantes

| Opción | Default | Nota |
|---|---|---|
| `staleTime` | `0` | Subir a `2*60*1000` para evitar refetches. `'static'` bloquea totalmente. |
| `gcTime` | `5 min` | Tras esto el cache se recoge |
| `retry` | `3` queries / `0` mutations, backoff exponencial | |
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

### Infinite queries (paginación)

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

## 2. Estado cliente — ¿qué dice la doc oficial?

**Expo no prescribe una librería de "client global state".** React oficial recomienda `useState` + `useReducer` + Context para lo que no es server state, y desaconseja meter estado servidor dentro de stores globales.

Guía Expo [Local-first](https://docs.expo.dev/guides/local-first/) menciona **Legend-State** y **TinyBase** como reactivos cuando construyes arquitectura local-first.

Consenso medible de la comunidad RN (npm downloads 2025-2026):

| Librería | Bundle | Cuándo |
|---|---|---|
| **Zustand** | ~1 KB | De facto estándar para store global pequeño. Middlewares: `persist`, `immer`, `mmkv`. |
| **Jotai** | ~3 KB | Modelo atómico, re-renders finos. Muchos pedazos independientes. |
| **Redux Toolkit** | ~10 KB | Equipos grandes / debug estricto / RTK Query si quieres todo-en-uno. |
| **Context API** | 0 KB | 1-2 valores que cambian raro (tema, locale). NO para estado que cambia mucho. |

### Cuándo NO usar store global

- El dato viene de servidor → TanStack Query.
- El dato es local y solo lo usa 1 componente → `useState`/`useReducer`.
- El dato es local, lo lee toda la app y cambia mucho → Context NO (re-renders); usa Zustand/Jotai.

## 3. Formularios — `react-hook-form`

### Default: validación nativa de RHF (sin schema validation)

**Esta skill recomienda por defecto la validación built-in de `react-hook-form`** vía la prop `rules` en cada `Controller`. Solo se introduce un schema (Zod/Valibot/Yup) cuando el usuario lo pide explícitamente o el proyecto ya lo usa.

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
    // llamar al repository, guardar token, navegar
  });

  return (
    <View>
      <Controller
        control={control}
        name="email"
        rules={{
          required: 'El email es obligatorio',
          pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email inválido' },
        }}
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <TextInput
              placeholder="tu@email.com"
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
          required: 'La contraseña es obligatoria',
          minLength: { value: 8, message: 'Mínimo 8 caracteres' },
          validate: {
            hasUpper: (v) => /[A-Z]/.test(v) || 'Debe incluir una mayúscula',
            hasNumber: (v) => /\d/.test(v) || 'Debe incluir un número',
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
          required: 'Confirma tu contraseña',
          validate: (v, formValues) => v === formValues.password || 'Las contraseñas no coinciden',
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
        rules={{ validate: (v) => v === true || 'Debes aceptar los términos' }}
        render={({ field: { onChange, value } }) => (
          <Pressable onPress={() => onChange(!value)}>
            <Text>{value ? '☑' : '☐'} Acepto los términos</Text>
            {errors.terms?.message && <Text style={styles.error}>{errors.terms.message}</Text>}
          </Pressable>
        )}
      />

      <Pressable onPress={onSubmit} disabled={isSubmitting}>
        <Text>{isSubmitting ? 'Enviando...' : 'Crear cuenta'}</Text>
      </Pressable>
    </View>
  );
};

export default RegisterScreen;

const styles = { error: { color: 'red' } };
```

**Por qué `Controller` y NO `register`:** la doc oficial de react-hook-form recomienda explícitamente `Controller` para inputs de React Native (`TextInput`, etc.). `register` está pensado para inputs HTML nativos que reciben `ref`.

**`mode: 'onBlur'`** balance entre ruido (re-validar en cada keystroke) y feedback demorado (re-validar solo al enviar).

### Opt-in: validación con schema (Zod / Valibot / Yup)

**Solo cuando el usuario lo pide o el proyecto ya lo usa.** Resolvers oficiales soportados: Yup, Zod, Superstruct, Joi, Vest, class-validator, io-ts, Nope, computed-types, typanion, Ajv, TypeBox, ArkType, Valibot, TypeSchema, effect-ts, VineJS, fluentvalidation-ts, ata-validator, cualquier Standard Schema.

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

> ⚠️ **Zod v4** + `@hookform/resolvers` requiere `@hookform/resolvers ^3.10` y `tsconfig.json` con `"moduleResolution": "bundler"` (o `"node16"`/`"nodenext"`).

### `useController` (hook, en lugar del componente)

`field` expone `onChange / onBlur / value / name / ref / disabled`. `fieldState`: `invalid / isTouched / isDirty / error`.

```tsx
// Componente UI — arrow function con FC<Props>
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

## 4. Storage local — matriz de decisión

| Necesidad | Librería | URL |
|---|---|---|
| Secretos (tokens, refresh tokens, password) | **`expo-secure-store`** | https://docs.expo.dev/versions/latest/sdk/securestore/ |
| KV no sensible (preferencias, UI flags, drafts) | **`@react-native-async-storage/async-storage`** | https://docs.expo.dev/versions/latest/sdk/async-storage/ |
| KV rápido, **síncrono**, alto rendimiento | **`react-native-mmkv`** v4 (Nitro Module) | https://github.com/mrousavy/react-native-mmkv |
| Datos relacionales / queries / joins / sync | **`expo-sqlite`** + opcional **Drizzle ORM** | https://docs.expo.dev/versions/latest/sdk/sqlite/ + https://orm.drizzle.team/docs/connect-expo-sqlite |
| Reactive DB estilo ORM con sync integrado | **WatermelonDB** | https://watermelondb.dev/docs/Installation |
| KV de SQLite como drop-in de AsyncStorage | **`expo-sqlite/kv-store`** | https://docs.expo.dev/versions/latest/sdk/sqlite/#key-value-storage |

### `expo-secure-store`

```ts
import * as SecureStore from 'expo-secure-store';

// helpers puros (no UI) — usan function
async function saveToken(token) {
  await SecureStore.setItemAsync('access_token', token);
}

async function readToken() {
  return SecureStore.getItemAsync('access_token');
}
```

> Citas oficiales:
> - *"Large payloads can be rejected by the underlying platform. Historically, some iOS releases refused values above roughly 2048 bytes."*
> - *"On Android … will not be preserved upon app uninstallation."*
> - *"On iOS … will persist across app uninstallations if the app is reinstalled with the same bundle ID."*
> - Límites de accesibilidad: `WHEN_UNLOCKED` (default), `AFTER_FIRST_UNLOCK`, `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`.
> - **Auto-backup Android:** excluir `SecureStore` del backup o las keys se invalidan.

### AsyncStorage

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// helper puro
async function saveDraft(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
```

> **NO usar para secretos.** *"On native platforms … you can secure things like access tokens locally using `expo-secure-store` … This is different to AsyncStorage which is not secure."*

### MMKV

> *"~30x faster than AsyncStorage"*; *"Fully synchronous calls, no async/await, no Promises, no Bridge."*

Requiere `react-native >= 0.76` (v4) + `npx expo prebuild` (no corre en Expo Go puro).

```ts
import { createMMKV, useMMKVString } from 'react-native-mmkv';

export const storage = createMMKV({
  id: `user-${userId}-storage`,
  encryptionKey: 'hunter2',
  encryptionType: 'AES-256',
});

// hook de UI — arrow function
const useTheme = () => {
  const [theme, setTheme] = useMMKVString('theme');
  return { theme, setTheme };
};
```

### SQLite (`expo-sqlite`)

API moderna con métodos nombrados (`runAsync` / `getFirstAsync` / `getAllAsync`), transacciones (`withTransactionAsync` / `withExclusiveTransactionAsync`), hooks (`useSQLiteContext`, `<SQLiteProvider>`), tagged template literals `sql\`...\``.

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

DevTools inspector: `Shift+M` en CLI → Open expo-sqlite.

### Drizzle ORM + Expo SQLite

```ts
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

const expo = openDatabaseSync('db.db', { enableChangeListener: true });
const db = drizzle(expo);

const getAllUsers = async () => db.select().from(users);
```

Live queries con `useLiveQuery` requieren `enableChangeListener: true`. Necesita `drizzle-kit` + `babel-plugin-inline-import` + Metro config para bundlear migrations `.sql`.

### WatermelonDB

Requiere Babel con `["@babel/plugin-proposal-decorators", { "legacy": true }]` y opcional JSI. Versión actual 0.27.1. Pensado para apps con **sync engine propio** y queries reactivas; overkill si solo necesitas CRUD local.

## 5. HTTP — fetch vs axios

**Posición oficial:** La doc de Expo y los templates default no recomiendan axios sobre fetch. React 19 y Expo SDK 54+ vienen con `fetch` global disponible (Hermes / WHATWG Fetch). `fetch` es estándar, no requiere polyfill, soporta streams, AbortController, FormData, tipos `Request/Response` completos.

**Cuándo usar axios:** si necesitas interceptores declarativos, transformación JSON automática, mejor DX para upload progress, o shape unificado de errores.

### Patrón `fetch` + `AbortController` (default)

```ts
// helper puro (no UI)
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

### Patrón `axios` + interceptores

```ts
import axios from 'axios';

export const api = axios.create({ baseURL: API_BASE, timeout: 10_000 });

api.interceptors.request.use(cfg => {
  const token = getAccessToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
```

### Retry, timeout, cancelación

- `fetch` → `AbortController`. Retry lo hace TanStack Query (`retry: 3`, backoff).
- `axios` → `timeout`, `signal: controller.signal` (acepta `AbortController` desde 0.22), `adapter` custom, `axios-retry`.

## 6. Autenticación

### `expo-auth-session` (OAuth/OIDC web-based)

Reglas universales de la guía oficial:
1. Llamar `WebBrowser.maybeCompleteAuthSession()` para cerrar el popup.
2. Construir redirects con `AuthSession.makeRedirectUri()`.
3. Usar `AuthSession.useAuthRequest()` (hook) — carga async sin bloquear.
4. Esperar a `request` antes de habilitar el botón.
5. En web solo invocar `promptAsync` desde interacción del usuario.
6. **Expo Go no sirve para OAuth** → necesitas Development Build + scheme custom.

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

PKCE viene activado por default (`usePKCE: true`).

### `expo-apple-authentication`

> *"Any app that includes third-party authentication options **must** provide Apple authentication as an option to comply with App Store Review guidelines."*

Plataformas: iOS, tvOS, Expo Go. **No Android, no web.**

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
        if (e.code === 'ERR_REQUEST_CANCELED') { /* canceló */ }
      }
    }}
  />
);

export default SignInWithAppleButton;
```

> ⚠️ `identityToken` es JWT; **verificar firma** con la public key de Apple. `user` (id estable) se guarda en SecureStore/backend. `fullName` y `email` **solo vienen en el primer login** — persistir desde el primer response.

### Google Sign-In

La doc oficial recomienda:
- `react-native-nitro-google-signin` — incluye **Android Credential Manager** gratis.
- `@react-native-google-signin/google-signin` — Credential Manager solo en plan pago.

> *"The legacy Google Sign-In SDK for Android is deprecated and Google recommends migrating to Android Credential Manager."*

Ambas requieren Development Build (no Expo Go) + `expo prebuild`. Para Android necesitas SHA-1 de Play App Signing (producción) y del `.apk`/`.aab` (testing) en Firebase / Google Cloud.

### Almacenar la sesión

> *"Securely store the auth on your device"* → **`expo-secure-store`** (no AsyncStorage).

## 7. Resumen rápido

```
¿El dato vive en un servidor?
├─ Sí → TanStack Query v5
│       ├─ lista paginada → useInfiniteQuery
│       └─ escribe → useMutation + invalidateQueries
└─ No → ¿es secreto? → expo-secure-store
      └─ ¿es KV no sensible y pequeño? → AsyncStorage (o MMKV si necesitas sync/velocidad)
         └─ ¿es relacional con joins/queries? → expo-sqlite (+ Drizzle)
            └─ ¿tienes sync engine? → WatermelonDB

¿Necesitas formulario?
└─ react-hook-form + Controller (RN) + validación nativa (rules={...})
   Schema validation (Zod/Valibot/Yup) SOLO si el usuario lo pide

¿Necesitas estado UI compartido entre pantallas?
└─ 1-2 valores que cambian raro → Context API
   Estado complejo o cambia mucho → Zustand / Jotai
   Equipo grande / debug estricto → Redux Toolkit

¿Necesitas autenticación?
├─ OAuth/OIDC web → expo-auth-session
├─ iOS nativo    → expo-apple-authentication (obligatorio si tienes otros providers)
├─ Google        → @react-native-google-signin/google-signin o react-native-nitro-google-signin
└─ Guardar tokens → expo-secure-store (NUNCA AsyncStorage)
```

## 8. Comandos de instalación

```sh
# Server state
npm i @tanstack/react-query

# Forms (sin schema validation)
npm i react-hook-form
# Schema validation (opt-in, solo si el usuario lo pide)
npm i @hookform/resolvers zod        # o valibot / yup

# Storage seguro / no sensible
npx expo install expo-secure-store
npx expo install @react-native-async-storage/async-storage

# Storage rápido (sync) — requiere prebuild
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

# Conectividad (para retry de TanStack Query)
npx expo install expo-network
```
