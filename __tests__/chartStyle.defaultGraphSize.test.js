describe('chartStyle default graph sizing', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth
    });
  });

  test('uses an 80 percent default frame without changing its square baseline', () => {
    jest.resetModules();
    delete window.Shared;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 0 });
    Object.defineProperty(document.body, 'clientWidth', { configurable: true, value: 0 });

    require('../js/shared/chartStyle.js');

    const sizing = window.Shared.chartStyle.getDefaultGraphSize();
    expect(window.Shared.chartStyle.DEFAULT_GRAPH_SIZE_SCALE).toBe(0.8);
    expect(sizing).toEqual({ width: 427, height: 427 });
  });
});
