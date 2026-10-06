const {
  compareRegressionMetrics,
  compareRegressionPredictions,
  compareSummaryParameters,
  expectClose,
  expectFinite,
  indexOracleResults,
  loadStatsHooks,
  regressionOperationForMode,
  runPythonOracle,
  sampleModelPoints,
  testWithOracle,
  toPoints,
  uniqueSorted
} = require('../../test-support/statsMatrixSuite');

describe('Scatter statistics oracle matrix', () => {
  let scatterHooks;

  beforeEach(() => {
    scatterHooks = loadStatsHooks(['scatter']).scatter;
  });

  testWithOracle('scatter oracle-backed matrix covers supported regression families and parameter routing', () => {
    expect(scatterHooks).toBeTruthy();

    const saturatingX = [0.2, 0.4, 0.8, 1.5, 2.5, 4, 6, 9, 13, 18];
    const logDoseX = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
    const gaussianX = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
    const scatterSpecs = [
      { mode: 'linear', x: [1, 2, 3, 4, 5, 6, 7, 8], y: [3.1, 4.8, 6.9, 8.7, 10.2, 12.1, 14.3, 15.8], expectedAssociation: 'pearson', fitSpec: {} },
      { mode: 'linearThroughOrigin', x: [1, 2, 3, 4, 5, 6, 7, 8], y: [2.0, 4.1, 5.9, 8.2, 10.0, 11.7, 14.1, 15.8], expectedAssociation: 'pearson', fitSpec: {} },
      { mode: 'quadratic', x: [-3, -2, -1, 0, 1, 2, 3, 4], y: [15.7, 8.1, 3.2, 1.0, 2.7, 7.8, 15.8, 27.2], expectedAssociation: 'none', fitSpec: {} },
      { mode: 'cubic', x: [-3, -2, -1, 0, 1, 2, 3, 4], y: [-13.1, -2.4, 0.2, 1.1, 2.3, 6.9, 18.7, 42.7], expectedAssociation: 'none', fitSpec: {} },
      { mode: 'exponential', x: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], y: [2.2, 2.8, 3.5, 4.7, 6.0, 7.7, 10.0, 12.7], expectedAssociation: 'spearman', fitSpec: {} },
      { mode: 'power', x: [1, 2, 3, 4, 5, 6, 7, 8], y: [2.8, 7.3, 13.2, 21.0, 29.4, 39.0, 49.5, 61.2], expectedAssociation: 'spearman', fitSpec: {} },
      { mode: 'logistic', x: [-3, -2.5, -2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3], y: [0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], expectedAssociation: 'spearman', fitSpec: {} },
      { mode: 'spline', x: [0, 1, 2, 3, 4, 5], y: [0, 1.5, 0.3, 1.8, 0.2, 1.4], expectedAssociation: 'none', fitSpec: {} },
      { mode: 'deming', x: [1, 2, 3, 4, 5, 6, 7, 8], y: [3.4, 5.2, 7.7, 9.5, 11.8, 14.1, 15.9, 18.5], expectedAssociation: 'pearson', fitSpec: { errorRatio: 2.5 } },
      { mode: 'orthogonal', x: [1, 2, 3, 4, 5, 6, 7, 8], y: [3.4, 5.2, 7.7, 9.5, 11.8, 14.1, 15.9, 18.5], expectedAssociation: 'pearson', fitSpec: {} },
      { mode: 'doseResponse3pl', points: sampleModelPoints(logDoseX, x => 92 / (1 + Math.pow(10, (0.35 - x) * 1.15))), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Bottom', 'Top', 'LogIC50', 'IC50', 'HillSlope'] },
      { mode: 'doseResponse4pl', points: sampleModelPoints(logDoseX, x => 7 + ((96 - 7) / (1 + Math.pow(10, (0.25 - x) * 1.2)))), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Bottom', 'Top', 'LogIC50', 'IC50', 'HillSlope'] },
      { mode: 'doseResponse5pl', points: sampleModelPoints(logDoseX, x => 5 + ((90 - 5) / Math.pow(1 + Math.pow(10, (0.15 - x) * 1.05), 1.35))), expectedAssociation: 'spearman', fitSpec: {} },
      { mode: 'onePhaseAssociation', points: sampleModelPoints(saturatingX, x => 3 + ((48 - 3) * (1 - Math.exp(-0.24 * x)))), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Y0', 'Plateau', 'K'] },
      { mode: 'onePhaseDecay', points: sampleModelPoints(saturatingX, x => 8 + ((75 - 8) * Math.exp(-0.2 * x))), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Y0', 'Plateau', 'K'] },
      { mode: 'gompertz', points: sampleModelPoints(saturatingX, x => 4 + ((98 - 4) * Math.exp(-Math.exp(-0.42 * (x - 5.5))))), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Lower', 'Upper', 'K', 'X0'] },
      { mode: 'gaussian', points: sampleModelPoints(gaussianX, x => 1.5 + (19 * Math.exp(-0.5 * Math.pow((x - 0.5) / 1.4, 2)))), expectedAssociation: 'none', fitSpec: {}, summaryKeys: ['Baseline', 'Amplitude', 'Center', 'Sigma'] },
      { mode: 'bindingSaturation', points: sampleModelPoints(saturatingX, x => ((82 * x) / (2.8 + x)) + (0.45 * x)), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Bmax', 'Kd', 'NS'] },
      { mode: 'bindingCompetitive', points: sampleModelPoints(saturatingX, x => 6 + ((97 - 6) / (1 + Math.pow(x / 3.8, 1.25)))), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Top', 'Bottom', 'IC50', 'HillSlope'] },
      { mode: 'enzymeKineticsSubstrate', points: sampleModelPoints(saturatingX, x => 2 + ((88 * x) / (2.4 + x))), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Vmax', 'Km', 'Baseline'] },
      { mode: 'enzymeKineticsInhibition', points: sampleModelPoints(saturatingX, x => 4 + (84 / (1 + Math.pow(x / 3.2, 1.4)))), expectedAssociation: 'spearman', fitSpec: {}, summaryKeys: ['Vmax', 'IC50', 'HillSlope', 'Baseline'] }
    ];

    const cases = [];
    const js = {};
    scatterSpecs.forEach(spec => {
      const points = Array.isArray(spec.points) ? spec.points : toPoints(spec.x, spec.y);
      const x = points.map(point => point.x);
      const y = points.map(point => point.y);
      const op = regressionOperationForMode(spec.mode);
      const payload = { x, y, alpha: 0.05, evalXs: uniqueSorted(x), ...op.payloadExtra };
      if (spec.mode === 'deming') payload.errorRatio = spec.fitSpec.errorRatio;
      if (spec.mode === 'lowess') payload.span = spec.fitSpec.span;
      cases.push({ id: `scatter-${spec.mode}-regression`, operation: op.operation, payload });
      if (spec.expectedAssociation !== 'none') {
        cases.push({ id: `scatter-${spec.mode}-correlation`, operation: 'correlation', payload: { method: spec.expectedAssociation, x, y } });
      }
      js[spec.mode] = scatterHooks.computeScatterStats(points, 'auto', { regressionMode: spec.mode, associationSelection: 'auto', fitMethod: 'ols', fitSpec: spec.fitSpec });
    });

    const oracle = indexOracleResults(runPythonOracle(cases));
    const predictionModes = new Set(['lowess', 'spline', 'doseResponse3pl', 'doseResponse4pl', 'doseResponse5pl', 'onePhaseAssociation', 'onePhaseDecay', 'gompertz', 'gaussian', 'bindingSaturation', 'bindingCompetitive', 'enzymeKineticsSubstrate', 'enzymeKineticsInhibition']);
    scatterSpecs.forEach(spec => {
      const actual = js[spec.mode];
      const regressionRef = oracle.get(`scatter-${spec.mode}-regression`)?.result;
      const metricTolerance = spec.mode === 'doseResponse5pl'
        ? { abs: 1e-1, rel: 1e-2 }
        : ((spec.mode === 'deming' || spec.mode === 'orthogonal') ? { abs: 2e-4, rel: 1e-3 } : { abs: 1e-5, rel: 1e-4 });
      const predictionTolerance = spec.mode === 'doseResponse5pl' ? { abs: 2e-1, rel: 2e-2 } : { abs: 1e-5, rel: 1e-4 };
      const summaryTolerance = spec.mode === 'doseResponse5pl' ? { abs: 2e-1, rel: 2e-2 } : { abs: 1e-4, rel: 1e-3 };
      expect(actual).toBeTruthy();
      expect(actual.associationMethod).toBe(spec.expectedAssociation);
      if (spec.expectedAssociation !== 'none') {
        const corrRef = oracle.get(`scatter-${spec.mode}-correlation`)?.result;
        expectClose(actual.r, corrRef.r, `scatter-${spec.mode}.r`, { abs: 1e-6, rel: 1e-5 });
        expectClose(actual.p, corrRef.p, `scatter-${spec.mode}.p`, { abs: 1e-5, rel: 1e-4 });
      }
      compareRegressionMetrics(actual.regression?.metrics, regressionRef?.metrics, `scatter-${spec.mode}.metrics`, {
        keys: (spec.mode === 'deming' || spec.mode === 'orthogonal') ? ['sse', 'rmse', 'mae'] : (spec.mode === 'logistic' ? ['sse', 'r2', 'rmse', 'mae', 'logLoss'] : ['sse', 'r2', 'rmse', 'mae']),
        tolerance: metricTolerance
      });
      if (predictionModes.has(spec.mode)) {
        const evalXs = uniqueSorted((Array.isArray(spec.points) ? spec.points : toPoints(spec.x, spec.y)).map(point => point.x));
        compareRegressionPredictions(actual.regression, evalXs, regressionRef.predictions, `scatter-${spec.mode}`, predictionTolerance);
        if (Array.isArray(spec.summaryKeys) && spec.summaryKeys.length) {
          compareSummaryParameters(actual.regression, regressionRef.summary, spec.summaryKeys, `scatter-${spec.mode}`, summaryTolerance);
        }
      } else if (spec.mode === 'exponential' || spec.mode === 'power') {
        const parameters = actual.regression?.summary?.parameters;
        if (spec.mode === 'exponential') {
          expectClose(parameters?.Amplitude, regressionRef?.summary?.amplitude, `scatter-${spec.mode}.amplitude`, { abs: 1e-5, rel: 1e-4 });
          expectClose(parameters?.Rate, regressionRef?.summary?.rate, `scatter-${spec.mode}.rate`, { abs: 1e-5, rel: 1e-4 });
        } else {
          expectClose(parameters?.Scale, regressionRef?.summary?.scale, `scatter-${spec.mode}.scale`, { abs: 1e-5, rel: 1e-4 });
          expectClose(parameters?.Exponent, regressionRef?.summary?.exponent, `scatter-${spec.mode}.exponent`, { abs: 1e-5, rel: 1e-4 });
        }
      } else if (Array.isArray(regressionRef?.coefficients) && regressionRef.coefficients.length) {
        regressionRef.coefficients.forEach((value, index) => {
          expectClose(actual.regression?.coefficients?.[index], value, `scatter-${spec.mode}.coefficients[${index}]`, (spec.mode === 'deming' || spec.mode === 'orthogonal') ? { abs: 1e-2, rel: 1e-2 } : { abs: 1e-4, rel: 1e-3 });
        });
      }
    });
  });

  testWithOracle('scatter LOWESS fitter is differentially validated against oracle', () => {
    expect(typeof scatterHooks?.fitScatterLowessRegression).toBe('function');
    const points = toPoints([0, 1, 2, 3, 4, 5, 6, 7], [1.2, 2.8, 2.1, 4.4, 3.6, 5.1, 4.8, 6.2]);
    const x = points.map(point => point.x);
    const y = points.map(point => point.y);
    const span = 0.65;
    const actual = scatterHooks.fitScatterLowessRegression(points, { fitSpec: { span } });
    const oracle = indexOracleResults(runPythonOracle([{ id: 'scatter-lowess-direct', operation: 'regression_lowess', payload: { x, y, span, evalXs: uniqueSorted(x) } }]));
    const ref = oracle.get('scatter-lowess-direct')?.result;
    expect(actual).toBeTruthy();
    compareRegressionMetrics(actual.metrics, ref.metrics, 'scatter-lowess-direct.metrics', { keys: ['sampleSize', 'parameterCount', 'residualDf', 'sse', 'r2', 'rmse', 'mae', 'aic', 'aicc', 'bic'], tolerance: { abs: 1e-6, rel: 1e-5 } });
    compareRegressionPredictions(actual, uniqueSorted(x), ref.predictions, 'scatter-lowess-direct', { abs: 1e-6, rel: 1e-5 });
    compareSummaryParameters({ summary: actual.summary }, ref.summary, ['Span'], 'scatter-lowess-direct', { abs: 1e-12, rel: 1e-9 });
  });

  test('Scatter LOWESS baseline filters invalid pairs, sorts finite points, clamps finite spans, and rejects short input', () => {
    const points = [
      { x: 3, y: 30 },
      { x: 1, y: 10 },
      { x: NaN, y: 15 },
      { x: 2, y: 20 },
      { x: 4, y: Infinity }
    ];
    const original = points.map(point => ({ ...point }));
    const lowSpan = scatterHooks.fitScatterLowessRegression(points, { fitSpec: { span: -1 } });
    const highSpan = scatterHooks.fitScatterLowessRegression(points, { fitSpec: { span: 2 } });

    expect(lowSpan.metrics.sampleSize).toBe(3);
    expect(lowSpan.summary.parameters.Span).toBe(0.2);
    expect(highSpan.summary.parameters.Span).toBe(0.95);
    expect(lowSpan.domain).toEqual({ minX: 1, maxX: 3 });
    expect(lowSpan.curveSamples.map(point => point.x)).toEqual([1, 2, 3]);
    expect(points).toEqual(original);
    expect(scatterHooks.fitScatterLowessRegression(points.slice(0, 2))).toBeNull();
  });

  test('Scatter LOWESS defaults an unparseable explicit span to the established default', () => {
    const points = toPoints([1, 2, 3], [2, 4, 5]);
    const result = scatterHooks.fitScatterLowessRegression(points, { fitSpec: { span: 'invalid' } });
    expect(result.summary.parameters.Span).toBe(0.75);
  });

  test('scatter visible modes all execute, auto-association matches policy, and special routing is exercised', () => {
    const linearData = toPoints([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [3.0, 4.5, 5.7, 7.8, 9.9, 11.2, 13.5, 15.7, 17.8, 19.9]);
    const saturatingData = toPoints([0.2, 0.4, 0.8, 1.5, 2.5, 4, 6, 9, 13, 18], [4.3, 8.8, 16.8, 28.1, 42.3, 58.5, 73.3, 86.2, 94.1, 98.2]);
    const decayData = toPoints([0.2, 0.4, 0.8, 1.5, 2.5, 4, 6, 9, 13, 18], [101.2, 95.8, 88.1, 79.3, 67.8, 53.4, 39.5, 25.8, 15.2, 8.7]);
    const bellData = toPoints([-4, -3, -2, -1, 0, 1, 2, 3, 4], [1.4, 3.1, 8.8, 16.2, 21.0, 16.2, 8.8, 3.1, 1.4]);
    const powerData = toPoints([1, 2, 3, 4, 5, 6, 7, 8], [3.0, 7.4, 13.1, 20.8, 29.3, 38.9, 49.2, 60.6]);
    const binaryLogisticData = toPoints([-3, -2.5, -2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3], [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    const visibleModes = [
      { mode: 'linear', expectedAssociation: 'pearson', points: linearData },
      { mode: 'linearThroughOrigin', expectedAssociation: 'pearson', points: linearData },
      { mode: 'quadratic', expectedAssociation: 'none', points: linearData },
      { mode: 'cubic', expectedAssociation: 'none', points: linearData },
      { mode: 'logistic', expectedAssociation: 'spearman', points: binaryLogisticData },
      { mode: 'doseResponse3pl', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'doseResponse4pl', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'doseResponse5pl', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'exponential', expectedAssociation: 'spearman', points: decayData },
      { mode: 'onePhaseAssociation', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'onePhaseDecay', expectedAssociation: 'spearman', points: decayData },
      { mode: 'gompertz', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'power', expectedAssociation: 'spearman', points: powerData },
      { mode: 'gaussian', expectedAssociation: 'none', points: bellData },
      { mode: 'spline', expectedAssociation: 'none', points: linearData },
      { mode: 'bindingSaturation', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'bindingCompetitive', expectedAssociation: 'spearman', points: decayData },
      { mode: 'enzymeKineticsSubstrate', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'enzymeKineticsInhibition', expectedAssociation: 'spearman', points: decayData },
      { mode: 'deming', expectedAssociation: 'pearson', points: linearData },
      { mode: 'orthogonal', expectedAssociation: 'pearson', points: linearData },
      { mode: 'lowess', expectedAssociation: 'none', points: linearData }
    ];

    visibleModes.forEach(entry => {
      const stats = scatterHooks.computeScatterStats(entry.points, 'auto', { regressionMode: entry.mode, associationSelection: 'auto', fitMethod: 'ols', fitSpec: entry.mode === 'lowess' ? { span: 0.65 } : {} });
      expect(stats).toBeTruthy();
      expect(stats.regression).toBeTruthy();
      expect(stats.associationMethod).toBe(entry.expectedAssociation);
      expectFinite(stats.pointCount, `${entry.mode}.pointCount`);
      expect(Array.isArray(stats.regression.warnings || [])).toBe(true);
    });

    const nonBinaryLogistic = scatterHooks.computeScatterStats(saturatingData, 'auto', { regressionMode: 'logistic', associationSelection: 'auto' });
    expect(nonBinaryLogistic.regression).toBeTruthy();
    expect(String(nonBinaryLogistic.regression.mode || '').toLowerCase()).toBe('doseresponse4pl');
    expect(nonBinaryLogistic.regression.warnings.join(' ')).toContain('four-parameter dose-response');

    const outlierData = toPoints([1, 2, 3, 4, 5, 6, 7, 8], [2.0, 4.1, 6.3, 8.0, 10.2, 12.1, 14.0, 100]);
    const linearOls = scatterHooks.computeScatterStats(outlierData, 'auto', { regressionMode: 'linear', fitMethod: 'ols', associationSelection: 'auto' });
    const linearWls = scatterHooks.computeScatterStats(outlierData, 'auto', { regressionMode: 'linear', fitMethod: 'wls_y2', associationSelection: 'auto' });
    expect(String(linearOls.regression?.fitMethod || '').toLowerCase()).toBe('ols');
    expect(String(linearWls.regression?.fitMethod || '').toLowerCase()).not.toBe('ols');
    expect(linearWls.regression?.summary).toBeTruthy();

    const lowessTight = scatterHooks.computeScatterStats(linearData, 'auto', { regressionMode: 'lowess', associationSelection: 'auto', fitSpec: { span: 0.3 } });
    const lowessWide = scatterHooks.computeScatterStats(linearData, 'auto', { regressionMode: 'lowess', associationSelection: 'auto', fitSpec: { span: 0.9 } });
    expect(lowessTight.associationMethod).toBe('none');
    expect(lowessWide.associationMethod).toBe('none');
    expectClose(lowessTight.regression?.fitSpec?.span, 0.3, 'lowess tight span', { abs: 1e-12, rel: 1e-9 });
    expectClose(lowessWide.regression?.fitSpec?.span, 0.9, 'lowess wide span', { abs: 1e-12, rel: 1e-9 });
  });
});
