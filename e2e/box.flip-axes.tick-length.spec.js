const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function waitForBoxRender(page, flipAxes, expectedLengths = null) {
  await page.waitForFunction(({ flipAxes: expectedFlip, expectedLengths: expected }) => {
    const root = document.querySelector('#boxPage:not([hidden])');
    const svg = root?.querySelector?.('#boxPlot svg:not([data-box-pending-render="1"]):not([aria-hidden="true"])')
      || root?.querySelector?.('#boxPlot svg');
    const state = window.Components?.box?.__getState?.();
    const readLength = axis => {
      const tick = svg?.querySelector?.(`line[data-box-major-tick-axis="${axis}"]`);
      if(!tick){ return null; }
      const x1 = Number(tick.getAttribute('x1'));
      const x2 = Number(tick.getAttribute('x2'));
      const y1 = Number(tick.getAttribute('y1'));
      const y2 = Number(tick.getAttribute('y2'));
      return axis === 'x' ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
    };
    return !!svg
      && state?.flipAxes === expectedFlip
      && svg.querySelectorAll('line[data-box-major-tick-axis]').length > 0
      && (!expected
        || (readLength('x') === expected.x
          && readLength('y') === expected.y));
  }, { flipAxes, expectedLengths }, { timeout: 45_000 });
}

async function readTickGeometry(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#boxPage:not([hidden])');
    const svg = root?.querySelector?.('#boxPlot svg:not([data-box-pending-render="1"]):not([aria-hidden="true"])')
      || root?.querySelector?.('#boxPlot svg');
    const state = window.Components?.box?.__getState?.() || {};
    const readLength = axis => {
      const tick = svg?.querySelector?.(`line[data-box-major-tick-axis="${axis}"]`);
      if(!tick){ return null; }
      const x1 = Number(tick.getAttribute('x1'));
      const x2 = Number(tick.getAttribute('x2'));
      const y1 = Number(tick.getAttribute('y1'));
      const y2 = Number(tick.getAttribute('y2'));
      return axis === 'x' ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
    };
    const categoryAxis = state.flipAxes === true ? 'y' : 'x';
    const categoryLabels = new Set((state.lastAxisLabels || []).map(value => String(value || '').trim()).filter(Boolean));
    const categoryLabel = Array.from(svg?.querySelectorAll?.(`text[data-box-axis-tick="${categoryAxis}"]`) || [])
      .find(node => categoryLabels.has(String(node.textContent || '').trim()));
    const yAxis = svg?.querySelector?.('line[data-axis-control="1"][data-axis-key="y"]');
    const payloadAxis = window.Components?.box?.getPayload?.()?.config?.axis || {};
    return {
      flipAxes: state.flipAxes === true,
      axisSettings: {
        x: state.axisSettings?.x?.majorTickLength ?? null,
        y: state.axisSettings?.y?.majorTickLength ?? null
      },
      payload: {
        x: payloadAxis.majorTickLength?.x ?? payloadAxis.majorTickLengthX ?? null,
        y: payloadAxis.majorTickLength?.y ?? payloadAxis.majorTickLengthY ?? null
      },
      rendered: { x: readLength('x'), y: readLength('y') },
      categoryAxis,
      categoryLabelX: categoryLabel ? Number(categoryLabel.getAttribute('x')) : null,
      yAxisX: yAxis ? Number(yAxis.getAttribute('x1')) : null
    };
  });
}

async function loadBoxExample(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await waitForBoxRender(page, false);
}

async function setInitialTickLengths(page) {
  await page.evaluate(async () => {
    const box = window.Components.box;
    const tabId = window.Main.session.getActiveTab().id;
    const payload = box.getPayload();
    payload.config.axis = {
      ...(payload.config.axis || {}),
      majorTickLengthX: 11,
      majorTickLengthY: 29
    };
    const result = box.loadFromPayload(payload, {
      tabId,
      source: 'e2e-box-flip-tick-length',
      reason: 'e2e-box-flip-tick-length-initial'
    });
    if(result && typeof result.then === 'function'){
      await result;
    }
  });
  await waitForBoxRender(page, false, { x: 11, y: 29 });
}

test('Box flip swaps tick lengths with their plotted axis roles', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await loadBoxExample(page);
  await setInitialTickLengths(page);

  const unflipped = await readTickGeometry(page);
  expect(unflipped.axisSettings).toEqual({ x: 11, y: 29 });
  expect(unflipped.payload).toEqual({ x: 11, y: 29 });
  expect(unflipped.rendered).toEqual({ x: 11, y: 29 });

  await page.locator('#boxPage:not([hidden]) #boxFlipAxes').check();
  await waitForBoxRender(page, true, { x: 29, y: 11 });
  const flipped = await readTickGeometry(page);
  expect(flipped.axisSettings).toEqual({ x: 29, y: 11 });
  expect(flipped.payload).toEqual({ x: 29, y: 11 });
  expect(flipped.rendered).toEqual({ x: 29, y: 11 });

  await page.locator('#boxPage:not([hidden]) #boxFlipAxes').uncheck();
  await waitForBoxRender(page, false, { x: 11, y: 29 });
  const restored = await readTickGeometry(page);
  expect(restored.axisSettings).toEqual({ x: 11, y: 29 });
  expect(restored.payload).toEqual({ x: 11, y: 29 });
  expect(restored.rendered).toEqual({ x: 11, y: 29 });
});

test('Box flipped Y tick length moves the Y category labels', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await loadBoxExample(page);
  await setInitialTickLengths(page);

  await page.locator('#boxPage:not([hidden]) #boxFlipAxes').check();
  await waitForBoxRender(page, true, { x: 29, y: 11 });
  const before = await readTickGeometry(page);

  await page.locator('#boxPage:not([hidden]) svg line[data-axis-control="1"][data-axis-key="y"]')
    .first()
    .click({ force: true });
  const panel = page.locator('.axis-controls-panel[data-open="1"]');
  await expect(panel).toBeVisible();
  const tickLengthInput = panel.locator('.axis-controls-panel__field--major-tick-length input').first();
  await tickLengthInput.fill('41');
  await tickLengthInput.dispatchEvent('change');
  await waitForBoxRender(page, true, { x: 29, y: 41 });

  const after = await readTickGeometry(page);
  expect(after.rendered.y).toBe(41);
  expect(after.axisSettings.y).toBe(41);
  expect(after.yAxisX - after.categoryLabelX).toBeGreaterThan(before.yAxisX - before.categoryLabelX + 20);
});
