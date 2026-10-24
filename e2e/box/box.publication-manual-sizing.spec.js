const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');

async function inspect(page) {
  return page.evaluate(() => {
    const tab = window.Main.session.getActiveTab();
    const root = Shared.workspaceTabs.getMountedRoot(tab.id, 'box');
    const box = root.querySelector('.svgbox');
    const svg = root.querySelector('#boxPlot svg');
    const payload = window.Components.box.getPayload({ tabId: tab.id });
    const axes = ['x', 'y'].map(key => {
      const line = svg.querySelector(`line[data-box-primary-axis="${key}"]`);
      return Math.hypot(line.x2.baseVal.value - line.x1.baseVal.value, line.y2.baseVal.value - line.y1.baseVal.value);
    });
    const bounds = svg.getBBox();
    const viewBox = svg.viewBox.baseVal;
    // Spare grid rows may be materialized as [] or as empty cells on hydration.
    const data = payload.data.slice();
    while (data.length && data.at(-1).every(value => value == null || value === '')) data.pop();
    return {
      frame: [Number(box.dataset.resizerBaseWidth), Number(box.dataset.resizerBaseHeight)],
      defaults: [Number(box.dataset.resizerDefaultWidth), Number(box.dataset.resizerDefaultHeight)],
      axes,
      blankRight: viewBox.x + viewBox.width - bounds.x - bounds.width,
      radii: [...new Set(Array.from(svg.querySelectorAll('[data-point-size]:not([data-point-proxy="1"]):not([data-box-point-hit-mask="1"])'), point => Number(point.dataset.pointSize) / 2))],
      baseline: payload.layout.boxGeometry.graphGeometry.pointSizing,
      data,
      spacing: payload.config.axis.datasetSpacing.x,
      stroke: payload.config.axis.strokeWidth,
      renderedStrokes: ['x', 'y'].map(key => parseFloat(getComputedStyle(svg.querySelector(`line[data-box-primary-axis="${key}"]`)).strokeWidth))
    };
  });
}

async function settle(page) {
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requirePublished: true, requireIdle: true });
  let previous;
  let count = 0;
  await expect.poll(async () => {
    const key = JSON.stringify(await inspect(page));
    count = key === previous ? count + 1 : 0;
    previous = key;
    return count;
  }, { intervals: [250], timeout: 15000 }).toBeGreaterThanOrEqual(3);
  return inspect(page);
}

async function fresh(page) {
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
  await settle(page);
  await page.locator('#boxPage').getByRole('button', { name: 'View graph at actual size', exact: true }).click();
  return settle(page);
}

async function change(page, selector, value) {
  await page.locator(selector).evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await settle(page);
}

test('publication sizing matches manual axes and symbols, preserves baseline through undo and reopen', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await installLocalCdnOverrides(page);
  const before = await fresh(page);
  await page.locator('#boxPage [data-publication-style-select]').selectOption('npg_single');
  await page.locator('#boxPage [data-publication-style-apply]').click();
  const preset = await settle(page);
  expect(preset.frame).toEqual([336, 300]);
  expect(preset.spacing).toBe(before.spacing);
  expect(preset.blankRight).toBeLessThan(15);
  expect(preset.baseline).toEqual(before.baseline);
  expect(preset.defaults).toEqual(before.defaults);
  expect(preset.data).toEqual(before.data);

  await page.evaluate(() => Shared.undoManager.undo());
  const undone = await settle(page);
  expect(undone.frame).toEqual(before.frame);
  expect(undone.stroke).toBe(before.stroke);
  expect(undone.baseline).toEqual(before.baseline);
  expect(undone.radii).toEqual(before.radii);
  await page.evaluate(() => Shared.undoManager.redo());
  const redone = await settle(page);
  expect(redone.frame).toEqual(preset.frame);
  expect(redone.baseline).toEqual(preset.baseline);
  expect(redone.radii).toEqual(preset.radii);
  expect(redone.stroke).toBe(preset.stroke);

  const ownerId = await page.evaluate(() => window.Main.session.getActiveTab().id);
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { loadExample: true });
  const sibling = await settle(page);
  expect(sibling.frame).toEqual(before.defaults);
  await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'publication-sizing-owner-return' }), ownerId);
  const returned = await settle(page);
  expect(returned.frame).toEqual(preset.frame);
  expect(returned.baseline).toEqual(preset.baseline);
  expect(returned.radii).toEqual(preset.radii);
  expect(returned.stroke).toBe(preset.stroke);

  const archive = await buildWorkspaceArchive(page);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'box' });
  const reopened = await settle(page);
  expect(reopened.frame).toEqual(preset.frame);
  expect(reopened.baseline).toEqual(preset.baseline);
  expect(reopened.radii).toEqual(preset.radii);
  expect(reopened.stroke).toBe(preset.stroke);
  expect(reopened.data).toEqual(preset.data);

  await fresh(page);
  await change(page, '#boxPage #boxFontSize', 7);
  for (const key of ['x', 'y']) {
    await page.locator(`#boxPage [data-axis-control="1"][data-axis-key="${key}"]`).first().dispatchEvent('click');
    await change(page, '.axis-controls-panel__field--style input[type="number"]', preset.stroke);
    await change(page, '.axis-controls-panel__input--length', Math.round(preset.axes[key === 'x' ? 0 : 1]));
  }
  const manual = await settle(page);
  expect(manual.baseline).toEqual(preset.baseline);
  expect(manual.radii).toEqual(preset.radii);
  expect(manual.blankRight).toBeLessThan(15);
  for (let i = 0; i < 2; i++) {
    expect(Math.abs(manual.axes[i] - preset.axes[i])).toBeLessThan(1);
    expect(Math.abs(manual.frame[i] - preset.frame[i])).toBeLessThanOrEqual(1);
  }
});

test('publisher axis weights reach their width-based targets on the rendered graph', async ({ page }) => {
  test.setTimeout(120000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await fresh(page);
  const cases = [
    ['npg_single', 0.3647540984], ['npg_15col_120', 0.4918032787],
    ['npg_15col_136', 0.5573770492], ['npg_double', 0.75],
    ['science_1col', 0.5], ['science_2col', 0.5], ['science_3col', 0.75],
    ['cell_press_single', 0.5], ['jcb_max', 0.75], ['jcs_full', 0.75],
    ['embo_single', 0.3625], ['embo_double', 0.75],
    ['jci_single', 0.5], ['jci_double', 0.75],
    ['plos_text', 0.567], ['plos_full', 0.567]
  ];
  for (const [id, points] of cases) {
    await page.locator('#boxPage [data-publication-style-select]').selectOption(id);
    await page.locator('#boxPage [data-publication-style-apply]').click();
    const state = await settle(page);
    expect(state.stroke * 72 / 96, id).toBeCloseTo(points, 6);
    for (const stroke of state.renderedStrokes) expect(stroke * 72 / 96, id).toBeCloseTo(points, 5);
  }
});
