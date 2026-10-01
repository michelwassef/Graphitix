const {
  buildBoxCases,
  computeSignedRankExactP,
  expectClose,
  indexOracleResults,
  loadStatsHooks,
  runPythonOracle,
  testWithOracle
} = require('../../test-support/statsMatrixSuite');

describe('Box statistics oracle matrix', () => {
  let boxHooks;

  beforeEach(() => {
    boxHooks = loadStatsHooks(['box']).box;
  });

  testWithOracle('box matrix covers parametric, non-parametric, paired, unpaired, exact, and asymptotic branches against oracle', () => {
    const data = buildBoxCases();
    expect(boxHooks).toBeTruthy();

    const alternatives = ['two-sided', 'greater', 'less'];
    const cases = [];
    const js = {};

    alternatives.forEach(alternative => {
      const welchId = `box-welch-${alternative}`;
      const pooledId = `box-pooled-${alternative}`;
      const pairedId = `box-paired-${alternative}`;
      const oneSampleId = `box-one-sample-${alternative}`;
      cases.push({ id: welchId, operation: 'box_ttest_welch', payload: { a: data.exactA, b: data.exactB, alternative } });
      cases.push({ id: pooledId, operation: 'box_ttest_equal_variance', payload: { a: data.equalVarA, b: data.equalVarB, alternative } });
      cases.push({ id: pairedId, operation: 'box_ttest_paired', payload: { a: data.pairedA, b: data.pairedB, alternative } });
      cases.push({ id: oneSampleId, operation: 'box_ttest_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative } });
      js[welchId] = boxHooks.tTest(data.exactA, data.exactB, { alternative });
      js[pooledId] = boxHooks.tTestEqualVariance(data.equalVarA, data.equalVarB, { alternative });
      js[pairedId] = boxHooks.tTestPaired(data.pairedA, data.pairedB, { alternative });
      js[oneSampleId] = boxHooks.tTestOneSample(data.oneSample, 10, { alternative });

      const mwExactId = `box-mw-exact-${alternative}`;
      const mwAsymId = `box-mw-asym-${alternative}`;
      const wsrExactId = `box-wsr-exact-${alternative}`;
      const wsrAsymId = `box-wsr-asym-${alternative}`;
      const w1ExactId = `box-w1-exact-${alternative}`;
      const w1AsymId = `box-w1-asym-${alternative}`;
      cases.push({ id: mwExactId, operation: 'box_mann_whitney', payload: { a: data.exactA, b: data.exactB, alternative, resamplingMode: 'auto' } });
      cases.push({ id: mwAsymId, operation: 'box_mann_whitney', payload: { a: data.exactA, b: data.exactB, alternative, resamplingMode: 'asymptotic' } });
      cases.push({ id: wsrExactId, operation: 'box_wilcoxon_signed_rank', payload: { a: data.pairedA, b: data.pairedB, alternative, resamplingMode: 'auto' } });
      cases.push({ id: wsrAsymId, operation: 'box_wilcoxon_signed_rank', payload: { a: data.pairedA, b: data.pairedB, alternative, resamplingMode: 'asymptotic' } });
      cases.push({ id: w1ExactId, operation: 'box_wilcoxon_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative, resamplingMode: 'auto' } });
      cases.push({ id: w1AsymId, operation: 'box_wilcoxon_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative, resamplingMode: 'asymptotic' } });
      js[mwExactId] = boxHooks.mannWhitney(data.exactA, data.exactB, { alternative, resamplingMode: 'auto' });
      js[mwAsymId] = boxHooks.mannWhitney(data.exactA, data.exactB, { alternative, resamplingMode: 'asymptotic' });
      js[wsrExactId] = boxHooks.wilcoxonSignedRank(data.pairedA, data.pairedB, { alternative, resamplingMode: 'auto' });
      js[wsrAsymId] = boxHooks.wilcoxonSignedRank(data.pairedA, data.pairedB, { alternative, resamplingMode: 'asymptotic' });
      js[w1ExactId] = boxHooks.wilcoxonOneSample(data.oneSample, 10, { alternative, resamplingMode: 'auto' });
      js[w1AsymId] = boxHooks.wilcoxonOneSample(data.oneSample, 10, { alternative, resamplingMode: 'asymptotic' });
    });

    cases.push({ id: 'box-anova', operation: 'box_anova', payload: { groups: data.anovaGroups } });
    cases.push({ id: 'box-welch-anova', operation: 'box_welch_anova', payload: { groups: data.welchGroups } });
    cases.push({ id: 'box-kruskal', operation: 'box_kruskal', payload: { groups: data.kruskalGroups } });
    cases.push({ id: 'box-friedman-exact', operation: 'box_friedman', payload: { groups: data.friedmanExact, resamplingMode: 'auto' } });
    cases.push({ id: 'box-friedman-asym', operation: 'box_friedman', payload: { groups: data.friedmanAsymptotic, resamplingMode: 'asymptotic' } });
    cases.push({ id: 'box-rm-anova', operation: 'box_repeated_measures_anova', payload: { groups: data.friedmanAsymptotic } });
    cases.push({ id: 'box-ks', operation: 'box_kolmogorov_smirnov', payload: { a: data.ksA, b: data.ksB } });
    js['box-anova'] = boxHooks.anova(data.anovaGroups);
    js['box-welch-anova'] = boxHooks.welchAnova(data.welchGroups);
    js['box-kruskal'] = boxHooks.kruskalWallis(data.kruskalGroups);
    js['box-friedman-exact'] = boxHooks.friedmanTest(data.friedmanExact, { resamplingMode: 'auto' });
    js['box-friedman-asym'] = boxHooks.friedmanTest(data.friedmanAsymptotic, { resamplingMode: 'asymptotic' });
    js['box-rm-anova'] = boxHooks.repeatedMeasuresAnova(data.friedmanAsymptotic);
    js['box-ks'] = boxHooks.kolmogorovSmirnovTwoSample(data.ksA, data.ksB);

    const oracle = indexOracleResults(runPythonOracle(cases));
    expect(oracle.size).toBe(cases.length);

    alternatives.forEach(alternative => {
      ['welch', 'pooled', 'paired', 'one-sample'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].t, ref.t, `${id}.t`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-6, rel: 1e-5 });
      });
      ['mw-exact', 'mw-asym'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].U1, ref.U1, `${id}.U1`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 2e-3, rel: 2e-3 });
      });
      ['wsr-exact', 'w1-exact'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const exactP = kind === 'wsr-exact'
          ? computeSignedRankExactP(data.pairedA.map((value, index) => value - data.pairedB[index]), alternative)
          : computeSignedRankExactP(data.oneSample.map(value => value - 10), alternative);
        expectClose(js[id].p, exactP, `${id}.p`, { abs: 1e-12, rel: 1e-9 });
      });
      ['wsr-asym', 'w1-asym'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        if (alternative === 'two-sided') {
          expectClose(js[id].W, ref.W, `${id}.W`, { abs: 1e-6, rel: 1e-5 });
        }
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-2, rel: 1e-2 });
      });
    });

    expectClose(js['box-anova'].F, oracle.get('box-anova')?.result.F, 'box-anova.F', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-anova'].p, oracle.get('box-anova')?.result.p, 'box-anova.p', { abs: 1e-6, rel: 1e-5 });
    expect(js['box-welch-anova'].ok).toBe(true);
    expectClose(js['box-welch-anova'].F, oracle.get('box-welch-anova')?.result.F, 'box-welch-anova.F', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-welch-anova'].p, oracle.get('box-welch-anova')?.result.p, 'box-welch-anova.p', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-welch-anova'].df1, oracle.get('box-welch-anova')?.result.df1, 'box-welch-anova.df1', { abs: 0, rel: 0 });
    expectClose(js['box-welch-anova'].df2, oracle.get('box-welch-anova')?.result.df2, 'box-welch-anova.df2', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-kruskal'].H, oracle.get('box-kruskal')?.result.H, 'box-kruskal.H', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-kruskal'].p, oracle.get('box-kruskal')?.result.p, 'box-kruskal.p', { abs: 1e-6, rel: 1e-5 });
    expect(js['box-friedman-exact'].ok).toBe(true);
    expectClose(js['box-friedman-exact'].Q, oracle.get('box-friedman-exact')?.result.Q, 'box-friedman-exact.Q', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-friedman-exact'].p, oracle.get('box-friedman-exact')?.result.p, 'box-friedman-exact.p', { abs: 1e-10, rel: 1e-8 });
    expect(js['box-friedman-asym'].ok).toBe(true);
    expectClose(js['box-friedman-asym'].Q, oracle.get('box-friedman-asym')?.result.Q, 'box-friedman-asym.Q', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-friedman-asym'].p, oracle.get('box-friedman-asym')?.result.p, 'box-friedman-asym.p', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-rm-anova'].F, oracle.get('box-rm-anova')?.result.F, 'box-rm-anova.F', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-rm-anova'].p, oracle.get('box-rm-anova')?.result.p, 'box-rm-anova.p', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-ks'].D, oracle.get('box-ks')?.result.D, 'box-ks.D', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-ks'].p, oracle.get('box-ks')?.result.p, 'box-ks.p', { abs: 5e-4, rel: 1e-3 });
  });

  test('box Monte Carlo wiring is deterministic with seed and responsive to iteration changes', () => {
    const mwA = [1, 1, 2, 2, 3, 3, 4, 4];
    const mwB = [2, 2, 3, 3, 4, 4, 5, 5];
    const wA = [10, 10, 11, 11, 12, 12];
    const wB = [9, 9, 10, 10, 11, 11];
    const friedmanMc = [
      [1, 2, 2, 3, 3, 4],
      [2, 2, 3, 3, 4, 4],
      [3, 3, 4, 4, 5, 5]
    ];

    const mw1 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 99 });
    const mw2 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 99 });
    const mw3 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 1000, seed: 99 });
    expectClose(mw1.p, mw2.p, 'mw auto deterministic', { abs: 0, rel: 0 });
    expect(mw3.p).not.toBe(mw1.p);

    const wsr1 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 17 });
    const wsr2 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 17 });
    const wsr3 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 1000, seed: 17 });
    expectClose(wsr1.p, wsr2.p, 'wsr auto deterministic', { abs: 0, rel: 0 });
    expect(wsr3.p).not.toBe(wsr1.p);

    const fried1 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'auto', iterations: 600, seed: 123 });
    const fried2 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'auto', iterations: 600, seed: 123 });
    const fried3 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'auto', iterations: 1200, seed: 123 });
    expect(fried1.ok).toBe(true);
    expectClose(fried1.p, fried2.p, 'friedman auto deterministic', { abs: 0, rel: 0 });
    expect(fried3.p).not.toBe(fried1.p);
  });

  test('box tied Wilcoxon signed-rank Monte Carlo stays significant for strong paired shifts', () => {
    const a = [10, 11, 9, 10, 12, 11, 10, 9, 11, 10, 12, 11];
    const b = [20, 21, 19, 20, 22, 21, 20, 19, 21, 20, 22, 21];
    const auto = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 10000, seed: 1337 });
    const mc = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'monte-carlo', iterations: 10000, seed: 1337 });
    const asym = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    expect(auto.method).toBe('monte-carlo');
    expect(mc.method).toBe('monte-carlo');
    expect(auto.p).toBeLessThan(0.01);
    expect(mc.p).toBeLessThan(0.01);
    expectClose(auto.p, mc.p, 'wilcoxon monte-carlo auto/manual parity', { abs: 0, rel: 0 });
    expectClose(mc.p, asym.p, 'wilcoxon monte-carlo vs asymptotic tie-heavy shift', { abs: 0.01, rel: 0.25 });
  });

  test('box tied one-sample Wilcoxon Monte Carlo stays significant for strong shifts from H0', () => {
    const values = [25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 30, 30];
    const auto = boxHooks.wilcoxonOneSample(values, 20, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 10000, seed: 4242 });
    const mc = boxHooks.wilcoxonOneSample(values, 20, { alternative: 'two-sided', resamplingMode: 'monte-carlo', iterations: 10000, seed: 4242 });
    const asym = boxHooks.wilcoxonOneSample(values, 20, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    expect(auto.method).toBe('monte-carlo');
    expect(mc.method).toBe('monte-carlo');
    expect(auto.p).toBeLessThan(0.01);
    expect(mc.p).toBeLessThan(0.01);
    expectClose(auto.p, mc.p, 'one-sample wilcoxon monte-carlo auto/manual parity', { abs: 0, rel: 0 });
    expectClose(mc.p, asym.p, 'one-sample wilcoxon monte-carlo vs asymptotic tie-heavy shift', { abs: 0.01, rel: 0.25 });
  });

  test('box tied Mann-Whitney Monte Carlo stays significant for strong group shifts', () => {
    const a = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
    const b = [11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
    const auto = boxHooks.mannWhitney(a, b, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 10000, seed: 7171 });
    const mc = boxHooks.mannWhitney(a, b, { alternative: 'two-sided', resamplingMode: 'monte-carlo', iterations: 10000, seed: 7171 });
    const asym = boxHooks.mannWhitney(a, b, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    expect(auto.method).toBe('monte-carlo');
    expect(mc.method).toBe('monte-carlo');
    expect(auto.p).toBeLessThan(0.01);
    expect(mc.p).toBeLessThan(0.01);
    expectClose(auto.p, mc.p, 'mann-whitney monte-carlo auto/manual parity', { abs: 0, rel: 0 });
    expectClose(mc.p, asym.p, 'mann-whitney monte-carlo vs asymptotic tie-heavy shift', { abs: 0.01, rel: 0.25 });
  });
});
