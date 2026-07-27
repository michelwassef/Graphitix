describe('sessionActions shared archive restore transaction', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<main id="appRoot"><button id="existingAction">Existing action</button></main><div id="workspaceTabsDock"></div>';
    window.Main = {};
    window.Shared = {
      graphArchive: {
        parseFile: jest.fn()
      }
    };
    require('../js/main/snapshotPolicy.js');
    require('../js/main/sessionActions.js');
  });

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
  });

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function createContext(applySessionData) {
    return {
      Shared: window.Shared,
      session: {
        applySessionData,
        fastClonePayload: value => value == null ? value : JSON.parse(JSON.stringify(value))
      },
      workspaceState: {
        tabs: [],
        sessionFileHandle: null,
        sessionFileName: '',
        sessionFileScope: null
      },
      withSessionContext: value => value,
      hideDuplicatePrompt: jest.fn(),
      renderTabs: jest.fn(),
      activateTab: jest.fn(),
      showGraphSelection: jest.fn()
    };
  }

  test('manual open and recovery restore both await the same applySessionData transaction', async () => {
    const parsed = {
      source: 'graph-archive',
      session: {
        scope: 'workspace',
        activeIndex: 0,
        tabs: [{
          title: 'Heatmap',
          type: 'heatmap',
          payload: {
            type: 'heatmap',
            data: [['Control'], [12]],
            exclusions: { rows: [], cols: [], cells: [[1, 0]] }
          },
          layout: { width: 640, height: 480 }
        }]
      }
    };
    window.Shared.graphArchive.parseFile.mockResolvedValue(parsed);

    const manualDeferred = deferred();
    const manualApply = jest.fn(() => manualDeferred.promise);
    const manualContext = createContext(manualApply);
    const manualPromise = window.Main.sessionActions.loadWorkspaceFile(
      manualContext,
      { name: 'manual.graph' },
      { fileName: 'manual.graph', loadMode: 'replace' }
    );

    let manualSettled = false;
    manualPromise.finally(() => { manualSettled = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(manualApply).toHaveBeenCalledTimes(1);
    expect(manualSettled).toBe(false);
    manualDeferred.resolve({ targetTabId: 'workspace-1' });
    const manualResult = await manualPromise;

    const recoveryDeferred = deferred();
    const recoveryApply = jest.fn(() => recoveryDeferred.promise);
    const recoveryContext = createContext(recoveryApply);
    const recoveryBlob = new Blob(['recovery'], { type: 'application/zip' });
    recoveryBlob.name = 'recovered.graph';
    const recoveryPromise = window.Main.sessionActions.applyArchiveBlob(
      recoveryContext,
      recoveryBlob,
      { fileName: 'recovered.graph' }
    );

    let recoverySettled = false;
    recoveryPromise.finally(() => { recoverySettled = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(recoveryApply).toHaveBeenCalledTimes(1);
    expect(recoverySettled).toBe(false);
    recoveryDeferred.resolve({ targetTabId: 'workspace-1' });
    const recoveryResult = await recoveryPromise;

    expect(manualApply.mock.calls[0][0]).toEqual(recoveryApply.mock.calls[0][0]);
    expect(manualApply.mock.calls[0][1]).toEqual(expect.objectContaining({
      fileName: 'manual.graph',
      fileScope: 'workspace'
    }));
    expect(recoveryApply.mock.calls[0][1]).toEqual(expect.objectContaining({
      fileName: 'recovered.graph',
      fileScope: 'workspace'
    }));
    expect(manualResult.restoreResult).toEqual({ targetTabId: 'workspace-1' });
    expect(recoveryResult.restoreResult).toEqual({ targetTabId: 'workspace-1' });
  });

  test('document open locks the full application until the active workspace is ready', async () => {
    const parsed = {
      source: 'graph-archive',
      session: {
        scope: 'workspace',
        activeIndex: 1,
        tabs: [
          { title: 'One', type: 'scatter', payload: { type: 'scatter', data: [[1, 2]] } },
          { title: 'Two', type: 'box', payload: { type: 'box', data: [[3, 4]] } }
        ]
      }
    };
    window.Shared.graphArchive.parseFile.mockResolvedValue(parsed);
    const activation = deferred();
    const context = createContext(jest.fn(() => activation.promise));

    const openPromise = window.Main.sessionActions.loadWorkspaceFile(
      context,
      { name: 'analysis.graph' },
      { fileName: 'analysis.graph', loadMode: 'replace' }
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(context.workspaceState.documentOperation).toEqual(expect.objectContaining({
      active: true,
      kind: 'open',
      fileName: 'analysis.graph'
    }));
    expect(document.getElementById('appRoot').inert).toBe(true);
    expect(document.getElementById('appRoot').hasAttribute('aria-hidden')).toBe(false);
    expect(document.getElementById('workspaceTabsDock').inert).toBe(true);
    expect(document.body.getAttribute('aria-busy')).toBe('true');
    expect(document.getElementById('documentOpenTitle').textContent).toBe('Opening “analysis.graph”…');
    expect(document.getElementById('documentOpenDetail').textContent).toBe('Restoring 2 workspaces…');

    activation.resolve({ targetTabId: 'workspace-2' });
    await openPromise;

    expect(context.workspaceState.documentOperation).toBeNull();
    expect(document.getElementById('appRoot').inert).toBe(false);
    expect(document.getElementById('workspaceTabsDock').inert).toBe(false);
    expect(document.body.hasAttribute('aria-busy')).toBe(false);
    expect(document.getElementById('documentOpenOverlay').hidden).toBe(true);
  });

  test('failed open keeps existing metadata and presents a recoverable error', async () => {
    window.Shared.graphArchive.parseFile.mockRejectedValue(new Error('bad archive bytes'));
    const context = createContext(jest.fn());
    context.workspaceState.sessionFileHandle = { name: 'old-handle' };
    context.workspaceState.sessionFileName = 'current.graph';
    context.workspaceState.sessionFileScope = 'workspace';

    await expect(window.Main.sessionActions.loadWorkspaceFile(
      context,
      { name: 'broken.graph' },
      { fileName: 'broken.graph', fileHandle: { name: 'new-handle' }, loadMode: 'replace' }
    )).rejects.toThrow('bad archive bytes');

    expect(context.workspaceState.sessionFileHandle).toEqual({ name: 'old-handle' });
    expect(context.workspaceState.sessionFileName).toBe('current.graph');
    expect(context.workspaceState.sessionFileScope).toBe('workspace');
    expect(document.getElementById('documentOpenTitle').textContent).toBe('Couldn’t open “broken.graph”');
    expect(document.getElementById('documentOpenOverlay').dataset.state).toBe('error');
    expect(context.workspaceState.documentOperation?.active).toBe(true);

    document.querySelector('[data-document-open-action="close"]').click();
    expect(context.workspaceState.documentOperation).toBeNull();
    expect(document.getElementById('appRoot').inert).toBe(false);
  });

  test('picker metadata is committed only after file restoration succeeds', async () => {
    window.Shared.graphArchive.parseFile.mockRejectedValue(new Error('picker parse failed'));
    window.Shared.fileIO = {
      openGraphFile: jest.fn(async options => {
        options.setFileHandle({ name: 'incoming-handle' });
        options.setFileName('incoming.graph');
        await options.loadFromFile({ name: 'incoming.graph' });
        return { status: 'opened' };
      })
    };
    const context = createContext(jest.fn());
    context.sessionFileTypes = [];
    context.workspaceState.sessionFileHandle = { name: 'current-handle' };
    context.workspaceState.sessionFileName = 'current.graph';
    context.workspaceState.sessionFilePath = 'C:/current.graph';
    context.workspaceState.sessionFileScope = 'workspace';

    const result = await window.Main.sessionActions.handleSessionLoadClick(context);

    expect(result.status).toBe('error');
    expect(context.workspaceState.sessionFileHandle).toEqual({ name: 'current-handle' });
    expect(context.workspaceState.sessionFileName).toBe('current.graph');
    expect(context.workspaceState.sessionFilePath).toBe('C:/current.graph');
    document.querySelector('[data-document-open-action="close"]').click();
  });
});
