# Features nativas (cámara, ubicación, notificaciones, permisos)

> **Fuentes oficiales:** https://docs.expo.dev/versions/latest/sdk/camera/ · https://docs.expo.dev/versions/latest/sdk/imagepicker/ · https://docs.expo.dev/versions/latest/sdk/location/ · https://docs.expo.dev/versions/latest/sdk/notifications/ · https://docs.expo.dev/versions/latest/sdk/image/

## 1. Patrón universal de permisos

**El paquete `expo-permissions` fue deprecado y eliminado** desde SDK 48. Cada módulo Expo expone su propio hook `use*Permissions`.

### Estructura del `PermissionResponse`

```ts
{
  canAskAgain: boolean,
  expires: 'never' | number,
  granted: boolean,
  status: 'granted' | 'denied' | 'undetermined',
}
```

### Patrón canónico (idéntico en todos los módulos)

```tsx
import { useCameraPermissions } from 'expo-camera';
import { Linking } from 'react-native';

const [permission, requestPermission] = useCameraPermissions();

if (permission === null) return <Loading />;                 // cargando
if (!permission.granted) {
  if (permission.canAskAgain) {
    return <Button title="Grant" onPress={requestPermission} />;
  }
  return <Button title="Open Settings" onPress={() => Linking.openURL('app-settings:')} />;
}
// usar feature...
```

### Hooks por dominio

| Módulo | Hook | Permiso |
|---|---|---|
| `expo-camera` | `useCameraPermissions` | cámara |
| `expo-camera` | `useMicrophonePermissions` | micrófono |
| `expo-image-picker` | `useCameraPermissions` | cámara |
| `expo-image-picker` | `useMediaLibraryPermissions({ writeOnly })` | media library |
| `expo-location` | `useForegroundPermissions` | location when in use |
| `expo-location` | `useBackgroundPermissions` | location always |
| `expo-location` | `useMotionActivityPermissions` | motion/activity |
| `expo-notifications` | `getPermissionsAsync()` + `requestPermissionsAsync()` (no hook) | notifications |

### Anti-patrones

> ❌ Asumir permisos OK solo chequeando root `status` en iOS → usar `settings.ios?.status` (granular).
> ❌ Ignorar `canAskAgain === false` → mandar a Settings con `Linking.openURL('app-settings:')`.

## 2. Cámara — `expo-camera` vs `expo-image-picker`

**Cuándo cada una:**
- `expo-camera` → preview en vivo, control total, escaneo de códigos de barras.
- `expo-image-picker` → lanza UI nativa. Path más simple para "elegir foto" o "tomar foto rápida".

### `expo-camera`

Plataformas: Android (device only), iOS (device only), Web.

```tsx
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';

const [facing, setFacing] = useState<CameraType>('back');
const [permission, requestPermission] = useCameraPermissions();

if (!permission) return <View />;
if (!permission.granted) {
  return <Button onPress={requestPermission} title="grant permission" />;
}
return <CameraView style={styles.camera} facing={facing} />;
```

**Features oficiales:** barcode scanning (`onBarcodeScanned`, `barcodeScannerSettings`), torch, zoom, flash, picture (`takePictureAsync`), video (`recordAsync`), scanner UI nativo (`launchScanner` en iOS 16+ usa `DataScannerViewController`).

**Anti-patrón crítico:**
> ❌ *"Only one Camera preview can be active at any given time."* Si tienes varios screens con cámara, desmonta `Camera`/`CameraView` cuando el screen pierde foco.

### `expo-image-picker`

```tsx
import * as ImagePicker from 'expo-image-picker';

const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
if (!permissionResult.granted) return;

let result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images', 'videos'],
  allowsEditing: true,
  aspect: [4, 3],
  quality: 1,
});

if (!result.canceled) setImage(result.assets[0].uri);
```

**Cambio importante SDK 54:**
> *"In SDK 54 and later, the default configuration keeps `allowsEditing` set to `false` and `videoExportPreset` set to `'Passthrough'`. These settings return the original asset (including HEIC and AVIF files) instantly because the picker skips compression, but iOS requires media library permission to access the original file and displays a permission dialog immediately after the user selects a video."*

> **Para evitar el dialog post-selección, pide permisos manualmente antes de abrir el picker** con `requestMediaLibraryPermissionsAsync` o `useMediaLibraryPermissions`.

## 3. Geolocalización — `expo-location`

```tsx
import * as Location from 'expo-location';

const [permission, requestPermission] = Location.useForegroundPermissions();

useEffect(() => {
  (async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    let location = await Location.getCurrentPositionAsync({});
    setLocation(location);
  })();
}, []);
```

### Tipos de permiso

| Hook | iOS | Android |
|---|---|---|
| `useForegroundPermissions` | `When In Use` | `ACCESS_FINE_LOCATION` |
| `useBackgroundPermissions` | `Always` | `ACCESS_BACKGROUND_LOCATION` |
| `useMotionActivityPermissions` | Motion & Fitness | `ACTIVITY_RECOGNITION` |

### Caveats críticos oficiales

1. **Foreground primero:** *"your app can't obtain background permission without foreground permission"*.
2. **Allow Once (iOS):** *"iOS does not provide a way to detect whether the user selected `Allow Once` or `Allow While Using the App`. Both responses result in `When In Use` authorization."*
3. **Allow Once → background silenciosamente falla:** *"If the user selected `Allow Once` and you subsequently call `requestBackgroundPermissionsAsync` in the same session, the system **will not show another prompt**. Instead, the request will **silently fail**"*.
4. **Android 11+ background:** abre **system settings page** directamente (no dialog) → explicar al usuario antes con un `Modal`.
5. **Background location no funciona en Expo Go iOS:** *"you must use a development build"*.
6. **Android:** *"A terminated app will not automatically restart when a location or geofencing event occurs"*.

### Background — prereq

```ts
import * as TaskManager from 'expo-task-manager';

TaskManager.defineTask(YOUR_TASK_NAME, ({ data: { locations }, error }) => {
  // handle
});

// iOS: agregar 'location' a UIBackgroundModes en Info.plist
// Se aplica automático con CNG (prebuild)
```

## 4. Notificaciones — `expo-notifications`

### Caveats importantes

> *"Push notifications (remote notifications) functionality provided by `expo-notifications` is unavailable in Expo Go on Android from SDK 53. A development build is required."*

> *"On Android 13, app users must opt-in to receive notifications via a permissions prompt automatically triggered by the operating system. This prompt will not appear until at least one notification channel is created."*

> ❌ **Push en Expo Go Android (SDK 53+) → development build obligatorio.**

### Tipos de token

- `getDevicePushTokenAsync()` → **token nativo** (FCM Android / APNs iOS). Para integrar con tu push service.
- `getExpoPushTokenAsync({ projectId })` → **token Expo** (`ExponentPushToken[...]`). Para Expo Push Service.

### Patrón oficial completo

```tsx
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('myNotificationChannel', {
      name: 'A channel is needed for the permissions prompt to appear',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId) throw new Error('Project ID not found');

  token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return token;
}
```

### Deep linking con push (Expo Router)

```tsx
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

const useNotificationObserver = (): void => {
  useEffect(() => {
    // helper interno (no UI, fuera del componente) — usa function
    function redirect(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url);
    }
    const response = Notifications.getLastNotificationResponse();
    if (response?.notification) redirect(response.notification);

    const subscription = Notifications.addNotificationResponseReceivedListener(
      response => redirect(response.notification)
    );
    return () => subscription.remove();
  }, []);
};
```

### Anti-patrones oficiales

- ❌ `getExpoPushTokenAsync` **antes** de `setNotificationChannelAsync` en Android 13+.
- ❌ Asumir permisos OK solo con root `status` en iOS → usar `settings.ios?.status`.
- ❌ Push en Expo Go Android (SDK 53+) → development build obligatorio.
- ❌ Ignorar background notifications en iOS sin `remote-notification` en `UIBackgroundModes`.
