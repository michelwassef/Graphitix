const fs = require('fs');
const path = require('path');

const harnessPath = path.resolve(__dirname, 'tab-isolation-regression', 'parameter-harness.js');
const source = fs.readFileSync(harnessPath, 'utf8');

function functionBody(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not locate harness contract markers: ${startMarker} -> ${endMarker}`);
  }
  return source.slice(start, end);
}

describe('parameter isolation harness persistence contract', () => {
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

  test('primitive types and explicit enums win before generic select fallback', () => {
    const body = functionBody('function buildAlternative(', 'function isPersistentParameterControl(');
    const selectIndex = body.indexOf('if(el instanceof global.HTMLSelectElement)');
    const numericIndex = body.indexOf("if(typeof current === 'number' && Number.isFinite(current))");
    const booleanIndex = body.indexOf("if(typeof current === 'boolean')");

    expect(selectIndex).toBeGreaterThan(-1);
    expect(numericIndex).toBeGreaterThan(-1);
    expect(booleanIndex).toBeGreaterThan(-1);
    expect(numericIndex).toBeLessThan(selectIndex);
    expect(booleanIndex).toBeLessThan(selectIndex);
    expect(body).toContain("key === 'config.stats.posthoc'");
    expect(body).toContain("source: 'select'");
  });

  test('component-specific applicability excludes structural and forced state without dropping active controls', () => {
    const body = functionBody('async function discover(', 'function describeError(');

    expect(body).toContain("if(type === 'hist')");
    expect(body).toContain('inactive-or-structural-hist-state');
    expect(body).toContain("if(type === 'pie')");
    expect(body).toContain('derived-pie-stats-compatibility-projection');
    expect(body).toContain('forced-pie-aspect-state');
    expect(body).toContain('inactive-survival-advisor-answer');
  });

  test('active shared-toolbar controls participate in exact DOM witness mapping', () => {
    const controlBody = functionBody('function domObservableControlEntries(', 'function readControlPrimitive(');
    const domBody = functionBody('function controlObservableKey(', 'function flattenPrimitives(');

    expect(controlBody).toContain('parameterControlCandidates(root)');
    expect(controlBody).toContain('getClientRects?.().length > 0');
    expect(domBody).toContain('domObservableControlEntries(root)');
    expect(domBody).toContain("entry.external ? 'active-ui:' : ''");
    expect(domBody).toContain('data-parameter-p-value-scientific');
  });

  test('owner observation accepts the normalized getSessionForTab hook', () => {
    const body = functionBody('function captureOwnerObservables(', 'function findWitness(');

    expect(body).toContain('__testHooks?.getSession?.(tabId)');
    expect(body).toContain('__testHooks?.getSessionForTab?.(tabId)');
  });

  test('conditional component state is excluded until its controlling mode is active', () => {
    const body = functionBody('async function discover(', 'function describeError(');

    expect(body).toContain("/^style\\.upset(?:\\.|$)/i");
    expect(body).toContain('inactive-scatter-stats-overlay-state');
    expect(body).toContain("if(pcaMethod !== 'tsne')");
    expect(body).toContain("if(pcaMethod !== 'umap')");
    expect(body).toContain("seriesLayout?.display || 'overlay'");
    expect(body).toContain('inactive-shared-stats-reporting-control');
    expect(body).toContain("baseline?.config?.logScale !== true");
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
