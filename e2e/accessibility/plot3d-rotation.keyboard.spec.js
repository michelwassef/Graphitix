const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { clickExpectedExampleButton, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const CASES = [
  { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', plotId: 'scatterPlot', svgId: 'scatterSvg', viewModeId: 'scatterViewMode' },
  { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample', plotId: 'pcaPlot', svgId: 'pcaSvg', viewModeId: 'pcaViewMode' },
  { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample', plotId: 'linePlot', svgId: 'lineSvg', viewModeId: 'lineViewMode' },
  { type: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample', svgId: 'surfaceSvg', standaloneFocus: true }
];

for (const component of CASES) {
  test(`${component.type} 3D graph rotates with keyboard and retains visible focus`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    if (component.type === 'scatter') {
      await page.locator(`#${component.pageId}:not([hidden]) #${component.viewModeId}`).selectOption('3d');
    }
    await clickExpectedExampleButton(page, component.exampleButtonId);
    if (component.viewModeId && component.type !== 'scatter') {
      await page.locator(`#${component.pageId}:not([hidden]) #${component.viewModeId}`).selectOption('3d');
    }
    const svgSelector = `#${component.pageId}:not([hidden]) #${component.svgId}`;
    await page.waitForFunction(({ selector, type }) => {
      const svg = document.querySelector(selector);
      return svg?.dataset?.rotationControlsAttached === 'true'
        && (type === 'surface'
          ? (svg.querySelectorAll('g.surface-faces polygon').length > 0)
          : svg.dataset?.viewMode === '3d');
    }, { selector: svgSelector, type: component.type }, { timeout: 45_000 });
    await waitForComponentOwnerReady(page, component.type, { requireIdle: true, timeout: 45_000 });

    const focusTarget = page.locator(component.standaloneFocus
      ? svgSelector
      : `#${component.pageId}:not([hidden]) #${component.plotId}`);
    await expect(focusTarget).toHaveAttribute('aria-keyshortcuts', /Shift\+ArrowRight/);
    if (component.standaloneFocus) {
      await expect(focusTarget).toHaveAttribute('tabindex', '0');
      const hasAccessibleSurfaceName = await focusTarget.evaluate(svg =>
        /Surface/i.test(`${svg.getAttribute('aria-label') || ''} ${svg.querySelector('title')?.textContent || ''}`)
      );
      expect(hasAccessibleSurfaceName).toBe(true);
    } else {
      await expect(focusTarget).toHaveAttribute('tabindex', '0');
      await expect(page.locator(svgSelector)).not.toHaveAttribute('tabindex', '0');
    }

    const before = await page.evaluate(type => {
      const payload = window.Components?.[type]?.getPayload?.() || {};
      const rotation = payload.config?.rotation || payload.rotation || {};
      return [rotation.x, rotation.y, rotation.z, rotation.quaternion?.w,
        rotation.quaternion?.x, rotation.quaternion?.y, rotation.quaternion?.z];
    }, component.type);
    await focusTarget.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await waitForComponentOwnerReady(page, component.type, { requireIdle: true, timeout: 45_000 });

    const after = await page.evaluate(type => {
      const payload = window.Components?.[type]?.getPayload?.() || {};
      const rotation = payload.config?.rotation || payload.rotation || {};
      const active = document.activeElement;
      return {
        rotation: [rotation.x, rotation.y, rotation.z, rotation.quaternion?.w,
          rotation.quaternion?.x, rotation.quaternion?.y, rotation.quaternion?.z],
        focusRetained: active?.hasAttribute?.('aria-keyshortcuts') === true,
        outline: active ? getComputedStyle(active).outlineStyle : 'none'
      };
    }, component.type);
    expect(after.rotation).not.toEqual(before);
    expect(after.focusRetained).toBe(true);
    expect(after.outline).not.toBe('none');
  });
}
