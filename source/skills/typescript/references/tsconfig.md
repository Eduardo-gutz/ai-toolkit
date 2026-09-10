# tsconfig.json — Reference

> **Official sources:** https://www.typescriptlang.org/tsconfig · https://www.typescriptlang.org/docs/handbook/module-resolution.html · https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html

## 1. Default for new projects

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,       // arr[i] is T | undefined
    "exactOptionalPropertyTypes": true,    // { x?: T } ≠ { x: undefined }
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,          // enforces `import type`
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

**`strict: true` enables:** `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`.

## 2. Configurations by environment

### Browser / Bundler (Vite, Next.js, esbuild, webpack, Parcel, Rspack, Turbopack)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",                  // or "ESNext" if you want the latest
    "module": "ESNext",
    "moduleResolution": "Bundler",       // MANDATORY for Vite/Next/etc.
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",                   // if you use React with a bundler
    "allowImportingTsExtensions": true,  // allows `import './foo.ts'` (requires `noEmit` or bundler)
    "noEmit": true,                      // the bundler emits; tsc only type-checks
    "isolatedModules": true,             // each file processed in isolation (what the bundler does)
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
    "types": ["node"],                   // requires `@types/node` installed
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "strict": true
  }
}
```

> With `module: "NodeNext"`, the `.js` files on disk are interpreted according to the nearby `package.json` convention: `"type": "module"` → ESM, without it → CommonJS.

### Library (published on npm)

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",                  // or "ES2018" for maximum compatibility
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,                 // generates .d.ts
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

(Deno reads `deno.json` or `deno.jsonc` by default; this tsconfig is only if you import from another tool.)

### Bun

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["bun-types"],              // optional; Bun also supports the default tsconfig
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true
  }
}
```

## 3. `target` by runtime environment

| Runtime | Minimum supported version | Recommended `target` |
|---|---|---|
| Node 20+ | ES2022 | `ES2022` |
| Node 18 | ES2022 | `ES2022` |
| Node 16 | ES2021 | `ES2021` |
| Chrome 90+ / Edge 90+ | ES2021 | `ES2022` |
| Safari 15+ | ES2021 | `ES2022` |
| iOS 15+ (Safari) | ES2020 | `ES2022` |
| Android Chrome 90+ | ES2021 | `ES2022` |

> For `target: "ESNext"` there is no feature loss — TS emits what you wrote. For bundlers, `target: "ESNext"` + selective polyfills is the cleanest combination.

## 4. `moduleResolution` — quick reference

| Value | When to use it |
|---|---|
| `"Bundler"` | Vite, Next.js, webpack 5, esbuild, Rspack, Turbopack, Parcel. Reads `package.json#exports` correctly. |
| `"NodeNext"` | Pure Node.js (includes `.js` → `.ts` mapping for ESM). |
| `"Node16"` | Similar to NodeNext but more conservative. |
| `"Classic"` | **Deprecated**. Do not use. |
| `"node10"` (alias `"node"`) | CommonJS-only, does not use `exports`. Avoid in new projects. |

## 5. Useful additional flags

| Flag | Default | When to enable |
|---|---|---|
| `noUncheckedIndexedAccess` | `false` | **Almost always.** Catches `arr[i]` that is `T \| undefined`. |
| `exactOptionalPropertyTypes` | `false` | If you want `?:` and `\| undefined` to be distinct. |
| `noImplicitReturns` | `false` | If you have functions with conditional returns. |
| `noFallthroughCasesInSwitch` | `false` | To prevent bugs in `switch` without `break`. |
| `noUnusedLocals` | `false` | To keep it clean; combine with `noUnusedParameters`. |
| `noUnusedParameters` | `false` | Same. Prefix with `_` to ignore. |
| `verbatimModuleSyntax` | `false` | **Recommended.** Enforces `import type` for type-only imports. Works with bundlers. |
| `isolatedModules` | `false` | If you use a bundler or Babel. Guarantees each file can be transpiled in isolation. |
| `allowImportingTsExtensions` | `false` | If you want `import './foo.ts'` instead of `import './foo'`. |
| `resolveJsonModule` | `false` | If you import JSON directly. |
| `useDefineForClassFields` | `true` (with `target: ES2022`) | Almost always you want this. |
| `noPropertyAccessFromIndexSignature` | `false` | If you want to force `obj['key']` instead of `obj.key` for index signatures. |
| `noImplicitOverride` | `false` | If you use classes with inheritance; enforces the `override` keyword. |

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

> ⚠️ Path aliases **require extra config in the bundler/runner** (Vite `resolve.alias`, webpack `resolve.alias`, tsx `tsconfig-paths`, etc.). TS only type-checks, it does not resolve at runtime.

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

`composite: true` + `references` enables incremental builds and faster type-checking in monorepos.

## 8. Includes / Excludes / Files

```jsonc
{
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "build", ".next", "coverage"],
  // manual alternative to `include`:
  "files": ["src/index.ts"]
}
```

`include` is **globs** (not literal paths). `files` is **literal paths**. Prefer `include` + `exclude`.

## 9. Common errors

| Problem | Solution |
|---|---|
| `Cannot find module '@/foo'` at runtime | The bundler does not resolve the alias. Configure it in `vite.config.ts`, `tsconfig-paths`, etc. |
| `Cannot find module '@/foo'` only in tsc | Missing `baseUrl` + `paths` in tsconfig. |
| `import { type X } from 'y'` does not work | `verbatimModuleSyntax: true` + separate imports: `import { type X } from 'y'` or `import type { X } from 'y'; import { y } from 'y';`. |
| TS infers `any` on JSON.parse | Use `JSON.parse(x) as Foo` (with runtime validation before) or a helper `parseJSON(x, schema)`. |
| Build fails with `Type 'X' is not assignable to type 'Y'` | Narrow first. For `unknown` → `X`, use a type predicate or runtime validation (Zod, Valibot, etc., **only if the project uses them**). |
| Decorators do not work | Enable `experimentalDecorators: true` (legacy) or use the TC39 standard (Stage 3) if your version supports it. For NestJS or legacy TypeORM: `experimentalDecorators` + `emitDecoratorMetadata`. |
