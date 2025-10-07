describe('chartStyle renderFontSizeLabel control behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="fontTest">
        <span id="fontLabel"></span>
        <input id="fontSlider" type="range" value="13" min="6" max="36" />
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
  });

  test('automatic label updates do not mutate slider value', () => {
    const { chartStyle } = window.Shared;
    const label = document.getElementById('fontLabel');
    const slider = document.getElementById('fontSlider');
    slider.dataset.fontBasePt = slider.value;

    const fontInfo = {
      basePt: Number(slider.value),
      pt: Number(slider.value),
      scaledPt: 10,
      scaledPx: window.Shared.chartStyle.ptToPx(10)
    };

    chartStyle.renderFontSizeLabel({ element: label, fontInfo, input: slider });

    expect(slider.value).toBe('13');
    expect(slider.dataset.fontDisplayPt).toBe(String(fontInfo.scaledPt));
    expect(label.textContent).toContain('10 pt');
  });
});
