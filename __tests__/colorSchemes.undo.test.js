const clone = value => JSON.parse(JSON.stringify(value));

describe('color scheme undo', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    document.body.innerHTML = `
      <div id="linePage">
        <div class="config-panel"></div>
        <div id="lineGraphPanel"><div class="svgbox"></div></div>
      </div>
    `;
  });

  test('restores manual colors that preceded a scheme change', () => {
    const customPayload = {
      type: 'line',
      data: [['X', 'Series 1']],
      config: {
        colorScheme: 'scientific',
        colors: ['#123456'],
        labelColors: { 'Series 1': '#654321' },
        axisColor: '#abcdef'
      }
    };
    const tab = {
      id: 'line-tab',
      type: 'line',
      payload: {
        ...clone(customPayload),
        config: {
          ...clone(customPayload.config),
          colors: ['#0000ff'],
          labelColors: { 'Series 1': '#0000ff' },
          axisColor: '#000000'
        }
      },
      sharedState: { runtime: {}, resources: {}, styles: {}, metadata: {} }
    };
    let livePayload = clone(customPayload);
    const workspace = {
      getPayload: jest.fn(() => clone(livePayload)),
      loadFromPayload: jest.fn(payload => {
        livePayload = clone(payload);
      }),
      applyLayoutState: jest.fn(),
      draw: jest.fn()
    };
    const session = {
      workspaceState: { tabs: [tab] },
      getActiveTab: jest.fn(() => tab),
      persistActiveTabState: jest.fn(),
      commitTabPayload: jest.fn((owner, payload) => {
        owner.payload = clone(payload);
      }),
      assignTabPayload: jest.fn((owner, payload) => {
        owner.payload = clone(payload);
      }),
      markTabUserModified: jest.fn()
    };
    window.Main = {
      session,
      components: {
        get: jest.fn(() => workspace),
        registry: { line: workspace }
      },
      domControls: {
        applyWorkspacePayload: jest.fn()
      },
      tabs: {
        renderTabs: jest.fn()
      }
    };

    require('../js/shared/undo.js');
    require('../js/shared/colorSchemes.js');
    window.Shared.colorSchemes.init();

    const select = document.querySelector('#lineColorSchemeSelect');
    expect(select.getAttribute('data-undo-ignore')).toBe('1');

    select.value = 'dark';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const choice = document.querySelector('[data-color-scheme-choice="1"]');
    expect(choice.hidden).toBe(false);
    expect(tab.payload.config.colorScheme).toBe('scientific');
    choice.querySelector('[data-color-scheme-choice-action="match"]').click();
    expect(tab.payload.config.colorScheme).toBe('dark');
    expect(session.persistActiveTabState).not.toHaveBeenCalled();

    expect(window.Shared.undoManager.undo({ tabId: tab.id })).toBe(true);
    expect(tab.payload.config).toEqual(customPayload.config);
    expect(workspace.applyLayoutState).not.toHaveBeenCalled();

    expect(window.Shared.undoManager.redo({ tabId: tab.id })).toBe(true);
    expect(tab.payload.config.colorScheme).toBe('dark');
    expect(workspace.applyLayoutState).not.toHaveBeenCalled();
    workspace.loadFromPayload.mock.calls.forEach(([, options]) => {
      expect(options).toEqual(expect.objectContaining({
        colorSchemeOnly: true,
        styleOnly: true,
        skipDataLoad: true,
        skipPayloadSizing: true
      }));
    });
    expect(window.Main.domControls.applyWorkspacePayload).not.toHaveBeenCalled();
  });
});
