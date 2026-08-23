const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

const HISTOGRAM = COMPONENT_MATRIX.find(entry => entry.type === 'hist');
if(!HISTOGRAM){
  throw new Error('Missing Histogram workspace harness entry');
}

async function openHistogramAxisToolbar(page, axisKey = 'y') {
  await openComponentFromWelcome(page, HISTOGRAM, { first: true, loadExample: true });
  await clickExampleButtonIfPresent(page, HISTOGRAM.exampleButtonId);
  const axis = page.locator(`#${HISTOGRAM.pageId}:not([hidden]) #histSvg [data-axis-control="1"][data-axis-key="${axisKey}"]`).first();
  await expect(axis).toHaveCount(1, { timeout: 30_000 });
  await axis.dispatchEvent('click');
  const panel = page.locator('.axis-controls-panel[data-open="1"]');
  await expect(panel).toHaveCount(1);
  return { axis, panel };
}

async function clearActiveUndoHistory(page) {
  await page.evaluate(() => {
    window.Shared?.undoManager?.clear?.({ all: false, reason: 'numeric-wheel-e2e-reset' });
  });
}

function expectMonotonic(values, direction, tolerance = 0.01) {
  for(let index = 1; index < values.length; index += 1){
    const previous = Number(values[index - 1]);
    const current = Number(values[index]);
    if(direction === 'increase'){
      expect(current + tolerance, `expected ${current} not to move backwards from ${previous}`).toBeGreaterThanOrEqual(previous);
    }else{
      expect(current - tolerance, `expected ${current} not to move forwards from ${previous}`).toBeLessThanOrEqual(previous);
    }
  }
}

test('axis thickness wheel burst is monotonic, uses the declared step, and records one undoable gesture', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const { axis, panel } = await openHistogramAxisToolbar(page, 'y');
  await clearActiveUndoHistory(page);

  const thicknessInput = panel.locator('.axis-controls-panel__field--style input[type="number"]');
  const thicknessChip = panel.locator('.axis-controls-panel__field--style .shared-border-style-chip');
  await expect(thicknessInput).toHaveCount(1);
  await expect(thicknessChip).toHaveCount(1);

  const initial = await thicknessInput.evaluate(input => ({
    value: Number(input.value),
    step: Number(input.step)
  }));
  expect(initial.step).toBe(0.25);

  const samples = [];
  for(let index = 0; index < 6; index += 1){
    await thicknessChip.dispatchEvent('wheel', { deltaY: -100 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
    samples.push(await page.evaluate(({ pageId }) => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const panel = document.querySelector('.axis-controls-panel[data-open="1"]');
      const input = panel?.querySelector('.axis-controls-panel__field--style input[type="number"]');
      const axis = root?.querySelector('#histSvg [data-axis-control="1"][data-axis-key="y"]');
      return {
        input: Number(input?.value),
        stroke: Number(axis?.getAttribute?.('stroke-width'))
      };
    }, { pageId: HISTOGRAM.pageId }));
  }
  await page.waitForTimeout(220);

  expectMonotonic(samples.map(sample => sample.input), 'increase');
  expect(samples.map(sample => sample.input)).toEqual([
    initial.value + 0.25,
    initial.value + 0.50,
    initial.value + 0.75,
    initial.value + 1.00,
    initial.value + 1.25,
    initial.value + 1.50
  ]);
  const finiteStrokes = samples.map(sample => sample.stroke).filter(Number.isFinite);
  expect(finiteStrokes.length).toBeGreaterThan(0);
  expectMonotonic(finiteStrokes, 'increase', 0.001);

  const undoState = await page.evaluate(() => ({
    canUndo: !!window.Shared?.undoManager?.canUndo?.()
  }));
  expect(undoState.canUndo).toBe(true);
  expect(await page.evaluate(() => window.Shared?.undoManager?.undo?.())).toBe(true);
  await page.waitForTimeout(250);
  await expect(thicknessInput).toHaveValue(String(initial.value));

  await testInfo.attach('axis-thickness-wheel-samples.json', {
    body: Buffer.from(JSON.stringify({ initial, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  expect(issues.critical).toEqual([]);
  await expect(axis).toHaveCount(1);
});

for(const axisKey of ['x', 'y']){
  test(`axis ${axisKey.toUpperCase()} manual length edit preserves the non-axis frame offset`, async ({ page }) => {
    test.setTimeout(90_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const { panel } = await openHistogramAxisToolbar(page, axisKey);

    const lengthInput = panel.locator('.axis-controls-panel__field--length input[type="number"]');
    await expect(lengthInput).toHaveCount(1);
    await expect(lengthInput).toBeEnabled();
    const dimensionKey = axisKey === 'y' ? 'height' : 'width';
    const before = await page.evaluate(({ pageId, dimensionKey }) => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const box = root?.querySelector('.svgbox');
      const input = document.querySelector('.axis-controls-panel[data-open="1"] .axis-controls-panel__field--length input[type="number"]');
      const rect = box?.getBoundingClientRect?.();
      return {
        axisLength: Number(input?.value),
        boxDimension: Number(rect?.[dimensionKey])
      };
    }, { pageId: HISTOGRAM.pageId, dimensionKey });
    expect(Number.isFinite(before.axisLength)).toBe(true);
    expect(Number.isFinite(before.boxDimension)).toBe(true);
    const beforeOffset = before.boxDimension - before.axisLength;
    expect(beforeOffset).toBeGreaterThan(0);

    const requestedLength = before.axisLength + 20;
    await lengthInput.fill(String(requestedLength));
    await lengthInput.dispatchEvent('change');
    await page.waitForTimeout(1_000);

    const after = await page.evaluate(({ pageId, dimensionKey }) => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const box = root?.querySelector('.svgbox');
      const input = document.querySelector('.axis-controls-panel[data-open="1"] .axis-controls-panel__field--length input[type="number"]');
      const rect = box?.getBoundingClientRect?.();
      return {
        axisLength: Number(input?.value),
        boxDimension: Number(rect?.[dimensionKey])
      };
    }, { pageId: HISTOGRAM.pageId, dimensionKey });
    const afterOffset = after.boxDimension - after.axisLength;
    expect(Math.abs(after.axisLength - requestedLength)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterOffset - beforeOffset)).toBeLessThanOrEqual(4);
    expect(Math.abs((after.boxDimension - before.boxDimension) - 20)).toBeLessThanOrEqual(4);
    expect(issues.critical).toEqual([]);
  });
}

for(const axisKey of ['x', 'y']){
  test(`axis ${axisKey.toUpperCase()} length wheel burst uses live-resize phase, defers refinement, and avoids reverse jumps`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const { panel } = await openHistogramAxisToolbar(page, axisKey);
    await clearActiveUndoHistory(page);

    const lengthInput = panel.locator('.axis-controls-panel__field--length input[type="number"]');
    await expect(lengthInput).toHaveCount(1);
    await expect(lengthInput).toBeEnabled();
    const dimensionKey = axisKey === 'y' ? 'height' : 'width';

    const before = await page.evaluate(({ pageId, dimensionKey }) => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const box = root?.querySelector('.svgbox');
      const input = document.querySelector('.axis-controls-panel[data-open="1"] .axis-controls-panel__field--length input[type="number"]');
      const rect = box?.getBoundingClientRect?.();
      const original = window.Shared?.applyResizableBoxSize;
      window.__numericWheelOriginalApplyResizableBoxSize = original;
      window.__numericWheelResizeRequests = [];
      if(typeof original === 'function'){
        window.Shared.applyResizableBoxSize = function wrappedApplyResizableBoxSize(target, request = {}){
          const reason = String(request.reason || '');
          if(reason.startsWith('axis-length-wheel')){
            window.__numericWheelResizeRequests.push({
              reason,
              resizePhase: request.resizePhase || null,
              width: Number(request.width),
              height: Number(request.height),
              at: performance.now()
            });
          }
          return original.call(this, target, request);
        };
      }
      return {
        input: Number(input?.value),
        step: Number(input?.step),
        boxDimension: rect?.[dimensionKey] || 0
      };
    }, { pageId: HISTOGRAM.pageId, dimensionKey });
    expect(before.step).toBeGreaterThan(0);

    // Dispatch the raw wheel events as one actual burst. Waiting for a full
    // animation frame between synthetic wheel events turns an expensive live
    // axis resize into a series of separate >120 ms idle gestures, which is not
    // the transaction this test is intended to exercise. The final rAF is
    // registered after the burst so it observes the coalesced live publication
    // before the idle commit deadline can run.
    const burst = await lengthInput.evaluate((input, { count, deltaY, pageId, dimensionKey }) => (
      new Promise(resolve => {
        const rawInputValues = [];
        for(let index = 0; index < count; index += 1){
          input.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY
          }));
          rawInputValues.push(Number(input.value));
        }
        requestAnimationFrame(() => {
          const root = document.querySelector(`#${pageId}:not([hidden])`);
          const box = root?.querySelector('.svgbox');
          const rect = box?.getBoundingClientRect?.();
          resolve({
            rawInputValues,
            input: Number(input.value),
            boxDimension: rect?.[dimensionKey] || 0,
            phase: window.Shared?.workspaceToolbar?.getNumericWheelPhase?.(input) || null,
            requests: (window.__numericWheelResizeRequests || []).slice()
          });
        });
      })
    ), {
      count: 7,
      deltaY: -100,
      pageId: HISTOGRAM.pageId,
      dimensionKey
    });

    const requestsDuringBurst = burst.requests || [];
    expect(requestsDuringBurst.length).toBeGreaterThan(0);
    expect(
      requestsDuringBurst.every(request => request.reason === 'axis-length-wheel-live'),
      `unexpected axis-length request during wheel burst: ${JSON.stringify(requestsDuringBurst)}`
    ).toBe(true);
    expect(
      requestsDuringBurst.every(request => request.resizePhase === 'move'),
      `unexpected resize phase during wheel burst: ${JSON.stringify(requestsDuringBurst)}`
    ).toBe(true);
    expect(requestsDuringBurst.some(request => request.reason.includes('refine'))).toBe(false);
    expect(burst.phase).toBe('active');
    expectMonotonic(burst.rawInputValues, 'increase');
    expect(burst.input).toBeGreaterThan(before.input);
    expect(burst.boxDimension).toBeGreaterThan(before.boxDimension);

    await page.waitForTimeout(1_000);
    const after = await page.evaluate(({ pageId, dimensionKey }) => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const box = root?.querySelector('.svgbox');
      const rect = box?.getBoundingClientRect?.();
      const requests = (window.__numericWheelResizeRequests || []).slice();
      const original = window.__numericWheelOriginalApplyResizableBoxSize;
      if(typeof original === 'function'){
        window.Shared.applyResizableBoxSize = original;
      }
      delete window.__numericWheelOriginalApplyResizableBoxSize;
      return {
        boxDimension: rect?.[dimensionKey] || 0,
        requests,
        canUndo: !!window.Shared?.undoManager?.canUndo?.()
      };
    }, { pageId: HISTOGRAM.pageId, dimensionKey });

    const commits = after.requests.filter(request => request.reason === 'axis-length-wheel-commit');
    const liveRefinements = after.requests.filter(request => request.reason.startsWith('axis-length-wheel-live-refine'));
    const finalRefinements = after.requests.filter(request => request.reason.startsWith('axis-length-wheel-commit-refine'));
    expect(commits).toHaveLength(1);
    expect(commits[0].resizePhase).not.toBe('move');
    expect(liveRefinements).toHaveLength(0);
    expect(finalRefinements.length).toBeLessThanOrEqual(6);
    expect(after.canUndo).toBe(true);

    const lastLiveDimension = burst.boxDimension;
    expect(
      Math.abs(after.boxDimension - lastLiveDimension),
      `final refinement should settle near the last live ${dimensionKey} (${lastLiveDimension} -> ${after.boxDimension})`
    ).toBeLessThanOrEqual(30);

    expect(await page.evaluate(() => window.Shared?.undoManager?.undo?.())).toBe(true);
    await page.waitForTimeout(350);
    const undoneDimension = await page.evaluate(({ pageId, dimensionKey }) => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const rect = root?.querySelector('.svgbox')?.getBoundingClientRect?.();
      return rect?.[dimensionKey] || 0;
    }, { pageId: HISTOGRAM.pageId, dimensionKey });
    expect(Math.abs(undoneDimension - before.boxDimension)).toBeLessThanOrEqual(4);

    await testInfo.attach(`axis-${axisKey}-length-wheel-samples.json`, {
      body: Buffer.from(JSON.stringify({ before, burst, after, issues: issues.all }, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    expect(issues.critical).toEqual([]);
  });
}
