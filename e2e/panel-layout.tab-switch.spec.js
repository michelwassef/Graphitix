const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

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

    const draggedWidth = await page.evaluate(({ table }) => (
      document.getElementById(table)?.getBoundingClientRect?.().width || 0
    ), ids);
    expect(draggedWidth).toBeGreaterThan(before.tableWidth + 100);
    const tabId = before.tabId;

    await page.locator('#workspaceTabsList .workspace-tab').filter({ hasText: 'Welcome' }).first().click();
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click();

    await expect.poll(() => page.evaluate(({ table, tabId }) => {
      const active = window.Main?.session?.workspaceState?.activeTabId || null;
      return active === tabId
        ? document.getElementById(table)?.getBoundingClientRect?.().width || 0
        : 0;
    }, { table: ids.table, tabId }), { timeout: 10_000 }).toBeCloseTo(draggedWidth, 0);
  });
}
