const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readBoxPointSnapshot(traceKey = null) {
  const root = document.querySelector('#boxPage:not([hidden])');
  const svg = root?.querySelector?.('#boxPlot svg') || null;
  const state = window.Components?.box?.__getState?.() || null;
  if (!svg || !state) {
    return null;
  }

  const groups = Array.from(svg.querySelectorAll('g[data-export-layer="box-points"][data-trace]'));
  const group = traceKey == null
    ? groups[0]
    : groups.find(node => String(node.getAttribute('data-trace') || '') === String(traceKey));
  if (!group) {
    return null;
  }

  const pointNodes = [];
  if (group.hasAttribute('data-point-size')) {
    pointNodes.push(group);
  }
  pointNodes.push(...group.querySelectorAll('[data-point-size]'));
  const radii = pointNodes
    .map(node => Number(node.getAttribute('data-point-size')) / 2)
    .filter(radius => Number.isFinite(radius) && radius > 0)
    .sort((a, b) => a - b);
  if (!radii.length) {
    return null;
  }

  const trace = String(group.getAttribute('data-trace') || '');
  const radius = radii[Math.floor(radii.length / 2)];
  const pointSizing = state.graphGeometry?.pointSizing || null;
  const localStyle = state.pointStyles?.[trace] || null;
  return {
    trace,
    radius,
    pointCount: radii.length,
    flipAxes: state.flipAxes === true,
    pointSizing: {
      baseCategorySpanPx: Number(pointSizing?.baseCategorySpanPx) || null,
      baseValueSpanPx: Number(pointSizing?.baseValueSpanPx) || null
    },
    localSize: Number(localStyle?.size) || null,
    localSizeMode: localStyle?.sizeMode || null
  };
}

async function waitForBoxDrawIdle(page, markerKey) {
  await page.waitForFunction(key => {
    const state = window.Components?.box?.__getState?.();
    if (!state) {
      return false;
    }
    const now = Date.now();
    const store = window.__boxPointSizeIdleMarkers || (window.__boxPointSizeIdleMarkers = {});
    const marker = store[key] || null;
    if (!marker || marker.token !== state.drawToken) {
      store[key] = { token: state.drawToken, since: now };
      return false;
    }
    return now - marker.since >= 300;
  }, markerKey, { timeout: 30_000 });
  await page.waitForTimeout(200);
}

async function setFlipAxes(page, enabled) {
  const toggle = page.locator('#boxFlipAxes');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if (enabled) {
    await toggle.check();
  } else {
    await toggle.uncheck();
  }
  await page.waitForFunction(expected => {
    const state = window.Components?.box?.__getState?.();
    return !!state && state.flipAxes === expected;
  }, enabled, { timeout: 20_000 });
  await waitForBoxDrawIdle(page, enabled ? 'flip-on' : 'flip-off');
}

async function shrinkBoxWidth(page, ratio = 0.42) {
  const lockToggle = page.locator('#boxGraphPanel .resizer-aspect-checkbox');
  if (await lockToggle.isVisible().catch(() => false)) {
    if (await lockToggle.isChecked()) {
      await lockToggle.uncheck();
      await page.waitForTimeout(150);
    }
  }

  const svgBox = page.locator('#boxGraphPanel .svgbox').first();
  const handle = svgBox.locator('.resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 20_000 });
  await handle.scrollIntoViewIfNeeded();
  const frameBefore = await svgBox.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!frameBefore || !handleBox) {
    throw new Error('Unable to resolve Box frame or vertical resize handle');
  }

  const startX = handleBox.x + Math.max(2, Math.min(handleBox.width - 2, handleBox.width / 2));
  const startY = handleBox.y + handleBox.height / 2;
  const deltaX = -Math.round(frameBefore.width * ratio);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 18 });
  await page.mouse.up();

  await page.waitForFunction(({ initialWidth, targetRatio }) => {
    const frame = document.querySelector('#boxGraphPanel .svgbox');
    const width = Number(frame?.getBoundingClientRect?.().width);
    return Number.isFinite(width) && width <= initialWidth * targetRatio;
  }, {
    initialWidth: frameBefore.width,
    targetRatio: Math.max(0.62, 1 - ratio + 0.08)
  }, { timeout: 20_000 });
  await waitForBoxDrawIdle(page, 'width-shrink');
}

async function openPointSizeEditor(page, trace) {
  const point = page.locator(`#boxPlot g[data-export-layer="box-points"][data-trace="${trace}"] [data-point-size]`).first();
  await expect(point).toBeVisible({ timeout: 20_000 });
  await point.click({ force: true });

  const activePage = page.locator('#boxPage:not([hidden])');
  const toolbarHost = activePage.locator('.font-toolbar-host[data-font-toolbar-scope="box"]').first();
  await expect(toolbarHost).toHaveClass(/font-toolbar-host--visible/, { timeout: 20_000 });
  const sizeChip = toolbarHost.locator('.shared-fill-style-chip').first();
  await expect(sizeChip).toBeVisible({ timeout: 20_000 });
  const sizeText = String(await sizeChip.getAttribute('data-size-text') || '').trim();
  const displayedSize = Number.parseFloat(sizeText.replace(/px$/i, ''));
  expect(Number.isFinite(displayedSize)).toBe(true);

  await sizeChip.click({ force: true });
  const sizeInput = page.locator('input.shared-color-picker__scatter-style-input[aria-label="Size"]:visible').first();
  await expect(sizeInput).toBeVisible({ timeout: 20_000 });
  return { displayedSize, sizeInput };
}

test.describe('Box single-values point sizing', () => {
  test('keeps auto size truthful through resize/flip and applies the shown value exactly as manual size', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'Graph resize and SVG size projection are validated on Chromium.');
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);

    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
      { first: true, loadExample: true }
    );
    await page.locator('#boxGraphType').selectOption('strip');
    await waitForBoxDrawIdle(page, 'initial-strip');

    const initial = await page.evaluate(readBoxPointSnapshot);
    expect(initial).toBeTruthy();
    expect(initial.radius).toBeGreaterThan(0);
    expect(initial.pointSizing.baseCategorySpanPx).toBeGreaterThan(0);
    expect(initial.pointSizing.baseValueSpanPx).toBeGreaterThan(0);

    await shrinkBoxWidth(page);
    const shrunk = await page.evaluate(readBoxPointSnapshot, initial.trace);
    expect(shrunk).toBeTruthy();
    expect(shrunk.radius).toBeLessThan(initial.radius - 0.2);

    const autoEditor = await openPointSizeEditor(page, shrunk.trace);
    expect(Math.abs(autoEditor.displayedSize - shrunk.radius)).toBeLessThanOrEqual(0.051);
    await page.keyboard.press('Escape');

    await setFlipAxes(page, true);
    const flippedAuto = await page.evaluate(readBoxPointSnapshot, shrunk.trace);
    expect(flippedAuto).toBeTruthy();
    expect(flippedAuto.flipAxes).toBe(true);
    expect(Math.abs(flippedAuto.radius - shrunk.radius)).toBeLessThanOrEqual(0.11);

    const manualEditor = await openPointSizeEditor(page, flippedAuto.trace);
    const manualSize = manualEditor.displayedSize;
    await manualEditor.sizeInput.fill(String(manualSize));
    await manualEditor.sizeInput.blur();
    await page.waitForFunction(({ trace, expected }) => {
      const state = window.Components?.box?.__getState?.();
      const style = state?.pointStyles?.[trace];
      return style?.sizeMode === 'manual' && Math.abs(Number(style?.size) - expected) <= 0.001;
    }, { trace: flippedAuto.trace, expected: manualSize }, { timeout: 20_000 });

    const manual = await page.evaluate(readBoxPointSnapshot, flippedAuto.trace);
    expect(manual).toBeTruthy();
    expect(manual.localSizeMode).toBe('manual');
    expect(manual.localSize).toBeCloseTo(manualSize, 5);
    expect(manual.radius).toBeCloseTo(manualSize, 5);

    await setFlipAxes(page, false);
    const restoredManual = await page.evaluate(readBoxPointSnapshot, flippedAuto.trace);
    expect(restoredManual).toBeTruthy();
    expect(restoredManual.flipAxes).toBe(false);
    expect(restoredManual.radius).toBeCloseTo(manualSize, 5);

    await testInfo.attach('box-single-values-point-size.snapshots.json', {
      body: Buffer.from(JSON.stringify({ initial, shrunk, flippedAuto, manual, restoredManual }, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    expect(issues.critical).toEqual([]);
  });
});
