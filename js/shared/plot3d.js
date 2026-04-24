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

  const TAU = Math.PI * 2;
  const NS = 'http://www.w3.org/2000/svg';

  function wrapAngle(angle){
    if(!Number.isFinite(angle)){ return 0; }
    let wrapped = angle;
    while(wrapped <= -Math.PI){ wrapped += TAU; }
    while(wrapped > Math.PI){ wrapped -= TAU; }
    return wrapped;
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  function createQuaternion(x, y, z){
    const qx = axisAngleQuaternion(1, 0, 0, x || 0);
    const qy = axisAngleQuaternion(0, 1, 0, y || 0);
    const qz = axisAngleQuaternion(0, 0, 1, z || 0);
    return normalizeQuaternion(multiplyQuaternions(qz, multiplyQuaternions(qx, qy)));
  }

  function axisAngleQuaternion(ax, ay, az, angle){
    const half = (angle || 0) / 2;
    const sinHalf = Math.sin(half);
    const length = Math.hypot(ax, ay, az) || 1;
    const normX = ax / length;
    const normY = ay / length;
    const normZ = az / length;
    return {
      w: Math.cos(half),
      x: normX * sinHalf,
      y: normY * sinHalf,
      z: normZ * sinHalf
    };
  }

  function multiplyQuaternions(a, b){
    return {
      w: (a.w * b.w) - (a.x * b.x) - (a.y * b.y) - (a.z * b.z),
      x: (a.w * b.x) + (a.x * b.w) + (a.y * b.z) - (a.z * b.y),
      y: (a.w * b.y) - (a.x * b.z) + (a.y * b.w) + (a.z * b.x),
      z: (a.w * b.z) + (a.x * b.y) - (a.y * b.x) + (a.z * b.w)
    };
  }

  function normalizeQuaternion(quat){
    if(!quat){ return { w: 1, x: 0, y: 0, z: 0 }; }
    const mag = Math.hypot(quat.w, quat.x, quat.y, quat.z) || 1;
    if(Math.abs(mag - 1) < 1e-9){ return quat; }
    quat.w /= mag;
    quat.x /= mag;
    quat.y /= mag;
    quat.z /= mag;
    return quat;
  }

  function quaternionRotateVector(quat, point){
    const q = normalizeQuaternion(quat);
    const px = point?.x || 0;
    const py = point?.y || 0;
    const pz = point?.z || 0;
    const xx = q.x * q.x;
    const yy = q.y * q.y;
    const zz = q.z * q.z;
    const xy = q.x * q.y;
    const xz = q.x * q.z;
    const yz = q.y * q.z;
    const wx = q.w * q.x;
    const wy = q.w * q.y;
    const wz = q.w * q.z;
    return {
      x: (1 - 2 * (yy + zz)) * px + 2 * (xy - wz) * py + 2 * (xz + wy) * pz,
      y: 2 * (xy + wz) * px + (1 - 2 * (xx + zz)) * py + 2 * (yz - wx) * pz,
      z: 2 * (xz - wy) * px + 2 * (yz + wx) * py + (1 - 2 * (xx + yy)) * pz
    };
  }

  function ensureQuaternion(rotation){
    if(!rotation){ return { w: 1, x: 0, y: 0, z: 0 }; }
    if(rotation.quaternion){
      return normalizeQuaternion(rotation.quaternion);
    }
    const q = createQuaternion(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    rotation.quaternion = q;
    return q;
  }

  function updateEulerFromQuaternion(rotation){
    const quat = ensureQuaternion(rotation);
    const xx = quat.x * quat.x;
    const yy = quat.y * quat.y;
    const zz = quat.z * quat.z;
    const xy = quat.x * quat.y;
    const xz = quat.x * quat.z;
    const yz = quat.y * quat.z;
    const wx = quat.w * quat.x;
    const wy = quat.w * quat.y;
    const wz = quat.w * quat.z;

    const m00 = 1 - 2 * (yy + zz);
    const m01 = 2 * (xy - wz);
    const m02 = 2 * (xz + wy);
    const m10 = 2 * (xy + wz);
    const m11 = 1 - 2 * (xx + zz);
    const m12 = 2 * (yz - wx);
    const m20 = 2 * (xz - wy);
    const m21 = 2 * (yz + wx);
    const m22 = 1 - 2 * (xx + yy);

    const xAngle = Math.asin(clamp(m21, -1, 1));
    const cosX = Math.cos(xAngle);
    let yAngle;
    let zAngle;
    if(Math.abs(cosX) < 1e-6){
      // Gimbal lock: derive from alternate rows
      yAngle = 0;
      zAngle = Math.atan2(-m10, m00);
    } else {
      const sinY = -m20 / cosX;
      const cosY = m22 / cosX;
      yAngle = Math.atan2(sinY, cosY);
      const sinZ = -m01 / cosX;
      const cosZ = m11 / cosX;
      zAngle = Math.atan2(sinZ, cosZ);
    }
    rotation.x = wrapAngle(xAngle);
    rotation.y = wrapAngle(yAngle);
    rotation.z = wrapAngle(zAngle);
  }

  plot3d.createRotationState = function(defaults){
    const state = {
      x: Number.isFinite(defaults?.x) ? defaults.x : 0,
      y: Number.isFinite(defaults?.y) ? defaults.y : 0,
      z: Number.isFinite(defaults?.z) ? defaults.z : 0,
      quaternion: null
    };
    if(defaults && defaults.quaternion){
      const q = defaults.quaternion;
      if([q.w, q.x, q.y, q.z].every((val) => Number.isFinite(val))){
        state.quaternion = normalizeQuaternion({ w: q.w, x: q.x, y: q.y, z: q.z });
      }
    }
    if(!state.quaternion){
      state.quaternion = createQuaternion(state.x, state.y, state.z);
    }
    plot3d.normalizeRotation(state);
    return state;
  };

  plot3d.rotatePoint = function(point, rotation){
    if(!point){ return { x: 0, y: 0, z: 0 }; }
    const quat = ensureQuaternion(rotation);
    return quaternionRotateVector(quat, point);
  };

  plot3d.normalizeRotation = function(rotation){
    if(!rotation){ return; }
    ensureQuaternion(rotation);
    updateEulerFromQuaternion(rotation);
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
    const opts = options || {};
    const resolveRotationScale = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : 0.01;
    };
    const resolveIgnorePointer = (fn) => {
      if(typeof fn === 'function'){
        return fn;
      }
      return function(event){
        return plot3d.isInteractivePointerTarget(event && event.target);
      };
    };
    const existingControl = svgEl.__plot3dRotationControl || null;
    if(svgEl.dataset.rotationControlsAttached === 'true'){
      if(existingControl){
        existingControl.state = opts.state || existingControl.state || plot3d.createRotationState();
        existingControl.shouldIgnorePointer = resolveIgnorePointer(opts.shouldIgnorePointer);
        existingControl.label = opts.debugLabel || existingControl.label || 'plot3d-rotation';
        existingControl.onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
        existingControl.onStart = typeof opts.onStart === 'function' ? opts.onStart : null;
        existingControl.onEnd = typeof opts.onEnd === 'function' ? opts.onEnd : null;
        existingControl.rotationScale = resolveRotationScale(opts.rotationScale);
        svgEl.style.cursor = existingControl.pointerState?.active ? 'grabbing' : 'grab';
        svgEl.style.touchAction = 'none';
        svgEl.style.userSelect = 'none';
        svgEl.style.webkitUserSelect = 'none';
        debugLog('Debug: plot3d rotation controls rebound', { label: existingControl.label });
        return;
      }
      delete svgEl.dataset.rotationControlsAttached;
    }
    const control = {
      state: opts.state || plot3d.createRotationState(),
      shouldIgnorePointer: resolveIgnorePointer(opts.shouldIgnorePointer),
      label: opts.debugLabel || 'plot3d-rotation',
      onChange: typeof opts.onChange === 'function' ? opts.onChange : null,
      onStart: typeof opts.onStart === 'function' ? opts.onStart : null,
      onEnd: typeof opts.onEnd === 'function' ? opts.onEnd : null,
      rotationScale: resolveRotationScale(opts.rotationScale),
      pointerState: null
    };
    svgEl.__plot3dRotationControl = control;
    svgEl.dataset.rotationControlsAttached = 'true';
    svgEl.style.cursor = 'grab';
    svgEl.style.touchAction = 'none';
    svgEl.style.userSelect = 'none';
    svgEl.style.webkitUserSelect = 'none';
    const pointerState = { active: false, pointerId: null, lastX: 0, lastY: 0 };
    control.pointerState = pointerState;
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
      debugLog('Debug: plot3d selection disabled', { label: control.label });
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
      debugLog('Debug: plot3d selection restored', { label: control.label });
    };
    const startDrag = (event) => {
      if(!event){ return; }
      const ignorePointer = typeof control.shouldIgnorePointer === 'function'
        ? control.shouldIgnorePointer
        : resolveIgnorePointer(null);
      if(ignorePointer(event)){
        debugLog('Debug: plot3d rotation pointerdown ignored', { label: control.label, tag: event.target && event.target.tagName });
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
      const state = control.state || (control.state = plot3d.createRotationState());
      debugLog('Debug: plot3d rotation drag start', { label: control.label, pointerId: event.pointerId });
      if(control.onStart){
        try {
          control.onStart(event, state);
        } catch(err){
          debugLog('Debug: plot3d rotation start callback error', { label: control.label, message: err && err.message });
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
      const scale = control.rotationScale || 0.01;
      const yawAngle = dx * scale;
      const pitchAngle = dy * scale;
      if(yawAngle === 0 && pitchAngle === 0){
        return;
      }
      const state = control.state || (control.state = plot3d.createRotationState());
      const yawQuat = axisAngleQuaternion(0, 1, 0, yawAngle);
      const pitchQuat = axisAngleQuaternion(1, 0, 0, pitchAngle);
      const deltaQuat = normalizeQuaternion(multiplyQuaternions(yawQuat, pitchQuat));
      const currentQuat = ensureQuaternion(state);
      state.quaternion = normalizeQuaternion(multiplyQuaternions(deltaQuat, currentQuat));
      plot3d.normalizeRotation(state);
      debugLog('Debug: plot3d rotation updated', { label: control.label, rotation: { x: state.x, y: state.y, z: state.z } });
      if(control.onChange){
        try {
          control.onChange(event, state);
        } catch(err){
          debugLog('Debug: plot3d rotation change callback error', { label: control.label, message: err && err.message });
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
        debugLog('Debug: plot3d rotation pointer capture release error', { label: control.label, message: err && err.message });
      }
      restoreSelection();
      const state = control.state || (control.state = plot3d.createRotationState());
      debugLog('Debug: plot3d rotation drag end', {
        label: control.label,
        reason: reason || 'unknown',
        rotation: { x: state.x, y: state.y, z: state.z }
      });
      if(control.onEnd){
        try {
          control.onEnd(event, state);
        } catch(err){
          debugLog('Debug: plot3d rotation end callback error', { label: control.label, message: err && err.message });
        }
      }
    };
    svgEl.addEventListener('pointerdown', startDrag);
    svgEl.addEventListener('pointermove', moveDrag);
    svgEl.addEventListener('pointerup', function(evt){ stopDrag(evt, 'pointerup'); });
    svgEl.addEventListener('pointercancel', function(evt){ stopDrag(evt, 'pointercancel'); });
    svgEl.addEventListener('pointerleave', function(evt){ stopDrag(evt, 'pointerleave'); });
  };

  plot3d.resolveLegendShiftX = function(options){
    const opts = options || {};
    if(!opts.legendVisible){
      return 0;
    }
    const margin = opts.margin || {};
    const marginLeft = Number.isFinite(margin.left) ? margin.left : 0;
    const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : 12;
    const minLeftPadding = Number.isFinite(opts.minLeftPadding)
      ? opts.minLeftPadding
      : Math.max(fontSize * 1.4, 18);
    const maxShift = Math.max(0, marginLeft - minLeftPadding);
    if(maxShift <= 0){
      return 0;
    }
    const legendWidth = Number.isFinite(opts.legendWidth) ? opts.legendWidth : 0;
    const baseShift = Math.max(fontSize * 1.6, 22);
    const legendBoost = legendWidth > 0 ? Math.min(legendWidth * 0.15, fontSize * 1.6) : 0;
    const desiredShift = baseShift + legendBoost;
    const shift = -Math.min(maxShift, desiredShift);
    if(shift !== 0){
      debugLog('Debug: plot3d legend shift resolved', {
        shift,
        marginLeft,
        minLeftPadding,
        baseShift,
        legendBoost,
        desiredShift,
        maxShift
      });
    }
    return shift;
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
    const shiftX = Number.isFinite(opts.shiftX) ? opts.shiftX : 0;
    const offsetX = (margin.left || 0) + (plotWidth - scaledWidth) / 2 + shiftX;
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
      margin,
      shiftX
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
    let axisDefs = [];
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
    const normalizeDashValue = value => {
      const numeric = Number(value);
      if(!Number.isFinite(numeric) || numeric <= 0){
        return null;
      }
      return numeric;
    };
    const normalizeDashArray = value => {
      if(Array.isArray(value)){
        const parts = [];
        for(let i = 0; i < value.length; i += 1){
          const normalized = normalizeDashValue(value[i]);
          if(normalized !== null){
            parts.push(normalized);
          }
        }
        return parts.length ? parts.join(' ') : null;
      }
      if(typeof value === 'string'){
        const trimmed = value.trim();
        if(!trimmed){
          return null;
        }
        if(trimmed.indexOf(',') !== -1){
          const tokens = trimmed.split(',');
          const parts = [];
          for(let i = 0; i < tokens.length; i += 1){
            const normalized = normalizeDashValue(tokens[i].trim());
            if(normalized !== null){
              parts.push(normalized);
            }
          }
          return parts.length ? parts.join(' ') : null;
        }
        return trimmed;
      }
      return null;
    };
    const gridDashAttr = normalizeDashArray(cfg.gridDash);
    const gridStrokeWidth = Number.isFinite(Number(cfg.gridStrokeWidth))
      ? Math.max(0, Number(cfg.gridStrokeWidth))
      : Math.max(0, axisStrokeWidth * 0.6);
    const gridOpacity = Number.isFinite(Number(cfg.gridOpacity))
      ? Math.max(0, Math.min(1, Number(cfg.gridOpacity)))
      : null;
    const gridOutlineWidth = Number.isFinite(Number(cfg.gridOutlineWidth))
      ? Math.max(0, Number(cfg.gridOutlineWidth))
      : gridStrokeWidth;
    const gridOutlineColors = cfg.gridOutlineColors || { primary: 'rgba(0,0,0,0.1)', secondary: 'rgba(0,0,0,0.08)' };
    const frameColor = cfg.frameColor || '#000000';
    const onAxisLabel = typeof cfg.onAxisLabel === 'function' ? cfg.onAxisLabel : null;
    const debugLabel = cfg.debugLabel || 'plot3d';
    const paneTarget = cfg.paneTarget || svg;
    const gridTarget = cfg.gridTarget || svg;
    const axisTarget = cfg.axisTarget || svg;
    const backFrameTarget = cfg.backFrameTarget || null;
    const backAxisTarget = cfg.backAxisTarget || backFrameTarget || null;
    const frontFrameTarget = cfg.frontFrameTarget || null;
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
    const axisTickFormatters = cfg.axisTickFormatters || {};
    const tickFontSize = Number.isFinite(cfg.tickFontSize) ? cfg.tickFontSize : fontSize;
    const tickLength = Number.isFinite(cfg.tickLength) ? cfg.tickLength : Math.max(4, Math.round(fontSize * 0.5));
    const tickLabelGap = Number.isFinite(cfg.tickLabelGap) ? cfg.tickLabelGap : Math.max(2, Math.round(fontSize * 0.3));
    const axisTitleGap = Number.isFinite(cfg.axisTitleGap) ? cfg.axisTitleGap : Math.max(4, Math.round(fontSize * 0.75));
    const tickTextColor = cfg.tickTextColor || chartStyle.TEXT_COLOR || '#333';
    const axisLabelColor = cfg.axisLabelColor || tickTextColor || chartStyle.TEXT_COLOR || '#333';
    const tickFont = typeof chartStyle.makeFont === 'function'
      ? chartStyle.makeFont(tickFontSize)
      : `${tickFontSize}px Arial, Helvetica, sans-serif`;
    const axisTickLabelRegistry = {
      x: { entries: [], angle: 0, unitAxis2d: null },
      y: { entries: [], angle: 0, unitAxis2d: null },
      z: { entries: [], angle: 0, unitAxis2d: null }
    };
    const axisLabelRegistry = { x: null, y: null, z: null };
    const formatTickLabel = (axisKey, value) => {
      const formatter = axisTickFormatters && axisTickFormatters[axisKey];
      if(typeof formatter === 'function'){
        try {
          return formatter(value);
        } catch(err){
          debugLog('Debug: plot3d tick formatter error', { label: debugLabel, axis: axisKey, message: err && err.message });
        }
      }
      if(typeof chartStyle.formatAxisValue === 'function'){
        return chartStyle.formatAxisValue(value, { maxDecimals: 2 });
      }
      if(typeof chartStyle.formatScientific === 'function'){
        return chartStyle.formatScientific(value, { maxDecimals: 2 });
      }
      if(!Number.isFinite(value)){
        return '';
      }
      return String(value);
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
    const doc = svg.ownerDocument || global.document;
    const rotatedCornerCache = new Array(allCorners.length);
    const projectedCornerCache = new Array(allCorners.length);
    if(typeof project === 'function'){
      for(let idx = 0; idx < allCorners.length; idx += 1){
        const corner = allCorners[idx];
        const rotated = rotatePoint(corner);
        rotatedCornerCache[idx] = rotated;
        projectedCornerCache[idx] = project(rotated);
      }
    }
    const hullEdgeKeys = new Set();
    if(projectedCornerCache.length){
      const points2d = [];
      for(let idx = 0; idx < projectedCornerCache.length; idx += 1){
        const pt = projectedCornerCache[idx];
        if(pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)){
          points2d.push({ x: pt.x, y: pt.y, index: idx });
        }
      }
      if(points2d.length >= 2){
        const sorted = points2d.slice().sort((a, b) => {
          if(a.x === b.x){ return a.y - b.y; }
          return a.x - b.x;
        });
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower = [];
        for(let i = 0; i < sorted.length; i += 1){
          const p = sorted[i];
          while(lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0){
            lower.pop();
          }
          lower.push(p);
        }
        const upper = [];
        for(let i = sorted.length - 1; i >= 0; i -= 1){
          const p = sorted[i];
          while(upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0){
            upper.pop();
          }
          upper.push(p);
        }
        if(lower.length){ lower.pop(); }
        if(upper.length){ upper.pop(); }
        const hullPoints = lower.concat(upper);
        for(let i = 0; i < hullPoints.length; i += 1){
          const a = hullPoints[i];
          const b = hullPoints[(i + 1) % hullPoints.length];
          if(!a || !b || a.index === b.index){ continue; }
          const key = a.index < b.index ? `${a.index}-${b.index}` : `${b.index}-${a.index}`;
          hullEdgeKeys.add(key);
        }
        debugLog('Debug: plot3d silhouette edges computed', { label: debugLabel, hullEdgeCount: hullEdgeKeys.size });
      }
    }
    const centerDepth = rotatePoint(cubeCenter).z || 0;
    const edgeDefs = [
      { key: 'x', startIdx: 0, endIdx: 1 },
      { key: 'x', startIdx: 2, endIdx: 3 },
      { key: 'x', startIdx: 4, endIdx: 5 },
      { key: 'x', startIdx: 6, endIdx: 7 },
      { key: 'y', startIdx: 0, endIdx: 2 },
      { key: 'y', startIdx: 1, endIdx: 3 },
      { key: 'y', startIdx: 4, endIdx: 6 },
      { key: 'y', startIdx: 5, endIdx: 7 },
      { key: 'z', startIdx: 0, endIdx: 4 },
      { key: 'z', startIdx: 1, endIdx: 5 },
      { key: 'z', startIdx: 2, endIdx: 6 },
      { key: 'z', startIdx: 3, endIdx: 7 }
    ];
    const edgeMeta = edgeDefs.map((def) => {
      const startRot = rotatedCornerCache[def.startIdx] || rotatePoint(allCorners[def.startIdx]);
      const endRot = rotatedCornerCache[def.endIdx] || rotatePoint(allCorners[def.endIdx]);
      const depthAvg = ((startRot?.z || 0) + (endRot?.z || 0)) / 2;
      const edgeKey = def.startIdx < def.endIdx
        ? `${def.startIdx}-${def.endIdx}`
        : `${def.endIdx}-${def.startIdx}`;
      const isSilhouette = hullEdgeKeys.has(edgeKey);
      const isOccluded = depthAvg < centerDepth && !isSilhouette;
      const startProj = project(startRot);
      const endProj = project(endRot);
      const midRot = {
        x: ((startRot?.x || 0) + (endRot?.x || 0)) / 2,
        y: ((startRot?.y || 0) + (endRot?.y || 0)) / 2,
        z: ((startRot?.z || 0) + (endRot?.z || 0)) / 2
      };
      const midProj = project(midRot);
      return Object.assign({}, def, {
        startRot,
        endRot,
        depthAvg,
        edgeKey,
        isSilhouette,
        isOccluded,
        startProj,
        endProj,
        midProj
      });
    });
    const edgesByAxis = { x: [], y: [], z: [] };
    for(let i=0;i<edgeMeta.length;i+=1){
      const em = edgeMeta[i];
      edgesByAxis[em.key].push(em);
    }
    const sharesVertex = (a, b) => {
      if(!a || !b){ return false; }
      return a.startIdx === b.startIdx
        || a.startIdx === b.endIdx
        || a.endIdx === b.startIdx
        || a.endIdx === b.endIdx;
    };
    const tripleConnected = (edges) => {
      if(!edges || edges.length !== 3){ return false; }
      const visitedEdges = new Set();
      const visitedVertices = new Set([edges[0].startIdx, edges[0].endIdx]);
      visitedEdges.add(0);
      let grew = true;
      while(grew){
        grew = false;
        for(let i=1;i<edges.length;i+=1){
          if(visitedEdges.has(i)){ continue; }
          const e = edges[i];
          if(visitedVertices.has(e.startIdx) || visitedVertices.has(e.endIdx)){
            visitedEdges.add(i);
            visitedVertices.add(e.startIdx);
            visitedVertices.add(e.endIdx);
            grew = true;
          }
        }
      }
      return visitedEdges.size === edges.length;
    };
    // Choose one edge per axis that forms a connected triple; prioritize visible, lower-on-screen edges
    const combos = [];
    for(let xi=0;xi<edgesByAxis.x.length;xi+=1){
      const ex = edgesByAxis.x[xi];
      for(let yi=0;yi<edgesByAxis.y.length;yi+=1){
        const ey = edgesByAxis.y[yi];
        for(let zi=0;zi<edgesByAxis.z.length;zi+=1){
        const ez = edgesByAxis.z[zi];
        const edgeSet = [ex, ey, ez];
        if(!tripleConnected(edgeSet)){
          continue;
        }
        const occludedCount = edgeSet.reduce((acc, e) => acc + (e.isOccluded ? 1 : 0), 0);
        const allShareSameVertex = sharesVertex(ex, ey) && sharesVertex(ey, ez) && sharesVertex(ex, ez);
        const avgLabelY = (ex.midProj.y + ey.midProj.y + ez.midProj.y) / 3;
        const avgLabelX = (ex.midProj.x + ey.midProj.x + ez.midProj.x) / 3;
        const minLabelX = Math.min(
          ex.startProj.x, ex.endProj.x, ey.startProj.x, ey.endProj.x, ez.startProj.x, ez.endProj.x
        );
        const depthSum = ex.depthAvg + ey.depthAvg + ez.depthAvg;
        const silhouetteCount = edgeSet.reduce((acc, e) => acc + (e.isSilhouette ? 1 : 0), 0);
        combos.push({
          edgeSet,
          occludedCount,
          allShareSameVertex,
          avgLabelY,
          avgLabelX,
          minLabelX,
          depthSum,
          silhouetteCount
        });
      }
    }
    }
    combos.sort((a, b) => {
      if(a.occludedCount !== b.occludedCount){ return a.occludedCount - b.occludedCount; }
      if(a.allShareSameVertex !== b.allShareSameVertex){ return a.allShareSameVertex ? 1 : -1; }
      if(a.avgLabelY !== b.avgLabelY){ return b.avgLabelY - a.avgLabelY; } // prefer lower on screen (larger y)
      if(a.minLabelX !== b.minLabelX){ return a.minLabelX - b.minLabelX; } // push labels leftward when possible
      if(a.avgLabelX !== b.avgLabelX){ return a.avgLabelX - b.avgLabelX; } // prefer left-most when ties remain
      if(a.depthSum !== b.depthSum){ return b.depthSum - a.depthSum; }
      if(a.silhouetteCount !== b.silhouetteCount){ return b.silhouetteCount - a.silhouetteCount; }
      return 0;
    });
    const fallbackAxisEdges = [
      edgeDefs[0],
      edgeDefs[4],
      edgeDefs[8]
    ];
    const selectedEdges = (combos[0] && combos[0].edgeSet) || fallbackAxisEdges;
    axisDefs = selectedEdges.map((edge) => ({
      key: edge.key,
      color: axisColor,
      label: axisLabels[edge.key] || edge.key.toUpperCase(),
      start: allCorners[edge.startIdx],
      end: allCorners[edge.endIdx],
      ticks: axisTicks[edge.key] || []
    }));
    debugLog('Debug: plot3d axis edges selected', {
      label: debugLabel,
      occludedCount: combos[0] ? combos[0].occludedCount : null,
      allShareSameVertex: combos[0] ? combos[0].allShareSameVertex : null,
      avgLabelY: combos[0] ? combos[0].avgLabelY : null,
      avgLabelX: combos[0] ? combos[0].avgLabelX : null,
      minLabelX: combos[0] ? combos[0].minLabelX : null,
      depthSum: combos[0] ? combos[0].depthSum : null
    });
    const frameEdgeLines = new Map();
    const frontWidth = Number.isFinite(cfg.frameFrontWidth) ? cfg.frameFrontWidth : axisStrokeWidth;
    const backWidth = Number.isFinite(cfg.frameBackWidth) ? cfg.frameBackWidth : axisStrokeWidth * 0.85;
    const frontOpacity = Number.isFinite(cfg.frameFrontOpacity) ? cfg.frameFrontOpacity : 1;
    const backOpacity = Number.isFinite(cfg.frameBackOpacity) ? cfg.frameBackOpacity : 0.32;
    const backDash = Array.isArray(cfg.frameBackDash) ? cfg.frameBackDash : [6, 4];
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
      if(gridDashAttr){
        gridGroup.setAttribute('stroke-dasharray', gridDashAttr);
      }
      gridGroup.setAttribute('stroke-width', gridStrokeWidth);
      if(gridOpacity !== null && gridOpacity < 1){
        gridGroup.setAttribute('stroke-opacity', gridOpacity);
      }
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
      const targetNode = target || axisTarget || svg;
      if(targetNode === gridGroup || (targetNode && typeof targetNode.getAttribute === 'function' && targetNode.getAttribute('data-grid-control') === '1')){
        line.setAttribute('data-grid-control', '1');
      }
      targetNode.appendChild(line);
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
        polygon.setAttribute('fill', paneFill);
        polygon.setAttribute('fill-opacity', String(Math.max(0, Math.min(1, opacity))));
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
        appendLine(rotatePoint(startMin), rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.max, [axisB]: axisRanges[axisB]?.min, [fixedKey]: fixedValue })), { stroke: gridOutlineColors.primary, 'stroke-width': gridOutlineWidth }, gridGroup);
        appendLine(rotatePoint(startMin), rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.min, [axisB]: axisRanges[axisB]?.max, [fixedKey]: fixedValue })), { stroke: gridOutlineColors.primary, 'stroke-width': gridOutlineWidth }, gridGroup);
        appendLine(rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.max, [axisB]: axisRanges[axisB]?.min, [fixedKey]: fixedValue })), rotatePoint(endMax), { stroke: gridOutlineColors.secondary, 'stroke-width': gridOutlineWidth }, gridGroup);
        appendLine(rotatePoint(makePoint({ [axisA]: axisRanges[axisA]?.min, [axisB]: axisRanges[axisB]?.max, [fixedKey]: fixedValue })), rotatePoint(endMax), { stroke: gridOutlineColors.secondary, 'stroke-width': gridOutlineWidth }, gridGroup);
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
      let frontCount = 0;
      let occludedCount = 0;
      let silhouetteCount = 0;
      for(let i=0;i<edges.length;i+=1){
        const pair = edges[i];
        const startRot = rotatedCornerCache[pair[0]] || rotatePoint(allCorners[pair[0]]);
        const endRot = rotatedCornerCache[pair[1]] || rotatePoint(allCorners[pair[1]]);
        const depthAvg = ((startRot.z || 0) + (endRot.z || 0)) / 2;
        const edgeKey = pair[0] < pair[1] ? `${pair[0]}-${pair[1]}` : `${pair[1]}-${pair[0]}`;
        const isSilhouetteEdge = hullEdgeKeys.has(edgeKey);
        const isOccludedEdge = depthAvg < centerDepth && !isSilhouetteEdge;
        const isFrontEdge = !isOccludedEdge;
        const attrs = {
          stroke: frameColor,
          'stroke-width': isFrontEdge ? frontWidth : backWidth,
          'data-frame-edge': isFrontEdge ? 'front' : 'back'
        };
        if(isFrontEdge){
          if(Number.isFinite(frontOpacity) && frontOpacity < 1){
            attrs['stroke-opacity'] = frontOpacity;
          }
        } else {
          if(Number.isFinite(backOpacity)){
            attrs['stroke-opacity'] = backOpacity;
          }
          if(backDash && backDash.length){
            attrs['stroke-dasharray'] = backDash.join(' ');
          }
          occludedCount += 1;
        }
        if(isSilhouetteEdge){
          silhouetteCount += 1;
        }
        if(isFrontEdge){
          frontCount += 1;
        }
        const frameTarget = isFrontEdge
          ? (frontFrameTarget || axisTarget || gridGroup || svg)
          : (backFrameTarget || axisTarget || gridGroup || svg);
        const line = appendLine(startRot, endRot, attrs, frameTarget);
        frameEdgeLines.set(edgeKey, line);
      }
      debugLog('Debug: plot3d frame rendered', {
        label: debugLabel,
        edgeCount: edges.length,
        frontEdges: frontCount,
        occludedEdges: occludedCount,
        silhouetteEdges: silhouetteCount,
        centerDepth
      });
    }
    const matchCornerIndex = (point) => {
      if(!point){ return null; }
      const EPS = 1e-6;
      for(let idx = 0; idx < allCorners.length; idx += 1){
        const corner = allCorners[idx];
        if(Math.abs((corner.x || 0) - (point.x || 0)) <= EPS
          && Math.abs((corner.y || 0) - (point.y || 0)) <= EPS
          && Math.abs((corner.z || 0) - (point.z || 0)) <= EPS){
          return idx;
        }
      }
      return null;
    };
    for(let i=0;i<axisDefs.length;i+=1){
      const def = axisDefs[i];
      const startRot = rotatePoint(def.start);
      const endRot = rotatePoint(def.end);
      const startPos = project(startRot);
      const endPos = project(endRot);
      const startIdx = matchCornerIndex(def.start);
      const endIdx = matchCornerIndex(def.end);
      const edgeKey = (startIdx != null && endIdx != null)
        ? (startIdx < endIdx ? `${startIdx}-${endIdx}` : `${endIdx}-${startIdx}`)
        : null;
      const isSilhouetteAxis = edgeKey ? hullEdgeKeys.has(edgeKey) : false;
      const depthAvg = ((startRot.z || 0) + (endRot.z || 0)) / 2;
      const isOccludedAxis = depthAvg < centerDepth && !isSilhouetteAxis;
      const axisStroke = showFrame ? frameColor : def.color;
      const axisFrontWidth = showFrame ? frontWidth : axisStrokeWidth * 0.9;
      const axisBackWidth = showFrame ? backWidth : axisStrokeWidth * 0.9;
      const axisAttrs = {
        stroke: axisStroke,
        'stroke-width': isOccludedAxis ? axisBackWidth : axisFrontWidth
      };
      if(isOccludedAxis){
        if(backDash && backDash.length){
          axisAttrs['stroke-dasharray'] = backDash.join(' ');
        }
        if(Number.isFinite(backOpacity)){
          axisAttrs['stroke-opacity'] = backOpacity;
        }
      } else if(showFrame && Number.isFinite(frontOpacity) && frontOpacity < 1){
        axisAttrs['stroke-opacity'] = frontOpacity;
      }
      const axisLineTarget = (isOccludedAxis && backAxisTarget) ? backAxisTarget : axisTarget;
      if(!(showFrame && edgeKey && frameEdgeLines.has(edgeKey))){
        appendLine(startRot, endRot, axisAttrs, axisLineTarget);
      }
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
      const axisVecLength = Math.hypot(axisVec2d.x, axisVec2d.y);
      const unitAxis2d = axisVecLength > 1e-6
        ? { x: axisVec2d.x / axisVecLength, y: axisVec2d.y / axisVecLength }
        : { x: 1, y: 0 };
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
      const angleDeg = Math.atan2(axisVec2d.y, axisVec2d.x) * (180 / Math.PI);
      let readableAngle = angleDeg;
      if(readableAngle > 90 || readableAngle < -90){
        readableAngle += readableAngle > 0 ? -180 : 180;
      }
      let tickLabelAngle = readableAngle + 90;
      if(tickLabelAngle > 90 || tickLabelAngle < -90){
        tickLabelAngle += tickLabelAngle > 0 ? -180 : 180;
      }
      const axisTickMeta = axisTickLabelRegistry[def.key];
      if(axisTickMeta){
        axisTickMeta.angle = tickLabelAngle;
        axisTickMeta.axisAngle = readableAngle;
        axisTickMeta.unitAxis2d = unitAxis2d;
        axisTickMeta.outwardPerp = outwardPerp;
      }
      const tickValues = Array.isArray(def.ticks) ? def.ticks : [];
      const startAxisValue = Number(def.start[def.key]);
      const endAxisValue = Number(def.end[def.key]);
      const axisSpan = endAxisValue - startAxisValue;
      const tickStrokeWidth = Math.max(0.6, axisStrokeWidth * 0.8);
      const tickLabelOffset = tickLength + tickLabelGap;
      let tickCount = 0;
      if(Number.isFinite(axisSpan) && Math.abs(axisSpan) > 0 && tickValues.length){
        const seen = new Set();
        for(let tIdx = 0; tIdx < tickValues.length; tIdx += 1){
          const tickValue = tickValues[tIdx];
          if(!Number.isFinite(tickValue)){ continue; }
          const dedupeKey = String(tickValue);
          if(seen.has(dedupeKey)){ continue; }
          seen.add(dedupeKey);
          const t = (tickValue - startAxisValue) / axisSpan;
          if(!Number.isFinite(t) || t < -0.001 || t > 1.001){ continue; }
          const tickPoint = {
            x: def.start.x + axisVector.x * t,
            y: def.start.y + axisVector.y * t,
            z: def.start.z + axisVector.z * t
          };
          const tickPos = project(rotatePoint(tickPoint));
          const tickEnd = {
            x: tickPos.x + outwardPerp.x * tickLength,
            y: tickPos.y + outwardPerp.y * tickLength
          };
          const tickLineAttrs = {
            x1: tickPos.x,
            y1: tickPos.y,
            x2: tickEnd.x,
            y2: tickEnd.y,
            stroke: axisStroke,
            'stroke-width': tickStrokeWidth,
            'data-axis-tick': '1',
            'data-axis-key': def.key
          };
          if(isOccludedAxis){
            if(backDash && backDash.length){
              tickLineAttrs['stroke-dasharray'] = backDash.join(' ');
            }
            if(Number.isFinite(backOpacity)){
              tickLineAttrs['stroke-opacity'] = backOpacity;
            }
          } else if(showFrame && Number.isFinite(frontOpacity) && frontOpacity < 1){
            tickLineAttrs['stroke-opacity'] = frontOpacity;
          }
          const tickTarget = (isOccludedAxis && backAxisTarget) ? backAxisTarget : axisTarget;
          createElement('line', tickLineAttrs, null, tickTarget);
          const labelText = formatTickLabel(def.key, tickValue);
          if(labelText !== '' && labelText != null){
            const labelX = tickPos.x + outwardPerp.x * tickLabelOffset;
            const labelY = tickPos.y + outwardPerp.y * tickLabelOffset;
            const labelAttrs = {
              x: labelX,
              y: labelY,
              'font-size': tickFontSize,
              'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              fill: tickTextColor,
              transform: `rotate(${tickLabelAngle} ${labelX} ${labelY})`,
              'data-axis-tick-label': '1',
              'data-axis-key': def.key
            };
            if(isOccludedAxis && Number.isFinite(backOpacity)){
              labelAttrs['fill-opacity'] = backOpacity;
            }
            const tickLabelEl = createElement('text', labelAttrs, labelText, labelTarget);
            if(axisTickMeta && tickLabelEl){
              axisTickMeta.entries.push({
                el: tickLabelEl,
                text: labelText,
                axisCoord: (tickPos.x * unitAxis2d.x) + (tickPos.y * unitAxis2d.y),
                tickPos: { x: tickPos.x, y: tickPos.y },
                x: labelX,
                y: labelY
              });
            }
          }
          tickCount += 1;
        }
      }
      if(tickCount){
        debugLog('Debug: plot3d ticks rendered', { label: debugLabel, axis: def.key, count: tickCount });
      }
      const minLabelOffset = tickLabelOffset + tickFontSize + axisTitleGap;
      const offsetMagnitude = Math.max(fontSize * 1.2, minLabelOffset);
      const labelPos = {
        x: labelBasePos.x + outwardPerp.x * offsetMagnitude,
        y: labelBasePos.y + outwardPerp.y * offsetMagnitude
      };
      const axisLabelAttrs = {
        x: labelPos.x,
        y: labelPos.y,
        'font-size': fontSize,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: axisLabelColor,
        transform: `rotate(${readableAngle} ${labelPos.x} ${labelPos.y})`,
        'data-axis-label': '1',
        'data-axis-key': def.key,
        'data-axis-angle': String(readableAngle)
      };
      if(readableAngle !== angleDeg){
        axisLabelAttrs['data-axis-flipped'] = '1';
      }
      const axisLabelEl = createElement('text', axisLabelAttrs, def.label, svg);
      debugLog('Debug: plot3d axis label orientation', {
        label: debugLabel,
        axis: def.key,
        rawAngle: angleDeg,
        appliedAngle: readableAngle,
        flipped: readableAngle !== angleDeg
      });
      axisLabelRegistry[def.key] = {
        el: axisLabelEl,
        basePos: axisMidPos,
        outwardPerp,
        baseAngle: readableAngle,
        baseOffset: offsetMagnitude
      };
      if(onAxisLabel){
        try {
          onAxisLabel(axisLabelEl, def.key, def.label);
        } catch(err){
          debugLog('Debug: plot3d axis label callback error', { label: debugLabel, axis: def.key, message: err && err.message });
        }
      }
    }
    const measureTickLabel = (text) => {
      if(typeof chartStyle.measureText === 'function'){
        return chartStyle.measureText(text || '', tickFont);
      }
      return (String(text || '').length || 0) * tickFontSize * 0.6;
    };
    const normalizeDeg = (deg) => {
      let value = Number.isFinite(deg) ? deg : 0;
      while(value <= -180){ value += 360; }
      while(value > 180){ value -= 360; }
      return value;
    };
      const tiltMax = Number.isFinite(cfg.tickLabelTiltMax) ? cfg.tickLabelTiltMax : 55;
      const tiltMin = Number.isFinite(cfg.tickLabelTiltMin) ? cfg.tickLabelTiltMin : 12;
      const minGap = Number.isFinite(cfg.tickLabelMinGap) ? cfg.tickLabelMinGap : Math.max(2, Math.round(tickFontSize * 0.15));
      const tickLabelClearance = Number.isFinite(cfg.tickLabelTickClearance)
        ? cfg.tickLabelTickClearance
        : tickLabelGap;
    const axisKeys = ['x', 'y', 'z'];
    for(let k = 0; k < axisKeys.length; k += 1){
      const axisKey = axisKeys[k];
      const meta = axisTickLabelRegistry[axisKey];
      const entries = meta && Array.isArray(meta.entries) ? meta.entries : [];
      if(entries.length < 2){ continue; }
      const unitAxis2d = meta.unitAxis2d || { x: 1, y: 0 };
      const baseAngle = Number.isFinite(meta.angle) ? meta.angle : 0;
      const axisAngle = Number.isFinite(meta.axisAngle) ? meta.axisAngle : baseAngle;
      const baseRelDeg = Math.abs(normalizeDeg(baseAngle - axisAngle));
      const sorted = entries.slice().sort((a, b) => (a.axisCoord || 0) - (b.axisCoord || 0));
      let requiredAngle = 0;
      let overlapPairs = 0;
      for(let j = 1; j < sorted.length; j += 1){
        const prev = sorted[j - 1];
        const curr = sorted[j];
        if(!prev || !curr){ continue; }
        if(!Number.isFinite(prev.width)){
          prev.width = measureTickLabel(prev.text);
        }
        if(!Number.isFinite(curr.width)){
          curr.width = measureTickLabel(curr.text);
        }
        const spacing = (curr.axisCoord || 0) - (prev.axisCoord || 0);
        const denom = prev.width + curr.width;
        if(!(denom > 0)){ continue; }
        const ratio = ((spacing - minGap) * 2) / denom;
        if(ratio < 1){
          const angle = Math.acos(clamp(ratio, 0, 1));
          if(angle > requiredAngle){
            requiredAngle = angle;
          }
          overlapPairs += 1;
        }
      }
      if(requiredAngle <= 1e-3){ continue; }
      const requiredDeg = requiredAngle * (180 / Math.PI);
      const cappedRequiredDeg = Math.min(90, requiredDeg);
      if(cappedRequiredDeg <= baseRelDeg + 0.1){ continue; }
      const tiltDeg = Math.min(tiltMax, Math.max(0, cappedRequiredDeg - baseRelDeg));
      if(tiltDeg <= 0.01){ continue; }
      const relSign = normalizeDeg(baseAngle - axisAngle) >= 0 ? 1 : -1;
      let appliedAngle = baseAngle + relSign * tiltDeg;
      if(appliedAngle > 90 || appliedAngle < -90){
        appliedAngle += appliedAngle > 0 ? -180 : 180;
      }
      const anchor = Math.abs(unitAxis2d.x) >= 0.2
        ? (unitAxis2d.x >= 0 ? 'end' : 'start')
        : 'middle';
      for(let j = 0; j < entries.length; j += 1){
        const entry = entries[j];
        const el = entry && entry.el;
        if(!el){ continue; }
        const x = entry.x;
        const y = entry.y;
        if(!Number.isFinite(x) || !Number.isFinite(y)){ continue; }
        el.setAttribute('transform', `rotate(${appliedAngle} ${x} ${y})`);
        if(anchor !== 'middle'){
          el.setAttribute('text-anchor', anchor);
          el.setAttribute('dy', '0.35em');
        }
      }
      debugLog('Debug: plot3d tick label tilt applied', {
        label: debugLabel,
        axis: axisKey,
        baseAngle,
        appliedAngle,
        tiltDeg,
        overlapPairs
      });
      if(cappedRequiredDeg > tiltMax + 0.01){
        debugLog('Debug: plot3d tick label tilt capped', {
          label: debugLabel,
          axis: axisKey,
          requiredDeg: cappedRequiredDeg,
          tiltMax
        });
      }
    }
      for(let k = 0; k < axisKeys.length; k += 1){
        const axisKey = axisKeys[k];
        const meta = axisTickLabelRegistry[axisKey];
        const entries = meta && Array.isArray(meta.entries) ? meta.entries : [];
        const outwardPerp = meta?.outwardPerp;
        if(!entries.length || !outwardPerp){ continue; }
        const desiredMin = tickLength + tickLabelClearance;
        let alignedCount = 0;
        for(let j = 0; j < entries.length; j += 1){
          const entry = entries[j];
          const el = entry && entry.el;
          const tickPos = entry && entry.tickPos;
          if(!el || !tickPos || typeof el.getBBox !== 'function'){ continue; }
          const box = el.getBBox();
          const corners = [
            { x: box.x, y: box.y },
            { x: box.x + box.width, y: box.y },
            { x: box.x, y: box.y + box.height },
            { x: box.x + box.width, y: box.y + box.height }
          ];
          let minProjection = Infinity;
          for(let c = 0; c < corners.length; c += 1){
            const corner = corners[c];
            const dx = corner.x - tickPos.x;
            const dy = corner.y - tickPos.y;
            const projection = (dx * outwardPerp.x) + (dy * outwardPerp.y);
            if(projection < minProjection){
              minProjection = projection;
            }
          }
          if(!Number.isFinite(minProjection)){ continue; }
          const shift = desiredMin - minProjection;
          if(Math.abs(shift) <= 0.05){ continue; }
          const x = entry.x + outwardPerp.x * shift;
          const y = entry.y + outwardPerp.y * shift;
          entry.x = x;
          entry.y = y;
          el.setAttribute('x', String(x));
          el.setAttribute('y', String(y));
          const angle = Number.isFinite(meta.angle) ? meta.angle : 0;
          el.setAttribute('transform', `rotate(${angle} ${x} ${y})`);
          alignedCount += 1;
        }
        if(alignedCount){
          debugLog('Debug: plot3d tick label offset updated', {
            label: debugLabel,
            axis: axisKey,
            desiredMin,
            alignedCount
          });
        }
      }
      const axisLabelPad = Number.isFinite(cfg.axisLabelTickGap)
        ? cfg.axisLabelTickGap
        : Math.max(6, Math.round(tickFontSize * 0.5));
    for(let k = 0; k < axisKeys.length; k += 1){
      const axisKey = axisKeys[k];
      const labelMeta = axisLabelRegistry[axisKey];
      if(!labelMeta || !labelMeta.el || !labelMeta.basePos || !labelMeta.outwardPerp){ continue; }
      const tickEntries = axisTickLabelRegistry[axisKey]?.entries || [];
      if(!tickEntries.length){ continue; }
      let maxProjection = 0;
      for(let j = 0; j < tickEntries.length; j += 1){
        const entry = tickEntries[j];
        const el = entry && entry.el;
        if(!el || typeof el.getBBox !== 'function'){ continue; }
        const box = el.getBBox();
        const corners = [
          { x: box.x, y: box.y },
          { x: box.x + box.width, y: box.y },
          { x: box.x, y: box.y + box.height },
          { x: box.x + box.width, y: box.y + box.height }
        ];
        for(let c = 0; c < corners.length; c += 1){
          const corner = corners[c];
          const dx = corner.x - labelMeta.basePos.x;
          const dy = corner.y - labelMeta.basePos.y;
          const projection = (dx * labelMeta.outwardPerp.x) + (dy * labelMeta.outwardPerp.y);
          if(projection > maxProjection){
            maxProjection = projection;
          }
        }
      }
      const minOffset = Math.max(labelMeta.baseOffset || 0, maxProjection + axisTitleGap + axisLabelPad);
      const labelPos = {
        x: labelMeta.basePos.x + labelMeta.outwardPerp.x * minOffset,
        y: labelMeta.basePos.y + labelMeta.outwardPerp.y * minOffset
      };
      labelMeta.el.setAttribute('x', String(labelPos.x));
      labelMeta.el.setAttribute('y', String(labelPos.y));
      labelMeta.el.setAttribute('transform', `rotate(${labelMeta.baseAngle} ${labelPos.x} ${labelPos.y})`);
      debugLog('Debug: plot3d axis label offset updated', {
        label: debugLabel,
        axis: axisKey,
        baseOffset: labelMeta.baseOffset,
        appliedOffset: minOffset,
        maxProjection
      });
    }
    debugLog('Debug: plot3d axes rendered', { label: debugLabel });
    return {
      cubeCenter2D,
      axisDefs
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
