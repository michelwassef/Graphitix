const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function readSurfaceFrame(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const viewBox = svg?.viewBox?.baseVal;
    const rect = svg?.getBoundingClientRect?.();
    return {
      viewBox: viewBox ? {
        x: viewBox.x,
        y: viewBox.y,
        width: viewBox.width,
        height: viewBox.height
      } : null,
      rect: rect ? { width: rect.width, height: rect.height } : null
    };
  });
}

test('surface rotation keeps the graph viewport and rendered frame stable', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
  await page.waitForFunction(() => (
    document.querySelectorAll('#surfacePage:not([hidden]) #surfaceSvg g.surface-faces polygon').length > 0
  ));
  await page.waitForTimeout(100);

  const svg = page.locator('#surfacePage:not([hidden]) #surfaceSvg').first();
  const box = await svg.boundingBox();
  expect(box).toBeTruthy();
  const before = await readSurfaceFrame(page);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await svg.dispatchEvent('pointerdown', {
    pointerId: 17,
    clientX: startX,
    clientY: startY,
    bubbles: true
  });
  for (let step = 1; step <= 24; step += 1) {
    await svg.dispatchEvent('pointermove', {
      pointerId: 17,
      clientX: startX + step * 5,
      clientY: startY + step * 1.5,
      bubbles: true
    });
    await page.waitForTimeout(12);
    const during = await readSurfaceFrame(page);
    expect(during.viewBox).toEqual(before.viewBox);
    expect(during.rect.width).toBeCloseTo(before.rect.width, 1);
    expect(during.rect.height).toBeCloseTo(before.rect.height, 1);
  }
  await svg.dispatchEvent('pointerup', {
    pointerId: 17,
    clientX: startX + 120,
    clientY: startY + 36,
    bubbles: true
  });
  await page.waitForTimeout(100);

  const after = await readSurfaceFrame(page);
  expect(after.viewBox).toEqual(before.viewBox);
  expect(after.rect.width).toBeCloseTo(before.rect.width, 1);
  expect(after.rect.height).toBeCloseTo(before.rect.height, 1);
  expect(issues.critical).toEqual([]);
});
