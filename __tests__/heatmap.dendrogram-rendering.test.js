const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');
const fs = require('fs');
const path = require('path');

describe('Heatmap dendrogram and dense projection geometry', () => {
  beforeEach(() => {
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
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/components/heatmap.js');
  });

  function leaf(index) {
    return { indices: [index], distance: 0 };
  }

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

  test('preview sanitization removes interaction overlays without removing dendrogram geometry', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 120');

    const cellLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cellLayer.setAttribute('data-export-layer', 'heatmap-cells');
    cellLayer.setAttribute('data-render-mode', 'canvas');
    const cellHitLayer = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    cellHitLayer.setAttribute('data-heatmap-cell-hit-layer', '1');
    cellLayer.appendChild(cellHitLayer);
    svg.appendChild(cellLayer);

    const dendrogram = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dendrogram.setAttribute('class', 'heatmap-dendrogram');
    dendrogram.setAttribute('data-dendrogram-control', '1');
    dendrogram.style.cursor = 'pointer';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M10 10H20M20 10V30');
    dendrogram.appendChild(path);
    svg.appendChild(dendrogram);

    const controlOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    controlOverlay.setAttribute('data-dendrogram-control', '1');
    controlOverlay.setAttribute('fill', 'transparent');
    controlOverlay.setAttribute('pointer-events', 'fill');
    svg.appendChild(controlOverlay);

    const preview = window.Components.heatmap.__testHooks.buildPreviewSvgFromSource(svg);
    const previewDendrogram = preview.querySelector('.heatmap-dendrogram');

    expect(previewDendrogram).not.toBeNull();
    expect(previewDendrogram.querySelector('path')?.getAttribute('d')).toBe('M10 10H20M20 10V30');
    expect(previewDendrogram.hasAttribute('data-dendrogram-control')).toBe(false);
    expect(previewDendrogram.style.cursor).toBe('');
    expect(preview.querySelectorAll('[data-dendrogram-control="1"]')).toHaveLength(0);
    expect(preview.querySelectorAll('[data-heatmap-cell-hit-layer="1"]')).toHaveLength(0);
    expect(preview.getAttribute('data-heatmap-preview-removed-interaction-overlays')).toBe('2');
    expect(preview.getAttribute('data-heatmap-preview-sanitized-interaction-owners')).toBe('1');
  });


  test('preview branch sampling parses compact SVG path commands', () => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', Array.from({ length: 1000 }, (_value, index) => (
      `M0 ${index}H1M1 ${index}V${index + 1}`
    )).join(''));

    const removed = window.Components.heatmap.__testHooks.samplePreviewPathBranches(path, 320);
    expect(removed).toBe(1680);
    expect(path.getAttribute('data-preview-source-branch-count')).toBe('2000');
    expect(path.getAttribute('data-preview-branch-count')).toBe('320');
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
    const applyTitleStart = source.indexOf("const applyHeatmapTitle = (value, reason = 'heatmap-title-edit') =>");
    const makeEditableStart = source.indexOf('makeEditable(title, txt =>', applyTitleStart);
    expect(applyTitleStart).toBeGreaterThan(-1);
    expect(makeEditableStart).toBeGreaterThan(applyTitleStart);
    const applyTitleSource = source.slice(applyTitleStart, makeEditableStart);
    expect(applyTitleSource).toContain("patchHeatmapVisualState(ownerSession, { titleText: nextValue }");
    expect(applyTitleSource).not.toContain('scheduleHeatmapDrawForSession');
    expect(applyTitleSource).not.toContain('draw(');
  });

  test('partial title or dendrogram frames are never accepted as a recovered Heatmap', () => {
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

    expect(hooks.hasRenderedGraph(session)).toBe(false);
    svg.setAttribute('data-heatmap-render-complete', 'true');
    svg.setAttribute('data-heatmap-render-state', 'complete');
    expect(hooks.hasRenderedGraph(session)).toBe(true);
  });

  test('render-cache validation requires a completed matrix layer, not incidental SVG content', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const makeCache = ({ complete, withCells }) => {
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
          attributes: complete ? { 'data-heatmap-render-complete': 'true' } : {}
        }
      };
    };

    expect(hooks.hasCompleteRenderCache(makeCache({ complete: false, withCells: true }))).toBe(false);
    expect(hooks.hasCompleteRenderCache(makeCache({ complete: true, withCells: false }))).toBe(false);
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
    expect(restoreSource).toContain('hasRenderedHeatmapGraph(restoreSession)');
    expect(restoreSource).not.toContain("state.svg || $('heatmapSvg')");
    expect(restoreSource).not.toContain('getActiveHeatmapSessionForState()');
    expect(restoreSource).not.toContain('renderModelWithView');
    expect(restoreSource).not.toContain('suppressNextSchedule');
  });

  test('Heatmap exposes strict post-restore graph validation to the shared workspace owner', () => {
    const heatmapSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'heatmap.js'), 'utf8');
    const componentsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main', 'components.js'), 'utf8');
    const domControlsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main', 'domControls.js'), 'utf8');
    expect(heatmapSource).toContain('heatmap.hasRenderedGraph = function hasRenderedGraph');
    expect(componentsSource).toContain('hasRenderedGraph: meta => window.Components?.heatmap?.hasRenderedGraph?.(meta)');
    expect(domControlsSource).toContain("reason: 'workspace-render-cache-post-restore-validation'");
    expect(domControlsSource).toContain('componentRendered === true');
    expect(domControlsSource).toContain('componentRendered == null && hasRenderableGraphContent(restoredRoot)');
  });


});
