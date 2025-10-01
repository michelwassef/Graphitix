// Shared helper for component panel layout, resizers, and wrapper styling
// Exposes Shared.componentLayout.createStandardPanels(config)
(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const componentLayout = Shared.componentLayout = Shared.componentLayout || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};

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

  function computeFallbackSizing(componentName){
    const baseWidth = Number(chartStyle?.DEFAULT_WIDTH) || 640;
    const baseHeight = Number(chartStyle?.DEFAULT_HEIGHT) || baseWidth;
    const minScale = Number(chartStyle?.RESIZE_MIN_SCALE) || 0.3;
    const maxScale = Number(chartStyle?.RESIZE_MAX_SCALE) || 3;
    const fallback = {
      width: baseWidth,
      height: baseHeight,
      minWidth: Math.max(1, Math.round(baseWidth * minScale)),
      minHeight: Math.max(1, Math.round(baseHeight * minScale)),
      maxWidth: Math.max(baseWidth, Math.round(baseWidth * Math.max(maxScale, minScale))),
      maxHeight: Math.max(baseHeight, Math.round(baseHeight * Math.max(maxScale, minScale))),
      aspectRatio: chartStyle?.DEFAULT_ASPECT_RATIO || 1,
      aspectLocked: chartStyle?.DEFAULT_ASPECT_LOCKED !== false
    };
    console.debug('Debug: componentLayout fallback sizing', { component: componentName, fallback });
    return fallback;
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
      selector: selectors.configPanel || (() => elements.graphPanel?.querySelector('.config-options')),
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
      resizeObserver: null
    };

    const syncPanels = () => {
      if(typeof Shared.syncPanelWidths !== 'function'){
        console.debug('Debug: componentLayout syncPanels skipped - missing Shared.syncPanelWidths', { component: componentName });
        return;
      }
      const scheduleWrapper = scheduleDrawFn ? () => {
        console.debug('Debug: componentLayout scheduleDraw invoked', { component: componentName });
        scheduleDrawFn();
      } : null;
      Shared.syncPanelWidths(elements.tablePanel, elements.graphPanel, elements.configPanel, scheduleWrapper, {
        svgBox: elements.svgBox,
        minSvgWidth: panelState.minSvgWidth,
        debugLabel: componentName,
        panelResizer: elements.panelResizer
      });
      console.debug('Debug: componentLayout syncPanels complete', { component: componentName, minSvgWidth: panelState.minSvgWidth });
      if(typeof config?.onAfterSync === 'function'){
        try{
          config.onAfterSync({ elements, component: componentName });
        }catch(err){
          console.error('Shared.componentLayout onAfterSync error', err);
        }
      }
    };

    if(global.ResizeObserver && elements.tablePanel){
      panelState.resizeObserver = new global.ResizeObserver(() => {
        console.debug('Debug: componentLayout ResizeObserver triggered', { component: componentName });
        syncPanels();
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
        if(typeof chartStyle?.getSquareGraphSizing === 'function'){
          try{
            const sizingResult = chartStyle.getSquareGraphSizing({ context: componentName });
            if(sizingResult){
              console.debug('Debug: componentLayout using chartStyle sizing', { component: componentName, sizingResult });
              return sizingResult;
            }
          }catch(err){
            console.error('Shared.componentLayout chartStyle sizing error', err);
          }
        }
        return computeFallbackSizing(componentName);
      })();

      const userResizeOptions = config?.resizableBoxOptions || {};
      const onResize = phase => {
        console.debug('Debug: componentLayout resizable onResize', { component: componentName, phase });
        syncPanels();
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
        syncPanels: () => syncPanels(),
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

    syncPanels();

    return {
      elements,
      syncPanels,
      setScheduleDraw(fn){
        scheduleDrawFn = typeof fn === 'function' ? fn : null;
        console.debug('Debug: componentLayout scheduleDraw updated', { component: componentName, hasSchedule: !!scheduleDrawFn });
      },
      updateSvgBox(node){
        elements.svgBox = node;
        if(!selectors.resizeTarget){
          elements.resizeTarget = node;
        }
        console.debug('Debug: componentLayout svgBox updated', { component: componentName, hasSvgBox: !!node });
      },
      updateMinSvgWidth,
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
      }
    };
  };
})(window);
