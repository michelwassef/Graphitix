const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function getActiveTabId(page) {
  return page.evaluate(() => String(window.Main?.session?.workspaceState?.activeTabId || ''));
}

async function activateTab(page, tabId) {
  await page.evaluate(id => {
    window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-box-title-isolation' });
  }, tabId);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
}

async function readBoxTitleState(page) {
  return page.evaluate(() => {
    const state = window.Components?.box?.__getState?.() || {};
    const payload = window.Components?.box?.getPayload?.() || null;
    const svgTitle = document.querySelector('#boxPage:not([hidden]) #boxPlot svg text[data-font-role="graphTitle"]');
    return {
      stateTitle: String(state.titleText || ''),
      payloadTitle: String(payload?.config?.title || ''),
      svgTitle: String(svgTitle?.textContent || ''),
      graphType: String(document.querySelector('#boxPage:not([hidden]) #boxGraphType')?.value || '')
    };
  });
}

async function editVisibleBoxTitle(page, title) {
  await page.waitForSelector('#boxPage:not([hidden]) #boxPlot svg text[data-font-role="graphTitle"]', { timeout: 45_000 });
  await page.evaluate(() => {
    const target = document.querySelector('#boxPage:not([hidden]) #boxPlot svg text[data-font-role="graphTitle"]');
    target?.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      detail: 2,
      view: window
    }));
  });
  const input = page.locator('.inline-edit-overlay .inline-edit-input').first();
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill(title);
  await input.press('Enter');
  await page.waitForFunction(expected => {
    const state = window.Components?.box?.__getState?.() || {};
    return String(state.titleText || '') === expected;
  }, title, { timeout: 20_000 });
}

test('box custom graph title does not become the default for new Box tabs', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
  await page.waitForSelector('#boxPage:not([hidden]) #boxPlot svg', { timeout: 45_000 });
  const firstTabId = await getActiveTabId(page);
  expect(firstTabId).toBeTruthy();

  const customTitle = 'Box Alpha Custom Title';
  await editVisibleBoxTitle(page, customTitle);
  const firstAfterEdit = await readBoxTitleState(page);
  expect(firstAfterEdit.stateTitle).toBe(customTitle);
  expect(firstAfterEdit.payloadTitle).toBe(customTitle);

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: false });
  const secondTabId = await getActiveTabId(page);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  const secondTitle = await readBoxTitleState(page);
  expect(secondTitle.graphType).toBe('strip');
  expect(secondTitle.stateTitle).toBe('Individual values');
  expect(secondTitle.payloadTitle).toBe('Individual values');
  expect(secondTitle.stateTitle).not.toBe(customTitle);

  await activateTab(page, firstTabId);
  const firstAfterReturn = await readBoxTitleState(page);
  expect(firstAfterReturn.stateTitle).toBe(customTitle);
  expect(firstAfterReturn.payloadTitle).toBe(customTitle);

  expect(issues.critical).toEqual([]);
});
