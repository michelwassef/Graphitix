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

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const scaleFontSizeValue = (value, scale) => {
    if (!value) { return value; }
    const numericScale = Number(scale);
    if (!Number.isFinite(numericScale) || numericScale <= 0 || Math.abs(numericScale - 1) < 0.0001) {
      return value;
    }
    const raw = `${value}`.trim();
    if (!raw) { return value; }
    const numeric = Number.parseFloat(raw);
    if (!Number.isFinite(numeric)) { return value; }
    const unitMatch = raw.match(/[a-z%]+$/i);
    const unit = unitMatch ? unitMatch[0] : 'px';
    const scaled = numeric * numericScale;
    return `${scaled}${unit}`;
  };

  const SCRIPT_FONT_SCALE = 0.75;
  const DEFAULT_SCRIPT_FONT_SIZE = `${SCRIPT_FONT_SCALE}em`;

  const deriveScriptFontSize = (sourceSize) => {
    const scaled = scaleFontSizeValue(sourceSize, SCRIPT_FONT_SCALE);
    if (scaled && scaled !== sourceSize) {
      return scaled;
    }
    return DEFAULT_SCRIPT_FONT_SIZE;
  };

  const SUB_BASELINE_SHIFT = 0.35;
  const SUPER_BASELINE_SHIFT = 0.35;

  const parseFontSizeValue = (value) => {
    if (!value) { return null; }
    const trimmed = `${value}`.trim();
    if (!trimmed) { return null; }
    const match = trimmed.match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
    if (!match) { return null; }
    const numeric = Number.parseFloat(match[1]);
    if (!Number.isFinite(numeric)) { return null; }
    const unit = match[2] || '';
    return { numeric, unit };
  };

  const computeFontScale = (childSize, baseSize) => {
    const child = parseFontSizeValue(childSize);
    const base = parseFontSizeValue(baseSize);
    if (!child || !base) { return null; }
    if (child.unit !== base.unit) { return null; }
    if (Math.abs(base.numeric) < 0.0001) { return null; }
    return child.numeric / base.numeric;
  };

  const formatEm = (value) => {
    if (!Number.isFinite(value)) { return '0em'; }
    const rounded = Math.round(value * 1000) / 1000;
    return `${rounded}em`;
  };

  const scaleLineHeightValue = (value, scale) => {
    if (!value) { return value; }
    const numericScale = Number(scale);
    if (!Number.isFinite(numericScale) || numericScale <= 0 || Math.abs(numericScale - 1) < 0.0001) {
      return value;
    }
    const raw = `${value}`.trim();
    if (!raw || raw === 'normal') { return value; }
    const numeric = Number.parseFloat(raw);
    if (!Number.isFinite(numeric)) { return value; }
    const unitMatch = raw.match(/[a-z%]+$/i);
    if (!unitMatch) { return value; }
    const scaled = numeric * numericScale;
    return `${scaled}${unitMatch[0]}`;
  };

  const computeSvgDisplayScale = (node, rect) => {
    if (!node || node.namespaceURI !== SVG_NS) { return 1; }
    const candidates = [];
    let hasCtm = false;
    try {
      if (typeof node.getScreenCTM === 'function') {
        const ctm = node.getScreenCTM();
        if (ctm) {
          const scaleX = Math.sqrt((ctm.a || 0) ** 2 + (ctm.b || 0) ** 2);
          const scaleY = Math.sqrt((ctm.c || 0) ** 2 + (ctm.d || 0) ** 2);
          if (Number.isFinite(scaleX) && scaleX > 0) { candidates.push(scaleX); }
          if (Number.isFinite(scaleY) && scaleY > 0) { candidates.push(scaleY); }
          hasCtm = true;
        }
      }
    } catch (ctmErr) {
      console.error('Shared.makeEditable screen CTM error', ctmErr);
    }
    if (candidates.length === 0 && rect) {
      try {
        if (typeof node.getBBox === 'function') {
          const bbox = node.getBBox();
          if (bbox) {
            if (Number.isFinite(rect.width) && Number.isFinite(bbox.width) && bbox.width > 0) {
              candidates.push(rect.width / bbox.width);
            }
            if (Number.isFinite(rect.height) && Number.isFinite(bbox.height) && bbox.height > 0) {
              candidates.push(rect.height / bbox.height);
            }
          }
        }
      } catch (bboxErr) {
        console.error('Shared.makeEditable bbox scale error', bboxErr);
      }
    }
    const valid = candidates.filter(val => Number.isFinite(val) && val > 0);
    if (!valid.length) { return 1; }
    const sum = valid.reduce((acc, val) => acc + val, 0);
    const scale = sum / valid.length;
    logDebug('makeEditable svg scale derived', { scale, hasCtm, candidates: valid });
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
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

  const applyPreviewStyles = (node, styleEntry = null, baseStyle = {}, fallbackColor = '#222', scale = 1) => {
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
    const baseFontSize = baseStyle.fontSize || '';
    const entryFontSize = styleEntry?.fontSize || '';
    const baselineShift = styleEntry?.baselineShift || baseStyle.baselineShift || '';
    const isScript = baselineShift === 'sub' || baselineShift === 'super';
    let rawFontSize = entryFontSize || baseFontSize || '';
    let scriptScaleFactor = 1;
    if (isScript) {
      const normalizedEntrySize = entryFontSize && entryFontSize.trim();
      const normalizedBaseSize = baseFontSize && baseFontSize.trim();
      if (normalizedEntrySize && normalizedBaseSize) {
        const derivedScale = computeFontScale(normalizedEntrySize, normalizedBaseSize);
        if (Number.isFinite(derivedScale) && derivedScale > 0) {
          scriptScaleFactor = derivedScale;
        } else {
          scriptScaleFactor = SCRIPT_FONT_SCALE;
        }
      } else if (normalizedEntrySize) {
        scriptScaleFactor = SCRIPT_FONT_SCALE;
      } else if (normalizedBaseSize) {
        scriptScaleFactor = SCRIPT_FONT_SCALE;
        rawFontSize = deriveScriptFontSize(baseFontSize);
      } else {
        scriptScaleFactor = SCRIPT_FONT_SCALE;
        rawFontSize = DEFAULT_SCRIPT_FONT_SIZE;
      }
    }
    const fontSize = rawFontSize
      ? (scaleFontSizeValue(rawFontSize, scale) || rawFontSize)
      : '';
    if (fontSize) { node.style.fontSize = fontSize; } else { node.style.removeProperty('font-size'); }
    if (baselineShift === 'sub') {
      node.style.position = 'relative';
      const shift = SUB_BASELINE_SHIFT / (scriptScaleFactor || 1);
      node.style.top = formatEm(shift);
      node.style.verticalAlign = 'sub';
    } else if (baselineShift === 'super') {
      node.style.position = 'relative';
      const shift = SUPER_BASELINE_SHIFT / (scriptScaleFactor || 1);
      node.style.top = formatEm(-shift);
      node.style.verticalAlign = 'super';
    } else {
      node.style.removeProperty('position');
      node.style.removeProperty('top');
      node.style.removeProperty('vertical-align');
    }
  };

  const renderStyledPreview = (container, textValue, styleMap, baseStyle = {}, options = {}) => {
    if (!container) { return; }
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    const doc = container.ownerDocument || global.document;
    const scale = Number.isFinite(options?.scale) && options.scale > 0 ? options.scale : 1;
    if (!textValue) {
      return;
    }
    const fallbackColor = baseStyle.fill || baseStyle.color || '#222';
    const hasStyles = hasStyledCharacters(styleMap);
    if (!hasStyles) {
      const span = doc.createElement('span');
      applyPreviewStyles(span, null, baseStyle, fallbackColor, scale);
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
      applyPreviewStyles(span, styleEntry || null, baseStyle, fallbackColor, scale);
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

  const syncBaseStyleAttributes = (targetEl, baseStyle) => {
    if (!targetEl || typeof targetEl.setAttribute !== 'function') { return; }
    const source = (baseStyle && typeof baseStyle === 'object') ? baseStyle : null;
    const activeKeys = [];
    for (let i = 0; i < STYLE_PROPS.length; i += 1) {
      const prop = STYLE_PROPS[i];
      const raw = source ? source[prop.key] : null;
      const value = raw !== undefined && raw !== null && raw !== '' ? raw : null;
      if (value === null) {
        try {
          targetEl.removeAttribute(prop.attr);
        } catch (attrErr) {
          console.error('Shared.makeEditable base style remove error', attrErr);
        }
      } else {
        try {
          targetEl.setAttribute(prop.attr, value);
          activeKeys.push(prop.key);
        } catch (attrErr) {
          console.error('Shared.makeEditable base style apply error', attrErr);
        }
      }
    }
    logDebug('makeEditable base style synced', {
      hasBase: !!source,
      keys: activeKeys
    });
  };

  const applyTextBaseline = (el, baseline, /* optional */ fontSize) => {
    if (!el || typeof el.setAttribute !== 'function') { return; }
    try {
      // Remove fragile dominant-baseline usage for editors that mishandle it.
      // For the historical 'hanging' intent, approximate with a small dy shift.
      el.removeAttribute('dominant-baseline');
      el.removeAttribute('dy');
      if (baseline === 'hanging') {
        // Use 0.35em which aligns well with existing label offsets used elsewhere.
        el.setAttribute('dy', '0.35em');
      } else if (baseline) {
        // Preserve other baselines by setting the attribute as-is.
        el.setAttribute('dominant-baseline', baseline);
      }
    } catch (err) {
      console.error('Shared.applyTextBaseline error', err);
    }
  };

  const computeAxisLabelYOffset = (fontSizeValue, tickLen = 0, tickGap = 0) => {
    try {
      const parsed = parseFontSizeValue(fontSizeValue);
      let px = 12;
      if (parsed && Number.isFinite(parsed.numeric)) {
        if (!parsed.unit || parsed.unit === 'px') {
          px = parsed.numeric;
        } else if (parsed.unit === 'em') {
          px = parsed.numeric * 16; // assume 1em ~= 16px
        } else if (parsed.unit === 'rem') {
          px = parsed.numeric * 16;
        } else {
          px = parsed.numeric; // best-effort
        }
      }
      // Base extra spacing proportional to font size; clamp to sensible min/max
      const extra = Math.round(Math.max(2, Math.min(24, px * 0.35)));
      return extra;
    } catch (err) {
      console.error('Shared.computeAxisLabelYOffset error', err);
      return 4;
    }
  };

  // expose helpers
  Shared.applyTextBaseline = applyTextBaseline;
  Shared.computeAxisLabelYOffset = computeAxisLabelYOffset;

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

        const displayScale = computeSvgDisplayScale(el, rect);
        logDebug('makeEditable font overlay scale', {
          scale: displayScale,
          isSvg: el?.namespaceURI === SVG_NS,
        });

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
        const rawFontSize = computedStyle?.fontSize || '14px';
        const overlayFontSize = scaleFontSizeValue(rawFontSize, displayScale) || rawFontSize || '14px';
        const rawLineHeight = computedStyle?.lineHeight || '1.2';
        const overlayLineHeight = scaleLineHeightValue(rawLineHeight, displayScale) || rawLineHeight || '1.2';
        input.style.fontSize = overlayFontSize;
        input.style.fontFamily = computedStyle?.fontFamily || 'inherit';
        input.style.fontWeight = computedStyle?.fontWeight || '600';
        input.style.fontStyle = computedStyle?.fontStyle || 'normal';
        input.style.textDecoration = computedStyle?.textDecoration || 'none';
        input.style.lineHeight = overlayLineHeight;
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
        measureNode.style.fontSize = overlayFontSize;
        measureNode.style.fontFamily = input.style.fontFamily;
        measureNode.style.fontWeight = input.style.fontWeight;
        measureNode.style.fontStyle = input.style.fontStyle;
        measureNode.style.textDecoration = input.style.textDecoration;
        measureNode.style.lineHeight = overlayLineHeight;
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
          displayScale,
          overlayFontSize,
          overlayLineHeight,
        };

        const resolveFontControlsApi = () => {
          const sharedApi = Shared && Shared.fontControls;
          if (sharedApi && typeof sharedApi.captureInlineState === 'function') { return sharedApi; }
          const scopedApi = ownerWindow?.Shared?.fontControls;
          if (scopedApi && typeof scopedApi.captureInlineState === 'function') { return scopedApi; }
          return null;
        };

        const notifyFontControlsInlineChange = (reason, detail = {}) => {
          const api = resolveFontControlsApi();
          if (!api || typeof api.captureInlineState !== 'function') { return; }
          try {
            api.captureInlineState(el, state, { reason, ...detail });
            logDebug('makeEditable fontControls notified', {
              reason,
              hasInlineSegments: !!state.usingInlineSegments,
              range: detail.range || null
            });
          } catch (fontErr) {
            console.error('Shared.makeEditable fontControls.captureInlineState error', fontErr);
          }
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
        preview.style.fontSize = overlayFontSize;
        preview.style.fontFamily = input.style.fontFamily;
        preview.style.fontWeight = input.style.fontWeight;
        preview.style.fontStyle = input.style.fontStyle;
        preview.style.lineHeight = overlayLineHeight;
        preview.style.padding = '0 6px';
        preview.style.whiteSpace = multiline ? 'pre-wrap' : 'pre';
        preview.style.zIndex = '1';
        overlay.appendChild(preview);
        state.preview = preview;
        renderStyledPreview(preview, inlineInitialValue, state.styleMap, state.baseStyle, { scale: displayScale });

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
          syncBaseStyleAttributes(el, state.baseStyle);
          if (state.preview) {
            renderStyledPreview(state.preview, textValue, state.styleMap, state.baseStyle, { scale: state.displayScale });
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
          const keys = Object.keys(patch);
          if (keys.length === 0) {
            return { handled: false, entire: info.isFullRange, range: { start: info.start, end: info.end } };
          }
          const map = Array.isArray(state.styleMap)
            ? state.styleMap.slice()
            : new Array(state.inlineText.length).fill(null);
          let changed = false;
          for (let idx = info.start; idx < info.end; idx += 1) {
            const existing = map[idx];
            const currentEntry = existing ? { ...existing } : {};
            keys.forEach(key => {
              const value = patch[key];
              if (value === null || value === '' || typeof value === 'undefined') {
                if (Object.prototype.hasOwnProperty.call(currentEntry, key)) {
                  delete currentEntry[key];
                  changed = true;
                }
              } else if (currentEntry[key] !== value) {
                currentEntry[key] = value;
                changed = true;
              }
            });
            const nextKeys = Object.keys(currentEntry);
            const nextEntry = nextKeys.length ? currentEntry : null;
            if (nextEntry === null && existing) {
              changed = true;
            } else if (nextEntry && !existing) {
              changed = true;
            } else if (nextEntry && existing) {
              const existingKeys = Object.keys(existing);
              if (existingKeys.length !== nextKeys.length) {
                changed = true;
              } else {
                for (let i = 0; i < existingKeys.length; i += 1) {
                  const key = existingKeys[i];
                  if (existing[key] !== nextEntry[key]) {
                    changed = true;
                    break;
                  }
                }
              }
            }
            map[idx] = nextEntry;
          }
          if (!changed) {
            return { handled: false, entire: info.isFullRange, range: { start: info.start, end: info.end } };
          }
          state.styleMap = map;
          state.usingInlineSegments = hasStyledCharacters(map);
          if (info.isFullRange && state.baseStyle && typeof state.baseStyle === 'object') {
            keys.forEach(key => {
              const value = patch[key];
              if (value === null || value === '' || typeof value === 'undefined') {
                state.baseStyle[key] = null;
              } else {
                state.baseStyle[key] = value;
              }
            });
          }
          refreshInlineRendering(false);
          notifyFontControlsInlineChange('inline-style-patch', {
            patchKeys: keys.slice(),
            range: { start: info.start, end: info.end },
            entire: info.isFullRange
          });
          logDebug('makeEditable inline selection style applied', {
            patchKeys: keys,
            range: { start: info.start, end: info.end },
            hasStyles: state.usingInlineSegments,
            fullRange: info.isFullRange,
          });
          return {
            handled: true,
            partial: !info.isFullRange,
            entire: info.isFullRange,
            range: { start: info.start, end: info.end },
          };
        };

        const resetStyleMapToBase = () => {
          const textValue = state.inlineText ?? '';
          state.styleMap = new Array(textValue.length).fill(null);
          refreshInlineRendering(true);
          notifyFontControlsInlineChange('inline-style-reset', {
            range: { start: 0, end: textValue.length },
            entire: true
          });
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
          notifyFontControlsInlineChange('inline-text-change', {
            range: { start: 0, end: normalizedNext.length },
            entire: true,
            previousLength: prevText.length,
            nextLength: normalizedNext.length,
          });
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

        const scheduleSelectionRestore = (start, end) => {
          if (!input || typeof input.setSelectionRange !== 'function') { return; }
          const safeStart = Number.isInteger(start) ? start : 0;
          const safeEnd = Number.isInteger(end) ? end : safeStart;
          ownerWindow.setTimeout(() => {
            if (!state.input || typeof input.setSelectionRange !== 'function') { return; }
            try {
              input.setSelectionRange(safeStart, safeEnd);
              logDebug('makeEditable inline shortcut selection restored', { start: safeStart, end: safeEnd });
            } catch (selectionErr) {
              console.error('Shared.makeEditable inline shortcut selection restore error', selectionErr);
            }
          }, 0);
        };

        const summarizeSelectionForProp = (propKey, matchFn) => {
          if (typeof matchFn !== 'function') { return null; }
          if (!state || typeof state.describeSelection !== 'function') { return null; }
          const info = state.describeSelection();
          if (!info || !info.hasSelection) { return null; }
          const map = Array.isArray(state.styleMap) ? state.styleMap : [];
          const baseValue = state.baseStyle ? state.baseStyle[propKey] : null;
          let allActive = true;
          for (let idx = info.start; idx < info.end; idx += 1) {
            const entry = map[idx] || null;
            let value = baseValue;
            if (entry && Object.prototype.hasOwnProperty.call(entry, propKey)) {
              value = entry[propKey];
            }
            if (!matchFn(value)) {
              allActive = false;
            }
          }
          return { info, allActive };
        };

        const matchBold = (value) => {
          if (value == null) { return false; }
          const raw = String(value).toLowerCase();
          if (!raw) { return false; }
          if (raw.includes('bold')) { return true; }
          const trimmed = raw.trim();
          return trimmed === '700' || trimmed === '800' || trimmed === '900';
        };

        const matchItalic = (value) => {
          if (value == null) { return false; }
          const raw = String(value).toLowerCase();
          return raw.includes('italic');
        };

        const matchUnderline = (value) => {
          if (value == null) { return false; }
          const raw = String(value).toLowerCase();
          return raw.includes('underline');
        };

        const inlineShortcutConfigs = {
          b: { propKey: 'fontWeight', value: 'bold', match: matchBold },
          i: { propKey: 'fontStyle', value: 'italic', match: matchItalic },
          u: { propKey: 'textDecoration', value: 'underline', match: matchUnderline },
        };

        const applyInlineShortcutToggle = (shortcutKey) => {
          const config = inlineShortcutConfigs[shortcutKey];
          if (!config) { return false; }
          if (!state || typeof state.applyStylePatchToSelection !== 'function') { return false; }
          const summary = summarizeSelectionForProp(config.propKey, config.match);
          if (!summary) { return false; }
          const shouldActivate = !summary.allActive;
          const patchValue = shouldActivate ? config.value : null;
          const patch = { [config.propKey]: patchValue };
          const result = state.applyStylePatchToSelection(patch);
          let handled = !!(result && result.handled);
          if (handled && result.entire && state.baseStyle) {
            state.baseStyle[config.propKey] = patchValue;
          } else if (!handled && result && result.entire && state.baseStyle) {
            const baseActive = config.match(state.baseStyle[config.propKey]);
            const needsUpdate = shouldActivate ? !baseActive : baseActive;
            if (needsUpdate) {
              state.baseStyle[config.propKey] = patchValue;
              handled = true;
            }
          }
          if (!handled) { return false; }
          if (!result || !result.handled) {
            state.refreshInlineRendering(false);
          }
          state.selection = { start: summary.info.start, end: summary.info.end };
          state.shouldRestoreSelection = true;
          rememberSelection({ reason: 'shortcut-applied' });
          scheduleSelectionRestore(summary.info.start, summary.info.end);
          logDebug('makeEditable inline shortcut applied', {
            shortcut: shortcutKey,
            activate: shouldActivate,
            entire: !!(result && result.entire),
          });
          return true;
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
            syncBaseStyleAttributes(el, state.baseStyle);
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
              renderStyledPreview(state.preview, originalText, originalMap, state.baseStyle, { scale: state.displayScale });
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
          if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
            if (inlineShortcutConfigs[key]) {
              rememberSelection({ reason: 'shortcut-keydown' });
              if (applyInlineShortcutToggle(key)) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
            }
          }
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

  /**
   * Enable drag functionality for SVG text elements (titles, axis labels).
   * Allows users to reposition labels by dragging them within the SVG.
   * @param {SVGElement} el - The SVG element to make draggable
   * @param {SVGSVGElement} svg - The parent SVG element for coordinate transforms
   * @param {Object} options - Configuration options
   * @param {Function} options.onDragEnd - Callback when drag ends with {x, y} position
   * @param {Function} options.onDragStart - Callback when drag starts
   * @param {string} options.cursor - Cursor style during drag (default: 'move')
   */
  function enableLabelDrag(el, svg, options = {}) {
    if (!el || !svg) {
      logDebug('enableLabelDrag skipped', { hasElement: !!el, hasSvg: !!svg });
      return;
    }
    const { onDragEnd, onDragStart, cursor = 'move', syncChildX = false } = options;
    let dragging = false;
    let startPoint = { x: 0, y: 0 };
    let origPos = { x: 0, y: 0 };
    const CAPTURE_ATTR = 'dragXOffset';

    el.style.cursor = cursor;

    const datasetKey = `data-${CAPTURE_ATTR.replace(/([A-Z])/g,'-$1').toLowerCase()}`;
    const getChildOffset = (child) => {
      if(!child){ return NaN; }
      const raw = child.dataset ? child.dataset[CAPTURE_ATTR] : child.getAttribute(datasetKey);
      return Number(raw);
    };
    const setChildOffset = (child, offset) => {
      if(!child){ return; }
      if(child.dataset){
        child.dataset[CAPTURE_ATTR] = String(offset);
      }else{
        child.setAttribute(datasetKey, String(offset));
      }
    };

    const applyChildAnchors = (baseX) => {
      if(!syncChildX){
        return;
      }
      try{
        Array.from(el.children || []).forEach(child => {
          const offset = getChildOffset(child);
          if(Number.isFinite(offset)){
            child.setAttribute('x', String(baseX + offset));
          }
        });
      }catch(err){
        logDebug('enableLabelDrag applyChildAnchors error', { message: err?.message });
      }
    };

    const captureChildAnchors = () => {
      if(!syncChildX){
        return;
      }
      Array.from(el.children || []).forEach(child => {
        if(!child || typeof child.getAttribute !== 'function'){
          return;
        }
        const childX = parseFloat(child.getAttribute('x'));
        const offset = Number.isFinite(childX) ? childX - origPos.x : 0;
        setChildOffset(child, offset);
      });
    };

    const getTransformedPoint = (clientX, clientY) => {
      try {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const ctm = svg.getScreenCTM();
        if (ctm) {
          return pt.matrixTransform(ctm.inverse());
        }
      } catch (err) {
        logDebug('enableLabelDrag transform error', { error: err?.message });
      }
      // Fallback: log warning and return screen coords (may be less accurate)
      logDebug('enableLabelDrag using screen coords fallback', { clientX, clientY });
      return { x: clientX, y: clientY };
    };

    const handleMouseDown = (e) => {
      // Don't start drag if user is editing text
      if (el.dataset.editing === 'true') return;
      dragging = true;
      const loc = getTransformedPoint(e.clientX, e.clientY);
      startPoint = { x: loc.x, y: loc.y };
      origPos = {
        x: parseFloat(el.getAttribute('x') || '0'),
        y: parseFloat(el.getAttribute('y') || '0')
      };
      captureChildAnchors();
      e.preventDefault();
      e.stopPropagation();
      if (typeof onDragStart === 'function') {
        safeCall(onDragStart, [{ x: origPos.x, y: origPos.y, element: el }], 'enableLabelDrag onDragStart error');
      }
      logDebug('enableLabelDrag start', { origPos, startPoint });
    };

    const handleMouseMove = (e) => {
      if (!dragging) return;
      const loc = getTransformedPoint(e.clientX, e.clientY);
      const newX = origPos.x + (loc.x - startPoint.x);
      const newY = origPos.y + (loc.y - startPoint.y);
      el.setAttribute('x', String(newX));
      el.setAttribute('y', String(newY));
      applyChildAnchors(newX);
      // Update transform for rotated elements (like y-axis labels)
      const transform = el.getAttribute('transform');
      if (transform && transform.includes('rotate')) {
        // More robust regex to handle whitespace variations in rotate transform
        const rotateMatch = transform.match(/rotate\s*\(\s*(-?\d+\.?\d*)\s*/);
        if (rotateMatch) {
          const angle = rotateMatch[1];
          el.setAttribute('transform', `rotate(${angle} ${newX} ${newY})`);
        }
      }
    };

    const handleMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      const finalX = parseFloat(el.getAttribute('x') || '0');
      const finalY = parseFloat(el.getAttribute('y') || '0');
      // Record undo/redo entry for label movement
      try {
        const undoApi = Shared && Shared.undoManager;
        const before = { x: origPos.x, y: origPos.y, transform: el.getAttribute('transform') };
        const after = { x: finalX, y: finalY, transform: el.getAttribute('transform') };
        const equals = (a, b) => a && b && a.x === b.x && a.y === b.y && String(a.transform || '') === String(b.transform || '');
        const apply = (pos, reason) => {
          if (!pos) return false;
          try {
            el.setAttribute('x', String(pos.x));
            el.setAttribute('y', String(pos.y));
            applyChildAnchors(pos.x);
            const currentTransform = el.getAttribute('transform');
            if (currentTransform && currentTransform.includes('rotate')) {
              const rotateMatch = currentTransform.match(/rotate\s*\(\s*(-?\d+\.?\d*)\s*/);
              if (rotateMatch) {
                const angle = rotateMatch[1];
                el.setAttribute('transform', `rotate(${angle} ${pos.x} ${pos.y})`);
              }
            }
            logDebug('enableLabelDrag apply position', { reason, x: pos.x, y: pos.y });
            return true;
          } catch (applyErr) {
            console.error('Shared.enableLabelDrag apply position error', applyErr);
            return false;
          }
        };
        if (undoApi && typeof undoApi.recordStateChange === 'function' && !equals(before, after)) {
          undoApi.recordStateChange({
            element: el,
            label: `move:${el.tagName.toLowerCase()}#${el.id || el.textContent || 'label'}`,
            from: before,
            to: after,
            equals,
            apply
          });
        }
      } catch (err) {
        console.error('Shared.enableLabelDrag undo record error', err);
      }
      if (typeof onDragEnd === 'function') {
        safeCall(onDragEnd, [{ x: finalX, y: finalY, element: el }], 'enableLabelDrag onDragEnd error');
      }
      logDebug('enableLabelDrag end', { x: finalX, y: finalY });
    };

    el.addEventListener('mousedown', handleMouseDown);
    global.addEventListener('mousemove', handleMouseMove);
    global.addEventListener('mouseup', handleMouseUp);

    logDebug('enableLabelDrag bound', { element: el.tagName || 'unknown' });
  }

  function enableLegendDrag(group, svg, options = {}) {
    if (!group || !svg) {
      logDebug('enableLegendDrag skipped', { hasGroup: !!group, hasSvg: !!svg });
      return;
    }
    const dragThreshold = Math.max(2, Number(options.dragThreshold) || 4);
    const dragThresholdSq = dragThreshold * dragThreshold;
    const cursor = options.cursor || 'move';
    if (group.style) {
      group.style.cursor = cursor;
    }

    const normalizePoint = point => ({
      x: Number.isFinite(point?.x) ? point.x : 0,
      y: Number.isFinite(point?.y) ? point.y : 0
    });

    const parseTranslate = () => {
      const raw = group.getAttribute('transform') || '';
      const match = raw.match(/translate\s*\(\s*([-+]?\d*\.?\d+)(?:[\s,]+([-+]?\d*\.?\d+))?/i);
      if (!match) {
        return { x: 0, y: 0 };
      }
      const x = Number.parseFloat(match[1]);
      const y = match[2] != null ? Number.parseFloat(match[2]) : x;
      return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0
      };
    };

    const writeTranslate = pos => {
      const next = normalizePoint(pos);
      group.setAttribute('transform', `translate(${next.x},${next.y})`);
      return next;
    };

    const pointerToSvg = (clientX, clientY) => {
      try {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const ctm = svg.getScreenCTM();
        return ctm ? pt.matrixTransform(ctm.inverse()) : { x: clientX, y: clientY };
      } catch (err) {
        logDebug('enableLegendDrag transform error', { message: err?.message });
        return { x: clientX, y: clientY };
      }
    };

    const getPosition = typeof options.getPosition === 'function'
      ? options.getPosition
      : () => parseTranslate();
    const setPosition = typeof options.setPosition === 'function'
      ? options.setPosition
      : value => writeTranslate(value);

    let pointerDown = false;
    let dragging = false;
    let startPoint = { x: 0, y: 0 };
    let originPos = { x: 0, y: 0 };
    let currentPos = { x: 0, y: 0 };

    const undoApi = Shared && Shared.undoManager;
    const equals = (a, b) => a && b && a.x === b.x && a.y === b.y;
    const applyUndoPosition = (pos, reason) => {
      if (!pos) {
        return false;
      }
      try {
        setPosition(pos);
        if (typeof options.onPositionChange === 'function') {
          options.onPositionChange(pos);
        }
        logDebug('enableLegendDrag apply position', { reason, x: pos.x, y: pos.y });
        return true;
      } catch (err) {
        console.error('enableLegendDrag apply position error', err);
        return false;
      }
    };

    const recordUndo = (before, after) => {
      if (!undoApi || typeof undoApi.recordStateChange !== 'function') {
        return;
      }
      if (equals(before, after)) {
        return;
      }
      try {
        undoApi.recordStateChange({
          element: group,
          label: options.undoLabel || 'legend-position',
          from: before,
          to: after,
          equals,
          apply: value => applyUndoPosition(value, 'undo')
        });
      } catch (err) {
        console.error('enableLegendDrag undo record error', err);
      }
    };

    const handleMouseDown = event => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      pointerDown = true;
      dragging = false;
      startPoint = pointerToSvg(event.clientX, event.clientY);
      originPos = normalizePoint(getPosition());
      currentPos = originPos;
      global.addEventListener('mousemove', handleMouseMove, true);
      global.addEventListener('mouseup', handleMouseUp, true);
    };

    const handleMouseMove = event => {
      if (!pointerDown) {
        return;
      }
      const loc = pointerToSvg(event.clientX, event.clientY);
      const dx = loc.x - startPoint.x;
      const dy = loc.y - startPoint.y;
      if (!dragging) {
        const distSq = dx * dx + dy * dy;
        if (distSq < dragThresholdSq) {
          return;
        }
        dragging = true;
        event.preventDefault();
        event.stopPropagation();
        if (typeof options.onDragStart === 'function') {
          safeCall(options.onDragStart, [{ x: originPos.x, y: originPos.y, element: group }], 'enableLegendDrag onDragStart error');
        }
        logDebug('enableLegendDrag start', { originPos, dragThreshold });
      } else {
        event.preventDefault();
        event.stopPropagation();
      }
      const nextPos = { x: originPos.x + dx, y: originPos.y + dy };
      currentPos = normalizePoint(setPosition(nextPos)) || normalizePoint(nextPos);
      if (typeof options.onPositionChange === 'function') {
        safeCall(options.onPositionChange, [currentPos], 'enableLegendDrag onPositionChange error');
      }
    };

    const handleMouseUp = event => {
      if (!pointerDown) {
        return;
      }
      global.removeEventListener('mousemove', handleMouseMove, true);
      global.removeEventListener('mouseup', handleMouseUp, true);
      const wasDragging = dragging;
      pointerDown = false;
      dragging = false;
      if (!wasDragging) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const finalPos = normalizePoint(currentPos || getPosition());
      recordUndo(originPos, finalPos);
      if (typeof options.onDragEnd === 'function') {
        safeCall(options.onDragEnd, [{ x: finalPos.x, y: finalPos.y, element: group }], 'enableLegendDrag onDragEnd error');
      }
      logDebug('enableLegendDrag end', { x: finalPos.x, y: finalPos.y });
    };

    group.addEventListener('mousedown', handleMouseDown);
    logDebug('enableLegendDrag bound', { element: group.tagName || 'g' });
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
  Shared.enableLabelDrag = enableLabelDrag;
  Shared.enableLegendDrag = enableLegendDrag;
  Shared.autoResizeSvg = autoResizeSvg;
  Shared.ensureGraphViewport = ensureGraphViewport;
  Shared.graphViewport = Shared.graphViewport || {};
  Shared.graphViewport.ensure = ensureGraphViewport;
  Shared.graphViewport.createEnsurer = createGraphViewportEnsurer;
  Shared.serializeCleanSVG = serializeCleanSVG;

  if (typeof global.makeEditable !== 'function') {
    global.makeEditable = makeEditable;
  }
  if (typeof global.enableLabelDrag !== 'function') {
    global.enableLabelDrag = enableLabelDrag;
  }
  if (typeof global.enableLegendDrag !== 'function') {
    global.enableLegendDrag = enableLegendDrag;
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
    hasEnableLabelDrag: typeof Shared.enableLabelDrag === 'function',
    hasEnableLegendDrag: typeof Shared.enableLegendDrag === 'function',
    hasAutoResizeSvg: typeof Shared.autoResizeSvg === 'function',
    hasSerializeCleanSVG: typeof Shared.serializeCleanSVG === 'function'
  });
})(typeof window !== 'undefined' ? window : globalThis);
