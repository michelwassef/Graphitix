(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const regressionTools = Shared.regressionTools = Shared.regressionTools || {};
  const jStatLib = global.jStat;
  const debugNs = 'shared-regression';
  const regressionDebugEnabled = () => (typeof Shared.isDebugEnabled === 'function' ? !!Shared.isDebugEnabled() : true);
  const regressionDebug = (...args) => {
    if(!regressionDebugEnabled()){
      return;
    }
    console.debug('Debug:', debugNs, ...args);
  };

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

  const safePow10 = (exponent) => {
    if(!Number.isFinite(exponent)){
      return NaN;
    }
    const bounded = Math.max(-308, Math.min(308, exponent));
    return Math.pow(10, bounded);
  };

  const isLikelyBinaryResponse = (points) => {
    if(!Array.isArray(points) || !points.length){
      return false;
    }
    let withinUnit = true;
    let boundaryCount = 0;
    const rounded = new Set();
    points.forEach(pt => {
      const yVal = Number(pt?.y);
      if(!Number.isFinite(yVal)){
        return;
      }
      if(yVal < 0 || yVal > 1){
        withinUnit = false;
      }else{
        if(Math.abs(yVal) <= 1e-6 || Math.abs(yVal - 1) <= 1e-6){
          boundaryCount += 1;
        }
        rounded.add(Math.round(yVal * 1000) / 1000);
      }
    });
    if(!withinUnit){
      return false;
    }
    if(rounded.size <= 2){
      return true;
    }
    const boundaryRatio = boundaryCount / Math.max(points.length, 1);
    return rounded.size <= 4 && boundaryRatio >= 0.8;
  };

  const evaluateDoseResponse4PL = (params, x) => {
    if(!params || !Number.isFinite(x)){
      return NaN;
    }
    const bottom = Number(params.bottom);
    const top = Number(params.top);
    const logIC50 = Number(params.logIC50);
    const hillSlope = Number(params.hillSlope);
    if(!Number.isFinite(bottom) || !Number.isFinite(top) || !Number.isFinite(logIC50) || !Number.isFinite(hillSlope)){
      return NaN;
    }
    const span = top - bottom;
    if(!Number.isFinite(span)){
      return NaN;
    }
    const exponent = (logIC50 - x) * hillSlope;
    const powTerm = safePow10(exponent);
    if(!Number.isFinite(powTerm)){
      return NaN;
    }
    const denominator = 1 + powTerm;
    if(!Number.isFinite(denominator) || denominator === 0){
      return NaN;
    }
    return bottom + (span / denominator);
  };

  const decodeDoseResponseVector = (vector) => {
    const bottom = Number(vector?.[0]);
    const logSpanRaw = Number(vector?.[1]);
    const logIC50 = Number(vector?.[2]);
    const hillSlopeRaw = Number(vector?.[3]);
    const logSpan = Number.isFinite(logSpanRaw) ? Math.max(-40, Math.min(40, logSpanRaw)) : 0;
    const span = Math.exp(logSpan);
    const top = bottom + span;
    const hillSlope = Number.isFinite(hillSlopeRaw) ? Math.max(-12, Math.min(12, hillSlopeRaw)) : 0;
    return { bottom, top, span, logIC50, hillSlope };
  };

  const toDoseResponseParamVector = (params) => [
    Number(params?.bottom),
    Number(params?.top),
    Number(params?.logIC50),
    Number(params?.hillSlope)
  ];

  const fromDoseResponseParamVector = (vector) => ({
    bottom: Number(vector?.[0]),
    top: Number(vector?.[1]),
    logIC50: Number(vector?.[2]),
    hillSlope: Number(vector?.[3])
  });

  const normalizeDoseResponseParamVector = (vector) => {
    const normalized = Array.isArray(vector) ? vector.slice(0,4) : [NaN, NaN, NaN, NaN];
    while(normalized.length < 4){
      normalized.push(0);
    }
    if(normalized[1] <= normalized[0]){
      normalized[1] = normalized[0] + 1e-6;
    }
    return normalized;
  };

  const computeDoseResponseSse = (vector, points) => {
    const params = decodeDoseResponseVector(vector);
    if(!Number.isFinite(params.bottom) || !Number.isFinite(params.top) || !Number.isFinite(params.logIC50) || !Number.isFinite(params.hillSlope)){
      return { sse: Infinity, predictions: [], params };
    }
    const predictions = new Array(points.length);
    let sse = 0;
    for(let i = 0; i < points.length; i++){
      const point = points[i];
      const prediction = evaluateDoseResponse4PL(params, point.x);
      if(!Number.isFinite(prediction)){
        return { sse: Infinity, predictions: [], params };
      }
      const residual = point.y - prediction;
      predictions[i] = prediction;
      sse += residual * residual;
    }
    return { sse, predictions, params };
  };

  const computeDoseResponseGradient = (vector, points) => {
    const gradient = new Array(vector.length).fill(0);
    for(let idx = 0; idx < vector.length; idx++){
      const baseValue = Number(vector[idx]);
      const step = Math.max(1e-5, Math.abs(baseValue) * 1e-4);
      const plus = vector.slice();
      const minus = vector.slice();
      plus[idx] = baseValue + step;
      minus[idx] = baseValue - step;
      const plusEval = computeDoseResponseSse(plus, points).sse;
      const minusEval = computeDoseResponseSse(minus, points).sse;
      if(Number.isFinite(plusEval) && Number.isFinite(minusEval)){
        const rawGradient = (plusEval - minusEval) / (2 * step);
        gradient[idx] = Number.isFinite(rawGradient)
          ? Math.max(-1e6, Math.min(1e6, rawGradient))
          : 0;
      }
    }
    return gradient;
  };

  const fitDoseResponseByAdam = ({ points, initialVector, maxIterations = 450 }) => {
    let vector = Array.isArray(initialVector) ? initialVector.slice(0,4) : [0,0,0,0];
    while(vector.length < 4){
      vector.push(0);
    }
    const beta1 = 0.9;
    const beta2 = 0.999;
    const epsilon = 1e-8;
    const m = [0,0,0,0];
    const v = [0,0,0,0];
    let learningRate = 0.08;
    let bestEval = computeDoseResponseSse(vector, points);
    let bestVector = vector.slice();
    let stallCount = 0;
    let iteration = 0;
    for(iteration = 1; iteration <= maxIterations; iteration++){
      const currentEval = computeDoseResponseSse(vector, points);
      if(currentEval.sse < bestEval.sse){
        bestEval = currentEval;
        bestVector = vector.slice();
        stallCount = 0;
      }else{
        stallCount += 1;
      }
      const gradient = computeDoseResponseGradient(vector, points);
      const nextVector = vector.slice();
      let gradNormSq = 0;
      for(let idx = 0; idx < gradient.length; idx++){
        const g = gradient[idx];
        gradNormSq += g * g;
        m[idx] = beta1 * m[idx] + (1 - beta1) * g;
        v[idx] = beta2 * v[idx] + (1 - beta2) * (g * g);
        const mHat = m[idx] / (1 - Math.pow(beta1, iteration));
        const vHat = v[idx] / (1 - Math.pow(beta2, iteration));
        const step = learningRate * (mHat / (Math.sqrt(vHat) + epsilon));
        nextVector[idx] = vector[idx] - step;
      }
      const nextEval = computeDoseResponseSse(nextVector, points);
      if(nextEval.sse <= currentEval.sse || !Number.isFinite(currentEval.sse)){
        vector = nextVector;
        if(nextEval.sse < bestEval.sse){
          bestEval = nextEval;
          bestVector = vector.slice();
          stallCount = 0;
        }
        learningRate = Math.min(0.2, learningRate * 1.015);
      }else{
        learningRate = Math.max(1e-4, learningRate * 0.5);
      }
      if(gradNormSq < 1e-12){
        break;
      }
      if(learningRate <= 1e-4 && stallCount > 70){
        break;
      }
      if(stallCount > 160){
        break;
      }
    }
    return {
      vector: bestVector,
      sse: bestEval.sse,
      predictions: bestEval.predictions,
      params: bestEval.params,
      iterations: iteration,
      converged: stallCount <= 240
    };
  };

  const approximateDoseResponseGradientAtX = (parameterVector, x) => {
    const gradient = new Array(4).fill(0);
    const baseVector = normalizeDoseResponseParamVector(parameterVector);
    for(let idx = 0; idx < gradient.length; idx++){
      const baseValue = baseVector[idx];
      const step = Math.max(1e-6, Math.abs(baseValue) * 1e-4);
      const plus = baseVector.slice();
      const minus = baseVector.slice();
      plus[idx] = baseValue + step;
      minus[idx] = baseValue - step;
      const plusAdjusted = normalizeDoseResponseParamVector(plus);
      const minusAdjusted = normalizeDoseResponseParamVector(minus);
      const plusPrediction = evaluateDoseResponse4PL(fromDoseResponseParamVector(plusAdjusted), x);
      const minusPrediction = evaluateDoseResponse4PL(fromDoseResponseParamVector(minusAdjusted), x);
      if(Number.isFinite(plusPrediction) && Number.isFinite(minusPrediction)){
        gradient[idx] = (plusPrediction - minusPrediction) / (2 * step);
      }
    }
    return gradient;
  };

  const estimateDoseResponseCovariance = ({ points, params, sse, alpha }) => {
    const parameterVector = normalizeDoseResponseParamVector(toDoseResponseParamVector(params));
    const parameterCount = parameterVector.length;
    const dof = points.length - parameterCount;
    if(!hasMatrixOps || dof <= 0){
      return {
        covariance: null,
        standardErrors: new Array(parameterCount).fill(NaN),
        sigmaSq: NaN,
        tCritical: NaN,
        degreesOfFreedom: dof
      };
    }
    const jacobian = points.map(point => approximateDoseResponseGradientAtX(parameterVector, point.x));
    const jacobianT = safeTranspose(jacobian);
    if(!jacobianT){
      return {
        covariance: null,
        standardErrors: new Array(parameterCount).fill(NaN),
        sigmaSq: NaN,
        tCritical: NaN,
        degreesOfFreedom: dof
      };
    }
    const jtj = safeMultiply(jacobianT, jacobian);
    if(!jtj){
      return {
        covariance: null,
        standardErrors: new Array(parameterCount).fill(NaN),
        sigmaSq: NaN,
        tCritical: NaN,
        degreesOfFreedom: dof
      };
    }
    const jtjInv = safeInverse(jtj);
    if(!jtjInv){
      return {
        covariance: null,
        standardErrors: new Array(parameterCount).fill(NaN),
        sigmaSq: NaN,
        tCritical: NaN,
        degreesOfFreedom: dof
      };
    }
    const sigmaSq = sse / Math.max(dof, 1);
    const covariance = jtjInv.map(row => row.map(value => Number.isFinite(value) ? value * sigmaSq : NaN));
    const standardErrors = covariance.map((row, idx) => {
      const variance = row?.[idx];
      return Number.isFinite(variance) && variance >= 0 ? Math.sqrt(variance) : NaN;
    });
    const tDist = jStatLib?.studentt;
    const tCritical = (tDist && typeof tDist.inv === 'function' && dof > 0)
      ? tDist.inv(1 - alpha / 2, dof)
      : NaN;
    return {
      covariance,
      standardErrors,
      sigmaSq,
      tCritical,
      degreesOfFreedom: dof
    };
  };

  const buildDoseResponseIntervals = ({ params, covariance, sigmaSq, tCritical, domain, sampleCount = 200 }) => {
    if(!covariance || !Number.isFinite(sigmaSq) || !Number.isFinite(tCritical)){
      return { samples: [], summary: null };
    }
    const minX = Number.isFinite(domain?.minX) ? domain.minX : NaN;
    const maxX = Number.isFinite(domain?.maxX) ? domain.maxX : NaN;
    if(!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX){
      return { samples: [], summary: null };
    }
    const parameterVector = normalizeDoseResponseParamVector(toDoseResponseParamVector(params));
    const step = (maxX - minX) / Math.max(sampleCount - 1, 1);
    const samples = [];
    let ciMin = Infinity;
    let ciMax = -Infinity;
    let piMin = Infinity;
    let piMax = -Infinity;
    for(let idx = 0; idx < sampleCount; idx++){
      const x = idx === sampleCount - 1 ? maxX : (minX + (step * idx));
      const y = evaluateDoseResponse4PL(params, x);
      if(!Number.isFinite(y)){
        continue;
      }
      const gradient = approximateDoseResponseGradientAtX(parameterVector, x);
      let meanVariance = 0;
      for(let i = 0; i < gradient.length; i++){
        const row = covariance[i] || [];
        for(let j = 0; j < gradient.length; j++){
          const covValue = row[j];
          if(Number.isFinite(covValue)){
            meanVariance += gradient[i] * covValue * gradient[j];
          }
        }
      }
      const meanSe = meanVariance >= 0 ? Math.sqrt(meanVariance) : NaN;
      const ciHalf = Number.isFinite(meanSe) ? tCritical * meanSe : NaN;
      const predictionSe = Number.isFinite(meanVariance) ? Math.sqrt(Math.max(meanVariance + sigmaSq, 0)) : NaN;
      const piHalf = Number.isFinite(predictionSe) ? tCritical * predictionSe : NaN;
      const ciLow = Number.isFinite(ciHalf) ? y - ciHalf : NaN;
      const ciHigh = Number.isFinite(ciHalf) ? y + ciHalf : NaN;
      const piLow = Number.isFinite(piHalf) ? y - piHalf : NaN;
      const piHigh = Number.isFinite(piHalf) ? y + piHalf : NaN;
      if(Number.isFinite(ciLow) && ciLow < ciMin){ ciMin = ciLow; }
      if(Number.isFinite(ciHigh) && ciHigh > ciMax){ ciMax = ciHigh; }
      if(Number.isFinite(piLow) && piLow < piMin){ piMin = piLow; }
      if(Number.isFinite(piHigh) && piHigh > piMax){ piMax = piHigh; }
      samples.push({ x, y, ciLow, ciHigh, piLow, piHigh });
    }
    const summary = samples.length
      ? {
          ciMin: Number.isFinite(ciMin) ? ciMin : NaN,
          ciMax: Number.isFinite(ciMax) ? ciMax : NaN,
          piMin: Number.isFinite(piMin) ? piMin : NaN,
          piMax: Number.isFinite(piMax) ? piMax : NaN
        }
      : null;
    return { samples, summary };
  };

  const computeDoseResponse4PLModel = ({ points, alpha, domain }) => {
    if(!Array.isArray(points) || points.length < 4){
      return null;
    }
    const sortedByX = points.slice().sort((a,b) => a.x - b.x);
    const xVals = sortedByX.map(pt => pt.x);
    const yVals = sortedByX.map(pt => pt.y);
    const yMin = Math.min(...yVals);
    const yMax = Math.max(...yVals);
    const spanGuess = Math.max(yMax - yMin, 1e-6);
    const yMid = yMin + (spanGuess / 2);
    const xNearMid = sortedByX.reduce((best, point) => {
      const distance = Math.abs(point.y - yMid);
      if(!best || distance < best.distance){
        return { x: point.x, distance };
      }
      return best;
    }, null);
    const sortedXOnly = xVals.slice().sort((a,b) => a - b);
    const medianX = sortedXOnly.length % 2 === 0
      ? (sortedXOnly[(sortedXOnly.length / 2) - 1] + sortedXOnly[sortedXOnly.length / 2]) / 2
      : sortedXOnly[Math.floor(sortedXOnly.length / 2)];
    const meanX = jStatLib.mean(xVals);
    const meanY = jStatLib.mean(yVals);
    const slopeNumerator = xVals.reduce((sum, value, idx) => sum + ((value - meanX) * (yVals[idx] - meanY)), 0);
    const slopeDenominator = xVals.reduce((sum, value) => sum + Math.pow(value - meanX, 2), 0);
    const linearSlope = slopeDenominator !== 0 ? slopeNumerator / slopeDenominator : 0;
    const hillSeed = linearSlope <= 0 ? -1 : 1;
    const logSpanGuess = Math.log(spanGuess);
    const seedCenter = Number.isFinite(xNearMid?.x) ? xNearMid.x : (Number.isFinite(medianX) ? medianX : meanX);
    const initialVectors = [
      [yMin, logSpanGuess, seedCenter, hillSeed],
      [yMin - (0.1 * spanGuess), Math.log(spanGuess * 1.2), seedCenter, hillSeed],
      [yMin, logSpanGuess, medianX, hillSeed * 0.5],
      [yMin, logSpanGuess, meanX, hillSeed],
      [yMin, logSpanGuess, seedCenter, -hillSeed]
    ].filter(vector => vector.every(value => Number.isFinite(value)));
    if(!initialVectors.length){
      initialVectors.push([yMin, logSpanGuess, 0, hillSeed]);
    }
    let bestFit = null;
    initialVectors.forEach(initial => {
      const fit = fitDoseResponseByAdam({ points: sortedByX, initialVector: initial, maxIterations: 450 });
      if(!bestFit || fit.sse < bestFit.sse){
        bestFit = fit;
      }
    });
    if(!bestFit || !Number.isFinite(bestFit.sse)){
      return null;
    }
    const params = bestFit.params || decodeDoseResponseVector(bestFit.vector);
    const predictions = Array.isArray(bestFit.predictions) ? bestFit.predictions : sortedByX.map(pt => evaluateDoseResponse4PL(params, pt.x));
    const residuals = predictions.map((prediction, idx) => sortedByX[idx].y - prediction);
    const sse = residuals.reduce((sum, value) => sum + (value * value), 0);
    const sst = yVals.reduce((sum, value) => sum + Math.pow(value - meanY, 2), 0);
    const rmse = Math.sqrt(sse / sortedByX.length);
    const mae = residuals.reduce((sum, value) => sum + Math.abs(value), 0) / sortedByX.length;
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const parameterCount = 4;
    const adjR2 = sortedByX.length > parameterCount
      ? 1 - ((1 - r2) * ((sortedByX.length - 1) / (sortedByX.length - parameterCount)))
      : r2;
    const covarianceInfo = estimateDoseResponseCovariance({ points: sortedByX, params, sse, alpha });
    const standardErrors = covarianceInfo.standardErrors || [NaN, NaN, NaN, NaN];
    const tCritical = covarianceInfo.tCritical;
    const degreesOfFreedom = covarianceInfo.degreesOfFreedom;
    const tDist = jStatLib?.studentt;
    const terms = ['Bottom','Top','LogIC50','HillSlope'];
    const estimates = [params.bottom, params.top, params.logIC50, params.hillSlope];
    const coefficientStats = terms.map((term, idx) => {
      const estimate = estimates[idx];
      const standardError = standardErrors[idx];
      const tStatistic = Number.isFinite(standardError) && standardError !== 0
        ? estimate / standardError
        : NaN;
      const pValue = (tDist && typeof tDist.cdf === 'function' && Number.isFinite(tStatistic) && degreesOfFreedom > 0)
        ? 2 * (1 - tDist.cdf(Math.abs(tStatistic), degreesOfFreedom))
        : NaN;
      const ciHalfWidth = Number.isFinite(tCritical) && Number.isFinite(standardError)
        ? tCritical * standardError
        : NaN;
      return {
        term,
        estimate,
        standardError,
        tStatistic,
        pValue,
        ciLow: Number.isFinite(ciHalfWidth) ? estimate - ciHalfWidth : NaN,
        ciHigh: Number.isFinite(ciHalfWidth) ? estimate + ciHalfWidth : NaN
      };
    });
    const logIC50Stat = coefficientStats.find(entry => entry.term === 'LogIC50') || null;
    const ic50Value = safePow10(params.logIC50);
    const ic50StandardError = Number.isFinite(logIC50Stat?.standardError) && Number.isFinite(ic50Value)
      ? Math.log(10) * ic50Value * logIC50Stat.standardError
      : NaN;
    coefficientStats.push({
      term: 'IC50',
      estimate: ic50Value,
      standardError: ic50StandardError,
      tStatistic: Number.isFinite(logIC50Stat?.tStatistic) ? logIC50Stat.tStatistic : NaN,
      pValue: Number.isFinite(logIC50Stat?.pValue) ? logIC50Stat.pValue : NaN,
      ciLow: Number.isFinite(logIC50Stat?.ciLow) ? safePow10(logIC50Stat.ciLow) : NaN,
      ciHigh: Number.isFinite(logIC50Stat?.ciHigh) ? safePow10(logIC50Stat.ciHigh) : NaN
    });
    const intervals = buildDoseResponseIntervals({
      params,
      covariance: covarianceInfo.covariance,
      sigmaSq: covarianceInfo.sigmaSq,
      tCritical,
      domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }
    });
    const warnings = [];
    if(!bestFit.converged){
      warnings.push('Dose-response optimization did not fully converge; interpret IC50 with caution.');
    }
    if(!covarianceInfo.covariance){
      warnings.push('IC50 confidence intervals are unavailable because the covariance matrix could not be estimated.');
    }
    regressionDebug('dose-response 4PL fit', {
      sampleSize: sortedByX.length,
      iterations: bestFit.iterations,
      sse,
      r2,
      ic50: ic50Value,
      logIC50: params.logIC50,
      hillSlope: params.hillSlope
    });
    return {
      mode: 'doseResponse4pl',
      coefficients: [params.bottom, params.top, params.logIC50, params.hillSlope],
      metrics: {
        sampleSize: sortedByX.length,
        predictors: 4,
        sse,
        sst,
        r2,
        adjR2,
        rmse,
        mae,
        iterations: bestFit.iterations
      },
      residuals: summarizeResiduals(residuals),
      predictions,
      predict: (x) => evaluateDoseResponse4PL(params, x),
      diagnostics: computeResidualDiagnostics(residuals),
      coefficientStats,
      intervals: intervals.summary ? {
        alpha,
        tCritical,
        degreesOfFreedom,
        samples: intervals.samples,
        summary: intervals.summary
      } : null,
      summary: {
        intercept: params.bottom,
        slope: params.hillSlope,
        equation: `y = ${params.bottom.toFixed(4)} + ${(params.top - params.bottom).toFixed(4)} / (1 + 10^((${params.logIC50.toFixed(4)} - x) * ${params.hillSlope.toFixed(4)}))`,
        parameters: {
          Bottom: params.bottom,
          Top: params.top,
          LogIC50: params.logIC50,
          HillSlope: params.hillSlope,
          IC50: ic50Value,
          Span: params.top - params.bottom
        },
        primaryParameter: {
          label: 'IC50',
          value: ic50Value
        }
      },
      domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) },
      warnings
    };
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

  const clampPositive = (value, fallback = 1e-6) => {
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return fallback;
    }
    return Math.max(fallback, numeric);
  };

  const resolveWeightedResidualScale = (residuals) => {
    if(!Array.isArray(residuals) || !residuals.length){
      return NaN;
    }
    const sortedAbs = residuals.map(val => Math.abs(val)).sort((a,b)=>a-b);
    const middle = Math.floor(sortedAbs.length / 2);
    const mad = sortedAbs.length % 2 === 0
      ? (sortedAbs[middle - 1] + sortedAbs[middle]) / 2
      : sortedAbs[middle];
    const robustScale = Number.isFinite(mad) ? mad * 1.4826 : NaN;
    if(Number.isFinite(robustScale) && robustScale > 0){
      return robustScale;
    }
    const variance = residuals.length > 1
      ? residuals.reduce((sum,val)=>sum + val * val,0) / (residuals.length - 1)
      : 0;
    return Math.sqrt(Math.max(variance, 0));
  };

  const buildRegressionWeights = ({ points, method, options, residuals }) => {
    const count = Array.isArray(points) ? points.length : 0;
    const resolvedMethod = typeof method === 'string' ? method.toLowerCase() : 'ols';
    const weights = new Array(count).fill(1);
    if(resolvedMethod === 'wls'){
      const manual = Array.isArray(options?.weights) ? options.weights : null;
      for(let i = 0; i < count; i++){
        const manualWeight = Number(manual?.[i]);
        if(Number.isFinite(manualWeight) && manualWeight > 0){
          weights[i] = manualWeight;
          continue;
        }
        const yMagnitude = Math.abs(Number(points[i]?.y));
        const denom = Math.max(yMagnitude, 1e-6);
        weights[i] = 1 / (denom * denom);
      }
    }else if(resolvedMethod === 'huber' && Array.isArray(residuals) && residuals.length === count){
      const huberK = Number.isFinite(Number(options?.huberK)) ? Number(options.huberK) : 1.345;
      const scale = resolveWeightedResidualScale(residuals);
      if(Number.isFinite(scale) && scale > 0){
        for(let i = 0; i < count; i++){
          const r = Math.abs(residuals[i]);
          const threshold = huberK * scale;
          weights[i] = r <= threshold ? 1 : (threshold / Math.max(r, 1e-12));
        }
      }
    }
    return weights;
  };

  const computeJacobianNumeric = ({ points, params, predictFromParams }) => {
    const paramCount = params.length;
    const jacobian = new Array(points.length);
    for(let i = 0; i < points.length; i++){
      const x = points[i].x;
      const row = new Array(paramCount).fill(0);
      for(let pIdx = 0; pIdx < paramCount; pIdx++){
        const base = params[pIdx];
        const step = Math.max(1e-6, Math.abs(base) * 1e-4);
        const plus = params.slice();
        const minus = params.slice();
        plus[pIdx] = base + step;
        minus[pIdx] = base - step;
        const yPlus = predictFromParams(plus, x);
        const yMinus = predictFromParams(minus, x);
        if(Number.isFinite(yPlus) && Number.isFinite(yMinus)){
          row[pIdx] = (yPlus - yMinus) / (2 * step);
        }else{
          row[pIdx] = 0;
        }
      }
      jacobian[i] = row;
    }
    return jacobian;
  };

  const applyParameterBounds = (params, bounds) => {
    const lower = Array.isArray(bounds?.lower) ? bounds.lower : [];
    const upper = Array.isArray(bounds?.upper) ? bounds.upper : [];
    for(let i = 0; i < params.length; i++){
      const lo = Number(lower[i]);
      const hi = Number(upper[i]);
      if(Number.isFinite(lo) && params[i] < lo){
        params[i] = lo;
      }
      if(Number.isFinite(hi) && params[i] > hi){
        params[i] = hi;
      }
    }
    return params;
  };

  const solveNormalEquations = (a, b) => {
    const aInv = safeInverse(a);
    if(!aInv){
      return null;
    }
    const delta = new Array(b.length).fill(0);
    for(let r = 0; r < aInv.length; r++){
      let sum = 0;
      for(let c = 0; c < b.length; c++){
        sum += (aInv[r]?.[c] || 0) * b[c];
      }
      delta[r] = sum;
    }
    return { delta, inverse: aInv };
  };

  const fitNonlinearLeastSquares = ({ points, initialParams, predictFromParams, bounds, fixedMask, method, options }) => {
    const maxIterations = Math.max(30, Math.min(2000, Number(options?.maxIterations) || 450));
    const tolerance = Number.isFinite(Number(options?.tolerance)) ? Math.max(Number(options.tolerance), 1e-12) : 1e-8;
    const resolvedMethod = typeof method === 'string' ? method.toLowerCase() : 'ols';
    let params = applyParameterBounds(initialParams.slice(), bounds);
    const locked = Array.isArray(fixedMask) ? fixedMask.map(Boolean) : new Array(params.length).fill(false);
    const freeIndices = [];
    for(let i = 0; i < params.length; i++){
      if(!locked[i]){
        freeIndices.push(i);
      }
    }
    let lambda = Number.isFinite(Number(options?.lambda)) ? Number(options.lambda) : 0.01;
    let best = { params: params.slice(), sse: Infinity, residuals: [], predictions: [], weights: [], jacobian: null, covariance: null };
    let converged = false;
    let iteration = 0;

    if(!freeIndices.length){
      const predictions = points.map(pt => predictFromParams(params, pt.x));
      const residuals = predictions.map((pred, idx) => points[idx].y - pred);
      const weights = buildRegressionWeights({ points, method: resolvedMethod, options, residuals });
      const sse = residuals.reduce((sum, r, idx) => sum + ((weights[idx] || 1) * r * r), 0);
      return {
        params: params.slice(),
        sse,
        residuals,
        predictions,
        weights,
        jacobian: null,
        covarianceBase: null,
        converged: true,
        iterations: 1,
        freeParameterCount: 0
      };
    }

    for(iteration = 1; iteration <= maxIterations; iteration++){
      const predictions = points.map(pt => predictFromParams(params, pt.x));
      const residuals = predictions.map((pred, idx) => points[idx].y - pred);
      const weights = buildRegressionWeights({ points, method: resolvedMethod, options, residuals });
      let sse = 0;
      for(let i = 0; i < residuals.length; i++){
        const r = residuals[i];
        const w = weights[i] || 1;
        sse += w * r * r;
      }
      if(sse < best.sse){
        best = { ...best, params: params.slice(), sse, residuals: residuals.slice(), predictions: predictions.slice(), weights: weights.slice() };
      }
      const jacobian = computeJacobianNumeric({ points, params, predictFromParams });
      const pCount = freeIndices.length;
      const jtWj = Array.from({ length: pCount }, () => new Array(pCount).fill(0));
      const jtWr = new Array(pCount).fill(0);
      for(let i = 0; i < points.length; i++){
        const w = weights[i] || 1;
        const row = jacobian[i];
        const r = residuals[i];
        for(let aIdx = 0; aIdx < pCount; aIdx++){
          const paramA = freeIndices[aIdx];
          const ja = row[paramA];
          jtWr[aIdx] += w * ja * r;
          for(let bIdx = 0; bIdx < pCount; bIdx++){
            const paramB = freeIndices[bIdx];
            jtWj[aIdx][bIdx] += w * ja * row[paramB];
          }
        }
      }
      for(let d = 0; d < pCount; d++){
        jtWj[d][d] += lambda;
      }
      const solved = solveNormalEquations(jtWj, jtWr);
      if(!solved){
        break;
      }
      const delta = solved.delta;
      const deltaNorm = Math.sqrt(delta.reduce((sum,val)=>sum + val * val,0));
      const candidate = params.slice();
      for(let d = 0; d < freeIndices.length; d++){
        const paramIndex = freeIndices[d];
        candidate[paramIndex] = params[paramIndex] + delta[d];
      }
      applyParameterBounds(candidate, bounds);
      const candidatePredictions = points.map(pt => predictFromParams(candidate, pt.x));
      const candidateResiduals = candidatePredictions.map((pred, idx) => points[idx].y - pred);
      const candidateWeights = buildRegressionWeights({ points, method: resolvedMethod, options, residuals: candidateResiduals });
      let candidateSse = 0;
      for(let i = 0; i < candidateResiduals.length; i++){
        candidateSse += (candidateWeights[i] || 1) * candidateResiduals[i] * candidateResiduals[i];
      }
      if(candidateSse < sse){
        params = candidate;
        lambda = Math.max(1e-8, lambda * 0.7);
        if(candidateSse < best.sse){
          best = {
            params: params.slice(),
            sse: candidateSse,
            residuals: candidateResiduals.slice(),
            predictions: candidatePredictions.slice(),
            weights: candidateWeights.slice(),
            jacobian: jacobian.map(row => row.slice()),
            covariance: solved.inverse
          };
        }
        if(deltaNorm < tolerance){
          converged = true;
          break;
        }
      }else{
        lambda = Math.min(1e8, lambda * 2);
        if(deltaNorm < tolerance){
          break;
        }
      }
    }

    let expandedCovariance = null;
    if(best.covariance){
      expandedCovariance = Array.from({ length: params.length }, () => new Array(params.length).fill(0));
      for(let r = 0; r < freeIndices.length; r++){
        for(let c = 0; c < freeIndices.length; c++){
          expandedCovariance[freeIndices[r]][freeIndices[c]] = best.covariance[r]?.[c] ?? 0;
        }
      }
    }

    return {
      params: best.params,
      sse: best.sse,
      residuals: best.residuals,
      predictions: best.predictions,
      weights: best.weights,
      jacobian: best.jacobian,
      covarianceBase: expandedCovariance,
      converged,
      iterations: iteration,
      freeParameterCount: freeIndices.length
    };
  };

  const buildNonlinearCoefficientStats = ({ params, covarianceBase, residuals, alpha, termLabels, effectiveParamCount }) => {
    if(!Array.isArray(params) || !params.length || !covarianceBase || !Array.isArray(residuals)){
      return { stats: [], covariance: null, sigmaSq: NaN, tCritical: NaN, dof: NaN };
    }
    const usedParamCount = Number.isFinite(effectiveParamCount) ? Math.max(0, Math.round(effectiveParamCount)) : params.length;
    const dof = residuals.length - usedParamCount;
    if(dof <= 0){
      return { stats: [], covariance: null, sigmaSq: NaN, tCritical: NaN, dof };
    }
    const sigmaSq = residuals.reduce((sum,val)=>sum + val * val,0) / Math.max(dof, 1);
    const covariance = covarianceBase.map(row => row.map(val => Number.isFinite(val) ? val * sigmaSq : NaN));
    const standardErrors = covariance.map((row, idx) => {
      const variance = row?.[idx];
      return Number.isFinite(variance) && variance >= 0 ? Math.sqrt(variance) : NaN;
    });
    const tDist = jStatLib?.studentt;
    const tCritical = (tDist && typeof tDist.inv === 'function' && dof > 0)
      ? tDist.inv(1 - alpha / 2, dof)
      : NaN;
    const stats = params.map((estimate, idx) => {
      const standardError = standardErrors[idx];
      const tStatistic = Number.isFinite(standardError) && standardError !== 0 ? estimate / standardError : NaN;
      const pValue = (tDist && typeof tDist.cdf === 'function' && Number.isFinite(tStatistic) && dof > 0)
        ? 2 * (1 - tDist.cdf(Math.abs(tStatistic), dof))
        : NaN;
      const ciHalf = Number.isFinite(tCritical) && Number.isFinite(standardError)
        ? tCritical * standardError
        : NaN;
      return {
        term: termLabels?.[idx] || `Param ${idx + 1}`,
        estimate,
        standardError,
        tStatistic,
        pValue,
        ciLow: Number.isFinite(ciHalf) ? estimate - ciHalf : NaN,
        ciHigh: Number.isFinite(ciHalf) ? estimate + ciHalf : NaN
      };
    });
    return { stats, covariance, sigmaSq, tCritical, dof };
  };

  const buildNonlinearIntervals = ({ params, predictFromParams, covariance, sigmaSq, tCritical, domain, sampleCount = 180 }) => {
    if(!covariance || !Number.isFinite(sigmaSq) || !Number.isFinite(tCritical) || !domain){
      return null;
    }
    const minX = Number.isFinite(domain.minX) ? domain.minX : NaN;
    const maxX = Number.isFinite(domain.maxX) ? domain.maxX : NaN;
    if(!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX){
      return null;
    }
    const step = (maxX - minX) / Math.max(1, sampleCount - 1);
    const samples = [];
    let ciMin = Infinity;
    let ciMax = -Infinity;
    let piMin = Infinity;
    let piMax = -Infinity;
    for(let i = 0; i < sampleCount; i++){
      const x = i === sampleCount - 1 ? maxX : (minX + i * step);
      const y = predictFromParams(params, x);
      if(!Number.isFinite(y)){
        continue;
      }
      const gradient = new Array(params.length).fill(0);
      for(let pIdx = 0; pIdx < params.length; pIdx++){
        const base = params[pIdx];
        const h = Math.max(1e-6, Math.abs(base) * 1e-4);
        const plus = params.slice();
        const minus = params.slice();
        plus[pIdx] = base + h;
        minus[pIdx] = base - h;
        const yPlus = predictFromParams(plus, x);
        const yMinus = predictFromParams(minus, x);
        if(Number.isFinite(yPlus) && Number.isFinite(yMinus)){
          gradient[pIdx] = (yPlus - yMinus) / (2 * h);
        }
      }
      let meanVariance = 0;
      for(let r = 0; r < gradient.length; r++){
        for(let c = 0; c < gradient.length; c++){
          const cov = covariance[r]?.[c];
          if(Number.isFinite(cov)){
            meanVariance += gradient[r] * cov * gradient[c];
          }
        }
      }
      const meanSe = meanVariance >= 0 ? Math.sqrt(meanVariance) : NaN;
      const predSe = Number.isFinite(meanVariance) ? Math.sqrt(Math.max(meanVariance + sigmaSq, 0)) : NaN;
      const ciHalf = Number.isFinite(meanSe) ? tCritical * meanSe : NaN;
      const piHalf = Number.isFinite(predSe) ? tCritical * predSe : NaN;
      const ciLow = Number.isFinite(ciHalf) ? y - ciHalf : NaN;
      const ciHigh = Number.isFinite(ciHalf) ? y + ciHalf : NaN;
      const piLow = Number.isFinite(piHalf) ? y - piHalf : NaN;
      const piHigh = Number.isFinite(piHalf) ? y + piHalf : NaN;
      if(Number.isFinite(ciLow)) ciMin = Math.min(ciMin, ciLow);
      if(Number.isFinite(ciHigh)) ciMax = Math.max(ciMax, ciHigh);
      if(Number.isFinite(piLow)) piMin = Math.min(piMin, piLow);
      if(Number.isFinite(piHigh)) piMax = Math.max(piMax, piHigh);
      samples.push({ x, y, ciLow, ciHigh, piLow, piHigh });
    }
    if(!samples.length){
      return null;
    }
    return {
      samples,
      summary: {
        ciMin: Number.isFinite(ciMin) ? ciMin : NaN,
        ciMax: Number.isFinite(ciMax) ? ciMax : NaN,
        piMin: Number.isFinite(piMin) ? piMin : NaN,
        piMax: Number.isFinite(piMax) ? piMax : NaN
      }
    };
  };

  const computeLinearThroughOriginModel = ({ points, xVals, yVals, sst, alpha, domain }) => {
    const denominator = xVals.reduce((sum,x)=>sum + x * x, 0);
    if(denominator === 0){
      return null;
    }
    const slope = xVals.reduce((sum,x,idx)=>sum + x * yVals[idx], 0) / denominator;
    const intercept = 0;
    const predictions = xVals.map(x => slope * x);
    const residuals = predictions.map((pred, idx) => yVals[idx] - pred);
    const sse = residuals.reduce((sum,val)=>sum + val * val, 0);
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const rmse = Math.sqrt(sse / Math.max(points.length, 1));
    const diagnostics = computeResidualDiagnostics(residuals);
    let coefficientStats = [];
    if(hasMatrixOps){
      const design = points.map(pt => [pt.x]);
      const solved = solveLeastSquares(design, yVals.map(val => [val]));
      if(solved?.xtxInv){
        coefficientStats = buildCoefficientStats({
          coefficients: [slope],
          xtxInv: solved.xtxInv,
          residuals,
          alpha,
          termLabels: ['Slope'],
          degreesOfFreedom: points.length - 1
        });
      }
    }
    return {
      mode: 'linearThroughOrigin',
      coefficients: [slope],
      metrics: {
        sampleSize: points.length,
        predictors: 1,
        sse,
        sst,
        r2,
        adjR2: points.length > 2 ? 1 - (1 - r2) * ((points.length - 1) / (points.length - 2)) : r2,
        rmse,
        mae: residuals.reduce((sum,val)=>sum + Math.abs(val),0) / Math.max(points.length, 1)
      },
      residuals: summarizeResiduals(residuals),
      predictions,
      predict: x => slope * x,
      diagnostics,
      coefficientStats,
      intervals: null,
      summary: {
        intercept,
        slope,
        equation: `y = ${slope.toFixed(4)}x`,
        parameters: {
          Slope: slope,
          Intercept: 0
        },
        primaryParameter: {
          label: 'Slope',
          value: slope
        }
      },
      domain
    };
  };

  const createModelRegistry = () => ([
    { id: 'linear', family: 'Lines', label: 'Linear', implemented: true },
    { id: 'linearThroughOrigin', family: 'Lines', label: 'Linear (through origin)', implemented: true },
    { id: 'quadratic', family: 'Polynomial', label: 'Quadratic', implemented: true },
    { id: 'cubic', family: 'Polynomial', label: 'Cubic', implemented: true },
    { id: 'exponential', family: 'Exponential', label: 'Exponential', implemented: true },
    { id: 'onePhaseAssociation', family: 'Exponential', label: 'One-phase association', implemented: true },
    { id: 'onePhaseDecay', family: 'Exponential', label: 'One-phase decay', implemented: true },
    { id: 'power', family: 'Classic', label: 'Power', implemented: true },
    { id: 'spline', family: 'Curves', label: 'Spline', implemented: true },
    { id: 'logistic', family: 'Dose-response', label: 'Logistic', implemented: true },
    { id: 'doseResponse3pl', family: 'Dose-response', label: '3PL dose-response', implemented: true },
    { id: 'doseResponse4pl', family: 'Dose-response', label: '4PL dose-response', implemented: true },
    { id: 'doseResponse5pl', family: 'Dose-response', label: '5PL dose-response', implemented: true },
    { id: 'gaussian', family: 'Gaussian', label: 'Gaussian', implemented: true },
    { id: 'gompertz', family: 'Growth', label: 'Gompertz growth', implemented: true },
    { id: 'arima', family: 'Forecasting', label: 'ARIMA', implemented: true },
    { id: 'holtWinters', family: 'Forecasting', label: 'Holt-Winters', implemented: true },
    { id: 'bindingSaturation', family: 'Binding', label: 'Binding - saturation', implemented: true },
    { id: 'bindingCompetitive', family: 'Binding', label: 'Binding - competitive', implemented: true },
    { id: 'enzymeKineticsSubstrate', family: 'Enzyme kinetics', label: 'Velocity as function of substrate', implemented: true },
    { id: 'enzymeKineticsInhibition', family: 'Enzyme kinetics', label: 'Enzyme inhibition', implemented: true },
    { id: 'sineWave', family: 'Sine waves', label: 'Sine wave', implemented: false }
  ]);

  const MODEL_REGISTRY = createModelRegistry();
  const MODEL_INDEX = MODEL_REGISTRY.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const MODEL_ALIASES = {
    linear: 'linear',
    line: 'linear',
    linearthroughorigin: 'linearThroughOrigin',
    quadratic: 'quadratic',
    cubic: 'cubic',
    exponential: 'exponential',
    onephaseassociation: 'onePhaseAssociation',
    onephasedecay: 'onePhaseDecay',
    power: 'power',
    spline: 'spline',
    logistic: 'logistic',
    doseresponse3pl: 'doseResponse3pl',
    doseresponse4pl: 'doseResponse4pl',
    doseresponse5pl: 'doseResponse5pl',
    gaussian: 'gaussian',
    gompertz: 'gompertz',
    bindingsaturation: 'bindingSaturation',
    bindingcompetitive: 'bindingCompetitive',
    enzymekineticssubstrate: 'enzymeKineticsSubstrate',
    enzymekineticsinhibition: 'enzymeKineticsInhibition',
    arima: 'arima',
    holtwinters: 'holtWinters'
  };

  const resolveModelId = (candidate) => {
    const raw = typeof candidate === 'string' ? candidate.trim() : '';
    if(!raw){
      return 'linear';
    }
    const normalized = raw.toLowerCase();
    return MODEL_ALIASES[normalized] || raw;
  };

  const normalizeFitSpec = (options = {}) => {
    const source = options?.fitSpec && typeof options.fitSpec === 'object'
      ? options.fitSpec
      : {};
    const confidenceLevelRaw = Number(source.confidenceLevel);
    const confidenceLevel = Number.isFinite(confidenceLevelRaw)
      ? Math.max(1, Math.min(99.9, confidenceLevelRaw))
      : null;
    const alphaFromLevel = Number.isFinite(confidenceLevel) ? (1 - confidenceLevel / 100) : null;
    const alphaRaw = Number(source.alpha);
    const alpha = Number.isFinite(alphaRaw) && alphaRaw > 0 && alphaRaw < 1
      ? alphaRaw
      : (Number.isFinite(alphaFromLevel) && alphaFromLevel > 0 && alphaFromLevel < 1 ? alphaFromLevel : null);
    const rangeRaw = source.range && typeof source.range === 'object' ? source.range : null;
    const minRaw = rangeRaw?.minX;
    const maxRaw = rangeRaw?.maxX;
    const minX = (minRaw === '' || minRaw == null) ? NaN : Number(minRaw);
    const maxX = (maxRaw === '' || maxRaw == null) ? NaN : Number(maxRaw);
    const range = (Number.isFinite(minX) || Number.isFinite(maxX))
      ? {
          minX: Number.isFinite(minX) ? minX : NaN,
          maxX: Number.isFinite(maxX) ? maxX : NaN
        }
      : null;
    return {
      raw: source,
      alpha,
      confidenceLevel,
      range
    };
  };

  const resolveParamIndex = (key, labels) => {
    if(Number.isInteger(key)){
      return key;
    }
    if(typeof key === 'string'){
      const numeric = Number(key);
      if(Number.isInteger(numeric)){
        return numeric;
      }
      const normalized = key.trim().toLowerCase();
      const index = Array.isArray(labels)
        ? labels.findIndex(label => String(label || '').trim().toLowerCase() === normalized)
        : -1;
      if(index >= 0){
        return index;
      }
    }
    return -1;
  };

  const applyFitSpecToParameters = ({ initial, bounds, paramLabels, fitSpec }) => {
    const init = Array.isArray(initial) ? initial.slice() : [];
    const lower = Array.isArray(bounds?.lower) ? bounds.lower.slice() : new Array(init.length).fill(-Infinity);
    const upper = Array.isArray(bounds?.upper) ? bounds.upper.slice() : new Array(init.length).fill(Infinity);
    const fixedMask = new Array(init.length).fill(false);
    const raw = fitSpec?.raw && typeof fitSpec.raw === 'object' ? fitSpec.raw : {};

    if(Array.isArray(raw.initialValues)){
      raw.initialValues.forEach((value, idx) => {
        if(idx < init.length && Number.isFinite(Number(value))){
          init[idx] = Number(value);
        }
      });
    }else if(raw.initialValues && typeof raw.initialValues === 'object'){
      Object.keys(raw.initialValues).forEach(key => {
        const index = resolveParamIndex(key, paramLabels);
        const value = Number(raw.initialValues[key]);
        if(index >= 0 && index < init.length && Number.isFinite(value)){
          init[index] = value;
        }
      });
    }

    const boundsRaw = raw.bounds && typeof raw.bounds === 'object' ? raw.bounds : null;
    if(boundsRaw){
      if(Array.isArray(boundsRaw.lower)){
        boundsRaw.lower.forEach((value, idx) => {
          const parsed = Number(value);
          if(idx < lower.length && Number.isFinite(parsed)){
            lower[idx] = parsed;
          }
        });
      }
      if(Array.isArray(boundsRaw.upper)){
        boundsRaw.upper.forEach((value, idx) => {
          const parsed = Number(value);
          if(idx < upper.length && Number.isFinite(parsed)){
            upper[idx] = parsed;
          }
        });
      }
    }

    const fixedRaw = raw.fixedParameters;
    if(Array.isArray(fixedRaw)){
      fixedRaw.forEach((isFixed, idx) => {
        if(idx < fixedMask.length){
          fixedMask[idx] = !!isFixed;
        }
      });
    }else if(fixedRaw && typeof fixedRaw === 'object'){
      Object.keys(fixedRaw).forEach(key => {
        const index = resolveParamIndex(key, paramLabels);
        if(index >= 0 && index < fixedMask.length){
          fixedMask[index] = !!fixedRaw[key];
        }
      });
    }

    const parametersRaw = raw.parameters && typeof raw.parameters === 'object' ? raw.parameters : null;
    if(parametersRaw){
      Object.keys(parametersRaw).forEach(key => {
        const index = resolveParamIndex(key, paramLabels);
        const entry = parametersRaw[key];
        if(index < 0 || index >= init.length || !entry || typeof entry !== 'object'){
          return;
        }
        const initialValue = Number(entry.initial ?? entry.value);
        if(Number.isFinite(initialValue)){
          init[index] = initialValue;
        }
        const lo = Number(entry.lower);
        const hi = Number(entry.upper);
        if(Number.isFinite(lo)){
          lower[index] = lo;
        }
        if(Number.isFinite(hi)){
          upper[index] = hi;
        }
        if(typeof entry.fixed === 'boolean'){
          fixedMask[index] = entry.fixed;
        }
      });
    }

    for(let i = 0; i < init.length; i++){
      if(Number.isFinite(lower[i]) && init[i] < lower[i]){
        init[i] = lower[i];
      }
      if(Number.isFinite(upper[i]) && init[i] > upper[i]){
        init[i] = upper[i];
      }
      if(fixedMask[i]){
        if(Number.isFinite(init[i])){
          lower[i] = init[i];
          upper[i] = init[i];
        }else{
          fixedMask[i] = false;
        }
      }
    }

    return {
      initial: init,
      bounds: { lower, upper },
      fixedMask
    };
  };

  const appendModelWarning = (model, message) => {
    if(!model || !message){
      return;
    }
    const warnings = Array.isArray(model.warnings) ? model.warnings : [];
    if(!warnings.includes(message)){
      warnings.push(message);
    }
    model.warnings = warnings;
  };

  const addRegressionStabilityWarnings = (model) => {
    if(!model || typeof model !== 'object'){
      return model;
    }
    const metrics = model.metrics || {};
    const sampleSize = Number(metrics.sampleSize);
    const predictors = Number(metrics.predictors);
    if(Number.isFinite(sampleSize) && Number.isFinite(predictors) && sampleSize <= predictors + 1){
      appendModelWarning(model, 'Model may be over-parameterized for the available sample size.');
    }
    const coeffs = Array.isArray(model.coefficients) ? model.coefficients : [];
    const largeCoeff = coeffs.find(value => Number.isFinite(value) && Math.abs(value) > 1e9);
    if(Number.isFinite(largeCoeff)){
      appendModelWarning(model, 'Large coefficient magnitudes detected; model may be numerically unstable.');
    }
    const nonFiniteCoeff = coeffs.find(value => !Number.isFinite(value));
    if(typeof nonFiniteCoeff !== 'undefined'){
      appendModelWarning(model, 'Non-finite coefficient estimates detected.');
    }
    if(Number.isFinite(metrics.r2) && (metrics.r2 > 1.000001 || metrics.r2 < -0.000001)){
      appendModelWarning(model, 'R² is outside the expected range; verify model assumptions.');
    }
    if(Array.isArray(model.predictions)){
      const invalidPredictionCount = model.predictions.reduce((count, value) => count + (Number.isFinite(value) ? 0 : 1), 0);
      if(invalidPredictionCount > 0){
        appendModelWarning(model, `Detected ${invalidPredictionCount} non-finite fitted values.`);
      }
    }
    if(model.intervals?.summary){
      const summary = model.intervals.summary;
      const ciSpan = Number(summary.ciMax) - Number(summary.ciMin);
      const piSpan = Number(summary.piMax) - Number(summary.piMin);
      if(Number.isFinite(ciSpan) && Number.isFinite(piSpan) && piSpan > 0 && ciSpan > (piSpan * 1.2)){
        appendModelWarning(model, 'Confidence interval span appears unusually wide relative to prediction interval span.');
      }
    }
    if(model.domain && typeof model.predict === 'function'){
      const minX = Number(model.domain.minX);
      const maxX = Number(model.domain.maxX);
      if(Number.isFinite(minX) && Number.isFinite(maxX) && minX !== maxX){
        const yMin = model.predict(minX);
        const yMax = model.predict(maxX);
        if(!Number.isFinite(yMin) || !Number.isFinite(yMax)){
          appendModelWarning(model, 'Model produced non-finite predictions at the fitted domain boundaries.');
        }
      }
    }
    return model;
  };

  const buildNonlinearModel = ({ points, domain, alpha, method, options, spec }) => {
    const yVals = points.map(pt => pt.y);
    const xVals = points.map(pt => pt.x);
    const yMean = jStatLib.mean(yVals);
    const sst = yVals.reduce((sum,val)=>sum + Math.pow(val - yMean, 2), 0);
    const fitSpec = normalizeFitSpec(options);
    const initial = spec.initial(points, options);
    if(!Array.isArray(initial) || initial.some(v => !Number.isFinite(v))){
      return null;
    }
    const baseBounds = spec.bounds ? spec.bounds(points, options) : null;
    const constrained = applyFitSpecToParameters({
      initial,
      bounds: baseBounds,
      paramLabels: spec.paramLabels || [],
      fitSpec
    });
    const fit = fitNonlinearLeastSquares({
      points,
      initialParams: constrained.initial,
      predictFromParams: spec.predict,
      bounds: constrained.bounds,
      fixedMask: constrained.fixedMask,
      method,
      options
    });
    if(!Array.isArray(fit.params) || !fit.params.length || !Number.isFinite(fit.sse)){
      return null;
    }
    const coefficientInfo = buildNonlinearCoefficientStats({
      params: fit.params,
      covarianceBase: fit.covarianceBase,
      residuals: fit.residuals,
      alpha,
      termLabels: spec.paramLabels,
      effectiveParamCount: fit.freeParameterCount
    });
    const intervalInfo = buildNonlinearIntervals({
      params: fit.params,
      predictFromParams: spec.predict,
      covariance: coefficientInfo.covariance,
      sigmaSq: coefficientInfo.sigmaSq,
      tCritical: coefficientInfo.tCritical,
      domain
    });
    const r2 = sst === 0 ? 1 : 1 - (fit.sse / sst);
    const pCount = fit.params.length;
    const summary = spec.summary(fit.params);
    const warnings = [];
    if(!fit.converged){
      warnings.push('Optimization did not fully converge; review parameter estimates with caution.');
    }
    if(method && String(method).toLowerCase() !== 'ols'){
      warnings.push(`Model fitted using ${String(method).toUpperCase()} weighting.`);
    }
    if(Array.isArray(constrained.fixedMask) && constrained.fixedMask.some(Boolean)){
      warnings.push('One or more parameters were fixed during fitting.');
    }
    return {
      mode: spec.mode,
      coefficients: fit.params.slice(),
      domain,
      metrics: {
        sampleSize: points.length,
        predictors: pCount,
        sse: fit.sse,
        sst,
        r2,
        adjR2: points.length > (pCount + 1) ? 1 - (1 - r2) * ((points.length - 1) / (points.length - pCount - 1)) : r2,
        rmse: Math.sqrt(fit.sse / Math.max(points.length, 1)),
        mae: fit.residuals.reduce((sum,val)=>sum + Math.abs(val),0) / Math.max(points.length, 1),
        iterations: fit.iterations
      },
      residuals: summarizeResiduals(fit.residuals),
      predictions: fit.predictions.slice(),
      predict: x => spec.predict(fit.params, x),
      diagnostics: computeResidualDiagnostics(fit.residuals),
      coefficientStats: coefficientInfo.stats,
      intervals: intervalInfo ? {
        alpha,
        tCritical: coefficientInfo.tCritical,
        degreesOfFreedom: coefficientInfo.dof,
        samples: intervalInfo.samples,
        summary: intervalInfo.summary
      } : null,
      summary,
      warnings
    };
  };

  const computeGaussianModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'gaussian',
      paramLabels: ['Baseline', 'Amplitude', 'Center', 'Sigma'],
      initial: (list) => {
        const ys = list.map(pt => pt.y);
        const xs = list.map(pt => pt.x);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const maxIdx = ys.indexOf(maxY);
        const center = maxIdx >= 0 ? xs[maxIdx] : jStatLib.mean(xs);
        const sigma = Math.max((Math.max(...xs) - Math.min(...xs)) / 6, 1e-3);
        return [minY, maxY - minY, center, sigma];
      },
      bounds: () => ({ lower: [-Infinity, -Infinity, -Infinity, 1e-9], upper: [Infinity, Infinity, Infinity, Infinity] }),
      predict: (params, x) => {
        const baseline = params[0];
        const amplitude = params[1];
        const center = params[2];
        const sigma = clampPositive(params[3], 1e-9);
        const z = (x - center) / sigma;
        return baseline + amplitude * Math.exp(-0.5 * z * z);
      },
      summary: (params) => ({
        intercept: params[0],
        slope: params[1],
        equation: 'y = baseline + amplitude * exp(-0.5*((x-center)/sigma)^2)',
        parameters: {
          Baseline: params[0],
          Amplitude: params[1],
          Center: params[2],
          Sigma: params[3]
        },
        primaryParameter: { label: 'Center', value: params[2] }
      })
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeOnePhaseAssociationModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'onePhaseAssociation',
      paramLabels: ['Y0', 'Plateau', 'K'],
      initial: (list) => {
        const xs = list.map(pt => pt.x);
        const ys = list.map(pt => pt.y);
        const xRange = Math.max(1e-6, Math.max(...xs) - Math.min(...xs));
        return [ys[0], ys[ys.length - 1], 1 / xRange];
      },
      bounds: () => ({ lower: [-Infinity, -Infinity, 1e-9], upper: [Infinity, Infinity, Infinity] }),
      predict: (params, x) => {
        const y0 = params[0];
        const plateau = params[1];
        const k = clampPositive(params[2], 1e-9);
        return y0 + (plateau - y0) * (1 - Math.exp(-k * x));
      },
      summary: (params) => ({
        intercept: params[0],
        slope: params[2],
        equation: 'y = Y0 + (Plateau - Y0) * (1 - exp(-K*x))',
        parameters: { Y0: params[0], Plateau: params[1], K: params[2] },
        primaryParameter: { label: 'K', value: params[2] }
      })
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeOnePhaseDecayModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'onePhaseDecay',
      paramLabels: ['Y0', 'Plateau', 'K'],
      initial: (list) => {
        const xs = list.map(pt => pt.x);
        const ys = list.map(pt => pt.y);
        const xRange = Math.max(1e-6, Math.max(...xs) - Math.min(...xs));
        return [ys[0], ys[ys.length - 1], 1 / xRange];
      },
      bounds: () => ({ lower: [-Infinity, -Infinity, 1e-9], upper: [Infinity, Infinity, Infinity] }),
      predict: (params, x) => {
        const y0 = params[0];
        const plateau = params[1];
        const k = clampPositive(params[2], 1e-9);
        return plateau + (y0 - plateau) * Math.exp(-k * x);
      },
      summary: (params) => ({
        intercept: params[0],
        slope: params[2],
        equation: 'y = Plateau + (Y0 - Plateau) * exp(-K*x)',
        parameters: { Y0: params[0], Plateau: params[1], K: params[2] },
        primaryParameter: { label: 'K', value: params[2] }
      })
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeGompertzModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'gompertz',
      paramLabels: ['Lower', 'Upper', 'K', 'X0'],
      initial: (list) => {
        const xs = list.map(pt => pt.x);
        const ys = list.map(pt => pt.y);
        const lower = Math.min(...ys);
        const upper = Math.max(...ys);
        const k = 1 / Math.max(1e-6, Math.max(...xs) - Math.min(...xs));
        return [lower, upper, k, jStatLib.mean(xs)];
      },
      bounds: () => ({ lower: [-Infinity, -Infinity, 1e-9, -Infinity], upper: [Infinity, Infinity, Infinity, Infinity] }),
      predict: (params, x) => {
        const lower = params[0];
        const upper = params[1];
        const k = clampPositive(params[2], 1e-9);
        const x0 = params[3];
        const span = upper - lower;
        return lower + span * Math.exp(-Math.exp(-k * (x - x0)));
      },
      summary: (params) => ({
        intercept: params[0],
        slope: params[2],
        equation: 'y = Lower + (Upper-Lower) * exp(-exp(-K*(x-X0)))',
        parameters: { Lower: params[0], Upper: params[1], K: params[2], X0: params[3] },
        primaryParameter: { label: 'K', value: params[2] }
      })
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeBindingSaturationModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'bindingSaturation',
      paramLabels: ['Bmax', 'Kd', 'NS'],
      initial: (list) => {
        const xs = list.map(pt => pt.x);
        const ys = list.map(pt => pt.y);
        const maxY = Math.max(...ys);
        const medianX = xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length / 2)] || 1;
        return [maxY, Math.max(1e-6, medianX), 0];
      },
      bounds: () => ({ lower: [0, 1e-12, -Infinity], upper: [Infinity, Infinity, Infinity] }),
      predict: (params, x) => {
        const bmax = params[0];
        const kd = clampPositive(params[1], 1e-12);
        const ns = params[2];
        return (bmax * x) / (kd + x) + (ns * x);
      },
      summary: (params) => ({
        intercept: 0,
        slope: params[2],
        equation: 'y = (Bmax*x)/(Kd + x) + NS*x',
        parameters: { Bmax: params[0], Kd: params[1], NS: params[2] },
        primaryParameter: { label: 'Kd', value: params[1] }
      })
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeBindingCompetitiveModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'bindingCompetitive',
      paramLabels: ['Top', 'Bottom', 'IC50', 'HillSlope'],
      initial: (list) => {
        const ys = list.map(pt => pt.y);
        const xs = list.map(pt => pt.x);
        const midX = xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length / 2)] || 1;
        return [Math.max(...ys), Math.min(...ys), Math.max(1e-9, Math.abs(midX)), 1];
      },
      bounds: () => ({ lower: [-Infinity, -Infinity, 1e-12, 0.01], upper: [Infinity, Infinity, Infinity, 8] }),
      predict: (params, x) => {
        const top = params[0];
        const bottom = params[1];
        const ic50 = clampPositive(params[2], 1e-12);
        const hill = clampPositive(params[3], 0.01);
        const ratio = Math.pow(Math.max(0, x) / ic50, hill);
        return bottom + ((top - bottom) / (1 + ratio));
      },
      summary: (params) => ({
        intercept: params[1],
        slope: -params[3],
        equation: 'y = Bottom + (Top-Bottom)/(1 + (x/IC50)^HillSlope)',
        parameters: { Top: params[0], Bottom: params[1], IC50: params[2], HillSlope: params[3] },
        primaryParameter: { label: 'IC50', value: params[2] }
      })
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeEnzymeKineticsSubstrateModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'enzymeKineticsSubstrate',
      paramLabels: ['Vmax', 'Km', 'Baseline'],
      initial: (list) => {
        const ys = list.map(pt => pt.y);
        const xs = list.map(pt => pt.x);
        const sortedX = xs.slice().sort((a,b)=>a-b);
        const midX = sortedX[Math.floor(sortedX.length / 2)] || 1;
        return [Math.max(...ys), Math.max(1e-6, midX), Math.min(...ys) * 0.05];
      },
      bounds: () => ({ lower: [0, 1e-12, -Infinity], upper: [Infinity, Infinity, Infinity] }),
      predict: (params, x) => {
        const vmax = params[0];
        const km = clampPositive(params[1], 1e-12);
        const baseline = params[2];
        return baseline + (vmax * Math.max(0, x)) / (km + Math.max(0, x));
      },
      summary: (params) => ({
        intercept: params[2],
        slope: params[0],
        equation: 'v = Baseline + (Vmax*[S])/(Km + [S])',
        parameters: { Vmax: params[0], Km: params[1], Baseline: params[2] },
        primaryParameter: { label: 'Km', value: params[1] }
      })
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeEnzymeKineticsInhibitionModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'enzymeKineticsInhibition',
      paramLabels: ['Vmax', 'IC50', 'HillSlope', 'Baseline'],
      initial: (list) => {
        const ys = list.map(pt => pt.y);
        const xs = list.map(pt => pt.x);
        const midX = xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length / 2)] || 1;
        return [Math.max(...ys), Math.max(1e-9, Math.abs(midX)), 1, Math.min(...ys)];
      },
      bounds: () => ({ lower: [-Infinity, 1e-12, 0.01, -Infinity], upper: [Infinity, Infinity, 8, Infinity] }),
      predict: (params, x) => {
        const vmax = params[0];
        const ic50 = clampPositive(params[1], 1e-12);
        const hill = clampPositive(params[2], 0.01);
        const baseline = params[3];
        const ratio = Math.pow(Math.max(0, x) / ic50, hill);
        return baseline + (vmax / (1 + ratio));
      },
      summary: (params) => ({
        intercept: params[3],
        slope: -params[2],
        equation: 'v = Baseline + Vmax/(1 + ([I]/IC50)^HillSlope)',
        parameters: { Vmax: params[0], IC50: params[1], HillSlope: params[2], Baseline: params[3] },
        primaryParameter: { label: 'IC50', value: params[1] }
      })
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeDoseResponse3PLModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'doseResponse3pl',
      paramLabels: ['Top', 'LogIC50', 'HillSlope'],
      initial: (list) => {
        const xs = list.map(pt => pt.x);
        const ys = list.map(pt => pt.y);
        const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
        const near = list.reduce((best, pt) => {
          const d = Math.abs(pt.y - midY);
          if(!best || d < best.d){
            return { d, x: pt.x };
          }
          return best;
        }, null);
        return [Math.max(...ys), near?.x ?? jStatLib.mean(xs), -1];
      },
      bounds: () => ({ lower: [-Infinity, -Infinity, -12], upper: [Infinity, Infinity, 12] }),
      predict: (params, x) => {
        const top = params[0];
        const logIC50 = params[1];
        const hill = params[2];
        const denom = 1 + safePow10((logIC50 - x) * hill);
        return top / denom;
      },
      summary: (params) => {
        const ic50 = safePow10(params[1]);
        return {
          intercept: 0,
          slope: params[2],
          equation: 'y = Top / (1 + 10^((LogIC50 - x) * HillSlope))',
          parameters: { Bottom: 0, Top: params[0], LogIC50: params[1], IC50: ic50, HillSlope: params[2] },
          primaryParameter: { label: 'IC50', value: ic50 }
        };
      }
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
  };

  const computeDoseResponse5PLModel = ({ points, alpha, domain, method, options }) => {
    const spec = {
      mode: 'doseResponse5pl',
      paramLabels: ['Bottom', 'Top', 'LogIC50', 'HillSlope', 'Asymmetry'],
      initial: (list) => {
        const xs = list.map(pt => pt.x);
        const ys = list.map(pt => pt.y);
        const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
        const near = list.reduce((best, pt) => {
          const d = Math.abs(pt.y - midY);
          if(!best || d < best.d){
            return { d, x: pt.x };
          }
          return best;
        }, null);
        return [Math.min(...ys), Math.max(...ys), near?.x ?? jStatLib.mean(xs), -1, 1];
      },
      bounds: () => ({ lower: [-Infinity, -Infinity, -Infinity, -12, 0.1], upper: [Infinity, Infinity, Infinity, 12, 10] }),
      predict: (params, x) => {
        const bottom = params[0];
        const top = params[1];
        const logIC50 = params[2];
        const hill = params[3];
        const asym = clampPositive(params[4], 0.1);
        const base = 1 + safePow10((logIC50 - x) * hill);
        return bottom + (top - bottom) / Math.pow(base, asym);
      },
      summary: (params) => {
        const ic50 = safePow10(params[2]);
        return {
          intercept: params[0],
          slope: params[3],
          equation: 'y = Bottom + (Top-Bottom) / (1 + 10^((LogIC50-x)*HillSlope))^Asymmetry',
          parameters: {
            Bottom: params[0],
            Top: params[1],
            LogIC50: params[2],
            IC50: ic50,
            HillSlope: params[3],
            Asymmetry: params[4]
          },
          primaryParameter: { label: 'IC50', value: ic50 }
        };
      }
    };
    return buildNonlinearModel({ points, domain, alpha, method, options, spec });
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

  if(!regressionTools.listModels){
    regressionTools.listModels = function listRegressionModels(){
      return MODEL_REGISTRY.map(item => ({ ...item }));
    };
  }

  if(!regressionTools.getModelInfo){
    regressionTools.getModelInfo = function getRegressionModelInfo(modelId){
      const resolved = resolveModelId(modelId);
      return MODEL_INDEX[resolved] ? { ...MODEL_INDEX[resolved] } : null;
    };
  }

  if(!regressionTools.fitRegression){
    regressionTools.fitRegression = function fitRegression(points, options = {}){
      const allPoints = Array.isArray(points) ? points.filter(pt => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) : [];
      const requestedModel = options.modelId || options.mode || 'linear';
      const mode = resolveModelId(requestedModel);
      const modelInfo = MODEL_INDEX[mode] || null;
      const fitSpec = normalizeFitSpec(options);
      const alpha = Number.isFinite(fitSpec.alpha)
        ? fitSpec.alpha
        : (Number.isFinite(options.alpha) && options.alpha > 0 && options.alpha < 1 ? options.alpha : 0.05);
      const method = typeof options.method === 'string' ? options.method.toLowerCase() : 'ols';
      const cleanPoints = fitSpec.range
        ? allPoints.filter(pt => {
            const meetsMin = !Number.isFinite(fitSpec.range.minX) || pt.x >= fitSpec.range.minX;
            const meetsMax = !Number.isFinite(fitSpec.range.maxX) || pt.x <= fitSpec.range.maxX;
            return meetsMin && meetsMax;
          })
        : allPoints;
      const sampleSize = cleanPoints.length;
      const domain = allPoints.reduce((acc, pt) => {
        if(!acc){
          return { minX: pt.x, maxX: pt.x };
        }
        return {
          minX: Math.min(acc.minX, pt.x),
          maxX: Math.max(acc.maxX, pt.x)
        };
      }, null);
      console.debug('Debug:', debugNs, 'fit input', { mode, sampleSize, method });
      if(sampleSize < 2 || !jStatLib){
        return {
          mode,
          coefficients: [],
          metrics: { sampleSize },
          residuals: { mean: NaN, sd: NaN, min: NaN, max: NaN },
          warnings: ['Insufficient data or jStat unavailable'],
          domain,
          fitSpec: fitSpec.raw
        };
      }
      const xVals = cleanPoints.map(pt => pt.x);
      const yVals = cleanPoints.map(pt => pt.y);
      const yMean = jStatLib.mean(yVals);
      const sst = yVals.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
      const forecastOptions = options.forecast || {};
      let model;
      if(modelInfo && modelInfo.implemented === false){
        model = computeLinearModel({ points: cleanPoints, xVals, yVals, sst, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
        if(model){
          model.warnings = (model.warnings || []).concat([`Model "${modelInfo.label}" is not implemented yet; used linear regression fallback.`]);
        }
      }
      if(!model && mode === 'arima'){
        model = computeArimaModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, forecast: forecastOptions });
      }else if(!model && mode === 'holtWinters'){
        model = computeHoltWintersModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, forecast: forecastOptions });
      }else if(!model && mode === 'linearThroughOrigin'){
        model = computeLinearThroughOriginModel({ points: cleanPoints, xVals, yVals, sst, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
      }else if(!model && mode === 'logistic'){
        const preferDoseResponse = options.preferDoseResponse === true;
        if(preferDoseResponse && !isLikelyBinaryResponse(cleanPoints)){
          model = computeDoseResponse4PLModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
          if(model){
            model.warnings = (model.warnings || []).concat(['Applied a four-parameter dose-response fit to estimate IC50.']);
          }
        }
        if(!model){
          model = computeLogisticModel({ points: cleanPoints, alpha, domain });
        }
      }else if(!model && mode === 'doseResponse3pl'){
        model = computeDoseResponse3PLModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'doseResponse4pl'){
        model = computeDoseResponse4PLModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
      }else if(!model && mode === 'doseResponse5pl'){
        model = computeDoseResponse5PLModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && (mode === 'quadratic' || mode === 'cubic')){
        const degree = mode === 'quadratic' ? 2 : 3;
        model = computePolynomialModel({ points: cleanPoints, degree, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, xVals, yVals, sst });
      }else if(!model && mode === 'exponential'){
        model = computeExponentialModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
      }else if(!model && mode === 'onePhaseAssociation'){
        model = computeOnePhaseAssociationModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'onePhaseDecay'){
        model = computeOnePhaseDecayModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'power'){
        model = computePowerModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) } });
      }else if(!model && mode === 'gaussian'){
        model = computeGaussianModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'gompertz'){
        model = computeGompertzModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'bindingSaturation'){
        model = computeBindingSaturationModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'bindingCompetitive'){
        model = computeBindingCompetitiveModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'enzymeKineticsSubstrate'){
        model = computeEnzymeKineticsSubstrateModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'enzymeKineticsInhibition'){
        model = computeEnzymeKineticsInhibitionModel({ points: cleanPoints, alpha, domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) }, method, options });
      }else if(!model && mode === 'spline'){
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
      model.mode = model.mode || mode;
      model.fitMethod = method;
      model.fitSpec = fitSpec.raw;
      if(fitSpec.range && (Number.isFinite(fitSpec.range.minX) || Number.isFinite(fitSpec.range.maxX))){
        model.warnings = (model.warnings || []).concat(['Fit range filtering applied.']);
      }
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
      addRegressionStabilityWarnings(model);
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
        fitMethod: model.fitMethod || 'ols',
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
        } : null,
        fitSpec: model.fitSpec && typeof model.fitSpec === 'object' ? {
          confidenceLevel: ensureFiniteNumber(model.fitSpec.confidenceLevel),
          alpha: ensureFiniteNumber(model.fitSpec.alpha),
          range: model.fitSpec.range && typeof model.fitSpec.range === 'object' ? {
            minX: ensureFiniteNumber(model.fitSpec.range.minX),
            maxX: ensureFiniteNumber(model.fitSpec.range.maxX)
          } : null
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
      const defaultSampleCount = (model.mode === 'logistic' || model.mode === 'doseResponse4pl') ? 200 : 150;
      const sampleCount = Math.max(2, options.sampleCount || defaultSampleCount);
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
