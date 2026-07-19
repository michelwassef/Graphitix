const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const COMPONENTS_WITH_AXES = new Set([
  'box',
  'scatter',
  'pca',
  'line',
  'surface',
  'roc',
  'survival',
  'hist'
]);

test.setTimeout(90_000);

async function captureTitleSvgGeometry(titleLocator) {
  return titleLocator.evaluate(node => {
    const svg = node.ownerSVGElement;
    const rect = svg?.getBoundingClientRect?.();
    const viewBox = String(svg?.getAttribute('viewBox') || '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    return {
      viewBox,
      width: rect?.width || 0,
      height: rect?.height || 0,
      preserveAspectRatio: svg?.getAttribute('preserveAspectRatio') || ''
    };
  });
}

function expectGeometryUnchanged(actual, expected) {
  expect(actual.viewBox).toHaveLength(4);
  expect(expected.viewBox).toHaveLength(4);
  actual.viewBox.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.viewBox[index], 3);
  });
  expect(actual.width).toBeCloseTo(expected.width, 1);
  expect(actual.height).toBeCloseTo(expected.height, 1);
  expect(actual.preserveAspectRatio).toBe(expected.preserveAspectRatio);
}

for (const component of COMPONENT_MATRIX) {
  test(`${component.type} exposes persistent title visibility controls`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, {
      first: true,
      loadExample: true
    });

    const svgBox = page.locator(`#${component.pageId}:not([hidden]) .svgbox`).first();
    const graphToggle = svgBox.locator('.resizer-graph-title-checkbox');
    const axesToggle = svgBox.locator('.resizer-axes-title-checkbox');
    const axesControl = svgBox.locator('.resizer-axes-title-control');
    await expect(graphToggle).toBeAttached({ timeout: 20_000 });
    await expect(graphToggle).toBeChecked();
    const graphTitle = svgBox.locator('text[data-font-role="graphTitle"]').first();
    await expect(graphTitle).toBeAttached({ timeout: 20_000 });
    const originalTitle = await graphTitle.textContent();

    await graphTitle.dblclick();
    const editor = page.locator('.inline-edit-input');
    await editor.fill('');
    await editor.press('Enter');
    await expect.poll(() => svgBox.locator('text[data-font-role="graphTitle"]').first().evaluate(node => ({
      text: node.textContent,
      hidden: getComputedStyle(node).visibility === 'hidden'
    }))).toEqual({
      text: originalTitle,
      hidden: true
    });

    await svgBox.locator('.resizer-options-summary').click();
    await expect(graphToggle).toBeVisible();
    await expect(graphToggle).not.toBeChecked();
    await graphToggle.check();
    await expect.poll(() => svgBox.locator('text[data-font-role="graphTitle"]').first().evaluate(
      (node, expectedTitle) => node.textContent === expectedTitle && getComputedStyle(node).visibility !== 'hidden',
      originalTitle
    )).toBe(true);
    const visibleGeometry = await captureTitleSvgGeometry(
      svgBox.locator('text[data-font-role="graphTitle"]').first()
    );

    await graphToggle.uncheck();
    await expect.poll(() => svgBox.evaluate(node => {
      const titles = Array.from(node.querySelectorAll('text[data-font-role="graphTitle"]'));
      return titles.length > 0 && titles.every(title => getComputedStyle(title).visibility === 'hidden');
    })).toBe(true);
    const hiddenGeometry = await captureTitleSvgGeometry(
      svgBox.locator('text[data-font-role="graphTitle"]').first()
    );
    expectGeometryUnchanged(hiddenGeometry, visibleGeometry);

    const storedGraphVisibility = await page.evaluate((type) => {
      const state = window.Main?.session?.workspaceState;
      const tabId = state?.activeTabId || null;
      return window.Shared?.fontControls?.exportScopeStyles?.(type, { tabId })?.graphTitle?.hidden;
    }, component.type);
    expect(storedGraphVisibility).toBe(true);
    const persistedGraphVisibility = await page.evaluate(async (type) => {
      const state = window.Main?.session?.workspaceState;
      const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
      const payload = await Promise.resolve(window.Components?.[type]?.getPayload?.({ tabId: active?.id || null }));
      return {
        hidden: payload?.config?.fontStyles?.graphTitle?.hidden
          ?? payload?.style?.fontStyles?.graphTitle?.hidden
          ?? null,
        userModified: active?.userModified === true
      };
    }, component.type);
    expect(persistedGraphVisibility).toEqual({
      hidden: true,
      userModified: true
    });

    const expectsAxes = COMPONENTS_WITH_AXES.has(component.type);
    if (expectsAxes) {
      await expect.poll(() => axesToggle.evaluate(input => !input.closest('label').hidden)).toBe(true);
      await expect(axesControl).toBeVisible();
      await axesToggle.uncheck();
      await expect.poll(() => svgBox.evaluate(node => {
        const titles = Array.from(node.querySelectorAll(
          'text[data-font-role="xTitle"], text[data-font-role="yTitle"], text[data-font-role="zTitle"]'
        ));
        return titles.length > 0 && titles.every(title => getComputedStyle(title).visibility === 'hidden');
      })).toBe(true);
    } else {
      await expect.poll(() => axesToggle.evaluate(input => input.closest('label').hidden)).toBe(true);
      await expect(axesControl).toBeHidden();
    }
  });
}

test('Pie exposes axis-title visibility only for Stacked Bar and preserves its preference', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, {
    type: 'pie',
    pageId: 'piePage',
    exampleButtonId: 'pieLoadExample'
  }, {
    first: true,
    loadExample: true
  });

  const svgBox = page.locator('#piePage:not([hidden]) .svgbox').first();
  const axesToggle = svgBox.locator('.resizer-axes-title-checkbox');
  const axesControl = svgBox.locator('.resizer-axes-title-control');
  await expect(axesToggle).toBeAttached();
  await svgBox.locator('.resizer-options-summary').click();
  await expect.poll(() => axesControl.evaluate(control => control.hidden)).toBe(true);
  await expect(axesControl).toBeHidden();

  await page.selectOption('#pieChartType', 'stacked');
  const yTitle = svgBox.locator('text[data-font-role="yTitle"]');
  await expect(yTitle).toBeAttached();
  await expect.poll(() => axesControl.evaluate(control => control.hidden)).toBe(false);
  await expect(axesControl).toBeVisible();
  await expect(axesToggle).toBeChecked();

  await axesToggle.uncheck();
  await expect.poll(() => yTitle.evaluate(node => getComputedStyle(node).visibility)).toBe('hidden');

  await page.selectOption('#pieChartType', 'pie');
  await expect(yTitle).toHaveCount(0);
  await expect.poll(() => axesControl.evaluate(control => control.hidden)).toBe(true);
  await expect(axesControl).toBeHidden();

  await page.selectOption('#pieChartType', 'stacked');
  await expect(yTitle).toBeAttached();
  await expect.poll(() => axesControl.evaluate(control => control.hidden)).toBe(false);
  await expect(axesControl).toBeVisible();
  await expect(axesToggle).not.toBeChecked();
  await expect.poll(() => yTitle.evaluate(node => getComputedStyle(node).visibility)).toBe('hidden');
});
