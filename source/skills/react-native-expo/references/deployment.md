# Deployment, testing, lint and debugging

> **Official sources:** https://docs.expo.dev/build/introduction/ · https://docs.expo.dev/eas/ · https://docs.expo.dev/eas/json/ · https://docs.expo.dev/eas/workflows/introduction/ · https://docs.expo.dev/eas-update/introduction/ · https://docs.expo.dev/develop/unit-testing/ · https://docs.expo.dev/guides/local-app-development/ · https://docs.expo.dev/guides/using-eslint/ · https://docs.expo.dev/workflow/continuous-native-generation/

## 1. EAS (Expo Application Services)

Official services:
- **EAS Build** — signed iOS/Android binaries.
- **EAS Submit** — upload to App Store / Play Store.
- **EAS Update** — OTA updates.
- **EAS Workflows** — managed CI/CD.
- **EAS Hosting** — web + API routes.
- **EAS Metadata** (preview) — info for stores.
- **EAS Insights** (preview) — analytics.
- **EAS Observe** (beta) — performance monitoring.

## 2. `eas.json` schema

```json
{
  "cli": { "version": ">= 15.0.0", "appVersionSource": "remote" },
  "build": {
    "base": {
      "node": "12.13.0",
      "env": { "EXAMPLE_ENV": "example value" },
      "android": { "image": "default" },
      "ios": { "image": "latest" }
    },
    "development": {
      "extends": "base",
      "developmentClient": true,
      "env": { "ENVIRONMENT": "development" },
      "android": { "distribution": "internal", "withoutCredentials": true },
      "ios": { "simulator": true }
    },
    "staging": {
      "extends": "base",
      "env": { "ENVIRONMENT": "staging" },
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "extends": "base",
      "env": { "ENVIRONMENT": "production" },
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "android": { "track": "internal" },
      "ios": {
        "appleId": "john@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "AB12XYZ34S"
      }
    }
  }
}
```

**Official typical profiles:**
- `base` — common.
- `development` — dev client, no signature, iOS simulator.
- `staging` / `preview` — internal distribution (APK/ad-hoc).
- `production` — store.

## 3. Local build vs cloud

### Cloud (recommended)

```sh
eas build --profile production       # iOS or Android depending on default target
eas build --platform ios
eas build --platform android
eas build --local                    # build on your machine (uses docker)
```

### Local compile (Expo CLI)

```sh
npx expo run:android
npx expo run:ios
```

Older equivalent: `npx expo start --android` / `--ios` (deprecated).

**Behavior:**
- Compiles with local Android SDK / Xcode.
- Generates `android/` and `ios/` if they don't exist (runs `expo prebuild`).
- Installs the binary on device/emulator.
- Starts Metro.

**Android variants (SDK 54+):** `--variant debugOptimized` for faster iteration.

### Daily workflow

| Command | When |
|---|---|
| `npx expo run:android` / `run:ios` | First build, after adding a native lib, or changing a config plugin |
| `npx expo start` | JS/TS changes only |
| `eas build --profile preview` | Build for QA / TestFlight / internal track |
| `eas build --profile production` | Build for store |
| `eas build --local` | Local build (without uploading to cloud) |

## 4. Submit to stores

```sh
npm install --global eas-cli
eas build --auto-submit       # build + submit in one command
eas submit                    # submit an existing build
```

Automatically handles: code signing, universal links, iCloud, notifications (depending on config plugins).

## 5. OTA Updates — `expo-updates`

```sh
npx expo install expo-updates
eas update:configure
eas update --branch production --message "Fix login button alignment"
```

### Official limitations (critical)

> ❌ Changes to native code or native deps.
> ❌ Changes to permissions.
> ❌ Change of Expo SDK.
> ❌ Anything that requires a new binary.

### Channel in `eas.json` (links build ↔ updates)

```json
"production": { "extends": "base", "channel": "production" }
```

**Runtime versions** (`expo-android-runtime-version`, `expo-ios-runtime-version` or fingerprint) guarantee that updates only reach builds with compatible native code.

### JS API

```ts
import { useUpdates, checkForUpdateAsync, fetchUpdateAsync } from 'expo-updates';
```

> ⚠️ Classic Updates (`expo publish`) is **deprecated since Dec 2021**. Migrate to EAS Update.

## 6. CI/CD — EAS Workflows

EAS's native CI/CD system, runs on managed infrastructure (no need to maintain runners).

**Machines:**
- `linux-medium` (4 vCPU, 16 GB RAM)
- `linux-large` (8 vCPU, 32 GB RAM)
- `macos-medium` (5 cores, 20 GB RAM)
- `macos-large` (10 cores, 40 GB RAM)

**Pre-packaged jobs:** `build`, `submit`, `update`, `maestro`, `fingerprint`, `get-build`, `slack`.

**Workflow YAML** (`.eas/workflows/*.yml`):

```yaml
name: e2e-test-android

on:
  pull_request:
    branches: ['*']

jobs:
  build_android_for_e2e:
    type: build
    params:
      platform: android
      profile: e2e-test

  maestro_test:
    needs: [build_android_for_e2e]
    type: maestro
    params:
      build_id: ${{ needs.build_android_for_e2e.outputs.build_id }}
      flow_path: ['.maestro/home.yml', '.maestro/expand_test.yml']
```

**Official triggers:** `push`, `pull_request`, `label`, `schedule` (cron), `delete`, `app_store_connect`, `workflow_dispatch`.

**OTA update via workflow:**

```yaml
jobs:
  publish_update:
    type: update
    params:
      message: 'Fix login button alignment'
      channel: production
```

**GitHub Actions** (alternative): https://docs.expo.dev/eas-update/github-actions.md

## 7. Testing

### Unit/component: Jest + `jest-expo`

```sh
npx expo install jest-expo jest @types/jest --dev
```

**`package.json`** (preset + transformIgnorePatterns):

```json
{
  "scripts": { "test": "jest --watchAll" },
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)"
    ]
  }
}
```

Official variants for `pnpm` and `bun` (include `.pnpm` / `.bun` in the pattern).

### Component: `@testing-library/react-native`

```sh
npx expo install @testing-library/react-native --dev
```

> ⚠️ **`react-test-renderer` no longer supports React 19+**. Use `@testing-library/react-native`.

```tsx
import { render } from '@testing-library/react-native';
import HomeScreen from '@/app/index';

describe('<HomeScreen />', () => {
  test('renders correctly', async () => {
    const { getByText } = await render(<HomeScreen />);
    getByText('Welcome!');
  });
});
```

> *"For UI testing, Expo recommends E2E with Maestro over snapshot tests unitarios."*

**Coverage:**

```json
"jest": {
  "preset": "jest-expo",
  "collectCoverage": true,
  "collectCoverageFrom": [
    "**/*.{ts,tsx,js,jsx}",
    "!**/coverage/**",
    "!**/node_modules/**",
    "!**/babel.config.js",
    "!**/expo-env.d.ts",
    "!**/.expo/**"
  ]
}
```

**Recommended structure (official):**

```
__tests__/                            # global
  themed-text-test.tsx
src/components/
  themed-text.tsx
  __tests__/themed-text-test.tsx      # co-located
```

`jest-expo` also recognizes `*-test.ts|tsx` files.

### E2E: **Maestro (officially recommended)**

> ⚠️ **Current official recommendation:** Maestro (mobile.dev). Expo integrates it natively in EAS Workflows with a `maestro` job type.

Example flow (`.maestro/home.yml`):

```yaml
appId: dev.expo.eastestsexample
---
- launchApp
- assertVisible: 'Welcome!'
```

> **Maestro documentation:** https://docs.maestro.dev/

Detox does not appear recommended in the current official Expo documentation.

### Mocking native modules

The `jest-expo` preset automatically mocks the native part of the Expo SDK. For custom native modules, standard `jest.mock()` is used.

## 8. Lint and format

### ESLint (Flat config, SDK 53+)

```sh
npx expo lint
```

Installs deps + creates `eslint.config.js`:

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

### Official conventions

- `eslint-config-expo` is **minimal** (JSX, TS, globals, `.android.js/.ios.js/.web.js` platforms). It is **composed** with other rules.
- `metro.config.js` does not require extra Node globals in flat config (built-in).
- For `babel.config.js` you do need `globals.node` explicit.

## 9. Continuous Native Generation (CNG) / Prebuild

> Replaces the old "eject" / "managed vs bare". **Every Expo project now uses CNG.**

```sh
npx expo prebuild
npx expo prebuild --clean      # Delete and regenerate android/ios
npx expo prebuild --platform ios
```

**Known side effects:**
- Modifies `scripts` in `package.json` (`expo start --android` → `expo run:android`).
- Modifies `dependencies`.

**Recommended `.gitignore`:**

```
/android
/ios
```

**Customization:** via [config plugins](https://docs.expo.dev/config-plugins/introduction/). Do not edit `android/` / `ios/` by hand (it is lost on `--clean`).

## 10. Common LLM errors (official, `docs.expo.dev/llms.txt`)

- **`expo eject` does not exist** since SDK 46 (2022). Use `expo prebuild`.
- **`expo-cli` global is deprecated.** Use `npx expo`.
- **There is no "managed vs bare workflow".** All projects use the same architecture (CNG).
- React Native recommends Expo as the default way to create projects.

## 11. Key commands — cheat sheet

```sh
# Local dev
npx expo start                                  # Metro only
npx expo run:android --variant debugOptimized   # Android with fast debug
npx expo run:ios                                # iOS

# Build / Submit
eas login
eas build:configure
eas build --profile preview
eas build --profile production --platform ios
eas build --local
eas submit

# OTA
eas update:configure
eas update --branch production --message "..."

# CNG
npx expo prebuild
npx expo prebuild --clean

# Validation
npx expo install --check
npx expo-doctor@latest
npx expo config --type public

# Lint / Test
npx expo lint
npm test
```

## 12. Versioning

- **`expo-updates`** replaces `expo publish` (deprecated Dec 2021).
- **`react-test-renderer`** no longer supports React 19+. Use `@testing-library/react-native`.
- **Maestro** is the current official recommendation for E2E (not Detox).
- **Flipper is deprecated** by RN core. Replaced by React DevTools + Expo Dev Tools.
