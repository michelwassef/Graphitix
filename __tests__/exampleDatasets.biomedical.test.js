const fs = require('fs');
const path = require('path');

const COMPONENT_MODES = Object.freeze({
  box: ['single', 'grouped'],
  scatter: ['scatter', 'scatter3d', 'scatterBubble', 'grouped', 'groupedXY', 'volcano', 'ma'],
  pca: ['standard', 'grouped'],
  line: ['standard', 'groupedDoseResponse', 'threeD'],
  heatmap: ['default'],
  surface: ['default'],
  roc: ['default'],
  survival: ['default'],
  hist: ['default'],
  pie: ['default'],
  venn: ['default']
});

const REFRESHED_SHOWCASE_RECORDS = Object.freeze([
  ['scatter', 'scatter'],
  ['scatter', 'scatterBubble'],
  ['pca', 'standard'],
  ['pca', 'grouped'],
  ['line', 'standard'],
  ['hist', 'default'],
  ['pie', 'default'],
  ['surface', 'default']
]);

const STRICT_NOTES_PATTERN = /^Example dataset: [^\n]+\n\nWhat is loaded: [^\n]+\n\nReference: [^\n]+\nPublished figure\/panel: [^\n]+$/;

function loadRegistry(){
  jest.resetModules();
  delete window.Shared;
  require('../js/shared/exampleDatasets.js');
  return window.Shared.exampleDatasets;
}

function pearsonCorrelation(rows, xIndex, yIndex){
  const values = rows
    .map(row => [Number(row[xIndex]), Number(row[yIndex])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = values.length;
  const meanX = values.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = values.reduce((sum, [, y]) => sum + y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  values.forEach(([x, y]) => {
    const dx = x - meanX;
    const dy = y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  });
  return covariance / Math.sqrt(varianceX * varianceY);
}

function populationMoments(values){
  const finite = values.map(Number).filter(Number.isFinite);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / finite.length;
  return { mean, standardDeviation: Math.sqrt(variance) };
}

function contingencyChiSquare(rows){
  const rowTotals = rows.map(row => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = rows[0].map((_, index) => rows.reduce((sum, row) => sum + row[index], 0));
  const total = columnTotals.reduce((sum, value) => sum + value, 0);
  return rows.reduce((statistic, row, rowIndex) => (
    statistic + row.reduce((rowStatistic, observed, columnIndex) => {
      const expected = rowTotals[rowIndex] * columnTotals[columnIndex] / total;
      return rowStatistic + ((observed - expected) ** 2 / expected);
    }, 0)
  ), 0);
}

describe('Shared.exampleDatasets biomedical registry', () => {
  let registry;

  beforeEach(() => {
    registry = loadRegistry();
  });

  afterEach(() => {
    delete window.Shared;
  });

  test('covers every component and every supported example mode', () => {
    Object.entries(COMPONENT_MODES).forEach(([component, modes]) => {
      expect(registry.list(component)).toEqual(modes);
      modes.forEach(mode => expect(registry.has(component, mode)).toBe(true));
    });
  });

  test('returns independent clones so same-component tabs cannot share mutable example state', () => {
    const first = registry.get('roc');
    const second = registry.get('roc');

    expect(first).not.toBe(second);
    expect(first.data).not.toBe(second.data);
    expect(first.data[1]).not.toBe(second.data[1]);

    first.data[1][1] = 999;
    first.notes = 'mutated';

    expect(second.data[1][1]).not.toBe(999);
    expect(second.notes).not.toBe('mutated');
    expect(registry.get('roc').data[1][1]).not.toBe(999);
  });

  test('provides a paper reference and published figure or panel for every record', () => {
    Object.entries(COMPONENT_MODES).forEach(([component, modes]) => {
      modes.forEach(mode => {
        const record = registry.get(component, mode);
        expect(record).toBeTruthy();
        expect(record.notes).toMatch(/^Example dataset: /);
        expect(record.notes).toMatch(/Reference: .+/);
        expect(record.notes).toMatch(/Published figure\/panel: .+/);
      });
    });
  });

  test('keeps the examples rich and preserves paired or repeated designs', () => {
    expect(registry.get('box', 'single').data).toHaveLength(11); // 6 groups × 10 animals
    expect(registry.get('scatter', 'scatter').data).toHaveLength(570); // header + all 569 tumors
    expect(registry.get('scatter', 'volcano').data).toHaveLength(31); // all 30 WDBC features
    expect(registry.get('pca', 'standard').data).toHaveLength(13); // two headers + 11 time points
    expect(registry.get('pca', 'standard').data[0]).toHaveLength(7); // label column + 6 subjects
    expect(registry.get('pca', 'grouped').data).toHaveLength(14); // three headers + 11 proteins
    expect(registry.get('pca', 'grouped').data[0]).toHaveLength(541); // label column + 540 measurements
    expect(registry.get('scatter', 'scatter3d').data[0]).toEqual(['Sample', 'PSD95_N', 'SYP_N', 'CaNA_N', '']);
    expect(registry.get('line', 'standard').data).toHaveLength(11); // header + days 0–9
    expect(registry.get('line', 'groupedDoseResponse').data).toHaveLength(12); // existing Indomethacin design
    expect(registry.get('heatmap').data).toHaveLength(31); // all 30 features
    expect(registry.get('surface').data).toHaveLength(442); // header + 21 × 21 grid
    expect(registry.get('survival').data).toHaveLength(23);
    expect(registry.get('hist').data).toHaveLength(498); // header + largest outcome group
  });

  test('uses compact Box example labels without losing supplement and dose identity', () => {
    const labels = registry.get('box', 'single').data[0];
    expect(labels).toEqual([
      'VC 0.5 mg', 'VC 1.0 mg', 'VC 2.0 mg',
      'OJ 0.5 mg', 'OJ 1.0 mg', 'OJ 2.0 mg'
    ]);
    expect(Math.max(...labels.map(label => label.length))).toBeLessThanOrEqual(9);
  });

  test('loads three paired ROC predictors for all 113 aSAH patients', () => {
    const data = registry.get('roc').data;
    const labels = data.slice(1).map(row => row[0]);

    expect(data).toHaveLength(114);
    expect(data[0]).toEqual(['Label', 'WFNS grade', 'S100B (µg/L)', 'NDKA (µg/L)']);
    expect(new Set(labels)).toEqual(new Set([0, 1]));
    expect(labels.filter(value => value === 0)).toHaveLength(72);
    expect(labels.filter(value => value === 1)).toHaveLength(41);
    data.slice(1).forEach(row => expect(row).toHaveLength(4));
    expect(registry.get('roc').notes).toContain('paired ROC comparison');
  });

  test('preserves non-zero scientific-notation p-values for WDBC volcano and MA examples', () => {
    [['volcano', 2], ['ma', 3]].forEach(([mode, pIndex]) => {
      const rows = registry.get('scatter', mode).data.slice(1);
      rows.forEach(row => {
        expect(Number.isFinite(row[pIndex])).toBe(true);
        expect(row[pIndex]).toBeGreaterThan(0);
        expect(row[pIndex]).toBeLessThanOrEqual(1);
      });
    });
  });

  test('uses all WDBC tumors and a visibly strong measured-feature relationship for Scatter', () => {
    const data = registry.get('scatter', 'scatter').data;
    const rows = data.slice(1);
    expect(data[0]).toEqual(['Sample', 'Mean radius', 'Mean perimeter', '', '']);
    expect(rows).toHaveLength(569);
    expect(pearsonCorrelation(rows, 1, 2)).toBeGreaterThan(0.995);

    const bubble = registry.get('scatter', 'scatterBubble').data;
    expect(bubble[0]).toEqual(['Sample', 'Mean radius', 'Mean perimeter', 'Worst area', '']);
    expect(bubble.slice(1)).toHaveLength(569);
    expect(bubble.slice(1).every(row => Number.isFinite(row[3]) && row[3] > 0)).toBe(true);
  });

  test('keeps the standard PCA example in raw concentration units so standardization remains user-controlled', () => {
    const pcaRecord = registry.get('pca', 'standard');
    const lineRecord = registry.get('line', 'groupedDoseResponse');
    const pcaRows = pcaRecord.data.slice(2);
    const sourceRows = lineRecord.data.slice(1);

    expect(pcaRows).toHaveLength(sourceRows.length);
    pcaRows.forEach((row, index) => {
      expect(row[0]).toBe(`${sourceRows[index][0]} h`);
      expect(row.slice(1)).toEqual(sourceRows[index].slice(1));
    });
    expect(pcaRecord.notes).toMatch(/Raw plasma concentrations/i);
    expect(pcaRecord.notes).toMatch(/Standardize variables/i);
    expect(pcaRecord.meta.pcVariancePercent).toEqual([73.43, 17.14, 8.34]);

    const firstFeature = pcaRows[0].slice(1);
    const moments = populationMoments(firstFeature);
    expect(Math.abs(moments.mean)).toBeGreaterThan(0.1);
    expect(Math.abs(moments.standardDeviation - 1)).toBeGreaterThan(0.1);
  });

  test('uses a balanced, standardized four-class mouse-protein PCA design', () => {
    const record = registry.get('pca', 'grouped');
    const data = record.data;
    const groups = data[1].slice(1);
    const counts = groups.reduce((accumulator, group) => {
      accumulator[group] = (accumulator[group] || 0) + 1;
      return accumulator;
    }, {});

    expect(record.meta).toEqual({
      replicatesPerGroup: 135,
      groupCount: 4,
      preferredTableFormat: 'grouped'
    });
    expect(new Set(groups)).toEqual(new Set([
      'CFC · memantine',
      'CFC · saline',
      'No CFC · memantine',
      'No CFC · saline'
    ]));
    expect(Object.values(counts)).toEqual([135, 135, 135, 135]);
    expect(data[0].slice(1).every(value => value === false)).toBe(true);
    expect(data.slice(3).map(row => row[0])).toEqual([
      'SOD1_N', 'Ubiquitin_N', 'pGSK3B_N', 'S6_N', 'CaNA_N', 'IL1B_N',
      'BAX_N', 'pNR2A_N', 'BDNF_N', 'pJNK_N', 'pCFOS_N'
    ]);
    data.slice(3).forEach(row => {
      const values = row.slice(1);
      expect(values.every(Number.isFinite)).toBe(true);
      const moments = populationMoments(values);
      expect(Math.abs(moments.mean)).toBeLessThan(1e-5);
      expect(moments.standardDeviation).toBeCloseTo(1, 5);
    });
  });

  test('uses a distinct six-subject pharmacokinetic design for Standard PCA', () => {
    const record = registry.get('pca', 'standard');
    const data = record.data;
    const labels = data[1].slice(1);
    expect(record.meta).toEqual({
      preferredTableFormat: 'standard',
      sampleCount: 6,
      featureCount: 11,
      pcVariancePercent: [73.43, 17.14, 8.34]
    });
    expect(labels).toEqual(['Subject 1', 'Subject 4', 'Subject 5', 'Subject 2', 'Subject 3', 'Subject 6']);
    expect(data[0].slice(1)).toEqual([false, false, false, false, false, false]);
    expect(data.slice(2)).toHaveLength(11);
    data.slice(2).forEach(row => {
      expect(row.slice(1).every(Number.isFinite)).toBe(true);
    });
    const rawMoments = data.slice(2).map(row => populationMoments(row.slice(1)));
    expect(rawMoments.some(moments => Math.abs(moments.mean) > 0.1)).toBe(true);
    expect(rawMoments.some(moments => Math.abs(moments.standardDeviation - 1) > 0.1)).toBe(true);
    expect(data).not.toEqual(registry.get('pca', 'grouped').data);
    expect(record.meta.pcVariancePercent.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(96);
  });

  test('uses visually informative line, histogram, pie, and surface showcase data', () => {
    const line = registry.get('line', 'standard').data;
    expect(line[0]).toEqual([
      'Study day',
      'Mean reaction time',
      'Median reaction time',
      '25th percentile',
      '75th percentile'
    ]);
    expect(line.slice(1).map(row => row[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(line.at(-1)[1]).toBeGreaterThan(line[1][1]);

    const histogram = registry.get('hist').data;
    expect(histogram[0]).toEqual(['No diabetes within 5 years', 'Diabetes within 5 years']);
    const histogramCounts = histogram[0].map((_, index) => (
      histogram.slice(1).filter(row => Number.isFinite(row[index])).length
    ));
    expect(histogramCounts).toEqual([497, 266]);
    histogram.slice(1).flat().filter(Number.isFinite).forEach(value => {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(199);
    });

    expect(registry.get('pie').data).toEqual([
      ['PAM50 subtype', 'African American (159)', 'White (711)'],
      ['Luminal A', 27, 247],
      ['Luminal B', 35, 178],
      ['HER2-enriched', 24, 84],
      ['Basal-like', 62, 132],
      ['Normal-like', 11, 70]
    ]);
    expect(registry.get('pie').meta).toEqual({ preferredStatsScope: 'all' });
    expect(contingencyChiSquare(registry.get('pie').data.slice(1).map(row => row.slice(1)))).toBeCloseTo(40.1367, 4);

    const surface = registry.get('surface').data.slice(1);
    expect(new Set(surface.map(row => row[0])).size).toBe(21);
    expect(new Set(surface.map(row => row[1])).size).toBe(21);
    const zValues = surface.map(row => row[2]);
    expect(Math.max(...zValues) - Math.min(...zValues)).toBeGreaterThan(14);
  });

  test('keeps each refreshed Notes block in the exact four-section format', () => {
    REFRESHED_SHOWCASE_RECORDS.forEach(([component, mode]) => {
      expect(registry.get(component, mode).notes).toMatch(STRICT_NOTES_PATTERN);
    });
  });

  test('formats biomedical example Notes with real line breaks', () => {
    ['standard', 'grouped'].forEach(mode => {
      const notes = registry.get('pca', mode).notes;
      expect(notes).toContain('\n\n');
      expect(notes).not.toContain('\\n');
    });
    const scatterNotes = registry.get('scatter', 'scatter3d').notes;
    expect(scatterNotes).toContain('\n\n');
    expect(scatterNotes).not.toContain('\\n');
  });

  test('applies notes through the owner-scoped Notes control contract', () => {
    const calls = [];
    const notesState = {
      text: '',
      open: false,
      control: {
        setValue(value){ calls.push(['value', value]); },
        setOpen(value){ calls.push(['open', value]); }
      }
    };
    const record = registry.get('box', 'grouped');

    expect(registry.applyNotesState(notesState, record)).toBe(true);
    expect(notesState.text).toBe(record.notes);
    expect(notesState.open).toBe(true);
    expect(calls).toEqual([
      ['value', record.notes],
      ['open', true]
    ]);
  });

  test('all component loaders consume the shared registry instead of private example literals', () => {
    Object.keys(COMPONENT_MODES).forEach(component => {
      const source = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'components', `${component}.js`),
        'utf8'
      );
      expect(source).toContain('Shared.exampleDatasets');
    });
  });
});
