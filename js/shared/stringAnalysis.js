(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const stringAnalysis = Shared.stringAnalysis = Shared.stringAnalysis || {};

  const API_BASE = 'https://string-db.org/api/';
  const SPECIES_MAP = {
    hsapiens: '9606',
    mmusculus: '10090',
    dmelanogaster: '7227',
    celegans: '6239'
  };

  function debug(step, detail) {
    console.debug('Debug: stringAnalysis ' + step, detail || {});
  }

  stringAnalysis.resolveSpeciesCode = function resolveSpeciesCode(organism, fallback) {
    if (organism && SPECIES_MAP[organism]) {
      return SPECIES_MAP[organism];
    }
    if (fallback) {
      return fallback;
    }
    return '9606';
  };

  function buildParams(options = {}) {
    const params = new URLSearchParams();
    const genes = Array.isArray(options.genes) ? options.genes : [];
    if (genes.length) {
      params.set('identifiers', genes.join('\n'));
    }
    if (options.species) {
      params.set('species', options.species);
    }
    if (options.networkType) {
      params.set('network_type', options.networkType);
    }
    if (options.edgeMeaning) {
      params.set('network_flavor', options.edgeMeaning);
    }
    if (Array.isArray(options.sources) && options.sources.length) {
      params.set('sources', options.sources.join('%0d'));
    }
    return params;
  }

  stringAnalysis.buildParams = buildParams;

  stringAnalysis.fetchNetwork = async function fetchNetwork(options = {}) {
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('STRING network fetch requires a fetch implementation');
    }
    const params = buildParams(options);
    const url = API_BASE + 'svg/network?' + params.toString();
    try {
      debug('fetchNetwork request', {
        url,
        geneCount: Array.isArray(options.genes) ? options.genes.length : 0,
        species: options.species
      });
      const resp = await fetchImpl(url);
      if (!resp.ok) {
        throw new Error('STRING network HTTP ' + resp.status);
      }
      const svgText = await resp.text();
      debug('fetchNetwork success', { svgLength: svgText.length });
      return { svg: svgText, url, params };
    } catch (err) {
      debug('fetchNetwork error', { message: err && err.message });
      throw err;
    }
  };

  stringAnalysis.fetchEnrichment = async function fetchEnrichment(options = {}) {
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('STRING enrichment fetch requires a fetch implementation');
    }
    const params = buildParams(options);
    const url = API_BASE + 'json/enrichment?' + params.toString();
    try {
      debug('fetchEnrichment request', {
        url,
        geneCount: Array.isArray(options.genes) ? options.genes.length : 0,
        species: options.species
      });
      const resp = await fetchImpl(url);
      if (!resp.ok) {
        throw new Error('STRING API HTTP ' + resp.status);
      }
      const data = await resp.json();
      const items = Array.isArray(data) ? data : [];
      debug('fetchEnrichment success', { itemCount: items.length });
      return { items, raw: data, url, params };
    } catch (err) {
      debug('fetchEnrichment error', { message: err && err.message });
      throw err;
    }
  };
})(window);
