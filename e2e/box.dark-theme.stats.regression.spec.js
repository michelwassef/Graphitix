const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readBoxVisualMetrics() {
  const svg = document.querySelector('#boxPlot svg');
  if (!svg) {
    return null;
  }
  const backgroundRect = svg.querySelector('[data-color-scheme-background="1"]');
  const bgFill = String(backgroundRect?.getAttribute('fill') || '').trim().toLowerCase();
  const svgBox = document.querySelector('#boxGraphPanel .svgbox');
  const plotRoot = document.getElementById('boxPlot');
  const boxBg = String(svgBox ? window.getComputedStyle(svgBox).backgroundColor : '').trim().toLowerCase();
  const plotBg = String(plotRoot ? window.getComputedStyle(plotRoot).backgroundColor : '').trim().toLowerCase();
  const pointNodes = Array.from(
    document.querySelectorAll('#boxPlot g[data-export-layer="box-points"] circle, #boxPlot g[data-export-layer="box-points"] rect, #boxPlot g[data-export-layer="box-points"] path')
  );
  const visiblePoints = pointNodes.filter(node => {
    const computed = window.getComputedStyle(node);
    const fill = String(computed.fill || '').trim().toLowerCase();
    const opacity = Number(computed.opacity || '1');
    const fillOpacity = Number(computed.fillOpacity || '1');
    return computed.display !== 'none'
      && computed.visibility !== 'hidden'
      && Number.isFinite(opacity) && opacity > 0
      && Number.isFinite(fillOpacity) && fillOpacity > 0
      && fill !== 'none'
      && fill !== 'transparent'
      && fill !== 'rgba(0, 0, 0, 0)';
  });
  const sigPaths = Array.from(svg.querySelectorAll('path.box-significance-annotation'));
  const allPaths = Array.from(svg.querySelectorAll('path'));
  const visibleSigPaths = sigPaths.filter(node => {
    const computed = window.getComputedStyle(node);
    const stroke = String(computed.stroke || '').trim().toLowerCase();
    const opacity = Number(computed.opacity || '1');
    const strokeOpacity = Number(computed.strokeOpacity || '1');
    const strokeWidth = Number.parseFloat(computed.strokeWidth || '0');
    return computed.display !== 'none'
      && computed.visibility !== 'hidden'
      && Number.isFinite(opacity) && opacity > 0
      && Number.isFinite(strokeOpacity) && strokeOpacity > 0
      && Number.isFinite(strokeWidth) && strokeWidth > 0
      && stroke !== 'none'
      && stroke !== 'transparent'
      && stroke !== 'rgba(0, 0, 0, 0)';
  });
  const firstPoint = visiblePoints[0] || null;
  const firstSig = visibleSigPaths[0] || null;
  return {
    bgFill,
    boxBg,
    plotBg,
    pointCount: pointNodes.length,
    visiblePointCount: visiblePoints.length,
    firstPointFill: firstPoint ? String(window.getComputedStyle(firstPoint).fill || '').trim().toLowerCase() : '',
    sigPathCount: sigPaths.length,
    anyPathCount: allPaths.length,
    visibleSigPathCount: visibleSigPaths.length,
    firstSigStroke: firstSig ? String(window.getComputedStyle(firstSig).stroke || '').trim().toLowerCase() : ''
    ,
    firstSigOuterHTML: (sigPaths[0] && sigPaths[0].outerHTML) ? String(sigPaths[0].outerHTML).slice(0, 240) : ''
  };
}

test('box dark theme keeps significance and points visible and stats recalculable', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.locator('#boxLoadExample').click();
  await page.waitForTimeout(700);
  await page.locator('#boxGraphType').selectOption('strip');
  await page.waitForTimeout(400);

  const computeButton = page.locator('#boxComputeStats');
  await expect(computeButton).toBeEnabled({ timeout: 20_000 });
  await computeButton.click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });

  const significanceToggle = page.locator('#boxShowSignificance');
  await expect(significanceToggle).toBeVisible();
  if (!(await significanceToggle.isChecked())) {
    await significanceToggle.check();
    await page.waitForTimeout(450);
  }
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot .box-significance-annotation').length > 0, null, { timeout: 20_000 });

  await page.locator('#boxColorSchemeSelect').selectOption('dark');
  await page.waitForTimeout(900);

  const darkMetrics = await page.evaluate(readBoxVisualMetrics);
  expect(darkMetrics).not.toBeNull();
  const hasDarkSurface = darkMetrics.bgFill === '#000000'
    || darkMetrics.boxBg === 'rgb(0, 0, 0)'
    || darkMetrics.plotBg === 'rgb(0, 0, 0)';
  expect(hasDarkSurface).toBe(true);
  expect(darkMetrics.visiblePointCount).toBeGreaterThan(0);
  expect(darkMetrics.visibleSigPathCount).toBeGreaterThan(0);
  expect(['#000000', 'rgb(0, 0, 0)']).not.toContain(darkMetrics.firstSigStroke);

  if (await significanceToggle.isChecked()) {
    await significanceToggle.uncheck();
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot .box-significance-annotation').length === 0, null, { timeout: 20_000 });

  const afterToggleMetrics = await page.evaluate(readBoxVisualMetrics);
  expect(afterToggleMetrics).not.toBeNull();
  expect(afterToggleMetrics.visiblePointCount).toBeGreaterThan(0);
  expect(['#000000', 'rgb(0, 0, 0)']).not.toContain(afterToggleMetrics.firstPointFill);

  await expect(computeButton).toBeEnabled({ timeout: 20_000 });
  await computeButton.click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await expect(page.locator('#statsResults')).not.toBeEmpty();

  expect(issues.critical).toEqual([]);
});
