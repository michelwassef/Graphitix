const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');
const fs = require('fs');
const path = require('path');

function loadHeatmapHarness() {
  jest.resetModules();
  initializeWorkspaceHarness();
  require('../js/vendor.js');
  require('../js/shared/chartStyle.js');
  require('../js/shared/debounce.js');
  require('../js/shared/componentLifecycle.js');
  require('../js/shared/resizer.js');
  require('../js/shared/colorPicker.js');
  require('../js/shared/hot.js');
  require('../js/shared/componentLayout.js');
  require('../js/shared/dataTransforms.js');
  require('../js/shared/dataViews.js');
  require('../js/shared/exportProjection.js');
  require('../js/shared/exporter.js');
  require('../js/shared/workspaceToolbar.js');
  require('../js/shared/workspaceToolbarAccess.js');
  require('../js/components/heatmap.js');
}

describe('Heatmap dendrogram and dense projection geometry', () => {
  beforeEach(loadHeatmapHarness);

  function leaf(index) {
    return { indices: [index], distance: 0 };
  }

  test('color-scale gradient IDs are deterministic and owner-scoped', () => {
    const buildId = window.Components.heatmap.__testHooks.buildScaleGradientId;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'heatmapSvg';

    expect(buildId('workspace-12', svg)).toBe('heatmap-scale-workspace-12');
    expect(buildId('workspace-12', svg)).toBe('heatmap-scale-workspace-12');
    expect(buildId('workspace:13 / heatmap', svg)).toBe('heatmap-scale-workspace-13-heatmap');
    expect(buildId('workspace-13', svg)).not.toBe(buildId('workspace-12', svg));
    expect(buildId(null, svg)).toBe('heatmap-scale-heatmapSvg');
  });

  test('column dendrogram joins both leaf stems at the merge height', () => {
    const geometry = window.Components.heatmap.__testHooks.buildDendrogramGeometry({
      tree: {
        left: leaf(0),
        right: leaf(1),
        indices: [0, 1],
        distance: 1
      },
      order: [0, 1],
      startX: 0,
      startY: 100,
      length: 40,
      cellStep: 20,
      maxDistance: 2,
      orientation: 'horizontal'
    });

    expect(geometry.branchCount).toBe(1);
    expect(geometry.segmentCount).toBe(3);
    expect(geometry.path).toContain('M10 100V120');
    expect(geometry.path).toContain('M30 100V120');
    expect(geometry.path).toContain('M10 120H30');
    expect(geometry.path).not.toContain('M10 100V120H20');
  });

  test('row dendrogram joins both leaf stems at the merge distance', () => {
    const geometry = window.Components.heatmap.__testHooks.buildDendrogramGeometry({
      tree: {
        left: leaf(0),
        right: leaf(1),
        indices: [0, 1],
        distance: 1
      },
      order: [0, 1],
      startX: 100,
      startY: 0,
      length: 40,
      cellStep: 20,
      maxDistance: 2,
      orientation: 'vertical'
    });

    expect(geometry.branchCount).toBe(1);
    expect(geometry.segmentCount).toBe(3);
    expect(geometry.path).toContain('M100 10H120');
    expect(geometry.path).toContain('M100 30H120');
    expect(geometry.path).toContain('M120 10V30');
  });

  test('left row dendrogram grows away from the matrix without changing leaf geometry', () => {
    const geometry = window.Components.heatmap.__testHooks.buildDendrogramGeometry({
      tree: {
        left: leaf(0),
        right: leaf(1),
        indices: [0, 1],
        distance: 1
      },
      order: [0, 1],
      startX: 100,
      startY: 0,
      length: 40,
      cellStep: 20,
      maxDistance: 2,
      orientation: 'vertical',
      direction: -1
    });

    expect(geometry.direction).toBe(-1);
    expect(geometry.path).toContain('M80 10H100');
    expect(geometry.path).toContain('M80 30H100');
    expect(geometry.path).toContain('M80 10V30');
  });

  test('render geometry normalizes non-monotonic linkage heights without changing leaf order', () => {
    const leftCluster = {
      left: leaf(0),
      right: leaf(1),
      indices: [0, 1],
      distance: 2
    };
    const tree = {
      left: leftCluster,
      right: leaf(2),
      indices: [0, 1, 2],
      distance: 1
    };
    const geometry = window.Components.heatmap.__testHooks.buildDendrogramGeometry({
      tree,
      order: [0, 1, 2],
      startX: 0,
      startY: 0,
      length: 100,
      cellStep: 10,
      maxDistance: 2,
      orientation: 'vertical'
    });

    expect(geometry.inversionCount).toBe(1);
    expect(geometry.root.distance).toBe(2);
    expect(geometry.root.x).toBe(100);
    expect(geometry.path).not.toMatch(/H-\d|V-\d/);
  });

  test('overlapping collinear branches are merged without dropping visible geometry', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const merged = hooks.mergeDendrogramSegments([
      { axis: 'vertical', fixed: 10, start: 0, end: 5 },
      { axis: 'vertical', fixed: 10, start: 4, end: 9 },
      { axis: 'vertical', fixed: 10, start: 9, end: 12 },
      { axis: 'horizontal', fixed: 3, start: 1, end: 4 },
      { axis: 'horizontal', fixed: 3, start: 2, end: 6 }
    ]);

    expect(merged).toEqual(expect.arrayContaining([
      { axis: 'vertical', fixed: 10, start: 0, end: 12 },
      { axis: 'horizontal', fixed: 3, start: 1, end: 6 }
    ]));
    expect(merged).toHaveLength(2);
  });

  test('portable export preserves non-scaling dendrogram semantics for the shared exporter', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.getBoundingClientRect = () => ({ width: 400, height: 200 });

    const dendrogram = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dendrogram.setAttribute('class', 'heatmap-dendrogram');
    dendrogram.setAttribute('stroke', '#3d3d3d');
    dendrogram.setAttribute('stroke-width', '4');
    dendrogram.setAttribute('stroke-linecap', 'square');
    dendrogram.setAttribute('vector-effect', 'non-scaling-stroke');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M10 20H50M50 10V30');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    dendrogram.appendChild(path);
    svg.appendChild(dendrogram);

    const exported = window.Components.heatmap.__testHooks.buildExportSvgFromSource(svg);
    const exportedGroup = exported.querySelector('.heatmap-dendrogram');
    const exportedPath = exportedGroup.querySelector('path');

    expect(exported.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(exported.getAttribute('preserveAspectRatio')).toBe('none');
    expect(exportedGroup.getAttribute('stroke-linecap')).toBe('square');
    expect(exportedGroup.getAttribute('stroke-width')).toBe('4');
    expect(exportedGroup.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(exportedPath.getAttribute('d')).toBe('M10 20H50M50 10V30');
    expect(exportedPath.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(dendrogram.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(path.getAttribute('vector-effect')).toBe('non-scaling-stroke');

    const copiedXml = window.Shared.exporter.svgElementToXml(exported, 'heatmap-dendrogram-copy', {
      ownerFrame: { width: 400, height: 200 }
    });
    const copiedSvg = new DOMParser().parseFromString(copiedXml, 'image/svg+xml').documentElement;
    expect(Number(copiedSvg.getAttribute('width'))).toBeCloseTo(400, 6);
    expect(Number(copiedSvg.getAttribute('height'))).toBeCloseTo(200, 6);
    expect(copiedSvg.querySelector('.heatmap-dendrogram')?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  test('fixed dendrogram thickness is point-based while auto mode keeps the calculated screen width', () => {
    const resolveWidth = window.Components.heatmap.__testHooks.resolveDendrogramStrokeWidthCssPx;

    expect(resolveWidth({ mode: 'fixed', thicknessPt: 1 }, 7)).toBeCloseTo(4 / 3, 12);
    expect(resolveWidth({ mode: 'fixed', thicknessPt: 1.5 }, 7)).toBeCloseTo(2, 12);
    expect(resolveWidth({ mode: 'auto', thicknessPt: 1 }, 2.75)).toBeCloseTo(2.75, 12);
  });

  test('dense label projection is bounded and preserves first and last labels', () => {
    const indices = window.Components.heatmap.__testHooks.selectProjectionIndices(7358, 64);
    expect(indices).toHaveLength(64);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(7357);
    expect(new Set(indices).size).toBe(indices.length);
  });

  test('render-model signatures include every processed matrix value', () => {
    const createSignature = window.Components.heatmap.__testHooks.createDataSignature;
    const base = {
      rowLabels: ['A', 'B'],
      columnLabels: ['X', 'Y']
    };

    expect(createSignature({ ...base, matrix: [[1, 4], [2, 3]] }))
      .not.toBe(createSignature({ ...base, matrix: [[1, 3], [2, 4]] }));
  });


  test('ordinary SVG export leaves complete label groups unchanged', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 120');

    const rowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    rowGroup.setAttribute('data-layer', 'row-labels');
    const rowText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    rowText.setAttribute('x', '40');
    rowText.setAttribute('y', '30');
    rowText.setAttribute('fill', '#123456');
    rowText.textContent = 'row-0';
    rowGroup.appendChild(rowText);
    svg.appendChild(rowGroup);

    const columnGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    columnGroup.setAttribute('data-layer', 'column-labels');
    const columnText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    columnText.setAttribute('x', '70');
    columnText.setAttribute('y', '20');
    columnText.setAttribute('transform', 'rotate(-90 70 20)');
    columnText.textContent = 'column-0';
    columnGroup.appendChild(columnText);
    svg.appendChild(columnGroup);

    svg.__heatmapLabelProjection = { sampled: false };
    const exported = window.Components.heatmap.__testHooks.buildExportSvgFromSource(svg);

    expect(exported.getAttribute('data-heatmap-export-projection')).toBe('svg');
    expect(exported.hasAttribute('data-heatmap-export-label-projection')).toBe(false);
    expect(exported.querySelector('[data-layer="row-labels"] > text')?.outerHTML).toBe(rowText.outerHTML);
    expect(exported.querySelector('[data-layer="column-labels"] > text')?.outerHTML).toBe(columnText.outerHTML);
  });

  test('tab preview preserves the rendered panel projection', () => {
    const svgBox = document.createElement('div');
    svgBox.className = 'svgbox';
    svgBox.dataset.resizerWidth = '400';
    svgBox.dataset.resizerHeight = '200';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    const dendrogram = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dendrogram.setAttribute('class', 'heatmap-dendrogram');
    dendrogram.setAttribute('stroke-width', '2');
    dendrogram.setAttribute('vector-effect', 'non-scaling-stroke');
    dendrogram.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    svg.appendChild(dendrogram);
    svgBox.appendChild(svg);
    document.body.appendChild(svgBox);

    const preview = window.Components.heatmap.__testHooks.buildPreviewSvgFromSource(svg, {
      ownerTabId: 'heatmap-preview-owner'
    });

    expect(preview.getAttribute('viewBox')).toBe('0 0 400 200');
    expect(preview.getAttribute('width')).toBe('400');
    expect(preview.getAttribute('height')).toBe('200');
    expect(preview.getAttribute('data-workspace-tab-id')).toBe('heatmap-preview-owner');
    expect(preview.getAttribute('data-heatmap-preview-projection')).toBe('rendered-panel');
    expect(preview.firstElementChild?.getAttribute('transform')).toBe('matrix(4,0,0,2,0,0)');
  });


  test('heavy export restores every sampled label with the live aspect projection', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 120');

    const rowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    rowGroup.setAttribute('data-layer', 'row-labels');
    const rowText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    rowText.setAttribute('x', '45');
    rowText.setAttribute('y', '12.5');
    rowText.setAttribute('transform', 'matrix(0.5,0,0,0.25,22.5,9.375)');
    rowText.setAttribute('data-heatmap-source-index', '0');
    rowText.setAttribute('fill', '#123456');
    rowText.textContent = 'row-0';
    rowGroup.appendChild(rowText);
    svg.appendChild(rowGroup);

    const columnGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    columnGroup.setAttribute('data-layer', 'column-labels');
    const columnText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    columnText.setAttribute('x', '15');
    columnText.setAttribute('y', '18');
    columnText.setAttribute('transform', 'matrix(0.75,0,0,0.5,3.75,9) rotate(-90 15 18)');
    columnText.setAttribute('data-heatmap-source-index', '0');
    columnText.textContent = 'column-0';
    columnGroup.appendChild(columnText);
    svg.appendChild(columnGroup);

    svg.__heatmapLabelProjection = {
      sampled: true,
      rowLabels: ['row-0', 'row-1', 'row-2'],
      columnLabels: ['column-0', 'column-1'],
      rowLabelFontSizes: [10, 11, 12],
      columnLabelFontSizes: [9, 10],
      uniformRowLabelFontSize: null,
      uniformColumnLabelFontSize: null,
      matrixLeft: 0,
      matrixTop: 0,
      labelColumnWidth: 50,
      labelRowHeight: 20,
      labelPaddingX: 5,
      labelPaddingY: 2,
      dataStartX: 10,
      dataStartY: 10,
      heatmapWidth: 30,
      cellWidth: 10,
      cellHeight: 5
    };

    const exported = window.Components.heatmap.__testHooks.buildExportSvgFromSource(svg);
    const rows = Array.from(exported.querySelectorAll('[data-layer="row-labels"] > text'));
    const columns = Array.from(exported.querySelectorAll('[data-layer="column-labels"] > text'));
    expect(rows).toHaveLength(3);
    expect(columns).toHaveLength(2);
    expect(rows[0].getAttribute('fill')).toBe('#123456');
    expect(rows[1].hasAttribute('fill')).toBe(false);
    expect(rows[2].textContent).toBe('row-2');
    expect(rows[2].getAttribute('transform')).toBe('matrix(0.5,0,0,0.25,22.5,16.875)');
    expect(columns[1].textContent).toBe('column-1');
    expect(columns[1].getAttribute('transform')).toBe(
      'matrix(0.75,0,0,0.5,6.25,9) rotate(-90 25 18)'
    );
    expect(exported.getAttribute('data-heatmap-export-label-projection')).toBe('full');
  });

  test('table scheduling preserves heavy-paste overlay metadata', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../js/components/heatmap.js'),
      'utf8'
    );
    expect(source).toContain("...(scheduleMeta && typeof scheduleMeta === 'object' ? scheduleMeta : {})");
    expect(source).toContain('scheduleHeatmapDrawForSession(getHeatmapSessionForHot(instance, tableDrawOptions, { create: false }), tableDrawOptions);');
    expect(source).toContain('scheduleHeatmapBase(nextOpts);');
    expect(source).not.toContain("runDrawWithOverlayPaintGate?.({\n        component: heatmap");
    expect(source).not.toContain('heatmap overlay paint frame invalidated; requeueing current draw');
  });

});


describe('heatmap draw scheduling lifecycle', () => {
  beforeEach(loadHeatmapHarness);

  test('retries a stale owner-scoped draw frame while the Heatmap tab remains active', () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/components/heatmap.js'), 'utf8');
    expect(source).toContain('retryOnStale: true');
    expect(source).toContain("reason: 'heatmap-draw-frame-stale-retry'");
    expect(source).toContain('isHeatmapSessionActiveForModuleState(ownerSession)');
  });
  test('snapshot readiness uses the same shared lifecycle contract as Scatter', () => {
    const heatmapSource = fs.readFileSync(path.join(__dirname, '../js/components/heatmap.js'), 'utf8');
    const scatterSource = fs.readFileSync(path.join(__dirname, '../js/components/scatter.js'), 'utf8');
    expect(heatmapSource).toContain("Shared.componentLifecycle?.awaitReadyForSnapshot?.(heatmap");
    expect(scatterSource).toContain("Shared.componentLifecycle?.awaitReadyForSnapshot?.(scatter");
    expect(heatmapSource).not.toContain('restoreAuthoritative');
    expect(heatmapSource).not.toContain('heatmap-restore-readiness-redraw');
    expect(heatmapSource).not.toContain('heatmap-restore-readiness-reset');
  });

  test('inline title edits do not schedule a full Heatmap redraw', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'heatmap.js'), 'utf8');
    const binderStart = source.indexOf('function bindHeatmapTitleInlineInteraction(title, ownerSession = null)');
    const binderEnd = source.indexOf('function rehydrateHeatmapInlineTextInteractions', binderStart);
    const applyTitleStart = source.indexOf("const applyTitle = (value, reason = 'heatmap-title-edit') =>", binderStart);
    const makeEditableStart = source.indexOf('makeEditable(title, txt =>', applyTitleStart);
    expect(binderStart).toBeGreaterThan(-1);
    expect(binderEnd).toBeGreaterThan(binderStart);
    expect(applyTitleStart).toBeGreaterThan(binderStart);
    expect(makeEditableStart).toBeGreaterThan(applyTitleStart);
    const binderSource = source.slice(binderStart, binderEnd);
    const applyTitleSource = source.slice(applyTitleStart, makeEditableStart);
    expect(applyTitleSource).toContain("patchHeatmapVisualState(owner, { titleText: nextValue }");
    expect(applyTitleSource).not.toContain('scheduleHeatmapDrawForSession');
    expect(applyTitleSource).not.toContain('draw(');
    expect(binderSource).toContain("onInput: value => applyTitle(value, 'heatmap-title-input')");
  });

  test('nested Heatmap reflow hands render ownership to the committed inner frame', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const outer = hooks.createRenderTransaction(svg);

    const result = outer.handOff(() => {
      const inner = hooks.createRenderTransaction(svg);
      inner.complete({ rows: 2, columns: 3 });
      inner.finalize(svg);
      return 'reflow-complete';
    });
    outer.finalize(svg);

    expect(result).toBe('reflow-complete');
    expect(outer.status).toBe('handed-off');
    expect(svg.getAttribute('data-heatmap-render-complete')).toBe('true');
    expect(svg.getAttribute('data-heatmap-render-state')).toBe('complete');
    expect(svg.getAttribute('data-heatmap-render-row-count')).toBe('2');
    expect(svg.getAttribute('data-heatmap-render-column-count')).toBe('3');
  });

  test('partial title or dendrogram frames are rejected until a real Heatmap matrix is published', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'heatmapSvg';
    root.appendChild(svg);
    document.body.appendChild(root);
    const session = hooks.bindDomProjection('workspace-recovery-title', root);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.textContent = 'Edited title';
    svg.appendChild(title);
    const dendrogram = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    dendrogram.setAttribute('data-dendrogram-orientation', 'horizontal');
    dendrogram.setAttribute('d', 'M0 0H10');
    svg.appendChild(dendrogram);
    svg.setAttribute('data-heatmap-render-state', 'rendering');

    expect(hooks.hasRenderedGraph(session)).toBe(false);

    const cells = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cells.setAttribute('data-export-layer', 'heatmap-cells');
    cells.setAttribute('data-render-mode', 'svg');
    cells.setAttribute('data-heatmap-row-count', '1');
    cells.setAttribute('data-heatmap-column-count', '1');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '10');
    rect.setAttribute('height', '10');
    cells.appendChild(rect);
    svg.appendChild(cells);

    expect(hooks.hasRenderedGraph(session)).toBe(true);
  });

  test('post-restore validation reads the exact mounted root instead of stale session refs', () => {
    const heatmap = window.Components.heatmap;
    const tabId = 'workspace-recovery-mounted-root';
    const staleRoot = document.createElement('div');
    const staleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    staleSvg.id = 'heatmapSvg';
    staleRoot.appendChild(staleSvg);
    document.body.appendChild(staleRoot);
    heatmap.__testHooks.bindDomProjection(tabId, staleRoot);

    const mountedRoot = document.createElement('div');
    const mountedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mountedSvg.id = 'heatmapSvg';
    const cells = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cells.setAttribute('data-export-layer', 'heatmap-cells');
    cells.setAttribute('data-render-mode', 'svg');
    cells.setAttribute('data-heatmap-row-count', '1');
    cells.setAttribute('data-heatmap-column-count', '1');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '10');
    rect.setAttribute('height', '10');
    cells.appendChild(rect);
    mountedSvg.appendChild(cells);
    mountedRoot.appendChild(mountedSvg);
    document.body.appendChild(mountedRoot);

    expect(heatmap.hasRenderedGraph({ tabId, root: mountedRoot })).toBe(true);
    expect(heatmap.__testHooks.getSessionRefs(tabId)?.svg).toBe(mountedSvg);
  });

  test('canvas Heatmap publication is validated structurally without reading pixels', () => {
    const heatmap = window.Components.heatmap;
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'heatmapSvg';
    const cells = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cells.setAttribute('data-export-layer', 'heatmap-cells');
    cells.setAttribute('data-render-mode', 'canvas');
    cells.setAttribute('data-heatmap-row-count', '2');
    cells.setAttribute('data-heatmap-column-count', '2');
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    canvas.getContext = jest.fn(() => {
      throw new Error('publication validation must not read canvas pixels');
    });
    cells.appendChild(canvas);
    svg.appendChild(cells);
    root.appendChild(svg);
    document.body.appendChild(root);

    expect(heatmap.hasRenderedGraph({ tabId: 'workspace-canvas-publication', root })).toBe(true);
    expect(canvas.getContext).not.toHaveBeenCalled();
  });

  test('live publication requires matrix data marks while cache validation keeps the strict commit contract', () => {
    const heatmap = window.Components.heatmap;
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'heatmapSvg';
    svg.setAttribute('data-heatmap-render-complete', 'true');
    svg.setAttribute('data-heatmap-render-state', 'complete');
    svg.setAttribute('data-heatmap-render-row-count', '3');
    svg.setAttribute('data-heatmap-render-column-count', '4');
    const cells = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cells.setAttribute('data-export-layer', 'heatmap-cells');
    cells.setAttribute('data-render-mode', 'svg');
    cells.setAttribute('data-heatmap-row-count', '3');
    cells.setAttribute('data-heatmap-column-count', '4');
    svg.appendChild(cells);
    root.appendChild(svg);
    document.body.appendChild(root);

    expect(heatmap.hasRenderedGraph({ tabId: 'workspace-live-publication', root })).toBe(false);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '10');
    rect.setAttribute('height', '10');
    cells.appendChild(rect);
    expect(heatmap.hasRenderedGraph({ tabId: 'workspace-live-publication', root })).toBe(true);
  });

  test('render-cache validation requires a completed matrix layer, not incidental SVG content', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const makeCache = ({ complete, withCells, currentLayout = true }) => {
      const fragment = document.createDocumentFragment();
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      title.textContent = 'Edited title';
      fragment.appendChild(title);
      if(withCells){
        const cells = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        cells.setAttribute('data-export-layer', 'heatmap-cells');
        cells.setAttribute('data-render-mode', 'svg');
        cells.setAttribute('data-heatmap-row-count', '1');
        cells.setAttribute('data-heatmap-column-count', '1');
        cells.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'rect'));
        fragment.appendChild(cells);
      }
      return {
        plot: { fragment },
        svgRootState: {
          attributes: complete ? {
            'data-heatmap-render-complete': 'true',
            ...(currentLayout ? { 'data-heatmap-row-layout': 'dendrogram-left-labels-right-v1' } : {})
          } : {}
        }
      };
    };

    expect(hooks.hasCompleteRenderCache(makeCache({ complete: false, withCells: true }))).toBe(false);
    expect(hooks.hasCompleteRenderCache(makeCache({ complete: true, withCells: false }))).toBe(false);
    expect(hooks.hasCompleteRenderCache(makeCache({ complete: true, withCells: true, currentLayout: false }))).toBe(false);
    expect(hooks.hasCompleteRenderCache(makeCache({ complete: true, withCells: true }))).toBe(true);
  });

  test('render-cache restore resolves the explicit owner and never falls back to active globals', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'heatmap.js'), 'utf8');
    const start = source.indexOf('heatmap.restoreRenderCache = function restoreRenderCache');
    const end = source.indexOf('heatmap.hasRenderedGraph = function hasRenderedGraph', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const restoreSource = source.slice(start, end);
    expect(restoreSource).toContain('resolveHeatmapRenderCacheTargets(meta');
    expect(restoreSource).toContain('isHeatmapOwnerContextCurrent(restoreSession');
    expect(restoreSource).toContain('isHeatmapExplicitOwnerOperation(meta)');
    expect(restoreSource).toContain('hasCompleteHeatmapRenderFrame(svg)');
    expect(restoreSource).not.toContain("state.svg || $('heatmapSvg')");
    expect(restoreSource).not.toContain('getActiveHeatmapSessionForState()');
    expect(restoreSource).not.toContain('renderModelWithView');
    expect(restoreSource).not.toContain('suppressNextSchedule');
  });

  test('Heatmap uses the shared primary-graph publication contract and an awaitable authoritative draw', () => {
    const heatmapSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'heatmap.js'), 'utf8');
    const componentsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main', 'components.js'), 'utf8');
    const domControlsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main', 'domControls.js'), 'utf8');
    expect(heatmapSource).toContain('heatmap.hasRenderedGraph = function hasRenderedGraph');
    expect(heatmapSource).toContain('return hasPublishedHeatmapSvg(svg);');
    expect(heatmapSource).toContain('heatmap.scheduleDraw = function scheduleHeatmapDraw');
    expect(componentsSource).toContain("draw: meta => window.Components?.heatmap?.draw?.(meta || {})");
    expect(componentsSource).toContain("hasRenderedGraph: createPrimaryGraphPublicationValidator('heatmap'");
    expect(componentsSource).not.toContain('draw: meta => scheduleDrawHeatmap(meta || {})');
    expect(domControlsSource).toContain('const hasPublishedWorkspaceGraphContent =');
    expect(domControlsSource).toContain("'workspace-render-cache-post-restore-validation'");
    expect(domControlsSource).toContain("return hasPublishedWorkspaceGraphContent(root, 'workspace-post-restore-publication-check');");
  });


});
