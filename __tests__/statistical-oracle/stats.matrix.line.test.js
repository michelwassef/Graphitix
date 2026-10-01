const {
  compareLinearLikeRegression,
  compareRegressionMetrics,
  compareSummaryParameters,
  createSpearmanExactP,
  expectClose,
  indexOracleResults,
  loadStatsHooks,
  regressionOperationForMode,
  runPythonOracle,
  testWithOracle,
  toPoints
} = require('../../test-support/statsMatrixSuite');

describe('Line statistics oracle matrix', () => {
  let lineHooks;

  beforeEach(() => {
    lineHooks = loadStatsHooks(['line']).line;
  });

  testWithOracle('line matrix covers visible correlation and regression modes against oracle', () => {
    expect(lineHooks).toBeTruthy();

    const lineSpecs = [
      { mode: 'linear', x: [-3, -2, -1, 0, 1, 2, 3, 4, 5], y: [-3.7, -1.8, -0.1, 1.6, 3.2, 5.1, 6.8, 8.5, 10.3] },
      { mode: 'quadratic', x: [-3, -2, -1, 0, 1, 2, 3, 4], y: [16.1, 8.4, 3.0, 1.2, 2.8, 7.7, 15.9, 27.4] },
      { mode: 'cubic', x: [-3, -2, -1, 0, 1, 2, 3, 4], y: [-13.2, -2.5, 0.4, 1.1, 2.0, 6.8, 18.9, 42.5] },
      { mode: 'exponential', x: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], y: [2.2, 2.7, 3.6, 4.6, 6.0, 7.8, 10.1, 12.8] },
      { mode: 'power', x: [1, 2, 3, 4, 5, 6, 7, 8], y: [2.6, 7.1, 13.5, 21.1, 29.6, 39.2, 49.7, 61.4] },
      { mode: 'spline', x: [0, 1, 2, 3, 4, 5], y: [0, 1.6, 0.4, 1.9, 0.3, 1.4] },
      { mode: 'logistic', x: [-3, -2.5, -2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3], y: [0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1] }
    ];
    const methods = ['pearson', 'spearman'];
    const cases = [];
    const js = {};

    lineSpecs.forEach(spec => {
      methods.forEach(method => {
        const id = `line-${spec.mode}-${method}`;
        const oracleRegression = regressionOperationForMode(spec.mode);
        const exactEligibleSpearman = method === 'spearman'
          && spec.x.length <= 9
          && (new Set(spec.x)).size === spec.x.length
          && (new Set(spec.y)).size === spec.y.length;
        cases.push({ id: `${id}-regression`, operation: oracleRegression.operation, payload: { x: spec.x, y: spec.y, alpha: 0.05, ...oracleRegression.payloadExtra } });
        cases.push({ id: `${id}-correlation`, operation: 'correlation', payload: { method, x: spec.x, y: spec.y, exactPermutation: exactEligibleSpearman } });
        js[id] = lineHooks.computeLineStats(toPoints(spec.x, spec.y), method, { regressionMode: spec.mode });
      });
    });

    const oracle = indexOracleResults(runPythonOracle(cases));

    lineSpecs.forEach(spec => {
      methods.forEach(method => {
        const id = `line-${spec.mode}-${method}`;
        const regressionRef = oracle.get(`${id}-regression`)?.result;
        const corrRef = oracle.get(`${id}-correlation`)?.result;
        const actual = js[id];
        expect(actual).toBeTruthy();
        expectClose(actual.r, corrRef.r, `${id}.r`, { abs: 1e-8, rel: 1e-6 });
        expectClose(actual.p, corrRef.p, `${id}.p`, { abs: 1e-5, rel: 1e-4 });
        compareLinearLikeRegression(actual.regression, regressionRef, `${id}.regression`, {
          keys: spec.mode === 'logistic' ? ['sse', 'r2', 'rmse', 'mae', 'logLoss'] : ['sse', 'r2', 'rmse', 'mae'],
          skipCoefficients: spec.mode === 'exponential' || spec.mode === 'power'
        });
        if (spec.mode === 'exponential') {
          expectClose(actual.regression?.summary?.parameters?.Amplitude, regressionRef?.summary?.amplitude, `${id}.amplitude`, { abs: 1e-5, rel: 1e-4 });
          expectClose(actual.regression?.summary?.parameters?.Rate, regressionRef?.summary?.rate, `${id}.rate`, { abs: 1e-5, rel: 1e-4 });
        }
        if (spec.mode === 'power') {
          expectClose(actual.regression?.summary?.parameters?.Scale, regressionRef?.summary?.scale, `${id}.scale`, { abs: 1e-5, rel: 1e-4 });
          expectClose(actual.regression?.summary?.parameters?.Exponent, regressionRef?.summary?.exponent, `${id}.exponent`, { abs: 1e-5, rel: 1e-4 });
        }
      });
    });
  });

  testWithOracle('line exact Spearman branch and forecast modes are differentially validated against oracle', () => {
    const exactX = [1, 2, 3, 4, 5, 6, 7];
    const exactY = [4, 1, 6, 2, 7, 3, 5];
    const exact = lineHooks.computeLineStats(toPoints(exactX, exactY), 'spearman', { regressionMode: 'linear' });
    const exactP = createSpearmanExactP(exact.r, exactX.length);
    expect(String(exact.pMethod || '').toLowerCase()).toContain('exact');
    expectClose(exact.p, exactP, 'line spearman exact p', { abs: 1e-12, rel: 1e-9 });

    const arimaX = Array.from({ length: 18 }, (_, idx) => idx + 1);
    const arimaY = [10.00, 12.11, 10.94, 13.08, 15.03, 13.89, 16.06, 18.02, 16.91, 19.12, 20.95, 20.07, 21.96, 24.09, 22.88, 25.04, 27.13, 25.92];
    const seasonalX = Array.from({ length: 20 }, (_, idx) => idx + 1);
    const seasonalY = [18, 24, 29, 22, 21, 27, 32, 25, 24, 30, 35, 28, 27, 33, 38, 31, 30, 36, 41, 34];
    const arimaPoints = toPoints(arimaX, arimaY);
    const integratedPoints = Array.from({ length: 24 }, (_, index) => ({ x: index, y: (index * index) + (0.05 * Math.sin(index * 1.7)) }));
    const seasonalPoints = toPoints(seasonalX, seasonalY);

    const specs = [
      { id: 'line-arima-manual', mode: 'arima', points: arimaPoints, forecast: { horizon: 4, p: 1, d: 0, autoTune: false }, summaryKeys: ['Horizon', 'AR order (p)', 'Differencing (d)', 'AR1'] },
      { id: 'line-arima-auto', mode: 'arima', points: arimaPoints, forecast: { horizon: 5, autoTune: true, criterion: 'bic', maxP: 2, maxD: 1 }, summaryKeys: ['Horizon', 'AR order (p)', 'Differencing (d)'] },
      { id: 'line-arima-integrated-d2', mode: 'arima', points: integratedPoints, forecast: { horizon: 4, p: 0, d: 2, autoTune: false, maxP: 2, maxD: 2 }, summaryKeys: ['Horizon', 'AR order (p)', 'Differencing (d)'] },
      { id: 'line-hw-manual', mode: 'holtWinters', points: seasonalPoints, forecast: { horizon: 4, seasonLength: 4, autoTune: false, level: 0.2, trend: 0.1, seasonal: 0.1 }, summaryKeys: ['Season length', 'Horizon', 'Level α', 'Trend β', 'Season γ', 'Seasonal 1', 'Seasonal 2', 'Seasonal 3', 'Seasonal 4'] },
      { id: 'line-hw-auto', mode: 'holtWinters', points: seasonalPoints, forecast: { horizon: 5, seasonLength: 4, autoTune: true, criterion: 'bic' }, summaryKeys: ['Season length', 'Horizon', 'Level α', 'Trend β', 'Season γ', 'Seasonal 1', 'Seasonal 2', 'Seasonal 3', 'Seasonal 4'] }
    ];

    const cases = specs.map(spec => ({
      id: spec.id,
      operation: regressionOperationForMode(spec.mode).operation,
      payload: { x: spec.points.map(point => point.x), y: spec.points.map(point => point.y), forecast: spec.forecast }
    }));
    const oracle = indexOracleResults(runPythonOracle(cases));

    specs.forEach(spec => {
      const actual = lineHooks.computeLineStats(spec.points, 'pearson', { regressionMode: spec.mode, forecast: spec.forecast });
      const ref = oracle.get(spec.id)?.result;
      expect(actual?.regression?.mode).toBe(spec.mode);
      const metricKeys = spec.mode === 'holtWinters'
        ? ['sse', 'rmse', 'mae', 'mape', 'smape', 'horizon']
        : ['sse', 'rmse', 'mae', 'mape', 'smape', 'aic', 'bic', 'horizon'];
      compareRegressionMetrics(actual.regression?.metrics, ref?.metrics, `${spec.id}.metrics`, { keys: metricKeys, tolerance: { abs: 1e-6, rel: 1e-5 } });
      if (spec.mode === 'holtWinters') {
        expect(actual.regression?.metrics?.aic).toBeNaN();
        expect(actual.regression?.metrics?.bic).toBeNaN();
        expect(actual.regression?.metrics?.selectionCriterion).toBe(ref?.metrics?.selectionCriterion);
        if (spec.forecast.autoTune) {
          expectClose(actual.regression?.metrics?.selectionScore, ref?.metrics?.selectionScore, `${spec.id}.selectionScore`, { abs: 1e-6, rel: 1e-5 });
          expectClose(actual.regression?.metrics?.tuningRmse, ref?.metrics?.tuningRmse, `${spec.id}.tuningRmse`, { abs: 1e-6, rel: 1e-5 });
        }
      }
      compareSummaryParameters(actual.regression, ref?.summary, spec.summaryKeys, spec.id, { abs: 1e-6, rel: 1e-5 });
      expect(actual.regression?.forecast?.points?.length).toBe(ref?.forecast?.points?.length);
      ref.forecast.points.forEach((point, index) => {
        expectClose(actual.regression?.forecast?.points?.[index]?.x, point.x, `${spec.id}.forecast[${index}].x`, { abs: 1e-8, rel: 1e-8 });
        expectClose(actual.regression?.forecast?.points?.[index]?.y, point.y, `${spec.id}.forecast[${index}].y`, { abs: 1e-6, rel: 1e-5 });
        expectClose(actual.regression?.forecast?.points?.[index]?.lower, point.lower, `${spec.id}.forecast[${index}].lower`, { abs: 1e-6, rel: 1e-5 });
        expectClose(actual.regression?.forecast?.points?.[index]?.upper, point.upper, `${spec.id}.forecast[${index}].upper`, { abs: 1e-6, rel: 1e-5 });
        expectClose(actual.regression?.forecast?.points?.[index]?.stdErr, point.stdErr, `${spec.id}.forecast[${index}].stdErr`, { abs: 1e-6, rel: 1e-5 });
        if (spec.mode === 'holtWinters') {
          expectClose(actual.regression?.forecast?.points?.[index]?.seasonal, point.seasonal, `${spec.id}.forecast[${index}].seasonal`, { abs: 1e-6, rel: 1e-5 });
        }
      });
      if (spec.mode === 'holtWinters') {
        expect(actual.regression?.forecast?.seasonLength).toBe(ref?.forecast?.seasonLength);
      }
    });
  });
});
