const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box fill handle propagates formulas with relative references', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.waitForFunction(() => {
    const box = window.Components?.box;
    if (!box || typeof box.__getState !== 'function') {
      return false;
    }
    const state = box.__getState();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot && typeof hot.setDataAtCell === 'function' && hot.gridApi);
  });

  const targetRows = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const findVisual = (physicalRow) => {
      if (typeof hot.toPhysicalRow !== 'function') {
        return physicalRow;
      }
      for (let candidate = 0; candidate < 80; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === physicalRow) {
          return candidate;
        }
      }
      return null;
    };
    const row1 = findVisual(1) ?? 1;
    const row2 = findVisual(2) ?? (row1 + 1);
    const row3 = findVisual(3) ?? (row2 + 1);

    hot.setDataAtCell([
      [row1, 0, '1'],
      [row1, 1, '2'],
      [row1, 2, '=A1+B1'],
      [row2, 0, '3'],
      [row2, 1, '4'],
      [row2, 2, ''],
      [row3, 0, '5'],
      [row3, 1, '6'],
      [row3, 2, '']
    ], 'e2e-formula-fill-seed');

    return { row1, row2, row3 };
  });

  const sourceCell = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${targetRows.row1}"] .ag-cell[col-id="c2"]`).first();
  const targetCell = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${targetRows.row3}"] .ag-cell[col-id="c2"]`).first();
  await sourceCell.click({ force: true });

  const fillHandle = page.locator('#hot .hot-fill-handle').first();
  await expect(fillHandle).toBeVisible();
  await expect(targetCell).toBeVisible();

  const dragFillHandle = async (extraY = 0) => {
    await sourceCell.click({ force: true });
    await expect(fillHandle).toBeVisible();
    const handleBox = await fillHandle.boundingBox();
    const targetBox = await targetCell.boundingBox();
    expect(handleBox).toBeTruthy();
    expect(targetBox).toBeTruthy();
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    const endX = targetBox.x + targetBox.width / 2;
    const endY = targetBox.y + targetBox.height - 2 + extraY;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 24 });
    await page.mouse.up();
  };

  const readFormulaFillSnapshot = async () => {
    return await page.evaluate(({ row2, row3 }) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const api = hot?.gridApi;
      if (!hot || !api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function') {
        return null;
      }
      const node2 = api.getDisplayedRowAtIndex(row2);
      const node3 = api.getDisplayedRowAtIndex(row3);
      if (!node2 || !node3) {
        return null;
      }
      return {
        raw2: String(hot.getDataAtCell(row2, 2) || ''),
        raw3: String(hot.getDataAtCell(row3, 2) || ''),
        resolved2: String(api.getValue('c2', node2) ?? '').trim(),
        resolved3: String(api.getValue('c2', node3) ?? '').trim()
      };
    }, targetRows);
  };

  await dragFillHandle(0);
  let snapshot = await readFormulaFillSnapshot();
  if (!snapshot || snapshot.raw2 !== '=A2+B2' || snapshot.raw3 !== '=A3+B3') {
    await dragFillHandle(20);
  }

  await expect.poll(async () => {
    return await readFormulaFillSnapshot();
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toEqual({
    raw2: '=A2+B2',
    raw3: '=A3+B3',
    resolved2: '7',
    resolved3: '11'
  });

  expect(issues.critical).toEqual([]);
});

test('box fill handle double-click auto-fills formulas down and stops at first missing dependency', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.waitForFunction(() => {
    const box = window.Components?.box;
    if (!box || typeof box.__getState !== 'function') {
      return false;
    }
    const state = box.__getState();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot && typeof hot.setDataAtCell === 'function' && hot.gridApi);
  });

  const rows = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const findVisual = (physicalRow) => {
      if (typeof hot.toPhysicalRow !== 'function') {
        return physicalRow;
      }
      for (let candidate = 0; candidate < 120; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === physicalRow) {
          return candidate;
        }
      }
      return null;
    };
    const row1 = findVisual(1) ?? 1;
    const row2 = findVisual(2) ?? (row1 + 1);
    const row3 = findVisual(3) ?? (row2 + 1);
    const row4 = findVisual(4) ?? (row3 + 1);
    const row5 = findVisual(5) ?? (row4 + 1);
    const row6 = findVisual(6) ?? (row5 + 1);
    const row7 = findVisual(7) ?? (row6 + 1);

    hot.setDataAtCell([
      [row2, 1, '15'], [row2, 2, '14'], [row2, 3, '=B2+C2'],
      [row3, 1, '17'], [row3, 2, '15.3'], [row3, 3, ''],
      [row4, 1, '14.6'], [row4, 2, '13'], [row4, 3, ''],
      [row5, 1, '16'], [row5, 2, '16.3'], [row5, 3, ''],
      [row6, 1, '18'], [row6, 2, '18.4'], [row6, 3, ''],
      [row7, 1, '19'], [row7, 2, ''], [row7, 3, '']
    ], 'e2e-fill-handle-dblclick-seed');

    return { row1, row2, row3, row4, row5, row6, row7 };
  });

  const sourceCell = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${rows.row2}"] .ag-cell[col-id="c3"]`).first();
  await sourceCell.click({ force: true });

  const fillHandle = page.locator('#hot .hot-fill-handle').first();
  await expect(fillHandle).toBeAttached();
  const dispatched = await page.evaluate(() => {
    const handle = document.querySelector('#hot .hot-fill-handle');
    if (!handle) {
      return false;
    }
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    return true;
  });
  expect(dispatched).toBe(true);

  await expect.poll(async () => {
    return await page.evaluate(({ row3, row4, row5, row6, row7 }) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const api = hot?.gridApi;
      if (!hot || !api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function') {
        return null;
      }
      const n6 = api.getDisplayedRowAtIndex(row6);
      const n7 = api.getDisplayedRowAtIndex(row7);
      if (!n6 || !n7) {
        return null;
      }
      return {
        raw3: String(hot.getDataAtCell(row3, 3) || ''),
        raw4: String(hot.getDataAtCell(row4, 3) || ''),
        raw5: String(hot.getDataAtCell(row5, 3) || ''),
        raw6: String(hot.getDataAtCell(row6, 3) || ''),
        raw7: String(hot.getDataAtCell(row7, 3) || ''),
        resolved6: String(api.getValue('c3', n6) ?? '').trim(),
        resolved7: String(api.getValue('c3', n7) ?? '').trim()
      };
    }, rows);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toEqual({
    raw3: '=B3+C3',
    raw4: '=B4+C4',
    raw5: '=B5+C5',
    raw6: '=B6+C6',
    raw7: '',
    resolved6: '36.4',
    resolved7: ''
  });

  expect(issues.critical).toEqual([]);
});
