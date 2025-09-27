(function() {
  "use strict";
  console.debug("Debug: main.js loaded");

  const Shared = window.Shared = window.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  if (typeof chartStyle.renderFontSizeLabel !== 'function') {
    chartStyle.renderFontSizeLabel = function fallbackFontLabel(options) {
      const opts = options || {};
      const info = opts.fontInfo || {};
      const displayPt = Number.isFinite(info.displayPt) ? info.displayPt
        : Number.isFinite(info.scaledPt) ? info.scaledPt
        : Number.isFinite(info.pt) ? info.pt
        : Number(opts.pt);
      const pxValue = Number.isFinite(info.scaledPx) ? info.scaledPx
        : (Number.isFinite(displayPt) ? displayPt * (96 / 72) : Number(opts.scaledPx));
      const roundedPt = Number.isFinite(displayPt) ? Math.round(displayPt * 10) / 10 : displayPt;
      const roundedPx = Number.isFinite(pxValue) ? Math.round(pxValue) : pxValue;
      if (opts.element) {
        const label = (Number.isFinite(roundedPt) && Number.isFinite(roundedPx))
          ? `${roundedPt} pt (${roundedPx}px)`
          : (Number.isFinite(roundedPt) ? `${roundedPt} pt` : (Number.isFinite(roundedPx) ? `${roundedPx}px` : ''));
        opts.element.textContent = label;
      }
      if (opts.input && Number.isFinite(displayPt)) {
        try {
          opts.input.value = String(displayPt);
        } catch (assignErr) {
          console.error('chartStyle.renderFontSizeLabel fallback input sync error', assignErr);
        }
      }
      console.debug('Debug: chartStyle.renderFontSizeLabel fallback used', {
        hasElement: !!opts.element,
        hasInput: !!opts.input,
        displayPt: displayPt,
        scaledPx: pxValue
      });
    };
  }

  // Debounced draw schedulers (Shared.debounceFrame handles fallbacks internally)
  const scheduleDrawBoxplot = Shared.debounceFrame(() => {
    if (window.Components?.box?.draw) window.Components.box.draw();
  });
  const scheduleDrawScatter = Shared.debounceFrame(() => {
    if (window.Components?.scatter?.draw) window.Components.scatter.draw();
  });
  const scheduleDrawPca = Shared.debounceFrame(() => {
    if (window.Components?.pca?.draw) window.Components.pca.draw();
  });
  const scheduleDrawLine = Shared.debounceFrame(() => {
    if (window.Components?.line?.draw) window.Components.line.draw();
  });
  const scheduleDrawHeatmap = Shared.debounceFrame(() => {
    if (window.Components?.heatmap?.draw) window.Components.heatmap.draw();
  });
  const scheduleDrawHist = Shared.debounceFrame(() => {
    if (window.Components?.hist?.draw) window.Components.hist.draw();
  });
  const scheduleDrawPie = Shared.debounceFrame(() => {
    if (window.Components?.pie?.draw) window.Components.pie.draw();
  });
  const scheduleDrawSurvival = Shared.debounceFrame(() => {
    if (window.Components?.survival?.draw) window.Components.survival.draw();
  });
  console.debug('Debug: main Shared.debounceFrame schedulers ready', { schedulers: ['boxplot','scatter','pca','line','heatmap','hist','pie','survival'] }); // Debug: scheduler wiring summary

  // Shared color palette
  const DEFAULT_SCATTER_COLORS = window.DEFAULT_SCATTER_COLORS || [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999'
  ];
  window.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;

  // Color picker fallback
  function attachColorPickerNear(el) {
    if (window.Shared?.attachColorPickerNear) window.Shared.attachColorPickerNear(el);
  }
  window.attachColorPickerNear = attachColorPickerNear;

  // Initialize color overlay
  (function initColorOverlay() {
    if (window.Shared?.initColorPickerOverlay) {
      const overlay = window.Shared.initColorPickerOverlay();
      document.querySelectorAll('input[type="color"]').forEach(el => {
        if (el !== overlay) attachColorPickerNear(el);
      });
      console.debug('Debug: color overlay initialized', { overlay: !!overlay });
    }
  })();

  // Fallback for jQuery-like selector
  const fallbackDollar = (selector) => {
    const el = document.querySelector(selector);
    console.debug('Debug: fallback $ helper used', { selector, found: !!el });
    return el;
  };
  const hasCustomDollar = typeof window.$ === 'function' && !(window.$.fn?.jquery);
  const $ = hasCustomDollar ? window.$ : fallbackDollar;
  if (!hasCustomDollar) {
    window.$ = fallbackDollar;
    console.debug('Debug: window.$ fallback installed');
  }

  if (typeof Shared.makeEditable === 'function') {
    window.makeEditable = Shared.makeEditable;
    console.debug('Debug: main linked Shared.makeEditable', { hasShared: true }); // Debug: shared makeEditable bridge
  }
  if (typeof Shared.autoResizeSvg === 'function') {
    window.autoResizeSvg = Shared.autoResizeSvg;
    console.debug('Debug: main linked Shared.autoResizeSvg', { hasShared: true }); // Debug: shared autoResize bridge
  }
  if (typeof Shared.serializeCleanSVG === 'function') {
    window.serializeCleanSVG = Shared.serializeCleanSVG;
    console.debug('Debug: main linked Shared.serializeCleanSVG', { hasShared: true }); // Debug: shared serialize bridge
  }

  // Workspace layout state and configuration
  const dom = {
    appHeader: document.getElementById('appHeader'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    workspacePages: document.getElementById('workspacePages'),
    selectionGrid: document.getElementById('graphSelectionGrid'),
    tabsList: document.getElementById('workspaceTabsList'),
    addTabBtn: document.getElementById('addWorkspaceTab'),
    sessionSaveBtn: document.getElementById('saveWorkspaceSession'),
    sessionLoadBtn: document.getElementById('loadWorkspaceSession'),
    sessionFileInput: document.getElementById('workspaceSessionInput'),
    duplicatePrompt: document.getElementById('duplicatePrompt'),
    duplicateTitle: document.getElementById('duplicatePromptTitle'),
    duplicateMessage: document.getElementById('duplicatePromptMessage'),
    duplicateReuse: document.getElementById('duplicateReuse'),
    duplicateEmpty: document.getElementById('duplicateEmpty'),
    duplicateCancel: document.getElementById('duplicateCancel'),
    unsavedPrompt: document.getElementById('unsavedPrompt'),
    unsavedTitle: document.getElementById('unsavedPromptTitle'),
    unsavedMessage: document.getElementById('unsavedPromptMessage'),
    unsavedSave: document.getElementById('unsavedPromptSave'),
    unsavedDiscard: document.getElementById('unsavedPromptDiscard'),
    unsavedCancel: document.getElementById('unsavedPromptCancel')
  };

  if (typeof chartStyle.onTextSizeLockChange === 'function') {
    chartStyle.onTextSizeLockChange((locked, origin, details) => {
      const scopeId = details?.scopeId || null;
      const normalizedScope = scopeId && scopeId.endsWith('-scope') ? scopeId.replace(/-scope$/, '') : scopeId;
      console.debug('Debug: main text size lock broadcast', {
        locked,
        origin,
        scope: normalizedScope || 'global'
      });
      const scopeHandlers = {
        vennGraphPanel: () => { try { window.Components?.venn?.draw?.(); } catch (err) { console.error('main text lock venn redraw error', err); } },
        boxGraphPanel: () => { try { scheduleDrawBoxplot(); } catch (err) { console.error('main text lock box redraw error', err); } },
        scatterGraphPanel: () => { try { scheduleDrawScatter(); } catch (err) { console.error('main text lock scatter redraw error', err); } },
        pcaGraphPanel: () => { try { scheduleDrawPca(); } catch (err) { console.error('main text lock pca redraw error', err); } },
        lineGraphPanel: () => { try { scheduleDrawLine(); } catch (err) { console.error('main text lock line redraw error', err); } },
        heatmapGraphPanel: () => { try { scheduleDrawHeatmap(); } catch (err) { console.error('main text lock heatmap redraw error', err); } },
        histGraphPanel: () => { try { scheduleDrawHist(); } catch (err) { console.error('main text lock hist redraw error', err); } },
        pieGraphPanel: () => { try { scheduleDrawPie(); } catch (err) { console.error('main text lock pie redraw error', err); } },
        survivalGraphPanel: () => { try { scheduleDrawSurvival(); } catch (err) { console.error('main text lock survival redraw error', err); } },
        rocGraphPanel: () => {
          try {
            if (window.Components?.roc?.draw) {
              window.Components.roc.draw();
            }
          } catch (err) { console.error('main text lock roc redraw error', err); }
        }
      };
      if (normalizedScope && scopeHandlers[normalizedScope]) {
        scopeHandlers[normalizedScope]();
      } else {
        Object.keys(scopeHandlers).forEach(key => {
          try {
            scopeHandlers[key]();
          } catch (err) {
            console.error('main text lock handler error', err);
          }
        });
      }
    }, { origin: 'main-text-lock-listener' });
  } else {
    console.debug('Debug: main text size lock setup skipped', {
      hasOnChange: typeof chartStyle.onTextSizeLockChange === 'function',
      hasSetter: typeof chartStyle.setTextSizeLock === 'function'
    });
  }

  const GRAPH_TYPES = [
    { type: 'venn', label: 'Venn Diagram', hint: 'Lists & overlap', description: 'Visualize overlaps between up to three sets with region statistics.' },
    { type: 'box', label: 'Box Plot', hint: 'Group comparisons', description: 'Compare distributions across groups with rich styling and statistical tests.' },
    { type: 'scatter', label: 'Scatter Plot', hint: 'Correlation', description: 'Explore relationships between variables and configure regression overlays.' },
    { type: 'pca', label: 'Dimensionality Reduction', hint: 'PCA / MDS', description: 'Run PCA or MDS on wide tables and inspect eigenvalue summaries.' },
    { type: 'line', label: 'Line Graph', hint: 'Trends', description: 'Plot series data with per-line styling, axes controls, and correlation metrics.' },
    { type: 'heatmap', label: 'Correlation Heatmap', hint: 'Matrix view', description: 'Cluster correlation matrices and tune color ramps, labels, and dendrograms.' },
    { type: 'roc', label: 'Classification Curves', hint: 'ROC / PR', description: 'Compare ROC or precision-recall curves with statistical comparisons.' },
    { type: 'survival', label: 'Survival Curves', hint: 'Kaplan–Meier', description: 'Build Kaplan–Meier curves with confidence intervals and censor controls.' },
    { type: 'hist', label: 'Histogram', hint: 'Distribution', description: 'Summarize univariate distributions with customizable binning and stats.' },
    { type: 'pie', label: 'Proportion Graph', hint: 'Categories', description: 'Visualize category proportions and run Chi² goodness-of-fit tests.' }
  ];

  const SESSION_FILE_TYPES = [
    { description: 'Workspace Session', accept: { 'application/json': ['.session', '.json'] } }
  ];

  let appHeaderVisible = true;

  function setAppHeaderVisibility(shouldShow, meta = {}) {
    if (!dom.appHeader) {
      console.debug('Debug: setAppHeaderVisibility skipped', { hasHeader: !!dom.appHeader, requested: shouldShow });
      return;
    }
    if (appHeaderVisible === shouldShow) {
      console.debug('Debug: app header visibility unchanged', {
        visible: appHeaderVisible,
        requested: shouldShow,
        reason: meta.reason || 'no-change'
      });
      return;
    }
    dom.appHeader.style.display = shouldShow ? '' : 'none';
    appHeaderVisible = shouldShow;
    console.debug('Debug: app header visibility set', {
      visible: appHeaderVisible,
      reason: meta.reason || 'unspecified'
    });
  }

  function ensureComponent(name) {
    const component = window.Components?.[name];
    if (!component) {
      console.debug('Debug: ensureComponent skipped', { name, reason: 'missing-component' });
      return;
    }
    if (typeof component.ensure === 'function') {
      component.ensure();
      return;
    }
    if (typeof component.init === 'function') {
      component.init();
      return;
    }
    console.debug('Debug: ensureComponent no-op', { name });
  }

  const WORKSPACES = {
    venn: {
      type: 'venn',
      tabLabel: 'Venn',
      element: document.getElementById('vennPage'),
      ensure: () => ensureComponent('venn'),
      draw: () => window.Components?.venn?.draw?.(),
      getPayload: () => window.Components?.venn?.getPayload?.(),
      loadFromFile: blob => window.Components?.venn?.loadFromFile?.(blob)
    },
    box: {
      type: 'box',
      tabLabel: 'Box Plot',
      element: document.getElementById('boxPage'),
      ensure: () => ensureComponent('box'),
      draw: () => scheduleDrawBoxplot(),
      getPayload: () => window.Components?.box?.getPayload?.(),
      loadFromFile: blob => window.Components?.box?.loadFromFile?.(blob)
    },
    scatter: {
      type: 'scatter',
      tabLabel: 'Scatter',
      element: document.getElementById('scatterPage'),
      ensure: () => ensureComponent('scatter'),
      draw: () => scheduleDrawScatter(),
      getPayload: () => window.Components?.scatter?.getPayload?.(),
      loadFromFile: blob => window.Components?.scatter?.loadFromFile?.(blob)
    },
    pca: {
      type: 'pca',
      tabLabel: 'PCA / MDS',
      element: document.getElementById('pcaPage'),
      ensure: () => ensureComponent('pca'),
      draw: () => scheduleDrawPca(),
      getPayload: () => window.Components?.pca?.getPayload?.(),
      loadFromFile: blob => window.Components?.pca?.loadFromFile?.(blob)
    },
    line: {
      type: 'line',
      tabLabel: 'Line Graph',
      element: document.getElementById('linePage'),
      ensure: () => ensureComponent('line'),
      draw: () => scheduleDrawLine(),
      getPayload: () => window.Components?.line?.getPayload?.(),
      loadFromFile: blob => window.Components?.line?.loadFromFile?.(blob)
    },
    heatmap: {
      type: 'heatmap',
      tabLabel: 'Heatmap',
      element: document.getElementById('heatmapPage'),
      ensure: () => ensureComponent('heatmap'),
      draw: () => scheduleDrawHeatmap(),
      getPayload: () => window.Components?.heatmap?.getPayload?.(),
      loadFromFile: blob => window.Components?.heatmap?.loadFromFile?.(blob)
    },
    roc: {
      type: 'roc',
      tabLabel: 'ROC / PR',
      element: document.getElementById('rocPage'),
      ensure: () => ensureComponent('roc'),
      draw: () => window.Components?.roc?.draw?.(),
      getPayload: () => window.Components?.roc?.getPayload?.(),
      loadFromFile: blob => window.Components?.roc?.loadFromFile?.(blob)
    },
    survival: {
      type: 'survival',
      tabLabel: 'Survival',
      element: document.getElementById('survivalPage'),
      ensure: () => ensureComponent('survival'),
      draw: () => scheduleDrawSurvival(),
      getPayload: () => window.Components?.survival?.getPayload?.(),
      loadFromFile: blob => window.Components?.survival?.loadFromFile?.(blob)
    },
    hist: {
      type: 'hist',
      tabLabel: 'Histogram',
      element: document.getElementById('histPage'),
      ensure: () => ensureComponent('hist'),
      draw: () => scheduleDrawHist(),
      getPayload: () => window.Components?.hist?.getPayload?.(),
      loadFromFile: blob => window.Components?.hist?.loadFromFile?.(blob)
    },
    pie: {
      type: 'pie',
      tabLabel: 'Proportion',
      element: document.getElementById('piePage'),
      ensure: () => ensureComponent('pie'),
      draw: () => scheduleDrawPie(),
      getPayload: () => window.Components?.pie?.getPayload?.(),
      loadFromFile: blob => window.Components?.pie?.loadFromFile?.(blob)
    }
  };

  const workspaceDefaults = {};
  const workspaceState = {
    tabs: [],
    activeTabId: null,
    nextId: 1,
    pendingDuplicateSource: null,
    lastActiveGraphId: null,
    renameFocusId: null,
    pendingClosePrompt: null,
    sessionFileHandle: null,
    sessionFileName: '',
    sessionDirty: false
  };

  const TAB_PREVIEW_TARGET_WIDTH = 220;
  const TAB_PREVIEW_MIN_HEIGHT = 120;
  const TAB_PREVIEW_MAX_HEIGHT = 220;
  const TAB_PREVIEW_MAX_CHARS = 120000;

  let tabPreviewTooltipEl = null;
  let tabPreviewActiveId = null;
  let tabPreviewMeasureRaf = null;

  let unsavedPromptBusy = false;

  function clonePayload(payload) {
    if (!payload) return null;
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch (err) {
      console.error('clonePayload error', err);
      return null;
    }
  }

  function serializePayloadSignature(value) {
    if (value === undefined || value === null) {
      return null;
    }
    try {
      return JSON.stringify(value);
    } catch (err) {
      console.error('serializePayloadSignature error', err);
      return `error:${Date.now()}`;
    }
  }

  function assignTabPayload(tab, payload, meta = {}) {
    if (!tab) {
      console.debug('Debug: assignTabPayload skipped', { reason: 'no-tab', meta }); // Debug: payload assignment guard
      return false;
    }
    const previousSignature = tab.payloadSignature || null;
    const nextSignature = serializePayloadSignature(payload);
    tab.payload = payload || null;
    tab.payloadSignature = nextSignature;
    if (!payload) {
      tab.previewMarkup = null;
      tab.previewSignature = null;
      tab.previewMeta = null;
      syncTabPreviewIndicator(tab);
      console.debug('Debug: preview cleared via assignTabPayload', { tabId: tab.id, reason: meta.reason || 'payload-null' });
    }
    const changed = previousSignature !== nextSignature;
    console.debug('Debug: assignTabPayload applied', {
      tabId: tab.id,
      reason: meta.reason || 'unspecified',
      changed,
      hasPayload: !!payload
    }); // Debug: payload assignment trace
    return changed;
  }

  function markSessionDirty(reason, details) {
    const wasDirty = workspaceState.sessionDirty;
    workspaceState.sessionDirty = true;
    console.debug('Debug: session dirty flag updated', {
      reason: reason || 'unspecified',
      wasDirty,
      details: details || null
    }); // Debug: dirty flag trace
  }

  function clearSessionDirty(reason) {
    const wasDirty = workspaceState.sessionDirty;
    workspaceState.sessionDirty = false;
    console.debug('Debug: session dirty flag cleared', {
      reason: reason || 'unspecified',
      wasDirty
    }); // Debug: dirty flag reset trace
  }

  function hasMeaningfulCellValue(value, seen = new Set()) {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'number') {
      return !Number.isNaN(value);
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (typeof value === 'boolean') {
      return true;
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) {
        console.debug('Debug: hasMeaningfulCellValue detected circular array reference');
        return false;
      }
      seen.add(value);
      return value.some(item => hasMeaningfulCellValue(item, seen));
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        console.debug('Debug: hasMeaningfulCellValue detected circular object reference');
        return false;
      }
      seen.add(value);
      const keys = Object.keys(value);
      if (!keys.length) {
        return false;
      }
      return keys.some(key => hasMeaningfulCellValue(value[key], seen));
    }
    return true;
  }

  function tabHasTableData(tab) {
    const tabId = tab?.id || null;
    if (!tab || !tab.payload) {
      console.debug('Debug: tab data inspection skipped', { tabId, reason: 'no-tab-or-payload' });
      return false;
    }
    const matrix = tab.payload.data;
    if (Array.isArray(matrix)) {
      let rowCount = 0;
      let colCount = 0;
      for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) {
          continue;
        }
        rowCount += 1;
        colCount = Math.max(colCount, row.length);
        for (let c = 0; c < row.length; c++) {
          if (hasMeaningfulCellValue(row[c])) {
            console.debug('Debug: tab data detected', { tabId, rowIndex: r, colIndex: c });
            return true;
          }
        }
      }
      console.debug('Debug: tab data inspection complete', { tabId, rowsChecked: rowCount, colsChecked: colCount, found: false });
      return false;
    }
    if (matrix && typeof matrix === 'object') {
      const keys = Object.keys(matrix);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (hasMeaningfulCellValue(matrix[key])) {
          console.debug('Debug: tab object data detected', { tabId, key });
          return true;
        }
      }
      console.debug('Debug: tab object data inspection complete', { tabId, keysChecked: keys.length });
      return false;
    }
    console.debug('Debug: tab data inspection skipped', { tabId, reason: 'unrecognized-data-structure', type: typeof matrix });
    return false;
  }

  function graphTabsHaveData() {
    return workspaceState.tabs.some(tab => !tab.isWelcome && tab.type && tabHasTableData(tab));
  }

  function captureWorkspacePreview(config, tab) {
    if (!config || !config.element) {
      console.debug('Debug: preview capture skipped', { reason: 'no-config-element', type: config?.type || null, tabId: tab?.id || null });
      return null;
    }
    const svg = config.element.querySelector('.svgbox svg, svg');
    if (!svg) {
      console.debug('Debug: preview capture skipped', { reason: 'no-svg', type: config.type, tabId: tab?.id || null });
      return null;
    }
    const rawMarkup = typeof svg.innerHTML === 'string' ? svg.innerHTML.trim() : '';
    if (!rawMarkup) {
      console.debug('Debug: preview capture skipped', { reason: 'empty-svg', type: config.type, tabId: tab?.id || null });
      return null;
    }
    const clone = svg.cloneNode(true);
    const viewBoxRaw = clone.getAttribute('viewBox');
    let minX = 0;
    let minY = 0;
    let boxW = NaN;
    let boxH = NaN;
    if (typeof viewBoxRaw === 'string' && viewBoxRaw.trim()) {
      const parts = viewBoxRaw.trim().split(/[\s,]+/).map(part => Number.parseFloat(part));
      if (parts.length === 4 && parts.every(num => Number.isFinite(num))) {
        [minX, minY, boxW, boxH] = parts;
      }
    }
    let widthAttr = Number.parseFloat(clone.getAttribute('width'));
    let heightAttr = Number.parseFloat(clone.getAttribute('height'));
    if (!Number.isFinite(widthAttr) || widthAttr <= 0) {
      if (Number.isFinite(boxW) && boxW > 0) {
        widthAttr = boxW;
      } else {
        widthAttr = TAB_PREVIEW_TARGET_WIDTH;
      }
    }
    if (!Number.isFinite(heightAttr) || heightAttr <= 0) {
      if (Number.isFinite(boxH) && boxH > 0) {
        heightAttr = boxH;
      } else {
        heightAttr = widthAttr * 0.68;
      }
    }
    if (!Number.isFinite(boxW) || boxW <= 0) {
      boxW = widthAttr;
    }
    if (!Number.isFinite(boxH) || boxH <= 0) {
      boxH = heightAttr;
    }
    const ratio = widthAttr > 0 ? Math.max(0.25, Math.min(heightAttr / widthAttr, 3)) : 0.68;
    const targetWidth = TAB_PREVIEW_TARGET_WIDTH;
    const targetHeight = Math.round(
      Math.max(TAB_PREVIEW_MIN_HEIGHT, Math.min(targetWidth * ratio, TAB_PREVIEW_MAX_HEIGHT))
    );
    clone.setAttribute('width', String(targetWidth));
    clone.setAttribute('height', String(targetHeight));
    if (!clone.hasAttribute('preserveAspectRatio')) {
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    if (!clone.hasAttribute('viewBox') && Number.isFinite(boxW) && Number.isFinite(boxH)) {
      clone.setAttribute('viewBox', `${Number.isFinite(minX) ? minX : 0} ${Number.isFinite(minY) ? minY : 0} ${boxW} ${boxH}`);
    }
    if (!clone.querySelector('[data-preview-bg="true"]')) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(Number.isFinite(minX) ? minX : 0));
      rect.setAttribute('y', String(Number.isFinite(minY) ? minY : 0));
      rect.setAttribute('width', Number.isFinite(boxW) ? String(boxW) : '100%');
      rect.setAttribute('height', Number.isFinite(boxH) ? String(boxH) : '100%');
      rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('data-preview-bg', 'true');
      let insertTarget = clone.firstChild;
      while (insertTarget && insertTarget.nodeType === 1 && insertTarget.nodeName.toLowerCase() === 'defs') {
        insertTarget = insertTarget.nextSibling;
      }
      if (insertTarget) {
        clone.insertBefore(rect, insertTarget);
      } else {
        clone.appendChild(rect);
      }
    }
    const serializer = new XMLSerializer();
    const markup = serializer.serializeToString(clone);
    if (!markup) {
      console.debug('Debug: preview capture skipped', { reason: 'serialize-empty', type: config.type, tabId: tab?.id || null });
      return null;
    }
    if (markup.length > TAB_PREVIEW_MAX_CHARS) {
      console.debug('Debug: preview capture skipped', { reason: 'oversize', length: markup.length, type: config.type, tabId: tab?.id || null });
      return null;
    }
    console.debug('Debug: preview capture success', {
      tabId: tab?.id || null,
      type: config.type,
      length: markup.length,
      width: targetWidth,
      height: targetHeight
    });
    return { markup, width: targetWidth, height: targetHeight, size: markup.length };
  }

  function syncTabPreviewIndicator(tab) {
    if (!tab || !dom.tabsList) {
      return;
    }
    const selector = `[data-tab-id="${tab.id}"]`;
    const btn = dom.tabsList.querySelector(selector);
    if (!btn) {
      return;
    }
    if (tab.previewMarkup) {
      btn.dataset.hasPreview = 'true';
    } else {
      delete btn.dataset.hasPreview;
    }
    console.debug('Debug: preview indicator synced', { tabId: tab.id, hasPreview: !!tab.previewMarkup });
  }

  function updateTabPreviewFromWorkspace(tab, config, meta = {}) {
    if (!tab || tab.isWelcome || !tab.type || !config) {
      console.debug('Debug: preview update skipped', { reason: 'invalid-tab', tabId: tab?.id || null, type: tab?.type || null, meta });
      return false;
    }
    const hasData = meta.forceCapture ? true : tabHasTableData(tab);
    if (!hasData) {
      if (tab.previewMarkup || tab.previewSignature || tab.previewMeta) {
        tab.previewMarkup = null;
        tab.previewSignature = null;
        tab.previewMeta = null;
        syncTabPreviewIndicator(tab);
        console.debug('Debug: preview cleared', { tabId: tab.id, reason: 'no-data', meta });
        return true;
      }
      console.debug('Debug: preview update skipped', { reason: 'no-data', tabId: tab.id, meta });
      return false;
    }
    const payloadSignature = tab.payloadSignature || null;
    const shouldCapture = meta.forceCapture
      || !tab.previewMarkup
      || !tab.previewSignature
      || (payloadSignature && tab.previewSignature !== payloadSignature);
    if (!shouldCapture) {
      console.debug('Debug: preview reuse', { tabId: tab.id, signature: tab.previewSignature, meta });
      return false;
    }
    const preview = captureWorkspacePreview(config, tab);
    if (preview && preview.markup) {
      tab.previewMarkup = preview.markup;
      tab.previewSignature = payloadSignature;
      tab.previewMeta = {
        width: preview.width,
        height: preview.height,
        size: preview.size,
        updatedAt: Date.now(),
        reason: meta.reason || 'capture'
      };
      syncTabPreviewIndicator(tab);
      console.debug('Debug: preview stored', {
        tabId: tab.id,
        signature: payloadSignature,
        width: preview.width,
        height: preview.height,
        size: preview.size,
        meta
      });
      return true;
    }
    if (tab.previewMarkup || tab.previewSignature || tab.previewMeta) {
      tab.previewMarkup = null;
      tab.previewSignature = null;
      tab.previewMeta = null;
      syncTabPreviewIndicator(tab);
      console.debug('Debug: preview cleared', { tabId: tab.id, reason: 'capture-failed', meta });
      return true;
    }
    console.debug('Debug: preview capture unavailable', { tabId: tab.id, meta });
    return false;
  }

  function ensureTabPreviewTooltipElement() {
    if (tabPreviewTooltipEl) {
      return tabPreviewTooltipEl;
    }
    const tooltip = document.createElement('div');
    tooltip.className = 'workspace-tab__preview-tooltip';
    tooltip.setAttribute('role', 'presentation');
    tooltip.style.position = 'fixed';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.background = '#ffffff';
    tooltip.style.border = '1px solid rgba(0, 0, 0, 0.15)';
    tooltip.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.18)';
    tooltip.style.padding = '8px';
    tooltip.style.borderRadius = '8px';
    tooltip.style.zIndex = '1200';
    tooltip.style.maxWidth = `${TAB_PREVIEW_TARGET_WIDTH + 24}px`;
    tooltip.style.transition = 'opacity 120ms ease-out';
    document.body.appendChild(tooltip);
    tabPreviewTooltipEl = tooltip;
    console.debug('Debug: preview tooltip element created');
    return tooltip;
  }

  function hideTabPreviewTooltip(reason = 'hide') {
    if (tabPreviewMeasureRaf) {
      cancelAnimationFrame(tabPreviewMeasureRaf);
      tabPreviewMeasureRaf = null;
    }
    if (!tabPreviewTooltipEl) {
      return;
    }
    tabPreviewTooltipEl.style.display = 'none';
    tabPreviewTooltipEl.style.opacity = '0';
    tabPreviewTooltipEl.innerHTML = '';
    tabPreviewTooltipEl.dataset.tabId = '';
    tabPreviewActiveId = null;
    console.debug('Debug: preview tooltip hidden', { reason });
  }

  function showTabPreviewTooltip(tab, anchorEl) {
    const tooltip = ensureTabPreviewTooltipElement();
    if (!tooltip || !tab || !anchorEl) {
      return;
    }
    tooltip.innerHTML = tab.previewMarkup;
    tooltip.dataset.tabId = tab.id;
    tooltip.style.display = 'block';
    tooltip.style.opacity = '0';
    tabPreviewActiveId = tab.id;
    if (tabPreviewMeasureRaf) {
      cancelAnimationFrame(tabPreviewMeasureRaf);
    }
    const rect = typeof anchorEl.getBoundingClientRect === 'function'
      ? anchorEl.getBoundingClientRect()
      : null;
    tabPreviewMeasureRaf = requestAnimationFrame(() => {
      const tooltipWidth = tooltip.offsetWidth || (tab.previewMeta?.width || TAB_PREVIEW_TARGET_WIDTH);
      const tooltipHeight = tooltip.offsetHeight || (tab.previewMeta?.height || TAB_PREVIEW_MIN_HEIGHT);
      let left = rect ? rect.left + (rect.width / 2) - (tooltipWidth / 2) : 12;
      let top = rect ? rect.top - tooltipHeight - 12 : 12;
      if (rect && (top < 8 || (rect.top - tooltipHeight) < 8)) {
        top = rect.bottom + 12;
      }
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (left + tooltipWidth > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - tooltipWidth - 8);
      }
      if (left < 8) {
        left = 8;
      }
      if (top + tooltipHeight > viewportHeight - 8) {
        top = Math.max(8, viewportHeight - tooltipHeight - 8);
      }
      if (top < 8) {
        top = 8;
      }
      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
      tooltip.style.opacity = '1';
      console.debug('Debug: preview tooltip positioned', {
        tabId: tab.id,
        left: Math.round(left),
        top: Math.round(top),
        width: tooltipWidth,
        height: tooltipHeight
      });
    });
  }

  function handleTabPreviewEnter(event, tab) {
    if (!tab || tab.isWelcome || !tab.type) {
      hideTabPreviewTooltip('enter-invalid');
      return;
    }
    if (tab.isRenaming) {
      hideTabPreviewTooltip('renaming');
      return;
    }
    console.debug('Debug: preview hover enter', { tabId: tab.id, type: tab.type });
    const isActive = tab.id === workspaceState.activeTabId;
    if (isActive) {
      const config = WORKSPACES[tab.type];
      if (config) {
        updateTabPreviewFromWorkspace(tab, config, { reason: 'hover-active', forceCapture: true });
      }
      hideTabPreviewTooltip('active-tab');
      console.debug('Debug: preview hover suppressed for active tab', { tabId: tab.id }); // Debug: active tab hover suppression
      return;
    }
    if (!tab.previewMarkup) {
      hideTabPreviewTooltip('no-preview');
      return;
    }
    if (tabPreviewActiveId === tab.id && tabPreviewTooltipEl && tabPreviewTooltipEl.style.display !== 'none') {
      console.debug('Debug: preview hover reuse tooltip', { tabId: tab.id });
      return;
    }
    const anchorEl = event?.currentTarget || event?.target || null;
    showTabPreviewTooltip(tab, anchorEl);
  }

  function handleTabPreviewLeave(reason = 'leave') {
    hideTabPreviewTooltip(reason);
  }

  function hideWorkspaceElement(config) {
    if (!config?.element) return;
    config.element.setAttribute('hidden', 'hidden');
    config.element.style.display = 'none';
  }

  function hideAllWorkspaces() {
    Object.values(WORKSPACES).forEach(hideWorkspaceElement);
  }

  function ensureDefaultPayload(type, config) {
    if (workspaceDefaults[type]) {
      return workspaceDefaults[type];
    }
    if (!config || typeof config.getPayload !== 'function') {
      return null;
    }
    try {
      const payload = config.getPayload();
      workspaceDefaults[type] = clonePayload(payload);
      console.debug('Debug: workspace default captured', { type, hasPayload: !!workspaceDefaults[type] });
      return workspaceDefaults[type];
    } catch (err) {
      console.error('ensureDefaultPayload error', { type, err });
      return null;
    }
  }

  function applyWorkspacePayload(config, payload) {
    if (!config || !payload) {
      console.debug('Debug: applyWorkspacePayload skipped', { hasConfig: !!config, hasPayload: !!payload });
      return;
    }
    if (typeof config.loadFromPayload === 'function') {
      config.loadFromPayload(payload);
      console.debug('Debug: workspace payload applied via custom handler', { type: config.type });
      return;
    }
    if (typeof config.loadFromFile === 'function') {
      try {
        const serialized = JSON.stringify(payload);
        const BlobCtor = window.Blob || Blob;
        const blob = new BlobCtor([serialized], { type: 'application/json' });
        config.loadFromFile(blob);
        console.debug('Debug: workspace payload applied via blob', { type: config.type, length: serialized.length });
      } catch (err) {
        console.error('applyWorkspacePayload error', { type: config.type, err });
      }
      return;
    }
    console.warn('Workspace payload application unavailable', { type: config.type });
  }

  function persistActiveTabState(tab = getActiveTab()) {
    if (!tab || !tab.type) {
      return false;
    }
    const config = WORKSPACES[tab.type];
    if (!config || typeof config.getPayload !== 'function') {
      console.debug('Debug: persistActiveTabState skipped', { tabId: tab?.id, type: tab?.type });
      return false;
    }
    try {
      const payload = config.getPayload();
      const payloadClone = clonePayload(payload);
      const changed = assignTabPayload(tab, payloadClone, { reason: 'persist-active' });
      const previewNeedsCapture = changed || (tab.previewSignature !== tab.payloadSignature);
      const previewChanged = updateTabPreviewFromWorkspace(tab, config, {
        reason: 'persist-active',
        forceCapture: previewNeedsCapture
      });
      if (changed) {
        markSessionDirty('tab-state-updated', { tabId: tab.id, type: tab.type });
      }
      console.debug('Debug: workspace state persisted', {
        tabId: tab.id,
        type: tab.type,
        hasPayload: !!tab.payload,
        changed,
        previewChanged
      }); // Debug: persist state result
      return changed;
    } catch (err) {
      console.error('persistActiveTabState error', { tabId: tab.id, type: tab.type, err });
      return false;
    }
  }

  function getActiveTab() {
    return workspaceState.tabs.find(tab => tab.id === workspaceState.activeTabId) || null;
  }

  function showWorkspaceForTab(tab, options = {}) {
    if (!tab || !tab.type) {
      showGraphSelection({ reason: 'no-type' });
      return;
    }
    const config = WORKSPACES[tab.type];
    if (!config) {
      console.warn('Unknown workspace type', { type: tab.type });
      showGraphSelection({ reason: 'unknown-type' });
      return;
    }
    hideAllWorkspaces();
    if (dom.welcomeScreen) {
      dom.welcomeScreen.style.display = 'none';
    }
    setAppHeaderVisibility(false, { reason: 'workspace-view', tabId: tab.id, type: tab.type });
    hideWorkspaceElement(config);
    if (config.element) {
      config.element.removeAttribute('hidden');
      config.element.style.display = '';
    }
    try {
      if (typeof config.ensure === 'function') {
        config.ensure();
      }
    } catch (err) {
      console.error('workspace ensure error', { type: tab.type, err });
    }
    const defaultPayload = ensureDefaultPayload(tab.type, config);
    if (!options.skipApply) {
      const payload = tab.payload ? clonePayload(tab.payload) : clonePayload(defaultPayload);
      applyWorkspacePayload(config, payload);
    }
    try {
      if (typeof config.draw === 'function') {
        config.draw();
      }
    } catch (err) {
      console.error('workspace draw error', { type: tab.type, err });
    }
    workspaceState.lastActiveGraphId = tab.id;
    console.debug('Debug: workspace displayed', { tabId: tab.id, type: tab.type });
  }

  function showGraphSelection(options = {}) {
    hideAllWorkspaces();
    if (dom.welcomeScreen) {
      dom.welcomeScreen.style.display = 'flex';
    }
    setAppHeaderVisibility(true, { reason: options.reason || 'graph-selection' });
    console.debug('Debug: welcome screen shown', { reason: options.reason || 'unspecified' });
  }

  function buildSessionPayload() {
    const active = getActiveTab();
    if (active && !active.isWelcome) {
      persistActiveTabState(active);
    } else {
      console.debug('Debug: buildSessionPayload active tab skipped', {
        hasActive: !!active,
        isWelcome: !!active?.isWelcome
      });
    }
    const graphTabs = workspaceState.tabs.filter(tab => !tab.isWelcome && tab.type);
    const activeGraphIndex = active && !active.isWelcome
      ? graphTabs.findIndex(tab => tab.id === active.id)
      : -1;
    const tabsPayload = graphTabs.map((tab, index) => {
      const payloadClone = clonePayload(tab.payload);
      console.debug('Debug: session tab snapshot', {
        tabId: tab.id,
        type: tab.type,
        index,
        hasPayload: !!payloadClone
      });
      return {
        title: tab.title,
        type: tab.type,
        payload: payloadClone
      };
    });
    const sessionPayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      activeIndex: activeGraphIndex,
      tabs: tabsPayload
    };
    console.debug('Debug: session payload built', {
      tabCount: tabsPayload.length,
      activeIndex: activeGraphIndex
    });
    return sessionPayload;
  }

  async function handleSessionSaveClick() {
    if (!Shared.fileIO || typeof Shared.fileIO.saveGraphFile !== 'function') {
      console.warn('Session save unavailable: missing Shared.fileIO.saveGraphFile');
      return;
    }
    try {
      const sessionPayload = buildSessionPayload();
      const result = await Shared.fileIO.saveGraphFile({
        context: 'session',
        fileHandle: workspaceState.sessionFileHandle,
        payload: sessionPayload,
        setFileHandle: handle => {
          workspaceState.sessionFileHandle = handle || null;
          console.debug('Debug: session file handle stored', { hasHandle: !!handle });
        },
        setFileName: name => {
          workspaceState.sessionFileName = name || '';
          console.debug('Debug: session file name stored', { name: workspaceState.sessionFileName });
        },
        downloadFileName: workspaceState.sessionFileName || 'workspace.session',
        fileTypes: SESSION_FILE_TYPES
      });
      console.debug('Debug: session save result', { status: result?.status, via: result?.via });
      if (result && (result.status === 'saved' || result.status === 'downloaded')) {
        clearSessionDirty('session-save-success');
      }
    } catch (err) {
      console.error('handleSessionSaveClick error', err);
    }
  }

  async function loadWorkspaceSessionBlob(blob, meta = {}) {
    if (!blob) {
      console.warn('loadWorkspaceSessionBlob skipped', { reason: 'no-blob', meta });
      return;
    }
    try {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      const tabCount = Array.isArray(parsed?.tabs) ? parsed.tabs.length : 0;
      console.debug('Debug: session blob parsed', {
        bytes: text.length,
        hasTabs: Array.isArray(parsed?.tabs),
        tabCount,
        reason: meta.reason || 'unknown'
      });
      applySessionData(parsed, meta);
    } catch (err) {
      console.error('loadWorkspaceSessionBlob error', { err, meta });
    }
  }

  function applySessionData(session, meta = {}) {
    const tabs = Array.isArray(session?.tabs) ? session.tabs : [];
    hideDuplicatePrompt();
    workspaceState.tabs = [];
    workspaceState.activeTabId = null;
    workspaceState.pendingDuplicateSource = null;
    workspaceState.lastActiveGraphId = null;
    workspaceState.renameFocusId = null;
    workspaceState.pendingClosePrompt = null;
    workspaceState.nextId = 1;
    if (Object.prototype.hasOwnProperty.call(meta, 'fileHandle')) {
      workspaceState.sessionFileHandle = meta.fileHandle;
      console.debug('Debug: session file handle applied', { hasHandle: !!meta.fileHandle });
    }
    if (meta.fileName) {
      workspaceState.sessionFileName = meta.fileName;
      console.debug('Debug: session file name applied', { name: workspaceState.sessionFileName });
    }
    const welcomeTab = createTab({ title: 'Welcome', isWelcome: true, allowClose: false });
    workspaceState.tabs.push(welcomeTab);
    const graphTabs = [];
    tabs.forEach((tabData, index) => {
      if (!tabData || typeof tabData.type !== 'string') {
        console.warn('applySessionData skipping invalid tab', { index, tabData });
        return;
      }
      const clonedPayload = clonePayload(tabData.payload) || null;
      const newTab = createTab({
        title: tabData.title || `Workspace ${index + 1}`,
        type: tabData.type,
        payload: clonedPayload
      });
      graphTabs.push(newTab);
      workspaceState.tabs.push(newTab);
      console.debug('Debug: session tab restored', {
        index,
        tabId: newTab.id,
        type: newTab.type,
        hasPayload: !!clonedPayload
      });
    });
    workspaceState.activeTabId = welcomeTab.id;
    renderTabs();
    const requestedIndex = typeof session?.activeIndex === 'number' ? session.activeIndex : -1;
    const targetTab = (requestedIndex >= 0 && requestedIndex < graphTabs.length)
      ? graphTabs[requestedIndex]
      : (graphTabs[0] || null);
    if (targetTab) {
      activateTab(targetTab.id, { skipPersist: true, reason: meta.reason || 'session-load' });
    } else {
      showGraphSelection({ reason: 'session-empty' });
    }
    clearSessionDirty(meta.reason || 'session-load');
    console.debug('Debug: session applied', {
      requestedIndex,
      resolvedIndex: targetTab ? graphTabs.indexOf(targetTab) : -1,
      tabCount: graphTabs.length,
      reason: meta.reason || 'session-load'
    });
  }

  async function handleSessionLoadClick() {
    if (!Shared.fileIO || typeof Shared.fileIO.openGraphFile !== 'function') {
      console.warn('Session load fallback to input: missing Shared.fileIO.openGraphFile');
      dom.sessionFileInput?.click();
      return;
    }
    try {
      let lastHandle = null;
      let lastName = '';
      const result = await Shared.fileIO.openGraphFile({
        context: 'session',
        setFileHandle: handle => {
          lastHandle = handle || null;
          workspaceState.sessionFileHandle = handle || null;
          console.debug('Debug: session load handle captured', { hasHandle: !!handle });
        },
        setFileName: name => {
          lastName = name || '';
          workspaceState.sessionFileName = lastName;
          console.debug('Debug: session load filename captured', { name: workspaceState.sessionFileName });
        },
        fileTypes: SESSION_FILE_TYPES,
        loadFromFile: file => loadWorkspaceSessionBlob(file, {
          reason: 'session-load-picker',
          fileHandle: lastHandle,
          fileName: file?.name || lastName
        }),
        triggerInput: () => {
          console.debug('Debug: session load fallback trigger', {});
          lastHandle = null;
          lastName = '';
          dom.sessionFileInput?.click();
        }
      });
      console.debug('Debug: session load picker result', { status: result?.status, via: result?.via });
    } catch (err) {
      console.error('handleSessionLoadClick error', err);
    }
  }

  function handleSessionInputChange(event) {
    const input = event?.target;
    const file = input?.files && input.files[0];
    if (!file) {
      console.debug('Debug: session input change without file');
      return;
    }
    workspaceState.sessionFileHandle = null;
    workspaceState.sessionFileName = file.name || '';
    console.debug('Debug: session input received file', {
      name: workspaceState.sessionFileName,
      size: file.size
    });
    loadWorkspaceSessionBlob(file, {
      reason: 'session-load-input',
      fileHandle: null,
      fileName: workspaceState.sessionFileName
    }).finally(() => {
      if (input) {
        input.value = '';
      }
    });
  }

  function shouldWarnBeforeUnload() {
    let persistedActive = false;
    try {
      const active = getActiveTab();
      if (active && !active.isWelcome) {
        persistedActive = persistActiveTabState(active) || persistedActive;
      }
    } catch (err) {
      console.error('beforeunload persist error', err);
    }
    const hasData = graphTabsHaveData();
    const shouldWarn = workspaceState.sessionDirty && hasData;
    console.debug('Debug: beforeunload evaluation', {
      shouldWarn,
      dirty: workspaceState.sessionDirty,
      hasData,
      persistedActive
    }); // Debug: beforeunload state snapshot
    return shouldWarn;
  }

  function createTab(options = {}) {
    const index = workspaceState.tabs.length + 1;
    const id = `workspace-${workspaceState.nextId++}`;
    const tab = {
      id,
      title: options.title || `Workspace ${index}`,
      type: options.type || null,
      payload: options.payload || null,
      payloadSignature: options.payloadSignature !== undefined
        ? options.payloadSignature
        : serializePayloadSignature(options.payload || null),
      duplicateSource: options.duplicateSource || null,
      isWelcome: !!options.isWelcome,
      allowClose: options.allowClose !== false,
      isRenaming: false,
      previewMarkup: options.previewMarkup || null,
      previewSignature: options.previewSignature || null,
      previewMeta: options.previewMeta || null
    };
    if (tab.isWelcome) {
      tab.allowClose = false;
    }
    console.debug('Debug: workspace tab created', {
      id,
      index,
      duplicateSource: tab.duplicateSource,
      isWelcome: tab.isWelcome
    });
    return tab;
  }

  function getTabById(tabId) {
    return workspaceState.tabs.find(tab => tab.id === tabId) || null;
  }

  function determineDuplicateSourceCandidate(preferredId) {
    if (preferredId) {
      const preferred = getTabById(preferredId);
      if (preferred && preferred.type && !preferred.isWelcome) {
        return preferred.id;
      }
    }
    if (workspaceState.lastActiveGraphId) {
      const lastActive = getTabById(workspaceState.lastActiveGraphId);
      if (lastActive && lastActive.type && !lastActive.isWelcome) {
        return lastActive.id;
      }
    }
    return null;
  }

  function renderTabs() {
    if (!dom.tabsList) return;
    hideTabPreviewTooltip('render');
    dom.tabsList.innerHTML = '';
    workspaceState.tabs.forEach((tab, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workspace-tab'
        + (tab.id === workspaceState.activeTabId ? ' is-active' : '')
        + (tab.isWelcome ? ' is-welcome' : '')
        + (tab.isRenaming ? ' is-renaming' : '');
      btn.dataset.tabId = tab.id;
      if (tab.previewMarkup) {
        btn.dataset.hasPreview = 'true';
      } else {
        delete btn.dataset.hasPreview;
      }
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', tab.id === workspaceState.activeTabId ? 'true' : 'false');
      const displayTitle = tab.title || `Workspace ${index + 1}`;
      btn.addEventListener('click', () => {
        console.debug('Debug: workspace tab selected', { tabId: tab.id });
        activateTab(tab.id);
      });
      btn.addEventListener('mouseenter', event => handleTabPreviewEnter(event, tab));
      btn.addEventListener('mouseleave', () => handleTabPreviewLeave('leave'));
      btn.addEventListener('blur', () => handleTabPreviewLeave('blur'));

      const label = document.createElement('span');
      label.className = 'workspace-tab__label';
      label.textContent = displayTitle;
      if (!tab.isWelcome) {
        label.title = 'Double-click to rename this tab';
        label.addEventListener('dblclick', event => {
          event.stopPropagation();
          beginRenameTab(tab.id);
        });
      }
      btn.appendChild(label);

      if (tab.isRenaming) {
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.className = 'workspace-tab__rename';
        renameInput.value = displayTitle;
        renameInput.setAttribute('aria-label', 'Rename workspace tab');
        let renameHandled = false;
        const commitRename = (value, reason) => {
          if (renameHandled) return;
          renameHandled = true;
          console.debug('Debug: tab rename commit requested', { tabId: tab.id, reason, nextTitle: value });
          commitTabRename(tab.id, value, { reason });
        };
        const cancelRename = reason => {
          if (renameHandled) return;
          renameHandled = true;
          console.debug('Debug: tab rename cancel requested', { tabId: tab.id, reason });
          cancelTabRename(tab.id, reason);
        };
        renameInput.addEventListener('keydown', event => {
          const key = event.key;
          if (key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commitRename(renameInput.value, 'enter');
          } else if (key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelRename('escape');
          } else {
            if (key === ' ' || key === 'Spacebar' || key === 'Space') {
              event.preventDefault();
              event.stopPropagation();
              const selectionStart = typeof renameInput.selectionStart === 'number'
                ? renameInput.selectionStart
                : renameInput.value.length;
              const selectionEnd = typeof renameInput.selectionEnd === 'number'
                ? renameInput.selectionEnd
                : selectionStart;
              const before = renameInput.value.slice(0, selectionStart);
              const after = renameInput.value.slice(selectionEnd);
              renameInput.value = `${before} ${after}`;
              const nextCaret = selectionStart + 1;
              if (typeof renameInput.setSelectionRange === 'function') {
                renameInput.setSelectionRange(nextCaret, nextCaret);
              }
              console.debug('Debug: tab rename space inserted', { tabId: tab.id, caret: nextCaret });
            } else {
              event.stopPropagation();
            }
          }
        });
        renameInput.addEventListener('keyup', event => {
          if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
            event.stopPropagation();
          }
        });
        renameInput.addEventListener('keypress', event => {
          if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
            event.stopPropagation();
          }
        });
        renameInput.addEventListener('blur', () => {
          cancelRename('blur');
        });
        renameInput.addEventListener('click', event => event.stopPropagation());
        btn.appendChild(renameInput);
      }

      if (!tab.isWelcome && tab.allowClose !== false) {
        const closeEl = document.createElement('span');
        closeEl.className = 'workspace-tab__close';
        closeEl.setAttribute('role', 'button');
        closeEl.setAttribute('aria-label', `Close ${displayTitle} tab`);
        closeEl.tabIndex = 0;
        closeEl.textContent = '×';
        closeEl.addEventListener('click', event => {
          event.stopPropagation();
          closeTab(tab.id);
        });
        closeEl.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
            event.preventDefault();
            closeTab(tab.id);
          }
        });
        btn.appendChild(closeEl);
      }

      dom.tabsList.appendChild(btn);

      if (tab.isRenaming && workspaceState.renameFocusId === tab.id) {
        requestAnimationFrame(() => {
          const input = btn.querySelector('.workspace-tab__rename');
          if (input) {
            input.focus();
            input.select();
          }
          workspaceState.renameFocusId = null;
        });
      }
    });
  }

  function beginRenameTab(tabId) {
    const tab = getTabById(tabId);
    if (!tab) {
      console.debug('Debug: beginRenameTab skipped', { tabId, reason: 'missing-tab' });
      return;
    }
    if (tab.isWelcome) {
      console.debug('Debug: beginRenameTab blocked for welcome tab', { tabId });
      return;
    }
    tab.isRenaming = true;
    workspaceState.renameFocusId = tabId;
    renderTabs();
    console.debug('Debug: tab rename initiated', { tabId });
  }

  function commitTabRename(tabId, newTitle, meta = {}) {
    const tab = getTabById(tabId);
    if (!tab) {
      console.debug('Debug: commitTabRename skipped', { tabId, reason: 'missing-tab' });
      return;
    }
    const previousTitle = tab.title;
    const trimmed = (newTitle || '').trim();
    if (trimmed) {
      tab.title = trimmed;
    } else if (!tab.title) {
      const tabIndex = workspaceState.tabs.indexOf(tab);
      tab.title = `Workspace ${tabIndex >= 0 ? tabIndex + 1 : ''}`.trim();
      console.debug('Debug: tab rename fallback applied', { tabId, fallbackTitle: tab.title });
    }
    tab.isRenaming = false;
    workspaceState.renameFocusId = null;
    renderTabs();
    if (tab.title !== previousTitle) {
      markSessionDirty('tab-renamed', { tabId, previousTitle, nextTitle: tab.title });
    }
    console.debug('Debug: tab rename committed', { tabId, title: tab.title, trigger: meta.reason || 'unknown' });
  }

  function cancelTabRename(tabId, reason) {
    const tab = getTabById(tabId);
    if (!tab) {
      console.debug('Debug: cancelTabRename skipped', { tabId, reason: 'missing-tab' });
      return;
    }
    tab.isRenaming = false;
    workspaceState.renameFocusId = null;
    renderTabs();
    console.debug('Debug: tab rename cancelled', { tabId, reason });
  }

  function setUnsavedPromptBusy(isBusy) {
    unsavedPromptBusy = !!isBusy;
    const targets = [dom.unsavedSave, dom.unsavedDiscard, dom.unsavedCancel];
    targets.forEach(btn => {
      if (btn) {
        btn.disabled = !!isBusy;
      }
    });
    if (dom.unsavedPrompt) {
      dom.unsavedPrompt.classList.toggle('is-busy', !!isBusy);
    }
    console.debug('Debug: unsaved prompt busy state', { busy: unsavedPromptBusy });
  }

  function showUnsavedPrompt(tab, meta = {}) {
    if (!tab) {
      console.debug('Debug: showUnsavedPrompt skipped', { reason: 'missing-tab' });
      return;
    }
    const tabId = tab.id;
    const previousActiveId = meta.previousActiveId !== undefined
      ? meta.previousActiveId
      : (!meta.wasActive && workspaceState.activeTabId && workspaceState.activeTabId !== tabId
        ? workspaceState.activeTabId
        : null);
    const promptState = {
      tabId,
      wasActive: !!meta.wasActive,
      previousActiveId,
      reason: meta.reason || 'close-request',
      timestamp: Date.now()
    };
    workspaceState.pendingClosePrompt = promptState;
    const tabName = tab.title || 'this workspace';
    if (!dom.unsavedPrompt || !dom.unsavedSave || !dom.unsavedDiscard || !dom.unsavedCancel) {
      const confirmMessage = `Close ${tabName} without saving data?`;
      const proceed = window.confirm ? window.confirm(confirmMessage) : true;
      console.debug('Debug: unsaved prompt fallback confirm', { tabId, proceed });
      if (proceed) {
        closeTab(tabId, { force: true, skipPrompt: true, skipPersist: true, reason: 'fallback-confirm' });
      } else {
        workspaceState.pendingClosePrompt = null;
      }
      return;
    }
    if (dom.unsavedTitle) {
      dom.unsavedTitle.textContent = `Save changes to ${tabName}?`;
    }
    if (dom.unsavedMessage) {
      dom.unsavedMessage.textContent = 'This tab has unsaved data. Save to keep your work, close without saving to discard it, or cancel to return to the workspace.';
    }
    dom.unsavedPrompt.dataset.tabId = tabId;
    dom.unsavedPrompt.removeAttribute('hidden');
    dom.unsavedPrompt.focus?.();
    console.debug('Debug: unsaved prompt displayed', promptState);
  }

  function hideUnsavedPrompt() {
    if (!dom.unsavedPrompt) {
      return;
    }
    dom.unsavedPrompt.setAttribute('hidden', 'hidden');
    delete dom.unsavedPrompt.dataset.tabId;
    console.debug('Debug: unsaved prompt hidden');
  }

  async function handleUnsavedSave() {
    if (unsavedPromptBusy) {
      console.debug('Debug: handleUnsavedSave skipped', { reason: 'busy' });
      return;
    }
    const pending = workspaceState.pendingClosePrompt;
    if (!pending) {
      console.debug('Debug: handleUnsavedSave skipped', { reason: 'no-pending' });
      hideUnsavedPrompt();
      return;
    }
    const tab = getTabById(pending.tabId);
    if (!tab) {
      console.debug('Debug: handleUnsavedSave missing tab', { tabId: pending.tabId });
      workspaceState.pendingClosePrompt = null;
      hideUnsavedPrompt();
      return;
    }
    setUnsavedPromptBusy(true);
    hideUnsavedPrompt();
    const restoreTarget = pending.previousActiveId && pending.previousActiveId !== tab.id
      ? pending.previousActiveId
      : null;
    try {
      if (workspaceState.activeTabId !== tab.id) {
        const currentActive = getActiveTab();
        if (currentActive && currentActive.id !== tab.id) {
          persistActiveTabState(currentActive);
        }
        console.debug('Debug: unsaved prompt activating tab', { tabId: tab.id, previousActiveId: currentActive?.id || null });
        activateTab(tab.id, { reason: 'unsaved-save' });
      }
      const component = window.Components?.[tab.type];
      if (component && typeof component.save === 'function') {
        console.debug('Debug: unsaved prompt invoking save', { tabId: tab.id, type: tab.type });
        await component.save();
      } else if (component && typeof component.saveAs === 'function') {
        console.debug('Debug: unsaved prompt invoking saveAs fallback', { tabId: tab.id, type: tab.type });
        await component.saveAs();
      } else {
        console.warn('Unsaved prompt save unavailable', { tabId: tab.id, type: tab.type });
        workspaceState.pendingClosePrompt = pending;
        showUnsavedPrompt(tab, { wasActive: true, reason: 'no-save-handler', previousActiveId: pending.previousActiveId });
        return;
      }
      persistActiveTabState(tab);
      workspaceState.pendingClosePrompt = null;
      console.debug('Debug: unsaved prompt save complete', { tabId: tab.id });
      closeTab(tab.id, { force: true, skipPrompt: true, skipPersist: true, reason: 'unsaved-save' });
      if (restoreTarget && getTabById(restoreTarget)) {
        activateTab(restoreTarget, { reason: 'restore-after-unsaved-save', skipPersist: true });
      }
    } catch (err) {
      console.error('unsaved prompt save error', { tabId: tab.id, err });
      workspaceState.pendingClosePrompt = pending;
      showUnsavedPrompt(tab, { wasActive: true, reason: 'save-error', previousActiveId: pending.previousActiveId });
    } finally {
      setUnsavedPromptBusy(false);
    }
  }

  function handleUnsavedDiscard() {
    if (unsavedPromptBusy) {
      console.debug('Debug: handleUnsavedDiscard skipped', { reason: 'busy' });
      return;
    }
    const pending = workspaceState.pendingClosePrompt;
    if (!pending) {
      hideUnsavedPrompt();
      return;
    }
    workspaceState.pendingClosePrompt = null;
    hideUnsavedPrompt();
    console.debug('Debug: unsaved prompt discard confirmed', { tabId: pending.tabId });
    closeTab(pending.tabId, { force: true, skipPrompt: true, skipPersist: true, reason: 'unsaved-discard' });
  }

  function handleUnsavedCancel() {
    if (unsavedPromptBusy) {
      console.debug('Debug: handleUnsavedCancel skipped', { reason: 'busy' });
      return;
    }
    const pending = workspaceState.pendingClosePrompt;
    workspaceState.pendingClosePrompt = null;
    hideUnsavedPrompt();
    if (pending) {
      console.debug('Debug: unsaved prompt cancelled', { tabId: pending.tabId });
      if (pending.previousActiveId && pending.previousActiveId !== workspaceState.activeTabId && getTabById(pending.previousActiveId)) {
        activateTab(pending.previousActiveId, { reason: 'unsaved-cancel-restore', skipPersist: true });
      }
    }
  }

  function bindUnsavedPromptHandlers() {
    if (dom.unsavedSave) {
      dom.unsavedSave.addEventListener('click', () => { void handleUnsavedSave(); });
    }
    if (dom.unsavedDiscard) {
      dom.unsavedDiscard.addEventListener('click', handleUnsavedDiscard);
    }
    if (dom.unsavedCancel) {
      dom.unsavedCancel.addEventListener('click', handleUnsavedCancel);
    }
    console.debug('Debug: unsaved prompt handlers bound', {
      hasSave: !!dom.unsavedSave,
      hasDiscard: !!dom.unsavedDiscard,
      hasCancel: !!dom.unsavedCancel
    });
  }

  function performTabRemoval(tab, meta = {}) {
    if (!tab) {
      return;
    }
    const tabId = tab.id;
    const wasActive = !!meta.wasActive;
    const reason = meta.reason || 'close-tab';
    const index = workspaceState.tabs.indexOf(tab);
    if (index < 0) {
      console.warn('performTabRemoval missing index', { tabId, reason });
      return;
    }
    workspaceState.tabs.splice(index, 1);
    if (workspaceState.pendingDuplicateSource === tabId) {
      workspaceState.pendingDuplicateSource = null;
    }
    if (workspaceState.lastActiveGraphId === tabId) {
      const fallbackGraph = [...workspaceState.tabs].reverse().find(item => item.type && !item.isWelcome) || null;
      workspaceState.lastActiveGraphId = fallbackGraph ? fallbackGraph.id : null;
    }
    if (wasActive) {
      const fallback = workspaceState.tabs[index - 1]
        || workspaceState.tabs[index]
        || workspaceState.tabs[workspaceState.tabs.length - 1]
        || null;
      if (fallback) {
        activateTab(fallback.id, { skipPersist: true, reason });
      } else {
        workspaceState.activeTabId = null;
        renderTabs();
        showGraphSelection({ reason: 'tab-closed-none' });
      }
    } else {
      renderTabs();
      console.debug('Debug: workspace tab closed (inactive)', { tabId, remaining: workspaceState.tabs.length, reason });
    }
    console.debug('Debug: workspace tab closed', { tabId, wasActive, remainingTabs: workspaceState.tabs.length, reason });
    if (!meta.skipDirty) {
      markSessionDirty('tab-removed', { tabId, reason });
    }
  }

  function closeTab(tabId, options = {}) {
    const tab = getTabById(tabId);
    if (!tab) {
      console.debug('Debug: closeTab skipped', { tabId, reason: 'missing-tab' });
      return;
    }
    if (tab.isWelcome) {
      console.debug('Debug: closeTab skipped for welcome tab', { tabId });
      return;
    }
    hideDuplicatePrompt();
    const wasActive = workspaceState.activeTabId === tabId;
    const force = options.force === true;
    const skipPrompt = options.skipPrompt === true;
    const skipPersist = options.skipPersist === true;
    const reason = options.reason || 'close-tab';
    let persistedActive = false;
    if (wasActive && !skipPersist) {
      persistActiveTabState(tab);
      persistedActive = true;
    }
    if (!force && !skipPrompt) {
      const hasData = tabHasTableData(tab);
      console.debug('Debug: closeTab unsaved data check', { tabId, hasData, wasActive, reason });
      if (hasData) {
        showUnsavedPrompt(tab, { wasActive, reason });
        return;
      }
    }
    if (force && wasActive && !skipPersist && !persistedActive) {
      persistActiveTabState(tab);
    }
    workspaceState.pendingClosePrompt = null;
    hideUnsavedPrompt();
    performTabRemoval(tab, { wasActive, reason });
  }

  function activateTab(tabId, options = {}) {
    const current = getActiveTab();
    if (current && current.id !== tabId && !options.skipPersist) {
      persistActiveTabState(current);
    }
    workspaceState.activeTabId = tabId;
    renderTabs();
    const target = getActiveTab();
    if (!target) {
      console.warn('activateTab missing target', { tabId });
      return;
    }
    if (!target.type) {
      const candidateSource = target.isWelcome
        ? determineDuplicateSourceCandidate(workspaceState.lastActiveGraphId)
        : (target.duplicateSource || determineDuplicateSourceCandidate(current?.id));
      workspaceState.pendingDuplicateSource = candidateSource;
      console.debug('Debug: activateTab showing selection', {
        tabId,
        isWelcome: !!target.isWelcome,
        candidateSource,
        reason: options.reason || 'unconfigured'
      });
      showGraphSelection({ reason: target.isWelcome ? 'welcome-tab' : options.reason || 'unconfigured' });
      return;
    }
    workspaceState.pendingDuplicateSource = null;
    workspaceState.lastActiveGraphId = target.id;
    showWorkspaceForTab(target, { skipApply: !!options.skipApplyPayload });
  }

  function hideDuplicatePrompt() {
    if (!dom.duplicatePrompt) return;
    dom.duplicatePrompt.setAttribute('hidden', 'hidden');
    if (dom.duplicateReuse) dom.duplicateReuse.onclick = null;
    if (dom.duplicateEmpty) dom.duplicateEmpty.onclick = null;
    if (dom.duplicateCancel) dom.duplicateCancel.onclick = null;
  }

  function showDuplicateDecision({ tab, type, sourceTab, canDuplicate }) {
    if (!canDuplicate) {
      console.debug('Debug: duplicate prompt bypassed', {
        tabId: tab?.id,
        type,
        hasSource: !!sourceTab
      });
      if (tab) {
        assignTabPayload(tab, null, { reason: 'duplicate-bypass-clear' });
      }
      hideDuplicatePrompt();
      showWorkspaceForTab(tab);
      markSessionDirty('duplicate-bypass', { tabId: tab?.id || null, type });
      return;
    }
    if (!dom.duplicatePrompt || !dom.duplicateEmpty) {
      console.debug('Debug: duplicate prompt unavailable, applying fallback', { type, canDuplicate });
      if (canDuplicate && sourceTab?.payload) {
        const clonedPayload = clonePayload(sourceTab.payload);
        assignTabPayload(tab, clonedPayload, { reason: 'duplicate-fallback-clone' });
      } else {
        assignTabPayload(tab, null, { reason: 'duplicate-fallback-empty' });
      }
      showWorkspaceForTab(tab);
      markSessionDirty('duplicate-fallback', { tabId: tab?.id || null, type, reused: !!(canDuplicate && sourceTab?.payload) });
      return;
    }
    const info = GRAPH_TYPES.find(item => item.type === type);
    const previousName = sourceTab?.title || 'the previous tab';
    if (dom.duplicateTitle) {
      dom.duplicateTitle.textContent = `Reuse data for ${info?.label || 'this workspace'}?`;
    }
    dom.duplicateMessage.textContent = canDuplicate
      ? `Would you like to duplicate the data and settings from ${previousName} into this ${info?.label || 'workspace'}?`
      : 'Data reuse is only available when the graph type matches the current tab. This workspace will start empty.';
    if (dom.duplicateReuse) {
      dom.duplicateReuse.style.display = canDuplicate ? '' : 'none';
      dom.duplicateReuse.disabled = !canDuplicate;
      dom.duplicateReuse.onclick = () => {
        hideDuplicatePrompt();
        if (canDuplicate && sourceTab?.payload) {
          const clonedPayload = clonePayload(sourceTab.payload);
          assignTabPayload(tab, clonedPayload, { reason: 'duplicate-reuse' });
        }
        showWorkspaceForTab(tab);
        markSessionDirty('duplicate-reuse', { tabId: tab?.id || null, sourceId: sourceTab?.id || null });
      };
    }
    dom.duplicateEmpty.onclick = () => {
      hideDuplicatePrompt();
      assignTabPayload(tab, null, { reason: 'duplicate-empty' });
      showWorkspaceForTab(tab);
      markSessionDirty('duplicate-empty', { tabId: tab?.id || null });
    };
    if (dom.duplicateCancel) {
      dom.duplicateCancel.onclick = () => {
        hideDuplicatePrompt();
        tab.type = null;
        tab.title = `Workspace ${workspaceState.tabs.indexOf(tab) + 1}`;
        const fallbackSource = sourceTab?.id || null;
        tab.duplicateSource = fallbackSource;
        workspaceState.pendingDuplicateSource = fallbackSource;
        renderTabs();
        showGraphSelection({ reason: 'duplicate-cancelled' });
      };
    }
    dom.duplicatePrompt.removeAttribute('hidden');
  }

  function handleGraphSelection(type) {
    let tab = getActiveTab();
    if (!tab) {
      console.warn('handleGraphSelection with no active tab', { type });
      return;
    }
    let previousType = tab.type || null;
    let previousTitle = tab.title || '';
    if (tab.isWelcome) {
      const candidateSource = workspaceState.pendingDuplicateSource
        || determineDuplicateSourceCandidate(workspaceState.lastActiveGraphId);
      const newTab = createTab({ duplicateSource: candidateSource });
      workspaceState.tabs.push(newTab);
      workspaceState.activeTabId = newTab.id;
      workspaceState.pendingDuplicateSource = candidateSource;
      tab = newTab;
      renderTabs();
      console.debug('Debug: welcome selection spawning tab', {
        newTabId: newTab.id,
        type,
        candidateSource
      });
      markSessionDirty('tab-created', { tabId: newTab.id, reason: 'welcome-selection' });
      previousType = null;
      previousTitle = tab.title || '';
    }
    const priorType = previousType;
    const priorTitle = previousTitle;
    tab.type = type;
    const info = GRAPH_TYPES.find(item => item.type === type);
    const config = WORKSPACES[type];
    const resolvedTitle = info?.label || config?.tabLabel || tab.title;
    tab.title = resolvedTitle;
    tab.isRenaming = false;
    renderTabs();
    console.debug('Debug: graph assigned to tab', { tabId: tab.id, type });
    if (priorType !== type) {
      markSessionDirty('graph-type-changed', { tabId: tab.id, previousType: priorType, nextType: type });
    }
    if (tab.title !== priorTitle) {
      markSessionDirty('tab-title-updated', { tabId: tab.id, previousTitle: priorTitle, nextTitle: tab.title });
    }
    const sourceId = tab.duplicateSource || workspaceState.pendingDuplicateSource;
    workspaceState.pendingDuplicateSource = null;
    tab.duplicateSource = null;
    const sourceTab = sourceId ? getTabById(sourceId) : null;
    const canDuplicate = Boolean(sourceTab && sourceTab.type === type && sourceTab.payload);
    if (canDuplicate) {
      showDuplicateDecision({ tab, type, sourceTab, canDuplicate });
      return;
    }
    if (sourceTab) {
      console.debug('Debug: data reuse skipped', {
        tabId: tab.id,
        type,
        sourceType: sourceTab.type,
        hasPayload: !!sourceTab.payload
      });
    }
    const payloadCleared = assignTabPayload(tab, null, { reason: 'graph-selection-reset' });
    if (payloadCleared) {
      markSessionDirty('graph-payload-reset', { tabId: tab.id, previousType: priorType, nextType: type });
    }
    showWorkspaceForTab(tab);
  }

  function handleAddTabClick() {
    const current = getActiveTab();
    if (current && !current.isWelcome) {
      persistActiveTabState(current);
    }
    const candidateSource = determineDuplicateSourceCandidate(current?.id);
    const newTab = createTab({ duplicateSource: candidateSource });
    workspaceState.tabs.push(newTab);
    workspaceState.activeTabId = newTab.id;
    workspaceState.pendingDuplicateSource = candidateSource;
    renderTabs();
    markSessionDirty('tab-created', { tabId: newTab.id, reason: 'add-tab-click' });
    showGraphSelection({ reason: 'new-tab' });
    console.debug('Debug: add tab invoked', { newTabId: newTab.id, duplicateSource: candidateSource });
  }

  function createSelectionCards() {
    if (!dom.selectionGrid) return;
    dom.selectionGrid.innerHTML = '';
    GRAPH_TYPES.forEach(info => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'graph-card';
      card.setAttribute('role', 'listitem');
      card.dataset.graphType = info.type;
      card.innerHTML = `
        <span class="graph-card__hint">${info.hint || 'Workspace'}</span>
        <h3 class="graph-card__title">${info.label}</h3>
        <p class="graph-card__description">${info.description}</p>
      `;
      card.addEventListener('click', () => {
        console.debug('Debug: graph card selected', { type: info.type });
        handleGraphSelection(info.type);
      });
      dom.selectionGrid.appendChild(card);
    });
  }

  function bootstrapComponents() {
    try {
      Object.values(WORKSPACES).forEach(config => {
        try {
          if (typeof config.ensure === 'function') {
            config.ensure();
          }
        } catch (err) {
          console.error('bootstrap ensure error', { type: config.type, err });
        }
        ensureDefaultPayload(config.type, config);
        hideWorkspaceElement(config);
      });
      console.debug('Debug: components bootstrapped', { count: Object.keys(WORKSPACES).length });
    } catch (err) {
      console.error('bootstrapComponents error', err);
    }
  }

  function initializeWorkspace() {
    createSelectionCards();
    const welcomeTab = createTab({ title: 'Welcome', isWelcome: true, allowClose: false });
    workspaceState.tabs.push(welcomeTab);
    workspaceState.activeTabId = welcomeTab.id;
    renderTabs();
    showGraphSelection({ reason: 'initial' });
    if (dom.addTabBtn) {
      dom.addTabBtn.addEventListener('click', handleAddTabClick);
    }
    if (dom.sessionSaveBtn) {
      dom.sessionSaveBtn.addEventListener('click', handleSessionSaveClick);
    }
    if (dom.sessionLoadBtn) {
      dom.sessionLoadBtn.addEventListener('click', handleSessionLoadClick);
    }
    if (dom.sessionFileInput) {
      dom.sessionFileInput.addEventListener('change', handleSessionInputChange);
    }
    bindUnsavedPromptHandlers();
    console.debug('Debug: workspace UI initialized', { welcomeTabId: welcomeTab.id });
  }

  bootstrapComponents();
  initializeWorkspace();

  window.addEventListener('beforeunload', event => {
    if (shouldWarnBeforeUnload()) {
      const message = 'You have unsaved workspace changes. Save your session before leaving?';
      event.preventDefault();
      event.returnValue = message;
      console.debug('Debug: beforeunload prompt engaged', { message }); // Debug: beforeunload trigger trace
      return message;
    }
    console.debug('Debug: beforeunload bypassed', { dirty: workspaceState.sessionDirty }); // Debug: beforeunload bypass trace
    return undefined;
  });

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      drawFromLists();
    }
  });

  window.addEventListener('scroll', () => hideTabPreviewTooltip('scroll'), true);
  window.addEventListener('resize', () => hideTabPreviewTooltip('resize'));

})();

