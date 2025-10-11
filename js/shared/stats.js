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
