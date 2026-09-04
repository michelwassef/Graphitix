const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('Survival risk table widens its viewport and keeps uniform font scaling', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' }, {
    first: true,
    loadExample: true
  });

  const setLegendChecked = checked => page.evaluate(value => {
    const input = document.querySelector('#survivalPage:not([hidden]) #survivalShowLegend');
    if(!input){
      throw new Error('Missing survival legend control');
    }
    input.checked = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, checked);

  await page.locator('#survivalShowRiskTable').check();
  await page.waitForFunction(() =>
    document.querySelectorAll('#survivalPage:not([hidden]) #survivalSvg [data-survival-risk-table="count"]').length > 2
  );
  const legendToggle = page.locator('#survivalPage:not([hidden]) #survivalShowLegend');
  await setLegendChecked(false);
  await expect(legendToggle).not.toBeChecked();
  await expect(page.locator('#survivalSvg [data-legend-key]')).toHaveCount(0);

  const readLayout = () => page.evaluate(() => {
    const svg = document.querySelector('#survivalPage:not([hidden]) #survivalSvg');
    const rows = new Map();
    svg.querySelectorAll('[data-survival-risk-table="count"]').forEach(node => {
      const key = node.dataset.group || '';
      const list = rows.get(key) || [];
      list.push(node.getBBox());
      rows.set(key, list);
    });
    const overlaps = Array.from(rows.values()).some(boxes =>
      boxes.sort((a, b) => a.x - b.x).some((box, index) => index > 0 && box.x < boxes[index - 1].x + boxes[index - 1].width)
    );
    const matrix = svg.getScreenCTM();
    const svgRect = svg.getBoundingClientRect();
    const svgBox = svg.closest('.svgbox');
    const svgBoxRect = svgBox.getBoundingClientRect();
    const extraBottom = Number.parseFloat(getComputedStyle(svgBox).getPropertyValue('--graph-content-extra-bottom')) || 0;
    const extraRight = Number.parseFloat(getComputedStyle(svgBox).getPropertyValue('--graph-content-extra-right')) || 0;
    const graphLines = Array.from(svg.querySelectorAll('line:not([data-survival-risk-table])'));
    const horizontal = graphLines.map(line => ({
      x1: Number(line.getAttribute('x1')),
      x2: Number(line.getAttribute('x2')),
      y1: Number(line.getAttribute('y1')),
      y2: Number(line.getAttribute('y2'))
    })).filter(line => Math.abs(line.y2 - line.y1) < 0.01);
    const vertical = graphLines.map(line => ({
      x1: Number(line.getAttribute('x1')),
      x2: Number(line.getAttribute('x2')),
      y1: Number(line.getAttribute('y1')),
      y2: Number(line.getAttribute('y2'))
    })).filter(line => Math.abs(line.x2 - line.x1) < 0.01);
    const riskRects = Array.from(svg.querySelectorAll('[data-survival-risk-table]'))
      .map(node => node.getBoundingClientRect());
    const exportRect = document.querySelector('#survivalPage:not([hidden]) #survivalExportControls')?.getBoundingClientRect() || null;
    const cornerHandle = svgBox.querySelector('.resizer-corner');
    const cornerStyle = cornerHandle ? getComputedStyle(cornerHandle) : null;
    const riskBottom = Math.max(...riskRects.map(rect => rect.bottom));
    return {
      overlaps,
      tableContained: riskBottom <= svgRect.bottom + 1,
      tableWithinEnvelope: riskBottom <= svgBoxRect.bottom + extraBottom + 1,
      exportsBelowTable: !exportRect || exportRect.top >= riskBottom + 1,
      exportsOutsideEnvelope: !exportRect || exportRect.top >= svgBoxRect.bottom + extraBottom - 1,
      cornerHandleBackground: cornerStyle?.backgroundImage || 'none',
      preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
      baseWidth: Number(svg.dataset.legendBaseWidth),
      baseHeight: Number(svg.dataset.legendBaseHeight),
      legendReserveWidth: Number(svg.dataset.legendReserveWidth) || 0,
      contentReserveRight: Number(svg.dataset.graphContentReserveRight) || 0,
      extraRight,
      viewBoxWidth: svg.viewBox.baseVal.width,
      viewBoxHeight: svg.viewBox.baseVal.height,
      viewBoxRatio: svg.viewBox.baseVal.width / svg.viewBox.baseVal.height,
      renderedRatio: svg.clientWidth / svg.clientHeight,
      scaleX: Math.hypot(matrix.a, matrix.b),
      scaleY: Math.hypot(matrix.c, matrix.d),
      plotWidthPx: Math.max(0, ...horizontal.map(line => Math.abs(line.x2 - line.x1) * Math.hypot(matrix.a, matrix.b))),
      plotHeightPx: Math.max(0, ...vertical.map(line => Math.abs(line.y2 - line.y1) * Math.hypot(matrix.c, matrix.d))),
      boxWidth: svgBoxRect.width,
      boxHeight: svgBoxRect.height,
      extendsRight: extraRight > 0,
      extendsBottom: extraBottom > 0
    };
  });

  const initial = await readLayout();
  expect(initial.overlaps).toBe(false);
  expect(initial.tableContained).toBe(true);
  expect(initial.tableWithinEnvelope).toBe(true);
  expect(initial.exportsBelowTable).toBe(true);
  expect(initial.exportsOutsideEnvelope).toBe(true);
  expect(initial.cornerHandleBackground).toBe('none');
  expect(initial.viewBoxWidth).toBeGreaterThan(initial.baseWidth);
  expect(initial.viewBoxHeight).toBeGreaterThan(initial.baseHeight);
  expect(initial.extendsRight).toBe(true);
  expect(initial.extendsBottom).toBe(true);
  expect(initial.preserveAspectRatio).toBe('xMidYMid meet');
  expect(Math.abs(initial.viewBoxRatio - initial.renderedRatio)).toBeLessThan(0.08);
  expect(Math.abs(initial.scaleX - initial.scaleY)).toBeLessThan(0.01);

  await setLegendChecked(true);
  await page.waitForFunction(() => {
    const svg = document.querySelector('#survivalPage:not([hidden]) #survivalSvg');
    return Number(svg?.dataset?.legendReserveWidth) > 0
      && svg?.querySelectorAll?.('[data-legend-key]').length > 0
      && window.Components?.survival?.isIdleForSnapshot?.() === true;
  });
  const withLegendAndRisk = await readLayout();
  expect(withLegendAndRisk.preserveAspectRatio).toBe('xMidYMid meet');
  expect(Math.abs(withLegendAndRisk.scaleX - withLegendAndRisk.scaleY)).toBeLessThan(0.01);
  expect(Math.abs(withLegendAndRisk.plotWidthPx - initial.plotWidthPx)).toBeLessThanOrEqual(initial.plotWidthPx * 0.01);
  expect(Math.abs(withLegendAndRisk.plotHeightPx - initial.plotHeightPx)).toBeLessThanOrEqual(initial.plotHeightPx * 0.01);
  expect(withLegendAndRisk.boxWidth).toBeCloseTo(initial.boxWidth, 0);
  expect(withLegendAndRisk.boxHeight).toBeCloseTo(initial.boxHeight, 0);
  expect(withLegendAndRisk.viewBoxWidth).toBeGreaterThan(initial.viewBoxWidth);
  expect(withLegendAndRisk.legendReserveWidth).toBeGreaterThan(0);
  expect(withLegendAndRisk.contentReserveRight)
    .toBeCloseTo(withLegendAndRisk.legendReserveWidth, 0);
  expect(withLegendAndRisk.extraRight)
    .toBeCloseTo(withLegendAndRisk.legendReserveWidth, 0);

  await setLegendChecked(false);
  await expect(page.locator('#survivalSvg [data-legend-key]')).toHaveCount(0);
  const afterLegendRoundTrip = await readLayout();
  expect(Math.abs(afterLegendRoundTrip.plotWidthPx - initial.plotWidthPx)).toBeLessThanOrEqual(initial.plotWidthPx * 0.01);
  expect(Math.abs(afterLegendRoundTrip.plotHeightPx - initial.plotHeightPx)).toBeLessThanOrEqual(initial.plotHeightPx * 0.01);
  expect(afterLegendRoundTrip.viewBoxWidth).toBeCloseTo(initial.viewBoxWidth, 0);

  await page.locator('#survivalShowRiskTable').uncheck();
  await expect(page.locator('#survivalSvg [data-survival-risk-table]')).toHaveCount(0);
  const withoutRiskTable = await readLayout();
  expect(Math.abs(initial.plotWidthPx - withoutRiskTable.plotWidthPx)).toBeLessThanOrEqual(withoutRiskTable.plotWidthPx * 0.01);
  expect(Math.abs(initial.plotHeightPx - withoutRiskTable.plotHeightPx)).toBeLessThanOrEqual(withoutRiskTable.plotHeightPx * 0.01);
  expect(initial.boxWidth).toBeCloseTo(withoutRiskTable.boxWidth, 0);
  expect(initial.boxHeight).toBeCloseTo(withoutRiskTable.boxHeight, 0);
  await page.locator('#survivalShowRiskTable').check();
  await expect(page.locator('#survivalSvg [data-survival-risk-table="count"]')).not.toHaveCount(0);

  const reporting = await page.evaluate(() => {
    const svg = document.querySelector('#survivalPage:not([hidden]) #survivalSvg');
    const heading = svg.querySelector('[data-survival-risk-table="heading"]');
    const rows = Array.from(new Set(Array.from(svg.querySelectorAll('[data-survival-risk-table="count"]'))
      .map(node => node.dataset.group))).map(group => {
        const cells = Array.from(svg.querySelectorAll(`[data-survival-risk-table="count"][data-group="${CSS.escape(group)}"]`))
          .sort((a, b) => Number(a.dataset.time) - Number(b.dataset.time));
        const cumulative = cells.map(node => Number(node.dataset.censored));
        const payload = window.Components.survival.getPayload();
        const total = (payload.data || []).filter(row => row?.[0] === group && Number(row?.[2]) === 0).length;
        return {
          group,
          fill: cells[0]?.getAttribute('fill') || null,
          cumulative,
          total,
          final: cumulative[cumulative.length - 1]
        };
      });
    return {
      title: heading.textContent,
      headingWeight: heading.getAttribute('font-weight'),
      headingSize: heading.getAttribute('font-size'),
      rows
    };
  });
  expect(reporting.title).toBe('Number at risk (number censored)');
  expect(reporting.headingWeight).toBeNull();
  reporting.rows.forEach(row => {
    expect(row.cumulative.every((value, index) => index === 0 || value >= row.cumulative[index - 1])).toBe(true);
    expect(row.final).toBe(row.total);
  });

  await page.locator('#survivalSvg [data-survival-risk-table="heading"]').click();
  const sizeInput = page.locator('input[aria-label="Font size"]');
  await expect(sizeInput).toBeVisible();
  await sizeInput.fill('10');
  await sizeInput.dispatchEvent('change');
  await page.waitForFunction(previous => {
    const heading = document.querySelector('#survivalSvg [data-survival-risk-table="heading"]');
    return heading && heading.getAttribute('font-size') !== previous;
  }, reporting.headingSize);
  const colorsAfterResize = await page.evaluate(() => Array.from(
    document.querySelectorAll('#survivalSvg [data-survival-risk-table="count"]')
  ).reduce((colors, node) => {
    colors[node.dataset.group] = node.getAttribute('fill');
    return colors;
  }, {}));
  expect(colorsAfterResize).toEqual(Object.fromEntries(reporting.rows.map(row => [row.group, row.fill])));

  const separator = await page.evaluate(() => {
    const svg = document.querySelector('#survivalSvg');
    const line = svg.querySelector('[data-survival-risk-table="separator"]');
    const separatorX = Number(line.getAttribute('x1'));
    const labelRight = Math.max(...Array.from(svg.querySelectorAll('[data-survival-risk-table="label"]'))
      .map(node => node.getBBox().x + node.getBBox().width));
    const firstTime = Math.min(...Array.from(svg.querySelectorAll('[data-survival-risk-table="count"]'))
      .map(node => Number(node.dataset.time)));
    const firstCountLeft = Math.min(...Array.from(svg.querySelectorAll(`[data-survival-risk-table="count"][data-time="${firstTime}"]`))
      .map(node => node.getBBox().x));
    return {
      stroke: line.getAttribute('stroke'),
      opacity: line.getAttribute('stroke-opacity'),
      leftGap: separatorX - labelRight,
      rightGap: firstCountLeft - separatorX,
      timeLabels: svg.querySelectorAll('[data-survival-risk-table="time"]').length
    };
  });
  expect(separator.stroke).toBe('#000');
  expect(separator.opacity).toBeNull();
  expect(separator.timeLabels).toBe(0);
  expect(Math.abs(separator.leftGap - separator.rightGap)).toBeLessThan(0.75);

  const handle = page.locator('#survivalPage:not([hidden]) .svgbox .resizer-vertical').first();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const widened = await readLayout();
  expect(widened.overlaps).toBe(false);
  expect(widened.tableContained).toBe(true);
  expect(widened.tableWithinEnvelope).toBe(true);
  expect(widened.exportsBelowTable).toBe(true);
  expect(widened.exportsOutsideEnvelope).toBe(true);
  expect(widened.preserveAspectRatio).toBe('xMidYMid meet');
  expect(Math.abs(widened.viewBoxRatio - widened.renderedRatio)).toBeLessThan(0.08);
  expect(Math.abs(widened.scaleX - widened.scaleY)).toBeLessThan(0.01);
  expect(widened.plotWidthPx).toBeGreaterThan(initial.plotWidthPx);
  expect(issues.critical).toEqual([]);
});

test('Survival curve color immediately reaches every series-owned element and runtime state', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' }, {
    first: true,
    loadExample: true
  });
  await page.locator('#survivalPage:not([hidden]) #survivalShowRiskTable').check();
  await expect(page.locator('#survivalSvg [data-survival-risk-table="count"]')).not.toHaveCount(0);

  const curve = page.locator('#survivalPage:not([hidden]) #survivalSvg path[data-group]').first();
  await expect(curve).toBeVisible();
  const groupName = await curve.getAttribute('data-group');
  await curve.dispatchEvent('click');

  const colorInput = page.locator('.additional-line-controls-panel__color-input');
  await expect(colorInput).toBeVisible();
  const nextColor = '#00b050';
  await colorInput.evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, nextColor);

  const result = await page.evaluate(({ groupName, nextColor }) => {
    const svg = document.querySelector('#survivalPage:not([hidden]) #survivalSvg');
    const matching = selector => Array.from(svg.querySelectorAll(selector))
      .filter(node => node.getAttribute('data-group') === groupName);
    const curveColors = matching('[data-survival-series-color-target="stroke"]')
      .map(node => node.getAttribute('stroke'));
    const fillColors = matching('[data-survival-series-color-target="fill"]')
      .map(node => node.getAttribute('fill'));
    const payload = window.Components.survival.getPayload();
    const tabId = window.Main?.tabs?.getActiveTab?.()?.id || null;
    const runtime = window.Components.survival.captureRuntimeState({ tabId, reason: 'e2e-series-color' });
    const cache = window.Components.survival.captureRenderCache({ tabId, reason: 'e2e-series-color' });
    const cachedSvg = cache?.plot?.fragment?.querySelector?.('#survivalSvg') || null;
    const cachedColors = cachedSvg ? Array.from(cachedSvg.querySelectorAll('[data-survival-series-color-target][data-group]'))
      .filter(node => node.getAttribute('data-group') === groupName)
      .map(node => node.getAttribute(node.getAttribute('data-survival-series-color-target'))) : [];
    const cacheRestored = window.Components.survival.restoreRenderCache(cache, { tabId, reason: 'e2e-series-color' });
    return {
      curveColors,
      fillColors,
      cachedColors,
      cacheRestored,
      censorCount: matching('[data-survival-censor-mark="1"]').length,
      riskCount: matching('[data-survival-risk-table]').length,
      payloadColor: payload?.config?.labelColors?.[groupName],
      runtimeColor: runtime?.state?.labelColors?.[groupName],
      expected: nextColor
    };
  }, { groupName, nextColor });

  expect(result.censorCount).toBeGreaterThan(0);
  expect(result.riskCount).toBeGreaterThan(0);
  expect(result.curveColors.length).toBeGreaterThan(0);
  expect(result.fillColors.length).toBeGreaterThan(0);
  expect(result.curveColors.every(color => color === nextColor)).toBe(true);
  expect(result.fillColors.every(color => color === nextColor)).toBe(true);
  expect(result.cachedColors.length).toBe(result.curveColors.length + result.fillColors.length);
  expect(result.cachedColors.every(color => color === nextColor)).toBe(true);
  expect(result.cacheRestored).toBe(true);
  expect(result.payloadColor).toBe(nextColor);
  expect(result.runtimeColor).toBe(nextColor);
  expect(issues.critical).toEqual([]);
});
