(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};

  const logDebug = (label, payload) => {
    try {
      console.debug(`Debug: ${label}`, payload); // Debug: shared dom helper trace
    } catch (err) {
      // Swallow logging issues silently to avoid breaking consumers.
    }
  };

  const safeCall = (fn, args = [], onErrorLabel) => {
    if (typeof fn !== 'function') return undefined;
    try {
      return fn(...args);
    } catch (err) {
      console.error(onErrorLabel || 'Shared DOM helper callback error', err);
      return undefined;
    }
  };

  function makeEditable(el, onChange, options = {}) {
    if (!el) {
      logDebug('makeEditable skipped (no element)', { hasElement: false });
      return;
    }

    const {
      promptMessage = 'Edit text',
      getInitialValue = node => node?.textContent ?? '',
      applyValue = (node, value) => { if (node) node.textContent = value; },
      onEditStart,
      onEditEnd,
      cursor = 'pointer',
      promptFn = global.prompt ? global.prompt.bind(global) : null,
    } = options;

    const effectivePrompt = typeof options.promptFn === 'function' ? options.promptFn : promptFn;

    el.style.cursor = cursor;

    const handler = () => {
      try {
        safeCall(onEditStart, [el], 'Shared.makeEditable onEditStart error');
        const initialValue = safeCall(getInitialValue, [el], 'Shared.makeEditable getInitialValue error');
        const nextValue = effectivePrompt ? effectivePrompt(promptMessage, initialValue) : initialValue;
        logDebug('makeEditable interaction', { initialValue, nextValue, usedPrompt: !!effectivePrompt });
        if (nextValue !== null && nextValue !== undefined) {
          safeCall(applyValue, [el, nextValue], 'Shared.makeEditable applyValue error');
          if (typeof onChange === 'function') {
            safeCall(onChange, [nextValue, el], 'Shared.makeEditable onChange error');
          }
        }
        safeCall(onEditEnd, [el, nextValue], 'Shared.makeEditable onEditEnd error');
      } catch (err) {
        console.error('Shared.makeEditable handler error', err);
      }
    };

    el.addEventListener('dblclick', handler);
    logDebug('makeEditable bound', { hasOnChange: typeof onChange === 'function' });
  }

  function autoResizeSvg(svg, opts = {}) {
    if (!svg) {
      logDebug('autoResizeSvg skipped (no svg)', { hasSvg: false });
      return;
    }
    const {
      fill = true,
      padding = 10,
      minWidth = 0,
      minHeight = 0,
      onResize,
      debugLabel = 'sharedAutoResize',
      remeasure = true,
    } = opts;

    const raf = typeof global.requestAnimationFrame === 'function'
      ? global.requestAnimationFrame.bind(global)
      : (cb) => global.setTimeout(cb, 16);

    const applyResize = () => {
      try {
        let bbox;
        try {
          bbox = typeof svg.getBBox === 'function' ? svg.getBBox() : null;
        } catch (bboxErr) {
          console.error('Shared.autoResizeSvg getBBox error', bboxErr);
        }
        if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) {
          const viewBox = svg.viewBox?.baseVal;
          bbox = {
            x: viewBox?.x ?? 0,
            y: viewBox?.y ?? 0,
            width: viewBox?.width ?? svg.clientWidth ?? minWidth,
            height: viewBox?.height ?? svg.clientHeight ?? minHeight,
          };
        }
        const effectivePadding = Number.isFinite(padding) ? padding : 0;
        const minX = Math.min(0, bbox.x - effectivePadding);
        const minY = Math.min(0, bbox.y - effectivePadding);
        const viewW = Math.max(minWidth, bbox.x + bbox.width + effectivePadding - minX);
        const viewH = Math.max(minHeight, bbox.y + bbox.height + effectivePadding - minY);
        svg.setAttribute('viewBox', `${minX} ${minY} ${viewW} ${viewH}`);
        if (fill) {
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
        }
        const parent = svg.parentElement;
        if (parent) parent.style.overflow = 'visible';
        const box = svg.closest?.('.svgbox');
        if (box) box.style.overflow = 'visible';
        logDebug('autoResizeSvg applied', { debugLabel, bbox, minX, minY, viewW, viewH, fill });
        if (typeof onResize === 'function') {
          safeCall(onResize, [{ svg, bbox, viewBox: { minX, minY, viewW, viewH } }], 'Shared.autoResizeSvg onResize error');
        }
      } catch (err) {
        console.error('Shared.autoResizeSvg error', err);
      }
    };

    applyResize();
    if (remeasure) {
      raf(() => applyResize());
    }
  }

  function ensureGraphViewport(svg, options = {}) {
    if (!svg) {
      logDebug('ensureGraphViewport skipped (no svg)', { hasSvg: false });
      return;
    }
    const helper = Shared.autoResizeSvg || global.autoResizeSvg;
    if (typeof helper !== 'function') {
      logDebug('ensureGraphViewport missing autoResizeSvg helper', {
        component: options.component || null,
        debugLabel: options.debugLabel || null
      });
      return;
    }
    const defaults = {
      fill: true,
      padding: 16,
      remeasure: true
    };
    const payload = { ...defaults, ...options };
    if (payload.component && !payload.debugLabel) {
      payload.debugLabel = `${payload.component}-viewport`;
    }
    try {
      helper(svg, payload);
      logDebug('ensureGraphViewport applied', {
        component: payload.component || null,
        debugLabel: payload.debugLabel || null,
        padding: payload.padding,
        fill: payload.fill
      });
    } catch (err) {
      console.error('Shared.ensureGraphViewport error', err);
    }
  }

  function createGraphViewportEnsurer(componentName, defaultOptions = {}) {
    return function ensureForComponent(svg, options = {}) {
      const payload = { ...defaultOptions, ...options };
      if (componentName && !payload.component) {
        payload.component = componentName;
      }
      if (componentName && !payload.debugLabel) {
        payload.debugLabel = `${componentName}-viewport`;
      }
      ensureGraphViewport(svg, payload);
    };
  }

  function serializeCleanSVG(svgEl, options = {}) {
    if (!svgEl) {
      logDebug('serializeCleanSVG skipped (no element)', { hasElement: false });
      return '';
    }
    try {
      const clone = svgEl.cloneNode(true);
      if (options.beforeSanitize) {
        safeCall(options.beforeSanitize, [clone], 'Shared.serializeCleanSVG beforeSanitize error');
      }
      if (options.stripSelectors && Array.isArray(options.stripSelectors)) {
        options.stripSelectors.forEach(selector => {
          clone.querySelectorAll?.(selector)?.forEach?.(node => node.remove());
        });
      }
      const sanitize = options.sanitize !== false;
      if (sanitize) {
        clone.querySelectorAll?.('[contenteditable],[contentEditable]')?.forEach?.(node => {
          node.removeAttribute?.('contenteditable');
          node.removeAttribute?.('contentEditable');
        });
      }
      const serializer = options.serializer || new (global.XMLSerializer || XMLSerializer)();
      const xml = serializer.serializeToString(clone);
      if (options.afterSerialize) {
        safeCall(options.afterSerialize, [xml], 'Shared.serializeCleanSVG afterSerialize error');
      }
      logDebug('serializeCleanSVG complete', { length: xml.length, sanitize });
      return xml;
    } catch (err) {
      console.error('Shared.serializeCleanSVG error', err);
      return '';
    }
  }

  Shared.makeEditable = makeEditable;
  Shared.autoResizeSvg = autoResizeSvg;
  Shared.ensureGraphViewport = ensureGraphViewport;
  Shared.graphViewport = Shared.graphViewport || {};
  Shared.graphViewport.ensure = ensureGraphViewport;
  Shared.graphViewport.createEnsurer = createGraphViewportEnsurer;
  Shared.serializeCleanSVG = serializeCleanSVG;

  if (typeof global.makeEditable !== 'function') {
    global.makeEditable = makeEditable;
  }
  if (typeof global.autoResizeSvg !== 'function') {
    global.autoResizeSvg = autoResizeSvg;
  }
  if (typeof global.ensureGraphViewport !== 'function') {
    global.ensureGraphViewport = ensureGraphViewport;
  }
  if (typeof global.serializeCleanSVG !== 'function') {
    global.serializeCleanSVG = serializeCleanSVG;
  }
  logDebug('shared DOM helpers ready', {
    hasMakeEditable: typeof Shared.makeEditable === 'function',
    hasAutoResizeSvg: typeof Shared.autoResizeSvg === 'function',
    hasSerializeCleanSVG: typeof Shared.serializeCleanSVG === 'function'
  });
})(typeof window !== 'undefined' ? window : globalThis);
