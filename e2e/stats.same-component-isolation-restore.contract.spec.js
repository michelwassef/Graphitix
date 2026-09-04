const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

const CASES = [
  {
    key: 'box',
    component: { type: 'box', pageId: 'boxPage' },
    exampleButtonId: 'boxLoadExample',
    computeSelector: '#boxComputeStats',
    statusSelector: '#boxStatsStatus',
    resultsSelector: '#statsResults',
    configure: async (page, variant) => {
      await page.evaluate((value) => {
        const state = window.Main?.session?.workspaceState;
        const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
        const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'box') || document;
        const controls = root.querySelector('#statsControls');
        const familyRow = Array.from(controls?.querySelectorAll?.('.box-stats-options__row') || [])
          .find(row => /Analysis family:/i.test(String(row.textContent || '')));
        const select = familyRow?.querySelector?.('select') || null;
        if (!select) throw new Error('Box analysis-family select not found');
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, variant === 'A' ? 'parametric' : 'nonparametric');
      await page.waitForTimeout(50);
      await page.evaluate((shouldOpen) => {
        const state = window.Main?.session?.workspaceState;
        const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
        const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'box') || document;
        const advisor = root.querySelector('#statsControls .stats-advisor');
        const toggle = root.querySelector('#statsControls .stats-advisor__toggle');
        if (!advisor || !toggle) throw new Error('Box Statistics advisor unavailable');
        const open = advisor.dataset.open === '1';
        if (open !== shouldOpen) toggle.click();
      }, variant === 'A');
    },
    capture: async page => page.evaluate(() => {
      const state = window.Main?.session?.workspaceState;
      const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'box') || document;
      const payload = window.Components?.box?.getPayload?.() || {};
      const stats = payload?.config?.stats || {};
      const controlsText = String(root.querySelector('#statsControls')?.textContent || '').trim();
      const status = String(root.querySelector('#boxStatsStatus')?.textContent || '').trim();
      const results = String(root.querySelector('#statsResults')?.textContent || '').replace(/\s+/g, ' ').trim();
      const session = window.Components?.box?.__testHooks?.getSession?.(active?.id || null) || null;
      const advisorOpen = session?.state?.stats?.statsAdvisor?.open === true;
      return {
        option: `${stats.test || ''}|advisor=${advisorOpen}`,
        statsTest: stats.test || null,
        advisorOpen,
        tabOption: active?.payload?.config?.stats?.test || null,
        status,
        results,
        hasControls: /Analysis family:|Conditions to compare:/i.test(controlsText),
        hasTopStatus: /Statistics up to date/i.test(status),
        hasResultsModel: !!stats.resultsModel,
        hasReportModel: !!stats.reportModel,
        tabHasResultsModel: !!active?.payload?.config?.stats?.resultsModel,
        tabHasReportModel: !!active?.payload?.config?.stats?.reportModel
      };
    }),
    assertVariant: snapshot => {
      expect(snapshot.hasControls).toBe(true);
      expect(snapshot.hasResultsModel || snapshot.hasReportModel || snapshot.tabHasResultsModel || snapshot.tabHasReportModel, JSON.stringify(snapshot)).toBe(true);
    }
  },
  {
    key: 'scatter',
    component: { type: 'scatter', pageId: 'scatterPage' },
    exampleButtonId: 'scatterLoadExample',
    computeSelector: '#scatterComputeStats',
    statusSelector: '#scatterStatsStatus',
    resultsSelector: '#scatterStatsResults',
    configure: async (page, variant) => {
      await page.evaluate((value) => {
        const state = window.Main?.session?.workspaceState;
        const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
        const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'scatter') || document;
        const select = root.querySelector('#scatterRegressionMode');
        if (!select) throw new Error('Scatter regression-mode select not found');
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, variant === 'A' ? 'linear' : 'exponential');
      await page.waitForTimeout(50);
      await page.evaluate((shouldOpen) => {
        const state = window.Main?.session?.workspaceState;
        const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
        const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'scatter') || document;
        const advisor = root.querySelector('#scatterStatsAdvisor .stats-advisor');
        const toggle = root.querySelector('#scatterStatsAdvisor .stats-advisor__toggle');
        if (!advisor || !toggle) throw new Error('Scatter Statistics advisor unavailable');
        const open = advisor.dataset.open === '1';
        if (open !== shouldOpen) toggle.click();
      }, variant === 'A');
    },
    capture: async page => page.evaluate(() => {
      const state = window.Main?.session?.workspaceState;
      const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'scatter') || document;
      const payload = window.Components?.scatter?.getPayload?.() || {};
      const stats = payload?.config?.stats || {};
      const session = window.Components?.scatter?.__testHooks?.getSession?.(active?.id || null) || null;
      const statsResults = root.querySelector('#scatterStatsResults');
      const status = String(root.querySelector('#scatterStatsStatus')?.textContent || '').trim();
      const results = String(statsResults?.textContent || '').replace(/\s+/g, ' ').trim();
      const regressionMode = root.querySelector('#scatterRegressionMode')?.value || stats.regressionMode || null;
      const advisorOpen = session?.advisor?.open === true;
      return {
        option: `${regressionMode}|advisor=${advisorOpen}`,
        regressionMode,
        advisorOpen,
        status,
        results,
        hasResultsModel: !!stats.resultsModel,
        hasReportModel: !!stats.reportModel,
        hasPrecomputedStats: !!stats.precomputedStats,
        ownerHasPrecomputedStats: !!session?.state?.stats?.precomputedStats,
        ownerResultsTargetMatchesRoot: !!(session?.refs?.statsResults && statsResults && session.refs.statsResults === statsResults),
        resultsRendered: !!statsResults?.querySelector?.('.stats-table-card, .stats-report-panel, table')
      };
    }),
    assertVariant: snapshot => {
      expect(snapshot.status).toMatch(/Statistics up to date/i);
      expect(snapshot.results).not.toMatch(/Statistics will appear after calculation/i);
      expect(snapshot.resultsRendered).toBe(true);
      expect(snapshot.hasPrecomputedStats).toBe(true);
      expect(snapshot.ownerHasPrecomputedStats).toBe(true);
      expect(snapshot.ownerResultsTargetMatchesRoot).toBe(true);
    }
  },
  {
    key: 'pie',
    component: { type: 'pie', pageId: 'piePage' },
    exampleButtonId: 'pieLoadExample',
    computeSelector: '#pieComputeStats',
    statusSelector: '#pieStatsStatus',
    resultsSelector: '#pieStatsResults',
    configure: async (page, variant) => {
      await page.evaluate((variantName) => {
        const state = window.Main?.session?.workspaceState;
        const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
        const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'pie') || document;
        const controls = root.querySelector('#pieStatsControls');
        const desired = variantName === 'A'
          ? { test: 'chi-square', sparseThreshold: 4, yates: true, advancedOpen: true, advisorOpen: true }
          : { test: 'g-test', sparseThreshold: 11, yates: false, advancedOpen: false, advisorOpen: false };
        const rows = Array.from(controls?.querySelectorAll?.('.box-stats-options__row') || []);
        const testRow = rows.find(row => /Choose test:/i.test(String(row.textContent || '')));
        const select = testRow?.querySelector?.('select') || null;
        if (!select) throw new Error('Pie test select not found');
        select.value = desired.test;
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const refreshedControls = root.querySelector('#pieStatsControls');
        const refreshedRows = Array.from(refreshedControls?.querySelectorAll?.('.box-stats-options__row') || []);
        const sparseRow = refreshedRows.find(row => /Sparse threshold:/i.test(String(row.textContent || '')));
        const sparseInput = sparseRow?.querySelector?.('input[type="number"]') || null;
        if (!sparseInput) throw new Error('Pie sparse threshold input not found');
        sparseInput.value = String(desired.sparseThreshold);
        sparseInput.dispatchEvent(new Event('change', { bubbles: true }));

        const yatesRow = refreshedRows.find(row => /Use Yates/i.test(String(row.textContent || '')));
        const yatesInput = yatesRow?.querySelector?.('input[type="checkbox"]') || null;
        if (!yatesInput) throw new Error('Pie Yates checkbox not found');
        yatesInput.checked = desired.yates;
        yatesInput.dispatchEvent(new Event('change', { bubbles: true }));

        const advanced = refreshedControls?.querySelector?.('details.box-stats-advanced') || null;
        const summary = advanced?.querySelector?.('summary') || null;
        if (!advanced || !summary) throw new Error('Pie Advanced parameters control not found');
        if (!!advanced.open !== desired.advancedOpen) summary.click();

        const advisorToggle = root.querySelector('#pieStatsControls .stats-advisor__toggle');
        const advisorOpen = root.querySelector('#pieStatsControls .stats-advisor')?.dataset?.open === '1';
        if (advisorToggle && advisorOpen !== desired.advisorOpen) advisorToggle.click();
      }, variant);
    },
    capture: async page => page.evaluate(() => {
      const state = window.Main?.session?.workspaceState;
      const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'pie') || document;
      const payload = window.Components?.pie?.getPayload?.() || {};
      const stats = payload?.config?.stats || {};
      const testRow = Array.from(root.querySelectorAll?.('#pieStatsControls .box-stats-options__row') || [])
        .find(row => /Choose test:/i.test(String(row.textContent || '')));
      const domTest = testRow?.querySelector?.('select')?.value || stats.test || '';
      const scopeRow = Array.from(root.querySelectorAll?.('#pieStatsControls .box-stats-options__row') || [])
        .find(row => /Comparison scope:/i.test(String(row.textContent || '')));
      const domScope = scopeRow?.querySelector?.('select')?.value || stats.scope || '';
      const status = String(root.querySelector('#pieStatsStatus')?.textContent || '').trim();
      const results = String(root.querySelector('#pieStatsResults')?.textContent || '').replace(/\s+/g, ' ').trim();
      const session = window.Components?.pie?.__testHooks?.getSession?.(active?.id || null) || null;
      const ownedStats = session?.state?.stats || {};
      const ownedAdvisor = session?.advisor || {};
      const sparseThreshold = Number(ownedStats.sparseThreshold ?? stats.sparseThreshold);
      const yatesCorrection = (ownedStats.yatesCorrection ?? stats.yatesCorrection) === true;
      const advancedOpen = (ownedStats.advancedOpen ?? stats.advancedOpen) === true;
      const advisorOpen = ownedAdvisor.open === true;
      return {
        option: `${domScope}:${domTest}|sparse=${sparseThreshold}|yates=${yatesCorrection}|advanced=${advancedOpen}|advisor=${advisorOpen}`,
        payloadOption: `${stats.scope || ''}:${stats.test || ''}`,
        selectedColumns: Array.isArray(stats.selectedColumns) ? stats.selectedColumns.slice() : [],
        valueColumn: stats.valueColumn ?? null,
        expectedColumn: stats.expectedColumn ?? null,
        sparseThreshold,
        yatesCorrection,
        advancedOpen,
        advisorOpen,
        canonicalSplit: !!(session?.state?.stats && session?.advisor && session?.results && !Object.prototype.hasOwnProperty.call(session.state, 'statsDataModel')),
        status,
        results,
        hasResultsModel: !!stats.resultsModel,
        hasReportModel: !!stats.reportModel
      };
    }),
    assertVariant: snapshot => {
      expect(snapshot.status).toMatch(/Statistics up to date/i);
      expect(snapshot.hasResultsModel || snapshot.hasReportModel).toBe(true);
      expect(snapshot.selectedColumns.length).toBeGreaterThan(0);
      expect(snapshot.canonicalSplit).toBe(true);
    }
  },
  {
    key: 'roc',
    component: { type: 'roc', pageId: 'rocPage' },
    exampleButtonId: 'rocLoadExample',
    computeSelector: null,
    statusSelector: null,
    resultsSelector: '#rocStatsResults',
    configure: async (page, variant) => {
      await page.evaluate((variantName) => {
        const state = window.Main?.session?.workspaceState;
        const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
        const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'roc') || document;
        const select = root.querySelector('#rocStatsControls select:last-of-type');
        if (!select) return;
        const options = Array.from(select.options || []);
        if (!options.length) return;
        select.value = variantName === 'A' ? options[0].value : options[options.length - 1].value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, variant);
    },
    compute: async page => {
      await page.evaluate(async () => {
        window.Components?.roc?.draw?.({ reason: 'e2e-stats-contract' });
        await window.Components?.roc?.awaitReadyForSnapshot?.({ reason: 'e2e-stats-contract-ready' });
      });
      await expect(page.locator('#rocStatsResults')).toContainText(/ROC metrics|AUC|Reporting and reproducibility/i, { timeout: 40_000 });
    },
    settleAfterRestore: async page => {
      // Do not force roc.draw() here: a redraw can mask a missing stats-surface
      // restore while the graph render cache itself restored successfully.
      await page.evaluate(async () => {
        await window.Components?.roc?.awaitReadyForSnapshot?.({ reason: 'e2e-stats-contract-restore-ready' });
      });
      await expect(page.locator('#rocStatsResults')).toContainText(
        /ROC metrics|AUC|Precision.?Recall|Reporting and reproducibility/i,
        { timeout: 40_000 }
      );
    },
    capture: async page => page.evaluate(() => {
      const state = window.Main?.session?.workspaceState;
      const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
      const rootDoc = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'roc') || document;
      const payload = window.Components?.roc?.getPayload?.() || {};
      const stats = payload?.stats || {};
      const compare = rootDoc.querySelector('#rocStatsControls select:last-of-type');
      const selectedOption = compare?.selectedOptions?.[0] || null;
      const results = String(rootDoc.querySelector('#rocStatsResults')?.textContent || '').replace(/\s+/g, ' ').trim();
      const root = rootDoc.querySelector('#rocStatsResults');
      const metrics = root?.querySelector?.('.stats-table-card, table') || null;
      const report = root?.querySelector?.('.stats-report-panel') || null;
      const ownerSession = window.Components?.roc?.__testHooks?.getSession?.(active?.id || null) || null;
      return {
        option: stats.compareSelection || compare?.value || null,
        selectedText: selectedOption ? String(selectedOption.textContent || '').trim() : '',
        results,
        hasResultsModel: !!stats.resultsModel,
        hasReportModel: !!stats.reportModel,
        reportAfterMetrics: !!(metrics && report && !!(metrics.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING)),
        ownerResultsTargetMatchesRoot: !!(ownerSession && ownerSession.refs?.statsResults === root)
      };
    }),
    assertVariant: snapshot => {
      expect(snapshot.option).toMatch(/^\d+,\d+$/);
      expect(snapshot.selectedText).toMatch(/\S+\s+vs\s+\S+/i);
      expect(snapshot.results).toMatch(/ROC metrics|AUC|Precision.?Recall|Reporting and reproducibility/i);
      expect(snapshot.reportAfterMetrics).toBe(true);
      expect(snapshot.ownerResultsTargetMatchesRoot).toBe(true);
    }
  }
];

async function getTabIds(page) {
  return page.evaluate(() =>
    (Array.isArray(window.Main?.session?.workspaceState?.tabs)
      ? window.Main.session.workspaceState.tabs
          .filter(tab => tab && !tab.isWelcome && tab.type)
          .map(tab => String(tab.id || '').trim())
      : []
    ).filter(Boolean)
  );
}

async function activateTab(page, tabId, componentCase = null) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await page.evaluate(async id => {
    if(window.Main?.tabs?.activateTab){
      await Promise.resolve(window.Main.tabs.activateTab(id, { reason: 'e2e-stats-same-component-activate' }));
      return;
    }
    document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${CSS.escape(id)}"]`)?.click();
  }, tabId);
  await page.waitForFunction(id => {
    const state = window.Main?.session?.workspaceState;
    return String(state?.activeTabId || '') === String(id || '');
  }, tabId, { timeout: 20_000 });
  if (componentCase) {
    await page.waitForFunction(({ id, type, pageId }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id || null, type) || null;
      if(root && typeof root.querySelector === 'function'){
        return !!root.querySelector(`#${pageId}, .workspace-page, #${type}Plot, #${type}StatsResults, #pieStatsResults, #statsResults, #rocStatsResults`);
      }
      const pageNode = document.querySelector(`#${pageId}:not([hidden])`);
      return !!pageNode;
    }, { id: tabId, type: componentCase.key, pageId: componentCase.component.pageId }, { timeout: 20_000 });
  }
  await page.waitForTimeout(500);
}

async function openComponentTab(page, componentCase, { first = false } = {}) {
  if (first) {
    await openComponentFromWelcome(page, componentCase.component, { first: true });
  } else {
    await page.evaluate(async ({ type }) => {
      const tabs = window.Main?.tabs;
      if (tabs && typeof tabs.handleAddTabClick === 'function') {
        const result = tabs.handleAddTabClick();
        if (result && typeof result.then === 'function') await result;
      }
      if (tabs && typeof tabs.handleGraphSelection === 'function') {
        const result = tabs.handleGraphSelection(type, { reason: 'e2e-stats-same-component-contract' });
        if (result && typeof result.then === 'function') await result;
      }
      const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
      const empty = document.querySelector('#duplicateEmpty');
      if (prompt && empty && !empty.disabled) {
        empty.click();
      }
    }, { type: componentCase.key });
  }
  await expect(page.locator(`#${componentCase.component.pageId}:not([hidden])`)).toBeVisible({ timeout: 25_000 });
  await page.waitForFunction(type => !!window.Components?.[type]?.getPayload, componentCase.key, { timeout: 25_000 });
  await clickExampleButtonIfPresent(page, componentCase.exampleButtonId);
  await page.waitForTimeout(900);
}

async function computeStats(page, componentCase) {
  if (typeof componentCase.compute === 'function') {
    await componentCase.compute(page);
    return;
  }
  await page.waitForFunction(({ type, computeSelector }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    const button = root.querySelector(computeSelector);
    return !!button && !button.disabled;
  }, { type: componentCase.key, computeSelector: componentCase.computeSelector }, { timeout: 25_000 });
  await page.evaluate(({ type, computeSelector }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    root.querySelector(computeSelector)?.click();
  }, { type: componentCase.key, computeSelector: componentCase.computeSelector });
  await page.waitForFunction(({ type, statusSelector }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const stats = active?.payload?.config?.stats || null;
    const componentState = window.Components?.[type]?.__getState?.() || null;
    if(type === 'box'){
      const version = Number(componentState?.statsLastRunVersion || 0);
      const contextVersion = Number(componentState?.statsContextVersion || 0);
      if(version > 0 && version === contextVersion && !!(stats?.resultsModel || stats?.reportModel)){
        return true;
      }
    }else if(!!(stats?.resultsModel || stats?.reportModel)){
      return true;
    }
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    return /Statistics up to date/i.test(String(root.querySelector(statusSelector)?.textContent || ''));
  }, { type: componentCase.key, statusSelector: componentCase.statusSelector }, { timeout: 45_000 });
  await page.waitForFunction(({ type, resultsSelector }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    const text = String(root.querySelector(resultsSelector)?.textContent || '');
    return text && !/Statistics will appear after calculation|Statistics ready to calculate/i.test(text);
  }, { type: componentCase.key, resultsSelector: componentCase.resultsSelector }, { timeout: 20_000 });
}

async function prepareVariant(page, componentCase, variant) {
  await componentCase.configure(page, variant);
  await computeStats(page, componentCase);
  const snapshot = await componentCase.capture(page);
  componentCase.assertVariant(snapshot);
  return snapshot;
}

async function captureActivePValueFormat(page, componentCase) {
  return page.evaluate(({ type, resultsSelector }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    const panel = root.querySelector(resultsSelector);
    const select = panel?.querySelector?.('.stats-pvalue-format-select') || null;
    return {
      tabId: active?.id || null,
      selectValue: String(select?.value || '').trim(),
      payload: active?.payload?.meta?.statsReporting?.pValueScientific,
      reporting: window.Shared?.statsReporting?.getPValueFormatScientific?.({
        target: panel,
        tabId: active?.id || null
      }) === true
    };
  }, { type: componentCase.key, resultsSelector: componentCase.resultsSelector });
}

async function setActivePValueScientific(page, componentCase) {
  await page.evaluate(({ type, resultsSelector }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    const select = root.querySelector(`${resultsSelector} .stats-pvalue-format-select`);
    if(!select) throw new Error(`${type} p-value format control not found`);
    if(select.value !== 'scientific') {
      select.value = 'scientific';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { type: componentCase.key, resultsSelector: componentCase.resultsSelector });
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return tab?.payload?.meta?.statsReporting?.pValueScientific === true;
  }, (await captureActivePValueFormat(page, componentCase)).tabId, { timeout: 20_000 });
}

async function changeActivePValueFormat(page, componentCase) {
  const before = await captureActivePValueFormat(page, componentCase);
  await page.evaluate(({ type, resultsSelector }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    const select = root.querySelector(`${resultsSelector} .stats-pvalue-format-select`);
    if(!select) throw new Error(`${type} p-value format control not found`);
    select.value = select.value === 'scientific' ? 'decimal' : 'scientific';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, { type: componentCase.key, resultsSelector: componentCase.resultsSelector });
  const expected = before.reporting !== true;
  await page.waitForFunction(({ id, expectedValue }) => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return (tab?.payload?.meta?.statsReporting?.pValueScientific === true) === expectedValue;
  }, { id: before.tabId, expectedValue: expected }, { timeout: 20_000 });
  return { before, after: await captureActivePValueFormat(page, componentCase) };
}

async function captureArchive(page, key) {
  const archive = await page.evaluate(async () => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const context = tabsApi?.getSessionActionsContext?.();
    const blob = await sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-stats-same-component-contract'
    });
    if (!blob) throw new Error('No workspace archive blob');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return { base64: btoa(binary) };
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, `${key}-same-component-stats.graph`);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function loadArchive(page, archivePath) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return Array.isArray(tabs) && tabs.some(tab => tab && !tab.isWelcome && tab.type);
  }, null, { timeout: 30_000 });
}

for (const componentCase of CASES) {
  test(`${componentCase.key} stats stay isolated across same-component tabs and archive restore`, async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

    const beforeA = new Set(await getTabIds(page));
    await openComponentTab(page, componentCase, { first: true });
    const tabA = (await getTabIds(page)).find(id => !beforeA.has(id));
    expect(tabA).toBeTruthy();
    const snapshotA = await prepareVariant(page, componentCase, 'A');
    expect(await captureActivePValueFormat(page, componentCase)).toMatchObject({
      tabId: tabA,
      selectValue: 'decimal',
      reporting: false
    });

    const beforeB = new Set(await getTabIds(page));
    await openComponentTab(page, componentCase, { first: false });
    const tabB = (await getTabIds(page)).find(id => !beforeB.has(id));
    expect(tabB).toBeTruthy();
    expect(tabB).not.toBe(tabA);
    const snapshotB = await prepareVariant(page, componentCase, 'B');
    expect(snapshotB.option).not.toBe(snapshotA.option);
    await setActivePValueScientific(page, componentCase);
    expect(await captureActivePValueFormat(page, componentCase)).toMatchObject({
      tabId: tabB,
      selectValue: 'scientific',
      payload: true,
      reporting: true
    });

    await activateTab(page, tabA);
    const switchedA = await componentCase.capture(page);
    componentCase.assertVariant(switchedA);
    expect(switchedA.option).toBe(snapshotA.option);
    expect(switchedA.results.length).toBeGreaterThan(20);
    const switchedAPFormat = await captureActivePValueFormat(page, componentCase);
    expect(switchedAPFormat).toMatchObject({
      selectValue: 'decimal',
      reporting: false
    });
    expect(switchedAPFormat.payload).not.toBe(true);

    await activateTab(page, tabB);
    const switchedB = await componentCase.capture(page);
    componentCase.assertVariant(switchedB);
    expect(switchedB.option).toBe(snapshotB.option);
    expect(await captureActivePValueFormat(page, componentCase)).toMatchObject({
      selectValue: 'scientific',
      payload: true,
      reporting: true
    });

    if (componentCase.key === 'roc') {
      // Match the Line-style ownership contract: an inactive same-component root is
      // detached and must not be used as a live projection target. Corrupt A's
      // detached stats DOM while B is active, prove no inactive restore/mutation is
      // attempted, then activate A and require its durable model to restore there.
      const inactiveRestore = await page.evaluate(tabAId => {
        const workspaceTabs = window.Shared?.workspaceTabs;
        const hooks = window.Components?.roc?.__testHooks;
        const rootA = workspaceTabs?.getMountedRoot?.(tabAId, 'roc') || null;
        const state = window.Main?.session?.workspaceState;
        const tabBId = state?.activeTabId || null;
        const rootB = workspaceTabs?.getMountedRoot?.(tabBId, 'roc') || null;
        const panelA = rootA?.querySelector?.('#rocStatsResults') || null;
        const panelB = rootB?.querySelector?.('#rocStatsResults') || null;
        const beforeB = String(panelB?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!panelA || !panelB || !hooks?.restoreStatsSurfaceForOwner) {
          return { restoredWhileInactive: false, reason: 'missing-test-surface' };
        }
        const hostABefore = panelA.__statsReportHost || panelA.querySelector?.(':scope > #rocStatsReportHost') || null;
        const hostBBefore = panelB.__statsReportHost || panelB.querySelector?.(':scope > #rocStatsReportHost') || null;
        const hostsIsolatedBefore = !!(hostABefore && hostBBefore && hostABefore !== hostBBefore && hostABefore.parentNode === panelA && hostBBefore.parentNode === panelB);
        const sessionABefore = hooks.getSession?.(tabAId) || null;
        const modelABefore = sessionABefore?.results?.statsPanelModel || sessionABefore?.state?.statsPanelModel || null;
        const durableModelBefore = !!(modelABefore?.resultsModel || modelABefore?.reportModel);
        const rootAConnected = rootA?.isConnected === true;
        panelA.innerHTML = '';
        const restoredWhileInactive = hooks.restoreStatsSurfaceForOwner(tabAId) === true;
        const sessionAAfter = hooks.getSession?.(tabAId) || null;
        return {
          restoredWhileInactive,
          durableModelBefore,
          hostsIsolatedBefore,
          rootAConnected,
          textAWhileInactive: String(panelA.textContent || '').replace(/\s+/g, ' ').trim(),
          beforeB,
          afterB: String(panelB.textContent || '').replace(/\s+/g, ' ').trim(),
          inactiveOwnerRefsCleared: !sessionAAfter?.refs?.root && !sessionAAfter?.refs?.statsResults
        };
      }, tabA);
      expect(inactiveRestore.durableModelBefore, JSON.stringify(inactiveRestore)).toBe(true);
      expect(inactiveRestore.hostsIsolatedBefore, JSON.stringify(inactiveRestore)).toBe(true);
      expect(inactiveRestore.rootAConnected, JSON.stringify(inactiveRestore)).toBe(false);
      expect(inactiveRestore.restoredWhileInactive, JSON.stringify(inactiveRestore)).toBe(false);
      expect(inactiveRestore.textAWhileInactive).toBe('');
      expect(inactiveRestore.afterB).toBe(inactiveRestore.beforeB);
      expect(inactiveRestore.inactiveOwnerRefsCleared).toBe(true);

      await activateTab(page, tabA, componentCase);
      await page.evaluate(async () => {
        await window.Components?.roc?.awaitReadyForSnapshot?.({ reason: 'e2e-roc-owner-stats-activation-restore' });
      });
      const activatedRestore = await page.evaluate(({ tabAId, tabBId, beforeB }) => {
        const workspaceTabs = window.Shared?.workspaceTabs;
        const hooks = window.Components?.roc?.__testHooks;
        const rootA = workspaceTabs?.getMountedRoot?.(tabAId, 'roc') || null;
        const rootB = workspaceTabs?.getMountedRoot?.(tabBId, 'roc') || null;
        const panelA = rootA?.querySelector?.('#rocStatsResults') || null;
        const panelB = rootB?.querySelector?.('#rocStatsResults') || null;
        const hostA = panelA?.__statsReportHost || panelA?.querySelector?.(':scope > #rocStatsReportHost') || null;
        const sessionA = hooks?.getSession?.(tabAId) || null;
        return {
          rootAConnected: rootA?.isConnected === true,
          textA: String(panelA?.textContent || '').replace(/\s+/g, ' ').trim(),
          hostOwnedByA: !!(hostA && panelA && hostA.parentNode === panelA),
          ownerA: sessionA?.refs?.root === rootA && sessionA?.refs?.statsResults === panelA,
          beforeB,
          afterB: String(panelB?.textContent || '').replace(/\s+/g, ' ').trim()
        };
      }, { tabAId: tabA, tabBId: tabB, beforeB: inactiveRestore.beforeB });
      expect(activatedRestore.rootAConnected, JSON.stringify(activatedRestore)).toBe(true);
      expect(activatedRestore.textA).toMatch(/ROC metrics|AUC|Precision.?Recall|Reporting and reproducibility/i);
      expect(activatedRestore.hostOwnedByA, JSON.stringify(activatedRestore)).toBe(true);
      expect(activatedRestore.ownerA, JSON.stringify(activatedRestore)).toBe(true);
      expect(activatedRestore.afterB).toBe(activatedRestore.beforeB);

      await activateTab(page, tabB, componentCase);
    }

    const archivePath = await captureArchive(page, componentCase.key);
    await loadArchive(page, archivePath);

    const reopenedIds = await getTabIds(page);
    expect(reopenedIds.length).toBeGreaterThanOrEqual(2);

    await activateTab(page, reopenedIds[0], componentCase);
    if (typeof componentCase.settleAfterRestore === 'function') {
      await componentCase.settleAfterRestore(page);
    }
    const reopenedFirst = await componentCase.capture(page);
    componentCase.assertVariant(reopenedFirst);
    const reopenedFirstPFormat = await captureActivePValueFormat(page, componentCase);

    await activateTab(page, reopenedIds[1], componentCase);
    if (typeof componentCase.settleAfterRestore === 'function') {
      await componentCase.settleAfterRestore(page);
    }
    const reopenedSecond = await componentCase.capture(page);
    componentCase.assertVariant(reopenedSecond);
    const reopenedSecondPFormat = await captureActivePValueFormat(page, componentCase);
    expect(new Set([reopenedFirst.option, reopenedSecond.option])).toEqual(new Set([snapshotA.option, snapshotB.option]));
    expect(new Set([reopenedFirstPFormat.reporting, reopenedSecondPFormat.reporting])).toEqual(new Set([false, true]));
    expect(new Set([
      reopenedFirstPFormat.payload === true,
      reopenedSecondPFormat.payload === true
    ])).toEqual(new Set([false, true]));

    // The first user interaction after reopen must mutate only the owner that
    // contains the clicked statistics control. Do not redraw to make this pass.
    await activateTab(page, reopenedIds[0], componentCase);
    const siblingBeforeInteraction = await page.evaluate(id => {
      const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
      return tab?.payload?.meta?.statsReporting?.pValueScientific === true;
    }, reopenedIds[1]);
    const interaction = await changeActivePValueFormat(page, componentCase);
    expect(interaction.after.reporting).toBe(!interaction.before.reporting);
    const postInteractionOwners = await page.evaluate(({ ownerId, siblingId }) => {
      const tabs = window.Main?.session?.workspaceState?.tabs || [];
      const owner = tabs.find(item => item?.id === ownerId) || null;
      const sibling = tabs.find(item => item?.id === siblingId) || null;
      return {
        owner: owner?.payload?.meta?.statsReporting?.pValueScientific === true,
        sibling: sibling?.payload?.meta?.statsReporting?.pValueScientific === true
      };
    }, { ownerId: reopenedIds[0], siblingId: reopenedIds[1] });
    expect(postInteractionOwners.owner).toBe(interaction.after.reporting);
    expect(postInteractionOwners.sibling).toBe(siblingBeforeInteraction);

    expect(issues.critical).toEqual([]);
  });
}
