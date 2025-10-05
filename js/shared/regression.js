(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const regressionTools = Shared.regressionTools = Shared.regressionTools || {};
  const jStatLib = global.jStat;
  const debugNs = 'shared-regression';

  const ensureFiniteNumber = (value) => (Number.isFinite(value) ? value : NaN);
  regressionTools.ensureFiniteNumber = ensureFiniteNumber;

  const hasMatrixOps = !!(jStatLib && typeof jStatLib.transpose === 'function' && typeof jStatLib.multiply === 'function');

  const safeTranspose = (matrix) => {
    if(!hasMatrixOps){
      console.debug('Debug:', debugNs, 'transpose unavailable; returning null');
      return null;
    }
    try{
      return jStatLib.transpose(matrix);
    }catch(err){
      console.warn('transpose failed in regression calculations', err);
      return null;
    }
  };

  const safeMultiply = (a, b) => {
    if(!hasMatrixOps){
      console.debug('Debug:', debugNs, 'multiply unavailable; returning null');
      return null;
    }
    try{
      return jStatLib.multiply(a, b);
    }catch(err){
      console.warn('multiply failed in regression calculations', err);
      return null;
    }
  };

  const safeInverse = (matrix) => {
    if(!hasMatrixOps){
      return null;
    }
    let invResult = null;
    try{
      if(typeof jStatLib.inv === 'function'){
        invResult = jStatLib.inv(matrix);
      }
    }catch(err){
      console.warn('inv failed in regression calculations', err);
      invResult = null;
    }
    if(!invResult){
      try{
        if(typeof jStatLib.pinv === 'function'){
          invResult = jStatLib.pinv(matrix);
        }
      }catch(err){
        console.warn('pinv failed in regression calculations', err);
        invResult = null;
      }
    }
    return invResult;
  };

  const summarizeResiduals = (residuals) => {
    if(!Array.isArray(residuals) || residuals.length === 0){
      return { mean: NaN, sd: NaN, min: NaN, max: NaN };
    }
    const mean = residuals.reduce((sum,val)=>sum+val,0)/residuals.length;
    const variance = residuals.length > 1
      ? residuals.reduce((sum,val)=>sum+Math.pow(val-mean,2),0)/(residuals.length-1)
      : 0;
    return {
      mean,
      sd: residuals.length > 1 ? Math.sqrt(Math.max(variance, 0)) : 0,
      min: Math.min(...residuals),
      max: Math.max(...residuals)
    };
  };

  const computeResidualDiagnostics = (residuals) => {
    if(!Array.isArray(residuals) || residuals.length < 3){
      return {
        skewness: NaN,
        kurtosis: NaN,
        jarqueBera: NaN,
        jarqueBeraP: NaN
      };
    }
    const n = residuals.length;
    const mean = residuals.reduce((sum,val)=>sum+val,0)/n;
    const centered = residuals.map(val => val - mean);
    const variance = centered.reduce((sum,val)=>sum+val*val,0)/(n-1);
    const sd = Math.sqrt(Math.max(variance, 0));
    if(sd === 0){
      return {
        skewness: 0,
        kurtosis: 3,
        jarqueBera: 0,
        jarqueBeraP: 1
      };
    }
    const skewness = centered.reduce((sum,val)=>sum+Math.pow(val/sd,3),0)/n;
    const kurtosis = centered.reduce((sum,val)=>sum+Math.pow(val/sd,4),0)/n;
    const jarqueBera = (n/6) * (Math.pow(skewness,2) + Math.pow(kurtosis-3,2)/4);
    const jbP = jStatLib?.chisquare && typeof jStatLib.chisquare.cdf === 'function'
      ? 1 - jStatLib.chisquare.cdf(jarqueBera,2)
      : NaN;
    const diagnostics = { skewness, kurtosis, jarqueBera, jarqueBeraP: jbP };
    console.debug('Debug:', debugNs, 'residual diagnostics', diagnostics);
    return diagnostics;
  };

  const clampPositiveInt = (value, { min = 1, max = 120, fallback = 1 } = {}) => {
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return fallback;
    }
    const rounded = Math.round(numeric);
    const bounded = Math.max(min, Math.min(max, rounded));
    console.debug('Debug:', debugNs, 'clampPositiveInt', { value, numeric, rounded, bounded, min, max, fallback });
    return bounded;
  };

  const differenceSeries = (values, order = 0) => {
    let current = Array.isArray(values) ? values.slice() : [];
    const history = [];
    const stages = [];
    for(let d = 0; d < order; d++){
      if(current.length < 2){
        return { series: current.slice(), order: d, history, stages };
      }
      const next = [];
      for(let i = 1; i < current.length; i++){
        next.push(current[i] - current[i - 1]);
      }
      history.push(current[0]);
      stages.push(current.slice());
      current = next;
    }
    stages.push(current.slice());
    console.debug('Debug:', debugNs, 'differenceSeries', { requestedOrder: order, appliedOrder: stages.length - 1, length: current.length });
    return { series: current.slice(), order: stages.length - 1, history, stages };
  };

  const restoreDifferences = (baseValues, diffPredictions, order) => {
    if(!Number.isInteger(order) || order <= 0){
      return diffPredictions.slice();
    }
    const restored = [];
    const history = Array.isArray(baseValues) ? baseValues.slice() : [];
    diffPredictions.forEach((diffVal, idx) => {
      let value = diffVal;
      for(let d = order - 1; d >= 0; d--){
        const reference = history[history.length - 1] ?? 0;
        value = reference + value;
        history.push(value);
      }
      restored[idx] = value;
    });
    console.debug('Debug:', debugNs, 'restoreDifferences', { order, baseSeedCount: baseValues.length, restoredCount: restored.length });
    return restored;
  };

  const computeForecastVariance = (phiCoefficients, horizon, sigmaSq) => {
    if(!Array.isArray(phiCoefficients) || phiCoefficients.length === 0){
      const variances = [];
      for(let h = 1; h <= horizon; h++){
        variances.push(sigmaSq * h);
      }
      return variances;
    }
    const p = phiCoefficients.length;
    const psi = [1];
    for(let k = 1; k <= horizon; k++){
      let value = 0;
      for(let i = 1; i <= Math.min(k, p); i++){
        value += phiCoefficients[i - 1] * (psi[k - i] ?? 0);
      }
      psi[k] = value;
    }
    const variances = [];
    for(let h = 1; h <= horizon; h++){
      let sumSq = 0;
      for(let i = 0; i < h; i++){
        const psiVal = psi[i] ?? 0;
        sumSq += psiVal * psiVal;
      }
      variances.push(Math.max(0, sigmaSq * (1 + sumSq)));
    }
    console.debug('Debug:', debugNs, 'computeForecastVariance', { horizon, sigmaSq, variances });
    return variances;
  };

  const computeMeanAbsolutePercentageError = (actual, predicted) => {
    if(!Array.isArray(actual) || !Array.isArray(predicted) || !actual.length){
      return NaN;
    }
    let total = 0;
    let count = 0;
    for(let i = 0; i < actual.length; i++){
      const a = actual[i];
      const p = predicted[i];
      if(Number.isFinite(a) && Number.isFinite(p) && a !== 0){
        total += Math.abs((a - p) / a);
        count++;
      }
    }
    return count ? total / count : NaN;
  };

  const computeSymmetricMAPE = (actual, predicted) => {
    if(!Array.isArray(actual) || !Array.isArray(predicted) || !actual.length){
      return NaN;
    }
    let total = 0;
    let count = 0;
    for(let i = 0; i < actual.length; i++){
      const a = actual[i];
      const p = predicted[i];
      if(Number.isFinite(a) && Number.isFinite(p)){
        const denom = Math.abs(a) + Math.abs(p);
        if(denom === 0) continue;
        total += (2 * Math.abs(a - p)) / denom;
        count++;
      }
    }
    return count ? total / count : NaN;
  };

  const computeAverageSpacing = (values) => {
    if(!Array.isArray(values) || values.length < 2){
      return NaN;
    }
    let total = 0;
    let count = 0;
    for(let i = 1; i < values.length; i++){
      const delta = values[i] - values[i - 1];
      if(Number.isFinite(delta)){
        total += delta;
        count++;
      }
    }
    return count ? total / count : NaN;
  };

  const linearInterpolateSamples = (samples, x) => {
    if(!Array.isArray(samples) || samples.length === 0){
      return NaN;
    }
    const sorted = samples.slice().sort((a,b)=> (a?.x ?? 0) - (b?.x ?? 0));
    if(x <= sorted[0].x){
      return sorted[0].y;
    }
    if(x >= sorted[sorted.length - 1].x){
      return sorted[sorted.length - 1].y;
    }
    for(let i = 1; i < sorted.length; i++){
      const prev = sorted[i - 1];
      const next = sorted[i];
      if(x >= prev.x && x <= next.x){
        const span = next.x - prev.x;
        if(span === 0){ return prev.y; }
        const ratio = (x - prev.x) / span;
        return prev.y + ratio * (next.y - prev.y);
      }
    }
    return NaN;
  };

  const buildCoefficientStats = ({ coefficients, xtxInv, residuals, alpha, termLabels, degreesOfFreedom }) => {
    if(!coefficients || !xtxInv || !residuals){
      return [];
    }
    const coeffCount = coefficients.length;
    const variance = residuals.length > coeffCount
      ? residuals.reduce((sum,val)=>sum+val*val,0) / Math.max(residuals.length - coeffCount, 1)
      : NaN;
    if(!Number.isFinite(variance)){
      return [];
    }
    const se = coefficients.map((_, idx) => {
      const diag = xtxInv?.[idx]?.[idx];
      return Number.isFinite(diag) && diag >= 0 ? Math.sqrt(diag * variance) : NaN;
    });
    const tDist = jStatLib?.studentt;
    const alphaHalf = alpha/2;
    const tCritical = (tDist && typeof tDist.inv === 'function' && degreesOfFreedom > 0)
      ? tDist.inv(1 - alphaHalf, degreesOfFreedom)
      : NaN;
    const stats = coefficients.map((estimate, idx) => {
      const standardError = se[idx];
      const tStatistic = Number.isFinite(standardError) && standardError !== 0
        ? estimate / standardError
        : NaN;
      const pValue = (tDist && typeof tDist.cdf === 'function' && Number.isFinite(tStatistic) && degreesOfFreedom > 0)
        ? 2 * (1 - tDist.cdf(Math.abs(tStatistic), degreesOfFreedom))
        : NaN;
      const ciHalfWidth = Number.isFinite(tCritical) && Number.isFinite(standardError)
        ? tCritical * standardError
        : NaN;
      const ciLow = Number.isFinite(ciHalfWidth) ? estimate - ciHalfWidth : NaN;
      const ciHigh = Number.isFinite(ciHalfWidth) ? estimate + ciHalfWidth : NaN;
      const term = termLabels?.[idx] || `β${idx}`;
      const entry = { term, estimate, standardError, tStatistic, pValue, ciLow, ciHigh };
      console.debug('Debug:', debugNs, 'coefficient stats', entry);
      return entry;
    });
    return stats;
  };

  const buildIntervalSamples = ({
    xtxInv,
    coefficients,
    residuals,
    domain,
    alpha,
    basisBuilder,
    transform,
    sampleCount = 120
  }) => {
    if(!xtxInv || !coefficients || !residuals || !domain){
      return { samples: [], summary: null, degreesOfFreedom: NaN, tCritical: NaN };
    }
    const dof = residuals.length - coefficients.length;
    if(dof <= 0){
      return { samples: [], summary: null, degreesOfFreedom: dof, tCritical: NaN };
    }
    const tDist = jStatLib?.studentt;
    const tCritical = (tDist && typeof tDist.inv === 'function')
      ? tDist.inv(1 - alpha/2, dof)
      : NaN;
    const sumSquares = residuals.reduce((sum,val)=>sum+val*val,0);
    const sigmaSq = sumSquares / Math.max(dof, 1);
    if(!Number.isFinite(sigmaSq) || !Number.isFinite(tCritical)){
      return { samples: [], summary: null, degreesOfFreedom: dof, tCritical };
    }
    const minX = Number.isFinite(domain.minX) ? domain.minX : null;
    const maxX = Number.isFinite(domain.maxX) ? domain.maxX : null;
    if(minX === null || maxX === null || minX === maxX){
      return { samples: [], summary: null, degreesOfFreedom: dof, tCritical };
    }
    const step = (maxX - minX) / (sampleCount - 1);
    const samples = [];
    let ciMin = Infinity, ciMax = -Infinity, piMin = Infinity, piMax = -Infinity;
    for(let i=0;i<sampleCount;i++){
      const x = i === sampleCount - 1 ? maxX : (minX + step * i);
      const basis = basisBuilder ? basisBuilder(x) : coefficients.map((_, idx) => Math.pow(x, idx));
      const linearEstimate = basis.reduce((sum, coeff, idx) => sum + coeff * coefficients[idx], 0);
      const xtxVec = basis.map((_, rowIdx) => {
        return xtxInv[rowIdx]?.reduce((sum,val,colIdx)=>sum + (val * basis[colIdx]),0);
      });
      const varHat = xtxVec.reduce((sum,val,idx)=>sum + (basis[idx] * val),0);
      const stdErr = Number.isFinite(varHat) && varHat >= 0 ? Math.sqrt(sigmaSq * varHat) : NaN;
      const ciHalf = Number.isFinite(stdErr) ? tCritical * stdErr : NaN;
      const predStdErr = Number.isFinite(stdErr) ? Math.sqrt(stdErr*stdErr + sigmaSq) : NaN;
      let ciLow = Number.isFinite(ciHalf) ? linearEstimate - ciHalf : NaN;
      let ciHigh = Number.isFinite(ciHalf) ? linearEstimate + ciHalf : NaN;
      let piLow = Number.isFinite(predStdErr) ? linearEstimate - tCritical * predStdErr : NaN;
      let piHigh = Number.isFinite(predStdErr) ? linearEstimate + tCritical * predStdErr : NaN;
      let y = linearEstimate;
      if(transform && typeof transform === 'object'){
        if(typeof transform.toOutput === 'function'){
          y = transform.toOutput({ mean: linearEstimate, x });
        }
        if(typeof transform.intervalToOutput === 'function'){
          const converted = transform.intervalToOutput({
            mean: linearEstimate,
            ciLow,
            ciHigh,
            piLow,
            piHigh,
            x
          });
          if(converted){
            y = Number.isFinite(converted.mean) ? converted.mean : y;
            ciLow = Number.isFinite(converted.ciLow) ? converted.ciLow : ciLow;
            ciHigh = Number.isFinite(converted.ciHigh) ? converted.ciHigh : ciHigh;
            piLow = Number.isFinite(converted.piLow) ? converted.piLow : piLow;
            piHigh = Number.isFinite(converted.piHigh) ? converted.piHigh : piHigh;
          }
        }
      }
      if(Number.isFinite(ciLow) && ciLow < ciMin) ciMin = ciLow;
      if(Number.isFinite(ciHigh) && ciHigh > ciMax) ciMax = ciHigh;
      if(Number.isFinite(piLow) && piLow < piMin) piMin = piLow;
      if(Number.isFinite(piHigh) && piHigh > piMax) piMax = piHigh;
      samples.push({ x, y, ciLow, ciHigh, piLow, piHigh });
    }
    const summary = {
      ciMin: Number.isFinite(ciMin) ? ciMin : NaN,
      ciMax: Number.isFinite(ciMax) ? ciMax : NaN,
      piMin: Number.isFinite(piMin) ? piMin : NaN,
      piMax: Number.isFinite(piMax) ? piMax : NaN
    };
    console.debug('Debug:', debugNs, 'interval samples generated', {
      sampleCount: samples.length,
      summary
    });
    return { samples, summary, degreesOfFreedom: dof, tCritical };
  };

  const evaluatePolynomial = (coeffs, x) => coeffs.reduce((sum, coeff, idx) => sum + coeff * Math.pow(x, idx), 0);

  const solveLeastSquares = (design, yVector) => {
    if(!hasMatrixOps){
      return { coefficients: null, xtxInv: null };
    }
    const designT = safeTranspose(design);
    if(!designT){
      return { coefficients: null, xtxInv: null };
    }
    const xtx = safeMultiply(designT, design);
    if(!xtx){
      return { coefficients: null, xtxInv: null };
    }
    const xtxInv = safeInverse(xtx);
    if(!xtxInv){
      return { coefficients: null, xtxInv: null };
    }
    const xty = safeMultiply(designT, yVector);
    if(!xty){
      return { coefficients: null, xtxInv: null };
    }
    const betaMatrix = safeMultiply(xtxInv, xty);
    if(!betaMatrix){
      return { coefficients: null, xtxInv: null };
    }
    const coefficients = betaMatrix.map(row => row[0]);
    return { coefficients, xtxInv };
  };

  const computeLinearModel = ({ points, xVals, yVals, sst, alpha, domain }) => {
    let xtxInv = null;
    let beta = null;
    if(hasMatrixOps){
      const design = points.map(pt => [1, pt.x]);
      const yMatrix = yVals.map(val => [val]);
      const solved = solveLeastSquares(design, yMatrix);
      xtxInv = solved.xtxInv;
      beta = solved.coefficients;
      if(!beta){
        console.warn('Linear regression matrix inversion failed; falling back to analytic estimates');
      }
    }else{
      console.debug('Debug:', debugNs, 'matrix operations unavailable; using analytic fallback');
    }
    const fallbackSlopeIntercept = () => {
      const xMean = jStatLib.mean(xVals);
      const yMean = jStatLib.mean(yVals);
      const numerator = xVals.reduce((sum, xv, idx) => sum + (xv - xMean) * (yVals[idx] - yMean), 0);
      const denominator = xVals.reduce((sum, xv) => sum + Math.pow(xv - xMean, 2), 0);
      const slopeVal = denominator === 0 ? 0 : numerator / denominator;
      const interceptVal = yMean - slopeVal * xMean;
      return { slopeVal, interceptVal };
    };
    let resolvedCoefficients;
    if(beta){
      resolvedCoefficients = beta;
    }else{
      const fallback = fallbackSlopeIntercept();
      resolvedCoefficients = [fallback.interceptVal, fallback.slopeVal];
    }
    const slope = resolvedCoefficients[1];
    const intercept = resolvedCoefficients[0];
    const predictions = xVals.map(x => intercept + slope * x);
    const residuals = predictions.map((pred, idx) => yVals[idx] - pred);
    const sse = residuals.reduce((sum,val)=>sum+val*val,0);
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const diagnostics = computeResidualDiagnostics(residuals);
    const coefficientStats = xtxInv
      ? buildCoefficientStats({
          coefficients: resolvedCoefficients,
          xtxInv,
          residuals,
          alpha,
          termLabels: ['Intercept','Slope'],
          degreesOfFreedom: points.length - resolvedCoefficients.length
        })
      : [];
    const intervalInfo = xtxInv
      ? buildIntervalSamples({
          xtxInv,
          coefficients: resolvedCoefficients,
          residuals,
          domain,
          alpha,
          sampleCount: 120
        })
      : { samples: [], summary: null, degreesOfFreedom: NaN, tCritical: NaN };
    const summary = {
      intercept,
      slope,
      equation: `y = ${intercept.toFixed(4)} + ${slope.toFixed(4)}x`,
      parameters: {
        Intercept: intercept,
        Slope: slope
      },
      primaryParameter: {
        label: 'Slope',
        value: slope
      }
    };
    return {
      coefficients: resolvedCoefficients,
      metrics: {
        sampleSize: points.length,
        predictors: 1,
        sse,
        sst,
        r2,
        adjR2: points.length > 2 ? 1 - (1 - r2) * ((points.length - 1) / (points.length - 2)) : r2,
        rmse: Math.sqrt(sse / points.length),
        mae: residuals.reduce((sum,val)=>sum+Math.abs(val),0)/points.length
      },
      residuals: summarizeResiduals(residuals),
      predictions,
      diagnostics,
      coefficientStats,
      intervals: intervalInfo.summary ? {
        alpha,
        tCritical: intervalInfo.tCritical,
        degreesOfFreedom: intervalInfo.degreesOfFreedom,
        samples: intervalInfo.samples,
        summary: intervalInfo.summary
      } : null,
      summary
    };
  };

  const computePolynomialModel = ({ points, degree, alpha, domain, xVals, yVals, sst }) => {
    if(!hasMatrixOps){
      console.warn('Polynomial regression requires matrix operations that are unavailable');
      return null;
    }
    try{
      const design = points.map(pt => {
        const row = [];
        for(let power = 0; power <= degree; power++){
          row.push(Math.pow(pt.x, power));
        }
        return row;
      });
      const yMatrix = yVals.map(val => [val]);
      const solved = solveLeastSquares(design, yMatrix);
      if(!solved.coefficients || !solved.xtxInv){
        return null;
      }
      const coefficients = solved.coefficients;
      const predictions = xVals.map(x => evaluatePolynomial(coefficients, x));
      const residuals = predictions.map((pred, idx) => yVals[idx] - pred);
      const sse = residuals.reduce((sum,val)=>sum+val*val,0);
      const r2 = sst === 0 ? 1 : 1 - (sse / sst);
      const diagnostics = computeResidualDiagnostics(residuals);
      const termLabels = coefficients.map((_, idx) => idx === 0 ? 'Intercept' : `x^${idx}`);
      const coefficientStats = buildCoefficientStats({
        coefficients,
        xtxInv: solved.xtxInv,
        residuals,
        alpha,
        termLabels,
        degreesOfFreedom: points.length - coefficients.length
      });
      const intervalInfo = buildIntervalSamples({
        xtxInv: solved.xtxInv,
        coefficients,
        residuals,
        domain,
        alpha,
        sampleCount: 160
      });
      const summary = {
        intercept: coefficients[0],
        slope: coefficients[1],
        equation: coefficients.map((coeff, idx) => `${coeff.toFixed(4)}${idx === 0 ? '' : `x^${idx}`} `).join('+ ').replace(/\s\+/g,' + '),
        parameters: coefficients.reduce((acc, coeff, idx) => {
          const label = idx === 0 ? 'Intercept' : `Coefficient x^${idx}`;
          acc[label] = coeff;
          return acc;
        }, {}),
        primaryParameter: {
          label: degree === 2 ? 'Quadratic coefficient' : 'Cubic coefficient',
          value: coefficients.length > degree ? coefficients[degree] : coefficients[coefficients.length - 1]
        }
      };
      if(!Number.isFinite(summary.primaryParameter.value)){
        summary.primaryParameter = {
          label: 'Slope',
          value: coefficients[1]
        };
      }
      return {
        coefficients,
        metrics: {
          sampleSize: points.length,
          predictors: degree,
          sse,
          sst,
          r2,
          adjR2: points.length > (degree + 1) ? 1 - (1 - r2) * ((points.length - 1) / (points.length - degree - 1)) : r2,
          rmse: Math.sqrt(sse / points.length),
          mae: residuals.reduce((sum,val)=>sum+Math.abs(val),0)/points.length
        },
        residuals: summarizeResiduals(residuals),
        predictions,
        diagnostics,
        coefficientStats,
        intervals: intervalInfo.summary ? {
          alpha,
          tCritical: intervalInfo.tCritical,
          degreesOfFreedom: intervalInfo.degreesOfFreedom,
          samples: intervalInfo.samples,
          summary: intervalInfo.summary
        } : null,
        summary
      };
    }catch(err){
      console.error('Polynomial regression failure', err);
      return null;
    }
  };

  const computeLogisticModel = ({ points, alpha, domain }) => {
    const warnings = [];
    const logisticPoints = points.map(pt => {
      let yVal = pt.y;
      if(yVal < 0 || yVal > 1){
        warnings.push('Logistic regression expects Y values between 0 and 1; values were clamped.');
        yVal = Math.min(1, Math.max(0, yVal));
      }
      return { x: pt.x, y: yVal };
    });
    const allSame = logisticPoints.every(pt => pt.y === logisticPoints[0].y);
    if(allSame){
      warnings.push('Logistic regression skipped due to constant response.');
      return {
        coefficients: [0, 0],
        metrics: { sampleSize: points.length, sse: NaN, sst: NaN, r2: NaN, adjR2: NaN, rmse: NaN, mae: NaN, logLoss: NaN },
        residuals: { mean: NaN, sd: NaN, min: NaN, max: NaN },
        warnings
      };
    }
    let beta0 = 0;
    let beta1 = 0;
    const learningRate = 0.01;
    const tolerance = 1e-6;
    const maxIterations = 1000;
    let iteration = 0;
    for(; iteration < maxIterations; iteration++){
      let grad0 = 0;
      let grad1 = 0;
      logisticPoints.forEach(pt => {
        const z = beta0 + beta1 * pt.x;
        const pred = 1 / (1 + Math.exp(-z));
        const error = pred - pt.y;
        grad0 += error;
        grad1 += error * pt.x;
      });
      grad0 /= logisticPoints.length;
      grad1 /= logisticPoints.length;
      const delta0 = learningRate * grad0;
      const delta1 = learningRate * grad1;
      beta0 -= delta0;
      beta1 -= delta1;
      if(Math.abs(delta0) < tolerance && Math.abs(delta1) < tolerance){
        break;
      }
    }
    const predict = (x) => 1 / (1 + Math.exp(-(beta0 + beta1 * x)));
    const predictions = logisticPoints.map(pt => predict(pt.x));
    const residuals = predictions.map((pred, idx) => logisticPoints[idx].y - pred);
    const sse = residuals.reduce((sum,val)=>sum+val*val,0);
    const rmse = Math.sqrt(sse / logisticPoints.length);
    const mae = residuals.reduce((sum,val)=>sum+Math.abs(val),0)/logisticPoints.length;
    const eps = 1e-9;
    const logLoss = logisticPoints.reduce((sum, pt, idx) => {
      const pred = Math.min(1 - eps, Math.max(eps, predictions[idx]));
      return sum - (pt.y * Math.log(pred) + (1 - pt.y) * Math.log(1 - pred));
    }, 0) / logisticPoints.length;
    const meanY = logisticPoints.reduce((sum, pt) => sum + pt.y, 0) / logisticPoints.length;
    const nullLoss = - (meanY * Math.log(Math.min(1 - eps, Math.max(eps, meanY))) + (1 - meanY) * Math.log(Math.min(1 - eps, Math.max(eps, 1 - meanY))));
    const pseudoR2 = Number.isFinite(nullLoss) && nullLoss > 0 ? 1 - (logLoss / nullLoss) : NaN;
    const diagnostics = computeResidualDiagnostics(residuals);
    const design = logisticPoints.map(pt => [1, pt.x]);
    let xtwxInv;
    if(hasMatrixOps){
      const designT = safeTranspose(design);
      if(designT){
        const weights = predictions.map(p => p * (1 - p));
        const weightedDesign = design.map((row, idx) => row.map(val => val * weights[idx]));
        const xtwx = safeMultiply(designT, weightedDesign);
        if(xtwx){
          xtwxInv = safeInverse(xtwx);
        }
      }
    }else{
      console.debug('Debug:', debugNs, 'logistic matrix operations unavailable; skipping coefficient variance');
    }
    let coefficientStats = [];
    if(xtwxInv){
      coefficientStats = buildCoefficientStats({
        coefficients: [beta0, beta1],
        xtxInv: xtwxInv,
        residuals,
        alpha,
        termLabels: ['Intercept','Slope'],
        degreesOfFreedom: logisticPoints.length - 2
      });
    }
    let intervalSummary = null;
    let intervalSamples = [];
    let zCritical = NaN;
    if(xtwxInv){
      const normal = jStatLib?.normal;
      zCritical = (normal && typeof normal.inv === 'function') ? normal.inv(1 - alpha/2, 0, 1) : NaN;
      const minX = Number.isFinite(domain?.minX) ? domain.minX : Math.min(...logisticPoints.map(pt => pt.x));
      const maxX = Number.isFinite(domain?.maxX) ? domain.maxX : Math.max(...logisticPoints.map(pt => pt.x));
      if(Number.isFinite(zCritical) && Number.isFinite(minX) && Number.isFinite(maxX) && minX !== maxX){
        const sampleCount = 160;
        const step = (maxX - minX) / (sampleCount - 1);
        let ciMin = Infinity, ciMax = -Infinity, piMin = Infinity, piMax = -Infinity;
        for(let i=0;i<sampleCount;i++){
          const xVal = i === sampleCount - 1 ? maxX : (minX + step * i);
          const eta = beta0 + beta1 * xVal;
          const pHat = 1 / (1 + Math.exp(-eta));
          const basis = [1, xVal];
          const xtwxVec = xtwxInv.map(row => row.reduce((sum,val,colIdx)=>sum + val * basis[colIdx],0));
          const varEta = xtwxVec.reduce((sum,val,idx)=>sum + (basis[idx] * val),0);
          const seEta = Number.isFinite(varEta) && varEta >= 0 ? Math.sqrt(varEta) : NaN;
          const ciHalf = Number.isFinite(seEta) ? zCritical * seEta * pHat * (1 - pHat) : NaN;
          const predHalf = Number.isFinite(pHat) ? zCritical * Math.sqrt(Math.max(pHat * (1 - pHat), 0)) : NaN;
          const ciLow = Number.isFinite(ciHalf) ? Math.max(0, Math.min(1, pHat - ciHalf)) : NaN;
          const ciHigh = Number.isFinite(ciHalf) ? Math.max(0, Math.min(1, pHat + ciHalf)) : NaN;
          const piLow = Number.isFinite(predHalf) ? Math.max(0, Math.min(1, pHat - predHalf)) : NaN;
          const piHigh = Number.isFinite(predHalf) ? Math.max(0, Math.min(1, pHat + predHalf)) : NaN;
          if(Number.isFinite(ciLow) && ciLow < ciMin) ciMin = ciLow;
          if(Number.isFinite(ciHigh) && ciHigh > ciMax) ciMax = ciHigh;
          if(Number.isFinite(piLow) && piLow < piMin) piMin = piLow;
          if(Number.isFinite(piHigh) && piHigh > piMax) piMax = piHigh;
          intervalSamples.push({ x: xVal, y: pHat, ciLow, ciHigh, piLow, piHigh });
        }
        intervalSummary = {
          ciMin: Number.isFinite(ciMin) ? ciMin : NaN,
          ciMax: Number.isFinite(ciMax) ? ciMax : NaN,
          piMin: Number.isFinite(piMin) ? piMin : NaN,
          piMax: Number.isFinite(piMax) ? piMax : NaN
        };
        console.debug('Debug:', debugNs, 'logistic interval samples generated', {
          sampleCount: intervalSamples.length,
          zCritical
        });
      }
    }
    return {
      coefficients: [beta0, beta1],
      metrics: {
        sampleSize: logisticPoints.length,
        predictors: 1,
        sse,
        sst: NaN,
        r2: pseudoR2,
        adjR2: pseudoR2,
        rmse,
        mae,
        logLoss,
        iterations: iteration + 1
      },
      residuals: summarizeResiduals(residuals),
      predictions,
      predict,
      diagnostics,
      coefficientStats,
      intervals: intervalSummary ? {
        alpha,
        zCritical,
        samples: intervalSamples,
        summary: intervalSummary
      } : null,
      summary: {
        intercept: beta0,
        slope: beta1,
        equation: `p(x) = 1 / (1 + e^{-(${beta0.toFixed(4)} + ${beta1.toFixed(4)}x)})`,
        parameters: {
          Intercept: beta0,
          Slope: beta1
        },
        primaryParameter: {
          label: 'Slope',
          value: beta1
        }
      },
      warnings
    };
  };

  const computeExponentialModel = ({ points, alpha, domain }) => {
    const filtered = points.filter(pt => pt.y > 0);
    const warnings = [];
    if(filtered.length < points.length){
      warnings.push('Exponential regression discards non-positive Y values for log transform.');
    }
    if(filtered.length < 2){
      return null;
    }
    const xVals = filtered.map(pt => pt.x);
    const logY = filtered.map(pt => Math.log(pt.y));
    const filteredY = filtered.map(pt => pt.y);
    const domainEffective = {
      minX: Number.isFinite(domain?.minX) ? domain.minX : Math.min(...xVals),
      maxX: Number.isFinite(domain?.maxX) ? domain.maxX : Math.max(...xVals)
    };
    const design = filtered.map(pt => [1, pt.x]);
    const solved = solveLeastSquares(design, logY.map(val => [val]));
    if(!solved.coefficients){
      return null;
    }
    const [logA, b] = solved.coefficients;
    const predictionsLog = filtered.map(pt => logA + b * pt.x);
    const predictions = predictionsLog.map(val => Math.exp(val));
    const residualsOriginal = predictions.map((pred, idx) => filtered[idx].y - pred);
    const residualsLog = predictionsLog.map((pred, idx) => logY[idx] - pred);
    const meanY = jStatLib.mean(filteredY);
    const sst = filteredY.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
    const sse = residualsOriginal.reduce((sum,val)=>sum+val*val,0);
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const diagnostics = computeResidualDiagnostics(residualsOriginal);
    const coefficientStatsLog = buildCoefficientStats({
      coefficients: solved.coefficients,
      xtxInv: solved.xtxInv,
      residuals: residualsLog,
      alpha,
      termLabels: ['ln(a)','b'],
      degreesOfFreedom: filtered.length - solved.coefficients.length
    });
    const intervalInfo = buildIntervalSamples({
      xtxInv: solved.xtxInv,
      coefficients: solved.coefficients,
      residuals: residualsLog,
      domain: domainEffective,
      alpha,
      transform: {
        toOutput: ({ mean }) => Math.exp(mean),
        intervalToOutput: ({ mean, ciLow, ciHigh, piLow, piHigh }) => ({
          mean: Math.exp(mean),
          ciLow: Number.isFinite(ciLow) ? Math.exp(ciLow) : NaN,
          ciHigh: Number.isFinite(ciHigh) ? Math.exp(ciHigh) : NaN,
          piLow: Number.isFinite(piLow) ? Math.exp(piLow) : NaN,
          piHigh: Number.isFinite(piHigh) ? Math.exp(piHigh) : NaN
        })
      }
    });
    const a = Math.exp(logA);
    const predictExp = (x) => Math.exp(logA + b * x);
    return {
      coefficients: [a, b],
      domain: domainEffective,
      metrics: {
        sampleSize: filtered.length,
        predictors: 1,
        sse,
        sst,
        r2,
        adjR2: filtered.length > 2 ? 1 - (1 - r2) * ((filtered.length - 1) / (filtered.length - 2)) : r2,
        rmse: Math.sqrt(sse / filtered.length),
        mae: residualsOriginal.reduce((sum,val)=>sum+Math.abs(val),0)/filtered.length
      },
      residuals: summarizeResiduals(residualsOriginal),
      predictions,
      predict: predictExp,
      diagnostics,
      coefficientStats: coefficientStatsLog,
      intervals: intervalInfo.summary ? {
        alpha,
        tCritical: intervalInfo.tCritical,
        degreesOfFreedom: intervalInfo.degreesOfFreedom,
        samples: intervalInfo.samples,
        summary: intervalInfo.summary
      } : null,
      summary: {
        intercept: logA,
        slope: b,
        equation: `y = ${a.toFixed(4)} · e^{${b.toFixed(4)}x}`,
        parameters: {
          Amplitude: a,
          Rate: b
        },
        primaryParameter: {
          label: 'Rate',
          value: b
        }
      },
      warnings
    };
  };

  const computePowerModel = ({ points, alpha, domain }) => {
    const filtered = points.filter(pt => pt.x > 0 && pt.y > 0);
    const warnings = [];
    if(filtered.length < points.length){
      warnings.push('Power regression discards non-positive X or Y values for log transform.');
    }
    if(filtered.length < 2){
      return null;
    }
    const filteredX = filtered.map(pt => pt.x);
    const filteredY = filtered.map(pt => pt.y);
    const positiveMin = filteredX.reduce((acc, val) => (val > 0 && (acc === null || val < acc)) ? val : acc, null);
    let minDomainX = Number.isFinite(domain?.minX) ? Math.max(domain.minX, positiveMin || 0) : (positiveMin || Math.min(...filteredX));
    if(!Number.isFinite(minDomainX) || minDomainX <= 0){
      minDomainX = positiveMin || Math.min(...filteredX);
    }
    const maxDomainX = Number.isFinite(domain?.maxX) ? Math.max(domain.maxX, Math.max(...filteredX)) : Math.max(...filteredX);
    const domainEffective = { minX: minDomainX, maxX: maxDomainX };
    const logX = filteredX.map(val => Math.log(val));
    const logY = filteredY.map(val => Math.log(val));
    const design = filtered.map(pt => [1, Math.log(pt.x)]);
    const solved = solveLeastSquares(design, logY.map(val => [val]));
    if(!solved.coefficients){
      return null;
    }
    const [logA, b] = solved.coefficients;
    const predictionsLog = filtered.map(pt => logA + b * Math.log(pt.x));
    const predictions = predictionsLog.map(val => Math.exp(val));
    const residualsOriginal = predictions.map((pred, idx) => filtered[idx].y - pred);
    const residualsLog = predictionsLog.map((pred, idx) => logY[idx] - pred);
    const meanY = jStatLib.mean(filteredY);
    const sst = filteredY.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
    const sse = residualsOriginal.reduce((sum,val)=>sum+val*val,0);
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const diagnostics = computeResidualDiagnostics(residualsOriginal);
    const coefficientStatsLog = buildCoefficientStats({
      coefficients: solved.coefficients,
      xtxInv: solved.xtxInv,
      residuals: residualsLog,
      alpha,
      termLabels: ['ln(a)','b'],
      degreesOfFreedom: filtered.length - solved.coefficients.length
    });
    const intervalInfo = buildIntervalSamples({
      xtxInv: solved.xtxInv,
      coefficients: solved.coefficients,
      residuals: residualsLog,
      domain: domainEffective,
      alpha,
      basisBuilder: (x) => [1, Math.log(x)],
      transform: {
        toOutput: ({ mean }) => Math.exp(mean),
        intervalToOutput: ({ mean, ciLow, ciHigh, piLow, piHigh }) => ({
          mean: Math.exp(mean),
          ciLow: Number.isFinite(ciLow) ? Math.exp(ciLow) : NaN,
          ciHigh: Number.isFinite(ciHigh) ? Math.exp(ciHigh) : NaN,
          piLow: Number.isFinite(piLow) ? Math.exp(piLow) : NaN,
          piHigh: Number.isFinite(piHigh) ? Math.exp(piHigh) : NaN
        })
      }
    });
    const a = Math.exp(logA);
    const predictPower = (x) => (x > 0 ? a * Math.pow(x, b) : NaN);
    return {
      coefficients: [a, b],
      domain: domainEffective,
      metrics: {
        sampleSize: filtered.length,
        predictors: 1,
        sse,
        sst,
        r2,
        adjR2: filtered.length > 2 ? 1 - (1 - r2) * ((filtered.length - 1) / (filtered.length - 2)) : r2,
        rmse: Math.sqrt(sse / filtered.length),
        mae: residualsOriginal.reduce((sum,val)=>sum+Math.abs(val),0)/filtered.length
      },
      residuals: summarizeResiduals(residualsOriginal),
      predictions,
      predict: predictPower,
      diagnostics,
      coefficientStats: coefficientStatsLog,
      intervals: intervalInfo.summary ? {
        alpha,
        tCritical: intervalInfo.tCritical,
        degreesOfFreedom: intervalInfo.degreesOfFreedom,
        samples: intervalInfo.samples,
        summary: intervalInfo.summary
      } : null,
      summary: {
        intercept: logA,
        slope: b,
        equation: `y = ${a.toFixed(4)} · x^{${b.toFixed(4)}}`,
        parameters: {
          Scale: a,
          Exponent: b
        },
        primaryParameter: {
          label: 'Exponent',
          value: b
        }
      },
      warnings
    };
  };

  const autoSelectArimaOrder = (series, options = {}) => {
    if(!Array.isArray(series) || series.length < 5){
      return { p: 1, d: 0, criterion: NaN };
    }
    const maxP = Math.max(0, Math.min(Number(options.maxP) || 2, 5));
    const maxD = Math.max(0, Math.min(Number(options.maxD) || 2, 2));
    const criterion = options.criterion === 'aic' ? 'aic' : 'bic';
    let best = null;
    for(let d = 0; d <= maxD; d++){
      const diffed = differenceSeries(series, d);
      const values = diffed.series;
      if(values.length < 4){
        continue;
      }
      for(let p = 0; p <= maxP; p++){
        if(p === 0){
          continue;
        }
        const design = [];
        const target = [];
        for(let t = p; t < values.length; t++){
          const row = [1];
          for(let lag = 1; lag <= p; lag++){
            row.push(values[t - lag]);
          }
          design.push(row);
          target.push([values[t]]);
        }
        const solved = solveLeastSquares(design, target);
        if(!solved.coefficients){
          continue;
        }
        const coeffs = solved.coefficients;
        const residuals = [];
        for(let t = p; t < values.length; t++){
          let pred = coeffs[0];
          for(let lag = 1; lag <= p; lag++){
            pred += coeffs[lag] * values[t - lag];
          }
          residuals.push(values[t] - pred);
        }
        const nEff = residuals.length;
        if(nEff <= 0){
          continue;
        }
        const sse = residuals.reduce((sum,val)=>sum+val*val,0);
        const sigmaSq = sse / Math.max(nEff, 1);
        if(!Number.isFinite(sigmaSq) || sigmaSq <= 0){
          continue;
        }
        const k = coeffs.length;
        const logLikelihood = -0.5 * nEff * (Math.log(2 * Math.PI) + Math.log(sigmaSq) + 1);
        const aic = 2 * k - 2 * logLikelihood;
        const bic = Math.log(nEff) * k - 2 * logLikelihood;
        const score = criterion === 'aic' ? aic : bic;
        console.debug('Debug:', debugNs, 'autoSelectArimaOrder candidate', { p, d, k, aic, bic, score });
        if(!best || score < best.score){
          best = { p, d, score, aic, bic };
        }
      }
    }
    return best || { p: 1, d: 0, criterion: NaN };
  };

  const computeArimaModel = ({ points, alpha, domain, forecast }) => {
    const sorted = points.slice().sort((a,b)=>a.x - b.x);
    if(sorted.length < 4){
      return null;
    }
    const warnings = [];
    const yVals = sorted.map(pt => pt.y);
    const xVals = sorted.map(pt => pt.x);
    const yMean = jStatLib.mean(yVals);
    const sst = yVals.reduce((sum,val)=>sum+Math.pow(val - yMean,2),0);
    const forecastOptions = forecast || {};
    const horizon = clampPositiveInt(forecastOptions.horizon, { min: 1, max: 120, fallback: Math.max(1, Math.round(sorted.length * 0.25)) });
    const autoTune = !!forecastOptions.autoTune;
    const selection = autoTune ? autoSelectArimaOrder(yVals, forecastOptions) : null;
    if(autoTune){
      if(selection){
        warnings.push(`Auto-selected ARIMA order p=${selection.p}, d=${selection.d} using ${(forecastOptions.criterion === 'aic' ? 'AIC' : 'BIC')}.`);
      }else{
        warnings.push('Automatic ARIMA search retained manual order.');
      }
    }
    const pRaw = Number.isInteger(forecastOptions.p) ? forecastOptions.p : 1;
    const dRaw = Number.isInteger(forecastOptions.d) ? forecastOptions.d : 0;
    const p = Math.max(1, selection ? selection.p : Math.max(0, Math.min(pRaw, forecastOptions.maxP || 5)));
    const d = Math.max(0, selection ? selection.d : Math.max(0, Math.min(dRaw, forecastOptions.maxD || 2)));
    const differenced = differenceSeries(yVals, d);
    const diffSeries = differenced.series;
    if(diffSeries.length <= p){
      return null;
    }
    const design = [];
    const target = [];
    for(let t = p; t < diffSeries.length; t++){
      const row = [1];
      for(let lag = 1; lag <= p; lag++){
        row.push(diffSeries[t - lag]);
      }
      design.push(row);
      target.push([diffSeries[t]]);
    }
    const solved = solveLeastSquares(design, target);
    if(!solved.coefficients){
      return null;
    }
    const coefficients = solved.coefficients;
    const intercept = coefficients[0];
    const phi = coefficients.slice(1);
    const residuals = [];
    const fitted = [];
    const predictedDiff = [];
    const actualForResiduals = [];
    for(let t = p; t < diffSeries.length; t++){
      let pred = intercept;
      for(let lag = 1; lag <= p; lag++){
        pred += phi[lag - 1] * diffSeries[t - lag];
      }
      predictedDiff[t] = pred;
      const actualIndex = t + d;
      const baseActual = yVals[actualIndex - 1];
      const predictedActual = baseActual + pred;
      fitted[actualIndex] = predictedActual;
      const resid = yVals[actualIndex] - predictedActual;
      residuals.push(resid);
      actualForResiduals.push(yVals[actualIndex]);
    }
    const nEff = residuals.length;
    const sse = residuals.reduce((sum,val)=>sum+val*val,0);
    const sigmaSq = nEff ? sse / Math.max(nEff, 1) : 0;
    const sigma = Math.sqrt(Math.max(sigmaSq, 0));
    const rmse = nEff ? Math.sqrt(sse / nEff) : NaN;
    const mae = nEff ? residuals.reduce((sum,val)=>sum+Math.abs(val),0)/nEff : NaN;
    const mape = computeMeanAbsolutePercentageError(actualForResiduals, residuals.map((res, idx)=>actualForResiduals[idx] - res));
    const smape = computeSymmetricMAPE(actualForResiduals, residuals.map((res, idx)=>actualForResiduals[idx] - res));
    const k = coefficients.length;
    const logLikelihood = nEff > 0 && sigmaSq > 0
      ? -0.5 * nEff * (Math.log(2 * Math.PI) + Math.log(sigmaSq) + 1)
      : NaN;
    const aic = Number.isFinite(logLikelihood) ? (2 * k) - (2 * logLikelihood) : NaN;
    const bic = Number.isFinite(logLikelihood) ? (Math.log(nEff || 1) * k) - (2 * logLikelihood) : NaN;
    const spacing = computeAverageSpacing(xVals);
    const lastX = xVals[xVals.length - 1];
    let workingActual = yVals[yVals.length - 1];
    const diffHistory = diffSeries.slice(-p);
    const forecastPoints = [];
    const forecastVariances = computeForecastVariance(phi, horizon, sigmaSq);
    const zCritical = (jStatLib?.normal && typeof jStatLib.normal.inv === 'function')
      ? jStatLib.normal.inv(1 - alpha/2, 0, 1)
      : 1.96;
    const intervalSamples = [];
    sorted.forEach((pt, idx) => {
      const predicted = Number.isFinite(fitted[idx]) ? fitted[idx] : pt.y;
      const ciLow = Number.isFinite(predicted) ? predicted - zCritical * sigma : NaN;
      const ciHigh = Number.isFinite(predicted) ? predicted + zCritical * sigma : NaN;
      const piLow = ciLow;
      const piHigh = ciHigh;
      intervalSamples.push({ x: pt.x, y: predicted, ciLow, ciHigh, piLow, piHigh });
    });
    for(let h = 1; h <= horizon; h++){
      let diffPred = intercept;
      for(let lag = 1; lag <= p; lag++){
        const historyIndex = diffHistory.length - lag;
        diffPred += (phi[lag - 1] || 0) * (diffHistory[historyIndex] ?? 0);
      }
      diffHistory.push(diffPred);
      workingActual = workingActual + diffPred;
      const x = Number.isFinite(spacing) ? lastX + spacing * h : lastX + h;
      const variance = forecastVariances[h - 1] ?? sigmaSq;
      const stdErr = Math.sqrt(Math.max(variance, sigmaSq));
      const ciLow = workingActual - zCritical * stdErr;
      const ciHigh = workingActual + zCritical * stdErr;
      forecastPoints.push({ x, y: workingActual, lower: ciLow, upper: ciHigh, stdErr });
      intervalSamples.push({ x, y: workingActual, ciLow, ciHigh, piLow: ciLow, piHigh: ciHigh });
    }
    const diagnostics = computeResidualDiagnostics(residuals);
    const residualSummary = summarizeResiduals(residuals);
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const adjR2 = nEff > (k + 1) ? 1 - (1 - r2) * ((nEff - 1) / (nEff - k - 1)) : r2;
    const summaryParameters = {
      Intercept: intercept,
      Horizon: horizon,
      'AR order (p)': p,
      'Differencing (d)': d
    };
    phi.forEach((value, idx) => {
      summaryParameters[`AR${idx + 1}`] = value;
    });
    const primaryParameter = phi.length ? { label: `AR${1}`, value: phi[0] } : { label: 'Intercept', value: intercept };
    const modelDomain = {
      minX: domain?.minX ?? Math.min(...xVals),
      maxX: Math.max(domain?.maxX ?? Math.max(...xVals), forecastPoints.length ? forecastPoints[forecastPoints.length - 1].x : Math.max(...xVals))
    };
    const intervals = intervalSamples.length ? {
      alpha,
      zCritical,
      degreesOfFreedom: nEff,
      summary: {
        ciMin: intervalSamples.reduce((acc, sample) => Number.isFinite(sample.ciLow) ? Math.min(acc, sample.ciLow) : acc, Infinity),
        ciMax: intervalSamples.reduce((acc, sample) => Number.isFinite(sample.ciHigh) ? Math.max(acc, sample.ciHigh) : acc, -Infinity),
        piMin: intervalSamples.reduce((acc, sample) => Number.isFinite(sample.piLow) ? Math.min(acc, sample.piLow) : acc, Infinity),
        piMax: intervalSamples.reduce((acc, sample) => Number.isFinite(sample.piHigh) ? Math.max(acc, sample.piHigh) : acc, -Infinity)
      },
      samples: intervalSamples
    } : null;
    if(intervals && intervals.summary){
      if(!Number.isFinite(intervals.summary.ciMin)) intervals.summary.ciMin = NaN;
      if(!Number.isFinite(intervals.summary.ciMax)) intervals.summary.ciMax = NaN;
      if(!Number.isFinite(intervals.summary.piMin)) intervals.summary.piMin = NaN;
      if(!Number.isFinite(intervals.summary.piMax)) intervals.summary.piMax = NaN;
    }
    const predict = (x) => {
      if(!intervalSamples.length){
        return NaN;
      }
      const direct = intervalSamples.find(sample => sample.x === x);
      if(direct){
        return direct.y;
      }
      return linearInterpolateSamples(intervalSamples, x);
    };
    console.debug('Debug:', debugNs, 'ARIMA model summary', {
      p,
      d,
      horizon,
      rmse,
      mae,
      mape,
      smape,
      aic,
      bic,
      residualCount: residuals.length
    });
    return {
      coefficients,
      mode: 'arima',
      metrics: {
        sampleSize: sorted.length,
        predictors: p,
        sse,
        sst,
        r2,
        adjR2,
        rmse,
        mae,
        mape,
        smape,
        aic,
        bic,
        horizon
      },
      residuals: residualSummary,
      diagnostics,
      domain: modelDomain,
      intervals,
      predict,
      forecast: {
        horizon,
        step: spacing,
        points: forecastPoints,
        seasonLength: null,
        parameters: { p, d }
      },
      summary: {
        intercept,
        slope: phi[0] ?? intercept,
        equation: `ARIMA(${p},${d},0)` ,
        parameters: summaryParameters,
        primaryParameter
      },
      warnings
    };
  };

  const clampUnitInterval = (value, fallback = 0.2) => {
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return fallback;
    }
    const bounded = Math.max(0.001, Math.min(0.999, numeric));
    return bounded;
  };

  const buildInitialSeasonalComponents = (values, seasonLength) => {
    const seasons = Math.max(1, Math.floor(values.length / seasonLength));
    if(seasons < 2){
      const avg = jStatLib.mean(values);
      const seasonals = Array.from({ length: seasonLength }, (_, idx) => {
        const value = values[idx];
        return Number.isFinite(value) ? value - avg : 0;
      });
      return {
        level: avg,
        trend: 0,
        seasonals
      };
    }
    const seasonAverages = [];
    for(let s = 0; s < seasons; s++){
      const start = s * seasonLength;
      const slice = values.slice(start, start + seasonLength);
      if(slice.length < seasonLength){
        continue;
      }
      const mean = slice.reduce((sum,val)=>sum+val,0)/seasonLength;
      seasonAverages.push(mean);
    }
    const seasonals = new Array(seasonLength).fill(0);
    for(let i = 0; i < seasonLength; i++){
      let sum = 0;
      let count = 0;
      for(let s = 0; s < seasons; s++){
        const idx = s * seasonLength + i;
        if(idx >= values.length){
          continue;
        }
        const value = values[idx];
        if(!Number.isFinite(value)){
          continue;
        }
        sum += value - (seasonAverages[s] ?? 0);
        count++;
      }
      seasonals[i] = count ? sum / count : 0;
    }
    const level = seasonAverages[0] ?? values[0];
    const trend = seasonAverages.length > 1
      ? (seasonAverages[1] - seasonAverages[0]) / seasonLength
      : ((values[seasonLength] ?? values[values.length - 1]) - (values[0] ?? 0)) / Math.max(seasonLength, 1);
    return { level, trend, seasonals };
  };

  const runHoltWinters = ({ values, seasonLength, levelAlpha, trendBeta, seasonalGamma }) => {
    const sanitizedSeason = Math.max(2, Math.round(seasonLength));
    const init = buildInitialSeasonalComponents(values, sanitizedSeason);
    let level = Number.isFinite(init.level) ? init.level : values[0] || 0;
    let trend = Number.isFinite(init.trend) ? init.trend : 0;
    const seasonal = Array.isArray(init.seasonals) ? init.seasonals.slice() : new Array(sanitizedSeason).fill(0);
    const fitted = [];
    const residuals = [];
    const alphaClamped = clampUnitInterval(levelAlpha);
    const betaClamped = clampUnitInterval(trendBeta);
    const gammaClamped = clampUnitInterval(seasonalGamma);
    for(let t = 0; t < values.length; t++){
      const seasonIndex = t % sanitizedSeason;
      const seasonFactor = seasonal[seasonIndex] ?? 0;
      const fittedValue = level + trend + seasonFactor;
      fitted[t] = fittedValue;
      const actual = values[t];
      const resid = Number.isFinite(actual) ? actual - fittedValue : 0;
      residuals[t] = resid;
      const prevLevel = level;
      level = alphaClamped * (actual - seasonFactor) + (1 - alphaClamped) * (level + trend);
      trend = betaClamped * (level - prevLevel) + (1 - betaClamped) * trend;
      seasonal[seasonIndex] = gammaClamped * (actual - level) + (1 - gammaClamped) * seasonFactor;
    }
    return { fitted, residuals, level, trend, seasonals: seasonal, initial: init };
  };

  const autoTuneHoltWinters = (values, seasonLength, options = {}) => {
    const criteria = options.criterion === 'aic' ? 'aic' : 'bic';
    const candidates = options.gridValues && Array.isArray(options.gridValues) && options.gridValues.length
      ? options.gridValues
      : [0.2, 0.4, 0.6, 0.8];
    let best = null;
    candidates.forEach(alphaCandidate => {
      candidates.forEach(betaCandidate => {
        candidates.forEach(gammaCandidate => {
          const result = runHoltWinters({
            values,
            seasonLength,
            levelAlpha: alphaCandidate,
            trendBeta: betaCandidate,
            seasonalGamma: gammaCandidate
          });
          const residuals = result.residuals.slice(seasonLength);
          if(!residuals.length){
            return;
          }
          const sse = residuals.reduce((sum,val)=>sum+val*val,0);
          const sigmaSq = sse / Math.max(residuals.length, 1);
          if(!Number.isFinite(sigmaSq) || sigmaSq <= 0){
            return;
          }
          const k = seasonLength + 3;
          const logLikelihood = -0.5 * residuals.length * (Math.log(2 * Math.PI) + Math.log(sigmaSq) + 1);
          const aic = 2 * k - 2 * logLikelihood;
          const bic = Math.log(residuals.length) * k - 2 * logLikelihood;
          const score = criteria === 'aic' ? aic : bic;
          console.debug('Debug:', debugNs, 'autoTuneHoltWinters candidate', {
            alpha: alphaCandidate,
            beta: betaCandidate,
            gamma: gammaCandidate,
            aic,
            bic,
            score
          });
          if(!best || score < best.score){
            best = {
              alpha: alphaCandidate,
              beta: betaCandidate,
              gamma: gammaCandidate,
              score,
              aic,
              bic
            };
          }
        });
      });
    });
    return best;
  };

  const computeHoltWintersModel = ({ points, alpha, domain, forecast }) => {
    const sorted = points.slice().sort((a,b)=>a.x - b.x);
    if(sorted.length < 4){
      return null;
    }
    const warnings = [];
    const yVals = sorted.map(pt => pt.y);
    const xVals = sorted.map(pt => pt.x);
    const meanY = jStatLib.mean(yVals);
    const sst = yVals.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
    const forecastOptions = forecast || {};
    const seasonLength = clampPositiveInt(forecastOptions.seasonLength, { min: 2, max: Math.max(2, Math.floor(sorted.length / 2)), fallback: 12 });
    const horizon = clampPositiveInt(forecastOptions.horizon, { min: 1, max: 120, fallback: Math.max(1, Math.round(sorted.length * 0.25)) });
    const autoTune = !!forecastOptions.autoTune;
    const tuned = autoTune ? autoTuneHoltWinters(yVals, seasonLength, forecastOptions) : null;
    if(autoTune){
      if(tuned){
        warnings.push(`Auto-selected Holt-Winters α=${tuned.alpha.toFixed(2)}, β=${tuned.beta.toFixed(2)}, γ=${tuned.gamma.toFixed(2)} using ${(forecastOptions.criterion === 'aic' ? 'AIC' : 'BIC')}.`);
      }else{
        warnings.push('Automatic Holt-Winters tuning retained manual parameters.');
      }
    }
    const levelAlpha = clampUnitInterval(tuned?.alpha ?? forecastOptions.level ?? 0.2);
    const trendBeta = clampUnitInterval(tuned?.beta ?? forecastOptions.trend ?? 0.1);
    const seasonalGamma = clampUnitInterval(tuned?.gamma ?? forecastOptions.seasonal ?? 0.1);
    const execution = runHoltWinters({
      values: yVals,
      seasonLength,
      levelAlpha,
      trendBeta,
      seasonalGamma
    });
    const residuals = execution.residuals.slice(seasonLength);
    const fitted = execution.fitted;
    if(!residuals.length){
      return null;
    }
    const residualSummary = summarizeResiduals(residuals);
    const sse = residuals.reduce((sum,val)=>sum+val*val,0);
    const rmse = Math.sqrt(sse / residuals.length);
    const mae = residuals.reduce((sum,val)=>sum+Math.abs(val),0)/residuals.length;
    const actualForErrors = yVals.slice(seasonLength);
    const predictedForErrors = fitted.slice(seasonLength);
    const mape = computeMeanAbsolutePercentageError(actualForErrors, predictedForErrors);
    const smape = computeSymmetricMAPE(actualForErrors, predictedForErrors);
    const sigmaSq = sse / Math.max(residuals.length, 1);
    const sigma = Math.sqrt(Math.max(sigmaSq, 0));
    const k = seasonLength + 3;
    const logLikelihood = -0.5 * residuals.length * (Math.log(2 * Math.PI) + Math.log(sigmaSq) + 1);
    const aic = 2 * k - 2 * logLikelihood;
    const bic = Math.log(residuals.length) * k - 2 * logLikelihood;
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const adjR2 = residuals.length > k ? 1 - (1 - r2) * ((residuals.length - 1) / (residuals.length - k - 1)) : r2;
    const zCritical = (jStatLib?.normal && typeof jStatLib.normal.inv === 'function')
      ? jStatLib.normal.inv(1 - alpha/2, 0, 1)
      : 1.96;
    const spacing = computeAverageSpacing(xVals);
    const lastX = xVals[xVals.length - 1];
    const forecastPoints = [];
    const intervalSamples = [];
    sorted.forEach((pt, idx) => {
      const predicted = fitted[idx];
      const ciLow = predicted - zCritical * sigma;
      const ciHigh = predicted + zCritical * sigma;
      intervalSamples.push({ x: pt.x, y: predicted, ciLow, ciHigh, piLow: ciLow, piHigh: ciHigh });
    });
    for(let h = 1; h <= horizon; h++){
      const seasonIndex = (yVals.length + h - 1) % seasonLength;
      const seasonal = execution.seasonals[seasonIndex] ?? 0;
      const forecastValue = execution.level + h * execution.trend + seasonal;
      const inflation = Math.sqrt(1 + (h / seasonLength));
      const stdErr = sigma * inflation;
      const ciLow = forecastValue - zCritical * stdErr;
      const ciHigh = forecastValue + zCritical * stdErr;
      const x = Number.isFinite(spacing) ? lastX + spacing * h : lastX + h;
      forecastPoints.push({ x, y: forecastValue, lower: ciLow, upper: ciHigh, stdErr, seasonal });
      intervalSamples.push({ x, y: forecastValue, ciLow, ciHigh, piLow: ciLow, piHigh: ciHigh });
    }
    const diagnostics = computeResidualDiagnostics(residuals);
    const seasonalsPreview = execution.seasonals.slice(0, Math.min(seasonLength, 6));
    const parameters = {
      Level: execution.level,
      Trend: execution.trend,
      'Season length': seasonLength,
      Horizon: horizon,
      'Level α': levelAlpha,
      'Trend β': trendBeta,
      'Season γ': seasonalGamma
    };
    seasonalsPreview.forEach((value, idx) => {
      parameters[`Seasonal ${idx + 1}`] = value;
    });
    const modelDomain = {
      minX: domain?.minX ?? Math.min(...xVals),
      maxX: Math.max(domain?.maxX ?? Math.max(...xVals), forecastPoints.length ? forecastPoints[forecastPoints.length - 1].x : Math.max(...xVals))
    };
    const intervals = intervalSamples.length ? {
      alpha,
      zCritical,
      degreesOfFreedom: residuals.length,
      summary: {
        ciMin: intervalSamples.reduce((acc, sample) => Number.isFinite(sample.ciLow) ? Math.min(acc, sample.ciLow) : acc, Infinity),
        ciMax: intervalSamples.reduce((acc, sample) => Number.isFinite(sample.ciHigh) ? Math.max(acc, sample.ciHigh) : acc, -Infinity),
        piMin: intervalSamples.reduce((acc, sample) => Number.isFinite(sample.piLow) ? Math.min(acc, sample.piLow) : acc, Infinity),
        piMax: intervalSamples.reduce((acc, sample) => Number.isFinite(sample.piHigh) ? Math.max(acc, sample.piHigh) : acc, -Infinity)
      },
      samples: intervalSamples
    } : null;
    if(intervals && intervals.summary){
      if(!Number.isFinite(intervals.summary.ciMin)) intervals.summary.ciMin = NaN;
      if(!Number.isFinite(intervals.summary.ciMax)) intervals.summary.ciMax = NaN;
      if(!Number.isFinite(intervals.summary.piMin)) intervals.summary.piMin = NaN;
      if(!Number.isFinite(intervals.summary.piMax)) intervals.summary.piMax = NaN;
    }
    const predict = (x) => {
      if(!intervalSamples.length){
        return NaN;
      }
      const direct = intervalSamples.find(sample => sample.x === x);
      if(direct){
        return direct.y;
      }
      return linearInterpolateSamples(intervalSamples, x);
    };
    console.debug('Debug:', debugNs, 'Holt-Winters summary', {
      horizon,
      seasonLength,
      rmse,
      mae,
      mape,
      smape,
      aic,
      bic
    });
    return {
      mode: 'holtWinters',
      coefficients: [],
      metrics: {
        sampleSize: sorted.length,
        predictors: seasonLength,
        sse,
        sst,
        r2,
        adjR2,
        rmse,
        mae,
        mape,
        smape,
        aic,
        bic,
        horizon
      },
      residuals: residualSummary,
      diagnostics,
      domain: modelDomain,
      intervals,
      predict,
      forecast: {
        horizon,
        step: spacing,
        points: forecastPoints,
        seasonLength,
        parameters: { levelAlpha, trendBeta, seasonalGamma }
      },
      summary: {
        intercept: execution.level,
        slope: execution.trend,
        equation: 'Holt-Winters (additive)',
        parameters,
        primaryParameter: {
          label: 'Trend',
          value: execution.trend
        }
      },
      warnings
    };
  };

  const computeSplineModel = ({ points, domain }) => {
    const warnings = [];
    const sorted = points.slice().sort((a,b)=>a.x-b.x);
    const unique = [];
    sorted.forEach(pt => {
      if(!unique.length || unique[unique.length-1].x !== pt.x){
        unique.push({ x: pt.x, y: pt.y });
      }
    });
    if(unique.length < 3){
      warnings.push('Spline regression requires at least three distinct X values.');
      return null;
    }
    const n = unique.length - 1;
    const h = [];
    for(let i=0;i<n;i++){
      h[i] = unique[i+1].x - unique[i].x;
      if(h[i] === 0){
        warnings.push('Duplicate X values detected in spline computation.');
        return null;
      }
    }
    const alphaVec = new Array(n).fill(0);
    for(let i=1;i<n;i++){
      alphaVec[i] = (3/h[i]) * (unique[i+1].y - unique[i].y) - (3/h[i-1]) * (unique[i].y - unique[i-1].y);
    }
    const l = new Array(n+1).fill(0);
    const mu = new Array(n+1).fill(0);
    const z = new Array(n+1).fill(0);
    l[0] = 1;
    mu[0] = 0;
    z[0] = 0;
    for(let i=1;i<n;i++){
      l[i] = 2*(unique[i+1].x - unique[i-1].x) - h[i-1]*mu[i-1];
      if(l[i] === 0){
        warnings.push('Spline system became singular.');
        return null;
      }
      mu[i] = h[i]/l[i];
      z[i] = (alphaVec[i] - h[i-1]*z[i-1])/l[i];
    }
    l[n] = 1;
    z[n] = 0;
    const c = new Array(n+1).fill(0);
    const bCoeff = new Array(n).fill(0);
    const dCoeff = new Array(n).fill(0);
    for(let j=n-1;j>=0;j--){
      c[j] = z[j] - mu[j]*c[j+1];
      bCoeff[j] = (unique[j+1].y - unique[j].y)/h[j] - h[j]*(c[j+1] + 2*c[j])/3;
      dCoeff[j] = (c[j+1] - c[j])/(3*h[j]);
    }
    const predict = (x) => {
      if(x <= unique[0].x){
        const j = 0;
        const diff = x - unique[j].x;
        return unique[j].y + diff * bCoeff[j] + diff*diff * c[j] + diff*diff*diff * dCoeff[j];
      }
      if(x >= unique[n].x){
        const j = n-1;
        const diff = x - unique[j+1].x;
        return unique[j+1].y + diff * bCoeff[j] + diff*diff * c[j+1] + diff*diff*diff * dCoeff[j];
      }
      let idx = 0;
      for(let i=0;i<n;i++){
        if(x >= unique[i].x && x <= unique[i+1].x){
          idx = i;
          break;
        }
      }
      const diff = x - unique[idx].x;
      return unique[idx].y + diff * bCoeff[idx] + diff*diff * c[idx] + diff*diff*diff * dCoeff[idx];
    };
    const predictions = points.map(pt => predict(pt.x));
    const residuals = predictions.map((pred, idx) => points[idx].y - pred);
    const pointY = points.map(pt => pt.y);
    const meanY = jStatLib.mean(pointY);
    const sst = pointY.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
    const sse = residuals.reduce((sum,val)=>sum+val*val,0);
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const diagnostics = computeResidualDiagnostics(residuals);
    const parameterMap = { Knots: unique.length };
    if(Number.isFinite(domain?.minX)) parameterMap['Domain min'] = domain.minX;
    if(Number.isFinite(domain?.maxX)) parameterMap['Domain max'] = domain.maxX;
    const summary = {
      intercept: NaN,
      slope: NaN,
      equation: `Natural cubic spline with ${unique.length} knots`,
      parameters: parameterMap,
      primaryParameter: {
        label: 'Knots',
        value: unique.length
      }
    };
    return {
      coefficients: [],
      domain: { minX: unique[0].x, maxX: unique[unique.length-1].x },
      metrics: {
        sampleSize: points.length,
        predictors: unique.length,
        sse,
        sst,
        r2,
        adjR2: NaN,
        rmse: Math.sqrt(sse / points.length),
        mae: residuals.reduce((sum,val)=>sum+Math.abs(val),0)/points.length
      },
      residuals: summarizeResiduals(residuals),
      predictions,
      predict,
      diagnostics,
      coefficientStats: [],
      intervals: null,
      summary,
      warnings
    };
  };

  if(!regressionTools.autoSelectArima){
    regressionTools.autoSelectArima = function autoSelectArima(series, options){
      try{
        return autoSelectArimaOrder(Array.isArray(series) ? series : [], options || {});
      }catch(err){
        console.error('autoSelectArima error', err);
        return null;
      }
    };
  }

  if(!regressionTools.autoTuneHoltWinters){
    regressionTools.autoTuneHoltWinters = function autoTuneHoltWintersWrapper(series, seasonLength, options){
      try{
        return autoTuneHoltWinters(Array.isArray(series) ? series : [], seasonLength, options || {});
      }catch(err){
        console.error('autoTuneHoltWinters error', err);
        return null;
      }
    };
  }

  if(!regressionTools.fitRegression){
    regressionTools.fitRegression = function fitRegression(points, options = {}){
      const cleanPoints = Array.isArray(points) ? points.filter(pt => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) : [];
      const mode = options.mode || 'linear';
      const alpha = Number.isFinite(options.alpha) && options.alpha > 0 && options.alpha < 1 ? options.alpha : 0.05;
      const sampleSize = cleanPoints.length;
      const domain = cleanPoints.reduce((acc, pt) => {
        if(!acc){
          return { minX: pt.x, maxX: pt.x };
        }
        return {
          minX: Math.min(acc.minX, pt.x),
          maxX: Math.max(acc.maxX, pt.x)
        };
      }, null);
      console.debug('Debug:', debugNs, 'fit input', { mode, sampleSize });
      if(sampleSize < 2 || !jStatLib){
        return {
          mode,
          coefficients: [],
          metrics: { sampleSize },
          residuals: { mean: NaN, sd: NaN, min: NaN, max: NaN },
          warnings: ['Insufficient data or jStat unavailable'],
          domain
        };
      }
      const xVals = cleanPoints.map(pt => pt.x);
      const yVals = cleanPoints.map(pt => pt.y);
      const yMean = jStatLib.mean(yVals);
      const sst = yVals.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
      const forecastOptions = options.forecast || {};
      let model;
      if(mode === 'arima'){
        model = computeArimaModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, forecast: forecastOptions });
      }else if(mode === 'holtWinters'){
        model = computeHoltWintersModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, forecast: forecastOptions });
      }else if(mode === 'logistic'){
        model = computeLogisticModel({ points: cleanPoints, alpha, domain });
      }else if(mode === 'quadratic' || mode === 'cubic'){
        const degree = mode === 'quadratic' ? 2 : 3;
        model = computePolynomialModel({ points: cleanPoints, degree, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, xVals, yVals, sst });
      }else if(mode === 'exponential'){
        model = computeExponentialModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
      }else if(mode === 'power'){
        model = computePowerModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
      }else if(mode === 'spline'){
        model = computeSplineModel({ points: cleanPoints, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
      }else{
        model = computeLinearModel({ points: cleanPoints, xVals, yVals, sst, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
      }
      if(!model){
        model = computeLinearModel({ points: cleanPoints, xVals, yVals, sst, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
        if(model){
          model.warnings = (model.warnings || []).concat([`Fell back to linear regression from mode "${mode}"`]);
        }
      }
      model = model || { coefficients: [], metrics: { sampleSize }, residuals: { mean: NaN, sd: NaN, min: NaN, max: NaN } };
      model.mode = mode;
      if(!model.domain){
        model.domain = domain;
      }
      if(!model.predict && model.summary && Number.isFinite(model.summary.intercept) && Number.isFinite(model.summary.slope)){
        const intercept = model.summary.intercept;
        const slope = model.summary.slope;
        model.predict = (x) => intercept + slope * x;
      }else if(!model.predict && model.coefficients?.length){
        model.predict = (x) => evaluatePolynomial(model.coefficients, x);
      }
      if(!model.predict && typeof computeSplineModel === 'function' && mode === 'spline'){
        console.debug('Debug:', debugNs, 'spline model missing predict');
      }
      console.debug('Debug:', debugNs, 'fit result', {
        mode: model.mode,
        coefficients: model.coefficients,
        metrics: model.metrics,
        residuals: model.residuals,
        diagnostics: model.diagnostics || null,
        intervalsSummary: model.intervals?.summary || null,
        warnings: model.warnings || []
      });
      return model;
    };
  }

  if(!regressionTools.createSummary){
    regressionTools.createSummary = function createRegressionSummary(model){
      if(!model) return null;
      const metrics = model.metrics || {};
      const residuals = model.residuals || {};
      const sanitizedParameters = {};
      if(model.summary?.parameters && typeof model.summary.parameters === 'object'){
        Object.keys(model.summary.parameters).forEach(key => {
          const value = model.summary.parameters[key];
          if(Number.isFinite(value)){
            sanitizedParameters[key] = ensureFiniteNumber(value);
          }else if(value != null){
            sanitizedParameters[key] = value;
          }
        });
      }
      const primaryParam = model.summary?.primaryParameter;
      const sanitizedPrimary = primaryParam && typeof primaryParam === 'object'
        ? {
            label: primaryParam.label || null,
            value: Number.isFinite(primaryParam.value) ? primaryParam.value : NaN
          }
        : null;
      return {
        mode: model.mode,
        coefficients: Array.isArray(model.coefficients) ? model.coefficients.map(ensureFiniteNumber) : [],
        metrics: {
          sampleSize: ensureFiniteNumber(metrics.sampleSize),
          r2: ensureFiniteNumber(metrics.r2),
          adjR2: ensureFiniteNumber(metrics.adjR2),
          rmse: ensureFiniteNumber(metrics.rmse),
          mae: ensureFiniteNumber(metrics.mae),
          sse: ensureFiniteNumber(metrics.sse),
          sst: ensureFiniteNumber(metrics.sst),
          logLoss: ensureFiniteNumber(metrics.logLoss),
          iterations: ensureFiniteNumber(metrics.iterations),
          mape: ensureFiniteNumber(metrics.mape),
          smape: ensureFiniteNumber(metrics.smape),
          aic: ensureFiniteNumber(metrics.aic),
          bic: ensureFiniteNumber(metrics.bic),
          horizon: ensureFiniteNumber(metrics.horizon)
        },
        residuals: {
          mean: ensureFiniteNumber(residuals.mean),
          sd: ensureFiniteNumber(residuals.sd),
          min: ensureFiniteNumber(residuals.min),
          max: ensureFiniteNumber(residuals.max)
        },
        diagnostics: model.diagnostics ? {
          skewness: ensureFiniteNumber(model.diagnostics.skewness),
          kurtosis: ensureFiniteNumber(model.diagnostics.kurtosis),
          jarqueBera: ensureFiniteNumber(model.diagnostics.jarqueBera),
          jarqueBeraP: ensureFiniteNumber(model.diagnostics.jarqueBeraP)
        } : null,
        coefficientStats: Array.isArray(model.coefficientStats)
          ? model.coefficientStats.map(stat => ({
            term: stat.term,
            estimate: ensureFiniteNumber(stat.estimate),
            standardError: ensureFiniteNumber(stat.standardError),
            tStatistic: ensureFiniteNumber(stat.tStatistic),
            pValue: ensureFiniteNumber(stat.pValue),
            ciLow: ensureFiniteNumber(stat.ciLow),
            ciHigh: ensureFiniteNumber(stat.ciHigh)
          }))
          : [],
        intervals: model.intervals ? {
          alpha: ensureFiniteNumber(model.intervals.alpha),
          tCritical: ensureFiniteNumber(model.intervals.tCritical ?? model.intervals.zCritical),
          degreesOfFreedom: ensureFiniteNumber(model.intervals.degreesOfFreedom),
          summary: model.intervals.summary ? {
            ciMin: ensureFiniteNumber(model.intervals.summary.ciMin),
            ciMax: ensureFiniteNumber(model.intervals.summary.ciMax),
            piMin: ensureFiniteNumber(model.intervals.summary.piMin),
            piMax: ensureFiniteNumber(model.intervals.summary.piMax)
          } : null
        } : null,
        summary: model.summary ? {
          intercept: ensureFiniteNumber(model.summary.intercept),
          slope: ensureFiniteNumber(model.summary.slope),
          equation: model.summary.equation || null,
          parameters: sanitizedParameters,
          primaryParameter: sanitizedPrimary
        } : null,
        domain: model.domain || null,
        warnings: Array.isArray(model.warnings) ? model.warnings.slice() : [],
        forecast: model.forecast ? {
          horizon: ensureFiniteNumber(model.forecast.horizon),
          seasonLength: ensureFiniteNumber(model.forecast.seasonLength ?? model.forecast.parameters?.seasonLength),
          step: ensureFiniteNumber(model.forecast.step),
          parameters: typeof model.forecast.parameters === 'object' ? { ...model.forecast.parameters } : null,
          points: Array.isArray(model.forecast.points)
            ? model.forecast.points.slice(0, Math.min(model.forecast.points.length, 180)).map(pt => ({
                x: ensureFiniteNumber(pt.x),
                y: ensureFiniteNumber(pt.y),
                lower: ensureFiniteNumber(pt.lower ?? pt.ciLow ?? pt.piLow),
                upper: ensureFiniteNumber(pt.upper ?? pt.ciHigh ?? pt.piHigh)
              }))
            : []
        } : null
      };
    };
  }

  if(!regressionTools.sampleCurve){
    regressionTools.sampleCurve = function sampleCurve(model, options = {}){
      if(!model || typeof model.predict !== 'function'){ return []; }
      const domain = options.domain || model.domain;
      if(!domain){ return []; }
      const minX = Number.isFinite(options.minX) ? options.minX : domain.minX;
      const maxX = Number.isFinite(options.maxX) ? options.maxX : domain.maxX;
      if(!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX){ return []; }
      const sampleCount = Math.max(2, options.sampleCount || (model.mode === 'logistic' ? 200 : 150));
      const step = (maxX - minX) / (sampleCount - 1);
      const samples = [];
      for(let i = 0; i < sampleCount; i++){
        const x = i === sampleCount - 1 ? maxX : (minX + step * i);
        const y = model.predict(x);
        samples.push({ x, y });
      }
      console.debug('Debug:', debugNs, 'sampleCurve', { mode: model.mode, sampleCount: samples.length });
      return samples;
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
