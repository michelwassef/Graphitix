describe('sessionActions shared archive restore transaction', () => {
  beforeEach(() => {
    jest.resetModules();
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
      { fileName: 'manual.graph', loadMode: 'replace', skipWarmup: true }
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
      { fileName: 'recovered.graph', skipWarmup: true }
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
});
