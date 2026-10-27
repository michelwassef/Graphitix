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

    const proportionalHazards = actual.diagnostics.proportionalHazards;
    expect(proportionalHazards).toMatchObject({
      transform: 'event-time midranks',
      eventCount: 400,
      eventTimeCount: expect.any(Number)
    });
    if(proportionalHazards.available){
      const proportionalHazardsReference = runPythonOracle([{
        id: 'cox-ph-rank-score-1200',
        operation: 'survival_cox_ph_rank_score',
        payload: {
          time,
          entry,
          event,
          covariates,
          beta: actual.coefficients.map(coefficient => coefficient.beta)
        }
      }]).find(result => result.id === 'cox-ph-rank-score-1200')?.result;
      expect(proportionalHazardsReference?.available).toBe(true);
      expectClose(proportionalHazards.global.statistic, proportionalHazardsReference.statistic, 'Cox PH global score statistic', { abs: 1e-7, rel: 1e-6 });
      expectClose(proportionalHazards.global.p, proportionalHazardsReference.p, 'Cox PH global score p-value', { abs: 1e-9, rel: 1e-6 });
      expectClose(proportionalHazards.terms[0].statistic, proportionalHazardsReference.termStatistics[0], 'Cox PH term score statistic', { abs: 1e-7, rel: 1e-6 });
      expectClose(proportionalHazards.terms[0].p, proportionalHazardsReference.termPValues[0], 'Cox PH term p-value', { abs: 1e-9, rel: 1e-6 });
    }else{
      expect(proportionalHazards.reason).toMatch(/converged|singular|estimable/i);
    }
  });

  testWithOracle('rank-time interaction score test matches an independent NumPy reference', () => {
    const series = [
      { name: 'Control', records: [] },
      { name: 'Treatment', records: [] }
    ];
    const time = [];
    const entry = [];
    const event = [];
    const covariates = [];
    let seed = 20261025;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for(let index = 0; index < 240; index += 1){
      const group = random() < 0.5 ? 1 : 0;
      const exitTime = Number((-Math.log(Math.max(random(), 1e-12)) / 0.03).toFixed(6));
      const delayedEntry = Number((random() * Math.min(exitTime * 0.4, 2)).toFixed(6));
      series[group].records.push({ time: exitTime, event: true, entry: delayedEntry });
      time.push(exitTime);
      entry.push(delayedEntry);
      event.push(1);
      covariates.push([group]);
    }

    const actual = survivalHooks.fitCoxModel({ series }, { enabled: true, maxIterations: 100 });
    expect(actual.available).toBe(true);
    expect(actual.converged).toBe(true);
    const proportionalHazards = actual.diagnostics.proportionalHazards;
    expect(proportionalHazards?.available).toBe(true);
    const reference = runPythonOracle([{
      id: 'cox-ph-rank-score-overlap',
      operation: 'survival_cox_ph_rank_score',
      payload: {
        time,
        entry,
        event,
        covariates,
        beta: actual.coefficients.map(coefficient => coefficient.beta)
      }
    }]).find(result => result.id === 'cox-ph-rank-score-overlap')?.result;

    expect(reference).toMatchObject({ available: true, df: 1, transform: 'event-time midranks' });
    expectClose(proportionalHazards.global.statistic, reference.statistic, 'Cox PH global score statistic', { abs: 1e-8, rel: 1e-7 });
    expectClose(proportionalHazards.global.p, reference.p, 'Cox PH global score p-value', { abs: 1e-10, rel: 1e-7 });
    expectClose(proportionalHazards.terms[0].statistic, reference.termStatistics[0], 'Cox PH term score statistic', { abs: 1e-8, rel: 1e-7 });
    expectClose(proportionalHazards.terms[0].p, reference.termPValues[0], 'Cox PH term p-value', { abs: 1e-10, rel: 1e-7 });
    expectClose(proportionalHazards.terms[0].adjustedP, reference.termAdjustedPValues[0], 'Cox PH adjusted term p-value', { abs: 1e-10, rel: 1e-7 });
  });
});
