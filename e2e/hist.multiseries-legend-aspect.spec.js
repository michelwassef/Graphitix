const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const HISTOGRAM = COMPONENT_MATRIX.find(component => component.type === 'hist');

async function renderHistogram(page, data, reason) {
  await page.evaluate(async ({ matrix, drawReason }) => {
    const component = window.Components?.hist;
    const tab = window.Main?.tabs?.getActiveTab?.();
    const payload = component?.createEmptyPayload?.();
    if (!component || !payload || !tab) {
      throw new Error('Histogram workspace is not ready');
    }
    payload.data = matrix;
    component.loadFromPayload(payload, {
      source: drawReason,
      tab,
      tabId: tab.id,
      skipDraw: true
    });
    await component.draw({ reason: drawReason, tabId: tab.id });
  }, { matrix: data, drawReason: reason });
  await page.waitForFunction(() => {
    const svg = document.querySelector('#histPage:not([hidden]) #histSvg');
    return svg?.querySelector?.('text[data-font-role="graphTitle"]');
  }, null, { timeout: 30_000 });
}

async function captureGeometry(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#histPage:not([hidden]) #histSvg');
    const title = svg?.querySelector?.('text[data-font-role="graphTitle"]');
    const matrix = title?.getScreenCTM?.();
    const rect = svg?.getBoundingClientRect?.();
    const viewBox = String(svg?.getAttribute?.('viewBox') || '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    return {
      preserveAspectRatio: svg?.getAttribute?.('preserveAspectRatio') || '',
      scaleX: matrix ? Math.hypot(matrix.a, matrix.b) : NaN,
      scaleY: matrix ? Math.hypot(matrix.c, matrix.d) : NaN,
      renderedWidth: rect?.width || 0,
      renderedHeight: rect?.height || 0,
      viewBox,
      legendCount: svg?.querySelectorAll?.('text[data-font-role="legend"]')?.length || 0
    };
  });
}

test('Histogram multi-series legends preserve uniform graph and font scaling', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  const values = [38, 42, 45, 50, 55, 62, 70, 78, 86, 94];
  await renderHistogram(page, [
    ['Control'],
    ...values.map(value => [value])
  ], 'e2e-hist-single-series-aspect');
  const single = await captureGeometry(page);

  await renderHistogram(page, [
    ['Control', 'Treatment'],
    ...values.map((value, index) => [value, value + (index % 3) + 2])
  ], 'e2e-hist-multi-series-aspect');
  const multiple = await captureGeometry(page);

  expect(single.preserveAspectRatio).toBe('xMidYMid meet');
  expect(multiple.preserveAspectRatio).toBe('xMidYMid meet');
  expect(multiple.legendCount).toBe(2);
  expect(Math.abs(single.scaleX - single.scaleY)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(multiple.scaleX - multiple.scaleY)).toBeLessThanOrEqual(0.01);
  expect(multiple.scaleX).toBeGreaterThanOrEqual(single.scaleX * 0.95);
});
