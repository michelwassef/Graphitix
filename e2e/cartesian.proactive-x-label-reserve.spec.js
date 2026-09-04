const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, openComponentFromWelcome } = require('./helpers/workspaceHarness');

async function readLineReserve(page) {
  return page.evaluate(() => {
    const box = document.querySelector('#linePage:not([hidden]) .svgbox');
    const svg = box?.querySelector('svg:not(.resizer-options-icon)');
    const xTicks = Array.from(svg?.querySelectorAll('text[data-font-role="xTick"]') || []);
    const title = svg?.querySelector('text[data-font-role="xTitle"]');
    const boxRect = box?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    return {
      width: boxRect?.width || 0,
      height: boxRect?.height || 0,
      rotated: xTicks.some(node => /rotate\(/.test(node.getAttribute('transform') || '')),
      planBottom: Number(box?.__cartesianLayoutPlan?.contentEnvelope?.extensionBottom) || 0,
      reserveBottom: Number(svg?.dataset?.graphContentReserveBottom) || 0,
      titleBottom: titleRect?.bottom || 0,
      frameBottom: boxRect?.bottom || 0,
      titleText: title?.textContent || ''
    };
  });
}

test('Line reserves rotated x-label space before rotation and keeps its x title visible', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true, loadExample: true });
  await page.locator('#lineLoadExample').click();
  await page.waitForFunction(() => !!document.querySelector('#linePage:not([hidden]) .svgbox')?.__cartesianLayoutPlan);
  await page.evaluate(() => {
    window.Components.line.__getState().hot.setDataAtCell(9, 0, 911, 'e2e-proactive-axis-reserve');
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#linePage:not([hidden]) text[data-font-role="xTick"]'))
    .some(node => String(node.textContent || '').includes('1000')));
  await page.waitForTimeout(500);
  const wide = await readLineReserve(page);

  await page.evaluate(() => {
    const box = document.querySelector('#linePage:not([hidden]) .svgbox');
    box.__sharedResizableBoxApi.applySize({
      width: 220,
      height: 427,
      axis: 'x',
      forceExact: true,
      updateAspectRatio: false,
      reason: 'e2e-proactive-axis-reserve'
    });
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#linePage:not([hidden]) text[data-font-role="xTick"]'))
    .some(node => /rotate\(/.test(node.getAttribute('transform') || '')));
  await page.waitForTimeout(500);
  const narrow = await readLineReserve(page);

  expect(wide.rotated).toBe(false);
  expect(wide.planBottom).toBeGreaterThan(0);
  expect(wide.reserveBottom).toBeCloseTo(wide.planBottom, 0);
  expect(narrow.rotated).toBe(true);
  expect(narrow.planBottom).toBeCloseTo(wide.planBottom, 0);
  expect(narrow.reserveBottom).toBeCloseTo(wide.reserveBottom, 0);
  expect(narrow.height).toBeCloseTo(wide.height, 0);
  expect(narrow.titleText).toBe('Study day');
  expect(narrow.titleBottom).toBeLessThanOrEqual(narrow.frameBottom + 1);
});
