const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp', 'render-cache-contract');
const DEFAULT_CARTESIAN_CACHE_TYPES = new Set(['box', 'scatter', 'pca', 'line', 'roc', 'survival', 'hist', 'pie']);
const STATS_CONTROLS = {
  box: { method: '#boxStatsTest', compute: '#boxComputeStats' },
  scatter: { method: '#scatterStatsTest', compute: '#scatterComputeStats' },
  pca: { method: '#pcaStatsTest', compute: '#pcaComputeStats' },
  roc: { method: '#rocSingleCurvePValueMethod', compute: '#rocComputeStats' },
  survival: { method: '#survivalTestType', compute: '#survivalComputeStats' },
  hist: { method: '#histStatsTest', compute: '#histComputeStats' },
  pie: { method: '#pieStatsTest', compute: '#pieComputeStats' }
};

function writeArchive(base64, name) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, `${name}.graph`);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

async function openFresh(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
}

async function openExample(page, componentCase, first = false) {
  await openComponentFromWelcome(page, componentCase, { first });
  await page.waitForSelector(`#${componentCase.pageId}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, componentCase.exampleButtonId);
  await page.waitForFunction(type => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const config = window.Main?.components?.registry?.[type];
    const containsNumericVariantValue = value => {
      if(Array.isArray(value)) return value.some(containsNumericVariantValue);
      if(!value || typeof value !== 'object'){
        return (typeof value === 'number' && Number.isFinite(value))
          || (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim()));
      }
      return Object.values(value).some(containsNumericVariantValue);
    };
    const hasCanonicalVariantData = type === 'venn'
      ? !!String(tab?.payload?.data?.listA || '').trim()
      : containsNumericVariantValue(tab?.payload?.data);
    return tab?.type === type
      && !!tab.payload
      && hasCanonicalVariantData
      && (!config?.hasRenderedGraph || config.hasRenderedGraph({ tab, tabId: tab.id, type, reason: 'e2e-cache-contract-ready' }) === true);
  }, componentCase.type, { timeout: 120_000 });
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function ensureMigratedCartesianMode(page, type) {
  if (type !== 'pie') return;
  const chartType = page.locator('#piePage:not([hidden]) #pieChartType').first();
  await expect(chartType).toBeVisible({ timeout: 20_000 });
  await chartType.selectOption('stacked');
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const root = tab?.id
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, 'pie') || document.querySelector('#piePage:not([hidden])'))
      : null;
    const traces = Array.from(root?.querySelectorAll?.('#piePlot svg [data-pie-trace-mode]') || []);
    const published = root?.querySelector?.('[data-cartesian-layout-complete="true"]') || null;
    return tab?.type === 'pie'
      && tab?.payload?.config?.chartType === 'stacked'
      && traces.length > 0
      && traces.every(trace => trace.getAttribute('data-pie-trace-mode') === 'stacked')
      && published?.dataset?.cartesianLayoutComponent === 'pie'
      && published?.dataset?.cartesianLayoutComplete === 'true';
  }, { timeout: 30_000 });
}

async function setVariant(page, type, variant) {
  return page.evaluate(async ({ componentType, variantId }) => {
    const session = window.Main?.session;
    const state = session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const config = window.Main?.components?.registry?.[componentType] || null;
    if (!tab || !config) throw new Error(`Missing active ${componentType} tab`);

    const clone = value => session.clonePayload ? session.clonePayload(value) : structuredClone(value);
    const payload = clone(tab.payload);
    const delta = variantId === 'B' ? 0.375 : 0.125;
    const mutateFirstNumericLeaf = value => {
      if (!value || typeof value !== 'object') return false;
      const keys = Array.isArray(value) ? value.keys() : Object.keys(value);
      for (const key of keys) {
        const current = value[key];
        if (typeof current === 'number' && Number.isFinite(current)) {
          value[key] = current + delta;
          return true;
        }
        if (typeof current === 'string' && /^-?\d+(?:\.\d+)?$/.test(current.trim())) {
          value[key] = String(Number(current) + delta);
          return true;
        }
        if (current && typeof current === 'object' && mutateFirstNumericLeaf(current)) {
          return true;
        }
      }
      return false;
    };
    const mutateRocScore = matrix => {
      if(!Array.isArray(matrix)) return false;
      // Row 0 is the header and column 0 is the classification label. Mutating
      // either changes the schema/classes rather than creating a score variant.
      for(let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1){
        const row = matrix[rowIndex];
        if(!Array.isArray(row)) continue;
        for(let colIndex = 1; colIndex < row.length; colIndex += 1){
          const current = row[colIndex];
          if(typeof current === 'number' && Number.isFinite(current)){
            row[colIndex] = current + delta;
            return true;
          }
          if(typeof current === 'string' && /^-?\d+(?:\.\d+)?$/.test(current.trim())){
            row[colIndex] = String(Number(current) + delta);
            return true;
          }
        }
      }
      return false;
    };
    const mutateVennList = data => {
      if(!data || typeof data !== 'object') return false;
      const variantGene = variantId === 'B' ? 'TP53' : 'BRCA2';
      const genes = String(data.listA || '')
        .split(/\r?\n/)
        .map(value => value.trim())
        .filter(Boolean);
      if(!genes.includes(variantGene)){
        genes.push(variantGene);
      }
      data.listA = genes.join('\n');
      return true;
    };
    const mutated = componentType === 'venn'
      ? mutateVennList(payload?.data)
      : (componentType === 'roc'
        ? mutateRocScore(payload?.data)
        : mutateFirstNumericLeaf(payload?.data));
    if (!mutated) {
      throw new Error(`Unable to create a canonical data variant for ${componentType}`);
    }
    session.assignTabPayload(tab, payload, { reason: `e2e-cache-variant-${variantId}` });
    if (typeof config.loadFromPayload === 'function') {
      config.loadFromPayload(clone(payload), {
        tab,
        tabId: tab.id,
        type: componentType,
        reason: `e2e-cache-variant-${variantId}`
      });
    }

    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, componentType)
      || document.querySelector(`#${componentType}Page:not([hidden])`)
      || document;
    const svgBox = root.querySelector?.('.svgbox');
    const resizeApi = svgBox?.__sharedResizableBoxApi || null;
    if (!resizeApi || typeof resizeApi.applySize !== 'function') {
      throw new Error(`Resizable graph API unavailable for ${componentType}`);
    }
    const rect = svgBox.getBoundingClientRect();
    const widthDelta = variantId === 'B' ? 41 : 17;
    const heightDelta = variantId === 'B' ? 29 : 11;
    resizeApi.applySize({
      width: Math.max(260, Math.round(rect.width) + widthDelta),
      height: Math.max(260, Math.round(rect.height) + heightDelta),
      axis: 'both',
      authorityMode: 'authoritative',
      forceExact: true,
      preserveAspectLock: true,
      reason: `e2e-cache-layout-${variantId}`
    });

    const baseTitle = String(tab.title || componentType).replace(/ \[[AB]\]$/, '');
    tab.title = `${baseTitle} [${variantId}]`;
    window.Main?.tabs?.renderTabs?.();
    const drawResult = config.draw?.({ tabId: tab.id, reason: `e2e-cache-redraw-${variantId}`, force: true });
    if (drawResult?.then) await drawResult;
    if (typeof config.awaitReadyForSnapshot === 'function') {
      await config.awaitReadyForSnapshot({ tabId: tab.id, reason: `e2e-cache-variant-${variantId}` });
    }
    session.persistActiveTabState(tab, {
      workspaces: window.Main?.components?.registry,
      previews: window.Main?.previews,
      reason: `e2e-cache-variant-${variantId}-persist`,
      captureRenderCache: true,
      disableRenderCachePrune: true
    });
    return {
      tabId: tab.id,
      title: tab.title,
      mutated,
      payloadSignature: session.serializePayloadSignature(tab.payload || null),
      layoutSignature: session.serializePayloadSignature(tab.layoutState || null)
    };
  }, { componentType: type, variantId: variant });
}

async function configureStatsVariant(page, type, variant) {
  const selectors = STATS_CONTROLS[type];
  if (!selectors) return { available: false };
  return page.evaluate(async ({ componentType, methodSelector, computeSelector, variantId }) => {
    const root = document.querySelector(`[data-workspace-tab-id="${window.Main?.session?.workspaceState?.activeTabId}"]`) || document;
    const method = root.querySelector(methodSelector) || document.querySelector(`${methodSelector}`);
    const compute = root.querySelector(computeSelector) || document.querySelector(`${computeSelector}`);
    if (method && method.options?.length > 1) {
      method.selectedIndex = variantId === 'B' ? method.options.length - 1 : 0;
      method.dispatchEvent(new Event('change', { bubbles: true }));
    }
    compute?.click?.();
    const config = window.Main?.components?.registry?.[componentType] || null;
    if (compute && typeof config?.awaitReadyForSnapshot === 'function') {
      await config.awaitReadyForSnapshot({
        tabId: window.Main?.session?.workspaceState?.activeTabId || null,
        reason: `e2e-cache-stats-${variantId}`
      });
    }
    return { available: !!compute, methodValue: method?.value ?? null };
  }, { componentType: type, methodSelector: selectors.method, computeSelector: selectors.compute, variantId: variant });
}

async function buildArchive(page, label, options = {}) {
  return page.evaluate(async ({ archiveLabel, archiveOptions }) => {
    const diagnostics = window.Shared?.renderCacheDiagnostics;
    const session = window.Main.session;
    const normalizeComparablePayload = payload => {
      const next = session.clonePayload ? session.clonePayload(payload) : structuredClone(payload);
      if (next?.config?.stats?.advisor && Object.prototype.hasOwnProperty.call(next.config.stats.advisor, 'pendingPoints')) {
        delete next.config.stats.advisor.pendingPoints;
      }
      if (next?.meta?.statsReporting?.pValueScientific === false) {
        delete next.meta.statsReporting.pValueScientific;
        if (!Object.keys(next.meta.statsReporting).length) delete next.meta.statsReporting;
      }
      if (next?.meta?.graphSizing) delete next.meta.graphSizing;
      if (next?.meta && !Object.keys(next.meta.statsReporting || {}).length) delete next.meta.statsReporting;
      if (next?.meta && !Object.keys(next.meta).length) delete next.meta;
      return next;
    };
    // Recovery allocates fresh runtime tab IDs. Compare durable layout content
    // after rebasing tab-scoped identifiers to one stable test owner.
    const serializeOwnerNeutralLayout = layout => session.serializePayloadSignature(
      session.rehomeTabScopedState(layout || null, 'workspace-0')
    );
    const cursor = diagnostics?.getCursor?.() || 0;
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: archiveOptions.snapshotKind || 'document-snapshot',
      policyMode: archiveOptions.policyMode || undefined,
      compression: 'STORE',
      reason: archiveLabel
    });
    const parsed = await window.Shared.graphArchive.parseFile(blob, { fileName: `${archiveLabel}.graph` });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
    }
    return {
      base64: btoa(binary),
      tabs: parsed.session.tabs.map(tab => ({
        type: tab.type,
        title: tab.title,
        variant: / \[[AB]\]$/.test(String(tab.title || '')) ? String(tab.title).slice(-2, -1) : null,
        chartType: tab.payload?.config?.chartType || null,
        canonicalPayloadSignature: session.serializePayloadSignature(normalizeComparablePayload(tab.payload || null)),
        canonicalLayoutSignature: serializeOwnerNeutralLayout(tab.layout),
        runtimeLayoutSignature: session.serializePayloadSignature(tab.layout || null),
        hasCache: !!tab.archiveRenderCache,
        payloadSignature: tab.archiveRenderCacheSignature || null,
        layoutSignature: tab.archiveRenderCacheLayoutSignature || null,
        ownerTabId: tab.archiveRenderCache?.__graphitixRenderCache?.tabId || null,
        component: tab.archiveRenderCache?.__graphitixRenderCache?.component || null,
        cartesianLayout: tab.archiveRenderCache?.__graphitixRenderCache?.cartesianLayout || null
      })),
      events: diagnostics?.getEvents?.({ afterCursor: cursor }) || []
    };
  }, { archiveLabel: label, archiveOptions: options });
}

async function auditRestoredTabs(page, cursor) {
  const baseline = await page.evaluate(() => {
    const tabs = window.Main.session.workspaceState.tabs.filter(tab => !tab.isWelcome);
    // Archive reopen/recovery may allocate fresh runtime tab ids. Match the
    // dirty-state baseline by the persisted tab identity used by this test.
    const key = tab => `${tab.type}::${tab.title}`;
    return Object.fromEntries(tabs.map(tab => [key(tab), {
      payloadDirty: !!tab.payloadDirty,
      userModified: !!tab.userModified
    }]));
  });

  const tabIds = await page.evaluate(() => window.Main.session.workspaceState.tabs.filter(tab => !tab.isWelcome).map(tab => tab.id));
  const auditedTabs = [];
  for (const tabId of tabIds) {
    await page.evaluate(async id => {
      const result = window.Main.tabs.activateTab(id, { reason: 'e2e-cache-contract-reopen' });
      if (result?.then) await result;
    }, tabId);
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 60_000 });
    await page.waitForFunction(id => {
      const state = window.Main?.session?.workspaceState;
      const tab = state?.tabs?.find(item => item?.id === id) || null;
      const config = tab?.type ? window.Main?.components?.registry?.[tab.type] : null;
      return !!tab && (!config?.hasRenderedGraph || config.hasRenderedGraph({
        tab,
        tabId: tab.id,
        type: tab.type,
        reason: 'e2e-cache-contract-audit'
      }) === true);
    }, tabId, { timeout: 120_000 });

    auditedTabs.push(await page.evaluate(({ id, statsControls, initial }) => {
      const session = window.Main.session;
      const normalizeComparablePayload = payload => {
        const next = session.clonePayload ? session.clonePayload(payload) : structuredClone(payload);
        if (next?.config?.stats?.advisor && Object.prototype.hasOwnProperty.call(next.config.stats.advisor, 'pendingPoints')) {
          delete next.config.stats.advisor.pendingPoints;
        }
        if (next?.meta?.statsReporting?.pValueScientific === false) {
          delete next.meta.statsReporting.pValueScientific;
          if (!Object.keys(next.meta.statsReporting).length) delete next.meta.statsReporting;
        }
        if (next?.meta?.graphSizing) delete next.meta.graphSizing;
        if (next?.meta && !Object.keys(next.meta.statsReporting || {}).length) delete next.meta.statsReporting;
        if (next?.meta && !Object.keys(next.meta).length) delete next.meta;
        return next;
      };
      const serializeOwnerNeutralLayout = layout => session.serializePayloadSignature(
        session.rehomeTabScopedState(layout || null, 'workspace-0')
      );
      const tab = session.workspaceState.tabs.find(item => item?.id === id) || null;
      const layoutDataset = tab?.layoutState?.svgBox?.dataset || {};
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, tab?.type) || document;
      const methodSelector = statsControls?.[tab?.type]?.method || null;
      const method = methodSelector ? (root.querySelector(methodSelector) || document.querySelector(methodSelector)) : null;
      const baselineKey = `${tab?.type || ''}::${tab?.title || ''}`;
      const before = initial?.[baselineKey] || { payloadDirty: false, userModified: false };
      const cartesianLayout = window.Shared?.cartesianLayout?.capturePublicationProvenance?.(root, {
        tabId: tab?.id || null,
        component: tab?.type || null
      }) || null;
      const cacheCartesianLayout = tab?.renderCache?.cache?.__graphitixRenderCache?.cartesianLayout || null;
      return {
        id: tab.id,
        type: tab.type,
        title: tab.title,
        variant: / \[[AB]\]$/.test(String(tab.title || '')) ? String(tab.title).slice(-2, -1) : null,
        chartType: tab.payload?.config?.chartType || null,
        canonicalPayloadSignature: session.serializePayloadSignature(normalizeComparablePayload(tab.payload || null)),
        canonicalLayoutSignature: serializeOwnerNeutralLayout(tab.layoutState),
        runtimeLayoutSignature: session.serializePayloadSignature(tab.layoutState || null),
        runtimeLayoutOwner: {
          tabId: layoutDataset.tabId || null,
          workspaceTabId: layoutDataset.workspaceTabId || null,
          resizerScope: layoutDataset.resizerProportionalFontResizeScope || null
        },
        payloadSignature: tab.payloadSignature || null,
        layoutSignature: tab.layoutSignature || null,
        cartesianLayout,
        cacheCartesianLayout,
        statsMethod: method?.value ?? null,
        payloadDirty: !!tab.payloadDirty,
        userModified: !!tab.userModified,
        activationIntroducedDirty: (!before.payloadDirty && !!tab.payloadDirty) || (!before.userModified && !!tab.userModified)
      };
    }, { id: tabId, statsControls: STATS_CONTROLS, initial: baseline }));
  }

  return page.evaluate(({ afterCursor, tabs }) => ({
    events: window.Shared.renderCacheDiagnostics.getEvents({ afterCursor }),
    tabs,
    sessionUserDirty: !!window.Main.session.workspaceState.sessionUserDirty
  }), { afterCursor: cursor, tabs: auditedTabs });
}

async function reopenAndAudit(page, archivePath) {
  await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.clear?.());
  const cursor = await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.getCursor?.() || 0);
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page, 120_000);
  return auditRestoredTabs(page, cursor);
}

async function recoverAndAudit(page, archive) {
  await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.clear?.());
  const cursor = await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.getCursor?.() || 0);
  await page.evaluate(async ({ base64, fileName }) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: 'application/zip' });
    const context = window.Main.tabs.getSessionActionsContext();
    await window.Main.sessionActions.applyArchiveBlob(context, blob, {
      reason: 'recovery-restore',
      fileName,
      fileScope: 'workspace'
    });
  }, { base64: archive.base64, fileName: 'recovery-parity.graph' });
  return auditRestoredTabs(page, cursor);
}

function assertCartesianPublication(provenance, expected, label) {
  expect(provenance, `${label}: missing Cartesian publication provenance`).toBeTruthy();
  expect(provenance.complete, `${label}: Cartesian publication is incomplete`).toBe(true);
  expect(provenance.owner?.tabId, `${label}: Cartesian owner tab mismatch`).toBe(expected.tabId);
  expect(provenance.owner?.component, `${label}: Cartesian owner component mismatch`).toBe(expected.type);
  expect(Number(provenance.publicationGeneration), `${label}: missing Cartesian publication generation`).toBeGreaterThan(0);
  if (provenance.payloadSignature != null) {
    expect(provenance.payloadSignature, `${label}: Cartesian payload signature mismatch`).toBe(expected.payloadSignature);
  }
  if (provenance.layoutSignature != null) {
    expect(provenance.layoutSignature, `${label}: Cartesian layout signature mismatch`).toBe(expected.layoutSignature);
  }
}

test.afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

function assertCartesianCacheProvenance(provenance, expected, label) {
  expect(provenance, `${label}: missing Cartesian cache provenance`).toBeTruthy();
  expect(provenance.complete, `${label}: Cartesian cache provenance is incomplete`).toBe(true);
  expect(provenance.owner?.tabId, `${label}: Cartesian cache owner tab mismatch`).toBe(expected.tabId);
  expect(provenance.owner?.component, `${label}: Cartesian cache owner component mismatch`).toBe(expected.type);
  expect(Number(provenance.publicationGeneration), `${label}: missing Cartesian cache publication generation`).toBeGreaterThan(0);
  expect(provenance.payloadSignature, `${label}: missing Cartesian cache payload signature`).toBe(expected.payloadSignature);
  expect(provenance.layoutSignature, `${label}: missing Cartesian cache layout signature`).toBe(expected.layoutSignature);
}

function assertSavePhase(archive, expectedCount, componentType = null) {
  expect(archive.tabs).toHaveLength(expectedCount);
  for (const tab of archive.tabs) {
    if (componentType) expect(tab.type).toBe(componentType);
    expect(tab.hasCache, `${tab.type}/${tab.title}: save phase omitted archive cache`).toBe(true);
    expect(tab.payloadSignature, `${tab.type}/${tab.title}: missing payload provenance`).toBeTruthy();
    expect(tab.layoutSignature, `${tab.type}/${tab.title}: missing layout provenance`).toBeTruthy();
    expect(tab.ownerTabId, `${tab.type}/${tab.title}: missing cache owner`).toBeTruthy();
    expect(tab.component).toBe(tab.type);
    if (tab.type === 'pie') expect(tab.chartType, `${tab.type}/${tab.title}: cache contract must exercise stacked Pie`).toBe('stacked');
    if (DEFAULT_CARTESIAN_CACHE_TYPES.has(tab.type)) {
      assertCartesianCacheProvenance(tab.cartesianLayout, {
        tabId: tab.ownerTabId,
        type: tab.type,
        payloadSignature: tab.payloadSignature,
        layoutSignature: tab.layoutSignature
      }, `${tab.type}/${tab.title} save`);
    }
  }
}

function assertReopenPhase(result, expectedCount) {
  expect(result.tabs).toHaveLength(expectedCount);
  expect(result.tabs.every(tab => !tab.activationIntroducedDirty), JSON.stringify(result.tabs, null, 2)).toBe(true);
  for (const tab of result.tabs) {
    expect(tab.runtimeLayoutOwner?.tabId, JSON.stringify(tab, null, 2)).toBe(tab.id);
    expect(tab.runtimeLayoutOwner?.workspaceTabId, JSON.stringify(tab, null, 2)).toBe(tab.id);
    expect(tab.runtimeLayoutOwner?.resizerScope, JSON.stringify(tab, null, 2)).toContain(`@tab:${tab.id}`);
    if (tab.type === 'pie') expect(tab.chartType, JSON.stringify(tab, null, 2)).toBe('stacked');
    if (DEFAULT_CARTESIAN_CACHE_TYPES.has(tab.type)) {
      assertCartesianPublication(tab.cartesianLayout, {
        tabId: tab.id,
        type: tab.type,
        payloadSignature: tab.payloadSignature,
        layoutSignature: tab.layoutSignature
      }, `${tab.type}/${tab.title} reopen`);
      assertCartesianCacheProvenance(tab.cacheCartesianLayout, {
        tabId: tab.id,
        type: tab.type,
        payloadSignature: tab.payloadSignature,
        layoutSignature: tab.layoutSignature
      }, `${tab.type}/${tab.title} reopened cache`);
    }
  }
  const fallbacks = result.events.filter(event => event.outcome === 'fallback-redraw');
  const hits = result.events.filter(event => event.phase === 'hydrate' && event.outcome === 'hit');
  expect(fallbacks, JSON.stringify(result.events, null, 2)).toEqual([]);
  expect(new Set(hits.map(event => event.tabId)).size, JSON.stringify(result.events, null, 2)).toBe(expectedCount);
  for (const hit of hits) {
    expect(hit.cacheOwnerTabId, JSON.stringify(hit, null, 2)).toBe(hit.tabId);
    expect(hit.runtimeOwnerTabId, JSON.stringify(hit, null, 2)).toBe(hit.tabId);
  }
}

for (const componentCase of COMPONENT_MATRIX) {
  test(`${componentCase.type}: one-tab save and reopen use the archive render cache`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await openFresh(page);
    await openExample(page, componentCase, true);
    await ensureMigratedCartesianMode(page, componentCase.type);
    await setVariant(page, componentCase.type, 'A');
    const statsA = await configureStatsVariant(page, componentCase.type, 'A');
    const archive = await buildArchive(page, `cache-single-${componentCase.type}`);
    await testInfo.attach(`${componentCase.type}-single-save.json`, { body: JSON.stringify(archive, null, 2), contentType: 'application/json' });
    assertSavePhase(archive, 1, componentCase.type);
    const result = await reopenAndAudit(page, writeArchive(archive.base64, `cache-single-${componentCase.type}`));
    assertReopenPhase(result, 1);
    expect(result.tabs[0].variant).toBe('A');
    expect(result.tabs[0].canonicalPayloadSignature).toBe(archive.tabs[0].canonicalPayloadSignature);
    expect(result.tabs[0].canonicalLayoutSignature).toBe(archive.tabs[0].canonicalLayoutSignature);
    if (statsA.available) expect(result.tabs[0].statsMethod).toBe(statsA.methodValue);
    await testInfo.attach(`${componentCase.type}-single-reopen.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  });

  test(`${componentCase.type}: two same-component tabs keep distinct cache, data, layout, and stats state`, async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await openFresh(page);
    await openExample(page, componentCase, true);
    await ensureMigratedCartesianMode(page, componentCase.type);
    await setVariant(page, componentCase.type, 'A');
    const statsA = await configureStatsVariant(page, componentCase.type, 'A');
    await openExample(page, componentCase, false);
    await ensureMigratedCartesianMode(page, componentCase.type);
    await setVariant(page, componentCase.type, 'B');
    const statsB = await configureStatsVariant(page, componentCase.type, 'B');
    const archive = await buildArchive(page, `cache-dual-${componentCase.type}`);
    await testInfo.attach(`${componentCase.type}-dual-save.json`, { body: JSON.stringify(archive, null, 2), contentType: 'application/json' });
    assertSavePhase(archive, 2, componentCase.type);
    expect(new Set(archive.tabs.map(tab => tab.variant))).toEqual(new Set(['A', 'B']));
    expect(new Set(archive.tabs.map(tab => tab.canonicalPayloadSignature)).size).toBe(2);
    expect(new Set(archive.tabs.map(tab => tab.canonicalLayoutSignature)).size).toBe(2);
    expect(new Set(archive.tabs.map(tab => tab.ownerTabId)).size).toBe(2);
    const result = await reopenAndAudit(page, writeArchive(archive.base64, `cache-dual-${componentCase.type}`));
    assertReopenPhase(result, 2);
    expect(new Set(result.tabs.map(tab => tab.variant))).toEqual(new Set(['A', 'B']));
    const archiveByVariant = new Map(archive.tabs.map(tab => [tab.variant, tab]));
    for (const tab of result.tabs) {
      const saved = archiveByVariant.get(tab.variant);
      expect(saved).toBeTruthy();
      expect(tab.canonicalPayloadSignature).toBe(saved.canonicalPayloadSignature);
      expect(tab.canonicalLayoutSignature).toBe(saved.canonicalLayoutSignature);
      const expectedStats = tab.variant === 'A' ? statsA : statsB;
      if (expectedStats.available) expect(tab.statsMethod).toBe(expectedStats.methodValue);
    }
    await testInfo.attach(`${componentCase.type}-dual-reopen.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  });
}

for (const componentType of ['box', 'survival']) {
  const componentCase = COMPONENT_MATRIX.find(item => item.type === componentType);
  test(`${componentType}: two-tab recovery archive uses the same owner-scoped caches and canonical state as save/reopen`, async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await openFresh(page);
    await openExample(page, componentCase, true);
    await setVariant(page, componentType, 'A');
    await configureStatsVariant(page, componentType, 'A');
    await openExample(page, componentCase, false);
    await setVariant(page, componentType, 'B');
    await configureStatsVariant(page, componentType, 'B');

    const archive = await buildArchive(page, `cache-recovery-${componentType}`, {
      snapshotKind: 'recovery',
      policyMode: 'recovery'
    });
    assertSavePhase(archive, 2, componentType);
    const result = await recoverAndAudit(page, archive);
    assertReopenPhase(result, 2);

    const archiveByVariant = new Map(archive.tabs.map(tab => [tab.variant, tab]));
    for (const tab of result.tabs) {
      const saved = archiveByVariant.get(tab.variant);
      expect(saved).toBeTruthy();
      expect(tab.canonicalPayloadSignature).toBe(saved.canonicalPayloadSignature);
      expect(tab.canonicalLayoutSignature).toBe(saved.canonicalLayoutSignature);
    }
    await testInfo.attach(`${componentType}-dual-recovery-archive.json`, {
      body: JSON.stringify({ archive, result }, null, 2),
      contentType: 'application/json'
    });
  });
}

test('mixed document: two tabs per component save and reopen exclusively from owner-scoped caches', async ({ page }, testInfo) => {
  test.setTimeout(1_200_000);
  await openFresh(page);
  let first = true;
  for (const componentCase of COMPONENT_MATRIX) {
    await openExample(page, componentCase, first);
    first = false;
    await ensureMigratedCartesianMode(page, componentCase.type);
    await setVariant(page, componentCase.type, 'A');
    await configureStatsVariant(page, componentCase.type, 'A');
    await openExample(page, componentCase, false);
    await ensureMigratedCartesianMode(page, componentCase.type);
    await setVariant(page, componentCase.type, 'B');
    await configureStatsVariant(page, componentCase.type, 'B');
  }
  const archive = await buildArchive(page, 'cache-mixed-two-per-component');
  assertSavePhase(archive, COMPONENT_MATRIX.length * 2);
  for (const componentCase of COMPONENT_MATRIX) {
    const componentTabs = archive.tabs.filter(tab => tab.type === componentCase.type);
    expect(componentTabs).toHaveLength(2);
    expect(new Set(componentTabs.map(tab => tab.variant))).toEqual(new Set(['A', 'B']));
    expect(new Set(componentTabs.map(tab => tab.canonicalPayloadSignature)).size).toBe(2);
    expect(new Set(componentTabs.map(tab => tab.canonicalLayoutSignature)).size).toBe(2);
    expect(new Set(componentTabs.map(tab => tab.ownerTabId)).size).toBe(2);
  }
  await testInfo.attach('mixed-save.json', { body: JSON.stringify(archive, null, 2), contentType: 'application/json' });
  const result = await reopenAndAudit(page, writeArchive(archive.base64, 'cache-mixed-two-per-component'));
  assertReopenPhase(result, COMPONENT_MATRIX.length * 2);
  const savedByTypeAndVariant = new Map(archive.tabs.map(tab => [`${tab.type}:${tab.variant}`, tab]));
  for (const tab of result.tabs) {
    const saved = savedByTypeAndVariant.get(`${tab.type}:${tab.variant}`);
    expect(saved).toBeTruthy();
    expect(tab.canonicalPayloadSignature).toBe(saved.canonicalPayloadSignature);
    expect(tab.canonicalLayoutSignature).toBe(saved.canonicalLayoutSignature);
  }
  await testInfo.attach('mixed-reopen.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});
