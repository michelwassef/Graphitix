const fs = require('fs');
const path = require('path');
const { loadComponentTestBootstrap } = require('../../test-support/componentTestBootstrap');

const readBox = () => fs.readFileSync(path.join(__dirname, '../../js/components/box.js'), 'utf8').replace(/\r\n/g, '\n');

describe('Box render-impact contract', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    loadComponentTestBootstrap('box');
    hooks = window.Components?.box?.__testHooks;
  });

  test('explicit impact wins over legacy compatibility flags', () => {
    expect(hooks.resolveRenderImpact({ renderImpact: 'paint', viewOnly: false })).toBe('paint');
    expect(hooks.resolveRenderImpact({ renderImpact: 'analysis', viewOnly: true })).toBe('analysis');
    expect(hooks.resolveRenderImpact({ structural: true })).toBe('structural');
    expect(hooks.resolveRenderImpact({ invalidate: 'style' })).toBe('paint');
    expect(hooks.resolveRenderImpact({ viewOnly: true })).toBe('layout');
  });

  test('sanitized draw options derive viewOnly from semantic impact', () => {
    expect(hooks.sanitizeDrawOptions({ renderImpact: 'paint', viewOnly: false })).toMatchObject({
      renderImpact: 'paint',
      viewOnly: true
    });
    expect(hooks.sanitizeDrawOptions({ renderImpact: 'analysis', viewOnly: true })).toMatchObject({
      renderImpact: 'analysis',
      viewOnly: false
    });
  });

  test('statistics signatures distinguish equal-moment datasets', () => {
    const first = [{ name: 'A', rawY: [0, 1, 2, 3] }];
    const second = [{ name: 'A', rawY: [1.5 - Math.sqrt(1.25), 1.5 - Math.sqrt(1.25), 1.5 + Math.sqrt(1.25), 1.5 + Math.sqrt(1.25)] }];
    const firstSummary = hooks.buildStatsSignature(first);
    const secondSummary = hooks.buildStatsSignature(second);
    expect(firstSummary).not.toBe(secondSummary);
    expect(hooks.computeTraceDataSignature(first[0].rawY)).not.toBe(hooks.computeTraceDataSignature(second[0].rawY));
  });

  test('paired statistics signatures include source rows and the corrected input contract', () => {
    const state = window.Components.box.__getState();
    const saved = state.statsPaired;
    state.statsPaired = true;
    try {
      const a = hooks.buildStatsSignature([{ name: 'A', rawY: [10, 20], rowIndices: [1, 2] }]);
      const b = hooks.buildStatsSignature([{ name: 'A', rawY: [10, 20], rowIndices: [1, 3] }]);
      expect(a).not.toBe(b);
      expect(a).toContain('box-statistical-inputs-v2');
    } finally {
      state.statsPaired = saved;
    }
  });

  test('studentized-range revision follows the resolved procedure across scopes', () => {
    const state = window.Components.box.__getState();
    const saved = {
      selectedCols: state.selectedCols,
      tableFormat: state.tableFormat,
      statsMode: state.statsMode,
      statsTest: state.statsTest,
      statsPaired: state.statsPaired,
      statsCorrection: state.statsCorrection,
      statsPostHoc: state.statsPostHoc,
      statsParametricVariant: state.statsParametricVariant,
      statsOmnibusParametricVariant: state.statsOmnibusParametricVariant,
      statsPairwiseParametricVariant: state.statsPairwiseParametricVariant,
      statsNonParametricVariant: state.statsNonParametricVariant,
      statsResamplingMode: state.statsResamplingMode,
      assumptionDiagnostics: state.assumptionDiagnostics
    };
    const traces = [
      { name: 'A', rawY: [1, 2, 3] },
      { name: 'B', rawY: [2, 3, 4] },
      { name: 'C', rawY: [3, 4, 5] }
    ];
    const signatureHasRangeRevision = ({ mode = 'all', test = 'parametric', paired = false, method = 'standard', variant = 'classic', groupCount = 3 } = {}) => {
      state.selectedCols = new Set(Array.from({ length: groupCount }, (_, index) => index));
      state.statsMode = mode;
      state.statsTest = test;
      state.statsPaired = paired;
      state.statsCorrection = 'holm';
      state.statsPostHoc = method;
      state.statsParametricVariant = variant;
      state.statsOmnibusParametricVariant = variant;
      state.statsPairwiseParametricVariant = variant;
      state.statsNonParametricVariant = 'friedman';
      state.statsResamplingMode = 'asymptotic';
      state.assumptionDiagnostics = null;
      return hooks.buildStatsSignature(traces).includes('studentized-range-direct-sf-v2');
    };
    try {
      state.selectedCols = new Set(['A', 'B', 'C']);
      expect(signatureHasRangeRevision({ method: 'auto' })).toBe(true);
      expect(signatureHasRangeRevision({ method: 'tukey' })).toBe(true);
      expect(signatureHasRangeRevision({ mode: 'reference', method: 'tukey' })).toBe(true);
      expect(signatureHasRangeRevision({ method: 'auto', variant: 'welch' })).toBe(true);
      expect(signatureHasRangeRevision({ method: 'gamesHowell', variant: 'welch' })).toBe(true);
      expect(signatureHasRangeRevision({ mode: 'reference', method: 'gamesHowell', variant: 'welch' })).toBe(true);
      const legacyGamesHowellResolution = hooks.resolvePostHocProcedure('gamesHowell', {
        mode: 'all', test: 'parametric', paired: false, groupCount: 3, variant: 'classic', varianceConcern: true
      });
      delete legacyGamesHowellResolution.numericalCacheVersion;
      expect(hooks.buildStatsSignature(traces, legacyGamesHowellResolution, { varianceConcern: true }))
        .toContain('studentized-range-direct-sf-v2');
      expect(signatureHasRangeRevision({ test: 'nonparametric', paired: true, method: 'nemenyi' })).toBe(true);
      expect(signatureHasRangeRevision({ mode: 'reference', test: 'nonparametric', paired: true, method: 'nemenyi' })).toBe(true);

      expect(signatureHasRangeRevision({ method: 'anovaPooled' })).toBe(false);
      expect(signatureHasRangeRevision({ mode: 'reference', method: 'standard' })).toBe(false);
      expect(signatureHasRangeRevision({ mode: 'custom', method: 'standard' })).toBe(false);
      expect(signatureHasRangeRevision({ mode: 'custom', method: 'tukey' })).toBe(false);
      expect(signatureHasRangeRevision({ method: 'standard', variant: 'classic', groupCount: 2 })).toBe(false);
      expect(signatureHasRangeRevision({ method: 'standard', variant: 'welch', groupCount: 2 })).toBe(false);
      state.tableFormat = 'grouped';
      expect(signatureHasRangeRevision({ method: 'tukey' })).toBe(false);
      state.tableFormat = saved.tableFormat;
      expect(signatureHasRangeRevision({ mode: 'oneSample', method: 'tukey' })).toBe(false);
      const unsupportedOneSampleTukey = hooks.resolvePostHocProcedure('tukey', {
        mode: 'oneSample', test: 'parametric', paired: false, groupCount: 3, variant: 'classic'
      });
      expect(unsupportedOneSampleTukey).toMatchObject({
        supported: false,
        effectiveProcedure: null,
        numericalCacheVersion: null
      });
    } finally {
      Object.assign(state, saved);
    }
  });

  test('large studentized-range comparisons use the existing stats worker', () => {
    const shared = window.Shared;
    const previousWorkers = shared.Workers;
    shared.Workers = {
      runTask: () => Promise.resolve(),
      isSupported: () => true
    };
    try {
      expect(hooks.shouldUseStatsWorker(100, 9)).toBe(false);
      expect(hooks.shouldUseStatsWorker(100, 10)).toBe(true);
      expect(hooks.shouldUseStatsWorker(8000, 0)).toBe(true);
    } finally {
      shared.Workers = previousWorkers;
    }
  });

  test('missing stats worker diagnostics do not throw', () => {
    const shared = window.Shared;
    const previousWorkers = shared.Workers;
    const previousModel = shared.boxStatsModel;
    shared.Workers = null;
    try {
      expect(() => hooks.shouldUseStatsWorker(8000, 10)).not.toThrow();
      expect(hooks.shouldUseStatsWorker(8000, 10)).toBe(false);

      shared.Workers = {
        runTask: () => Promise.resolve(),
        isSupported: () => true
      };
      shared.boxStatsModel = null;
      expect(() => hooks.shouldUseStatsWorker(8000, 10)).not.toThrow();
      expect(hooks.shouldUseStatsWorker(8000, 10)).toBe(true);
    } finally {
      shared.Workers = previousWorkers;
      shared.boxStatsModel = previousModel;
    }
  });

  test('the scheduler and settled event retain the resolved impact', () => {
    const source = readBox();
    expect(source).toContain('const renderImpact = resolveBoxRenderImpact(options, \'analysis\');');
    expect(source).toContain('computeBoxTraceDataSignature(values)');
    expect(source).toContain('shouldUseBoxStatsWorker(valueCount, studentizedRangePairCount)');
    expect(source).toContain('runBoxSwarmWorker(payload, options?.tabId || options?.ownerTabId || null)');
    expect(source).toContain("source: 'box.draw'");
    expect(source).toContain('renderImpact: guardedOptions.renderImpact || resolveBoxRenderImpact(guardedOptions)');
  });
});
