# Initial setup — Expo SDK 54+

> **Official sources:** https://docs.expo.dev/get-started/create-a-project/ · https://docs.expo.dev/get-started/start-developing/ · https://docs.expo.dev/workflow/configuration/ · https://docs.expo.dev/guides/typescript/ · https://docs.expo.dev/versions/latest/config/metro/ · https://docs.expo.dev/versions/latest/config/babel/
>
> **Before generating files:** read `AGENTS.md` / `architecture.md` of the project. If conventions already exist (folder structure, naming, imports), respect them. This skill only proposes when the project does not define anything.

## 1. Create the project

```sh
npx create-expo-app@latest --template default
```

> Official quote: *"During the SDK 57 transition period, `create-expo-app@latest` without the `--template` flag creates an SDK 54 project. If you plan to use Expo Go on a physical device, use an SDK 54 project."*

Requirements: Node.js LTS, npm/pnpm/yarn/bun. Works on macOS, Linux, and Windows (Powershell + WSL 2).

Start the dev server:

```sh
npx expo start            # flags: --tunnel (broken LAN), --clear (clears Metro cache)
# in the CLI: a (Android), i (iOS), w (web)
```

**Fast Refresh comes enabled by default** (no config required).

## 2. Canonical file structure

The official expo-router docs (`/router/basics/core-concepts/`) prescribe:

```
src
  app/
    _layout.tsx        # Root layout: initialization (fonts, splash, providers)
    index.tsx          # /            initial route
    (group)/           # Route group (does NOT appear in URL)
      settings.tsx     # /settings
    [param].tsx        # Dynamic route
    [...slug].tsx      # Catch-all
    +not-found.tsx     # 404 catch-all
  components/
    app-tabs.native.tsx   # Native tabs (Android/iOS)
    app-tabs.tsx          # Custom tabs (web)
    themed-text.tsx
    toolbar.tsx
  hooks/
  constants/
  assets/
    fonts/
    images/
app.config.ts          # Root, next to package.json
package.json
tsconfig.json
metro.config.js         # Only if you need to customize
babel.config.js         # Only if you need to customize
```

**Explicit rules from the docs:**
- **`src/app/` is exclusively for routes and layouts.** Any file here is interpreted as a route.
- **Components, hooks, utils** go in `src/components`, `src/hooks`, `src/constants`.
- **Initialization** (fonts, splash, providers) goes in `src/app/_layout.tsx`.
- **Lowercase kebab-case** for file names (`text-field.tsx`, not `TextField.tsx`).

> The official docs **do not prescribe** a sub-structure for `src/components/` (atoms/molecules/etc.). That is up to the design system.

> **This skill's code convention:** components, screens, and hooks are written as **arrow functions**. Helpers/utils/pure non-UI use `function`.

## 3. `app.json` / `app.config.ts`

Three supported forms (in order of precedence): `app.json` (static), `app.config.js` (dynamic), `app.config.ts` (TS). **If there is a conflict, the `.ts` wins over `.js`.**

### Minimum viable

```json
{
  "expo": {
    "name": "My app",
    "slug": "my-app"
  }
}
```

### With platforms + plugins + scheme

```json
{
  "expo": {
    "name": "My app",
    "slug": "my-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "myapp",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "bundleIdentifier": "com.example.myapp",
      "supportsTablet": true
    },
    "android": {
      "package": "com.example.myapp",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/favicon.png"
    },
    "plugins": ["expo-router", "expo-font", "expo-splash-screen"]
  }
}
```

### `app.config.ts` (recommended for types + dynamic logic)

```ts
import 'tsx/cjs';
import { ExpoConfig, ConfigContext } from 'expo/config';

// pure helper (no UI) — uses function
const buildConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  slug: 'my-app',
  name: 'My App',
  experiments: { typedRoutes: true },
});

export default buildConfig;
```

> **Official caveat:** `Constants.expoConfig` exposes everything **except** `ios.config`, `android.config`, `updates.codeSigningCertificate`, `updates.codeSigningMetadata`. **Do not include secrets in `app.config`.**

### Environment variables

Variables prefixed with `EXPO_PUBLIC_` are exposed to the client bundle (Metro injects them automatically). For secrets, use `eas env:create` and `process.env.X` only at build time.

## 4. TypeScript

### Minimum `tsconfig.json`

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
```

### Path aliases (`@/*` → `src/*`)

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

> `tsconfigPaths` is enabled by default (experimental feature). Disable with `"expo.experiments.tsconfigPaths": false`. **Not supported by `@expo/webpack-config`** (deprecated).

### Type-safe routing (expo-router)

```json
{
  "expo": {
    "experiments": { "typedRoutes": true }
  }
}
```

Generates `expo-env.d.ts` (should be in `.gitignore`). Provides autocomplete in `<Link href>`, `useRouter`, `useLocalSearchParams`.

### TS in config files

```sh
npx expo install tsx --dev
```

```js
// metro.config.js (entry in JS, delegates to TS)
require('tsx/cjs');
module.exports = require('./metro.config.ts');
```

```ts
// app.config.ts (does NOT require tsx — Expo CLI processes it)
import { ExpoConfig, ConfigContext } from 'expo/config';

const config = ({ config }: ConfigContext): ExpoConfig => ({ ...config, slug: 'my-app' });

export default config;
```

## 5. Metro config

Minimum default (`metro.config.js`):

```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
module.exports = config;
```

Important official facts:
- **CSS support** is enabled by default (including `.module.css`).
- **Global CSS** must be imported in the **root `_layout.tsx`** (when using expo-router).
- **`.env` files** load automatically.
- **On-demand filesystem** is active by default.
- **ES Module resolution** (SDK 53+) uses `package.json:exports`.
- **Magic import comment** (SDK 52+): `import(/* @metro-ignore */ './x.js')`.

After modifying `metro.config.js` → `npx expo start --clear`.

## 6. Babel config

**Babel is configured automatically via `babel-preset-expo`.** You do not need `babel.config.js` unless customizing.

To create it manually:

```sh
npx expo customize babel.config.js
```

Default generated:

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
```

**After modifying `babel.config.js` → `npx expo start --clear`** (Babel cache is invalidated).

## 7. ESLint + Prettier

```sh
npx expo lint          # SDK 53+ installs deps + creates eslint.config.js
```

Flat config (recommended, SDK 53+):

```js
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  prettier,
  { ignores: ['dist/*'] },
]);
```

Legacy (SDK ≤52):

```json
{ "eslintConfig": { "extends": ["expo", "prettier"] } }
```

## 8. Day-to-day commands

| Command | When |
|---|---|
| `npx expo start` | JS/TS changes only |
| `npx expo run:android` / `run:ios` | First build, after adding a native lib, or changing a config plugin |
| `npx expo prebuild` | Regenerate `android/` and `ios/` (CNG) |
| `npx expo prebuild --clean` | Delete and regenerate native |
| `npx expo install <pkg>` | Install dependency respecting the SDK version |
| `npx expo install --check` | Verify versions vs SDK |
| `npx expo-doctor@latest` | Validate against reactnative.directory |
| `npx expo config --type public` | Inspect final merged config |

> **Common LLM errors** (official list at `docs.expo.dev/llms.txt`):
> - **`expo eject` does not exist** since SDK 46 (2022). Use `expo prebuild`.
> - **`expo-cli` global is deprecated.** Use `npx expo`.
> - **There is no "managed vs bare workflow".** All projects use the same architecture (CNG).

## 9. This skill's code conventions

When you generate new code (components, screens, hooks, providers):

```tsx
import { FC, useState } from 'react';

// ✅ GOOD — components, screens, and hooks as arrow functions with FC<Props>
type HomeScreenProps = {
  userId: string;
  onPressItem?: (id: string) => void;
};

const HomeScreen: FC<HomeScreenProps> = ({ userId, onPressItem }) => {
  const router = useRouter();

  const handlePress = () => {
    onPressItem?.(userId);
    router.push(`/profile/${userId}`);
  };

  return <Pressable onPress={handlePress}><Text>{userId}</Text></Pressable>;
};

export default HomeScreen;

// ✅ GOOD — custom hook as arrow function
type UseUserResult = { user: User | null; setUser: (u: User | null) => void };

const useUser = (): UseUserResult => {
  const [user, setUser] = useState<User | null>(null);
  return { user, setUser };
};

// ✅ GOOD — pure non-UI helpers as traditional function
function formatPrice(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function parseJwt(token: string): JwtPayload | null {
  // ...
}

// ✅ GOOD — functions inside a component are also arrow
type CheckoutScreenProps = {
  items: CartItem[];
};

const CheckoutScreen: FC<CheckoutScreenProps> = ({ items }) => {
  const handlePay = async () => {
    const total = formatPrice(items.reduce((s, i) => s + i.price, 0));
    await api.post('/pay', { total });
  };

  return <Pressable onPress={handlePay}><Text>Pay</Text></Pressable>;
};

export default CheckoutScreen;
```

Quick rules:
| Case | Syntax |
|---|---|
| Component / screen with props | `const X: FC<XProps> = (props) => { ... }` |
| Component without props | `const X: FC<{}> = () => { ... }` |
| Custom hook | `const useX = (...): UseXResult => { ... }` |
| Provider / Context | `const XProvider: FC<{ children: ReactNode }> = ({ children }) => { ... }` |
| Method inside a component | `const handleX = () => { ... }` |
| Inline handler | `onPress={() => ...}` |
| Pure helper / non-UI util | `function formatX() { ... }` |
| Pure validator / parser | `function parseJwt(token) { ... }` |
