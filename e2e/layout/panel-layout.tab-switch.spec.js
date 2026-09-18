const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

const COMPONENTS = [
  { type: 'scatter', pageId: 'scatterPage' },
  { type: 'line', pageId: 'linePage' },
  { type: 'box', pageId: 'boxPage' },
  { type: 'venn', pageId: 'vennPage' }
];

for (const component of COMPONENTS) {
  test(`${component.type} panel divider survives tab switching`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });

    const ids = {
      table: `${component.type}TablePanel`,
      graph: `${component.type}GraphPanel`,
      resizer: `${component.type}PanelResizer`
    };
    const before = await page.evaluate(({ table, graph, resizer }) => {
      const read = id => document.getElementById(id)?.getBoundingClientRect?.() || null;
      const tableRect = read(table);
      const graphRect = read(graph);
      const handleRect = read(resizer);
      return {
        tableWidth: tableRect?.width || 0,
        graphWidth: graphRect?.width || 0,
        handleX: handleRect?.x || 0,
        handleY: handleRect?.y || 0,
        tabId: window.Main?.session?.workspaceState?.activeTabId || null
      };
    }, ids);
    expect(before.tableWidth).toBeGreaterThan(0);
    expect(before.graphWidth).toBeGreaterThan(0);

    const handle = page.locator(`#${ids.resizer}`);
    const handleBox = await handle.boundingBox();
    const y = handleBox.y + Math.max(2, handleBox.height / 2);
    await page.mouse.move(handleBox.x + handleBox.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 220, y, { steps: 10 });
    await page.mouse.up();

    const draggedGeometry = await page.evaluate(({ table, graph }) => {
      const tableWidth = document.getElementById(table)?.getBoundingClientRect?.().width || 0;
      const graphWidth = document.getElementById(graph)?.getBoundingClientRect?.().width || 0;
      return {
        tableWidth,
        split: tableWidth + graphWidth > 0 ? tableWidth / (tableWidth + graphWidth) : 0
      };
    }, ids);
    expect(draggedGeometry.tableWidth).toBeGreaterThan(before.tableWidth + 100);
    expect(draggedGeometry.split).toBeGreaterThan(0);
    const tabId = before.tabId;

    await page.locator('#workspaceTabsList .workspace-tab').filter({ hasText: 'Welcome' }).first().click();
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click();

    await expect.poll(() => page.evaluate(({ table, graph, tabId }) => {
      const active = window.Main?.session?.workspaceState?.activeTabId || null;
      if (active !== tabId) return 0;
      const tableWidth = document.getElementById(table)?.getBoundingClientRect?.().width || 0;
      const graphWidth = document.getElementById(graph)?.getBoundingClientRect?.().width || 0;
      return tableWidth + graphWidth > 0 ? tableWidth / (tableWidth + graphWidth) : 0;
    }, { table: ids.table, graph: ids.graph, tabId }), { timeout: 10_000 }).toBeCloseTo(draggedGeometry.split, 2);
  });
}
