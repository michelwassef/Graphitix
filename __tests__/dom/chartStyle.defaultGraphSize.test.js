describe('chartStyle default graph sizing', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
  });

  test.each([320, 1280, 1920, 2560])('uses the same figure dimensions at browser width %i', width => {
    jest.resetModules();
    delete window.Shared;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

    require('../../js/shared/chartStyle.js');

    const sizing = window.Shared.chartStyle.getDefaultGraphSize();
    expect(sizing).toEqual({ width: 360, height: 360 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width + 1000 });
    expect(window.Shared.chartStyle.getDefaultGraphSize()).toEqual(sizing);
    expect(window.Shared.chartStyle.getSquareGraphSizing()).toMatchObject(sizing);
  });

  test.each([
    [320, 900, 0.237037037], [640, 900, 0.474074074],
    [1024, 900, 0.758518519], [1280, 900, 0.948148148],
    [1920, 900, 1], [1920, 225, 0.5]
  ])('uses one viewing scale at browser size %i x %i', (width, height, expected) => {
    jest.resetModules();
    delete window.Shared;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    require('../../js/shared/chartStyle.js');
    expect(window.Shared.chartStyle.getDefaultGraphViewScale()).toBeCloseTo(expected, 8);
  });
});
