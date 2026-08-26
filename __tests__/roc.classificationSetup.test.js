describe('ROC explicit classification setup', () => {
  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    global.Components = {};
    window.Shared = global.Shared;
    window.Components = global.Components;
    // ROC draw-queue normalization is intentionally owned by the shared lifecycle
    // contract. Load that owner instead of reintroducing a component-local fallback.
    require('../js/shared/componentLifecycle.js');
    require('../js/components/roc.js');
  });

  function hooks(){
    return window.Components.roc.__testHooks;
  }

  test('normalizes positive class 0 with lower-positive scores once', () => {
    const pairs = hooks().buildCanonicalAnalysisPairs(
      [0, 0, 1, 1],
      [0.1, 0.2, 0.8, 0.9],
      { positiveClass: 0, scoreDirection: 'lower' }
    );
    expect(pairs.map(pair => pair.label)).toEqual([1, 1, 0, 0]);
    expect(pairs.map(pair => pair.score)).toEqual([-0.1, -0.2, -0.8, -0.9]);
    expect(pairs.map(pair => pair.originalScore)).toEqual([0.1, 0.2, 0.8, 0.9]);
    expect(hooks().computeCurveMetric(pairs, 'roc')).toBe(1);
    expect(hooks().computeCurveMetric(pairs, 'pr')).toBe(1);

    const cutoff = hooks().selectYoudenThreshold(hooks().buildThresholdMetricsTable(pairs));
    expect(cutoff).toEqual(expect.objectContaining({ tp: 2, fp: 0, tn: 2, fn: 0, sensitivity: 1, specificity: 1 }));
    expect(hooks().originalThreshold(cutoff.threshold, 'lower')).toBeCloseTo(0.2, 12);
    expect(hooks().cutoffOperator('lower')).toBe('≤');
  });

  test('normalizes positive class 1 with higher-positive scores', () => {
    const pairs = hooks().buildCanonicalAnalysisPairs(
      [0, 0, 1, 1],
      [0.1, 0.2, 0.8, 0.9],
      { positiveClass: 1, scoreDirection: 'higher' }
    );
    const curve = hooks().buildRankedCurve(pairs, 'roc');
    expect(curve.metric).toBe(1);
    expect(curve.points.at(-1)).toEqual(expect.objectContaining({ x: 1, y: 1 }));
    expect(hooks().cutoffOperator('higher')).toBe('≥');
  });

  test('uses typed exact label matching', () => {
    const pairs = hooks().buildCanonicalAnalysisPairs(
      ['1', 1, '1', 1],
      [0.9, 0.8, 0.7, 0.6],
      { positiveClass: '1', scoreDirection: 'higher' }
    );
    expect(pairs.map(pair => pair.label)).toEqual([1, 0, 1, 0]);
  });

  test('excludes blank and non-numeric scores instead of coercing them to zero', () => {
    const pairs = hooks().buildCanonicalAnalysisPairs(
      [0, 1, 0, 1],
      ['', null, '0.25', 'bad'],
      { positiveClass: 1, scoreDirection: 'higher' }
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual(expect.objectContaining({ originalScore: 0.25, analysisScore: 0.25 }));
  });

  test('requires exactly two valid outcome classes and migrates legacy 0/1 to positive 1', () => {
    expect(hooks().resolveClassificationSetup([0, 1, 0], {}).positiveClass).toBe(1);
    expect(hooks().resolveClassificationSetup([0, 1, 2], {}).valid).toBe(false);
    expect(hooks().resolveClassificationSetup([null, '', 0, 1], {}).valid).toBe(true);
    expect(hooks().createDurableState({}).scoreDirection).toBe('higher');
  });

  test('does not reverse AUC below 0.5 and emits the required warning', () => {
    const pairs = hooks().buildCanonicalAnalysisPairs(
      [0, 0, 1, 1],
      [0.9, 0.8, 0.2, 0.1],
      { positiveClass: 1, scoreDirection: 'higher' }
    );
    const auc = hooks().computeCurveMetric(pairs, 'roc');
    expect(auc).toBe(0);
    expect(hooks().getAucDirectionWarning([{ auc }], 'roc')).toBe(
      'AUC is below 0.5. Verify the positive class and score direction. The curve was not automatically reversed.'
    );
  });

  test('classification settings participate in comparison signatures and durable snapshots', () => {
    const pairs = [{ label: 1, score: 1 }, { label: 0, score: 0 }];
    const base = { graphType: 'roc', pairsA: pairs, pairsB: pairs, positiveClass: 1, negativeClass: 0, scoreDirection: 'higher' };
    expect(hooks().buildCompareSignature(base)).not.toBe(
      hooks().buildCompareSignature({ ...base, positiveClass: 0, negativeClass: 1 })
    );
    expect(hooks().buildCompareSignature(base)).not.toBe(
      hooks().buildCompareSignature({ ...base, scoreDirection: 'lower' })
    );
    const analysisBase = { data: [[0, 0.1], [1, 0.9]], graphType: 'roc', positiveClass: 1, negativeClass: 0, scoreDirection: 'higher' };
    expect(hooks().buildAnalysisSignature(analysisBase)).not.toBe(
      hooks().buildAnalysisSignature({ ...analysisBase, positiveClass: 0, negativeClass: 1 })
    );
    expect(hooks().buildAnalysisSignature(analysisBase)).not.toBe(
      hooks().buildAnalysisSignature({ ...analysisBase, scoreDirection: 'lower' })
    );
    expect(hooks().createDurableState({ positiveClass: 0, negativeClass: 1, scoreDirection: 'lower' }))
      .toEqual(expect.objectContaining({ positiveClass: 0, negativeClass: 1, scoreDirection: 'lower' }));
  });

  test('analysis signatures ignore unused grid padding', () => {
    const base = {
      data: [['Label', 'Score'], [0, 0.1], [1, 0.9]],
      graphType: 'roc',
      positiveClass: 1,
      negativeClass: 0,
      scoreDirection: 'higher'
    };
    const padded = {
      ...base,
      data: [['Label', 'Score', null, null], [0, 0.1, null, null], [1, 0.9, null, null], [null, null, null, null]]
    };
    expect(hooks().buildAnalysisSignature(padded)).toBe(hooks().buildAnalysisSignature(base));
  });
  test('keeps manual auto-draw pending state separate from draw-publication runtime', () => {
    const durable = hooks().createDurableState({ drawPending: true });
    expect(durable).not.toHaveProperty('drawPending');

    const runtime = hooks().createDrawRuntime({
      scheduled: false,
      inProgress: false,
      pendingDrawOptions: { reason: 'legacy-pending-draw' }
    });
    expect(runtime).toEqual(expect.objectContaining({
      scheduled: false,
      inProgress: false,
      requestOptions: null,
      deferredOptions: null
    }));
    expect(runtime).not.toHaveProperty('pendingOptions');
    expect(hooks().mergeDrawOptions(
      { tabId: 'owner-a', viewOnly: false, reason: 'full-redraw' },
      { tabId: 'owner-a', viewOnly: true, reason: 'resize' }
    )).toMatchObject({ tabId: 'owner-a', viewOnly: false, reason: 'resize' });
    expect(hooks().mergeDrawOptions(null, null)).toBeNull();

    const deferred = hooks().createDrawRuntime({
      scheduled: false,
      inProgress: false,
      deferredOptions: { tabId: 'owner-a', viewOnly: false, reason: 'inactive-replay' }
    });
    expect(hooks().isDrawRuntimeSnapshotIdle(deferred)).toBe(true);
    expect(hooks().isDrawRuntimeCacheCurrent(deferred)).toBe(false);
    expect(hooks().isDrawRuntimeSnapshotIdle({ scheduled: true, inProgress: false })).toBe(false);
    expect(hooks().isDrawRuntimeSnapshotIdle({ scheduled: false, inProgress: true })).toBe(false);
  });

});
