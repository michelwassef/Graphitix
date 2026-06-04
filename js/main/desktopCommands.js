(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  const namespace = Main.desktopCommands = Main.desktopCommands || {};

  const IMPORT_BUTTON_IDS = {
    box: 'boxImport',
    scatter: 'scatterImport',
    pca: 'pcaImport',
    line: 'lineImport',
    heatmap: 'heatmapImport',
    surface: 'surfaceImport',
    roc: 'rocImport',
    survival: 'survivalImport',
    hist: 'histImport',
    pie: 'pieImport'
  };

  const EXAMPLE_BUTTON_IDS = {
    venn: 'sample',
    box: 'boxLoadExample',
    scatter: 'scatterLoadExample',
    pca: 'pcaLoadExample',
    line: 'lineLoadExample',
    heatmap: 'heatmapLoadExample',
    surface: 'surfaceLoadExample',
    roc: 'rocLoadExample',
    survival: 'survivalLoadExample',
    hist: 'histLoadExample',
    pie: 'pieLoadExample'
  };

  let state = null;
  let bridgeCleanup = null;

  function debug(message, payload) {
    if (typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('Debug: desktopCommands.' + message, payload || {});
    }
  }

  function normalizeCommand(input) {
    if (typeof input === 'string') {
      return input.trim();
    }
    if (input && typeof input === 'object') {
      return String(input.command || '').trim();
    }
    return '';
  }

  function getSession() {
    return state?.session || Main.session || null;
  }

  function getTabsManager() {
    return state?.tabsManager || Main.tabs || null;
  }

  function getSessionActionsContext() {
    if (typeof state?.getSessionActionsContext === 'function') {
      return state.getSessionActionsContext();
    }
    const tabsManager = getTabsManager();
    if (typeof tabsManager?.getSessionActionsContext === 'function') {
      return tabsManager.getSessionActionsContext();
    }
    return {};
  }

  function getActiveTab() {
    const session = getSession();
    if (typeof session?.getActiveTab === 'function') {
      return session.getActiveTab();
    }
    const workspaceState = session?.workspaceState || state?.workspaceState || null;
    const activeId = workspaceState?.activeTabId || null;
    const tabs = Array.isArray(workspaceState?.tabs) ? workspaceState.tabs : [];
    return tabs.find(tab => tab && tab.id === activeId) || null;
  }

  function getActiveGraphTab() {
    const tab = getActiveTab();
    if (!tab || tab.isWelcome || !tab.type) {
      return null;
    }
    return tab;
  }

  function queryById(root, id) {
    if (!root || !id || typeof root.querySelector !== 'function') {
      return null;
    }
    return root.querySelector(`[id="${String(id).replace(/"/g, '\\"')}"]`);
  }

  function getActiveComponentRoot(tab) {
    const type = tab?.type || '';
    const workspaceTabs = Shared.workspaceTabs || {};
    const mountedRoot = typeof workspaceTabs.getMountedRoot === 'function'
      ? workspaceTabs.getMountedRoot(tab, type)
      : null;
    if (mountedRoot && typeof mountedRoot.querySelector === 'function') {
      return mountedRoot;
    }
    const workspaces = state?.workspaces || Main.components?.registry || {};
    const element = workspaces[type]?.element || null;
    if (element && typeof element.querySelector === 'function') {
      return element;
    }
    return null;
  }

  function isButtonUnavailable(button) {
    return !button
      || button.disabled
      || button.getAttribute?.('aria-disabled') === 'true'
      || button.dataset?.commandDisabled === '1';
  }

  function invokeActiveToolbarButton(idByType, commandName) {
    const tab = getActiveGraphTab();
    if (!tab) {
      debug('toolbarButtonSkipped', { command: commandName, reason: 'no-active-graph-tab' });
      return { status: 'skipped', command: commandName, reason: 'no-active-graph-tab' };
    }
    const id = idByType[tab.type] || '';
    if (!id) {
      debug('toolbarButtonSkipped', { command: commandName, type: tab.type, reason: 'unsupported-active-type' });
      return { status: 'unsupported', command: commandName, type: tab.type };
    }
    const root = getActiveComponentRoot(tab);
    const button = queryById(root, id);
    if (isButtonUnavailable(button)) {
      debug('toolbarButtonSkipped', { command: commandName, type: tab.type, id, reason: 'button-unavailable' });
      return { status: 'skipped', command: commandName, type: tab.type, reason: 'button-unavailable' };
    }
    button.click();
    debug('toolbarButtonInvoked', { command: commandName, type: tab.type, id });
    return { status: 'sent', command: commandName, type: tab.type, id };
  }

  function activateToolbarSection(sectionLabel, commandName) {
    const tab = getActiveGraphTab();
    if (!tab) {
      return { status: 'skipped', command: commandName, reason: 'no-active-graph-tab' };
    }
    const toolbar = Shared.workspaceToolbar || {};
    if (typeof toolbar.activateSection !== 'function') {
      return { status: 'skipped', command: commandName, reason: 'toolbar-api-unavailable' };
    }
    const activated = !!toolbar.activateSection(tab.type, sectionLabel);
    return {
      status: activated ? 'activated' : 'skipped',
      command: commandName,
      type: tab.type,
      section: sectionLabel,
      reason: activated ? undefined : 'section-unavailable'
    };
  }

  function invokeUndo(commandName) {
    const tab = getActiveGraphTab();
    const manager = Shared.undoManager || {};
    const methodName = commandName === 'redo' ? 'redo' : 'undo';
    if (typeof manager[methodName] !== 'function') {
      return { status: 'skipped', command: commandName, reason: 'undo-manager-unavailable' };
    }
    const handled = !!manager[methodName]({
      tabId: tab?.id || '',
      target: document.activeElement || null
    });
    return { status: handled ? 'handled' : 'skipped', command: commandName, tabId: tab?.id || null };
  }

  async function execute(commandInput, payload = {}) {
    const command = normalizeCommand(commandInput);
    debug('execute', { command, payload });

    if (command === 'newTab') {
      const tabsManager = getTabsManager();
      if (typeof tabsManager?.handleAddTabClick === 'function') {
        tabsManager.handleAddTabClick();
        return { status: 'handled', command };
      }
      return { status: 'skipped', command, reason: 'tabs-manager-unavailable' };
    }

    if (command === 'closeTab') {
      const tab = getActiveGraphTab();
      const tabsManager = getTabsManager();
      if (!tab) {
        return { status: 'skipped', command, reason: 'no-active-graph-tab' };
      }
      if (typeof tabsManager?.closeTab === 'function') {
        tabsManager.closeTab(tab.id, { reason: 'desktop-menu-close-tab' });
        return { status: 'handled', command, tabId: tab.id };
      }
      return { status: 'skipped', command, reason: 'tabs-manager-unavailable' };
    }

    if (command === 'openWorkspace') {
      if (typeof state?.handleSessionLoadClick === 'function') {
        return state.handleSessionLoadClick({ reason: 'desktop-menu-open' });
      }
      const sessionActions = state?.sessionActions || Main.sessionActions || {};
      if (typeof sessionActions.handleSessionLoadClick === 'function') {
        return sessionActions.handleSessionLoadClick(getSessionActionsContext(), { reason: 'desktop-menu-open' });
      }
      return { status: 'skipped', command, reason: 'load-handler-unavailable' };
    }

    if (command === 'saveWorkspace' || command === 'saveWorkspaceAs') {
      const forcePicker = command === 'saveWorkspaceAs';
      const reason = forcePicker ? 'desktop-menu-save-as' : 'desktop-menu-save';
      if (typeof state?.handleSessionSaveClick === 'function') {
        return state.handleSessionSaveClick({ reason, scope: 'workspace', forcePicker });
      }
      const sessionActions = state?.sessionActions || Main.sessionActions || {};
      if (typeof sessionActions.handleSessionSaveClick === 'function') {
        return sessionActions.handleSessionSaveClick(getSessionActionsContext(), { reason, scope: 'workspace', forcePicker });
      }
      return { status: 'skipped', command, reason: 'save-handler-unavailable' };
    }

    if (command === 'importData') {
      return invokeActiveToolbarButton(IMPORT_BUTTON_IDS, command);
    }

    if (command === 'loadExampleData') {
      return invokeActiveToolbarButton(EXAMPLE_BUTTON_IDS, command);
    }

    if (command === 'matchStyles') {
      if (typeof state?.styleSyncApi?.handleMatchStylesClick === 'function') {
        state.styleSyncApi.handleMatchStylesClick();
        return { status: 'handled', command };
      }
      return { status: 'skipped', command, reason: 'style-sync-unavailable' };
    }

    if (command === 'undo' || command === 'redo') {
      return invokeUndo(command);
    }

    if (command === 'showParameters' || command === 'showGeneralControls') {
      return activateToolbarSection('General', command);
    }

    if (command === 'showDataControls') {
      return activateToolbarSection('Data', command);
    }

    if (command === 'showFormatControls') {
      return activateToolbarSection('Format', command);
    }

    debug('unknownCommand', { command });
    return { status: 'skipped', command, reason: 'unknown-command' };
  }

  function init(options = {}) {
    state = {
      session: options.session || Main.session || null,
      workspaceState: options.workspaceState || options.session?.workspaceState || Main.session?.workspaceState || null,
      tabsManager: options.tabsManager || Main.tabs || null,
      sessionActions: options.sessionActions || Main.sessionActions || null,
      workspaces: options.workspaces || Main.components?.registry || {},
      styleSyncApi: options.styleSyncApi || null,
      getSessionActionsContext: options.getSessionActionsContext || null,
      handleSessionSaveClick: options.handleSessionSaveClick || null,
      handleSessionLoadClick: options.handleSessionLoadClick || null
    };

    namespace.execute = execute;

    if (bridgeCleanup) {
      bridgeCleanup();
      bridgeCleanup = null;
    }
    const desktop = window.desktop;
    if (desktop?.isDesktop && typeof desktop.onMenuCommand === 'function') {
      bridgeCleanup = desktop.onMenuCommand(payload => {
        execute(payload).catch(err => {
          console.error('desktop menu command error', { payload, err });
        });
      });
      debug('bridgeRegistered');
    }

    return namespace;
  }

  namespace.init = init;
  namespace.execute = execute;
})();
