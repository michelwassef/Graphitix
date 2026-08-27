describe('Shared Box statistics model ownership', () => {
  let model;

  beforeAll(() => {
    jest.resetModules();
    const jStatModule = require('jstat');
    const jStat = jStatModule?.jStat || jStatModule;
    global.Shared = {};
    global.jStat = jStat;
    if(typeof window !== 'undefined'){
      window.Shared = global.Shared;
      window.jStat = jStat;
    }
    require('../js/shared/stats.js');
    require('../js/shared/boxStatsModel.js');
    model = (typeof window !== 'undefined' ? window.Shared : global.Shared).boxStatsModel;
  });

  test('post-hoc metadata has one complete shared owner', () => {
    const options = model.listPostHocOptions();
    expect(options.map(option => option.value)).toEqual([
      'standard', 'tukey', 'gamesHowell', 'tamhaneT2',
      'dunn', 'nemenyi', 'dunnett', 'dunnettT3'
    ]);
    expect(model.getPostHocSummary('tamhaneT2', { groupCount: 3 })).toMatch(/Tamhane/i);
    expect(model.getPostHocSummary('nemenyi', { groupCount: 3 })).toMatch(/Nemenyi/i);
  });

  test('Tamhane T2 and Nemenyi are real model branches, not UI-only options', () => {
    const tamhane = model.computeBoxStatsModel({
      mode: 'single',
      statsTest: 'parametric',
      statsMode: 'all',
      statsPaired: false,
      statsPostHoc: 'tamhaneT2',
      statsParametricVariant: 'welch',
      statsCorrection: 'holm',
      statsAlpha: 0.05,
      statsEffectParametric: 'cohenD',
      statsEffectNonParametric: 'rankBiserial',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 2, 3, 4, 5] },
        { index: 1, label: 'B', values: [5, 7, 9, 12, 18, 24] },
        { index: 2, label: 'C', values: [10, 15, 22, 30, 42, 55] }
      ]
    });
    expect(tamhane.ok).toBe(true);
    expect(tamhane.postHoc).toBe('tamhaneT2');
    expect(tamhane.pairs).toHaveLength(3);
    expect(tamhane.pairs.every(pair => pair.method === 'tamhaneT2' && Number.isFinite(pair.adjP))).toBe(true);

    const nemenyi = model.computeBoxStatsModel({
      mode: 'single',
      statsTest: 'nonparametric',
      statsMode: 'all',
      statsPaired: true,
      statsPostHoc: 'nemenyi',
      statsCorrection: 'holm',
      statsResamplingMode: 'auto',
      statsMonteCarloIterations: 2000,
      statsSeed: 42,
      statsEffectParametric: 'cohenD',
      statsEffectNonParametric: 'rankBiserial',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3, 4, 5, 6] },
        { index: 1, label: 'B', values: [2, 3, 4, 5, 6, 7] },
        { index: 2, label: 'C', values: [4, 5, 6, 7, 8, 9] }
      ]
    });
    expect(nemenyi.ok).toBe(true);
    expect(nemenyi.postHoc).toBe('nemenyi');
    expect(nemenyi.pairs).toHaveLength(3);
    expect(nemenyi.pairs.every(pair => pair.method === 'nemenyi' && Number.isFinite(pair.adjP))).toBe(true);
  });

  test('simultaneous post-hoc intervals and structured p-values use the inferential alpha that produced them', () => {
    const comparisonInference = {
      criterion: 'alpha',
      level: 0.01,
      method: 'tamhane-t2',
      errorControl: 'fwer',
      valueKind: 'adjusted-p'
    };
    const result = model.computeBoxStatsModel({
      mode: 'single',
      statsTest: 'parametric',
      statsMode: 'all',
      statsPaired: false,
      statsPostHoc: 'tamhaneT2',
      statsParametricVariant: 'welch',
      statsCorrection: 'holm',
      statsAlpha: 0.01,
      statsCiLevel: 0.95,
      statsEffectParametric: 'cohenD',
      statsEffectNonParametric: 'rankBiserial',
      inferenceSnapshot: {
        overall: { criterion: 'alpha', level: 0.01, method: 'none', valueKind: 'raw-p' },
        comparisons: comparisonInference
      },
      selection: [
        { index: 0, label: 'A', values: [1, 2, 2, 3, 4, 5] },
        { index: 1, label: 'B', values: [5, 7, 9, 12, 18, 24] },
        { index: 2, label: 'C', values: [10, 15, 22, 30, 42, 55] }
      ]
    });

    expect(result.ok).toBe(true);
    const comparisons = result.tables.find(table => table.caption === 'Pairwise comparisons');
    expect(comparisons).toBeTruthy();
    expect(comparisons.columns.find(column => column.key === 'ci')?.label).toBe('99% simultaneous CI');
    expect(comparisons.columns.find(column => column.key === 'padj')?.inference).toEqual(comparisonInference);
    expect(comparisons.rows[0].padj).toEqual(expect.objectContaining({
      type: 'pValue',
      value: expect.any(Number)
    }));
  });

  test('grouped comparison confidence level remains an explicit reporting setting when not mathematically tied to family-wise alpha', () => {
    const grouped = model.analyzeGroupedMultipleComparisons({
      groupsCount: 2,
      conditionsCount: 1,
      groupLabels: ['A', 'B'],
      conditionLabels: ['T1'],
      observedCellData: [
        [[1, 2, 3, 4]],
        [[4, 5, 6, 7]]
      ]
    }, {
      comparisonScope: 'groupsWithinCondition',
      correction: 'holm',
      ciLevel: 0.90
    });

    expect(grouped.ok).toBe(true);
    expect(grouped.columns.find(column => column.key === 'ciText')?.label).toBe('90% CI');
    expect(grouped.effectiveComparisonMethod).toBe('none');
    expect(grouped.columns.find(column => column.key === 'pText')?.inferenceRole).toBe('comparison');
    expect(grouped.columns.some(column => column.key === 'adjPText')).toBe(false);
    expect(grouped.rows[0].pText).toEqual(expect.objectContaining({ type: 'pValue', value: expect.any(Number) }));
    expect(grouped.rows[0].adjPText).toBeUndefined();
    expect(grouped.footnotes.join(' ')).not.toMatch(/holm|correction applied across 1 test/i);
  });


  test('grouped omnibus and multiplicity tables attach inference only to explicitly typed decision columns', () => {
    const rows = Array.from({ length: 5 }, (_, row) => [
      [1 + row, 2 + row],
      [5 + row, 7 + row]
    ]);
    const groupedData = {
      ok: true,
      groupsCount: 2,
      conditionsCount: 2,
      rowsWithData: rows.length,
      observedRowsWithData: rows.length,
      partialRowsSkipped: 0,
      groupLabels: ['A', 'B'],
      conditionLabels: ['T1', 'T2'],
      rows,
      allRows: rows,
      cellData: [
        [rows.map(row => row[0][0]), rows.map(row => row[0][1])],
        [rows.map(row => row[1][0]), rows.map(row => row[1][1])]
      ],
      observedCellData: [
        [rows.map(row => row[0][0]), rows.map(row => row[0][1])],
        [rows.map(row => row[1][0]), rows.map(row => row[1][1])]
      ]
    };
    const overallInference = {
      criterion: 'alpha',
      level: 0.05,
      method: 'none',
      errorControl: 'unadjusted',
      valueKind: 'raw-p'
    };
    const comparisonInference = {
      criterion: 'alpha',
      level: 0.05,
      method: 'holm',
      errorControl: 'fwer',
      valueKind: 'adjusted-p'
    };

    const omnibus = model.computeBoxStatsModel({
      mode: 'grouped',
      grouped: { analysis: 'twoWayAnova', data: groupedData },
      statsCorrection: 'holm',
      statsAlpha: 0.05,
      statsCiLevel: 0.95,
      inferenceSnapshot: { overall: overallInference }
    });
    expect(omnibus.ok).toBe(true);
    const omnibusP = omnibus.tables[0].columns.find(column => column.key === 'p');
    expect(omnibusP.inferenceRole).toBe('overall');
    expect(omnibusP.inference).toEqual(overallInference);

    const comparisons = model.computeBoxStatsModel({
      mode: 'grouped',
      grouped: {
        analysis: 'rowTTests',
        comparisonScope: 'groupsWithinCondition',
        multiplicityFamily: 'within-scope',
        data: groupedData
      },
      statsCorrection: 'holm',
      statsAlpha: 0.05,
      statsCiLevel: 0.95,
      inferenceSnapshot: { comparisons: comparisonInference }
    });
    expect(comparisons.ok).toBe(true);
    const rawP = comparisons.tables[0].columns.find(column => column.key === 'p');
    const adjustedP = comparisons.tables[0].columns.find(column => column.key === 'padjust');
    expect(rawP.inferenceRole).toBe('raw');
    expect(rawP.inference).toBeUndefined();
    expect(adjustedP.inferenceRole).toBe('comparison');
    expect(adjustedP.inference).toEqual(comparisonInference);
  });

});
