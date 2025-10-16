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

  const STYLE_PROPS = [
    { key: 'fontFamily', attr: 'font-family' },
    { key: 'fontWeight', attr: 'font-weight' },
    { key: 'fontStyle', attr: 'font-style' },
    { key: 'fontSize', attr: 'font-size' },
    { key: 'fill', attr: 'fill' },
    { key: 'textDecoration', attr: 'text-decoration' },
    { key: 'baselineShift', attr: 'baseline-shift' },
  ];

  const stylesEqual = (a, b) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    for (let i = 0; i < STYLE_PROPS.length; i += 1) {
      const key = STYLE_PROPS[i].key;
      if ((a[key] || null) !== (b[key] || null)) {
        return false;
      }
    }
    return true;
  };

  const hasStyledCharacters = (styleMap) => {
    if (!Array.isArray(styleMap)) { return false; }
    for (let i = 0; i < styleMap.length; i += 1) {
      const entry = styleMap[i];
      if (!entry) { continue; }
      for (let j = 0; j < STYLE_PROPS.length; j += 1) {
        if (entry[STYLE_PROPS[j].key]) {
          return true;
        }
      }
    }
    return false;
  };

  const buildStyleMapFromElement = (node) => {
    const text = node?.textContent ?? '';
    const length = text.length;
    const styleMap = new Array(length).fill(null);
    const baseStyle = {};
    if (!node || length === 0) {
      return { text, styleMap, baseStyle };
    }
    STYLE_PROPS.forEach(({ key, attr }) => {
      const value = node.getAttribute ? node.getAttribute(attr) : null;
      baseStyle[key] = value || null;
    });
    let cursor = 0;
    const walk = (current, inheritedStyle) => {
      if (!current || cursor >= length) { return; }
      if (current.nodeType === 3) {
        const value = current.textContent || '';
        for (let idx = 0; idx < value.length && cursor < length; idx += 1, cursor += 1) {
          const diff = {};
          STYLE_PROPS.forEach(({ key }) => {
            const inheritedVal = inheritedStyle[key] || null;
            const baseVal = baseStyle[key] || null;
            if (inheritedVal && inheritedVal !== baseVal) {
              diff[key] = inheritedVal;
            }
          });
          styleMap[cursor] = Object.keys(diff).length ? diff : null;
        }
        return;
      }
      if (current.nodeType !== 1) {
        return;
      }
      const nextInherited = { ...inheritedStyle };
      STYLE_PROPS.forEach(({ key, attr }) => {
        const val = current.getAttribute ? current.getAttribute(attr) : null;
        if (val != null && val !== '') {
          nextInherited[key] = val;
        }
      });
      const children = current.childNodes || [];
      for (let i = 0; i < children.length; i += 1) {
        walk(children[i], nextInherited);
      }
    };
    walk(node, { ...baseStyle });
    return { text, styleMap, baseStyle };
  };

  const adjustStyleMapForTextChange = (prevText, nextText, prevStyleMap) => {
    if (!Array.isArray(prevStyleMap)) {
      return new Array(nextText.length).fill(null);
    }
    if (prevText === nextText) {
      return prevStyleMap.slice();
    }
    const prevLength = prevText.length;
    const nextLength = nextText.length;
    let prefix = 0;
    const maxPrefix = Math.min(prevLength, nextLength);
    while (prefix < maxPrefix && prevText[prefix] === nextText[prefix]) {
      prefix += 1;
    }
    let suffix = 0;
    const prevRemain = prevLength - prefix;
    const nextRemain = nextLength - prefix;
    while (
      suffix < prevRemain &&
      suffix < nextRemain &&
      prevText[prevLength - 1 - suffix] === nextText[nextLength - 1 - suffix]
    ) {
      suffix += 1;
    }
    const prefixStyles = prevStyleMap.slice(0, prefix);
    const suffixStyles = suffix > 0 ? prevStyleMap.slice(prevLength - suffix) : [];
    const insertedLength = Math.max(nextLength - prefix - suffix, 0);
    const insertedStyles = new Array(insertedLength).fill(null);
    return prefixStyles.concat(insertedStyles, suffixStyles);
  };

  const applyPreviewStyles = (node, styleEntry = null, baseStyle = {}, fallbackColor = '#222') => {
    if (!node || !node.style) { return; }
    const color = styleEntry?.fill || styleEntry?.color || baseStyle.fill || baseStyle.color || fallbackColor;
    if (color) {
      node.style.color = color;
    } else {
      node.style.removeProperty('color');
    }
    const fontWeight = styleEntry?.fontWeight || baseStyle.fontWeight || '';
    if (fontWeight) { node.style.fontWeight = fontWeight; } else { node.style.removeProperty('font-weight'); }
    const fontStyle = styleEntry?.fontStyle || baseStyle.fontStyle || '';
    if (fontStyle) { node.style.fontStyle = fontStyle; } else { node.style.removeProperty('font-style'); }
    const textDecoration = styleEntry?.textDecoration || baseStyle.textDecoration || '';
    if (textDecoration) { node.style.textDecoration = textDecoration; } else { node.style.removeProperty('text-decoration'); }
    const fontFamily = styleEntry?.fontFamily || baseStyle.fontFamily || '';
    if (fontFamily) { node.style.fontFamily = fontFamily; } else { node.style.removeProperty('font-family'); }
    const fontSize = styleEntry?.fontSize || baseStyle.fontSize || '';
    if (fontSize) { node.style.fontSize = fontSize; } else { node.style.removeProperty('font-size'); }
  };

  const renderStyledPreview = (container, textValue, styleMap, baseStyle = {}) => {
    if (!container) { return; }
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    const doc = container.ownerDocument || global.document;
    if (!textValue) {
      return;
    }
    const fallbackColor = baseStyle.fill || baseStyle.color || '#222';
    const hasStyles = hasStyledCharacters(styleMap);
    if (!hasStyles) {
      const span = doc.createElement('span');
      applyPreviewStyles(span, null, baseStyle, fallbackColor);
      span.textContent = textValue;
      container.appendChild(span);
      return;
    }
    let index = 0;
    while (index < textValue.length) {
      const styleEntry = styleMap[index];
      let end = index + 1;
      while (end < textValue.length && stylesEqual(styleEntry, styleMap[end])) {
        end += 1;
      }
      const segmentText = textValue.slice(index, end);
      if (segmentText.length === 0) {
        index = end;
        continue;
      }
      const span = doc.createElement('span');
      applyPreviewStyles(span, styleEntry || null, baseStyle, fallbackColor);
      span.textContent = segmentText;
      container.appendChild(span);
      index = end;
    }
  };

  const renderStyledText = (targetEl, textValue, styleMap) => {
    if (!targetEl) { return; }
    const doc = targetEl.ownerDocument || global.document;
    if (!textValue) {
      targetEl.textContent = '';
      return;
    }
    const hasStyles = hasStyledCharacters(styleMap);
    if (!hasStyles) {
      targetEl.textContent = textValue;
      return;
    }
    while (targetEl.firstChild) {
      targetEl.removeChild(targetEl.firstChild);
    }
    const ns = targetEl.namespaceURI || 'http://www.w3.org/2000/svg';
    let index = 0;
    while (index < textValue.length) {
      const styleEntry = styleMap[index];
      let end = index + 1;
      while (end < textValue.length && stylesEqual(styleEntry, styleMap[end])) {
        end += 1;
      }
      const segmentText = textValue.slice(index, end);
      if (segmentText.length === 0) {
        index = end;
        continue;
      }
      if (!styleEntry || Object.keys(styleEntry).length === 0) {
        targetEl.appendChild(doc.createTextNode(segmentText));
      } else {
        const tspan = doc.createElementNS(ns, 'tspan');
        tspan.textContent = segmentText;
        STYLE_PROPS.forEach(({ key, attr }) => {
          const val = styleEntry[key];
          if (val) {
            tspan.setAttribute(attr, val);
          } else {
            tspan.removeAttribute(attr);
          }
        });
        targetEl.appendChild(tspan);
      }
      index = end;
    }
  };

  function makeEditable(el, onChange, options = {}) {
    if (!el) {
      logDebug('makeEditable skipped (no element)', { hasElement: false });
      return;
    }

    const {
      getInitialValue = node => node?.textContent ?? '',
      applyValue: applyValueOption,
      onEditStart,
      onEditEnd,
      cursor = 'pointer',
      overlayParent,
      multiline = false,
      minWidth = 0,
      minHeight = 0,
      inputProps = {},
    } = options;

    const applyValueDelegate = typeof applyValueOption === 'function'
      ? applyValueOption
      : (node, value) => { if (node) node.textContent = value; };

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
      if (typeof state.stopDeferredCommitWatcher === 'function') {
        try {
          state.stopDeferredCommitWatcher();
        } catch (cleanupErr) {
          console.error('Shared.makeEditable deferred watcher cleanup error', cleanupErr);
        }
      }
      if (state.overlay) {
        state.overlay.remove();
      }
      if (state.measure) {
        state.measure.remove();
      }
      if (state.preview && state.preview.remove) {
        state.preview.remove();
        state.preview = null;
      }
      if (state.safePointerdownHandler) {
        try {
          ownerDocument.removeEventListener('pointerdown', state.safePointerdownHandler, true);
        } catch (removePointerErr) {
          console.error('Shared.makeEditable safe pointer handler cleanup error', removePointerErr);
        }
        state.safePointerdownHandler = null;
      }
      if (state.safePointerdownResetTimer) {
        try {
          ownerWindow.clearTimeout(state.safePointerdownResetTimer);
        } catch (timerErr) {
          console.error('Shared.makeEditable safe pointer timer cleanup error', timerErr);
        }
        state.safePointerdownResetTimer = null;
      }
      if (state.target && state.restoreVisibility !== undefined) {
        try {
          if (state.restoreVisibility === null) {
            state.target.style.removeProperty('visibility');
          } else {
            state.target.style.visibility = state.restoreVisibility;
          }
        } catch (visibilityErr) {
          console.error('Shared.makeEditable visibility restore error', visibilityErr);
        }
        state.restoreVisibility = undefined;
        state.target = null;
      }
      if (el && el.__inlineEditState === state) {
        try {
          delete el.__inlineEditState;
        } catch (deleteErr) {
          el.__inlineEditState = undefined;
          console.warn('Shared.makeEditable inline state cleanup fallback', deleteErr);
        }
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
        overlay.style.pointerEvents = 'auto';
        overlay.style.background = 'rgba(255,255,255,0.95)';
        overlay.style.borderRadius = '4px';
        overlay.style.overflow = 'hidden';

        const widthPadding = Number.isFinite(options.inlineWidthPadding)
          ? options.inlineWidthPadding
          : 12;
        const overlayWidth = Math.max(rect.width || 0, minWidth) + widthPadding;
        const targetHeight = Math.max(rect.height || 0, minHeight);
        const targetCenterX = rect.left + (rect.width || 0) / 2 + scrollLeft;
        const targetCenterY = rect.top + (rect.height || 0) / 2 + scrollTop;
        overlay.style.width = `${overlayWidth}px`;
        overlay.style.height = `${targetHeight}px`;
        overlay.style.left = `${targetCenterX - overlayWidth / 2}px`;
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
        input.style.fontStyle = computedStyle?.fontStyle || 'normal';
        input.style.textDecoration = computedStyle?.textDecoration || 'none';
        input.style.lineHeight = computedStyle?.lineHeight || '1.2';
        input.style.border = '1px solid #4a90e2';
        input.style.borderRadius = '4px';
        input.style.boxShadow = '0 0 0 2px rgba(74,144,226,0.35)';
        input.style.padding = '0 6px';
        input.style.background = 'transparent';
        input.style.color = 'transparent';
        input.style.textShadow = 'none';
        input.style.caretColor = '#1a73e8';
        input.style.position = 'relative';
        input.style.zIndex = '2';

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
        measureNode.style.fontStyle = input.style.fontStyle;
        measureNode.style.textDecoration = input.style.textDecoration;
        measureNode.style.lineHeight = input.style.lineHeight;
        measureNode.style.pointerEvents = 'none';
        measureNode.style.left = '-9999px';
        measureNode.style.top = '-9999px';
        measureNode.style.maxWidth = 'none';
        body.appendChild(measureNode);

        const styleMeta = buildStyleMapFromElement(el);
        const inlineInitialValue = typeof initialValue === 'string' ? initialValue : (initialValue ?? '');
        const initialStyleMap = adjustStyleMapForTextChange(
          styleMeta.text,
          inlineInitialValue,
          styleMeta.styleMap
        );

        const normalizedInitialStyleMap = Array.isArray(initialStyleMap)
          ? initialStyleMap.slice()
          : new Array(inlineInitialValue.length).fill(null);

        const state = {
          overlay,
          input,
          measure: measureNode,
          initialValue,
          target: el || null,
          centerX: targetCenterX,
          centerY: targetCenterY,
          minWidth: Math.max(4, minWidth || 0),
          minHeight: Math.max(4, minHeight || 0),
          deferCommitHandler: null,
          shouldRestoreSelection: false,
          selection: null,
          stopDeferredCommitWatcher: null,
          inlineText: inlineInitialValue,
          styleMap: normalizedInitialStyleMap.slice(),
          usingInlineSegments: hasStyledCharacters(initialStyleMap),
          baseStyle: { ...(styleMeta.baseStyle || {}) },
          widthPadding,
          preview: null,
          restoreVisibility: undefined,
          initialText: inlineInitialValue,
          initialStyleMap: normalizedInitialStyleMap,
          preventCollapsedSelectionOverwrite: false,
          safePointerdownHandler: null,
          pendingSafeFocus: false,
          lastSafePointerTarget: null,
          safePointerdownResetTimer: null,
        };

        if (el && el.style) {
          state.restoreVisibility = el.style.visibility || null;
          try {
            el.style.visibility = 'hidden';
            logDebug('makeEditable inline target hidden', { tag: el.tagName || null });
          } catch (hideErr) {
            console.error('Shared.makeEditable hide target error', hideErr);
          }
        }

        const preview = ownerDocument.createElement('div');
        preview.className = 'inline-edit-preview';
        preview.style.position = 'absolute';
        preview.style.left = '0';
        preview.style.top = '0';
        preview.style.right = '0';
        preview.style.bottom = '0';
        preview.style.pointerEvents = 'none';
        preview.style.display = 'flex';
        preview.style.alignItems = 'center';
        preview.style.justifyContent = (() => {
          const anchor = el?.getAttribute?.('text-anchor');
          if (anchor === 'end') { return 'flex-end'; }
          if (anchor === 'middle') { return 'center'; }
          if (anchor === 'start') { return 'flex-start'; }
          const textAlign = computedStyle?.textAlign || 'left';
          if (textAlign === 'right') { return 'flex-end'; }
          if (textAlign === 'center') { return 'center'; }
          return 'flex-start';
        })();
        preview.style.fontSize = input.style.fontSize;
        preview.style.fontFamily = input.style.fontFamily;
        preview.style.fontWeight = input.style.fontWeight;
        preview.style.fontStyle = input.style.fontStyle;
        preview.style.lineHeight = input.style.lineHeight;
        preview.style.padding = '0 6px';
        preview.style.whiteSpace = multiline ? 'pre-wrap' : 'pre';
        preview.style.zIndex = '1';
        overlay.appendChild(preview);
        state.preview = preview;
        renderStyledPreview(preview, inlineInitialValue, state.styleMap, state.baseStyle);

        state.usingInlineSegments = hasStyledCharacters(state.styleMap);
        if (!Array.isArray(state.styleMap)) {
          state.styleMap = new Array(inlineInitialValue.length).fill(null);
        } else if (state.styleMap.length !== inlineInitialValue.length) {
          if (state.styleMap.length < inlineInitialValue.length) {
            const deficit = inlineInitialValue.length - state.styleMap.length;
            state.styleMap = state.styleMap.concat(new Array(deficit).fill(null));
          } else {
            state.styleMap.length = inlineInitialValue.length;
          }
        }

        const refreshInlineRendering = (forcePlain = false) => {
          const textValue = state.inlineText ?? '';
          if (forcePlain) {
            state.styleMap = new Array(textValue.length).fill(null);
          }
          state.usingInlineSegments = !forcePlain && hasStyledCharacters(state.styleMap);
          renderStyledText(el, textValue, state.styleMap);
          if (state.preview) {
            renderStyledPreview(state.preview, textValue, state.styleMap, state.baseStyle);
          }
          logDebug('makeEditable inline render refresh', {
            forcePlain,
            length: textValue.length,
            hasStyles: state.usingInlineSegments,
          });
        };

        const describeSelection = () => {
          const length = state.inlineText?.length ?? 0;
          const current = state.selection || {};
          const rawStart = Number.isInteger(current.start) ? current.start : 0;
          const rawEnd = Number.isInteger(current.end) ? current.end : rawStart;
          const start = Math.max(0, Math.min(rawStart, rawEnd, length));
          const end = Math.max(start, Math.min(Math.max(rawStart, rawEnd), length));
          return {
            start,
            end,
            hasSelection: end > start,
            isFullRange: start === 0 && end === length,
            length,
          };
        };

        const applyStylePatchToSelection = (patch = {}) => {
          if (!patch || typeof patch !== 'object') {
            return { handled: false };
          }
          const info = describeSelection();
          if (!info.hasSelection) {
            return { handled: false };
          }
          if (info.isFullRange) {
            return { handled: false, entire: true, range: { start: info.start, end: info.end } };
          }
          const map = Array.isArray(state.styleMap)
            ? state.styleMap.slice()
            : new Array(state.inlineText.length).fill(null);
          const keys = Object.keys(patch);
          for (let idx = info.start; idx < info.end; idx += 1) {
            const currentEntry = map[idx] ? { ...map[idx] } : {};
            keys.forEach(key => {
              const value = patch[key];
              if (value === null || value === '' || typeof value === 'undefined') {
                delete currentEntry[key];
              } else {
                currentEntry[key] = value;
              }
            });
            map[idx] = Object.keys(currentEntry).length ? currentEntry : null;
          }
          state.styleMap = map;
          state.usingInlineSegments = hasStyledCharacters(map);
          refreshInlineRendering(false);
          logDebug('makeEditable inline selection style applied', {
            patchKeys: keys,
            range: { start: info.start, end: info.end },
            hasStyles: state.usingInlineSegments,
          });
          return { handled: true, partial: true, range: { start: info.start, end: info.end } };
        };

        const resetStyleMapToBase = () => {
          const textValue = state.inlineText ?? '';
          state.styleMap = new Array(textValue.length).fill(null);
          refreshInlineRendering(true);
          logDebug('makeEditable inline style reset', { length: textValue.length });
        };

        const updateInlineText = (nextText) => {
          const prevText = state.inlineText ?? '';
          const normalizedNext = nextText ?? '';
          if (prevText === normalizedNext) {
            state.inlineText = normalizedNext;
            return;
          }
          state.styleMap = adjustStyleMapForTextChange(prevText, normalizedNext, state.styleMap);
          state.inlineText = normalizedNext;
          state.usingInlineSegments = hasStyledCharacters(state.styleMap);
          logDebug('makeEditable inline text updated', {
            previousLength: prevText.length,
            nextLength: normalizedNext.length,
            hasStyles: state.usingInlineSegments,
          });
        };

        state.describeSelection = describeSelection;
        state.applyStylePatchToSelection = applyStylePatchToSelection;
        state.resetStyleMapToBase = resetStyleMapToBase;
        state.updateInlineText = updateInlineText;
        state.refreshInlineRendering = refreshInlineRendering;

        if (el) {
          try {
            Object.defineProperty(el, '__inlineEditState', {
              value: state,
              configurable: true,
              writable: true,
            });
          } catch (assignStateErr) {
            el.__inlineEditState = state;
            console.warn('Shared.makeEditable inline state assignment fallback', assignStateErr);
          }
        }

        const isSafeFocusTarget = (node) => {
          if (!node) { return false; }
          if (state.overlay && typeof state.overlay.contains === 'function' && state.overlay.contains(node)) {
            return true;
          }
          if (typeof node.closest === 'function') {
            if (node.closest('.inline-edit-overlay')) { return true; }
            if (node.closest('.font-controls-panel')) { return true; }
            if (node.closest('[data-font-controls-overlay="1"]')) { return true; }
          }
          if (node.dataset && node.dataset.fontControlsOverlay === '1') {
            return true;
          }
          return false;
        };

        const rememberSelection = (opts) => {
          if (!input) { return; }
          const options = (opts && typeof opts === 'object' && !Array.isArray(opts)) ? opts : {};
          try {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            if (!Number.isInteger(start) || !Number.isInteger(end)) {
              return;
            }
            const isCollapsed = start === end;
            if (options.skipCollapsed && isCollapsed) {
              const prev = state.selection;
              if (prev && Number.isInteger(prev.start) && Number.isInteger(prev.end) && prev.end > prev.start) {
                logDebug('makeEditable selection collapse ignored', { start, end, reason: options.reason || 'skip-collapsed' });
                return;
              }
            }
            state.selection = { start, end };
            logDebug('makeEditable selection stored', { start, end, collapsed: isCollapsed });
          } catch (selectionErr) {
            console.error('Shared.makeEditable selection capture error', selectionErr);
          }
        };

        state.stopDeferredCommitWatcher = () => {
          if (!state.deferCommitHandler) { return; }
          ownerDocument.removeEventListener('focusin', state.deferCommitHandler, true);
          ownerDocument.removeEventListener('pointerdown', state.deferCommitHandler, true);
          state.deferCommitHandler = null;
          logDebug('makeEditable deferred commit watcher cleared', { reason: 'cleanup' });
        };
        const stopDeferredCommitWatcher = state.stopDeferredCommitWatcher;

        const startDeferredCommitWatcher = () => {
          if (state.deferCommitHandler) { return; }
          const handler = (evt) => {
            const activeNode = ownerDocument.activeElement;
            const candidate = evt?.target || activeNode;
            if (isSafeFocusTarget(candidate) || isSafeFocusTarget(activeNode)) {
              return;
            }
            stopDeferredCommitWatcher();
            if (!state.input) { return; }
            logDebug('makeEditable deferred commit firing', { eventType: evt?.type || 'focus-change' });
            commit(state.input.value, 'deferred-blur');
          };
          state.deferCommitHandler = handler;
          ownerDocument.addEventListener('focusin', handler, true);
          ownerDocument.addEventListener('pointerdown', handler, true);
          logDebug('makeEditable deferred commit watcher attached', { reason: 'font-controls-focus' });
        };

        const restoreSelectionIfNeeded = () => {
          if (!state.shouldRestoreSelection || !state.selection) {
            state.shouldRestoreSelection = false;
            return;
          }
          if (typeof input.setSelectionRange === 'function') {
            try {
              const start = Number.isInteger(state.selection.start) ? state.selection.start : 0;
              const end = Number.isInteger(state.selection.end) ? state.selection.end : start;
              input.setSelectionRange(start, end);
              logDebug('makeEditable selection restored', { start, end });
            } catch (selectionErr) {
              console.error('Shared.makeEditable selection restore error', selectionErr);
            }
          }
          state.shouldRestoreSelection = false;
          state.pendingSafeFocus = false;
          state.lastSafePointerTarget = null;
        };

        const handleSafePointerDown = (evt) => {
          const target = evt?.target || null;
          if (!target || target === input || (input && input.contains(target))) {
            return;
          }
          if (!isSafeFocusTarget(target)) {
            return;
          }
          state.preventCollapsedSelectionOverwrite = true;
          state.pendingSafeFocus = true;
          state.lastSafePointerTarget = target;
          if (state.safePointerdownResetTimer) {
            try {
              ownerWindow.clearTimeout(state.safePointerdownResetTimer);
            } catch (clearErr) {
              console.error('Shared.makeEditable safe pointer timer clear error', clearErr);
            }
            state.safePointerdownResetTimer = null;
          }
          rememberSelection({ skipCollapsed: true, reason: 'safe-pointerdown' });
          state.shouldRestoreSelection = true;
          startDeferredCommitWatcher();
          ownerWindow.setTimeout(() => {
            state.preventCollapsedSelectionOverwrite = false;
          }, 0);
          state.safePointerdownResetTimer = ownerWindow.setTimeout(() => {
            state.pendingSafeFocus = false;
            state.lastSafePointerTarget = null;
            state.safePointerdownResetTimer = null;
          }, 250);
        };

        try {
          ownerDocument.addEventListener('pointerdown', handleSafePointerDown, true);
          state.safePointerdownHandler = handleSafePointerDown;
        } catch (safePointerErr) {
          console.error('Shared.makeEditable safe pointer handler error', safePointerErr);
        }

        input.addEventListener('select', () => rememberSelection({
          skipCollapsed: state.preventCollapsedSelectionOverwrite === true,
          reason: 'select',
        }));
        input.addEventListener('keyup', () => rememberSelection());
        input.addEventListener('mouseup', () => rememberSelection());
        input.addEventListener('focus', restoreSelectionIfNeeded);

        const fontControlsApi = (Shared && Shared.fontControls) || ownerWindow?.Shared?.fontControls || null;
        if (fontControlsApi && typeof fontControlsApi.openForElement === 'function') {
          const scopeId = el?.dataset?.fontScope || null;
          const key = el?.dataset?.fontKey || null;
          try {
            fontControlsApi.openForElement(el, { scopeId, key });
            logDebug('makeEditable font controls reopened', { scopeId, key });
          } catch (fontErr) {
            console.error('Shared.makeEditable fontControls.openForElement error', fontErr);
          }
        }

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
          const paddedWidth = nextWidth + (state.widthPadding || 0);
          overlay.style.width = `${paddedWidth}px`;
          overlay.style.height = `${nextHeight}px`;
          if (multiline) {
            input.style.minHeight = `${Math.max(nextHeight, state.minHeight)}px`;
          }
          overlay.style.left = `${state.centerX - paddedWidth / 2}px`;
          overlay.style.top = `${state.centerY - nextHeight / 2}px`;
        };

        function commit(nextValue, reason) {
          const finalValue = nextValue ?? '';
          const prevText = state.inlineText ?? '';
          state.updateInlineText(finalValue);
          const hasInlineStyles = hasStyledCharacters(state.styleMap);
          if (hasInlineStyles) {
            state.refreshInlineRendering(false);
          } else {
            safeCall(applyValueDelegate, [el, finalValue], 'Shared.makeEditable applyValue error');
          }
          removeOverlay(state);
          logDebug('makeEditable commit', { finalValue, reason, prevLength: prevText.length });
          if (typeof onChange === 'function') {
            safeCall(onChange, [finalValue, el], 'Shared.makeEditable onChange error');
          }
          safeCall(onEditEnd, [el, finalValue], 'Shared.makeEditable onEditEnd error');
        }

        function cancel(reason) {
          if (state.target) {
            const originalText = typeof state.initialText === 'string' ? state.initialText : (initialValue ?? '');
            const originalMap = Array.isArray(state.initialStyleMap)
              ? state.initialStyleMap.slice()
              : new Array(originalText.length).fill(null);
            renderStyledText(state.target, originalText, originalMap);
            if (state.preview) {
              renderStyledPreview(state.preview, originalText, originalMap, state.baseStyle);
            }
          }
          removeOverlay(state);
          logDebug('makeEditable cancel', { reason });
          safeCall(onEditEnd, [el, initialValue], 'Shared.makeEditable onEditEnd error');
        }

        const handleBlur = (evt) => {
          rememberSelection({ skipCollapsed: true, reason: 'blur' });
          const relatedTarget = evt?.relatedTarget || null;
          ownerWindow.setTimeout(() => {
            if (!state.input) { return; }
            const activeAfterBlur = ownerDocument.activeElement;
            const focusCandidate = relatedTarget || activeAfterBlur || state.lastSafePointerTarget || null;
            const pendingSafe = state.pendingSafeFocus === true;
            const isSafe = isSafeFocusTarget(focusCandidate);
            if (pendingSafe || isSafe) {
              rememberSelection({ skipCollapsed: true, reason: 'safe-blur' });
              state.shouldRestoreSelection = true;
              startDeferredCommitWatcher();
              state.pendingSafeFocus = false;
              state.lastSafePointerTarget = null;
              if (state.safePointerdownResetTimer) {
                try {
                  ownerWindow.clearTimeout(state.safePointerdownResetTimer);
                } catch (clearErr) {
                  console.error('Shared.makeEditable safe pointer timer clear error', clearErr);
                }
                state.safePointerdownResetTimer = null;
              }
              logDebug('makeEditable blur deferred', {
                reason: (() => {
                  if (focusCandidate?.dataset?.fontControlsOverlay === '1') { return 'color-picker'; }
                  if (pendingSafe && !isSafe) { return 'safe-pointerdown'; }
                  return 'font-controls';
                })(),
                tag: focusCandidate?.tagName || null
              });
              return;
            }
            stopDeferredCommitWatcher();
            commit(input.value, 'blur');
          }, 0);
        };
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
        input.addEventListener('input', () => {
          state.updateInlineText(input.value ?? '');
          state.refreshInlineRendering(false);
          syncSizeToContent();
        });

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
