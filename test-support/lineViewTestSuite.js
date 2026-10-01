/* global afterAll, afterEach, beforeEach, expect, jest */
'use strict';

const { ensureJStatStub } = require('../__tests__/helpers/jstatTestStub');
const { loadProductionBootstrap } = require('./productionLoader');
const { installProductionTestEventTracker } = require('./productionTestLifecycle');

function createLineViewTestContext() {
  let restoreJStat = null;
  const productionEvents = installProductionTestEventTracker();
  const cancelPreviousLineAsyncWork = () => {
    const previousLine = window.Components?.line || null;
    const previousWorkspace = window.Main?.components?.registry?.line || null;
    const previousDescriptor = window.Shared?.componentLifecycle?.getDescriptor?.('line') || null;
    const scopes = [
      previousLine?.__asyncScope,
      previousWorkspace?.__asyncScope,
      previousDescriptor?.asyncScope
    ].filter(scope => typeof scope?.cancelAllForTab === 'function');
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    const tabIds = new Set(previousTabs
      .filter(tab => tab?.type === 'line' && tab.id)
      .map(tab => String(tab.id)));
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id;
    if(activeTabId){
      tabIds.add(String(activeTabId));
    }
    tabIds.forEach(tabId => {
      scopes.forEach(scope => scope.cancelAllForTab(tabId, 'line-test-reset'));
    });
  };
  const flush = () => new Promise(resolve => { requestAnimationFrame(() => resolve()); });
  const flushAll = async (count = 10) => {
    for(let i = 0; i < count; i += 1){
      await flush();
    }
  };
  const pointerEvent = (type, props = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.entries(props).forEach(([key, value]) => {
      Object.defineProperty(event, key, { configurable: true, value });
    });
    return event;
  };
  const findByAttribute = (root, selector, attribute, value) => Array.from(root?.querySelectorAll?.(selector) || [])
    .find(node => node.getAttribute(attribute) === value) || null;
  const findLineLegendSwatch = (root, seriesName) => findByAttribute(root, '[data-legend-swatch="1"]', 'data-legend-key', seriesName);
  const findLineLegendLabel = (root, seriesName) => findByAttribute(root, 'text[data-legend-key]', 'data-legend-key', seriesName);
  const findRenderedLine = (root, seriesName) => Array.from(root?.querySelectorAll?.('path[data-render-mode="line"]') || [])
    .find(node => node.getAttribute('data-series') === seriesName) || null;
  const findRenderedMarker = (root, seriesName) => Array.from(root?.querySelectorAll?.('circle, rect, path') || [])
    .find(node => node.__linePointData?.seriesName === seriesName) || null;
  const normalizeHeaderCells = row => row.map(value => value == null ? '' : value);
  const waitForLineLifecycle = (afterCursor, options = {}) => {
    const activeTabId = options.tabId || window.Main?.session?.getActiveTab?.()?.id || null;
    return window.Shared.componentLifecycle.waitForLifecycleEvent({
      componentKey: 'line',
      tabId: activeTabId,
      actions: options.actions || ['draw-settled'],
      afterCursor,
      timeoutMs: options.timeoutMs || 4000,
      predicate: options.reason
        ? event => event.reason === options.reason
        : null
    });
  };
  const loadCurrentLineExample = async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();
    const drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    exampleBtn.click();
    await waitForLineLifecycle(drawCursor, { reason: 'line-example-load', timeoutMs: 8000 });
    await flushAll(4);
    const hot = window.Components?.line?.getHot?.();
    expect(hot).toBeTruthy();
    return hot;
  };
  const activateWorkspace = async (type) => {
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const result = graphSelection(type);
    if(result && typeof result.then === 'function'){
      await result;
    }
    await Promise.resolve();
  };
  const ensureEmptyDuplicateTab = async () => {
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAll(20);
    }
  };
  const loadLineExampleAndComputeStats = async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();
    const drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    exampleBtn.click();
    await waitForLineLifecycle(drawCursor, { reason: 'line-example-load' });
    const computeBtn = document.getElementById('lineComputeStats');
    expect(computeBtn).toBeTruthy();
    computeBtn.click();
    await Promise.resolve();
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const session = window.Components?.line?.__testHooks?.getSessionForTab?.(activeTabId) || null;
    expect(session?.tabId).toBe(activeTabId);
    expect(session?.state?.statsState?.context?.series?.length).toBeGreaterThan(0);
    expect(document.getElementById('lineStatsStatus')?.textContent || '').toMatch(/up to date/i);
  };
  const enableLineRegressionOverlays = async () => {
    const trend = document.getElementById('lineShowTrendLine');
    const confidence = document.getElementById('lineShowIntervals');
    const prediction = document.getElementById('lineShowPredictionIntervals');
    [trend, confidence, prediction].forEach(control => expect(control).toBeTruthy());
    expect(trend.disabled).toBe(false);
    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    trend.checked = true;
    trend.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitForLineLifecycle(drawCursor, { reason: 'line-show-trend-change' });
    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    [confidence, prediction].forEach(control => {
      expect(control.disabled).toBe(false);
      control.checked = true;
      control.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await waitForLineLifecycle(drawCursor, { reason: 'line-prediction-intervals-toggle' });
  };
  const getLineOverlayCounts = () => {
    const root = document.querySelector('#linePage:not([hidden])') || document;
    return {
      trend: root.querySelectorAll('#lineSvg path[data-line-overlay-key="trend"]').length,
      confidence: root.querySelectorAll('#lineSvg path[data-line-overlay-key="confidence"]').length,
      prediction: root.querySelectorAll('#lineSvg path[data-line-overlay-key="prediction"]').length
    };
  };
  const getLatestLineDrawMeta = () => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    const matches = entries.filter(entry => String(entry?.label || '') === 'line.draw');
    return matches.length ? matches[matches.length - 1].meta || null : null;
  };
  
  beforeEach(async () => {
    productionEvents.reset();
    cancelPreviousLineAsyncWork();
    jest.resetModules();
    if(typeof window !== 'undefined'){
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }
    if(typeof global !== 'undefined'){
      delete global.Main;
      delete global.Components;
      delete global.Shared;
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    window.localStorage?.clear?.();
    window.sessionStorage?.clear?.();
    if(window.Components){
      delete window.Components.line;
    }
    if(global.Components){
      delete global.Components.line;
    }
    restoreJStat = ensureJStatStub();
  
    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['line']
    });
    await activateWorkspace('line');
    const activeLineTabId = window.Main?.session?.getActiveTab?.()?.id || null;
  
    window.Components?.line?.ensure?.({
      tabId: activeLineTabId,
      root: document.getElementById('linePage'),
      reason: 'line-view-test-ensure'
    });
    await flushAll(20);
});
  afterEach(() => {
    productionEvents.reset();
    cancelPreviousLineAsyncWork();
    if(typeof restoreJStat === 'function'){
      restoreJStat();
      restoreJStat = null;
    }
  });
  
  afterAll(() => {
    productionEvents.restore();
  });

  return {
    cancelPreviousLineAsyncWork,
    flush,
    flushAll,
    pointerEvent,
    findByAttribute,
    findLineLegendSwatch,
    findLineLegendLabel,
    findRenderedLine,
    findRenderedMarker,
    normalizeHeaderCells,
    waitForLineLifecycle,
    loadCurrentLineExample,
    activateWorkspace,
    ensureEmptyDuplicateTab,
    loadLineExampleAndComputeStats,
    enableLineRegressionOverlays,
    getLineOverlayCounts,
    getLatestLineDrawMeta,
  };
}

module.exports = { createLineViewTestContext };

