import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    headless: process.env.PW_HEADLESS !== 'false',
    // Discard destroys renderer surfaces; capture only the popup explicitly.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
