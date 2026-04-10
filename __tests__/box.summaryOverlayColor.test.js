describe('Box summary overlay color precedence', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('explicit summary color overrides grayscale fallback', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveBoxSummaryOverlayColor).toBe('function');

    const color = hooks.resolveBoxSummaryOverlayColor(
      { color: '#ff0000' },
      '#7a7a7a',
      '#2e2e2e',
      { schemeId: 'grayscale' }
    );

    expect(color).toBe('#ff0000');
  });

  test('grayscale fallback stays black when no explicit summary color is set', () => {
    const color = hooks.resolveBoxSummaryOverlayColor(
      null,
      '#7a7a7a',
      '#2e2e2e',
      { schemeId: 'grayscale' }
    );

    expect(color).toBe('#000000');
  });
});
