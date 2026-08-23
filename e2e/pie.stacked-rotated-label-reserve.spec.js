const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('Pie stacked view keeps rotated x-axis labels inside its SVG viewport', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage' }, { first: true, loadExample: true });

  await page.evaluate(() => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const hot = window.Shared?.hot?.__tabTablePools?.pie?.byTab?.[tabId]?.instance || null;
    if (!hot) throw new Error('Pie owner table is unavailable');
    const data = [
      ['Category', 'Long control cohort', 'Long treatment cohort'],
      ['Responders', 42, 58],
      ['Non-responders', 58, 42]
    ];
    hot.loadData(data, { source: 'e2e-stacked-label-fixture', suppressSchedule: true });
    window.Shared?.hot?.syncOwnerTabPayloadFullData?.(data, 'e2e-stacked-label-fixture', {
      source: 'e2e-stacked-label-fixture', hotInstance: hot, tabId, affectsAnalysis: true
    });
  });
  await page.locator('#pieChartType').selectOption('stacked');
  await page.evaluate(async () => {
    const svgBox = document.querySelector('#pieGraphPanel .svgbox');
    const rect = svgBox?.getBoundingClientRect?.();
    if(!svgBox || !rect || typeof window.Shared?.applyResizableBoxSize !== 'function'){
      throw new Error('Pie graph resizer is unavailable');
    }
    const lock = svgBox.querySelector('.resizer-aspect-checkbox');
    if(lock?.checked){
      lock.checked = false;
      lock.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.Shared.applyResizableBoxSize(svgBox, {
      width: 300,
      height: rect.height,
      axis: 'both',
      forceExact: true,
      preserveAspectLock: false,
      reason: 'e2e-pie-narrow-rotated-labels'
    });
    await window.Components.pie.draw({ reason: 'e2e-pie-narrow-rotated-labels' });
  });
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pieSvg');
    const labels = svg?.querySelectorAll?.('text[transform*="rotate(-45"]');
    return labels?.length === 2;
  }, null, { timeout: 30_000 });

  const geometry = await page.evaluate(() => {
    const svg = document.querySelector('#pieSvg');
    const svgRect = svg.getBoundingClientRect();
    const labels = Array.from(svg.querySelectorAll('text[transform*="rotate(-45"]'));
    const verticalAxes = Array.from(svg.querySelectorAll('line')).map(line => ({
      x1: Number(line.getAttribute('x1')),
      x2: Number(line.getAttribute('x2')),
      y1: Number(line.getAttribute('y1')),
      y2: Number(line.getAttribute('y2'))
    })).filter(line => [line.x1, line.x2, line.y1, line.y2].every(Number.isFinite)
      && Math.abs(line.x1 - line.x2) < 0.25
      && Math.abs(line.y2 - line.y1) > 20);
    const yAxis = verticalAxes.sort((a, b) => Math.abs(b.y2 - b.y1) - Math.abs(a.y2 - a.y1))[0];
    const firstBarX = Math.min(...Array.from(svg.querySelectorAll('rect[data-pie-trace="1"]'))
      .map(rect => Number(rect.getAttribute('x')))
      .filter(Number.isFinite));
    return {
      extension: Number(svg.closest('.svgbox')?.dataset?.pieAutoReserveExtensionPx) || 0,
      axisDatasetGap: firstBarX - yAxis.x1,
      labels: labels.map(label => {
        const rect = label.getBoundingClientRect();
        return {
          text: label.textContent,
          left: rect.left - svgRect.left,
          right: svgRect.right - rect.right,
          top: rect.top - svgRect.top,
          bottom: svgRect.bottom - rect.bottom
        };
      })
    };
  });

  expect(geometry.extension).toBeGreaterThan(0);
  expect(geometry.axisDatasetGap).toBeGreaterThanOrEqual(0);
  expect(geometry.axisDatasetGap).toBeLessThanOrEqual(10);
  expect(geometry.labels).toHaveLength(2);
  geometry.labels.forEach(label => {
    expect(label.left, label.text).toBeGreaterThanOrEqual(-1);
    expect(label.right, label.text).toBeGreaterThanOrEqual(-1);
    expect(label.top, label.text).toBeGreaterThanOrEqual(-1);
    expect(label.bottom, label.text).toBeGreaterThanOrEqual(-1);
  });
});
