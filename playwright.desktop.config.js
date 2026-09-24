import { defineConfig } from '@playwright/test';

// Drives the packaged-in-place Electron app (electron .) against the current dist/ build.
// Run `npm run build` first; there is no dev server involved.
export default defineConfig({
  testDir: 'tests',
  testMatch: 'desktop.spec.js',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
