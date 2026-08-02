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

function loadRegistry(){
  jest.resetModules();
  delete window.Shared;
  require('../js/shared/exampleDatasets.js');
  return window.Shared.exampleDatasets;
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

  test('keeps the examples rich and preserves paired or repeated biomedical designs', () => {
    expect(registry.get('box', 'single').data).toHaveLength(11); // 6 groups × 10 animals
    expect(registry.get('scatter', 'scatter').data).toHaveLength(121); // 120 tumors
    expect(registry.get('scatter', 'volcano').data).toHaveLength(31); // all 30 WDBC features
    expect(registry.get('pca', 'grouped').data[0]).toHaveLength(7); // six condition means
    expect(registry.get('scatter', 'scatter3d').data[0]).toEqual(['Sample', 'PSD95_N', 'SYP_N', 'CaNA_N', '']);
    expect(registry.get('line', 'standard').data).toHaveLength(12); // 11 time points
    expect(registry.get('heatmap').data).toHaveLength(31); // all 30 features
    expect(registry.get('surface').data).toHaveLength(226); // header + 15 × 15 grid
    expect(registry.get('survival').data).toHaveLength(23);
    expect(registry.get('hist').data).toHaveLength(73); // header + largest outcome group
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

  test('uses six mouse-protein conditions for PCA and three measured dimensions for Scatter 3D', () => {
    const pca = registry.get('pca', 'grouped').data;
    const groups = new Set(pca[1].slice(1));
    expect(groups.size).toBe(6);
    expect(pca[0].slice(1)).toEqual([true, false, false, false, false, true]);
    expect(pca[1].slice(1)).toEqual([
      'Control CS saline', 'Control CS memantine', 'Control SC saline',
      'Trisomic CS saline', 'Trisomic CS memantine', 'Trisomic SC saline'
    ]);
    expect(pca.slice(3).map(row => row[0])).toEqual(['P70S6_N', 'pGSK3B_N', 'CDK5_N', 'Tau_N', 'GFAP_N', 'GluR3_N']);

    const scatter = registry.get('scatter', 'scatter3d').data;
    expect(scatter.slice(1).every(row => row.slice(1, 4).every(Number.isFinite))).toBe(true);
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
