const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box immediate undo after column drag restores the original header row', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.locator('#boxLoadExample').click();
  await page.waitForTimeout(1200);

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

  expect(issues.critical).toEqual([]);
});
