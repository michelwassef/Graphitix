const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const SCATTER = COMPONENT_MATRIX.find(item => item.type === 'scatter');

async function openScatter(page, first) {
  await openComponentFromWelcome(page, SCATTER, { first });
  await page.waitForSelector('#scatterPage:not([hidden])', { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, SCATTER.exampleButtonId);
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const hot = tab?.type === 'scatter'
      ? window.Shared?.hot?.__tabTablePools?.scatter?.byTab?.[tab.id]?.instance
      : null;
    return !!hot && Array.isArray(hot.getData?.()) && hot.getData().length > 1
      && Array.isArray(tab?.payload?.data) && tab.payload.data.length > 1;
  }, null, { timeout: 90_000 });
}

test('scatter color-scheme application preserves the owner AG Grid and its data', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openScatter(page, true);
  await openScatter(page, false);

  const result = await page.evaluate(async () => {
    const session = window.Main.session;
    const component = window.Main.components.registry.scatter;
    const tab = session.workspaceState.tabs.find(item => item.id === session.workspaceState.activeTabId);
    const before = session.clonePayload(tab.payload);
    const ownerHot = window.Shared?.hot?.__tabTablePools?.scatter?.byTab?.[tab.id]?.instance || null;
    if(!ownerHot) throw new Error(`Missing owner-scoped Scatter grid for ${tab.id}`);
    const beforeData = ownerHot.getData();
    const next = session.clonePayload(before);
    next.config = { ...(next.config || {}), colorScheme: next.config?.colorScheme === 'scientific' ? 'bright' : 'scientific' };
    component.applyColorSchemePayload(next, { tab, tabId: tab.id, reason: 'e2e-color-scheme-grid-isolation' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const root = window.Shared.workspaceTabs.getMountedRoot(tab.id, 'scatter');
    const wrapper = root?.querySelector('#scatterHotWrapper');
    const container = root?.querySelector('#scatterHot');
    const hot = window.Shared?.hot?.__tabTablePools?.scatter?.byTab?.[tab.id]?.instance || null;
    return {
      wrapperConnected: !!wrapper?.isConnected,
      containerConnected: !!container?.isConnected,
      wrapperWidth: wrapper?.getBoundingClientRect?.().width || 0,
      containerWidth: container?.getBoundingClientRect?.().width || 0,
      sameData: JSON.stringify(hot?.getData?.() || null) === JSON.stringify(beforeData),
      ownerTabId: hot?.__scatterTabId || null,
      tabId: tab.id
    };
  });

  expect(result.wrapperConnected).toBe(true);
  expect(result.containerConnected).toBe(true);
  expect(result.wrapperWidth).toBeGreaterThan(100);
  expect(result.containerWidth).toBeGreaterThan(100);
  expect(result.sameData).toBe(true);
  expect(result.ownerTabId).toBe(result.tabId);
});
