/* global afterEach, beforeEach, jest */
const { loadProductionBootstrap } = require('./productionLoader');

async function flush() {
  await Promise.resolve();
  await new Promise(resolve => { setTimeout(resolve, 0); });
}

async function handleGraphSelection(Main, type) {
  const maybe = Main.tabs.handleGraphSelection(type, { reason: 'test-selection' });
  if (maybe && typeof maybe.then === 'function') {
    await maybe;
  }
  const prompt = document.getElementById('duplicatePrompt');
  if (prompt && !prompt.hasAttribute('hidden')) {
    const emptyBtn = document.getElementById('duplicateEmpty');
    if (emptyBtn && typeof emptyBtn.click === 'function') {
      emptyBtn.click();
    }
  }
  await flush();
}

async function activateTabById(Main, tabId, reason) {
  const maybe = Main.tabs.activateTab(tabId, { reason: reason || 'test-activate' });
  if (maybe && typeof maybe.then === 'function') {
    await maybe;
  }
  await flush();
}

function createVennAdditionalTabTestContext() {
  jest.setTimeout(240_000);

  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['venn']
    });
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  return { flush, handleGraphSelection, activateTabById };
}

module.exports = { createVennAdditionalTabTestContext };

