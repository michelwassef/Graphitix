(function initTextBlockModule(global){
  const Shared = global.Shared || (global.Shared = {});
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_LINE_HEIGHT_EM = 1;
  const TITLE_ROLES = new Set(['graphTitle', 'xTitle', 'yTitle', 'zTitle', 'axis3d']);

  function normalizeText(value){
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  }

  function splitLines(value){
    const text = normalizeText(value);
    const lines = [];
    let start = 0;
    for(let index = 0; index <= text.length; index += 1){
      if(index !== text.length && text[index] !== '\n') continue;
      lines.push({ text: text.slice(start, index), start, end: index, index: lines.length });
      start = index + 1;
    }
    return lines;
  }

  function isTitleRole(role){
    return TITLE_ROLES.has(String(role || ''));
  }

  function normalizeAlignment(value, fallback = 'center'){
    if(['left', 'center', 'right'].includes(value)) return value;
    if(value === 'start') return 'left';
    if(value === 'end') return 'right';
    return fallback;
  }

  function fontSizePx(value, fallback, scale = 1){
    if(value == null || value === '') return fallback;
    const match = String(value).trim().match(/^(-?\d*\.?\d+)\s*(px|pt|em|rem)?$/i);
    if(!match) return fallback;
    const numeric = Number(match[1]);
    if(!Number.isFinite(numeric) || numeric <= 0) return fallback;
    const unit = String(match[2] || 'px').toLowerCase();
    const px = unit === 'pt'
      ? numeric * (96 / 72)
      : ((unit === 'em' || unit === 'rem') ? numeric * 16 : numeric);
    const safeScale = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1;
    return px * safeScale;
  }

  function resolveLineHeight(target, styleMap = null, options = {}){
    let baseSize = Number(options.fontSize);
    if(!Number.isFinite(baseSize) || baseSize <= 0){
      try{ baseSize = Number.parseFloat(global.getComputedStyle?.(target)?.fontSize || ''); }catch(_err){}
    }
    if(!Number.isFinite(baseSize) || baseSize <= 0){
      baseSize = Number.parseFloat(target?.getAttribute?.('font-size') || '') || 14;
    }
    let maxSize = baseSize;
    if(Array.isArray(styleMap)){
      styleMap.forEach(entry => {
        const candidate = fontSizePx(entry?.fontSize, baseSize, options.scale);
        if(candidate > maxSize) maxSize = candidate;
      });
    }
    const explicit = Number(options.lineHeight);
    return Number.isFinite(explicit) && explicit > 0 ? explicit : maxSize * DEFAULT_LINE_HEIGHT_EM;
  }

  function renderLines(target, value, renderLine, options = {}){
    if(!target || typeof target.appendChild !== 'function' || typeof renderLine !== 'function') return false;
    const text = normalizeText(value);
    if(!text.includes('\n')) return false;
    const doc = target.ownerDocument || global.document;
    if(!doc) return false;
    const ns = target.namespaceURI || SVG_NS;
    const lines = splitLines(text);
    let computedFontSize = '';
    try{ computedFontSize = global.getComputedStyle?.(target)?.fontSize || ''; }catch(_err){}
    const fontSize = Number.parseFloat(computedFontSize)
      || Number.parseFloat(target.getAttribute?.('font-size') || '')
      || 14;
    const lineHeight = resolveLineHeight(target, options.styleMap, {
      fontSize,
      lineHeight: options.lineHeight
    });
    const baseline = Number.parseFloat(target.getAttribute?.('y') || '') || 0;
    const anchor = target.getAttribute?.('text-anchor') || 'start';
    if(!target.dataset.titleTextAlign){
      target.dataset.titleTextAlign = normalizeAlignment(anchor);
    }
    if(!target.dataset.titleDefaultAlign){
      target.dataset.titleDefaultAlign = normalizeAlignment(anchor);
    }
    const fragment = doc.createDocumentFragment();

    lines.forEach(line => {
      const row = doc.createElementNS(ns, 'tspan');
      row.setAttribute('data-title-line', '1');
      row.setAttribute('data-title-line-index', String(line.index));
      row.setAttribute('data-title-line-start', String(line.start));
      row.setAttribute('data-title-line-end', String(line.end));
      row.setAttribute('x', target.getAttribute?.('x') || '0');
      row.setAttribute('y', String(baseline + line.index * lineHeight));
      row.setAttribute('text-anchor', anchor);
      renderLine(row, line, doc);
      fragment.appendChild(row);
    });

    while(target.firstChild) target.removeChild(target.firstChild);
    target.appendChild(fragment);
    if(!target.hasAttribute('data-title-anchor-x')){
      target.setAttribute('data-title-anchor-x', target.getAttribute('x') || '0');
    }
    if(!target.hasAttribute('data-title-anchor-y')){
      target.setAttribute('data-title-anchor-y', target.getAttribute('y') || '0');
    }
    target.dataset.titleLineHeight = String(lineHeight);
    target.dataset.titleBlockText = text;
    applyAlignment(target, target.dataset.titleTextAlign);
    return true;
  }

  function measureLineWidth(row, text){
    try{
      const width = Number(row.getComputedTextLength?.());
      if(Number.isFinite(width) && width >= 0) return width;
    }catch(_err){}
    try{
      const box = row.getBBox?.();
      if(Number.isFinite(Number(box?.width)) && Number(box.width) >= 0) return Number(box.width);
    }catch(_err){}
    let fontSize = Number.parseFloat(row.ownerSVGElement?.ownerDocument?.defaultView?.getComputedStyle?.(row.parentElement)?.fontSize || '') || 14;
    try{ fontSize = Number.parseFloat(global.getComputedStyle?.(row.parentElement)?.fontSize || '') || fontSize; }catch(_err){}
    return Array.from(String(text || '')).reduce((width, char) => width + (char === ' ' ? 0.33 : 0.6) * fontSize, 0);
  }

  function applyAlignment(target, alignment){
    if(!isTitleRole(target?.dataset?.fontRole)) return false;
    const token = normalizeAlignment(alignment);
    target.dataset.titleTextAlign = token;
    const rows = Array.from(target.children || []).filter(child => child.matches?.('tspan[data-title-line="1"]'));
    if(!rows.length){
      delete target.dataset.titleBlockWidth;
      return true;
    }
    const widths = rows.map(row => measureLineWidth(row, row.textContent || ''));
    const blockWidth = Math.max(0, ...widths);
    const defaultAlignment = normalizeAlignment(
      target.dataset.titleDefaultAlign || target.getAttribute('text-anchor'),
      'center'
    );
    const anchorX = Number.parseFloat(target.getAttribute('data-title-anchor-x') || target.getAttribute('x') || '0') || 0;
    const blockLeft = defaultAlignment === 'left'
      ? anchorX
      : (defaultAlignment === 'right' ? anchorX - blockWidth : anchorX - blockWidth / 2);
    const rowAnchor = token === 'left' ? 'start' : (token === 'right' ? 'end' : 'middle');
    rows.forEach((row, index) => {
      const offset = token === 'left'
        ? 0
        : (token === 'right' ? blockWidth : blockWidth / 2);
      row.setAttribute('x', String(blockLeft + offset));
      row.setAttribute('text-anchor', rowAnchor);
    });
    target.dataset.titleBlockWidth = String(blockWidth);
    return true;
  }

  function clearRenderedLines(target){
    if(!target?.dataset) return;
    delete target.dataset.titleLineHeight;
    delete target.dataset.titleBlockText;
  }

  function markDraftModified(target, owner, componentKey, reason){
    const key = String(componentKey || '').trim();
    const tabId = String(owner?.tabId || owner?.session?.tabId || '').trim();
    const markModified = global.Main?.session?.markWorkspaceTargetUserModified;
    if(!target || !key || !tabId || typeof markModified !== 'function') return false;
    return markModified.call(global.Main.session, target, String(reason || `${key}-inline-text-draft`), {
      tabId,
      componentKey: key,
      source: `${key}-inline-text-draft`,
      origin: 'user',
      affectsPayload: true
    }) === true;
  }

  Shared.textBlock = Object.freeze({
    DEFAULT_LINE_HEIGHT_EM,
    normalizeText,
    splitLines,
    isTitleRole,
    normalizeAlignment,
    resolveLineHeight,
    renderLines,
    applyAlignment,
    clearRenderedLines,
    markDraftModified
  });
})(typeof window !== 'undefined' ? window : globalThis);
