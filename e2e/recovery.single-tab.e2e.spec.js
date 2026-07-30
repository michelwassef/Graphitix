// End-to-end + timing regression for the user-reported flow: open a single component tab,
// import data, do NOT switch tabs, then close+reopen WITHOUT saving after the scheduled
// recovery checkpoint -> the app
// must offer to restore recovered changes.
//
// The recovery writer uses a 2.5-second trailing debounce and a 10-second maximum deferral.
// Wait for the observable completed checkpoint instead of sampling an obsolete fixed delay.

const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const PAGE_IDS = {
  box: 'boxPage', line: 'linePage', scatter: 'scatterPage', hist: 'histPage', heatmap: 'heatmapPage'
};
const EXAMPLE_BUTTONS = {
  box: 'boxLoadExample', line: 'lineLoadExample', scatter: 'scatterLoadExample', hist: 'histLoadExample', heatmap: 'heatmapLoadExample'
};

for (const type of ['box', 'scatter', 'hist', 'heatmap', 'line']) {
  test(`reload after the scheduled checkpoint offers recovery: ${type}`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);

    let recoveryOffered = false;
    page.on('dialog', async (dialog) => {
      // Accept the "unsaved changes" beforeunload prompt so the reload proceeds; record the
      // recovery confirm (it is the only confirm that mentions recovered changes).
      if (dialog.type() === 'beforeunload') { await dialog.accept().catch(() => {}); return; }
      if (/recover/i.test(dialog.message())) recoveryOffered = true;
      await dialog.dismiss().catch(() => {});
    });

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, { type, pageId: PAGE_IDS[type] }, { first: true });
    await page.waitForSelector(`#${PAGE_IDS[type]}:not([hidden])`, { timeout: 30_000 });
    await clickExampleButtonIfPresent(page, EXAMPLE_BUTTONS[type]);

    await page.waitForFunction(() => {
      const performance = window.Main?.documentState?.getRecoveryPerformance?.();
      const revision = Number(window.Main?.session?.workspaceState?.sessionRevision) || 0;
      return Number(performance?.revision) >= revision && revision > 0;
    }, null, { timeout: 15_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    expect(recoveryOffered, `${type}: completed recovery checkpoint should be offered after reload`).toBe(true);
  });
}
