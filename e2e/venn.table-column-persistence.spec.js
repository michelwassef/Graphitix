const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function configureFourthSet(page, plotType) {
  return page.evaluate((mode) => {
    const workspace = window.Main?.session?.workspaceState;
    const tabId = workspace?.activeTabId || null;
    const root = tabId ? window.Shared?.workspaceTabs?.getMountedRoot?.(tabId, 'venn') : null;
    const venn = window.Components?.venn;
    const hot = venn?.__getState?.()?.ui?.hot || null;
    if (!tabId || !root || !venn || !hot) {
      throw new Error('Active Venn owner is not ready');
    }

    const plotTypeSelect = root.querySelector('#vennPlotType');
    if (!plotTypeSelect) {
      throw new Error('Missing Venn plot type control');
    }
    plotTypeSelect.value = mode;
    plotTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    hot.alter('insert_col_end', 2, 1, 'header-menu');
    hot.setDataAtCell([
      [0, 0, 'Set A'],
      [0, 1, 'Set B'],
      [0, 2, 'Set C'],
      [0, 3, 'Set D'],
      [1, 0, 'A_ONLY'],
      [1, 1, 'B_ONLY'],
      [1, 2, 'C_ONLY'],
      [1, 3, 'D_ONLY'],
      [2, 0, 'AD_SHARED'],
      [2, 3, 'AD_SHARED']
    ], 'e2e-fourth-set');
    venn.refreshDiagram?.();
    const warning = root.querySelector('#vennSetLimitWarning');
    if (!warning) {
      throw new Error('Missing Venn set-limit warning');
    }
    if ((mode === 'venn' && warning.hidden) || (mode === 'upset' && !warning.hidden)) {
      throw new Error(`Unexpected set-limit warning state for ${mode} mode`);
    }
    return tabId;
  }, plotType);
}

async function activateWelcome(page) {
  await page.evaluate(() => {
    const welcome = window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.isWelcome);
    if (!welcome?.id) {
      throw new Error('Welcome tab not found');
    }
    return window.Main.tabs.activateTab(welcome.id, { reason: 'e2e-venn-fourth-set-away' });
  });
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState;
    return !!workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId)?.isWelcome;
  }, null, { timeout: 20_000 });
}

async function activateVenn(page, tabId) {
  await page.evaluate((id) => window.Main.tabs.activateTab(id, { reason: 'e2e-venn-fourth-set-return' }), tabId);
  await page.waitForFunction((id) => {
    const workspace = window.Main?.session?.workspaceState;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'venn') || null;
    const hot = window.Components?.venn?.__getState?.()?.ui?.hot || null;
    return workspace?.activeTabId === id && !!root && !!hot;
  }, tabId, { timeout: 30_000 });
}

for (const plotType of ['venn', 'upset']) {
  test(`Venn fourth table column survives Welcome round-trip in ${plotType} mode`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, {
      type: 'venn',
      pageId: 'vennPage',
      exampleButtonId: 'sample'
    }, { first: true });
    await page.waitForFunction(() => !!window.Components?.venn?.ready, null, { timeout: 45_000 });

    const tabId = await configureFourthSet(page, plotType);
    await page.waitForFunction((id) => {
      const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id);
      return tab?.payload?.data?.table?.[0]?.[3] === 'Set D'
        && tab?.payload?.data?.table?.[1]?.[3] === 'D_ONLY'
        && tab?.payload?.data?.table?.[2]?.[3] === 'AD_SHARED';
    }, tabId, { timeout: 20_000 });

    await activateWelcome(page);
    await activateVenn(page, tabId);

    const restored = await page.evaluate((mode) => {
      const venn = window.Components?.venn;
      const matrix = venn?.__getState?.()?.ui?.hot?.getData?.() || [];
      const payload = venn?.getPayload?.({ skipDomRebind: true }) || null;
      const upsetLabels = mode === 'upset'
        ? (venn?.__testHooks?.getUpSetTableColumns?.().columns || []).map(column => column.label)
        : [];
      const warning = window.Shared?.workspaceTabs?.getMountedRoot?.(window.Main?.session?.workspaceState?.activeTabId, 'venn')
        ?.querySelector?.('#vennSetLimitWarning') || null;
      return {
        matrix,
        payloadTable: payload?.data?.table || null,
        plotType: payload?.style?.plotType || '',
        upsetLabels,
        warningHidden: warning ? warning.hidden : null
      };
    }, plotType);

    expect(restored.matrix[0][3]).toBe('Set D');
    expect(restored.matrix[1][3]).toBe('D_ONLY');
    expect(restored.matrix[2][3]).toBe('AD_SHARED');
    expect(restored.payloadTable[0][3]).toBe('Set D');
    expect(restored.payloadTable[1][3]).toBe('D_ONLY');
    expect(restored.payloadTable[2][3]).toBe('AD_SHARED');
    expect(restored.plotType).toBe(plotType);
    expect(restored.warningHidden).toBe(plotType === 'upset');
    if (plotType === 'upset') {
      expect(restored.upsetLabels).toContain('Set D');
    }
  });
}
