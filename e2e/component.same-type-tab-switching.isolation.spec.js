const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
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

async function readGridSnapshot(page, pageId, componentType) {
  return page.evaluate(({ id, type }) => {
    const pageRoot = document.querySelector(`#${id}:not([hidden])`);
    const activeTab = document.querySelector('#workspaceTabsList .workspace-tab.workspace-tab--active');
    const allIds = Array.from(pageRoot?.querySelectorAll?.('[id]') || []).map(node => node.id);
    const wrapperId = allIds.find(value => /hotwrapper$/i.test(value)) || null;
    const hotId = allIds.find(value => /hot$/i.test(value) && !/wrapper$/i.test(value)) || null;
    const wrapper = wrapperId ? pageRoot.querySelector(`#${wrapperId}`) : null;
    const hot = hotId ? pageRoot.querySelector(`#${hotId}`) : null;
    const agRoot = hot?.querySelector?.('.ag-root-wrapper, .ag-root') || null;
    const verticalViewport = hot?.querySelector?.('.ag-body-vertical-scroll-viewport') || null;
    const scrollTop = verticalViewport ? Number(verticalViewport.scrollTop || 0) : 0;
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
      hotPoolState = {
        currentTabId: pool.currentTabId || null,
        tabIds: Object.keys(byTab),
        instanceCount: Object.values(byTab).filter(entry => !!entry?.instance).length
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
      firstVisibleRow,
      topDelta: wrapperRect && hotRect ? Number((hotRect.top - wrapperRect.top).toFixed(2)) : null,
      hotApiState,
      hotPoolState
    };
  }, { id: pageId, type: componentType });
}

async function scrollGridDown(page, pageId) {
  await page.evaluate((id) => {
    const pageRoot = document.querySelector(`#${id}:not([hidden])`);
    const hot = Array.from(pageRoot?.querySelectorAll?.('[id]') || [])
      .find(node => /hot$/i.test(node.id) && !/wrapper$/i.test(node.id));
    const viewport = hot?.querySelector?.('.ag-body-vertical-scroll-viewport');
    if (viewport) {
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight - 20);
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  }, pageId);
  await page.waitForTimeout(300);
}

async function scrollGridTop(page, pageId) {
  await page.evaluate((id) => {
    const pageRoot = document.querySelector(`#${id}:not([hidden])`);
    const hot = Array.from(pageRoot?.querySelectorAll?.('[id]') || [])
      .find(node => /hot$/i.test(node.id) && !/wrapper$/i.test(node.id));
    const viewport = hot?.querySelector?.('.ag-body-vertical-scroll-viewport');
    if (viewport) {
      viewport.scrollTop = 0;
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    const grid = window.Components?.scatter?.__getActiveHot?.() || window.Components?.surface?.__getActiveHot?.() || null;
    if (grid?.gridApi && typeof grid.gridApi.ensureIndexVisible === 'function') {
      grid.gridApi.ensureIndexVisible(0, 'top');
    }
  }, pageId);
  await page.waitForTimeout(300);
}

async function openComponentTab(page, component, { first = false } = {}) {
  if (first) {
    const card = page.locator(`#graphSelectionGrid [data-graph-type="${component.type}"]`).first();
    await expect(card).toBeVisible();
    await card.click({ force: true });
    await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
    return;
  }
  await page.evaluate(async (type) => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const maybe = tabs.handleGraphSelection(type, { reason: 'e2e-same-component-switch' });
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const duplicateEmpty = document.querySelector('#duplicateEmpty');
    if (prompt && duplicateEmpty && !duplicateEmpty.disabled) {
      duplicateEmpty.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, component.type);
  const visibleCard = page.locator(`#graphSelectionGrid [data-graph-type="${component.type}"]`).first();
  if (await visibleCard.isVisible().catch(() => false)) {
    await visibleCard.click({ force: true });
  }
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
}

for (const component of COMPONENT_MATRIX) {
  test(`same-component tab switching stays isolated for ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    const beforeFirst = new Set(await getWorkspaceTabIds(page));
    await openComponentTab(page, component, { first: true });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await page.waitForTimeout(350);
    const afterFirst = await getWorkspaceTabIds(page);
    const firstNew = afterFirst.find(id => !beforeFirst.has(id));
    expect(firstNew).toBeTruthy();

    const beforeSecond = new Set(afterFirst);
    await openComponentTab(page, component, { first: false });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await page.waitForTimeout(350);
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
    await scrollGridDown(page, component.pageId);
    await capture('first-active');
    await activateTabById(page, secondNew);
    await scrollGridTop(page, component.pageId);
    await capture('second-active');
    await activateTabById(page, firstNew);
    await capture('first-active-again');
    await activateTabById(page, secondNew);
    await capture('second-active-again');
    if (component.type === 'scatter' || component.type === 'surface') {
      // eslint-disable-next-line no-console
      console.log(`[debug ${component.type}] snapshots`, JSON.stringify(snapshots));
    }

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
      expect(first.scrollTop).toBeGreaterThan(50);
      expect(second.scrollTop).toBeLessThan(20);
      expect(secondAgain.scrollTop).toBeLessThan(20);
      if (Number.isFinite(first.topDelta) && Number.isFinite(second.topDelta)) {
        expect(Math.abs(second.topDelta - first.topDelta)).toBeLessThan(8);
      }
      if (Number.isFinite(first.topDelta) && Number.isFinite(firstAgain.topDelta)) {
        expect(Math.abs(firstAgain.topDelta - first.topDelta)).toBeLessThan(8);
      }
      if (Number.isFinite(first.firstVisibleRow)) {
        expect(first.firstVisibleRow).toBeGreaterThan(1);
      }
      if (Number.isFinite(second.firstVisibleRow)) {
        expect(second.firstVisibleRow).toBeLessThan(5);
      }
    }
    expect(issues.critical).toEqual([]);
  });
}
