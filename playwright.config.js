import { defineConfig } from '@playwright/test';

// PORT lets the suite run next to a dev server already using the default port.
const PORT = Number(process.env.PORT) || 5173;

export default defineConfig({
  testDir: 'tests',
  testIgnore: ['**/desktop.spec.js', '**/*.test.mjs'],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
  // Chromium is the reference and what `npm test` runs; Firefox and WebKit run with `npm run test:firefox`,
  // `npm run test:webkit` or `npm run test:browsers`, and in the `browsers` job of the CI, where one retry
  // absorbs the occasional slow start of those engines.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' }, retries: process.env.CI ? 1 : 0 },
    { name: 'webkit', use: { browserName: 'webkit' }, retries: process.env.CI ? 1 : 0 },
  ],
  webServer: {
    command: `npm run dev -- --strictPort --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
