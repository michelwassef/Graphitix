const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
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
  if (first) {
    const card = page.locator(`#graphSelectionGrid [data-graph-type="${component.type}"]`).first();
    await expect(card).toBeVisible();
    await card.click({ force: true });
    await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
    return;
  }
  await page.evaluate(async (type) => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const maybe = tabs.handleGraphSelection(type, { reason: 'e2e-resize-exit-reenter' });
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const duplicateEmpty = document.querySelector('#duplicateEmpty');
    if (prompt && duplicateEmpty && !duplicateEmpty.disabled) {
      duplicateEmpty.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, component.type);
  const visibleCard = page.locator(`#graphSelectionGrid [data-graph-type="${component.type}"]`).first();
  if (await visibleCard.isVisible().catch(() => false)) {
    await visibleCard.click({ force: true });
  }
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForTimeout(450);
}

async function activateSelectionTab(page) {
  const selectionTabId = await page.evaluate(async () => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    return window.Main?.session?.workspaceState?.activeTabId || null;
  });
  if (selectionTabId) {
    await activateTabById(page, selectionTabId);
  }
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(450);
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

function expectNearIfFinite(actual, expected, tolerance, label) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return;
  }
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

for (const component of COMPONENT_MATRIX) {
  test(`resize persists after tab exit/re-enter for ${component.type}`, async ({ page }, testInfo) => {
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

    await activateTabById(page, secondId);
    const before = await readLayoutSnapshot(page, component.pageId);
    const panelResized = await dragPanelResizerIfPresent(page, component.pageId, -120);
    const svgResized = await dragSvgResizerIfPresent(page, component.pageId, 90);
    const afterResize = await readLayoutSnapshot(page, component.pageId);

    await activateSelectionTab(page);
    await activateTabById(page, secondId);
    const afterReenter = await readLayoutSnapshot(page, component.pageId);

    await testInfo.attach(`${component.type}-resize-exit-reenter.snapshots.json`, {
      body: Buffer.from(JSON.stringify({
        firstId,
        secondId,
        before,
        afterResize,
        afterReenter,
        panelResized,
        svgResized
      }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    if (panelResized || svgResized) {
      expectNearIfFinite(afterReenter.svgWidth, afterResize.svgWidth, 3, 'svgWidth');
      expectNearIfFinite(afterReenter.svgHeight, afterResize.svgHeight, 3, 'svgHeight');
      expectNearIfFinite(afterReenter.graphPanelWidth, afterResize.graphPanelWidth, 4, 'graphPanelWidth');
    }

    expect(issues.critical).toEqual([]);
  });
}
