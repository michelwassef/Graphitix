(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const stats = Shared.stats = Shared.stats || {};
  const DEFAULT_METHOD = 'bonferroni';
  const METHOD_CONFIG = {
    none: {
      label: 'None (unadjusted)',
      shortLabel: 'None',
      description: 'No multiple-testing correction applied.',
      footnote: count => `P-values are unadjusted${count > 0 ? ` (${count} comparison${count === 1 ? '' : 's'})` : ''}.`,
      aliases: ['unadjusted']
    },
    bonferroni: {
      label: 'Bonferroni',
      shortLabel: 'Bonferroni',
      description: 'Controls family-wise error rate via Bonferroni adjustment.',
      footnote: count => `Bonferroni-adjusted P values across ${count} test${count === 1 ? '' : 's'}.`,
      aliases: []
    },
    holm: {
      label: 'Holm',
      shortLabel: 'Holm',
      description: 'Holm step-down adjustment for family-wise error control.',
      footnote: count => `Holm correction applied across ${count} test${count === 1 ? '' : 's'}.`,
      aliases: ['holm-bonferroni', 'holm_bonferroni']
    },
    sidak: {
      label: 'Šidák',
      shortLabel: 'Šidák',
      description: 'Šidák correction assuming independent tests.',
      footnote: count => `Šidák correction applied across ${count} test${count === 1 ? '' : 's'}.`,
      aliases: ['sidak', 'sidak-bonferroni', 'sidak_bonferroni']
    },
    hochberg: {
      label: 'Hochberg',
      shortLabel: 'Hochberg',
      description: 'Hochberg step-up procedure for family-wise error control.',
      footnote: count => `Hochberg correction applied across ${count} test${count === 1 ? '' : 's'}.`,
      aliases: []
    },
    bh: {
      label: 'Benjamini–Hochberg (FDR)',
      shortLabel: 'BH',
      description: 'Benjamini–Hochberg false discovery rate control.',
      footnote: count => `Benjamini–Hochberg FDR correction across ${count} test${count === 1 ? '' : 's'}.`,
      aliases: ['fdr', 'benjamini-hochberg', 'benjaminihochberg', 'bh-fdr']
    },
    by: {
      label: 'Benjamini–Yekutieli (FDR)',
      shortLabel: 'BY',
      description: 'Benjamini–Yekutieli false discovery rate control for dependent tests.',
      footnote: count => `Benjamini–Yekutieli FDR correction across ${count} test${count === 1 ? '' : 's'}.`,
      aliases: ['benjamini-yekutieli', 'benjaminiyekutieli', 'by-fdr']
    }
  };

  const DEFAULT_PVALUE_SIG_DIGITS = 6;
  const DEFAULT_PVALUE_SCI_THRESHOLD = 1e-3;

  function statsDebugEnabled(){
    return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
  }

  function clampSignificantDigits(value){
    const coerced = Math.floor(Number(value));
    if(Number.isFinite(coerced) && coerced >= 1 && coerced <= 15){
      return coerced;
    }
    return DEFAULT_PVALUE_SIG_DIGITS;
  }

  function normalizeExponentText(value){
    if(typeof value !== 'string'){
      return value;
    }
    let result = value.replace('E', 'e');
    result = result.replace(/e\+/, 'e');
    result = result.replace(/e([+-])0+(\d+)/, (_, sign, digits) => `e${sign}${digits}`);
    return result;
  }

  function finalizeNumberString(value){
    if(typeof value !== 'string'){
      return value;
    }
    let result = value;
    if(!/[eE]/.test(result) && result.includes('.')){
      result = result.replace(/0+$/, '').replace(/\.$/, '');
      if(result === ''){
        result = '0';
      }
    }
    return normalizeExponentText(result);
  }

  function sharedFormatPValue(value, options){
    const num = Number(value);
    if(!Number.isFinite(num)){
      return String(value);
    }
    if(num === 0){
      return '0';
    }
    const digits = clampSignificantDigits(options?.significantDigits);
    const fractionalDigits = Math.max(0, digits - 1);
    const threshold = Number.isFinite(options?.scientificThreshold) && options.scientificThreshold > 0
      ? options.scientificThreshold
      : DEFAULT_PVALUE_SCI_THRESHOLD;
    const forceScientific = options?.forceScientific === true;
    const decimals = Number.isInteger(options?.decimals) && options.decimals >= 0 ? options.decimals : null;
    let formatted;
    if(forceScientific || Math.abs(num) < threshold){
      formatted = num.toExponential(fractionalDigits);
    }else if(decimals !== null){
      formatted = num.toFixed(decimals);
    }else{
      formatted = num.toPrecision(digits);
    }
    const result = finalizeNumberString(formatted);
    if(statsDebugEnabled()){
      console.debug('Debug: Shared.formatPValue',{ input: value, formatted: result, options });
    }
    return result;
  }

  Shared.formatPValue = sharedFormatPValue;

  function sanitizeP(value){
    const num = Number(value);
    if(!Number.isFinite(num) || num < 0){
      return 0;
    }
    if(num > 1){
      return 1;
    }
    return num;
  }

  function clampUnit(value){
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

  function normalizeMethod(method){
    const raw = typeof method === 'string' ? method.toLowerCase() : '';
    if(raw && METHOD_CONFIG[raw]){
      console.debug('Debug: stats.normalizeMethod direct match',{ method: raw });
      return raw;
    }
    if(raw){
      for(const [key, cfg] of Object.entries(METHOD_CONFIG)){
        if(Array.isArray(cfg.aliases) && cfg.aliases.includes(raw)){
          console.debug('Debug: stats.normalizeMethod alias match',{ alias: raw, resolved: key });
          return key;
        }
      }
    }
    console.debug('Debug: stats.normalizeMethod fallback',{ requested: method, fallback: DEFAULT_METHOD });
    return DEFAULT_METHOD;
  }

  function adjustBonferroni(values){
    const m = values.length || 1;
    return values.map(v => clampUnit(sanitizeP(v) * m));
  }

  function adjustSidak(values){
    const m = values.length || 1;
    return values.map(v => {
      const p = sanitizeP(v);
      const adjusted = 1 - Math.pow(1 - p, m);
      return clampUnit(adjusted);
    });
  }

  function adjustHolm(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: sanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 0;
    ordered.forEach((entry, idx) => {
      const rank = m - idx;
      const raw = clampUnit(entry.p * rank);
      running = Math.max(running, raw);
      adjusted[entry.index] = clampUnit(running);
    });
    return adjusted;
  }

  function adjustHochberg(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: sanitizeP(v), index }));
    ordered.sort((a, b) => b.p - a.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    ordered.forEach((entry, idx) => {
      const rank = idx + 1;
      const raw = clampUnit(entry.p * rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = clampUnit(running);
    });
    return adjusted;
  }

  function adjustBenjaminiHochberg(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: sanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    for(let i = m - 1; i >= 0; i--){
      const entry = ordered[i];
      const rank = i + 1;
      const raw = clampUnit((entry.p * m) / rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = clampUnit(running);
    }
    return adjusted;
  }

  function adjustBenjaminiYekutieli(values){
    const m = values.length;
    const harmonic = Array.from({ length: Math.max(m, 1) }, (_, idx) => 1 / (idx + 1)).reduce((sum, val) => sum + val, 0);
    const ordered = values.map((v, index) => ({ p: sanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    for(let i = m - 1; i >= 0; i--){
      const entry = ordered[i];
      const rank = i + 1;
      const raw = clampUnit((entry.p * m * harmonic) / rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = clampUnit(running);
    }
    return adjusted;
  }

  function adjustNone(values){
    return values.map(v => clampUnit(sanitizeP(v)));
  }

  const METHOD_ADJUSTERS = {
    none: adjustNone,
    bonferroni: adjustBonferroni,
    holm: adjustHolm,
    sidak: adjustSidak,
    hochberg: adjustHochberg,
    bh: adjustBenjaminiHochberg,
    by: adjustBenjaminiYekutieli
  };

  stats.adjustPValues = function(pValues, options){
    const values = Array.isArray(pValues) ? pValues.slice() : [];
    const methodKey = normalizeMethod(options?.method);
    const adjuster = METHOD_ADJUSTERS[methodKey] || METHOD_ADJUSTERS[DEFAULT_METHOD];
    console.debug('Debug: stats.adjustPValues start',{ method: methodKey, count: values.length });
    const adjusted = adjuster(values);
    console.debug('Debug: stats.adjustPValues complete',{ method: methodKey, adjusted });
    return adjusted;
  };

  const CONTINUOUS_DISTRIBUTION_COLORS = {
    normal: '#d95f02',
    lognormal: '#1b9e77',
    exponential: '#7570b3'
  };

  const SQRT_TWO = Math.sqrt(2);
  const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

  function erf(x){
    const sign = x >= 0 ? 1 : -1;
    const absX = Math.abs(x);
    if(!Number.isFinite(absX)){ return sign; }
    const p = 0.3275911;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const t = 1 / (1 + p * absX);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
  }

  function normalCdf(z){
    if(!Number.isFinite(z)){ return z < 0 ? 0 : 1; }
    return 0.5 * (1 + erf(z / SQRT_TWO));
  }

  function normalPdf(x, mean, sigma){
    if(!Number.isFinite(x) || !Number.isFinite(mean) || !Number.isFinite(sigma) || sigma <= 0){ return 0; }
    const z = (x - mean) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * SQRT_TWO_PI);
  }

  function logNormalPdf(x, mu, sigma){
    if(!Number.isFinite(x) || x <= 0 || !Number.isFinite(mu) || !Number.isFinite(sigma) || sigma <= 0){ return 0; }
    const z = (Math.log(x) - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (x * sigma * SQRT_TWO_PI);
  }

  function logNormalCdf(x, mu, sigma){
    if(!Number.isFinite(x) || x <= 0 || !Number.isFinite(mu) || !Number.isFinite(sigma) || sigma <= 0){ return 0; }
    return normalCdf((Math.log(x) - mu) / sigma);
  }

  function exponentialPdf(x, lambda){
    if(!Number.isFinite(x) || !Number.isFinite(lambda) || lambda <= 0){ return 0; }
    if(x < 0){ return 0; }
    return lambda * Math.exp(-lambda * x);
  }

  function exponentialCdf(x, lambda){
    if(!Number.isFinite(x) || !Number.isFinite(lambda) || lambda <= 0){ return 0; }
    if(x < 0){ return 0; }
    return 1 - Math.exp(-lambda * x);
  }

  function kolmogorovPValue(d, n){
    if(!Number.isFinite(d) || d <= 0 || !Number.isFinite(n) || n <= 0){
      return 1;
    }
    const sqrtN = Math.sqrt(n);
    const lambda = (sqrtN + 0.12 + 0.11 / sqrtN) * d;
    let sum = 0;
    for(let k = 1; k <= 100; k++){
      const term = Math.exp(-2 * k * k * lambda * lambda);
      const contribution = (k % 2 ? 1 : -1) * term;
      sum += contribution;
      if(term < 1e-10){
        break;
      }
    }
    const p = Math.max(0, Math.min(1, 2 * sum));
    return p;
  }

  function andersonDarlingStatistic(sortedValues, cdf){
    const n = Array.isArray(sortedValues) ? sortedValues.length : 0;
    if(!n || typeof cdf !== 'function'){
      return 0;
    }
    const epsilon = 1e-12;
    let sum = 0;
    for(let i = 0; i < n; i++){
      const xLower = sortedValues[i];
      const xUpper = sortedValues[n - 1 - i];
      const Fi = clampUnit(cdf(xLower));
      const FiClamped = Math.min(Math.max(Fi, epsilon), 1 - epsilon);
      const FjRaw = clampUnit(cdf(xUpper));
      const Fj = Math.min(Math.max(1 - FjRaw, epsilon), 1 - epsilon);
      sum += (2 * (i + 1) - 1) * (Math.log(FiClamped) + Math.log(Fj));
    }
    return -n - (sum / n);
  }

  const AD_CRITICALS = {
    normal: {
      values: [0.576, 0.656, 0.787, 0.918, 1.092],
      sigLevels: [0.15, 0.1, 0.05, 0.025, 0.01]
    },
    exponential: {
      values: [0.922, 1.078, 1.341, 1.606, 1.957],
      sigLevels: [0.15, 0.1, 0.05, 0.025, 0.01]
    }
  };

  function adPValueNormal(adjusted){
    const a = Math.max(0, adjusted);
    if(a < 0.2){
      return 1 - Math.exp(-13.436 + 101.14 * a - 223.73 * a * a);
    }
    if(a < 0.34){
      return 1 - Math.exp(-8.318 + 42.796 * a - 59.938 * a * a);
    }
    if(a < 0.6){
      return Math.exp(0.9177 - 4.279 * a - 1.38 * a * a);
    }
    const expo = 1.2937 - 5.709 * a + 0.0186 * a * a;
    return Math.exp(Math.min(expo, 0));
  }

  function adPValueExponential(adjusted){
    const a = Math.max(0, adjusted);
    if(a < 0.3){
      return 1 - Math.exp(-1.2937 + 5.709 * a - 0.0186 * a * a);
    }
    if(a < 0.6){
      return Math.exp(0.9177 - 4.279 * a - 1.38 * a * a);
    }
    const expo = 1.2937 - 5.709 * a + 0.0186 * a * a;
    return Math.exp(Math.min(expo, 0));
  }

  function interpolateAdPValue(value, config){
    const thresholds = config.values;
    const sig = config.sigLevels;
    if(!thresholds.length){ return 1; }
    if(value <= thresholds[0]){
      const ratio = thresholds[0] ? value / thresholds[0] : 0;
      const upper = 0.25;
      const p = sig[0] + (upper - sig[0]) * (1 - ratio);
      return clampUnit(p);
    }
    for(let i = 0; i < thresholds.length - 1; i++){
      const start = thresholds[i];
      const end = thresholds[i + 1];
      if(value <= end){
        const span = end - start || 1;
        const t = (value - start) / span;
        const p0 = sig[i];
        const p1 = sig[i + 1];
        return clampUnit(p0 + (p1 - p0) * t);
      }
    }
    const lastThreshold = thresholds[thresholds.length - 1];
    const lastSig = sig[sig.length - 1];
    const tail = lastSig * Math.exp(-(value - lastThreshold));
    return clampUnit(tail);
  }

  function andersonDarlingPValue(statistic, key, n){
    if(!Number.isFinite(statistic) || statistic < 0 || !Number.isFinite(n) || n <= 0){
      return 1;
    }
    const id = typeof key === 'string' ? key.toLowerCase() : '';
    let adjusted = statistic;
    if(id === 'exponential'){
      adjusted = statistic * (1 + 0.6 / n);
      const approx = adPValueExponential(adjusted);
      const fallback = interpolateAdPValue(adjusted, AD_CRITICALS.exponential);
      return clampUnit(Number.isFinite(approx) ? approx : fallback);
    }
    adjusted = statistic * (1 + 4 / n - 25 / (n * n));
    const approx = adPValueNormal(adjusted);
    const fallback = interpolateAdPValue(adjusted, AD_CRITICALS.normal);
    return clampUnit(Number.isFinite(approx) ? approx : fallback);
  }

  const CONTINUOUS_DISTRIBUTIONS = {
    normal: {
      key: 'normal',
      label: 'Normal',
      color: CONTINUOUS_DISTRIBUTION_COLORS.normal,
      fit(values){
        let count = 0;
        let sum = 0;
        let sumSq = 0;
        for(let i = 0; i < values.length; i++){
          const v = values[i];
          if(!Number.isFinite(v)){ continue; }
          count += 1;
          sum += v;
          sumSq += v * v;
        }
        if(count < 2){
          return { key: 'normal', label: 'Normal', valid: false, message: 'Need at least two numeric values.' };
        }
        const mean = sum / count;
        const variance = Math.max(0, sumSq / count - mean * mean);
        const sigma = Math.sqrt(variance);
        const result = {
          key: 'normal',
          label: 'Normal',
          color: CONTINUOUS_DISTRIBUTION_COLORS.normal,
          valid: sigma > 0,
          params: { mu: mean, sigma, variance },
          paramOrder: ['mu', 'sigma', 'variance'],
          warnings: [],
          logLikelihood: Number.isFinite(variance) && variance > 0 ? (-0.5 * count * (Math.log(2 * Math.PI * variance) + 1)) : NaN
        };
        if(!result.valid){
          result.message = 'Variance is zero; unable to fit a normal distribution.';
          result.warnings.push(result.message);
        }
        result.pdf = x => sigma > 0 ? normalPdf(x, mean, sigma) : 0;
        result.cdf = x => sigma > 0 ? normalCdf((x - mean) / sigma) : (x < mean ? 0 : 1);
        return result;
      }
    },
    lognormal: {
      key: 'lognormal',
      label: 'Log-normal',
      color: CONTINUOUS_DISTRIBUTION_COLORS.lognormal,
      fit(values){
        let count = 0;
        let logSum = 0;
        let logSumSq = 0;
        let invalid = 0;
        for(let i = 0; i < values.length; i++){
          const v = values[i];
          if(!Number.isFinite(v) || v <= 0){
            invalid += 1;
            continue;
          }
          const logVal = Math.log(v);
          count += 1;
          logSum += logVal;
          logSumSq += logVal * logVal;
        }
        if(count < 2){
          return { key: 'lognormal', label: 'Log-normal', valid: false, message: 'Need at least two positive values.' };
        }
        const mu = logSum / count;
        const varianceLog = Math.max(0, logSumSq / count - mu * mu);
        const sigma = Math.sqrt(varianceLog);
        const mean = Math.exp(mu + varianceLog / 2);
        const median = Math.exp(mu);
        const result = {
          key: 'lognormal',
          label: 'Log-normal',
          color: CONTINUOUS_DISTRIBUTION_COLORS.lognormal,
          valid: sigma > 0,
          params: { mu, sigma, mean, median },
          paramOrder: ['mu', 'sigma', 'mean', 'median'],
          warnings: [],
          logLikelihood: sigma > 0
            ? (-count * (Math.log(sigma) + 0.5 * Math.log(2 * Math.PI)) - logSum - count / 2)
            : NaN
        };
        if(invalid > 0){
          result.warnings.push(`${invalid} value${invalid === 1 ? '' : 's'} ignored (non-positive).`);
        }
        if(!result.valid){
          result.message = 'Log-scale variance is zero; unable to fit a log-normal distribution.';
          result.warnings.push(result.message);
        }
        result.pdf = x => sigma > 0 ? logNormalPdf(x, mu, sigma) : 0;
        result.cdf = x => sigma > 0 ? logNormalCdf(x, mu, sigma) : (x < median ? 0 : 1);
        return result;
      }
    },
    exponential: {
      key: 'exponential',
      label: 'Exponential',
      color: CONTINUOUS_DISTRIBUTION_COLORS.exponential,
      fit(values){
        let count = 0;
        let sum = 0;
        let invalid = 0;
        for(let i = 0; i < values.length; i++){
          const v = values[i];
          if(!Number.isFinite(v) || v < 0){
            invalid += 1;
            continue;
          }
          count += 1;
          sum += v;
        }
        if(!count){
          return { key: 'exponential', label: 'Exponential', valid: false, message: 'No non-negative values supplied.' };
        }
        const mean = sum / count;
        const lambda = mean > 0 ? 1 / mean : 0;
        const result = {
          key: 'exponential',
          label: 'Exponential',
          color: CONTINUOUS_DISTRIBUTION_COLORS.exponential,
          valid: lambda > 0,
          params: { lambda, mean },
          paramOrder: ['lambda', 'mean'],
          warnings: [],
          logLikelihood: lambda > 0 ? (count * Math.log(lambda) - lambda * sum) : NaN
        };
        if(invalid > 0){
          result.warnings.push(`${invalid} value${invalid === 1 ? '' : 's'} ignored (negative or invalid).`);
        }
        if(!result.valid){
          result.message = 'Mean is zero; unable to fit an exponential distribution.';
          result.warnings.push(result.message);
        }
        result.pdf = x => lambda > 0 ? exponentialPdf(x, lambda) : 0;
        result.cdf = x => lambda > 0 ? exponentialCdf(x, lambda) : (x < 0 ? 0 : 1);
        return result;
      }
    }
  };

  stats.listContinuousDistributions = function listContinuousDistributions(){
    return Object.values(CONTINUOUS_DISTRIBUTIONS).map(entry => ({
      key: entry.key,
      label: entry.label,
      color: entry.color
    }));
  };

  stats.fitDistribution = function fitDistribution(values, options){
    const list = Array.isArray(values) ? values : [];
    const keyRaw = options?.distribution || options?.type || options?.key || '';
    const key = typeof keyRaw === 'string' ? keyRaw.toLowerCase() : '';
    const def = CONTINUOUS_DISTRIBUTIONS[key];
    if(!def){
      console.warn('stats.fitDistribution unknown distribution',{ distribution: keyRaw });
      return null;
    }
    try{
      const result = def.fit(list);
      return result;
    }catch(err){
      console.error('stats.fitDistribution error',{ distribution: key, message: err?.message });
      return { key, label: def.label, valid: false, message: err?.message || 'Fit failed.' };
    }
  };

  stats.goodnessOfFit = function goodnessOfFit(values, options){
    const keyRaw = options?.distribution || options?.fit?.key || '';
    const key = typeof keyRaw === 'string' ? keyRaw.toLowerCase() : '';
    const def = CONTINUOUS_DISTRIBUTIONS[key];
    if(!def){
      console.warn('stats.goodnessOfFit unknown distribution',{ distribution: keyRaw });
      return null;
    }
    const data = Array.isArray(values) ? values.filter(v => Number.isFinite(v)) : [];
    if(!data.length){
      return null;
    }
    const sorted = data.slice().sort((a,b)=>a-b);
    const alpha = Number.isFinite(options?.alpha) && options.alpha > 0 ? options.alpha : 0.05;
    const params = options?.params || options?.fit?.params || {};
    const fit = options?.fit || null;
    const pdf = typeof options?.pdf === 'function' ? options.pdf : fit?.pdf;
    const cdfCandidate = typeof options?.cdf === 'function' ? options.cdf : fit?.cdf;
    const cdf = typeof cdfCandidate === 'function'
      ? cdfCandidate
      : (key === 'normal'
        ? (x => normalCdf((x - params.mu) / params.sigma))
        : key === 'lognormal'
          ? (x => logNormalCdf(x, params.mu, params.sigma))
          : key === 'exponential'
            ? (x => exponentialCdf(x, params.lambda))
            : null);
    if(typeof cdf !== 'function'){
      console.warn('stats.goodnessOfFit missing cdf function',{ distribution: key });
      return null;
    }
    const ksStat = (()=>{
      let maxDiff = 0;
      for(let i=0;i<sorted.length;i++){
        const x=sorted[i];
        const Fi = clampUnit(cdf(x));
        const empiricalUpper = (i + 1) / sorted.length;
        const empiricalLower = i / sorted.length;
        const diff = Math.max(Math.abs(Fi - empiricalUpper), Math.abs(Fi - empiricalLower));
        if(diff > maxDiff){ maxDiff = diff; }
      }
      return maxDiff;
    })();
    const ksP = kolmogorovPValue(ksStat, sorted.length);
    const adStat = andersonDarlingStatistic(sorted, cdf);
    const adP = andersonDarlingPValue(adStat, key, sorted.length);
    const ksReject = ksP < alpha;
    const adReject = adP < alpha;
    return {
      alpha,
      n: sorted.length,
      pdf: pdf || null,
      cdf,
      ks: {
        statistic: ksStat,
        pValue: ksP,
        reject: ksReject,
        decision: ksReject ? 'Reject H₀' : 'Fail to reject H₀'
      },
      ad: {
        statistic: adStat,
        pValue: adP,
        reject: adReject,
        decision: adReject ? 'Reject H₀' : 'Fail to reject H₀'
      }
    };
  };

  function createLogFactorialCache(){
    return {
      values: [0],
      maxComputed: 0
    };
  }

  function ensureLogFactorialCache(cache, target){
    const store = cache || createLogFactorialCache();
    const maxTarget = Math.max(0, Math.floor(target));
    if(store.maxComputed < maxTarget){
      let running = store.values[store.maxComputed] || 0;
      for(let i = store.maxComputed + 1; i <= maxTarget; i++){
        running += Math.log(i);
        store.values[i] = running;
      }
      store.maxComputed = maxTarget;
      console.debug('Debug: stats.logFactCache extended',{ maxComputed: store.maxComputed }); // Debug: log factorial cache grow
    }
    return store;
  }

  function trimLogFactorialCache(cache, target){
    if(!cache){
      return null;
    }
    const maxTarget = Math.max(0, Math.floor(target));
    if(cache.maxComputed > maxTarget){
      cache.values.length = maxTarget + 1;
      cache.maxComputed = maxTarget;
      console.debug('Debug: stats.logFactCache trimmed',{ maxComputed: cache.maxComputed }); // Debug: log factorial cache trim
    }
    return cache;
  }

  function logChooseWithCache(n, k, cache){
    if(k < 0 || k > n){
      return -Infinity;
    }
    const prepared = ensureLogFactorialCache(cache, n);
    return prepared.values[n] - prepared.values[k] - prepared.values[n - k];
  }

  function computeHypergeometricRightTail(params){
    const {
      populationSize,
      successPopulation,
      draws,
      observedSuccesses,
      cache
    } = params || {};
    const N = Math.max(0, Math.floor(populationSize || 0));
    const K = Math.max(0, Math.floor(successPopulation || 0));
    const n = Math.max(0, Math.floor(draws || 0));
    const k = Math.max(0, Math.floor(observedSuccesses || 0));
    if(!N || !n || K < 0){
      return 0;
    }
    const store = ensureLogFactorialCache(cache?.logFactorial, N);
    if(cache){
      cache.logFactorial = store;
    }
    const denominator = logChooseWithCache(N, n, store);
    if(!Number.isFinite(denominator)){
      return 0;
    }
    let p = 0;
    const maxIter = Math.min(K, n);
    const start = Math.min(Math.max(k, 0), maxIter);
    for(let i = start; i <= maxIter; i++){
      const logTerm = logChooseWithCache(K, i, store) +
        logChooseWithCache(N - K, n - i, store) -
        denominator;
      const term = Math.exp(logTerm);
      p += term;
    }
    console.debug('Debug: stats.hypergeom right tail',{ N, K, n, k, p }); // Debug: hypergeometric right tail
    return p;
  }

  stats.createLogFactorialCache = createLogFactorialCache;
  stats.ensureLogFactorialCache = ensureLogFactorialCache;
  stats.trimLogFactorialCache = trimLogFactorialCache;
  stats.logChooseWithCache = logChooseWithCache;
  stats.computeHypergeometricRightTail = computeHypergeometricRightTail;

  stats.listCorrections = function(){
    const list = Object.entries(METHOD_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label }));
    console.debug('Debug: stats.listCorrections',{ methods: list.map(item => item.value) });
    return list;
  };

  stats.getCorrectionMeta = function(method){
    const methodKey = normalizeMethod(method);
    const cfg = METHOD_CONFIG[methodKey] || METHOD_CONFIG[DEFAULT_METHOD];
    const meta = {
      key: methodKey,
      label: cfg.label,
      shortLabel: cfg.shortLabel || cfg.label,
      description: cfg.description,
      aliases: cfg.aliases ? cfg.aliases.slice() : [],
      footnote: cfg.footnote
    };
    console.debug('Debug: stats.getCorrectionMeta',{ method: methodKey, label: meta.label });
    return meta;
  };
})(typeof window !== 'undefined' ? window : globalThis);
