describe('Statistical audit remediation — component contracts', () => {
  beforeAll(() => {
    jest.resetModules();
    global.requestAnimationFrame = callback => { callback(Date.now()); return 1; };
    global.cancelAnimationFrame = () => {};
    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/tabContext.js');
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/undo.js');
    require('../js/shared/resizer.js');
    require('../js/shared/dom.js');
    require('../js/shared/exporter.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/plot3d.js');
    require('../js/shared/graphSizing.js');
    require('../js/shared/regression.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    require('../js/components/scatter.js');
    require('../js/components/venn.js');
    require('../js/components/surface.js');
    require('../js/components/survival.js');
  });

  test('Venn rejects a universe below the observed union and inconsistent regions', () => {
    const validate = window.Components.venn.__statsTestHooks.validateVennSignificanceCounts;
    const counts = { nA: 8, nB: 7, nC: 0, Aonly: 5, Bonly: 4, Conly: 0, AB: 3, AC: 0, BC: 0, ABC: 0 };
    expect(validate(counts, 11).valid).toBe(false);
    const valid = validate(counts, 12);
    expect(valid.valid).toBe(true);
    expect(valid.union).toBe(12);
    expect(validate({ ...counts, nA: 9 }, 20).valid).toBe(false);
  });


  test('Venn applies Holm correction to the displayed overlap family', () => {
    const compute = window.Components.venn.__statsTestHooks.computeVennSignificanceResults;
    const result = compute(
      { nA: 8, nB: 7, nC: 6, Aonly: 3, Bonly: 2, Conly: 2, AB: 2, AC: 1, BC: 1, ABC: 2 },
      30,
      { A: 'A', B: 'B', C: 'C' }
    );
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(4);
    const sortedRaw = result.results.map(entry => entry.rawPValue).slice().sort((a, b) => a - b);
    const sortedAdjusted = result.results.map(entry => entry.adjustedPValue).slice().sort((a, b) => a - b);
    sortedAdjusted.forEach((value, index) => expect(value).toBeGreaterThanOrEqual(sortedRaw[index] - 1e-15));
    result.results.forEach(entry => {
      expect(entry.significant).toBe(entry.adjustedLogPValue < Math.log(0.05));
    });
  });

  test('Scatter labels separated logistic fits as diagnostic-only and suppresses ordinary fit summaries', () => {
    const hooks = window.Components.scatter.__testHooks;
    const points = [
      { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 },
      { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }
    ];
    const model = hooks.fitScatterRegressionModel(points, { mode: 'logistic', method: 'ols' });
    expect(model.diagnosticOnly).toBe(true);
    expect(model.metrics.r2).toBeNaN();
    expect(model.metrics.aic).toBeNaN();
    const detail = hooks.buildScatterStatsDetailReport(
      { points, pointSummary: { count: points.length } },
      { pointCount: points.length, associationMethod: 'none', regression: model },
      { regressionModeValue: 'logistic', fitMethodValue: 'ols', fitSpec: { confidenceLevel: 95 } }
    );
    const rowText = detail.rows.map(row => `${row.metric}: ${row.value}`).join(' | ');
    expect(rowText).toMatch(/Diagnostic curve only/i);
    expect(rowText).not.toMatch(/\[Fit\] AIC/);
    expect(rowText).not.toMatch(/\[Parameters\] Equation/);
    const report = hooks.buildScatterReportingText(
      { points },
      { pointCount: points.length, associationMethod: 'none', regression: model },
      { regressionModeValue: 'logistic', fitMethodValue: 'ols', fitSpec: { confidenceLevel: 95 } }
    );
    expect(report.resultsText).toMatch(/were not reported because the fit was separated or did not converge/i);
  });

  test('Scatter reporting resolves the association method before formatting its symbol', () => {
    const hooks = window.Components.scatter.__testHooks;
    const points = [
      { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 4 }, { x: 4, y: 8 }
    ];
    const report = hooks.buildScatterReportingText(
      { points },
      {
        pointCount: points.length,
        associationSelection: 'spearman',
        associationMethod: 'spearman',
        method: 'Spearman',
        r: 0.8,
        p: 0.02
      },
      {
        regressionModeValue: 'none',
        fitMethodValue: 'ols',
        fitSpec: { confidenceLevel: 95 }
      }
    );
    expect(report.resultsText).toContain('Spearman association: rₛ = 0.8000');
    expect(report.resultsText).toContain('p = 0.02');
  });

  test('Cox hazard-ratio inference guard suppresses CI and p-values after ridge/non-convergence', () => {
    const hooks = window.Components.survival.__testHooks;
    const series = [{ name: 'A' }, { name: 'B' }];
    const coxModel = {
      available: true,
      baselineGroup: 'A',
      coefficients: [{ beta: 0.7 }],
      coefficientIndex: { B: 0 },
      covariance: [[0.04]],
      diagnostics: { inferenceAvailable: false },
      message: 'Cox model required ridge stabilization; ordinary Wald inference is unavailable.'
    };
    const result = hooks.computeHazardRatios(series, coxModel, { enabled: true });
    expect(result.available).toBe(true);
    expect(result.inferenceAvailable).toBe(false);
    expect(result.rows[0].hazardRatio).toBeGreaterThan(1);
    expect(result.rows[0].ciLow).toBeNull();
    expect(result.rows[0].ciHigh).toBeNull();
    expect(result.rows[0].p).toBeNull();
  });

  test('median survival ratios are descriptive and do not fabricate ratio confidence intervals', () => {
    const result = window.Components.survival.__testHooks.computeMedianSurvivalRatios([
      { name: 'A', km: { median: 10, medianCiLow: 8, medianCiHigh: 13 } },
      { name: 'B', km: { median: 20, medianCiLow: 15, medianCiHigh: 25 } }
    ]);
    expect(result.available).toBe(true);
    expect(result.inferenceAvailable).toBe(false);
    expect(result.rows[0].ratio).toBe(2);
    expect(result.rows[0].ciLow).toBeNull();
    expect(result.rows[0].ciHigh).toBeNull();
  });

  test('Surface scans beyond the former 20,000-row raw cap to retain finite points', async () => {
    const surface = window.Components.surface;
    const state = surface.__getState();
    const rows = [['X', 'Y', 'Z']];
    for (let index = 0; index < 20_050; index += 1) rows.push(['', '', '']);
    rows.push([1, 2, 3], [2, 2, 4], [1, 3, 5], [2, 3, 6]);
    state.axisMap = { x: 0, y: 1, z: 2 };
    state.hot = {
      getIncludedDataMatrix: () => rows,
      countCols: () => 3
    };
    const parsed = await surface.__testHooks.parseSurfaceTable();
    expect(parsed.points).toHaveLength(4);
    expect(parsed.stats.rawRowCount).toBe(20_054);
    expect(parsed.stats.scannedRows).toBe(20_054);
    expect(parsed.stats.resourceLimited).toBe(false);
  });
});
