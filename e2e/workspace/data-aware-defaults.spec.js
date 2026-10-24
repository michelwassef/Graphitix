const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { getComponentByType } = require('../../test-support/componentCatalog.js');

const EXAMPLE_PALETTE_COMPONENTS = ['venn', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'];

async function readActivePalette(page, component){
  return page.evaluate(({ type, pageId }) => {
    const tab = window.Main?.session?.getActiveTab?.() || null;
    const schemeId = type === 'venn'
      ? tab?.payload?.style?.colorScheme
      : tab?.payload?.config?.colorScheme;
    const select = document.querySelector(`#${pageId}:not([hidden]) select[data-color-scheme-select="1"]`);
    return { schemeId: schemeId || null, selected: select?.value || null };
  }, { type: component.type, pageId: component.pageId });
}

async function startSeriesPaletteFrameRecorder(page, type, pageId){
  await page.evaluate(({ componentType, componentPageId }) => {
    const selectors = {
      roc: '#rocSvg path[data-series]',
      survival: '#survivalSvg path[data-survival-series-color-target="stroke"][data-group]:not([data-survival-censor-mark="1"])'
    };
    const pathsSelector = selectors[componentType];
    const samples = [];
    let active = true;
    const sample = () => {
      if(!active) return;
      const paths = Array.from(document.querySelectorAll(pathsSelector));
      if(paths.length){
        const tab = window.Main?.session?.getActiveTab?.() || null;
        const select = document.querySelector(`#${componentPageId}:not([hidden]) select[data-color-scheme-select="1"]`);
        const allowed = window.Shared?.colorSchemes?.resolveCategoricalPaletteForType?.(componentType, { schemeId: 'normal' }) || [];
        samples.push({
          scheme: tab?.payload?.config?.colorScheme || null,
          selected: select?.value || null,
          allowed,
          colors: paths.map(path => String(path.getAttribute('stroke') || path.getAttribute('fill') || '').toLowerCase()).filter(Boolean)
        });
      }
      requestAnimationFrame(sample);
    };
    window.__examplePaletteFrames = { samples, stop: () => { active = false; } };
    requestAnimationFrame(sample);
  }, { componentType: type, componentPageId: pageId });
}

async function startWelcomePaletteFrameRecorder(page, type, pageId){
  await page.evaluate(({ componentType, componentPageId }) => {
    const rootSelectors = {
      venn: '#vennPage #stage',
      pca: '#pcaPage #pcaSvg',
      heatmap: '#heatmapPage #heatmapSvg',
      surface: '#surfacePage #surfaceSvg',
      hist: '#histPage #histSvg',
      pie: '#piePage #pieSvg'
    };
    const contentSelectors = {
      venn: '[data-venn-trace-id]',
      pca: '[data-plot-point="1"]',
      heatmap: '[data-heatmap-cell-hit-layer="1"]',
      surface: '.surface-face, .surface-point',
      hist: '[data-hist-bar="1"]',
      pie: '[data-pie-trace="1"]'
    };
    const rootSelector = rootSelectors[componentType];
    const normalize = color => String(color || '').trim().toLowerCase();
    const normal = new Set((window.Shared?.colorSchemes?.resolveCategoricalPaletteForType?.(componentType, {
      schemeId: 'normal'
    }) || []).map(normalize));
    const highContrast = new Set((window.Shared?.colorSchemes?.resolveCategoricalPaletteForType?.(componentType, {
      schemeId: 'scientific'
    }) || []).map(normalize).filter(color => !normal.has(color)));
    const samples = [];
    let active = true;
    const sample = () => {
      if(!active) return;
      const root = rootSelector ? document.querySelector(rootSelector) : null;
      if(root && root.getClientRects().length && root.querySelector(contentSelectors[componentType])){
        const tab = window.Main?.session?.getActiveTab?.() || null;
        const select = document.querySelector(`#${componentPageId}:not([hidden]) select[data-color-scheme-select="1"]`);
        const renderedColors = Array.from(root.querySelectorAll('*')).flatMap(node => [
          node.getAttribute('fill'), node.getAttribute('stroke')
        ]).map(normalize);
        samples.push({
          scheme: (componentType === 'venn' ? tab?.payload?.style?.colorScheme : tab?.payload?.config?.colorScheme) || null,
          selected: select?.value || null,
          svgScheme: root.getAttribute('data-color-scheme') || null,
          highContrastColors: renderedColors.filter(color => highContrast.has(color))
        });
      }
      requestAnimationFrame(sample);
    };
    window.__welcomePaletteFrames = { samples, stop: () => { active = false; } };
    requestAnimationFrame(sample);
  }, { componentType: type, componentPageId: pageId });
}

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
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
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
  test('blank Scatter uses Normal and lists it first', async ({ page }) => {
    await openBlankScatter(page);
    await expect.poll(() => page.evaluate(() => {
      const workspace = window.Main?.session?.workspaceState || null;
      const tab = workspace?.tabs?.find(item => item?.id === workspace.activeTabId) || null;
      const live = window.Components?.scatter?.getPayload?.();
      const select = document.querySelector('#scatterPage:not([hidden]) select[data-color-scheme-select="1"]');
      const label = document.querySelector('#scatterPage:not([hidden]) .color-scheme-picker__label');
      return {
        canonicalScheme: tab?.payload?.config?.colorScheme || null,
        liveScheme: live?.config?.colorScheme || null,
        select: select?.value || null,
        label: label?.textContent?.trim() || null
      };
    }), { timeout: 30_000 }).toEqual({
      canonicalScheme: 'normal',
      liveScheme: 'normal',
      select: 'normal',
      label: 'Color (normal)'
    });
    const order = await page.evaluate(() => {
      const select = document.querySelector('#scatterPage:not([hidden]) select[data-color-scheme-select="1"]');
      const menu = document.querySelector('#scatterPage:not([hidden]) .color-scheme-picker__menu');
      return {
        select: Array.from(select?.options || []).map(option => option.value),
        menu: Array.from(menu?.querySelectorAll('.color-scheme-picker__option') || []).map(option => option.dataset.schemeId)
      };
    });
    expect(order.select[0]).toBe('normal');
    expect(order.menu[0]).toBe('normal');
  });

  for (const type of EXAMPLE_PALETTE_COMPONENTS) {
    test(`${type} example loading uses its default color scheme`, async ({ page }) => {
      test.setTimeout(120_000);
      const component = getComponentByType(type);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await openComponentFromWelcome(page, component, { first: true });

      const select = page.locator(`#${component.pageId}:not([hidden]) select[data-color-scheme-select="1"]`);
      await expect(select).toBeAttached({ timeout: 20_000 });
      const alternate = type === 'surface' ? 'surface-plasma' : 'scientific';
      const expected = type === 'surface' ? 'surface-viridis' : 'normal';
      await select.selectOption(alternate);
      await expect.poll(() => readActivePalette(page, component)).toEqual({
        schemeId: alternate,
        selected: alternate
      });

      await clickExampleButton(page, component, { timeout: 45_000 });
      await expect.poll(() => readActivePalette(page, component), { timeout: 45_000 }).toEqual({
        schemeId: expected,
        selected: expected
      });
      if (type === 'line') {
        await expect.poll(() => page.evaluate(() => Array.from(
          document.querySelectorAll('#linePlot path[data-line-style-role="line"][data-series]')
        ).map(path => [path.getAttribute('data-series'), path.getAttribute('stroke')])), { timeout: 30_000 }).toEqual([
          ['Mean reaction time', '#1f77b4'],
          ['Median reaction time', '#e41a1c'],
          ['25th percentile', '#4daf4a'],
          ['75th percentile', '#984ea3']
        ]);
      }
    });
  }

  for (const type of ['venn', 'pca', 'heatmap', 'surface', 'hist', 'pie']) {
    test(`${type} Welcome example uses its default palette from the first rendered frame`, async ({ page }) => {
      const component = getComponentByType(type);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await startWelcomePaletteFrameRecorder(page, type, component.pageId);
      await openComponentFromWelcome(page, component, { first: true, loadExample: true });
      const expected = type === 'surface' ? 'surface-viridis' : 'normal';
      await expect.poll(() => readActivePalette(page, component), { timeout: 30_000 }).toEqual({
        schemeId: expected,
        selected: expected
      });
      await page.evaluate(async componentType => {
        await window.Components?.[componentType]?.awaitReadyForSnapshot?.({
          reason: 'e2e-welcome-example-default-palette',
          timeoutMs: 20_000,
          settleFrames: 2
        });
      }, type);
      const frames = await page.evaluate(() => {
        const recorder = window.__welcomePaletteFrames;
        recorder?.stop?.();
        return recorder?.samples || [];
      });
      expect(frames.length).toBeGreaterThan(0);
      const invalidFrames = frames.filter(frame => !(frame.scheme === expected
        && frame.selected === expected
        && (!frame.svgScheme || frame.svgScheme === expected)
        && frame.highContrastColors.length === 0));
      expect(invalidFrames, JSON.stringify(frames.slice(0, 12))).toEqual([]);
    });
  }

  test('Line example launched from Welcome applies Normal without changing another Line tab', async ({ page }) => {
    const component = getComponentByType('line');
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true });

    const selector = page.locator(`#${component.pageId}:not([hidden]) select[data-color-scheme-select="1"]`);
    await expect(selector).toBeAttached({ timeout: 20_000 });
    await selector.selectOption('scientific');
    const originalTabId = await page.evaluate(() => window.Main?.session?.getActiveTab?.()?.id || null);
    await expect.poll(() => readActivePalette(page, component)).toEqual({
      schemeId: 'scientific',
      selected: 'scientific'
    });

    await page.evaluate(() => {
      const samples = [];
      let active = true;
      const sample = () => {
        if (!active) return;
        const svg = document.querySelector('#linePlot svg');
        const paths = Array.from(document.querySelectorAll(
          '#linePlot path[data-line-style-role="line"][data-series]'
        ));
        if (paths.length) {
          samples.push({
            scheme: svg?.getAttribute('data-color-scheme') || null,
            strokes: paths.map(path => path.getAttribute('stroke'))
          });
        }
        requestAnimationFrame(sample);
      };
      window.__lineExamplePaletteFrames = {
        samples,
        stop: () => { active = false; }
      };
      requestAnimationFrame(sample);
    });
    await openComponentFromWelcome(page, component, { loadExample: true });
    await expect(page.locator('#linePage:not([hidden]) #linePlot svg')).toBeVisible({ timeout: 30_000 });
    const exampleTabId = await page.evaluate(() => window.Main?.session?.getActiveTab?.()?.id || null);
    expect(exampleTabId).not.toBe(originalTabId);
    await expect.poll(() => readActivePalette(page, component), { timeout: 30_000 }).toEqual({
      schemeId: 'normal',
      selected: 'normal'
    });
    await expect.poll(() => page.evaluate(() => Array.from(
      document.querySelectorAll('#linePlot path[data-line-style-role="line"][data-series]')
    ).map(path => [path.getAttribute('data-series'), path.getAttribute('stroke')])), { timeout: 30_000 }).toEqual([
      ['Mean reaction time', '#1f77b4'],
      ['Median reaction time', '#e41a1c'],
      ['25th percentile', '#4daf4a'],
      ['75th percentile', '#984ea3']
    ]);

    const paletteFrames = await page.evaluate(() => {
      const recorder = window.__lineExamplePaletteFrames;
      recorder?.stop?.();
      return recorder?.samples || [];
    });
    expect(paletteFrames.length).toBeGreaterThan(0);
    expect(paletteFrames.every(frame => frame.scheme === 'normal')).toBe(true);
    expect(paletteFrames.every(frame => frame.strokes.every(stroke => [
      '#1f77b4', '#e41a1c', '#4daf4a', '#984ea3'
    ].includes(String(stroke || '').toLowerCase())))).toBe(true);

    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${originalTabId}"]`).click();
    await page.waitForFunction(tabId => window.Main?.session?.workspaceState?.activeTabId === tabId, originalTabId);
    await expect.poll(() => readActivePalette(page, component)).toEqual({
      schemeId: 'scientific',
      selected: 'scientific'
    });
  });

  for (const type of ['roc', 'survival']) {
    test(`${type} Welcome example uses its default palette on the first rendered frame`, async ({ page }) => {
      const component = getComponentByType(type);
      const pathsSelector = type === 'roc'
        ? '#rocPage:not([hidden]) #rocSvg path[data-series]'
        : '#survivalPage:not([hidden]) #survivalSvg path[data-survival-series-color-target="stroke"][data-group]:not([data-survival-censor-mark="1"])';
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await startSeriesPaletteFrameRecorder(page, type, component.pageId);

      await openComponentFromWelcome(page, component, { first: true, loadExample: true });
      await expect(page.locator(pathsSelector).first()).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => readActivePalette(page, component), { timeout: 30_000 }).toEqual({
        schemeId: 'normal',
        selected: 'normal'
      });
      await page.evaluate(async componentType => {
        await window.Components?.[componentType]?.awaitReadyForSnapshot?.({
          reason: 'e2e-example-first-frame-palette',
          timeoutMs: 20_000,
          settleFrames: 2
        });
      }, type);

      const frames = await page.evaluate(() => {
        const recorder = window.__examplePaletteFrames;
        recorder?.stop?.();
        return recorder?.samples || [];
      });
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every(frame => frame.scheme === 'normal'
        && frame.selected === 'normal'
        && frame.colors.length > 0
        && frame.colors.every(color => frame.allowed.includes(color)))).toBe(true);
    });
  }

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

  test('pasting ten points split across two labels into a blank tab selects Color vivid', async ({ page }) => {
    await openBlankScatter(page);
    await expect.poll(() => page.evaluate(() => window.Components?.scatter?.getPayload?.()?.config?.colorSchemeUserOverride)).toBe(false);
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
      label: 'Color (vivid)',
      pointCount: 10,
      fills: ['#0000ff', '#ff0000']
    });
  });

  test('an explicit Scatter palette choice remains selected after grouped data is pasted', async ({ page }) => {
    await openBlankScatter(page);
    await page.locator('#scatterPage:not([hidden]) select[data-color-scheme-select="1"]').selectOption('soft');
    await expect.poll(() => page.evaluate(() => {
      const payload = window.Components?.scatter?.getPayload?.();
      return { scheme: payload?.config?.colorScheme, overridden: payload?.config?.colorSchemeUserOverride };
    })).toEqual({ scheme: 'soft', overridden: true });

    const matrix = [['Sample', 'X', 'Y']];
    for(let index = 0; index < 10; index += 1){
      matrix.push([index < 5 ? 'Group 1' : 'Group 2', index + 1, (index + 1) * 2]);
    }
    await pasteScatterMatrix(page, matrix);
    await expect.poll(() => page.evaluate(() => {
      const payload = window.Components?.scatter?.getPayload?.();
      return { scheme: payload?.config?.colorScheme, overridden: payload?.config?.colorSchemeUserOverride };
    })).toEqual({ scheme: 'soft', overridden: true });
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

    const schemeSelect = page.locator('#heatmapPage:not([hidden]) select[data-color-scheme-select="1"]');
    await schemeSelect.selectOption('scientific');
    await expect.poll(() => page.evaluate(() => window.Main?.session?.getActiveTab?.()?.payload?.config?.colorScheme))
      .toBe('scientific');
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
        tab?.payload?.config?.showValuesUserOverride,
        payload?.config?.colorScheme,
        tab?.payload?.config?.colorScheme,
        document.querySelector('#heatmapPage:not([hidden]) select[data-color-scheme-select="1"]')?.value
      ];
    })).toEqual([true, true, true, true, 'normal', 'normal', 'normal']);
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
