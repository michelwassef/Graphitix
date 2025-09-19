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

  function svgToXml(svgEl, contextLabel) {
    if (!svgEl) {
      logDebug('svgToXml skipped', { contextLabel, reason: 'no element' });
      return '';
    }
    try {
      const serialize = getSerializeFn();
      const xml = serialize(svgEl);
      logDebug('svgToXml complete', { contextLabel, length: xml?.length || 0 });
      return xml;
    } catch (err) {
      console.error('exporter svgToXml error', err);
      return '';
    }
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
        const blob = new Blob([xml], { type: 'image/svg+xml' });
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.svg`, `${contextLabel}-svg`);
        } else {
          const map = { 'image/svg+xml': blob };
          try {
            map['text/plain'] = new Blob([xml], { type: 'text/plain' });
          } catch (err) {
            warn('svgActions text blob error', { contextLabel, error: err?.message });
          }
          await copyBlobMap(map, `${contextLabel}-svg`);
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
        const blob = new Blob([xml], { type: 'image/svg+xml' });
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.svg`, `${contextLabel}-svg`);
        } else {
          const map = { 'image/svg+xml': blob };
          map['text/plain'] = new Blob([xml], { type: 'text/plain' });
          await copyBlobMap(map, `${contextLabel}-svg`);
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
        const blob = new Blob([xml], { type: 'image/svg+xml' });
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.svg`, `${contextLabel}-svg`);
        } else {
          const map = {
            'image/svg+xml': blob,
            'text/plain': new Blob([xml], { type: 'text/plain' })
          };
          await copyBlobMap(map, `${contextLabel}-svg`);
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
