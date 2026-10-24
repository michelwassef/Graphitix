const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120000);

const flush = async (count = 16) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

const captureScatterTableShape = hot => {
  const rows = hot?.getData?.() || [];
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0), 0);
  return {
    rowCount: rows.length,
    columnCount,
    header: Array.isArray(rows[0]) ? rows[0].slice() : [],
    sample: rows.slice(1, 4).map(row => Array.isArray(row) ? row.slice(0, Math.min(5, columnCount)) : row)
  };
};

const activateScatter = async (reason) => {
  const activation = window.Main?.tabs?.handleGraphSelection?.('scatter', {
    skipDuplicatePrompt: true,
    reason
  });
  if (activation && typeof activation.then === 'function') await activation;
  await flush(8);
};

const loadScatterExample = async (root) => {
  const button = root?.querySelector('#scatterLoadExample');
  expect(button).toBeTruthy();
  button.click();
  await flush(32);
};

const loadTwoGroupedScatterTabs = async () => {
  const scatter = window.Components?.scatter;
  const workspace = window.Main?.session;
  const tabA = workspace?.getActiveTab?.();
  const rootA = document.querySelector('#scatterPage:not([hidden])');
  await loadScatterExample(rootA);
  const formatA = rootA?.querySelector('#scatterTableFormat');
  const replicatesA = rootA?.querySelector('#scatterReplicates');
  const groupedXA = rootA?.querySelector('#scatterGroupedXReplicates');
  expect(scatter && workspace && tabA && rootA && formatA && replicatesA && groupedXA).toBeTruthy();
  formatA.value = 'grouped';
  formatA.dispatchEvent(new Event('change', { bubbles: true }));
  await flush(24);

  window.Main?.tabs?.handleAddTabClick?.();
  await activateScatter('scatter-replicate-owner-test-second-tab');
  const tabB = workspace.getActiveTab();
  const rootB = document.querySelector('#scatterPage:not([hidden])');
  await loadScatterExample(rootB);
  const formatB = rootB?.querySelector('#scatterTableFormat');
  expect(tabB?.id).not.toBe(tabA.id);
  expect(formatB).toBeTruthy();
  formatB.value = 'grouped';
  formatB.dispatchEvent(new Event('change', { bubbles: true }));
  await flush(24);

  return {
    scatter,
    tabA,
    rootA,
    formatA,
    replicatesA,
    groupedXA,
    sessionA: scatter.__testHooks.getSession(tabA.id),
    sessionB: scatter.__testHooks.getSession(tabB.id)
  };
};

describe('Scatter axes-length control owner isolation', () => {
  beforeEach(async () => {
    const previousScatter = window.Components?.scatter || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    previousTabs.filter(tab => tab?.type === 'scatter').forEach(tab => {
      previousScatter?.disposeTab?.(tab, { tabId: tab.id, reason: 'scatter-axes-owner-test-reset' });
    });
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if (globalThis !== window) delete globalThis.Shared;
    jest.resetModules();
    loadProductionBootstrap({ vendorMode: 'fake', preloadComponents: ['scatter'] });
    await activateScatter('scatter-axes-owner-test-setup');
  });

  test('an inactive tab axes-length event cannot change the active Scatter session', async () => {
    const scatter = window.Components?.scatter;
    const workspace = window.Main?.session;
    const tabA = workspace?.getActiveTab?.();
    const rootA = document.querySelector('#scatterPage:not([hidden])');
    await loadScatterExample(rootA);
    const equalAxesA = rootA?.querySelector('.resizer-axeslength-checkbox--equal-length');
    const equalScaleA = rootA?.querySelector('.resizer-axeslength-checkbox--equal-scale');
    const varianceA = rootA?.querySelector('.resizer-axeslength-checkbox--variance');
    const sessionA = scatter?.__testHooks?.getSession?.(tabA?.id);
    expect(scatter && workspace && tabA && rootA && equalAxesA && equalScaleA && varianceA && sessionA).toBeTruthy();
    sessionA.state.view.equalAxes = false;

    window.Main?.tabs?.handleAddTabClick?.();
    await activateScatter('scatter-axes-owner-test-second-tab');
    const tabB = workspace.getActiveTab();
    const rootB = document.querySelector('#scatterPage:not([hidden])');
    await loadScatterExample(rootB);
    const equalAxesB = rootB?.querySelector('.resizer-axeslength-checkbox--equal-length');
    const equalScaleB = rootB?.querySelector('.resizer-axeslength-checkbox--equal-scale');
    const varianceB = rootB?.querySelector('.resizer-axeslength-checkbox--variance');
    const sessionB = scatter.__testHooks.getSession(tabB?.id);
    expect(tabB?.id).not.toBe(tabA.id);
    expect(rootB && equalAxesB && equalScaleB && varianceB && sessionB).toBeTruthy();
    equalAxesB.checked = false;
    equalAxesB.dispatchEvent(new Event('change', { bubbles: true }));
    equalScaleB.checked = false;
    equalScaleB.dispatchEvent(new Event('change', { bubbles: true }));
    varianceB.checked = false;
    varianceB.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(4);
    expect(sessionB.state.view.equalAxes).toBe(false);
    expect(sessionB.state.view.equalScaleAxes).toBe(false);
    expect(sessionB.state.view.axesVarianceScaled).toBe(false);

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(equalAxesA)).toBe(tabA.id);
    equalAxesA.checked = true;
    equalAxesA.dispatchEvent(new Event('change', { bubbles: true }));
    equalScaleA.checked = true;
    equalScaleA.dispatchEvent(new Event('change', { bubbles: true }));
    varianceA.checked = true;
    varianceA.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(4);

    expect(sessionA.state.view.equalAxes).toBe(false);
    expect(sessionB.state.view.equalAxes).toBe(false);
    expect(sessionB.state.view.equalScaleAxes).toBe(false);
    expect(sessionB.state.view.axesVarianceScaled).toBe(false);
  });

  test('a stale component owner binding cannot redirect view mode into another Scatter session', async () => {
    const scatter = window.Components?.scatter;
    const workspace = window.Main?.session;
    const tabA = workspace?.getActiveTab?.();
    const rootA = document.querySelector('#scatterPage:not([hidden])');
    await loadScatterExample(rootA);
    const sessionA = scatter?.__testHooks?.getSession?.(tabA?.id);
    expect(scatter && workspace && tabA && rootA && sessionA).toBeTruthy();
    expect(sessionA.state.view.viewMode).toBe('2d');

    window.Main?.tabs?.handleAddTabClick?.();
    await activateScatter('scatter-view-mode-owner-test-second-tab');
    const tabB = workspace.getActiveTab();
    const rootB = document.querySelector('#scatterPage:not([hidden])');
    await loadScatterExample(rootB);
    const viewModeB = rootB?.querySelector('#scatterViewMode');
    const sessionB = scatter.__testHooks.getSession(tabB?.id);
    expect(tabB?.id).not.toBe(tabA.id);
    expect(rootB && viewModeB && sessionB).toBeTruthy();
    expect(sessionB.state.view.viewMode).toBe('2d');

    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(viewModeB)).toBe(tabB.id);
    scatter.__boundTabId = tabA.id;
    viewModeB.value = '3d';
    viewModeB.dispatchEvent(new Event('change', { bubbles: true }));
    scatter.__boundTabId = tabB.id;
    await flush(4);

    expect(sessionA.state.view.viewMode).toBe('2d');
    expect(sessionB.state.view.viewMode).toBe('2d');
  });

  test('a retained inactive example button cannot load data into the active Scatter session', async () => {
    const scatter = window.Components?.scatter;
    const workspace = window.Main?.session;
    const tabA = workspace?.getActiveTab?.();
    const rootA = document.querySelector('#scatterPage:not([hidden])');
    const buttonA = rootA?.querySelector('#scatterLoadExample');
    const sessionA = scatter?.__testHooks?.getSession?.(tabA?.id);
    expect(scatter && workspace && tabA && rootA && buttonA && sessionA?.managers?.hot).toBeTruthy();
    const dataA = JSON.parse(JSON.stringify(sessionA.managers.hot.getData()));

    window.Main?.tabs?.handleAddTabClick?.();
    await activateScatter('scatter-example-owner-test-second-tab');
    const tabB = workspace.getActiveTab();
    const rootB = document.querySelector('#scatterPage:not([hidden])');
    const sessionB = scatter.__testHooks.getSession(tabB?.id);
    expect(tabB?.id).not.toBe(tabA.id);
    expect(sessionB?.managers?.hot).toBeTruthy();
    const dataB = JSON.parse(JSON.stringify(sessionB.managers.hot.getData()));

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(buttonA)).toBe(tabA.id);
    buttonA.click();
    await flush(32);

    expect(sessionA.managers.hot.getData()).toEqual(dataA);
    expect(sessionB.managers.hot.getData()).toEqual(dataB);
    expect(rootB?.querySelector('#scatterLoadExample')).toBeTruthy();
  });

  test('an inactive replicate-count event cannot reshape the active Scatter table', async () => {
    const { tabA, rootA, replicatesA, sessionA, sessionB } = await loadTwoGroupedScatterTabs();
    expect(sessionA?.managers?.hot && sessionB?.managers?.hot).toBeTruthy();
    const dataABefore = captureScatterTableShape(sessionA.managers.hot);
    const dataBBefore = captureScatterTableShape(sessionB.managers.hot);
    const replicatesBefore = sessionB.state.grouped.replicates;
    expect(replicatesBefore).toBeGreaterThan(1);

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(replicatesA)).toBe(tabA.id);
    replicatesA.value = String(replicatesBefore + 1);
    replicatesA.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(24);

    expect(captureScatterTableShape(sessionA.managers.hot)).toEqual(dataABefore);
    expect(captureScatterTableShape(sessionB.managers.hot)).toEqual(dataBBefore);
    expect(sessionB.state.grouped.replicates).toBe(replicatesBefore);
  });

  test('an inactive table-format event cannot transform the active Scatter table', async () => {
    const { tabA, rootA, formatA, sessionA, sessionB } = await loadTwoGroupedScatterTabs();
    expect(sessionA?.managers?.hot && sessionB?.managers?.hot).toBeTruthy();
    const dataABefore = captureScatterTableShape(sessionA.managers.hot);
    const dataBBefore = captureScatterTableShape(sessionB.managers.hot);
    expect(sessionB.state.grouped.replicates).toBeGreaterThan(1);

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(formatA)).toBe(tabA.id);
    formatA.value = 'single';
    formatA.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(24);

    expect(captureScatterTableShape(sessionA.managers.hot)).toEqual(dataABefore);
    expect(captureScatterTableShape(sessionB.managers.hot)).toEqual(dataBBefore);
    expect(sessionB.state.grouped.replicates).toBeGreaterThan(1);
  });

  test('an inactive grouped-X event cannot reshape the active Scatter table', async () => {
    const { tabA, rootA, groupedXA, sessionA, sessionB } = await loadTwoGroupedScatterTabs();
    expect(sessionA?.managers?.hot && sessionB?.managers?.hot && groupedXA).toBeTruthy();
    const dataABefore = captureScatterTableShape(sessionA.managers.hot);
    const dataBBefore = captureScatterTableShape(sessionB.managers.hot);
    expect(sessionB.state.grouped.groupedXReplicates).toBe(false);

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(groupedXA)).toBe(tabA.id);
    groupedXA.checked = true;
    groupedXA.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(24);

    expect(captureScatterTableShape(sessionA.managers.hot)).toEqual(dataABefore);
    expect(captureScatterTableShape(sessionB.managers.hot)).toEqual(dataBBefore);
    expect(sessionB.state.grouped.groupedXReplicates).toBe(false);
  });
});
