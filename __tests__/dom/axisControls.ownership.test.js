// Smoke tests for js/shared/axisControls.js.
// The module is a DOM-driven UI panel; these tests verify it loads without error,
// exposes its public API, and that API calls are safe when no DOM panel exists.

function loadModule() {
  jest.resetModules();
  delete window.Shared;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  require('../../js/shared/axisControls.js');
  console.error.mockRestore();
  return window.Shared.axisControls;
}

describe('axisControls — tab ownership', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('an open toolbar cannot mutate a different active tab', () => {
    jest.resetModules();
    delete window.Shared;
    let activeTabId = 'tab-a';
    window.Main = {
      session: {
        getActiveTab: () => ({ id: activeTabId })
      }
    };
    require('../../js/shared/workspaceToolbarAccess.js');
    require('../../js/shared/workspaceToolbar.js');
    require('../../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);
    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(axis);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    let thickness = 1;
    window.Shared.axisControls.registerAxisElement(axis, {
      axis: 'x',
      scopeId: 'test',
      getThickness: () => thickness,
      getColor: () => '#000000',
      onThicknessChange: value => { thickness = value; },
      onColorChange: () => {}
    });
    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = host.querySelector('.axis-controls-panel__field--style input[type="number"]');
    expect(input).toBeTruthy();

    activeTabId = 'tab-b';
    input.value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(thickness).toBe(1);

    activeTabId = 'tab-a';
    input.value = '3';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(thickness).toBe(3);
  });
});

describe('axisControls — safe calls with no DOM panel', () => {
  let ac;
  beforeEach(() => { ac = loadModule(); });

  test('refreshActivePanel with no active panel does not throw', () => {
    expect(() => ac.refreshActivePanel()).not.toThrow();
  });

  test('refreshActivePanel with string reason does not throw', () => {
    expect(() => ac.refreshActivePanel('resize')).not.toThrow();
  });

  test('refreshActivePanel with scopeId filter returns false (no match)', () => {
    const result = ac.refreshActivePanel({ scopeId: 'nonexistent', reason: 'test' });
    expect(result === false || result === undefined || result == null).toBe(true);
  });

  test('close does not throw when panel is not open', () => {
    expect(() => ac.close()).not.toThrow();
  });
});

describe('axisControls — render-cache interaction rehydration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.resetModules();
    delete window.Shared;
    require('../../js/shared/axisControls.js');
  });

  test('serialized axes recover semantic metadata, live handlers, and reuse the cached hit target', () => {
    const ac = window.Shared.axisControls;
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    axis.setAttribute('x1', '0');
    axis.setAttribute('y1', '10');
    axis.setAttribute('x2', '100');
    axis.setAttribute('y2', '10');
    svg.appendChild(axis);
    root.appendChild(svg);
    document.body.appendChild(root);

    expect(ac.registerAxisElement(axis, {
      axis: 'x',
      scopeId: 'box',
      tabId: 'tab-a',
      axisSegment: 'combined',
      getAxisBounds: () => ({ min: -2, max: 12 }),
      getEffectiveTickInterval: () => 2,
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {}
    })).toBe(true);
    expect(root.querySelectorAll('[data-axis-hit-target="1"]')).toHaveLength(1);
    expect(root.querySelector('[data-axis-hit-target="1"]').dataset.axisSegment).toBe('combined');

    const cachedMarkup = svg.outerHTML;
    root.innerHTML = cachedMarkup;
    const restoredSvg = root.querySelector('svg');
    const restoredAxis = restoredSvg.querySelector('[data-axis-control="1"]:not([data-axis-hit-target="1"])');
    expect(ac.isAxisElementBound(restoredAxis)).toBe(false);
    expect(ac.getAxisElementMetadata(restoredAxis)).toEqual(expect.objectContaining({
      axis: 'x',
      axisSegment: 'combined',
      scopeId: 'box',
      tabId: 'tab-a',
      bounds: { min: -2, max: 12 },
      effectiveTickInterval: 2
    }));

    const factory = jest.fn((axisKey, element, meta) => ({
      axis: axisKey,
      axisSegment: meta.axisSegment,
      scopeId: meta.scopeId,
      tabId: meta.tabId,
      getAxisBounds: () => meta.bounds,
      getEffectiveTickInterval: () => meta.effectiveTickInterval,
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {}
    }));

    expect(ac.rehydrateAxisElements(restoredSvg, factory)).toBe(true);
    expect(ac.isAxisElementBound(restoredAxis)).toBe(true);
    expect(restoredSvg.querySelectorAll('[data-axis-hit-target="1"]')).toHaveLength(1);

    expect(ac.rehydrateAxisElements(restoredSvg, factory)).toBe(true);
    expect(restoredSvg.querySelectorAll('[data-axis-hit-target="1"]')).toHaveLength(1);
    expect(factory).toHaveBeenCalledWith('x', restoredAxis, expect.objectContaining({
      axisSegment: 'combined',
      bounds: { min: -2, max: 12 },
      effectiveTickInterval: 2
    }));
  });

  test('distinct semantic axis segments keep distinct hit overlays', () => {
    const ac = window.Shared.axisControls;
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const addAxis = (segment, y1, y2) => {
      const axis = document.createElementNS(svg.namespaceURI, 'line');
      axis.setAttribute('x1', '10');
      axis.setAttribute('y1', String(y1));
      axis.setAttribute('x2', '10');
      axis.setAttribute('y2', String(y2));
      axis.getBBox = () => ({ x: 10, y: y1, width: 0, height: Math.abs(y2 - y1) });
      svg.appendChild(axis);
      expect(ac.registerAxisElement(axis, {
        axis: 'y',
        scopeId: 'box',
        tabId: 'tab-a',
        axisSegment: segment,
        getThickness: () => 1,
        getColor: () => '#000000',
        onThicknessChange: () => {},
        onColorChange: () => {}
      })).toBe(true);
      return axis;
    };
    root.appendChild(svg);
    const first = addAxis('0', 10, 40);
    const combined = addAxis('combined', 10, 90);
    const overlays = Array.from(svg.querySelectorAll('[data-axis-hit-target="1"]'));

    expect(overlays).toHaveLength(2);
    expect(first.__axisControlOverlay.element).not.toBe(combined.__axisControlOverlay.element);
    expect(overlays.map(node => node.dataset.axisSegment).sort()).toEqual(['0', 'combined']);
  });

  test('legacy cached axes without data-axis-key infer their axis from line geometry', () => {
    const ac = window.Shared.axisControls;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = `
      <line data-axis-control="1" x1="0" y1="20" x2="100" y2="20"></line>
      <line data-axis-control="1" x1="15" y1="0" x2="15" y2="100"></line>
    `;
    document.body.appendChild(svg);
    const seen = [];
    expect(ac.rehydrateAxisElements(svg, axisKey => {
      seen.push(axisKey);
      return {
        axis: axisKey,
        scopeId: 'legacy',
        getThickness: () => 1,
        getColor: () => '#000000',
        onThicknessChange: () => {},
        onColorChange: () => {}
      };
    })).toBe(true);
    expect(seen).toEqual(['x', 'y']);
    expect(Array.from(svg.querySelectorAll('[data-axis-control="1"]:not([data-axis-hit-target="1"])'))
      .every(node => ac.isAxisElementBound(node))).toBe(true);
  });
});

