---
name: react-native-expo
description: Reference guide for React Native + Expo SDK 54+ best practices (routing, state, forms, storage, native features, performance, deployment, testing). Read this when the user explicitly asks about Expo / React Native patterns, or when the project already requires it. Do NOT auto-trigger from generic mentions of "mobile app", "scaffolding", or "form" — only load when the user names the stack (Expo, expo-router, react-native, etc.) or asks for an architectural decision in an existing React Native project. Verified against docs.expo.dev, reactnative.dev, tanstack.com, react-hook-form.com, shopify.github.io/flash-list, and docs.swmansion.com as of Aug 2026.
disable-model-invocation: true
---

# React Native + Expo — Best practices skill

> **Target version:** Expo SDK 54+ (stable). All content is verified against `docs.expo.dev`, `reactnative.dev`, `tanstack.com`, `react-hook-form.com`, `shopify.github.io/flash-list`, `docs.swmansion.com/react-native-reanimated`.
>
> **How it is activated:** Only when the user explicitly asks for it or is in a React Native + Expo project and makes an architectural question. This skill does NOT auto-trigger from generic mentions of "app", "form" or "scaffold".

## Conventions this skill enforces (and where it yields)

1. **Arrow functions by default in UI code.** Components, screens, hooks, and methods within components are written with arrow functions: `const Screen = () => { ... }`. `function` is reserved for **helpers, utils, or pure functions unrelated to UI** (e.g., a pure validator, a data transformation function in a `lib/` module, a `parseJwt` in a repository). This rule applies to ALL code this skill generates as example or recommendation.

1b. **Props typed with `FC<Props>`.** Every component/screen/hook that receives props types them with `FC<Props>` (alias of `React.FunctionComponent`) or `FC<Props, State>` if it uses internal state. Define the props type **before** the component and reference it in `FC<...>`. Canonical form:
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
   If the component does not receive props, use `FC<{}>` or simply do not annotate (does not infer `JSX.Element | null` automatically).

2. **The project's architecture wins over this skill's defaults.** Before proposing a folder structure, naming, or pattern, read `AGENTS.md`, `architecture.md`, `.context/*`, or the project's `README.md`. If the project already defines conventions (e.g., `app/` vs `src/app/`, atoms/molecules/organisms vs flat, modules by feature vs by layer, etc.), **those win**. This skill only contributes when the project does not have an explicit convention.

3. **Forms: native RHF validation by default.** Use `react-hook-form` built-in rules (`rules={{ required, minLength, pattern, validate }}`) or a resolver only if the user explicitly asks. **Do not propose Zod, Valibot, or Yup by default.** If the user asks for schema validation or the project already uses one, integrate it (Zod/Valibot/Yup are the official options supported by `@hookform/resolvers`).

4. **Official recommendation > personal preference.** If Expo/React/Shopify/SwMansion publish a guide, that is the source. If a practice contradicts "what we used to do", the current docs win.

5. **`expo-router` for new apps, React Navigation for legacy.** The default `create-expo-app` template uses expo-router. Migrating from React Navigation has an official guide; the reverse does not.

6. **Server state ≠ client state ≠ form state ≠ UI state.** Each category has its canonical tool. Mixing leads to unnecessary re-renders, cache bugs, spaghetti code.

7. **Secrets to `expo-secure-store`, never AsyncStorage.** It is an explicit rule of the official Expo Auth guide.

8. **Native permissions always with the `use*Permissions` hook from the module.** The `expo-permissions` package does not exist since SDK 48.

9. **Performance is measured in release builds, not in dev.** `console.log`, dev tools, and saturated JS thread distort any benchmark.

10. **Customize native via config plugins, never editing `android/`/`ios/` by hand.** It is lost with `expo prebuild --clean`.

11. **Before installing a library, verify in [reactnative.directory](https://reactnative.directory/) with `npx expo-doctor@latest`.** Especially critical in New Architecture (SDK 53+ default).

## Table of contents

| File | Covers |
|---|---|
| [`references/setup.md`](references/setup.md) | `create-expo-app`, `src/` structure, `app.json`/`app.config.ts`, Metro/Babel, TypeScript, path aliases |
| [`references/router.md`](references/router.md) | `expo-router` (file-based routing, layouts, modals, typed routes, deep linking, params) |
| [`references/state-and-data.md`](references/state-and-data.md) | TanStack Query, client state, forms (RHF + opt-in schema), local storage, DB, HTTP, auth |
| [`references/native-features.md`](references/native-features.md) | Camera, location, notifications, permissions (unified `use*Permissions` pattern) |
| [`references/performance.md`](references/performance.md) | Lists (FlashList vs FlatList), `expo-image`, Reanimated, New Architecture |
| [`references/deployment.md`](references/deployment.md) | EAS Build/Submit/Update/Workflows, testing (Jest, RNTL, Maestro), lint, debugging |

## Quick decisions by category

### How do I start a project?

```
npx create-expo-app@latest --template default
# (SDK 54 while it is the current branch)
# Canonical structure: src/app/* (routes) + src/components, src/hooks, src/constants
# Config: app.config.ts (not app.json) if you need types/auto-completion
```

> **Before generating files, read `AGENTS.md` / `architecture.md` of the project** (rule 2 above). If the project defines its own structure, replicate it.

See [`references/setup.md`](references/setup.md).

### How do I navigate?

- **Default:** `expo-router` with file-based routing in `src/app/`. Automatic deep linking.
- **Alternative:** `@react-navigation/native-stack` + `@react-navigation/bottom-tabs` (v7) — only if you need fine manual control or do not want universal deep linking.
- **Route typing:** `experiments.typedRoutes: true` in `app.json`.

See [`references/router.md`](references/router.md).

### How do I handle state?

| Need | Canonical tool |
|---|---|
| Data that comes from the server | `@tanstack/react-query` v5 |
| Shared UI state (1-2 values, changes little) | React Context API |
| Global client state, many updates | `zustand` (community consensus, no official pronouncement) |
| Form with validation | `react-hook-form` — **native validation by default**, schema validation only if the user asks |

> Expo does not prescribe a client state library. React official recommends `useState`+`useReducer`+`Context` for what is not server state.

See [`references/state-and-data.md`](references/state-and-data.md).

### How do I persist data?

| Need | Tool |
|---|---|
| Tokens, refresh tokens, secrets | `expo-secure-store` |
| Preferences, drafts, UI flags | `@react-native-async-storage/async-storage` or `react-native-mmkv` (sync, ~30× faster; requires `expo prebuild`) |
| Relational data, queries, joins | `expo-sqlite` + `drizzle-orm` |
| Reactive DB with sync engine | WatermelonDB (RN-only, overkill if it is just local CRUD) |

See [`references/state-and-data.md`](references/state-and-data.md).

### How do I authenticate?

- **Generic OAuth/OIDC** (GitHub, Okta, Auth0): `expo-auth-session` + `expo-crypto`.
- **Sign in with Apple** (iOS): `expo-apple-authentication` — **mandatory** if you have other third-party providers (App Store rule).
- **Google**: `@react-native-google-signin/google-signin` (paid for Credential Manager) or `react-native-nitro-google-signin` (free).
- **Tokens:** always `expo-secure-store`.

> Native OAuth + Google Sign-In require **Development Build** (not Expo Go).

See [`references/state-and-data.md`](references/state-and-data.md) §Auth.

### How do I access native features?

**Universal permissions pattern** (all `expo-*` modules follow it):

```tsx
const [permission, requestPermission] = useXxxPermissions();

if (permission === null) return <Loading />;
if (!permission.granted) {
  if (permission.canAskAgain) {
    return <Button title="Grant" onPress={requestPermission} />;
  }
  return <Button title="Open Settings" onPress={() => Linking.openURL('app-settings:')} />;
}
// use feature...
```

See [`references/native-features.md`](references/native-features.md).

### How do I optimize performance?

- **Lists > 50 items or variable length:** `@shopify/flash-list` v2 (New Arch). `FlatList` only if you know `getItemLayout` and the list is homogeneous.
- **Images:** `expo-image` (not RN's `<Image>`). BlurHash placeholder + `contentFit` + `recyclingKey` in lists.
- **Animations:** `react-native-reanimated` v4 (requires New Arch). Worklets plugin must go **last** in babel.
- **Debug:** Chrome DevTools + React DevTools + `expo-dev-client`. **Do not use Flipper** (deprecated by RN core).

See [`references/performance.md`](references/performance.md).

### How do I deploy?

- **Build:** `eas build --profile production` (cloud) or `eas build --local`.
- **Submit:** `eas submit` (auto-signs and uploads to stores).
- **OTA updates:** `expo-updates` + `eas update --branch production`. **Does NOT** change native code, permissions, or SDK.
- **CI/CD:** EAS Workflows (`.eas/workflows/*.yml`) — runs on managed infrastructure. Alternative: GitHub Actions.
- **Local dev:** `npx expo run:android` / `run:ios` (compiles native + Metro). JS only: `npx expo start`.

See [`references/deployment.md`](references/deployment.md).

### How do I test?

- **Unit/component:** `jest-expo` preset + `@testing-library/react-native`. **Not** `react-test-renderer` (deprecated in React 19+).
- **E2E (officially recommended):** **Maestro** (mobile.dev). Expo has a `maestro` job type in EAS Workflows.
- **Not official:** Detox (Expo does not recommend it in its current docs).

See [`references/deployment.md`](references/deployment.md) §Testing.

## Common errors this skill aims to prevent

| ❌ Anti-pattern | ✅ Correct | Source |
|---|---|---|
| Save tokens in AsyncStorage | `expo-secure-store` | [docs.expo.dev/guides/authentication](https://docs.expo.dev/guides/authentication/) |
| Edit `android/`/`ios/` by hand | Config plugin + `expo prebuild` | [docs.expo.dev/config-plugins](https://docs.expo.dev/config-plugins/introduction/) |
| Edit `babel.config.js` for things the preset already does | Only create `babel.config.js` if you need real customization; `npx expo customize babel.config.js` | [docs.expo.dev/versions/latest/config/babel](https://docs.expo.dev/versions/latest/config/babel/) |
| `eject` from Expo | **`expo eject` does not exist since SDK 46.** Use `expo prebuild` | [docs.expo.dev/llms.txt](https://docs.expo.dev/llms.txt) |
| Use `useAnimatedGestureHandler` | Gesture API v2 from Gesture Handler | [Reanimated 3→4 migration](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x) |
| Reanimated 3 with New Arch when 4 is available | Reanimated 4 | [Reanimated docs](https://docs.swmansion.com/react-native-reanimated/) |
| Assume `requestBackgroundPermissionsAsync` will show "Allow Once" dialog on iOS | Silently fails | [docs.expo.dev/versions/latest/sdk/location](https://docs.expo.dev/versions/latest/sdk/location/) |
| `getExpoPushTokenAsync` before `setNotificationChannelAsync` on Android 13+ | Create channel first | [docs.expo.dev/versions/latest/sdk/notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) |
| Path alias `@/*` without `tsconfigPaths` enabled | Enable it or Metro does not resolve | [docs.expo.dev/guides/typescript](https://docs.expo.dev/guides/typescript/) |
| `console.log` in production | `babel-plugin-transform-remove-console` | [reactnative.dev/docs/performance](https://reactnative.dev/docs/performance) |
| **`function Component() { ... }`** | **`const Component = () => { ... }`** | This skill's convention (rule 1) |
| **Propose Zod without the user asking** | **RHF built-in `rules={{ required, minLength, pattern, validate }}`** | This skill's convention (rule 3) |
| Invent conventions ignoring `AGENTS.md`/`architecture.md` | Read them first; replicate what they define | This skill's convention (rule 2) |

## Operative rules for the agent

1. **Before recommending a pattern, open the corresponding `references/` and verify against the official URL listed at the end of the block.** If the pattern you were about to propose does not appear, do not invent it — search the official docs first.
2. **Cite the URL** at the end of each specific technical recommendation (format: `[source](https://...)`).
3. **Read `AGENTS.md` / `architecture.md` of the project before proposing folder structure, naming, or imports.** If the project defines conventions, those win over this skill's defaults.
4. **Write components, screens, hooks, and internal methods as arrow functions.** Only use `function` for non-UI helpers/utils/pure functions.
5. **Do not propose Zod/Valibot/Yup by default in forms.** If the user explicitly asks or the project already uses one, integrate it.
6. **If the user asks something outside the skill's scope** (e.g., Flutter, native Swift, Android Kotlin, pure backend), respond briefly and suggest the appropriate skill or doc. Do not force this skill.
7. **If the user gives an explicit instruction that contradicts the official docs**, follow the user but warn about the trade-off in 1-2 sentences.
8. **For "what version of X should I use"**, always prioritize the latest visible on `docs.expo.dev/versions/latest/` or the package's branch on GitHub. If there is a recent breaking change (e.g., Reanimated 3→4), mention it.
9. **Do not install dependencies on your own.** Recommend the command `npx expo install <pkg>` and let the user run it.
10. **When mentioning a deprecated or non-existent package** (e.g., `expo-permissions`, `react-test-renderer` for React 19, `expo publish`), say explicitly that it no longer exists and why.

## Reference versions (verified against official docs, Aug 2026)

| Component | Current version |
|---|---|
| Expo SDK | 54 (this skill's target); docs show 57 as latest but 54 stable |
| React Native | 0.81+ (New Architecture default since SDK 53) |
| React | 19+ |
| expo-router | v5+ |
| TanStack Query | v5 |
| react-hook-form | v7+ |
| `@hookform/resolvers` | ^3.10 (required for Zod v4, if Zod is used) |
| Reanimated | 4.x (requires New Arch) |
| FlashList | v2.x |
| Drizzle ORM | compatible with `expo-sqlite` |
| jest-expo | latest stable |
| @testing-library/react-native | replaces `react-test-renderer` (React 19+) |
| Maestro | mobile.dev (officially recommended for E2E) |
| EAS CLI | ≥15 |

## How to extend this skill

If while using the skill you discover a new pattern (not documented here) or an important change in official docs, update the corresponding `references/` and, if the change affects an architectural decision listed above, also update this SKILL.md.
