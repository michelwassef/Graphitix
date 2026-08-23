const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function expectEditableGridCapacity(snapshot) {
  expect(snapshot.rowCount).toBeGreaterThanOrEqual(100);
  expect(snapshot.colCount).toBeGreaterThanOrEqual(10);
}

const CASES = [
  {
    type: 'box',
    pageId: 'boxPage',
    selectId: 'boxTableFormat',
    groupedValue: 'grouped',
    standardValue: 'single',
    replicateId: 'boxGroupedReplicates',
    exampleButtonId: 'boxLoadExample',
    groupedClass: 'box-grouped-header-merge',
    assertStandard(snapshot) {
      expectEditableGridCapacity(snapshot);
      expect(snapshot.controlValue).toBe('single');
      expect(snapshot.payloadFormat).toBe('single');
      expect(snapshot.row0.slice(0, 3)).toEqual(['VC 0.5 mg', 'VC 1.0 mg', 'VC 2.0 mg']);
      expect(snapshot.row1[0]).not.toBe('0.5 mg/day');
      expect(snapshot.hasGroupedClass).toBe(false);
    },
    assertGrouped(snapshot) {
      expectEditableGridCapacity(snapshot);
      expect(snapshot.controlValue).toBe('grouped');
      expect(snapshot.payloadFormat).toBe('grouped');
      expect(snapshot.row0.slice(0, 6)).toEqual(['Ascorbic acid', '', '', 'Orange juice', '', '']);
      expect(snapshot.row1.slice(0, 3)).toEqual(['0.5 mg/day', '1.0 mg/day', '2.0 mg/day']);
      expect(snapshot.hasGroupedClass).toBe(true);
    }
  },
  {
    type: 'pca',
    pageId: 'pcaPage',
    selectId: 'pcaTableFormat',
    groupedValue: 'grouped',
    standardValue: 'standard',
    replicateId: 'pcaGroupedReplicates',
    exampleButtonId: 'pcaLoadExample',
    groupedClass: 'pca-grouped-header-merge',
    assertStandard(snapshot) {
      expectEditableGridCapacity(snapshot);
      expect(snapshot.controlValue).toBe('standard');
      expect(snapshot.payloadFormat).toBe('standard');
      expect(snapshot.row0[0]).toBe('Label point');
      expect(snapshot.row1.slice(0, 3)).toEqual(['Variable', 'A', 'B']);
      expect(snapshot.row2[0]).toBe('Var1');
      expect(snapshot.hasGroupedClass).toBe(false);
    },
    assertGrouped(snapshot) {
      expectEditableGridCapacity(snapshot);
      expect(snapshot.controlValue).toBe('grouped');
      expect(snapshot.payloadFormat).toBe('grouped');
      expect(snapshot.row0[0]).toBe('Label point');
      expect(snapshot.row1[0]).toBe('Group');
      expect(snapshot.row1.slice(1, 4).filter(Boolean).length).toBeGreaterThan(0);
      expect(snapshot.row2[0]).toBe('Sample');
      expect(snapshot.row2.slice(1, 4).filter(Boolean).length).toBeGreaterThan(0);
      expect(snapshot.hasGroupedClass).toBe(true);
    }
  }
];

async function getGraphTabIds(page) {
  return page.evaluate(() =>
    (Array.isArray(window.Main?.session?.workspaceState?.tabs)
      ? window.Main.session.workspaceState.tabs
          .filter(tab => tab && !tab.isWelcome && tab.type)
          .map(tab => String(tab.id || '').trim())
      : []
    ).filter(Boolean)
  );
}

async function activateTab(page, tabId) {
  await page.evaluate(id => {
    if (window.Main?.tabs?.activateTab) {
      window.Main.tabs.activateTab(id, { reason: 'e2e-table-format-isolation' });
      return;
    }
    document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${CSS.escape(id)}"]`)?.click();
  }, tabId);
  await page.waitForFunction(id => {
    const state = window.Main?.session?.workspaceState;
    return String(state?.activeTabId || '') === String(id || '');
  }, tabId, { timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function openComponentTab(page, component, first = false) {
  const before = new Set(await getGraphTabIds(page));
  await openComponentFromWelcome(page, { type: component.type, pageId: component.pageId }, { first });
  await page.waitForFunction(({ type }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    if (!active || active.type !== type || !window.Components?.[type]?.ready) {
      return false;
    }
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type)
      || document.querySelector(`#${type}Page:not([hidden])`);
    const pool = window.Shared?.hot?.__tabTablePools?.[type] || null;
    const hot = pool?.byTab?.[active.id]?.instance || null;
    return !!(root && hot && typeof hot.getData === 'function');
  }, { type: component.type }, { timeout: 45_000 });
  const after = await getGraphTabIds(page);
  const created = after.find(id => !before.has(id)) || after[after.length - 1];
  expect(created).toBeTruthy();
  return created;
}

async function configureExample(page, component, formatValue) {
  await page.evaluate(({ type, selectId, replicateId, exampleButtonId, format }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type)
      || document.querySelector(`#${type}Page:not([hidden])`)
      || document;
    const select = root.querySelector(`#${selectId}`);
    if (!select) {
      throw new Error(`${selectId} not found`);
    }
    select.value = format;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const replicates = root.querySelector(`#${replicateId}`);
    if (replicates) {
      replicates.value = type === 'box' ? '3' : '2';
      replicates.dispatchEvent(new Event('input', { bubbles: true }));
      replicates.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (type === 'pca' && format === 'standard') {
      const pool = window.Shared?.hot?.__tabTablePools?.pca || null;
      const hot = active?.id ? pool?.byTab?.[active.id]?.instance || null : null;
      if (!hot || typeof hot.loadData !== 'function') {
        throw new Error('PCA table instance not found');
      }
      const data = [
        ['Label point', 'Sample A', 'Sample B', 'Sample C'],
        ['Variable', 'A', 'B', 'C'],
        ['Var1', 1, 2, 3],
        ['Var2', 2, 1, 4],
        ['Var3', 3, 4, 2]
      ];
      hot.loadData(data, { source: 'e2e-table-format-standard-fixture', suppressSchedule: true });
      window.Shared?.hot?.syncOwnerTabPayloadFullData?.(data, 'e2e-table-format-standard-fixture', {
        source: 'e2e-table-format-standard-fixture',
        hotInstance: hot,
        tabId: active.id,
        affectsAnalysis: true
      });
      return;
    }
    const button = root.querySelector(`#${exampleButtonId}`);
    if (!button) {
      throw new Error(`${exampleButtonId} not found`);
    }
    button.click();
  }, { type: component.type, selectId: component.selectId, replicateId: component.replicateId, exampleButtonId: component.exampleButtonId, format: formatValue });
  await page.waitForTimeout(1200);
}

async function captureTableSnapshot(page, component) {
  return page.evaluate(({ type, selectId, groupedClass }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type)
      || document.querySelector(`#${type}Page:not([hidden])`)
      || document;
    const pool = window.Shared?.hot?.__tabTablePools?.[type] || null;
    const hot = active?.id ? pool?.byTab?.[active.id]?.instance || null : null;
    const data = typeof hot?.getData === 'function' ? hot.getData() : [];
    const payload = window.Components?.[type]?.getPayload?.() || {};
    const format = type === 'pca'
      ? payload?.tableFormat || payload?.config?.tableFormat || null
      : payload?.config?.tableFormat || payload?.tableFormat || null;
    const hotRoot = hot?.rootElement || root.querySelector(type === 'pca' ? '#pcaHot' : '#hot') || null;
    const groupedSelector = type === 'pca'
      ? '.pca-grouped-header-merge-start, .pca-grouped-header-merge-middle, .pca-grouped-header-merge-end'
      : `.${groupedClass}`;
    return {
      activeTabId: String(active?.id || ''),
      controlValue: root.querySelector(`#${selectId}`)?.value || null,
      payloadFormat: format,
      row0: Array.isArray(data?.[0]) ? data[0].slice(0, 8).map(value => value == null ? '' : String(value)) : [],
      row1: Array.isArray(data?.[1]) ? data[1].slice(0, 8).map(value => value == null ? '' : String(value)) : [],
      row2: Array.isArray(data?.[2]) ? data[2].slice(0, 8).map(value => value == null ? '' : String(value)) : [],
      rowCount: Array.isArray(data) ? data.length : 0,
      colCount: typeof hot?.countCols === 'function' ? hot.countCols() : 0,
      hasGroupedClass: !!(
        hotRoot?.classList?.contains?.(groupedClass)
        || hotRoot?.querySelector?.(groupedSelector)
      )
    };
  }, { type: component.type, selectId: component.selectId, groupedClass: component.groupedClass });
}

async function captureArchive(page, archivePath) {
  const archive = await page.evaluate(async () => {
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-table-format-isolation'
    });
    if (!blob) {
      throw new Error('No workspace archive blob');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  });
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.writeFileSync(archivePath, Buffer.from(archive, 'base64'));
  return archivePath;
}

async function loadArchive(page, archivePath, component) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await page.waitForFunction(type => {
    const tabs = window.Main?.session?.workspaceState?.tabs;
    return Array.isArray(tabs) && tabs.filter(tab => tab?.type === type).length >= 2;
  }, component.type, { timeout: 40_000 });
  await page.waitForTimeout(1000);
}

async function findRestoredTabsByFormat(page, component, tabIds) {
  const result = { standard: null, grouped: null };
  for (const tabId of tabIds) {
    await activateTab(page, tabId);
    const snapshot = await captureTableSnapshot(page, component);
    if (snapshot.controlValue === component.groupedValue || snapshot.payloadFormat === component.groupedValue) {
      result.grouped = { tabId, snapshot };
    } else if (snapshot.controlValue === component.standardValue || snapshot.payloadFormat === component.standardValue) {
      result.standard = { tabId, snapshot };
    }
  }
  return result;
}

for (const component of CASES) {
  test(`${component.type} table format stays tab-owned across same-component tabs and archive reopen`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

    const standardTabId = await openComponentTab(page, component, true);
    await configureExample(page, component, component.standardValue);
    component.assertStandard(await captureTableSnapshot(page, component));

    const groupedTabId = await openComponentTab(page, component, false);
    await configureExample(page, component, component.groupedValue);
    component.assertGrouped(await captureTableSnapshot(page, component));

    await activateTab(page, standardTabId);
    component.assertStandard(await captureTableSnapshot(page, component));
    await activateTab(page, groupedTabId);
    component.assertGrouped(await captureTableSnapshot(page, component));
    await activateTab(page, standardTabId);
    component.assertStandard(await captureTableSnapshot(page, component));

    const archivePath = await captureArchive(
      page,
      testInfo.outputPath(`${component.type}-table-format-tab-isolation.graph`)
    );
    await loadArchive(page, archivePath, component);
    const restoredIds = await getGraphTabIds(page);
    expect(restoredIds.length).toBeGreaterThanOrEqual(2);

    const restored = await findRestoredTabsByFormat(page, component, restoredIds);
    expect(restored.standard?.tabId).toBeTruthy();
    expect(restored.grouped?.tabId).toBeTruthy();
    component.assertStandard(restored.standard.snapshot);
    component.assertGrouped(restored.grouped.snapshot);
    await activateTab(page, restored.standard.tabId);
    component.assertStandard(await captureTableSnapshot(page, component));

    expect(issues.critical).toEqual([]);
  });
}
