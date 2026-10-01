/* global afterAll, afterEach, beforeEach, expect, jest */
'use strict';

const { installPcaViewProductionFixture } = require('./pcaViewFixture');
const { installProductionTestEventTracker } = require('./productionTestLifecycle');

function createPcaViewTestContext({ ensureReason = 'pca-view-test-ensure' } = {}) {
  const productionEvents = installProductionTestEventTracker();
  const flush = () => new Promise(resolve => {
    requestAnimationFrame(() => resolve());
  });
  const flushAll = async (count = 10) => {
    for (let i = 0; i < count; i += 1) {
      await flush();
    }
  };
  const flushUntil = async (predicate, { limit = 50, step = 1 } = {}) => {
    for (let attempt = 0; attempt < limit; attempt += 1) {
      if (predicate()) {
        return true;
      }
      await flushAll(step);
    }
    throw new Error('flushUntil timed out');
  };
  const activateWorkspace = async type => {
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const result = graphSelection(type);
    if (result && typeof result.then === 'function') {
      await result;
    }
    await Promise.resolve();
  };

  beforeEach(async () => {
    productionEvents.reset();
    jest.resetModules();
    installPcaViewProductionFixture();
    await activateWorkspace('pca');
    const activePcaTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    window.Components?.pca?.ensure?.({
      tabId: activePcaTabId,
      root: document.getElementById('pcaPage'),
      reason: ensureReason
    });
    await flushAll();
  });

  afterEach(() => {
    productionEvents.reset();
  });

  afterAll(() => {
    productionEvents.restore();
  });

  return { flushAll, flushUntil, activateWorkspace };
}

module.exports = { createPcaViewTestContext };

