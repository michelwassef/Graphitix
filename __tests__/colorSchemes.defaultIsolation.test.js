const deepClone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));

describe('color scheme default isolation', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="linePage">
        <div class="config-panel"></div>
        <div id="lineGraphPanel"><div class="svgbox"></div></div>
      </div>
    `;
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('applying a theme to one line tab cannot mutate defaults for new line tabs', () => {
    let activeTab = {
      id: 'workspace-1',
      type: 'line',
      payload: {
        type: 'line',
        data: [['X title', 'Series 1']],
        config: {
          colorScheme: 'scientific',
          title: 'Line & Area Charts',
          colors: ['#0000ff'],
          labelColors: { 'Series 1': '#0000ff' }
        }
      }
    };

    const setWorkspaceDefaultPayload = jest.fn();
    const lineWorkspace = {
      createEmptyPayload: jest.fn(() => ({
        type: 'line',
        data: [['X title', 'Series 1']],
        config: {
          colorScheme: 'scientific',
          title: 'Line & Area Charts',
          colors: ['#0000ff'],
          labelColors: { 'Series 1': '#0000ff' }
        }
      })),
      getPayload: jest.fn(() => deepClone(activeTab.payload))
    };

    window.Main = {
      session: {
        getActiveTab: jest.fn(() => activeTab),
        persistActiveTabState: jest.fn(),
        assignTabPayload: jest.fn((tab, payload) => {
          tab.payload = deepClone(payload);
        }),
        markSessionDirty: jest.fn()
      },
      domControls: {
        setWorkspaceDefaultPayload,
        applyWorkspacePayload: jest.fn()
      },
      components: {
        get: jest.fn(type => (type === 'line' ? lineWorkspace : null))
      }
    };

    require('../js/shared/colorSchemes.js');
    const schemes = window.Shared?.colorSchemes;
    expect(schemes?.applyToActiveTab).toBeTruthy();

    expect(schemes.applyToActiveTab('line', 'dark')).toBe(true);
    expect(activeTab.payload?.config?.colorScheme).toBe('dark');
    expect(setWorkspaceDefaultPayload).not.toHaveBeenCalled();
    expect(lineWorkspace.createEmptyPayload).not.toHaveBeenCalled();

    activeTab = {
      id: 'workspace-2',
      type: 'line',
      payload: {
        type: 'line',
        data: [['X title', 'Series 1']],
        config: {}
      }
    };

    expect(schemes.getSelectedSchemeId('line')).toBe('scientific');
  });

  test('workspace payload fallback propagates explicit tab ownership metadata', () => {
    const activeTab = {
      id: 'workspace-meta-line',
      type: 'line',
      payload: null
    };
    const lineWorkspace = {
      createEmptyPayload: jest.fn(() => ({ type: 'line', config: { colorScheme: 'scientific' } })),
      getPayload: jest.fn(() => ({ type: 'line', config: { colorScheme: 'scientific' } }))
    };

    window.Main = {
      session: {
        getActiveTab: jest.fn(() => activeTab),
        persistActiveTabState: jest.fn(),
        assignTabPayload: jest.fn((tab, payload) => {
          tab.payload = deepClone(payload);
        }),
        markSessionDirty: jest.fn()
      },
      domControls: {
        setWorkspaceDefaultPayload: jest.fn(),
        applyWorkspacePayload: jest.fn()
      },
      components: {
        get: jest.fn(type => (type === 'line' ? lineWorkspace : null))
      }
    };

    require('../js/shared/colorSchemes.js');
    const schemes = window.Shared?.colorSchemes;
    expect(schemes.applyToActiveTab('line', 'dark')).toBe(true);
    expect(lineWorkspace.getPayload).toHaveBeenCalled();
    const [metaArg] = lineWorkspace.getPayload.mock.calls.at(-1) || [];
    expect(metaArg).toEqual(expect.objectContaining({
      tabId: 'workspace-meta-line',
      type: 'line',
      origin: 'colorSchemes'
    }));
    expect(String(metaArg.reason || '')).toContain('color-scheme-source-line');
  });
});
