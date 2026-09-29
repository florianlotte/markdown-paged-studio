import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // __APP_VERSION__ and __APP_COMMIT__ are replaced at build time (vite.config.js).
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __APP_COMMIT__: 'readonly' },
    },
  },
  {
    files: [
      'vite.config.js',
      'playwright.config.js',
      'playwright.desktop.config.js',
      'tests/**/*.{js,mjs}',
      'electron/**/*.js',
      'mcp/**/*.mjs',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['electron/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  prettier,
];
