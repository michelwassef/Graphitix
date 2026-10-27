'use strict';

const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { launchChromiumAtBrowserZoom } = require('../helpers/actualBrowserZoom');
const CONTROL_PANEL_MIN_WIDTH = 300;
const CONTROL_PANEL_MAX_WIDTH = 600;

async function openExample(page, component, url = '/index.html') {
  await installLocalCdnOverrides(page);
  await page.goto(url);
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, { requirePublished: true, requireIdle: true });
}

async function measureLayout(page, type) {
  return page.evaluate(componentType => {
    const tab = window.Main.session.getActiveTab();
    const root = window.Shared.workspaceTabs.getMountedRoot(tab.id, componentType);
    const pane = root.querySelector('.workspace-graph-panel');
    const divider = pane.parentElement.querySelector('.panel-resizer');
    const content = pane.querySelector('.workspace-graph-content');
    const track = content.querySelector('.workspace-graph-track');
    const row = pane.querySelector('.diagram-area');
    const region = row.querySelector('.workspace-plot-region');
    const controls = row.querySelector('.config-panel');
    const stats = pane.querySelector('.statistics-panel-container');
    const frame = region.querySelector('.graph-frame');
    const footer = region.querySelector('.graph-export-controls');
    const box = region.querySelector('.svgbox');
    const svg = box.querySelector('svg');
    const rect = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const visibleStats = stats && stats.getBoundingClientRect().height > 0;
    const escapedControls = [...controls.querySelectorAll('fieldset, select, input, button')].filter(node => {
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      if (!r.width || !r.height || s.visibility === 'hidden' || node.closest('[hidden]')) return false;
      const bounds = controls.getBoundingClientRect();
      return r.left < bounds.left - 1 || r.right > bounds.right + 1;
    }).map(node => node.id || node.tagName);
    const detachedCheckboxLabels = [...controls.querySelectorAll('label')].filter(label => {
      const input = label.querySelector(':scope > input[type=checkbox], :scope > input[type=radio]');
      const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (!input || !text || !input.getBoundingClientRect().width) return false;
      const range = document.createRange();
      range.setStart(text, text.textContent.search(/\S/));
      range.setEnd(text, text.textContent.trimEnd().length);
      const firstLine = range.getClientRects()[0];
      const checkbox = input.getBoundingClientRect();
      return firstLine && (firstLine.left < checkbox.right - 1 || Math.abs(firstLine.top - checkbox.top) > 4);
    }).map(label => label.textContent.trim());
    return {
      pane: rect(pane), row: rect(row), region: rect(region), controls: rect(controls),
      track: rect(track), stats: visibleStats ? rect(stats) : null, frame: rect(frame), footer: rect(footer),
      box: rect(box),
      paneLeadingGap: pane.getBoundingClientRect().left - divider.getBoundingClientRect().right,
      dividerMarginRight: divider ? Number.parseFloat(getComputedStyle(divider).marginRight) || 0 : null,
      paneScrolls: content.scrollWidth > content.clientWidth + 1,
      graph: rect(box.querySelector('svg')),
      axisTickLabels: [...(svg?.querySelectorAll('text') || [])]
        .map(node => node.textContent.trim())
        .filter(Boolean),
      regionHasLocalScrollbar: ['auto', 'scroll'].includes(getComputedStyle(region).overflowX),
      availableControlsWidth: row.getBoundingClientRect().right - controls.getBoundingClientRect().left,
      columns: getComputedStyle(row).display === 'grid'
        ? getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length
        : 1,
      gap: Number.parseFloat(getComputedStyle(row).columnGap),
      canonical: { width: Number(box.dataset.graphWidthPx), height: Number(box.dataset.graphHeightPx) },
      presentation: {
        zoom: box.dataset.resizerZoomLevel || box.dataset.resizerZoom || null,
        contentEnvelope: box.dataset.graphContentEnvelope || null,
        svgViewBox: svg?.getAttribute('viewBox') || null
      },
      escapedControls, detachedCheckboxLabels
    };
  }, type);
}

function expectLayout(m) {
  expect(m.regionHasLocalScrollbar, 'the plot region must not create a local horizontal scrollbar').toBe(false);
  expect(m.escapedControls, 'controls must fit their panel').toEqual([]);
  expect(m.detachedCheckboxLabels, 'checkboxes must stay beside the first line of their labels').toEqual([]);
  expect(m.row.right).toBeLessThanOrEqual(m.track.right + 1);
  expect(Math.abs(m.frame.left - m.footer.left), 'export footer stays attached to the figure').toBeLessThanOrEqual(1);
  expect(m.region.width).toBeGreaterThan(0);
  expect(m.graph, 'the published figure must be present').not.toBeNull();
  expect(m.graph.width).toBeGreaterThan(0);
  expect(Math.abs(m.paneLeadingGap - m.dividerMarginRight), 'the divider margin alone separates the input and graph').toBeLessThanOrEqual(1);
  if (m.stats) {
    expect(Math.abs(m.stats.left - m.row.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.stats.right - m.track.right), 'Statistics spans the complete right-pane content width').toBeLessThanOrEqual(1);
    expect(m.stats.top).toBeGreaterThanOrEqual(m.row.bottom - 1);
  }
  if (m.columns === 2) {
    expect(m.region.right).toBeLessThan(m.controls.left);
    expect(Math.abs(m.region.top - m.controls.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.controls.bottom - m.row.bottom), 'controls fill the graph-and-notes row height').toBeLessThanOrEqual(1);
    expect(m.controls.width).toBeGreaterThanOrEqual(CONTROL_PANEL_MIN_WIDTH);
    expect(m.controls.left - m.region.right, 'controls stay beside the figure').toBeLessThanOrEqual(m.gap + 1);
    expect(m.controls.width).toBeLessThanOrEqual(CONTROL_PANEL_MAX_WIDTH);
    if (m.availableControlsWidth > CONTROL_PANEL_MAX_WIDTH + 1) {
      expect(m.controls.width).toBeCloseTo(CONTROL_PANEL_MAX_WIDTH, 0);
      expect(m.row.right - m.controls.right, 'very wide layouts leave space after the capped controls').toBeGreaterThan(1);
    } else {
      expect(Math.abs(m.row.right - m.controls.right)).toBeLessThanOrEqual(1);
    }
  } else {
    expect(m.controls.top).toBeGreaterThanOrEqual(m.region.bottom);
  }
}

async function settledLayout(page, type) {
  await waitForComponentOwnerReady(page, type, { requirePublished: true, requireIdle: true });
  await page.waitForFunction(componentType => {
    const tab = window.Main.session.getActiveTab();
    const root = window.Shared.workspaceTabs.getMountedRoot(tab.id, componentType);
    return root.querySelector('.workspace-plot-region .svgbox svg')?.getBoundingClientRect().width > 0;
  }, type);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return measureLayout(page, type);
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type}: shared workspace aligns controls and Statistics through resize and oversized figures`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 2048, height: 1152 });
    await openExample(page, component);
    const initial = await settledLayout(page, component.type);
    expect(initial.columns).toBe(2);
    for (const width of [2048, 1440, 1366, 1280, 1024, 800]) {
      await page.setViewportSize({ width, height: 1152 });
      const layout = await settledLayout(page, component.type);
      expectLayout(layout);
      expect(layout.canonical).toEqual(initial.canonical);
      expect(layout.columns, `${component.type}: keep controls alongside figures on laptop viewports`).toBe(width >= 1024 ? 2 : 1);
      await testInfo.attach(`${component.type}-${width}-layout`, { body: JSON.stringify(layout), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath(`${component.type}-${width}.png`) });
    }

    await page.setViewportSize({ width: 2048, height: 1152 });
    const root = page.locator(`#${component.pageId}:not([hidden])`);
    const wide = await settledLayout(page, component.type);
    expectLayout(wide);
    expect(wide.track.width).toBeLessThanOrEqual(wide.pane.width + 1);
    expect(wide.columns).toBe(2);
    expect(wide.controls.width).toBeCloseTo(CONTROL_PANEL_MAX_WIDTH, 0);
    const shrinkBy = Math.min(80, Math.floor((wide.controls.width - CONTROL_PANEL_MIN_WIDTH) / 2));
    expect(shrinkBy).toBeGreaterThan(20);
    const controlPanelRightSlack = Math.max(0, wide.row.right - wide.controls.right);
    const intermediateWidth = Math.round(wide.canonical.width + controlPanelRightSlack + shrinkBy);
    expect(intermediateWidth).toBeGreaterThan(wide.canonical.width + 20);
    const setGraphWidth = async width => {
      await root.locator('.resizer-options-summary').click();
      const widthInput = root.getByRole('spinbutton', { name: 'Graph width in pixels', exact: true });
      await widthInput.fill(String(width));
      await widthInput.press('Enter');
      await root.locator('.resizer-options-summary').click();
      await root.locator('.resizer-zoom-actual').click();
      await expect.poll(async () => (await measureLayout(page, component.type)).canonical.width).toBe(width);
    };
    await setGraphWidth(intermediateWidth);
    const narrowing = await settledLayout(page, component.type);
    expectLayout(narrowing);
    expect(narrowing.controls.width).toBeLessThan(wide.controls.width - 20);
    expect(narrowing.controls.width, JSON.stringify({ intermediateWidth, wide, narrowing }))
      .toBeGreaterThan(CONTROL_PANEL_MIN_WIDTH);
    expect(narrowing.paneScrolls).toBe(false);
    expect(narrowing.track.width).toBeLessThanOrEqual(narrowing.pane.width + 1);
    await testInfo.attach(`${component.type}-width-transition`, {
      body: JSON.stringify({ wide, narrowing }),
      contentType: 'application/json'
    });
    await page.screenshot({ path: testInfo.outputPath(`${component.type}-controls-narrowed.png`) });
    await setGraphWidth(1400);
    const oversized = await settledLayout(page, component.type);
    expectLayout(oversized);
    expect(oversized.paneScrolls).toBe(true);
    expect(oversized.regionHasLocalScrollbar).toBe(false);
    expect(oversized.track.width).toBeGreaterThan(oversized.pane.width + 1);
    expect(oversized.controls.width).toBeCloseTo(CONTROL_PANEL_MIN_WIDTH, 0);
    const content = root.locator('.workspace-graph-content');
    await content.focus();
    await content.press('ArrowRight');
    await expect.poll(() => content.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
    await content.evaluate(node => { node.scrollLeft = 0; });
    await page.screenshot({ path: testInfo.outputPath(`${component.type}-oversized.png`) });
  });
}

for (const type of ['hist', 'scatter']) {
  test(`${type}: shared workspace follows real browser zoom`, async ({}, testInfo) => {
    test.setTimeout(90_000);
    const browser = await launchChromiumAtBrowserZoom({ width: 1440, height: 1000 });
    try {
      const component = COMPONENT_CATALOG.find(item => item.type === type);
      await openExample(browser.page, component, `${testInfo.project.use.baseURL}/index.html`);
      const initial = await settledLayout(browser.page, type);
      for (const zoom of [0.5, 0.67, 1, 1.25, 2]) {
        await browser.setZoom(zoom);
        const layout = await settledLayout(browser.page, type);
        expectLayout(layout);
        expect(layout.canonical).toEqual(initial.canonical);
        if (zoom === 0.5) {
          expect(layout.availableControlsWidth).toBeGreaterThan(CONTROL_PANEL_MAX_WIDTH + 1);
          expect(layout.controls.width).toBeCloseTo(CONTROL_PANEL_MAX_WIDTH, 0);
          expect(layout.row.right - layout.controls.right).toBeGreaterThan(1);
        }
        await browser.page.screenshot({ path: testInfo.outputPath(`${type}-zoom-${zoom}.png`) });
      }
    } finally {
      await browser.close();
    }
  });
}

test('pca: corner resize keeps the figure and right pane moving forward', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const component = COMPONENT_CATALOG.find(item => item.type === 'pca');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openExample(page, component);
  const samples = [await settledLayout(page, 'pca')];
  for (let step = 0; step < 9; step += 1) {
    const handle = page.locator(`#${component.pageId}:not([hidden]) .workspace-plot-region .svgbox .resizer-corner`).first();
    const bounds = await handle.boundingBox();
    expect(bounds, 'the graph corner resize handle is visible').not.toBeNull();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + Math.min(40, bounds.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 40, { steps: 4 });
    await page.mouse.up();
    await waitForComponentOwnerReady(page, 'pca', { requirePublished: true, requireIdle: true });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    samples.push(await measureLayout(page, 'pca'));
  }
  const transitions = samples.slice(1).map((item, index) => ({
    frameDelta: item.frame.width - samples[index].frame.width,
    boxDelta: item.box.width - samples[index].box.width,
    graphDelta: item.graph.width - samples[index].graph.width,
    trackDelta: item.track.width - samples[index].track.width,
    controlsDelta: item.controls.width - samples[index].controls.width,
    canonicalWidthDelta: item.canonical.width - samples[index].canonical.width,
    canonicalHeightDelta: item.canonical.height - samples[index].canonical.height
  }));
  await testInfo.attach('pca-corner-resize-sequence', {
    body: JSON.stringify({ samples, transitions }), contentType: 'application/json'
  });
  await page.screenshot({ path: testInfo.outputPath('pca-corner-resize.png') });
  for (let index = 1; index < samples.length; index += 1) {
    expectLayout(samples[index]);
    expect(samples[index].canonical.width, JSON.stringify(transitions)).toBeGreaterThan(samples[index - 1].canonical.width);
    expect(samples[index].canonical.height, JSON.stringify(transitions)).toBeGreaterThan(samples[index - 1].canonical.height);
    expect(samples[index].frame.width, JSON.stringify(transitions)).toBeGreaterThan(samples[index - 1].frame.width);
    expect(samples[index].box.width, JSON.stringify(transitions)).toBeGreaterThan(samples[index - 1].box.width);
    expect(transitions[index - 1].frameDelta, 'content margins should not jump during a steady corner drag')
      .toBeLessThan(60);
    expect(samples[index].track.width)
      .toBeGreaterThanOrEqual(samples[index - 1].track.width - 1);
    expect(samples[index].controls.width).toBeGreaterThanOrEqual(CONTROL_PANEL_MIN_WIDTH - 1);
    if (samples[index].track.width > samples[index].pane.width + 1) {
      expect(samples[index].paneScrolls, 'oversized graph content scrolls at the right-pane edge').toBe(true);
    }
    expect(samples[index].axisTickLabels.join(' '), 'PCA should not display floating point residue as a tick')
      .not.toMatch(/(?:×|x)\s*10\s*[−-]\s*17|e-17/i);
  }
});
