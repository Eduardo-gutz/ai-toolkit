# Devices — enumeración, selección, y troubleshooting de conexión

## Listar devices

```bash
adb devices -l
```

Salida típica:

```
emulator-5554          device  usb:1-1 product:sdk_gphone64_x86_64
RF8M40ABCDE            device  usb:3-2 product:sm_a536e transport_id:2
192.168.1.42:5555      device  product:coral transport_id:4
```

- `device` = listo. `unauthorized` = falta aceptar el diálogo de USB en el device. `offline` = no responde.
- `-l` añade columnas de producto/modelo, clave para distinguir dos devices con el mismo `serial` corto.

## Seleccionar device con `-s`

Cuando hay 2+ devices **siempre** especifica serial:

```bash
adb -s emulator-5554 install ...
adb -s RF8M40ABCDE logcat -c
```

Si ejecutas sin `-s` con varios devices, adb avisa `more than one device/emulator` y **rechaza el comando**. Excepción: `adb -d` (device físico) o `adb -e` (emulator) cuando solo hay uno de cada tipo.

## Wi-Fi ADB (sin USB)

Útil cuando el device está cradleado o solo tienes red.

Device físico (Android 11+ vía QR en developer options):
```bash
# 1. En el device: Settings > Developer options > Wireless debugging
# 2. Anota IP y puerto (e.g., 192.168.1.42:39555)
adb pair 192.168.1.42:39555   # te pedirá el código de 6 dígitos
adb connect 192.168.1.42:39555
```

Emulator (siempre en localhost):
```bash
# El AVD aparece como emulator-5554 después de lanzarlo desde Android Studio
# o `emulator -avd <name>`
```

Después de conectar por Wi-Fi, `adb devices` los lista igual.

## Troubleshooting

### "device unauthorized"
El diálogo RSA fingerprint debe aceptarse en el device. Soluciones:
1. Desconecta USB, vuelve a conectar.
2. En el device: `adb kill-server && adb start-server` no ayuda — pero `Settings > Developer options > Revoke USB debugging authorizations` + reconectar sí.
3. En macOS: reinicia `adb` y verifica que `~/.android/adbkey` y `adbkey.pub` existan.

### "offline"
Cable malo, o device en sleep. Despertar con `adb shell input keyevent KEYCODE_WAKEUP` después de conectar.

### "no permissions"
Falta udev rules en Linux. No aplica en macOS.

### "kex error" o "connection reset"
El daemon de adb tiene estado stale:
```bash
adb kill-server
adb start-server
adb devices
```

Si vuelve a fallar, verifica que el puerto 5037 esté libre:
```bash
lsof -i :5037
```

## Emulators vs devices físicos

| Cosa | Emulator | Físico |
|---|---|---|
| Cámara | Imágenes estáticas / webcam | Real |
| GPS | Mock location | Real (con `adb emu geo fix ...`) |
| Sensores | Simulados | Reales |
| Performance | Lento, especialmente x86 | Real |
| Loopback al host | `10.0.2.2` | `adb reverse` |
| DB extractable | Sí (debug) | Sí (debug) |
| Resolución | Configurable | Fija |

**Regla de smoke:** pasa en ambos antes de cada release. El emulador atrapa regresiones lógicas; el físico atrapa regressions de performance, battery y permisos.

## Múltiples AVDs simultáneos

```bash
emulator -avd Pixel_6_API_34 -port 5554 &
emulator -avd Pixel_4_API_30 -port 5556 &
adb devices   # ambos listados
```

Útil para matrix testing pero no abuses: cada AVD come ~2GB RAM.
