(function initScatterLowessModel(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.scatterLowessModel = Shared.scatterLowessModel || {};

  function computeMedian(values){
    const data = Array.isArray(values) ? values.filter(Number.isFinite).slice().sort((a, b) => a - b) : [];
    if(!data.length){
      return NaN;
    }
    const mid = Math.floor(data.length / 2);
    return (data.length % 2)
      ? data[mid]
      : ((data[mid - 1] + data[mid]) / 2);
  }

  function fitScatterLowessRegression(inputPoints, options = {}, dependencies = {}){
    const safeOptions = options && typeof options === 'object' ? options : {};
    const fitSpec = safeOptions.fitSpec && typeof safeOptions.fitSpec === 'object' ? safeOptions.fitSpec : {};
    const requestedSpan = Number(
      fitSpec?.span
      ?? fitSpec?.parameters?.span
      ?? fitSpec?.initialValues?.span
      ?? 0.75
    );
    const span = Math.min(0.95, Math.max(0.2, Number.isNaN(requestedSpan) ? 0.75 : requestedSpan));
    const points = (Array.isArray(inputPoints) ? inputPoints : [])
      .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map(point => ({ ...point, x: Number(point.x), y: Number(point.y) }))
      .sort((a, b) => a.x - b.x);
    const n = points.length;
    if(n < 3){
      return null;
    }

    const neighborCount = Math.max(2, Math.ceil(span * n));
    const tricube = value => {
      const t = Math.min(1, Math.abs(value));
      const base = 1 - Math.pow(t, 3);
      return Math.pow(Math.max(0, base), 3);
    };
    const smoothAt = (targetIndex, robustWeights) => {
      const x0 = points[targetIndex].x;
      const distances = points
        .map((point, index) => ({ index, distance: Math.abs(point.x - x0) }))
        .sort((a, b) => a.distance - b.distance);
      const bandwidth = Math.max(1e-9, distances[Math.min(distances.length - 1, neighborCount - 1)].distance || 1e-9);
      let sumWeights = 0;
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumXY = 0;
      points.forEach((point, index) => {
        const distanceWeight = tricube((point.x - x0) / bandwidth);
        const weight = distanceWeight * (robustWeights ? robustWeights[index] : 1);
        sumWeights += weight;
        sumX += weight * point.x;
        sumY += weight * point.y;
        sumXX += weight * point.x * point.x;
        sumXY += weight * point.x * point.y;
      });
      const determinant = (sumWeights * sumXX) - (sumX * sumX);
      if(!(Math.abs(determinant) > 1e-18)){
        return points[targetIndex].y;
      }
      const intercept = ((sumY * sumXX) - (sumX * sumXY)) / determinant;
      const slope = ((sumWeights * sumXY) - (sumX * sumY)) / determinant;
      return intercept + (slope * x0);
    };

    let robustWeights = new Array(n).fill(1);
    let smoothed = points.map((_, index) => smoothAt(index, robustWeights));
    for(let iteration = 0; iteration < 2; iteration += 1){
      const residuals = points.map((point, index) => point.y - smoothed[index]);
      const medianAbsoluteResidual = computeMedian(residuals.map(value => Math.abs(value))) || 1e-9;
      robustWeights = residuals.map(value => {
        const ratio = Math.abs(value) / (6 * medianAbsoluteResidual);
        if(ratio >= 1){
          return 0;
        }
        const base = 1 - (ratio * ratio);
        return base * base;
      });
      smoothed = points.map((_, index) => smoothAt(index, robustWeights));
    }

    const curveSamples = points.map((point, index) => ({ x: point.x, y: smoothed[index] }));
    const predict = xValue => {
      const x = Number(xValue);
      if(!Number.isFinite(x) || !curveSamples.length){
        return NaN;
      }
      if(x <= curveSamples[0].x){
        return curveSamples[0].y;
      }
      if(x >= curveSamples[curveSamples.length - 1].x){
        return curveSamples[curveSamples.length - 1].y;
      }
      for(let index = 1; index < curveSamples.length; index += 1){
        const previous = curveSamples[index - 1];
        const next = curveSamples[index];
        if(x <= next.x){
          const xSpan = next.x - previous.x || 1;
          const fraction = (x - previous.x) / xSpan;
          return previous.y + (fraction * (next.y - previous.y));
        }
      }
      return NaN;
    };

    const residuals = points.map((point, index) => point.y - smoothed[index]);
    const sse = residuals.reduce((sum, value) => sum + (value * value), 0);
    const yMean = points.reduce((sum, point) => sum + point.y, 0) / n;
    const tss = points.reduce((sum, point) => sum + Math.pow(point.y - yMean, 2), 0);
    const parameterCount = Math.max(2, Math.round(span * n));
    const spanLabel = typeof safeOptions.formatSpanLabel === 'function'
      ? safeOptions.formatSpanLabel(span)
      : span.toFixed(3);
    const computeInformationCriteria = dependencies && dependencies.computeInformationCriteria;
    const informationCriteria = typeof computeInformationCriteria === 'function'
      ? computeInformationCriteria(sse, n, parameterCount)
      : { aic: NaN, aicc: NaN, bic: NaN };

    return {
      mode: 'lowess',
      fitMethod: 'ols',
      fitSpec,
      domain: {
        minX: points[0].x,
        maxX: points[points.length - 1].x
      },
      predict,
      summary: {
        parameters: { Span: span },
        equation: `LOWESS smoother (span = ${spanLabel})`
      },
      metrics: {
        sampleSize: n,
        parameterCount,
        residualDf: Math.max(1, n - parameterCount),
        sse,
        r2: tss > 0 ? (1 - (sse / tss)) : NaN,
        adjR2: NaN,
        rmse: Math.sqrt(sse / n),
        mae: residuals.reduce((sum, value) => sum + Math.abs(value), 0) / n,
        ...informationCriteria
      },
      residuals: {
        mean: residuals.reduce((sum, value) => sum + value, 0) / n,
        sd: Math.sqrt(sse / Math.max(1, n - parameterCount)),
        min: Math.min(...residuals),
        max: Math.max(...residuals)
      },
      warnings: ['LOWESS is intended for descriptive smoothing. Use mechanistic regression for parameter inference.'],
      curveSamples,
      intervals: { samples: [], summary: {} }
    };
  }

  namespace.fitScatterLowessRegression = fitScatterLowessRegression;
  if(typeof module !== 'undefined' && module.exports){
    module.exports = namespace;
  }
})(typeof window !== 'undefined' ? window : globalThis);
