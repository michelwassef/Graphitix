const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { saveWorkspaceArchive, openWorkspaceArchive } = require('../helpers/archiveDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function computeBoxStatsAndShowSignificance(page) {
  const computeButton = page.locator('#boxComputeStats');
  await expect(computeButton).toBeVisible({ timeout: 20_000 });
  await expect(computeButton).toBeEnabled({ timeout: 20_000 });
  await computeButton.click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  const toggle = page.locator('#boxShowSignificance');
  await expect(toggle).toBeVisible();
  if (!(await toggle.isChecked())) {
    await toggle.check();
  }
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0,
    null,
    { timeout: 20_000 }
  );
}

for (const flipped of [false, true]) {
  test(`cached Box comparisons reopen with live line and label controls (${flipped ? 'horizontal' : 'vertical'})`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await openBoxWorkspace(page);
    await loadBoxExample(page);
    if (flipped) await page.locator('#boxFlipAxes').check();
    await computeBoxStatsAndShowSignificance(page);
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    const panel = page.locator('.font-toolbar-host--visible .significance-controls-panel');
    await page.locator('#boxPlot path.box-significance-hit-overlay').first().dispatchEvent('click');
    await expect(panel).toBeVisible();
    const archivePath = testInfo.outputPath('box-comparison-controls.graph');
    await saveWorkspaceArchive(page, archivePath, {
      scope: 'workspace', captureActive: true, payloadMode: 'adaptive', awaitPreviews: true,
      reason: 'box-comparison-controls-reopen'
    });
    await openWorkspaceArchive(page, archivePath, { componentType: 'box', timeout: 45_000 });
    await waitForDocumentOpenComplete(page);
    await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
    await expect.poll(() => page.locator('#boxPlot text.box-significance-annotation').count()).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    const overlayCount = await page.locator('#boxPlot rect[data-significance-control="1"]').count();
    for (const selector of ['path.box-significance-hit-overlay', 'text.box-significance-annotation', 'rect[data-significance-control="1"]']) {
      await page.locator(`#boxPlot ${selector}`).first().dispatchEvent('click');
      await expect(panel).toBeVisible();
      await expect(page.locator('[data-significance-label-mode]')).toBeVisible();
      await page.evaluate(() => window.Shared.significanceControls.close('e2e-next-target'));
      await expect(panel).toBeHidden();
    }
    await page.evaluate(() => window.Components.box.rehydrateGraphInteractions({ tabId: window.Main.session.workspaceState.activeTabId }));
    expect(await page.locator('#boxPlot rect[data-significance-control="1"]').count()).toBe(overlayCount);
    const original = await page.evaluate(() => {
      window.__boxStaleComparison = document.querySelector('#boxPlot path.box-significance-hit-overlay');
      return { id: window.Main.session.workspaceState.activeTabId, config: window.Components.box.getPayload().config.significance };
    });
    await page.locator('#boxPlot path.box-significance-hit-overlay').first().dispatchEvent('click');
    await expect(panel).toBeVisible();
    await panel.getByRole('checkbox', { name: 'Toggle significance whiskers' }).uncheck();
    await expect.poll(() => page.evaluate(() => window.Components.box.getPayload().config.significance.showWhiskers)).toBe(false);
    await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
    original.config = await page.evaluate(() => window.Components.box.getPayload().config.significance);
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' });
    await expect(panel).toBeHidden();
    const secondBefore = await page.evaluate(() => window.Components.box.getPayload().config.significance);
    await page.evaluate(() => window.__boxStaleComparison.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => window.Components.box.getPayload().config.significance)).toEqual(secondBefore);
    await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'box-comparison-controls-owner-return' }), original.id);
    await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
    await expect(page.locator('#boxPage:not([hidden])')).toBeVisible();
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await page.locator('#boxPlot path.box-significance-hit-overlay').first().dispatchEvent('click');
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => window.Components.box.getPayload().config.significance)).toEqual(original.config);
    await page.evaluate(() => { delete window.__boxStaleComparison; });
    expect(issues.critical).toEqual([]);
  });
}

test('two populated Box tabs keep one Label selector and independent significance settings through undo and reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  const panel = page.locator('.font-toolbar-host--visible .significance-controls-panel');
  const selector = panel.locator('[data-significance-label-mode]');
  const owners = [];
  const openControls = async () => {
    await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await page.locator('#boxPlot path.box-significance-hit-overlay').first().dispatchEvent('click');
    await expect(panel).toBeVisible();
    await expect(selector).toHaveCount(1);
  };
  const capture = () => page.evaluate(() => {
    const payload = window.Components.box.getPayload();
    const data = payload.data.slice();
    // The grid supplies spare blank rows; retain every populated/interior row.
    while(data.length && data.at(-1).every(value => value == null || value === '')) data.pop();
    return { id: window.Main.session.workspaceState.activeTabId, mode: payload.config.significanceLabelMode, style: payload.config.significance, data };
  });
  for (const mode of ['decision', 'p']) {
    if(owners.length) await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' });
    await loadBoxExample(page);
    await page.evaluate(name => window.Components.box.__getState().hot.setDataAtCell(0, 0, name, 'e2e-box-owned-label-data'), `Owner ${owners.length + 1}`);
    await computeBoxStatsAndShowSignificance(page);
    await openControls();
    await selector.selectOption(mode);
    await panel.locator('select').filter({ has: page.locator('option[value="adaptive"]') }).selectOption(mode === 'p' ? 'adaptive' : 'fixed');
    await panel.getByRole('checkbox', { name: 'Toggle scientific notation for significance p-values' }).setChecked(mode === 'p');
    const decimals = panel.getByRole('spinbutton', { name: 'Number of decimals for significance p-values' });
    await decimals.fill(mode === 'p' ? '4' : '1');
    await decimals.dispatchEvent('change');
    await panel.getByRole('checkbox', { name: 'Toggle significance whiskers' }).setChecked(mode === 'p');
    await expect.poll(async () => (await capture()).mode).toBe(mode);
    await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
    owners.push(await capture());
  }
  await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-box-open-significance-owner-a' }), owners[0].id);
  await openControls();
  await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-box-switch-with-significance-open' }), owners[1].id);
  await expect(panel).toBeHidden();
  await openControls();
  await selector.selectOption('decision');
  await page.evaluate(() => window.Shared.undoManager.undo());
  await expect.poll(async () => (await capture()).mode).toBe('p');
  await page.evaluate(() => window.Shared.undoManager.redo());
  await expect.poll(async () => (await capture()).mode).toBe('decision');
  await page.evaluate(() => window.Shared.undoManager.undo());
  for (const owner of [owners[0], owners[1], owners[0]]) {
    await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-box-populated-controls-owner' }), owner.id);
    await openControls();
    await expect(selector).toHaveValue(owner.mode);
    expect(await capture()).toEqual(owner);
    const labels = await page.locator('#boxPlot text.box-significance-annotation').allTextContents();
    expect(labels.some(text => /\d/.test(text))).toBe(owner.mode === 'p');
  }
  await page.evaluate(id => window.Shared.undoManager.redo({ tabId: id }), owners[1].id);
  expect(await capture()).toEqual(owners[0]);
  expect(await page.evaluate(id => window.Components.box.__testHooks.getSession(id).state.significance.significanceLabelMode, owners[1].id)).toBe('decision');
  await page.evaluate(id => window.Shared.undoManager.undo({ tabId: id }), owners[1].id);
  expect(await capture()).toEqual(owners[0]);
  const archivePath = testInfo.outputPath('box-owned-significance.graph');
  await saveWorkspaceArchive(page, archivePath, { scope: 'workspace', captureActive: true, payloadMode: 'adaptive', awaitPreviews: true });
  await openWorkspaceArchive(page, archivePath, { componentType: 'box', timeout: 45_000 });
  await waitForDocumentOpenComplete(page);
  const ids = await page.evaluate(() => window.Main.session.workspaceState.tabs.filter(tab => tab.type === 'box').map(tab => tab.id));
  expect(ids).toHaveLength(2);
  for (const [index, id] of ids.entries()) {
    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-box-owned-controls-reopen' }), id);
    await openControls();
    await expect(selector).toHaveValue(owners[index].mode);
    const restored = await capture();
    expect(restored.mode).toBe(owners[index].mode);
    expect(restored.style).toEqual(owners[index].style);
    expect(restored.data).toEqual(owners[index].data);
  }
  const reopenedStarOwnerId = ids[0];
  await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-box-edit-label-after-reopen' }), reopenedStarOwnerId);
  await openControls();
  await expect(selector).toHaveValue('decision');
  await selector.selectOption('p');
  await expect.poll(async () => (await capture()).mode).toBe('p');
  await expect.poll(async () => {
    const labels = await page.locator('#boxPlot text.box-significance-annotation').allTextContents();
    return labels.some(text => /\d/.test(text));
  }).toBe(true);
  await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-box-edit-label-after-reopen-sibling' }), ids[1]);
  await openControls();
  await selector.selectOption('decision');
  await expect.poll(async () => (await capture()).mode).toBe('decision');
  await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-box-verify-label-after-reopen-owner' }), reopenedStarOwnerId);
  await openControls();
  await expect(selector).toHaveValue('p');
  expect((await capture()).mode).toBe('p');
  const reopenedPValueLabels = await page.locator('#boxPlot text.box-significance-annotation').allTextContents();
  expect(reopenedPValueLabels.some(text => /\d/.test(text))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('two-box-tabs-single-label.png') });
  expect(issues.critical).toEqual([]);
});

test('narrow Box p-value labels do not overlap before or after archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1180, height: 920 });
  await openBoxWorkspace(page);
  await loadBoxExample(page);
  await computeBoxStatsAndShowSignificance(page);

  await page.getByRole('tab', { name: 'Format', exact: true }).click();
  await page.locator('#boxPlot path.box-significance-hit-overlay').first().dispatchEvent('click');
  const panel = page.locator('.font-toolbar-host--visible .significance-controls-panel');
  await expect(panel).toBeVisible();
  await panel.locator('[data-significance-label-mode]').selectOption('p');
  await panel.getByRole('checkbox', { name: 'Toggle scientific notation for significance p-values' }).check();
  const decimals = panel.getByRole('spinbutton', { name: 'Number of decimals for significance p-values' });
  await decimals.fill('4');
  await decimals.dispatchEvent('change');
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });

  const widthHandle = page.locator('#boxGraphPanel .svgbox .resizer-vertical');
  await expect(widthHandle).toBeVisible();
  const handleBox = await widthHandle.boundingBox();
  if (!handleBox) throw new Error('Unable to resolve Box graph width handle');
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 180, startY, { steps: 16 });
  await page.mouse.up();
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });

  const readLabelCollisions = () => page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('#boxPlot text.box-significance-annotation'))
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          index,
          text: node.textContent || '',
          level: Number(node.getAttribute('data-sig-level')),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom
        };
      });
    const collisions = [];
    labels.forEach((left, leftIndex) => labels.slice(leftIndex + 1).forEach(right => {
      if (left.right > right.left && right.right > left.left
        && left.bottom > right.top && right.bottom > left.top) {
        collisions.push({ left, right });
      }
    }));
    return {
      labels,
      collisions,
      pairCount: window.Components.box.__getState()?.statsLastAnnotationModel?.pairs?.length || 0,
      graphWidth: document.querySelector('#boxGraphPanel .svgbox')?.getBoundingClientRect().width || 0
    };
  });

  const fresh = await readLabelCollisions();
  expect(fresh.pairCount).toBeGreaterThan(5);
  expect(fresh.graphWidth).toBeLessThan(400);
  expect(fresh.collisions, JSON.stringify(fresh.collisions)).toEqual([]);

  const archivePath = testInfo.outputPath('box-narrow-pair-labels.graph');
  await saveWorkspaceArchive(page, archivePath, {
    scope: 'workspace', captureActive: true, payloadMode: 'adaptive', awaitPreviews: true,
    reason: 'box-narrow-pair-labels-reopen'
  });
  await openWorkspaceArchive(page, archivePath, { componentType: 'box', timeout: 45_000 });
  await waitForDocumentOpenComplete(page);
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await expect.poll(() => page.locator('#boxPlot text.box-significance-annotation').count()).toBeGreaterThan(5);
  const reopened = await readLabelCollisions();
  expect(reopened.graphWidth).toBeLessThan(400);
  expect(reopened.collisions, JSON.stringify(reopened.collisions)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('box-narrow-pair-labels-reopened.png') });
  expect(issues.critical).toEqual([]);
});

async function loadBoxExample(page) {
  await expect(async () => {
    await page.locator('#boxLoadExample').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#statsControls input[type="checkbox"]:checked').length >= 3
        && !document.querySelector('#boxComputeStats')?.disabled,
      null,
      { timeout: 10_000 }
    );
  }).toPass({ timeout: 35_000, intervals: [500, 1000, 2000] });
}

async function openBoxWorkspace(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.box?.getPayload, null, { timeout: 20_000 });
}

async function restoreBoxPayloadIntoFreshWorkspace(page, payload, reason, { trackStatsExecution = false } = {}) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.box?.loadFromPayload, null, { timeout: 20_000 });
  if (trackStatsExecution) {
    await page.evaluate(() => {
      window.__boxOptionalStatsExecutions = 0;
      const shared = window.Shared;
      const statsModel = shared?.boxStatsModel;
      if (statsModel?.computeBoxStatsModel) {
        const compute = statsModel.computeBoxStatsModel;
        statsModel.computeBoxStatsModel = function (...args) {
          window.__boxOptionalStatsExecutions += 1;
          return compute.apply(this, args);
        };
      }
      const workers = shared?.Workers;
      if (workers?.runTask) {
        const runTask = workers.runTask;
        workers.runTask = function (request, ...args) {
          if (request?.action === 'box-stats') window.__boxOptionalStatsExecutions += 1;
          return runTask.call(this, request, ...args);
        };
      }
    });
  }
  await page.evaluate(({ saved, restoreReason }) => {
    window.Components.box.loadFromPayload(saved, { reason: restoreReason });
  }, { saved: payload, restoreReason: reason });
  await page.waitForFunction(
    () => document.querySelector('#boxPlot svg')
      && document.querySelector('#boxComputeStats')
      && document.querySelector('#boxShowSignificance'),
    null,
    { timeout: 20_000 }
  );
}

async function captureBoxStatsFidelity(page) {
  return page.evaluate(() => {
    const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const asFinite = value => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Number(numeric.toPrecision(8)) : null;
    };
    const payload = window.Components?.box?.getPayload?.() || {};
    const stats = payload?.config?.stats || {};
    const assumptionGroups = (Array.isArray(stats.assumptions?.groups) ? stats.assumptions.groups : [])
      .map(group => {
        const normality = group?.normality && typeof group.normality === 'object' ? group.normality : group;
        return {
          label: String(group?.label || ''),
          pValue: asFinite(normality?.pValue),
          passed: normality?.passed ?? group?.passed ?? null
        };
      });
    const domAssumptionGroups = Array.from(document.querySelectorAll('#statsResults .stats-assumption-table tbody tr'))
      .map(row => ({
        label: normalizeText(row.querySelector('.stats-assumption__group')?.textContent),
        pText: normalizeText(row.querySelector('.stats-assumption__pvalue')?.textContent),
        status: normalizeText(row.querySelector('.assumption-badge')?.textContent)
      }));
    const pValues = [];
    document.querySelectorAll('#statsResults [data-stats-pvalue-raw]').forEach(node => {
      const numeric = asFinite(node.dataset?.statsPvalueRaw);
      if(numeric != null){ pValues.push(numeric); }
    });
    document.querySelectorAll('#statsResults .stats-assumption__pvalue, #statsResults .assumption-variance-detail').forEach(node => {
      const match = normalizeText(node.textContent).match(/(?:p\s*=\s*)?([0-9]*\.?[0-9]+(?:e[-+]?\d+)?)/i);
      const numeric = match ? asFinite(match[1]) : null;
      if(numeric != null){ pValues.push(numeric); }
    });
    return {
      assumptionGroups,
      domAssumptionGroups,
      pValues: Array.from(new Set(pValues.map(value => String(value)))).sort(),
      resultsText: normalizeText(document.querySelector('#statsResults')?.textContent),
      hasPairwiseText: /Pairwise comparisons|Multiple comparisons/i.test(document.querySelector('#statsResults')?.textContent || ''),
      hasResultsModel: !!stats.resultsModel,
      hasReportModel: !!stats.reportModel,
      hasTableModel: Array.isArray(stats.tableModel?.rows) && stats.tableModel.rows.length > 0
    };
  });
}

function expectBoxStatsFidelityRestored(actual, expected, label) {
  expect(actual.assumptionGroups.length, `${label}: assumption group count`).toBe(expected.assumptionGroups.length);
  expected.assumptionGroups.forEach((group, index) => {
    expect(actual.assumptionGroups[index]?.label, `${label}: assumption label ${index}`).toBe(group.label);
    expect(actual.assumptionGroups[index]?.passed, `${label}: assumption status ${group.label}`).toBe(group.passed);
    expect(actual.assumptionGroups[index]?.pValue, `${label}: assumption p-value ${group.label}`).toBe(group.pValue);
  });
  expect(actual.domAssumptionGroups.map(group => group.pText), `${label}: rendered assumption p-values`)
    .toEqual(expected.domAssumptionGroups.map(group => group.pText));
  expect(actual.pValues, `${label}: stats p-value facts`).toEqual(expected.pValues);
  expect(actual.hasPairwiseText, `${label}: pairwise section`).toBe(true);
  expect(actual.hasResultsModel || actual.hasReportModel, `${label}: panel/report model`).toBe(true);
}

async function expectMultipleComparisonsTabLive(page, label) {
  const button = page.locator('#statsResults .stats-summary-tabs__tab')
    .filter({ hasText: /Multiple comparisons/i })
    .first();
  await expect(button, `${label}: multiple comparisons tab button`).toBeVisible();
  await button.click();
  const snapshot = await page.evaluate(() => {
    const wrapper = document.querySelector('#statsResults .stats-summary-tabs');
    const button = Array.from(wrapper?.querySelectorAll?.('.stats-summary-tabs__tab') || [])
      .find(node => /Multiple comparisons/i.test(node.textContent || ''));
    const panel = wrapper?.querySelector?.('.stats-summary-tabs__panel[data-tab="comparisons"]') || null;
    return {
      activeTab: wrapper?.getAttribute('data-active-tab') || '',
      selected: button?.getAttribute('aria-selected') || '',
      hidden: panel ? panel.hidden : true,
      text: String(panel?.textContent || '').replace(/\s+/g, ' ').trim(),
      pValues: Array.from(panel?.querySelectorAll?.('[data-stats-pvalue-raw]') || [])
        .map(node => Number(node.dataset.statsPvalueRaw))
        .filter(Number.isFinite)
    };
  });
  expect(snapshot.activeTab, `${label}: active stats tab`).toBe('comparisons');
  expect(snapshot.selected, `${label}: selected tab state`).toBe('true');
  expect(snapshot.hidden, `${label}: comparisons panel hidden`).toBe(false);
  expect(snapshot.text, `${label}: comparisons panel content`).toMatch(/Pairwise comparisons|Multiple comparisons/i);
  expect(snapshot.pValues.length, `${label}: comparisons p-value metadata`).toBeGreaterThan(0);
}

test('box reference selector follows comparison scope', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  await loadBoxExample(page);

  await page.evaluate(() => {
    const scope = document.querySelector('#boxStatsScope');
    if (!scope) throw new Error('Comparison scope select not found');
    scope.value = 'reference';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('#statsControls .box-stats-options__column--primary .box-stats-options__row'))
      .some(row => row.querySelector(':scope > label')?.textContent?.trim() === 'Reference'),
    null,
    { timeout: 20_000 }
  );

  const rows = await page.locator('#statsControls .box-stats-options__column--primary .box-stats-options__row')
    .evaluateAll(nodes => nodes.map(node => node.textContent.replace(/\s+/g, ' ').trim()));
  const rowIndex = label => rows.findIndex(row => row.startsWith(label));
  expect(rowIndex('Reference')).toBe(rowIndex('Comparison scope') + 1);
});

test('box significance bars render after saved payload is restored', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openBoxWorkspace(page);
  await loadBoxExample(page);
  await computeBoxStatsAndShowSignificance(page);

  const originalStatsFidelity = await captureBoxStatsFidelity(page);
  expect(originalStatsFidelity.assumptionGroups.length).toBeGreaterThan(0);
  expect(originalStatsFidelity.assumptionGroups.every(group => group.pValue != null)).toBe(true);
  expect(originalStatsFidelity.pValues.length).toBeGreaterThan(0);

  const payload = await page.evaluate(() => window.Components.box.getPayload());
  expect(payload?.config?.showSignificanceBars).toBe(true);
  expect(payload?.config?.stats?.selectedColumns?.length).toBeGreaterThan(1);
  expect(payload?.config?.stats?.lastRunVersion).toBeGreaterThan(0);
  expect(payload?.config?.stats?.annotationModel?.pairs?.length).toBeGreaterThan(0);
  expect(payload.config.stats.annotationModel).not.toHaveProperty('overallRangeMax');
  expect(payload.config.stats.annotationModel).not.toHaveProperty('tabId');
  expect(payload.config.stats.annotationModel.pairs.every(pair => !Object.prototype.hasOwnProperty.call(pair, 'rangeMax'))).toBe(true);

  await restoreBoxPayloadIntoFreshWorkspace(page, payload, 'e2e-restore', { trackStatsExecution: true });
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0,
    null,
    { timeout: 20_000 }
  );
  await page.evaluate(() => {
    window.Components.box.__getState().scheduleDraw({ viewOnly: true, reason: 'e2e-svg-replace-after-restore' });
  });
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0,
    null,
    { timeout: 20_000 }
  );
  await expect.poll(
    () => page.locator('#boxPlot path.box-significance-annotation').count(),
    { timeout: 20_000 }
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__boxOptionalStatsExecutions)).toBe(0);
  await page.evaluate(() => {
    const state = window.Components.box.__getState();
    state.statsContextSignature = 'e2e-stale-view-signature';
    if (state.statsLastAnnotationModel) {
      state.statsLastAnnotationModel.signature = 'e2e-stale-view-signature';
    }
    state.scheduleDraw({ viewOnly: true, reason: 'significance-viewport-extension' });
  });
  await expect(page.locator('#boxPlot .box-significance-annotation')).toHaveCount(0);
  expect(await page.evaluate(() => window.__boxOptionalStatsExecutions)).toBe(0);
  await page.locator('#boxComputeStats').click();
  await expect.poll(
    () => page.locator('#boxPlot path.box-significance-annotation').count(),
    { timeout: 20_000 }
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__boxOptionalStatsExecutions)).toBeGreaterThan(0);
  await expect(page.locator('#statsResults')).toContainText('Pairwise comparisons', { timeout: 20_000 });
  const firstRestoreStatsFidelity = await captureBoxStatsFidelity(page);
  expectBoxStatsFidelityRestored(firstRestoreStatsFidelity, originalStatsFidelity, 'first restore');
  await expectMultipleComparisonsTabLive(page, 'first restore');
  const restoredSignificanceToggle = page.locator('#boxShowSignificance');
  const executionsBeforeToggle = await page.evaluate(() => window.__boxOptionalStatsExecutions);
  await restoredSignificanceToggle.uncheck();
  await expect(page.locator('#boxPlot .box-significance-annotation')).toHaveCount(0);
  await restoredSignificanceToggle.check();
  await expect(page.locator('#boxPlot path.box-significance-annotation').first()).toBeVisible();
  expect(await page.evaluate(() => window.__boxOptionalStatsExecutions)).toBe(executionsBeforeToggle);

  const payloadAfterRestore = await page.evaluate(() => window.Components.box.getPayload());
  await restoreBoxPayloadIntoFreshWorkspace(page, payloadAfterRestore, 'e2e-second-restore');
  await expect(page.locator('#statsResults')).toContainText('Pairwise comparisons', { timeout: 20_000 });
  const secondRestoreStatsFidelity = await captureBoxStatsFidelity(page);
  expectBoxStatsFidelityRestored(secondRestoreStatsFidelity, originalStatsFidelity, 'second restore from restored payload');
  await expectMultipleComparisonsTabLive(page, 'second restore from restored payload');

  const toggle = page.locator('#boxShowSignificance');
  await expect(toggle).toBeVisible();
  await toggle.uncheck();
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot .box-significance-annotation').length === 0,
    null,
    { timeout: 20_000 }
  );
  await toggle.check();
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0,
    null,
    { timeout: 20_000 }
  );

  expect(issues.critical).toEqual([]);
});

test('box custom pairwise comparisons compute without stale analysis map errors', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openBoxWorkspace(page);
  await loadBoxExample(page);

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#statsControls .box-stats-options__row'));
    const labelText = row => row.querySelector(':scope > label')?.textContent?.trim() || '';
    const modeRow = rows.find(row => labelText(row) === 'Comparison scope');
    const modeSelect = modeRow?.querySelector('select');
    if (!modeSelect) throw new Error('Comparison scope select not found');
    modeSelect.value = 'custom';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('#statsControls .box-stats-options__row'))
      .some(row => row.querySelector(':scope > label')?.textContent?.trim() === 'Pairs' && row.querySelector('input')),
    null,
    { timeout: 20_000 }
  );
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#statsControls .box-stats-options__row'));
    const pairRow = rows.find(row => row.querySelector(':scope > label')?.textContent?.trim() === 'Pairs');
    const pairInput = pairRow?.querySelector('input');
    if (!pairInput) throw new Error('Pairs input not found');
    pairInput.value = '1-2,1-3';
    pairInput.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await expect(page.locator('#statsResults')).toContainText('Custom pairwise comparisons', { timeout: 20_000 });

  expect(issues.critical).toEqual([]);
});
