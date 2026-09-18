describe('semantic figure-summary tables', () => {
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
        caption:'Analysis summary',
        columns:[{ key:'statistic', label:'Statistic' }, { key:'value', label:'Value' }],
        rows:[['Analysis', 'Descriptive summary']],
        footnotes:[],
        options:{ fileName:'box-figure-summary', contextLabel:'box-figure-summary' }
      }
    });

    expect(result.table.querySelectorAll('thead th[scope="col"]')).toHaveLength(2);
    expect(result.table.querySelector('tbody th[scope="row"]')?.textContent).toBe('Analysis');
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
});
