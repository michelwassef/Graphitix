const { test, expect } = require('@playwright/test');
const { clickExampleButtonIfPresent, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const CASES = [
  {
    type: 'box',
    pageId: 'boxPage',
    exampleButtonId: 'boxLoadExample',
    logControlId: 'boxLogScale',
    svgSelector: '#boxPage:not([hidden]) #boxPlot svg'
  },
  {
    type: 'line',
    pageId: 'linePage',
    exampleButtonId: 'lineLoadExample',
    logControlId: 'lineLogY',
    svgSelector: '#linePage:not([hidden]) #lineSvg'
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    exampleButtonId: 'scatterLoadExample',
    logControlId: 'scatterLogY',
    svgSelector: '#scatterPage:not([hidden]) #scatterSvg'
  }
];

for (const component of CASES) {
  test(`${component.type} uses consistent power notation on an automatic log Y axis`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await waitForComponentOwnerReady(page, component, { requireIdle: true });

    await page.locator(`#${component.logControlId}`).check();
    await waitForComponentOwnerReady(page, component, { requireIdle: true });
    await page.waitForFunction(selector => {
      const svg = document.querySelector(selector);
      const labels = Array.from(svg?.querySelectorAll?.('text[data-font-role="yTick"]') || [])
        .map(node => String(node.textContent || '').trim());
      return labels.length >= 2 && labels.every(label => /^10/.test(label));
    }, component.svgSelector, { timeout: 30_000 });

    const result = await page.evaluate(selector => {
      const svg = document.querySelector(selector);
      const labels = Array.from(svg?.querySelectorAll?.('text[data-font-role="yTick"]') || [])
        .map(node => String(node.textContent || '').trim());
      return {
        labels,
        zeroLabels: labels.filter(label => label === '0')
      };
    }, component.svgSelector);

    expect(result.labels.length).toBeGreaterThanOrEqual(2);
    expect(result.zeroLabels).toEqual([]);
    expect(result.labels.every(label => /^10/.test(label))).toBe(true);
  });
}
