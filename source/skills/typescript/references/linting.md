# Linting — typescript-eslint + Prettier

> **Fuentes oficiales:** https://typescript-eslint.io · https://eslint.org/docs/latest/use/configure/configuration-files-new · https://prettier.io/docs/en/

## 1. Instalación

```sh
# ESLint 9+ con flat config (recomendado)
npm i -D eslint typescript-eslint @eslint/js eslint-config-prettier

# Prettier
npm i -D prettier
```

## 2. Niveles de rigor

typescript-eslint ofrece dos presets que se combinan con `stylistic`:

| Nivel | Preset | Velocidad | Cubre |
|---|---|---|---|
| **Base** | `recommended` + `stylistic` | Rápido (sin type info) | Errores comunes: `no-floating-promises`, `await-thenable`, `no-misused-promises`, etc. |
| **Rigor (type-aware)** | `recommended-type-checked` + `stylistic-type-checked` | Lento (hasta 30x), requiere `parserOptions.project` | Lo anterior + reglas que necesitan type info: `no-unsafe-*`, `no-unnecessary-type-arguments`, etc. |

**Recomendación:**
- Codebase **grande** (>50k líneas, CI lento): empieza con base, evalúa agregar type-aware solo si los bugs lo justifican.
- Codebase **mediana/pequeña**: type-aware desde el día 1. El DX vale la pena.

## 3. Flat config mínima

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Ignorar siempre: build output, node_modules, .next, etc.
  {
    ignores: ['dist/**', 'node_modules/**', '.next/**', 'coverage/**', 'build/**'],
  },

  // Base + stylistic (todos los .ts/.tsx)
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  // Custom rules globales
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Prettier SIEMPRE al final — deshabilita reglas que chocan con formato
  eslintConfigPrettier,
);
```

## 4. Type-aware config

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },

  ...tseslint.configs.recommended,

  // Type-aware SOLO para src — así no typecheca tests/build artifacts
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },

  // Para tests, build scripts: solo base
  {
    files: ['**/*.test.{ts,tsx}', 'scripts/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // tests pueden necesitar any para mocks
    },
  },

  eslintConfigPrettier,
);
```

> Con type-aware: `tsc --noEmit` debe pasar antes de correr ESLint. Agrega esto al script `lint`:
> ```json
> { "scripts": { "lint": "tsc --noEmit && eslint ." } }
> ```

## 5. Reglas más valiosas (type-aware)

| Regla | Atrapa |
|---|---|
| `no-floating-promises` | `Promise` creado sin `await` o `.then` |
| `no-misused-promises` | Pasar `Promise` donde se espera valor (o viceversa) |
| `await-thenable` | `await` sobre algo que no es `Promise` |
| `no-unnecessary-condition` | `if (x !== null)` cuando `x` ya es non-null |
| `no-unsafe-*` (member-access, argument, assignment, call, return) | Uso de valores tipados como `any` |
| `prefer-nullish-coalescing` | `x ?? y` en vez de `x \|\| y` cuando aplica |
| `prefer-optional-chain` | `a?.b?.c` en vez de `a && a.b && a.b.c` |
| `no-redundant-type-constituents` | `T \| T` en unions |
| `consistent-type-imports` | Obliga `import type { Foo }` para imports solo de tipo |
| `consistent-type-definitions` | Fuerza `interface` o `type` globalmente |

## 6. Reglas más valiosas (base)

| Regla | Atrapa |
|---|---|
| `no-explicit-any` | `any` declarado explícitamente |
| `no-unused-vars` | Variables/imports no usados (prefija con `_` para ignorar) |
| `consistent-type-imports` | Idem al type-aware |
| `ban-types` | Bloquea `Object`/`Function`/`<any>` como tipos |
| `no-namespace` | `namespace X { }` (preferir ES modules) |
| `no-non-null-assertion` | `!` non-null assertion |
| `no-magic-numbers` | Números sin constante (configurable threshold) |

## 7. Prettier config

```js
// prettier.config.js o .prettierrc
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',          // (x) => x en vez de x => x
  endOfLine: 'lf',
};
```

## 8. Scripts de npm

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit"
  }
}
```

## 9. Pre-commit hook (Husky + lint-staged)

```sh
npm i -D husky lint-staged
npx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

```sh
# .husky/pre-commit
npx lint-staged
```

## 10. ESLint en IDE

VS Code: instalar extensión **ESLint** y agregar a `.vscode/settings.json`:

```json
{
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "eslint.validate": ["javascript", "typescript", "typescriptreact"]
}
```

> Para que ESLint type-aware corra en cada save, el proyecto debe tener `tsc --noEmit` sin errores (las reglas type-aware leen del `tsconfig`).
