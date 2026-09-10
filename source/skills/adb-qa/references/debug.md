# Debug — logs, network, ANR/crash, performance

## logcat — 80% of debugging

### Essential commands

```bash
# View everything (don't do this in production: spam)
adb -s <serial> logcat

# Filter by level
adb -s <serial> logcat '*:E'                    # errors only
adb -s <serial> logcat '*:W'                    # warnings + errors
adb -s <serial> logcat '*:I'                    # info+

# Filter by tag
adb -s <serial> logcat -s ReactNativeJS:V        # JS logs in RN
adb -s <serial> logcat -s ReactNative:V

# Filter by package (Android 7+, API 24+)
adb -s <serial> logcat --pid $(adb -s <serial> shell pidof com.egsolutions.zumapos)

# Combine filters
adb -s <serial> logcat *:E ReactNativeJS:V AndroidRuntime:V
```

### Strategic buffer

```bash
adb -s <serial> logcat -b crash                # crash buffer only
adb -s <serial> logcat -b main                # main buffer (default)
adb -s <serial> logcat -b all                 # all buffers concatenated
```

### Useful operations

```bash
# Clear buffer before reproducing
adb -s <serial> logcat -c

# Read full buffer and exit
adb -s <serial> logcat -d > logcat.txt

# Logcat with formatted timestamp
adb -s <serial> logcat -v time -d

# JSON format for automatic parsing
adb -s <serial> logcat -v json -d | jq 'select(.pid == 1234)'
```

### Typical debugging pattern

```bash
adb -s <serial> logcat -c
# <reproduce the bug on the device>
adb -s <serial> logcat -d -v time > logcat.txt
grep -A 30 "FATAL EXCEPTION" logcat.txt
```

## Network

### Reverse port forward (the app talks to the host)

Critical for development with Metro bundler:

```bash
adb -s <serial> reverse tcp:8081 tcp:8081    # device:8081 → host:8081
adb -s <serial> reverse --list              # confirm
adb -s <serial> reverse --remove tcp:8081   # clean up when done
```

Without this, the app on the device cannot reach the host's Metro (which listens on `localhost:8081`). On the emulator you can use `10.0.2.2:8081` instead of forward.

### Forward port forward (host talks to device)

Useful to connect to a server embedded in the app or to `dumpsys` from a specific port:

```bash
adb -s <serial> forward tcp:9000 localabstract:chrome_devtools_remote_1234
```

Where `chrome_devtools_remote_<pid>` is the abstract socket RN opens for Flipper / Chrome DevTools. Paste `localhost:9000` in Chrome DevTools.

### Traffic capture with tcpdump

Requires root or debuggable build. For emulator:

```bash
# The emulator exposes qemu pipes for native capture
adb -s <serial> shell "tcpdump -i any -w /sdcard/cap.pcap" &
# <reproduce traffic>
adb -s <serial> pull /sdcard/cap.pcap .
# Open with Wireshark locally
```

If tcpdump is not on the device, alternative: configure proxy:

```bash
adb -s <serial> shell settings put global http_proxy 127.0.0.1:8888
# then run mitmproxy locally on :8888
```

## ANR and crashes

### Detect ANR (Application Not Responding)

```bash
adb -s <serial> shell cat /data/anr/traces.txt
```

If the file does not exist, there is no recent ANR. If it exists, it contains the main thread's stack trace.

### Tombstones (native crashes)

```bash
adb -s <serial> shell ls /data/tombstones/
adb -s <serial> pull /data/tombstones/
adb -s <serial> shell tombstones    # if available
```

Tombstones are for crashes in native code (C/C++, not JS). For Zuma, normally does not apply — RN runs on Hermes/V8 over Java. But if you integrate some native lib with JSI, they could appear.

### System crash log

```bash
adb -s <serial> logcat -b crash -d
```

Look for the line:
```
FATAL EXCEPTION: main
Process: com.egsolutions.zumapos, PID: 12345
java.lang.RuntimeException: ...
```

`AndroidRuntime` is the typical tag.

## Basic performance

### Memory

```bash
adb -s <serial> shell dumpsys meminfo com.egsolutions.zumapos
```

Key output:
- `TOTAL PSS`: RSS + shared swap. **Real memory pressure metric.**
- `Java Heap`: assigned Java memory.
- `Native Heap`: native memory (Hermes, native modules).
- `Graphics`: GPU memory (skia).
- `Code`: compiled code memory.

If `TOTAL PSS` goes up without coming back down between two points in the flow, **likely leak**.

### GPU rendering time

```bash
# Enable
adb -s <serial> shell setprop debug.hwui.profile true
# Reproduce flow
adb -s <serial> shell dumpsys gfxinfo com.egsolutions.zumapos reset
# <flow>
adb -s <serial> shell dumpsys gfxinfo com.egsolutions.zumapos > gfx.txt
```

Then in `gfx.txt` look for `Total frames rendered` and `95th percentile`. >16ms per frame means drops.

### CPU per process

```bash
adb -s <serial> shell top -p $(adb -s <serial> shell pidof com.egsolutions.zumapos)
```

For continuous log (5 seconds):
```bash
adb -s <serial> shell top -d 1 -n 5 -p $(adb -s <serial> shell pidof com.egsolutions.zumapos)
```

If CPU% stays >50% at idle, there is a loop or uncontrolled animation.

## Stress testing with `monkey`

Fire 500 random events:
```bash
adb -s <serial> shell monkey -p com.egsolutions.zumapos --throttle 100 -v 500
```

`--throttle 100` = 100ms between events (5x/sec). Reduces spam. If the app crashes with monkey, there is a general robustness problem (not just happy flow).

`-s <seed>` allows reproducing the same exact sequence — useful for repros of random bugs.

## Clean up and restart

```bash
# Just cache
adb -s <serial> shell pm clear com.egsolutions.zumapos
# ^ equivalent to uninstall + reinstall without losing the app

# Clear logs and restart adb (rarely needed)
adb kill-server && adb start-server
```

If the device is frozen:
```bash
adb -s <serial> reboot
# Wait ~30s for it to come back
adb wait-for-device
```
