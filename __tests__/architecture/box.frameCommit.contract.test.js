const fs = require('fs');
const path = require('path');

const boxSource = () => fs.readFileSync(path.join(__dirname, '../../js/components/box.js'), 'utf8').replace(/\r\n/g, '\n');

describe('box frame/layout commit contract', () => {
  test('logical graph geometry updates do not write physical frame state directly', () => {
    const source = boxSource();
    const match = source.match(/function updateBoxGraphGeometry\(partial = \{\}, options = \{\}\)\{([\s\S]*?)\n  \}\n\n  function parseBoxPositivePx/);
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

  test('internal frame/layout helpers do not depend on active-tab fallback', () => {
    const source = boxSource();
    const strictHelperMatch = source.match(/function resolveBoxExplicitOrBoundTabId\(meta = \{\}\)\{([\s\S]*?)\n  \}\n\n  function resolveBoxAsyncTabId/);
    expect(strictHelperMatch).toBeTruthy();
    expect(strictHelperMatch[1]).not.toMatch(/getActiveBoxWorkspaceTabId|getActiveBoxSessionInfo/);

    const commitMatch = source.match(/function commitBoxGraphFrame\(frame = \{\}, options = \{\}\)\{([\s\S]*?)\n  \}\n\n  function synchronizeBoxFlipFrameToLayout/);
    expect(commitMatch).toBeTruthy();
    expect(commitMatch[1]).not.toMatch(/getActiveBoxWorkspaceTabId|getActiveBoxSessionInfo/);
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

  test('all Box redraws stage the replacement frame, and only live pointer moves reuse a prior canvas frame', () => {
    const source = boxSource();
    expect(source).not.toContain('shouldRetainPreviousBoxFrame');
    expect(source).toContain("const previousBoxSvg2d = isBoxLiveResize(drawOpts, { includeEnd: false })");
    expect(source).toContain('resolveCommittedBoxFrame(plotDiv, renderTabId)');
  });

  test('orientation frame renderers receive the draw cancellation checkpoint explicitly', () => {
    const source = boxSource();
    const vertical = source.match(/async function renderBoxVerticalFrame\(context = \{\}\)\{([\s\S]*?)\n    \} = context;/);
    const horizontal = source.match(/async function renderBoxHorizontalFrame\(context = \{\}\)\{([\s\S]*?)\n    \} = context;/);
    const frameContext = source.match(/const orientationFrameContext = \{([\s\S]*?)\n    \};\n    const orientationResult/);
    expect(vertical).toBeTruthy();
    expect(horizontal).toBeTruthy();
    expect(frameContext).toBeTruthy();
    expect(vertical[1]).toMatch(/\bcheckpoint,/);
    expect(horizontal[1]).toMatch(/\bcheckpoint,/);
    expect(frameContext[1]).toMatch(/\bcheckpoint,/);
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
