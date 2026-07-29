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
const PIE = { type: 'pie', pageId: 'piePage' };

async function activePieTabId(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    return active?.type === 'pie' ? String(active.id || '') : '';
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
  await page.waitForSelector('#piePage:not([hidden])', { timeout: 20_000 });
  await page.waitForFunction(
    id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie')
        || document.querySelector('#piePage:not([hidden])');
      return !!root?.querySelector?.('#pieHotWrapper .ag-root, #pieHotWrapper .ag-root-wrapper');
    },
    tabId,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(250);
}

async function openPieTab(page, { first = false } = {}) {
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  await openComponentFromWelcome(page, PIE, { first });
  await page.waitForFunction(() => !!window.Components?.pie?.ready, null, { timeout: 35_000 });
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  return after.find(id => id && !before.includes(id)) || await activePieTabId(page);
}

async function waitForPieRender(page, expectedTitle) {
  await page.waitForFunction(title => {
    const root = document.querySelector('#piePage:not([hidden])');
    const svg = root?.querySelector?.('#pieSvg');
    const traces = svg?.querySelectorAll?.('[data-pie-trace="1"]') || [];
    return !!svg && traces.length > 0 && String(svg.textContent || '').includes(title);
  }, expectedTitle, { timeout: 60_000 });
}

async function configurePieTab(page, variant) {
  await page.evaluate(async variant => {
    const root = document.querySelector('#piePage:not([hidden])');
    if (!root) throw new Error('active Pie root not found');
    const payload = {
      type: 'pie',
      data: variant.data,
      dataViews: undefined,
      activeDataViewId: undefined,
      config: {
        title: variant.title,
        chartType: variant.chartType,
        showPercents: variant.showPercents,
        showFrame: variant.showFrame,
        showLegend: true,
        startAngle: variant.startAngle,
        borderColor: variant.borderColor,
        borderWidth: variant.borderWidth,
        fontSize: variant.fontSize,
        colors: variant.colors,
        colorScheme: variant.colorScheme,
        labelPositions: variant.labelPositions,
        notes: { text: '', open: false }
      }
    };
    window.Shared?.colorSchemes?.applyToActiveTab?.('pie', variant.colorScheme);
    window.Components.pie.loadFromPayload(payload, { source: 'e2e-pie-isolation-config' });
    const wrapper = root.querySelector('#pieHotWrapper');
    const manager = wrapper?.__dataViewsOwner || null;
    if (!manager || typeof manager.createDerivedView !== 'function') {
      throw new Error('Pie DataViews manager not found');
    }
    const derivedData = variant.data.map((row, rowIndex) => {
      if (!Array.isArray(row)) return row;
      if (rowIndex === 0) return row.slice();
      return row.map((cell, colIndex) => {
        const numeric = Number(cell);
        return Number.isFinite(numeric) && colIndex > 0
          ? Number((numeric + variant.numericOffset).toFixed(3))
          : cell;
      });
    });
    const view = manager.createDerivedView({
      title: variant.viewTitle,
      data: derivedData,
      transformSpec: { type: 'e2e-pie-isolation', label: variant.label },
      activate: true,
      reason: 'e2e-pie-dataviews-color-label-resize'
    });
    if (!view || manager.getActiveView?.()?.title !== variant.viewTitle) {
      throw new Error('Pie derived view did not become active');
    }
    await window.Components.pie.draw({ reason: 'e2e-pie-configured-draw' });
  }, variant);
  await waitForPieRender(page, variant.title);
  await page.evaluate(async variant => {
    const root = document.querySelector('#piePage:not([hidden])');
    const box = root?.querySelector?.('#pieGraphPanel .svgbox');
    if (!box || typeof window.Shared?.applyResizableBoxSize !== 'function') {
      throw new Error('Pie resizable graph box not ready');
    }
    window.Shared.applyResizableBoxSize(box, {
      width: variant.size.width,
      height: variant.size.height,
      axis: 'both',
      forceExact: true,
      preserveAspectLock: true,
      reason: 'e2e-pie-final-resize'
    });
    await window.Components.pie.draw({ reason: 'e2e-pie-after-final-resize' });
  }, variant);
  await waitForPieRender(page, variant.title);
}

async function snapshotPie(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'pie')
      || document.querySelector('#piePage:not([hidden])');
    const payload = window.Components?.pie?.getPayload?.() || null;
    const config = payload?.config || {};
    const wrapper = root?.querySelector?.('#pieHotWrapper') || null;
    const manager = wrapper?.__dataViewsOwner || null;
    const activeView = manager?.getActiveView?.() || null;
    const views = (manager?.getViews?.() || []).map(view => manager.getView?.(view.id) || view);
    const svg = root?.querySelector?.('#pieSvg') || null;
    const svgBox = root?.querySelector?.('#pieGraphPanel .svgbox') || null;
    const schemeSelect = root?.querySelector?.('select[data-color-scheme-select="1"][data-component-type="pie"]') || null;
    const traceFills = {};
    svg?.querySelectorAll?.('[data-pie-trace-label]')?.forEach(node => {
      const label = String(node.getAttribute('data-pie-trace-label') || '');
      if (label && !traceFills[label]) {
        traceFills[label] = node.getAttribute('fill') || '';
      }
    });
    const titleNode = Array.from(svg?.querySelectorAll?.('text') || [])
      .find(node => String(node.textContent || '') === String(config.title || '')) || null;
    const texts = Array.from(svg?.querySelectorAll?.('text') || []).map(node => String(node.textContent || '').trim());
    const boxRect = svgBox?.getBoundingClientRect?.() || null;
    return {
      tabId: active?.id || null,
      data: payload?.data || [],
      chartType: config.chartType || '',
      showPercents: !!config.showPercents,
      showFrame: !!config.showFrame,
      startAngle: String(config.startAngle || ''),
      borderColor: config.borderColor || '',
      borderWidth: Number(config.borderWidth || 0),
      fontSize: String(config.fontSize || ''),
      title: config.title || '',
      colorScheme: config.colorScheme || '',
      selectedColorScheme: schemeSelect?.value || '',
      colors: config.colors || {},
      labelPositions: config.labelPositions || {},
      traceFills,
      activeViewTitle: activeView?.title || '',
      serializedActiveTitle: ((payload?.dataViews?.views || []).find(view => view.id === payload?.dataViews?.activeViewId) || {}).title || '',
      viewTitles: views.map(view => view?.title || ''),
      serializedViewTitles: (payload?.dataViews?.views || []).map(view => view.title),
      traceModes: Array.from(svg?.querySelectorAll?.('[data-pie-trace-mode]') || []).map(node => node.getAttribute('data-pie-trace-mode')),
      percentLabelCount: texts.filter(text => /^\d+(?:\.\d+)?%$/.test(text)).length,
      titlePosition: {
        x: Number(titleNode?.getAttribute?.('x')),
        y: Number(titleNode?.getAttribute?.('y'))
      },
      size: {
        width: Number(boxRect?.width || 0),
        height: Number(boxRect?.height || 0),
        styleWidth: svgBox?.style?.width || '',
        styleHeight: svgBox?.style?.height || '',
        resized: svgBox?.dataset?.resizerResized || ''
      },
      svgText: String(svg?.textContent || '')
    };
  });
}

async function captureArchive(page, stem) {
  const archive = await page.evaluate(async () => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-pie-dataviews-color-label-resize'
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
    () => (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && tab.type === 'pie').length === 2,
    null,
    { timeout: 60_000 }
  );
}

function expectClose(actual, expected, tolerance, label) {
  expect(Math.abs(Number(actual) - Number(expected)), label).toBeLessThanOrEqual(tolerance);
}

function expectPieSnapshot(snapshot, expected) {
  expect(snapshot.title).toBe(expected.title);
  expect(snapshot.svgText).toContain(expected.title);
  expect(snapshot.chartType).toBe(expected.chartType);
  expect(snapshot.showPercents).toBe(expected.showPercents);
  expect(snapshot.showFrame).toBe(expected.showFrame);
  expect(snapshot.startAngle).toBe(String(expected.startAngle));
  expect(snapshot.borderColor.toLowerCase()).toBe(expected.borderColor);
  expect(snapshot.borderWidth).toBe(expected.borderWidth);
  expect(snapshot.fontSize).toBe(String(expected.fontSize));
  expect(snapshot.colorScheme || snapshot.selectedColorScheme).toBe(expected.colorScheme);
  expect(snapshot.activeViewTitle || snapshot.serializedActiveTitle).toBe(expected.viewTitle);
  expect(snapshot.viewTitles.concat(snapshot.serializedViewTitles)).toContain(expected.viewTitle);
  expect(snapshot.size.resized).toBe('true');
  expectClose(snapshot.size.width, expected.size.width, 8, `${expected.label} graph width`);
  expectClose(snapshot.size.height, expected.size.height, 8, `${expected.label} graph height`);
  expect(snapshot.data[1][1]).toBeCloseTo(Number(expected.data[1][1]) + expected.numericOffset, 3);
  for (const [label, color] of Object.entries(expected.colors)) {
    expect(String(snapshot.colors[label] || '').toLowerCase(), `${expected.label} payload color ${label}`).toBe(color);
    expect(String(snapshot.traceFills[label] || '').toLowerCase(), `${expected.label} SVG color ${label}`).toBe(color);
  }
  expect(snapshot.labelPositions?.title?.relX).toBeCloseTo(expected.labelPositions.title.relX, 4);
  expect(snapshot.labelPositions?.title?.relY).toBeCloseTo(expected.labelPositions.title.relY, 4);
  expect(snapshot.labelPositions?.legend?.relX).toBeCloseTo(expected.labelPositions.legend.relX, 4);
  expect(snapshot.labelPositions?.legend?.relY).toBeCloseTo(expected.labelPositions.legend.relY, 4);
  expect(snapshot.titlePosition.x).toBeGreaterThan(0);
  expect(snapshot.titlePosition.y).toBeGreaterThan(0);
  if (expected.chartType === 'stacked') {
    expect(snapshot.traceModes).toContain('stacked');
    expect(snapshot.traceModes).not.toContain('pie');
    expect(snapshot.traceModes).not.toContain('donut');
  } else {
    expect(snapshot.traceModes).toContain(expected.chartType);
    expect(snapshot.percentLabelCount).toBeGreaterThan(0);
  }
}

test('Pie DataViews, colors, labels, and finalized resize stay isolated across same-type tabs and reopen', async ({ page }) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const donut = {
    label: 'donut',
    title: 'Pie Alpha DataView',
    viewTitle: 'Pie Alpha derived view',
    chartType: 'donut',
    showPercents: true,
    showFrame: true,
    startAngle: '35',
    borderColor: '#222222',
    borderWidth: 1.5,
    fontSize: '14',
    colorScheme: 'grayscale',
    numericOffset: 0.111,
    size: { width: 720, height: 520 },
    labelPositions: {
      title: { relX: 0.34, relY: 0.13 },
      legend: { relX: 0.72, relY: 0.20 }
    },
    colors: {
      Apple: '#d62728',
      Berry: '#2ca02c',
      Citrus: '#1f77b4'
    },
    data: [
      ['Category', 'Observed', 'Expected'],
      ['Apple', 14, 12],
      ['Berry', 9, 10],
      ['Citrus', 5, 6]
    ]
  };

  const stacked = {
    label: 'stacked',
    title: 'Pie Beta DataView',
    viewTitle: 'Pie Beta derived view',
    chartType: 'stacked',
    showPercents: false,
    showFrame: false,
    startAngle: '0',
    borderColor: '#ffffff',
    borderWidth: 0,
    fontSize: '11',
    colorScheme: 'scientific',
    numericOffset: 0.222,
    size: { width: 610, height: 430 },
    labelPositions: {
      title: { relX: 0.48, relY: 0.10 },
      legend: { relX: 0.63, relY: 0.28 }
    },
    colors: {
      Protein: '#9467bd',
      Carb: '#ff7f0e',
      Fat: '#17becf'
    },
    data: [
      ['Segment', 'North', 'South', 'West'],
      ['Protein', 12, 8, 10],
      ['Carb', 7, 11, 4],
      ['Fat', 5, 3, 9]
    ]
  };

  const donutId = await openPieTab(page, { first: true });
  await configurePieTab(page, donut);
  expectPieSnapshot(await snapshotPie(page), donut);

  const stackedId = await openPieTab(page);
  expect(stackedId).not.toBe(donutId);
  await configurePieTab(page, stacked);
  expectPieSnapshot(await snapshotPie(page), stacked);

  for (let i = 0; i < 2; i += 1) {
    await activateTab(page, donutId);
    await waitForPieRender(page, donut.title);
    expectPieSnapshot(await snapshotPie(page), donut);
    await activateTab(page, stackedId);
    await waitForPieRender(page, stacked.title);
    expectPieSnapshot(await snapshotPie(page), stacked);
  }

  const archivePath = await captureArchive(page, 'pie-dataviews-color-label-resize-isolation');
  await reopenArchive(page, archivePath);
  const reopenedIds = await page.evaluate(() =>
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => tab && tab.type === 'pie')
      .map(tab => String(tab.id || ''))
  );
  expect(reopenedIds).toHaveLength(2);

  const reopened = [];
  for (const tabId of reopenedIds) {
    await activateTab(page, tabId);
    await page.waitForFunction(() => {
      const payload = window.Components?.pie?.getPayload?.();
      const title = String(payload?.config?.title || '');
      const svgText = document.querySelector('#piePage:not([hidden]) #pieSvg')?.textContent || '';
      return !!title && svgText.includes(title);
    }, null, { timeout: 60_000 });
    const snapshot = await snapshotPie(page);
    reopened.push(snapshot);
  }
  const reopenedDonut = reopened.find(snapshot => snapshot.title === donut.title);
  const reopenedStacked = reopened.find(snapshot => snapshot.title === stacked.title);
  expect(reopenedDonut).toBeTruthy();
  expect(reopenedStacked).toBeTruthy();
  expectPieSnapshot(reopenedDonut, donut);
  expectPieSnapshot(reopenedStacked, stacked);

  await activateTab(page, reopenedDonut.tabId);
  expectPieSnapshot(await snapshotPie(page), donut);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
