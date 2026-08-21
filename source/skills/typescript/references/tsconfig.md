# tsconfig.json — Referencia

> **Fuentes oficiales:** https://www.typescriptlang.org/tsconfig · https://www.typescriptlang.org/docs/handbook/module-resolution.html · https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html

## 1. Default para proyectos nuevos

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,       // arr[i] es T | undefined
    "exactOptionalPropertyTypes": true,    // { x?: T } ≠ { x: undefined }
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,          // fuerza `import type`
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

**`strict: true` activa:** `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`.

## 2. Configuraciones por entorno

### Browser / Bundler (Vite, Next.js, esbuild, webpack, Parcel, Rspack, Turbopack)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",                  // o "ESNext" si quieres lo último
    "module": "ESNext",
    "moduleResolution": "Bundler",       // OBLIGATORIO para Vite/Next/etc.
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",                   // si usas React con bundler
    "allowImportingTsExtensions": true,  // permite `import './foo.ts'` (requiere `noEmit` o bundler)
    "noEmit": true,                      // el bundler emite; tsc solo type-checks
    "isolatedModules": true,             // cada archivo se procesa aislado (lo que el bundler hace)
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "strict": true
  }
}
```

### Node.js

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],                   // requiere `@types/node` instalado
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "strict": true
  }
}
```

> Con `module: "NodeNext"`, los `.js` archivos en disco se interpretan según la convención del `package.json` cercano: `"type": "module"` → ESM, sin él → CommonJS.

### Library (publicada en npm)

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",                  // o "ES2018" para máxima compatibilidad
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,                 // genera .d.ts
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true
  }
}
```

### Deno

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true
  }
}
```

(Deno lee `deno.json` o `deno.jsonc` por default; este tsconfig es solo si importas desde otro tool.)

### Bun

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["bun-types"],              // opcional; Bun también soporta tsconfig default
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true
  }
}
```

## 3. `target` por entorno de runtime

| Runtime | Versión mínima soportada | `target` recomendado |
|---|---|---|
| Node 20+ | ES2022 | `ES2022` |
| Node 18 | ES2022 | `ES2022` |
| Node 16 | ES2021 | `ES2021` |
| Chrome 90+ / Edge 90+ | ES2021 | `ES2022` |
| Safari 15+ | ES2021 | `ES2022` |
| iOS 15+ (Safari) | ES2020 | `ES2022` |
| Android Chrome 90+ | ES2021 | `ES2022` |

> Para `target: "ESNext"` no hay pérdida de features — TS emite lo que escribiste. Para bundlers, `target: "ESNext"` + polyfills selectivos es la combinación más limpia.

## 4. `moduleResolution` — referencia rápida

| Valor | Cuándo usarlo |
|---|---|
| `"Bundler"` | Vite, Next.js, webpack 5, esbuild, Rspack, Turbopack, Parcel. Lee `package.json#exports` correctamente. |
| `"NodeNext"` | Node.js puro (incluye `.js` → `.ts` mapping para ESM). |
| `"Node16"` | Similar a NodeNext pero más conservador. |
| `"Classic"` | **Deprecated**. No usar. |
| `"node10"` (alias `"node"`) | CommonJS-only, no usa `exports`. Evitar en proyectos nuevos. |

## 5. Flags adicionales útiles

| Flag | Default | Cuándo activarlo |
|---|---|---|
| `noUncheckedIndexedAccess` | `false` | **Casi siempre.** Atrapa `arr[i]` que es `T | undefined`. |
| `exactOptionalPropertyTypes` | `false` | Si quieres que `?:` y `| undefined` sean distintos. |
| `noImplicitReturns` | `false` | Si tienes funciones con returns condicionales. |
| `noFallthroughCasesInSwitch` | `false` | Para prevenir bugs en `switch` sin `break`. |
| `noUnusedLocals` | `false` | Para mantener limpio; combinar con `noUnusedParameters`. |
| `noUnusedParameters` | `false` | Idem. Prefijar con `_` para ignorar. |
| `verbatimModuleSyntax` | `false` | **Recomendado.** Fuerza `import type` para imports solo de tipo. Funciona con bundlers. |
| `isolatedModules` | `false` | Si usas bundler o Babel. Garantiza que cada archivo se puede transpilar aislado. |
| `allowImportingTsExtensions` | `false` | Si quieres `import './foo.ts'` en vez de `import './foo'`. |
| `resolveJsonModule` | `false` | Si importas JSON directamente. |
| `useDefineForClassFields` | `true` (con `target: ES2022`) | Casi siempre querés esto. |
| `noPropertyAccessFromIndexSignature` | `false` | Si querés forzar `obj['key']` en vez de `obj.key` para index signatures. |
| `noImplicitOverride` | `false` | Si usás clases con herencia; fuerza `override` keyword. |

## 6. Path aliases

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@modules/*": ["src/modules/*"],
      "@components/*": ["src/components/*"]
    }
  }
}
```

> ⚠️ Los path aliases **requieren config extra en el bundler/runner** (Vite `resolve.alias`, webpack `resolve.alias`, tsx `tsconfig-paths`, etc.). TS solo type-checks, no resuelve en runtime.

## 7. Composite / Project references (monorepo)

```jsonc
// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist"
  },
  "include": ["src"]
}

// packages/app/tsconfig.json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

`composite: true` + `references` permite builds incrementales y faster type-checking en monorepos.

## 8. Includes / Excludes / Files

```jsonc
{
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "build", ".next", "coverage"],
  // alternativa manual a `include`:
  "files": ["src/index.ts"]
}
```

`include` es **globs** (no paths literales). `files` es **paths literales**. Preferí `include` + `exclude`.

## 9. Errores comunes

| Problema | Solución |
|---|---|
| `Cannot find module '@/foo'` en runtime | El bundler no resuelve el alias. Configuralo en `vite.config.ts`, `tsconfig-paths`, etc. |
| `Cannot find module '@/foo'` solo en tsc | Falta `baseUrl` + `paths` en tsconfig. |
| `import { type X } from 'y'` no funciona | `verbatimModuleSyntax: true` + separar imports: `import { type X } from 'y'` o `import type { X } from 'y'; import { y } from 'y';`. |
| TS infiere `any` en JSON.parse | Usa `JSON.parse(x) as Foo` (con validación runtime antes) o un helper `parseJSON(x, schema)`. |
| Build falla con `Type 'X' is not assignable to type 'Y'` | Narrow primero. Para `unknown` → `X`, usa type predicate o validación runtime (Zod, Valibot, etc., **solo si el proyecto los usa**). |
| Decorators no funcionan | Habilita `experimentalDecorators: true` (legacy) o usa el estándar TC39 (Stage 3) si tu versión lo soporta. Para NestJS o TypeORM legacy: `experimentalDecorators` + `emitDecoratorMetadata`. |
