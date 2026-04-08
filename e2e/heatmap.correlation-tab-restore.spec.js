const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

function parseAspectRatio(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return NaN;
  }
  const ratioMatch = raw.match(/^([0-9.]+)\s*\/\s*([0-9.]+)$/);
  if (ratioMatch) {
    const numerator = Number(ratioMatch[1]);
    const denominator = Number(ratioMatch[2]);
    return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
      ? numerator / denominator
      : NaN;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : NaN;
}

async function waitForHeatmapCells(page) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect');
    return cells.length >= 9;
  }, null, { timeout: 60_000 });
}

async function setHeatmapView(page, view) {
  const current = await page.locator('#heatmapView').inputValue();
  if (current === view) {
    return;
  }
  await page.selectOption('#heatmapView', view);
  await page.waitForTimeout(300);
}

async function captureHeatmapGeometry(page) {
  return page.evaluate(() => {
    const svgBox = document.querySelector('#heatmapGraphPanel .svgbox');
    const svg = document.getElementById('heatmapSvg');
    const cellsGroup = svg?.querySelector('[data-export-layer="heatmap-cells"]');
    const asRect = target => {
      if (!target || typeof target.getBoundingClientRect !== 'function') {
        return null;
      }
      const rect = target.getBoundingClientRect();
      return {
        width: Number(rect.width.toFixed(3)),
        height: Number(rect.height.toFixed(3))
      };
    };
    const dataset = svgBox?.dataset || null;
    return {
      svgBox: asRect(svgBox),
      svg: asRect(svg),
      cells: asRect(cellsGroup),
      viewBox: svg?.getAttribute('viewBox') || '',
      preserveAspectRatio: svg?.getAttribute('preserveAspectRatio') || '',
      graphAspectRatio: svgBox?.style?.getPropertyValue('--graph-aspect-ratio') || '',
      styleAspectRatio: svgBox?.style?.aspectRatio || '',
      datasetAspectRatio: dataset?.resizerAspectRatio || '',
      aspectLocked: dataset?.resizerAspectLocked || '',
      defaultWidth: dataset?.resizerDefaultWidth || '',
      defaultHeight: dataset?.resizerDefaultHeight || ''
    };
  });
}

async function openSecondTab(page, component) {
  await openComponentFromWelcome(page, component, { first: false });
}

for (const scenario of [
  { view: 'corr-columns', label: 'Correlation (columns)' },
  { view: 'corr-rows', label: 'Correlation (rows)' }
]) {
  test(`Heatmap tab restore preserves ${scenario.label} geometry`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await setHeatmapView(page, scenario.view);
    const empty = await captureHeatmapGeometry(page);

    await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
    await waitForHeatmapCells(page);
    await page.waitForTimeout(900);

    const initialTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(initialTabId).toBeTruthy();

    const initial = await captureHeatmapGeometry(page);
    expect(initial.aspectLocked).toBe('true');
    expect(parseAspectRatio(initial.graphAspectRatio)).toBeGreaterThan(1);
    expect(initial.styleAspectRatio).toBe('');
    expect(Math.abs(initial.svgBox.width - empty.svgBox.width)).toBeLessThan(2);
    expect(Math.abs(initial.svgBox.height - empty.svgBox.height)).toBeLessThan(2);

    await openSecondTab(page, { type: 'box', pageId: 'boxPage' });
    await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
    await page.waitForTimeout(400);

    await page.evaluate((tabId) => {
      document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)?.click();
    }, initialTabId);
    await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
    await page.waitForTimeout(900);

    const restored = await captureHeatmapGeometry(page);

    expect(restored.aspectLocked).toBe('true');
    expect(restored.preserveAspectRatio).toBe('xMidYMid meet');
    expect(Math.abs(restored.svgBox.width - initial.svgBox.width)).toBeLessThan(2);
    expect(Math.abs(restored.svgBox.height - initial.svgBox.height)).toBeLessThan(2);
    expect(Math.abs(restored.svg.width - initial.svg.width)).toBeLessThan(2);
    expect(Math.abs(restored.svg.height - initial.svg.height)).toBeLessThan(2);
    expect(Math.abs(parseAspectRatio(restored.graphAspectRatio) - parseAspectRatio(initial.graphAspectRatio))).toBeLessThan(0.02);
    expect(restored.styleAspectRatio).toBe('');
  });
}
