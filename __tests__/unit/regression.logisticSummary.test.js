'use strict';

describe('Regression logistic summary model', () => {
  let regressionTools;

  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    const jStatModule = require('jstat');
    global.jStat = jStatModule?.jStat || jStatModule;
    require('../../js/shared/regression.js');
    regressionTools = global.Shared.regressionTools;
  });

  afterEach(() => {
    delete global.Shared;
    delete global.jStat;
  });

  test('logistic regression summarizes non-binary responses with IC50', () => {
    const points = [
      { x: -9.0, y: 1525 },
      { x: -8.2, y: 1480 },
      { x: -7.6, y: 1320 },
      { x: -7.0, y: 1025 },
      { x: -6.5, y: 760 },
      { x: -6.0, y: 500 },
      { x: -5.4, y: 340 },
      { x: -4.8, y: 290 },
      { x: -4.2, y: 260 }
    ];

    const model = regressionTools.fitRegression(points, {
      mode: 'logistic',
      preferDoseResponse: true,
      alpha: 0.05
    });
    expect(model).toBeTruthy();
    expect(model.mode).toBe('doseResponse4pl');
    expect(Number.isFinite(model.summary?.parameters?.IC50)).toBe(true);
    expect(Number.isFinite(model.summary?.parameters?.LogIC50)).toBe(true);

    const summary = regressionTools.createSummary(model);
    expect(summary).toBeTruthy();
    expect(summary.mode).toBe('doseResponse4pl');
    expect(Number.isFinite(summary.summary?.parameters?.IC50)).toBe(true);

    const ic50Stat = Array.isArray(summary.coefficientStats)
      ? summary.coefficientStats.find(entry => entry.term === 'IC50')
      : null;
    expect(ic50Stat).toBeTruthy();
    expect(Number.isFinite(ic50Stat.estimate)).toBe(true);
  });
});
