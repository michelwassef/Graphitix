const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

test('Heatmap inference controls stay hidden until Show inference is checked', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'heatmap', pageId: 'heatmapPage' }, { first: true });
  await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true });

  const panel = page.locator('#heatmapPage:not([hidden]) #heatmapGraphPanel');
  const showInference = panel.locator('#heatmapShowSignificance');
  const decisionMarker = panel.locator('#heatmapSignificanceDisplay').locator('xpath=..');
  const multipleTesting = panel.locator('#heatmapSignificanceCorrection').locator('xpath=..');
  const targetFdr = panel.locator('#heatmapStatsInferenceControls [data-stats-inference-key="targetFdr"]');

  await page.evaluate(async () => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const component = window.Components?.heatmap;
    const session = component?.__testHooks?.getSession?.(tabId) || null;
    const hot = session?.managers?.hot || null;
    if (!tabId || !hot?.loadData) throw new Error('Active Heatmap table is unavailable');
    hot.loadData([
      ['Gene', 'A', 'B', 'C'],
      ['g1', 1, 8, 1],
      ['g2', 2, 7, 3],
      ['g3', 3, 6, 2],
      ['g4', 4, 5, 6],
      ['g5', 5, 4, 4],
      ['g6', 6, 3, 8],
      ['g7', 7, 2, 5],
      ['g8', 8, 1, 7]
    ]);
    await component.draw({ tabId, reason: 'heatmap-inference-off-default', force: true });
  });

  await expect(showInference).not.toBeChecked();
  await expect(decisionMarker).toBeHidden();
  await expect(multipleTesting).toBeHidden();
  await expect(targetFdr).toBeHidden();
  await expect(panel.locator('#heatmapStatsContent')).not.toContainText(/raw p\s*=|adjusted p\s*=|p\s*=/i);
  const readInferenceState = () => page.evaluate(() => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const session = window.Components?.heatmap?.__testHooks?.getSession?.(tabId) || null;
    const stats = session?.results?.stats || null;
    return {
      showSignificance: stats?.showSignificance === true,
      testedPairCount: Number(stats?.testedPairCount || 0),
      pairCount: Array.isArray(stats?.pairResults) ? stats.pairResults.length : 0,
      finitePValueCount: Array.isArray(stats?.pairResults)
        ? stats.pairResults.filter(pair => Number.isFinite(Number(pair?.rawPValue))).length
        : 0,
      correction: stats?.significanceCorrection || null,
      rawPValues: Array.isArray(stats?.pairResults) ? stats.pairResults.map(pair => pair.rawPValue) : [],
      adjustedPValues: Array.isArray(stats?.pairResults) ? stats.pairResults.map(pair => pair.adjustedPValue) : []
    };
  });
  expect(await readInferenceState()).toMatchObject({ showSignificance: false, testedPairCount: 0, pairCount: 0 });

  await page.evaluate(() => {
    const stats = window.Shared?.stats;
    const original = stats?.studentTTwoSidedPValue;
    if (typeof original !== 'function') throw new Error('Student-t probability helper is unavailable');
    window.__heatmapStudentTPValueCalls = 0;
    stats.studentTTwoSidedPValue = (...args) => {
      window.__heatmapStudentTPValueCalls += 1;
      return original(...args);
    };
  });
  await showInference.check();
  await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true });
  await expect(decisionMarker).toBeVisible();
  await expect(multipleTesting).toBeVisible();
  await expect(targetFdr).toBeVisible();
  expect(await readInferenceState()).toMatchObject({
    showSignificance: true,
    testedPairCount: 3,
    pairCount: 3,
    finitePValueCount: 3,
    correction: 'bh'
  });
  const beforeCorrection = await readInferenceState();
  const pValueCallsAfterCalculation = await page.evaluate(() => window.__heatmapStudentTPValueCalls);

  await panel.locator('#heatmapSignificanceCorrection').selectOption('holm');
  await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true });
  const afterCorrection = await readInferenceState();
  expect(afterCorrection.correction).toBe('holm');
  expect(afterCorrection.rawPValues).toEqual(beforeCorrection.rawPValues);
  expect(afterCorrection.adjustedPValues).not.toEqual(beforeCorrection.adjustedPValues);
  expect(await page.evaluate(() => window.__heatmapStudentTPValueCalls)).toBe(pValueCallsAfterCalculation);

  await showInference.uncheck();
  await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true });
  await expect(decisionMarker).toBeHidden();
  await expect(multipleTesting).toBeHidden();
  await expect(targetFdr).toBeHidden();
  expect(await readInferenceState()).toMatchObject({ showSignificance: false, testedPairCount: 0, pairCount: 0 });
});
