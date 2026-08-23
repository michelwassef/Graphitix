const fs = require('fs');
const path = require('path');

const boxSource = () => fs.readFileSync(path.join(__dirname, '../js/components/box.js'), 'utf8').replace(/\r\n/g, '\n');

describe('box frame/layout commit contract', () => {
  test('logical graph geometry updates do not write physical frame state directly', () => {
    const source = boxSource();
    const match = source.match(/function updateBoxGraphGeometry\(partial = \{\}, options = \{\}\)\{([\s\S]*?)\n  \}\n\n  function setBoxIntrinsicContentSizeFromGeometry/);
    expect(match).toBeTruthy();
    expect(match[1]).not.toMatch(/commitBoxGraphFrame|applyBoxGraphFrameAuthority|setBoxGraphDatasetFrameAuthority|applyResizableBoxSize/);
  });

  test('box has a single local physical frame commit path', () => {
    const source = boxSource();
    expect(source).toMatch(/function commitBoxGraphFrame\(frame = \{\}, options = \{\}\)/);
    expect(source).not.toMatch(/function applyBoxGraphFrameAuthority/);
    expect(source).not.toMatch(/function setBoxGraphDatasetFrameAuthority/);
  });

  test('legacy layout-authority flags are not used by box call sites', () => {
    const source = boxSource();
    expect(source).not.toMatch(/layoutAuthority\s*:/);
    expect(source).not.toMatch(/writeLayout\s*:/);
  });

  test('auxiliary reserves resize the physical frame through one transaction', () => {
    const source = boxSource();
    const reserveMatch = source.match(/function reconcileBoxAuxiliaryFrameReserves\(nextReserves = \{\}, options = \{\}\)\{[\s\S]*?function settleBoxAuxiliaryFrameGeometry/);
    expect(reserveMatch).toBeTruthy();
    expect(reserveMatch[0]).toMatch(/authorityMode:\s*'transient'/);
    expect(reserveMatch[0]).toMatch(/updateAspectRatio:\s*false/);
    expect(reserveMatch[0]).not.toMatch(/commitBoxGraphFrame/);
  });

  test('internal frame/layout helpers do not depend on active-tab fallback', () => {
    const source = boxSource();
    const strictHelperMatch = source.match(/function resolveBoxExplicitOrBoundTabId\(meta = \{\}\)\{([\s\S]*?)\n  \}\n\n  function resolveBoxAsyncTabId/);
    expect(strictHelperMatch).toBeTruthy();
    expect(strictHelperMatch[1]).not.toMatch(/getActiveBoxWorkspaceTabId|getActiveBoxSessionInfo/);

    const intrinsicMatch = source.match(/function setBoxIntrinsicContentSizeFromGeometry\(geometry, options = \{\}\)\{([\s\S]*?)\n  \}\n\n  function parseBoxPositivePx/);
    expect(intrinsicMatch).toBeTruthy();
    expect(intrinsicMatch[1]).not.toMatch(/getActiveBoxWorkspaceTabId|getActiveBoxSessionInfo/);
  });
  test('published-graph validation accepts semantic Box marks and rejects pending frames', () => {
    const source = boxSource();
    expect(source).toMatch(/function hasBoxPublishedVisualContent\(root, options = \{\}\)/);
    expect(source).toContain("'[data-box-shape=\"body\"]'");
    expect(source).toContain("'[data-summary-line=\"1\"]'");
    expect(source).toContain("svg.getAttribute?.('data-box-pending-render') === '1'");
    expect(source).toMatch(/box\.hasRenderedGraph = function hasRenderedGraph[\s\S]*hasBoxPublishedVisualContent\(plot\)/);
  });

  test('atomic Box replacement uses the shared frame-publication contract', () => {
    const source = boxSource();
    expect(source).toContain('Shared.framePublication?.stage');
    expect(source).toMatch(/publishedId:\s*'boxSvg'/);
    expect(source).toMatch(/canCommit:\s*\(\) => isBoxDrawTokenCurrent\(drawSession, token\)/);
    expect(source).not.toContain('const removeRetainedPlotNodes = () =>');
  });

  test('all view-only Box redraws keep the published frame until atomic commit', () => {
    const source = boxSource();
    const match = source.match(/function shouldRetainPreviousBoxFrame\(drawOptions\)\{([\s\S]*?)\n  \}\n\n  function partitionArray/);
    expect(match).toBeTruthy();
    expect(match[1]).toContain("drawOptions?.viewOnly !== true");
    expect(match[1]).not.toMatch(/reason === 'resize'|significance-viewport-extension/);
  });

  test('significance-label pixel scans request a readback-optimized canvas context', () => {
    const source = boxSource();
    expect(source).toContain("canvas.getContext('2d', { willReadFrequently: true })");
  });

  test('queued Box draws remain non-idle until their tab-owned frame starts', () => {
    const source = boxSource();
    expect(source).toMatch(/function scheduleBoxDrawForSession[\s\S]*runtime\.scheduled = true/);
    expect(source).toMatch(/async function runBoxDrawCycle[\s\S]*runtime\.scheduled = false/);
    expect(source).toMatch(/box\.isIdleForSnapshot[\s\S]*!runtime\.scheduled/);
    expect(source).toMatch(/box\.draw = function[\s\S]*return scheduleBoxDrawForSession\(drawSession, guardedOptions\)/);
  });

});
