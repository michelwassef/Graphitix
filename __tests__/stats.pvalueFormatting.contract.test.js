describe('Shared p-value formatting contract', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    global.Shared = window.Shared;
    require('../js/shared/chartStyle.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
  });

  afterEach(() => {
    delete global.Shared;
    delete window.Shared;
  });

  const renderPValueTable = values => {
    const target = document.createElement('div');
    target.id = 'scatterStatsResults';
    document.body.appendChild(target);
    const rendered = window.Shared.statsTable.render({
      target,
      caption: 'Coefficient estimates',
      columns: [
        { key: 'term', label: 'Term' },
        { key: 'p', label: 'p-value' }
      ],
      rows: values.map(entry => ({ term: entry.term, p: entry.value })),
      options: { fileName: 'p-value-contract', contextLabel: 'p-value-contract' }
    });
    return { target, rendered };
  };

  const pCells = target => Array.from(target.querySelectorAll('tbody td:nth-child(2)'));

  test('calculated values retain equality as their source operator when display-thresholded', () => {
    const formatted = window.Shared.formatPValue(0, { scientific: false });
    const scientific = window.Shared.formatPValue(0, { scientific: true });

    expect(String(formatted)).toBe('<0.0001');
    expect(formatted.__statsPValueRaw).toBe(0);
    expect(formatted.__statsPValueOperator).toBe('=');
    expect(formatted.__statsPValueDisplayOperator).toBe('<');
    expect(formatted.__statsPValueThresholded).toBe(true);
    expect(String(scientific)).toBe('<1 × 10⁻⁴');
    expect(scientific.__statsPValueOperator).toBe('=');
    expect(scientific.__statsPValueDisplayOperator).toBe('<');
    expect(scientific.__statsPValueThresholded).toBe(true);
  });

  test('table render and repeated enhancement never turn underflow into an impossible bound', () => {
    const { target, rendered } = renderPValueTable([
      { term: 'Underflowed slope', value: window.Shared.formatPValue(0, { scientific: false }) },
      { term: 'Tiny intercept', value: window.Shared.formatPValue(1.87499e-62, { scientific: false }) }
    ]);

    expect(rendered.model.cellMetaRows.map(row => row[1].pValueOperator)).toEqual(['=', '=']);
    expect(pCells(target).map(cell => cell.textContent)).toEqual(['< 0.0001', '< 0.0001']);

    window.Shared.statsReporting.enhancePanelNow(target, 'first-pass');
    window.Shared.statsReporting.enhancePanelNow(target, 'second-pass');

    expect(pCells(target).map(cell => cell.childNodes[0]?.textContent)).toEqual(['<0.0001', '<0.0001']);
    expect(pCells(target).every(cell => cell.querySelector('.stats-significance-badge')?.textContent === '****')).toBe(true);
    expect(target.textContent).not.toContain('<0****');
  });

  test('decimal-scientific-decimal switching is lossless for zero and tiny calculated values', () => {
    const { target, rendered } = renderPValueTable([
      { term: 'Underflowed slope', value: window.Shared.formatPValue(0, { scientific: false }) },
      { term: 'Tiny intercept', value: window.Shared.formatPValue(1.87499e-62, { scientific: false }) }
    ]);

    window.Shared.statsReporting.setPanelPValueFormatScientific(target, true);
    window.Shared.statsTable.refreshPValueFormatting(target);
    expect(pCells(target).map(cell => cell.textContent)).toEqual([
      '< 1 × 10⁻⁴',
      '1.87499 × 10⁻⁶²'
    ]);
    expect(rendered.model.rows.map(row => row[1])).toEqual([
      '< 1 × 10⁻⁴',
      '1.87499 × 10⁻⁶²'
    ]);

    window.Shared.statsReporting.setPanelPValueFormatScientific(target, false);
    window.Shared.statsTable.refreshPValueFormatting(target);
    expect(pCells(target).map(cell => cell.textContent)).toEqual(['< 0.0001', '< 0.0001']);
    expect(target.textContent).not.toContain('<0<');
  });

  test('serialized report DOM retains source semantics without its live table model', () => {
    const { target } = renderPValueTable([
      { term: 'Underflowed slope', value: window.Shared.formatPValue(0, { scientific: false }) },
      { term: 'Tiny intercept', value: window.Shared.formatPValue(1.87499e-62, { scientific: false }) }
    ]);
    const serialized = target.innerHTML;
    target.remove();

    const restored = document.createElement('div');
    restored.id = 'scatterStatsResults';
    restored.innerHTML = serialized;
    document.body.appendChild(restored);
    expect(restored.querySelector('.stats-table-card').__statsTableModel).toBeUndefined();

    window.Shared.statsReporting.setPanelPValueFormatScientific(restored, true);
    window.Shared.statsReporting.enhancePanelNow(restored, 'serialized-scientific');
    expect(pCells(restored).map(cell => cell.childNodes[0]?.textContent)).toEqual([
      '<1 × 10⁻⁴',
      '1.87499 × 10⁻⁶²'
    ]);

    window.Shared.statsReporting.setPanelPValueFormatScientific(restored, false);
    window.Shared.statsReporting.enhancePanelNow(restored, 'serialized-decimal');
    expect(pCells(restored).map(cell => cell.childNodes[0]?.textContent)).toEqual(['<0.0001', '<0.0001']);
  });

  test('explicit probability bounds remain bounds instead of becoming display thresholds', () => {
    const { target } = renderPValueTable([
      { term: 'Lower bound', value: { type: 'pValue', value: 1e-6, operator: '>' } },
      { term: 'Upper bound', value: { type: 'pValue', value: 1.23e-6, operator: '≤' } }
    ]);

    expect(pCells(target).map(cell => cell.textContent)).toEqual(['> 0.000001', '≤ 0.00000123']);

    window.Shared.statsReporting.setPanelPValueFormatScientific(target, true);
    window.Shared.statsTable.refreshPValueFormatting(target);
    expect(pCells(target).map(cell => cell.textContent)).toEqual(['> 1 × 10⁻⁶', '≤ 1.23 × 10⁻⁶']);
  });
});
