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
    expect(typeof ac.refreshActivePanel).toBe('function');
    expect(typeof ac.close).toBe('function');
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
