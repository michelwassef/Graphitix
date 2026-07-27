describe('workspace tab document-operation lock', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="tabs"></div>';
    window.Main = {};
    require('../js/main/tabs/render.js');
    require('../js/main/tabDrag.js');
  });

  afterEach(() => {
    delete window.Main;
  });

  test('rendered tabs are disabled and cannot activate while a document opens', () => {
    const tab = {
      id: 'workspace-1',
      title: 'Scatter',
      type: 'scatter',
      isWelcome: false,
      allowClose: true,
      isRenaming: false
    };
    const workspaceState = {
      tabs: [tab],
      activeTabId: tab.id,
      documentOperation: { active: true, token: 'open-1' }
    };
    const activateTab = jest.fn();
    const dom = { tabsList: document.getElementById('tabs') };
    const helpers = window.Main.tabs.createRenderHelpers({
      dom,
      previews: {},
      workspaceState,
      session: {
        generateUniqueTabTitle: title => title,
        markSessionDirty: jest.fn()
      },
      getTabById: id => id === tab.id ? tab : null,
      isInteractionLocked: () => workspaceState.documentOperation?.active === true,
      activateTab,
      applyTabDragClasses: jest.fn(),
      dragHandlers: {}
    });

    helpers.renderTabs();
    const button = dom.tabsList.querySelector('.workspace-tab');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.draggable).toBe(false);
    button.click();
    expect(activateTab).not.toHaveBeenCalled();

    workspaceState.documentOperation = null;
    helpers.renderTabs();
    const enabledButton = dom.tabsList.querySelector('.workspace-tab');
    expect(enabledButton.disabled).toBe(false);
    enabledButton.click();
    expect(activateTab).toHaveBeenCalledWith(tab.id);
  });

  test('tab reordering is rejected at the mutation boundary', () => {
    const workspaceState = {
      tabs: [{ id: 'a' }, { id: 'b' }],
      documentOperation: { active: true, token: 'open-1' }
    };

    const result = window.Main.tabDrag.moveWorkspaceTab({ workspaceState }, 'a', 2);

    expect(result).toEqual(expect.objectContaining({
      moved: false,
      reason: 'document-operation'
    }));
    expect(workspaceState.tabs.map(tab => tab.id)).toEqual(['a', 'b']);
  });

  test('active boundaries are projected explicitly after the document lock clears', () => {
    const tabs = [
      { id: 'workspace-1', title: 'First', type: 'box', allowClose: true },
      { id: 'workspace-2', title: 'Restored active', type: 'box', allowClose: true },
      { id: 'workspace-3', title: 'Last', type: 'roc', allowClose: true }
    ];
    const workspaceState = {
      tabs,
      activeTabId: tabs[1].id,
      documentOperation: { active: true, token: 'open-2' }
    };
    const dom = { tabsList: document.getElementById('tabs') };
    const helpers = window.Main.tabs.createRenderHelpers({
      dom,
      previews: {},
      workspaceState,
      session: {
        generateUniqueTabTitle: title => title,
        markSessionDirty: jest.fn()
      },
      getTabById: id => tabs.find(tab => tab.id === id) || null,
      isInteractionLocked: () => workspaceState.documentOperation?.active === true,
      activateTab: jest.fn(),
      applyTabDragClasses: jest.fn(),
      dragHandlers: {}
    });

    helpers.renderTabs();
    workspaceState.documentOperation = null;
    helpers.renderTabs();

    const buttons = Array.from(dom.tabsList.querySelectorAll('.workspace-tab'));
    expect(buttons[0].classList.contains('is-before-active')).toBe(true);
    expect(buttons[1].classList.contains('is-active')).toBe(true);
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(buttons[2].classList.contains('is-before-active')).toBe(false);
  });
});
