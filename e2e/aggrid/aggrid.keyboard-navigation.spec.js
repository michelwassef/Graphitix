const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

test('AG Grid arrow keys move the highlighted cell instead of scrolling a visible neighbor', async ({ page }) => {
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

  const target = await page.evaluate(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const viewport = root?.querySelector?.('.ag-center-cols-viewport');
    if(!hot || !root || !viewport){
      return null;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const visibleRows = Array.from(root.querySelectorAll('.ag-center-cols-container .ag-row[row-index]'))
      .map(row => Number(row.getAttribute('row-index')))
      .filter(Number.isInteger)
      .sort((a, b) => a - b);
    const row = visibleRows.find(value => visibleRows.includes(value - 1) && visibleRows.includes(value + 1))
      ?? visibleRows.find(value => visibleRows.includes(value + 1))
      ?? null;
    if(!Number.isInteger(row)){
      return null;
    }

    const rowNode = root.querySelector(`.ag-center-cols-container .ag-row[row-index="${row}"]`);
    const visibleCols = Array.from(rowNode?.querySelectorAll?.('.ag-cell[col-id^="c"]') || [])
      .map(cell => {
        const colId = cell.getAttribute('col-id');
        const col = Number(String(colId || '').slice(1));
        const rect = cell.getBoundingClientRect();
        const fullyVisible = rect.left >= viewportRect.left - 0.5 && rect.right <= viewportRect.right + 0.5;
        return { col, fullyVisible };
      })
      .filter(entry => Number.isInteger(entry.col) && entry.fullyVisible)
      .sort((a, b) => a.col - b.col);
    const visibleSet = new Set(visibleCols.map(entry => entry.col));
    const col = visibleCols
      .map(entry => entry.col)
      .find(value => visibleSet.has(value - 1) && visibleSet.has(value + 1))
      ?? visibleCols.map(entry => entry.col).find(value => visibleSet.has(value + 1))
      ?? null;
    if(!Number.isInteger(col)){
      return null;
    }

    const pinnedRows = Number(hot.getSettings?.().fixedRowsTop) || 0;
    return { row, visualRow: row + pinnedRows, col };
  });

  expect(target).toBeTruthy();
  const cell = page.locator(
    `#scatterPage:not([hidden]) .ag-center-cols-container .ag-row[row-index="${target.row}"] .ag-cell[col-id="c${target.col}"]`
  ).first();
  await expect(cell).toBeVisible();
  await cell.click();

  const readState = () => page.evaluate(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const horizontal = root?.querySelector?.('.ag-body-horizontal-scroll-viewport');
    return {
      selection: hot?.getSelectedLast?.() || null,
      scrollLeft: Number(horizontal?.scrollLeft) || 0
    };
  });

  await expect.poll(async () => (await readState()).selection).toEqual([
    target.visualRow,
    target.col,
    target.visualRow,
    target.col
  ]);

  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await readState()).selection).toEqual([
    target.visualRow + 1,
    target.col,
    target.visualRow + 1,
    target.col
  ]);

  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await readState()).selection).toEqual([
    target.visualRow,
    target.col,
    target.visualRow,
    target.col
  ]);

  const horizontalBefore = (await readState()).scrollLeft;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await readState()).selection).toEqual([
    target.visualRow,
    target.col + 1,
    target.visualRow,
    target.col + 1
  ]);
  expect((await readState()).scrollLeft).toBe(horizontalBefore);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await readState()).selection).toEqual([
    target.visualRow,
    target.col,
    target.visualRow,
    target.col
  ]);
  expect((await readState()).scrollLeft).toBe(horizontalBefore);

  expect(issues.critical).toEqual([]);
});

test('AG Grid pinned-row wheel scrolling uses the single shared horizontal scrollbar', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    if(!hot?.loadData){
      throw new Error('Scatter table API is unavailable');
    }
    const headers = Array.from({ length: 24 }, (_, index) => `Column ${index + 1}`);
    headers[0] = 'Sample';
    headers[1] = 'X';
    headers[2] = 'Y';
    hot.loadData([
      headers,
      headers.map((_, index) => index === 0 ? 'Sample A' : index === 1 ? 1 : index === 2 ? 2 : index),
      headers.map((_, index) => index === 0 ? 'Sample B' : index === 1 ? 2 : index === 2 ? 3 : index + 1)
    ], { source: 'e2e-pinned-grid-wheel-scroll', skipUndo: true });
  });

  await page.waitForFunction(() => {
    const root = document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const horizontal = root?.querySelector('.ag-body-horizontal-scroll-viewport');
    const pinned = root?.querySelector('.ag-floating-top');
    return !!horizontal && !!pinned && horizontal.scrollWidth > horizontal.clientWidth + 100;
  });

  const before = await page.evaluate(() => {
    const root = document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const horizontal = root?.querySelector('.ag-body-horizontal-scroll-viewport');
    const pinned = root?.querySelector('.ag-floating-top');
    const entryStops = Array.from(root?.querySelectorAll('.ag-floating-top-viewport, .ag-body-viewport, .ag-center-cols-viewport') || [])
      .filter(node => node.tabIndex >= 0).length;
    const pinnedViewport = root?.querySelector('.hot-pinned-row-scroll-region');
    const maxScroll = horizontal ? horizontal.scrollWidth - horizontal.clientWidth : 0;
    const scrollLeftBefore = Number(horizontal?.scrollLeft) || 0;
    const event = new WheelEvent('wheel', { deltaX: 128, bubbles: true, cancelable: true });
    pinned?.dispatchEvent(event);
    return {
      scrollLeftBefore,
      maxScroll,
      entryStops,
      pinnedViewportTabIndex: pinnedViewport?.tabIndex ?? null,
      pinnedViewportName: pinnedViewport?.getAttribute('aria-label') || '',
      scrollRegionTitles: Array.from(root?.querySelectorAll('.hot-grid-scroll-region, .hot-pinned-row-scroll-region') || [])
        .map(node => node.getAttribute('title') || ''),
      wheelPrevented: event.defaultPrevented
    };
  });

  expect(before.maxScroll).toBeGreaterThan(100);
  expect(before.entryStops).toBe(2);
  expect(before.pinnedViewportTabIndex).toBe(0);
  expect(before.pinnedViewportName).toMatch(/Scatter data table pinned rows horizontal scroll area/);
  expect(before.scrollRegionTitles.every(title => !title)).toBe(true);
  expect(before.wheelPrevented).toBe(true);
  await expect.poll(() => page.locator('#scatterPage:not([hidden]) #scatterHot .ag-body-horizontal-scroll-viewport')
    .evaluate(node => node.scrollLeft)).toBeGreaterThan(before.scrollLeftBefore);

  const alignment = await page.evaluate(() => {
    const root = document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const horizontal = root?.querySelector('.ag-body-horizontal-scroll-viewport');
    const bodyCell = root?.querySelector('.ag-body-viewport .ag-cell[col-id="c4"]');
    const pinnedCell = root?.querySelector('.ag-floating-top .ag-cell[col-id="c4"]');
    const bodyRect = bodyCell?.getBoundingClientRect();
    const pinnedRect = pinnedCell?.getBoundingClientRect();
    return {
      horizontalScrollLeft: Number(horizontal?.scrollLeft) || 0,
      bodyColumnLeft: bodyRect?.left ?? null,
      pinnedColumnLeft: pinnedRect?.left ?? null
    };
  });
  expect(alignment.bodyColumnLeft, JSON.stringify(alignment)).not.toBeNull();
  expect(alignment.pinnedColumnLeft, JSON.stringify(alignment)).not.toBeNull();
  expect(Math.abs(alignment.bodyColumnLeft - alignment.pinnedColumnLeft), JSON.stringify(alignment)).toBeLessThanOrEqual(1);
});
