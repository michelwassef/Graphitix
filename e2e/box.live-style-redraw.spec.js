const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function waitForBoxIdle(page) {
  await page.waitForFunction(() => {
    const box = window.Components?.box;
    return !!document.querySelector('#boxPlot #boxSvg')
      && (!box?.isIdleForSnapshot || box.isIdleForSnapshot());
  }, null, { timeout: 20_000 });
}

test('Box live styles avoid exposed full-frame redraws', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.locator('#boxLoadExample').click();
  await page.locator('#boxGraphType').selectOption('box');
  await waitForBoxIdle(page);

  await page.evaluate(() => {
    window.__boxTokenBeforeLiveStyle = Number(window.Components?.box?.__getState?.()?.drawToken) || 0;
  });
  await page.locator('#boxColorSchemeSelect').selectOption('grayscale');
  await page.waitForTimeout(250);

  const drawTokenDelta = await page.evaluate(() =>
    (Number(window.Components?.box?.__getState?.()?.drawToken) || 0) - window.__boxTokenBeforeLiveStyle
  );
  expect(drawTokenDelta).toBe(1);

  await page.evaluate(() => {
    const plot = document.getElementById('boxPlot');
    window.__boxSvgMissingDuringViewRefresh = false;
    window.__boxViewRefreshObserver = new MutationObserver(() => {
      if(!plot.querySelector('#boxSvg')){
        window.__boxSvgMissingDuringViewRefresh = true;
      }
    });
    window.__boxViewRefreshObserver.observe(plot, { childList: true, subtree: true });
  });
  await page.locator('#boxPointMode').selectOption('overlay');
  await waitForBoxIdle(page);

  const exposedGap = await page.evaluate(() => {
    window.__boxViewRefreshObserver?.disconnect();
    return window.__boxSvgMissingDuringViewRefresh === true;
  });
  expect(exposedGap).toBe(false);
});

test('Box Density samples updates only the violin layer', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.locator('#boxLoadExample').click();
  await page.locator('#boxGraphType').selectOption('violin');
  await page.locator('#boxPointMode').selectOption('none');
  await waitForBoxIdle(page);

  await page.evaluate(() => {
    const svg = document.querySelector('#boxPlot #boxSvg');
    window.__boxViolinSvg = svg;
    window.__boxViolinPathBefore = svg?.querySelector('path[data-box-violin-density="1"]')?.getAttribute('d') || '';
    window.__boxViolinTokenBefore = Number(window.Components?.box?.__getState?.()?.drawToken) || 0;
  });
  await page.locator('#boxViolinSamples').evaluate(input => {
    input.value = '160';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(250);

  const result = await page.evaluate(() => {
    const svg = document.querySelector('#boxPlot #boxSvg');
    const path = svg?.querySelector('path[data-box-violin-density="1"]');
    return {
      sameSvg: svg === window.__boxViolinSvg,
      pathChanged: !!path && path.getAttribute('d') !== window.__boxViolinPathBefore,
      drawTokenDelta: (Number(window.Components?.box?.__getState?.()?.drawToken) || 0) - window.__boxViolinTokenBefore
    };
  });
  expect(result).toEqual({ sameSvg: true, pathChanged: true, drawTokenDelta: 0 });
});

test('Box worker statistics publishes default pairwise annotations immediately', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.locator('#boxGraphType').selectOption('box');
  await page.locator('#boxPointMode').selectOption('none');
  await page.evaluate(async () => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    if (!box || !hot || typeof hot.loadData !== 'function') {
      throw new Error('Box table is unavailable');
    }
    const rows = [['Control', 'Treatment']];
    for (let index = 0; index < 4_000; index += 1) {
      rows.push([index % 19, 50 + (index % 23)]);
    }
    hot.loadData(rows, { source: 'e2e-box-worker-significance', recordUndo: false });
    const workers = window.Shared?.Workers;
    if (workers && typeof workers.runTask === 'function' && !workers.__boxSignificanceRunTask) {
      workers.__boxSignificanceRunTask = workers.runTask;
      workers.runTask = function workerSignificanceProbe(task) {
        if (task?.action === 'box-stats') {
          window.__boxSignificanceWorkerUsed = true;
        }
        return workers.__boxSignificanceRunTask.apply(this, arguments);
      };
    }
  });
  await page.waitForFunction(() => {
    const traces = window.Components?.box?.__getState?.()?.cachedDrawInput?.traces || [];
    return traces.reduce((count, trace) => count + (trace?.rawY?.length || 0), 0) >= 8_000;
  }, null, { timeout: 30_000 });
  await waitForBoxIdle(page);

  const conditionInputs = page.locator('.stats-conditions-checkboxes input[type="checkbox"]');
  const conditionCount = await conditionInputs.count();
  for (let index = 0; index < conditionCount; index += 1) {
    if (index < 2) {
      await conditionInputs.nth(index).check();
    } else {
      await conditionInputs.nth(index).uncheck();
    }
  }
  await waitForBoxIdle(page);

  const significanceToggle = page.locator('#boxShowSignificance');
  await expect(significanceToggle).not.toBeChecked();
  await page.locator('#boxComputeStats').click();
  await expect(significanceToggle).toBeChecked({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    return state?.statsComputationPending !== true
      && Number(state?.statsLastRunVersion) > 0
      && Number(state?.statsLastRunVersion) === Number(state?.statsContextVersion);
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(2_000);

  const result = await page.evaluate(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.() || null;
    const svg = document.querySelector('#boxPlot #boxSvg');
    const annotationLayer = svg?.querySelector('[data-box-significance-layer="1"]');
    const annotationBounds = annotationLayer?.getBBox?.() || null;
    const viewBox = svg?.viewBox?.baseVal || null;
    return {
      idle: !box?.isIdleForSnapshot || box.isIdleForSnapshot(),
      annotationCount: svg?.querySelectorAll('.box-significance-annotation').length || 0,
      annotationsInsideViewport: !!annotationBounds && !!viewBox
        && annotationBounds.x >= viewBox.x - 1
        && annotationBounds.y >= viewBox.y - 1
        && annotationBounds.x + annotationBounds.width <= viewBox.x + viewBox.width + 1
        && annotationBounds.y + annotationBounds.height <= viewBox.y + viewBox.height + 1,
      statsCurrent: Number(state?.statsLastRunVersion) > 0
        && Number(state?.statsLastRunVersion) === Number(state?.statsContextVersion),
      workerUsed: window.__boxSignificanceWorkerUsed === true,
      showSignificanceBars: state?.showSignificanceBars === true,
      modelMode: state?.statsLastAnnotationModel?.mode || null,
      modelPairCount: state?.statsLastAnnotationModel?.pairs?.length || 0,
      contextGeometryReady: state?.statsContext?.svg === svg
        && typeof state?.statsContext?.helpers?.categoryCenter === 'function'
        && typeof state?.statsContext?.helpers?.valueToCoord === 'function'
    };
  });
  expect(result.idle).toBe(true);
  expect(result.annotationCount, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.annotationsInsideViewport).toBe(true);
  expect(result.statsCurrent).toBe(true);
  expect(result.workerUsed).toBe(true);
  expect(result.showSignificanceBars).toBe(true);
  expect(result.modelMode).toBe('single');
  expect(result.modelPairCount).toBeGreaterThan(0);
  expect(result.contextGeometryReady).toBe(true);
});
