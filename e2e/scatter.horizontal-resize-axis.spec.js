const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readAxisMetrics(config = {}) {
  const plotSelector = config.plotSelector || '#scatterPlot';
  const graphPanelSelector = config.graphPanelSelector || '#scatterGraphPanel';
  const originSelector = config.originSelector || '#scatterOriginMode';
  const svg = document.querySelector(`${plotSelector} svg`);
  const svgBox = document.querySelector(`${graphPanelSelector} .svgbox`);
  if (!svg || !svgBox) {
    return null;
  }
  const lines = Array.from(svg.querySelectorAll('line'))
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
        stroke: (line.getAttribute('stroke') || '').toLowerCase(),
        axisControl: line.getAttribute('data-axis-control') === '1',
        rectLeft: Number(rect.left),
        rectRight: Number(rect.right),
        rectTop: Number(rect.top),
        rectBottom: Number(rect.bottom)
      };
    })
    .filter(Boolean);
  const visibleAxis = lines.filter(line => line.axisControl && line.stroke !== 'transparent');
  const yAxis = visibleAxis
    .filter(line => line.dx <= 0.25 && line.dy > 10)
    .sort((a, b) => b.dy - a.dy || a.x1 - b.x1)[0] || null;
  const xAxis = visibleAxis
    .filter(line => line.dy <= 0.25 && line.dx > 10)
    .sort((a, b) => b.dx - a.dx || b.y1 - a.y1)[0] || null;
  const yTitle = Array.from(svg.querySelectorAll('text'))
    .filter(node => {
      const text = (node.textContent || '').trim();
      const transform = node.getAttribute('transform') || '';
      return text && /rotate/i.test(transform);
    })
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  const svgBoxRect = svgBox.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const plotRect = document.querySelector(plotSelector)?.getBoundingClientRect?.() || null;
  const yAxisScreenX = yAxis ? (yAxis.rectLeft + yAxis.rectRight) / 2 : null;
  const yTitleRect = yTitle?.getBoundingClientRect?.() || null;
  return {
    originMode: document.querySelector(originSelector)?.value || null,
    svgBoxLeft: svgBoxRect.left,
    svgBoxWidth: svgBoxRect.width,
    plotLeft: Number(plotRect?.left),
    plotWidth: Number(plotRect?.width),
    svgLeft: svgRect.left,
    svgRenderedWidth: svgRect.width,
    viewBox: svg.getAttribute('viewBox'),
    viewBoxMinX: Number((svg.getAttribute('viewBox') || '').trim().split(/\s+/)[0]),
    viewBoxWidth: Number((svg.getAttribute('viewBox') || '').trim().split(/\s+/)[2]),
    svgWidth: Number(svg.getAttribute('width')),
    stableMinX: Number(svgBox.dataset.graphViewportStableMinX),
    stableWidth: Number(svgBox.dataset.graphViewportStableWidth),
    stableRenderedWidth: Number(svgBox.dataset.graphViewportStableRenderedWidth),
    stableReason: svgBox.dataset.graphViewportStableReason || null,
    yAxisSvgX: yAxis ? yAxis.x1 : null,
    yAxisScreenX,
    yAxisPageX: yAxisScreenX == null ? null : yAxisScreenX + window.scrollX,
    xAxisSvgY: xAxis ? xAxis.y1 : null,
    yTitleSvgX: yTitle ? Number(yTitle.getAttribute('x')) : null,
    yTitleScreenX: yTitleRect ? (yTitleRect.left + yTitleRect.right) / 2 : null,
    yTitlePageX: yTitleRect ? ((yTitleRect.left + yTitleRect.right) / 2) + window.scrollX : null,
    marginLeft: Number(svg.dataset.scatterPlotLeft),
    plotW: Number(svg.dataset.scatterPlotW)
  };
}

const scatterAxisConfig = {
  plotSelector: '#scatterPlot',
  graphPanelSelector: '#scatterGraphPanel',
  originSelector: '#scatterOriginMode'
};

async function setScatterWidth(page, width) {
  await page.evaluate(async targetWidth => {
    const svgBox = document.querySelector('#scatterGraphPanel .svgbox');
    const height = Number(svgBox?.dataset?.graphHeightPx || svgBox?.dataset?.resizerBaseHeight) || svgBox?.getBoundingClientRect?.().height || 360;
    if (!svgBox || typeof window.Shared?.applyResizableBoxSize !== 'function') {
      throw new Error('scatter resizer API unavailable');
    }
    window.Shared.applyResizableBoxSize(svgBox, {
      axis: 'x',
      width: targetWidth,
      height,
      reason: 'e2e-scatter-horizontal-resize'
    });
    window.Components?.scatter?.draw?.({ force: true, reason: 'e2e-scatter-horizontal-resize', resizePhase: 'move' });
  }, width);
  await page.waitForTimeout(450);
}

async function dragWidthDense(page, config, dx, options = {}) {
  const steps = options.steps || 28;
  const handle = page.locator(`${config.graphPanelSelector} .svgbox .resizer-vertical`).first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing width handle box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const samples = [];
  await page.mouse.move(x, y);
  await page.mouse.down();
  samples.push({ phase: 'down', metrics: await page.evaluate(readAxisMetrics, config) });
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(x + (dx * step) / steps, y);
    if (options.captureImmediate === true) {
      samples.push({ phase: `move-${step}-live`, metrics: await page.evaluate(readAxisMetrics, config) });
    }
    const stepDelayMs = options.stepDelayMs ?? 35;
    if (stepDelayMs > 0) {
      await page.waitForTimeout(stepDelayMs);
    }
    samples.push({ phase: `move-${step}`, metrics: await page.evaluate(readAxisMetrics, config) });
  }
  await page.mouse.up();
  await page.waitForTimeout(options.endDelayMs || 450);
  samples.push({ phase: 'end', metrics: await page.evaluate(readAxisMetrics, config) });
  return samples;
}

async function dragWidthBackAndForth(page, config, amplitude, cycles) {
  const handle = page.locator(`${config.graphPanelSelector} .svgbox .resizer-vertical`).first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing width handle box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    await page.mouse.move(x + amplitude, y, { steps: 5 });
    await page.waitForTimeout(25);
    await page.mouse.move(x - amplitude, y, { steps: 5 });
    await page.waitForTimeout(25);
  }
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

async function clickHeightHandleWithoutResize(page, config) {
  const handle = page.locator(`${config.graphPanelSelector} .svgbox .resizer-horizontal`).first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing height handle box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(700);
}

function summarizeDrift(samples) {
  const valid = samples.map(sample => sample.metrics).filter(Boolean);
  const base = valid[0] || null;
  const axisValues = valid.map(metrics => metrics.yAxisPageX).filter(Number.isFinite);
  const titleValues = valid.map(metrics => metrics.yTitlePageX).filter(Number.isFinite);
  const drift = values => values.length
    ? Math.max(...values.map(value => Math.abs(value - values[0])))
    : null;
  return {
    count: valid.length,
    base,
    maxYAxisPageXDrift: drift(axisValues),
    maxYTitlePageXDrift: drift(titleValues),
    yAxisPageX: axisValues,
    yTitlePageX: titleValues
  };
}

test('scatter horizontal resize keeps y-axis line and y-title stable', async ({ page }, testInfo) => {
  await installLocalCdnOverrides(page);
  const issues = registerIssueCollectors(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#scatterPlot svg'), null, { timeout: 30_000 });
  await page.locator('#scatterOriginMode').selectOption('zero');
  await page.waitForTimeout(400);

  await setScatterWidth(page, 482);
  const before = await page.evaluate(readAxisMetrics, scatterAxisConfig);
  await setScatterWidth(page, 397);
  const after = await page.evaluate(readAxisMetrics, scatterAxisConfig);

  await testInfo.attach('scatter-horizontal-resize-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ before, after, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(before.originMode).toBe('zero');
  expect(after.originMode).toBe('zero');
  expect(Math.abs(after.yAxisScreenX - before.yAxisScreenX)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(after.yTitleScreenX - before.yTitleScreenX)).toBeLessThanOrEqual(1.5);
  expect(issues.critical).toEqual([]);
});

test('scatter pointer horizontal drag keeps y-axis line and y-title stable', async ({ page }, testInfo) => {
  await installLocalCdnOverrides(page);
  const issues = registerIssueCollectors(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#scatterPlot svg'), null, { timeout: 30_000 });
  await page.locator('#scatterOriginMode').selectOption('zero');
  await page.waitForTimeout(400);

  const drag = await dragWidthDense(page, scatterAxisConfig, -160, { captureImmediate: true });
  const summary = summarizeDrift(drag);

  await testInfo.attach('scatter-horizontal-pointer-drag-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ summary, drag, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(summary.base).not.toBeNull();
  expect(summary.base.originMode).toBe('zero');
  expect(summary.maxYAxisPageXDrift).toBeLessThanOrEqual(0.25);
  if (Number.isFinite(summary.maxYTitlePageXDrift)) {
    expect(summary.maxYTitlePageXDrift).toBeLessThanOrEqual(0.5);
  }
  expect(issues.critical).toEqual([]);
});

test('scatter repeated horizontal drag does not need a no-op handle click to realign', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  const issues = registerIssueCollectors(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#scatterPlot svg'), null, { timeout: 30_000 });
  await page.locator('#scatterOriginMode').selectOption('zero');
  await page.waitForTimeout(400);

  const before = await page.evaluate(readAxisMetrics, scatterAxisConfig);
  await dragWidthBackAndForth(page, scatterAxisConfig, 90, 10);
  const afterRepeated = await page.evaluate(readAxisMetrics, scatterAxisConfig);
  await clickHeightHandleWithoutResize(page, scatterAxisConfig);
  const afterClick = await page.evaluate(readAxisMetrics, scatterAxisConfig);

  await testInfo.attach('scatter-repeated-horizontal-drag-realign.metrics.json', {
    body: Buffer.from(JSON.stringify({ before, afterRepeated, afterClick, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(before).not.toBeNull();
  expect(afterRepeated).not.toBeNull();
  expect(afterClick).not.toBeNull();
  expect(Math.abs(afterRepeated.yAxisPageX - before.yAxisPageX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(afterRepeated.yTitlePageX - before.yTitlePageX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(afterClick.yAxisPageX - afterRepeated.yAxisPageX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(afterClick.yTitlePageX - afterRepeated.yTitlePageX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(afterClick.viewBoxMinX - afterRepeated.viewBoxMinX)).toBeLessThanOrEqual(0.5);
  expect(issues.critical).toEqual([]);
});
