function loadWorker() {
  const ctx = { onmessage: null, postMessage: jest.fn(), importScripts: jest.fn() };
  ctx.Shared = {};
  ctx.importScripts = jest.fn(script => {
    if (String(script).includes('boxStatsModel.js')) {
      const savedSelf = global.self;
      global.self = ctx;
      require('../../js/shared/boxStatsModel.js');
      global.self = savedSelf;
    }
    if (String(script).includes('stats.js') && !ctx.Shared.stats) {
      ctx.Shared.stats = {
        adjustPValues: values => values.map(v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1)))
      };
    }
  });
  const savedSelf = global.self;
  const savedShared = global.Shared;
  global.self = ctx;
  jest.resetModules();
  ctx.jStat = require('jstat').jStat;
  global.jStat = ctx.jStat;
  global.Shared = ctx.Shared;
  require('../../js/shared/stats.js');
  require('../../js/workers/box.worker.js');
  global.self = savedSelf;
  global.Shared = savedShared;
  return ctx;
}

function send(ctx, id, action, payload) {
  return new Promise(resolve => {
    const orig = ctx.postMessage;
    ctx.postMessage = jest.fn(msg => { ctx.postMessage = orig; resolve(msg); });
    ctx.onmessage({ data: { id, action, payload } });
  });
}

function makeSwarmPoints(coords) {
  return coords.map((coord, index) => ({ index, coord, raw: coord }));
}

describe('box.worker — unknown action', () => {
  test('responds with ok=false and error text', async () => {
    const ctx = loadWorker();
    const msg = await send(ctx, 'x1', 'noop', {});
    expect(msg.ok).toBe(false);
    expect(typeof msg.error).toBe('string');
  });
});

describe('box.worker — box-swarm action', () => {
  let ctx;
  beforeEach(() => { ctx = loadWorker(); });

  test('empty array returns zero-length offsets', async () => {
    const msg = await send(ctx, 's0', 'box-swarm', { points: [], options: { pointRadius: 5 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets).toHaveLength(0);
    expect(msg.result.maxOffsetUsed).toBe(0);
  });

  test('n-point array returns n offsets, all finite', async () => {
    const points = makeSwarmPoints([1, 2, 3, 4, 5]);
    const msg = await send(ctx, 's1', 'box-swarm', { points, options: { pointRadius: 4, axisSpacing: 40 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets).toHaveLength(5);
    msg.result.offsets.forEach(o => expect(Number.isFinite(o)).toBe(true));
  });

  test('identical-coord points still return n offsets', async () => {
    const points = makeSwarmPoints([5, 5, 5, 5]);
    const msg = await send(ctx, 's2', 'box-swarm', { points, options: { pointRadius: 3 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets).toHaveLength(4);
  });

  test('maxOffsetUsed is non-negative', async () => {
    const points = makeSwarmPoints([1, 1.01, 3, 3.01, 5]);
    const msg = await send(ctx, 's3', 'box-swarm', { points, options: { pointRadius: 5, axisSpacing: 60 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.maxOffsetUsed).toBeGreaterThanOrEqual(0);
  });

  test('horizontal orientation does not throw', async () => {
    const points = makeSwarmPoints([10, 20, 30]);
    const msg = await send(ctx, 's4', 'box-swarm', {
      points,
      options: { pointRadius: 4, orientation: 'horizontal' }
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets).toHaveLength(3);
  });
});

describe('box.worker — box-swarm geometry invariants', () => {
  let ctx;
  beforeEach(() => { ctx = loadWorker(); });

  test('single point has offset 0 (no neighbours to dodge)', async () => {
    const points = makeSwarmPoints([5]);
    const msg = await send(ctx, 'g0', 'box-swarm', { points, options: { pointRadius: 5 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets[0]).toBe(0);
  });

  test('widely separated points have smaller offsets than closely packed ones', async () => {
    const sparse = makeSwarmPoints([1, 100, 200]);
    const dense  = makeSwarmPoints([1, 1.01, 1.02]);
    const [msgSparse, msgDense] = await Promise.all([
      send(ctx, 'g1', 'box-swarm', { points: sparse, options: { pointRadius: 6 } }),
      send(ctx, 'g2', 'box-swarm', { points: dense,  options: { pointRadius: 6 } })
    ]);
    const maxSparse = Math.max(...msgSparse.result.offsets.map(Math.abs));
    const maxDense  = Math.max(...msgDense.result.offsets.map(Math.abs));
    expect(maxSparse).toBeLessThanOrEqual(maxDense + 0.01);
  });

  test('larger pointRadius produces larger or equal maxOffsetUsed', async () => {
    const points = makeSwarmPoints([1, 1.5, 2, 2.5, 3]);
    const [small, large] = await Promise.all([
      send(ctx, 'g3', 'box-swarm', { points, options: { pointRadius: 3 } }),
      send(ctx, 'g4', 'box-swarm', { points, options: { pointRadius: 8 } })
    ]);
    expect(small.result.maxOffsetUsed).toBeLessThanOrEqual(large.result.maxOffsetUsed + 0.01);
  });

  test('offsets array length always equals input points length', async () => {
    for (const n of [1, 3, 7, 12]) {
      const points = makeSwarmPoints(Array.from({ length: n }, (_, i) => i * 0.5));
      const msg = await send(ctx, `g5_${n}`, 'box-swarm', { points, options: { pointRadius: 4 } });
      expect(msg.result.offsets).toHaveLength(n);
    }
  });
});

describe('box.worker — box-stats action', () => {
  test('ROUT screens paired differences once and keeps matching subject rows',async()=>{
    const ctx=loadWorker();
    const a=[8,9,10,11,12,9,10,11,10,100],b=a.map(()=>0);
    const msg=await send(ctx,'rout-paired','box-stats',{
      statsTest:'parametric',statsParametricVariant:'classic',statsPaired:true,statsOutlierMode:'routTest',
      selection:[{index:0,label:'A',values:a},{index:1,label:'B',values:b}]
    });
    expect(msg.result.ok).toBe(true);
    expect(msg.result.groupSummaries.map(group=>group.n)).toEqual([9,9]);
    expect(msg.result.outlierAudit.exclusions.map(item=>item.index)).toEqual([9]);
    expect(msg.result.outlierAudit.flags).toEqual([]);
  });
  test('compact samples retain source-row identity in the worker calculation', async () => {
    const ctx = loadWorker();
    const msg = await send(ctx, 'paired-source-rows', 'box-stats', {
      statsTest: 'parametric', statsParametricVariant: 'classic', statsPaired: true,
      selection: [
        { index: 0, label: 'A', values: [10, 30, 40, 50], rowIndices: [1, 3, 4, 5] },
        { index: 1, label: 'B', values: [9, 20, 37, 46], rowIndices: [1, 2, 4, 5] }
      ]
    });
    expect(msg.result.ok).toBe(true);
    expect(msg.result.groupSummaries.map(group => group.n)).toEqual([3, 3]);
    // SciPy 1.17.1: ttest_rel([10,40,50], [9,37,46]).
    expect(msg.result.pairs[0].stat).toBeCloseTo(3.023715784073818, 12);
    expect(msg.result.pairs[0].p).toBeCloseTo(0.09417837268432339, 12);
  });
  let ctx;

  beforeEach(() => {
    ctx = loadWorker();
    ctx.Shared.stats.adjustPValues = values => values.map(v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1)));
  });

  test('empty selection returns ok=true with guidance message', async () => {
    const msg = await send(ctx, 'b0', 'box-stats', { selection: [] });
    expect(msg.ok).toBe(true);
    expect(typeof msg.result.message).toBe('string');
    expect(msg.result.message.length).toBeGreaterThan(0);
  });

  test('single-group selection returns guidance message (not enough groups)', async () => {
    const payload = {
      statsTest: 'parametric',
      selection: [{ index: 0, label: 'A', values: [1, 2, 3, 4, 5] }]
    };
    const msg = await send(ctx, 'b1', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.message).toMatch(/at least two/i);
  });

  test('two parametric groups → ok, groupCount=2, tables present', async () => {
    const payload = {
      statsTest: 'parametric',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3, 4, 5] },
        { index: 1, label: 'B', values: [6, 7, 8, 9, 10] }
      ]
    };
    const msg = await send(ctx, 'b2', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.mode).toBe('single');
    expect(msg.result.groupCount).toBe(2);
    expect(Array.isArray(msg.result.tables)).toBe(true);
    expect(msg.result.effectiveComparisonMethod).toBe('none');
    const summary = msg.result.tables.find(table => table.caption === 'Overall test summary');
    expect(summary.rows.filter(row => /p(?:-value| \()/i.test(String(row.metric))).map(row => row.metric)).toEqual(['p-value']);
    expect(summary.footnotes.join(' ')).not.toMatch(/holm|correction applied across 1 test/i);
  });

  test('two nonparametric groups → ok, uses nonparametric path', async () => {
    const payload = {
      statsTest: 'nonparametric',
      selection: [
        { index: 0, label: 'X', values: [1, 2, 3, 4, 5] },
        { index: 1, label: 'Y', values: [6, 7, 8, 9, 10] }
      ]
    };
    const msg = await send(ctx, 'b3', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.nonParametricVariant).toBe('mannWhitney');
  });

  test('three groups → ok, groupCount=3', async () => {
    const payload = {
      statsTest: 'parametric',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3] },
        { index: 1, label: 'B', values: [4, 5, 6] },
        { index: 2, label: 'C', values: [7, 8, 9] }
      ]
    };
    const msg = await send(ctx, 'b4', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.groupCount).toBe(3);
  });

  test('Games–Howell results match the shared direct model in the worker', async () => {
    const payload = {
      statsTest: 'parametric',
      statsParametricVariant: 'welch',
      statsPostHoc: 'gamesHowell',
      statsCiLevel: 0.99,
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3] },
        { index: 1, label: 'B', values: [4, 6, 7, 9] },
        { index: 2, label: 'C', values: [2, 3, 5, 8, 11] }
      ]
    };
    const worker = await send(ctx, 'b-gh', 'box-stats', payload);
    const direct = ctx.Shared.boxStatsModel.computeBoxStatsModel(payload);
    expect(worker.ok).toBe(true);
    expect(worker.result.effectivePostHoc).toBe('gamesHowell');
    expect(worker.result.pairs).toEqual(direct.pairs);
  });

  test('nested repeated-measures ANOVA runs through the worker with the same report as the shared model', async () => {
    const payload = {
      mode: 'grouped',
      grouped: {
        analysis: 'nestedRepeatedTwoWay',
        data: {
          ok: true,
          groupsCount: 2,
          conditionsCount: 2,
          rowsWithData: 3,
          partialRowsSkipped: 0,
          groupLabels: ['Control', 'Treatment'],
          conditionLabels: ['Before', 'After'],
          rows: [
            [[10, 12], [20, 21]],
            [[11, 11], [21, 23]],
            [[13, 15], [22, 24]]
          ]
        }
      },
      statsCorrection: 'holm',
      statsAlpha: 0.05,
      statsCiLevel: 0.95
    };
    const worker = await send(ctx, 'b-nested-repeated', 'box-stats', payload);
    const direct = ctx.Shared.boxStatsModel.computeBoxStatsModel(payload);
    expect(worker.ok).toBe(true);
    expect(worker.result.ok).toBe(true);
    expect(worker.result.analysisId).toBe('nestedRepeatedTwoWay');
    expect(worker.result).toEqual(direct);
    expect(worker.result.tables[0].rows.map(row => row.source)).toEqual([
      'Group', 'Condition', 'Group × Condition', 'Subjects within Group', 'Subjects within Group × Condition'
    ]);
    expect(JSON.parse(JSON.stringify(worker.result)).report.analysisSpec.experimentalUnit)
      .toBe('subject-within-independent-group');
  });

  test.each([
    ['dunnettTest','reference',[[10,12,15,19],[20,21,25],[4,8,9,11,14,18]],0.05615416756935809],
    ['dunnettT3Test','all',[[1,2,3],[2,5,10,12],[0,1,2,3,4,5]],0.2318323482999108]
  ])('%s worker returns independently referenced probabilities and serializable reports',async(statsPostHoc,statsMode,groups,expected)=>{
    const payload={statsTest:'parametric',statsParametricVariant:'classic',statsPostHoc,statsMode,statsRef:1,statsCiLevel:0.9,
      selection:groups.map((values,index)=>({index,label:`G${index}`,values}))};
    const msg=await send(ctx,statsPostHoc,'box-stats',payload);
    expect(msg.ok).toBe(true);expect(msg.result.ok).toBe(true);
    expect(msg.result.effectivePostHoc).toBe(statsPostHoc);
    expect(msg.result.pairs[0].adjP).toBeCloseTo(expected,5);
    expect(msg.result.effectiveAnalysisSpec.ciType).toBe('simultaneous');
    expect(JSON.parse(JSON.stringify(msg.result)).report).toEqual(msg.result.report);
  });

  test('paired groups of equal size → ok', async () => {
    const payload = {
      statsTest: 'parametric',
      statsPaired: true,
      selection: [
        { index: 0, label: 'Pre', values: [10, 12, 14, 16] },
        { index: 1, label: 'Post', values: [11, 13, 15, 17] }
      ]
    };
    const msg = await send(ctx, 'b5', 'box-stats', payload);
    expect(msg.ok).toBe(true);
  });

  test('paired groups of unequal size retain only complete positional rows', async () => {
    const payload = {
      statsTest: 'parametric',
      statsPaired: true,
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3] },
        { index: 1, label: 'B', values: [4, 5] }
      ]
    };
    const msg = await send(ctx, 'b6', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.ok).toBe(true);
    expect(msg.result.groupSummaries.map(group => group.n)).toEqual([2, 2]);
    expect(msg.result.pairs[0].df).toBe(1);
    expect(msg.result.outlierAudit.notes.join(' ')).toMatch(/1 row .* excluded/);
  });

  test('paired signed-rank effect uses weighted ranks in worker results', async () => {
    const payload = {
      statsTest: 'nonparametric', statsPaired: true, statsNonParametricVariant: 'wilcoxonSignedRank',
      statsEffectNonParametric: 'rankBiserial', statsResamplingMode: 'asymptotic',
      selection: [
        { index: 0, label: 'A', values: [0.5, null, 0.825, 0.375, 0.5] },
        { index: 1, label: 'B', values: [0.525, 100, 0.775, 0.325, 0.55] }
      ]
    };
    const msg = await send(ctx, 'paired-effect', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.ok).toBe(true);
    expect(msg.result.pairs[0].effectNonParametric).toBe('0.200');
  });

  test.each(['exact','monte-carlo','asymptotic'])('Friedman worker preserves requested %s calibration and reports its actual method', async resamplingMode => {
    const msg=await send(ctx,`friedman-${resamplingMode}`,'box-stats',{
      statsTest:'nonparametric',statsPaired:true,statsNonParametricVariant:'friedman',statsResamplingMode:resamplingMode,
      statsMonteCarloIterations:2000,statsSeed:17,
      selection:[[1,1,1,1],[1,2,1,2],[2,2,3,3]].map((values,index)=>({index,label:`G${index}`,values}))
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.overall.calibrationMethod).toBe(resamplingMode);
    expect(msg.result.report.analysisSpec.overallCalibrationMethod).toBe(resamplingMode);
  });

  test('one-sample mode with a single group → ok, no group-size error', async () => {
    const payload = {
      statsTest: 'parametric',
      statsMode: 'oneSample',
      selection: [{ index: 0, label: 'Group', values: [5, 6, 7, 8, 9, 10] }]
    };
    const msg = await send(ctx, 'b7', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.message).toBeNull();
  });

  test('assumptionDiagnostics is populated for two groups', async () => {
    const payload = {
      statsTest: 'parametric',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3, 4, 5, 6] },
        { index: 1, label: 'B', values: [7, 8, 9, 10, 11, 12] }
      ]
    };
    const msg = await send(ctx, 'b8', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.assumptionDiagnostics).not.toBeNull();
  });
});
