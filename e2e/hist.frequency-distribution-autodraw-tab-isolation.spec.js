const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

async function activeHistTabId(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    return active?.type === 'hist' ? String(active.id || '') : '';
  });
}

async function activateTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForFunction(
    id => window.Main?.session?.workspaceState?.activeTabId === id,
    tabId,
    { timeout: 20_000 }
  );
  await page.waitForSelector('#histPage:not([hidden])', { timeout: 20_000 });
}

async function openHistExampleTab(page, { first = false } = {}) {
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' }, { first, loadExample: true });
  await page.waitForFunction(() => !!window.Components?.hist?.ready, null, { timeout: 35_000 });
  await waitForHistRender(page, /Histogram|Descriptive statistics/i);
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  return after.find(id => id && !before.includes(id)) || await activeHistTabId(page);
}

async function waitForHistRender(page, pattern) {
  await page.waitForFunction(source => {
    const root = document.querySelector('#histPage:not([hidden])');
    const svgText = root?.querySelector?.('#histSvg')?.textContent || '';
    const statsText = root?.querySelector?.('#histStatsResults')?.textContent || '';
    return !!root?.querySelector?.('#histSvg') && new RegExp(source, 'i').test(`${svgText}\n${statsText}`);
  }, pattern.source || String(pattern), { timeout: 60_000 });
}

async function configureHistogramFrequencyTab(page) {
  await page.evaluate(() => {
    const root = document.querySelector('#histPage:not([hidden])');
    if (!root) throw new Error('active hist root not found');
    const currentPayload = window.Components.hist.getPayload?.() || { type: 'hist', config: {} };
    window.Components.hist.loadFromPayload({
      ...currentPayload,
      config: {
        ...(currentPayload.config || {}),
        traceOpacity: 0.42
      }
    }, { source: 'e2e-frequency-trace-opacity', skipDraw: true });
    const setValue = (id, value, eventName = 'change') => {
      const el = root.querySelector(`#${id}`);
      if (!el) throw new Error(`${id} not found`);
      el.value = String(value);
      el.dispatchEvent(new Event(eventName, { bubbles: true }));
      if (eventName !== 'change') el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setChecked = (id, value, eventName = 'change') => {
      const el = root.querySelector(`#${id}`);
      if (!el) throw new Error(`${id} not found`);
      el.checked = !!value;
      el.dispatchEvent(new Event(eventName, { bubbles: true }));
      if (eventName !== 'change') el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('histPlotMode', 'histogram');
    setValue('histFrequencyCreateMode', 'cumulative');
    setValue('histFrequencyTabulateMode', 'percent');
    setValue('histBinningMode', 'width');
    setValue('histBinWidth', '10', 'input');
    setChecked('histFirstBinCenterAuto', false);
    setValue('histFirstBinCenter', '40', 'input');
    setChecked('histLastBinCenterAuto', false);
    setValue('histLastBinCenter', '100', 'input');
    setChecked('histShowPdf', false);
    setChecked('histShowCdf', true);
    setChecked('histShowLegend', false);
    setValue('histStatsDiagnosticsMode', 'normal-fit');
    setValue('histStatsComparisonMode', 'off');
    root.querySelectorAll('#histDistributionList input[data-dist-key]').forEach(input => {
      input.checked = input.dataset.distKey === 'normal';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    window.Components.hist.draw({ reason: 'e2e-hist-frequency-config' });
  });
  await waitForHistRender(page, /Cumulative frequency|Cumulative frequency \(%\)|Descriptive statistics/i);
  await page.evaluate(() => {
    const root = document.querySelector('#histPage:not([hidden])');
    const wrapper = root?.querySelector?.('#histHotWrapper') || null;
    const dataViews = wrapper?.__dataViewsOwner || null;
    const frequencyView = (dataViews?.getViews?.() || [])
      .map(view => dataViews.getView?.(view.id) || view)
      .find(view => view?.transformSpec?.type === 'histFrequencyTable');
    if (!frequencyView?.id) throw new Error('frequency DataView was not created');
    dataViews.activateView(frequencyView.id, { reason: 'e2e-frequency-view-activate' });
  });
}

async function configureDensityManualTab(page) {
  await page.evaluate(() => {
    const root = document.querySelector('#histPage:not([hidden])');
    if (!root) throw new Error('active hist root not found');
    const values = [['Exam Score']];
    for (let i = 0; i < 5205; i += 1) {
      values.push([40 + (i % 85) + ((i % 7) / 10)]);
    }
    const currentPayload = window.Components.hist.getPayload?.() || { type: 'hist', config: {} };
    window.Components.hist.loadFromPayload({
      ...currentPayload,
      type: 'hist',
      data: values,
      dataViews: undefined,
      activeDataViewId: undefined,
      config: {
        ...(currentPayload.config || {}),
        plotMode: 'density',
        traceOpacity: 0.78
      }
    }, { source: 'e2e-large-density-load', skipDraw: true });
    const setValue = (id, value) => {
      const el = root.querySelector(`#${id}`);
      if (!el) throw new Error(`${id} not found`);
      el.value = String(value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setChecked = (id, value, eventName = 'change') => {
      const el = root.querySelector(`#${id}`);
      if (!el) throw new Error(`${id} not found`);
      el.checked = !!value;
      el.dispatchEvent(new Event(eventName, { bubbles: true }));
      if (eventName !== 'change') el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('histPlotMode', 'density');
    setChecked('histShowPdf', true);
    setChecked('histShowCdf', false);
    setChecked('histShowLegend', true);
    setChecked('histShowGrid', true, 'input');
    setValue('histStatsDiagnosticsMode', 'normal-vs-lognormal');
    root.querySelectorAll('#histDistributionList input[data-dist-key]').forEach(input => {
      input.checked = input.dataset.distKey === 'normal' || input.dataset.distKey === 'lognormal';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    window.Components.hist.draw({ reason: 'e2e-hist-density-config' });
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('#histPage:not([hidden])');
    const renderRow = root?.querySelector?.('#histRenderRow');
    const button = root?.querySelector?.('#histRenderButton');
    const payload = window.Components?.hist?.getPayload?.();
    return payload?.config?.plotMode === 'density'
      && payload?.data?.length > 5000
      && renderRow
      && renderRow.hidden === false
      && button
      && button.disabled === false;
  }, null, { timeout: 60_000 });
  await page.locator('#histPage:not([hidden]) #histRenderButton').click();
  await waitForHistRender(page, /Density plot|Distribution shape|Log-normal|Descriptive statistics/i);
}

async function snapshotHist(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#histPage:not([hidden])');
    const payload = window.Components?.hist?.getPayload?.() || null;
    const wrapper = root?.querySelector?.('#histHotWrapper') || null;
    const manager = wrapper?.__dataViewsOwner || null;
    const activeView = manager?.getActiveView?.() || null;
    const views = (manager?.getViews?.() || []).map(view => manager.getView?.(view.id) || view);
    const selectedDistributions = Array.from(root?.querySelectorAll?.('#histDistributionList input[data-dist-key]:checked') || [])
      .map(input => input.dataset.distKey)
      .sort();
    return {
      tabId: window.Main?.session?.workspaceState?.activeTabId || null,
      plotMode: root?.querySelector?.('#histPlotMode')?.value || null,
      payloadPlotMode: payload?.config?.plotMode || null,
      createMode: root?.querySelector?.('#histFrequencyCreateMode')?.value || null,
      tabulateMode: root?.querySelector?.('#histFrequencyTabulateMode')?.value || null,
      binningMode: root?.querySelector?.('#histBinningMode')?.value || null,
      binWidth: root?.querySelector?.('#histBinWidth')?.value || '',
      firstAuto: !!root?.querySelector?.('#histFirstBinCenterAuto')?.checked,
      firstCenter: root?.querySelector?.('#histFirstBinCenter')?.value || '',
      lastAuto: !!root?.querySelector?.('#histLastBinCenterAuto')?.checked,
      lastCenter: root?.querySelector?.('#histLastBinCenter')?.value || '',
      showPdf: !!root?.querySelector?.('#histShowPdf')?.checked,
      showCdf: !!root?.querySelector?.('#histShowCdf')?.checked,
      showLegend: !!root?.querySelector?.('#histShowLegend')?.checked,
      showGrid: !!root?.querySelector?.('#histShowGrid')?.checked,
      traceOpacity: payload?.config?.traceOpacity ?? null,
      statsDiagnostics: root?.querySelector?.('#histStatsDiagnosticsMode')?.value || null,
      selectedDistributions,
      payloadFrequency: payload?.config?.frequency || null,
      payloadDistributions: payload?.config?.distributions || null,
      payloadDataRows: Array.isArray(payload?.data) ? payload.data.length : 0,
      activeViewTitle: activeView?.title || '',
      viewTitles: views.map(view => view?.title || ''),
      hasFrequencyView: views.some(view => view?.transformSpec?.type === 'histFrequencyTable'),
      renderRowHidden: !!root?.querySelector?.('#histRenderRow')?.hidden,
      renderButtonDisabled: !!root?.querySelector?.('#histRenderButton')?.disabled,
      svgText: root?.querySelector?.('#histSvg')?.textContent || '',
      statsText: root?.querySelector?.('#histStatsResults')?.textContent || ''
    };
  });
}


async function waitForHistFrequencyControls(page) {
  await expect.poll(async () => {
    const snapshot = await snapshotHist(page);
    return {
      plotMode: snapshot.plotMode,
      payloadPlotMode: snapshot.payloadPlotMode,
      createMode: snapshot.createMode,
      payloadCreateMode: snapshot.payloadFrequency?.createMode || null,
      tabulateMode: snapshot.tabulateMode,
      payloadTabulateMode: snapshot.payloadFrequency?.tabulateMode || null,
      binningMode: snapshot.binningMode,
      payloadBinningMode: snapshot.payloadFrequency?.binningMode || null,
      hasFrequencyView: snapshot.hasFrequencyView
    };
  }, { timeout: 60_000 }).toEqual({
    plotMode: 'histogram',
    payloadPlotMode: 'histogram',
    createMode: 'cumulative',
    payloadCreateMode: 'cumulative',
    tabulateMode: 'percent',
    payloadTabulateMode: 'percent',
    binningMode: 'width',
    payloadBinningMode: 'width',
    hasFrequencyView: true
  });
}

async function waitForHistDensityControls(page) {
  await expect.poll(async () => {
    const snapshot = await snapshotHist(page);
    return {
      plotMode: snapshot.plotMode,
      payloadPlotMode: snapshot.payloadPlotMode,
      showPdf: snapshot.showPdf,
      payloadShowPdf: snapshot.payloadDistributions?.showPdf,
      showCdf: snapshot.showCdf,
      payloadShowCdf: snapshot.payloadDistributions?.showCdf,
      renderRowHidden: snapshot.renderRowHidden,
      renderButtonDisabled: snapshot.renderButtonDisabled
    };
  }, { timeout: 60_000 }).toEqual({
    plotMode: 'density',
    payloadPlotMode: 'density',
    showPdf: true,
    payloadShowPdf: true,
    showCdf: false,
    payloadShowCdf: false,
    renderRowHidden: false,
    renderButtonDisabled: false
  });
}

async function captureArchive(page, stem) {
  const archive = await page.evaluate(async () => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-hist-frequency-distribution-autodraw'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { base64: btoa(binary) };
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, `${stem}.graph`);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function reopenArchive(page, archivePath) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(
    () => (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && tab.type === 'hist').length === 2,
    null,
    { timeout: 60_000 }
  );
}

async function getHistTabTitle(page, tabId) {
  return page.evaluate(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || [])
      .find(item => item && String(item.id || '') === String(id));
    return tab?.title || '';
  }, tabId);
}

async function snapshotInactiveHistDataView(page, tabId) {
  return page.evaluate(id => {
    const trimRows = data => {
      if (!Array.isArray(data)) return null;
      const copy = data.map(row => Array.isArray(row) ? row.slice() : []);
      while (copy.length && copy[copy.length - 1].every(cell => cell == null || String(cell).trim() === '')) {
        copy.pop();
      }
      return copy;
    };
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'hist') || null;
    const manager = root?.querySelector?.('#histHotWrapper')?.__dataViewsOwner || null;
    const view = manager?.getView?.('raw') || manager?.getActiveView?.() || null;
    return {
      hasRoot: !!root,
      hasManager: !!manager,
      activeViewId: manager?.getActiveViewId?.() || null,
      data: trimRows(view?.data)
    };
  }, tabId);
}

function expectFrequencySnapshot(snapshot) {
  expect(snapshot.plotMode).toBe('histogram');
  expect(snapshot.payloadPlotMode).toBe('histogram');
  expect(snapshot.createMode).toBe('cumulative');
  expect(snapshot.tabulateMode).toBe('percent');
  expect(snapshot.binningMode).toBe('width');
  expect(snapshot.binWidth).toBe('10');
  expect(snapshot.firstAuto).toBe(false);
  expect(snapshot.firstCenter).toBe('40');
  expect(snapshot.lastAuto).toBe(false);
  expect(snapshot.lastCenter).toBe('100');
  expect(snapshot.showPdf).toBe(false);
  expect(snapshot.showCdf).toBe(true);
  expect(snapshot.showLegend).toBe(false);
  expect(snapshot.traceOpacity).toBeCloseTo(0.42, 6);
  expect(snapshot.statsDiagnostics).toBe('normal-fit');
  expect(snapshot.selectedDistributions).toEqual(['normal']);
  expect(snapshot.payloadFrequency.createMode).toBe('cumulative');
  expect(snapshot.payloadFrequency.tabulateMode).toBe('percent');
  expect(snapshot.payloadFrequency.binningMode).toBe('width');
  expect(snapshot.payloadDistributions.showPdf).toBe(false);
  expect(snapshot.payloadDistributions.showCdf).toBe(true);
  expect(snapshot.payloadDistributions.selected).toEqual(['normal']);
  expect(snapshot.hasFrequencyView).toBe(true);
  expect(snapshot.activeViewTitle).toMatch(/frequency table/i);
  expect(snapshot.svgText + snapshot.statsText).toMatch(/Histogram|Descriptive statistics/i);
}

function expectDensitySnapshot(snapshot) {
  expect(snapshot.plotMode).toBe('density');
  expect(snapshot.payloadPlotMode).toBe('density');
  expect(snapshot.showPdf).toBe(true);
  expect(snapshot.showCdf).toBe(false);
  expect(snapshot.showLegend).toBe(true);
  expect(snapshot.traceOpacity).toBeCloseTo(0.78, 6);
  expect(snapshot.showGrid).toBe(true);
  expect(snapshot.statsDiagnostics).toBe('normal-vs-lognormal');
  expect(snapshot.selectedDistributions).toEqual(['lognormal', 'normal']);
  expect(snapshot.payloadDistributions.showPdf).toBe(true);
  expect(snapshot.payloadDistributions.showCdf).toBe(false);
  expect(snapshot.payloadDistributions.selected.sort()).toEqual(['lognormal', 'normal']);
  expect(snapshot.payloadDataRows).toBeGreaterThan(5000);
  expect(snapshot.hasFrequencyView).toBe(false);
  expect(snapshot.svgText + snapshot.statsText).toMatch(/Density plot|Distribution shape|Log-normal|Descriptive statistics/i);
}

test('Histogram sparse bins omit baseline artifacts and paint shared separators once', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openHistExampleTab(page, { first: true });

  const geometry = await page.evaluate(async () => {
    const component = window.Components?.hist;
    const tab = window.Main?.tabs?.getActiveTab?.();
    const payload = component?.createEmptyPayload?.();
    payload.data = [['Values'], [0], [0], [0], [1], [1], [2], [10]];
    payload.config.frequency = {
      ...(payload.config.frequency || {}),
      binningMode: 'width',
      manualBinWidth: 1,
      firstCenterAuto: false,
      firstCenter: 0,
      lastCenterAuto: false,
      lastCenter: 10
    };
    component.loadFromPayload(payload, {
      source: 'e2e-hist-border-geometry',
      tab,
      tabId: tab.id,
      skipDraw: true
    });
    await component.draw({ reason: 'e2e-hist-border-geometry', tabId: tab.id });

    const root = document.querySelector('#histPage:not([hidden])');
    const bars = Array.from(root.querySelectorAll(
      '#histSvg [data-hist-bar="1"][data-series-role="hist-fill"]'
    ));
    const borders = Array.from(root.querySelectorAll(
      '#histSvg [data-series-role="hist-border"][data-series-key="col-0"]'
    ));
    const horizontalBars = bars.filter(bar => {
      const points = Array.from(String(bar.getAttribute('d') || '').matchAll(
        /[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g
      ));
      return new Set(points.map(match => Number(match[2]).toFixed(6))).size <= 1;
    });
    const commands = Array.from(String(borders[0]?.getAttribute('d') || '').matchAll(
      /([ML])\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g
    )).map(match => ({
      command: match[1],
      x: Number(match[2]),
      y: Number(match[3])
    }));
    const verticalSegments = [];
    let previousPoint = null;
    commands.forEach(command => {
      if(command.command === 'L' && previousPoint && previousPoint.x === command.x){
        verticalSegments.push({
          x: command.x,
          start: Math.min(previousPoint.y, command.y),
          end: Math.max(previousPoint.y, command.y)
        });
      }
      previousPoint = command;
    });
    const verticalKeys = verticalSegments.map(segment => (
      `${segment.x.toFixed(6)}:${segment.start.toFixed(6)}:${segment.end.toFixed(6)}`
    ));
    const segmentsByX = verticalSegments.reduce((groups, segment) => {
      const key = segment.x.toFixed(6);
      if(!groups[key]) groups[key] = [];
      groups[key].push(segment);
      return groups;
    }, {});
    let overlapCount = 0;
    Object.values(segmentsByX).forEach(segments => {
      const ordered = segments.slice().sort((left, right) => left.start - right.start);
      for(let index = 1; index < ordered.length; index += 1){
        if(ordered[index].start < ordered[index - 1].end - 1e-6){
          overlapCount += 1;
        }
      }
    });
    return {
      barCount: bars.length,
      strokedBarCount: bars.filter(bar => bar.hasAttribute('stroke') && bar.getAttribute('stroke') !== 'none').length,
      horizontalBarCount: horizontalBars.length,
      borderCount: borders.length,
      verticalCount: verticalSegments.length,
      uniqueVerticalCount: new Set(verticalKeys).size,
      overlapCount
    };
  });

  expect(geometry.barCount).toBe(1);
  expect(geometry.strokedBarCount).toBe(0);
  expect(geometry.horizontalBarCount).toBe(0);
  expect(geometry.borderCount).toBe(1);
  expect(geometry.verticalCount).toBeGreaterThan(0);
  expect(geometry.uniqueVerticalCount).toBe(geometry.verticalCount);
  expect(geometry.overlapCount).toBe(0);
});

test('Histogram frequency, distribution, and manual-render state stay isolated across same-type tabs and reopen', async ({ page }) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const frequencyId = await openHistExampleTab(page, { first: true });
  await configureHistogramFrequencyTab(page);
  const frequencyBefore = await snapshotHist(page);
  expectFrequencySnapshot(frequencyBefore);

  const densityId = await openHistExampleTab(page);
  expect(densityId).not.toBe(frequencyId);
  await configureDensityManualTab(page);
  const densityBefore = await snapshotHist(page);
  expectDensitySnapshot(densityBefore);

  await activateTab(page, frequencyId);
  await waitForHistRender(page, /Histogram|Descriptive statistics/i);
  await waitForHistFrequencyControls(page);
  expectFrequencySnapshot(await snapshotHist(page));

  await activateTab(page, densityId);
  await waitForHistRender(page, /Density plot|Distribution shape|Log-normal|Descriptive statistics/i);
  await waitForHistDensityControls(page);
  expectDensitySnapshot(await snapshotHist(page));

  const archivePath = await captureArchive(page, 'hist-frequency-distribution-autodraw');
  await reopenArchive(page, archivePath);

  const reopenedIds = await page.evaluate(() =>
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => tab && tab.type === 'hist')
      .map(tab => String(tab.id || ''))
  );
  expect(reopenedIds).toHaveLength(2);

  const reopened = [];
  for (const tabId of reopenedIds) {
    await activateTab(page, tabId);
    await expect.poll(async () => (await snapshotHist(page)).plotMode, { timeout: 60_000 })
      .toMatch(/^(histogram|density)$/);
    const plotMode = (await snapshotHist(page)).plotMode;
    if (plotMode === 'histogram') {
      await waitForHistFrequencyControls(page);
    } else {
      await waitForHistDensityControls(page);
    }
    const snapshot = await snapshotHist(page);
    reopened.push(snapshot);
  }
  const reopenedFrequency = reopened.find(snapshot => snapshot.plotMode === 'histogram');
  const reopenedDensity = reopened.find(snapshot => snapshot.plotMode === 'density');
  expect(reopenedFrequency).toBeTruthy();
  expect(reopenedDensity).toBeTruthy();
  expectFrequencySnapshot(reopenedFrequency);
  expectDensitySnapshot(reopenedDensity);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});

test('Histogram async table import commits to the originating tab while inactive', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const importTargetId = await openHistExampleTab(page, { first: true });
  const untouchedId = await openHistExampleTab(page);
  expect(untouchedId).not.toBe(importTargetId);

  await activateTab(page, importTargetId);
  const csvPath = path.join(TMP_DIR, 'hist-origin-import.csv');
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(csvPath, 'Imported values\n101\n202\n303\n');

  await page.evaluate(() => {
    const originalOpenFile = window.Shared.tableImport.openFile;
    window.__histImportFinish = null;
    window.__histImportDone = null;
    window.Shared.tableImport.openFile = (inputEl, options = {}) => {
      const fileName = inputEl?.files?.[0]?.name || '';
      const done = new Promise(resolve => {
        window.__histImportFinish = () => {
          options.hot.loadData([
            ['Imported values'],
            [101],
            [202],
            [303]
          ], {
            source: 'e2e-delayed-hist-import',
            recordUndo: true,
            undoLabel: 'table:hist:e2e-delayed-import'
          });
          options.scheduleDraw?.();
          resolve({ rows: 4, cols: 1, fileName });
        };
      }).finally(() => {
        window.Shared.tableImport.openFile = originalOpenFile;
      });
      window.__histImportDone = done;
      return done;
    };
  });

  await page.locator('#histPage:not([hidden]) #histFile').setInputFiles(csvPath);
  await page.waitForFunction(() => typeof window.__histImportFinish === 'function', null, { timeout: 20_000 });

  await activateTab(page, untouchedId);
  await page.evaluate(() => window.__histImportFinish());
  await page.evaluate(() => window.__histImportDone);

  expect(await getHistTabTitle(page, importTargetId)).toMatch(/hist-origin-import/i);
  expect(await getHistTabTitle(page, untouchedId)).not.toMatch(/hist-origin-import/i);

  const inactiveView = await snapshotInactiveHistDataView(page, importTargetId);
  expect(inactiveView.hasRoot).toBe(true);
  expect(inactiveView.hasManager).toBe(true);
  expect(inactiveView.data).toEqual([
    ['Imported values'],
    [101],
    [202],
    [303]
  ]);

  const untouchedSnapshot = await snapshotHist(page);
  expect(untouchedSnapshot.payloadDataRows).toBeGreaterThan(1);
  expect(untouchedSnapshot.svgText + untouchedSnapshot.statsText).not.toMatch(/Imported values|101|202|303/);

  await activateTab(page, importTargetId);
  await page.waitForFunction(() => {
    const payload = window.Components?.hist?.getPayload?.();
    return Array.isArray(payload?.data)
      && payload.data[0]?.[0] === 'Imported values'
      && Number(payload.data[1]?.[0]) === 101;
  }, null, { timeout: 35_000 });

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
