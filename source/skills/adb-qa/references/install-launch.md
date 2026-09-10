# Install + Launch + Permissions

## Install

```bash
adb -s <serial> install /path/to/zumapos.apk
```

Useful flags:

| Flag | Meaning |
|---|---|
| `-r` | Replaces existing installation (preserves data). **Almost always you want this.** |
| `-d` | Allows version downgrade. Useful for going back to a previous build during debugging. |
| `-t` | Allows test-only APKs (not recommended in production). |
| `-g` | Automatically grants all declared runtime permissions. Useful for smoke; **do not use for permission validation**. |
| `--abi` | Force a specific ABI on install (multi-APK split). |

Example of the flow you will use 90% of the time:
```bash
adb -s <serial> install -r build/output.apk
```

Verify that the install ended up with the correct version:
```bash
adb shell dumpsys package com.egsolutions.zumapos | grep -E "versionName|versionCode"
```

## Clear data without uninstalling

```bash
adb -s <serial> shell pm clear com.egsolutions.zumapos
```

This resets user onboarding, products, credit records, everything. It is the functional equivalent of "uninstall + install", but faster and reversible without reinstalling.

**When to use:** reproduce bugs that depend on the initial state (fresh install).
**When NOT to use:** if you need to validate flows that depend on previous user data.

## Uninstall

```bash
adb -s <serial> uninstall com.egsolutions.zumapos
```

Only if you are sure. **Confirm with the human first.** There is no going back (local SQLite DB data is gone).

`uninstall -k` keeps `data/` and `cache/` after uninstall — useful for extreme forensics cases.

## Launch the app

Three ways, in order of recommendation:

### 1. `monkey` (simplest, sufficient in 99% of cases)

```bash
adb -s <serial> shell monkey -p com.egsolutions.zumapos -c android.intent.category.LAUNCHER 1
```

`1` at the end = a single event. Useful to not spam. `monkey` resolves the launcher on its own; you do not need to know the activity name.

### 2. `am start` with the explicit activity

```bash
adb -s <serial> shell am start -n com.egsolutions.zumapos/.MainActivity
```

Advantage: the `-W` flag waits for the activity to be rendered and reports timings:
```bash
adb shell am start -W -n com.egsolutions.zumapos/.MainActivity
# Status: ok
# LaunchState: cold
# Activity: com.egsolutions.zumapos/.MainActivity
# TotalTime: 1234
# WaitTime: 567
```

`-S` (stop) forces a guaranteed cold start.

### 3. Deep links

```bash
adb -s <serial> shell am start -a android.intent.action.VIEW -d "zumapos://sales/42"
```

The scheme is declared in `app.json:8` as `zumapos`. Verify with:
```bash
adb shell pm dump com.egsolutions.zumapos | grep -A2 "scheme"
```

If you are not sure of the scheme, query the manifest:
```bash
adb shell dumpsys package com.egsolutions.zumapos | grep -A20 "Activity Resolver"
```

## Stop the app

```bash
adb -s <serial> shell am force-stop com.egsolutions.zumapos
```

Difference from `kill`: `kill` kills the process (can leave dirty tasks); `force-stop` is the equivalent of swipe-from-recents.

## Runtime permissions (Android 6+)

Grant permissions without going through the dialog:
```bash
adb -s <serial> shell pm grant com.egsolutions.zumapos android.permission.CAMERA
adb -s <serial> shell pm grant com.egsolutions.zumapos android.permission.RECORD_AUDIO
```

Revoke:
```bash
adb -s <serial> shell pm revoke com.egsolutions.zumapos android.permission.CAMERA
```

List declared permissions:
```bash
adb shell dumpsys package com.egsolutions.zumapos | grep "permission" | head -30
```

**Android 13+ attention:** `POST_NOTIFICATIONS` and `READ_MEDIA_*` are new and require explicit `pm grant`. If the notification feature is not visible, this is the first place to check.

## APK path on the device (post-install)

```bash
adb shell pm path com.egsolutions.zumapos
# /data/app/~~xyz.../com.egsolutions.zumapos-XXXX==/base.apk
```

Useful for `adb pull` the installed APK and compare it with the one you have locally (signature, size, hash).
