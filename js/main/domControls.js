(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const namespace = Main.domControls = Main.domControls || {};

  const moduleState = {
    appHeaderVisible: true,
    workspaceDefaults: {},
    workspaceLayoutDefaults: {}
  };

  namespace.createDomHandles = function createDomHandles() {
    const handles = {
      appHeader: document.getElementById('appHeader'),
      welcomeScreen: document.getElementById('welcomeScreen'),
      workspacePages: document.getElementById('workspacePages'),
      selectionGrid: document.getElementById('graphSelectionGrid'),
      tabsList: document.getElementById('workspaceTabsList'),
      addTabBtn: document.getElementById('addWorkspaceTab'),
      sessionSaveBtn: document.getElementById('saveWorkspaceSession'),
      sessionLoadBtn: document.getElementById('loadWorkspaceSession'),
      matchStylesBtn: document.getElementById('matchWorkspaceStyles'),
      sessionFileInput: document.getElementById('workspaceSessionInput'),
      duplicatePrompt: document.getElementById('duplicatePrompt'),
      duplicateTitle: document.getElementById('duplicatePromptTitle'),
      duplicateMessage: document.getElementById('duplicatePromptMessage'),
      duplicateReuse: document.getElementById('duplicateReuse'),
      duplicateEmpty: document.getElementById('duplicateEmpty'),
      duplicateCancel: document.getElementById('duplicateCancel'),
      unsavedPrompt: document.getElementById('unsavedPrompt'),
      unsavedTitle: document.getElementById('unsavedPromptTitle'),
      unsavedMessage: document.getElementById('unsavedPromptMessage'),
      unsavedSave: document.getElementById('unsavedPromptSave'),
      unsavedDiscard: document.getElementById('unsavedPromptDiscard'),
      unsavedCancel: document.getElementById('unsavedPromptCancel'),
      styleSyncPrompt: document.getElementById('styleSyncPrompt'),
      styleSyncForm: document.querySelector('#styleSyncPrompt [data-style-sync-form]'),
      styleSyncSource: document.getElementById('styleSyncSource'),
      styleSyncTargets: document.getElementById('styleSyncTargets'),
      styleSyncSelectAll: document.getElementById('styleSyncTargetSelectAll'),
      styleSyncStatus: document.getElementById('styleSyncStatus'),
      styleSyncApply: document.querySelector('#styleSyncPrompt [data-style-sync-apply]'),
      styleSyncCancel: document.querySelector('#styleSyncPrompt [data-style-sync-cancel]')
    };
    console.debug('Debug: domControls.createDomHandles generated', { keys: Object.keys(handles) });
    return handles;
  };

  namespace.setAppHeaderVisibility = function setAppHeaderVisibility(dom, shouldShow, meta = {}) {
    if (!dom || !dom.appHeader) {
      console.debug('Debug: setAppHeaderVisibility skipped', { hasHeader: !!dom?.appHeader, requested: shouldShow });
      return;
    }
    if (moduleState.appHeaderVisible === shouldShow) {
      console.debug('Debug: app header visibility unchanged', {
        visible: moduleState.appHeaderVisible,
        requested: shouldShow,
        reason: meta.reason || 'no-change'
      });
      return;
    }
    dom.appHeader.style.display = shouldShow ? '' : 'none';
    moduleState.appHeaderVisible = shouldShow;
    console.debug('Debug: app header visibility set', {
      visible: moduleState.appHeaderVisible,
      reason: meta.reason || 'unspecified'
    });
  };

  namespace.hideWorkspaceElement = function hideWorkspaceElement(config) {
    if (!config?.element) return;
    config.element.setAttribute('hidden', 'hidden');
    config.element.style.display = 'none';
  };

  namespace.hideAllWorkspaces = function hideAllWorkspaces(workspaces) {
    if (!workspaces) return;
    Object.values(workspaces).forEach(namespace.hideWorkspaceElement);
  };

  namespace.ensureDefaultPayload = function ensureDefaultPayload(session, type, config) {
    if (moduleState.workspaceDefaults[type]) {
      return moduleState.workspaceDefaults[type];
    }
    if (!config || typeof config.getPayload !== 'function' || !session || typeof session.clonePayload !== 'function') {
      return null;
    }
    try {
      const payload = config.getPayload();
      moduleState.workspaceDefaults[type] = session.clonePayload(payload);
      console.debug('Debug: workspace default captured', { type, hasPayload: !!moduleState.workspaceDefaults[type] });
      if (typeof config.getLayoutState === 'function') {
        const layout = config.getLayoutState();
        moduleState.workspaceLayoutDefaults[type] = session.clonePayload(layout);
        console.debug('Debug: workspace layout default captured', {
          type,
          hasLayout: !!moduleState.workspaceLayoutDefaults[type]
        });
      }
      return moduleState.workspaceDefaults[type];
    } catch (err) {
      console.error('ensureDefaultPayload error', { type, err });
      return null;
    }
  };

  namespace.applyWorkspacePayload = function applyWorkspacePayload(config, payload) {
    if (!config || !payload) {
      console.debug('Debug: applyWorkspacePayload skipped', { hasConfig: !!config, hasPayload: !!payload });
      return;
    }
    if (typeof config.loadFromPayload === 'function') {
      config.loadFromPayload(payload);
      console.debug('Debug: workspace payload applied via custom handler', { type: config.type });
      return;
    }
    if (typeof config.loadFromFile === 'function') {
      try {
        const serialized = JSON.stringify(payload);
        const BlobCtor = window.Blob || Blob;
        const blob = new BlobCtor([serialized], { type: 'application/json' });
        config.loadFromFile(blob);
        console.debug('Debug: workspace payload applied via blob', { type: config.type, length: serialized.length });
      } catch (err) {
        console.error('applyWorkspacePayload error', { type: config.type, err });
      }
      return;
    }
    console.warn('Workspace payload application unavailable', { type: config.type });
  };

  namespace.showWorkspaceForTab = function showWorkspaceForTab(params) {
    const {
      tab,
      options = {},
      dom,
      workspaces,
      session,
      workspaceState
    } = params || {};
    if (!tab || !tab.type) {
      namespace.showGraphSelection({ dom, workspaces, reason: 'no-type' });
      return;
    }
    const config = workspaces ? workspaces[tab.type] : null;
    if (!config) {
      console.warn('Unknown workspace type', { type: tab?.type });
      namespace.showGraphSelection({ dom, workspaces, reason: 'unknown-type' });
      return;
    }
    namespace.hideAllWorkspaces(workspaces);
    if (dom?.welcomeScreen) {
      dom.welcomeScreen.style.display = 'none';
    }
    namespace.setAppHeaderVisibility(dom, false, { reason: 'workspace-view', tabId: tab.id, type: tab.type });
    namespace.hideWorkspaceElement(config);
    if (config.element) {
      config.element.removeAttribute('hidden');
      config.element.style.display = '';
    }
    try {
      if (typeof config.ensure === 'function') {
        config.ensure();
      }
    } catch (err) {
      console.error('workspace ensure error', { type: tab.type, err });
    }
    const defaultPayload = namespace.ensureDefaultPayload(session, tab.type, config);
    if (!options.skipApply) {
      const payload = tab.payload ? session?.clonePayload?.(tab.payload) : session?.clonePayload?.(defaultPayload);
      namespace.applyWorkspacePayload(config, payload);
    }
    if (typeof config.applyLayoutState === 'function') {
      const layoutSource = tab.layoutState
        ? session?.clonePayload?.(tab.layoutState)
        : (moduleState.workspaceLayoutDefaults[tab.type]
          ? session?.clonePayload?.(moduleState.workspaceLayoutDefaults[tab.type])
          : null);
      const applied = config.applyLayoutState(layoutSource, { reason: options.reason || 'workspace-view' });
      console.debug('Debug: workspace layout applied', {
        tabId: tab.id,
        type: tab.type,
        hasState: !!layoutSource,
        applied
      });
    }
    try {
      if (typeof config.draw === 'function') {
        config.draw();
      }
    } catch (err) {
      console.error('workspace draw error', { type: tab.type, err });
    }
    if (workspaceState) {
      workspaceState.lastActiveGraphId = tab.id;
    }
    console.debug('Debug: workspace displayed', { tabId: tab.id, type: tab.type });
  };

  namespace.showGraphSelection = function showGraphSelection(params = {}) {
    const { dom, workspaces, reason } = params;
    namespace.hideAllWorkspaces(workspaces);
    if (dom?.welcomeScreen) {
      dom.welcomeScreen.style.display = 'flex';
    }
    namespace.setAppHeaderVisibility(dom, true, { reason: reason || 'graph-selection' });
    console.debug('Debug: welcome screen shown', { reason: reason || 'unspecified' });
  };

  namespace.createSelectionCards = function createSelectionCards(params) {
    const { dom, graphTypes, handleGraphSelection } = params || {};
    if (!dom?.selectionGrid || !Array.isArray(graphTypes)) {
      console.debug('Debug: selection cards skipped', {
        hasGrid: !!dom?.selectionGrid,
        graphCount: Array.isArray(graphTypes) ? graphTypes.length : 0
      });
      return;
    }
    const existingCards = Array.from(dom.selectionGrid.querySelectorAll('[data-graph-type]'));
    if (existingCards.length) {
      const infoByType = new Map(graphTypes.map(info => [info.type, info]));
      existingCards.forEach(card => {
        const { graphType } = card.dataset;
        const info = infoByType.get(graphType);
        if (!info) {
          console.debug('Debug: removing orphaned welcome card', { graphType });
          card.remove();
          return;
        }
        const hint = card.querySelector('.graph-card__hint');
        const title = card.querySelector('.graph-card__title');
        const description = card.querySelector('.graph-card__description');
        if (hint) hint.textContent = info.hint || 'Workspace';
        if (title) title.textContent = info.label;
        if (description) description.textContent = info.description;
        if (!card.dataset.boundClick && typeof handleGraphSelection === 'function') {
          card.addEventListener('click', () => {
            console.debug('Debug: graph card selected', { type: info.type });
            handleGraphSelection(info.type);
          });
          card.dataset.boundClick = 'true';
        }
      });
      console.debug('Debug: selection cards hydrated', { count: existingCards.length });
      return;
    }
    const fragment = document.createDocumentFragment();
    graphTypes.forEach(info => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'graph-card';
      card.setAttribute('role', 'listitem');
      card.dataset.graphType = info.type;
      card.innerHTML = `
        <span class="graph-card__hint">${info.hint || 'Workspace'}</span>
        <h3 class="graph-card__title">${info.label}</h3>
        <p class="graph-card__description">${info.description}</p>
      `;
      card.dataset.boundClick = 'true';
      if (typeof handleGraphSelection === 'function') {
        card.addEventListener('click', () => {
          console.debug('Debug: graph card selected', { type: info.type });
          handleGraphSelection(info.type);
        });
      }
      fragment.appendChild(card);
    });
    dom.selectionGrid.innerHTML = '';
    dom.selectionGrid.appendChild(fragment);
    console.debug('Debug: selection cards generated', { count: graphTypes.length });
  };

  console.debug('Debug: domControls.js wiring complete', { exports: Object.keys(namespace) });
})();
