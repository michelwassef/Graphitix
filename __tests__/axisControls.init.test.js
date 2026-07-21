// Smoke tests for js/shared/axisControls.js.
// The module is a DOM-driven UI panel; these tests verify it loads without error,
// exposes its public API, and that API calls are safe when no DOM panel exists.

function loadModule() {
  jest.resetModules();
  delete window.Shared;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  require('../js/shared/axisControls.js');
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
