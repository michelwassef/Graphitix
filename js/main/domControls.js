(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  if(typeof Shared.workspaceTabs?.activateWorkspace !== 'function' && typeof require === 'function'){
    try {
      require('../shared/workspaceTabs.js');
    } catch (err) {
      console.debug('Debug: domControls workspaceTabs helper require failed', { message: err?.message || String(err) });
    }
  }
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
      saveScopePrompt: document.getElementById('saveScopePrompt'),
      saveScopeTitle: document.getElementById('saveScopePromptTitle'),
      saveScopeMessage: document.getElementById('saveScopePromptMessage'),
      saveScopeCurrentTab: document.getElementById('saveScopeCurrentTab'),
      saveScopeAllTabs: document.getElementById('saveScopeAllTabs'),
      saveScopeCancel: document.getElementById('saveScopeCancel'),
      welcomeOpenModePrompt: document.getElementById('welcomeOpenModePrompt'),
      welcomeOpenModeTitle: document.getElementById('welcomeOpenModeTitle'),
      welcomeOpenModeMessage: document.getElementById('welcomeOpenModeMessage'),
      welcomeOpenModeAdd: document.getElementById('welcomeOpenModeAdd'),
      welcomeOpenModeReplace: document.getElementById('welcomeOpenModeReplace'),
      welcomeOpenModeCancel: document.getElementById('welcomeOpenModeCancel'),
      welcomeReplaceUnsavedPrompt: document.getElementById('welcomeReplaceUnsavedPrompt'),
      welcomeReplaceUnsavedTitle: document.getElementById('welcomeReplaceUnsavedTitle'),
      welcomeReplaceUnsavedMessage: document.getElementById('welcomeReplaceUnsavedMessage'),
      welcomeReplaceUnsavedSave: document.getElementById('welcomeReplaceUnsavedSave'),
      welcomeReplaceUnsavedDiscard: document.getElementById('welcomeReplaceUnsavedDiscard'),
      welcomeReplaceUnsavedCancel: document.getElementById('welcomeReplaceUnsavedCancel'),
      styleSyncPrompt: document.getElementById('styleSyncPrompt'),
      styleSyncForm: document.querySelector('#styleSyncPrompt [data-style-sync-form]'),
      styleSyncSource: document.getElementById('styleSyncSource'),
      styleSyncTargets: document.getElementById('styleSyncTargets'),
      styleSyncSelectAll: document.getElementById('styleSyncTargetSelectAll'),
      styleSyncStatus: document.getElementById('styleSyncStatus'),
      styleSyncApply: document.querySelector('#styleSyncPrompt [data-style-sync-apply]'),
      styleSyncCancel: document.querySelector('#styleSyncPrompt [data-style-sync-cancel]')
      ,
      tabContextMenu: document.getElementById('tabContextMenu'),
      tabContextDuplicateReuse: document.getElementById('tabContextDuplicateReuse'),
      tabContextDuplicateEmpty: document.getElementById('tabContextDuplicateEmpty')
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



  function resolveDefaultFontSizeForType(type) {
    if (!type || !document || typeof document.getElementById !== "function") {
      return null;
    }
    const inputId = `${type}FontSize`;
    const input = document.getElementById(inputId);
    if (!input) {
      console.debug('Debug: resolveDefaultFontSizeForType skipped', { type, reason: 'missing-input', inputId });
      return null;
    }
    const raw = input.defaultValue != null && String(input.defaultValue).trim() !== ""
      ? input.defaultValue
      : input.getAttribute?.('value');
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      console.debug('Debug: resolveDefaultFontSizeForType skipped', { type, reason: 'invalid-default', inputId, raw });
      return null;
    }
    console.debug('Debug: resolveDefaultFontSizeForType resolved', { type, inputId, defaultPt: numeric });
    return numeric;
  }

  function normalizeDefaultPayloadForType(type, payload) {
    if (!payload || typeof payload !== "object") {
      return payload;
    }
    const cfg = payload.config;
    if (!cfg || typeof cfg !== "object") {
      return payload;
    }
    const defaultFontSize = resolveDefaultFontSizeForType(type);
    if (!Number.isFinite(defaultFontSize) || defaultFontSize <= 0) {
      return payload;
    }
    const previousFontSize = cfg.fontSize;
    cfg.fontSize = defaultFontSize;
    if (cfg.fontStyles && typeof cfg.fontStyles === "object" && cfg.fontStyles.__graph__ && typeof cfg.fontStyles.__graph__ === "object") {
      if (Object.prototype.hasOwnProperty.call(cfg.fontStyles.__graph__, 'fontSize')) {
        delete cfg.fontStyles.__graph__.fontSize;
      }
      if (!Object.keys(cfg.fontStyles.__graph__).length) {
        delete cfg.fontStyles.__graph__;
      }
      if (!Object.keys(cfg.fontStyles).length) {
        delete cfg.fontStyles;
      }
    }
    console.debug('Debug: normalizeDefaultPayloadForType applied', {
      type,
      previousFontSize,
      normalizedFontSize: cfg.fontSize
    });
    return payload;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value, cloneFn) {
    if (value === undefined) {
      return undefined;
    }
    if (typeof cloneFn === 'function') {
      try {
        return cloneFn(value);
      } catch (err) {
        console.error('domControls cloneValue via cloneFn failed', { err });
      }
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      console.error('domControls cloneValue JSON fallback failed', { err });
      return value;
    }
  }

  function deepFreezeValue(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(entry => deepFreezeValue(entry, seen));
    } else {
      Object.keys(value).forEach(key => {
        deepFreezeValue(value[key], seen);
      });
    }
    try {
      Object.freeze(value);
    } catch (err) {
      console.error('domControls deepFreezeValue failed', { err });
    }
    return value;
  }

  function cacheWorkspaceDefaultPayload(type, payload, cloneFn) {
    if (!type || !payload || typeof payload !== 'object') {
      return null;
    }
    const normalized = normalizeDefaultPayloadForType(type, cloneValue(payload, cloneFn));
    moduleState.workspaceDefaults[type] = deepFreezeValue(normalized);
    return moduleState.workspaceDefaults[type];
  }

  function cacheWorkspaceDefaultLayout(type, layout, cloneFn) {
    if (!type || !layout || typeof layout !== 'object') {
      return null;
    }
    moduleState.workspaceLayoutDefaults[type] = deepFreezeValue(cloneValue(layout, cloneFn));
    return moduleState.workspaceLayoutDefaults[type];
  }

  function enrichDefaultPayloadCandidate(type, config, payload, cloneFn) {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }
    const templateGetter = (typeof config?.captureEmptyPayloadTemplate === 'function')
      ? config.captureEmptyPayloadTemplate
      : null;
    if (!templateGetter) {
      return payload;
    }
    try {
      const template = templateGetter();
      if (!template || typeof template !== 'object') {
        return payload;
      }
      const payloadConfigKeyCount = Object.keys(payload?.config || {}).length;
      const templateConfigKeyCount = Object.keys(template?.config || {}).length;
      const enriched = mergePayloadWithDefaults(payload, template, cloneFn);
      const enrichedConfigKeyCount = Object.keys(enriched?.config || {}).length;
      if (enrichedConfigKeyCount > payloadConfigKeyCount || templateConfigKeyCount > payloadConfigKeyCount) {
        console.debug('Debug: ensureDefaultPayload enriched candidate from empty template', {
          type,
          payloadConfigKeyCount,
          templateConfigKeyCount,
          enrichedConfigKeyCount
        });
      }
      return enriched || payload;
    } catch (err) {
      console.error('ensureDefaultPayload template enrichment error', { type, err });
      return payload;
    }
  }

  function mergePayloadWithDefaultsRecursive(defaultValue, payloadValue, cloneFn) {
    if (payloadValue === undefined) {
      return cloneValue(defaultValue, cloneFn);
    }
    if (defaultValue === undefined) {
      return cloneValue(payloadValue, cloneFn);
    }
    if (payloadValue === null || defaultValue === null) {
      return cloneValue(payloadValue, cloneFn);
    }
    if (Array.isArray(payloadValue)) {
      return cloneValue(payloadValue, cloneFn);
    }
    if (Array.isArray(defaultValue)) {
      return cloneValue(payloadValue, cloneFn);
    }
    if (isPlainObject(defaultValue) && isPlainObject(payloadValue)) {
      const merged = {};
      const keys = new Set([...Object.keys(defaultValue), ...Object.keys(payloadValue)]);
      keys.forEach(key => {
        const hasPayloadKey = Object.prototype.hasOwnProperty.call(payloadValue, key);
        if (!hasPayloadKey) {
          merged[key] = cloneValue(defaultValue[key], cloneFn);
          return;
        }
        merged[key] = mergePayloadWithDefaultsRecursive(defaultValue[key], payloadValue[key], cloneFn);
      });
      return merged;
    }
    return cloneValue(payloadValue, cloneFn);
  }

  function mergePayloadWithDefaults(payload, defaults, cloneFn) {
    if (!payload || typeof payload !== 'object') {
      return cloneValue(defaults, cloneFn);
    }
    if (!defaults || typeof defaults !== 'object') {
      return cloneValue(payload, cloneFn);
    }
    return mergePayloadWithDefaultsRecursive(defaults, payload, cloneFn);
  }

  function cloneWorkspaceApplyValue(value, cloneFn, key = null) {
    if (key === 'data' && Array.isArray(value)) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(item => cloneWorkspaceApplyValue(item, cloneFn, null));
    }
    if (isPlainObject(value)) {
      const cloned = {};
      Object.keys(value).forEach(childKey => {
        cloned[childKey] = cloneWorkspaceApplyValue(value[childKey], cloneFn, childKey);
      });
      return cloned;
    }
    return cloneValue(value, cloneFn);
  }

  function mergeWorkspaceApplyPayloadWithDefaults(payload, defaults, cloneFn, key = null) {
    if (payload === undefined) {
      return cloneWorkspaceApplyValue(defaults, cloneFn, key);
    }
    if (defaults === undefined || payload === null || defaults === null) {
      return cloneWorkspaceApplyValue(payload, cloneFn, key);
    }
    if (key === 'data' && Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload)) {
      return cloneWorkspaceApplyValue(payload, cloneFn, key);
    }
    if (Array.isArray(defaults)) {
      return cloneWorkspaceApplyValue(payload, cloneFn, key);
    }
    if (isPlainObject(defaults) && isPlainObject(payload)) {
      const merged = {};
      const keys = new Set([...Object.keys(defaults), ...Object.keys(payload)]);
      keys.forEach(childKey => {
        const hasPayloadKey = Object.prototype.hasOwnProperty.call(payload, childKey);
        merged[childKey] = hasPayloadKey
          ? mergeWorkspaceApplyPayloadWithDefaults(payload[childKey], defaults[childKey], cloneFn, childKey)
          : cloneWorkspaceApplyValue(defaults[childKey], cloneFn, childKey);
      });
      return merged;
    }
    return cloneWorkspaceApplyValue(payload, cloneFn, key);
  }

  function resolveWorkspaceConfigForType(type) {
    if (!type) {
      return null;
    }
    const registry = Main?.components?.registry;
    if (!registry || typeof registry !== 'object') {
      return null;
    }
    return registry[type] || null;
  }

  function captureBaselineDefaultPayload(type, config, cloneFn) {
    if (!config || typeof config.createEmptyPayload !== 'function') {
      return null;
    }
    try {
      const baseline = config.createEmptyPayload();
      return cloneValue(baseline, cloneFn);
    } catch (err) {
      console.error('captureBaselineDefaultPayload error', { type, err });
      return null;
    }
  }

  function sanitizeDefaultPayloadVolatileState(type, payload, baseline, cloneFn) {
    if (!payload || typeof payload !== 'object' || !baseline || typeof baseline !== 'object') {
      return payload;
    }
    const next = cloneValue(payload, cloneFn) || payload;
    const nextConfig = isPlainObject(next.config) ? next.config : {};
    next.config = nextConfig;
    const baselineConfig = isPlainObject(baseline.config) ? baseline.config : {};
    const baselineStats = isPlainObject(baselineConfig.stats) ? baselineConfig.stats : null;
    if (baselineStats) {
      nextConfig.stats = cloneValue(baselineStats, cloneFn);
    } else if (Object.prototype.hasOwnProperty.call(nextConfig, 'stats')) {
      delete nextConfig.stats;
    }
    if (Object.prototype.hasOwnProperty.call(baseline, 'stats')) {
      next.stats = cloneValue(baseline.stats, cloneFn);
    } else if (Object.prototype.hasOwnProperty.call(next, 'stats')) {
      delete next.stats;
    }
    console.debug('Debug: sanitizeDefaultPayloadVolatileState applied', {
      type,
      hasBaselineStats: !!baselineStats
    });
    return next;
  }

  namespace.mergePayloadWithDefaults = function mergePayloadWithDefaultsForWorkspace(type, payload, defaults, options = {}) {
    const cloneFn = options.cloneFn;
    const merged = mergePayloadWithDefaults(payload, defaults, cloneFn);
    console.debug('Debug: mergePayloadWithDefaults applied', {
      type,
      hasPayload: !!payload,
      hasDefaults: !!defaults,
      hasMerged: !!merged
    });
    return merged;
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
    const cloneRaw = session?.fastClonePayload || session?.clonePayload;
    const cloneFn = typeof cloneRaw === 'function'
      ? value => cloneRaw.call(session, value)
      : null;
    if (moduleState.workspaceDefaults[type]) {
      try {
        const cachedClone = cloneValue(moduleState.workspaceDefaults[type], cloneFn);
        const baseline = captureBaselineDefaultPayload(type, config, cloneFn);
        const sanitizedCached = sanitizeDefaultPayloadVolatileState(type, cachedClone, baseline, cloneFn);
        return normalizeDefaultPayloadForType(type, sanitizedCached);
      } catch (err) {
        console.error('ensureDefaultPayload cached clone error', { type, err });
        const fallbackClone = cloneValue(moduleState.workspaceDefaults[type], null);
        const baseline = captureBaselineDefaultPayload(type, config, null);
        const sanitizedFallback = sanitizeDefaultPayloadVolatileState(type, fallbackClone, baseline, null);
        return normalizeDefaultPayloadForType(type, sanitizedFallback);
      }
    }
    if (!session || typeof cloneFn !== 'function' || !config) {
      console.debug('Debug: ensureDefaultPayload skipped', {
        hasSession: !!session,
        hasClone: typeof cloneFn === 'function',
        hasConfig: !!config,
        type
      });
      return null;
    }
    const workspaceInitialized = namespace.isWorkspaceInitialized(type);
    const requiresWorkspaceInitialization = !!config?.element;
    if (requiresWorkspaceInitialization && !workspaceInitialized) {
      console.debug('Debug: ensureDefaultPayload deferred until workspace initialization', { type });
      return null;
    }
    const resolveEmptyPayload = () => {
      let templatePayload = null;
      if (typeof config.captureEmptyPayloadTemplate === 'function') {
        try {
          templatePayload = config.captureEmptyPayloadTemplate();
          console.debug('Debug: ensureDefaultPayload using captureEmptyPayloadTemplate', { type, hasPayload: !!templatePayload });
        } catch (err) {
          console.error('ensureDefaultPayload captureEmptyPayloadTemplate error', { type, err });
          templatePayload = null;
        }
      }
      let emptyPayload = null;
      if (typeof config.createEmptyPayload === 'function') {
        try {
          emptyPayload = config.createEmptyPayload();
          console.debug('Debug: ensureDefaultPayload using createEmptyPayload', { type, hasPayload: !!emptyPayload });
        } catch (err) {
          console.error('ensureDefaultPayload empty payload error', { type, err });
          emptyPayload = null;
        }
      }
      if (templatePayload && emptyPayload) {
        try {
          // Structural isolation guard: empty payload values are authoritative.
          // Template payloads only fill missing structure.
          const merged = mergePayloadWithDefaults(emptyPayload, templatePayload, cloneFn);
          console.debug('Debug: ensureDefaultPayload merged template with empty payload', {
            type,
            hasMerged: !!merged
          });
          return merged;
        } catch (err) {
          console.error('ensureDefaultPayload template-empty merge error', { type, err });
          return templatePayload || emptyPayload;
        }
      }
      if (templatePayload) {
        return templatePayload;
      }
      if (emptyPayload) {
        return emptyPayload;
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
      let payload = resolveEmptyPayload();
      if (!payload) {
        console.debug('Debug: ensureDefaultPayload payload unavailable', { type });
        return null;
      }
      payload = enrichDefaultPayloadCandidate(type, config, payload, cloneFn);
      cacheWorkspaceDefaultPayload(type, payload, cloneFn);
      console.debug('Debug: workspace default captured', { type, hasPayload: !!moduleState.workspaceDefaults[type] });
      const layoutGetter = (typeof config.getDefaultLayoutState === 'function')
        ? config.getDefaultLayoutState
        : (typeof config.getLayoutState === 'function' ? config.getLayoutState : null);
      if (layoutGetter) {
        try {
          const layout = layoutGetter();
          cacheWorkspaceDefaultLayout(type, layout, cloneFn);
          console.debug('Debug: workspace layout default captured', {
            type,
            hasLayout: !!moduleState.workspaceLayoutDefaults[type]
          });
        } catch (layoutErr) {
          console.error('ensureDefaultPayload layout capture error', { type, err: layoutErr });
        }
      }
      try {
        const clonedDefault = cloneValue(moduleState.workspaceDefaults[type], cloneFn);
        return normalizeDefaultPayloadForType(type, clonedDefault);
      } catch (cloneErr) {
        console.error('ensureDefaultPayload return clone error', { type, err: cloneErr });
        return normalizeDefaultPayloadForType(type, cloneValue(moduleState.workspaceDefaults[type], null));
      }
    } catch (err) {
      console.error('ensureDefaultPayload error', { type, err });
      return null;
    }
  };

  namespace.setWorkspaceDefaultPayload = function setWorkspaceDefaultPayload(session, type, payload) {
    if (!type) {
      console.debug('Debug: setWorkspaceDefaultPayload skipped', { reason: 'missing-type' });
      return false;
    }
    if (!payload || typeof payload !== 'object') {
      console.debug('Debug: setWorkspaceDefaultPayload skipped', { type, reason: 'invalid-payload' });
      return false;
    }
    const cloneRaw = session?.fastClonePayload || session?.clonePayload;
    const cloneFn = typeof cloneRaw === 'function'
      ? value => cloneRaw.call(session, value)
      : null;
    let cloned = null;
    if (typeof cloneFn === 'function') {
      try {
        cloned = cloneFn(payload);
      } catch (err) {
        console.error('setWorkspaceDefaultPayload clone via session failed', { type, err });
      }
    }
    if (!cloned) {
      try {
        cloned = JSON.parse(JSON.stringify(payload));
      } catch (err) {
        console.error('setWorkspaceDefaultPayload JSON clone failed', { type, err });
        return false;
      }
    }
    const config = resolveWorkspaceConfigForType(type);
    const baseline = captureBaselineDefaultPayload(type, config, cloneFn);
    cloned = sanitizeDefaultPayloadVolatileState(type, cloned, baseline, cloneFn);
    cacheWorkspaceDefaultPayload(type, cloned, cloneFn);
    console.debug('Debug: workspace default payload overridden', {
      type,
      hasPayload: !!moduleState.workspaceDefaults[type]
    });
    return true;
  };

  namespace.applyWorkspacePayload = function applyWorkspacePayload(config, payload, options = {}) {
    if (!config || payload === undefined) {
      console.debug('Debug: applyWorkspacePayload skipped', { hasConfig: !!config, hasPayload: payload !== undefined });
      return;
    }
    const label = config.type || 'workspace';
    if (typeof config.loadFromPayload === 'function') {
      try {
        const result = config.loadFromPayload(payload, options || {});
        if (result && typeof result.then === 'function') {
          result
            .then(() => {
              if (!options?.skipPayloadSizing && Shared.graphSizing?.applyPayloadSizingForType) {
                Shared.graphSizing.applyPayloadSizingForType(label, payload, {
                  context: `workspace-payload-${label}`,
                  ...(options?.payloadSizingOptions || {})
                });
              }
            })
            .catch(err => console.error('applyWorkspacePayload async error', { type: label, err }));
        } else if (!options?.skipPayloadSizing && Shared.graphSizing?.applyPayloadSizingForType) {
          Shared.graphSizing.applyPayloadSizingForType(label, payload, {
            context: `workspace-payload-${label}`,
            ...(options?.payloadSizingOptions || {})
          });
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
        config.loadFromFile(blob, options || {});
        if (Shared.graphSizing?.applyPayloadSizingForType) {
          Shared.graphSizing.applyPayloadSizingForType(label, payload, {
            context: `workspace-blob-${label}`
          });
        }
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
    const targetPayloadSignature = tab.payloadSignature !== undefined ? tab.payloadSignature : null;
    const targetLayoutSignature = tab.layoutSignature !== undefined ? tab.layoutSignature : null;
    const renderCache = tab.renderCache || null;
    const renderPayloadSignature = renderCache?.payloadSignature ?? tab.renderCacheSignature ?? null;
    const renderLayoutSignature = renderCache?.layoutSignature ?? tab.renderCacheLayoutSignature ?? null;
    const canRestoreRender = !options.forceReload
      && renderCache
      && renderCache.cache
      && renderPayloadSignature === targetPayloadSignature
      && renderLayoutSignature === targetLayoutSignature
      && typeof config.restoreRenderCache === 'function';
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
      if (Shared.workspaceTabs?.activateWorkspace) {
        Shared.workspaceTabs.activateWorkspace(tab, config, {
          reason: options.reason || 'workspace-view'
        });
      }
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
        let restored = false;
        if (canRestoreRender) {
          if (Shared.componentLayout?.suppressNextScheduleFor) {
            Shared.componentLayout.suppressNextScheduleFor(tab.type, {
              reason: 'render-cache-restore-reuse',
              delayMs: 400,
              count: 3
            });
          }
          try {
            restored = !!config.restoreRenderCache(renderCache.cache, {
              tabId: tab.id,
              type: tab.type
            });
            if (restored && typeof session?.clearTabRenderCache === 'function') {
              session.clearTabRenderCache(tab, { reason: 'render-cache-consumed' });
            }
          } catch (err) {
            console.error('workspace render cache restore error', { type: tab.type, err });
            restored = false;
          }
          if (!restored && typeof config.draw === 'function') {
            try {
              config.draw();
            } catch (err) {
              console.error('workspace draw error', { type: tab.type, err });
            }
          }
        }
        console.debug('Debug: workspace reuse without redraw', {
          tabId: tab.id,
          type: tab.type,
          reason: options.reason || 'reuse-cache',
          renderCacheRestored: restored
        });
        return;
      }
      const defaultPayload = namespace.ensureDefaultPayload(session, tab.type, config);
      if(canRestoreRender && Shared.componentLayout?.suppressNextScheduleFor){
        Shared.componentLayout.suppressNextScheduleFor(tab.type, {
          reason: 'render-cache-restore',
          delayMs: 400,
          count: 3
        });
      }
      if (!options.skipApply) {
        let payload = tab.payload
          ? mergeWorkspaceApplyPayloadWithDefaults(tab.payload, defaultPayload, cloneFn)
          : cloneWorkspaceApplyValue(defaultPayload, cloneFn);
        if (!payload && typeof config.createEmptyPayload === 'function') {
          try {
            const emptyPayload = config.createEmptyPayload();
            if (!moduleState.workspaceDefaults[tab.type]) {
              const enriched = enrichDefaultPayloadCandidate(tab.type, config, emptyPayload, cloneFn);
              cacheWorkspaceDefaultPayload(tab.type, enriched, cloneFn);
            }
            payload = cloneFn?.(emptyPayload) || emptyPayload;
            console.debug('Debug: workspace payload rebuilt from empty template', { tabId: tab.id, type: tab.type });
          } catch (err) {
            console.error('workspace payload empty rebuild error', { type: tab.type, err });
          }
        }
        if (Shared.workspaceTabs?.applySharedPayloadState) {
          Shared.workspaceTabs.applySharedPayloadState(tab, tab.type, payload, config, {
            reason: options.reason || 'workspace-view'
          });
        }
        namespace.applyWorkspacePayload(config, payload, {
          skipDraw: canRestoreRender,
          restoreRenderCache: canRestoreRender,
          skipPayloadSizing: canRestoreRender
        });
      }
      if (typeof config.applyLayoutState === 'function') {
        let defaultLayout = moduleState.workspaceLayoutDefaults[tab.type] || null;
        if (!defaultLayout && typeof config.getDefaultLayoutState === 'function') {
          try {
            defaultLayout = config.getDefaultLayoutState();
            if (defaultLayout) {
              cacheWorkspaceDefaultLayout(tab.type, defaultLayout, cloneFn);
            }
          } catch (err) {
            console.error('workspace layout default fallback error', { type: tab.type, err });
          }
        }
        let layoutSource = tab.layoutState
          ? cloneFn?.(tab.layoutState)
          : (defaultLayout ? cloneFn?.(defaultLayout) : null);
        if (Shared.graphSizing?.mergePayloadSizingIntoLayout) {
          try {
            layoutSource = Shared.graphSizing.mergePayloadSizingIntoLayout(layoutSource, tab.payload, {
              context: `workspace-layout-${tab.type}`
            });
          } catch (err) {
            console.error('workspace layout graph sizing merge error', { tabId: tab.id, type: tab.type, err });
          }
        }
        const applied = config.applyLayoutState(layoutSource, {
          reason: options.reason || 'workspace-view',
          resetStyles: true,
          resetDataset: true,
          skipSchedule: canRestoreRender
        });
        console.debug('Debug: workspace layout applied', {
          tabId: tab.id,
          type: tab.type,
          hasState: !!layoutSource,
          applied
        });
      }
      let restored = false;
      if (canRestoreRender) {
        try {
          restored = !!config.restoreRenderCache(renderCache.cache, {
            tabId: tab.id,
            type: tab.type
          });
          if (restored && typeof session?.clearTabRenderCache === 'function') {
            session.clearTabRenderCache(tab, { reason: 'render-cache-consumed' });
          }
        } catch (err) {
          console.error('workspace render cache restore error', { type: tab.type, err });
          restored = false;
        }
      }
      if (!restored) {
        try {
          if (typeof config.draw === 'function') {
            config.draw();
          }
        } catch (err) {
          console.error('workspace draw error', { type: tab.type, err });
        }
      } else {
        console.debug('Debug: workspace render cache restored', { tabId: tab.id, type: tab.type });
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
      
      // Always regenerate - ensures we have the correct structure
      const fragment = document.createDocumentFragment();
      graphTypes.forEach(info => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'graph-card';
        card.setAttribute('role', 'listitem');
        card.dataset.graphType = info.type;
        card.innerHTML = `
          <div class="graph-card__icon">${info.icon || '📊'}</div>
          <div class="graph-card__content">
            <span class="graph-card__hint">${info.hint || 'Workspace'}</span>
            <h3 class="graph-card__title">${info.label}</h3>
            <p class="graph-card__description">${info.description}</p>
          </div>
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
      console.debug('Debug: selection cards regenerated', { count: graphTypes.length });
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
        <div class="graph-card__icon">${info.icon || '📊'}</div>
        <div class="graph-card__content">
          <span class="graph-card__hint">${info.hint || 'Workspace'}</span>
          <h3 class="graph-card__title">${info.label}</h3>
          <p class="graph-card__description">${info.description}</p>
        </div>
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
