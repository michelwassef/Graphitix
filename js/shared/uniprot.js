(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const uniprot = Shared.uniprot = Shared.uniprot || {};

  const cache = new Map();

  function debug(step, data) {
    console.debug('Debug: uniprot ' + step, data || {});
  }

  function buildFunctionUrl(gene) {
    const query = gene.toUpperCase();
    return `https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${encodeURIComponent(query)}+AND+reviewed:true&fields=cc_function&format=json&size=1`;
  }

  uniprot.fetchFunctionAnnotation = async function fetchFunctionAnnotation(gene, options = {}) {
    if (!gene) {
      debug('fetchFunctionAnnotation skip', { reason: 'empty gene' });
      return null;
    }
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== 'function') {
      console.warn('Shared.uniprot.fetchFunctionAnnotation requires a fetch implementation');
      return null;
    }
    const key = gene.toUpperCase();
    if (cache.has(key)) {
      debug('fetchFunctionAnnotation cacheHit', { gene: key });
      return cache.get(key);
    }
    const url = buildFunctionUrl(key);
    try {
      debug('fetchFunctionAnnotation request', { gene: key, url });
      const resp = await fetchImpl(url);
      if (!resp.ok) {
        debug('fetchFunctionAnnotation httpError', { gene: key, status: resp.status });
        cache.set(key, null);
        return null;
      }
      const data = await resp.json();
      const value = data.results?.[0]?.comments?.find(c => c.commentType === 'FUNCTION')?.texts?.[0]?.value || null;
      cache.set(key, value);
      debug('fetchFunctionAnnotation success', { gene: key, hasValue: Boolean(value) });
      return value;
    } catch (err) {
      debug('fetchFunctionAnnotation error', { gene: key, message: err && err.message });
      cache.set(key, null);
      return null;
    }
  };

  uniprot.clearCache = function clearCache() {
    cache.clear();
    debug('clearCache invoked', { size: cache.size });
  };
})(window);
