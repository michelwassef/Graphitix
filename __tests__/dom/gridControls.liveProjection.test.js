describe('Shared.gridControls live projection', () => {
  let activeTabId;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.Shared = {};
    activeTabId = 'workspace-grid-test';
    window.Main = { session: { getActiveTab: () => activeTabId ? { id: activeTabId } : null } };
    jest.resetModules();
    require('../../js/shared/workspaceToolbarAccess.js');
    require('../../js/shared/workspaceToolbar.js');
    require('../../js/shared/gridControls.js');
  });

  test('updates rendered grid style and rebuilds its hit layer without replacing the SVG', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', '100');
    line.setAttribute('stroke', '#dddddd');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('data-grid-control', '1');
    svg.appendChild(line);
    svg.dataset.workspaceTabId = activeTabId;
    document.body.appendChild(svg);

    window.Shared.gridControls.registerGraphElement(svg, {
      scopeId: 'hist',
      getStyle: () => ({ color: '#dddddd', thickness: 1, pattern: 'solid', transparency: 0 })
    });

    expect(window.Shared.gridControls.applyStyleToTarget(svg, {
      color: '#123456',
      thickness: 2,
      pattern: 'dashed',
      transparency: 25
    })).toBe(true);
    expect(line.getAttribute('stroke')).toBe('#123456');
    expect(line.getAttribute('stroke-width')).toBe('3');
    expect(line.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(line.getAttribute('stroke-opacity')).toBe('0.75');
    expect(svg.querySelector('[data-grid-hit-overlay="1"]')).toBeTruthy();
  });

  test('projects compound path grids through the same toolbar and preserves path hit geometry', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    const d = 'M 0 10 L 100 10 M 0 20 L 100 20';
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#dddddd');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('data-grid-control', '1');
    svg.appendChild(path);
    svg.dataset.workspaceTabId = activeTabId;
    document.body.appendChild(svg);

    window.Shared.gridControls.registerGraphElement(svg, {
      scopeId: 'hist',
      getStyle: () => ({ color: '#dddddd', thickness: 1, pattern: 'solid', transparency: 0 })
    });

    expect(window.Shared.gridControls.applyStyleToTarget(svg, {
      color: '#654321',
      thickness: 2,
      pattern: 'dotted',
      transparency: 40
    })).toBe(true);
    expect(path.getAttribute('stroke')).toBe('#654321');
    expect(path.getAttribute('stroke-width')).toBe('3');
    expect(path.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(path.getAttribute('stroke-opacity')).toBe('0.6');

    const hit = svg.querySelector('path[data-grid-hit-overlay="1"]');
    expect(hit).toBeTruthy();
    expect(hit.getAttribute('d')).toBe(d);
    expect(hit.getAttribute('pointer-events')).toBe('stroke');
  });

  test('declines projection when the committed frame has no grid targets', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    expect(window.Shared.gridControls.applyStyleToTarget(svg, {
      color: '#123456',
      thickness: 2,
      pattern: 'solid',
      transparency: 0
    })).toBe(false);
  });

  test('runs registered callbacks only for an exact, known owner', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.workspaceTabId = 'workspace-owner-a';
    activeTabId = 'workspace-owner-a';
    document.body.appendChild(svg);
    const getStyle = jest.fn(() => ({ color: '#123456', thickness: 1, pattern: 'solid', transparency: 0 }));
    const onStyleChange = jest.fn();

    window.Shared.gridControls.registerGraphElement(svg, {
      scopeId: 'hist',
      getStyle,
      onStyleChange
    });

    const registered = svg.__gridControlConfig;
    expect(registered.ownerTabId).toBe('workspace-owner-a');
    expect(registered.getStyle()).toEqual({ color: '#123456', thickness: 1, pattern: 'solid', transparency: 0 });
    registered.onStyleChange({ color: '#654321' });
    expect(onStyleChange).toHaveBeenCalledTimes(1);

    activeTabId = 'workspace-owner-b';
    expect(registered.getStyle()).toBeUndefined();
    registered.onStyleChange({ color: '#abcdef' });
    expect(onStyleChange).toHaveBeenCalledTimes(1);

    activeTabId = null;
    expect(registered.getStyle()).toBeUndefined();
    registered.onStyleChange({ color: '#fedcba' });
    expect(onStyleChange).toHaveBeenCalledTimes(1);
  });

  test('rejects callbacks when the graph or active tab has no owner identity', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    const getStyle = jest.fn(() => ({ color: '#123456', thickness: 1 }));

    window.Shared.gridControls.registerGraphElement(svg, { scopeId: 'hist', getStyle });

    expect(svg.__gridControlConfig.ownerTabId).toBeNull();
    expect(svg.__gridControlConfig.getStyle()).toBeUndefined();

    svg.dataset.workspaceTabId = 'workspace-owner-a';
    window.Shared.gridControls.registerGraphElement(svg, { scopeId: 'hist', getStyle });
    activeTabId = null;
    expect(svg.__gridControlConfig.ownerTabId).toBe('workspace-owner-a');
    expect(svg.__gridControlConfig.getStyle()).toBeUndefined();
  });

  test('rejects a queued grid-panel open after the active owner changes', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.workspaceTabId = 'workspace-owner-a';
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('data-grid-control', '1');
    svg.appendChild(line);
    document.body.appendChild(svg);
    const queuedFrames = [];
    const previousAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    };
    window.Shared.getWorkspaceToolbarApi = jest.fn();

    try {
      activeTabId = 'workspace-owner-a';
      window.Shared.gridControls.registerGraphElement(svg, { scopeId: 'hist' });
      line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(queuedFrames).toHaveLength(1);

      activeTabId = 'workspace-owner-b';
      queuedFrames.shift()();

      expect(window.Shared.getWorkspaceToolbarApi).not.toHaveBeenCalled();
    } finally {
      window.requestAnimationFrame = previousAnimationFrame;
    }
  });

  test('closes the grid panel when its owner tab deactivates', () => {
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    document.body.appendChild(host);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.workspaceTabId = 'workspace-owner-a';
    document.body.appendChild(svg);

    activeTabId = 'workspace-owner-a';
    const panel = window.Shared.gridControls.ensurePanel();
    window.Shared.gridControls.show({
      scopeId: 'hist',
      ownerTabId: activeTabId,
      target: svg,
      host
    });
    expect(panel.dataset.open).toBe('1');
    expect(window.Shared.gridControls.deactivateTab('workspace-owner-b', { reason: 'other-owner' })).toBe(false);
    expect(panel.dataset.open).toBe('1');
    expect(window.Shared.gridControls.deactivateTab('workspace-owner-a', { reason: 'test-switch' })).toBe(true);
    expect(panel.dataset.open).toBe('0');
  });
});
