describe('Shared statistical inference contract', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    global.Shared = window.Shared;
    require('../js/shared/stats.js');
    require('../js/shared/statsInference.js');
    require('../js/shared/stats-table.js');
  });

  afterEach(() => {
    delete global.Shared;
    delete window.Shared;
  });

  test('FWER and FDR procedures retain distinct decision semantics', () => {
    const inference = window.Shared.statsInference;
    expect(inference.getMethodSemantics('holm')).toMatchObject({ criterion: 'alpha', errorControl: 'fwer' });
    expect(inference.getMethodSemantics('tukey')).toMatchObject({ criterion: 'alpha', errorControl: 'fwer' });
    expect(inference.getMethodSemantics('bh')).toMatchObject({ criterion: 'fdr', errorControl: 'fdr' });
    expect(inference.getMethodSemantics('benjamini-yekutieli')).toMatchObject({ method: 'by', criterion: 'fdr' });
  });

  test('alpha and target FDR are separate levels and equality meets the selected criterion', () => {
    const inference = window.Shared.statsInference;
    const alphaSpec = inference.createDecisionSpec({ method: 'holm', level: 0.01, valueKind: 'adjusted-p' });
    const fdrSpec = inference.createDecisionSpec({ method: 'bh', level: 0.1, valueKind: 'adjusted-p' });
    expect(inference.classifyPValue(0.01, alphaSpec)).toMatchObject({ meetsCriterion: true, token: '*', criterion: 'alpha' });
    expect(inference.classifyPValue(0.011, alphaSpec)).toMatchObject({ meetsCriterion: false, token: 'NS' });
    expect(inference.classifyPValue(0.1, fdrSpec)).toMatchObject({ meetsCriterion: true, token: 'Discovery', criterion: 'fdr' });
    expect(inference.classifyPValue(0.101, fdrSpec)).toMatchObject({ meetsCriterion: false, token: 'No discovery' });
  });

  test('pre-analysis controls show alpha plus target FDR only when the selected analysis requires both', () => {
    const inference = window.Shared.statsInference;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const config = { method: 'bh', includeOverall: true, includeComparisons: true, source: 'unit-controls' };
    const controller = inference.mountControls(host, config);
    expect(host.querySelector('[data-stats-inference-key="alpha"]')).toBeTruthy();
    expect(host.querySelector('[data-stats-inference-key="targetFdr"]')).toBeTruthy();
    expect(host.textContent).toMatch(/Overall-test significance level/);
    expect(host.textContent).toMatch(/Pairwise target FDR/);

    controller.destroy();
    const descriptive = document.createElement('div');
    document.body.appendChild(descriptive);
    inference.mountControls(descriptive, { includeOverall: false, includeComparisons: false, source: 'unit-none' });
    expect(descriptive.hidden).toBe(true);
    expect(descriptive.querySelector('input')).toBeNull();
  });


  test('FDR-only analyses use a generic Target FDR label rather than implying a separate overall test', () => {
    const inference = window.Shared.statsInference;
    const host = document.createElement('div');
    document.body.appendChild(host);
    inference.mountControls(host, {
      method: 'bh',
      includeOverall: false,
      includeComparisons: true,
      source: 'unit-fdr-only'
    });
    expect(host.textContent).toMatch(/Target FDR/);
    expect(host.textContent).not.toMatch(/Pairwise target FDR/);
    expect(host.querySelector('[data-stats-inference-key="alpha"]')).toBeNull();
    expect(host.querySelector('[data-stats-inference-key="targetFdr"]')).toBeTruthy();
  });

  test('stats tables render decisions only from explicit structured inference metadata and preserve it in the DOM', () => {
    const inference = window.Shared.statsInference;
    const target = document.createElement('div');
    target.id = 'statsResults';
    document.body.appendChild(target);
    const spec = inference.createDecisionSpec({
      method: 'holm',
      level: 0.01,
      valueKind: 'adjusted-p'
    });

    window.Shared.statsTable.render({
      target,
      caption: 'Pairwise comparisons',
      section: 'comparisons',
      columns: [
        { key: 'comparison', label: 'Comparison', align: 'left' },
        { key: 'padj', label: 'Holm-adjusted p', align: 'right' }
      ],
      rows: [{
        comparison: 'A vs B',
        padj: { type: 'pValue', value: 0.008, __statsInference: spec }
      }],
      options: { fileName: 'inference-contract' }
    });
    window.Shared.statsReporting.enhancePanelNow(target, 'inference-contract-test');

    const pCell = target.querySelector('td[data-stats-pvalue-raw]');
    expect(pCell).toBeTruthy();
    expect(pCell.dataset.statsInferenceCriterion).toBe('alpha');
    expect(pCell.dataset.statsInferenceLevel).toBe('0.01');
    expect(pCell.dataset.statsInferenceMethod).toBe('holm');
    expect(pCell.dataset.statsInferenceValueKind).toBe('adjusted-p');
    expect(pCell.querySelector('.stats-significance-badge')?.textContent).toBe('*');

    const untyped = document.createElement('div');
    document.body.appendChild(untyped);
    window.Shared.statsTable.render({
      target: untyped,
      columns: [{ key: 'p', label: 'p-value', align: 'right' }],
      rows: [{ p: 0.00001 }]
    });
    window.Shared.statsReporting.enhancePanelNow(untyped, 'inference-contract-untyped');
    expect(untyped.querySelector('.stats-significance-badge')).toBeNull();
  });


  test('generic stats-panel capture and restore preserves inference metadata for reopen parity', () => {
    const source = document.createElement('div');
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.textContent = '0.008';
    cell.dataset.statsPvalueRaw = '0.008';
    cell.dataset.statsPvalueOperator = '=';
    cell.dataset.statsInferenceCriterion = 'alpha';
    cell.dataset.statsInferenceLevel = '0.01';
    cell.dataset.statsInferenceMethod = 'holm';
    cell.dataset.statsInferenceErrorControl = 'fwer';
    cell.dataset.statsInferenceValueKind = 'adjusted-p';
    cell.dataset.statsInferenceDecisionLabel = 'Significant';
    cell.dataset.statsInferenceNegativeDecisionLabel = 'Not significant';
    row.appendChild(cell);
    tbody.appendChild(row);
    table.appendChild(tbody);
    source.appendChild(table);
    document.body.appendChild(source);

    const saved = window.Shared.statsReporting.capturePanelModel(source);
    const restored = document.createElement('div');
    document.body.appendChild(restored);
    const result = window.Shared.statsReporting.restorePanelModel(restored, saved);

    expect(result.restoredMain).toBe(true);
    const restoredCell = restored.querySelector('td[data-stats-pvalue-raw]');
    expect(restoredCell).toBeTruthy();
    expect(restoredCell.dataset.statsInferenceCriterion).toBe('alpha');
    expect(restoredCell.dataset.statsInferenceLevel).toBe('0.01');
    expect(restoredCell.dataset.statsInferenceMethod).toBe('holm');
    expect(restoredCell.dataset.statsInferenceErrorControl).toBe('fwer');
    expect(restoredCell.dataset.statsInferenceValueKind).toBe('adjusted-p');
    expect(restoredCell.querySelector('.stats-significance-badge')?.textContent).toBe('*');
  });


  test('inference decisions use one-or-none tokens rather than a threshold-derived star ladder', () => {
    const inference = window.Shared.statsInference;
    const spec = inference.createDecisionSpec({ method: 'holm', level: 0.05, valueKind: 'adjusted-p' });
    expect(inference.classifyPValue(0.049, spec).token).toBe('*');
    expect(inference.classifyPValue(0.0049, spec).token).toBe('*');
    expect(inference.classifyPValue(0.000049, spec).token).toBe('*');
    expect(inference.classifyPValue(0.051, spec).token).toBe('NS');
  });

  test('invalid probabilities never receive an inferential decision', () => {
    const inference = window.Shared.statsInference;
    const alphaSpec = inference.createDecisionSpec({ method: 'holm', level: 0.05, valueKind: 'adjusted-p' });
    const fdrSpec = inference.createDecisionSpec({ method: 'bh', level: 0.05, valueKind: 'adjusted-p' });
    [-0.001, 1.001, Number.NaN, Number.POSITIVE_INFINITY].forEach(value => {
      expect(inference.classifyPValue(value, alphaSpec)).toMatchObject({ valid: false, meetsCriterion: false, token: '', label: '' });
      expect(inference.classifyPValue(value, fdrSpec)).toMatchObject({ valid: false, meetsCriterion: false, token: '', label: '' });
    });
  });

});
