// Shared resizer utility for .svgbox containers
// Usage: Shared.attachResizableBox(container)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};

  function px(n){ return Math.round(n) + 'px'; }

  Shared.attachResizableBox = function attachResizableBox(container, opts={}){
    if(!container) return;
    const MIN_W = opts.minWidth || 50;
    const MIN_H = opts.minHeight || 40;
    const vHandle = container.querySelector('.resizer-vertical');
    const hHandle = container.querySelector('.resizer-horizontal');
    const cHandle = container.querySelector('.resizer-corner');
    console.debug('Debug: attachResizableBox on', container.id || container.className); // Debug: resizer attach

    function attachDrag(handle, axis){
      if(!handle) return;
      let startX=0, startY=0, startW=0, startH=0, pointerId=null;
      const onPointerDown = (e) => {
        e.preventDefault();
        pointerId = e.pointerId;
        try { handle.setPointerCapture(pointerId); } catch(_) {}
        const rect = container.getBoundingClientRect();
        startW = Math.round(rect.width);
        startH = Math.round(rect.height);
        startX = e.clientX;
        startY = e.clientY;
        container.style.boxSizing = 'border-box';
        container.style.width = px(startW);
        container.style.height = px(startH);
        container.style.flex = '0 0 auto';
        container.style.maxWidth = 'none';
        container.style.maxHeight = 'none';
        document.documentElement.style.userSelect = 'none';
        document.documentElement.style.touchAction = 'none';
        const onPointerMove = (ev) => {
          ev.preventDefault();
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if(axis === 'x' || axis === 'both'){
            const newW = Math.max(MIN_W, Math.round(startW + dx));
            container.style.width = px(newW);
          }
          if(axis === 'y' || axis === 'both'){
            const newH = Math.max(MIN_H, Math.round(startH + dy));
            container.style.height = px(newH);
          }
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
        container.style.width = '640px';
        container.style.height = '420px';
        container.style.flex = '0 0 auto';
        console.debug('Debug: resizer size reset to 640x420'); // Debug: resizer reset
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
    const tableWidth = tablePanel.getBoundingClientRect().width;
    const graphWidth = graphPanel.getBoundingClientRect().width;
    const configWidth = configPanel.getBoundingClientRect().width;
    const available = graphWidth - configWidth - gap;
    const minSvgWidth = Number.isFinite(opts.minSvgWidth) ? Math.max(0, opts.minSvgWidth) : 0;
    const appliedWidth = Math.max(minSvgWidth, Math.min(tableWidth, available));
    if(svgBox && Number.isFinite(appliedWidth)){
      svgBox.style.width = appliedWidth + 'px';
    }
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
      appliedWidth
    });
    return {
      tableWidth,
      graphWidth,
      configWidth,
      gap,
      available,
      minSvgWidth,
      appliedWidth
    };
  };
})(window);
