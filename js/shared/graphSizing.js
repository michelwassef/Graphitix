(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const graphSizing = Shared.graphSizing = Shared.graphSizing || {};

  const TYPE_TO_PAGE = Object.freeze({
    venn: { pageId: 'vennPage' },
    box: { pageId: 'boxPage' },
    scatter: { pageId: 'scatterPage' },
    pca: { pageId: 'pcaPage' },
    line: { pageId: 'linePage' },
    heatmap: { pageId: 'heatmapPage' },
    surface: { pageId: 'surfacePage' },
    roc: { pageId: 'rocPage' },
    survival: { pageId: 'survivalPage' },
    hist: { pageId: 'histPage' },
    pie: { pageId: 'piePage' }
  });

  let cssApplied = false;

  function debug(message, payload) {
    if (typeof Shared.debug === 'function') {
      Shared.debug(message, payload);
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      if (typeof payload === 'undefined') {
        console.debug(message);
      } else {
        console.debug(message, payload);
      }
    }
  }

  function cloneValue(value){
    if(value == null){ return value; }
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      return value;
    }
  }

  function ensureObject(value){
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function toPositiveNumber(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function parsePxLike(value){
    if(typeof value === 'number'){
      return toPositiveNumber(value);
    }
    if(typeof value !== 'string'){
      return null;
    }
    const trimmed = value.trim();
    if(!trimmed){ return null; }
    if(/^infinity$/i.test(trimmed) || /^none$/i.test(trimmed)){
      return null;
    }
    const match = trimmed.match(/-?\d+(?:\.\d+)?/);
    return match ? toPositiveNumber(match[0]) : null;
  }

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
    debug('Debug: graphSizing.computeFallbackSizing', { context, sizing });
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
    debug('Debug: graphSizing.getSizing resolved', { context, sizing });
    return sizing;
  }

  function setCssVariables(target, sizing){
    const style = target?.style;
    if(!style || !sizing){
      debug('Debug: graphSizing.setCssVariables skipped', { hasStyle: !!style, hasSizing: !!sizing });
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
    debug('Debug: graphSizing.setCssVariables applied', { sizing });
  }

  function buildNormalizedSizingRecord(raw, options = {}){
    const context = options.context || 'payload-graph-sizing';
    const fallback = getSizingInternal({ context });
    const source = ensureObject(raw);
    const rawDisplay = source.display && typeof source.display === 'object' ? source.display : source;
    const rawExport = source.export && typeof source.export === 'object' ? source.export : {};

    const widthPx = toPositiveNumber(rawDisplay.widthPx)
      || toPositiveNumber(rawDisplay.width)
      || fallback.width;
    const heightPx = toPositiveNumber(rawDisplay.heightPx)
      || toPositiveNumber(rawDisplay.height)
      || fallback.height;
    const minWidthPx = toPositiveNumber(rawDisplay.minWidthPx)
      || toPositiveNumber(rawDisplay.minWidth)
      || Math.max(1, Math.round(widthPx * ((Number(chartStyle?.RESIZE_MIN_SCALE) || 0.3))));
    const minHeightPx = toPositiveNumber(rawDisplay.minHeightPx)
      || toPositiveNumber(rawDisplay.minHeight)
      || Math.max(1, Math.round(heightPx * ((Number(chartStyle?.RESIZE_MIN_SCALE) || 0.3))));
    const maxWidthPx = toPositiveNumber(rawDisplay.maxWidthPx)
      || toPositiveNumber(rawDisplay.maxWidth)
      || Math.max(widthPx, fallback.maxWidth);
    const maxHeightPx = toPositiveNumber(rawDisplay.maxHeightPx)
      || toPositiveNumber(rawDisplay.maxHeight)
      || Math.max(heightPx, fallback.maxHeight);
    const aspectRatio = toPositiveNumber(rawDisplay.aspectRatio) || (widthPx > 0 && heightPx > 0 ? widthPx / heightPx : fallback.aspectRatio || 1);
    const aspectLocked = rawDisplay.aspectLocked !== false;
    const allowUnlimitedWidth = rawDisplay.allowUnlimitedWidth === true || rawDisplay.maxWidthPx === null || rawDisplay.maxWidth === null;

    const exportWidthPx = toPositiveNumber(rawExport.widthPx)
      || toPositiveNumber(rawExport.width)
      || widthPx;
    const exportHeightPx = toPositiveNumber(rawExport.heightPx)
      || toPositiveNumber(rawExport.height)
      || heightPx;

    const record = {
      version: 1,
      display: {
        widthPx,
        heightPx,
        minWidthPx,
        minHeightPx,
        maxWidthPx,
        maxHeightPx,
        aspectRatio,
        aspectLocked,
        allowUnlimitedWidth
      },
      export: {
        widthPx: exportWidthPx,
        heightPx: exportHeightPx
      }
    };
    debug('Debug: graphSizing.buildNormalizedSizingRecord', { context, record });
    return record;
  }

  function applySizingRecordToElement(element, record, options = {}){
    if(!element || !record || !record.display){
      debug('Debug: graphSizing.applySizingRecordToElement skipped', {
        hasElement: !!element,
        hasRecord: !!record
      });
      return null;
    }
    const display = record.display;
    const style = element.style || null;
    const data = element.dataset || null;
    const toPx = value => Number.isFinite(value) ? `${Math.round(value)}px` : '';

    if(style){
      style.width = toPx(display.widthPx);
      style.height = toPx(display.heightPx);
      style.minWidth = toPx(display.minWidthPx);
      style.minHeight = toPx(display.minHeightPx);
      style.maxWidth = display.allowUnlimitedWidth === true ? '' : toPx(display.maxWidthPx);
      style.maxHeight = toPx(display.maxHeightPx);
      style.aspectRatio = Number.isFinite(display.aspectRatio) && display.aspectRatio > 0
        ? String(display.aspectRatio)
        : '';
    }

    if(data){
      data.graphWidthPx = String(Math.round(display.widthPx));
      data.graphHeightPx = String(Math.round(display.heightPx));
      data.graphMinWidthPx = String(Math.round(display.minWidthPx));
      data.graphMinHeightPx = String(Math.round(display.minHeightPx));
      data.graphMaxWidthPx = display.allowUnlimitedWidth === true ? 'Infinity' : String(Math.round(display.maxWidthPx));
      data.graphMaxHeightPx = String(Math.round(display.maxHeightPx));
      data.graphAspectRatio = String(display.aspectRatio);
      data.graphAspectLocked = display.aspectLocked !== false ? 'true' : 'false';
      data.graphSizingVersion = String(record.version || 1);

      data.resizerDefaultWidth = String(Math.round(display.widthPx));
      data.resizerDefaultHeight = String(Math.round(display.heightPx));
      data.resizerMinWidth = String(Math.round(display.minWidthPx));
      data.resizerMinHeight = String(Math.round(display.minHeightPx));
      data.resizerMaxWidth = display.allowUnlimitedWidth === true ? 'Infinity' : String(Math.round(display.maxWidthPx));
      data.resizerMaxHeight = String(Math.round(display.maxHeightPx));
      data.resizerAspectRatio = String(display.aspectRatio);
      data.resizerAspectLocked = display.aspectLocked !== false ? 'true' : 'false';
      data.resizerUnlimitedWidth = display.allowUnlimitedWidth === true ? 'true' : 'false';
      data.graphDefaultWidth = String(Math.round(display.widthPx));
      data.graphDefaultHeight = String(Math.round(display.heightPx));
      data.graphMinWidth = String(Math.round(display.minWidthPx));
      data.graphMinHeight = String(Math.round(display.minHeightPx));
      data.graphMaxWidth = display.allowUnlimitedWidth === true ? 'Infinity' : String(Math.round(display.maxWidthPx));
      data.graphMaxHeight = String(Math.round(display.maxHeightPx));
      data.graphAspectLocked = display.aspectLocked !== false ? 'true' : 'false';
    }

    debug('Debug: graphSizing.applySizingRecordToElement applied', {
      context: options.context || null,
      widthPx: display.widthPx,
      heightPx: display.heightPx,
      allowUnlimitedWidth: display.allowUnlimitedWidth === true
    });
    return record;
  }

  function captureSizingRecordFromSources(source, options = {}){
    const context = options.context || 'capture-sources';
    const fallback = getSizingInternal({ context });
    const style = ensureObject(source?.style);
    const data = ensureObject(source?.dataset);
    const rect = ensureObject(source?.rect);

    const widthPx = parsePxLike(style.width)
      || parsePxLike(data.graphWidthPx)
      || parsePxLike(data.resizerDefaultWidth)
      || toPositiveNumber(rect.width)
      || fallback.width;
    const heightPx = parsePxLike(style.height)
      || parsePxLike(data.graphHeightPx)
      || parsePxLike(data.resizerDefaultHeight)
      || toPositiveNumber(rect.height)
      || fallback.height;
    const minWidthPx = parsePxLike(style.minWidth)
      || parsePxLike(data.graphMinWidthPx)
      || parsePxLike(data.resizerMinWidth)
      || fallback.minWidth;
    const minHeightPx = parsePxLike(style.minHeight)
      || parsePxLike(data.graphMinHeightPx)
      || parsePxLike(data.resizerMinHeight)
      || fallback.minHeight;

    const rawMaxWidth = parsePxLike(style.maxWidth)
      || parsePxLike(data.graphMaxWidthPx)
      || parsePxLike(data.resizerMaxWidth);
    const allowUnlimitedWidth = (typeof data.resizerUnlimitedWidth === 'string' && data.resizerUnlimitedWidth === 'true')
      || (typeof data.resizerMaxWidth === 'string' && /^infinity$/i.test(data.resizerMaxWidth));
    const maxWidthPx = allowUnlimitedWidth ? Math.max(widthPx, fallback.maxWidth) : (rawMaxWidth || fallback.maxWidth);
    const maxHeightPx = parsePxLike(style.maxHeight)
      || parsePxLike(data.graphMaxHeightPx)
      || parsePxLike(data.resizerMaxHeight)
      || fallback.maxHeight;
    const aspectRatio = parsePxLike(style.aspectRatio)
      || parsePxLike(data.graphAspectRatio)
      || parsePxLike(data.resizerAspectRatio)
      || (widthPx > 0 && heightPx > 0 ? widthPx / heightPx : fallback.aspectRatio || 1);
    const aspectLocked = data.graphAspectLocked === 'false'
      ? false
      : (data.resizerAspectLocked === 'false' ? false : fallback.aspectLocked !== false);

    return buildNormalizedSizingRecord({
      display: {
        widthPx,
        heightPx,
        minWidthPx,
        minHeightPx,
        maxWidthPx,
        maxHeightPx,
        aspectRatio,
        aspectLocked,
        allowUnlimitedWidth
      },
      export: {
        widthPx,
        heightPx
      }
    }, { context });
  }

  function resolveSvgBoxForType(type, options = {}){
    if(options.element){
      return options.element;
    }
    const descriptor = TYPE_TO_PAGE[type] || null;
    if(descriptor && global.document?.getElementById){
      const page = global.document.getElementById(descriptor.pageId);
      if(page){
        const box = page.querySelector('.svgbox');
        if(box){
          return box;
        }
      }
    }
    return global.document?.querySelector?.('.page.active .svgbox')
      || global.document?.querySelector?.('.svgbox')
      || null;
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
      debug('Debug: graphSizing.ensureCssVariables success', { context: options.context || null, width: sizing.width, height: sizing.height });
    } else {
      debug('Debug: graphSizing.ensureCssVariables skipped', { hasDocument: !!doc });
    }
  };

  graphSizing.applySizingToElement = function applySizingToElement(element, options = {}){
    if(!element){
      debug('Debug: graphSizing.applySizingToElement skipped', { reason: 'missing-element' });
      return null;
    }
    const sizing = getSizingInternal({ context: options.context || element.id || 'element' });
    const record = buildNormalizedSizingRecord({
      display: {
        widthPx: sizing.width,
        heightPx: sizing.height,
        minWidthPx: sizing.minWidth,
        minHeightPx: sizing.minHeight,
        maxWidthPx: sizing.maxWidth,
        maxHeightPx: sizing.maxHeight,
        aspectRatio: sizing.aspectRatio,
        aspectLocked: sizing.aspectLocked
      },
      export: {
        widthPx: sizing.width,
        heightPx: sizing.height
      }
    }, { context: options.context || element.id || 'element' });
    return applySizingRecordToElement(element, record, options);
  };

  graphSizing.normalizeSizingRecord = function normalizeSizingRecord(raw, options = {}){
    return buildNormalizedSizingRecord(raw, options);
  };

  graphSizing.getPayloadSizing = function getPayloadSizing(payload, options = {}){
    const record = payload?.meta?.graphSizing;
    if(!record || typeof record !== 'object'){
      debug('Debug: graphSizing.getPayloadSizing skipped', { hasPayload: !!payload, hasRecord: false, context: options.context || null });
      return null;
    }
    return buildNormalizedSizingRecord(record, { context: options.context || 'payload-read' });
  };

  graphSizing.setPayloadSizing = function setPayloadSizing(payload, sizing, options = {}){
    const nextPayload = cloneValue(payload) || {};
    nextPayload.meta = ensureObject(nextPayload.meta);
    nextPayload.meta.graphSizing = buildNormalizedSizingRecord(sizing, { context: options.context || 'payload-write' });
    debug('Debug: graphSizing.setPayloadSizing', {
      type: options.type || nextPayload.type || null,
      context: options.context || null,
      widthPx: nextPayload.meta.graphSizing.display.widthPx,
      heightPx: nextPayload.meta.graphSizing.display.heightPx
    });
    return nextPayload;
  };

  graphSizing.captureElementSizing = function captureElementSizing(element, options = {}){
    if(!element){
      debug('Debug: graphSizing.captureElementSizing skipped', { reason: 'missing-element', context: options.context || null });
      return null;
    }
    let rect = null;
    try{
      rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
    }catch(err){
      console.error('Shared.graphSizing.captureElementSizing rect error', err);
    }
    const record = captureSizingRecordFromSources({
      style: element.style || null,
      dataset: element.dataset || null,
      rect: rect || null
    }, { context: options.context || element.id || 'capture-element' });
    debug('Debug: graphSizing.captureElementSizing', {
      context: options.context || null,
      widthPx: record?.display?.widthPx || null,
      heightPx: record?.display?.heightPx || null
    });
    return record;
  };

  graphSizing.captureLayoutSizing = function captureLayoutSizing(layoutState, options = {}){
    if(!layoutState || typeof layoutState !== 'object'){
      debug('Debug: graphSizing.captureLayoutSizing skipped', { reason: 'missing-layout', context: options.context || null });
      return null;
    }
    const record = captureSizingRecordFromSources({
      style: layoutState?.svgBox?.style || null,
      dataset: layoutState?.svgBox?.dataset || null,
      rect: null
    }, { context: options.context || 'capture-layout' });
    debug('Debug: graphSizing.captureLayoutSizing', {
      context: options.context || null,
      widthPx: record?.display?.widthPx || null,
      heightPx: record?.display?.heightPx || null
    });
    return record;
  };

  graphSizing.mergePayloadSizingIntoLayout = function mergePayloadSizingIntoLayout(layoutState, payload, options = {}){
    const record = graphSizing.getPayloadSizing(payload, { context: options.context || 'merge-payload-into-layout' });
    if(!record){
      return cloneValue(layoutState) || null;
    }
    const nextLayout = cloneValue(layoutState) || { version: 1, svgBox: {}, tablePanel: {}, graphPanel: {}, configPanel: {} };
    nextLayout.svgBox = ensureObject(nextLayout.svgBox);
    nextLayout.svgBox.style = ensureObject(nextLayout.svgBox.style);
    nextLayout.svgBox.dataset = ensureObject(nextLayout.svgBox.dataset);

    applySizingRecordToElement({
      style: nextLayout.svgBox.style,
      dataset: nextLayout.svgBox.dataset
    }, record, { context: options.context || 'merge-payload-into-layout' });

    debug('Debug: graphSizing.mergePayloadSizingIntoLayout', {
      context: options.context || null,
      widthPx: record.display.widthPx,
      heightPx: record.display.heightPx
    });
    return nextLayout;
  };

  graphSizing.enrichPayloadWithLayout = function enrichPayloadWithLayout(type, payload, layoutState, options = {}){
    let record = graphSizing.captureLayoutSizing(layoutState, {
      context: options.context || `${type || 'graph'}-layout-capture`
    });
    if(!record){
      const element = resolveSvgBoxForType(type, options);
      if(element){
        record = graphSizing.captureElementSizing(element, {
          context: options.context || `${type || 'graph'}-element-capture`
        });
      }
    }
    if(!record){
      record = buildNormalizedSizingRecord({}, { context: options.context || `${type || 'graph'}-fallback-capture` });
    }
    return graphSizing.setPayloadSizing(payload, record, {
      context: options.context || `${type || 'graph'}-payload-enrich`,
      type
    });
  };

  graphSizing.enrichPayloadForType = function enrichPayloadForType(type, payload, options = {}){
    let layoutState = options.layoutState || null;
    if(!layoutState){
      try{
        const workspace = options.workspace || global.Main?.components?.get?.(type) || null;
        if(workspace && typeof workspace.getLayoutState === 'function'){
          layoutState = workspace.getLayoutState();
        }
      }catch(err){
        console.error('Shared.graphSizing.enrichPayloadForType workspace layout error', err);
      }
    }
    return graphSizing.enrichPayloadWithLayout(type, payload, layoutState, options);
  };

  graphSizing.applyPayloadSizingToElement = function applyPayloadSizingToElement(element, payload, options = {}){
    const record = graphSizing.getPayloadSizing(payload, { context: options.context || 'apply-payload-to-element' });
    if(!record || !element){
      debug('Debug: graphSizing.applyPayloadSizingToElement skipped', {
        hasElement: !!element,
        hasRecord: !!record,
        context: options.context || null
      });
      return null;
    }
    return applySizingRecordToElement(element, record, options);
  };

  graphSizing.applyPayloadSizingForType = function applyPayloadSizingForType(type, payload, options = {}){
    const record = graphSizing.getPayloadSizing(payload, { context: options.context || `${type || 'graph'}-apply` });
    if(!record){
      return false;
    }
    const attempts = Array.isArray(options.retryDelaysMs) && options.retryDelaysMs.length
      ? options.retryDelaysMs
      : [0, 40, 120, 260];
    let applied = false;
    attempts.forEach(delay => {
      global.setTimeout(() => {
        const element = resolveSvgBoxForType(type, options);
        if(!element || applied){
          return;
        }
        const result = applySizingRecordToElement(element, record, {
          context: options.context || `${type || 'graph'}-apply`,
          delay
        });
        if(result){
          applied = true;
          debug('Debug: graphSizing.applyPayloadSizingForType success', {
            type,
            delay,
            widthPx: record.display.widthPx,
            heightPx: record.display.heightPx
          });
        }
      }, Math.max(0, Number(delay) || 0));
    });
    return true;
  };

  graphSizing.captureSvgBoxForType = function captureSvgBoxForType(type, options = {}){
    const element = resolveSvgBoxForType(type, options);
    return graphSizing.captureElementSizing(element, {
      context: options.context || `${type || 'graph'}-capture-svgbox`
    });
  };
})(window);
