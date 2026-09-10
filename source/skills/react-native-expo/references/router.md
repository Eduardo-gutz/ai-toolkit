# expo-router — File-based routing

> **Official sources:** https://docs.expo.dev/router/introduction/ · https://docs.expo.dev/router/basics/core-concepts/ · https://docs.expo.dev/router/basics/notation/ · https://docs.expo.dev/router/basics/navigation-layouts/ · https://docs.expo.dev/router/basics/navigation/ · https://docs.expo.dev/router/advanced/stack/ · https://docs.expo.dev/router/advanced/modals/ · https://docs.expo.dev/router/reference/typed-routes/ · https://docs.expo.dev/router/reference/url-parameters/ · https://docs.expo.dev/linking/overview/
>
> **This skill's code convention:** components, screens, and hooks as arrow functions. Helpers/utils non-UI as `function`.

## 1. Official position: use expo-router by default

> *"We recommend using Expo Router for all the features described above [deep linking, automatic, native, shareable, optimized, universal]. With other navigation libraries, you might have to implement your own strategies for some of these features."*

Comparison with React Navigation:

| Aspect | expo-router | React Navigation v7 |
|---|---|---|
| Routing | File-based (`src/app/*`) | Manual (`<Stack.Navigator>`) |
| Deep linking | Automatic | Manual (`linking` prop) |
| Typed routes | Built-in (`experiments.typedRoutes`) | Manual with generics |
| Static rendering (web) | Built-in (SSG) | Not built-in |
| Async routes / bundle splitting | Built-in (`@expo/metro-runtime`) | Not built-in |

**Rule:** new universal app (iOS + Android + Web) → Expo Router. Only native + fine control → React Navigation v7.

## 2. The 7 rules of file-based routing

1. **All screens live in `src/app/`.**
2. **Each screen has a URL** (universal deep linking).
3. **`index.tsx` is the initial route** (the first `index.tsx` that matches `/`).
4. **`_layout.tsx` replaces `App.tsx`** — initialization (fonts, providers, splash) goes here.
5. **Default template uses platform-specific tabs.** Android/iOS use Native tabs; web uses Custom tabs from `expo-router/ui`. Achieved with extensions (`*.native.tsx` vs `*.tsx`).
6. **Non-navigation components live outside `src/app/`** (`src/components`, `src/hooks`, `src/constants`).
7. **For stack/tabs/drawer:** see `references/router.md` §Layouts and `/router/advanced/`.

## 3. File notation

| Notation | Meaning | Example |
|---|---|---|
| `home.tsx` | Static route | `/feed/favorites` |
| `[userName].tsx` | Dynamic route | `/evanbacon` → `useLocalSearchParams()` |
| `[...slug].tsx` | Catch-all (rest) | `/docs/a/b/c` → `slug: ['a','b','c']` |
| `(home)/` | Route group (does not appear in URL) | `(home)/settings.tsx` ⇒ `/settings` |
| `index.tsx` | Directory's default route | `/profile` |
| `_layout.tsx` | Layout file (Stack/Tabs/Slot) | — |
| `+not-found.tsx` | Catch-all for invalid URLs | — |
| `+html.tsx` | HTML boilerplate for web | — |
| `+native-intent.tsx` | Custom intent linking (Android) | — |
| `+middleware.ts` | Pre-render middleware (web) | — |

> ⚠️ `/assets` is reserved by Metro and expo-router. See https://docs.expo.dev/router/reference/reserved-paths.md

## 4. Layouts: Stack, Tabs, Slot

### Official root layout pattern

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

### Slot (layout without navigator — fixed header/footer)

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

## 5. Navigation: Link, useRouter, params

### `useRouter` (imperative)

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

### `<Link>` (declarative)

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

### Dynamic routes

```tsx
<Link href={{ pathname: '/user/[id]', params: { id: 'bacon' } }}>View user</Link>
```

### Query params

```tsx
<Link href="/users?limit=20">View users</Link>
<Link href={{ pathname: '/users', params: { limit: 20 } }}>View users</Link>
```

### Update params without navigating

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

> **Prefetch limitations:** the preloaded screen cannot use the imperative `router`, nor `useNavigation().setOptions()`, nor focus/tabPress listeners.

### Initial route in deep linking

```tsx
// src/app/products/_layout.tsx
export const unstable_settings = { initialRouteName: 'index' };
```

### Imperative stack actions (SDK 55+)

```ts
router.navigate(url)         // push or unwind
router.push(url)            // always push
router.replace(url)         // replace the current one
router.back()               // pop
router.dismiss(count?)      // dismiss the last from the nearest stack
router.dismissTo(href)      // dismiss to href (router 4.0.8+)
router.dismissAll()         // equivalent to popToTop
router.canDismiss()         // boolean
router.canGoBack()          // boolean (used in web modal)
```

### Custom `getId` for multiple instances of the same screen

```tsx
<Stack.Screen name="[profile]" getId={({ params }) => String(Date.now())} />
```

## 6. URL parameters: local vs global

- **Route parameters** (`[user].tsx`): part of the path; never nullish.
- **Search parameters** (`?query=...`): optional.
- `useLocalSearchParams()` → re-render only when the component's URL changes. **(preferred)**
- `useGlobalSearchParams()` → re-render on every global URL change; can affect performance.

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

**Reserved parameters** (do not use): `screen`, `params`, `initial`, `state`.

## 7. Modals

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

**Official `presentation` options:**
- `card` (default)
- `modal`
- `transparentModal`
- `containedModal` (iOS: `UIModalPresentationCurrentContext`)
- `containedTransparentModal`
- `fullScreenModal`
- `formSheet` (configurable detents)

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

`fitToContents` sizing does not allow `flex: 1`. Starting SDK 55, `flex: 1` works on iOS with numeric detents.

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

Generates `expo-env.d.ts` (gitignored). Provides autocomplete in `<Link>`, `useRouter`, `useLocalSearchParams`.

```tsx
✅ <Link href="/about" />
✅ <Link href="/user/1" />
✅ <Link href={`/user/${id}`} />
✅ <Link href={{ pathname: "/user/[id]", params: { id: 1 } }} />
❌ <Link href="/usser/1" />        // invalid route
❌ <Link href="/user/[id]" />      // dynamic must be object
❌ <Link href={{ pathname: "/user/[id]", params: { _id: 1 } }} />  // params with invalid key
```

**Relative routes are not supported in typed routes** — use `useSegments()`.

Query param types (not auto-generated):

```tsx
const { query, profile, search } = useLocalSearchParams<
  '/[profile]/[...search]',
  { query?: string }
>();
```

## 9. Deep linking

- **Deep links:** own scheme, e.g. `myapp://users/evanbacon`
- **Universal Links (iOS)** / **App Links (Android):** association with https domain. Require domain verification files.

> *"To implement any of the above Linking strategies, we recommend using Expo Router since deep linking is automatically enabled for all of your app's screens."*

For custom intent linking (Android) → `+native-intent.tsx` file.

## 10. Platform-specific modules

- `Component.native.tsx` → Android/iOS
- `Component.tsx` → all (including web)
- `Component.web.ts` → web only
- `Component.ios.tsx` → iOS only
- `Component.android.tsx` → Android only
- Same pattern applies to CSS and images (Metro resolves by extension).

## 11. Common errors

| Problem | Official solution |
|---|---|
| Large title does not collapse on scroll | The `ScrollView`/`FlatList` must be the **first child** of the screen. If it needs a wrapper, `collapsable={false}` |
| White flash between screens | Missing `ThemeProvider` in root layout |
| iOS 26 "Liquid Glass" bothering | Opt-out with `UIDesignRequiresCompatibility=true` in `ios.infoPlist`, or use `expo-router/js-stack` |
| Relative routes with typed routes | Not supported. Use `useSegments()` to build dynamic routes |
| DOM component does not receive `usePathname()` | Read it outside and pass it as a prop |
| `"react-native version mismatch"` | `npx expo install --check` or `npx expo-doctor@latest` |
| Empty header in stack after restarting | Missing `initialRouteName` in the stack layout's `unstable_settings` |
| Changes to `babel.config`/`metro.config` do not apply | `npx expo start --clear` |

## 12. When to use React Navigation v7 instead

- You need fine manual control (custom transitions, complex gesture composition, navigation state machines).
- You do not care about web / universal deep linking.
- You migrate an existing app from RN CLI (not Expo) that already uses React Navigation.

Official minimum v7 snippet (Static API, recommended):

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

RN → expo-router migration has an official step-by-step guide: https://docs.expo.dev/router/migrate/from-react-navigation/.
