const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function waitForHeatmapCells(page) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect');
    return cells.length >= 9;
  }, null, { timeout: 60_000 });
}

async function loadHeatmapFixture(page) {
  await page.waitForFunction(() => {
    const state = window.Components?.heatmap?.__getState?.() || null;
    return !!(state?.hot && typeof state.hot.loadData === 'function');
  }, null, { timeout: 45_000 });
  await page.evaluate(() => {
    const hot = window.Components?.heatmap?.__getState?.()?.hot || null;
    if(!hot || typeof hot.loadData !== 'function'){
      throw new Error('heatmap hot instance unavailable');
    }
    hot.loadData([
      ['Gene', 'Sample_A', 'Sample_B', 'Sample_C'],
      ['GeneA', 2.1, 2.4, 6.8],
      ['GeneB', 5.5, 5.8, 2.2],
      ['GeneC', 1.2, 1.0, 7.9],
      ['GeneD', 3.8, 3.5, 1.6],
      ['GeneE', 4.5, 4.2, 3.1]
    ], { source: 'e2e-heatmap-view-switch-fixture' });
  });
}

async function drawTimestamp(page) {
  return page.evaluate(() => {
    const state = window.Components?.heatmap?.__getState?.() || null;
    return Number(state?.performance?.draw?.timestamp || 0);
  });
}

async function waitForDrawAdvance(page, previousTimestamp, timeout = 60_000) {
  await page.waitForFunction(prev => {
    const state = window.Components?.heatmap?.__getState?.() || null;
    const draw = state?.performance?.draw || null;
    return Number(draw?.timestamp || 0) > Number(prev || 0);
  }, previousTimestamp, { timeout });
}

async function getHeatmapStateSnapshot(page) {
  return page.evaluate(() => {
    const state = window.Components?.heatmap?.__getState?.() || null;
    const checkbox = document.querySelector('#heatmapGraphPanel .resizer-aspect-checkbox');
    const svgBox = document.querySelector('#heatmapGraphPanel .svgbox');
    return {
      view: document.getElementById('heatmapView')?.value || null,
      modelType: state?.lastRenderModel?.type || null,
      checkboxChecked: !!checkbox?.checked,
      checkboxDisabled: !!checkbox?.disabled,
      lockDataset: svgBox?.dataset?.resizerAspectLocked || null,
      preserveAspectRatio: document.getElementById('heatmapSvg')?.getAttribute('preserveAspectRatio') || null
    };
  });
}

async function readHeatmapGeometry(page) {
  return page.evaluate(() => {
    const svgBox = document.querySelector('#heatmapPage:not([hidden]) #heatmapGraphPanel .svgbox');
    const svg = document.getElementById('heatmapSvg');
    const cells = Array.from(svg?.querySelectorAll?.('[data-export-layer="heatmap-cells"] rect') || []);
    const frame = svgBox?.getBoundingClientRect?.();
    const bounds = cells.reduce((acc, cell) => {
      const rect = cell.getBoundingClientRect();
      acc.left = Math.min(acc.left, rect.left);
      acc.top = Math.min(acc.top, rect.top);
      acc.right = Math.max(acc.right, rect.right);
      acc.bottom = Math.max(acc.bottom, rect.bottom);
      return acc;
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const matrixWidth = bounds.right - bounds.left;
    const matrixHeight = bounds.bottom - bounds.top;
    return {
      frameWidth: frame?.width || 0,
      frameHeight: frame?.height || 0,
      frameRatio: frame?.height ? frame.width / frame.height : 0,
      matrixWidth,
      matrixHeight,
      matrixRatio: matrixHeight ? matrixWidth / matrixHeight : 0,
      preserveAspectRatio: svg?.getAttribute('preserveAspectRatio') || null,
      drawSequence: Number(window.Components?.heatmap?.__getState?.()?.performance?.draw?.sequence || 0)
    };
  });
}

async function waitForStableHeatmapGeometry(page) {
  let previous = null;
  let stableSamples = 0;
  for(let attempt = 0; attempt < 50; attempt += 1){
    await waitForHeatmapCells(page);
    const current = await readHeatmapGeometry(page);
    const stable = previous
      && Math.abs(current.frameWidth - previous.frameWidth) < 0.1
      && Math.abs(current.frameHeight - previous.frameHeight) < 0.1
      && Math.abs(current.matrixWidth - previous.matrixWidth) < 0.1
      && Math.abs(current.matrixHeight - previous.matrixHeight) < 0.1;
    stableSamples = stable ? stableSamples + 1 : 0;
    if(stableSamples >= 2) return current;
    previous = current;
    await page.waitForTimeout(150);
  }
  throw new Error('Heatmap geometry did not settle');
}

async function setHeatmapLock(page, checked) {
  await page.evaluate(shouldLock => {
    const checkbox = document.querySelector('#heatmapPage:not([hidden]) .resizer-aspect-checkbox');
    if(!checkbox || checkbox.disabled) throw new Error('Heatmap Lock ratio control unavailable');
    if(checkbox.checked !== shouldLock){
      checkbox.checked = shouldLock;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, checked);
}

async function dragHeatmapHandle(page, selector, dx, dy) {
  const handle = page.locator(`#heatmapPage:not([hidden]) .svgbox ${selector}`).first();
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

function expectRatioNear(actual, expected, relativeTolerance = 0.005) {
  expect(Math.abs(actual / expected - 1)).toBeLessThanOrEqual(relativeTolerance);
}

test.describe('Heatmap view switch and lock ratio behavior', () => {
  for (const correlationView of ['corr-columns', 'corr-rows']) {
    test(`switching from ${correlationView} to data values updates immediately and lock ratio stays user-toggleable`, async ({ page }) => {
      test.setTimeout(120_000);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

      await openComponentFromWelcome(
        page,
        { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
        { first: true }
      );
      await loadHeatmapFixture(page);
      await waitForHeatmapCells(page);

      await page.selectOption('#heatmapView', correlationView);
      await page.waitForTimeout(300);

      let snapshot = await getHeatmapStateSnapshot(page);
      expect(snapshot.view).toBe(correlationView);
      expect(snapshot.modelType).toBe('correlation');
      expect(snapshot.checkboxChecked).toBe(true);
      expect(snapshot.checkboxDisabled).toBe(true);

      let previousTs = await drawTimestamp(page);
      await page.selectOption('#heatmapView', 'values');
      await waitForDrawAdvance(page, previousTs);

      snapshot = await getHeatmapStateSnapshot(page);
      expect(snapshot.view).toBe('values');
      expect(snapshot.modelType).toBe('values');
      expect(snapshot.checkboxDisabled).toBe(false);
      expect(snapshot.checkboxChecked).toBe(false);
      expect(snapshot.lockDataset).toBe('false');
      expect(snapshot.preserveAspectRatio).toBe('none');

      await page.locator('#heatmapGraphPanel .resizer-options-summary').click();
      const lockRatioInMenu = page.locator('#heatmapGraphPanel .resizer-options-menu .resizer-aspect-checkbox');
      await expect(lockRatioInMenu).toBeVisible();
      await expect(lockRatioInMenu).toBeEnabled();

      await lockRatioInMenu.click();
      await expect(lockRatioInMenu).toBeChecked();

      snapshot = await getHeatmapStateSnapshot(page);
      expect(snapshot.view).toBe('values');
      expect(snapshot.modelType).toBe('values');
      expect(snapshot.checkboxDisabled).toBe(false);
      expect(snapshot.checkboxChecked).toBe(true);
      expect(snapshot.lockDataset).toBe('true');
      expect(snapshot.preserveAspectRatio).toBe('none');

      await lockRatioInMenu.click();
      await expect(lockRatioInMenu).not.toBeChecked();

      snapshot = await getHeatmapStateSnapshot(page);
      expect(snapshot.view).toBe('values');
      expect(snapshot.modelType).toBe('values');
      expect(snapshot.checkboxDisabled).toBe(false);
      expect(snapshot.checkboxChecked).toBe(false);
      expect(snapshot.lockDataset).toBe('false');
      expect(snapshot.preserveAspectRatio).toBe('none');
    });
  }

  test('Data values Lock ratio preserves current frame and matrix geometry from the first resize', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await loadHeatmapFixture(page);
    await waitForHeatmapCells(page);
    const previousTs = await drawTimestamp(page);
    await page.selectOption('#heatmapView', 'values');
    await waitForDrawAdvance(page, previousTs);
    await setHeatmapLock(page, false);
    await page.evaluate(() => {
      const svgBox = document.querySelector('#heatmapPage:not([hidden]) #heatmapGraphPanel .svgbox');
      window.Shared?.applyResizableBoxSize?.(svgBox, {
        width: 377,
        height: 350,
        axis: 'both',
        forceExact: true,
        reason: 'heatmap-lock-ratio-e2e-setup'
      });
    });

    const beforeLock = await waitForStableHeatmapGeometry(page);
    expect(beforeLock.preserveAspectRatio).toBe('none');

    await setHeatmapLock(page, true);
    const afterLock = await waitForStableHeatmapGeometry(page);
    expect(afterLock.frameWidth).toBeCloseTo(beforeLock.frameWidth, 1);
    expect(afterLock.frameHeight).toBeCloseTo(beforeLock.frameHeight, 1);
    expect(afterLock.matrixWidth).toBeCloseTo(beforeLock.matrixWidth, 1);
    expect(afterLock.matrixHeight).toBeCloseTo(beforeLock.matrixHeight, 1);
    expect(afterLock.preserveAspectRatio).toBe('none');

    await dragHeatmapHandle(page, '.resizer-vertical', 58, 0);
    const pointerEnd = await readHeatmapGeometry(page);
    const afterFirstResize = await waitForStableHeatmapGeometry(page);
    expect(Math.abs(afterFirstResize.frameWidth - pointerEnd.frameWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterFirstResize.frameHeight - pointerEnd.frameHeight)).toBeLessThanOrEqual(1);
    expect(afterFirstResize.drawSequence - pointerEnd.drawSequence).toBeLessThanOrEqual(1);
    expectRatioNear(afterFirstResize.matrixRatio, beforeLock.matrixRatio);
    expectRatioNear(
      afterFirstResize.matrixWidth / beforeLock.matrixWidth,
      afterFirstResize.matrixHeight / beforeLock.matrixHeight,
      0.01
    );

    await dragHeatmapHandle(page, '.resizer-vertical', -38, 0);
    const reversePointerEnd = await readHeatmapGeometry(page);
    const afterReverseResize = await waitForStableHeatmapGeometry(page);
    expect(Math.abs(afterReverseResize.frameWidth - reversePointerEnd.frameWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterReverseResize.frameHeight - reversePointerEnd.frameHeight)).toBeLessThanOrEqual(1);
    expect(afterReverseResize.drawSequence - reversePointerEnd.drawSequence).toBeLessThanOrEqual(1);
    expectRatioNear(afterReverseResize.matrixRatio, beforeLock.matrixRatio);

    await setHeatmapLock(page, false);
    const afterUnlock = await waitForStableHeatmapGeometry(page);
    expect(afterUnlock.frameWidth).toBeCloseTo(afterReverseResize.frameWidth, 1);
    expect(afterUnlock.frameHeight).toBeCloseTo(afterReverseResize.frameHeight, 1);
    expect(afterUnlock.matrixWidth).toBeCloseTo(afterReverseResize.matrixWidth, 1);
    expect(afterUnlock.matrixHeight).toBeCloseTo(afterReverseResize.matrixHeight, 1);
  });
});
