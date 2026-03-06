describe('Box assumption helpers', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  function dagostinoReference(values) {
    const cleaned = values.filter(Number.isFinite);
    const n = cleaned.length;
    if (n < 8) {
      return { statistic: NaN, pValue: NaN, passed: null };
    }
    const meanVal = cleaned.reduce((sum, v) => sum + v, 0) / n;
    const diffs = cleaned.map(v => v - meanVal);
    const m2 = diffs.reduce((sum, v) => sum + v * v, 0);
    const m3 = diffs.reduce((sum, v) => sum + v * v * v, 0);
    const m4 = diffs.reduce((sum, v) => sum + Math.pow(v, 4), 0);
    const s2 = m2 / (n - 1 || 1);
    const s = Math.sqrt(s2);
    if (!Number.isFinite(s) || s === 0) {
      return { statistic: 0, pValue: 1, passed: true };
    }
    const g1 = (n * m3) / ((n - 1) * (n - 2) * Math.pow(s, 3));
    const g2 = ((n * (n + 1) * m4) / ((n - 1) * (n - 2) * (n - 3) * Math.pow(s, 4))) - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    const mu2 = 6 * (n - 2) / ((n + 1) * (n + 3));
    const gamma2 = 36 * (n - 7) * (n * n + 2 * n - 5) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
    const w2 = Math.sqrt(2 * gamma2 + 4) - 1;
    const alpha = Math.sqrt(2 / (w2 - 1));
    const delta = 1 / Math.sqrt(Math.log(w2));
    const z1 = delta * Math.asinh(g1 / (alpha * Math.sqrt(mu2)));
    const mu1g2 = -6 / (n + 1);
    const mu2g2 = (24 * n * (n - 2) * (n - 3)) / (Math.pow(n + 1, 2) * (n + 3) * (n + 5));
    const gamma1g2 = (6 * (n * n - 5 * n + 2) / ((n + 7) * (n + 9))) * Math.sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3)));
    const gamma2g2 = 36 * (15 * Math.pow(n, 6) - 36 * Math.pow(n, 5) - 628 * Math.pow(n, 4) + 982 * Math.pow(n, 3) + 5777 * Math.pow(n, 2) - 6402 * n + 900) /
      (n * (n - 3) * (n - 2) * (n + 7) * (n + 9) * (n + 11) * (n + 13));
    const A = 6 + (8 / gamma2g2) * (2 / gamma2g2 + gamma1g2 * gamma1g2);
    const term = (g2 - mu1g2) / Math.sqrt(mu2g2) * Math.sqrt(2 / (A - 4));
    const base = Math.pow((1 - 2 / A) / (1 + term), 1 / 3);
    const z2 = Math.sqrt(9 * A / 2) * (1 - 2 / (9 * A) - base);
    const statistic = z1 * z1 + z2 * z2;
    const pValue = Math.exp(-statistic / 2);
    return { statistic, pValue, passed: Number.isFinite(pValue) ? pValue >= 0.05 : null };
  }

  function varianceReference(groups) {
    const cleaned = groups.map(group => (Array.isArray(group) ? group.filter(Number.isFinite) : []));
    const medians = cleaned.map(group => {
      if (!group.length) {
        return NaN;
      }
      const sorted = group.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    });
    const transformed = cleaned.map((group, idx) => group.map(value => Math.abs(value - (medians[idx] || 0))));
    const totalN = transformed.reduce((sum, g) => sum + g.length, 0);
    const k = transformed.length;
    if (totalN <= k) {
      return { statistic: NaN, df1: k - 1, df2: Math.max(totalN - k, 0) };
    }
    const groupMeans = transformed.map(group => group.reduce((sum, v) => sum + v, 0) / (group.length || 1));
    const grandMean = transformed.reduce((sum, group, idx) => sum + groupMeans[idx] * (group.length || 0), 0) / totalN;
    let ssBetween = 0;
    let ssWithin = 0;
    transformed.forEach((group, idx) => {
      const mean = groupMeans[idx] || 0;
      ssBetween += (group.length || 0) * Math.pow(mean - grandMean, 2);
      group.forEach(val => {
        ssWithin += Math.pow(val - mean, 2);
      });
    });
    const df1 = k - 1;
    const df2 = totalN - k;
    const msBetween = ssBetween / (df1 || 1);
    const msWithin = ssWithin / (df2 || 1);
    const F = msWithin === 0 ? Infinity : msBetween / msWithin;
    return { statistic: F, df1, df2 };
  }

  test('computeDagostino matches reference implementation', () => {
    expect(hooks).toBeDefined();
    const values = Array.from({ length: 500 }, (_, idx) => Math.sin(idx) * 2 + (idx % 7));
    const result = hooks.computeDagostino(values);
    const reference = dagostinoReference(values);
    expect(result.statistic).toBeCloseTo(reference.statistic, 8);
    expect(result.pValue).toBeCloseTo(reference.pValue, 8);
    expect(result.passed).toBe(reference.passed);
  });

  test('computeQQPoints respects sample limits', () => {
    expect(hooks).toBeDefined();
    const values = Array.from({ length: 10000 }, (_, idx) => idx / 10);
    const enforcedMinimum = hooks.computeQQPoints(values, { maxSampleSize: 10 });
    expect(enforcedMinimum).toHaveLength(25);
    const cappedSample = hooks.computeQQPoints(values, { maxSampleSize: 50 });
    expect(cappedSample).toHaveLength(50);
    expect(cappedSample[0].observed).toBeLessThan(cappedSample[cappedSample.length - 1].observed);
  });

  test('computeVarianceDiagnostics aligns with reference', () => {
    expect(hooks).toBeDefined();
    const groupA = Array.from({ length: 250 }, (_, idx) => Math.sin(idx / 5) * 3 + 20 + (idx % 5));
    const groupB = Array.from({ length: 260 }, (_, idx) => Math.cos(idx / 7) * 4 + 18 + (idx % 3));
    const result = hooks.computeVarianceDiagnostics([groupA, groupB], ['A', 'B']);
    const reference = varianceReference([groupA, groupB]);
    expect(result.statistic).toBeCloseTo(reference.statistic, 8);
    expect(result.df1).toBe(reference.df1);
    expect(result.df2).toBe(reference.df2);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});
