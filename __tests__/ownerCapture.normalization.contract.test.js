const fs = require('fs');
const path = require('path');

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(source, name){
  const patterns = [
    new RegExp(`^  (?:async )?function ${name}\\s*\\(`, 'm'),
    new RegExp(`^  [A-Za-z0-9_$]+\\.${name}\\s*=\\s*function(?:\\s+[A-Za-z0-9_$]+)?\\s*\\(`, 'm')
  ];
  let match = null;
  for(const pattern of patterns){
    match = pattern.exec(source);
    if(match) break;
  }
  if(!match) return null;
  const start = match.index;
  const paramsStart = source.indexOf('(', match.index);
  if(paramsStart < 0) return null;
  let paramsDepth = 0;
  let paramsQuote = null;
  let paramsEscaped = false;
  let braceStart = -1;
  for(let i = paramsStart; i < source.length; i += 1){
    const ch = source[i];
    if(paramsQuote){
      if(paramsEscaped) paramsEscaped = false;
      else if(ch === '\\') paramsEscaped = true;
      else if(ch === paramsQuote) paramsQuote = null;
      continue;
    }
    if(ch === '"' || ch === "'" || ch === '`'){ paramsQuote = ch; continue; }
    if(ch === '(') paramsDepth += 1;
    if(ch === ')' && --paramsDepth === 0){
      braceStart = source.indexOf('{', i + 1);
      break;
    }
  }
  if(braceStart < 0) return null;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for(let i = braceStart; i < source.length; i += 1){
    const ch = source[i];
    const next = source[i + 1];
    if(lineComment){ if(ch === '\n') lineComment = false; continue; }
    if(blockComment){ if(ch === '*' && next === '/'){ blockComment = false; i += 1; } continue; }
    if(quote){
      if(escaped) escaped = false;
      else if(ch === '\\') escaped = true;
      else if(ch === quote) quote = null;
      continue;
    }
    if(ch === '/' && next === '/'){ lineComment = true; i += 1; continue; }
    if(ch === '/' && next === '*'){ blockComment = true; i += 1; continue; }
    if(ch === '"' || ch === "'" || ch === '`'){ quote = ch; continue; }
    if(ch === '{') depth += 1;
    if(ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

describe('owner-first capture and refresh normalization', () => {
  test('shared capture ownership resolver is general and keeps payload compatibility alias', () => {
    const source = read('js/shared/componentLifecycle.js');
    expect(source).toContain('namespace.resolveOwnerCaptureContext = function resolveOwnerCaptureContext');
    expect(source).toContain('namespace.resolvePayloadCaptureContext = namespace.resolveOwnerCaptureContext;');
  });

  test('PCA inactive runtime capture stays session-owned and never reads live controls first', () => {
    const source = read('js/components/pca.js');
    const captureSession = extractFunction(source, 'capturePcaSessionStateFromActive');
    const captureRuntime = extractFunction(source, 'captureRuntimeState');
    expect(captureSession).toContain("resolveOwnerCaptureContext?.('pca'");
    expect(captureSession).toContain('if (!canCaptureLive)');
    expect(captureSession).toContain('return normalizePcaSessionRecord(shaped.state, shaped.tabId);');
    expect(captureRuntime).toContain('const requestedSession = requestedTabId');
    expect(captureRuntime).toContain('if (captureLive) {');
    expect(captureRuntime).toMatch(/if \(captureLive\) \{[\s\S]*syncPcaRuntimeControlsFromDom\(\)/);
    expect(captureRuntime.indexOf('const requestedSession')).toBeLessThan(captureRuntime.indexOf('syncPcaRuntimeControlsFromDom()'));
    expect(source).toContain("const finalOwnerContext = drawSession");
    expect(source).toContain("resolveOwnerCaptureContext?.('pca'");
    expect(source).toContain('mirrorActive: drawOwnerStillProjected');
    expect(source).toContain('pca stale draw performance projection skipped');
  });

  test('Box runtime capture uses the requested owner instead of rediscovering active Box', () => {
    const source = read('js/components/box.js');
    const captureSnapshot = extractFunction(source, 'captureBoxRuntimeSnapshot');
    const captureRuntime = extractFunction(source, 'captureRuntimeState');
    expect(captureSnapshot).toContain("resolveOwnerCaptureContext?.('box'");
    expect(captureSnapshot).toContain('const ownerSession = ensureBoxSessionOwnershipShape(session || getActiveBoxSessionForState())');
    expect(captureSnapshot).toContain('const significanceResultsState = captureLive');
    expect(captureSnapshot).toContain('cloneSimple(ownedRecord?.geometry?.flipTransition');
    expect(captureRuntime).toContain('const ownerSession = effectiveMeta.tabId');
    expect(captureRuntime).toContain('? getBoxSession(effectiveMeta.tabId, effectiveMeta, { create: false })');
    expect(captureRuntime).toContain('captureBoxRuntimeSnapshot(effectiveMeta.reason, ownerSession, effectiveMeta)');
  });

  test('Scatter stale draw finalization never copies current module mirrors into the draw owner', () => {
    const source = read('js/components/scatter.js');
    expect(source).toContain("const finalOwnerContext = drawSession");
    expect(source).toContain("resolveOwnerCaptureContext?.('scatter'");
    expect(source).toContain('const drawOwnerStillProjected = !!drawSession');
    expect(source).toContain("syncScatterSessionDurableStateFromModule(drawSession, 'scatter-draw-final-sync')");
    expect(source).toContain('scatter draw final module sync skipped for stale owner');
    expect(source).toContain('const ownedGrouped = normalizeScatterOwnedGroupedState(drawSession?.state?.grouped || {})');
    expect(source).toContain('const ownedView = normalizeScatterOwnedViewState(drawSession?.state?.view || {})');
    expect(source).toContain('const ownedLabels = normalizeScatterOwnedLabelsState(drawSession?.state?.labels || {})');
  });

  test('Line font refresh preserves the event owner through scheduling', () => {
    const source = read('js/components/line.js');
    const refresh = extractFunction(source, 'scheduleLineViewRefresh');
    const listener = extractFunction(source, 'ensureLineFontEventListener');
    expect(listener).toContain("scheduleLineViewRefresh('font-style-change', { tabId: detail.tabId || null });");
    expect(refresh).toContain('const ownerSession = ownerTabId');
    expect(refresh).toContain("resolveOwnerCaptureContext?.('line'");
    expect(refresh).toContain('if(!ownerSession){');
    expect(refresh).toContain('const canReadLiveControls = captureContext');
    expect(refresh).toContain('scheduleLineDrawForSession(ownerSession, scheduleOptions);');
    expect(refresh).not.toContain('scheduleActiveLineDraw(scheduleOptions);');
  });
});

describe('live projection ownership normalization', () => {
  const componentFiles = [
    'box', 'scatter', 'line', 'hist', 'pca', 'pie', 'roc', 'survival', 'surface', 'heatmap', 'venn'
  ];

  test.each(componentFiles)('%s routes live module/DOM authority through the shared exact-projection gate', component => {
    const source = read(`js/components/${component}.js`);
    expect(source).toContain(`canOwnerUseLiveProjection?.('${component}'`);
  });

  test('legacy active-or-activating predicates are removed from production components', () => {
    componentFiles.forEach(component => {
      const source = read(`js/components/${component}.js`);
      expect(source).not.toMatch(/SessionActiveOrActivating/);
    });
  });

  test('activation-target authority is separate and limited to components with hydration scheduler suppression', () => {
    const expected = ['hist', 'pie', 'roc', 'survival', 'surface'];
    expected.forEach(component => {
      const source = read(`js/components/${component}.js`);
      expect(source).toContain(`isOwnerActivationTarget?.('${component}'`);
      expect(source).toContain('const canMuteActiveScheduler =');
    });
    ['box', 'scatter', 'line', 'pca', 'heatmap', 'venn'].forEach(component => {
      expect(read(`js/components/${component}.js`)).not.toContain(`isOwnerActivationTarget?.('${component}'`);
    });
  });

  test('known callback/mirror shortcuts do not re-authorize workspace-active siblings', () => {
    const scatter = read('js/components/scatter.js');
    const heatmap = read('js/components/heatmap.js');
    const pca = read('js/components/pca.js');
    const box = read('js/components/box.js');
    const venn = read('js/components/venn.js');
    expect(scatter).not.toMatch(/ownerTabId === workspaceActiveTabId \|\| ownerTabId === boundTabId/);
    expect(heatmap).not.toMatch(/session === getActiveHeatmapSessionForState\(\) \|\|/);
    expect(pca).not.toMatch(/ownerTabId === workspaceActiveTabId \|\| ownerTabId === boundTabId/);
    expect(box).not.toMatch(/session === getActiveBoxSessionForState\(\) \|\| isBoxSessionActiveForModuleState/);
    expect(venn).toContain('isVennSessionActiveForModuleState(owner.session)');
    ['scatter', 'heatmap', 'hist', 'pca', 'surface'].forEach(component => {
      expect(read(`js/components/${component}.js`)).not.toMatch(/if\s*\(!ownerTabId\)\s*\{\s*return true;/);
    });
  });
});
