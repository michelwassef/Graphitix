const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function openWorkspace(page, component) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, component, { first: true });
}

async function setCheckboxes(page, ids, checked = true) {
  await page.evaluate(({ checkboxIds, nextChecked }) => {
    checkboxIds.forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.checked = !!nextChecked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, { checkboxIds: ids, nextChecked: checked });
}

async function waitForScatterRegressionOverlays(page) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#scatterPlot svg');
      if (!root) return false;
      return !!root.querySelector('[data-scatter-overlay="trend"]')
        && !!root.querySelector('[data-scatter-overlay="confidence"]')
        && !!root.querySelector('[data-scatter-overlay="prediction"]');
    },
    null,
    { timeout: 35_000 }
  );
}

async function waitForScatterPlotStatsText(page) {
  await page.waitForFunction(
    () => {
      const texts = Array.from(document.querySelectorAll('#scatterPlot svg text'))
        .map(node => node.textContent || '')
        .filter(Boolean);
      return texts.some(text => /R(?:²|\^2)|r\s*=|p\s*[<=>]/i.test(text));
    },
    null,
    { timeout: 20_000 }
  );
}

async function waitForLineStatsResults(page) {
  await page.waitForFunction(
    () => {
      const panel = document.getElementById('lineStatsResults');
      return !!panel?.querySelector?.('.stats-table-card, table, .stats-report-panel');
    },
    null,
    { timeout: 35_000 }
  );
}

async function waitForLineRegressionOverlays(page) {
  await page.waitForFunction(
    () => {
      const svg = document.querySelector('#linePlot svg');
      if (!svg) return false;
      return !!svg.querySelector('[data-line-overlay^="trend"]')
        && !!svg.querySelector('[data-band="confidence"]')
        && !!svg.querySelector('[data-band="prediction"]');
    },
    null,
    { timeout: 35_000 }
  );
}

async function waitForPieStatsResults(page) {
  await page.waitForFunction(
    () => {
      const panel = document.getElementById('pieStatsResults');
      return !!panel?.querySelector?.('.stats-table-card, table, .stats-report-panel');
    },
    null,
    { timeout: 35_000 }
  );
}

test('scatter restores computed trendline intervals, plot stats, and statistics state from payload', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openWorkspace(page, { type: 'scatter', pageId: 'scatterPage' });
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#scatterPlot svg'), null, { timeout: 30_000 });

  await setCheckboxes(page, ['scatterShowLine', 'scatterShowPlotStats', 'scatterShowCI', 'scatterShowPI'], true);
  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await waitForScatterRegressionOverlays(page);
  await waitForScatterPlotStatsText(page);

  const payload = await page.evaluate(() => window.Components.scatter.getPayload());
  expect(payload?.config?.showLine).toBe(true);
  expect(payload?.config?.showPlotStats).toBe(true);
  expect(payload?.config?.stats?.precomputedStats).toBeTruthy();
  expect(payload?.config?.stats?.lastRunVersion).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.scatter?.loadFromPayload, null, { timeout: 20_000 });
  await page.evaluate(saved => {
    window.Components.scatter.loadFromPayload(saved, { reason: 'e2e-restore' });
  }, payload);

  await waitForScatterRegressionOverlays(page);
  await waitForScatterPlotStatsText(page);
  await expect(page.locator('#scatterComputeStats')).toHaveText(/Recalculate statistics/, { timeout: 20_000 });
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 20_000 });

  expect(issues.critical).toEqual([]);
});

test('scatter restores graph controls, point labels, raw formulas, and excluded cells from payload', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openWorkspace(page, { type: 'scatter', pageId: 'scatterPage' });
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    return !!(hot?.gridApi && typeof hot.setDataAtCell === 'function');
  }, null, { timeout: 20_000 });

  await page.evaluate(() => {
    const scatter = window.Components.scatter;
    const hot = scatter.__ensureHotForActiveTab();
    hot.loadData([
      ['Label', 'X title', 'Y title', 'Z title'],
      ['Alpha', '5', '=B1*2', ''],
      ['Beta', '8', '11', ''],
      ['Gamma', '12', '15', '']
    ], { source: 'e2e-persistence-seed' });
    hot.applyExclusions?.({ cells: [[2, 2]] });
    scatter.__testHooks?.setRowSelected?.(hot, 1, true, { preserveExisting: true });
    const dotSize = document.getElementById('scatterDotSize');
    if (dotSize) {
      dotSize.value = '9';
      dotSize.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const showGrid = document.getElementById('scatterShowGrid');
    if (showGrid) {
      showGrid.checked = true;
      showGrid.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const showFrame = document.getElementById('scatterShowFrame');
    if (showFrame) {
      showFrame.checked = true;
      showFrame.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('#scatterPlot svg [data-layer="point-labels"] text'))
      .some(node => /Alpha/.test(node.textContent || '')),
    null,
    { timeout: 30_000 }
  );

  const payload = await page.evaluate(() => window.Components.scatter.getPayload());
  expect(payload?.config?.selectedRows).toContain(1);
  expect(payload?.config?.dotSize).toBe('9');
  expect(payload?.config?.showGrid).toBe(true);
  expect(payload?.config?.showFrame).toBe(true);
  expect(JSON.stringify(payload?.exclusions || {})).toContain('[2,2]');
  expect(payload?.data?.[1]?.[2]).toBe('=B1*2');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.scatter?.loadFromPayload, null, { timeout: 20_000 });
  await page.evaluate(saved => {
    window.Components.scatter.loadFromPayload(saved, { reason: 'e2e-restore' });
  }, payload);

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('#scatterPlot svg [data-layer="point-labels"] text'))
      .some(node => /Alpha/.test(node.textContent || '')),
    null,
    { timeout: 30_000 }
  );

  const restored = await page.evaluate(() => {
    const hot = window.Components.scatter.__ensureHotForActiveTab();
    const api = hot.gridApi;
    const node = api?.getDisplayedRowAtIndex?.(1) || null;
    return {
      dotSize: document.getElementById('scatterDotSize')?.value || null,
      showGrid: !!document.getElementById('scatterShowGrid')?.checked,
      showFrame: !!document.getElementById('scatterShowFrame')?.checked,
      rawFormula: hot.getDataAtCell(1, 2),
      displayedFormula: node && typeof api?.getValue === 'function' ? api.getValue('c2', node) : null,
      exclusions: hot.exportExclusions?.() || null,
      selectedCount: api?.getSelectedNodes?.()?.length || 0
    };
  });

  expect(restored.dotSize).toBe('9');
  expect(restored.showGrid).toBe(true);
  expect(restored.showFrame).toBe(true);
  expect(restored.rawFormula).toBe('=B1*2');
  expect(String(restored.displayedFormula).trim()).toBe('10');
  expect(JSON.stringify(restored.exclusions || {})).toContain('[2,2]');
  expect(restored.selectedCount).toBeGreaterThan(0);
  expect(issues.critical).toEqual([]);
});

test('pie restores computed statistics results and calculated button state from payload', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openWorkspace(page, { type: 'pie', pageId: 'piePage' });
  await clickExampleButtonIfPresent(page, 'pieLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#piePlot svg'), null, { timeout: 30_000 });

  await expect(page.locator('#pieComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#pieComputeStats').click();
  await expect(page.locator('#pieStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await waitForPieStatsResults(page);

  const payload = await page.evaluate(() => window.Components.pie.getPayload());
  expect(payload?.config?.stats?.resultsHtml).toContain('stats-table-card');
  expect(payload?.config?.stats?.lastRunSignature).toBeTruthy();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.pie?.loadFromPayload, null, { timeout: 20_000 });
  await page.evaluate(saved => {
    window.Components.pie.loadFromPayload(saved, { reason: 'e2e-restore' });
  }, payload);

  await waitForPieStatsResults(page);
  await expect(page.locator('#pieComputeStats')).toHaveText(/Recalculate statistics/, { timeout: 20_000 });
  await expect(page.locator('#pieStatsStatus')).toContainText('Statistics up to date.', { timeout: 20_000 });

  expect(issues.critical).toEqual([]);
});

test('line regression overlays require calculated statistics and interval toggles preserve results', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openWorkspace(page, { type: 'line', pageId: 'linePage' });
  await clickExampleButtonIfPresent(page, 'lineLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#linePlot svg'), null, { timeout: 30_000 });

  await expect(page.locator('#lineShowTrendLine')).toBeDisabled({ timeout: 20_000 });
  await expect(page.locator('#lineShowIntervals')).toBeDisabled({ timeout: 20_000 });
  await expect(page.locator('#lineShowPredictionIntervals')).toBeDisabled({ timeout: 20_000 });

  await setCheckboxes(page, ['lineShowTrendLine', 'lineShowIntervals', 'lineShowPredictionIntervals'], true);
  await page.waitForTimeout(750);
  await expect(page.locator('#linePlot svg [data-line-overlay^="trend"]')).toHaveCount(0);
  await expect(page.locator('#linePlot svg [data-band="confidence"]')).toHaveCount(0);
  await expect(page.locator('#linePlot svg [data-band="prediction"]')).toHaveCount(0);

  await expect(page.locator('#lineComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#lineComputeStats').click();
  await expect(page.locator('#lineStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await expect(page.locator('#lineShowTrendLine')).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator('#lineShowIntervals')).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator('#lineShowPredictionIntervals')).toBeEnabled({ timeout: 20_000 });
  await waitForLineStatsResults(page);
  await expect(page.locator('#lineStatsResults')).toContainText('Residual diagnostics', { timeout: 20_000 });
  await waitForLineRegressionOverlays(page);

  await setCheckboxes(page, ['lineShowIntervals'], false);
  await waitForLineStatsResults(page);
  await expect(page.locator('#lineStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
  await expect(page.locator('#lineComputeStats')).toHaveText(/Recalculate statistics/, { timeout: 20_000 });
  await expect(page.locator('#lineStatsStatus')).toContainText('Statistics up to date.', { timeout: 20_000 });

  await setCheckboxes(page, ['lineShowPredictionIntervals'], false);
  await waitForLineStatsResults(page);
  await expect(page.locator('#lineStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
  await expect(page.locator('#lineComputeStats')).toHaveText(/Recalculate statistics/, { timeout: 20_000 });
  await expect(page.locator('#lineStatsStatus')).toContainText('Statistics up to date.', { timeout: 20_000 });

  expect(issues.critical).toEqual([]);
});

test('line restores persisted statistics results and calculated button state from payload', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openWorkspace(page, { type: 'line', pageId: 'linePage' });
  await clickExampleButtonIfPresent(page, 'lineLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#linePlot svg'), null, { timeout: 30_000 });

  await setCheckboxes(page, ['lineShowTrendLine', 'lineShowIntervals', 'lineShowPredictionIntervals'], true);
  await expect(page.locator('#lineComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#lineComputeStats').click();
  await expect(page.locator('#lineStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await waitForLineStatsResults(page);

  const savedResultsText = await page.locator('#lineStatsResults').innerText();
  expect(savedResultsText).not.toContain('Statistics will appear after calculation.');
  const payload = await page.evaluate(() => window.Components.line.getPayload());
  expect(payload?.config?.stats?.resultsHtml).toContain('stats-table-card');
  expect(payload?.config?.stats?.lastRunVersion).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.line?.loadFromPayload, null, { timeout: 20_000 });
  await page.evaluate(saved => {
    window.Components.line.loadFromPayload(saved, { reason: 'e2e-restore' });
  }, payload);

  await waitForLineStatsResults(page);
  await expect(page.locator('#lineStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
  await expect(page.locator('#lineComputeStats')).toHaveText(/Recalculate statistics/, { timeout: 20_000 });
  await expect(page.locator('#lineStatsStatus')).toContainText('Statistics up to date.', { timeout: 20_000 });

  expect(issues.critical).toEqual([]);
});
