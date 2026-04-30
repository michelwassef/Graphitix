// Shared helper for component panel layout, resizers, and wrapper styling
// Exposes Shared.componentLayout.createStandardPanels(config)
(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const componentLayout = Shared.componentLayout = Shared.componentLayout || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const graphSizing = Shared.graphSizing = Shared.graphSizing || {};

  const layoutRegistry = componentLayout.__registry = componentLayout.__registry || {};

  function normalizeTabId(value){
    const text = typeof value === 'string' ? value.trim() : String(value || '').trim();
    return text || '';
  }

  function ensureRegistryBucket(componentName){
    const key = String(componentName || '').trim();
    if(!key){
      return null;
    }
    const existing = layoutRegistry[key];
    if(existing && existing.__isTabScopedBucket === true){
      return existing;
    }
    const bucket = { __isTabScopedBucket: true, __default: null, tabs: {} };
    if(existing){
      bucket.__default = existing;
    }
    layoutRegistry[key] = bucket;
    return bucket;
  }

  function resolveRegistryEntry(componentName, options = {}){
    const key = String(componentName || '').trim();
    if(!key){
      return null;
    }
    const entry = layoutRegistry[key];
    const tabId = normalizeTabId(options.tabId || options.workspaceTabId || options.activeTabId);
    if(entry && entry.__isTabScopedBucket === true){
      if(tabId && entry.tabs?.[tabId]){
        return entry.tabs[tabId];
      }
      const activeTabId = normalizeTabId(global.Main?.session?.getActiveTab?.()?.id);
      if(activeTabId && entry.tabs?.[activeTabId]){
        return entry.tabs[activeTabId];
      }
      return entry.__default || null;
    }
    return entry || null;
  }

  function resolveElementTabId(elements, config){
    const explicit = normalizeTabId(config?.tabId || config?.workspaceTabId || config?.activeTabId);
    if(explicit){
      return explicit;
    }
    const roots = [
      elements?.resizeTarget,
      elements?.svgBox,
      elements?.graphPanel,
      elements?.tablePanel
    ];
    for(let i = 0; i < roots.length; i += 1){
      const node = roots[i];
      const direct = normalizeTabId(node?.dataset?.workspaceTabId || node?.dataset?.tabId);
      if(direct){
        return direct;
      }
      const scopedRoot = node?.closest?.('[data-workspace-tab-id],[data-tab-id]');
      const scoped = normalizeTabId(scopedRoot?.dataset?.workspaceTabId || scopedRoot?.dataset?.tabId);
      if(scoped){
        return scoped;
      }
    }
    return normalizeTabId(global.Main?.session?.getActiveTab?.()?.id);
  }

  function getRootScopedElement(root, id, fallbackSelector){
    if(!root){
      return null;
    }
    if(id && typeof root.querySelector === 'function'){
      try{
        const byId = root.querySelector(`#${id}`);
        if(byId){
          return byId;
        }
      }catch(err){
        console.error('Shared.componentLayout hydrate query by id error', { id, err });
      }
    }
    return fallbackSelector && typeof root.querySelector === 'function'
      ? (root.querySelector(fallbackSelector) || null)
      : null;
  }

  function applySnapshotStyle(element, map){
    if(!element?.style || !map || typeof map !== 'object'){
      return;
    }
    Object.entries(map).forEach(([prop, value]) => {
      try{
        element.style[prop] = value || '';
      }catch(err){
        console.error('Shared.componentLayout hydrate style error', { prop, err });
      }
    });
  }

  function applySnapshotDataset(element, map){
    if(!element?.dataset || !map || typeof map !== 'object'){
      return;
    }
    Object.entries(map).forEach(([key, value]) => {
      try{
        if(value === undefined || value === null || value === ''){
          delete element.dataset[key];
        }else{
          element.dataset[key] = String(value);
        }
      }catch(err){
        console.error('Shared.componentLayout hydrate dataset error', { key, err });
      }
    });
  }

  function applyAspectLockToSvgBox(svgBox, aspectLocked){
    if(!svgBox?.dataset || typeof aspectLocked !== 'boolean'){
      return false;
    }
    svgBox.dataset.resizerAspectLocked = aspectLocked ? 'true' : 'false';
    const checkbox = svgBox.querySelector?.('.resizer-aspect-checkbox') || null;
    if(checkbox){
      checkbox.checked = !!aspectLocked;
    }
    return true;
  }

  componentLayout.hydrateRootFromState = function hydrateRootFromState(componentName, root, state, options = {}){
    if(!root || !state || typeof state !== 'object'){
      return false;
    }
    const name = String(componentName || state.component || '').trim();
    const lower = name.toLowerCase();
    const nodes = {
      svgBox: getRootScopedElement(root, `${lower}SvgBox`, '.svgbox'),
      tablePanel: getRootScopedElement(root, `${lower}TablePanel`, '[id$="TablePanel"], .panel:first-child'),
      graphPanel: getRootScopedElement(root, `${lower}GraphPanel`, '[id$="GraphPanel"], .panel:last-child'),
      configPanel: getRootScopedElement(root, `${lower}ConfigPanel`, '[id$="ConfigPanel"], .config-panel, .config-options')
    };
    Object.entries(nodes).forEach(([key, node]) => {
      applySnapshotStyle(node, state[key]?.style);
      applySnapshotDataset(node, state[key]?.dataset);
    });
    console.debug('Debug: componentLayout root hydrated', {
      component: name || null,
      tabId: options.tabId || root?.dataset?.workspaceTabId || null,
      hasSvgBox: !!nodes.svgBox,
      aspectLocked: nodes.svgBox?.dataset?.resizerAspectLocked || null
    });
    return true;
  };

  componentLayout.withTabLayoutOverrides = function withTabLayoutOverrides(state, tabLike){
    const tab = Shared.workspaceTabs?.resolveTab?.(tabLike) || tabLike || null;
    const resizer = tab?.sharedState?.layout?.resizer || null;
    if(!resizer || typeof resizer.aspectLocked !== 'boolean'){
      return state || null;
    }
    const nextState = state && typeof state === 'object'
      ? { ...state }
      : { version: 1, component: tab?.type || null };
    nextState.svgBox = nextState.svgBox && typeof nextState.svgBox === 'object'
      ? { ...nextState.svgBox }
      : {};
    nextState.svgBox.dataset = nextState.svgBox.dataset && typeof nextState.svgBox.dataset === 'object'
      ? { ...nextState.svgBox.dataset }
      : {};
    nextState.svgBox.dataset.resizerAspectLocked = resizer.aspectLocked ? 'true' : 'false';
    if(resizer.aspectRatio !== undefined && resizer.aspectRatio !== null){
      nextState.svgBox.dataset.resizerAspectRatio = String(resizer.aspectRatio);
    }
    console.debug('Debug: componentLayout tab layout override merged', {
      tabId: tab?.id || null,
      component: tab?.type || nextState.component || null,
      aspectLocked: resizer.aspectLocked
    });
    return nextState;
  };

  function resolveElement({ selector, label, documentRef, componentName }){
    if(!selector){
      console.debug('Debug: componentLayout resolveElement missing selector', { component: componentName, label });
      return null;
    }
    try{
      if(typeof selector === 'string'){
        const node = documentRef.querySelector(selector);
        console.debug('Debug: componentLayout resolved selector', { component: componentName, label, selector, found: !!node });
        return node || null;
      }
      if(typeof selector === 'function'){
        const node = selector();
        console.debug('Debug: componentLayout resolved function selector', { component: componentName, label, found: !!node });
        return node || null;
      }
      if(selector && typeof selector === 'object'){
        console.debug('Debug: componentLayout resolved direct node', { component: componentName, label });
        return selector;
      }
    }catch(err){
      console.error('Shared.componentLayout resolveElement error', err);
    }
    console.debug('Debug: componentLayout resolveElement fallback null', { component: componentName, label });
    return null;
  }

  componentLayout.createStandardPanels = function createStandardPanels(config){
    const componentName = config?.componentName || 'component';
    const documentRef = global.document;
    console.debug('Debug: componentLayout createStandardPanels init', { component: componentName });
    if(!documentRef){
      console.debug('Debug: componentLayout createStandardPanels aborted - no document', { component: componentName });
      return {
        elements: {},
        syncPanels(){},
        setScheduleDraw(){},
        updateSvgBox(){},
        updateMinSvgWidth(){},
        destroy(){}
      };
    }

    const selectors = config?.selectors || {};
    const elements = {};
    elements.tablePanel = resolveElement({ selector: selectors.tablePanel, label: 'tablePanel', documentRef, componentName });
    elements.graphPanel = resolveElement({ selector: selectors.graphPanel, label: 'graphPanel', documentRef, componentName });
    elements.configPanel = resolveElement({
      selector: selectors.configPanel || (() => elements.graphPanel?.querySelector('.config-panel')),
      label: 'configPanel',
      documentRef,
      componentName
    });
    elements.panelResizer = resolveElement({ selector: selectors.panelResizer, label: 'panelResizer', documentRef, componentName });
    elements.hotWrapper = resolveElement({ selector: selectors.hotWrapper, label: 'hotWrapper', documentRef, componentName });
    elements.hotContainer = resolveElement({ selector: selectors.hotContainer, label: 'hotContainer', documentRef, componentName });
    elements.svgBox = resolveElement({
      selector: selectors.svgBox || (() => elements.graphPanel?.querySelector('.svgbox')),
      label: 'svgBox',
      documentRef,
      componentName
    });
    elements.resizeTarget = resolveElement({
      selector: selectors.resizeTarget || (() => elements.svgBox || elements.graphPanel),
      label: 'resizeTarget',
      documentRef,
      componentName
    });
    const layoutTabId = resolveElementTabId(elements, config);

    if(elements.hotWrapper && typeof Shared.ensureHotWrapperStyles === 'function'){
      console.debug('Debug: componentLayout applying wrapper styles', { component: componentName, wrapperId: elements.hotWrapper.id || null });
      Shared.ensureHotWrapperStyles(elements.hotWrapper);
    }

    let scheduleDrawFn = typeof config?.scheduleDraw === 'function' ? config.scheduleDraw : null;
    const panelState = {
      minSvgWidth: Number.isFinite(config?.initialMinSvgWidth) ? Number(config.initialMinSvgWidth) : 0,
      resizeObserver: null,
      wasHidden: false,
      deferScheduleUntil: 0,
      forceDeferUntil: 0,
      forceDeferReason: null,
      forceSkipSchedules: 0,
      programmaticSyncDepth: 0,
      lastObservedTableSize: null
    };
    const restoreDelayMs = Number.isFinite(config?.restoreScheduleDelayMs)
      ? Number(config.restoreScheduleDelayMs)
      : 120;
    const preserveGraphContent = config?.preserveGraphContent !== false;
    const suppressScheduleOnRestore = config?.suppressScheduleOnRestore !== false;
    const graphContentSelector = typeof config?.graphContentSelector === 'string'
      ? config.graphContentSelector
      : 'svg,canvas';
    const isDebugEnabled = () => (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled());

    const isElementHidden = (el) => {
      if(!el){ return true; }
      if(el.hidden === true){
        return true;
      }
      if(typeof el.getAttribute === 'function' && el.getAttribute('hidden') !== null){
        return true;
      }
      try{
        if(typeof el.closest === 'function' && el.closest('[hidden]')){
          return true;
        }
      }catch(err){
        console.error('Shared.componentLayout hidden detection error', err);
      }
      try{
        if(typeof el.offsetParent !== 'undefined'){
          const docBody = documentRef?.body || null;
          if(el.offsetParent === null && el !== docBody){
            return true;
          }
        }
      }catch(err){
        console.error('Shared.componentLayout offsetParent error', err);
      }
      if(typeof global.getComputedStyle === 'function'){
        try{
          const style = global.getComputedStyle(el);
          if(style && (style.display === 'none' || style.visibility === 'hidden')){
            return true;
          }
        }catch(err){
          console.error('Shared.componentLayout computed style error', err);
        }
      }
      if(typeof el.getClientRects === 'function' && el.getClientRects().length === 0){
        return true;
      }
      return false;
    };

    const isWorkspaceHidden = () => {
      const root = (elements.graphPanel?.closest && elements.graphPanel.closest('.workspace-page'))
        || (elements.tablePanel?.closest && elements.tablePanel.closest('.workspace-page'))
        || null;
      if(!root){
        return false;
      }
      if(root.hidden === true){
        return true;
      }
      if(typeof root.getAttribute === 'function' && root.getAttribute('hidden') !== null){
        return true;
      }
      if(typeof global.getComputedStyle === 'function'){
        try{
          const style = global.getComputedStyle(root);
          if(style && (style.display === 'none' || style.visibility === 'hidden')){
            return true;
          }
        }catch(err){
          console.error('Shared.componentLayout workspace style error', err);
        }
      }
      return false;
    };

    const hasGraphContent = () => {
      if(typeof config?.hasGraphContent === 'function'){
        try{
          return !!config.hasGraphContent({ elements, component: componentName });
        }catch(err){
          console.error('Shared.componentLayout hasGraphContent error', err);
        }
      }
      const scope = elements.graphPanel || elements.svgBox;
      if(!scope || !scope.querySelector){ return false; }
      return !!scope.querySelector(graphContentSelector);
    };

    const resolveVisibility = () => {
      const workspaceHidden = isWorkspaceHidden();
      const tableHidden = workspaceHidden || isElementHidden(elements.tablePanel);
      const graphHidden = workspaceHidden || isElementHidden(elements.graphPanel);
      return {
        hidden: workspaceHidden || tableHidden || graphHidden,
        hasGraphContent: suppressScheduleOnRestore ? hasGraphContent() : false
      };
    };

    const evaluateScheduleFlags = (options = {}) => {
      let skipSchedule = options && options.skipSchedule === true;
      const source = typeof options?.source === 'string' ? options.source : '';
      const now = Date.now();
      const visibility = resolveVisibility();
      let forceDeferActive = false;
      let forceSkipActive = false;
      if(source === 'observer' && config?.skipScheduleOnObserver === true && !options.forceSchedule){
        skipSchedule = true;
        if(isDebugEnabled()){
          console.debug('Debug: componentLayout schedule skipped on observer source', {
            component: componentName
          });
        }
      }
      if(panelState.forceSkipSchedules > 0 && !options.forceSchedule){
        panelState.forceSkipSchedules -= 1;
        skipSchedule = true;
        forceSkipActive = true;
        if(isDebugEnabled()){
          console.debug('Debug: componentLayout schedule skipped (forced)', {
            component: componentName,
            remaining: panelState.forceSkipSchedules
          });
        }
      }
      if(panelState.forceDeferUntil && panelState.forceDeferUntil > now && !options.forceSchedule){
        skipSchedule = true;
        forceDeferActive = true;
      }else if(panelState.forceDeferUntil > 0){
        panelState.forceDeferUntil = 0;
        panelState.forceDeferReason = null;
      }
      if(visibility.hidden){
        if(!panelState.wasHidden){
          panelState.wasHidden = true;
          panelState.deferScheduleUntil = 0;
        }
        if(!options.forceSchedule){
          skipSchedule = true;
        }
      }else if(panelState.wasHidden){
        panelState.wasHidden = false;
        if(visibility.hasGraphContent && suppressScheduleOnRestore){
          panelState.deferScheduleUntil = now + restoreDelayMs;
          if(isDebugEnabled()){
            console.debug('Debug: componentLayout schedule deferred after restore', {
              component: componentName,
              delayMs: restoreDelayMs
            });
          }
        }else{
          panelState.deferScheduleUntil = 0;
        }
      }
      let deferActive = false;
      if(visibility.hasGraphContent && suppressScheduleOnRestore && Number.isFinite(panelState.deferScheduleUntil)){
        if(panelState.deferScheduleUntil > now){
          skipSchedule = true;
          deferActive = true;
        }else if(panelState.deferScheduleUntil > 0){
          panelState.deferScheduleUntil = 0;
        }
      }
      const suppressResizeCallback = (visibility.hidden || deferActive || forceDeferActive || forceSkipActive) && !options.forceSchedule;
      return { skipSchedule, visibility, suppressResizeCallback };
    };

    const OBSERVER_SIZE_EPSILON = 0.5;
    const readObservedSize = element => {
      const rect = element?.getBoundingClientRect?.();
      return rect ? { width: rect.width, height: rect.height } : null;
    };
    const sizeChangedEnough = (previous, next, epsilon = OBSERVER_SIZE_EPSILON) => {
      if(!previous || !next) return true;
      return Math.abs(previous.width - next.width) > epsilon || Math.abs(previous.height - next.height) > epsilon;
    };

    const syncPanels = (options = {}) => {
      const flags = evaluateScheduleFlags(options);
      const skipSchedule = flags.skipSchedule;
      if(typeof Shared.syncPanelWidths !== 'function'){
        console.debug('Debug: componentLayout syncPanels skipped - missing Shared.syncPanelWidths', { component: componentName });
        return;
      }
      const scheduleWrapper = (!skipSchedule && scheduleDrawFn) ? () => {
        console.debug('Debug: componentLayout scheduleDraw invoked', { component: componentName, source: options.source || 'sync' });
        scheduleDrawFn();
      } : null;
      const syncOptions = Object.assign({ forceDefaultWidth: true }, config?.panelSyncOptions || {});
      Object.assign(syncOptions, {
        svgBox: elements.svgBox,
        minSvgWidth: panelState.minSvgWidth,
        debugLabel: componentName,
        panelResizer: elements.panelResizer,
        skipSchedule,
        preserveGraphContent,
        forceSchedule: options.forceSchedule === true || options.source === 'observer'
      });
      let syncResult = null;
      panelState.programmaticSyncDepth += 1;
      try{
        syncResult = Shared.syncPanelWidths(elements.tablePanel, elements.graphPanel, elements.configPanel, scheduleWrapper, syncOptions);
      } finally {
        global.requestAnimationFrame(() => {
          panelState.programmaticSyncDepth = Math.max(0, panelState.programmaticSyncDepth - 1);
          console.debug('Debug: componentLayout programmatic sync released', {
            component: componentName,
            depth: panelState.programmaticSyncDepth
          });
        });
      }
      console.debug('Debug: componentLayout syncPanels complete', {
        component: componentName,
        minSvgWidth: panelState.minSvgWidth,
        layoutChanged: !!syncResult?.layoutChanged
      });
      if(typeof config?.onAfterSync === 'function'){
        try{
          config.onAfterSync({ elements, component: componentName, options });
        }catch(err){
          console.error('Shared.componentLayout onAfterSync error', err);
        }
      }
    };

    if(global.ResizeObserver && elements.tablePanel){
      panelState.resizeObserver = new global.ResizeObserver(() => {
        const nextSize = readObservedSize(elements.tablePanel);
        if(panelState.programmaticSyncDepth > 0){
          console.debug('Debug: componentLayout ResizeObserver ignored during programmatic sync', {
            component: componentName,
            nextSize,
            depth: panelState.programmaticSyncDepth
          });
          return;
        }
        if(!sizeChangedEnough(panelState.lastObservedTableSize, nextSize)){
          console.debug('Debug: componentLayout ResizeObserver ignored unchanged size', {
            component: componentName,
            lastSize: panelState.lastObservedTableSize,
            nextSize
          });
          return;
        }
        panelState.lastObservedTableSize = nextSize;
        console.debug('Debug: componentLayout ResizeObserver triggered', { component: componentName, nextSize });
        syncPanels({ source: 'observer', forceSchedule: true });
      });
      panelState.lastObservedTableSize = readObservedSize(elements.tablePanel);
      panelState.resizeObserver.observe(elements.tablePanel);
    }else{
      console.debug('Debug: componentLayout ResizeObserver unavailable', {
        component: componentName,
        hasObserver: !!global.ResizeObserver,
        hasTable: !!elements.tablePanel
      });
    }

    const computeMinSvgWidth = typeof config?.computeMinSvgWidth === 'function'
      ? config.computeMinSvgWidth
      : () => {
        const width = elements.svgBox?.getBoundingClientRect?.().width || 0;
        const computed = Math.max(0, width * 0.5);
        console.debug('Debug: componentLayout default computeMinSvgWidth', { component: componentName, width, computed });
        return computed;
      };

    const updateMinSvgWidth = value => {
      const coerced = Number.isFinite(value) ? value : 0;
      panelState.minSvgWidth = Math.max(0, coerced);
      console.debug('Debug: componentLayout minSvgWidth updated', { component: componentName, value, coerced: panelState.minSvgWidth });
      if(typeof config?.onMinSvgWidth === 'function'){
        try{
          config.onMinSvgWidth(panelState.minSvgWidth, { elements, component: componentName });
        }catch(err){
          console.error('Shared.componentLayout onMinSvgWidth error', err);
        }
      }
    };
    if(Number.isFinite(config?.initialMinSvgWidth)){
      updateMinSvgWidth(config.initialMinSvgWidth);
    }

    if(elements.resizeTarget && typeof Shared.attachResizableBox === 'function'){
      const sizing = (function resolveSizing(){
        if(typeof config?.getSizing === 'function'){
          try{
            const customSizing = config.getSizing({ elements, component: componentName });
            if(customSizing){
              console.debug('Debug: componentLayout using custom sizing', { component: componentName, customSizing });
              return customSizing;
            }
          }catch(err){
            console.error('Shared.componentLayout getSizing error', err);
          }
        }
        if(typeof graphSizing?.ensureCssVariables === 'function'){
          graphSizing.ensureCssVariables({ context: componentName });
        }
        if(typeof graphSizing?.getSizing === 'function'){
          try{
            const sizingHelper = graphSizing.getSizing({ context: componentName });
            if(sizingHelper){
              console.debug('Debug: componentLayout using graphSizing helper', { component: componentName, sizingHelper });
              return sizingHelper;
            }
          }catch(err){
            console.error('Shared.componentLayout graphSizing error', err);
          }
        }
        const fallbackSizing = {
          width: Number(chartStyle?.DEFAULT_WIDTH) || 640,
          height: Number(chartStyle?.DEFAULT_HEIGHT) || Number(chartStyle?.DEFAULT_WIDTH) || 640,
          minWidth: Math.max(1, Math.round((Number(chartStyle?.DEFAULT_WIDTH) || 640) * (Number(chartStyle?.RESIZE_MIN_SCALE) || 0.3))),
          minHeight: Math.max(1, Math.round((Number(chartStyle?.DEFAULT_HEIGHT) || Number(chartStyle?.DEFAULT_WIDTH) || 640) * (Number(chartStyle?.RESIZE_MIN_SCALE) || 0.3))),
          maxWidth: Math.max(Number(chartStyle?.DEFAULT_WIDTH) || 640, Math.round((Number(chartStyle?.DEFAULT_WIDTH) || 640) * Math.max(Number(chartStyle?.RESIZE_MAX_SCALE) || 3, Number(chartStyle?.RESIZE_MIN_SCALE) || 0.3))),
          maxHeight: Math.max(Number(chartStyle?.DEFAULT_HEIGHT) || Number(chartStyle?.DEFAULT_WIDTH) || 640, Math.round((Number(chartStyle?.DEFAULT_HEIGHT) || Number(chartStyle?.DEFAULT_WIDTH) || 640) * Math.max(Number(chartStyle?.RESIZE_MAX_SCALE) || 3, Number(chartStyle?.RESIZE_MIN_SCALE) || 0.3))),
          aspectRatio: chartStyle?.DEFAULT_ASPECT_RATIO || 1,
          aspectLocked: chartStyle?.DEFAULT_ASPECT_LOCKED !== false
        };
        console.debug('Debug: componentLayout fallback sizing used', { component: componentName, fallbackSizing });
        return fallbackSizing;
      })();

      const userResizeOptions = config?.resizableBoxOptions || {};
      const shouldSkipResizePhaseSchedule = (() => {
        const configuredPhases = config?.skipScheduleOnResizePhases;
        if(typeof configuredPhases === 'function'){
          return phase => {
            try{
              return !!configuredPhases(phase, { elements, component: componentName });
            }catch(err){
              console.error('Shared.componentLayout skipScheduleOnResizePhases error', err);
              return false;
            }
          };
        }
        if(configuredPhases instanceof Set){
          return phase => configuredPhases.has(phase);
        }
        if(Array.isArray(configuredPhases)){
          const normalized = new Set(configuredPhases.map(phase => String(phase)));
          return phase => normalized.has(String(phase));
        }
        return () => false;
      })();
      const isDisplayOnlyZoomPhase = phase => phase === 'zoom';
      const onResize = phase => {
        const zoomDisplayOnly = isDisplayOnlyZoomPhase(phase);
        const phaseSkipSchedule = shouldSkipResizePhaseSchedule(phase);
        // Zoom must behave like a pure magnifier: keep geometry/layout data stable
        // and avoid triggering component draw callbacks that recompute chart geometry.
        // Manual drag resize phases continue to use the normal redraw pipeline.
        console.debug('Debug: componentLayout resizable onResize', {
          component: componentName,
          phase,
          zoomDisplayOnly,
          phaseSkipSchedule
        });
        const flags = evaluateScheduleFlags({
          source: 'resize',
          phase,
          skipSchedule: zoomDisplayOnly || phaseSkipSchedule
        });
        syncPanels({
          skipSchedule: flags.skipSchedule || zoomDisplayOnly,
          source: 'resize',
          phase
        });
        if(!zoomDisplayOnly && typeof Shared.axisControls?.refreshActivePanel === 'function'){
          try{
            Shared.axisControls.refreshActivePanel({
              scopeId: componentName,
              reason: `component-layout-resize-${phase || 'unknown'}`,
              phase,
              component: componentName
            });
          }catch(err){
            console.error('Shared.componentLayout axisControls refresh error', err);
          }
        }
        if(flags.suppressResizeCallback || zoomDisplayOnly){
          return;
        }
        if(typeof userResizeOptions.onResize === 'function'){
          try{
            userResizeOptions.onResize(phase, { elements, component: componentName });
          }catch(err){
            console.error('Shared.componentLayout resizable onResize error', err);
          }
        }
      };

      Shared.attachResizableBox(elements.resizeTarget, {
        defaultWidth: sizing.width,
        defaultHeight: sizing.height,
        minWidth: sizing.minWidth,
        minHeight: sizing.minHeight,
        maxWidth: sizing.maxWidth,
        maxHeight: sizing.maxHeight,
        defaultAspectLocked: sizing.aspectLocked !== false,
        aspectRatio: Number.isFinite(sizing.aspectRatio) ? sizing.aspectRatio : 1,
        allowUnlimitedWidth: true,
        allowUnlimitedHeight: true,
        componentName,
        tabId: layoutTabId || undefined,
        ...userResizeOptions,
        onResize
      });
      console.debug('Debug: componentLayout attachResizableBox applied', { component: componentName });
    }else{
      console.debug('Debug: componentLayout attachResizableBox skipped', {
        component: componentName,
        hasTarget: !!elements.resizeTarget,
        hasHelper: typeof Shared.attachResizableBox === 'function'
      });
    }

    if(elements.panelResizer && elements.tablePanel && elements.graphPanel && typeof Shared.resizer?.attachPanelDragResizer === 'function'){
      Shared.resizer.attachPanelDragResizer({
        panelResizer: elements.panelResizer,
        tablePanel: elements.tablePanel,
        graphPanel: elements.graphPanel,
        configPanel: elements.configPanel,
        debugLabel: componentName,
        syncPanels: opts => syncPanels(opts || {}),
        computeMinSvgWidth: () => {
          const computed = computeMinSvgWidth({ elements, component: componentName });
          console.debug('Debug: componentLayout computeMinSvgWidth invoked', { component: componentName, computed });
          return computed;
        },
        onMinSvgWidth: value => updateMinSvgWidth(value),
        ...config?.panelResizerOptions
      });
      console.debug('Debug: componentLayout panel drag resizer attached', { component: componentName });
    }else{
      console.debug('Debug: componentLayout panel drag resizer skipped', {
        component: componentName,
        hasPanelResizer: !!elements.panelResizer,
        hasTable: !!elements.tablePanel,
        hasGraph: !!elements.graphPanel,
        hasHelper: typeof Shared.resizer?.attachPanelDragResizer === 'function'
      });
    }

    const STYLE_PROPS = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'flex', 'flexBasis', 'aspectRatio'];

    const cloneDataset = (element) => {
      if(!element || !element.dataset){ return null; }
      const entries = Object.entries(element.dataset);
      if(!entries.length){ return null; }
      const clone = {};
      entries.forEach(([key, value]) => {
        clone[key] = value;
      });
      return clone;
    };

    const cloneStyle = (element) => {
      if(!element || !element.style){ return null; }
      const result = {};
      STYLE_PROPS.forEach(prop => {
        const value = element.style[prop];
        if(typeof value === 'string' && value.length){
          result[prop] = value;
        }
      });
      return Object.keys(result).length ? result : null;
    };

    const normalizeLiveResizableSnapshot = (element, snapshot, contextLabel) => {
      if(!element || !snapshot || typeof snapshot !== 'object'){
        return snapshot;
      }
      const dataset = snapshot.dataset && typeof snapshot.dataset === 'object'
        ? { ...snapshot.dataset }
        : {};
      const style = snapshot.style && typeof snapshot.style === 'object'
        ? { ...snapshot.style }
        : {};
      const rect = element.getBoundingClientRect?.() || null;
      const zoomScaleRaw = Number(dataset.resizerZoomLevel || dataset.resizerZoom);
      const zoomScale = Number.isFinite(zoomScaleRaw) && zoomScaleRaw > 0 ? zoomScaleRaw : 1;
      const liveWidth = Number(rect?.width);
      const liveHeight = Number(rect?.height);
      const widthPx = Number.isFinite(liveWidth) && liveWidth > 0 ? Math.round(liveWidth) : NaN;
      const heightPx = Number.isFinite(liveHeight) && liveHeight > 0 ? Math.round(liveHeight) : NaN;
      const baseWidthPx = Number.isFinite(widthPx) && widthPx > 0 ? Math.max(1, Math.round(widthPx / zoomScale)) : NaN;
      const baseHeightPx = Number.isFinite(heightPx) && heightPx > 0 ? Math.max(1, Math.round(heightPx / zoomScale)) : NaN;
      if(Number.isFinite(widthPx) && widthPx > 0){
        style.width = `${widthPx}px`;
        dataset.resizerWidth = style.width;
      }
      if(Number.isFinite(heightPx) && heightPx > 0){
        style.height = `${heightPx}px`;
        dataset.resizerHeight = style.height;
      }
      if(Number.isFinite(baseWidthPx) && baseWidthPx > 0){
        dataset.resizerBaseWidth = String(baseWidthPx);
      }
      if(Number.isFinite(baseHeightPx) && baseHeightPx > 0){
        dataset.resizerBaseHeight = String(baseHeightPx);
      }
      if(dataset.resizerAspectLocked === 'true' && Number.isFinite(baseWidthPx) && baseWidthPx > 0 && Number.isFinite(baseHeightPx) && baseHeightPx > 0){
        dataset.resizerAspectRatio = String(baseWidthPx / baseHeightPx);
      }
      console.debug('Debug: componentLayout live resizable snapshot normalized', {
        component: componentName,
        context: contextLabel,
        widthPx: Number.isFinite(widthPx) ? widthPx : null,
        heightPx: Number.isFinite(heightPx) ? heightPx : null,
        baseWidthPx: Number.isFinite(baseWidthPx) ? baseWidthPx : null,
        baseHeightPx: Number.isFinite(baseHeightPx) ? baseHeightPx : null,
        aspectLocked: dataset.resizerAspectLocked === 'true',
        aspectRatio: dataset.resizerAspectRatio || null
      });
      return {
        style: Object.keys(style).length ? style : null,
        dataset: Object.keys(dataset).length ? dataset : null
      };
    };

    const captureState = () => {
      const aspectCheckbox = elements.svgBox?.querySelector?.('.resizer-aspect-checkbox') || null;
      if(aspectCheckbox && elements.svgBox?.dataset){
        elements.svgBox.dataset.resizerAspectLocked = aspectCheckbox.checked ? 'true' : 'false';
        const tab = layoutTabId ? Shared.workspaceTabs?.resolveTab?.(layoutTabId) : null;
        if(tab){
          tab.sharedState = tab.sharedState || {};
          tab.sharedState.layout = tab.sharedState.layout || {};
          tab.sharedState.layout.resizer = tab.sharedState.layout.resizer || {};
          tab.sharedState.layout.resizer.aspectLocked = !!aspectCheckbox.checked;
        }
      }
      const normalizedSvgSnapshot = normalizeLiveResizableSnapshot(elements.svgBox, {
        style: cloneStyle(elements.svgBox),
        dataset: cloneDataset(elements.svgBox)
      }, 'svgBox');
      const state = {
        version: 1,
        component: componentName,
        minSvgWidth: Number.isFinite(panelState.minSvgWidth) ? panelState.minSvgWidth : null,
        svgBox: normalizedSvgSnapshot,
        tablePanel: {
          style: cloneStyle(elements.tablePanel),
          dataset: cloneDataset(elements.tablePanel)
        },
        graphPanel: {
          style: cloneStyle(elements.graphPanel),
          dataset: cloneDataset(elements.graphPanel)
        },
        configPanel: {
          style: cloneStyle(elements.configPanel)
        }
      };
      console.debug('Debug: componentLayout captureState', {
        component: componentName,
        hasSvg: !!state.svgBox?.style || !!state.svgBox?.dataset,
        hasTable: !!state.tablePanel?.style || !!state.tablePanel?.dataset,
        minSvgWidth: state.minSvgWidth
      });
      return state;
    };

    const applyStyle = (element, map, contextLabel, options = {}) => {
      if(!element){ return; }
      const reset = options.reset === true;
      if(reset && element.style){
        STYLE_PROPS.forEach(prop => {
          try{
            element.style[prop] = '';
          }catch(err){
            console.error('Shared.componentLayout applyStyle reset error', { component: componentName, prop, context: contextLabel, err });
          }
        });
      }
      if(!map){ return; }
      Object.entries(map).forEach(([prop, value]) => {
        try{
          element.style[prop] = value || '';
        }catch(err){
          console.error('Shared.componentLayout applyStyle error', { component: componentName, prop, value, context: contextLabel, err });
        }
      });
    };

    const applyDataset = (element, map, contextLabel, options = {}) => {
      if(!element || !element.dataset){ return; }
      const reset = options.reset === true;
      if(reset){
        const keys = Object.keys(element.dataset);
        keys.forEach(key => {
          if(!map || !Object.prototype.hasOwnProperty.call(map, key)){
            try{
              delete element.dataset[key];
            }catch(err){
              console.error('Shared.componentLayout applyDataset reset error', { component: componentName, key, context: contextLabel, err });
            }
          }
        });
      }
      if(!map){ return; }
      Object.entries(map).forEach(([key, value]) => {
        try{
          if(value === undefined || value === null || value === ''){
            delete element.dataset[key];
          }else{
            element.dataset[key] = String(value);
          }
        }catch(err){
          console.error('Shared.componentLayout applyDataset error', { component: componentName, key, value, context: contextLabel, err });
        }
      });
    };

    const applyState = (state, options = {}) => {
      const resetStyles = options.resetStyles === true;
      const resetDataset = options.resetDataset === true;
      if(!state || typeof state !== 'object'){
        if(resetStyles || resetDataset){
          applyStyle(elements.tablePanel, null, 'table', { reset: resetStyles });
          applyDataset(elements.tablePanel, null, 'table', { reset: resetDataset });
          applyStyle(elements.graphPanel, null, 'graph', { reset: resetStyles });
          applyDataset(elements.graphPanel, null, 'graph', { reset: resetDataset });
          applyStyle(elements.configPanel, null, 'config', { reset: resetStyles });
          applyStyle(elements.svgBox, null, 'svg', { reset: resetStyles });
          applyDataset(elements.svgBox, null, 'svg', { reset: resetDataset });
          const skipSchedule = options.skipSchedule === true;
          syncPanels({ skipSchedule });
          console.debug('Debug: componentLayout applyState reset', {
            component: componentName,
            resetStyles,
            resetDataset,
            skipSchedule
          });
          return true;
        }
        return false;
      }
      const clonedState = state;
      if(Number.isFinite(clonedState.minSvgWidth)){
        updateMinSvgWidth(clonedState.minSvgWidth);
      }
      applyStyle(elements.tablePanel, clonedState.tablePanel?.style, 'table', { reset: resetStyles });
      applyDataset(elements.tablePanel, clonedState.tablePanel?.dataset, 'table', { reset: resetDataset });
      applyStyle(elements.graphPanel, clonedState.graphPanel?.style, 'graph', { reset: resetStyles });
      applyDataset(elements.graphPanel, clonedState.graphPanel?.dataset, 'graph', { reset: resetDataset });
      applyStyle(elements.configPanel, clonedState.configPanel?.style, 'config', { reset: resetStyles });
      applyStyle(elements.svgBox, clonedState.svgBox?.style, 'svg', { reset: resetStyles });
      applyDataset(elements.svgBox, clonedState.svgBox?.dataset, 'svg', { reset: resetDataset });
      if(elements.svgBox?.dataset?.resizerAspectLocked === 'true'){
        const appliedWidth = Number.parseFloat(elements.svgBox.style?.width || elements.svgBox.dataset?.resizerWidth || '');
        const appliedHeight = Number.parseFloat(elements.svgBox.style?.height || elements.svgBox.dataset?.resizerHeight || '');
        const zoomCandidate = Number(elements.svgBox.dataset?.resizerZoomLevel || elements.svgBox.dataset?.resizerZoom);
        const zoomScale = Number.isFinite(zoomCandidate) && zoomCandidate > 0 ? zoomCandidate : 1;
        const baseWidth = Number.isFinite(appliedWidth) && appliedWidth > 0 ? Math.max(1, Math.round(appliedWidth / zoomScale)) : NaN;
        const baseHeight = Number.isFinite(appliedHeight) && appliedHeight > 0 ? Math.max(1, Math.round(appliedHeight / zoomScale)) : NaN;
        if(Number.isFinite(baseWidth) && baseWidth > 0 && Number.isFinite(baseHeight) && baseHeight > 0){
          elements.svgBox.dataset.resizerAspectRatio = String(baseWidth / baseHeight);
          elements.svgBox.dataset.resizerBaseWidth = String(baseWidth);
          elements.svgBox.dataset.resizerBaseHeight = String(baseHeight);
          elements.svgBox.dataset.resizerWidth = `${Math.round(appliedWidth)}px`;
          elements.svgBox.dataset.resizerHeight = `${Math.round(appliedHeight)}px`;
          console.debug('Debug: componentLayout applyState normalized svg sizing authority', {
            component: componentName,
            widthPx: Math.round(appliedWidth),
            heightPx: Math.round(appliedHeight),
            baseWidth,
            baseHeight,
            aspectRatio: elements.svgBox.dataset.resizerAspectRatio
          });
        }
      }
      const overrideTab = options.tabId ? Shared.workspaceTabs?.resolveTab?.(options.tabId) : null;
      const overrideAspectLocked = overrideTab?.sharedState?.layout?.resizer?.aspectLocked;
      if(typeof overrideAspectLocked === 'boolean'){
        applyAspectLockToSvgBox(elements.svgBox, overrideAspectLocked);
      }
      const zoomApi = elements.svgBox?.__sharedResizableBoxApi;
      if(zoomApi && typeof zoomApi.setZoomLevel === 'function'){
        const requestedZoom = Number(elements.svgBox?.dataset?.resizerZoomLevel || elements.svgBox?.dataset?.resizerZoom);
        if(Number.isFinite(requestedZoom) && requestedZoom > 0){
          zoomApi.setZoomLevel(requestedZoom, { reason: `${componentName}-layout-apply` });
        }
      }
      const skipSchedule = options.skipSchedule === true;
      syncPanels({ skipSchedule });
      console.debug('Debug: componentLayout applyState', {
        component: componentName,
        applied: true,
        skipSchedule
      });
      return true;
    };

    syncPanels();

    const defaultState = captureState();
    const layoutApi = {
      componentName,
      tabId: layoutTabId || null,
      elements,
      syncPanels,
      setScheduleDraw(fn){
        scheduleDrawFn = typeof fn === 'function' ? fn : null;
        console.debug('Debug: componentLayout scheduleDraw updated', { component: componentName, hasSchedule: !!scheduleDrawFn });
      },
      suppressNextSchedule(options = {}){
        const delayMs = Number.isFinite(options?.delayMs) ? Number(options.delayMs) : restoreDelayMs;
        const count = Number.isFinite(options?.count) ? Math.max(0, Math.floor(options.count)) : 2;
        panelState.forceDeferUntil = Date.now() + Math.max(0, delayMs);
        panelState.forceDeferReason = options?.reason || 'manual';
        panelState.forceSkipSchedules = Math.max(panelState.forceSkipSchedules, count);
        if(isDebugEnabled()){
          console.debug('Debug: componentLayout schedule suppressed', {
            component: componentName,
            delayMs,
            reason: panelState.forceDeferReason,
            count: panelState.forceSkipSchedules
          });
        }
      },
      updateSvgBox(node){
        elements.svgBox = node;
        if(!selectors.resizeTarget){
          elements.resizeTarget = node;
        }
        console.debug('Debug: componentLayout svgBox updated', { component: componentName, hasSvgBox: !!node });
      },
      updateMinSvgWidth,
      captureState,
      applyState,
      defaultState,
      destroy(){
        if(panelState.resizeObserver){
          try{
            panelState.resizeObserver.disconnect();
          }catch(err){
            console.error('Shared.componentLayout destroy observer error', err);
          }
          panelState.resizeObserver = null;
          console.debug('Debug: componentLayout ResizeObserver disconnected', { component: componentName });
        }
        const bucket = layoutRegistry[componentName];
        if(bucket && bucket.__isTabScopedBucket === true){
          if(layoutTabId && bucket.tabs?.[layoutTabId] === layoutApi){
            delete bucket.tabs[layoutTabId];
          }
          if(bucket.__default === layoutApi){
            bucket.__default = null;
          }
          console.debug('Debug: componentLayout registry entry removed', { component: componentName });
        }else if(layoutRegistry[componentName] === layoutApi){
          delete layoutRegistry[componentName];
          console.debug('Debug: componentLayout registry entry removed', { component: componentName });
        }
      }
    };

    const bucket = ensureRegistryBucket(componentName);
    if(bucket){
      if(layoutTabId){
        bucket.tabs[layoutTabId] = layoutApi;
      }else{
        bucket.__default = layoutApi;
      }
    }else{
      layoutRegistry[componentName] = layoutApi;
    }
    console.debug('Debug: componentLayout registry updated', { component: componentName, tabId: layoutTabId || null, hasCapture: true, hasApply: true });

    return layoutApi;
  };

  componentLayout.captureStateFor = function captureStateFor(componentName, options = {}){
    if(!componentName){ return null; }
    const entry = resolveRegistryEntry(componentName, options);
    if(entry && typeof entry.captureState === 'function'){
      try{
        return entry.captureState();
      }catch(err){
        console.error('Shared.componentLayout.captureStateFor error', { component: componentName, err });
      }
    }
    console.debug('Debug: componentLayout.captureStateFor skipped', { component: componentName, tabId: options?.tabId || null, hasEntry: !!entry });
    return null;
  };

  componentLayout.applyStateFor = function applyStateFor(componentName, state, options = {}){
    if(!componentName){ return false; }
    const entry = resolveRegistryEntry(componentName, options);
    if(entry && typeof entry.applyState === 'function'){
      try{
        return entry.applyState(state, options);
      }catch(err){
        console.error('Shared.componentLayout.applyStateFor error', { component: componentName, err });
      }
    }
    console.debug('Debug: componentLayout.applyStateFor skipped', { component: componentName, tabId: options?.tabId || null, hasEntry: !!entry });
    return false;
  };

  componentLayout.getDefaultStateFor = function getDefaultStateFor(componentName, options = {}){
    if(!componentName){ return null; }
    const entry = resolveRegistryEntry(componentName, options);
    if(entry && entry.defaultState){
      return entry.defaultState;
    }
    console.debug('Debug: componentLayout getDefaultStateFor skipped', { component: componentName, tabId: options?.tabId || null, hasEntry: !!entry });
    return null;
  };

  componentLayout.suppressNextScheduleFor = function suppressNextScheduleFor(componentName, options = {}){
    if(!componentName){ return false; }
    const entry = resolveRegistryEntry(componentName, options);
    if(entry && typeof entry.suppressNextSchedule === 'function'){
      try{
        entry.suppressNextSchedule(options);
        return true;
      }catch(err){
        console.error('Shared.componentLayout.suppressNextScheduleFor error', { component: componentName, err });
      }
    }
    console.debug('Debug: componentLayout.suppressNextScheduleFor skipped', { component: componentName, tabId: options?.tabId || null, hasEntry: !!entry });
    return false;
  };

  componentLayout.syncTabStateToControlsFor = function syncTabStateToControlsFor(componentName, options = {}){
    const tabId = normalizeTabId(options.tabId || options.workspaceTabId || options.activeTabId);
    const entry = resolveRegistryEntry(componentName, { tabId });
    const tab = tabId ? Shared.workspaceTabs?.resolveTab?.(tabId) : Shared.workspaceTabs?.resolveTab?.(null);
    const aspectLocked = tab?.sharedState?.layout?.resizer?.aspectLocked;
    if(!entry?.elements?.svgBox || typeof aspectLocked !== 'boolean'){
      return false;
    }
    const synced = applyAspectLockToSvgBox(entry.elements.svgBox, aspectLocked);
    console.debug('Debug: componentLayout tab controls synced', {
      component: componentName || null,
      tabId: tab?.id || tabId || null,
      aspectLocked,
      synced
    });
    return synced;
  };
})(window);
