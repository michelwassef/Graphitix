describe('chartStyle proportional font resize behavior', () => {
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

  test('proportional font resize is opt-in and independent from lock ratio', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.getElementById('testSvg');
    const fontInput = document.getElementById('testFont');
    const scopeId = 'testScope';

    svgBox.dataset.resizerResized = 'true';
    svgBox.dataset.resizerProportionalFontResizeScope = scopeId;
    svgBox.dataset.resizerProportionalFontResize = 'false';
    svgBox.dataset.resizerAspectLocked = 'false';
    svgBox.dataset.resizerLastAxis = 'x';
    svgBox.dataset.resizerUnlockedStyleScaleBase = '1';
    fontInput.dataset.fontBasePt = fontInput.value;

    chartStyle.setProportionalFontResize(false, { scopeId, svgBox, force: true });

    const defaultWidth = 600;
    const defaultHeight = 400;
    const resizedWidth = 900;
    const resizedHeight = 400;

    const disabled = chartStyle.resolveScaledFontSize({
      rawSize: fontInput.value,
      width: resizedWidth,
      height: resizedHeight,
      defaultWidth,
      defaultHeight,
      svgBox,
      input: fontInput,
      scopeId
    });

    expect(disabled.proportionalFontResize).toBe(false);
    expect(disabled.scaledPx).toBeCloseTo(disabled.px, 5);
    expect(disabled.scaleInfo.styleScale).toBeCloseTo(1, 5);
    expect(disabled.scaleInfo.fontResizeScale).toBeCloseTo(1.5, 5);

    chartStyle.setProportionalFontResize(true, { scopeId, svgBox, force: true });

    const enabled = chartStyle.resolveScaledFontSize({
      rawSize: fontInput.value,
      width: resizedWidth,
      height: resizedHeight,
      defaultWidth,
      defaultHeight,
      svgBox,
      input: fontInput,
      scopeId
    });

    expect(enabled.proportionalFontResize).toBe(true);
    expect(enabled.scaledPx).toBeCloseTo(Math.round(enabled.px * 1.5), 5);

    svgBox.dataset.resizerAspectLocked = 'true';
    svgBox.dataset.resizerLastAxis = 'both';
    delete svgBox.dataset.resizerUnlockedStyleScaleBase;
    const enabledAspectLocked = chartStyle.resolveScaledFontSize({
      rawSize: fontInput.value,
      width: resizedWidth,
      height: 600,
      defaultWidth,
      defaultHeight,
      svgBox,
      input: fontInput,
      scopeId
    });

    expect(enabledAspectLocked.proportionalFontResize).toBe(true);
    expect(enabledAspectLocked.scaleInfo.aspectLocked).toBe(true);
    expect(enabledAspectLocked.scaleInfo.fontResizeScale).toBeCloseTo(1.5, 5);
    expect(enabledAspectLocked.scaledPx).toBeCloseTo(Math.round(enabledAspectLocked.px * 1.5), 5);
  });


  test('toggle commits the current displayed font size and current graph size as the next baseline', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.getElementById('testSvg');
    const fontInput = document.getElementById('testFont');
    const scopeId = 'testScope';
    const defaultWidth = 600;
    const defaultHeight = 400;

    svgBox.dataset.resizerProportionalFontResizeScope = scopeId;
    svgBox.dataset.resizerAspectLocked = 'false';
    svgBox.dataset.resizerLastAxis = 'x';
    svgBox.dataset.resizerBaseWidth = String(defaultWidth);
    svgBox.dataset.resizerBaseHeight = String(defaultHeight);
    fontInput.dataset.fontBasePt = '12';

    chartStyle.setProportionalFontResize(true, { scopeId, svgBox, force: true });
    const shrunk = chartStyle.resolveScaledFontSize({
      rawSize: fontInput.value,
      width: 300,
      height: defaultHeight,
      defaultWidth,
      defaultHeight,
      svgBox,
      input: fontInput,
      scopeId
    });

    expect(shrunk.proportionalFontResize).toBe(true);
    expect(shrunk.displayPt).toBeCloseTo(6, 1);

    svgBox.dataset.resizerBaseWidth = '300';
    svgBox.dataset.resizerBaseHeight = String(defaultHeight);
    chartStyle.setProportionalFontResize(false, { scopeId, svgBox });

    const disabledAfterToggle = chartStyle.resolveScaledFontSize({
      rawSize: fontInput.value,
      width: 900,
      height: defaultHeight,
      defaultWidth,
      defaultHeight,
      svgBox,
      input: fontInput,
      scopeId
    });

    expect(disabledAfterToggle.proportionalFontResize).toBe(false);
    expect(disabledAfterToggle.displayPt).toBeCloseTo(shrunk.displayPt, 5);
    expect(Number(svgBox.dataset.fontBasePt)).toBeCloseTo(shrunk.displayPt, 5);

    svgBox.dataset.resizerBaseWidth = '900';
    chartStyle.setProportionalFontResize(true, { scopeId, svgBox });
    const enlargedFromCommittedBaseline = chartStyle.resolveScaledFontSize({
      rawSize: fontInput.value,
      width: 1200,
      height: defaultHeight,
      defaultWidth,
      defaultHeight,
      svgBox,
      input: fontInput,
      scopeId
    });

    expect(enlargedFromCommittedBaseline.proportionalFontResize).toBe(true);
    const expectedRoundedPt = chartStyle.pxToPt(Math.round(chartStyle.ptToPx(shrunk.displayPt) * (1200 / 900)));
    expect(enlargedFromCommittedBaseline.displayPt).toBeCloseTo(expectedRoundedPt, 5);
  });

  test('aspect lock style baseline preserves non-text style scale while exposing raw font resize scale', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.getElementById('testSvg');

    const rawScale = Math.sqrt((566 / 427) * (340 / 427));
    svgBox.dataset.resizerAspectLocked = 'true';
    svgBox.dataset.resizerLockedStyleScaleBase = String(rawScale);

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
    expect(initial.fontResizeScale).toBeCloseTo(rawScale, 5);
    expect(tinyResize.styleScale).toBeGreaterThan(0.98);
    expect(tinyResize.styleScale).toBeLessThan(1.01);
  });
});
