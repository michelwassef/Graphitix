(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const scatter = Components.scatter = Components.scatter || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  scatter.__installed = true;
  scatter.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: scatter component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: scatter component awaiting Shared.tableImport helpers');
  }

  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_ROWS=100;
  const DEFAULT_COLS=4;
  const SIGNIFICANT_COLOR = '#d62728';
  const DEFAULT_NON_SIG_COLOR = '#808080';
  const GRAPH_TYPE_DEFAULTS = {
    scatter: { title: 'Scatter plot' },
    volcano: { title: 'Volcano plot' },
    ma: { title: 'MA plot' }
  };

  const regressionTools = Shared.regressionTools = Shared.regressionTools || {};
  const regressionDebugNamespace = 'scatter-regression';
  const jStatLib = global.jStat;

  const ensureFiniteNumber = (value) => (Number.isFinite(value) ? value : NaN);

  const hasMatrixOps = !!(jStatLib && typeof jStatLib.transpose === 'function' && typeof jStatLib.multiply === 'function');
  const safeTranspose = (matrix) => {
    if(!hasMatrixOps){
      console.debug('Debug:', regressionDebugNamespace, 'transpose unavailable; returning null');
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
      console.debug('Debug:', regressionDebugNamespace, 'multiply unavailable; returning null');
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
      console.debug('Debug:', regressionDebugNamespace, 'fit input', { mode, sampleSize });
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

      const summarizeResiduals = (residuals) => {
        if(!residuals.length){
          return { mean: NaN, sd: NaN, min: NaN, max: NaN };
        }
        const mean = residuals.reduce((sum,val)=>sum+val,0)/residuals.length;
        const variance = residuals.length > 1
          ? residuals.reduce((sum,val)=>sum+Math.pow(val-mean,2),0)/(residuals.length-1)
          : 0;
        return {
          mean,
          sd: residuals.length > 1 ? Math.sqrt(variance) : 0,
          min: Math.min(...residuals),
          max: Math.max(...residuals)
        };
      };

      const computeResidualDiagnostics = (residuals) => {
        if(!residuals || residuals.length < 3){
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
        console.debug('Debug:', regressionDebugNamespace, 'residual diagnostics', diagnostics);
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
          console.debug('Debug:', regressionDebugNamespace, 'coefficient stats', entry);
          return entry;
        });
        return stats;
      };

      const buildIntervalSamples = ({ xtxInv, coefficients, residuals, domain, degree, alpha }) => {
        if(!xtxInv || !coefficients || !residuals || !domain){
          return { samples: [], summary: null };
        }
        const dof = residuals.length - coefficients.length;
        if(dof <= 0){
          return { samples: [], summary: null };
        }
        const tDist = jStatLib?.studentt;
        const tCritical = (tDist && typeof tDist.inv === 'function')
          ? tDist.inv(1 - alpha/2, dof)
          : NaN;
        const sumSquares = residuals.reduce((sum,val)=>sum+val*val,0);
        const sigmaSq = sumSquares / Math.max(dof, 1);
        if(!Number.isFinite(sigmaSq) || !Number.isFinite(tCritical)){
          return { samples: [], summary: null };
        }
        const minX = Number.isFinite(domain.minX) ? domain.minX : null;
        const maxX = Number.isFinite(domain.maxX) ? domain.maxX : null;
        if(minX === null || maxX === null || minX === maxX){
          return { samples: [], summary: null };
        }
        const sampleCount = 120;
        const step = (maxX - minX) / (sampleCount - 1);
        const samples = [];
        let ciMin = Infinity, ciMax = -Infinity, piMin = Infinity, piMax = -Infinity;
        for(let i=0;i<sampleCount;i++){
          const x = i === sampleCount - 1 ? maxX : (minX + step * i);
          const basis = [];
          for(let power = 0; power <= degree; power++){
            basis.push(Math.pow(x, power));
          }
          const yHat = basis.reduce((sum, coeff, idx) => sum + coeff * coefficients[idx], 0);
          const xtxVec = basis.map((_, rowIdx) => {
            return xtxInv[rowIdx]?.reduce((sum,val,colIdx)=>sum + (val * basis[colIdx]),0);
          });
          const varHat = xtxVec.reduce((sum,val,idx)=>sum + (basis[idx] * val),0);
          const stdErr = Number.isFinite(varHat) && varHat >= 0 ? Math.sqrt(sigmaSq * varHat) : NaN;
          const ciHalf = Number.isFinite(stdErr) ? tCritical * stdErr : NaN;
          const predStdErr = Number.isFinite(stdErr) ? Math.sqrt(stdErr*stdErr + sigmaSq) : NaN;
          const ciLow = Number.isFinite(ciHalf) ? yHat - ciHalf : NaN;
          const ciHigh = Number.isFinite(ciHalf) ? yHat + ciHalf : NaN;
          const piLow = Number.isFinite(predStdErr) ? yHat - tCritical * predStdErr : NaN;
          const piHigh = Number.isFinite(predStdErr) ? yHat + tCritical * predStdErr : NaN;
          if(Number.isFinite(ciLow) && ciLow < ciMin) ciMin = ciLow;
          if(Number.isFinite(ciHigh) && ciHigh > ciMax) ciMax = ciHigh;
          if(Number.isFinite(piLow) && piLow < piMin) piMin = piLow;
          if(Number.isFinite(piHigh) && piHigh > piMax) piMax = piHigh;
          const sample = { x, y: yHat, ciLow, ciHigh, piLow, piHigh };
          samples.push(sample);
        }
        const summary = {
          ciMin: Number.isFinite(ciMin) ? ciMin : NaN,
          ciMax: Number.isFinite(ciMax) ? ciMax : NaN,
          piMin: Number.isFinite(piMin) ? piMin : NaN,
          piMax: Number.isFinite(piMax) ? piMax : NaN,
          degreesOfFreedom: dof,
          tCritical
        };
        console.debug('Debug:', regressionDebugNamespace, 'interval samples generated', {
          sampleCount: samples.length,
          summary
        });
        return { samples, summary, degreesOfFreedom: dof, tCritical };
      };

      const evaluatePolynomial = (coeffs, x) => coeffs.reduce((sum, coeff, idx) => sum + coeff * Math.pow(x, idx), 0);

      const computeLinear = (alphaValue) => {
        let xtxInv = null;
        let beta = null;
        if(hasMatrixOps){
          const design = cleanPoints.map(pt => [1, pt.x]);
          const yMatrix = yVals.map(val => [val]);
          const designT = safeTranspose(design);
          if(designT){
            const xtx = safeMultiply(designT, design);
            if(xtx){
              xtxInv = safeInverse(xtx);
            }
            if(!xtxInv){
              console.warn('Linear regression matrix inversion failed; falling back to simple estimates');
            }
            const xty = safeMultiply(designT, yMatrix);
            if(xtxInv && xty){
              const betaMatrix = safeMultiply(xtxInv, xty);
              if(betaMatrix){
                beta = betaMatrix.map(row => row[0]);
              }
            }
          }
        }else{
          console.debug('Debug:', regressionDebugNamespace, 'matrix operations unavailable; using analytic fallback');
        }
        const fallbackSlopeIntercept = () => {
          const xMean = jStatLib.mean(xVals);
          const yMeanLocal = yMean;
          const numerator = xVals.reduce((sum, xv, idx) => sum + (xv - xMean) * (yVals[idx] - yMeanLocal), 0);
          const denominator = xVals.reduce((sum, xv) => sum + Math.pow(xv - xMean, 2), 0);
          const slopeVal = denominator === 0 ? 0 : numerator / denominator;
          const interceptVal = yMeanLocal - slopeVal * xMean;
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
        const predictions = xVals.map(x => resolvedCoefficients[0] + resolvedCoefficients[1] * x);
        const residuals = predictions.map((pred, idx) => yVals[idx] - pred);
        const sse = residuals.reduce((sum,val)=>sum+val*val,0);
        const r2 = sst === 0 ? 1 : 1 - (sse / sst);
        const diagnostics = computeResidualDiagnostics(residuals);
        const coefficientStats = xtxInv
          ? buildCoefficientStats({
              coefficients: resolvedCoefficients,
              xtxInv,
              residuals,
              alpha: alphaValue,
              termLabels: ['Intercept','Slope'],
              degreesOfFreedom: sampleSize - resolvedCoefficients.length
            })
          : [];
        const intervalInfo = xtxInv
          ? buildIntervalSamples({
              xtxInv,
              coefficients: resolvedCoefficients,
              residuals,
              domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) },
              degree: 1,
              alpha: alphaValue
            })
          : { samples: [], summary: null };
        return {
          coefficients: resolvedCoefficients,
          metrics: {
            sampleSize,
            predictors: 1,
            sse,
            sst,
            r2,
            adjR2: sampleSize > 2 ? 1 - (1 - r2) * ((sampleSize - 1) / (sampleSize - 2)) : r2,
            rmse: Math.sqrt(sse / sampleSize),
            mae: residuals.reduce((sum,val)=>sum+Math.abs(val),0)/sampleSize
          },
          residuals: summarizeResiduals(residuals),
          predictions,
          diagnostics,
          coefficientStats,
          intervals: intervalInfo.summary ? {
            alpha: alphaValue,
            tCritical: intervalInfo.tCritical,
            degreesOfFreedom: intervalInfo.degreesOfFreedom,
            samples: intervalInfo.samples,
            summary: intervalInfo.summary
          } : null,
          summary: {
            intercept: resolvedCoefficients[0],
            slope: resolvedCoefficients[1],
            equation: `y = ${resolvedCoefficients[0].toFixed(4)} + ${resolvedCoefficients[1].toFixed(4)}x`
          }
        };
      };

      const solveNormalEquations = (degree, alphaValue) => {
        try{
          if(!hasMatrixOps){
            console.warn('Polynomial regression requires matrix operations that are unavailable');
            return null;
          }
          const design = cleanPoints.map(pt => {
            const row = [];
            for(let power = 0; power <= degree; power++){
              row.push(Math.pow(pt.x, power));
            }
            return row;
          });
          const yMatrix = yVals.map(val => [val]);
          const designT = safeTranspose(design);
          if(!designT){
            return null;
          }
          const xtx = safeMultiply(designT, design);
          if(!xtx){
            return null;
          }
          let xtxInv = safeInverse(xtx);
          if(!xtxInv){
            console.warn('Polynomial regression matrix inversion failed');
            return null;
          }
          const xty = safeMultiply(designT, yMatrix);
          if(!xty){
            return null;
          }
          const betaMatrix = safeMultiply(xtxInv, xty);
          if(!betaMatrix){
            return null;
          }
          const beta = betaMatrix.map(row => row[0]);
          const predictions = cleanPoints.map(pt => evaluatePolynomial(beta, pt.x));
          const residuals = predictions.map((pred, idx) => yVals[idx] - pred);
          const sse = residuals.reduce((sum,val)=>sum+val*val,0);
          const predictors = degree;
          const r2 = sst === 0 ? 1 : 1 - (sse / sst);
          const adjR2 = sampleSize > predictors + 1
            ? 1 - (1 - r2) * ((sampleSize - 1) / (sampleSize - predictors - 1))
            : r2;
          const diagnostics = computeResidualDiagnostics(residuals);
          const termLabels = Array.from({ length: beta.length }, (_, idx) => idx === 0 ? 'Intercept' : `x^${idx}`);
          const coefficientStats = buildCoefficientStats({
            coefficients: beta,
            xtxInv,
            residuals,
            alpha: alphaValue,
            termLabels,
            degreesOfFreedom: sampleSize - beta.length
          });
          const intervalInfo = buildIntervalSamples({
            xtxInv,
            coefficients: beta,
            residuals,
            domain: domain || { minX: Math.min(...xVals), maxX: Math.max(...xVals) },
            degree,
            alpha: alphaValue
          });
          const terms = beta.map((coeff, idx) => {
            if(idx === 0){
              return coeff.toFixed(4);
            }
            const powerLabel = idx === 1 ? 'x' : `x^${idx}`;
            return `${coeff >= 0 ? '+ ' : '- '}${Math.abs(coeff).toFixed(4)}${powerLabel}`;
          });
          const leadingTerm = terms.shift();
          const equation = `y = ${[leadingTerm, ...terms].join(' ')}`;
          return {
            coefficients: beta,
            metrics: {
              sampleSize,
              predictors,
              sse,
              sst,
              r2,
              adjR2,
              rmse: Math.sqrt(sse / sampleSize),
              mae: residuals.reduce((sum,val)=>sum+Math.abs(val),0)/sampleSize
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
            summary: {
              intercept: beta[0],
              slope: beta[1] ?? NaN,
              equation,
              degree
            },
            evaluate: (x) => evaluatePolynomial(beta, x)
          };
        }catch(err){
          console.error('Polynomial regression failure', err);
          return null;
        }
      };

      const computeLogistic = (alpha) => {
        const warnings = [];
        const logisticPoints = cleanPoints.map(pt => {
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
            metrics: { sampleSize, sse: NaN, sst: sst || NaN, r2: NaN, adjR2: NaN, rmse: NaN, mae: NaN, logLoss: NaN },
            residuals: { mean: NaN, sd: NaN, min: NaN, max: NaN },
            warnings
          };
        }
        let beta0 = 0;
        let beta1 = 0;
        const learningRate = options.learningRate || 0.01;
        const tolerance = options.tolerance || 1e-6;
        const maxIterations = options.maxIterations || 1000;
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
          grad0 /= sampleSize;
          grad1 /= sampleSize;
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
        const rmse = Math.sqrt(sse / sampleSize);
        const mae = residuals.reduce((sum,val)=>sum+Math.abs(val),0)/sampleSize;
        const eps = 1e-9;
        const logLoss = logisticPoints.reduce((sum, pt, idx) => {
          const pred = Math.min(1 - eps, Math.max(eps, predictions[idx]));
          return sum - (pt.y * Math.log(pred) + (1 - pt.y) * Math.log(1 - pred));
        }, 0) / sampleSize;
        const meanY = logisticPoints.reduce((sum, pt) => sum + pt.y, 0) / sampleSize;
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
          console.debug('Debug:', regressionDebugNamespace, 'logistic matrix operations unavailable; skipping coefficient variance');
        }
        let coefficientStats = [];
        if(xtwxInv){
          coefficientStats = buildCoefficientStats({
            coefficients: [beta0, beta1],
            xtxInv: xtwxInv,
            residuals,
            alpha: alphaValue,
            termLabels: ['Intercept','Slope'],
            degreesOfFreedom: sampleSize - 2
          });
        }
        let intervalSummary = null;
        let intervalSamples = [];
        let zCritical = NaN;
        if(xtwxInv){
          const normal = jStatLib?.normal;
          zCritical = (normal && typeof normal.inv === 'function') ? normal.inv(1 - alpha/2, 0, 1) : NaN;
          const minX = Number.isFinite(domain?.minX) ? domain.minX : Math.min(...xVals);
          const maxX = Number.isFinite(domain?.maxX) ? domain.maxX : Math.max(...xVals);
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
            console.debug('Debug:', regressionDebugNamespace, 'logistic interval samples generated', {
              sampleCount: intervalSamples.length,
              zCritical
            });
          }
        }
        return {
          coefficients: [beta0, beta1],
          metrics: {
            sampleSize,
            predictors: 1,
            sse,
            sst,
            r2: pseudoR2,
            adjR2: pseudoR2,
            rmse,
            mae,
            logLoss,
            iterations: iteration + 1
          },
          residuals: summarizeResiduals(residuals),
          predictions,
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
            equation: `y = 1 / (1 + e^{-(${beta0.toFixed(4)} + ${beta1.toFixed(4)}x)})`
          },
          predict,
          warnings
        };
      };

      let model;
      if(mode === 'logistic'){
        model = computeLogistic(alpha);
      }else if(mode === 'quadratic' || mode === 'cubic'){
        const degree = mode === 'quadratic' ? 2 : 3;
        model = solveNormalEquations(degree, alpha);
      }else{
        model = computeLinear(alpha);
      }

      if(!model){
        model = computeLinear(alpha);
        if(model){
          model.warnings = (model.warnings || []).concat([`Fell back to linear regression from mode "${mode}"`]);
        }
      }
      model = model || { coefficients: [], metrics: { sampleSize }, residuals: { mean: NaN, sd: NaN, min: NaN, max: NaN } };
      model.mode = mode;
      model.domain = domain;
      if(!model.predict && model.summary && Number.isFinite(model.summary.intercept) && Number.isFinite(model.summary.slope)){
        const intercept = model.summary.intercept;
        const slope = model.summary.slope;
        model.predict = (x) => intercept + slope * x;
      }else if(!model.predict && model.coefficients?.length){
        model.predict = (x) => evaluatePolynomial(model.coefficients, x);
      }
      console.debug('Debug:', regressionDebugNamespace, 'fit result', {
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
        summary: model.summary || null,
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
      const sampleCount = Math.max(2, options.sampleCount || (model.mode === 'logistic' ? 200 : 100));
      const step = (maxX - minX) / (sampleCount - 1);
      const samples = [];
      for(let i = 0; i < sampleCount; i++){
        const x = i === sampleCount - 1 ? maxX : (minX + step * i);
        const y = model.predict(x);
        samples.push({ x, y });
      }
      console.debug('Debug:', regressionDebugNamespace, 'sampleCurve', { mode: model.mode, sampleCount: samples.length });
      return samples;
    };
  }

  let scheduleDrawScatter=null;
  let scatterCurrentGraphType='scatter';
  let scatterLastGraphType='scatter';
  let scatterLastRegressionSummary=null;

  function formatP(p){
    if(p === undefined || p === null || Number.isNaN(p)) return 'n/a';
    if(!Number.isFinite(p)) return p > 0 ? 'Infinity' : '-Infinity';
    if(p === 0) return '0';
    const formatted = p.toLocaleString('en-US',{maximumSignificantDigits:6});
    console.debug('Debug: formatP value', {input:p, formatted}); // Debug: remove when stable
    return formatted;
  }
  function setup(){
    if(scatter.ready){ console.debug('Debug: Components.scatter.setup skipped'); return; }
    console.debug('Debug: Components.scatter.setup start');
    scheduleDrawScatter = () => {};
    const $ = global.$;
    const document = global.document;
    const Handsontable = global.Handsontable;
    if(!Handsontable){
      console.error('Handsontable missing for scatter component');
      return;
    }
    const makeEditableLocal = (el,onChange,options) => {
      const fn = Shared.makeEditable || global.makeEditable;
      if (typeof fn === 'function') {
        return fn(el,onChange,options);
      }
      console.warn('scatter component makeEditable fallback missing');
      return undefined;
    };
    const autoResizeSvg = (svg, opts) => {
      const fn = Shared.autoResizeSvg || global.autoResizeSvg;
      if (typeof fn === 'function') {
        return fn(svg, opts);
      }
      console.warn('scatter component autoResizeSvg fallback missing');
      return undefined;
    };
    const attachPicker = (el)=>{ if (typeof global.attachColorPickerNear === 'function') { global.attachColorPickerNear(el); } };
    const serializeSvg = (svgEl, options)=>{
      const fn = Shared.serializeCleanSVG || global.serializeCleanSVG;
      if (typeof fn === 'function') {
        return fn(svgEl, options);
      }
      if (!svgEl) return '';
      const serializer = new (global.XMLSerializer||XMLSerializer)();
      return serializer.serializeToString(svgEl);
    };
    const renderStatsCard=(target,model)=>{
      if(!target) return;
      const hasRenderer=Shared.statsTable && typeof Shared.statsTable.render==='function';
      if(hasRenderer){
        Shared.statsTable.render({ target, ...model });
        console.debug('Debug: scatter renderStatsCard shared',{ caption:model.caption || null, rows:model.rows?.length || 0 });
        return;
      }
      target.innerHTML='';
      if(model.caption){
        const lead=document.createElement('div');
        lead.className='stats-table-lead';
        lead.textContent=model.caption;
        target.appendChild(lead);
      }
      const table=document.createElement('table');
      const thead=document.createElement('thead');
      const headRow=document.createElement('tr');
      (model.columns||[]).forEach(col=>{
        const th=document.createElement('th');
        th.textContent=col.label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody=document.createElement('tbody');
      (model.rows||[]).forEach(row=>{
        const tr=document.createElement('tr');
        (model.columns||[]).forEach(col=>{
          const td=document.createElement('td');
          const value=row?.[col.key];
          td.textContent=value ?? '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      target.appendChild(table);
      console.debug('Debug: scatter renderStatsCard fallback',{ caption:model.caption || null, rows:model.rows?.length || 0 });
    };
    const formatMetricValue = (value, digits = 4) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
    console.debug('Debug: scatter component DOM helpers resolved', {
      hasSharedEditable: typeof Shared.makeEditable === 'function',
      hasSharedResize: typeof Shared.autoResizeSvg === 'function',
      hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
    }); // Debug: helper availability summary
    const markFontEditable = (node, role, key) => {
      if (!node) { return; }
      const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
      if (fontControls && typeof fontControls.markText === 'function') {
        fontControls.markText(node, { scopeId: 'scatter', role, key });
      } else if (node.dataset) {
        node.dataset.fontEditable = '1';
        node.dataset.fontScope = 'scatter';
        if (role) node.dataset.fontRole = role;
        if (key || role) node.dataset.fontKey = key || role;
      }
      if (!role || role.indexOf('Tick') === -1) {
        console.debug('Debug: scatter markFontEditable', payload); // Debug: font target tagging summary
      }
    };
    let scatterDrawToken=0;
      // Scatter plot setup
      const scatterHotContainer=document.getElementById('scatterHot');
      const scatterHotWrapper=document.getElementById('scatterHotWrapper');
      const scatterTablePanel=document.getElementById('scatterTablePanel');
      const scatterGraphPanel=document.getElementById('scatterGraphPanel');
      const scatterPanelResizer=document.getElementById('scatterPanelResizer');
      let scatterSvgBox=scatterGraphPanel?.querySelector('.svgbox');
      const scatterConfigPanel=scatterGraphPanel?.querySelector('.config-options');
      const scatterLayout = Shared.componentLayout?.createStandardPanels({
        componentName: 'scatter',
        selectors: {
          tablePanel: '#scatterTablePanel',
          graphPanel: '#scatterGraphPanel',
          panelResizer: '#scatterPanelResizer',
          hotWrapper: '#scatterHotWrapper',
          hotContainer: '#scatterHot',
          svgBox: () => scatterGraphPanel?.querySelector('.svgbox'),
          resizeTarget: () => scatterGraphPanel?.querySelector('.svgbox')
        },
        scheduleDraw: () => scheduleDrawScatter(),
        resizableBoxOptions: {
          onResize: () => {
            console.debug('Debug: scatter layout onResize schedule trigger');
            scheduleDrawScatter();
          }
        }
      });
      if(scatterLayout?.elements?.svgBox){
        scatterSvgBox = scatterLayout.elements.svgBox;
      }
      scatterLayout?.setScheduleDraw?.(() => scheduleDrawScatter());
      scatterLayout?.syncPanels?.();
      console.debug('Debug: scatter initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
      if(typeof Shared.hot?.createStandardTable !== 'function'){
        console.error('scatter initHot missing Shared.hot.createStandardTable');
        return;
      }
      const data = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
      let scatterScheduleProxyCount = 0;
      const scheduleDrawScatterProxy = () => {
        scatterScheduleProxyCount += 1;
        if(scatterScheduleProxyCount <= 5){
          console.debug('Debug: scatter scheduleDraw proxy invoked', { count: scatterScheduleProxyCount }); // Debug: table change trigger
          if(scatterScheduleProxyCount === 5){
            console.debug('Debug: scatter scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
          }
        }
        scheduleDrawScatter();
      };

      const scatterHot=Shared.hot.createStandardTable(scatterHotContainer,{ rows: DEFAULT_ROWS, cols: DEFAULT_COLS },scheduleDrawScatterProxy,{
        debugLabel: 'scatter',
        data,
        hotOptions: {
          afterChange(changes,source){
            if(!changes||source==='loadData') return;
            console.log('scatter afterChange', {count:changes.length, source});
          },
          afterUndo(){
            console.log('scatter undo');
          },
          afterRedo(){
            console.log('scatter redo');
          }
        }
      });
    
      global.DEBUG_SCATTER=true;
      const scatterExamples={
        scatter:[
          ['Label','X Value','Y Value',''],
          ['Cat',4.5,23,''],
          ['Dog',20,45,''],
          ['Rabbit',2.5,35,''],
          ['Cat',5,25,''],
          ['Dog',22,50,''],
          ['Rabbit',3,40,''],
          ['Cat',4.8,24,''],
          ['Dog',24,55,'']
        ],
        volcano:[
          ['Gene','log2FoldChange','pValue',''],
          ['GeneA',1.6,0.0005,''],
          ['GeneB',-1.2,0.002,''],
          ['GeneC',0.2,0.8,''],
          ['GeneD',-2.1,0.0001,''],
          ['GeneE',0.5,0.4,''],
          ['GeneF',1.1,0.03,''],
          ['GeneG',-1.8,0.0008,'']
        ],
        ma:[
          ['Gene','MeanExpression','log2FoldChange','pValue'],
          ['GeneA',8.5,1.4,0.0005],
          ['GeneB',5.3,-1.1,0.002],
          ['GeneC',3.9,0.1,0.4],
          ['GeneD',9.2,-2.0,0.00005],
          ['GeneE',6.1,0.3,0.2],
          ['GeneF',7.4,1.2,0.015],
          ['GeneG',4.8,-1.5,0.0009],
          ['GeneH',2.7,0.0,0.9]
        ]
      };
      if(global.DEBUG_SCATTER) console.log('scatter example dataset map', scatterExamples);
      document.getElementById('scatterLoadExample').addEventListener('click',()=>{
        const type=scatterGraphTypeSelect?.value || 'scatter';
        const dataset=scatterExamples[type] || scatterExamples.scatter;
        scatterHot.loadData(dataset);
        if(type!=='scatter' && scatterFill && scatterFill.value && scatterFill.value.toLowerCase()==='#377eb8'){
          scatterFill.value=DEFAULT_NON_SIG_COLOR;
        }
        console.log('scatter example loaded',{type,rows:dataset.length});
        syncScatterGraphTypeUI();
        scheduleDrawScatter();
      });
      const scatterImportBtn=document.getElementById('scatterImport');
      const scatterFileInput=document.getElementById('scatterFile');
      const tableImport = Shared.tableImport;
      scatterImportBtn.addEventListener('click',()=>{ scatterFileInput.value=''; scatterFileInput.click(); });
      scatterFileInput.addEventListener('change',()=>{
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('scatter import skipped: Shared.tableImport.openFile unavailable');
          return;
        }
        tableImport.openFile(scatterFileInput, {
          hot: scatterHot,
          minCols: 4,
          minRows: DEFAULT_ROWS,
          scheduleDraw: scheduleDrawScatter,
          debugLabel: 'scatter',
          onProcessed: info => console.log('scatter data imported',{rows: info?.rows, cols: info?.cols})
        });
      });

      if(tableImport && typeof tableImport.handlePaste === 'function'){
        scatterHotContainer.addEventListener('paste',async e=>{
          console.time('scatterPaste');
          try{
            await tableImport.handlePaste(e, scatterHot, {
              minCols: 4,
              minRows: DEFAULT_ROWS,
              scheduleDraw: scheduleDrawScatter,
              debugLabel: 'scatter',
              onBeforeProcess: meta => console.log('scatter fast paste',{rows: meta.rowCount, cols: meta.colCount, startRow: meta.startRow, startCol: meta.startCol}),
              onProcessed: info => console.log('scatter data imported',{rows: info?.rows, cols: info?.cols})
            });
          }finally{
            console.timeEnd('scatterPaste');
          }
        },true);
      }
    
      const scatterGraphTypeSelect=$('#scatterGraphType');
      const scatterThresholdControls=$('#scatterThresholdControls');
      const scatterLog2FCThreshold=$('#scatterLog2FCThreshold');
      const scatterNegLogPThreshold=$('#scatterNegLogPThreshold');
      const scatterFill=$('#scatterFill'), scatterBorder=$('#scatterBorder'), scatterBorderWidth=$('#scatterBorderWidth'), scatterDotSize=$('#scatterDotSize'), scatterShowLine=$('#scatterShowLine'), scatterAlpha=$('#scatterAlpha');
      const scatterShowIntervals=$('#scatterShowIntervals');
      const scatterShowDiagnostics=$('#scatterShowDiagnostics');
      const scatterAlphaVal=$('#scatterAlphaVal');
      const scatterFontSize=$('#scatterFontSize'), scatterFontSizeVal=$('#scatterFontSizeVal');
      if(scatterFontSize?.dataset){
        scatterFontSize.dataset.fontBasePt = String(scatterFontSize.value);
        console.debug('Debug: scatter font size base initialized',{ value: scatterFontSize.value }); // Debug: initial base
      }
      chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value), input: scatterFontSize, manual: true });
      const scatterShowGrid=$('#scatterShowGrid'), scatterShowFrame=$('#scatterShowFrame'), scatterLogX=$('#scatterLogX'), scatterLogY=$('#scatterLogY');
      const scatterXMin=$('#scatterXMin'), scatterXMax=$('#scatterXMax'), scatterYMin=$('#scatterYMin'), scatterYMax=$('#scatterYMax');
      const scatterOriginMode=$('#scatterOriginMode'), scatterOriginX=$('#scatterOriginX'), scatterOriginY=$('#scatterOriginY');
      const scatterStatType=$('#scatterStatType');
      const scatterRegressionMode=$('#scatterRegressionMode');
      const scatterLabelColorsDiv=$('#scatterLabelColors');
      const scatterLabelColorsFieldset=$('#scatterLabelColorsFieldset');
      let scatterLabelColors={};
      function syncScatterGraphTypeUI(){
        const type=scatterGraphTypeSelect?.value || 'scatter';
        scatterCurrentGraphType=type;
        const showThresholds=type!=='scatter';
        if(scatterThresholdControls){
          scatterThresholdControls.style.display=showThresholds?'':'none';
        }
        [scatterLogX,scatterLogY].forEach(el=>{
          if(!el) return;
          el.disabled=type!=='scatter';
          if(type!=='scatter' && el.checked){
            el.checked=false;
          }
        });
        if(scatterStatType){
          scatterStatType.disabled=type!=='scatter';
        }
        if(scatterRegressionMode){
          scatterRegressionMode.disabled=type!=='scatter';
        }
        const disableRegressionControls = type !== 'scatter';
        if(scatterShowLine){
          scatterShowLine.disabled=disableRegressionControls;
          if(disableRegressionControls && scatterShowLine.checked){
            scatterShowLine.checked=false;
          }
        }
        if(scatterShowIntervals){
          scatterShowIntervals.disabled=disableRegressionControls;
        }
        if(scatterShowDiagnostics){
          scatterShowDiagnostics.disabled=disableRegressionControls;
        }
        if(type!=='scatter' && scatterFill && scatterFill.value && scatterFill.value.toLowerCase()==='#377eb8'){
          scatterFill.value=DEFAULT_NON_SIG_COLOR;
        }
        if(type!==scatterLastGraphType){
          const defaults=GRAPH_TYPE_DEFAULTS[type];
          if(defaults && defaults.title){
            scatterTitleText=defaults.title;
          }
          scatterLastGraphType=type;
        }
        if(type!=='scatter' && scatterLabelColorsFieldset){
          scatterLabelColorsFieldset.style.display='none';
        }
        console.debug('Debug: syncScatterGraphTypeUI complete',{type,showThresholds});
      }
      scatterAlphaVal.textContent=scatterAlpha.value;
      if(scatterGraphTypeSelect){
        scatterGraphTypeSelect.addEventListener('change',()=>{
          console.debug('Debug: scatter graph type change event',{value:scatterGraphTypeSelect.value});
          syncScatterGraphTypeUI();
          scheduleDrawScatter();
        });
      }
      if(scatterLog2FCThreshold){
        scatterLog2FCThreshold.addEventListener('input',()=>{
          console.debug('Debug: scatter log2FC threshold input',{value:scatterLog2FCThreshold.value});
          scheduleDrawScatter();
        });
      }
      if(scatterNegLogPThreshold){
        scatterNegLogPThreshold.addEventListener('input',()=>{
          console.debug('Debug: scatter negLogP threshold input',{value:scatterNegLogPThreshold.value});
          scheduleDrawScatter();
        });
      }
      scatterFill.addEventListener('input',()=>{console.log('scatterFill changed', scatterFill.value); scheduleDrawScatter();});
      scatterBorder.addEventListener('input',()=>{console.log('scatterBorder changed', scatterBorder.value); scheduleDrawScatter();});
      scatterBorderWidth.addEventListener('input',()=>{console.log('scatterBorderWidth changed', scatterBorderWidth.value); scheduleDrawScatter();});
      scatterDotSize.addEventListener('input',()=>{console.log('scatterDotSize changed', scatterDotSize.value); scheduleDrawScatter();});
      scatterAlpha.addEventListener('input',()=>{scatterAlphaVal.textContent=scatterAlpha.value; console.log('scatterAlpha changed',scatterAlpha.value); scheduleDrawScatter();});
      scatterFontSize.addEventListener('input',()=>{
        if(scatterFontSize.dataset){
          scatterFontSize.dataset.fontBasePt = String(scatterFontSize.value);
          console.debug('Debug: scatter font size input manual set',{ value: scatterFontSize.value }); // Debug: manual slider update
        }
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value), input: scatterFontSize, manual: true });
        scheduleDrawScatter();
      });
      [scatterShowGrid,scatterLogX,scatterLogY,scatterStatType,scatterOriginMode,scatterShowLine,scatterShowIntervals,scatterShowDiagnostics]
        .forEach(el=>el&&el.addEventListener('change',()=>{
          console.debug('Debug: scatter config changed', { id: el.id, checked: el.checked, value: el.value });
          scheduleDrawScatter();
        }));
      if(scatterRegressionMode){
        scatterRegressionMode.addEventListener('change',()=>{
          console.debug('Debug: scatter regression mode change',{ value: scatterRegressionMode.value });
          scheduleDrawScatter();
        });
      }
      scatterShowFrame.addEventListener('change',()=>{console.debug('Debug: scatter showFrame change',{checked:scatterShowFrame.checked}); scheduleDrawScatter();});
      [scatterXMin,scatterXMax,scatterYMin,scatterYMax,scatterOriginX,scatterOriginY].forEach(el=>el.addEventListener('input',()=>{console.log('scatter axis input', el.id, el.value); scheduleDrawScatter();}));
      syncScatterGraphTypeUI();

      function updateScatterLabelColorPickers(labels){
        if(scatterCurrentGraphType!=='scatter'){
          scatterLabelColorsDiv.innerHTML='';
          scatterLabelColorsFieldset.style.display='none';
          console.debug('Debug: scatter label colors disabled',{graphType:scatterCurrentGraphType});
          return;
        }
        scatterLabelColorsDiv.innerHTML='';
        if(labels.length===0){
          scatterLabelColorsFieldset.style.display='none';
          console.log('updateScatterLabelColorPickers hide');
          return;
        }
        scatterLabelColorsFieldset.style.display='';
        labels.forEach((lab,i)=>{
          if(!scatterLabelColors[lab]){
            scatterLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
            console.log('scatter default label color',{label:lab,color:scatterLabelColors[lab]});
          }
          const input=document.createElement('input');
          input.type='color';
          input.value=scatterLabelColors[lab];
          attachPicker(input);
          input.addEventListener('input',e=>{
            scatterLabelColors[lab]=e.target.value;
            console.log('scatter label color changed',{label:lab,color:scatterLabelColors[lab]});
            scheduleDrawScatter();
          });
          const lbl=document.createElement('label');
          lbl.textContent=lab+' ';
          lbl.appendChild(input);
          scatterLabelColorsDiv.appendChild(lbl);
        });
        console.log('updateScatterLabelColorPickers',scatterLabelColors);
      }
    
      const scatterPlotDiv=document.getElementById('scatterPlot');
      const scatterContainer=scatterPlotDiv.closest('.svgbox')||scatterPlotDiv.parentElement;
      if(!scatterContainer){
        console.debug('Debug: scatter resizer container missing', { hasContainer: !!scatterContainer });
      }

      let scatterTitleText='Scatter plot';
      let scatterXLabelText='X';
      let scatterYLabelText='Y';
      async function drawScatter(){
        const token=++scatterDrawToken; // debug token for cancellation
        console.log('drawScatter called',{token});
        const fill=scatterFill.value||DEFAULT_NON_SIG_COLOR;
        const alpha=Number(scatterAlpha.value)||0;
        const borderWidthRaw=Number(scatterBorderWidth.value);
        const borderColor=scatterBorder.value;
        const containerRect=scatterSvgBox?.getBoundingClientRect?.();
        const fontInfo=chartStyle.resolveScaledFontSize({
          rawSize: scatterFontSize.value,
          width: containerRect?.width,
          height: containerRect?.height,
          svgBox: scatterSvgBox,
          input: scatterFontSize
        });
        const fs=fontInfo.scaledPx;
        const styleScaleInfo=fontInfo.scaleInfo;
        const axisStrokeWidth=chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'scatter-axis', min: 0.5 });
        const dotSizeRaw=Number(scatterDotSize.value)||3;
        const dotSizePx=chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'scatter-point', min: 0 });
        const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'scatter-border', min: 0 });
        console.debug('Debug: scatter style scaling applied',{
          dotSizeRaw,
          dotSizePx,
          borderWidthRaw,
          borderWidthPx,
          axisStrokeWidth,
          styleScale: styleScaleInfo?.styleScale
        }); // Debug: scatter style scaling summary
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, fontInfo, input: scatterFontSize });
        console.debug('Debug: scatter font scaling applied',{
          input: scatterFontSize.value,
          fontSizePt: fontInfo.pt,
          baseFontPx: fontInfo.px,
          scaledFontPx: fs,
          scale: fontInfo.scaleInfo?.scale,
          containerWidth: containerRect?.width,
          containerHeight: containerRect?.height
        }); // Debug: scatter font scaling summary
        const axisMetrics=chartStyle.createAxisMetrics(fs);
        console.debug('Debug: scatter axis metrics',axisMetrics);
        const showGrid=scatterShowGrid.checked;
        console.log('scatter showGrid', showGrid);
        const showFrame=scatterShowFrame.checked;
        console.debug('Debug: scatter showFrame state',{showFrame});
        let showLine=scatterShowLine.checked;
        const showIntervals = !!(scatterShowIntervals && scatterShowIntervals.checked);
        const showDiagnostics = !!(scatterShowDiagnostics && scatterShowDiagnostics.checked);
        const graphType=scatterGraphTypeSelect?.value || 'scatter';
        scatterCurrentGraphType=graphType;
        const allowLogAxes=graphType==='scatter';
        if(!allowLogAxes){
          if(scatterLogX?.checked){
            scatterLogX.checked=false;
          }
          if(scatterLogY?.checked){
            scatterLogY.checked=false;
          }
          if(showLine){
            showLine=false;
          }
        }
        const logX=allowLogAxes && scatterLogX ? scatterLogX.checked : false;
        const logY=allowLogAxes && scatterLogY ? scatterLogY.checked : false;
        if(scatterShowLine){
          scatterShowLine.disabled=!allowLogAxes;
          if(!allowLogAxes && scatterShowLine.checked){
            scatterShowLine.checked=false;
          }
        }
        console.debug('Debug: scatter graph type resolved',{graphType,allowLogAxes,logX,logY});
        if(!allowLogAxes){
          console.debug('Debug: scatter forcing trend line off',{graphType});
        }
        console.debug('Debug: scatter regression toggles', { showLine, showIntervals, showDiagnostics });
        console.log('drawScatter dot size', dotSizeRaw);
        const log2fcThresholdValue=parseFloat(scatterLog2FCThreshold?.value);
        const negLogPThresholdValue=parseFloat(scatterNegLogPThreshold?.value);
        const log2fcThreshold=Number.isFinite(log2fcThresholdValue)?log2fcThresholdValue:0;
        const negLogPThreshold=Number.isFinite(negLogPThresholdValue)?negLogPThresholdValue:0;
        console.debug('Debug: scatter threshold values',{graphType,log2fcThreshold,negLogPThreshold});
        const method=scatterStatType.value;
        const xMinManual=parseFloat(scatterXMin.value);
        const xMaxManual=parseFloat(scatterXMax.value);
        const yMinManual=parseFloat(scatterYMin.value);
        const yMaxManual=parseFloat(scatterYMax.value);
        console.log('scatter manual range',{xMinManual,xMaxManual,yMinManual,yMaxManual});
        const originMode=scatterOriginMode.value;
        const originXInput=parseFloat(scatterOriginX.value);
        const originYInput=parseFloat(scatterOriginY.value);
        console.log('scatter origin inputs',{originMode,originXInput,originYInput});
        const labelCol=scatterHot.getDataAtCol(0)||[];
        const xCol=scatterHot.getDataAtCol(1)||[];
        const yCol=scatterHot.getDataAtCol(2)||[];
        const extraCol=scatterHot.getDataAtCol(3)||[];
        console.log('scatter column lengths',{label:labelCol.length,x:xCol.length,y:yCol.length,extra:extraCol.length});
        const xLabelRaw=xCol[0];
        const yLabelRaw=yCol[0];
        const extraLabelRaw=extraCol[0];
        if(graphType==='volcano'){
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'log2 Fold Change';
          const basePLabel=(yLabelRaw&&String(yLabelRaw).trim())||'p-value';
          scatterYLabelText=`-log10(${basePLabel})`;
        }else if(graphType==='ma'){
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'Mean Expression';
          scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'log2 Fold Change';
        }else{
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'X';
          scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'Y';
        }
        const maxLen=Math.max(labelCol.length,xCol.length,yCol.length,extraCol.length);
        const points=[];
        const labelSet=new Set();
        const labelAnnotations=[];
        let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
        let skippedRows=0;
        let significantCount=0;
        let maMissingPCount=0;
        console.time(`scatterCollectPoints_${token}`);
        for(let r=1;r<maxLen;r++){
          const lab=labelCol[r]?String(labelCol[r]).trim():'';
          if(graphType==='scatter'){
            const xv=parseFloat(xCol[r]);
            const yv=parseFloat(yCol[r]);
            if(!Number.isNaN(xv) && !Number.isNaN(yv)){
              points.push({x:xv,y:yv,label:lab});
              if(lab) labelSet.add(lab);
              if(xv<xMinRaw) xMinRaw=xv;
              if(xv>xMaxRaw) xMaxRaw=xv;
              if(yv<yMinRaw) yMinRaw=yv;
              if(yv>yMaxRaw) yMaxRaw=yv;
            }else{
              skippedRows++;
              console.debug('Debug: scatter row skipped',{graphType,row:r,xv,yv});
            }
          }else if(graphType==='volcano'){
            const log2fc=parseFloat(xCol[r]);
            const pRaw=parseFloat(yCol[r]);
            if(Number.isFinite(log2fc) && Number.isFinite(pRaw) && pRaw>0){
              let negLogP=-Math.log10(pRaw);
              if(!Number.isFinite(negLogP)){
                negLogP=-Math.log10(Number.MIN_VALUE);
              }
              const isSignificant=Math.abs(log2fc)>=log2fcThreshold && negLogP>=negLogPThreshold;
              points.push({x:log2fc,y:negLogP,label:lab,isSignificant,meta:{log2fc,pValue:pRaw,negLogP}});
              if(isSignificant) significantCount++;
              if(lab) labelSet.add(lab);
              if(log2fc<xMinRaw) xMinRaw=log2fc;
              if(log2fc>xMaxRaw) xMaxRaw=log2fc;
              if(negLogP<yMinRaw) yMinRaw=negLogP;
              if(negLogP>yMaxRaw) yMaxRaw=negLogP;
            }else{
              skippedRows++;
              console.debug('Debug: volcano row skipped',{row:r,log2fc,pRaw});
            }
          }else{
            const meanExpr=parseFloat(xCol[r]);
            const log2fcVal=parseFloat(yCol[r]);
            const pRaw=parseFloat(extraCol[r]);
            const hasPositiveP=Number.isFinite(pRaw) && pRaw>0;
            if(Number.isFinite(meanExpr) && Number.isFinite(log2fcVal)){
              let negLogP=hasPositiveP?-Math.log10(pRaw):NaN;
              if(hasPositiveP && !Number.isFinite(negLogP)){
                negLogP=-Math.log10(Number.MIN_VALUE);
              }
              const isSignificant=hasPositiveP && Math.abs(log2fcVal)>=log2fcThreshold && Number.isFinite(negLogP) && negLogP>=negLogPThreshold;
              points.push({x:meanExpr,y:log2fcVal,label:lab,isSignificant,meta:{log2fc:log2fcVal,pValue:hasPositiveP?pRaw:NaN,negLogP}});
              if(isSignificant) significantCount++;
              if(!hasPositiveP){
                maMissingPCount++;
                console.debug('Debug: MA missing positive p-value',{row:r,pRaw});
              }
              if(lab) labelSet.add(lab);
              if(meanExpr<xMinRaw) xMinRaw=meanExpr;
              if(meanExpr>xMaxRaw) xMaxRaw=meanExpr;
              if(log2fcVal<yMinRaw) yMinRaw=log2fcVal;
              if(log2fcVal>yMaxRaw) yMaxRaw=log2fcVal;
            }else{
              skippedRows++;
              console.debug('Debug: MA row skipped',{row:r,meanExpr,log2fcVal,pRaw});
            }
          }
          if(r%10000===0){
            console.log('scatter collect progress',{row:r,token});
          }
        }
        console.timeEnd(`scatterCollectPoints_${token}`);
        if(skippedRows>0){
          console.debug('Debug: scatter skipped rows summary',{graphType,skippedRows});
        }
        if(maMissingPCount>0){
          console.debug('Debug: MA missing p-values summary',{count:maMissingPCount});
        }
        const labelsUsed=Array.from(labelSet);
        updateScatterLabelColorPickers(labelsUsed);
        console.log('scatter points collected',points.length,{xMinRaw,xMaxRaw,yMinRaw,yMaxRaw,graphType});
        const legendEntries=[];
        const significanceLegendNeeded=scatterCurrentGraphType!=='scatter';
        if(scatterCurrentGraphType==='scatter'){
          labelsUsed.forEach(labelName=>{
            legendEntries.push({label:labelName,fill:scatterLabelColors[labelName]||fill});
          });
        }else if(significanceLegendNeeded){
          legendEntries.push({label:'Significant',fill:SIGNIFICANT_COLOR});
          legendEntries.push({label:'Not significant',fill});
        }
        const legendRenderer=chartStyle.createLegendRenderer({
          entries:legendEntries,
          fontSize:fs
        });
        const legendGapPx=legendRenderer.entries.length?Math.max(12,Math.round(fs*0.5)):0;
        const legendWidth=legendRenderer.entries.length?legendRenderer.width+legendGapPx:0;
        console.debug('Debug: scatter legend metrics',{legendWidth,legendGapPx,entryCount:legendRenderer.entries.length,graphType:scatterCurrentGraphType});
        if(token!==scatterDrawToken){console.log('scatter draw cancelled after collect',{token});return;}
        const plotEl=document.getElementById('scatterPlot');
        plotEl.style.display='block';
        while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
        document.getElementById('scatterStatsResults').innerHTML='';
        if(!points.length){
          plotEl.innerHTML='<i>No valid data points to plot.</i>';
          console.debug('Debug: scatter plot aborted due to empty dataset',{graphType});
          return;
        }
        if(logX&&points.some(p=>p.x<=0)){plotEl.innerHTML='<i>Log scale requires positive X values.</i>';return;}
        if(logY&&points.some(p=>p.y<=0)){plotEl.innerHTML='<i>Log scale requires positive Y values.</i>';return;}
        let xMin=xMinRaw, xMax=xMaxRaw, yMin=yMinRaw, yMax=yMaxRaw;
        if(isFinite(xMinManual)) xMin=xMinManual;
        if(isFinite(xMaxManual)) xMax=xMaxManual;
        if(isFinite(yMinManual)) yMin=yMinManual;
        if(isFinite(yMaxManual)) yMax=yMaxManual;
        if(originMode==='custom'){
          if(isFinite(originXInput)){
            if(logX && originXInput<=0){
              console.log('scatter custom origin ignored for X in log scale', originXInput);
            }else{
              if(originXInput<xMin) xMin=originXInput;
              if(originXInput>xMax) xMax=originXInput;
            }
          }
          if(isFinite(originYInput)){
            if(logY && originYInput<=0){
              console.log('scatter custom origin ignored for Y in log scale', originYInput);
            }else{
              if(originYInput<yMin) yMin=originYInput;
              if(originYInput>yMax) yMax=originYInput;
            }
          }
          console.log('scatter range adjusted for custom origin',{xMin,xMax,yMin,yMax});
        }
        if(xMin===xMax) xMax=xMin+1;
        if(yMin===yMax) yMax=yMin+1;
        console.log('scatter final raw range',{xMin,xMax,yMin,yMax});
        const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
        const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
        plotEl.style.position='relative';
        const svg=document.createElementNS(NS,'svg');
        svg.setAttribute('id','scatterSvg');
        svg.setAttribute('width',String(W));
        svg.setAttribute('height',String(H));
        svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
        svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
        chartStyle.applySvgDefaults(svg);
        plotEl.appendChild(svg);
        if(fontControls && typeof fontControls.enableForSvg === 'function'){
          fontControls.enableForSvg(svg,{ scopeId: 'scatter' });
          console.debug('Debug: scatter fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
        } else {
          console.debug('Debug: scatter fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
        }
        const xMinT=logX?Math.log10(xMin):xMin;
        const xMaxT=logX?Math.log10(xMax):xMax;
        const yMinT=logY?Math.log10(yMin):yMin;
        const yMaxT=logY?Math.log10(yMax):yMax;
        function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);}
        function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(Math.max(maxTicks-1,1)),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
        let xTickTarget=chartStyle.estimateTickCount(W,{axis:'x',fallback:6});
        let yTickTarget=chartStyle.estimateTickCount(H,{axis:'y',fallback:6});
        console.debug('Debug: scatter initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
        function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
        const tickFont=chartStyle.makeFont(fs);
        const axisLabelFont=chartStyle.makeFont(fs);
        const yTitleWidthBase=chartStyle.measureText(scatterYLabelText,axisLabelFont);
        const tickLen=axisMetrics.tickLength;
        const tickGap=axisMetrics.tickLabelGap;
        let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth:0,yTitleWidth:yTitleWidthBase,axisMetrics});
        margin.left=Math.max(margin.left,fs*0.5);
        let plotW=Math.max(20,W-margin.left-margin.right);
        let plotH=Math.max(20,H-margin.top-margin.bottom);
        let bottomLayout=chartStyle.computeBottomLayout({labels:[],fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
        margin.bottom=bottomLayout.bottom;
        plotW=Math.max(20,W-margin.left-margin.right);
        plotH=Math.max(20,H-margin.top-margin.bottom);
        let xScale=niceScale(xMinT,xMaxT,xTickTarget);
        let yScale=niceScale(yMinT,yMaxT,yTickTarget);
        let xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
        let yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
        let maxYLabelWidth=0;
        let maxXLabelWidth=0;
        for(let pass=0;pass<2;pass++){
          xScale=niceScale(xMinT,xMaxT,xTickTarget);
          yScale=niceScale(yMinT,yMaxT,yTickTarget);
          if(isFinite(xMinManual)) xScale.min=xMinT;
          if(isFinite(xMaxManual)) xScale.max=xMaxT;
          if(isFinite(yMinManual)) yScale.min=yMinT;
          if(isFinite(yMaxManual)) yScale.max=yMaxT;
          if(isFinite(xMinManual)||isFinite(xMaxManual)){
            const manualXTicks=[];
            for(let v=Math.ceil(xScale.min/xScale.step)*xScale.step;v<=xScale.max+1e-9;v+=xScale.step){
              manualXTicks.push(v);
            }
            xScale.ticks=manualXTicks;
          }
          if(isFinite(yMinManual)||isFinite(yMaxManual)){
            const manualYTicks=[];
            for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step;v<=yScale.max+1e-9;v+=yScale.step){
              manualYTicks.push(v);
            }
            yScale.ticks=manualYTicks;
          }
          xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
          yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
          const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
          maxYLabelWidth=Math.max(...yLabelWidths,0);
          const xLabelWidths=xTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
          maxXLabelWidth=Math.max(...xLabelWidths,0);
          margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth,yTitleWidth:yTitleWidthBase,axisMetrics});
          margin.left=Math.max(margin.left,maxYLabelWidth+tickLen+tickGap+fs*0.5);
          plotW=Math.max(20,W-margin.left-margin.right);
          plotH=Math.max(20,H-margin.top-margin.bottom);
          bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
          margin.bottom=bottomLayout.bottom;
          plotW=Math.max(20,W-margin.left-margin.right);
          plotH=Math.max(20,H-margin.top-margin.bottom);
          const refinedX=chartStyle.estimateTickCount(plotW,{axis:'x',fallback:xTickTarget});
          const refinedY=chartStyle.estimateTickCount(plotH,{axis:'y',fallback:yTickTarget});
          console.debug('Debug: scatter tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxXLabelWidth,maxYLabelWidth});
          if(refinedX===xTickTarget && refinedY===yTickTarget){
            break;
          }
          xTickTarget=refinedX;
          yTickTarget=refinedY;
        }
        console.debug('Debug: scatter layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,maxXLabelWidth,maxYLabelWidth});
        const aspectData=scatterSvgBox?.dataset;
        const shouldLockAspect=aspectData?.resizerAspectLocked==='true';
        console.debug('Debug: scatter aspect ratio decision',{shouldLockAspect,storedRatio:aspectData?.resizerAspectRatio}); // Debug: scatter aspect toggle decision
        if(shouldLockAspect){
          const square=chartStyle.ensureSquarePlot(W,H,margin);
          margin=square.margin;
          plotW=square.plotW;
          plotH=square.plotH;
          if(aspectData){
            const derivedRatio=plotH>0?plotW/plotH:NaN;
            if(Number.isFinite(derivedRatio)){
              aspectData.resizerAspectRatio=String(derivedRatio);
            }
          }
          console.debug('Debug: scatter layout (locked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: scatter square enforcement branch
        }else{
          console.debug('Debug: scatter layout (unlocked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: scatter free resize branch
        }
        const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
        const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
        function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
        if(showGrid){
          xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':axisStrokeWidth});});
          yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':axisStrokeWidth});});
          console.debug('Debug: scatter grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,axisStrokeWidth});
        }
        let originXT,originYT;
        if(originMode==='custom'){originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);}else{originXT=xScale.min;originYT=yScale.min;}
        const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max);
        const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max);
        console.log('scatter origin final',{originXT,originYT,clampedXT,clampedYT});
        const xAxisY=y2px(clampedYT);
        const yAxisX=x2px(clampedXT);
        console.log('scatter axes',{tickLen,xAxisY,yAxisX});
        const xTickPositions=xScale.ticks.map(t=>x2px(t));
        const yTickPositions=yScale.ticks.map(t=>y2px(t));
        let axisXStart=xTickPositions.length?Math.min(...xTickPositions):margin.left;
        let axisXEnd=xTickPositions.length?Math.max(...xTickPositions):margin.left+plotW;
        let axisYStart=yTickPositions.length?Math.min(...yTickPositions):margin.top;
        let axisYEnd=yTickPositions.length?Math.max(...yTickPositions):margin.top+plotH;
        if(axisXStart===axisXEnd){axisXStart=margin.left;axisXEnd=margin.left+plotW;}
        if(axisYStart===axisYEnd){axisYStart=margin.top;axisYEnd=margin.top+plotH;}
        console.debug('Debug: scatter axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
        const axisStroke = '#000';
        add('line',{x1:axisXStart,y1:xAxisY,x2:axisXEnd,y2:xAxisY,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
        add('line',{x1:yAxisX,y1:axisYStart,x2:yAxisX,y2:axisYEnd,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
        console.debug('Debug: scatter axes stroke scaled',{axisStrokeWidth});
        if(showFrame){
          console.debug('Debug: scatter frame request',{stroke:axisStroke, showFrame}); // Debug: frame styling inputs
          chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, sides: ['top','right'] });
        }
        // Frame closes scatter plot using axis styling continuity
        const xTickNodes=[];
        let xTickFontCount=0;
        xScale.ticks.forEach((t,i)=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:'#000','stroke-width':axisStrokeWidth});const txt=add('text',{x,y:xAxisY+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logX?Math.pow(10,t):t);markFontEditable(txt,'xTick');xTickFontCount+=1;xTickNodes.push(txt);});
        chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
        let yTickFontCount=0;
        yScale.ticks.forEach((t,i)=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:'#000','stroke-width':axisStrokeWidth});const txt=add('text',{x:yAxisX-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logY?Math.pow(10,t):t);markFontEditable(txt,'yTick');yTickFontCount+=1;});
        console.debug('Debug: scatter font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
        console.debug('Debug: scatter ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
        console.time(`scatterSvgDraw_${token}`);
        const frag=document.createDocumentFragment();
        const labelBBox=new Map();
        let pointIndex=0;
        for(const p of points){
          const xv=logX?Math.log10(p.x):p.x;
          const yv=logY?Math.log10(p.y):p.y;
          const c=document.createElementNS(NS,'circle');
          c.setAttribute('cx',x2px(xv));
          c.setAttribute('cy',y2px(yv));
          c.setAttribute('r',dotSizePx);
          const color=scatterCurrentGraphType==='scatter'
            ? (scatterLabelColors[p.label]||fill)
            : (p.isSignificant?SIGNIFICANT_COLOR:fill);
          c.setAttribute('fill',color);
          c.setAttribute('fill-opacity',1-alpha);
          if(borderWidthPx>0){c.setAttribute('stroke',borderColor);c.setAttribute('stroke-width',borderWidthPx);c.setAttribute('stroke-opacity',1-alpha);}
          const cxVal=x2px(xv), cyVal=y2px(yv);
          let bbox=labelBBox.get(p.label||'__none');
          if(!bbox){bbox={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}; labelBBox.set(p.label||'__none',bbox);}
          bbox.minX=Math.min(bbox.minX,cxVal-dotSizePx);
          bbox.maxX=Math.max(bbox.maxX,cxVal+dotSizePx);
          bbox.minY=Math.min(bbox.minY,cyVal-dotSizePx);
          bbox.maxY=Math.max(bbox.maxY,cyVal+dotSizePx);
          frag.appendChild(c);
          if(scatterCurrentGraphType!=='scatter' && p.isSignificant && p.label){
            const labelNode=document.createElementNS(NS,'text');
            labelNode.setAttribute('x',cxVal+dotSizePx+2);
            labelNode.setAttribute('y',cyVal-(dotSizePx+2));
            labelNode.setAttribute('font-size',Math.max(fs*0.75,8));
            labelNode.setAttribute('fill',SIGNIFICANT_COLOR);
            labelNode.setAttribute('text-anchor','start');
            labelNode.textContent=p.label;
            markFontEditable(labelNode,'annotation',`annotation-${labelAnnotations.length}`);
            labelAnnotations.push(labelNode);
          }
          pointIndex++;
          if(pointIndex%10000===0){console.log('scatter svg draw progress',{pointIndex,token});}
        }
        add('g',{}).appendChild(frag);
        if(labelAnnotations.length){
          const annotationLayer=document.createElementNS(NS,'g');
          labelAnnotations.forEach(node=>annotationLayer.appendChild(node));
          svg.appendChild(annotationLayer);
          console.debug('Debug: scatter annotations rendered',{count:labelAnnotations.length,graphType:scatterCurrentGraphType});
        }
        console.timeEnd(`scatterSvgDraw_${token}`);
        if(legendRenderer.entries.length){
          const plotRight=margin.left+plotW;
          const legendX=plotRight+legendGapPx;
          legendRenderer.draw(svg,{x:legendX,y:margin.top});
          console.debug('Debug: scatter legend rendered shared helper',{legendX,legendGapPx,entryCount:legendRenderer.entries.length});
        }
        const xAxisBase=margin.top+plotH;
        const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        xText.textContent=scatterXLabelText;
        markFontEditable(xText,'xTitle','xTitle');
        makeEditableLocal(xText,txt=>{scatterXLabelText=txt;});
        const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
        console.log('scatter y-axis position',yX);
        const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        yText.textContent=scatterYLabelText;
        markFontEditable(yText,'yTitle','yTitle');
        makeEditableLocal(yText,txt=>{scatterYLabelText=txt;});
        const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        titleText.textContent=scatterTitleText;
        markFontEditable(titleText,'graphTitle','graphTitle');
        makeEditableLocal(titleText,txt=>{scatterTitleText=txt;});
        if(scatterCurrentGraphType==='scatter'){
          const regressionModeValue = scatterRegressionMode ? (scatterRegressionMode.value || 'linear') : 'linear';
          const stats=computeScatterStats(points,method,{ regressionMode: regressionModeValue, domain: { minX: xMin, maxX: xMax } });
          if(token!==scatterDrawToken){console.log('scatter draw cancelled before stats',{token});return;}
          const regressionModel = stats.regression;
          scatterLastRegressionSummary = typeof regressionTools.createSummary === 'function' ? regressionTools.createSummary(regressionModel) : null;
          if(showLine && regressionModel){
            const intervalSamplesRaw = Array.isArray(regressionModel.intervals?.samples) ? regressionModel.intervals.samples.slice() : [];
            const intervalSamples = intervalSamplesRaw.sort((a,b)=> (a?.x ?? 0) - (b?.x ?? 0));
            const intervalLayer = (showIntervals && intervalSamples.length >= 2) ? document.createElementNS(NS,'g') : null;
            if(intervalLayer){
              intervalLayer.setAttribute('data-layer','interval-bands');
              svg.appendChild(intervalLayer);
              const buildIntervalPath = (lowerKey, upperKey) => {
                const upperPoints=[];
                const lowerPoints=[];
                intervalSamples.forEach(sample => {
                  const xRaw = sample?.x;
                  const upperRaw = sample?.[upperKey];
                  const lowerRaw = sample?.[lowerKey];
                  if(!Number.isFinite(xRaw) || !Number.isFinite(upperRaw) || !Number.isFinite(lowerRaw)){
                    return;
                  }
                  if(logX && xRaw <= 0){
                    return;
                  }
                  if(logY && (upperRaw <= 0 || lowerRaw <= 0)){
                    return;
                  }
                  const xVal = logX ? Math.log10(xRaw) : xRaw;
                  const upperVal = logY ? Math.log10(upperRaw) : upperRaw;
                  const lowerVal = logY ? Math.log10(lowerRaw) : lowerRaw;
                  if(!Number.isFinite(xVal) || !Number.isFinite(upperVal) || !Number.isFinite(lowerVal)){
                    return;
                  }
                  upperPoints.push({ x: x2px(xVal), y: y2px(upperVal) });
                  lowerPoints.push({ x: x2px(xVal), y: y2px(lowerVal) });
                });
                if(upperPoints.length < 2 || lowerPoints.length < 2){
                  return null;
                }
                const commands=[];
                upperPoints.forEach((pt, idx)=>{
                  commands.push(`${idx?'L':'M'}${pt.x},${pt.y}`);
                });
                lowerPoints.slice().reverse().forEach(pt=>{
                  commands.push(`L${pt.x},${pt.y}`);
                });
                commands.push('Z');
                return commands.join(' ');
              };
              const confidencePath = buildIntervalPath('ciLow','ciHigh');
              const predictionPath = buildIntervalPath('piLow','piHigh');
              if(confidencePath){
                const confEl=document.createElementNS(NS,'path');
                confEl.setAttribute('d',confidencePath);
                confEl.setAttribute('fill','#d62728');
                confEl.setAttribute('fill-opacity','0.15');
                confEl.setAttribute('stroke','none');
                confEl.dataset.band='confidence';
                intervalLayer.appendChild(confEl);
              }
              if(predictionPath){
                const predEl=document.createElementNS(NS,'path');
                predEl.setAttribute('d',predictionPath);
                predEl.setAttribute('fill','#d62728');
                predEl.setAttribute('fill-opacity','0.08');
                predEl.setAttribute('stroke','none');
                predEl.dataset.band='prediction';
                intervalLayer.appendChild(predEl);
              }
              console.debug('Debug: scatter interval shading rendered', {
                sampleCount: intervalSamples.length,
                hasConfidence: !!confidencePath,
                hasPrediction: !!predictionPath
              });
            }
            const sampleCount = regressionModel.mode === 'linear' ? 60 : 160;
            const samples = typeof regressionTools.sampleCurve === 'function'
              ? regressionTools.sampleCurve(regressionModel,{ minX: xMin, maxX: xMax, sampleCount })
              : [];
            const pathCommands = [];
            samples.forEach((sample, idx) => {
              if(!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return;
              if(logX && sample.x <= 0) return;
              if(logY && sample.y <= 0) return;
              const xVal = logX ? Math.log10(sample.x) : sample.x;
              const yVal = logY ? Math.log10(sample.y) : sample.y;
              if(!Number.isFinite(xVal) || !Number.isFinite(yVal)) return;
              const command = `${pathCommands.length?'L':'M'}${x2px(xVal)},${y2px(yVal)}`;
              pathCommands.push(command);
            });
            if(pathCommands.length>1){
              const strokeWidth=chartStyle.scaleStrokeWidth(1.5, styleScaleInfo, { context: 'scatter-trend', min: 0.75 });
              const path=add('path',{d:pathCommands.join(' '),fill:'none',stroke:'#d00','stroke-width':strokeWidth});
              path.setAttribute('vector-effect','non-scaling-stroke');
              console.debug('Debug: scatter regression path drawn',{ mode: regressionModel.mode, commandCount: pathCommands.length, strokeWidth });
            }else{
              console.debug('Debug: scatter regression path skipped',{ mode: regressionModel.mode, pathCommands: pathCommands.length });
            }
            const infoLines=[];
            if(regressionModel?.summary?.equation){
              infoLines.push(regressionModel.summary.equation);
            }else if(Number.isFinite(stats.m) && Number.isFinite(stats.b)){
              const eq=`y=${stats.m.toFixed(2)}x${stats.b>=0?'+':'-'}${Math.abs(stats.b).toFixed(2)}`;
              infoLines.push(eq);
            }
            infoLines.push(`r=${formatMetricValue(stats.r,2)} R²=${formatMetricValue(stats.r2,2)} p=${formatP(stats.p)}`);
            if(regressionModel?.metrics){
              if(Number.isFinite(regressionModel.metrics.rmse) || Number.isFinite(regressionModel.metrics.mae)){
                infoLines.push(`RMSE=${formatMetricValue(regressionModel.metrics.rmse,3)} MAE=${formatMetricValue(regressionModel.metrics.mae,3)}`);
              }
            }
            const infoX=margin.left+plotW-4;
            const infoY=stats.m>=0?margin.top+plotH-(fs*2):margin.top+fs*2;
            const info=add('text',{x:infoX,y:infoY,'text-anchor':'end','font-size':fs,fill:'#000'});
            infoLines.forEach((line,lineIdx)=>{
              const t=document.createElementNS(NS,'tspan');
              t.setAttribute('x',infoX);
              t.setAttribute('dy',lineIdx===0?0:fs);
              t.textContent=line;
              info.appendChild(t);
            });
          }else{
            console.debug('Debug: scatter regression trend omitted',{ showLine, hasModel: !!regressionModel });
          }
          const resDiv=document.getElementById('scatterStatsResults');
          const rows=[];
          rows.push({ metric:'r', value: formatMetricValue(stats.r) });
          rows.push({ metric:'P value', value: formatP(stats.p) });
          if(regressionModel?.metrics){
            rows.push({ metric:'R²', value: formatMetricValue(regressionModel.metrics.r2) });
            if(Number.isFinite(regressionModel.metrics.adjR2)){
              rows.push({ metric:'Adjusted R²', value: formatMetricValue(regressionModel.metrics.adjR2) });
            }
            rows.push({ metric:'RMSE', value: formatMetricValue(regressionModel.metrics.rmse) });
            rows.push({ metric:'MAE', value: formatMetricValue(regressionModel.metrics.mae) });
            if(Number.isFinite(regressionModel.metrics.logLoss)){
              rows.push({ metric:'Log loss', value: formatMetricValue(regressionModel.metrics.logLoss,6) });
            }
          }else{
            rows.push({ metric:'R²', value: formatMetricValue(stats.r2) });
          }
          if(regressionModel?.summary){
            if(Number.isFinite(regressionModel.summary.slope)){
              rows.push({ metric:'Slope', value: formatMetricValue(regressionModel.summary.slope) });
            }
            if(Number.isFinite(regressionModel.summary.intercept)){
              rows.push({ metric:'Intercept', value: formatMetricValue(regressionModel.summary.intercept) });
            }
            const coefficientStats = Array.isArray(regressionModel.coefficientStats) ? regressionModel.coefficientStats : [];
            const interceptStats = coefficientStats.find(stat => stat && /intercept/i.test(stat.term || ''));
            const slopeStats = coefficientStats.find(stat => stat && (/slope/i.test(stat.term || '') || /x\^1/.test(stat.term || '')));
            if(showDiagnostics){
              if(interceptStats && Number.isFinite(interceptStats.standardError)){
                rows.push({ metric:'Intercept ± SE', value: `${formatMetricValue(interceptStats.estimate)} ± ${formatMetricValue(interceptStats.standardError)}` });
              }
              if(slopeStats && Number.isFinite(slopeStats.standardError)){
                rows.push({ metric:'Slope ± SE', value: `${formatMetricValue(slopeStats.estimate)} ± ${formatMetricValue(slopeStats.standardError)}` });
              }
              if(slopeStats && Number.isFinite(slopeStats.tStatistic)){
                rows.push({ metric:'Slope t-stat', value: formatMetricValue(slopeStats.tStatistic,3) });
              }
              if(slopeStats && Number.isFinite(slopeStats.pValue)){
                rows.push({ metric:'Slope p-value', value: formatP(slopeStats.pValue) });
              }
            }
            if(showIntervals){
              if(interceptStats && Number.isFinite(interceptStats.ciLow) && Number.isFinite(interceptStats.ciHigh)){
                rows.push({ metric:'Intercept CI', value: `${formatMetricValue(interceptStats.ciLow)} – ${formatMetricValue(interceptStats.ciHigh)}` });
              }
              if(slopeStats && Number.isFinite(slopeStats.ciLow) && Number.isFinite(slopeStats.ciHigh)){
                rows.push({ metric:'Slope CI', value: `${formatMetricValue(slopeStats.ciLow)} – ${formatMetricValue(slopeStats.ciHigh)}` });
              }
            }
          }else{
            rows.push({ metric:'Slope', value: formatMetricValue(stats.m) });
            rows.push({ metric:'Intercept', value: formatMetricValue(stats.b) });
          }
          if(regressionModel?.residuals){
            rows.push({ metric:'Residual mean', value: formatMetricValue(regressionModel.residuals.mean) });
            rows.push({ metric:'Residual SD', value: formatMetricValue(regressionModel.residuals.sd) });
          }
          if(showIntervals && regressionModel?.intervals?.summary){
            const summary = regressionModel.intervals.summary;
            if(Number.isFinite(summary.ciMin) && Number.isFinite(summary.ciMax)){
              rows.push({ metric:'Confidence interval (y)', value: `${formatMetricValue(summary.ciMin)} – ${formatMetricValue(summary.ciMax)}` });
            }
            if(Number.isFinite(summary.piMin) && Number.isFinite(summary.piMax)){
              rows.push({ metric:'Prediction interval (y)', value: `${formatMetricValue(summary.piMin)} – ${formatMetricValue(summary.piMax)}` });
            }
          }
          if(showDiagnostics && regressionModel?.diagnostics){
            rows.push({ metric:'Residual skewness', value: formatMetricValue(regressionModel.diagnostics.skewness,3) });
            rows.push({ metric:'Residual kurtosis', value: formatMetricValue(regressionModel.diagnostics.kurtosis,3) });
            if(Number.isFinite(regressionModel.diagnostics.jarqueBera)){
              rows.push({ metric:'Jarque-Bera', value: formatMetricValue(regressionModel.diagnostics.jarqueBera,3) });
            }
            if(Number.isFinite(regressionModel.diagnostics.jarqueBeraP)){
              rows.push({ metric:'Jarque-Bera p', value: formatP(regressionModel.diagnostics.jarqueBeraP) });
            }
          }
          if(regressionModel?.warnings?.length){
            rows.push({ metric:'Warnings', value: regressionModel.warnings.join('; ') });
          }
          renderStatsCard(resDiv,{
            caption:`${stats.method} correlation (${regressionModeValue} regression)`,
            columns:[
              {key:'metric',label:'Metric',align:'left'},
              {key:'value',label:'Value',align:'right'}
            ],
            rows,
            options:{
              fileName:'scatter-correlation',
              contextLabel:'scatter-correlation'
            }
          });
          console.log('scatter stats',{ stats, regressionSummary: scatterLastRegressionSummary });
        }else{
          scatterLastRegressionSummary=null;
          const resDiv=document.getElementById('scatterStatsResults');
          const nonSigCount=points.length-significantCount;
          const negLabel=scatterCurrentGraphType==='ma' ? (extraLabelRaw && String(extraLabelRaw).trim() ? `-log10(${String(extraLabelRaw).trim()})` : '-log10(p-value)') : scatterYLabelText;
          let summaryRows=`<tr><th>Total points</th><td>${points.length}</td></tr>`+
            `<tr><th>Significant</th><td>${significantCount}</td></tr>`+
            `<tr><th>Not significant</th><td>${nonSigCount}</td></tr>`+
            `<tr><th>|log₂FC| ≥</th><td>${log2fcThreshold.toFixed(2)}</td></tr>`+
            `<tr><th>${negLabel} ≥</th><td>${negLogPThreshold.toFixed(2)}</td></tr>`;
          if(maMissingPCount>0){
            summaryRows+=`<tr><th>Missing p-values</th><td>${maMissingPCount}</td></tr>`;
          }
          renderStatsCard(resDiv,{
            caption: scatterCurrentGraphType==='ma' ? 'Differential expression summary' : 'Significance summary',
            columns:[
              {key:'metric',label:'Metric',align:'left'},
              {key:'value',label:'Value',align:'right'}
            ],
            rows:(()=>{
              const rows=[
                { metric:'Total points', value:String(points.length) },
                { metric:'Significant', value:String(significantCount) },
                { metric:'Not significant', value:String(nonSigCount) },
                { metric:'|log₂FC| ≥', value:log2fcThreshold.toFixed(2) },
                { metric:`${negLabel} ≥`, value:negLogPThreshold.toFixed(2) }
              ];
              if(maMissingPCount>0){
                rows.push({ metric:'Missing p-values', value:String(maMissingPCount) });
              }
              return rows;
            })(),
            options:{
              fileName:'scatter-threshold-summary',
              contextLabel:'scatter-threshold'
            }
          });
          console.debug('Debug: scatter significance summary',{graphType:scatterCurrentGraphType,significantCount,nonSigCount,log2fcThreshold,negLogPThreshold,missingP:maMissingPCount});
        }
        autoResizeSvg(svg);
        scatterLayout?.syncPanels?.();
        console.log('scatter render complete with enhanced styles');
      }
      scheduleDrawScatter = Shared.debounceFrame(drawScatter);
      scatterLayout?.setScheduleDraw?.(() => scheduleDrawScatter());
      console.debug('Debug: scatter scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    
    
      function computeScatterStats(points,method,options={}){
        console.log('computeScatterStats',method,points.length,options);
        const regressionMode = options.regressionMode || 'linear';
        const domainOption = options.domain || null;
        const x=points.map(p=>p.x);
        const y=points.map(p=>p.y);
        const n=points.length;
        if(n<3){
          return {method, r:NaN, p:NaN, r2:NaN, m:NaN, b:NaN, regression:null};
        }
        const pearson=jStat.corrcoeff(x,y);
        let r,label;
        if(method==='pearson'){r=pearson; label='Pearson';}
        else {r=jStat.spearmancoeff(x,y); label='Spearman';}
        const t=r*Math.sqrt((n-2)/(1-r*r));
        const p=2*(1-jStat.studentt.cdf(Math.abs(t),n-2));
        const xMean=jStat.mean(x);
        const yMean=jStat.mean(y);
        const num=x.reduce((s,xi,i)=>s+(xi-xMean)*(y[i]-yMean),0);
        const den=x.reduce((s,xi)=>s+Math.pow(xi-xMean,2),0);
        const linearSlope=den!==0?num/den:NaN;
        const linearIntercept=yMean-linearSlope*xMean;
        let regression=null;
        if(typeof regressionTools.fitRegression==='function'){
          try{
            regression=regressionTools.fitRegression(points,{ mode: regressionMode });
            if(regression && domainOption){
              const minCandidate = Number.isFinite(domainOption.minX) ? domainOption.minX : Number.isFinite(domainOption.min) ? domainOption.min : undefined;
              const maxCandidate = Number.isFinite(domainOption.maxX) ? domainOption.maxX : Number.isFinite(domainOption.max) ? domainOption.max : undefined;
              if(Number.isFinite(minCandidate) && Number.isFinite(maxCandidate)){
                regression.domain = { minX: minCandidate, maxX: maxCandidate };
              }
            }
          }catch(err){
            console.error('Regression fit error', err);
          }
        }
        const regressionSlope = regression?.summary?.slope;
        const regressionIntercept = regression?.summary?.intercept;
        const resolvedSlope = Number.isFinite(regressionSlope) ? regressionSlope : linearSlope;
        const resolvedIntercept = Number.isFinite(regressionIntercept) ? regressionIntercept : linearIntercept;
        const regressionR2 = regression?.metrics?.r2;
        const r2 = Number.isFinite(regressionR2) ? regressionR2 : pearson*pearson;
        const stats={method:label, r, p, r2, m:resolvedSlope, b:resolvedIntercept, regression};
        console.log('computeScatterStats result',{method:label,r,r2,p,m:resolvedSlope,b:resolvedIntercept,mode:regressionMode});
        return stats;
      }
      function updateLineStats(series){
        const method=lineStatType.value;
        const regressionEl=global.lineRegressionMode || document.getElementById('lineRegressionMode');
        const regressionMode=(regressionEl&&regressionEl.value)||'linear';
        console.log('updateLineStats start',{seriesCount:series.length,method,regressionMode});
        const tableRows=[];
        let methodLabel='';
        series.forEach(s=>{
          const pts=s.points.filter(p=>p);
          if(pts.length>=3){
            const stats=computeScatterStats(pts,method,{ regressionMode });
            methodLabel=stats.method;
            tableRows.push({
              series:s.name,
              r:formatMetricValue(stats.r),
              p:formatP(stats.p),
              slope:formatMetricValue(stats.regression?.summary?.slope ?? stats.m),
              r2:formatMetricValue(stats.regression?.metrics?.r2 ?? stats.r2),
              rmse:formatMetricValue(stats.regression?.metrics?.rmse)
            });
          }
        });
        if(tableRows.length){
          renderStatsCard(lineStatsResults,{
            caption:methodLabel?`${methodLabel} correlation summary (${regressionMode} regression)`:'Correlation summary',
            columns:[
              {key:'series',label:'Series',align:'left'},
              {key:'r',label:'r',align:'right'},
              {key:'p',label:'p',align:'right'},
              {key:'slope',label:'Slope',align:'right'},
              {key:'r2',label:'R²',align:'right'},
              {key:'rmse',label:'RMSE',align:'right'}
            ],
            rows:tableRows,
            options:{
              fileName:'scatter-series-correlation',
              contextLabel:'scatter-series-corr'
            }
          });
        }else{
          lineStatsResults.textContent='Not enough data for statistics.';
        }
        console.log('updateLineStats complete',{rows:tableRows.length,regressionMode});
      }
      function updateHistStats(values){
        console.log('updateHistStats start',values.length);
        if(!values.length){histStatsResults.textContent='No data';return;}
        const mean=jStat.mean(values);
        const median=jStat.median(values);
        const sd=jStat.stdev(values,true);
        renderStatsCard(histStatsResults,{
          caption:'Distribution summary',
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows:[
            {metric:'n',value:String(values.length)},
            {metric:'Mean',value:mean.toFixed(4)},
            {metric:'Median',value:median.toFixed(4)},
            {metric:'SD',value:sd.toFixed(4)}
          ],
          options:{
            fileName:'histogram-summary',
            contextLabel:'hist-summary'
          }
        });
        console.log('updateHistStats result',{mean,median,sd});
      }
      function updatePieStats(labels,observed,expected){
        console.log('updatePieStats start',{labels:labels.length,observed:observed.length,expected:expected.length});
        if(!observed.length){pieStatsResults.textContent='No data';return;}
        if(expected.length!==observed.length || expected.some(e=>isNaN(e))){
          pieStatsResults.textContent='Expected values required';
          return;
        }
        const chi2=observed.reduce((s,o,i)=>s+Math.pow(o-expected[i],2)/expected[i],0);
        const df=observed.length-1;
        const p=1-jStat.chisquare.cdf(chi2,df);
        renderStatsCard(pieStatsResults,{
          caption:'Goodness-of-fit test',
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows:[
            {metric:'Chi²',value:chi2.toFixed(4)},
            {metric:'df',value:String(df)},
            {metric:'p-value',value:isFinite(p)?formatP(p):'N/A'}
          ],
          options:{
            fileName:'pie-chi-square',
            contextLabel:'pie-chi-square'
          }
        });
        console.log('updatePieStats result',{chi2,df,p});
      }
    
      function getScatterGraphPayload(){
        return {
          type:'scatter',
          data:scatterHot.getData(),
          config:{
            title:scatterTitleText,
            xLabel:scatterXLabelText,
            yLabel:scatterYLabelText,
            dotSize:scatterDotSize.value,
            fill:scatterFill.value,
            border:scatterBorder.value,
            borderWidth:scatterBorderWidth.value,
            alpha:scatterAlpha.value,
            labelColors:scatterLabelColors,
            showGrid:scatterShowGrid.checked,
            showFrame:scatterShowFrame.checked,
            logX:scatterLogX.checked,
            logY:scatterLogY.checked,
            xMin:scatterXMin.value,
            xMax:scatterXMax.value,
            yMin:scatterYMin.value,
            yMax:scatterYMax.value,
            originMode:scatterOriginMode.value,
            originX:scatterOriginX.value,
            originY:scatterOriginY.value,
            showLine:scatterShowLine.checked,
            showIntervals:scatterShowIntervals ? scatterShowIntervals.checked : false,
            showDiagnostics:scatterShowDiagnostics ? scatterShowDiagnostics.checked : false,
            graphType:scatterGraphTypeSelect?.value || 'scatter',
            log2fcThreshold:scatterLog2FCThreshold?.value || '',
            negLogPThreshold:scatterNegLogPThreshold?.value || '',
            regression:{
              mode: scatterRegressionMode ? (scatterRegressionMode.value || 'linear') : 'linear',
              summary: scatterLastRegressionSummary
            }
          }
        };
      }
      let scatterFileHandle=null, scatterFileName='scatter.graph';
      async function saveScatterFile(){
        console.debug('Debug: saveScatterFile invoked', { hasHandle: !!scatterFileHandle });
        if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
          console.error('saveScatterFile missing fileIO.saveGraphFile');
          return;
        }
        const result = await fileIO.saveGraphFile({
          context: 'scatter',
          fileHandle: scatterFileHandle,
          getPayload: getScatterGraphPayload,
          fileName: scatterFileName,
          downloadFileName: scatterFileName,
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; }
        });
        console.debug('Debug: saveScatterFile result', result);
      }
      async function saveAsScatterFile(){
        console.debug('Debug: saveAsScatterFile invoked', { currentName: scatterFileName });
        if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
          console.error('saveAsScatterFile missing fileIO.saveGraphFileAs');
          return;
        }
        const result = await fileIO.saveGraphFileAs({
          context: 'scatter',
          getPayload: getScatterGraphPayload,
          fileName: scatterFileName,
          downloadFileName: scatterFileName,
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; }
        });
        console.debug('Debug: saveAsScatterFile result', result);
      }
      async function openScatterFile(){
        console.debug('Debug: openScatterFile invoked');
        if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
          console.error('openScatterFile missing fileIO.openGraphFile');
          return;
        }
        const result = await fileIO.openGraphFile({
          context: 'scatter',
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; },
          loadFromFile: file => loadScatterGraphFile(file),
          triggerInput: () => {
            const input = document.getElementById('scatterGraphFile');
            if(input){
              input.value='';
              input.click();
            }
          }
        });
        console.debug('Debug: openScatterFile result', result);
      }
      function loadScatterGraphFile(file){
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const obj=JSON.parse(e.target.result);
            console.log('loadScatterGraph',obj);
            if(obj.type!=='scatter') throw new Error('Invalid graph type');
            scatterHot.loadData(obj.data||[]);
            const c=obj.config||{};
            scatterTitleText=c.title||scatterTitleText;
            scatterXLabelText=c.xLabel||scatterXLabelText;
            scatterYLabelText=c.yLabel||scatterYLabelText;
            scatterDotSize.value=c.dotSize||scatterDotSize.value;
            scatterFill.value=c.fill||scatterFill.value;
            scatterBorder.value=c.border||scatterBorder.value;
            scatterBorderWidth.value=c.borderWidth||scatterBorderWidth.value;
            scatterAlpha.value=c.alpha||0;
            scatterAlphaVal.textContent=scatterAlpha.value;
            scatterLabelColors=c.labelColors||{};
            scatterShowGrid.checked=!!c.showGrid;
            scatterShowFrame.checked=!!c.showFrame;
            scatterLogX.checked=!!c.logX;
            scatterLogY.checked=!!c.logY;
            scatterXMin.value=c.xMin||'';
            scatterXMax.value=c.xMax||'';
            scatterYMin.value=c.yMin||'';
            scatterYMax.value=c.yMax||'';
            scatterOriginMode.value=c.originMode||scatterOriginMode.value;
            scatterOriginX.value=c.originX||'';
            scatterOriginY.value=c.originY||'';
            scatterShowLine.checked=!!c.showLine;
            if(scatterShowIntervals){
              scatterShowIntervals.checked=!!c.showIntervals;
            }
            if(scatterShowDiagnostics){
              scatterShowDiagnostics.checked=!!c.showDiagnostics;
            }
            if(scatterGraphTypeSelect && c.graphType){
              scatterGraphTypeSelect.value=c.graphType;
            }
            if(scatterLog2FCThreshold && c.log2fcThreshold!==undefined){
              scatterLog2FCThreshold.value=c.log2fcThreshold;
            }
            if(scatterNegLogPThreshold && c.negLogPThreshold!==undefined){
              scatterNegLogPThreshold.value=c.negLogPThreshold;
            }
            if(scatterRegressionMode && c.regression?.mode){
              scatterRegressionMode.value=c.regression.mode;
            }
            scatterLastRegressionSummary = c.regression?.summary || null;
            syncScatterGraphTypeUI();
            scheduleDrawScatter();
          }catch(err){console.error('loadScatterGraph error',err);}
        };
        reader.readAsText(file);
      }
    
      if(Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function'){
        Shared.exporter.mountSvgControls({
          container: '#scatterExportControls',
          svgSelector: '#scatterSvg',
          fileName: 'scatter',
          contextLabel: 'scatter-export'
        });
        console.debug('Debug: scatter export controls mounted', { hasExporter: true }); // Debug: scatter export mount
      }else{
        console.debug('Debug: scatter export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: scatter export fallback
      }
      document.getElementById('openScatter').addEventListener('click',openScatterFile);
      document.getElementById('saveScatter').addEventListener('click',saveScatterFile);
      document.getElementById('saveAsScatter').addEventListener('click',saveAsScatterFile);
      document.getElementById('scatterGraphFile').addEventListener('change',e=>{
        const f=e.target.files[0];
        if(f){
          scatterFileName=f.name;
          scatterFileHandle=null;
          loadScatterGraphFile(f);
        }
      });
      
    scatter.save = saveScatterFile;
    scatter.saveAs = saveAsScatterFile;
    scatter.open = openScatterFile;
    scatter.loadFromFile = loadScatterGraphFile;
    scatter.getPayload = getScatterGraphPayload;
    scatter.serialize = serializeSvg;
    scatter.ready = true;
    console.debug('Debug: Components.scatter.setup complete');
  }

  function ensureReady(){ if(!scatter.ready) setup(); }

  scatter.init = setup;
  scatter.ensure = ensureReady;
  scatter.draw = function draw(){ ensureReady(); scheduleDrawScatter && scheduleDrawScatter(); };

})(window);

