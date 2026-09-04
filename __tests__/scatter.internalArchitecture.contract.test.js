const fs = require('fs');
const path = require('path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8').replace(/\r\n/g, '\n');

function functionSource(source, name){
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = pattern.exec(source);
  if(!match){ return null; }
  const start = match.index;
  let index = source.indexOf('(', start);
  let parameterDepth = 0;
  let parameterQuote = null;
  let parameterEscaped = false;
  for(; index < source.length; index += 1){
    const ch = source[index];
    if(parameterQuote){
      if(parameterEscaped){ parameterEscaped = false; }
      else if(ch === '\\'){ parameterEscaped = true; }
      else if(ch === parameterQuote){ parameterQuote = null; }
      continue;
    }
    if(ch === '"' || ch === "'" || ch === '`'){
      parameterQuote = ch;
      continue;
    }
    if(ch === '('){ parameterDepth += 1; }
    else if(ch === ')'){
      parameterDepth -= 1;
      if(parameterDepth === 0){
        index = source.indexOf('{', index + 1);
        break;
      }
    }
  }
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for(; index < source.length; index += 1){
    const ch = source[index];
    const next = source[index + 1];
    if(lineComment){
      if(ch === '\n'){ lineComment = false; }
      continue;
    }
    if(blockComment){
      if(ch === '*' && next === '/'){
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if(quote){
      if(escaped){ escaped = false; }
      else if(ch === '\\'){ escaped = true; }
      else if(ch === quote){ quote = null; }
      continue;
    }
    if(ch === '/' && next === '/'){
      lineComment = true;
      index += 1;
      continue;
    }
    if(ch === '/' && next === '*'){
      blockComment = true;
      index += 1;
      continue;
    }
    if(ch === '"' || ch === "'" || ch === '`'){
      quote = ch;
      continue;
    }
    if(ch === '{'){ depth += 1; }
    if(ch === '}'){
      depth -= 1;
      if(depth === 0){ return source.slice(start, index + 1); }
    }
  }
  return null;
}

describe('Scatter internal architecture contract', () => {
  const scatter = read('js/components/scatter.js');
  const stats = read('js/shared/stats.js');
  const regression = read('js/shared/regression.js');
  const worker = read('js/workers/scatter.worker.js');

  test('drawScatter delegates renderer responsibilities to explicit stages', () => {
    const draw = functionSource(scatter, 'drawScatter');
    expect(draw).toBeTruthy();
    expect(draw.split('\n').length).toBeLessThanOrEqual(3000);
    for(const marker of [
      'renderScatter3dFrame({',
      'renderScatter2dAxes({',
      'renderScatter2dPointLayer({',
      'renderScatter2dLegend({',
      'renderScatter2dTextLayers({',
      'renderScatter2dStatsLayer({'
    ]){
      expect(draw).toContain(marker);
    }
  });

  test('extracted 2D axis renderer receives its owner session explicitly', () => {
    const draw = functionSource(scatter, 'drawScatter');
    const axes = functionSource(scatter, 'renderScatter2dAxes');
    expect(draw).toBeTruthy();
    expect(axes).toBeTruthy();
    expect(draw).toMatch(/renderScatter2dAxes\(\{[\s\S]*?ownerSession:\s*drawSession[\s\S]*?\}\);/);
    expect(axes).toContain('ownerSession');
    expect(axes).toContain('buildScatterAxisControlConfig(axis, ownerSession');
    expect(axes).not.toContain('buildScatterAxisControlConfig(axis, drawSession');
  });

  test('normal empty axis data is not reported as a user exclusion warning', () => {
    const draw = functionSource(scatter, 'drawScatter');
    expect(draw).toBeTruthy();
    expect(draw).toContain('hasExplicitAnalysisExclusions');
    expect(draw).toContain("debug('Debug: scatter draw skipped - axis data unavailable'");
    expect(draw).toContain("console.warn('Scatter draw cancelled - axis data unavailable after exclusions'");
    expect(draw).not.toContain("console.warn('Scatter draw cancelled - axis column excluded'");
  });

  test('large renderer details do not return to drawScatter', () => {
    const draw = functionSource(scatter, 'drawScatter');
    expect(draw).not.toContain('indexedCanvasPointBuckets.set(');
    expect(draw).not.toContain('appendScatterPointCanvasIndexedBucketsAsPaths(');
    expect(draw).not.toContain('minorTicksX.forEach(');
    expect(draw).not.toContain('legendRenderer.draw(svg,');
    expect(draw).not.toContain("infoText.dataset.scatterOverlay = 'stats'");
  });

  test('axis-title editing uses one canonical table-header write', () => {
    const update = functionSource(scatter, 'syncScatterAxisHeader');
    const textLayer = functionSource(scatter, 'renderScatter2dTextLayers');
    expect(update).toBeTruthy();
    expect(textLayer).toBeTruthy();
    expect((update.match(/\.setDataAtCell\s*\(/g) || [])).toHaveLength(1);
    expect(update).not.toMatch(/\.setData\s*\(|\.updateSettings\s*\(|gridApi\.setRowData/);
    expect(textLayer).toContain('syncScatterAxisHeader(axis, nextValue');
    expect(scatter).not.toContain('IMMEDIATE DEBUG');
    expect(scatter).not.toContain('Try multiple approaches');
    expect(scatter).not.toContain('JSON.parse(JSON.stringify(currentData))');
  });

  test('Canvas bucket rendering has one implementation per backend', () => {
    const canvas = functionSource(scatter, 'renderScatterPointCanvasBucketCollection');
    const vector = functionSource(scatter, 'appendScatterPointCanvasBucketCollectionAsPaths');
    const indexedCanvas = functionSource(scatter, 'renderScatterPointCanvasIndexedBuckets');
    const ordinaryCanvas = functionSource(scatter, 'renderScatterPointCanvasBuckets');
    const indexedVector = functionSource(scatter, 'appendScatterPointCanvasIndexedBucketsAsPaths');
    const ordinaryVector = functionSource(scatter, 'appendScatterPointCanvasBucketsAsPaths');
    expect(canvas).toBeTruthy();
    expect(vector).toBeTruthy();
    expect(indexedCanvas).toContain('renderScatterPointCanvasBucketCollection(');
    expect(ordinaryCanvas).toContain('renderScatterPointCanvasBucketCollection(');
    expect(indexedVector).toContain('appendScatterPointCanvasBucketCollectionAsPaths(');
    expect(ordinaryVector).toContain('appendScatterPointCanvasBucketCollectionAsPaths(');
  });

  test('statistics context construction is centralized', () => {
    expect(functionSource(scatter, 'buildScatterStatsContextPayload')).toBeTruthy();
    expect(functionSource(scatter, 'buildScatterSignificanceStatsContext')).toBeTruthy();
    const layer = functionSource(scatter, 'renderScatter2dStatsLayer');
    expect(layer).toContain('buildScatterStatsContextPayload({');
    expect(layer).toContain('buildScatterSignificanceStatsContext({');
  });

  test('statistical primitives use their shared statistical owners', () => {
    expect(stats).toContain('function correlationConfidenceInterval(');
    expect(stats).toContain('stats.correlationConfidenceInterval = correlationConfidenceInterval;');
    expect(regression).toContain('regressionTools.computeRunsTestFromResiduals = computeRunsTestFromResiduals;');
    expect(regression).toContain('regressionTools.computeInformationCriteria = computeInformationCriteria;');
    expect(scatter).toContain('Shared.stats?.correlationConfidenceInterval');
    expect(scatter).toContain('regressionTools.computeRunsTestFromResiduals');
    expect(scatter).toContain('regressionTools.computeInformationCriteria');
    expect(worker).toContain('stats?.correlationConfidenceInterval');
  });

  test('confirmed dead helpers and old local statistical formulas are absent', () => {
    for(const marker of [
      'clearScatterAsyncTimeout',
      'addAdvancedMetric',
      'invertScatterMatrix2x2',
      'computeScatterAicMetricsForLowess',
      'function computeScatterAicMetrics('
    ]){
      expect(scatter).not.toContain(marker);
    }
  });

  test('inactive same-component capture never reconstructs owner state from the live projection', () => {
    const activeCheck = functionSource(scatter, 'isScatterSessionActiveForModuleState');
    const remember = functionSource(scatter, 'rememberScatterOwnedRuntimeRecord');
    const statsCapture = functionSource(scatter, 'captureScatterSessionStatsState');
    const runtimeCapture = functionSource(scatter, 'captureRuntimeState');
    expect(activeCheck).toContain("canUseLiveProjection('scatter'");
    expect(activeCheck).toContain('projectedSession: projectedScatterSession');
    expect(activeCheck).toContain('root: scatterRoot || null');
    expect(activeCheck).not.toContain('resolvePayloadCaptureContext');
    expect(remember).toContain('const activeOwner =');
    expect(remember).toContain('if(activeOwner){');
    expect(remember).not.toContain('getScatterLiveNodeById(');
    expect(remember).toContain('record.stats = normalizeScatterOwnedStatsState(ownedState?.stats || record.stats);');
    expect(statsCapture).toContain('return normalizeScatterOwnedStatsState(shaped.state.stats || null);');
    expect(statsCapture).not.toContain('shaped.state.stats =');
    expect(statsCapture).not.toContain('captureScatterStatsPanelModel(existingStats.panelModel || null, shaped)');
    expect(scatter).not.toContain('syncScatterStatsSessionFromModule');
    expect(runtimeCapture).toContain('const canCaptureLive = !!targetSession && isScatterSessionActiveForModuleState(targetSession);');
    expect(runtimeCapture).toContain(':inactive-owned-runtime');
  });

  test('same-component passive activation rebinds the complete owner-scoped Scatter DOM projection', () => {
    const binder = functionSource(scatter, 'bindScatterDomRefs');
    const passive = functionSource(scatter, 'bindScatterPassiveDomForTab');
    const callback = functionSource(scatter, 'runScatterOwnedCallback');
    const setup = functionSource(scatter, 'setup');
    expect(binder).toBeTruthy();
    expect(passive).toBeTruthy();
    expect(callback).toBeTruthy();
    expect(setup).toBeTruthy();
    for(const marker of [
      "scatterRegressionMode = byId('scatterRegressionMode')",
      "scatterStatsResults = byId('scatterStatsResults')",
      "scatterStatsButton = byId('scatterComputeStats')",
      "scatterShowLine = byId('scatterShowLine')",
      "scatterShowPlotStats = byId('scatterShowPlotStats')",
      "scatterShowCI = byId('scatterShowCI')",
      "scatterShowPI = byId('scatterShowPI')"
    ]){
      expect(binder).toContain(marker);
    }
    expect(binder).not.toContain('.addEventListener(');
    expect(binder).not.toContain('ensureScatterGlobalFitControls()');
    expect(passive).toContain('bindScatterDomRefs(nextRoot, nextTabId');
    expect(callback).toContain('bindScatterDomRefs(ownerRoot, ownerTabId');
    expect(setup).toContain('bindScatterDomRefs(scatterRoot, setupTabId');
  });

  test('successful statistics computation commits the durable model before runtime capture and persistence', () => {
    const commit = functionSource(scatter, 'commitScatterComputedStats');
    const compute = functionSource(scatter, 'handleScatterStatsComputeClick');
    const cache = functionSource(scatter, 'cacheScatterStats');
    expect(commit).toBeTruthy();
    expect(compute).toBeTruthy();
    expect(cache).toBeTruthy();
    expect(commit).toContain('setScatterSessionStatsState(ownerSession');
    expect(commit).toContain("reason: 'missing-precomputed-stats'");
    expect(compute).toContain('.then(computed =>');
    expect(compute).toContain('if(computed !== true)');
    expect(compute).toContain('commitScatterComputedStats(statsSession, context');
    expect(compute).toContain('clearScatterStatsComputationRuntime(statsSession, context, sessionMeta, { force: true });');
    expect(compute.indexOf('commitScatterComputedStats(statsSession, context')).toBeLessThan(
      compute.indexOf('rememberScatterOwnedRuntimeRecord(')
    );
    expect(cache).not.toContain('scatterState.statsContext = context');
  });

  test('payload capture and restore keep owner statistics authoritative', () => {
    const payload = functionSource(scatter, 'getActiveScatterGraphPayload');
    const pending = functionSource(scatter, 'createScatterStatsRestorePending');
    expect(payload).toContain('const ownedStatsState = payloadSession');
    expect(payload).toContain(': (payloadStatsState || sessionStatsState);');
    expect(payload).not.toContain('scatterOwnedStatsStateHasResults(sessionStatsState)');
    expect(pending).toContain('autoCompute: !stats.precomputedStats');
  });

  test('session normalization preserves the canonical state object identity', () => {
    const applyState = functionSource(scatter, 'applyScatterSessionStateInPlace');
    const ensureSession = functionSource(scatter, 'ensureScatterSessionOwnershipShape');
    const syncFromRuntime = functionSource(scatter, 'setScatterSessionStateFromRuntimeRecord');
    expect(applyState).toContain('Object.assign(session.state, normalizedState)');
    expect(ensureSession).toContain('applyScatterSessionStateInPlace(session, normalizedState)');
    expect(syncFromRuntime).toContain('applyScatterSessionStateInPlace(session, normalizedState)');
    expect(ensureSession).not.toContain('session.state = normalizeScatterSessionState(session.state');
    expect(syncFromRuntime).not.toContain('session.state = normalizeScatterSessionState(record, tabId)');
  });

});
