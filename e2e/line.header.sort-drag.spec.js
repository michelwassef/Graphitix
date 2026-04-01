const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('line headers support sorting and drag reordering with visible left/right indicators', async ({ page }) => {
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
  const sortIndicator = headerCell.locator('.hot-sort-indicator').first();
  await expect(headerCell).toBeVisible();
  await expect(dragHandle).toBeVisible();
  await expect(sortIndicator).toBeVisible();

  const geometry = await page.evaluate(() => {
    const root = document.querySelector('#lineHot .ag-header-cell[col-id="c1"]');
    const handle = root?.querySelector('.hot-col-drag-handle');
    const label = root?.querySelector('.hot-ag-header-label');
    const sort = root?.querySelector('.hot-sort-indicator');
    const rect = node => node?.getBoundingClientRect?.() || null;
    return {
      handle: rect(handle),
      label: rect(label),
      sort: rect(sort)
    };
  });
  expect(geometry.handle).toBeTruthy();
  expect(geometry.label).toBeTruthy();
  expect(geometry.sort).toBeTruthy();
  expect(geometry.handle.left).toBeLessThan(geometry.label.left);
  expect(geometry.sort.left).toBeGreaterThan(geometry.label.left);

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

  await label.click();
  await expect.poll(async () => {
    const order = await readDisplayedDataOrder();
    return order.join(',');
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toBe('10,20,30');

  await label.click();
  await expect.poll(async () => {
    const order = await readDisplayedDataOrder();
    return order.join(',');
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toBe('30,20,10');

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const line = window.Components?.line;
      const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
      const indicator = hot?.rootElement?.querySelector?.('.ag-header-cell[col-id="c1"] .hot-sort-indicator');
      if(!indicator){
        return null;
      }
      return {
        asc: indicator.classList.contains('is-asc'),
        desc: indicator.classList.contains('is-desc')
      };
    });
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toEqual({ asc: false, desc: true });

  const beforeOrder = await page.evaluate(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
    const api = hot?.columnApi || hot?.gridApi;
    return api?.getAllDisplayedColumns?.().map(col => col.getColId?.()) || [];
  });
  expect(beforeOrder.length).toBeGreaterThan(2);

  const dragSourceHeader = page.locator('#lineHot .ag-header-cell[col-id="c1"]').first();
  const targetHeader = page.locator('#lineHot .ag-header-cell[col-id="c2"]').first();
  await expect(dragSourceHeader).toBeVisible();
  await expect(targetHeader).toBeVisible();
  const sourceHeaderBox = await dragSourceHeader.boundingBox();
  const targetHeaderBox = await targetHeader.boundingBox();
  expect(sourceHeaderBox).toBeTruthy();
  expect(targetHeaderBox).toBeTruthy();

  await page.mouse.move(
    sourceHeaderBox.x + (sourceHeaderBox.width * 0.55),
    sourceHeaderBox.y + (sourceHeaderBox.height * 0.5)
  );
  await page.mouse.down();
  await page.mouse.move(
    targetHeaderBox.x + (targetHeaderBox.width * 0.8),
    targetHeaderBox.y + (targetHeaderBox.height * 0.5),
    { steps: 18 }
  );
  await page.mouse.up();

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const line = window.Components?.line;
      const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
      const api = hot?.columnApi || hot?.gridApi;
      return api?.getAllDisplayedColumns?.().map(col => col.getColId?.()) || [];
    });
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).not.toEqual(beforeOrder);

  expect(issues.critical).toEqual([]);
});
