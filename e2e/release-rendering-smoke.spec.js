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
    timeoutMs: 240_000,
    variants: [
      { id: 'pca:pca-2d', controls: { pcaMethod: 'pca', pcaViewMode: '2d' } },
      { id: 'pca:pca-3d', controls: { pcaMethod: 'pca', pcaViewMode: '3d' } },
      { id: 'pca:mds-2d', controls: { pcaMethod: 'mds', pcaViewMode: '2d' } },
      { id: 'pca:mds-3d', controls: { pcaMethod: 'mds', pcaViewMode: '3d' } },
      { id: 'pca:tsne-2d', controls: { pcaMethod: 'tsne', pcaViewMode: '2d' } },
      { id: 'pca:tsne-3d', controls: { pcaMethod: 'tsne', pcaViewMode: '3d' } },
      { id: 'pca:umap-2d', controls: { pcaMethod: 'umap', pcaViewMode: '2d' } },
      { id: 'pca:umap-3d', controls: { pcaMethod: 'umap', pcaViewMode: '3d' } }
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
    variants: [
      { id: 'line:line', controls: { lineDisplayMode: 'line', lineViewMode: '2d' } },
      { id: 'line:area', controls: { lineDisplayMode: 'area', lineViewMode: '2d' } },
      {
        id: 'line:line-3d-smoke',
        registry: false,
        controls: { lineDisplayMode: 'line', lineViewMode: '3d' }
      },
      {
        id: 'line:area-3d-smoke',
        registry: false,
        controls: { lineDisplayMode: 'area', lineViewMode: '3d' }
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
    await control.selectOption(value);
    await expect(control, `${component.type}: #${id} did not retain ${value}`).toHaveValue(value, { timeout: 20_000 });
  }
}

async function waitForVariantEvidence(page, component, variant) {
  await page.waitForFunction(({ type, pageId, primarySelector, variantId, controls }) => {
    const state = window.Main?.session?.workspaceState || null;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    if (!active || active.type !== type) return false;
    if (window.Components?.[type]?.ready !== true) return false;
    if (window.Shared?.componentLifecycle?.isRestoreTransactionActive?.(type, { tabId: active.id })) return false;
    const component = window.Components?.[type] || null;
    if (typeof component?.isIdleForSnapshot === 'function' && component.isIdleForSnapshot() !== true) return false;

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
      if (node instanceof HTMLCanvasElement) return node.width > 1 && node.height > 1;
      const tag = String(node.tagName || '').toLowerCase();
      if (tag === 'path') return String(node.getAttribute('d') || '').trim().length > 0;
      if (tag === 'polygon' || tag === 'polyline') return String(node.getAttribute('points') || '').trim().length > 0;
      if (tag === 'circle' || tag === 'ellipse') return Number(node.getAttribute('r') || node.getAttribute('rx')) > 0;
      const box = node.getBoundingClientRect?.();
      return !box || box.width > 0 || box.height > 0;
    };
    const countVisible = selector => Array.from(primary.querySelectorAll(selector)).filter(visible).length;

    if (type === 'venn') {
      const vennMarks = primary.querySelectorAll('[data-venn-trace-id]').length;
      const upsetMarks = primary.querySelectorAll('[data-upset-trace-kind]').length;
      return variantId === 'venn:upset'
        ? upsetMarks > 0 && vennMarks === 0
        : vennMarks > 0 && upsetMarks === 0;
    }

    if (type === 'pie') {
      const expectedMode = controls?.pieChartType || '';
      const traces = Array.from(primary.querySelectorAll('[data-pie-trace-mode]'));
      if (traces.length < 1 || !traces.every(trace => trace.getAttribute('data-pie-trace-mode') === expectedMode)) return false;
      if (expectedMode === 'stacked') {
        return countVisible('rect[data-pie-trace-mode="stacked"]') > 0
          && primary.querySelectorAll('path[data-pie-trace-mode="pie"], path[data-pie-trace-mode="donut"]').length === 0;
      }
      return countVisible(`path[data-pie-trace-mode="${expectedMode}"]`) > 0
        && primary.querySelectorAll('rect[data-pie-trace-mode="stacked"]').length === 0;
    }

    if (type === 'box') {
      if (variantId === 'box:violin') return countVisible('path[data-box-violin-density="1"]') > 0;
      if (variantId === 'box:bar') {
        return countVisible('[data-box-shape="body"]') > 0
          && countVisible('[data-box-overlay-kind="bar-error"]') > 0;
      }
      if (variantId === 'box:strip') {
        return countVisible('g[data-export-layer="box-points"] circle, g[data-export-layer="box-points"] path') > 0;
      }
      return countVisible('[data-box-shape="body"]') > 0;
    }

    if (type === 'scatter') {
      const svg = root.querySelector('#scatterSvg');
      const points = countVisible('g[data-export-layer="scatter-points"] > *');
      if (!svg || points < 1) return false;
      if (controls?.scatterViewMode === '3d') {
        return svg.dataset?.viewMode === '3d' && svg.dataset?.rotationControlsAttached === 'true';
      }
      if (controls?.scatterViewMode) return svg.dataset?.viewMode === controls.scatterViewMode;
      return true;
    }

    if (type === 'pca') {
      const svg = root.querySelector('#pcaSvg');
      const marks = countVisible('[data-plot-point="1"], canvas.pca-fast-points-layer');
      if (!svg || marks < 1) return false;
      if (controls?.pcaViewMode) return svg.dataset?.viewMode === controls.pcaViewMode;
      return true;
    }

    if (type === 'line') {
      const svg = root.querySelector('#lineSvg');
      if (!svg) return false;
      const marks = Array.from(svg.querySelectorAll('path, polyline, polygon, circle'))
        .filter(node => !node.closest('defs, clipPath, mask, pattern, symbol'))
        .filter(visible);
      if (marks.length < 1) return false;
      if (controls?.lineViewMode) return svg.dataset?.viewMode === controls.lineViewMode;
      return true;
    }

    if (type === 'hist') {
      const svg = root.querySelector('#histSvg');
      const mode = controls?.histPlotMode || '';
      if (!svg || svg.getAttribute('data-hist-plot-mode') !== mode) return false;
      if (mode === 'density') {
        return countVisible('[data-series-role="density-area"], [data-series-role="density-line"]') > 0;
      }
      return countVisible('[data-series-role="hist-fill"]') > 0;
    }

    if (type === 'heatmap') {
      const svg = root.querySelector('#heatmapSvg');
      const cells = countVisible('[data-export-layer="heatmap-cells"] rect');
      const renderType = window.Components?.heatmap?.__getState?.()?.lastRenderModel?.type || null;
      if (!svg || cells < 4) return false;
      return controls?.heatmapView === 'values' ? renderType === 'values' : renderType === 'correlation';
    }

    if (type === 'surface') {
      if (controls?.surfaceInterpolation === 'grid') {
        return countVisible('g.surface-faces polygon') > 0;
      }
      return countVisible('g.surface-points circle') > 0;
    }

    if (type === 'roc') return countVisible('svg#rocSvg path[data-series][d]') > 0;
    if (type === 'survival') return countVisible('svg#survivalSvg path[data-group][d]') > 0;

    return countVisible('path, rect, circle, line, polyline, polygon, ellipse, canvas') > 0;
  }, {
    type: component.type,
    pageId: component.pageId,
    primarySelector: component.primarySelector,
    variantId: variant.id,
    controls: variant.controls || {}
  }, { timeout: component.timeoutMs || 90_000 });
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
    const invalidPattern = /(?:NaN|Infinity|undefined)/i;
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
          if (invalidPattern.test(attr.value) && !badGeometry) badGeometry = `${tag}[${attr.name}=${attr.value}]`;
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
  await clickExampleButtonIfPresent(page, component.exampleButtonId);
  await expect(page.locator(primaryGraphSelector(component))).toBeVisible({ timeout: 45_000 });
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
    test.setTimeout(component.timeoutMs || 180_000);
    const issues = await openComponentWithExample(page, component);
    const snapshots = [];

    for (const variant of component.variants) {
      await test.step(variant.id, async () => {
        await applyControls(page, component, variant.controls);
        await waitForVariantEvidence(page, component, variant);
        const snapshot = await waitForStableVisualSnapshot(page, component);

        expect(snapshot.ok, `${variant.id}: primary graph should exist`).toBe(true);
        expect(snapshot.primaryWidth, `${variant.id}: graph width should be usable`).toBeGreaterThan(80);
        expect(snapshot.primaryHeight, `${variant.id}: graph height should be usable`).toBeGreaterThan(80);
        expect(snapshot.primitiveCount, `${variant.id}: graph should contain painted primitives`).toBeGreaterThan(0);
        expect(snapshot.badGeometry, `${variant.id}: invalid SVG/canvas geometry`).toBeNull();
        expect(snapshot.visibleLoadingOverlays, `${variant.id}: loading overlay remained visible`).toEqual([]);

        snapshots.push({ id: variant.id, ...snapshot });
      });
    }

    const collisions = snapshots.flatMap((left, index) => snapshots.slice(index + 1)
      .filter(right => right.graphHash === left.graphHash && right.primitiveCount === left.primitiveCount)
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
