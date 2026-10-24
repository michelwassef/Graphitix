const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { clickExampleButton, activateTab } = require('../helpers/uiDriver');
const { getActiveTabId, waitForAnimationFrame, waitForComponentSnapshotReady } = require('../helpers/contractWaits');
const { getComponentByType } = require('../../test-support/componentCatalog');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');

const BOX = { type: 'box', pageId: 'boxPage' };
const HOST = '.font-toolbar-host[data-font-toolbar-scope="box"]';

async function openBox(page) {
  await openComponentFromWelcome(page, BOX, { first: true });
  await clickExampleButton(page, 'box');
  await page.locator('#boxGraphType').selectOption('violin');
  await page.waitForFunction(() => document.querySelector('#boxSvg [data-box-zero-reference="1"]')
    && window.Components.box.isIdleForSnapshot());
}

// Find a painted, exposed fill point: the bounding-box centre hits the inset.
async function clickTrace(page) {
  const trace = page.locator('#boxSvg [data-box-violin-density="1"]').first();
  await trace.scrollIntoViewIfNeeded();
  const point = await trace.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    for(let y = bounds.top + 1; y < bounds.bottom; y += 1) {
      for(let x = bounds.left + 1; x < bounds.right; x += 1) {
        if(document.elementFromPoint(x, y) === element) return { x, y };
      }
    }
    throw new Error('No exposed violin fill point');
  });
  await page.mouse.click(point.x, point.y);
}

async function clickReference(page) {
  const line = page.locator('#boxSvg [data-box-zero-reference="1"]').first();
  await line.scrollIntoViewIfNeeded();
  const bounds = await line.boundingBox();
  await page.mouse.click(bounds.x + bounds.width * 0.45, bounds.y + bounds.height / 2);
}

async function assertPanels(page, titles) {
  await expect.poll(() => page.locator(`${HOST} > .workspace-toolbar__panel:visible`)
    .evaluateAll(panels => panels.map(panel => panel.querySelector('.workspace-toolbar__panel-title')?.textContent)))
    .toEqual(titles);
  await waitForAnimationFrame(page, 3);
  const layout = await page.locator(HOST).evaluate(host => {
    const toolbar = host.closest('.workspace-toolbar').getBoundingClientRect();
    const panels = Array.from(host.children).filter(p => !p.hidden && getComputedStyle(p).display !== 'none');
    return {
      outside: panels.flatMap(panel => [panel, ...panel.querySelectorAll('input,select,button')])
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        .filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.top < toolbar.top - 1 || rect.bottom > toolbar.bottom + 1;
        }).map(node => node.className),
      empty: panels.filter(panel => !panel.querySelector('input,select,button')).length
    };
  });
  expect(layout).toEqual({ outside: [], empty: 0 });
}

for(const width of [1920, 1024]) {
  test(`Box toolbar transitions replace complete panels at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 1080 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    await openBox(page);
    for(let repetition = 0; repetition < 2; repetition++) {
      await clickTrace(page);
      await assertPanels(page, ['Trace']);
      await clickReference(page);
      await assertPanels(page, ['Line']);
      await clickTrace(page);
      await assertPanels(page, ['Trace']);
      await page.locator('#boxSvg [data-axis-control="1"]').first().click({ force: true });
      await expect(page.locator(`${HOST} .axis-controls-panel`)).toBeVisible();
      await clickReference(page);
      await assertPanels(page, ['Line']);
      await page.locator('#boxSvg text[data-font-editable="1"]').first().click({ force: true });
      await expect(page.locator(`${HOST} .font-controls-panel`)).toBeVisible();
      await clickReference(page);
      await assertPanels(page, ['Line']);
    }
    await page.locator('#boxShowGrid').check();
    await page.waitForFunction(() => window.Components.box.isIdleForSnapshot());
    await clickTrace(page);
    const grid = page.locator('#boxSvg path[data-grid-control="1"]:not([data-grid-hit-overlay])').first();
    const gridPoint = await grid.evaluate(path => {
      for(let distance = 1; distance < path.getTotalLength(); distance += 3) {
        const point = path.getPointAtLength(distance).matrixTransform(path.getScreenCTM());
        if(document.elementFromPoint(point.x, point.y)?.closest('[data-grid-control="1"]')) {
          return { x: point.x, y: point.y };
        }
      }
      throw new Error('No exposed grid point');
    });
    await page.mouse.click(gridPoint.x, gridPoint.y);
    await assertPanels(page, ['Grid']);
    await clickReference(page);
    await assertPanels(page, ['Line']);
    // Combined Symbol + Trace remains intentional and fits the same toolbar.
    await page.locator('#boxPointMode').selectOption('overlay');
    await page.waitForFunction(() => window.Components.box.isIdleForSnapshot());
    await clickTrace(page);
    await assertPanels(page, ['Symbol', 'Trace']);
    await clickReference(page);
    await assertPanels(page, ['Line']);
    // Constrain only the toolbar to exercise the shared overflow rail.
    await page.addStyleTag({ content: '#boxPage .workspace-toolbar{width:400px;max-width:400px}' });
    await clickTrace(page);
    await assertPanels(page, ['Symbol', 'Trace']);
    await clickReference(page);
    await assertPanels(page, ['Line']);
    await expect(page.locator('#boxPage .workspace-toolbar__section--active [data-toolbar-overflow-shell="1"]'))
      .toHaveAttribute('data-toolbar-overflow', '1');
  });
}

test('Box toolbar replacement keeps reference edits through tab switching and reopen', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openBox(page);
  const firstId = await getActiveTabId(page);
  await clickTrace(page);
  await clickReference(page);
  await assertPanels(page, ['Line']);
  const pattern = page.locator(`${HOST} .additional-line-controls-panel select`).last();
  await pattern.selectOption('dashed');
  await page.waitForFunction(() => window.Components.box.isIdleForSnapshot());
  await openComponentFromWelcome(page, BOX, { first: false });
  await clickExampleButton(page, 'box');
  await page.locator('#boxGraphType').selectOption('violin');
  await page.waitForFunction(() => window.Components.box.isIdleForSnapshot());
  const secondId = await getActiveTabId(page);
  await clickReference(page);
  await assertPanels(page, ['Line']);
  await expect(pattern).toHaveValue('dotted');
  await activateTab(page, firstId, 'box');
  await clickReference(page);
  await assertPanels(page, ['Line']);
  await expect(pattern).toHaveValue('dashed');
  await activateTab(page, secondId, 'box');
  await clickReference(page);
  await expect(pattern).toHaveValue('dotted');
  const archive = await buildWorkspaceArchive(page);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'box' });
  const reopenedIds = await page.evaluate(() => window.Main.session.workspaceState.tabs
    .filter(tab => tab.type === 'box').map(tab => tab.id));
  expect(reopenedIds).toHaveLength(2);
  for(const [index, value] of ['dashed', 'dotted'].entries()) {
    await activateTab(page, reopenedIds[index], 'box');
    await waitForComponentSnapshotReady(page, 'box');
    await waitForAnimationFrame(page, 3);
    const referenceBinding = await page.locator('#boxSvg [data-box-zero-reference="1"]').first().evaluate(line => ({
      owner: line.ownerSVGElement.dataset.workspaceTabId,
      registered: line.dataset.additionalLineControl,
      axis: line.dataset.additionalLineAxis,
      index: line.dataset.additionalLineIndex,
      hasHandler: typeof line.__additionalLineControlHandler === 'function',
      hasConfig: !!line.__additionalLineControlConfig
    }));
    await testInfo.attach(`reopened-reference-binding-${index}.json`, {
      body: Buffer.from(JSON.stringify(referenceBinding)), contentType: 'application/json'
    });
    expect(referenceBinding.axis).toBe('y');
    expect(referenceBinding.index).toMatch(/^\d+$/);
    expect(referenceBinding.hasHandler).toBe(true);
    expect(referenceBinding.hasConfig).toBe(true);
    await clickTrace(page);
    await assertPanels(page, ['Trace']);
    await clickReference(page);
    await assertPanels(page, ['Line']);
    await expect(pattern).toHaveValue(value);
  }
});

for(const type of ['line', 'scatter']) {
  test(`${type} reference-line controls rebind after archive reopen`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    const component = getComponentByType(type);
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentSnapshotReady(page, type);
    const root = page.locator(`#${component.pageId}:not([hidden])`);
    await root.locator('svg [data-axis-control="1"][data-axis-key="y"]:visible').first().click({ force: true });
    const axisPanel = root.locator('.axis-controls-panel');
    const additionalTicks = axisPanel.getByRole('button', { name: 'Additional ticks/lines' });
    await expect(additionalTicks).toBeVisible();
    await additionalTicks.click();
    await axisPanel.locator('.axis-controls-panel__button--add-extra').click();
    const yTicks = await root.locator('svg text[data-font-role="yTick"]').evaluateAll(nodes => nodes
      .map(node => Number(String(node.textContent || '').replace(/,/g, '')))
      .filter(Number.isFinite)
      .sort((a, b) => a - b));
    expect(yTicks.length).toBeGreaterThan(1);
    const middleTick = Math.floor((yTicks.length - 1) / 2);
    const referenceValue = (yTicks[middleTick] + yTicks[middleTick + 1]) / 2;
    const referenceValueInput = axisPanel.locator('.axis-controls-panel__extra-input--value').last();
    await referenceValueInput.fill(String(referenceValue));
    await referenceValueInput.dispatchEvent('change');
    await page.waitForFunction(type => window.Components[type].isIdleForSnapshot(), type);
    const reference = root.locator('svg [data-additional-line-control="1"]:not([data-additional-line-overlay="1"])').first();
    await expect(reference).toHaveAttribute('data-additional-line-axis', 'y');
    await reference.click({ force: true });
    const pattern = page.locator('.additional-line-controls-panel[data-open="1"] select').last();
    await expect(pattern).toBeVisible();
    await pattern.selectOption('dashed');
    await page.waitForFunction(type => window.Components[type].isIdleForSnapshot(), type);

    const archive = await buildWorkspaceArchive(page);
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: type });
    const reopenedId = await page.evaluate(type => window.Main.session.workspaceState.tabs
      .find(tab => tab.type === type)?.id || null, type);
    expect(reopenedId).toBeTruthy();
    await activateTab(page, reopenedId, type);
    await waitForComponentSnapshotReady(page, type);
    const restoredReference = root.locator('svg [data-additional-line-control="1"]:not([data-additional-line-overlay="1"])').first();
    await expect(restoredReference).toHaveAttribute('data-additional-line-axis', 'y');
    await restoredReference.click({ force: true });
    await expect(pattern).toHaveValue('dashed');
  });
}

for(const type of ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie']) {
  test(`${type} graph font and axis toolbar transitions replace complete panels`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    const component = getComponentByType(type);
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentSnapshotReady(page, type);
    const root = page.locator(`#${component.pageId}`);
    const font = root.locator('svg text[data-font-editable="1"]:visible').first();
    await expect(font).toBeVisible();
    const axis = root.locator('svg [data-axis-control="1"]:visible').first();
    const hasAxis = await axis.count() > 0;
    for(let repetition = 0; repetition < 2; repetition++) {
      await font.click({ force: true });
      const host = root.locator('.font-toolbar-host--visible');
      await expect(host.locator('.font-controls-panel[data-open="1"]')).toBeVisible();
      await expect(host.locator('.workspace-toolbar__panel--symbol')).toHaveCount(0);
      if(hasAxis) {
        await axis.click({ force: true });
        await expect(host.locator('.axis-controls-panel[data-open="1"]')).toBeVisible();
        await expect(host.locator('.font-controls-panel')).toHaveCount(0);
      }
    }
    await testInfo.attach('transitions.json', {
      body: Buffer.from(JSON.stringify({ type, font: true, axis: hasAxis, repetitions: 2 })),
      contentType: 'application/json'
    });
  });
}

test('Heatmap palette, font and dendrogram transitions replace complete panels', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, getComponentByType('heatmap'), { first: true, loadExample: true });
  await waitForComponentSnapshotReady(page, 'heatmap');
  const root = page.locator('#heatmapPage');
  const host = root.locator('.font-toolbar-host');
  const cell = root.locator('svg [data-export-layer="heatmap-cells"] rect, svg [data-layer="cells"] rect').first();
  const dendrogram = root.locator('svg [data-dendrogram-control="1"]').first();
  const font = root.locator('svg text[data-font-editable="1"]').first();
  await expect(cell).toBeVisible();
  await expect(dendrogram).toBeVisible();
  for(let repetition = 0; repetition < 2; repetition++) {
    await cell.click({ force: true });
    await expect(host.locator('.heatmap-palette-controls-panel')).toBeVisible();
    await font.click({ force: true });
    await expect(host.locator('.font-controls-panel')).toBeVisible();
    await expect(host.locator('.heatmap-palette-controls-panel')).toHaveCount(0);
    await cell.click({ force: true });
    await expect(host.locator('.heatmap-palette-controls-panel')).toBeVisible();
    await expect(host.locator('.font-controls-panel')).toHaveCount(0);
    await dendrogram.click({ force: true });
    await expect(host.locator('.dendrogram-controls-panel')).toBeVisible();
    await expect(host.locator('.heatmap-palette-controls-panel')).toHaveCount(0);
    await expect(host.locator('.font-controls-panel')).toHaveCount(0);
  }
});
