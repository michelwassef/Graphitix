const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const PCA_COMPONENT = {
  type: 'pca',
  pageId: 'pcaPage',
  exampleButtonId: 'pcaLoadExample'
};

async function readPcaGeometry(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    const svgBox = root?.querySelector('#pcaGraphPanel .svgbox');
    const svg = root?.querySelector('#pcaSvg');
    const readAxis = axis => {
      const line = svg?.querySelector(`[data-axis-line="1"][data-axis-key="${axis}"]`);
      if (!line) return null;
      const min = Number(line.getAttribute('data-axis-min'));
      const max = Number(line.getAttribute('data-axis-max'));
      const length = axis === 'x'
        ? Math.abs(Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')))
        : Math.abs(Number(line.getAttribute('y2')) - Number(line.getAttribute('y1')));
      return { length, span: max - min };
    };
    return {
      hasLockControl: !!root?.querySelector('.resizer-aspect-control'),
      hasAxesLengthControl: !!root?.querySelector('.resizer-axeslength-control'),
      equalAxisLengthsChecked: !!root?.querySelector('.resizer-axeslength-checkbox--equal-scale')?.checked,
      invalidAxisLengthControls: root?.querySelectorAll('.resizer-axeslength-checkbox--equal-length, .resizer-axeslength-checkbox--variance, #pcaVarianceAxisScale')?.length || 0,
      aspectLocked: svgBox?.dataset?.resizerAspectLocked || '',
      bottomReserve: Number(svg?.dataset?.graphContentReserveBottom || 0),
      x: readAxis('x'),
      y: readAxis('y'),
      baseHeight: Number(svg?.dataset?.legendBaseHeight || 0),
      legendReserve: Number(svg?.dataset?.legendReserveWidth || 0),
      envelopeBottom: Number.parseFloat(svgBox?.style?.getPropertyValue('--graph-content-extra-bottom') || '0') || 0
    };
  });
}

test('PCA equal-axis-length default keeps standard graph height and metric geometry', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, PCA_COMPONENT, { first: true, loadExample: true });
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    return !!svg?.querySelector('[data-axis-line="1"][data-axis-key="y"]');
  }, null, { timeout: 60_000 });

  const geometry = await readPcaGeometry(page);
  expect(geometry.hasLockControl).toBe(false);
  expect(geometry.hasAxesLengthControl).toBe(true);
  expect(geometry.equalAxisLengthsChecked).toBe(true);
  expect(geometry.invalidAxisLengthControls).toBe(0);
  expect(geometry.aspectLocked).toBe('true');
  expect(geometry.bottomReserve).toBeCloseTo(geometry.envelopeBottom, 0);
  expect(geometry.x?.span).toBeGreaterThan(0);
  expect(geometry.y?.span).toBeGreaterThan(0);
  expect(Math.abs(geometry.x.span - geometry.y.span)).toBeLessThan(1e-9);
  expect(Math.abs(geometry.x.length - geometry.y.length)).toBeLessThan(1e-8);
  expect(geometry.y?.length).toBeLessThan(geometry.baseHeight);
  expect(Math.abs((geometry.x.length / geometry.x.span) / (geometry.y.length / geometry.y.span) - 1)).toBeLessThan(1e-8);
});

test('PCA grouped example uses the equal-axis-length default', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, PCA_COMPONENT, { first: true });
  await page.locator('#pcaTableFormat').selectOption('grouped');
  await page.locator('#pcaLoadExample').click();
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    return svg?.dataset?.pcaEqualAxisLengths === 'true'
      && !!svg.querySelector('[data-axis-line="1"][data-axis-key="y"]')
      && window.Components?.pca?.isIdleForSnapshot?.() === true;
  }, null, { timeout: 60_000 });

  const geometry = await readPcaGeometry(page);
  expect(geometry.equalAxisLengthsChecked).toBe(true);
  expect(Math.abs(geometry.x.span - geometry.y.span)).toBeLessThan(1e-9);
  expect(Math.abs(geometry.x.length - geometry.y.length)).toBeLessThan(1e-8);
});

test('PCA 3D uses its renderer-owned canvas without a second content fit', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, PCA_COMPONENT, { first: true, loadExample: true });
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    return svg?.dataset?.viewMode === '2d' && window.Components?.pca?.isIdleForSnapshot?.() === true;
  }, null, { timeout: 60_000 });
  await page.locator('#pcaViewMode').selectOption('3d');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    return svg?.dataset?.viewMode === '3d' && !!svg.querySelector('[data-layer="pca-3d-rotation-dynamic"]');
  }, null, { timeout: 60_000 });

  const geometry = await page.evaluate(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    const viewBox = svg.viewBox.baseVal;
    const session = window.Components.pca.__testHooks.getSession();
    const model = session?.cache?.pca3dRotationModel;
    const dynamicBounds = svg.querySelector('[data-layer="pca-3d-rotation-dynamic"]')?.getBBox();
    return {
      modelWidth: Number(model?.width || 0),
      modelHeight: Number(model?.height || 0),
      viewBoxWidth: viewBox.width,
      viewBoxHeight: viewBox.height,
      legendReserve: Number(svg?.dataset?.legendReserveWidth || 0),
      dynamicWidth: Number(dynamicBounds?.width || 0),
      dynamicHeight: Number(dynamicBounds?.height || 0)
    };
  });

  expect(geometry.modelWidth).toBeGreaterThan(0);
  expect(geometry.modelHeight).toBeGreaterThan(0);
  expect(geometry.viewBoxWidth).toBeGreaterThanOrEqual(geometry.modelWidth - 1);
  expect(geometry.viewBoxWidth).toBeLessThanOrEqual(geometry.modelWidth + geometry.legendReserve + 1);
  expect(Math.abs(geometry.viewBoxHeight - geometry.modelHeight)).toBeLessThanOrEqual(1);
  // Projected 3D occupancy is data- and rotation-dependent. The renderer-owned
  // canvas contract is the model/viewBox agreement above; only require the
  // dynamic layer itself to contain non-empty rendered geometry.
  expect(geometry.dynamicWidth).toBeGreaterThan(0);
  expect(geometry.dynamicHeight).toBeGreaterThan(0);
});
