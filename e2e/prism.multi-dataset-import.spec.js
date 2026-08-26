const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/workspaceHarness');

const expectedTabs = extension => [
  { title: 'Grouped: Entering replicate data', type: 'box' },
  { title: 'XY: Entering replicate data', type: 'line' },
  { title: 'XY: Entering mean with error values', type: 'scatter' },
  { title: 'Data 6', type: 'line' },
  { title: 'Survival: Two groups', type: 'survival' },
  { title: 'Data - missing columns', type: extension === 'pzfx' ? 'line' : 'scatter' },
  { title: 'Y SEN', type: 'scatter' },
  { title: 'Y CVN', type: 'scatter' },
  { title: 'Y SD', type: 'scatter' },
  { title: 'Y SE', type: 'scatter' },
  { title: 'Y CV', type: 'scatter' },
  { title: 'Y error', type: 'scatter' },
  { title: 'Y high low', type: 'scatter' },
  { title: 'Data 6 #2', type: 'line' }
];

for (const extension of ['prism', 'pzfx']) {
test(`imports and renders every mixed-type demo .${extension} table`, async ({ page }) => {
  test.setTimeout(90_000);
  const prismPath = path.join(__dirname, '..', 'prism files', `demo_dataset.${extension}`);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.on('dialog', dialog => dialog.accept());

  await page.locator('#welcomeGraphFileInput').setInputFiles(prismPath);

  await expect.poll(() => page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return tabs.filter(tab => !tab.isWelcome).map(tab => ({ title: tab.title, type: tab.type }));
  }), { timeout: 80_000 }).toEqual(expectedTabs(extension));

  const importedTabs = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => !tab.isWelcome)
      .map(tab => ({ id: tab.id, title: tab.title, type: tab.type }))
  ));
  for (const tab of importedTabs) {
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tab.id}"]`).click();
    const root = page.locator(`[data-workspace-tab-id="${tab.id}"]`);
    await expect(root.locator(`#${tab.type}Svg`)).toHaveCount(1);
    await expect(root.locator('.svgbox')).not.toContainText('Add data to the input table');
  }
});
}
