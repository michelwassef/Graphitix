describe('Main.components.ensureComponent', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.window !== 'object') {
      global.window = {};
    }
    global.window.Main = undefined;
    global.window.Components = undefined;
    global.window.Shared = undefined;
  });

  test('returns loaded component synchronously when present globally', () => {
    if (typeof global.window.Components !== 'object') {
      global.window.Components = {};
    }
    if (typeof global.window.Shared !== 'object') {
      global.window.Shared = { debounceFrame: fn => fn };
    }
    if (typeof global.window.Components !== 'object') {
      global.window.Components = {};
    }
    const component = { ready: true, ensure: jest.fn(() => null) };
    global.window.Components.box = component;
    require('../js/main/components.js');

    const result = window.Main.components.ensureComponent('box');

    expect(component.ensure).toHaveBeenCalled();
    expect(result).toBe(component);
  });

  test('resolves loaded component asynchronously when ensure returns a promise', async () => {
    if (typeof global.window.Components !== 'object') {
      global.window.Components = {};
    }
    if (typeof global.window.Shared !== 'object') {
      global.window.Shared = { debounceFrame: fn => fn };
    }
    const component = { ready: false, ensure: jest.fn(() => Promise.resolve('ok')) };
    global.window.Components.box = component;
    require('../js/main/components.js');

    const result = window.Main.components.ensureComponent('box');

    expect(result).toBeInstanceOf(Promise);
    const resolved = await result;
    expect(resolved).toBe(component);
    expect(component.ensure).toHaveBeenCalled();
  });
});
