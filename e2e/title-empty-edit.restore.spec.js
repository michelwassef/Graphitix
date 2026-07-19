const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('empty title edits hide without erasing text and restore from graph options', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, {
    type: 'box',
    pageId: 'boxPage'
  }, {
    first: true,
    loadExample: true
  });

  const svgBox = page.locator('#boxPage:not([hidden]) .svgbox').first();
  const title = svgBox.locator('text[data-font-role="graphTitle"]').first();
  const originalTitle = await title.textContent();

  await title.dblclick();
  const editor = page.locator('.inline-edit-input');
  await editor.fill('');
  await editor.press('Enter');

  await expect.poll(() => svgBox.locator('text[data-font-role="graphTitle"]').first().evaluate(node => ({
    text: node.textContent,
    visibility: getComputedStyle(node).visibility
  }))).toEqual({
    text: originalTitle,
    visibility: 'hidden'
  });
  await expect.poll(() => page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    return state?.tabs?.find(tab => tab?.id === state.activeTabId)?.userModified === true;
  })).toBe(true);

  await svgBox.locator('.resizer-options-summary').click();
  const graphToggle = svgBox.locator('.resizer-graph-title-checkbox');
  await expect(graphToggle).not.toBeChecked();
  await graphToggle.check();

  await expect.poll(() => svgBox.locator('text[data-font-role="graphTitle"]').first().evaluate(node => ({
    text: node.textContent,
    visible: getComputedStyle(node).visibility !== 'hidden'
  }))).toEqual({
    text: originalTitle,
    visible: true
  });

  await svgBox.locator('.resizer-options-summary').click();
  const yTitle = svgBox.locator('text[data-font-role="yTitle"]').first();
  const originalYTitle = await yTitle.textContent();
  await yTitle.dblclick();
  await page.locator('.inline-edit-input').fill('');
  await page.locator('.inline-edit-input').press('Enter');

  await svgBox.locator('.resizer-options-summary').click();
  const axesToggle = svgBox.locator('.resizer-axes-title-checkbox');
  await expect(axesToggle).not.toBeChecked();
  await expect.poll(() => svgBox.locator('text[data-font-role="yTitle"]').first().evaluate(node => ({
    text: node.textContent,
    hidden: getComputedStyle(node).visibility === 'hidden'
  }))).toEqual({
    text: originalYTitle,
    hidden: true
  });
  await axesToggle.check();
  await expect.poll(() => svgBox.locator('text[data-font-role="yTitle"]').first().evaluate(
    (node, expectedTitle) => node.textContent === expectedTitle && getComputedStyle(node).visibility !== 'hidden',
    originalYTitle
  )).toBe(true);

  const payloadTitles = await page.evaluate(async () => {
    const payload = await Promise.resolve(window.Components?.box?.getPayload?.());
    return {
      graph: payload?.config?.titleText ?? payload?.config?.title ?? payload?.titleText ?? null,
      y: payload?.config?.yLabelText ?? payload?.config?.yLabel ?? payload?.yLabelText ?? null
    };
  });
  expect(payloadTitles).toEqual({
    graph: originalTitle,
    y: originalYTitle
  });
});
