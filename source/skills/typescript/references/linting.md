# Linting — typescript-eslint + Prettier

> **Official sources:** https://typescript-eslint.io · https://eslint.org/docs/latest/use/configure/configuration-files-new · https://prettier.io/docs/en/

## 1. Installation

```sh
# ESLint 9+ with flat config (recommended)
npm i -D eslint typescript-eslint @eslint/js eslint-config-prettier

# Prettier
npm i -D prettier
```

## 2. Rigor levels

typescript-eslint offers two presets that combine with `stylistic`:

| Level | Preset | Speed | Covers |
|---|---|---|---|
| **Base** | `recommended` + `stylistic` | Fast (no type info) | Common errors: `no-floating-promises`, `await-thenable`, `no-misused-promises`, etc. |
| **Rigor (type-aware)** | `recommended-type-checked` + `stylistic-type-checked` | Slow (up to 30x), requires `parserOptions.project` | Above + rules that need type info: `no-unsafe-*`, `no-unnecessary-type-arguments`, etc. |

**Recommendation:**
- **Large** codebase (>50k lines, slow CI): start with base, evaluate adding type-aware only if the bugs justify it.
- **Small/medium** codebase: type-aware from day 1. The DX is worth it.

## 3. Minimum flat config

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Always ignore: build output, node_modules, .next, etc.
  {
    ignores: ['dist/**', 'node_modules/**', '.next/**', 'coverage/**', 'build/**'],
  },

  // Base + stylistic (all .ts/.tsx)
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  // Custom global rules
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Prettier ALWAYS at the end — disables rules that clash with formatting
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

  // Type-aware ONLY for src — so it does not typecheck tests/build artifacts
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

  // For tests, build scripts: base only
  {
    files: ['**/*.test.{ts,tsx}', 'scripts/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // tests may need any for mocks
    },
  },

  eslintConfigPrettier,
);
```

> With type-aware: `tsc --noEmit` must pass before running ESLint. Add this to the `lint` script:
> ```json
> { "scripts": { "lint": "tsc --noEmit && eslint ." } }
> ```

## 5. Most valuable rules (type-aware)

| Rule | Catches |
|---|---|
| `no-floating-promises` | `Promise` created without `await` or `.then` |
| `no-misused-promises` | Passing `Promise` where a value is expected (or vice versa) |
| `await-thenable` | `await` over something that is not `Promise` |
| `no-unnecessary-condition` | `if (x !== null)` when `x` is already non-null |
| `no-unsafe-*` (member-access, argument, assignment, call, return) | Use of values typed as `any` |
| `prefer-nullish-coalescing` | `x ?? y` instead of `x \|\| y` when applicable |
| `prefer-optional-chain` | `a?.b?.c` instead of `a && a.b && a.b.c` |
| `no-redundant-type-constituents` | `T \| T` in unions |
| `consistent-type-imports` | Forces `import type { Foo }` for type-only imports |
| `consistent-type-definitions` | Forces `interface` or `type` globally |

## 6. Most valuable rules (base)

| Rule | Catches |
|---|---|
| `no-explicit-any` | `any` declared explicitly |
| `no-unused-vars` | Unused variables/imports (prefix with `_` to ignore) |
| `consistent-type-imports` | Same as the type-aware |
| `ban-types` | Blocks `Object`/`Function`/`<any>` as types |
| `no-namespace` | `namespace X { }` (prefer ES modules) |
| `no-non-null-assertion` | `!` non-null assertion |
| `no-magic-numbers` | Numbers without a constant (configurable threshold) |

## 7. Prettier config

```js
// prettier.config.js or .prettierrc
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',          // (x) => x instead of x => x
  endOfLine: 'lf',
};
```

## 8. npm scripts

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

## 10. ESLint in the IDE

VS Code: install the **ESLint** extension and add to `.vscode/settings.json`:

```json
{
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "eslint.validate": ["javascript", "typescript", "typescriptreact"]
}
```

> For ESLint type-aware to run on each save, the project must have `tsc --noEmit` without errors (the type-aware rules read from the `tsconfig`).
