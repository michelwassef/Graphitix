(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.GraphitixParameterAssertions = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const getAtPath = (object, path) => path.reduce((value, part) => value == null ? undefined : value[part], object);

  function normalizeComparable(value){
    if(value === null || value === undefined) return value;
    if(typeof value === 'boolean') return value;
    if(typeof value === 'number') return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
    if(typeof value === 'string'){
      const trimmed = value.trim();
      if(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)){
        const numeric = Number(trimmed);
        if(Number.isFinite(numeric)) return Number(numeric.toPrecision(12));
      }
      if(/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed.toLowerCase();
      return value;
    }
    return value;
  }

  function equivalent(actual, expected){
    return same(normalizeComparable(actual), normalizeComparable(expected));
  }

  function assertParameterState(state, parameter, expected, witness, label, semanticScore = () => 0){
    const failures = [];
    const sizingMatch = parameter.key.match(/^meta\.graphSizing\.display\.(widthPx|heightPx|aspectLocked|proportionalFontResize)$/i);
    // Geometry is archived as tab layout state. The payload copy is a live
    // convenience and may be omitted after restore when layout state is present.
    const payloadValue = sizingMatch
      ? clone(state.owner?.[`layoutSizing.${sizingMatch[1]}`])
      : clone(getAtPath(state.payload, parameter.path));
    const domValue = witness?.domKey ? clone(state.dom?.[witness.domKey]) : undefined;
    const ownerValue = witness?.ownerKey ? clone(state.owner?.[witness.ownerKey]) : undefined;
    if(!equivalent(payloadValue, expected)) failures.push(`${label}: canonical payload value drifted`);
    if(parameter.requiresDomWitness !== false){
      if(!witness?.domKey) failures.push(`${label}: no exact parameter-associated DOM projection witness`);
      else if(!equivalent(domValue, expected)) failures.push(`${label}: DOM exact value drifted`);
    }
    if(!witness?.ownerKey) failures.push(`${label}: no exact parameter-associated owner-session witness`);
    else if(!equivalent(ownerValue, expected)) failures.push(`${label}: owner session exact value drifted`);
    return {
      snapshot: {
        phase: label,
        tabId: state.tabId,
        payloadValue,
        domValue,
        ownerValue,
        domCandidates: witness?.domKey ? undefined : Object.keys(state.dom || {})
          .map(key => ({ key, score: semanticScore(key, parameter.path), value: clone(state.dom[key]) }))
          .filter(item => item.score > 0)
          .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
          .slice(0, 6),
        ownerCandidates: witness?.ownerKey ? undefined : Object.keys(state.owner || {})
          .map(key => ({ key, score: semanticScore(key, parameter.path), value: clone(state.owner[key]) }))
          .filter(item => item.score > 0)
          .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
          .slice(0, 8)
      },
      failures
    };
  }

  function createParameterResults(parameters){
    return new Map(parameters.map(parameter => [parameter.key, {
      mutationId: parameter.id || null,
      kind: parameter.kind || null,
      parameter: parameter.key,
      before: clone(parameter.before),
      after: clone(parameter.after),
      mutationSource: parameter.mutationSource,
      semanticFingerprint: Array.isArray(parameter.semanticFingerprint) ? parameter.semanticFingerprint.slice() : [],
      witnesses: { domKey: null, ownerKey: null },
      snapshots: [],
      failures: []
    }]));
  }

  function recordParameterAssertion(results, parameter, state, expected, witness, label, semanticScore){
    const result = results.get(parameter.key);
    const assertion = assertParameterState(state, parameter, expected, witness, label, semanticScore);
    result.snapshots.push(assertion.snapshot);
    result.failures.push(...assertion.failures);
  }

  function collectResultFailures(results){
    const failures = [];
    results.forEach(result => {
      failures.push(...result.failures.map(message => `${result.parameter}: ${message}`));
    });
    return failures;
  }

  return Object.freeze({
    assertParameterState,
    createParameterResults,
    recordParameterAssertion,
    collectResultFailures
  });
});
