describe('Shared.stats.goodnessOfFit', () => {
  let stats;

  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    require('../js/shared/stats.js');
    stats = global.Shared.stats;
    console.debug('Debug: stats.goodnessOfFit test setup complete');
  });

  it('computes goodness-of-fit metrics for approximately normal data', () => {
    const sample = [-1.12, -0.83, -0.41, -0.2, -0.05, 0.12, 0.38, 0.74, 1.03, 1.28];
    const fit = stats.fitDistribution(sample, { distribution: 'normal' });
    const gof = stats.goodnessOfFit(sample, { distribution: 'normal', fit, alpha: 0.05 });
    expect(gof).toBeTruthy();
    expect(gof.ks.statistic).toBeGreaterThanOrEqual(0);
    expect(gof.ks.pValue).toBeLessThanOrEqual(1);
    expect(gof.ad.pValue).toBeLessThanOrEqual(1);
    expect(gof.ad.pValue).toBeGreaterThan(0);
  });

  it('yields smaller AD p-values when the distribution fit is poor', () => {
    const normalSample = [-1.02, -0.67, -0.31, -0.14, 0.08, 0.26, 0.61, 0.88, 1.17, 1.42];
    const uniformSample = [0, 0, 0.1, 0.2, 0.3, 4.5, 4.7, 4.9, 5.1, 5.3];
    const normalFit = stats.fitDistribution(normalSample, { distribution: 'normal' });
    const uniformFit = stats.fitDistribution(uniformSample, { distribution: 'normal' });
    const gofNormal = stats.goodnessOfFit(normalSample, { distribution: 'normal', fit: normalFit, alpha: 0.05 });
    const gofUniform = stats.goodnessOfFit(uniformSample, { distribution: 'normal', fit: uniformFit, alpha: 0.05 });
    expect(gofNormal.ad.pValue).toBeGreaterThan(gofUniform.ad.pValue);
    expect(gofUniform.ad.pValue).toBeLessThan(0.5);
  });

  it('handles log-normal fits when the raw data includes zeros', () => {
    const sample = [0, 0.4, 0.9, 1.6, 2.5, 3.8, 5.1];
    const fit = stats.fitDistribution(sample, { distribution: 'lognormal' });
    expect(fit.valid).toBe(true);
    const gof = stats.goodnessOfFit(sample, { distribution: 'lognormal', fit, alpha: 0.1 });
    expect(gof).toBeTruthy();
    expect(gof.ks.pValue).toBeGreaterThan(0);
    expect(gof.ad.pValue).toBeGreaterThanOrEqual(0);
  });
});
