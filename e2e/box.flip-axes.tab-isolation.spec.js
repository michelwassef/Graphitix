const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function openBoxTab(page, { first = false } = {}) {
  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first, loadExample: true }
  );
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg'), null, { timeout: 45_000 });
  const after = await getWorkspaceTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  const clicked = await page.waitForFunction(
    id => window.Main?.session?.workspaceState?.activeTabId === id,
    tabId,
    { timeout: 2_000 }
  ).then(() => true).catch(() => false);
  if (!clicked) {
    await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-box-flip-isolation-activate' }), tabId);
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  }
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg'), null, { timeout: 45_000 });
}

async function readBoxFlipSnapshot(page) {
  return page.evaluate(() => {
    const tabId = String(window.Main?.session?.workspaceState?.activeTabId || '');
    const box = window.Components?.box || null;
    const state = box?.__getState?.() || {};
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tabId, 'box')
      || document.querySelector('#boxPage:not([hidden])');
    const control = root?.querySelector?.('#boxFlipAxes') || null;
    const payload = box?.getPayload?.() || null;
    const categoryLabels = new Set(
      [
        ...(Array.isArray(state.lastAxisLabels) ? state.lastAxisLabels : []),
        ...(Array.isArray(state.cachedDrawInput?.traces)
          ? state.cachedDrawInput.traces.map(trace => trace?.name)
          : [])
      ]
        .map(value => String(value || '').trim())
        .filter(Boolean)
    );
    const countCategoryTicks = axis => Array.from(root?.querySelectorAll?.(`text[data-box-axis-tick="${axis}"]`) || [])
      .map(node => String(node.textContent || '').trim())
      .filter(text => categoryLabels.has(text))
      .length;
    const xCategoryTicks = countCategoryTicks('x');
    const yCategoryTicks = countCategoryTicks('y');
    const categoryAxis = xCategoryTicks > 0 && yCategoryTicks === 0
      ? 'x'
      : (yCategoryTicks > 0 && xCategoryTicks === 0 ? 'y' : null);
    return {
      tabId,
      rootTabId: String(root?.dataset?.workspaceTabId || ''),
      checkbox: control?.checked === true,
      moduleMirror: state.flipAxes === true,
      payload: payload?.config?.flipAxes === true,
      transitionOrientation: state.flipTransition?.active?.orientation || null,
      categoryAxis,
      xCategoryTicks,
      yCategoryTicks
    };
  });
}

async function expectBoxFlipState(page, tabId, expectedFlip) {
  await expect.poll(
    () => readBoxFlipSnapshot(page),
    { timeout: 20_000, intervals: [100, 200, 400] }
  ).toMatchObject({
    tabId,
    rootTabId: tabId,
    checkbox: expectedFlip,
    moduleMirror: expectedFlip,
    payload: expectedFlip,
    transitionOrientation: expectedFlip ? 'horizontal' : 'vertical',
    categoryAxis: expectedFlip ? 'y' : 'x'
  });
}

test('box flip axes remains isolated across repeated same-component live-DOM reuse', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const tabA = await openBoxTab(page, { first: true });
  await expectBoxFlipState(page, tabA, false);

  const tabB = await openBoxTab(page, { first: false });
  expect(tabB).not.toBe(tabA);
  await expectBoxFlipState(page, tabB, false);

  const flipControl = page.locator('#boxPage:not([hidden]) #boxFlipAxes');
  await expect(flipControl).toBeVisible();
  await flipControl.check();
  await expectBoxFlipState(page, tabB, true);

  const snapshots = [];
  const sequence = [
    [tabA, false],
    [tabB, true],
    [tabA, false],
    [tabB, true],
    [tabA, false]
  ];
  for (const [tabId, expectedFlip] of sequence) {
    await activateTabById(page, tabId);
    await expectBoxFlipState(page, tabId, expectedFlip);
    snapshots.push(await readBoxFlipSnapshot(page));
  }

  await testInfo.attach('box-flip-axes-tab-isolation.snapshots.json', {
    body: Buffer.from(JSON.stringify({ tabA, tabB, snapshots }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(issues.critical).toEqual([]);
});
