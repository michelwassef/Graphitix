const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

const CASES = [
  {
    type: 'box',
    pageId: 'boxPage',
    tableSelector: '#hot',
    formatId: 'boxTableFormat',
    replicatesId: 'boxGroupedReplicates',
    groupStartSelector: '.ag-header-cell.box-group-colheader-merge-start',
    groupFollowerSelector: '.ag-header-cell.box-group-colheader-merge-middle, .ag-header-cell.box-group-colheader-merge-end',
    groupEndSelector: '.ag-header-cell.box-group-colheader-merge-end'
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    tableSelector: '#scatterHot',
    formatId: 'scatterTableFormat',
    replicatesId: 'scatterReplicates',
    groupStartSelector: '.ag-header-cell.scatter-group-colheader-merge-start',
    groupFollowerSelector: '.ag-header-cell.scatter-group-colheader-merge-middle, .ag-header-cell.scatter-group-colheader-merge-end',
    groupEndSelector: '.ag-header-cell.scatter-group-colheader-merge-end'
  },
  {
    type: 'line',
    pageId: 'linePage',
    tableSelector: '#lineHot',
    formatId: 'lineTableFormat',
    replicatesId: 'lineReplicates',
    groupStartSelector: '.ag-header-cell.line-group-colheader-merge-start',
    groupFollowerSelector: '.ag-header-cell.line-group-colheader-merge-middle, .ag-header-cell.line-group-colheader-merge-end',
    groupEndSelector: '.ag-header-cell.line-group-colheader-merge-end'
  },
  {
    type: 'pca',
    pageId: 'pcaPage',
    tableSelector: '#pcaHot',
    formatId: 'pcaTableFormat',
    replicatesId: 'pcaGroupedReplicates',
    groupStartSelector: '.ag-header-cell.pca-group-colheader-merge-start',
    groupFollowerSelector: '.ag-header-cell.pca-group-colheader-merge-middle, .ag-header-cell.pca-group-colheader-merge-end',
    groupEndSelector: '.ag-header-cell.pca-group-colheader-merge-end'
  }
];

async function configureGroupedMode(page, component) {
  await page.evaluate(({ formatId, replicatesId }) => {
    const format = document.getElementById(formatId);
    const replicates = document.getElementById(replicatesId);
    if (!format || !replicates) {
      throw new Error(`Grouped controls unavailable: ${formatId}, ${replicatesId}`);
    }
    format.value = 'grouped';
    format.dispatchEvent(new Event('change', { bubbles: true }));
    replicates.value = '2';
    replicates.dispatchEvent(new Event('input', { bubbles: true }));
    replicates.dispatchEvent(new Event('change', { bubbles: true }));
  }, component);

  await page.waitForFunction(({ tableSelector, groupStartSelector }) => {
    const table = document.querySelector(tableSelector);
    const starts = table ? Array.from(table.querySelectorAll(groupStartSelector)) : [];
    return starts.length > 0 && starts.every(cell => {
      const handle = cell.querySelector('.hot-col-drag-handle--group-anchor');
      return !!handle && window.getComputedStyle(handle).display !== 'none';
    });
  }, component, { timeout: 20_000 });
}

for (const component of CASES) {
  test(`${component.type} grouped headers expose exactly one visible drag handle per rendered group`, async ({ page }) => {
    test.setTimeout(90_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: component.type, pageId: component.pageId }, { first: true });
    await configureGroupedMode(page, component);

    const snapshot = await page.evaluate(({ tableSelector, groupStartSelector, groupFollowerSelector }) => {
      const table = document.querySelector(tableSelector);
      if (!table) {
        return null;
      }
      const isRendered = node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const starts = Array.from(table.querySelectorAll(groupStartSelector)).filter(isRendered);
      const followers = Array.from(table.querySelectorAll(groupFollowerSelector)).filter(isRendered);
      const isVisibleHandle = handle => !!handle
        && !handle.classList.contains('hot-col-drag-handle--hidden')
        && window.getComputedStyle(handle).display !== 'none';
      const anchorHandles = starts.map(cell => cell.querySelector('.hot-col-drag-handle'));
      const followerHandles = followers.map(cell => cell.querySelector('.hot-col-drag-handle'));
      const firstHandleRect = anchorHandles[0]?.getBoundingClientRect?.() || null;
      const firstLabelRect = starts[0]?.querySelector('.hot-ag-header-label')?.getBoundingClientRect?.() || null;
      return {
        renderedGroups: starts.length,
        visibleAnchorHandles: anchorHandles.filter(isVisibleHandle).length,
        visibleFollowerHandles: followerHandles.filter(isVisibleHandle).length,
        allAnchorsMarked: anchorHandles.every(handle => handle?.classList.contains('hot-col-drag-handle--group-anchor')),
        allFollowersHidden: followerHandles.every(handle => handle?.classList.contains('hot-col-drag-handle--hidden')),
        firstHandleLeft: firstHandleRect?.left ?? null,
        firstLabelLeft: firstLabelRect?.left ?? null
      };
    }, component);

    expect(snapshot).toBeTruthy();
    expect(snapshot.renderedGroups).toBeGreaterThan(0);
    expect(snapshot.visibleAnchorHandles).toBe(snapshot.renderedGroups);
    expect(snapshot.visibleFollowerHandles).toBe(0);
    expect(snapshot.allAnchorsMarked).toBe(true);
    expect(snapshot.allFollowersHidden).toBe(true);
    expect(snapshot.firstHandleLeft).not.toBeNull();
    expect(snapshot.firstLabelLeft).not.toBeNull();
    expect(snapshot.firstHandleLeft).toBeLessThan(snapshot.firstLabelLeft);
    expect(issues.critical).toEqual([]);
  });
}

for (const component of CASES) {
  test(`${component.type} grouped headers suppress internal resize hit areas and keep the group outer edge resizable`, async ({ page }) => {
    test.setTimeout(90_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: component.type, pageId: component.pageId }, { first: true });
    await configureGroupedMode(page, component);

    const snapshot = await page.evaluate(({ tableSelector, groupStartSelector, groupEndSelector }) => {
      const table = document.querySelector(tableSelector);
      if (!table) {
        return null;
      }
      const isRendered = node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const inspectResizeHandle = cell => {
        const handle = cell.querySelector('.ag-header-cell-resize');
        if (!handle) {
          return { exists: false, hiddenClass: false, display: null, pointerEvents: null };
        }
        const style = window.getComputedStyle(handle);
        return {
          exists: true,
          hiddenClass: handle.classList.contains('ag-hidden'),
          display: style.display,
          pointerEvents: style.pointerEvents
        };
      };
      const internalBoundaries = Array.from(table.querySelectorAll(groupStartSelector))
        .filter(isRendered)
        .map(inspectResizeHandle);
      const outerBoundaries = Array.from(table.querySelectorAll(groupEndSelector))
        .filter(isRendered)
        .map(inspectResizeHandle);
      return { internalBoundaries, outerBoundaries };
    }, component);

    expect(snapshot).toBeTruthy();
    expect(snapshot.internalBoundaries.length).toBeGreaterThan(0);
    expect(snapshot.outerBoundaries.length).toBeGreaterThan(0);
    for (const handle of snapshot.internalBoundaries) {
      expect(handle.exists).toBe(true);
      expect(handle.hiddenClass).toBe(true);
      expect(handle.display).toBe('none');
    }
    for (const handle of snapshot.outerBoundaries) {
      expect(handle.exists).toBe(true);
      expect(handle.hiddenClass).toBe(false);
      expect(handle.display).not.toBe('none');
      expect(handle.pointerEvents).not.toBe('none');
    }
    expect(issues.critical).toEqual([]);
  });
}

test('line grouped headers stay normalized while horizontal capacity grows', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  const linePage = page.locator('#linePage:not([hidden])');
  await linePage.locator('#lineTableFormat').selectOption('grouped');
  await linePage.locator('#lineReplicates').fill('2');
  await linePage.locator('#lineReplicates').press('Enter');
  await page.waitForFunction(() => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId;
    const hot = tabId
      ? window.Shared?.hot?.__tabTablePools?.line?.byTab?.[tabId]?.instance
      : null;
    return hot?.__lineTableFormat === 'grouped'
      && hot?.rootElement?.classList?.contains('line-grouped-header-merge');
  });

  const snapshot = await page.evaluate(async () => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId;
    const hot = tabId
      ? window.Shared?.hot?.__tabTablePools?.line?.byTab?.[tabId]?.instance
      : null;
    const viewport = hot?.rootElement?.querySelector?.('.ag-body-horizontal-scroll-viewport');
    if (!hot || !viewport) {
      throw new Error('Line grouped table unavailable');
    }
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
    const payloadBefore = JSON.stringify(tab?.payload?.data || null);
    viewport.scrollLeft = viewport.scrollWidth;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 260));
    const count = hot.countCols();
    return {
      count,
      labels: Array.from({ length: count }, (_, index) => hot.getColHeader(index)),
      payloadBefore,
      payloadAfter: JSON.stringify(tab?.payload?.data || null)
    };
  });

  const expectedLabels = Array.from({ length: snapshot.count }, (_, index) => {
    if (index === 0) {
      return 'X values';
    }
    return (index - 1) % 2 === 0
      ? `Group ${Math.floor((index - 1) / 2) + 1}`
      : ' ';
  });
  expect(snapshot.labels).toEqual(expectedLabels);
  expect(snapshot.payloadAfter).toBe(snapshot.payloadBefore);
});

test('pca grouped headers stay normalized while horizontal capacity grows', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' }, { first: true });
  await configureGroupedMode(page, CASES.find(item => item.type === 'pca'));

  const snapshot = await page.evaluate(async () => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId;
    const hot = tabId
      ? window.Shared?.hot?.__tabTablePools?.pca?.byTab?.[tabId]?.instance
      : null;
    const viewport = hot?.rootElement?.querySelector?.('.ag-body-horizontal-scroll-viewport');
    if (!hot || !viewport) {
      throw new Error('PCA grouped table unavailable');
    }
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
    const payloadBefore = JSON.stringify(tab?.payload?.data || null);
    viewport.scrollLeft = viewport.scrollWidth;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 260));
    const count = hot.countCols();
    return {
      count,
      labels: Array.from({ length: count }, (_, index) => hot.getColHeader(index)),
      payloadBefore,
      payloadAfter: JSON.stringify(tab?.payload?.data || null)
    };
  });

  const expectedLabels = Array.from({ length: snapshot.count }, (_, index) => {
    if (index === 0) {
      return '';
    }
    return (index - 1) % 2 === 0
      ? `Group ${Math.floor((index - 1) / 2) + 1}`
      : ' ';
  });
  expect(snapshot.labels).toEqual(expectedLabels);
  expect(snapshot.payloadAfter).toBe(snapshot.payloadBefore);
});
