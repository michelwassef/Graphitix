const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function expectControlState(page, id, hidden){
  const control = page.locator(`#scatterPage:not([hidden]) #${id}`);
  await expect.poll(() => control.evaluate(node => ({
    hidden: node.hidden,
    inlineDisplay: node.style.display
  }))).toEqual({ hidden, inlineDisplay: '' });
  if(hidden){
    await expect(control).toBeHidden();
  }else{
    await expect(control).toBeVisible();
  }
}

test('Scatter graph controls use native hidden state across type and view changes', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, {
    first: true,
    loadExample: true
  });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });

  const graphType = page.locator('#scatterPage:not([hidden]) #scatterGraphType');
  const viewMode = page.locator('#scatterPage:not([hidden]) #scatterViewMode');
  const colorMode = page.locator('#scatterPage:not([hidden]) #scatterColorMode');

  await expectControlState(page, 'scatterViewControls', false);
  await expectControlState(page, 'scatterThresholdControls', true);
  await expectControlState(page, 'scatterSignificantOptions', true);
  await expectControlState(page, 'scatterColorModeRow', false);
  await expectControlState(page, 'scatterDensityPaletteRow', false);

  for(const type of ['volcano', 'ma']){
    await graphType.selectOption(type);
    await expect.poll(() => graphType.inputValue()).toBe(type);
    await expectControlState(page, 'scatterViewControls', true);
    await expectControlState(page, 'scatterThresholdControls', false);
    await expectControlState(page, 'scatterSignificantOptions', false);
    await expectControlState(page, 'scatterColorModeRow', true);
    await expectControlState(page, 'scatterDensityPaletteRow', true);
  }

  await graphType.selectOption('scatter');
  await expect.poll(() => graphType.inputValue()).toBe('scatter');
  await expectControlState(page, 'scatterViewControls', false);
  await expectControlState(page, 'scatterThresholdControls', true);
  await expectControlState(page, 'scatterSignificantOptions', true);
  await expectControlState(page, 'scatterColorModeRow', false);
  await expectControlState(page, 'scatterDensityPaletteRow', false);

  await colorMode.selectOption('solid');
  await expectControlState(page, 'scatterDensityPaletteRow', true);
  await colorMode.selectOption('auto');
  await expectControlState(page, 'scatterDensityPaletteRow', false);
  await viewMode.selectOption('3d');
  await expectControlState(page, 'scatterDensityPaletteRow', true);
  await viewMode.selectOption('2d');
  await expectControlState(page, 'scatterDensityPaletteRow', false);
});
