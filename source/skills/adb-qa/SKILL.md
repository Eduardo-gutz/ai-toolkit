---
name: adb-qa
description: >
  QA testing for Android apps via `adb`. Use when the user asks to install, launch, debug, inspect, or test the Android app on a device/emulator — read crash logs, take screenshots, inspect SQLite, tap UI elements via adb, reproduce bugs, or verify release builds. Covers the full QA loop: device enumeration, install/replace/uninstall, launch, input simulation, screenshots, uiautomator dumps, logcat filtering, filesystem access, SQLite inspection, network capture, ANR/crash investigation, and performance basics. Package name hardcoded to `com.egsolutions.zumapos` (read from `app.json`); everything else is generic adb. Do NOT use for iOS, web testing, or building APKs. Do NOT modify production code from here.
---

# adb-qa — QA for the Zuma POS Android app

> **What this skill does.** It is the operational Swiss army knife of the QA agent on an Android device/emulator. It covers from `adb devices` to capturing a tombstone, **without writing production code**. The part about **building** the APK already lives in the `react-native-expo` skill (`references/deployment.md` section); here it is assumed the APK already exists or is installed from a development feed.
>
> **When NOT to trigger this skill.** If the question is about iOS (`xcrun simctl`, Xcode), web (`playwright`), pure backend, or "how do I compile the app", redirect to the correct skills.

## Hard rules (and why they matter)

1. **Fixed package name: `com.egsolutions.zumapos`.** It comes from `app.json:27` (`android.package`). If you have doubts about the bundle, read `app.json` before assuming. A misspelled constant shows up as `INSTALL_FAILED_USER_RESTRICTED` or `[INSTALL_FAILED_ALREADY_EXISTS]` with a cryptic message.
2. **`adb -s <serial>` when there is more than one device.** The default behavior is "all" only if you do not specify a serial. With an emulator + a physical device connected (or several AVDs), a command without `-s` applies to all and produces unwanted actions (accidental formats, mass uninstalls).
3. **This skill is for reading and inspection; it does not touch app logic.** If you discover a bug in the code, **report it** via the `qa` agent or handoff to the `coder`; do not modify `app/`/`api/` from here.
4. **Never `adb uninstall` without confirmation.** It loses user data (onboarding settings, local SQLite credit records). Before uninstalling, offer `adb shell pm clear com.egsolutions.zumapos` which only clears data without uninstalling.
5. **`adb logcat -c` clears the buffer.** It is destructive but reversible. Request it before triggering a reproducible action if you want a clean log.
6. **`adb shell screencap -p > screenshot.png` is the portable form.** The variant `adb shell screencap /sdcard/x.png && adb pull …` also works, but the direct `-p` avoids the intermediate step and is what the official Android documentation uses.
7. **The emulator uses `10.0.2.2` as loopback to the host.** From the device, `localhost` points to the device itself; to talk to the host's Metro bundler use `10.0.2.2:8081`. For a physical device, use `adb reverse tcp:8081 tcp:8081` to make the device forward that port to the host.
8. **QA on emulator ≠ QA on physical device.** Relevant differences: camera (emulator = static images), GPS (fake), sensors, performance. Smoke on both before release.
9. **Android 13+ requires runtime permissions.** `pm grant` only works for `dangerous` permissions declared in the manifest. If it is not declared, it fails with `SecurityException`. See `app.json:28-34` for the list of permissions Zuma requests (`CAMERA`, `RECORD_AUDIO`, `INTERNET`, `READ/WRITE_EXTERNAL_STORAGE`).
10. **`dumpsys` can hang on old devices.** It has an implicit timeout; if it does not respond in 5s, use Ctrl-C and lower the volume of the command.

## Table of contents

| File | Covers |
|---|---|
| [`references/devices.md`](references/devices.md) | `adb devices`, `-s <serial>`, Wi-Fi ADB pairing, USB authorization, "device unauthorized" troubleshooting |
| [`references/install-launch.md`](references/install-launch.md) | `adb install` (and `-r`/`-d`/`-t`), `pm clear`, `uninstall`, launch via `monkey` or `am start`, deep links, granting runtime permissions |
| [`references/inspect.md`](references/inspect.md) | `uiautomator dump` (UI tree XML), `screencap` + pull, filesystem (`/data/data/...`), extraction and query of the SQLite DB (`datasqlite.db`), `dumpsys activity` |
| [`references/debug.md`](references/debug.md) | `logcat` with filters (package / tag / level / pid), `monkey` for stress, ANR and tombstones, `dumpsys meminfo`/`gfxinfo`, network reverse/forward, `tcpdump` |

## Canonical smoke test flow

```
1. adb devices                                           # what's connected?
2. adb -s <serial> install -r build/output.apk           # replace install
3. adb -s <serial> shell am start -n com.egsolutions.zumapos/.MainActivity
4. adb -s <serial> logcat -c                             # clear buffer
5. [action on the device]
6. adb -s <serial> shell screencap -p > shot.png         # capture
7. adb -s <serial> logcat -d -s ReactNativeJS:V *:E     # read logs
8. adb -s <serial> shell run-as com.egsolutions.zumapos cat /data/data/com.egsolutions.zumapos/databases/datasqlite.db > sqlite.db
9. sqlite3 sqlite.db ".tables"                            # inspect DB
```

Adapt each step to the concrete question. The QA agent that triggers this skill should be able to run this loop and obtain enough evidence for a report.

## Quick decisions by case

### "Does the app crash on X screen?"
→ Launch with `-W -S` (`am start -W -S` to stop the app first), capture `logcat -d -b crash` and `logcat -d *:E`. If you see `FATAL EXCEPTION:`, open the full stack trace (see `references/debug.md` §ANR and crash).

### "What data is it storing?"
→ `run-as com.egsolutions.zumapos` to enter `/data/data/...` (only works on debug builds; not on release). Extract `databases/datasqlite.db` and open it with `sqlite3` (see `references/inspect.md` §SQLite).

### "Why is the screen blank?"
→ 1) Screenshot. 2) `adb shell dumpsys activity top` to see which activity is on top. 3) `logcat -d ReactNativeJS:V *:E`.

### "How do I simulate a tap at X,Y?"
→ `adb shell input tap 540 1200`. To know coordinates use `uiautomator dump` (see `references/inspect.md` §UI tree) or `screencap` + visual inspection.

### "How much memory is the app using?"
→ `adb shell dumpsys meminfo com.egsolutions.zumapos`. Look at `TOTAL PSS` and `Java Heap`. Compare between two points in the flow to detect leaks.

### "Reproduce this on the device"
→ Identify: device, OS version, build type (`debug` vs `release`), user data. With `pm clear` you erase data but keep the app; with `uninstall` + `install` you reproduce a fresh install.

### "How do I open the app at a deep link?"
→ `adb shell am start -a android.intent.action.VIEW -d "zumapos://sales/123"` (scheme declared in `app.json:8`).

### "Is the release build OK?"
→ Verify the signature with `adb shell pm dump com.egsolutions.zumapos | grep -A2 'signatures'` and that the APK does not contain `__DEV__ = true` in logs (Hermes logs in release are notoriously empty — that is normal).

## What this skill does NOT cover

- **Builds**: if you need to compile, go to `react-native-expo` and `references/deployment.md` (EAS / `expo run:android`).
- **iOS / web**: different tools (`xcrun simctl`, Safari Web Inspector, Playwright).
- **Modifying production code**: use the `coder` agent. Here you only read.
- **Persistent automated tests**: for stable E2E use Maestro or Detox (see `react-native-expo/references/deployment.md` §testing). This skill is for **manual exploration and incident debugging**.
