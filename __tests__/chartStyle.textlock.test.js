describe('chartStyle text lock behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="testContainer">
        <div id="testSvg" class="svgbox"></div>
        <input id="testFont" type="range" value="12" min="6" max="36" />
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
  });

  test('locking after manual resize preserves scaled font size', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.getElementById('testSvg');
    const fontInput = document.getElementById('testFont');
    const scopeId = 'testScope';

    // Simulate manual resize state and initial control values
    svgBox.dataset.resizerResized = 'true';
    svgBox.dataset.resizerTextLockScope = scopeId;
    svgBox.dataset.resizerTextLock = 'false';
    fontInput.dataset.fontBasePt = fontInput.value;

    chartStyle.setTextSizeLock(false, { scopeId, svgBox, force: true });

    const defaultWidth = 600;
    const defaultHeight = 400;
    const resizedWidth = 900;
    const resizedHeight = 400;

    const unlocked = chartStyle.resolveScaledFontSize({
      rawSize: fontInput.value,
      width: resizedWidth,
      height: resizedHeight,
      defaultWidth,
      defaultHeight,
      svgBox,
      input: fontInput,
      scopeId
    });

    expect(unlocked.textLocked).toBe(false);
    expect(unlocked.scaledPx).toBeGreaterThan(unlocked.px);

    const unlockedScaledPx = unlocked.scaledPx;
    const unlockedScaledPt = chartStyle.pxToPt(unlockedScaledPx);

    chartStyle.setTextSizeLock(true, { scopeId, svgBox });

    const locked = chartStyle.resolveScaledFontSize({
      rawSize: fontInput.value,
      width: resizedWidth,
      height: resizedHeight,
      defaultWidth,
      defaultHeight,
      svgBox,
      input: fontInput,
      scopeId
    });

    expect(locked.textLocked).toBe(true);
    expect(locked.scaledPx).toBeCloseTo(unlockedScaledPx, 5);
    expect(Number(fontInput.dataset.fontBasePt)).toBeCloseTo(unlockedScaledPt, 5);
    expect(Number(svgBox.dataset.fontBasePt)).toBeCloseTo(unlockedScaledPt, 5);
  });

  test('aspect lock style baseline preserves current visual scale', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.getElementById('testSvg');

    svgBox.dataset.resizerAspectLocked = 'true';
    svgBox.dataset.resizerLockedStyleScaleBase = String(Math.sqrt((566 / 427) * (340 / 427)));

    const initial = chartStyle.computeResizeScale({
      width: 566,
      height: 340,
      defaultWidth: 427,
      defaultHeight: 427,
      svgBox
    });
    const tinyResize = chartStyle.computeResizeScale({
      width: 563,
      height: 338,
      defaultWidth: 427,
      defaultHeight: 427,
      svgBox
    });

    expect(initial.styleScale).toBeCloseTo(1, 5);
    expect(tinyResize.styleScale).toBeGreaterThan(0.98);
    expect(tinyResize.styleScale).toBeLessThan(1.01);
  });
});

