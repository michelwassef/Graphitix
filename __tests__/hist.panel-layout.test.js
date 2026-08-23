describe('histogram separate-panel layout helpers', () => {
  let hooks;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {
      isDebugEnabled: () => false,
      chartStyle: {
        makeFont: size => `${Number(size) || 10}px sans-serif`,
        measureText: (text, font) => {
          const match = String(font || '').match(/([0-9.]+)px/);
          const size = match ? Number(match[1]) : 10;
          return String(text || '').length * size * 0.56;
        }
      }
    };
    window.Components = {};
    require('../js/components/hist.js');
    hooks = window.Components.hist.__testHooks;
  });

  test('sanitizes the durable series layout and preserves safe defaults', () => {
    expect(hooks.sanitizeSeriesLayout()).toEqual({
      display: 'overlay',
      arrangement: 'auto',
      sharedY: true
    });
    expect(hooks.sanitizeSeriesLayout({
      display: 'panels',
      arrangement: 'vertical',
      sharedY: false
    })).toEqual({
      display: 'panels',
      arrangement: 'vertical',
      sharedY: false
    });
    expect(hooks.sanitizeSeriesLayout({
      display: 'unsupported',
      arrangement: 'diagonal'
    })).toEqual({
      display: 'overlay',
      arrangement: 'auto',
      sharedY: true
    });
  });

  test('resolves explicit horizontal, vertical, and grid arrangements', () => {
    expect(hooks.resolvePanelGrid(4, 'horizontal', 900, 500)).toMatchObject({ rows: 1, cols: 4 });
    expect(hooks.resolvePanelGrid(4, 'vertical', 900, 500)).toMatchObject({ rows: 4, cols: 1 });
    expect(hooks.resolvePanelGrid(4, 'grid', 900, 500)).toMatchObject({ rows: 2, cols: 2 });
  });


  test('allocates equal plot rectangles while using axis-label space only where needed', () => {
    const layout = hooks.resolvePanelTrackLayout({
      rows: 2,
      cols: 2,
      contentWidth: 520,
      contentHeight: 360,
      gapX: 18,
      gapY: 20,
      originX: 42,
      originY: 34,
      fullLeftInset: 44,
      compactLeftInset: 6,
      rightInset: 8,
      topInset: 26,
      fullBottomInset: 34,
      compactBottomInset: 7,
      sharedY: true,
      minPlotWidth: 10,
      minPlotHeight: 10
    });

    expect(layout.columns).toHaveLength(2);
    expect(layout.rows).toHaveLength(2);
    expect(layout.columns.every(column => column.plotWidth === layout.plotWidth)).toBe(true);
    expect(layout.rows.every(row => row.plotHeight === layout.plotHeight)).toBe(true);
    expect(layout.columns[1].leftInset).toBeLessThan(layout.columns[0].leftInset);
    expect(layout.rows[0].bottomInset).toBeLessThan(layout.rows[1].bottomInset);
    expect(layout.columns.reduce((sum, column) => sum + column.width, 18)).toBeCloseTo(520, 10);
    expect(layout.rows.reduce((sum, row) => sum + row.height, 20)).toBeCloseTo(360, 10);
  });

  test('uses the available aspect ratio for a two-panel automatic layout', () => {
    expect(hooks.resolvePanelGrid(2, 'auto', 900, 400)).toMatchObject({ rows: 1, cols: 2 });
    expect(hooks.resolvePanelGrid(2, 'auto', 400, 900)).toMatchObject({ rows: 2, cols: 1 });
  });

  test('thins dense tick sequences with a regular integer stride', () => {
    const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const selected = hooks.selectPanelTicks(ticks, 4);
    expect(selected.length).toBeLessThanOrEqual(4);
    expect(selected[0]).toBe(0);
    expect(selected).toEqual([...selected].sort((a, b) => a - b));
    const intervals = selected.slice(1).map((value, index) => value - selected[index]);
    expect(new Set(intervals)).toEqual(new Set([40]));

    // This is the sequence that previously produced 0, 10, 30, 40, 50 and
    // therefore visible holes at 20 on a perfectly regular Y graduation.
    expect(hooks.selectPanelTicks([0, 10, 20, 30, 40, 50], 5)).toEqual([0, 20, 40]);
  });

  test('estimates Y tick capacity from text height rather than label width', () => {
    const labels = ['0', '1000000'];
    const vertical = hooks.estimatePanelTickCapacity(120, labels, '12px sans-serif', {
      axis: 'y',
      fontSize: 12,
      min: 2,
      max: 7,
      gap: 2.4
    });
    const horizontal = hooks.estimatePanelTickCapacity(120, labels, '12px sans-serif', {
      axis: 'x',
      min: 2,
      max: 7,
      gap: 8
    });
    expect(vertical).toBeGreaterThan(horizontal);
    expect(vertical).toBeGreaterThanOrEqual(6);
  });

  test('wraps long series titles without losing their complete text', () => {
    const result = hooks.resolvePanelTitleLayout('S100B — Poor outcome', 92, 12);
    expect(result.lines).toHaveLength(2);
    expect(result.lines.join(' ')).toBe('S100B — Poor outcome');
    expect(result.fontSize).toBeGreaterThanOrEqual(7);
    expect(result.fontSize).toBeLessThanOrEqual(12);
  });

  test('keeps the separate-panel contract active for histogram and density modes', () => {
    expect(hooks.isPanelDisplayActive({ display: 'panels', arrangement: 'grid', sharedY: true })).toBe(true);
    expect(hooks.isPanelDisplayActive({ display: 'overlay', arrangement: 'grid', sharedY: true })).toBe(false);
  });

  test('resolves density and histogram Y extents from their native series models', () => {
    const density = hooks.computeDensitySeries([0, 0.5, 1, 1.5, 2], {
      sampleCount: 64,
      minVal: -1,
      maxVal: 3
    });
    const densityExtent = hooks.resolvePanelYExtent(
      { values: [0, 0.5, 1, 1.5, 2], fits: [] },
      density,
      { plotMode: 'density', logY: false }
    );
    expect(density.positions.length).toBeGreaterThanOrEqual(48);
    expect(density.positions.length).toBeLessThanOrEqual(64);
    expect(densityExtent.yMin).toBe(0);
    expect(densityExtent.yMax).toBeCloseTo(density.peak, 12);

    const histogramExtent = hooks.resolvePanelYExtent(
      { values: [0, 1, 2], fits: [] },
      { values: [1, 4, 2], inRangeCount: 7 },
      { plotMode: 'histogram', logY: false }
    );
    expect(histogramExtent).toMatchObject({ yMin: 0, yMax: 4 });
  });


  test('adaptive KDE sampling does not miss narrow peaks on a wide shared domain', () => {
    const values = [0.13, 0.14, 0.10, 0.04, 0.47, 0.18, 0.10, 0.10, 0.04, 0.19];
    const compact = hooks.computeDensitySeries(values, { sampleCount: 64, minVal: -100, maxVal: 500 });
    const detailed = hooks.computeDensitySeries(values, { sampleCount: 240, minVal: -100, maxVal: 500 });
    expect(compact.peak).toBeGreaterThan(5);
    expect(detailed.peak).toBeGreaterThan(5);
    expect(Math.abs(compact.peak - detailed.peak) / detailed.peak).toBeLessThan(0.04);
  });

  test('plot summaries stay concise as dataset count increases', () => {
    const oneSeries = hooks.buildPlotSummaryLines([
      { name: 'A', values: [1, 2, 3, 4] }
    ]);
    expect(oneSeries).toHaveLength(1);
    expect(oneSeries[0]).toContain('n = 4');
    expect(oneSeries[0]).toContain('Mean = 2.500');
    expect(oneSeries[0]).toContain('SD =');

    const twoSeries = [
      { name: 'A', values: [1, 2, 3, 4] },
      { name: 'B', values: [10, 11, 12, 13] }
    ];
    expect(hooks.buildPlotSummaryLines(twoSeries, { comparisonMode: 'ks' })[0]).toMatch(/^Two-sample KS:/);
    expect(hooks.buildPlotSummaryLines(twoSeries, { comparisonMode: 'none' })).toEqual([]);

    expect(hooks.buildPlotSummaryLines([
      ...twoSeries,
      { name: 'C', values: [20, 21, 22] }
    ], { comparisonMode: 'ks' })).toEqual([]);
  });

});
