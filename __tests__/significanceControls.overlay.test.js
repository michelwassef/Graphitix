describe('Shared.significanceControls overlay behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = window.Shared || {};
    window.Shared.isDebugEnabled = () => false;
    require('../js/shared/significanceControls.js');
  });

  test('registerSignificanceElement respects disableOverlay for path elements', () => {
    const controls = window.Shared?.significanceControls;
    expect(controls).toBeTruthy();
    expect(typeof controls.registerSignificanceElement).toBe('function');

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    document.body.appendChild(svg);

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M0,0 L10,0');
    svg.appendChild(path);

    controls.registerSignificanceElement(path, {
      orientation: 'vertical',
      scopeId: 'box',
      disableOverlay: true,
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {}
    });

    expect(path.dataset.significanceControl).toBe('1');
    expect(path.__significanceControlOverlay).toBeFalsy();
  });
});

