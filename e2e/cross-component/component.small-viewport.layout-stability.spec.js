const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { observeStableValue, waitForComponentOwnerReady } = require('../helpers/contractWaits');

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
    await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first: true, loadExample: true });
    await page.waitForFunction(() => {
      const svg = document.querySelector('#rocPage:not([hidden]) #rocSvg');
      return !!svg && svg.querySelectorAll('path').length > 0;
    });

    await waitForComponentOwnerReady(page, 'roc', {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 30_000
    });
    const startCount = await page.evaluate(() => window.__rocDrawStarts || 0);
    const observation = await observeStableValue(page,
      () => page.evaluate(() => window.__rocDrawStarts || 0),
      {
        durationMs: 1_000,
        label: 'ROC small-viewport draw count',
        isStable: (initial, current) => current - initial <= 1
      }
    );
    const endCount = observation.latest;

    expect(endCount - startCount).toBeLessThanOrEqual(1);
    await expect(page.locator('#rocPage:not([hidden]) #rocSvg')).toBeVisible();
    expect(issues.critical).toEqual([]);
  });

  test('Surface reporting disclosure remains open after the layout reacts to its height change', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true, loadExample: true });
    await page.waitForFunction(() => (
      document.querySelectorAll('#surfacePage:not([hidden]) #surfaceSvg g.surface-faces polygon').length > 0
    ));

    const report = page.locator('#surfacePage:not([hidden]) #surfaceStatsSummary .stats-report-panel').first();
    await expect(report).toBeVisible();
    await report.locator(':scope > summary').click();
    await expect(report).toHaveJSProperty('open', true);
    await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await expect(report).toHaveJSProperty('open', true);
    expect(issues.critical).toEqual([]);
  });
});
