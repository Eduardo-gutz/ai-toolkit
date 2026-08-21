# Inspect — UI tree, screenshots, filesystem, SQLite

## UI tree con uiautomator

El modo más rápido para mapear coordenadas y elementos visibles.

```bash
adb -s <serial> shell uiautomator dump
# Pulling UI XML to device: /sdcard/window_dump.xml
adb -s <serial> pull /sdcard/window_dump.xml ui.xml
```

`ui.xml` contiene todos los elementos clickeables, con sus coordenadas (`bounds="[x1,y1][x2,y2]"`), `text`, `resource-id`, `content-desc`, `class`. Útil para:

- Localizar un botón por texto: `grep 'text="Cancelar venta"' ui.xml`.
- Calcular centro del botón: con `bounds="[120,300][420,400]"`, centro = `(270, 350)`.

Scripts útiles en bash:
```bash
# Listar todos los textos visibles
grep -oP 'text="\K[^"]+' ui.xml | sort -u

# Coordenadas del botón "Cancelar venta"
python3 -c "
import re
with open('ui.xml') as f: data = f.read()
m = re.search(r'text=\"Cancelar venta\"[^/]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"', data)
if m:
    x1, y1, x2, y2 = map(int, m.groups())
    print(f'tap {(x1+x2)//2} {(y1+y2)//2}')
"
```

**Limitación:** uiautomator dump no captura elementos nativos de React Native si están dibujados como vista única (RN usa una sola `ReactRootView` que envuelve todo). En esos casos el texto del botón no aparece en el dump y necesitas screenshot + análisis visual.

## Screenshots

Forma portable:
```bash
adb -s <serial> exec-out screencap -p > shot-$(date +%s).png
```

`exec-out` es preferible al pipe con `> archivo-local` desde el device — evita el doble paso `screencap /sdcard/x.png && adb pull`.

Para captura a tamaño completo sin escalar:
```bash
adb -s <serial> shell wm size
adb -s <serial> exec-out screencap -p > full.png
```

**Truco útil para automatización:** convierte la screenshot a base64 y la pegas en el transcript para revisión visual:
```bash
adb exec-out screencap -p | base64 | head -c 200
```

## Filesystem / app data

En **debug builds** puedes entrar con `run-as`:
```bash
adb -s <serial> shell run-as com.egsolutions.zumapos ls -la /data/data/com.egsolutions.zumapos/
```

Verás:
```
cache/
databases/
files/
lib/
shared_prefs/
```

En **release builds**, `run-as` se rechaza con `run-as: Package 'com.egsolutions.zumapos' is not debuggable`. Para forzar acceso en release, necesitas root (`adb root` solo funciona en userdebug/eng builds; en producción real no es opción).

### Pull de archivos específicos

```bash
# Logs
adb -s <serial> shell run-as com.egsolutions.zumapos cat files/log.txt > log.txt

# DB (ver sección SQLite)
adb -s <serial> shell run-as com.egsolutions.zumapos cat databases/datasqlite.db > datasqlite.db
```

### Push (no es frecuente, pero útil para fixtures de testing)

```bash
adb -s <serial> push ./fixture-product.csv /sdcard/Download/
```

## SQLite (DB local de Zuma)

Zuma usa `expo-sqlite` (ver `app.json:54`) que materializa una DB SQLite local en `/data/data/com.egsolutions.zumapos/databases/`. El nombre exacto depende de cómo se inicializó, los más comunes: `datasqlite.db`, `zuma.db`, `data.db`.

### Extraer la DB

```bash
adb -s <serial> shell run-as com.egsolutions.zumapos \
  cp databases/datasqlite.db /sdcard/datasqlite.db
adb -s <serial> pull /sdcard/datasqlite.db .
```

`run-as cp` evita problemas de "text file busy" si la DB está abierta por la app. Usar `cat` directo puede dar una copia consistente o truncada según el momento.

### Inspeccionar

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

Para no instalar `sqlite3` localmente, puedes inspeccionar vía adb directo:
```bash
adb shell run-as com.egsolutions.zumapos sqlite3 databases/datasqlite.db "SELECT * FROM sales LIMIT 5;"
```

Esto requiere que el `sqlite3` binary exista en el device (viene por defecto en AOSP; user-builds no siempre).

## Activity al frente

```bash
adb -s <serial> shell dumpsys activity top
```

Output extenso con `ACTIVITY com.egsolutions.zumapos/.MainActivity`. Útil para confirmar que la app está al frente después de un `am start`, o para diagnosticar "se fue al background y no sé por qué".

## Backstack

```bash
adb -s <serial> shell dumpsys activity activities
```

Lista todas las activities en el back stack con sus estados. Útil para reproducir bugs de "se duplicó la pantalla X".

## Información del proceso

```bash
adb -s <serial> shell ps -A | grep zumapos
adb -s <serial> shell cat /proc/$(adb shell pidof com.egsolutions.zumapos)/status | head -20
```

PID actual: `adb shell pidof com.egsolutions.zumapos`. Útil para filtros en `logcat --pid`.
