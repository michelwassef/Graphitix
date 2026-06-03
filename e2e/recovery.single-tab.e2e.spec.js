// End-to-end + timing regression for the user-reported flow: open a single component tab,
// import data, do NOT switch tabs, then close+reopen WITHOUT saving shortly after -> the app
// must offer to restore recovered changes.
//
// The bug: the recovery snapshot is written on a per-change debounce that restarts on every
// change. Importing data triggers a burst of internal "dirty" events (redraws/stats settling)
// over a few seconds, so the timer kept sliding and the snapshot wasn't written yet if you
// reloaded in the first 1-2 seconds. documentState now bounds that wait (RECOVERY_MAX_WAIT_MS)
// so a snapshot is always written within ~1s of data appearing, regardless of churn.
//
// This reloads ~1.5s after import (a realistic "quick close") and asserts recovery is offered,
// for every table-backed component.

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
  test(`reload shortly after import offers recovery: ${type}`, async ({ page }) => {
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

    // Close+reopen ~1.5s after import — within the window that used to lose the snapshot.
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    expect(recoveryOffered, `${type}: reloading ~1.5s after import should offer to restore recovered changes`).toBe(true);
  });
}
