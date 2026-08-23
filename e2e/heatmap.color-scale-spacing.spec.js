const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function captureCorrelationRailLayout(page) {
  return page.evaluate(() => {
    const svgNode = document.querySelector('#heatmapSvg');
    const svg = svgNode?.getBoundingClientRect();
    const dendrogramNode = svgNode?.querySelector(
      '.heatmap-dendrogram[data-dendrogram-orientation="vertical"]'
    );
    const dendrogram = dendrogramNode?.getBoundingClientRect();
    const matrix = svgNode?.querySelector(
      '[data-export-layer="heatmap-cells"]'
    )?.getBoundingClientRect();
    const rowLabels = svgNode?.querySelector(
      '[data-layer="row-labels"]'
    )?.getBoundingClientRect();
    const columnLabels = svgNode?.querySelector(
      '[data-layer="column-labels"]'
    )?.getBoundingClientRect();
    const scale = svgNode?.querySelector(
      '[data-heatmap-color-scale-bar="1"]'
    )?.getBoundingClientRect();
    const rowLabel = svgNode?.querySelector('text[data-font-role="rowLabel"]');
    const columnLabel = svgNode?.querySelector('text[data-font-role="columnLabel"]');
    const readFontSize = node => Number.parseFloat(getComputedStyle(node).fontSize);
    return svg && dendrogram && matrix && rowLabels && columnLabels && scale ? {
      svgLeft: svg.left,
      dendrogramLeft: dendrogram.left,
      dendrogramRight: dendrogram.right,
      matrixLeft: matrix.left,
      matrixTop: matrix.top,
      matrixRight: matrix.right,
      rowLabelsLeft: rowLabels.left,
      rowLabelsRight: rowLabels.right,
      columnLabelsBottom: columnLabels.bottom,
      scaleLeft: scale.left,
      rowLabelFontSize: readFontSize(rowLabel),
      columnLabelFontSize: readFontSize(columnLabel),
      targetGap: Number(svgNode?.dataset?.heatmapLegendGapPx),
      dendrogramLineCap: dendrogramNode?.getAttribute('stroke-linecap') || null
    } : null;
  });
}

test('large correlation Heatmap places dendrogram left and row labels right of the matrix', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => {
    const svg = document.getElementById('heatmapSvg');
    return svg?.dataset?.heatmapModelType === 'correlation'
      && Number(svg?.dataset?.heatmapRowLabelCount || 0) >= 20
      && !!svg.querySelector('.heatmap-dendrogram[data-dendrogram-orientation="vertical"]')
      && !!svg.querySelector('[data-heatmap-color-scale-bar="1"]');
  }, null, { timeout: 90_000 });

  const layout = await captureCorrelationRailLayout(page);

  expect(layout).toBeTruthy();
  expect(layout.dendrogramLineCap).toBe('square');
  expect(layout.dendrogramLeft - layout.svgLeft).toBeLessThanOrEqual(12);
  expect(layout.dendrogramRight).toBeLessThanOrEqual(layout.matrixLeft + 2);
  expect(layout.rowLabelsLeft).toBeGreaterThanOrEqual(layout.matrixRight - 1);
  expect(layout.rowLabelsLeft - layout.matrixRight)
    .toBeCloseTo(layout.matrixTop - layout.columnLabelsBottom, 0);
  const actualGap = layout.scaleLeft - layout.rowLabelsRight;
  expect(layout.targetGap).toBeGreaterThanOrEqual(20);
  expect(layout.targetGap).toBeLessThanOrEqual(30);
  expect(actualGap).toBeGreaterThanOrEqual(layout.targetGap - 2);
  expect(actualGap).toBeLessThanOrEqual(layout.targetGap + 2);
  expect(Math.abs(layout.rowLabelFontSize - layout.columnLabelFontSize)).toBeLessThan(0.1);

  const longLabel = 'WDBC-M-012 extended correlation label';
  await page.evaluate(label => {
    window.__LAST_HEATMAP_HOT__.setDataAtCell(0, 3, label, 'e2e-long-correlation-label');
  }, longLabel);
  await page.waitForFunction(label => {
    const svg = document.querySelector('#heatmapSvg');
    return Array.from(svg?.querySelectorAll('text[data-font-role="rowLabel"]') || [])
      .some(node => node.textContent === label)
      && svg?.getAttribute('data-heatmap-render-complete') === 'true';
  }, longLabel);

  const editedLayout = await captureCorrelationRailLayout(page);
  const editedGap = editedLayout.scaleLeft - editedLayout.rowLabelsRight;
  expect(editedLayout.rowLabelsRight - editedLayout.rowLabelsLeft)
    .toBeGreaterThan(layout.rowLabelsRight - layout.rowLabelsLeft);
  expect(editedGap).toBeGreaterThanOrEqual(editedLayout.targetGap - 2);
  expect(editedGap).toBeLessThanOrEqual(editedLayout.targetGap + 2);
  expect(Math.abs(editedLayout.rowLabelFontSize - editedLayout.columnLabelFontSize)).toBeLessThan(0.1);
  expect(issues.critical).toEqual([]);
});

test('example Data-values scale labels both canonical endpoints', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true, loadExample: true }
  );
  await page.locator('#heatmapView').selectOption('values');
  await page.waitForFunction(() => {
    const svg = document.getElementById('heatmapSvg');
    const scale = window.Components?.heatmap?.__getState?.()?.lastResolvedValueScale;
    return svg?.dataset?.heatmapModelType === 'values'
      && Number.isFinite(scale?.domainMin)
      && Number.isFinite(scale?.domainMax)
      && svg.querySelectorAll('.heatmap-color-scale text').length === 5;
  });

  const metrics = await page.evaluate(() => {
    const scale = window.Components.heatmap.__getState().lastResolvedValueScale;
    const sourceSvg = document.getElementById('heatmapSvg');
    const bar = sourceSvg.querySelector('[data-heatmap-color-scale-bar="1"]')
      .getBoundingClientRect();
    const labels = Array.from(sourceSvg.querySelectorAll('.heatmap-color-scale text'))
      .map(node => {
        const rect = node.getBoundingClientRect();
        return { text: node.textContent, centerY: rect.top + rect.height / 2 };
      })
      .sort((a, b) => a.centerY - b.centerY);
    const exportSvg = window.Components.heatmap.__testHooks.buildExportSvgFromSource(sourceSvg);
    const exportLabels = Array.from(exportSvg.querySelectorAll('.heatmap-color-scale text'))
      .map(node => node.textContent);
    return {
      domainMin: scale.domainMin,
      domainMax: scale.domainMax,
      expectedMin: window.Shared.chartStyle.formatScientific(scale.domainMin, { maxDecimals: 2 }),
      expectedMax: window.Shared.chartStyle.formatScientific(scale.domainMax, { maxDecimals: 2 }),
      barTop: bar.top,
      barBottom: bar.bottom,
      topLabel: labels[0],
      bottomLabel: labels.at(-1),
      exportLabels
    };
  });

  expect(metrics.domainMin).toBeCloseTo(-metrics.domainMax, 8);
  expect(metrics.topLabel.text).toBe(metrics.expectedMax);
  expect(metrics.bottomLabel.text).toBe(metrics.expectedMin);
  expect(Math.abs(metrics.topLabel.centerY - metrics.barTop)).toBeLessThan(2);
  expect(Math.abs(metrics.bottomLabel.centerY - metrics.barBottom)).toBeLessThan(2);
  expect(metrics.exportLabels).toContain(metrics.expectedMax);
  expect(metrics.exportLabels).toContain(metrics.expectedMin);
  expect(issues.critical).toEqual([]);
});
