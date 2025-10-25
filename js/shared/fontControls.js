(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};

  const DEFAULT_FONTS = [
    'Inter',
    'Segoe UI',
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Cambria',
    'Garamond',
    'Palatino',
    'Courier New',
    'Fira Sans',
    'IBM Plex Sans',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Symbol'
  ];

  const styleStore = new Map();
  const svgRegistry = new WeakSet();
  const svgScopeMap = new WeakMap();
  const supportsWeakRef = typeof global.WeakRef === 'function';
  const nodeGroupStore = new Map();
  const toolbarHostMap = new Map();
  const undoManager = Shared.undoManager || null;
  let activeHost = null;

  let panelEl = null;
  let fontComboWrapper = null;
  let fontInput = null;
  let fontDatalist = null;
  let fontMenuToggle = null;
  let fontMenuPopup = null;
  let fontMenuEmptyState = null;
  let fontMenuVisible = false;
  let fontMenuCloseHandler = null;
  let formatButtonsRow = null;
  let comboMeasureEl = null;
  let widthSyncPending = false;
  let lastKnownFormatWidth = 0;
  let lastKnownComboWidth = 0;
  let colorInput = null;
  let boldToggle = null;
  let italicToggle = null;
  let underlineToggle = null;
  let subscriptToggle = null;
  let superscriptToggle = null;
  let sizeInput = null;
  let previewTextEl = null;
  let targetLabelEl = null;
  let currentTarget = null;
  let currentScope = null;
  let currentKey = null;
  let placementMonitoringAttached = false;

  const STYLE_KEYS = ['fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'fill', 'textDecoration', 'baselineShift'];
  const STYLE_ATTR_MAP = {
    fontFamily: 'font-family',
    fontWeight: 'font-weight',
    fontStyle: 'font-style',
    fontSize: 'font-size',
    fill: 'fill',
    textDecoration: 'text-decoration',
    baselineShift: 'baseline-shift'
  };
  const SCRIPT_SCALE = 0.75;

  function sanitizeInlineStyleEntry(entry){
    if(!entry || typeof entry !== 'object'){ return null; }
    const sanitized = {};
    let hasValue = false;
    STYLE_KEYS.forEach(key => {
      const value = entry[key];
      if(value !== undefined && value !== null && value !== ''){
        sanitized[key] = value;
        hasValue = true;
      }
    });
    return hasValue ? sanitized : null;
  }

  function normalizeInlineSegments(segments){
    if(!Array.isArray(segments) || !segments.length){ return []; }
    const normalized = [];
    for(let i = 0; i < segments.length; i += 1){
      const seg = segments[i];
      if(!seg || typeof seg !== 'object'){ continue; }
      const startRaw = Number(seg.start);
      const endRaw = Number(seg.end);
      const start = Number.isFinite(startRaw) && startRaw > 0 ? Math.floor(startRaw) : 0;
      const endCandidate = Number.isFinite(endRaw) && endRaw > start ? Math.floor(endRaw) : start;
      const styleSource = seg.style && typeof seg.style === 'object' ? seg.style : seg;
      const style = sanitizeInlineStyleEntry(styleSource);
      if(endCandidate > start && style){
        normalized.push({ start, end: endCandidate, style });
      }
    }
    normalized.sort((a, b) => {
      if(a.start !== b.start){ return a.start - b.start; }
      return a.end - b.end;
    });
    return normalized;
  }

  function inlineSegmentsEqual(a, b){
    const normA = normalizeInlineSegments(a);
    const normB = normalizeInlineSegments(b);
    if(normA.length !== normB.length){ return false; }
    for(let i = 0; i < normA.length; i += 1){
      const segA = normA[i];
      const segB = normB[i];
      if(segA.start !== segB.start || segA.end !== segB.end){ return false; }
      for(let j = 0; j < STYLE_KEYS.length; j += 1){
        const key = STYLE_KEYS[j];
        const valA = segA.style?.[key] || null;
        const valB = segB.style?.[key] || null;
        if(valA !== valB){ return false; }
      }
    }
    return true;
  }

  function styleHasInlineSegments(style){
    if(!style || typeof style !== 'object'){ return false; }
    return normalizeInlineSegments(style.inlineSegments || []).length > 0;
  }

  function resetInlineSegments(node){
    if(!node){ return; }
    if(!node.firstChild){ return; }
    const textValue = node.textContent || '';
    node.textContent = textValue;
    logDebug('resetInlineSegments', { textLength: textValue.length });
  }

  function applyInlineSegmentsToNode(node, segments){
    if(!node){ return; }
    const sanitized = normalizeInlineSegments(segments);
    if(!sanitized.length){
      resetInlineSegments(node);
      return;
    }
    const textValue = node.textContent || '';
    if(!textValue){
      resetInlineSegments(node);
      return;
    }
    const doc = node.ownerDocument || global.document;
    if(!doc){ return; }
    const ns = node.namespaceURI || 'http://www.w3.org/2000/svg';
    const limit = textValue.length;
    const frag = doc.createDocumentFragment();
    let cursor = 0;
    sanitized.forEach(segment => {
      const start = Math.max(0, Math.min(segment.start, limit));
      const end = Math.max(start, Math.min(segment.end, limit));
      if(end <= start){ return; }
      if(start > cursor){
        frag.appendChild(doc.createTextNode(textValue.slice(cursor, start)));
      }
      const segmentText = textValue.slice(start, end);
      const tspan = doc.createElementNS(ns, 'tspan');
      tspan.textContent = segmentText;
      STYLE_KEYS.forEach(key => {
        const attr = STYLE_ATTR_MAP[key];
        if(!attr){ return; }
        const value = segment.style?.[key];
        if(value !== undefined && value !== null && value !== ''){
          tspan.setAttribute(attr, value);
        } else {
          tspan.removeAttribute(attr);
        }
      });
      frag.appendChild(tspan);
      cursor = end;
    });
    if(cursor < limit){
      frag.appendChild(doc.createTextNode(textValue.slice(cursor)));
    }
    while(node.firstChild){ node.removeChild(node.firstChild); }
    node.appendChild(frag);
    logDebug('applyInlineSegmentsToNode', {
      textLength: textValue.length,
      segmentCount: sanitized.length
    });
  }

  function inlineStylesEqual(a, b){
    if(!a && !b){ return true; }
    if(!a || !b){ return false; }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if(keysA.length !== keysB.length){ return false; }
    for(let i = 0; i < keysA.length; i += 1){
      const key = keysA[i];
      if(a[key] !== b[key]){ return false; }
    }
    return true;
  }

  function extractInlineSegmentsFromState(state){
    if(!state || !Array.isArray(state.styleMap) || !state.styleMap.length){ return []; }
    const textValue = typeof state.inlineText === 'string' ? state.inlineText : '';
    if(textValue.length === 0){ return []; }
    const sanitizedMap = state.styleMap.map(entry => sanitizeInlineStyleEntry(entry));
    const limit = Math.min(textValue.length, sanitizedMap.length);
    const segments = [];
    let index = 0;
    while(index < limit){
      const entry = sanitizedMap[index];
      let end = index + 1;
      while(end < limit && inlineStylesEqual(entry, sanitizedMap[end])){
        end += 1;
      }
      if(entry){
        segments.push({ start: index, end, style: { ...entry } });
      }
      index = end;
    }
    return segments;
  }

  function captureInlineStateForNode(target, inlineState, meta){
    if(!target || !inlineState){ return; }
    const dataset = target.dataset || {};
    const baseSnapshot = captureStyleSnapshot(target) || {};
    if(inlineState.baseStyle && typeof inlineState.baseStyle === 'object'){
      STYLE_KEYS.forEach(key => {
        const value = inlineState.baseStyle[key];
        if(value === undefined || value === null || value === ''){
          if(baseSnapshot[key] !== undefined){ delete baseSnapshot[key]; }
        } else {
          baseSnapshot[key] = value;
        }
      });
    }
    const segments = inlineState.usingInlineSegments ? extractInlineSegmentsFromState(inlineState) : [];
    if(segments.length){
      baseSnapshot.inlineSegments = segments;
    } else {
      delete baseSnapshot.inlineSegments;
    }
    storeStyleForNode(target, baseSnapshot);
    logDebug('captureInlineStateForNode', {
      scope: dataset.fontScope || null,
      key: dataset.fontKey || null,
      segments: segments.length,
      reason: meta?.reason || 'inline-change'
    });
  }

  function captureStyleSnapshot(node){
    if(!node){ return null; }
    const snapshot = {
      fontFamily: node.getAttribute('font-family') || null,
      fontWeight: node.getAttribute('font-weight') || null,
      fontStyle: node.getAttribute('font-style') || null,
      fontSize: node.getAttribute('font-size') || null,
      fill: node.getAttribute('fill') || null,
      textDecoration: node.getAttribute('text-decoration') || null,
      baselineShift: node.getAttribute('baseline-shift') || null,
    };
    return snapshot;
  }

  function cloneStyleSnapshot(style){
    if(!style){ return null; }
    const clone = {};
    let hasValue = false;
    STYLE_KEYS.forEach(key => {
      const value = style[key];
      if(value !== undefined && value !== null && value !== ''){
        clone[key] = value;
        hasValue = true;
      }
    });
    const segments = normalizeInlineSegments(style.inlineSegments || []);
    if(segments.length){
      clone.inlineSegments = segments.map(segment => ({
        start: segment.start,
        end: segment.end,
        style: { ...segment.style }
      }));
      hasValue = true;
    }
    return hasValue ? clone : null;
  }

  function stylesAreEqual(a, b){
    if(a === b){ return true; }
    const refA = a || {};
    const refB = b || {};
    const baseEqual = STYLE_KEYS.every(key => {
      const valA = refA[key] || null;
      const valB = refB[key] || null;
      return valA === valB;
    });
    if(!baseEqual){ return false; }
    return inlineSegmentsEqual(refA.inlineSegments, refB.inlineSegments);
  }

  function inferUndoScopeForNode(node){
    if(!node || typeof node.closest !== 'function'){ return null; }
    const panel = node.closest('.panel');
    if(panel && panel.id){ return panel.id; }
    const svgbox = node.closest('.svgbox');
    if(svgbox && svgbox.id){ return svgbox.id; }
    return null;
  }

  function describeUndoTarget(node, meta){
    if(meta && meta.label){ return meta.label; }
    if(!node){ return 'font:text'; }
    const data = node.dataset || {};
    if(data.fontRole){ return `font:${data.fontRole}`; }
    if(data.fontKey){ return `font:${data.fontKey}`; }
    if(node.id){ return `font:#${node.id}`; }
    const snippet = (node.textContent || '').trim().slice(0, 32);
    if(snippet){ return `font:"${snippet}"`; }
    return `font:${node.tagName || 'text'}`;
  }

  function applyStyleSnapshot(node, snapshot){
    if(!node){ return; }
    if(!snapshot || isStyleEmpty(snapshot)){
      clearStyleFromNode(node);
    } else {
      applyStyleToNode(node, snapshot);
    }
    storeStyleForNode(node, snapshot);
    if(node === currentTarget){
      syncPanelStateFromTarget();
      updatePreviewFromInputs();
    }
  }

  function recordStyleUndo(node, prevSnapshot, nextSnapshot, meta){
    if(!node){ return; }
    const manager = Shared.undoManager || undoManager;
    if(!manager || typeof manager.record !== 'function'){ return; }
    if(stylesAreEqual(prevSnapshot, nextSnapshot)){ return; }
    const scope = inferUndoScopeForNode(node);
    const label = `font-controls:${describeUndoTarget(node, meta)}`;
    const prevClone = prevSnapshot ? { ...prevSnapshot } : null;
    const nextClone = nextSnapshot ? { ...nextSnapshot } : null;
    manager.record({
      label,
      scope,
      undo: () => {
        applyStyleSnapshot(node, prevClone);
        logDebug('undo applied for style change', { label, scope });
      },
      redo: () => {
        applyStyleSnapshot(node, nextClone);
        logDebug('redo applied for style change', { label, scope });
      }
    });
    logDebug('undo entry recorded', { label, scope });
  }

  function getInlineState(target){
    if(!target){ return null; }
    try {
      return target.__inlineEditState || null;
    } catch(err){
      console.warn('fontControls inline state access error', err);
      return null;
    }
  }

  function isInlineEditingActive(target){
    const inlineState = getInlineState(target);
    if(!inlineState){ return false; }
    const overlayAttached = inlineState.overlay && inlineState.overlay.isConnected;
    const inputActive = inlineState.input && inlineState.input.isConnected;
    const hasSelectionApi = typeof inlineState.describeSelection === 'function';
    const active = !!(overlayAttached || inputActive || hasSelectionApi);
    if(active){
      logDebug('inline editing detected for close guard', {
        overlayAttached,
        inputActive,
        hasSelectionApi
      });
    }
    return active;
  }

  function handleInlineSelectionPatch(patch, meta){
    if(!currentTarget){ return { handled: false }; }
    const inlineState = getInlineState(currentTarget);
    if(!inlineState){ return { handled: false }; }
    if(typeof inlineState.describeSelection === 'function'){
      const selectionInfo = inlineState.describeSelection();
      if(!selectionInfo?.hasSelection){
        return { handled: false };
      }
      if(selectionInfo.isFullRange){
        logDebug('inline selection full range detected', {
          meta,
          length: selectionInfo.length
        });
      }
    }
    if(typeof inlineState.applyStylePatchToSelection === 'function'){
      const result = inlineState.applyStylePatchToSelection(patch || {});
      if(result?.handled){
        logDebug('inline selection patch applied', {
          meta,
          patchKeys: Object.keys(patch || {})
        });
        return {
          handled: true,
          partial: !!result.partial,
          entire: !!result.entire
        };
      }
      if(result?.entire){
        return { handled: false, entire: true };
      }
    }
    return { handled: false };
  }

  function logDebug(label, payload){
    try {
      console.debug(`Debug: fontControls ${label}`, payload); // Debug: font control trace
    } catch(err) {
      // Logging failures should never break execution.
    }
  }

  function ensureComboMeasureElement(doc){
    const referenceDoc = doc || global.document;
    if(!referenceDoc){ return null; }
    if(comboMeasureEl && comboMeasureEl.ownerDocument !== referenceDoc){
      if(comboMeasureEl.remove){ comboMeasureEl.remove(); }
      comboMeasureEl = null;
    }
    if(comboMeasureEl && comboMeasureEl.isConnected){ return comboMeasureEl; }
    comboMeasureEl = referenceDoc.createElement('span');
    comboMeasureEl.className = 'font-controls-panel__combo-measure';
    comboMeasureEl.setAttribute('aria-hidden', 'true');
    if(referenceDoc.body){ referenceDoc.body.appendChild(comboMeasureEl); }
    logDebug('combo measure ready', {});
    return comboMeasureEl;
  }

  function computeComboFieldWidth(){
    if(!fontInput){ return lastKnownComboWidth || 0; }
    const doc = fontInput.ownerDocument || global.document;
    if(!doc){ return lastKnownComboWidth || 0; }
    const measure = ensureComboMeasureElement(doc);
    if(!measure){ return lastKnownComboWidth || 0; }
    if(!measure.isConnected && doc.body){
      doc.body.appendChild(measure);
    }
    const view = doc.defaultView || global;
    const computed = typeof view.getComputedStyle === 'function' ? view.getComputedStyle(fontInput) : null;
    if(!computed){ return lastKnownComboWidth || 0; }
    measure.style.fontFamily = computed.fontFamily;
    measure.style.fontSize = computed.fontSize;
    measure.style.fontWeight = computed.fontWeight;
    measure.style.fontStyle = computed.fontStyle;
    measure.style.letterSpacing = computed.letterSpacing;
    measure.style.fontVariant = computed.fontVariant;
    measure.style.textTransform = computed.textTransform;
    let maxTextWidth = 0;
    const seen = new Set();
    const recordLabel = (raw) => {
      const label = (raw || '').trim();
      if(!label || seen.has(label)){ return; }
      seen.add(label);
      measure.textContent = label;
      const rect = measure.getBoundingClientRect();
      if(rect.width > maxTextWidth){
        maxTextWidth = rect.width;
      }
    };
    if(fontMenuPopup){
      const buttons = fontMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
      buttons.forEach(btn => recordLabel(btn.dataset?.label || btn.textContent || ''));
    }
    if(fontDatalist){
      const options = fontDatalist.querySelectorAll('option');
      options.forEach(opt => recordLabel(opt.label || opt.value || ''));
    }
    if(!seen.size){
      recordLabel(fontInput.placeholder || '');
    }
    measure.textContent = '';
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    const paddingRight = parseFloat(computed.paddingRight) || 0;
    const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
    const borderRight = parseFloat(computed.borderRightWidth) || 0;
    const total = maxTextWidth + paddingLeft + paddingRight + borderLeft + borderRight;
    if(total > 0){
      lastKnownComboWidth = Math.ceil(total);
    }
    logDebug('combo width measured', {
      width: lastKnownComboWidth,
      candidates: seen.size
    });
    return lastKnownComboWidth;
  }

  function resolveFormatRowWidth(){
    if(!formatButtonsRow){ return lastKnownFormatWidth || 0; }
    const rect = formatButtonsRow.getBoundingClientRect();
    if(rect.width > 0){
      lastKnownFormatWidth = Math.ceil(rect.width);
      logDebug('format row width measured', { width: lastKnownFormatWidth });
      return lastKnownFormatWidth;
    }
    const doc = formatButtonsRow.ownerDocument || global.document;
    if(!doc){ return lastKnownFormatWidth || 0; }
    const view = doc.defaultView || global;
    const computed = typeof view.getComputedStyle === 'function' ? view.getComputedStyle(formatButtonsRow) : null;
    const gap = computed ? (parseFloat(computed.gap) || 0) : 0;
    const child = formatButtonsRow.querySelector('.font-controls-panel__format-button');
    let buttonWidth = 0;
    if(child){
      const buttonRect = child.getBoundingClientRect();
      if(buttonRect.width > 0){
        buttonWidth = buttonRect.width;
      } else if(computed && typeof view.getComputedStyle === 'function'){
        const childStyle = view.getComputedStyle(child);
        buttonWidth = parseFloat(childStyle.width) || 34;
      } else {
        buttonWidth = 34;
      }
    }
    const count = formatButtonsRow.children ? formatButtonsRow.children.length : 0;
    if(count && buttonWidth){
      const computedWidth = (buttonWidth * count) + Math.max(0, count - 1) * gap;
      lastKnownFormatWidth = Math.ceil(computedWidth);
      logDebug('format row fallback width', {
        width: lastKnownFormatWidth,
        count,
        gap,
        buttonWidth
      });
    }
    return lastKnownFormatWidth || 0;
  }

  function applyFontToolbarWidth(reason){
    const comboWidth = computeComboFieldWidth();
    const formatWidth = resolveFormatRowWidth();
    const fieldWidth = Math.max(comboWidth || 0, formatWidth || 0);
    if(fieldWidth && fontComboWrapper && fontInput){
      const px = `${fieldWidth}px`;
      fontComboWrapper.style.minWidth = px;
      fontComboWrapper.style.maxWidth = px;
      fontComboWrapper.style.width = px;
      fontInput.style.minWidth = px;
      fontInput.style.width = px;
    }
    if(panelEl && panelEl.dataset.open === '1'){ 
      const host = panelEl.parentElement && panelEl.parentElement.classList && panelEl.parentElement.classList.contains('font-toolbar-host') ? panelEl.parentElement : activeHost;
      if(host){
        const rect = panelEl.getBoundingClientRect();
        if(rect.width > 0){
          const dock = host.closest('.workspace-toolbar__dock');
          const widthPx = `${Math.ceil(rect.width)}px`;
          host.style.minWidth = widthPx;
          host.style.maxWidth = widthPx;
          host.style.width = widthPx;
          if(dock){
            dock.style.minWidth = widthPx;
            dock.style.maxWidth = widthPx;
            dock.style.width = widthPx;
          }
          logDebug('toolbar dock width applied', {
            reason,
            panelWidth: Math.ceil(rect.width),
            fieldWidth
          });
        }
      }
    } else {
      logDebug('toolbar dock width skipped', {
        reason,
        panelOpen: panelEl ? panelEl.dataset.open : '0',
        fieldWidth
      });
    }
  }

  function scheduleFontToolbarWidthSync(reason){
    if(widthSyncPending){ return; }
    widthSyncPending = true;
    const scheduler = typeof global.requestAnimationFrame === 'function'
      ? global.requestAnimationFrame.bind(global)
      : (cb) => { return global.setTimeout(cb, 16); };
    scheduler(() => {
      widthSyncPending = false;
      applyFontToolbarWidth(reason);
    });
    logDebug('toolbar width sync scheduled', { reason });
  }

  function ensurePlacementMonitoring(){
    if(placementMonitoringAttached){ return; }
    placementMonitoringAttached = true;
    logDebug('viewport monitoring skipped; toolbar anchored', { anchored: true });
  }

  function updateFloatingState(trigger){
    if(!panelEl || panelEl.dataset.open !== '1'){ return; }
    const hostScope = activeHost?.dataset?.fontToolbarScope || null;
    logDebug('anchored toolbar check', { trigger, hostScope });
  }

  function exitFloatingMode(meta){
    if(!panelEl){ return; }
    panelEl.classList.remove('font-controls-panel--floating');
    panelEl.style.removeProperty('transform');
    panelEl.style.removeProperty('left');
    panelEl.style.removeProperty('top');
    logDebug('floating mode exited', {
      trigger: meta?.trigger || 'close',
      anchored: !!activeHost
    });
  }

  function clampFontSizeDuringInput(value){
    if(value === null || typeof value === 'undefined'){ return ''; }
    const raw = String(value);
    const sanitized = raw.replace(/[^0-9.]/g, '');
    const segments = sanitized.split('.');
    const integerPart = segments.shift() || '';
    let decimalPart = segments.join('');
    const hadDot = sanitized.includes('.');
    const endsWithDot = sanitized.endsWith('.');
    decimalPart = decimalPart.slice(0, 2);
    let result = integerPart;
    if(decimalPart){
      result += `.${decimalPart}`;
    } else if(hadDot && endsWithDot && integerPart){
      result += '.';
    }
    if(result !== raw){
      logDebug('font size input clamped', { raw, result });
    }
    return result;
  }

  function normalizeFontSizeValue(value, meta){
    if(value === null || typeof value === 'undefined'){ return ''; }
    const trimmed = String(value).trim();
    if(!trimmed){ return ''; }
    const numeric = parseFloat(trimmed);
    if(!Number.isFinite(numeric)){ return trimmed; }
    const rounded = Math.round(numeric * 100) / 100;
    const fixed = rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*?)0+$/, '$1');
    logDebug('font size normalized', {
      raw: value,
      rounded: fixed,
      source: meta?.source || 'normalize'
    });
    return fixed;
  }

  function resolveToolbarHost(scopeId){
    if(!global.document){ return null; }
    const doc = global.document;
    const key = scopeId || '__global__';
    if(toolbarHostMap.has(key)){
      return toolbarHostMap.get(key);
    }
    const preferredAnchorId = scopeId ? `${scopeId}FontHost` : null;
    let button = null;
    if(preferredAnchorId){
      const preferredAnchor = doc.getElementById(preferredAnchorId);
      if(preferredAnchor){
        button = preferredAnchor;
        logDebug('resolveToolbarHost preferred anchor match', { scopeId: key, anchorId: preferredAnchorId });
      }
    }
    const buttonId = !button && scopeId ? `${scopeId}LoadExample` : null;
    if(!button && buttonId){
      button = doc.getElementById(buttonId);
    }
    if(!button && scopeId){
      const fallbackIds = [];
      if(scopeId === 'venn'){ fallbackIds.push('sample'); }
      fallbackIds.push(`${scopeId}Example`, `${scopeId}Sample`, `${scopeId}FontHost`);
      for(let i = 0; i < fallbackIds.length && !button; i += 1){
        const candidateId = fallbackIds[i];
        if(!candidateId){ continue; }
        const candidate = doc.getElementById(candidateId);
        if(candidate){
          button = candidate;
          logDebug('resolveToolbarHost fallback match', { scopeId: key, candidateId });
        }
      }
    }
    if(!button && scopeId){
      const dataHost = doc.querySelector(`[data-font-toolbar-scope="${key}"]`);
      if(dataHost){
        button = dataHost;
        logDebug('resolveToolbarHost data attribute host match', { scopeId: key });
      }
    }
    if(!button){
      logDebug('resolveToolbarHost missing button', { scopeId: key, buttonId });
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    toolbarHostMap.set(key, host);
    logDebug('toolbar host created', { scopeId: key, buttonId });
    return host;
  }

  function updateDockActiveState(host, shouldActivate){
    if(!host || !host.parentElement){ return; }
    const dock = host.parentElement;
    if(!dock.classList || !dock.classList.contains('workspace-toolbar__dock')){ return; }
    if(shouldActivate){
      dock.classList.add('workspace-toolbar__dock--active');
      return;
    }
    const hasVisibleHost = dock.querySelector('.font-toolbar-host.font-toolbar-host--visible');
    if(!hasVisibleHost){
      dock.classList.remove('workspace-toolbar__dock--active');
    }
  }

  function showToolbarHost(host){
    if(!host){ return; }
    host.style.display = 'block';
    host.classList.add('font-toolbar-host--visible');
    updateDockActiveState(host, true);
    logDebug('toolbar host shown', { scopeId: host.dataset?.fontToolbarScope || null });
  }

  function hideToolbarHost(host){
    if(!host){ return; }
    host.classList.remove('font-toolbar-host--visible');
    host.style.display = 'none';
    host.style.removeProperty('min-width');
    host.style.removeProperty('max-width');
    host.style.removeProperty('width');
    const dock = host.closest('.workspace-toolbar__dock');
    if(dock){
      dock.style.removeProperty('min-width');
      dock.style.removeProperty('max-width');
      dock.style.removeProperty('width');
    }
    updateDockActiveState(host, false);
    logDebug('toolbar host hidden', { scopeId: host.dataset?.fontToolbarScope || null });
  }

  function syncFontInputValue(rawValue, meta){
    if(!fontInput){ return; }
    const sanitized = (rawValue || '').replace(/"/g, '').trim();
    if(fontInput.value !== sanitized){
      fontInput.value = sanitized;
    }
    if(fontInput.hasAttribute('title')){
      fontInput.removeAttribute('title');
    }
    highlightFontMenuSelection(sanitized);
    logDebug('font input sync', {
      value: sanitized || null,
      source: meta?.source || 'sync'
    });
  }

  function getVisibleFontMenuOptions(){
    if(!fontMenuPopup){ return []; }
    const nodes = fontMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
    return Array.from(nodes).filter(node => node.dataset.hidden !== '1' && !node.hidden);
  }

  function getActiveFontMenuOption(){
    if(!fontMenuPopup){ return null; }
    const active = fontMenuPopup.querySelector('.font-controls-panel__combo-option--active');
    if(active && active.dataset.hidden !== '1' && !active.hidden){
      return active;
    }
    return null;
  }

  function focusRelativeFontOption(current, delta){
    if(!fontMenuPopup){ return; }
    const visible = getVisibleFontMenuOptions();
    if(!visible.length){ return; }
    const index = visible.indexOf(current);
    let nextIndex = index;
    if(index === -1){
      nextIndex = delta > 0 ? 0 : visible.length - 1;
    } else {
      nextIndex = Math.max(0, Math.min(visible.length - 1, index + delta));
    }
    const target = visible[nextIndex];
    if(target){
      target.focus();
    }
  }

  function focusFirstFontOption(){
    const visible = getVisibleFontMenuOptions();
    if(visible.length){
      visible[0].focus();
    }
  }

  function focusLastFontOption(){
    const visible = getVisibleFontMenuOptions();
    if(visible.length){
      visible[visible.length - 1].focus();
    }
  }

  function highlightFontMenuSelection(value){
    if(!fontMenuPopup){ return; }
    const normalized = (value || '').trim().toLowerCase();
    const options = fontMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
    options.forEach(option => {
      const optionValue = (option.dataset.value || '').trim().toLowerCase();
      const isActive = optionValue === normalized && (option.dataset.value || '') === (value || '');
      option.classList.toggle('font-controls-panel__combo-option--active', isActive);
      option.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if(isActive && fontMenuVisible && typeof option.scrollIntoView === 'function'){
        option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }

  function filterFontMenuOptions(query){
    if(!fontMenuPopup){ return; }
    const normalized = (query || '').trim().toLowerCase();
    const options = fontMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
    let matches = 0;
    options.forEach(option => {
      const valueText = (option.dataset.value || '').toLowerCase();
      const labelText = (option.dataset.label || '').toLowerCase();
      const keep = !normalized || option.dataset.value === '' || valueText.includes(normalized) || labelText.includes(normalized);
      option.hidden = !keep;
      option.dataset.hidden = keep ? '0' : '1';
      if(keep){
        matches += 1;
      }
    });
    if(fontMenuEmptyState){
      fontMenuEmptyState.hidden = matches > 0;
    }
    logDebug('font menu filtered', {
      query: normalized || null,
      matches
    });
  }

  function detachFontMenuDismissWatcher(){
    if(!fontMenuCloseHandler || !global.document){ return; }
    global.document.removeEventListener('pointerdown', fontMenuCloseHandler, true);
    fontMenuCloseHandler = null;
  }

  function attachFontMenuDismissWatcher(){
    if(fontMenuCloseHandler || !global.document){ return; }
    const doc = global.document;
    fontMenuCloseHandler = (evt) => {
      if(!fontMenuVisible){ return; }
      if(!fontComboWrapper){ return; }
      const target = evt.target;
      if(fontComboWrapper.contains(target)){ return; }
      closeFontMenu('outside');
    };
    doc.addEventListener('pointerdown', fontMenuCloseHandler, true);
  }

  function openFontMenu(trigger, meta){
    if(!fontMenuPopup || fontMenuVisible){ return; }
    fontMenuPopup.hidden = false;
    fontMenuPopup.classList.add('font-controls-panel__combo-menu--open');
    fontMenuVisible = true;
    if(fontMenuToggle){
      fontMenuToggle.setAttribute('aria-expanded', 'true');
    }
    if(fontInput){
      fontInput.setAttribute('aria-expanded', 'true');
    }
    filterFontMenuOptions(fontInput?.value || '');
    highlightFontMenuSelection(fontInput?.value || '');
    attachFontMenuDismissWatcher();
    const focusMode = meta?.focusOption || null;
    if(focusMode){
      const focusTask = () => {
        if(focusMode === 'first'){
          focusFirstFontOption();
        } else if(focusMode === 'last'){
          focusLastFontOption();
        } else if(focusMode === 'active'){
          const active = getActiveFontMenuOption();
          if(active){
            active.focus();
          } else {
            focusFirstFontOption();
          }
        }
      };
      setTimeout(focusTask, 0);
    }
    logDebug('font menu opened', {
      trigger: trigger || 'unknown',
      focusMode
    });
  }

  function closeFontMenu(reason){
    if(!fontMenuPopup || !fontMenuVisible){ return; }
    fontMenuPopup.hidden = true;
    fontMenuPopup.classList.remove('font-controls-panel__combo-menu--open');
    fontMenuVisible = false;
    if(fontMenuToggle){
      fontMenuToggle.setAttribute('aria-expanded', 'false');
    }
    if(fontInput){
      fontInput.setAttribute('aria-expanded', 'false');
    }
    detachFontMenuDismissWatcher();
    if(reason !== 'button-toggle'){ // keep input focus for toggle interactions
      highlightFontMenuSelection(fontInput?.value || '');
    }
    logDebug('font menu closed', {
      reason: reason || 'unknown'
    });
  }

  function toggleFontMenu(trigger, meta){
    if(fontMenuVisible){
      closeFontMenu(trigger || 'toggle');
    } else {
      openFontMenu(trigger || 'toggle', meta);
    }
  }

  function humanizeToken(token){
    if(!token){ return null; }
    const cleaned = String(token)
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if(!cleaned){ return null; }
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function updatePanelContext(){
    if(!targetLabelEl){ return; }
    const parts = [];
    if(currentTarget){
      const role = humanizeToken(currentTarget.dataset?.fontRole || currentTarget.dataset?.fontKey);
      const scope = humanizeToken(currentTarget.dataset?.fontScope);
      const rawText = (currentTarget.textContent || '').trim();
      if(role){ parts.push(role); }
      if(scope && scope !== role){ parts.push(scope); }
      if(rawText){
        const snippet = rawText.length > 26 ? `${rawText.slice(0, 26)}…` : rawText;
        parts.push(`“${snippet}”`);
      }
    }
    const description = parts.length ? parts.join(' • ') : 'Select text to edit';
    targetLabelEl.textContent = description;
    logDebug('panel context refreshed', { description });
  }

  function updatePreviewText(){
    if(!previewTextEl){ return; }
    const content = (currentTarget?.textContent || '').trim();
    previewTextEl.textContent = content || 'AaBbCc 123';
    logDebug('preview text refreshed', { sample: previewTextEl.textContent });
  }

  function updatePreviewFromInputs(){
    if(!previewTextEl){ return; }
    const fontFamilyRaw = fontInput?.value?.trim() || '';
    const weightActive = boldToggle?.dataset?.active === '1';
    const italicActive = italicToggle?.dataset?.active === '1';
    const underlineActive = underlineToggle?.dataset?.active === '1';
    const subscriptActive = subscriptToggle?.dataset?.active === '1';
    const superscriptActive = superscriptToggle?.dataset?.active === '1';
    const sizeValue = sizeInput?.value?.trim();
    const colorValue = colorInput?.value || '#0f172a';
    let explicitSize = null;
    if(sizeValue){
      const numericSize = parseFloat(sizeValue);
      if(Number.isFinite(numericSize)){
        explicitSize = numericSize;
      }
    }
    let basePreviewSize = explicitSize;
    if(!Number.isFinite(basePreviewSize)){
      const computedPreview = parseFloat(global.getComputedStyle(previewTextEl).fontSize || '');
      basePreviewSize = Number.isFinite(computedPreview) ? computedPreview : 14;
    }
    const baselineMode = subscriptActive ? 'sub' : (superscriptActive ? 'super' : 'baseline');
    let appliedSize = basePreviewSize;
    if(baselineMode !== 'baseline'){
      appliedSize = Math.max(1, Math.round(basePreviewSize * SCRIPT_SCALE * 100) / 100);
    }
    previewTextEl.style.fontFamily = fontFamilyRaw || '';
    previewTextEl.style.fontWeight = weightActive ? '700' : '400';
    previewTextEl.style.fontStyle = italicActive ? 'italic' : 'normal';
    previewTextEl.style.fontSize = `${appliedSize}px`;
    previewTextEl.style.color = colorValue;
    previewTextEl.style.textDecoration = underlineActive ? 'underline' : 'none';
    previewTextEl.style.fontVariantPosition = baselineMode === 'baseline' ? 'normal' : baselineMode;
    previewTextEl.style.position = baselineMode === 'baseline' ? 'static' : 'relative';
    if(baselineMode === 'sub'){
      previewTextEl.style.top = '0.25em';
    } else if(baselineMode === 'super'){
      previewTextEl.style.top = '-0.25em';
    } else {
      previewTextEl.style.top = '0';
    }
    if(baselineMode === 'baseline'){
      previewTextEl.removeAttribute('data-baseline-shift');
    } else {
      previewTextEl.setAttribute('data-baseline-shift', baselineMode);
    }
    logDebug('preview style refreshed', {
      fontFamily: fontFamilyRaw || null,
      weightActive,
      italicActive,
      underlineActive,
      baselineMode,
      size: `${appliedSize}px`,
      color: colorValue
    });
  }

  function setToggleState(btn, active){
    if(!btn){ return; }
    const isActive = !!active;
    btn.dataset.active = isActive ? '1' : '0';
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.classList.toggle('font-controls-panel__toggle--active', isActive);
  }

  function buildStoreKey(scopeId, key){
    const scope = scopeId || '__global__';
    const token = key || '__default__';
    return `${scope}::${token}`;
  }

  function sanitizeStoreToken(token){
    if(!token){ return '__default__'; }
    const normalized = String(token);
    return normalized.includes('::') ? normalized.replace(/::/g, '__') : normalized;
  }

  function parseColorToHex(color){
    if(!color){ return '#000000'; }
    const trimmed = String(color).trim();
    if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)){
      if(trimmed.length === 4){
        return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
      }
      return trimmed.toLowerCase();
    }
    const rgbMatch = trimmed.match(/^rgba?\((\d+),(\d+),(\d+)/i);
    if(rgbMatch){
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
      const hex = [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
      return `#${hex}`;
    }
    // Fallback: attempt to resolve via a temporary element.
    try {
      const doc = global.document;
      if(!doc) return '#000000';
      const helper = doc.createElement('span');
      helper.style.color = trimmed;
      doc.body.appendChild(helper);
      const computed = global.getComputedStyle(helper).color;
      doc.body.removeChild(helper);
      return parseColorToHex(computed);
    } catch(resolveErr){
      logDebug('parseColor fallback error', { color, resolveErr });
      return '#000000';
    }
  }

  function applyStyleToNode(node, style){
    if(!node || !style){ return; }
    if(style.fontFamily){
      node.setAttribute('font-family', style.fontFamily);
    } else {
      node.removeAttribute('font-family');
    }
    if(style.fontWeight){
      node.setAttribute('font-weight', style.fontWeight);
    } else {
      node.removeAttribute('font-weight');
    }
    if(style.fontStyle){
      node.setAttribute('font-style', style.fontStyle);
    } else {
      node.removeAttribute('font-style');
    }
    if(style.fontSize){
      node.setAttribute('font-size', style.fontSize);
    } else {
      node.removeAttribute('font-size');
    }
    if(style.fill){
      node.setAttribute('fill', style.fill);
    } else if(node.hasAttribute('fill')){
      node.removeAttribute('fill');
    }
    if(style.textDecoration){
      node.setAttribute('text-decoration', style.textDecoration);
    } else {
      node.removeAttribute('text-decoration');
    }
    if(style.baselineShift){
      node.setAttribute('baseline-shift', style.baselineShift);
    } else {
      node.removeAttribute('baseline-shift');
    }
    if(styleHasInlineSegments(style)){
      applyInlineSegmentsToNode(node, style.inlineSegments);
    } else {
      resetInlineSegments(node);
    }
    logDebug('applyStyleToNode', {
      text: node?.textContent,
      scope: node?.dataset?.fontScope || null,
      key: node?.dataset?.fontKey || null,
      hasInlineSegments: styleHasInlineSegments(style),
      style
    });
  }

  function isStyleEmpty(style){
    if(!style){ return true; }
    const baseEmpty = STYLE_KEYS.every(key => {
      const value = style[key];
      return value === undefined || value === null || value === '';
    });
    if(!baseEmpty){ return false; }
    return !styleHasInlineSegments(style);
  }

  function clearStyleFromNode(node){
    if(!node){ return; }
    node.removeAttribute('font-family');
    node.removeAttribute('font-weight');
    node.removeAttribute('font-style');
    node.removeAttribute('font-size');
    node.removeAttribute('fill');
    node.removeAttribute('text-decoration');
    node.removeAttribute('baseline-shift');
    resetInlineSegments(node);
    logDebug('clearStyleFromNode', {
      text: node?.textContent,
      scope: node?.dataset?.fontScope || null,
      key: node?.dataset?.fontKey || null
    });
  }

  function cleanupWeakRefs(entry){
    if(!entry || !Array.isArray(entry.refs)){ return; }
    entry.refs = entry.refs.filter(ref => {
      const node = ref?.deref?.();
      return !!node;
    });
  }

  function registerNodeForKey(node, storeKey){
    if(!node || !storeKey){ return; }
    let entry = nodeGroupStore.get(storeKey);
    if(!entry){
      entry = supportsWeakRef ? { refs: [], cleanupCounter: 0 } : { nodes: new Set() };
      nodeGroupStore.set(storeKey, entry);
    }
    if(supportsWeakRef){
      entry.refs.push(new global.WeakRef(node));
      entry.cleanupCounter = (entry.cleanupCounter || 0) + 1;
      if(entry.cleanupCounter >= 20){
        cleanupWeakRefs(entry);
        entry.cleanupCounter = 0;
        logDebug('registerNodeForKey cleanup', { storeKey, remaining: entry.refs.length });
      }
    } else {
      entry.nodes.add(node);
    }
  }

  function broadcastStyle(storeKey, style, sourceNode){
    if(!storeKey){ return; }
    const entry = nodeGroupStore.get(storeKey);
    if(!entry){ return; }
    if(supportsWeakRef){
      entry.refs = entry.refs.filter(ref => {
        const node = ref?.deref?.();
        if(!node){ return false; }
        if(node !== sourceNode){
          if(style && !isStyleEmpty(style)){
            applyStyleToNode(node, style);
          } else {
            clearStyleFromNode(node);
          }
        }
        return true;
      });
    } else {
      const stale = [];
      entry.nodes.forEach(node => {
        if(!node || !node.isConnected){
          stale.push(node);
          return;
        }
        if(node === sourceNode){ return; }
        if(style && !isStyleEmpty(style)){
          applyStyleToNode(node, style);
        } else {
          clearStyleFromNode(node);
        }
      });
      stale.forEach(node => entry.nodes.delete(node));
    }
    logDebug('broadcastStyle', { storeKey, hasStyle: !isStyleEmpty(style || null) });
  }

  function storeStyleForNode(node, style){
    if(!node){ return; }
    const scope = node.dataset?.fontScope || null;
    const key = node.dataset?.fontKey || null;
    const dataset = node.dataset || {};
    const explicitEditable = dataset.fontEditable === '1';
    if(!explicitEditable && !scope && !key){
      logDebug('storeStyleForNode skipped (no scope/key for implicit node)', {
        text: node.textContent,
        hasDataset: !!dataset,
      });
      return;
    }
    const storeKey = buildStoreKey(scope, key);
    const normalized = cloneStyleSnapshot(style);
    if(!normalized){
      styleStore.delete(storeKey);
      broadcastStyle(storeKey, null, node);
      logDebug('storeStyleForNode cleared', { scope, key });
    } else {
      styleStore.set(storeKey, normalized);
      broadcastStyle(storeKey, normalized, node);
      logDebug('storeStyleForNode saved', {
        scope,
        key,
        style: normalized,
        hasInlineSegments: styleHasInlineSegments(normalized)
      });
    }
  }

  function exportScopeStyles(scopeId){
    const scope = scopeId || '__global__';
    const prefix = `${scope}::`;
    const payload = {};
    let count = 0;
    styleStore.forEach((style, storeKey) => {
      if(!storeKey || !storeKey.startsWith(prefix)){ return; }
      const token = storeKey.slice(prefix.length) || '__default__';
      const snapshot = cloneStyleSnapshot(style);
      if(!snapshot){ return; }
      payload[token] = snapshot;
      count += 1;
    });
    if(!count){
      logDebug('exportScopeStyles skipped (empty)', { scope });
      return null;
    }
    logDebug('exportScopeStyles captured', { scope, count });
    return payload;
  }

  function importScopeStyles(scopeId, styles, options){
    const scope = scopeId || '__global__';
    const prefix = `${scope}::`;
    const opts = options || {};
    const incoming = (styles && typeof styles === 'object') ? styles : null;
    const keep = new Set();
    if(incoming){
      Object.keys(incoming).forEach(key => {
        const token = sanitizeStoreToken(key);
        const storeKey = `${prefix}${token}`;
        const snapshot = cloneStyleSnapshot(incoming[key]);
        keep.add(storeKey);
        if(snapshot){
          styleStore.set(storeKey, snapshot);
          if(opts.broadcast !== false){
            broadcastStyle(storeKey, snapshot, null);
          }
          logDebug('importScopeStyles applied', { scope, token });
        } else {
          styleStore.delete(storeKey);
          if(opts.broadcast !== false){
            broadcastStyle(storeKey, null, null);
          }
          logDebug('importScopeStyles cleared empty style', { scope, token });
        }
      });
    }
    if(opts.prune !== false){
      const stale = [];
      styleStore.forEach((_, storeKey) => {
        if(storeKey && storeKey.startsWith(prefix) && !keep.has(storeKey)){
          stale.push(storeKey);
        }
      });
      stale.forEach(storeKey => {
        styleStore.delete(storeKey);
        if(opts.broadcast !== false){
          broadcastStyle(storeKey, null, null);
        }
        logDebug('importScopeStyles pruned stale style', { scope, storeKey });
      });
    }
    logDebug('importScopeStyles complete', {
      scope,
      imported: incoming ? Object.keys(incoming).length : 0,
      pruned: opts.prune === false ? 0 : undefined
    });
  }

  function storeCurrentStyle(style){
    if(!currentTarget){ return; }
    storeStyleForNode(currentTarget, style);
  }

  function syncPanelStateFromTarget(){
    if(!panelEl || !currentTarget){ return; }
    const computed = global.getComputedStyle(currentTarget);
    const attrFamily = currentTarget.getAttribute('font-family') || computed.fontFamily || '';
    const attrWeight = currentTarget.getAttribute('font-weight') || computed.fontWeight || '';
    const attrStyle = currentTarget.getAttribute('font-style') || computed.fontStyle || '';
    const attrSize = currentTarget.getAttribute('font-size') || computed.fontSize || '';
    const attrFill = currentTarget.getAttribute('fill') || computed.fill || '#000000';
    const attrDecoration = currentTarget.getAttribute('text-decoration') || computed.textDecoration || '';
    const attrBaseline = currentTarget.getAttribute('baseline-shift') || computed.baselineShift || '';
    const sanitizedFamily = attrFamily.replace(/"/g, '').trim();
    syncFontInputValue(sanitizedFamily, { source: 'target-sync' });
    if(colorInput){
      colorInput.value = parseColorToHex(attrFill);
    }
    if(sizeInput){
      const sizeNum = parseFloat(String(attrSize).replace(/px$/, ''));
      sizeInput.value = Number.isFinite(sizeNum) ? normalizeFontSizeValue(sizeNum, { source: 'target-sync' }) : '';
    }
    const boldActive = /bold|700|800|900/.test(String(attrWeight));
    setToggleState(boldToggle, boldActive);
    const italicActive = /italic|oblique/.test(String(attrStyle));
    setToggleState(italicToggle, italicActive);
    const underlineActive = /underline/.test(String(attrDecoration));
    setToggleState(underlineToggle, underlineActive);
    const baselineToken = String(attrBaseline).toLowerCase();
    const subActive = baselineToken.includes('sub');
    const superActive = baselineToken.includes('super') && !subActive;
    setToggleState(subscriptToggle, subActive);
    setToggleState(superscriptToggle, superActive);
    updatePanelContext();
    updatePreviewText();
    updatePreviewFromInputs();
    logDebug('syncPanelStateFromTarget', {
      text: currentTarget.textContent,
      fontFamily: fontInput?.value || null,
      fill: colorInput?.value || null,
      bold: boldToggle?.dataset?.active === '1',
      italic: italicToggle?.dataset?.active === '1',
      underline: underlineToggle?.dataset?.active === '1',
      baselineShift: subscriptToggle?.dataset?.active === '1' ? 'sub' : (superscriptToggle?.dataset?.active === '1' ? 'super' : 'baseline')
    });
  }

  function ensurePanel(){
    if(panelEl || !global.document){ return panelEl; }
    const doc = global.document;
    panelEl = doc.createElement('div');
    panelEl.className = 'font-controls-panel';
    panelEl.setAttribute('role', 'toolbar');
    panelEl.setAttribute('aria-label', 'Font controls');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.hidden = true;
    if(panelEl.dataset.scope){
      delete panelEl.dataset.scope;
    }

    const body = doc.createElement('div');
    body.className = 'font-controls-panel__body';

    const controlsRow = doc.createElement('div');
    controlsRow.className = 'font-controls-panel__controls';

    const fontField = doc.createElement('label');
    fontField.className = 'font-controls-panel__field font-controls-panel__field--font';

    fontComboWrapper = doc.createElement('div');
    fontComboWrapper.className = 'font-controls-panel__combo';
    const comboRow = doc.createElement('div');
    comboRow.className = 'font-controls-panel__combo-row';
    fontInput = doc.createElement('input');
    fontInput.type = 'text';
    fontInput.className = 'font-controls-panel__input font-controls-panel__input--combo';
    fontInput.placeholder = 'Match chart default or type a font';
    fontInput.setAttribute('aria-label', 'Font family');
    const datalistId = 'font-controls-defaults';
    const menuId = 'font-controls-font-menu';
    fontInput.setAttribute('list', datalistId);
    fontInput.setAttribute('aria-haspopup', 'listbox');
    fontInput.setAttribute('aria-expanded', 'false');
    fontInput.setAttribute('aria-controls', menuId);
    fontMenuToggle = doc.createElement('button');
    fontMenuToggle.type = 'button';
    fontMenuToggle.className = 'font-controls-panel__combo-toggle';
    fontMenuToggle.setAttribute('aria-label', 'Show available fonts');
    fontMenuToggle.setAttribute('aria-haspopup', 'listbox');
    fontMenuToggle.setAttribute('aria-expanded', 'false');
    fontMenuToggle.setAttribute('aria-controls', menuId);
    const menuIcon = doc.createElement('span');
    menuIcon.className = 'font-controls-panel__combo-toggle-icon';
    menuIcon.textContent = '▾';
    menuIcon.setAttribute('aria-hidden', 'true');
    fontMenuToggle.appendChild(menuIcon);
    comboRow.appendChild(fontInput);
    comboRow.appendChild(fontMenuToggle);
    fontComboWrapper.appendChild(comboRow);
    fontDatalist = doc.createElement('datalist');
    fontDatalist.id = datalistId;
    const defaultOption = doc.createElement('option');
    defaultOption.value = '';
    defaultOption.label = 'Match chart default';
    fontDatalist.appendChild(defaultOption);
    const uniqueFonts = Array.from(new Set(DEFAULT_FONTS));
    uniqueFonts.forEach(fontName => {
      const option = doc.createElement('option');
      option.value = fontName;
      option.textContent = fontName;
      fontDatalist.appendChild(option);
    });
    fontComboWrapper.appendChild(fontDatalist);
    fontMenuPopup = doc.createElement('div');
    fontMenuPopup.id = menuId;
    fontMenuPopup.className = 'font-controls-panel__combo-menu';
    fontMenuPopup.setAttribute('role', 'listbox');
    fontMenuPopup.setAttribute('aria-label', 'Common fonts');
    fontMenuPopup.hidden = true;
    fontComboWrapper.appendChild(fontMenuPopup);
    fontMenuEmptyState = doc.createElement('div');
    fontMenuEmptyState.className = 'font-controls-panel__combo-empty';
    fontMenuEmptyState.textContent = 'No matching fonts';
    fontMenuEmptyState.hidden = true;
    fontMenuPopup.appendChild(fontMenuEmptyState);
    fontField.appendChild(fontComboWrapper);

    const formatField = doc.createElement('div');
    formatField.className = 'font-controls-panel__field font-controls-panel__field--format';
    formatField.setAttribute('role', 'group');
    formatField.setAttribute('aria-label', 'Text formatting');
    formatButtonsRow = doc.createElement('div');
    formatButtonsRow.className = 'font-controls-panel__format-buttons';

    const createFormatButton = (symbol, ariaLabel, title) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'font-controls-panel__format-button font-controls-panel__toggle';
      btn.dataset.active = '0';
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', ariaLabel);
      btn.setAttribute('title', title);
      btn.textContent = symbol;
      return btn;
    };

    boldToggle = createFormatButton('B', 'Toggle bold', 'Toggle bold');
    italicToggle = createFormatButton('I', 'Toggle italic', 'Toggle italic');
    italicToggle.classList.add('font-controls-panel__format-button--italic');
    underlineToggle = createFormatButton('U', 'Toggle underline', 'Toggle underline');
    underlineToggle.classList.add('font-controls-panel__format-button--underline');
    subscriptToggle = createFormatButton('x₂', 'Toggle subscript', 'Toggle subscript');
    subscriptToggle.classList.add('font-controls-panel__format-button--script');
    superscriptToggle = createFormatButton('x²', 'Toggle superscript', 'Toggle superscript');
    superscriptToggle.classList.add('font-controls-panel__format-button--script');

    formatButtonsRow.appendChild(boldToggle);
    formatButtonsRow.appendChild(italicToggle);
    formatButtonsRow.appendChild(underlineToggle);
    formatButtonsRow.appendChild(subscriptToggle);
    formatButtonsRow.appendChild(superscriptToggle);
    formatField.appendChild(formatButtonsRow);
    fontField.appendChild(formatField);
    logDebug('font datalist initialized', { count: uniqueFonts.length });
    controlsRow.appendChild(fontField);

    function createFontMenuOption(value, label){
      const optionBtn = doc.createElement('button');
      optionBtn.type = 'button';
      optionBtn.className = 'font-controls-panel__combo-option';
      optionBtn.dataset.value = value || '';
      optionBtn.dataset.label = label || '';
      optionBtn.dataset.hidden = '0';
      optionBtn.textContent = label || 'Match chart default';
      optionBtn.setAttribute('role', 'option');
      optionBtn.setAttribute('tabindex', '-1');
      optionBtn.addEventListener('mousedown', (evt) => {
        evt.preventDefault();
      });
      optionBtn.addEventListener('click', () => {
        closeFontMenu('menu-select');
        syncFontInputValue(value || '', { source: 'menu-select' });
        commitFontFamily(value || '', { source: 'menu-select' });
        if(fontInput){
          try {
            fontInput.focus({ preventScroll: true });
          } catch(focusErr){
            fontInput.focus();
          }
        }
      });
      optionBtn.addEventListener('keydown', (evt) => {
        if(evt.key === 'ArrowDown'){
          evt.preventDefault();
          focusRelativeFontOption(optionBtn, 1);
        } else if(evt.key === 'ArrowUp'){
          evt.preventDefault();
          focusRelativeFontOption(optionBtn, -1);
        } else if(evt.key === 'Home'){
          evt.preventDefault();
          focusFirstFontOption();
        } else if(evt.key === 'End'){
          evt.preventDefault();
          focusLastFontOption();
        } else if(evt.key === 'Escape'){
          evt.preventDefault();
          closeFontMenu('menu-escape');
          if(fontInput){
            try {
              fontInput.focus({ preventScroll: true });
            } catch(focusErr){
              fontInput.focus();
            }
          }
        } else if(evt.key === ' ' || evt.key === 'Enter'){
          evt.preventDefault();
          optionBtn.click();
        }
      });
      if(value){
        optionBtn.style.fontFamily = `'${value}', 'Inter', 'Segoe UI', Arial, sans-serif`;
      }
      return optionBtn;
    }

    const defaultMenuButton = createFontMenuOption('', 'Match chart default');
    fontMenuPopup.insertBefore(defaultMenuButton, fontMenuEmptyState);
    uniqueFonts.forEach(fontName => {
      const optionBtn = createFontMenuOption(fontName, fontName);
      fontMenuPopup.insertBefore(optionBtn, fontMenuEmptyState);
    });
    fontMenuEmptyState.hidden = true;
    highlightFontMenuSelection('');
    computeComboFieldWidth();
    logDebug('font menu options created', {
      count: fontMenuPopup.querySelectorAll('.font-controls-panel__combo-option').length
    });

    fontMenuToggle.addEventListener('mousedown', (evt) => {
      evt.preventDefault();
    });

    fontMenuToggle.addEventListener('click', () => {
      const wasOpen = fontMenuVisible;
      toggleFontMenu('button-toggle', { focusOption: 'active' });
      if(!wasOpen){
        try {
          fontInput.focus({ preventScroll: true });
        } catch(focusErr){
          fontInput.focus();
        }
      } else if(fontInput){
        try {
          fontInput.focus({ preventScroll: true });
        } catch(focusErr){
          fontInput.focus();
        }
      }
    });

    fontMenuToggle.addEventListener('keydown', (evt) => {
      if(evt.key === 'ArrowDown'){
        evt.preventDefault();
        openFontMenu('button-arrow', { focusOption: 'first' });
      } else if(evt.key === 'ArrowUp'){
        evt.preventDefault();
        openFontMenu('button-arrow', { focusOption: 'last' });
      } else if(evt.key === 'Escape'){
        if(fontMenuVisible){
          evt.preventDefault();
          closeFontMenu('button-escape');
        }
      }
    });

    const sizeField = doc.createElement('label');
    sizeField.className = 'font-controls-panel__field font-controls-panel__field--size';
    sizeInput = doc.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = '6';
    sizeInput.max = '96';
    sizeInput.step = '0.5';
    sizeInput.placeholder = '14';
    sizeInput.className = 'font-controls-panel__input font-controls-panel__input--number';
    sizeInput.setAttribute('aria-label', 'Font size');
    sizeField.appendChild(sizeInput);
    controlsRow.appendChild(sizeField);

    const colorField = doc.createElement('label');
    colorField.className = 'font-controls-panel__field font-controls-panel__field--color';
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'font-controls-panel__color-input';
    colorInput.setAttribute('aria-label', 'Font color');
    colorField.appendChild(colorInput);
    controlsRow.appendChild(colorField);

    logDebug('format toggles initialized', { toggleCount: formatButtonsRow.children.length });
    resolveFormatRowWidth();

    body.appendChild(controlsRow);

    panelEl.appendChild(body);

    const footer = doc.createElement('div');
    footer.className = 'font-controls-panel__footer';
    footer.textContent = 'Changes cascade to every element in the selected group.';
    panelEl.appendChild(footer);

    updatePanelContext();
    console.debug('Debug: font controls layout refreshed', { sections: controlsRow.children.length, closeButton: false }); // Debug: layout ready

    updatePreviewText();
    updatePreviewFromInputs();

    if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(colorInput);
    }

    function commitFontFamily(rawValue, meta){
      if(!currentTarget){ return; }
      const prevStyle = captureStyleSnapshot(currentTarget);
      const value = (rawValue || '').trim();
      const inlineResult = handleInlineSelectionPatch({ fontFamily: value || null }, {
        source: meta?.source || 'unknown',
        action: 'font-family'
      });
      if(inlineResult.handled){
        updatePreviewFromInputs();
        return;
      }
      if(value){
        currentTarget.setAttribute('font-family', value);
      } else {
        currentTarget.removeAttribute('font-family');
      }
      const nextStyle = captureStyleSnapshot(currentTarget);
      const storePayload = {
        ...nextStyle,
        fill: nextStyle?.fill || colorInput?.value || null
      };
      storeCurrentStyle(storePayload);
      if(inlineResult.entire){
        const inlineState = getInlineState(currentTarget);
        if(inlineState && inlineState.baseStyle){
          inlineState.baseStyle.fontFamily = value || null;
        }
      }
      updatePreviewFromInputs();
      recordStyleUndo(currentTarget, prevStyle, nextStyle, { label: 'font-family' });
      logDebug('font family committed', {
        value: value || null,
        source: meta?.source || 'unknown',
        text: currentTarget.textContent
      });
    }

    fontInput.addEventListener('change', () => {
      if(!currentTarget){ return; }
      const value = fontInput.value.trim();
      commitFontFamily(value, { source: 'input-change' });
      syncFontInputValue(value, { source: 'input-change' });
    });

    fontInput.addEventListener('input', () => {
      updatePreviewFromInputs();
      if(fontMenuVisible){
        filterFontMenuOptions(fontInput.value);
        highlightFontMenuSelection(fontInput.value);
      }
      logDebug('fontInput input preview', { value: fontInput.value });
    });

    fontInput.addEventListener('focus', () => {
      highlightFontMenuSelection(fontInput.value);
    });

    fontInput.addEventListener('keydown', (evt) => {
      if(evt.key === 'ArrowDown'){
        evt.preventDefault();
        openFontMenu('input-arrow', { focusOption: 'active' });
      } else if(evt.key === 'ArrowUp'){
        evt.preventDefault();
        openFontMenu('input-arrow', { focusOption: 'last' });
      } else if(evt.key === 'Escape' && fontMenuVisible){
        evt.preventDefault();
        closeFontMenu('input-escape');
      } else if((evt.key === 'Enter' || evt.key === 'Tab') && fontMenuVisible){
        const activeOption = getActiveFontMenuOption();
        if(activeOption){
          evt.preventDefault();
          activeOption.click();
        }
      }
    });

    colorInput.addEventListener('input', () => {
      if(!currentTarget) return;
      const prevStyle = captureStyleSnapshot(currentTarget);
      const val = colorInput.value;
      const inlineResult = handleInlineSelectionPatch({ fill: val }, {
        source: 'color-input',
        action: 'fill'
      });
      if(inlineResult.handled){
        updatePreviewFromInputs();
        return;
      }
      currentTarget.setAttribute('fill', val);
      const nextStyle = captureStyleSnapshot(currentTarget);
      storeCurrentStyle(nextStyle);
      if(inlineResult.entire){
        const inlineState = getInlineState(currentTarget);
        if(inlineState && inlineState.baseStyle){
          inlineState.baseStyle.fill = val;
        }
      }
      updatePreviewFromInputs();
      recordStyleUndo(currentTarget, prevStyle, nextStyle, { label: 'fill' });
      logDebug('colorInput input', { value: val, text: currentTarget.textContent });
    });

    sizeInput.addEventListener('change', () => {
      if(!currentTarget) return;
      const prevStyle = captureStyleSnapshot(currentTarget);
      const normalized = normalizeFontSizeValue(sizeInput.value, { source: 'change' });
      sizeInput.value = normalized;
      const raw = normalized.trim();
      let val = null;
      if(raw){
        const numeric = parseFloat(raw);
        if(Number.isFinite(numeric)){
          val = `${numeric}px`;
        }
      }
      const inlineResult = handleInlineSelectionPatch({ fontSize: val }, {
        source: 'size-change',
        action: 'font-size'
      });
      if(inlineResult.handled){
        updatePreviewFromInputs();
        return;
      }
      if(val){
        currentTarget.setAttribute('font-size', val);
      } else {
        currentTarget.removeAttribute('font-size');
      }
      const nextStyle = captureStyleSnapshot(currentTarget);
      const storePayload = {
        ...nextStyle,
        fill: nextStyle?.fill || colorInput?.value || null
      };
      storeCurrentStyle(storePayload);
      if(inlineResult.entire){
        const inlineState = getInlineState(currentTarget);
        if(inlineState && inlineState.baseStyle){
          inlineState.baseStyle.fontSize = val;
        }
      }
      updatePreviewFromInputs();
      recordStyleUndo(currentTarget, prevStyle, nextStyle, { label: 'font-size' });
      logDebug('sizeInput change', { value: raw, applied: nextStyle?.fontSize || null, text: currentTarget.textContent });
    });

    sizeInput.addEventListener('input', () => {
      const currentValue = sizeInput.value;
      const clamped = clampFontSizeDuringInput(currentValue);
      if(clamped !== currentValue){
        sizeInput.value = clamped;
      }
      updatePreviewFromInputs();
      logDebug('sizeInput input preview', { value: sizeInput.value });
    });

    const toggleHandler = (btn, attr, activeValue, propKey, options) => {
      if(!btn){ return; }
      const config = options || {};
      btn.addEventListener('click', () => {
        if(!currentTarget) return;
        const prevStyle = captureStyleSnapshot(currentTarget);
        const isActive = btn.dataset.active === '1';
        const nextActive = !isActive;
        setToggleState(btn, nextActive);
        const patch = {};
        if(propKey){
          patch[propKey] = nextActive ? activeValue : null;
        }
        if(typeof config.onTogglePrepare === 'function'){
          config.onTogglePrepare({ nextActive, patch, attr, activeValue, propKey });
        }
        const inlineResult = handleInlineSelectionPatch(patch, {
          source: `${attr}-toggle`,
          action: attr,
          active: nextActive
        });
        if(inlineResult.handled){
          updatePreviewFromInputs();
          return;
        }
        if(nextActive){
          currentTarget.setAttribute(attr, activeValue);
        } else {
          currentTarget.removeAttribute(attr);
        }
        const nextStyle = captureStyleSnapshot(currentTarget);
        const storePayload = {
          ...nextStyle,
          fill: nextStyle?.fill || colorInput?.value || null
        };
        storeCurrentStyle(storePayload);
        if(inlineResult.entire && propKey){
          const inlineState = getInlineState(currentTarget);
          if(inlineState && inlineState.baseStyle){
            inlineState.baseStyle[propKey] = nextActive ? activeValue : null;
          }
        }
        updatePreviewFromInputs();
        recordStyleUndo(currentTarget, prevStyle, nextStyle, { label: attr });
        logDebug('toggle change', { attr, active: nextActive, text: currentTarget.textContent });
        if(typeof config.onToggleApplied === 'function'){
          config.onToggleApplied({ nextActive });
        }
      });
    };

    toggleHandler(boldToggle, 'font-weight', 'bold', 'fontWeight');
    toggleHandler(italicToggle, 'font-style', 'italic', 'fontStyle');
    toggleHandler(underlineToggle, 'text-decoration', 'underline', 'textDecoration');
    toggleHandler(subscriptToggle, 'baseline-shift', 'sub', 'baselineShift', {
      onTogglePrepare({ nextActive }){
        if(nextActive){
          setToggleState(superscriptToggle, false);
        }
      }
    });
    toggleHandler(superscriptToggle, 'baseline-shift', 'super', 'baselineShift', {
      onTogglePrepare({ nextActive }){
        if(nextActive){
          setToggleState(subscriptToggle, false);
        }
      }
    });

    doc.addEventListener('keydown', (evt) => {
      if(evt.key === 'Escape'){ closePanel('escape'); }
    });

    doc.addEventListener('click', (evt) => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      const target = evt.target;
      if(panelEl.contains(target)){ return; }
      if(currentTarget && target === currentTarget){ return; }
      if(target?.closest?.('.inline-edit-overlay')){
        logDebug('panel click ignored (inline edit overlay)', {});
        return;
      }
      if(target?.dataset?.fontControlsOverlay === '1'){
        logDebug('panel click ignored (color overlay focus)', {});
        return;
      }
      closePanel('outside');
    });

    logDebug('panel initialized', { fonts: DEFAULT_FONTS.length });
    return panelEl;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    if(currentTarget && isInlineEditingActive(currentTarget) && reason !== 'escape'){
      logDebug('panel close deferred during inline edit', { reason });
      return;
    }
    closeFontMenu('panel-close');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.hidden = true;
    exitFloatingMode({ trigger: reason || 'close' });
    if(activeHost && panelEl.parentElement === activeHost){
      hideToolbarHost(activeHost);
      activeHost = null;
    }
    if(colorInput){
      colorInput.__fontControlsAvoidRect = null;
    }
    try {
      const editHighlight = Shared.editHighlight;
      if(editHighlight && typeof editHighlight.clearText === 'function'){
        editHighlight.clearText(reason || 'close');
        logDebug('text highlight cleared via close', { reason });
      }
    } catch(highlightErr){
      console.error('fontControls.closePanel highlight error', highlightErr);
    }
    currentTarget = null;
    currentScope = null;
    currentKey = null;
    logDebug('panel closed', { reason });
  }

  function openPanelForTarget(target, options){
    if(!target){ return; }
    ensurePanel();
    try {
      const axisControls = global.Shared?.axisControls;
      if(axisControls && typeof axisControls.close === 'function'){
        axisControls.close('font-open');
        logDebug('axis controls closed before font panel open', { reason: 'font-open' });
      }
    } catch(axisErr){
      console.error('fontControls.openPanelForTarget axisControls.close error', axisErr);
    }
    currentTarget = target;
    currentScope = options?.scopeId || target.dataset?.fontScope || null;
    currentKey = options?.key || target.dataset?.fontKey || null;
    try {
      const editHighlight = Shared.editHighlight;
      if(editHighlight && typeof editHighlight.highlightText === 'function'){
        editHighlight.highlightText(target);
        logDebug('text highlight requested', { scope: currentScope, key: currentKey });
      }
    } catch(highlightErr){
      console.error('fontControls.openPanelForTarget highlight error', highlightErr);
    }
    if(!panelEl){ return; }
    const host = resolveToolbarHost(currentScope);
    if(host){
      if(activeHost && activeHost !== host){
        hideToolbarHost(activeHost);
      }
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      activeHost = host;
      showToolbarHost(host);
    } else {
      if(activeHost){
        hideToolbarHost(activeHost);
      }
      activeHost = null;
      logDebug('panel host unavailable', { scope: currentScope, key: currentKey });
    }

    panelEl.style.display = 'flex';
    panelEl.hidden = false;
    panelEl.setAttribute('aria-hidden', 'false');
    panelEl.dataset.open = '1';
    panelEl.style.left = '';
    panelEl.style.top = '';
    if(currentScope){
      panelEl.dataset.scope = currentScope;
    } else {
      delete panelEl.dataset.scope;
    }

    const rect = target.getBoundingClientRect();
    if(colorInput){
      colorInput.__fontControlsAvoidRect = {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      };
      logDebug('color avoid rect updated', {
        targetTop: rect.top,
        targetLeft: rect.left,
        width: rect.width,
        height: rect.height
      });
    }

    syncPanelStateFromTarget();
    ensurePlacementMonitoring();
    updateFloatingState('open');
    scheduleFontToolbarWidthSync('panel-open');
    logDebug('panel opened', {
      scope: currentScope,
      key: currentKey,
      text: target.textContent,
      hostScope: activeHost?.dataset?.fontToolbarScope || null
    });
  }

  function handleSvgClick(evt){
    let target = evt.target;
    if(!target){ return; }
    if(target.tagName?.toLowerCase() !== 'text'){
      if(typeof target.closest === 'function'){
        const ownerText = target.closest('text');
        if(ownerText){
          target = ownerText;
        }
      }
    }
    if(!target || target.tagName?.toLowerCase() !== 'text'){ return; }
    const editableFlag = target.dataset?.fontEditable;
    if(editableFlag === '0'){ return; }
    const isEditable = editableFlag === '1' || typeof editableFlag === 'undefined';
    if(!isEditable){ return; }
    const svg = evt.currentTarget;
    const scope = target.dataset?.fontScope || svgScopeMap.get(svg) || null;
    const key = target.dataset?.fontKey || null;
    openPanelForTarget(target, { scopeId: scope, key });
  }

  function enableForSvg(svg, options){
    if(!svg){
      logDebug('enableForSvg skipped', { reason: 'no-svg' });
      return;
    }
    const scopeId = options?.scopeId || svg.dataset?.fontScope || svg.id || null;
    svgScopeMap.set(svg, scopeId);
    if(svgRegistry.has(svg)){ return; }
    svg.addEventListener('click', handleSvgClick, true);
    svgRegistry.add(svg);
    logDebug('enableForSvg attached', {
      scopeId,
      hasDatasetScope: !!svg.dataset?.fontScope,
      nodeName: svg.nodeName
    });
  }

  function markText(node, options){
    if(!node){ return; }
    const scopeId = options?.scopeId || node.dataset?.fontScope || null;
    const role = options?.role || null;
    const key = options?.key || role || null;
    if(node.dataset){
      node.dataset.fontEditable = '1';
      if(scopeId){ node.dataset.fontScope = scopeId; }
      if(role){ node.dataset.fontRole = role; }
      if(key){ node.dataset.fontKey = key; }
    }
    const storeKey = buildStoreKey(scopeId, key);
    registerNodeForKey(node, storeKey);
    if(styleStore.has(storeKey)){
      applyStyleToNode(node, styleStore.get(storeKey));
    }
    logDebug('markText applied', { scopeId, role, key, text: node?.textContent });
  }

  function applySavedStyle(node){
    if(!node){ return; }
    const scopeId = node.dataset?.fontScope || null;
    const key = node.dataset?.fontKey || null;
    const storeKey = buildStoreKey(scopeId, key);
    if(styleStore.has(storeKey)){
      applyStyleToNode(node, styleStore.get(storeKey));
    }
  }

  fontControls.ensurePanel = ensurePanel;
  fontControls.enableForSvg = enableForSvg;
  fontControls.markText = markText;
  fontControls.openForElement = openPanelForTarget;
  fontControls.applySavedStyle = applySavedStyle;
  fontControls.captureInlineState = captureInlineStateForNode;
  fontControls.exportScopeStyles = exportScopeStyles;
  fontControls.importScopeStyles = importScopeStyles;
  fontControls.close = closePanel;

  ensurePanel();
})(typeof window !== 'undefined' ? window : globalThis);
