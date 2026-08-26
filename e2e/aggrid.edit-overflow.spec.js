const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const LONG_EDIT_VALUE = 'Graphitix should reveal this deliberately long cell value across neighboring cells while it is being edited, without resizing columns or scrolling the grid.';

test('AG Grid long inline edits open across neighboring cells like a spreadsheet editor', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    return !!(
      hot?.gridApi
      && root?.querySelector?.('.ag-center-cols-viewport')
      && root.querySelector('.ag-center-cols-container .ag-row[row-index] .ag-cell[col-id^="c"]')
    );
  });

  const target = await page.evaluate(longValue => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const viewport = root?.querySelector?.('.ag-center-cols-viewport');
    if(!hot || !root || !viewport){
      return null;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const rows = Array.from(root.querySelectorAll('.ag-center-cols-container .ag-row[row-index]'))
      .map(row => Number(row.getAttribute('row-index')))
      .filter(Number.isInteger)
      .sort((a, b) => a - b);
    const row = rows.find(value => value >= 1) ?? rows[0];
    if(!Number.isInteger(row)){
      return null;
    }

    const rowNode = root.querySelector(`.ag-center-cols-container .ag-row[row-index="${row}"]`);
    const visibleCols = Array.from(rowNode?.querySelectorAll?.('.ag-cell[col-id^="c"]') || [])
      .map(cell => {
        const colId = cell.getAttribute('col-id');
        const col = Number(String(colId || '').slice(1));
        const rect = cell.getBoundingClientRect();
        return {
          col,
          fullyVisible: rect.left >= viewportRect.left + 1 && rect.right <= viewportRect.right - 1
        };
      })
      .filter(entry => Number.isInteger(entry.col) && entry.fullyVisible)
      .sort((a, b) => a.col - b.col);
    const visibleSet = new Set(visibleCols.map(entry => entry.col));
    const col = visibleCols
      .map(entry => entry.col)
      .find(value => visibleSet.has(value + 1) && visibleSet.has(value + 2));
    if(!Number.isInteger(col)){
      return null;
    }

    const pinnedRows = Number(hot.getSettings?.().fixedRowsTop) || 0;
    const visualRow = row + pinnedRows;
    hot.setDataAtCell([
      [visualRow, col, longValue],
      [visualRow, col + 1, 'NEIGHBOR_ONE'],
      [visualRow, col + 2, 'NEIGHBOR_TWO']
    ], 'e2e-edit-overflow');
    return { row, visualRow, col };
  }, LONG_EDIT_VALUE);

  expect(target).toBeTruthy();

  const cell = page.locator(
    `#scatterPage:not([hidden]) .ag-center-cols-container .ag-row[row-index="${target.row}"] .ag-cell[col-id="c${target.col}"]`
  ).first();
  await expect(cell).toBeVisible();
  await expect(cell).toContainText('Graphitix should reveal');

  const beforeState = await page.evaluate(({ row, col }) => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const current = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col}"]`);
    const next = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col + 1}"]`);
    if(!current || !next){
      return null;
    }
    const currentRect = current.getBoundingClientRect();
    const nextRect = next.getBoundingClientRect();
    return {
      scrollLeft: Number(root?.querySelector?.('.ag-body-horizontal-scroll-viewport')?.scrollLeft) || 0,
      cellLeft: currentRect.left,
      cellWidth: currentRect.width,
      nextLeft: nextRect.left,
      nextWidth: nextRect.width
    };
  }, target);
  expect(beforeState).toBeTruthy();

  await cell.dblclick();
  await expect(cell).toHaveClass(/ag-cell-inline-editing/);
  await expect(cell).toHaveClass(/hot-cell-edit-overflow/);
  await page.waitForFunction(({ row, col }) => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const editCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col}"]`);
    const input = editCell?.querySelector?.('input');
    const rightEdge = root?.querySelector?.('.hot-selection-outline-edge[data-edge="right"]');
    if(!editCell || !input || !rightEdge){
      return false;
    }
    return input.getBoundingClientRect().width > editCell.getBoundingClientRect().width + 20
      && getComputedStyle(rightEdge).display === 'none';
  }, target);

  const expandedState = await page.evaluate(({ row, col }) => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const editCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col}"]`);
    const nextCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col + 1}"]`);
    const input = editCell?.querySelector?.('input');
    const viewport = editCell?.closest?.('.ag-center-cols-viewport');
    const rightEdge = root?.querySelector?.('.hot-selection-outline-edge[data-edge="right"]');
    if(!editCell || !nextCell || !input || !viewport || !rightEdge){
      return null;
    }

    const cellRect = editCell.getBoundingClientRect();
    const nextRect = nextCell.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const overlapY = (Math.max(cellRect.top, nextRect.top) + Math.min(cellRect.bottom, nextRect.bottom)) / 2;
    const rowNode = editCell.closest('.ag-row');
    const coveredNeighbors = Array.from(rowNode?.querySelectorAll?.('.ag-cell[col-id^="c"]') || [])
      .filter(candidate => candidate !== editCell)
      .map(candidate => {
        const rect = candidate.getBoundingClientRect();
        const touched = rect.left < inputRect.right - 1 && rect.right > cellRect.right + 1;
        const fullyInsideViewport = rect.right <= viewportRect.right + 1;
        const sampleX = Math.min(rect.right - 2, viewportRect.right - 2);
        const topmost = touched && sampleX > rect.left + 1
          ? document.elementFromPoint(sampleX, overlapY)
          : null;
        return {
          touched,
          fullyInsideViewport,
          fullyCovered: !touched || !fullyInsideViewport
            || topmost?.closest?.('.ag-cell.ag-cell-inline-editing.hot-cell-edit-overflow') === editCell,
          right: rect.right
        };
      })
      .filter(entry => entry.touched);

    return {
      cellWidth: cellRect.width,
      inputWidth: inputRect.width,
      inputRight: inputRect.right,
      viewportRight: viewportRect.right,
      coveredNeighborCount: coveredNeighbors.length,
      allTouchedNeighborsFullyCovered: coveredNeighbors.every(entry => entry.fullyCovered),
      allFullyVisibleTouchedCellsEndUnderEditor: coveredNeighbors
        .filter(entry => entry.fullyInsideViewport)
        .every(entry => inputRect.right >= entry.right - 1),
      rightEdgeDisplay: getComputedStyle(rightEdge).display,
      cellLeft: cellRect.left,
      nextLeft: nextRect.left,
      nextWidth: nextRect.width,
      scrollLeft: Number(root.querySelector('.ag-body-horizontal-scroll-viewport')?.scrollLeft) || 0
    };
  }, target);

  expect(expandedState).toBeTruthy();
  expect(expandedState.inputWidth).toBeGreaterThan(expandedState.cellWidth + 20);
  expect(expandedState.inputRight).toBeLessThanOrEqual(expandedState.viewportRight + 1);
  expect(expandedState.coveredNeighborCount).toBeGreaterThan(0);
  expect(expandedState.allTouchedNeighborsFullyCovered).toBe(true);
  expect(expandedState.allFullyVisibleTouchedCellsEndUnderEditor).toBe(true);
  expect(expandedState.rightEdgeDisplay).toBe('none');
  expect(expandedState.scrollLeft).toBe(beforeState.scrollLeft);
  expect(Math.abs(expandedState.cellLeft - beforeState.cellLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(expandedState.cellWidth - beforeState.cellWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(expandedState.nextLeft - beforeState.nextLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(expandedState.nextWidth - beforeState.nextWidth)).toBeLessThanOrEqual(1);

  const input = cell.locator('input').first();
  const oneNeighborValue = await page.evaluate(({ row, col, longValue }) => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const editCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col}"]`);
    const nextCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col + 1}"]`);
    const input = editCell?.querySelector?.('input');
    if(!editCell || !nextCell || !input){
      return null;
    }

    const inputRect = input.getBoundingClientRect();
    const nextRect = nextCell.getBoundingClientRect();
    const inputStyle = getComputedStyle(input);
    const paddingLeft = Number.parseFloat(inputStyle.paddingLeft) || 0;
    const probe = document.createElement('span');
    probe.style.position = 'fixed';
    probe.style.left = '-10000px';
    probe.style.top = '0';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.whiteSpace = 'pre';
    probe.style.width = 'max-content';
    probe.style.maxWidth = 'none';
    probe.style.padding = '0';
    probe.style.margin = '0';
    probe.style.border = '0';
    probe.style.font = inputStyle.font;
    probe.style.letterSpacing = inputStyle.letterSpacing;
    probe.style.fontKerning = inputStyle.fontKerning;
    document.body.appendChild(probe);

    let best = null;
    try{
      for(let length = 1; length <= longValue.length; length += 1){
        const value = longValue.slice(0, length);
        probe.textContent = value;
        const textRight = inputRect.left + paddingLeft + probe.getBoundingClientRect().width;
        if(textRight <= nextRect.left + 4){
          continue;
        }
        if(textRight >= nextRect.right - 1){
          break;
        }
        // Prefer the longest prefix that still leaves visible empty space before
        // the following cell. This is the exact boundary case that previously
        // hid one cell too many because editor gutter counted as text overlap.
        best = value;
      }
    }finally{
      probe.remove();
    }
    return best;
  }, { ...target, longValue: LONG_EDIT_VALUE });

  expect(oneNeighborValue).toBeTruthy();
  await input.fill(oneNeighborValue);
  await expect(cell).toHaveClass(/hot-cell-edit-overflow/);
  await page.waitForFunction(({ row, col }) => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const editCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col}"]`);
    const nextCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col + 1}"]`);
    const input = editCell?.querySelector?.('input');
    if(!editCell || !nextCell || !input){
      return false;
    }
    const nextRect = nextCell.getBoundingClientRect();
    const borderRightWidth = Number.parseFloat(getComputedStyle(nextCell).borderRightWidth) || 0;
    const expectedPaintRight = nextRect.right - borderRightWidth;
    return Math.abs(input.getBoundingClientRect().right - expectedPaintRight) <= 0.5;
  }, target);

  const oneNeighborState = await page.evaluate(({ row, col }) => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const editCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col}"]`);
    const nextCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col + 1}"]`);
    const secondNextCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col + 2}"]`);
    const input = editCell?.querySelector?.('input');
    if(!editCell || !nextCell || !secondNextCell || !input){
      return null;
    }
    const editRect = editCell.getBoundingClientRect();
    const nextRect = nextCell.getBoundingClientRect();
    const secondNextRect = secondNextCell.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const firstNeighborStyle = getComputedStyle(nextCell);
    const firstNeighborBorderRightWidth = Number.parseFloat(firstNeighborStyle.borderRightWidth) || 0;
    const firstNeighborPaintRight = nextRect.right - firstNeighborBorderRightWidth;
    const sampleY = (editRect.top + editRect.bottom) / 2;
    const coveredPoint = document.elementFromPoint(firstNeighborPaintRight - 2, sampleY);
    const uncoveredPoint = document.elementFromPoint(secondNextRect.left + 2, sampleY);
    return {
      inputRight: inputRect.right,
      firstNeighborRight: nextRect.right,
      firstNeighborPaintRight,
      firstNeighborBorderRightWidth,
      firstNeighborBorderRightStyle: firstNeighborStyle.borderRightStyle,
      firstNeighborCoveredToInnerEdge: coveredPoint?.closest?.('.ag-cell.ag-cell-inline-editing.hot-cell-edit-overflow') === editCell,
      secondNeighborLeft: secondNextRect.left,
      secondNeighborUncovered: uncoveredPoint?.closest?.('.ag-cell') === secondNextCell,
      scrollLeft: Number(root.querySelector('.ag-body-horizontal-scroll-viewport')?.scrollLeft) || 0
    };
  }, target);

  expect(oneNeighborState).toBeTruthy();
  expect(Math.abs(oneNeighborState.inputRight - oneNeighborState.firstNeighborPaintRight)).toBeLessThanOrEqual(0.5);
  expect(oneNeighborState.inputRight).toBeLessThan(oneNeighborState.firstNeighborRight);
  expect(oneNeighborState.inputRight).toBeLessThanOrEqual(oneNeighborState.secondNeighborLeft + 0.5);
  expect(oneNeighborState.firstNeighborCoveredToInnerEdge).toBe(true);
  expect(oneNeighborState.firstNeighborBorderRightWidth).toBeGreaterThan(0);
  expect(oneNeighborState.firstNeighborBorderRightStyle).not.toBe('none');
  expect(oneNeighborState.secondNeighborUncovered).toBe(true);
  expect(oneNeighborState.scrollLeft).toBe(beforeState.scrollLeft);

  await input.fill('short');
  await expect(cell).not.toHaveClass(/hot-cell-edit-overflow/);
  await page.waitForFunction(({ row, col }) => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const editCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col}"]`);
    const input = editCell?.querySelector?.('input');
    const rightEdge = root?.querySelector?.('.hot-selection-outline-edge[data-edge="right"]');
    if(!editCell || !input || !rightEdge){
      return false;
    }
    const inputRect = input.getBoundingClientRect();
    const cellRect = editCell.getBoundingClientRect();
    return inputRect.right <= cellRect.right + 1
      && getComputedStyle(rightEdge).display !== 'none';
  }, target);

  const contractedState = await page.evaluate(({ row, col }) => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const editCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col}"]`);
    const input = editCell?.querySelector?.('input');
    const rightEdge = root?.querySelector?.('.hot-selection-outline-edge[data-edge="right"]');
    if(!editCell || !input || !rightEdge){
      return null;
    }
    const cellRect = editCell.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const nextCell = root?.querySelector?.(`.ag-center-cols-container .ag-row[row-index="${row}"] .ag-cell[col-id="c${col + 1}"]`);
    const nextRect = nextCell?.getBoundingClientRect?.() || null;
    const sampleX = nextRect ? (nextRect.left + nextRect.right) / 2 : null;
    const sampleY = nextRect ? (nextRect.top + nextRect.bottom) / 2 : null;
    const topmost = Number.isFinite(sampleX) && Number.isFinite(sampleY)
      ? document.elementFromPoint(sampleX, sampleY)
      : null;
    return {
      cellRight: cellRect.right,
      inputRight: inputRect.right,
      neighborUncovered: !nextCell || topmost?.closest?.('.ag-cell') === nextCell,
      rightEdgeDisplay: getComputedStyle(rightEdge).display,
      scrollLeft: Number(root.querySelector('.ag-body-horizontal-scroll-viewport')?.scrollLeft) || 0
    };
  }, target);

  expect(contractedState).toBeTruthy();
  expect(contractedState.inputRight).toBeLessThanOrEqual(contractedState.cellRight + 1);
  expect(contractedState.neighborUncovered).toBe(true);
  expect(contractedState.rightEdgeDisplay).not.toBe('none');
  expect(contractedState.scrollLeft).toBe(beforeState.scrollLeft);

  await page.keyboard.press('Escape');
  expect(issues.critical).toEqual([]);
});
