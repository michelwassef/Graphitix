const { createBoxSwarmTestContext } = require('../../test-support/boxSwarmSuite');

describe('Box swarm offsets — point styling and layout', () => {
  const suite = createBoxSwarmTestContext();

  test('box point toolbar size reports rendered auto radius and exact manual radius', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.resolveBoxToolbarPointSizeValue).toBe('function');
    const proxy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    proxy.setAttribute('data-point-size', '5.8');
    expect(suite.hooks.resolveBoxToolbarPointSizeValue({ size: 5, sizeMode: 'auto' }, proxy)).toBeCloseTo(2.9, 5);
    expect(suite.hooks.resolveBoxToolbarPointSizeValue({ size: 2.9, sizeMode: 'manual' }, proxy)).toBeCloseTo(2.9, 5);
  });

  test('box point size mode separates auto sizing from manual values, including legacy state', () => {
    expect(typeof suite.hooks.resolveBoxPointSizeSpec).toBe('function');
    expect(suite.hooks.resolveBoxPointSizeSpec({ size: 5 }, null)).toMatchObject({ mode: 'auto', size: null });
    expect(suite.hooks.resolveBoxPointSizeSpec({ size: 5, sizeMode: 'manual' }, null)).toMatchObject({ mode: 'manual', size: 5 });
    expect(suite.hooks.resolveBoxPointSizeSpec({ size: 5, sizeMode: 'auto' }, { size: 5 })).toMatchObject({ mode: 'manual', size: 5 });
  });

  test('manual box point radius is not rescaled after the toolbar value is committed', () => {
    expect(typeof suite.hooks.prepareSwarmPointLayoutConfig).toBe('function');
    const layout = suite.hooks.prepareSwarmPointLayoutConfig({
      valueList: [1, 2, 3],
      traceIndex: 0,
      getPointStyle: () => ({ size: 2.9, sizeMode: 'manual' }),
      hasExplicitPointSize: () => true,
      pointRadius: 1.45,
      scaleInfo: { scaleW: 0.5, scaleH: 0.5 },
      autoSize: true,
      allowRadiusAdjustment: false,
      localBand: 30,
      sampleCount: 3,
      widthScaleMode: 'none',
      debugLabel: 'individual',
      canvasThreshold: Number.MAX_SAFE_INTEGER,
      approximateThreshold: Number.MAX_SAFE_INTEGER,
      coordProjector: value => value
    });
    expect(layout.resolvedRadius).toBeCloseTo(2.9, 5);
    expect(layout.swarmPointRadius).toBeCloseTo(2.9, 5);
  });

  test('semantic point resize scale is invariant to axis flipping but reacts to real resize', () => {
    expect(typeof suite.hooks.resolveBoxSemanticPointResizeProfile).toBe('function');
    const baseline = { baseCategorySpanPx: 220, baseValueSpanPx: 280 };
    const vertical = suite.hooks.resolveBoxSemanticPointResizeProfile({ categorySpanPx: 220, valueSpanPx: 280, orientation: 'vertical' }, baseline, null);
    const horizontal = suite.hooks.resolveBoxSemanticPointResizeProfile({ categorySpanPx: 220, valueSpanPx: 280, orientation: 'horizontal' }, baseline, null);
    const shrunk = suite.hooks.resolveBoxSemanticPointResizeProfile({ categorySpanPx: 132, valueSpanPx: 168 }, baseline, null);
    expect(vertical.scale).toBeCloseTo(1, 5);
    expect(horizontal.scale).toBeCloseTo(vertical.scale, 5);
    expect(shrunk.scale).toBeCloseTo(0.6, 5);

    const migratedWidthOnly = suite.hooks.resolveBoxSemanticPointResizeProfile({
      categorySpanPx: 110,
      valueSpanPx: 280,
      orientation: 'vertical'
    }, null, { scaleW: 0.5, scaleH: 1 });
    expect(migratedWidthOnly.scale).toBeCloseTo(0.5, 5);
    expect(migratedWidthOnly.baseline).toEqual({
      baseCategorySpanPx: 220,
      baseValueSpanPx: 280
    });
    const migratedBackToDefault = suite.hooks.resolveBoxSemanticPointResizeProfile({
      categorySpanPx: 220,
      valueSpanPx: 280,
      orientation: 'vertical'
    }, migratedWidthOnly.baseline, null);
    expect(migratedBackToDefault.scale).toBeCloseTo(1, 5);

    const migratedHorizontalWidthOnly = suite.hooks.resolveBoxSemanticPointResizeProfile({
      categorySpanPx: 280,
      valueSpanPx: 110,
      orientation: 'horizontal'
    }, null, { scaleW: 0.5, scaleH: 1 });
    expect(migratedHorizontalWidthOnly.scale).toBeCloseTo(0.5, 5);
    expect(migratedHorizontalWidthOnly.baseline).toEqual({
      baseCategorySpanPx: 280,
      baseValueSpanPx: 220
    });
  });

  test('point-sizing baseline survives payload layout normalization for reopen parity', () => {
    expect(typeof suite.hooks.normalizeBoxPayloadLayoutGeometry).toBe('function');
    const normalized = suite.hooks.normalizeBoxPayloadLayoutGeometry({
      userFrameWidthPx: 420,
      userFrameHeightPx: 380
    }, {
      frame: { widthPx: 420, heightPx: 380 },
      pointSizing: { baseCategorySpanPx: 220, baseValueSpanPx: 280 }
    });
    expect(normalized.graphGeometry.pointSizing).toEqual({
      baseCategorySpanPx: 220,
      baseValueSpanPx: 280
    });
  });

  test('payload layout normalization never persists derived Box reserve authority', () => {
    expect(typeof suite.hooks.normalizeBoxPayloadLayoutGeometry).toBe('function');
    const normalized = suite.hooks.normalizeBoxPayloadLayoutGeometry({
      userFrameWidthPx: 420,
      userFrameHeightPx: 380,
      bottomViewportExtensionPx: 49,
      significanceViewportExtensionPx: 7,
      leftViewportExtensionPx: 3,
      rightViewportExtensionPx: 5
    }, {
      frame: { widthPx: 420, heightPx: 380 },
      reserves: { xLabelPx: 49, significancePx: 7, leftPx: 3, rightPx: 5 }
    });

    expect(normalized.viewportGeometry).toEqual(expect.objectContaining({
      authorityVersion: 2,
      userFrameWidthPx: 420,
      userFrameHeightPx: 380
    }));
    expect(normalized.viewportGeometry).not.toHaveProperty('bottomViewportExtensionPx');
    expect(normalized.viewportGeometry).not.toHaveProperty('significanceViewportExtensionPx');
    expect(normalized.viewportGeometry).not.toHaveProperty('leftViewportExtensionPx');
    expect(normalized.viewportGeometry).not.toHaveProperty('rightViewportExtensionPx');
    expect(normalized.graphGeometry).not.toHaveProperty('reserves');
  });

  test('box point toolbar border width enables the selected default stroke color', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.resolveBoxToolbarPointBorderWidthPatch).toBe('function');
    expect(typeof suite.hooks.resolveBoxToolbarPointBorderColorValue).toBe('function');
    expect(typeof suite.hooks.normalizeBoxPointStylePatch).toBe('function');
    const proxy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    proxy.setAttribute('data-point-stroke', '#ffffff');
    proxy.setAttribute('data-point-stroke-width', '0');
    expect(suite.hooks.resolveBoxToolbarPointBorderColorValue({}, proxy)).toBe('#000000');
    const patch = suite.hooks.resolveBoxToolbarPointBorderWidthPatch({ stroke: 'none' }, proxy, 1.5);
    expect(patch).toEqual({
      borderWidth: 1.5,
      strokeWidth: 1.5,
      stroke: '#000000',
      borderColor: '#000000'
    });
    proxy.setAttribute('data-point-stroke-width', '2');
    expect(suite.hooks.resolveBoxToolbarPointBorderColorValue({}, proxy)).toBe('#ffffff');
    expect(suite.hooks.resolveBoxToolbarPointBorderWidthPatch({ stroke: '#123456' }, proxy, 0)).toEqual({
      borderWidth: 0,
      strokeWidth: 0
    });
    expect(suite.hooks.normalizeBoxPointStylePatch({ stroke: '#000000', borderWidth: 1.5 })).toEqual({
      stroke: '#000000',
      borderWidth: 1.5,
      borderColor: '#000000',
      strokeWidth: 1.5
    });
  });

  test('explicit point border width survives redraw stroke cap for tiny dense points', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.resolveBoxPointStrokeWidthForRender).toBe('function');
    expect(typeof suite.hooks.hasExplicitBoxPointBorderWidth).toBe('function');
    expect(suite.hooks.resolveBoxPointStrokeWidthForRender(1.5, 0.4, { explicit: false })).toBe(0);
    expect(suite.hooks.resolveBoxPointStrokeWidthForRender(1.5, 0.4, { explicit: true })).toBe(1.5);
    expect(suite.hooks.hasExplicitBoxPointBorderWidth({ borderWidth: 1.5 })).toBe(true);
    expect(suite.hooks.hasExplicitBoxPointBorderWidth({ strokeWidth: 1.5 })).toBe(true);
    expect(suite.hooks.hasExplicitBoxPointBorderWidth({})).toBe(false);
  });

  test('point style identity remains bound to the source column after exclusions', () => {
    expect(typeof suite.hooks.resolveBoxTraceStyleIndex).toBe('function');
    const visibleTraces = [
      { name: 'Control', columnIndex: 0 },
      { name: 'Treatment B', columnIndex: 2 }
    ];
    expect(suite.hooks.resolveBoxTraceStyleIndex(visibleTraces[0], 0)).toBe(0);
    expect(suite.hooks.resolveBoxTraceStyleIndex(visibleTraces[1], 1)).toBe(2);
    expect(suite.hooks.resolveBoxTraceStyleIndex({ groupName: 'A', columnIndex: 2 }, 1)).toBe(1);
    expect(suite.hooks.resolveBoxTraceStyleIndex({ name: 'Legacy trace' }, 1)).toBe(1);
  });

  test('dataset drag builds a physical column order and carries indexed styles', () => {
    expect(suite.hooks.buildBoxDatasetColumnOrder(
      [0, 1, 2, 3],
      [{ columnIndex: 0 }, { columnIndex: 2 }],
      0,
      1
    )).toEqual([1, 2, 0, 3]);
    expect(suite.hooks.reorderBoxIndexedValues(
      { 0: { fill: 'red' }, 2: { fill: 'blue' } },
      [1, 2, 0, 3]
    )).toEqual({
      1: { fill: 'blue' },
      2: { fill: 'red' }
    });
  });

  test('single-dataset indexed styles shift with physical column insertion and removal', () => {
    expect(typeof suite.hooks.spliceBoxIndexedValues).toBe('function');
    const colors = ['gray-0', 'gray-1', 'gray-2', 'green', 'red'];
    const insertedColors = suite.hooks.spliceBoxIndexedValues(colors, 2, 0, 1);
    expect(insertedColors).toEqual(['gray-0', 'gray-1', '', 'gray-2', 'green', 'red']);
    expect(suite.hooks.spliceBoxIndexedValues(insertedColors, 2, 1, 0)).toEqual(colors);

    const pointStyles = {
      2: { fill: '#777777' },
      3: { fill: '#00aa55' },
      4: { fill: '#ff0000' }
    };
    const insertedStyles = suite.hooks.spliceBoxIndexedValues(pointStyles, 2, 0, 1);
    expect(insertedStyles).toEqual({
      3: { fill: '#777777' },
      4: { fill: '#00aa55' },
      5: { fill: '#ff0000' }
    });
    expect(suite.hooks.spliceBoxIndexedValues(insertedStyles, 2, 1, 0)).toEqual(pointStyles);
  });

  test('deleted single-dataset indexed styles can be restored exactly for undo', () => {
    expect(typeof suite.hooks.captureBoxIndexedValuesSlice).toBe('function');
    expect(typeof suite.hooks.restoreBoxIndexedValuesSlice).toBe('function');
    const styles = {
      0: { shape: 'circle' },
      1: { shape: 'square', fill: '#00aa55' },
      2: { shape: 'diamond', fill: '#ff0000' }
    };
    const removedSlice = suite.hooks.captureBoxIndexedValuesSlice(styles, 1, 1);
    const removed = suite.hooks.spliceBoxIndexedValues(styles, 1, 1, 0);
    const reinserted = suite.hooks.spliceBoxIndexedValues(removed, 1, 0, 1);
    expect(suite.hooks.restoreBoxIndexedValuesSlice(reinserted, 1, removedSlice)).toEqual(styles);
  });

  test('dataset drag delegates the physical reorder to the active tab-owned table manager', () => {
    const hooks = window.Components.box.__testHooks;
    const owner = hooks.getSession('box-column-order-test', { create: true });
    const applyColumnOrder = jest.fn(() => true);
    owner.state.visual.fillColors = ['#111111', '#222222'];
    owner.state.visual.borderColors = ['#333333', '#444444'];
    owner.state.styles.traceShapeStyles = { 0: { fill: '#111111' } };
    owner.state.styles.pointStyles = { 1: { fill: '#222222' } };
    owner.state.styles.summaryStyles = { 0: { color: '#333333' } };
    owner.managers.hot = { __boxTabId: owner.tabId, applyColumnOrder };
    expect(suite.hooks.applyBoxDatasetColumnOrder([1, 2, 0], owner)).toBe(true);
    expect(applyColumnOrder).toHaveBeenCalledTimes(1);
    expect(applyColumnOrder).toHaveBeenCalledWith(
      [1, 2, 0],
      expect.objectContaining({
        reason: 'box-graph-dataset-reorder',
        updatePayload: expect.any(Function)
      })
    );
    const options = applyColumnOrder.mock.calls[0][1];
    expect(options.onApplied).toBeUndefined();
    expect(options.onUndo).toBeUndefined();
    expect(options.onRedo).toBeUndefined();
    const payload = options.updatePayload({ config: {} });
    expect(payload.config).toMatchObject({
      colors: ['#111111', '#222222'],
      borderColors: ['#333333', '#444444'],
      shapeStyles: { 0: { fill: '#111111' } },
      pointStyles: { 1: { fill: '#222222' } },
      summaryStyles: { 0: { color: '#333333' } }
    });
    owner.managers.hot = null;
  });

  test('canvas-backed point groups expose an interaction proxy for toolbar selection', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.findBoxPointNodeForTrace).toBe('function');
    document.body.innerHTML = '<div id="boxPlot"><svg><g data-export-layer="box-points" data-trace="7"><path data-point-proxy="1" data-trace="7"></path></g></svg></div>';
    suite.bindBoxWorkspaceRoot(document.body);
    const node = suite.hooks.findBoxPointNodeForTrace('7', null);
    expect(node).toBeTruthy();
    expect(node.getAttribute('data-point-proxy')).toBe('1');
    document.body.innerHTML = '';
  });

});
