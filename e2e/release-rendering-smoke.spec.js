/**
 * Release rendering smoke gate.
 *
 * Purpose: prove that every user-facing graph variant can be selected in a real
 * browser and actually publishes the corresponding graph, rather than merely
 * updating a control value or payload field.
 *
 * This suite is intentionally small compared with the full E2E matrix. It checks:
 * - every public graph variant registered in Main.graphVariants is covered;
 * - the user-facing controls accept the requested mode;
 * - a non-empty primary graph is painted at a usable size;
 * - variant-specific renderer evidence is present (and incompatible stale marks
 *   are absent where the distinction is critical, e.g. Venn vs UpSet);
 * - the painted geometry changes between distinct variants of a component;
 * - no NaN/Infinity/undefined geometry, stuck loading overlay, page error, or
 *   unexpected console error is produced.
 */
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const COMPONENTS = [
  {
    type: 'venn',
    pageId: 'vennPage',
    exampleButtonId: 'sample',
    primarySelector: '#stage',
    variants: [
      { id: 'venn:diagram', controls: { vennPlotType: 'venn' } },
      { id: 'venn:upset', controls: { vennPlotType: 'upset' } }
    ]
  },
  {
    type: 'box',
    pageId: 'boxPage',
    exampleButtonId: 'boxLoadExample',
    primarySelector: '#boxPlot',
    variants: [
      { id: 'box:box', controls: { boxGraphType: 'box' } },
      { id: 'box:notched', controls: { boxGraphType: 'notched' } },
      { id: 'box:bar', controls: { boxGraphType: 'bar' } },
      { id: 'box:strip', controls: { boxGraphType: 'strip' } },
      { id: 'box:violin', controls: { boxGraphType: 'violin' } }
    ]
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    exampleButtonId: 'scatterLoadExample',
    primarySelector: '#scatterPlot',
    examplePerVariant: true,
    variants: [
      { id: 'scatter:scatter-2d', controls: { scatterGraphType: 'scatter', scatterViewMode: '2d' } },
      { id: 'scatter:scatter-bubble', controls: { scatterGraphType: 'scatter', scatterViewMode: 'bubble' } },
      { id: 'scatter:scatter-3d', controls: { scatterGraphType: 'scatter', scatterViewMode: '3d' } },
      { id: 'scatter:volcano', controls: { scatterGraphType: 'volcano' } },
      { id: 'scatter:ma', controls: { scatterGraphType: 'ma' } }
    ]
  },
  {
    type: 'pca',
    pageId: 'pcaPage',
    exampleButtonId: 'pcaLoadExample',
    primarySelector: '#pcaPlot',
    testTimeoutMs: 600_000,
    evidenceTimeoutMs: 180_000,
    variants: [
      { id: 'pca:pca-2d', controls: { pcaMethod: 'pca', pcaViewMode: '2d' } },
      { id: 'pca:pca-3d', controls: { pcaMethod: 'pca', pcaViewMode: '3d' } },
      { id: 'pca:mds-2d', controls: { pcaMethod: 'mds', pcaViewMode: '2d' } },
      { id: 'pca:mds-3d', controls: { pcaMethod: 'mds', pcaViewMode: '3d' } },
      { id: 'pca:tsne-2d', controls: { pcaMethod: 'tsne', pcaViewMode: '2d' } },
      { id: 'pca:umap-2d', controls: { pcaMethod: 'umap', pcaViewMode: '2d' } }
    ]
  },
  {
    type: 'surface',
    pageId: 'surfacePage',
    exampleButtonId: 'surfaceLoadExample',
    primarySelector: '#surfaceSvg',
    variants: [
      { id: 'surface:grid', controls: { surfaceInterpolation: 'grid' } },
      { id: 'surface:points', controls: { surfaceInterpolation: 'scatter' } }
    ]
  },
  {
    type: 'line',
    pageId: 'linePage',
    exampleButtonId: 'lineLoadExample',
    primarySelector: '#linePlot',
    examplePerVariant: true,
    variants: [
      { id: 'line:line', controls: { lineDisplayMode: 'line', lineViewMode: '2d' } },
      { id: 'line:area', controls: { lineDisplayMode: 'area', lineViewMode: '2d' } },
      {
        id: 'line:3d-smoke',
        registry: false,
        controls: { lineViewMode: '3d' }
      }
    ]
  },
  {
    type: 'heatmap',
    pageId: 'heatmapPage',
    exampleButtonId: 'heatmapLoadExample',
    primarySelector: '#heatmapSvg',
    variants: [
      { id: 'heatmap:values', controls: { heatmapView: 'values' } },
      { id: 'heatmap:corr-columns', controls: { heatmapView: 'corr-columns' } },
      { id: 'heatmap:corr-rows', controls: { heatmapView: 'corr-rows' } }
    ]
  },
  {
    type: 'roc',
    pageId: 'rocPage',
    exampleButtonId: 'rocLoadExample',
    primarySelector: '#rocPlot',
    variants: [
      { id: 'roc:roc', controls: { rocGraphType: 'roc' } },
      { id: 'roc:pr', controls: { rocGraphType: 'pr' } }
    ]
  },
  {
    type: 'survival',
    pageId: 'survivalPage',
    exampleButtonId: 'survivalLoadExample',
    primarySelector: '#survivalPlot',
    variants: [
      { id: 'survival:km', controls: {} }
    ]
  },
  {
    type: 'hist',
    pageId: 'histPage',
    exampleButtonId: 'histLoadExample',
    primarySelector: '#histPlot',
    variants: [
      { id: 'hist:hist', controls: { histPlotMode: 'histogram' } },
      { id: 'hist:density', controls: { histPlotMode: 'density' } }
    ]
  },
  {
    type: 'pie',
    pageId: 'piePage',
    exampleButtonId: 'pieLoadExample',
    primarySelector: '#piePlot',
    variants: [
      { id: 'pie:pie', controls: { pieChartType: 'pie' } },
      { id: 'pie:donut', controls: { pieChartType: 'donut' } },
      { id: 'pie:stacked', controls: { pieChartType: 'stacked' } }
    ]
  }
];

const REGISTERED_VARIANT_IDS = COMPONENTS
  .flatMap(component => component.variants)
  .filter(variant => variant.registry !== false)
  .map(variant => variant.id)
  .sort();

function primaryGraphSelector(component) {
  return `#${component.pageId}:not([hidden]) ${component.primarySelector}`;
}

async function applyControls(page, component, controls) {
  for (const [id, value] of Object.entries(controls || {})) {
    const selector = `#${component.pageId}:not([hidden]) #${id}`;
    const control = page.locator(selector).first();
    await expect(control, `${component.type}: missing graph mode control #${id}`).toBeVisible({ timeout: 20_000 });
    const optionIndex = await control.locator('option').evaluateAll((options, expected) => (
      options.findIndex(option => String(option.value) === String(expected))
    ), value);
    expect(optionIndex, `${component.type}: #${id} has no option ${value}`).toBeGreaterThanOrEqual(0);
    // Use the same trusted keyboard path as a user. Programmatic selectOption()
    // can hide an input-before-change race by dispatching both events together.
    await control.focus();
    await control.press('Home');
    for (let index = 0; index < optionIndex; index += 1) {
      await control.press('ArrowDown');
    }
    await expect(control, `${component.type}: #${id} did not retain ${value}`).toHaveValue(value, { timeout: 20_000 });
  }
}

async function waitForVariantEvidence(page, component, variant, previousSignature = null) {
  const evidenceHandle = await page.waitForFunction(({ type, pageId, primarySelector, variantId, controls, previousSignature: prior }) => {
    const state = window.Main?.session?.workspaceState || null;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    if (!active || active.type !== type) return false;
    if (window.Components?.[type]?.ready !== true) return false;
    if (window.Shared?.componentLifecycle?.isRestoreTransactionActive?.(type, { tabId: active.id })) return false;
    const component = window.Components?.[type] || null;
    const publication = window.Shared?.componentLifecycle?.isPublicationSettled?.(component, {
      componentKey: type,
      tabId: active.id
    });
    if (publication?.staged === true) return false;

    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type)
      || document.querySelector(`#${pageId}:not([hidden])`)
      || null;
    if (!root) return false;

    for (const [id, expected] of Object.entries(controls || {})) {
      if (String(root.querySelector(`#${id}`)?.value ?? '') !== String(expected)) return false;
    }

    const primary = root.matches?.(primarySelector) ? root : root.querySelector?.(primarySelector);
    if (!primary) return false;
    const bounds = primary.getBoundingClientRect?.();
    if (!bounds || bounds.width < 80 || bounds.height < 80) return false;

    const visible = node => {
      if (!node) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      if (node.getClientRects && node.getClientRects().length === 0) return false;
      if (node instanceof HTMLCanvasElement) return node.width > 1 && node.height > 1;
      const tag = String(node.tagName || '').toLowerCase();
      if (tag === 'path') return String(node.getAttribute('d') || '').trim().length > 0;
      if (tag === 'polygon' || tag === 'polyline') return String(node.getAttribute('points') || '').trim().length > 0;
      if (tag === 'circle' || tag === 'ellipse') return Number(node.getAttribute('r') || node.getAttribute('rx')) > 0;
      if (tag === 'line') {
        const x1 = Number(node.getAttribute('x1'));
        const x2 = Number(node.getAttribute('x2'));
        const y1 = Number(node.getAttribute('y1'));
        const y2 = Number(node.getAttribute('y2'));
        return (Number.isFinite(x1) && Number.isFinite(x2) && Number.isFinite(y1) && Number.isFinite(y2))
          && (x1 !== x2 || y1 !== y2);
      }
      const box = node.getBoundingClientRect?.();
      return !box || (box.width > 0 && box.height > 0);
    };
    const countVisible = selector => Array.from(primary.querySelectorAll(selector)).filter(visible).length;
    const geometry = selector => Array.from(primary.querySelectorAll(selector))
      .filter(visible)
      .map(node => ['d', 'points', 'x', 'y', 'cx', 'cy', 'r', 'width', 'height', 'transform']
        .map(name => `${name}=${node.getAttribute(name) || ''}`).join(','))
      .join('|');
    const text = selector => String(primary.querySelector(selector)?.textContent || '').trim();
    const result = (ok, signature, details = {}) => !ok || (prior && signature === prior)
      ? false
      : ({ ok: true, signature, ...details });

    if (type === 'venn') {
      const vennMarks = primary.querySelectorAll('[data-venn-trace-id]').length;
      const upsetMarks = primary.querySelectorAll('[data-upset-trace-kind]').length;
      const ok = variantId === 'venn:upset'
        ? upsetMarks > 0 && vennMarks === 0
        : vennMarks > 0 && upsetMarks === 0;
      return result(ok, `venn=${vennMarks}|upset=${upsetMarks}|${geometry('[data-venn-trace-id], [data-upset-trace-kind]')}`);
    }

    if (type === 'pie') {
      const expectedMode = controls?.pieChartType || '';
      const traces = Array.from(primary.querySelectorAll('[data-pie-trace-mode]'));
      if (traces.length < 1 || !traces.every(trace => trace.getAttribute('data-pie-trace-mode') === expectedMode)) return false;
      if (expectedMode === 'stacked') {
        return result(countVisible('rect[data-pie-trace-mode="stacked"]') > 0
          && primary.querySelectorAll('path[data-pie-trace-mode="pie"], path[data-pie-trace-mode="donut"]').length === 0,
          `mode=${expectedMode}|${geometry('[data-pie-trace-mode]')}`);
      }
      return result(countVisible(`path[data-pie-trace-mode="${expectedMode}"]`) > 0
        && primary.querySelectorAll('rect[data-pie-trace-mode="stacked"]').length === 0,
        `mode=${expectedMode}|${geometry('[data-pie-trace-mode]')}`);
    }

    if (type === 'box') {
      const bodies = countVisible('[data-box-shape="body"]:not([data-summary-line="1"])');
      const rectBodies = countVisible('rect[data-box-shape="body"]:not([data-summary-line="1"])');
      const pathBodies = countVisible('path[data-box-shape="body"]:not([data-summary-line="1"])');
      const density = countVisible('path[data-box-violin-density="1"]');
      const barErrors = countVisible('[data-box-overlay-kind="bar-error"]');
      const notchedMedian = countVisible('[data-box-overlay-kind="notched-median"]');
      let ok = false;
      if (variantId === 'box:violin') ok = density > 0 && bodies > 0 && barErrors === 0;
      if (variantId === 'box:bar') {
        ok = pathBodies > 0 && barErrors > 0 && notchedMedian === 0;
      }
      if (variantId === 'box:strip') {
        ok = countVisible('g[data-export-layer="box-points"] circle, g[data-export-layer="box-points"] path') > 0 && bodies === 0;
      }
      if (variantId === 'box:box') ok = rectBodies > 0 && pathBodies === 0 && density === 0 && barErrors === 0;
      if (variantId === 'box:notched') ok = pathBodies > 0 && notchedMedian > 0 && density === 0 && barErrors === 0;
      return result(ok, `bodies=${bodies}|rect=${rectBodies}|path=${pathBodies}|density=${density}|barErrors=${barErrors}|notched=${notchedMedian}|${geometry('[data-box-shape="body"]:not([data-summary-line="1"])')}`);
    }

    if (type === 'scatter') {
      const svg = root.querySelector('#scatterSvg');
      const points = countVisible('g[data-export-layer="scatter-points"] > *');
      if (!svg || points < 1) return false;
      const requestedView = controls?.scatterViewMode || '2d';
      const requestedGraph = controls?.scatterGraphType || 'scatter';
      const renderedGraph = svg.dataset?.scatterGraphType || '';
      if (requestedView === '3d') {
        return result(renderedGraph === requestedGraph
          && svg.dataset?.viewMode === '3d'
          && svg.dataset?.rotationControlsAttached === 'true',
          `graph=${renderedGraph}|view=3d|${geometry('[data-plot-point="1"]')}`);
      }
      if (requestedView === 'bubble') {
        const radii = Array.from(svg.querySelectorAll('[data-plot-point="1"]'))
          .map(node => Number(node.getAttribute('r')))
          .filter(value => Number.isFinite(value) && value > 0);
        const distinctRadii = new Set(radii.map(value => value.toFixed(3)));
        return result(renderedGraph === requestedGraph
          && svg.dataset?.viewMode === '2d'
          && radii.length > 1
          && distinctRadii.size > 1,
          `graph=${renderedGraph}|view=bubble|radii=${Array.from(distinctRadii).join(',')}|${geometry('[data-plot-point="1"]')}`);
      }
      return result(renderedGraph === requestedGraph && svg.dataset?.viewMode === '2d',
        `graph=${renderedGraph}|view=2d|${text('[data-font-role="graphTitle"]')}|${geometry('[data-plot-point="1"]')}`);
    }

    if (type === 'pca') {
      const svg = root.querySelector('#pcaSvg');
      const marks = countVisible('[data-plot-point="1"], canvas.pca-fast-points-layer');
      if (!svg || marks < 1) return false;
      return result(svg.dataset?.pcaMethod === (controls?.pcaMethod || 'pca')
        && (!controls?.pcaViewMode || svg.dataset?.viewMode === controls.pcaViewMode),
        `method=${svg.dataset?.pcaMethod || ''}|view=${svg.dataset?.viewMode || ''}|${text('[data-font-role="graphTitle"], [data-graph-title]')}|${geometry('[data-plot-point="1"]')}`);
    }

    if (type === 'line') {
      const svg = root.querySelector('#lineSvg');
      if (!svg) return false;
      const marks = Array.from(svg.querySelectorAll('path, polyline, polygon, circle'))
        .filter(node => !node.closest('defs, clipPath, mask, pattern, symbol'))
        .filter(visible);
      if (marks.length < 1) return false;
      if (controls?.lineViewMode === '3d') {
        const displayMode = root.querySelector('#lineDisplayMode');
        return result(svg.dataset?.viewMode === '3d'
          && !!svg.querySelector('[data-layer="line-3d-rotation-dynamic"]')
          && displayMode?.value === 'line'
          && displayMode?.disabled === true,
          `view=3d|${geometry('[data-layer="line-3d-rotation-dynamic"] path, [data-layer="line-3d-rotation-dynamic"] polyline')}`);
      }
      if (svg.dataset?.viewMode === '3d') return false;
      if (controls?.lineDisplayMode === 'area') {
        return result(countVisible('path[data-line-style-role="area"][data-render-mode="area-fill"]') > 0
          && countVisible('path[data-render-mode="area"]') > 0,
          `view=2d|area|${geometry('path[data-line-style-role="area"]')}`);
      }
      return result(countVisible('path[data-render-mode="line"]') > 0
        && primary.querySelectorAll('[data-line-style-role="area"]').length === 0,
        `view=2d|line|${geometry('path[data-render-mode="line"]')}`);
    }

    if (type === 'hist') {
      const svg = root.querySelector('#histSvg');
      const mode = controls?.histPlotMode || '';
      if (!svg || svg.getAttribute('data-hist-plot-mode') !== mode) return false;
      if (mode === 'density') {
        return result(countVisible('[data-series-role="density-area"], [data-series-role="density-line"]') > 0,
          `mode=${mode}|${geometry('[data-series-role="density-area"], [data-series-role="density-line"]')}`);
      }
      return result(countVisible('[data-series-role="hist-fill"]') > 0
        && countVisible('[data-series-role="density-area"], [data-series-role="density-line"]') === 0,
        `mode=${mode}|${geometry('[data-series-role="hist-fill"]')}`);
    }

    if (type === 'heatmap') {
      const svg = root.querySelector('#heatmapSvg');
      const cells = countVisible('[data-export-layer="heatmap-cells"] rect');
      if (!svg || cells < 4) return false;
      const expectedView = controls?.heatmapView || '';
      const expectedModel = expectedView === 'values' ? 'values' : 'correlation';
      return result(svg.dataset?.heatmapView === expectedView
        && svg.dataset?.heatmapModelType === expectedModel
        && svg.getAttribute('data-heatmap-render-complete') === 'true'
        && svg.getAttribute('data-heatmap-render-state') === 'complete',
        `view=${svg.dataset?.heatmapView || ''}|model=${svg.dataset?.heatmapModelType || ''}|${geometry('[data-export-layer="heatmap-cells"] rect')}`);
    }

    if (type === 'surface') {
      const svg = root.querySelector('#surfaceSvg');
      if (!svg) return false;
      if (controls?.surfaceInterpolation === 'grid') {
        return result(svg.getAttribute('data-surface-render-mode') === 'grid'
          && countVisible('g.surface-faces polygon') > 0,
          `mode=${svg.getAttribute('data-surface-render-mode') || ''}|faces|${geometry('g.surface-faces polygon')}`);
      }
      return result(svg.getAttribute('data-surface-render-mode') === 'scatter'
        && countVisible('g.surface-points circle') > 0
        && countVisible('g.surface-faces polygon') === 0,
        `mode=${svg.getAttribute('data-surface-render-mode') || ''}|points|${geometry('g.surface-points circle')}`);
    }

    if (type === 'roc') {
      const svg = root.querySelector('#rocSvg');
      const expected = controls?.rocGraphType || 'roc';
      const xLabel = text('[data-font-role="xTitle"]');
      const yLabel = text('[data-font-role="yTitle"]');
      const title = text('[data-font-role="graphTitle"]');
      return result(!!svg
        && svg.dataset?.rocGraphType === expected
        && countVisible('path[data-series][d]') > 0
        && (expected === 'pr'
          ? xLabel === 'Recall' && yLabel === 'Precision' && /Precision-Recall/i.test(title)
          : xLabel === 'False Positive Rate' && yLabel === 'True Positive Rate' && /^ROC curve$/i.test(title)),
        `mode=${svg?.dataset?.rocGraphType || ''}|x=${xLabel}|y=${yLabel}|title=${title}|${geometry('path[data-series][d]')}`);
    }
    if (type === 'survival') {
      const svg = root.querySelector('#survivalSvg');
      return result(!!svg && countVisible('path[data-group][d]:not([data-survival-censor-mark="1"])') > 0,
        `${text('[data-font-role="graphTitle"]')}|${geometry('path[data-group][d]:not([data-survival-censor-mark="1"])')}`);
    }

    return result(countVisible('path, rect, circle, line, polyline, polygon, ellipse, canvas') > 0,
      `${geometry('path, rect, circle, line, polyline, polygon, ellipse, canvas')}`);
  }, {
    type: component.type,
    pageId: component.pageId,
    primarySelector: component.primarySelector,
    variantId: variant.id,
    controls: variant.controls || {},
    previousSignature
  }, { timeout: component.evidenceTimeoutMs || 90_000 });
  return evidenceHandle.jsonValue();
}

async function readVisualSnapshot(page, component) {
  return page.evaluate(({ type, pageId, primarySelector }) => {
    const state = window.Main?.session?.workspaceState || null;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type)
        || document.querySelector(`#${pageId}:not([hidden])`))
      : null;
    const primary = root?.matches?.(primarySelector) ? root : root?.querySelector?.(primarySelector);
    if (!root || !primary) return { ok: false, reason: 'missing-primary' };

    const geometryAttributes = [
      'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
      'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'transform',
      'fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity'
    ];
    const invalidPattern = /(?:^|[^A-Za-z])(?:NaN|[+-]?Infinity|undefined)(?:[^A-Za-z]|$)/i;
    const parts = [];
    const tagCounts = {};
    let badGeometry = null;

    const nodes = Array.from(primary.querySelectorAll('path, rect, circle, line, polyline, polygon, ellipse, canvas'))
      .filter(node => !node.closest('defs, clipPath, mask, pattern, symbol'));

    for (const node of nodes) {
      const tag = String(node.tagName || '').toLowerCase();
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      const attrs = [];
      if (node instanceof HTMLCanvasElement) {
        attrs.push(`width=${node.width}`, `height=${node.height}`);
        try {
          const image = node.toDataURL('image/png');
          if (image && image.length > 32) attrs.push(`pixels=${image.slice(-2048)}`);
        } catch (_err) {
          attrs.push('pixels=unavailable');
        }
      } else {
        for (const name of geometryAttributes) {
          if (!node.hasAttribute?.(name)) continue;
          const value = String(node.getAttribute(name) || '');
          if (!badGeometry && invalidPattern.test(value)) badGeometry = `${tag}[${name}=${value}]`;
          attrs.push(`${name}=${value}`);
        }
        for (const attr of Array.from(node.attributes || [])) {
          if (!attr.name.startsWith('data-')) continue;
          if (/e2e|token|timestamp|staged-frame/i.test(attr.name)) continue;
          if (!badGeometry && invalidPattern.test(attr.value)) badGeometry = `${tag}[${attr.name}=${attr.value}]`;
          attrs.push(`${attr.name}=${attr.value}`);
        }
      }
      parts.push(`${tag}{${attrs.sort().join(';')}}`);
    }

    let hash = 2166136261;
    const source = parts.join('|');
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const graphHash = (hash >>> 0).toString(16).padStart(8, '0');

    const primaryBounds = primary.getBoundingClientRect();
    const visibleLoadingOverlays = Array.from(root.querySelectorAll(
      '.venn-loading-overlay, .loading-overlay, [data-loading-overlay]'
    )).filter(node => {
      const style = window.getComputedStyle(node);
      return !node.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && node.getBoundingClientRect().width > 1
        && node.getBoundingClientRect().height > 1;
    }).map(node => node.id || node.className || node.getAttribute('aria-label') || node.tagName);

    return {
      ok: true,
      graphHash,
      primitiveCount: nodes.length,
      tagCounts,
      badGeometry,
      primaryWidth: primaryBounds.width,
      primaryHeight: primaryBounds.height,
      visibleLoadingOverlays
    };
  }, {
    type: component.type,
    pageId: component.pageId,
    primarySelector: component.primarySelector
  });
}

async function waitForStableVisualSnapshot(page, component) {
  let previous = null;
  let stableMatches = 0;
  let latest = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    latest = await readVisualSnapshot(page, component);
    if (latest?.ok && latest.primitiveCount > 0 && !latest.badGeometry) {
      if (previous && previous.graphHash === latest.graphHash && previous.primitiveCount === latest.primitiveCount) {
        stableMatches += 1;
      } else {
        stableMatches = 0;
      }
      if (stableMatches >= 1) return latest;
    }
    previous = latest;
    await page.waitForTimeout(150);
  }
  throw new Error(`${component.type}: primary graph did not reach a stable painted state: ${JSON.stringify(latest)}`);
}

async function openComponentWithExample(page, component) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, component, { first: true });
  await page.waitForFunction(type => window.Components?.[type]?.ready === true, component.type, { timeout: 45_000 });
  if (!component.examplePerVariant) {
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await expect(page.locator(primaryGraphSelector(component))).toBeVisible({ timeout: 45_000 });
  }
  return issues;
}

test('release smoke matrix covers every public graph variant', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.Main?.graphVariants?.list === 'function');
  const registered = await page.evaluate(() => window.Main.graphVariants.list().map(entry => entry.id).sort());
  expect(
    registered,
    'Every public Main.graphVariants entry must have a release-rendering smoke case. Add new graph types here before release.'
  ).toEqual(REGISTERED_VARIANT_IDS);
});

for (const component of COMPONENTS) {
  test(`${component.type}: every graph mode publishes distinct, healthy renderer output`, async ({ page }) => {
    test.setTimeout(component.testTimeoutMs || 180_000);
    const issues = await openComponentWithExample(page, component);
    const snapshots = [];
    let previousSignature = null;

    for (const variant of component.variants) {
      await test.step(variant.id, async () => {
        await applyControls(page, component, variant.controls);
        if (component.examplePerVariant) {
          await clickExampleButtonIfPresent(page, component.exampleButtonId);
        }
        const evidence = await waitForVariantEvidence(page, component, variant, previousSignature);
        const snapshot = await waitForStableVisualSnapshot(page, component);
        const settledEvidence = await waitForVariantEvidence(page, component, variant, previousSignature);
        expect(settledEvidence.signature, `${variant.id}: renderer changed after it was declared settled`).toBe(evidence.signature);

        expect(snapshot.ok, `${variant.id}: primary graph should exist`).toBe(true);
        expect(snapshot.primaryWidth, `${variant.id}: graph width should be usable`).toBeGreaterThan(80);
        expect(snapshot.primaryHeight, `${variant.id}: graph height should be usable`).toBeGreaterThan(80);
        expect(snapshot.primitiveCount, `${variant.id}: graph should contain painted primitives`).toBeGreaterThan(0);
        expect(snapshot.badGeometry, `${variant.id}: invalid SVG/canvas geometry`).toBeNull();
        expect(snapshot.visibleLoadingOverlays, `${variant.id}: loading overlay remained visible`).toEqual([]);

        previousSignature = evidence.signature;
        snapshots.push({ id: variant.id, rendererSignature: evidence.signature, ...snapshot });
      });
    }

    const collisions = snapshots.flatMap((left, index) => snapshots.slice(index + 1)
      .filter(right => right.rendererSignature === left.rendererSignature)
      .map(right => [left.id, right.id]));
    expect(
      collisions,
      `${component.type}: different graph modes produced indistinguishable painted geometry. This usually means a selector changed without the renderer switching. Snapshots: ${JSON.stringify(snapshots)}`
    ).toEqual([]);

    expect(
      issues.critical,
      `${component.type}: unexpected browser errors during release smoke: ${JSON.stringify(issues.critical.slice(0, 10), null, 2)}`
    ).toEqual([]);
  });
}
