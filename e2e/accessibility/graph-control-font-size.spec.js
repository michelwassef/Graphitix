const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} graph control labels use the shared text size`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true });

    const result = await page.evaluate(pageId => {
      const root = document.querySelector(`#${pageId}:not([hidden]) .panel[id$="GraphPanel"]`);
      const visible = element => getComputedStyle(element).display !== 'none'
        && getComputedStyle(element).visibility !== 'hidden'
        && element.getClientRects().length > 0;
      const panels = Array.from(root?.querySelectorAll('.config-panel') || []);
      const labels = panels.flatMap(panel => {
        const expected = getComputedStyle(panel).getPropertyValue('--graph-control-font-size').trim();
        return Array.from(panel.querySelectorAll('label')).filter(visible).map(label => ({
          text: label.textContent.trim().replace(/\s+/g, ' '),
          expected,
          actual: getComputedStyle(label).fontSize
        }));
      });
      const lowerRoot = document.querySelector('#heatmapPage:not([hidden]) .heatmap-lower-panels');
      if (pageId === 'heatmapPage' && lowerRoot) {
        const standard = lowerRoot.querySelector('.heatmap-lower-left fieldset label.heatmap-inline-group span');
        const expected = standard ? getComputedStyle(standard).fontSize : '';
        labels.push(...Array.from(lowerRoot.querySelectorAll('label')).filter(visible).map(label => ({
          text: label.textContent.trim().replace(/\s+/g, ' '),
          expected,
          actual: getComputedStyle(label).fontSize
        })));
      }
      return labels;
    }, component.pageId);

    expect(result.length).toBeGreaterThan(0);
    for (const label of result) {
      expect(label.actual, label.text).toBe(label.expected);
    }
    if (component.type === 'heatmap') {
      expect(result.some(label => label.text === 'Decimals')).toBe(true);
      expect(result.some(label => label.text === 'Clustering method')).toBe(true);
    }
  });
}
