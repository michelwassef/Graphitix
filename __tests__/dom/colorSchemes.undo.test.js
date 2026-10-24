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
      payload: clone(customPayload),
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

    require('../../js/shared/undo.js');
    require('../../js/shared/colorSchemes.js');
    window.Shared.colorSchemes.init();

    const select = document.querySelector('#lineColorSchemeSelect');
    expect(select.getAttribute('data-undo-ignore')).toBe('1');

    const appearance = document.querySelector('#lineColorAppearanceSelect');
    appearance.value = 'dark';
    appearance.dispatchEvent(new Event('change', { bubbles: true }));
    expect(tab.payload.config.colorScheme).toBe('scientific-dark');
    expect(tab.payload.config.labelColors['Series 1']).toBe('#654321');
    expect(session.persistActiveTabState).toHaveBeenCalledWith(tab, expect.objectContaining({
      snapshotIntent: expect.objectContaining({ captureLivePayload: true, allowSkipLivePayloadCapture: false })
    }));

    expect(window.Shared.undoManager.undo({ tabId: tab.id })).toBe(true);
    expect(tab.payload.config).toEqual(customPayload.config);
    expect(workspace.applyLayoutState).not.toHaveBeenCalled();
    expect(workspace.getPayload).not.toHaveBeenCalled();

    expect(window.Shared.undoManager.redo({ tabId: tab.id })).toBe(true);
    expect(tab.payload.config.colorScheme).toBe('scientific-dark');
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

    // A retained control from a deactivated owner cannot change its sibling.
    document.getElementById('linePage').dataset.workspaceTabId = tab.id;
    const sibling = { ...tab, id: 'line-sibling', payload: clone(customPayload) };
    session.workspaceState.tabs.push(sibling);
    session.getActiveTab.mockReturnValue(sibling);
    const siblingBefore = JSON.stringify(sibling.payload);
    appearance.value = 'light';
    appearance.dispatchEvent(new Event('change', { bubbles: true }));
    expect(JSON.stringify(sibling.payload)).toBe(siblingBefore);
    expect(tab.payload.config.colorScheme).toBe('scientific-dark');
  });
});
