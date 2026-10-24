const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');

const transformTypes = ['box', 'scatter', 'line', 'pca', 'heatmap', 'hist', 'surface'];

async function measure(panel) {
  return panel.evaluate(element => {
    const rect = selector => {
      const box = element.querySelector(selector).getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    };
    return {
      checkbox: rect('[data-transform-multi-toggle]'),
      label: rect('.workspace-toolbar__checkbox--toolbar'),
      row: rect('.workspace-toolbar__transform-row--selection'),
      options: rect('.workspace-toolbar__transform-row--options'),
      title: rect('.workspace-toolbar__panel-title'),
      apply: rect('[data-transform-apply]')
    };
  });
}

for (const type of transformTypes) {
  test(`${type}: Multiple stays at the same position when toggled`, async ({ page }, testInfo) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const component = COMPONENT_MATRIX.find(entry => entry.type === type);
    await openComponentFromWelcome(page, component, { first: true });
    const toolbar = page.locator(`#${component.pageId}:not([hidden]) .workspace-toolbar`);
    await toolbar.getByRole('tab', { name: 'Data', exact: true }).click();
    const panel = toolbar.locator('.workspace-toolbar__panel--transform');
    const checkbox = panel.locator('[data-transform-multi-toggle]');
    const apply = panel.locator('[data-transform-apply]');
    const clear = panel.locator('[data-transform-clear]');

    for (const width of [1920, 1000]) {
      await page.setViewportSize({ width, height: 1080 });
      await checkbox.uncheck();
      await expect(apply).toBeHidden();
      await expect(clear).toBeHidden();
      const unchecked = await measure(panel);
      await checkbox.check();
      await expect(apply).toBeVisible();
      await expect(clear).toBeVisible();
      const checked = await measure(panel);

      // Reserve the action buttons' row height before they appear. This keeps
      // Multiple at its lower, centered position without moving other controls.
      for (const key of ['checkbox', 'label', 'row', 'options', 'title']) {
        expect(checked[key].top, `${width}: ${key} top`).toBeCloseTo(unchecked[key].top, 1);
        expect(checked[key].height, `${width}: ${key} height`).toBeCloseTo(unchecked[key].height, 1);
      }
      expect(unchecked.row.height).toBeGreaterThanOrEqual(checked.apply.height);
      expect(unchecked.checkbox.top).toBeGreaterThan(unchecked.options.bottom);
      const center = box => (box.top + box.bottom) / 2;
      expect(center(checked.checkbox)).toBeCloseTo(center(checked.apply), 1);
      await page.screenshot({ path: testInfo.outputPath(`${type}-${width}-checked.png`) });

      await checkbox.uncheck();
      await expect(apply).toBeHidden();
      await expect(clear).toBeHidden();
      const restored = await measure(panel);
      expect(restored.checkbox.top).toBeCloseTo(unchecked.checkbox.top, 1);
      expect(restored.label.top).toBeCloseTo(unchecked.label.top, 1);
      await page.screenshot({ path: testInfo.outputPath(`${type}-${width}-unchecked.png`) });
    }
  });
}
