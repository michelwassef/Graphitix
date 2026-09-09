const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const CASES = [
  { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', viewModeId: 'scatterViewMode', tableFormatId: null, svg: '#scatterPage:not([hidden]) #scatterSvg' },
  { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample', viewModeId: 'lineViewMode', tableFormatId: 'lineTableFormat', svg: '#linePage:not([hidden]) #lineSvg' },
  { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample', viewModeId: 'pcaViewMode', tableFormatId: null, svg: '#pcaPage:not([hidden]) #pcaSvg' },
  { type: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample', viewModeId: null, tableFormatId: null, svg: '#surfacePage:not([hidden]) #surfaceSvg' }
];

async function select3d(page, component) {
  if (component.tableFormatId) {
    await page.locator(`#${component.tableFormatId}`).selectOption('3d');
  }
  if (component.viewModeId) {
    await page.locator(`#${component.viewModeId}`).selectOption('3d');
  }
}

async function readContainment(page, selector) {
  return page.evaluate(svgSelector => {
    const svg = document.querySelector(svgSelector);
    if (!svg) return null;
    const view = String(svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
    const inverse = svg.getScreenCTM?.()?.inverse?.() || null;
    const toSvgPoint = (x, y) => {
      if (!inverse) return null;
      const point = svg.createSVGPoint?.();
      if (!point) return null;
      point.x = x;
      point.y = y;
      return point.matrixTransform(inverse);
    };
    const renderedNodes = Array.from(svg.querySelectorAll('text, line, circle, ellipse, path, polygon, polyline, rect'))
      .filter(node => !node.closest('defs'))
      .map(node => {
        const rect = node.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return null;
        const points = [
          toSvgPoint(rect.left, rect.top),
          toSvgPoint(rect.right, rect.top),
          toSvgPoint(rect.left, rect.bottom),
          toSvgPoint(rect.right, rect.bottom)
        ].filter(Boolean);
        if (points.length !== 4) return null;
        return {
          left: Math.min(...points.map(point => point.x)),
          top: Math.min(...points.map(point => point.y)),
          right: Math.max(...points.map(point => point.x)),
          bottom: Math.max(...points.map(point => point.y))
        };
      })
      .filter(Boolean);
    const content = renderedNodes.reduce((bounds, rect) => ({
      left: Math.min(bounds.left, rect.left),
      top: Math.min(bounds.top, rect.top),
      right: Math.max(bounds.right, rect.right),
      bottom: Math.max(bounds.bottom, rect.bottom)
    }), {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    });
    return {
      view,
      content,
      marker: svg.dataset.plot3dViewport || null,
      reserves: ['left', 'top', 'right', 'bottom'].map(side => svg.dataset[`plot3dReserve${side[0].toUpperCase()}${side.slice(1)}`] || null),
      envelope: svg.closest('.svgbox') ? [
        svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-left'),
        svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-top'),
        svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-right'),
        svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-bottom')
      ] : []
    };
  }, selector);
}

async function readOuterLayout(page, selector, pageId) {
  return page.evaluate(({ svgSelector, rootId }) => {
    const svg = document.querySelector(svgSelector);
    const box = svg?.closest('.svgbox') || document.querySelector(`#${rootId}:not([hidden]) .svgbox`);
    const rect = box?.getBoundingClientRect?.();
    return rect ? { width: rect.width, height: rect.height } : null;
  }, { svgSelector: selector, rootId: pageId });
}

function expectContained(result, label) {
  expect(result, `${label} should expose a viewport`).not.toBeNull();
  expect(result.marker, `${label} should use the shared 3D viewport contract`).toBe('true');
  expect(result.reserves.every(value => Number(value) > 0), `${label} should persist positive rotation-safe reserves`).toBe(true);
  const [minX, minY, width, height] = result.view;
  const content = result.content;
  expect(content.left, `${label} content should not cross the left viewport edge`).toBeGreaterThanOrEqual(minX - 1);
  expect(content.top, `${label} content should not cross the top viewport edge`).toBeGreaterThanOrEqual(minY - 1);
  expect(content.right, `${label} content should not cross the right viewport edge`).toBeLessThanOrEqual(minX + width + 1);
  expect(content.bottom, `${label} content should not cross the bottom viewport edge`).toBeLessThanOrEqual(minY + height + 1);
}

for (const component of CASES) {
  test(`${component.type} 3D viewport contains labels after redraw and rotation`, async ({ page }) => {
    test.setTimeout(120_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, { type: component.type, pageId: component.pageId }, { first: true });
    await page.waitForFunction(type => !!window.Components?.[type]?.ready, component.type, { timeout: 30_000 });
    await select3d(page, component);
    await page.waitForTimeout(300);
    const emptyLayout = await readOuterLayout(page, component.svg, component.pageId);
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await page.waitForFunction(({ selector, type }) => {
      const svg = document.querySelector(selector);
      return !!svg && (type === 'surface' || svg.dataset?.viewMode === '3d');
    }, { selector: component.svg, type: component.type }, { timeout: 45_000 });
    await page.waitForTimeout(500);
    const loadedLayout = await readOuterLayout(page, component.svg, component.pageId);
    expect(loadedLayout, `${component.type} loaded graph should have an outer layout`).not.toBeNull();
    expect(emptyLayout, `${component.type} empty graph should have an outer layout`).not.toBeNull();
    expect(loadedLayout.width, `${component.type} example data must not enlarge the outer graph width`).toBeLessThanOrEqual(emptyLayout.width + 8);
    expect(loadedLayout.height, `${component.type} example data must not enlarge the outer graph height`).toBeLessThanOrEqual(emptyLayout.height + 8);

    const initial = await readContainment(page, component.svg);
    expectContained(initial, `${component.type} initial`);
    const initialSignature = JSON.stringify({ view: initial.view, envelope: initial.envelope, reserves: initial.reserves });

    await page.evaluate(async () => {
      const active = window.Main?.session?.getActiveTab?.();
      const result = window.Main?.session?.persistActiveTabState?.(active, {
        reason: 'e2e-plot3d-cache-round-trip',
        origin: 'test'
      });
      if (result && typeof result.then === 'function') await result;
    });
    await page.waitForTimeout(500);
    const cacheRestored = await readContainment(page, component.svg);
    expectContained(cacheRestored, `${component.type} cache-restored`);
    expect(JSON.stringify({ view: cacheRestored.view, envelope: cacheRestored.envelope, reserves: cacheRestored.reserves }), `${component.type} cache restore should preserve the authoritative viewport`).toBe(initialSignature);

    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await page.waitForTimeout(700);
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
      await page.waitForTimeout(250);
      const rotated = await readContainment(page, component.svg);
      expectContained(rotated, `${component.type} rotated at ${target.x},${target.y}`);
      expect(rotated.view, `${component.type} rotation should retain the authoritative viewport`).toEqual(redrawn.view);
    }
    expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
  });
}
