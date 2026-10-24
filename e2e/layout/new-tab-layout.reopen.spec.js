'use strict';

const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');

async function geometry(page, component) {
  return page.evaluate(({ type }) => {
    const tab = window.Main.session.getActiveTab();
    const root = window.Shared.workspaceTabs.getMountedRoot(tab.id, type);
    const table = root.querySelector(type === 'venn' ? '#vennInputPanel' : `#${type}TablePanel`);
    const graph = root.querySelector(`#${type}GraphPanel`);
    const box = root.querySelector('.svgbox');
    const a = table.getBoundingClientRect().width;
    const b = graph.getBoundingClientRect().width;
    return { id: tab.id, split: a / (a + b), width: Number(box.dataset.graphWidthPx), height: Number(box.dataset.graphHeightPx) };
  }, component);
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type}: new tabs keep default layout before and after reopen`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/index.html');
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    const defaults = await geometry(page, component);
    const root = page.locator(`#${component.pageId}`);
    const separator = root.getByRole('separator', { orientation: 'vertical' });
    await separator.focus();
    await separator.press('Home');
    await separator.press('ArrowRight');
    await root.locator('.resizer-options-summary').click();
    const width = root.getByRole('spinbutton', { name: 'Graph width in pixels', exact: true });
    await width.fill('480');
    await width.press('Enter');
    await root.locator('.resizer-options-summary').click();
    await expect.poll(async () => (await geometry(page, component)).width).toBe(480);
    const modified = await geometry(page, component);
    expect(Math.abs(modified.split - defaults.split)).toBeGreaterThan(0.1);
    const archive = await buildWorkspaceArchive(page, { useWorker: false });

    const checkNew = async () => {
      await openComponentFromWelcome(page, component);
      await expect.poll(async () => {
        const current = await geometry(page, component);
        return current.width === defaults.width && current.height === defaults.height
          && Math.abs(current.split - defaults.split) < 0.015;
      }).toBe(true);
    };
    await checkNew();
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: component.type });
    await waitForComponentOwnerReady(page, component.type);
    await expect.poll(async () => (await geometry(page, component)).width).toBe(modified.width);
    expect((await geometry(page, component)).split).toBeCloseTo(modified.split, 2);
    const restored = await geometry(page, component);
    await checkNew();
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${restored.id}"]`).click();
    await waitForComponentOwnerReady(page, component.type);
    await expect.poll(async () => (await geometry(page, component)).width).toBe(modified.width);
    expect((await geometry(page, component)).split).toBeCloseTo(modified.split, 2);
  });
}
