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
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first, loadExample: true });
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => {
    if (document.querySelector('#boxPage:not([hidden]) #boxPlot svg')) {
      return true;
    }
    window.Components?.box?.draw?.({ force: true, viewOnly: true, reason: 'e2e-box-activation-draw' });
    return false;
  }, null, { timeout: 45_000 });
  await page.waitForTimeout(250);
}

async function computeStatsWithPairwise(page) {
  await page.waitForSelector('#boxPage:not([hidden]) #boxPlot svg', { timeout: 45_000 });
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

async function resizeActiveBoxFrame(page, dy) {
  await page.evaluate(delta => {
    const svgBox = document.querySelector('#boxPage:not([hidden]) #boxGraphPanel .svgbox');
    if (!svgBox) {
      throw new Error('Missing active Box svgbox');
    }
    const rect = svgBox.getBoundingClientRect();
    const width = Math.max(120, Math.round(Number(rect.width) || 0));
    const height = Math.max(120, Math.round((Number(rect.height) || 0) + Number(delta || 0)));
    const result = window.Shared?.applyResizableBoxSize?.(svgBox, {
      axis: 'both',
      width,
      height,
      forceExact: true,
      preserveAspectLock: true,
      updateAspectRatio: true,
      updateDefaults: false,
      reason: 'e2e-box-significance-resize'
    });
    if (!result) {
      svgBox.style.width = `${width}px`;
      svgBox.style.height = `${height}px`;
      svgBox.dataset.resizerWidth = `${width}px`;
      svgBox.dataset.resizerHeight = `${height}px`;
      svgBox.dataset.graphWidthPx = String(width);
      svgBox.dataset.graphHeightPx = String(height);
    }
    if (typeof window.Components?.box?.__testHooks?.drawResizeEndForTest === 'function') {
      window.__boxResizeEndForTestPromise = window.Components.box.__testHooks.drawResizeEndForTest();
    } else {
      window.Components?.box?.draw?.({ force: true, reason: 'resize', resizePhase: 'end' });
    }
  }, dy);
  await page.evaluate(async () => {
    if (window.__boxResizeEndForTestPromise && typeof window.__boxResizeEndForTestPromise.then === 'function') {
      await window.__boxResizeEndForTestPromise;
      window.__boxResizeEndForTestPromise = null;
    }
  });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    return !state?.showSignificanceBars
      || document.querySelectorAll('#boxPage:not([hidden]) #boxPlot .box-significance-annotation').length > 0;
  }, null, { timeout: 25_000 });
  await page.waitForTimeout(300);
}

async function runResizeMovePreview(page) {
  const result = await page.evaluate(async () => {
    if (typeof window.Components?.box?.__testHooks?.drawResizeMoveForTest !== 'function') {
      throw new Error('Missing Box resize-move test hook');
    }
    return window.Components.box.__testHooks.drawResizeMoveForTest();
  });
  await page.waitForTimeout(300);
  return result;
}

async function dragActiveBoxWidthHandle(page, deltaX) {
  const handle = page.locator('#boxPage:not([hidden]) #boxGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 15_000 });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing Box width resize handle geometry');
  }
  const startX = box.x + Math.max(2, Math.min(box.width - 2, box.width / 2));
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 10 });
  await page.mouse.up();
}

async function setPairwiseComparisons(page, enabled) {
  const toggle = page.locator('#boxShowSignificance');
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if (enabled) {
    if (!(await toggle.isChecked())) {
      await toggle.check({ force: true });
    }
    await page.waitForFunction(() => {
      const state = window.Components?.box?.__getState?.() || null;
      return !!state?.showSignificanceBars
        && document.querySelectorAll('#boxPage:not([hidden]) #boxPlot .box-significance-annotation').length > 0;
    }, null, { timeout: 25_000 });
  } else {
    if (await toggle.isChecked()) {
      await toggle.uncheck({ force: true });
    }
    await page.waitForFunction(() => {
      const state = window.Components?.box?.__getState?.() || null;
      return !state?.showSignificanceBars
        && Number(state?.significanceViewportExtensionPx || 0) === 0
        && document.querySelectorAll('#boxPage:not([hidden]) #boxPlot .box-significance-annotation').length === 0;
    }, null, { timeout: 25_000 });
  }
  await page.waitForTimeout(500);
}

async function readBoxMetrics(page) {
  return page.evaluate(() => {
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const svgBox = document.querySelector('#boxPage:not([hidden]) #boxGraphPanel .svgbox');
    const svg = document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    const state = window.Components?.box?.__getState?.() || null;
    const boxRect = svgBox?.getBoundingClientRect?.() || null;
    const svgRect = svg?.getBoundingClientRect?.() || null;
    const plotH = Number(svg?.dataset?.boxPlotH || NaN);
    const plotTop = Number(svg?.dataset?.boxPlotTop || NaN);
    const graphGeometry = state?.graphGeometry || null;
    const svgHeight = Number(svgRect?.height || NaN);
    return {
      activeTabId,
      scope: svgBox?.dataset?.resizerProportionalFontResizeScope || null,
      sigCount: document.querySelectorAll('#boxPage:not([hidden]) #boxPlot .box-significance-annotation').length,
      boxWidth: Number.isFinite(Number(boxRect?.width)) ? Math.round(Number(boxRect.width)) : null,
      boxHeight: Number.isFinite(Number(boxRect?.height)) ? Math.round(Number(boxRect.height)) : null,
      styleWidth: svgBox?.style?.width || '',
      styleHeight: svgBox?.style?.height || '',
      graphWidthPx: svgBox?.dataset?.graphWidthPx || '',
      graphHeightPx: svgBox?.dataset?.graphHeightPx || '',
      resizerWidth: svgBox?.dataset?.resizerWidth || '',
      resizerHeight: svgBox?.dataset?.resizerHeight || '',
      geometryFrame: graphGeometry?.frame || null,
      significanceViewportExtensionPx: Number(state?.significanceViewportExtensionPx) || 0,
      bottomViewportExtensionPx: Number(state?.bottomViewportExtensionPx) || 0,
      plotTop: Number.isFinite(plotTop) ? Math.round(plotTop) : null,
      plotH: Number.isFinite(plotH) ? plotH : null,
      svgHeight: Number.isFinite(svgHeight) ? svgHeight : null,
      ratio: Number.isFinite(plotH) && Number.isFinite(svgHeight) && svgHeight > 0 ? plotH / svgHeight : null,
      restoredLock: !!state?.restoredSignificanceGeometryLock
    };
  });
}

async function readActiveTabPersistence(page) {
  return page.evaluate(() => {
    const tab = window.Main?.session?.getActiveTab?.() || null;
    const stats = tab?.payload?.config?.stats || null;
    return {
      tabId: tab?.id || null,
      payloadSignature: tab?.payloadSignature || null,
      layoutSignature: tab?.layoutSignature || null,
      payloadDirty: !!tab?.payloadDirty,
      layoutDirty: !!tab?.layoutDirty,
      userModified: !!tab?.userModified,
      statsSignature: JSON.stringify({
        contextSignature: stats?.contextSignature || null,
        version: Number(stats?.version) || 0,
        lastRunVersion: Number(stats?.lastRunVersion) || 0,
        resultsModel: stats?.resultsModel || null,
        reportModel: stats?.reportModel || null
      })
    };
  });
}

async function readActiveBoxPayloadGeometryPlacement(page) {
  return page.evaluate(() => {
    const payload = window.Components?.box?.getPayload?.() || null;
    return {
      hasStatsViewportGeometry: !!payload?.config?.stats?.viewportGeometry,
      hasStatsGraphGeometry: !!payload?.config?.stats?.graphGeometry,
      hasLayoutBoxGeometry: !!payload?.layout?.boxGeometry,
      hasLayoutViewportGeometry: !!payload?.layout?.boxGeometry?.viewportGeometry,
      hasLayoutGraphGeometry: !!payload?.layout?.boxGeometry?.graphGeometry
    };
  });
}

async function readSignificanceLayoutMetrics(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    if (!svg) {
      return { labelCount: 0, pathCount: 0, minLabelBracketGap: null, labelGaps: [] };
    }
    const paths = Array.from(svg.querySelectorAll('path.box-significance-annotation[data-sig-orientation="vertical"]'))
      .map(path => ({
        x1: Number(path.getAttribute('data-sig-x1')),
        x2: Number(path.getAttribute('data-sig-x2')),
        inner: Number(path.getAttribute('data-sig-inner'))
      }))
      .filter(path => Number.isFinite(path.x1) && Number.isFinite(path.x2) && Number.isFinite(path.inner))
      .map(path => ({ ...path, left: Math.min(path.x1, path.x2), right: Math.max(path.x1, path.x2) }));
    const labelGaps = Array.from(svg.querySelectorAll('text.box-significance-annotation')).map(text => {
      let bbox = null;
      try {
        bbox = text.getBBox();
      } catch (_err) {
        return null;
      }
      if (!bbox || !Number.isFinite(bbox.x) || !Number.isFinite(bbox.y) || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) {
        return null;
      }
      const center = bbox.x + bbox.width / 2;
      const bottom = bbox.y + bbox.height;
      const candidates = paths
        .filter(path => center >= path.left - 0.5 && center <= path.right + 0.5 && path.inner >= bottom - 8)
        .map(path => ({ gap: path.inner - bottom, inner: path.inner }));
      if (!candidates.length) {
        return null;
      }
      candidates.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
      return {
        text: text.textContent || '',
        center,
        bottom,
        gap: candidates[0].gap,
        inner: candidates[0].inner
      };
    }).filter(Boolean);
    const gaps = labelGaps.map(entry => entry.gap).filter(value => Number.isFinite(value));
    return {
      labelCount: labelGaps.length,
      pathCount: paths.length,
      minLabelBracketGap: gaps.length ? Math.min(...gaps) : null,
      labelGaps
    };
  });
}

test('box dual-tab pairwise resize keeps per-tab scope isolation and stable plot geometry', async ({ page }, testInfo) => {
  test.setTimeout(200_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  const statsPerfLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('box stats')) {
      statsPerfLogs.push(text);
    }
  });

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
  const secondBeforeResize = await readBoxMetrics(page);

  await activateTabById(page, firstId);
  const firstBeforeSwitch = await readBoxMetrics(page);
  await activateTabById(page, secondId);
  statsPerfLogs.length = 0;
  const resizeMovePreview = await runResizeMovePreview(page);
  const resizeMoveStatsLogs = statsPerfLogs.slice();
  expect(resizeMovePreview.afterToken).toBeGreaterThan(resizeMovePreview.beforeToken);
  expect(resizeMovePreview.afterStatsPrimeSkipCount).toBeGreaterThan(resizeMovePreview.beforeStatsPrimeSkipCount);
  expect(resizeMoveStatsLogs.some(text => text.includes('box stats context signature updated'))).toBeFalsy();
  expect(resizeMoveStatsLogs.some(text => text.includes('box stats auto SVG reapply compute'))).toBeFalsy();
  expect(resizeMoveStatsLogs.some(text => text.includes('box stats recompute for'))).toBeFalsy();
  await resizeActiveBoxFrame(page, 140);
  const secondAfterResize = await readBoxMetrics(page);
  expect(secondAfterResize.sigCount).toBeGreaterThan(0);
  expect(secondAfterResize.plotTop).not.toBeNull();

  await setPairwiseComparisons(page, false);
  const secondAfterPairwiseOff = await readBoxMetrics(page);
  await setPairwiseComparisons(page, true);
  const secondAfterPairwiseOn = await readBoxMetrics(page);
  const secondAfterPairwiseOnSignificanceLayout = await readSignificanceLayoutMetrics(page);

  await activateTabById(page, firstId);
  const firstAfterSwitch = await readBoxMetrics(page);

  await activateTabById(page, secondId);
  const secondAfterReturn = await readBoxMetrics(page);
  const secondAfterReturnSignificanceLayout = await readSignificanceLayoutMetrics(page);
  const beforeLine = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: false, loadExample: true });
  const afterLine = await getWorkspaceTabIds(page);
  const lineId = afterLine.find(id => !beforeLine.has(id));
  expect(lineId).toBeTruthy();
  await activateTabById(page, secondId);
  const secondAfterLineReturnBeforeDrag = await readBoxMetrics(page);
  await dragActiveBoxWidthHandle(page, -35);
  await page.waitForTimeout(1200);
  const secondAfterLineReturnDrag = await readBoxMetrics(page);
  const secondAfterLineReturnDragSignificanceLayout = await readSignificanceLayoutMetrics(page);
  await dragActiveBoxWidthHandle(page, 0);
  await page.waitForTimeout(1200);
  const secondAfterLineReturnHandleClick = await readBoxMetrics(page);
  const secondAfterLineReturnHandleClickSignificanceLayout = await readSignificanceLayoutMetrics(page);

  await activateTabById(page, firstId);
  const firstAfterReturn = await readBoxMetrics(page);

  await testInfo.attach('box-dual-tab-significance-resize.metrics.json', {
    body: Buffer.from(JSON.stringify({ firstId, secondId, lineId, firstBeforeSwitch, secondBeforeResize, secondAfterResize, secondAfterPairwiseOff, secondAfterPairwiseOn, secondAfterPairwiseOnSignificanceLayout, firstAfterSwitch, secondAfterReturn, secondAfterReturnSignificanceLayout, secondAfterLineReturnBeforeDrag, secondAfterLineReturnDrag, secondAfterLineReturnDragSignificanceLayout, secondAfterLineReturnHandleClick, secondAfterLineReturnHandleClickSignificanceLayout, firstAfterReturn, resizeMovePreview, resizeMoveStatsLogs }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(secondAfterResize.activeTabId).toBe(secondId);
  expect(firstAfterSwitch.activeTabId).toBe(firstId);
  expect(secondAfterReturn.activeTabId).toBe(secondId);
  expect(firstAfterReturn.activeTabId).toBe(firstId);

  expect(secondAfterResize.scope).toContain(`@tab:${secondId}`);
  expect(firstAfterSwitch.scope).toContain(`@tab:${firstId}`);
  expect(secondAfterReturn.scope).toContain(`@tab:${secondId}`);

  expect(secondAfterResize.sigCount).toBeGreaterThan(0);
  expect(secondAfterPairwiseOff.sigCount).toBe(0);
  expect(secondAfterPairwiseOn.sigCount).toBeGreaterThan(0);
  expect(secondAfterReturn.sigCount).toBeGreaterThan(0);
  expect(secondAfterPairwiseOff.significanceViewportExtensionPx).toBe(0);
  expect(secondAfterPairwiseOff.plotTop).toBeLessThan(secondAfterResize.plotTop);
  expect(secondAfterPairwiseOff.boxHeight).toBeLessThanOrEqual(secondAfterResize.boxHeight + 2);
  expect(secondAfterPairwiseOn.plotTop).toBeGreaterThan(secondAfterPairwiseOff.plotTop);
  expect(secondAfterPairwiseOn.significanceViewportExtensionPx).toBeGreaterThan(0);
  expect(secondAfterPairwiseOn.boxHeight).toBeGreaterThanOrEqual(
    secondAfterPairwiseOff.boxHeight + Math.max(4, secondAfterPairwiseOn.significanceViewportExtensionPx - 2)
  );
  expect(secondAfterPairwiseOnSignificanceLayout.pathCount).toBeGreaterThan(0);
  expect(secondAfterPairwiseOnSignificanceLayout.labelCount).toBeGreaterThan(0);
  expect(secondAfterPairwiseOnSignificanceLayout.minLabelBracketGap).toBeGreaterThan(1);
  expect(secondAfterReturnSignificanceLayout.pathCount).toBeGreaterThan(0);
  expect(secondAfterReturnSignificanceLayout.labelCount).toBeGreaterThan(0);
  expect(secondAfterReturnSignificanceLayout.minLabelBracketGap).toBeGreaterThan(1);
  expect(secondAfterLineReturnDrag.sigCount).toBeGreaterThan(0);
  expect(secondAfterLineReturnDrag.restoredLock).toBe(false);
  expect(secondAfterLineReturnDrag.boxWidth).not.toBe(secondAfterLineReturnBeforeDrag.boxWidth);
  expect(secondAfterLineReturnDrag.boxHeight).toBe(secondAfterLineReturnBeforeDrag.boxHeight);
  expect(secondAfterLineReturnHandleClick.boxWidth).toBe(secondAfterLineReturnDrag.boxWidth);
  expect(secondAfterLineReturnHandleClick.boxHeight).toBe(secondAfterLineReturnDrag.boxHeight);
  expect(secondAfterLineReturnHandleClick.plotTop).toBe(secondAfterLineReturnDrag.plotTop);
  expect(secondAfterLineReturnHandleClick.plotH).toBe(secondAfterLineReturnDrag.plotH);
  expect(secondAfterLineReturnDragSignificanceLayout.pathCount).toBeGreaterThan(0);
  expect(secondAfterLineReturnDragSignificanceLayout.labelCount).toBeGreaterThan(0);
  expect(secondAfterLineReturnDragSignificanceLayout.minLabelBracketGap).toBeGreaterThan(1);
  expect(secondAfterLineReturnHandleClickSignificanceLayout.pathCount).toBeGreaterThan(0);
  expect(secondAfterLineReturnHandleClickSignificanceLayout.labelCount).toBeGreaterThan(0);
  expect(secondAfterLineReturnHandleClickSignificanceLayout.minLabelBracketGap).toBeGreaterThan(1);

  expect(secondAfterResize.ratio).not.toBeNull();
  expect(secondAfterReturn.ratio).not.toBeNull();
  expect(secondAfterResize.ratio).toBeGreaterThan(0.32);
  expect(secondAfterReturn.ratio).toBeGreaterThan(0.32);
  expect(secondBeforeResize.boxHeight).not.toBeNull();
  expect(secondAfterResize.boxHeight).not.toBeNull();
  expect(Math.abs(secondAfterResize.boxHeight - secondBeforeResize.boxHeight)).toBeGreaterThan(40);
  expect(secondAfterReturn.boxHeight).toBe(secondAfterPairwiseOn.boxHeight);
  expect(secondAfterReturn.boxWidth).toBe(secondAfterPairwiseOn.boxWidth);
  expect(firstAfterSwitch.boxHeight).toBe(firstBeforeSwitch.boxHeight);
  expect(firstAfterSwitch.boxWidth).toBe(firstBeforeSwitch.boxWidth);
  expect(firstAfterReturn.boxHeight).toBe(firstAfterSwitch.boxHeight);
  expect(firstAfterReturn.boxWidth).toBe(firstAfterSwitch.boxWidth);

  expect(issues.critical).toEqual([]);
});

test('box resize persists geometry without rebuilding statistics', async ({ page }, testInfo) => {
  test.setTimeout(140_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.addInitScript(() => {
    window.__GRAPHITIX_DEBUG__ = true;
    try { window.localStorage?.setItem?.('graphitix.debug', 'true'); } catch (_err) {}
  });
  const resizeLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (
      text.includes('box.getPayload captured state')
      || text.includes('skipped-drift')
      || text.includes('archive-save-lifecycle-snapshot')
      || text.includes('box stats prime skipped')
      || text.includes('box stats context signature updated')
      || text.includes('box stats recompute')
    ) {
      resizeLogs.push(text);
    }
  });

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openBoxTab(page, { first: true });
  await computeStatsWithPairwise(page);
  await setPairwiseComparisons(page, false);
  resizeLogs.length = 0;

  const before = await readBoxMetrics(page);
  const beforePersistence = await readActiveTabPersistence(page);
  await dragActiveBoxWidthHandle(page, -70);
  await page.waitForTimeout(1600);
  const after = await readBoxMetrics(page);
  const afterPersistence = await readActiveTabPersistence(page);
  const resizeLogsBeforePayloadInspection = resizeLogs.slice();
  const payloadGeometry = await readActiveBoxPayloadGeometryPlacement(page);

  await testInfo.attach('box-layout-only-resize-performance.logs.json', {
    body: Buffer.from(JSON.stringify({ before, after, beforePersistence, afterPersistence, payloadGeometry, resizeLogs: resizeLogsBeforePayloadInspection }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(after.boxWidth).not.toBe(before.boxWidth);
  expect(after.boxHeight).toBe(before.boxHeight);
  expect(afterPersistence.payloadSignature).not.toBe(beforePersistence.payloadSignature);
  expect(afterPersistence.statsSignature).toBe(beforePersistence.statsSignature);
  expect(afterPersistence.payloadDirty).toBe(false);
  expect(payloadGeometry.hasStatsViewportGeometry).toBe(false);
  expect(payloadGeometry.hasStatsGraphGeometry).toBe(false);
  expect(payloadGeometry.hasLayoutBoxGeometry).toBe(true);
  expect(payloadGeometry.hasLayoutViewportGeometry).toBe(true);
  expect(payloadGeometry.hasLayoutGraphGeometry).toBe(true);
  expect(resizeLogsBeforePayloadInspection.some(text => text.includes('skipped-drift'))).toBeFalsy();
  expect(resizeLogsBeforePayloadInspection.some(text => text.includes('box stats context signature updated'))).toBeFalsy();
  expect(resizeLogsBeforePayloadInspection.some(text => text.includes('box stats recompute'))).toBeFalsy();
  expect(issues.critical).toEqual([]);
});
