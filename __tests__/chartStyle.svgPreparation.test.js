describe('chartStyle SVG preparation responsibilities', () => {
  beforeEach(() => {
    jest.resetModules();
    global.Shared = { fontControls: { enableForSvg: jest.fn() } };
    window.Shared = global.Shared;
    require('../js/shared/chartStyle.js');
  });

  test('style defaults do not install interactions', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'style-only-svg';

    expect(window.Shared.chartStyle.applySvgDefaults(svg)).toBe(true);
    expect(svg.getAttribute('font-family')).toBeTruthy();
    expect(window.Shared.fontControls.enableForSvg).not.toHaveBeenCalled();
  });

  test('prepareSvg applies defaults and installs interactions exactly once', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'prepared-svg';

    expect(window.Shared.chartStyle.prepareSvg(svg)).toBe(true);
    expect(window.Shared.fontControls.enableForSvg).toHaveBeenCalledTimes(1);
    expect(window.Shared.fontControls.enableForSvg).toHaveBeenCalledWith(svg, { scopeId: 'prepared-svg', tabId: null });
  });

  test('bindSvgInteractions forwards the restored owner tab', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    expect(window.Shared.chartStyle.bindSvgInteractions(svg, { scopeId: 'box', tabId: 'tab-box-a' })).toBe(true);
    expect(window.Shared.fontControls.enableForSvg).toHaveBeenCalledWith(svg, { scopeId: 'box', tabId: 'tab-box-a' });
  });

  test('prepareSvg applies the active component theme to a replacement SVG', () => {
    const applyToSvg = jest.fn();
    window.Shared.colorSchemes = { applyToSvg };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    expect(window.Shared.chartStyle.prepareSvg(svg, { scopeId: 'hist' })).toBe(true);
    expect(applyToSvg).toHaveBeenCalledWith('hist', svg, { schemeId: undefined });
  });
});
