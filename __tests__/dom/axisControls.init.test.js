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

describe('axisControls — module shape', () => {
  let ac;
  beforeEach(() => { ac = loadModule(); });

  test('exposes axisControls namespace on window.Shared', () => {
    expect(window.Shared).toBeDefined();
    expect(typeof window.Shared.axisControls).toBe('object');
    expect(window.Shared.axisControls).not.toBeNull();
  });

  test('public API functions exist', () => {
    expect(typeof ac.ensurePanel).toBe('function');
    expect(typeof ac.registerAxisElement).toBe('function');
    expect(typeof ac.rehydrateAxisElements).toBe('function');
    expect(typeof ac.getAxisElementMetadata).toBe('function');
    expect(typeof ac.isAxisElementBound).toBe('function');
    expect(typeof ac.measureRenderedAxes).toBe('function');
    expect(typeof ac.refreshActivePanel).toBe('function');
    expect(typeof ac.close).toBe('function');
  });
});
describe('axisControls — rendered axis measurement', () => {
  test('measures projected 3D x/y axis lines independently of their angle', () => {
    const ac = loadModule();
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.getBoundingClientRect = () => ({ width: 200, height: 300, left: 0, top: 0, right: 200, bottom: 300 });
    const addAxis = (key, x2, y2) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('data-axis-line', '1');
      line.setAttribute('data-axis-key', key);
      svg.appendChild(line);
    };
    addAxis('x', 100, 50);
    addAxis('y', 20, 100);
    root.appendChild(svg);

    const measured = ac.measureRenderedAxes(root);
    expect(measured.x).toBeCloseTo(Math.hypot(100, 50) * 2, 9);
    expect(measured.y).toBeCloseTo(Math.hypot(20, 100) * 2, 9);
  });

  test('prefers semantic ownership for non-orthogonal registered axes', () => {
    const ac = loadModule();
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const addAxis = (key, x2, y2) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('data-axis-control', '1');
      line.setAttribute('data-axis-key', key);
      svg.appendChild(line);
      return line;
    };
    const xAxis = addAxis('x', 80, 40);
    const yAxis = addAxis('y', 30, 90);
    root.appendChild(svg);

    const measured = ac.measureRenderedAxes(root);
    expect(measured.xElement).toBe(xAxis);
    expect(measured.yElement).toBe(yAxis);
  });

  test('discovers semantic compound path axes and retains segment metadata', () => {
    const ac = loadModule();
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const addAxis = (key, width, height, segment) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', key === 'x' ? 'M 10 90 L 40 90 M 60 90 L 90 90' : 'M 10 90 L 10 60 M 10 40 L 10 10');
      path.setAttribute('data-axis-control', '1');
      path.setAttribute('data-axis-key', key);
      path.setAttribute('data-axis-segment', segment);
      path.getBoundingClientRect = () => ({ width, height });
      svg.appendChild(path);
      return path;
    };
    const xAxis = addAxis('x', 80, 1, 'compound');
    const yAxis = addAxis('y', 1, 80, 'compound');
    root.appendChild(svg);

    const measured = ac.measureRenderedAxes(root);
    expect(measured.xElement).toBe(xAxis);
    expect(measured.yElement).toBe(yAxis);
    expect(ac.getAxisElementMetadata(xAxis)).toEqual(expect.objectContaining({
      axis: 'x',
      axisSegment: 'compound'
    }));
  });
});

describe('axisControls — effective tick interval', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('shows the rendered automatic interval and increments from it', () => {
    jest.resetModules();
    delete window.Shared;
    require('../../js/shared/workspaceToolbarAccess.js');
    require('../../js/shared/workspaceToolbar.js');
    require('../../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', '0');
    axis.setAttribute('y1', '10');
    axis.setAttribute('x2', '100');
    axis.setAttribute('y2', '10');
    svg.appendChild(axis);
    document.body.appendChild(svg);

    let storedInterval = null;
    window.Shared.axisControls.registerAxisElement(axis, {
      axis: 'x',
      scopeId: 'test',
      getTickInterval: () => storedInterval,
      getEffectiveTickInterval: () => 5,
      onTickIntervalChange: value => { storedInterval = value; },
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {},
      isTickIntervalEnabled: () => true
    });

    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = host.querySelector('.axis-controls-panel__field--numeric input[type="number"]');
    expect(input).toBeTruthy();
    expect(input.value).toBe('5');
    expect(input.dataset.usesDefault).toBe('1');

    input.stepUp();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(storedInterval).toBe(6);
    expect(input.value).toBe('6');
    expect(input.dataset.usesDefault).toBe('0');

    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', '0');
    yAxis.setAttribute('y1', '0');
    yAxis.setAttribute('x2', '0');
    yAxis.setAttribute('y2', '100');
    svg.appendChild(yAxis);
    let storedYInterval = null;
    window.Shared.axisControls.registerAxisElement(yAxis, {
      axis: 'y',
      scopeId: 'test',
      getTickInterval: () => storedYInterval,
      getEffectiveTickInterval: () => 0.025,
      onTickIntervalChange: value => { storedYInterval = value; },
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {},
      isTickIntervalEnabled: () => true
    });
    yAxis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(input.value).toBe('0.025');
    expect(input.step).toBe('1');
    input.stepUp();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(storedYInterval).toBeCloseTo(1.025, 12);
    input.stepDown();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(storedYInterval).toBeCloseTo(0.025, 12);
  });
});
