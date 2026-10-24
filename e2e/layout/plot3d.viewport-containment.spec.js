const { selectReplicateMode } = require('../helpers/uiDriver');
const { test, expect } = require('@playwright/test');
const { readContainment, expectContained } = require('../helpers/plot3dContainment');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, clickExpectedExampleButton, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { saveWorkspaceArchive } = require('../helpers/archiveDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const CASES = [
  { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', viewModeId: 'scatterViewMode', tableFormatId: null, svg: '#scatterPage:not([hidden]) #scatterSvg' },
  { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample', viewModeId: 'lineViewMode', tableFormatId: 'lineTableFormat', svg: '#linePage:not([hidden]) #lineSvg' },
  { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample', viewModeId: 'pcaViewMode', tableFormatId: null, svg: '#pcaPage:not([hidden]) #pcaSvg' },
  { type: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample', viewModeId: null, tableFormatId: null, svg: '#surfacePage:not([hidden]) #surfaceSvg' }
];

async function select3d(page, component) {
  if (component.tableFormatId) {
    await selectReplicateMode(page, component.type, '3d');
  }
  if (component.viewModeId) {
    await page.locator(`#${component.viewModeId}`).selectOption('3d');
  }
}

async function readOuterLayout(page, selector, pageId) {
  return page.evaluate(({ svgSelector, rootId }) => {
    const svg = document.querySelector(svgSelector);
    const box = svg?.closest('.svgbox') || document.querySelector(`#${rootId}:not([hidden]) .svgbox`);
    const rect = box?.getBoundingClientRect?.();
    return rect ? { width: rect.width, height: rect.height } : null;
  }, { svgSelector: selector, rootId: pageId });
}

async function checkLegendGeometry(page, component) {
  const read = () => page.locator(component.svg).evaluate(svg => ({
    axes: Array.from(svg.querySelectorAll('[data-axis-line]')).map(node => ['x1', 'y1', 'x2', 'y2'].map(key => Number(node.getAttribute(key)))),
    points: Array.from(svg.querySelectorAll('[data-plot-point="1"], g[data-layer="points"] circle, g[data-layer="line-3d-series"] path, g.surface-faces polygon')).map(node => node.getAttribute('points') || node.getAttribute('d') || [node.getAttribute('cx'), node.getAttribute('cy')]),
    width: Number(svg.dataset.plot3dBaseWidth),
    height: Number(svg.dataset.plot3dBaseHeight)
  }));
  const toggle = async checked => {
    await page.locator(`#${component.pageId}:not([hidden]) #${component.type}ShowLegend`).evaluate((control, value) => {
      control.checked = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }, checked);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    await expect.poll(() => page.locator(component.svg).evaluate(svg => !!svg.querySelector('[data-legend-viewport-content="true"], g.surface-legend'))).toBe(checked);
  };
  await toggle(true);
  const visible = await read();
  expect(visible.axes).toHaveLength(3);
  expect(visible.points.length).toBeGreaterThan(0);
  await toggle(false);
  expect(await read(), `${component.type} hiding a legend must preserve projected geometry`).toEqual(visible);
  await toggle(true);
  expect(await read(), `${component.type} showing a legend must preserve projected geometry`).toEqual(visible);
}

for (const component of CASES) {
  test(`${component.type} 3D viewport contains labels after redraw and rotation`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, { type: component.type, pageId: component.pageId }, { first: true });
    await page.waitForFunction(type => !!window.Components?.[type]?.ready, component.type, { timeout: 30_000 });
    await select3d(page, component);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    const emptyLayout = await readOuterLayout(page, component.svg, component.pageId);
    await clickExpectedExampleButton(page, component.exampleButtonId);
    await page.waitForFunction(({ selector, type }) => {
      const svg = document.querySelector(selector);
      return !!svg && (type === 'surface' || svg.dataset?.viewMode === '3d');
    }, { selector: component.svg, type: component.type }, { timeout: 45_000 });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 45_000 });
    await checkLegendGeometry(page, component);
    const loadedLayout = await readOuterLayout(page, component.svg, component.pageId);
    expect(loadedLayout, `${component.type} loaded graph should have an outer layout`).not.toBeNull();
    expect(emptyLayout, `${component.type} empty graph should have an outer layout`).not.toBeNull();
    expect(loadedLayout.width, `${component.type} example data must not enlarge the outer graph width`).toBeLessThanOrEqual(emptyLayout.width + 8);
    expect(loadedLayout.height, `${component.type} example data must not enlarge the outer graph height`).toBeLessThanOrEqual(emptyLayout.height + 8);

    const initial = await readContainment(page, component.svg);
    expectContained(initial, `${component.type} initial`);
    await testInfo.attach('initial-geometry', { body: Buffer.from(JSON.stringify(initial, null, 2)), contentType: 'application/json' });
    await testInfo.attach('initial-graph', { body: await page.locator(`#${component.pageId}:not([hidden]) .graph-frame`).first().screenshot(), contentType: 'image/png' });
    const initialSignature = JSON.stringify({ view: initial.view, envelope: initial.envelope, reserves: initial.reserves });

    await page.evaluate(async () => {
      const active = window.Main?.session?.getActiveTab?.();
      const result = window.Main?.session?.persistActiveTabState?.(active, {
        reason: 'e2e-plot3d-cache-round-trip',
        origin: 'test'
      });
      if (result && typeof result.then === 'function') await result;
    });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 45_000 });
    const cacheResult = await page.evaluate(type => {
      const component = window.Components[type];
      const tabId = window.Main.session.getActiveTab().id;
      const cache = component.captureRenderCache({ tabId });
      if (!cache) return { captured: false };
      let obsoleteRejected = true;
      const previousLayoutVersion = window.Shared.plot3d.FRAME_LAYOUT_VERSION - 1;
      if (type !== 'surface') {
        obsoleteRejected = component.restoreRenderCache({ ...cache, rotationModel: { ...cache.rotationModel, version: previousLayoutVersion } }, { tabId }) === false;
      } else {
        obsoleteRejected = component.restoreRenderCache({ ...cache, __graphitixRenderCache: { ...cache.__graphitixRenderCache, frameLayoutVersion: previousLayoutVersion } }, { tabId }) === false;
      }
      return { captured: true, obsoleteRejected, restored: component.restoreRenderCache(cache, { tabId }) };
    }, component.type);
    expect(cacheResult).toEqual({ captured: true, obsoleteRejected: true, restored: true });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 45_000 });
    const cacheRestored = await readContainment(page, component.svg);
    expectContained(cacheRestored, `${component.type} cache-restored`);
    expect(JSON.stringify({ view: cacheRestored.view, envelope: cacheRestored.envelope, reserves: cacheRestored.reserves }), `${component.type} cache restore should preserve the authoritative viewport`).toBe(initialSignature);

    await clickExpectedExampleButton(page, component.exampleButtonId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 45_000 });
    const redrawn = await readContainment(page, component.svg);
    expectContained(redrawn, `${component.type} redrawn`);
    expect(JSON.stringify({ view: redrawn.view, envelope: redrawn.envelope, reserves: redrawn.reserves }), `${component.type} redraw should preserve the authoritative viewport`).toBe(initialSignature);

    const rotationTargets = [
      { x: 0.08, y: 0.12 },
      { x: 0.92, y: 0.12 },
      { x: 0.92, y: 0.88 },
      { x: 0.08, y: 0.88 }
    ];
    for (const target of rotationTargets) {
      const box = await page.locator(component.svg).boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * target.x, box.y + box.height * target.y, { steps: 8 });
      await page.mouse.up();
      await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
      const rotated = await readContainment(page, component.svg);
      expectContained(rotated, `${component.type} rotated at ${target.x},${target.y}`);
      expect(rotated.view, `${component.type} rotation should retain the authoritative viewport`).toEqual(redrawn.view);
    }
    await checkLegendGeometry(page, component);
    const beforeReopen = await readContainment(page, component.svg);
    const archivePath = testInfo.outputPath(`${component.type}-3d-frame.graph`);
    await saveWorkspaceArchive(page, archivePath, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE', reason: 'e2e-3d-legend-frame-reopen' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
    await waitForDocumentOpenComplete(page);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 45_000 });
    const reopened = await readContainment(page, component.svg);
    expectContained(reopened, `${component.type} reopened`);
    expect(reopened.view).toEqual(beforeReopen.view);
    // The resizer projects zoomed reserves to whole display pixels on restore.
    const displayPixels = envelope => envelope.map(value => Math.round(Number.parseFloat(value) || 0));
    expect(displayPixels(reopened.envelope)).toEqual(displayPixels(beforeReopen.envelope));
    await checkLegendGeometry(page, component);
    await testInfo.attach('rotated-graph', { body: await page.locator(`#${component.pageId}:not([hidden]) .graph-frame`).first().screenshot(), contentType: 'image/png' });
    expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
  });
}
