const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const CASES = [
  { type: 'hist', svgId: 'histSvg' },
  { type: 'roc', svgId: 'rocSvg' },
  { type: 'survival', svgId: 'survivalSvg' },
  { type: 'pie', svgId: 'pieSvg', label: 'pie' },
  { type: 'pie', svgId: 'pieSvg', label: 'stacked bar', chartType: 'stacked' }
].map(config => ({
  ...COMPONENT_MATRIX.find(entry => entry.type === config.type),
  ...config
}));

for(const component of CASES){
  test(`${component.label || component.type} publishes only finalized replacement frames`, async ({ page }) => {
    test.setTimeout(90_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: false });

    if(component.chartType){
      await page.locator('#piePage:not([hidden]) #pieChartType').selectOption(component.chartType);
    }

    await page.evaluate(({ type, svgId }) => {
      const plot = document.querySelector(`#${type}Page:not([hidden]) #${type}Plot`);
      if(!plot){
        throw new Error(`Missing ${type} plot`);
      }
      window.__atomicPublicationRecords = [];
      const originalAppendChild = plot.appendChild.bind(plot);
      plot.appendChild = node => {
        const svg = node?.matches?.('svg') ? node : node?.querySelector?.('svg');
        if(svg){
          window.__atomicPublicationRecords.push({
            frameState: node.dataset?.graphFramePublication || null,
            visibility: node.style?.visibility || '',
            svgId: svg.id || '',
            previousFramePresent: !!plot.querySelector(`#${svgId}`)
          });
        }
        return originalAppendChild(node);
      };
    }, component);

    const exampleButton = page.locator(`#${component.pageId}:not([hidden]) #${component.exampleButtonId}`);
    await exampleButton.click();
    await page.waitForFunction(({ type, svgId }) => {
      const svg = document.querySelector(`#${type}Page:not([hidden]) #${svgId}`);
      return svg?.closest?.('[data-graph-frame-publication="committed"]')
        || svg?.dataset?.graphFramePublication === 'committed';
    }, component, { timeout: 30_000 });

    await page.evaluate(({ type, svgId }) => {
      window.__atomicPreviousFrame = document.querySelector(`#${type}Page:not([hidden]) #${svgId}`);
    }, component);
    await exampleButton.click();
    await page.waitForFunction(({ type, svgId }) => {
      const svg = document.querySelector(`#${type}Page:not([hidden]) #${svgId}`);
      const committed = svg?.closest?.('[data-graph-frame-publication="committed"]')
        || svg?.dataset?.graphFramePublication === 'committed';
      return !!svg && svg !== window.__atomicPreviousFrame && !!committed;
    }, component, { timeout: 30_000 });

    const result = await page.evaluate(({ type, svgId }) => {
      const plot = document.querySelector(`#${type}Page:not([hidden]) #${type}Plot`);
      return {
        records: window.__atomicPublicationRecords || [],
        publishedCount: plot?.querySelectorAll?.(`#${svgId}`)?.length || 0,
        stagedCount: plot?.querySelectorAll?.('[data-graph-frame-publication="staged"]')?.length || 0
      };
    }, component);

    expect(result.records.length).toBeGreaterThanOrEqual(2);
    expect(result.records.every(record =>
      record.frameState === 'staged'
      && record.visibility === 'hidden'
      && record.svgId === ''
    )).toBe(true);
    expect(result.records.at(-1).previousFramePresent).toBe(true);
    expect(result.publishedCount).toBe(1);
    expect(result.stagedCount).toBe(0);
    expect(issues.critical).toEqual([]);
  });
}
