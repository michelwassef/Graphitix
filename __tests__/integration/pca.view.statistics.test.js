const { createPcaViewTestContext } = require('../../test-support/pcaViewTestSuite');

jest.setTimeout(30000);

describe('PCA view controls — statistics and reporting', () => {
  const {
    flushAll,
  } = createPcaViewTestContext();

  test('PCA scree data and eigen table export are generated for example dataset', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll();

    const screeContainer = document.getElementById('pcaScreeContainer');
    expect(screeContainer).toBeTruthy();
    expect(screeContainer.hidden).toBe(false);
    expect(screeContainer.querySelector('svg')).toBeTruthy();

    const eigenContainer = document.getElementById('pcaEigenTableContainer');
    expect(eigenContainer).toBeTruthy();
    expect(eigenContainer.hidden).toBe(false);
    const eigenTable = document.querySelector('#pcaEigenTableWrapper table');
    expect(eigenTable).toBeTruthy();

    const payload = window.Components.pca.getPayload();
    expect(payload.stats).toBeTruthy();
    expect(Array.isArray(payload.stats.eigenSummary)).toBe(true);
    expect(Array.isArray(payload.stats.scree)).toBe(true);
    expect(payload.stats.eigenSummary.length).toBeGreaterThan(0);
    expect(payload.stats.scree.length).toBe(payload.stats.eigenSummary.length);
    const firstEntry = payload.stats.eigenSummary[0];
    expect(firstEntry.component).toBe(1);
    expect(firstEntry.variancePercent).toBeGreaterThan(0);
    const cumulative = payload.stats.eigenSummary.map(item => item.cumulativeVariancePercent);
    const sorted = [...cumulative].sort((a, b) => a - b);
    expect(cumulative).toEqual(sorted);
    const screeFirst = payload.stats.scree[0];
    expect(screeFirst.variancePercent).toBeCloseTo(firstEntry.variancePercent, 5);
  }, 180000);

  test('PCA payload restore keeps statistics when saved stats live at payload root', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const payload = window.Components.pca.getPayload();
    expect(payload.stats).toBeTruthy();
    expect(JSON.stringify(payload.config?.stats?.summaryModel || {})).toContain('Samples analysed');
    expect(payload.config?.stats?.reportModel).toEqual(expect.objectContaining({
      kind: 'stats-report',
      title: 'Reporting and reproducibility'
    }));

    const eigenContainer = document.getElementById('pcaEigenTableContainer');
    const loadingsContainer = document.getElementById('pcaLoadingsContainer');
    expect(eigenContainer).toBeTruthy();
    expect(loadingsContainer).toBeTruthy();

    window.Components.pca.loadFromPayload(payload, { source: 'test-payload-restore', skipDraw: true });
    await flushAll(5);

    expect(payload.stats.method).toBe('pca');
    expect(eigenContainer.hidden).toBe(false);
    expect(loadingsContainer.hidden).toBe(false);
    expect(document.querySelector('#pcaScreePlot svg')).toBeTruthy();

    expect(document.querySelector('#pcaEigenTableWrapper table')).toBeTruthy();
    expect(document.querySelector('#pcaLoadingsTable table')).toBeTruthy();
  }, 180000);

  test('PCA empty workspace is not treated as unsaved table data', async () => {
    const session = window.Main?.session;
    expect(typeof session?.tabHasTableData).toBe('function');
    const payload = window.Components?.pca?.getPayload?.();
    expect(payload).toBeTruthy();
    const hasData = session.tabHasTableData({
      id: 'pca-empty-tab',
      type: 'pca',
      payload
    });
    expect(hasData).toBe(false);
  }, 180000);

  test('PCA workspace with user-entered values is treated as unsaved table data', async () => {
    const session = window.Main?.session;
    const component = window.Components?.pca;
    expect(typeof session?.tabHasTableData).toBe('function');
    expect(component).toBeTruthy();
    const hot = component.getHotInstance?.();
    expect(hot).toBeTruthy();
    if (typeof hot.setDataAtCell === 'function') {
      hot.setDataAtCell([[2, 1, 42]], 'test:pca-has-data');
    } else if (typeof hot.getData === 'function' && typeof hot.loadData === 'function') {
      const data = hot.getData() || [];
      if (!Array.isArray(data[2])) {
        data[2] = [];
      }
      data[2][1] = 42;
      hot.loadData(data);
    }
    await flushAll(5);
    const payload = component.getPayload();
    const hasData = session.tabHasTableData({
      id: 'pca-filled-tab',
      type: 'pca',
      payload
    });
    expect(hasData).toBe(true);
  }, 180000);

  test('PCA payload restore keeps reporting and reproducibility panel', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const payload = window.Components.pca.getPayload();
    expect(JSON.stringify(payload.config?.stats?.summaryModel || {})).toContain('Samples analysed');
    expect(payload.config?.stats?.reportModel).toEqual(expect.objectContaining({
      kind: 'stats-report',
      title: 'Reporting and reproducibility'
    }));
    expect(document.querySelector('#pcaStatsReportHost > .stats-report-panel')).toBeTruthy();
    expect(document.querySelector('#pcaStatsResults .stats-results-advanced-panel .stats-report-panel')).toBeFalsy();

    const summary = document.getElementById('pcaStatsSummary');
    expect(summary).toBeTruthy();
    summary.innerHTML = '';

    window.Components.pca.loadFromPayload(payload, { source: 'test-report-restore', skipDraw: true });
    await flushAll(10);

    const restoredPanel = document.querySelector('#pcaStatsReportHost > .stats-report-panel');
    expect(restoredPanel).toBeTruthy();
    expect(restoredPanel.textContent || '').toContain('Reporting and reproducibility');
    expect(document.querySelector('#pcaStatsResults .stats-results-advanced-panel .stats-report-panel')).toBeFalsy();
  }, 180000);

  test('PCA payload restore keeps model-only summary stats', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const payload = window.Components.pca.getPayload();
    const summaryModel = payload.config?.stats?.summaryModel;
    expect(JSON.stringify(summaryModel || {})).toContain('Samples analysed');

    payload.config.stats = {
      summaryModel,
      reportModel: payload.config?.stats?.reportModel || null
    };

    document.getElementById('pcaStatsSummary').innerHTML = '';
    const reportHost = document.getElementById('pcaStatsReportHost');
    if(reportHost){
      reportHost.innerHTML = '';
    }

    window.Components.pca.loadFromPayload(payload, { source: 'test-model-summary-restore', skipDraw: true });
    await flushAll(10);

    expect(document.getElementById('pcaStatsSummary')?.textContent || '').toContain('Samples analysed');
    expect(document.querySelector('#pcaStatsReportHost > .stats-report-panel')).toBeTruthy();
    expect(document.getElementById('pcaStatsResults')?.textContent || '').toContain('Reporting and reproducibility');
  }, 180000);

  test('PCA stats keep a single reporting panel anchored at the bottom', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const methodSelect = document.getElementById('pcaMethod');
    expect(methodSelect).toBeTruthy();
    methodSelect.value = 'mds';
    methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(10);
    methodSelect.value = 'pca';
    methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);

    const statsResults = document.getElementById('pcaStatsResults');
    const reportHost = document.getElementById('pcaStatsReportHost');
    expect(statsResults).toBeTruthy();
    expect(reportHost).toBeTruthy();
    expect(statsResults.lastElementChild).toBe(reportHost);
    expect(reportHost.querySelectorAll('.stats-report-panel').length).toBe(1);
    expect(statsResults.querySelectorAll('.stats-report-panel').length).toBe(1);
  }, 180000);

});
