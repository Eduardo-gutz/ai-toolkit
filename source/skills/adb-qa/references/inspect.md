# Inspect — UI tree, screenshots, filesystem, SQLite

## UI tree with uiautomator

The fastest way to map coordinates and visible elements.

```bash
adb -s <serial> shell uiautomator dump
# Pulling UI XML to device: /sdcard/window_dump.xml
adb -s <serial> pull /sdcard/window_dump.xml ui.xml
```

`ui.xml` contains all clickable elements, with their coordinates (`bounds="[x1,y1][x2,y2]"`), `text`, `resource-id`, `content-desc`, `class`. Useful for:

- Locating a button by text: `grep 'text="Cancelar venta"' ui.xml`.
- Calculating the button's center: with `bounds="[120,300][420,400]"`, center = `(270, 350)`.

Useful bash scripts:
```bash
# List all visible texts
grep -oP 'text="\K[^"]+' ui.xml | sort -u

# Coordinates of the "Cancelar venta" button
python3 -c "
import re
with open('ui.xml') as f: data = f.read()
m = re.search(r'text=\"Cancelar venta\"[^/]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"', data)
if m:
    x1, y1, x2, y2 = map(int, m.groups())
    print(f'tap {(x1+x2)//2} {(y1+y2)//2}')
"
```

**Limitation:** uiautomator dump does not capture React Native native elements if they are drawn as a single view (RN uses a single `ReactRootView` that wraps everything). In those cases the button text does not appear in the dump and you need a screenshot + visual analysis.

## Screenshots

Portable form:
```bash
adb -s <serial> exec-out screencap -p > shot-$(date +%s).png
```

`exec-out` is preferable to piping to a local file from the device — it avoids the double step `screencap /sdcard/x.png && adb pull`.

For full-size capture without scaling:
```bash
adb -s <serial> shell wm size
adb -s <serial> exec-out screencap -p > full.png
```

**Useful automation trick:** convert the screenshot to base64 and paste it in the transcript for visual review:
```bash
adb exec-out screencap -p | base64 | head -c 200
```

## Filesystem / app data

In **debug builds** you can enter with `run-as`:
```bash
adb -s <serial> shell run-as com.egsolutions.zumapos ls -la /data/data/com.egsolutions.zumapos/
```

You will see:
```
cache/
databases/
files/
lib/
shared_prefs/
```

In **release builds**, `run-as` is rejected with `run-as: Package 'com.egsolutions.zumapos' is not debuggable`. To force access in release, you need root (`adb root` only works on userdebug/eng builds; in real production it is not an option).

### Pull specific files

```bash
# Logs
adb -s <serial> shell run-as com.egsolutions.zumapos cat files/log.txt > log.txt

# DB (see SQLite section)
adb -s <serial> shell run-as com.egsolutions.zumapos cat databases/datasqlite.db > datasqlite.db
```

### Push (not common, but useful for testing fixtures)

```bash
adb -s <serial> push ./fixture-product.csv /sdcard/Download/
```

## SQLite (Zuma's local DB)

Zuma uses `expo-sqlite` (see `app.json:54`) which materializes a local SQLite DB at `/data/data/com.egsolutions.zumapos/databases/`. The exact name depends on how it was initialized, the most common: `datasqlite.db`, `zuma.db`, `data.db`.

### Extract the DB

```bash
adb -s <serial> shell run-as com.egsolutions.zumapos \
  cp databases/datasqlite.db /sdcard/datasqlite.db
adb -s <serial> pull /sdcard/datasqlite.db .
```

`run-as cp` avoids "text file busy" problems if the DB is open by the app. Using `cat` directly can give a consistent or truncated copy depending on the moment.

### Inspect

```bash
sqlite3 datasqlite.db ".tables"
# products  sale_items  sales  customers  credit_payments  business_config  ...

sqlite3 datasqlite.db ".schema sales"
# CREATE TABLE sales (
#   id INTEGER PRIMARY KEY AUTOINCREMENT,
#   total INTEGER NOT NULL,
#   ...
# );

sqlite3 datasqlite.db "SELECT id, total, status, createdAt FROM sales ORDER BY createdAt DESC LIMIT 5;"
```

To avoid installing `sqlite3` locally, you can inspect via adb directly:
```bash
adb shell run-as com.egsolutions.zumapos sqlite3 databases/datasqlite.db "SELECT * FROM sales LIMIT 5;"
```

This requires the `sqlite3` binary to exist on the device (it comes by default in AOSP; user-builds not always).

## Activity on top

```bash
adb -s <serial> shell dumpsys activity top
```

Extensive output with `ACTIVITY com.egsolutions.zumapos/.MainActivity`. Useful to confirm the app is on top after an `am start`, or to diagnose "it went to the background and I don't know why".

## Backstack

```bash
adb -s <serial> shell dumpsys activity activities
```

Lists all activities in the back stack with their states. Useful to reproduce "screen X was duplicated" bugs.

## Process information

```bash
adb -s <serial> shell ps -A | grep zumapos
adb -s <serial> shell cat /proc/$(adb shell pidof com.egsolutions.zumapos)/status | head -20
```

Current PID: `adb shell pidof com.egsolutions.zumapos`. Useful for filters in `logcat --pid`.
