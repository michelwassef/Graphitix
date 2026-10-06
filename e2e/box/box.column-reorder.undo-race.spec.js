const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

test('box immediate undo after column drag restores the original header row', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.locator('#boxLoadExample').click();
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 20_000
  });

  const headerA = page.locator('#hot .ag-header-cell[col-id="c0"]').first();
  const headerB = page.locator('#hot .ag-header-cell[col-id="c1"]').first();
  await expect(headerA).toBeVisible();
  await expect(headerB).toBeVisible();

  const originalHeaderRow = await page.evaluate(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    const data = hot?.getData?.() || [];
    return Array.isArray(data[0]) ? data[0].slice(0, 3) : [];
  });
  expect(originalHeaderRow.length).toBe(3);

  const styleColors = ['#123456', '#2468ac', '#369cde'];
  await page.evaluate(async colors => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const activeTab = window.Main?.session?.getActiveTab?.();
    const owner = activeTab?.id ? box?.__testHooks?.getSession?.(activeTab.id) : null;
    if (!box || !state || !owner) {
      throw new Error('Box owner session is unavailable for indexed style setup');
    }
    const traceShapeStyles = Object.fromEntries(colors.map((color, index) => [index, { fill: color }]));
    const pointStyles = Object.fromEntries(colors.map((color, index) => [index, { fill: color, stroke: color }]));
    const summaryStyles = Object.fromEntries(colors.map((color, index) => [index, { color }]));
    owner.state.visual.fillColors = colors.slice();
    owner.state.visual.borderColors = colors.slice();
    owner.state.styles.traceShapeStyles = traceShapeStyles;
    owner.state.styles.pointStyles = pointStyles;
    owner.state.styles.summaryStyles = summaryStyles;
    state.fillColors = colors.slice();
    state.borderColors = colors.slice();
    state.traceShapeStyles = JSON.parse(JSON.stringify(traceShapeStyles));
    state.pointStyles = JSON.parse(JSON.stringify(pointStyles));
    state.summaryStyles = JSON.parse(JSON.stringify(summaryStyles));
    await box.draw({ force: true, reason: 'e2e-box-column-reorder-style-setup' });
  }, styleColors);
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true, timeout: 20_000 });

  const readIndexedStylesByHeader = () => page.evaluate(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const activeTab = window.Main?.session?.getActiveTab?.();
    const owner = activeTab?.id ? box?.__testHooks?.getSession?.(activeTab.id) : null;
    const headers = state?.hot?.getDataAtRow?.(0)?.slice(0, 3) || [];
    const visual = owner?.state?.visual || {};
    const styles = owner?.state?.styles || {};
    return {
      headers,
      fill: headers.map((header, index) => [header, visual.fillColors?.[index] || null]),
      border: headers.map((header, index) => [header, visual.borderColors?.[index] || null]),
      shape: headers.map((header, index) => [header, styles.traceShapeStyles?.[index]?.fill || null]),
      point: headers.map((header, index) => [header, styles.pointStyles?.[index]?.fill || null]),
      summary: headers.map((header, index) => [header, styles.summaryStyles?.[index]?.color || null])
    };
  });
  const originalStylesByHeader = await readIndexedStylesByHeader();
  expect(originalStylesByHeader.fill.map(([, value]) => value)).toEqual(styleColors);

  const dragHandle = headerA.locator('.hot-col-drag-handle').first();
  await expect(dragHandle).toBeVisible();
  const dragDispatched = await page.evaluate(async () => {
    const handle = document.querySelector('#hot .ag-header-cell[col-id="c0"] .hot-col-drag-handle');
    const target = document.querySelector('#hot .ag-header-cell[col-id="c1"]');
    if (!handle || !target) {
      return false;
    }
    const rect = target.getBoundingClientRect();
    handle.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: rect.left,
      clientY: rect.top + Math.max(8, rect.height / 2)
    }));
    target.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: rect.left + Math.max(8, rect.width * 0.75),
      clientY: rect.top + Math.max(8, rect.height / 2)
    }));
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    return true;
  });
  expect(dragDispatched).toBe(true);
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const data = hot?.getData?.() || [];
      return Array.isArray(data[0]) ? data[0].slice(0, 3) : [];
    });
  }, {
    timeout: 8_000,
    intervals: [100, 200, 400]
  }).not.toEqual(originalHeaderRow);
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true, timeout: 20_000 });
  const movedStylesByHeader = await readIndexedStylesByHeader();
  const expectedStyleOrder = values => {
    const byHeader = new Map(values);
    return movedStylesByHeader.headers.map(header => [header, byHeader.get(header) || null]);
  };
  for (const key of ['fill', 'border', 'shape', 'point', 'summary']) {
    expect(movedStylesByHeader[key]).toEqual(expectedStyleOrder(originalStylesByHeader[key]));
  }

  await page.keyboard.press('Control+z');

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const data = hot?.getData?.() || [];
      return Array.isArray(data[0]) ? data[0].slice(0, 3) : [];
    });
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toEqual(originalHeaderRow);
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true, timeout: 20_000 });

  await expect.poll(readIndexedStylesByHeader, { timeout: 15_000, intervals: [200, 400, 800] })
    .toEqual(originalStylesByHeader);

  expect(issues.critical).toEqual([]);
});
