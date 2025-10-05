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
      let model;
      if(mode === 'logistic'){
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
          iterations: ensureFiniteNumber(metrics.iterations)
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
        warnings: Array.isArray(model.warnings) ? model.warnings.slice() : []
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
