(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const namespace = Main.domControls = Main.domControls || {};

  const moduleState = {
    appHeaderVisible: true,
    workspaceDefaults: {},
    workspaceLayoutDefaults: {},
    workspaceInitialized: {}
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
      welcomeGraphInput: document.getElementById('welcomeGraphFileInput'),
      welcomePicker: document.querySelector('.welcome-picker'),
      welcomeGraphSearch: document.getElementById('welcomeGraphSearch'),
      welcomeGraphSearchResults: document.getElementById('welcomeGraphResults'),
      welcomeGraphLaunch: document.getElementById('welcomeGraphLaunch'),
      welcomeGraphSelectionLabel: document.getElementById('welcomeGraphSelectionLabel'),
      welcomeGraphSearchClear: document.getElementById('welcomeGraphSearchClear'),
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

  namespace.isWorkspaceInitialized = function isWorkspaceInitialized(type) {
    if (!type) {
      console.debug('Debug: workspace initialization check skipped', { type });
      return false;
    }
    const initialized = moduleState.workspaceInitialized?.[type] === true;
    console.debug('Debug: workspace initialization status', { type, initialized });
    return initialized;
  };

  namespace.markWorkspaceInitialized = function markWorkspaceInitialized(type, meta = {}) {
    if (!type) {
      console.debug('Debug: workspace initialization mark skipped', { type, meta });
      return;
    }
    if (!moduleState.workspaceInitialized) {
      moduleState.workspaceInitialized = {};
    }
    if (moduleState.workspaceInitialized[type]) {
      console.debug('Debug: workspace initialization mark ignored', { type, reason: 'already-initialized', meta });
      return;
    }
    moduleState.workspaceInitialized[type] = true;
    console.debug('Debug: workspace initialization recorded', { type, meta });
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
    const cloneFn = session?.fastClonePayload || session?.clonePayload;
    if (!session || typeof cloneFn !== 'function' || !config) {
      console.debug('Debug: ensureDefaultPayload skipped', {
        hasSession: !!session,
        hasClone: typeof cloneFn === 'function',
        hasConfig: !!config,
        type
      });
      return null;
    }
    const resolveEmptyPayload = () => {
      if (typeof config.createEmptyPayload === 'function') {
        try {
          const emptyPayload = config.createEmptyPayload();
          console.debug('Debug: ensureDefaultPayload using createEmptyPayload', { type, hasPayload: !!emptyPayload });
          return emptyPayload;
        } catch (err) {
          console.error('ensureDefaultPayload empty payload error', { type, err });
        }
      }
      if (typeof config.getPayload === 'function') {
        try {
          const snapshot = config.getPayload();
          console.debug('Debug: ensureDefaultPayload using live payload snapshot', { type, hasPayload: !!snapshot });
          return snapshot;
        } catch (err) {
          console.error('ensureDefaultPayload live payload error', { type, err });
        }
      }
      return null;
    };
    try {
      const payload = resolveEmptyPayload();
      if (!payload) {
        console.debug('Debug: ensureDefaultPayload payload unavailable', { type });
        return null;
      }
      moduleState.workspaceDefaults[type] = cloneFn.call(session, payload);
      console.debug('Debug: workspace default captured', { type, hasPayload: !!moduleState.workspaceDefaults[type] });
      if (typeof config.getLayoutState === 'function') {
        try {
          const layout = config.getLayoutState();
          moduleState.workspaceLayoutDefaults[type] = cloneFn.call(session, layout);
          console.debug('Debug: workspace layout default captured', {
            type,
            hasLayout: !!moduleState.workspaceLayoutDefaults[type]
          });
        } catch (layoutErr) {
          console.error('ensureDefaultPayload layout capture error', { type, err: layoutErr });
        }
      }
      return moduleState.workspaceDefaults[type];
    } catch (err) {
      console.error('ensureDefaultPayload error', { type, err });
      return null;
    }
  };

  namespace.applyWorkspacePayload = function applyWorkspacePayload(config, payload) {
    if (!config || payload === undefined) {
      console.debug('Debug: applyWorkspacePayload skipped', { hasConfig: !!config, hasPayload: payload !== undefined });
      return;
    }
    const label = config.type || 'workspace';
    if (typeof config.loadFromPayload === 'function') {
      try {
        const result = config.loadFromPayload(payload);
        if (result && typeof result.then === 'function') {
          result.catch(err => console.error('applyWorkspacePayload async error', { type: label, err }));
        }
        console.debug('Debug: workspace payload applied via custom handler', { type: label });
      } catch (err) {
        console.error('applyWorkspacePayload custom handler error', { type: label, err });
      }
      return;
    }
    if (typeof config.loadFromFile === 'function') {
      try {
        const serialized = JSON.stringify(payload);
        const BlobCtor = window.Blob || Blob;
        const blob = new BlobCtor([serialized], { type: 'application/json' });
        if (Shared.fileIO?.registerPayloadBlob) {
          Shared.fileIO.registerPayloadBlob(blob, payload);
        }
        config.loadFromFile(blob);
        console.debug('Debug: workspace payload applied via blob', { type: label, length: serialized.length });
      } catch (err) {
        console.error('applyWorkspacePayload error', { type: label, err });
      }
      return;
    }
    console.warn('Workspace payload application unavailable', { type: label });
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
    if (workspaceState && !workspaceState.loadedWorkspaces) {
      workspaceState.loadedWorkspaces = {};
    }
    if (workspaceState && !workspaceState.renderedWorkspaceByType) {
      workspaceState.renderedWorkspaceByType = {};
    }
    const loadedWorkspaces = workspaceState?.loadedWorkspaces || {};
    const cachedWorkspace = loadedWorkspaces[tab.id] || null;
    const renderedWorkspaceByType = workspaceState?.renderedWorkspaceByType || {};
    const renderedTabForType = renderedWorkspaceByType[tab.type] || null;
    if (typeof config.prepareForTab === 'function') {
      try {
        config.prepareForTab(tab);
      } catch (err) {
        console.error('workspace prepareForTab error', err);
      }
    }
    const targetPayloadSignature = tab.payloadSignature !== undefined ? tab.payloadSignature : null;
    const targetLayoutSignature = tab.layoutSignature !== undefined ? tab.layoutSignature : null;
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
    const alreadyInitialized = namespace.isWorkspaceInitialized(config.type);
    const markInitialized = reason => {
      namespace.markWorkspaceInitialized(config.type, { reason, tabId: tab.id });
    };
    const cloneFn = session?.fastClonePayload
      ? value => session.fastClonePayload(value)
      : (session?.clonePayload ? value => session.clonePayload(value) : null);
    const canReuseWorkspace = !options.forceReload
      && cachedWorkspace
      && cachedWorkspace.tabId === tab.id
      && cachedWorkspace.payloadSignature === targetPayloadSignature
      && cachedWorkspace.layoutSignature === targetLayoutSignature
      && alreadyInitialized
      && renderedTabForType === tab.id;

    const applyWorkspaceState = () => {
      if (canReuseWorkspace) {
        loadedWorkspaces[tab.id] = {
          tabId: tab.id,
          type: tab.type,
          payloadSignature: targetPayloadSignature,
          layoutSignature: targetLayoutSignature
        };
        if (workspaceState) {
          workspaceState.lastActiveGraphId = tab.id;
          workspaceState.renderedWorkspaceByType[tab.type] = tab.id;
        }
        console.debug('Debug: workspace reuse without redraw', {
          tabId: tab.id,
          type: tab.type,
          reason: options.reason || 'reuse-cache'
        });
        return;
      }
      const defaultPayload = namespace.ensureDefaultPayload(session, tab.type, config);
      if (!options.skipApply) {
        let payload = tab.payload ? cloneFn?.(tab.payload) : cloneFn?.(defaultPayload);
        if (!payload && typeof config.createEmptyPayload === 'function') {
          try {
            const emptyPayload = config.createEmptyPayload();
            moduleState.workspaceDefaults[tab.type] = moduleState.workspaceDefaults[tab.type] || cloneFn?.(emptyPayload);
            payload = cloneFn?.(emptyPayload) || emptyPayload;
            console.debug('Debug: workspace payload rebuilt from empty template', { tabId: tab.id, type: tab.type });
          } catch (err) {
            console.error('workspace payload empty rebuild error', { type: tab.type, err });
          }
        }
        namespace.applyWorkspacePayload(config, payload);
      }
      if (typeof config.applyLayoutState === 'function') {
        const layoutSource = tab.layoutState
          ? cloneFn?.(tab.layoutState)
          : (moduleState.workspaceLayoutDefaults[tab.type]
            ? cloneFn?.(moduleState.workspaceLayoutDefaults[tab.type])
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
        workspaceState.renderedWorkspaceByType[tab.type] = tab.id;
      }
      loadedWorkspaces[tab.id] = {
        tabId: tab.id,
        type: tab.type,
        payloadSignature: targetPayloadSignature,
        layoutSignature: targetLayoutSignature
      };
      console.debug('Debug: workspace displayed', { tabId: tab.id, type: tab.type });
    };

    let ensurePromise = null;
    if (!alreadyInitialized) {
      if (typeof config.ensure === 'function') {
        try {
          const ensureResult = config.ensure();
          if (ensureResult && typeof ensureResult.then === 'function') {
            ensurePromise = ensureResult.then(() => {
              markInitialized('tab-activation');
              console.debug('Debug: workspace ensure resolved (async)', { tabId: tab.id, type: tab.type });
            }).catch(err => {
              console.error('workspace ensure async error', { type: tab.type, err });
            });
          } else {
            markInitialized('tab-activation');
            console.debug('Debug: workspace ensure invoked', { tabId: tab.id, type: tab.type });
          }
        } catch (err) {
          console.error('workspace ensure error', { type: tab.type, err });
        }
      } else {
        markInitialized('no-ensure-handler');
        console.debug('Debug: workspace ensure unavailable', { tabId: tab.id, type: tab.type });
      }
    } else {
      console.debug('Debug: workspace ensure skipped (cached)', { tabId: tab.id, type: tab.type });
      if (typeof config.ensure === 'function') {
        try {
          const maybePromise = config.ensure();
          if (maybePromise && typeof maybePromise.then === 'function') {
            ensurePromise = maybePromise.catch(err => {
              console.error('workspace ensure async error', { type: tab.type, err });
            });
          }
        } catch (err) {
          console.error('workspace ensure error', { type: tab.type, err });
        }
      }
    }

    if (ensurePromise && typeof ensurePromise.then === 'function') {
      return ensurePromise.then(() => {
        applyWorkspaceState();
        return config;
      }).catch(() => {
        applyWorkspaceState();
        return config;
      });
    }

    applyWorkspaceState();
    return config;
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
