const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

test('scatter formulas display resolved value and reopen as raw formula with highlights', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.waitForFunction(() => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__ensureHotForActiveTab?.();
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  const target = await page.evaluate(() => {
    const scatter = window.Components.scatter;
    const hot = scatter.__ensureHotForActiveTab();
    let visualRow = 1;
    if(typeof hot.toPhysicalRow === 'function'){
      for(let candidate = 0; candidate < 40; candidate += 1){
        if(hot.toPhysicalRow(candidate) === 1){
          visualRow = candidate;
          break;
        }
      }
    }
    hot.setDataAtCell([
      [visualRow, 1, '5'],
      [visualRow, 2, '7'],
      [visualRow, 3, '']
    ], 'e2e-seed-scatter-formula');
    const bodyRow = visualRow - (Number(hot.getSettings?.().fixedRowsTop) || 0);
    hot.gridApi?.startEditingCell?.({ rowIndex: bodyRow, colKey: 'c3' });
    return { visualRow, bodyRow };
  });

  const editorInput = page.locator('.ag-cell-inline-editing input.ag-text-field-input, .ag-cell-inline-editing input, .ag-popup-editor input.ag-text-field-input, .ag-popup-editor input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('=SUM(');
  const functionTooltip = page.locator('body > .hot-formula-fn-tooltip');
  await expect(functionTooltip).toBeVisible();
  await expect(functionTooltip).toHaveAttribute('role', 'tooltip');
  const functionTooltipId = await functionTooltip.getAttribute('id');
  expect((await editorInput.getAttribute('aria-describedby') || '').split(/\s+/)).toContain(functionTooltipId);

  await editorInput.fill('=B1+C1');
  await expect(functionTooltip).toBeHidden();
  expect((await editorInput.getAttribute('aria-describedby') || '').split(/\s+/)).not.toContain(functionTooltipId);

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      const root = hot?.rootElement;
      if(!root){
        return false;
      }
      const bOutline = root.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="1"]');
      const cOutline = root.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="2"]');
      return !!bOutline && !!cOutline;
    });
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  const referenceStrokes = await page.evaluate(() => Array.from(document.querySelectorAll('.hot-formula-ref-outline')).map(outline => {
    const style = getComputedStyle(outline);
    return { radius: style.borderTopLeftRadius, width: style.borderTopWidth,
      expectedWidth: `${Math.max(1, Math.round(window.devicePixelRatio)) / window.devicePixelRatio}px` };
  }));
  expect(referenceStrokes.length).toBe(2);
  for (const stroke of referenceStrokes) {
    expect(stroke.radius).toBe('0px');
    expect(stroke.width).toBe(stroke.expectedWidth);
  }

  const nativeAnchor = await page.evaluate(() => {
    const scatter = window.Components?.scatter;
    const root = scatter?.__ensureHotForActiveTab?.()?.rootElement;
    const outline = root?.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="1"]');
    const outlineRect = outline?.getBoundingClientRect();
    const candidates = Array.from(root?.querySelectorAll('.ag-row .ag-cell[col-id="c1"]') || []);
    const cell = candidates.find(candidate => {
      const rect = candidate.getBoundingClientRect();
      return outlineRect && Math.abs(outlineRect.left - rect.left - 1) < 0.5
        && Math.abs(outlineRect.top - rect.top - 1) < 0.5;
    });
    const viewportX = root?.querySelector('.ag-center-cols-viewport');
    const viewportY = root?.querySelector('.ag-body-viewport');
    if (!outline || !cell || !viewportX || !viewportY) return null;
    const measure = () => {
      const outlineRect = outline.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      return { left: outlineRect.left - cellRect.left, top: outlineRect.top - cellRect.top };
    };
    const before = measure();
    const pane = cell.closest('.ag-row')?.parentElement;
    const layer = outline.parentElement;
    const maxX = Math.max(0, viewportX.scrollWidth - viewportX.clientWidth);
    const maxY = Math.max(0, viewportY.scrollHeight - viewportY.clientHeight);
    const previousX = viewportX.scrollLeft;
    const previousY = viewportY.scrollTop;
    viewportX.scrollLeft = Math.min(maxX, previousX + 16);
    viewportY.scrollTop = Math.min(maxY, previousY + 16);
    return {
      native: layer?.classList.contains('hot-grid-selection-layer') && layer.parentElement === pane,
      detachedOverlayExists: !!root.querySelector('.hot-formula-ref-overlay'),
      horizontalScrollChanged: viewportX.scrollLeft > previousX,
      verticalScrollChanged: viewportY.scrollTop > previousY,
      before,
      after: measure()
    };
  });
  expect(nativeAnchor?.native).toBe(true);
  expect(nativeAnchor?.detachedOverlayExists).toBe(false);
  expect(nativeAnchor?.horizontalScrollChanged).toBe(true);
  expect(nativeAnchor?.verticalScrollChanged).toBe(true);
  expect(nativeAnchor?.after.left).toBeCloseTo(nativeAnchor.before.left, 1);
  expect(nativeAnchor?.after.top).toBeCloseTo(nativeAnchor.before.top, 1);

  await editorInput.press('Enter');

  await expect.poll(async () => {
    return await page.evaluate(({ visualRow, bodyRow }) => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      const api = hot?.gridApi;
      if(!hot || !api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function'){
        return null;
      }
      const node = api.getDisplayedRowAtIndex(bodyRow);
      if(!node){
        return null;
      }
      const displayed = api.getValue('c3', node);
      const raw = hot.getDataAtCell(visualRow, 3);
      return {
        displayed: displayed == null ? '' : String(displayed).trim(),
        raw: raw == null ? '' : String(raw).trim()
      };
    }, target);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toEqual({ displayed: '12', raw: '=B1+C1' });

  await page.evaluate((visualRow) => {
    const scatter = window.Components.scatter;
    const hot = scatter.__ensureHotForActiveTab();
    const physicalRow = hot.toPhysicalRow?.(visualRow) ?? visualRow;
    let bodyRow = null;
    hot.gridApi?.forEachNode?.(node => {
      if(bodyRow == null && Number(node?.data?.__rowIndex) === physicalRow){
        bodyRow = node.rowIndex;
      }
    });
    if(Number.isInteger(bodyRow)){
      hot.gridApi?.startEditingCell?.({ rowIndex: bodyRow, colKey: 'c3' });
    }
  }, target.visualRow);

  await expect(editorInput).toBeVisible();
  await expect(editorInput).toHaveValue('=B1+C1');

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      const root = hot?.rootElement;
      if(!root){
        return false;
      }
      const bOutline = root.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="1"]');
      const cOutline = root.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="2"]');
      return !!bOutline && !!cOutline;
    });
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  await editorInput.press('Escape');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      const api = hot?.gridApi;
      if(!api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function'){
        return '';
      }
      const node = api.getDisplayedRowAtIndex(rowIndex);
      if(!node){
        return '';
      }
      const value = api.getValue('c3', node);
      return value == null ? '' : String(value).trim();
    }, target.bodyRow);
  }).toBe('12');

  expect(issues.critical).toEqual([]);
});
