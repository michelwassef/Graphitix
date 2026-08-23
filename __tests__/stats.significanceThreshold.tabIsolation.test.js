describe('Shared statistics significance threshold tab isolation', () => {
  let tabs;
  let workspaceState;
  let updateTabPayload;
  let persistUserModifiedTabState;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setActiveTab(tabId) {
    workspaceState.activeTabId = tabId;
  }

  function createStatsPanel(tabId, id) {
    const root = document.createElement('section');
    root.dataset.tabId = tabId;
    root.dataset.workspaceTabId = tabId;
    const panel = document.createElement('div');
    panel.id = id;
    const table = document.createElement('table');
    table.innerHTML = '<tbody><tr><th>P value</th><td>0.02</td></tr></tbody>';
    panel.appendChild(table);
    root.appendChild(panel);
    document.body.appendChild(root);
    window.Shared.statsReporting.enhancePanelNow(panel, `test-${tabId}-enhance`);
    return panel;
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.Shared;
    delete window.Main;

    tabs = [
      { id: 'tab-a', type: 'box', payload: { type: 'box' } },
      { id: 'tab-b', type: 'box', payload: { type: 'box' } }
    ];
    workspaceState = {
      tabs,
      activeTabId: 'tab-a'
    };
    updateTabPayload = jest.fn((tab, updater) => {
      const draft = clone(tab.payload || { type: tab.type });
      tab.payload = updater(draft, tab);
      return true;
    });
    persistUserModifiedTabState = jest.fn(() => true);

    window.Main = {
      session: {
        workspaceState,
        getActiveTab: () => tabs.find(tab => tab.id === workspaceState.activeTabId) || null,
        updateTabPayload,
        persistUserModifiedTabState
      },
      components: { registry: {} }
    };

    require('../js/shared/workspaceTabs.js');
    require('../js/shared/stats.js');
  });

  test('same-component sibling tabs keep independent thresholds and persist only the owning tab', () => {
    const reporting = window.Shared.statsReporting;
    const panelA = createStatsPanel('tab-a', 'stats-panel-a');
    const panelB = createStatsPanel('tab-b', 'stats-panel-b');

    expect(reporting.getSignificanceThreshold({ target: panelA })).toBe(0.05);
    expect(reporting.getSignificanceThreshold({ target: panelB })).toBe(0.05);

    reporting.setSignificanceThreshold(0.01, {
      target: panelA,
      tabId: 'tab-a',
      source: 'unit-tab-a',
      persist: true
    });
    reporting.enhancePanelNow(panelA, 'unit-tab-a-sync');
    reporting.enhancePanelNow(panelB, 'unit-tab-b-unchanged');

    expect(reporting.getSignificanceThreshold({ target: panelA })).toBe(0.01);
    expect(reporting.getSignificanceThreshold({ target: panelB })).toBe(0.05);
    expect(panelA.querySelector('.stats-significance-controls__input')?.value).toBe('0.01');
    expect(panelB.querySelector('.stats-significance-controls__input')?.value).toBe('0.05');
    expect(tabs[0].payload.meta?.statsReporting?.significanceThreshold).toBe(0.01);
    expect(tabs[1].payload.meta?.statsReporting).toBeUndefined();
    expect(updateTabPayload).toHaveBeenCalledTimes(1);
    expect(updateTabPayload.mock.calls[0][0]).toBe(tabs[0]);
    expect(persistUserModifiedTabState).not.toHaveBeenCalled();

    setActiveTab('tab-b');
    reporting.setSignificanceThreshold(0.1, {
      target: panelB,
      tabId: 'tab-b',
      source: 'unit-tab-b',
      persist: true
    });
    reporting.enhancePanelNow(panelA, 'unit-tab-a-still-isolated');
    reporting.enhancePanelNow(panelB, 'unit-tab-b-sync');

    expect(reporting.getSignificanceThreshold({ target: panelA })).toBe(0.01);
    expect(reporting.getSignificanceThreshold({ target: panelB })).toBe(0.1);
    expect(tabs[0].payload.meta?.statsReporting?.significanceThreshold).toBe(0.01);
    expect(tabs[1].payload.meta?.statsReporting?.significanceThreshold).toBe(0.1);
    expect(updateTabPayload).toHaveBeenCalledTimes(2);
    expect(updateTabPayload.mock.calls[1][0]).toBe(tabs[1]);
    expect(persistUserModifiedTabState).not.toHaveBeenCalled();
  });

  test('shared payload capture and apply round-trip the exact owner threshold', () => {
    const reporting = window.Shared.statsReporting;
    reporting.setSignificanceThreshold(0.0125, { tabId: 'tab-a', source: 'unit-round-trip-a' });
    reporting.setSignificanceThreshold(0.2, { tabId: 'tab-b', source: 'unit-round-trip-b' });

    const payloadA = { type: 'box', meta: { statsReporting: { futureField: 'keep' } } };
    const payloadB = { type: 'box' };
    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[0], 'box', payloadA, null, {
      tabId: 'tab-a',
      reason: 'unit-capture-a'
    });
    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[1], 'box', payloadB, null, {
      tabId: 'tab-b',
      reason: 'unit-capture-b'
    });

    expect(payloadA.meta.statsReporting.significanceThreshold).toBe(0.0125);
    expect(payloadA.meta.statsReporting.futureField).toBe('keep');
    expect(payloadB.meta.statsReporting.significanceThreshold).toBe(0.2);

    const reopened = { id: 'tab-reopened', type: 'box', payload: clone(payloadA) };
    tabs.push(reopened);
    window.Shared.workspaceTabs.applySharedPayloadState(reopened, 'box', reopened.payload, null, {
      tabId: reopened.id,
      reason: 'unit-reopen'
    });

    expect(reporting.getSignificanceThreshold({ tabId: reopened.id })).toBe(0.0125);
    expect(reporting.getSignificanceThreshold({ tabId: 'tab-a' })).toBe(0.0125);
    expect(reporting.getSignificanceThreshold({ tabId: 'tab-b' })).toBe(0.2);
  });

  test('payloads without a threshold reset a reused tab to the canonical default', () => {
    const reporting = window.Shared.statsReporting;
    const panelA = createStatsPanel('tab-a', 'stats-panel-reset-a');
    reporting.setSignificanceThreshold(0.25, { target: panelA, tabId: 'tab-a', source: 'unit-before-reset' });
    reporting.enhancePanelNow(panelA, 'unit-before-reset-sync');
    expect(reporting.getSignificanceThreshold({ tabId: 'tab-a' })).toBe(0.25);
    expect(panelA.querySelector('.stats-significance-controls__input')?.value).toBe('0.25');

    window.Shared.workspaceTabs.applySharedPayloadState(tabs[0], 'box', { type: 'box' }, null, {
      tabId: 'tab-a',
      reason: 'unit-reset-from-payload'
    });
    reporting.enhancePanelNow(panelA, 'unit-reset-from-payload-sync');

    expect(reporting.getSignificanceThreshold({ tabId: 'tab-a' })).toBe(0.05);
    expect(panelA.querySelector('.stats-significance-controls__input')?.value).toBe('0.05');

    const untouchedPayload = { type: 'box' };
    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[0], 'box', untouchedPayload, null, {
      tabId: 'tab-a',
      reason: 'unit-default-remains-implicit'
    });
    expect(untouchedPayload.meta?.statsReporting).toBeUndefined();
  });

  test('statistics panel models do not duplicate the tab-owned threshold', () => {
    const reporting = window.Shared.statsReporting;
    const panelA = createStatsPanel('tab-a', 'stats-panel-model-a');
    reporting.setSignificanceThreshold(0.005, { target: panelA, tabId: 'tab-a', source: 'unit-panel-model' });
    reporting.enhancePanelNow(panelA, 'unit-panel-model-sync');

    const saved = reporting.capturePanelModel(panelA);
    expect(JSON.stringify(saved)).not.toContain('significanceThreshold');

    const payload = { type: 'box' };
    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[0], 'box', payload, null, {
      tabId: 'tab-a',
      reason: 'unit-panel-model-single-source'
    });
    expect(payload.meta.statsReporting.significanceThreshold).toBe(0.005);
  });
});
