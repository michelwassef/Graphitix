// End-to-end + timing regression for the user-reported flow: open a single component tab,
// import data, do NOT switch tabs, then close+reopen WITHOUT saving after the scheduled
// recovery checkpoint -> the app
// must offer to restore recovered changes.
//
// The recovery writer uses a 2.5-second trailing debounce and a 10-second maximum deferral.
// Wait for the observable completed checkpoint instead of sampling an obsolete fixed delay.

const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const {
  COMPONENT_MATRIX,
  openComponentFromWelcome,
} = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { reloadAndAcceptRecovery } = require('../helpers/recoveryDriver');

const PAGE_IDS = {
  box: 'boxPage', line: 'linePage', scatter: 'scatterPage', hist: 'histPage', heatmap: 'heatmapPage'
};

for (const type of ['box', 'scatter', 'hist', 'heatmap', 'line']) {
  test(`reload after the scheduled checkpoint offers recovery: ${type}`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, { type, pageId: PAGE_IDS[type] }, { first: true });
    await page.waitForSelector(`#${PAGE_IDS[type]}:not([hidden])`, { timeout: 30_000 });
    await clickExampleButton(page, COMPONENT_MATRIX.find(component => component.type === type), {
      requireMountedRoot: true
    });

    await page.waitForFunction(() => {
      const performance = window.Main?.documentState?.getRecoveryPerformance?.();
      const revision = Number(window.Main?.session?.workspaceState?.sessionRevision) || 0;
      return Number(performance?.revision) >= revision && revision > 0;
    }, null, { timeout: 15_000 });
    const recoveryOffered = await reloadAndAcceptRecovery(page, { timeout: 20_000 });
    expect(recoveryOffered, `${type}: completed recovery checkpoint should be offered after reload`).toBe(true);
  });
}
