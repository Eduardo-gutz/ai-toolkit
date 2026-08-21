# expo-router — File-based routing

> **Fuentes oficiales:** https://docs.expo.dev/router/introduction/ · https://docs.expo.dev/router/basics/core-concepts/ · https://docs.expo.dev/router/basics/notation/ · https://docs.expo.dev/router/basics/navigation-layouts/ · https://docs.expo.dev/router/basics/navigation/ · https://docs.expo.dev/router/advanced/stack/ · https://docs.expo.dev/router/advanced/modals/ · https://docs.expo.dev/router/reference/typed-routes/ · https://docs.expo.dev/router/reference/url-parameters/ · https://docs.expo.dev/linking/overview/
>
> **Convención de código de esta skill:** componentes, screens y hooks como arrow functions. Helpers/utils no-UI como `function`.

## 1. Posición oficial: usar expo-router por defecto

> *"We recommend using Expo Router for all the features described above [deep linking, automatic, native, shareable, optimized, universal]. With other navigation libraries, you might have to implement your own strategies for some of these features."*

Comparativa con React Navigation:

| Aspecto | expo-router | React Navigation v7 |
|---|---|---|
| Routing | File-based (`src/app/*`) | Manual (`<Stack.Navigator>`) |
| Deep linking | Automático | Manual (`linking` prop) |
| Typed routes | Built-in (`experiments.typedRoutes`) | Manual con generics |
| Static rendering (web) | Built-in (SSG) | No built-in |
| Async routes / bundle splitting | Built-in (`@expo/metro-runtime`) | No built-in |

**Regla:** nueva app universal (iOS + Android + Web) → Expo Router. Solo native + control fino → React Navigation v7.

## 2. Las 7 reglas del file-based routing

1. **Todas las pantallas viven en `src/app/`.**
2. **Cada pantalla tiene una URL** (universal deep linking).
3. **`index.tsx` es la initial route** (el primer `index.tsx` que match `/`).
4. **`_layout.tsx` reemplaza a `App.tsx`** — aquí va inicialización (fonts, providers, splash).
5. **Default template usa platform-specific tabs.** Android/iOS usan Native tabs; web usa Custom tabs de `expo-router/ui`. Se logra con extensions (`*.native.tsx` vs `*.tsx`).
6. **Componentes no-navegación viven fuera de `src/app/`** (`src/components`, `src/hooks`, `src/constants`).
7. **Para stack/tabs/drawer:** ver `references/router.md` §Layouts y `/router/advanced/`.

## 3. Notación de archivos

| Notación | Significado | Ejemplo |
|---|---|---|
| `home.tsx` | Static route | `/feed/favorites` |
| `[userName].tsx` | Dynamic route | `/evanbacon` → `useLocalSearchParams()` |
| `[...slug].tsx` | Catch-all (rest) | `/docs/a/b/c` → `slug: ['a','b','c']` |
| `(home)/` | Route group (no aparece en URL) | `(home)/settings.tsx` ⇒ `/settings` |
| `index.tsx` | Default route del directorio | `/profile` |
| `_layout.tsx` | Layout file (Stack/Tabs/Slot) | — |
| `+not-found.tsx` | Catch-all para URLs inválidas | — |
| `+html.tsx` | HTML boilerplate para web | — |
| `+native-intent.tsx` | Custom intent linking (Android) | — |
| `+middleware.ts` | Pre-render middleware (web) | — |

> ⚠️ `/assets` está reservado por Metro y expo-router. Ver https://docs.expo.dev/router/reference/reserved-paths.md

## 4. Layouts: Stack, Tabs, Slot

### Root layout patrón oficial

```tsx
// src/app/_layout.tsx
import { FC, useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

const RootLayout: FC<{}> = () => {
  const [loaded] = useFonts({ SpaceMono: require('@/assets/fonts/SpaceMono-Regular.ttf') });

  useEffect(() => {
    if (loaded) SplashScreen.hide();
  }, [loaded]);

  if (!loaded) return null;
  return <Stack />;
};

export default RootLayout;
```

### Stack

```tsx
// src/app/products/_layout.tsx
import { FC } from 'react';
import { Stack } from 'expo-router';

const ProductsStackLayout: FC<{}> = () => (
  <Stack>
    <Stack.Screen name="[productId]" options={{ headerShown: false }} />
  </Stack>
);

export default ProductsStackLayout;
```

> *"The `Stack` component implements React Navigation's native stack and can use the same screen options."*

### Tabs (default template — platform-specific)

```
src/components/
  app-tabs.native.tsx   # NativeTabs (Android/iOS)
  app-tabs.tsx          # Tabs/TabList/TabTrigger/TabSlot (web)
```

```tsx
// app-tabs.native.tsx
import { FC } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

const AppTabs: FC<{}> = () => (
  <NativeTabs>
    <NativeTabs.Trigger name="index">
      <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/home.png')} />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="search">
      <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/search.png')} />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="profile">
      <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/profile.png')} />
    </NativeTabs.Trigger>
  </NativeTabs>
);

export default AppTabs;
```

```tsx
// app-tabs.tsx
import { FC } from 'react';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';

const AppTabs: FC<{}> = () => (
  <Tabs>
    <TabSlot />
    <TabList>
      <TabTrigger name="index" href="/">Home</TabTrigger>
      <TabTrigger name="explore" href="/explore">Explore</TabTrigger>
    </TabList>
  </Tabs>
);

export default AppTabs;
```

### Slot (layout sin navegador — header/footer fijo)

```tsx
// src/app/_layout.tsx
import { FC } from 'react';
import { Slot } from 'expo-router';

const LayoutWithHeader: FC<{}> = () => (
  <>
    <Header />
    <Slot />
    <Footer />
  </>
);

export default LayoutWithHeader;
```

## 5. Navegación: Link, useRouter, params

### `useRouter` (imperativo)

```tsx
// src/app/index.tsx
import { FC } from 'react';
import { useRouter } from 'expo-router';
import { Button } from 'react-native';

const HomeScreen: FC<{}> = () => {
  const router = useRouter();
  return <Button title="Go to About" onPress={() => router.navigate('/about')} />;
};

export default HomeScreen;
```

### `<Link>` (declarativo)

```tsx
import { FC } from 'react';
import { Link } from 'expo-router';

const Links: FC<{}> = () => (
  <>
    <Link href="/about">About</Link>
    <Link href="/other" asChild>
      <Pressable><Text>Home</Text></Pressable>
    </Link>
  </>
);

export default Links;
```

### Rutas dinámicas

```tsx
<Link href={{ pathname: '/user/[id]', params: { id: 'bacon' } }}>View user</Link>
```

### Query params

```tsx
<Link href="/users?limit=20">View users</Link>
<Link href={{ pathname: '/users', params: { limit: 20 } }}>View users</Link>
```

### Actualizar params sin navegar

```tsx
<Pressable onPress={() => router.setParams({ limit: 50 })}>View more</Pressable>
```

### Redirect

```tsx
import { FC } from 'react';
import { Redirect } from 'expo-router';

const Page: FC<{}> = () => <Redirect href="/about" />;
export default Page;
```

### Prefetch

```tsx
<Link href="/about" prefetch />
```

> **Limitaciones del prefetch:** el screen preloaded no puede usar `router` imperativo, ni `useNavigation().setOptions()`, ni listeners de focus/tabPress.

### Initial route en deep linking

```tsx
// src/app/products/_layout.tsx
export const unstable_settings = { initialRouteName: 'index' };
```

### Acciones imperativas del stack (SDK 55+)

```ts
router.navigate(url)         // push o unwind
router.push(url)            // siempre push
router.replace(url)         // reemplaza el actual
router.back()               // pop
router.dismiss(count?)      // dismiss el último del stack más cercano
router.dismissTo(href)      // dismiss hasta href (router 4.0.8+)
router.dismissAll()         // equivalente a popToTop
router.canDismiss()         // boolean
router.canGoBack()          // boolean (usado en modal web)
```

### Custom `getId` para múltiples instancias del mismo screen

```tsx
<Stack.Screen name="[profile]" getId={({ params }) => String(Date.now())} />
```

## 6. URL parameters: local vs global

- **Route parameters** (`[user].tsx`): parte del path; nunca nullish.
- **Search parameters** (`?query=...`): opcionales.
- `useLocalSearchParams()` → re-render solo cuando la URL del componente cambia. **(preferido)**
- `useGlobalSearchParams()` → re-render en cada cambio de URL global; puede afectar performance.

```tsx
// src/app/users/[id].tsx
import { FC } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

const UserScreen: FC<{}> = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>User: {id}</Text>;
};

export default UserScreen;
```

```tsx
// hash (#)
const { '#': hash } = useLocalSearchParams<{ '#': string }>();
```

**Parámetros reservados** (no usar): `screen`, `params`, `initial`, `state`.

## 7. Modales

```tsx
// src/app/_layout.tsx
import { FC } from 'react';
import { Stack } from 'expo-router';

const RootLayout: FC<{}> = () => (
  <Stack>
    <Stack.Screen name="index" />
    <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
  </Stack>
);

export default RootLayout;
```

**`presentation` opciones oficiales:**
- `card` (default)
- `modal`
- `transparentModal`
- `containedModal` (iOS: `UIModalPresentationCurrentContext`)
- `containedTransparentModal`
- `fullScreenModal`
- `formSheet` (detents configurables)

> *"On Android, the modal slides on top… On iOS, the modal slides from the bottom… On web, the modal is presented as a separate route, and the dismiss behavior has to be provided manually using `router.canGoBack()`."*

### Form sheet (iOS / Android)

```tsx
<Stack.Screen
  name="modal"
  options={{
    presentation: 'formSheet',
    sheetAllowedDetents: [0.25, 0.5, 1],
    sheetInitialDetentIndex: 1,
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
    sheetLargestUndimmedDetentIndex: 1,
  }}
/>
```

> *"Android supports a maximum of 3 detents. iOS accepts any number of detents."*

`fitToContents` sizing no permite `flex: 1`. A partir de SDK 55, `flex: 1` funciona en iOS con detents numéricos.

### Anchor (`unstable_settings`)

> *"Without anchoring, the screen behind the modal will be wiped away, leaving no navigation context."*

```tsx
// src/app/products/_layout.tsx
export const unstable_settings = { anchor: 'index' };
```

## 8. Typed Routes

```json
{ "expo": { "experiments": { "typedRoutes": true } } }
```

Genera `expo-env.d.ts` (gitignored). Aporta autocomplete en `<Link>`, `useRouter`, `useLocalSearchParams`.

```tsx
✅ <Link href="/about" />
✅ <Link href="/user/1" />
✅ <Link href={`/user/${id}`} />
✅ <Link href={{ pathname: "/user/[id]", params: { id: 1 } }} />
❌ <Link href="/usser/1" />        // ruta inválida
❌ <Link href="/user/[id]" />      // dinámico debe ser object
❌ <Link href={{ pathname: "/user/[id]", params: { _id: 1 } }} />  // params con key inválida
```

**Rutas relativas no están soportadas en typed routes** — usar `useSegments()`.

Tipos de query params (no se generan automáticamente):

```tsx
const { query, profile, search } = useLocalSearchParams<
  '/[profile]/[...search]',
  { query?: string }
>();
```

## 9. Deep linking

- **Deep links:** scheme propio, e.g. `myapp://users/evanbacon`
- **Universal Links (iOS)** / **App Links (Android):** asociación con dominio https. Requieren domain verification files.

> *"To implement any of the above Linking strategies, we recommend using Expo Router since deep linking is automatically enabled for all of your app's screens."*

Para custom intent linking (Android) → archivo `+native-intent.tsx`.

## 10. Platform-specific modules

- `Component.native.tsx` → Android/iOS
- `Component.tsx` → todas (incl. web)
- `Component.web.ts` → solo web
- `Component.ios.tsx` → solo iOS
- `Component.android.tsx` → solo Android
- Mismo patrón aplica a CSS e imágenes (Metro resuelve por extensión).

## 11. Errores comunes

| Problema | Solución oficial |
|---|---|
| Large title no colapsa al hacer scroll | El `ScrollView`/`FlatList` debe ser **primer hijo** del screen. Si necesita wrapper, `collapsable={false}` |
| Flash blanco entre screens | Falta `ThemeProvider` en root layout |
| iOS 26 "Liquid Glass" molestando | Opt-out con `UIDesignRequiresCompatibility=true` en `ios.infoPlist`, o usa `expo-router/js-stack` |
| Rutas relativas con typed routes | No soportadas. Usa `useSegments()` para construir rutas dinámicas |
| DOM component no recibe `usePathname()` | Léelo fuera y pásalo como prop |
| `"react-native version mismatch"` | `npx expo install --check` o `npx expo-doctor@latest` |
| Empty header en stack después de reiniciar | Falta `initialRouteName` en `unstable_settings` del layout del stack |
| Cambios a `babel.config`/`metro.config` no aplican | `npx expo start --clear` |

## 12. Cuándo usar React Navigation v7 en su lugar

- Necesitas control manual fino (custom transitions, gesture composition compleja, deep state machines de navegación).
- No te importa web / deep linking universal.
- Migras una app existente desde RN CLI (no Expo) que ya usa React Navigation.

Snippet mínimo oficial v7 (Static API, recomendada):

```tsx
import { FC } from 'react';
import { createStaticNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';

const RootStack = createNativeStackNavigator({
  screens: {
    Home: createNativeStackScreen({ screen: HomeScreen }),
    Profile: createNativeStackScreen({ screen: ProfileScreen }),
  },
});

const Navigation: FC<{}> = () => {
  const nav = createStaticNavigation(RootStack);
  return nav;
};

export default Navigation;
```

Migración RN → expo-router tiene guía oficial paso a paso: https://docs.expo.dev/router/migrate/from-react-navigation/.
