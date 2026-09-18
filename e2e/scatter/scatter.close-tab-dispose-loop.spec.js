const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { observeStableValue } = require('../helpers/contractWaits');

const scatterComponent = COMPONENT_MATRIX.find(component => component.type === 'scatter');

function isScatterDestroyedGridError(entry) {
  const text = String(entry?.text || '');
  return /Grid API function .* cannot be called as the grid has been destroyed/i.test(text)
    || /scatter.*destroyed/i.test(text)
    || /uncontrolled/i.test(text);
}

test('closing a fresh scatter tab cancels stale selection and draw work', async ({ page }) => {
  await installLocalCdnOverrides(page);
  const issues = registerIssueCollectors(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, scatterComponent, { first: true });
  await page.waitForSelector('#scatterPage:not([hidden]) #scatterHot .ag-root, #scatterPage:not([hidden]) #scatterHot .ag-root-wrapper', { timeout: 30_000 });

  const scatterTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(scatterTabId).toBeTruthy();

  await page.waitForFunction(() => {
    const scatter = window.Components?.scatter;
    return typeof scatter?.isIdleForSnapshot !== 'function' || scatter.isIdleForSnapshot();
  }, null, { timeout: 15_000 });
  await observeStableValue(page,
    () => issues.all.filter(isScatterDestroyedGridError).length,
    { durationMs: 2_000, label: 'Scatter close/dispose diagnostics' }
  );
  const idleAfterOpen = await page.evaluate(() => {
    const scatter = window.Components?.scatter;
    return typeof scatter?.isIdleForSnapshot !== 'function' || scatter.isIdleForSnapshot();
  });
  expect(idleAfterOpen).toBe(true);

  const scatterOverlaySyncLogs = issues.all.filter(entry => /scatter overlay controls synced/i.test(String(entry.text || '')));
  expect(scatterOverlaySyncLogs.length).toBeLessThanOrEqual(50);

  await page.evaluate(async tabId => {
    const close = window.Main?.tabs?.closeTab;
    if (typeof close !== 'function') throw new Error('Main.tabs.closeTab unavailable');
    const result = close(tabId, {
      force: true,
      skipPrompt: true,
      reason: 'e2e-scatter-close-dispose-loop'
    });
    if (result && typeof result.then === 'function') await result;
  }, scatterTabId);

  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${scatterTabId}"]`)).toHaveCount(0, { timeout: 10_000 });

  // Give pending AG Grid async selection events, draw cooldowns, RAF callbacks, and
  // workspace deactivation hooks enough time to fire. The regression produced an
  // uncontrolled loop and repeated "grid has been destroyed" console errors here.
  await observeStableValue(page,
    () => issues.all.filter(isScatterDestroyedGridError).length,
    { durationMs: 2_000, label: 'Scatter close/dispose delayed diagnostics' }
  );

  const destroyedGridErrors = issues.all.filter(isScatterDestroyedGridError);
  expect(destroyedGridErrors).toEqual([]);
  expect(issues.critical).toEqual([]);
});
