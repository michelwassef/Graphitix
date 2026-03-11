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

  test('advanced content stays in Advanced statistics while reporting remains a separate bottom section', async () => {
    const target = document.createElement('div');
    target.id = 'pieStatsResults';
    document.body.appendChild(target);

    const reporting = global.Shared.statsReporting;
    expect(reporting).toBeTruthy();
    reporting.installEnhancedPanels({ selectors: ['#pieStatsResults'] });
    await flushAll();

    const advancedNode = document.createElement('div');
    advancedNode.className = 'stats-table-card';
    advancedNode.setAttribute('data-stats-advanced', '1');
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
});
