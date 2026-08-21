# Performance y New Architecture

> **Fuentes oficiales:** https://reactnative.dev/docs/performance · https://reactnative.dev/docs/optimizing-flatlist-configuration · https://shopify.github.io/flash-list/ · https://docs.expo.dev/versions/latest/sdk/flash-list/ · https://docs.expo.dev/versions/latest/sdk/image/ · https://docs.swmansion.com/react-native-reanimated/ · https://docs.expo.dev/guides/new-architecture/

## 1. Conceptos base oficiales

> *"iOS and Android devices display at least 60 frames per second, which gives you and the UI system at most **16.67ms** to do all of the work needed to generate the static image (frame)… If you are unable to do the work necessary to generate that frame within the allotted time slot, then you will 'drop a frame' and the UI will appear unresponsive."*
> — reactnative.dev/docs/performance

Dos frame rates distintos:
- **JS frame rate** (JS thread): render React, API calls, touch events.
- **UI frame rate** (main thread): nativo. Transiciones de `@react-navigation/native-stack` viven aquí → animaciones nativas no se interrumpen por drops en JS thread.

## 2. Anti-patrones oficiales (lista explícita)

| # | Anti-patrón | Solución oficial |
|---|---|---|
| 1 | Probar perf en `dev=true` | *"Always make sure to test performance in release builds"* |
| 2 | `console.log` en producción | *"can cause a big bottleneck in the JavaScript thread"* → instalar `babel-plugin-transform-remove-console` |
| 3 | `FlatList` sin `getItemLayout` | *"skipping measurement of the rendered items"* |
| 4 | JS thread saturado en transición/animation | Deferir trabajo (`requestIdleCallback`) o `LayoutAnimation` (afectado por main thread, no JS) |
| 5 | Mover view con alpha compositing (Android) | Usar `renderToHardwareTextureAndroid`; iOS ya tiene `shouldRasterizeIOS` por defecto |
| 6 | Animar `width`/`height` de `<Image>` | En iOS se re-crop + re-scale cada frame → usar `transform: [{scale}]` |
| 7 | `onPress` pesado bloqueando feedback | Envolver trabajo en `requestAnimationFrame` |

## 3. Listas grandes: FlashList v2 vs FlatList

### Decisión oficial

> *"If your `FlatList` is rendering slowly, be sure that you've implemented `getItemLayout`… There are also other third-party list libraries that are optimized for performance, including **FlashList** and Legend List."*
> — reactnative.dev/docs/performance

> *"FlashList recycles components under the hood to maximize performance."*
> — shopify.github.io/flash-list/

**Regla práctica:**
- **FlatList** OK si: listas chicas (<~50 items), `getItemLayout` conocido, no hay heterogeneidad.
- **FlashList** recomendado si: listas grandes, longitudes variables, mezcla de tipos, Android low-end.

### Métricas oficiales Shopify

> *"FPS in UI thread: **up to 5x** FlashList vs FlatList · FPS in JS thread: **up to 10x** · Average FPS on 60FPS Android Moto G10 device."*

### Snippet mínimo

```tsx
import { FC } from 'react';
import { FlashList } from '@shopify/flash-list';

const MyList: FC<{}> = () => (
  <FlashList data={DATA} renderItem={({ item }) => <Text>{item.title}</Text>} />
);
```

### Migración desde FlatList — checklist oficial

1. Cambiar `FlatList` → `FlashList`.
2. **Importante:** eliminar `key` props explícitos en `renderItem` (usa `useMappingHelper` si haces `.map()` dentro).
3. Auditar `useState` en items → reciclarán con datos diferentes (ver [Recycling](https://shopify.github.io/flash-list/docs/recycling)).
4. Pasar tipos heterogéneos con `getItemType` → mejora reciclaje.
5. **No testear perf con JS dev mode on** (FlashList aparece más lento por el render buffer pequeño).
6. **Memoizar props es más importante en v2** (v1 era selectivo, v2 re-renderiza más).
7. `keyExtractor` siempre con v2 (evita glitches al ir hacia arriba).

### Props de FlatList NO soportadas en FlashList v2

`columnWrapperStyle`, `debug`, `listKey`, `disableVirtualization`, **`getItemLayout`**, **`initialNumToRender`**, **`maxToRenderPerBatch`**, `recordInteraction`, `setNativeProps`, **`updateCellsBatchingPeriod`**, `onScrollToIndexFailed`, **`windowSize`**.

> *"We don't currently plan to implement these props."*

### Hooks oficiales FlashList v2

- `useLayoutState(initialState)` — comunica cambios de tamaño a FlashList.
- `useRecyclingState(initial, deps, resetCallback)` — resetea state cuando deps cambian.
- `useMappingHelper()` — devuelve `getMappingKey(index, itemKey)` para `.map()` internos.
- `useFlashListContext()` — expone `ref` de FlashList y ScrollView.

## 4. FlatList — props para tuning (cuando la usas)

| Prop | Default | Trade-off |
|---|---|---|
| `removeClippedSubviews` | `true` Android, `false` iOS | Pros: menos trabajo en main thread · Cons: bugs con transforms/absolute positioning (iOS) |
| `maxToRenderPerBatch` | `10` | Más = menos blanks · Menos = mejor responsiveness |
| `updateCellsBatchingPeriod` | `50` ms | Combinar con `maxToRenderPerBatch` para tunear |
| `initialNumToRender` | `10` | Cubrir el viewport exacto = big boost en primer render |
| `windowSize` | `21` (10 + 1 + 10 viewports) | Mayor = menos blanks pero más memoria |

### Patrón `getItemLayout` + `memo` + `keyExtractor`

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

## 5. Imágenes — `expo-image`

> *"Designed for speed · Disk and memory caching · BlurHash & ThumbHash · Transitions (no more flickering) · CSS `object-fit`/`object-position` semantics · cross-platform."*

Native engines: `SDWebImage` (iOS) y `Glide` (Android).

### Snippet oficial

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

### Props clave oficiales

| Prop | Default | Notas |
|---|---|---|
| `cachePolicy` | `'disk'` | `'none'` / `'disk'` / `'memory'` / `'memory-disk'` |
| `contentFit` | `'cover'` | Mapea a CSS `object-fit` |
| `transition` | — | Number (cross-dissolve duration ms) u objeto `{effect, duration, timing}` |
| `placeholder` | — | BlurHash string, ThumbHash, ImageSource, array |
| `placeholderContentFit` | `'scale-down'` | **Default distinto del `contentFit`** — setear igual para evitar flickering |
| `priority` | `'normal'` | `'low'` / `'normal'` / `'high'` |
| `recyclingKey` | `null` | **Crítico para FlashList**: resetea el view a blank antes de recargar |
| `allowDownscaling` | `true` | Desactivar = memoria ↑ pero resize más smooth |
| `tintColor` | — | Para template images |

### Métodos estáticos

- `Image.prefetch(urls, cachePolicy)` — preload; default `memory-disk`.
- `Image.clearDiskCache()` / `clearMemoryCache()` — async, returns `Promise<boolean>`.
- `Image.generateBlurhashAsync(source, [components])` — para generar placeholder server-side.
- `Image.writeToCacheAsync(source, cacheKey)` — seedear cache con archivo local.
- `Image.getCachePathAsync(cacheKey)`.
- `Image.loadAsync(source, options)` — carga a memoria, retorna `ImageRef`.
- `useImage(source, options, dependencies)` — hook.

### Anti-patrones oficiales

> *"The default value for placeholder's content fit is `'scale-down'`, which differs from the source image's default value. Using a lower-resolution placeholder may cause flickering due to scaling differences between it and the final image. To prevent this, you can set the `placeholderContentFit` to match the `contentFit` value."*

> ⚠️ `useImage` para imágenes grandes sin especificar size constraints puede causar crashes por memoria. Usar `maxWidth` o `maxHeight`.

## 6. Animaciones — Reanimated 4.x

> ⚠️ *"Reanimated 4.x works **only with the React Native New Architecture (Fabric)**. If your app still uses the old architecture, you can use Reanimated in version 3 (which is no longer actively maintained)."*

### Instalación

```sh
npm install react-native-reanimated
npm install react-native-worklets   # ← NUEVO en v4, separado
npx expo prebuild                   # ← regenera ios/android
```

### Cambios breaking v3 → v4

| Cambio | v3 | v4 |
|---|---|---|
| Plugin Babel | `react-native-reanimated/plugin` | `react-native-worklets/plugin` (debe ir **último**) |
| Worklets | parte de reanimated | paquete separado `react-native-worklets` |
| Threading | `runOnJS(fn)(args)` | `scheduleOnRN(fn, args)` |
| | `runOnUI(fn)(args)` | `scheduleOnUI(fn, args)` |
| Gesture | `useAnimatedGestureHandler` | **`removed`** → Gesture API v2 de Gesture Handler |
| `useScrollViewOffset` | — | renombrado a `useScrollOffset` |
| `withSpring` defaults | — | reemplazados; usar `Reanimated3DefaultSpringConfig` import para legacy |
| New Arch | opcional | **requerido** |

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

### Anti-patrones oficiales Reanimated 4

- ❌ Usar v4 en Legacy Architecture → no funciona.
- ❌ `'react-native-reanimated/plugin'` (renombrado) → ahora `'react-native-worklets/plugin'`.
- ❌ `runOnJS` / `runOnUI` con doble invocación → API cambió a `scheduleOnRN(fn, args)`.
- ❌ `useAnimatedGestureHandler` → removido; migrar a Gesture API v2.
- ❌ Babel plugin antes que otros plugins → *"has to be listed last"*.

## 7. New Architecture — estado SDK 54+

> *"SDK 55 and later run entirely on the New Architecture. The New Architecture is always enabled and cannot be disabled. If you need to use the legacy architecture, use SDK 54 or earlier."*

> *"The New Architecture is enabled by default in SDK 53 and SDK 54."*

> *"SDK 54 is the last SDK version where the New Architecture can be disabled."*

> *"As of January 2026, approximately 83% of SDK 54 projects built with EAS Build use the New Architecture."*

> *"Expo Go only supports the New Architecture."*

### Qué incluye

- **Fabric:** nuevo renderer (reemplaza a Paper).
- **TurboModules:** módulos nativos con carga lazy y type safety via codegen.
- **Bridgeless:** sin bridge, comunicación sync entre JS y native.
- **Full support for Suspense** (no en legacy).
- **New CSS features** (RN 0.77+).

### Habilitar / deshabilitar (configuración oficial)

```json
// app.json — SDK 54 todavía permite togglear
{ "expo": { "newArchEnabled": true } }
```

> En SDK 55+, este setting es no-op. *"this setting will be ignored"*.

### Compatibilidad — librerías marcadas oficialmente como incompatibles / a migrar

| ❌ Antes | ✅ Ahora |
|---|---|
| `react-native-maps` (sin interop) | `expo-maps` o `@react-native-maps/react-native-maps` 1.21+ |
| `@stripe/react-native` (<0.45) | `@stripe/react-native` ≥0.45 |
| `@react-native-community/masked-view` | `@react-native-masked-view/masked-view` |
| `@react-native-community/clipboard` | `@react-native-clipboard/clipboard` |
| `rn-fetch-blob` | `react-native-blob-util` |
| `react-native-fs` | `expo-file-system` |
| `react-native-geolocation-service` | `expo-location` |
| `react-native-datepicker` | `react-native-date-picker` o `@react-native-community/datetimepicker` |

### Validar

```sh
npx expo-doctor@latest
```

> *"Run `npx expo-doctor` to check your dependencies against the data in React Native Directory."*

### Anti-patrones oficiales New Arch

- ❌ Setear `newArchEnabled: false` en SDK 55+ → **no-op**.
- ❌ Asumir que FlashList v1 funciona en New Arch → **usar FlashList v2**.
- ❌ Usar Reanimated 3 con New Arch → funciona, pero v4 está optimizado; v3 no recibe features nuevas.
- ❌ Esperar que todas las third-party libs funcionen sin cambios → revisar interop layer.

## 8. Hermes vs JSC

No hay página oficial comparativa en reactnative.dev. **Hermes es el default desde RN 0.70** (abril 2022) y la guía de performance lo asume. Comunidad reporta ~50% mejor startup time y menor memoria, pero **no es un claim oficial de RN**.

## 9. Debugging

| Herramienta | Cuándo |
|---|---|
| `npx expo run:android` / `run:ios` | Compila nativo, instala, arranca Metro |
| `npx expo start` | Solo Metro (cambios JS/TS) |
| `expo-dev-client` | Dev build con UI/debugging tools |
| `npx react-devtools` | Standalone React DevTools |
| Chrome DevTools via `chrome://inspect` | Hermes JS thread inspection |
| **No usar Flipper** | Deprecado por RN core, reemplazado por React DevTools + Expo Dev Tools |

**Sentry** (`@sentry/react-native`) está recomendado oficialmente para error tracking; viene en el `transformIgnorePatterns` default de `jest-expo`.
