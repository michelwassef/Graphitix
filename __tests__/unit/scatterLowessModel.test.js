'use strict';

const { fitScatterLowessRegression } = require('../../js/shared/scatterLowessModel.js');

describe('Scatter LOWESS model', () => {
  test('filters invalid pairs, sorts finite points, leaves input unchanged, and returns null for short input', () => {
    const points = [
      { x: 3, y: 30 },
      { x: 1, y: 10 },
      { x: NaN, y: 15 },
      { x: 2, y: 20 },
      { x: 4, y: Infinity }
    ];
    const original = points.map(point => ({ ...point }));

    const result = fitScatterLowessRegression(points);

    expect(result.metrics.sampleSize).toBe(3);
    expect(Number.isFinite(result.metrics.sse)).toBe(true);
    expect(Number.isFinite(result.metrics.r2)).toBe(true);
    expect(Number.isFinite(result.metrics.rmse)).toBe(true);
    expect(Number.isFinite(result.metrics.mae)).toBe(true);
    expect(result.domain).toEqual({ minX: 1, maxX: 3 });
    expect(result.curveSamples.map(point => point.x)).toEqual([1, 2, 3]);
    expect(points).toEqual(original);
    expect(fitScatterLowessRegression(points.slice(0, 2))).toBeNull();
  });

  test('clamps finite and infinite spans and defaults an unparseable span to 0.75', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 2, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 8 }
    ];

    expect(fitScatterLowessRegression(points, { fitSpec: { span: -1 } }).summary.parameters.Span).toBe(0.2);
    expect(fitScatterLowessRegression(points, { fitSpec: { span: -Infinity } }).summary.parameters.Span).toBe(0.2);
    expect(fitScatterLowessRegression(points, { fitSpec: { span: 2 } }).summary.parameters.Span).toBe(0.95);
    expect(fitScatterLowessRegression(points, { fitSpec: { span: Infinity } }).summary.parameters.Span).toBe(0.95);
    expect(fitScatterLowessRegression(points, { fitSpec: { span: 'invalid' } }).summary.parameters.Span).toBe(0.75);
  });

  test('delegates information criteria and keeps prediction and label formatting in the model result', () => {
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 }
    ];
    const computeInformationCriteria = jest.fn(() => ({ aic: 1, aicc: 2, bic: 3 }));
    const result = fitScatterLowessRegression(points, {
      fitSpec: { span: 0.75 },
      formatSpanLabel: span => `${Math.round(span * 100)}%`
    }, { computeInformationCriteria });

    expect(computeInformationCriteria).toHaveBeenCalledWith(result.metrics.sse, 4, 3);
    expect(result.metrics).toEqual(expect.objectContaining({ aic: 1, aicc: 2, bic: 3 }));
    expect(result.summary.equation).toBe('LOWESS smoother (span = 75%)');
    expect(result.predict(0)).toBeCloseTo(1, 10);
    expect(result.predict(3)).toBeCloseTo(7, 10);
    expect(result.predict(1.5)).toBeCloseTo(4, 10);
  });
});
