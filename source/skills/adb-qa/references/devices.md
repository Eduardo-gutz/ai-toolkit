# Devices — enumeration, selection, and connection troubleshooting

## List devices

```bash
adb devices -l
```

Typical output:

```
emulator-5554          device  usb:1-1 product:sdk_gphone64_x86_64
RF8M40ABCDE            device  usb:3-2 product:sm_a536e transport_id:2
192.168.1.42:5555      device  product:coral transport_id:4
```

- `device` = ready. `unauthorized` = the USB dialog still needs to be accepted on the device. `offline` = no response.
- `-l` adds product/model columns, key to distinguish two devices with the same short `serial`.

## Select device with `-s`

When there are 2+ devices **always** specify the serial:

```bash
adb -s emulator-5554 install ...
adb -s RF8M40ABCDE logcat -c
```

If you run without `-s` with multiple devices, adb warns `more than one device/emulator` and **rejects the command**. Exception: `adb -d` (physical device) or `adb -e` (emulator) when there is only one of each type.

## Wi-Fi ADB (without USB)

Useful when the device is cradled or you only have network.

Physical device (Android 11+ via QR in developer options):
```bash
# 1. On the device: Settings > Developer options > Wireless debugging
# 2. Note IP and port (e.g., 192.168.1.42:39555)
adb pair 192.168.1.42:39555   # it will ask for the 6-digit code
adb connect 192.168.1.42:39555
```

Emulator (always on localhost):
```bash
# The AVD appears as emulator-5554 after launching it from Android Studio
# or `emulator -avd <name>`
```

After connecting over Wi-Fi, `adb devices` lists them the same way.

## Troubleshooting

### "device unauthorized"
The RSA fingerprint dialog must be accepted on the device. Solutions:
1. Disconnect USB, reconnect.
2. On the device: `adb kill-server && adb start-server` does not help — but `Settings > Developer options > Revoke USB debugging authorizations` + reconnect does.
3. On macOS: restart `adb` and verify that `~/.android/adbkey` and `adbkey.pub` exist.

### "offline"
Bad cable, or device asleep. Wake with `adb shell input keyevent KEYCODE_WAKEUP` after connecting.

### "no permissions"
Missing udev rules on Linux. Does not apply on macOS.

### "kex error" or "connection reset"
The adb daemon has stale state:
```bash
adb kill-server
adb start-server
adb devices
```

If it fails again, verify that port 5037 is free:
```bash
lsof -i :5037
```

## Emulators vs physical devices

| Thing | Emulator | Physical |
|---|---|---|
| Camera | Static images / webcam | Real |
| GPS | Mock location | Real (with `adb emu geo fix ...`) |
| Sensors | Simulated | Real |
| Performance | Slow, especially x86 | Real |
| Loopback to host | `10.0.2.2` | `adb reverse` |
| DB extractable | Yes (debug) | Yes (debug) |
| Resolution | Configurable | Fixed |

**Smoke rule:** run on both before each release. The emulator catches logical regressions; the physical one catches performance, battery, and permissions regressions.

## Multiple simultaneous AVDs

```bash
emulator -avd Pixel_6_API_34 -port 5554 &
emulator -avd Pixel_4_API_30 -port 5556 &
adb devices   # both listed
```

Useful for matrix testing but do not abuse it: each AVD eats ~2GB RAM.
