// Shared resizer utility for .svgbox containers
// Usage: Shared.attachResizableBox(container)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};

  function clampDimension(value, min, max){
    if(!Number.isFinite(value)) return NaN;
    let result = Math.round(value);
    if(Number.isFinite(min)){
      result = Math.max(min, result);
    }
    if(Number.isFinite(max)){
      result = Math.min(max, result);
    }
    return result;
  }

  function parsePositive(value){
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : NaN;
  }

  function enforceAspectRatio(opts){
    const {
      width,
      height,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      ratio,
      axis,
      fallbackWidth,
      fallbackHeight,
      label
    } = opts || {};
    const debugLabel = label || 'resizer';
    if(!Number.isFinite(ratio) || ratio <= 0){
      console.debug('Debug: enforceAspectRatio skipped', { debugLabel, ratio }); // Debug: invalid ratio guard
      return {
        width: clampDimension(width, minWidth, maxWidth),
        height: clampDimension(height, minHeight, maxHeight)
      };
    }
    const clampWidth = (val) => clampDimension(val, minWidth, maxWidth);
    const clampHeight = (val) => clampDimension(val, minHeight, maxHeight);
    let widthCandidate = Number.isFinite(width) ? clampWidth(width) : NaN;
    let heightCandidate = Number.isFinite(height) ? clampHeight(height) : NaN;

    if(axis === 'y' && Number.isFinite(heightCandidate)){
      widthCandidate = clampWidth(heightCandidate * ratio);
    }else if(axis === 'x' && Number.isFinite(widthCandidate)){
      heightCandidate = clampHeight(widthCandidate / ratio);
    }else{
      if(!Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
        widthCandidate = clampWidth(heightCandidate * ratio);
      }
      if(!Number.isFinite(heightCandidate) && Number.isFinite(widthCandidate)){
        heightCandidate = clampHeight(widthCandidate / ratio);
      }
      if(Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
        const widthDrivenHeight = clampHeight(widthCandidate / ratio);
        const heightDrivenWidth = clampWidth(heightCandidate * ratio);
        const widthError = Math.abs(widthDrivenHeight - heightCandidate);
        const heightError = Math.abs(heightDrivenWidth - widthCandidate);
        if(heightError < widthError){
          widthCandidate = heightDrivenWidth;
          heightCandidate = clampHeight(widthCandidate / ratio);
        }else{
          heightCandidate = widthDrivenHeight;
          widthCandidate = clampWidth(heightCandidate * ratio);
        }
      }
    }

    if(!Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
      widthCandidate = clampWidth(heightCandidate * ratio);
    }
    if(!Number.isFinite(heightCandidate) && Number.isFinite(widthCandidate)){
      heightCandidate = clampHeight(widthCandidate / ratio);
    }
    if(!Number.isFinite(widthCandidate) && !Number.isFinite(heightCandidate)){
      if(Number.isFinite(fallbackWidth)){
        widthCandidate = clampWidth(fallbackWidth);
        heightCandidate = clampHeight(widthCandidate / ratio);
      }else if(Number.isFinite(fallbackHeight)){
        heightCandidate = clampHeight(fallbackHeight);
        widthCandidate = clampWidth(heightCandidate * ratio);
      }
    }
    if(!Number.isFinite(widthCandidate) || !Number.isFinite(heightCandidate)){
      console.debug('Debug: enforceAspectRatio fallback insufficient', {
        debugLabel,
        width,
        height,
        fallbackWidth,
        fallbackHeight,
        ratio
      }); // Debug: insufficient data to enforce
      return { width: widthCandidate, height: heightCandidate };
    }

    for(let i = 0; i < 3; i += 1){
      const idealHeight = clampHeight(widthCandidate / ratio);
      const idealWidth = clampWidth(idealHeight * ratio);
      const adjustedHeight = clampHeight(idealWidth / ratio);
      if(Math.abs(idealWidth - widthCandidate) <= 1 && Math.abs(adjustedHeight - idealHeight) <= 1){
        widthCandidate = idealWidth;
        heightCandidate = adjustedHeight;
        break;
      }
      widthCandidate = idealWidth;
      heightCandidate = adjustedHeight;
    }

    console.debug('Debug: enforceAspectRatio result', {
      debugLabel,
      axis,
      output: { width: widthCandidate, height: heightCandidate },
      ratio,
      bounds: { minWidth, maxWidth, minHeight, maxHeight }
    }); // Debug: aspect ratio enforcement result

    return { width: widthCandidate, height: heightCandidate };
  }

  function px(n){ return Math.round(n) + 'px'; }

  Shared.attachResizableBox = function attachResizableBox(container, opts={}){
    if(!container) return;
    const rect = container.getBoundingClientRect();
    const data = container.dataset || {};
    const chartStyle = Shared.chartStyle || {};
    const resizeMinScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
    const resizeMaxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
    const defaultWidthFallback = Number(chartStyle.DEFAULT_WIDTH) || 640;
    const defaultHeightFallback = Number(chartStyle.DEFAULT_HEIGHT) || 420;
    const parsedDefaultWidth = Number(opts.defaultWidth);
    const parsedDefaultHeight = Number(opts.defaultHeight);
    let defaultWidth = Number.isFinite(parsedDefaultWidth) && parsedDefaultWidth > 0
      ? parsedDefaultWidth
      : Number(data.resizerDefaultWidth);
    if(!Number.isFinite(defaultWidth) || defaultWidth <= 0){
      const rectWidth = Math.round(rect.width);
      defaultWidth = rectWidth > 0 ? rectWidth : defaultWidthFallback;
    }
    let defaultHeight = Number.isFinite(parsedDefaultHeight) && parsedDefaultHeight > 0
      ? parsedDefaultHeight
      : Number(data.resizerDefaultHeight);
    if(!Number.isFinite(defaultHeight) || defaultHeight <= 0){
      const rectHeight = Math.round(rect.height);
      defaultHeight = rectHeight > 0 ? rectHeight : defaultHeightFallback;
    }
    const minFromDefaultWidth = Math.max(1, Math.round(defaultWidth * resizeMinScale));
    const minFromDefaultHeight = Math.max(1, Math.round(defaultHeight * resizeMinScale));
    const maxFromDefaultWidth = Math.max(defaultWidth, Math.round(defaultWidth * resizeMaxScale));
    const maxFromDefaultHeight = Math.max(defaultHeight, Math.round(defaultHeight * resizeMaxScale));
    const parsedMinWidth = Number(opts.minWidth);
    const parsedMinHeight = Number(opts.minHeight);
    let MIN_W = Number.isFinite(parsedMinWidth) && parsedMinWidth > 0 ? parsedMinWidth : Number(data.resizerMinWidth);
    if(!Number.isFinite(MIN_W) || MIN_W <= 0){
      MIN_W = minFromDefaultWidth;
    }
    MIN_W = Math.max(MIN_W, minFromDefaultWidth);
    let MIN_H = Number.isFinite(parsedMinHeight) && parsedMinHeight > 0 ? parsedMinHeight : Number(data.resizerMinHeight);
    if(!Number.isFinite(MIN_H) || MIN_H <= 0){
      MIN_H = minFromDefaultHeight;
    }
    MIN_H = Math.max(MIN_H, minFromDefaultHeight);
    const parsedMaxWidth = Number(opts.maxWidth);
    const parsedMaxHeight = Number(opts.maxHeight);
    let MAX_W = Number.isFinite(parsedMaxWidth) && parsedMaxWidth > 0 ? parsedMaxWidth : Number(data.resizerMaxWidth);
    if(!Number.isFinite(MAX_W) || MAX_W <= 0){
      MAX_W = maxFromDefaultWidth;
    }
    MAX_W = Math.max(MAX_W, defaultWidth);
    MAX_W = Math.min(MAX_W, Math.max(defaultWidth, maxFromDefaultWidth));
    let MAX_H = Number.isFinite(parsedMaxHeight) && parsedMaxHeight > 0 ? parsedMaxHeight : Number(data.resizerMaxHeight);
    if(!Number.isFinite(MAX_H) || MAX_H <= 0){
      MAX_H = maxFromDefaultHeight;
    }
    MAX_H = Math.max(MAX_H, defaultHeight);
    MAX_H = Math.min(MAX_H, Math.max(defaultHeight, maxFromDefaultHeight));
    data.resizerDefaultWidth = String(defaultWidth);
    data.resizerDefaultHeight = String(defaultHeight);
    data.resizerMinWidth = String(MIN_W);
    data.resizerMinHeight = String(MIN_H);
    data.resizerMaxWidth = String(MAX_W);
    data.resizerMaxHeight = String(MAX_H);
    data.resizerResized = data.resizerResized || 'false';

    const ratioFromDefaults = (Number.isFinite(defaultWidth) && defaultWidth > 0 && Number.isFinite(defaultHeight) && defaultHeight > 0)
      ? (defaultWidth / defaultHeight)
      : NaN;
    const rectWidthVal = parsePositive(rect.width);
    const rectHeightVal = parsePositive(rect.height);
    const ratioFromRect = (Number.isFinite(rectWidthVal) && Number.isFinite(rectHeightVal) && rectHeightVal > 0)
      ? (rectWidthVal / rectHeightVal)
      : NaN;
    let aspectRatio = parsePositive(data.resizerAspectRatio);
    if(!Number.isFinite(aspectRatio)){
      aspectRatio = Number.isFinite(ratioFromRect) ? ratioFromRect : ratioFromDefaults;
    }
    if(!Number.isFinite(aspectRatio) || aspectRatio <= 0){
      aspectRatio = Number.isFinite(ratioFromDefaults) ? ratioFromDefaults : 1;
    }
    let aspectLocked = data.resizerAspectLocked === 'true';
    if(aspectLocked && (!Number.isFinite(aspectRatio) || aspectRatio <= 0)){
      aspectLocked = false;
    }
    data.resizerAspectLocked = aspectLocked ? 'true' : 'false';
    const containerLabel = container.id || container.className || 'svgbox';

    function setAspectRatio(nextRatio){
      if(!Number.isFinite(nextRatio) || nextRatio <= 0) return;
      aspectRatio = nextRatio;
      data.resizerAspectRatio = String(nextRatio);
      console.debug('Debug: resizer aspect ratio set', { container: containerLabel, aspectRatio }); // Debug: aspect ratio set
    }

    function getActiveRatio(){
      if(Number.isFinite(aspectRatio) && aspectRatio > 0){
        return aspectRatio;
      }
      const fallback = Number.isFinite(ratioFromDefaults) && ratioFromDefaults > 0 ? ratioFromDefaults : 1;
      setAspectRatio(fallback);
      console.debug('Debug: resizer aspect ratio fallback', { container: containerLabel, fallback }); // Debug: aspect ratio fallback
      return aspectRatio;
    }

    function readRectRatio(){
      const liveRect = container.getBoundingClientRect();
      const liveWidth = parsePositive(liveRect.width);
      const liveHeight = parsePositive(liveRect.height);
      if(Number.isFinite(liveWidth) && Number.isFinite(liveHeight) && liveHeight > 0){
        const ratio = liveWidth / liveHeight;
        setAspectRatio(ratio);
        console.debug('Debug: resizer aspect ratio from rect', { container: containerLabel, ratio }); // Debug: aspect ratio from rect
        return ratio;
      }
      return getActiveRatio();
    }

    function applyResize({ width, height, axis, fallbackWidth, fallbackHeight, reason }){
      let finalWidth = NaN;
      let finalHeight = NaN;
      if(aspectLocked){
        const ratio = getActiveRatio();
        const enforced = enforceAspectRatio({
          width,
          height,
          minWidth: MIN_W,
          maxWidth: MAX_W,
          minHeight: MIN_H,
          maxHeight: MAX_H,
          ratio,
          axis,
          fallbackWidth,
          fallbackHeight,
          label: containerLabel
        });
        finalWidth = enforced.width;
        finalHeight = enforced.height;
      }
      if(!Number.isFinite(finalWidth) && axis !== 'y'){
        finalWidth = clampDimension(width, MIN_W, MAX_W);
      }
      if(!Number.isFinite(finalHeight) && axis !== 'x'){
        finalHeight = clampDimension(height, MIN_H, MAX_H);
      }
      if(Number.isFinite(finalWidth)){
        container.style.width = px(finalWidth);
        container.dataset.resizerWidth = container.style.width;
      }
      if(Number.isFinite(finalHeight)){
        container.style.height = px(finalHeight);
        container.dataset.resizerHeight = container.style.height;
      }
      console.debug('Debug: resizer applyResize helper', {
        container: containerLabel,
        reason,
        axis,
        aspectLocked,
        finalWidth,
        finalHeight
      }); // Debug: apply resize helper
      return { width: finalWidth, height: finalHeight };
    }

    if(Number.isFinite(aspectRatio) && aspectRatio > 0){
      setAspectRatio(aspectRatio);
    }else{
      data.resizerAspectRatio = '';
    }

    console.debug('Debug: attachResizableBox defaults', {
      defaultWidth,
      defaultHeight,
      MIN_W,
      MIN_H,
      MAX_W,
      MAX_H,
      resizeMinScale,
      resizeMaxScale,
      aspectLocked,
      aspectRatio
    }); // Debug: resizer defaults

    const doc = global.document;
    let aspectCheckbox = null;
    if(doc){
      let aspectControl = container.querySelector('.resizer-aspect-control');
      if(!aspectControl){
        aspectControl = doc.createElement('label');
        aspectControl.className = 'resizer-aspect-control';
        aspectControl.title = 'Lock width/height ratio';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'resizer-aspect-checkbox';
        checkbox.setAttribute('aria-label', 'Lock width and height ratio');
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-aspect-text';
        textSpan.textContent = 'Lock ratio';
        aspectControl.appendChild(checkbox);
        aspectControl.appendChild(textSpan);
        container.appendChild(aspectControl);
        console.debug('Debug: resizer aspect control created', { container: containerLabel }); // Debug: control creation
        aspectCheckbox = checkbox;
      }else{
        aspectCheckbox = aspectControl.querySelector('input[type="checkbox"]');
      }
      if(aspectCheckbox){
        aspectCheckbox.checked = aspectLocked;
        if(aspectCheckbox.__resizerAspectHandler){
          aspectCheckbox.removeEventListener('change', aspectCheckbox.__resizerAspectHandler);
        }
        const onAspectChange = () => {
          aspectLocked = !!aspectCheckbox.checked;
          data.resizerAspectLocked = aspectLocked ? 'true' : 'false';
          console.debug('Debug: resizer aspect toggled', { container: containerLabel, aspectLocked }); // Debug: aspect toggle
          if(aspectLocked){
            const updatedRatio = readRectRatio();
            setAspectRatio(updatedRatio);
            const liveRect = container.getBoundingClientRect();
            applyResize({
              axis: 'both',
              width: liveRect.width,
              height: liveRect.height,
              fallbackWidth: defaultWidth,
              fallbackHeight: defaultHeight,
              reason: 'aspect-toggle'
            });
          }
          if(typeof opts.onResize === 'function'){
            try { opts.onResize('aspect-toggle'); } catch(e){ console.error('resizer onResize error', e); }
          }
        };
        aspectCheckbox.addEventListener('change', onAspectChange);
        aspectCheckbox.__resizerAspectHandler = onAspectChange;
      }
    }

    if(aspectLocked){
      const liveRect = container.getBoundingClientRect();
      applyResize({
        axis: 'both',
        width: liveRect.width,
        height: liveRect.height,
        fallbackWidth: defaultWidth,
        fallbackHeight: defaultHeight,
        reason: 'initial-lock'
      });
    }

    const vHandle = container.querySelector('.resizer-vertical');
    const hHandle = container.querySelector('.resizer-horizontal');
    const cHandle = container.querySelector('.resizer-corner');
    console.debug('Debug: attachResizableBox on', containerLabel); // Debug: resizer attach
    container.style.minWidth = px(MIN_W);
    container.style.minHeight = px(MIN_H);
    container.style.maxWidth = px(MAX_W);
    container.style.maxHeight = px(MAX_H);

    function attachDrag(handle, axis){
      if(!handle) return;
      let startX=0, startY=0, startW=0, startH=0, pointerId=null;
      const onPointerDown = (e) => {
        e.preventDefault();
        pointerId = e.pointerId;
        try { handle.setPointerCapture(pointerId); } catch(_) {}
        const rect = container.getBoundingClientRect();
        startW = Math.min(MAX_W, Math.max(MIN_W, Math.round(rect.width)));
        startH = Math.min(MAX_H, Math.max(MIN_H, Math.round(rect.height)));
        startX = e.clientX;
        startY = e.clientY;
        container.style.boxSizing = 'border-box';
        container.style.width = px(startW);
        container.style.height = px(startH);
        container.style.flex = '0 0 auto';
        container.style.maxWidth = 'none';
        container.style.maxHeight = 'none';
        container.dataset.resizerResized = 'true';
        container.dataset.resizerWidth = container.style.width;
        container.dataset.resizerHeight = container.style.height;
        console.debug('Debug: resizer drag start', { axis, startW, startH, MIN_W, MIN_H }); // Debug: resizer drag start
        document.documentElement.style.userSelect = 'none';
        document.documentElement.style.touchAction = 'none';
        const onPointerMove = (ev) => {
          ev.preventDefault();
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const tentativeWidth = startW + dx;
          const tentativeHeight = startH + dy;
          applyResize({
            axis,
            width: axis === 'y' ? startW : tentativeWidth,
            height: axis === 'x' ? startH : tentativeHeight,
            fallbackWidth: startW,
            fallbackHeight: startH,
            reason: 'pointer-move'
          });
          console.debug('Debug: resizer drag move', {
            axis,
            dx,
            dy,
            aspectLocked,
            width: container.style.width,
            height: container.style.height,
            limits: { MIN_W, MAX_W, MIN_H, MAX_H }
          }); // Debug: resizer drag move
          if (typeof opts.onResize === 'function') {
            try { opts.onResize('move'); } catch(e) { console.error('resizer onResize error', e); }
          }
        };
        const onPointerUp = () => {
          try { handle.releasePointerCapture(pointerId); } catch(_) {}
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          document.documentElement.style.userSelect = '';
          document.documentElement.style.touchAction = '';
          console.debug('Debug: resizer drag end'); // Debug: resizer drag end
          if (typeof opts.onResize === 'function') {
            try { opts.onResize('end'); } catch(e) { console.error('resizer onResize error', e); }
          }
        };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
      };
      handle.addEventListener('pointerdown', onPointerDown);
      handle.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        container.style.flex = '0 0 auto';
        container.dataset.resizerResized = 'true';
        const applied = applyResize({
          axis: 'both',
          width: defaultWidth,
          height: defaultHeight,
          fallbackWidth: defaultWidth,
          fallbackHeight: defaultHeight,
          reason: 'dblclick-reset'
        });
        container.style.minWidth = px(MIN_W);
        container.style.maxWidth = px(MAX_W);
        container.style.minHeight = px(MIN_H);
        container.style.maxHeight = px(MAX_H);
        if(aspectLocked){
          readRectRatio();
        }
        console.debug('Debug: resizer size reset', { width: container.style.width, height: container.style.height, applied }); // Debug: resizer reset
        if (typeof opts.onResize === 'function') {
          try { opts.onResize('reset'); } catch(e) { console.error('resizer onResize error', e); }
        }
      });
    }

    attachDrag(vHandle, 'x');
    attachDrag(hHandle, 'y');
    attachDrag(cHandle, 'both');
    if (global.ResizeObserver) {
      const obs = new ResizeObserver(() => {
        console.debug('Debug: resizer observer triggered'); // Debug: resize observer
        if (typeof opts.onResize === 'function') {
          try { opts.onResize('observe'); } catch(e) { console.error('resizer onResize error', e); }
        }
      });
      obs.observe(container);
    }
  };

  Shared.syncPanelWidths = function syncPanelWidths(tablePanel, graphPanel, configPanel, scheduleDraw, opts={}){
    const debugLabel = opts.debugLabel || 'panel';
    if(!tablePanel || !graphPanel || !configPanel){
      console.debug('Debug: Shared.syncPanelWidths skipped', {
        label: debugLabel,
        hasTable: !!tablePanel,
        hasGraph: !!graphPanel,
        hasConfig: !!configPanel
      });
      return null;
    }
    const svgBox = opts.svgBox || graphPanel.querySelector(opts.svgSelector || '.svgbox');
    const diagramSelector = opts.diagramSelector || '.diagram-area';
    const diagramArea = graphPanel.querySelector(diagramSelector);
    const docBody = global.document && global.document.body;
    const isElementHidden = (el) => {
      if (!el) return true;
      if (typeof el.offsetParent === 'undefined') {
        try {
          const style = global.getComputedStyle ? global.getComputedStyle(el) : null;
          return style ? style.display === 'none' : false;
        } catch (err) {
          console.error('Shared.syncPanelWidths hidden detection error', err);
          return false;
        }
      }
      return el.offsetParent === null && el !== docBody;
    };
    const tableHidden = isElementHidden(tablePanel);
    const graphHidden = isElementHidden(graphPanel);
    if (tableHidden || graphHidden) {
      console.debug('Debug: Shared.syncPanelWidths skipped (hidden)', {
        label: debugLabel,
        tableHidden,
        graphHidden
      }); // Debug: skip adjustments for hidden panels
      return null;
    }
    let gap = 0;
    if(diagramArea){
      try{
        const style = (global.getComputedStyle ? global.getComputedStyle(diagramArea) : null) || {};
        gap = parseFloat(style.gap || 0) || 0;
      }catch(err){
        console.error('Shared.syncPanelWidths gap error', err);
      }
    }
    const svgDataset = svgBox && svgBox.dataset ? svgBox.dataset : null;
    const storedTableWidth = svgDataset ? Number(svgDataset.resizerTableWidth) : NaN;
    const isManualResize = svgDataset ? svgDataset.resizerResized === 'true' : false;
    const datasetMinWidth = svgDataset ? parsePositive(svgDataset.resizerMinWidth) : NaN;
    const datasetMaxWidth = svgDataset ? parsePositive(svgDataset.resizerMaxWidth) : NaN;
    const datasetMinHeight = svgDataset ? parsePositive(svgDataset.resizerMinHeight) : NaN;
    const datasetMaxHeight = svgDataset ? parsePositive(svgDataset.resizerMaxHeight) : NaN;
    const datasetDefaultWidth = svgDataset ? parsePositive(svgDataset.resizerDefaultWidth) : NaN;
    const datasetDefaultHeight = svgDataset ? parsePositive(svgDataset.resizerDefaultHeight) : NaN;
    const aspectLocked = svgDataset ? svgDataset.resizerAspectLocked === 'true' : false;
    const storedAspectRatio = svgDataset ? parsePositive(svgDataset.resizerAspectRatio) : NaN;
    const svgRect = svgBox ? svgBox.getBoundingClientRect() : null;
    const svgCurrentWidth = svgRect ? svgRect.width : NaN;
    const svgCurrentHeight = svgRect ? svgRect.height : NaN;
    const tableWidth = tablePanel.getBoundingClientRect().width;
    const graphRect = graphPanel.getBoundingClientRect();
    const graphWidth = graphRect.width;
    const configWidth = configPanel.getBoundingClientRect().width;
    let graphInset = 0;
    let graphContentWidth = Number.isFinite(graphWidth) ? graphWidth : NaN;
    const readNumeric = (val) => {
      const num = Number.parseFloat(val);
      return Number.isFinite(num) ? num : 0;
    };
    if(Number.isFinite(graphWidth) && global.getComputedStyle){
      try{
        const graphStyle = global.getComputedStyle(graphPanel);
        const pad = readNumeric(graphStyle.paddingLeft) + readNumeric(graphStyle.paddingRight);
        const border = readNumeric(graphStyle.borderLeftWidth) + readNumeric(graphStyle.borderRightWidth);
        graphInset = pad + border;
        graphContentWidth = Math.max(0, graphWidth - graphInset);
        console.debug('Debug: Shared.syncPanelWidths graph inset', {
          label: debugLabel,
          graphWidth,
          graphContentWidth,
          graphInset,
          pad,
          border
        }); // Debug: layout inset calculation
      }catch(insetErr){
        console.error('Shared.syncPanelWidths inset error', insetErr);
      }
    }
    const resizerEl = opts.panelResizer || (graphPanel.parentElement ? Array.from(graphPanel.parentElement.children).find(el => el.classList && el.classList.contains('panel-resizer')) : null);
    const resizerWidth = resizerEl ? resizerEl.getBoundingClientRect().width : 0;
    let availableRaw = Number.isFinite(graphContentWidth) ? graphContentWidth - configWidth - gap : NaN;
    const manualWidth = isManualResize && Number.isFinite(svgCurrentWidth) ? svgCurrentWidth : NaN;
    if(isManualResize && Number.isFinite(manualWidth)){
      if(!Number.isFinite(availableRaw) || manualWidth > availableRaw){
        availableRaw = manualWidth;
      }
    }
    let maxAvailable = Number.isFinite(availableRaw) ? Math.max(0, availableRaw) : NaN;
    if(isManualResize && Number.isFinite(manualWidth)){
      maxAvailable = Math.max(manualWidth, maxAvailable || 0);
    }
    if((!Number.isFinite(availableRaw) || maxAvailable <= 0) && !(isManualResize && Number.isFinite(manualWidth) && manualWidth > 0)){
      console.debug('Debug: Shared.syncPanelWidths skipped (no width available)', {
        label: debugLabel,
        available: availableRaw,
        maxAvailable,
        manualWidth
      }); // Debug: guard against zero-width calculations
      return null;
    }
    if(isManualResize && Number.isFinite(manualWidth) && manualWidth > 0){
      availableRaw = Math.max(manualWidth, availableRaw || 0);
      maxAvailable = Math.max(manualWidth, maxAvailable || 0);
    }
    let minSvgWidth = Number.isFinite(opts.minSvgWidth) ? Math.max(0, opts.minSvgWidth) : 0;
    if(Number.isFinite(datasetMinWidth) && datasetMinWidth > 0){
      minSvgWidth = Math.max(minSvgWidth, datasetMinWidth);
    }
    let baseWidth;
    if(isManualResize && Number.isFinite(svgCurrentWidth) && svgCurrentWidth > 0){
      baseWidth = svgCurrentWidth;
    }else{
      const fallbackWidth = Number.isFinite(tableWidth) && tableWidth > 0 ? tableWidth : svgCurrentWidth;
      if(Number.isFinite(maxAvailable) && maxAvailable > 0){
        baseWidth = maxAvailable;
        console.debug('Debug: Shared.syncPanelWidths baseWidth auto-fill', {
          label: debugLabel,
          baseWidth,
          maxAvailable,
          availableRaw,
          fallbackWidth
        }); // Debug: initial auto width uses full graph space
      }else if(Number.isFinite(availableRaw)){
        if(Number.isFinite(fallbackWidth) && fallbackWidth > 0){
          baseWidth = Math.min(fallbackWidth, availableRaw);
        }else{
          baseWidth = availableRaw;
        }
      }else{
        baseWidth = fallbackWidth;
      }
    }
    if(!Number.isFinite(baseWidth) || baseWidth <= 0){
      if(Number.isFinite(svgCurrentWidth) && svgCurrentWidth > 0){
        baseWidth = svgCurrentWidth;
      }else if(Number.isFinite(datasetDefaultWidth) && datasetDefaultWidth > 0){
        baseWidth = datasetDefaultWidth;
      }else if(Number.isFinite(minSvgWidth) && minSvgWidth > 0){
        baseWidth = minSvgWidth;
      }else if(Number.isFinite(maxAvailable) && maxAvailable > 0){
        baseWidth = maxAvailable;
      }else{
        baseWidth = 0;
      }
    }
    let appliedWidth = baseWidth;
    if(Number.isFinite(maxAvailable)){
      appliedWidth = Math.min(appliedWidth, maxAvailable);
    }
    const minTarget = Number.isFinite(minSvgWidth) && minSvgWidth > 0 ? minSvgWidth : 0;
    if(Number.isFinite(maxAvailable) && maxAvailable >= 0 && maxAvailable < minTarget){
      appliedWidth = maxAvailable;
    }else if(appliedWidth < minTarget){
      appliedWidth = minTarget;
    }
    if(svgBox && Number.isFinite(appliedWidth) && appliedWidth > 0){
      let minWidthConstraint = Number.isFinite(datasetMinWidth) ? datasetMinWidth : NaN;
      if(Number.isFinite(minSvgWidth) && minSvgWidth > 0){
        minWidthConstraint = Number.isFinite(minWidthConstraint) ? Math.max(minWidthConstraint, minSvgWidth) : minSvgWidth;
      }
      let maxWidthConstraint = Number.isFinite(datasetMaxWidth) ? datasetMaxWidth : NaN;
      if(Number.isFinite(maxAvailable) && maxAvailable > 0){
        maxWidthConstraint = Number.isFinite(maxWidthConstraint) ? Math.min(maxWidthConstraint, maxAvailable) : maxAvailable;
      }
      if(Number.isFinite(minWidthConstraint) && Number.isFinite(maxWidthConstraint) && maxWidthConstraint < minWidthConstraint){
        maxWidthConstraint = minWidthConstraint;
      }
      let widthToApply = Math.round(appliedWidth);
      let heightToApply = NaN;
      let activeRatio = storedAspectRatio;
      if(aspectLocked){
        const ratioFromDefaults = (Number.isFinite(datasetDefaultWidth) && Number.isFinite(datasetDefaultHeight) && datasetDefaultHeight > 0)
          ? (datasetDefaultWidth / datasetDefaultHeight)
          : NaN;
        const ratioFromCurrent = (Number.isFinite(svgCurrentWidth) && Number.isFinite(svgCurrentHeight) && svgCurrentHeight > 0)
          ? (svgCurrentWidth / svgCurrentHeight)
          : NaN;
        activeRatio = Number.isFinite(activeRatio) ? activeRatio : (Number.isFinite(ratioFromCurrent) ? ratioFromCurrent : ratioFromDefaults);
        if(!Number.isFinite(activeRatio) || activeRatio <= 0){
          activeRatio = Number.isFinite(ratioFromDefaults) && ratioFromDefaults > 0 ? ratioFromDefaults : 1;
        }
        const enforced = enforceAspectRatio({
          width: widthToApply,
          height: svgCurrentHeight,
          minWidth: minWidthConstraint,
          maxWidth: maxWidthConstraint,
          minHeight: datasetMinHeight,
          maxHeight: datasetMaxHeight,
          ratio: activeRatio,
          axis: 'x',
          fallbackWidth: widthToApply,
          fallbackHeight: datasetDefaultHeight,
          label: debugLabel + ' sync'
        });
        if(Number.isFinite(enforced.width)){
          widthToApply = enforced.width;
        }
        if(Number.isFinite(enforced.height)){
          heightToApply = enforced.height;
        }
        if(Number.isFinite(enforced.width) && Number.isFinite(enforced.height) && enforced.height > 0){
          activeRatio = enforced.width / enforced.height;
        }
      }
      if(Number.isFinite(minWidthConstraint)){
        widthToApply = Math.max(widthToApply, Math.round(minWidthConstraint));
      }
      if(Number.isFinite(maxWidthConstraint)){
        widthToApply = Math.min(widthToApply, Math.round(maxWidthConstraint));
      }
      svgBox.style.width = widthToApply + 'px';
      svgBox.style.maxWidth = Math.max(widthToApply, Number.isFinite(datasetDefaultWidth) ? datasetDefaultWidth : widthToApply) + 'px';
      if(svgDataset){
        svgDataset.resizerWidth = svgBox.style.width;
      }
      if(aspectLocked){
        let ratioForHeight = Number.isFinite(activeRatio) && activeRatio > 0 ? activeRatio : NaN;
        if(!Number.isFinite(ratioForHeight) || ratioForHeight <= 0){
          ratioForHeight = Number.isFinite(storedAspectRatio) && storedAspectRatio > 0 ? storedAspectRatio : NaN;
        }
        if(!Number.isFinite(heightToApply) && Number.isFinite(ratioForHeight) && ratioForHeight > 0){
          heightToApply = Math.round(widthToApply / ratioForHeight);
        }
        if(Number.isFinite(heightToApply)){
          if(Number.isFinite(datasetMinHeight)){
            heightToApply = Math.max(heightToApply, Math.round(datasetMinHeight));
          }
          if(Number.isFinite(datasetMaxHeight)){
            heightToApply = Math.min(heightToApply, Math.round(datasetMaxHeight));
          }
          svgBox.style.height = heightToApply + 'px';
          svgBox.style.maxHeight = Math.max(heightToApply, Number.isFinite(datasetDefaultHeight) ? datasetDefaultHeight : heightToApply) + 'px';
          if(svgDataset){
            svgDataset.resizerHeight = svgBox.style.height;
          }
          console.debug('Debug: Shared.syncPanelWidths aspect enforcement', {
            label: debugLabel,
            aspectLocked,
            widthToApply,
            heightToApply,
            ratio: ratioForHeight,
            minWidthConstraint,
            maxWidthConstraint
          }); // Debug: aspect lock enforcement in sync
        }
        appliedWidth = widthToApply;
      }
    }
    if(isManualResize){
      const safeAppliedWidth = Number.isFinite(appliedWidth) && appliedWidth > 0 ? appliedWidth : manualWidth;
      const liveTableWidth = Number.isFinite(tableWidth) && tableWidth > 0 ? tableWidth : (tablePanel.getBoundingClientRect().width || 0);
      const lockedTableWidth = Number.isFinite(storedTableWidth) && storedTableWidth > 0 ? storedTableWidth : liveTableWidth;
      const finalTableWidth = Math.max(150, Math.round(lockedTableWidth));
      if(svgDataset && finalTableWidth > 0){
        svgDataset.resizerTableWidth = String(finalTableWidth);
      }
      if(tablePanel && finalTableWidth > 0){
        tablePanel.style.flex = '0 0 ' + finalTableWidth + 'px';
        tablePanel.style.width = finalTableWidth + 'px';
        tablePanel.style.minWidth = finalTableWidth + 'px';
        tablePanel.style.maxWidth = finalTableWidth + 'px';
      }
      const targetGraphWidth = Number.isFinite(configWidth) ? safeAppliedWidth + configWidth + gap : safeAppliedWidth;
      const finalGraphWidth = Math.max(0, Math.round(targetGraphWidth));
      if(graphPanel && finalGraphWidth > 0){
        graphPanel.style.flex = '0 0 auto';
        graphPanel.style.maxWidth = 'none';
        graphPanel.style.minWidth = finalGraphWidth + 'px';
        graphPanel.style.width = finalGraphWidth + 'px';
      }
      if(configPanel){
        configPanel.style.flex = '0 0 auto';
      }
      const wrap = graphPanel?.parentElement || null;
      if(wrap && wrap.style){
        const resizerSpace = Number.isFinite(resizerWidth) ? resizerWidth : 0;
        const wrapMin = Math.max(0, finalTableWidth + finalGraphWidth + graphInset + resizerSpace);
        wrap.style.minWidth = wrapMin ? wrapMin + 'px' : '';
      }
      const latestGraphWidth = graphPanel?.getBoundingClientRect()?.width || finalGraphWidth;
      console.debug('Debug: Shared.syncPanelWidths manual lock', {
        label: debugLabel,
        appliedWidth: safeAppliedWidth,
        tableWidth: finalTableWidth,
        graphWidth: latestGraphWidth,
        configWidth,
        gap
      });
      if(typeof opts.onWidthApplied === 'function'){
        try{ opts.onWidthApplied(safeAppliedWidth); }catch(err){ console.error('Shared.syncPanelWidths onWidthApplied error', err); }
      }
      if(!opts.skipSchedule && typeof scheduleDraw === 'function'){
        try{ scheduleDraw(); }catch(err){ console.error(debugLabel + ' sync schedule error', err); }
      }
      return {
        tableWidth: finalTableWidth,
        graphWidth: latestGraphWidth,
        configWidth,
        gap,
        available: availableRaw,
        minSvgWidth,
        appliedWidth: safeAppliedWidth,
        graphInset,
        graphContentWidth,
        isManualResize,
        manualWidth: safeAppliedWidth
      };
    }
    const targetGraphWidth = Number.isFinite(appliedWidth) && Number.isFinite(configWidth)
      ? appliedWidth + configWidth + gap
      : null;
    if(graphPanel && Number.isFinite(targetGraphWidth) && targetGraphWidth > 0){
      graphPanel.style.flex = '0 0 auto';
      graphPanel.style.maxWidth = 'none';
      graphPanel.style.minWidth = targetGraphWidth + 'px';
      let contentDiff = Number.isFinite(graphContentWidth)
        ? Math.abs(graphContentWidth - targetGraphWidth)
        : Infinity;
      if(isManualResize){
        contentDiff = Infinity;
      }
      if(!Number.isFinite(graphContentWidth) || contentDiff > 1){
        graphPanel.style.width = targetGraphWidth + 'px';
        console.debug('Debug: Shared.syncPanelWidths graph width applied', {
          label: debugLabel,
          targetGraphWidth,
          existingGraphWidth: graphWidth,
          graphContentWidth,
          contentDiff
        }); // Debug: graph width adjustment
      }
    }
    const wrap = graphPanel?.parentElement || null;
    if(wrap && Number.isFinite(tableWidth) && Number.isFinite(targetGraphWidth)){
      const wrapMin = tableWidth + targetGraphWidth + graphInset + (Number.isFinite(resizerWidth) ? resizerWidth : 0);
      if(Number.isFinite(wrapMin) && wrapMin > 0){
        wrap.style.minWidth = wrapMin + 'px';
        console.debug('Debug: Shared.syncPanelWidths wrap minWidth', {
          label: debugLabel,
          wrapMin,
          tableWidth,
          targetGraphWidth,
          graphInset,
          resizerWidth
        }); // Debug: wrap width enforcement
      }
    }
    console.debug('Debug: Shared.syncPanelWidths manual state', {
      label: debugLabel,
      isManualResize,
      datasetMinWidth,
      datasetDefaultWidth,
      svgCurrentWidth,
      baseWidth,
      appliedWidth,
      maxAvailable,
      graphInset,
      graphContentWidth,
      available: availableRaw,
      manualWidth,
      minTarget
    }); // Debug: resizer manual state
    if(typeof opts.onWidthApplied === 'function'){
      try{
        opts.onWidthApplied(appliedWidth);
      }catch(err){
        console.error('Shared.syncPanelWidths onWidthApplied error', err);
      }
    }
    if(!opts.skipSchedule && typeof scheduleDraw === 'function'){
      try{
        scheduleDraw();
      }catch(err){
        console.error(debugLabel + ' sync schedule error', err);
      }
    }
    console.debug('Debug: Shared.syncPanelWidths applied', {
      label: debugLabel,
      tableWidth,
      graphWidth,
      configWidth,
      gap,
      available: availableRaw,
      minSvgWidth,
      appliedWidth,
      graphInset,
      graphContentWidth,
      isManualResize,
      manualWidth
    });
    return {
      tableWidth,
      graphWidth,
      configWidth,
      gap,
      available: availableRaw,
      minSvgWidth,
      appliedWidth,
      graphInset,
      graphContentWidth,
      isManualResize
    };
  };
})(window);




