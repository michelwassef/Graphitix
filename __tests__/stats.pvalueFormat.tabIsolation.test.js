describe('Shared p-value format tab isolation', () => {
  let tabs;
  let workspaceState;
  let updateTabPayload;

  const clone = value => JSON.parse(JSON.stringify(value));

  const PANEL_CASES = [
    ['box', 'statsResults'],
    ['scatter', 'scatterStatsResults'],
    ['line', 'lineStatsResults'],
    ['heatmap', 'heatmapStatsContent'],
    ['roc', 'rocStatsResults'],
    ['hist', 'histStatsResults'],
    ['pie', 'pieStatsResults'],
    ['pca', 'pcaStatsResults'],
    ['surface', 'surfaceStatsSummary'],
    ['survival', 'survivalStatsSummary'],
    ['venn', 'significanceResults']
  ];

  function setActiveTab(tabId, component = 'scatter') {
    workspaceState.activeTabId = tabId;
    window.Components[component] = window.Components[component] || {};
    window.Components[component].__boundTabId = tabId;
  }

  function createReusedPanel(id) {
    const panel = document.createElement('div');
    panel.id = id;
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Term</th><th>p-value</th></tr></thead><tbody><tr><td>Slope</td><td>0.00001</td></tr></tbody>';
    panel.appendChild(table);
    document.body.appendChild(panel);
    return panel;
  }

  function applyTab(tab, component = 'scatter') {
    setActiveTab(tab.id, component);
    window.Shared.workspaceTabs.applySharedPayloadState(tab, component, tab.payload, null, {
      tabId: tab.id,
      reason: `unit-activate-${tab.id}`
    });
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.Shared;
    delete window.Main;
    delete window.Components;

    tabs = [
      { id: 'tab-a', type: 'scatter', payload: { type: 'scatter' } },
      { id: 'tab-b', type: 'scatter', payload: { type: 'scatter' } }
    ];
    workspaceState = { tabs, activeTabId: 'tab-a' };
    updateTabPayload = jest.fn((tab, updater) => {
      tab.payload = updater(clone(tab.payload || { type: tab.type }), tab);
      return true;
    });
    window.Components = { scatter: { __boundTabId: 'tab-a' } };
    window.Main = {
      session: {
        workspaceState,
        getActiveTab: () => tabs.find(tab => tab.id === workspaceState.activeTabId) || null,
        updateTabPayload
      },
      components: { registry: {} }
    };

    require('../js/shared/workspaceTabs.js');
    require('../js/shared/stats.js');
  });

  afterEach(() => {
    delete window.Shared;
    delete window.Main;
    delete window.Components;
  });

  test('a reused Scatter panel cannot overwrite either sibling owner', () => {
    const reporting = window.Shared.statsReporting;
    const panel = createReusedPanel('scatterStatsResults');

    applyTab(tabs[0]);
    reporting.enhancePanelNow(panel, 'unit-tab-a');
    const staleDecimalModel = reporting.capturePanelModel(panel);
    expect(reporting.getPValueFormatScientific({ target: panel, tabId: 'tab-a' })).toBe(false);

    applyTab(tabs[1]);
    reporting.enhancePanelNow(panel, 'unit-tab-b');
    reporting.setPValueFormatScientific(true, {
      target: panel,
      tabId: 'tab-b',
      source: 'unit-tab-b-toggle',
      persist: true
    });
    reporting.enhancePanelNow(panel, 'unit-tab-b-scientific');

    expect(tabs[1].payload.meta?.statsReporting?.pValueScientific).toBe(true);
    expect(tabs[0].payload.meta?.statsReporting?.pValueScientific).toBeUndefined();
    expect(reporting.getPValueFormatScientific({ target: panel, tabId: 'tab-b' })).toBe(true);
    expect(panel.querySelector('.stats-pvalue-format-select')?.value).toBe('scientific');

    applyTab(tabs[0]);
    reporting.restorePanelModel(panel, staleDecimalModel);
    reporting.enhancePanelNow(panel, 'unit-tab-a-return');
    expect(reporting.getPValueFormatScientific({ target: panel, tabId: 'tab-a' })).toBe(false);
    expect(panel.querySelector('.stats-pvalue-format-select')?.value).toBe('decimal');

    applyTab(tabs[1]);
    reporting.restorePanelModel(panel, staleDecimalModel);
    reporting.enhancePanelNow(panel, 'unit-tab-b-return');
    expect(reporting.getPValueFormatScientific({ target: panel, tabId: 'tab-b' })).toBe(true);
    expect(panel.querySelector('.stats-pvalue-format-select')?.value).toBe('scientific');
    expect(tabs[1].payload.meta?.statsReporting?.pValueScientific).toBe(true);
  });

  test('the shared control is a dropdown with its current value selected', () => {
    const reporting = window.Shared.statsReporting;
    const panel = createReusedPanel('scatterStatsResults');

    applyTab(tabs[0]);
    reporting.enhancePanelNow(panel, 'unit-dropdown');

    const select = panel.querySelector('.stats-pvalue-format-select');
    expect(select).toBeTruthy();
    expect(select.value).toBe('decimal');
    expect(Array.from(select.options).map(option => option.value)).toEqual(['decimal', 'scientific']);

    select.value = 'scientific';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(tabs[0].payload.meta?.statsReporting?.pValueScientific).toBe(true);
    reporting.enhancePanelNow(panel, 'unit-dropdown-scientific');
    expect(panel.querySelector('.stats-pvalue-format-select')?.value).toBe('scientific');
  });

  test('shared payload capture and reopen preserve independent formats', () => {
    const reporting = window.Shared.statsReporting;
    reporting.setPValueFormatScientific(false, { tabId: 'tab-a', source: 'unit-a' });
    reporting.setPValueFormatScientific(true, { tabId: 'tab-b', source: 'unit-b' });

    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[0], 'scatter', tabs[0].payload, null, {
      tabId: 'tab-a', reason: 'unit-capture-a'
    });
    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[1], 'scatter', tabs[1].payload, null, {
      tabId: 'tab-b', reason: 'unit-capture-b'
    });

    expect(tabs[0].payload.meta.statsReporting.pValueScientific).toBe(false);
    expect(tabs[1].payload.meta.statsReporting.pValueScientific).toBe(true);

    const reopenedA = { id: 'reopened-a', type: 'scatter', payload: clone(tabs[0].payload) };
    const reopenedB = { id: 'reopened-b', type: 'scatter', payload: clone(tabs[1].payload) };
    tabs.push(reopenedA, reopenedB);
    window.Shared.workspaceTabs.applySharedPayloadState(reopenedA, 'scatter', reopenedA.payload, null, { reason: 'unit-reopen-a' });
    window.Shared.workspaceTabs.applySharedPayloadState(reopenedB, 'scatter', reopenedB.payload, null, { reason: 'unit-reopen-b' });

    expect(reporting.getPValueFormatScientific({ tabId: reopenedA.id })).toBe(false);
    expect(reporting.getPValueFormatScientific({ tabId: reopenedB.id })).toBe(true);
  });

  test.each(PANEL_CASES)('%s resolves a reused %s panel from its current owner', (component, panelId) => {
    tabs[0].type = component;
    tabs[1].type = component;
    tabs[1].payload.type = component;
    window.Components[component] = { __boundTabId: 'tab-a' };
    const reporting = window.Shared.statsReporting;
    const panel = createReusedPanel(panelId);

    applyTab(tabs[0], component);
    reporting.setPValueFormatScientific(false, { target: panel, tabId: 'tab-a', source: `${component}-a` });
    applyTab(tabs[1], component);
    reporting.setPValueFormatScientific(true, { target: panel, tabId: 'tab-b', source: `${component}-b` });

    setActiveTab('tab-a', component);
    expect(reporting.getPValueFormatScientific({ target: panel })).toBe(false);
    setActiveTab('tab-b', component);
    expect(reporting.getPValueFormatScientific({ target: panel })).toBe(true);
  });
});
