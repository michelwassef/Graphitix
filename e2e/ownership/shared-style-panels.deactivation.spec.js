const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function clickSvgTarget(page, selector) {
  const clicked = await page.evaluate(targetSelector => {
    const target = document.querySelector(targetSelector);
    if (!target) {
      return false;
    }
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    return true;
  }, selector);
  expect(clicked, `Expected an SVG control target matching ${selector}`).toBe(true);
}

test('Box grid controls close when their owning tab deactivates', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );

  await page.locator('#boxShowGrid').check();
  await page.waitForFunction(() => !!document.querySelector('#boxSvg [data-grid-control="1"]'));
  await clickSvgTarget(page, '#boxSvg [data-grid-control="1"]');

  const panel = page.locator('.grid-controls-panel');
  await expect(panel).toHaveAttribute('data-open', '1');
  await expect(panel).toBeVisible();

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' });
  await expect(panel).toBeHidden();
  expect(issues.critical).toEqual([]);
});

test('Box axis controls close when their owning tab deactivates', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => !!document.querySelector('#boxSvg [data-axis-control="1"]'));
  await clickSvgTarget(page, '#boxSvg [data-axis-control="1"][data-axis-key="y"]');

  const panel = page.locator('.axis-controls-panel');
  await expect(panel).toHaveAttribute('data-open', '1');
  await expect(panel).toBeVisible();

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' });
  await expect(panel).toBeHidden();
  expect(issues.critical).toEqual([]);
});

test('Box axis thickness drag cannot write its starting value into the next tab', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { loadExample: true }
  );
  const [firstTabId, secondTabId] = await page.evaluate(() =>
    window.Main.session.workspaceState.tabs.filter(tab => tab.type === 'box').map(tab => tab.id)
  );

  const openAxisPanel = async tabId => {
    await page.evaluate(async id => window.Main.tabs.activateTab(id, { reason: 'e2e-axis-drag-owner' }), tabId);
    await page.waitForFunction(id => window.Main.session.workspaceState.activeTabId === id, tabId);
    await page.locator('#boxSvg [data-axis-control="1"][data-axis-key="y"]').first().dispatchEvent('click');
    const panel = page.locator('.axis-controls-panel');
    await expect(panel).toBeVisible();
    return panel;
  };
  const firstPanel = await openAxisPanel(firstTabId);
  const thicknessInput = firstPanel.locator('.axis-controls-panel__field--style input[type="number"]');
  await thicknessInput.evaluate(input => {
    input.value = '6';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() =>
    window.Components.box.getPayload()?.config?.axis?.strokeWidth ?? null
  )).toBe(6);

  await firstPanel.locator('.axis-controls-panel__field--style .shared-border-style-chip').dispatchEvent('mousedown', {
    altKey: true,
    button: 0,
    clientX: 160,
    bubbles: true
  });
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 168, bubbles: true })));
  await expect.poll(() => page.evaluate(() =>
    window.Components.box.getPayload()?.config?.axis?.strokeWidth ?? null
  )).toBe(6.25);
  const secondPanel = await openAxisPanel(secondTabId);
  const secondInput = secondPanel.locator('.axis-controls-panel__field--style input[type="number"]');
  const secondBefore = Number(await secondInput.inputValue());
  expect(Number.isFinite(secondBefore)).toBe(true);

  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 176, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176, bubbles: true }));
  });

  await expect.poll(() => page.evaluate(() =>
    window.Components.box.getPayload()?.config?.axis?.strokeWidth ?? null
  )).toBe(secondBefore);

  await page.evaluate(async id => window.Main.tabs.activateTab(id, { reason: 'e2e-axis-drag-owner-return' }), firstTabId);
  await expect.poll(() => page.evaluate(([firstId, secondId]) => {
    const tabs = window.Main.session.workspaceState.tabs;
    return [firstId, secondId].map(id =>
      tabs.find(tab => tab.id === id)?.payload?.config?.axis?.strokeWidth ?? null
    );
  }, [firstTabId, secondTabId])).toEqual([6.25, secondBefore]);
});

test('Box grid thickness drag cannot write its starting value into the next tab', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { loadExample: true }
  );
  const [firstTabId, secondTabId] = await page.evaluate(() =>
    window.Main.session.workspaceState.tabs.filter(tab => tab.type === 'box').map(tab => tab.id)
  );

  const openGridPanel = async tabId => {
    await page.evaluate(async id => window.Main.tabs.activateTab(id, { reason: 'e2e-grid-drag-owner' }), tabId);
    await page.waitForFunction(id => window.Main.session.workspaceState.activeTabId === id, tabId);
    const showGrid = page.locator('#boxShowGrid');
    if(!await showGrid.isChecked()){
      await showGrid.check();
    }
    await page.waitForFunction(() => !!document.querySelector('#boxSvg [data-grid-control="1"]'));
    await clickSvgTarget(page, '#boxSvg [data-grid-control="1"]');
    const panel = page.locator('.grid-controls-panel');
    await expect(panel).toBeVisible();
    return panel;
  };
  const firstPanel = await openGridPanel(firstTabId);
  const firstInput = firstPanel.locator('input[type="number"]').first();
  await firstInput.evaluate(input => {
    input.value = '6';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() =>
    window.Components.box.getPayload()?.config?.gridStyle?.thickness ?? null
  )).toBe(6);

  await firstPanel.locator('.shared-border-style-chip').dispatchEvent('mousedown', {
    altKey: true,
    button: 0,
    clientX: 160,
    bubbles: true
  });
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 168, bubbles: true })));
  await expect.poll(() => page.evaluate(() =>
    window.Components.box.getPayload()?.config?.gridStyle?.thickness ?? null
  )).toBe(6.25);
  await openGridPanel(secondTabId);
  const secondBefore = await page.evaluate(() =>
    window.Components.box.getPayload()?.config?.gridStyle?.thickness ?? null
  );
  expect(Number.isFinite(secondBefore)).toBe(true);

  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 176, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176, bubbles: true }));
  });
  await expect.poll(() => page.evaluate(([firstId, secondId]) => {
    const tabs = window.Main.session.workspaceState.tabs;
    return [firstId, secondId].map(id =>
      tabs.find(tab => tab.id === id)?.payload?.config?.gridStyle?.thickness ?? null
    );
  }, [firstTabId, secondTabId])).toEqual([6.25, secondBefore]);
});

test('Box symbol size drag cannot write through the reused panel into the next tab', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await page.locator('#boxGraphType').selectOption('bar');
  await page.locator('#boxPointMode').selectOption('overlay');
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { loadExample: true }
  );
  await page.locator('#boxGraphType').selectOption('bar');
  await page.locator('#boxPointMode').selectOption('overlay');
  const [firstTabId, secondTabId] = await page.evaluate(() =>
    window.Main.session.workspaceState.tabs.filter(tab => tab.type === 'box').map(tab => tab.id)
  );

  const openPointPanel = async tabId => {
    await page.evaluate(async id => window.Main.tabs.activateTab(id, { reason: 'e2e-symbol-drag-owner' }), tabId);
    await page.waitForFunction(id => window.Main.session.workspaceState.activeTabId === id, tabId);
    const point = page.locator('#boxSvg g[data-export-layer="box-points"] circle').first();
    await expect(point).toBeVisible();
    await point.dispatchEvent('click', { bubbles: true });
    const panel = page.locator('.box-point-controls');
    await expect(panel).toBeVisible();
    return panel;
  };
  const firstPanel = await openPointPanel(firstTabId);
  const traceIndex = await page.locator('#boxSvg g[data-export-layer="box-points"] circle').first().evaluate(node =>
    node.closest('g[data-trace]')?.getAttribute('data-trace') || node.getAttribute('data-trace')
  );
  const firstStylesBefore = await page.evaluate(() =>
    structuredClone(window.Components.box.getPayload()?.config?.pointStyles || {})
  );
  const firstSizeChip = firstPanel.locator('.shared-fill-style-chip');
  await firstSizeChip.dispatchEvent('mousedown', {
    altKey: true,
    button: 0,
    clientX: 160,
    bubbles: true
  });
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 168, bubbles: true })));
  const firstStyles = await page.evaluate(() =>
    structuredClone(window.Components.box.getPayload()?.config?.pointStyles || {})
  );
  expect(firstStyles).not.toEqual(firstStylesBefore);
  await openPointPanel(secondTabId);
  const secondStylesBefore = await page.evaluate(() =>
    structuredClone(window.Components.box.getPayload()?.config?.pointStyles || {})
  );

  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 176, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176, bubbles: true }));
  });
  const secondStylesAfter = await page.evaluate(() =>
    structuredClone(window.Components.box.getPayload()?.config?.pointStyles || {})
  );
  expect(secondStylesAfter).toEqual(secondStylesBefore);

  await page.evaluate(async id => window.Main.tabs.activateTab(id, { reason: 'e2e-symbol-drag-owner-return' }), firstTabId);
  await expect.poll(() => page.evaluate(([id, trace]) => {
    const tab = window.Main.session.workspaceState.tabs.find(item => item.id === id);
    return tab?.payload?.config?.pointStyles?.[trace]?.size ?? null;
  }, [firstTabId, traceIndex])).toBe(firstStyles?.[traceIndex]?.size ?? null);
});

test('legend border drag is cancelled when its font-controls owner changes', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = { type: 'roc', pageId: 'rocPage', exampleButtonId: 'rocLoadExample' };
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await openComponentFromWelcome(page, component, { loadExample: true });
  await page.waitForFunction(() => document.querySelectorAll(
    '#rocSvg [data-legend-viewport-content="true"] text'
  ).length > 0);
  const [firstTabId, secondTabId] = await page.evaluate(() =>
    window.Main.session.workspaceState.tabs.filter(tab => tab.type === 'roc').map(tab => tab.id)
  );

  await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-font-legend-drag-owner' }), firstTabId);
  const legendLabel = page.locator('#rocSvg [data-legend-viewport-content="true"] text').first();
  await legendLabel.click();
  const panel = page.locator('.font-toolbar-host--visible .font-controls-panel');
  await expect(panel).toBeVisible();
  const borderField = panel.locator('.font-controls-panel__field--legend-border');
  await expect(borderField).toBeVisible();
  const borderChip = borderField.locator('.shared-border-style-chip');
  const getOwnerStyles = tabId => page.evaluate(id =>
    window.Shared.fontControls.exportScopeStyles('roc', { tabId: id }), tabId
  );
  const firstBefore = await getOwnerStyles(firstTabId);

  await borderChip.dispatchEvent('mousedown', {
    altKey: true,
    button: 0,
    clientX: 160,
    bubbles: true
  });
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 168, bubbles: true })));
  const firstDuringDrag = await getOwnerStyles(firstTabId);
  expect(firstDuringDrag).not.toEqual(firstBefore);

  await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-font-legend-drag-switch' }), secondTabId);
  await expect(panel).toBeHidden();
  const secondBefore = await getOwnerStyles(secondTabId);
  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 184, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 184, bubbles: true }));
  });

  expect(await getOwnerStyles(firstTabId)).toEqual(firstDuringDrag);
  expect(await getOwnerStyles(secondTabId)).toEqual(secondBefore);
});

test('Heatmap dendrogram controls close when their owning tab deactivates', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => !!document.querySelector(
    '#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]'
  ));
  await clickSvgTarget(page,
    '#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]');

  const panel = page.locator('.dendrogram-controls-panel');
  await expect(panel).toHaveAttribute('data-open', '1');
  await expect(panel).toBeVisible();

  await openComponentFromWelcome(page, { type: 'heatmap', pageId: 'heatmapPage' });
  await expect(panel).toBeHidden();
  expect(issues.critical).toEqual([]);
});
