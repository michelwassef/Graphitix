(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const plot3d = Shared.plot3d = Shared.plot3d || {};

  function debugLog(){
    if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      console.debug.apply(console, arguments);
    }
  }

  const HALF_PI = Math.PI / 2;
  const TAU = Math.PI * 2;
  const NS = 'http://www.w3.org/2000/svg';

  plot3d.createRotationState = function(defaults){
    const state = {
      x: 0,
      y: 0
    };
    if(defaults && Number.isFinite(defaults.x)){
      state.x = defaults.x;
    }
    if(defaults && Number.isFinite(defaults.y)){
      state.y = defaults.y;
    }
    return state;
  };

  plot3d.rotatePoint = function(point, rotation){
    if(!point){ return { x: 0, y: 0, z: 0 }; }
    const rot = rotation || { x: 0, y: 0 };
    const cosY = Math.cos(rot.y || 0);
    const sinY = Math.sin(rot.y || 0);
    const cosX = Math.cos(rot.x || 0);
    const sinX = Math.sin(rot.x || 0);
    const x1 = (point.x || 0) * cosY + (point.z || 0) * sinY;
    const z1 = -(point.x || 0) * sinY + (point.z || 0) * cosY;
    const y1 = (point.y || 0) * cosX - z1 * sinX;
    const z2 = (point.y || 0) * sinX + z1 * cosX;
    return { x: x1, y: y1, z: z2 };
  };

  plot3d.normalizeRotation = function(rotation){
    if(!rotation){ return; }
    if(rotation.x > HALF_PI){ rotation.x = HALF_PI; }
    if(rotation.x < -HALF_PI){ rotation.x = -HALF_PI; }
    while(rotation.y > Math.PI){ rotation.y -= TAU; }
    while(rotation.y < -Math.PI){ rotation.y += TAU; }
  };

  plot3d.isLegendPointerTarget = function(target){
    if(!target){ return false; }
    if(target.dataset && target.dataset.legendKey){
      return true;
    }
    if(typeof target.closest === 'function'){
      const interactive = target.closest('[data-legend-key]');
      if(interactive){
        return true;
      }
    }
    return false;
  };

  plot3d.isInteractivePointerTarget = function(target){
    if(!target){ return false; }
    if(plot3d.isLegendPointerTarget(target)){
      debugLog('Debug: plot3d pointer target bypass', { reason: 'legend', tag: target.tagName || null });
      return true;
    }
    const dataset = target.dataset || {};
    if(dataset.fontEditable === '1'){
      debugLog('Debug: plot3d pointer target bypass', { reason: 'font-editable', tag: target.tagName || null });
      return true;
    }
    if(dataset.inlineEditable === '1'){
      debugLog('Debug: plot3d pointer target bypass', { reason: 'inline-editable', tag: target.tagName || null });
      return true;
    }
    const hasContentEditable = typeof target.getAttribute === 'function' && String(target.getAttribute('contenteditable') || '').toLowerCase() === 'true';
    if(hasContentEditable){
      debugLog('Debug: plot3d pointer target bypass', { reason: 'contenteditable', tag: target.tagName || null });
      return true;
    }
    const classList = target.classList || null;
    if(classList && (classList.contains('inline-edit-overlay') || classList.contains('inline-edit-input') || classList.contains('inline-edit-measure'))){
      debugLog('Debug: plot3d pointer target bypass', { reason: 'inline-editor-class', tag: target.tagName || null });
      return true;
    }
    if(typeof target.closest === 'function'){
      const selectors = [
        '[data-font-editable="1"]',
        '[data-inline-editable="1"]',
        '.inline-edit-overlay',
        '.inline-edit-input',
        '.inline-edit-measure',
        '[contenteditable="true"]'
      ];
      for(let i = 0; i < selectors.length; i += 1){
        const sel = selectors[i];
        if(target.closest(sel)){
          debugLog('Debug: plot3d pointer target bypass', { reason: sel, tag: target.tagName || null });
          return true;
        }
      }
    }
    return false;
  };

  plot3d.applyLegendPointerGuards = function(element, options){
    if(!element){ return; }
    const label = options && options.label ? options.label : null;
    element.addEventListener('pointerdown', function(evt){
      if(evt){ evt.stopPropagation(); }
      debugLog('Debug: plot3d legend pointerdown intercepted', { label });
    });
  };

  plot3d.attachRotationControls = function(svgEl, options){
    if(!svgEl){ return; }
    if(svgEl.dataset.rotationControlsAttached === 'true'){
      return;
    }
    const opts = options || {};
    const state = opts.state || plot3d.createRotationState();
    const shouldIgnorePointer = typeof opts.shouldIgnorePointer === 'function'
      ? opts.shouldIgnorePointer
      : function(event){
        return plot3d.isInteractivePointerTarget(event && event.target);
      };
    const label = opts.debugLabel || 'plot3d-rotation';
    const onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
    const onStart = typeof opts.onStart === 'function' ? opts.onStart : null;
    const onEnd = typeof opts.onEnd === 'function' ? opts.onEnd : null;
    svgEl.dataset.rotationControlsAttached = 'true';
    svgEl.style.cursor = 'grab';
    svgEl.style.touchAction = 'none';
    svgEl.style.userSelect = 'none';
    svgEl.style.webkitUserSelect = 'none';
    const pointerState = { active: false, pointerId: null, lastX: 0, lastY: 0 };
    const selectionGuards = { applied: false, previous: null };
    const disableSelection = () => {
      if(selectionGuards.applied){ return; }
      const doc = svgEl.ownerDocument || global.document;
      const body = doc && doc.body;
      if(!body){ return; }
      selectionGuards.previous = {
        userSelect: body.style.userSelect,
        webkitUserSelect: body.style.webkitUserSelect
      };
      body.style.userSelect = 'none';
      body.style.webkitUserSelect = 'none';
      selectionGuards.applied = true;
      debugLog('Debug: plot3d selection disabled', { label });
    };
    const restoreSelection = () => {
      if(!selectionGuards.applied){ return; }
      const doc = svgEl.ownerDocument || global.document;
      const body = doc && doc.body;
      if(body){
        body.style.userSelect = selectionGuards.previous ? selectionGuards.previous.userSelect : '';
        body.style.webkitUserSelect = selectionGuards.previous ? selectionGuards.previous.webkitUserSelect : '';
      }
      selectionGuards.applied = false;
      selectionGuards.previous = null;
      debugLog('Debug: plot3d selection restored', { label });
    };
    const startDrag = (event) => {
      if(!event){ return; }
      if(shouldIgnorePointer(event)){
        debugLog('Debug: plot3d rotation pointerdown ignored', { label, tag: event.target && event.target.tagName });
        return;
      }
      if(pointerState.active){
        return;
      }
      pointerState.active = true;
      pointerState.pointerId = event.pointerId;
      pointerState.lastX = event.clientX;
      pointerState.lastY = event.clientY;
      svgEl.setPointerCapture(event.pointerId);
      svgEl.style.cursor = 'grabbing';
      disableSelection();
      debugLog('Debug: plot3d rotation drag start', { label, pointerId: event.pointerId });
      if(onStart){
        try {
          onStart(event, state);
        } catch(err){
          debugLog('Debug: plot3d rotation start callback error', { label, message: err && err.message });
        }
      }
    };
    const moveDrag = (event) => {
      if(!pointerState.active || !event){ return; }
      if(event.pointerId !== pointerState.pointerId){ return; }
      const dx = event.clientX - pointerState.lastX;
      const dy = event.clientY - pointerState.lastY;
      pointerState.lastX = event.clientX;
      pointerState.lastY = event.clientY;
      const yawDelta = dx * (opts.rotationScale || 0.01);
      const pitchDelta = dy * (opts.rotationScale || 0.01);
      const pitchCos = Math.cos(state.x || 0);
      const horizontalSign = pitchCos >= 0 ? -1 : 1;
      state.y += yawDelta * horizontalSign;
      state.x -= pitchDelta;
      plot3d.normalizeRotation(state);
      debugLog('Debug: plot3d rotation updated', { label, rotation: { x: state.x, y: state.y } });
      if(onChange){
        try {
          onChange(event, state);
        } catch(err){
          debugLog('Debug: plot3d rotation change callback error', { label, message: err && err.message });
        }
      }
    };
    const stopDrag = (event, reason) => {
      if(!pointerState.active){ return; }
      if(event && event.pointerId !== pointerState.pointerId){ return; }
      pointerState.active = false;
      pointerState.pointerId = null;
      svgEl.style.cursor = 'grab';
      try {
        if(event && typeof svgEl.releasePointerCapture === 'function'){
          svgEl.releasePointerCapture(event.pointerId);
        }
      } catch(err){
        debugLog('Debug: plot3d rotation pointer capture release error', { label, message: err && err.message });
      }
      restoreSelection();
      debugLog('Debug: plot3d rotation drag end', { label, reason: reason || 'unknown', rotation: { x: state.x, y: state.y } });
      if(onEnd){
        try {
          onEnd(event, state);
        } catch(err){
          debugLog('Debug: plot3d rotation end callback error', { label, message: err && err.message });
        }
      }
    };
    svgEl.addEventListener('pointerdown', startDrag);
    svgEl.addEventListener('pointermove', moveDrag);
    svgEl.addEventListener('pointerup', function(evt){ stopDrag(evt, 'pointerup'); });
    svgEl.addEventListener('pointercancel', function(evt){ stopDrag(evt, 'pointercancel'); });
    svgEl.addEventListener('pointerleave', function(evt){ stopDrag(evt, 'pointerleave'); });
  };

  plot3d.createProjector = function(options){
    const opts = options || {};
    const rotatedPoints = Array.isArray(opts.rotatedPoints) ? opts.rotatedPoints : [];
    const rotatedCorners = Array.isArray(opts.rotatedCorners) ? opts.rotatedCorners : [];
    const margin = opts.margin || { top: 0, right: 0, bottom: 0, left: 0 };
    const width = Math.max(1, Math.floor(opts.width || 1));
    const height = Math.max(1, Math.floor(opts.height || 1));
    const plotWidth = Math.max(1, width - (margin.left || 0) - (margin.right || 0));
    const plotHeight = Math.max(1, height - (margin.top || 0) - (margin.bottom || 0));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const updateBounds = (pt) => {
      if(!pt){ return; }
      const x = Number.isFinite(pt.x) ? pt.x : 0;
      const y = Number.isFinite(pt.y) ? pt.y : 0;
      if(x < minX){ minX = x; }
      if(x > maxX){ maxX = x; }
      if(y < minY){ minY = y; }
      if(y > maxY){ maxY = y; }
    };
    for(let i=0;i<rotatedPoints.length;i+=1){ updateBounds(rotatedPoints[i]); }
    for(let j=0;j<rotatedCorners.length;j+=1){ updateBounds(rotatedCorners[j]); }
    if(!Number.isFinite(minX)){ minX = -1; }
    if(!Number.isFinite(maxX)){ maxX = 1; }
    if(!Number.isFinite(minY)){ minY = -1; }
    if(!Number.isFinite(maxY)){ maxY = 1; }
    if(minX === maxX){ maxX = minX + 1; }
    if(minY === maxY){ maxY = minY + 1; }
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const uniformScale = Math.min(plotWidth / rangeX, plotHeight / rangeY);
    const scaledWidth = rangeX * uniformScale;
    const scaledHeight = rangeY * uniformScale;
    const offsetX = (margin.left || 0) + (plotWidth - scaledWidth) / 2;
    const offsetY = (margin.top || 0) + (plotHeight - scaledHeight) / 2;
    const project = (pt) => {
      const x = Number.isFinite(pt?.x) ? pt.x : 0;
      const y = Number.isFinite(pt?.y) ? pt.y : 0;
      const depth = Number.isFinite(pt?.z) ? pt.z : 0;
      return {
        x: offsetX + (x - minX) * uniformScale,
        y: (margin.top || 0) + scaledHeight - (y - minY) * uniformScale,
        depth
      };
    };
    debugLog('Debug: plot3d projector created', {
      bounds: { minX, maxX, minY, maxY },
      width,
      height,
      margin
    });
    return {
      project,
      bounds: { minX, maxX, minY, maxY },
      scale: uniformScale,
      offsets: { x: offsetX, y: offsetY },
      plotSize: { width: scaledWidth, height: scaledHeight }
    };
  };

  plot3d.renderAxesAndGrid = function(config){
    const cfg = config || {};
    const svg = cfg.svg;
    if(!svg){ return null; }
    const project = cfg.project;
    const rotatePointFn = cfg.rotatePoint;
    const axisRanges = cfg.axisRanges || {};
    const axisTicks = cfg.axisTicks || {};
    const axisLabels = cfg.axisLabels || {};
    const fontSize = Number.isFinite(cfg.fontSize) ? cfg.fontSize : 12;
    const axisStrokeWidth = Number.isFinite(cfg.axisStrokeWidth) ? cfg.axisStrokeWidth : 1;
    const chartStyle = cfg.chartStyle || {};
    const showGrid = cfg.showGrid !== false;
    const showFrame = cfg.showFrame !== false;
    const showPanes = cfg.showPanes !== false;
    const axisColor = cfg.axisColor || chartStyle.AXIS_COLOR || chartStyle.TEXT_COLOR || '#333';
    const paneFill = cfg.paneFill || 'rgba(0,0,0,0.008)';
    const paneOpacityRange = cfg.paneOpacityRange || { min: 0.004, max: 0.012 };
    const gridColor = cfg.gridColor || 'rgba(0,0,0,0.12)';
    const gridDash = cfg.gridDash || null;
    const gridOutlineColors = cfg.gridOutlineColors || { primary: 'rgba(0,0,0,0.1)', secondary: 'rgba(0,0,0,0.08)' };
    const frameColor = cfg.frameColor || 'rgba(0,0,0,0.45)';
    const onAxisLabel = typeof cfg.onAxisLabel === 'function' ? cfg.onAxisLabel : null;
    const debugLabel = cfg.debugLabel || 'plot3d';
    const paneTarget = cfg.paneTarget || svg;
    const gridTarget = cfg.gridTarget || svg;
    const axisTarget = cfg.axisTarget || svg;
    const labelTarget = cfg.labelTarget || axisTarget || svg;
    const createElement = cfg.createElement || function(tag, attrs, text, target){
      const el = (svg.ownerDocument || global.document).createElementNS(NS, tag);
      if(attrs){
        for(const key in attrs){
          if(Object.prototype.hasOwnProperty.call(attrs, key)){
            el.setAttribute(key, String(attrs[key]));
          }
        }
      }
      if(text){
        el.textContent = text;
      }
      (target || labelTarget || svg).appendChild(el);
      return el;
    };
    const rotatePoint = rotatePointFn || function(pt){ return plot3d.rotatePoint(pt, cfg.rotation); };
    const axisCenters = {
      x: (axisRanges.x?.min + axisRanges.x?.max) / 2 || 0,
      y: (axisRanges.y?.min + axisRanges.y?.max) / 2 || 0,
      z: (axisRanges.z?.min + axisRanges.z?.max) / 2 || 0
    };
    const allCorners = [
      { x: axisRanges.x?.min, y: axisRanges.y?.min, z: axisRanges.z?.min },
      { x: axisRanges.x?.max, y: axisRanges.y?.min, z: axisRanges.z?.min },
      { x: axisRanges.x?.min, y: axisRanges.y?.max, z: axisRanges.z?.min },
      { x: axisRanges.x?.max, y: axisRanges.y?.max, z: axisRanges.z?.min },
      { x: axisRanges.x?.min, y: axisRanges.y?.min, z: axisRanges.z?.max },
      { x: axisRanges.x?.max, y: axisRanges.y?.min, z: axisRanges.z?.max },
      { x: axisRanges.x?.min, y: axisRanges.y?.max, z: axisRanges.z?.max },
      { x: axisRanges.x?.max, y: axisRanges.y?.max, z: axisRanges.z?.max }
    ];
    const cubeCenter = { x: axisCenters.x, y: axisCenters.y, z: axisCenters.z };
    const cubeCenter2D = project(rotatePoint(cubeCenter));
    const depthFor = (point) => rotatePoint(point).z;
    const frontIsMinY = depthFor({ x: axisCenters.x, y: axisRanges.y?.min, z: axisCenters.z }) >= depthFor({ x: axisCenters.x, y: axisRanges.y?.max, z: axisCenters.z });
    const frontYValue = frontIsMinY ? axisRanges.y?.min : axisRanges.y?.max;
    const backYValue = frontIsMinY ? axisRanges.y?.max : axisRanges.y?.min;
    const bottomZValue = axisRanges.z?.min;
    const topZValue = axisRanges.z?.max;
    const leftCandidate = project(rotatePoint({ x: axisRanges.x?.min, y: frontYValue, z: bottomZValue }));
    const rightCandidate = project(rotatePoint({ x: axisRanges.x?.max, y: frontYValue, z: bottomZValue }));
    const leftXValue = leftCandidate.x <= rightCandidate.x ? axisRanges.x?.min : axisRanges.x?.max;
    const rightXValue = leftXValue === axisRanges.x?.min ? axisRanges.x?.max : axisRanges.x?.min;
    const axisDefs = [
      {
        key: 'x',
        color: axisColor,
        label: axisLabels.x || 'X',
        start: { x: leftXValue, y: frontYValue, z: bottomZValue },
        end: { x: rightXValue, y: frontYValue, z: bottomZValue },
        ticks: axisTicks.x || []
      },
      {
        key: 'y',
        color: axisColor,
        label: axisLabels.y || 'Y',
        start: { x: rightXValue, y: frontYValue, z: bottomZValue },
        end: { x: rightXValue, y: backYValue, z: bottomZValue },
        ticks: axisTicks.y || []
      },
      {
        key: 'z',
        color: axisColor,
        label: axisLabels.z || 'Z',
        start: { x: leftXValue, y: frontYValue, z: bottomZValue },
        end: { x: leftXValue, y: frontYValue, z: topZValue },
        ticks: axisTicks.z || []
      }
    ];
    const doc = svg.ownerDocument || global.document;
    const paneGroup = showPanes && doc ? doc.createElementNS(NS, 'g') : null;
    if(paneGroup){
      paneGroup.setAttribute('fill', paneFill);
      paneGroup.setAttribute('stroke', 'none');
      (paneTarget || svg).appendChild(paneGroup);
    }
    const gridGroup = (showGrid || showFrame) && doc ? doc.createElementNS(NS, 'g') : null;
    if(gridGroup){
      gridGroup.setAttribute('fill', 'none');
      gridGroup.setAttribute('stroke', gridColor);
      if(gridDash && gridDash.length){
        gridGroup.setAttribute('stroke-dasharray', gridDash.join(' '));
      }
      gridGroup.setAttribute('stroke-width', axisStrokeWidth * 0.6);
      (gridTarget || svg).appendChild(gridGroup);
    }
    const appendLine = (startRot, endRot, attrs, target) => {
      const start = project(startRot);
      const end = project(endRot);
      const line = doc.createElementNS(NS, 'line');
      line.setAttribute('x1', String(start.x));
      line.setAttribute('y1', String(start.y));
      line.setAttribute('x2', String(end.x));
      line.setAttribute('y2', String(end.y));
      if(attrs){
        for(const key in attrs){
          if(Object.prototype.hasOwnProperty.call(attrs, key)){
            line.setAttribute(key, String(attrs[key]));
          }
        }
      }
      (target || axisTarget || svg).appendChild(line);
      return line;
    };
    if(paneGroup && showPanes){
      const paneDefs = [
        { corners: [0, 1, 3, 2] },
        { corners: [4, 5, 7, 6] },
        { corners: [0, 1, 5, 4] },
        { corners: [2, 3, 7, 6] },
        { corners: [0, 2, 6, 4] },
        { corners: [1, 3, 7, 5] }
      ];
      const panePolys = [];
      for(let i=0;i<paneDefs.length;i+=1){
        const def = paneDefs[i];
        const rotatedPane = [];
        for(let j=0;j<def.corners.length;j+=1){
          rotatedPane.push(rotatePoint(allCorners[def.corners[j]]));
        }
        let depthSum = 0;
        const projectedPane = new Array(rotatedPane.length);
        for(let j=0;j<rotatedPane.length;j+=1){
          const rot = rotatedPane[j];
          depthSum += rot.z;
          projectedPane[j] = project(rot);
        }
        panePolys.push({ projectedPane, avgDepth: depthSum / rotatedPane.length });
      }
      panePolys.sort((a, b) => a.avgDepth - b.avgDepth);
      const minDepth = panePolys.length ? panePolys[0].avgDepth : 0;
      const maxDepth = panePolys.length ? panePolys[panePolys.length - 1].avgDepth : 1;
      const depthRange = maxDepth - minDepth || 1;
      const minOpacity = Number.isFinite(paneOpacityRange.min) ? paneOpacityRange.min : 0.004;
      const maxOpacity = Number.isFinite(paneOpacityRange.max) ? paneOpacityRange.max : 0.012;
      for(let i=0;i<panePolys.length;i+=1){
        const pane = panePolys[i];
        const polygon = doc.createElementNS(NS, 'polygon');
        const pointsAttr = pane.projectedPane.map(pt => `${pt.x},${pt.y}`).join(' ');
        const depthRatio = (pane.avgDepth - minDepth) / depthRange;
        const opacity = minOpacity + (1 - depthRatio) * (maxOpacity - minOpacity);
        polygon.setAttribute('points', pointsAttr);
        polygon.setAttribute('fill', `rgba(0,0,0,${opacity.toFixed(3)})`);
        polygon.setAttribute('stroke', 'none');
        paneGroup.appendChild(polygon);
      }
      debugLog('Debug: plot3d panes rendered', { label: debugLabel, count: panePolys.length });
    }
    if(showGrid){
      const interior = (ticks, min, max) => {
        const result = [];
        if(!Array.isArray(ticks)){ return result; }
        for(let i=0;i<ticks.length;i+=1){
          const val = ticks[i];
          if(val > min + 1e-9 && val < max - 1e-9){
            result.push(val);
          }
        }
        return result;
      };
      const axisInterior = {
        x: interior(axisDefs[0].ticks, axisRanges.x?.min, axisRanges.x?.max),
        y: interior(axisDefs[1].ticks, axisRanges.y?.min, axisRanges.y?.max),
        z: interior(axisDefs[2].ticks, axisRanges.z?.min, axisRanges.z?.max)
      };
      const basePoint = { x: axisRanges.x?.min, y: axisRanges.y?.min, z: axisRanges.z?.min };
      const makePoint = (overrides) => Object.assign({}, basePoint, overrides || {});
      const planeConfigs = [
        { axisA: 'x', axisB: 'y', fixed: { key: 'z', value: axisRanges.z?.min } },
        { axisA: 'x', axisB: 'y', fixed: { key: 'z', value: axisRanges.z?.max } },
        { axisA: 'x', axisB: 'z', fixed: { key: 'y', value: axisRanges.y?.min } },
        { axisA: 'x', axisB: 'z', fixed: { key: 'y', value: axisRanges.y?.max } },
        { axisA: 'y', axisB: 'z', fixed: { key: 'x', value: axisRanges.x?.min } },
        { axisA: 'y', axisB: 'z', fixed: { key: 'x', value: axisRanges.x?.max } }
      ];
      for(let i=0;i<planeConfigs.length;i+=1){
        const plane = planeConfigs[i];
        const axisA = plane.axisA;
        const axisB = plane.axisB;
        const fixedKey = plane.fixed.key;
        const fixedValue = plane.fixed.value;
        const startMin = makePoint({ [axisA]: axisRanges[axisA]?.min, [axisB]: axisRanges[axisB]?.min, [fixedKey]: fixedValue });
        const endMax = makePoint({ [axisA]: axisRanges[axisA]?.max, [axisB]: axisRanges[axisB]?.max, [fixedKey]: fixedValue });
        appendLine(rotatePoint(startMin), rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.max, [axisB]: axisRanges[axisB]?.min, [fixedKey]: fixedValue })), { stroke: gridOutlineColors.primary, 'stroke-width': axisStrokeWidth * 0.55 }, gridGroup);
        appendLine(rotatePoint(startMin), rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.min, [axisB]: axisRanges[axisB]?.max, [fixedKey]: fixedValue })), { stroke: gridOutlineColors.primary, 'stroke-width': axisStrokeWidth * 0.55 }, gridGroup);
        appendLine(rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.max, [axisB]: axisRanges[axisB]?.min, [fixedKey]: fixedValue })), rotatePoint(endMax), { stroke: gridOutlineColors.secondary, 'stroke-width': axisStrokeWidth * 0.55 }, gridGroup);
        appendLine(rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.min, [axisB]: axisRanges[axisB]?.max, [fixedKey]: fixedValue })), rotatePoint(endMax), { stroke: gridOutlineColors.secondary, 'stroke-width': axisStrokeWidth * 0.55 }, gridGroup);
        const ticksA = axisInterior[axisA];
        const ticksB = axisInterior[axisB];
        for(let j=0;j<ticksA.length;j+=1){
          const aVal = ticksA[j];
          appendLine(
            rotatePoint(makePoint({ [axisA]: aVal, [axisB]: axisRanges[axisB]?.min, [fixedKey]: fixedValue })),
            rotatePoint(makePoint({ [axisA]: aVal, [axisB]: axisRanges[axisB]?.max, [fixedKey]: fixedValue })),
            null,
            gridGroup
          );
        }
        for(let k=0;k<ticksB.length;k+=1){
          const bVal = ticksB[k];
          appendLine(
            rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.min, [axisB]: bVal, [fixedKey]: fixedValue })),
            rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.max, [axisB]: bVal, [fixedKey]: fixedValue })),
            null,
            gridGroup
          );
        }
      }
      debugLog('Debug: plot3d grid rendered', { label: debugLabel });
    }
    if(showFrame){
      const edges = [
        [0, 1], [0, 2], [1, 3], [2, 3],
        [4, 5], [4, 6], [5, 7], [6, 7],
        [0, 4], [1, 5], [2, 6], [3, 7]
      ];
      for(let i=0;i<edges.length;i+=1){
        const pair = edges[i];
        appendLine(rotatePoint(allCorners[pair[0]]), rotatePoint(allCorners[pair[1]]), { stroke: frameColor, 'stroke-width': axisStrokeWidth }, axisTarget || gridGroup || svg);
      }
      debugLog('Debug: plot3d frame rendered', { label: debugLabel, edgeCount: edges.length });
    }
    for(let i=0;i<axisDefs.length;i+=1){
      const def = axisDefs[i];
      const startRot = rotatePoint(def.start);
      const endRot = rotatePoint(def.end);
      const startPos = project(startRot);
      const endPos = project(endRot);
      appendLine(startRot, endRot, { stroke: def.color, 'stroke-width': axisStrokeWidth * 0.9 }, axisTarget);
      const axisVector = {
        x: def.end.x - def.start.x,
        y: def.end.y - def.start.y,
        z: def.end.z - def.start.z
      };
      const labelPointRaw = {
        x: def.start.x + axisVector.x * 0.5,
        y: def.start.y + axisVector.y * 0.5,
        z: def.start.z + axisVector.z * 0.5
      };
      const labelRot = rotatePoint(labelPointRaw);
      const labelBasePos = project(labelRot);
      const axisVec2d = { x: endPos.x - startPos.x, y: endPos.y - startPos.y };
      const axisVecLength = Math.hypot(axisVec2d.x, axisVec2d.y) || 1;
      const unitAxis2d = { x: axisVec2d.x / axisVecLength, y: axisVec2d.y / axisVecLength };
      const perp2d = { x: -unitAxis2d.y, y: unitAxis2d.x };
      const axisMid3d = {
        x: (def.start.x + def.end.x) / 2,
        y: (def.start.y + def.end.y) / 2,
        z: (def.start.z + def.end.z) / 2
      };
      const axisMidPos = project(rotatePoint(axisMid3d));
      const toCenter = { x: cubeCenter2D.x - axisMidPos.x, y: cubeCenter2D.y - axisMidPos.y };
      const perpDot = perp2d.x * toCenter.x + perp2d.y * toCenter.y;
      const outwardPerp = perpDot > 0 ? { x: -perp2d.x, y: -perp2d.y } : perp2d;
      const offsetMagnitude = Math.max(fontSize * 1.2, 12);
      const labelPos = {
        x: labelBasePos.x + outwardPerp.x * offsetMagnitude,
        y: labelBasePos.y + outwardPerp.y * offsetMagnitude
      };
      const angleDeg = Math.atan2(endPos.y - startPos.y, endPos.x - startPos.x) * (180 / Math.PI);
      const axisLabelEl = createElement('text', {
        x: labelPos.x,
        y: labelPos.y,
        'font-size': fontSize,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: chartStyle.TEXT_COLOR || '#333',
        transform: `rotate(${angleDeg} ${labelPos.x} ${labelPos.y})`
      }, def.label, svg);
      if(onAxisLabel){
        try {
          onAxisLabel(axisLabelEl, def.key, def.label);
        } catch(err){
          debugLog('Debug: plot3d axis label callback error', { label: debugLabel, axis: def.key, message: err && err.message });
        }
      }
    }
    debugLog('Debug: plot3d axes rendered', { label: debugLabel });
    return {
      cubeCenter2D,
      axisDefs
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
