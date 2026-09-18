const fs = require('fs');
const path = require('path');

const driverPath = path.resolve(__dirname, '..', '..', 'e2e', 'helpers', 'ownerPayloadDriver.js');
const source = fs.readFileSync(driverPath, 'utf8');

function functionBody(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not locate harness contract markers: ${startMarker} -> ${endMarker}`);
  }
  return source.slice(start, end);
}

describe('owner-payload driver persistence contract', () => {
  test('owner persistence treats the session return value as a change indicator, not success/failure', () => {
    const body = functionBody('function persistOwner(', 'function captureCanonicalPayload(');

    expect(body).toContain('persist(tab, {');
    expect(body).not.toMatch(/persisted\s*===\s*false/);
    expect(body).not.toMatch(/if\s*\([^)]*persist[^)]*===\s*false/);
    expect(body).toContain('requireOwnerTab(tabId, type, `${reason}:post-persist`)');
    expect(body).toContain("if(!persistedTab.payload || typeof persistedTab.payload !== 'object')");
  });

  test('parameter discovery normalizes sparse hydration defaults once through owner persistence', () => {
    const body = functionBody('async function discover(', 'function describeError(');

    expect(body).toContain('captureCanonicalPayload(type, tabId');
    expect(body).toContain('persistOwner(type, tabId');
  });

  test('parameter batches share one archive/reopen instead of archiving each leaf', () => {
    const persistence = functionBody('api.runPersistenceMatrix = async function runPersistenceMatrix(', 'api.runSameTypeIsolation = async function runSameTypeIsolation(');
    const sameType = functionBody('api.runSameTypeIsolation = async function runSameTypeIsolation(', 'api.USER_ROOTS = USER_ROOTS;');

    expect((persistence.match(/buildArchiveBlob\(/g) || [])).toHaveLength(1);
    expect((persistence.match(/reopenArchiveBlob\(/g) || [])).toHaveLength(1);
    expect((sameType.match(/buildArchiveBlob\(/g) || [])).toHaveLength(1);
    expect((sameType.match(/reopenArchiveBlob\(/g) || [])).toHaveLength(1);
    expect(source).toContain("if(path[0] === 'config' && path[1] === 'axis') return 'config.axis';");
    expect(source).toContain('function buildParameterBatches(parameters, type)');
    expect(source).toContain("return String(path[0] || parameter.key || 'parameters');");
  });

  test('ordinary parameter hydration suppresses redraw and statistics recomputation', () => {
    const body = functionBody('async function applyPayload(', 'function controlTokens(');

    expect(body).toContain('skipDraw: options.draw !== true');
    expect(body).toContain('suppressStatsRecompute: options.draw !== true');
    expect(body).toContain('passiveControls: options.draw !== true');
  });

  test('DOM witnesses require semantic ownership instead of coincidental unique transitions', () => {
    const body = functionBody('function findWitness(', 'async function captureBatchState(');

    expect(body).toContain('observableSemanticScore(key, parameter.path)');
    expect(body).not.toContain('if(exactTransitions.length === 1)');
    expect(body).toContain('Require a semantic association');
  });

  test('parameter discovery requires an explicit component mutation plan', () => {
    const body = functionBody('async function discover(', 'function describeError(');

    expect(body).toContain('explicit mutation plan is required');
    expect(body).toContain('discoverExplicitParameters(type, baseline, options.mutationPlan)');
    expect(body).not.toContain('collectLeaves');
    expect(body).not.toContain('buildAlternative');
  });

  test('matrix entry points reject missing mutation plans instead of using a legacy path', () => {
    const persistence = functionBody('api.runPersistenceMatrix = async function runPersistenceMatrix(', 'api.runSameTypeIsolation = async function runSameTypeIsolation(');
    const sameType = functionBody('api.runSameTypeIsolation = async function runSameTypeIsolation(', 'api.USER_ROOTS = USER_ROOTS;');

    expect(persistence).toContain('explicit mutation plan is required for persistence matrix');
    expect(sameType).toContain('explicit mutation plan is required for same-type isolation');
    expect(sameType).not.toContain('legacy discovery path');
    expect(sameType).not.toContain('mutationPlan ? clone');
  });

  test('component-specific applicability is declared by the mutation catalog', () => {
    const body = functionBody('async function discover(', 'function describeError(');

    expect(body).toContain('options.mutationPlan');
    expect(body).toContain('mutationPlanId');
    expect(body).not.toContain('inactive-or-structural');
    expect(body).not.toContain('inactive-survival-advisor-answer');
  });

  test('active shared-toolbar controls participate in exact DOM witness mapping', () => {
    const controlBody = functionBody('function domObservableControlEntries(', 'function flattenPrimitives(');
    const domBody = functionBody('function captureDomObservables(', 'function flattenPrimitives(');

    expect(controlBody).toContain('parameterControlCandidates(root)');
    expect(controlBody).toContain('getClientRects?.().length > 0');
    expect(domBody).toContain('domObservableControlEntries(root)');
    expect(domBody).toContain("external ? 'active-ui:' : ''");
    expect(domBody).toContain('data-parameter-p-value-scientific');
  });

  test('owner observation accepts the normalized getSessionForTab hook', () => {
    const body = functionBody('function captureOwnerObservables(', 'function findWitness(');

    expect(body).toContain('__testHooks?.getSession?.(tabId)');
    expect(body).toContain('__testHooks?.getSessionForTab?.(tabId)');
  });

  test('component discovery does not reconstruct conditional state from payload leaves', () => {
    const body = functionBody('async function discover(', 'function describeError(');

    expect(body).toContain('discoverExplicitParameters(type, baseline, options.mutationPlan)');
    expect(body).not.toContain('collectLeaves');
    expect(body).not.toContain('parameters.forEach(parameter => {');
  });

  test('normalizing and mutually dependent settings are isolated into deterministic batches', () => {
    const body = functionBody('function parameterBatchKey(', 'function buildParameterBatches(');

    expect(body).toContain("if(type === 'box')");
    expect(body).toContain("return 'box.stats-compatible'");
    expect(body).toContain('return `box.stats-${field.toLowerCase()}`');
    expect(body).toContain("config.heatmap-use-absolute");
    expect(body).toContain("if(/^seriesLayout$/i.test(field)) return pathKey(path.slice(0, 3));");
    expect(body).toContain("if(path[0] === 'meta' && path[1] === 'statsReporting')");
  });

});
