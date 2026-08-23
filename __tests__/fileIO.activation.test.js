describe('fileIO activation handling', () => {
  let originalActivationDescriptor;
  let originalShowSavePicker;
  let originalShowOpenPicker;
  let originalMain;

  function tabsById(workspaceState, tabId) {
    return workspaceState.tabs.find(tab => tab.id === tabId) || null;
  }

  function setActivation(isActive) {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { isActive: !!isActive }
    });
  }

  function installFileIO() {
    jest.resetModules();
    window.Shared = {};
    require('../js/shared/fileIO.js');
    return window.Shared.fileIO;
  }

  beforeEach(() => {
    originalActivationDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'userActivation');
    originalShowSavePicker = window.showSaveFilePicker;
    originalShowOpenPicker = window.showOpenFilePicker;
    originalMain = window.Main;
  });

  afterEach(() => {
    if (originalActivationDescriptor) {
      Object.defineProperty(window.navigator, 'userActivation', originalActivationDescriptor);
    } else {
      delete window.navigator.userActivation;
    }
    window.showSaveFilePicker = originalShowSavePicker;
    window.showOpenFilePicker = originalShowOpenPicker;
    window.Main = originalMain;
    delete window.Shared;
  });

  test('verifyPermission does not request permission without user activation', async () => {
    setActivation(false);
    const fileIO = installFileIO();
    const handle = {
      queryPermission: jest.fn().mockResolvedValue('prompt'),
      requestPermission: jest.fn().mockResolvedValue('granted')
    };

    const allowed = await fileIO.verifyPermission(handle, true);

    expect(allowed).toBe(false);
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  test('verifyPermission handles activation SecurityError without throwing', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const activationErr = typeof DOMException === 'function'
      ? new DOMException('User activation is required to request permissions.', 'SecurityError')
      : { name: 'SecurityError', message: 'User activation is required to request permissions.' };
    const handle = {
      queryPermission: jest.fn().mockResolvedValue('prompt'),
      requestPermission: jest.fn().mockRejectedValue(activationErr)
    };

    const allowed = await fileIO.verifyPermission(handle, true);

    expect(allowed).toBe(false);
    expect(handle.requestPermission).toHaveBeenCalled();
  });

  test('saveGraphFileAs skips picker and downloads when activation is missing', async () => {
    setActivation(false);
    const fileIO = installFileIO();
    window.showSaveFilePicker = jest.fn();
    const downloadSpy = jest.spyOn(fileIO, 'downloadBlob').mockImplementation(() => {});
    const downloadJsonSpy = jest.spyOn(fileIO, 'downloadJSON').mockImplementation(() => {});

    const result = await fileIO.saveGraphFileAs({
      context: 'workspace',
      payload: new Blob(['zip'], { type: 'application/zip' }),
      fileName: 'workspace.graph',
      downloadFileName: 'workspace.graph',
      mimeType: 'application/zip'
    });

    expect(window.showSaveFilePicker).not.toHaveBeenCalled();
    expect(downloadSpy.mock.calls.length + downloadJsonSpy.mock.calls.length).toBeGreaterThan(0);
    expect(result.status).toBe('downloaded');
    expect(result.via).toBe('download');
  });

  test('saveGraphFileAs falls back to download on picker SecurityError activation failure', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const activationErr = typeof DOMException === 'function'
      ? new DOMException('User activation is required to request permissions.', 'SecurityError')
      : { name: 'SecurityError', message: 'User activation is required to request permissions.' };
    window.showSaveFilePicker = jest.fn().mockRejectedValue(activationErr);
    const downloadSpy = jest.spyOn(fileIO, 'downloadBlob').mockImplementation(() => {});
    const downloadJsonSpy = jest.spyOn(fileIO, 'downloadJSON').mockImplementation(() => {});

    const result = await fileIO.saveGraphFileAs({
      context: 'workspace',
      payload: new Blob(['zip'], { type: 'application/zip' }),
      fileName: 'workspace.graph',
      downloadFileName: 'workspace.graph',
      mimeType: 'application/zip'
    });

    expect(window.showSaveFilePicker).toHaveBeenCalled();
    expect(downloadSpy.mock.calls.length + downloadJsonSpy.mock.calls.length).toBeGreaterThan(0);
    expect(result.status).toBe('downloaded');
    expect(result.via).toBe('download-activation-fallback');
  });

  test('saveGraphFileAs does not build payload when picker is cancelled', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const abortErr = typeof DOMException === 'function'
      ? new DOMException('The user aborted a request.', 'AbortError')
      : { name: 'AbortError', message: 'The user aborted a request.' };
    window.showSaveFilePicker = jest.fn().mockRejectedValue(abortErr);
    const getPayload = jest.fn(() => new Blob(['zip'], { type: 'application/zip' }));

    const result = await fileIO.saveGraphFileAs({
      context: 'workspace',
      getPayload,
      fileName: 'workspace.graph',
      downloadFileName: 'workspace.graph',
      mimeType: 'application/zip'
    });

    expect(window.showSaveFilePicker).toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
  });

  test('openGraphFile carries one immutable owner operation across the picker boundary', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const file = new Blob(['not-json'], { type: 'text/plain' });
    Object.defineProperty(file, 'name', { configurable: true, value: 'owner-check.txt' });
    const handle = { getFile: jest.fn().mockResolvedValue(file) };
    window.showOpenFilePicker = jest.fn().mockResolvedValue([handle]);
    const setFileHandle = jest.fn();
    const setFileName = jest.fn();
    const loadFromFile = jest.fn();

    const result = await fileIO.openGraphFile({
      context: 'box',
      owner: { component: 'box', tabId: 'tab-a' },
      setFileHandle,
      setFileName,
      loadFromFile
    });

    expect(result.status).toBe('opened');
    expect(result.operation).toEqual(expect.objectContaining({
      type: 'graph-file-open',
      component: 'box',
      tabId: 'tab-a'
    }));
    expect(Object.isFrozen(result.operation)).toBe(true);
    expect(setFileHandle).toHaveBeenCalledWith(handle, result.operation);
    expect(setFileName).toHaveBeenCalledWith('owner-check.txt', result.operation);
    expect(loadFromFile).toHaveBeenCalledWith(file, result.operation);
  });

  test('graph open payload commits to its inactive owner instead of applying to the active sibling', () => {
    const fileIO = installFileIO();
    const tabA = { id: 'tab-a', type: 'box', payload: { type: 'box', marker: 'old-a' } };
    const tabB = { id: 'tab-b', type: 'box', payload: { type: 'box', marker: 'old-b' } };
    const workspaceState = { tabs: [tabA, tabB], activeTabId: 'tab-b' };
    const commitTabPayload = jest.fn(() => true);
    window.Main = {
      session: {
        workspaceState,
        getActiveTab: () => tabB,
        commitTabPayload,
        serializePayloadSignature: value => JSON.stringify(value)
      }
    };
    const operation = fileIO.createGraphOpenOperation({
      context: 'box',
      owner: { component: 'box', tabId: 'tab-a' }
    });
    const apply = jest.fn(() => true);
    const payload = { type: 'box', marker: 'opened-a' };

    const result = fileIO.routeGraphOpenPayload({
      context: 'box',
      component: 'box',
      operation,
      payload,
      apply
    });

    expect(result.status).toBe('deferred-owner-payload');
    expect(result.value).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(commitTabPayload).toHaveBeenCalledWith(tabA, payload, expect.objectContaining({
      reason: 'box-graph-file-open',
      origin: 'user'
    }));
  });

  test('graph open payload applies only when its exact owner is active', () => {
    const fileIO = installFileIO();
    const tabA = { id: 'tab-a', type: 'scatter' };
    const tabB = { id: 'tab-b', type: 'scatter' };
    const workspaceState = { tabs: [tabA, tabB], activeTabId: 'tab-a' };
    const commitTabPayload = jest.fn(() => true);
    window.Main = {
      session: {
        workspaceState,
        getActiveTab: () => tabA,
        commitTabPayload
      }
    };
    const operation = fileIO.createGraphOpenOperation({
      context: 'scatter',
      owner: { component: 'scatter', tabId: 'tab-a' }
    });
    const payload = { type: 'scatter', marker: 'owner-a' };
    const apply = jest.fn(() => true);

    const result = fileIO.routeGraphOpenPayload({
      context: 'scatter',
      component: 'scatter',
      operation,
      payload,
      apply
    });

    expect(result.status).toBe('applied-active-owner');
    expect(result.value).toBe(true);
    expect(apply).toHaveBeenCalledWith(payload, operation);
    expect(commitTabPayload).not.toHaveBeenCalled();
  });

  test('graph open payload is discarded if its owner tab was closed', () => {
    const fileIO = installFileIO();
    const tabB = { id: 'tab-b', type: 'surface' };
    window.Main = {
      session: {
        workspaceState: { tabs: [tabB], activeTabId: 'tab-b' },
        getActiveTab: () => tabB,
        commitTabPayload: jest.fn(() => true)
      }
    };
    const operation = fileIO.createGraphOpenOperation({
      context: 'surface',
      owner: { component: 'surface', tabId: 'tab-a' }
    });
    const apply = jest.fn(() => true);

    const result = fileIO.routeGraphOpenPayload({
      context: 'surface',
      component: 'surface',
      operation,
      payload: { type: 'surface' },
      apply
    });

    expect(result.status).toBe('stale-owner');
    expect(result.value).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(window.Main.session.commitTabPayload).not.toHaveBeenCalled();
  });

  test('older graph open completion cannot overwrite a newer open for the same owner', () => {
    const fileIO = installFileIO();
    const tabA = { id: 'tab-a', type: 'line' };
    window.Main = {
      session: {
        workspaceState: { tabs: [tabA], activeTabId: 'tab-a' },
        getActiveTab: () => tabA,
        commitTabPayload: jest.fn(() => true)
      }
    };
    const first = fileIO.createGraphOpenOperation({ context: 'line', owner: { component: 'line', tabId: 'tab-a' } });
    const second = fileIO.createGraphOpenOperation({ context: 'line', owner: { component: 'line', tabId: 'tab-a' } });
    const apply = jest.fn(() => true);

    const stale = fileIO.routeGraphOpenPayload({
      context: 'line',
      component: 'line',
      operation: first,
      payload: { type: 'line', marker: 'old' },
      apply
    });
    const current = fileIO.routeGraphOpenPayload({
      context: 'line',
      component: 'line',
      operation: second,
      payload: { type: 'line', marker: 'new' },
      apply
    });

    expect(stale.status).toBe('stale-operation');
    expect(stale.value).toBe(false);
    expect(current.status).toBe('applied-active-owner');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ marker: 'new' }), second);
  });

  test('graph open rejects a payload whose component type does not match the owner', () => {
    const fileIO = installFileIO();
    const tabA = { id: 'tab-a', type: 'roc' };
    window.Main = {
      session: {
        workspaceState: { tabs: [tabA], activeTabId: 'tab-a' },
        getActiveTab: () => tabA,
        commitTabPayload: jest.fn(() => true)
      }
    };
    const operation = fileIO.createGraphOpenOperation({ context: 'roc', owner: { component: 'roc', tabId: 'tab-a' } });
    const apply = jest.fn(() => true);

    const result = fileIO.routeGraphOpenPayload({
      context: 'roc',
      component: 'roc',
      operation,
      payload: { type: 'box' },
      apply
    });

    expect(result.status).toBe('payload-type-mismatch');
    expect(result.value).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  test('inactive graph open stages saved sizing into the owning tab layout and invalidates its loaded-workspace marker', () => {
    const fileIO = installFileIO();
    const tabA = {
      id: 'tab-a',
      type: 'box',
      payload: { type: 'box', marker: 'old-a' },
      layoutState: { version: 1, svgBox: { style: { width: '400px', height: '400px' }, dataset: {} } },
      layoutSignature: 'old-layout',
      layoutVersion: 2
    };
    const tabB = { id: 'tab-b', type: 'box', payload: { type: 'box', marker: 'old-b' } };
    const workspaceState = {
      tabs: [tabA, tabB],
      activeTabId: 'tab-b',
      loadedWorkspaces: { 'tab-a': { tabId: 'tab-a', type: 'box' } }
    };
    const payload = {
      type: 'box',
      marker: 'opened-a',
      meta: { graphSizing: { display: { widthPx: 720, heightPx: 510 } } }
    };
    const mergedLayout = {
      version: 1,
      svgBox: { style: { width: '720px', height: '510px' }, dataset: { graphWidthPx: '720', graphHeightPx: '510' } }
    };
    const commitTabPayload = jest.fn((_tab, nextPayload) => {
      tabA.payload = nextPayload;
      tabA.payloadSignature = JSON.stringify(nextPayload);
      return true;
    });
    const clearTabRenderCache = jest.fn();
    const clearTabArchiveRenderCache = jest.fn();
    window.Main = {
      session: {
        workspaceState,
        getActiveTab: () => tabB,
        commitTabPayload,
        serializePayloadSignature: value => JSON.stringify(value),
        clearTabRenderCache,
        clearTabArchiveRenderCache
      }
    };
    window.Shared.graphSizing = {
      mergePayloadSizingIntoLayout: jest.fn(() => mergedLayout)
    };
    const operation = fileIO.createGraphOpenOperation({
      context: 'box',
      owner: { component: 'box', tabId: 'tab-a' }
    });

    const result = fileIO.routeGraphOpenPayload({
      context: 'box',
      component: 'box',
      operation,
      payload,
      apply: jest.fn(() => true)
    });

    expect(result.status).toBe('deferred-owner-payload');
    expect(result.value).toBe(true);
    expect(window.Shared.graphSizing.mergePayloadSizingIntoLayout).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1 }),
      payload,
      expect.objectContaining({ preferPayload: true })
    );
    expect(tabA.layoutState).toBe(mergedLayout);
    expect(tabA.layoutSignature).toBe(JSON.stringify(mergedLayout));
    expect(tabA.layoutVersion).toBe(3);
    expect(workspaceState.loadedWorkspaces['tab-a']).toBeUndefined();
    expect(clearTabRenderCache).toHaveBeenCalledWith(tabA, expect.objectContaining({ reason: expect.stringContaining('layout-changed') }));
    expect(clearTabArchiveRenderCache).toHaveBeenCalledWith(tabA, expect.objectContaining({ reason: expect.stringContaining('layout-changed') }));
  });

  test('an obsolete graph open cannot mutate owner metadata after a newer open starts', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const tabA = { id: 'tab-a', type: 'box' };
    window.Main = {
      session: {
        workspaceState: { tabs: [tabA], activeTabId: 'tab-a' },
        getActiveTab: () => tabA
      }
    };
    let resolvePicker = null;
    window.showOpenFilePicker = jest.fn(() => new Promise(resolve => { resolvePicker = resolve; }));
    const file = new Blob(['{}'], { type: 'application/json' });
    Object.defineProperty(file, 'name', { configurable: true, value: 'first.graph' });
    const handle = { getFile: jest.fn().mockResolvedValue(file) };
    const setFileHandle = jest.fn();
    const setFileName = jest.fn();
    const loadFromFile = jest.fn();

    const pending = fileIO.openGraphFile({
      context: 'box',
      owner: { component: 'box', tabId: 'tab-a' },
      setFileHandle,
      setFileName,
      loadFromFile
    });
    await Promise.resolve();
    expect(resolvePicker).toEqual(expect.any(Function));

    fileIO.createGraphOpenOperation({
      context: 'box',
      owner: { component: 'box', tabId: 'tab-a' }
    });
    resolvePicker([handle]);

    const result = await pending;
    expect(result.status).toBe('stale-operation');
    expect(handle.getFile).not.toHaveBeenCalled();
    expect(setFileHandle).not.toHaveBeenCalled();
    expect(setFileName).not.toHaveBeenCalled();
    expect(loadFromFile).not.toHaveBeenCalled();
  });

  test('owner-scoped graph sizing never falls back to a sibling tab element after open', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const tabA = { id: 'tab-a', type: 'box' };
    const tabB = { id: 'tab-b', type: 'box' };
    const workspaceState = { tabs: [tabA, tabB], activeTabId: 'tab-a' };
    window.Main = {
      session: {
        workspaceState,
        getActiveTab: () => tabsById(workspaceState, workspaceState.activeTabId)
      }
    };
    const rootA = document.createElement('div');
    const svgA = document.createElement('div');
    svgA.className = 'svgbox';
    rootA.appendChild(svgA);
    const applyPayloadSizingForType = jest.fn();
    window.Shared.workspaceTabs = {
      getMountedRoot: jest.fn(tab => tab?.id === 'tab-a' ? rootA : null),
      getSessionRecord: jest.fn((tabId, type) => (
        String(tabId || '') === 'tab-a' && type === 'box' ? { generation: 5 } : null
      ))
    };
    window.Shared.graphSizing = { applyPayloadSizingForType };
    const payload = { type: 'box', meta: { graphSizing: { display: { widthPx: 600, heightPx: 420 } } } };
    const file = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    Object.defineProperty(file, 'name', { configurable: true, value: 'owner.graph' });
    // Jest/jsdom's Blob does not consistently expose the browser-standard text() API.
    // Provide it explicitly so this fixture exercises the real JSON-probe/sizing path.
    const fileText = jest.fn().mockResolvedValue(JSON.stringify(payload));
    Object.defineProperty(file, 'text', { configurable: true, value: fileText });
    const handle = { getFile: jest.fn().mockResolvedValue(file) };
    window.showOpenFilePicker = jest.fn().mockResolvedValue([handle]);

    const result = await fileIO.openGraphFile({
      context: 'box',
      owner: { component: 'box', tabId: 'tab-a' },
      loadFromFile: jest.fn()
    });

    expect(result.status).toBe('opened');
    expect(fileText).toHaveBeenCalledTimes(1);
    expect(applyPayloadSizingForType).toHaveBeenCalledWith('box', payload, expect.objectContaining({
      tabId: 'tab-a',
      sessionGeneration: 5,
      element: svgA,
      isCurrent: expect.any(Function)
    }));

    const sizingOptions = applyPayloadSizingForType.mock.calls[0][2];
    workspaceState.activeTabId = 'tab-b';
    expect(sizingOptions.isCurrent()).toBe(true);

    fileIO.createGraphOpenOperation({
      context: 'box',
      owner: { component: 'box', tabId: 'tab-a' }
    });
    expect(sizingOptions.isCurrent()).toBe(false);
  });

  test('save-as resolves payload and sizing from its initiating owner after a sibling tab switch', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const tabA = {
      id: 'tab-a',
      type: 'box',
      payload: { type: 'box', marker: 'owner-a' },
      layoutState: { version: 1, svgBox: { style: { width: '510px', height: '420px' }, dataset: {} } }
    };
    const tabB = {
      id: 'tab-b',
      type: 'box',
      payload: { type: 'box', marker: 'owner-b' },
      layoutState: { version: 1, svgBox: { style: { width: '900px', height: '700px' }, dataset: {} } }
    };
    const workspaceState = { tabs: [tabA, tabB], activeTabId: 'tab-a' };
    window.Main = {
      session: {
        workspaceState,
        getActiveTab: () => tabsById(workspaceState, workspaceState.activeTabId)
      }
    };
    window.Shared.graphSizing = {
      enrichPayloadForType: jest.fn((_type, payload, options) => ({
        ...payload,
        capturedLayoutWidth: options.layoutState?.svgBox?.style?.width || null
      }))
    };
    let resolvePicker = null;
    const writable = { write: jest.fn().mockResolvedValue(), close: jest.fn().mockResolvedValue() };
    const handle = {
      name: 'saved.graph',
      createWritable: jest.fn().mockResolvedValue(writable)
    };
    window.showSaveFilePicker = jest.fn(() => new Promise(resolve => { resolvePicker = resolve; }));
    const getPayload = jest.fn(() => ({ type: 'box', marker: 'active-projection' }));

    const pending = fileIO.saveGraphFileAs({
      context: 'box',
      getPayload,
      fileName: 'box.graph'
    });
    await Promise.resolve();
    expect(resolvePicker).toEqual(expect.any(Function));

    workspaceState.activeTabId = 'tab-b';
    resolvePicker(handle);
    const result = await pending;

    expect(result.status).toBe('saved');
    expect(result.operation).toEqual(expect.objectContaining({
      type: 'graph-file-save',
      component: 'box',
      tabId: 'tab-a'
    }));
    expect(getPayload).not.toHaveBeenCalled();
    expect(window.Shared.graphSizing.enrichPayloadForType).toHaveBeenCalledWith(
      'box',
      tabA.payload,
      expect.objectContaining({ layoutState: tabA.layoutState, tabId: 'tab-a' })
    );
    expect(result.payload).toEqual(expect.objectContaining({
      marker: 'owner-a',
      capturedLayoutWidth: '510px'
    }));
    expect(writable.write).toHaveBeenCalled();
  });

  test('saveGraphFile does not build payload when picker is cancelled', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const abortErr = typeof DOMException === 'function'
      ? new DOMException('The user aborted a request.', 'AbortError')
      : { name: 'AbortError', message: 'The user aborted a request.' };
    window.showSaveFilePicker = jest.fn().mockRejectedValue(abortErr);
    const getPayload = jest.fn(() => new Blob(['zip'], { type: 'application/zip' }));

    const result = await fileIO.saveGraphFile({
      context: 'workspace',
      getPayload,
      fileName: 'workspace.graph',
      downloadFileName: 'workspace.graph',
      mimeType: 'application/zip'
    });

    expect(window.showSaveFilePicker).toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
    expect(result.via).toBe('picker');
  });
});
