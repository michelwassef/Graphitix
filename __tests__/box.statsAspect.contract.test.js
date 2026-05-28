const fs = require('fs');
const path = require('path');

const boxSource = () => fs.readFileSync(path.join(__dirname, '../js/components/box.js'), 'utf8');

describe('box stats context and aspect-lock lifecycle contract', () => {
  test('example/payload stats context priming uses one matrix-to-traces helper', () => {
    const source = boxSource();
    expect(source).toMatch(/function buildBoxStatsTracesFromMatrix\(matrix, options = \{\}\)/);
    expect(source).toMatch(/function primeBoxStatsContextFromMatrix\(matrix, options = \{\}\)/);
    expect(source).toMatch(/example-load-stats-context/);
    const matrixTraceBuilderCount = (source.match(/buildBoxStatsTracesFromMatrix\(/g) || []).length;
    expect(matrixTraceBuilderCount).toBeGreaterThanOrEqual(3);
    const hydrateFunction = source.match(/function hydrateBoxStatsSurfaceFromTabPayload[\s\S]*?function tryReuseBoxCanvasPointGroupDuringResizeMove/);
    expect(hydrateFunction).toBeTruthy();
    expect(hydrateFunction[0]).not.toMatch(/Array\.from\(\{ length: colCount \}/);
  });

  test('stats compute rebinds disconnected SVG contexts before computing', () => {
    const source = boxSource();
    expect(source).toMatch(/context\.svg\.isConnected !== false/);
  });

  test('programmatic Box frame/reserve resizes preserve user aspect-lock preference', () => {
    const source = boxSource();
    const boxOnly = source.match(/function swapBoxFrameAcrossAxisFlip[\s\S]*?function resolveBoxAutoReserveMetrics/);
    expect(boxOnly).toBeTruthy();
    expect(boxOnly[0]).not.toMatch(/preserveAspectLock:\s*false/);
    expect(boxOnly[0]).toMatch(/preserveAspectLock:\s*true/);
  });
});

describe('box stats-context handoff and reserve persistence regressions', () => {
  test('stats compute requests are queued when data context is not primed yet', () => {
    const source = boxSource();
    expect(source).toMatch(/function requestBoxStatsComputeAfterContextReady\(reason, options = \{\}\)/);
    expect(source).toMatch(/function consumeBoxStatsComputeAfterContextReady\(context\)/);
    const computeMatch = source.match(/function handleStatsComputeClick\(evt\)\{[\s\S]*?const contextSvg =/);
    expect(computeMatch).toBeTruthy();
    expect(computeMatch[0]).toMatch(/requestBoxStatsComputeAfterContextReady\('stats-compute-context-missing'/);
    expect(computeMatch[0]).not.toMatch(/Statistics unavailable until data is loaded\./);
  });

  test('stats-triggered significance layout uses an explicit non-resize draw reason', () => {
    const source = boxSource();
    expect(source).toMatch(/reason:\s*'stats-significance-layout'/);
    expect(source).toMatch(/source:\s*'box-stats-success'/);
  });

  test('vertical reserve frame commits happen for any reserve composition change', () => {
    const source = boxSource();
    const viewportMatch = source.match(/function applyBoxViewportExtensions\(nextExtensions, options = \{\}\)\{[\s\S]*?const resizeResult = applyBoxAutoReserveFrameSize/);
    expect(viewportMatch).toBeTruthy();
    expect(viewportMatch[0]).toMatch(/const shouldCommitFrameLayout = options\.commitFrameLayout === true\s*\|\| \(options\.resizeContainer === true && compositionChanged\)/);
    expect(viewportMatch[0]).not.toMatch(/significanceIncreased && pendingSignificanceRestore/);
  });

  test('already-correct reserve frames still commit layout metadata', () => {
    const source = boxSource();
    const reserveMatch = source.match(/function applyBoxAutoReserveFrameDelta\(axis, nextExtension, previousExtension, options = \{\}\)\{[\s\S]*?if\(typeof Shared\.applyResizableBoxSize/);
    expect(reserveMatch).toBeTruthy();
    expect(reserveMatch[0]).toMatch(/if\(options\.commitFrameLayout === true\)\{[\s\S]*?commitBoxGraphFrame/);
  });
});
