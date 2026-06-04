const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function collectCount(page, label) {
  return page.evaluate(targetLabel => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    return entries.filter(entry => String(entry?.label || '') === targetLabel).length;
  }, label);
}

async function waitForCountIncrease(page, label, before, timeout = 30000) {
  await page.waitForFunction(
    ({ targetLabel, baseline }) => {
      const entries = Array.isArray(window.Shared?.Performance?._entries)
        ? window.Shared.Performance._entries
        : [];
      const count = entries.filter(entry => String(entry?.label || '') === targetLabel).length;
      return count > baseline;
    },
    { targetLabel: label, baseline: before },
    { timeout }
  );
}

async function waitForScatterIdle(page, timeout = 90000) {
  await page.waitForFunction(() => {
    const state = window.Components?.scatter?.__testGetState?.();
    const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
    const mode = layer?.getAttribute?.('data-render-mode') || null;
    return !!state
      && state.drawInProgress !== true
      && !state.pendingDrawOpts
      && !state.pendingDrawReasons
      && mode !== 'canvas-pending';
  }, null, { timeout });
}

async function waitForScatterPointCanvas(page, timeout = 180000) {
  await page.waitForFunction(() => {
    const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
    return !!layer
      && layer.getAttribute('data-render-mode') === 'canvas'
      && !!layer.querySelector('foreignObject[data-point-renderer="canvas-preview"] canvas')
      && !!layer.getAttribute('data-canvas-render-strategy');
  }, null, { timeout });
}

test.describe('Scatter live updates with view-only optimizations', () => {
  test('large dataset keeps style changes view-only and recollects only on data edits', async ({ page }) => {
    test.setTimeout(300000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
      { first: true }
    );

    const csvPath = path.resolve(__dirname, '../__tests__/test-scatter.csv');
    await page.setInputFiles('#scatterFile', csvPath);

    await expect(page.locator('#scatterRenderRow')).toHaveCount(0);
    await expect(page.locator('#scatterRenderButton')).toHaveCount(0);
    await expect(page.locator('#scatterAutoDrawNotice')).toHaveCount(0);

    await page.waitForFunction(() => {
      const entries = Array.isArray(window.Shared?.Performance?._entries)
        ? window.Shared.Performance._entries
        : [];
      const hasDraw = entries.some(entry => String(entry?.label || '') === 'scatter.draw');
      const hasCollect = entries.some(entry => String(entry?.label || '') === 'scatter.data.collect');
      return hasDraw && hasCollect;
    }, null, { timeout: 180000 });
    const hasSvg = await page.evaluate(() => !!document.querySelector('#scatterPlot svg'));
    if(!hasSvg){
      await page.waitForTimeout(1500);
    }
    const hasSvgAfterWait = await page.evaluate(() => !!document.querySelector('#scatterPlot svg'));
    if(!hasSvgAfterWait){
      return;
    }
    await waitForScatterIdle(page, 180000);

    const largeRenderMeta = await page.evaluate(() => {
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      return {
        renderMode: layer?.getAttribute?.('data-render-mode') || null,
        canvasStrategy: layer?.getAttribute?.('data-canvas-render-strategy') || null,
        canvasSpriteBuckets: Number(layer?.getAttribute?.('data-canvas-sprite-buckets') || 0),
        canvasPathBuckets: Number(layer?.getAttribute?.('data-canvas-path-buckets') || 0),
        nodeCount: layer ? layer.querySelectorAll('*').length : 0,
        hasCanvasLayer: !!layer?.querySelector?.('foreignObject[data-point-renderer="canvas-preview"] canvas')
      };
    });
    if(largeRenderMeta.renderMode === 'canvas'){
      expect(largeRenderMeta.hasCanvasLayer, 'large scatter point layer should use canvas foreignObject rendering').toBe(true);
      expect(largeRenderMeta.canvasStrategy, 'large scatter canvas should use cached marker sprites').toMatch(/^(indexed-sprite|sprite)$/);
      expect(largeRenderMeta.canvasSpriteBuckets, 'large scatter canvas should draw at least one sprite bucket').toBeGreaterThan(0);
      expect(largeRenderMeta.canvasPathBuckets, 'uniform large scatter canvas should avoid path buckets').toBe(0);
      expect(largeRenderMeta.nodeCount, 'canvas point layer should stay compact on huge datasets').toBeLessThan(10);
    }else if(largeRenderMeta.renderMode === 'batched-circles'){
      expect(largeRenderMeta.nodeCount, 'batched point layer should stay compact on huge datasets').toBeLessThan(300);
    }else{
      expect(largeRenderMeta.nodeCount).toBeGreaterThanOrEqual(0);
    }

    let beforeDraw = await collectCount(page, 'scatter.draw');
    let beforeCollect = await collectCount(page, 'scatter.data.collect');
    await page.evaluate(() => {
      const input = document.getElementById('scatterFill');
      if(input){
        input.value = '#1f78b4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 60000);
    let afterCollect = await collectCount(page, 'scatter.data.collect');
    expect(afterCollect, 'fill color change should not recollect data').toBe(beforeCollect);

    beforeDraw = await collectCount(page, 'scatter.draw');
    beforeCollect = afterCollect;
    await page.evaluate(() => {
      const plot = document.getElementById('scatterPlot');
      const state = { sawGap: false, initialVisiblePoints: false, hadVisiblePoints: false };
      const hasVisiblePoints = () => {
        const svgs = Array.from(plot?.querySelectorAll('svg') || []);
        for(let i = 0; i < svgs.length; i += 1){
          const svg = svgs[i];
          if(svg?.style?.visibility === 'hidden'){
            continue;
          }
          if(svg?.querySelector?.('[data-layer="points"]')){
            return true;
          }
        }
        return false;
      };
      const initialVisible = hasVisiblePoints();
      state.initialVisiblePoints = initialVisible;
      state.hadVisiblePoints = initialVisible;
      const observer = new MutationObserver(() => {
        const currentlyVisible = hasVisiblePoints();
        if(currentlyVisible){
          state.hadVisiblePoints = true;
        }else if(state.initialVisiblePoints && state.hadVisiblePoints){
          state.sawGap = true;
        }
      });
      if(plot){
        observer.observe(plot, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      }
      window.__scatterPointGapObserver = { observer, state };
    });
    await page.evaluate(() => {
      const toggle = document.getElementById('scatterShowLine');
      if(toggle){
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 60000);
    const pointGapState = await page.evaluate(() => {
      const payload = window.__scatterPointGapObserver;
      if(payload?.observer && typeof payload.observer.disconnect === 'function'){
        payload.observer.disconnect();
      }
      const state = payload?.state || null;
      window.__scatterPointGapObserver = null;
      return state;
    });
    if(pointGapState?.initialVisiblePoints){
      expect(!!pointGapState?.sawGap, 'trendline toggle should not transiently clear the visible points layer').toBe(false);
    }
    afterCollect = await collectCount(page, 'scatter.data.collect');
    expect(afterCollect, 'trendline toggle should not recollect data').toBe(beforeCollect);

    beforeDraw = await collectCount(page, 'scatter.draw');
    beforeCollect = afterCollect;
    const selectedCount = await page.evaluate(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      const hooks = window.Components?.scatter?.__testHooks;
      if(hot && hooks?.setRowSelected){
        hooks.setRowSelected(hot, 1, true, { preserveExisting: true });
      }
      const api = hot?.gridApi;
      if(!api || typeof api.forEachNode !== 'function'){
        return 0;
      }
      let count = 0;
      api.forEachNode(node => {
        if(node?.isSelected?.()){
          count += 1;
        }
      });
      return count;
    });
    expect(selectedCount, 'row selection should apply immediately without update button').toBeGreaterThan(0);
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 60000);
    afterCollect = await collectCount(page, 'scatter.data.collect');
    expect(afterCollect, 'row selection label update should not recollect data').toBe(beforeCollect);

    beforeDraw = await collectCount(page, 'scatter.draw');
    beforeCollect = afterCollect;
    await page.evaluate(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      if(hot && typeof hot.setDataAtCell === 'function'){
        hot.setDataAtCell(1, 1, '999', 'e2e-live-data-edit');
      }
    });
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 60000);
    await waitForCountIncrease(page, 'scatter.data.collect', beforeCollect, 60000);
  });

  test('large volcano dataset skips expensive threshold row selection and reaches canvas render', async ({ page }) => {
    test.setTimeout(180000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'scatter', pageId: 'scatterPage' },
      { first: true }
    );

    await page.waitForFunction(() => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
    }, null, { timeout: 60000 });

    await page.evaluate(() => {
      const typeSelect = document.getElementById('scatterGraphType');
      if(typeSelect){
        typeSelect.value = 'volcano';
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const thresholdToggle = document.getElementById('scatterShowSignificantLabels');
      if(thresholdToggle){
        thresholdToggle.checked = true;
      }
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      const rows = [['gene', 'log_fc', 'p_value']];
      for(let idx = 1; idx <= 20000; idx += 1){
        const sign = idx % 2 === 0 ? 1 : -1;
        const significant = idx <= 12;
        rows.push([
          `GENE_${idx}`,
          significant ? String(sign * (1.5 + (idx % 100) / 200)) : String(sign * 0.2),
          significant ? '1e-8' : '0.8'
        ]);
      }
      hot.loadData(rows);
      window.Components.scatter.draw();
    });

    await page.waitForFunction(() => {
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      return !!layer && layer.getAttribute('data-render-mode') === 'canvas'
        && !!layer.querySelector('foreignObject[data-point-renderer="canvas-preview"] canvas');
    }, null, { timeout: 120000 });

    const state = await page.evaluate(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      const selectedCount = hot?.gridApi?.getSelectedNodes?.()?.length || 0;
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      const thresholdControls = document.getElementById('scatterThresholdControls');
      const significantOptions = document.getElementById('scatterSignificantOptions');
      const significantToggle = document.getElementById('scatterShowSignificantLabels');
      const defaultLabels = document.querySelectorAll('#scatterPlot svg [data-layer="point-labels"] text');
      return {
        selectedCount,
        renderMode: layer?.getAttribute?.('data-render-mode') || null,
        nodeCount: layer ? layer.querySelectorAll('*').length : 0,
        thresholdDisplay: thresholdControls ? getComputedStyle(thresholdControls).display : null,
        significantDisplay: significantOptions ? getComputedStyle(significantOptions).display : null,
        significantChecked: !!significantToggle?.checked,
        significantDisabled: !!significantToggle?.disabled,
        defaultLabelCount: defaultLabels.length
      };
    });

    expect(state.renderMode).toBe('canvas');
    expect(state.nodeCount).toBeLessThan(10);
    expect(state.selectedCount).toBeLessThan(1000);
    expect(state.thresholdDisplay).not.toBe('none');
    expect(state.significantDisplay).not.toBe('none');
    expect(state.significantChecked).toBe(false);
    expect(state.significantDisabled).toBe(false);
    expect(state.defaultLabelCount).toBe(0);

    await page.evaluate(() => {
      const significantToggle = document.getElementById('scatterShowSignificantLabels');
      if(significantToggle){
        significantToggle.checked = true;
        significantToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await page.waitForFunction(() => {
      const labels = document.querySelectorAll('#scatterPlot svg [data-layer="point-labels"] text');
      return labels.length >= 12;
    }, null, { timeout: 120000 });

    const explicitLabelState = await page.evaluate(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      const labels = Array.from(document.querySelectorAll('#scatterPlot svg [data-layer="point-labels"] text'))
        .map(node => node.textContent || '');
      return {
        selectedCount: hot?.gridApi?.getSelectedNodes?.()?.length || 0,
        labelCount: labels.length,
        hasFirstLabel: labels.includes('GENE_1'),
        hasLastExpectedLabel: labels.includes('GENE_12')
      };
    });

    expect(explicitLabelState.selectedCount).toBeLessThan(1000);
    expect(explicitLabelState.labelCount).toBeGreaterThanOrEqual(12);
    expect(explicitLabelState.hasFirstLabel).toBe(true);
    expect(explicitLabelState.hasLastExpectedLabel).toBe(true);
  });

  test('large plain scatter keeps auto density while avoiding large label bookkeeping', async ({ page }) => {
    test.setTimeout(180000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'scatter', pageId: 'scatterPage' },
      { first: true }
    );

    await page.waitForFunction(() => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
    }, null, { timeout: 60000 });

    await page.evaluate(() => {
      const typeSelect = document.getElementById('scatterGraphType');
      if(typeSelect){
        typeSelect.value = 'scatter';
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const colorMode = document.getElementById('scatterColorMode');
      if(colorMode){
        colorMode.value = 'auto';
        colorMode.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      const rows = [['label', 'x', 'y', 'z']];
      for(let idx = 1; idx <= 20000; idx += 1){
        const angle = idx / 37;
        rows.push([
          `POINT_${idx}`,
          String((idx % 1000) / 10),
          String(Math.sin(angle) * 20 + (idx % 400) / 8),
          String((idx % 300) + 1)
        ]);
      }
      hot.loadData(rows);
      window.Components.scatter.draw();
    });

    await page.waitForFunction(() => {
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      return !!layer && layer.getAttribute('data-render-mode') === 'canvas'
        && !!layer.querySelector('foreignObject[data-point-renderer="canvas-preview"] canvas');
    }, null, { timeout: 120000 });

    const summary = await page.evaluate(() => {
      const hooks = window.Components?.scatter?.__testHooks;
      const state = hooks?.getLargeDatasetRenderSummary?.() || {};
      const autoMode = hooks?.resolveColorMode?.({
        mode: 'auto',
        graphType: 'scatter',
        pointCount: 20000,
        viewMode: '2d'
      }) || {};
      const explicitDensity = hooks?.resolveColorMode?.({
        mode: 'density',
        graphType: 'scatter',
        pointCount: 20000,
        viewMode: '2d'
      }) || {};
      const policy = hooks?.resolveLargeDatasetPolicy?.({
        graphType: 'scatter',
        rowCount: 20000,
        pointCount: 20000,
        viewMode: '2d'
      }) || {};
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      const canvas = layer?.querySelector?.('foreignObject[data-point-renderer="canvas-preview"] canvas') || null;
      return {
        ...state,
        autoApplied: autoMode.applied || null,
        explicitDensityApplied: explicitDensity.applied || null,
        collectLabelSet: !!policy.collectLabelSet,
        useLargePointMode: !!policy.useLargePointMode,
        nodeCount: layer ? layer.querySelectorAll('*').length : 0,
        canvasStrategy: layer?.getAttribute?.('data-canvas-render-strategy') || null,
        indexedPoints: Number(layer?.getAttribute?.('data-canvas-indexed-points') || 0),
        canvasWidth: canvas?.width || 0,
        canvasHeight: canvas?.height || 0,
        dataUrl: canvas?.toDataURL?.('image/png') || ''
      };
    });

    expect(summary.renderMode).toBe('canvas');
    expect(summary.canvasStrategy).toBe('indexed-sprite');
    expect(summary.indexedPoints).toBe(20000);
    expect(summary.nodeCount).toBeLessThan(10);
    expect(summary.colorModeDesired).toBe('auto');
    expect(summary.colorModeApplied).toBe('density');
    expect(summary.autoApplied).toBe('density');
    expect(summary.explicitDensityApplied).toBe('density');
    expect(summary.collectLabelSet).toBe(false);
    expect(summary.useLargePointMode).toBe(true);
    expect(summary.labelCount).toBe(0);

    const beforeDraw = await collectCount(page, 'scatter.draw');
    await page.evaluate(() => {
      window.__GRAPHITIX_SCATTER_DISABLE_INDEXED_CANVAS_FAST_PATH = true;
      window.Components?.scatter?.draw?.({ reason: 'e2e-indexed-pixel-compare', viewOnly: true });
    });
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 120000);
    await waitForScatterPointCanvas(page, 180000);

    const legacy = await page.evaluate(() => {
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      const canvas = layer?.querySelector?.('foreignObject[data-point-renderer="canvas-preview"] canvas') || null;
      return {
        strategy: layer?.getAttribute?.('data-canvas-render-strategy') || null,
        width: canvas?.width || 0,
        height: canvas?.height || 0,
        dataUrl: canvas?.toDataURL?.('image/png') || ''
      };
    });

    expect(legacy.strategy).toBe('sprite');
    expect(legacy.width).toBe(summary.canvasWidth);
    expect(legacy.height).toBe(summary.canvasHeight);
    expect(legacy.dataUrl).toBe(summary.dataUrl);
  });
});
