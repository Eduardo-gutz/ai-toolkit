# Install + Launch + Permisos

## Install

```bash
adb -s <serial> install /path/to/zumapos.apk
```

Flags útiles:

| Flag | Significado |
|---|---|
| `-r` | Reemplaza instalación existente (preserva datos). **Casi siempre lo quieres.** |
| `-d` | Permite downgrade de versión. Útil para volver a una build anterior durante debugging. |
| `-t` | Permite test-only APKs (no recomendables en producción). |
| `-g` | Otorga automáticamente todos los permisos runtime declarados. Útil para smoke; **no usar para validación de permisos**. |
| `--abi` | Forzar ABI específico al instalar (multi-APK split). |

Ejemplo del flujo que vas a usar el 90% del tiempo:
```bash
adb -s <serial> install -r build/output.apk
```

Verificar que la instalación quedó con la versión correcta:
```bash
adb shell dumpsys package com.egsolutions.zumapos | grep -E "versionName|versionCode"
```

## Limpiar datos sin desinstalar

```bash
adb -s <serial> shell pm clear com.egsolutions.zumapos
```

Esto resetea el onboarding del usuario, productos, fiados, todo. Es el equivalente funcional de "desinstalar + instalar", pero más rápido y reversible sin reinstalar.

**Cuándo usar:** reproducir bugs que dependen del estado inicial (fresh install).
**Cuándo NO usar:** si necesitas validar flujos que dependen de datos previos del usuario.

## Desinstalar

```bash
adb -s <serial> uninstall com.egsolutions.zumapos
```

Solo si estás seguro. **Confirmar con el humano antes.** No hay vuelta atrás (los datos de la DB SQLite local se van).

`uninstall -k` mantiene `data/` y `cache/` después de uninstall — útil para casos extremos de forensics.

## Lanzar la app

Tres formas, en orden de recomendación:

### 1. `monkey` (la más simple, suficiente en el 99% de casos)

```bash
adb -s <serial> shell monkey -p com.egsolutions.zumapos -c android.intent.category.LAUNCHER 1
```

`1` al final = un solo evento. Útil para no spammear. `monkey` resuelve el launcher por su cuenta; no necesitas saber el nombre de la activity.

### 2. `am start` con la activity explícita

```bash
adb -s <serial> shell am start -n com.egsolutions.zumapos/.MainActivity
```

Ventaja: el flag `-W` espera a que la activity esté rendered y reporta tiempos:
```bash
adb shell am start -W -n com.egsolutions.zumapos/.MainActivity
# Status: ok
# LaunchState: cold
# Activity: com.egsolutions.zumapos/.MainActivity
# TotalTime: 1234
# WaitTime: 567
```

`-S` (stop) fuerza un cold start garantizado.

### 3. Deep links

```bash
adb -s <serial> shell am start -a android.intent.action.VIEW -d "zumapos://sales/42"
```

El scheme está declarado en `app.json:8` como `zumapos`. Verifica con:
```bash
adb shell pm dump com.egsolutions.zumapos | grep -A2 "scheme"
```

Si no tienes certeza del scheme, query al manifest:
```bash
adb shell dumpsys package com.egsolutions.zumapos | grep -A20 "Activity Resolver"
```

## Detener la app

```bash
adb -s <serial> shell am force-stop com.egsolutions.zumapos
```

Diferencia con `kill`: `kill` mata el proceso (puede dejar tasks sucias); `force-stop` es el equivalente a swipe-from-recents.

## Permisos runtime (Android 6+)

Otorgar permisos sin pasar por el diálogo:
```bash
adb -s <serial> shell pm grant com.egsolutions.zumapos android.permission.CAMERA
adb -s <serial> shell pm grant com.egsolutions.zumapos android.permission.RECORD_AUDIO
```

Revocar:
```bash
adb -s <serial> shell pm revoke com.egsolutions.zumapos android.permission.CAMERA
```

Listar permisos declarados:
```bash
adb shell dumpsys package com.egsolutions.zumapos | grep "permission" | head -30
```

**Atención Android 13+:** `POST_NOTIFICATIONS` y `READ_MEDIA_*` son nuevos y requieren `pm grant` explícito. Si la feature de notificación no se ve, este es el primer lugar a revisar.

## Path del APK en el device (post-install)

```bash
adb shell pm path com.egsolutions.zumapos
# /data/app/~~xyz.../com.egsolutions.zumapos-XXXX==/base.apk
```

Útil para `adb pull` el APK instalado y compararlo con el que tienes localmente (firma, tamaño, hash).
