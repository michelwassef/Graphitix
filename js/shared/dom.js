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
      getInitialValue = node => node?.textContent ?? '',
      applyValue = (node, value) => { if (node) node.textContent = value; },
      onEditStart,
      onEditEnd,
      cursor = 'pointer',
      overlayParent,
      multiline = false,
      minWidth = 0,
      minHeight = 0,
      inputProps = {},
    } = options;

    const ownerDocument = el.ownerDocument || global.document;
    const ownerWindow = ownerDocument?.defaultView || global;
    const body = overlayParent || ownerDocument?.body;
    if (!body) {
      console.warn('Shared.makeEditable missing document body for overlay');
      return;
    }

    el.style.cursor = cursor;

    const removeOverlay = (state) => {
      if (!state) return;
      if (state.overlay) {
        state.overlay.remove();
      }
      if (state.measure) {
        state.measure.remove();
      }
      state.overlay = null;
      state.input = null;
      state.measure = null;
    };

    const handler = (event) => {
      event?.preventDefault?.();
      try {
        safeCall(onEditStart, [el], 'Shared.makeEditable onEditStart error');
        const initialValue = safeCall(getInitialValue, [el], 'Shared.makeEditable getInitialValue error');
        const rect = typeof el.getBoundingClientRect === 'function'
          ? el.getBoundingClientRect()
          : { left: 0, top: 0, width: minWidth, height: minHeight };
        const scrollLeft = ownerWindow?.scrollX
          ?? ownerDocument.documentElement?.scrollLeft
          ?? ownerDocument.body?.scrollLeft
          ?? 0;
        const scrollTop = ownerWindow?.scrollY
          ?? ownerDocument.documentElement?.scrollTop
          ?? ownerDocument.body?.scrollTop
          ?? 0;
        const overlay = ownerDocument.createElement('div');
        overlay.className = 'inline-edit-overlay';
        overlay.style.position = 'absolute';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'inline-flex';
        overlay.style.alignItems = 'stretch';
        overlay.style.justifyContent = 'stretch';

        const targetWidth = Math.max(rect.width || 0, minWidth);
        const targetHeight = Math.max(rect.height || 0, minHeight);
        const targetCenterX = rect.left + (rect.width || 0) / 2 + scrollLeft;
        const targetCenterY = rect.top + (rect.height || 0) / 2 + scrollTop;
        overlay.style.width = `${targetWidth}px`;
        overlay.style.height = `${targetHeight}px`;
        overlay.style.left = `${targetCenterX - targetWidth / 2}px`;
        overlay.style.top = `${targetCenterY - targetHeight / 2}px`;

        const input = ownerDocument.createElement(multiline ? 'textarea' : 'input');
        input.className = 'inline-edit-input';
        Object.keys(inputProps || {}).forEach(key => {
          try {
            input[key] = inputProps[key];
          } catch (assignErr) {
            console.error('Shared.makeEditable inputProps assignment error', assignErr);
          }
        });
        input.value = initialValue ?? '';
        input.setAttribute('aria-label', 'Edit text');
        input.style.width = '100%';
        input.style.height = '100%';
        if (multiline) {
          input.style.minHeight = `${Math.max(targetHeight, 4)}px`;
        }
        let computedStyle;
        try {
          computedStyle = ownerWindow.getComputedStyle ? ownerWindow.getComputedStyle(el) : null;
        } catch (styleErr) {
          console.error('Shared.makeEditable computed style error', styleErr);
        }
        input.style.fontSize = computedStyle?.fontSize || '14px';
        input.style.fontFamily = computedStyle?.fontFamily || 'inherit';
        input.style.fontWeight = computedStyle?.fontWeight || '600';
        input.style.lineHeight = computedStyle?.lineHeight || '1.2';
        input.style.border = '1px solid #4a90e2';
        input.style.borderRadius = '4px';
        input.style.boxShadow = '0 0 0 2px rgba(74,144,226,0.35)';
        input.style.padding = '0';
        input.style.background = 'rgba(255,255,255,0.95)';
        input.style.color = '#222';

        overlay.appendChild(input);
        body.appendChild(overlay);

        const measureNode = ownerDocument.createElement('span');
        measureNode.className = 'inline-edit-measure';
        measureNode.style.position = 'absolute';
        measureNode.style.visibility = 'hidden';
        measureNode.style.whiteSpace = multiline ? 'pre-wrap' : 'pre';
        measureNode.style.fontSize = input.style.fontSize;
        measureNode.style.fontFamily = input.style.fontFamily;
        measureNode.style.fontWeight = input.style.fontWeight;
        measureNode.style.lineHeight = input.style.lineHeight;
        measureNode.style.pointerEvents = 'none';
        measureNode.style.left = '-9999px';
        measureNode.style.top = '-9999px';
        measureNode.style.maxWidth = 'none';
        body.appendChild(measureNode);

        const state = {
          overlay,
          input,
          measure: measureNode,
          initialValue,
          centerX: targetCenterX,
          centerY: targetCenterY,
          minWidth: Math.max(4, minWidth || 0),
          minHeight: Math.max(4, minHeight || 0),
        };

        const syncSizeToContent = () => {
          const value = input.value ?? '';
          const displayValue = value.length > 0 ? value : 'M';
          let normalizedValue = displayValue;
          if (!multiline) {
            normalizedValue = normalizedValue
              .replace(/ /g, '\u00a0')
              .replace(/\n/g, '\u00a0');
          }
          measureNode.textContent = normalizedValue;
          let measureRect;
          try {
            measureRect = measureNode.getBoundingClientRect();
          } catch (measureErr) {
            console.error('Shared.makeEditable measurement error', measureErr);
            measureRect = { width: state.minWidth, height: state.minHeight };
          }
          const nextWidth = Math.max(state.minWidth, measureRect?.width || 0);
          const nextHeight = Math.max(state.minHeight, measureRect?.height || 0);
          overlay.style.width = `${nextWidth}px`;
          overlay.style.height = `${nextHeight}px`;
          if (multiline) {
            input.style.minHeight = `${Math.max(nextHeight, state.minHeight)}px`;
          }
          overlay.style.left = `${state.centerX - nextWidth / 2}px`;
          overlay.style.top = `${state.centerY - nextHeight / 2}px`;
        };

        const commit = (nextValue, reason) => {
          const finalValue = nextValue ?? '';
          removeOverlay(state);
          logDebug('makeEditable commit', { finalValue, reason });
          safeCall(applyValue, [el, finalValue], 'Shared.makeEditable applyValue error');
          if (typeof onChange === 'function') {
            safeCall(onChange, [finalValue, el], 'Shared.makeEditable onChange error');
          }
          safeCall(onEditEnd, [el, finalValue], 'Shared.makeEditable onEditEnd error');
        };

        const cancel = (reason) => {
          removeOverlay(state);
          logDebug('makeEditable cancel', { reason });
          safeCall(onEditEnd, [el, initialValue], 'Shared.makeEditable onEditEnd error');
        };

        const handleBlur = () => commit(input.value, 'blur');
        const handleKeyDown = (e) => {
          if (!e) return;
          if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey || e.shiftKey === false)) {
            e.preventDefault();
            commit(input.value, 'enter');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel('escape');
          }
        };

        const stopPropagation = (e) => e.stopPropagation();

        overlay.addEventListener('mousedown', stopPropagation);
        overlay.addEventListener('dblclick', stopPropagation);
        input.addEventListener('blur', handleBlur);
        input.addEventListener('keydown', handleKeyDown);
        input.addEventListener('input', syncSizeToContent);

        syncSizeToContent();

        ownerWindow.setTimeout(() => {
          input.focus();
          if (typeof input.select === 'function') {
            input.select();
          }
          syncSizeToContent();
        }, 0);

        logDebug('makeEditable overlay opened', {
          initialValue,
          rect,
          multiline,
          minWidth,
          minHeight,
        });
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
