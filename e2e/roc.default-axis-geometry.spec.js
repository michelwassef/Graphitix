const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

const ROC_COMPONENT = COMPONENT_MATRIX.find(component => component.type === 'roc');

async function waitForRocAxes(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const svg = root?.querySelector?.('#rocSvg');
    const xAxis = svg?.querySelector?.('[data-axis-control="1"][data-axis-key="x"]');
    const yAxis = svg?.querySelector?.('[data-axis-control="1"][data-axis-key="y"]');
    const xLength = xAxis
      ? Math.abs(Number(xAxis.getAttribute('x2')) - Number(xAxis.getAttribute('x1')))
      : 0;
    const yLength = yAxis
      ? Math.abs(Number(yAxis.getAttribute('y2')) - Number(yAxis.getAttribute('y1')))
      : 0;
    return xLength > 20 && yLength > 20;
  }, null, { timeout: 45_000 });
}

async function readRocGeometry(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const svgBox = root?.querySelector?.('.svgbox');
    const svg = root?.querySelector?.('#rocSvg');
    const xAxis = svg?.querySelector?.('[data-axis-control="1"][data-axis-key="x"]');
    const yAxis = svg?.querySelector?.('[data-axis-control="1"][data-axis-key="y"]');
    const xLength = xAxis
      ? Math.abs(Number(xAxis.getAttribute('x2')) - Number(xAxis.getAttribute('x1')))
      : 0;
    const yLength = yAxis
      ? Math.abs(Number(yAxis.getAttribute('y2')) - Number(yAxis.getAttribute('y1')))
      : 0;
    const boxRect = svgBox?.getBoundingClientRect?.();
    return {
      xLength,
      yLength,
      boxWidth: boxRect?.width || 0,
      boxHeight: boxRect?.height || 0,
      defaultWidth: Number(svgBox?.dataset?.resizerDefaultWidth),
      defaultHeight: Number(svgBox?.dataset?.resizerDefaultHeight),
      baseWidth: Number(svgBox?.dataset?.resizerBaseWidth),
      baseHeight: Number(svgBox?.dataset?.resizerBaseHeight)
    };
  });
}

test('new ROC graph starts square and horizontal resize is continuous from that rendered geometry', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, ROC_COMPONENT, { first: true, loadExample: true });
  await clickExampleButtonIfPresent(page, ROC_COMPONENT.exampleButtonId);
  await waitForRocAxes(page);

  const before = await readRocGeometry(page);
  expect(Math.abs(before.xLength - before.yLength)).toBeLessThanOrEqual(1);

  const widthHandle = page.locator('#rocPage:not([hidden]) .svgbox .resizer-vertical').first();
  const handleBox = await widthHandle.boundingBox();
  expect(handleBox).not.toBeNull();

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 32, startY, { steps: 4 });
  await page.mouse.up();

  await page.waitForFunction(({ beforeBoxWidth, beforeXLength }) => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const svgBox = root?.querySelector?.('.svgbox');
    const xAxis = root?.querySelector?.('#rocSvg [data-axis-control="1"][data-axis-key="x"]');
    const boxWidth = svgBox?.getBoundingClientRect?.().width || 0;
    const xLength = xAxis
      ? Math.abs(Number(xAxis.getAttribute('x2')) - Number(xAxis.getAttribute('x1')))
      : 0;
    return boxWidth < beforeBoxWidth - 20 && xLength > 20 && Math.abs(xLength - beforeXLength) > 5;
  }, {
    beforeBoxWidth: before.boxWidth,
    beforeXLength: before.xLength
  }, { timeout: 15_000 });

  const after = await readRocGeometry(page);
  expect(after.boxWidth).toBeLessThan(before.boxWidth - 20);
  expect(after.xLength).toBeLessThan(before.xLength - 20);
  expect(Math.abs(after.yLength - before.yLength)).toBeLessThanOrEqual(1);

  const boxDelta = after.boxWidth - before.boxWidth;
  const xAxisDelta = after.xLength - before.xLength;
  expect(Math.abs(xAxisDelta - boxDelta)).toBeLessThanOrEqual(4);

  expect(issues.critical, `Critical browser issues found: ${JSON.stringify(issues.critical.slice(0, 5), null, 2)}`).toEqual([]);
});
