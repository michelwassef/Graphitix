(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const exporter = Shared.exporter = Shared.exporter || {};
  const doc = global.document;
  const openStates = new Set();
  let listenersBound = false;

  const logDebug = (label, payload) => {
    try {
      console.debug(`Debug: exporter ${label}` , payload || {}); // Debug: exporter trace
    } catch (err) {
      // Ignore logging errors to avoid crashing export flows.
    }
  };

  const warn = (label, payload) => {
    try {
      console.warn(`exporter ${label}`, payload || {});
    } catch (err) {
      // Ignore warnings that fail to serialize.
    }
  };

  const parseDimension = value => {
    const num = typeof value === 'string' ? Number.parseFloat(value) : value;
    return Number.isFinite(num) ? num : null;
  };

  const DEFAULT_FONT_STACK = 'Arial, Helvetica, sans-serif';
  const NUMERIC_VALUE_RE = /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i;
  const SVG_MIME_TYPE = 'image/svg+xml';

  const getDefaultFontFamily = () => {
    const sharedFont = Shared?.chartStyle?.FONT_FAMILY;
    const chosen = typeof sharedFont === 'string' && sharedFont.trim() ? sharedFont.trim() : DEFAULT_FONT_STACK;
    console.debug('Debug: exporter.resolveFontFamily', { chosen, sharedFont }); // Debug: font family resolution trace
    return chosen;
  };

  const normalizeFontString = value => {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toLowerCase() : '';
  };

  const ensurePxValue = value => {
    if (value === undefined || value === null) return null;
    let trimmed = String(value).trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    let important = '';
    if (lower.endsWith('!important')) {
      important = ' !important';
      trimmed = trimmed.slice(0, lower.lastIndexOf('!important')).trim();
    }
    if (/px$/i.test(trimmed)) {
      return `${trimmed}${important}`;
    }
    if (NUMERIC_VALUE_RE.test(trimmed)) {
      if (trimmed === '0' || trimmed === '+0' || trimmed === '-0') {
        return `0px${important}`;
      }
      return `${trimmed}px${important}`;
    }
    return null;
  };

  const ensureUnitlessNumber = value => {
    if (value === undefined || value === null) return null;
    let trimmed = String(value).trim();
    if (!trimmed) return null;
    let lower = trimmed.toLowerCase();
    if (lower.endsWith('!important')) {
      lower = lower.replace(/!important$/, '').trim();
      trimmed = trimmed.slice(0, trimmed.toLowerCase().lastIndexOf('!important')).trim();
    }
    let normalizedSource = trimmed;
    if (lower.endsWith('px')) {
      normalizedSource = trimmed.slice(0, lower.lastIndexOf('px')).trim();
    }
    if (!normalizedSource) {
      return null;
    }
    if (!NUMERIC_VALUE_RE.test(normalizedSource)) {
      return null;
    }
    const num = Number.parseFloat(normalizedSource);
    if (!Number.isFinite(num)) {
      return null;
    }
    const normalized = num === 0 ? '0' : String(num);
    if (normalized !== trimmed) {
      console.debug('Debug: exporter ensureUnitlessNumber', { original: value, normalized }); // Debug: unitless stroke normalization trace
    }
    return normalized;
  };

  function applyNumericAttrWithPx(node, attr, counters, counterKey) {
    if (!node?.getAttribute || !node?.setAttribute) return false;
    const raw = node.getAttribute(attr);
    if (raw === null || raw === undefined) return false;
    const normalized = ensurePxValue(raw);
    if (!normalized || normalized === raw) return false;
    node.setAttribute(attr, normalized);
    if (counters && counterKey) {
      counters[counterKey] = (counters[counterKey] || 0) + 1;
    }
    return true;
  }

  function applyNumericAttrUnitless(node, attr, counters, counterKey) {
    if (!node?.getAttribute || !node?.setAttribute) return false;
    const raw = node.getAttribute(attr);
    if (raw === null || raw === undefined) return false;
    const normalized = ensureUnitlessNumber(raw);
    if (!normalized || normalized === raw) return false;
    node.setAttribute(attr, normalized);
    if (counters && counterKey) {
      counters[counterKey] = (counters[counterKey] || 0) + 1;
    }
    console.debug('Debug: exporter unitless attr applied', { attr, original: raw, normalized }); // Debug: attr unitless conversion trace
    return true;
  }

  function normalizeStyleProperty(node, propertyName, transform) {
    if (!node?.getAttribute || !node?.setAttribute) {
      return { changed: false, found: false };
    }
    const styleAttr = node.getAttribute('style');
    if (!styleAttr) return { changed: false, found: false };
    const parts = styleAttr.split(';');
    if (!parts.length) return { changed: false, found: false };
    const lowerProp = String(propertyName || '').toLowerCase();
    let changed = false;
    let found = false;
    const nextParts = [];
    parts.forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        nextParts.push(trimmed);
        return;
      }
      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();
      if (key.toLowerCase() === lowerProp) {
        found = true;
        const nextValue = transform(value);
        if (nextValue && nextValue !== value) {
          value = nextValue;
          changed = true;
        }
      }
      nextParts.push(`${key}: ${value}`);
    });
    if (changed) {
      node.setAttribute('style', nextParts.join('; '));
    }
    return { changed, found };
  }

  function applyFontFamilyAttr(node, fontFamily, counters, counterKey) {
    if (!node?.setAttribute || !fontFamily) return false;
    const current = node.getAttribute('font-family');
    if (normalizeFontString(current) === normalizeFontString(fontFamily)) {
      return false;
    }
    node.setAttribute('font-family', fontFamily);
    if (counters && counterKey) {
      counters[counterKey] = (counters[counterKey] || 0) + 1;
    }
    return true;
  }

  function prepareSvgForExport(svgNode, contextLabel) {
    if (!svgNode) {
      logDebug('prepareSvgForExport skipped', { contextLabel, reason: 'no svg node' });
      return null;
    }
    const counters = {
      rootFontApplied: false,
      rootStyleFontApplied: 0,
      textFontApplied: 0,
      fontAttrApplied: 0,
      styleFontFamilyNormalized: 0,
      fontSizeAttrNormalized: 0,
      fontSizeStyleNormalized: 0,
      strokeWidthAttrNormalized: 0,
      strokeWidthStyleNormalized: 0,
      widthAttrNormalized: 0,
      heightAttrNormalized: 0,
      namespaceAdded: 0
    };
    try {
      const defaultFont = getDefaultFontFamily();
      if (defaultFont && svgNode.setAttribute) {
        if (applyFontFamilyAttr(svgNode, defaultFont)) {
          counters.rootFontApplied = true;
        }
        const rootStyle = normalizeStyleProperty(svgNode, 'font-family', () => defaultFont);
        if (rootStyle.changed) {
          counters.rootStyleFontApplied += 1;
        }
      }
      if (svgNode.setAttribute) {
        if (!svgNode.getAttribute('xmlns')) {
          svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          counters.namespaceAdded += 1;
        }
        if (!svgNode.getAttribute('xmlns:xlink')) {
          svgNode.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
          counters.namespaceAdded += 1;
        }
      }
      applyNumericAttrWithPx(svgNode, 'width', counters, 'widthAttrNormalized');
      applyNumericAttrWithPx(svgNode, 'height', counters, 'heightAttrNormalized');

      const textNodes = svgNode.querySelectorAll ? svgNode.querySelectorAll('text, tspan, textPath') : [];
      textNodes.forEach(node => {
        applyFontFamilyAttr(node, defaultFont, counters, 'textFontApplied');
      });

      const fontAttrNodes = svgNode.querySelectorAll ? svgNode.querySelectorAll('[font-family]') : [];
      fontAttrNodes.forEach(node => {
        if (node === svgNode) return;
        applyFontFamilyAttr(node, defaultFont, counters, 'fontAttrApplied');
      });

      const styleNodes = svgNode.querySelectorAll ? svgNode.querySelectorAll('[style]') : [];
      styleNodes.forEach(node => {
        const styleFont = normalizeStyleProperty(node, 'font-family', () => defaultFont);
        if (styleFont.changed) {
          counters.styleFontFamilyNormalized += 1;
        }
        const styleSize = normalizeStyleProperty(node, 'font-size', value => ensurePxValue(value) || value);
        if (styleSize.changed) {
          counters.fontSizeStyleNormalized += 1;
        }
        const styleStroke = normalizeStyleProperty(node, 'stroke-width', value => {
          const normalized = ensureUnitlessNumber(value);
          if (normalized && normalized !== value) {
            console.debug('Debug: exporter style stroke normalized', { original: value, normalized }); // Debug: style stroke normalization trace
          }
          return normalized || value;
        });
        if (styleStroke.changed) {
          counters.strokeWidthStyleNormalized += 1;
        }
      });

      const fontSizeAttrNodes = svgNode.querySelectorAll ? svgNode.querySelectorAll('[font-size]') : [];
      fontSizeAttrNodes.forEach(node => {
        applyNumericAttrWithPx(node, 'font-size', counters, 'fontSizeAttrNormalized');
      });

      const strokeAttrNodes = svgNode.querySelectorAll ? svgNode.querySelectorAll('[stroke-width]') : [];
      strokeAttrNodes.forEach(node => {
        applyNumericAttrUnitless(node, 'stroke-width', counters, 'strokeWidthAttrNormalized');
      });

      logDebug('prepareSvgForExport applied', {
        contextLabel,
        defaultFont,
        textNodeCount: textNodes.length,
        fontAttrNodeCount: fontAttrNodes.length,
        styleNodeCount: styleNodes.length,
        strokeAttrNodeCount: strokeAttrNodes.length,
        fontSizeAttrNodeCount: fontSizeAttrNodes.length,
        counters
      });
    } catch (err) {
      console.error('exporter prepareSvgForExport error', err);
    }
    return counters;
  }

  function resolveElement(ref) {
    if (!ref || !doc) return null;
    if (typeof ref === 'string') {
      const trimmed = ref.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('#') && doc.getElementById) {
        const byId = doc.getElementById(trimmed.slice(1));
        if (byId) return byId;
      }
      try {
        return doc.querySelector(trimmed);
      } catch (err) {
        warn('resolveElement selector error', { selector: trimmed, error: err?.message });
        return null;
      }
    }
    return ref || null;
  }

  function computeSvgDimensions(svgEl, fallbackWidth = 800, fallbackHeight = 400) {
    if (!svgEl) {
      return { width: fallbackWidth, height: fallbackHeight };
    }
    const viewBox = svgEl.viewBox?.baseVal;
    const widthCandidates = [
      viewBox?.width,
      svgEl.width?.baseVal?.value,
      parseDimension(svgEl.getAttribute?.('width')),
      svgEl.clientWidth,
      fallbackWidth
    ];
    const heightCandidates = [
      viewBox?.height,
      svgEl.height?.baseVal?.value,
      parseDimension(svgEl.getAttribute?.('height')),
      svgEl.clientHeight,
      fallbackHeight
    ];
    const width = widthCandidates.find(v => Number.isFinite(v) && v > 0) || fallbackWidth;
    const height = heightCandidates.find(v => Number.isFinite(v) && v > 0) || fallbackHeight;
    logDebug('computeSvgDimensions', {
      width,
      height,
      viewBoxWidth: viewBox?.width,
      viewBoxHeight: viewBox?.height,
      nodeId: svgEl.id || svgEl.getAttribute?.('data-name') || svgEl.tagName
    });
    return { width, height };
  }

  function getSerializeFn() {
    if (typeof Shared.serializeCleanSVG === 'function') {
      return Shared.serializeCleanSVG;
    }
    if (typeof global.serializeCleanSVG === 'function') {
      return global.serializeCleanSVG;
    }
    const Serializer = global.XMLSerializer || (typeof XMLSerializer !== 'undefined' ? XMLSerializer : null);
    const serializer = Serializer ? new Serializer() : null;
    return svgEl => serializer ? serializer.serializeToString(svgEl) : '';
  }
  
  // Groups all drawable children into a single <g> so paste into Inkscape keeps them together.
  // Keeps <defs>, <title>, <desc> at the top level, and wraps everything else.
  // Adds a neutral transform and non-scaling-stroke at the group level for extra stability.
  function groupNodeForPaste(svgEl, opts = {}) {
    if (!svgEl || typeof svgEl.querySelectorAll !== 'function') return { grouped: false, moved: 0 };
    // Opt-out flag if you ever want to disable this quickly.
    const enabled = opts.enabled ?? (Shared?.exporter?.GROUP_FOR_PASTE ?? true);
    if (!enabled) return { grouped: false, moved: 0 };

    // If already has a single top-level <g> that holds all drawable nodes, skip.
    const topGroups = Array.from(svgEl.children).filter(n => n.tagName && n.tagName.toLowerCase() === 'g');
    const nonMeta = Array.from(svgEl.children).filter(n => !/^(defs|title|desc)$/i.test(n.tagName || ''));
    if (topGroups.length === 1 && topGroups[0] === nonMeta[0]) {
      logDebug('groupNodeForPaste skipped existing top-level group', { moved: 0 });
      return { grouped: false, moved: 0 };
    }

    const g = svgEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', 'export-group');
    // Belt and suspenders for Inkscape paste behavior
    g.setAttribute('vector-effect', 'non-scaling-stroke');
    g.setAttribute('shape-rendering', 'geometricPrecision');
    g.setAttribute('transform', 'matrix(1 0 0 1 0 0)');

    let moved = 0;
    // Move every child except defs/title/desc into the group, preserving order
    const toMove = Array.from(svgEl.childNodes).filter(n => {
      const t = (n.tagName || '').toLowerCase();
      return !(t === 'defs' || t === 'title' || t === 'desc');
    });
    toMove.forEach(n => {
      g.appendChild(n); // this removes from svgEl
      moved += 1;
    });

    // Insert group at end so defs stay first
    svgEl.appendChild(g);

    logDebug('groupNodeForPaste complete', { moved, hasDefs: !!svgEl.querySelector('defs') });
    return { grouped: true, moved };
  }


  function svgToXml(svgEl, contextLabel) {
    if (!svgEl) {
      logDebug('svgToXml skipped', { contextLabel, reason: 'no element' });
      return '';
    }
    try {
      const serialize = getSerializeFn();
      const canUseOptions = serialize === Shared.serializeCleanSVG || serialize === global.serializeCleanSVG;
      let xml = '';
      let prepStats = null;

      const runPrepare = node => {
        try {
          // Your existing normalization
          prepStats = prepareSvgForExport(node, contextLabel) || null;
          // NEW — group all drawable children so paste into Inkscape keeps consistent stroke widths
          const grp = groupNodeForPaste(node, { enabled: Shared?.exporter?.GROUP_FOR_PASTE ?? true });
          logDebug('svgToXml group-for-paste', { contextLabel, grouped: grp.grouped, moved: grp.moved });
        } catch (prepErr) {
          console.error('exporter svgToXml prepare error', prepErr);
        }
      };

      if (canUseOptions) {
        // If your serializer supports hooks, do the grouping on the live node it serializes
        xml = serialize(svgEl, { beforeSanitize: runPrepare });
      } else {
        // Fallback — clone then prepare and group the clone
        const clone = typeof svgEl.cloneNode === 'function' ? svgEl.cloneNode(true) : svgEl;
        if (clone === svgEl) {
          logDebug('svgToXml using original element clone fallback', { contextLabel });
        }
        runPrepare(clone);
        xml = serialize(clone);
      }
      logDebug('svgToXml complete', { contextLabel, length: xml?.length || 0, prepareStats: prepStats });
      return xml;
    } catch (err) {
      console.error('exporter svgToXml error', err);
      return '';
    }
  }

  function ensureSvgFileName(name) {
    const base = typeof name === 'string' ? name.trim() : '';
    if (!base) {
      console.debug('Debug: exporter ensureSvgFileName fallback', { provided: name }); // Debug: filename fallback trace
      return 'chart.svg';
    }
    const lower = base.toLowerCase();
    if (lower.endsWith('.svg')) {
      return base;
    }
    return `${base}.svg`;
  }

  function escapeHtmlAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildSvgExportPayload(xml, options = {}) {
    if (!xml) {
      logDebug('buildSvgExportPayload skipped', { contextLabel: options.contextLabel, reason: 'no xml' });
      return null;
    }
    const { fileName = 'chart.svg', contextLabel = 'svg-export', includeHtmlPreview = true } = options;
    const safeName = ensureSvgFileName(fileName);
    const mime = `${SVG_MIME_TYPE};charset=utf-8`;
    const FileCtor = global.File || (typeof File !== 'undefined' ? File : null);
    const BlobCtor = global.Blob || (typeof Blob !== 'undefined' ? Blob : null);
    let svgBlob = null;
    if (FileCtor) {
      try {
        svgBlob = new FileCtor([xml], safeName, { type: mime });
        console.debug('Debug: exporter buildSvgExportPayload file created', { contextLabel, name: safeName, size: svgBlob.size }); // Debug: svg file payload trace
      } catch (err) {
        console.debug('Debug: exporter buildSvgExportPayload file fallback', { contextLabel, error: err?.message }); // Debug: svg file fallback trace
      }
    }
    if (!svgBlob && BlobCtor) {
      svgBlob = new BlobCtor([xml], { type: mime });
      console.debug('Debug: exporter buildSvgExportPayload blob created', { contextLabel, size: svgBlob?.size || 0 }); // Debug: svg blob payload trace
    }
    if (!svgBlob) {
      warn('buildSvgExportPayload blob unavailable', { contextLabel });
      return null;
    }
    const clipboardMap = { [SVG_MIME_TYPE]: svgBlob };
    if (BlobCtor) {
      try {
        clipboardMap['text/plain'] = new BlobCtor([xml], { type: 'text/plain' });
      } catch (err) {
        warn('buildSvgExportPayload text blob error', { contextLabel, error: err?.message });
      }
    } else {
      warn('buildSvgExportPayload text blob skipped', { contextLabel });
    }
    if (includeHtmlPreview && BlobCtor) {
      try {
        const encoded = encodeURIComponent(xml);
        const alt = escapeHtmlAttr(safeName);
        const html = `<img src="data:${SVG_MIME_TYPE};charset=utf-8,${encoded}" alt="${alt}">`;
        clipboardMap['text/html'] = new BlobCtor([html], { type: 'text/html' });
      } catch (err) {
        warn('buildSvgExportPayload html blob error', { contextLabel, error: err?.message });
      }
    }
    logDebug('buildSvgExportPayload ready', {
      contextLabel,
      fileName: safeName,
      includeHtmlPreview,
      xmlLength: xml.length,
      mapTypes: Object.keys(clipboardMap)
    });
    return { fileName: safeName, svgBlob, clipboardMap };
  }

  async function svgStringToPngBlob(xml, options = {}) {
    const { width, height, fallbackWidth = 800, fallbackHeight = 400, contextLabel } = options;
    if (!xml) {
      logDebug('svgStringToPngBlob skipped', { contextLabel, reason: 'empty xml' });
      return null;
    }
    if (!global.Image || !doc?.createElement) {
      warn('svgStringToPngBlob unsupported', { contextLabel });
      return null;
    }
    const img = new Image();
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const loadPromise = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = err => reject(err || new Error('image decode error'));
    });
    img.src = svgUrl;
    if (typeof img.decode === 'function') {
      try {
        await img.decode();
      } catch (err) {
        console.error('exporter svgString decode error', err);
        try {
          await loadPromise;
        } catch (loadErr) {
          console.error('exporter svgString image load error', loadErr);
          return null;
        }
      }
    } else {
      try {
        await loadPromise;
      } catch (err) {
        console.error('exporter svgString image load error', err);
        return null;
      }
    }
    const resolvedWidth = Number.isFinite(width) && width > 0 ? width : (img.width || fallbackWidth);
    const resolvedHeight = Number.isFinite(height) && height > 0 ? height : (img.height || fallbackHeight);
    const canvas = doc.createElement('canvas');
    canvas.width = resolvedWidth;
    canvas.height = resolvedHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, resolvedWidth, resolvedHeight);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => {
        if (b) resolve(b);
        else reject(new Error('canvas toBlob produced empty blob'));
      }, 'image/png');
    }).catch(err => {
      console.error('exporter canvas toBlob error', err);
      return null;
    });
    canvas.width = 0;
    canvas.height = 0;
    logDebug('svgStringToPngBlob complete', { contextLabel, width: resolvedWidth, height: resolvedHeight, hasBlob: !!blob });
    return blob;
  }

  async function svgElementToPngBlob(svgEl, options = {}) {
    if (!svgEl) {
      logDebug('svgElementToPngBlob skipped', { contextLabel: options.contextLabel, reason: 'no element' });
      return null;
    }
    const xml = svgToXml(svgEl, options.contextLabel);
    if (!xml) return null;
    const dims = computeSvgDimensions(svgEl, options.fallbackWidth, options.fallbackHeight);
    return svgStringToPngBlob(xml, {
      width: dims.width,
      height: dims.height,
      fallbackWidth: dims.width,
      fallbackHeight: dims.height,
      contextLabel: options.contextLabel
    });
  }

  function downloadBlob(blob, fileName, contextLabel) {
    if (!blob) {
      logDebug('downloadBlob skipped', { contextLabel, reason: 'no blob' });
      return;
    }
    if (!doc?.createElement || !doc.body) {
      warn('downloadBlob unavailable', { contextLabel });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName || 'download';
    doc.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout?.(() => URL.revokeObjectURL(url), 4000);
    logDebug('downloadBlob triggered', { contextLabel, fileName });
  }

  async function copyBlobMap(blobMap, contextLabel) {
    if (!blobMap || !Object.keys(blobMap).length) {
      logDebug('copyBlobMap skipped', { contextLabel, reason: 'empty map' });
      return;
    }
    const nav = global.navigator;
    if (!nav?.clipboard?.write || typeof global.ClipboardItem !== 'function') {
      warn('copyBlobMap clipboard unavailable', { contextLabel });
      throw new Error('Clipboard API unavailable');
    }
    const item = new global.ClipboardItem(blobMap);
    await nav.clipboard.write([item]);
    logDebug('copyBlobMap success', { contextLabel, types: Object.keys(blobMap) });
  }

  function closeAllMenus(exceptState) {
    Array.from(openStates).forEach(state => {
      if (state !== exceptState) {
        setMenuOpen(state, false);
      }
    });
  }

  function setMenuOpen(state, open) {
    if (!state) return;
    if (open) {
      closeAllMenus(state);
      state.wrapper.classList.add('is-open');
      state.menu.hidden = false;
      state.trigger.setAttribute('aria-expanded', 'true');
      openStates.add(state);
    } else {
      state.wrapper.classList.remove('is-open');
      state.menu.hidden = true;
      state.trigger.setAttribute('aria-expanded', 'false');
      openStates.delete(state);
    }
    logDebug('menuToggle', { contextLabel: state.contextLabel, actionKey: state.actionKey, open });
  }

  function ensureDocumentListeners() {
    if (listenersBound || !doc?.addEventListener) return;
    doc.addEventListener('click', event => {
      for (const state of Array.from(openStates)) {
        if (state.wrapper.contains(event.target)) {
          continue;
        }
        setMenuOpen(state, false);
      }
    });
    doc.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeAllMenus();
      }
    });
    listenersBound = true;
    logDebug('documentListeners bound', {});
  }

  function createDropdown(container, action, contextLabel) {
    if (!doc?.createElement) return null;
    const wrapper = doc.createElement('div');
    wrapper.className = 'export-dropdown';
    wrapper.dataset.actionKey = action.key;
    wrapper.dataset.contextLabel = contextLabel;

    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn export-trigger';
    trigger.textContent = `${action.label} \u25BE`;
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');

    const menu = doc.createElement('div');
    menu.className = 'export-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    action.formats.forEach(format => {
      const optionBtn = doc.createElement('button');
      optionBtn.type = 'button';
      optionBtn.className = 'btn export-option';
      optionBtn.textContent = format.label;
      optionBtn.setAttribute('role', 'menuitem');
      optionBtn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        closeAllMenus();
        logDebug('optionSelected', { contextLabel, action: action.key, format: format.key });
        Promise.resolve()
          .then(() => format.handler())
          .catch(err => console.error('exporter option handler error', err));
      });
      menu.appendChild(optionBtn);
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    const state = { wrapper, trigger, menu, contextLabel, actionKey: action.key };
    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = !wrapper.classList.contains('is-open');
      setMenuOpen(state, nextOpen);
    });

    container.appendChild(wrapper);
    return state;
  }

  function mountControls({ container, actions, contextLabel }) {
    const host = resolveElement(container);
    if (!host) {
      logDebug('mountControls skipped', { contextLabel, reason: 'no host' });
      return;
    }
    ensureDocumentListeners();
    host.innerHTML = '';
    host.classList.add('export-control-host');
    const states = [];
    actions.forEach(action => {
      const state = createDropdown(host, action, contextLabel);
      if (state) states.push(state);
    });
    logDebug('mountControls complete', { contextLabel, dropdowns: states.length });
  }

  function createSvgActions(config) {
    const { getSvg, fileName = 'chart', contextLabel = 'svg-export', fallbackWidth, fallbackHeight } = config;
    const resolveSvg = () => {
      try {
        return typeof getSvg === 'function' ? getSvg() : null;
      } catch (err) {
        console.error('exporter getSvg error', err);
        return null;
      }
    };
    async function handle(mode, format) {
      const svgEl = resolveSvg();
      if (!svgEl) {
        logDebug('svgActions missing element', { contextLabel, format, mode });
        return;
      }
      if (format === 'png') {
        const blob = await svgElementToPngBlob(svgEl, {
          contextLabel: `${contextLabel}-png`,
          fallbackWidth,
          fallbackHeight
        });
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.png`, `${contextLabel}-png`);
        } else {
          await copyBlobMap({ 'image/png': blob }, `${contextLabel}-png`);
        }
      } else if (format === 'svg') {
        const xml = svgToXml(svgEl, `${contextLabel}-svg`);
        if (!xml) return;
        const payload = buildSvgExportPayload(xml, {
          fileName: `${fileName}.svg`,
          contextLabel: `${contextLabel}-svg`,
          includeHtmlPreview: true
        });
        if (!payload) return;
        console.debug('Debug: exporter svg action payload ready', {
          contextLabel: `${contextLabel}-svg`,
          mode,
          name: payload.fileName,
          clipboardTypes: Object.keys(payload.clipboardMap || {})
        }); // Debug: svg action payload trace
        if (mode === 'download') {
          downloadBlob(payload.svgBlob, payload.fileName, `${contextLabel}-svg`);
        } else {
          await copyBlobMap(payload.clipboardMap, `${contextLabel}-svg`);
        }
      }
    }
    return [
      {
        key: 'download',
        label: 'Download',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('download', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('download', 'svg') }
        ]
      },
      {
        key: 'copy',
        label: 'Copy',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('copy', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('copy', 'svg') }
        ]
      }
    ];
  }

  function createCanvasActions(config) {
    const { getCanvas, getSvgString, fileName = 'chart', contextLabel = 'canvas-export' } = config;
    const resolveCanvas = () => {
      try {
        return typeof getCanvas === 'function' ? getCanvas() : null;
      } catch (err) {
        console.error('exporter getCanvas error', err);
        return null;
      }
    };
    const resolveSvgString = async () => {
      if (typeof getSvgString !== 'function') {
        warn('canvasActions missing getSvgString', { contextLabel });
        return '';
      }
      try {
        return await Promise.resolve(getSvgString());
      } catch (err) {
        console.error('exporter canvas getSvgString error', err);
        return '';
      }
    };
    async function getPngBlob() {
      const canvas = resolveCanvas();
      if (!canvas) {
        logDebug('canvasActions missing canvas', { contextLabel });
        return null;
      }
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => {
          if (b) resolve(b);
          else reject(new Error('canvas toBlob produced empty blob'));
        }, 'image/png');
      }).catch(err => {
        console.error('exporter canvas toBlob error', err);
        return null;
      });
      if (blob) logDebug('canvasActions png ready', { contextLabel });
      return blob;
    }
    async function handle(mode, format) {
      if (format === 'png') {
        const blob = await getPngBlob();
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.png`, `${contextLabel}-png`);
        } else {
          await copyBlobMap({ 'image/png': blob }, `${contextLabel}-png`);
        }
      } else if (format === 'svg') {
        const xml = await resolveSvgString();
        if (!xml) return;
        const payload = buildSvgExportPayload(xml, {
          fileName: `${fileName}.svg`,
          contextLabel: `${contextLabel}-svg`,
          includeHtmlPreview: true
        });
        if (!payload) return;
        console.debug('Debug: exporter canvas svg payload ready', {
          contextLabel: `${contextLabel}-svg`,
          mode,
          name: payload.fileName,
          clipboardTypes: Object.keys(payload.clipboardMap || {})
        }); // Debug: canvas svg payload trace
        if (mode === 'download') {
          downloadBlob(payload.svgBlob, payload.fileName, `${contextLabel}-svg`);
        } else {
          await copyBlobMap(payload.clipboardMap, `${contextLabel}-svg`);
        }
      }
    }
    return [
      {
        key: 'download',
        label: 'Download',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('download', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('download', 'svg') }
        ]
      },
      {
        key: 'copy',
        label: 'Copy',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('copy', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('copy', 'svg') }
        ]
      }
    ];
  }

  function createSvgStringActions(config) {
    const { getSvgString, getDimensions, fileName = 'chart', contextLabel = 'svg-string' } = config;
    const resolveSvgString = async () => {
      if (typeof getSvgString !== 'function') {
        warn('svgStringActions missing getSvgString', { contextLabel });
        return '';
      }
      try {
        return await Promise.resolve(getSvgString());
      } catch (err) {
        console.error('exporter svgString getSvgString error', err);
        return '';
      }
    };
    const resolveDims = async () => {
      if (typeof getDimensions !== 'function') return {};
      try {
        const dims = await Promise.resolve(getDimensions());
        return dims || {};
      } catch (err) {
        console.error('exporter svgString getDimensions error', err);
        return {};
      }
    };
    async function handle(mode, format) {
      if (format === 'png') {
        const xml = await resolveSvgString();
        if (!xml) return;
        const dims = await resolveDims();
        const blob = await svgStringToPngBlob(xml, {
          width: dims.width,
          height: dims.height,
          contextLabel: `${contextLabel}-png`
        });
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.png`, `${contextLabel}-png`);
        } else {
          await copyBlobMap({ 'image/png': blob }, `${contextLabel}-png`);
        }
      } else if (format === 'svg') {
        const xml = await resolveSvgString();
        if (!xml) return;
        const payload = buildSvgExportPayload(xml, {
          fileName: `${fileName}.svg`,
          contextLabel: `${contextLabel}-svg`,
          includeHtmlPreview: true
        });
        if (!payload) return;
        console.debug('Debug: exporter svgString svg payload ready', {
          contextLabel: `${contextLabel}-svg`,
          mode,
          name: payload.fileName,
          clipboardTypes: Object.keys(payload.clipboardMap || {})
        }); // Debug: svg string payload trace
        if (mode === 'download') {
          downloadBlob(payload.svgBlob, payload.fileName, `${contextLabel}-svg`);
        } else {
          await copyBlobMap(payload.clipboardMap, `${contextLabel}-svg`);
        }
      }
    }
    return [
      {
        key: 'download',
        label: 'Download',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('download', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('download', 'svg') }
        ]
      },
      {
        key: 'copy',
        label: 'Copy',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('copy', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('copy', 'svg') }
        ]
      }
    ];
  }

  exporter.mountSvgControls = function mountSvgControls(config) {
    const actions = createSvgActions({
      getSvg: typeof config.getSvg === 'function' ? config.getSvg : () => resolveElement(config.svgSelector),
      fileName: config.fileName,
      contextLabel: config.contextLabel,
      fallbackWidth: config.fallbackWidth,
      fallbackHeight: config.fallbackHeight
    });
    mountControls({ container: config.container, actions, contextLabel: config.contextLabel || config.fileName || 'svg-export' });
  };

  exporter.mountCanvasControls = function mountCanvasControls(config) {
    const actions = createCanvasActions({
      getCanvas: typeof config.getCanvas === 'function' ? config.getCanvas : () => resolveElement(config.canvasSelector),
      getSvgString: config.getSvgString,
      fileName: config.fileName,
      contextLabel: config.contextLabel || config.fileName || 'canvas-export'
    });
    mountControls({ container: config.container, actions, contextLabel: config.contextLabel || config.fileName || 'canvas-export' });
  };

  exporter.mountSvgStringControls = function mountSvgStringControls(config) {
    const actions = createSvgStringActions({
      getSvgString: config.getSvgString,
      getDimensions: config.getDimensions,
      fileName: config.fileName,
      contextLabel: config.contextLabel || config.fileName || 'svg-string'
    });
    mountControls({ container: config.container, actions, contextLabel: config.contextLabel || config.fileName || 'svg-string' });
  };

  exporter.svgElementToPngBlob = svgElementToPngBlob;
  exporter.svgElementToXml = svgToXml;
  exporter.svgStringToPngBlob = svgStringToPngBlob;
  exporter.downloadBlob = downloadBlob;
  exporter.copyBlobMap = copyBlobMap;

  logDebug('module ready', {
    hasClipboardWrite: !!(global.navigator?.clipboard?.write),
    hasSerialize: typeof (Shared.serializeCleanSVG || global.serializeCleanSVG) === 'function'
  });
})(typeof window !== 'undefined' ? window : globalThis);
