// Regression: a recovery snapshot capture must be REVISION-NEUTRAL.
//
// writeRecoverySnapshot flushes the active tab's live state (config.getPayload + layout) so the
// snapshot reflects what the user sees. persistActiveTabState would normally markSessionDirty
// when that capture detects a change — including live-DOM layout drift. For a snapshot capture
// that re-dirties the session, which reschedules another recovery write, whose own capture
// re-detects drift, and so on: an unbounded, expensive feedback loop (observed as endless debug
// logs and 500ms setTimeout violations). The snapshotCapture intent suppresses the dirty-marking
// so the session revision stops advancing once the component settles.

const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const PAGE_IDS = { box: 'boxPage', scatter: 'scatterPage', hist: 'histPage' };
const EXAMPLE_BUTTONS = { box: 'boxLoadExample', scatter: 'scatterLoadExample', hist: 'histLoadExample' };

for (const type of ['scatter', 'box', 'hist']) {
  test(`recovery capture does not perpetually re-dirty the session: ${type}`, async ({ page }) => {
    test.setTimeout(60_000);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, { type, pageId: PAGE_IDS[type] }, { first: true });
    await page.waitForSelector(`#${PAGE_IDS[type]}:not([hidden])`, { timeout: 30_000 });
    await clickExampleButtonIfPresent(page, EXAMPLE_BUTTONS[type]);

    // Sample the session revision once per second; it must stop advancing once settled.
    const revs = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1000);
      revs.push(await page.evaluate(() => window.Main.session.workspaceState.sessionRevision));
    }
    const lastSecondDelta = revs[5] - revs[4];
    expect(lastSecondDelta, `${type}: session revision should stop advancing after settle (revs=${JSON.stringify(revs)})`).toBeLessThanOrEqual(1);
  });
}
