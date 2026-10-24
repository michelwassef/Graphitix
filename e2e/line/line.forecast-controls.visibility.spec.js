const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function expectForecastVisibility(page, hidden){
  const fieldset = page.locator('#linePage:not([hidden]) #lineForecastControls');
  await expect.poll(() => fieldset.evaluate(node => ({
    hidden: node.hidden,
    inlineDisplay: node.style.display
  }))).toEqual({ hidden, inlineDisplay: '' });
  if(hidden){
    await expect(fieldset).toBeHidden();
  }else{
    await expect(fieldset).toBeVisible();
  }
}

test('Line forecast controls use native hidden state across regression modes', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true, loadExample: true });

  const regression = page.locator('#linePage:not([hidden]) #lineRegressionMode');
  await expectForecastVisibility(page, true);

  await regression.selectOption('arima');
  await waitForComponentOwnerReady(page, 'line', { requireMountedRoot: true, requireIdle: true });
  await expectForecastVisibility(page, false);

  await regression.selectOption('linear');
  await waitForComponentOwnerReady(page, 'line', { requireMountedRoot: true, requireIdle: true });
  await expectForecastVisibility(page, true);

  await regression.selectOption('holtWinters');
  await waitForComponentOwnerReady(page, 'line', { requireMountedRoot: true, requireIdle: true });
  await expectForecastVisibility(page, false);
});
