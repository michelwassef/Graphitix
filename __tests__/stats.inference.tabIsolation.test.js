describe('Shared statistical inference tab isolation', () => {
  let tabs;
  let workspaceState;
  let updateTabPayload;

  const clone = value => JSON.parse(JSON.stringify(value));
  const setActiveTab = tabId => { workspaceState.activeTabId = tabId; };

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.Shared;
    delete window.Main;

    tabs = [
      { id: 'tab-a', type: 'box', payload: { type: 'box' } },
      { id: 'tab-b', type: 'box', payload: { type: 'box' } },
      { id: 'tab-pca', type: 'pca', payload: { type: 'pca' } }
    ];
    workspaceState = { tabs, activeTabId: 'tab-a' };
    updateTabPayload = jest.fn((tab, updater) => {
      const draft = clone(tab.payload || { type: tab.type });
      tab.payload = updater(draft, tab);
      return true;
    });

    window.Main = {
      session: {
        workspaceState,
        getActiveTab: () => tabs.find(tab => tab.id === workspaceState.activeTabId) || null,
        getTabById: id => tabs.find(tab => tab.id === id) || null,
        updateTabPayload
      },
      components: { registry: {} }
    };

    require('../js/shared/workspaceTabs.js');
    require('../js/shared/stats.js');
    require('../js/shared/statsInference.js');
  });

  test('same-component sibling tabs own independent alpha and target-FDR values', () => {
    const inference = window.Shared.statsInference;
    expect(inference.getState({ tabId: 'tab-a' })).toMatchObject({ alpha: 0.05, targetFdr: 0.05 });
    expect(inference.getState({ tabId: 'tab-b' })).toMatchObject({ alpha: 0.05, targetFdr: 0.05 });

    inference.setState({ alpha: 0.01, targetFdr: 0.025 }, { tabId: 'tab-a', source: 'unit-a' });
    expect(tabs[0].payload.meta.statsInference).toMatchObject({ alpha: 0.01, targetFdr: 0.025 });
    expect(inference.getState({ tabId: 'tab-b' })).toMatchObject({ alpha: 0.05, targetFdr: 0.05 });

    setActiveTab('tab-b');
    inference.setState({ alpha: 0.1, targetFdr: 0.2 }, { tabId: 'tab-b', source: 'unit-b' });
    expect(inference.getState({ tabId: 'tab-a' })).toMatchObject({ alpha: 0.01, targetFdr: 0.025 });
    expect(inference.getState({ tabId: 'tab-b' })).toMatchObject({ alpha: 0.1, targetFdr: 0.2 });
    expect(updateTabPayload).toHaveBeenCalledTimes(2);
  });

  test('payload capture/reopen round-trips inference state without creating it for untouched descriptive tabs', () => {
    const inference = window.Shared.statsInference;
    inference.setState({ alpha: 0.0125, targetFdr: 0.04 }, { tabId: 'tab-a', persist: false });

    const payloadA = { type: 'box' };
    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[0], 'box', payloadA, null, {
      tabId: 'tab-a', reason: 'unit-capture-a'
    });
    expect(payloadA.meta.statsInference).toMatchObject({ alpha: 0.0125, targetFdr: 0.04 });

    const pcaPayload = { type: 'pca' };
    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[2], 'pca', pcaPayload, null, {
      tabId: 'tab-pca', reason: 'unit-capture-pca'
    });
    expect(pcaPayload.meta?.statsInference).toBeUndefined();

    const reopened = { id: 'tab-reopened', type: 'box', payload: clone(payloadA) };
    tabs.push(reopened);
    window.Shared.workspaceTabs.applySharedPayloadState(reopened, 'box', reopened.payload, null, {
      tabId: reopened.id, reason: 'unit-reopen'
    });
    expect(inference.getState({ tabId: reopened.id })).toMatchObject({ alpha: 0.0125, targetFdr: 0.04 });
  });

  test('payloads without inference settings clear reused-tab overrides and fall back to defaults implicitly', () => {
    const inference = window.Shared.statsInference;
    inference.setState({ alpha: 0.2, targetFdr: 0.3 }, { tabId: 'tab-a', persist: false });
    expect(inference.getAlpha({ tabId: 'tab-a' })).toBe(0.2);

    window.Shared.workspaceTabs.applySharedPayloadState(tabs[0], 'box', { type: 'box' }, null, {
      tabId: 'tab-a', reason: 'unit-reset'
    });
    expect(inference.getState({ tabId: 'tab-a' })).toMatchObject({ alpha: 0.05, targetFdr: 0.05 });

    const payload = { type: 'box' };
    window.Shared.workspaceTabs.captureSharedPayloadState(tabs[0], 'box', payload, null, {
      tabId: 'tab-a', reason: 'unit-default-remains-implicit'
    });
    expect(payload.meta?.statsInference).toBeUndefined();
  });
});
