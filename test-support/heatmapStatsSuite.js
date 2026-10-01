/* global afterEach, beforeEach, jest */
'use strict';

const { loadProductionBootstrap } = require('./productionLoader');

function cloneForTest(value) {
  return JSON.parse(JSON.stringify(value));
}

function getActiveHeatmapTabId() {
  return window.Main?.session?.getActiveTab?.()?.id
    || window.Main?.tabs?.getActiveTab?.()?.id
    || null;
}

function createHeatmapStatsTestContext() {
  let originalCreateStandardTable;

  async function flushAsyncWork(iterations = 20) {
    for (let i = 0; i < iterations; i += 1) {
      await new Promise(resolve => { setTimeout(resolve, 0); });
    }
  }

  async function waitFor(predicate, iterations = 80) {
    for (let i = 0; i < iterations; i += 1) {
      if (predicate()) {
        return true;
      }
      await new Promise(resolve => { setTimeout(resolve, 0); });
    }
    return !!predicate();
  }

  async function ensureCorrelationView() {
    const viewSelect = document.getElementById('heatmapView');
    if (viewSelect) {
      viewSelect.value = 'corr-columns';
      viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork(8);
    }
  }

  beforeEach(async () => {
    const previousHeatmap = window.Components?.heatmap || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if (previousHeatmap?.disposeTab) {
      previousTabs.filter(tab => tab?.type === 'heatmap').forEach(tab => {
        previousHeatmap.disposeTab(tab, { tabId: tab.id, reason: 'heatmap-stats-test-reset' });
      });
    }
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if (globalThis !== window) {
      delete globalThis.Shared;
    }
    delete global.__LAST_HEATMAP_HOT__;
    jest.resetModules();
    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['heatmap']
    });
    const canvasProto = window.HTMLCanvasElement?.prototype;
    if (canvasProto) {
      canvasProto.getContext = jest.fn(() => ({
        font: '',
        measureText: text => ({ width: String(text || '').length * 8 })
      }));
    }
    const Shared = window.Shared || {};
    originalCreateStandardTable = Shared.hot?.createStandardTable;
    if (originalCreateStandardTable) {
      Shared.hot.createStandardTable = function wrappedCreateStandardTable() {
        const instance = originalCreateStandardTable.apply(this, arguments);
        if (instance && arguments?.[0]?.id === 'heatmapHot') {
          global.__LAST_HEATMAP_HOT__ = instance;
        }
        return instance;
      };
    }

    const maybe = window.Main?.tabs?.handleGraphSelection?.('heatmap', {
      reason: 'heatmap-stats-test-setup'
    });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if (duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')) {
      document.getElementById('duplicateEmpty')?.click();
    }
    await flushAsyncWork(2);
  });

  afterEach(() => {
    const Shared = window.Shared || {};
    if (originalCreateStandardTable) {
      Shared.hot.createStandardTable = originalCreateStandardTable;
    }
    delete global.__LAST_HEATMAP_HOT__;
    originalCreateStandardTable = undefined;
  });

  return {
    cloneForTest,
    getActiveHeatmapTabId,
    flushAsyncWork,
    waitFor,
    ensureCorrelationView
  };
}

module.exports = { createHeatmapStatsTestContext };

