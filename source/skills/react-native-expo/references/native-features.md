# Native features (camera, location, notifications, permissions)

> **Official sources:** https://docs.expo.dev/versions/latest/sdk/camera/ · https://docs.expo.dev/versions/latest/sdk/imagepicker/ · https://docs.expo.dev/versions/latest/sdk/location/ · https://docs.expo.dev/versions/latest/sdk/notifications/ · https://docs.expo.dev/versions/latest/sdk/image/

## 1. Universal permissions pattern

**The `expo-permissions` package was deprecated and removed** since SDK 48. Each Expo module exposes its own `use*Permissions` hook.

### `PermissionResponse` structure

```ts
{
  canAskAgain: boolean,
  expires: 'never' | number,
  granted: boolean,
  status: 'granted' | 'denied' | 'undetermined',
}
```

### Canonical pattern (identical across all modules)

```tsx
import { useCameraPermissions } from 'expo-camera';
import { Linking } from 'react-native';

const [permission, requestPermission] = useCameraPermissions();

if (permission === null) return <Loading />;                 // loading
if (!permission.granted) {
  if (permission.canAskAgain) {
    return <Button title="Grant" onPress={requestPermission} />;
  }
  return <Button title="Open Settings" onPress={() => Linking.openURL('app-settings:')} />;
}
// use feature...
```

### Hooks by domain

| Module | Hook | Permission |
|---|---|---|
| `expo-camera` | `useCameraPermissions` | camera |
| `expo-camera` | `useMicrophonePermissions` | microphone |
| `expo-image-picker` | `useCameraPermissions` | camera |
| `expo-image-picker` | `useMediaLibraryPermissions({ writeOnly })` | media library |
| `expo-location` | `useForegroundPermissions` | location when in use |
| `expo-location` | `useBackgroundPermissions` | location always |
| `expo-location` | `useMotionActivityPermissions` | motion/activity |
| `expo-notifications` | `getPermissionsAsync()` + `requestPermissionsAsync()` (no hook) | notifications |

### Anti-patterns

> ❌ Assume permissions OK only by checking the root `status` on iOS → use `settings.ios?.status` (granular).
> ❌ Ignore `canAskAgain === false` → send to Settings with `Linking.openURL('app-settings:')`.

## 2. Camera — `expo-camera` vs `expo-image-picker`

**When to use each:**
- `expo-camera` → live preview, full control, barcode scanning.
- `expo-image-picker` → launches native UI. Simpler path for "pick a photo" or "take a quick photo".

### `expo-camera`

Platforms: Android (device only), iOS (device only), Web.

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

**Official features:** barcode scanning (`onBarcodeScanned`, `barcodeScannerSettings`), torch, zoom, flash, picture (`takePictureAsync`), video (`recordAsync`), native scanner UI (`launchScanner` on iOS 16+ uses `DataScannerViewController`).

**Critical anti-pattern:**
> ❌ *"Only one Camera preview can be active at any given time."* If you have several screens with a camera, unmount `Camera`/`CameraView` when the screen loses focus.

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

**Important SDK 54 change:**
> *"In SDK 54 and later, the default configuration keeps `allowsEditing` set to `false` and `videoExportPreset` set to `'Passthrough'`. These settings return the original asset (including HEIC and AVIF files) instantly because the picker skips compression, but iOS requires media library permission to access the original file and displays a permission dialog immediately after the user selects a video."*

> **To avoid the post-selection dialog, request permissions manually before opening the picker** with `requestMediaLibraryPermissionsAsync` or `useMediaLibraryPermissions`.

## 3. Geolocation — `expo-location`

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

### Permission types

| Hook | iOS | Android |
|---|---|---|
| `useForegroundPermissions` | `When In Use` | `ACCESS_FINE_LOCATION` |
| `useBackgroundPermissions` | `Always` | `ACCESS_BACKGROUND_LOCATION` |
| `useMotionActivityPermissions` | Motion & Fitness | `ACTIVITY_RECOGNITION` |

### Critical official caveats

1. **Foreground first:** *"your app can't obtain background permission without foreground permission"*.
2. **Allow Once (iOS):** *"iOS does not provide a way to detect whether the user selected `Allow Once` or `Allow While Using the App`. Both responses result in `When In Use` authorization."*
3. **Allow Once → background silently fails:** *"If the user selected `Allow Once` and you subsequently call `requestBackgroundPermissionsAsync` in the same session, the system **will not show another prompt**. Instead, the request will **silently fail**"*.
4. **Android 11+ background:** opens the **system settings page** directly (no dialog) → explain to the user first with a `Modal`.
5. **Background location does not work in Expo Go iOS:** *"you must use a development build"*.
6. **Android:** *"A terminated app will not automatically restart when a location or geofencing event occurs"*.

### Background — prereq

```ts
import * as TaskManager from 'expo-task-manager';

TaskManager.defineTask(YOUR_TASK_NAME, ({ data: { locations }, error }) => {
  // handle
});

// iOS: add 'location' to UIBackgroundModes in Info.plist
// Applied automatically with CNG (prebuild)
```

## 4. Notifications — `expo-notifications`

### Important caveats

> *"Push notifications (remote notifications) functionality provided by `expo-notifications` is unavailable in Expo Go on Android from SDK 53. A development build is required."*

> *"On Android 13, app users must opt-in to receive notifications via a permissions prompt automatically triggered by the operating system. This prompt will not appear until at least one notification channel is created."*

> ❌ **Push in Expo Go Android (SDK 53+) → development build mandatory.**

### Token types

- `getDevicePushTokenAsync()` → **native token** (FCM Android / APNs iOS). To integrate with your push service.
- `getExpoPushTokenAsync({ projectId })` → **Expo token** (`ExponentPushToken[...]`). For the Expo Push Service.

### Complete official pattern

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

### Deep linking with push (Expo Router)

```tsx
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

const useNotificationObserver = (): void => {
  useEffect(() => {
    // internal helper (no UI, outside the component) — uses function
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

### Official anti-patterns

- ❌ `getExpoPushTokenAsync` **before** `setNotificationChannelAsync` on Android 13+.
- ❌ Assume permissions OK only with the root `status` on iOS → use `settings.ios?.status`.
- ❌ Push in Expo Go Android (SDK 53+) → development build mandatory.
- ❌ Ignore background notifications on iOS without `remote-notification` in `UIBackgroundModes`.
