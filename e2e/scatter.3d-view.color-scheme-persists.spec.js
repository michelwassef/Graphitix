const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readViewState(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg');
    const viewSel = document.querySelector('#scatterPage:not([hidden]) #scatterViewMode')
      || document.querySelector('#scatterViewMode');
    return {
      svgViewMode: svg?.getAttribute('data-view-mode') || svg?.dataset?.viewMode || null,
      viewSelectValue: viewSel ? viewSel.value : null
    };
  });
}

// Regression guard: changing the color scheme must not revert a 3D scatter back to 2D.
// Root cause was a duplicate `view` key in captureScatterRuntimeSnapshot that dropped the
// captured viewMode, so the capture-time owned-runtime restore clobbered live 3D with a stale 2D.
test('scatter 3D view survives a color scheme change', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  // Load data first, then enter 3D and reload the example so the example loader
  // selects its 3D dataset. Selecting 3D against an empty table can be normalized
  // back to 2D before the test reaches the color-scheme assertion.
  const activeRoot = '#scatterPage:not([hidden])';
  const viewSel = page.locator(`${activeRoot} #scatterViewMode`);
  await expect(viewSel).toBeVisible({ timeout: 10_000 });

  await page.locator(`${activeRoot} #scatterLoadExample`).click();
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data) && data.length > 2;
  }, null, { timeout: 20_000 });

  await viewSel.selectOption('3d');
  await page.locator(`${activeRoot} #scatterLoadExample`).click();
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data)
      && data.length > 2
      && data.some((row, index) => index > 0 && Array.isArray(row) && row[3] !== '' && row[3] != null);
  }, null, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg');
    const viewSelect = document.querySelector('#scatterPage:not([hidden]) #scatterViewMode');
    return (svg?.dataset?.viewMode || svg?.getAttribute('data-view-mode')) === '3d'
      && viewSelect?.value === '3d';
  }, null, { timeout: 20_000 });

  const before = await readViewState(page);
  expect(before.svgViewMode, 'scatter should render in 3D before the scheme change').toBe('3d');
  expect(before.viewSelectValue).toBe('3d');

  // Change the color scheme to a different palette.
  const schemeInfo = await page.evaluate(() => {
    const sel = document.querySelector('#scatterPage:not([hidden]) select[data-color-scheme-select="1"]');
    if (!sel) return null;
    return { current: sel.value, options: Array.from(sel.options).map(o => o.value) };
  });
  expect(schemeInfo, 'color scheme select not found').toBeTruthy();
  const target = schemeInfo.options.find(o => o !== schemeInfo.current && o !== 'custom') || schemeInfo.current;
  await page.locator('#scatterPage:not([hidden]) select[data-color-scheme-select="1"]').first().selectOption(target);
  await page.waitForTimeout(1200);

  const after = await readViewState(page);
  expect(after.svgViewMode, 'scatter must still render in 3D after the color scheme change').toBe('3d');
  expect(after.viewSelectValue, 'View dropdown must still show 3D after the color scheme change').toBe('3d');

  expect(issues.critical).toEqual([]);
});
