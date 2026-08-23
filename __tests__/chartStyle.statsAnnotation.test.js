describe('chartStyle statistical annotation helper', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = window.Shared || {};
    window.Shared.enableLabelDrag = jest.fn();
    window.Shared.fontControls = { markText: jest.fn() };
    require('../js/shared/chartStyle.js');
  });

  test('renders SVG-native multiline text and delegates drag without owning state', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const onDragEnd = jest.fn();
    const node = window.Shared.chartStyle.renderStatsAnnotation(svg, {
      lines: ['AUC=0.84', 'p=0.01'],
      x: 100,
      y: 20,
      fontSize: 10,
      onDragEnd
    });
    expect(node).toBeTruthy();
    expect(node.getAttribute('data-plot-stats-annotation')).toBe('1');
    expect(Array.from(node.querySelectorAll('tspan')).map(el => el.textContent)).toEqual(['AUC=0.84', 'p=0.01']);
    expect(window.Shared.fontControls.markText).toHaveBeenCalledWith(node, expect.objectContaining({
      role: 'statsSummary',
      key: 'statsSummary'
    }));
    expect(window.Shared.enableLabelDrag).toHaveBeenCalledTimes(1);
    const options = window.Shared.enableLabelDrag.mock.calls[0][2];
    expect(options.normalizeDuringDrag).toBe(true);
    options.onDragEnd({ x: 100, y: 20 });
    expect(onDragEnd).toHaveBeenCalledWith({ x: 100, y: 20 });
  });

  test('clamps the complete multiline box to the current SVG viewport', () => {
    const chartStyle = window.Shared.chartStyle;
    chartStyle.measureText = jest.fn(() => 40);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 120 80');
    const node = chartStyle.renderStatsAnnotation(svg, {
      lines: ['first line', 'second line'],
      x: 119,
      y: 79,
      textAnchor: 'start',
      fontSize: 10,
      containerPadding: 2
    });
    expect(Number(node.getAttribute('x'))).toBe(78);
    expect(Number(node.getAttribute('y'))).toBeCloseTo(63.8, 5);
    const dragOptions = window.Shared.enableLabelDrag.mock.calls[0][2];
    expect(dragOptions.normalizePosition({ x: -100, y: -100 })).toEqual({ x: 2, y: 10.2 });
    expect(dragOptions.normalizePosition({ x: 999, y: 999 })).toEqual({ x: 78, y: 63.8 });
    svg.setAttribute('viewBox', '0 0 80 60');
    expect(dragOptions.normalizePosition({ x: 999, y: 999 })).toEqual({ x: 38, y: 43.8 });
  });

  test('wraps an overlong statistics line before applying viewport bounds', () => {
    const chartStyle = window.Shared.chartStyle;
    chartStyle.measureText = jest.fn(value => String(value).length * 10);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 60 80');
    const node = chartStyle.renderStatsAnnotation(svg, {
      lines: ['abcdefghij'],
      x: 58,
      y: 20,
      textAnchor: 'end',
      fontSize: 10,
      containerPadding: 2
    });
    const lines = Array.from(node.children);
    expect(lines.map(line => line.textContent)).toEqual(['abcde', 'fghij']);
    expect(lines.map(line => line.getAttribute('dy'))).toEqual(['0', '1.2em']);
  });

  test('typesets exponential equations with SVG superscripts while preserving editable structure', () => {
    const chartStyle = window.Shared.chartStyle;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const node = chartStyle.renderStatsAnnotation(svg, {
      lines: ['y = 32.9964 exp(0.0703x)', 'R² = 0.96; p < 0.0001'],
      x: 100,
      y: 20,
      fontSize: 10
    });

    const fragments = Array.from(node.children);
    expect(fragments.map(fragment => fragment.textContent)).toEqual([
      'y = 32.9964 e',
      '0.0703x',
      'R² = 0.96; p < 0.0001'
    ]);
    expect(fragments[0].getAttribute('data-stats-line-start')).toBe('1');
    expect(fragments[1].getAttribute('baseline-shift')).toBe('super');
    expect(fragments[1].getAttribute('data-stats-math-script-depth')).toBe('1');
    expect(fragments[1].hasAttribute('x')).toBe(false);
    expect(fragments[2].getAttribute('data-stats-line-start')).toBe('1');
    expect(fragments[2].getAttribute('dy')).toBe('1.2em');
    expect(node.getAttribute('data-font-preserve-structure')).toBe('children');

    const dragOptions = window.Shared.enableLabelDrag.mock.calls[0][2];
    expect(dragOptions.syncChildX).toBe(true);
    dragOptions.normalizePosition({ x: 100, y: 20 });
    expect(fragments[1].hasAttribute('x')).toBe(false);
  });

  test('typesets nested exp and caret exponents without exposing source notation', () => {
    const chartStyle = window.Shared.chartStyle;
    expect(chartStyle.parseStatsAnnotationMathFragments('y = a exp(−exp[−Kx])')).toEqual([
      { text: 'y = a e', scriptDepth: 0 },
      { text: '−e', scriptDepth: 1 },
      { text: '−Kx', scriptDepth: 2 }
    ]);
    expect(chartStyle.parseStatsAnnotationMathFragments('y = ax^(2.5)')).toEqual([
      { text: 'y = ax', scriptDepth: 0 },
      { text: '2.5', scriptDepth: 1 }
    ]);
  });

  test('normalizes the default statistical annotation font size', () => {
    expect(window.Shared.chartStyle.resolveStatsAnnotationFontSize(16)).toBe(12);
    expect(window.Shared.chartStyle.resolveStatsAnnotationFontSize(8)).toBe(8);
  });

  test('resolves persisted stats font overrides for layout as well as rendering', () => {
    const metrics = window.Shared.chartStyle.resolveStatsAnnotationFontMetrics(16, {
      styles: {
        __graph__: { fontFamily: 'Inter', fontSize: '14px' },
        statsSummary: { fontSize: '24px', fontWeight: '700' }
      }
    });
    expect(metrics.fontSizePx).toBe(24);
    expect(metrics.fontFamily).toBe('Inter');
    expect(metrics.fontWeight).toBe('700');
  });

  test('passes the explicit owner tab to the font-control registry', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const node = window.Shared.chartStyle.renderStatsAnnotation(svg, {
      lines: ['p=0.01'],
      x: 10,
      y: 10,
      tabId: 'workspace-stats-a',
      fontScopeId: 'hist'
    });
    expect(window.Shared.fontControls.markText).toHaveBeenCalledWith(node, expect.objectContaining({
      scopeId: 'hist',
      role: 'statsSummary',
      key: 'statsSummary',
      tabId: 'workspace-stats-a'
    }));
  });

  test('stores and resolves frame-relative positions across graph resizes', () => {
    const chartStyle = window.Shared.chartStyle;
    const frame = { originX: 20, originY: 10, width: 200, height: 100 };
    const stored = chartStyle.captureStatsAnnotationPosition({ x: 170, y: 60 }, frame);
    expect(stored).toEqual({ x: 170, y: 60, relX: 0.75, relY: 0.5 });
    expect(chartStyle.resolveStatsAnnotationPosition(stored, { x: 0, y: 0 }, {
      originX: 40,
      originY: 20,
      width: 400,
      height: 200
    })).toEqual({ x: 340, y: 120 });
  });

  test('keeps legacy absolute positions when relative coordinates are absent', () => {
    const chartStyle = window.Shared.chartStyle;
    expect(chartStyle.resolveStatsAnnotationPosition(
      { x: 123, y: 45 },
      { x: 10, y: 20 },
      { originX: 5, originY: 5, width: 300, height: 200 }
    )).toEqual({ x: 123, y: 45 });
  });

  test('treats null and empty persisted coordinates as missing rather than zero', () => {
    const chartStyle = window.Shared.chartStyle;
    expect(chartStyle.resolveStatsAnnotationPosition(
      { x: null, y: '', relX: null, relY: undefined },
      { x: 15, y: 25 },
      { originX: 5, originY: 10, width: 300, height: 200 }
    )).toEqual({ x: 15, y: 25 });
    expect(chartStyle.captureStatsAnnotationPosition(
      { x: null, y: 25 },
      { originX: 5, originY: 10, width: 300, height: 200 }
    )).toBeNull();
  });

  test('returns null for empty content or invalid coordinates', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(window.Shared.chartStyle.renderStatsAnnotation(svg, { lines: [], x: 1, y: 1 })).toBeNull();
    expect(window.Shared.chartStyle.renderStatsAnnotation(svg, { lines: ['x'], x: NaN, y: 1 })).toBeNull();
  });
});
