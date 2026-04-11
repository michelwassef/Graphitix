(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DEFAULT_FONTS = [
    'Inter',
    'Segoe UI',
    'Segoe UI Variable',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
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
    'Franklin Gothic Medium',
    'Franklin Gothic',
    'Gill Sans',
    'Gill Sans MT',
    'Calibri',
    'Candara',
    'Corbel',
    'Optima',
    'Avenir',
    'Avenir Next',
    'Avenir Next Condensed',
    'SF Pro Text',
    'SF Pro Display',
    'San Francisco',
    'Helvetica Neue',
    'Charter',
    'Chicago',
    'Roboto',
    'Noto Sans',
    'Noto Serif',
    'Noto Sans Display',
    'Noto Serif Display',
    'Noto Sans JP',
    'Noto Sans KR',
    'Noto Sans SC',
    'Noto Sans TC',
    'Noto Sans Arabic',
    'Noto Sans Hebrew',
    'Noto Sans Devanagari',
    'Noto Sans Thai',
    'Noto Sans Tamil',
    'Noto Sans Bengali',
    'Noto Sans Armenian',
    'Noto Sans Georgian',
    'Noto Sans Ethiopic',
    'Noto Sans Symbols',
    'Noto Emoji',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Source Sans Pro',
    'Source Serif Pro',
    'Source Code Pro',
    'PT Sans',
    'PT Serif',
    'PT Sans Caption',
    'PT Mono',
    'Fira Code',
    'Fira Mono',
    'JetBrains Mono',
    'Inconsolata',
    'Menlo',
    'Consolas',
    'Lucida Grande',
    'Lucida Sans',
    'Lucida Sans Unicode',
    'Lucida Console',
    'Monaco',
    'Ubuntu',
    'Ubuntu Mono',
    'Droid Sans',
    'Droid Serif',
    'Droid Sans Mono',
    'Century Gothic',
    'Century Schoolbook',
    'Book Antiqua',
    'Goudy Old Style',
    'Baskerville',
    'Hoefler Text',
    'Palatino Linotype',
    'Didot',
    'Bodoni MT',
    'Rockwell',
    'Avenir Book',
    'Poppins',
    'Mulish',
    'Work Sans',
    'Raleway',
    'IBM Plex Serif',
    'IBM Plex Mono',
    'IBM Plex Sans Condensed',
    'Space Grotesk',
    'Space Mono',
    'Manrope',
    'Assistant',
    'Asap',
    'Barlow',
    'Barlow Condensed',
    'Barlow Semi Condensed',
    'Cabin',
    'Cairo',
    'Catamaran',
    'Chivo',
    'Exo 2',
    'Hind',
    'Karla',
    'Libre Franklin',
    'Merriweather',
    'Merriweather Sans',
    'Playfair Display',
    'Poppins SemiBold',
    'Quicksand',
    'Rubik',
    'Spectral',
    'Titillium Web',
    'Varela Round',
    'Symbol'
  ];
  const CORE_FONTS = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Cambria',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Courier New',
    'Consolas',
    'Segoe UI',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
    'Lucida Sans',
    'Lucida Sans Unicode',
    'Lucida Grande',
    'Palatino',
    'Palatino Linotype',
    'Gill Sans',
    'Calibri',
    'Optima',
    'Menlo',
    'Monaco',
    'Ubuntu',
    'Ubuntu Mono',
    'DejaVu Sans',
    'DejaVu Serif',
    'DejaVu Sans Mono',
    'Symbol'
  ];
  const SHARED_FONTS = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Courier New',
    'Symbol'
  ];
  const WINDOWS_FONTS = [
    'Segoe UI',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
    'Calibri',
    'Cambria',
    'Candara',
    'Corbel',
    'Consolas',
    'Franklin Gothic Medium',
    'Gill Sans',
    'Gill Sans MT',
    'Book Antiqua',
    'Century Gothic',
    'Rockwell',
    'Palatino Linotype',
    'Lucida Sans',
    'Lucida Sans Unicode',
    'Lucida Console'
  ];
  const MAC_FONTS = [
    'San Francisco',
    'SF Pro Text',
    'SF Pro Display',
    'Helvetica Neue',
    'Avenir',
    'Avenir Next',
    'Avenir Next Condensed',
    'Optima',
    'Gill Sans',
    'Lucida Grande',
    'Menlo',
    'Monaco',
    'Charter',
    'Hoefler Text',
    'Didot',
    'Baskerville'
  ];
  const LINUX_FONTS = [
    'Ubuntu',
    'Ubuntu Mono',
    'DejaVu Sans',
    'DejaVu Serif',
    'DejaVu Sans Mono',
    'Droid Sans',
    'Droid Serif',
    'Droid Sans Mono',
    'Noto Sans',
    'Noto Serif',
    'Noto Sans Symbols',
    'Noto Emoji'
  ];

  const PRESET_FONT_SIZES = [
    5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72
  ];

  const FONT_SCOPE_SELECTION = 'selection';
  const FONT_SCOPE_GRAPH = 'graph';
  const GRAPH_SCOPE_TOKEN = '__graph__';
  const TAB_SCOPE_TOKEN_PREFIX = '@tab:';
  const scopeModePreferences = new Map();

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
  let sizeComboWrapper = null;
  let sizeMenuToggle = null;
  let sizeMenuPopup = null;
  let sizeMenuVisible = false;
  let sizeMenuCloseHandler = null;
  let comboMenuViewportHandler = null;
  let comboMenuViewportRaf = null;
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
  let scopeFieldEl = null;
  let scopeSelectEl = null;
  let footerEl = null;
  let currentTarget = null;
  let currentScope = null;
  let currentKey = null;
  let savedContentSelection = null;
  let contentSelectionTrackingDoc = null;
  let contentSelectionTrackingHandler = null;
  let activeScopeMode = FONT_SCOPE_SELECTION;
  let placementMonitoringAttached = false;
  let knownFontNames = null;
  let appendFontOption = null;
  let hydrateLocalFonts = null;
  let localFontsHydrating = false;
  let fontAvailabilityCache = null;
  let fontMeasureProbe = null;
  let fontBaselineWidths = null;
  let fontMeasureCanvas = null;
  let fontMeasureCtx = null;
  const isFirefox = (() => {
    if(typeof navigator === 'undefined'){ return false; }
    const ua = navigator.userAgent || '';
    if(/firefox|gecko/i.test(ua)){ return true; }
    const brands = navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)
      ? navigator.userAgentData.brands
      : [];
    return brands.some(entry => /firefox/i.test(entry.brand || ''));
  })();
  const isWindows = typeof navigator !== 'undefined' && /windows|win32|win64/i.test(navigator.userAgent || '');
  const isMac = typeof navigator !== 'undefined' && /macintosh|mac os x|mac_powerpc|darwin/i.test(navigator.userAgent || '');
  const isLinux = typeof navigator !== 'undefined' && /linux|x11|ubuntu|debian|fedora|redhat|suse|arch/i.test(navigator.userAgent || '');
  const sharedFontSet = new Set(SHARED_FONTS.map(f => f.toLowerCase()));
  const windowsFontSet = new Set(WINDOWS_FONTS.map(f => f.toLowerCase()));
  const macFontSet = new Set(MAC_FONTS.map(f => f.toLowerCase()));
  const linuxFontSet = new Set(LINUX_FONTS.map(f => f.toLowerCase()));
  const fontSuggestionList = [];
  const fontSuggestionSet = new Set();

  function isLikelyFontForPlatform(name){
    if(!name){ return false; }
    const key = String(name).trim().toLowerCase();
    if(!key){ return false; }
    if(!(isWindows || isMac || isLinux)){
      return true; // Unknown platform: keep full list.
    }
    if(sharedFontSet.has(key)){ return true; }
    if(isWindows && windowsFontSet.has(key)){ return true; }
    if(isMac && macFontSet.has(key)){ return true; }
    if(isLinux && linuxFontSet.has(key)){ return true; }
    return false;
  }

  function ensureFontProbe(doc){
    if(fontMeasureProbe && fontMeasureProbe.ownerDocument === doc){ return fontMeasureProbe; }
    const probe = doc.createElement('span');
    probe.textContent = 'abcdefghijklmnopqrstuvwxyz0123456789';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.fontSize = '32px';
    probe.style.left = '-9999px';
    probe.style.top = '-9999px';
    if(doc.body){ doc.body.appendChild(probe); }
    fontMeasureProbe = probe;
    fontBaselineWidths = null;
    return probe;
  }

  function registerFontSuggestion(name){
    if(!name){ return; }
    const key = String(name).trim().toLowerCase();
    if(!key || fontSuggestionSet.has(key)){ return; }
    fontSuggestionSet.add(key);
    fontSuggestionList.push(name);
  }

  function suggestFontCompletion(prefix){
    const normalized = String(prefix || '').trim().toLowerCase();
    if(!normalized){ return null; }
    for(let i = 0; i < fontSuggestionList.length; i += 1){
      const candidate = fontSuggestionList[i];
      if(candidate && candidate.toLowerCase().startsWith(normalized)){
        return candidate;
      }
    }
    return null;
  }

  function applyInlineFontAutocomplete(rawValue, meta){
    if(!fontInput){ return; }
    const reason = (meta && meta.reason) || '';
    if(typeof reason === 'string' && /delete|backspace/i.test(reason)){
      return; // do not re-suggest while user is deleting
    }
    const selectionStart = fontInput.selectionStart;
    const selectionEnd = fontInput.selectionEnd;
    // Only autocomplete when caret is at end and there is no selection.
    if(selectionStart !== selectionEnd || selectionEnd !== fontInput.value.length){ return; }
    const query = (rawValue || '').trim();
    if(!query){ return; }
    const suggestion = suggestFontCompletion(query);
    if(suggestion && suggestion.toLowerCase() !== query.toLowerCase() && suggestion.length > query.length){
      fontInput.value = suggestion;
      try {
        fontInput.setSelectionRange(query.length, suggestion.length);
      } catch(rangeErr){
        logDebug('autocomplete selection failed', { error: rangeErr?.message || String(rangeErr), meta });
      }
    }
  }

  function measureFontWidth(family, doc){
    const referenceDoc = doc || global.document;
    if(!referenceDoc){ return 0; }
    const probe = ensureFontProbe(referenceDoc);
    probe.style.fontFamily = family;
    const rect = probe.getBoundingClientRect();
    return rect.width || 0;
  }

  function measureFontWidthCanvas(family){
    if(!fontMeasureCanvas){
      fontMeasureCanvas = global.document ? global.document.createElement('canvas') : null;
    }
    if(!fontMeasureCanvas){ return 0; }
    if(!fontMeasureCtx){
      fontMeasureCtx = fontMeasureCanvas.getContext('2d');
    }
    if(!fontMeasureCtx){ return 0; }
    fontMeasureCtx.font = `32px ${family}`;
    return fontMeasureCtx.measureText('abcdefghijklmnopqrstuvwxyz0123456789').width || 0;
  }

  function isFontAvailable(name){
    if(!name){ return false; }
    const key = String(name).toLowerCase();
    if(!fontAvailabilityCache){ fontAvailabilityCache = new Map(); }
    if(fontAvailabilityCache.has(key)){ return fontAvailabilityCache.get(key); }
    const doc = global.document;
    if(!doc){
      fontAvailabilityCache.set(key, true);
      return true;
    }
    if(doc.fonts && typeof doc.fonts.check === 'function'){
      const available = doc.fonts.check(`12px "${name}"`) || doc.fonts.check(`12px ${name}`);
      fontAvailabilityCache.set(key, available);
      return available;
    }
    const probe = ensureFontProbe(doc);
    if(!fontBaselineWidths){
      fontBaselineWidths = {
        serif: measureFontWidth('serif', doc),
        sans: measureFontWidth('sans-serif', doc),
        mono: measureFontWidth('monospace', doc)
      };
    }
    const testFamilies = [`"${name}", serif`, `"${name}", sans-serif`, `"${name}", monospace`];
    const testStrings = ['mmmmmmmmmm', 'iiiiiiiiii', 'abcdefghijklmnopqrstuvwxyz', '0123456789'];
    let available = false;
    testStrings.some(str => {
      const widths = testFamilies.map(fam => {
        probe.style.fontFamily = fam;
        probe.textContent = str;
        const rect = probe.getBoundingClientRect();
        const spanWidth = rect.width || 0;
        const canvasWidth = measureFontWidthCanvas(fam) || spanWidth;
        return Math.max(spanWidth, canvasWidth);
      });
      const baseline = [
        fontBaselineWidths.serif || 0,
        fontBaselineWidths.sans || 0,
        fontBaselineWidths.mono || 0
      ];
      const diffs = widths.map((w, idx) => Math.abs(w - baseline[idx]));
      // Require noticeable difference from all baselines to treat as installed.
      const allFar = diffs.every(delta => delta > 2);
      if(allFar){
        available = true;
        return true;
      }
      return false;
    });
    fontAvailabilityCache.set(key, available);
    return available;
  }

  function safeIsFontAvailable(name, options){
    try {
      return isFontAvailable(name);
    } catch(err){
      console.warn('fontControls availability check failed', { font: name, error: err?.message || err });
      if(options && options.fallback === 'assume-available'){ return true; }
      return false;
    }
  }

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
  const SCRIPT_FALLBACK_SHIFT_EM = 0.35;
  let cachedSvgBaselineShiftSupport = null;

  function supportsSvgBaselineShift(){
    if(cachedSvgBaselineShiftSupport !== null){
      return cachedSvgBaselineShiftSupport;
    }
    try {
      const doc = global?.document;
      if(!doc || !doc.body || typeof doc.createElementNS !== 'function'){
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
  }

  function parseFontSizeValue(value){
    if(value === undefined || value === null){ return null; }
    const raw = String(value).trim();
    if(!raw){ return null; }
    const match = raw.match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
    if(!match){ return null; }
    const numeric = Number.parseFloat(match[1]);
    if(!Number.isFinite(numeric)){ return null; }
    return { numeric, unit: (match[2] || '').toLowerCase() };
  }

  function fontSizeValueToPx(value){
    const parsed = parseFontSizeValue(value);
    if(!parsed){ return null; }
    if(!parsed.unit || parsed.unit === 'px'){ return parsed.numeric; }
    if(parsed.unit === 'em' || parsed.unit === 'rem'){ return parsed.numeric * 16; }
    if(parsed.unit === 'pt'){ return parsed.numeric * (96 / 72); }
    return parsed.numeric;
  }

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
    if(!isSvgTextTarget(node)){ return; }
    if(!node.firstChild){ return; }
    const textValue = node.textContent || '';
    node.textContent = textValue;
    logDebug('resetInlineSegments', { textLength: textValue.length });
  }

  function applyInlineSegmentsToNode(node, segments){
    if(!node){ return; }
    if(!isSvgTextTarget(node)){ return; }
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
    const useFirefoxScriptFallback = !supportsSvgBaselineShift();
    let computedFontSize = null;
    try {
      computedFontSize = global?.getComputedStyle ? global.getComputedStyle(node)?.fontSize : null;
    } catch (styleErr) {
      computedFontSize = null;
    }
    const baseFontSizeSource = node.getAttribute?.('font-size') || computedFontSize || null;
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
      if(useFirefoxScriptFallback){
        const shift = segment?.style?.baselineShift || null;
        if(shift === 'sub' || shift === 'super'){
          const translate = shift === 'sub' ? SCRIPT_FALLBACK_SHIFT_EM : -SCRIPT_FALLBACK_SHIFT_EM;
          const segmentFontSource = segment?.style?.fontSize || baseFontSizeSource || `${SCRIPT_SCALE}em`;
          const segmentFontPx = fontSizeValueToPx(segmentFontSource)
            || fontSizeValueToPx(baseFontSizeSource)
            || 16;
          const translatePx = Math.round(segmentFontPx * translate * 1000) / 1000;
          if(!(segment?.style?.fontSize)){
            tspan.setAttribute('font-size', `${SCRIPT_SCALE}em`);
          }
          tspan.setAttribute('transform', `translate(0 ${translatePx})`);
          if(tspan.style){
            tspan.style.transformBox = 'fill-box';
            tspan.style.transformOrigin = 'center';
            tspan.style.transform = `translate(0px, ${translatePx}px)`;
          }
        }
      }
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
    const scopeId = dataset.fontScope || null;
    const key = dataset.fontKey || null;
    const hasSegments = baseSnapshot.inlineSegments && baseSnapshot.inlineSegments.length > 0;
    const desiredMode = hasSegments ? FONT_SCOPE_SELECTION : getScopeMode(scopeId);
    const storeContext = resolveStoreContext(target, { scopeId, key, mode: desiredMode });
    storeStyleForNode(target, baseSnapshot, {
      ...storeContext,
      suppressStyleChangedEvent: true
    });
    logDebug('captureInlineStateForNode', {
      scope: dataset.fontScope || null,
      key: dataset.fontKey || null,
      segments: segments.length,
      reason: meta?.reason || 'inline-change'
    });
  }

  function isSvgTextTarget(node){
    if(!node){ return false; }
    const tag = node.tagName?.toLowerCase?.() || '';
    if(node.namespaceURI === SVG_NS){ return true; }
    return tag === 'text' || tag === 'tspan';
  }

  function isContentEditableTarget(node){
    if(!node || node.nodeType !== 1){ return false; }
    const raw = String(node.getAttribute?.('contenteditable') || '').toLowerCase();
    return !!(node.isContentEditable || raw === 'true' || raw === 'plaintext-only');
  }

  function getSelectionObject(doc){
    if(doc && typeof doc.getSelection === 'function'){
      return doc.getSelection();
    }
    if(typeof global.getSelection === 'function'){
      return global.getSelection();
    }
    return null;
  }

  function isRangeInsideTarget(range, target){
    if(!range || !target || typeof target.contains !== 'function'){
      return false;
    }
    const startNode = range.startContainer || null;
    const endNode = range.endContainer || null;
    const common = range.commonAncestorContainer || null;
    if(!startNode || !endNode || !common){
      return false;
    }
    return target.contains(startNode) && target.contains(endNode) && target.contains(common);
  }

  function cloneRangeSafe(range){
    if(!range || typeof range.cloneRange !== 'function'){
      return null;
    }
    try{
      return range.cloneRange();
    }catch(err){
      logDebug('cloneRangeSafe failed', { error: err?.message || String(err) });
      return null;
    }
  }

  function cacheContentEditableSelection(target, reason){
    if(!isContentEditableTarget(target)){
      return false;
    }
    const doc = target.ownerDocument || global.document;
    const selection = getSelectionObject(doc);
    if(!selection || selection.rangeCount < 1){
      return false;
    }
    const range = selection.getRangeAt(0);
    if(!range || range.collapsed){
      return false;
    }
    if(!isRangeInsideTarget(range, target)){
      return false;
    }
    const cloned = cloneRangeSafe(range);
    if(!cloned){
      return false;
    }
    savedContentSelection = { target, range: cloned };
    logDebug('contenteditable selection cached', { reason: reason || 'unknown' });
    return true;
  }

  function restoreContentEditableSelection(target, reason){
    if(!isContentEditableTarget(target)){
      return false;
    }
    if(!savedContentSelection || savedContentSelection.target !== target || !savedContentSelection.range){
      return false;
    }
    const doc = target.ownerDocument || global.document;
    const selection = getSelectionObject(doc);
    const cloned = cloneRangeSafe(savedContentSelection.range);
    if(!selection || !cloned){
      return false;
    }
    try{
      selection.removeAllRanges();
      selection.addRange(cloned);
      logDebug('contenteditable selection restored', { reason: reason || 'unknown' });
      return true;
    }catch(err){
      logDebug('contenteditable selection restore failed', {
        reason: reason || 'unknown',
        error: err?.message || String(err)
      });
      return false;
    }
  }

  function clearContentEditableSelectionCache(target){
    if(!savedContentSelection){
      return;
    }
    if(!target || savedContentSelection.target === target){
      savedContentSelection = null;
    }
  }

  function resolveContentEditableSelectionRange(target){
    if(!isContentEditableTarget(target)){
      return null;
    }
    const doc = target.ownerDocument || global.document;
    const selection = getSelectionObject(doc);
    if(selection && selection.rangeCount > 0){
      const range = selection.getRangeAt(0);
      if(range && !range.collapsed && isRangeInsideTarget(range, target)){
        cacheContentEditableSelection(target, 'active-range');
        return { doc, selection, range };
      }
    }
    if(restoreContentEditableSelection(target, 'restore-fallback')){
      const restoredSelection = getSelectionObject(doc);
      if(restoredSelection && restoredSelection.rangeCount > 0){
        const restoredRange = restoredSelection.getRangeAt(0);
        if(restoredRange && !restoredRange.collapsed && isRangeInsideTarget(restoredRange, target)){
          return { doc, selection: restoredSelection, range: restoredRange };
        }
      }
    }
    return null;
  }

  function isFullSelectionForTarget(range, target){
    if(!range || !target){ return false; }
    const doc = target.ownerDocument || global.document;
    if(!doc || typeof doc.createRange !== 'function'){
      return false;
    }
    const view = doc.defaultView || global;
    const RangeCtor = view && view.Range ? view.Range : null;
    if(!RangeCtor){
      return false;
    }
    const fullRange = doc.createRange();
    try{
      fullRange.selectNodeContents(target);
      return range.compareBoundaryPoints(RangeCtor.START_TO_START, fullRange) === 0
        && range.compareBoundaryPoints(RangeCtor.END_TO_END, fullRange) === 0;
    }catch(err){
      logDebug('full selection check failed', { error: err?.message || String(err) });
      return false;
    }finally{
      try{ fullRange.detach?.(); }catch(e){}
    }
  }

  function buildContentEditableStylePatch(patch){
    const source = patch && typeof patch === 'object' ? patch : {};
    const css = {};
    let hasAny = false;
    if(Object.prototype.hasOwnProperty.call(source, 'fontFamily')){
      css.fontFamily = source.fontFamily ? String(source.fontFamily) : 'inherit';
      hasAny = true;
    }
    if(Object.prototype.hasOwnProperty.call(source, 'fontWeight')){
      css.fontWeight = source.fontWeight ? String(source.fontWeight) : 'normal';
      hasAny = true;
    }
    if(Object.prototype.hasOwnProperty.call(source, 'fontStyle')){
      css.fontStyle = source.fontStyle ? String(source.fontStyle) : 'normal';
      hasAny = true;
    }
    if(Object.prototype.hasOwnProperty.call(source, 'fontSize')){
      css.fontSize = source.fontSize ? String(source.fontSize) : 'inherit';
      hasAny = true;
    }
    if(Object.prototype.hasOwnProperty.call(source, 'fill')){
      css.color = source.fill ? String(source.fill) : 'inherit';
      hasAny = true;
    }
    if(Object.prototype.hasOwnProperty.call(source, 'textDecoration')){
      css.textDecoration = source.textDecoration ? String(source.textDecoration) : 'none';
      hasAny = true;
    }
    if(Object.prototype.hasOwnProperty.call(source, 'baselineShift')){
      const baseline = source.baselineShift;
      css.verticalAlign = (baseline === 'sub' || baseline === 'super') ? baseline : 'baseline';
      hasAny = true;
    }
    return { css, hasAny };
  }

  function applyCssPatchToStyle(styleDecl, patch){
    if(!styleDecl || !patch){ return; }
    Object.keys(patch).forEach(key => {
      const value = patch[key];
      if(value === undefined || value === null || value === ''){
        try{ styleDecl.removeProperty(key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)); }catch(e){}
        try{ styleDecl[key] = ''; }catch(e){}
      }else{
        try{ styleDecl[key] = String(value); }catch(e){}
      }
    });
  }

  function applyContentEditableSelectionPatch(target, patch, meta){
    if(!isContentEditableTarget(target)){
      return { handled: false };
    }
    const resolved = resolveContentEditableSelectionRange(target);
    if(!resolved || !resolved.range){
      return { handled: false };
    }
    const patchInfo = buildContentEditableStylePatch(patch);
    if(!patchInfo.hasAny){
      return { handled: false };
    }
    const { doc, selection, range } = resolved;
    const isFull = isFullSelectionForTarget(range, target);
    try{
      const fragment = range.extractContents();
      const wrapper = doc.createElement('span');
      wrapper.dataset.fontInlinePatch = '1';
      applyCssPatchToStyle(wrapper.style, patchInfo.css);
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
      const nextRange = doc.createRange();
      nextRange.selectNodeContents(wrapper);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      cacheContentEditableSelection(target, 'patch-applied');
      logDebug('contenteditable selection patch applied', {
        meta,
        patchKeys: Object.keys(patch || {}),
        entire: isFull
      });
      return { handled: true, partial: !isFull, entire: isFull };
    }catch(err){
      logDebug('contenteditable selection patch failed', {
        meta,
        error: err?.message || String(err)
      });
      return { handled: false };
    }
  }

  function resolveSelectionStyleNode(target){
    if(!isContentEditableTarget(target)){
      return null;
    }
    const doc = target.ownerDocument || global.document;
    const selection = getSelectionObject(doc);
    if(!selection || selection.rangeCount < 1){
      return null;
    }
    const range = selection.getRangeAt(0);
    if(!range || range.collapsed || !isRangeInsideTarget(range, target)){
      return null;
    }
    if(!range){ return null; }
    let node = range.startContainer;
    if(node && node.nodeType === 3){
      node = node.parentElement || node.parentNode;
    }
    return (node && node.nodeType === 1) ? node : null;
  }

  function applyDirectStyleToken(node, attrName, value){
    if(!node){ return; }
    const useSvgAttr = isSvgTextTarget(node);
    if(useSvgAttr){
      if(value === undefined || value === null || value === ''){
        node.removeAttribute(attrName);
      }else{
        node.setAttribute(attrName, value);
      }
      return;
    }
    if(!node.style){ return; }
    const nextValue = value === undefined || value === null ? '' : String(value);
    if(attrName === 'font-family'){
      node.style.fontFamily = nextValue;
      return;
    }
    if(attrName === 'font-weight'){
      node.style.fontWeight = nextValue;
      return;
    }
    if(attrName === 'font-style'){
      node.style.fontStyle = nextValue;
      return;
    }
    if(attrName === 'font-size'){
      node.style.fontSize = nextValue;
      return;
    }
    if(attrName === 'fill'){
      node.style.color = nextValue;
      return;
    }
    if(attrName === 'text-decoration'){
      node.style.textDecoration = nextValue;
      return;
    }
    if(attrName === 'baseline-shift'){
      node.style.verticalAlign = nextValue;
    }
  }

  function captureStyleSnapshot(node){
    if(!node){ return null; }
    const isSvgNode = isSvgTextTarget(node);
    const readToken = (attrName, cssProp) => {
      if(isSvgNode){
        return node.getAttribute(attrName) || null;
      }
      const styleValue = node.style && cssProp ? (node.style[cssProp] || '') : '';
      if(styleValue){
        return styleValue;
      }
      if(attrName === 'fill'){
        const colorValue = node.style ? (node.style.color || '') : '';
        return colorValue || null;
      }
      if(attrName === 'baseline-shift'){
        const baseline = node.style ? (node.style.verticalAlign || '') : '';
        return baseline || null;
      }
      return node.getAttribute(attrName) || null;
    };
    const snapshot = {
      fontFamily: readToken('font-family', 'fontFamily'),
      fontWeight: readToken('font-weight', 'fontWeight'),
      fontStyle: readToken('font-style', 'fontStyle'),
      fontSize: readToken('font-size', 'fontSize'),
      fill: readToken('fill', 'color'),
      textDecoration: readToken('text-decoration', 'textDecoration'),
      baselineShift: readToken('baseline-shift', 'verticalAlign'),
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

  function applyStyleSnapshot(node, snapshot, options){
    if(!node){ return; }
    const storeContext = options?.storeContext || resolveStoreContext(node, {
      scopeId: options?.scopeId,
      key: options?.key,
      mode: options?.mode
    });
    if(!snapshot || isStyleEmpty(snapshot)){
      clearStyleFromNode(node);
    } else {
      applyStyleToNode(node, snapshot);
    }
    storeStyleForNode(node, snapshot, storeContext);
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
    const storeContext = meta?.storeContext || resolveStoreContext(node);
    const scope = inferUndoScopeForNode(node);
    const label = `font-controls:${describeUndoTarget(node, meta)}`;
    const prevClone = prevSnapshot ? { ...prevSnapshot } : null;
    const nextClone = nextSnapshot ? { ...nextSnapshot } : null;
    manager.record({
      label,
      scope,
      undo: () => {
        applyStyleSnapshot(node, prevClone, { storeContext });
        logDebug('undo applied for style change', { label, scope });
      },
      redo: () => {
        applyStyleSnapshot(node, nextClone, { storeContext });
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

  function scopePreferenceKey(scopeId){
    return scopeId || '__global__';
  }

  function normalizeTabId(raw){
    if(raw == null){ return null; }
    const trimmed = String(raw).trim();
    return trimmed ? trimmed : null;
  }

  function resolveActiveWorkspaceTabId(){
    try{
      const hot = Shared.hot || global.Shared?.hot;
      if(hot && typeof hot.resolveActiveTabId === 'function'){
        const fromHot = normalizeTabId(hot.resolveActiveTabId());
        if(fromHot){ return fromHot; }
      }
    }catch(err){
      logDebug('resolveActiveWorkspaceTabId hot resolver failed', { error: err?.message || String(err) });
    }
    try{
      const mainSession = global.Main?.session || null;
      if(mainSession && typeof mainSession.getActiveTab === 'function'){
        const active = mainSession.getActiveTab();
        const fromSession = normalizeTabId(active?.id);
        if(fromSession){ return fromSession; }
      }
    }catch(err){
      logDebug('resolveActiveWorkspaceTabId session resolver failed', { error: err?.message || String(err) });
    }
    try{
      const doc = global.document;
      if(doc && typeof doc.querySelector === 'function'){
        const activeBtn = doc.querySelector('.workspace-tab.is-active[data-tab-id]');
        const fromDom = normalizeTabId(activeBtn?.dataset?.tabId);
        if(fromDom){ return fromDom; }
      }
    }catch(err){
      logDebug('resolveActiveWorkspaceTabId dom resolver failed', { error: err?.message || String(err) });
    }
    return null;
  }

  function sanitizeTabToken(tabId){
    if(!tabId){ return null; }
    return sanitizeStoreToken(tabId);
  }

  function resolveStoreTabToken(options){
    const opts = options || {};
    const node = opts.node || opts.target || null;
    const datasetTab = normalizeTabId(node?.dataset?.fontTabId || node?.dataset?.tabId || null);
    const explicitTab = normalizeTabId(opts.tabId || opts.workspaceTabId || null);
    const activeTab = resolveActiveWorkspaceTabId();
    return sanitizeTabToken(datasetTab || explicitTab || activeTab || null);
  }

  function getScopeMode(scopeId){
    const key = scopePreferenceKey(scopeId || currentScope);
    return scopeModePreferences.get(key) || FONT_SCOPE_SELECTION;
  }

  function setScopeMode(scopeId, mode){
    const normalized = mode === FONT_SCOPE_GRAPH ? FONT_SCOPE_GRAPH : FONT_SCOPE_SELECTION;
    activeScopeMode = normalized;
    scopeModePreferences.set(scopePreferenceKey(scopeId || currentScope), normalized);
    if(scopeSelectEl && scopeSelectEl.value !== normalized){
      scopeSelectEl.value = normalized;
    }
    if(panelEl){
      panelEl.dataset.scopeMode = normalized;
    }
    refreshScopeFooter();
    updatePanelContext();
  }

  function syncScopeModeForCurrentTarget(){
    const mode = getScopeMode(currentScope);
    activeScopeMode = mode;
    if(scopeSelectEl){
      scopeSelectEl.value = mode;
    }
    if(panelEl){
      panelEl.dataset.scopeMode = mode;
    }
    refreshScopeFooter();
    return mode;
  }

  function isGraphScopeMode(){
    return activeScopeMode === FONT_SCOPE_GRAPH;
  }

  function resolveStoreContext(target, options){
    const dataset = target?.dataset || {};
    const scopeId = options?.scopeId ?? dataset.fontScope ?? currentScope ?? null;
    const key = options?.key ?? dataset.fontKey ?? currentKey ?? null;
    const mode = options?.mode || getScopeMode(scopeId);
    const tabId = options?.tabId ?? dataset.fontTabId ?? null;
    if(mode === FONT_SCOPE_GRAPH){
      return {
        scopeId,
        key: GRAPH_SCOPE_TOKEN,
        tabId,
        mode,
        storeKey: buildStoreKey(scopeId, GRAPH_SCOPE_TOKEN, { target, tabId })
      };
    }
    return {
      scopeId,
      key,
      tabId,
      mode: FONT_SCOPE_SELECTION,
      storeKey: buildStoreKey(scopeId, key, { target, tabId })
    };
  }

  function handleInlineSelectionPatch(patch, meta){
    if(!currentTarget){ return { handled: false }; }
    if(isGraphScopeMode()){
      logDebug('inline selection patch skipped (graph scope active)', {
        meta,
        patchKeys: Object.keys(patch || {})
      });
      return { handled: false };
    }
    if(isContentEditableTarget(currentTarget)){
      const contentEditableResult = applyContentEditableSelectionPatch(currentTarget, patch || {}, meta);
      if(contentEditableResult.handled){
        return contentEditableResult;
      }
    }
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
    logDebug('toolbar width sync applied', {
      reason,
      panelOpen: panelEl ? panelEl.dataset.open : '0',
      fieldWidth
    });
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

  function formatFontSizeToken(value){
    if(value === null || typeof value === 'undefined'){ return ''; }
    const trimmed = String(value).trim();
    if(!trimmed){ return ''; }
    const numeric = parseFloat(trimmed);
    if(!Number.isFinite(numeric)){ return trimmed; }
    const rounded = Math.round(numeric * 100) / 100;
    return rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function pxToPt(px){
    const n = Number(px);
    if(!Number.isFinite(n)) return null;
    return n * 0.75; // 1px = 0.75pt (96px == 72pt)
  }

  function ptToPx(pt){
    const n = Number(pt);
    if(!Number.isFinite(n)) return null;
    return n * (96/72); // 1pt = 1.333333...px
  }

  function normalizeFontSizeValue(value, meta){
    const fixed = formatFontSizeToken(value);
    if(!fixed){ return ''; }
    logDebug('font size normalized', {
      raw: value,
      rounded: fixed,
      source: meta?.source || 'normalize'
    });
    return fixed;
  }

  function resolveToolbarHost(scopeId){
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    if(typeof toolbarApi.resolveHost === 'function'){
      const sharedHost = toolbarApi.resolveHost(scopeId);
      if(sharedHost){
        toolbarHostMap.set(scopeId || '__global__', sharedHost);
        return sharedHost;
      }
    }
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
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    if(typeof toolbarApi.showHost === 'function'){
      toolbarApi.showHost(host);
      logDebug('toolbar host shown', { scopeId: host.dataset?.fontToolbarScope || null, via: 'workspaceToolbar' });
      return;
    }
    try{
      Array.from(host.classList || []).forEach(cls => {
        if(typeof cls === 'string' && cls.indexOf('font-toolbar-host--') === 0 && cls !== 'font-toolbar-host--visible'){
          host.classList.remove(cls);
        }
      });
      host.style.removeProperty('grid-auto-flow');
      host.style.removeProperty('grid-auto-columns');
      host.style.removeProperty('column-gap');
      host.style.removeProperty('row-gap');
      host.style.removeProperty('align-items');
      host.style.removeProperty('justify-content');
      host.style.removeProperty('overflow-x');
      host.style.removeProperty('overflow-y');
    }catch(e){}
    host.style.display = 'block';
    host.classList.add('font-toolbar-host--visible');
    updateDockActiveState(host, true);
    logDebug('toolbar host shown', { scopeId: host.dataset?.fontToolbarScope || null });
  }

  function hideToolbarHost(host){
    if(!host){ return; }
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    if(typeof toolbarApi.hideHost === 'function'){
      toolbarApi.hideHost(host);
      logDebug('toolbar host hidden', { scopeId: host.dataset?.fontToolbarScope || null, via: 'workspaceToolbar' });
      return;
    }
    try{
      Array.from(host.classList || []).forEach(cls => {
        if(typeof cls === 'string' && cls.indexOf('font-toolbar-host--') === 0){
          host.classList.remove(cls);
        }
      });
    }catch(e){
      host.classList.remove('font-toolbar-host--visible');
    }
    host.style.display = 'none';
    host.style.removeProperty('grid-auto-flow');
    host.style.removeProperty('grid-auto-columns');
    host.style.removeProperty('column-gap');
    host.style.removeProperty('row-gap');
    host.style.removeProperty('align-items');
    host.style.removeProperty('justify-content');
    host.style.removeProperty('overflow-x');
    host.style.removeProperty('overflow-y');
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

  // Hide all component-created toolbar hosts (do not close the singleton font panel)
  function hideComponentHosts(){
    if(!global.document) return;
    try{
      const doc = global.document;
      const hosts = Array.from(doc.querySelectorAll('.font-toolbar-host'));
      hosts.forEach(h => {
        try{
          // attempt to remove any attached doc click handlers stored on the host
          for(const k in h){
            try{
              if(k && typeof k === 'string' && (k.toLowerCase().includes('docclick') || k.toLowerCase().includes('docclickhandler'))){
                const fn = h[k];
                if(typeof fn === 'function'){
                  document.removeEventListener('click', fn);
                }
                try{ h[k] = null; }catch(e){}
              }
            }catch(e){}
          }
        }catch(e){}
        try{ hideToolbarHost(h); }catch(e){}
      });
    }catch(err){
      logDebug('hideComponentHosts error', { err: String(err) });
    }
  }

  // Close the singleton font panel and hide component hosts
  function hideAllFormatControls(){
    try{
      // close the font controls panel
      try{ closePanel('hideAll'); }catch(e){}
      // hide any per-component toolbar hosts
      hideComponentHosts();
      // also close axis controls if present to avoid mixed toolbar UI
      try{
        const axisControls = Shared?.axisControls || (global && global.Shared && global.Shared.axisControls);
        if(axisControls && typeof axisControls.close === 'function'){
          try{ axisControls.close('hideAllFromFont'); }catch(e){}
        }
      }catch(e){}
      try{
        const significanceControls = Shared?.significanceControls || (global && global.Shared && global.Shared.significanceControls);
        if(significanceControls && typeof significanceControls.close === 'function'){
          try{ significanceControls.close('hideAllFromFont'); }catch(e){}
        }
      }catch(e){}
      try{
        const additionalLineControls = Shared?.additionalLineControls || (global && global.Shared && global.Shared.additionalLineControls);
        if(additionalLineControls && typeof additionalLineControls.close === 'function'){
          try{ additionalLineControls.close('hideAllFromFont'); }catch(e){}
        }
      }catch(e){}
      try{
        const gridControls = Shared?.gridControls || (global && global.Shared && global.Shared.gridControls);
        if(gridControls && typeof gridControls.close === 'function'){
          try{ gridControls.close('hideAllFromFont'); }catch(e){}
        }
      }catch(e){}
    }catch(err){
      logDebug('hideAllFormatControls error', { err: String(err) });
    }
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
    refreshOpenComboMenuPlacement('font-open');
    attachComboMenuViewportWatcher();
    const focusMode = meta?.focusOption || null;
    if(focusMode){
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
    }
    // Defer any local font hydration to avoid blocking menu open.
    if(typeof hydrateLocalFonts === 'function' && !meta?.skipHydrate){
      setTimeout(() => {
        try{
          hydrateLocalFonts(trigger || 'menu-open').catch(() => {});
        }catch(e){}
      }, 0);
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
    clearComboMenuFloating(fontMenuPopup);
    if(!sizeMenuVisible){
      detachComboMenuViewportWatcher();
    }
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

  function hostUsesDualToolbarLayout(){
    if(!activeHost || !activeHost.classList){ return false; }
    return Array.from(activeHost.classList).some(cls => typeof cls === 'string' && /^font-toolbar-host--.+-dual$/.test(cls));
  }

  function clearComboMenuFloating(popup){
    if(!popup){ return; }
    popup.classList.remove('font-controls-panel__combo-menu--floating');
    if(popup.dataset && popup.dataset.fontControlsOverlay === '1'){
      delete popup.dataset.fontControlsOverlay;
    }
    popup.style.removeProperty('position');
    popup.style.removeProperty('left');
    popup.style.removeProperty('top');
    popup.style.removeProperty('right');
    popup.style.removeProperty('bottom');
    popup.style.removeProperty('width');
    popup.style.removeProperty('min-width');
    popup.style.removeProperty('max-width');
    popup.style.removeProperty('max-height');
    popup.style.removeProperty('z-index');
  }

  function applyComboMenuFloating(popup, anchor){
    if(!popup || !anchor || typeof anchor.getBoundingClientRect !== 'function'){
      clearComboMenuFloating(popup);
      return;
    }
    if(!hostUsesDualToolbarLayout()){
      clearComboMenuFloating(popup);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if(!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)){
      clearComboMenuFloating(popup);
      return;
    }
    const viewportWidth = Number.isFinite(global.innerWidth) ? global.innerWidth : 0;
    const viewportHeight = Number.isFinite(global.innerHeight) ? global.innerHeight : 0;
    const margin = 4;
    const width = Math.max(80, Math.ceil(rect.width + 2));
    let left = Math.round(rect.left - 1);
    if(viewportWidth > 0){
      left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
    }
    let top = Math.round(rect.bottom - 1);
    let maxHeight = 220;
    if(viewportHeight > 0){
      const below = viewportHeight - top - margin;
      const above = rect.top - margin;
      if(below < 120 && above > below){
        maxHeight = Math.max(100, Math.min(220, Math.floor(above)));
        top = Math.max(margin, Math.round(rect.top - maxHeight));
      }else{
        maxHeight = Math.max(100, Math.min(220, Math.floor(below)));
      }
    }
    popup.classList.add('font-controls-panel__combo-menu--floating');
    popup.dataset.fontControlsOverlay = '1';
    popup.style.position = 'fixed';
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';
    popup.style.width = `${width}px`;
    popup.style.minWidth = `${width}px`;
    popup.style.maxWidth = `${width}px`;
    popup.style.maxHeight = `${Math.max(100, maxHeight)}px`;
    popup.style.zIndex = '12050';
  }

  function refreshOpenComboMenuPlacement(reason){
    if(fontMenuVisible){
      applyComboMenuFloating(fontMenuPopup, fontComboWrapper);
    }else{
      clearComboMenuFloating(fontMenuPopup);
    }
    if(sizeMenuVisible){
      applyComboMenuFloating(sizeMenuPopup, sizeComboWrapper);
    }else{
      clearComboMenuFloating(sizeMenuPopup);
    }
    logDebug('combo menu placement refreshed', {
      reason: reason || 'unknown',
      dualHost: hostUsesDualToolbarLayout(),
      fontOpen: fontMenuVisible,
      sizeOpen: sizeMenuVisible
    });
  }

  function detachComboMenuViewportWatcher(){
    if(!comboMenuViewportHandler || !global.removeEventListener){ return; }
    try{ global.removeEventListener('resize', comboMenuViewportHandler, true); }catch(e){}
    try{ global.removeEventListener('scroll', comboMenuViewportHandler, true); }catch(e){}
    comboMenuViewportHandler = null;
    comboMenuViewportRaf = null;
  }

  function attachComboMenuViewportWatcher(){
    if(comboMenuViewportHandler || !global.addEventListener){ return; }
    const scheduleRefresh = () => {
      if(comboMenuViewportRaf != null){ return; }
      const run = () => {
        comboMenuViewportRaf = null;
        if(!fontMenuVisible && !sizeMenuVisible){
          detachComboMenuViewportWatcher();
          return;
        }
        refreshOpenComboMenuPlacement('viewport');
      };
      if(typeof global.requestAnimationFrame === 'function'){
        comboMenuViewportRaf = global.requestAnimationFrame(run);
      }else{
        comboMenuViewportRaf = global.setTimeout(run, 16);
      }
    };
    comboMenuViewportHandler = scheduleRefresh;
    try{ global.addEventListener('resize', comboMenuViewportHandler, true); }catch(e){}
    try{ global.addEventListener('scroll', comboMenuViewportHandler, true); }catch(e){}
  }

  function detachSizeMenuDismissWatcher(){
    if(!sizeMenuCloseHandler || !global.document){ return; }
    global.document.removeEventListener('pointerdown', sizeMenuCloseHandler, true);
    sizeMenuCloseHandler = null;
  }

  function attachSizeMenuDismissWatcher(){
    if(sizeMenuCloseHandler || !global.document || !sizeComboWrapper){ return; }
    const doc = global.document;
    sizeMenuCloseHandler = (evt) => {
      if(!sizeMenuVisible){ return; }
      const target = evt.target;
      if(sizeComboWrapper.contains(target)){ return; }
      closeSizeMenu('outside');
    };
    doc.addEventListener('pointerdown', sizeMenuCloseHandler, true);
  }

  function getVisibleSizeOptions(){
    if(!sizeMenuPopup){ return []; }
    const nodes = sizeMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
    return Array.from(nodes).filter(node => node.dataset.hidden !== '1' && !node.hidden);
  }

  function focusRelativeSizeOption(current, delta){
    if(!sizeMenuPopup){ return; }
    const visible = getVisibleSizeOptions();
    if(!visible.length){ return; }
    const index = visible.indexOf(current);
    if(index === -1){
      const first = delta > 0 ? visible[0] : visible[visible.length - 1];
      if(first){ first.focus(); }
      return;
    }
    const nextIndex = Math.min(Math.max(0, index + delta), visible.length - 1);
    visible[nextIndex].focus();
  }

  function focusFirstSizeOption(){
    const visible = getVisibleSizeOptions();
    if(visible.length){
      visible[0].focus();
    }
  }

  function focusLastSizeOption(){
    const visible = getVisibleSizeOptions();
    if(visible.length){
      visible[visible.length - 1].focus();
    }
  }

  function highlightSizeMenuSelection(value){
    if(!sizeMenuPopup){ return; }
    const normalized = formatFontSizeToken(value);
    const options = sizeMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
    options.forEach(option => {
      const optionValue = option.dataset.value || '';
      const isActive = normalized && optionValue && formatFontSizeToken(optionValue) === normalized;
      option.classList.toggle('font-controls-panel__combo-option--active', isActive);
      option.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if(isActive && sizeMenuVisible && typeof option.scrollIntoView === 'function'){
        option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }

  function openSizeMenu(trigger, meta){
    if(!sizeMenuPopup || sizeMenuVisible){ return; }
    sizeMenuPopup.hidden = false;
    sizeMenuPopup.classList.add('font-controls-panel__combo-menu--open');
    sizeMenuVisible = true;
    if(sizeMenuToggle){
      sizeMenuToggle.setAttribute('aria-expanded', 'true');
    }
    if(sizeInput){
      sizeInput.setAttribute('aria-expanded', 'true');
    }
    highlightSizeMenuSelection(sizeInput?.value || '');
    attachSizeMenuDismissWatcher();
    refreshOpenComboMenuPlacement('size-open');
    attachComboMenuViewportWatcher();
    const focusMode = meta?.focusOption || null;
    if(focusMode){
      const focusTask = () => {
        if(focusMode === 'first'){
          focusFirstSizeOption();
        } else if(focusMode === 'last'){
          focusLastSizeOption();
        } else if(focusMode === 'active'){
          const active = sizeMenuPopup.querySelector('.font-controls-panel__combo-option--active');
          if(active){
            active.focus();
          } else {
            focusFirstSizeOption();
          }
        }
      };
      setTimeout(focusTask, 0);
    }
    logDebug('size menu opened', {
      trigger: trigger || 'unknown',
      focusMode
    });
  }

  function closeSizeMenu(reason){
    if(!sizeMenuPopup || !sizeMenuVisible){ return; }
    sizeMenuPopup.hidden = true;
    sizeMenuPopup.classList.remove('font-controls-panel__combo-menu--open');
    sizeMenuVisible = false;
    if(sizeMenuToggle){
      sizeMenuToggle.setAttribute('aria-expanded', 'false');
    }
    if(sizeInput){
      sizeInput.setAttribute('aria-expanded', 'false');
    }
    detachSizeMenuDismissWatcher();
    clearComboMenuFloating(sizeMenuPopup);
    if(!fontMenuVisible){
      detachComboMenuViewportWatcher();
    }
    if(reason !== 'button-toggle'){
      highlightSizeMenuSelection(sizeInput?.value || '');
    }
    logDebug('size menu closed', {
      reason: reason || 'unknown'
    });
  }

  function toggleSizeMenu(trigger, meta){
    if(sizeMenuVisible){
      closeSizeMenu(trigger || 'toggle');
    } else {
      openSizeMenu(trigger || 'toggle', meta);
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
    const scopeModeLabel = isGraphScopeMode() ? 'Graph scope' : 'Selection scope';
    parts.push(scopeModeLabel);
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

  function refreshScopeFooter(){
    if(!footerEl){ return; }
    footerEl.textContent = isGraphScopeMode()
      ? 'Changes apply to all fonts in this graph.'
      : 'Changes apply to the selected text group.';
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
    let basePreviewSize = null;
    if(Number.isFinite(explicitSize)){
      const pxFromPt = ptToPx(explicitSize);
      basePreviewSize = Number.isFinite(pxFromPt) ? pxFromPt : explicitSize;
    }
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

  function buildStoreKey(scopeId, key, options){
    const scope = scopeId || '__global__';
    const token = key || '__default__';
    const tabToken = resolveStoreTabToken(options);
    if(tabToken){
      return `${scope}::${TAB_SCOPE_TOKEN_PREFIX}${tabToken}::${token}`;
    }
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
    const normalizeRgbChannel = token => {
      if(token === undefined || token === null){ return null; }
      const raw = String(token).trim();
      if(!raw){ return null; }
      if(raw.endsWith('%')){
        const percent = Number.parseFloat(raw.slice(0, -1));
        if(!Number.isFinite(percent)){ return null; }
        return Math.max(0, Math.min(255, Math.round((percent / 100) * 255)));
      }
      const numeric = Number.parseFloat(raw);
      if(!Number.isFinite(numeric)){ return null; }
      return Math.max(0, Math.min(255, Math.round(numeric)));
    };
    const functionMatch = trimmed.match(/^rgba?\((.*)\)$/i);
    if(functionMatch){
      const body = String(functionMatch[1] || '')
        .replace(/\s*\/\s*[^,]+$/i, '')
        .trim();
      const parts = body.includes(',')
        ? body.split(',').map(part => part.trim())
        : body.split(/\s+/).map(part => part.trim());
      if(parts.length >= 3){
        const r = normalizeRgbChannel(parts[0]);
        const g = normalizeRgbChannel(parts[1]);
        const b = normalizeRgbChannel(parts[2]);
        if(Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)){
          const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
          const hex = [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
          return `#${hex}`;
        }
      }
    }
    const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
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
      const computed = String(global.getComputedStyle(helper).color || '').trim();
      doc.body.removeChild(helper);
      if(!computed || computed.toLowerCase() === trimmed.toLowerCase()){
        return '#000000';
      }
      return parseColorToHex(computed);
    } catch(resolveErr){
      logDebug('parseColor fallback error', { color, resolveErr });
      return '#000000';
    }
  }

  function applyStyleToNode(node, style){
    if(!node || !style){ return; }
    const isSvgNode = isSvgTextTarget(node);
    const applyToken = (attrName, cssProp, value) => {
      if(isSvgNode){
        if(value){ node.setAttribute(attrName, value); } else { node.removeAttribute(attrName); }
        return;
      }
      if(!node.style){ return; }
      if(cssProp === 'color'){
        node.style.color = value || '';
        return;
      }
      if(cssProp === 'verticalAlign'){
        node.style.verticalAlign = value || '';
        return;
      }
      node.style[cssProp] = value || '';
    };
    applyToken('font-family', 'fontFamily', style.fontFamily);
    applyToken('font-weight', 'fontWeight', style.fontWeight);
    applyToken('font-style', 'fontStyle', style.fontStyle);
    applyToken('font-size', 'fontSize', style.fontSize);
    applyToken('fill', 'color', style.fill);
    applyToken('text-decoration', 'textDecoration', style.textDecoration);
    applyToken('baseline-shift', 'verticalAlign', style.baselineShift);
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
    const isSvgNode = isSvgTextTarget(node);
    if(isSvgNode){
      node.removeAttribute('font-family');
      node.removeAttribute('font-weight');
      node.removeAttribute('font-style');
      node.removeAttribute('font-size');
      node.removeAttribute('fill');
      node.removeAttribute('text-decoration');
      node.removeAttribute('baseline-shift');
    }else if(node.style){
      node.style.fontFamily = '';
      node.style.fontWeight = '';
      node.style.fontStyle = '';
      node.style.fontSize = '';
      node.style.color = '';
      node.style.textDecoration = '';
      node.style.verticalAlign = '';
    }
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

  function storeStyleForNode(node, style, options){
    if(!node){ return; }
    const dataset = node.dataset || {};
    const scope = options?.scopeId ?? dataset.fontScope ?? null;
    const key = options?.key ?? dataset.fontKey ?? null;
    const tabId = options?.tabId ?? dataset.fontTabId ?? null;
    const storeKey = options?.storeKey || buildStoreKey(scope, key, { node, tabId });
    const explicitEditable = dataset.fontEditable === '1';
    if(!explicitEditable && !scope && !key){
      logDebug('storeStyleForNode skipped (no scope/key for implicit node)', {
        text: node.textContent,
        hasDataset: !!dataset,
      });
      return;
    }
    const normalized = cloneStyleSnapshot(style);
    if(!normalized){
      styleStore.delete(storeKey);
      broadcastStyle(storeKey, null, node);
      logDebug('storeStyleForNode cleared', { scope, key, storeKey });
    } else {
      styleStore.set(storeKey, normalized);
      broadcastStyle(storeKey, normalized, node);
      logDebug('storeStyleForNode saved', {
        scope,
        key,
        storeKey,
        style: normalized,
        hasInlineSegments: styleHasInlineSegments(normalized)
      });
    }
    if(options?.suppressStyleChangedEvent === true){
      logDebug('storeStyleForNode styleChanged dispatch suppressed', {
        scope: scope || null,
        key: key || null,
        storeKey
      });
      return;
    }
    try{
      if(global.document && typeof global.document.dispatchEvent === 'function'){
        const detail = { scopeId: scope || null, tabId: tabId || null, key: key || null, storeKey, style: normalized || null };
        let evt;
        if(typeof global.CustomEvent === 'function'){
          evt = new global.CustomEvent('fontControls:styleChanged', { detail });
        }else if(typeof global.document.createEvent === 'function'){
          evt = global.document.createEvent('Event');
          evt.initEvent('fontControls:styleChanged', false, false);
          evt.detail = detail;
        }
        if(evt){
          global.document.dispatchEvent(evt);
        }
      }
    }catch(dispatchErr){
      logDebug('storeStyleForNode dispatch error', { error: dispatchErr?.message || String(dispatchErr) });
    }
  }

  function extractStoreTokenFromKey(storeKey, prefix){
    if(!storeKey || !prefix || !storeKey.startsWith(prefix)){ return null; }
    return storeKey.slice(prefix.length) || '__default__';
  }

  function isTabbedStoreKey(storeKey, scope){
    if(!storeKey){ return false; }
    const prefix = `${scope}::${TAB_SCOPE_TOKEN_PREFIX}`;
    return storeKey.startsWith(prefix);
  }

  function exportScopeStyles(scopeId, options){
    const scope = scopeId || '__global__';
    const opts = options || {};
    const tabToken = resolveStoreTabToken(opts);
    const tabPrefix = tabToken ? `${scope}::${TAB_SCOPE_TOKEN_PREFIX}${tabToken}::` : null;
    const legacyPrefix = `${scope}::`;
    const payload = {};
    let count = 0;
    styleStore.forEach((style, storeKey) => {
      let token = null;
      if(tabPrefix){
        token = extractStoreTokenFromKey(storeKey, tabPrefix);
      }else{
        if(isTabbedStoreKey(storeKey, scope)){ return; }
        token = extractStoreTokenFromKey(storeKey, legacyPrefix);
      }
      if(!token){ return; }
      const snapshot = cloneStyleSnapshot(style);
      if(!snapshot){ return; }
      payload[token] = snapshot;
      count += 1;
    });
    if(!count && tabPrefix){
      styleStore.forEach((style, storeKey) => {
        if(isTabbedStoreKey(storeKey, scope)){ return; }
        const token = extractStoreTokenFromKey(storeKey, legacyPrefix);
        if(!token){ return; }
        const snapshot = cloneStyleSnapshot(style);
        if(!snapshot){ return; }
        payload[token] = snapshot;
        count += 1;
      });
    }
    if(!count){
      logDebug('exportScopeStyles skipped (empty)', { scope, tabToken: tabToken || null });
      return null;
    }
    logDebug('exportScopeStyles captured', { scope, tabToken: tabToken || null, count });
    return payload;
  }

  function importScopeStyles(scopeId, styles, options){
    const scope = scopeId || '__global__';
    const opts = options || {};
    const tabToken = resolveStoreTabToken(opts);
    const prefix = tabToken ? `${scope}::${TAB_SCOPE_TOKEN_PREFIX}${tabToken}::` : `${scope}::`;
    const legacyPrefix = `${scope}::`;
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
        if(!storeKey || keep.has(storeKey)){
          return;
        }
        if(tabToken){
          const isCurrentTabKey = storeKey.startsWith(prefix);
          const isLegacyScopeKey = storeKey.startsWith(legacyPrefix) && !isTabbedStoreKey(storeKey, scope);
          if(isCurrentTabKey || isLegacyScopeKey){
            stale.push(storeKey);
          }
          return;
        }
        if(storeKey.startsWith(prefix) && !isTabbedStoreKey(storeKey, scope)){
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
      tabToken: tabToken || null,
      imported: incoming ? Object.keys(incoming).length : 0,
      pruned: opts.prune === false ? 0 : undefined
    });
  }

  function storeCurrentStyle(style){
    if(!currentTarget){ return; }
    const context = resolveStoreContext(currentTarget, { scopeId: currentScope, key: currentKey });
    storeStyleForNode(currentTarget, style, context);
  }

  function syncPanelStateFromTarget(){
    if(!panelEl || !currentTarget){ return; }
    const styleNode = resolveSelectionStyleNode(currentTarget) || currentTarget;
    const computed = global.getComputedStyle(styleNode);
    const snapshot = captureStyleSnapshot(styleNode) || captureStyleSnapshot(currentTarget) || {};
    const attrFamily = snapshot.fontFamily || computed.fontFamily || '';
    const attrWeight = snapshot.fontWeight || computed.fontWeight || '';
    const attrStyle = snapshot.fontStyle || computed.fontStyle || '';
    const attrSize = snapshot.fontSize || computed.fontSize || '';
    const attrFill = snapshot.fill || computed.color || computed.fill || '#000000';
    const attrDecoration = snapshot.textDecoration || computed.textDecoration || '';
    const attrBaseline = snapshot.baselineShift || computed.verticalAlign || computed.baselineShift || '';
    const sanitizedFamily = attrFamily.replace(/"/g, '').trim();
    syncFontInputValue(sanitizedFamily, { source: 'target-sync' });
    if(colorInput){
      colorInput.value = parseColorToHex(attrFill);
    }
    if(sizeInput){
      let displayVal = '';
      const raw = String(attrSize || '').trim();
      const m = raw.match(/^(-?\d*\.?\d+)\s*(px|pt)?$/i);
      if(m){
        const num = parseFloat(m[1]);
        const unit = (m[2] || '').toLowerCase();
        if(unit === 'pt'){
          displayVal = Number.isFinite(num) ? normalizeFontSizeValue(num, { source: 'target-sync' }) : '';
        } else {
          // treat px (or unspecified unit) as px and convert to pt for display
          const ptVal = pxToPt(num);
          displayVal = Number.isFinite(ptVal) ? normalizeFontSizeValue(ptVal, { source: 'target-sync' }) : '';
        }
      }
      sizeInput.value = displayVal;
      highlightSizeMenuSelection(sizeInput.value || '');
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
    if(!contentSelectionTrackingHandler){
      contentSelectionTrackingHandler = () => {
        if(!currentTarget || !isContentEditableTarget(currentTarget)){ return; }
        cacheContentEditableSelection(currentTarget, 'selectionchange');
      };
    }
    if(contentSelectionTrackingDoc !== doc && contentSelectionTrackingHandler){
      try{
        if(contentSelectionTrackingDoc){
          contentSelectionTrackingDoc.removeEventListener('selectionchange', contentSelectionTrackingHandler, true);
        }
      }catch(e){}
      try{
        doc.addEventListener('selectionchange', contentSelectionTrackingHandler, true);
        contentSelectionTrackingDoc = doc;
      }catch(err){
        logDebug('selectionchange tracking attach failed', { error: err?.message || String(err) });
      }
    }
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    const panelParts = toolbarApi.createSubPanel({
      panelClass: 'workspace-toolbar__panel--font font-controls-panel',
      role: 'toolbar',
      ariaLabel: 'Font controls',
      title: 'Font',
      rowClass: 'font-controls-panel__controls additional-line-controls-panel__row'
    });
    panelEl = panelParts.panel;
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.hidden = true;
    if(panelEl.dataset.scope){
      delete panelEl.dataset.scope;
    }
    const controlsRow = panelParts.row;

    scopeFieldEl = doc.createElement('label');
    scopeFieldEl.className = 'font-controls-panel__field additional-line-controls-panel__field font-controls-panel__field--scope';
    const scopeLabelEl = doc.createElement('span');
    scopeLabelEl.className = 'font-controls-panel__field-label additional-line-controls-panel__field-label';
    scopeLabelEl.textContent = 'Scope';
    const scopeWrapper = doc.createElement('div');
    scopeWrapper.className = 'font-controls-panel__select-wrapper';
    const scopeList = doc.createElement('div');
    scopeList.className = 'font-controls-panel__select-menu';
    scopeList.hidden = true;
    scopeSelectEl = doc.createElement('select');
    scopeSelectEl.className = 'font-controls-panel__select additional-line-controls-panel__input additional-line-controls-panel__input--select';
    const scopeSelectionOpt = doc.createElement('option');
    scopeSelectionOpt.value = FONT_SCOPE_SELECTION;
    scopeSelectionOpt.textContent = 'Selection';
    const scopeGraphOpt = doc.createElement('option');
    scopeGraphOpt.value = FONT_SCOPE_GRAPH;
    scopeGraphOpt.textContent = 'Graph';
    scopeSelectEl.appendChild(scopeSelectionOpt);
    scopeSelectEl.appendChild(scopeGraphOpt);
    scopeWrapper.appendChild(scopeSelectEl);
    scopeWrapper.appendChild(scopeList);
    scopeFieldEl.appendChild(scopeLabelEl);
    scopeFieldEl.appendChild(scopeWrapper);
    controlsRow.appendChild(scopeFieldEl);
    scopeSelectEl.value = getScopeMode(currentScope);
    scopeSelectEl.addEventListener('change', () => {
      setScopeMode(currentScope, scopeSelectEl.value);
      refreshScopeFooter();
      updatePanelContext();
      // Scope switching must be non-destructive. Do not persist the current node style
      // into the newly selected scope just by changing the dropdown.
    });

    const fontField = doc.createElement('label');
    fontField.className = 'font-controls-panel__field additional-line-controls-panel__field font-controls-panel__field--font';
    const fontFieldLabel = doc.createElement('span');
    fontFieldLabel.className = 'font-controls-panel__field-label additional-line-controls-panel__field-label';
    fontFieldLabel.textContent = 'Font';
    fontField.appendChild(fontFieldLabel);

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
    // Intentionally omit the native datalist to avoid the default suggestion bubble;
    // we drive autocompletion ourselves so the hint stays inside the input.
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
    registerFontSuggestion('');
    const knownFontNames = new Set();
    const sourceFonts = (isFirefox ? CORE_FONTS : DEFAULT_FONTS).filter(isLikelyFontForPlatform);
    const uniqueFonts = Array.from(new Set(sourceFonts));
    const normalizeFontName = (name) => {
      if(!name){ return null; }
      const trimmed = String(name).trim();
      if(!trimmed){ return null; }
      const key = trimmed.toLowerCase();
      if(knownFontNames.has(key)){ return null; }
      knownFontNames.add(key);
      return trimmed;
    };
    fontComboWrapper.appendChild(fontDatalist);
    // Keep an offscreen menu container so legacy code paths remain safe,
    // but rely on inline autocompletion for suggestions.
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

    appendFontOption = (fontName, opts) => {
      const normalized = normalizeFontName(fontName);
      if(!normalized || !fontDatalist || !fontMenuPopup){ return false; }
      if(!isLikelyFontForPlatform(normalized)){
        return false;
      }
      const skipAvailability = opts && opts.skipAvailability === true;
      if(!skipAvailability && !safeIsFontAvailable(normalized, { fallback: 'assume-available' })){
        logDebug('font skipped (unavailable)', { font: normalized });
        return false;
      }
      const option = doc.createElement('option');
      option.value = normalized;
      option.textContent = normalized;
      fontDatalist.appendChild(option);
      const optionBtn = createFontMenuOption(normalized, normalized);
      fontMenuPopup.insertBefore(optionBtn, fontMenuEmptyState);
      registerFontSuggestion(normalized);
      return true;
    };
    let appendedCount = 0;
    uniqueFonts.forEach(fontName => {
      if(appendFontOption(fontName)){ appendedCount += 1; }
    });
    if(appendedCount === 0){
      const fallbackFonts = CORE_FONTS.filter(isLikelyFontForPlatform);
      fallbackFonts.forEach(fontName => appendFontOption(fontName, { skipAvailability: true }));
    }
    hydrateLocalFonts = async (reason) => {
      if(isFirefox){
        logDebug('local font query skipped', { reason: reason || 'init', detail: 'firefox-fallback' });
        return;
      }
      if(localFontsHydrating || typeof global.queryLocalFonts !== 'function'){ return; }
      localFontsHydrating = true;
      let localFonts = [];
      try {
        localFonts = await global.queryLocalFonts();
      } catch(err){
        logDebug('local font query failed', { reason: reason || 'init', error: err?.name || err?.message || String(err) });
        localFontsHydrating = false;
        return;
      }
      if(!Array.isArray(localFonts) || !localFonts.length){
        logDebug('local font query empty', { reason: reason || 'init' });
        localFontsHydrating = false;
        return;
      }
      let added = 0;
      localFonts.forEach(entry => {
        const name = entry?.fullName || entry?.postscriptName || entry?.family || null;
        if(name && appendFontOption(name)){
          added += 1;
        }
      });
      fontMenuEmptyState.hidden = true;
      if(added){
        computeComboFieldWidth();
      }
      localFontsHydrating = false;
      logDebug('local font query complete', { reason: reason || 'init', discovered: localFonts.length, added, totalKnown: knownFontNames.size });
    };
    hydrateLocalFonts('init');
    fontField.appendChild(fontComboWrapper);

    const formatField = doc.createElement('div');
    formatField.className = 'font-controls-panel__field additional-line-controls-panel__field font-controls-panel__field--format';
    const formatLabel = doc.createElement('span');
    formatLabel.className = 'font-controls-panel__field-label additional-line-controls-panel__field-label';
    formatLabel.textContent = 'Format';
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
    formatField.appendChild(formatLabel);
    formatField.appendChild(formatButtonsRow);
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
    if(defaultMenuButton && fontMenuPopup && fontMenuEmptyState){
      fontMenuPopup.insertBefore(defaultMenuButton, fontMenuEmptyState);
      fontMenuEmptyState.hidden = true;
      highlightFontMenuSelection('');
    }
    computeComboFieldWidth();
    logDebug('font menu options created', {
      count: fontMenuPopup ? fontMenuPopup.querySelectorAll('.font-controls-panel__combo-option').length : 0
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
    sizeField.className = 'font-controls-panel__field additional-line-controls-panel__field font-controls-panel__field--size';
    const sizeLabel = doc.createElement('span');
    sizeLabel.className = 'font-controls-panel__field-label additional-line-controls-panel__field-label';
    sizeLabel.textContent = 'Size';

    sizeComboWrapper = doc.createElement('div');
    sizeComboWrapper.className = 'font-controls-panel__combo font-controls-panel__combo--size';
    const sizeComboRow = doc.createElement('div');
    sizeComboRow.className = 'font-controls-panel__combo-row';

    sizeInput = doc.createElement('input');
    sizeInput.type = 'text';
    sizeInput.min = '5';
    sizeInput.max = '96';
    sizeInput.step = '0.5';
    sizeInput.placeholder = '14';
    sizeInput.setAttribute('inputmode', 'decimal');
    sizeInput.setAttribute('autocomplete', 'off');
    sizeInput.className = 'font-controls-panel__input font-controls-panel__input--combo font-controls-panel__input--number font-controls-panel__input--size';
    sizeInput.setAttribute('aria-label', 'Font size');
    sizeInput.setAttribute('aria-haspopup', 'listbox');
    sizeInput.setAttribute('aria-expanded', 'false');
    const sizeMenuId = 'font-controls-size-menu';
    sizeInput.setAttribute('aria-controls', sizeMenuId);

    sizeComboRow.appendChild(sizeInput);

    sizeMenuToggle = doc.createElement('button');
    sizeMenuToggle.type = 'button';
    sizeMenuToggle.className = 'font-controls-panel__combo-toggle';
    sizeMenuToggle.setAttribute('aria-label', 'Show preset font sizes');
    sizeMenuToggle.setAttribute('aria-haspopup', 'listbox');
    sizeMenuToggle.setAttribute('aria-expanded', 'false');
    sizeMenuToggle.setAttribute('aria-controls', sizeMenuId);
    const sizeMenuIcon = doc.createElement('span');
    sizeMenuIcon.className = 'font-controls-panel__combo-toggle-icon';
    sizeMenuIcon.textContent = '▾';
    sizeMenuIcon.setAttribute('aria-hidden', 'true');
    sizeMenuToggle.appendChild(sizeMenuIcon);
    sizeComboRow.appendChild(sizeMenuToggle);

    sizeComboWrapper.appendChild(sizeComboRow);

    sizeMenuPopup = doc.createElement('div');
    sizeMenuPopup.id = sizeMenuId;
    sizeMenuPopup.className = 'font-controls-panel__combo-menu';
    sizeMenuPopup.setAttribute('role', 'listbox');
    sizeMenuPopup.setAttribute('aria-label', 'Common font sizes');
    sizeMenuPopup.hidden = true;
    sizeComboWrapper.appendChild(sizeMenuPopup);

    function createSizeMenuOption(value){
      const normalizedValue = formatFontSizeToken(value);
      const optionBtn = doc.createElement('button');
      optionBtn.type = 'button';
      optionBtn.className = 'font-controls-panel__combo-option';
      optionBtn.dataset.value = normalizedValue;
      optionBtn.dataset.label = normalizedValue;
      optionBtn.textContent = normalizedValue;
      optionBtn.setAttribute('role', 'option');
      optionBtn.setAttribute('tabindex', '-1');
      optionBtn.addEventListener('mousedown', (evt) => {
        evt.preventDefault();
      });
      optionBtn.addEventListener('click', () => {
        if(!sizeInput){ return; }
        sizeInput.value = normalizedValue;
        applySizeValueChange({ source: 'menu-select' });
        closeSizeMenu('menu-select');
        try {
          sizeInput.focus({ preventScroll: true });
        } catch(focusErr){
          sizeInput.focus();
        }
      });
      optionBtn.addEventListener('keydown', (evt) => {
        if(evt.key === 'ArrowDown'){
          evt.preventDefault();
          focusRelativeSizeOption(optionBtn, 1);
        } else if(evt.key === 'ArrowUp'){
          evt.preventDefault();
          focusRelativeSizeOption(optionBtn, -1);
        } else if(evt.key === 'Home'){
          evt.preventDefault();
          focusFirstSizeOption();
        } else if(evt.key === 'End'){
          evt.preventDefault();
          focusLastSizeOption();
        } else if(evt.key === 'Escape'){
          if(sizeMenuVisible){
            evt.preventDefault();
            closeSizeMenu('menu-escape');
            if(sizeInput){
              try {
                sizeInput.focus({ preventScroll: true });
              } catch(focusErr){
                sizeInput.focus();
              }
            }
          }
        } else if(evt.key === ' ' || evt.key === 'Enter'){
          evt.preventDefault();
          optionBtn.click();
        }
      });
      return optionBtn;
    }

    PRESET_FONT_SIZES.forEach(sizeValue => {
      const optionBtn = createSizeMenuOption(sizeValue);
      sizeMenuPopup.appendChild(optionBtn);
    });
    sizeField.appendChild(sizeLabel);
    sizeField.appendChild(sizeComboWrapper);
    controlsRow.appendChild(sizeField);
    controlsRow.appendChild(formatField);

    sizeMenuToggle.addEventListener('mousedown', (evt) => {
      evt.preventDefault();
    });

    sizeMenuToggle.addEventListener('click', () => {
      const wasOpen = sizeMenuVisible;
      toggleSizeMenu('button-toggle', { focusOption: 'active' });
      if(!wasOpen){
        if(sizeInput){
          try {
            sizeInput.focus({ preventScroll: true });
          } catch(focusErr){
            sizeInput.focus();
          }
        }
      } else if(sizeInput){
        try {
          sizeInput.focus({ preventScroll: true });
        } catch(focusErr){
          sizeInput.focus();
        }
      }
    });

    sizeMenuToggle.addEventListener('keydown', (evt) => {
      if(evt.key === 'ArrowDown'){
        evt.preventDefault();
        openSizeMenu('button-arrow', { focusOption: 'first' });
      } else if(evt.key === 'ArrowUp'){
        evt.preventDefault();
        openSizeMenu('button-arrow', { focusOption: 'last' });
      } else if(evt.key === 'Escape'){
        if(sizeMenuVisible){
          evt.preventDefault();
          closeSizeMenu('button-escape');
        }
      }
    });

    const colorField = doc.createElement('label');
    colorField.className = 'font-controls-panel__field additional-line-controls-panel__field font-controls-panel__field--color';
    const colorLabel = doc.createElement('span');
    colorLabel.className = 'font-controls-panel__field-label additional-line-controls-panel__field-label';
    colorLabel.textContent = 'Color';
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'font-controls-panel__color-input';
    colorInput.setAttribute('aria-label', 'Font color');
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorInput);
    controlsRow.appendChild(colorField);

    logDebug('format toggles initialized', { toggleCount: formatButtonsRow.children.length });
    resolveFormatRowWidth();

    footerEl = doc.createElement('div');
    footerEl.className = 'font-controls-panel__footer';
    panelEl.appendChild(footerEl);
    refreshScopeFooter();

    updatePanelContext();
    console.debug('Debug: font controls layout refreshed', { sections: controlsRow.children.length, closeButton: false }); // Debug: layout ready

    updatePreviewText();
    updatePreviewFromInputs();

    if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(colorInput);
    }

    function resolveStorePayloadForPatch(storeContext, nextStyle, patch, options){
      const opts = options || {};
      const normalizedPatch = (patch && typeof patch === 'object') ? patch : {};
      const nextSnapshot = cloneStyleSnapshot(nextStyle || null) || {};
      if(storeContext?.mode === FONT_SCOPE_GRAPH){
        const existingSnapshot = cloneStyleSnapshot(styleStore.get(storeContext.storeKey)) || {};
        const merged = { ...existingSnapshot };
        Object.keys(normalizedPatch).forEach(key => {
          if(!Object.prototype.hasOwnProperty.call(normalizedPatch, key)){ return; }
          const value = normalizedPatch[key];
          if(value === undefined){ return; }
          if(value === null || value === ''){
            delete merged[key];
            return;
          }
          merged[key] = value;
        });
        return cloneStyleSnapshot(merged);
      }
      const payload = { ...nextSnapshot };
      if(
        opts.includeFallbackFill
        && (payload.fill === undefined || payload.fill === null || payload.fill === '')
      ){
        const fallbackFill = opts.fallbackFill;
        if(fallbackFill !== undefined && fallbackFill !== null && fallbackFill !== ''){
          payload.fill = fallbackFill;
        }
      }
      return cloneStyleSnapshot(payload);
    }

    function commitFontFamily(rawValue, meta){
      if(!currentTarget){ return; }
      const prevStyle = captureStyleSnapshot(currentTarget);
      const storeContext = resolveStoreContext(currentTarget, { scopeId: currentScope, key: currentKey });
      const value = (rawValue || '').trim();
      const inlineResult = handleInlineSelectionPatch({ fontFamily: value || null }, {
        source: meta?.source || 'unknown',
        action: 'font-family'
      });
      if(inlineResult.handled){
        updatePreviewFromInputs();
        return;
      }
      applyDirectStyleToken(currentTarget, 'font-family', value || null);
      const nextStyle = captureStyleSnapshot(currentTarget);
      const storePayload = resolveStorePayloadForPatch(
        storeContext,
        nextStyle,
        { fontFamily: value || null },
        {
          includeFallbackFill: true,
          fallbackFill: colorInput?.value || null
        }
      );
      storeStyleForNode(currentTarget, storePayload, storeContext);
      if(inlineResult.entire){
        const inlineState = getInlineState(currentTarget);
        if(inlineState && inlineState.baseStyle){
          inlineState.baseStyle.fontFamily = value || null;
        }
      }
      updatePreviewFromInputs();
      recordStyleUndo(currentTarget, prevStyle, nextStyle, { label: 'font-family', storeContext });
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

    fontInput.addEventListener('input', (evt) => {
      const rawValue = fontInput.value;
      applyInlineFontAutocomplete(rawValue, { reason: evt?.inputType || 'input' });
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
      const storeContext = resolveStoreContext(currentTarget, { scopeId: currentScope, key: currentKey });
      const val = colorInput.value;
      const inlineResult = handleInlineSelectionPatch({ fill: val }, {
        source: 'color-input',
        action: 'fill'
      });
      if(inlineResult.handled){
        updatePreviewFromInputs();
        return;
      }
      applyDirectStyleToken(currentTarget, 'fill', val);
      const nextStyle = captureStyleSnapshot(currentTarget);
      const storePayload = resolveStorePayloadForPatch(
        storeContext,
        nextStyle,
        { fill: val }
      );
      storeStyleForNode(currentTarget, storePayload, storeContext);
      if(inlineResult.entire){
        const inlineState = getInlineState(currentTarget);
        if(inlineState && inlineState.baseStyle){
          inlineState.baseStyle.fill = val;
        }
      }
      updatePreviewFromInputs();
      recordStyleUndo(currentTarget, prevStyle, nextStyle, { label: 'fill', storeContext });
      logDebug('colorInput input', { value: val, text: currentTarget.textContent });
    });

    function applySizeValueChange(meta){
      if(!currentTarget || !sizeInput){ return; }
      const prevStyle = captureStyleSnapshot(currentTarget);
      const storeContext = resolveStoreContext(currentTarget, { scopeId: currentScope, key: currentKey });
      const normalized = normalizeFontSizeValue(sizeInput.value, { source: meta?.source || 'change' });
      sizeInput.value = normalized;
      highlightSizeMenuSelection(normalized);
      const raw = normalized.trim();
      let val = null;
      if(raw){
        const numeric = parseFloat(raw);
        if(Number.isFinite(numeric)){
          const pxVal = ptToPx(numeric);
          const roundedPx = Number.isFinite(pxVal) ? Math.round(pxVal * 100) / 100 : pxVal;
          val = `${roundedPx}px`;
        }
      }
      const inlineResult = handleInlineSelectionPatch({ fontSize: val }, {
        source: meta?.source || 'size-change',
        action: 'font-size'
      });
      if(inlineResult.handled){
        updatePreviewFromInputs();
        return;
      }
      applyDirectStyleToken(currentTarget, 'font-size', val || null);
      const nextStyle = captureStyleSnapshot(currentTarget);
      const storePayload = resolveStorePayloadForPatch(
        storeContext,
        nextStyle,
        { fontSize: val || null },
        {
          includeFallbackFill: true,
          fallbackFill: colorInput?.value || null
        }
      );
      storeStyleForNode(currentTarget, storePayload, storeContext);
      if(inlineResult.entire){
        const inlineState = getInlineState(currentTarget);
        if(inlineState && inlineState.baseStyle){
          inlineState.baseStyle.fontSize = val;
        }
      }
      updatePreviewFromInputs();
      recordStyleUndo(currentTarget, prevStyle, nextStyle, { label: 'font-size', storeContext });
      logDebug('sizeInput change', { value: raw, applied: nextStyle?.fontSize || null, text: currentTarget.textContent });
    }

    sizeInput.addEventListener('change', () => {
      applySizeValueChange({ source: 'change' });
    });

    sizeInput.addEventListener('input', () => {
      const currentValue = sizeInput.value;
      const clamped = clampFontSizeDuringInput(currentValue);
      if(clamped !== currentValue){
        sizeInput.value = clamped;
      }
      highlightSizeMenuSelection(sizeInput.value);
      updatePreviewFromInputs();
      logDebug('sizeInput input preview', { value: sizeInput.value });
    });

    const toggleHandler = (btn, attr, activeValue, propKey, options) => {
      if(!btn){ return; }
      const config = options || {};
      btn.addEventListener('click', () => {
        if(!currentTarget) return;
        const prevStyle = captureStyleSnapshot(currentTarget);
        const storeContext = resolveStoreContext(currentTarget, { scopeId: currentScope, key: currentKey });
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
        applyDirectStyleToken(currentTarget, attr, nextActive ? activeValue : null);
        const nextStyle = captureStyleSnapshot(currentTarget);
        const storePayload = resolveStorePayloadForPatch(
          storeContext,
          nextStyle,
          patch,
          {
            includeFallbackFill: true,
            fallbackFill: colorInput?.value || null
          }
        );
        storeStyleForNode(currentTarget, storePayload, storeContext);
        if(inlineResult.entire && propKey){
          const inlineState = getInlineState(currentTarget);
          if(inlineState && inlineState.baseStyle){
            inlineState.baseStyle[propKey] = nextActive ? activeValue : null;
          }
        }
        updatePreviewFromInputs();
        recordStyleUndo(currentTarget, prevStyle, nextStyle, { label: attr, storeContext });
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
      if(activeHost && target && typeof activeHost.contains === 'function' && activeHost.contains(target)){
        logDebug('panel click ignored (within shared host)', {
          hostScope: activeHost.dataset?.fontToolbarScope || null
        });
        return;
      }
      if(currentTarget && target === currentTarget){ return; }
      if(target?.closest?.('.inline-edit-overlay')){
        logDebug('panel click ignored (inline edit overlay)', {});
        return;
      }
      if(target?.closest?.('.shared-color-picker') || target?.closest?.('[data-font-controls-overlay="1"]')){
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
    closeSizeMenu('panel-close');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.hidden = true;
    exitFloatingMode({ trigger: reason || 'close' });
    if(activeHost && panelEl.parentElement === activeHost){
      const significancePanel = activeHost.querySelector('.significance-controls-panel');
      const significanceOpen = !!(significancePanel && significancePanel.dataset?.open === '1');
      if(significanceOpen){
        activeHost.classList.remove('font-toolbar-host--significance-dual');
        activeHost.style.removeProperty('display');
        activeHost.style.removeProperty('grid-auto-flow');
        activeHost.style.removeProperty('grid-auto-columns');
        activeHost.style.removeProperty('column-gap');
        activeHost.style.removeProperty('align-items');
        activeHost.style.removeProperty('justify-content');
        activeHost.style.removeProperty('min-width');
        activeHost.style.removeProperty('max-width');
        activeHost.style.removeProperty('width');
        const dock = activeHost.closest('.workspace-toolbar__dock');
        if(dock){
          dock.style.removeProperty('min-width');
          dock.style.removeProperty('max-width');
          dock.style.removeProperty('width');
        }
      }else{
        hideToolbarHost(activeHost);
        activeHost = null;
      }
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
    clearContentEditableSelectionCache(currentTarget);
    currentTarget = null;
    currentScope = null;
    currentKey = null;
    logDebug('panel closed', { reason });
  }

  function openPanelForTarget(target, options){
    if(!target){ return; }
    ensurePanel();
    let coexistWithComponent = options?.coexistWithComponent === true;
    let coexistComponentClass = typeof options?.coexistComponentClass === 'string' ? options.coexistComponentClass.trim() : '';
    // Ensure axis controls are closed when opening the font (FORMAT) panel.
    // Prevent mixed UI (axis + font + per-component hosts) by closing axisControls.
    currentTarget = target;
    currentScope = options?.scopeId || target.dataset?.fontScope || null;
    currentKey = options?.key || target.dataset?.fontKey || null;
    if(isContentEditableTarget(currentTarget)){
      cacheContentEditableSelection(currentTarget, 'panel-open');
    }
    syncScopeModeForCurrentTarget();
    try {
      const editHighlight = Shared.editHighlight;
      if(editHighlight){
        if(isSvgTextTarget(target) && typeof editHighlight.highlightText === 'function'){
          editHighlight.highlightText(target);
          logDebug('text highlight requested', { scope: currentScope, key: currentKey });
        }else if(typeof editHighlight.clearText === 'function'){
          editHighlight.clearText('non-svg-target');
        }
      }
    } catch(highlightErr){
      console.error('fontControls.openPanelForTarget highlight error', highlightErr);
    }
    if(!panelEl){ return; }
    // ensure any per-component toolbar hosts are hidden before opening the font panel
    if(!coexistWithComponent){
      try{ hideComponentHosts(); }catch(e){}
    }
    // also close axis/grid controls so the font panel is the only active FORMAT UI
    try{
      const axisControls = Shared?.axisControls || (global && global.Shared && global.Shared.axisControls);
      if(axisControls && typeof axisControls.close === 'function'){
        try{ axisControls.close('font-open'); }catch(e){}
      }
    }catch(e){}
    try{
      const gridControls = Shared?.gridControls || (global && global.Shared && global.Shared.gridControls);
      if(gridControls && typeof gridControls.close === 'function'){
        try{ gridControls.close('font-open'); }catch(e){}
      }
    }catch(e){}
    const providedHost = options?.host && options.host.nodeType === 1 ? options.host : null;
    const host = providedHost || resolveToolbarHost(currentScope);
    if(host){
      const existingHeatmapPalette = currentScope === 'heatmap'
        ? host.querySelector('.heatmap-palette-controls-panel')
        : null;
      if(existingHeatmapPalette){
        coexistWithComponent = true;
        if(!coexistComponentClass){
          coexistComponentClass = 'font-toolbar-host--heatmap-dual';
        }
      }
      if(activeHost && activeHost !== host){
        hideToolbarHost(activeHost);
      }
      // remove any per-component toolbar form nodes from this host so the
      // font panel does not share the same host DOM with component controls.
      try{
        const removableSelector = coexistWithComponent
          ? '.workspace-toolbar__panel--symbol, .additional-line-controls-panel:not(.significance-controls-panel), .grid-controls-panel'
          : '.workspace-toolbar__panel--symbol, .additional-line-controls-panel, .grid-controls-panel';
        host.querySelectorAll(removableSelector).forEach(node => {
          if(node === panelEl){ return; }
          try{ node.remove(); }catch(e){}
        });
        const removable = host.querySelectorAll('.workspace-toolbar__form, [data-point-controls="1"]');
        removable.forEach(node => {
          const parentPanel = node.closest ? node.closest('.workspace-toolbar__panel') : null;
          if(parentPanel && parentPanel !== panelEl){
            try{ parentPanel.remove(); }catch(e){}
            return;
          }
          if(node !== panelEl){
            try{ node.remove(); }catch(e){}
          }
        });
      }catch(e){}
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      activeHost = host;
      showToolbarHost(host);
      if(coexistWithComponent){
        if(coexistComponentClass){
          host.classList.add(coexistComponentClass);
        }
        if(coexistComponentClass.indexOf('significance') !== -1){
          host.classList.add('font-toolbar-host--significance');
        }
      }
      // Remove any inline alignment overrides so CSS controls centering
      try{
        host.style.removeProperty('align-items');
        host.style.removeProperty('justify-content');
      }catch(e){}
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
    const tabToken = resolveStoreTabToken({ target: svg, tabId: options?.tabId || null });
    if(svg.dataset && tabToken){
      svg.dataset.fontTabId = tabToken;
    }
    svgScopeMap.set(svg, scopeId);
    if(svgRegistry.has(svg)){ return; }
    svg.addEventListener('click', handleSvgClick, true);
    svgRegistry.add(svg);
    logDebug('enableForSvg attached', {
      scopeId,
      tabToken: tabToken || null,
      hasDatasetScope: !!svg.dataset?.fontScope,
      nodeName: svg.nodeName
    });
  }

  function markText(node, options){
    if(!node){ return; }
    const scopeId = options?.scopeId || node.dataset?.fontScope || null;
    const role = options?.role || null;
    const key = options?.key || role || null;
    const tabToken = resolveStoreTabToken({ node, tabId: options?.tabId || null });
    if(node.dataset){
      node.dataset.fontEditable = '1';
      if(scopeId){ node.dataset.fontScope = scopeId; }
      if(tabToken){ node.dataset.fontTabId = tabToken; }
      if(role){ node.dataset.fontRole = role; }
      if(key){ node.dataset.fontKey = key; }
    }
    const storeKey = buildStoreKey(scopeId, key, { node, tabId: tabToken });
    const graphStoreKey = buildStoreKey(scopeId, GRAPH_SCOPE_TOKEN, { node, tabId: tabToken });
    registerNodeForKey(node, storeKey);
    if(graphStoreKey !== storeKey){
      registerNodeForKey(node, graphStoreKey);
    }
    if(styleStore.has(graphStoreKey)){
      applyStyleToNode(node, styleStore.get(graphStoreKey));
    }
    if(styleStore.has(storeKey)){
      applyStyleToNode(node, styleStore.get(storeKey));
    }
    logDebug('markText applied', { scopeId, tabToken: tabToken || null, role, key, text: node?.textContent });
  }

  function applySavedStyle(node){
    if(!node){ return; }
    const scopeId = node.dataset?.fontScope || null;
    const key = node.dataset?.fontKey || null;
    const tabToken = resolveStoreTabToken({ node, tabId: node.dataset?.fontTabId || null });
    const storeKey = buildStoreKey(scopeId, key, { node, tabId: tabToken });
    const graphStoreKey = buildStoreKey(scopeId, GRAPH_SCOPE_TOKEN, { node, tabId: tabToken });
    if(styleStore.has(graphStoreKey)){
      applyStyleToNode(node, styleStore.get(graphStoreKey));
    }
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
  fontControls.hideComponentHosts = hideComponentHosts;
  fontControls.hideAllFormatControls = hideAllFormatControls;
  // also expose as Shared helpers for components to call
  try{ Shared.hideComponentHosts = hideComponentHosts; Shared.hideAllFormatControls = hideAllFormatControls; }catch(e){}

  ensurePanel();
})(typeof window !== 'undefined' ? window : globalThis);
