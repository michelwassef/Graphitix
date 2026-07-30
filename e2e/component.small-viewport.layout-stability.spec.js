const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

test.describe('small viewport layout stability', () => {
  test.use({ viewport: { width: 709, height: 923 } });

  test('ROC settles after rendering instead of entering a ResizeObserver redraw loop', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await page.addInitScript(() => {
      window.__rocDrawStarts = 0;
      const originalDebug = console.debug.bind(console);
      console.debug = (...args) => {
        if(String(args[0] || '').includes('drawRoc start')){
          window.__rocDrawStarts += 1;
        }
        originalDebug(...args);
      };
    });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first: true });
    await clickExampleButtonIfPresent(page, 'rocLoadExample');
    await page.waitForFunction(() => {
      const svg = document.querySelector('#rocPage:not([hidden]) #rocSvg');
      return !!svg && svg.querySelectorAll('path').length > 0;
    });

    await page.waitForTimeout(400);
    const startCount = await page.evaluate(() => window.__rocDrawStarts || 0);
    await page.waitForTimeout(1000);
    const endCount = await page.evaluate(() => window.__rocDrawStarts || 0);

    expect(endCount - startCount).toBeLessThanOrEqual(1);
    await expect(page.locator('#rocPage:not([hidden]) #rocSvg')).toBeVisible();
    expect(issues.critical).toEqual([]);
  });

  test('Surface reporting disclosure remains open after the layout reacts to its height change', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
    await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
    await page.waitForFunction(() => (
      document.querySelectorAll('#surfacePage:not([hidden]) #surfaceSvg g.surface-faces polygon').length > 0
    ));

    const report = page.locator('#surfacePage:not([hidden]) #surfaceStatsSummary .stats-report-panel').first();
    await expect(report).toBeVisible();
    await report.locator(':scope > summary').click();
    await expect(report).toHaveJSProperty('open', true);
    await page.waitForTimeout(1000);
    await expect(report).toHaveJSProperty('open', true);
    expect(issues.critical).toEqual([]);
  });
});
