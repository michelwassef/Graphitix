const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('Scatter point Fill/Shape overrides', () => {
  beforeEach(() => {
    jest.resetModules();
    initializeWorkspaceHarness();
    require('../js/components/scatter.js');
  });

  test('keeps an edited point style when unique labels use uniform defaults', () => {
    const hooks = window.Components.scatter.__testHooks;

    expect(hooks.resolveLabelVisualStyle('sample-8', {
      useUniformLabelStyle: true,
      fill: '#000000',
      fallbackShape: 'circle',
      styleOverride: { fill: '#ff0000', shape: 'triangle' }
    })).toEqual({
      fill: '#ff0000',
      shape: 'triangle'
    });

    expect(hooks.resolveLabelVisualStyle('sample-9', {
      useUniformLabelStyle: true,
      fill: '#000000',
      fallbackShape: 'square'
    })).toEqual({
      fill: '#000000',
      shape: 'circle'
    });
  });

  test('applies Global shape when unique-label shape maps are empty', () => {
    const hooks = window.Components.scatter.__testHooks;
    expect(hooks.applyGlobalShape('square')).toBe('square');

    expect(hooks.resolveLabelVisualStyle('sample-8', {
      useUniformLabelStyle: true,
      fill: '#000000',
      fallbackShape: 'circle'
    }).shape).toBe('square');
  });

  test('atomically restores heterogeneous point shapes after Global shape', () => {
    const hooks = window.Components.scatter.__testHooks;
    hooks.applyAggregateSymbolStyleState({
      globalShape: null,
      labelShapes: {},
      labelColors: {},
      labelStyles: {
        A: { shape: 'triangle' },
        B: { shape: 'diamond' }
      }
    }, 'test-seed');
    const before = hooks.captureAggregateSymbolStyleState();

    hooks.applyGlobalShape('square');
    expect(hooks.resolveLabelVisualStyle('A', { useUniformLabelStyle: true }).shape).toBe('square');

    expect(hooks.applyAggregateSymbolStyleState(before, 'undo')).toBe(true);
    expect(hooks.resolveLabelVisualStyle('A', { useUniformLabelStyle: true }).shape).toBe('triangle');
    expect(hooks.resolveLabelVisualStyle('B', { useUniformLabelStyle: true }).shape).toBe('diamond');
  });
});
