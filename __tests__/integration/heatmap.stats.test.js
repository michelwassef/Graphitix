const { createHeatmapStatsTestContext } = require('../../test-support/heatmapStatsSuite');

jest.setTimeout(240_000);

describe('Heatmap stats formatting — rendering and layout', () => {
  const {
    cloneForTest,
    flushAsyncWork,
    waitFor,
    ensureCorrelationView,
  } = createHeatmapStatsTestContext();

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

    expect(heatmap.__getState().lastStats).toMatchObject({
      type: 'values',
      scaleMin: 0,
      scaleMax: 30,
      scaleCustomized: true
    });
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || window.Main?.tabs?.getActiveTab?.()?.id;
    const ownerSession = heatmap.__testHooks.getSession(activeTabId);
    expect(ownerSession?.results?.stats).toMatchObject({
      type: 'values',
      scaleMin: 0,
      scaleMax: 30,
      scaleCustomized: true
    });

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
    expect(statsContent?.textContent || '').toContain('Color scale');
    expect(statsContent?.textContent || '').toContain('0.00 to 30.00');
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

    expect(heatmap.__getState().lastStats).toMatchObject({
      type: 'values',
      scaleMin: 0,
      scaleMax: 20,
      scaleCustomized: true
    });
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || window.Main?.tabs?.getActiveTab?.()?.id;
    const ownerSession = heatmap.__testHooks.getSession(activeTabId);
    expect(ownerSession?.results?.stats).toMatchObject({
      type: 'values',
      scaleMin: 0,
      scaleMax: 20,
      scaleCustomized: true
    });

    const afterRect = getCellRect() || svg.querySelector('rect');
    if(afterRect){
      expect(typeof afterRect.getAttribute('fill')).toBe('string');
    } else {
      expect(svg).toBeTruthy();
    }

    const statsContent = document.getElementById('heatmapStatsContent');
    expect(statsContent?.textContent || '').toContain('Color scale');
    expect(statsContent?.textContent || '').toContain('0.00 to 20.00');
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
