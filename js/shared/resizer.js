// Shared resizer utility for .svgbox containers
// Usage: Shared.attachResizableBox(container)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};

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
    console.debug('Debug: attachResizableBox defaults', { defaultWidth, defaultHeight, MIN_W, MIN_H, MAX_W, MAX_H, resizeMinScale, resizeMaxScale }); // Debug: resizer defaults
    const vHandle = container.querySelector('.resizer-vertical');
    const hHandle = container.querySelector('.resizer-horizontal');
    const cHandle = container.querySelector('.resizer-corner');
    console.debug('Debug: attachResizableBox on', container.id || container.className); // Debug: resizer attach
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
        console.debug('Debug: resizer drag start', { axis, startW, startH, MIN_W, MIN_H }); // Debug: resizer drag start
        document.documentElement.style.userSelect = 'none';
        document.documentElement.style.touchAction = 'none';
        const onPointerMove = (ev) => {
          ev.preventDefault();
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if(axis === 'x' || axis === 'both'){
            const tentative = Math.round(startW + dx);
            const newW = Math.min(MAX_W, Math.max(MIN_W, tentative));
            container.style.width = px(newW);
          }
          if(axis === 'y' || axis === 'both'){
            const tentativeH = Math.round(startH + dy);
            const newH = Math.min(MAX_H, Math.max(MIN_H, tentativeH));
            container.style.height = px(newH);
          }
          container.dataset.resizerWidth = container.style.width;
          container.dataset.resizerHeight = container.style.height;
          console.debug('Debug: resizer drag move', { axis, dx, dy, width: container.style.width, height: container.style.height, limits: { MIN_W, MAX_W, MIN_H, MAX_H } }); // Debug: resizer drag move
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
        container.style.width = px(defaultWidth);
        container.style.height = px(defaultHeight);
        container.style.flex = '0 0 auto';
        container.dataset.resizerResized = 'true';
        container.dataset.resizerWidth = container.style.width;
        container.dataset.resizerHeight = container.style.height;
        container.style.minWidth = px(MIN_W);
        container.style.maxWidth = px(MAX_W);
        container.style.minHeight = px(MIN_H);
        container.style.maxHeight = px(MAX_H);
        console.debug('Debug: resizer size reset', { width: container.style.width, height: container.style.height }); // Debug: resizer reset
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
    const isManualResize = svgDataset ? svgDataset.resizerResized === 'true' : false;
    const datasetMinWidth = svgDataset ? Number(svgDataset.resizerMinWidth) : NaN;
    const datasetDefaultWidth = svgDataset ? Number(svgDataset.resizerDefaultWidth) : NaN;
    const svgRect = svgBox ? svgBox.getBoundingClientRect() : null;
    const svgCurrentWidth = svgRect ? svgRect.width : NaN;
    const tableWidth = tablePanel.getBoundingClientRect().width;
    const graphWidth = graphPanel.getBoundingClientRect().width;
    const configWidth = configPanel.getBoundingClientRect().width;
    const resizerEl = opts.panelResizer || (graphPanel.parentElement ? Array.from(graphPanel.parentElement.children).find(el => el.classList && el.classList.contains('panel-resizer')) : null);
    const resizerWidth = resizerEl ? resizerEl.getBoundingClientRect().width : 0;
    const available = graphWidth - configWidth - gap;
    const maxAvailable = Number.isFinite(available) ? Math.max(0, available) : Infinity;
    let minSvgWidth = Number.isFinite(opts.minSvgWidth) ? Math.max(0, opts.minSvgWidth) : 0;
    if(Number.isFinite(datasetMinWidth) && datasetMinWidth > 0){
      minSvgWidth = Math.max(minSvgWidth, datasetMinWidth);
    }
    let baseWidth;
    if(isManualResize && Number.isFinite(svgCurrentWidth) && svgCurrentWidth > 0){
      baseWidth = svgCurrentWidth;
    }else{
      const fallbackWidth = Number.isFinite(tableWidth) && tableWidth > 0 ? tableWidth : svgCurrentWidth;
      if(Number.isFinite(available)){
        if(Number.isFinite(fallbackWidth) && fallbackWidth > 0){
          baseWidth = Math.min(fallbackWidth, available);
        }else{
          baseWidth = available;
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
      svgBox.style.width = appliedWidth + 'px';
      svgBox.style.maxWidth = Math.max(appliedWidth, Number(datasetDefaultWidth) || appliedWidth) + 'px';
      if(svgDataset){
        svgDataset.resizerWidth = svgBox.style.width;
      }
    }
    const targetGraphWidth = Number.isFinite(appliedWidth) && Number.isFinite(configWidth)
      ? appliedWidth + configWidth + gap
      : null;
    if(graphPanel && Number.isFinite(targetGraphWidth) && targetGraphWidth > 0){
      graphPanel.style.flex = '0 0 auto';
      graphPanel.style.maxWidth = 'none';
      graphPanel.style.minWidth = targetGraphWidth + 'px';
      if(!Number.isFinite(graphWidth) || Math.abs(graphWidth - targetGraphWidth) > 1){
        graphPanel.style.width = targetGraphWidth + 'px';
        console.debug('Debug: Shared.syncPanelWidths graph width applied', {
          label: debugLabel,
          targetGraphWidth,
          existingGraphWidth: graphWidth
        }); // Debug: graph width adjustment
      }
    }
    const wrap = graphPanel?.parentElement || null;
    if(wrap && Number.isFinite(tableWidth) && Number.isFinite(targetGraphWidth)){
      const wrapMin = tableWidth + targetGraphWidth + (Number.isFinite(resizerWidth) ? resizerWidth : 0);
      if(Number.isFinite(wrapMin) && wrapMin > 0){
        wrap.style.minWidth = wrapMin + 'px';
        console.debug('Debug: Shared.syncPanelWidths wrap minWidth', {
          label: debugLabel,
          wrapMin,
          tableWidth,
          targetGraphWidth,
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
      available,
      minSvgWidth,
      appliedWidth,
      isManualResize
    });
    return {
      tableWidth,
      graphWidth,
      configWidth,
      gap,
      available,
      minSvgWidth,
      appliedWidth,
      isManualResize
    };
  };
})(window);
