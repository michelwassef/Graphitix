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
      const model = state?.formulaModel;
      const api = hot?.gridApi;
      if (!model || !api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function') {
        return null;
      }
      const node2 = api.getDisplayedRowAtIndex(row2);
      const node3 = api.getDisplayedRowAtIndex(row3);
      if (!node2 || !node3) {
        return null;
      }
      return {
        raw2: String(model.getRawAt(2, 2) || ''),
        raw3: String(model.getRawAt(3, 2) || ''),
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
