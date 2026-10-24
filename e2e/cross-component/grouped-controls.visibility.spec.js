const { selectReplicateMode } = require('../helpers/uiDriver');
const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const COMPONENTS = [
  {
    type: 'box',
    pageId: 'boxPage',
    formatId: 'boxTableFormat',
    standardValue: 'single',
    panels: ['boxGroupedControls']
  },
  {
    type: 'pca',
    pageId: 'pcaPage',
    formatId: 'pcaTableFormat',
    standardValue: 'standard',
    panels: ['pcaGroupedControls']
  },
  {
    type: 'line',
    pageId: 'linePage',
    formatId: 'lineTableFormat',
    standardValue: 'single',
    panels: ['lineGroupedControls']
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    formatId: 'scatterTableFormat',
    standardValue: 'single',
    panels: ['scatterGroupedControls', 'scatterGroupedControlsExtra']
  }
];

async function expectPanelState(panel, expected){
  await expect.poll(() => panel.evaluate(node => ({
    hidden: node.hidden,
    ariaHidden: node.getAttribute('aria-hidden'),
    inlineDisplay: node.style.display
  }))).toEqual(expected);
  if(expected.hidden){
    await expect(panel).toBeHidden();
  }else{
    await expect(panel).toBeVisible();
  }
}

test('grouped table control panels use one hidden state across graph workspaces', async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1600, height: 1000 });

  for(let index = 0; index < COMPONENTS.length; index += 1){
    const component = COMPONENTS[index];
    await openComponentFromWelcome(page, component, {
      first: index === 0,
      loadExample: true
    });

    const root = page.locator(`#${component.pageId}:not([hidden])`);
    const format = root.locator(`#${component.formatId}`);
    const replicates = root.locator('.workspace-toolbar__panel--replicates');
    const panels = component.panels.map(id => page.locator(`#${component.pageId}:not([hidden]) #${id}`));
    await selectReplicateMode(page, component.type, component.standardValue);
    await expect(format).toBeHidden();
    await expect(root.locator(`#${component.type}TablePanel [data-replicates-controls]`)).toHaveCount(0);
    await expect(replicates.getByRole('button', { name: 'Single', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await replicates.evaluate(panel => {
      const transform = panel.parentElement.querySelector('.workspace-toolbar__panel--transform');
      return !!(panel.compareDocumentPosition(transform) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    const expectAligned = async () => {
      const offset = await replicates.evaluate(panel => {
        const button = panel.querySelector('[data-replicate-value]');
        const transform = panel.parentElement.querySelector('[data-transform-option]');
        return Math.abs(button.getBoundingClientRect().top - transform.getBoundingClientRect().top);
      });
      expect(offset).toBeLessThanOrEqual(1);
    };
    await expectAligned();
    for(const panel of panels){
      await expectPanelState(panel, { hidden: true, ariaHidden: 'true', inlineDisplay: '' });
    }

    await selectReplicateMode(page, component.type, 'grouped');
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true
    });
    for(const panel of panels){
      await expectPanelState(panel, { hidden: false, ariaHidden: 'false', inlineDisplay: '' });
    }
    await expect(replicates.getByRole('button', { name: 'Grouped', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(replicates.locator('input[type="number"]')).toBeVisible();
    await expectAligned();
    await page.screenshot({ path: testInfo.outputPath(`${component.type}-replicates-wide.png`) });

    await page.setViewportSize({ width: 760, height: 900 });
    const single = replicates.getByRole('button', { name: 'Single', exact: true });
    await single.focus();
    await single.press('Space');
    await expect(single).toHaveAttribute('aria-pressed', 'true');
    await expect(format).toHaveValue(component.standardValue);
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true
    });
    for(const panel of panels){
      await expectPanelState(panel, { hidden: true, ariaHidden: 'true', inlineDisplay: '' });
    }
    await expect(single).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`${component.type}-replicates-narrow.png`) });
    await page.setViewportSize({ width: 1600, height: 1000 });
  }
});
