const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('Venn exclusions redraw and survive a Welcome round-trip', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, {
    type: 'venn',
    pageId: 'vennPage',
    exampleButtonId: 'sample'
  }, { first: true });
  await page.waitForFunction(() => {
    const state = window.Components?.venn?.__getState?.();
    return !!state?.ui?.hot?.__hotExclusionController;
  }, null, { timeout: 45_000 });
  await page.evaluate(() => {
    const venn = window.Components.venn;
    venn.__getState().ui.hot.setDataAtCell([
      [0, 0, 'Set A'], [0, 1, 'Set B'], [0, 2, 'Set C'],
      [1, 0, 'A1'], [1, 1, 'B1'], [1, 2, 'C1'],
      [2, 0, 'AB'], [2, 1, 'AB'],
      [3, 1, 'B2'], [3, 2, 'B2']
    ], 'e2e-venn-exclusion-seed');
    venn.refreshDiagram();
  });
  await page.waitForFunction(() => Number(window.Components?.venn?.__getState?.()?.analysis?.lastCounts?.nB) === 3);

  const source = await page.evaluate(() => {
    const workspace = window.Main.session.workspaceState;
    const state = window.Components.venn.__getState();
    const before = Number(state.analysis.lastCounts.nB);
    state.ui.hot.__hotExclusionController.markCells([{ row: 1, col: 1 }], true);
    return { tabId: workspace.activeTabId, before };
  });

  await page.waitForFunction(({ tabId, before }) => {
    const tab = window.Main.session.workspaceState.tabs.find(item => item?.id === tabId);
    const counts = window.Components.venn.__getState()?.analysis?.lastCounts;
    return Number(counts?.nB) === before - 1
      && tab?.payload?.exclusions?.cells?.some(pair => Number(pair?.[0]) === 1 && Number(pair?.[1]) === 1);
  }, source, { timeout: 20_000 });

  const renderedBefore = await page.locator('#vennPage:not([hidden]) #stage').textContent();
  expect(renderedBefore).toContain(`(${source.before - 1})`);

  await page.evaluate(() => {
    const welcome = window.Main.session.workspaceState.tabs.find(tab => tab?.isWelcome);
    return window.Main.tabs.activateTab(welcome.id, { reason: 'e2e-venn-exclusion-away' });
  });
  await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-venn-exclusion-return' }), source.tabId);

  await page.waitForFunction(({ tabId, before }) => {
    const workspace = window.Main.session.workspaceState;
    const state = window.Components.venn.__getState();
    const live = state.ui.hot?.exportExclusions?.();
    const tab = workspace.tabs.find(item => item?.id === tabId);
    return workspace.activeTabId === tabId
      && Number(state.analysis.lastCounts?.nB) === before - 1
      && live?.cells?.some(pair => Number(pair?.[0]) === 1 && Number(pair?.[1]) === 1)
      && tab?.payload?.exclusions?.cells?.some(pair => Number(pair?.[0]) === 1 && Number(pair?.[1]) === 1);
  }, source, { timeout: 30_000 });

  const restored = await page.evaluate(() => {
    const state = window.Components.venn.__getState();
    const payload = window.Components.venn.getPayload({ skipDomRebind: true });
    return {
      rawCell: state.ui.hot.getSourceData()[1][1],
      analysisCell: window.Shared.hot.getAnalysisData(state.ui.hot).data[1][1],
      payloadExclusions: payload.exclusions,
      renderedText: state.ui.stage.textContent
    };
  });
  expect(restored.rawCell).not.toBeNull();
  expect(restored.analysisCell).toBeNull();
  expect(restored.payloadExclusions.cells).toContainEqual([1, 1]);
  expect(restored.renderedText).toContain(`(${source.before - 1})`);
});
