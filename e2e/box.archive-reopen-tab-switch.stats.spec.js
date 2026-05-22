const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function loadWorkspaceArchive(page, archivePath) {
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await page.waitForTimeout(600);
}

async function waitForBoxStatsSurface(page, timeoutMs = 30_000) {
  await page.waitForFunction(
    () => {
      const status = document.getElementById('boxStatsStatus');
      const toggle = document.getElementById('boxShowSignificance');
      const results = document.getElementById('statsResults');
      if (!status || !toggle || !results) {
        return false;
      }
      const hasStats = /statistics up to date/i.test(status.textContent || '')
        || /pairwise comparisons|versus reference|custom pairwise/i.test(results.textContent || '');
      return hasStats && !toggle.disabled;
    },
    null,
    { timeout: timeoutMs }
  );
}

async function readBoxStatsSnapshot(page) {
  return page.evaluate(() => {
    const state = window.Components?.box?.__getState?.() || null;
    const toggle = document.getElementById('boxShowSignificance');
    const status = document.getElementById('boxStatsStatus');
    const results = document.getElementById('statsResults');
    return {
      toggleDisabled: !!toggle?.disabled,
      toggleChecked: !!toggle?.checked,
      statusText: String(status?.textContent || '').trim(),
      hasPairwiseText: /pairwise comparisons|versus reference|custom pairwise/i.test(String(results?.textContent || '')),
      statsLastRunVersion: Number(state?.statsLastRunVersion || 0),
      statsContextVersion: Number(state?.statsContextVersion || 0),
      showSignificanceBars: !!state?.showSignificanceBars
    };
  });
}

async function activateWorkspaceTabByTitle(page, titlePattern) {
  const tabButton = page.locator('.workspace-tab').filter({ hasText: titlePattern }).first();
  await expect(tabButton).toBeVisible({ timeout: 20_000 });
  await tabButton.click();
}

test('box archive restore keeps stats and pairwise toggle after switching away and back', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const archivePath = path.resolve(__dirname, '../workspace.graph');
  await loadWorkspaceArchive(page, archivePath);

  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 35_000 });
  await waitForBoxStatsSurface(page);

  const beforeSwitch = await readBoxStatsSnapshot(page);
  expect(beforeSwitch.toggleDisabled).toBe(false);
  expect(beforeSwitch.showSignificanceBars).toBe(true);
  expect(beforeSwitch.statsLastRunVersion).toBeGreaterThan(0);
  expect(beforeSwitch.statsContextVersion).toBeGreaterThan(0);
  expect(beforeSwitch.hasPairwiseText).toBe(true);

  await activateWorkspaceTabByTitle(page, /^Welcome$/i);
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  await activateWorkspaceTabByTitle(page, /Distribution Charts/i);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await waitForBoxStatsSurface(page);

  const afterSwitch = await readBoxStatsSnapshot(page);
  expect(afterSwitch.toggleDisabled).toBe(false);
  expect(afterSwitch.toggleChecked).toBe(true);
  expect(afterSwitch.showSignificanceBars).toBe(true);
  expect(afterSwitch.statsLastRunVersion).toBeGreaterThan(0);
  expect(afterSwitch.statsContextVersion).toBeGreaterThan(0);
  expect(afterSwitch.hasPairwiseText).toBe(true);
  expect(afterSwitch.statusText).toMatch(/statistics up to date/i);

  expect(issues.critical).toEqual([]);
});
