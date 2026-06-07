/* Scatter stats worker */
(function(){
  'use strict';

  const ctx = typeof self !== 'undefined' ? self : this;
  const JSTAT_URL = 'https://cdn.jsdelivr.net/npm/jstat@1.9.5/dist/jstat.min.js';
  const STATS_URL = '../shared/stats.js';
  const REGRESSION_URL = '../shared/regression.js';
  const debugState = { enabled: false };

  function logDebug(message, payload){
    if(!debugState.enabled){
      return;
    }
    if(typeof payload === 'undefined'){
      console.debug(message);
    }else{
      console.debug(message, payload);
    }
  }

  function ensureJStat(){
    if(ctx.jStat){
      return ctx.jStat;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts(JSTAT_URL);
    }
    if(ctx.jStat){
      return ctx.jStat;
    }
    throw new Error('jStat unavailable in worker');
  }

  function ensureStats(){
    if(ctx.Shared?.stats?.studentTTwoSidedPValue){
      return ctx.Shared.stats;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts(STATS_URL);
    }
    return ctx.Shared?.stats || null;
  }

  function workerStudentTTwoSidedPValue(t, df){
    const stats = ensureStats();
    if(typeof stats?.studentTTwoSidedPValue === 'function'){
      const value = stats.studentTTwoSidedPValue(t, df);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : NaN;
    }
    const jStat = ensureJStat();
    return jStat.studentt && typeof jStat.studentt.cdf === 'function' && Number.isFinite(t)
      ? Math.max(0, Math.min(1, 2 * (1 - jStat.studentt.cdf(Math.abs(t), df))))
      : NaN;
  }

  function ensureRegressionTools(){
    if(ctx.Shared && ctx.Shared.regressionTools && typeof ctx.Shared.regressionTools.fitRegression === 'function'){
      return ctx.Shared.regressionTools;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts(REGRESSION_URL);
    }
    if(ctx.Shared && ctx.Shared.regressionTools && typeof ctx.Shared.regressionTools.fitRegression === 'function'){
      return ctx.Shared.regressionTools;
    }
    throw new Error('Regression tools unavailable in worker');
  }

  function serializeIntervals(intervals){
    if(!intervals){
      return null;
    }
    const summary = intervals.summary ? {
      ciMin: intervals.summary.ciMin,
      ciMax: intervals.summary.ciMax,
      piMin: intervals.summary.piMin,
      piMax: intervals.summary.piMax
    } : null;
    const samples = Array.isArray(intervals.samples)
      ? intervals.samples.map(sample => ({
        x: sample?.x,
        y: sample?.y,
        ciLow: sample?.ciLow,
        ciHigh: sample?.ciHigh,
        piLow: sample?.piLow,
        piHigh: sample?.piHigh
      }))
      : [];
    return {
      alpha: intervals.alpha,
      tCritical: intervals.tCritical ?? intervals.zCritical,
      degreesOfFreedom: intervals.degreesOfFreedom,
      summary,
      samples
    };
  }

  function serializeRegression(model){
    if(!model || typeof model !== 'object'){
      return null;
    }
    const summary = model.summary ? {
      intercept: model.summary.intercept,
      slope: model.summary.slope,
      equation: model.summary.equation || null,
      parameters: model.summary.parameters && typeof model.summary.parameters === 'object'
        ? { ...model.summary.parameters }
        : null,
      primaryParameter: model.summary.primaryParameter && typeof model.summary.primaryParameter === 'object'
        ? { label: model.summary.primaryParameter.label || null, value: model.summary.primaryParameter.value }
        : null
    } : null;
    const coefficientStats = Array.isArray(model.coefficientStats)
      ? model.coefficientStats.map(stat => ({
        term: stat.term,
        estimate: stat.estimate,
        standardError: stat.standardError,
        tStatistic: stat.tStatistic,
        pValue: stat.pValue,
        ciLow: stat.ciLow,
        ciHigh: stat.ciHigh
      }))
      : [];
    const coefficientCovariance = Array.isArray(model.coefficientCovariance)
      ? model.coefficientCovariance.map(row => (Array.isArray(row) ? row.slice() : []))
      : null;
    const forecastPoints = Array.isArray(model.forecast?.points)
      ? model.forecast.points.map(point => ({
        x: point?.x,
        y: point?.y,
        lower: point?.lower ?? point?.ciLow ?? point?.piLow,
        upper: point?.upper ?? point?.ciHigh ?? point?.piHigh
      }))
      : [];
    const forecast = model.forecast ? {
      horizon: model.forecast.horizon,
      seasonLength: model.forecast.seasonLength ?? model.forecast.parameters?.seasonLength,
      step: model.forecast.step,
      parameters: model.forecast.parameters && typeof model.forecast.parameters === 'object'
        ? { ...model.forecast.parameters }
        : null,
      points: forecastPoints
    } : null;
    return {
      mode: model.mode || null,
      fitMethod: model.fitMethod || 'ols',
      coefficients: Array.isArray(model.coefficients) ? model.coefficients.slice() : [],
      metrics: model.metrics ? { ...model.metrics } : null,
      residuals: model.residuals ? { ...model.residuals } : null,
      diagnostics: model.diagnostics ? { ...model.diagnostics } : null,
      coefficientStats,
      coefficientCovariance,
      intervals: serializeIntervals(model.intervals),
      summary,
      domain: model.domain ? { ...model.domain } : null,
      warnings: Array.isArray(model.warnings) ? model.warnings.slice() : [],
      forecast,
      fitSpec: model.fitSpec && typeof model.fitSpec === 'object' ? { ...model.fitSpec } : null
    };
  }

  function computeCorrelationConfidenceInterval(r, n, alpha){
    const rNum = Number(r);
    const count = Number(n);
    if(!Number.isFinite(rNum) || !Number.isFinite(count) || count <= 3){
      return null;
    }
    const clamped = Math.max(-0.999999999999, Math.min(0.999999999999, rNum));
    const z = 0.5 * Math.log((1 + clamped) / (1 - clamped));
    const se = 1 / Math.sqrt(count - 3);
    if(!Number.isFinite(se) || se <= 0){
      return null;
    }
    const jStat = ensureJStat();
    const zCritical = jStat.normal && typeof jStat.normal.inv === 'function'
      ? jStat.normal.inv(1 - ((alpha || 0.05) / 2), 0, 1)
      : 1.959963984540054;
    const loZ = z - (zCritical * se);
    const hiZ = z + (zCritical * se);
    const toR = value => {
      const e2 = Math.exp(2 * value);
      return (e2 - 1) / (e2 + 1);
    };
    return { low: toR(loZ), high: toR(hiZ), method: 'fisher-z' };
  }

  function computeScatterStats(payload){
    debugState.enabled = !!payload?.debug;
    const rawPoints = Array.isArray(payload.points) ? payload.points : [];
    const points = [];
    const x = [];
    const y = [];
    for(let i = 0; i < rawPoints.length; i += 1){
      const pt = rawPoints[i] || {};
      const xVal = Number(pt.x);
      const yVal = Number(pt.y);
      if(!Number.isFinite(xVal) || !Number.isFinite(yVal)){
        continue;
      }
      points.push({ ...pt, x: xVal, y: yVal });
      x.push(xVal);
      y.push(yVal);
    }
    const method = payload.method === 'spearman' ? 'spearman' : 'pearson';
    const regressionMode = payload.regressionMode || 'linear';
    const fitMethod = payload.fitMethod || 'ols';
    const fitSpec = payload.fitSpec && typeof payload.fitSpec === 'object' ? payload.fitSpec : {};
    const domainOption = payload.domain || null;
    const sampleCount = Number(payload.sampleCount) || (regressionMode === 'linear' ? 60 : 160);
    const n = points.length;
    const label = method === 'pearson' ? 'Pearson' : 'Spearman';
    if(n < 3){
      return { method: label, r: NaN, p: NaN, r2: NaN, m: NaN, b: NaN, regression: null, curveSamples: [], pointCount: n };
    }
    const jStat = ensureJStat();
    ensureStats();
    const pearson = jStat.corrcoeff(x, y);
    const r = method === 'pearson' ? pearson : jStat.spearmancoeff(x, y);
    const tDen = 1 - r * r;
    const t = tDen <= 0 ? (r >= 0 ? Infinity : -Infinity) : r * Math.sqrt((n - 2) / tDen);
    const p = Number.isFinite(t) ? workerStudentTTwoSidedPValue(t, n - 2) : NaN;
    const pMethod = method === 'spearman' ? 't approximation' : 'Student t approximation';
    const xMean = jStat.mean(x);
    const yMean = jStat.mean(y);
    let num = 0;
    let den = 0;
    for(let i = 0; i < n; i += 1){
      const dx = x[i] - xMean;
      num += dx * (y[i] - yMean);
      den += dx * dx;
    }
    const linearSlope = den !== 0 ? num / den : NaN;
    const linearIntercept = yMean - linearSlope * xMean;
    let regression = null;
    let regressionTools = null;
    try{
      regressionTools = ensureRegressionTools();
      if(regressionTools && typeof regressionTools.fitRegression === 'function'){
        regression = regressionTools.fitRegression(points, {
          mode: regressionMode,
          method: fitMethod,
          fitSpec,
          preferDoseResponse: regressionMode === 'logistic'
        });
        if(regression && domainOption){
          const minCandidate = Number.isFinite(domainOption.minX)
            ? domainOption.minX
            : (Number.isFinite(domainOption.min) ? domainOption.min : undefined);
          const maxCandidate = Number.isFinite(domainOption.maxX)
            ? domainOption.maxX
            : (Number.isFinite(domainOption.max) ? domainOption.max : undefined);
          if(Number.isFinite(minCandidate) && Number.isFinite(maxCandidate)){
            regression.domain = { minX: minCandidate, maxX: maxCandidate };
          }
        }
      }
    }catch(err){
      logDebug('Debug: scatter worker regression failed', { message: err?.message || String(err) });
      regression = null;
    }
    const summary = regression?.summary;
    let resolvedSlope = Number.isFinite(summary?.slope) ? summary.slope : linearSlope;
    if(summary?.primaryParameter && Number.isFinite(summary.primaryParameter.value)){
      resolvedSlope = summary.primaryParameter.value;
    }
    const resolvedIntercept = Number.isFinite(summary?.intercept) ? summary.intercept : linearIntercept;
    const regressionR2 = regression?.metrics?.r2;
    const r2 = Number.isFinite(regressionR2) ? regressionR2 : pearson * pearson;
    let curveSamples = [];
    if(regression && regressionTools && typeof regressionTools.sampleCurve === 'function'){
      const domain = domainOption || regression.domain || null;
      const minX = Number.isFinite(domain?.minX) ? domain.minX : (Number.isFinite(domain?.min) ? domain.min : null);
      const maxX = Number.isFinite(domain?.maxX) ? domain.maxX : (Number.isFinite(domain?.max) ? domain.max : null);
      if(Number.isFinite(minX) && Number.isFinite(maxX) && minX !== maxX){
        curveSamples = regressionTools.sampleCurve(regression, { minX, maxX, sampleCount });
      }
    }
    const serializedRegression = serializeRegression(regression);
    if(serializedRegression && curveSamples.length){
      serializedRegression.curveSamples = curveSamples;
    }
    const stats = {
      method: label,
      r,
      p,
      pMethod,
      correlationCI: computeCorrelationConfidenceInterval(r, n, 0.05),
      correlationCiApproximate: method === 'spearman',
      r2,
      m: resolvedSlope,
      b: resolvedIntercept,
      pointCount: n,
      regression: serializedRegression,
      curveSamples
    };
    logDebug('Debug: scatter worker stats computed', { count: n, method: label, regressionMode });
    return stats;
  }

  function computeScatterDensityValues(points, size){
    const width = Math.max(1, Number(size?.width) || 1);
    const height = Math.max(1, Number(size?.height) || 1);
    const data = Array.isArray(points) ? points : [];
    const count = data.length;
    if(!count){
      return { values: [], max: 0 };
    }
    const gridResolution = Math.max(10, Math.min(80, Math.round(Math.sqrt(count))));
    const gridX = gridResolution;
    const gridY = gridResolution;
    const cellW = width / gridX;
    const cellH = height / gridY;
    const grid = new Array(gridX * gridY).fill(0);
    const coords = [];
    for(let i = 0; i < count; i += 1){
      const pt = data[i];
      const x = Math.min(Math.max(Number(pt?.x) || 0, 0), width - 1e-6);
      const y = Math.min(Math.max(Number(pt?.y) || 0, 0), height - 1e-6);
      const gx = Math.min(gridX - 1, Math.max(0, Math.floor(x / cellW)));
      const gy = Math.min(gridY - 1, Math.max(0, Math.floor(y / cellH)));
      grid[gy * gridX + gx] += 1;
      coords.push({ gx, gy });
    }
    const neighborOffsets = [-1, 0, 1];
    const values = new Array(count);
    let maxDensity = 0;
    coords.forEach(({ gx, gy }, idx) => {
      let sum = 0;
      let n = 0;
      for(let dxIdx = 0; dxIdx < neighborOffsets.length; dxIdx += 1){
        const dx = neighborOffsets[dxIdx];
        for(let dyIdx = 0; dyIdx < neighborOffsets.length; dyIdx += 1){
          const dy = neighborOffsets[dyIdx];
          const nx = gx + dx;
          const ny = gy + dy;
          if(nx < 0 || nx >= gridX || ny < 0 || ny >= gridY){
            continue;
          }
          sum += grid[ny * gridX + nx] || 0;
          n += 1;
        }
      }
      const density = n ? sum / n : 0;
      values[idx] = density;
      if(density > maxDensity){
        maxDensity = density;
      }
    });
    return { values, max: maxDensity };
  }

  function computeScatterRender(payload){
    debugState.enabled = !!payload?.debug;
    const points = Array.isArray(payload?.points) ? payload.points : [];
    const count = points.length;
    const logX = !!payload?.logX;
    const logY = !!payload?.logY;
    const xScale = payload?.xScale || {};
    const yScale = payload?.yScale || {};
    const minX = Number.isFinite(xScale.min) ? xScale.min : 0;
    const maxX = Number.isFinite(xScale.max) ? xScale.max : 1;
    const minY = Number.isFinite(yScale.min) ? yScale.min : 0;
    const maxY = Number.isFinite(yScale.max) ? yScale.max : 1;
    const margin = payload?.margin || {};
    const plotW = Math.max(1, Number(payload?.plotW) || 1);
    const plotH = Math.max(1, Number(payload?.plotH) || 1);
    const left = Number(margin.left) || 0;
    const top = Number(margin.top) || 0;
    const denomX = maxX - minX || 1;
    const denomY = maxY - minY || 1;
    const xv = new Float64Array(count);
    const yv = new Float64Array(count);
    const cx = new Float64Array(count);
    const cy = new Float64Array(count);
    for(let i = 0; i < count; i += 1){
      const pt = points[i] || {};
      const rawX = Number(pt.x);
      const rawY = Number(pt.y);
      const tx = logX ? Math.log10(rawX) : rawX;
      const ty = logY ? Math.log10(rawY) : rawY;
      xv[i] = tx;
      yv[i] = ty;
      if(!Number.isFinite(tx) || !Number.isFinite(ty)){
        cx[i] = NaN;
        cy[i] = NaN;
        continue;
      }
      const safeX = Math.min(Math.max(tx, minX), maxX);
      const safeY = Math.min(Math.max(ty, minY), maxY);
      cx[i] = left + plotW * (safeX - minX) / denomX;
      cy[i] = top + plotH * (1 - (safeY - minY) / denomY);
    }
    const densityEnabled = !!payload?.densityEnabled;
    const densityInfo = densityEnabled
      ? computeScatterDensityValues(
          Array.from(cx, (value, idx) => ({
            x: value - left,
            y: cy[idx] - top
          })),
          { width: plotW, height: plotH }
        )
      : null;
    return {
      geometry: {
        xv: Array.from(xv),
        yv: Array.from(yv),
        cx: Array.from(cx),
        cy: Array.from(cy)
      },
      density: densityInfo
    };
  }

  function handleMessage(event){
    const data = event?.data || {};
    const id = data.id;
    const action = data.action;
    try{
      if(action === 'scatter-stats'){
        const result = computeScatterStats(data.payload || {});
        ctx.postMessage({ id, ok: true, result });
        return;
      }
      if(action === 'scatter-render'){
        const result = computeScatterRender(data.payload || {});
        ctx.postMessage({ id, ok: true, result });
        return;
      }
      ctx.postMessage({ id, ok: false, error: 'Unknown action' });
    }catch(err){
      ctx.postMessage({ id, ok: false, error: err?.message || String(err) });
    }
  }

  ctx.onmessage = handleMessage;
})();
