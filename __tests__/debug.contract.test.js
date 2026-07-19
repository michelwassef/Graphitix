describe('Shared debug contract', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
  });

  test('one canonical module owns the debug API across shared modules', () => {
    require('../js/shared/debug.js');
    const api = {
      setDebugLogging: window.Shared.setDebugLogging,
      enableDebugLogging: window.Shared.enableDebugLogging,
      disableDebugLogging: window.Shared.disableDebugLogging,
      isDebugEnabled: window.Shared.isDebugEnabled,
      debug: window.Shared.debug
    };

    require('../js/shared/loaders.js');
    require('../js/shared/debounce.js');
    require('../js/shared/performance.js');
    require('../js/shared/workers.js');
    require('../js/shared/dataPipeline.js');
    require('../js/shared/boxStatsModel.js');

    Object.entries(api).forEach(([name, implementation]) => {
      expect(window.Shared[name]).toBe(implementation);
    });
  });

  test('all debug helpers share the same state', () => {
    require('../js/shared/debug.js');

    expect(window.Shared.isDebugEnabled()).toBe(false);
    expect(window.Shared.enableDebugLogging()).toBe(true);
    expect(window.Shared.isDebugEnabled()).toBe(true);
    expect(window.Shared.disableDebugLogging()).toBe(false);
    expect(window.Shared.isDebugEnabled()).toBe(false);
  });
});
