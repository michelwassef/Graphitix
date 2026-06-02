describe('workspace tab-scoped scheduler isolation', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Main = {
      session: {
        workspaceState: {
          tabs: []
        }
      }
    };
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

  test('per-tab mounted roots are distinct and only the active root is attached', () => {
    document.body.innerHTML = `
      <main id="workspacePages">
        <section id="demoPage" class="workspace-page">
          <div id="demoGraphPanel"><div class="svgbox"><svg id="demoSvg"></svg></div></div>
        </section>
      </main>
    `;
    const Shared = window.Shared;
    const workspaceState = window.Main.session.workspaceState;
    const tabA = { id: 'workspace-1', type: 'demo' };
    const tabB = { id: 'workspace-2', type: 'demo' };
    workspaceState.tabs.push(tabA, tabB);
    const config = {
      type: 'demo',
      perTabDomInstances: true,
      element: document.getElementById('demoPage')
    };

    const rootA = Shared.workspaceTabs.ensureMountedRoot(tabA, config, { reason: 'test-a' });
    expect(rootA).toBeTruthy();
    expect(rootA.dataset.workspaceTabId).toBe(tabA.id);
    expect(rootA.querySelector('svg').dataset.workspaceTabId).toBe(tabA.id);
    expect(document.querySelectorAll('#demoPage')).toHaveLength(1);
    expect(document.getElementById('demoPage')).toBe(rootA);

    const rootB = Shared.workspaceTabs.ensureMountedRoot(tabB, config, { reason: 'test-b' });
    expect(rootB).toBeTruthy();
    expect(rootB).not.toBe(rootA);
    expect(rootB.dataset.workspaceTabId).toBe(tabB.id);
    expect(rootA.parentNode).toBeNull();
    expect(document.querySelectorAll('#demoPage')).toHaveLength(1);
    expect(document.getElementById('demoPage')).toBe(rootB);

    const rootAAgain = Shared.workspaceTabs.ensureMountedRoot(tabA, config, { reason: 'test-a-again' });
    expect(rootAAgain).toBe(rootA);
    expect(rootB.parentNode).toBeNull();
    expect(document.querySelectorAll('#demoPage')).toHaveLength(1);
    expect(document.getElementById('demoPage')).toBe(rootA);
  });

  test('session metadata validation fails closed when metadata is missing or invalid', () => {
    const workspaceTabs = window.Shared.workspaceTabs;
    expect(workspaceTabs.isSessionMetaCurrent('line', null)).toBe(false);
    expect(workspaceTabs.isSessionMetaCurrent('line', undefined)).toBe(false);
    expect(workspaceTabs.isSessionMetaCurrent('line', {})).toBe(false);
    expect(workspaceTabs.isSessionMetaCurrent('line', {
      componentKey: 'line',
      tabId: 'workspace-1',
      sessionGeneration: 0
    })).toBe(false);
  });

  test('buildSessionMeta resolves generation from the targeted tab record, not an unrelated active tab', () => {
    const workspaceTabs = window.Shared.workspaceTabs;
    const tabs = window.Main.session.workspaceState.tabs;
    const tabA = { id: 'workspace-1', type: 'line' };
    const tabB = { id: 'workspace-2', type: 'line' };
    tabs.push(tabA, tabB);

    workspaceTabs.activateSession(tabA, 'line', { reason: 'unit-tab-a-activate' }); // generation = 1
    workspaceTabs.activateSession(tabB, 'line', { reason: 'unit-tab-b-activate-1' }); // generation = 1
    workspaceTabs.activateSession(tabB, 'line', { reason: 'unit-tab-b-activate-2' }); // generation = 2 (active)

    const activeInfo = workspaceTabs.getActiveSessionInfo('line');
    expect(activeInfo).toMatchObject({ tabId: tabB.id, generation: 2 });

    const metaA = workspaceTabs.buildSessionMeta('line', { tabId: tabA.id });
    expect(metaA.tabId).toBe(tabA.id);
    expect(metaA.sessionGeneration).toBe(1);
  });
});
