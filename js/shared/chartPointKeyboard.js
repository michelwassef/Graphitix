(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const attachedPlots = new WeakMap();

  function resolvePoint(root, target, selector){
    const point = target?.closest?.(selector) || null;
    return point && root.contains(point) ? point : null;
  }

  function visiblePoints(root, state){
    const selector = state.options.pointSelector;
    if(typeof selector !== 'string' || !selector.trim()){
      return [];
    }
    return Array.from(root.querySelectorAll(selector)).filter(point => {
      if(!point.isConnected || !root.contains(point)
        || point.__chartPointKeyboardOwnerTabId !== state.options.ownerTabId
        || point.closest('[hidden], [aria-hidden="true"]')){
        return false;
      }
      const style = global.getComputedStyle?.(point);
      if(style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')){
        return false;
      }
      const rect = point.getBoundingClientRect?.();
      return !!rect && (rect.width > 0 || rect.height > 0);
    });
  }

  function centerOf(point){
    const rect = point.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function spatialNeighbor(points, current, key){
    const origin = centerOf(current);
    const direction = key === 'ArrowLeft' ? 'left'
      : key === 'ArrowRight' ? 'right'
        : key === 'ArrowUp' ? 'up' : 'down';
    let best = null;
    let bestScore = Infinity;
    points.forEach(point => {
      if(point === current){
        return;
      }
      const center = centerOf(point);
      const dx = center.x - origin.x;
      const dy = center.y - origin.y;
      const primary = direction === 'left' ? -dx
        : direction === 'right' ? dx
          : direction === 'up' ? -dy : dy;
      if(primary <= 0.5){
        return;
      }
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = primary + secondary * 1.5;
      if(score < bestScore){
        best = point;
        bestScore = score;
      }
    });
    return best;
  }

  function focus(point){
    if(!point || typeof point.focus !== 'function'){
      return false;
    }
    try{
      point.focus({ preventScroll: true });
    }catch(_err){
      point.focus();
    }
    return true;
  }

  const POINT_ATTRIBUTES = ['tabindex', 'role', 'aria-label', 'data-chart-point-keyboard'];

  function restoreActivePoint(state){
    const point = state.activePoint;
    const original = state.activePointAttributes;
    state.activePoint = null;
    state.activePointAttributes = null;
    if(!point?.isConnected || !state.root.contains(point) || !original){
      return;
    }
    POINT_ATTRIBUTES.forEach(name => {
      const value = original[name];
      if(value == null){
        point.removeAttribute(name);
      }else{
        point.setAttribute(name, value);
      }
    });
  }

  function exposeActivePoint(state, point){
    if(!point || !state.root.contains(point)
      || point.__chartPointKeyboardOwnerTabId !== String(state.options.ownerTabId ?? '')){
      return false;
    }
    if(state.activePoint !== point){
      restoreActivePoint(state);
      state.activePoint = point;
      state.activePointAttributes = Object.fromEntries(
        POINT_ATTRIBUTES.map(name => [name, point.getAttribute(name)])
      );
    }
    const data = state.pointData.get(point) || {};
    const label = typeof state.options.describePoint === 'function'
      ? state.options.describePoint(data)
      : '';
    const accessibleName = String(label || '').trim()
      || `Data point ${Number.isInteger(data?.index) ? data.index + 1 : ''}`.trim();
    point.setAttribute('tabindex', '-1');
    point.setAttribute('role', 'button');
    point.setAttribute('data-chart-point-keyboard', 'true');
    point.setAttribute('aria-label', accessibleName);
    return true;
  }

  function isCurrentOwner(state){
    const ownerTabId = state.options.ownerTabId;
    if(ownerTabId == null || String(ownerTabId).trim() === ''){
      return false;
    }
    if(typeof state.options.getCurrentOwnerTabId !== 'function'){
      return false;
    }
    return String(state.options.getCurrentOwnerTabId() || '') === String(ownerTabId);
  }

  function dispatchPointClick(point){
    const MouseEventCtor = point?.ownerDocument?.defaultView?.MouseEvent || global.MouseEvent;
    if(!point || typeof MouseEventCtor !== 'function'){
      return false;
    }
    point.dispatchEvent(new MouseEventCtor('click', {
      bubbles: true,
      cancelable: true,
      view: point.ownerDocument?.defaultView || global
    }));
    return true;
  }

  function attach(root, options = {}){
    if(!root || root.nodeType !== 1 || typeof root.querySelectorAll !== 'function'){
      return null;
    }
    let state = attachedPlots.get(root);
    if(state){
      const previousOwner = state.options.ownerTabId;
      Object.assign(state.options, options);
      if(String(previousOwner ?? '') !== String(state.options.ownerTabId ?? '')){
        restoreActivePoint(state);
      }
      state.syncRootSemantics();
      return state.controller;
    }

    state = {
      root,
      options: { ...options },
      pointData: new WeakMap(),
      activePoint: null,
      activePointAttributes: null,
      destroyed: false
    };
    state.syncRootSemantics = () => {
      const label = String(state.options.componentLabel || 'Chart').trim();
      const instructions = String(state.options.instructions || 'Use the arrow keys to navigate data points.').trim();
      root.setAttribute('role', 'group');
      root.setAttribute('tabindex', '0');
      root.setAttribute('aria-label', `${label} chart`);
      root.setAttribute('aria-description', instructions);
      root.classList?.add('chart-point-navigation-root');
      const rotationSvg = root.querySelector('[data-rotation-controls-attached="true"]');
      if(rotationSvg && typeof Shared.plot3d?.syncRotationKeyboardSemantics === 'function'){
        Shared.plot3d.syncRotationKeyboardSemantics(rotationSvg);
      }else if(typeof Shared.plot3d?.clearRotationKeyboardSemantics === 'function'){
        Shared.plot3d.clearRotationKeyboardSemantics(root);
      }
      if(state.options.componentKey){
        root.dataset.chartPointNavigation = String(state.options.componentKey);
      }
    };

    const onKeyDown = event => {
      if(state.destroyed || event.altKey || event.ctrlKey || event.metaKey){
        return;
      }
      const key = event.key;
      if(event.shiftKey){
        if(!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key) || !isCurrentOwner(state)){
          return;
        }
        const rotationSvg = root.querySelector('[data-rotation-controls-attached="true"]');
        Shared.plot3d?.rotateByKeyboard?.(rotationSvg, event);
        return;
      }
      if(!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(key)){
        return;
      }
      if(!isCurrentOwner(state)){
        return;
      }
      const points = visiblePoints(root, state);
      if(!points.length){
        return;
      }
      const selector = state.options.pointSelector;
      const current = resolvePoint(root, event.target, selector);
      if(key === 'Enter' || key === ' '){
        if(!current || current.__chartPointKeyboardOwnerTabId !== String(state.options.ownerTabId ?? '') || event.repeat){
          return;
        }
        event.preventDefault();
        dispatchPointClick(current);
        return;
      }
      let next = null;
      if(key === 'Home'){
        next = points[0];
      }else if(key === 'End'){
        next = points[points.length - 1];
      }else if(!current){
        next = points[0];
      }else{
        next = spatialNeighbor(points, current, key);
      }
      if(next){
        event.preventDefault();
        if(exposeActivePoint(state, next)){
          focus(next);
        }
      }
    };

    const registerPoint = (point, data) => {
      if(state.destroyed || !point || point.nodeType !== 1){
        return false;
      }
      const ownerTabId = state.options.ownerTabId;
      point.__chartPointKeyboardOwnerTabId = ownerTabId == null ? null : String(ownerTabId);
      state.pointData.set(point, data || null);
      return true;
    };

    root.addEventListener('keydown', onKeyDown);
    state.syncRootSemantics();
    state.controller = Object.freeze({
      registerPoint,
      activatePoint(point){
        return !state.destroyed && isCurrentOwner(state) && exposeActivePoint(state, point);
      },
      update(nextOptions = {}){
        if(state.destroyed){
          return false;
        }
        Object.assign(state.options, nextOptions);
        state.syncRootSemantics();
        return true;
      },
      destroy(){
        if(state.destroyed){
          return;
        }
        state.destroyed = true;
        restoreActivePoint(state);
        root.removeEventListener('keydown', onKeyDown);
        root.removeAttribute('role');
        root.removeAttribute('tabindex');
        root.removeAttribute('aria-label');
        root.removeAttribute('data-chart-point-navigation');
        Shared.plot3d?.clearRotationKeyboardSemantics?.(root);
        root.removeAttribute('aria-description');
        root.classList?.remove('chart-point-navigation-root');
        attachedPlots.delete(root);
      }
    });
    attachedPlots.set(root, state);
    return state.controller;
  }

  function registerPoint(root, point, data){
    const state = attachedPlots.get(root);
    return state?.controller?.registerPoint(point, data) === true;
  }

  function activatePoint(root, point){
    const state = root && attachedPlots.get(root);
    return state?.controller?.activatePoint(point) === true;
  }

  Shared.chartPointKeyboard = Object.freeze({ attach, registerPoint, activatePoint });
})(typeof window !== 'undefined' ? window : globalThis);
