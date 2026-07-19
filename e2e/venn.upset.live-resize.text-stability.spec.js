const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

test('UpSet resize has one painted viewport fit and live text scaling', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'sample');
  await page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const plotType = root?.querySelector('#vennPlotType');
    if(!plotType){ throw new Error('Missing UpSet plot selector'); }
    plotType.value = 'upset';
    plotType.dispatchEvent(new Event('change', { bubbles: true }));
    const ratioLock = root.querySelector('#vennGraphPanel .resizer-aspect-checkbox');
    if(ratioLock && !ratioLock.checked){
      ratioLock.checked = true;
      ratioLock.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const checkbox = root.querySelector('#vennGraphPanel .resizer-fontresize-checkbox');
    if(checkbox && !checkbox.checked){
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.Components?.venn?.draw?.({ reason: 'e2e-upset-resize-setup', force: true, userInitiated: true });
  });
  await page.waitForFunction(() => (
    document.querySelectorAll('#vennPage:not([hidden]) #stage [data-upset-trace-kind]').length > 0
    && document.querySelectorAll('#vennPage:not([hidden]) #stage text[data-font-role="graphTitle"]').length === 1
  ));
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    window.__upsetResizeProbe = {
      renderBatches: 0,
      viewBoxOnlyBatches: 0,
      invalidPaintedFrames: 0
    };
    window.__upsetResizeObserver = new MutationObserver(records => {
      const hasRenderMutation = records.some(record => record.type === 'childList');
      const hasViewBoxMutation = records.some(record => (
        record.type === 'attributes' && record.attributeName === 'viewBox'
      ));
      if(hasRenderMutation){
        window.__upsetResizeProbe.renderBatches += 1;
        const titleCount = stage.querySelectorAll('text[data-font-role="graphTitle"]').length;
        if(titleCount !== 1 || stage.querySelector('[data-upset-staged-frame]')){
          window.__upsetResizeProbe.invalidPaintedFrames += 1;
        }
      }
      if(hasViewBoxMutation && !hasRenderMutation){
        window.__upsetResizeProbe.viewBoxOnlyBatches += 1;
      }
    });
    window.__upsetResizeObserver.observe(stage, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['viewBox']
    });
  });

  const title = page.locator('#vennPage:not([hidden]) #stage text[data-font-role="graphTitle"]');
  const heightBefore = await title.evaluate(node => node.getBoundingClientRect().height);
  const handle = page.locator('#vennPage:not([hidden]) #vennGraphPanel .resizer-vertical').first();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 10 });
  await page.waitForTimeout(50);

  const heightDuring = await title.evaluate(node => node.getBoundingClientRect().height);
  expect(Math.abs(heightDuring - heightBefore)).toBeGreaterThan(1);

  await page.mouse.up();
  await page.waitForTimeout(75);
  await page.evaluate(() => {
    window.__upsetResizeProbe.viewBoxOnlyBatches = 0;
  });
  await page.waitForTimeout(100);
  const result = await page.evaluate(() => {
    window.__upsetResizeObserver?.disconnect();
    const titleNode = document.querySelector('#vennPage:not([hidden]) #stage text[data-font-role="graphTitle"]');
    return {
      ...window.__upsetResizeProbe,
      titleCount: document.querySelectorAll('#vennPage:not([hidden]) #stage text[data-font-role="graphTitle"]').length,
      titleHeight: titleNode?.getBoundingClientRect?.().height || 0
    };
  });
  expect(result.renderBatches).toBeGreaterThan(0);
  expect(result.viewBoxOnlyBatches).toBe(0);
  expect(result.invalidPaintedFrames).toBe(0);
  expect(result.titleCount).toBe(1);
  expect(Math.abs(result.titleHeight - heightDuring)).toBeLessThanOrEqual(1.5);
});

test('UpSet defaults to unlocked ratio and redraws live during fixed-font axis drag', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'sample');
  await page.locator('#vennPage:not([hidden]) #vennPlotType').selectOption('upset');
  const ratioLock = page.locator('#vennPage:not([hidden]) #vennGraphPanel .resizer-aspect-checkbox');
  await expect(ratioLock).not.toBeChecked();
  await expect(ratioLock).toBeEnabled();
  await page.waitForFunction(() => (
    document.querySelectorAll('#vennPage:not([hidden]) #stage [data-upset-trace-kind]').length > 0
  ));

  const initial = await page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const stage = root?.querySelector('#stage');
    const title = stage?.querySelector('text[data-font-role="graphTitle"]');
    const svgBox = root?.querySelector('#vennGraphPanel .svgbox');
    const matrixRows = Array.from(stage.querySelectorAll('[data-upset-matrix-cell]'))
      .map(node => Number(node.getAttribute('cy')))
      .filter(Number.isFinite);
    const intersectionAxis = stage.querySelector('[data-upset-axis="intersection-y"]');
    const setBar = stage.querySelector('rect[data-upset-trace-kind="setBars"]');
    window.__upsetUnlockedResizeProbe = {
      renderBatches: 0,
      fontRegistrations: 0,
      invalidFrames: 0,
      invalidPaintedFrames: 0,
      rafDeltas: [],
      rafRunning: true,
      lastRafTime: null
    };
    const sampleRaf = time => {
      const probe = window.__upsetUnlockedResizeProbe;
      if(!probe?.rafRunning) return;
      if(Number.isFinite(probe.lastRafTime)){
        probe.rafDeltas.push(time - probe.lastRafTime);
      }
      probe.lastRafTime = time;
      requestAnimationFrame(sampleRaf);
    };
    requestAnimationFrame(sampleRaf);
    window.__upsetOriginalMarkText = window.Shared?.fontControls?.markText || null;
    if(window.__upsetOriginalMarkText){
      window.Shared.fontControls.markText = function(...args){
        window.__upsetUnlockedResizeProbe.fontRegistrations += 1;
        return window.__upsetOriginalMarkText.apply(this, args);
      };
    }
    window.__upsetUnlockedResizeObserver = new MutationObserver(records => {
      if(records.some(record => record.type === 'childList')){
        window.__upsetUnlockedResizeProbe.renderBatches += 1;
        if(stage.innerHTML.includes('NaN')){
          window.__upsetUnlockedResizeProbe.invalidFrames += 1;
        }
        const titleCount = stage.querySelectorAll('text[data-font-role="graphTitle"]').length;
        if(titleCount !== 1 || stage.querySelector('[data-upset-staged-frame]')){
          window.__upsetUnlockedResizeProbe.invalidPaintedFrames += 1;
        }
      }
    });
    window.__upsetUnlockedResizeObserver.observe(stage, { childList: true, subtree: true });
    return {
      panelHeight: svgBox.getBoundingClientRect().height,
      titleHeight: title.getBoundingClientRect().height,
      matrixSpan: Math.max(...matrixRows) - Math.min(...matrixRows),
      intersectionAxisHeight: Math.abs(
        Number(intersectionAxis.getAttribute('y2')) - Number(intersectionAxis.getAttribute('y1'))
      ),
      setBarHeight: setBar.getBBox().height
    };
  });

  const handle = page.locator('#vennPage:not([hidden]) #vennGraphPanel .resizer-horizontal').first();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for(let step = 1; step <= 24; step += 1){
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (80 * step / 24));
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(50);

  const during = await page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const stage = root.querySelector('#stage');
    const barBox = stage.querySelector('rect[data-upset-trace-kind="intersectionBars"]').getBBox();
    const matrixRows = Array.from(stage.querySelectorAll('[data-upset-matrix-cell]'))
      .map(node => Number(node.getAttribute('cy')))
      .filter(Number.isFinite);
    const intersectionAxis = stage.querySelector('[data-upset-axis="intersection-y"]');
    const setBar = stage.querySelector('rect[data-upset-trace-kind="setBars"]');
    return {
      renderBatches: window.__upsetUnlockedResizeProbe.renderBatches,
      fontRegistrations: window.__upsetUnlockedResizeProbe.fontRegistrations,
      invalidFrames: window.__upsetUnlockedResizeProbe.invalidFrames,
      invalidPaintedFrames: window.__upsetUnlockedResizeProbe.invalidPaintedFrames,
      panelHeight: root.querySelector('#vennGraphPanel .svgbox').getBoundingClientRect().height,
      titleHeight: stage.querySelector('text[data-font-role="graphTitle"]').getBoundingClientRect().height,
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      viewBox: stage.getAttribute('viewBox').trim().split(/\s+/).map(Number),
      barBox: { y: barBox.y, height: barBox.height },
      matrixSpan: Math.max(...matrixRows) - Math.min(...matrixRows),
      intersectionAxisHeight: Math.abs(
        Number(intersectionAxis.getAttribute('y2')) - Number(intersectionAxis.getAttribute('y1'))
      ),
      setBarHeight: setBar.getBBox().height
    };
  });
  expect(during.panelHeight - initial.panelHeight).toBeGreaterThan(50);
  expect(during.renderBatches).toBeGreaterThan(0);
  expect(during.fontRegistrations).toBe(0);
  expect(during.invalidFrames).toBe(0);
  expect(during.invalidPaintedFrames).toBe(0);
  expect(Math.abs(during.titleHeight - initial.titleHeight)).toBeLessThanOrEqual(1.5);
  expect(during.viewBox).toEqual([0, 0, during.stageWidth, during.stageHeight]);
  expect(during.matrixSpan - initial.matrixSpan).toBeGreaterThan(8);
  expect(during.intersectionAxisHeight - initial.intersectionAxisHeight).toBeGreaterThan(30);
  expect(during.setBarHeight - initial.setBarHeight).toBeGreaterThan(2);

  await page.mouse.up();
  await page.waitForTimeout(150);
  const completed = await page.evaluate(() => {
    window.__upsetUnlockedResizeObserver?.disconnect();
    window.__upsetUnlockedResizeProbe.rafRunning = false;
    if(window.__upsetOriginalMarkText){
      window.Shared.fontControls.markText = window.__upsetOriginalMarkText;
    }
    const barBox = document.querySelector('#vennPage:not([hidden]) #stage rect[data-upset-trace-kind="intersectionBars"]').getBBox();
    return {
      ...window.__upsetUnlockedResizeProbe,
      barBox: { y: barBox.y, height: barBox.height }
    };
  });
  if(process.env.GRAPHITIX_DEBUG_RESIZE_TEST === '1'){
    const sortedRaf = completed.rafDeltas.slice().sort((a, b) => a - b);
    console.log(JSON.stringify({
      raf: {
        count: sortedRaf.length,
        p95: sortedRaf[Math.floor(sortedRaf.length * 0.95)] || 0,
        max: sortedRaf[sortedRaf.length - 1] || 0
      }
    }));
  }
  expect(completed.renderBatches).toBeGreaterThan(0);
  expect(completed.invalidFrames).toBe(0);
  expect(completed.invalidPaintedFrames).toBe(0);
  const sortedRaf = completed.rafDeltas.slice().sort((a, b) => a - b);
  const rafP95 = sortedRaf[Math.floor(sortedRaf.length * 0.95)] || 0;
  expect(rafP95).toBeLessThanOrEqual(25);
  expect(Math.abs(completed.barBox.y - during.barBox.y)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(completed.barBox.height - during.barBox.height)).toBeLessThanOrEqual(1.5);
});

test('UpSet narrow live resize keeps set labels outside the matrix and columns aligned', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'sample');
  await page.locator('#vennPage:not([hidden]) #vennPlotType').selectOption('upset');
  await page.waitForFunction(() => (
    document.querySelectorAll('#vennPage:not([hidden]) #stage [data-upset-matrix-cell]').length > 0
  ));

  const handle = page.locator('#vennPage:not([hidden]) #vennGraphPanel .resizer-vertical').first();
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();
  const stageWidth = await page.locator('#vennPage:not([hidden]) #stage').evaluate(node => node.clientWidth);
  const shrinkBy = Math.max(60, Math.min(180, stageWidth - 300));

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  for(let step = 1; step <= 20; step += 1){
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 - (shrinkBy * step / 20),
      handleBox.y + handleBox.height / 2
    );
    await page.waitForTimeout(16);
  }

  const during = await page.evaluate(() => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    const stageRect = stage.getBoundingClientRect();
    const cells = Array.from(stage.querySelectorAll('[data-upset-matrix-cell]'));
    const labels = Array.from(stage.querySelectorAll('[data-upset-set-label]'));
    const matrixLeft = Math.min(...cells.map(node => node.getBoundingClientRect().left));
    const labelRight = Math.max(...labels.map(node => node.getBoundingClientRect().right));
    const visibleLabels = labels.filter(node => (
      Array.from(node.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.nodeValue)
    ));
    const columnErrors = Array.from(stage.querySelectorAll('rect[data-upset-trace-kind="intersectionBars"]'))
      .map(bar => {
        const code = bar.getAttribute('data-upset-trace-id');
        const cell = stage.querySelector(`[data-upset-matrix-cell="${CSS.escape(code)}"]`);
        const barRect = bar.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        return Math.abs(
          (barRect.left + barRect.width / 2) - (cellRect.left + cellRect.width / 2)
        );
      });
    const cellsInsideStage = cells.every(node => {
      const rect = node.getBoundingClientRect();
      return rect.left >= stageRect.left - 1 && rect.right <= stageRect.right + 1;
    });
    return {
      stageWidth: stage.clientWidth,
      labelGap: matrixLeft - labelRight,
      visibleLabelCount: visibleLabels.length,
      maxColumnError: Math.max(...columnErrors),
      cellsInsideStage
    };
  });
  expect(during.stageWidth).toBeLessThan(stageWidth - 40);
  expect(during.labelGap).toBeGreaterThanOrEqual(1);
  expect(during.visibleLabelCount).toBeGreaterThan(0);
  expect(during.maxColumnError).toBeLessThanOrEqual(1);
  expect(during.cellsInsideStage).toBe(true);

  await page.mouse.up();
  await page.waitForTimeout(100);
  const settledGap = await page.evaluate(() => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    const cells = Array.from(stage.querySelectorAll('[data-upset-matrix-cell]'));
    const labels = Array.from(stage.querySelectorAll('[data-upset-set-label]'));
    return Math.min(...cells.map(node => node.getBoundingClientRect().left))
      - Math.max(...labels.map(node => node.getBoundingClientRect().right));
  });
  expect(settledGap).toBeGreaterThanOrEqual(1);
});
