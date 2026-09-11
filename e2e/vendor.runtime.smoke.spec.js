const { test, expect } = require('@playwright/test');

test('browser loads the committed table and statistical vendor runtimes', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const runtime = await page.evaluate(() => ({
    agGrid: typeof window.agGrid?.createGrid === 'function',
    jStat: typeof window.jStat?.normal?.cdf === 'function',
    agGridScript: !!document.querySelector('script[src="libs/ag-grid-community/ag-grid-community.min.noStyle.js"]'),
    jStatScript: !!document.querySelector('script[src="libs/jstat.min.js"]')
  }));

  expect(runtime).toEqual({
    agGrid: true,
    jStat: true,
    agGridScript: true,
    jStatScript: true
  });
});
