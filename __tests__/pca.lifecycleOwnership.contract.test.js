const fs = require('fs');
const path = require('path');

const pcaSource = () => fs.readFileSync(path.join(__dirname, '../js/components/pca.js'), 'utf8').replace(/\r\n/g, '\n');

function extractSetup(source) {
  const start = source.indexOf('  function setup(options = {}) {');
  const end = source.indexOf('\n  function ensureReady(', start);
  return start >= 0 && end > start ? source.slice(start, end) : null;
}

describe('PCA lifecycle ownership contract', () => {
  test('renderer, payload, apply, file and cache lifecycle functions are module-level', () => {
    const source = pcaSource();
    [
      'drawPca',
      'getPcaGraphPayload',
      'applyPcaPayload',
      'loadPcaGraphFile',
      'getPcaScheduleBase'
    ].forEach(name => {
      expect(source).toMatch(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
    });
    [
      'pca.save = savePcaFile;',
      'pca.open = openPcaFile;',
      'pca.getPayload = getPcaGraphPayload;',
      'pca.captureRuntimeState =',
      'pca.captureRenderCache =',
      'pca.restoreRenderCache ='
    ].forEach(marker => expect(source).toContain(marker));
  });

  test('setup is limited to projection, manager mounting and listener binding', () => {
    const source = pcaSource();
    const setup = extractSetup(source);
    expect(setup).toBeTruthy();
    expect(setup).not.toMatch(/^    (?:async )?function\s+/m);
    expect(setup).not.toMatch(/^    (?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=.*=>/m);
    expect(setup).not.toMatch(/^    pca\.[A-Za-z_$][\w$]*\s*=\s*(?:async\s+)?function/m);
    expect(setup).toContain('bindPcaSessionForTab');
    expect(setup).toContain('applyPcaSessionStateToActive');
    expect(setup).toContain('Shared?.hot?.createStandardTable');
    expect(setup).toContain('scheduleDrawPcaRaw =');
  });

  test('active DOM bindings required by module-level lifecycle code are explicit', () => {
    const source = pcaSource();
    expect(source).toMatch(/^  let pcaPlotDiv = null;$/m);
    expect(source).toMatch(/^  let pcaAlphaVal = null;$/m);
    const setup = extractSetup(source);
    expect(setup).not.toMatch(/\b(?:const|let|var)\s+pcaAlphaVal\b/);
  });

  test('label styles are durable session-owned state rather than setup closure state', () => {
    const source = pcaSource();
    expect(source).toContain('labelColors: {}');
    expect(source).toContain('labelShapes: {}');
    expect(source).toContain('labelPointStyles: {}');
    expect(source).toContain('labelStyleMode: null');
    expect(source).not.toMatch(/^\s*(?:const|let|var)\s+pcaLabel(?:Colors|Shapes|PointStyles)\b/m);
    expect(source).toContain('labelColors: cloneSimple(pcaState.labelColors) || {}');
    expect(source).toContain('pcaState.labelColors = cloneSimple(state.labelColors) || {}');
  });

  test('file handle and file name are scoped to the owning PCA session', () => {
    const source = pcaSource();
    expect(source).toContain('owner.managers.fileHandle');
    expect(source).toContain('owner.state.fileName');
    expect(source).not.toMatch(/^\s*(?:const|let|var)\s+pcaFile(?:Handle|Name)\b/m);
  });

  test('scheduler uses the module-level tab-scoped frame debouncer', () => {
    const source = pcaSource();
    expect(source).toMatch(/^  let pcaScheduleBase = null;$/m);
    expect(source).toContain('function getPcaScheduleBase()');
    expect(source).toContain('const runSchedule = () => getPcaScheduleBase()(nextOpts);');
    expect(source).not.toMatch(/\bschedulePcaBase\s*\(/);
  });

  test('3D rotation keeps viewport and in-flight redraw state in the owning session', () => {
    const source = pcaSource();
    expect(source).toContain('rotationActive: !!src.rotationActive');
    expect(source).toContain('rotationQueued: !!src.rotationQueued');
    expect(source).toContain('rotationViewport: cloneSimple(src.rotationViewport) || null');
    expect(source).toContain('runtime.rotationViewport = capturePcaRotationViewport(svg);');
    expect(source).toContain("reason: 'pca-rotation-frame'");
    expect(source).toContain('drawSession.refs.rotationRenderer = rotation =>');
    expect(source).toContain("requestPcaViewRefresh('rotation-end'");
    expect(source).toContain('if (!applyPcaRotationViewport(svg3, rotationViewport))');
    expect(source).toContain('onAxisTickLabel: markPca3dAxisTickLabel');
    expect(source).toContain("markFontEditable(node, 'axis3d', labelText)");
  });

  test('superseded worker completions cannot replace the current owner worker record', () => {
    const source = pcaSource();
    expect(source).toContain('function isPcaWorkerInvocationCurrent(invocation)');
    expect(source).toContain('const isCurrent = isPcaWorkerInvocationCurrent(invocation);');
    expect(source).toMatch(/invocation\.session\.workers\.set\(invocation\.id, next\);\s*if \(isCurrent\) \{\s*invocation\.session\.workers\.set\(invocation\.kind, next\);/);
    expect(source).toContain("status: 'superseded'");
  });
});
