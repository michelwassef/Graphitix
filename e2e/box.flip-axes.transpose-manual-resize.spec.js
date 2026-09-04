const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readFlipTransposeMetrics() {
  const svg = document.querySelector('#boxPlot svg');
  const svgBox = document.querySelector('#boxGraphPanel .svgbox');
  const plot = document.getElementById('boxPlot');
  const state = window.Components?.box?.__getState?.() || null;
  if (!svg || !svgBox || !state) {
    return null;
  }

  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const primaryAxisLines = Array.from(axisLayer.querySelectorAll('line[data-box-primary-axis]'));
  const lines = (primaryAxisLines.length ? primaryAxisLines : Array.from(axisLayer.querySelectorAll('line')))
    .map(line => {
      if (line.getAttribute('stroke') === 'transparent' || line.getAttribute('data-export-ignore') === '1') {
        return null;
      }
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
        rectWidth: Number.isFinite(rect?.width) ? Number(rect.width) : null,
        rectHeight: Number.isFinite(rect?.height) ? Number(rect.height) : null
      };
    })
    .filter(Boolean);

  const horizontal = lines.filter(line => line.dy <= 0.25 && line.dx > 1);
  const vertical = lines.filter(line => line.dx <= 0.25 && line.dy > 1);
  const xAxis = horizontal.slice().sort((a, b) => b.dx - a.dx)[0] || null;
  const yAxis = vertical.slice().sort((a, b) => b.dy - a.dy)[0] || null;
  const xAxisSpan = xAxis
    ? (Number.isFinite(xAxis.rectWidth) && xAxis.rectWidth > 0 ? xAxis.rectWidth : xAxis.dx)
    : null;
  const yAxisSpan = yAxis
    ? (Number.isFinite(yAxis.rectHeight) && yAxis.rectHeight > 0 ? yAxis.rectHeight : yAxis.dy)
    : null;

  const axisLabels = Array.isArray(state.lastAxisLabels)
    ? state.lastAxisLabels.map(label => String(label || '').trim()).filter(Boolean)
    : [];
  const categoryLabelNodes = Array.from(axisLayer.querySelectorAll('text')).filter(node => {
    const label = String(node?.textContent || '').trim();
    return !!label && axisLabels.includes(label);
  });
  const rotatedCategoryLabelCount = categoryLabelNodes.filter(node =>
    /rotate\(\s*-90/i.test(String(node.getAttribute('transform') || ''))
  ).length;
  const horizontalCategoryLabelCount = categoryLabelNodes.filter(node => {
    const transform = String(node.getAttribute('transform') || '');
    if (/rotate\(\s*-90/i.test(transform)) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    return Number.isFinite(width) && Number.isFinite(height) && width >= height;
  }).length;
  const svgRect = svg.getBoundingClientRect();
  const axisTitle = axisLayer.querySelector(
    state.flipAxes === true ? '[data-box-axis-title="x"]' : '[data-box-axis-title="y"]'
  );
  const valueTickNodes = Array.from(axisLayer.querySelectorAll(
    state.flipAxes === true ? '[data-box-axis-tick="x"]' : '[data-box-axis-tick="y"]'
  ));
  const axisTitleRect = axisTitle?.getBoundingClientRect?.() || null;
  const valueTickRects = valueTickNodes
    .map(node => node.getBoundingClientRect?.())
    .filter(rect => rect && Number.isFinite(rect.left) && Number.isFinite(rect.top));
  const axisTitleGapPx = state.flipAxes === true
    ? (axisTitleRect && valueTickRects.length
        ? axisTitleRect.top - Math.max(...valueTickRects.map(rect => rect.bottom))
        : null)
    : (axisTitleRect && valueTickRects.length
        ? Math.min(...valueTickRects.map(rect => rect.left)) - axisTitleRect.right
        : null);
  const categoryOuterLeftGapPx = state.flipAxes === true && categoryLabelNodes.length
    ? Math.min(...categoryLabelNodes.map(node => node.getBoundingClientRect().left)) - svgRect.left
    : null;

  const svgBoxRect = svgBox.getBoundingClientRect();
  const svgScreenMatrix = svg.getScreenCTM?.() || null;
  const svgScaleX = svgScreenMatrix
    ? Math.hypot(Number(svgScreenMatrix.a) || 0, Number(svgScreenMatrix.b) || 0)
    : null;
  const svgScaleY = svgScreenMatrix
    ? Math.hypot(Number(svgScreenMatrix.c) || 0, Number(svgScreenMatrix.d) || 0)
    : null;
  const svgBoxStyle = window.getComputedStyle(svgBox);
  const padTop = Number.parseFloat(String(svgBoxStyle?.paddingTop || '0')) || 0;
  const padBottom = Number.parseFloat(String(svgBoxStyle?.paddingBottom || '0')) || 0;
  const borderTop = Number.parseFloat(String(svgBoxStyle?.borderTopWidth || '0')) || 0;
  const borderBottom = Number.parseFloat(String(svgBoxStyle?.borderBottomWidth || '0')) || 0;
  const ratio = Number(svgBoxRect?.height) > 0 ? Number(svgBoxRect.width) / Number(svgBoxRect.height) : null;
  const visibleNodes = Array.from(svg.querySelectorAll('text,path,line,rect,circle,ellipse,polyline,polygon,foreignObject'));
  let overflowMaxPx = 0;
  const overflowTolerancePx = 0.25;
  visibleNodes.forEach(node => {
    if (!node || node.getAttribute('data-significance-hit-overlay') === '1') {
      return;
    }
    const style = window.getComputedStyle(node);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return;
    }
    const rect = node.getBoundingClientRect();
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || (width < 0.5 && height < 0.5)) {
      return;
    }
    // Automatic reserves belong to the published content envelope, not the
    // canonical resizable frame. Clipping is therefore measured against the
    // complete SVG viewport while frame-size assertions remain separate below.
    const leftOverflow = Math.max(0, svgRect.left - rect.left);
    const rightOverflow = Math.max(0, rect.right - svgRect.right);
    const topOverflow = Math.max(0, svgRect.top - rect.top);
    const bottomOverflow = Math.max(0, rect.bottom - svgRect.bottom);
    const localMax = Math.max(leftOverflow, rightOverflow, topOverflow, bottomOverflow);
    if (localMax > overflowTolerancePx) {
      overflowMaxPx = Math.max(overflowMaxPx, localMax);
    }
  });

  return {
    flipAxes: state.flipAxes === true,
    xTickRotateVertical: state.xTickRotateVertical === true,
    xAxisSpan,
    yAxisSpan,
    leftViewportExtensionPx: Number(state.graphGeometry?.reserves?.leftPx) || 0,
    rightViewportExtensionPx: Number(state.graphGeometry?.reserves?.rightPx) || 0,
    bottomViewportExtensionPx: Number(state.graphGeometry?.reserves?.xLabelPx) || 0,
    significanceViewportExtensionPx: Number(state.graphGeometry?.reserves?.significancePx) || 0,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation').length,
    flipTransition: state.flipTransition ? {
      phase: state.flipTransition.phase || null,
      transitionId: Number(state.flipTransition.transitionId) || 0,
      activeOrientation: state.flipTransition.active?.orientation || null,
      axisSpanTarget: state.flipTransition.axisSpanTarget ? {
        targetOrientation: state.flipTransition.axisSpanTarget.targetOrientation || null,
        plotWidthPx: Number(state.flipTransition.axisSpanTarget.plotWidthPx) || null,
        plotHeightPx: Number(state.flipTransition.axisSpanTarget.plotHeightPx) || null
      } : null
    } : null,
    plotWidthPx: Number(state.graphGeometry?.plot?.widthPx) || null,
    plotHeightPx: Number(state.graphGeometry?.plot?.heightPx) || null,
    topReservePx: Number(state.graphGeometry?.reserves?.topPx) || null,
    bottomReservePx: Number(state.graphGeometry?.reserves?.bottomPx) || null,
    plotClientHeightPx: Number(plot?.clientHeight) || null,
    plotClientWidthPx: Number(plot?.clientWidth) || null,
    resizerZoomLevel: Number(svgBox?.dataset?.resizerZoomLevel || svgBox?.dataset?.resizerZoom) || 1,
    svgBoxPaddingY: padTop + padBottom + borderTop + borderBottom,
    svgBoxWidthPx: Number.isFinite(Number(svgBoxRect?.width)) ? Number(svgBoxRect.width) : null,
    svgBoxHeightPx: Number.isFinite(Number(svgBoxRect?.height)) ? Number(svgBoxRect.height) : null,
    svgBoxAspectRatio: Number.isFinite(ratio) ? ratio : null,
    svgScaleX: Number.isFinite(svgScaleX) ? svgScaleX : null,
    svgScaleY: Number.isFinite(svgScaleY) ? svgScaleY : null,
    preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
    categoryLabelCount: axisLabels.length,
    rotatedCategoryLabelCount,
    horizontalCategoryLabelCount,
    axisTitleGapPx: Number.isFinite(axisTitleGapPx) ? axisTitleGapPx : null,
    categoryOuterLeftGapPx: Number.isFinite(categoryOuterLeftGapPx) ? categoryOuterLeftGapPx : null,
    overflowMaxPx
  };
}

async function loadStripExample(page) {
  await expect(async () => {
    await page.locator('#boxLoadExample').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#statsControls input[type="checkbox"]:checked').length >= 3
        && !!window.Components?.box?.__getState?.()?.hot,
      null,
      { timeout: 12_000 }
    );
  }).toPass({ timeout: 40_000, intervals: [500, 1000, 2000] });
  await page.locator('#boxGraphType').selectOption('strip');
  await page.waitForTimeout(650);
}

async function dragBoxWidthHandle(page, deltaX) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-vertical');
  await expect(handle).toBeVisible({ timeout: 20_000 });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve vertical resizer handle');
  }
  const startX = box.x + Math.max(2, Math.min(box.width - 2, box.width / 2));
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 16 });
  await page.mouse.up();
}

async function dragBoxHeightHandle(page, deltaY) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-horizontal');
  await expect(handle).toBeVisible({ timeout: 20_000 });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve horizontal resizer handle');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaY, { steps: 16 });
  await page.mouse.up();
}

async function clickBoxHeightHandleWithoutDrag(page) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-horizontal');
  await expect(handle).toBeVisible({ timeout: 20_000 });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve horizontal resizer handle');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    if (!state) return false;
    const now = Date.now();
    const marker = window.__boxNoopResizeIdleMarker || null;
    if (!marker || marker.token !== state.drawToken) {
      window.__boxNoopResizeIdleMarker = { token: state.drawToken, since: now };
      return false;
    }
    return now - marker.since >= 350;
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(250);
}

async function doubleClickBoxResizeHandle(page) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-corner');
  await expect(handle).toBeVisible({ timeout: 20_000 });
  await handle.scrollIntoViewIfNeeded();
  const beforeToken = await page.evaluate(() => Number(window.Components?.box?.__getState?.()?.drawToken) || 0);
  await handle.dblclick();
  await page.waitForFunction(previousToken => {
    const component = window.Components?.box;
    const token = Number(component?.__getState?.()?.drawToken) || 0;
    return token > previousToken && component?.isIdleForSnapshot?.() === true;
  }, beforeToken, { timeout: 20_000 });
  await page.waitForTimeout(350);
}

async function shrinkBoxWidthByHalf(page) {
  const start = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    const rect = svgBox.getBoundingClientRect();
    return {
      width: Number(rect?.width) || null,
      height: Number(rect?.height) || null
    };
  });
  if (!start || !Number.isFinite(start.width) || !Number.isFinite(start.height)) {
    throw new Error('Unable to read initial box frame size');
  }
  const lockToggle = page.locator('#boxGraphPanel .resizer-aspect-checkbox');
  if (await lockToggle.isVisible().catch(() => false)) {
    if (await lockToggle.isChecked()) {
      await lockToggle.uncheck();
      await page.waitForTimeout(250);
    }
  }
  await dragBoxWidthHandle(page, -Math.round(start.width * 0.5));
  await page.waitForFunction((startWidth) => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) return false;
    const rect = svgBox.getBoundingClientRect();
    const liveWidth = Number(rect?.width);
    return Number.isFinite(liveWidth) && liveWidth <= startWidth * 0.65;
  }, start.width, { timeout: 20_000 });
  await page.waitForTimeout(1_000);
}

async function resizeBoxWidthByRatio(page, ratio) {
  const start = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    const rect = svgBox.getBoundingClientRect();
    return {
      width: Number(rect?.width) || null
    };
  });
  if (!start || !Number.isFinite(start.width) || start.width <= 0) {
    throw new Error('Unable to read current box frame width');
  }
  const deltaX = Math.round(start.width * Number(ratio));
  if (!Number.isFinite(deltaX) || deltaX === 0) {
    return start.width;
  }
  await dragBoxWidthHandle(page, deltaX);
  await page.waitForFunction(({ initialWidth, minDelta }) => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) return false;
    const rect = svgBox.getBoundingClientRect();
    const liveWidth = Number(rect?.width);
    return Number.isFinite(liveWidth) && Math.abs(liveWidth - initialWidth) >= minDelta;
  }, {
    initialWidth: start.width,
    minDelta: Math.max(16, Math.abs(deltaX) * 0.35)
  }, { timeout: 20_000 });
  await page.waitForTimeout(900);
  const end = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    return Number(svgBox.getBoundingClientRect()?.width) || null;
  });
  return end;
}

async function resizeBoxHeightByRatio(page, ratio) {
  const start = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    const rect = svgBox.getBoundingClientRect();
    return {
      height: Number(rect?.height) || null
    };
  });
  if (!start || !Number.isFinite(start.height) || start.height <= 0) {
    throw new Error('Unable to read current box frame height');
  }
  const deltaY = Math.round(start.height * Number(ratio));
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return start.height;
  }
  await dragBoxHeightHandle(page, deltaY);
  await page.waitForFunction(({ initialHeight, minDelta }) => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) return false;
    const rect = svgBox.getBoundingClientRect();
    const liveHeight = Number(rect?.height);
    return Number.isFinite(liveHeight) && Math.abs(liveHeight - initialHeight) >= minDelta;
  }, {
    initialHeight: start.height,
    minDelta: Math.max(16, Math.abs(deltaY) * 0.35)
  }, { timeout: 20_000 });
  await page.waitForTimeout(900);
  const end = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    return Number(svgBox.getBoundingClientRect()?.height) || null;
  });
  return end;
}

async function setFlipAxes(page, enabled) {
  const toggle = page.locator('#boxFlipAxes');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if (enabled) {
    await toggle.check();
  } else {
    await toggle.uncheck();
  }
  await page.waitForFunction((expected) => {
    const state = window.Components?.box?.__getState?.();
    return !!state && !!state.flipAxes === !!expected;
  }, enabled, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    if (!state) return false;
    const now = Date.now();
    const marker = window.__boxFlipIdleMarker || null;
    if (!marker || marker.token !== state.drawToken) {
      window.__boxFlipIdleMarker = { token: state.drawToken, since: now };
      return false;
    }
    return now - marker.since >= 350;
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(350);
}

async function computeStatsAndEnableSignificance(page, options = {}) {
  const expectedFlip = options.expectedFlip;
  const computeButton = page.locator('#boxComputeStats');
  await expect(computeButton).toBeVisible({ timeout: 20_000 });

  await computeButton.click();
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    const status = document.getElementById('boxStatsStatus');
    return !!state
      && !state.statsComputationPending
      && Number(state.statsLastRunVersion) > 0
      && /up to date/i.test(String(status?.textContent || ''));
  }, null, { timeout: 45_000 });

  await setShowSignificance(page, true, { expectedFlip });
}

async function setShowSignificance(page, enabled, options = {}) {
  const expectedFlip = options.expectedFlip;
  const expectedFlipTri = expectedFlip === true ? 1 : (expectedFlip === false ? 0 : -1);
  const significanceToggle = page.locator('#boxShowSignificance');
  await expect(significanceToggle).toBeVisible({ timeout: 20_000 });
  if (enabled) {
    await significanceToggle.check();
  } else {
    await significanceToggle.uncheck();
  }
  await page.waitForFunction(({ expectedEnabled, expectedFlipState }) => {
    const state = window.Components?.box?.__getState?.();
    if (!state || state.showSignificanceBars !== expectedEnabled) {
      return false;
    }
    if (expectedFlipState === 1 && state.flipAxes !== true) {
      return false;
    }
    if (expectedFlipState === 0 && state.flipAxes !== false) {
      return false;
    }
    const count = document.querySelectorAll('#boxPlot path.box-significance-annotation').length;
    const horizontalReserve = (Number(state.graphGeometry?.reserves?.leftPx) || 0) + (Number(state.graphGeometry?.reserves?.rightPx) || 0);
    const verticalReserve = Number(state.graphGeometry?.reserves?.significancePx) || 0;
    if (expectedEnabled) {
      if (expectedFlipState === 1) {
        return count > 0 && horizontalReserve > 0;
      }
      if (expectedFlipState === 0) {
        return count > 0 && verticalReserve > 0;
      }
      return count > 0;
    }
    return count === 0 && verticalReserve === 0;
  }, {
    expectedEnabled: !!enabled,
    expectedFlipState: expectedFlipTri
  }, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    if (!state) return false;
    const now = Date.now();
    const marker = window.__boxSignificanceIdleMarker || null;
    if (!marker || marker.token !== state.drawToken) {
      window.__boxSignificanceIdleMarker = { token: state.drawToken, since: now };
      return false;
    }
    return now - marker.since >= 350;
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(350);
}

function expectApprox(actual, expected, tolerance, label) {
  expect(actual, `${label} (actual missing)`).not.toBeNull();
  expect(expected, `${label} (expected missing)`).not.toBeNull();
  expect(
    Math.abs(Number(actual) - Number(expected)),
    `${label}: ${Number(actual)} vs ${Number(expected)}`
  ).toBeLessThanOrEqual(tolerance);
}

function expectUndistortedViewport(metrics, label, tolerance = 0.01) {
  expect(metrics?.svgScaleX, `${label}: horizontal SVG scale`).not.toBeNull();
  expect(metrics?.svgScaleY, `${label}: vertical SVG scale`).not.toBeNull();
  expect(
    Math.abs(Number(metrics.svgScaleX) - Number(metrics.svgScaleY)),
    `${label}: horizontal and vertical SVG scales`
  ).toBeLessThanOrEqual(tolerance);
  expectApprox(metrics.xAxisSpan, metrics.plotWidthPx, 1.5, `${label}: rendered x-axis`);
  expectApprox(metrics.yAxisSpan, metrics.plotHeightPx, 1.5, `${label}: rendered y-axis`);
}

function expectOrientationStable(current, baseline, options = {}) {
  const label = options.label || 'orientation';
  const axisTolerance = Number.isFinite(Number(options.axisTolerance)) ? Number(options.axisTolerance) : 1.5;
  const reserveTolerance = Number.isFinite(Number(options.reserveTolerance)) ? Number(options.reserveTolerance) : 6;
  expectApprox(current.xAxisSpan, baseline.xAxisSpan, axisTolerance, `${label} x-axis span`);
  expectApprox(current.yAxisSpan, baseline.yAxisSpan, axisTolerance, `${label} y-axis span`);
  expectApprox(
    (Number(current.leftViewportExtensionPx) || 0) + (Number(current.rightViewportExtensionPx) || 0),
    (Number(baseline.leftViewportExtensionPx) || 0) + (Number(baseline.rightViewportExtensionPx) || 0),
    reserveTolerance,
    `${label} horizontal reserve`
  );
  expectApprox(
    (Number(current.bottomViewportExtensionPx) || 0) + (Number(current.significanceViewportExtensionPx) || 0),
    (Number(baseline.bottomViewportExtensionPx) || 0) + (Number(baseline.significanceViewportExtensionPx) || 0),
    reserveTolerance,
    `${label} vertical reserve`
  );
}

function expectTransposePair(before, after, options = {}) {
  const label = options.label || 'transpose';
  const axisTolerance = Number.isFinite(Number(options.axisTolerance)) ? Number(options.axisTolerance) : 1.5;
  const reserveTolerance = Number.isFinite(Number(options.reserveTolerance)) ? Number(options.reserveTolerance) : 12;
  expect(after.flipTransition?.axisSpanTarget, `${label} active axis target`).not.toBeNull();
  expectApprox(after.flipTransition?.axisSpanTarget?.plotWidthPx, before.yAxisSpan, axisTolerance, `${label} stored plot width`);
  expectApprox(after.flipTransition?.axisSpanTarget?.plotHeightPx, before.xAxisSpan, axisTolerance, `${label} stored plot height`);
  expectApprox(after.plotWidthPx, before.yAxisSpan, axisTolerance, `${label} target plot width`);
  expectApprox(after.plotHeightPx, before.xAxisSpan, axisTolerance, `${label} target plot height`);
  expectApprox(after.xAxisSpan, before.yAxisSpan, axisTolerance, `${label} y-axis->x-axis span`);
  expectApprox(after.yAxisSpan, before.xAxisSpan, axisTolerance, `${label} x-axis->y-axis span`);
  if(after.flipAxes){
    expect(
      (Number(after.leftViewportExtensionPx) || 0) + (Number(after.rightViewportExtensionPx) || 0)
    ).toBeGreaterThanOrEqual(
      Math.max(0, (Number(before.bottomViewportExtensionPx) || 0) + (Number(before.significanceViewportExtensionPx) || 0) - reserveTolerance)
    );
  }
}

function verticalReserveAllowance(metrics, fallback = 16) {
  const reserve = Math.max(
    Number(metrics?.bottomViewportExtensionPx) || 0,
    Number(metrics?.significanceViewportExtensionPx) || 0,
    Number(metrics?.topReservePx) || 0
  );
  return Math.max(fallback, Math.min(140, reserve));
}

test.describe('Box flip axes with manual resize', () => {
  test.setTimeout(120_000);

  test('repeated flips preserve exact drawable-axis transposition after manual resizing', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await shrinkBoxWidthByHalf(page);

    const baselineUnflipped = await page.evaluate(readFlipTransposeMetrics);
    expect(baselineUnflipped).not.toBeNull();
    expect(baselineUnflipped.flipAxes).toBe(false);
    expect(baselineUnflipped.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(baselineUnflipped.flipTransition?.phase).toBe('steady');
    expect(baselineUnflipped.flipTransition?.activeOrientation).toBe('vertical');
    expect(baselineUnflipped.bottomViewportExtensionPx + baselineUnflipped.significanceViewportExtensionPx).toBeGreaterThan(0);

    await setFlipAxes(page, true);
    const firstFlipped = await page.evaluate(readFlipTransposeMetrics);
    expect(firstFlipped).not.toBeNull();
    expect(firstFlipped.flipAxes).toBe(true);
    expect(firstFlipped.flipTransition?.phase).toBe('steady');
    expect(firstFlipped.flipTransition?.activeOrientation).toBe('horizontal');
    expect(firstFlipped.xTickRotateVertical).toBe(false);
    expect(firstFlipped.rotatedCategoryLabelCount).toBe(0);
    expect(firstFlipped.leftViewportExtensionPx + firstFlipped.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(firstFlipped.bottomViewportExtensionPx).toBeGreaterThanOrEqual(0);
    expect(firstFlipped.significanceViewportExtensionPx).toBe(0);
    expect(firstFlipped.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(firstFlipped.categoryOuterLeftGapPx).toBeGreaterThanOrEqual(4);
    expect(firstFlipped.categoryOuterLeftGapPx).toBeLessThanOrEqual(18);
    expectApprox(firstFlipped.axisTitleGapPx, baselineUnflipped.axisTitleGapPx, 2.5, 'axis-title gap across flip');
    expectTransposePair(baselineUnflipped, firstFlipped, { label: 'first flip transpose', axisTolerance: 1.5 });

    await setFlipAxes(page, false);
    const firstRestoredUnflipped = await page.evaluate(readFlipTransposeMetrics);
    expect(firstRestoredUnflipped).not.toBeNull();
    expect(firstRestoredUnflipped.flipAxes).toBe(false);
    expect(firstRestoredUnflipped.flipTransition?.activeOrientation).toBe('vertical');
    expect(firstRestoredUnflipped.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(firstRestoredUnflipped.bottomViewportExtensionPx + firstRestoredUnflipped.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(firstRestoredUnflipped.leftViewportExtensionPx + firstRestoredUnflipped.rightViewportExtensionPx)
      .toBe(baselineUnflipped.leftViewportExtensionPx + baselineUnflipped.rightViewportExtensionPx);
    expectOrientationStable(firstRestoredUnflipped, baselineUnflipped, { label: 'first unflip restore', axisTolerance: 1.5 });

    await setFlipAxes(page, true);
    const secondFlipped = await page.evaluate(readFlipTransposeMetrics);
    expect(secondFlipped).not.toBeNull();
    expect(secondFlipped.flipAxes).toBe(true);
    expect(secondFlipped.xTickRotateVertical).toBe(false);
    expect(secondFlipped.rotatedCategoryLabelCount).toBe(0);
    expect(secondFlipped.leftViewportExtensionPx + secondFlipped.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(secondFlipped.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(secondFlipped, firstFlipped, { label: 'reflip restore', axisTolerance: 1.5 });

    await setFlipAxes(page, false);
    const secondRestoredUnflipped = await page.evaluate(readFlipTransposeMetrics);
    expect(secondRestoredUnflipped).not.toBeNull();
    expect(secondRestoredUnflipped.flipAxes).toBe(false);
    expect(secondRestoredUnflipped.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(secondRestoredUnflipped, baselineUnflipped, { label: 'second unflip restore', axisTolerance: 1.5 });

    const flippedWiderWidth = await resizeBoxWidthByRatio(page, 0.28);
    const flippedWider = await page.evaluate(readFlipTransposeMetrics);
    expect(flippedWider).not.toBeNull();
    expect(flippedWider.flipAxes).toBe(false);
    expect(flippedWiderWidth).not.toBeNull();
    expect(flippedWider.svgBoxWidthPx).toBeGreaterThan(secondRestoredUnflipped.svgBoxWidthPx + 20);
    expect(flippedWider.xAxisSpan).toBeGreaterThan(secondRestoredUnflipped.xAxisSpan + 6);

    await setFlipAxes(page, true);
    const resizedFlipped = await page.evaluate(readFlipTransposeMetrics);
    expect(resizedFlipped).not.toBeNull();
    expect(resizedFlipped.flipAxes).toBe(true);
    expect(resizedFlipped.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectTransposePair(flippedWider, resizedFlipped, { label: 'flip after unflipped resize', axisTolerance: 1.5 });

    const flippedTallerHeight = await resizeBoxHeightByRatio(page, 0.28);
    const flippedExpanded = await page.evaluate(readFlipTransposeMetrics);
    expect(flippedExpanded).not.toBeNull();
    expect(flippedExpanded.flipAxes).toBe(true);
    expect(flippedExpanded.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(flippedExpanded.svgBoxHeightPx).toBeGreaterThan(resizedFlipped.svgBoxHeightPx + 16);
    expect(flippedExpanded.yAxisSpan).toBeGreaterThan(resizedFlipped.yAxisSpan + 5);
    expect(flippedTallerHeight).not.toBeNull();
    expectUndistortedViewport(flippedExpanded, 'flipped vertical resize');

    await setFlipAxes(page, false);
    const propagatedUnflipped = await page.evaluate(readFlipTransposeMetrics);
    expect(propagatedUnflipped).not.toBeNull();
    expect(propagatedUnflipped.flipAxes).toBe(false);
    expect(propagatedUnflipped.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectTransposePair(flippedExpanded, propagatedUnflipped, { label: 'unflip after flipped resize', axisTolerance: 1.5 });

    await setFlipAxes(page, true);
    const restoredFlippedAfterPropagation = await page.evaluate(readFlipTransposeMetrics);
    expect(restoredFlippedAfterPropagation).not.toBeNull();
    expect(restoredFlippedAfterPropagation.flipAxes).toBe(true);
    expect(restoredFlippedAfterPropagation.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(restoredFlippedAfterPropagation, flippedExpanded, {
      label: 'flipped restore after propagation',
      axisTolerance: 1.5
    });

    await setFlipAxes(page, false);
    const finalUnflipped = await page.evaluate(readFlipTransposeMetrics);
    expect(finalUnflipped).not.toBeNull();
    expect(finalUnflipped.flipAxes).toBe(false);
    expect(finalUnflipped.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(finalUnflipped, propagatedUnflipped, {
      label: 'final unflipped restore',
      axisTolerance: 1.5
    });

    await resizeBoxHeightByRatio(page, -0.2);
    const resizedFinalUnflipped = await page.evaluate(readFlipTransposeMetrics);
    expectUndistortedViewport(resizedFinalUnflipped, 'unflipped vertical resize after flip cycle');

    expect(issues.critical).toEqual([]);
  });

  test('flipped significance adds horizontal reserve and grows svg container width without plot distortion', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await shrinkBoxWidthByHalf(page);

    await setFlipAxes(page, true);
    const beforeSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(beforeSignificance).not.toBeNull();
    expect(beforeSignificance.flipAxes).toBe(true);
    expect(beforeSignificance.flipTransition?.activeOrientation).toBe('horizontal');
    expect(beforeSignificance.significancePathCount).toBe(0);
    expect(beforeSignificance.rightViewportExtensionPx).toBe(0);
    expect(beforeSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await computeStatsAndEnableSignificance(page, { expectedFlip: true });
    const afterSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(afterSignificance).not.toBeNull();
    expect(afterSignificance.flipAxes).toBe(true);
    expect(afterSignificance.flipTransition?.activeOrientation).toBe('horizontal');
    expect(afterSignificance.significancePathCount).toBeGreaterThan(0);
    expect(afterSignificance.significanceViewportExtensionPx).toBe(0);
    expect(afterSignificance.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(afterSignificance.leftViewportExtensionPx + afterSignificance.rightViewportExtensionPx)
      .toBeGreaterThan(beforeSignificance.leftViewportExtensionPx + beforeSignificance.rightViewportExtensionPx + 6);
    expect(Math.abs(afterSignificance.svgBoxWidthPx - beforeSignificance.svgBoxWidthPx)).toBeLessThanOrEqual(2);
    expect(afterSignificance.plotWidthPx).not.toBeNull();
    expect(afterSignificance.plotHeightPx).not.toBeNull();
    expect(beforeSignificance.plotWidthPx).not.toBeNull();
    expect(beforeSignificance.plotHeightPx).not.toBeNull();
    expect(Math.abs(afterSignificance.plotWidthPx - beforeSignificance.plotWidthPx)).toBeLessThanOrEqual(12);
    expect(Math.abs(afterSignificance.plotHeightPx - beforeSignificance.plotHeightPx)).toBeLessThanOrEqual(4);
    expect(Math.abs(afterSignificance.xAxisSpan - beforeSignificance.xAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(afterSignificance.yAxisSpan - beforeSignificance.yAxisSpan)).toBeLessThanOrEqual(4);
    expect(afterSignificance.yAxisSpan).toBeGreaterThan(0);
    expect(afterSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await setShowSignificance(page, false, { expectedFlip: true });
    const flippedWithoutSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(flippedWithoutSignificance).not.toBeNull();
    expect(flippedWithoutSignificance.flipAxes).toBe(true);
    expect(flippedWithoutSignificance.significancePathCount).toBe(0);
    expect(flippedWithoutSignificance.rightViewportExtensionPx).toBe(0);
    expect(Math.abs(flippedWithoutSignificance.svgBoxWidthPx - afterSignificance.svgBoxWidthPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(flippedWithoutSignificance.xAxisSpan - afterSignificance.xAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(flippedWithoutSignificance.yAxisSpan - afterSignificance.yAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(flippedWithoutSignificance.plotWidthPx - afterSignificance.plotWidthPx)).toBeLessThanOrEqual(12);
    expect(Math.abs(flippedWithoutSignificance.plotHeightPx - afterSignificance.plotHeightPx)).toBeLessThanOrEqual(4);

    await setShowSignificance(page, true, { expectedFlip: true });
    const flippedReenabledSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(flippedReenabledSignificance).not.toBeNull();
    expect(flippedReenabledSignificance.flipAxes).toBe(true);
    expect(flippedReenabledSignificance.significancePathCount).toBeGreaterThan(0);
    expect(flippedReenabledSignificance.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(Math.abs(flippedReenabledSignificance.svgBoxWidthPx - flippedWithoutSignificance.svgBoxWidthPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(flippedReenabledSignificance.svgBoxWidthPx - afterSignificance.svgBoxWidthPx)).toBeLessThanOrEqual(12);
    expect(Math.abs(flippedReenabledSignificance.xAxisSpan - afterSignificance.xAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(flippedReenabledSignificance.yAxisSpan - afterSignificance.yAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(flippedReenabledSignificance.plotWidthPx - afterSignificance.plotWidthPx)).toBeLessThanOrEqual(12);
    expect(Math.abs(flippedReenabledSignificance.plotHeightPx - afterSignificance.plotHeightPx)).toBeLessThanOrEqual(4);

    await clickBoxHeightHandleWithoutDrag(page);
    const flippedAfterNoopResizeClick = await page.evaluate(readFlipTransposeMetrics);
    expect(flippedAfterNoopResizeClick).not.toBeNull();
    expect(flippedAfterNoopResizeClick.flipAxes).toBe(true);
    expect(flippedAfterNoopResizeClick.significancePathCount).toBeGreaterThan(0);
    expect(Math.abs(flippedAfterNoopResizeClick.xAxisSpan - flippedReenabledSignificance.xAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(flippedAfterNoopResizeClick.yAxisSpan - flippedReenabledSignificance.yAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(flippedAfterNoopResizeClick.plotWidthPx - flippedReenabledSignificance.plotWidthPx)).toBeLessThanOrEqual(4);
    expect(Math.abs(flippedAfterNoopResizeClick.plotHeightPx - flippedReenabledSignificance.plotHeightPx)).toBeLessThanOrEqual(4);

    await setFlipAxes(page, false);
    const restoredWithSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(restoredWithSignificance).not.toBeNull();
    expect(restoredWithSignificance.flipAxes).toBe(false);
    expect(restoredWithSignificance.flipTransition?.activeOrientation).toBe('vertical');
    expect(restoredWithSignificance.significancePathCount).toBeGreaterThan(0);
    expect(restoredWithSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredWithSignificance.bottomViewportExtensionPx + restoredWithSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredWithSignificance.rightViewportExtensionPx).toBe(0);
    expect(restoredWithSignificance.leftViewportExtensionPx).toBe(0);
    if (restoredWithSignificance.xTickRotateVertical) {
      expect(restoredWithSignificance.bottomViewportExtensionPx).toBeGreaterThan(0);
    }
    expectTransposePair(afterSignificance, restoredWithSignificance, {
      label: 'unflip with significance',
      axisTolerance: 1.5
    });
    expect(restoredWithSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await setFlipAxes(page, true);
    await page.waitForFunction(() => {
      const state = window.Components?.box?.__getState?.();
      return !!state?.flipAxes
        && !!document.querySelector('#boxPlot svg')
        && document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0;
    }, null, { timeout: 20_000 });
    const reflipWithSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(reflipWithSignificance).not.toBeNull();
    expect(reflipWithSignificance.flipAxes).toBe(true);
    expect(reflipWithSignificance.significancePathCount).toBeGreaterThan(0);
    expect(reflipWithSignificance.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(reflipWithSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(reflipWithSignificance, afterSignificance, {
      label: 'reflip with significance',
      axisTolerance: 1.5
    });

    await setFlipAxes(page, false);
    const finalUnflipWithSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(finalUnflipWithSignificance).not.toBeNull();
    expect(finalUnflipWithSignificance.flipAxes).toBe(false);
    expect(finalUnflipWithSignificance.significancePathCount).toBeGreaterThan(0);
    expect(finalUnflipWithSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(finalUnflipWithSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(finalUnflipWithSignificance, restoredWithSignificance, {
      label: 'final unflip with significance',
      axisTolerance: 1.5
    });

    expect(issues.critical).toEqual([]);
  });

  test('repeated double-click reset preserves significance reserves in both orientations', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await computeStatsAndEnableSignificance(page, { expectedFlip: false });

    await doubleClickBoxResizeHandle(page);
    const unflippedResetA = await page.evaluate(readFlipTransposeMetrics);
    await doubleClickBoxResizeHandle(page);
    const unflippedResetB = await page.evaluate(readFlipTransposeMetrics);
    expect(unflippedResetA.flipAxes).toBe(false);
    expect(unflippedResetA.significancePathCount).toBeGreaterThan(0);
    expect(unflippedResetA.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(unflippedResetA.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(unflippedResetB, unflippedResetA, {
      label: 'repeated unflipped double-click reset',
      axisTolerance: 1.5
    });

    await setFlipAxes(page, true);
    const initialFlippedFrame = await page.evaluate(readFlipTransposeMetrics);
    await dragBoxWidthHandle(page, 120);
    await dragBoxHeightHandle(page, 80);
    const manuallyResizedFlippedFrame = await page.evaluate(readFlipTransposeMetrics);
    expect(Math.abs(manuallyResizedFlippedFrame.svgBoxWidthPx - initialFlippedFrame.svgBoxWidthPx)).toBeGreaterThan(50);
    expect(Math.abs(manuallyResizedFlippedFrame.svgBoxHeightPx - initialFlippedFrame.svgBoxHeightPx)).toBeGreaterThan(35);
    await doubleClickBoxResizeHandle(page);
    const flippedResetA = await page.evaluate(readFlipTransposeMetrics);
    await doubleClickBoxResizeHandle(page);
    const flippedResetB = await page.evaluate(readFlipTransposeMetrics);
    expect(flippedResetA.flipAxes).toBe(true);
    expect(flippedResetA.significancePathCount).toBeGreaterThan(0);
    expect(flippedResetA.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(flippedResetA.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectApprox(flippedResetA.svgBoxWidthPx, initialFlippedFrame.svgBoxWidthPx, 2.5, 'flipped reset frame width');
    expectApprox(flippedResetA.svgBoxHeightPx, initialFlippedFrame.svgBoxHeightPx, 2.5, 'flipped reset frame height');
    expectApprox(flippedResetA.svgBoxAspectRatio, initialFlippedFrame.svgBoxAspectRatio, 0.02, 'flipped reset frame ratio');
    expectOrientationStable(flippedResetB, flippedResetA, {
      label: 'repeated flipped double-click reset',
      axisTolerance: 1.5
    });

    expect(issues.critical).toEqual([]);
  });

  test('computing significance before flip preserves transposed graph proportions', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await computeStatsAndEnableSignificance(page, { expectedFlip: false });

    const beforeFlip = await page.evaluate(readFlipTransposeMetrics);
    expect(beforeFlip).not.toBeNull();
    expect(beforeFlip.flipAxes).toBe(false);
    expect(beforeFlip.flipTransition?.activeOrientation).toBe('vertical');
    expect(beforeFlip.significancePathCount).toBeGreaterThan(0);
    expect(beforeFlip.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(beforeFlip.rightViewportExtensionPx).toBe(0);
    expect(beforeFlip.leftViewportExtensionPx).toBe(0);
    if (beforeFlip.xTickRotateVertical) {
      expect(beforeFlip.bottomViewportExtensionPx).toBeGreaterThan(0);
    }
    expect(beforeFlip.plotWidthPx).not.toBeNull();
    expect(beforeFlip.plotHeightPx).not.toBeNull();

    await setFlipAxes(page, true);
    const afterFlip = await page.evaluate(readFlipTransposeMetrics);
    expect(afterFlip).not.toBeNull();
    expect(afterFlip.flipAxes).toBe(true);
    expect(afterFlip.flipTransition?.activeOrientation).toBe('horizontal');
    expect(afterFlip.significancePathCount).toBeGreaterThan(0);
    expect(afterFlip.significanceViewportExtensionPx).toBe(0);
    expect(afterFlip.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(afterFlip.leftViewportExtensionPx).toBeGreaterThan(0);
    expect(afterFlip.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectTransposePair(beforeFlip, afterFlip, {
      label: 'flip after significance',
      axisTolerance: 1.5
    });

    await setFlipAxes(page, false);
    const restoredAfterFlip = await page.evaluate(readFlipTransposeMetrics);
    expect(restoredAfterFlip).not.toBeNull();
    expect(restoredAfterFlip.flipAxes).toBe(false);
    expect(restoredAfterFlip.significancePathCount).toBeGreaterThan(0);
    expect(restoredAfterFlip.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredAfterFlip.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(restoredAfterFlip, beforeFlip, {
      label: 'restore after stats-before-flip',
      axisTolerance: 1.5
    });

    expect(issues.critical).toEqual([]);
  });

  test('non-flip significance off-on restores vertical reserve without plot distortion', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await computeStatsAndEnableSignificance(page, { expectedFlip: false });

    const withSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(withSignificance).not.toBeNull();
    expect(withSignificance.flipAxes).toBe(false);
    expect(withSignificance.significancePathCount).toBeGreaterThan(0);
    expect(withSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(withSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await setShowSignificance(page, false, { expectedFlip: false });
    const withoutSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(withoutSignificance).not.toBeNull();
    expect(withoutSignificance.flipAxes).toBe(false);
    expect(withoutSignificance.significancePathCount).toBe(0);
    expect(withoutSignificance.significanceViewportExtensionPx).toBe(0);
    expect(withoutSignificance.bottomViewportExtensionPx).toBeGreaterThan(0);
    expect(withoutSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(Math.abs(withoutSignificance.svgBoxHeightPx - withSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(withoutSignificance.topReservePx - withSignificance.topReservePx)).toBeLessThanOrEqual(2);
    expect(Math.abs(withoutSignificance.bottomReservePx - withSignificance.bottomReservePx)).toBeLessThanOrEqual(8);
    expect(Math.abs(withoutSignificance.xAxisSpan - withSignificance.xAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(withoutSignificance.yAxisSpan - withSignificance.yAxisSpan))
      .toBeLessThanOrEqual(verticalReserveAllowance(withSignificance, 4));
    expect(Math.abs(withoutSignificance.plotWidthPx - withSignificance.plotWidthPx)).toBeLessThanOrEqual(4);
    expect(Math.abs(withoutSignificance.plotHeightPx - withSignificance.plotHeightPx))
      .toBeLessThanOrEqual(verticalReserveAllowance(withSignificance, 4));

    await setShowSignificance(page, true, { expectedFlip: false });
    const restoredAfterReenable = await page.evaluate(readFlipTransposeMetrics);
    expect(restoredAfterReenable).not.toBeNull();
    expect(restoredAfterReenable.flipAxes).toBe(false);
    expect(restoredAfterReenable.significancePathCount).toBeGreaterThan(0);
    expect(restoredAfterReenable.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredAfterReenable.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(Math.abs(restoredAfterReenable.svgBoxHeightPx - withoutSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredAfterReenable.topReservePx - withoutSignificance.topReservePx)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredAfterReenable.svgBoxHeightPx - withSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(10);
    expect(Math.abs(restoredAfterReenable.xAxisSpan - withSignificance.xAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(restoredAfterReenable.yAxisSpan - withSignificance.yAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(restoredAfterReenable.plotWidthPx - withSignificance.plotWidthPx)).toBeLessThanOrEqual(4);
    expect(Math.abs(restoredAfterReenable.plotHeightPx - withSignificance.plotHeightPx)).toBeLessThanOrEqual(4);

    expect(issues.critical).toEqual([]);
  });

  test('significance toggle-off after flip-unflip removes top reserve without axis stretch', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await computeStatsAndEnableSignificance(page, { expectedFlip: false });

    const beforeFlip = await page.evaluate(readFlipTransposeMetrics);
    expect(beforeFlip).not.toBeNull();
    expect(beforeFlip.flipAxes).toBe(false);
    expect(beforeFlip.significancePathCount).toBeGreaterThan(0);
    expect(beforeFlip.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(beforeFlip.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await setFlipAxes(page, true);
    await setFlipAxes(page, false);
    const restoredWithSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(restoredWithSignificance).not.toBeNull();
    expect(restoredWithSignificance.flipAxes).toBe(false);
    expect(restoredWithSignificance.significancePathCount).toBeGreaterThan(0);
    expect(restoredWithSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredWithSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expectOrientationStable(restoredWithSignificance, beforeFlip, {
      label: 'restore before significance off',
      axisTolerance: 1.5
    });

    await setShowSignificance(page, false, { expectedFlip: false });
    const withoutSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(withoutSignificance).not.toBeNull();
    expect(withoutSignificance.flipAxes).toBe(false);
    expect(withoutSignificance.significancePathCount).toBe(0);
    expect(withoutSignificance.significanceViewportExtensionPx).toBe(0);
    expect(withoutSignificance.bottomViewportExtensionPx).toBeGreaterThan(0);
    expect(withoutSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(Math.abs(withoutSignificance.bottomViewportExtensionPx - restoredWithSignificance.bottomViewportExtensionPx)).toBeLessThanOrEqual(6);
    expect(Math.abs(withoutSignificance.svgBoxHeightPx - restoredWithSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(withoutSignificance.topReservePx).not.toBeNull();
    expect(restoredWithSignificance.topReservePx).not.toBeNull();
    expect(Math.abs(withoutSignificance.topReservePx - restoredWithSignificance.topReservePx)).toBeLessThanOrEqual(2);
    expect(Math.abs(withoutSignificance.bottomReservePx - restoredWithSignificance.bottomReservePx)).toBeLessThanOrEqual(8);
    expect(Math.abs(withoutSignificance.xAxisSpan - restoredWithSignificance.xAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(withoutSignificance.yAxisSpan - restoredWithSignificance.yAxisSpan))
      .toBeLessThanOrEqual(verticalReserveAllowance(restoredWithSignificance, 4));
    expect(Math.abs(withoutSignificance.plotWidthPx - restoredWithSignificance.plotWidthPx)).toBeLessThanOrEqual(4);
    expect(Math.abs(withoutSignificance.plotHeightPx - restoredWithSignificance.plotHeightPx))
      .toBeLessThanOrEqual(verticalReserveAllowance(restoredWithSignificance, 4));

    await setShowSignificance(page, true, { expectedFlip: false });
    const restoredAfterReenable = await page.evaluate(readFlipTransposeMetrics);
    expect(restoredAfterReenable).not.toBeNull();
    expect(restoredAfterReenable.flipAxes).toBe(false);
    expect(restoredAfterReenable.significancePathCount).toBeGreaterThan(0);
    expect(restoredAfterReenable.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredAfterReenable.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(Math.abs(restoredAfterReenable.svgBoxHeightPx - withoutSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredAfterReenable.topReservePx - withoutSignificance.topReservePx)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredAfterReenable.svgBoxHeightPx - restoredWithSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(10);
    expect(Math.abs(restoredAfterReenable.xAxisSpan - restoredWithSignificance.xAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(restoredAfterReenable.yAxisSpan - restoredWithSignificance.yAxisSpan)).toBeLessThanOrEqual(4);
    expect(Math.abs(restoredAfterReenable.plotWidthPx - restoredWithSignificance.plotWidthPx)).toBeLessThanOrEqual(4);
    expect(Math.abs(restoredAfterReenable.plotHeightPx - restoredWithSignificance.plotHeightPx)).toBeLessThanOrEqual(4);

    expect(issues.critical).toEqual([]);
  });
});
