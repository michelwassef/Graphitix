describe('Shared.additionalLineControls compound-path compatibility', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="lineToolbarHost" class="font-toolbar-host"></div>';
    window.Shared = {};
    jest.resetModules();
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/additionalLineControls.js');
  });

  test('edits a compound path through the existing line toolbar without changing its geometry', () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const path = document.createElementNS(ns, 'path');
    const d = 'M 50 10 L 50 90 M 40 10 L 60 10 M 40 90 L 60 90';
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#666666');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    document.body.appendChild(svg);

    const host = document.getElementById('lineToolbarHost');
    let thickness = 2;
    window.Shared.additionalLineControls.show({
      scopeId: 'box',
      host,
      target: path,
      panelTitle: 'Summary',
      controls: {
        showSummary: false,
        showScope: false,
        showPattern: true,
        thicknessLabel: 'Line width',
        transparencyLabel: 'Transparency',
        thicknessMin: 0,
        thicknessMax: 20,
        thicknessStep: 0.1
      },
      getThickness: () => thickness,
      onThicknessChange: value => {
        thickness = value;
        path.setAttribute('stroke-width', String(value));
      },
      getColor: () => path.getAttribute('stroke'),
      onColorChange: value => path.setAttribute('stroke', value),
      getPattern: () => 'solid',
      onPatternChange: () => {},
      getTransparency: () => 0,
      onTransparencyChange: () => {}
    });

    const panel = host.querySelector('.additional-line-controls-panel');
    expect(panel).toBeTruthy();
    expect(panel.dataset.open).toBe('1');
    const thicknessInput = Array.from(panel.querySelectorAll('input[type="number"]'))
      .find(input => input.step === '0.1');
    expect(thicknessInput).toBeTruthy();
    thicknessInput.value = '4.5';
    thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(path.getAttribute('stroke-width')).toBe('4.5');
    expect(path.getAttribute('d')).toBe(d);
  });
});
