// Shared helper for component panel layout, resizers, and wrapper styling
// Exposes Shared.componentLayout.createStandardPanels(config)
(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const componentLayout = Shared.componentLayout = Shared.componentLayout || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const graphSizing = Shared.graphSizing = Shared.graphSizing || {};

  const layoutRegistry = componentLayout.__registry = componentLayout.__registry || {};

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
      selector: selectors.configPanel || (() => elements.graphPanel?.querySelector('.config-panel') || elements.graphPanel?.querySelector('.config-options')),
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
      forceSkipSchedules: 0
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
      const now = Date.now();
      const visibility = resolveVisibility();
      let forceDeferActive = false;
      let forceSkipActive = false;
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

    const syncPanels = (options = {}) => {
      const flags = evaluateScheduleFlags(options);
      const skipSchedule = flags.skipSchedule;
      if(typeof Shared.syncPanelWidths !== 'function'){
        console.debug('Debug: componentLayout syncPanels skipped - missing Shared.syncPanelWidths', { component: componentName });
        return;
      }
      const scheduleWrapper = (!skipSchedule && scheduleDrawFn) ? () => {
        console.debug('Debug: componentLayout scheduleDraw invoked', { component: componentName });
        scheduleDrawFn();
      } : null;
      const syncOptions = Object.assign({ forceDefaultWidth: true }, config?.panelSyncOptions || {});
      Object.assign(syncOptions, {
        svgBox: elements.svgBox,
        minSvgWidth: panelState.minSvgWidth,
        debugLabel: componentName,
        panelResizer: elements.panelResizer,
        skipSchedule,
        preserveGraphContent
      });
      Shared.syncPanelWidths(elements.tablePanel, elements.graphPanel, elements.configPanel, scheduleWrapper, syncOptions);
      console.debug('Debug: componentLayout syncPanels complete', { component: componentName, minSvgWidth: panelState.minSvgWidth });
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
        console.debug('Debug: componentLayout ResizeObserver triggered', { component: componentName });
        syncPanels({ source: 'observer' });
      });
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
      const isDisplayOnlyZoomPhase = phase => phase === 'zoom';
      const onResize = phase => {
        const zoomDisplayOnly = isDisplayOnlyZoomPhase(phase);
        // Zoom must behave like a pure magnifier: keep geometry/layout data stable
        // and avoid triggering component draw callbacks that recompute chart geometry.
        // Manual drag resize phases continue to use the normal redraw pipeline.
        console.debug('Debug: componentLayout resizable onResize', {
          component: componentName,
          phase,
          zoomDisplayOnly
        });
        const flags = evaluateScheduleFlags({
          source: 'resize',
          phase,
          skipSchedule: zoomDisplayOnly
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
        aspectLocked: sizing.aspectLocked !== false,
        aspectRatio: Number.isFinite(sizing.aspectRatio) ? sizing.aspectRatio : 1,
        allowUnlimitedWidth: true,
        allowUnlimitedHeight: true,
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

    const captureState = () => {
      const state = {
        version: 1,
        component: componentName,
        minSvgWidth: Number.isFinite(panelState.minSvgWidth) ? panelState.minSvgWidth : null,
        svgBox: {
          style: cloneStyle(elements.svgBox),
          dataset: cloneDataset(elements.svgBox)
        },
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
        if(layoutRegistry[componentName] === layoutApi){
          delete layoutRegistry[componentName];
          console.debug('Debug: componentLayout registry entry removed', { component: componentName });
        }
      }
    };

    layoutRegistry[componentName] = layoutApi;
    console.debug('Debug: componentLayout registry updated', { component: componentName, hasCapture: true, hasApply: true });

    return layoutApi;
  };

  componentLayout.captureStateFor = function captureStateFor(componentName){
    if(!componentName){ return null; }
    const entry = layoutRegistry[componentName];
    if(entry && typeof entry.captureState === 'function'){
      try{
        return entry.captureState();
      }catch(err){
        console.error('Shared.componentLayout.captureStateFor error', { component: componentName, err });
      }
    }
    console.debug('Debug: componentLayout.captureStateFor skipped', { component: componentName, hasEntry: !!entry });
    return null;
  };

  componentLayout.applyStateFor = function applyStateFor(componentName, state, options = {}){
    if(!componentName){ return false; }
    const entry = layoutRegistry[componentName];
    if(entry && typeof entry.applyState === 'function'){
      try{
        return entry.applyState(state, options);
      }catch(err){
        console.error('Shared.componentLayout.applyStateFor error', { component: componentName, err });
      }
    }
    console.debug('Debug: componentLayout.applyStateFor skipped', { component: componentName, hasEntry: !!entry });
    return false;
  };

  componentLayout.getDefaultStateFor = function getDefaultStateFor(componentName){
    if(!componentName){ return null; }
    const entry = layoutRegistry[componentName];
    if(entry && entry.defaultState){
      return entry.defaultState;
    }
    console.debug('Debug: componentLayout getDefaultStateFor skipped', { component: componentName, hasEntry: !!entry });
    return null;
  };

  componentLayout.suppressNextScheduleFor = function suppressNextScheduleFor(componentName, options = {}){
    if(!componentName){ return false; }
    const entry = layoutRegistry[componentName];
    if(entry && typeof entry.suppressNextSchedule === 'function'){
      try{
        entry.suppressNextSchedule(options);
        return true;
      }catch(err){
        console.error('Shared.componentLayout.suppressNextScheduleFor error', { component: componentName, err });
      }
    }
    console.debug('Debug: componentLayout.suppressNextScheduleFor skipped', { component: componentName, hasEntry: !!entry });
    return false;
  };
})(window);
