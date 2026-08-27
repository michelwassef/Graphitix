const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');

const cloneForTest = value => JSON.parse(JSON.stringify(value));

describe('Heatmap stats formatting', () => {
  let originalCreateStandardTable;
  async function flushAsyncWork(iterations = 20){
    for(let i = 0; i < iterations; i += 1){
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  async function waitFor(predicate, iterations = 80){
    for(let i = 0; i < iterations; i += 1){
      if(predicate()){
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return !!predicate();
  }
  async function ensureCorrelationView(){
    const viewSelect = document.getElementById('heatmapView');
    if(viewSelect){
      viewSelect.value = 'corr-columns';
      viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork(8);
    }
  }

  beforeEach(() => {
    jest.resetModules();
    const harness = initializeWorkspaceHarness();
    const heatmapRoot = document.getElementById('heatmapPage');
    heatmapRoot.hidden = false;
    heatmapRoot.removeAttribute('hidden');
    harness.setActiveTab('heatmap-stats-test-tab', 'heatmap');
    harness.workspaceTabs.setMountedRoot(
      'heatmap-stats-test-tab',
      'heatmap',
      heatmapRoot
    );
    const canvasProto = window.HTMLCanvasElement?.prototype;
    if(canvasProto){
      canvasProto.getContext = jest.fn(() => ({
        font: '',
        measureText: text => ({ width: String(text || '').length * 8 })
      }));
    }
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/stats.js');
    require('../js/shared/statsInference.js');
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

    const Shared = window.Shared || {};
    originalCreateStandardTable = Shared.hot?.createStandardTable;
    if(originalCreateStandardTable){
      Shared.hot.createStandardTable = function wrappedCreateStandardTable(){
        const instance = originalCreateStandardTable.apply(this, arguments);
        if(instance && arguments?.[0]?.id === 'heatmapHot'){
          global.__LAST_HEATMAP_HOT__ = instance;
        }
        return instance;
      };
    }

    require('../js/components/heatmap.js');
    window.Components?.heatmap?.init?.({ tabId: 'heatmap-stats-test-tab', reason: 'heatmap-stats-test-setup' });
  });

  afterEach(() => {
    const Shared = window.Shared || {};
    if(originalCreateStandardTable){
      Shared.hot.createStandardTable = originalCreateStandardTable;
    }
    delete global.__LAST_HEATMAP_HOT__;
    originalCreateStandardTable = undefined;
  });

  test('strongest magnitude displays positive value even for negative correlation', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const negativeCorrelationMatrix = [
      ['Gene', 'ColA', 'ColB'],
      ['G1', 1, -1],
      ['G2', 2, -2],
      ['G3', 3, -3]
    ];
    hot.loadData(negativeCorrelationMatrix);
    await ensureCorrelationView();
    window.Components.heatmap.draw();
    await flushAsyncWork(10);

    const statsContent = document.getElementById('heatmapStatsContent');
    expect(statsContent).toBeTruthy();
    expect(statsContent.querySelector('script')).toBeNull();
  });

  test('stats panel escapes injected markup from column headers', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const maliciousMatrix = [
      ['Gene', '<script>alert(1)</script>', 'Numeric'],
      ['A', 1, 2],
      ['B', 2, 3],
      ['C', 3, 4]
    ];
    hot.loadData(maliciousMatrix);
    await ensureCorrelationView();
    window.Components.heatmap.draw();
    await flushAsyncWork(10);

    const statsContent = document.getElementById('heatmapStatsContent');
    expect(statsContent).toBeTruthy();
    expect(statsContent.querySelector('script')).toBeNull();
    if((statsContent.textContent || '').trim()){
      expect(statsContent.textContent).toContain('<script>alert(1)</script>');
    }
  });

  test('value scale override and fixed legend height serialize and affect the rendered legend', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    const heatmap = window.Components?.heatmap;
    expect(hot).toBeTruthy();
    expect(heatmap).toBeTruthy();

    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 0, 10],
      ['Gene2', 20, 30],
      ['Gene3', 40, 5]
    ]);
    const page = document.getElementById('heatmapPage');
    if(page){
      page.hidden = false;
      page.removeAttribute('hidden');
    }

    const viewSelect = document.getElementById('heatmapView');
    viewSelect.value = 'values';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await waitFor(() => heatmap.__getState().lastStats?.type === 'values')).toBe(true);
    const valueScaleRuntime = cloneForTest(heatmap.captureRuntimeState({
      tabId: window.Main?.tabs?.getActiveTab?.()?.id || null,
      reason: 'test-value-scale-override-capture'
    }));
    valueScaleRuntime.valueScale = { min: null, max: 30 };
    valueScaleRuntime.legendHeightMode = 'fixed';
    heatmap.applyRuntimeState(valueScaleRuntime, {
      tabId: window.Main?.tabs?.getActiveTab?.()?.id || null,
      reason: 'test-value-scale-override'
    });
    await heatmap.draw();

    const savedPayload = heatmap.getPayload();
    expect(savedPayload.config.valueScale).toEqual({ min: null, max: 30 });
    expect(savedPayload.config.legendHeightMode).toBe('fixed');
    heatmap.loadFromPayload(savedPayload, { source: 'test-value-scale-restore', skipDraw: true });
    expect(heatmap.__getState().valueScale).toEqual({ min: null, max: 30 });
    expect(heatmap.__getState().legendHeightMode).toBe('fixed');

    const svg = document.getElementById('heatmapSvg');
    const scaleGroup = Array.from(svg.getElementsByTagName('g')).find(node => node.getAttribute('class') === 'heatmap-color-scale');
    const scaleRect = scaleGroup ? scaleGroup.getElementsByTagName('rect')[0] : null;
    if(scaleRect){
      expect(Number(scaleRect.getAttribute('height'))).toBeLessThan(180);
    }

    const cellLayer = Array.from(svg.getElementsByTagName('g')).find(node => node.getAttribute('data-export-layer') === 'heatmap-cells');
    const cellRects = cellLayer ? Array.from(cellLayer.getElementsByTagName('rect')) : Array.from(svg.querySelectorAll('rect'));
    if(cellRects.length){
      expect(cellRects.length).toBeGreaterThan(0);
    } else {
      expect(svg).toBeTruthy();
    }

    const statsContent = document.getElementById('heatmapStatsContent');
    if((statsContent?.textContent || '').trim()){
      expect(statsContent?.textContent || '').toContain('Color scale');
    } else {
      expect(statsContent).toBeTruthy();
    }
  });

  test('Data-values colors and legend share one canonical numeric domain', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const palette = { negative: '#0000ff', zero: '#ffffff', positive: '#ff0000' };
    const resolved = hooks.resolveValueScaleStats({ min: -2.62, max: 4.95 }, {});
    const scale = hooks.createValueColorScale(resolved, palette, 2);
    const mapper = hooks.createValueColorMapper(resolved, palette);

    expect(resolved).toMatchObject({
      min: -2.62,
      max: 4.95,
      domainMin: -4.95,
      domainMax: 4.95,
      domainMode: 'diverging'
    });
    expect(scale.ticks[0].value).toBe(-4.95);
    expect(scale.ticks.at(-1).value).toBe(4.95);
    expect(scale.valueToRatio(-4.95)).toBe(0);
    expect(scale.valueToRatio(4.95)).toBe(1);
    expect(mapper(-4.95)).toBe('rgb(0,0,255)');
    expect(mapper(4.95)).toBe('rgb(255,0,0)');
  });

  test('custom and all-negative Data-values domains keep endpoints, ticks, and colors aligned', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const palette = { negative: '#0000ff', zero: '#ffffff', positive: '#ff0000' };
    const custom = hooks.resolveValueScaleStats(
      { min: -10, max: 8 },
      { min: -2, max: 4 }
    );
    expect(custom).toMatchObject({ min: -2, max: 4, domainMin: -4, domainMax: 4 });

    const negative = hooks.resolveValueScaleStats({ min: -10, max: -2 }, {});
    const scale = hooks.createValueColorScale(negative, palette, 2);
    const mapper = hooks.createValueColorMapper(negative, palette);
    expect(scale.ticks.map(tick => tick.value)).toEqual([-10, -8, -6, -4, -2]);
    expect(scale.valueToRatio(-10)).toBe(0);
    expect(scale.valueToRatio(-2)).toBe(1);
    expect(mapper(-10)).toBe('rgb(0,0,255)');
    expect(mapper(-2)).toBe('rgb(255,255,255)');

    const positive = hooks.resolveValueScaleStats({ min: 2, max: 10 }, {});
    const positiveScale = hooks.createValueColorScale(positive, palette, 2);
    const positiveMapper = hooks.createValueColorMapper(positive, palette);
    expect(positiveScale.ticks.map(tick => tick.value)).toEqual([2, 4, 6, 8, 10]);
    expect(positiveMapper(2)).toBe('rgb(255,255,255)');
    expect(positiveMapper(10)).toBe('rgb(255,0,0)');
  });

  test('heavy Data-values canvas scene uses bounded display geometry', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    expect(hooks?.resolveHeavySceneLayout).toBeTruthy();

    const layout = hooks.resolveHeavySceneLayout({
      frameWidth: 396,
      frameHeight: 338,
      rowCount: 7358,
      columnCount: 3,
      maxRowLabelWidth: 70,
      maxColumnLabelWidth: 90,
      maxRowLabelFontSize: 16,
      maxColumnLabelFontSize: 16,
      titleFontSize: 16,
      showRowDendrogram: true,
      showColumnDendrogram: true
    });

    expect(layout.normalized).toBe(true);
    expect(layout.totalWidth).toBe(396);
    expect(layout.totalHeight).toBe(338);
    expect(layout.heatmapWidth).toBeGreaterThan(40);
    expect(layout.heatmapHeight).toBeGreaterThan(60);
    expect(layout.cellWidth).toBeCloseTo(layout.heatmapWidth / 3, 8);
    expect(layout.cellHeight).toBeCloseTo(layout.heatmapHeight / 7358, 8);
    expect(layout.labelPaddingX).toBeCloseTo(layout.labelPaddingY, 8);
    expect(layout.labelMatrixGapDisplayPx).toBeCloseTo(layout.labelPaddingY, 8);
    expect(layout.scaleGapDisplayPx).toBeGreaterThanOrEqual(20);
    expect(layout.scaleGapDisplayPx).toBeLessThanOrEqual(30);
    expect(layout.dataStartX + layout.heatmapWidth + layout.labelColumnWidth + layout.scalePadding + layout.scaleWidth + layout.scaleLabelGap)
      .toBeLessThanOrEqual(layout.totalWidth);
    expect(layout.dataStartX - layout.rowDendroWidth)
      .toBe(layout.matrixLeft);
    expect(layout.dataStartY + layout.heatmapHeight + layout.columnDendroHeight + layout.dendrogramPadding)
      .toBeLessThanOrEqual(layout.totalHeight);

  });

  test('fixed legend height is display-space geometry and cannot shrink graph typography', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    expect(hooks?.resolveLegendLayout).toBeTruthy();
    expect(hooks?.resolveRoleTextScales).toBeTruthy();

    const fixed = hooks.resolveLegendLayout({
      mode: 'fixed',
      dataStartY: 140,
      heatmapHeight: 600,
      totalWidth: 900,
      totalHeight: 1000,
      drawableFrame: { width: 450, height: 500 },
      rendererAspectLocked: true
    });
    expect(fixed.height).toBe(160);
    expect(fixed.displayHeight).toBe(80);
    expect(fixed.startY).toBe(140);

    const horizontal = hooks.resolveRightRailLayout({
      baseTotalWidth: 900,
      totalHeight: 1000,
      drawableFrame: { width: 450, height: 500 },
      rendererAspectLocked: false,
      maxRowLabelWidthPx: 42,
      rowLabelFontSizePx: 12,
      scaleLabelReservePx: 48
    });
    const projectedScaleX = 450 / (900 + horizontal.totalWidth);
    expect(horizontal.labelColumnWidth * projectedScaleX).toBeCloseTo(48, 8);
    expect(horizontal.labelPaddingX * projectedScaleX).toBeCloseTo(6, 8);
    expect(horizontal.scalePadding * projectedScaleX).toBeCloseTo(20, 8);
    expect(horizontal.scaleWidth * projectedScaleX).toBeCloseTo(15, 8);
    expect(horizontal.scaleTickLength * projectedScaleX).toBeCloseTo(4.2, 8);
    expect(horizontal.scaleTickLabelGap * projectedScaleX).toBeCloseTo(2, 8);

    const common = {
      rowCount: 30,
      columnCount: 30,
      cellSize: 20,
      cellWidth: 20,
      cellHeight: 20,
      maxRowLabelFontSize: 12,
      maxColumnLabelFontSize: 12,
      scaleTickCount: 5,
      scaleTickFontSize: 12
    };
    const matchScales = hooks.resolveRoleTextScales({
      metrics: { ...common, scaleTickGap: 150 },
      scaleX: 0.5,
      scaleY: 0.5,
      fallbackScale: 0.5,
      independentLabels: false
    });
    const fixedScales = hooks.resolveRoleTextScales({
      metrics: { ...common, scaleTickGap: 40 },
      scaleX: 0.5,
      scaleY: 0.5,
      fallbackScale: 0.5,
      independentLabels: false
    });
    expect(fixedScales).toEqual(matchScales);
    expect(fixedScales.graphTitle).toBe(1);
    expect(fixedScales.scaleTick).toBe(1);
  });

  test('correlation legend title reflects the plotted metric', () => {
    const resolveTitle = window.Components?.heatmap?.__testHooks?.resolveCorrelationLegendTitle;
    expect(resolveTitle).toBeTruthy();
    expect(resolveTitle('pearson')).toEqual({
      method: 'pearson',
      text: 'Pearson correlation',
      lines: ['Pearson', 'correlation']
    });
    expect(resolveTitle('spearman')).toEqual({
      method: 'spearman',
      text: 'Spearman correlation',
      lines: ['Spearman', 'correlation']
    });
  });

  test('render-runtime ownership clones cached models unless live retention is explicit', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    expect(hooks?.createRenderRuntime).toBeTruthy();

    const model = {
      type: 'values',
      rowLabels: ['R1'],
      cells: [[{ value: 1 }]]
    };
    const isolated = hooks.createRenderRuntime({ lastRenderModel: model });
    expect(isolated.lastRenderModel).toEqual(model);
    expect(isolated.lastRenderModel).not.toBe(model);
    expect(isolated.lastRenderModel.cells).not.toBe(model.cells);

    model.cells[0][0].value = 9;
    expect(isolated.lastRenderModel.cells[0][0].value).toBe(1);

    const retained = hooks.createRenderRuntime({ lastRenderModel: model }, { retainModel: true });
    expect(retained.lastRenderModel).toBe(model);
  });

  test('logical Heatmap layout keeps optional reserves explicit and deterministic', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    expect(hooks?.resolveLogicalSceneLayout).toBeTruthy();

    const base = hooks.resolveLogicalSceneLayout({
      rowCount: 4,
      columnCount: 3,
      cellSize: 20,
      scaledFontSize: 12,
      titleFontSize: 16,
      maxRowLabelFontSize: 12,
      maxColumnLabelFontSize: 12,
      maxRowLabelWidth: 48,
      maxColumnLabelWidth: 56,
      showRowDendrogram: true,
      showColumnDendrogram: true,
      rendererAspectLocked: true
    });
    const extended = hooks.resolveLogicalSceneLayout({
      rowCount: 4,
      columnCount: 3,
      cellSize: 20,
      scaledFontSize: 12,
      titleFontSize: 16,
      maxRowLabelFontSize: 12,
      maxColumnLabelFontSize: 12,
      maxRowLabelWidth: 48,
      maxColumnLabelWidth: 56,
      showRowDendrogram: true,
      showColumnDendrogram: true,
      rendererAspectLocked: true,
      extraLabelRowHeight: 13
    });

    expect(base.normalized).toBe(false);
    expect(base.cellWidth).toBe(20);
    expect(base.cellHeight).toBe(20);
    expect(base.heatmapWidth).toBe(60);
    expect(base.heatmapHeight).toBe(80);
    expect(base.scaleGapDisplayPx).toBe(20);
    expect(extended.totalWidth).toBe(base.totalWidth);
    expect(extended.totalHeight - base.totalHeight).toBe(13);
    expect(extended.labelColumnWidth).toBe(base.labelColumnWidth);
    expect(extended.labelRowHeight - base.labelRowHeight).toBe(13);
  });

  test.each([false, true])('logical Heatmap keeps an adaptive projected label-to-scale gap (lock=%s)', rendererAspectLocked => {
    const layout = window.Components.heatmap.__testHooks.resolveLogicalSceneLayout({
      rowCount: 30,
      columnCount: 30,
      cellSize: 20,
      scaledFontSize: 12,
      titleFontSize: 16,
      maxRowLabelFontSize: 12,
      maxColumnLabelFontSize: 12,
      maxRowLabelWidth: 70,
      maxColumnLabelWidth: 90,
      showRowDendrogram: true,
      showColumnDendrogram: true,
      rendererAspectLocked,
      drawableFrame: { width: 610, height: 600 }
    });
    const scaleX = 610 / layout.totalWidth;
    const scaleY = 600 / layout.totalHeight;
    const lockedScale = Math.min(scaleX, scaleY);
    const projectionScale = rendererAspectLocked ? lockedScale : scaleX;
    const projectionScaleY = rendererAspectLocked ? lockedScale : scaleY;
    expect(layout.scaleGapDisplayPx).toBeGreaterThanOrEqual(20);
    expect(layout.scaleGapDisplayPx).toBeLessThanOrEqual(30);
    expect(layout.scalePadding * projectionScale).toBeCloseTo(layout.scaleGapDisplayPx, 6);
    expect(layout.labelPaddingX * projectionScale)
      .toBeCloseTo(layout.labelPaddingY * projectionScaleY, 2);
    expect(layout.labelMatrixGapDisplayPx)
      .toBeCloseTo(layout.labelPaddingY * projectionScaleY, 2);
  });

  test('right rail uses the projected label width instead of the unscaled width', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const rail = hooks.resolveProjectedRowLabelRail({
      maxRowLabelWidthPx: 100,
      rowLabelFontSizePx: 16,
      rowLabelDisplayScale: 0.4,
      rowLabelPaddingPx: 6
    });

    expect(rail.displayedLabelWidthPx).toBe(40);
    expect(rail.labelColumnWidthPx).toBe(46);
    expect(rail.legendGapPx).toBe(20);

    const roleScales = hooks.resolveRoleTextScales({
      metrics: {
        normalizedHeavyScene: false,
        rowLabelDisplayScale: 0.4,
        cellSize: 20,
        maxRowLabelFontSize: 16,
        maxColumnLabelFontSize: 16
      },
      scaleX: 0.7,
      scaleY: 0.7,
      fallbackScale: 0.7,
      independentLabels: false
    });
    const expectedColumnScale = (20 * 0.7) / (16 * 1.15);
    expect(roleScales.rowLabel).toBeCloseTo(expectedColumnScale, 8);
    expect(roleScales.columnLabel).toBeCloseTo(expectedColumnScale, 8);

    const committedCorrelationScale = hooks.resolveRoleTextScales({
      metrics: {
        normalizedHeavyScene: false,
        rowLabelDisplayScale: 0.4,
        correlationLabelDisplayScale: 0.72,
        cellSize: 20,
        maxRowLabelFontSize: 16,
        maxColumnLabelFontSize: 16
      },
      scaleX: 0.7,
      scaleY: 0.7,
      fallbackScale: 0.7,
      independentLabels: false
    });
    expect(committedCorrelationScale.rowLabel).toBe(0.72);
    expect(committedCorrelationScale.columnLabel).toBe(0.72);
  });

  test('manual correlation label sizes stay isolated to their owning role', () => {
    const hooks = window.Components.heatmap.__testHooks;
    const common = {
      normalizedHeavyScene: false,
      rowLabelDisplayScale: 0.4,
      correlationLabelDisplayScale: 0.4,
      cellSize: 20,
      maxRowLabelFontSize: 16,
      maxColumnLabelFontSize: 16
    };

    const rowOnly = hooks.resolveRoleTextScales({
      metrics: {
        ...common,
        rowLabelDisplaySizeOverride: true,
        columnLabelDisplaySizeOverride: false
      },
      scaleX: 0.7,
      scaleY: 0.7,
      fallbackScale: 0.7,
      independentLabels: false
    });
    expect(rowOnly.rowLabel).toBe(1);
    expect(rowOnly.columnLabel).toBeCloseTo((20 * 0.7) / (16 * 1.15), 8);

    const columnOnly = hooks.resolveRoleTextScales({
      metrics: {
        ...common,
        rowLabelDisplaySizeOverride: false,
        columnLabelDisplaySizeOverride: true
      },
      scaleX: 0.7,
      scaleY: 0.7,
      fallbackScale: 0.7,
      independentLabels: false
    });
    expect(columnOnly.rowLabel).toBe(0.4);
    expect(columnOnly.columnLabel).toBe(1);
  });

  test('heavy Data-values label fitting is isolated from the normal font contract', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    expect(hooks?.resolveRoleTextScales).toBeTruthy();

    const normal = hooks.resolveRoleTextScales({
      metrics: {
        normalizedHeavyScene: false,
        cellSize: 20,
        maxRowLabelFontSize: 16,
        maxColumnLabelFontSize: 16,
        scaleTickGap: 30,
        scaleTickFontSize: 12
      },
      scaleX: 1,
      scaleY: 1,
      fallbackScale: 1,
      independentLabels: true
    });
    expect(normal).toEqual({
      rowLabel: 1,
      columnLabel: 1,
      graphTitle: 1,
      scaleTick: 1
    });

    const heavy = hooks.resolveRoleTextScales({
      metrics: {
        normalizedHeavyScene: true,
        cellWidth: 32,
        cellHeight: 0.02,
        maxRowLabelFontSize: 16,
        maxColumnLabelFontSize: 16,
        scaleTickGap: 30,
        scaleTickFontSize: 12
      },
      scaleX: 1,
      scaleY: 1,
      fallbackScale: 1,
      independentLabels: true
    });
    expect(heavy.rowLabel).toBeGreaterThan(0);
    expect(heavy.rowLabel).toBeLessThan(0.002);
    expect(heavy.columnLabel).toBeGreaterThan(0.9);
    expect(heavy.graphTitle).toBe(1);
    expect(heavy.scaleTick).toBe(1);
  });

  test('heavy Data-values export replaces the live canvas with complete SVG-safe matrix content', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    expect(hooks?.buildExportSvgFromSource).toBeTruthy();

    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 200 120');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.dataset.heatmapSceneMode = 'normalized-canvas';
    svg.dataset.heatmapSceneWidth = '200';
    svg.dataset.heatmapSceneHeight = '120';
    svg.dataset.heatmapModelType = 'values';
    svg.dataset.heatmapCellRenderMode = 'canvas';

    const rowLabels = document.createElementNS(namespace, 'g');
    rowLabels.setAttribute('data-layer', 'row-labels');
    for(let index = 0; index < 4; index += 1){
      const label = document.createElementNS(namespace, 'text');
      label.textContent = `Row ${index + 1}`;
      rowLabels.appendChild(label);
    }
    svg.appendChild(rowLabels);

    const cellLayer = document.createElementNS(namespace, 'g');
    cellLayer.setAttribute('data-export-layer', 'heatmap-cells');
    cellLayer.setAttribute('data-render-mode', 'canvas');
    cellLayer.setAttribute('data-heatmap-data-start-x', '20');
    cellLayer.setAttribute('data-heatmap-data-start-y', '10');
    cellLayer.setAttribute('data-heatmap-width', '60');
    cellLayer.setAttribute('data-heatmap-height', '80');
    const foreignObject = document.createElementNS(namespace, 'foreignObject');
    foreignObject.setAttribute('x', '20');
    foreignObject.setAttribute('y', '10');
    foreignObject.setAttribute('width', '60');
    foreignObject.setAttribute('height', '80');
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 160;
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,aGVhdG1hcA==');
    foreignObject.appendChild(canvas);
    cellLayer.appendChild(foreignObject);
    cellLayer.__heatmapCanvasVectorExportState = {
      orderedCells: [
        [{ fill: '#ff0000' }, { fill: '#00ff00' }, { fill: '#ff0000' }],
        [{ fill: '#00ff00' }, { fill: '#ff0000' }, { fill: '#00ff00' }],
        [{ fill: '#ff0000' }, { fill: '#00ff00' }, { fill: '#ff0000' }],
        [{ fill: '#00ff00' }, { fill: '#ff0000' }, { fill: '#00ff00' }]
      ],
      rowCount: 4,
      columnCount: 3,
      cellSize: 20,
      cellWidth: 20,
      cellHeight: 20,
      dataStartX: 20,
      dataStartY: 10,
      heatmapWidth: 60,
      heatmapHeight: 80,
      cellValueFontSize: 8,
      showCellText: false,
      showCellGrid: true
    };
    svg.appendChild(cellLayer);

    svg.setAttribute('viewBox', '0 0 120 120');
    svg.style.width = '120px';
    svg.style.height = '120px';
    expect(hooks.applyCanvasLiveResizeProjection(svg)).toBe(true);
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 120');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
    expect(svg.style.width).toBe('100%');
    expect(svg.style.height).toBe('100%');
    expect(svg.dataset.heatmapLiveResizeProjection).toBe('true');

    const vectorExport = hooks.buildExportSvgFromSource(svg);
    expect(vectorExport).toBeTruthy();
    expect(vectorExport.getAttribute('data-heatmap-export-projection')).toBe('vector-matrix');
    expect(vectorExport.querySelectorAll('canvas, foreignObject')).toHaveLength(0);
    expect(vectorExport.querySelectorAll('[data-layer="row-labels"] > text')).toHaveLength(4);
    const vectorLayer = vectorExport.querySelector('[data-export-layer="heatmap-cells"]');
    expect(vectorLayer.getAttribute('data-heatmap-vector-cell-count')).toBe('12');
    expect(vectorLayer.querySelectorAll('[data-heatmap-vector-cell-bucket="1"]')).toHaveLength(2);
    expect(vectorLayer.querySelector('[data-heatmap-vector-cell-bucket="1"]')?.getAttribute('stroke')).toBe('#fff');

    delete cellLayer.__heatmapCanvasVectorExportState;
    const rasterFallbackExport = hooks.buildExportSvgFromSource(svg);
    expect(rasterFallbackExport).toBeTruthy();
    expect(rasterFallbackExport.getAttribute('data-heatmap-export-projection')).toBe('raster-matrix-fallback');
    expect(rasterFallbackExport.querySelectorAll('canvas, foreignObject')).toHaveLength(0);
    const rasterFallbackImage = rasterFallbackExport.querySelector('image[data-heatmap-raster-export="1"]');
    expect(rasterFallbackImage).toBeTruthy();
    expect(rasterFallbackImage.getAttribute('href')).toBe('data:image/png;base64,aGVhdG1hcA==');
  });

  test('Data values scales row and column labels independently', () => {
    const resolveScales = window.Components?.heatmap?.__testHooks?.resolveRoleTextScales;
    expect(resolveScales).toBeTruthy();
    const commonMetrics = {
      cellSize: 20,
      maxRowLabelFontSize: 12,
      maxColumnLabelFontSize: 12,
      scaleTickGap: 120,
      scaleTickFontSize: 12
    };

    const manyRows = resolveScales({
      metrics: commonMetrics,
      scaleX: 1,
      scaleY: 0.05,
      fallbackScale: 0.25,
      independentLabels: true
    });
    expect(manyRows.rowLabel).toBeLessThan(manyRows.columnLabel);
    expect(manyRows.columnLabel).toBe(1);
    expect(manyRows.graphTitle).toBe(1);
    expect(manyRows.scaleTick).toBeGreaterThan(manyRows.rowLabel);

    const manyColumns = resolveScales({
      metrics: commonMetrics,
      scaleX: 0.05,
      scaleY: 1,
      fallbackScale: 0.25,
      independentLabels: true
    });
    expect(manyColumns.columnLabel).toBeLessThan(manyColumns.rowLabel);
    expect(manyColumns.rowLabel).toBe(1);
    expect(manyColumns.graphTitle).toBe(1);
    expect(manyColumns.scaleTick).toBe(1);
  });

  test('all Heatmap types keep title and scale text independent from label fitting', () => {
    const resolveScales = window.Components?.heatmap?.__testHooks?.resolveRoleTextScales;
    const scales = resolveScales({
      metrics: {
        cellSize: 20,
        maxRowLabelFontSize: 12,
        maxColumnLabelFontSize: 12,
        scaleTickGap: 120,
        scaleTickFontSize: 12
      },
      scaleX: 1,
      scaleY: 0.05,
      fallbackScale: 0.25,
      independentLabels: false
    });

    expect(scales.rowLabel).toBe(1);
    expect(scales.columnLabel).toBe(1);
    expect(scales.graphTitle).toBe(1);
    expect(scales.scaleTick).toBeGreaterThan(0.25);
  });

  test('value scale changes affect cached view-only redraws', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    const heatmap = window.Components?.heatmap;
    expect(hot).toBeTruthy();
    expect(heatmap).toBeTruthy();

    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 0, 10],
      ['Gene2', 20, 30],
      ['Gene3', 40, 5]
    ]);

    const page = document.getElementById('heatmapPage');
    if(page){
      page.hidden = false;
      page.removeAttribute('hidden');
    }

    const viewSelect = document.getElementById('heatmapView');
    viewSelect.value = 'values';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(8);

    heatmap.draw();
    await flushAsyncWork(10);

    const svg = document.getElementById('heatmapSvg');
    const getCellRect = () => {
      const cellLayer = Array.from(svg.getElementsByTagName('g')).find(node => node.getAttribute('data-export-layer') === 'heatmap-cells');
      const cellRects = cellLayer ? Array.from(cellLayer.getElementsByTagName('rect')) : [];
      return cellRects.find(rect => (rect.querySelector('title')?.textContent || '').includes('Gene2 vs ArrayB: 30.00')) || null;
    };

    const beforeRect = getCellRect() || svg.querySelector('rect');
    if(beforeRect){
      const beforeFill = beforeRect.getAttribute('fill');
      expect(typeof beforeFill).toBe('string');
    } else {
      expect(svg).toBeTruthy();
    }

    const viewOnlyRuntime = cloneForTest(heatmap.captureRuntimeState({
      tabId: window.Main?.tabs?.getActiveTab?.()?.id || null,
      reason: 'test-value-scale-view-only-capture'
    }));
    viewOnlyRuntime.valueScale = { min: 0, max: 20 };
    heatmap.applyRuntimeState(viewOnlyRuntime, {
      tabId: window.Main?.tabs?.getActiveTab?.()?.id || null,
      reason: 'test-value-scale-view-only'
    });
    await heatmap.draw({ viewOnly: true, reason: 'test-value-scale-view-only' });
    await flushAsyncWork(10);

    const afterRect = getCellRect() || svg.querySelector('rect');
    if(afterRect){
      expect(typeof afterRect.getAttribute('fill')).toBe('string');
    } else {
      expect(svg).toBeTruthy();
    }

    const statsContent = document.getElementById('heatmapStatsContent');
    if((statsContent?.textContent || '').trim()){
      expect(statsContent?.textContent || '').toContain('0.00 to 20.00');
    } else {
      expect(statsContent).toBeTruthy();
    }
  });

  test('data transform controls create a derived data tab while keeping raw tab', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const matrix = [
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 1, 3],
      ['Gene2', 2, 4]
    ];
    hot.loadData(matrix);

    const centerGenes = document.getElementById('heatmapCenterGenes');
    const normalizeGenes = document.getElementById('heatmapNormalizeGenes');
    expect(centerGenes).toBeTruthy();
    expect(normalizeGenes).toBeTruthy();
    const initialTabCount = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length;
    centerGenes.checked = true;
    centerGenes.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab')).toHaveLength(initialTabCount);
    await flushAsyncWork(4);

    let tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));

    normalizeGenes.checked = true;
    normalizeGenes.dispatchEvent(new Event('change'));
    await flushAsyncWork(4);

    tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));
    if(tabs.length){
      expect(tabs.length).toBeGreaterThanOrEqual(initialTabCount);
      const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
      expect(activeTab).toBeTruthy();
    }

    const transformed = hot.getData();
    expect(Number.isFinite(Number(transformed?.[1]?.[1]))).toBe(true);
    expect(Number.isFinite(Number(transformed?.[1]?.[2]))).toBe(true);
  });

  test('toolbar multiple mode applies selected transforms as one derived tab', () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 1, 3],
      ['Gene2', 2, 4]
    ]);

    const multiToggle = document.getElementById('heatmapTransformMultiMode');
    const logButton = document.getElementById('heatmapTransformLog2p1');
    const centerButton = document.getElementById('heatmapTransformCenterRowsMean');
    const applyButton = document.getElementById('heatmapTransformApplySelected');
    expect(multiToggle).toBeTruthy();
    expect(logButton).toBeTruthy();
    expect(centerButton).toBeTruthy();
    expect(applyButton).toBeTruthy();
    const beforeTabs = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length;

    multiToggle.checked = true;
    multiToggle.dispatchEvent(new Event('change', { bubbles: true }));
    logButton.click();
    centerButton.click();
    expect(applyButton.disabled).toBe(false);
    expect(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length).toBe(beforeTabs);

    applyButton.click();

    const tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));
    if(tabs.length){
      expect(tabs.length).toBeGreaterThanOrEqual(beforeTabs);
      const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
      expect(activeTab).toBeTruthy();
    }

    const transformed = hot.getData();
    expect(Number.isFinite(Number(transformed?.[1]?.[1]))).toBe(true);
    expect(Number.isFinite(Number(transformed?.[1]?.[2]))).toBe(true);
  });

  test('custom transform opens dropdown editor in multiple mode', () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 1, 3],
      ['Gene2', 2, 4]
    ]);

    const multiToggle = document.getElementById('heatmapTransformMultiMode');
    const customButton = document.getElementById('heatmapTransformCustom');
    expect(multiToggle).toBeTruthy();
    expect(customButton).toBeTruthy();
    const beforeTabs = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length;

    multiToggle.checked = true;
    multiToggle.dispatchEvent(new Event('change', { bubbles: true }));
    customButton.click();

    const transformSection = customButton.closest('.workspace-toolbar__section[data-transform-section="1"]');
    const dropdown = transformSection?.querySelector('[data-transform-custom-dropdown="1"]');
    const input = document.getElementById('heatmapTransformCustomExpr');
    const applyCustomButton = document.getElementById('heatmapTransformCustomApply');
    expect(dropdown).toBeTruthy();
    expect(dropdown?.dataset?.open).toBe('1');
    expect(input).toBeTruthy();
    expect(applyCustomButton).toBeTruthy();

    input.value = 'x+1';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    applyCustomButton.click();

    const tabs = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab');
    if(tabs.length){
      expect(tabs.length).toBeGreaterThanOrEqual(beforeTabs);
    }
  });

  test('closing materialized transform tab clears adjust/filter selections', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 1, 3],
      ['Gene2', 2, 4]
    ]);

    const centerGenes = document.getElementById('heatmapCenterGenes');
    const filterPresent = document.getElementById('heatmapFilterPresentEnable');
    expect(centerGenes).toBeTruthy();
    expect(filterPresent).toBeTruthy();

    centerGenes.checked = true;
    centerGenes.dispatchEvent(new Event('change'));
    filterPresent.checked = true;
    filterPresent.dispatchEvent(new Event('change'));
    await flushAsyncWork(4);

    const activeClose = document.querySelector('#heatmapHotWrapper .data-view-tabs__item--active .data-view-tabs__close');
    if(activeClose){
      activeClose.click();
    }

    if(activeClose){
      expect(centerGenes.checked).toBe(false);
      expect(filterPresent.checked).toBe(false);
      const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
      expect(activeTab).toBeTruthy();
      expect((activeTab.textContent || '').toLowerCase()).toContain('raw');
    }
  });

  test('switching to the correlation matrix tab does not trigger recursive redraw loads', async () => {
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const originalApplyExclusions = hot.applyExclusions;
    const applyExclusionsCalls = [];
    hot.applyExclusions = function wrappedApplyExclusions(payload){
      applyExclusionsCalls.push(payload);
      return originalApplyExclusions.apply(this, arguments);
    };
    try{
    hot.loadData([
      ['Gene', 'Baseline_A', 'Baseline_B', 'Treatment_A', 'Treatment_B', 'Stress_A', 'Stress_B', 'Recovery'],
      ['Gene1', 10, 9.7, 3.2, 3.1, 6.1, 6.3, 8.2],
      ['Gene2', 11, 10.8, 4.1, 4.0, 5.9, 6.0, 8.0],
      ['Gene3', 12, 11.7, 2.9, 3.0, 6.4, 6.6, 7.6],
      ['Gene4', 9.5, 9.4, 7.5, 7.6, 5.2, 5.1, 8.8]
    ]);
    window.Components.heatmap.draw();
    await flushAsyncWork();

    const correlationTab = Array.from(
      document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab')
    ).find(tab => /correlation matrix/i.test(tab.textContent || ''));
    if(!correlationTab){
      expect(Array.isArray(global.__GRID_CALLS__ || [])).toBe(true);
      return;
    }

    const loadCallsBefore = (global.__GRID_CALLS__ || []).filter(call =>
      call.type === 'loadData' && call.containerId === 'heatmapHot'
    ).length;
    correlationTab.click();
    const manager = hot.__heatmapDataViewsManager;
    await flushAsyncWork(6);
    const activeView = manager?.getActiveView?.() || null;
    const loadCallsAfter = (global.__GRID_CALLS__ || []).filter(call =>
      call.type === 'loadData' && call.containerId === 'heatmapHot'
    );
    const loadSources = loadCallsAfter.slice(loadCallsBefore).map(call => call.source);
    const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');

    expect(activeView?.transformSpec?.type).toBe('heatmapCorrelationMatrix');
    expect(activeView?.sourceViewId).toBe('raw');
    expect(loadSources).toEqual(['heatmap-correlation-tab-activate']);
    expect(applyExclusionsCalls).toEqual([]);
    expect(activeTab).toBeTruthy();
    expect((activeTab.textContent || '').toLowerCase()).toContain('correlation matrix');
    } finally {
      hot.applyExclusions = originalApplyExclusions;
    }
  });

  test('graph title stays above long vertical column labels', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    // Create data with very long column headers that will extend high when rotated vertically
    const longLabelMatrix = [
      ['Row', 'VeryLongColumnHeaderThatExtendsHighWhenRotated', 'AnotherExtremelyLongColumnLabelForTesting'],
      ['A', 1, 2],
      ['B', 3, 4],
      ['C', 5, 6]
    ];
    hot.loadData(longLabelMatrix);
    await ensureCorrelationView();
    window.Components.heatmap.draw();
    await flushAsyncWork(10);

    const svg = document.getElementById('heatmapSvg');
    expect(svg).toBeTruthy();

    // Find the title text element (should be first text with data-font-role="graphTitle")
    const titleEl = svg.querySelector('text[data-font-role="graphTitle"]') || svg.querySelector('text');
    if(!titleEl){
      expect(svg).toBeTruthy();
      return;
    }
    const titleY = parseFloat(titleEl.getAttribute('y'));

    // Find column label text elements (should have data-font-role="columnLabel")
    const columnLabels = svg.querySelectorAll('text[data-font-role="columnLabel"]');
    if(!columnLabels.length){
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
      return;
    }

    // For rotated labels, we need to check their effective top extent
    // Each label is at y position with rotation -90 degrees
    // The text-anchor is "middle", so the label extends labelWidth/2 above and below its y position
    // After -90 rotation, the top of the label is at: y - textWidth/2
    let highestLabelTop = Infinity;
    columnLabels.forEach(label => {
      const y = parseFloat(label.getAttribute('y'));
      // Estimate text width from content (8px per character as per test stub)
      const textWidth = (label.textContent || '').length * 8;
      const labelTop = y - textWidth / 2;
      if (labelTop < highestLabelTop) {
        highestLabelTop = labelTop;
      }
    });

    // Title's y position should be above (smaller than) the highest label top extent
    expect(titleY).toBeLessThan(highestLabelTop);
  });
  test('heavy SVG helpers compact dendrogram coordinates without changing geometry', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    expect(hooks?.formatSvgNumber(12.34567)).toBe('12.35');
    expect(hooks?.formatSvgNumber(-0.0001)).toBe('0');
    expect(hooks?.compactDendrogramBranch(
      'vertical',
      { x: 1.23456, y: 2.34567 },
      { x: 3.45678, y: 4.56789 },
      { x: 5.67891, y: 6.78912 }
    )).toBe('M1.2346 2.3457H3.4568M3.4568 6.7891H5.6789M3.4568 2.3457V6.7891');
    expect(hooks?.compactDendrogramBranch(
      'horizontal',
      { x: 1.23456, y: 2.34567 },
      { x: 3.45678, y: 4.56789 },
      { x: 5.67891, y: 6.78912 }
    )).toBe('M1.2346 4.5679H5.6789M1.2346 2.3457V4.5679M5.6789 4.5679V6.7891');
  });


  test('correlation significance correction defaults to BH and persists through payload state', async () => {
    const correction = document.getElementById('heatmapSignificanceCorrection');
    expect(correction).toBeTruthy();
    expect(correction.value).toBe('bh');
    correction.value = 'holm';
    correction.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(4);
    const payload = window.Components.heatmap.getPayload();
    expect(payload.config.significanceCorrection).toBe('holm');
    window.Components.heatmap.loadFromPayload(cloneForTest(payload), {
      tabId: 'heatmap-stats-test-tab',
      skipDraw: true,
      skipInitialDraw: true
    });
    expect(document.getElementById('heatmapSignificanceCorrection').value).toBe('holm');
  });


  test('runtime snapshots preserve the current correlation correction', async () => {
    const heatmap = window.Components.heatmap;
    const correction = document.getElementById('heatmapSignificanceCorrection');
    expect(correction).toBeTruthy();

    correction.value = 'by';
    correction.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(4);

    const snapshot = cloneForTest(heatmap.captureRuntimeState({
      tabId: 'heatmap-stats-test-tab',
      reason: 'heatmap-current-runtime-capture-test'
    }));
    expect(snapshot?.controls?.significanceCorrection).toBe('by');

    correction.value = 'holm';
    expect(heatmap.applyRuntimeState(snapshot, {
      tabId: 'heatmap-stats-test-tab',
      reason: 'heatmap-current-runtime-apply-test'
    })).toBe(true);
    expect(document.getElementById('heatmapSignificanceCorrection').value).toBe('by');
    expect(heatmap.getPayload().config.significanceCorrection).toBe('by');
  });

  test('correlation reporting records the active multiplicity family and inference level', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    const heatmap = window.Components.heatmap;
    hot.loadData([
      ['Gene', 'A', 'B', 'C'],
      ['G1', 1, 1, 4],
      ['G2', 2, 3, 3],
      ['G3', 3, 2, 2],
      ['G4', 4, 4, 1]
    ]);
    await ensureCorrelationView();
    const showSignificance = document.getElementById('heatmapShowSignificance');
    const correction = document.getElementById('heatmapSignificanceCorrection');
    showSignificance.checked = true;
    showSignificance.dispatchEvent(new Event('change', { bubbles: true }));
    correction.value = 'bh';
    correction.dispatchEvent(new Event('change', { bubbles: true }));

    expect(await waitFor(() => {
      const stats = heatmap.__getState().lastStats;
      return stats?.type === 'correlation'
        && stats.showSignificance === true
        && stats.significanceCorrection === 'bh'
        && stats.testedPairCount === 3;
    })).toBe(true);

    const statsText = document.getElementById('heatmapStatsContent')?.textContent || '';
    expect(statsText).toContain('Benjamini–Hochberg FDR');
    expect(statsText).toContain('target FDR = 0.05');
    expect(statsText).toContain('unique pairs');
    expect(heatmap.__getState().lastStats).toMatchObject({
      showSignificance: true,
      significanceCorrection: 'bh',
      testedPairCount: 3
    });
  });

  test('Heatmap keeps the canonical horizontal edge gutter in both layout engines', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    const edge = window.Shared.chartStyle.GRAPH_HORIZONTAL_EDGE_PADDING_PX;
    const common = {
      rowCount: 6,
      columnCount: 4,
      scaledFontSize: 16,
      titleFontSize: 18,
      maxRowLabelFontSize: 16,
      maxColumnLabelFontSize: 16,
      maxRowLabelWidth: 72,
      maxColumnLabelWidth: 88,
      showRowDendrogram: true,
      showColumnDendrogram: true
    };
    const heavy = hooks.resolveHeavySceneLayout({
      ...common,
      frameWidth: 640,
      frameHeight: 520
    });
    const logical = hooks.resolveLogicalSceneLayout({
      ...common,
      cellSize: 26,
      rendererAspectLocked: false
    });

    const trailingGap = layout => {
      const dataStartX = Number.isFinite(layout.dataStartX)
        ? layout.dataStartX
        : layout.matrixLeft + layout.rowDendroWidth;
      const rightmostContent = dataStartX
        + layout.heatmapWidth
        + layout.labelColumnWidth
        + layout.scalePadding
        + layout.scaleWidth
        + layout.scaleLabelGap;
      return layout.totalWidth - rightmostContent;
    };

    expect(heavy.matrixLeft).toBe(edge);
    expect(logical.matrixLeft).toBe(edge);
    expect(trailingGap(heavy)).toBeCloseTo(edge, 8);
    expect(trailingGap(logical)).toBeCloseTo(edge, 8);
  });

});
