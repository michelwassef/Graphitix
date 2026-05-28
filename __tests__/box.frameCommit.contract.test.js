const fs = require('fs');
const path = require('path');

const boxSource = () => fs.readFileSync(path.join(__dirname, '../js/components/box.js'), 'utf8');

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

  test('reserve frame resizing uses one axis-aware implementation', () => {
    const source = boxSource();
    expect(source).toMatch(/function applyBoxAutoReserveFrameDelta\(axis, nextExtension, previousExtension, options = \{\}\)/);
    expect(source).toMatch(/function applyBoxAutoReserveFrameSize\(nextExtension, previousExtension, options = \{\}\)\{\s*return applyBoxAutoReserveFrameDelta\('vertical'/);
    expect(source).toMatch(/function applyBoxAutoReserveFrameWidth\(nextExtension, previousExtension, options = \{\}\)\{\s*return applyBoxAutoReserveFrameDelta\('horizontal'/);
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
});
