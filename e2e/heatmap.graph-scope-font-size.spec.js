const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function getHeatmapDrawPerf(page) {
  return page.evaluate(() => {
    const hook = window.Components?.heatmap?.__testHooks?.getPerformance?.();
    return hook?.performance?.draw || null;
  });
}

async function waitForHeatmapDrawAdvance(page, previousTimestamp, timeout = 60_000) {
  await page.waitForFunction(prev => {
    const hook = window.Components?.heatmap?.__testHooks?.getPerformance?.();
    const draw = hook?.performance?.draw || null;
    return Number(draw?.timestamp || 0) > Number(prev || 0);
  }, previousTimestamp, { timeout });
  return getHeatmapDrawPerf(page);
}

test.describe('Heatmap graph-scope font sizing', () => {
  test('changing font size in graph scope from a selected cell value keeps row/column labels visible', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
    await page.waitForTimeout(1200);

    const showValues = page.locator('#heatmapPage:not([hidden]) #heatmapShowValues');
    if(!(await showValues.isChecked())){
      await showValues.check({ force: true });
      await page.waitForFunction(() => (
        document.querySelectorAll('#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="cellValue"]').length > 0
      ));
    }

    let previous = await getHeatmapDrawPerf(page);
    expect(previous).toBeTruthy();

    const whiteCellValue = page.locator('#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="cellValue"][fill="rgb(255,255,255)"]').first();
    if(await whiteCellValue.count()){
      await whiteCellValue.click();
    }else{
      await page.locator('#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="cellValue"]').first().click();
    }

    await page.waitForFunction(() => {
      const panel = document.querySelector('.font-controls-panel[data-open="1"]');
      if(!panel){ return false; }
      const scope = panel.querySelector('.font-controls-panel__field--scope select');
      const size = panel.querySelector('.font-controls-panel__input--size');
      return !!scope && !!size;
    });

    await page.evaluate(() => {
      const panel = document.querySelector('.font-controls-panel[data-open="1"]');
      if(!panel){ return; }
      const scope = panel.querySelector('.font-controls-panel__field--scope select');
      const size = panel.querySelector('.font-controls-panel__input--size');
      if(scope){
        scope.value = 'graph';
        scope.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if(size){
        size.value = '16';
        size.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    previous = await waitForHeatmapDrawAdvance(page, previous?.timestamp || 0);
    expect(previous).toBeTruthy();

    const visibility = await page.evaluate(() => {
      const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
      if(!svg){
        return { ok: false, reason: 'missing-svg' };
      }
      const row = svg.querySelector('text[data-font-role="rowLabel"]');
      const col = svg.querySelector('text[data-font-role="columnLabel"]');
      if(!row || !col){
        return { ok: false, reason: 'missing-row-or-column-label', hasRow: !!row, hasCol: !!col };
      }
      const svgRect = svg.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const rowFill = (row.getAttribute('fill') || getComputedStyle(row).fill || '').replace(/\s+/g, '').toLowerCase();
      const colFill = (col.getAttribute('fill') || getComputedStyle(col).fill || '').replace(/\s+/g, '').toLowerCase();
      const isWhite = value => (
        value === '#fff'
        || value === '#ffffff'
        || value === 'white'
        || value === 'rgb(255,255,255)'
      );
      const within = rect => (
        Number.isFinite(rect.left)
        && Number.isFinite(rect.right)
        && Number.isFinite(rect.top)
        && Number.isFinite(rect.bottom)
        && rect.width > 0
        && rect.height > 0
        && rect.right >= svgRect.left - 1
        && rect.left <= svgRect.right + 1
        && rect.bottom >= svgRect.top - 1
        && rect.top <= svgRect.bottom + 1
      );
      return {
        ok: true,
        rowVisible: within(rowRect),
        colVisible: within(colRect),
        rowFill,
        colFill,
        rowWhite: isWhite(rowFill),
        colWhite: isWhite(colFill)
      };
    });

    expect(visibility.ok, JSON.stringify(visibility)).toBe(true);
    expect(visibility.rowVisible, JSON.stringify(visibility)).toBe(true);
    expect(visibility.colVisible, JSON.stringify(visibility)).toBe(true);
    expect(visibility.rowWhite, JSON.stringify(visibility)).toBe(false);
    expect(visibility.colWhite, JSON.stringify(visibility)).toBe(false);
  });

  test('changing Scale font size produces one settled redraw', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
    await page.waitForSelector('#heatmapPage:not([hidden]) #heatmapSvg .heatmap-color-scale text[data-font-role="scaleTick"]');

    const before = await getHeatmapDrawPerf(page);
    const tick = page.locator('#heatmapPage:not([hidden]) #heatmapSvg .heatmap-color-scale text[data-font-role="scaleTick"]').first();
    await tick.click();
    await expect(page.locator('.font-controls-panel[data-open="1"] .font-controls-panel__field--scope select')).toHaveValue('scale');
    await expect(page.locator('input[aria-label="Legend border width"]')).toBeHidden();
    await expect(page.locator('select[aria-label="Legend border style"]')).toBeHidden();
    await expect(page.locator('input[aria-label="Legend border transparency"]')).toBeHidden();

    await page.evaluate(() => {
      const size = document.querySelector('.font-controls-panel[data-open="1"] .font-controls-panel__input--size');
      size.value = '20';
      size.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const settled = await waitForHeatmapDrawAdvance(page, before?.timestamp || 0);
    await expect(page.locator('#heatmapPage:not([hidden]) #heatmapSvg .heatmap-color-scale text[data-font-role="scaleTick"]').first())
      .toHaveAttribute('font-size', '26.67px');
    await page.waitForTimeout(1000);
    const later = await getHeatmapDrawPerf(page);

    expect(Number(later?.sequence) - Number(settled?.sequence)).toBeLessThanOrEqual(1);
  });
});
