const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForSeriesPath(page) {
  await page.waitForFunction(
    () => document.querySelectorAll('#linePlot path[data-series]').length > 0,
    null,
    { timeout: 20_000 }
  );
}

async function clickSeriesPath(page) {
  const clicked = await page.evaluate(() => {
    const path = document.querySelector('#linePlot path[data-series]');
    if (!path) {
      return false;
    }
    path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  expect(clicked).toBe(true);
}

test('line error bar thickness lives in line toolbar and is grouped-only', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  await clickExampleButtonIfPresent(page, 'lineLoadExample');
  await waitForSeriesPath(page);

  const legacyBorderFieldset = page.locator('#lineGraphPanel fieldset').filter({
    has: page.locator('legend', { hasText: 'Border' })
  });
  await expect(legacyBorderFieldset).toHaveCount(0);

  const toolbarPanel = page.locator('.font-toolbar-host[data-font-toolbar-scope="line"] .line-errorbar-inline-panel');

  await page.locator('#lineTableFormat').selectOption('single');
  await page.waitForTimeout(250);
  await clickSeriesPath(page);
  await page.waitForTimeout(250);
  await expect(toolbarPanel).toHaveCount(0);

  await page.locator('#lineTableFormat').selectOption('grouped');
  await page.waitForTimeout(500);
  await waitForSeriesPath(page);
  await clickSeriesPath(page);
  await expect(toolbarPanel).toBeVisible();

  const toolbarInput = toolbarPanel.locator('input[type="number"]');
  const backingInput = page.locator('#lineErrorBarWidth');
  await expect(toolbarInput).toHaveValue(await backingInput.inputValue());

  await toolbarInput.fill('4');
  await toolbarInput.dispatchEvent('input');
  await expect(backingInput).toHaveValue('4');

  await page.locator('#lineTableFormat').selectOption('single');
  await page.waitForTimeout(350);
  await expect(toolbarPanel).toHaveCount(0);

  expect(issues.critical).toEqual([]);
});
