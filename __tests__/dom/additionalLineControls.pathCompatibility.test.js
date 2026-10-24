describe('Shared line controls and complete-panel transitions', () => {
  let activeTabId;

  beforeEach(() => {
    document.body.innerHTML = '<div id="lineToolbarHost" class="font-toolbar-host"></div>';
    window.Shared = {};
    activeTabId = 'tab-a';
    window.Main = { session: { getActiveTab: () => activeTabId ? { id: activeTabId } : null } };
    jest.resetModules();
    require('../../js/shared/workspaceToolbar.js');
    require('../../js/shared/workspaceToolbarAccess.js');
    require('../../js/shared/additionalLineControls.js');
  });

  test.each(['line', 'grid', 'significance'])('trace -> %s -> trace replaces whole panels', kind => {
    require('../../js/shared/symbolToolbar.js');
    require('../../js/shared/gridControls.js');
    require('../../js/shared/significanceControls.js');
    const { Shared } = window;
    const host = document.getElementById('lineToolbarHost');
    host.dataset.fontToolbarScope = 'transition';
    host.dataset.workspaceTabId = 'tab-a';
    const anchor = document.createElement('button');
    anchor.id = 'transitionFontHost';
    host.before(anchor);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.workspaceTabId = 'tab-a';
    const target = document.createElementNS(svg.namespaceURI, 'path');
    target.setAttribute('d', 'M0,0 L100,0');
    svg.appendChild(target);
    document.body.appendChild(svg);
    const showTrace = () => Shared.symbolToolbar.show({
      anchor, host, scopeId: 'transition', target, ownerTabId: 'tab-a', panelTitle: 'Trace',
      size: { enabled: false }
    });
    showTrace();
    expect(host.querySelector('.workspace-toolbar__panel--symbol')).not.toBeNull();
    const config = { host, scopeId: 'transition', target, ownerTabId: 'tab-a', appendToHost: false };
    if(kind === 'line') Shared.additionalLineControls.show(config);
    if(kind === 'grid') Shared.gridControls.show(config);
    if(kind === 'significance') {
      Shared.significanceControls.registerSignificanceElement(target, { ...config, disableOverlay: true });
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(host.querySelector('.workspace-toolbar__panel--symbol')).toBeNull();
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild.querySelector('input,select,button')).not.toBeNull();
    showTrace();
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild.classList.contains('workspace-toolbar__panel--symbol')).toBe(true);
  });

  test('edits a compound path through the existing line toolbar without changing its geometry', () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.dataset.workspaceTabId = 'tab-a';
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
        thicknessLabel: 'Thickness',
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

  test('does not open an inactive owner line control, and deactivation closes its panel', () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.dataset.workspaceTabId = 'tab-a';
    const line = document.createElementNS(ns, 'line');
    svg.appendChild(line);
    document.body.appendChild(svg);
    window.Shared.additionalLineControls.registerAdditionalLineElement(line, {
      scopeId: 'line',
      host: document.getElementById('lineToolbarHost'),
      getThickness: () => 1,
      onThicknessChange: () => {}
    });

    activeTabId = 'tab-b';
    line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.additional-line-controls-panel')?.dataset.open).not.toBe('1');

    activeTabId = 'tab-a';
    line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const panel = document.querySelector('.additional-line-controls-panel');
    expect(panel?.dataset.open).toBe('1');
    expect(window.Shared.additionalLineControls.deactivateTab('tab-b', { reason: 'other-owner' })).toBe(false);
    expect(panel.dataset.open).toBe('1');
    expect(window.Shared.additionalLineControls.deactivateTab('tab-a', { reason: 'test-switch' })).toBe(true);
    expect(panel.dataset.open).toBe('0');
  });

  test('rehydrates an axis line from saved identity and reuses its cached hit target', () => {
    const ns = 'http://www.w3.org/2000/svg';
    const host = document.getElementById('lineToolbarHost');
    host.dataset.fontToolbarScope = 'line';
    host.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS(ns, 'svg');
    svg.dataset.workspaceTabId = 'tab-a';
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '25');
    line.setAttribute('x2', '100');
    line.setAttribute('y2', '25');
    svg.appendChild(line);
    document.body.appendChild(svg);

    let entry = { value: 0, lineColor: '#555555', lineWidth: 1, linePattern: 'dotted', lineTransparency: 0 };
    const createConfig = (axis, index) => window.Shared.additionalLineControls.createAxisLineConfig({
      scopeId: 'line',
      tabId: 'tab-a',
      axis,
      index,
      getEntry: () => entry,
      updateEntry: (_axis, _index, next) => { entry = next; }
    });
    window.Shared.additionalLineControls.registerAdditionalLineElement(line, createConfig('y', 0));
    expect(line.dataset.additionalLineAxis).toBe('y');
    expect(line.dataset.additionalLineIndex).toBe('0');
    expect(svg.querySelectorAll('[data-additional-line-overlay="1"]')).toHaveLength(1);

    const restoredSvg = svg.cloneNode(true);
    svg.replaceWith(restoredSvg);
    const restoredLine = restoredSvg.querySelector('line');
    expect(window.Shared.additionalLineControls.rehydrateAdditionalLineElements(restoredSvg, createConfig)).toBe(true);
    expect(restoredSvg.querySelectorAll('[data-additional-line-overlay="1"]')).toHaveLength(1);
    expect(typeof restoredLine.__additionalLineControlHandler).toBe('function');
    expect(typeof restoredLine.nextElementSibling.__additionalLineControlHandler).toBe('function');

    restoredLine.nextElementSibling.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.additional-line-controls-panel')?.dataset.open).toBe('1');
  });

  test('rejects cached axis lines that lack saved identity so the component redraws them', () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const line = document.createElementNS(ns, 'line');
    line.dataset.additionalLineControl = '1';
    svg.appendChild(line);
    document.body.appendChild(svg);

    expect(window.Shared.additionalLineControls.rehydrateAdditionalLineElements(svg, () => null)).toBe(false);
    expect(line.__additionalLineControlHandler).toBeUndefined();
  });
});
