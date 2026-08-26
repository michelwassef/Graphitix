const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  installParameterIsolationHarness,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForTimeout(300);
}

async function waitForActiveGrid(page, pageId, componentType) {
  await page.waitForFunction(({ id, type }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const pageRoot = active?.type === type
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || document.querySelector(`#${id}:not([hidden])`))
      : null;
    return !!pageRoot?.querySelector?.('.ag-root-wrapper, .ag-root');
  }, { id: pageId, type: componentType }, { timeout: 20_000 });
}

async function readGridSnapshot(page, pageId, componentType) {
  await waitForActiveGrid(page, pageId, componentType);
  return page.evaluate(({ id, type }) => {
    const state = window.Main?.session?.workspaceState;
    const activeWorkspaceTab = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const pageRoot = activeWorkspaceTab?.type === type
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(activeWorkspaceTab.id, type) || document.querySelector(`#${id}:not([hidden])`))
      : null;
    const activeTab = document.querySelector('#workspaceTabsList .workspace-tab.workspace-tab--active');
    const allIds = Array.from(pageRoot?.querySelectorAll?.('[id]') || []).map(node => node.id);
    const wrapperId = allIds.find(value => /hotwrapper$/i.test(value)) || null;
    const hotId = allIds.find(value => /hot$/i.test(value) && !/wrapper$/i.test(value))
      || pageRoot?.querySelector?.('.ag-root-wrapper, .ag-root')?.closest?.('[id]')?.id
      || null;
    const wrapper = wrapperId ? pageRoot.querySelector(`#${wrapperId}`) : null;
    const hot = hotId ? pageRoot.querySelector(`#${hotId}`) : null;
    const agRoot = hot?.querySelector?.('.ag-root-wrapper, .ag-root') || null;
    const verticalViewport = hot?.querySelector?.('.ag-body-vertical-scroll-viewport') || null;
    const scrollTop = verticalViewport ? Number(verticalViewport.scrollTop || 0) : 0;
    const scrollRange = verticalViewport
      ? Math.max(0, Number(verticalViewport.scrollHeight || 0) - Number(verticalViewport.clientHeight || 0))
      : 0;
    const visibleRows = Array.from(hot?.querySelectorAll?.('.ag-center-cols-container .ag-row[data-row-index]') || [])
      .map(row => Number(row.getAttribute('data-row-index')))
      .filter(Number.isFinite);
    const firstVisibleRow = visibleRows.length ? Math.min(...visibleRows) : null;
    const wrapperRect = wrapper?.getBoundingClientRect?.() || null;
    const hotRect = hot?.getBoundingClientRect?.() || null;
    const resolvedActiveTabId = window.Shared?.hot?.resolveActiveTabId?.() || null;
    let hotApiState = null;
    let hotPoolState = null;
    const pool = window.Shared?.hot?.__tabTablePools?.[type] || null;
    if (pool && typeof pool === 'object') {
      const byTab = pool.byTab && typeof pool.byTab === 'object' ? pool.byTab : {};
      const activeEntry = activeWorkspaceTab?.id ? byTab[activeWorkspaceTab.id] : null;
      const activeInstance = activeEntry?.instance || null;
      hotPoolState = {
        currentTabId: pool.currentTabId || null,
        tabIds: Object.keys(byTab),
        instanceCount: Object.values(byTab).filter(entry => !!entry?.instance).length,
        firstDisplayedRow: Number.isFinite(activeInstance?.gridApi?.getFirstDisplayedRow?.())
          ? activeInstance.gridApi.getFirstDisplayedRow()
          : null
      };
    }
    if (type === 'scatter' && typeof window.Components?.scatter?.__getActiveHot === 'function') {
      const activeHot = window.Components.scatter.__getActiveHot();
      hotApiState = {
        componentTabId: activeHot?.__scatterTabId || null,
        firstDisplayedRow: Number.isFinite(activeHot?.gridApi?.getFirstDisplayedRow?.()) ? activeHot.gridApi.getFirstDisplayedRow() : null
      };
    } else if (type === 'surface' && typeof window.Components?.surface?.__getActiveHot === 'function') {
      const activeHot = window.Components.surface.__getActiveHot();
      hotApiState = {
        componentTabId: activeHot?.__surfaceTabId || null,
        firstDisplayedRow: Number.isFinite(activeHot?.gridApi?.getFirstDisplayedRow?.()) ? activeHot.gridApi.getFirstDisplayedRow() : null
      };
    }
    return {
      activeTabId: activeTab?.getAttribute('data-tab-id') || null,
      resolvedActiveTabId,
      hasPageRoot: !!pageRoot,
      hasAgRoot: !!agRoot,
      wrapperId,
      hotId,
      scrollTop,
      scrollRange,
      firstVisibleRow,
      topDelta: wrapperRect && hotRect ? Number((hotRect.top - wrapperRect.top).toFixed(2)) : null,
      hotApiState,
      hotPoolState
    };
  }, { id: pageId, type: componentType });
}

async function scrollGridDown(page, pageId) {
  await page.evaluate((id) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const pageRoot = active?.type
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, active.type) || document.querySelector(`#${id}:not([hidden])`))
      : null;
    const hot = Array.from(pageRoot?.querySelectorAll?.('[id]') || [])
      .find(node => /hot$/i.test(node.id) && !/wrapper$/i.test(node.id))
      || pageRoot?.querySelector?.('.ag-root-wrapper, .ag-root')?.closest?.('[id]')
      || null;
    const viewport = hot?.querySelector?.('.ag-body-vertical-scroll-viewport');
    if (viewport) {
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight - 20);
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    const pool = active?.type ? window.Shared?.hot?.__tabTablePools?.[active.type] : null;
    const activeGrid = active?.id ? pool?.byTab?.[active.id]?.instance : null;
    if (activeGrid?.gridApi && typeof activeGrid.gridApi.ensureIndexVisible === 'function') {
      const rowCount = Number.isFinite(activeGrid.gridApi.getDisplayedRowCount?.())
        ? activeGrid.gridApi.getDisplayedRowCount()
        : 100;
      activeGrid.gridApi.ensureIndexVisible(Math.max(0, rowCount - 2), 'bottom');
    }
  }, pageId);
  await page.waitForTimeout(300);
}

async function scrollGridTop(page, pageId) {
  await page.evaluate((id) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const pageRoot = active?.type
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, active.type) || document.querySelector(`#${id}:not([hidden])`))
      : null;
    const hot = Array.from(pageRoot?.querySelectorAll?.('[id]') || [])
      .find(node => /hot$/i.test(node.id) && !/wrapper$/i.test(node.id))
      || pageRoot?.querySelector?.('.ag-root-wrapper, .ag-root')?.closest?.('[id]')
      || null;
    const viewport = hot?.querySelector?.('.ag-body-vertical-scroll-viewport');
    if (viewport) {
      viewport.scrollTop = 0;
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    const grid = window.Components?.scatter?.__getActiveHot?.() || window.Components?.surface?.__getActiveHot?.() || null;
    if (grid?.gridApi && typeof grid.gridApi.ensureIndexVisible === 'function') {
      grid.gridApi.ensureIndexVisible(0, 'top');
    }
    const pool = active?.type ? window.Shared?.hot?.__tabTablePools?.[active.type] : null;
    const activeGrid = active?.id ? pool?.byTab?.[active.id]?.instance : null;
    if (activeGrid?.gridApi && typeof activeGrid.gridApi.ensureIndexVisible === 'function') {
      activeGrid.gridApi.ensureIndexVisible(0, 'top');
    }
  }, pageId);
  await page.waitForTimeout(300);
}

async function openComponentTab(page, component, { first = false } = {}) {
  await openComponentFromWelcome(page, component, { first });
}

for (const component of COMPONENT_MATRIX) {
  test(`same-component tab switching stays isolated for ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await installParameterIsolationHarness(page);

    const beforeFirst = new Set(await getWorkspaceTabIds(page));
    await openComponentTab(page, component, { first: true });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await waitForActiveGrid(page, component.pageId, component.type);
    const afterFirst = await getWorkspaceTabIds(page);
    const firstNew = afterFirst.find(id => !beforeFirst.has(id));
    expect(firstNew).toBeTruthy();

    const beforeSecond = new Set(afterFirst);
    await openComponentTab(page, component, { first: false });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await waitForActiveGrid(page, component.pageId, component.type);
    const afterSecond = await getWorkspaceTabIds(page);
    const secondNew = afterSecond.find(id => !beforeSecond.has(id));
    expect(secondNew).toBeTruthy();
    expect(secondNew).not.toBe(firstNew);

    const snapshots = [];
    const capture = async (label) => {
      const shot = await readGridSnapshot(page, component.pageId, component.type);
      snapshots.push({ stepLabel: label, ...shot });
    };

    await activateTabById(page, firstNew);
    await waitForActiveGrid(page, component.pageId, component.type);
    await scrollGridDown(page, component.pageId);
    await capture('first-active');
    await activateTabById(page, secondNew);
    await waitForActiveGrid(page, component.pageId, component.type);
    await scrollGridTop(page, component.pageId);
    await capture('second-active');
    await activateTabById(page, firstNew);
    await waitForActiveGrid(page, component.pageId, component.type);
    await capture('first-active-again');
    await activateTabById(page, secondNew);
    await waitForActiveGrid(page, component.pageId, component.type);
    await capture('second-active-again');
    await testInfo.attach(`${component.type}-same-component-switching.snapshots.json`, {
      body: Buffer.from(JSON.stringify(snapshots, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    for (const snap of snapshots) {
      expect(snap.hasPageRoot).toBeTruthy();
      expect(snap.hasAgRoot).toBeTruthy();
    }
    const first = snapshots.find(s => s.stepLabel === 'first-active');
    const second = snapshots.find(s => s.stepLabel === 'second-active');
    const firstAgain = snapshots.find(s => s.stepLabel === 'first-active-again');
    const secondAgain = snapshots.find(s => s.stepLabel === 'second-active-again');
    if (first && second && firstAgain && secondAgain) {
      const firstPosition = Number.isFinite(first.firstVisibleRow) ? first.firstVisibleRow : first.hotPoolState?.firstDisplayedRow;
      const secondPosition = Number.isFinite(second.firstVisibleRow) ? second.firstVisibleRow : second.hotPoolState?.firstDisplayedRow;
      const secondAgainPosition = Number.isFinite(secondAgain.firstVisibleRow) ? secondAgain.firstVisibleRow : secondAgain.hotPoolState?.firstDisplayedRow;
      const canAssertFirstMoved = Number(first.scrollRange) > 50 || Number(first.hotPoolState?.firstDisplayedRow) > 1;
      const firstMoved = first.scrollTop > 50 || (Number.isFinite(firstPosition) && firstPosition > 1);
      const secondAtTop = second.scrollTop < 20 || (Number.isFinite(secondPosition) && secondPosition < 5);
      const secondAgainAtTop = secondAgain.scrollTop < 20 || (Number.isFinite(secondAgainPosition) && secondAgainPosition < 5);
      if (canAssertFirstMoved) {
        expect(firstMoved).toBeTruthy();
      }
      expect(secondAtTop).toBeTruthy();
      expect(secondAgainAtTop).toBeTruthy();
      if (Number.isFinite(first.topDelta) && Number.isFinite(second.topDelta)) {
        expect(Math.abs(second.topDelta - first.topDelta)).toBeLessThan(8);
      }
      if (Number.isFinite(first.topDelta) && Number.isFinite(firstAgain.topDelta)) {
        expect(Math.abs(firstAgain.topDelta - first.topDelta)).toBeLessThan(8);
      }
    }
    const parameterIsolation = await page.evaluate(async ({ type, tabAId, tabBId, parameterPaths }) => {
      return window.GraphitixParameterIsolation.runSameTypeIsolation({
        type,
        tabAId,
        tabBId,
        parameterPaths,
        reopen: true
      });
    }, {
      type: component.type,
      tabAId: firstNew,
      tabBId: secondNew,
      parameterPaths: String(process.env.PARAMETER_PATHS || '').split(',').map(value => value.trim()).filter(Boolean)
    });
    await testInfo.attach(`${component.type}-same-type-parameter-isolation.json`, {
      body: Buffer.from(JSON.stringify(parameterIsolation, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    expect(parameterIsolation.parameterCount, `${component.type}: no user-visible parameter leaves were discovered`).toBeGreaterThan(0);
    expect(parameterIsolation.uncovered, `${component.type}: user-state leaves lack an independent valid-value adapter`).toEqual([]);
    expect(parameterIsolation.exercisedCount, `${component.type}: not every discovered parameter was exercised independently`).toBe(parameterIsolation.parameterCount);
    expect(parameterIsolation.archiveCount, `${component.type}: parameter batches must share one archive/reopen`).toBe(1);
    expect(parameterIsolation.failures, `${component.type}: same-type parameter isolation defects`).toEqual([]);
    expect(issues.critical).toEqual([]);
  });
}
