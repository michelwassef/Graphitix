const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForHeatmapCells(page) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect');
    return cells.length >= 9;
  }, null, { timeout: 60_000 });
}

async function activeHeatmapStatus(page) {
  return page.evaluate(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect').length;
    const overlay = !!document.querySelector('#heatmapGraphPanel .venn-loading-overlay');
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    return { activeTabId, cells, overlay };
  });
}

async function captureHeatmapVisualSignature(page) {
  return page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    const rowLabel = svg?.querySelector('text[data-font-role="rowLabel"]') || null;
    const columnLabel = svg?.querySelector('text[data-font-role="columnLabel"]') || null;
    const cellRect = svg?.querySelector('[data-export-layer="heatmap-cells"] rect') || null;
    const cellValue = svg?.querySelector('text[data-font-role="cellValue"]') || null;
    const fontPx = node => {
      if (!node || typeof getComputedStyle !== 'function') {
        return NaN;
      }
      const parsed = Number.parseFloat(String(getComputedStyle(node).fontSize || '').trim());
      return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : NaN;
    };
    const box = target => {
      if (!target || typeof target.getBoundingClientRect !== 'function') {
        return null;
      }
      const rect = target.getBoundingClientRect();
      return { width: Number(rect.width.toFixed(3)), height: Number(rect.height.toFixed(3)) };
    };
    const cellRectBounds = cellRect?.getBoundingClientRect?.() || null;
    const cellValueBounds = cellValue?.getBoundingClientRect?.() || null;
    const ratio = (
      cellRectBounds
      && cellValueBounds
      && Number.isFinite(cellRectBounds.height)
      && cellRectBounds.height > 0
      && Number.isFinite(cellValueBounds.height)
    )
      ? Number((cellValueBounds.height / cellRectBounds.height).toFixed(4))
      : NaN;
    return {
      rowFontPx: fontPx(rowLabel),
      columnFontPx: fontPx(columnLabel),
      cellFontPx: fontPx(cellValue),
      rowRect: box(rowLabel),
      columnRect: box(columnLabel),
      cellRect: box(cellRect),
      cellValueRect: box(cellValue),
      cellValueToCellHeightRatio: ratio
    };
  });
}

function expectNear(actual, expected, tolerance, label) {
  expect(Number.isFinite(actual), `${label}: actual is not finite (${actual})`).toBe(true);
  expect(Number.isFinite(expected), `${label}: expected is not finite (${expected})`).toBe(true);
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

async function openSecondHeatmapTab(page, reuse = false) {
  await page.locator('#addWorkspaceTab').click();
  const resolveDuplicatePrompt = async () => {
    const prompt = page.locator('#duplicatePrompt:not([hidden])');
    if (!(await prompt.count())) {
      return false;
    }
    if (reuse) {
      await page.locator('#duplicateReuse').click({ force: true });
    } else {
      await page.locator('#duplicateEmpty').click({ force: true });
    }
    await page.waitForTimeout(200);
    return true;
  };
  if (!(await resolveDuplicatePrompt())) {
    await page.locator('#graphSelectionGrid [data-graph-type="heatmap"]').first().click({ force: true });
    await resolveDuplicatePrompt();
  }
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
}

test('Heatmap example load works in two heatmap tabs', async ({ page }) => {
  test.setTimeout(120_000);
  const lifecycleOwnershipWarnings = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('component lifecycle skipped without explicit tab id')) {
      lifecycleOwnershipWarnings.push(text);
    }
  });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  const first = await activeHeatmapStatus(page);
  expect(first.overlay).toBe(false);
  expect(first.cells).toBeGreaterThanOrEqual(9);
  const firstSignature = await captureHeatmapVisualSignature(page);

  const firstTabId = first.activeTabId;
  expect(firstTabId).toBeTruthy();

  await openSecondHeatmapTab(page, false);
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  const second = await activeHeatmapStatus(page);
  expect(second.overlay).toBe(false);
  expect(second.cells).toBeGreaterThanOrEqual(9);

  await page.evaluate((tabId) => {
    document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)?.click();
  }, firstTabId);
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
  await waitForHeatmapCells(page);
  const restoredFirst = await activeHeatmapStatus(page);
  expect(restoredFirst.overlay).toBe(false);
  expect(restoredFirst.cells).toBeGreaterThanOrEqual(9);
  const restoredFirstSignature = await captureHeatmapVisualSignature(page);
  expectNear(restoredFirstSignature.rowFontPx, firstSignature.rowFontPx, 0.7, 'row font size');
  expectNear(restoredFirstSignature.columnFontPx, firstSignature.columnFontPx, 0.7, 'column font size');
  expectNear(restoredFirstSignature.cellFontPx, firstSignature.cellFontPx, 0.7, 'cell value font size');
  expectNear(restoredFirstSignature.rowRect.height, firstSignature.rowRect.height, 2, 'row label height');
  expectNear(restoredFirstSignature.columnRect.width, firstSignature.columnRect.width, 2, 'column label width');
  expectNear(restoredFirstSignature.cellRect.height, firstSignature.cellRect.height, 2, 'cell height');
  expectNear(restoredFirstSignature.cellValueRect.height, firstSignature.cellValueRect.height, 2, 'cell value height');
  expectNear(
    restoredFirstSignature.cellValueToCellHeightRatio,
    firstSignature.cellValueToCellHeightRatio,
    0.08,
    'cell value/cell height ratio'
  );
  expect(lifecycleOwnershipWarnings).toEqual([]);
});
