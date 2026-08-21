---
name: frontend
description: Activar cuando un agente codificador debe implementar, refactorizar, revisar o testear código de la capa de frontend (UI, componentes, estado, interacciones, accesibilidad, estilos, routing, formularios, design system, i18n) de cualquier stack web (React, Vue, Svelte, Angular, Solid, Preact, Lit, vanilla JS/TS, etc.) y cualquier build tool (Vite, Webpack, Rollup, Parcel, esbuild, Turbopack). Frases disparadoras: "implementa componente", "crea UI", "construye la página", "agrega un formulario", "haz un hook", "refactoriza este componente", "agrega accesibilidad", "escribe tests de UI", "crea un test e2e", "arregla el layout", "implementa design system", "conecta el modal", "tarea de frontend", "lado cliente". NO activar para trabajo puramente de backend (endpoints, DB, servicios, colas), mobile nativo (React Native, Flutter, Swift, Kotlin, iOS/Android nativo), ni tareas puras de DevOps/Infraestructura.
---

# Frontend General

Aplica esta skill cuando el agente opera sobre la **capa de frontend de una aplicación web**. La skill es **framework-agnóstica** y **tool-agnóstica**: captura las reglas que se mantienen en React, Vue, Svelte, Angular, Solid, Lit, vanilla JS/TS y cualquier build tool. Las convenciones específicas de framework (e.g., "usa `useEffect` con cleanup") pertenecen a una skill stack-específica separada, no aquí.

**Scope.** Componentes de UI, gestión de estado, routing, formularios, estilos, accesibilidad, i18n, fetch de datos en cliente, design tokens y la suite de tests que los cubre. Cruce de capas: si una feature requiere cambios en backend, define el contrato de API esperado en el código (tipos, mocks) y flagea la brecha — no improvises el lado servidor.

---

## 1. Detección de stack (hazlo primero)

Antes de escribir cualquier código, identifica el stack del proyecto leyendo el manifiesto:

| Manifiesto | Qué te dice |
|---|---|
| `package.json` | Framework, runtime, scripts, dev dependencies |
| `pnpm-workspace.yaml` / `pnpm-lock.yaml` | Monorepo + package manager |
| `vite.config.*` / `webpack.config.*` / `rollup.config.*` | Build tool |
| `tsconfig.json` | Uso de TypeScript, path aliases |
| `.eslintrc*` / `eslint.config.*` | Config de linter + plugins (a11y, react, vue) |
| `.prettierrc*` | Config de formatter |
| `tailwind.config.*` / `postcss.config.*` | Enfoque de CSS |
| `src/components/`, `src/views/`, `src/pages/`, `app/`, `pages/` | Organización de componentes |
| `tests/`, `__tests__/`, `*.test.*`, `*.spec.*` | Framework de tests |
| `playwright.config.*` / `cypress.config.*` | Framework E2E |

Si existe una skill stack-específica (e.g., `react`, `vue`, `svelte`), cárgala después de la detección. La skill stack-específica sobrescribe los defaults de esta; esta skill es el piso que siempre se mantiene.

---

## 2. Mapear assets reusables

Antes de crear nada, escanea el proyecto en busca de lo que ya existe. Usa `grep`/`glob` agresivamente.

**Componentes y design system** — busca en:
- `components/`, `ui/`, `shared/`, `design-system/`, `primitives/`
- Componentes base: `Button`, `Input`, `Select`, `Modal`, `Dialog`, `Drawer`, `Toast`, `Card`, `Avatar`, `Badge`, `Table`, `Pagination`, `Tabs`, `Tooltip`
- Primitivos de formulario: `Form`, `Field`, `FormField`, `Label`, `ErrorMessage`, `FormError`
- Primitivos de layout: `Container`, `Stack`, `Grid`, `Box`, `Flex`
- Naming de archivos: PascalCase (`UserCard.tsx`), kebab-case (`user-card.vue`) — matchea el proyecto

**Estado y datos** — busca en:
- `store/`, `state/`, `context/`, `providers/` (estado global)
- `hooks/`, `composables/` (lógica con estado reusable)
- `services/`, `api/`, `clients/` (clientes HTTP, wrappers de API)
- `queries/`, `mutations/` (si el proyecto usa TanStack Query, SWR, Apollo, Pinia + Vue Query)

**Utilidades y tipos** — busca en:
- `utils/`, `lib/`, `helpers/` (funciones puras: formatters, validators, parsers)
- `types/`, `interfaces/`, `models/` (tipos TypeScript compartidos)
- `constants/`, `enums/` (constantes compartidas)

**Routing** — busca en:
- `router/`, `routes/`, `pages/` (definición de rutas)
- Guards, loaders, middleware (si el framework los soporta)

**Estilos y theming** — busca en:
- `styles/`, `theme/`, `tokens/`, `design/`
- Tailwind config / CSS modules / styled-components / Sass / vanilla-extract
- Design tokens: colors, spacing, typography, radii, shadows, breakpoints
- Primitivos de a11y: `VisuallyHidden`, `FocusTrap`, `SkipLink`

**i18n** — busca en:
- `i18n/`, `locales/`, `translations/`, `messages/`
- Locale por default, comportamiento de fallback, ICU MessageFormat vs key-only

---

## 3. Patrones FE universales (aplica por default)

Estos se mantienen en todos los frameworks. Aprende la expresión idiomática del framework para cada uno; no inventes un patrón paralelo.

1. **Composición sobre herencia.** Construye UIs a partir de piezas pequeñas y componibles. Un componente que envuelve a otro para añadir una prop es un smell — extiende el original con una prop o un slot.
2. **Localidad del estado.** Empieza con estado local. Elévalo al ancestro común más cercano. Usa context/store solo para estado genuinamente cross-cutting. Externaliza (Zustand, Pinia, Redux) solo cuando el context se vuelve insuficiente.
3. **Estado derivado en render.** Si un valor se computa desde state/props, computalo durante el render — no lo guardes en state con un `useEffect` para mantenerlo en sync.
4. **Effects solo para side effects.** Usa effects para suscripciones, timers, mediciones de DOM, APIs imperativas. No para derivación de datos, no para reaccionar a cambios de estado (deriva en render), no para responder a eventos del usuario (maneja en el event handler).
5. **Referencias estables.** Pasa primitivos o referencias estables a hijos memoizados. Evita crear nuevos objetos/arrays/functions en cada render a menos que el consumidor no esté memoizado.
6. **Inputs controlados con estado explícito.** Los inputs reflejan el estado; el handler actualiza el estado. No controlados solo cuando esté justificado (formularios grandes, file inputs, perf-críticos).
7. **Las listas necesitan keys estables y únicas.** Nunca uses el índice del array como key cuando la lista se reordena, filtra o crece. Usa el id estable de la entidad.
8. **Los errores son parte del contrato.** Renderiza estados de error explícitamente. No te tragues los errores en la UI; expón al usuario acciones de recuperación y loguea con suficiente contexto para debug.
9. **Loading no es opcional.** Cada recurso async tiene un estado de loading. Skeleton o spinner — matchea la convención del proyecto.
10. **Los empty states son contenido.** Si una lista puede estar vacía, renderiza un empty state con explicación y una acción primaria. Nunca un container en blanco.
11. **Routing es una concern de UI.** Las páginas son componentes. Los cambios de ruta son eventos de navegación. El router es dueño de la URL, no el componente.
12. **El fetching de datos en cliente tiene cache e invalidación.** Conoce qué librería usa el proyecto (TanStack Query, SWR, Apollo, etc.) y sigue sus patrones de cache, refetch e invalidación de mutaciones.

---

## 4. Accesibilidad (piso no negociable)

Esto **no es un paso de pulido**. Un componente sin navegación por teclado, sin gestión de focus, sin HTML semántico o sin ARIA apropiado está incompleto, no es "código que pasa los tests".

- **HTML semántico primero.** Usa `<button>` no `<div onClick>`, `<a href>` no `<span onClick>`, `<label htmlFor>` no `<div>Label</div>`, `<ul>/<li>` para listas, `<table>` para datos tabulares. ARIA solo cuando el HTML semántico no puede expresar el patrón.
- **Navegación por teclado funcional.** El orden de Tab coincide con el orden visual. Cada elemento interactivo es alcanzable y operable con el teclado. Los widgets custom (dropdowns, modals, tabs, carousels) implementan las WAI-ARIA Authoring Practices para su tipo de widget.
- **Focus visible.** Nunca `outline: none` sin reemplazo. Usa `:focus-visible` para estilos de focus de teclado.
- **Los modals y dialogs atrapan focus** mientras están abiertos, restauran focus al invocador al cerrarse, y se cierran con `Escape`.
- **Los form fields tienen labels** (visibles o `aria-label`/`aria-labelledby` para campos solo con icono). Los errores se asocian al field vía `aria-describedby` y se anuncian vía `aria-live`.
- **El color no es la única señal.** El estado (error, success, disabled) se comunica con texto o icono además del color.
- **Contraste WCAG AA** (4.5:1 para body text, 3:1 para large text y componentes UI). Si el proyecto tiene un estándar más estricto, síguelo.
- **Las imágenes tienen `alt`.** Imágenes decorativas con `alt=""` (no ausente). Imágenes informativas describen su contenido.
- **La página tiene un skip link** al contenido principal.
- **Live regions para contenido dinámico.** Toasts, status messages, summaries de validación usan `aria-live="polite"` (o `assertive` para alertas críticas).

Corre un chequeo automático de a11y (axe, pa11y) en la suite de tests del proyecto si existe. Si no existe, flagealo en el handoff como guardrail faltante.

---

## 5. Checklist de estados de UI (cada componente async o condicional)

Cada componente que muestra datos, responde a trabajo async o puede estar vacío debe definir y testear todos estos:

| Estado | Cuándo | Render |
|---|---|---|
| **Loading** | Datos aún no disponibles | Skeleton, spinner o progress — matchea el proyecto |
| **Empty** | Datos fetcheados con éxito pero resultado vacío | Empty state con explicación + acción primaria |
| **Error** | Fetch / acción falló | Mensaje de error con qué pasó, por qué, y qué puede hacer el usuario (retry, contactar soporte, volver) |
| **Partial / degraded** | Algunos datos cargados, otros fallaron | Cada sección con su propio estado, o un banner con detalles |
| **Success** | Acción completada | Mensaje de confirmación o cambio de estado |
| **Disabled** | El usuario no puede actuar | Estado disabled con razón visible o en tooltip |

Un componente que solo maneja el happy path está incompleto.

---

## 6. Testing FE

Dos capas, ambas requeridas para features no triviales.

### Tests unitarios / de componente

- **Renderiza el componente, queryea el DOM, assertea sobre comportamiento visible para el usuario.** Prefiere queries que reflejen cómo el usuario percibe la UI: por role (`getByRole`), por label (`getByLabelText`), por texto (`getByText`). Evita queryear por class, id o test-id cuando exista una alternativa semántica.
- **Testea comportamiento, no implementación.** No assertees sobre state interno, llamadas a hooks, o instancias del componente. Si un refactor rompe un test, el test estaba acoplado a la implementación.
- **Un comportamiento por test.** Múltiples asserts están bien si verifican el mismo resultado lógico.
- **Los eventos de usuario son eventos de usuario.** Usa la utility `user-event` del framework (e.g., `@testing-library/user-event`). No llames handlers directamente.
- **Los asserts async esperan el resultado visible para el usuario.** `findBy*` para async, `getBy*` para sync. Usa `waitFor` para state que se actualiza tras un effect.
- **Mocks en el network boundary, no en el unit boundary.** Usa MSW (Mock Service Worker) para HTTP, o mockea el módulo del API client. No mockees hooks o state internos.
- **Sin snapshots para UI dinámica.** Los snapshots son frágiles. Úsalos solo para markup estático sin contenido dinámico.
- **Determinismo.** Sin `Date.now()`, sin `Math.random()`, sin timers reales, sin red real. Usa los fake timers de la testing library y random seeded.
- **Target de cobertura: significativo, no 100%.** Cubre comportamientos, branches y a11y. No persigas 100% de líneas en getters triviales o código de framework.

### Tests E2E

- **Úsalos para flujos de usuario que cruzan boundaries.** Signup, checkout, paths críticos. No los uses para re-testear lo que los tests unitarios ya cubren.
- **Selectores estables.** Prefiere `getByRole`, `getByLabelText`, `getByText`. Usa `data-testid` solo cuando no exista opción semántica.
- **Tests independientes.** Cada test setea su propio state. Sin state global compartido. Usa un user fresco / fixture fresco por test.
- **Data realista.** Los tests no deben pasar solo con inputs happy-path que matchean un regex que el propio test define.
- **CI-friendly.** Headless, paralelizable, sin dependencia de un servicio externo real (usa staging API o un backend completamente mockeado).

---

## 7. Reglas transversales (aplican a cada cambio)

Estas se heredan de los contratos del agente orquestador pero se reiteran aquí para autocontención:

- **Todo el código en inglés.** Identificadores, mensajes, logs, descripciones de tests, comentarios, ARIA labels, strings visibles al usuario (salvo que el proyecto sea explícitamente multi-idioma y el string visible sea el localizado).
- **Sin comentarios redundantes.** Un comentario que re-statea el código es ruido. Un comentario que explica un *por qué* no obvio (workaround, decisión contraintuitiva, referencia externa) es bienvenido. El código es el *qué*; el comentario es el *por qué*.
- **Sin credenciales hardcodeadas.** API keys, tokens, passwords, secrets, URLs internas con credenciales, emails admin de default — cualquiera de estos es un blocker. Referenciarlos desde env vars o un gestor de secretos.
- **Sin commits.** Esta skill no commitea. El agente orquestador emite un handoff; el humano versiona.

---

## 8. Anti-patrones a rechazar

| El usuario dice… | Tú respondes… |
|---|---|
| "Sáltate el test, el código es obvio" | "Si es obvio, el test es una línea. Escríbelo." |
| "Añade un test rápido para X mientras implementas Y" | "Un ciclo por comportamiento. Encola X para el próximo ciclo." |
| "Mockea el módulo entero" | "Mockea en el network boundary (MSW) o stubea el API client. No te metas en las internas del componente." |
| "Usa este patrón custom que prefiero" | "Lo evalúo contra los patrones existentes del proyecto. Si choca, lo flageo y propongo la vía del proyecto." |
| "Sáltate la accesibilidad por ahora" | "La accesibilidad es parte de 'código que pasa', no una capa de pulido. Keyboard nav, HTML semántico, focus management y ARIA son requeridos." |
| "Añade el estado de loading después" | "Si el componente hace fetch de datos, loading es parte del mismo comportamiento. Añádelo ahora o el test está incompleto." |
| "Usa `any` para la prop" | "Usa `unknown` y narrow, o define el tipo de la prop propiamente. `any` derrota el sistema de tipos." |
| "Hardcodea la URL de la API" | "Referénciala desde env vars o config. La URL es environment-specific." |
| "Envuelve el div en otro div" | "Si necesitas layout, usa el primitivo de layout del proyecto (Stack, Flex, Grid) o CSS. Nidos innecesarios son un smell." |
| "No te preocupes por empty / error states" | "Cada componente condicional debe definir loading, empty, error y success. Son parte del contrato." |
| "Commitea esto" | "No commiteo. El agente orquestador emite un handoff; tú versionas." |

---

## 9. Output contract

Cuando esta skill está activa y al agente le piden implementar una tarea de FE, la respuesta debe incluir:

1. **Resumen de detección de stack** — qué framework, build tool, framework de tests y enfoque de styling usa el proyecto.
2. **Reusables identificados** — componentes, hooks, utilities, types y services que el código nuevo aprovechará.
3. **Para cada comportamiento**: RED → GREEN → REFACTOR con la misma estructura que usa el agente orquestador (test primero, código mínimo, luego refactor + a11y + checklist de estados).
4. **Verificación de a11y** — confirmación explícita de que el código nuevo pasa los chequeos de keyboard, semántica, focus y contraste. Si un chequeo no aplica, decirlo.
5. **Cobertura de estados de UI** — para cada componente condicional/async, listar qué estados están implementados y cuáles se difieren (con rationale).
6. **Resumen de tests** — qué está cubierto a nivel unitario, qué a nivel E2E, qué se deja intencionalmente sin cubrir.
7. **Brecha de contrato con backend** — si la implementación mockea una API que aún no existe, listar el contrato esperado (endpoint, método, request shape, response shape, error shape).
8. **Handoff** — archivos modificados, reusables aprovechados, contratos seguidos, tests pasando, mensaje de commit sugerido, notas.

Si un paso no se puede completar, decirlo explícitamente y proponer un follow-up. No saltarse silenciosamente accesibilidad, estados o tests.
