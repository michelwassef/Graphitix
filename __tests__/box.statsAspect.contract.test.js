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
    const hydrateFunction = source.match(/function hydrateBoxStatsSurfaceFromTabPayload[\s\S]*?function tryReuseBoxCanvasPointGroupDuringLiveResize/);
    expect(hydrateFunction).toBeTruthy();
    expect(hydrateFunction[0]).not.toMatch(/Array\.from\(\{ length: colCount \}/);
  });

  test('stats compute rebinds disconnected SVG contexts before computing', () => {
    const source = boxSource();
    expect(source).toMatch(/context\.svg\.isConnected !== false/);
  });

  test('flip frame synchronization preserves the user aspect-lock preference', () => {
    const source = boxSource();
    const boxOnly = source.match(/function synchronizeBoxFlipFrameToLayout[\s\S]*?function isBoxGraphGeometryMaterial/);
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

  test('viewport reserve capture does not resize or commit the physical frame', () => {
    const source = boxSource();
    const viewportMatch = source.match(/function applyBoxViewportExtensionPair\(kind, nextExtensions, options = \{\}\)\{[\s\S]*?function applyBoxViewportExtensions/);
    expect(viewportMatch).toBeTruthy();
    expect(viewportMatch[0]).not.toMatch(/applyResizableBoxSize|commitBoxGraphFrame/);
  });

  test('auxiliary frame reserves preserve canonical graph geometry', () => {
    const source = boxSource();
    const reserveMatch = source.match(/function reconcileBoxAuxiliaryFrameReserves\(nextReserves = \{\}, options = \{\}\)\{[\s\S]*?function settleBoxAuxiliaryFrameGeometry/);
    expect(reserveMatch).toBeTruthy();
    expect(reserveMatch[0]).toMatch(/authorityMode:\s*'transient'/);
    expect(reserveMatch[0]).toMatch(/updateAspectRatio:\s*false/);
    expect(reserveMatch[0]).not.toMatch(/commitBoxGraphFrame/);
  });
});
