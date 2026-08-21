# Debug — logs, network, ANR/crash, performance

## logcat — el 80% del debugging

### Comandos esenciales

```bash
# Ver todo (no lo hagas en producción: spam)
adb -s <serial> logcat

# Filtrar por nivel
adb -s <serial> logcat '*:E'                    # solo errores
adb -s <serial> logcat '*:W'                    # warnings + errors
adb -s <serial> logcat '*:I'                    # info+

# Filtrar por tag
adb -s <serial> logcat -s ReactNativeJS:V        # JS logs en RN
adb -s <serial> logcat -s ReactNative:V

# Filtrar por package (Android 7+, API 24+)
adb -s <serial> logcat --pid $(adb -s <serial> shell pidof com.egsolutions.zumapos)

# Combinar filtros
adb -s <serial> logcat *:E ReactNativeJS:V AndroidRuntime:V
```

### Buffer estratégico

```bash
adb -s <serial> logcat -b crash                # solo buffer de crashes
adb -s <serial> logcat -b main                # buffer principal (default)
adb -s <serial> logcat -b all                 # todos los buffers concatenados
```

### Operaciones útiles

```bash
# Limpiar buffer antes de reproducir
adb -s <serial> logcat -c

# Leer buffer completo y salir
adb -s <serial> logcat -d > logcat.txt

# Logcat con timestamp formateado
adb -s <serial> logcat -v time -d

# Formato JSON para parseo automático
adb -s <serial> logcat -v json -d | jq 'select(.pid == 1234)'
```

### Patrón de debugging típico

```bash
adb -s <serial> logcat -c
# <reproducir el bug en el device>
adb -s <serial> logcat -d -v time > logcat.txt
grep -A 30 "FATAL EXCEPTION" logcat.txt
```

## Network

### Reverse port forward (la app habla al host)

Crítico para development con Metro bundler:

```bash
adb -s <serial> reverse tcp:8081 tcp:8081    # device:8081 → host:8081
adb -s <serial> reverse --list              # confirmar
adb -s <serial> reverse --remove tcp:8081   # limpiar al terminar
```

Sin esto, la app en el device no puede alcanzar el Metro del host (que escucha en `localhost:8081`). En el emulador puedes usar `10.0.2.2:8081` en lugar del forward.

### Forward port forward (host habla al device)

Útil para conectar a un servidor embebido en la app o para `dumpsys` desde un puerto específico:

```bash
adb -s <serial> forward tcp:9000 localabstract:chrome_devtools_remote_1234
```

Donde `chrome_devtools_remote_<pid>` es el abstract socket que abre RN para Flipper / Chrome DevTools. Pega `localhost:9000` en Chrome DevTools.

### Captura de tráfico con tcpdump

Requiere root o build debuggable. Para emulador:

```bash
# El emulador expone qemu pipes para captura nativa
adb -s <serial> shell "tcpdump -i any -w /sdcard/cap.pcap" &
# <reproducir tráfico>
adb -s <serial> pull /sdcard/cap.pcap .
# Abrir con Wireshark localmente
```

Si tcpdump no está en el device, alternativa: configurar proxy:

```bash
adb -s <serial> shell settings put global http_proxy 127.0.0.1:8888
# luego corre mitmproxy local en :8888
```

## ANR y crashes

### Detectar ANR (Application Not Responding)

```bash
adb -s <serial> shell cat /data/anr/traces.txt
```

Si el archivo no existe, no hay ANR reciente. Si existe, contiene el stack trace del thread principal.

### Tomstones (crashes nativos)

```bash
adb -s <serial> shell ls /data/tombstones/
adb -s <serial> pull /data/tombstones/
adb -s <serial> shell tombstones    # si está disponible
```

Los tombstones son para crashes en código nativo (C/C++, no JS). Para Zuma, normalmente no aplica — RN corre en Hermes/V8 sobre Java. Pero si integras alguna lib nativa con JSI, podrían aparecer.

### Crash log del sistema

```bash
adb -s <serial> logcat -b crash -d
```

Busca la línea:
```
FATAL EXCEPTION: main
Process: com.egsolutions.zumapos, PID: 12345
java.lang.RuntimeException: ...
```

`AndroidRuntime` es el tag típico.

## Performance básico

### Memoria

```bash
adb -s <serial> shell dumpsys meminfo com.egsolutions.zumapos
```

Output clave:
- `TOTAL PSS`: RSS + swap compartido. **Métrica de memory pressure real.**
- `Java Heap`: memoria Java asignada.
- `Native Heap`: memoria nativa (Hermes, módulos nativos).
- `Graphics`: memoria GPU (skia).
- `Code`: memoria del código compilado.

Si `TOTAL PSS` sube sin volver a bajar entre dos puntos del flujo, **probable leak**.

### GPU rendering time

```bash
# Habilitar
adb -s <serial> shell setprop debug.hwui.profile true
# Reproducir flujo
adb -s <serial> shell dumpsys gfxinfo com.egsolutions.zumapos reset
# <flujo>
adb -s <serial> shell dumpsys gfxinfo com.egsolutions.zumapos > gfx.txt
```

Luego en `gfx.txt` busca `Total frames rendered` y `95th percentile`. >16ms por frame significa drops.

### CPU por proceso

```bash
adb -s <serial> shell top -p $(adb -s <serial> shell pidof com.egsolutions.zumapos)
```

Para log continuo (5 segundos):
```bash
adb -s <serial> shell top -d 1 -n 5 -p $(adb -s <serial> shell pidof com.egsolutions.zumapos)
```

Si CPU% se queda >50% en idle, hay un loop o animación descontrolada.

## Stress testing con `monkey`

Disparar 500 eventos aleatorios:
```bash
adb -s <serial> shell monkey -p com.egsolutions.zumapos --throttle 100 -v 500
```

`--throttle 100` = 100ms entre eventos (5x/seg). Reduce spam. Si la app crashea con monkey, hay problema de robustez general (no solo del flujo feliz).

`-s <seed>` permite reproducir la misma secuencia exacta — útil para repros de bugs aleatorios.

## Limpiar y reiniciar

```bash
# Solo cache
adb -s <serial> shell pm clear com.egsolutions.zumapos
# ^ equivalente a desinstalar + reinstalar sin perder la app

# Limpiar logs y reiniciar adb (raro necesario)
adb kill-server && adb start-server
```

Si el device está congelado:
```bash
adb -s <serial> reboot
# Esperamos ~30s a que vuelva
adb wait-for-device
```
