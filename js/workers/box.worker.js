
/* Box stats and swarm worker */
(function(){
  'use strict';

  const ctx = typeof self !== 'undefined' ? self : this;
  const global = ctx;
  const Shared = ctx.Shared = ctx.Shared || {};
  const JSTAT_URL = 'https://cdn.jsdelivr.net/npm/jstat@1.9.5/dist/jstat.min.js';
  const STATS_URL = '../shared/stats.js';
  const debugState = { enabled: false };

  if(typeof Shared.isDebugEnabled !== 'function'){
    Shared.isDebugEnabled = function isDebugEnabled(){
      return !!debugState.enabled;
    };
  }

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

  function ensureStats(){
    if(Shared.stats && typeof Shared.stats.adjustPValues === 'function'){
      return Shared.stats;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts(STATS_URL);
    }
    if(Shared.stats && typeof Shared.stats.adjustPValues === 'function'){
      return Shared.stats;
    }
    throw new Error('Shared.stats unavailable in worker');
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

  const DEFAULT_CORRECTION = 'bonferroni';
  const ASSUMPTION_ALPHA = 0.05;
  const ASSUMPTION_QQ_SAMPLE_LIMIT = 4000;

  function fallbackSanitizeP(value){
    const num = Number(value);
    if(!Number.isFinite(num) || num < 0){
      return 0;
    }
    if(num > 1){
      return 1;
    }
    return num;
  }

  function fallbackClampUnit(value){
    if(!Number.isFinite(value)){
      return 1;
    }
    if(value < 0){
      return 0;
    }
    if(value > 1){
      return 1;
    }
    return value;
  }

  function fallbackAdjustNone(values){
    return values.map(v => fallbackClampUnit(fallbackSanitizeP(v)));
  }

  function fallbackAdjustBonferroni(values){
    const m = values.length || 1;
    return values.map(v => fallbackClampUnit(fallbackSanitizeP(v) * m));
  }

  function fallbackAdjustSidak(values){
    const m = values.length || 1;
    return values.map(v => {
      const p = fallbackSanitizeP(v);
      return fallbackClampUnit(1 - Math.pow(1 - p, m));
    });
  }

  function fallbackAdjustHolm(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 0;
    ordered.forEach((entry, idx) => {
      const rank = m - idx;
      const raw = fallbackClampUnit(entry.p * rank);
      running = Math.max(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    });
    return adjusted;
  }

  function fallbackAdjustHolmSidak(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 0;
    ordered.forEach((entry, idx) => {
      const rank = m - idx;
      const raw = fallbackClampUnit(1 - Math.pow(1 - entry.p, rank));
      running = Math.max(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    });
    return adjusted;
  }

  function fallbackAdjustHochberg(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => b.p - a.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    ordered.forEach((entry, idx) => {
      const rank = idx + 1;
      const raw = fallbackClampUnit(entry.p * rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    });
    return adjusted;
  }

  function fallbackAdjustBH(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    for(let i = m - 1; i >= 0; i--){
      const entry = ordered[i];
      const rank = i + 1;
      const raw = fallbackClampUnit((entry.p * m) / rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    }
    return adjusted;
  }

  function fallbackAdjustBY(values){
    const m = values.length;
    let harmonic = 0;
    for(let i = 1; i <= Math.max(m, 1); i++){
      harmonic += 1 / i;
    }
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    for(let i = m - 1; i >= 0; i--){
      const entry = ordered[i];
      const rank = i + 1;
      const raw = fallbackClampUnit((entry.p * m * harmonic) / rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    }
    return adjusted;
  }

  const FALLBACK_CORRECTION_META = {
    none: {
      label: 'None (unadjusted)',
      shortLabel: 'None',
      footnote: count => `P-values are unadjusted${count > 0 ? ` (${count} comparison${count === 1 ? '' : 's'})` : ''}.`,
      adjust: fallbackAdjustNone
    },
    bonferroni: {
      label: 'Bonferroni',
      shortLabel: 'Bonferroni',
      footnote: count => `Bonferroni-adjusted P values across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustBonferroni
    },
    holm: {
      label: 'Holm',
      shortLabel: 'Holm',
      footnote: count => `Holm correction applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustHolm
    },
    'holm-sidak': {
      label: 'Holm-Sidak',
      shortLabel: 'Holm-Sidak',
      footnote: count => `Holm-Sidak correction applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustHolmSidak
    },
    sidak: {
      label: 'Sidak',
      shortLabel: 'Sidak',
      footnote: count => `Sidak correction applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustSidak
    },
    hochberg: {
      label: 'Hochberg',
      shortLabel: 'Hochberg',
      footnote: count => `Hochberg correction applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustHochberg
    },
    bh: {
      label: 'Benjamini-Hochberg (FDR)',
      shortLabel: 'BH',
      footnote: count => `Benjamini-Hochberg FDR correction across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustBH
    },
    by: {
      label: 'Benjamini-Yekutieli (FDR)',
      shortLabel: 'BY',
      footnote: count => `Benjamini-Yekutieli FDR correction across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustBY
    }
  };
  function resolveCorrectionMeta(method, count){
    if(Shared.stats && typeof Shared.stats.getCorrectionMeta === 'function'){
      try{
        const metaRaw = Shared.stats.getCorrectionMeta(method);
        const note = typeof metaRaw?.footnote === 'function' ? metaRaw.footnote(count || 0) : metaRaw?.footnote;
        return {
          key: metaRaw?.key || method || DEFAULT_CORRECTION,
          label: metaRaw?.label || metaRaw?.shortLabel || method || DEFAULT_CORRECTION,
          shortLabel: metaRaw?.shortLabel || metaRaw?.label || method || DEFAULT_CORRECTION,
          footnote: note || ''
        };
      }catch(err){
        logDebug('Debug: box worker resolveCorrectionMeta error', { method, message: err?.message || String(err) });
      }
    }
    const fallbackKey = FALLBACK_CORRECTION_META[method] ? method : DEFAULT_CORRECTION;
    const cfg = FALLBACK_CORRECTION_META[fallbackKey];
    const footnote = typeof cfg.footnote === 'function' ? cfg.footnote(count || 0) : cfg.footnote;
    return {
      key: fallbackKey,
      label: cfg.label,
      shortLabel: cfg.shortLabel || cfg.label,
      footnote: footnote || ''
    };
  }

  function applyPValueCorrection(values, method){
    const arr = Array.isArray(values) ? values.slice() : [];
    if(Shared.stats && typeof Shared.stats.adjustPValues === 'function'){
      try{
        const adjusted = Shared.stats.adjustPValues(arr, { method });
        if(Array.isArray(adjusted) && adjusted.length === arr.length){
          return adjusted;
        }
      }catch(err){
        logDebug('Debug: box worker applyPValueCorrection error', { method, message: err?.message || String(err) });
      }
    }
    const fallbackKey = FALLBACK_CORRECTION_META[method] ? method : DEFAULT_CORRECTION;
    const adjustFn = FALLBACK_CORRECTION_META[fallbackKey].adjust;
    return adjustFn(arr);
  }

  function formatP(value, options){
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    if(typeof formatter === 'function'){
      return formatter(value, options);
    }
    if(!Number.isFinite(value)){
      return String(value);
    }
    return Number(value).toExponential(5);
  }

  function formatStatNumber(value, digits){
    const places = Number.isInteger(digits) ? digits : 4;
    if(!Number.isFinite(value)){
      return '-';
    }
    return value.toFixed(places);
  }

  function safeRound(value, digits){
    if(!Number.isFinite(value)){
      return null;
    }
    const factor = Math.pow(10, digits || 0);
    return Math.round(value * factor) / factor;
  }

  function clamp(value, min, max){
    if(!Number.isFinite(value)){
      return value;
    }
    if(value < min){
      return min;
    }
    if(value > max){
      return max;
    }
    return value;
  }

  function formatEffectValue(value, meta){
    if(value == null || !Number.isFinite(value)){
      return '-';
    }
    if(meta?.format === 'percent'){
      const percent = clamp(value, 0, 1) * 100;
      return `${percent.toFixed(1)}%`;
    }
    return value.toFixed(3);
  }

  function buildEffectFootnotes(paramMeta, nonParamMeta){
    const notes = [];
    if(paramMeta?.tooltip){
      notes.push(`Parametric effect (${paramMeta.shortLabel || paramMeta.label}): ${paramMeta.tooltip}`);
    }
    if(nonParamMeta?.tooltip){
      notes.push(`Non-parametric effect (${nonParamMeta.shortLabel || nonParamMeta.label}): ${nonParamMeta.tooltip}`);
    }
    return notes;
  }

  const EFFECT_SIZE_PARAM_OPTIONS = [
    { value: 'cohenD', label: "Cohen's d", shortLabel: "Cohen's d", tooltip: 'Difference in means scaled by the pooled standard deviation.', format: 'decimal' },
    { value: 'hedgesG', label: "Hedges' g", shortLabel: "Hedges' g", tooltip: "Small-sample corrected Cohen's d using a bias adjustment.", format: 'decimal' }
  ];
  const EFFECT_SIZE_NONPARAM_OPTIONS = [
    { value: 'rankBiserial', label: 'Rank-biserial r', shortLabel: 'Rank-biserial r', tooltip: 'Rank-biserial correlation (-1 to 1) comparing favorable vs. unfavorable pairings.', format: 'decimal' },
    { value: 'commonLanguage', label: 'Common language (A)', shortLabel: 'Common language A', tooltip: 'Probability that a score from the first sample exceeds the second (expressed as a percentage).', format: 'percent' }
  ];

  function listEffectOptions(type){
    return type === 'parametric' ? EFFECT_SIZE_PARAM_OPTIONS.slice() : EFFECT_SIZE_NONPARAM_OPTIONS.slice();
  }

  function resolveEffectOptionMeta(type, value){
    const list = listEffectOptions(type);
    const found = list.find(opt => opt.value === value);
    if(found){
      return found;
    }
    const fallback = list[0];
    logDebug('Debug: box worker resolveEffectOptionMeta fallback', { type, requested: value, fallback: fallback?.value });
    return fallback;
  }

  const POST_HOC_META = {
    standard: {
      value: 'standard',
      label: 'Pairwise + correction',
      shortLabel: 'Standard',
      tooltip: 'Run pairwise tests and adjust P values using the selected multiple-testing correction.',
      applies: context => context?.mode !== 'custom',
      summary: () => 'Pairwise tests with the chosen correction.'
    },
    tukey: {
      value: 'tukey',
      label: 'Tukey HSD',
      shortLabel: 'Tukey',
      tooltip: 'Parametric Tukey Honestly Significant Difference using the studentized range distribution (unpaired, >=3 groups).',
      applies: context => context && context.mode !== 'custom' && context.test === 'parametric' && context.variant !== 'welch' && !context.paired && context.groupCount >= 3,
      summary: context => `Tukey HSD on ${context?.groupCount || 0} groups (family-wise adjusted).`
    },
    gamesHowell: {
      value: 'gamesHowell',
      label: 'Games-Howell',
      shortLabel: 'Games-Howell',
      tooltip: 'Games-Howell post-hoc test using Welch-standardized differences (unpaired, >=3 groups, unequal variances).',
      applies: context => context && context.mode !== 'custom' && context.test === 'parametric' && !context.paired && context.groupCount >= 3 && (context.variant === 'welch' || context.varianceConcern === true),
      summary: context => `Games-Howell comparisons across ${context?.groupCount || 0} groups with Welch-standardized SE.`
    },
    dunn: {
      value: 'dunn',
      label: "Dunn's test",
      shortLabel: 'Dunn',
      tooltip: "Non-parametric Dunn's post-hoc test using rank sums (unpaired, >=3 groups).",
      applies: context => context && context.mode !== 'custom' && context.test === 'nonparametric' && !context.paired && context.groupCount >= 3,
      summary: context => `Dunn's rank-based post-hoc across ${context?.groupCount || 0} groups.`
    }
  };
  const POST_HOC_ORDER = ['standard', 'tukey', 'gamesHowell', 'dunn'];

  function isPostHocSupported(method, context){
    const meta = POST_HOC_META[method];
    if(!meta || typeof meta.applies !== 'function'){
      return false;
    }
    try{
      return !!meta.applies(context || {});
    }catch(err){
      logDebug('Debug: box worker isPostHocSupported error', { method, message: err?.message || String(err) });
      return false;
    }
  }

  function ensureValidPostHoc(method, context){
    const ctxRef = context || {};
    const requested = (typeof method === 'string' ? method : '').toLowerCase();
    if(requested && isPostHocSupported(requested, ctxRef)){
      return requested;
    }
    if(ctxRef.variant === 'welch' && isPostHocSupported('gamesHowell', ctxRef)){
      if(requested && requested !== 'gamesHowell'){
        logDebug('Debug: box worker postHoc welch fallback', { requested, fallback: 'gamesHowell' });
      }
      return 'gamesHowell';
    }
    for(const key of POST_HOC_ORDER){
      if(isPostHocSupported(key, ctxRef)){
        if(requested && requested !== key){
          logDebug('Debug: box worker postHoc fallback', { requested, fallback: key });
        }
        return key;
      }
    }
    return 'standard';
  }
  function percentileFromSorted(sorted, p){
    if(!Array.isArray(sorted) || !sorted.length){
      return NaN;
    }
    const clamped = Math.min(Math.max(p, 0), 1);
    const pos = (sorted.length - 1) * clamped;
    const base = Math.floor(pos);
    const rest = pos - base;
    const baseVal = sorted[base];
    const nextVal = sorted[base + 1];
    if(nextVal === undefined){
      return baseVal;
    }
    return baseVal + rest * (nextVal - baseVal);
  }

  function partitionArray(arr, left, right, pivotIndex){
    const pivotValue = arr[pivotIndex];
    [arr[pivotIndex], arr[right]] = [arr[right], arr[pivotIndex]];
    let storeIndex = left;
    for(let i = left; i < right; i++){
      if(arr[i] < pivotValue){
        [arr[storeIndex], arr[i]] = [arr[i], arr[storeIndex]];
        storeIndex += 1;
      }
    }
    [arr[right], arr[storeIndex]] = [arr[storeIndex], arr[right]];
    return storeIndex;
  }

  function nthValueInPlace(arr, n, left = 0, right = arr.length - 1){
    let start = left;
    let end = right;
    while(start <= end){
      if(start === end){
        return arr[start];
      }
      const pivotIndex = Math.floor((start + end) / 2);
      const newPivotIndex = partitionArray(arr, start, end, pivotIndex);
      if(n === newPivotIndex){
        return arr[n];
      }
      if(n < newPivotIndex){
        end = newPivotIndex - 1;
      }else{
        start = newPivotIndex + 1;
      }
    }
    return arr[start];
  }

  function selectQuantileInPlace(work, p){
    if(!work.length){
      return NaN;
    }
    const pos = (work.length - 1) * Math.min(Math.max(p, 0), 1);
    const lowerIndex = Math.floor(pos);
    const upperIndex = Math.ceil(pos);
    const lowerValue = nthValueInPlace(work, lowerIndex);
    if(upperIndex === lowerIndex){
      return lowerValue;
    }
    const upperValue = nthValueInPlace(work, upperIndex);
    return lowerValue + (upperValue - lowerValue) * (pos - lowerIndex);
  }

  function quantileFromUnsorted(values, p){
    if(!Array.isArray(values) || !values.length){
      return NaN;
    }
    const pos = (values.length - 1) * Math.min(Math.max(p, 0), 1);
    const lowerIndex = Math.floor(pos);
    const upperIndex = Math.ceil(pos);
    const working = values.slice();
    const lowerValue = nthValueInPlace(working, lowerIndex);
    if(upperIndex === lowerIndex){
      return lowerValue;
    }
    const upperValue = nthValueInPlace(working, upperIndex);
    return lowerValue + (upperValue - lowerValue) * (pos - lowerIndex);
  }

  function computeTraceSummary(values, options){
    const requireSorted = !!options?.requireSorted;
    const assumeFiniteValues = options?.assumeFiniteValues === true;
    const precomputed = options?.precomputedMoments && Number.isFinite(options.precomputedMoments.count)
      ? options.precomputedMoments
      : null;
    if(!Array.isArray(values) || !values.length){
      return {
        count: 0,
        mean: 0,
        variance: 0,
        sd: 0,
        min: NaN,
        max: NaN,
        q1: NaN,
        median: NaN,
        q3: NaN,
        iqr: 0,
        sortedValues: requireSorted ? [] : null,
        sum: 0,
        sumSquares: 0,
        sumCubes: 0,
        sumFourth: 0
      };
    }
    const sourceValues = Array.isArray(values) ? values : [];
    let numericValues;
    if(assumeFiniteValues){
      numericValues = sourceValues.slice();
    }else{
      numericValues = [];
      for(let idx = 0; idx < sourceValues.length; idx++){
        const v = Number(sourceValues[idx]);
        if(Number.isFinite(v)){
          numericValues.push(v);
        }
      }
    }
    const count = precomputed?.count ?? numericValues.length;
    if(!count){
      return {
        count: 0,
        mean: 0,
        variance: 0,
        sd: 0,
        min: NaN,
        max: NaN,
        q1: NaN,
        median: NaN,
        q3: NaN,
        iqr: 0,
        sortedValues: requireSorted ? [] : null,
        sum: 0,
        sumSquares: 0,
        sumCubes: 0,
        sumFourth: 0
      };
    }
    let min = Number.isFinite(precomputed?.min) ? precomputed.min : numericValues[0];
    let max = Number.isFinite(precomputed?.max) ? precomputed.max : numericValues[0];
    let sum = Number.isFinite(precomputed?.sum) ? precomputed.sum : 0;
    let sumSquares = Number.isFinite(precomputed?.sumSquares) ? precomputed.sumSquares : 0;
    let sumCubes = Number.isFinite(precomputed?.sumCubes) ? precomputed.sumCubes : 0;
    let sumFourth = Number.isFinite(precomputed?.sumFourth) ? precomputed.sumFourth : 0;
    if(!precomputed){
      for(let idx = 0; idx < numericValues.length; idx++){
        const value = numericValues[idx];
        if(value < min) min = value;
        if(value > max) max = value;
        sum += value;
        const square = value * value;
        sumSquares += square;
        sumCubes += square * value;
        sumFourth += square * square;
      }
    }
    const mean = sum / count;
    const variance = count > 1 ? Math.max(0, (sumSquares - (sum * sum) / count) / (count - 1)) : 0;
    const sd = Math.sqrt(variance);
    let q1;
    let median;
    let q3;
    let sortedValues = null;
    if(requireSorted){
      const sorted = numericValues.slice().sort((a, b) => a - b);
      sortedValues = sorted;
      q1 = percentileFromSorted(sorted, 0.25);
      median = percentileFromSorted(sorted, 0.5);
      q3 = percentileFromSorted(sorted, 0.75);
    }else{
      const working = numericValues;
      q1 = selectQuantileInPlace(working, 0.25);
      median = selectQuantileInPlace(working, 0.5);
      q3 = selectQuantileInPlace(working, 0.75);
    }
    return {
      count,
      mean,
      variance,
      sd,
      min,
      max,
      q1,
      median,
      q3,
      iqr: Number.isFinite(q3) && Number.isFinite(q1) ? q3 - q1 : 0,
      sortedValues,
      sum,
      sumSquares,
      sumCubes,
      sumFourth
    };
  }
  function normalQuantile(p){
    const clipped = Math.min(Math.max(p, Number.EPSILON), 1 - Number.EPSILON);
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.38357751867269e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const plow = 0.02425;
    const phigh = 1 - plow;
    let q;
    let r;
    if(clipped < plow){
      q = Math.sqrt(-2 * Math.log(clipped));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if(clipped > phigh){
      q = Math.sqrt(-2 * Math.log(1 - clipped));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = clipped - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4] + 1);
  }

  function logGamma(z){
    const coeffs = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if(z < 0.5){
      return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    }
    z -= 1;
    let x = coeffs[0];
    for(let i = 1; i < coeffs.length; i++){
      x += coeffs[i] / (z + i);
    }
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function betacf(x, a, b){
    const MAX_ITER = 100;
    const EPS = 1e-12;
    const FPMIN = Number.MIN_VALUE / EPS;
    let qab = a + b;
    let qap = a + 1;
    let qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if(Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for(let m = 1; m <= MAX_ITER; m++){
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if(Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if(Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if(Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if(Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if(Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function regularizedIncompleteBeta(x, a, b){
    if(x <= 0) return 0;
    if(x >= 1) return 1;
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if(x < (a + 1) / (a + b + 2)){
      return bt * betacf(x, a, b) / a;
    }
    return 1 - bt * betacf(1 - x, b, a) / b;
  }

  function fcdf(x, d1, d2){
    if(!Number.isFinite(x) || x < 0){
      return 0;
    }
    const transformed = (d1 * x) / (d1 * x + d2);
    const result = regularizedIncompleteBeta(transformed, d1 / 2, d2 / 2);
    return Number.isFinite(result) ? result : 0;
  }

  function sampleArrayEvenly(values, limit){
    if(!Array.isArray(values) || !values.length){
      return [];
    }
    const maxSamples = Math.max(0, Math.floor(limit));
    if(!maxSamples){
      return [];
    }
    if(values.length <= maxSamples){
      return values.slice().filter(Number.isFinite);
    }
    if(maxSamples === 1){
      const firstFinite = values.find(Number.isFinite);
      return Number.isFinite(firstFinite) ? [Number(firstFinite)] : [];
    }
    const sample = [];
    const step = (values.length - 1) / (maxSamples - 1);
    for(let idx = 0; idx < maxSamples; idx++){
      const target = Math.min(values.length - 1, Math.round(idx * step));
      let candidate = Number(values[target]);
      if(!Number.isFinite(candidate)){
        let offset = 1;
        while(!Number.isFinite(candidate) && (target - offset >= 0 || target + offset < values.length)){
          if(target - offset >= 0){
            const left = Number(values[target - offset]);
            if(Number.isFinite(left)){
              candidate = left;
              break;
            }
          }
          if(target + offset < values.length){
            const right = Number(values[target + offset]);
            if(Number.isFinite(right)){
              candidate = right;
              break;
            }
          }
          offset++;
        }
      }
      if(Number.isFinite(candidate)){
        sample.push(candidate);
      }
    }
    return sample;
  }

  function computeQQPoints(values, options){
    const maxSample = Number.isFinite(options?.maxSampleSize)
      ? Math.max(25, Math.floor(options.maxSampleSize))
      : ASSUMPTION_QQ_SAMPLE_LIMIT;
    const source = Array.isArray(values) ? values : [];
    const baseValues = source.length > maxSample
      ? sampleArrayEvenly(source, maxSample)
      : source.slice().filter(Number.isFinite);
    if(baseValues.length < 3){
      return [];
    }
    const sorted = baseValues.slice().sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((sum, v) => sum + v, 0) / n;
    const variance = sorted.reduce((sum, v) => { const diff = v - mean; return sum + diff * diff; }, 0) / (n - 1 || 1);
    const sd = Math.sqrt(variance) || 0;
    if(sd === 0){
      return [];
    }
    const sampleCount = Math.min(25, n);
    const points = [];
    for(let j = 0; j < sampleCount; j++){
      const frac = (j + 0.5) / sampleCount;
      const index = Math.min(n - 1, Math.max(0, Math.round(frac * n - 0.5)));
      const theoretical = normalQuantile((index + 0.5) / n);
      const observed = (sorted[index] - mean) / sd;
      points.push({ theoretical, observed });
    }
    return points;
  }

  function computeDagostino(values, summary){
    const series = Array.isArray(values) ? values : [];
    const readySummary = summary && Number.isFinite(summary.count) && summary.count > 0
      && Number.isFinite(summary.sum) && Number.isFinite(summary.sumSquares)
      && Number.isFinite(summary.sumCubes) && Number.isFinite(summary.sumFourth)
      ? summary
      : null;
    let n = readySummary ? readySummary.count : 0;
    let sum = readySummary ? readySummary.sum : 0;
    let sumSquares = readySummary ? readySummary.sumSquares : 0;
    let sumCubes = readySummary ? readySummary.sumCubes : 0;
    let sumFourth = readySummary ? readySummary.sumFourth : 0;
    if(!readySummary){
      for(let idx = 0; idx < series.length; idx++){
        const value = Number(series[idx]);
        if(!Number.isFinite(value)){
          continue;
        }
        n += 1;
        sum += value;
        const square = value * value;
        sumSquares += square;
        sumCubes += square * value;
        sumFourth += square * square;
      }
    }
    if(n < 8){
      return { method: 'dagostino', sampleSize: n, statistic: NaN, pValue: NaN, passed: null, reason: 'Sample size < 8' };
    }
    const meanVal = sum / n;
    const m2 = sumSquares - (sum * sum) / n;
    const meanSquared = meanVal * meanVal;
    const meanCubed = meanSquared * meanVal;
    const meanFourth = meanSquared * meanSquared;
    const m3 = sumCubes - 3 * meanVal * sumSquares + 2 * n * meanCubed;
    const m4 = sumFourth - 4 * meanVal * sumCubes + 6 * meanSquared * sumSquares - 3 * n * meanFourth;
    const s2 = m2 / (n - 1 || 1);
    const s = Math.sqrt(Math.max(s2, 0));
    if(!Number.isFinite(s) || s === 0){
      return { method: 'dagostino', sampleSize: n, statistic: 0, pValue: 1, passed: true, reason: 'Zero variance' };
    }
    const s3 = Math.pow(s, 3);
    const s4 = Math.pow(s, 4);
    const g1 = (n * m3) / ((n - 1) * (n - 2) * s3);
    const g2 = ((n * (n + 1) * m4) / ((n - 1) * (n - 2) * (n - 3) * s4)) - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    const mu2 = 6 * (n - 2) / ((n + 1) * (n + 3));
    const gamma2 = 36 * (n - 7) * (n * n + 2 * n - 5) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
    const w2 = Math.sqrt(2 * gamma2 + 4) - 1;
    const alpha = Math.sqrt(2 / (w2 - 1));
    const delta = 1 / Math.sqrt(Math.log(w2));
    const z1 = delta * Math.asinh(g1 / (alpha * Math.sqrt(mu2)));
    const mu1g2 = -6 / (n + 1);
    const mu2g2 = 24 * n * (n - 2) * (n - 3) / (Math.pow(n + 1, 2) * (n + 3) * (n + 5));
    const gamma1g2 = (6 * (n * n - 5 * n + 2) / ((n + 7) * (n + 9))) * Math.sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3)));
    const gamma2g2 = 36 * (15 * Math.pow(n, 6) - 36 * Math.pow(n, 5) - 628 * Math.pow(n, 4) + 982 * Math.pow(n, 3) + 5777 * Math.pow(n, 2) - 6402 * n + 900) /
      (n * (n - 3) * (n - 2) * (n + 7) * (n + 9) * (n + 11) * (n + 13));
    const A = 6 + (8 / gamma2g2) * (2 / gamma2g2 + gamma1g2 * gamma1g2);
    const term = (g2 - mu1g2) / Math.sqrt(mu2g2) * Math.sqrt(2 / (A - 4));
    const base = Math.pow((1 - 2 / A) / (1 + term), 1 / 3);
    const z2 = Math.sqrt(9 * A / 2) * (1 - 2 / (9 * A) - base);
    const statistic = z1 * z1 + z2 * z2;
    const pValue = Math.exp(-statistic / 2);
    const passed = Number.isFinite(pValue) ? pValue >= ASSUMPTION_ALPHA : null;
    return { method: 'dagostino', sampleSize: n, statistic, pValue, passed, z1, z2, g1, g2 };
  }

  function computeVarianceDiagnostics(groups, labels, options){
    const summaries = [];
    let totalN = 0;
    let grandSum = 0;
    const sparklineValues = [];
    const summaryList = Array.isArray(options?.summaries) ? options.summaries : null;
    for(let idx = 0; idx < groups.length; idx++){
      const group = Array.isArray(groups[idx]) ? groups[idx] : [];
      const label = labels[idx];
      if(!group.length){
        summaries.push({ count: 0, sum: 0, sumSquares: 0, mean: 0, median: NaN });
        sparklineValues.push({ label, value: 0 });
        continue;
      }
      const summaryRef = summaryList && summaryList[idx];
      const median = Number.isFinite(summaryRef?.median)
        ? summaryRef.median
        : quantileFromUnsorted(group, 0.5);
      let count = 0;
      let sum = 0;
      let sumSquares = 0;
      for(let j = 0; j < group.length; j++){
        const value = Number(group[j]);
        if(!Number.isFinite(value)){
          continue;
        }
        const deviation = Math.abs(value - (Number.isFinite(median) ? median : 0));
        sum += deviation;
        sumSquares += deviation * deviation;
        count++;
      }
      totalN += count;
      grandSum += sum;
      const mean = count ? sum / count : 0;
      sparklineValues.push({ label, value: mean });
      summaries.push({ count, sum, sumSquares, mean, median });
    }
    const k = summaries.length;
    if(k < 2){
      return { method: 'brown-forsythe', statistic: NaN, pValue: NaN, passed: null, df1: 0, df2: 0, sparkline: [], reason: 'Need >=2 groups' };
    }
    if(totalN <= k){
      return { method: 'brown-forsythe', statistic: NaN, pValue: NaN, passed: null, df1: k - 1, df2: Math.max(totalN - k, 0), sparkline: [], reason: 'Insufficient observations' };
    }
    const grandMean = grandSum / totalN;
    let ssBetween = 0;
    let ssWithin = 0;
    summaries.forEach(summary => {
      if(!summary.count){
        return;
      }
      const meanVal = summary.mean;
      ssBetween += summary.count * Math.pow(meanVal - grandMean, 2);
      const within = summary.sumSquares - (summary.sum * summary.sum) / (summary.count || 1);
      if(Number.isFinite(within)){
        ssWithin += within;
      }
    });
    const df1 = k - 1;
    const df2 = totalN - k;
    const msBetween = ssBetween / (df1 || 1);
    const msWithin = ssWithin / (df2 || 1);
    const F = msWithin === 0 ? Infinity : msBetween / msWithin;
    const pValue = Number.isFinite(F) ? 1 - fcdf(F, df1, df2) : 0;
    const passed = Number.isFinite(pValue) ? pValue >= ASSUMPTION_ALPHA : null;
    return { method: 'brown-forsythe', statistic: F, pValue, passed, df1, df2, sparkline: sparklineValues };
  }

  function countFiniteValues(values){
    if(!Array.isArray(values) || !values.length){
      return 0;
    }
    let count = 0;
    for(let idx = 0; idx < values.length; idx++){
      if(Number.isFinite(values[idx])){
        count++;
      }
    }
    return count;
  }

  function computeAssumptionDiagnostics(groups, labels, options){
    const diagnostics = {
      normalityMethod: 'dagostino',
      varianceMethod: 'brown-forsythe',
      alpha: ASSUMPTION_ALPHA,
      groups: [],
      warnings: []
    };
    const qqSampleLimit = Number.isFinite(options?.qqSampleLimit)
      ? Math.max(25, Math.floor(options.qqSampleLimit))
      : ASSUMPTION_QQ_SAMPLE_LIMIT;
    const summaryList = Array.isArray(options?.summaries) ? options.summaries : null;
    const failReasons = [];
    let normalityFailures = 0;
    groups.forEach((group, idx) => {
      const label = labels[idx] || `Group ${idx + 1}`;
      const summaryRef = summaryList && summaryList[idx];
      const dagostino = computeDagostino(group, summaryRef);
      const sampleSize = Number.isFinite(dagostino?.sampleSize)
        ? dagostino.sampleSize
        : Number.isFinite(summaryRef?.count)
          ? summaryRef.count
          : countFiniteValues(group);
      const qqPoints = sampleSize > 0
        ? computeQQPoints(group, { maxSampleSize: qqSampleLimit })
        : [];
      diagnostics.groups.push({
        label,
        size: sampleSize,
        normality: dagostino,
        qqPoints
      });
      if(dagostino && dagostino.passed === false){
        const formatted = Number.isFinite(dagostino.pValue) ? formatP(dagostino.pValue) : '-';
        failReasons.push(`${label} failed normality (p = ${formatted})`);
        normalityFailures++;
      }
    });
    const variance = computeVarianceDiagnostics(groups, labels, { summaries: summaryList });
    diagnostics.variance = variance;
    const varianceConcern = variance && variance.passed === false;
    if(variance && variance.passed === false){
      const formatted = Number.isFinite(variance.pValue) ? formatP(variance.pValue) : '-';
      failReasons.push(`Variance equality violated (p = ${formatted})`);
    }
    diagnostics.warnings = failReasons;
    diagnostics.normalityFailures = normalityFailures;
    diagnostics.varianceConcern = !!varianceConcern;
    diagnostics.recommendWelch = !!varianceConcern && normalityFailures === 0;
    diagnostics.recommendNonParametric = normalityFailures > 0;
    return diagnostics;
  }
  function mean(arr){
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function createUnavailableStatResult(base, message){
    return { available: false, message, ...base };
  }

  function sanitizeOneSampleNullValue(value){
    const numeric = Number(value);
    if(Number.isFinite(numeric)){
      return numeric;
    }
    return 0;
  }

  function warnDistributionUnavailable(distribution, context){
    logDebug('Debug: box worker distribution unavailable', { distribution, helper: context?.helper || null, hasJStat: !!global.jStat });
  }

  function tTest(a, b){
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.studentt && typeof jStatLib.studentt.cdf === 'function'
      ? jStatLib.studentt.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('student-t', { helper: 'tTest' });
      return createUnavailableStatResult({ t: NaN, df: NaN, p: NaN }, 'Student-t distribution unavailable.');
    }
    const na = a.length;
    const nb = b.length;
    const ma = mean(a);
    const mb = mean(b);
    const va = a.reduce((s, v) => s + Math.pow(v - ma, 2), 0) / (na - 1 || 1);
    const vb = b.reduce((s, v) => s + Math.pow(v - mb, 2), 0) / (nb - 1 || 1);
    const se = Math.sqrt(va / na + vb / nb);
    const t = (ma - mb) / se;
    const df = Math.pow(va / na + vb / nb, 2) / (Math.pow(va / na, 2) / (na - 1 || 1) + Math.pow(vb / nb, 2) / (nb - 1 || 1));
    const p = 2 * (1 - cdf(Math.abs(t), df));
    return { t, df, p };
  }

  function tTestPaired(a, b){
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.studentt && typeof jStatLib.studentt.cdf === 'function'
      ? jStatLib.studentt.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('student-t', { helper: 'tTestPaired' });
      return createUnavailableStatResult({ t: NaN, df: NaN, p: NaN }, 'Student-t distribution unavailable.');
    }
    const diffs = a.map((v, i) => v - b[i]).filter(v => !isNaN(v));
    const n = diffs.length;
    const md = mean(diffs);
    const sd = Math.sqrt(diffs.reduce((s, v) => s + Math.pow(v - md, 2), 0) / (n - 1 || 1));
    const t = md / (sd / Math.sqrt(n));
    const p = 2 * (1 - cdf(Math.abs(t), n - 1));
    return { t, df: n - 1, p };
  }

  function tTestOneSample(values, nullValue){
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.studentt && typeof jStatLib.studentt.cdf === 'function'
      ? jStatLib.studentt.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('student-t', { helper: 'tTestOneSample' });
      return createUnavailableStatResult({ t: NaN, df: NaN, p: NaN, n: 0, mean: NaN, sd: NaN }, 'Student-t distribution unavailable.');
    }
    const target = sanitizeOneSampleNullValue(nullValue);
    const cleaned = (Array.isArray(values) ? values : [])
      .map(Number)
      .filter(Number.isFinite);
    const n = cleaned.length;
    if(n < 2){
      return createUnavailableStatResult({ t: NaN, df: NaN, p: NaN, n, mean: NaN, sd: NaN }, 'One-sample t-test needs at least two values.');
    }
    const meanVal = mean(cleaned);
    const variance = cleaned.reduce((acc, val) => acc + Math.pow(val - meanVal, 2), 0) / (n - 1);
    const sd = Math.sqrt(Math.max(variance, 0));
    let t;
    let p;
    if(sd === 0){
      const delta = meanVal - target;
      if(delta === 0){
        t = 0;
        p = 1;
      }else{
        t = delta > 0 ? Infinity : -Infinity;
        p = 0;
      }
    }else{
      const se = sd / Math.sqrt(n);
      t = (meanVal - target) / se;
      p = 2 * (1 - cdf(Math.abs(t), n - 1));
    }
    return { t, df: n - 1, p, n, mean: meanVal, sd };
  }

  function wilcoxonOneSample(values, nullValue){
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf === 'function'
      ? jStatLib.normal.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('normal', { helper: 'wilcoxonOneSample' });
      return createUnavailableStatResult({ W: NaN, z: NaN, p: NaN, n: 0, effectiveN: 0, median: NaN }, 'Normal distribution unavailable.');
    }
    const target = sanitizeOneSampleNullValue(nullValue);
    const cleaned = (Array.isArray(values) ? values : [])
      .map(Number)
      .filter(Number.isFinite);
    const diffs = cleaned.map(val => val - target);
    const n = diffs.length;
    if(n < 1){
      return createUnavailableStatResult({ W: NaN, z: NaN, p: NaN, n, effectiveN: 0, median: NaN }, 'One-sample Wilcoxon test needs at least one value.');
    }
    const nonZeroDiffs = diffs.filter(v => v !== 0);
    const effectiveN = nonZeroDiffs.length;
    const medianDiff = quantileFromUnsorted(diffs, 0.5);
    if(!effectiveN){
      return { W: 0, z: 0, p: 1, n, effectiveN: 0, median: medianDiff };
    }
    const abs = nonZeroDiffs.map(Math.abs);
    const ranks = rankArray(abs);
    let Wpos = 0;
    let Wneg = 0;
    ranks.forEach((rk, idx) => {
      if(nonZeroDiffs[idx] > 0){
        Wpos += rk;
      }else{
        Wneg += rk;
      }
    });
    const W = Math.min(Wpos, Wneg);
    const mu = effectiveN * (effectiveN + 1) / 4;
    const sigma = Math.sqrt(effectiveN * (effectiveN + 1) * (2 * effectiveN + 1) / 24);
    const z = sigma === 0 ? 0 : (W - mu) / sigma;
    const p = 2 * (1 - cdf(Math.abs(z), 0, 1));
    return { W, z, p, n, effectiveN, median: medianDiff };
  }

  function rankArray(arr){
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    let i = 0;
    while(i < sorted.length){
      let j = i;
      while(j < sorted.length && sorted[j].v === sorted[i].v) j++;
      const avg = (i + j - 1) / 2 + 1;
      for(let k = i; k < j; k++) ranks[sorted[k].i] = avg;
      i = j;
    }
    return ranks;
  }

  function mannWhitney(a, b){
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf === 'function'
      ? jStatLib.normal.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('normal', { helper: 'mannWhitney' });
      return createUnavailableStatResult({ U: NaN, z: NaN, p: NaN }, 'Normal distribution unavailable.');
    }
    const all = [...a.map(v => ({ v, g: 0 })), ...b.map(v => ({ v, g: 1 }))];
    all.sort((x, y) => x.v - y.v);
    let rank = 1;
    for(let idx = 0; idx < all.length; idx++){
      let j = idx;
      while(j < all.length && all[j].v === all[idx].v){ j++; }
      const avg = (rank + (j - 1)) / 2;
      for(let k = idx; k < j; k++){ all[k].rank = avg; }
      rank = j + 1;
    }
    const Ra = all.filter(o => o.g === 0).reduce((s, o) => s + o.rank, 0);
    const Rb = all.filter(o => o.g === 1).reduce((s, o) => s + o.rank, 0);
    const na = a.length;
    const nb = b.length;
    const Ua = Ra - na * (na + 1) / 2;
    const Ub = Rb - nb * (nb + 1) / 2;
    const U = Math.min(Ua, Ub);
    const mu = na * nb / 2;
    const sigma = Math.sqrt(na * nb * (na + nb + 1) / 12);
    const z = (U - mu) / sigma;
    const p = 2 * (1 - cdf(Math.abs(z), 0, 1));
    return { U, z, p };
  }

  function wilcoxonSignedRank(a, b){
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf === 'function'
      ? jStatLib.normal.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('normal', { helper: 'wilcoxonSignedRank' });
      return createUnavailableStatResult({ W: NaN, z: NaN, p: NaN }, 'Normal distribution unavailable.');
    }
    const diffs = a.map((v, i) => v - b[i]).filter(v => v !== 0);
    const abs = diffs.map(Math.abs);
    const ranks = rankArray(abs);
    let Wpos = 0;
    let Wneg = 0;
    ranks.forEach((rk, i) => { if(diffs[i] > 0) Wpos += rk; else Wneg += rk; });
    const W = Math.min(Wpos, Wneg);
    const nEff = ranks.length;
    const mu = nEff * (nEff + 1) / 4;
    const sigma = Math.sqrt(nEff * (nEff + 1) * (2 * nEff + 1) / 24);
    const z = (W - mu) / sigma;
    const p = 2 * (1 - cdf(Math.abs(z), 0, 1));
    return { W, z, p };
  }

  function anova(groups){
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.centralF && typeof jStatLib.centralF.cdf === 'function'
      ? jStatLib.centralF.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('central-F', { helper: 'anova' });
      return createUnavailableStatResult({ F: NaN, p: NaN, dfBetween: NaN, dfWithin: NaN }, 'F distribution unavailable.');
    }
    const k = groups.length;
    const n = groups.reduce((s, g) => s + g.length, 0);
    const grand = groups.reduce((s, g) => s + mean(g) * g.length, 0) / n;
    let ssBetween = 0;
    let ssWithin = 0;
    groups.forEach(g => {
      const m = mean(g);
      ssBetween += g.length * Math.pow(m - grand, 2);
      ssWithin += g.reduce((s, v) => s + Math.pow(v - m, 2), 0);
    });
    const dfBetween = k - 1;
    const dfWithin = n - k;
    const msBetween = ssBetween / dfBetween;
    const msWithin = ssWithin / dfWithin;
    const F = msBetween / msWithin;
    const p = 1 - cdf(F, dfBetween, dfWithin);
    return { F, p, dfBetween, dfWithin };
  }

  function kruskalWallis(groups){
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.chisquare && typeof jStatLib.chisquare.cdf === 'function'
      ? jStatLib.chisquare.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('chi-square', { helper: 'kruskalWallis' });
      return createUnavailableStatResult({ H: NaN, p: NaN }, 'Chi-square distribution unavailable.');
    }
    const n = groups.reduce((s, g) => s + g.length, 0);
    const all = groups.flat();
    const ranks = rankArray(all);
    let idx = 0;
    const R = groups.map(g => {
      const r = ranks.slice(idx, idx + g.length).reduce((a, b) => a + b, 0);
      idx += g.length;
      return r;
    });
    const H = (12 / (n * (n + 1))) * R.reduce((sum, ri, i) => sum + Math.pow(ri, 2) / groups[i].length, 0) - 3 * (n + 1);
    const df = groups.length - 1;
    const p = 1 - cdf(H, df);
    return { H, p };
  }

  function rankValuesWithTieInfo(values){
    const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(values.length);
    let tieTerm = 0;
    let start = 0;
    while(start < sorted.length){
      let end = start + 1;
      while(end < sorted.length && sorted[end].v === sorted[start].v){
        end++;
      }
      const tieCount = end - start;
      const avg = (start + 1 + end) / 2;
      for(let idx = start; idx < end; idx++){
        ranks[sorted[idx].i] = avg;
      }
      if(tieCount > 1){
        tieTerm += Math.pow(tieCount, 3) - tieCount;
      }
      start = end;
    }
    return { ranks, tieTerm };
  }

  function computeRepeatedMeasuresAnova(groups){
    const cleaned = (Array.isArray(groups) ? groups : []).map(group => (Array.isArray(group) ? group : []).filter(Number.isFinite));
    const k = cleaned.length;
    if(k < 3){
      return { ok: false, message: 'Repeated-measures ANOVA requires at least three groups.' };
    }
    const n = cleaned[0]?.length || 0;
    if(n < 2){
      return { ok: false, message: 'Repeated-measures ANOVA needs at least two paired rows.' };
    }
    if(cleaned.some(group => group.length !== n)){
      return { ok: false, message: 'Repeated-measures ANOVA requires equal group sizes.' };
    }
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.centralF && typeof jStatLib.centralF.cdf === 'function'
      ? jStatLib.centralF.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('central-F', { helper: 'computeRepeatedMeasuresAnova' });
      return { ok: false, message: 'F distribution unavailable.' };
    }
    const grandN = n * k;
    let totalSum = 0;
    let ssTotal = 0;
    const conditionSums = new Array(k).fill(0);
    const subjectSums = new Array(n).fill(0);
    for(let j = 0; j < k; j++){
      for(let i = 0; i < n; i++){
        const value = cleaned[j][i];
        totalSum += value;
        conditionSums[j] += value;
        subjectSums[i] += value;
      }
    }
    const grandMean = totalSum / grandN;
    for(let j = 0; j < k; j++){
      for(let i = 0; i < n; i++){
        ssTotal += Math.pow(cleaned[j][i] - grandMean, 2);
      }
    }
    const ssCondition = conditionSums.reduce((acc, sum) => acc + n * Math.pow((sum / n) - grandMean, 2), 0);
    const ssSubject = subjectSums.reduce((acc, sum) => acc + k * Math.pow((sum / k) - grandMean, 2), 0);
    let ssError = ssTotal - ssCondition - ssSubject;
    if(ssError < 0 && Math.abs(ssError) < 1e-10){
      ssError = 0;
    }
    const df1 = k - 1;
    const df2 = (k - 1) * (n - 1);
    if(df1 <= 0 || df2 <= 0){
      return { ok: false, message: 'Repeated-measures ANOVA degrees of freedom are invalid.' };
    }
    const msCondition = ssCondition / df1;
    const msError = ssError / df2;
    let F;
    let p;
    if(msError === 0){
      F = msCondition > 0 ? Infinity : 0;
      p = msCondition > 0 ? 0 : 1;
    }else{
      F = msCondition / msError;
      p = 1 - cdf(F, df1, df2);
    }
    return {
      ok: true,
      F,
      p,
      df1,
      df2,
      footnote: 'Repeated-measures ANOVA assumes sphericity.'
    };
  }

  function computeFriedmanTest(groups){
    const cleaned = (Array.isArray(groups) ? groups : []).map(group => (Array.isArray(group) ? group : []).filter(Number.isFinite));
    const k = cleaned.length;
    if(k < 3){
      return { ok: false, message: 'Friedman test requires at least three groups.' };
    }
    const n = cleaned[0]?.length || 0;
    if(n < 2){
      return { ok: false, message: 'Friedman test needs at least two paired rows.' };
    }
    if(cleaned.some(group => group.length !== n)){
      return { ok: false, message: 'Friedman test requires equal group sizes.' };
    }
    const jStatLib = global.jStat;
    const cdf = jStatLib && jStatLib.chisquare && typeof jStatLib.chisquare.cdf === 'function'
      ? jStatLib.chisquare.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('chi-square', { helper: 'computeFriedmanTest' });
      return { ok: false, message: 'Chi-square distribution unavailable.' };
    }
    const rankSums = new Array(k).fill(0);
    let tieTermSum = 0;
    for(let row = 0; row < n; row++){
      const rowValues = cleaned.map(group => group[row]);
      const rankInfo = rankValuesWithTieInfo(rowValues);
      tieTermSum += rankInfo.tieTerm;
      for(let col = 0; col < k; col++){
        rankSums[col] += rankInfo.ranks[col];
      }
    }
    let Q = (12 / (n * k * (k + 1))) * rankSums.reduce((sum, val) => sum + val * val, 0) - 3 * n * (k + 1);
    let tieCorrection = 1;
    if(tieTermSum > 0){
      const denom = n * k * (k * k - 1);
      if(denom > 0){
        tieCorrection = 1 - (tieTermSum / denom);
      }
      if(tieCorrection > 0){
        Q /= tieCorrection;
      }
    }
    const df = k - 1;
    const p = 1 - cdf(Q, df);
    return {
      ok: true,
      Q,
      p,
      df,
      tieCorrection,
      footnote: tieTermSum > 0
        ? `Friedman tie correction applied (factor ${tieCorrection.toFixed(4)}).`
        : 'Friedman test on paired ranks.'
    };
  }

  function computeWelchAnova(groups){
    const cleaned = (Array.isArray(groups) ? groups : []).map(group => group.filter(Number.isFinite));
    const counts = cleaned.map(group => group.length);
    const k = cleaned.length;
    if(k < 2){
      return { ok: false, message: 'Welch ANOVA requires at least two groups.' };
    }
    if(counts.some(n => n < 2)){
      return { ok: false, message: 'Welch ANOVA needs at least two observations per group.' };
    }
    const means = cleaned.map(group => group.reduce((sum, val) => sum + val, 0) / group.length);
    const variances = cleaned.map((group, idx) => {
      const m = means[idx];
      const sumSq = group.reduce((sum, val) => sum + Math.pow(val - m, 2), 0);
      const denom = Math.max(group.length - 1, 1);
      const variance = sumSq / denom;
      return variance > 0 ? variance : Number.EPSILON;
    });
    const weights = variances.map((variance, idx) => counts[idx] / variance);
    const weightSum = weights.reduce((sum, val) => sum + val, 0);
    if(!Number.isFinite(weightSum) || weightSum <= 0){
      return { ok: false, message: 'Unable to normalize Welch weights (degenerate variances).' };
    }
    const meanWeighted = weights.reduce((sum, val, idx) => sum + val * means[idx], 0) / weightSum;
    let between = 0;
    let sumTerm = 0;
    for(let idx = 0; idx < k; idx++){
      const meanDiff = means[idx] - meanWeighted;
      between += weights[idx] * meanDiff * meanDiff;
      const weightFrac = weights[idx] / weightSum;
      sumTerm += Math.pow(1 - weightFrac, 2) / Math.max(counts[idx] - 1, 1);
    }
    const df1 = k - 1;
    const numerator = between / Math.max(df1, 1);
    const correctionDenom = Math.pow(k, 2) - 1;
    const correction = correctionDenom !== 0 ? 1 + (2 * (k - 2) / correctionDenom) * sumTerm : 1;
    const F = correction > 0 ? numerator / correction : NaN;
    const df2Den = 3 * sumTerm;
    const df2 = df2Den > 0 ? (Math.pow(k, 2) - 1) / df2Den : Number.POSITIVE_INFINITY;
    const p = Number.isFinite(F) ? 1 - fcdf(F, df1, df2) : 1;
    return {
      ok: Number.isFinite(F) && Number.isFinite(df2) && df2 > 0,
      F,
      p,
      df1,
      df2,
      means,
      counts,
      variances,
      footnote: `Welch ANOVA (df1 = ${df1}, df2 ~ ${Number.isFinite(df2) ? df2.toFixed(2) : 'Infinity'})`
    };
  }

  const GAUSS_HERMITE_NODES = [
    -3.889724897869781,
    -3.020637025120889,
    -2.2795070805010594,
    -1.5976826351526044,
    -0.9477883912401637,
    -0.3142403762543591,
    0.3142403762543591,
    0.9477883912401637,
    1.5976826351526044,
    2.2795070805010594,
    3.020637025120889,
    3.889724897869781
  ];
  const GAUSS_HERMITE_WEIGHTS = [
    2.6585516843563013e-07,
    0.00001761400713915212,
    0.0009322840086241802,
    0.02697315497843491,
    0.3982821276709972,
    1.830103131080486,
    1.830103131080486,
    0.3982821276709972,
    0.02697315497843491,
    0.0009322840086241802,
    0.00001761400713915212,
    2.6585516843563013e-07
  ];

  function studentizedRangeCDFInfinite(q, r){
    if(!Number.isFinite(q) || q <= 0){
      return 0;
    }
    if(!Number.isFinite(r) || r < 2){
      return 1;
    }
    const jStatLib = global.jStat;
    const normalCdf = value => {
      if(jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf === 'function'){
        return jStatLib.normal.cdf(value, 0, 1);
      }
      return 0.5 * (1 + Math.erf(value / Math.SQRT2));
    };
    let acc = 0;
    for(let i = 0; i < GAUSS_HERMITE_NODES.length; i++){
      const node = GAUSS_HERMITE_NODES[i];
      const weight = GAUSS_HERMITE_WEIGHTS[i];
      const t = node * Math.SQRT2;
      const upper = normalCdf(t + q);
      const lower = normalCdf(t);
      const span = Math.max(0, Math.min(1, upper - lower));
      acc += weight * Math.pow(span, r - 1);
    }
    const result = acc / Math.sqrt(Math.PI);
    return Math.max(0, Math.min(1, result));
  }

  function studentizedRangeCDF(q, r, df){
    if(!Number.isFinite(q) || q <= 0){
      return 0;
    }
    if(!Number.isFinite(df) || df <= 2){
      return studentizedRangeCDFInfinite(q * Math.SQRT1_2, r);
    }
    const scale = Math.sqrt(df / (df - 2));
    const adjusted = q * scale;
    return studentizedRangeCDFInfinite(adjusted, r);
  }

  function computeAnovaComponents(groups){
    const cleaned = (Array.isArray(groups) ? groups : []).map(group => group.filter(Number.isFinite));
    const counts = cleaned.map(group => group.length);
    const validCounts = counts.every(n => n > 0);
    if(!validCounts){
      return { ok: false, reason: 'Each group needs at least one observation for Tukey HSD.' };
    }
    const k = cleaned.length;
    const totals = cleaned.map(group => group.reduce((sum, val) => sum + val, 0));
    const totalN = counts.reduce((sum, val) => sum + val, 0);
    if(totalN <= k){
      return { ok: false, reason: 'Tukey HSD requires more observations than groups.' };
    }
    const means = totals.map((sum, idx) => sum / (counts[idx] || 1));
    const grandMean = totals.reduce((sum, val) => sum + val, 0) / totalN;
    let sse = 0;
    cleaned.forEach((group, idx) => {
      const meanVal = means[idx];
      group.forEach(value => { sse += Math.pow(value - meanVal, 2); });
    });
    const dfWithin = totalN - k;
    const mse = dfWithin > 0 ? sse / dfWithin : NaN;
    return {
      ok: Number.isFinite(mse) && mse > 0 && dfWithin > 0,
      mse,
      dfWithin,
      means,
      counts,
      grandMean,
      totalN,
      groupCount: k,
      sse
    };
  }

  function computeTukeyComparisons(groups, labels){
    const base = computeAnovaComponents(groups);
    if(!base.ok){
      return { ok: false, message: base.reason || 'Unable to compute Tukey HSD.' };
    }
    const pairs = [];
    for(let i = 0; i < base.groupCount; i++){
      for(let j = i + 1; j < base.groupCount; j++){
        const ni = base.counts[i];
        const nj = base.counts[j];
        const se = Math.sqrt(base.mse * 0.5 * (1 / ni + 1 / nj));
        if(!Number.isFinite(se) || se <= 0){
          continue;
        }
        const diff = base.means[i] - base.means[j];
        const q = Math.abs(diff) / se;
        const cdf = studentizedRangeCDF(q, base.groupCount, base.dfWithin);
        const pAdj = Math.max(0, Math.min(1, 1 - cdf));
        pairs.push({
          i,
          j,
          diff,
          se,
          q,
          pAdj,
          df: base.dfWithin,
          mse: base.mse,
          ni,
          nj,
          labelA: labels?.[i],
          labelB: labels?.[j]
        });
      }
    }
    return {
      ok: pairs.length > 0,
      pairs,
      df: base.dfWithin,
      mse: base.mse,
      footnote: `Tukey HSD adjusted via studentized range (df = ${base.dfWithin})`,
      counts: base.counts,
      means: base.means
    };
  }

  function computeGamesHowellComparisons(groups, labels){
    const cleaned = (Array.isArray(groups) ? groups : []).map(group => group.filter(Number.isFinite));
    const counts = cleaned.map(group => group.length);
    const k = cleaned.length;
    if(k < 2){
      return { ok: false, message: 'Games-Howell requires at least two groups.' };
    }
    if(counts.some(n => n < 2)){
      return { ok: false, message: 'Games-Howell needs >=2 observations per group.' };
    }
    const means = cleaned.map(group => group.reduce((sum, val) => sum + val, 0) / group.length);
    const variances = cleaned.map((group, idx) => {
      const m = means[idx];
      const sumSq = group.reduce((sum, val) => sum + Math.pow(val - m, 2), 0);
      const denom = Math.max(group.length - 1, 1);
      const variance = sumSq / denom;
      return variance > 0 ? variance : Number.EPSILON;
    });
    const pairs = [];
    for(let i = 0; i < k; i++){
      for(let j = i + 1; j < k; j++){
        const ni = counts[i];
        const nj = counts[j];
        const varI = variances[i];
        const varJ = variances[j];
        const se2 = varI / ni + varJ / nj;
        const se = Math.sqrt(se2 > 0 ? se2 : Number.EPSILON);
        const diff = means[i] - means[j];
        const q = Math.abs(diff) / se;
        const denom = (Math.pow(varI / ni, 2) / (ni - 1)) + (Math.pow(varJ / nj, 2) / (nj - 1));
        const df = denom > 0 ? Math.pow(se2, 2) / denom : Number.POSITIVE_INFINITY;
        const cdf = studentizedRangeCDF(q, k, df);
        const p = Math.max(0, Math.min(1, 1 - cdf));
        pairs.push({
          i,
          j,
          diff,
          se,
          q,
          p,
          pAdj: p,
          df,
          ni,
          nj,
          varI,
          varJ,
          labelA: labels?.[i],
          labelB: labels?.[j]
        });
      }
    }
    return {
      ok: pairs.length > 0,
      pairs,
      means,
      counts,
      variances,
      footnote: 'Games-Howell adjusted via studentized range (Welch df per pair)'
    };
  }

  function computeDunnComparisons(groups, labels){
    const cleaned = (Array.isArray(groups) ? groups : []).map(group => group.filter(Number.isFinite));
    const counts = cleaned.map(group => group.length);
    if(counts.some(n => n === 0)){
      return { ok: false, message: "Dunn's test requires at least one value per group." };
    }
    const k = cleaned.length;
    if(k < 2){
      return { ok: false, message: "Dunn's test needs at least two groups." };
    }
    const flat = [];
    cleaned.forEach((group, gi) => {
      group.forEach(value => flat.push({ value, group: gi }));
    });
    flat.sort((a, b) => a.value - b.value);
    let idx = 0;
    let tieSum = 0;
    while(idx < flat.length){
      let j = idx + 1;
      while(j < flat.length && flat[j].value === flat[idx].value){ j++; }
      const t = j - idx;
      const avg = (idx + j - 1) / 2 + 1;
      for(let m = idx; m < j; m++){ flat[m].rank = avg; }
      if(t > 1){ tieSum += t * t * t - t; }
      idx = j;
    }
    const rankSums = new Array(k).fill(0);
    flat.forEach(item => { rankSums[item.group] += item.rank; });
    const totalN = flat.length;
    if(totalN <= 1){
      return { ok: false, message: "Dunn's test requires more than one observation." };
    }
    const varianceBase = totalN * (totalN + 1) / 12;
    const tieCorrectionDenom = Math.pow(totalN, 3) - totalN;
    const tieCorrection = tieCorrectionDenom !== 0 ? 1 - tieSum / tieCorrectionDenom : 1;
    const corrected = Math.max(tieCorrection, 1e-6);
    const pairs = [];
    for(let i = 0; i < k; i++){
      for(let j = i + 1; j < k; j++){
        const meanRankI = rankSums[i] / counts[i];
        const meanRankJ = rankSums[j] / counts[j];
        const diff = meanRankI - meanRankJ;
        const se = Math.sqrt(varianceBase * corrected * ((1 / counts[i]) + (1 / counts[j])));
        if(!Number.isFinite(se) || se <= 0){
          continue;
        }
        const z = diff / se;
        const absZ = Math.abs(z);
        const jStatLib = global.jStat;
        const cdf = jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf === 'function'
          ? jStatLib.normal.cdf(absZ, 0, 1)
          : 0.5 * (1 + Math.erf(absZ / Math.SQRT2));
        const p = Math.max(0, Math.min(1, 2 * (1 - cdf)));
        pairs.push({
          i,
          j,
          diff,
          z,
          se,
          p,
          labelA: labels?.[i],
          labelB: labels?.[j],
          counts: { a: counts[i], b: counts[j] },
          rankMeans: { a: meanRankI, b: meanRankJ }
        });
      }
    }
    return {
      ok: pairs.length > 0,
      pairs,
      footnote: "Dunn's test uses rank sums with tie correction.",
      totalN,
      counts
    };
  }
  function computeVectorStats(values){
    const arr = (Array.isArray(values) ? values : []).map(Number).filter(v => Number.isFinite(v));
    const n = arr.length;
    if(!n){
      return { n: 0, mean: NaN, variance: NaN, sd: NaN };
    }
    const meanVal = arr.reduce((sum, v) => sum + v, 0) / n;
    let variance = 0;
    if(n > 1){
      const sumSq = arr.reduce((sum, v) => sum + Math.pow(v - meanVal, 2), 0);
      variance = sumSq / (n - 1);
    }
    const sd = Math.sqrt(Math.max(variance, 0));
    return { n, mean: meanVal, variance, sd };
  }

  function computePairedSamples(a, b){
    const len = Math.min(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0);
    const samples = [];
    for(let i = 0; i < len; i++){
      const av = Number(a[i]);
      const bv = Number(b[i]);
      if(Number.isFinite(av) && Number.isFinite(bv)){
        samples.push({ a: av, b: bv });
      }
    }
    return samples;
  }

  function computeDiffStats(pairedSamples){
    const diffs = [];
    let positive = 0;
    let negative = 0;
    let ties = 0;
    pairedSamples.forEach(pair => {
      const diff = pair.a - pair.b;
      diffs.push(diff);
      if(diff > 0) positive++;
      else if(diff < 0) negative++;
      else ties++;
    });
    const stats = computeVectorStats(diffs);
    return { ...stats, positive, negative, ties, total: stats.n };
  }

  function computePairwiseCounts(a, b){
    const arrA = (Array.isArray(a) ? a : []).map(Number).filter(v => Number.isFinite(v));
    const arrB = (Array.isArray(b) ? b : []).map(Number).filter(v => Number.isFinite(v));
    const nA = arrA.length;
    const nB = arrB.length;
    if(nA === 0 || nB === 0){
      return { greater: 0, less: 0, equal: 0, totalPairs: 0, nA, nB };
    }
    arrB.sort((x, y) => x - y);
    function lowerBound(arr, value){
      let lo = 0;
      let hi = arr.length;
      while(lo < hi){
        const mid = (lo + hi) >> 1;
        if(arr[mid] < value) lo = mid + 1; else hi = mid;
      }
      return lo;
    }
    function upperBound(arr, value){
      let lo = 0;
      let hi = arr.length;
      while(lo < hi){
        const mid = (lo + hi) >> 1;
        if(arr[mid] <= value) lo = mid + 1; else hi = mid;
      }
      return lo;
    }
    let greater = 0;
    let less = 0;
    let equal = 0;
    for(let i = 0; i < nA; i++){
      const av = arrA[i];
      const lessCount = lowerBound(arrB, av);
      const leCount = upperBound(arrB, av);
      const eq = leCount - lessCount;
      greater += lessCount;
      equal += eq;
      less += (nB - leCount);
    }
    const totalPairs = greater + less + equal;
    return { greater, less, equal, totalPairs, nA, nB };
  }

  function computeEffectSizeMetrics(a, b, options){
    const paired = !!options?.paired;
    const statsA = computeVectorStats(a);
    const statsB = computeVectorStats(b);
    const pairedSamples = paired ? computePairedSamples(a, b) : [];
    const diffStats = paired ? computeDiffStats(pairedSamples) : null;
    const counts = !paired ? computePairwiseCounts(a, b) : null;
    const metrics = { parametric: {}, nonParametric: {}, context: { nA: statsA.n, nB: statsB.n, paired } };
    if(paired){
      metrics.context.nPairs = diffStats?.total || 0;
    }
    if(statsA.n > 0 && statsB.n > 0){
      if(paired){
        if(diffStats && diffStats.total > 1 && Number.isFinite(diffStats.sd) && diffStats.sd > 0){
          const d = diffStats.mean / (diffStats.sd || 1);
          metrics.parametric.cohenD = d;
          const correctionDenom = 4 * diffStats.total - 9;
          const correction = correctionDenom !== 0 ? 1 - 3 / correctionDenom : 1;
          if(Number.isFinite(correction)){
            metrics.parametric.hedgesG = d * correction;
          }
        }
      }else{
        const pooledDenom = (statsA.n - 1) + (statsB.n - 1);
        if(pooledDenom > 0){
          const pooledVar = ((statsA.variance * (statsA.n - 1)) + (statsB.variance * (statsB.n - 1))) / pooledDenom;
          const pooledSd = Math.sqrt(Math.max(pooledVar, 0));
          if(pooledSd > 0){
            const d = (statsA.mean - statsB.mean) / pooledSd;
            metrics.parametric.cohenD = d;
            const correctionDenom = 4 * (statsA.n + statsB.n) - 9;
            const correction = correctionDenom !== 0 ? 1 - 3 / correctionDenom : 1;
            if(Number.isFinite(correction)){
              metrics.parametric.hedgesG = d * correction;
            }
          }
        }
      }
    }
    if(!paired && counts && counts.totalPairs > 0){
      const delta = (counts.greater - counts.less) / counts.totalPairs;
      metrics.nonParametric.rankBiserial = clamp(delta, -1, 1);
      const commonLanguage = (counts.greater + 0.5 * counts.equal) / counts.totalPairs;
      metrics.nonParametric.commonLanguage = clamp(commonLanguage, 0, 1);
    }
    if(paired && diffStats && diffStats.total > 0){
      const rb = (diffStats.positive - diffStats.negative) / diffStats.total;
      metrics.nonParametric.rankBiserial = clamp(rb, -1, 1);
      const cl = (diffStats.positive + 0.5 * diffStats.ties) / diffStats.total;
      metrics.nonParametric.commonLanguage = clamp(cl, 0, 1);
    }
    const debugPayload = {
      paired,
      nA: statsA.n,
      nB: statsB.n,
      nPairs: diffStats?.total || 0,
      parametric: Object.fromEntries(Object.entries(metrics.parametric).map(([key, val]) => [key, safeRound(val, 4)])),
      nonParametric: Object.fromEntries(Object.entries(metrics.nonParametric).map(([key, val]) => [key, safeRound(val, 4)])),
      counts: counts ? { ...counts, totalPairs: counts.totalPairs } : null,
      diffCounts: diffStats ? { positive: diffStats.positive, negative: diffStats.negative, ties: diffStats.ties } : null
    };
    logDebug('Debug: box worker computeEffectSizeMetrics', debugPayload);
    return { ...metrics, statsA, statsB, diffStats, counts };
  }
  function computeSampleSpreadFactor(sampleSize, debugEnabled){
    const n = Number(sampleSize) || 0;
    if(n <= 1){
      if(debugEnabled){
        console.debug('Debug: computeSampleSpreadFactor minimal', { sampleSize: n, factor: 0.2 });
      }
      return 0.2;
    }
    const sqrtScaled = Math.sqrt(n) / 7;
    const factor = Math.min(1, Math.max(0.2, sqrtScaled));
    if(debugEnabled){
      console.debug('Debug: computeSampleSpreadFactor', { sampleSize: n, sqrtScaled, factor });
    }
    return factor;
  }

  function computeSwarmOffsets(points, options){
    const isArrayLike = value => Array.isArray(value) || ArrayBuffer.isView(value);
    const coordsSource = points ? points.coords : null;
    const isCompact = !!points && !Array.isArray(points) && isArrayLike(coordsSource);
    const coordsInput = isCompact ? coordsSource : null;
    const rawInput = isCompact
      ? (isArrayLike(points.raws) ? points.raws : (isArrayLike(points.rawValues) ? points.rawValues : coordsInput))
      : null;
    const entries = Array.isArray(points) ? points : [];
    const entryCount = isCompact ? (coordsInput ? coordsInput.length : 0) : entries.length;
    const sampleSize = Number(options?.sampleSize) || entryCount;
    let pointRadiusValue = Number(options?.pointRadius);
    if(!Number.isFinite(pointRadiusValue) || pointRadiusValue <= 0){
      pointRadiusValue = 1;
    }
    const basePointRadius = pointRadiusValue;
    const axisSpacing = Number(options?.axisSpacing) || 0;
    const orientation = options?.orientation || 'vertical';
    const widthScaleMode = options?.widthScaleMode || 'none';
    const maxHalfWidthOverride = Number(options?.maxHalfWidth);
    const allowRadiusAdjustment = options?.allowRadiusAdjustment !== false;
    const radiusCountExponent = Number(options?.radiusCountExponent);
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const spreadFactor = computeSampleSpreadFactor(sampleSize, debugEnabled);
    const PREFERRED_GAP_FACTOR = 2.05;
    const densityDistance = Math.max(0.5, basePointRadius * PREFERRED_GAP_FACTOR);
    let axisBoundary = Math.max(0, axisSpacing / 2 - basePointRadius);
    const violinScale = 0.45;
    const stripScale = 0.18;
    const baseScale = stripScale / violinScale;
    let effectiveHalfSpan = axisBoundary > 0
      ? axisSpacing * stripScale * spreadFactor
      : basePointRadius * 2.2 * spreadFactor;
    let globalMaxHalfWidth = Math.max(basePointRadius * 1.05, Math.min(effectiveHalfSpan, axisBoundary || effectiveHalfSpan));
    if(Number.isFinite(maxHalfWidthOverride) && maxHalfWidthOverride > 0){
      globalMaxHalfWidth = Math.max(basePointRadius * 1.05, maxHalfWidthOverride);
      if(axisBoundary > 0){
        globalMaxHalfWidth = Math.min(globalMaxHalfWidth, axisBoundary);
      }
    }
    if(!entryCount || !Number.isFinite(globalMaxHalfWidth) || globalMaxHalfWidth <= 0){
      if(debugEnabled){
        console.debug('Debug: computeSwarmOffsets empty', { orientation, sampleSize, axisSpacing });
      }
      return { offsets: new Array(entryCount).fill(0), maxOffsetUsed: 0, spreadFactor, maxOffset: 0 };
    }
    const offsetsByIndex = new Array(entryCount);
    const maxHalfWidthByIndex = new Array(entryCount);
    const coords = new Float64Array(entryCount);
    const jitters = new Uint32Array(entryCount);
    const fastThresholdRaw = Number(options?.fastThreshold);
    const fastThreshold = Number.isFinite(fastThresholdRaw) && fastThresholdRaw > 0 ? fastThresholdRaw : 20000;
    const fastMode = options?.fastMode;
    const useFastPlacement = fastMode === true
      ? true
      : (fastMode === false ? false : entryCount >= fastThreshold);
    const buildEntryJitterKey = (rawValue, coordValue, index, seed) => {
      const raw = Number(rawValue);
      const baseValue = Number.isFinite(raw) ? raw : (Number.isFinite(coordValue) ? coordValue : 0);
      const scaled = Math.round(baseValue * 1000);
      let hash = (scaled ^ (seed || 0)) >>> 0;
      hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
      hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
      hash = ((hash >>> 16) ^ hash) >>> 0;
      hash = (hash + (Number(index) + 1) * 1013) >>> 0;
      return hash;
    };
    const buildSortedIndices = seed => {
      const sorted = new Array(entryCount);
      let sortedCount = 0;
      if(isCompact){
        for(let i = 0; i < entryCount; i++){
          const coord = Number(coordsInput[i]);
          const safeCoord = Number.isFinite(coord) ? coord : 0;
          coords[i] = safeCoord;
          jitters[i] = buildEntryJitterKey(rawInput ? rawInput[i] : safeCoord, safeCoord, i, seed);
          sorted[sortedCount] = i;
          sortedCount += 1;
        }
      }else{
        for(let i = 0; i < entries.length; i++){
          const entry = entries[i];
          if(!entry || typeof entry.index !== 'number'){
            continue;
          }
          const coord = Number(entry.coord);
          const safeCoord = Number.isFinite(coord) ? coord : 0;
          const idx = entry.index;
          coords[idx] = safeCoord;
          jitters[idx] = buildEntryJitterKey(entry.raw, safeCoord, idx, seed);
          sorted[sortedCount] = idx;
          sortedCount += 1;
        }
      }
      if(sortedCount !== sorted.length){
        sorted.length = sortedCount;
      }
      sorted.sort((a, b) => (coords[a] - coords[b]) || (jitters[a] - jitters[b]) || (a - b));
      return sorted;
    };
    const getMaxOverlapCount = (sorted, distance) => {
      if(!sorted.length || !Number.isFinite(distance) || distance <= 0){
        return 0;
      }
      let maxCount = 0;
      let start = 0;
      for(let i = 0; i < sorted.length; i++){
        const coord = coords[sorted[i]];
        while(start < i && coord - coords[sorted[start]] > distance){
          start += 1;
        }
        const count = i - start + 1;
        if(count > maxCount){
          maxCount = count;
        }
      }
      return maxCount;
    };
    let seedBase = Math.round((sampleSize || entries.length) * 17 + pointRadiusValue * 1000);
    let sortedIndices = buildSortedIndices(seedBase);
    let collisionDistance = Math.max(0.5, pointRadiusValue * PREFERRED_GAP_FACTOR);
    let maxCount = getMaxOverlapCount(sortedIndices, collisionDistance);
    if(debugEnabled && maxCount > 1){
      console.debug('Debug: computeSwarmOffsets overlap scan', {
        orientation,
        pointRadius: pointRadiusValue,
        collisionDistance,
        maxCount
      });
    }
    if(maxCount <= 0){
      if(debugEnabled){
        console.debug('Debug: computeSwarmOffsets noBins', { orientation, sampleSize, axisSpacing });
      }
      return { offsets: entries.map(() => 0), maxOffsetUsed: 0, spreadFactor, maxOffset: 0 };
    }

    if(maxCount > 1 && allowRadiusAdjustment){
      const initialRadius = pointRadiusValue;
      const minRadius = Math.max(0.15, basePointRadius * 0.45);
      const effectiveCount = (Number.isFinite(radiusCountExponent) && radiusCountExponent > 0 && radiusCountExponent !== 1)
        ? (maxCount <= 1 ? maxCount : (1 + Math.pow(maxCount - 1, radiusCountExponent)))
        : maxCount;
      const maxAllowedRadius = (globalMaxHalfWidth * 2) / ((Math.max(1, effectiveCount) - 1) * PREFERRED_GAP_FACTOR);
      if(Number.isFinite(maxAllowedRadius) && maxAllowedRadius < pointRadiusValue){
        const adjusted = Math.max(minRadius, Math.min(pointRadiusValue, maxAllowedRadius));
        if(adjusted < pointRadiusValue){
          if(debugEnabled){
            console.debug('Debug: computeSwarmOffsets auto-adjust radius', { previousRadius: pointRadiusValue, adjustedRadius: adjusted, maxCount });
          }
          pointRadiusValue = adjusted;
        }
      }
      if(pointRadiusValue !== initialRadius){
        seedBase = Math.round((sampleSize || entries.length) * 17 + pointRadiusValue * 1000);
        sortedIndices = buildSortedIndices(seedBase);
        collisionDistance = Math.max(0.5, pointRadiusValue * PREFERRED_GAP_FACTOR);
        maxCount = getMaxOverlapCount(sortedIndices, collisionDistance);
        if(debugEnabled && maxCount > 1){
          console.debug('Debug: computeSwarmOffsets overlap scan adjusted', {
            orientation,
            pointRadius: pointRadiusValue,
            collisionDistance,
            maxCount
          });
        }
      }
    }

    let localCounts = null;
    let densityMax = maxCount;
    if(widthScaleMode === 'density' && sortedIndices.length){
      localCounts = new Array(entryCount);
      let left = 0;
      let right = 0;
      let maxLocal = 0;
      for(let i = 0; i < sortedIndices.length; i++){
        const coord = coords[sortedIndices[i]];
        if(right < i){
          right = i;
        }
        while(right + 1 < sortedIndices.length && coords[sortedIndices[right + 1]] - coord <= densityDistance){
          right += 1;
        }
        while(coord - coords[sortedIndices[left]] > densityDistance){
          left += 1;
        }
        const count = right - left + 1;
        localCounts[sortedIndices[i]] = count;
        if(count > maxLocal){
          maxLocal = count;
        }
      }
      densityMax = Math.max(1, maxLocal);
    }

    const groupSizeByIndex = new Array(entryCount);
    const groupIndexByIndex = new Array(entryCount);
    const centerBuckets = [];
    if(sortedIndices.length){
      const coordQuantum = 1;
      let bucket = [];
      let lastKey = null;
      for(let i = 0; i < sortedIndices.length; i++){
        const index = sortedIndices[i];
        const coord = coords[index];
        const coordKey = Number.isFinite(coord)
          ? Math.round(coord / coordQuantum) * coordQuantum
          : coord;
        if(!bucket.length){
          bucket.push(index);
          lastKey = coordKey;
          continue;
        }
        if(coordKey === lastKey){
          bucket.push(index);
          continue;
        }
        if(bucket.length > 1){
          centerBuckets.push(bucket);
          const size = bucket.length;
          for(let j = 0; j < size; j++){
            const idx = bucket[j];
            groupSizeByIndex[idx] = size;
            groupIndexByIndex[idx] = j;
          }
        }
        bucket = [index];
        lastKey = coordKey;
      }
      if(bucket.length > 1){
        centerBuckets.push(bucket);
        const size = bucket.length;
        for(let j = 0; j < size; j++){
          const idx = bucket[j];
          groupSizeByIndex[idx] = size;
          groupIndexByIndex[idx] = j;
        }
      }
    }

    const pairBuckets = [];
    if(sortedIndices.length > 1){
      const neighborLeftByIndex = new Array(entryCount);
      const neighborRightByIndex = new Array(entryCount);
      const neighborCountByIndex = new Array(entryCount);
      let left = 0;
      let right = 0;
      for(let i = 0; i < sortedIndices.length; i++){
        const coord = coords[sortedIndices[i]];
        if(right < i){
          right = i;
        }
        while(right + 1 < sortedIndices.length && coords[sortedIndices[right + 1]] - coord <= collisionDistance){
          right += 1;
        }
        while(coord - coords[sortedIndices[left]] > collisionDistance){
          left += 1;
        }
        const index = sortedIndices[i];
        neighborLeftByIndex[index] = left;
        neighborRightByIndex[index] = right;
        neighborCountByIndex[index] = right - left + 1;
      }
      const paired = new Uint8Array(entryCount);
      for(let i = 0; i < sortedIndices.length; i++){
        const entryIndex = sortedIndices[i];
        if(paired[entryIndex]){
          continue;
        }
        if((groupSizeByIndex[entryIndex] || 0) > 1){
          continue;
        }
        const count = neighborCountByIndex[entryIndex];
        if(count !== 2){
          continue;
        }
        let otherIndex = null;
        const leftIdx = neighborLeftByIndex[entryIndex];
        const rightIdx = neighborRightByIndex[entryIndex];
        for(let k = leftIdx; k <= rightIdx; k++){
          const candidate = sortedIndices[k];
          if(candidate !== entryIndex){
            otherIndex = candidate;
            break;
          }
        }
        if(otherIndex == null || paired[otherIndex]){
          continue;
        }
        if((groupSizeByIndex[otherIndex] || 0) > 1){
          continue;
        }
        if(neighborCountByIndex[otherIndex] !== 2){
          continue;
        }
        paired[entryIndex] = 1;
        paired[otherIndex] = 1;
        pairBuckets.push([entryIndex, otherIndex]);
      }
    }

    const collisionDistanceSq = collisionDistance * collisionDistance;
    let maxUsed = 0;
    const placedCoord = new Float64Array(entryCount);
    const placedOffset = new Float64Array(entryCount);
    let placedCount = 0;
    let activeStart = 0;
    const candidateCount = Math.min(9, Math.max(5, Math.round(Math.log(entryCount + 2) * 2)));
    const intervalPool = [];
    const freeIntervalPool = [];
    const intervals = [];
    const freeIntervals = [];
    const candidates = [];
    for(let idx = 0; idx < sortedIndices.length; idx++){
      const index = sortedIndices[idx];
      const coord = coords[index];
      while(activeStart < placedCount && coord - placedCoord[activeStart] > collisionDistance){
        activeStart += 1;
      }
      let maxHalfWidth = globalMaxHalfWidth;
      if(widthScaleMode === 'density' && localCounts){
        const localCount = localCounts[index] || 1;
        const scale = densityMax > 1 ? (localCount / densityMax) : 1;
        const scaledWidth = globalMaxHalfWidth * scale;
        maxHalfWidth = Math.max(pointRadiusValue * 1.05, Math.min(globalMaxHalfWidth, scaledWidth));
      }
      maxHalfWidthByIndex[index] = maxHalfWidth;
      const groupSize = Number.isFinite(groupSizeByIndex[index]) ? groupSizeByIndex[index] : 1;
      const groupIndex = Number.isFinite(groupIndexByIndex[index]) ? groupIndexByIndex[index] : 0;
      const resolveOffset = maxHalfWidthValue => {
        if(!Number.isFinite(maxHalfWidthValue) || maxHalfWidthValue <= 0){
          return null;
        }
        const preferSymmetric = groupSize > 1;
        const evenGroup = preferSymmetric && groupSize % 2 === 0;
        if(useFastPlacement){
          let preferredOffset = null;
          if(preferSymmetric){
            const gapLimit = groupSize > 1 ? (maxHalfWidthValue * 2) / Math.max(1, groupSize - 1) : 0;
            const preferredGap = Math.min(collisionDistance, Number.isFinite(gapLimit) && gapLimit > 0 ? gapLimit : collisionDistance);
            const centerIndex = (groupSize - 1) / 2;
            preferredOffset = (groupIndex - centerIndex) * preferredGap;
            if(!Number.isFinite(preferredOffset)){
              preferredOffset = 0;
            }
            if(preferredOffset > maxHalfWidthValue){
              preferredOffset = maxHalfWidthValue;
            }else if(preferredOffset < -maxHalfWidthValue){
              preferredOffset = -maxHalfWidthValue;
            }
          }
          if(activeStart >= placedCount){
            if(preferSymmetric && Number.isFinite(preferredOffset)){
              return preferredOffset;
            }
            return 0;
          }
          candidates.length = 0;
          const addCandidate = cand => {
            if(Number.isFinite(cand)){
              candidates.push(cand);
            }
          };
          if(preferSymmetric && Number.isFinite(preferredOffset)){
            addCandidate(preferredOffset);
          }
          if(!evenGroup){
            addCandidate(0);
          }
          addCandidate(-maxHalfWidthValue);
          addCandidate(maxHalfWidthValue);
          let rng = (jitters[index] ^ (seedBase + idx * 2654435761)) >>> 0;
          const nextRand = () => {
            rng = (rng * 1664525 + 1013904223) >>> 0;
            return rng / 4294967295;
          };
          for(let i = 0; i < candidateCount; i++){
            const u = nextRand();
            addCandidate(-maxHalfWidthValue + u * (maxHalfWidthValue * 2));
          }
          if(!candidates.length){
            return 0;
          }
          let bestFree = -Infinity;
          let bestOverlap = -Infinity;
          let chosenLocal = null;
          for(let i = 0; i < candidates.length; i++){
            const cand = candidates[i];
            let minDistSq = Infinity;
            for(let j = activeStart; j < placedCount; j++){
              const dx = cand - placedOffset[j];
              const dy = coord - placedCoord[j];
              const distSq = dx * dx + dy * dy;
              if(distSq < minDistSq){
                minDistSq = distSq;
                if(bestFree > -Infinity && minDistSq < collisionDistanceSq){
                  break;
                }
              }
            }
            if(minDistSq >= collisionDistanceSq){
              if(minDistSq > bestFree){
                bestFree = minDistSq;
                chosenLocal = cand;
              }
            }else if(bestFree === -Infinity && minDistSq > bestOverlap){
              bestOverlap = minDistSq;
              chosenLocal = cand;
            }
          }
          return chosenLocal == null ? 0 : chosenLocal;
        }
        intervals.length = 0;
        let intervalCount = 0;
        for(let j = activeStart; j < placedCount; j++){
          const dy = coord - placedCoord[j];
          if(dy >= collisionDistance || dy <= -collisionDistance){
            continue;
          }
          const dx = Math.sqrt(Math.max(0, collisionDistanceSq - dy * dy));
          let start = placedOffset[j] - dx;
          let end = placedOffset[j] + dx;
          if(end < -maxHalfWidthValue || start > maxHalfWidthValue){
            continue;
          }
          if(start < -maxHalfWidthValue){ start = -maxHalfWidthValue; }
          if(end > maxHalfWidthValue){ end = maxHalfWidthValue; }
          if(end > start){
            const interval = intervalPool[intervalCount] || (intervalPool[intervalCount] = { start: 0, end: 0 });
            interval.start = start;
            interval.end = end;
            intervals[intervalCount] = interval;
            intervalCount += 1;
          }
        }
        intervals.length = intervalCount;
        if(!intervals.length && !preferSymmetric){
          return 0;
        }
        if(!intervals.length && preferSymmetric){
          const gapLimit = groupSize > 1 ? (maxHalfWidthValue * 2) / Math.max(1, groupSize - 1) : 0;
          const preferredGap = Math.min(collisionDistance, Number.isFinite(gapLimit) && gapLimit > 0 ? gapLimit : collisionDistance);
          const centerIndex = (groupSize - 1) / 2;
          let preferredOffset = (groupIndex - centerIndex) * preferredGap;
          if(!Number.isFinite(preferredOffset)){
            preferredOffset = 0;
          }
          if(preferredOffset > maxHalfWidthValue){
            preferredOffset = maxHalfWidthValue;
          }else if(preferredOffset < -maxHalfWidthValue){
            preferredOffset = -maxHalfWidthValue;
          }
          return preferredOffset;
        }
        freeIntervals.length = 0;
        let freeCount = 0;
        if(!intervals.length){
          const full = freeIntervalPool[freeCount] || (freeIntervalPool[freeCount] = { start: 0, end: 0 });
          full.start = -maxHalfWidthValue;
          full.end = maxHalfWidthValue;
          freeIntervals[freeCount] = full;
          freeCount += 1;
        }else{
          intervals.sort((a, b) => (a.start - b.start) || (a.end - b.end));
          let cursor = -maxHalfWidthValue;
          let curStart = intervals[0].start;
          let curEnd = intervals[0].end;
          for(let i = 1; i < intervals.length; i++){
            const next = intervals[i];
            if(next.start <= curEnd){
              curEnd = Math.max(curEnd, next.end);
            }else{
              if(curStart > cursor){
                const interval = freeIntervalPool[freeCount] || (freeIntervalPool[freeCount] = { start: 0, end: 0 });
                interval.start = cursor;
                interval.end = curStart;
                freeIntervals[freeCount] = interval;
                freeCount += 1;
              }
              cursor = curEnd;
              curStart = next.start;
              curEnd = next.end;
            }
          }
          if(curStart > cursor){
            const interval = freeIntervalPool[freeCount] || (freeIntervalPool[freeCount] = { start: 0, end: 0 });
            interval.start = cursor;
            interval.end = curStart;
            freeIntervals[freeCount] = interval;
            freeCount += 1;
          }
          cursor = Math.max(cursor, curEnd);
          if(cursor < maxHalfWidthValue){
            const interval = freeIntervalPool[freeCount] || (freeIntervalPool[freeCount] = { start: 0, end: 0 });
            interval.start = cursor;
            interval.end = maxHalfWidthValue;
            freeIntervals[freeCount] = interval;
            freeCount += 1;
          }
        }
        freeIntervals.length = freeCount;
        if(freeIntervals.length){
          let write = 0;
          for(let i = 0; i < freeIntervals.length; i++){
            const interval = freeIntervals[i];
            if(interval.end - interval.start > 0.0001){
              freeIntervals[write] = interval;
              write += 1;
            }
          }
          freeIntervals.length = write;
        }
        let allowOverlap = false;
        if(!freeIntervals.length){
          allowOverlap = true;
          const full = freeIntervalPool[0] || (freeIntervalPool[0] = { start: 0, end: 0 });
          full.start = -maxHalfWidthValue;
          full.end = maxHalfWidthValue;
          freeIntervals[0] = full;
          freeIntervals.length = 1;
        }
        let totalFree = 0;
        for(let i = 0; i < freeIntervals.length; i++){
          totalFree += (freeIntervals[i].end - freeIntervals[i].start);
        }
        if(!Number.isFinite(totalFree) || totalFree <= 0){
          return null;
        }
        let rng = (jitters[index] ^ (seedBase + idx * 2654435761)) >>> 0;
        const nextRand = () => {
          rng = (rng * 1664525 + 1013904223) >>> 0;
          return rng / 4294967295;
        };
        candidates.length = 0;
        const addCandidate = cand => {
          if(Number.isFinite(cand)){
            candidates.push(cand);
          }
        };
        let preferredOffset = null;
        if(preferSymmetric){
          const gapLimit = groupSize > 1 ? (maxHalfWidthValue * 2) / Math.max(1, groupSize - 1) : 0;
          const preferredGap = Math.min(collisionDistance, Number.isFinite(gapLimit) && gapLimit > 0 ? gapLimit : collisionDistance);
          const centerIndex = (groupSize - 1) / 2;
          preferredOffset = (groupIndex - centerIndex) * preferredGap;
          if(!Number.isFinite(preferredOffset)){
            preferredOffset = 0;
          }
          if(preferredOffset > maxHalfWidthValue){
            preferredOffset = maxHalfWidthValue;
          }else if(preferredOffset < -maxHalfWidthValue){
            preferredOffset = -maxHalfWidthValue;
          }
          addCandidate(preferredOffset);
        }
        for(let i = 0; i < candidateCount; i++){
          const u = nextRand();
          let target = u * totalFree;
          for(let k = 0; k < freeIntervals.length; k++){
            const interval = freeIntervals[k];
            const length = interval.end - interval.start;
            if(target <= length || k === freeIntervals.length - 1){
              const cand = interval.start + Math.min(length, Math.max(0, target));
              addCandidate(cand);
              break;
            }
            target -= length;
          }
        }
        if(allowOverlap){
          addCandidate(-maxHalfWidthValue);
          addCandidate(maxHalfWidthValue);
        }
        for(let k = 0; k < freeIntervals.length; k++){
          const interval = freeIntervals[k];
          if(!evenGroup && interval.start <= 0 && interval.end >= 0){
            addCandidate(0);
            break;
          }
        }
        if(!candidates.length){
          return null;
        }
        if(evenGroup){
          const zeroEps = 0.0001;
          let write = 0;
          for(let i = 0; i < candidates.length; i++){
            const cand = candidates[i];
            if(Math.abs(cand) > zeroEps){
              candidates[write] = cand;
              write += 1;
            }
          }
          if(write){
            candidates.length = write;
          }
        }
        let bestScore = -Infinity;
        let bestAbs = Infinity;
        let bestPreferredDist = Infinity;
        let chosenLocal = null;
        for(let i = 0; i < candidates.length; i++){
          const cand = candidates[i];
          let minDistSq = Infinity;
          for(let j = activeStart; j < placedCount; j++){
            const dx = cand - placedOffset[j];
            const dy = coord - placedCoord[j];
            const distSq = dx * dx + dy * dy;
            if(distSq < minDistSq){
              minDistSq = distSq;
              if(bestScore > -Infinity && minDistSq <= bestScore - 0.0001){
                break;
              }
              if(distSq <= 0){
                break;
              }
            }
          }
          const abs = Math.abs(cand);
          const preferredDist = Number.isFinite(preferredOffset) ? Math.abs(cand - preferredOffset) : Infinity;
          const scoreDelta = minDistSq - bestScore;
          if(scoreDelta > 0.0001){
            bestScore = minDistSq;
            bestAbs = abs;
            bestPreferredDist = preferredDist;
            chosenLocal = cand;
            continue;
          }
          if(Math.abs(scoreDelta) <= 0.0001){
            if(preferSymmetric && preferredDist + 0.0001 < bestPreferredDist){
              bestScore = minDistSq;
              bestAbs = abs;
              bestPreferredDist = preferredDist;
              chosenLocal = cand;
              continue;
            }
            if((!preferSymmetric || Math.abs(preferredDist - bestPreferredDist) <= 0.0001) && abs < bestAbs){
              bestScore = minDistSq;
              bestAbs = abs;
              bestPreferredDist = preferredDist;
              chosenLocal = cand;
              continue;
            }
          }
        }
        return chosenLocal;
      };
      let chosen = resolveOffset(maxHalfWidth);
      if(chosen == null && widthScaleMode !== 'density' && maxHalfWidth < globalMaxHalfWidth){
        chosen = resolveOffset(globalMaxHalfWidth);
        maxHalfWidth = globalMaxHalfWidth;
      }
      if(chosen == null){
        chosen = Math.max(-maxHalfWidth, Math.min(maxHalfWidth, 0));
      }
      offsetsByIndex[index] = chosen;
      placedCoord[placedCount] = coord;
      placedOffset[placedCount] = chosen;
      placedCount += 1;
      const abs = Math.abs(chosen);
      if(abs > maxUsed){
        maxUsed = abs;
      }
    }
    if(pairBuckets.length){
      for(let i = 0; i < pairBuckets.length; i++){
        centerBuckets.push(pairBuckets[i]);
      }
    }
    if(centerBuckets.length){
      for(let b = 0; b < centerBuckets.length; b++){
        const bucket = centerBuckets[b];
        if(!Array.isArray(bucket) || bucket.length <= 1){
          continue;
        }
        let sum = 0;
        let minShift = -Infinity;
        let maxShift = Infinity;
        for(let i = 0; i < bucket.length; i++){
          const index = bucket[i];
          const offset = offsetsByIndex[index] || 0;
          sum += offset;
          const limit = Number.isFinite(maxHalfWidthByIndex[index])
            ? maxHalfWidthByIndex[index]
            : globalMaxHalfWidth;
          if(Number.isFinite(limit) && limit > 0){
            minShift = Math.max(minShift, -limit - offset);
            maxShift = Math.min(maxShift, limit - offset);
          }
        }
        const meanOffset = sum / bucket.length;
        let shift = -meanOffset;
        if(Number.isFinite(minShift) && Number.isFinite(maxShift)){
          shift = Math.max(minShift, Math.min(maxShift, shift));
        }
        if(!Number.isFinite(shift) || Math.abs(shift) < 0.0001){
          continue;
        }
        for(let i = 0; i < bucket.length; i++){
          const index = bucket[i];
          offsetsByIndex[index] = (offsetsByIndex[index] || 0) + shift;
        }
      }
      maxUsed = 0;
      for(let i = 0; i < offsetsByIndex.length; i++){
        const value = offsetsByIndex[i];
        if(!Number.isFinite(value)){
          continue;
        }
        const abs = Math.abs(value || 0);
        if(abs > maxUsed){
          maxUsed = abs;
        }
      }
    }
    const offsets = new Array(entryCount);
    if(isCompact){
      for(let i = 0; i < entryCount; i++){
        offsets[i] = offsetsByIndex[i] || 0;
      }
    }else{
      for(let i = 0; i < entries.length; i++){
        const entry = entries[i];
        offsets[i] = offsetsByIndex[entry.index] || 0;
      }
    }
    if(debugEnabled){
      console.debug('Debug: computeSwarmOffsets density', { orientation, sampleSize, spreadFactor, axisSpacing, axisBoundary, globalMaxHalfWidth, maxOffsetUsed: maxUsed, pointCount: entryCount, maxBinSize: maxCount, adjustedRadius: pointRadiusValue, densityDistance, basePointRadius });
    }
    return { offsets, maxOffsetUsed: maxUsed, spreadFactor, maxOffset: globalMaxHalfWidth, adjustedRadius: pointRadiusValue };
  }
  function collectGroupedMomentInfo(data){
    const I = data.groupsCount;
    const J = data.conditionsCount;
    const K = data.rowsWithData;
    if(I === 0 || J === 0 || K === 0){
      return { ok: false, message: 'Insufficient data for grouped statistics.', detail: { groups: I, conditions: J, rows: K } };
    }
    const cellMeans = Array.from({ length: I }, () => Array(J).fill(0));
    const totalsByGroup = new Array(I).fill(0);
    const totalsByCondition = new Array(J).fill(0);
    let grandTotal = 0;
    let sse = 0;
    let balanced = true;
    let mismatch = null;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        const arr = data.cellData[i][j];
        if(arr.length !== K){
          balanced = false;
          mismatch = { groupIndex: i, conditionIndex: j, count: arr.length, expected: K };
        }
        const sum = arr.reduce((acc, val) => acc + val, 0);
        const meanVal = arr.length ? sum / arr.length : 0;
        cellMeans[i][j] = meanVal;
        totalsByGroup[i] += sum;
        totalsByCondition[j] += sum;
        grandTotal += sum;
        sse += arr.reduce((acc, val) => acc + Math.pow(val - meanVal, 2), 0);
      }
    }
    if(!balanced){
      return { ok: false, message: 'Each group/condition combination must contain the same number of complete rows.', detail: mismatch };
    }
    const N = I * J * K;
    const grandMean = grandTotal / N;
    const meanByGroup = totalsByGroup.map(sum => sum / (J * K));
    const meanByCondition = totalsByCondition.map(sum => sum / (I * K));
    let ssa = 0;
    for(let i = 0; i < I; i++){
      ssa += Math.pow(meanByGroup[i] - grandMean, 2);
    }
    ssa *= J * K;
    let ssb = 0;
    for(let j = 0; j < J; j++){
      ssb += Math.pow(meanByCondition[j] - grandMean, 2);
    }
    ssb *= I * K;
    let ssab = 0;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        ssab += Math.pow(cellMeans[i][j] - meanByGroup[i] - meanByCondition[j] + grandMean, 2);
      }
    }
    ssab *= K;
    const subjectMeans = new Array(K).fill(0);
    const asMeans = Array.from({ length: I }, () => Array(K).fill(0));
    const bsMeans = Array.from({ length: J }, () => Array(K).fill(0));
    let sstotal = 0;
    for(let k = 0; k < K; k++){
      let subjectSum = 0;
      for(let i = 0; i < I; i++){
        let rowSumForGroup = 0;
        for(let j = 0; j < J; j++){
          const value = data.rows[k][i][j];
          subjectSum += value;
          rowSumForGroup += value;
          sstotal += Math.pow(value - grandMean, 2);
        }
        asMeans[i][k] = rowSumForGroup / J;
      }
      subjectMeans[k] = subjectSum / (I * J);
    }
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        let rowSumForCondition = 0;
        for(let i = 0; i < I; i++){
          rowSumForCondition += data.rows[k][i][j];
        }
        bsMeans[j][k] = rowSumForCondition / I;
      }
    }
    return {
      ok: true,
      I,
      J,
      K,
      cellMeans,
      meanByGroup,
      meanByCondition,
      subjectMeans,
      asMeans,
      bsMeans,
      grandMean,
      ssa,
      ssb,
      ssab,
      sse,
      sstotal
    };
  }

  function analyzeTwoWayAnova(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, sse } = base;
    if(I < 2 || J < 2){
      return { ok: false, message: 'Two-way ANOVA requires at least two groups and two conditions.' };
    }
    if(K < 2){
      return { ok: false, message: 'Two-way ANOVA requires at least two complete rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfAB = (I - 1) * (J - 1);
    const dfError = I * J * (K - 1);
    if(dfError <= 0){
      return { ok: false, message: 'Two-way ANOVA requires at least two replicates per group/condition combination.' };
    }
    const msa = ssa / dfA;
    const msb = ssb / dfB;
    const msab = ssab / dfAB;
    const mse = sse / dfError;
    const fA = mse > 0 ? msa / mse : NaN;
    const fB = mse > 0 ? msb / mse : NaN;
    const fAB = mse > 0 ? msab / mse : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfError) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfError) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfError) : NaN;
    return {
      ok: true,
      caption: 'Two-way ANOVA',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Group x Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Error', df: String(dfError), ss: formatStatNumber(sse), ms: formatStatNumber(mse), f: '-', p: '-' }
      ],
      options: { fileName: 'box-two-way-anova', contextLabel: 'box-grouped-anova2' },
      footnotes: ['F-tests use the pooled within-cell error term.'],
      diagnostics: { dfA, dfB, dfAB, dfError }
    };
  }

  function analyzeTwoWayMixed(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Two-way mixed model requires at least two groups, two conditions, and two complete rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfS = K - 1;
    const dfAS = (I - 1) * (K - 1);
    const dfBS = (J - 1) * (K - 1);
    const dfAB = (I - 1) * (J - 1);
    const dfABS = (I - 1) * (J - 1) * (K - 1);
    if(dfAS <= 0 || dfBS <= 0 || dfABS <= 0){
      return { ok: false, message: 'Two-way mixed model requires at least two rows to estimate error terms.' };
    }
    let sss = 0;
    for(let k = 0; k < K; k++){
      sss += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    sss *= I * J;
    let ssas = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const value = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssas += Math.pow(value, 2);
      }
    }
    ssas *= J;
    let ssbs = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const value = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbs += Math.pow(value, 2);
      }
    }
    ssbs *= I;
    let ssabs = 0;
    for(let k = 0; k < K; k++){
      for(let i = 0; i < I; i++){
        for(let j = 0; j < J; j++){
          const term = data.rows[k][i][j]
            - base.cellMeans[i][j]
            - asMeans[i][k]
            - bsMeans[j][k]
            + meanByGroup[i]
            + meanByCondition[j]
            + subjectMeans[k]
            - grandMean;
          ssabs += Math.pow(term, 2);
        }
      }
    }
    const msa = ssa / dfA;
    const msas = ssas / dfAS;
    const msb = ssb / dfB;
    const msbs = ssbs / dfBS;
    const msab = ssab / dfAB;
    const msabs = ssabs / dfABS;
    const fA = msas > 0 ? msa / msas : NaN;
    const fB = msbs > 0 ? msb / msbs : NaN;
    const fAB = msabs > 0 ? msab / msabs : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfAS) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfBS) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABS) : NaN;
    return {
      ok: true,
      caption: 'Two-way Mixed Model',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Group x Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Row (random)', df: String(dfS), ss: formatStatNumber(sss), ms: formatStatNumber(dfS ? sss / dfS : NaN), f: '-', p: '-' },
        { source: 'Group x Row', df: String(dfAS), ss: formatStatNumber(ssas), ms: formatStatNumber(msas), f: '-', p: '-' },
        { source: 'Condition x Row', df: String(dfBS), ss: formatStatNumber(ssbs), ms: formatStatNumber(msbs), f: '-', p: '-' },
        { source: 'Group x Condition x Row', df: String(dfABS), ss: formatStatNumber(ssabs), ms: formatStatNumber(msabs), f: '-', p: '-' }
      ],
      options: { fileName: 'box-two-way-mixed', contextLabel: 'box-grouped-mixed2' },
      footnotes: ['Mixed model treats rows as a random effect; F-tests for fixed effects use row interactions as denominators.']
    };
  }

  function analyzeThreeWayAnova(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean, cellMeans, ssa, ssb, ssab, sstotal } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Three-way ANOVA requires at least two groups, two conditions, and two rows.' };
    }
    let ssc = 0;
    for(let k = 0; k < K; k++){
      ssc += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    ssc *= I * J;
    let ssac = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const term = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssac += Math.pow(term, 2);
      }
    }
    ssac *= J;
    let ssbc = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const term = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbc += Math.pow(term, 2);
      }
    }
    ssbc *= I;
    let ssabc = 0;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        for(let k = 0; k < K; k++){
          const value = data.rows[k][i][j];
          const abMean = cellMeans[i][j];
          const acMean = asMeans[i][k];
          const bcMean = bsMeans[j][k];
          const term = value - abMean - acMean - bcMean + meanByGroup[i] + meanByCondition[j] + subjectMeans[k] - grandMean;
          ssabc += Math.pow(term, 2);
        }
      }
    }
    const residual = sstotal - (ssa + ssb + ssc + ssab + ssac + ssbc + ssabc);
    const dfA = I - 1;
    const dfB = J - 1;
    const dfC = K - 1;
    const dfAB = (I - 1) * (J - 1);
    const dfAC = (I - 1) * (K - 1);
    const dfBC = (J - 1) * (K - 1);
    const dfABC = (I - 1) * (J - 1) * (K - 1);
    if(dfABC <= 0){
      return { ok: false, message: 'Three-way ANOVA requires at least two rows to estimate interaction variance.' };
    }
    const msabc = ssabc / dfABC;
    const msa = ssa / dfA;
    const msb = ssb / dfB;
    const msc = ssc / dfC;
    const msab = ssab / dfAB;
    const msac = ssac / dfAC;
    const msbc = ssbc / dfBC;
    const fA = msabc > 0 ? msa / msabc : NaN;
    const fB = msabc > 0 ? msb / msabc : NaN;
    const fC = msabc > 0 ? msc / msabc : NaN;
    const fAB = msabc > 0 ? msab / msabc : NaN;
    const fAC = msabc > 0 ? msac / msabc : NaN;
    const fBC = msabc > 0 ? msbc / msabc : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfABC) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfABC) : NaN;
    const pC = Number.isFinite(fC) ? 1 - jStatLib.centralF.cdf(fC, dfC, dfABC) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABC) : NaN;
    const pAC = Number.isFinite(fAC) ? 1 - jStatLib.centralF.cdf(fAC, dfAC, dfABC) : NaN;
    const pBC = Number.isFinite(fBC) ? 1 - jStatLib.centralF.cdf(fBC, dfBC, dfABC) : NaN;
    return {
      ok: true,
      caption: 'Three-way ANOVA',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Row', df: String(dfC), ss: formatStatNumber(ssc), ms: formatStatNumber(msc), f: formatStatNumber(fC), p: formatP(pC) },
        { source: 'Group x Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Group x Row', df: String(dfAC), ss: formatStatNumber(ssac), ms: formatStatNumber(msac), f: formatStatNumber(fAC), p: formatP(pAC) },
        { source: 'Condition x Row', df: String(dfBC), ss: formatStatNumber(ssbc), ms: formatStatNumber(msbc), f: formatStatNumber(fBC), p: formatP(pBC) },
        { source: 'Group x Condition x Row', df: String(dfABC), ss: formatStatNumber(ssabc), ms: formatStatNumber(msabc), f: '-', p: '-' },
        { source: 'Residual', df: '-', ss: formatStatNumber(residual), ms: '-', f: '-', p: '-' }
      ],
      options: { fileName: 'box-three-way-anova', contextLabel: 'box-grouped-anova3' },
      footnotes: ['Highest-order interaction is used as the error term for F-tests.'],
      diagnostics: { dfA, dfB, dfC, dfAB, dfAC, dfBC, dfABC }
    };
  }

  function analyzeThreeWayMixed(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Three-way mixed model requires at least two groups, two conditions, and two rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfC = K - 1;
    const dfAS = (I - 1) * (K - 1);
    const dfBS = (J - 1) * (K - 1);
    const dfAB = (I - 1) * (J - 1);
    const dfABS = (I - 1) * (J - 1) * (K - 1);
    if(dfAS <= 0 || dfBS <= 0 || dfABS <= 0){
      return { ok: false, message: 'Three-way mixed model requires at least two rows to estimate random effects.' };
    }
    let sss = 0;
    for(let k = 0; k < K; k++){
      sss += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    sss *= I * J;
    let ssas = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const term = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssas += Math.pow(term, 2);
      }
    }
    ssas *= J;
    let ssbs = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const term = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbs += Math.pow(term, 2);
      }
    }
    ssbs *= I;
    let ssabs = 0;
    for(let k = 0; k < K; k++){
      for(let i = 0; i < I; i++){
        for(let j = 0; j < J; j++){
          const term = data.rows[k][i][j]
            - base.cellMeans[i][j]
            - asMeans[i][k]
            - bsMeans[j][k]
            + meanByGroup[i]
            + meanByCondition[j]
            + subjectMeans[k]
            - grandMean;
          ssabs += Math.pow(term, 2);
        }
      }
    }
    const msa = ssa / dfA;
    const msas = ssas / dfAS;
    const msb = ssb / dfB;
    const msbs = ssbs / dfBS;
    const msab = ssab / dfAB;
    const msabs = ssabs / dfABS;
    const fA = msas > 0 ? msa / msas : NaN;
    const fB = msbs > 0 ? msb / msbs : NaN;
    const fAB = msabs > 0 ? msab / msabs : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfAS) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfBS) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABS) : NaN;
    return {
      ok: true,
      caption: 'Three-way Mixed Model',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Row (random)', df: String(dfC), ss: formatStatNumber(sss), ms: formatStatNumber(dfC ? sss / dfC : NaN), f: '-', p: '-' },
        { source: 'Group x Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Group x Row', df: String(dfAS), ss: formatStatNumber(ssas), ms: formatStatNumber(msas), f: '-', p: '-' },
        { source: 'Condition x Row', df: String(dfBS), ss: formatStatNumber(ssbs), ms: formatStatNumber(msbs), f: '-', p: '-' },
        { source: 'Group x Condition x Row', df: String(dfABS), ss: formatStatNumber(ssabs), ms: formatStatNumber(msabs), f: '-', p: '-' }
      ],
      options: { fileName: 'box-three-way-mixed', contextLabel: 'box-grouped-mixed3' },
      footnotes: ['Rows treated as a random effect; F-tests reported for fixed factors only.']
    };
  }

  function analyzeRowWiseTTests(data, correctionMethod){
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    if(data.groupsCount < 2){
      return { ok: false, message: 'Row-wise t-tests require at least two groups.' };
    }
    const conditionLabels = data.conditionLabels;
    const tests = [];
    for(let condIdx = 0; condIdx < data.conditionsCount; condIdx++){
      for(let gA = 0; gA < data.groupsCount; gA++){
        for(let gB = gA + 1; gB < data.groupsCount; gB++){
          const sampleA = data.cellData[gA][condIdx];
          const sampleB = data.cellData[gB][condIdx];
          if(sampleA.length < 2 || sampleB.length < 2){
            continue;
          }
          const result = tTest(sampleA, sampleB);
          tests.push({
            condition: conditionLabels[condIdx] || `Condition ${condIdx + 1}`,
            groupA: data.groupLabels[gA],
            groupB: data.groupLabels[gB],
            t: result.t,
            df: result.df,
            p: result.p
          });
        }
      }
    }
    if(!tests.length){
      return { ok: false, message: 'Not enough replicates to compute row-wise t-tests.' };
    }
    const m = tests.length;
    const adjustedValues = applyPValueCorrection(tests.map(test => test.p), correctionMethod);
    adjustedValues.forEach((adj, idx) => {
      tests[idx].padjust = adj;
    });
    const correctionMeta = resolveCorrectionMeta(correctionMethod, m);
    return {
      ok: true,
      caption: 'Row-wise t-tests',
      columns: [
        { key: 'condition', label: 'Condition', align: 'left' },
        { key: 'comparison', label: 'Comparison', align: 'left' },
        { key: 't', label: 't', align: 'right' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' },
        { key: 'padjust', label: `P (adj, ${correctionMeta.shortLabel})`, align: 'right' }
      ],
      rows: tests.map(test => ({
        condition: test.condition,
        comparison: `${test.groupA} vs ${test.groupB}`,
        t: formatStatNumber(test.t),
        df: Number.isFinite(test.df) ? formatStatNumber(test.df, 2) : '-',
        p: formatP(test.p),
        padjust: formatP(test.padjust)
      })),
      options: { fileName: 'box-rowwise-ttest', contextLabel: 'box-grouped-ttests' },
      footnotes: correctionMeta.footnote ? [correctionMeta.footnote] : [],
      correctionCount: m
    };
  }
  function createRangeHelpers(indices, groups, annotationMaxByTrace){
    const maxByIndex = new Map();
    for(let i = 0; i < indices.length; i++){
      const idx = indices[i];
      const values = Array.isArray(groups[i]) ? groups[i] : [];
      let maxVal = -Infinity;
      for(let j = 0; j < values.length; j++){
        const v = values[j];
        if(Number.isFinite(v) && v > maxVal){
          maxVal = v;
        }
      }
      maxByIndex.set(idx, maxVal);
    }
    const resolveMax = idx => {
      if(Array.isArray(annotationMaxByTrace) && Number.isFinite(annotationMaxByTrace[idx])){
        return annotationMaxByTrace[idx];
      }
      if(maxByIndex.has(idx)){
        return maxByIndex.get(idx);
      }
      return -Infinity;
    };
    const resolveRangeMax = (idxA, idxB) => {
      const start = Math.min(idxA, idxB);
      const end = Math.max(idxA, idxB);
      let maxVal = -Infinity;
      for(let idx = start; idx <= end; idx++){
        const candidate = resolveMax(idx);
        if(Number.isFinite(candidate) && candidate > maxVal){
          maxVal = candidate;
        }
      }
      return maxVal;
    };
    let overall = -Infinity;
    for(let i = 0; i < indices.length; i++){
      const candidate = resolveMax(indices[i]);
      if(Number.isFinite(candidate) && candidate > overall){
        overall = candidate;
      }
    }
    return { resolveRangeMax, resolveMax, overallRangeMax: Number.isFinite(overall) ? overall : null };
  }

  function computeSingleStatsModel(payload){
    const selection = Array.isArray(payload.selection) ? payload.selection : [];
    const statsMode = payload.statsMode || 'all';
    const oneSampleMode = statsMode === 'oneSample';
    const indices = [];
    const labels = [];
    const groups = [];
    const groupByIndex = new Map();
    selection.forEach((item, idx) => {
      const index = Number.isFinite(item?.index) ? item.index : idx;
      const label = typeof item?.label === 'string' && item.label ? item.label : `Group ${idx + 1}`;
      const values = Array.isArray(item?.values) ? item.values : [];
      indices.push(index);
      labels.push(label);
      groups.push(values);
      groupByIndex.set(index, { values, label, position: idx });
    });

    const model = {
      mode: 'single',
      ok: true,
      message: null,
      tables: [],
      pairs: [],
      indices,
      groupCount: indices.length,
      assumptionDiagnostics: null,
      parametricVariant: payload.statsParametricVariant,
      postHoc: payload.statsPostHoc,
      correctionCount: 0,
      overall: null,
      overallRangeMax: null
    };

    const minSelectionRequired = oneSampleMode ? 1 : 2;
    if(indices.length < minSelectionRequired){
      model.message = oneSampleMode
        ? 'Select at least one column for one-sample analysis.'
        : 'Select at least two columns for statistical analysis.';
      return model;
    }

    const summaries = groups.map(values => computeTraceSummary(values, { requireSorted: false }));
    const assumptionDiagnostics = computeAssumptionDiagnostics(groups, labels, {
      qqSampleLimit: ASSUMPTION_QQ_SAMPLE_LIMIT,
      summaries
    });
    model.assumptionDiagnostics = assumptionDiagnostics;

    const statsTest = payload.statsTest === 'nonparametric' ? 'nonparametric' : 'parametric';
    const statsPaired = oneSampleMode ? false : !!payload.statsPaired;
    let variant = payload.statsParametricVariant;
    if(statsTest !== 'parametric'){
      variant = 'nonparametric';
    }else if(oneSampleMode || statsPaired){
      variant = 'classic';
    }else if(indices.length >= 3 && assumptionDiagnostics?.varianceConcern && (assumptionDiagnostics.normalityFailures || 0) === 0){
      variant = 'welch';
    }else{
      variant = 'classic';
    }
    model.parametricVariant = variant;
    if(assumptionDiagnostics){
      assumptionDiagnostics.parametricOverrideActive = assumptionDiagnostics.recommendNonParametric && statsTest === 'parametric';
      assumptionDiagnostics.appliedTest = statsTest;
      assumptionDiagnostics.appliedVariant = variant;
    }

    const param = statsTest === 'parametric';
    const paramVariant = param ? variant : 'nonparametric';
    const pairTest = param ? (statsPaired ? tTestPaired : tTest) : (statsPaired ? wilcoxonSignedRank : mannWhitney);
    const paramEffectMeta = resolveEffectOptionMeta('parametric', payload.statsEffectParametric);
    const nonParamEffectMeta = resolveEffectOptionMeta('nonparametric', payload.statsEffectNonParametric);
    const effectFootnotes = buildEffectFootnotes(paramEffectMeta, nonParamEffectMeta);

    if(statsPaired && groups.some(g => g.length !== groups[0].length)){
      model.message = 'Paired tests require equal group sizes.';
      return model;
    }

    const rangeHelpers = createRangeHelpers(indices, groups, payload.annotationMaxByTrace);
    model.overallRangeMax = rangeHelpers.overallRangeMax;

    if(oneSampleMode){
      const nullValue = sanitizeOneSampleNullValue(payload.statsOneSampleNull ?? payload.statsOneSampleValue);
      const tests = indices.map((traceIndex, groupIdx) => {
        const values = groups[groupIdx];
        const label = labels[groupIdx];
        if(param){
          const result = tTestOneSample(values, nullValue);
          return {
            index: traceIndex,
            label,
            valid: result.available !== false,
            message: result.message || '',
            n: result.n,
            mean: result.mean,
            sd: result.sd,
            delta: Number.isFinite(result.mean) ? result.mean - nullValue : NaN,
            stat: result.t,
            df: result.df,
            p: result.p
          };
        }
        const result = wilcoxonOneSample(values, nullValue);
        return {
          index: traceIndex,
          label,
          valid: result.available !== false,
          message: result.message || '',
          n: result.n,
          effectiveN: result.effectiveN,
          median: result.median,
          delta: Number.isFinite(result.median) ? result.median : NaN,
          stat: result.W,
          z: result.z,
          p: result.p
        };
      });
      const validTests = tests.filter(test => test.valid && Number.isFinite(test.p));
      if(!validTests.length){
        model.message = 'No one-sample tests could be computed. Check that each selected column has enough numeric values.';
        return model;
      }
      const adjusted = applyPValueCorrection(validTests.map(test => test.p), payload.statsCorrection);
      validTests.forEach((test, idx) => {
        test.adjP = Array.isArray(adjusted) && Number.isFinite(adjusted[idx]) ? adjusted[idx] : test.p;
      });
      const correctionMeta = resolveCorrectionMeta(payload.statsCorrection, validTests.length);
      const skippedNotes = tests
        .filter(test => !test.valid)
        .map(test => `${test.label}: ${test.message || 'skipped'}`);
      if(param){
        model.tables.push({
          caption: 'One-sample t-tests',
          columns: [
            { key: 'group', label: 'Group', align: 'left', index: 0 },
            { key: 'n', label: 'n', align: 'right', index: 1 },
            { key: 'mean', label: 'Mean', align: 'right', index: 2 },
            { key: 'delta', label: 'Mean - H0', align: 'right', index: 3 },
            { key: 'statistic', label: 't', align: 'right', index: 4 },
            { key: 'df', label: 'df', align: 'right', index: 5 },
            { key: 'p', label: 'P value', align: 'right', index: 6 },
            { key: 'padj', label: `P (adj, ${correctionMeta.shortLabel})`, align: 'right', index: 7 },
            { key: 'note', label: 'Note', align: 'left', index: 8 }
          ],
          rows: tests.map(test => ({
            group: test.label,
            n: Number.isFinite(test.n) ? String(test.n) : '-',
            mean: Number.isFinite(test.mean) ? formatStatNumber(test.mean) : '-',
            delta: Number.isFinite(test.delta) ? formatStatNumber(test.delta) : '-',
            statistic: Number.isFinite(test.stat) ? formatStatNumber(test.stat) : '-',
            df: Number.isFinite(test.df) ? formatStatNumber(test.df, 2) : '-',
            p: test.valid ? formatP(test.p) : '-',
            padj: test.valid ? formatP(test.adjP) : '-',
            note: test.valid ? '' : (test.message || 'Skipped')
          })),
          footnotes: [
            `Null hypothesis value (H0): ${formatStatNumber(nullValue)}.`,
            ...(correctionMeta.footnote ? [correctionMeta.footnote] : []),
            ...skippedNotes
          ],
          options: { fileName: 'box-one-sample-ttest', contextLabel: 'box-one-sample' }
        });
      }else{
        model.tables.push({
          caption: 'One-sample Wilcoxon signed-rank tests',
          columns: [
            { key: 'group', label: 'Group', align: 'left', index: 0 },
            { key: 'n', label: 'n', align: 'right', index: 1 },
            { key: 'nEff', label: 'n (non-zero)', align: 'right', index: 2 },
            { key: 'median', label: 'Median - H0', align: 'right', index: 3 },
            { key: 'statistic', label: 'W', align: 'right', index: 4 },
            { key: 'z', label: 'z', align: 'right', index: 5 },
            { key: 'p', label: 'P value', align: 'right', index: 6 },
            { key: 'padj', label: `P (adj, ${correctionMeta.shortLabel})`, align: 'right', index: 7 },
            { key: 'note', label: 'Note', align: 'left', index: 8 }
          ],
          rows: tests.map(test => ({
            group: test.label,
            n: Number.isFinite(test.n) ? String(test.n) : '-',
            nEff: Number.isFinite(test.effectiveN) ? String(test.effectiveN) : '-',
            median: Number.isFinite(test.delta) ? formatStatNumber(test.delta) : '-',
            statistic: Number.isFinite(test.stat) ? formatStatNumber(test.stat) : '-',
            z: Number.isFinite(test.z) ? formatStatNumber(test.z) : '-',
            p: test.valid ? formatP(test.p) : '-',
            padj: test.valid ? formatP(test.adjP) : '-',
            note: test.valid ? '' : (test.message || 'Skipped')
          })),
          footnotes: [
            `Null hypothesis value (H0): ${formatStatNumber(nullValue)}.`,
            ...(correctionMeta.footnote ? [correctionMeta.footnote] : []),
            ...skippedNotes
          ],
          options: { fileName: 'box-one-sample-wilcoxon', contextLabel: 'box-one-sample' }
        });
      }
      model.correctionCount = validTests.length;
      model.postHoc = 'standard';
      return model;
    }

    if(statsMode === 'custom'){
      const customPairs = Array.isArray(payload.statsCustomPairs) ? payload.statsCustomPairs : [];
      if(!customPairs.length){
        model.message = 'Specify pairs for comparison.';
        return model;
      }
      const pairs = [];
      customPairs.forEach(pr => {
        const ai = Number(pr?.ai);
        const bi = Number(pr?.bi);
        if(!Number.isFinite(ai) || !Number.isFinite(bi)){
          return;
        }
        const groupA = groupByIndex.get(ai);
        const groupB = groupByIndex.get(bi);
        if(!groupA || !groupB){
          return;
        }
        const aData = groupA.values;
        const bData = groupB.values;
        if(statsPaired && aData.length !== bData.length){
          return;
        }
        const r = pairTest(aData, bData);
        const statName = r.t !== undefined ? 't' : (r.U !== undefined ? 'U' : (r.W !== undefined ? 'W' : 'stat'));
        const statVal = r[statName];
        const effectMetrics = computeEffectSizeMetrics(aData, bData, { paired: statsPaired });
        const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
        const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
        const rangeMax = rangeHelpers.resolveRangeMax(ai, bi);
        pairs.push({
          ai,
          bi,
          p: r.p,
          rangeMax,
          labelA: groupA.label,
          labelB: groupB.label,
          stat: statVal,
          statName,
          df: r.df,
          effects: effectMetrics,
          effectParametric: formattedParamEffect,
          effectNonParametric: formattedNonParamEffect
        });
      });
      const m = pairs.length;
      if(m){
        const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
        adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
      }
      const correctionMeta = resolveCorrectionMeta(payload.statsCorrection, m);
      const tableRows = pairs.map(pr => ({
        comparison: `${pr.labelA} vs ${pr.labelB}`,
        statistic: `${pr.statName} = ${Number.isFinite(pr.stat) ? pr.stat.toFixed(4) : '-'}`,
        df: pr.df != null && Number.isFinite(pr.df) ? pr.df : '-',
        padj: formatP(pr.adjP),
        effectParametric: pr.effectParametric,
        effectNonParametric: pr.effectNonParametric
      }));
      model.tables.push({
        caption: 'Custom pairwise comparisons',
        columns: [
          { key: 'comparison', label: 'Comparison', align: 'left', index: 0 },
          { key: 'statistic', label: 'Statistic', align: 'left', index: 1 },
          { key: 'df', label: 'df', align: 'right', index: 2 },
          { key: 'padj', label: `P (adj, ${correctionMeta.shortLabel})`, align: 'right', index: 3 },
          { key: 'effectParametric', label: `Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`, align: 'right', index: 4, tooltip: paramEffectMeta.tooltip },
          { key: 'effectNonParametric', label: `Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`, align: 'right', index: 5, tooltip: nonParamEffectMeta.tooltip }
        ],
        rows: tableRows,
        footnotes: [
          ...(correctionMeta.footnote ? [correctionMeta.footnote] : []),
          ...effectFootnotes
        ],
        options: { fileName: 'box-custom-comparisons', contextLabel: 'box-custom' }
      });
      model.pairs = pairs;
      model.correctionCount = pairs.length;
      return model;
    }

    if(indices.length === 2){
      const res = pairTest(groups[0], groups[1]);
      const statName = res.t !== undefined ? 't' : (res.U !== undefined ? 'U' : (res.W !== undefined ? 'W' : 'stat'));
      const effectMetrics = computeEffectSizeMetrics(groups[0], groups[1], { paired: statsPaired });
      const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
      const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
      const summaryRows = [
        { metric: 'Comparison', value: `${labels[0]} vs ${labels[1]}` },
        { metric: 'Test', value: param ? (statsPaired ? 'Paired t-test' : 't-test') : (statsPaired ? 'Wilcoxon signed-rank' : 'Mann-Whitney U') },
        { metric: statName, value: Number.isFinite(res[statName]) ? res[statName].toFixed(4) : '-' }
      ];
      if(res.df !== undefined){
        summaryRows.push({ metric: 'df', value: Number.isFinite(res.df) ? res.df.toFixed(4) : '-' });
      }
      summaryRows.push({ metric: 'P value', value: formatP(res.p) });
      const correctionMeta = resolveCorrectionMeta(payload.statsCorrection, 1);
      const adjusted = applyPValueCorrection([res.p], payload.statsCorrection);
      const adjValue = Array.isArray(adjusted) && adjusted.length ? adjusted[0] : res.p;
      summaryRows.push({ metric: `P (${correctionMeta.shortLabel})`, value: formatP(adjValue) });
      summaryRows.push({ metric: `Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`, value: formattedParamEffect });
      summaryRows.push({ metric: `Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`, value: formattedNonParamEffect });
      const footnotes = [
        ...(correctionMeta.footnote ? [correctionMeta.footnote] : []),
        ...effectFootnotes
      ];
      model.tables.push({
        caption: 'Pairwise test summary',
        columns: [
          { key: 'metric', label: 'Metric', align: 'left', index: 0 },
          { key: 'value', label: 'Value', align: 'left', index: 1 }
        ],
        rows: summaryRows,
        footnotes,
        options: { fileName: 'box-pairwise-summary', contextLabel: 'box-pairwise' }
      });
      const ai = indices[0];
      const bi = indices[1];
      model.pairs = [{
        ai,
        bi,
        p: res.p,
        adjP: adjValue,
        rangeMax: rangeHelpers.resolveRangeMax(ai, bi),
        labelA: labels[0],
        labelB: labels[1],
        stat: res[statName],
        statName,
        df: res.df,
        effectParametric: formattedParamEffect,
        effectNonParametric: formattedNonParamEffect
      }];
      model.correctionCount = 1;
      return model;
    }

    let overall = null;
    const overallFootnotes = [];
    if(!statsPaired){
      if(param){
        if(paramVariant === 'welch'){
          const welch = computeWelchAnova(groups);
          if(welch.ok){
            overall = { method: 'welch', F: welch.F, p: welch.p, df1: welch.df1, df2: welch.df2, footnote: welch.footnote };
            if(welch.footnote){
              overallFootnotes.push(welch.footnote);
            }
          }
        }
        if(!overall){
          const classic = anova(groups);
          if(classic){
            overall = { method: 'anova', F: classic.F, p: classic.p, df1: classic.dfBetween, df2: classic.dfWithin };
          }
        }
      }else{
        const kw = kruskalWallis(groups);
        overall = { method: 'kruskal', H: kw.H, p: kw.p, df: groups.length - 1 };
      }
    }else if(param){
      const rm = computeRepeatedMeasuresAnova(groups);
      if(rm.ok){
        overall = { method: 'rmAnova', F: rm.F, p: rm.p, df1: rm.df1, df2: rm.df2, footnote: rm.footnote };
        if(rm.footnote){
          overallFootnotes.push(rm.footnote);
        }
      }
    }else{
      const friedman = computeFriedmanTest(groups);
      if(friedman.ok){
        overall = { method: 'friedman', Q: friedman.Q, p: friedman.p, df: friedman.df, footnote: friedman.footnote };
        if(friedman.footnote){
          overallFootnotes.push(friedman.footnote);
        }
      }
    }
    model.overall = overall;

    let pairs = [];
    let referenceLabel = null;
    const methodFootnotes = [];
    const postHocMode = ensureValidPostHoc(payload.statsPostHoc, {
      mode: statsMode,
      test: param ? 'parametric' : 'nonparametric',
      paired: statsPaired,
      groupCount: indices.length,
      variant: paramVariant,
      varianceConcern: assumptionDiagnostics?.varianceConcern === true
    });
    model.postHoc = postHocMode;

    if(statsMode === 'all'){
      if(postHocMode === 'tukey'){
        const tukey = computeTukeyComparisons(groups, labels);
        if(!tukey.ok){
          model.message = tukey.message || 'Unable to compute Tukey HSD.';
          return model;
        }
        if(tukey.footnote){
          methodFootnotes.push(tukey.footnote);
        }
        pairs = tukey.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.pAdj,
            adjP: pr.pAdj,
            stat: pr.q,
            statName: 'q',
            df: pr.df,
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            rangeMax: rangeHelpers.resolveRangeMax(ai, bi),
            method: 'tukey'
          };
        });
      }else if(postHocMode === 'gamesHowell'){
        const gh = computeGamesHowellComparisons(groups, labels);
        if(!gh.ok){
          model.message = gh.message || 'Unable to compute Games-Howell comparisons.';
          return model;
        }
        if(gh.footnote){
          methodFootnotes.push(gh.footnote);
        }
        pairs = gh.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            adjP: pr.pAdj,
            stat: pr.q,
            statName: 'q',
            df: pr.df,
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            rangeMax: rangeHelpers.resolveRangeMax(ai, bi),
            method: 'gamesHowell'
          };
        });
      }else if(postHocMode === 'dunn'){
        const dunn = computeDunnComparisons(groups, labels);
        if(!dunn.ok){
          model.message = dunn.message || "Unable to compute Dunn's test.";
          return model;
        }
        if(dunn.footnote){
          methodFootnotes.push(dunn.footnote);
        }
        pairs = dunn.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            stat: pr.z,
            statName: 'z',
            df: null,
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            rangeMax: rangeHelpers.resolveRangeMax(ai, bi),
            method: 'dunn'
          };
        });
        if(pairs.length && postHocMode !== 'gamesHowell'){
          const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
          adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
        }
      }else{
        for(let i = 0; i < indices.length; i++){
          for(let j = i + 1; j < indices.length; j++){
            const aIdx = indices[i];
            const bIdx = indices[j];
            const aValues = groups[i];
            const bValues = groups[j];
            const r = pairTest(aValues, bValues);
            const statName = r.t !== undefined ? 't' : (r.U !== undefined ? 'U' : (r.W !== undefined ? 'W' : 'stat'));
            const effectMetrics = computeEffectSizeMetrics(aValues, bValues, { paired: statsPaired });
            const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
            const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
            pairs.push({
              a: i,
              b: j,
              ai: aIdx,
              bi: bIdx,
              p: r.p,
              rangeMax: rangeHelpers.resolveRangeMax(aIdx, bIdx),
              stat: r[statName],
              statName,
              df: r.df,
              labelA: labels[i],
              labelB: labels[j],
              effects: effectMetrics,
              effectParametric: formattedParamEffect,
              effectNonParametric: formattedNonParamEffect,
              method: 'standard'
            });
          }
        }
        if(pairs.length && postHocMode !== 'gamesHowell'){
          const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
          adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
        }
      }
    }else if(statsMode === 'reference'){
      const refIndexValue = Number(payload.statsRef);
      const refIdx = indices.indexOf(refIndexValue);
      if(refIdx === -1){
        model.message = 'Select reference column among the chosen groups.';
        return model;
      }
      const refData = groups[refIdx];
      referenceLabel = labels[refIdx];
      if(postHocMode === 'tukey'){
        const tukey = computeTukeyComparisons(groups, labels);
        if(!tukey.ok){
          model.message = tukey.message || 'Unable to compute Tukey HSD.';
          return model;
        }
        if(tukey.footnote){
          methodFootnotes.push(tukey.footnote);
        }
        const filtered = tukey.pairs.filter(pr => pr.i === refIdx || pr.j === refIdx);
        pairs = filtered.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.pAdj,
            adjP: pr.pAdj,
            stat: pr.q,
            statName: 'q',
            df: pr.df,
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            rangeMax: rangeHelpers.resolveRangeMax(ai, bi),
            method: 'tukey'
          };
        });
      }else if(postHocMode === 'gamesHowell'){
        const gh = computeGamesHowellComparisons(groups, labels);
        if(!gh.ok){
          model.message = gh.message || 'Unable to compute Games-Howell comparisons.';
          return model;
        }
        if(gh.footnote){
          methodFootnotes.push(gh.footnote);
        }
        const filtered = gh.pairs.filter(pr => pr.i === refIdx || pr.j === refIdx);
        pairs = filtered.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            adjP: pr.pAdj,
            stat: pr.q,
            statName: 'q',
            df: pr.df,
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            rangeMax: rangeHelpers.resolveRangeMax(ai, bi),
            method: 'gamesHowell'
          };
        });
      }else if(postHocMode === 'dunn'){
        const dunn = computeDunnComparisons(groups, labels);
        if(!dunn.ok){
          model.message = dunn.message || "Unable to compute Dunn's test.";
          return model;
        }
        if(dunn.footnote){
          methodFootnotes.push(dunn.footnote);
        }
        const filtered = dunn.pairs.filter(pr => pr.i === refIdx || pr.j === refIdx);
        pairs = filtered.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            stat: pr.z,
            statName: 'z',
            df: null,
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            rangeMax: rangeHelpers.resolveRangeMax(ai, bi),
            method: 'dunn'
          };
        });
        if(pairs.length && postHocMode !== 'gamesHowell'){
          const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
          adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
        }
      }else{
        indices.forEach((idx, i) => {
          if(i === refIdx) return;
          const compareValues = groups[i];
          const r = pairTest(refData, compareValues);
          const statName = r.t !== undefined ? 't' : (r.U !== undefined ? 'U' : (r.W !== undefined ? 'W' : 'stat'));
          const effectMetrics = computeEffectSizeMetrics(refData, compareValues, { paired: statsPaired });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          pairs.push({
            a: refIdx,
            b: i,
            ai: refIndexValue,
            bi: idx,
            p: r.p,
            rangeMax: rangeHelpers.resolveRangeMax(refIndexValue, idx),
            labelA: labels[refIdx],
            labelB: labels[i],
            stat: r[statName],
            statName,
            df: r.df,
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: 'standard'
          });
        });
        if(pairs.length && postHocMode !== 'gamesHowell'){
          const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
          adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
        }
      }
    }

    model.pairs = pairs;
    model.correctionCount = pairs.length;

    if(pairs.length){
      let correctionMeta;
      if(postHocMode === 'tukey'){
        correctionMeta = { key: 'tukey', label: 'Tukey HSD', shortLabel: 'Tukey HSD', footnote: null };
      }else if(postHocMode === 'gamesHowell'){
        correctionMeta = { key: 'gamesHowell', label: 'Games-Howell', shortLabel: 'Games-Howell', footnote: null };
      }else{
        correctionMeta = resolveCorrectionMeta(payload.statsCorrection, pairs.length);
      }
      const footnotes = [];
      if(correctionMeta.footnote){
        footnotes.push(correctionMeta.footnote);
      }
      methodFootnotes.forEach(note => { if(note) footnotes.push(note); });

      if(overall){
        const overallLabel = overall.method === 'welch'
          ? 'Welch ANOVA'
          : overall.method === 'anova'
            ? 'ANOVA'
            : overall.method === 'rmAnova'
              ? 'Repeated-measures ANOVA'
              : overall.method === 'friedman'
                ? 'Friedman test'
                : 'Kruskal-Wallis';
        const overallStatName = overall.method === 'kruskal'
          ? 'H'
          : overall.method === 'friedman'
            ? 'Q'
            : 'F';
        const statValue = overall.method === 'kruskal'
          ? overall.H
          : overall.method === 'friedman'
            ? overall.Q
            : overall.F;
        const overallRows = [
          { metric: 'Overall test', value: overallLabel },
          { metric: overallStatName, value: Number.isFinite(statValue) ? statValue.toFixed(4) : '-' }
        ];
        if(overall.method === 'welch' || overall.method === 'anova' || overall.method === 'rmAnova'){
          const dfLabel = overall.method === 'welch'
            ? `df = ${overall.df1}, ${Number.isFinite(overall.df2) ? overall.df2.toFixed(2) : 'Infinity'}`
            : overall.method === 'rmAnova'
              ? `${overall.df1},${overall.df2}`
              : `${groups.length - 1},${groups.reduce((s, g) => s + g.length, 0) - groups.length}`;
          overallRows.push({ metric: 'df', value: dfLabel });
        }else if(overall?.df != null){
          overallRows.push({ metric: 'df', value: String(overall.df) });
        }
        overallRows.push({ metric: 'P value', value: formatP(overall.p) });
        model.tables.push({
          caption: 'Overall test summary',
          columns: [
            { key: 'metric', label: 'Metric', align: 'left', index: 0 },
            { key: 'value', label: 'Value', align: 'left', index: 1 }
          ],
          rows: overallRows,
          footnotes: overallFootnotes.slice(),
          options: { fileName: 'box-overall-test', contextLabel: 'box-overall' }
        });
      }

      const pairRows = pairs.map(pr => ({
        comparison: `${pr.labelA ?? labels[pr.a]} vs ${pr.labelB ?? labels[pr.b]}`,
        statistic: `${pr.statName} = ${Number.isFinite(pr.stat) ? pr.stat.toFixed(4) : '-'}`,
        df: Number.isFinite(pr.df) ? pr.df.toFixed(2) : (pr.df === Infinity ? 'Infinity' : '-'),
        padj: formatP(pr.adjP),
        effectParametric: pr.effectParametric,
        effectNonParametric: pr.effectNonParametric
      }));
      if(referenceLabel){
        footnotes.push(`Reference group: ${referenceLabel}`);
      }
      effectFootnotes.forEach(note => footnotes.push(note));
      const pLabel = postHocMode === 'tukey'
        ? 'P (Tukey HSD)'
        : postHocMode === 'gamesHowell'
          ? 'P (Games-Howell)'
          : `P (adj, ${correctionMeta.shortLabel})`;
      model.tables.push({
        caption: statsMode === 'reference' ? 'Comparisons vs reference' : 'Pairwise comparisons',
        columns: [
          { key: 'comparison', label: 'Comparison', align: 'left', index: 0 },
          { key: 'statistic', label: 'Statistic', align: 'left', index: 1 },
          { key: 'df', label: 'df', align: 'right', index: 2 },
          { key: 'padj', label: pLabel, align: 'right', index: 3 },
          { key: 'effectParametric', label: `Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`, align: 'right', index: 4, tooltip: paramEffectMeta.tooltip },
          { key: 'effectNonParametric', label: `Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`, align: 'right', index: 5, tooltip: nonParamEffectMeta.tooltip }
        ],
        rows: pairRows,
        footnotes,
        options: { fileName: 'box-pairwise-comparisons', contextLabel: 'box-pairs' }
      });
    }

    return model;
  }

  function computeGroupedStatsModel(payload){
    const grouped = payload.grouped || {};
    const data = grouped.data || {};
    const summary = {
      groupsCount: data.groupsCount || 0,
      conditionsCount: data.conditionsCount || 0,
      rowsWithData: data.rowsWithData || 0,
      partialRowsSkipped: data.partialRowsSkipped || 0
    };
    if(!data.ok){
      return {
        mode: 'grouped',
        ok: false,
        message: data.message || 'Unable to compute grouped statistics.',
        groupedSummary: summary,
        tables: [],
        correctionCount: 0
      };
    }
    const analysis = grouped.analysis || 'twoWayAnova';
    let resultModel = null;
    if(analysis === 'twoWayAnova') resultModel = analyzeTwoWayAnova(data);
    else if(analysis === 'twoWayMixed') resultModel = analyzeTwoWayMixed(data);
    else if(analysis === 'threeWayAnova') resultModel = analyzeThreeWayAnova(data);
    else if(analysis === 'threeWayMixed') resultModel = analyzeThreeWayMixed(data);
    else if(analysis === 'rowTTests') resultModel = analyzeRowWiseTTests(data, payload.statsCorrection);
    if(!resultModel || !resultModel.ok){
      return {
        mode: 'grouped',
        ok: false,
        message: resultModel?.message || 'Unable to compute grouped statistics for the selected analysis.',
        groupedSummary: summary,
        tables: [],
        correctionCount: 0
      };
    }
    return {
      mode: 'grouped',
      ok: true,
      message: null,
      groupedSummary: summary,
      tables: [resultModel],
      correctionCount: resultModel.correctionCount || 0
    };
  }

  function computeBoxStatsModel(payload){
    debugState.enabled = !!payload?.debug;
    ensureStats();
    ensureJStat();
    if(payload?.mode === 'grouped'){
      return computeGroupedStatsModel(payload);
    }
    return computeSingleStatsModel(payload || {});
  }

  function handleMessage(event){
    const data = event?.data || {};
    const id = data.id;
    const action = data.action;
    try{
      if(action === 'box-swarm'){
        debugState.enabled = !!data.payload?.options?.debug || !!data.payload?.debug;
        const result = computeSwarmOffsets(data.payload?.points || [], data.payload?.options || {});
        ctx.postMessage({ id, ok: true, result });
        return;
      }
      if(action === 'box-stats'){
        const result = computeBoxStatsModel(data.payload || {});
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
