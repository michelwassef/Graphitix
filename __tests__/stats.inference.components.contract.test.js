const fs = require('fs');
const path = require('path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('Cross-component inference UI contract', () => {
  test('manual statistics components expose inference controls before Calculate', () => {
    const html = read('index.html');
    const pairs = [
      ['boxStatsInferenceControls', 'boxComputeStats'],
      ['pieStatsInferenceControls', 'pieComputeStats'],
      ['scatterStatsInferenceControls', 'scatterComputeStats'],
      ['lineStatsInferenceControls', 'lineComputeStats'],
      ['vennStatsInferenceControls', 'calcSignificance']
    ];
    pairs.forEach(([host, button]) => {
      expect(html.indexOf(`id="${host}"`)).toBeGreaterThan(-1);
      expect(html.indexOf(`id="${button}"`)).toBeGreaterThan(-1);
      expect(html.indexOf(`id="${host}"`)).toBeLessThan(html.indexOf(`id="${button}"`));
    });
    expect(html).not.toContain('pcaStatsInferenceControls');
    expect(html).not.toContain('surfaceStatsInferenceControls');
  });

  test('reporting no longer owns an editable significance threshold', () => {
    const stats = read('js/shared/stats.js');
    expect(stats).not.toContain('getSignificanceThreshold');
    expect(stats).not.toContain('setSignificanceThreshold');
    expect(stats).not.toContain('stats-significance-controls');
    expect(stats).toContain('stats-reporting-controls');
  });

  test('Box has one shared inferential authority and invalidates durable results when analysis settings change', () => {
    const box = read('js/components/box.js');
    expect(box).toContain("Shared.statsInference?.getAlpha");
    expect(box).toContain("Shared.statsInference?.getTargetFdr");
    expect(box).not.toContain('state.statsAlpha');
    expect(box).toMatch(/clearBoxStatsResultsState\(reasonText \|\| 'stats-config-change'/);
    expect(read('index.html')).toContain('Decision (* / NS; D / ND for FDR)');
  });

  test('descriptive diagnostics and regression confidence levels are not reused as inferential alpha', () => {
    const box = read('js/components/box.js');
    const scatter = read('js/components/scatter.js');
    expect(box).toContain('return ASSUMPTION_ALPHA;');
    expect(scatter).toContain('getScatterStatsAlpha');
    expect(scatter).toContain('scatterConfidenceLevel');
    expect(scatter).not.toMatch(/getScatterStatsAlpha\(\)[^\n]*confidenceLevel/);
  });

  test('Venn no longer hard-codes Holm significance at 0.05', () => {
    const venn = read('js/components/venn.js');
    expect(venn).toContain('getVennStatsAlpha');
    expect(venn).toContain("method: 'holm'");
    expect(venn).not.toMatch(/adjusted(?:Log)?PValue\s*[<]=?\s*(?:Math\.log\()?0\.05/);
  });
  test('Box exposes only inference controls relevant to the active analysis family', () => {
    const box = read('js/components/box.js');
    expect(box).toContain('function boxStatsHasOverallInference()');
    expect(box).toContain("groupedAnalysis === 'twoWayAnova'");
    expect(box).toContain("groupedAnalysis === 'rowRandomMixed'");
    expect(box).toContain("groupedAnalysis === 'threeWayAnova'");
    expect(box).toContain('function boxStatsHasComparisonInference()');
    expect(box).toContain("groupedAnalysis === 'rowTTests' || groupedAnalysis === 'multipleComparisons'");
    expect(box).toContain('includeOverall: () => boxStatsHasOverallInference()');
    expect(box).toContain('includeComparisons: () => boxStatsHasComparisonInference()');
  });

  test('Box result inference is explicitly typed instead of inferred from p-value column labels', () => {
    const model = read('js/shared/boxStatsModel.js');
    expect(model).toContain("inferenceRole: 'overall'");
    expect(model).toContain("inferenceRole: 'comparison'");
    expect(model).toMatch(/inferenceRole\s*:\s*showAdjustedP\s*\?\s*'raw'\s*:\s*'comparison'/);
    expect(model).toMatch(/inferenceRole\s*:\s*hasAdjustedFamily\s*\?\s*'raw'\s*:\s*'comparison'/);
    expect(model).not.toContain('function isPValueColumn(');
    expect(model).not.toContain('function isAdjustedPValueColumn(');
    expect(model).not.toContain('Fallback for older in-memory table models');
  });


  test('Box treats a singleton comparison family as unadjusted without overwriting the configured correction', () => {
    const box = read('js/components/box.js');
    const model = read('js/shared/boxStatsModel.js');
    expect(box).toContain('if(comparisonCount <= 1)');
    expect(box).toContain("return 'none';");
    expect(model).toContain("const effectiveMethod = rawValues.length > 1 ? (method || DEFAULT_CORRECTION) : 'none';");
    expect(model).toContain('configuredCorrection:payload.statsCorrection || DEFAULT_CORRECTION');
  });

  test('Pie reports the effective comparison correction and preserves explicit overall inference metadata', () => {
    const pie = read('js/components/pie.js');
    expect(pie).toContain("const effectiveCorrection = finitePValues.length > 1 ? sanitizePieStatsCorrection(stats.correction) : 'none';");
    expect(pie).toContain('correction: reportCorrectionMethod');
    expect(pie).toContain('inference: completedInferenceSnapshot');
    expect(pie).toContain('__statsInference: renderedModel.summary.inferenceSpec || overallInferenceSpec');
  });

  test('Scatter reporting p-values use shared inference while association and regression CI levels remain distinct', () => {
    const scatter = read('js/components/scatter.js');
    expect(scatter).toContain('const reportPValue = value => scatterInferencePValue(value');
    expect(scatter).toContain("{ method: 'holm', valueKind: 'adjusted-p' }");
    expect(scatter).toContain('A 95% confidence interval was reported for the association estimate');
    expect(scatter).toContain('const fitConfidenceLabel =');
    expect(scatter).toContain('`[Intervals] X-intercept (${fitConfidenceLabel} CI)`');
    expect(scatter).toContain('`[Intervals] 1/Slope (${fitConfidenceLabel} CI)`');
  });

  test('obsolete Box reporting-threshold refresh exemption is removed', () => {
    const box = read('js/components/box.js');
    expect(box).not.toContain("'stats-threshold'");
  });

  test('manual-result signatures include inferential alpha without coupling it to confidence intervals', () => {
    const scatter = read('js/components/scatter.js');
    const line = read('js/components/line.js');
    expect(scatter).toContain('String(getScatterStatsAlpha())');
    expect(scatter).toContain("scatterConfidenceLevel?.value || '95'");
    expect(line).toContain('const inferenceAlpha = getLineStatsAlpha();');
    expect(line).toContain("return [method, regressionMode, String(inferenceAlpha), forecastKey, seriesKey].join('::');");
    expect(line).toContain('Regression confidence/prediction intervals are 95%; do not couple them to inferential α.');
  });

  test('Heatmap uses inference-level terminology and discovery markers for FDR', () => {
    const heatmap = read('js/components/heatmap.js');
    const html = read('index.html');
    expect(heatmap).not.toContain('significanceThreshold');
    expect(heatmap).toContain('inferenceLevel');
    expect(heatmap).toContain("correction==='bh' || correction==='by' ? 'D' : '*'");
    expect(html).toContain('Show inference');
    expect(html).toContain('Decision marker');
  });

  test('Box graph annotations default to P-value while retaining decision mode', () => {
    const box = read('js/components/box.js');
    const html = read('index.html');
    expect(box).toContain("DEFAULT_SIGNIFICANCE_LABEL_MODE = 'p'");
    expect(box).toContain("return value === 'decision' ? 'decision' : DEFAULT_SIGNIFICANCE_LABEL_MODE;");
    expect(box).not.toContain("significanceLabelMode: 'stars'");
    expect(html).toContain('<option value="p" selected>P-value</option>');
  });

  test('Scatter keeps alpha available for model-only fits because regression coefficients still have inferential p-values', () => {
    const scatter = read('js/components/scatter.js');
    expect(scatter).toContain('includeOverall: true');
    expect(scatter).toContain('None (model fit only)');
    expect(scatter).toContain('coefficientStats');
    expect(scatter).toContain('scatterInferencePValue');
  });

});
