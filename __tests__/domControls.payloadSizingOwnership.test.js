describe('domControls workspace payload sizing ownership', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.Main;
    delete window.Shared;
  });

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
  });

  test('captures sizing owner before an async payload loader yields to a sibling tab', async () => {
    const tabA = { id: 'tab-A', type: 'scatter' };
    const tabB = { id: 'tab-B', type: 'scatter' };
    let activeTab = tabA;
    let resolveLoad;
    const loadPromise = new Promise(resolve => { resolveLoad = resolve; });
    const applyPayloadSizingForType = jest.fn();

    window.Shared = {
      workspaceTabs: {
        activateWorkspace: jest.fn(),
        getSessionRecord: jest.fn((tabId) => ({ generation: tabId === 'tab-A' ? 11 : 22 }))
      },
      graphSizing: { applyPayloadSizingForType }
    };
    window.Main = {
      session: { getActiveTab: jest.fn(() => activeTab) }
    };

    require('../js/main/domControls.js');

    window.Main.domControls.applyWorkspacePayload({
      type: 'scatter',
      loadFromPayload: jest.fn(() => loadPromise)
    }, {
      type: 'scatter',
      meta: { graphSizing: { version: 2, display: { widthPx: 700, heightPx: 500 } } }
    }, {
      reason: 'test-async-sizing-owner'
    });

    activeTab = tabB;
    resolveLoad();
    await loadPromise;
    await Promise.resolve();

    expect(applyPayloadSizingForType).toHaveBeenCalledTimes(1);
    expect(applyPayloadSizingForType.mock.calls[0][2]).toEqual(expect.objectContaining({
      tabId: 'tab-A',
      sessionGeneration: 11
    }));
  });

  test('explicit sizing owner wins over the currently active sibling', () => {
    const applyPayloadSizingForType = jest.fn();
    window.Shared = {
      workspaceTabs: {
        activateWorkspace: jest.fn(),
        getSessionRecord: jest.fn(() => ({ generation: 37 }))
      },
      graphSizing: { applyPayloadSizingForType }
    };
    window.Main = {
      session: { getActiveTab: jest.fn(() => ({ id: 'tab-A', type: 'scatter' })) }
    };

    require('../js/main/domControls.js');

    window.Main.domControls.applyWorkspacePayload({
      type: 'scatter',
      loadFromPayload: jest.fn()
    }, {
      type: 'scatter',
      meta: { graphSizing: { version: 2, display: { widthPx: 640, heightPx: 480 } } }
    }, {
      tabId: 'tab-B',
      sessionGeneration: 37,
      reason: 'test-explicit-sizing-owner'
    });

    expect(applyPayloadSizingForType.mock.calls[0][2]).toEqual(expect.objectContaining({
      tabId: 'tab-B',
      sessionGeneration: 37
    }));
  });

  test('does not guess an owner after an unowned async payload loader yields', async () => {
    let resolveLoad;
    const loadPromise = new Promise(resolve => { resolveLoad = resolve; });
    const applyPayloadSizingForType = jest.fn();

    window.Shared = {
      workspaceTabs: {
        activateWorkspace: jest.fn(),
        getSessionRecord: jest.fn(() => null)
      },
      graphSizing: { applyPayloadSizingForType }
    };
    window.Main = {
      session: { getActiveTab: jest.fn(() => null) }
    };

    require('../js/main/domControls.js');

    window.Main.domControls.applyWorkspacePayload({
      type: 'scatter',
      loadFromPayload: jest.fn(() => loadPromise)
    }, {
      type: 'scatter',
      meta: { graphSizing: { version: 2, display: { widthPx: 680, heightPx: 490 } } }
    }, {
      reason: 'test-unowned-async-sizing'
    });

    window.Main.session.getActiveTab.mockReturnValue({ id: 'tab-B', type: 'scatter' });
    resolveLoad();
    await loadPromise;
    await Promise.resolve();

    expect(applyPayloadSizingForType).not.toHaveBeenCalled();
  });

});
