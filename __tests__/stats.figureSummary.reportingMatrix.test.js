/*
 * Contract tests for the compact SVG figure-summary projection.
 * These tests intentionally exercise canonical summary builders with synthetic
 * result models: the renderer may shorten the *set of rows* for very large
 * families, but it must never make the selected statistical story ambiguous.
 */

const { loadComponentTestBootstrap } = require('../test-support/componentTestBootstrap');

function loadComponent(name) {
  jest.resetModules();
  delete window.Shared;
  delete window.Components;
  global.Shared = {};
  global.Components = {};
  window.Shared = global.Shared;
  window.Components = global.Components;
  const jStatModule = require('jstat');
  const jStat = jStatModule?.jStat || jStatModule;
  global.jStat = jStat;
  window.jStat = jStat;
  loadComponentTestBootstrap(name);
  return window.Components[name]?.__testHooks || {};
}

function partText(part) {
  if (part == null) return '';
  if (typeof part === 'string' || typeof part === 'number') return String(part);
  if (typeof part === 'object') return String(part.fallback ?? part.text ?? part.value ?? '');
  return String(part);
}

function rowText(row) {
  if (!row) return '';
  const value = Array.isArray(row.valueParts)
    ? row.valueParts.map(partText).join('')
    : partText(row.value);
  return `${row.label || ''}: ${value}`.trim();
}

function allRows(summary) {
  return (summary?.sections || []).flatMap(section => section?.rows || []);
}

function summaryText(summary) {
  return allRows(summary).map(rowText).join('\n');
}

function rowsIn(summary, key) {
  return summary?.sections?.find(section => section?.key === key)?.rows || [];
}

describe('statistical figure-summary reporting matrix', () => {
  test('ROC reports every curve and names the selected directional AUC comparison', () => {
    const hooks = loadComponent('roc');
    const curves = [
      { name:'Assay A', positiveCount:18, negativeCount:22, auc:0.91, aucCiLow:0.82, aucCiHigh:0.98, mannWhitneyU:356, pVal:0.0004, pMethod:'exact Mann–Whitney', thr:2.4, recall:0.83, specificity:0.86 },
      { name:'Assay B', positiveCount:18, negativeCount:22, auc:0.79, aucCiLow:0.66, aucCiHigh:0.90, mannWhitneyU:305, pVal:0.009, pMethod:'asymptotic Mann–Whitney', thr:1.6, recall:0.72, specificity:0.77 },
      { name:'Assay C', positiveCount:18, negativeCount:22, auc:0.73, aucCiLow:0.58, aucCiHigh:0.86, mannWhitneyU:280, pVal:0.041, pMethod:'asymptotic Mann–Whitney', thr:0.9, recall:0.67, specificity:0.73 }
    ];
    const summary = hooks.buildFigureSummary(curves, 'roc', {
      diff:0.18, ci:[0.05,0.31], z:2.7, p:0.007, pairedCount:40, method:'delong'
    }, {
      compareSelection:'0,2',
      session:{ tabId:'roc-test', state:{}, results:{} }
    });
    const text = summaryText(summary);
    expect(summary.kind).toBe('inferential');
    curves.forEach(curve => expect(text).toContain(curve.name));
    expect(text).toMatch(/Assay A\s*[−-]\s*Assay C.*ΔAUC/i);
    expect(text).toMatch(/paired n\s*=\s*40/i);
    expect(text).toMatch(/unadjusted across curves/i);
    expect(text).toMatch(/single-curve p-values use exact Mann–Whitney; asymptotic Mann–Whitney/i);
    expect((text.match(/Mann–Whitney/gi) || []).length).toBe(2);
  });

  test('precision–recall without a curve-comparison p value is an analysis summary, not inferential', () => {
    const hooks = loadComponent('roc');
    const summary = hooks.buildFigureSummary([
      { name:'Classifier', positiveCount:12, negativeCount:20, avgPrecision:0.84, thr:0.55, precision:0.79, recall:0.75, f1:0.77 }
    ], 'pr', null, { session:{ tabId:'roc-pr-test', state:{}, results:{} } });
    expect(summary.kind).toBe('analysis');
    expect(summary.title).toBe('Analysis summary');
    expect(summaryText(summary)).toMatch(/average precision/i);
  });

  test('precision–recall comparison names the pair, method, confidence interval, and prespecified inference scope', () => {
    const hooks = loadComponent('roc');
    const summary = hooks.buildFigureSummary([
      { name:'Model A', positiveCount:20, negativeCount:30, avgPrecision:0.88 },
      { name:'Model B', positiveCount:20, negativeCount:30, avgPrecision:0.74 }
    ], 'pr', {
      diff:0.14, ci:[0.04,0.24], p:0.012, pairedCount:50, iterations:5000, method:'paired-bootstrap'
    }, {
      compareSelection:'0,1',
      session:{ tabId:'roc-pr-compare', state:{ diffMethod:'bootstrap' }, results:{} }
    });
    const text = summaryText(summary);
    expect(summary.kind).toBe('inferential');
    expect(text).toMatch(/Model A\s*[−-]\s*Model B.*ΔAP/i);
    expect(text).toMatch(/95% CI \[0\.040, 0\.240\]/i);
    expect(text).toMatch(/Bootstrap/i);
    expect(text).toMatch(/one prespecified paired comparison/i);
    expect(text).toMatch(/no multiplicity adjustment required/i);
  });

  test('Histogram distinguishes one-series diagnostics, exactly-two-series KS, and unavailable three-series KS', () => {
    const hooks = loadComponent('hist');
    const makeEntry = (label, n, mean) => ({
      label,
      summary:{ n, mean, sd:1.2, median:mean - 0.1, iqr:1.4 },
      diagnostics:{ gof:{ available:true, calibration:'parametric bootstrap with fitted parameters refit', iterations:500, ks:{statistic:0.11,pValue:0.42}, ad:{statistic:0.37,pValue:0.35} } },
      modelComparison:{ available:true, normalAicc:101, lognormalAicc:106, deltaAicc:5, preferred:'normal' }
    });
    const one = hooks.buildFigureSummary([makeEntry('A',20,4)], { diagnosticsMode:'normal-vs-lognormal', comparisonMode:'off', graphLabel:'Histogram' });
    expect(summaryText(one)).toMatch(/500 successful simulations/i);
    expect(summaryText(one)).toMatch(/unadjusted model diagnostics/i);
    expect(summaryText(one)).toMatch(/A normal fit.*n\s*=\s*20/i);

    const diagnostics = hooks.buildFigureSummary([makeEntry('A',20,4),makeEntry('B',18,5)], {
      diagnosticsMode:'normal-fit', comparisonMode:'off', graphLabel:'Histogram'
    });
    const diagnosticsText = summaryText(diagnostics);
    expect(diagnosticsText).toMatch(/A normal fit.*n\s*=\s*20/i);
    expect(diagnosticsText).toMatch(/B normal fit.*n\s*=\s*18/i);

    const two = hooks.buildFigureSummary([makeEntry('A',20,4),makeEntry('B',18,5)], {
      diagnosticsMode:'off', comparisonMode:'ks', graphLabel:'Histogram',
      ksResult:{ available:true, D:0.31, p:0.044, nA:20, nB:18, method:'asymptotic two-sided', hasTies:true, warning:'Ties detected; asymptotic KS p-value is approximate.' }
    });
    const twoText = summaryText(two);
    expect(twoText).toMatch(/A vs B/i);
    expect(twoText).toMatch(/n\s*=\s*20\s*vs\s*18/i);
    expect(twoText).toMatch(/ties detected/i);

    const unavailable = hooks.buildFigureSummary([makeEntry('A',20,4),makeEntry('B',18,5)], {
      diagnosticsMode:'off', comparisonMode:'ks', graphLabel:'Histogram',
      ksResult:{ available:false, message:'At least two finite observations are required in each series.' }
    });
    expect(summaryText(unavailable)).toMatch(/At least two finite observations are required/i);

    const three = hooks.buildFigureSummary([makeEntry('A',20,4),makeEntry('B',18,5),makeEntry('C',22,6)], { diagnosticsMode:'off', comparisonMode:'ks', graphLabel:'Histogram' });
    expect(summaryText(three)).toMatch(/exactly two visible series are required/i);
  });

  test('Histogram supports log-normal-only diagnostics and reports support failures', () => {
    const hooks = loadComponent('hist');
    const values = [1, 2, 3, 5, 8, 13, 21, 34];
    const diagnostic = hooks.computeLognormalFitDiagnostic(values, { alpha: 0.05 });
    expect(diagnostic.fit.key).toBe('lognormal');
    expect(diagnostic.gof.available).toBe(true);

    const summary = hooks.buildFigureSummary([{
      label:'A',
      summary:hooks.computeSummary(values),
      diagnostics:diagnostic,
      modelComparison:null
    }], { diagnosticsMode:'lognormal-fit', comparisonMode:'off', graphLabel:'Histogram' });
    const text = summaryText(summary);
    expect(text).toMatch(/Fitted-log-normal KS and Anderson–Darling/i);
    expect(text).toMatch(/A log-normal fit/i);

    const unsupported = hooks.computeLognormalFitDiagnostic([0, 1, 2], { alpha: 0.05 });
    expect(unsupported.available).toBe(false);
    expect(unsupported.message).toMatch(/positive/i);
    const unavailableSummary = hooks.buildFigureSummary([{
      label:'A',
      summary:hooks.computeSummary([0, 1, 2]),
      diagnostics:unsupported,
      modelComparison:null
    }], { diagnosticsMode:'lognormal-fit', comparisonMode:'off', graphLabel:'Histogram' });
    expect(summaryText(unavailableSummary)).toMatch(/A log-normal fit.*positive/i);
  });

  test('Pie/contingency reports overall effect size and names every corrected pairwise comparison', () => {
    const hooks = loadComponent('pie');
    const summary = hooks.buildFigureSummary({
      summary:{ testLabel:'Pearson chi-square test', df:2, statistic:'8.412', total:'162', pValueRaw:0.0149, pValue:'0.0149', effectValue:'0.29', footnotes:['1 expected count is below 5.'] },
      pairs:[
        { left:'Control', right:'Drug A', df:1, statistic:'5.1', pValueRaw:0.024, pAdjustedRaw:0.048, cramersV:'0.24', total:80 },
        { left:'Control', right:'Drug B', df:1, statistic:'7.0', pValueRaw:0.008, pAdjustedRaw:0.024, cramersV:'0.28', total:82 }
      ],
      pairInferenceSpec:{ method:'holm', criterion:'alpha' }
    }, { scope:'all' }, { alpha:0.05 });
    const text = summaryText(summary);
    expect(text).toMatch(/χ²\(2\)/);
    expect(text).toMatch(/N\s*=\s*162/i);
    expect(text).toMatch(/Cramér's V/i);
    expect(text).toContain('Control vs Drug A');
    expect(text).toContain('Control vs Drug B');
    expect(text).toMatch(/Holm/i);
    expect(text).toMatch(/expected count/i);
  });

  test('Pie goodness-of-fit reports the omnibus statistic, effect size, and no irrelevant pairwise multiplicity language', () => {
    const hooks = loadComponent('pie');
    const summary = hooks.buildFigureSummary({
      expectedSource:'equal-proportions',
      summary:{ testLabel:'Pearson chi-square goodness-of-fit', df:3, statistic:'10.240', total:'100', pValueRaw:0.0167, pValue:'0.0167', effectValue:'0.31', footnotes:['All expected counts are at least 5.'] },
      pairs:[]
    }, { scope:'gof' }, { alpha:0.05 });
    const text = summaryText(summary);
    expect(text).toMatch(/Pearson chi-square goodness-of-fit/i);
    expect(text).toMatch(/χ²\(3\)\s*=\s*10\.240/i);
    expect(text).toMatch(/N\s*=\s*100/i);
    expect(text).toMatch(/Cohen's w\s*=\s*0\.31/i);
    expect(text).not.toMatch(/pairwise comparison/i);
  });

  test('Survival reports all groups, corrected log-rank pairs, and unadjusted multiple HR contrasts transparently', () => {
    const hooks = loadComponent('survival');
    const summary = hooks.buildFigureSummary({
      series:[
        { name:'Control', total:30, events:18, censored:12, km:{median:12,medianCiLow:9,medianCiHigh:16} },
        { name:'Drug A', total:31, events:13, censored:18, km:{median:19,medianCiLow:15,medianCiHigh:25} },
        { name:'Drug B', total:29, events:11, censored:18, km:{median:22,medianCiLow:17,medianCiHigh:29} }
      ],
      logRank:{ available:true, chi2:8.7, df:2, p:0.0129 },
      pairwiseComparisons:{ available:true, correction:{label:'Holm'}, rows:[
        { groupA:'Control',groupB:'Drug A',chi2:4.8,p:0.028,adjustedP:0.056 },
        { groupA:'Control',groupB:'Drug B',chi2:7.1,p:0.0077,adjustedP:0.023 },
        { groupA:'Drug A',groupB:'Drug B',chi2:0.4,p:0.53,adjustedP:0.53 }
      ]},
      hazardRatios:{ available:true, inferenceAvailable:true, rows:[
        { groupA:'Control',groupB:'Drug A',hazardRatio:0.61,ciLow:0.37,ciHigh:0.98,z:-2.02,p:0.043 },
        { groupA:'Control',groupB:'Drug B',hazardRatio:0.49,ciLow:0.29,ciHigh:0.83,z:-2.64,p:0.008 }
      ] }
    });
    const text = summaryText(summary);
    ['Control','Drug A','Drug B'].forEach(name => expect(text).toContain(name));
    expect(text).toMatch(/Holm.*3 pairwise/i);
    expect(text).toMatch(/2 requested hazard-ratio contrasts.*unadjusted/i);
    expect(text).toMatch(/HR: Drug A vs Control/i);
    expect(text).toMatch(/HR: Drug B vs Control/i);
  });

  test('Survival with one group and no inferential model is explicitly descriptive', () => {
    const hooks = loadComponent('survival');
    const summary = hooks.buildFigureSummary({
      series:[{ name:'Cohort', total:25, events:10, censored:15, km:{median:18,medianCiLow:13,medianCiHigh:24} }]
    });
    expect(summary.kind).toBe('analysis');
    expect(summary.title).toBe('Analysis summary');
  });

  test('Heatmap reports all small correlation families, selects transparently from large families, and avoids inference for uncentered correlation', () => {
    const hooks = loadComponent('heatmap');
    const smallPairs = [
      {left:'A',right:'B',raw:0.8,n:10,rawPValue:0.006,adjustedPValue:0.018,pMethod:'two-sided Student t approximation'},
      {left:'A',right:'C',raw:0.2,n:10,rawPValue:0.58,adjustedPValue:0.58,pMethod:'two-sided Student t approximation'},
      {left:'B',right:'C',raw:-0.5,n:10,rawPValue:0.14,adjustedPValue:0.28,pMethod:'two-sided Student t approximation'}
    ];
    const small = hooks.buildFigureSummary({ type:'correlation',method:'pearson',itemCount:3,pairCount:3,showSignificance:true,significanceCorrection:'holm',inferenceLevel:0.05,pairResults:smallPairs,decimals:3 });
    const smallText = summaryText(small);
    smallPairs.forEach(pair => expect(smallText).toContain(`${pair.left} vs ${pair.right}`));
    expect(smallText).toMatch(/Student t approximation/i);
    expect((smallText.match(/Student t approximation/gi) || []).length).toBe(1);

    const largePairs = Array.from({length:10},(_,i)=>({ left:`G${i}`, right:`G${i+1}`, raw:0.9-(i*0.02), n:30, rawPValue:0.001*(i+1), adjustedPValue:0.002*(i+1), pMethod:'two-sided Student t approximation' }));
    const large = hooks.buildFigureSummary({ type:'correlation',method:'pearson',itemCount:6,pairCount:10,showSignificance:true,significanceCorrection:'bh',inferenceLevel:0.05,pairResults:largePairs,decimals:3 });
    expect(summaryText(large)).toMatch(/10 of 10 at the configured FDR threshold/i);
    expect(summaryText(large)).not.toMatch(/showing 5|complete tested family remains/i);

    const uncentered = hooks.buildFigureSummary({ type:'correlation',method:'uncentered',itemCount:3,pairCount:3,showSignificance:true,significanceCorrection:'bh',inferenceLevel:0.05,pairResults:[],strongest:{labels:['A','B'],raw:0.9,count:10},decimals:3 });
    expect(uncentered.kind).toBe('analysis');
    expect(summaryText(uncentered)).toMatch(/p-values are not computed for uncentered correlation/i);
  });

  test('Venn reports the entire displayed overlap family and treats a one-test family as prespecified', () => {
    const hooks = loadComponent('venn');
    const one = hooks.buildFigureSummary({ valid:true,total:100,alpha:0.05,validation:{setCount:2},results:[
      {name:'A ∩ B',observed:14,successes:30,draws:25,rawPValue:0.009,adjustedPValue:0.009,rawLogPValue:Math.log(0.009),adjustedLogPValue:Math.log(0.009),significant:true}
    ]});
    expect(summaryText(one)).toMatch(/One displayed overlap test; no multiplicity adjustment is required/i);

    const three = hooks.buildFigureSummary({ valid:true,total:1000,alpha:0.05,validation:{setCount:3},results:[
      {name:'A ∩ B',observed:20,successes:100,draws:120,rawPValue:0.01,adjustedPValue:0.03,rawLogPValue:Math.log(0.01),adjustedLogPValue:Math.log(0.03),significant:true},
      {name:'A ∩ C',observed:15,successes:100,draws:90,rawPValue:0.04,adjustedPValue:0.08,rawLogPValue:Math.log(0.04),adjustedLogPValue:Math.log(0.08),significant:false},
      {name:'B ∩ C',observed:10,successes:120,draws:90,rawPValue:0.2,adjustedPValue:0.2,rawLogPValue:Math.log(0.2),adjustedLogPValue:Math.log(0.2),significant:false}
    ]});
    const text = summaryText(three);
    ['A ∩ B','A ∩ C','B ∩ C'].forEach(label => expect(text).toContain(label));
    expect(text).toMatch(/Holm adjustment across 3/i);
  });

  test('PCA and Surface remain descriptive and never invent inferential statistics', () => {
    const pca = loadComponent('pca').buildFigureSummary({
      method:'pca',sampleCount:12,featureCount:500,standardizeVariables:true,
      eigenSummary:[{variancePercent:62,eigenvalue:4.1},{variancePercent:18,eigenvalue:1.2}],
      selectionSummary:{ruleLabel:'Parallel analysis',retainedCount:3}
    }, 'pca');
    expect(pca.kind).toBe('analysis');
    expect(summaryText(pca)).toMatch(/12 samples.*500 variables/i);
    expect(summaryText(pca)).not.toMatch(/\bp\s*[=<]/i);

    const surface = loadComponent('surface').buildFigureSummary({ gridColumns:20,gridRows:10,gridExpected:200,gridComplete:true,vertexCount:200,faceCount:342,zMin:-2,zMax:6,skipped:3 });
    expect(surface.kind).toBe('analysis');
    expect(summaryText(surface)).toMatch(/20 × 10 coordinate grid/i);
    expect(summaryText(surface)).toMatch(/3 rows with missing or non-numeric/i);
  });

  test('Scatter single-dataset summary reports association and coefficient inference with distinct CI scopes', () => {
    const hooks = loadComponent('scatter');
    const summary = hooks.buildScatterFigureSummary({ points:Array.from({length:15},()=>({x:1,y:2})) }, {
      associationMethod:'pearson', associationSelection:'pearson', r:0.72, p:0.002, pointCount:15
    }, {
      regressionModeValue:'linear', fitMethodValue:'ols', associationMethod:'pearson', fitSpec:{confidenceLevel:90}
    }, {
      detail:{
        stats:{ r:0.72,p:0.002,pMethod:'Student t approximation',pointCount:15,correlationCI:{low:0.39,high:0.89},correlationCiApproximate:false },
        regressionModel:{ metrics:{sampleSize:15,r2:0.52,rmse:1.1}, intervals:{degreesOfFreedom:13}, coefficientStats:[
          {term:'Intercept',estimate:1.2,standardError:0.4,tStatistic:3,pValue:0.01,ciLow:0.5,ciHigh:1.9},
          {term:'Slope',estimate:0.8,standardError:0.2,tStatistic:4,pValue:0.0015,ciLow:0.45,ciHigh:1.15}
        ], summary:{primaryParameter:{label:'Slope',value:0.8}} }
      }
    });
    const text = summaryText(summary);
    expect(text).toMatch(/association intervals: 95%/i);
    expect(text).toMatch(/regression coefficient intervals: 90%/i);
    expect(rowsIn(summary, 'analysis').map(row => row.label)).toContain('Inference');
    expect(text).toMatch(/Pearson/i);
    expect(text).toMatch(/Slope\s*=\s*0\.8/i);
    expect(text).toMatch(/t\(13\)/i);
    expect(text).toMatch(/association p-values use Student t approximation/i);
    expect(text).not.toMatch(/Student t approximation; two-sided/i);
  });

  test('Scatter model-fit-only summary stays descriptive when no coefficient or association inference is available', () => {
    const hooks = loadComponent('scatter');
    const summary = hooks.buildScatterFigureSummary({ points:[{x:1,y:2},{x:2,y:3}] }, {
      associationMethod:'none', associationSelection:'none', pointCount:2
    }, {
      regressionModeValue:'spline', fitMethodValue:'ols', associationMethod:'none', fitSpec:{confidenceLevel:95}
    }, {
      detail:{ regressionModel:{ metrics:{sampleSize:2,rmse:0.2}, summary:{equation:'spline fit'} } }
    });
    expect(summary.kind).toBe('analysis');
    expect(summary.title).toBe('Analysis summary');
    expect(summaryText(summary)).toMatch(/association not requested/i);
  });

  test('Scatter grouped linear comparison names every pair and distinguishes raw from Holm-adjusted p values', () => {
    const hooks = loadComponent('scatter');
    const groupedReports = ['A','B','C'].map((label,index)=>({ label, detail:{
      stats:{r:0.6-index*0.1,p:0.02+index*0.01,pMethod:'Student t approximation',pointCount:12,correlationCI:{low:0.1,high:0.8}},
      regressionModel:{metrics:{sampleSize:12,r2:0.5},intervals:{degreesOfFreedom:10},coefficientStats:[{term:'Slope',estimate:1+index*0.2,standardError:0.1,tStatistic:4,pValue:0.002,ciLow:0.8,ciHigh:1.4}],summary:{primaryParameter:{label:'Slope',value:1+index*0.2}}}
    }}));
    const pairRows = [
      {pair:'A vs B',slopesP:0.01,slopesAdjP:0.03,interceptsP:0.4,interceptsAdjP:0.8,decisionCode:'different-slopes',conclusion:'different slopes'},
      {pair:'A vs C',slopesP:0.02,slopesAdjP:0.04,interceptsP:0.3,interceptsAdjP:0.6,decisionCode:'different-slopes',conclusion:'different slopes'},
      {pair:'B vs C',slopesP:0.5,slopesAdjP:0.5,interceptsP:0.04,interceptsAdjP:0.08,decisionCode:'same-line',conclusion:'no significant difference'}
    ];
    const summary = hooks.buildScatterFigureSummary({}, { associationMethod:'pearson',grouped:true,groupedLinearComparison:{
      overall:{slopesTest:{fStatistic:5.2,df1:2,df2:30,pValue:0.011},interceptTest:{fStatistic:1.3,df1:2,df2:32,pValue:0.29},commonLineTest:{fStatistic:3.8,df1:4,df2:32,pValue:0.012}},
      overallDecision:{text:'Slopes differ across datasets.'},pairwiseRows:pairRows
    }}, { regressionModeValue:'linear',fitMethodValue:'ols',fitSpec:{confidenceLevel:95} }, { groupedReports });
    const text = summaryText(summary);
    ['A vs B','A vs C','B vs C'].forEach(pair => expect(text).toContain(pair));
    expect(text).toMatch(/slope raw p/i);
    expect(text).toMatch(/Holm p/i);
    expect(text).toMatch(/equality of slopes is tested first/i);
  });

  test('Line single and multi-series summaries report every series and the selected decision alpha separately from 95% intervals', () => {
    const hooks = loadComponent('line');
    const makeSeries = (name, r, p) => ({ name, pointCount:10, stats:{
      method:'Pearson',r,p,pMethod:'Student t approximation',correlationCI:{low:0.2,high:0.85},correlationCiApproximate:false,
      regression:{metrics:{sampleSize:10,r2:0.55,adjR2:0.49,rmse:1.0},intervals:{degreesOfFreedom:8},coefficientStats:[{term:'Slope',estimate:0.7,standardError:0.15,tStatistic:4.67,pValue:0.0016,ciLow:0.35,ciHigh:1.05}]}
    }, modelF:9.8,modelFP:0.014,modelDf1:1,modelDf2:8 });
    const summary = hooks.buildFigureSummary([makeSeries('Day 1',0.74,0.014),makeSeries('Day 2',0.67,0.034)], {
      method:'pearson',methodLabel:'Pearson',regressionMode:'linear',confidenceAlpha:0.05,decisionAlpha:0.01
    });
    const text = summaryText(summary);
    expect(text).toContain('Day 1');
    expect(text).toContain('Day 2');
    expect(text).toMatch(/95% confidence intervals/i);
    expect(text).toMatch(/α\s*=\s*0\.01/i);
    expect(rowsIn(summary, 'analysis').map(row => row.label)).toContain('Inference');
    expect(text).toMatch(/per-series inferential p-values are not multiplicity-adjusted/i);
    expect(text).toMatch(/F\(1, 8\)/i);
    expect(text).toMatch(/association p-values use Student t approximation/i);
    expect(text).not.toMatch(/Student t approximation; two-sided/i);
  });

  test('Line summary is descriptive if a model yields metrics but no inferential p-values', () => {
    const hooks = loadComponent('line');
    const summary = hooks.buildFigureSummary([{ name:'Series A', pointCount:3, stats:{
      method:'Pearson', r:0.5, p:NaN,
      regression:{ metrics:{sampleSize:3,r2:0.25,rmse:1.2}, coefficientStats:[{term:'Slope',estimate:0.4,standardError:0.3,ciLow:-0.9,ciHigh:1.7}] }
    }}], { methodLabel:'Pearson', regressionMode:'linear', confidenceAlpha:0.05, decisionAlpha:0.05 });
    expect(summary.kind).toBe('analysis');
    expect(summary.title).toBe('Analysis summary');
  });

  test('Line forecast summaries do not pretend forecast-error metrics are inferential tests', () => {
    const hooks = loadComponent('line');
    const summary = hooks.buildFigureSummary([{ name:'Series A',pointCount:30,stats:{
      method:'Pearson',r:0.5,p:0.006,pMethod:'Student t approximation',correlationCI:{low:0.18,high:0.72},
      regression:{mode:'arima',metrics:{sampleSize:30,horizon:5,rmse:2.1,mae:1.7,mape:0.08,smape:0.09,selectionCriterion:'aicc',selectionScore:104.2}}
    }}], { methodLabel:'Pearson',regressionMode:'arima',confidenceAlpha:0.05,decisionAlpha:0.05 });
    const text = summaryText(summary);
    expect(text).toMatch(/Forecast/i);
    expect(text).toMatch(/RMSE\s*=\s*2\.1/i);
    expect(text).toMatch(/MAPE\s*=\s*8\.00%/i);
    expect(text).not.toMatch(/forecast.*p\s*=/i);
  });

  test('Box reports one prespecified comparison without fake correction and a corrected multi-comparison family with named rows', () => {
    const hooks = loadComponent('box');
    const one = hooks.buildFigureSummary({
      ok:true, correctionCount:1,
      tables:[{columns:[{key:'metric'},{key:'value'}],rows:[
        {metric:'Comparison',value:'Control vs Drug'}, {metric:'Test',value:'Welch t-test'}, {metric:'t',value:'-2.41'}, {metric:'df',value:'17.8'}, {metric:'Difference',value:'-3.2'}, {metric:'95% CI',value:'-6.0 to -0.4'}, {metric:'p-value',value:0.027}
      ]}]
    }, { analysisSpec:{ mode:'single',analysisLabel:'Welch t-test',selectedGroups:['Control','Drug'],paired:false,alternative:'two-sided',ciLevel:0.95,correction:'none',configuredCorrection:'holm' } });
    const oneText = summaryText(one);
    expect(oneText).toMatch(/One prespecified comparison; no multiplicity adjustment required/i);
    expect(oneText).toMatch(/Control vs Drug/i);
    expect(oneText).toMatch(/df\s*=\s*17\.8/i);

    const many = hooks.buildFigureSummary({
      ok:true, correctionCount:3,
      tables:[{caption:'Post-hoc comparisons',columns:[{key:'comparison'},{key:'p'}],rows:[
        {comparison:'A vs B',t:2.1,df:20,difference:1.2,ci:'0.1 to 2.3',p:0.048,padjust:0.096},
        {comparison:'A vs C',t:3.4,df:20,difference:2.4,ci:'0.9 to 3.9',p:0.003,padjust:0.009},
        {comparison:'B vs C',t:1.8,df:20,difference:1.2,ci:'-0.2 to 2.6',p:0.08,padjust:0.096}
      ]}]
    }, { analysisSpec:{mode:'single',analysisLabel:'One-way ANOVA + post-hoc',selectedGroups:['A','B','C'],paired:false,alternative:'two-sided',ciLevel:0.95,correction:'holm',configuredCorrection:'holm'} });
    const manyText = summaryText(many);
    ['A vs B','A vs C','B vs C'].forEach(pair => expect(manyText).toContain(pair));
    expect(manyText).toMatch(/Holm correction across 3/i);
    expect(manyText).toMatch(/raw p/i);
    expect(manyText).toMatch(/adjusted p/i);
  });

  test('Box factorial summary reports each effect as F(df1, df2) with the model-specific error term', () => {
    const hooks = loadComponent('box');
    const summary = hooks.buildFigureSummary({
      ok:true, correctionCount:0,
      tables:[{ caption:'Two-way ANOVA', rows:[
        {source:'Group',df:1,f:6.2,p:0.019},
        {source:'Condition',df:2,f:8.5,p:0.0014},
        {source:'Group × Condition',df:2,f:3.9,p:0.032},
        {source:'Error',df:24}
      ] }]
    }, { analysisSpec:{ mode:'grouped', analysisLabel:'Two-way ANOVA', groupsCount:2, conditionsCount:3, rowsWithData:30, partialRowsSkipped:0, correction:'none' } });
    const text = summaryText(summary);
    expect(text).toMatch(/Group: F\(1, 24\)\s*=\s*6\.2/i);
    expect(text).toMatch(/Condition: F\(2, 24\)\s*=\s*8\.5/i);
    expect(text).toMatch(/Group × Condition: F\(2, 24\)\s*=\s*3\.9/i);
  });

});
