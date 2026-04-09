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
    'holm-sidak': {
      label: 'Holm-Šidák',
      shortLabel: 'Holm-Šidák',
      description: 'Holm-Šidák step-down adjustment for family-wise error control.',
      footnote: count => `Holm-Šidák correction applied across ${count} test${count === 1 ? '' : 's'}.`,
      aliases: ['holm-sidak', 'holm sidak', 'holmsidak', 'holm_sidak']
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
  const DEFAULT_PVALUE_SCI_THRESHOLD = 1;
  const DEFAULT_REPORT_PVALUE_DECIMALS = 4;
  const DEFAULT_REPORT_PVALUE_MIN = 0.0001;
  const PVALUE_FORMAT_STORAGE_KEY = 'venn.stats.pvalueScientific';

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
    const expMatch = result.match(/^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+$/);
    if(expMatch){
      const parts = result.split(/[eE]/);
      let mantissa = parts[0];
      const exponent = parts[1];
      if(mantissa.includes('.')){
        mantissa = mantissa.replace(/0+$/, '').replace(/\.$/, '');
        if(mantissa === '' || mantissa === '+' || mantissa === '-'){
          mantissa = `${mantissa}0`;
        }
      }
      result = `${mantissa}e${exponent}`;
      return normalizeExponentText(result);
    }
    if(!/[eE]/.test(result) && result.includes('.')){
      result = result.replace(/0+$/, '').replace(/\.$/, '');
      if(result === ''){
        result = '0';
      }
    }
    return normalizeExponentText(result);
  }

  function formatFixedTrimmed(value, decimals){
    const num = Number(value);
    if(!Number.isFinite(num)){
      return String(value);
    }
    const safeDecimals = Number.isInteger(decimals) && decimals >= 0
      ? decimals
      : DEFAULT_REPORT_PVALUE_DECIMALS;
    return num
      .toFixed(safeDecimals)
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.0+$/, '')
      .replace(/^-0$/, '0');
  }

  function sanitizePValueScientific(value, fallback){
    if(value === true || value === 'true' || value === 1 || value === '1'){
      return true;
    }
    if(value === false || value === 'false' || value === 0 || value === '0'){
      return false;
    }
    return fallback === true;
  }

  function getStoredPValueScientific(){
    try{
      if(global.localStorage){
        const stored = global.localStorage.getItem(PVALUE_FORMAT_STORAGE_KEY);
        if(stored != null && stored !== ''){
          return sanitizePValueScientific(stored, false);
        }
      }
    }catch(err){
      statsReportingDebug('readPValueFormatStorageError', { message: err?.message || String(err) });
    }
    return false;
  }

  function persistPValueScientific(value){
    try{
      if(global.localStorage){
        global.localStorage.setItem(PVALUE_FORMAT_STORAGE_KEY, value ? '1' : '0');
      }
    }catch(err){
      statsReportingDebug('writePValueFormatStorageError', { message: err?.message || String(err) });
    }
  }

  let sharedPValueScientific = getStoredPValueScientific();

  function sharedFormatPValue(value, options){
    const num = Number(value);
    if(!Number.isFinite(num)){
      return String(value);
    }
    const digits = clampSignificantDigits(options?.significantDigits);
    const fractionalDigits = Math.max(0, digits - 1);
    const decimals = Number.isInteger(options?.decimals) && options.decimals >= 0
      ? options.decimals
      : DEFAULT_REPORT_PVALUE_DECIMALS;
    const decimalThreshold = Number.isFinite(options?.decimalThreshold) && options.decimalThreshold > 0
      ? options.decimalThreshold
      : DEFAULT_REPORT_PVALUE_MIN;
    const scientific = options?.forceScientific === true
      ? true
      : (options?.scientific === false
        ? false
        : (options?.scientific === true
          ? true
          : sharedPValueScientific));
    let formatted;
    if(scientific){
      formatted = num.toExponential(fractionalDigits);
    }else{
      if(num === 0){
        formatted = '0';
      }else if(num > 0 && num < decimalThreshold){
        formatted = `<${formatFixedTrimmed(decimalThreshold, decimals)}`;
      }else{
        formatted = formatFixedTrimmed(num, decimals);
      }
    }
    const result = scientific ? finalizeNumberString(formatted) : formatted;
    if(statsDebugEnabled()){
      console.debug('Debug: Shared.formatPValue',{ input: value, formatted: result, scientific, options });
    }
    return result;
  }

  Shared.formatPValue = sharedFormatPValue;

  function formatShortNumber(value, options){
    const opts = options || {};
    const emptyValue = typeof opts.emptyValue === 'string' ? opts.emptyValue : 'n/a';
    const maxSignificantDigits = Number.isFinite(opts.maxSignificantDigits)
      ? opts.maxSignificantDigits
      : 6;
    if(value === null || value === undefined){
      return emptyValue;
    }
    if(typeof value === 'number'){
      if(!Number.isFinite(value)){
        return String(value);
      }
      return value.toLocaleString('en-US', { maximumSignificantDigits: maxSignificantDigits });
    }
    const numeric = Number(value);
    if(Number.isFinite(numeric)){
      return numeric.toLocaleString('en-US', { maximumSignificantDigits: maxSignificantDigits });
    }
    return String(value);
  }

  function formatFixedNumber(value, options){
    const opts = options || {};
    const num = Number(value);
    if(!Number.isFinite(num)){
      return typeof opts.emptyValue === 'string' ? opts.emptyValue : '-';
    }
    const decimals = Number.isFinite(opts.decimals) ? opts.decimals : 4;
    return num.toFixed(decimals);
  }

  const formatters = Shared.formatters = Shared.formatters || {};
  if(typeof formatters.formatShortNumber !== 'function'){
    formatters.formatShortNumber = formatShortNumber;
  }
  if(typeof formatters.formatFixedNumber !== 'function'){
    formatters.formatFixedNumber = formatFixedNumber;
  }
  if(typeof formatters.formatPValue !== 'function'){
    formatters.formatPValue = sharedFormatPValue;
  }

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

  function adjustHolmSidak(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: sanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 0;
    ordered.forEach((entry, idx) => {
      const rank = m - idx;
      const raw = clampUnit(1 - Math.pow(1 - entry.p, rank));
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
    // Compute harmonic sum directly without intermediate array allocation
    let harmonic = 0;
    for(let k = 1; k <= m; k++){
      harmonic += 1 / k;
    }
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
    'holm-sidak': adjustHolmSidak,
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



  const reporting = Shared.statsReporting = Shared.statsReporting || {};

  function humanizeAnalysisKey(key){
    if(typeof key !== 'string' || !key){
      return '';
    }
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\bci\b/gi, 'CI')
      .replace(/\baicc\b/gi, 'AICc')
      .replace(/\baic\b/gi, 'AIC')
      .replace(/\bbic\b/gi, 'BIC')
      .replace(/\bauc\b/gi, 'AUC')
      .replace(/\broc\b/gi, 'ROC')
      .replace(/\bpr\b/gi, 'PR')
      .replace(/\bpca\b/gi, 'PCA')
      .replace(/\bqq\b/gi, 'QQ')
      .replace(/\bcox\b/gi, 'Cox')
      .trim()
      .replace(/^./, char => char.toUpperCase());
  }

  function isInternalAnalysisSpecKey(key){
    return key === 'index' || key === 'key' || key === '__internal' || key === '__debug';
  }

  function sanitizeAnalysisSpecForDisplay(value){
    if(value == null || value === ''){
      return undefined;
    }
    if(Array.isArray(value)){
      const items = value
        .map(item => sanitizeAnalysisSpecForDisplay(item))
        .filter(item => item !== undefined);
      return items.length ? items : undefined;
    }
    if(typeof value === 'object'){
      const output = {};
      Object.entries(value).forEach(([key, entry]) => {
        if(isInternalAnalysisSpecKey(key)){
          return;
        }
        const cleaned = sanitizeAnalysisSpecForDisplay(entry);
        if(cleaned === undefined){
          return;
        }
        if(cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned) && !Object.keys(cleaned).length){
          return;
        }
        output[key] = cleaned;
      });
      return Object.keys(output).length ? output : undefined;
    }
    return value;
  }

  function formatAnalysisSummaryValue(key, value){
    if(value == null || value === ''){
      return '';
    }
    if(typeof value === 'boolean'){
      return value ? 'Yes' : 'No';
    }
    if(typeof value === 'number'){
      if((key === 'ciLevel' || /confidence/i.test(key)) && value > 0 && value <= 1){
        return `${(value * 100).toFixed(value * 100 % 1 === 0 ? 0 : 1)}%`;
      }
      return String(value);
    }
    if(Array.isArray(value)){
      if(!value.length){
        return '';
      }
      const namedItems = value.map(item => {
        if(item && typeof item === 'object'){
          return item.header || item.label || item.name || item.value || null;
        }
        return item;
      }).filter(item => item != null && item !== '');
      if(namedItems.length){
        return namedItems.join(', ');
      }
      return `${value.length} item${value.length === 1 ? '' : 's'}`;
    }
    if(typeof value === 'object'){
      const named = value.label || value.name || value.header || value.value || null;
      if(named != null && named !== ''){
        return String(named);
      }
      return '';
    }
    return String(value);
  }

  function shouldHideAnalysisSummaryKey(key){
    if(typeof key !== 'string' || !key){
      return false;
    }
    const normalized = key.trim();
    return normalized === 'schemaVersion'
      || normalized === 'seed'
      || normalized === 'randomSeed'
      || normalized === 'generatedAt'
      || normalized === 'hazardRatioRows'
      || normalized === 'coxCoefficientCount'
      || normalized === 'logRankAvailable'
      || normalized === 'rowCount'
      || normalized === 'columnCount'
      || normalized === 'colCount'
      || normalized === 'pointCount';
  }

  function copyReportTextToClipboard(text, button){
    const value = typeof text === 'string' ? text : String(text ?? '');
    const onDebug = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const setButtonState = (label, isError) => {
      if(!button){
        return;
      }
      button.textContent = label;
      if(isError){
        button.dataset.copyState = 'error';
      }else if(label === 'Copied'){
        button.dataset.copyState = 'copied';
      }else{
        delete button.dataset.copyState;
      }
    };
    const resetLater = () => {
      if(!button){
        return;
      }
      global.setTimeout(() => {
        button.textContent = 'Copy';
        delete button.dataset.copyState;
      }, 1600);
    };
    const fallbackCopy = () => {
      if(!global.document || !global.document.createElement || !global.document.body){
        return false;
      }
      const textarea = global.document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      global.document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      let ok = false;
      try{
        ok = typeof global.document.execCommand === 'function' ? !!global.document.execCommand('copy') : false;
      }catch(error){
        if(onDebug){
          console.debug('Debug: statsReporting.copyReportTextToClipboard fallback failed', { message: error?.message || String(error) });
        }
        ok = false;
      }
      global.document.body.removeChild(textarea);
      return ok;
    };
    const complete = copied => {
      if(copied){
        setButtonState('Copied', false);
      }else{
        setButtonState('Copy failed', true);
      }
      resetLater();
      if(onDebug){
        console.debug('Debug: statsReporting.copyReportTextToClipboard', { copied, length: value.length });
      }
      return copied;
    };
    try{
      if(global.navigator?.clipboard?.writeText){
        return global.navigator.clipboard.writeText(value)
          .then(() => complete(true))
          .catch(error => {
            if(onDebug){
              console.debug('Debug: statsReporting.copyReportTextToClipboard navigator fallback', { message: error?.message || String(error) });
            }
            return complete(fallbackCopy());
          });
      }
    }catch(error){
      if(onDebug){
        console.debug('Debug: statsReporting.copyReportTextToClipboard navigator failed', { message: error?.message || String(error) });
      }
    }
    return Promise.resolve(complete(fallbackCopy()));
  }

  function createReportBlockHeader(documentRef, labelText, copyText){
    const row = documentRef.createElement('div');
    row.className = 'stats-report-panel__header';
    const label = documentRef.createElement('div');
    label.className = 'stats-table-lead';
    label.textContent = labelText;
    row.appendChild(label);
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'stats-report-panel__copy-btn';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', `${labelText}: copy to clipboard`);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      copyReportTextToClipboard(copyText, button);
    });
    row.appendChild(button);
    return row;
  }

  function buildAnalysisSummaryLines(spec){
    const cleaned = sanitizeAnalysisSpecForDisplay(spec);
    if(!cleaned || typeof cleaned !== 'object'){
      return [];
    }
    const priorityKeys = [
      'component','testFamily','test','analysis','analysisMode','mode','regressionMode','associationMethod','metric',
      'groupCount','paired','alternative','alpha','ciLevel','correction','fitMethod','fitModel','fitEquation',
      'showHazardRatios','fitCox','covariates','selectedColumns','referenceIndex','postHoc'
    ];
    const seen = new Set();
    const lines = [];
    const pushLine = (label, value) => {
      if(!label || value == null || value === ''){
        return;
      }
      lines.push({ label, value: String(value) });
    };
    const processEntry = (key, value, prefix) => {
      if(value == null || value === '' || shouldHideAnalysisSummaryKey(key)){
        return;
      }
      const label = prefix ? `${prefix}: ${humanizeAnalysisKey(key)}` : humanizeAnalysisKey(key);
      if(Array.isArray(value) || typeof value !== 'object'){
        pushLine(label, formatAnalysisSummaryValue(key, value));
        return;
      }
      const compactValue = formatAnalysisSummaryValue(key, value);
      if(compactValue){
        pushLine(label, compactValue);
        return;
      }
      Object.entries(value).forEach(([childKey, childValue]) => {
        processEntry(childKey, childValue, label);
      });
    };

    priorityKeys.forEach(key => {
      if(Object.prototype.hasOwnProperty.call(cleaned, key)){
        seen.add(key);
        processEntry(key, cleaned[key], '');
      }
    });
    Object.entries(cleaned).forEach(([key, value]) => {
      if(seen.has(key) || shouldHideAnalysisSummaryKey(key)){
        return;
      }
      processEntry(key, value, '');
    });
    return lines.filter(line => line.value && line.value !== 'null').slice(0, 14);
  }

  function appendAnalysisSummaryBlock(target, lines, documentRef){
    if(!target || !Array.isArray(lines) || !lines.length || !documentRef || !documentRef.createElement){
      return;
    }
    const summaryText = lines.map(line => `${line.label}: ${line.value}`).join('\n');
    target.appendChild(createReportBlockHeader(documentRef, 'Configuration summary', summaryText));

    const list = documentRef.createElement('ul');
    list.className = 'stats-report-panel__summary-list';
    lines.forEach(line => {
      const item = documentRef.createElement('li');
      item.className = 'stats-report-panel__summary-item';
      const strong = documentRef.createElement('strong');
      strong.textContent = `${line.label}: `;
      item.appendChild(strong);
      item.appendChild(documentRef.createTextNode(line.value));
      list.appendChild(item);
    });
    target.appendChild(list);
  }

  reporting.appendReportPanel = function appendReportPanel(target, report, options){
    const documentRef = global.document;
    if(!target || !report || !documentRef || !documentRef.createElement){
      return;
    }
    if(typeof reporting.clearReportHost === 'function' && options?.replaceExisting !== false){
      reporting.clearReportHost(target);
    }
    let reportTarget = resolveReportingHost(target);
    if(
      target
      && reportTarget
      && reportTarget !== target
      && !reportTarget.isConnected
      && typeof reporting.ensureReportHost === 'function'
    ){
      reportTarget = reporting.ensureReportHost(target, { attachToTarget: true, position: 'last' }) || reportTarget;
    }
    if(!reportTarget || !reportTarget.appendChild){
      reportTarget = target;
    }
    const title = typeof options?.title === 'string' && options.title.trim()
      ? options.title.trim()
      : 'Reporting and reproducibility';
    const methodsLabel = typeof options?.methodsLabel === 'string' && options.methodsLabel.trim()
      ? options.methodsLabel.trim()
      : 'Methods text';
    const resultsLabel = typeof options?.resultsLabel === 'string' && options.resultsLabel.trim()
      ? options.resultsLabel.trim()
      : 'Results text';
    const specLabel = typeof options?.specLabel === 'string' && options.specLabel.trim()
      ? options.specLabel.trim()
      : 'Technical analysis record (advanced)';
    const panel = documentRef.createElement('details');
    panel.className = 'stats-report-panel';
    panel.dataset.statsReporting = '1';
    const summary = documentRef.createElement('summary');
    summary.textContent = title;
    panel.appendChild(summary);

    const addBlock = (labelText, valueText) => {
      const normalizedText = valueText || '';
      panel.appendChild(createReportBlockHeader(documentRef, labelText, normalizedText));
      const pre = documentRef.createElement('pre');
      pre.textContent = normalizedText;
      panel.appendChild(pre);
    };

    addBlock(methodsLabel, report.methodsText || '');
    addBlock(resultsLabel, report.resultsText || '');

    const spec = report.analysisSpec || options?.analysisSpecFallback || null;
    const displaySpec = sanitizeAnalysisSpecForDisplay(spec);
    const summaryLines = buildAnalysisSummaryLines(displaySpec);
    if(summaryLines.length){
      appendAnalysisSummaryBlock(panel, summaryLines, documentRef);
    }
    if(displaySpec){
      const advanced = documentRef.createElement('details');
      advanced.className = 'stats-report-panel__advanced';
      const advancedSummary = documentRef.createElement('summary');
      advancedSummary.textContent = specLabel;
      advanced.appendChild(advancedSummary);
      const note = documentRef.createElement('p');
      note.className = 'stats-report-panel__note';
      note.textContent = 'Machine-readable analysis settings snapshot kept for reproducibility and troubleshooting.';
      advanced.appendChild(note);
      const advancedJson = JSON.stringify(displaySpec, null, 2);
      advanced.appendChild(createReportBlockHeader(documentRef, 'Technical analysis record', advancedJson));
      const pre = documentRef.createElement('pre');
      pre.textContent = advancedJson;
      advanced.appendChild(pre);
      panel.appendChild(advanced);
    }

    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: statsReporting.appendReportPanel',{ title, hasMethods: !!report.methodsText, hasResults: !!report.resultsText, hasAnalysisSpec: !!displaySpec });
    }
    reportTarget.appendChild(panel);
    if(typeof reporting.pinReportHostLast === 'function'){
      reporting.pinReportHostLast(target);
    }
  };

  const SIGNIFICANCE_THRESHOLD_STORAGE_KEY = 'venn.stats.significanceThreshold';
  const DEFAULT_SIGNIFICANCE_THRESHOLD = 0.05;
  const STATS_PANEL_SELECTORS = [
    '#statsResults',
    '#scatterStatsResults',
    '#lineStatsResults',
    '#rocStatsResults',
    '#histStatsResults',
    '#pieStatsResults',
    '#heatmapStatsContent',
    '#pcaStatsResults',
    '#surfaceStatsSummary',
    '#survivalStatsSummary',
    '#survivalStatsLogRank',
    '#survivalStatsHazardRatios',
    '#survivalStatsCox'
  ];
  const ADVANCED_KEYWORD_PATTERNS = [
    /\bdiagnostic/i,
    /\bcoefficient/i,
    /\bparameter/i,
    /\bresidual/i,
    /\bforecast/i,
    /\bseasonal/i,
    /\btechnical\b/i,
    /\breproducibility/i,
    /\bpost[-\s]?hoc/i,
    /\bhazard ratio/i,
    /\bcox\b/i,
    /\bconfidence interval/i,
    /\binterval bounds/i,
    /\bcurve comparison/i,
    /\bpairwise/i,
    /\bassumption/i,
    /\beigen/i,
    /\bloadings?\b/i
  ];
  const panelEnhancerState = new WeakMap();
  const enhancedStatsPanels = new Set();
  const TRACKED_STATS_PANEL_IDS = STATS_PANEL_SELECTORS
    .filter(selector => typeof selector === 'string' && selector.startsWith('#'))
    .map(selector => selector.slice(1))
    .filter(Boolean);
  const trackedStatsPanelIdSet = new Set(TRACKED_STATS_PANEL_IDS);
  let panelsInstallAttempted = false;
  let panelInstallRescanObserver = null;
  let panelInstallRescanScheduled = false;

  function statsReportingDebug(label, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug(`Debug: statsReporting.${label}`, payload || {});
    }
  }

  function sanitizeSignificanceThreshold(value, fallback){
    const fallbackValue = Number.isFinite(fallback) && fallback > 0 && fallback <= 1
      ? fallback
      : DEFAULT_SIGNIFICANCE_THRESHOLD;
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return fallbackValue;
    }
    if(numeric > 1){
      return 1;
    }
    return numeric;
  }

  function formatThresholdLabel(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return String(DEFAULT_SIGNIFICANCE_THRESHOLD);
    }
    if(numeric >= 0.01){
      return numeric.toFixed(3).replace(/0+$/,'').replace(/\.$/, '');
    }
    return numeric.toExponential(2);
  }

  function getStoredSignificanceThreshold(){
    try{
      if(global.localStorage){
        const stored = global.localStorage.getItem(SIGNIFICANCE_THRESHOLD_STORAGE_KEY);
        if(stored != null && stored !== ''){
          return sanitizeSignificanceThreshold(stored, DEFAULT_SIGNIFICANCE_THRESHOLD);
        }
      }
    }catch(err){
      statsReportingDebug('readThresholdStorageError', { message: err?.message || String(err) });
    }
    return DEFAULT_SIGNIFICANCE_THRESHOLD;
  }

  let sharedSignificanceThreshold = getStoredSignificanceThreshold();

  function persistSignificanceThreshold(value){
    try{
      if(global.localStorage){
        global.localStorage.setItem(SIGNIFICANCE_THRESHOLD_STORAGE_KEY, String(value));
      }
    }catch(err){
      statsReportingDebug('writeThresholdStorageError', { message: err?.message || String(err) });
    }
  }

  function getPValueFormatLabel(scientific){
    return scientific ? 'Scientific' : 'Decimal';
  }

  function getPValueFormatButtonLabel(scientific){
    return scientific ? 'Decimal' : 'Scientific';
  }

  function formatPValueFromParsedInfo(pInfo, options){
    if(!pInfo || !Number.isFinite(Number(pInfo.value))){
      return null;
    }
    return sharedFormatPValue(Number(pInfo.value), {
      scientific: options?.scientific === true
    });
  }

  function replaceInlinePValueText(text, options){
    const source = String(text == null ? '' : text);
    if(!source){
      return source;
    }
    const scientific = options?.scientific === true;
    return source.replace(
      /(\b(?:p(?:\s*[-]?\s*value)?|padj|p\s*\([^)]+\))\b(?:\s*\([^)]+\))?\s*)([<>]=?|=)\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/gi,
      (match, label, operator, numericText) => {
        const numeric = Number(numericText);
        if(!Number.isFinite(numeric)){
          return match;
        }
        const formatted = sharedFormatPValue(numeric, { scientific });
        return `${label}${operator} ${formatted}`;
      }
    );
  }

  function createDefaultPValueFormatControl(documentRef, target){
    if(!documentRef || !documentRef.createElement){
      return null;
    }
    const scientific = sharedPValueScientific;
    const wrap = documentRef.createElement('span');
    wrap.className = 'stats-pvalue-format-inline';
    const label = documentRef.createElement('span');
    label.className = 'stats-pvalue-format-inline__label';
    label.textContent = `P-value format: ${getPValueFormatLabel(scientific)}`;
    wrap.appendChild(label);
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'stats-pvalue-format-toggle';
    button.textContent = getPValueFormatButtonLabel(scientific);
    button.setAttribute('data-undo-ignore', '1');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      reporting.setPValueFormatScientific(!sharedPValueScientific, { source: target?.id || null });
    });
    wrap.appendChild(button);
    return wrap;
  }

  function rewriteInlinePValueElements(target){
    if(!target || typeof target.querySelectorAll !== 'function'){
      return;
    }
    const scientific = sharedPValueScientific;
    const elements = target.querySelectorAll(
      '.stats-report-panel pre, .stats-report-panel__summary-item, .stats-table-footnote, .stats-table-lead, .stats-assumption-section .assumption-detail'
    );
    elements.forEach(element => {
      if(!element || element.closest('.stats-significance-controls')){
        return;
      }
      const source = element.dataset.statsPvalueSourceText || element.textContent || '';
      if(!element.dataset.statsPvalueSourceText){
        element.dataset.statsPvalueSourceText = source;
      }
      const replaced = replaceInlinePValueText(source, { scientific });
      if(replaced !== element.textContent){
        element.textContent = replaced;
      }
    });
  }

  function rewriteTablePValueCells(table){
    if(!table || typeof table.querySelectorAll !== 'function'){
      return;
    }
    const scientific = sharedPValueScientific;
    let headerCells = Array.from(table.querySelectorAll('thead tr th'));
    if(!headerCells.length){
      const firstRow = table.querySelector('tr');
      if(firstRow && firstRow.querySelector('th')){
        headerCells = Array.from(firstRow.querySelectorAll('th'));
      }
    }
    const pColumnIndexes = [];
    headerCells.forEach((cell, index) => {
      if(isPLabel(cell?.textContent || '')){
        pColumnIndexes.push(index);
      }
    });
    let bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    if(!bodyRows.length){
      const allRows = Array.from(table.querySelectorAll('tr'));
      if(allRows.length){
        const firstRowCells = Array.from(allRows[0].cells || []);
        const firstRowIsHeader = firstRowCells.some(cell => String(cell.tagName || '').toLowerCase() === 'th');
        bodyRows = firstRowIsHeader ? allRows.slice(1) : allRows;
      }
    }
    const rewriteBareCell = cell => {
      if(!cell){
        return;
      }
      const source = cell.dataset.statsPvalueSourceText || cell.textContent || '';
      if(!cell.dataset.statsPvalueSourceText){
        cell.dataset.statsPvalueSourceText = source;
      }
      const parsed = parsePValue(source, { allowBare: true });
      const formatted = formatPValueFromParsedInfo(parsed, { scientific });
      if(formatted != null){
        cell.textContent = formatted;
      }
    };
    bodyRows.forEach(row => {
      const cells = Array.from(row.cells || []);
      if(!cells.length){
        return;
      }
      pColumnIndexes.forEach(index => {
        rewriteBareCell(cells[index]);
      });
      if(cells.length >= 2 && isPLabel(cells[0]?.textContent || '')){
        rewriteBareCell(cells[cells.length - 1]);
      }
    });
  }

  function parsePValue(rawText, options){
    const source = String(rawText == null ? '' : rawText)
      .replace(/\u2212/g, '-')
      .replace(/,/g, '')
      .trim();
    if(!source){
      return null;
    }
    const explicitMatch = source.match(/\bp(?:\s*[-]?\s*value)?\b[^0-9<>=]*([<>]=?|=)\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i);
    if(explicitMatch){
      const numeric = Number(explicitMatch[2]);
      if(Number.isFinite(numeric)){
        return { value: numeric, operator: explicitMatch[1] || '=' };
      }
    }
    const compactMatch = source.match(/\bp(?:adj|adj\.|value|val)?\s*[:=]\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i);
    if(compactMatch){
      const numeric = Number(compactMatch[1]);
      if(Number.isFinite(numeric)){
        return { value: numeric, operator: '=' };
      }
    }
    if(options?.allowBare === true){
      const bareMatch = source.match(/^([<>]=?|=)?\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i);
      if(bareMatch){
        const numeric = Number(bareMatch[2]);
        if(Number.isFinite(numeric)){
          return { value: numeric, operator: bareMatch[1] || '=' };
        }
      }
    }
    return null;
  }

  function isPLabel(text){
    const source = String(text || '').toLowerCase();
    return /\b(?:p|p[-\s]?value|p[-\s]?val|adj(?:usted)?\s*p|padj|p\*)\b/.test(source);
  }

  function resolveSignificanceToken(pInfo, threshold){
    if(!pInfo || !Number.isFinite(pInfo.value)){
      return null;
    }
    const alpha = sanitizeSignificanceThreshold(threshold, DEFAULT_SIGNIFICANCE_THRESHOLD);
    const operator = typeof pInfo.operator === 'string' ? pInfo.operator : '=';
    const value = pInfo.value;
    const isSignificant = (operator === '>' || operator === '>=') ? false : (value <= alpha);
    if(!isSignificant){
      return 'NS';
    }
    if(value <= alpha / 1000){
      return '****';
    }
    if(value <= alpha / 100){
      return '***';
    }
    if(value <= alpha / 10){
      return '**';
    }
    return '*';
  }

  function renderSignificanceBadge(cell, pInfo, threshold){
    if(!cell || typeof cell.querySelectorAll !== 'function'){
      return false;
    }
    cell.querySelectorAll('.stats-significance-badge').forEach(node => {
      try{
        node.remove();
      }catch(err){}
    });
    const token = resolveSignificanceToken(pInfo, threshold);
    if(!token || !cell.ownerDocument || typeof cell.ownerDocument.createElement !== 'function'){
      return false;
    }
    const badge = cell.ownerDocument.createElement('span');
    badge.className = `stats-significance-badge ${token === 'NS' ? 'stats-significance-badge--ns' : 'stats-significance-badge--sig'}`;
    badge.textContent = token;
    const thresholdLabel = formatThresholdLabel(threshold);
    badge.title = `Significance summary at p <= ${thresholdLabel}`;
    cell.appendChild(badge);
    return true;
  }

  function annotateTablePValues(table, threshold){
    if(!table || typeof table.querySelectorAll !== 'function'){
      return 0;
    }
    let headerCells = Array.from(table.querySelectorAll('thead tr th'));
    if(!headerCells.length){
      const firstRow = table.querySelector('tr');
      if(firstRow && firstRow.querySelector('th')){
        headerCells = Array.from(firstRow.querySelectorAll('th'));
      }
    }
    const pColumnIndexes = [];
    headerCells.forEach((cell, index) => {
      if(isPLabel(cell?.textContent || '')){
        pColumnIndexes.push(index);
      }
    });
    let badgeCount = 0;
    let bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    if(!bodyRows.length){
      const allRows = Array.from(table.querySelectorAll('tr'));
      if(allRows.length){
        const firstRowCells = Array.from(allRows[0].cells || []);
        const firstRowIsHeader = firstRowCells.some(cell => String(cell.tagName || '').toLowerCase() === 'th');
        bodyRows = firstRowIsHeader ? allRows.slice(1) : allRows;
      }
    }
    bodyRows.forEach(row => {
      const cells = Array.from(row.cells || []);
      if(!cells.length){
        return;
      }
      const taggedCells = new Set();
      pColumnIndexes.forEach(index => {
        const candidate = cells[index];
        if(!candidate){
          return;
        }
        const parsed = parsePValue(candidate.textContent, { allowBare: true });
        if(renderSignificanceBadge(candidate, parsed, threshold)){
          badgeCount += 1;
          taggedCells.add(candidate);
        }
      });
      if(cells.length >= 2 && isPLabel(cells[0]?.textContent || '')){
        const candidate = cells[cells.length - 1];
        if(candidate && !taggedCells.has(candidate)){
          const parsed = parsePValue(candidate.textContent, { allowBare: true });
          if(renderSignificanceBadge(candidate, parsed, threshold)){
            badgeCount += 1;
            taggedCells.add(candidate);
          }
        }
      }
      cells.forEach(cell => {
        if(taggedCells.has(cell)){
          return;
        }
        const parsed = parsePValue(cell.textContent, { allowBare: false });
        if(renderSignificanceBadge(cell, parsed, threshold)){
          badgeCount += 1;
          taggedCells.add(cell);
        }
      });
    });
    return badgeCount;
  }

  function readNodeCaption(node){
    if(!node || node.nodeType !== 1){
      return '';
    }
    const children = Array.from(node.children || []);
    for(let index = 0; index < children.length; index += 1){
      const child = children[index];
      if(!child){
        continue;
      }
      const tagName = String(child.tagName || '').toLowerCase();
      const classList = child.classList || { contains: () => false };
      if(
        tagName === 'summary'
        || classList.contains('stats-table-caption')
        || classList.contains('stats-table-lead')
        || classList.contains('loadings-card__title')
        || classList.contains('variance-card__title')
      ){
        if(child.textContent){
          return child.textContent.trim();
        }
      }
    }
    if(node.getAttribute){
      const attrCaption = node.getAttribute('data-stats-caption');
      if(attrCaption){
        return String(attrCaption).trim();
      }
    }
    if(node.id){
      return String(node.id);
    }
    return '';
  }

  function isAdvancedNode(node){
    if(!node || node.nodeType !== 1){
      return false;
    }
    if(node.classList.contains('stats-assumption-container')){
      return true;
    }
    if(node.getAttribute('data-stats-advanced') === '1'){
      return true;
    }
    if(node.getAttribute('data-stats-advanced') === '0'){
      return false;
    }
    if(node.classList.contains('stats-report-panel') || node.classList.contains('stats-report-panel__advanced')){
      return false;
    }
    const caption = readNodeCaption(node);
    if(!caption){
      return false;
    }
    return ADVANCED_KEYWORD_PATTERNS.some(pattern => pattern.test(caption));
  }

  function isReportingNode(node){
    if(!node || node.nodeType !== 1){
      return false;
    }
    if(node.getAttribute('data-stats-reporting') === '1'){
      return true;
    }
    return node.classList.contains('stats-report-panel') || node.classList.contains('stats-report-panel__advanced');
  }

  function resolveReportingHost(target){
    const explicitHost = target && target.__statsReportHost;
    if(explicitHost && explicitHost.nodeType === 1){
      return explicitHost;
    }
    return target || null;
  }

  function resolveReportingHostParent(target){
    if(!target || target.nodeType !== 1){
      return null;
    }
    const explicitHost = target.__statsReportHost;
    if(explicitHost && explicitHost.nodeType === 1 && explicitHost.parentNode === target){
      return target;
    }
    if(target.classList?.contains('stats-report-host') && target.parentNode?.nodeType === 1){
      return target.parentNode;
    }
    return null;
  }

  reporting.ensureReportHost = function ensureReportHost(target, options = {}){
    if(!target || target.nodeType !== 1){
      return null;
    }
    const documentRef = target.ownerDocument || global.document;
    if(!documentRef || typeof documentRef.createElement !== 'function'){
      return null;
    }
    const desiredId = typeof options.id === 'string' && options.id.trim()
      ? options.id.trim()
      : null;
    let host = target.__statsReportHost;
    if((!host || host.nodeType !== 1) && desiredId && typeof documentRef.getElementById === 'function'){
      const existing = documentRef.getElementById(desiredId);
      if(existing && existing.nodeType === 1){
        host = existing;
      }
    }
    if(!host || host.nodeType !== 1){
      host = documentRef.createElement('div');
    }
    if(desiredId){
      host.id = desiredId;
    }
    const desiredClassName = typeof options.className === 'string' && options.className.trim()
      ? options.className.trim()
      : (host.className || 'stats-report-host');
    host.className = desiredClassName;
    target.__statsReportHost = host;
    if(options.attachToTarget !== false && typeof target.appendChild === 'function'){
      if(host.parentNode !== target){
        target.appendChild(host);
      }
      if(options.position === 'first'){
        if(target.firstElementChild !== host){
          target.insertBefore(host, target.firstChild || null);
        }
      }else if(options.position !== 'keep' && target.lastElementChild !== host){
        target.appendChild(host);
      }
    }
    if(options.migrateLegacyPanels && host.parentNode === target){
      const legacyPanels = Array.from(target.children || []).filter(node => node !== host && isReportingNode(node));
      legacyPanels.forEach(panel => {
        host.appendChild(panel);
      });
    }
    if(typeof reporting.pinReportHostLast === 'function'){
      reporting.pinReportHostLast(target);
    }
    return host;
  };

  reporting.pinReportHostLast = function pinReportHostLast(target){
    const parent = resolveReportingHostParent(target);
    if(!parent || typeof parent.appendChild !== 'function'){
      return false;
    }
    const host = resolveReportingHost(parent);
    if(!host || host === parent || host.parentNode !== parent){
      return false;
    }
    if(parent.lastElementChild !== host){
      parent.appendChild(host);
      return true;
    }
    return false;
  };

  reporting.clearReportHost = function clearReportHost(target){
    const reportHost = resolveReportingHost(target);
    if(!reportHost || reportHost.nodeType !== 1){
      return false;
    }
    if(reportHost !== target){
      reportHost.innerHTML = '';
      return true;
    }
    let removed = false;
    Array.from(reportHost.children || []).forEach(node => {
      if(isReportingNode(node)){
        reportHost.removeChild(node);
        removed = true;
      }
    });
    return removed;
  };

  reporting.capturePanelHtml = function capturePanelHtml(target){
    if(!target || target.nodeType !== 1){
      return { resultsHtml: null, reportHtml: null };
    }
    const reportHost = resolveReportingHost(target);
    const resultsHtmlFromTarget = () => {
      const html = typeof target.innerHTML === 'string' ? target.innerHTML : '';
      return html || null;
    };
    if(reportHost && reportHost !== target){
      const reportHtml = reportHost.parentNode === target && typeof reportHost.innerHTML === 'string' && reportHost.innerHTML
        ? reportHost.innerHTML
        : null;
      if(reportHost.parentNode === target){
        const documentRef = target.ownerDocument || global.document;
        const placeholder = documentRef?.createComment ? documentRef.createComment('stats-report-host') : null;
        if(placeholder){
          target.replaceChild(placeholder, reportHost);
          const resultsHtml = resultsHtmlFromTarget();
          placeholder.parentNode?.replaceChild?.(reportHost, placeholder);
          return { resultsHtml, reportHtml };
        }
      }
      return { resultsHtml: resultsHtmlFromTarget(), reportHtml };
    }
    return { resultsHtml: resultsHtmlFromTarget(), reportHtml: null };
  };

  reporting.normalizeSavedPanelHtml = function normalizeSavedPanelHtml(saved){
    const source = saved && typeof saved === 'object' ? saved : {};
    const normalized = {
      resultsHtml: typeof source.resultsHtml === 'string' && source.resultsHtml ? source.resultsHtml : null,
      reportHtml: typeof source.reportHtml === 'string' && source.reportHtml ? source.reportHtml : null,
      legacyEmbeddedReport: false
    };
    if(normalized.reportHtml || !normalized.resultsHtml || !global.document?.createElement){
      return normalized;
    }
    if(!normalized.resultsHtml.includes('stats-report-panel')){
      return normalized;
    }
    const probe = global.document.createElement('div');
    probe.innerHTML = normalized.resultsHtml;
    const reportHost = global.document.createElement('div');
    const reportNodes = Array.from(probe.children || []).filter(isReportingNode);
    if(!reportNodes.length){
      return normalized;
    }
    reportNodes.forEach(node => {
      reportHost.appendChild(node);
    });
    normalized.resultsHtml = probe.innerHTML || null;
    normalized.reportHtml = reportHost.innerHTML || null;
    normalized.legacyEmbeddedReport = true;
    return normalized;
  };

  reporting.restorePanelHtml = function restorePanelHtml(target, saved, options = {}){
    if(!target || target.nodeType !== 1){
      return { restoredMain: false, restoredReport: false };
    }
    const normalized = reporting.normalizeSavedPanelHtml(saved);
    let restoredMain = false;
    try{
      target.innerHTML = normalized.resultsHtml || '';
      restoredMain = normalized.resultsHtml != null;
    }catch(err){
      target.textContent = normalized.resultsHtml != null ? String(normalized.resultsHtml) : '';
      restoredMain = normalized.resultsHtml != null;
    }
    let reportHost = null;
    if(typeof options.ensureReportHost === 'function'){
      reportHost = options.ensureReportHost();
    }else{
      reportHost = resolveReportingHost(target);
      if(reportHost && reportHost !== target && !reportHost.isConnected && typeof target.appendChild === 'function'){
        target.appendChild(reportHost);
      }
    }
    let restoredReport = false;
    if(reportHost && reportHost !== target){
      reportHost.innerHTML = normalized.reportHtml || '';
      restoredReport = normalized.reportHtml != null;
    }
    if(typeof reporting.pinReportHostLast === 'function'){
      reporting.pinReportHostLast(target);
    }
    return {
      restoredMain,
      restoredReport,
      legacyEmbeddedReport: !!normalized.legacyEmbeddedReport
    };
  };

  function findDirectChildByClass(parent, className){
    if(!parent || !className){
      return null;
    }
    const children = Array.from(parent.children || []);
    for(let index = 0; index < children.length; index += 1){
      const child = children[index];
      if(child?.classList?.contains(className)){
        return child;
      }
    }
    return null;
  }

  function panelHasEnhanceableContent(target){
    if(!target || typeof target.querySelector !== 'function'){
      return false;
    }
    return !!target.querySelector('.stats-table-card, table, .stats-report-panel, .stats-assumption-container');
  }

  function suppressThresholdControlsForPanel(target){
    return !!(target && (target.id === 'surfaceStatsSummary' || target.id === 'pcaStatsResults'));
  }

  function ensurePanelScaffold(target, state){
    if(!target || !target.ownerDocument){
      return null;
    }
    const documentRef = target.ownerDocument;
    const suppressThresholdControls = suppressThresholdControlsForPanel(target);
    let controls = findDirectChildByClass(target, 'stats-significance-controls');
    if(suppressThresholdControls){
      if(controls && controls.parentNode){
        controls.parentNode.removeChild(controls);
      }
      controls = null;
    }else if(!controls){
      controls = documentRef.createElement('div');
      controls.className = 'stats-significance-controls';
      controls.innerHTML = '<label class="stats-significance-controls__label">Significance threshold (p \u2264) <input type="number" class="stats-significance-controls__input" min="0.000001" max="1" step="0.0001" data-undo-ignore="1" /></label><span class="stats-significance-controls__hint">Applies when p-values are present.</span><span class="stats-significance-controls__extra"></span>';
      target.insertBefore(controls, target.firstChild || null);
      statsReportingDebug('createSignificanceControls', { id: target.id || null });
    }
    const thresholdInput = controls ? controls.querySelector('.stats-significance-controls__input') : null;
    if(thresholdInput){
      thresholdInput.value = String(sharedSignificanceThreshold);
      if(state.thresholdInputEl !== thresholdInput){
        thresholdInput.addEventListener('change', () => {
          reporting.setSignificanceThreshold(thresholdInput.value, { source: target.id || null });
        });
        thresholdInput.addEventListener('blur', () => {
          thresholdInput.value = String(reporting.getSignificanceThreshold());
        });
        state.thresholdInputEl = thresholdInput;
      }
    }
    if(controls){
      let extraControls = controls.querySelector('.stats-significance-controls__extra');
      if(!extraControls){
        extraControls = documentRef.createElement('span');
        extraControls.className = 'stats-significance-controls__extra';
        controls.appendChild(extraControls);
      }
      if(extraControls){
        extraControls.textContent = '';
        const extraFactory = typeof target.__statsExtraControlFactory === 'function'
          ? target.__statsExtraControlFactory
          : ((context) => createDefaultPValueFormatControl(context.document, context.target));
        const extraNode = extraFactory ? extraFactory({ document: documentRef, target, controls }) : null;
        if(extraNode){
          extraControls.appendChild(extraNode);
          extraControls.hidden = false;
        }else{
          extraControls.hidden = true;
        }
      }
    }
    let main = findDirectChildByClass(target, 'stats-results-main');
    if(!main){
      main = documentRef.createElement('div');
      main.className = 'stats-results-main';
      target.appendChild(main);
    }
    let advancedPanel = findDirectChildByClass(target, 'stats-results-advanced-panel');
    if(!advancedPanel){
      advancedPanel = documentRef.createElement('details');
      advancedPanel.className = 'stats-results-advanced-panel';
      advancedPanel.innerHTML = '<summary>Advanced statistics</summary><div class="stats-results-advanced-panel__body"></div>';
      target.appendChild(advancedPanel);
      statsReportingDebug('createAdvancedPanel', { id: target.id || null });
    }
    if(main.nextSibling !== advancedPanel){
      target.insertBefore(advancedPanel, main.nextSibling);
    }
    const advancedBody = findDirectChildByClass(advancedPanel, 'stats-results-advanced-panel__body');
    if(typeof reporting.pinReportHostLast === 'function'){
      reporting.pinReportHostLast(target);
    }
    return {
      controls,
      thresholdInput,
      hint: controls ? controls.querySelector('.stats-significance-controls__hint') : null,
      main,
      advancedPanel,
      advancedBody
    };
  }

  function redistributePanelNodes(target, scaffold){
    if(!target || !scaffold?.main || !scaffold?.advancedBody){
      return;
    }
    const candidates = [];
    const reportingHost = resolveReportingHost(target);
    const pushCandidate = node => {
      if(!node){
        return;
      }
      if(node === scaffold.controls || node === scaffold.main || node === scaffold.advancedPanel || node === reportingHost){
        return;
      }
      if(node.nodeType === 3){
        if(!String(node.textContent || '').trim()){
          return;
        }
        candidates.push(node);
        return;
      }
      if(node.nodeType !== 1){
        return;
      }
      candidates.push(node);
    };
    Array.from(target.childNodes).forEach(pushCandidate);
    Array.from(scaffold.main.childNodes).forEach(pushCandidate);
    Array.from(scaffold.advancedBody.childNodes).forEach(pushCandidate);
    const unique = Array.from(new Set(candidates));
    const reportingNodes = [];
    unique.forEach(node => {
      if(isReportingNode(node)){
        reportingNodes.push(node);
        return;
      }
      const destination = isAdvancedNode(node) ? scaffold.advancedBody : scaffold.main;
      destination.appendChild(node);
    });
    reportingNodes.forEach(node => {
      if(reportingHost && typeof reportingHost.appendChild === 'function'){
        reportingHost.appendChild(node);
      }
    });
    scaffold.advancedPanel.hidden = scaffold.advancedBody.childNodes.length === 0;
    scaffold.advancedPanel.setAttribute('aria-hidden', scaffold.advancedPanel.hidden ? 'true' : 'false');
  }

  function applyPanelEnhancements(target, reason){
    if(!target){
      return;
    }
    const state = panelEnhancerState.get(target);
    if(!state){
      return;
    }
    if(state.applying){
      return;
    }
    state.applying = true;
    state.mutationSuspended = true;
    try{
      const hasMain = !!findDirectChildByClass(target, 'stats-results-main');
      const hasAdvanced = !!findDirectChildByClass(target, 'stats-results-advanced-panel');
      if(!hasMain && !hasAdvanced && !panelHasEnhanceableContent(target)){
        return;
      }
      const scaffold = ensurePanelScaffold(target, state);
      if(!scaffold){
        return;
      }
      redistributePanelNodes(target, scaffold);
      if(typeof reporting.pinReportHostLast === 'function'){
        reporting.pinReportHostLast(target);
      }
      rewriteInlinePValueElements(target);
      const threshold = reporting.getSignificanceThreshold();
      let badgeCount = 0;
      const tables = target.querySelectorAll('table');
      tables.forEach(table => {
        rewriteTablePValueCells(table);
        badgeCount += annotateTablePValues(table, threshold);
      });
      if(scaffold.hint){
        scaffold.hint.textContent = badgeCount
          ? `Legend: NS, *, **, ***, **** (p <= ${formatThresholdLabel(threshold)})`
          : 'Applies when p-values are present.';
      }
      statsReportingDebug('enhancePanel', { id: target.id || null, reason: reason || 'manual', badgeCount, tables: tables.length });
    }finally{
      state.applying = false;
      if(typeof global.setTimeout === 'function'){
        global.setTimeout(() => {
          state.mutationSuspended = false;
        }, 0);
      }else{
        state.mutationSuspended = false;
      }
    }
  }

  function schedulePanelEnhancement(target, reason){
    if(!target){
      return;
    }
    let state = panelEnhancerState.get(target);
    if(!state){
      state = {
        applying: false,
        scheduled: false,
        thresholdInputEl: null,
        mutationSuspended: false,
        observer: null
      };
      panelEnhancerState.set(target, state);
    }
    if(state.scheduled){
      return;
    }
    state.scheduled = true;
    const runner = () => {
      state.scheduled = false;
      applyPanelEnhancements(target, reason);
    };
    if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(runner);
    }else{
      global.setTimeout(runner, 0);
    }
  }

  function observeStatsPanel(target){
    if(!target || panelEnhancerState.get(target)?.observer){
      return;
    }
    const state = panelEnhancerState.get(target) || {
      applying: false,
      scheduled: false,
      thresholdInputEl: null,
      mutationSuspended: false,
      observer: null
    };
    if(typeof MutationObserver !== 'function'){
      panelEnhancerState.set(target, state);
      enhancedStatsPanels.add(target);
      schedulePanelEnhancement(target, 'observe-init-no-observer');
      return;
    }
    const observer = new MutationObserver(() => {
      if(state.applying || state.mutationSuspended){
        return;
      }
      schedulePanelEnhancement(target, 'mutation');
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    state.observer = observer;
    panelEnhancerState.set(target, state);
    enhancedStatsPanels.add(target);
    schedulePanelEnhancement(target, 'observe-init');
  }

  function resolveStatsPanelsFromSelectors(selectors){
    const list = Array.isArray(selectors) ? selectors : STATS_PANEL_SELECTORS;
    if(!global.document){
      return [];
    }
    const found = [];
    list.forEach(selector => {
      if(typeof selector !== 'string' || !selector.trim()){
        return;
      }
      if(selector.startsWith('#')){
        const node = global.document.getElementById(selector.slice(1));
        if(node){
          found.push(node);
        }
        return;
      }
      const nodes = global.document.querySelectorAll(selector);
      nodes.forEach(node => found.push(node));
    });
    return Array.from(new Set(found));
  }

  function refreshAllEnhancedPanels(reason){
    enhancedStatsPanels.forEach(panel => {
      if(!panel || !panel.isConnected){
        return;
      }
      schedulePanelEnhancement(panel, reason || 'refresh');
    });
  }

  function nodeTouchesTrackedStatsPanel(node){
    if(!node || node.nodeType !== 1){
      return false;
    }
    const element = node;
    if(element.id && trackedStatsPanelIdSet.has(element.id)){
      return true;
    }
    if(typeof element.querySelector === 'function'){
      for(let index = 0; index < TRACKED_STATS_PANEL_IDS.length; index += 1){
        const panelId = TRACKED_STATS_PANEL_IDS[index];
        if(element.querySelector(`#${panelId}`)){
          return true;
        }
      }
    }
    return false;
  }

  function mutationTouchesTrackedStatsPanel(mutations){
    if(!Array.isArray(mutations) && !(mutations && typeof mutations.forEach === 'function')){
      return false;
    }
    let touched = false;
    mutations.forEach(mutation => {
      if(touched || !mutation){
        return;
      }
      const addedNodes = Array.from(mutation.addedNodes || []);
      const removedNodes = Array.from(mutation.removedNodes || []);
      for(let index = 0; index < addedNodes.length; index += 1){
        if(nodeTouchesTrackedStatsPanel(addedNodes[index])){
          touched = true;
          return;
        }
      }
      for(let index = 0; index < removedNodes.length; index += 1){
        if(nodeTouchesTrackedStatsPanel(removedNodes[index])){
          touched = true;
          return;
        }
      }
    });
    return touched;
  }

  function schedulePanelInstallRescan(reason){
    if(panelInstallRescanScheduled){
      return;
    }
    panelInstallRescanScheduled = true;
    const run = () => {
      panelInstallRescanScheduled = false;
      const panelCount = reporting.installEnhancedPanels();
      statsReportingDebug('rescanInstallEnhancedPanels', { reason: reason || 'mutation', panelCount });
    };
    if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(run);
      return;
    }
    if(typeof global.setTimeout === 'function'){
      global.setTimeout(run, 0);
      return;
    }
    run();
  }

  function ensurePanelInstallRescanObserver(){
    if(panelInstallRescanObserver || typeof MutationObserver !== 'function' || !global.document){
      return;
    }
    const root = global.document.body || global.document.documentElement;
    if(!root){
      return;
    }
    panelInstallRescanObserver = new MutationObserver(mutations => {
      if(mutationTouchesTrackedStatsPanel(mutations)){
        schedulePanelInstallRescan('tracked-panel-mutation');
      }
    });
    panelInstallRescanObserver.observe(root, { childList: true, subtree: true });
    statsReportingDebug('installRescanObserverReady', { trackedPanels: TRACKED_STATS_PANEL_IDS.length });
  }

  reporting.getSignificanceThreshold = function getSignificanceThreshold(){
    return sharedSignificanceThreshold;
  };

  reporting.getPValueFormatScientific = function getPValueFormatScientific(){
    return sharedPValueScientific;
  };

  reporting.setPValueFormatScientific = function setPValueFormatScientific(value, options){
    const previous = sharedPValueScientific;
    const next = sanitizePValueScientific(value, previous);
    sharedPValueScientific = next;
    persistPValueScientific(next);
    statsReportingDebug('setPValueFormatScientific', { previous, next, source: options?.source || null });
    try{
      if(typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function'){
        global.dispatchEvent(new global.CustomEvent('venn:stats-pvalue-format-change', {
          detail: { scientific: next, source: options?.source || null }
        }));
      }
    }catch(err){
      statsReportingDebug('dispatchPValueFormatEventError', { message: err?.message || String(err) });
    }
    refreshAllEnhancedPanels(previous === next ? 'pvalue-format-sync' : 'pvalue-format-change');
    return next;
  };

  reporting.setSignificanceThreshold = function setSignificanceThreshold(value, options){
    const previous = sharedSignificanceThreshold;
    const next = sanitizeSignificanceThreshold(value, previous);
    sharedSignificanceThreshold = next;
    persistSignificanceThreshold(next);
    if(previous !== next){
      statsReportingDebug('setSignificanceThreshold', { previous, next, source: options?.source || null });
      refreshAllEnhancedPanels('threshold-change');
    }else{
      refreshAllEnhancedPanels('threshold-sync');
    }
    return next;
  };

  reporting.getSignificanceToken = function getSignificanceToken(pValue, threshold){
    const parsed = Number.isFinite(Number(pValue))
      ? { value: Number(pValue), operator: '=' }
      : null;
    return resolveSignificanceToken(parsed, sanitizeSignificanceThreshold(threshold, sharedSignificanceThreshold));
  };

  reporting.refreshEnhancedPanels = function refreshEnhancedPanels(reason){
    refreshAllEnhancedPanels(reason || 'manual');
  };

  reporting.installEnhancedPanels = function installEnhancedPanels(options){
    if(!global.document){
      return 0;
    }
    const panels = resolveStatsPanelsFromSelectors(options?.selectors || STATS_PANEL_SELECTORS);
    panels.forEach(panel => observeStatsPanel(panel));
    statsReportingDebug('installEnhancedPanels', { panelCount: panels.length });
    return panels.length;
  };

  function autoInstallEnhancedPanels(){
    if(panelsInstallAttempted){
      ensurePanelInstallRescanObserver();
      return;
    }
    panelsInstallAttempted = true;
    reporting.installEnhancedPanels();
    ensurePanelInstallRescanObserver();
  }

  if(global.document){
    if(global.document.readyState === 'loading'){
      global.document.addEventListener('DOMContentLoaded', autoInstallEnhancedPanels, { once: true });
    }else{
      autoInstallEnhancedPanels();
    }
  }

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
