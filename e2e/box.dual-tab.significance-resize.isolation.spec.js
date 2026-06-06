const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function openBoxTab(page, { first = false } = {}) {
  if (first) {
    const card = page.locator('#graphSelectionGrid [data-graph-type="box"]').first();
    await expect(card).toBeVisible();
    await card.click({ force: true });
    await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
    return;
  }
  await page.evaluate(async () => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const maybe = tabs.handleGraphSelection('box', { reason: 'e2e-box-dual-tab-significance-resize' });
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const duplicateEmpty = document.querySelector('#duplicateEmpty');
    if (prompt && duplicateEmpty && !duplicateEmpty.disabled) {
      duplicateEmpty.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  });
  const visibleCard = page.locator('#graphSelectionGrid [data-graph-type="box"]').first();
  if (await visibleCard.isVisible().catch(() => false)) {
    await visibleCard.click({ force: true });
  }
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForTimeout(400);
}

async function computeStatsWithPairwise(page) {
  await expect(page.locator('#boxLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.locator('#boxLoadExample').click();
  await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  const sigToggle = page.locator('#boxShowSignificance');
  await expect(sigToggle).toBeVisible({ timeout: 15_000 });
  if (!(await sigToggle.isChecked())) {
    await sigToggle.check({ force: true });
  }
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot .box-significance-annotation').length > 0, null, { timeout: 20_000 });
}

async function dragSvgResizerVertical(page, dy) {
  const handle = page.locator('#boxPage:not([hidden]) .svgbox .resizer-horizontal').first();
  await expect(handle).toBeVisible({ timeout: 20_000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error('Unable to resolve box horizontal resizer bounds');
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + dy, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

async function readBoxMetrics(page) {
  return page.evaluate(() => {
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const svgBox = document.querySelector('#boxPage:not([hidden]) #boxGraphPanel .svgbox');
    const svg = document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    const state = window.Components?.box?.__getState?.() || null;
    const svgRect = svg?.getBoundingClientRect?.() || null;
    const plotH = Number(svg?.dataset?.boxPlotH || NaN);
    const svgHeight = Number(svgRect?.height || NaN);
    return {
      activeTabId,
      scope: svgBox?.dataset?.resizerProportionalFontResizeScope || null,
      sigCount: document.querySelectorAll('#boxPage:not([hidden]) #boxPlot .box-significance-annotation').length,
      plotH: Number.isFinite(plotH) ? plotH : null,
      svgHeight: Number.isFinite(svgHeight) ? svgHeight : null,
      ratio: Number.isFinite(plotH) && Number.isFinite(svgHeight) && svgHeight > 0 ? plotH / svgHeight : null,
      restoredLock: !!state?.restoredSignificanceGeometryLock
    };
  });
}

test('box dual-tab pairwise resize keeps per-tab scope isolation and stable plot geometry', async ({ page }, testInfo) => {
  test.setTimeout(200_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const beforeFirst = new Set(await getWorkspaceTabIds(page));
  await openBoxTab(page, { first: true });
  await computeStatsWithPairwise(page);
  const afterFirst = await getWorkspaceTabIds(page);
  const firstId = afterFirst.find(id => !beforeFirst.has(id));
  expect(firstId).toBeTruthy();

  const beforeSecond = new Set(afterFirst);
  await openBoxTab(page, { first: false });
  await computeStatsWithPairwise(page);
  const afterSecond = await getWorkspaceTabIds(page);
  const secondId = afterSecond.find(id => !beforeSecond.has(id));
  expect(secondId).toBeTruthy();

  await activateTabById(page, secondId);
  await dragSvgResizerVertical(page, -120);
  const secondAfterResize = await readBoxMetrics(page);

  await activateTabById(page, firstId);
  const firstAfterSwitch = await readBoxMetrics(page);

  await activateTabById(page, secondId);
  const secondAfterReturn = await readBoxMetrics(page);

  await testInfo.attach('box-dual-tab-significance-resize.metrics.json', {
    body: Buffer.from(JSON.stringify({ firstId, secondId, secondAfterResize, firstAfterSwitch, secondAfterReturn }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(secondAfterResize.activeTabId).toBe(secondId);
  expect(firstAfterSwitch.activeTabId).toBe(firstId);
  expect(secondAfterReturn.activeTabId).toBe(secondId);

  expect(secondAfterResize.scope).toContain(`@tab:${secondId}`);
  expect(firstAfterSwitch.scope).toContain(`@tab:${firstId}`);
  expect(secondAfterReturn.scope).toContain(`@tab:${secondId}`);

  expect(secondAfterResize.sigCount).toBeGreaterThan(0);
  expect(secondAfterReturn.sigCount).toBeGreaterThan(0);

  expect(secondAfterResize.ratio).not.toBeNull();
  expect(secondAfterReturn.ratio).not.toBeNull();
  expect(secondAfterResize.ratio).toBeGreaterThan(0.32);
  expect(secondAfterReturn.ratio).toBeGreaterThan(0.32);

  expect(issues.critical).toEqual([]);
});
