const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function controlPanelGeometry(page) {
  return page.evaluate(() => {
    const graphPanel = document.querySelector('#boxPage:not([hidden]) #boxGraphPanel');
    const diagram = graphPanel?.querySelector('.diagram-area');
    const controls = diagram?.querySelector('.config-panel');
    const stack = diagram?.querySelector('.box-plot-stack');
    const svgBox = diagram?.querySelector('.svgbox');
    const notes = stack?.querySelector('.shared-notes');
    const notesEditor = notes?.querySelector('[data-notes-editor="1"], textarea');
    const graphRect = graphPanel?.getBoundingClientRect();
    const diagramRect = diagram?.getBoundingClientRect();
    const controlsRect = controls?.getBoundingClientRect();
    const stackRect = stack?.getBoundingClientRect();
    const svgBoxRect = svgBox?.getBoundingClientRect();
    const notesRect = notes?.getBoundingClientRect();
    return {
      graphRight: graphRect?.right || 0,
      diagramWidth: diagramRect?.width || 0,
      controlsLeft: controlsRect?.left || 0,
      controlsRight: controlsRect?.right || 0,
      controlsWidth: controlsRect?.width || 0,
      controlsDisplay: controls ? getComputedStyle(controls).display : null,
      stackLeft: stackRect?.left || 0,
      stackWidth: stackRect?.width || 0,
      svgBoxWidth: svgBoxRect?.width || 0,
      notesWidth: notesRect?.width || 0,
      notesHeight: notesRect?.height || 0,
      notesOpen: notes?.open === true,
      notesFontSizePx: notesEditor ? Number.parseFloat(getComputedStyle(notesEditor).fontSize) : 0,
      graphScrollLeft: graphPanel?.scrollLeft || 0,
      graphScrollWidth: graphPanel?.scrollWidth || 0,
      graphClientWidth: graphPanel?.clientWidth || 0
    };
  });
}

test('Box example loading keeps the graph controls visible', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  const before = await controlPanelGeometry(page);
  expect(before.controlsDisplay).not.toBe('none');
  expect(before.controlsRight).toBeLessThanOrEqual(before.graphRight + 1);

  await page.locator('#boxLoadExample').click();
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot svg circle').length > 0);
  await expect.poll(() => controlPanelGeometry(page)).toMatchObject({ controlsDisplay: 'flex' });

  const after = await controlPanelGeometry(page);
  expect(after.controlsWidth).toBeGreaterThan(0);
  expect(after.controlsLeft).toBeGreaterThanOrEqual(0);
  expect(after.controlsRight).toBeLessThanOrEqual(after.graphRight + 1);
  // The stack includes the outward content envelope around the canonical SVG box.
  expect(after.stackWidth).toBeGreaterThanOrEqual(after.svgBoxWidth - 1);
  expect(after.notesOpen).toBe(true);
  expect(Math.abs(after.notesWidth - after.stackWidth)).toBeLessThanOrEqual(1);
  expect(after.notesHeight).toBeGreaterThan(before.notesHeight);
  expect(after.notesFontSizePx).toBeCloseTo(40 / 3, 1);
  expect(after.graphScrollLeft).toBe(0);
  expect(issues.critical).toEqual([]);
});

test('Box notes track the resized SVG container width', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot svg circle').length > 0);

  const before = await controlPanelGeometry(page);
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-vertical').first();
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => {
    const metrics = await controlPanelGeometry(page);
    return metrics.stackWidth > before.stackWidth + 40
      && Math.abs(metrics.notesWidth - metrics.stackWidth) <= 1;
  }).toBe(true);

  expect(issues.critical).toEqual([]);
});
