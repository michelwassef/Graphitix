const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

test('AG Grid preserves visible selection outlines and compact data rows', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot?.rootElement && typeof hot.selectCell === 'function');
  });

  const editableCell = page.locator('#boxPage .ag-theme-balham .ag-row:not(.ag-row-pinned) .ag-cell[col-id="c6"]').first();
  await editableCell.click();

  const result = await page.evaluate(async () => {
    const state = window.Components.box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const root = hot.rootElement;
    const row = root.querySelector('.ag-row:not(.ag-row-pinned)');
    const edge = root.querySelector('.hot-selection-outline-edge[data-edge="top"]');
    const edgeRect = edge?.getBoundingClientRect?.();
    const focusedCell = root.querySelector('.ag-cell.ag-cell-focus');
    const focusedCellStyle = focusedCell ? getComputedStyle(focusedCell) : null;
    return {
      rowHeight: row?.getBoundingClientRect?.().height || 0,
      outlineColor: edge ? getComputedStyle(edge).backgroundColor : null,
      outlineDisplay: edge ? getComputedStyle(edge).display : null,
      outlineWidth: edgeRect?.width || 0,
      outlineHeight: edgeRect?.height || 0,
      pixelRatio: window.devicePixelRatio,
      perimeter: Array.from(root.querySelectorAll('.hot-selection-outline-edge')).map(element => {
        const rect = element.getBoundingClientRect();
        const pane = element.closest('.hot-grid-selection-layer').parentElement;
        const origin = pane.getBoundingClientRect();
        return {
          edge: element.dataset.edge,
          display: getComputedStyle(element).display,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          originLeft: origin.left + pane.clientLeft,
          originTop: origin.top + pane.clientTop,
          thickness: ['top', 'bottom'].includes(element.dataset.edge) ? rect.height : rect.width
        };
      }),
      focusedCellReset: focusedCellStyle ? {
        backgroundColor: focusedCellStyle.backgroundColor,
        outlineStyle: focusedCellStyle.outlineStyle,
        boxShadow: focusedCellStyle.boxShadow
      } : null
    };
  });

  expect(result.rowHeight).toBe(20);
  expect(result.outlineColor).toBe('rgb(11, 110, 105)');
  expect(result.outlineDisplay).toBe('block');
  expect(result.outlineWidth).toBeGreaterThan(0);
  const physicalThickness = Math.max(1, Math.round(result.pixelRatio));
  expect(result.outlineHeight * result.pixelRatio).toBeCloseTo(physicalThickness, 1);
  expect(result.perimeter).toHaveLength(4);
  for (const edge of result.perimeter) {
    expect(edge.display).toBe('block');
    expect(edge.thickness * result.pixelRatio).toBeCloseTo(physicalThickness, 1);
    for (const coordinate of ['left', 'top', 'right', 'bottom']) {
      const origin = ['left', 'right'].includes(coordinate) ? edge.originLeft : edge.originTop;
      const physicalPosition = (edge[coordinate] - origin) * result.pixelRatio;
      expect(physicalPosition).toBeCloseTo(Math.round(physicalPosition), 1);
    }
  }
  expect(result.focusedCellReset).toMatchObject({
    backgroundColor: 'rgb(255, 255, 255)',
    outlineStyle: 'none',
    boxShadow: 'none'
  });

  const start = await editableCell.evaluate(cell => ({
    row: Number(cell.closest('.ag-row')?.getAttribute('row-index')),
    col: cell.getAttribute('col-id')
  }));
  await editableCell.dblclick();
  const editor = page.locator('.ag-cell-inline-editing input.ag-text-field-input, .ag-cell-inline-editing input.ag-input-field-input[type="text"]').first();
  await expect(editor).toBeVisible();
  const editorFocus = await editor.evaluate(element => {
    const cellStyle = getComputedStyle(element.closest('.ag-cell-inline-editing'));
    return {
      borderColors: ['Top', 'Right', 'Bottom', 'Left'].map(side => cellStyle[`border${side}Color`]),
      cellShadow: cellStyle.boxShadow,
      inputShadow: getComputedStyle(element).boxShadow
    };
  });
  expect(editorFocus.borderColors).toEqual(Array(4).fill('rgba(0, 0, 0, 0)'));
  expect(editorFocus.cellShadow).toBe('none');
  expect(editorFocus.inputShadow).toBe('none');
  await editor.press('Control+A');
  await editor.pressSequentially('border thickness check');
  await editor.press('Enter');

  const nextCell = page.locator(`#boxPage:not([hidden]) .ag-center-cols-container .ag-row[row-index="${start.row + 1}"] .ag-cell[col-id="${start.col}"]`);
  await expect(nextCell).toHaveClass(/ag-cell-focus/);
  const keyboardCellFocus = await page.evaluate(async ({ row, col }) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const state = window.Components.box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const root = hot.rootElement;
    const cell = root.querySelector(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="${col}"]`);
    const topEdge = root.querySelector('.hot-selection-outline-edge[data-edge="top"]');
    const style = cell ? getComputedStyle(cell) : null;
    const edgeRect = topEdge?.getBoundingClientRect?.();
    return {
      focusVisible: cell?.matches(':focus-visible') || false,
      outlineStyle: style?.outlineStyle || null,
      edgeDisplay: topEdge ? getComputedStyle(topEdge).display : null,
      edgeThickness: edgeRect?.height || 0,
      pixelRatio: window.devicePixelRatio
    };
  }, { row: start.row + 1, col: start.col });
  expect(keyboardCellFocus.focusVisible).toBe(true);
  expect(keyboardCellFocus.outlineStyle).toBe('none');
  expect(keyboardCellFocus.edgeDisplay).toBe('block');
  expect(keyboardCellFocus.edgeThickness * keyboardCellFocus.pixelRatio)
    .toBeCloseTo(physicalThickness, 1);
  expect(issues.critical).toEqual([]);
});

test('vertical scrollbar gutter covers pinned-row selection and fills the top corner', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot?.rootElement && typeof hot.selectCell === 'function');
  });

  const result = await page.evaluate(async () => {
    const state = window.Components.box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const root = hot.rootElement;
    const horizontal = root.querySelector('.ag-body-horizontal-scroll-viewport');
    const vertical = root.querySelector('.ag-body-vertical-scroll');
    hot.selectCell(0, 6, 7, 7);

    const waitFrames = async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    };
    const snapshots = [];
    const selectedFillBorders = [];
    const transparent = color => color === 'transparent' || /^rgba\([^,]+,\s*[^,]+,\s*[^,]+,\s*0(?:\.0+)?\)$/.test(color);
    const maxScroll = Math.max(0, horizontal.scrollWidth - horizontal.clientWidth);
    for(let left = 0; left <= maxScroll; left += 20){
      horizontal.scrollLeft = left;
      horizontal.dispatchEvent(new Event('scroll', { bubbles: true }));
      await waitFrames();
      // Sample while selected cells are rendered, before virtualization removes them.
      for(const cell of root.querySelectorAll('.ag-cell.hot-selected-range-fill')){
        const style = getComputedStyle(cell);
        selectedFillBorders.push({ rightVisible: !transparent(style.borderRightColor), bottomVisible: !transparent(style.borderBottomColor) });
      }
      const pinnedCell = root.querySelector('.ag-floating-top .ag-cell[col-id="c7"], .ag-pinned-top .ag-cell[col-id="c7"]');
      const outline = pinnedCell?.closest('.ag-row')?.parentElement.querySelector('.hot-selection-outline');
      const rightEdge = outline?.querySelector('.hot-selection-outline-edge[data-edge="right"]');
      const pinnedRect = pinnedCell?.getBoundingClientRect?.();
      const verticalRect = vertical?.getBoundingClientRect?.();
      const outlineRect = outline?.getBoundingClientRect?.();
      let clipLeft = -Infinity;
      let clipRight = Infinity;
      for(let ancestor = rightEdge?.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement){
        if(['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX)){
          const rect = ancestor.getBoundingClientRect();
          clipLeft = Math.max(clipLeft, rect.left + ancestor.clientLeft);
          clipRight = Math.min(clipRight, rect.left + ancestor.clientLeft + ancestor.clientWidth);
        }
      }
      // The opaque scrollbar corner also occludes the pinned viewport. Its
      // bounds, background and stacking order are checked below.
      if(verticalRect) clipRight = Math.min(clipRight, verticalRect.left);
      const edgeRect = rightEdge?.getBoundingClientRect();
      if(pinnedRect && verticalRect && outlineRect
        && pinnedRect.left < verticalRect.left + 30
        && pinnedRect.right > verticalRect.left - 30){
        snapshots.push({
          scrollLeft: horizontal.scrollLeft,
          pinnedRight: pinnedRect.right,
          scrollbarLeft: verticalRect.left,
          outlineRight: Math.min(outlineRect.right, clipRight),
          edgePainted: !!edgeRect && edgeRect.left < clipRight && edgeRect.right > clipLeft,
          rightEdgeDisplay: getComputedStyle(rightEdge).display
        });
      }
    }
    return { maxScroll, snapshots, selectedFillBorders };
  });

  expect(result.snapshots.length).toBeGreaterThan(0);
  expect(result.selectedFillBorders.length).toBeGreaterThan(0);
  expect(result.selectedFillBorders.every(({ rightVisible, bottomVisible }) => rightVisible && bottomVisible)).toBe(true);
  const occluded = result.snapshots.filter(snapshot => snapshot.pinnedRight >= snapshot.scrollbarLeft + 0.5);
  const clear = result.snapshots.filter(snapshot => snapshot.pinnedRight < snapshot.scrollbarLeft - 2);
  expect(occluded.length).toBeGreaterThan(0);
  expect(clear.length).toBeGreaterThan(0);
  for(const snapshot of occluded){
    expect(snapshot.edgePainted).toBe(false);
    expect(snapshot.outlineRight).toBeLessThanOrEqual(snapshot.scrollbarLeft + 0.5);
  }
  for(const snapshot of clear){
    expect(snapshot.rightEdgeDisplay, JSON.stringify(snapshot)).toBe('block');
    expect(snapshot.edgePainted).toBe(true);
    expect(snapshot.outlineRight).toBeLessThanOrEqual(snapshot.scrollbarLeft + 0.5);
  }
  const cornerGeometry = await page.evaluate(() => {
    const state = window.Components.box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const root = hot.rootElement;
    const agRoot = root.querySelector('.ag-root');
    const vertical = root.querySelector('.ag-body-vertical-scroll');
    const horizontal = root.querySelector('.ag-body-horizontal-scroll');
    const header = root.querySelector('.ag-header');
    const floatingTop = root.querySelector('.ag-floating-top');
    const rootRect = agRoot.getBoundingClientRect();
    const verticalRect = vertical.getBoundingClientRect();
    const verticalStyle = getComputedStyle(vertical);
    const cornerStyle = getComputedStyle(vertical, '::before');
    return {
      gapHeight: verticalRect.top - rootRect.top,
      scrollbarWidth: verticalRect.width,
      cornerHeight: Number.parseFloat(cornerStyle.height),
      cornerWidth: Number.parseFloat(cornerStyle.width),
      cornerContent: cornerStyle.content,
      cornerBackground: cornerStyle.backgroundColor,
      verticalBackground: verticalStyle.backgroundColor,
      horizontalBackground: getComputedStyle(horizontal).backgroundColor,
      verticalZ: Number(verticalStyle.zIndex),
      headerZ: Number(getComputedStyle(header).zIndex),
      floatingTopZ: Number(getComputedStyle(floatingTop).zIndex)
    };
  });
  expect(cornerGeometry.gapHeight).toBeGreaterThan(0);
  expect(cornerGeometry.cornerContent).not.toBe('none');
  expect(cornerGeometry.cornerHeight).toBeGreaterThanOrEqual(cornerGeometry.gapHeight);
  expect(cornerGeometry.cornerWidth).toBeCloseTo(cornerGeometry.scrollbarWidth, 1);
  expect(cornerGeometry.cornerBackground).toBe(cornerGeometry.horizontalBackground);
  expect(cornerGeometry.cornerBackground).toBe(cornerGeometry.verticalBackground);
  expect(cornerGeometry.verticalZ).toBeGreaterThan(cornerGeometry.headerZ);
  expect(cornerGeometry.verticalZ).toBeGreaterThan(cornerGeometry.floatingTopZ);
  const selectAllOutline = await page.evaluate(async () => {
    const state = window.Components.box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const root = hot.rootElement;
    root.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const outline = root.querySelector('.hot-selection-outline');
    const topEdge = outline?.querySelector('.hot-selection-outline-edge[data-edge="top"]');
    return {
      selected: hot.getSelectedLast?.(),
      topDisplay: topEdge ? getComputedStyle(topEdge).display : null,
      topWidth: topEdge?.getBoundingClientRect?.().width || 0
    };
  });
  expect(selectAllOutline.selected?.[0]).toBe(0);
  expect(selectAllOutline.selected?.[1]).toBe(0);
  expect(selectAllOutline.topDisplay).toBe('block');
  expect(selectAllOutline.topWidth).toBeGreaterThan(0);
  expect(issues.critical).toEqual([]);
});

test('AG Grid selected range fill keeps the shared right and bottom borders visible', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot?.rootElement && typeof hot.selectCell === 'function');
  });

  const fillAppearance = await page.evaluate(async () => {
    const state = window.Components.box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    hot.selectCell(0, 6, 7, 7);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const transparent = color => color === 'transparent'
      || /^rgba\([^,]+,\s*[^,]+,\s*[^,]+,\s*0(?:\.0+)?\)$/.test(color);
    const fillCells = Array.from(hot.rootElement.querySelectorAll('.ag-cell.hot-selected-range-fill'))
      .map(cell => {
        const style = getComputedStyle(cell);
        return {
          background: style.backgroundColor,
          right: !transparent(style.borderRightColor),
          bottom: !transparent(style.borderBottomColor)
        };
      });
    const anchor = hot.rootElement.querySelector('.ag-cell.hot-selected-anchor');
    const topEdge = hot.rootElement.querySelector('.hot-selection-outline-edge[data-edge="top"]');
    return {
      fillCells,
      anchorBackground: anchor ? getComputedStyle(anchor).backgroundColor : null,
      outlineColor: topEdge ? getComputedStyle(topEdge).backgroundColor : null
    };
  });

  expect(fillAppearance.fillCells.length).toBeGreaterThan(0);
  expect(fillAppearance.fillCells.every(({ right, bottom }) => right && bottom)).toBe(true);
  expect(fillAppearance.fillCells.every(({ background }) => background === 'rgba(0, 0, 0, 0.1)')).toBe(true);
  expect(fillAppearance.anchorBackground).toBe('rgb(255, 255, 255)');
  expect(fillAppearance.outlineColor).toBe('rgb(11, 110, 105)');
  expect(issues.critical).toEqual([]);
});
