---
name: adb-qa
description: Operational guide for QA testing the Zuma POS Android app via `adb`. Read this when the user asks to install, launch, debug, inspect, or test the Android app on a device or emulator — including "install the APK on my phone", "launch the app on the emulator", "read crash logs", "tap a button via adb", "screenshot a flow", "inspect the local SQLite DB", "what's the package name", "why did the app ANR", "how much memory is the app using", "verify a release build", "smoke test before release", "reproduce a customer-reported bug on Android". Covers the full QA loop: device enumeration, install/replace/downgrade/uninstall, launch (monkey + am start + deep links), input simulation (tap/swipe/type/keyevent), screenshots, uiautomator UI dumps, logcat filtering, filesystem access, SQLite inspection, network capture, ANR/crash investigation, and performance basics. Package name is fixed at `com.egsolutions.zumapos` (read from `app.json`); everything else is generic adb. Do NOT use this skill for iOS testing, web testing, or for building the APK — building is covered by the `react-native-expo` skill (deployment references). Do NOT write or modify production code from here: this skill is read-and-inspect only against the running device.
---

# adb-qa — QA del app Android Zuma POS

> **Qué hace esta skill.** Es la navaja suiza operativa del QA agent sobre un device/emulador Android. Cubre desde `adb devices` hasta captura de un tombstone, **sin escribir código de producción**. La parte de **construir** la APK ya vive en la skill `react-native-expo` (sección `references/deployment.md`); aquí se asume que la APK ya existe o que se instala desde un feed de desarrollo.
>
> **Cuándo NO disparar esta skill.** Si la pregunta es de iOS (`xcrun simctl`, Xcode), web (`playwright`), backend puro, o "cómo compilo la app", redirige a las skills correctas.

## Reglas duras (y por qué importan)

1. **Package name fijo: `com.egsolutions.zumapos`.** Sale de `app.json:27` (`android.package`). Si tienes dudas sobre el bundle, lee `app.json` antes de asumir. Una constante mal escrita se manifiesta como `INSTALL_FAILED_USER_RESTRICTED` o `[INSTALL_FAILED_ALREADY_EXISTS]` con un mensaje críptico.
2. **`adb -s <serial>` cuando hay más de un device.** El comportamiento por defecto es "todos" solo si no especificas serial. Con un emulador + un físico conectados (o varios AVDs), un comando sin `-s` se aplica a todos y produce acciones no deseadas (formateos accidentales, desinstalaciones masivas).
3. **Esta skill es de lectura e inspección; no toca lógica de la app.** Si descubres un bug en el código, **repórtalo** vía `qa` agent o handoff al `coder`; no modifiques `app/`/`api/` desde aquí.
4. **Nunca `adb uninstall` sin confirmación.** Pierde datos del usuario (settings de onboarding, fiados en SQLite local). Antes de uninstall, ofrece `adb shell pm clear com.egsolutions.zumapos` que solo limpia datos sin desinstalar.
5. **`adb logcat -c` borra el buffer.** Es destructivo pero reversible. Pídelo antes de disparar una acción reproducible si quieres un log limpio.
6. **`adb shell screencap -p > screenshot.png` es la forma portable.** La variante `adb shell screencap /sdcard/x.png && adb pull …` también funciona, pero el `-p` directo evita el paso intermedio y es lo que usa la doc oficial de Android.
7. **El emulator tiene `10.0.2.2` como loopback al host.** Desde el device, `localhost` apunta al device mismo; para hablar con el Metro bundler del host usa `10.0.2.2:8081`. Para device físico, usa `adb reverse tcp:8081 tcp:8081` para hacer que el device redirija ese puerto al host.
8. **QA en emulador ≠ QA en device físico.** Diferencias relevantes: cámara (emulador = imágnes estáticas), GPS (fake), sensores, performance. Smoke en ambos antes de release.
9. **Android 13+ requiere permisos runtime.** `pm grant` solo funciona para permisos de `dangerous` permissions declaradas en el manifest. Si no está declarada, falla con `SecurityException`. Ver `app.json:28-34` para la lista de permisos que pide Zuma (`CAMERA`, `RECORD_AUDIO`, `INTERNET`, `READ/WRITE_EXTERNAL_STORAGE`).
10. **`dumpsys` puede colgar dispositivos viejos.** Tiene un timeout implícito; si no responde en 5s, usa Ctrl-C y baja el volumen del comando.

## Tabla de contenidos

| Archivo | Cubre |
|---|---|
| [`references/devices.md`](references/devices.md) | `adb devices`, `-s <serial>`, pairing Wi-Fi ADB, autorización USB, troubleshooting de "device unauthorized" |
| [`references/install-launch.md`](references/install-launch.md) | `adb install` (y `-r`/`-d`/`-t`), `pm clear`, `uninstall`, launch via `monkey` o `am start`, deep links, granting permissions runtime |
| [`references/inspect.md`](references/inspect.md) | `uiautomator dump` (UI tree XML), `screencap` + pull, filesystem (`/data/data/...`), extracción y query de la DB SQLite (`datasqlite.db`), `dumpsys activity` |
| [`references/debug.md`](references/debug.md) | `logcat` con filtros (package / tag / level / pid), `monkey` para stress, ANR y tombstones, `dumpsys meminfo`/`gfxinfo`, network reverse/forward, `tcpdump` |

## Flujo canónico de un smoke test

```
1. adb devices                                           # ¿qué hay conectado?
2. adb -s <serial> install -r build/output.apk           # replace install
3. adb -s <serial> shell am start -n com.egsolutions.zumapos/.MainActivity
4. adb -s <serial> logcat -c                             # limpia buffer
5. [acción en el device]
6. adb -s <serial> shell screencap -p > shot.png         # captura
7. adb -s <serial> logcat -d -s ReactNativeJS:V *:E     # lee logs
8. adb -s <serial> shell run-as com.egsolutions.zumapos cat /data/data/com.egsolutions.zumapos/databases/datasqlite.db > sqlite.db
9. sqlite3 sqlite.db ".tables"                            # inspecciona DB
```

Adaptar cada paso a la pregunta concreta. El QA agent que dispara esta skill debería poder correr este loop y obtener evidencia suficiente para un reporte.

## Decisiones rápidas por caso

### "¿La app crashea en X pantalla?"
→ Lanza con `-W -S` (`am start -W -S` para stop la app primero), captura `logcat -d -b crash` y `logcat -d *:E`. Si ves `FATAL EXCEPTION:`, abre el stack trace completo (ver `references/debug.md` §ANR y crash).

### "¿Qué datos tiene guardados?"
→ `run-as com.egsolutions.zumapos` para entrar a `/data/data/...` (solo funciona en debug builds; en release no). Extrae `databases/datasqlite.db` y ábrelo con `sqlite3` (ver `references/inspect.md` §SQLite).

### "¿Por qué la pantalla está en blanco?"
→ 1) Screenshot. 2) `adb shell dumpsys activity top` para ver qué activity está al frente. 3) `logcat -d ReactNativeJS:V *:E`.

### "¿Cómo simulo un tap en X,Y?"
→ `adb shell input tap 540 1200`. Para conocer coordenadas usa `uiautomator dump` (ver `references/inspect.md` §UI tree) o `screencap` + inspección visual.

### "¿Cuánta memoria está usando la app?"
→ `adb shell dumpsys meminfo com.egsolutions.zumapos`. Mira `TOTAL PSS` y `Java Heap`. Compara entre dos puntos del flujo para detectar leaks.

### "Reproduce esto en device"
→ Identifica: device, OS version, build type (`debug` vs `release`), datos del usuario. Con `pm clear` borras datos pero mantienes la app; con `uninstall` + `install` reproduces instalación desde cero.

### "¿Cómo abro la app en un deep link?"
→ `adb shell am start -a android.intent.action.VIEW -d "zumapos://sales/123"` (scheme declarado en `app.json:8`).

### "¿La build release está bien?"
→ Verifica firma con `adb shell pm dump com.egsolutions.zumapos | grep -A2 'signatures'` y que el APK no contenga `__DEV__ = true` en logs (los logs de Hermes en release son notoriously vacíos — eso es normal).

## Lo que NO cubre esta skill

- **Builds**: si necesitas compilar, ve a `react-native-expo` y `references/deployment.md` (EAS / `expo run:android`).
- **iOS / web**: herramientas distintas (`xcrun simctl`, Safari Web Inspector, Playwright).
- **Modificar código de producción**: usa `coder` agent. Aquí solo lees.
- **Tests automatizados persistentes**: para E2E estable usa Maestro o Detox (ver `react-native-expo/references/deployment.md` §testing). Esta skill es para **exploración manual y debugging de incidentes**.
