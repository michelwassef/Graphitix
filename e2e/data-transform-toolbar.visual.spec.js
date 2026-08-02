const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

test('Data transformation uses the shared Format panel surface and title geometry', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');

  const toolbar = page.locator('#boxPage:not([hidden]) .workspace-toolbar');
  await toolbar.locator('.workspace-toolbar__tab', { hasText: 'Data' }).click();
  const dataPanel = toolbar.locator('.workspace-toolbar__panel--transform');
  const dataTitle = dataPanel.locator(':scope > .workspace-toolbar__panel-title');
  await expect(dataPanel).toBeVisible();

  const data = await dataPanel.evaluate(panel => {
    const title = panel.querySelector(':scope > .workspace-toolbar__panel-title');
    const buttons = panel.querySelector(':scope > .workspace-toolbar__buttons');
    const panelStyle = getComputedStyle(panel);
    const panelRect = panel.getBoundingClientRect();
    const buttonsRect = buttons.getBoundingClientRect();
    const sectionRect = panel.closest('.workspace-toolbar__section')?.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    const titleRect = title.getBoundingClientRect();
    return {
      background: panelStyle.backgroundColor,
      panelTop: panelRect.top,
      panelBottom: panelRect.bottom,
      panelHeight: panelRect.height,
      buttonsTop: buttonsRect.top,
      buttonsHeight: buttonsRect.height,
      inlineStart: panelRect.left - sectionRect.left,
      inlineEnd: sectionRect.right - panelRect.right,
      paddingInlineStart: panelStyle.paddingInlineStart,
      paddingInlineEnd: panelStyle.paddingInlineEnd,
      contentInlineStart: buttonsRect.left - panelRect.left,
      contentInlineEnd: panelRect.right - buttonsRect.right,
      title: {
        fontFamily: titleStyle.fontFamily,
        fontSize: titleStyle.fontSize,
        fontWeight: titleStyle.fontWeight,
        lineHeight: titleStyle.lineHeight,
        minHeight: titleStyle.minHeight,
        textAlign: titleStyle.textAlign,
        top: titleRect.top,
        bottom: titleRect.bottom,
        height: titleRect.height
      }
    };
  });

  expect(data.background).toBe('rgb(255, 255, 255)');
  expect(data.title.top).toBeGreaterThanOrEqual(data.panelTop);
  expect(data.title.bottom).toBeLessThanOrEqual(data.buttonsTop);
  expect(data.panelBottom).toBeGreaterThan(data.buttonsTop);
  expect(data.panelHeight).toBeCloseTo(70, 0);
  expect(data.buttonsHeight).toBeCloseTo(52, 0);
  expect(data.inlineStart).toBeGreaterThanOrEqual(8);
  expect(data.inlineEnd).toBeGreaterThanOrEqual(8);
  expect(data.paddingInlineStart).toBe('10px');
  expect(data.paddingInlineEnd).toBe('10px');
  expect(data.contentInlineStart).toBeGreaterThanOrEqual(10);
  expect(data.contentInlineEnd).toBeGreaterThanOrEqual(10);

  expect(data.title.fontSize).toBe('11px');
  expect(data.title.fontWeight).toBe('600');
  expect(data.title.lineHeight).toBe('14px');
  expect(data.title.minHeight).toBe('14px');
  expect(data.title.textAlign).toBe('center');

  await toolbar.locator('.workspace-toolbar__tab', { hasText: 'Format' }).click();
  await page.locator('#boxPlot [data-axis-hit-target="1"]').first().click({ force: true });
  const axisPanel = toolbar.locator('.workspace-toolbar__section--active .workspace-toolbar__panel--axis').first();
  await expect(axisPanel).toBeVisible();
  const axis = await axisPanel.evaluate(panel => {
    const style = getComputedStyle(panel);
    const panelRect = panel.getBoundingClientRect();
    const rowRect = panel.querySelector(':scope > .axis-controls-panel__row').getBoundingClientRect();
    const sectionRect = panel.closest('.workspace-toolbar__section')?.getBoundingClientRect();
    return {
      background: style.backgroundColor,
      height: panelRect.height,
      inlineStart: panelRect.left - sectionRect.left,
      inlineEnd: sectionRect.right - panelRect.right,
      paddingInlineStart: style.paddingInlineStart,
      paddingInlineEnd: style.paddingInlineEnd,
      contentInlineStart: rowRect.left - panelRect.left,
      contentInlineEnd: panelRect.right - rowRect.right
    };
  });
  expect(axis.background).toBe('rgb(255, 255, 255)');
  expect(axis.height).toBeGreaterThanOrEqual(69);
  expect(axis.inlineStart).toBeGreaterThanOrEqual(8);
  expect(axis.inlineEnd).toBeGreaterThanOrEqual(8);
  expect(axis.paddingInlineStart).toBe('10px');
  expect(axis.paddingInlineEnd).toBe('10px');
  expect(axis.contentInlineStart).toBeGreaterThanOrEqual(10);
  expect(axis.contentInlineEnd).toBeGreaterThanOrEqual(10);
  expect(issues.critical).toEqual([]);
});
