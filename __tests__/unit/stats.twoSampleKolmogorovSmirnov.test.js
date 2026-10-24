'use strict';

describe('Shared.stats.kolmogorovSmirnovTwoSample', () => {
  let stats;

  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    require('../../js/shared/stats.js');
    stats = global.Shared.stats;
  });

  test('uses the exact conditional permutation distribution for small tied samples', () => {
    const result = stats.kolmogorovSmirnovTwoSample([1, 1], [2, 3]);

    expect(result).toMatchObject({
      available: true,
      D: 1,
      p: 1 / 3,
      nA: 2,
      nB: 2,
      method: 'exact permutation',
      methodCode: 'exact',
      hasTies: true,
      iterations: 6,
      seed: null
    });
  });

  test('retains ties shared across groups in the permutation null distribution', () => {
    const result = stats.kolmogorovSmirnovTwoSample([1, 1], [1, 2]);

    expect(result).toMatchObject({
      available: true,
      D: 0.5,
      p: 1,
      method: 'exact permutation',
      hasTies: true
    });
  });

  test('uses exact permutation calibration for small tie-free samples when requested', () => {
    const result = stats.kolmogorovSmirnovTwoSample([1, 2], [3, 4], { resamplingMode: 'permutation' });

    expect(result).toMatchObject({ D: 1, p: 1 / 3, method: 'exact permutation', hasTies: false });
  });

  test('uses the correctly directed one-sided statistics and tails', () => {
    const greater = stats.kolmogorovSmirnovTwoSample([1, 2], [3, 4], {
      alternative: 'greater',
      resamplingMode: 'permutation'
    });
    expect(greater).toMatchObject({
      D: 1,
      DTwoSided: 1,
      DPlus: 1,
      DMinus: 0,
      p: 1 / 6,
      alternative: 'greater'
    });

    const less = stats.kolmogorovSmirnovTwoSample([3, 4], [1, 2], {
      alternative: 'less',
      resamplingMode: 'permutation'
    });
    expect(less).toMatchObject({
      D: 1,
      DTwoSided: 1,
      DPlus: 0,
      DMinus: 1,
      p: 1 / 6,
      alternative: 'less'
    });
  });

  test('reports the selected one-sided statistic when the tail is opposite', () => {
    const result = stats.kolmogorovSmirnovTwoSample([1, 2], [3, 4], {
      alternative: 'less',
      resamplingMode: 'permutation'
    });

    expect(result).toMatchObject({ D: 0, DTwoSided: 1, DPlus: 1, DMinus: 0, p: 1 });
  });

  test('uses the selected one-sided statistic for Monte Carlo calibration', () => {
    const greater = stats.kolmogorovSmirnovTwoSample(Array(30).fill(0), Array(30).fill(1), {
      alternative: 'greater',
      resamplingMode: 'permutation',
      iterations: 499,
      seed: 99
    });
    const opposite = stats.kolmogorovSmirnovTwoSample(Array(30).fill(0), Array(30).fill(1), {
      alternative: 'less',
      resamplingMode: 'permutation',
      iterations: 499,
      seed: 99
    });

    expect(greater).toMatchObject({ D: 1, DTwoSided: 1, DPlus: 1, DMinus: 0, p: 0.002, alternative: 'greater' });
    expect(opposite).toMatchObject({ D: 0, DTwoSided: 1, DPlus: 1, DMinus: 0, p: 1, alternative: 'less' });
  });

  test('uses Monte Carlo permutation with a plus-one p-value when exact enumeration is too large', () => {
    const first = stats.kolmogorovSmirnovTwoSample(Array(50).fill(0), Array(50).fill(1), {
      resamplingMode: 'exact',
      iterations: 250,
      seed: 2026
    });
    const repeated = stats.kolmogorovSmirnovTwoSample(Array(50).fill(0), Array(50).fill(1), {
      resamplingMode: 'exact',
      iterations: 250,
      seed: 2026
    });

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({
      available: true,
      D: 1,
      p: 1 / 251,
      method: 'Monte Carlo permutation (250 shuffles)',
      methodCode: 'monte-carlo',
      hasTies: true,
      iterations: 250,
      seed: 2026,
      warning: 'The exact permutation space is too large; Monte Carlo permutation calibration was used.'
    });
  });

  test('does not use continuous asymptotic calibration when ties are present', () => {
    const result = stats.kolmogorovSmirnovTwoSample([1, 1], [2, 3], { resamplingMode: 'asymptotic' });

    expect(result.method).toBe('exact permutation');
    expect(result.warning).toMatch(/replaced with permutation calibration/i);
  });

  test('retains the asymptotic path for larger tie-free samples by default', () => {
    const result = stats.kolmogorovSmirnovTwoSample(
      Array.from({ length: 45 }, (_, index) => index),
      Array.from({ length: 45 }, (_, index) => index + 100)
    );

    expect(result).toMatchObject({ available: true, method: 'asymptotic', methodCode: 'asymptotic', hasTies: false });
  });

  test('rejects empty groups and excludes non-finite observations', () => {
    expect(stats.kolmogorovSmirnovTwoSample([], [1])).toMatchObject({
      available: false,
      nA: 0,
      nB: 1,
      message: expect.stringContaining('at least one observation')
    });
    expect(stats.kolmogorovSmirnovTwoSample([1, NaN, Infinity], [2, 3])).toMatchObject({ nA: 1, nB: 2 });
  });
});
