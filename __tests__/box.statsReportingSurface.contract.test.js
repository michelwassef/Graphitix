describe('Box statistics reporting surface contract', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <fieldset id="boxStatsSection">
        <div id="statsResults"></div>
        <div id="statsTable"></div>
        <div id="boxStatsReportHost" class="stats-report-host"></div>
      </fieldset>`;
    global.Shared = {};
    require('../js/shared/stats.js');
  });

  test('Diagnostics and model details and reporting are synchronous, ordered, and restorable', () => {
    const target = document.getElementById('statsResults');
    const reportHost = document.getElementById('boxStatsReportHost');
    const section = document.getElementById('boxStatsSection');
    target.__statsReportHost = reportHost;

    const main = document.createElement('div');
    main.className = 'stats-table-card';
    main.textContent = 'Overall test summary';
    target.appendChild(main);

    const assumptions = document.createElement('div');
    assumptions.className = 'box-stats-assumption-container stats-assumption-container';
    assumptions.setAttribute('data-stats-section', 'diagnostics');
    assumptions.textContent = 'Assumption diagnostics';
    target.appendChild(assumptions);

    const reporting = global.Shared.statsReporting;
    reporting.appendReportPanel(target, {
      methodsText: 'Welch ANOVA was selected explicitly.',
      resultsText: 'The selected analysis completed.',
      analysisSpec: { schemaVersion: 'box-stats-spec-v6', analysisId: 'welchAnova' }
    }, { title: 'Reporting and reproducibility' });
    reporting.enhancePanelNow(target, 'box-contract');

    const advanced = target.querySelector(':scope > .stats-results-advanced-panel');
    const report = reportHost.querySelector(':scope > .stats-report-panel');
    expect(advanced).toBeTruthy();
    expect(advanced.hidden).toBe(false);
    expect(advanced.querySelector('summary').textContent).toBe('Diagnostics and model details');
    expect(advanced.querySelector('.stats-assumption-container')).toBeTruthy();
    expect(report).toBeTruthy();
    expect(report.textContent).toContain('Reporting and reproducibility');
    expect(advanced.querySelector('.stats-report-panel')).toBeNull();
    expect(section.lastElementChild).toBe(reportHost);

    const model = reporting.capturePanelModel(target);
    expect(model).toBeTruthy();
    target.innerHTML = '';
    reportHost.innerHTML = '';
    target.__statsReportHost = reportHost;
    expect(reporting.restorePanelModel(target, model)).toEqual(expect.objectContaining({ restoredMain: true, restoredReport: true }));

    const restoredAdvanced = target.querySelector(':scope > .stats-results-advanced-panel');
    const restoredReport = reportHost.querySelector(':scope > .stats-report-panel');
    expect(restoredAdvanced?.querySelector('.stats-assumption-container')).toBeTruthy();
    expect(restoredReport?.textContent || '').toContain('Reporting and reproducibility');
    expect(section.lastElementChild).toBe(reportHost);
  });

  test('Box source uses the shared advanced classifier and synchronous pre-capture enhancement', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'box.js'), 'utf8');
    expect(source).toContain("box-stats-assumption-container stats-assumption-container");
    expect(source).toContain("setAttribute('data-stats-section', 'diagnostics')");
    expect(source).toMatch(/refreshSharedStatsReportingPanels\('box-stats-before-capture',\s*\{\s*synchronous:\s*true\s*\}\)/);
    expect(source).toMatch(/enhancePanelNow\(target,/);
  });
});
