describe('Shared Box statistics model ownership', () => {
  let model;

  beforeAll(() => {
    jest.resetModules();
    const jStatModule = require('jstat');
    const jStat = jStatModule?.jStat || jStatModule;
    global.Shared = {};
    global.jStat = jStat;
    if(typeof window !== 'undefined'){
      window.Shared = global.Shared;
      window.jStat = jStat;
    }
    require('../js/shared/stats.js');
    require('../js/shared/boxStatsModel.js');
    model = (typeof window !== 'undefined' ? window.Shared : global.Shared).boxStatsModel;
  });

  test('post-hoc metadata has one complete shared owner', () => {
    const options = model.listPostHocOptions();
    expect(options.map(option => option.value)).toEqual([
      'standard', 'tukey', 'gamesHowell', 'tamhaneT2',
      'dunn', 'nemenyi', 'dunnett', 'dunnettT3'
    ]);
    expect(model.getPostHocSummary('tamhaneT2', { groupCount: 3 })).toMatch(/Tamhane/i);
    expect(model.getPostHocSummary('nemenyi', { groupCount: 3 })).toMatch(/Nemenyi/i);
  });

  test('Tamhane T2 and Nemenyi are real model branches, not UI-only options', () => {
    const tamhane = model.computeBoxStatsModel({
      mode: 'single',
      statsTest: 'parametric',
      statsMode: 'all',
      statsPaired: false,
      statsPostHoc: 'tamhaneT2',
      statsParametricVariant: 'welch',
      statsCorrection: 'holm',
      statsAlpha: 0.05,
      statsEffectParametric: 'cohenD',
      statsEffectNonParametric: 'rankBiserial',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 2, 3, 4, 5] },
        { index: 1, label: 'B', values: [5, 7, 9, 12, 18, 24] },
        { index: 2, label: 'C', values: [10, 15, 22, 30, 42, 55] }
      ]
    });
    expect(tamhane.ok).toBe(true);
    expect(tamhane.postHoc).toBe('tamhaneT2');
    expect(tamhane.pairs).toHaveLength(3);
    expect(tamhane.pairs.every(pair => pair.method === 'tamhaneT2' && Number.isFinite(pair.adjP))).toBe(true);

    const nemenyi = model.computeBoxStatsModel({
      mode: 'single',
      statsTest: 'nonparametric',
      statsMode: 'all',
      statsPaired: true,
      statsPostHoc: 'nemenyi',
      statsCorrection: 'holm',
      statsResamplingMode: 'auto',
      statsMonteCarloIterations: 2000,
      statsSeed: 42,
      statsEffectParametric: 'cohenD',
      statsEffectNonParametric: 'rankBiserial',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3, 4, 5, 6] },
        { index: 1, label: 'B', values: [2, 3, 4, 5, 6, 7] },
        { index: 2, label: 'C', values: [4, 5, 6, 7, 8, 9] }
      ]
    });
    expect(nemenyi.ok).toBe(true);
    expect(nemenyi.postHoc).toBe('nemenyi');
    expect(nemenyi.pairs).toHaveLength(3);
    expect(nemenyi.pairs.every(pair => pair.method === 'nemenyi' && Number.isFinite(pair.adjP))).toBe(true);
  });
});
