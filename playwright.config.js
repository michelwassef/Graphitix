const { defineConfig } = require('@playwright/test');

const PORT = Number(process.env.PLAYWRIGHT_WEB_PORT || 4173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } }
  ],
  webServer: {
    command: `node scripts/e2e-server.cjs --port ${PORT}`,
    url: `${BASE_URL}/index.html`,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
