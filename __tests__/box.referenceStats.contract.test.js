const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ensureBoxModule = () => {
  jest.resetModules();
  const jStatModule = require('jstat');
  const jStat = jStatModule?.jStat || jStatModule;
  global.jStat = jStat;
  if (typeof window !== 'undefined') {
    window.jStat = jStat;
  }
  require('../js/vendor.js');
  require('../js/components/box.js');
  return window.Components?.box;
};

const runBoxStatsWorker = payload => {
  jest.resetModules();
  const jStatModule = require('jstat');
  const jStat = jStatModule?.jStat || jStatModule;
  global.Shared = {};
  if (typeof window !== 'undefined') {
    window.Shared = global.Shared;
    window.jStat = jStat;
  }
  require('../js/shared/stats.js');
  const messages = [];
  const workerScope = {
    Shared: typeof window !== 'undefined' ? window.Shared : global.Shared,
    jStat,
    console,
    postMessage: message => messages.push(message)
  };
  workerScope.self = workerScope;
  workerScope.importScripts = script => {
    const normalized = String(script).replace(/\\/g, '/');
    if (normalized.includes('boxStatsModel.js')) {
      const sharedSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'boxStatsModel.js'), 'utf8');
      vm.runInContext(sharedSource, workerContext, { filename: 'boxStatsModel.js' });
    }
    if (normalized.includes('stats.js') && !workerScope.Shared.stats) {
      const statsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'stats.js'), 'utf8');
      vm.runInContext(statsSource, workerContext, { filename: 'stats.js' });
    }
  };
  const workerContext = vm.createContext(workerScope);
  const sharedSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'boxStatsModel.js'), 'utf8');
  vm.runInContext(sharedSource, workerContext, { filename: 'boxStatsModel.js' });
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'workers', 'box.worker.js'), 'utf8');
  vm.runInContext(source, workerContext, { filename: 'box.worker.js' });
  workerScope.onmessage({
    data: {
      id: 'stats-reference-contract',
      action: 'box-stats',
      payload
    }
  });
  const response = messages[0];
  if (!response?.ok) {
    throw new Error(response?.error || 'worker failed');
  }
  return response.result;
};

describe('Box reference-scope statistics contract', () => {
  test('reference comparisons stay pairwise and do not promote t-tests to ANOVA', () => {
    const box = ensureBoxModule();
    const hooks = box.__testHooks;

    expect(hooks.shouldComputeOmnibusOverall('all', 3)).toBe(true);
    expect(hooks.shouldComputeOmnibusOverall('reference', 3)).toBe(false);

    const choices = hooks.listStatsTestChoices({
      family: 'parametric',
      paired: false,
      mode: 'reference',
      selectedCount: 3
    });
    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'classic', label: 'Unpaired t tests vs reference' })
    ]));

    expect(hooks.resolvePairwiseTestMeta({
      family: 'parametric',
      paired: false,
      mode: 'reference',
      selectedCount: 3,
      parametricVariant: 'classic'
    })).toEqual(expect.objectContaining({
      key: 'classic',
      label: 'Unpaired t tests vs reference'
    }));
  });

  test('paired reference comparisons use paired t-test wording, not repeated-measures ANOVA', () => {
    const box = ensureBoxModule();
    const hooks = box.__testHooks;

    const choices = hooks.listStatsTestChoices({
      family: 'parametric',
      paired: true,
      mode: 'reference',
      selectedCount: 3
    });
    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'classic', label: 'Paired t-tests vs reference' })
    ]));
    expect(choices.map(choice => choice.label).join(' ')).not.toMatch(/Repeated-measures ANOVA/i);

    expect(hooks.resolvePairwiseTestMeta({
      family: 'parametric',
      paired: true,
      mode: 'reference',
      selectedCount: 3,
      parametricVariant: 'classic'
    })).toEqual(expect.objectContaining({
      key: 'pairedT',
      label: 'Paired t-tests vs reference'
    }));
  });

  test('worker reference comparisons do not include an omnibus ANOVA table', () => {
    const result = runBoxStatsWorker({
      mode: 'single',
      statsTest: 'parametric',
      statsMode: 'reference',
      statsPaired: false,
      statsRef: 0,
      statsCorrection: 'holm',
      statsPostHoc: 'standard',
      statsParametricVariant: 'classic',
      statsEffectParametric: 'cohenD',
      statsEffectNonParametric: 'rankBiserial',
      selection: [
        { index: 0, label: 'Control', values: [12, 14.3, 11, 13.3, 15.6, 16.2, 14.9, 13.6, 12.3, 15.5, 17.6] },
        { index: 1, label: 'Treatment A', values: [15, 17, 14.6, 16, 18, 19, 16.5, 15.2, 14.5, 17.3, 20] },
        { index: 2, label: 'Treatment B', values: [14, 15.3, 13, 16.3, 18.4, 17.2, 15.9, 14.2, 13.9, 16.6, 21.1] }
      ]
    });

    const captions = result.tables.map(table => table.caption);
    expect(captions).toContain('Analysis summary');
    expect(captions).toContain('Comparisons vs reference');
    expect(captions).not.toContain('Overall test summary');
    expect(JSON.stringify(result.tables)).not.toMatch(/ANOVA|Repeated-measures/i);
  });
});
