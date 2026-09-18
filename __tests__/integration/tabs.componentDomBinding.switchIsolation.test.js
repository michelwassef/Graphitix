const { loadProductionBootstrap } = require('../../test-support/productionLoader');

describe('Component DOM binding survives repeated same-component tab switches', () => {
  jest.setTimeout(240000);

  const WORKSPACES = [
    { type: 'venn', hotId: 'vennHot' },
    { type: 'box', hotId: 'hot' },
    { type: 'scatter', hotId: 'scatterHot' },
    { type: 'pca', hotId: 'pcaHot' },
    { type: 'line', hotId: 'lineHot' },
    { type: 'heatmap', hotId: 'heatmapHot' },
    { type: 'surface', hotId: 'surfaceHot' },
    { type: 'roc', hotId: 'rocHot' },
    { type: 'survival', hotId: 'survivalHot' },
    { type: 'hist', hotId: 'histHot' },
    { type: 'pie', hotId: 'pieHot' }
  ];

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
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
    for (let i = 0; i < 5; i += 1) {
      await flush();
    }
  }

  function verifyWorkspaceProbe(workspace, type, hotId, failures, label) {
    try {
      const activeTab = window.Main?.session?.getActiveTab?.() || null;
      const tabId = activeTab?.type === type ? String(activeTab.id || '') : '';
      workspace?.ensure?.({ tab: activeTab, tabId, reason: 'test-dom-binding-probe-ensure' });
      const mountedRoot = tabId && typeof window.Shared?.workspaceTabs?.getMountedRoot === 'function'
        ? window.Shared.workspaceTabs.getMountedRoot(tabId, type)
        : null;
      const hot = mountedRoot?.querySelector?.(`#${hotId}`)
        || (tabId ? document.querySelector(`[data-workspace-tab-id="${tabId}"] #${hotId}`) : null)
        || document.querySelector(`#${hotId}`);
      if (!hot && type !== 'scatter') {
        failures.push(`${type}: missing hot container ${hotId} at ${label}`);
      }
      if (typeof workspace?.getPayload === 'function') {
        const activeTab = window.Main?.session?.getActiveTab?.() || null;
        const payload = workspace.getPayload({
          tab: activeTab,
          tabId: activeTab?.id || null,
          reason: 'test-dom-binding-probe'
        });
        if (!payload || typeof payload !== 'object') {
          failures.push(`${type}: invalid payload at ${label}`);
        }
      }
    } catch (err) {
      failures.push(`${type}: probe failed at ${label} (${err?.message || String(err)})`);
    }
  }

  beforeEach(() => {
    jest.resetModules();
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    delete global.Main;
    delete global.Components;
    delete global.Shared;
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: WORKSPACES.map(({ type }) => type)
    });
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('same-component tab pairs keep live controls after repeated switches', async () => {
    const Main = window.Main;
    const registry = Main.components.registry;
    const failures = [];

    for (let i = 0; i < WORKSPACES.length; i += 1) {
      const { type, hotId } = WORKSPACES[i];
      const workspace = registry[type];
      if (!workspace) {
        failures.push(`${type}: missing workspace registry entry`);
        continue;
      }

      try {
        if (i > 0) {
          Main.tabs.handleAddTabClick();
          await flush();
        }

        await handleGraphSelection(Main, type);
        const tabA = Main.tabs.getActiveTab();
        if (!tabA || tabA.type !== type) {
          failures.push(`${type}: failed to activate first tab`);
          continue;
        }
        verifyWorkspaceProbe(workspace, type, hotId, failures, 'tabA-initial');

        Main.tabs.handleAddTabClick();
        await flush();
        await handleGraphSelection(Main, type);
        const tabB = Main.tabs.getActiveTab();
        if (!tabB || tabB.type !== type || tabB.id === tabA.id) {
          failures.push(`${type}: failed to activate second tab`);
          continue;
        }
        verifyWorkspaceProbe(workspace, type, hotId, failures, 'tabB-initial');

        for (let cycle = 0; cycle < 3; cycle += 1) {
          await activateTabById(Main, tabA.id, `test-switch-${type}-a-${cycle}`);
          if (Main.tabs.getActiveTab()?.type !== type) {
            failures.push(`${type}: wrong active type after switching to tabA cycle ${cycle}`);
            break;
          }
          verifyWorkspaceProbe(workspace, type, hotId, failures, `tabA-cycle-${cycle}`);

          await activateTabById(Main, tabB.id, `test-switch-${type}-b-${cycle}`);
          if (Main.tabs.getActiveTab()?.type !== type) {
            failures.push(`${type}: wrong active type after switching to tabB cycle ${cycle}`);
            break;
          }
          verifyWorkspaceProbe(workspace, type, hotId, failures, `tabB-cycle-${cycle}`);
        }
      } catch (err) {
        failures.push(`${type}: ${err?.message || String(err)}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
