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
  await dataPanel.locator('[data-transform-multi-toggle="1"]').check();

  const data = await dataPanel.evaluate(panel => {
    const title = panel.querySelector(':scope > .workspace-toolbar__panel-title');
    const optionsRow = panel.querySelector(':scope > .workspace-toolbar__transform-row--options');
    const selectionRow = panel.querySelector(':scope > .workspace-toolbar__transform-row--selection');
    const multiple = selectionRow?.querySelector('[data-transform-multi-toggle="1"]')?.closest('label') || null;
    const apply = selectionRow?.querySelector('[data-transform-apply="1"]') || null;
    const clear = selectionRow?.querySelector('[data-transform-clear="1"]') || null;
    const firstOption = optionsRow?.querySelector('[data-transform-option]') || null;
    const panelStyle = getComputedStyle(panel);
    const panelRect = panel.getBoundingClientRect();
    const optionsRect = optionsRow.getBoundingClientRect();
    const selectionRect = selectionRow.getBoundingClientRect();
    const sectionRect = panel.closest('.workspace-toolbar__section')?.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    const titleRect = title.getBoundingClientRect();
    const optionRect = firstOption?.getBoundingClientRect() || null;
    const optionLabelRect = firstOption?.querySelector('.workspace-toolbar__label')?.getBoundingClientRect() || null;
    const applyRect = apply?.getBoundingClientRect() || null;
    const applyLabelRect = apply?.querySelector('.workspace-toolbar__label')?.getBoundingClientRect() || null;
    const clearRect = clear?.getBoundingClientRect() || null;
    const clearLabelRect = clear?.querySelector('.workspace-toolbar__label')?.getBoundingClientRect() || null;
    const multipleStyle = multiple ? getComputedStyle(multiple) : null;
    const centerDelta = (outer, inner) => {
      if(!outer || !inner){ return null; }
      return Math.abs(((outer.top + outer.bottom) / 2) - ((inner.top + inner.bottom) / 2));
    };
    return {
      background: panelStyle.backgroundColor,
      panelTop: panelRect.top,
      panelBottom: panelRect.bottom,
      panelHeight: panelRect.height,
      optionsTop: optionsRect.top,
      optionsBottom: optionsRect.bottom,
      optionsHeight: optionsRect.height,
      selectionTop: selectionRect.top,
      selectionHeight: selectionRect.height,
      optionButtonHeight: optionRect?.height || 0,
      inlineStart: panelRect.left - sectionRect.left,
      inlineEnd: sectionRect.right - panelRect.right,
      paddingInlineStart: panelStyle.paddingInlineStart,
      paddingInlineEnd: panelStyle.paddingInlineEnd,
      contentInlineStart: optionsRect.left - panelRect.left,
      contentInlineEnd: panelRect.right - optionsRect.right,
      selectionLeftDelta: Math.abs(selectionRect.left - optionsRect.left),
      multipleChrome: {
        borderTopWidth: multipleStyle?.borderTopWidth || '',
        borderTopStyle: multipleStyle?.borderTopStyle || '',
        backgroundColor: multipleStyle?.backgroundColor || ''
      },
      verticalCenterDelta: {
        option: centerDelta(optionRect, optionLabelRect),
        apply: centerDelta(applyRect, applyLabelRect),
        clear: centerDelta(clearRect, clearLabelRect)
      },
      selectionOrder: [multiple, apply, clear]
        .filter(Boolean)
        .map(node => node === multiple ? 'multiple' : (node === apply ? 'apply' : 'clear')),
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
  expect(data.title.bottom).toBeLessThanOrEqual(data.optionsTop);
  expect(data.optionsBottom).toBeLessThanOrEqual(data.selectionTop);
  expect(data.panelBottom).toBeGreaterThan(data.selectionTop);
  expect(data.panelHeight).toBeCloseTo(70, 0);
  expect(data.optionsHeight).toBeCloseTo(24, 0);
  expect(data.selectionHeight).toBeCloseTo(24, 0);
  expect(data.optionButtonHeight).toBeCloseTo(24, 0);
  expect(data.selectionOrder).toEqual(['multiple', 'apply', 'clear']);
  expect(data.selectionLeftDelta).toBeLessThanOrEqual(1);
  expect(data.multipleChrome.borderTopWidth).toBe('0px');
  expect(data.multipleChrome.borderTopStyle).toBe('none');
  expect(data.multipleChrome.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(data.verticalCenterDelta.option).toBeLessThanOrEqual(1);
  expect(data.verticalCenterDelta.apply).toBeLessThanOrEqual(1);
  expect(data.verticalCenterDelta.clear).toBeLessThanOrEqual(1);
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
