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
    await page.setViewportSize({ width: 1280, height: 900 });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await expect.poll(() => page.locator(`#${component.pageId} .wrap`).evaluate(wrap => getComputedStyle(wrap).flexDirection)).toBe('row');

    const ids = {
      table: component.type === 'venn' ? 'vennInputPanel' : `${component.type}TablePanel`,
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

    const readLiveGraph = () => page.evaluate(graph => {
      const panel = document.getElementById(graph);
      const panelRect = panel?.getBoundingClientRect?.();
      const candidates = Array.from(panel?.querySelectorAll?.('svg') || []);
      const visibleSvg = candidates.find(svg => {
        const rect = svg.getBoundingClientRect();
        const style = getComputedStyle(svg);
        return rect.width > 24 && rect.height > 24
          && style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity) > 0;
      });
      const marks = visibleSvg?.querySelectorAll?.('path, line, rect, circle, ellipse, polygon, polyline, text').length || 0;
      return {
        panelWidth: panelRect?.width || 0,
        svgVisible: !!visibleSvg,
        marks
      };
    }, ids.graph);

    const handle = page.locator(`#${ids.resizer}`);
    const handleBox = await handle.boundingBox();
    const y = handleBox.y + Math.max(2, handleBox.height / 2);
    await page.mouse.move(handleBox.x + handleBox.width / 2, y);
    await page.mouse.down();
    const liveGraph = [];
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(handleBox.x + handleBox.width / 2 + step * 22, y);
      liveGraph.push(await readLiveGraph());
    }
    await page.mouse.up();

    expect(liveGraph.every(frame => frame.svgVisible && frame.marks > 0)).toBe(true);
    expect(liveGraph.at(-1).panelWidth).toBeLessThan(before.graphWidth - 150);

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
    const savedSplit = await page.evaluate(ownerTabId => {
      const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === ownerTabId);
      return Number(tab?.layoutState?.workspace?.tableFraction);
    }, tabId);
    expect(savedSplit).toBeCloseTo(draggedGeometry.split, 2);

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
