describe('Survival statistics pipeline', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/vendor.js');
    require('../js/shared/debounce.js');
    require('../js/shared/resizer.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/chartStyle.js');
    require('../js/components/survival.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main.js');
  });

  test('Hazard ratios and Cox model stats render and persist', () => {
    const loadBtn = document.getElementById('survivalLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();

    const hazardToggle = document.getElementById('survivalShowHazardRatios');
    const coxToggle = document.getElementById('survivalFitCox');
    expect(hazardToggle).toBeTruthy();
    expect(coxToggle).toBeTruthy();

    hazardToggle.checked = true;
    coxToggle.checked = true;
    hazardToggle.dispatchEvent(new Event('change', { bubbles: true }));
    coxToggle.dispatchEvent(new Event('change', { bubbles: true }));

    window.Components?.survival?.draw?.();

    const hazardSection = document.getElementById('survivalStatsHazardRatios');
    const coxSection = document.getElementById('survivalStatsCox');
    expect(hazardSection).toBeTruthy();
    expect(coxSection).toBeTruthy();
    expect(hazardSection.textContent).toMatch(/Hazard Ratios/i);
    expect(coxSection.textContent).toMatch(/Cox Model/i);

    const payload = window.Components?.survival?.getPayload?.();
    expect(payload).toBeTruthy();
    expect(payload.config.showHazardRatios).toBe(true);
    expect(payload.config.fitCoxModel).toBe(true);
    expect(payload.stats).toBeTruthy();
    expect(payload.stats.hazardRatios?.available).toBe(true);
    expect(Array.isArray(payload.stats.hazardRatios?.rows)).toBe(true);
    expect(payload.stats.hazardRatios.rows.length).toBeGreaterThan(0);
    expect(payload.stats.coxModel?.available).toBe(true);
  });
});
