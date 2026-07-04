const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readBoxAxisMetrics() {
  const root = document.querySelector('#boxPage:not([hidden])') || document;
  const svg = root.querySelector('#boxPlot svg');
  const svgBox = root.querySelector('#boxGraphPanel .svgbox');
  if (!svg || !svgBox) {
    return null;
  }
  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const lines = Array.from(axisLayer.querySelectorAll('line'))
    .map(line => {
      const x1 = Number(line.getAttribute('x1'));
      const y1 = Number(line.getAttribute('y1'));
      const x2 = Number(line.getAttribute('x2'));
      const y2 = Number(line.getAttribute('y2'));
      if (![x1, y1, x2, y2].every(Number.isFinite)) {
        return null;
      }
      const rect = line.getBoundingClientRect();
      return {
        x1,
        y1,
        x2,
        y2,
        dx: Math.abs(x2 - x1),
        dy: Math.abs(y2 - y1),
        stroke: String(line.getAttribute('stroke') || '').toLowerCase(),
        rectLeft: Number(rect.left),
        rectRight: Number(rect.right),
        rectTop: Number(rect.top),
        rectBottom: Number(rect.bottom)
      };
    })
    .filter(Boolean);
  const visibleLines = lines.filter(line => line.stroke !== 'transparent');
  const minVerticalX = visibleLines
    .filter(line => line.dx <= 0.25 && line.dy > 10)
    .reduce((min, line) => Math.min(min, line.x1, line.x2), Infinity);
  const yAxis = visibleLines
    .filter(line => line.dx <= 0.25 && line.dy > 10)
    .filter(line => !Number.isFinite(minVerticalX) || Math.min(Math.abs(line.x1 - minVerticalX), Math.abs(line.x2 - minVerticalX)) <= 1.5)
    .sort((a, b) => b.dy - a.dy || a.x1 - b.x1)[0] || null;
  const yTitle = Array.from(svg.querySelectorAll('text'))
    .filter(node => {
      const text = String(node.textContent || '').trim();
      const transform = String(node.getAttribute('transform') || '');
      return text && /rotate/i.test(transform);
    })
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  const svgBoxRect = svgBox.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const titleRect = yTitle?.getBoundingClientRect?.() || null;
  const yAxisScreenX = yAxis ? (yAxis.rectLeft + yAxis.rectRight) / 2 : null;
  return {
    svgBoxWidth: svgBoxRect.width,
    svgLeft: svgRect.left,
    svgRenderedWidth: svgRect.width,
    viewBox: svg.getAttribute('viewBox'),
    viewBoxMinX: Number((svg.getAttribute('viewBox') || '').trim().split(/\s+/)[0]),
    viewBoxWidth: Number((svg.getAttribute('viewBox') || '').trim().split(/\s+/)[2]),
    stableMinX: Number(svgBox.dataset.graphViewportStableMinX),
    stableWidth: Number(svgBox.dataset.graphViewportStableWidth),
    yAxisSvgX: yAxis ? yAxis.x1 : null,
    yAxisScreenX,
    yAxisPageX: yAxisScreenX == null ? null : yAxisScreenX + window.scrollX,
    yTitlePageX: titleRect ? ((titleRect.left + titleRect.right) / 2) + window.scrollX : null,
    marginLeft: Number(yAxis?.x1)
  };
}

async function prepareBox(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#boxPlot svg'), null, { timeout: 30_000 });
  await page.locator('#boxGraphType').selectOption('strip');
  await page.evaluate(() => {
    const checkbox = document.querySelector('#boxGraphPanel .resizer-aspect-checkbox');
    if (checkbox && checkbox.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(600);
}

async function dragBoxWidthDense(page, dx, options = {}) {
  const steps = options.steps || 28;
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing box width handle');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const samples = [];
  await page.mouse.move(x, y);
  await page.mouse.down();
  samples.push({ phase: 'down', metrics: await page.evaluate(readBoxAxisMetrics) });
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(x + (dx * step) / steps, y);
    await page.waitForTimeout(options.stepDelayMs || 35);
    samples.push({ phase: `move-${step}`, metrics: await page.evaluate(readBoxAxisMetrics) });
  }
  await page.mouse.up();
  await page.waitForTimeout(options.endDelayMs || 500);
  samples.push({ phase: 'end', metrics: await page.evaluate(readBoxAxisMetrics) });
  return samples;
}

async function dragBoxHeightDense(page, dy, options = {}) {
  const steps = options.steps || 28;
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-horizontal').first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing box height handle');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const samples = [];
  await page.mouse.move(x, y);
  await page.mouse.down();
  samples.push({ phase: 'down', metrics: await page.evaluate(readBoxAxisMetrics) });
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(x, y + (dy * step) / steps);
    await page.waitForTimeout(options.stepDelayMs || 35);
    samples.push({ phase: `move-${step}`, metrics: await page.evaluate(readBoxAxisMetrics) });
  }
  await page.mouse.up();
  await page.waitForTimeout(options.endDelayMs || 500);
  samples.push({ phase: 'end', metrics: await page.evaluate(readBoxAxisMetrics) });
  return samples;
}

function summarize(samples) {
  const valid = samples.map(sample => sample.metrics).filter(Boolean);
  const axisValues = valid.map(metrics => metrics.yAxisPageX).filter(Number.isFinite);
  const titleValues = valid.map(metrics => metrics.yTitlePageX).filter(Number.isFinite);
  const drift = values => values.length
    ? Math.max(...values.map(value => Math.abs(value - values[0])))
    : null;
  return {
    base: valid[0] || null,
    maxYAxisPageXDrift: drift(axisValues),
    maxYTitlePageXDrift: drift(titleValues),
    yAxisPageX: axisValues,
    yTitlePageX: titleValues
  };
}

test('box pointer horizontal drag keeps y-axis line stable in page coordinates', async ({ page }, testInfo) => {
  const issues = registerIssueCollectors(page);
  await prepareBox(page);

  const samples = await dragBoxWidthDense(page, -150);
  const summary = summarize(samples);

  await testInfo.attach('box-horizontal-pointer-drag-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ summary, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(summary.base).not.toBeNull();
  expect(summary.maxYAxisPageXDrift).toBeLessThanOrEqual(0.25);
  expect(issues.critical).toEqual([]);
});

test('box pointer vertical drag keeps y-axis line and y-title stable in page coordinates', async ({ page }, testInfo) => {
  const issues = registerIssueCollectors(page);
  await prepareBox(page);

  const samples = await dragBoxHeightDense(page, 150);
  const summary = summarize(samples);

  await testInfo.attach('box-vertical-pointer-drag-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ summary, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(summary.base).not.toBeNull();
  expect(summary.maxYAxisPageXDrift).toBeLessThanOrEqual(0.25);
  if (Number.isFinite(summary.maxYTitlePageXDrift)) {
    expect(summary.maxYTitlePageXDrift).toBeLessThanOrEqual(0.5);
  }
  expect(issues.critical).toEqual([]);
});
