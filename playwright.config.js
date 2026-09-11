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
  globalSetup: require.resolve('./e2e/globalSetup.js'),
  reporter: [
    ['list'],
    ['json', {
      outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'test-results/playwright-report.json'
    }]
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    // The local full runner performs a diagnostic rerun as a separate process,
    // so Playwright's retry-only trace mode would not retain the original
    // failure. Keep the first failed run's trace for reliable triage.
    trace: 'retain-on-failure',
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
    // Reuse is opt-in; when enabled, globalSetup verifies the served entry
    // point hash before any test starts.
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 120_000
  }
});
