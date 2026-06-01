const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('line headers keep selection stable when sorting value columns', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  await page.waitForFunction(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
    return !!(hot && hot.gridApi && hot.rootElement);
  });

  await page.evaluate(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
    if(!hot){
      return;
    }
    hot.setDataAtCell?.([
      [2, 1, '30'],
      [3, 1, '10'],
      [4, 1, '20']
    ], 'e2e-line-header-sort-seed');
  });

  const headerCell = page.locator('#lineHot .ag-header-cell[col-id="c1"]').first();
  const dragHandle = headerCell.locator('.hot-col-drag-handle').first();
  const label = headerCell.locator('.hot-ag-header-label').first();
  const headerAction = headerCell.locator('.hot-header-action').first();
  await expect(headerCell).toBeVisible();
  await expect(dragHandle).toBeVisible();
  await expect(headerAction).toBeVisible();

  const geometry = await page.evaluate(() => {
    const root = document.querySelector('#lineHot .ag-header-cell[col-id="c1"]');
    const handle = root?.querySelector('.hot-col-drag-handle');
    const label = root?.querySelector('.hot-ag-header-label');
    const action = root?.querySelector('.hot-header-action');
    const rect = node => node?.getBoundingClientRect?.() || null;
    return {
      handle: rect(handle),
      label: rect(label),
      action: rect(action)
    };
  });
  expect(geometry.handle).toBeTruthy();
  expect(geometry.label).toBeTruthy();
  expect(geometry.action).toBeTruthy();
  expect(geometry.action.left).toBeGreaterThan(geometry.label.left);
  expect(geometry.handle.left).toBeLessThan(geometry.label.left);

  const readDisplayedDataOrder = async () => {
    return await page.evaluate(() => {
      const line = window.Components?.line;
      const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
      const api = hot?.gridApi;
      if(!api || typeof api.getDisplayedRowCount !== 'function' || typeof api.getDisplayedRowAtIndex !== 'function'){
        return [];
      }
      const values = [];
      const count = api.getDisplayedRowCount();
      for(let i = 0; i < count && values.length < 3; i += 1){
        const node = api.getDisplayedRowAtIndex(i);
        const physicalRow = Number(node?.data?.__rowIndex ?? node?.rowIndex);
        if(!Number.isInteger(physicalRow) || physicalRow <= 1){
          continue;
        }
        const value = api.getValue?.('c1', node);
        values.push(String(value ?? ''));
      }
      return values;
    });
  };

  const readSelectionVisualState = async () => {
    return await page.evaluate(() => {
      const line = window.Components?.line;
      const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
      if(!hot || !hot.rootElement){
        return null;
      }
      const selected = hot.getSelectedLast?.() || null;
      const outline = hot.rootElement.querySelector('.hot-selection-outline');
      const handle = hot.rootElement.querySelector('.hot-fill-handle');
      const outlineStyle = outline ? window.getComputedStyle(outline) : null;
      const handleStyle = handle ? window.getComputedStyle(handle) : null;
      const borderBottomColor = String(outlineStyle?.borderBottomColor || '').replace(/\s+/g, '').toLowerCase();
      const borderBottomVisible = !!outlineStyle
        && outlineStyle.display !== 'none'
        && outlineStyle.borderBottomStyle !== 'none'
        && borderBottomColor !== 'transparent'
        && borderBottomColor !== 'rgba(0,0,0,0)';
      const handleVisible = !!handleStyle
        && handleStyle.display !== 'none'
        && Number.parseFloat(handleStyle.width || '0') > 0
        && Number.parseFloat(handleStyle.height || '0') > 0;
      return {
        selected,
        borderBottomVisible,
        handleVisible
      };
    });
  };

  const applySortToValueColumn = async (sortDirection) => {
    await page.evaluate((direction) => {
      const line = window.Components?.line;
      const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
      const gridApi = hot?.gridApi || null;
      const columnApi = hot?.columnApi || gridApi;
      const state = direction ? [{ colId: 'c1', sort: direction }] : [{ colId: 'c1', sort: null }];
      if (columnApi && typeof columnApi.applyColumnState === 'function') {
        columnApi.applyColumnState({
          state,
          defaultState: { sort: null }
        });
        return;
      }
      if (gridApi && typeof gridApi.setSortModel === 'function') {
        gridApi.setSortModel(direction ? [{ colId: 'c1', sort: direction }] : []);
      }
    }, sortDirection);
  };

  const readSortState = async () => {
    return await page.evaluate(() => {
      const line = window.Components?.line;
      const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
      const api = hot?.columnApi || hot?.gridApi;
      if (!api || typeof api.getColumn !== 'function') {
        return null;
      }
      const col = api.getColumn('c1');
      if (!col || typeof col.getSort !== 'function') {
        return null;
      }
      return col.getSort();
    });
  };

  await page.evaluate(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
    hot?.selectCell?.(4, 2);
  });
  const selectionBeforeSort = await readSelectionVisualState();
  expect(Array.isArray(selectionBeforeSort?.selected)).toBe(true);

  const initialOrder = await readDisplayedDataOrder();
  await label.click();
  await expect.poll(async () => {
    const order = await readDisplayedDataOrder();
    return order.join(',');
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toBe(initialOrder.join(','));
  let selectionAfterHeaderClick = null;
  await expect.poll(async () => {
    selectionAfterHeaderClick = await readSelectionVisualState();
    return selectionAfterHeaderClick;
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toBeTruthy();
  expect(Array.isArray(selectionAfterHeaderClick?.selected)).toBe(true);
  expect(selectionAfterHeaderClick.selected.length).toBe(4);
  expect(selectionAfterHeaderClick.selected[0]).toBe(0);
  expect(selectionAfterHeaderClick.selected[1]).toBe(1);
  expect(selectionAfterHeaderClick.selected[3]).toBe(1);
  expect(selectionAfterHeaderClick.selected[2]).toBeGreaterThan(0);

  await applySortToValueColumn('asc');
  await expect.poll(async () => {
    const order = await readDisplayedDataOrder();
    return order.join(',');
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toBe('10,20,30');
  await expect.poll(async () => {
    return await readSelectionVisualState();
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toMatchObject({
    selected: selectionAfterHeaderClick.selected
  });

  await applySortToValueColumn('desc');
  await expect.poll(async () => {
    const order = await readDisplayedDataOrder();
    return order.join(',');
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toBe('30,20,10');
  await expect.poll(async () => {
    return await readSelectionVisualState();
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toMatchObject({
    selected: selectionAfterHeaderClick.selected
  });

  await expect.poll(async () => {
    return await readSortState();
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toBe('desc');
  await expect(headerAction).toHaveClass(/is-sorted-desc/);

  expect(issues.critical).toEqual([]);
});
