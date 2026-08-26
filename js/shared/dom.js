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

  const VIEWBOX_DATASET_KEYS = {
    minX: 'graphViewportStableMinX',
    minY: 'graphViewportStableMinY',
    width: 'graphViewportStableWidth',
    height: 'graphViewportStableHeight',
    renderedWidth: 'graphViewportStableRenderedWidth',
    renderedHeight: 'graphViewportStableRenderedHeight'
  };

  const parseFiniteNumber = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
  };

  const normalizeViewBox = candidate => {
    if(!candidate || typeof candidate !== 'object'){
      return null;
    }
    const minX = parseFiniteNumber(candidate.minX ?? candidate.x);
    const minY = parseFiniteNumber(candidate.minY ?? candidate.y);
    const width = parseFiniteNumber(candidate.viewW ?? candidate.width);
    const height = parseFiniteNumber(candidate.viewH ?? candidate.height);
    if(!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0){
      return null;
    }
    return { minX, minY, viewW: width, viewH: height };
  };

  const parseViewBoxAttribute = value => {
    if(typeof value !== 'string' || !value.trim()){
      return null;
    }
    const parts = value.trim().split(/[\s,]+/).map(Number);
    if(parts.length < 4){
      return null;
    }
    return normalizeViewBox({
      minX: parts[0],
      minY: parts[1],
      width: parts[2],
      height: parts[3]
    });
  };

  const readSvgViewBox = svg => {
    if(!svg){
      return null;
    }
    try{
      const base = svg.viewBox?.baseVal;
      const fromBase = normalizeViewBox(base);
      if(fromBase){
        return fromBase;
      }
    }catch(err){
      logDebug('readSvgViewBox baseVal failed', { error: err?.message || String(err) });
    }
    return parseViewBoxAttribute(svg.getAttribute?.('viewBox'));
  };

  const resolveAutoResizeBaseViewport = baseViewport => {
    const explicitWidth = parseFiniteNumber(baseViewport?.width);
    const explicitHeight = parseFiniteNumber(baseViewport?.height);
    return {
      width: Number.isFinite(explicitWidth) && explicitWidth > 0 ? explicitWidth : NaN,
      height: Number.isFinite(explicitHeight) && explicitHeight > 0 ? explicitHeight : NaN
    };
  };

  const resolveSvgBox = target => {
    if(!target){
      return null;
    }
    if(target.classList?.contains?.('svgbox')){
      return target;
    }
    return target.closest?.('.svgbox') || null;
  };

  const readStableViewBox = svgBox => {
    const dataset = svgBox?.dataset || null;
    if(!dataset){
      return null;
    }
    return normalizeViewBox({
      minX: dataset[VIEWBOX_DATASET_KEYS.minX],
      minY: dataset[VIEWBOX_DATASET_KEYS.minY],
      width: dataset[VIEWBOX_DATASET_KEYS.width],
      height: dataset[VIEWBOX_DATASET_KEYS.height]
    });
  };

  const readStableRenderedSize = svgBox => {
    const dataset = svgBox?.dataset || null;
    if(!dataset){
      return null;
    }
    const width = parseFiniteNumber(dataset[VIEWBOX_DATASET_KEYS.renderedWidth]);
    const height = parseFiniteNumber(dataset[VIEWBOX_DATASET_KEYS.renderedHeight]);
    if(!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0){
      return null;
    }
    return { width, height };
  };

  const readSvgRenderedSize = svg => {
    if(!svg || typeof svg.getBoundingClientRect !== 'function'){
      return null;
    }
    const rect = svg.getBoundingClientRect();
    const width = parseFiniteNumber(rect?.width);
    const height = parseFiniteNumber(rect?.height);
    if(!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0){
      return null;
    }
    return { width, height };
  };

  const readSvgSlotSize = (svg, svgBox = null) => {
    const candidates = [svg?.parentElement || null, svgBox || resolveSvgBox(svg)].filter(Boolean);
    for(const node of candidates){
      if(typeof node.getBoundingClientRect !== 'function'){
        continue;
      }
      const rect = node.getBoundingClientRect();
      const width = parseFiniteNumber(rect?.width);
      const height = parseFiniteNumber(rect?.height);
      if(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0){
        return { width, height };
      }
    }
    return readSvgRenderedSize(svg);
  };

  const writeStableViewBox = (svgBox, viewBox, reason, renderedSize) => {
    const normalized = normalizeViewBox(viewBox);
    const dataset = svgBox?.dataset || null;
    if(!dataset || !normalized){
      return null;
    }
    dataset[VIEWBOX_DATASET_KEYS.minX] = String(normalized.minX);
    dataset[VIEWBOX_DATASET_KEYS.minY] = String(normalized.minY);
    dataset[VIEWBOX_DATASET_KEYS.width] = String(normalized.viewW);
    dataset[VIEWBOX_DATASET_KEYS.height] = String(normalized.viewH);
    if(reason){
      dataset.graphViewportStableReason = String(reason);
    }
    const rendered = renderedSize && Number.isFinite(renderedSize.width) && Number.isFinite(renderedSize.height)
      ? renderedSize
      : null;
    if(rendered && rendered.width > 0 && rendered.height > 0){
      dataset[VIEWBOX_DATASET_KEYS.renderedWidth] = String(rendered.width);
      dataset[VIEWBOX_DATASET_KEYS.renderedHeight] = String(rendered.height);
    }
    return normalized;
  };

  function captureGraphViewportStableAxes(target, options = {}) {
    const svgBox = resolveSvgBox(target);
    const svg = options.svg
      || (target && String(target.tagName || '').toLowerCase() === 'svg' ? target : null)
      || svgBox?.querySelector?.('svg[data-preview-source="true"], svg[id$="Svg"], [id$="Plot"] svg, svg:not(.resizer-options-icon)')
      || null;
    let viewBox = readSvgViewBox(svg);
    if(!svgBox || !viewBox){
      logDebug('graphViewport stable capture skipped', {
        reason: options.reason || null,
        hasSvgBox: !!svgBox,
        hasSvg: !!svg,
        hasViewBox: !!viewBox
      });
      return null;
    }
    const priorStableViewBox = readStableViewBox(svgBox);
    const axis = options.axis === 'x' || options.axis === 'y' ? options.axis : null;
    const shouldReuseOrthogonalAxis = !!priorStableViewBox
      && !!axis
      && options.reuseOrthogonalAxis !== false
      && options.reason !== 'pointer-start';
    if(shouldReuseOrthogonalAxis && axis === 'y'){
      viewBox = {
        ...viewBox,
        minX: priorStableViewBox.minX,
        viewW: priorStableViewBox.viewW
      };
    }else if(shouldReuseOrthogonalAxis && axis === 'x'){
      viewBox = {
        ...viewBox,
        minY: priorStableViewBox.minY,
        viewH: priorStableViewBox.viewH
      };
    }
    const renderedSize = readSvgRenderedSize(svg);
    const stored = writeStableViewBox(svgBox, viewBox, options.reason || 'capture', renderedSize);
    logDebug('graphViewport stable axes captured', {
      reason: options.reason || null,
      axis,
      reusedOrthogonalAxis: shouldReuseOrthogonalAxis,
      renderedSize,
      viewBox: stored
    });
    return stored;
  }

  function applyLiveResizeViewportLock(target, options = {}) {
    const svgBox = resolveSvgBox(target);
    const svg = options.svg
      || (target && String(target.tagName || '').toLowerCase() === 'svg' ? target : null)
      || svgBox?.querySelector?.('svg[data-preview-source="true"], svg[id$="Svg"], [id$="Plot"] svg, svg:not(.resizer-options-icon)')
      || null;
    const dataset = svgBox?.dataset || null;
    const axis = options.axis === 'x' || options.axis === 'y'
      ? options.axis
      : (dataset?.resizerAxisViewportLockAxis === 'x' || dataset?.resizerAxisViewportLockAxis === 'y'
        ? dataset.resizerAxisViewportLockAxis
        : null);
    if(!svgBox || !svg || !dataset || (axis !== 'x' && axis !== 'y') || dataset.resizerAspectLocked === 'true'){
      return null;
    }
    const stableViewBox = readStableViewBox(svgBox);
    const stableRenderedSize = readStableRenderedSize(svgBox);
    const slotSize = readSvgSlotSize(svg, svgBox);
    const renderedSize = readSvgRenderedSize(svg) || slotSize;
    if(!stableViewBox || !stableRenderedSize || !slotSize || !renderedSize){
      return null;
    }
    const next = {
      minX: stableViewBox.minX,
      minY: stableViewBox.minY,
      viewW: stableViewBox.viewW,
      viewH: stableViewBox.viewH
    };
    if(axis === 'x'){
      const scale = slotSize.width / stableRenderedSize.width;
      if(!Number.isFinite(scale) || scale <= 0){
        return null;
      }
      next.viewW = Math.max(1, stableViewBox.viewW * scale);
    }else if(axis === 'y'){
      const scale = slotSize.height / stableRenderedSize.height;
      if(!Number.isFinite(scale) || scale <= 0){
        return null;
      }
      next.viewH = Math.max(1, stableViewBox.viewH * scale);
    }
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.width = axis === 'x' ? `${slotSize.width}px` : `${stableRenderedSize.width}px`;
    svg.style.height = axis === 'y' ? `${slotSize.height}px` : `${stableRenderedSize.height}px`;
    svg.style.minWidth = '0';
    svg.style.minHeight = '0';
    svg.style.display = 'block';
    svg.setAttribute('viewBox', `${next.minX} ${next.minY} ${next.viewW} ${next.viewH}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    logDebug('graphViewport live resize lock applied', {
      reason: options.reason || null,
      axis,
      slotSize,
      renderedSize,
      stableRenderedSize,
      viewBox: next
    });
    return next;
  }

  function enforceLockedAxisViewport(svg, svgBox, viewBox, reason) {
    const dataset = svgBox?.dataset || null;
    const targetRatio = Number(dataset?.resizerLockedGeometryRatio);
    if(dataset?.resizerAspectLocked !== 'true'
      || !Number.isFinite(targetRatio) || targetRatio <= 0){
      return normalizeViewBox(viewBox);
    }
    let axes = Shared.axisControls?.measureRenderedAxes?.(svg, {
      includeUnregistered: true
    }) || null;
    const projected3d = axes?.xElement?.getAttribute?.('data-axis-line') === '1'
      && axes?.yElement?.getAttribute?.('data-axis-line') === '1';
    if(projected3d){
      return normalizeViewBox(viewBox);
    }
    if(svg?.getAttribute?.('preserveAspectRatio') !== 'none'){
      svg.setAttribute('preserveAspectRatio', 'none');
      axes = Shared.axisControls?.measureRenderedAxes?.(svg, {
        includeUnregistered: true
      }) || null;
    }
    let next = normalizeViewBox(viewBox);
    let measuredRatio = NaN;
    if(!next){
      return null;
    }
    for(let pass = 0; pass < 3; pass += 1){
      const xLength = Number(axes?.x ?? axes?.width);
      const yLength = Number(axes?.y ?? axes?.height);
      if(!Number.isFinite(xLength) || xLength <= 0 || !Number.isFinite(yLength) || yLength <= 0){
        break;
      }
      measuredRatio = xLength / yLength;
      const relativeError = measuredRatio / targetRatio;
      if(!Number.isFinite(relativeError) || relativeError <= 0 || Math.abs(relativeError - 1) <= 1e-6){
        break;
      }
      if(relativeError > 1){
        const width = next.viewW * relativeError;
        next.minX -= (width - next.viewW) / 2;
        next.viewW = width;
      }else{
        const height = next.viewH / relativeError;
        next.minY -= (height - next.viewH) / 2;
        next.viewH = height;
      }
      svg.setAttribute('viewBox', `${next.minX} ${next.minY} ${next.viewW} ${next.viewH}`);
      axes = Shared.axisControls?.measureRenderedAxes?.(svg, {
        includeUnregistered: true
      }) || null;
    }
    logDebug('graphViewport locked axis ratio enforced', {
      reason: reason || null,
      targetRatio,
      measuredRatio,
      viewBox: next
    });
    return next;
  }

  const isOrthogonalViewportLockActive = (dataset, axis) => {
    if(!dataset || (axis !== 'x' && axis !== 'y')){
      return false;
    }
    const markedAxis = dataset.resizerAxisViewportLockAxis;
    if(markedAxis !== axis){
      return false;
    }
    const lockUntil = Number(dataset.resizerAxisViewportLockUntil);
    return Number.isFinite(lockUntil) && Date.now() <= lockUntil;
  };

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
  let cachedSvgBaselineShiftSupport = null;
  const supportsSvgBaselineShift = () => {
    if (cachedSvgBaselineShiftSupport !== null) {
      return cachedSvgBaselineShiftSupport;
    }
    try {
      const doc = global?.document;
      if (!doc || !doc.body || typeof doc.createElementNS !== 'function') {
        cachedSvgBaselineShiftSupport = true;
        return cachedSvgBaselineShiftSupport;
      }
      const svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', '200');
      svg.setAttribute('height', '80');
      svg.style.position = 'absolute';
      svg.style.left = '-9999px';
      svg.style.top = '-9999px';
      svg.style.opacity = '0';
      svg.style.pointerEvents = 'none';

      const shiftedText = doc.createElementNS(SVG_NS, 'text');
      shiftedText.setAttribute('x', '10');
      shiftedText.setAttribute('y', '50');
      shiftedText.setAttribute('font-size', '40');
      shiftedText.textContent = 'A';
      const shiftedSpan = doc.createElementNS(SVG_NS, 'tspan');
      shiftedSpan.textContent = '2';
      shiftedSpan.setAttribute('baseline-shift', 'super');
      shiftedText.appendChild(shiftedSpan);

      const controlText = doc.createElementNS(SVG_NS, 'text');
      controlText.setAttribute('x', '80');
      controlText.setAttribute('y', '50');
      controlText.setAttribute('font-size', '40');
      controlText.textContent = 'A2';

      svg.appendChild(shiftedText);
      svg.appendChild(controlText);
      doc.body.appendChild(svg);

      const shiftedBox = shiftedSpan.getBBox();
      const controlBox = controlText.getBBox();
      const delta = Math.abs((shiftedBox?.y || 0) - (controlBox?.y || 0));
      cachedSvgBaselineShiftSupport = Number.isFinite(delta) && delta > 1;
      svg.remove();
    } catch (err) {
      cachedSvgBaselineShiftSupport = true;
    }
    return cachedSvgBaselineShiftSupport;
  };
  const shouldUseSvgScriptFallback = () => !supportsSvgBaselineShift();

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

  const fontSizeValueToPx = (value) => {
    const parsed = parseFontSizeValue(value);
    if (!parsed || !Number.isFinite(parsed.numeric)) { return null; }
    if (!parsed.unit || parsed.unit === 'px') { return parsed.numeric; }
    if (parsed.unit === 'em' || parsed.unit === 'rem') { return parsed.numeric * 16; }
    if (parsed.unit === 'pt') { return parsed.numeric * (96 / 72); }
    return parsed.numeric;
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
    const useFirefoxScriptFallback = shouldUseSvgScriptFallback();
    let computedFontSize = null;
    try {
      computedFontSize = global?.getComputedStyle ? global.getComputedStyle(targetEl)?.fontSize : null;
    } catch (styleErr) {
      computedFontSize = null;
    }
    const baseFontSizeSource = targetEl.getAttribute?.('font-size') || computedFontSize || null;
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
        if (useFirefoxScriptFallback) {
          const shift = styleEntry?.baselineShift || null;
          if (shift === 'sub' || shift === 'super') {
            const translateEm = shift === 'sub' ? SUB_BASELINE_SHIFT : -SUPER_BASELINE_SHIFT;
            const segmentFontSizeSource = styleEntry?.fontSize || baseFontSizeSource || DEFAULT_SCRIPT_FONT_SIZE;
            const segmentFontPx = fontSizeValueToPx(segmentFontSizeSource)
              || fontSizeValueToPx(baseFontSizeSource)
              || 16;
            const translatePx = Math.round(segmentFontPx * translateEm * 1000) / 1000;
            if (!styleEntry?.fontSize) {
              tspan.setAttribute('font-size', DEFAULT_SCRIPT_FONT_SIZE);
            }
            tspan.setAttribute('transform', `translate(0 ${translatePx})`);
            if (tspan.style) {
              tspan.style.transformBox = 'fill-box';
              tspan.style.transformOrigin = 'center';
              tspan.style.transform = `translate(0px, ${translatePx}px)`;
            }
          }
        }
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
      onInput,
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

    el.dataset.inlineEditable = '1';
    el.style.cursor = cursor;
    el.style.touchAction = 'none';

    const previousBinding = el.__graphitixInlineEditBinding || null;
    if(previousBinding?.dblclick){
      el.removeEventListener('dblclick', previousBinding.dblclick);
    }
    if(previousBinding?.pointerup){
      el.removeEventListener('pointerup', previousBinding.pointerup);
    }

    const collectVisibilityTargets = (targetNode) => {
      if (!targetNode) { return []; }
      const resolved = [];
      const seen = new Set();
      const pushUnique = (node) => {
        if (!node || seen.has(node)) { return; }
        seen.add(node);
        resolved.push(node);
      };

      const tagName = String(targetNode.tagName || '').toLowerCase();
      const textNode = tagName === 'text'
        ? targetNode
        : (typeof targetNode.closest === 'function' ? targetNode.closest('text') : null);
      if (textNode) {
        pushUnique(textNode);
      } else {
        pushUnique(targetNode);
      }

      const referenceNode = textNode || targetNode;
      const dataset = referenceNode?.dataset || {};
      const key = dataset.fontKey || null;
      if (!key || !ownerDocument) {
        return resolved;
      }

      const escapeAttr = (value) => {
        const raw = String(value);
        if (ownerWindow?.CSS && typeof ownerWindow.CSS.escape === 'function') {
          return ownerWindow.CSS.escape(raw);
        }
        return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      };

      // Hide all nodes sharing the same font key within this SVG graph.
      // Scope/tab filters can miss legacy duplicates and leave background text visible.
      const selector = `text[data-font-key="${escapeAttr(key)}"]`;

      const searchRoot = (typeof referenceNode.closest === 'function' && referenceNode.closest('svg'))
        || ownerDocument;
      let matches = [];
      try {
        matches = Array.from(searchRoot.querySelectorAll(selector));
      } catch (queryErr) {
        console.error('Shared.makeEditable visibility target query error', queryErr);
      }
      for (let i = 0; i < matches.length; i += 1) {
        pushUnique(matches[i]);
      }
      return resolved;
    };

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
      if (state.visibilityObserver) {
        try {
          state.visibilityObserver.disconnect();
        } catch (observerErr) {
          console.error('Shared.makeEditable visibility observer cleanup error', observerErr);
        }
        state.visibilityObserver = null;
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
      if (Array.isArray(state.hiddenTargets) && state.hiddenTargets.length) {
        state.hiddenTargets.forEach(entry => {
          const target = entry?.target || null;
          if (!target || !target.style) { return; }
          try {
            if (entry.restoreVisibility === null) {
              target.style.removeProperty('visibility');
            } else {
              target.style.visibility = entry.restoreVisibility;
            }
            if (entry.restoreOpacity === null) {
              target.style.removeProperty('opacity');
            } else {
              target.style.opacity = entry.restoreOpacity;
            }
          } catch (visibilityErr) {
            console.error('Shared.makeEditable visibility restore error', visibilityErr);
          }
        });
        state.hiddenTargets = [];
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
        overlay.style.background = '#ffffff';
        overlay.style.borderRadius = '4px';
        overlay.style.overflow = 'hidden';

        const widthPadding = Number.isFinite(options.inlineWidthPadding)
          ? options.inlineWidthPadding
          : 12;
        const configuredMinWidth = Number(minWidth) || 0;
        const configuredMinHeight = Number(minHeight) || 0;
        const overlayBaseWidth = Math.max(rect.width || 0, configuredMinWidth);
        const overlayBaseHeight = Math.max(rect.height || 0, configuredMinHeight);
        const overlayWidth = overlayBaseWidth + widthPadding;
        const targetHeight = overlayBaseHeight;
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
        const textAlignMode = (() => {
          const anchor = el?.getAttribute?.('text-anchor');
          if (anchor === 'end') { return 'right'; }
          if (anchor === 'middle') { return 'center'; }
          if (anchor === 'start') { return 'left'; }
          const textAlign = (computedStyle?.textAlign || 'left').toLowerCase();
          if (textAlign === 'right') { return 'right'; }
          if (textAlign === 'center') { return 'center'; }
          return 'left';
        })();
        input.style.fontSize = overlayFontSize;
        input.style.fontFamily = computedStyle?.fontFamily || 'inherit';
        input.style.fontWeight = computedStyle?.fontWeight || '600';
        input.style.fontStyle = computedStyle?.fontStyle || 'normal';
        input.style.textDecoration = computedStyle?.textDecoration || 'none';
        input.style.lineHeight = overlayLineHeight;
        input.style.border = 'none';
        input.style.borderRadius = '0';
        input.style.boxShadow = 'none';
        input.style.padding = '0 6px';
        input.style.background = 'transparent';
        input.style.color = '#222';
        input.style.textShadow = 'none';
        input.style.caretColor = '#1a73e8';
        input.style.setProperty('--inline-edit-selection-color', 'currentColor');
        input.style.setProperty('--inline-edit-selection-bg', 'rgba(74, 144, 226, 0.28)');
        input.style.position = 'relative';
        input.style.zIndex = '2';
        input.style.textAlign = textAlignMode;

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
          hiddenTargets: [],
          centerX: targetCenterX,
          centerY: targetCenterY,
          minWidth: Math.max(4, configuredMinWidth || 0),
          minHeight: Math.max(4, configuredMinHeight || 0),
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
          initialText: inlineInitialValue,
          initialStyleMap: normalizedInitialStyleMap,
          preventCollapsedSelectionOverwrite: false,
          safePointerdownHandler: null,
          pendingSafeFocus: false,
          lastSafePointerTarget: null,
          safePointerdownResetTimer: null,
          visibilityObserver: null,
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

        const hideInlineVisibilityTarget = node => {
          if (!node || !node.style) { return; }
          if (state.hiddenTargets.some(entry => entry?.target === node)) { return; }
          try {
            state.hiddenTargets.push({
              target: node,
              restoreVisibility: node.style.visibility || null,
              restoreOpacity: node.style.opacity || null,
            });
            node.style.visibility = 'hidden';
            node.style.opacity = '0';
          } catch (hideErr) {
            console.error('Shared.makeEditable hide target error', hideErr);
          }
        };
        const visibilityTargets = collectVisibilityTargets(el);
        if (visibilityTargets.length) {
          visibilityTargets.forEach(hideInlineVisibilityTarget);
          logDebug('makeEditable inline targets hidden', {
            count: state.hiddenTargets.length,
            tag: el?.tagName || null
          });
        }
        const fontKey = String(el?.dataset?.fontKey || '').trim();
        const visibilityRoot = el?.closest?.('.svgbox') || el?.closest?.('svg') || null;
        const MutationObserverCtor = ownerWindow?.MutationObserver || global.MutationObserver;
        if(fontKey && visibilityRoot && typeof MutationObserverCtor === 'function'){
          const hideMatchingTextNodes = root => {
            if(!root){ return; }
            const candidates = [];
            if(
              String(root.tagName || '').toLowerCase() === 'text'
              && String(root.dataset?.fontKey || '') === fontKey
            ){
              candidates.push(root);
            }
            if(typeof root.querySelectorAll === 'function'){
              root.querySelectorAll('text[data-font-key]').forEach(node => {
                if(String(node.dataset?.fontKey || '') === fontKey){
                  candidates.push(node);
                }
              });
            }
            candidates.forEach(hideInlineVisibilityTarget);
          };
          state.visibilityObserver = new MutationObserverCtor(mutations => {
            mutations.forEach(mutation => {
              mutation.addedNodes?.forEach?.(hideMatchingTextNodes);
            });
          });
          state.visibilityObserver.observe(visibilityRoot, { childList: true, subtree: true });
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
        preview.style.justifyContent = textAlignMode === 'right'
          ? 'flex-end'
          : (textAlignMode === 'center' ? 'center' : 'flex-start');
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
          const resolveEditableTextColor = () => {
            const candidates = [
              state.baseStyle?.fill,
              state.baseStyle?.color,
              computedStyle?.fill,
              computedStyle?.color,
              '#222'
            ];
            for (let i = 0; i < candidates.length; i += 1) {
              const candidate = candidates[i];
              if (!candidate) { continue; }
              const normalized = String(candidate).trim().toLowerCase();
              if (!normalized || normalized === 'none' || normalized === 'transparent') { continue; }
              return candidate;
            }
            return '#222';
          };
          const usePreviewLayer = state.usingInlineSegments === true;
          if (state.preview && state.preview.style) {
            state.preview.style.visibility = usePreviewLayer ? 'visible' : 'hidden';
            state.preview.style.opacity = usePreviewLayer ? '1' : '0';
          }
          if (state.input && state.input.style) {
            if (state.input.classList && typeof state.input.classList.toggle === 'function') {
              state.input.classList.toggle('inline-edit-input--preview-mode', usePreviewLayer);
            }
            state.input.style.color = usePreviewLayer ? 'transparent' : resolveEditableTextColor();
            state.input.style.setProperty('--inline-edit-selection-color', usePreviewLayer ? 'transparent' : resolveEditableTextColor());
            state.input.style.setProperty('--inline-edit-selection-bg', 'rgba(74, 144, 226, 0.28)');
            if (usePreviewLayer) {
              state.input.style.setProperty('-webkit-text-fill-color', 'transparent');
              state.input.style.textShadow = '0 0 0 transparent';
            } else {
              state.input.style.removeProperty('-webkit-text-fill-color');
              state.input.style.textShadow = 'none';
            }
          }
          logDebug('makeEditable inline render refresh', {
            forcePlain,
            length: textValue.length,
            hasStyles: state.usingInlineSegments,
            usePreviewLayer,
          });
        };
        refreshInlineRendering(false);

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
            fontControlsApi.openForElement(el, { scopeId, key, triggerEvent: event });
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
          // Keep a small safety allowance so glyph overhangs never clip at the left edge.
          const paddedWidth = nextWidth + (state.widthPadding || 0) + 4;
          overlay.style.width = `${paddedWidth}px`;
          overlay.style.height = `${nextHeight}px`;
          if (multiline) {
            input.style.minHeight = `${Math.max(nextHeight, state.minHeight)}px`;
          }
          overlay.style.left = `${state.centerX - paddedWidth / 2}px`;
          overlay.style.top = `${state.centerY - nextHeight / 2}px`;
        };

        function commit(nextValue, reason) {
          let finalValue = nextValue ?? '';
          let emptyTitleVisibility = null;
          const titleRole = String(el?.dataset?.fontRole || '').trim();
          const isGraphTitle = titleRole === 'graphTitle';
          const isAxisTitle = titleRole === 'xTitle' || titleRole === 'yTitle' || titleRole === 'zTitle';
          const initialTitleValue = state.initialValue == null ? '' : String(state.initialValue);
          const shouldHideEmptyTitle = (isGraphTitle || isAxisTitle)
            && String(finalValue).trim() === ''
            && initialTitleValue.trim() !== '';
          if (shouldHideEmptyTitle) {
            finalValue = initialTitleValue;
            state.inlineText = initialTitleValue;
            state.styleMap = Array.isArray(state.initialStyleMap)
              ? state.initialStyleMap.slice()
              : new Array(initialTitleValue.length).fill(null);
            state.usingInlineSegments = hasStyledCharacters(state.styleMap);
            state.refreshInlineRendering(false);
            notifyFontControlsInlineChange('empty-title-restore', {
              range: { start: 0, end: initialTitleValue.length },
              entire: true
            });
            const fontControlsApi = (Shared && Shared.fontControls) || ownerWindow?.Shared?.fontControls || null;
            const scopeId = String(el?.dataset?.fontScope || '').trim();
            const tabId = String(el?.dataset?.fontTabId || '').trim() || null;
            if(scopeId && typeof fontControlsApi?.setRoleVisibility === 'function'){
              emptyTitleVisibility = {
                fontControlsApi,
                scopeId,
                tabId,
                roles: isGraphTitle ? 'graphTitle' : ['xTitle', 'yTitle', 'zTitle'],
                kind: isGraphTitle ? 'graph' : 'axes'
              };
            }
          }
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
          if(emptyTitleVisibility){
            const {
              fontControlsApi,
              scopeId,
              tabId,
              roles,
              kind
            } = emptyTitleVisibility;
            fontControlsApi.setRoleVisibility(scopeId, roles, false, {
              tabId,
              recordUndo: true,
              undoLabel: `title-visibility:${kind}`,
              undoScope: el.closest?.('.panel')?.id || scopeId
            });
            const sessionApi = ownerWindow?.Main?.session || global.Main?.session || null;
            if(typeof sessionApi?.markWorkspaceTargetUserModified === 'function'){
              sessionApi.markWorkspaceTargetUserModified(el, 'title-hidden-by-empty-edit', {
                tabId,
                componentKey: scopeId,
                source: 'inline-title-edit',
                origin: 'user',
                affectsPayload: true
              });
            }
          }
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
          const nextValue = input.value ?? '';
          state.updateInlineText(nextValue);
          state.refreshInlineRendering(false);
          safeCall(onInput, [nextValue, el], 'Shared.makeEditable onInput error');
          syncSizeToContent();
        });

        syncSizeToContent();

        ownerWindow.setTimeout(() => {
          input.focus();
          const preferCaretOnly = state.usingInlineSegments === true;
          if (preferCaretOnly && typeof input.setSelectionRange === 'function') {
            const length = (input.value || '').length;
            input.setSelectionRange(length, length);
          } else if (typeof input.select === 'function') {
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

    el.style.touchAction = 'manipulation';
    el.addEventListener('dblclick', handler);
    let lastTouchTapTime = 0;
    let lastTouchTapPoint = null;
    const pointerupHandler = (evt) => {
      if(evt?.pointerType !== 'touch'){
        return;
      }
      const now = Date.now();
      const pt = { x: Number(evt.clientX) || 0, y: Number(evt.clientY) || 0 };
      const prev = lastTouchTapPoint;
      const closeEnough = prev
        ? ((pt.x - prev.x) * (pt.x - prev.x) + (pt.y - prev.y) * (pt.y - prev.y)) <= 400
        : false;
      if((now - lastTouchTapTime) <= 360 && closeEnough){
        evt.preventDefault();
        handler(evt);
        lastTouchTapTime = 0;
        lastTouchTapPoint = null;
        return;
      }
      lastTouchTapTime = now;
      lastTouchTapPoint = pt;
    };
    el.addEventListener('pointerup', pointerupHandler, { passive: false });
    el.__graphitixInlineEditBinding = { dblclick: handler, pointerup: pointerupHandler };
    logDebug('makeEditable bound', { hasOnChange: typeof onChange === 'function' });
    return true;
  }

  /**
   * Enable drag functionality for SVG text elements (titles, axis labels).
   * Allows users to reposition labels by dragging them within the SVG.
   * @param {SVGElement} el - The SVG element to make draggable
   * @param {SVGSVGElement} svg - The parent SVG element for coordinate transforms
   * @param {Object} options - Configuration options
   * @param {Function} options.onDragEnd - Callback when drag ends with {x, y} position
   * @param {Function} options.onDragStart - Callback when drag starts
   * @param {Function} options.normalizePosition - Optional commit-time normalizer returning {x, y}
   * @param {Function} options.onPositionChange - Callback for committed drag, undo, and redo positions
   * @param {string} options.cursor - Cursor style during drag (default: 'move')
   * @param {number} options.dragThreshold - Minimum pointer movement before drag activates
   * @param {('x'|'y'|null)} options.axisLock - Constrain movement to a single axis
   * @param {boolean} options.recordUndo - Record element position changes in undo history
   */
  function enableLabelDrag(el, svg, options = {}) {
    if (!el || !svg) {
      logDebug('enableLabelDrag skipped', { hasElement: !!el, hasSvg: !!svg });
      return;
    }
    const {
      onDragEnd,
      onDragStart,
      onDragMove,
      normalizePosition,
      onPositionChange,
      cursor = 'move',
      syncChildX = false,
      normalizeDuringDrag = false
    } = options;
    const dragThreshold = Math.max(2, Number(options.dragThreshold) || 4);
    const dragThresholdSq = dragThreshold * dragThreshold;
    const axisLock = options.axisLock === 'x' || options.axisLock === 'y' ? options.axisLock : null;
    const shouldRecordUndo = options.recordUndo !== false;
    let pointerDown = false;
    let dragging = false;
    let startPoint = { x: 0, y: 0 };
    let origPos = { x: 0, y: 0 };
    let currentPos = { x: 0, y: 0 };
    const CAPTURE_ATTR = 'dragXOffset';

    el.style.cursor = cursor;
    el.style.touchAction = 'none';

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
    const clearChildOffset = (child) => {
      if(!child){ return; }
      if(child.dataset){
        delete child.dataset[CAPTURE_ATTR];
      }else{
        child.removeAttribute(datasetKey);
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
        const rawChildX = child.getAttribute('x');
        const childX = rawChildX == null || rawChildX === '' ? NaN : parseFloat(rawChildX);
        if(Number.isFinite(childX)){
          setChildOffset(child, childX - origPos.x);
        }else{
          // Inline tspans intentionally inherit the parent text position.
          // Giving them x during drag breaks SVG text flow (for example,
          // a superscript exponent collapses onto the line start).
          clearChildOffset(child);
        }
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

    const updateTransformForPosition = (x, y) => {
      const transform = el.getAttribute('transform');
      if (!transform) {
        return;
      }
      // Keep matrix-based aspect correction anchored to the updated x/y so drag
      // movement remains 1:1 with the pointer.
      const matrixMatch = transform.match(/^\s*matrix\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*,\s*0\s*,\s*0\s*,\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)\s*(.*)$/i);
      if (matrixMatch) {
        const scaleX = Number.parseFloat(matrixMatch[1]);
        const scaleY = Number.parseFloat(matrixMatch[2]);
        const tail = (matrixMatch[5] || '').trim();
        if (Number.isFinite(scaleX) && Number.isFinite(scaleY)) {
          const tx = x - (scaleX * x);
          const ty = y - (scaleY * y);
          const nextMatrix = `matrix(${scaleX},0,0,${scaleY},${tx},${ty})`;
          el.setAttribute('transform', tail ? `${nextMatrix} ${tail}` : nextMatrix);
          return;
        }
      }
      // Update transform for rotated elements (like y-axis labels)
      if (transform.includes('rotate')) {
        const rotateMatch = transform.match(/rotate\s*\(\s*(-?\d+\.?\d*)\s*/);
        if (rotateMatch) {
          const angle = rotateMatch[1];
          el.setAttribute('transform', `rotate(${angle} ${x} ${y})`);
        }
      }
    };

    let activePointerId = null;

    const handlePointerDown = (e) => {
      // Don't start drag if user is editing text
      if (el.dataset.editing === 'true') return;
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      if(e?.pointerType === 'touch'){
        e.preventDefault();
      }
      activePointerId = typeof e.pointerId === 'number' ? e.pointerId : null;
      pointerDown = true;
      dragging = false;
      const loc = getTransformedPoint(e.clientX, e.clientY);
      startPoint = { x: loc.x, y: loc.y };
      origPos = {
        x: parseFloat(el.getAttribute('x') || '0'),
        y: parseFloat(el.getAttribute('y') || '0')
      };
      currentPos = { x: origPos.x, y: origPos.y };
      if(activePointerId != null && typeof el.setPointerCapture === 'function'){
        try{ el.setPointerCapture(activePointerId); }catch(err){}
      }
      global.addEventListener('pointermove', handlePointerMove, true);
      global.addEventListener('pointerup', handlePointerUp, true);
      global.addEventListener('pointercancel', handlePointerUp, true);
      global.addEventListener('mousemove', handlePointerMove, true);
      global.addEventListener('mouseup', handlePointerUp, true);
    };

    const handlePointerMove = (e) => {
      if (!pointerDown) return;
      if(activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== activePointerId){
        return;
      }
      const loc = getTransformedPoint(e.clientX, e.clientY);
      const dx = loc.x - startPoint.x;
      const dy = loc.y - startPoint.y;
      if (!dragging) {
        const distSq = dx * dx + dy * dy;
        if (distSq < dragThresholdSq) {
          return;
        }
        dragging = true;
        captureChildAnchors();
        e.preventDefault();
        e.stopPropagation();
        if (typeof onDragStart === 'function') {
          safeCall(onDragStart, [{ x: origPos.x, y: origPos.y, element: el }], 'enableLabelDrag onDragStart error');
        }
        logDebug('enableLabelDrag start', { origPos, startPoint, dragThreshold });
      } else {
        e.preventDefault();
        e.stopPropagation();
      }
      let newX = axisLock === 'y' ? origPos.x : origPos.x + dx;
      let newY = axisLock === 'x' ? origPos.y : origPos.y + dy;
      if(normalizeDuringDrag && typeof normalizePosition === 'function'){
        const normalized = safeCall(normalizePosition, [{
          x: newX,
          y: newY,
          origin: { x: origPos.x, y: origPos.y },
          element: el,
          reason: 'drag-move'
        }], 'enableLabelDrag normalizePosition error');
        if(normalized && Number.isFinite(Number(normalized.x)) && Number.isFinite(Number(normalized.y))){
          newX = Number(normalized.x);
          newY = Number(normalized.y);
        }
      }
      el.setAttribute('x', String(newX));
      el.setAttribute('y', String(newY));
      currentPos = { x: newX, y: newY };
      applyChildAnchors(newX);
      updateTransformForPosition(newX, newY);
      if(typeof onDragMove === 'function'){
        safeCall(onDragMove, [{ x: newX, y: newY, element: el }], 'enableLabelDrag onDragMove error');
      }
    };

    const handlePointerUp = (e) => {
      if (!pointerDown) return;
      if(activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== activePointerId){
        return;
      }
      global.removeEventListener('pointermove', handlePointerMove, true);
      global.removeEventListener('pointerup', handlePointerUp, true);
      global.removeEventListener('pointercancel', handlePointerUp, true);
      global.removeEventListener('mousemove', handlePointerMove, true);
      global.removeEventListener('mouseup', handlePointerUp, true);
      const wasDragging = dragging;
      pointerDown = false;
      dragging = false;
      if(activePointerId != null && typeof el.releasePointerCapture === 'function'){
        try{ el.releasePointerCapture(activePointerId); }catch(err){}
      }
      activePointerId = null;
      if (!wasDragging) {
        return;
      }
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      let finalX = Number.isFinite(currentPos.x) ? currentPos.x : parseFloat(el.getAttribute('x') || '0');
      let finalY = Number.isFinite(currentPos.y) ? currentPos.y : parseFloat(el.getAttribute('y') || '0');
      const normalized = safeCall(normalizePosition, [{
        x: finalX,
        y: finalY,
        origin: { x: origPos.x, y: origPos.y },
        element: el,
        reason: 'drag-end'
      }], 'enableLabelDrag normalizePosition error');
      if (normalized && Number.isFinite(Number(normalized.x)) && Number.isFinite(Number(normalized.y))) {
        finalX = Number(normalized.x);
        finalY = Number(normalized.y);
        currentPos = { x: finalX, y: finalY };
        el.setAttribute('x', String(finalX));
        el.setAttribute('y', String(finalY));
        applyChildAnchors(finalX);
        updateTransformForPosition(finalX, finalY);
      }
      // Record undo/redo entry for label movement
      if (shouldRecordUndo) {
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
              updateTransformForPosition(pos.x, pos.y);
              safeCall(onDragMove, [{ x: pos.x, y: pos.y, element: el, reason: reason || 'history' }], 'enableLabelDrag onDragMove error');
              safeCall(onPositionChange, [{ x: pos.x, y: pos.y, element: el, reason: reason || 'history' }], 'enableLabelDrag onPositionChange error');
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
      }
      safeCall(onPositionChange, [{ x: finalX, y: finalY, element: el, reason: 'drag-end' }], 'enableLabelDrag onPositionChange error');
      if (typeof onDragEnd === 'function') {
        safeCall(onDragEnd, [{ x: finalX, y: finalY, element: el }], 'enableLabelDrag onDragEnd error');
      }
      logDebug('enableLabelDrag end', { x: finalX, y: finalY });
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('mousedown', handlePointerDown);

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
      group.style.touchAction = 'none';
    }

    const normalizePoint = point => ({
      x: Number.isFinite(point?.x) ? point.x : 0,
      y: Number.isFinite(point?.y) ? point.y : 0
    });

    const readViewportBounds = () => {
      try{
        const rect = svg.getBoundingClientRect?.();
        const ctm = svg.getScreenCTM?.();
        if(rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)
          && Number.isFinite(rect.right) && Number.isFinite(rect.bottom)
          && rect.right > rect.left && rect.bottom > rect.top && ctm){
          const inverse = ctm.inverse();
          const corners = [
            [rect.left, rect.top],
            [rect.right, rect.top],
            [rect.right, rect.bottom],
            [rect.left, rect.bottom]
          ].map(([x, y]) => {
            const point = svg.createSVGPoint();
            point.x = x;
            point.y = y;
            return point.matrixTransform(inverse);
          });
          const xs = corners.map(point => Number(point.x)).filter(Number.isFinite);
          const ys = corners.map(point => Number(point.y)).filter(Number.isFinite);
          if(xs.length === 4 && ys.length === 4){
            return {
              left: Math.min(...xs),
              top: Math.min(...ys),
              right: Math.max(...xs),
              bottom: Math.max(...ys)
            };
          }
        }
      }catch(err){
        logDebug('enableLegendDrag rendered viewport unavailable', { message: err?.message });
      }
      const baseVal = svg.viewBox?.baseVal;
      if(baseVal && Number.isFinite(baseVal.x) && Number.isFinite(baseVal.y)
        && Number.isFinite(baseVal.width) && baseVal.width > 0
        && Number.isFinite(baseVal.height) && baseVal.height > 0){
        return {
          left: baseVal.x,
          top: baseVal.y,
          right: baseVal.x + baseVal.width,
          bottom: baseVal.y + baseVal.height
        };
      }
      const parts = String(svg.getAttribute('viewBox') || '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if(parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0){
        return {
          left: parts[0],
          top: parts[1],
          right: parts[0] + parts[2],
          bottom: parts[1] + parts[3]
        };
      }
      return null;
    };

    const readLegendBounds = () => {
      try{
        const bounds = group.getBBox();
        if(bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)
          && Number.isFinite(bounds.width) && bounds.width >= 0
          && Number.isFinite(bounds.height) && bounds.height >= 0){
          return bounds;
        }
      }catch(err){
        logDebug('enableLegendDrag bounds unavailable', { message: err?.message });
      }
      return null;
    };

    const clampAxis = (value, minimum, maximum) => {
      if(maximum < minimum){
        return minimum;
      }
      return Math.min(Math.max(value, minimum), maximum);
    };

    const constrainPosition = point => {
      const next = normalizePoint(point);
      const viewport = readViewportBounds();
      const bounds = readLegendBounds();
      if(!viewport || !bounds){
        return next;
      }
      return {
        x: clampAxis(next.x, viewport.left - bounds.x, viewport.right - bounds.x - bounds.width),
        y: clampAxis(next.y, viewport.top - bounds.y, viewport.bottom - bounds.y - bounds.height)
      };
    };

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

    const constrainCurrentPosition = () => {
      const current = normalizePoint(getPosition());
      const bounded = constrainPosition(current);
      const changed = bounded.x !== current.x || bounded.y !== current.y;
      if(changed){
        setPosition(bounded);
      }
      return { position: bounded, changed };
    };
    const initialConstraint = constrainCurrentPosition();
    if(initialConstraint.changed){
      safeCall(options.onPositionConstrained, [initialConstraint.position], 'enableLegendDrag onPositionConstrained error');
    }

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
        const boundedPosition = constrainPosition(pos);
        setPosition(boundedPosition);
        if (typeof options.onPositionChange === 'function') {
          options.onPositionChange(boundedPosition);
        }
        logDebug('enableLegendDrag apply position', { reason, x: boundedPosition.x, y: boundedPosition.y });
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

    let activePointerId = null;

    const handlePointerDown = event => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      activePointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
      pointerDown = true;
      dragging = false;
      startPoint = pointerToSvg(event.clientX, event.clientY);
      originPos = constrainPosition(getPosition());
      setPosition(originPos);
      currentPos = originPos;
      global.addEventListener('pointermove', handlePointerMove, true);
      global.addEventListener('pointerup', handlePointerUp, true);
      global.addEventListener('pointercancel', handlePointerUp, true);
    };

    const handlePointerMove = event => {
      if (!pointerDown) {
        return;
      }
      if(activePointerId != null && typeof event.pointerId === 'number' && event.pointerId !== activePointerId){
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
        if(activePointerId != null && typeof group.setPointerCapture === 'function'){
          try{ group.setPointerCapture(activePointerId); }catch(err){}
        }
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
      const nextPos = constrainPosition({ x: originPos.x + dx, y: originPos.y + dy });
      const appliedPosition = setPosition(nextPos);
      currentPos = appliedPosition && Number.isFinite(appliedPosition.x) && Number.isFinite(appliedPosition.y)
        ? normalizePoint(appliedPosition)
        : nextPos;
      if (typeof options.onPositionChange === 'function') {
        safeCall(options.onPositionChange, [currentPos], 'enableLegendDrag onPositionChange error');
      }
    };

    const handlePointerUp = event => {
      if (!pointerDown) {
        return;
      }
      if(activePointerId != null && typeof event.pointerId === 'number' && event.pointerId !== activePointerId){
        return;
      }
      global.removeEventListener('pointermove', handlePointerMove, true);
      global.removeEventListener('pointerup', handlePointerUp, true);
      global.removeEventListener('pointercancel', handlePointerUp, true);
      const wasDragging = dragging;
      pointerDown = false;
      dragging = false;
      if(activePointerId != null && typeof group.releasePointerCapture === 'function'){
        try{ group.releasePointerCapture(activePointerId); }catch(err){}
      }
      activePointerId = null;
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

    group.addEventListener('pointerdown', handlePointerDown);
    group.__graphitixLegendDragControl = { svg, constrainCurrentPosition };
    logDebug('enableLegendDrag bound', { element: group.tagName || 'g' });
  }

  function bindLegendDragInteraction(group, svg, options = {}) {
    if (!group || !svg || typeof options.onCommit !== 'function') {
      return false;
    }
    const writeMetric = (key, value) => {
      if (Number.isFinite(Number(value))) {
        group.dataset[key] = String(Number(value));
      }
    };
    writeMetric('legendDragOriginX', options.originX);
    writeMetric('legendDragOriginY', options.originY);
    writeMetric('legendDragScaleX', options.scaleX);
    writeMetric('legendDragScaleY', options.scaleY);
    group.dataset.legendDragContract = '1';
    group.__graphitixLegendDragBinding = {
      owner: options.owner || null,
      onCommit: options.onCommit
    };
    const commitPosition = pos => {
      const binding = group.__graphitixLegendDragBinding;
      if (!binding || typeof binding.onCommit !== 'function') {
        return;
      }
      const originX = Number(group.dataset.legendDragOriginX);
      const originY = Number(group.dataset.legendDragOriginY);
      const scaleX = Number(group.dataset.legendDragScaleX);
      const scaleY = Number(group.dataset.legendDragScaleY);
      const position = { x: pos.x, y: pos.y };
      if (Number.isFinite(originX) && Number.isFinite(scaleX) && Math.abs(scaleX) > 1e-9) {
        position.relX = (pos.x - originX) / scaleX;
      }
      if (Number.isFinite(originY) && Number.isFinite(scaleY) && Math.abs(scaleY) > 1e-9) {
        position.relY = (pos.y - originY) / scaleY;
      }
      safeCall(binding.onCommit, [position, binding.owner], 'bindLegendDragInteraction onCommit error');
    };
    if (group.__graphitixLegendDragControl?.svg === svg) {
      const constrained = group.__graphitixLegendDragControl.constrainCurrentPosition?.();
      if(constrained?.changed){
        commitPosition(constrained.position);
      }
      return true;
    }
    enableLegendDrag(group, svg, {
      undoLabel: options.undoLabel || 'legend-position',
      onPositionConstrained: commitPosition,
      onDragEnd: commitPosition
    });
    return group.__graphitixLegendDragControl?.svg === svg;
  }

  function isManagedLegendDragTarget(target){
    let node = target || null;
    while(node){
      const control = node.__graphitixLegendDragControl || null;
      if(control?.svg && node.isConnected !== false && control.svg.isConnected !== false
        && typeof control.svg.contains === 'function' && control.svg.contains(node)){
        return true;
      }
      node = node.parentNode || null;
    }
    return false;
  }

  function autoResizeSvg(svg, opts = {}) {
    if (!svg) {
      logDebug('autoResizeSvg skipped (no svg)', { hasSvg: false });
      return;
    }
    const className = String(svg.getAttribute?.('class') || '').toLowerCase();
    if (className.includes('resizer-options-icon')
      || svg.closest?.('.resizer-control-tray, .resizer-options-control, .resizer-options-menu, button')) {
      logDebug('autoResizeSvg skipped (ui svg)', { className });
      return;
    }
    const {
      fill = true,
      padding = 10,
      paddingX = null,
      paddingY = null,
      minWidth = 0,
      minHeight = 0,
      onResize,
      debugLabel = 'sharedAutoResize',
      remeasure = true,
      preserveAspectRatio = null,
      baseViewport = null,
      horizontalResizeAnchorX = null,
      excludeSelector = null,
      preserveBaseAspect = true,
      fitContent = true,
      ignoreAxisViewportLock = false,
    } = opts;

    const raf = typeof global.requestAnimationFrame === 'function'
      ? global.requestAnimationFrame.bind(global)
      : (cb) => global.setTimeout(cb, 16);
    const resizeBox = svg.closest?.('.svgbox') || null;
    const resizeDataset = resizeBox?.dataset || null;
    const resizeContext = {
      aspectLocked: resizeDataset ? resizeDataset.resizerAspectLocked === 'true' : false,
      lockedResizeAxis: resizeDataset && (resizeDataset.resizerAxisViewportLockAxis === 'x' || resizeDataset.resizerAxisViewportLockAxis === 'y')
        ? resizeDataset.resizerAxisViewportLockAxis
        : null,
      resizeAxis: resizeDataset && (resizeDataset.resizerLastAxis === 'x' || resizeDataset.resizerLastAxis === 'y')
        ? resizeDataset.resizerLastAxis
        : null,
      axisViewportLockUntil: resizeDataset?.resizerAxisViewportLockUntil || null
    };

    const applyResize = () => {
      try {
        if(fitContent === false){
          const resolvedBaseViewport = resolveAutoResizeBaseViewport(baseViewport);
          const minX = 0;
          const minY = 0;
          const viewW = Math.max(1, Math.max(Number(minWidth) || 0, resolvedBaseViewport.width));
          const viewH = Math.max(1, Math.max(Number(minHeight) || 0, resolvedBaseViewport.height));
          if(!Number.isFinite(viewW) || !Number.isFinite(viewH)){
            throw new Error(`autoResizeSvg authoritative canvas requires a finite baseViewport (${debugLabel})`);
          }
          const box = resizeBox;
          const dataset = box?.dataset || null;

          if(fill){
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.minWidth = '0';
            svg.style.minHeight = '0';
            svg.style.display = 'block';
          }
          svg.setAttribute('viewBox', `${minX} ${minY} ${viewW} ${viewH}`);
          svg.setAttribute('preserveAspectRatio', preserveAspectRatio != null ? preserveAspectRatio : 'xMidYMid meet');
          if(dataset){
            writeStableViewBox(box, { minX, minY, viewW, viewH }, debugLabel, readSvgRenderedSize(svg));
          }
          const parent = svg.parentElement;
          if(parent) parent.style.overflow = 'visible';
          if(box) box.style.overflow = 'visible';
          logDebug('autoResizeSvg authoritative canvas applied', {
            debugLabel,
            minX,
            minY,
            viewW,
            viewH,
            fill,
            preserveAspectRatio: svg.getAttribute('preserveAspectRatio')
          });
          if(typeof onResize === 'function'){
            safeCall(onResize, [{ svg, bbox: null, viewBox: { minX, minY, viewW, viewH } }], 'Shared.autoResizeSvg onResize error');
          }
          return;
        }

        const excludeSelectors = [];
        if(typeof excludeSelector === 'string' && excludeSelector.trim()){
          excludeSelectors.push(excludeSelector.trim());
        }
        if(svg.dataset?.legendBaseWidth){
          excludeSelectors.push('[data-legend-viewport-content="true"]');
        }
        const excludedNodes = excludeSelectors.length
          ? Array.from(svg.querySelectorAll(excludeSelectors.join(',')))
          : [];
        const restoreExcluded = [];
        excludedNodes.forEach(node => {
          if(!node || !node.style){
            return;
          }
          restoreExcluded.push({ node, display: node.style.display });
          node.style.display = 'none';
        });
        let bbox;
        try {
          bbox = typeof svg.getBBox === 'function' ? svg.getBBox() : null;
        } catch (bboxErr) {
          console.error('Shared.autoResizeSvg getBBox error', bboxErr);
        } finally {
          restoreExcluded.forEach(entry => {
            if(entry.display){
              entry.node.style.display = entry.display;
            }else{
              entry.node.style.removeProperty('display');
            }
          });
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
        const effectivePadding = Number.isFinite(padding) ? Math.max(0, padding) : 0;
        const effectivePaddingX = Number.isFinite(Number(paddingX)) ? Math.max(0, Number(paddingX)) : effectivePadding;
        const effectivePaddingY = Number.isFinite(Number(paddingY)) ? Math.max(0, Number(paddingY)) : effectivePadding;
        const resolvedBaseViewport = resolveAutoResizeBaseViewport(baseViewport);
        const legendBaseWidth = parseFiniteNumber(svg.dataset?.legendBaseWidth);
        const legendReserveWidth = parseFiniteNumber(svg.dataset?.legendReserveWidth);
        const contentReserveRight = parseFiniteNumber(svg.dataset?.graphContentReserveRight);
        const contentReserveBottom = parseFiniteNumber(svg.dataset?.graphContentReserveBottom);
        const hasRightLegendExtension = Number.isFinite(legendBaseWidth)
          && legendBaseWidth > 0
          && Number.isFinite(legendReserveWidth)
          && legendReserveWidth > 0;
        const nonLegendRightReserve = hasRightLegendExtension && Number.isFinite(contentReserveRight)
          ? Math.max(0, contentReserveRight - legendReserveWidth)
          : 0;
        // A legend is excluded from getBBox() and appended after aspect fitting, but
        // other right-side content reserves are part of the fitted content viewport.
        // Keep them in the aspect baseline so adding a legend cannot change the
        // canonical graph scale (Survival combines the risk-table label reserve with
        // a legend reserve in the same SVG envelope).
        const baseW = hasRightLegendExtension
          ? legendBaseWidth + nonLegendRightReserve
          : resolvedBaseViewport.width;
        const baseH = resolvedBaseViewport.height;
        let minX = Math.min(0, bbox.x - effectivePaddingX);
        let minY = Math.min(0, bbox.y - effectivePaddingY);
        let maxX = Math.max(minWidth, bbox.x + bbox.width + effectivePaddingX);
        let maxY = Math.max(minHeight, bbox.y + bbox.height + effectivePaddingY);
        if(Number.isFinite(baseW) && baseW > 0){
          maxX = Math.max(maxX, baseW);
        }
        if(Number.isFinite(baseH) && baseH > 0){
          maxY = Math.max(maxY, baseH);
        }
        let viewW = Math.max(1, maxX - minX);
        let viewH = Math.max(1, maxY - minY);
        const box = resizeBox;
        const dataset = box?.dataset || null;
        const aspectLocked = resizeContext.aspectLocked;
        const lockedResizeAxis = resizeContext.lockedResizeAxis;
        const resizeAxis = resizeContext.resizeAxis || lockedResizeAxis || 'both';
        const axisLockSnapshot = lockedResizeAxis ? {
          resizerAxisViewportLockAxis: lockedResizeAxis,
          resizerAxisViewportLockUntil: resizeContext.axisViewportLockUntil
        } : null;
        const stableViewBox = readStableViewBox(box);
        const stableRenderedSize = readStableRenderedSize(box);
        const lockActive = !ignoreAxisViewportLock
          && !aspectLocked
          && isOrthogonalViewportLockActive(axisLockSnapshot, resizeAxis);
        const frozenAxes = { x: false, y: false };
        const orthogonalExpansion = { x: false, y: false };
        const frozenRenderedSize = { width: false, height: false };
        if(lockActive && resizeAxis === 'y' && stableViewBox){
          minX = stableViewBox.minX;
          viewW = Math.max(1, stableViewBox.viewW);
          frozenAxes.x = true;
          orthogonalExpansion.x = false;
        }else if(lockActive && resizeAxis === 'x' && stableViewBox){
          minY = stableViewBox.minY;
          viewH = Math.max(1, stableViewBox.viewH);
          frozenAxes.y = true;
          orthogonalExpansion.y = false;
        }
        // Homogenize with box.js: keep the original rendered frame inside the
        // viewBox, then pad only if needed to preserve that frame's aspect ratio.
        // This preserves legend-side reserves even after the legend is dragged.
        const shouldPreserveBaseAspect = preserveBaseAspect !== false
          && !frozenAxes.x && !frozenAxes.y
          && Number.isFinite(baseW) && baseW > 0
          && Number.isFinite(baseH) && baseH > 0
          && Number.isFinite(viewW) && viewW > 0
          && Number.isFinite(viewH) && viewH > 0;
        if (shouldPreserveBaseAspect) {
          const baseRatio = baseW / baseH;
          const currentRatio = viewW / viewH;
          if (currentRatio > baseRatio) {
            const extra = Math.max(0, (viewW / baseRatio) - viewH);
            minY -= extra / 2;
            viewH = Math.max(1, viewH + extra);
          } else if (currentRatio < baseRatio) {
            const extra = Math.max(0, (viewH * baseRatio) - viewW);
            minX -= extra / 2;
            viewW = Math.max(1, viewW + extra);
          }
        }
        const legendScaleHeight = Number.isFinite(legendBaseWidth)
          ? Math.max(1, (Number(svg.dataset?.legendBaseHeight) || 0) + Math.max(0, contentReserveBottom || 0))
          : baseH;
        const legendViewBoxExtension = hasRightLegendExtension
          ? legendReserveWidth * (
              Number.isFinite(legendScaleHeight) && legendScaleHeight > 0
                ? viewH / legendScaleHeight
                : 1
            )
          : 0;
        if(legendViewBoxExtension > 0){
          viewW += legendViewBoxExtension;
        }
        const anchorX = Number(horizontalResizeAnchorX);
        const currentSlotSize = lockActive ? readSvgSlotSize(svg, box) : null;
        if(lockActive && resizeAxis === 'x' && stableViewBox && Number.isFinite(anchorX)){
          const currentRenderedSize = currentSlotSize || readSvgRenderedSize(svg);
          const stableRenderedWidth = Number(stableRenderedSize?.width);
          const currentRenderedWidth = Number(currentRenderedSize?.width);
          if(Number.isFinite(stableRenderedWidth) && stableRenderedWidth > 0
            && Number.isFinite(currentRenderedWidth) && currentRenderedWidth > 0
            && Number.isFinite(stableViewBox.viewW) && stableViewBox.viewW > 0){
            const renderedWidthScale = Math.abs(currentRenderedWidth - stableRenderedWidth) <= 1.5
              ? 1
              : (currentRenderedWidth / stableRenderedWidth);
            const scaledStableViewW = stableViewBox.viewW * renderedWidthScale;
            if(Number.isFinite(scaledStableViewW) && scaledStableViewW > 0){
              viewW = Math.max(viewW, scaledStableViewW);
            }
            const stableAnchorOffsetPx = ((anchorX - stableViewBox.minX) / stableViewBox.viewW) * stableRenderedWidth;
            minX = anchorX - ((stableAnchorOffsetPx / currentRenderedWidth) * viewW);
            frozenAxes.x = true;
          }
        }
        if (fill) {
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
          if(lockActive && resizeAxis === 'y' && stableRenderedSize?.width > 0){
            svg.style.width = `${stableRenderedSize.width}px`;
            frozenRenderedSize.width = true;
          }else if(lockActive && resizeAxis === 'x' && currentSlotSize?.width > 0){
            svg.style.width = `${currentSlotSize.width}px`;
            frozenRenderedSize.width = true;
          }else{
            svg.style.width = '100%';
          }
          if(lockActive && resizeAxis === 'x' && stableRenderedSize?.height > 0){
            svg.style.height = `${stableRenderedSize.height}px`;
            frozenRenderedSize.height = true;
          }else if(lockActive && resizeAxis === 'y' && currentSlotSize?.height > 0){
            svg.style.height = `${currentSlotSize.height}px`;
            frozenRenderedSize.height = true;
          }else{
            svg.style.height = '100%';
          }
          svg.style.minWidth = '0';
          svg.style.minHeight = '0';
          svg.style.display = 'block';
        }
        svg.setAttribute('viewBox', `${minX} ${minY} ${viewW} ${viewH}`);
        const preserve = preserveAspectRatio != null
          ? preserveAspectRatio
          : (shouldPreserveBaseAspect ? 'xMidYMid meet' : 'none');
        svg.setAttribute('preserveAspectRatio', preserve);
        const lockedViewBox = enforceLockedAxisViewport(svg, box, {
          minX,
          minY,
          viewW,
          viewH
        }, debugLabel);
        if(lockedViewBox){
          ({ minX, minY, viewW, viewH } = lockedViewBox);
        }
        if(dataset){
          const keepResizeAnchorBaseline = lockActive
            && resizeAxis === 'x'
            && stableViewBox
            && Number.isFinite(anchorX);
          if(!keepResizeAnchorBaseline){
            writeStableViewBox(box, { minX, minY, viewW, viewH }, debugLabel, readSvgRenderedSize(svg));
          }
        }
        const parent = svg.parentElement;
        if (parent) parent.style.overflow = 'visible';
        if (box) box.style.overflow = 'visible';
        logDebug('autoResizeSvg applied', {
          debugLabel,
          bbox,
          minX,
          minY,
          viewW,
          viewH,
          fill,
          paddingX: effectivePaddingX,
          paddingY: effectivePaddingY,
          aspectLocked,
          resizeAxis,
          lockActive,
          ignoreAxisViewportLock,
          frozenAxes,
          orthogonalExpansion,
          frozenRenderedSize,
          stableRenderedSize,
          excludedCount: excludedNodes.length,
          preserveAspectRatio: svg.getAttribute('preserveAspectRatio')
        });
        if (typeof onResize === 'function') {
          safeCall(onResize, [{ svg, bbox, viewBox: { minX, minY, viewW, viewH } }], 'Shared.autoResizeSvg onResize error');
        }
      } catch (err) {
        console.error('Shared.autoResizeSvg error', err);
      }
    };

    applyResize();
    if (remeasure && fitContent !== false) {
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
    const horizontalEdgePadding = Number(Shared.chartStyle?.GRAPH_HORIZONTAL_EDGE_PADDING_PX);
    const defaults = {
      fill: true,
      padding: 16,
      paddingX: Number.isFinite(horizontalEdgePadding) && horizontalEdgePadding >= 0 ? horizontalEdgePadding : 8,
      remeasure: true,
      preserveAspectRatio: null
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
        paddingX: payload.paddingX,
        fill: payload.fill,
        ignoreAxisViewportLock: payload.ignoreAxisViewportLock === true
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

  const DEFAULT_EMPTY_PLOT_NOTICE = 'Add data to the input table to generate a plot.';

  function getEmptyPlotNoticeMessage(message){
    const raw = message == null ? '' : String(message).trim();
    return raw || DEFAULT_EMPTY_PLOT_NOTICE;
  }

  function renderPlotNotice(target, message, options = {}){
    if(!target || typeof target.appendChild !== 'function'){
      return null;
    }
    const doc = target.ownerDocument || global.document;
    if(!doc){
      return null;
    }
    const clearChildren = options.clear !== false;
    if(clearChildren && target.childNodes){
      while(target.firstChild){
        target.removeChild(target.firstChild);
      }
    }
    if(target.style){
      if(options.resetAspect !== false){
        try{ target.style.aspectRatio = ''; }catch(err){}
        try{ target.style.padding = ''; }catch(err){}
      }
      if(options.show !== false){
        target.style.display = options.display || 'block';
      }
    }
    const safeMessage = getEmptyPlotNoticeMessage(message);
    const isSvg = target.namespaceURI === SVG_NS || String(target.tagName || '').toLowerCase() === 'svg';
    if(isSvg){
      const notice = doc.createElementNS(SVG_NS, 'text');
      notice.setAttribute('data-plot-notice', '1');
      notice.setAttribute('x', String(Number.isFinite(options.svgX) ? options.svgX : 12));
      notice.setAttribute('y', String(Number.isFinite(options.svgY) ? options.svgY : 12));
      notice.setAttribute('text-anchor', 'start');
      notice.setAttribute('dominant-baseline', 'hanging');
      notice.setAttribute('font-size', String(Number.isFinite(options.svgFontSize) ? options.svgFontSize : 16));
      notice.setAttribute('font-style', 'italic');
      notice.setAttribute('fill', options.svgFill || '#555');
      notice.textContent = safeMessage;
      target.appendChild(notice);
      return notice;
    }
    const notice = doc.createElement('i');
    notice.setAttribute('data-plot-notice', '1');
    notice.textContent = safeMessage;
    target.appendChild(notice);
    return notice;
  }

  const stagedGraphFramePublications = new Map();

  function normalizeGraphFramePublicationOwner(options = {}){
    const component = String(options.component || '').trim();
    const tabId = String(options.tabId || '').trim();
    return {
      component: component || null,
      tabId: tabId || null,
      key: component && tabId ? `${component}::${tabId}` : null
    };
  }

  function registerStagedGraphFramePublication(owner, token){
    if(!owner?.key || !token){
      return false;
    }
    let bucket = stagedGraphFramePublications.get(owner.key);
    if(!bucket){
      bucket = new Set();
      stagedGraphFramePublications.set(owner.key, bucket);
    }
    bucket.add(token);
    return true;
  }

  function unregisterStagedGraphFramePublication(owner, token){
    if(!owner?.key || !token){
      return false;
    }
    const bucket = stagedGraphFramePublications.get(owner.key);
    if(!bucket){
      return false;
    }
    const removed = bucket.delete(token);
    if(bucket.size === 0){
      stagedGraphFramePublications.delete(owner.key);
    }
    return removed;
  }

  function hasStagedGraphFramePublication(options = {}){
    const owner = normalizeGraphFramePublicationOwner(options);
    if(owner.key && (stagedGraphFramePublications.get(owner.key)?.size || 0) > 0){
      return true;
    }
    const root = options.root || options.container || null;
    if(!root?.querySelectorAll){
      return false;
    }
    return Array.from(root.querySelectorAll('[data-graph-frame-publication="staged"]')).some(node => {
      const nodeComponent = String(node?.dataset?.graphFrameComponent || '').trim();
      const nodeTabId = String(node?.dataset?.graphFrameOwnerTabId || '').trim();
      return (!owner.component || !nodeComponent || nodeComponent === owner.component)
        && (!owner.tabId || !nodeTabId || nodeTabId === owner.tabId);
    });
  }

  function getStagedGraphFramePublicationCount(options = {}){
    const owner = normalizeGraphFramePublicationOwner(options);
    if(owner.key){
      return stagedGraphFramePublications.get(owner.key)?.size || 0;
    }
    let count = 0;
    stagedGraphFramePublications.forEach(bucket => { count += bucket.size; });
    return count;
  }

  function stageGraphFrame(options = {}){
    const container = options.container || null;
    const frame = options.frame || null;
    const publishedNode = options.publishedNode || frame;
    if(!container || !frame || !publishedNode){
      throw new TypeError('Graph frame publication requires a container, frame, and published node.');
    }
    if(frame.parentNode){
      throw new Error('Graph frame must be detached before staging.');
    }
    if(publishedNode !== frame && !frame.contains(publishedNode)){
      throw new Error('Published graph node must belong to the staged frame.');
    }

    const previousNodes = Array.from(container.childNodes || []);
    const styleProperties = ['visibility', 'pointer-events', 'position', 'left', 'top', 'z-index'];
    const previousStyles = new Map(styleProperties.map(property => [
      property,
      {
        value: frame.style?.getPropertyValue?.(property) || '',
        priority: frame.style?.getPropertyPriority?.(property) || ''
      }
    ]));
    let state = 'staged';
    const publicationOwner = normalizeGraphFramePublicationOwner(options);
    const publicationToken = {};

    frame.dataset.graphFramePublication = 'staged';
    if(options.component){
      frame.dataset.graphFrameComponent = String(options.component);
    }
    if(options.tabId){
      frame.dataset.graphFrameOwnerTabId = String(options.tabId);
    }
    frame.setAttribute?.('aria-hidden', 'true');
    frame.style?.setProperty?.('visibility', 'hidden');
    frame.style?.setProperty?.('pointer-events', 'none');
    frame.style?.setProperty?.('position', 'absolute');
    frame.style?.setProperty?.('left', '0');
    frame.style?.setProperty?.('top', '0');
    frame.style?.setProperty?.('z-index', '1');
    container.appendChild(frame);
    registerStagedGraphFramePublication(publicationOwner, publicationToken);

    const restoreFrameStyles = () => {
      previousStyles.forEach((entry, property) => {
        if(entry.value){
          frame.style.setProperty(property, entry.value, entry.priority);
        }else{
          frame.style.removeProperty(property);
        }
      });
    };

    return {
      get state(){
        return state;
      },
      commit(){
        if(state !== 'staged' || frame.parentNode !== container){
          return false;
        }
        if(typeof options.canCommit === 'function' && options.canCommit() !== true){
          return false;
        }
        previousNodes.forEach(node => {
          if(node.parentNode === container){
            container.removeChild(node);
          }
        });
        if(options.publishedId){
          publishedNode.setAttribute('id', String(options.publishedId));
        }
        frame.dataset.graphFramePublication = 'committed';
        frame.removeAttribute?.('aria-hidden');
        restoreFrameStyles();
        state = 'committed';
        unregisterStagedGraphFramePublication(publicationOwner, publicationToken);
        return true;
      },
      cleanup(){
        if(state !== 'staged'){
          return false;
        }
        if(frame.parentNode === container){
          container.removeChild(frame);
        }
        state = 'discarded';
        unregisterStagedGraphFramePublication(publicationOwner, publicationToken);
        return true;
      }
    };
  }

  Shared.makeEditable = makeEditable;
  Shared.enableLabelDrag = enableLabelDrag;
  Shared.enableLegendDrag = enableLegendDrag;
  Shared.bindLegendDragInteraction = bindLegendDragInteraction;
  Shared.isManagedLegendDragTarget = isManagedLegendDragTarget;
  Shared.autoResizeSvg = autoResizeSvg;
  Shared.ensureGraphViewport = ensureGraphViewport;
  Shared.graphViewport = Shared.graphViewport || {};
  Shared.graphViewport.ensure = ensureGraphViewport;
  Shared.graphViewport.createEnsurer = createGraphViewportEnsurer;
  Shared.graphViewport.captureStableAxes = captureGraphViewportStableAxes;
  Shared.graphViewport.applyLiveResizeLock = applyLiveResizeViewportLock;
  Shared.graphViewport.enforceLockedAxisRatio = enforceLockedAxisViewport;
  Shared.serializeCleanSVG = serializeCleanSVG;
  Shared.DEFAULT_EMPTY_PLOT_NOTICE = DEFAULT_EMPTY_PLOT_NOTICE;
  Shared.getEmptyPlotNoticeMessage = getEmptyPlotNoticeMessage;
  Shared.renderPlotNotice = renderPlotNotice;
  Shared.framePublication = Shared.framePublication || {};
  Shared.framePublication.stage = stageGraphFrame;
  Shared.framePublication.hasStaged = hasStagedGraphFramePublication;
  Shared.framePublication.getStagedCount = getStagedGraphFramePublicationCount;

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
