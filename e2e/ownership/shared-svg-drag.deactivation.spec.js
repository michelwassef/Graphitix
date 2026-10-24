const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { clickExpectedExampleButton, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function activateTab(page, tabId) {
  await page.evaluate(async id => window.Main.tabs.activateTab(id, {
    reason: 'e2e-svg-drag-owner-switch'
  }), tabId);
  await page.waitForFunction(id =>
    window.Main?.session?.workspaceState?.activeTabId === id, tabId
  );
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 30_000
  });
}

async function readLabelState(page, tabIds) {
  return page.evaluate(ids => ids.map(id => {
    const tab = window.Main.session.workspaceState.tabs.find(item => item.id === id);
    const session = window.Components.box.__testHooks.getSession(id);
    const labelPositions = session?.state?.labels?.labelPositions
      || session?.state?.labelPositions
      || null;
    return {
      session: JSON.parse(JSON.stringify(labelPositions)),
      payload: JSON.parse(JSON.stringify(tab?.payload?.config?.labelPositions || null))
    };
  }), tabIds);
}

async function dragActiveBoxLabel(page, selector, deltaX = 20, deltaY = 12) {
  const label = page.locator(selector).first();
  await expect(label).toBeVisible();
  const bounds = await label.boundingBox();
  expect(bounds).toBeTruthy();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY);
  return { x: x + deltaX, y: y + deltaY };
}

async function dragActiveBoxGraphTitle(page, deltaX = 20) {
  return dragActiveBoxLabel(
    page,
    '#boxSvg text[data-font-role="graphTitle"][data-font-key="graphTitle"]',
    deltaX
  );
}

async function showBoxAxisTitles(page) {
  const activeBoxPage = page.locator('#boxPage:not([hidden])');
  const summary = activeBoxPage.locator('.resizer-options-summary').first();
  await summary.click();
  const toggle = activeBoxPage.locator('.resizer-axes-title-checkbox').first();
  if(!(await toggle.isChecked())){
    await toggle.check();
  }
  await summary.click();
}

test('Box SVG label drag is cancelled when its owner tab deactivates', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' };
  const loadSettledExample = async () => {
    await clickExpectedExampleButton(page, 'boxLoadExample');
    await waitForComponentOwnerReady(page, 'box', {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 60_000
    });
  };
  await openComponentFromWelcome(page, component, { first: true });
  await loadSettledExample();
  await openComponentFromWelcome(page, component);
  await loadSettledExample();
  const [tabA, tabB] = await page.evaluate(() =>
    window.Main.session.workspaceState.tabs
      .filter(tab => !tab.isWelcome && tab.type === 'box')
      .map(tab => tab.id)
  );
  expect(tabA).toBeTruthy();
  expect(tabB).toBeTruthy();

  await activateTab(page, tabB);
  await dragActiveBoxGraphTitle(page, 24);
  await page.mouse.up();
  await expect.poll(async () => (await readLabelState(page, [tabB]))[0].session?.title)
    .toBeTruthy();
  const tabBLabelsBefore = await readLabelState(page, [tabB]);
  expect(tabBLabelsBefore[0].session?.title).toBeTruthy();

  await activateTab(page, tabA);
  const before = await readLabelState(page, [tabA, tabB]);
  await dragActiveBoxGraphTitle(page, 32);

  await activateTab(page, tabB);
  const tabBTitle = page.locator('#boxSvg text[data-font-role="graphTitle"][data-font-key="graphTitle"]').first();
  const titleBeforeRelease = await tabBTitle.evaluate(node => ({
    x: node.getAttribute('x'),
    y: node.getAttribute('y'),
    transform: node.getAttribute('transform')
  }));
  await page.mouse.move(420, 240);
  await page.mouse.up();
  await expect.poll(() => readLabelState(page, [tabA, tabB])).toEqual(before);
  await expect.poll(() => tabBTitle.evaluate(node => ({
    x: node.getAttribute('x'),
    y: node.getAttribute('y'),
    transform: node.getAttribute('transform')
  }))).toEqual(titleBeforeRelease);

  const yLabelSelector = '#boxSvg text[data-box-axis-title="y"]';
  await activateTab(page, tabB);
  await showBoxAxisTitles(page);
  await expect(page.locator(yLabelSelector).first()).toHaveText(/\S/);
  const beforeSuccessfulAxisDrag = await readLabelState(page, [tabB]);
  const axisLabel = page.locator(yLabelSelector).first();
  await axisLabel.focus();
  await expect(axisLabel).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await readLabelState(page, [tabB]))[0].session?.yLabel)
    .not.toEqual(beforeSuccessfulAxisDrag[0].session?.yLabel);
});
