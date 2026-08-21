# Deployment, testing, lint y debugging

> **Fuentes oficiales:** https://docs.expo.dev/build/introduction/ · https://docs.expo.dev/eas/ · https://docs.expo.dev/eas/json/ · https://docs.expo.dev/eas/workflows/introduction/ · https://docs.expo.dev/eas-update/introduction/ · https://docs.expo.dev/develop/unit-testing/ · https://docs.expo.dev/guides/local-app-development/ · https://docs.expo.dev/guides/using-eslint/ · https://docs.expo.dev/workflow/continuous-native-generation/

## 1. EAS (Expo Application Services)

Servicios oficiales:
- **EAS Build** — binarios iOS/Android firmados.
- **EAS Submit** — subida a App Store / Play Store.
- **EAS Update** — OTA updates.
- **EAS Workflows** — CI/CD managed.
- **EAS Hosting** — web + API routes.
- **EAS Metadata** (preview) — info para stores.
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

**Perfiles típicos oficiales:**
- `base` — comunes.
- `development` — dev client, sin firma, simulator iOS.
- `staging` / `preview` — internal distribution (APK/ad-hoc).
- `production` — store.

## 3. Build local vs cloud

### Cloud (recomendado)

```sh
eas build --profile production       # iOS o Android según target por default
eas build --platform ios
eas build --platform android
eas build --local                    # build en tu máquina (usa docker)
```

### Compilar local (Expo CLI)

```sh
npx expo run:android
npx expo run:ios
```

Equivalente antiguo: `npx expo start --android` / `--ios` (deprecated).

**Comportamiento:**
- Compila con Android SDK / Xcode locales.
- Genera `android/` y `ios/` si no existen (corre `expo prebuild`).
- Instala el binario en device/emulator.
- Arranca Metro.

**Variantes Android (SDK 54+):** `--variant debugOptimized` para iteración más rápida.

### Workflow diario

| Comando | Cuándo |
|---|---|
| `npx expo run:android` / `run:ios` | Primer build, tras agregar lib nativa, o cambiar config plugin |
| `npx expo start` | Solo cambios JS/TS |
| `eas build --profile preview` | Build para QA / TestFlight / internal track |
| `eas build --profile production` | Build para store |
| `eas build --local` | Build local (sin subir a cloud) |

## 4. Submit a stores

```sh
npm install --global eas-cli
eas build --auto-submit       # build + submit en un solo comando
eas submit                    # submit de un build existente
```

Maneja automáticamente: code signing, universal links, iCloud, notifications (según config plugins).

## 5. OTA Updates — `expo-updates`

```sh
npx expo install expo-updates
eas update:configure
eas update --branch production --message "Fix login button alignment"
```

### Limitaciones oficiales (crítico)

> ❌ Cambios a native code o native deps.
> ❌ Cambios a permissions.
> ❌ Cambio de Expo SDK.
> ❌ Cualquier cosa que requiera nuevo binary.

### Channel en `eas.json` (vincula build ↔ updates)

```json
"production": { "extends": "base", "channel": "production" }
```

**Runtime versions** (`expo-android-runtime-version`, `expo-ios-runtime-version` o fingerprint) garantizan que updates solo lleguen a builds con código nativo compatible.

### API JS

```ts
import { useUpdates, checkForUpdateAsync, fetchUpdateAsync } from 'expo-updates';
```

> ⚠️ Classic Updates (`expo publish`) está **deprecated desde dic-2021**. Migrar a EAS Update.

## 6. CI/CD — EAS Workflows

Sistema CI/CD nativo de EAS, corre en infraestructura managed (no requiere mantener runners).

**Máquinas:**
- `linux-medium` (4 vCPU, 16 GB RAM)
- `linux-large` (8 vCPU, 32 GB RAM)
- `macos-medium` (5 cores, 20 GB RAM)
- `macos-large` (10 cores, 40 GB RAM)

**Jobs pre-empaquetados:** `build`, `submit`, `update`, `maestro`, `fingerprint`, `get-build`, `slack`.

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

**Triggers oficiales:** `push`, `pull_request`, `label`, `schedule` (cron), `delete`, `app_store_connect`, `workflow_dispatch`.

**Actualización OTA vía workflow:**

```yaml
jobs:
  publish_update:
    type: update
    params:
      message: 'Fix login button alignment'
      channel: production
```

**GitHub Actions** (alternativa): https://docs.expo.dev/eas-update/github-actions.md

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

Variantes oficiales para `pnpm` y `bun` (incluyen `.pnpm` / `.bun` en el patrón).

### Component: `@testing-library/react-native`

```sh
npx expo install @testing-library/react-native --dev
```

> ⚠️ **`react-test-renderer` ya no soporta React 19+**. Usar `@testing-library/react-native`.

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

**Estructura recomendada (oficial):**

```
__tests__/                            # global
  themed-text-test.tsx
src/components/
  themed-text.tsx
  __tests__/themed-text-test.tsx      # co-located
```

`jest-expo` también reconoce archivos `*-test.ts|tsx`.

### E2E: **Maestro (oficial recomendado)**

> ⚠️ **Recomendación oficial actual:** Maestro (mobile.dev). Expo lo integra nativamente en EAS Workflows con un job type `maestro`.

Ejemplo flow (`.maestro/home.yml`):

```yaml
appId: dev.expo.eastestsexample
---
- launchApp
- assertVisible: 'Welcome!'
```

> **Documentación Maestro:** https://docs.maestro.dev/

Detox no aparece recomendado en la documentación oficial actual de Expo.

### Mocking de módulos nativos

El preset `jest-expo` mockea automáticamente la parte nativa del SDK Expo. Para módulos nativos custom, se usa `jest.mock()` estándar.

## 8. Lint y formato

### ESLint (Flat config, SDK 53+)

```sh
npx expo lint
```

Instala deps + crea `eslint.config.js`:

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

### Convenciones oficiales

- `eslint-config-expo` es **mínimo** (JSX, TS, globals, plataformas `.android.js/.ios.js/.web.js`). Se **compone** con otras reglas.
- `metro.config.js` no requiere Node globals extra en flat config (built-in).
- Para `babel.config.js` sí se necesita `globals.node` explícito.

## 9. Continuous Native Generation (CNG) / Prebuild

> Sustituye al antiguo "eject" / "managed vs bare". **Todo proyecto Expo usa CNG ahora.**

```sh
npx expo prebuild
npx expo prebuild --clean      # Borra y regenera android/ios
npx expo prebuild --platform ios
```

**Side effects conocidos:**
- Modifica `scripts` en `package.json` (`expo start --android` → `expo run:android`).
- Modifica `dependencies`.

**`.gitignore` recomendado:**

```
/android
/ios
```

**Customization:** vía [config plugins](https://docs.expo.dev/config-plugins/introduction/). No modificar `android/` / `ios/` a mano (se pierde en `--clean`).

## 10. Errores comunes de LLMs (oficial, `docs.expo.dev/llms.txt`)

- **`expo eject` no existe** desde SDK 46 (2022). Usar `expo prebuild`.
- **`expo-cli` global está deprecated.** Usar `npx expo`.
- **No hay "managed vs bare workflow".** Todos los proyectos usan la misma arquitectura (CNG).
- React Native recomienda Expo como default way de crear proyectos.

## 11. Comandos clave — cheat sheet

```sh
# Dev local
npx expo start                                  # Metro only
npx expo run:android --variant debugOptimized   # Android con debug rápido
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

# Validación
npx expo install --check
npx expo-doctor@latest
npx expo config --type public

# Lint / Test
npx expo lint
npm test
```

## 12. Versionado

- **`expo-updates`** reemplaza `expo publish` (dep. dic-2021).
- **`react-test-renderer`** ya no soporta React 19+. Usar `@testing-library/react-native`.
- **Maestro** es la recomendación oficial actual para E2E (no Detox).
- **Flipper está deprecado** por RN core. Reemplazado por React DevTools + Expo Dev Tools.
