(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const uniprot = Shared.uniprot = Shared.uniprot || {};

  const cache = new Map();

  function buildReviewedSearchUrl(gene) {
    const query = 'gene_exact:' + encodeURIComponent(gene) + '+AND+reviewed:true';
    return 'https://www.uniprot.org/uniprotkb?query=' + query;
  }

  function buildEntryLookupUrl(gene, organismTaxId) {
    const encodedGene = encodeURIComponent(gene);
    let query = 'gene_exact:' + encodedGene + '+AND+reviewed:true';
    if (organismTaxId) {
      query += '+AND+organism_id:' + encodeURIComponent(organismTaxId);
    }
    return 'https://rest.uniprot.org/uniprotkb/search?query=' + query + '&fields=accession&format=json&size=1';
  }

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

  uniprot.resolveEntryUrl = async function resolveEntryUrl(options = {}) {
    const gene = options.gene;
    if (!gene) {
      debug('resolveEntryUrl skip', { reason: 'missing gene' });
      return { accession: null, entryUrl: null, fallbackUrl: null, queryUrl: null };
    }
    const geneValue = String(gene);
    const normalizedGene = geneValue.toUpperCase();
    const fallbackUrl = buildReviewedSearchUrl(geneValue);
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== 'function') {
      debug('resolveEntryUrl missingFetch', { gene: normalizedGene });
      return { accession: null, entryUrl: fallbackUrl, fallbackUrl, queryUrl: null };
    }
    const queryUrl = buildEntryLookupUrl(geneValue, options.organismTaxId);
    try {
      debug('resolveEntryUrl request', { gene: normalizedGene, organismTaxId: options.organismTaxId, queryUrl });
      const resp = await fetchImpl(queryUrl);
      if (!resp.ok) {
        debug('resolveEntryUrl httpError', { gene: normalizedGene, status: resp.status });
        return { accession: null, entryUrl: fallbackUrl, fallbackUrl, queryUrl };
      }
      const data = await resp.json();
      const accession = data.results?.[0]?.primaryAccession || null;
      const entryUrl = accession ? `https://www.uniprot.org/uniprotkb/${accession}/entry` : fallbackUrl;
      debug('resolveEntryUrl success', { gene: normalizedGene, hasAccession: Boolean(accession) });
      return { accession, entryUrl, fallbackUrl, queryUrl };
    } catch (err) {
      debug('resolveEntryUrl error', { gene: normalizedGene, message: err && err.message });
      return { accession: null, entryUrl: fallbackUrl, fallbackUrl, queryUrl };
    }
  };
})(window);
