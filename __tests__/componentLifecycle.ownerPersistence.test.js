describe('componentLifecycle owner payload persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    window.Main = {
      session: {
        workspaceState: {
          activeTabId: 'pca-a',
          tabs: [
            { id: 'pca-a', type: 'pca' },
            { id: 'pca-b', type: 'pca' },
            { id: 'line-a', type: 'line' }
          ]
        },
        persistUserModifiedTabState: jest.fn(() => true),
        persistActiveTabState: jest.fn(() => true),
        markTabUserModified: jest.fn(() => true)
      }
    };
    require('../js/shared/componentLifecycle.js');
  });

  afterEach(() => {
    delete window.Main;
  });

  test('flushes the explicitly owned active tab through the standard user-persistence path', () => {
    const lifecycle = window.Shared.componentLifecycle;
    const session = window.Main.session;

    expect(lifecycle.persistOwnedUserState('pca', { tabId: 'pca-a' }, { reason: 'pca-legend-toggle' })).toBe(true);
    expect(session.persistUserModifiedTabState).toHaveBeenCalledTimes(1);
    expect(session.persistUserModifiedTabState).toHaveBeenCalledWith(session.workspaceState.tabs[0], {
      reason: 'pca-legend-toggle',
      origin: 'user',
      snapshotIntent: {
        captureLivePayload: true,
        allowSkipLivePayloadCapture: false
      }
    });
    expect(session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test('refuses an inactive same-component owner instead of leaking through the active tab', () => {
    const lifecycle = window.Shared.componentLifecycle;
    const session = window.Main.session;

    expect(lifecycle.persistOwnedUserState('pca', { tabId: 'pca-b' }, { reason: 'pca-legend-toggle' })).toBe(false);
    expect(session.persistUserModifiedTabState).not.toHaveBeenCalled();
    expect(session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test('refuses an unindexed owner instead of allowing Main.session to fall back to the active tab', () => {
    const lifecycle = window.Shared.componentLifecycle;
    const session = window.Main.session;

    session.workspaceState.activeTabId = 'pca-missing';
    expect(lifecycle.persistOwnedUserState('pca', { tabId: 'pca-missing' }, { reason: 'pca-legend-toggle' })).toBe(false);
    expect(session.persistUserModifiedTabState).not.toHaveBeenCalled();
    expect(session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test('refuses persistence when the authoritative workspace tab index is unavailable', () => {
    const lifecycle = window.Shared.componentLifecycle;
    const session = window.Main.session;

    delete session.workspaceState.tabs;
    expect(lifecycle.persistOwnedUserState('pca', { tabId: 'pca-a' }, { reason: 'pca-legend-toggle' })).toBe(false);
    expect(session.persistUserModifiedTabState).not.toHaveBeenCalled();
    expect(session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test('refuses a component/tab type mismatch', () => {
    const lifecycle = window.Shared.componentLifecycle;
    const session = window.Main.session;

    session.workspaceState.activeTabId = 'line-a';
    expect(lifecycle.persistOwnedUserState('pca', { tabId: 'line-a' }, {
      reason: 'pca-legend-toggle'
    })).toBe(false);
    expect(session.persistUserModifiedTabState).not.toHaveBeenCalled();
  });
});
