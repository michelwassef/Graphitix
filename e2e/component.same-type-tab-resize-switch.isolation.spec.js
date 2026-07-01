const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function openComponentTab(page, component, { first = false } = {}) {
  await openComponentFromWelcome(page, component, { first });
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  const clicked = await page.waitForFunction((id) => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) {
    await page.evaluate((id) => window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-resize-switch-activate' }), tabId);
    await page.waitForFunction((id) => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  }
  await page.waitForTimeout(350);
}

async function getActiveSessionSnapshot(page) {
  return page.evaluate(() => {
    const stateTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const ariaTab = document.querySelector('#workspaceTabsList .workspace-tab[aria-selected="true"]');
    const classTab = document.querySelector('#workspaceTabsList .workspace-tab.workspace-tab--active');
    return {
      stateTabId,
      ariaTabId: ariaTab?.getAttribute('data-tab-id') || null,
      classTabId: classTab?.getAttribute('data-tab-id') || null
    };
  });
}

async function dragPanelResizerIfPresent(page, pageId, dx) {
  const handle = page.locator(`#${pageId}:not([hidden]) .panel-resizer`).first();
  if (await handle.count() < 1) {
    return false;
  }
  const box = await handle.boundingBox();
  if (!box) {
    return false;
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(4, Math.min(box.height - 4, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return true;
}

async function dragSvgResizerIfPresent(page, pageId, dy) {
  const handle = page.locator(`#${pageId}:not([hidden]) .svgbox .resizer-horizontal`).first();
  if (await handle.count() < 1) {
    return false;
  }
  const box = await handle.boundingBox();
  if (!box) {
    return false;
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + dy, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  return true;
}

async function readLayoutSnapshot(page, pageId) {
  return page.evaluate((pageId) => {
    const pageRoot = document.querySelector(`#${pageId}:not([hidden])`);
    const svgBox = pageRoot?.querySelector?.('.svgbox') || null;
    const svgRect = svgBox?.getBoundingClientRect?.() || null;
    const panel = pageRoot?.querySelector?.('.panel:not(.config-options), [id$="GraphPanel"]') || null;
    const panelRect = panel?.getBoundingClientRect?.() || null;
    return {
      svgWidth: svgRect ? Math.round(svgRect.width) : null,
      svgHeight: svgRect ? Math.round(svgRect.height) : null,
      graphPanelWidth: panelRect ? Math.round(panelRect.width) : null
    };
  }, pageId);
}

for (const component of COMPONENT_MATRIX) {
  test(`same-component resize switch keeps tab/session isolation for ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    const beforeFirst = new Set(await getWorkspaceTabIds(page));
    await openComponentTab(page, component, { first: true });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await page.waitForTimeout(350);
    const afterFirst = await getWorkspaceTabIds(page);
    const firstId = afterFirst.find(id => !beforeFirst.has(id));
    expect(firstId).toBeTruthy();

    const beforeSecond = new Set(afterFirst);
    await openComponentTab(page, component, { first: false });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await page.waitForTimeout(350);
    const afterSecond = await getWorkspaceTabIds(page);
    const secondId = afterSecond.find(id => !beforeSecond.has(id));
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);

    const snapshots = [];

    await activateTabById(page, secondId);
    snapshots.push({ step: 'second-before', active: await getActiveSessionSnapshot(page), layout: await readLayoutSnapshot(page, component.pageId) });
    const panelResizedOnSecond = await dragPanelResizerIfPresent(page, component.pageId, -120);
    const svgResizedOnSecond = await dragSvgResizerIfPresent(page, component.pageId, 90);
    snapshots.push({ step: 'second-after-resize', active: await getActiveSessionSnapshot(page), layout: await readLayoutSnapshot(page, component.pageId), panelResizedOnSecond, svgResizedOnSecond });

    await activateTabById(page, firstId);
    snapshots.push({ step: 'first-after-switch', active: await getActiveSessionSnapshot(page), layout: await readLayoutSnapshot(page, component.pageId) });
    const panelResizedOnFirst = await dragPanelResizerIfPresent(page, component.pageId, 120);
    const svgResizedOnFirst = await dragSvgResizerIfPresent(page, component.pageId, -70);
    snapshots.push({ step: 'first-after-resize', active: await getActiveSessionSnapshot(page), layout: await readLayoutSnapshot(page, component.pageId), panelResizedOnFirst, svgResizedOnFirst });

    await testInfo.attach(`${component.type}-resize-switch-isolation.snapshots.json`, {
      body: Buffer.from(JSON.stringify({ firstId, secondId, snapshots }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    const requiredSecondState = snapshots.find(s => s.step === 'second-after-resize')?.active;
    const requiredFirstState = snapshots.find(s => s.step === 'first-after-switch')?.active;
    const finalState = snapshots.find(s => s.step === 'first-after-resize')?.active;

    expect(requiredSecondState?.stateTabId).toBe(secondId);
    expect(requiredFirstState?.stateTabId).toBe(firstId);
    expect(finalState?.stateTabId).toBe(firstId);

    if (requiredSecondState?.ariaTabId) expect(requiredSecondState.ariaTabId).toBe(secondId);
    if (requiredFirstState?.ariaTabId) expect(requiredFirstState.ariaTabId).toBe(firstId);
    if (finalState?.ariaTabId) expect(finalState.ariaTabId).toBe(firstId);

    expect(issues.critical).toEqual([]);
  });
}
