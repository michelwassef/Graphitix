(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const graphSizing = Shared.graphSizing = Shared.graphSizing || {};

  let cssApplied = false;

  function computeFallbackSizing(context){
    const baseWidth = Number(chartStyle?.DEFAULT_WIDTH) || 640;
    const baseHeight = Number(chartStyle?.DEFAULT_HEIGHT) || baseWidth;
    const minScale = Number(chartStyle?.RESIZE_MIN_SCALE) || 0.3;
    const maxScale = Number(chartStyle?.RESIZE_MAX_SCALE) || 3;
    const effectiveMaxScale = Math.max(maxScale, minScale);
    const sizing = {
      width: baseWidth,
      height: baseHeight,
      minWidth: Math.max(1, Math.round(baseWidth * minScale)),
      minHeight: Math.max(1, Math.round(baseHeight * minScale)),
      maxWidth: Math.max(baseWidth, Math.round(baseWidth * effectiveMaxScale)),
      maxHeight: Math.max(baseHeight, Math.round(baseHeight * effectiveMaxScale)),
      aspectRatio: chartStyle?.DEFAULT_ASPECT_RATIO || 1,
      aspectLocked: chartStyle?.DEFAULT_ASPECT_LOCKED !== false
    };
    console.debug('Debug: graphSizing.computeFallbackSizing', { context, sizing });
    return sizing;
  }

  function cloneSizing(source){
    if(!source || typeof source !== 'object'){ return null; }
    return {
      width: Number(source.width),
      height: Number(source.height),
      minWidth: Number(source.minWidth),
      minHeight: Number(source.minHeight),
      maxWidth: Number(source.maxWidth),
      maxHeight: Number(source.maxHeight),
      aspectRatio: Number(source.aspectRatio),
      aspectLocked: source.aspectLocked !== false
    };
  }

  function getSizingInternal(options){
    const context = options?.context || 'graph-sizing';
    let sizing = null;
    if(typeof chartStyle?.getSquareGraphSizing === 'function'){
      try {
        const resolved = chartStyle.getSquareGraphSizing({ context });
        if(resolved && typeof resolved === 'object'){
          sizing = cloneSizing(resolved);
        }
      } catch(err){
        console.error('Shared.graphSizing.getSizing chartStyle error', err);
      }
    }
    if(!sizing){
      sizing = computeFallbackSizing(context);
    }
    console.debug('Debug: graphSizing.getSizing resolved', { context, sizing });
    return sizing;
  }

  function setCssVariables(target, sizing){
    const style = target?.style;
    if(!style || !sizing){
      console.debug('Debug: graphSizing.setCssVariables skipped', { hasStyle: !!style, hasSizing: !!sizing });
      return;
    }
    const toPx = value => Number.isFinite(value) ? `${Math.round(value)}px` : null;
    const assignments = {
      '--graph-default-width': toPx(sizing.width),
      '--graph-default-height': toPx(sizing.height),
      '--graph-min-width': toPx(sizing.minWidth),
      '--graph-min-height': toPx(sizing.minHeight),
      '--graph-max-width': toPx(sizing.maxWidth),
      '--graph-max-height': toPx(sizing.maxHeight),
      '--graph-aspect-ratio': Number.isFinite(sizing.aspectRatio) && sizing.aspectRatio > 0
        ? String(sizing.aspectRatio)
        : '1'
    };
    Object.entries(assignments).forEach(([prop, value]) => {
      if(typeof value === 'string'){
        style.setProperty(prop, value);
      }
    });
    console.debug('Debug: graphSizing.setCssVariables applied', { sizing });
  }

  graphSizing.getSizing = function getSizing(options){
    return getSizingInternal(options || {});
  };

  graphSizing.ensureCssVariables = function ensureCssVariables(options = {}){
    if(cssApplied && options.refresh !== true){
      return;
    }
    const doc = options.document || global.document || null;
    const sizing = getSizingInternal({ context: options.context || 'css-vars' });
    if(doc?.documentElement){
      setCssVariables(doc.documentElement, sizing);
      cssApplied = true;
      console.debug('Debug: graphSizing.ensureCssVariables success', { context: options.context || null, width: sizing.width, height: sizing.height });
    } else {
      console.debug('Debug: graphSizing.ensureCssVariables skipped', { hasDocument: !!doc });
    }
  };

  graphSizing.applySizingToElement = function applySizingToElement(element, options = {}){
    if(!element){
      console.debug('Debug: graphSizing.applySizingToElement skipped', { reason: 'missing-element' });
      return null;
    }
    const sizing = getSizingInternal({ context: options.context || element.id || 'element' });
    const toPx = value => Number.isFinite(value) ? `${Math.round(value)}px` : null;
    const widthPx = toPx(sizing.width);
    const heightPx = toPx(sizing.height);
    if(widthPx){ element.style.width = widthPx; }
    if(heightPx){ element.style.height = heightPx; }
    if(Number.isFinite(sizing.minWidth)){ element.style.minWidth = toPx(sizing.minWidth); }
    if(Number.isFinite(sizing.minHeight)){ element.style.minHeight = toPx(sizing.minHeight); }
    if(Number.isFinite(sizing.maxWidth)){ element.style.maxWidth = toPx(Math.max(sizing.width || 0, sizing.maxWidth)); }
    if(Number.isFinite(sizing.maxHeight)){ element.style.maxHeight = toPx(Math.max(sizing.height || 0, sizing.maxHeight)); }
    if(Number.isFinite(sizing.aspectRatio) && sizing.aspectRatio > 0){
      element.style.aspectRatio = String(sizing.aspectRatio);
    }
    const dataset = element.dataset || {};
    dataset.graphDefaultWidth = String(sizing.width);
    dataset.graphDefaultHeight = String(sizing.height);
    dataset.graphMinWidth = String(sizing.minWidth);
    dataset.graphMinHeight = String(sizing.minHeight);
    dataset.graphMaxWidth = String(sizing.maxWidth);
    dataset.graphMaxHeight = String(sizing.maxHeight);
    dataset.graphAspectRatio = String(Number.isFinite(sizing.aspectRatio) ? sizing.aspectRatio : 1);
    dataset.graphAspectLocked = sizing.aspectLocked !== false ? 'true' : 'false';
    console.debug('Debug: graphSizing.applySizingToElement applied', {
      context: options.context || null,
      width: sizing.width,
      height: sizing.height
    });
    return sizing;
  };
})(window);
