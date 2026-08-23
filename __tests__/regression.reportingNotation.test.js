describe('Regression equation reporting notation', () => {
  let regressionTools;

  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    window.jStat = require('../libs/jstat.min.js');
    global.Shared = window.Shared;
    global.jStat = window.jStat;
    require('../js/shared/regression.js');
    regressionTools = window.Shared.regressionTools;
  });

  afterEach(() => {
    delete global.Shared;
    delete global.jStat;
    delete window.Shared;
    delete window.jStat;
  });

  test('linear equations use explicit mathematical signs without + - artifacts', () => {
    const model = regressionTools.fitRegression([
      { x: 0, y: 4 },
      { x: 1, y: 3 },
      { x: 2, y: 2 },
      { x: 3, y: 1 }
    ], { modelId: 'linear', method: 'ols' });
    expect(model.summary.equation).toBe('y = 4.0000 − 1.0000x');
    expect(model.summary.equation).not.toMatch(/\+\s*-/);
  });

  test('polynomial equations render powers as mathematical superscripts', () => {
    const model = regressionTools.fitRegression([
      { x: -2, y: 5 },
      { x: -1, y: 2 },
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 5 }
    ], { modelId: 'quadratic', method: 'ols' });
    expect(model.summary.equation).toContain('x²');
    expect(model.summary.equation).not.toContain('x^');
  });

  test('exponential equations use exp(...) instead of exposing LaTeX/source notation', () => {
    const model = regressionTools.fitRegression([
      { x: 0, y: 2 },
      { x: 1, y: 2 * Math.exp(0.5) },
      { x: 2, y: 2 * Math.exp(1) },
      { x: 3, y: 2 * Math.exp(1.5) }
    ], { modelId: 'exponential', method: 'ols' });
    expect(model.summary.equation).toMatch(/^y = \d+(?:\.\d+)? exp\([−\d.]+x\)$/);
    expect(model.summary.equation).not.toMatch(/e\^|\^\{|10\^|\*\s*exp|·\s*e|exp\{/);
  });

  test('representative nonlinear catalog equations contain no programming or LaTeX power syntax', () => {
    const representative = [
      regressionTools.fitRegression([
        { x: -2, y: 1.2 }, { x: -1, y: 2.8 }, { x: 0, y: 4.1 }, { x: 1, y: 2.9 }, { x: 2, y: 1.3 }
      ], { modelId: 'gaussian', method: 'ols' }),
      regressionTools.fitRegression([
        { x: 0.1, y: 0.5 }, { x: 0.5, y: 1.7 }, { x: 1, y: 2.5 }, { x: 2, y: 3.3 }, { x: 4, y: 4.0 }
      ], { modelId: 'bindingSaturation', method: 'ols' })
    ].filter(Boolean);
    representative.forEach(model => {
      expect(String(model.summary?.equation || '')).not.toMatch(/e\^|\^\{|10\^|\*\s*exp|exp\{|\/\{/);
    });
  });
});
