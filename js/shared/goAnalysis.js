(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const goAnalysis = Shared.goAnalysis = Shared.goAnalysis || {};

  const GO_ENDPOINT = 'https://biit.cs.ut.ee/gprofiler/api/gost/profile/';

  function debug(step, payload) {
    console.debug('Debug: goAnalysis ' + step, payload || {});
  }

  function buildPayload(options) {
    const payload = {
      organism: options.organism,
      query: options.genes
    };
    if (Array.isArray(options.sources) && options.sources.length) {
      payload.sources = options.sources;
    }
    if (Array.isArray(options.background) && options.background.length) {
      payload.background = options.background;
      payload.domain_scope = options.domainScope || 'custom';
    }
    return payload;
  }

  goAnalysis.profile = async function profile(options = {}) {
    const genes = Array.isArray(options.genes) ? options.genes : [];
    if (!genes.length) {
      debug('profile skip', { reason: 'no genes supplied' });
      return { raw: null, result: [] };
    }
    if (!options.organism) {
      debug('profile skip', { reason: 'no organism supplied' });
      throw new Error('GO analysis requires an organism code');
    }
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('GO analysis profile requires a fetch implementation');
    }
    const payload = buildPayload({
      organism: options.organism,
      genes,
      sources: options.sources,
      background: options.background,
      domainScope: options.domainScope
    });
    try {
      debug('profile request', {
        organism: options.organism,
        geneCount: genes.length,
        sourceCount: Array.isArray(options.sources) ? options.sources.length : 0
      });
      const resp = await fetchImpl(GO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        throw new Error('GO API HTTP ' + resp.status);
      }
      const data = await resp.json();
      const rawResult = Array.isArray(data.result) ? data.result : [];
      const sources = Array.isArray(options.sources) && options.sources.length ? options.sources : null;
      const filtered = sources ? rawResult.filter(r => sources.includes(r.source)) : rawResult;
      debug('profile success', { resultCount: filtered.length });
      return { raw: data, result: filtered };
    } catch (err) {
      debug('profile error', { message: err && err.message });
      throw err;
    }
  };
})(window);
