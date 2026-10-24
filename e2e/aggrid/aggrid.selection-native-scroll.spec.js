const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { launchChromiumAtBrowserZoom } = require('../helpers/actualBrowserZoom');

for (const type of ['box', 'pca']) {
  test(`${type}: pinned-row corner handle remains fully visible and clickable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type, pageId: type + 'Page' }, { first: true });
    await page.waitForFunction(component => {
      const owner = window.Main?.session?.workspaceState?.activeTabId;
      return !!window.Shared?.hot?.__tabTablePools?.[component]?.byTab?.[owner]?.instance?.gridApi;
    }, type);
    const samples = await page.evaluate(async component => {
      const owner = window.Main.session.workspaceState.activeTabId;
      const hot = window.Shared.hot.__tabTablePools[component].byTab[owner].instance;
      const root = hot.rootElement;
      const samples = [];
      for (const row of new Set([0, hot.getSettings().fixedRowsTop - 1])) {
        hot.selectCell(row, 2);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const handle = root.querySelector('.hot-fill-handle');
        const rect = handle.getBoundingClientRect();
        const x = (rect.left + rect.right) / 2;
        const firstBodyCell = root.querySelector('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell[col-id="c2"]');
        const firstBody = firstBodyCell?.getBoundingClientRect();
        const lastPinned = Array.from(root.querySelectorAll('.ag-floating-top-container .ag-row .ag-cell[col-id="c2"]')).at(-1)?.getBoundingClientRect();
        const ancestors = [];
        for(let node = handle.parentElement; node && node !== root; node = node.parentElement){
          const style = getComputedStyle(node);
          const bounds = node.getBoundingClientRect();
          ancestors.push({ className: node.className, bottom: bounds.bottom, height: bounds.height,
            overflow: style.overflow, padding: style.paddingBottom, z: style.zIndex });
        }
        samples.push({ row, top: document.elementFromPoint(x, rect.top + 1) === handle,
          bottom: document.elementFromPoint(x, rect.bottom - 1) === handle,
          seamGap: firstBody && lastPinned ? firstBody.top - lastPinned.bottom : null,
          bodyClickable: firstBody && document.elementFromPoint(firstBody.left + 2, firstBody.top + 2)?.closest('.ag-cell') === firstBodyCell,
          handleBottom: rect.bottom, hit: document.elementFromPoint(x, rect.bottom - 1)?.className, ancestors });
      }
      return samples;
    }, type);
    for (const sample of samples) {
      expect(sample.top, `row ${sample.row}: handle top`).toBe(true);
      expect(sample.bottom, JSON.stringify(sample)).toBe(true);
      expect(sample.seamGap).not.toBeNull();
      expect(Math.abs(sample.seamGap)).toBeLessThanOrEqual(1);
      expect(sample.bodyClickable).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`${type}-pinned-selection.png`) });
  });

  test(`${type}: selection borders, clipboard borders and fill handle move with native grid content before callbacks`, async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type, pageId: type + 'Page' }, { first: true });
    await page.waitForFunction(component => {
      const owner = window.Main?.session?.workspaceState?.activeTabId;
      return !!window.Shared?.hot?.__tabTablePools?.[component]?.byTab?.[owner]?.instance?.gridApi;
    }, type);

    const results = await page.evaluate(async component => {
      const owner = window.Main.session.workspaceState.activeTabId;
      const hot = window.Shared.hot.__tabTablePools[component].byTab[owner].instance;
      const root = hot.rootElement;
      const center = root.querySelector('.ag-center-cols-viewport');
      const body = root.querySelector('.ag-body-viewport');
      const pinnedRows = hot.getSettings().fixedRowsTop || 0;
      const waitFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const modes = [
        { name: 'body-cell', fromRow: pinnedRows + 2, toRow: pinnedRows + 2, fromCol: 2, toCol: 2 },
        { name: 'body-range', fromRow: pinnedRows + 2, toRow: pinnedRows + 4, fromCol: 2, toCol: 3 },
        { name: 'pinned-row-range', fromRow: 0, toRow: pinnedRows + 4, fromCol: 2, toCol: 3 },
        { name: 'mixed-pinned-panes', fromRow: 0, toRow: pinnedRows + 4, fromCol: 0, toCol: 3 },
        { name: 'clipboard', fromRow: 0, toRow: pinnedRows + 4, fromCol: 0, toCol: 3, clipboard: true }
      ];
      const samples = [];
      for (const mode of modes) {
        hot.__hotClearClipboardOutline('native-scroll-regression');
        center.scrollLeft = 0;
        body.scrollTop = 0;
        center.dispatchEvent(new Event('scroll'));
        body.dispatchEvent(new Event('scroll'));
        await waitFrames();
        hot.selectCell(mode.fromRow, mode.fromCol, mode.toRow, mode.toCol);
        if (mode.clipboard) {
          hot.__hotSetClipboardOutlineState({
            mode: 'copy',
            ranges: [{ from: { row: mode.fromRow, col: mode.fromCol }, to: { row: mode.toRow, col: mode.toCol } }],
            clipboardText: 'native scroll test'
          }, 'native-scroll-regression');
        }
        await waitFrames();
        const selector = mode.clipboard ? '.hot-clipboard-outline' : '.hot-selection-outline';
        const outlines = Array.from(root.querySelectorAll(selector)).filter(node => node.style.display === 'block');
        const anchors = new Map(outlines.map(outline => [outline,
          Array.from(outline.parentElement.parentElement.querySelectorAll('.ag-cell.hot-selected-cell[col-id^="c"]'))
        ]));
        const measure = outline => {
          const layer = outline.parentElement;
          const pane = layer.parentElement;
          // Track the same rendered cells on both sides of the scroll. Newly
          // virtualized columns are projected by the observer before painting.
          const cells = anchors.get(outline);
          const rects = cells.map(cell => cell.getBoundingClientRect());
          const bounds = outline.getBoundingClientRect();
          const handle = pane.querySelector('.hot-fill-handle');
          const endCell = cells.find(cell => {
            const row = cell.closest('.ag-row');
            const index = row.getAttribute('row-index');
            const visualRow = index.startsWith('t-') ? Number(index.slice(2)) : Number(index) + pinnedRows;
            return visualRow === mode.toRow && cell.getAttribute('col-id') === 'c' + mode.toCol;
          });
          const corner = endCell?.getBoundingClientRect();
          const marker = handle?.style.display === 'block' ? handle.getBoundingClientRect() : null;
          return {
            pane: pane.className,
            layerClass: layer.className,
            cellCount: cells.length,
            offsets: [
              bounds.left - Math.min(...rects.map(rect => rect.left)),
              bounds.top - Math.min(...rects.map(rect => rect.top)),
              bounds.right - Math.max(...rects.map(rect => rect.right)),
              bounds.bottom - Math.max(...rects.map(rect => rect.bottom))
            ],
            marker: marker && corner ? [(marker.left + marker.right) / 2 - corner.right, (marker.top + marker.bottom) / 2 - corner.bottom] : null
          };
        };
        const before = outlines.map(measure);
        const scrollWidth = center.scrollWidth;
        const scrollHeight = body.scrollHeight;
        center.scrollLeft += 17;
        body.scrollTop += 11;
        // These are AG Grid's native events. Its public bodyScroll callback and
        // any subsequent animation frame have not run when geometry is read.
        center.dispatchEvent(new Event('scroll'));
        body.dispatchEvent(new Event('scroll'));
        const after = outlines.map(measure);
        samples.push({ name: mode.name, before, after, scrollWidth, scrollHeight, nextWidth: center.scrollWidth, nextHeight: body.scrollHeight, movedX: center.scrollLeft, movedY: body.scrollTop });
        await waitFrames();
      }
      return samples;
    }, type);

    expect(results).toHaveLength(5);
    for (const sample of results) {
      expect(sample.movedX, sample.name).toBeGreaterThan(0);
      expect(sample.movedY, sample.name).toBeGreaterThan(0);
      expect(sample.before.length, sample.name).toBeGreaterThan(0);
      expect(sample.nextWidth).toBe(sample.scrollWidth);
      expect(sample.nextHeight).toBe(sample.scrollHeight);
      for (let index = 0; index < sample.before.length; index++) {
        const before = sample.before[index];
        const after = sample.after[index];
        expect(before.layerClass).toBe('hot-grid-selection-layer');
        expect(before.cellCount).toBeGreaterThan(0);
        for (let side = 0; side < 4; side++) expect(after.offsets[side], sample.name + ': ' + before.pane).toBeCloseTo(before.offsets[side], 4);
        if (before.marker) {
          expect(after.marker).not.toBeNull();
          expect(after.marker[0]).toBeCloseTo(before.marker[0], 4);
          expect(after.marker[1]).toBeCloseTo(before.marker[1], 4);
        }
      }
    }
    if (type === 'pca') {
      const mixed = results.find(sample => sample.name === 'mixed-pinned-panes');
      expect(mixed.before.some(sample => sample.pane.includes('ag-pinned-left-cols-container'))).toBe(true);
      expect(mixed.before.some(sample => sample.pane.includes('ag-pinned-left-floating-top'))).toBe(true);
    }
    expect(issues.critical).toEqual([]);
  });
}

test('pinned-row selection keeps its seam and full handle at actual 300% browser zoom', async ({ baseURL }, testInfo) => {
  test.setTimeout(60_000);
  const browser = await launchChromiumAtBrowserZoom();
  try {
    const page = browser.page;
    await installLocalCdnOverrides(page);
    await page.goto(`${baseURL}/index.html`, { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await page.evaluate(() => {
      const owner = window.Main.session.workspaceState.activeTabId;
      const hot = window.Shared.hot.__tabTablePools.box.byTab[owner].instance;
      hot.populateFromArray(0, 0, [
        ['VC 0.5 mg', 'VC 1.0 mg', 'VC 2.0 mg', 'OJ 0.5 mg', 'OJ 1.0 mg'],
        [4.2, 16.5, 23.6, 15.2, 19.7],
        [11.5, 16.5, 18.5, 21.5, 23.3]
      ]);
    });
    await browser.setZoom(3);
    await page.setViewportSize({ width: 1920, height: 1080 });
    // Keep the selected column on screen at browser zoom, as in a widened
    // data panel. Selecting an off-screen column should still be clipped.
    for (let step = 0; step < 4; step++) await page.locator('#boxPanelResizer').press('Shift+ArrowRight');
    await page.evaluate(() => {
      document.activeElement?.blur();
      for (let node = document.querySelector('#boxPage'); node; node = node.parentElement) {
        node.scrollTop = 0;
        node.scrollLeft = 0;
      }
      window.scrollTo(0, 0);
    });
    for (const row of [0, 2]) {
      const geometry = await page.evaluate(async selectedRow => {
        const owner = window.Main.session.workspaceState.activeTabId;
        const hot = window.Shared.hot.__tabTablePools.box.byTab[owner].instance;
        hot.selectCell(selectedRow, 2);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const root = hot.rootElement;
        const handle = root.querySelector('.hot-fill-handle');
        const rect = handle.getBoundingClientRect();
        const pinned = root.querySelector('.ag-floating-top-container .ag-row .ag-cell[col-id="c2"]').getBoundingClientRect();
        const body = root.querySelector('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell[col-id="c2"]').getBoundingClientRect();
        return { ratio: window.devicePixelRatio, seamGap: body.top - pinned.bottom,
          row: selectedRow, handleRect: rect.toJSON(), hit: document.elementFromPoint((rect.left + rect.right) / 2, rect.bottom - 1)?.className,
          fullHandle: document.elementFromPoint((rect.left + rect.right) / 2, rect.bottom - 1) === handle };
      }, row);
      await page.screenshot({ path: testInfo.outputPath(`box-300-percent-${row === 0 ? 'pinned' : 'body'}.png`) });
      expect(geometry.ratio).toBeCloseTo(3, 1);
      expect(Math.abs(geometry.seamGap)).toBeLessThanOrEqual(1 / geometry.ratio);
      expect(geometry.fullHandle, JSON.stringify(geometry)).toBe(true);
    }
  } finally {
    await browser.close();
  }
});

test('heatmap top-left pinned cell keeps its full selection handle and divider', async ({ page }, testInfo) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'heatmap', pageId: 'heatmapPage' }, { first: true });
  await page.waitForFunction(() => {
    const owner = window.Main?.session?.workspaceState?.activeTabId;
    return !!window.Shared?.hot?.__tabTablePools?.heatmap?.byTab?.[owner]?.instance?.gridApi;
  });

  const geometry = await page.evaluate(async () => {
    const owner = window.Main.session.workspaceState.activeTabId;
    const hot = window.Shared.hot.__tabTablePools.heatmap.byTab[owner].instance;
    const root = hot.rootElement;
    hot.selectCell(0, 0);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const pane = root.querySelector('.ag-pinned-left-floating-top');
    const cell = pane?.querySelector('.ag-cell[col-id="c0"]');
    const bodyCell = root.querySelector('.ag-pinned-left-cols-container .ag-row .ag-cell[col-id="c0"]');
    const layer = pane?.querySelector(':scope > .hot-grid-selection-layer');
    const handle = layer?.querySelector('.hot-fill-handle');
    const outline = layer?.querySelector('.hot-selection-outline');
    const handleRect = handle?.getBoundingClientRect();
    const handleHits = [];
    if(handleRect){
      for(let y = 1; y < 7; y++){
        for(let x = 1; x < 7; x++){
          handleHits.push(document.elementFromPoint(handleRect.left + x, handleRect.top + y) === handle);
        }
      }
    }
    const cellStyle = cell ? getComputedStyle(cell) : null;
    const bodyCellStyle = bodyCell ? getComputedStyle(bodyCell) : null;
    return {
      cellFound: !!cell,
      bodyCellFound: !!bodyCell,
      parentOverflow: pane ? getComputedStyle(pane).overflow : null,
      layerOverflow: layer ? getComputedStyle(layer).overflow : null,
      handleDisplay: handle ? getComputedStyle(handle).display : null,
      handleHits,
      bottomBorder: cellStyle ? [cellStyle.borderBottomWidth, cellStyle.borderBottomStyle, cellStyle.borderBottomColor] : null,
      bodyBottomBorder: bodyCellStyle ? [bodyCellStyle.borderBottomWidth, bodyCellStyle.borderBottomStyle, bodyCellStyle.borderBottomColor] : null,
      outlineEdges: outline ? Array.from(outline.children).map(edge => getComputedStyle(edge).display) : [],
      outlineColor: outline?.querySelector('.hot-selection-outline-edge')
        ? getComputedStyle(outline.querySelector('.hot-selection-outline-edge')).backgroundColor
        : null
    };
  });
  await page.screenshot({ path: testInfo.outputPath('heatmap-top-left-pinned-selection.png') });

  expect(geometry.cellFound).toBe(true);
  expect(geometry.bodyCellFound).toBe(true);
  expect(geometry.parentOverflow).toBe('visible');
  expect(geometry.layerOverflow).toBe('visible');
  expect(geometry.handleDisplay).toBe('block');
  expect(geometry.handleHits).toHaveLength(36);
  expect(geometry.handleHits.every(Boolean)).toBe(true);
  expect(geometry.bottomBorder.slice(0, 2)).toEqual(['1px', 'solid']);
  expect(geometry.bottomBorder[2]).not.toBe(geometry.bodyBottomBorder[2]);
  expect(geometry.outlineEdges).toEqual(['block', 'block', 'block', 'block']);
  expect(geometry.outlineColor).toBe('rgb(11, 110, 105)');
});
