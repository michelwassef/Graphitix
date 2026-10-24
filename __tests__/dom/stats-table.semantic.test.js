describe('semantic statistics tables', () => {
  let mountConfig;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="target"></div>';
    global.Shared = {
      exporter: {
        mountSvgStringControls: config => { mountConfig = config; }
      }
    };
    window.Shared = global.Shared;
    require('../../js/shared/stats-table.js');
  });

  afterEach(() => {
    delete global.Shared;
    delete window.Shared;
  });

  test('uses scoped headers and offers JSON alongside CSV and Excel data', () => {
    const result = window.Shared.statsTable.render({
      target:document.getElementById('target'),
      model:{
        caption:'Analysis results',
        columns:[{ key:'statistic', label:'Statistic' }, { key:'value', label:'Value' }],
        rows:[['Analysis', 'Descriptive result']],
        footnotes:[],
        options:{ fileName:'statistics-report', contextLabel:'statistics-report' }
      }
    });

    expect(result.table.querySelectorAll('thead th[scope="col"]')).toHaveLength(2);
    expect(result.table.querySelector('tbody th[scope="row"]')?.textContent).toBe('Analysis');
    const viewport = result.table.parentElement;
    expect(viewport.className).toBe('stats-table-viewport');
    expect(viewport.getAttribute('aria-label')).toBe('Analysis results table');
    expect(viewport.tabIndex).toBe(0);
    expect(viewport.contains(result.table.closest('.stats-table-card').querySelector('.stats-table-actions'))).toBe(false);
    const dataActions = mountConfig.extraActions.find(action => action.key === 'download');
    expect(dataActions.formats.map(format => format.key)).toEqual(['csv', 'excel', 'json']);
  });

  test('does not render invalid structured p-values as ordinary table text', () => {
    const result = window.Shared.statsTable.render({
      target: document.getElementById('target'),
      columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }],
      rows: [['p-value', { type: 'pValue', value: 1.2, fallback: 'p = 1.2' }]],
      footnotes: []
    });

    expect(result.table.querySelector('tbody td')?.textContent).toBe('unavailable (invalid probability)');
  });

  test('upgrades serialized older cards without duplicating scroll regions or changing export data', () => {
    const target = document.getElementById('target');
    const result = window.Shared.statsTable.render({
      target,
      caption: 'Saved results',
      columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }],
      rows: [['Sample count', 12]],
      footnotes: []
    });
    const viewport = result.table.parentElement;
    viewport.replaceWith(result.table);
    const savedMarkup = target.innerHTML;
    target.innerHTML = savedMarkup;
    expect(window.Shared.statsTable.rehydrateExportControls(target)).toBe(1);
    expect(window.Shared.statsTable.rehydrateExportControls(target)).toBe(1);
    expect(target.querySelectorAll('.stats-table-viewport')).toHaveLength(1);
    expect(target.querySelector('tbody').textContent).toContain('12');
    expect(mountConfig.getSvgString()).toContain('Sample count');
    expect(target.querySelector('.stats-table-actions').parentElement.className).toBe('stats-table-card');
  });
});
