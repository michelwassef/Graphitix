const fs = require('fs');
const JSZip = require('jszip');
const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  openComponentFromWelcome,
  clickExpectedExampleButton,
  waitForDocumentOpenComplete
} = require('../helpers/workspaceDriver');
const { waitForArchiveCheckpoint, waitForRenderCacheOutcome } = require('../helpers/contractWaits');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { buildRenderCacheVariantPayload } = require('../../test-support/renderCacheMutationAdapters');

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

function writeArchive(base64, outputPath) {
  fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
  return outputPath;
}

async function createLegacyBoxCacheArchive(base64) {
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  const cachePath = Object.keys(zip.files).find(path => path.endsWith('/render-cache.json'));
  if (!cachePath) throw new Error('Expected Box archive render cache');
  const renderCacheFile = JSON.parse(await zip.file(cachePath).async('string'));
  const cache = renderCacheFile?.cache;
  const titleNode = cache?.plot?.nodes?.find(node => (
    node?.kind === 'element'
    && typeof node.markup === 'string'
    && /data-font-role="graphTitle"/.test(node.markup)
  ));
  if (!titleNode) throw new Error('Expected serialized Box graph title');
  const legacyMarkup = titleNode.markup.replace(
    /\sdata-label-drag-position-metrics=(?:"[^"]*"|'[^']*')/,
    ''
  );
  if (legacyMarkup === titleNode.markup) {
    throw new Error('Expected the current Box title cache to include drag-position metrics');
  }
  titleNode.markup = legacyMarkup;
  cache.__graphitixRenderCache.version = 2;
  zip.file(cachePath, JSON.stringify(renderCacheFile));
  return zip.generateAsync({ type: 'base64' });
}

async function openFresh(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
}

async function openExample(page, componentCase, first = false) {
  await openComponentFromWelcome(page, componentCase, { first });
  await page.waitForSelector(`#${componentCase.pageId}:not([hidden])`, { timeout: 30_000 });
  await clickExpectedExampleButton(page, componentCase.exampleButtonId);
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
  const basePayload = await page.evaluate(({ componentType }) => {
    const session = window.Main?.session;
    const state = session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    if (!tab || tab.type !== componentType) throw new Error(`Missing active ${componentType} tab`);
    return session.clonePayload ? session.clonePayload(tab.payload) : structuredClone(tab.payload);
  }, { componentType: type });
  const { payload, mutation } = buildRenderCacheVariantPayload(basePayload, type, variant);
  return page.evaluate(async ({ componentType, variantId, nextPayload, mutationEvidence }) => {
    const session = window.Main?.session;
    const state = session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const config = window.Main?.components?.registry?.[componentType] || null;
    if (!tab || !config) throw new Error(`Missing active ${componentType} tab`);
    const clone = value => session.clonePayload ? session.clonePayload(value) : structuredClone(value);
    const payload = session.clonePayload ? session.clonePayload(nextPayload) : structuredClone(nextPayload);
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
      mutated: true,
      mutation: mutationEvidence,
      payloadSignature: session.serializePayloadSignature(tab.payload || null),
      layoutSignature: session.serializePayloadSignature(tab.layoutState || null)
    };
  }, { componentType: type, variantId: variant, nextPayload: payload, mutationEvidence: mutation });
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
  const archive = await page.evaluate(async ({ archiveLabel, archiveOptions }) => {
    const diagnostics = window.Shared?.renderCacheDiagnostics;
    const session = window.Main.session;
    const normalizeComparablePayload = payload => {
      const next = session.clonePayload ? session.clonePayload(payload) : structuredClone(payload);
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
      renderCacheSchemaVersion: window.Shared?.renderCacheSchema?.SCHEMA_VERSION || null,
      diagnosticCursor: cursor,
      tabs: parsed.session.tabs.map(tab => ({
        type: tab.type,
        title: tab.title,
        dataViewCount: Array.isArray(tab.payload?.dataViews?.views) ? tab.payload.dataViews.views.length : 0,
        rawDataViewMatchesPayload: (() => {
          const views = tab.payload?.dataViews?.views;
          const rawView = Array.isArray(views)
            ? views.find(view => String(view?.id || view?.kind || '').toLowerCase() === 'raw') || views[0]
            : null;
          return Array.isArray(rawView?.data) && Array.isArray(tab.payload?.data)
            ? JSON.stringify(rawView.data) === JSON.stringify(tab.payload.data)
            : null;
        })(),
        variant: / \[[AB]\]$/.test(String(tab.title || '')) ? String(tab.title).slice(-2, -1) : null,
        chartType: tab.payload?.config?.chartType || null,
        canonicalPayloadSignature: session.serializePayloadSignature(normalizeComparablePayload(tab.payload || null)),
        canonicalLayoutSignature: serializeOwnerNeutralLayout(tab.layout),
        runtimeLayoutSignature: session.serializePayloadSignature(tab.layout || null),
        hasCache: !!tab.archiveRenderCache,
        cacheVersion: Number(tab.archiveRenderCache?.__graphitixRenderCache?.version) || null,
        hasGraphTitleDragMetrics: (tab.archiveRenderCache?.plot?.nodes || []).some(node => (
          node?.kind === 'element'
          && /data-font-role="graphTitle"/.test(String(node.markup || ''))
          && /data-label-drag-position-metrics=/.test(String(node.markup || ''))
        )),
        payloadSignature: tab.archiveRenderCacheSignature || null,
        layoutSignature: tab.archiveRenderCacheLayoutSignature || null,
        ownerTabId: tab.archiveRenderCache?.__graphitixRenderCache?.tabId || null,
        component: tab.archiveRenderCache?.__graphitixRenderCache?.component || null,
        cartesianLayout: tab.archiveRenderCache?.__graphitixRenderCache?.cartesianLayout || null
      })),
      events: diagnostics?.getEvents?.({ afterCursor: cursor }) || []
    };
  }, { archiveLabel: label, archiveOptions: options });
  for (const tab of archive.tabs || []) {
    if (!tab.hasCache || !tab.ownerTabId || !tab.type) {
      continue;
    }
    const emittedCheckpoint = (archive.events || []).some(event => (
      String(event?.tabId || '') === String(tab.ownerTabId)
      && String(event?.component || '') === String(tab.type)
      && event?.phase === 'archive-checkpoint'
      && event?.outcome === 'stored'
    ));
    // A previously archive-ready cache can be copied into a new archive
    // without another store event. Its embedded owner and signatures are the
    // evidence; wait for a checkpoint only when this operation emitted one.
    if (!emittedCheckpoint) {
      continue;
    }
    await waitForArchiveCheckpoint(page, tab.type, {
      expectedTabId: tab.ownerTabId,
      afterCursor: archive.diagnosticCursor,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature,
      timeout: 120_000
    });
  }
  return archive;
}

async function auditRestoredTabs(page, cursor, lifecycleCursor) {
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
    const tabType = await page.evaluate(id => (
      window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id)?.type || null
    ), tabId);
    if (tabType) {
      await waitForRenderCacheOutcome(page, tabType, {
        expectedTabId: tabId,
        afterCursor: cursor,
        phase: 'hydrate',
        outcome: 'hit',
        timeout: 120_000
      });
    }

    // Grid events and ResizeObserver notifications arrive after synchronous
    // hydration. Let those projections run before checking the settled cache.
    await page.evaluate(async id => {
      const tab = window.Main.session.workspaceState.tabs.find(item => item.id === id);
      const component = window.Main.components.registry[tab.type];
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      await nextFrame();
      await nextFrame();
      await component.awaitReadyForSnapshot?.({ tabId: id, reason: 'cache-restoration-settled' });
    }, tabId);

    auditedTabs.push(await page.evaluate(({ id, statsControls, initial }) => {
      const session = window.Main.session;
      const normalizeComparablePayload = payload => {
        const next = session.clonePayload ? session.clonePayload(payload) : structuredClone(payload);
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

  return page.evaluate(({ afterCursor, lifecycleAfter, tabs }) => {
    const lifecycle = (window.Shared.componentLifecycle.getLifecycleEvents() || []).slice(lifecycleAfter);
    const restoredAt = new Map();
    for (const event of lifecycle) {
      if (event.action === 'saved-render-cache-restored' || event.action === 'runtime-render-cache-restored') {
        if (!restoredAt.has(event.tabId)) restoredAt.set(event.tabId, event.index);
      }
    }
    return {
      events: window.Shared.renderCacheDiagnostics.getEvents({ afterCursor }),
      interactionRejections: lifecycle.filter(event => event.action === 'render-cache-interactions-rejected'),
      postRestoreDraws: lifecycle.filter(event => event.action === 'draw-settled'
        && restoredAt.has(event.tabId) && event.index > restoredAt.get(event.tabId)),
      tabs,
      sessionUserDirty: !!window.Main.session.workspaceState.sessionUserDirty
    };
  }, { afterCursor: cursor, lifecycleAfter: lifecycleCursor, tabs: auditedTabs });
}

async function reopenAndAudit(page, archivePath) {
  await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.clear?.());
  const cursor = await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.getCursor?.() || 0);
  const lifecycleCursor = await page.evaluate(() => window.Shared?.componentLifecycle?.getLifecycleEvents?.().length || 0);
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page, 120_000);
  return auditRestoredTabs(page, cursor, lifecycleCursor);
}

async function recoverAndAudit(page, archive) {
  await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.clear?.());
  const cursor = await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.getCursor?.() || 0);
  const lifecycleCursor = await page.evaluate(() => window.Shared?.componentLifecycle?.getLifecycleEvents?.().length || 0);
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
  return auditRestoredTabs(page, cursor, lifecycleCursor);
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
  expect(archive.renderCacheSchemaVersion).toBeGreaterThan(0);
  for (const tab of archive.tabs) {
    if (componentType) expect(tab.type).toBe(componentType);
    expect(tab.hasCache, `${tab.type}/${tab.title}: save phase omitted archive cache`).toBe(true);
    expect(tab.payloadSignature, `${tab.type}/${tab.title}: missing payload provenance`).toBeTruthy();
    expect(tab.layoutSignature, `${tab.type}/${tab.title}: missing layout provenance`).toBeTruthy();
    expect(tab.ownerTabId, `${tab.type}/${tab.title}: missing cache owner`).toBeTruthy();
    expect(tab.component).toBe(tab.type);
    expect(tab.cacheVersion).toBe(archive.renderCacheSchemaVersion);
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
  expect(result.postRestoreDraws, JSON.stringify(result.postRestoreDraws, null, 2)).toEqual([]);
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
  expect(result.interactionRejections, JSON.stringify(result.interactionRejections, null, 2)).toEqual([]);
  expect(new Set(hits.map(event => event.tabId)).size, JSON.stringify(result.events, null, 2)).toBe(expectedCount);
  for (const hit of hits) {
    expect(hit.cacheOwnerTabId, JSON.stringify(hit, null, 2)).toBe(hit.tabId);
    expect(hit.runtimeOwnerTabId, JSON.stringify(hit, null, 2)).toBe(hit.tabId);
  }
}

test('legacy Box archive redraws and replaces its obsolete cache on save', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await openFresh(page);
  const boxCase = COMPONENT_MATRIX.find(item => item.type === 'box');
  await openExample(page, boxCase, true);

  const currentArchive = await buildArchive(page, 'cache-legacy-box-seed');
  const legacyArchive = await createLegacyBoxCacheArchive(currentArchive.base64);
  const legacyPath = writeArchive(
    legacyArchive,
    testInfo.outputPath('cache-legacy-box-v2.graph')
  );
  await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.clear?.());
  const diagnosticCursor = await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.getCursor?.() || 0);
  const lifecycleCursor = await page.evaluate(() => window.Shared?.componentLifecycle?.getLifecycleEvents?.().length || 0);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#workspaceSessionInput').setInputFiles(legacyPath);
  await page.waitForFunction(() => {
    const session = window.Main?.session;
    const tab = session?.workspaceState?.tabs?.find(item => item?.id === session?.workspaceState?.activeTabId);
    return tab?.type === 'box' && tab.loadedFromArchive === true && tab.archiveRenderCache == null;
  }, null, { timeout: 120_000 });
  await waitForDocumentOpenComplete(page, 120_000);
  await page.waitForFunction(() => {
    const session = window.Main?.session;
    const tab = session?.workspaceState?.tabs?.find(item => item?.id === session?.workspaceState?.activeTabId);
    if (tab?.type !== 'box') return false;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, 'box')
      || document.querySelector('#boxPage:not([hidden])');
    const title = root?.querySelector?.('#boxSvg [data-font-role="graphTitle"]');
    return window.Main?.components?.registry?.box?.hasRenderedGraph?.({
      tab,
      tabId: tab.id,
      type: 'box',
      reason: 'legacy-cache-redraw-contract'
    }) === true
      && !!title?.getAttribute('data-label-drag-position-metrics');
  }, null, { timeout: 120_000 });

  const legacyRestore = await page.evaluate(({ afterCursor, afterLifecycle }) => ({
    events: window.Shared.renderCacheDiagnostics.getEvents({ afterCursor }),
    interactionRejections: (window.Shared?.componentLifecycle?.getLifecycleEvents?.() || [])
      .slice(afterLifecycle)
      .filter(event => event.action === 'render-cache-interactions-rejected')
  }), { afterCursor: diagnosticCursor, afterLifecycle: lifecycleCursor });
  expect(legacyRestore.events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      phase: 'runtime-rehome',
      outcome: 'rejected',
      reason: 'schema-version-mismatch'
    })
  ]));
  expect(legacyRestore.interactionRejections).toEqual([]);

  const resavedArchive = await buildArchive(page, 'cache-legacy-box-resaved');
  assertSavePhase(resavedArchive, 1, 'box');
  expect(resavedArchive.tabs[0].hasGraphTitleDragMetrics).toBe(true);

  const reopened = await reopenAndAudit(page, writeArchive(
    resavedArchive.base64,
    testInfo.outputPath('cache-legacy-box-resaved.graph')
  ));
  assertReopenPhase(reopened, 1);
  await expect.poll(() => page.evaluate(() => {
    const session = window.Main?.session;
    const tab = session?.workspaceState?.tabs?.find(item => item?.id === session?.workspaceState?.activeTabId);
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tab?.id, 'box')
      || document.querySelector('#boxPage:not([hidden])');
    return !!root?.querySelector?.('#boxSvg [data-font-role="graphTitle"][data-label-drag-position-metrics]');
  })).toBe(true);
});

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
    const result = await reopenAndAudit(page, writeArchive(archive.base64, testInfo.outputPath(`cache-single-${componentCase.type}.graph`)));
    assertReopenPhase(result, 1);
    expect(result.tabs[0].variant).toBe('A');
    expect(result.tabs[0].canonicalPayloadSignature).toBe(archive.tabs[0].canonicalPayloadSignature);
    expect(result.tabs[0].canonicalLayoutSignature).toBe(archive.tabs[0].canonicalLayoutSignature);
    if (statsA.available) expect(result.tabs[0].statsMethod).toBe(statsA.methodValue);
    if (componentCase.type === 'scatter') {
      await page.waitForFunction(() => {
        const id = window.Main.session.workspaceState.activeTabId;
        const runtime = window.Components.scatter.__testHooks.getSession(id)?.cache?.selectionRuntime;
        return !runtime?.syncInProgress && !runtime?.pendingProgrammaticEvents
          && performance.now() > (Number(runtime?.eventSuppressUntil) || 0);
      });
      const unchanged = await page.evaluate(async () => {
        const component = window.Components.scatter;
        const id = window.Main.session.workspaceState.activeTabId;
        const hot = component.__ensureHotForActiveTab({ tabId: id });
        const svg = window.Shared.workspaceTabs.getMountedRoot(id, 'scatter').querySelector('#scatterSvg');
        const cursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
        hot.gridApi.dispatchEvent({ type: 'selectionChanged', source: 'apiSelectAll' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await component.awaitReadyForSnapshot({ tabId: id, reason: 'unchanged-selection-cache-contract' });
        return {
          sameSvg: svg === window.Shared.workspaceTabs.getMountedRoot(id, 'scatter').querySelector('#scatterSvg'),
          draws: window.Shared.componentLifecycle.getLifecycleEvents().slice(cursor)
            .filter(event => event.tabId === id && event.action === 'draw-settled')
        };
      });
      expect(unchanged.sameSvg).toBe(true);
      expect(unchanged.draws).toEqual([]);
      const selectedRows = await page.evaluate(async () => {
        const id = window.Main.session.workspaceState.activeTabId;
        const component = window.Components.scatter;
        const hot = component.__ensureHotForActiveTab({ tabId: id });
        const cursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
        hot.gridApi.getDisplayedRowAtIndex(0).setSelected(true);
        await window.Shared.componentLifecycle.waitForLifecycleEvent({
          componentKey: 'scatter', tabId: id, afterCursor: cursor,
          actions: ['draw-settled'], predicate: event => event.reason === 'row-selection'
        });
        return component.getPayload({ tabId: id }).config.selectedRows;
      });
      expect(selectedRows).toHaveLength(1);
    }
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
    const result = await reopenAndAudit(page, writeArchive(archive.base64, testInfo.outputPath(`cache-dual-${componentCase.type}.graph`)));
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
  const result = await reopenAndAudit(page, writeArchive(archive.base64, testInfo.outputPath('cache-mixed-two-per-component.graph')));
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

test('DataView-backed components keep payload and Raw matrices aligned through cache reopen', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  await openFresh(page);
  const managerFields = {
    box: '__boxDataViewsManager',
    scatter: '__scatterDataViewsManager',
    pca: '__pcaDataViewsManager',
    line: '__lineDataViewsManager',
    hist: '__histDataViewsManager',
    heatmap: '__heatmapDataViewsManager',
    roc: '__rocDataViewsManager',
    survival: '__survivalDataViewsManager',
    pie: '__pieDataViewsManager',
    surface: '__surfaceDataViewsManager'
  };
  let first = true;
  for (const componentCase of COMPONENT_MATRIX.filter(item => managerFields[item.type])) {
    const tabId = await openExample(page, componentCase, first);
    first = false;
    await ensureMigratedCartesianMode(page, componentCase.type);
    const matrixShape = await page.evaluate(({ id, type, managerField }) => {
      const component = window.Components?.[type];
      component?.getPayload?.({ tabId: id });
      const ownerSession = component?.__testHooks?.getSession?.(id, { create: false }) || null;
      const hot = ownerSession?.managers?.hot
        || component?.getHot?.()
        || component?.getHotInstance?.()
        || component?.__getState?.()?.hot
        || component?.__testGetState?.()?.hot
        || null;
      const manager = ownerSession?.managers?.dataViews || hot?.[managerField];
      const raw = manager?.getView?.('raw')?.data;
      if (!Array.isArray(raw) || !raw.length) throw new Error(`${type} Raw DataView matrix unavailable`);
      const widenedRaw = raw.map(row => Array.isArray(row) ? [...row, ...Array(8).fill('')] : row);
      if (!manager.updateViewData('raw', widenedRaw, { reason: 'cache-raw-width-regression' })) {
        throw new Error(`${type} could not widen its Raw DataView matrix`);
      }
      const derived = manager.createDerivedView({
        title: 'Cache signature probe',
        data: hot.getData().map(row => Array.isArray(row) ? row.slice() : row),
        sourceViewId: 'raw',
        transformSpec: { type: 'cache-raw-width-probe' },
        activate: true,
        reason: 'cache-raw-width-regression'
      });
      if (!derived) throw new Error(`${type} could not preserve its displayed view`);
      const payload = component.getPayload({ tabId: id });
      const views = payload?.dataViews?.views || [];
      const rawView = views.find(view => view?.id === 'raw' || view?.kind === 'raw') || views[0];
      return {
        hotWidth: hot.getData()?.[0]?.length || 0,
        payloadWidth: payload?.data?.[0]?.length || 0,
        rawWidth: rawView?.data?.[0]?.length || 0,
        matches: JSON.stringify(payload?.data) === JSON.stringify(rawView?.data)
      };
    }, { id: tabId, type: componentCase.type, managerField: managerFields[componentCase.type] });
    if (componentCase.type !== 'scatter') {
      expect(matrixShape.rawWidth, componentCase.type).toBeGreaterThan(matrixShape.hotWidth);
    }
    expect(matrixShape.payloadWidth, componentCase.type).toBe(matrixShape.rawWidth);
    expect(matrixShape.matches, componentCase.type).toBe(true);
  }

  const expectedCount = Object.keys(managerFields).length;
  const archive = await buildArchive(page, 'cache-dataview-raw-signature-width');
  assertSavePhase(archive, expectedCount);
  const archiveMatrixMismatches = archive.tabs
    .filter(tab => tab.dataViewCount > 1 && tab.rawDataViewMatchesPayload !== true)
    .map(tab => ({ type: tab.type, title: tab.title, dataViewCount: tab.dataViewCount }));
  expect(archiveMatrixMismatches).toEqual([]);
  expect(archive.tabs.some(tab => tab.type === 'line' && tab.dataViewCount > 1)).toBe(true);
  const savedPath = writeArchive(archive.base64, testInfo.outputPath('cache-dataview-raw-signature-width.graph'));
  const result = await reopenAndAudit(page, savedPath);
  assertReopenPhase(result, expectedCount);
  expect(new Set(result.tabs.map(tab => tab.type))).toEqual(new Set(Object.keys(managerFields)));
});

test('Heatmap caches restore when first opened from another component, then switched in reverse tab order', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const boxCase = COMPONENT_MATRIX.find(item => item.type === 'box');
  const heatmapCase = COMPONENT_MATRIX.find(item => item.type === 'heatmap');
  await openFresh(page);
  await openExample(page, boxCase, true);
  await openExample(page, heatmapCase, false);
  await openExample(page, heatmapCase, false);

  const tabIds = await page.evaluate(async () => {
    const session = window.Main.session;
    const tabs = session.workspaceState.tabs.filter(tab => !tab.isWelcome);
    const boxId = tabs.find(tab => tab.type === 'box')?.id || null;
    const heatmapIds = tabs.filter(tab => tab.type === 'heatmap').map(tab => tab.id);
    const activation = session.activateTab?.bind(session) || window.Main.tabs.activateTab;
    const result = activation(boxId, { reason: 'e2e-heatmap-cache-start-on-other-component' });
    if (result?.then) await result;
    return { boxId, heatmapIds };
  });
  expect(tabIds.boxId).toBeTruthy();
  expect(tabIds.heatmapIds).toHaveLength(2);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabIds.boxId);

  const archive = await buildArchive(page, 'cache-heatmap-reverse-owner-activation');
  assertSavePhase(archive, 3);
  await testInfo.attach('heatmap-reverse-activation-save.json', {
    body: JSON.stringify(archive, null, 2),
    contentType: 'application/json'
  });

  const archivePath = writeArchive(archive.base64, testInfo.outputPath('heatmap-reverse-activation.graph'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page, 120_000);
  const cursor = await page.evaluate(() => window.Shared?.renderCacheDiagnostics?.getCursor?.() || 0);
  const reopenedIds = await page.evaluate(() => window.Main.session.workspaceState.tabs
    .filter(tab => tab.type === 'heatmap')
    .map(tab => tab.id));
  expect(reopenedIds).toHaveLength(2);

  for (const tabId of reopenedIds.slice().reverse()) {
    const lifecycleCursor = await page.evaluate(() => window.Shared.componentLifecycle.getLifecycleEventCursor());
    await page.locator(`.workspace-tab[data-tab-id="${tabId}"]`).click({ force: true });
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 60_000 });
    await page.waitForFunction(id => {
      const tab = window.Main.session.workspaceState.tabs.find(item => item.id === id);
      return window.Main.components.registry.heatmap.hasRenderedGraph({ tab, tabId: id, type: 'heatmap' }) === true;
    }, tabId, { timeout: 120_000 });
    await waitForRenderCacheOutcome(page, 'heatmap', {
      expectedTabId: tabId,
      afterCursor: cursor,
      phase: 'hydrate',
      outcome: 'hit',
      timeout: 30_000
    });
    await page.evaluate(async id => {
      const component = window.Main.components.registry.heatmap;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await component.awaitReadyForSnapshot?.({ tabId: id, reason: 'heatmap-cache-reverse-activation-settled' });
    }, tabId);
    const draws = await page.evaluate(({ id, after }) => window.Shared.componentLifecycle.getLifecycleEvents()
      .filter(event => event.index > after && event.tabId === id && event.action === 'draw-settled'), {
      id: tabId,
      after: lifecycleCursor
    });
    expect(draws, `Heatmap tab ${tabId} should restore its own cache without fallback redraw`).toEqual([]);
  }
});
