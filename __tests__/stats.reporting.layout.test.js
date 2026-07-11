describe('Shared stats reporting layout', () => {
  const flush = () => new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });

  const flushAll = async (count = 8) => {
    for (let i = 0; i < count; i += 1) {
      await flush();
    }
  };

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '';
    global.Shared = {};
    require('../js/shared/stats.js');
    await flushAll();
  });

  test('reporting panel is rendered as a standalone bottom section when no advanced content exists', async () => {
    const target = document.createElement('div');
    target.id = 'pieStatsResults';
    document.body.appendChild(target);

    const reporting = global.Shared.statsReporting;
    expect(reporting).toBeTruthy();
    reporting.installEnhancedPanels({ selectors: ['#pieStatsResults'] });
    await flushAll();

    reporting.appendReportPanel(target, {
      methodsText: 'Chi-square test was used.',
      resultsText: 'Observed proportions differed across groups.'
    }, { title: 'Reporting and reproducibility' });
    reporting.refreshEnhancedPanels('test-report-only');
    await flushAll();

    const advancedPanel = target.querySelector(':scope > .stats-results-advanced-panel');
    const reportPanel = target.querySelector(':scope > .stats-report-panel');
    expect(reportPanel).toBeTruthy();
    expect(reportPanel.textContent || '').toContain('Reporting and reproducibility');
    expect(advancedPanel).toBeTruthy();
    expect(advancedPanel.hidden).toBe(true);
    expect(target.querySelector('.stats-results-advanced-panel .stats-report-panel')).toBeNull();
  });

  test('explicit diagnostics stay collapsed while reporting remains a separate bottom section', async () => {
    const target = document.createElement('div');
    target.id = 'pieStatsResults';
    document.body.appendChild(target);

    const reporting = global.Shared.statsReporting;
    expect(reporting).toBeTruthy();
    reporting.installEnhancedPanels({ selectors: ['#pieStatsResults'] });
    await flushAll();

    const advancedNode = document.createElement('div');
    advancedNode.className = 'stats-table-card';
    advancedNode.setAttribute('data-stats-section', 'diagnostics');
    advancedNode.textContent = 'Pairwise comparison details';
    target.appendChild(advancedNode);

    reporting.appendReportPanel(target, {
      methodsText: 'Chi-square test was used.',
      resultsText: 'Observed proportions differed across groups.'
    }, { title: 'Reporting and reproducibility' });
    reporting.refreshEnhancedPanels('test-advanced-and-report');
    await flushAll();

    const advancedPanel = target.querySelector(':scope > .stats-results-advanced-panel');
    const reportPanel = target.querySelector(':scope > .stats-report-panel');
    expect(advancedPanel).toBeTruthy();
    expect(advancedPanel.hidden).toBe(false);
    expect(advancedPanel.querySelector('.stats-table-card')).toBeTruthy();
    expect(advancedPanel.querySelector('.stats-report-panel')).toBeNull();
    expect(reportPanel).toBeTruthy();
  });

  test('captions never determine hierarchy and semantic sections survive restore', async () => {
    const target = document.createElement('div');
    target.id = 'statsResults';
    document.body.appendChild(target);
    const reporting = global.Shared.statsReporting;
    reporting.installEnhancedPanels({ selectors: ['#statsResults'] });

    const primary = document.createElement('div');
    primary.className = 'stats-table-card';
    primary.setAttribute('data-stats-section', 'comparisons');
    primary.textContent = 'Pairwise t-test with confidence interval';
    target.appendChild(primary);
    const diagnostics = document.createElement('div');
    diagnostics.className = 'stats-table-card';
    diagnostics.setAttribute('data-stats-section', 'diagnostics');
    diagnostics.textContent = 'Neutral title';
    target.appendChild(diagnostics);
    const descriptive = document.createElement('div');
    descriptive.className = 'stats-table-card';
    descriptive.setAttribute('data-stats-section', 'descriptive');
    descriptive.textContent = 'Descriptive statistics';
    target.insertBefore(descriptive, primary);
    reporting.enhancePanelNow(target, 'semantic-sections');

    expect(target.querySelector('.stats-results-main')?.contains(primary)).toBe(true);
    expect(target.querySelector('.stats-results-advanced-panel__body')?.contains(diagnostics)).toBe(true);
    expect(target.querySelector('.stats-results-descriptive')?.contains(descriptive)).toBe(true);
    expect(target.querySelector('.stats-results-advanced-panel summary')?.textContent).toBe('Diagnostics and model details');
    const ordered = Array.from(target.children);
    expect(ordered.indexOf(target.querySelector('.stats-results-main'))).toBeLessThan(ordered.indexOf(target.querySelector('.stats-results-advanced-panel')));
    expect(ordered.indexOf(target.querySelector('.stats-results-advanced-panel'))).toBeLessThan(ordered.indexOf(target.querySelector('.stats-results-descriptive')));

    const saved = reporting.capturePanelModel(target);
    target.innerHTML = '';
    reporting.restorePanelModel(target, saved);
    reporting.enhancePanelNow(target, 'semantic-sections-restored');
    expect(target.querySelector('.stats-results-main')?.textContent).toContain('Pairwise t-test');
    expect(target.querySelector('.stats-results-advanced-panel__body')?.textContent).toContain('Neutral title');
    expect(target.querySelector('.stats-results-descriptive')?.textContent).toContain('Descriptive statistics');
  });

  test('report host override places reporting at the end of the containing statistics section', async () => {
    const section = document.createElement('fieldset');
    const target = document.createElement('div');
    target.id = 'statsResults';
    const siblingTable = document.createElement('div');
    siblingTable.id = 'statsTable';
    const reportHost = document.createElement('div');
    reportHost.id = 'boxStatsReportHost';
    section.appendChild(target);
    section.appendChild(siblingTable);
    section.appendChild(reportHost);
    document.body.appendChild(section);

    target.__statsReportHost = reportHost;

    const reporting = global.Shared.statsReporting;
    expect(reporting).toBeTruthy();
    reporting.installEnhancedPanels({ selectors: ['#statsResults'] });
    await flushAll();

    const summaryCard = document.createElement('div');
    summaryCard.className = 'stats-table-card';
    summaryCard.textContent = 'Overall test summary';
    target.appendChild(summaryCard);

    reporting.appendReportPanel(target, {
      methodsText: 'ANOVA was used.',
      resultsText: 'At least one group differed.'
    }, { title: 'Reporting and reproducibility' });
    reporting.refreshEnhancedPanels('test-report-host');
    await flushAll();

    expect(target.querySelector(':scope > .stats-report-panel')).toBeNull();
    expect(reportHost.querySelector(':scope > .stats-report-panel')).toBeTruthy();
    expect(section.lastElementChild).toBe(reportHost);
  });

  test('null structured parts do not suppress plain reporting text', async () => {
    const target = document.createElement('div');
    target.id = 'scatterStatsResults';
    document.body.appendChild(target);

    const reporting = global.Shared.statsReporting;
    expect(reporting).toBeTruthy();
    reporting.appendReportPanel(target, {
      methodsText: 'Scatter data were cleaned to numeric X/Y pairs before fitting.',
      resultsText: 'The fitted model was reported.',
      methodsParts: null,
      resultsParts: null
    }, { title: 'Reporting and reproducibility' });
    await flushAll();

    const panel = target.querySelector(':scope > .stats-report-panel');
    expect(panel).toBeTruthy();
    const methodBlock = panel.querySelector('[data-stats-report-block="methods"]');
    const resultBlock = panel.querySelector('[data-stats-report-block="results"]');
    expect(methodBlock?.textContent || '').toContain('Scatter data were cleaned');
    expect(resultBlock?.textContent || '').toContain('The fitted model was reported');
  });

});
