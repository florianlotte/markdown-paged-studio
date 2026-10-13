import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  // release/ and test-results/ are build outputs, .ua/ the working folder of a code analysis tool.
  { ignores: ['dist/', 'node_modules/', 'release/', 'test-results/', '.ua/'] },
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
      'scripts/**/*.mjs',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['electron/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  prettier,
];
