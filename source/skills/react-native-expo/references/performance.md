# Performance and New Architecture

> **Official sources:** https://reactnative.dev/docs/performance · https://reactnative.dev/docs/optimizing-flatlist-configuration · https://shopify.github.io/flash-list/ · https://docs.expo.dev/versions/latest/sdk/flash-list/ · https://docs.expo.dev/versions/latest/sdk/image/ · https://docs.swmansion.com/react-native-reanimated/ · https://docs.expo.dev/guides/new-architecture/

## 1. Official base concepts

> *"iOS and Android devices display at least 60 frames per second, which gives you and the UI system at most **16.67ms** to do all of the work needed to generate the static image (frame)… If you are unable to do the work necessary to generate that frame within the allotted time slot, then you will 'drop a frame' and the UI will appear unresponsive."*
> — reactnative.dev/docs/performance

Two different frame rates:
- **JS frame rate** (JS thread): render React, API calls, touch events.
- **UI frame rate** (main thread): native. Transitions from `@react-navigation/native-stack` live here → native animations are not interrupted by drops in the JS thread.

## 2. Official anti-patterns (explicit list)

| # | Anti-pattern | Official solution |
|---|---|---|
| 1 | Test perf in `dev=true` | *"Always make sure to test performance in release builds"* |
| 2 | `console.log` in production | *"can cause a big bottleneck in the JavaScript thread"* → install `babel-plugin-transform-remove-console` |
| 3 | `FlatList` without `getItemLayout` | *"skipping measurement of the rendered items"* |
| 4 | Saturated JS thread on transition/animation | Defer work (`requestIdleCallback`) or `LayoutAnimation` (main thread, not JS) |
| 5 | Move view with alpha compositing (Android) | Use `renderToHardwareTextureAndroid`; iOS already has `shouldRasterizeIOS` by default |
| 6 | Animate `width`/`height` of `<Image>` | On iOS it re-crops + re-scales every frame → use `transform: [{scale}]` |
| 7 | Heavy `onPress` blocking feedback | Wrap work in `requestAnimationFrame` |

## 3. Large lists: FlashList v2 vs FlatList

### Official decision

> *"If your `FlatList` is rendering slowly, be sure that you've implemented `getItemLayout`… There are also other third-party list libraries that are optimized for performance, including **FlashList** and Legend List."*
> — reactnative.dev/docs/performance

> *"FlashList recycles components under the hood to maximize performance."*
> — shopify.github.io/flash-list/

**Practical rule:**
- **FlatList** OK if: small lists (<~50 items), known `getItemLayout`, no heterogeneity.
- **FlashList** recommended if: large lists, variable lengths, mixed types, low-end Android.

### Official Shopify metrics

> *"FPS in UI thread: **up to 5x** FlashList vs FlatList · FPS in JS thread: **up to 10x** · Average FPS on 60FPS Android Moto G10 device."*

### Minimum snippet

```tsx
import { FC } from 'react';
import { FlashList } from '@shopify/flash-list';

const MyList: FC<{}> = () => (
  <FlashList data={DATA} renderItem={({ item }) => <Text>{item.title}</Text>} />
);
```

### Migration from FlatList — official checklist

1. Change `FlatList` → `FlashList`.
2. **Important:** remove explicit `key` props on `renderItem` (use `useMappingHelper` if you do `.map()` inside).
3. Audit `useState` on items → they will be recycled with different data (see [Recycling](https://shopify.github.io/flash-list/docs/recycling)).
4. Pass heterogeneous types with `getItemType` → improves recycling.
5. **Do not test perf with JS dev mode on** (FlashList appears slower due to the small render buffer).
6. **Memoizing props is more important in v2** (v1 was selective, v2 re-renders more).
7. `keyExtractor` always with v2 (avoids glitches when scrolling up).

### FlatList props NOT supported in FlashList v2

`columnWrapperStyle`, `debug`, `listKey`, `disableVirtualization`, **`getItemLayout`**, **`initialNumToRender`**, **`maxToRenderPerBatch`**, `recordInteraction`, `setNativeProps`, **`updateCellsBatchingPeriod`**, `onScrollToIndexFailed`, **`windowSize`**.

> *"We don't currently plan to implement these props."*

### Official FlashList v2 hooks

- `useLayoutState(initialState)` — communicates size changes to FlashList.
- `useRecyclingState(initial, deps, resetCallback)` — resets state when deps change.
- `useMappingHelper()` — returns `getMappingKey(index, itemKey)` for internal `.map()`.
- `useFlashListContext()` — exposes the `ref` of FlashList and ScrollView.

## 4. FlatList — tuning props (when you use it)

| Prop | Default | Trade-off |
|---|---|---|
| `removeClippedSubviews` | `true` Android, `false` iOS | Pros: less work on main thread · Cons: bugs with transforms/absolute positioning (iOS) |
| `maxToRenderPerBatch` | `10` | More = fewer blanks · Less = better responsiveness |
| `updateCellsBatchingPeriod` | `50` ms | Combine with `maxToRenderPerBatch` to tune |
| `initialNumToRender` | `10` | Cover the exact viewport = big first-render boost |
| `windowSize` | `21` (10 + 1 + 10 viewports) | Larger = fewer blanks but more memory |

### `getItemLayout` + `memo` + `keyExtractor` pattern

```tsx
const renderItem = useCallback(({ item }) => (
  <View key={item.key}><Text>{item.title}</Text></View>
), []);

const MyListItem = memo(
  ({ title }: { title: string }) => (<View><Text>{title}</Text></View>),
  (prevProps, nextProps) => prevProps.title === nextProps.title,
);

<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  getItemLayout={(_, index) => ({ length: 80, offset: 80 * index, index })}
/>
```

## 5. Images — `expo-image`

> *"Designed for speed · Disk and memory caching · BlurHash & ThumbHash · Transitions (no more flickering) · CSS `object-fit`/`object-position` semantics · cross-platform."*

Native engines: `SDWebImage` (iOS) and `Glide` (Android).

### Official snippet

```tsx
import { Image } from 'expo-image';

const blurhash = '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';

<Image
  style={styles.image}
  source="https://picsum.photos/seed/696/3000/2000"
  placeholder={{ blurhash }}
  contentFit="cover"
  transition={1000}
/>
```

### Key official props

| Prop | Default | Notes |
|---|---|---|
| `cachePolicy` | `'disk'` | `'none'` / `'disk'` / `'memory'` / `'memory-disk'` |
| `contentFit` | `'cover'` | Maps to CSS `object-fit` |
| `transition` | — | Number (cross-dissolve duration ms) or object `{effect, duration, timing}` |
| `placeholder` | — | BlurHash string, ThumbHash, ImageSource, array |
| `placeholderContentFit` | `'scale-down'` | **Different default from `contentFit`** — set them equal to avoid flickering |
| `priority` | `'normal'` | `'low'` / `'normal'` / `'high'` |
| `recyclingKey` | `null` | **Critical for FlashList**: resets the view to blank before reloading |
| `allowDownscaling` | `true` | Disable = memory ↑ but resize smoother |
| `tintColor` | — | For template images |

### Static methods

- `Image.prefetch(urls, cachePolicy)` — preload; default `memory-disk`.
- `Image.clearDiskCache()` / `clearMemoryCache()` — async, returns `Promise<boolean>`.
- `Image.generateBlurhashAsync(source, [components])` — to generate placeholder server-side.
- `Image.writeToCacheAsync(source, cacheKey)` — seed the cache with a local file.
- `Image.getCachePathAsync(cacheKey)`.
- `Image.loadAsync(source, options)` — loads into memory, returns `ImageRef`.
- `useImage(source, options, dependencies)` — hook.

### Official anti-patterns

> *"The default value for placeholder's content fit is `'scale-down'`, which differs from the source image's default value. Using a lower-resolution placeholder may cause flickering due to scaling differences between it and the final image. To prevent this, you can set the `placeholderContentFit` to match the `contentFit` value."*

> ⚠️ `useImage` for large images without specifying size constraints can cause memory crashes. Use `maxWidth` or `maxHeight`.

## 6. Animations — Reanimated 4.x

> ⚠️ *"Reanimated 4.x works **only with the React Native New Architecture (Fabric)**. If your app still uses the old architecture, you can use Reanimated in version 3 (which is no longer actively maintained)."*

### Installation

```sh
npm install react-native-reanimated
npm install react-native-worklets   # ← NEW in v4, separate
npx expo prebuild                   # ← regenerates ios/android
```

### Breaking changes v3 → v4

| Change | v3 | v4 |
|---|---|---|
| Babel plugin | `react-native-reanimated/plugin` | `react-native-worklets/plugin` (must be **last**) |
| Worklets | part of reanimated | separate `react-native-worklets` package |
| Threading | `runOnJS(fn)(args)` | `scheduleOnRN(fn, args)` |
| | `runOnUI(fn)(args)` | `scheduleOnUI(fn, args)` |
| Gesture | `useAnimatedGestureHandler` | **`removed`** → Gesture API v2 from Gesture Handler |
| `useScrollViewOffset` | — | renamed to `useScrollOffset` |
| `withSpring` defaults | — | replaced; use `Reanimated3DefaultSpringConfig` import for legacy |
| New Arch | optional | **required** |

### `useSharedValue` + `useAnimatedStyle`

```tsx
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const offset = useSharedValue(0);

offset.value = withSpring(offset.value + 50);

const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: offset.value }],
}));

<Animated.View style={animatedStyle} />;
```

### Official Reanimated 4 anti-patterns

- ❌ Use v4 in Legacy Architecture → does not work.
- ❌ `'react-native-reanimated/plugin'` (renamed) → now `'react-native-worklets/plugin'`.
- ❌ `runOnJS` / `runOnUI` with double invocation → API changed to `scheduleOnRN(fn, args)`.
- ❌ `useAnimatedGestureHandler` → removed; migrate to Gesture API v2.
- ❌ Babel plugin before other plugins → *"has to be listed last"*.

## 7. New Architecture — SDK 54+ status

> *"SDK 55 and later run entirely on the New Architecture. The New Architecture is always enabled and cannot be disabled. If you need to use the legacy architecture, use SDK 54 or earlier."*

> *"The New Architecture is enabled by default in SDK 53 and SDK 54."*

> *"SDK 54 is the last SDK version where the New Architecture can be disabled."*

> *"As of January 2026, approximately 83% of SDK 54 projects built with EAS Build use the New Architecture."*

> *"Expo Go only supports the New Architecture."*

### What it includes

- **Fabric:** new renderer (replaces Paper).
- **TurboModules:** native modules with lazy loading and type safety via codegen.
- **Bridgeless:** no bridge, sync communication between JS and native.
- **Full support for Suspense** (not in legacy).
- **New CSS features** (RN 0.77+).

### Enable / disable (official configuration)

```json
// app.json — SDK 54 still allows toggling
{ "expo": { "newArchEnabled": true } }
```

> In SDK 55+, this setting is a no-op. *"this setting will be ignored"*.

### Compatibility — libraries officially marked as incompatible / to migrate

| ❌ Before | ✅ Now |
|---|---|
| `react-native-maps` (without interop) | `expo-maps` or `@react-native-maps/react-native-maps` 1.21+ |
| `@stripe/react-native` (<0.45) | `@stripe/react-native` ≥0.45 |
| `@react-native-community/masked-view` | `@react-native-masked-view/masked-view` |
| `@react-native-community/clipboard` | `@react-native-clipboard/clipboard` |
| `rn-fetch-blob` | `react-native-blob-util` |
| `react-native-fs` | `expo-file-system` |
| `react-native-geolocation-service` | `expo-location` |
| `react-native-datepicker` | `react-native-date-picker` or `@react-native-community/datetimepicker` |

### Validate

```sh
npx expo-doctor@latest
```

> *"Run `npx expo-doctor` to check your dependencies against the data in React Native Directory."*

### Official New Arch anti-patterns

- ❌ Set `newArchEnabled: false` in SDK 55+ → **no-op**.
- ❌ Assume FlashList v1 works in New Arch → **use FlashList v2**.
- ❌ Use Reanimated 3 with New Arch → it works, but v4 is optimized; v3 does not get new features.
- ❌ Expect all third-party libs to work without changes → check the interop layer.

## 8. Hermes vs JSC

There is no official comparison page on reactnative.dev. **Hermes is the default since RN 0.70** (April 2022) and the performance guide assumes it. The community reports ~50% better startup time and lower memory, but **it is not an official RN claim**.

## 9. Debugging

| Tool | When |
|---|---|
| `npx expo run:android` / `run:ios` | Compiles native, installs, starts Metro |
| `npx expo start` | Metro only (JS/TS changes) |
| `expo-dev-client` | Dev build with UI/debugging tools |
| `npx react-devtools` | Standalone React DevTools |
| Chrome DevTools via `chrome://inspect` | Hermes JS thread inspection |
| **Do not use Flipper** | Deprecated by RN core, replaced by React DevTools + Expo Dev Tools |

**Sentry** (`@sentry/react-native`) is officially recommended for error tracking; it comes in the default `transformIgnorePatterns` of `jest-expo`.
