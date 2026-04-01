const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('ag-grid column drag reorder supports ctrl+z / ctrl+y undo-redo in real browser flow', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.waitForFunction(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  const targetRow = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    let visualRow = 1;
    if (typeof hot.toPhysicalRow === 'function') {
      for (let candidate = 0; candidate < 60; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === 1) {
          visualRow = candidate;
          break;
        }
      }
    }
    hot.setDataAtCell([
      [visualRow, 0, 'A0'],
      [visualRow, 1, 'B0'],
      [visualRow, 2, 'C0']
    ], 'e2e-reorder-undo-seed');
    return visualRow;
  });

  const readTriplet = async () => {
    return await page.evaluate((rowIndex) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      if(!hot || typeof hot.getDataAtCell !== 'function'){
        return null;
      }
      return [
        String(hot.getDataAtCell(rowIndex, 0) ?? ''),
        String(hot.getDataAtCell(rowIndex, 1) ?? ''),
        String(hot.getDataAtCell(rowIndex, 2) ?? '')
      ];
    }, targetRow);
  };

  expect(await readTriplet()).toEqual(['A0', 'B0', 'C0']);

  const sourceHandle = page.locator('#hot .ag-header-cell[col-id="c0"] .hot-col-drag-handle').first();
  const targetHeader = page.locator('#hot .ag-header-cell[col-id="c2"]').first();
  await expect(sourceHandle).toBeVisible();
  await expect(targetHeader).toBeVisible();

  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHeader.boundingBox();
  expect(sourceBox).toBeTruthy();
  expect(targetBox).toBeTruthy();

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width * 0.8, targetBox.y + targetBox.height * 0.5, { steps: 16 });
  await page.mouse.up();

  await expect.poll(async () => await readTriplet(), {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).not.toEqual(['A0', 'B0', 'C0']);

  const canUndoAfterMove = await page.evaluate(() => {
    return !!window.Shared?.undoManager?.canUndo?.();
  });
  expect(canUndoAfterMove).toBeTruthy();

  await page.evaluate(() => {
    const target = document.querySelector('#hot') || document.body;
    const evt = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    target?.dispatchEvent?.(evt);
  });

  await expect.poll(async () => await readTriplet(), {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toEqual(['A0', 'B0', 'C0']);

  await page.evaluate(() => {
    const target = document.querySelector('#hot') || document.body;
    const evt = new KeyboardEvent('keydown', {
      key: 'y',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    target?.dispatchEvent?.(evt);
  });

  await expect.poll(async () => await readTriplet(), {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toEqual(['B0', 'C0', 'A0']);

  expect(issues.critical).toEqual([]);
});
