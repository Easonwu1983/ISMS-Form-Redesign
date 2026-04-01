'use strict';

module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script'
  },
  rules: {
    // --- Errors ---
    'no-undef': 'error',
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-extra-semi': 'error',
    'no-func-assign': 'error',
    'no-inner-declarations': 'error',
    'no-unreachable': 'error',
    'no-unsafe-negation': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error',

    // --- Best Practices ---
    'eqeqeq': ['warn', 'always', { null: 'ignore' }],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-with': 'error',
    'no-throw-literal': 'warn',
    'no-self-compare': 'error',
    'no-self-assign': 'error',
    'no-redeclare': 'error',
    'no-return-assign': 'warn',

    // --- Style (light) ---
    'no-trailing-spaces': 'warn',
    'semi': ['warn', 'always'],
    'comma-dangle': ['off'],
    'quotes': ['off'],
    'no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 1 }],

    // --- Node/CJS ---
    'no-process-exit': 'off'
  },
  overrides: [
    {
      files: ['m365/**/*.cjs', 'scripts/**/*.cjs', '.codex-local-server.cjs'],
      env: { browser: false, node: true },
      parserOptions: { sourceType: 'script' },
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly'
      }
    },
    {
      files: ['*.js'],
      excludedFiles: ['m365/**', 'scripts/**'],
      env: { browser: true, node: false },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        sessionStorage: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        AbortController: 'readonly',
        Promise: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        WeakMap: 'readonly',
        Symbol: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        location: 'readonly',
        history: 'readonly',
        navigator: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        queueMicrotask: 'readonly'
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    '*.min.js',
    '*.bundle.js',
    'app-core.bundle.min.js',
    'tmp-*.js',
    '.tmp-*.js',
    'feature-bundles/',
    'dist/',
    'build/'
  ]
};
