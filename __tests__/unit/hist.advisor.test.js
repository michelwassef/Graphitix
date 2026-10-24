const { loadComponentTestBootstrap } = require('../../test-support/componentTestBootstrap');

let hooks;
beforeAll(() => {
  loadComponentTestBootstrap('hist');
  hooks = window.Components.hist.__testHooks;
});

const continuous = { data: 'continuous', design: 'independent' };
const samples = [[1.1, 2.2, 3.3, 4.4], [1.5, 2.6, 4.7, 6.8]];
function recommend(answers, values = samples) {
  return hooks.getAdvisorRecommendation(answers, hooks.buildAdvisorContext(values.map(data => ({ values: data }))));
}

test('opening without answers makes no statistical choice', () => {
  expect(recommend({})).toMatchObject({ ready: false, settings: null });
});

test('descriptive work disables inferential and model checks explicitly', () => {
  expect(recommend({ goal: 'describe' })).toMatchObject({ ready: true, settings: { diagnosticsMode: 'off', comparisonMode: 'off' } });
  expect(recommend({ goal: 'describe' }, [])).toMatchObject({ ready: false, settings: null });
});

test('mean and median comparisons are routed to Distribution Charts', () => {
  expect(recommend({ goal: 'location' })).toMatchObject({ ready: false, settings: null, summary: expect.stringContaining('Distribution Charts') });
});

test.each(['dependent', 'unknown', undefined])('does not infer independence for design %s', design => {
  expect(recommend({ ...continuous, goal: 'compare', design })).toMatchObject({ ready: false, settings: null });
  expect(recommend({ ...continuous, goal: 'fit', model: 'normal', design })).toMatchObject({ ready: false, settings: null });
});

test('paired independent subjects permit per-series model checks but not independent-sample KS', () => {
  expect(recommend({ data: 'continuous', design: 'paired', goal: 'compare' })).toMatchObject({ ready: false, settings: null });
  const fitted = recommend({ data: 'continuous', design: 'paired', goal: 'fit', model: 'normal' });
  expect(fitted).toMatchObject({ ready: true, settings: { diagnosticsMode: 'normal-fit', comparisonMode: 'off' } });
  expect(fitted.warnings.join(' ')).toContain('within-pair differences');
});

test.each(['summarized', 'unknown', undefined])('does not recommend tests for data %s without individual ordered values', data => {
  expect(recommend({ ...continuous, goal: 'compare', data }).ready).toBe(false);
  expect(recommend({ ...continuous, goal: 'fit', model: 'normal', data }).ready).toBe(false);
});

test('ordered discrete observations can use the tie-aware distribution comparison', () => {
  const result = recommend({ ...continuous, goal: 'compare', data: 'discrete' }, [[1, 1, 2], [1, 3, 3]]);
  expect(result).toMatchObject({ ready: true, settings: { diagnosticsMode: 'off', comparisonMode: 'ks' } });
  expect(result.summary).toContain('permutation calibration preserves ties');
  expect(result.warnings.join(' ')).toContain('independent observations');
  expect(recommend({ ...continuous, goal: 'fit', data: 'discrete', model: 'normal' }).ready).toBe(false);
});

test('KS is suggested for exactly two independent continuous samples', () => {
  const result = recommend({ ...continuous, goal: 'compare' });
  expect(result).toMatchObject({ ready: true, settings: { diagnosticsMode: 'off', comparisonMode: 'ks' } });
  expect(result.warnings.join(' ')).toContain('does not establish equivalence');
});

test.each([[], [samples[0]], [...samples, [8.2, 9.1]]].map(data => ({ data })))('KS rejects an unsupported series count: $data', ({ data }) => {
  expect(recommend({ ...continuous, goal: 'compare' }, data)).toMatchObject({ ready: false, settings: null });
});

test.each([[[1, 1, 3], [2, 4, 5]], [[1, 2, 3], [3, 4, 5]]])('KS recommendation accepts ties with permutation calibration: %j', (a, b) => {
  const result = recommend({ ...continuous, goal: 'compare' }, [a, b]);
  expect(result).toMatchObject({ ready: true, settings: { comparisonMode: 'ks' } });
  expect(result.summary).toContain('permutation calibration preserves ties');
  expect(result.warnings.join(' ')).toContain('Tied values are present');
});

test('KS recommendation does not describe tie handling as a concern when samples have no ties', () => {
  const result = recommend({ ...continuous, goal: 'compare' }, [[1, 2, 3], [4, 5, 6]]);
  expect(result.warnings.join(' ')).not.toContain('Tied values are present');
});

test('distribution comparison requires two observations in each series', () => {
  expect(recommend({ ...continuous, goal: 'compare' }, [[1], [2, 3]])).toMatchObject({
    ready: false,
    settings: null,
    summary: expect.stringContaining('at least two finite observations')
  });
  expect(hooks.kolmogorovSmirnovTwoSample([1], [1])).toMatchObject({
    available: false,
    nA: 1,
    nB: 1,
    hasTies: true,
    message: expect.stringContaining('at least two finite observations')
  });
});

test('unavailable AICc comparisons remain unavailable through JSON restoration', () => {
  const comparison = hooks.computeLognormalComparison([1, 2, 3]);
  expect(comparison).toMatchObject({
    available: false,
    preferred: null,
    message: expect.stringContaining('more than three observations')
  });

  const firstNormalization = hooks.normalizeStatsAnalysisModel({
    signature: 'small-sample',
    diagnosticsMode: 'normal-vs-lognormal',
    modelComparisonByKey: { 'column-0': comparison }
  });
  const restored = hooks.normalizeStatsAnalysisModel(JSON.parse(JSON.stringify(firstNormalization)));
  expect(restored.modelComparisonByKey['column-0']).toMatchObject({
    available: false,
    preferred: null,
    normalAicc: null,
    lognormalAicc: null,
    deltaAicc: null,
    message: expect.stringContaining('more than three observations')
  });
});

test('large comparisons require a worker instead of blocking the page', async () => {
  const previousWorkers = window.Shared.Workers;
  window.Shared.Workers = { isSupported: () => false };
  try{
    const sampleA = Array.from({ length: 30 }, (_, index) => index);
    const sampleB = Array.from({ length: 30 }, (_, index) => index + 0.5);
    const result = await hooks.computeKolmogorovSmirnovTwoSampleAsync(
      sampleA,
      sampleB,
      { tabId: 'hist-large-sample' },
      null
    );

    expect(result).toMatchObject({
      available: false,
      nA: 30,
      nB: 30,
      method: null,
      message: expect.stringContaining('background statistics worker is unavailable')
    });
    expect(Number.isNaN(result.p)).toBe(true);
  }finally{
    if(previousWorkers){ window.Shared.Workers = previousWorkers; }
    else{ delete window.Shared.Workers; }
  }
});

test('a KS worker request carries its owner and ignores a stale response', async () => {
  const previousWorkers = window.Shared.Workers;
  let resolveTask;
  let workerConfig;
  window.Shared.Workers = {
    isSupported: () => true,
    runTask: config => {
      workerConfig = config;
      return new Promise(resolve => { resolveTask = resolve; });
    },
    isCancellationError: () => false
  };
  const owner = { tabId: 'hist-owner-a', workers: new Map() };
  const execution = {
    signal: null,
    workerOptions: taskName => ({ name: `hist:${owner.tabId}:${taskName}`, cancelStrategy: 'terminate' }),
    isCurrent: () => false
  };
  try{
    const pending = hooks.computeKolmogorovSmirnovTwoSampleAsync(
      Array.from({ length: 20 }, (_, index) => index % 7),
      Array.from({ length: 20 }, (_, index) => (index + 1) % 7),
      owner,
      execution
    );
    expect(workerConfig).toMatchObject({
      name: 'hist:hist-owner-a:distribution-comparison',
      url: 'js/workers/hist.worker.js',
      action: 'hist-ks-two-sample',
      payload: { meta: { tabId: 'hist-owner-a', operation: 'distribution-comparison' } }
    });
    expect(workerConfig.signal).toBeUndefined();
    resolveTask({ available: true, D: 0.5, p: 0.25, nA: 20, nB: 20, method: 'exact permutation' });

    await expect(pending).resolves.toBeNull();
  }finally{
    if(previousWorkers){ window.Shared.Workers = previousWorkers; }
    else{ delete window.Shared.Workers; }
  }
});

test('same-owner redraws share pending and completed KS work without sharing stale draw output', async () => {
  const previousWorkers = window.Shared.Workers;
  let resolveTask;
  let workerTask;
  const runTask = jest.fn(() => {
    workerTask = new Promise(resolve => { resolveTask = resolve; });
    workerTask.cancel = jest.fn();
    return workerTask;
  });
  window.Shared.Workers = {
    isSupported: () => true,
    runTask,
    isCancellationError: () => false
  };
  const owner = hooks.getSession('hist-cache-owner', { create: true });
  const sampleA = Array.from({ length: 20 }, (_, index) => index % 6);
  const sampleB = Array.from({ length: 20 }, (_, index) => (index + 2) % 6);
  try{
    const staleDraw = hooks.computeKolmogorovSmirnovTwoSampleAsync(sampleA, sampleB, owner, { isCurrent: () => false });
    const currentDraw = hooks.computeKolmogorovSmirnovTwoSampleAsync([...sampleA], [...sampleB], owner, { isCurrent: () => true });

    expect(runTask).toHaveBeenCalledTimes(1);
    expect(runTask.mock.calls[0][0]).not.toHaveProperty('signal');
    window.Components.hist.cancelCurrentDraw({ tabId: owner.tabId, reason: 'owner-job-replaced' });
    expect(workerTask.cancel).not.toHaveBeenCalled();
    resolveTask({ available: true, D: 0.25, p: 0.75, nA: 20, nB: 20, method: 'Monte Carlo permutation (19,999 shuffles)' });

    await expect(staleDraw).resolves.toBeNull();
    await expect(currentDraw).resolves.toMatchObject({ available: true, D: 0.25, p: 0.75 });
    await expect(hooks.computeKolmogorovSmirnovTwoSampleAsync(
      [...sampleA],
      [...sampleB],
      owner,
      { isCurrent: () => true }
    )).resolves.toMatchObject({ available: true, D: 0.25, p: 0.75 });
    expect(runTask).toHaveBeenCalledTimes(1);

    sampleA[0] += 1;
    const changedSamples = hooks.computeKolmogorovSmirnovTwoSampleAsync(
      sampleA,
      sampleB,
      owner,
      { isCurrent: () => true }
    );
    expect(runTask).toHaveBeenCalledTimes(2);
    resolveTask({ available: true, D: 0.3, p: 0.7, nA: 20, nB: 20, method: 'Monte Carlo permutation (19,999 shuffles)' });
    await expect(changedSamples).resolves.toMatchObject({ available: true, D: 0.3, p: 0.7 });
  }finally{
    if(previousWorkers){ window.Shared.Workers = previousWorkers; }
    else{ delete window.Shared.Workers; }
  }
});

test('explicitly stopping a draw cancels its session-owned pending KS worker', async () => {
  const previousWorkers = window.Shared.Workers;
  let rejectTask;
  let workerTask;
  window.Shared.Workers = {
    isSupported: () => true,
    runTask: jest.fn(() => {
      workerTask = new Promise((_resolve, reject) => { rejectTask = reject; });
      workerTask.cancel = jest.fn(reason => rejectTask(Object.assign(new Error(reason), { code: 'WORKER_CANCELLED' })));
      return workerTask;
    }),
    isCancellationError: error => error?.code === 'WORKER_CANCELLED'
  };
  const owner = hooks.getSession('hist-stop-owner', { create: true });
  const samplesA = Array.from({ length: 20 }, (_, index) => index % 5);
  const samplesB = Array.from({ length: 20 }, (_, index) => (index + 1) % 5);
  try{
    const pending = hooks.computeKolmogorovSmirnovTwoSampleAsync(
      samplesA,
      samplesB,
      owner,
      { isCurrent: () => true }
    );
    window.Components.hist.cancelCurrentDraw({ tabId: owner.tabId, reason: 'user-stop' });

    expect(workerTask.cancel).toHaveBeenCalledWith('user-stop');
    await expect(pending).resolves.toBeNull();
    expect(Array.from(owner.workers.values()).some(record => record?.operation === 'distribution-comparison')).toBe(false);
  }finally{
    if(previousWorkers){ window.Shared.Workers = previousWorkers; }
    else{ delete window.Shared.Workers; }
  }
});

test('disposing a Histogram tab releases its session cache and cancels pending worker tasks', async () => {
  const previousWorkers = window.Shared.Workers;
  let rejectTask;
  let workerTask;
  window.Shared.Workers = {
    isSupported: () => true,
    runTask: jest.fn(() => {
      workerTask = new Promise((_resolve, reject) => { rejectTask = reject; });
      workerTask.cancel = jest.fn(reason => rejectTask(Object.assign(new Error(reason), { code: 'WORKER_CANCELLED' })));
      return workerTask;
    }),
    isCancellationError: error => error?.code === 'WORKER_CANCELLED'
  };
  const owner = hooks.getSession('hist-dispose-owner', { create: true });
  const listenerCleanup = jest.fn();
  owner.listeners.set('test-cleanup', listenerCleanup);
  const valuesA = Array.from({ length: 20 }, (_, index) => index % 5);
  const valuesB = Array.from({ length: 20 }, (_, index) => (index + 1) % 5);
  try{
    const pending = hooks.computeKolmogorovSmirnovTwoSampleAsync(
      valuesA,
      valuesB,
      owner,
      { isCurrent: () => true }
    );
    expect(window.Components.hist.disposeTab({ id: owner.tabId }, { reason: 'close-tab' })).toBe(true);

    expect(workerTask.cancel).toHaveBeenCalledWith('close-tab');
    expect(listenerCleanup).toHaveBeenCalledTimes(1);
    expect(hooks.getSession(owner.tabId)).toBeNull();
    await expect(pending).resolves.toBeNull();
  }finally{
    if(previousWorkers){ window.Shared.Workers = previousWorkers; }
    else{ delete window.Shared.Workers; }
  }
});

test('identical samples in separate Histogram tabs use separate worker and result caches', async () => {
  const previousWorkers = window.Shared.Workers;
  const tasks = [];
  window.Shared.Workers = {
    isSupported: () => true,
    runTask: config => new Promise(resolve => { tasks.push({ config, resolve }); }),
    isCancellationError: () => false
  };
  const sampleA = Array.from({ length: 20 }, (_, index) => index % 4);
  const sampleB = Array.from({ length: 20 }, (_, index) => (index + 1) % 4);
  try{
    const first = hooks.computeKolmogorovSmirnovTwoSampleAsync(
      sampleA,
      sampleB,
      { tabId: 'hist-isolated-a', workers: new Map() },
      { isCurrent: () => true }
    );
    const second = hooks.computeKolmogorovSmirnovTwoSampleAsync(
      sampleA,
      sampleB,
      { tabId: 'hist-isolated-b', workers: new Map() },
      { isCurrent: () => true }
    );

    expect(tasks).toHaveLength(2);
    expect(tasks.map(task => task.config.name)).toEqual([
      'hist:hist-isolated-a:distribution-comparison',
      'hist:hist-isolated-b:distribution-comparison'
    ]);
    tasks[0].resolve({ available: true, D: 0.2, p: 0.8, nA: 20, nB: 20, method: 'Monte Carlo permutation' });
    tasks[1].resolve({ available: true, D: 0.3, p: 0.7, nA: 20, nB: 20, method: 'Monte Carlo permutation' });
    await expect(first).resolves.toMatchObject({ D: 0.2, p: 0.8 });
    await expect(second).resolves.toMatchObject({ D: 0.3, p: 0.7 });
  }finally{
    if(previousWorkers){ window.Shared.Workers = previousWorkers; }
    else{ delete window.Shared.Workers; }
  }
});

test('changed owner data cancels pending KS work and starts a fresh calculation', async () => {
  const previousWorkers = window.Shared.Workers;
  const tasks = [];
  window.Shared.Workers = {
    isSupported: () => true,
    runTask: jest.fn(() => {
      let rejectTask;
      const promise = new Promise((_resolve, reject) => { rejectTask = reject; });
      promise.cancel = jest.fn(reason => rejectTask(Object.assign(new Error(reason), { code: 'WORKER_CANCELLED' })));
      tasks.push({ promise, rejectTask });
      return promise;
    }),
    isCancellationError: error => error?.code === 'WORKER_CANCELLED'
  };
  const owner = { tabId: 'hist-replaced-owner', workers: new Map() };
  const sampleA = Array.from({ length: 20 }, (_, index) => index);
  const sampleB = Array.from({ length: 20 }, (_, index) => index + 0.5);
  const execution = { isCurrent: () => true };
  try{
    const replaced = hooks.computeKolmogorovSmirnovTwoSampleAsync(sampleA, sampleB, owner, execution);
    sampleA[0] += 1;
    const replacement = hooks.computeKolmogorovSmirnovTwoSampleAsync(sampleA, sampleB, owner, execution);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].promise.cancel).toHaveBeenCalledWith('hist-distribution-comparison-input-replaced');
    await expect(replaced).resolves.toBeNull();
    tasks[1].rejectTask(Object.assign(new Error('cancelled by test'), { code: 'WORKER_CANCELLED' }));
    await expect(replacement).resolves.toBeNull();
  }finally{
    if(previousWorkers){ window.Shared.Workers = previousWorkers; }
    else{ delete window.Shared.Workers; }
  }
});

test.each([['normal', 'normal-fit'], ['lognormal', 'lognormal-fit'], ['compare', 'normal-vs-lognormal']])('explicit %s model selects the supported diagnostics', (model, mode) => {
  const result = recommend({ ...continuous, goal: 'fit', model });
  expect(result).toMatchObject({ ready: true, settings: { diagnosticsMode: mode, comparisonMode: 'off' } });
  expect(result.warnings.join(' ')).toContain('not an automatic selector');
});

test.each([[[1]], [[1, 1, 1]], [[1, 2], [4, 4]]].map(data => ({ data })))('fit estimation rejects insufficient or constant series: $data', ({ data }) => {
  expect(recommend({ ...continuous, goal: 'fit', model: 'normal' }, data).ready).toBe(false);
});

test.each(['lognormal', 'compare'])('%s preserves support requirements across all observations', model => {
  for (const value of [0, -1]) {
    expect(recommend({ ...continuous, goal: 'fit', model }, [[value, 1, 2, 3], samples[0]]).ready).toBe(false);
  }
  expect(recommend({ ...continuous, goal: 'fit', model: 'normal' }, [[-2, -1, 0, 1]]).ready).toBe(true);
});

test('AICc requires a positive denominator for two estimated parameters', () => {
  expect(recommend({ ...continuous, goal: 'fit', model: 'compare' }, [[1, 2, 3]]).ready).toBe(false);
  expect(recommend({ ...continuous, goal: 'fit', model: 'normal' }, [[1, 2, 3]]).ready).toBe(true);
  expect(recommend({ ...continuous, goal: 'fit', model: 'compare' }, [[1, 2, 3, 4]]).ready).toBe(true);
});

test('cross-series overlap is distinguished from rounding within fitted samples', () => {
  const answer = { ...continuous, goal: 'fit', model: 'normal' };
  expect(recommend(answer, [[1, 2, 3], [1, 2, 3]]).warnings.join(' ')).not.toContain('rounding');
  expect(recommend(answer, [[1, 1, 3]]).warnings.join(' ')).toContain('rounding');
});

test('context counts finite included observations and ignores empty series', () => {
  const context = hooks.buildAdvisorContext([{ values: [NaN, Infinity] }, { values: [-1, 0, 2, NaN] }]);
  expect(context).toEqual({ series: [{ n: 3, min: -1, max: 2, hasTies: false }], hasTies: false });
});

test('archive state accepts only known answers and never aliases inputs', () => {
  const source = { open: true, answers: { goal: 'fit', model: 'lognormal', data: 'bad', extra: 'bad' }, context: { node: 'projection' } };
  const normalized = hooks.createAdvisorState(source);
  expect(normalized).toEqual({ open: true, answers: { goal: 'fit', model: 'lognormal' } });
  normalized.answers.model = 'normal';
  expect(source.answers.model).toBe('lognormal');
  expect(hooks.createAdvisorState()).toEqual({ open: false, answers: {} });
});

test('recommendations neither mutate answers nor choose models from diagnostic p-values', () => {
  const answers = Object.freeze({ ...continuous, goal: 'fit', model: 'normal' });
  const context = hooks.buildAdvisorContext(samples.map(values => ({ values })));
  const first = hooks.getAdvisorRecommendation(answers, { ...context, pValue: 0.0001 });
  expect(hooks.getAdvisorRecommendation(answers, { ...context, pValue: 0.99 })).toEqual(first);
  expect(answers.model).toBe('normal');
});
