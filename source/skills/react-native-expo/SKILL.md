---
name: react-native-expo
description: Reference guide for React Native + Expo SDK 54+ best practices (routing, state, forms, storage, native features, performance, deployment, testing). Read this when the user explicitly asks about Expo / React Native patterns, or when the project already requires it. Do NOT auto-trigger from generic mentions of "mobile app", "scaffolding", or "form" — only load when the user names the stack (Expo, expo-router, react-native, etc.) or asks for an architectural decision in an existing React Native project. Verified against docs.expo.dev, reactnative.dev, tanstack.com, react-hook-form.com, shopify.github.io/flash-list, and docs.swmansion.com as of Aug 2026.
disable-model-invocation: true
---

# React Native + Expo — Skill de buenas prácticas

> **Versión objetivo:** Expo SDK 54+ (estable). Todo el contenido está verificado contra `docs.expo.dev`, `reactnative.dev`, `tanstack.com`, `react-hook-form.com`, `shopify.github.io/flash-list`, `docs.swmansion.com/react-native-reanimated`.
>
> **Cómo se activa:** Solo cuando el usuario la pida explícitamente o esté en un proyecto React Native + Expo y haga una pregunta arquitectónica. Esta skill NO se auto-dispara desde menciones genéricas de "app", "formulario" o "scaffold".

## Convenciones que esta skill impone (y dónde cede)

1. **Arrow functions por defecto en código UI.** Componentes, screens, hooks y métodos dentro de componentes se escriben con arrow functions: `const Screen = () => { ... }`. `function` se reserva para **helpers, utils, o funciones puras no relacionadas a UI** (p.ej. un validador puro, una función de transformación de datos en un módulo `lib/`, un `parseJwt` en un repository). Esta regla aplica a TODO código que esta skill genere como ejemplo o recomendación.

1b. **Props tipadas con `FC<Props>`.** Todo componente/screen/hook que reciba props las tipa con `FC<Props>` (alias de `React.FunctionComponent`) o `FC<Props, State>` si usa state interno. Definir el type de las props **antes** del componente y referenciarlo en `FC<...>`. Forma canónica:
   ```tsx
   type HomeScreenProps = {
     userId: string;
     onPressItem?: (id: string) => void;
   };

   const HomeScreen: FC<HomeScreenProps> = ({ userId, onPressItem }) => {
     return <Pressable onPress={() => onPressItem?.(userId)}><Text>{userId}</Text></Pressable>;
   };

   export default HomeScreen;
   ```
   Si el componente no recibe props, usar `FC<{}>` o simplemente no anotar (no infiere `JSX.Element | null` automáticamente).

2. **La arquitectura del proyecto gana sobre los defaults de esta skill.** Antes de proponer una estructura de carpetas, naming, o patrón, leer `AGENTS.md`, `architecture.md`, `.context/*`, o el `README.md` del proyecto. Si el proyecto ya define convenciones (p.ej. `app/` vs `src/app/`, atoms/molecules/organisms vs flat, módulos por feature vs por capa, etc.), **esos mandan**. Esta skill solo aporta cuando el proyecto no tiene una convención explícita.

3. **Formularios: validación nativa de RHF por defecto.** Usar las reglas built-in de `react-hook-form` (`rules={{ required, minLength, pattern, validate }}`) o un resolver solo si el usuario lo pide explícitamente. **No proponer Zod, Valibot o Yup por defecto.** Si el usuario pide schema validation o el proyecto ya usa uno, sí intégralo (Zod/Valibot/Yup son las opciones oficiales soportadas por `@hookform/resolvers`).

4. **Recomendación oficial > preferencia personal.** Si Expo/React/Shopify/SwMansion publican una guía, esa es la fuente. Si una práctica contradice "lo que se hacía antes", gana la doc actual.

5. **`expo-router` para apps nuevas, React Navigation para legacy.** El default template de `create-expo-app` usa expo-router. Migrar desde React Navigation tiene guía oficial; al revés no.

6. **Server state ≠ client state ≠ form state ≠ UI state.** Cada categoría tiene su herramienta canónica. Mezclar lleva a re-renders innecesarios, bugs de cache, código espagueti.

7. **Secretos a `expo-secure-store`, nunca AsyncStorage.** Es regla explícita de la guía oficial de Auth de Expo.

8. **Permisos nativos siempre con el hook `use*Permissions` del módulo.** El paquete `expo-permissions` no existe desde SDK 48.

9. **Performance se mide en release builds, no en dev.** `console.log`, dev tools y JS thread saturado distorsionan cualquier benchmark.

10. **Customizar nativo vía config plugins, nunca editando `android/`/`ios/` a mano.** Se pierde con `expo prebuild --clean`.

11. **Antes de instalar una librería, verificar en [reactnative.directory](https://reactnative.directory/) con `npx expo-doctor@latest`.** Especialmente crítico en New Architecture (SDK 53+ default).

## Tabla de contenidos

| Archivo | Cubre |
|---|---|
| [`references/setup.md`](references/setup.md) | `create-expo-app`, estructura `src/`, `app.json`/`app.config.ts`, Metro/Babel, TypeScript, path aliases |
| [`references/router.md`](references/router.md) | `expo-router` (file-based routing, layouts, modals, typed routes, deep linking, params) |
| [`references/state-and-data.md`](references/state-and-data.md) | TanStack Query, estado cliente, formularios (RHF + opt-in schema), storage local, DB, HTTP, auth |
| [`references/native-features.md`](references/native-features.md) | Cámara, location, notificaciones, permisos (patrón unificado `use*Permissions`) |
| [`references/performance.md`](references/performance.md) | Listas (FlashList vs FlatList), `expo-image`, Reanimated, New Architecture |
| [`references/deployment.md`](references/deployment.md) | EAS Build/Submit/Update/Workflows, testing (Jest, RNTL, Maestro), lint, debugging |

## Decisiones rápidas por categoría

### ¿Cómo arranco un proyecto?

```
npx create-expo-app@latest --template default
# (SDK 54 mientras esté vigente el branch)
# Estructura canónica: src/app/* (rutas) + src/components, src/hooks, src/constants
# Config: app.config.ts (no app.json) si necesitas types/auto-completion
```

> **Antes de generar archivos, leer `AGENTS.md` / `architecture.md` del proyecto** (regla 2 arriba). Si el proyecto define su propia estructura, replicarla.

Ver [`references/setup.md`](references/setup.md).

### ¿Cómo navego?

- **Default:** `expo-router` con file-based routing en `src/app/`. Deep linking automático.
- **Alternativa:** `@react-navigation/native-stack` + `@react-navigation/bottom-tabs` (v7) — solo si necesitas control manual fino o no quieres deep linking universal.
- **Tipado de rutas:** `experiments.typedRoutes: true` en `app.json`.

Ver [`references/router.md`](references/router.md).

### ¿Cómo manejo estado?

| Necesidad | Herramienta canónica |
|---|---|
| Dato que viene del servidor | `@tanstack/react-query` v5 |
| Estado UI compartido (1-2 valores, cambia poco) | React Context API |
| Estado cliente global, muchos updates | `zustand` (consenso comunidad, sin pronunciamiento oficial) |
| Formulario con validación | `react-hook-form` — **validación nativa por defecto**, schema validation solo si el usuario lo pide |

> Expo no prescribe librería de client state. React oficial recomienda `useState`+`useReducer`+`Context` para lo que no es server state.

Ver [`references/state-and-data.md`](references/state-and-data.md).

### ¿Cómo persisto datos?

| Necesidad | Herramienta |
|---|---|
| Tokens, refresh tokens, secretos | `expo-secure-store` |
| Preferencias, drafts, flags UI | `@react-native-async-storage/async-storage` o `react-native-mmkv` (sync, ~30× más rápido; requiere `expo prebuild`) |
| Datos relacionales, queries, joins | `expo-sqlite` + `drizzle-orm` |
| DB reactiva con sync engine | WatermelonDB (RN-only, overkill si solo es CRUD local) |

Ver [`references/state-and-data.md`](references/state-and-data.md).

### ¿Cómo autentico?

- **OAuth/OIDC genérico** (GitHub, Okta, Auth0): `expo-auth-session` + `expo-crypto`.
- **Sign in with Apple** (iOS): `expo-apple-authentication` — **obligatorio** si tienes otros providers third-party (App Store rule).
- **Google**: `@react-native-google-signin/google-signin` (pago para Credential Manager) o `react-native-nitro-google-signin` (gratis).
- **Tokens:** siempre `expo-secure-store`.

> OAuth Nativo + Google Sign-In requieren **Development Build** (no Expo Go).

Ver [`references/state-and-data.md`](references/state-and-data.md) §Auth.

### ¿Cómo accedo a features nativas?

**Patrón universal de permisos** (todos los módulos `expo-*` lo siguen):

```tsx
const [permission, requestPermission] = useXxxPermissions();

if (permission === null) return <Loading />;
if (!permission.granted) {
  if (permission.canAskAgain) {
    return <Button title="Grant" onPress={requestPermission} />;
  }
  return <Button title="Open Settings" onPress={() => Linking.openURL('app-settings:')} />;
}
// usar feature...
```

Ver [`references/native-features.md`](references/native-features.md).

### ¿Cómo optimizo performance?

- **Listas > 50 items o longitud variable:** `@shopify/flash-list` v2 (New Arch). `FlatList` solo si conoces `getItemLayout` y la lista es homogénea.
- **Imágenes:** `expo-image` (no `<Image>` de RN). BlurHash placeholder + `contentFit` + `recyclingKey` en listas.
- **Animaciones:** `react-native-reanimated` v4 (requiere New Arch). Worklets plugin debe ir **último** en babel.
- **Debug:** Chrome DevTools + React DevTools + `expo-dev-client`. **No usar Flipper** (deprecado por RN core).

Ver [`references/performance.md`](references/performance.md).

### ¿Cómo despliego?

- **Build:** `eas build --profile production` (cloud) o `eas build --local`.
- **Submit:** `eas submit` (auto-firma y sube a stores).
- **OTA updates:** `expo-updates` + `eas update --branch production`. **NO** cambia native code, permissions ni SDK.
- **CI/CD:** EAS Workflows (`.eas/workflows/*.yml`) — corre en infraestructura managed. Alternativa: GitHub Actions.
- **Local dev:** `npx expo run:android` / `run:ios` (compila nativo + Metro). Solo JS: `npx expo start`.

Ver [`references/deployment.md`](references/deployment.md).

### ¿Cómo testeo?

- **Unit/component:** `jest-expo` preset + `@testing-library/react-native`. **No** `react-test-renderer` (deprecado en React 19+).
- **E2E (oficial recomendado):** **Maestro** (mobile.dev). Expo tiene job type `maestro` en EAS Workflows.
- **No oficial:** Detox (Expo no lo recomienda en su doc actual).

Ver [`references/deployment.md`](references/deployment.md) §Testing.

## Errores comunes que esta skill busca evitar

| ❌ Anti-patrón | ✅ Lo correcto | Fuente |
|---|---|---|
| Guardar tokens en AsyncStorage | `expo-secure-store` | [docs.expo.dev/guides/authentication](https://docs.expo.dev/guides/authentication/) |
| Editar `android/`/`ios/` a mano | Config plugin + `expo prebuild` | [docs.expo.dev/config-plugins](https://docs.expo.dev/config-plugins/introduction/) |
| Editar `babel.config.js` para cosas que el preset ya hace | Solo crear `babel.config.js` si necesitas customización real; `npx expo customize babel.config.js` | [docs.expo.dev/versions/latest/config/babel](https://docs.expo.dev/versions/latest/config/babel/) |
| `eject` de Expo | **`expo eject` no existe desde SDK 46.** Usar `expo prebuild` | [docs.expo.dev/llms.txt](https://docs.expo.dev/llms.txt) |
| Usar `useAnimatedGestureHandler` | Gesture API v2 de Gesture Handler | [Reanimated 3→4 migration](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x) |
| Reanimated 3 con New Arch cuando hay 4 disponible | Reanimated 4 | [Reanimated docs](https://docs.swmansion.com/react-native-reanimated/) |
| Asumir que `requestBackgroundPermissionsAsync` va a mostrar dialog en iOS "Allow Once" | Silenciosamente falla | [docs.expo.dev/versions/latest/sdk/location](https://docs.expo.dev/versions/latest/sdk/location/) |
| `getExpoPushTokenAsync` antes de `setNotificationChannelAsync` en Android 13+ | Crear canal primero | [docs.expo.dev/versions/latest/sdk/notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) |
| Path alias `@/*` sin `tsconfigPaths` enabled | Habilitarlo o Metro no resuelve | [docs.expo.dev/guides/typescript](https://docs.expo.dev/guides/typescript/) |
| `console.log` en producción | `babel-plugin-transform-remove-console` | [reactnative.dev/docs/performance](https://reactnative.dev/docs/performance) |
| **`function Componente() { ... }`** | **`const Componente = () => { ... }`** | Convención de esta skill (regla 1) |
| **Proponer Zod sin que el usuario lo pida** | **`rules={{ required, minLength, pattern, validate }}` built-in de RHF** | Convención de esta skill (regla 3) |
| Inventar convenciones ignorando `AGENTS.md`/`architecture.md` | Leerlos primero; replicar lo que definen | Convención de esta skill (regla 2) |

## Reglas operativas para el agente

1. **Antes de recomendar un patrón, abre el `references/` correspondiente y verifica contra la URL oficial listada al final del bloque.** Si el patrón que ibas a proponer no aparece, no lo inventes — busca en la doc oficial primero.
2. **Cita la URL** al final de cada recomendación técnica específica (formato: `[fuente](https://...)`).
3. **Lee `AGENTS.md` / `architecture.md` del proyecto antes de proponer estructura de carpetas, naming o imports.** Si el proyecto define convenciones, esas ganan sobre los defaults de esta skill.
4. **Escribe componentes, screens, hooks y métodos internos como arrow functions.** Solo usa `function` para helpers/utils/pure no-UI.
5. **No propongas Zod/Valibot/Yup por defecto en formularios.** Si el usuario lo pide explícitamente o el proyecto ya lo usa, intégralo.
6. **Si el usuario pregunta algo fuera del scope de la skill** (ej. Flutter, Swift nativo, Android Kotlin, backend puro), responde brevemente y sugiere el skill o doc apropiado. No fuerces esta skill.
7. **Si el usuario da una instrucción explícita que contradice la doc oficial**, sigue al usuario pero advierte el trade-off en 1-2 frases.
8. **Para "qué versión de X debo usar"**, prioriza siempre la última visible en `docs.expo.dev/versions/latest/` o la rama del paquete en GitHub. Si hay breaking change reciente (ej. Reanimated 3→4), mencionalo.
9. **No instales dependencias por tu cuenta.** Recomienda el comando `npx expo install <pkg>` y deja que el usuario lo corra.
10. **Cuando menciones un paquete deprecated o inexistente** (ej. `expo-permissions`, `react-test-renderer` para React 19, `expo publish`), di explícitamente que ya no existe y por qué.

## Versiones de referencia (verificadas contra docs oficiales, ago 2026)

| Componente | Versión actual |
|---|---|
| Expo SDK | 54 (target de esta skill); docs muestran 57 como latest pero 54 estable |
| React Native | 0.81+ (New Architecture default desde SDK 53) |
| React | 19+ |
| expo-router | v5+ |
| TanStack Query | v5 |
| react-hook-form | v7+ |
| `@hookform/resolvers` | ^3.10 (requerido para Zod v4, si se usa Zod) |
| Reanimated | 4.x (requiere New Arch) |
| FlashList | v2.x |
| Drizzle ORM | compatible con `expo-sqlite` |
| jest-expo | última estable |
| @testing-library/react-native | reemplaza `react-test-renderer` (React 19+) |
| Maestro | mobile.dev (recomendado oficial para E2E) |
| EAS CLI | ≥15 |

## Cómo extender esta skill

Si al usar la skill descubres un patrón nuevo (no documentado aquí) o un cambio importante en doc oficial, actualiza el `references/` correspondiente y, si el cambio afecta una decisión arquitectónica de las listadas arriba, actualiza también este SKILL.md.
