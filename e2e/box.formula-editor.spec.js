const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box formula references highlight correct cells and resolve on first enter', async ({ page }) => {
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
    return !!(hot && typeof hot.setDataAtCell === 'function');
  });

  const targetRow = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    let visualRow = 0;
    if (typeof hot.toPhysicalRow === 'function') {
      for (let candidate = 0; candidate < 40; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === 1) {
          visualRow = candidate;
          break;
        }
      }
    }
    hot.setDataAtCell([
      [visualRow, 0, '1'],
      [visualRow, 1, ''],
      [visualRow, 2, '3'],
      [visualRow, 3, '4'],
      [visualRow, 4, '']
    ], 'e2e-seed');
    hot.gridApi?.startEditingCell?.({ rowIndex: visualRow, colKey: 'c4' });
    return visualRow;
  });

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await page.keyboard.type('=', { delay: 20 });
  const cellA = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${targetRow}"] .ag-cell[col-id="c0"]`).first();
  const cellB = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${targetRow}"] .ag-cell[col-id="c1"]`).first();
  await cellA.click({ force: true });
  await page.keyboard.type('+', { delay: 20 });
  await cellB.click({ force: true });

  const typedFormula = await editorInput.inputValue();
  expect(typedFormula.toUpperCase()).toBe('=A1+B1');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      if (!document.querySelector(`#hot .ag-row[row-index="${rowIndex}"]`)) {
        return false;
      }
      const bOutline = document.querySelector('#hot .hot-formula-ref-outline[data-row="1"][data-col="1"]');
      const cOutline = document.querySelector('#hot .hot-formula-ref-outline[data-row="1"][data-col="2"]');
      return !!bOutline && !cOutline;
    }, targetRow);
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  const classSnapshot = await page.evaluate((rowIndex) => {
    const row = document.querySelector(`#hot .ag-row[row-index="${rowIndex}"]`);
    if (!row) {
      return null;
    }
    const hasOutline = (targetRowIndex, targetColIndex) => {
      return !!document.querySelector(`#hot .hot-formula-ref-outline[data-row="${targetRowIndex}"][data-col="${targetColIndex}"]`);
    };
    return {
      aHasRef1: hasOutline(1, 0),
      bHasRef2: hasOutline(1, 1),
      cHasRef2: hasOutline(1, 2)
    };
  }, targetRow);

  expect(classSnapshot).toBeTruthy();
  expect(classSnapshot.aHasRef1).toBe(true);
  expect(classSnapshot.bHasRef2).toBe(true);
  expect(classSnapshot.cHasRef2).toBe(false);

  await editorInput.press('Enter');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const api = hot?.gridApi;
      if (!api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function') {
        return '';
      }
      const node = api.getDisplayedRowAtIndex(rowIndex);
      if (!node) {
        return '';
      }
      const value = api.getValue('c4', node);
      return value == null ? '' : String(value).trim();
    }, targetRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toBe('1');

  const remainingHighlights = await page.evaluate(() => {
    return document.querySelectorAll('#hot .hot-formula-ref-outline').length;
  });
  expect(remainingHighlights).toBe(0);

  expect(issues.critical).toEqual([]);
});

test('box click-to-reference remains column-accurate across repeated edits', async ({ page }) => {
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
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  const targetRow = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    let visualRow = 0;
    if (typeof hot.toPhysicalRow === 'function') {
      for (let candidate = 0; candidate < 40; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === 1) {
          visualRow = candidate;
          break;
        }
      }
    }
    hot.setDataAtCell([
      [visualRow, 0, '1'],
      [visualRow, 1, '2'],
      [visualRow, 2, '3'],
      [visualRow, 3, '4'],
      [visualRow, 4, '']
    ], 'e2e-seed-repeat');
    return visualRow;
  });

  const cellA = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${targetRow}"] .ag-cell[col-id="c0"]`).first();
  const cellB = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${targetRow}"] .ag-cell[col-id="c1"]`).first();
  const editorInput = page.locator('#hot input.ag-text-field-input').first();

  for (let i = 0; i < 8; i += 1) {
    await page.evaluate(({ row, iteration }) => {
      const box = window.Components.box;
      const state = box.__getState();
      const hot = state.ensureHotForActiveTab?.() || state.hot;
      hot.setDataAtCell([[row, 4, '']], `e2e-repeat-reset-${iteration}`);
      hot.gridApi?.startEditingCell?.({ rowIndex: row, colKey: 'c4' });
    }, { row: targetRow, iteration: i });

    await expect(editorInput).toBeVisible();
    await page.keyboard.type('=', { delay: 10 });
    await cellA.click({ force: true });
    await page.keyboard.type('+', { delay: 10 });
    await cellB.click({ force: true });

    const typedFormula = await editorInput.inputValue();
    expect(typedFormula.toUpperCase()).toBe('=A1+B1');

    await editorInput.press('Escape');
  }

  expect(issues.critical).toEqual([]);
});

test('box formula reference highlighting follows displayed row coordinates after sort', async ({ page }) => {
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
    return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
  });

  await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    hot.loadData([
      ['Group 1', 'Sort Key', 'Group 3', 'Group 4', 'Formula'],
      ['P1', '30', '', '', ''],
      ['P2', '10', '', '', ''],
      ['P3', '20', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', '']
    ], {
      source: 'e2e-sort-ref-load',
      recordUndo: false
    });
  });

  const sortIndicator = page.locator('#hot .ag-header-cell[col-id="c1"] .hot-sort-indicator').first();
  await expect(sortIndicator).toBeVisible();
  await sortIndicator.click();

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const indicator = document.querySelector('#hot .ag-header-cell[col-id="c1"] .hot-sort-indicator');
      return !!indicator && indicator.classList.contains('is-asc');
    });
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  const p1DisplayRow = await page.evaluate(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    const api = hot?.gridApi;
    if (!api || typeof api.getDisplayedRowCount !== 'function' || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function') {
      return null;
    }
    const total = api.getDisplayedRowCount();
    for (let idx = 0; idx < total; idx += 1) {
      const node = api.getDisplayedRowAtIndex(idx);
      if (!node) {
        continue;
      }
      const value = String(api.getValue('c0', node) ?? '').trim();
      if (value === 'P1') {
        return Number(node.rowIndex);
      }
    }
    return null;
  });
  expect(Number.isInteger(p1DisplayRow)).toBe(true);

  await page.evaluate((rowIndex) => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    hot.gridApi?.startEditingCell?.({ rowIndex, colKey: 'c4' });
  }, p1DisplayRow);

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('=');

  const refCell = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${p1DisplayRow}"] .ag-cell[col-id="c0"]`).first();
  await refCell.click({ force: true });

  await expect(editorInput).toHaveValue(`=A${p1DisplayRow}`);

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      return !!document.querySelector(`#hot .hot-formula-ref-outline[data-row="${rowIndex}"][data-col="0"]`);
    }, p1DisplayRow);
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  expect(issues.critical).toEqual([]);
});

test('box formula drag range selection inserts A1:A10 and evaluates AVERAGE', async ({ page }) => {
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
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  const rangeInfo = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    let startRow = 0;
    if (typeof hot.toPhysicalRow === 'function') {
      for (let candidate = 0; candidate < 80; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === 1) {
          startRow = candidate;
          break;
        }
      }
    }
    const endRow = startRow + 9;
    const updates = [];
    for (let i = 0; i < 10; i += 1) {
      updates.push([startRow + i, 0, String(i + 1)]);
    }
    updates.push([startRow, 4, '']);
    hot.setDataAtCell(updates, 'e2e-drag-range-seed');
    hot.gridApi?.startEditingCell?.({ rowIndex: startRow, colKey: 'c4' });
    return { startRow, endRow };
  });

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('=AVERAGE(');

  const startCell = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${rangeInfo.startRow}"] .ag-cell[col-id="c0"]`).first();
  const endCell = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${rangeInfo.endRow}"] .ag-cell[col-id="c0"]`).first();
  await startCell.scrollIntoViewIfNeeded();
  await endCell.scrollIntoViewIfNeeded();

  const startBox = await startCell.boundingBox();
  const endBox = await endCell.boundingBox();
  if (!startBox || !endBox) {
    throw new Error('Unable to resolve bounding boxes for range drag test');
  }

  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, { steps: 14 });
  await page.mouse.up();

  await expect(editorInput).toHaveValue('=AVERAGE(A1:A10');

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const startOutline = document.querySelector('#hot .hot-formula-ref-outline[data-row="1"][data-col="0"]');
      const endOutline = document.querySelector('#hot .hot-formula-ref-outline[data-row="10"][data-col="0"]');
      return !!startOutline && !!endOutline;
    });
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  await page.keyboard.press('Enter');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const api = hot?.gridApi;
      if (!api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function') {
        return null;
      }
      const node = api.getDisplayedRowAtIndex(rowIndex);
      if (!node) {
        return null;
      }
      const value = api.getValue('c4', node);
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }, rangeInfo.startRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toBe(5.5);

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      if(!hot || typeof hot.getDataAtCell !== 'function'){
        return '';
      }
      const raw = hot.getDataAtCell(rowIndex, 4);
      return raw == null ? '' : String(raw);
    }, rangeInfo.startRow);
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe('=AVERAGE(A1:A10)');

  expect(issues.critical).toEqual([]);
});

test('box formula reference outlines stay clipped under pinned/header overlays while scrolling', async ({ page }) => {
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
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const updates = [];
    for (let row = 1; row <= 24; row += 1) {
      updates.push([row, 1, String(100 + row)]);
      updates.push([row, 2, String(200 + row)]);
      updates.push([row, 4, '']);
    }
    hot.setDataAtCell(updates, 'e2e-formula-clip-seed');
    hot.gridApi?.startEditingCell?.({ rowIndex: 1, colKey: 'c4' });
  });

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('=B2+C2');

  await expect.poll(async () => {
    return await page.evaluate(() => document.querySelectorAll('#hot .hot-formula-ref-outline').length);
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBeGreaterThan(0);

  const scrollTargets = await page.evaluate(() => {
    const bodyViewport = document.querySelector('#hot .ag-body-viewport');
    const centerViewport = document.querySelector('#hot .ag-center-cols-viewport');
    const firstOutline = document.querySelector('#hot .hot-formula-ref-outline');
    const firstRect = firstOutline?.getBoundingClientRect?.() || null;
    const rowHeader = document.querySelector('#hot .ag-pinned-left-cols-viewport, #hot .ag-pinned-left-header-viewport, #hot .ag-pinned-left-header');
    const rowHeaderRect = rowHeader?.getBoundingClientRect?.() || null;
    const headerRect = document.querySelector('#hot .ag-header, #hot .ag-header-viewport')?.getBoundingClientRect?.() || null;
    const floatingTopRect = document.querySelector('#hot .ag-floating-top, #hot .ag-pinned-top, #hot .ag-floating-top-viewport, #hot .ag-pinned-top-viewport')?.getBoundingClientRect?.() || null;
    const stickyRect = document.querySelector('#hot .ag-row.hot-sticky-row')?.getBoundingClientRect?.() || null;
    const topOcclusion = Math.max(
      Number(headerRect?.bottom || 0),
      Number(floatingTopRect?.bottom || 0),
      Number(stickyRect?.bottom || 0)
    );
    const leftOcclusion = Number(rowHeaderRect?.right || 0);
    if (!bodyViewport || !centerViewport || !firstRect || topOcclusion <= 0 || leftOcclusion <= 0) {
      return null;
    }
    const horizontalShift = Math.max(0, Math.ceil(firstRect.left - (leftOcclusion + 6)));
    const verticalShift = Math.max(0, Math.ceil(firstRect.top - (topOcclusion + 6)));
    return {
      left: horizontalShift,
      top: verticalShift
    };
  });
  expect(scrollTargets).toBeTruthy();

  await page.evaluate(({ left, top }) => {
    const bodyViewport = document.querySelector('#hot .ag-body-viewport');
    const centerViewport = document.querySelector('#hot .ag-center-cols-viewport');
    if (bodyViewport) {
      bodyViewport.scrollLeft = left;
      bodyViewport.scrollTop = top;
    }
    if (centerViewport) {
      centerViewport.scrollLeft = left;
      centerViewport.scrollTop = top;
    }
  }, scrollTargets);

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const outlines = Array.from(document.querySelectorAll('#hot .hot-formula-ref-outline'));
      if (!outlines.length) {
        return false;
      }
      const rowHeader = document.querySelector('#hot .ag-pinned-left-cols-viewport, #hot .ag-pinned-left-header-viewport, #hot .ag-pinned-left-header');
      const rowHeaderRect = rowHeader?.getBoundingClientRect?.() || null;
      const headerRect = document.querySelector('#hot .ag-header, #hot .ag-header-viewport')?.getBoundingClientRect?.() || null;
      const floatingTopRect = document.querySelector('#hot .ag-floating-top, #hot .ag-pinned-top, #hot .ag-floating-top-viewport, #hot .ag-pinned-top-viewport')?.getBoundingClientRect?.() || null;
      const stickyRect = document.querySelector('#hot .ag-row.hot-sticky-row')?.getBoundingClientRect?.() || null;
      const topOcclusion = Math.max(
        Number(headerRect?.bottom || 0),
        Number(floatingTopRect?.bottom || 0),
        Number(stickyRect?.bottom || 0)
      );
      const leftOcclusion = Number(rowHeaderRect?.right || 0);
      if (topOcclusion <= 0 || leftOcclusion <= 0) {
        return false;
      }
      return outlines.every((outline) => {
        const rect = outline.getBoundingClientRect();
        return rect.top >= (topOcclusion - 1) && rect.left >= (leftOcclusion - 1);
      });
    });
  }, {
    timeout: 15_000,
    intervals: [250, 500, 1000]
  }).toBe(true);

  expect(issues.critical).toEqual([]);
});
