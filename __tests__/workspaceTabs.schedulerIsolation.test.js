describe('workspace tab-scoped scheduler isolation', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/shared/debounce.js');
    require('../js/shared/workspaceTabs.js');
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  function waitForFrame() {
    return new Promise(resolve => setTimeout(resolve, 30));
  }

  test('debounced workspace callbacks are dropped when their tab session is stale at execution time', async () => {
    const Shared = window.Shared;
    expect(Shared?.debounceFrame).toBeTruthy();
    expect(Shared?.workspaceTabs).toBeTruthy();

    const original = Shared.workspaceTabs.isSessionMetaCurrent;
    const callback = jest.fn();
    const schedule = Shared.debounceFrame(callback);
    const meta = {
      componentKey: 'line',
      tabId: 'workspace-1',
      sessionGeneration: 3
    };

    Shared.workspaceTabs.isSessionMetaCurrent = jest.fn(() => false);
    schedule({ reason: 'stale-test', __workspaceSessionMeta: meta });
    await waitForFrame();

    expect(callback).not.toHaveBeenCalled();
    expect(Shared.workspaceTabs.isSessionMetaCurrent).toHaveBeenCalledWith('line', meta);

    Shared.workspaceTabs.isSessionMetaCurrent = jest.fn(() => true);
    schedule({ reason: 'current-test', __workspaceSessionMeta: meta });
    await waitForFrame();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'current-test',
      __workspaceSessionMeta: meta
    }));

    Shared.workspaceTabs.isSessionMetaCurrent = original;
  });
});
