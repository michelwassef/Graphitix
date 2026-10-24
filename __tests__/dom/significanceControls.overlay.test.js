describe('Shared.significanceControls overlay behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = window.Shared || {};
    window.Shared.isDebugEnabled = () => false;
    require('../../js/shared/workspaceToolbarAccess.js');
    require('../../js/shared/workspaceToolbar.js');
    require('../../js/shared/significanceControls.js');
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

  test('restored label hit areas are reused and rebound', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = '<text>0.01</text><rect data-significance-control="1" />';
    document.body.appendChild(svg);
    const label = svg.querySelector('text');
    const overlay = svg.querySelector('rect');
    window.Shared.significanceControls.registerSignificanceElement(label, { scopeId: 'box' });
    expect(label.__significanceControlOverlay.element).toBe(overlay);
    expect(overlay.__significanceControlHandler).toEqual(expect.any(Function));
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
    window.Shared.significanceControls.registerSignificanceElement(label, { scopeId: 'box' });
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
    svg.remove();
  });

  test('an inactive owner cannot reopen its controls on another tab', () => {
    const previousMain = window.Main;
    window.Main = { session: { getActiveTab: () => ({ id: 'box-b' }) } };
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const getThickness = jest.fn(() => 1);
    window.Shared.significanceControls.registerSignificanceElement(path, {
      scopeId: 'box', ownerTabId: 'box-a', disableOverlay: true, getThickness
    });
    const event = new MouseEvent('click', { cancelable: true });
    path.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(getThickness).not.toHaveBeenCalled();
    window.Main = previousMain;
  });

  test('deactivating the panel owner closes it and releases its callbacks', () => {
    const previousMain = window.Main;
    window.Main = { session: { getActiveTab: () => ({ id: 'box-a' }) } };
    const controls = window.Shared.significanceControls;
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'box';
    host.dataset.workspaceTabId = 'box-a';
    document.body.appendChild(host);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const onLabelModeChange = jest.fn();
    document.body.appendChild(path);
    controls.registerSignificanceElement(path, {
      scopeId: 'box', ownerTabId: 'box-a', disableOverlay: true,
      getLabelMode: () => 'decision', onLabelModeChange
    });
    path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const panel = document.querySelector('.significance-controls-panel');
    const selector = panel?.querySelector('[data-significance-label-mode]');
    expect(panel?.dataset.open).toBe('1');
    expect(controls.deactivateTab('box-b')).toBe(false);
    expect(panel?.dataset.open).toBe('1');
    expect(controls.deactivateTab('box-a', { reason: 'test-switch' })).toBe(true);
    expect(panel?.dataset.open).toBe('0');
    selector.value = 'p';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onLabelModeChange).not.toHaveBeenCalled();
    host.remove();
    path.remove();
    window.Main = previousMain;
  });
});
