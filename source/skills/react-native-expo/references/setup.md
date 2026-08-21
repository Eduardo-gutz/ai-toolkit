# Setup inicial — Expo SDK 54+

> **Fuentes oficiales:** https://docs.expo.dev/get-started/create-a-project/ · https://docs.expo.dev/get-started/start-developing/ · https://docs.expo.dev/workflow/configuration/ · https://docs.expo.dev/guides/typescript/ · https://docs.expo.dev/versions/latest/config/metro/ · https://docs.expo.dev/versions/latest/config/babel/
>
> **Antes de generar archivos:** lee `AGENTS.md` / `architecture.md` del proyecto. Si ya hay convenciones (estructura de carpetas, naming, imports), respítalas. Esta skill solo propone cuando el proyecto no define nada.

## 1. Crear el proyecto

```sh
npx create-expo-app@latest --template default
```

> Cita oficial: *"During the SDK 57 transition period, `create-expo-app@latest` without the `--template` flag creates an SDK 54 project. If you plan to use Expo Go on a physical device, use an SDK 54 project."*

Requisitos: Node.js LTS, npm/pnpm/yarn/bun. Funciona en macOS, Linux y Windows (Powershell + WSL 2).

Iniciar dev server:

```sh
npx expo start            # flags: --tunnel (LAN roto), --clear (limpia cache Metro)
# en la CLI: a (Android), i (iOS), w (web)
```

**Fast Refresh viene activado por default** (no requiere config).

## 2. Estructura de archivos canónica

La doc oficial de expo-router (`/router/basics/core-concepts/`) prescribe:

```
src
  app/
    _layout.tsx        # Root layout: inicialización (fonts, splash, providers)
    index.tsx          # /            initial route
    (group)/           # Route group (NO aparece en URL)
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
app.config.ts          # Raíz, junto a package.json
package.json
tsconfig.json
metro.config.js         # Solo si necesitas customizar
babel.config.js         # Solo si necesitas customizar
```

**Reglas explícitas de la doc:**
- **`src/app/` es exclusivamente para rutas y layouts.** Cualquier archivo aquí se interpreta como ruta.
- **Componentes, hooks, utils** van en `src/components`, `src/hooks`, `src/constants`.
- **Inicialización** (fonts, splash, providers) va en `src/app/_layout.tsx`.
- **Kebab-case lowercase** para nombres de archivo (`text-field.tsx`, no `TextField.tsx`).

> La doc oficial **NO prescribe** sub-estructura para `src/components/` (átomos/moléculas/etc.). Eso queda a criterio del design system.

> **Convención de código de esta skill:** componentes, screens y hooks se escriben como **arrow functions**. Helpers/utils/pure no-UI usan `function`.

## 3. `app.json` / `app.config.ts`

Tres formas soportadas (en orden de precedencia): `app.json` (estático), `app.config.js` (dinámico), `app.config.ts` (TS). **Si hay conflicto, el `.ts` gana sobre `.js`.**

### Mínimo viable

```json
{
  "expo": {
    "name": "My app",
    "slug": "my-app"
  }
}
```

### Con platforms + plugins + scheme

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

### `app.config.ts` (recomendado para types + lógica dinámica)

```ts
import 'tsx/cjs';
import { ExpoConfig, ConfigContext } from 'expo/config';

// helper puro (no UI) — usa function
const buildConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  slug: 'my-app',
  name: 'My App',
  experiments: { typedRoutes: true },
});

export default buildConfig;
```

> **Caveat oficial:** `Constants.expoConfig` expone todo **excepto** `ios.config`, `android.config`, `updates.codeSigningCertificate`, `updates.codeSigningMetadata`. **No incluir secretos en `app.config`.**

### Variables de entorno

Variables con prefijo `EXPO_PUBLIC_` se exponen al bundle del cliente (Metro las inyecta automáticamente). Para secretos, usa `eas env:create` y `process.env.X` solo en build time.

## 4. TypeScript

### `tsconfig.json` mínimo

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

> `tsconfigPaths` está habilitado por default (feature experimental). Deshabilitar con `"expo.experiments.tsconfigPaths": false`. **No soportado por `@expo/webpack-config`** (deprecated).

### Type-safe routing (expo-router)

```json
{
  "expo": {
    "experiments": { "typedRoutes": true }
  }
}
```

Genera `expo-env.d.ts` (debe ir en `.gitignore`). Aporta autocomplete en `<Link href>`, `useRouter`, `useLocalSearchParams`.

### TS en archivos de config

```sh
npx expo install tsx --dev
```

```js
// metro.config.js (entry en JS, delega a TS)
require('tsx/cjs');
module.exports = require('./metro.config.ts');
```

```ts
// app.config.ts (NO requiere tsx — Expo CLI lo procesa)
import { ExpoConfig, ConfigContext } from 'expo/config';

const config = ({ config }: ConfigContext): ExpoConfig => ({ ...config, slug: 'my-app' });

export default config;
```

## 5. Metro config

Default mínimo (`metro.config.js`):

```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
module.exports = config;
```

Hechos oficiales importantes:
- **CSS support** está habilitado por default (incluyendo `.module.css`).
- **Global CSS** debe importarse en el **root `_layout.tsx`** (cuando usas expo-router).
- **`.env` files** se cargan automáticamente.
- **On-demand filesystem** activo por default.
- **ES Module resolution** (SDK 53+) usa `package.json:exports`.
- **Magic import comment** (SDK 52+): `import(/* @metro-ignore */ './x.js')`.

Tras modificar `metro.config.js` → `npx expo start --clear`.

## 6. Babel config

**Babel se configura automáticamente vía `babel-preset-expo`.** No necesitas `babel.config.js` salvo personalización.

Para crearlo manualmente:

```sh
npx expo customize babel.config.js
```

Default generado:

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
```

**Tras modificar `babel.config.js` → `npx expo start --clear`** (cache de Babel se invalida).

## 7. ESLint + Prettier

```sh
npx expo lint          # SDK 53+ instala deps + crea eslint.config.js
```

Flat config (recomendado, SDK 53+):

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

## 8. Comandos del día a día

| Comando | Cuándo |
|---|---|
| `npx expo start` | Solo cambios JS/TS |
| `npx expo run:android` / `run:ios` | Primer build, tras agregar lib nativa, o cambiar config plugin |
| `npx expo prebuild` | Regenerar `android/` y `ios/` (CNG) |
| `npx expo prebuild --clean` | Borrar y regenerar nativo |
| `npx expo install <pkg>` | Instalar dependencia respetando versión del SDK |
| `npx expo install --check` | Verificar versiones vs SDK |
| `npx expo-doctor@latest` | Validar contra reactnative.directory |
| `npx expo config --type public` | Inspeccionar config final mergeada |

> **Errores comunes de LLMs** (lista oficial en `docs.expo.dev/llms.txt`):
> - **`expo eject` no existe** desde SDK 46 (2022). Usa `expo prebuild`.
> - **`expo-cli` global está deprecated.** Usa `npx expo`.
> - **No hay "managed vs bare workflow".** Todos los proyectos usan la misma arquitectura (CNG).

## 9. Convenciones de código de esta skill

Cuando generes código nuevo (componentes, screens, hooks, providers):

```tsx
import { FC, useState } from 'react';

// ✅ BIEN — componentes, screens y hooks como arrow functions con FC<Props>
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

// ✅ BIEN — hook custom como arrow function
type UseUserResult = { user: User | null; setUser: (u: User | null) => void };

const useUser = (): UseUserResult => {
  const [user, setUser] = useState<User | null>(null);
  return { user, setUser };
};

// ✅ BIEN — helpers puros no-UI como function tradicional
function formatPrice(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function parseJwt(token: string): JwtPayload | null {
  // ...
}

// ✅ BIEN — funciones dentro de un componente también son arrow
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

Reglas rápidas:
| Caso | Sintaxis |
|---|---|
| Componente / screen con props | `const X: FC<XProps> = (props) => { ... }` |
| Componente sin props | `const X: FC<{}> = () => { ... }` |
| Hook custom | `const useX = (...): UseXResult => { ... }` |
| Provider / Context | `const XProvider: FC<{ children: ReactNode }> = ({ children }) => { ... }` |
| Método dentro de componente | `const handleX = () => { ... }` |
| Handler inline | `onPress={() => ...}` |
| Helper puro / util no-UI | `function formatX() { ... }` |
| Validador puro / parser | `function parseJwt(token) { ... }` |
