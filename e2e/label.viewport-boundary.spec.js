const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('./helpers/workspaceDriver');

const CASES = COMPONENT_MATRIX;

function readContainedLabel(node) {
  const labelRect = node.getBoundingClientRect();
  const svgRect = node.ownerSVGElement?.getBoundingClientRect?.();
  if (!svgRect) return null;
  return {
    left: labelRect.left - svgRect.left,
    top: labelRect.top - svgRect.top,
    right: labelRect.right - svgRect.left,
    bottom: labelRect.bottom - svgRect.top,
    width: svgRect.width,
    height: svgRect.height
  };
}

async function dragLabelToCorner(page, svg, label) {
  const svgBox = await svg.boundingBox();
  const labelBox = await label.boundingBox();
  expect(svgBox).toBeTruthy();
  expect(labelBox).toBeTruthy();
  await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(2, Math.min(1278, svgBox.x + svgBox.width + 260)),
    Math.max(2, Math.min(718, svgBox.y + svgBox.height + 260)),
    { steps: 12 }
  );
  await page.mouse.up();
  await expect.poll(() => label.evaluate(readContainedLabel).then(result => {
    if (!result) return false;
    return result.left >= -0.75
      && result.top >= -0.75
      && result.right <= result.width + 0.75
      && result.bottom <= result.height + 0.75;
  })).toBe(true);
}

for (const component of CASES) {
  test(`${component.type} keeps graph and axis titles inside the SVG after an outward drag`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });

    const svg = page.locator(`#${component.pageId}:not([hidden]) .svgbox svg`).first();
    await expect(svg).toBeVisible({ timeout: 30_000 });
    const roles = ['graphTitle', 'xTitle', 'yTitle', 'zTitle'];
    for (const role of roles) {
      const label = svg.locator(`text[data-font-role="${role}"]`).first();
      if (await label.count() === 0 || !(await label.isVisible())) continue;
      await dragLabelToCorner(page, svg, label);
    }
  });
}
