const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function openExample(page, component, graphSelector){
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await expect(page.locator(graphSelector).first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async type => {
    const componentApi = window.Components?.[type];
    if(typeof componentApi?.awaitReadyForSnapshot === 'function'){
      await componentApi.awaitReadyForSnapshot({
        reason: 'e2e-data-aware-defaults',
        timeoutMs: 20_000,
        settleFrames: 3
      });
    }
  }, component.type);
}

async function openBlankScatter(page){
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.waitForSelector('#scatterPage:not([hidden]) #scatterHot .ag-root', { timeout: 20_000 });
}

async function pasteScatterMatrix(page, matrix){
  const text = matrix.map(row => row.map(value => value == null ? '' : String(value)).join('\t')).join('\n');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  await page.evaluate(async value => {
    await navigator.clipboard.writeText(value);
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    hot?.selectCell?.(0, 0, 0, 0);
  }, text);
  const targetCell = page.locator('#scatterPage:not([hidden]) #scatterHot [role="gridcell"]').nth(2);
  await targetCell.click({ force: true });
  await page.keyboard.press('Control+V');
}

async function expectScatterPalette(page, expected){
  await expect.poll(() => page.evaluate(() => {
    const workspace = window.Main?.session?.workspaceState || null;
    const tab = workspace?.tabs?.find(item => item?.id === workspace.activeTabId) || null;
    const live = window.Components?.scatter?.getPayload?.();
    const select = document.querySelector('#scatterPage:not([hidden]) select[data-color-scheme-select="1"]');
    const label = document.querySelector('#scatterPage:not([hidden]) .color-scheme-picker__label');
    const pointNodes = Array.from(document.querySelectorAll(
      '#scatterPage:not([hidden]) #scatterPlot [data-export-layer="scatter-points"] [data-plot-point="1"]'
    ));
    return {
      canonicalScheme: tab?.payload?.config?.colorScheme || null,
      liveScheme: live?.config?.colorScheme || null,
      overridden: tab?.payload?.config?.colorSchemeUserOverride,
      canonicalLabelColorCount: Object.keys(tab?.payload?.config?.labelColors || {}).length,
      liveLabelColorCount: Object.keys(live?.config?.labelColors || {}).length,
      select: select?.value || null,
      label: label?.textContent?.trim() || null,
      pointCount: pointNodes.length,
      fills: Array.from(new Set(pointNodes.map(node => String(node.getAttribute('fill') || '').toLowerCase()).filter(Boolean))).sort()
    };
  }), { timeout: 30_000 }).toEqual(expected);
}

test.describe('Data-aware graph defaults', () => {
  test('opening the unique-label Scatter example selects Grayscale', async ({ page }) => {
    await openExample(
      page,
      { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
      '#scatterPage:not([hidden]) #scatterPlot svg'
    );

    await expectScatterPalette(page, {
      canonicalScheme: 'grayscale',
      liveScheme: 'grayscale',
      overridden: false,
      canonicalLabelColorCount: 0,
      liveLabelColorCount: 0,
      select: 'grayscale',
      label: 'Grayscale',
      pointCount: 569,
      fills: ['#000000']
    });
    await page.locator('#scatterPage:not([hidden]) [data-export-layer="scatter-points"] [data-plot-point="1"]').nth(202).click();
    await expect.poll(() => page.locator('.shared-fill-style-chip').first().getAttribute('data-color')).toBe('#000000');
  });

  test('pasting the unique-label Scatter example into a blank tab selects Grayscale', async ({ page }) => {
    await openBlankScatter(page);
    const exampleMatrix = await page.evaluate(() => window.Shared?.exampleDatasets?.get?.('scatter', 'scatter')?.data || []);
    await pasteScatterMatrix(page, exampleMatrix);
    await expectScatterPalette(page, {
      canonicalScheme: 'grayscale',
      liveScheme: 'grayscale',
      overridden: false,
      canonicalLabelColorCount: 0,
      liveLabelColorCount: 0,
      select: 'grayscale',
      label: 'Grayscale',
      pointCount: 569,
      fills: ['#000000']
    });
  });

  test('pasting ten points split across two labels into a blank tab selects Color high contrast', async ({ page }) => {
    await openBlankScatter(page);
    const matrix = [['Sample', 'X', 'Y']];
    for(let index = 0; index < 10; index += 1){
      matrix.push([index < 5 ? 'Group 1' : 'Group 2', index + 1, (index + 1) * 2]);
    }
    await pasteScatterMatrix(page, matrix);
    await expectScatterPalette(page, {
      canonicalScheme: 'scientific',
      liveScheme: 'scientific',
      overridden: false,
      canonicalLabelColorCount: 2,
      liveLabelColorCount: 2,
      select: 'scientific',
      label: 'Color (high contrast)',
      pointCount: 10,
      fills: ['#0000ff', '#ff0000']
    });
  });

  test('Heatmap example with more than ten conditions hides correlation values', async ({ page }) => {
    test.setTimeout(90_000);
    await openExample(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      '#heatmapPage:not([hidden]) #heatmapSvg [data-export-layer="heatmap-cells"] rect'
    );

    const state = await page.evaluate(() => {
      const workspace = window.Main?.session?.workspaceState || null;
      const tab = workspace?.tabs?.find(item => item?.id === workspace.activeTabId) || null;
      const payload = window.Components?.heatmap?.getPayload?.();
      return {
        showValues: payload?.config?.showValues,
        overridden: payload?.config?.showValuesUserOverride,
        canonicalShowValues: tab?.payload?.config?.showValues,
        canonicalOverridden: tab?.payload?.config?.showValuesUserOverride,
        control: document.getElementById('heatmapShowValues')?.checked
      };
    });
    expect(state).toEqual({
      showValues: false,
      overridden: false,
      canonicalShowValues: false,
      canonicalOverridden: false,
      control: false
    });

    await page.locator('#heatmapPage:not([hidden]) #heatmapShowValues').check({ force: true });
    await page.locator('#heatmapPage:not([hidden]) #heatmapLoadExample').click({ force: true });
    await expect.poll(() => page.evaluate(() => {
      const workspace = window.Main?.session?.workspaceState || null;
      const tab = workspace?.tabs?.find(item => item?.id === workspace.activeTabId) || null;
      const payload = window.Components?.heatmap?.getPayload?.();
      return [
        payload?.config?.showValues,
        payload?.config?.showValuesUserOverride,
        tab?.payload?.config?.showValues,
        tab?.payload?.config?.showValuesUserOverride
      ];
    })).toEqual([true, true, true, true]);
  });

  test('multi-dataset Histogram applies 35% transparency to fill and border together', async ({ page }) => {
    await openExample(
      page,
      { type: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample' },
      '#histPage:not([hidden]) #histSvg [data-series-role="hist-trace"]'
    );

    const opacity = await page.evaluate(() => {
      const trace = document.querySelector('#histSvg [data-series-role="hist-trace"]');
      const fill = trace?.querySelector?.('[data-series-role="hist-fill"]');
      const border = trace?.querySelector?.('[data-series-role="hist-border"]');
      return {
        trace: Number(trace?.getAttribute?.('opacity')),
        fill: Number(fill?.getAttribute?.('fill-opacity')),
        borderHasOwnOpacity: !!border?.hasAttribute?.('stroke-opacity'),
        hasBorder: !!border
      };
    });
    expect(opacity.trace).toBeCloseTo(0.65, 6);
    expect(opacity.fill).toBe(1);
    expect(opacity.hasBorder).toBe(true);
    expect(opacity.borderHasOwnOpacity).toBe(false);
  });
});
