'use strict';

const { expectClose, loadStatsHooks, runPythonOracle, testWithOracle } = require('../../test-support/statsComponentDifferentialSuite');

describe('Cox delayed-entry reference checks', () => {
  let survivalHooks;

  beforeEach(() => {
    survivalHooks = loadStatsHooks().survivalHooks;
  });

  testWithOracle('1200 tied-time observations match statsmodels with left truncation', () => {
    const series = [
      { name: 'Control', records: [] },
      { name: 'Treatment', records: [] }
    ];
    const time = [];
    const entry = [];
    const event = [];
    const covariates = [];
    for(let index = 0; index < 1200; index += 1){
      const group = index % 2;
      const cycle = Math.floor(index / 200);
      const baseTime = (index % 200) / 10 + 0.5 + cycle * 0.1;
      const observedEvent = index % 3 === 0;
      const entryTime = observedEvent ? 0 : Math.max(0, baseTime - 0.25);
      const exitTime = Number(baseTime.toFixed(3));
      const delayedEntry = Number(entryTime.toFixed(3));
      series[group].records.push({ time: exitTime, event: observedEvent, entry: delayedEntry });
      time.push(exitTime);
      entry.push(delayedEntry);
      event.push(observedEvent ? 1 : 0);
      covariates.push([group]);
    }

    const actual = survivalHooks.fitCoxModel({ series }, { enabled: true });
    const reference = runPythonOracle([{
      id: 'cox-delayed-entry-1200',
      operation: 'survival_cox_efron',
      payload: { time, entry, event, covariates }
    }]).find(result => result.id === 'cox-delayed-entry-1200')?.result;

    expect(actual.available).toBe(true);
    expect(actual.debug.recordCount).toBe(1200);
    expect(reference).toMatchObject({ available: true, delayedEntry: true, n: 1200, events: 400, ties: 'efron' });
    expectClose(actual.coefficients[0].beta, reference.coefficients[0], 'Cox delayed-entry beta', { abs: 1e-5, rel: 1e-4 });
    expectClose(actual.diagnostics.logLikelihood, reference.logLikelihood, 'Cox delayed-entry log likelihood', { abs: 1e-5, rel: 1e-5 });
    expectClose(actual.diagnostics.likelihoodRatio.statistic, reference.likelihoodRatioStatistic, 'Cox delayed-entry likelihood ratio', { abs: 1e-5, rel: 1e-5 });
    expectClose(actual.diagnostics.likelihoodRatio.p, reference.likelihoodRatioPValue, 'Cox delayed-entry LR p-value', { abs: 1e-6, rel: 1e-5 });
  });
});
