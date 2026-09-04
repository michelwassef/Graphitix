const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function openLabelFontPanel(page, role) {
  const label = page.locator(`#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="${role}"]`).first();
  await label.dispatchEvent('click');
  const size = page.locator('.font-controls-panel[data-open="1"] .font-controls-panel__input--size');
  await expect(size).toBeVisible();
  return size;
}

async function readLabelFontState(page, role) {
  return page.evaluate(labelRole => {
    const label = document.querySelector(`#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="${labelRole}"]`);
    const size = document.querySelector('.font-controls-panel[data-open="1"] .font-controls-panel__input--size');
    const rawPx = Number.parseFloat(label?.getAttribute('font-size') || getComputedStyle(label).fontSize);
    const displayScale = Number(label?.dataset?.fontSizeDisplayScale);
    return {
      rawPx,
      displayScale,
      toolbarPt: Number(size?.value),
      expectedPt: rawPx * displayScale * 0.75
    };
  }, role);
}

async function readDisplayedLabelPoints(page, role, count = 2) {
  return page.evaluate(({ labelRole, limit }) => Array.from(document.querySelectorAll(
    `#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="${labelRole}"]`
  )).slice(0, limit).map(label => {
    const rawPx = Number.parseFloat(label.getAttribute('font-size') || getComputedStyle(label).fontSize);
    const displayScale = Number(label.dataset.fontSizeDisplayScale);
    return rawPx * displayScale * 0.75;
  }), { labelRole: role, limit: count });
}

async function applyScopedFontSize(page, { scope, sizePt }) {
  await page.evaluate(({ scopeValue, value }) => {
    const panel = document.querySelector('.font-controls-panel[data-open="1"]');
    const scopeInput = panel?.querySelector('.font-controls-panel__field--scope select');
    const size = panel?.querySelector('input[aria-label="Font size"]');
    scopeInput.value = scopeValue;
    scopeInput.dispatchEvent(new Event('change', { bubbles: true }));
    size.value = String(value);
    size.dispatchEvent(new Event('change', { bubbles: true }));
  }, { scopeValue: scope, value: sizePt });
}

async function waitForDisplayedLabelPoint(page, role, index, expectedPt) {
  await page.waitForFunction(({ labelRole, labelIndex, expected }) => {
    const labels = document.querySelectorAll(
      `#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="${labelRole}"]`
    );
    const label = labels[labelIndex];
    if(!label){ return false; }
    const rawPx = Number.parseFloat(label.getAttribute('font-size') || getComputedStyle(label).fontSize);
    const displayScale = Number(label.dataset.fontSizeDisplayScale);
    const displayedPt = rawPx * displayScale * 0.75;
    return Number.isFinite(displayedPt) && Math.abs(displayedPt - expected) < 0.15;
  }, { labelRole: role, labelIndex: index, expected: expectedPt });
}

async function readVisibleScopeOptions(page) {
  return page.locator('.font-controls-panel[data-open="1"] .font-controls-panel__field--scope select')
    .evaluate(select => Array.from(select.options)
      .filter(option => !option.hidden && !option.disabled)
      .map(option => ({ value: option.value, label: option.textContent })));
}

async function applyCollectionFontStyle(page, { family, sizePt }) {
  await page.evaluate(style => {
    const panel = document.querySelector('.font-controls-panel[data-open="1"]');
    const scope = panel?.querySelector('.font-controls-panel__field--scope select');
    const font = panel?.querySelector('input[aria-label="Font family"]');
    const size = panel?.querySelector('input[aria-label="Font size"]');
    scope.value = 'collection';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    font.value = style.family;
    font.dispatchEvent(new Event('change', { bubbles: true }));
    size.value = String(style.sizePt);
    size.dispatchEvent(new Event('change', { bubbles: true }));
  }, { family, sizePt });
}

test('Heatmap Selection font size changes only the selected dense label', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('#heatmapSvg text[data-font-role="rowLabel"]');
    const columns = document.querySelectorAll('#heatmapSvg text[data-font-role="columnLabel"]');
    return rows.length > 1
      && columns.length > 1
      && Number(rows[0]?.dataset?.fontSizeDisplayScale) > 0
      && Number(columns[0]?.dataset?.fontSizeDisplayScale) > 0;
  });

  const baselineRows = await readDisplayedLabelPoints(page, 'rowLabel');
  const baselineColumns = await readDisplayedLabelPoints(page, 'columnLabel');

  await openLabelFontPanel(page, 'rowLabel');
  await applyScopedFontSize(page, { scope: 'selection', sizePt: 5 });
  await waitForDisplayedLabelPoint(page, 'rowLabel', 0, 5);

  const rowSelectionRows = await readDisplayedLabelPoints(page, 'rowLabel');
  const rowSelectionColumns = await readDisplayedLabelPoints(page, 'columnLabel');
  expect(rowSelectionRows[0]).toBeCloseTo(5, 1);
  expect(rowSelectionRows[1]).toBeCloseTo(baselineRows[1], 1);
  expect(rowSelectionColumns[0]).toBeCloseTo(baselineColumns[0], 1);
  expect(rowSelectionColumns[1]).toBeCloseTo(baselineColumns[1], 1);

  await page.keyboard.press('Escape');
  await openLabelFontPanel(page, 'columnLabel');
  await applyScopedFontSize(page, { scope: 'selection', sizePt: 6 });
  await waitForDisplayedLabelPoint(page, 'columnLabel', 0, 6);

  const columnSelectionRows = await readDisplayedLabelPoints(page, 'rowLabel');
  const columnSelectionColumns = await readDisplayedLabelPoints(page, 'columnLabel');
  expect(columnSelectionColumns[0]).toBeCloseTo(6, 1);
  expect(columnSelectionColumns[1]).toBeCloseTo(baselineColumns[1], 1);
  expect(columnSelectionRows[0]).toBeCloseTo(5, 1);
  expect(columnSelectionRows[1]).toBeCloseTo(baselineRows[1], 1);
});

test('Heatmap label toolbar reports the rendered SVG font size through live resize', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await page.waitForFunction(() => {
    const row = document.querySelector('#heatmapSvg text[data-font-role="rowLabel"]');
    const column = document.querySelector('#heatmapSvg text[data-font-role="columnLabel"]');
    return Number(row?.dataset?.fontSizeDisplayScale) > 0
      && Number(column?.dataset?.fontSizeDisplayScale) > 0;
  });

  let size = await openLabelFontPanel(page, 'rowLabel');
  const before = await readLabelFontState(page, 'rowLabel');
  expect(before.toolbarPt).toBeCloseTo(before.expectedPt, 2);
  expect(before.toolbarPt).toBeLessThan(12);
  expect(await readVisibleScopeOptions(page)).toEqual([
    { value: 'selection', label: 'Selection' },
    { value: 'collection', label: 'Row labels' },
    { value: 'graph', label: 'Graph' }
  ]);
  await applyCollectionFontStyle(page, { family: 'Georgia', sizePt: 10 });
  await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('#heatmapSvg text[data-font-role="rowLabel"]'));
    const columns = Array.from(document.querySelectorAll('#heatmapSvg text[data-font-role="columnLabel"]'));
    return rows.length > 0
      && rows.every(node => node.getAttribute('font-family') === 'Georgia')
      && columns.every(node => node.getAttribute('font-family') !== 'Georgia');
  });
  const appliedRow = await readLabelFontState(page, 'rowLabel');
  const columnsAfterRowCollection = await readDisplayedLabelPoints(page, 'columnLabel');
  expect(appliedRow.expectedPt).toBeCloseTo(10, 1);
  expect(Number(await size.inputValue())).toBeCloseTo(10, 2);
  // The automatic opposite role may refit after the edited role changes the label rail.
  expect(columnsAfterRowCollection[0]).toBeGreaterThan(0);
  expect(columnsAfterRowCollection[1]).toBeGreaterThan(0);
  const rowLegendGap = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#heatmapSvg text[data-font-role="rowLabel"]'));
    const legend = document.querySelector('#heatmapSvg [data-heatmap-color-scale-bar="1"]');
    const rowRight = Math.max(...rows.map(node => node.getBoundingClientRect().right));
    return legend.getBoundingClientRect().left - rowRight;
  });
  expect(rowLegendGap).toBeGreaterThanOrEqual(6);

  await page.keyboard.press('Escape');
  const handle = page.locator('#heatmapGraphPanel .svgbox .resizer-vertical').first();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  size = await openLabelFontPanel(page, 'rowLabel');
  await page.locator('.font-controls-panel[data-open="1"] .font-controls-panel__field--scope select')
    .selectOption('collection');
  const resizedRow = await readLabelFontState(page, 'rowLabel');
  expect(resizedRow.toolbarPt).toBeCloseTo(resizedRow.expectedPt, 2);
  expect(resizedRow.toolbarPt).toBeCloseTo(appliedRow.toolbarPt, 2);
  expect(resizedRow.displayScale).not.toBeCloseTo(before.displayScale, 4);
  await expect(page.locator('#heatmapSvg text[data-font-role="rowLabel"]').first()).toHaveAttribute('font-family', 'Georgia');

  await page.keyboard.press('Escape');
  size = await openLabelFontPanel(page, 'columnLabel');
  const resizedColumn = await readLabelFontState(page, 'columnLabel');
  expect(resizedColumn.toolbarPt).toBeCloseTo(resizedColumn.expectedPt, 2);
  expect(Number(await size.inputValue())).toBeCloseTo(resizedColumn.expectedPt, 2);
  expect(await readVisibleScopeOptions(page)).toEqual([
    { value: 'selection', label: 'Selection' },
    { value: 'collection', label: 'Column labels' },
    { value: 'graph', label: 'Graph' }
  ]);
  await applyCollectionFontStyle(page, { family: 'Verdana', sizePt: 9 });
  await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('#heatmapSvg text[data-font-role="rowLabel"]'));
    const columns = Array.from(document.querySelectorAll('#heatmapSvg text[data-font-role="columnLabel"]'));
    return columns.length > 0
      && columns.every(node => node.getAttribute('font-family') === 'Verdana')
      && rows.every(node => node.getAttribute('font-family') === 'Georgia');
  });
  const appliedColumn = await readLabelFontState(page, 'columnLabel');
  const rowsAfterColumnCollection = await readDisplayedLabelPoints(page, 'rowLabel');
  expect(appliedColumn.expectedPt).toBeCloseTo(9, 1);
  expect(Number(await size.inputValue())).toBeCloseTo(9, 2);
  expect(rowsAfterColumnCollection[0]).toBeGreaterThan(0);
  expect(rowsAfterColumnCollection[1]).toBeGreaterThan(0);

  const exported = await page.evaluate(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    const clone = window.Components?.heatmap?.__testHooks?.buildExportSvgFromSource?.(svg);
    const rows = Array.from(clone?.querySelectorAll?.('text[data-font-role="rowLabel"]') || []);
    const columns = Array.from(clone?.querySelectorAll?.('text[data-font-role="columnLabel"]') || []);
    return {
      rowCount: rows.length,
      columnCount: columns.length,
      rowFamilies: Array.from(new Set(rows.map(node => node.getAttribute('font-family')))),
      columnFamilies: Array.from(new Set(columns.map(node => node.getAttribute('font-family')))),
      rowFontSizes: Array.from(new Set(rows.map(node => node.getAttribute('font-size')))),
      columnFontSizes: Array.from(new Set(columns.map(node => node.getAttribute('font-size'))))
    };
  });
  expect(exported.rowCount).toBeGreaterThan(0);
  expect(exported.columnCount).toBeGreaterThan(0);
  expect(exported.rowFamilies).toEqual(['Georgia']);
  expect(exported.columnFamilies).toEqual(['Verdana']);
  expect(exported.rowFontSizes).toHaveLength(1);
  expect(exported.columnFontSizes).toHaveLength(1);
});
