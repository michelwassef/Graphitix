(function(global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId)
    : null;
  const importFontStyles = (scopeId, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true });
    }
  };
  const formControls = Shared.formControls = Shared.formControls || {};
  const debug = (message, payload) => {
    if(typeof Shared.debug === 'function'){
      Shared.debug(message, payload);
      return;
    }
    if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    }
  };
  const Components = global.Components = global.Components || {};
  const venn = Components.venn = Components.venn || {};
  venn.__installed = true;
  venn.ready = false;

  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if (!fileIO.saveGraphFile) {
    debug('Debug: venn component awaiting Shared.fileIO helpers');
  }

  const debugLog = (label, payload) => {
    debug(`Debug: venn ${label}`, payload || {});
  };

  const DEFAULT_VENN_TITLE = 'Venn diagram';
  const DEFAULT_UPSET_TITLE = 'UpSet plot';
  const DEFAULT_PLOT_TYPE = 'venn';
  const DEFAULT_UPSET_SETTINGS = {
    sort: 'size-desc',
    maxIntersections: 12,
    showEmpty: false,
    showCounts: true,
    showSetCounts: true,
    showGrid: true,
    dotSize: 5,
    useSetColors: false,
    barColor: '#2f2f2f',
    setBarColor: '#2f2f2f',
    dotColor: '#2f2f2f',
    inactiveDotColor: '#d6d6d6',
    connectorColor: '#2f2f2f',
    gridColor: '#e5e7eb'
  };

  const makeEditable = (el, onChange, options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if (typeof fn === 'function') {
      return fn(el, onChange, options);
    }
    console.warn('venn component makeEditable fallback missing');
    return undefined;
  };

  const formatSharedPValue = value => {
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    if(typeof formatter === 'function'){
      return formatter(value);
    }
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    return Number(value).toExponential(5);
  };

  function attachVennSelectAutoSize(select, label){
    if(!select){ return; }
    if(typeof formControls.attachSelectAutoSize === 'function'){
      formControls.attachSelectAutoSize(select, label || 'venn');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'venn';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          debug('Debug: venn select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          debug('Debug: venn select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        debug('Debug: venn select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        debug('Debug: venn select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
  }

  function normalizePlotType(value) {
    if (typeof value !== 'string') return DEFAULT_PLOT_TYPE;
    const cleaned = value.trim().toLowerCase();
    return cleaned === 'upset' ? 'upset' : 'venn';
  }

  function getActivePlotType() {
    return normalizePlotType(state.ui?.plotType?.value || DEFAULT_PLOT_TYPE);
  }

  function maybeSwapDefaultTitle(nextType) {
    const current = state.titleText != null ? String(state.titleText) : '';
    if (nextType === 'upset' && current === DEFAULT_VENN_TITLE) {
      state.titleText = DEFAULT_UPSET_TITLE;
      return true;
    }
    if (nextType === 'venn' && current === DEFAULT_UPSET_TITLE) {
      state.titleText = DEFAULT_VENN_TITLE;
      return true;
    }
    return false;
  }

  function syncPlotMode(nextType, options = {}) {
    const normalized = normalizePlotType(nextType);
    const page = global.document?.getElementById('vennPage');
    if (page && page.dataset) {
      page.dataset.plot = normalized;
    }
    const stage = state.ui?.stage || global.document?.getElementById('stage');
    if (stage && typeof stage.setAttribute === 'function') {
      stage.setAttribute('aria-label', normalized === 'upset' ? 'UpSet plot' : 'Venn diagram');
    }
    if (state.ui?.plotType && state.ui.plotType.value !== normalized) {
      state.ui.plotType.value = normalized;
    }
    if (options.updateTitle !== false) {
      const swapped = maybeSwapDefaultTitle(normalized);
      if (swapped) {
        debugLog('plot type title swap', { plot: normalized });
      }
    }
    if (options.syncPanels && typeof state.ui?.syncPanels === 'function') {
      state.ui.syncPanels({ skipSchedule: true });
    }
    debugLog('plot mode synced', { plot: normalized });
    return normalized;
  }

  function getSpeciesDetectionState() {
    if (!state.analysis.speciesDetection) {
      state.analysis.speciesDetection = {
        cache: new Map(),
        pendingTimeoutId: null,
        pendingReason: null,
        active: null,
        delayMs: 1200
      };
      debug('Debug: venn species detection state created'); // Debug: detection state init
    }
    return state.analysis.speciesDetection;
  }

  function createAbortError(message) {
    if (typeof DOMException === 'function') {
      return new DOMException(message || 'Aborted', 'AbortError');
    }
    const error = new Error(message || 'Aborted');
    error.name = 'AbortError';
    return error;
  }

  function computeGeneSignature(genes) {
    if (!genes || !genes.length) {
      return '0:0';
    }
    const normalized = genes.map(g => String(g || '').trim().toUpperCase());
    normalized.sort();
    let hash = 0;
    for (const gene of normalized) {
      for (let i = 0; i < gene.length; i += 1) {
        hash = (hash * 31 + gene.charCodeAt(i)) >>> 0;
      }
      hash = (hash + 31) >>> 0;
    }
    return `${normalized.length}:${hash.toString(16)}`;
  }

  function cancelPendingSpeciesDetection(reason, { abortActive = false, resetIndicator = false } = {}) {
    const detection = getSpeciesDetectionState();
    if (detection.pendingTimeoutId) {
      clearTimeout(detection.pendingTimeoutId);
      detection.pendingTimeoutId = null;
      debug('Debug: venn species detect pending cleared', { reason }); // Debug: pending timer cleared
    }
    if (abortActive && detection.active?.controller) {
      try {
        detection.active.controller.abort(reason || 'cancelled');
      } catch (err) { /* noop */ }
      debug('Debug: venn species detect active abort requested', { reason }); // Debug: abort requested
    }
    if (resetIndicator) {
      setSpeciesIndicator(null);
    }
  }

  function scheduleSpeciesRecognition(reason = 'auto-detect') {
    const detection = getSpeciesDetectionState();
    const inputs = state.ui.inputs;
    if (!inputs) {
      return;
    }
    if (!hasListContent(inputs)) {
      cancelPendingSpeciesDetection(reason, { abortActive: true, resetIndicator: true });
      debug('Debug: venn species detect skipped scheduling', { reason, hasLists: false }); // Debug: schedule skipped
      return;
    }
    const delay = Number.isFinite(detection.delayMs) ? detection.delayMs : 1200;
    if (detection.pendingTimeoutId) {
      clearTimeout(detection.pendingTimeoutId);
    }
    detection.pendingReason = reason;
    detection.pendingTimeoutId = setTimeout(() => {
      detection.pendingTimeoutId = null;
      recognizeSpeciesFromInput({ reason: `scheduled-${reason}` }).catch(err => {
        if (err && err.name === 'AbortError') {
          debug('Debug: venn species detect schedule aborted', { reason }); // Debug: scheduled detection aborted
        } else if (err) {
          console.warn('venn species detection schedule error', err);
        }
      });
    }, delay);
    debug('Debug: venn species detect scheduled', { reason, delayMs: delay }); // Debug: detection scheduled
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('venn')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'venn', debugLabel: 'venn-viewport-fallback', ...options });
        return;
      }
      debugLog('ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  debugLog('graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  /**
   * Resolves an event binding target into an array of DOM nodes.
   * Supports selector strings, direct elements, NodeLists, arrays, and
   * lazy functions that return any of the above. Emits debug logs so tests
   * can assert binding coverage when necessary.
   * @param {string|Element|NodeList|Array|Function} target
   * @returns {Element[]}
   */
  function resolveBindingTargets(target) {
    if (typeof target === 'function') {
      const resolved = target();
      debug('Debug: venn resolveBindingTargets fn', { hasResolved: !!resolved }); // Debug: resolution via function
      return resolveBindingTargets(resolved);
    }
    if (!target) {
      debug('Debug: venn resolveBindingTargets empty', { target }); // Debug: guard for missing targets
      return [];
    }
    if (typeof target === 'string') {
      const nodes = Array.from(document.querySelectorAll(target));
      debug('Debug: venn resolveBindingTargets selector', { selector: target, count: nodes.length }); // Debug: selector resolution
      return nodes;
    }
    if (typeof NodeList !== 'undefined' && target instanceof NodeList) {
      const nodes = Array.from(target).filter(Boolean);
      debug('Debug: venn resolveBindingTargets nodeList', { count: nodes.length }); // Debug: NodeList resolution
      return nodes;
    }
    if (typeof HTMLCollection !== 'undefined' && target instanceof HTMLCollection) {
      const nodes = Array.from(target).filter(Boolean);
      debug('Debug: venn resolveBindingTargets htmlCollection', { count: nodes.length }); // Debug: HTMLCollection resolution
      return nodes;
    }
    if (Array.isArray(target)) {
      const nodes = target.flatMap(item => resolveBindingTargets(item)).filter(Boolean);
      debug('Debug: venn resolveBindingTargets array', { count: nodes.length }); // Debug: array resolution
      return nodes;
    }
    if (target === document || target === window || (target instanceof Element)) {
      debug('Debug: venn resolveBindingTargets element', { hasTarget: true }); // Debug: element resolution
      return [target];
    }
    debug('Debug: venn resolveBindingTargets fallback', { targetType: typeof target }); // Debug: fallback resolution
    return [];
  }

  /**
   * Binds event listeners described by configuration entries. Each config can
   * specify a selector, direct elements, or a resolver function for targets.
   * Binding attempts are logged via debug to satisfy debugging
   * instrumentation requirements.
   * @param {Array<{selector?: string, elements?: any, type: string, handler: Function, options?: AddEventListenerOptions, label?: string}>} configs
   */
  function bindEventHandlers(configs) {
    configs.forEach(cfg => {
      const label = cfg.label || cfg.selector || 'anonymous';
      const targets = resolveBindingTargets(cfg.elements || cfg.selector);
      if (!targets.length) {
        debug('Debug: venn bindEventHandlers skipped', { label, type: cfg.type }); // Debug: skipped binding
        return;
      }
      targets.forEach(target => {
        target.addEventListener(cfg.type, cfg.handler, cfg.options);
      });
      debug('Debug: venn bindEventHandlers attached', { label, type: cfg.type, count: targets.length }); // Debug: binding attachment
    });
  }

  /**
   * @typedef {Object} VennInputCounts
   * @property {HTMLInputElement|null} nA - Numeric input for the size of set A.
   * @property {HTMLInputElement|null} nB - Numeric input for the size of set B.
   * @property {HTMLInputElement|null} nC - Numeric input for the size of set C.
   * @property {HTMLInputElement|null} nAB - Numeric input for |A ∩ B|.
   * @property {HTMLInputElement|null} nAC - Numeric input for |A ∩ C|.
   * @property {HTMLInputElement|null} nBC - Numeric input for |B ∩ C|.
   * @property {HTMLInputElement|null} nABC - Numeric input for |A ∩ B ∩ C|.
   */

  /**
   * @typedef {Object} VennInputControls
   * @property {HTMLTextAreaElement|null} A - Text area for list A contents.
   * @property {HTMLTextAreaElement|null} B - Text area for list B contents.
   * @property {HTMLTextAreaElement|null} C - Text area for list C contents.
   * @property {HTMLInputElement|null} labelA - Input for the display label of set A.
   * @property {HTMLInputElement|null} labelB - Input for the display label of set B.
   * @property {HTMLInputElement|null} labelC - Input for the display label of set C.
   * @property {HTMLInputElement|null} colorA - Color input for set A.
   * @property {HTMLInputElement|null} colorB - Color input for set B.
   * @property {HTMLInputElement|null} colorC - Color input for set C.
   * @property {HTMLInputElement|null} opacity - Range input for fill opacity.
   * @property {HTMLInputElement|null} fontsize - Range input for label font size.
   * @property {HTMLInputElement|null} borderColor - Color input for circle borders.
   * @property {HTMLInputElement|null} borderWidth - Range input for circle border width.
   * @property {HTMLElement|null} opacityVal - Display span for opacity value.
   * @property {HTMLElement|null} fontsizeVal - Display span for font size value.
   * @property {HTMLElement|null} borderWidthVal - Display span for border width value.
   * @property {HTMLInputElement|null} caseSensitive - Toggle for case-sensitive parsing.
   * @property {VennInputCounts} counts - Numeric fields for overlap-driven drawing.
   */

  /**
   * @typedef {Object} VennStateUI
   * @property {Function|null} scheduleDraw - Debounced draw scheduler produced during init.
   * @property {VennInputControls|null} inputs - Collection of textarea and control inputs.
   * @property {{[key: string]: HTMLElement|null}|null} countsUI - Output nodes for live counts.
   * @property {HTMLSelectElement|null} regionSelect - Dropdown for selecting overlap regions.
   * @property {HTMLElement|null} regionList - Container showing genes for the selected region.
   * @property {HTMLButtonElement|null} copyRegionBtn - Copy-to-clipboard helper for genes.
   * @property {HTMLButtonElement|null} goBtn - Trigger button for GO analysis.
   * @property {HTMLSelectElement|null} plotType - Select box for Venn vs UpSet plot.
   * @property {Object|null} upset - UpSet plot controls group.
   * @property {HTMLButtonElement|null} stringBtn - Trigger button for STRING analysis.
   * @property {HTMLElement|null} goResults - Container for GO analysis results.
   * @property {HTMLElement|null} stringResults - Container for STRING analysis results.
   * @property {HTMLElement|null} stringNetwork - Container for STRING network SVG content.
   * @property {HTMLElement|null} goChartExport - Export controls wrapper for GO charts.
   * @property {HTMLElement|null} stringNetworkExport - Export controls wrapper for STRING SVG.
   * @property {HTMLElement|null} tooltip - Shared tooltip element for contextual hints.
   * @property {HTMLSelectElement|null} speciesSelect - Species selector for downstream analysis.
   * @property {HTMLInputElement|null} totalGenesInput - Total universe size input for stats.
   * @property {HTMLElement|null} significanceResults - Output node for hypergeometric stats.
   * @property {HTMLButtonElement|null} calcSignificanceBtn - Button to calculate significance.
   * @property {HTMLInputElement[]} goCategoryChecks - GO source checkboxes.
   * @property {HTMLButtonElement|null} goOptsBtn - Toggle button for GO advanced options.
   * @property {HTMLElement|null} goOptions - Container holding GO advanced options.
   * @property {HTMLInputElement|null} goUseAllBackground - Toggle to use all genes as background.
   * @property {HTMLButtonElement|null} stringOptsBtn - Toggle for STRING advanced options.
   * @property {HTMLElement|null} stringOptions - Container for STRING advanced options.
   * @property {HTMLElement|null} analysisResults - Wrapper summarizing analysis status text.
   * @property {SVGElement|null} stage - Main SVG stage element for the diagram.
   * @property {Function|null} syncPanels - Reference to Shared.syncPanelWidths binding.
   * @property {HTMLElement|null} panelResizer - Resizer handle element between panels.
   * @property {HTMLElement|null} tablePanel - DOM node for the table panel.
   * @property {HTMLElement|null} graphPanel - DOM node for the graph panel.
   * @property {HTMLElement|null} svgBox - Cached `.svgbox` wrapper around the stage.
   */

  /**
   * @typedef {Object} VennStateAnalysis
   * @property {import('chart.js').Chart|null} goChart - Active Chart.js instance for GO data.
   * @property {string|null} lastStringSVG - Cached STRING network SVG markup.
   * @property {Object|null} lastRegions - Cached region-to-gene map from last draw.
   * @property {Object|null} lastCounts - Cached counts from the last successful draw.
   * @property {string|null} lastDrawMode - Indicator of whether list or numeric draw was last used.
   * @property {Array|null} lastGOResult - Cached GO API response entries.
   * @property {string[]} lastGOFormatted - Cached formatted genes submitted to GO.
   * @property {string} lastGOOrganism - Organism code used for the last GO request.
   */

  /**
   * @typedef {Object} VennStatePersistence
   * @property {FileSystemFileHandle|null} fileHandle - Handle to the currently opened `.graph` file.
   * @property {string} fileName - Friendly name to use when saving state to disk.
   */

  /**
   * @typedef {Object} VennComponentState
   * @property {VennStateUI} ui - Group of UI-focused references and DOM nodes.
   * @property {VennStateAnalysis} analysis - Cached analytical outputs and results.
   * @property {VennStatePersistence} persistence - Persistence-related metadata for files.
   */

  /**
   * Creates the initial state tree used throughout the Venn component.
   * Logs creation so debug coverage can assert initialization flow.
   * @returns {VennComponentState}
   */
  function createInitialState() {
    debug('Debug: venn createInitialState invoked'); // Debug: track initial state creation
    return {
      ui: {
        scheduleDraw: null,
        inputs: null,
        countsUI: null,
        regionSelect: null,
        regionList: null,
      copyRegionBtn: null,
      goBtn: null,
      detectSpeciesBtn: null,
      stringBtn: null,
        plotType: null,
        upset: {
          sort: null,
          max: null,
          showEmpty: null,
          showCounts: null,
          showSetCounts: null,
          showGrid: null,
          dotSize: null,
          dotSizeVal: null,
          useSetColors: null,
          barColor: null,
          setBarColor: null,
          dotColor: null,
          inactiveDotColor: null,
          connectorColor: null,
          gridColor: null
        },
        goResults: null,
        stringResults: null,
        stringNetwork: null,
        goChartExport: null,
        stringNetworkExport: null,
        tooltip: null,
        speciesSelect: null,
        totalGenesInput: null,
        significanceResults: null,
        calcSignificanceBtn: null,
        goCategoryChecks: [],
        goOptsBtn: null,
        goOptions: null,
        goUseAllBackground: null,
        stringOptsBtn: null,
        stringOptions: null,
        analysisResults: null,
        stage: null,
        syncPanels: null,
        panelResizer: null,
        tablePanel: null,
        hotWrapper: null,
        hotContainer: null,
        hot: null,
        syncTableFromInputs: null,
        syncInputsFromTable: null,
        graphPanel: null,
        svgBox: null,
        layout: null,
        minSvgWidth: 0,
      },
      analysis: {
        goChart: null,
        goChartLocaleApplied: false,
        lastStringSVG: null,
        lastStringEnrichment: null,
        lastRegions: null,
        lastCounts: null,
        lastDrawMode: null,
        lastParsedLists: null,
        lastTableSignature: null,
        lastGOResult: null,
        lastGOFormatted: [],
        lastGOOrganism: 'hsapiens',
        lastRegionSignature: null,
        lastRegionCode: null,
        lastSignificance: null,
        significanceCache: null,
        speciesDetection: {
          cache: new Map(),
          pendingTimeoutId: null,
          pendingReason: null,
          active: null,
          delayMs: 1200
        }
      },
      persistence: {
        fileHandle: null,
        fileName: 'venn.graph',
      },
      titleText: DEFAULT_VENN_TITLE,
      labelPositions: { title: null }
    };
  }

  const state = createInitialState();
  let emptyPayloadTemplate = null;

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('venn cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate || typeof getVennGraphPayload !== 'function'){
      return;
    }
    const snapshot = getVennGraphPayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
  }

  const vennUndoManager = Shared.undoManager || null;
  const vennUndoDrafts = new WeakMap();

  function prepareVennUndo(target, label) {
    if (!target || !vennUndoManager) {
      return null;
    }
    if (vennUndoDrafts.has(target)) {
      const draft = vennUndoDrafts.get(target);
      if (label && !draft.label) {
        draft.label = label;
      }
      return draft;
    }
    const previous = captureVennSnapshot();
    if (!previous) {
      return null;
    }
    const draft = { previous, label: label || null };
    vennUndoDrafts.set(target, draft);
    return draft;
  }

  function commitVennUndo(target, label) {
    if (!target || !vennUndoManager) {
      return;
    }
    const draft = vennUndoDrafts.get(target);
    if (!draft || !draft.previous) {
      return;
    }
    vennUndoDrafts.delete(target);
    const next = captureVennSnapshot();
    const entryLabel = label || draft.label || 'venn:change';
    recordVennChange(entryLabel, draft.previous, next);
  }

  function discardVennUndo(target) {
    if (!target) {
      return;
    }
    vennUndoDrafts.delete(target);
  }

  function attachUndoLifecycle(targets, label) {
    resolveBindingTargets(targets).forEach(target => {
      if (!target) {
        return;
      }
      const prepare = () => prepareVennUndo(target, label);
      target.addEventListener('beforeinput', prepare);
      target.addEventListener('pointerdown', prepare);
      target.addEventListener('keydown', prepare);
      target.addEventListener('focus', prepare);
      target.addEventListener('blur', () => discardVennUndo(target));
    });
  }

  function cloneFontStyles(styles){
    if(!styles || typeof styles !== 'object'){
      return null;
    }
    try{
      return JSON.parse(JSON.stringify(styles));
    }catch(err){
      const copy = {};
      Object.keys(styles).forEach(key => {
        copy[key] = styles[key];
      });
      return copy;
    }
  }

  function cloneVennPayload(payload){
    if(!payload) return null;
    const data = payload.data ? { ...payload.data } : {};
    const style = payload.style ? { ...payload.style } : {};
    const analysis = payload.analysis ? cloneSimple(payload.analysis) : null;
    if(style.fontStyles){
      style.fontStyles = cloneFontStyles(style.fontStyles);
    }
    return {
      type: payload.type || 'venn',
      data,
      style,
      analysis
    };
  }

  function captureVennSnapshot(){
    const payload = getVennGraphPayload?.();
    if(!payload){
      return null;
    }
    const snapshot = {
      payload: cloneVennPayload(payload),
      lastDrawMode: state.analysis.lastDrawMode || null,
      speciesValue: state.ui.speciesSelect ? state.ui.speciesSelect.value || '' : '',
      speciesIndicator: state.ui.speciesSelect ? state.ui.speciesSelect.style?.backgroundColor || '' : '',
      totalGenes: state.ui.totalGenesInput ? state.ui.totalGenesInput.value || '' : '',
      significanceHtml: state.ui.significanceResults ? state.ui.significanceResults.innerHTML || '' : '',
      lastSignificance: state.analysis.lastSignificance ? { ...state.analysis.lastSignificance } : null,
      regionSelectValue: state.ui.regionSelect ? state.ui.regionSelect.value || '' : '',
      fileName: state.persistence.fileName || 'venn.graph',
      fileHandle: state.persistence.fileHandle || null
    };
    return snapshot;
  }

  function applyVennSnapshot(snapshot){
    const inputs = state.ui.inputs;
    if(!inputs || !snapshot || !snapshot.payload){
      return false;
    }
    cancelPendingSpeciesDetection('undo-apply', { abortActive: true, resetIndicator: false });
    const data = snapshot.payload.data || {};
    const counts = inputs.counts || {};
    inputs.labelA.value = data.labelA != null ? String(data.labelA) : '';
    inputs.labelB.value = data.labelB != null ? String(data.labelB) : '';
    inputs.labelC.value = data.labelC != null ? String(data.labelC) : '';
    inputs.A.value = data.listA != null ? String(data.listA) : '';
    inputs.B.value = data.listB != null ? String(data.listB) : '';
    inputs.C.value = data.listC != null ? String(data.listC) : '';
    state.ui.syncTableFromInputs?.({ refresh: true });
    if(counts.nA) counts.nA.value = data.nA != null ? String(data.nA) : '';
    if(counts.nB) counts.nB.value = data.nB != null ? String(data.nB) : '';
    if(counts.nC) counts.nC.value = data.nC != null ? String(data.nC) : '';
    if(counts.nAB) counts.nAB.value = data.nAB != null ? String(data.nAB) : '';
    if(counts.nAC) counts.nAC.value = data.nAC != null ? String(data.nAC) : '';
    if(counts.nBC) counts.nBC.value = data.nBC != null ? String(data.nBC) : '';
    if(counts.nABC) counts.nABC.value = data.nABC != null ? String(data.nABC) : '';
    const style = snapshot.payload.style || {};
    importFontStyles('venn', style.fontStyles || null);
    if(style.colorA != null && inputs.colorA){ inputs.colorA.value = style.colorA; }
    if(style.colorB != null && inputs.colorB){ inputs.colorB.value = style.colorB; }
    if(style.colorC != null && inputs.colorC){ inputs.colorC.value = style.colorC; }
    if(style.opacity != null && inputs.opacity){ inputs.opacity.value = style.opacity; }
    if(inputs.opacityVal){ inputs.opacityVal.textContent = inputs.opacity.value; }
    if(style.borderColor != null && inputs.borderColor){ inputs.borderColor.value = style.borderColor; }
    if(style.borderWidth != null && inputs.borderWidth){ inputs.borderWidth.value = style.borderWidth; }
    if(inputs.borderWidthVal){ inputs.borderWidthVal.textContent = inputs.borderWidth.value; }
    const fontBase = (style.fontsize !== undefined && style.fontsize !== null)
      ? style.fontsize
      : inputs.fontsize?.dataset?.fontBasePt || inputs.fontsize?.value;
    if(inputs.fontsize){
      if(inputs.fontsize.dataset && fontBase !== undefined){
        inputs.fontsize.dataset.fontBasePt = String(fontBase);
      }
      const fontInfo = resolveFontInfo(fontBase);
      inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
      chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    }
    state.analysis.lastDrawMode = snapshot.lastDrawMode || null;
    state.analysis.lastSignificance = snapshot.lastSignificance ? { ...snapshot.lastSignificance } : null;
    if(state.ui.significanceResults){
      state.ui.significanceResults.innerHTML = snapshot.significanceHtml || '';
    }
    if(state.ui.speciesSelect){
      state.ui.speciesSelect.value = snapshot.speciesValue || '';
      state.ui.speciesSelect.style.backgroundColor = snapshot.speciesIndicator || '';
    }
    if(state.ui.totalGenesInput){
      state.ui.totalGenesInput.value = snapshot.totalGenes || '';
    }
    if(state.ui.regionSelect){
      const targetValue = snapshot.regionSelectValue || '';
      if(targetValue){
        state.ui.regionSelect.value = targetValue;
      }
    }
    state.persistence.fileName = snapshot.fileName || state.persistence.fileName;
    state.persistence.fileHandle = snapshot.fileHandle || null;
    refreshDiagram();
    if(state.ui.regionSelect){
      const targetValue = snapshot.regionSelectValue || '';
      if(targetValue){
        state.ui.regionSelect.value = targetValue;
        populateRegion(targetValue);
      } else {
        populateRegion(state.ui.regionSelect.value);
      }
    }
    if(state.ui.significanceResults){
      state.ui.significanceResults.innerHTML = snapshot.significanceHtml || '';
    }
    state.analysis.lastSignificance = snapshot.lastSignificance ? { ...snapshot.lastSignificance } : null;
    if(state.ui.speciesSelect){
      state.ui.speciesSelect.value = snapshot.speciesValue || '';
      state.ui.speciesSelect.style.backgroundColor = snapshot.speciesIndicator || '';
    }
    return true;
  }

  function normalizeValue(value){
    return value == null ? '' : String(value);
  }

  function vennSnapshotsEqual(a, b){
    if(a === b) return true;
    if(!a || !b) return false;
    const dataKeys = ['labelA','labelB','labelC','listA','listB','listC','nA','nB','nC','nAB','nAC','nBC','nABC'];
    const dataA = a.payload?.data || {};
    const dataB = b.payload?.data || {};
    for(const key of dataKeys){
      if(normalizeValue(dataA[key]) !== normalizeValue(dataB[key])){
        return false;
      }
    }
    const styleKeys = ['colorA','colorB','colorC','opacity','fontsize','borderColor','borderWidth','title'];
    const styleA = a.payload?.style || {};
    const styleB = b.payload?.style || {};
    for(const key of styleKeys){
      if(normalizeValue(styleA[key]) !== normalizeValue(styleB[key])){
        return false;
      }
    }
    const fontStylesA = styleA.fontStyles || null;
    const fontStylesB = styleB.fontStyles || null;
    if(fontStylesA || fontStylesB){
      const strA = JSON.stringify(fontStylesA || {});
      const strB = JSON.stringify(fontStylesB || {});
      if(strA !== strB){
        return false;
      }
    }
    if(normalizeValue(a.lastDrawMode) !== normalizeValue(b.lastDrawMode)) return false;
    if(normalizeValue(a.speciesValue) !== normalizeValue(b.speciesValue)) return false;
    if(normalizeValue(a.speciesIndicator) !== normalizeValue(b.speciesIndicator)) return false;
    if(normalizeValue(a.totalGenes) !== normalizeValue(b.totalGenes)) return false;
    if(normalizeValue(a.significanceHtml) !== normalizeValue(b.significanceHtml)) return false;
    if(normalizeValue(a.regionSelectValue) !== normalizeValue(b.regionSelectValue)) return false;
    if(normalizeValue(a.fileName) !== normalizeValue(b.fileName)) return false;
    if(a.fileHandle !== b.fileHandle) return false;
    const sigA = a.lastSignificance || null;
    const sigB = b.lastSignificance || null;
    if(sigA || sigB){
      if(normalizeValue(sigA?.countsSignature) !== normalizeValue(sigB?.countsSignature)) return false;
      if(normalizeValue(sigA?.total) !== normalizeValue(sigB?.total)) return false;
    }
    return true;
  }

  function recordVennChange(label, previous, next){
    if(!vennUndoManager || typeof vennUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(!previous || !next){
      return;
    }
    if(vennSnapshotsEqual(previous, next)){
      return;
    }
    vennUndoManager.recordStateChange({
      label,
      scope: 'vennInputPanel',
      from: previous,
      to: next,
      equals: vennSnapshotsEqual,
      apply(value){
        return applyVennSnapshot(value);
      }
    });
  }

  function recordVennTitleChange(previous, next, apply){
    if(!vennUndoManager || typeof vennUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(previous === next){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    vennUndoManager.recordStateChange({
      label: 'venn:title',
      scope: 'vennGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }

  const DEFAULT_STAGE_WIDTH = 500;
  const DEFAULT_STAGE_HEIGHT = 340;
  const DEFAULT_STAGE_RATIO = DEFAULT_STAGE_WIDTH / DEFAULT_STAGE_HEIGHT;

  function parsePositiveFloat(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value : NaN;
    }
    if (typeof value === 'string') {
      const numeric = Number.parseFloat(value);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : NaN;
    }
    return NaN;
  }

  function parseViewBox(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const parts = value.trim().split(/[,\s]+/).map(Number.parseFloat).filter(Number.isFinite);
    if (parts.length < 4) {
      return null;
    }
    const [x, y, width, height] = parts;
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }
    return { x, y, width, height };
  }

  function padStringNetworkViewport(svgEl, options = {}) {
    if (!svgEl) {
      return;
    }
    const exportHost = options.exportHost || null;
    const exportRect = exportHost?.getBoundingClientRect?.();
    const exportHeight = Number.isFinite(exportRect?.height) ? exportRect.height : 0;
    const padding = Math.max(24, Math.round(exportHeight + 12));
    const viewBox = parseViewBox(svgEl.getAttribute('viewBox'));
    const widthAttr = parsePositiveFloat(svgEl.getAttribute('width'));
    const heightAttr = parsePositiveFloat(svgEl.getAttribute('height'));
    const baseWidth = Number.isFinite(viewBox?.width) ? viewBox.width : widthAttr;
    const baseHeight = Number.isFinite(viewBox?.height) ? viewBox.height : heightAttr;
    if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) {
      return;
    }
    const nextHeight = Math.round(baseHeight + padding);
    const nextViewBox = viewBox
      ? `${viewBox.x} ${viewBox.y} ${baseWidth} ${nextHeight}`
      : `0 0 ${baseWidth} ${nextHeight}`;
    svgEl.setAttribute('viewBox', nextViewBox);
    svgEl.setAttribute('height', String(nextHeight));
    svgEl.style.setProperty('overflow', 'visible');
    svgEl.setAttribute('overflow', 'visible');
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    if (debugEnabled) {
      debug('Debug: venn string network viewport padded', {
        padding,
        exportHeight,
        baseWidth,
        baseHeight,
        nextHeight,
        hasViewBox: !!viewBox
      });
    }
  }

  // --- Core Functions ---

  function ensureInputs() {
    if (!state.ui.inputs) throw new Error('Venn inputs not initialized');
    return state.ui.inputs;
  }

  function splitItems(text, mode) {
    switch (mode) {
      case 'newline': return text.split(/\r?\n/);
      case 'comma': return text.split(/,/);
      case 'tab': return text.split(/\t/);
      case 'space': return text.split(/\s+/);
      default: return text.split(/[\r\n,\t;\s]+/);
    }
  }

  function getColumnValuesFromTable(data, columnIndex) {
    if (!Array.isArray(data) || columnIndex < 0) {
      return [];
    }
    const values = [];
    for (let row = 1; row < data.length; row += 1) {
      const raw = data[row]?.[columnIndex];
      const value = typeof raw === 'string' ? raw.trim() : String(raw || '').trim();
      if (value) {
        values.push(value);
      }
    }
    return values;
  }

  function normalizeTableCellValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return '';
    }
    return String(value).trim();
  }

  function getUpSetTableColumns() {
    const hot = state.ui.hot;
    if (!hot) {
      return { columns: [], rowCount: 0, colCount: 0, source: 'none' };
    }
    let data = [];
    let rowCount = 0;
    let colCount = 0;
    let isColumnExcluded = null;
    let isRowExcluded = null;
    if (Shared.hot && typeof Shared.hot.getAnalysisData === 'function') {
      const analysis = Shared.hot.getAnalysisData(hot);
      data = Array.isArray(analysis?.data) ? analysis.data : [];
      rowCount = Number.isFinite(analysis?.rowCount) ? analysis.rowCount : data.length;
      colCount = Number.isFinite(analysis?.colCount) ? analysis.colCount : (data[0]?.length || 0);
      isColumnExcluded = analysis?.isColumnExcluded || null;
      isRowExcluded = analysis?.isRowExcluded || null;
    } else if (typeof hot.getData === 'function') {
      data = hot.getData() || [];
      rowCount = data.length;
      colCount = (data[0] || []).length;
    }
    const columns = [];
    for (let col = 0; col < colCount; col += 1) {
      if (typeof isColumnExcluded === 'function' && isColumnExcluded(col)) {
        continue;
      }
      const header = normalizeTableCellValue(data[0]?.[col]);
      const values = [];
      for (let row = 1; row < rowCount; row += 1) {
        if (typeof isRowExcluded === 'function' && isRowExcluded(row)) {
          continue;
        }
        const raw = data[row]?.[col];
        if (raw === null || raw === undefined) {
          continue;
        }
        const value = normalizeTableCellValue(raw);
        if (value) {
          values.push(value);
        }
      }
      if (header || values.length) {
        columns.push({ index: col, label: header, values });
      }
    }
    columns.forEach(column => {
      if (!column.label) {
        column.label = `Set ${column.index + 1}`;
      }
    });
    debugLog('upset table columns resolved', {
      columns: columns.length,
      rowCount,
      colCount
    });
    return { columns, rowCount, colCount, source: 'table' };
  }

  function tokenizeListForTable(value, mode) {
    const source = String(value || '').trim();
    if (!source) {
      return [];
    }
    return splitItems(source, mode).map(item => String(item || '').trim()).filter(Boolean);
  }

  function syncVennInputsFromTable(options = {}) {
    const hot = state.ui.hot;
    const inputs = state.ui.inputs;
    if (!hot || !inputs) {
      return;
    }
    const matrix = hot.getData?.() || [];
    const tableSignature = makeTableSignature(matrix);
    const tableChanged = tableSignature !== state.analysis.lastTableSignature;
    state.analysis.lastTableSignature = tableSignature;
    const header = matrix[0] || [];
    const next = {
      labelA: String(header[0] || '').trim() || 'A',
      labelB: String(header[1] || '').trim() || 'B',
      labelC: String(header[2] || '').trim() || 'C',
      listA: getColumnValuesFromTable(matrix, 0).join('\n'),
      listB: getColumnValuesFromTable(matrix, 1).join('\n'),
      listC: getColumnValuesFromTable(matrix, 2).join('\n')
    };
    const inputsChanged = (
      inputs.labelA.value !== next.labelA
      || inputs.labelB.value !== next.labelB
      || inputs.labelC.value !== next.labelC
      || inputs.A.value !== next.listA
      || inputs.B.value !== next.listB
      || inputs.C.value !== next.listC
    );
    const changed = inputsChanged || tableChanged;
    inputs.labelA.value = next.labelA;
    inputs.labelB.value = next.labelB;
    inputs.labelC.value = next.labelC;
    inputs.A.value = next.listA;
    inputs.B.value = next.listB;
    inputs.C.value = next.listC;
    if (changed && options.scheduleDraw !== false) {
      requestScheduledDraw('table-edit', 'lists');
    }
    if (inputsChanged && options.scheduleSpecies !== false) {
      scheduleSpeciesRecognition('table-edit');
    }
    if (changed) {
      debugLog('table synced to inputs', {
        rows: matrix.length,
        tableChanged,
        counts: {
          A: next.listA ? next.listA.split(/\n/).length : 0,
          B: next.listB ? next.listB.split(/\n/).length : 0,
          C: next.listC ? next.listC.split(/\n/).length : 0
        }
      });
    }
  }

  function syncVennTableFromInputs(options = {}) {
    const hot = state.ui.hot;
    const inputs = state.ui.inputs;
    if (!hot || !inputs) {
      return;
    }
    const delimiterMode = 'auto';
    const colA = tokenizeListForTable(inputs.A.value, delimiterMode);
    const colB = tokenizeListForTable(inputs.B.value, delimiterMode);
    const colC = tokenizeListForTable(inputs.C.value, delimiterMode);
    const maxLen = Math.max(colA.length, colB.length, colC.length, 1);
    const matrix = Array.from({ length: maxLen + 1 }, (_, row) => {
      if (row === 0) {
        return [
          (inputs.labelA.value || 'A').trim() || 'A',
          (inputs.labelB.value || 'B').trim() || 'B',
          (inputs.labelC.value || 'C').trim() || 'C'
        ];
      }
      const idx = row - 1;
      return [colA[idx] || '', colB[idx] || '', colC[idx] || ''];
    });
    hot.loadData?.(matrix);
    if (options.refresh !== false) {
      hot.refreshLayout?.();
    }
    state.analysis.lastTableSignature = makeTableSignature(matrix);
    debugLog('inputs synced to table', { rows: matrix.length, delimiterMode });
  }

  function parseList(raw, cs, mode) {
    const source = (raw || '').trim();
    if (!source) {
      debugLog('parseList empty', { rawLength: raw ? raw.length : 0 });
      return [];
    }
    const items = splitItems(source, mode).map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const x of items) {
      const key = cs ? x : x.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, val: x });
      }
    }
    debugLog('parseList processed', { rawLength: source.length, unique: out.length });
    return out;
  }

  function hashText(value) {
    const source = value || '';
    if (!source) return '0';
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
  }

  function makeListSignature(mode, cs, sources) {
    return [
      mode || 'auto',
      cs ? '1' : '0',
      sources.A.length,
      hashText(sources.A),
      sources.B.length,
      hashText(sources.B),
      sources.C.length,
      hashText(sources.C)
    ].join('|');
  }

  function makeTableSignature(matrix) {
    if (!Array.isArray(matrix) || !matrix.length) {
      return '0';
    }
    const rowCount = matrix.length;
    const colCount = matrix.reduce((maxCols, row) => {
      const length = Array.isArray(row) ? row.length : 0;
      return Math.max(maxCols, length);
    }, 0);
    const flat = matrix.map(row => {
      const rowValues = Array.isArray(row) ? row : [];
      return Array.from({ length: colCount }, (_, col) => normalizeTableCellValue(rowValues[col])).join('\t');
    }).join('\n');
    return `${rowCount}|${colCount}|${hashText(flat)}`;
  }

  function buildMapsFromLists(lists) {
    return {
      A: new Map(lists.A.map(o => [o.key, o.val])),
      B: new Map(lists.B.map(o => [o.key, o.val])),
      C: new Map(lists.C.map(o => [o.key, o.val]))
    };
  }

  function buildUniqueSetsFromMaps(maps) {
    const uniqueA = new Set(maps.A.values());
    const uniqueB = new Set(maps.B.values());
    const uniqueC = new Set(maps.C.values());
    const combined = new Set();
    [uniqueA, uniqueB, uniqueC].forEach(set => {
      set.forEach(value => combined.add(value));
    });
    return {
      A: uniqueA,
      B: uniqueB,
      C: uniqueC,
      combined,
      combinedList: Array.from(combined)
    };
  }

  function populateRegionSets(maps, existing) {
    const regions = existing || {
      A: new Set(),
      B: new Set(),
      C: new Set(),
      Aonly: new Set(),
      Bonly: new Set(),
      Conly: new Set(),
      AB: new Set(),
      AC: new Set(),
      BC: new Set(),
      ABC: new Set()
    };

    Object.values(regions).forEach(set => set.clear());

    maps.A.forEach(value => regions.A.add(value));
    maps.B.forEach(value => regions.B.add(value));
    maps.C.forEach(value => regions.C.add(value));

    const keysA = new Set(maps.A.keys());
    const keysB = new Set(maps.B.keys());
    const keysC = new Set(maps.C.keys());

    for (const key of keysA) {
      const inB = keysB.has(key);
      const inC = keysC.has(key);
      const value = maps.A.get(key);
      if (inB && inC) {
        if (value !== undefined) regions.ABC.add(value);
        keysB.delete(key);
        keysC.delete(key);
      } else if (inB) {
        if (value !== undefined) regions.AB.add(value);
        keysB.delete(key);
      } else if (inC) {
        if (value !== undefined) regions.AC.add(value);
        keysC.delete(key);
      } else if (value !== undefined) {
        regions.Aonly.add(value);
      }
    }

    for (const key of keysB) {
      const value = maps.B.get(key);
      if (keysC.has(key)) {
        if (value !== undefined) regions.BC.add(value);
        keysC.delete(key);
      } else if (value !== undefined) {
        regions.Bonly.add(value);
      }
    }

    for (const key of keysC) {
      const value = maps.C.get(key);
      if (value !== undefined) {
        regions.Conly.add(value);
      }
    }

    return regions;
  }

  function setsFromLists(listA, listB, listC, reuseRegions) {
    const maps = buildMapsFromLists({ A: listA, B: listB, C: listC });
    const res = populateRegionSets(maps, reuseRegions);
    debugLog('setsFromLists computed', {
      sizes: {
        A: res.A.size,
        B: res.B.size,
        C: res.C.size,
        Aonly: res.Aonly.size,
        Bonly: res.Bonly.size,
        Conly: res.Conly.size,
        AB: res.AB.size,
        AC: res.AC.size,
        BC: res.BC.size,
        ABC: res.ABC.size
      }
    });
    return res;
  }

  function ensureParsedLists(options = {}) {
    const inputs = ensureInputs();
    const mode = 'auto';
    const caseSensitive = inputs.caseSensitive.checked;
    const sources = {
      A: inputs.A.value || '',
      B: inputs.B.value || '',
      C: inputs.C.value || ''
    };
    const signature = makeListSignature(mode, caseSensitive, sources);
    const includeRegions = options.includeRegions === true;
    const reason = options.reason || 'unspecified';
    let parsed = state.analysis.lastParsedLists;
    if (parsed && parsed.signature === signature) {
      if (includeRegions && !parsed.regions) {
        parsed.regions = populateRegionSets(parsed.maps, parsed.regions);
        debugLog('parsed lists region cache hydrated', { signature, reason });
      } else {
        debugLog('parsed lists cache hit', { signature, includeRegions, reason });
      }
      return parsed;
    }

    const lists = {
      A: parseList(sources.A, caseSensitive, mode),
      B: parseList(sources.B, caseSensitive, mode),
      C: parseList(sources.C, caseSensitive, mode)
    };
    const maps = buildMapsFromLists(lists);
    const uniques = buildUniqueSetsFromMaps(maps);
    const regions = includeRegions ? populateRegionSets(maps, parsed?.regions) : null;

    parsed = {
      signature,
      mode,
      caseSensitive,
      lists,
      maps,
      uniques,
      regions
    };
    state.analysis.lastParsedLists = parsed;
    debugLog('parsed lists cache refreshed', {
      signature,
      includeRegions,
      counts: { A: lists.A.length, B: lists.B.length, C: lists.C.length }
    });
    if (regions) {
      debugLog('parsed lists regions populated', {
        signature,
        sizes: {
          A: regions.A.size,
          B: regions.B.size,
          C: regions.C.size,
          Aonly: regions.Aonly.size,
          Bonly: regions.Bonly.size,
          Conly: regions.Conly.size,
          AB: regions.AB.size,
          AC: regions.AC.size,
          BC: regions.BC.size,
          ABC: regions.ABC.size
        }
      });
    }
    return parsed;
  }

  function circleIntersectionArea(r1, r2, d) {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
    const a = 2 * Math.acos((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d));
    const b = 2 * Math.acos((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d));
    return 0.5 * r1 * r1 * (a - Math.sin(a)) + 0.5 * r2 * r2 * (b - Math.sin(b));
  }

  function distanceForOverlap(r1, r2, target) {
    const maxA = Math.PI * Math.min(r1, r2) ** 2;
    const t = Math.max(0, Math.min(target, maxA));
    let lo = Math.max(0, Math.abs(r1 - r2));
    let hi = r1 + r2;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      const A = circleIntersectionArea(r1, r2, m);
      if (A > t) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  function trilaterate(dAB, dAC, dBC) {
    const x = (dAB * dAB + dAC * dAC - dBC * dBC) / (2 * (dAB || 1e-6));
    const y2 = dAC * dAC - x * x;
    return { Ax: 0, Ay: 0, Bx: dAB, By: 0, Cx: x, Cy: Math.sqrt(Math.max(0, y2)) };
  }

  function layoutFromCounts(nA, nB, nC, nAB, nAC, nBC) {
    const rA = Math.sqrt(Math.max(nA, 0) / Math.PI);
    const rB = Math.sqrt(Math.max(nB, 0) / Math.PI);
    const rC = Math.sqrt(Math.max(nC, 0) / Math.PI);
    const dAB = distanceForOverlap(rA, rB, Math.max(nAB, 0));
    const dAC = distanceForOverlap(rA, rC, Math.max(nAC, 0));
    const dBC = distanceForOverlap(rB, rC, Math.max(nBC, 0));
    const result = { ...trilaterate(dAB, dAC, dBC), rA, rB, rC, dAB, dAC, dBC };
    debugLog('layoutFromCounts', { nA, nB, nC, nAB, nAC, nBC, radii: { rA, rB, rC }, distances: { dAB, dAC, dBC } });
    return result;
  }

  function clearSVG() {
    const stage = state.ui.stage;
    if (!stage) return;
    while (stage.firstChild) stage.removeChild(stage.firstChild);
  }

  const markFontEditable = (node, role, key) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'venn', role, key });
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'venn';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    if(role && role.indexOf('region') !== -1){ return; }
    debugLog('font mark applied', payload);
  };

  function makeEl(tag, attrs = {}, parent) {
    const stage = state.ui.stage;
    if (!parent) parent = stage;
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    if (tag === 'text') {
      const fontFamily = chartStyle.FONT_FAMILY || 'Arial, Helvetica, sans-serif';
      if (fontFamily && !el.hasAttribute('font-family')) {
        el.setAttribute('font-family', fontFamily);
      }
      if (!el.hasAttribute('fill')) {
        const textColor = chartStyle.TEXT_COLOR || '#000000';
        el.setAttribute('fill', textColor);
      }
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  function resolveFontInfo(rawSize) {
    const stageEl = state.ui.stage;
    const fallbackSvgBox = stageEl?.closest?.('.svgbox') || state.ui.graphPanel?.querySelector?.('.svgbox') || null;
    const svgBox = state.ui.svgBox || fallbackSvgBox || null;
    if (!state.ui.svgBox && svgBox) {
      state.ui.svgBox = svgBox;
      debug('Debug: venn resolveFontInfo captured svgBox', { hasSvgBox: true });
    }
    const inputs = ensureInputs?.() || state.ui.inputs || {};
    const fontInput = inputs.fontsize || state.ui.inputs?.fontsize || document.getElementById('fontsize');
    if(fontInput && fontInput.dataset && typeof fontInput.dataset.fontBasePt === 'undefined'){
      fontInput.dataset.fontBasePt = String(fontInput.value || rawSize || '');
      debug('Debug: venn font size base ensured', { value: fontInput.value }); // Debug: ensure base dataset
    }
    const rect = svgBox?.getBoundingClientRect?.();
    const dataset = svgBox?.dataset || {};
    const parsedDefaultWidth = parsePositiveFloat(chartStyle.DEFAULT_WIDTH);
    const parsedDefaultHeight = parsePositiveFloat(chartStyle.DEFAULT_HEIGHT);
    const defaultWidth = parsePositiveFloat(dataset.resizerDefaultWidth)
      || (Number.isFinite(parsedDefaultWidth) ? parsedDefaultWidth : DEFAULT_STAGE_WIDTH);
    const defaultHeight = parsePositiveFloat(dataset.resizerDefaultHeight)
      || (Number.isFinite(parsedDefaultHeight) ? parsedDefaultHeight : DEFAULT_STAGE_HEIGHT);
    const width = parsePositiveFloat(rect?.width);
    const height = parsePositiveFloat(rect?.height);
    const storedWidth = parsePositiveFloat(dataset.resizerWidth);
    const storedHeight = parsePositiveFloat(dataset.resizerHeight);
    const effectiveWidth = Number.isFinite(width) ? width : storedWidth;
    const effectiveHeight = Number.isFinite(height) ? height : storedHeight;
    if (typeof chartStyle.resolveScaledFontSize === 'function') {
      const info = chartStyle.resolveScaledFontSize({
        rawSize,
        width: effectiveWidth,
        height: effectiveHeight,
        defaultWidth,
        defaultHeight,
        svgBox,
        input: fontInput
      });
      debug('Debug: venn resolveFontInfo scaled', {
        raw: rawSize,
        width: effectiveWidth,
        height: effectiveHeight,
        storedWidth,
        storedHeight,
        defaultWidth,
        defaultHeight,
        hasSvgBox: !!svgBox,
        styleScale: info?.scaleInfo?.styleScale,
        textLocked: info?.scaleInfo?.textLocked
      });
      return info;
    }
    let normalized = null;
    if (typeof chartStyle.normalizeFontSize === 'function') {
      normalized = chartStyle.normalizeFontSize(rawSize);
    } else {
      const basePt = chartStyle.BASE_FONT_SIZE_PT || 13;
      const numeric = Number(rawSize);
      const pt = Number.isFinite(numeric) ? numeric : basePt;
      const factor = chartStyle.PT_TO_PX || (96 / 72);
      const px = Number((pt * factor).toFixed(2));
      normalized = { pt, px };
    }
    const fallbackPx = Number.isFinite(normalized?.px) ? normalized.px : Number(normalized?.scaledPx);
    const safePx = Number.isFinite(fallbackPx) ? fallbackPx : 12;
    const safePt = Number.isFinite(normalized?.pt) ? normalized.pt : 12;
    const safeWidth = Number.isFinite(effectiveWidth) ? effectiveWidth : defaultWidth;
    const safeHeight = Number.isFinite(effectiveHeight) ? effectiveHeight : defaultHeight;
    const scaleX = Number.isFinite(defaultWidth) && defaultWidth > 0 ? safeWidth / defaultWidth : 1;
    const scaleY = Number.isFinite(defaultHeight) && defaultHeight > 0 ? safeHeight / defaultHeight : 1;
    const fallbackScaleInfo = {
      width: safeWidth,
      height: safeHeight,
      defaultWidth,
      defaultHeight,
      scaleX,
      scaleY,
      scaleW: scaleX,
      scaleH: scaleY,
      styleUnclamped: Math.sqrt(Math.max(scaleX * scaleY, 0)),
      styleScale: 1,
      scale: 1,
      radiusScale: 1,
      strokeScale: 1,
      legacyMinScale: Math.min(scaleX, scaleY),
      textScale: 1,
      textLocked: false
    };
    const info = {
      pt: safePt,
      px: normalized?.px ?? safePx,
      scaledPx: safePx,
      scaleInfo: fallbackScaleInfo
    };
    debug('Debug: venn resolveFontInfo fallback', {
      raw: rawSize,
      width: effectiveWidth,
      height: effectiveHeight,
      storedWidth,
      storedHeight,
      info
    });
    return info;
  }

  function clampNumber(value, fallback, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return fallback;
    }
    const lo = Number.isFinite(min) ? min : num;
    const hi = Number.isFinite(max) ? max : num;
    return Math.min(hi, Math.max(lo, num));
  }

  function sanitizeColor(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }

  function resolveUpSetSettings() {
    const ui = state.ui?.upset || {};
    const defaults = DEFAULT_UPSET_SETTINGS;
    const allowedSort = new Set(['size-desc', 'size-asc', 'degree-desc', 'degree-asc', 'input']);
    const rawSort = typeof ui.sort?.value === 'string' ? ui.sort.value : defaults.sort;
    const sort = allowedSort.has(rawSort) ? rawSort : defaults.sort;
    const settings = {
      sort,
      maxIntersections: clampNumber(ui.max?.value, defaults.maxIntersections, 1, 50),
      showEmpty: ui.showEmpty ? !!ui.showEmpty.checked : defaults.showEmpty,
      showCounts: ui.showCounts ? !!ui.showCounts.checked : defaults.showCounts,
      showSetCounts: ui.showSetCounts ? !!ui.showSetCounts.checked : defaults.showSetCounts,
      showGrid: ui.showGrid ? !!ui.showGrid.checked : defaults.showGrid,
      dotSize: clampNumber(ui.dotSize?.value, defaults.dotSize, 2, 12),
      useSetColors: ui.useSetColors ? !!ui.useSetColors.checked : defaults.useSetColors,
      barColor: sanitizeColor(ui.barColor?.value, defaults.barColor),
      setBarColor: sanitizeColor(ui.setBarColor?.value, defaults.setBarColor),
      dotColor: sanitizeColor(ui.dotColor?.value, defaults.dotColor),
      inactiveDotColor: sanitizeColor(ui.inactiveDotColor?.value, defaults.inactiveDotColor),
      connectorColor: sanitizeColor(ui.connectorColor?.value, defaults.connectorColor),
      gridColor: sanitizeColor(ui.gridColor?.value, defaults.gridColor)
    };
    debug('Debug: venn upset settings resolved', settings);
    return settings;
  }

  function updateUpSetDotSizeOutput(value) {
    const output = state.ui?.upset?.dotSizeVal;
    if (!output) return;
    const clamped = clampNumber(value, DEFAULT_UPSET_SETTINGS.dotSize, 2, 12);
    output.textContent = String(clamped);
  }

  function enableDrag(el) {
    const stage = state.ui.stage;
    if (!stage) return;
    let drag = false, start = { x: 0, y: 0 }, orig = { x: 0, y: 0 };
    el.style.cursor = 'move';
    el.addEventListener('mousedown', e => {
      drag = true;
      const pt = stage.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(stage.getScreenCTM().inverse());
      start = { x: loc.x, y: loc.y };
      orig = { x: parseFloat(el.getAttribute('x') || '0'), y: parseFloat(el.getAttribute('y') || '0') };
      e.preventDefault();
    });
    global.addEventListener('mousemove', e => {
      if (!drag) return;
      const pt = stage.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(stage.getScreenCTM().inverse());
      el.setAttribute('x', String(orig.x + (loc.x - start.x)));
      el.setAttribute('y', String(orig.y + (loc.y - start.y)));
    });
    global.addEventListener('mouseup', () => { drag = false; });
  }

  function _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC) {
    const spec = [];
    const inC = (ctr, r) => spec.push({ ctr, r, type: 'in' });
    const outC = (ctr, r) => spec.push({ ctr, r, type: 'out' });
    if (code === 'A') { inC(cA, rA); outC(cB, rB); if (hasC) outC(cC, rC); }
    if (code === 'B') { inC(cB, rB); outC(cA, rA); if (hasC) outC(cC, rC); }
    if (code === 'C') { inC(cC, rC); outC(cA, rA); outC(cB, rB); }
    if (code === 'AB') { inC(cA, rA); inC(cB, rB); if (hasC) outC(cC, rC); }
    if (code === 'AC') { inC(cA, rA); if (hasC) inC(cC, rC); outC(cB, rB); }
    if (code === 'BC') { inC(cB, rB); if (hasC) inC(cC, rC); outC(cA, rA); }
    if (code === 'ABC') { inC(cA, rA); inC(cB, rB); if (hasC) inC(cC, rC); }
    return spec;
  }

  function _signedDistToRegion(x, y, spec) {
    let minMargin = Infinity;
    for (const c of spec) {
      const dist = Math.hypot(x - c.ctr.x, y - c.ctr.y);
      const margin = (c.type === 'in') ? (c.r - dist) : (dist - c.r);
      if (margin < minMargin) minMargin = margin;
    }
    return minMargin;
  }

  function _bboxForSpec(spec) {
    const ins = spec.filter(c => c.type === 'in');
    if (!ins.length) return null;
    let b = { x1: -Infinity, y1: -Infinity, x2: Infinity, y2: Infinity };
    for (const c of ins) {
      const bb = { x1: c.ctr.x - c.r, y1: c.ctr.y - c.r, x2: c.ctr.x + c.r, y2: c.ctr.y + c.r };
      b = {
        x1: Math.max(b.x1, bb.x1),
        y1: Math.max(b.y1, bb.y1),
        x2: Math.min(b.x2, bb.x2),
        y2: Math.min(b.y2, bb.y2)
      };
    }
    if (b.x1 >= b.x2 || b.y1 >= b.y2) return null;
    return b;
  }

  function createMaxHeap(getPriority) {
    const items = [];
    const heap = {
      push(value) {
        items.push(value);
        siftUp(items.length - 1);
        return heap;
      },
      pop() {
        if (!items.length) return undefined;
        const top = items[0];
        const last = items.pop();
        if (items.length) {
          items[0] = last;
          siftDown(0);
        }
        return top;
      },
      peek() {
        return items[0];
      },
      size() {
        return items.length;
      }
    };

    function siftUp(index) {
      let i = index;
      while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (getPriority(items[parent]) >= getPriority(items[i])) break;
        swap(i, parent);
        i = parent;
      }
    }

    function siftDown(index) {
      let i = index;
      const length = items.length;
      while (true) {
        const left = 2 * i + 1;
        const right = left + 1;
        let largest = i;
        if (left < length && getPriority(items[left]) > getPriority(items[largest])) {
          largest = left;
        }
        if (right < length && getPriority(items[right]) > getPriority(items[largest])) {
          largest = right;
        }
        if (largest === i) break;
        swap(i, largest);
        i = largest;
      }
    }

    function swap(a, b) {
      const tmp = items[a];
      items[a] = items[b];
      items[b] = tmp;
    }

    return heap;
  }

  function _polylabelRegion(spec, bbox, tolerancePx) {
    function makeCell(x, y, h) {
      const d = _signedDistToRegion(x, y, spec);
      return { x, y, h, d, max: d + h * Math.SQRT2 };
    }
    const width = bbox.x2 - bbox.x1;
    const height = bbox.y2 - bbox.y1;
    const size = Math.max(width, height);
    const h0 = size / 2;
    const nInit = 4;
    const step = size / nInit;
    const queue = createMaxHeap(cell => cell.max);
    function push(c) { queue.push(c); }
    function pop() { return queue.pop(); }
    let fallbackBest = null;
    for (let x = bbox.x1; x < bbox.x2 + 1e-6; x += step) {
      for (let y = bbox.y1; y < bbox.y2 + 1e-6; y += step) {
        const cell = makeCell(x + step / 2, y + step / 2, step / 2);
        push(cell);
        if (!fallbackBest || cell.d > fallbackBest.d) {
          fallbackBest = cell;
        }
      }
    }
    let best = makeCell((bbox.x1 + bbox.x2) / 2, (bbox.y1 + bbox.y2) / 2, h0);
    if (best.d < 0 && fallbackBest && fallbackBest.d > best.d) {
      best = fallbackBest;
    }
    debug('Debug: venn polylabel heap queue engaged', { initialCells: queue.size() }); // Debug: heap branch engaged
    while (queue.size()) {
      const cell = pop();
      if (cell.d > best.d) best = cell;
      if (cell.max - best.d <= tolerancePx) continue;
      const h = cell.h / 2;
      push(makeCell(cell.x - h, cell.y - h, h));
      push(makeCell(cell.x + h, cell.y - h, h));
      push(makeCell(cell.x - h, cell.y + h, h));
      push(makeCell(cell.x + h, cell.y + h, h));
    }
    return { x: best.x, y: best.y };
  }

  function _findRegionLabelPoint(code, cA, rA, cB, rB, cC, rC, hasC, tolerancePx) {
    const spec = _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC);
    const bbox = _bboxForSpec(spec);
    if (!bbox) return null;
    const tol = Math.max(0.25, tolerancePx || 0.5);
    return _polylabelRegion(spec, bbox, tol);
  }

  function getRegionText(code) {
    if (!state.analysis.lastRegions) return '';
    const map = {
      A: state.analysis.lastRegions.Aonly,
      B: state.analysis.lastRegions.Bonly,
      C: state.analysis.lastRegions.Conly,
      AB: state.analysis.lastRegions.AB,
      AC: state.analysis.lastRegions.AC,
      BC: state.analysis.lastRegions.BC,
      ABC: state.analysis.lastRegions.ABC
    };
    const genes = [...(map[code] || new Set())];
    return genes.join('\n');
  }

  function populateRegion(code, options = {}) {
    if (!state.analysis.lastRegions || !state.ui.regionList) {
      debug('Debug: venn populateRegion skipped', { hasRegions: !!state.analysis.lastRegions });
      return;
    }
    const map = {
      A: state.analysis.lastRegions.Aonly,
      B: state.analysis.lastRegions.Bonly,
      C: state.analysis.lastRegions.Conly,
      AB: state.analysis.lastRegions.AB,
      AC: state.analysis.lastRegions.AC,
      BC: state.analysis.lastRegions.BC,
      ABC: state.analysis.lastRegions.ABC
    };
    const arr = [...(map[code] || new Set())].sort();
    const signature = `${code || ''}::${arr.join('|')}`;
    const shouldClear = signature !== state.analysis.lastRegionSignature;
    if (shouldClear && !options.skipClear) {
      clearAnalysis();
      debug('Debug: venn populateRegion cleared analysis', {
        code,
        geneCount: arr.length,
        previousSignature: state.analysis.lastRegionSignature,
        nextSignature: signature
      });
    } else {
      debug('Debug: venn populateRegion retained analysis', {
        code,
        geneCount: arr.length,
        signature
      });
    }
    state.analysis.lastRegionSignature = signature;
    state.analysis.lastRegionCode = code || null;
    state.ui.regionList.innerHTML = arr.length ? arr.map(x => `<div class="gene-item">${x}<span class="gene-link" data-gene="${x}">&#128279;</span></div>`).join('') : '(empty)';
    if (state.ui.copyRegionBtn) { state.ui.copyRegionBtn.style.display = arr.length ? 'block' : 'none'; }
    debug('Debug: venn populateRegion rendered list', {
      code,
      geneCount: arr.length,
      signature
    });
  }

  function refreshCounts(c) {
    if (!state.ui.countsUI) return;
    state.ui.countsUI.A.textContent = c.nA;
    state.ui.countsUI.B.textContent = c.nB;
    state.ui.countsUI.C.textContent = c.nC;
    state.ui.countsUI.AB.textContent = c.AB + c.ABC;
    state.ui.countsUI.AC.textContent = c.AC + c.ABC;
    state.ui.countsUI.BC.textContent = c.BC + c.ABC;
    state.ui.countsUI.ABC.textContent = c.ABC;
    debugLog('refreshCounts', c);
  }

  function updateCountLabels(labels) {
    const labelA = document.getElementById('labelAName');
    const labelB = document.getElementById('labelBName');
    const labelC = document.getElementById('labelCName');
    const labelAB = document.getElementById('labelABName');
    const labelAC = document.getElementById('labelACName');
    const labelBC = document.getElementById('labelBCName');
    const labelABC = document.getElementById('labelABCName');
    if (labelA) labelA.textContent = labels.A;
    if (labelB) labelB.textContent = labels.B;
    if (labelC) labelC.textContent = labels.C;
    if (labelAB) labelAB.textContent = labels.A + '∩' + labels.B;
    if (labelAC) labelAC.textContent = labels.A + '∩' + labels.C;
    if (labelBC) labelBC.textContent = labels.B + '∩' + labels.C;
    if (labelABC) labelABC.textContent = labels.A + '∩' + labels.B + '∩' + labels.C;
  }

  function updateRegionSelect(labels, countsOverride) {
    if (!state.ui.regionSelect) return;
    const map = {
      A: labels.A + ' only',
      B: labels.B + ' only',
      C: labels.C + ' only',
      AB: labels.A + '∩' + labels.B + ' only',
      AC: labels.A + '∩' + labels.C + ' only',
      BC: labels.B + '∩' + labels.C + ' only',
      ABC: labels.A + '∩' + labels.B + '∩' + labels.C
    };
    const counts = countsOverride || state.analysis.lastCounts;
    const requiredSets = {
      A: ['A'],
      B: ['B'],
      C: ['C'],
      AB: ['A', 'B'],
      AC: ['A', 'C'],
      BC: ['B', 'C'],
      ABC: ['A', 'B', 'C']
    };
    const options = [...state.ui.regionSelect.options];
    const presence = counts ? {
      A: Number(counts.nA || 0) > 0,
      B: Number(counts.nB || 0) > 0,
      C: Number(counts.nC || 0) > 0
    } : { A: true, B: true, C: true };
    const previousValue = state.ui.regionSelect.value;
    let previousValueVisible = false;
    let firstVisibleValue = null;
    options.forEach(option => {
      if (map[option.value]) option.textContent = map[option.value];
      const needed = requiredSets[option.value] || [];
      const shouldShow = needed.every(setKey => presence[setKey]);
      option.hidden = !shouldShow;
      option.disabled = !shouldShow;
      if (shouldShow && !firstVisibleValue) firstVisibleValue = option.value;
      if (shouldShow && option.value === previousValue) previousValueVisible = true;
    });
    if (counts) {
      if (!firstVisibleValue) {
        state.ui.regionSelect.value = '';
        if (state.ui.regionList) state.ui.regionList.textContent = '(empty)';
        if (state.ui.copyRegionBtn) state.ui.copyRegionBtn.style.display = 'none';
        debug('Debug: venn regionSelect empty after update', { counts }); // Debug: region select no visible options
      } else if (!previousValueVisible) {
        state.ui.regionSelect.value = firstVisibleValue;
        debug('Debug: venn regionSelect fallback applied', { previousValue, next: firstVisibleValue }); // Debug: region select fallback selection
        if (state.analysis.lastRegions) {
          populateRegion(firstVisibleValue);
        }
      }
    }
    debug('Debug: venn regionSelect visibility updated', {
      countsAvailable: !!counts,
      presence,
      selected: state.ui.regionSelect.value
    }); // Debug: region select visibility state snapshot
    if(typeof formControls.autoSizeSelect === 'function'){
      formControls.autoSizeSelect(state.ui.regionSelect);
    }
  }

  function updateColorLabels(labels) {
    const colorLabelA = document.getElementById('colorLabelA');
    const colorLabelB = document.getElementById('colorLabelB');
    const colorLabelC = document.getElementById('colorLabelC');
    if (colorLabelA) colorLabelA.textContent = labels.A;
    if (colorLabelB) colorLabelB.textContent = labels.B;
    if (colorLabelC) colorLabelC.textContent = labels.C;
  }

  function clearAnalysis() {
    if (state.ui.goResults) state.ui.goResults.innerHTML = '';
    if (state.ui.stringResults) state.ui.stringResults.innerHTML = '';
    if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '';
    if (state.analysis.goChart) { state.analysis.goChart.destroy(); state.analysis.goChart = null; }
    state.analysis.lastGOResult = null;
    state.analysis.lastGOFormatted = [];
    state.analysis.lastStringSVG = null;
    state.analysis.lastStringEnrichment = null;
    const canvas = document.getElementById('goChart');
    if (canvas) canvas.style.display = 'none';
    if (state.ui.goChartExport) state.ui.goChartExport.style.display = 'none';
    if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
    debug('Debug: venn clearAnalysis invoked'); // Debug: analysis outputs cleared
  }

  function resolveActiveVennTabId() {
    const active = global.Main?.session?.getActiveTab?.();
    if (!active || active.type !== 'venn') return null;
    return active.id || null;
  }

  function getVennTabById(tabId) {
    if (!tabId) return null;
    const tabs = global.Main?.session?.workspaceState?.tabs;
    if (!Array.isArray(tabs)) return null;
    return tabs.find(tab => tab && tab.id === tabId && tab.type === 'venn') || null;
  }

  function syncActiveVennPayload(reason) {
    const session = global.Main?.session;
    const active = resolveActiveVennTabId();
    if (!session || !active || typeof getVennGraphPayload !== 'function') return false;
    const tab = getVennTabById(active);
    if (!tab || typeof session.assignTabPayload !== 'function') return false;
    const payload = getVennGraphPayload();
    session.assignTabPayload(tab, payload, { reason: reason || 'venn-analysis-sync' });
    debugLog('venn tab payload synced', { tabId: active, reason: reason || 'venn-analysis-sync' });
    return true;
  }

  function updateTabAnalysisPayload(tabId, analysisPatch, meta = {}) {
    const session = global.Main?.session;
    if (!session || !tabId || !analysisPatch || typeof analysisPatch !== 'object') return false;
    const tab = getVennTabById(tabId);
    if (!tab || typeof session.assignTabPayload !== 'function') return false;
    const cloneFn = session.fastClonePayload || session.clonePayload;
    let payload = tab.payload ? (cloneFn ? cloneFn(tab.payload) : cloneSimple(tab.payload)) : null;
    if (!payload && typeof venn.createEmptyPayload === 'function') {
      payload = venn.createEmptyPayload();
    }
    if (!payload) return false;
    payload.analysis = payload.analysis && typeof payload.analysis === 'object' ? payload.analysis : {};
    Object.assign(payload.analysis, analysisPatch);
    session.assignTabPayload(tab, payload, { reason: meta.reason || 'venn-analysis-update' });
    debugLog('venn tab analysis patched', {
      tabId,
      reason: meta.reason || 'venn-analysis-update',
      keys: Object.keys(analysisPatch || {})
    });
    return true;
  }

  function renderStringResults(items, limit = 5) {
    if (!state.ui.stringResults) return;
    if (!Array.isArray(items) || !items.length) {
      state.ui.stringResults.innerHTML = '<div>No STRING results</div>';
      return;
    }
    const sliceLimit = Number.isFinite(limit) && limit > 0 ? limit : 5;
    const rows = items.slice(0, sliceLimit).map(r => {
      const desc = r.termDescription || r.description || 'unknown term';
      return '<div>' + desc + ' (FDR=' + formatSharedPValue(r.fdr) + ')</div>';
    }).join('');
    state.ui.stringResults.innerHTML = '<strong>STRING enrichment</strong>' + rows;
  }

  function renderStringNetwork(svgMarkup) {
    if (!state.ui.stringNetwork) return;
    state.ui.stringNetwork.innerHTML = '';
    if (!svgMarkup) {
      state.ui.stringNetwork.innerHTML = '<div>Failed to load STRING network</div>';
      if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = svgMarkup;
    const svgEl = wrapper.querySelector('svg');
    if (!svgEl) {
      state.ui.stringNetwork.innerHTML = '<div>Failed to load STRING network</div>';
      if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
      return;
    }
    const scopeAttr = 'data-string-network-scope';
    const scopeToken = `scope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    svgEl.setAttribute(scopeAttr, scopeToken);
    const styleEls = Array.from(svgEl.querySelectorAll('style'));
    let scopedStyles = 0;
    const scopeSelector = `[${scopeAttr}="${scopeToken}"]`;
    styleEls.forEach(styleEl => {
      const original = styleEl.textContent || '';
      if (!original.trim()) {
        return;
      }
      const scoped = original.replace(/(^|})\s*([^@{}][^{}]*)\s*\{/g, (match, prefix, selector) => {
        const trimmed = (selector || '').trim();
        if (!trimmed) {
          return match;
        }
        const parts = trimmed.split(',').map(part => part.trim()).filter(Boolean);
        if (!parts.length) {
          return match;
        }
        const rewritten = parts.map(part => `${scopeSelector} ${part}`).join(', ');
        return `${prefix} ${rewritten} {`;
      });
      if (scoped !== original) {
        styleEl.textContent = scoped;
        scopedStyles += 1;
      }
    });
    svgEl.style.width = '100%';
    svgEl.style.maxWidth = '100%';
    svgEl.style.height = 'auto';
    svgEl.style.display = 'block';
    svgEl.style.position = 'relative';
    if (!svgEl.getAttribute('preserveAspectRatio')) {
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    state.ui.stringNetwork.appendChild(svgEl);
    if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'flex';
    const scheduleViewport = () => padStringNetworkViewport(svgEl, { exportHost: state.ui.stringNetworkExport });
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(scheduleViewport);
    } else {
      scheduleViewport();
    }
    debug('Debug: venn string network sizing applied', {
      viewBox: svgEl.getAttribute('viewBox') || null,
      widthAttr: svgEl.getAttribute('width') || null,
      scopeApplied: scopedStyles > 0,
      scopedStyleCount: scopedStyles,
      totalStyleCount: styleEls.length
    }); // Debug: ensure network svg stays responsive and scoped
  }

  function applyAnalysisPayload(analysis) {
    clearAnalysis();
    if (!analysis || typeof analysis !== 'object') {
      return;
    }
    const goResult = Array.isArray(analysis.goResult) ? analysis.goResult : null;
    if (goResult && goResult.length) {
      state.analysis.lastGOResult = cloneSimple(goResult) || goResult;
      state.analysis.lastGOFormatted = Array.isArray(analysis.goFormatted) ? analysis.goFormatted.slice() : [];
      if (analysis.goOrganism) {
        state.analysis.lastGOOrganism = analysis.goOrganism;
      }
      const limit = Number.isFinite(analysis.goLimit) && analysis.goLimit > 0
        ? analysis.goLimit
        : Math.min(5, state.analysis.lastGOResult.length);
      renderGOResults(limit);
    }
    if (analysis.stringSvg) {
      state.analysis.lastStringSVG = analysis.stringSvg;
      renderStringNetwork(analysis.stringSvg);
    }
    if (Array.isArray(analysis.stringEnrichment)) {
      state.analysis.lastStringEnrichment = cloneSimple(analysis.stringEnrichment) || analysis.stringEnrichment;
      renderStringResults(state.analysis.lastStringEnrichment, analysis.stringLimit || 5);
    }
    if (state.ui.regionSelect) {
      const hasRegion = Object.prototype.hasOwnProperty.call(analysis, 'regionSelectValue');
      let targetValue = hasRegion ? (analysis.regionSelectValue || '') : '';
      if (!targetValue) {
        targetValue = state.ui.regionSelect.options[0]?.value || '';
      }
      state.ui.regionSelect.value = targetValue;
      populateRegion(state.ui.regionSelect.value, { skipClear: true });
    }
  }

  function applyGoChartDefaults(ChartCtor) {
    if (!ChartCtor || !ChartCtor.defaults) {
      debugLog('goChart.defaults.skip', { hasDefaults: !!ChartCtor?.defaults }); // Debug: Chart defaults missing
      return;
    }
    if (state.analysis.goChartLocaleApplied) {
      return;
    }
    try {
      ChartCtor.defaults.locale = 'en-US';
      state.analysis.goChartLocaleApplied = true;
      debugLog('goChart.defaults.applied', { locale: 'en-US' }); // Debug: locale configured once
    } catch (err) {
      console.warn('venn goChart locale apply failed', err);
    }
  }

  function renderGOChart(limit = 5) {
    if (!state.ui.goResults) return;
    if (!state.analysis.lastGOResult || !state.analysis.lastGOResult.length) {
      const canvas = document.getElementById('goChart');
      if (canvas) canvas.style.display = 'none';
      if (state.ui.goChartExport) state.ui.goChartExport.style.display = 'none';
      if (state.analysis.goChart) { state.analysis.goChart.destroy(); state.analysis.goChart = null; }
      return;
    }
    const data = state.analysis.lastGOResult.slice(0, limit);
    const labels = data.map(r => r.term_name || r.name || '');
    const values = data.map(r => -Math.log10(r.p_value));
    const barColor = '#64b5f6';
    if (state.analysis.goChart) { state.analysis.goChart.destroy(); }
    const canvas = document.getElementById('goChart');
    if (!canvas) return;
    canvas.style.display = 'block';
    if (state.ui.goChartExport) state.ui.goChartExport.style.display = 'flex';
    const isAll = limit > 5;
    const baseBarHeight = 25;
    const minBarHeight = 18;
    const barHeight = isAll ? minBarHeight : baseBarHeight;
    const chartHeight = Math.max(300, barHeight * labels.length);
    canvas.style.height = chartHeight + 'px';
    canvas.height = chartHeight;
    canvas.width = canvas.offsetWidth;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const config = {
      type: 'bar',
      data: { labels, datasets: [{ label: '-log10(p)', data: values, backgroundColor: barColor, barThickness: barHeight - 5 }] },
      options: {
        indexAxis: 'y',
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            title: { display: true, text: '-log10(p)' },
            grid: { display: false },
            ticks: { callback: v => chartStyle.formatScientific(v, { maxDecimals: 2 }) }
          },
          y: { grid: { display: false }, ticks: { autoSkip: false } }
        }
      },
      locale: 'en-US'
    };
    const instantiateChart = (ChartCtor) => {
      if (!ChartCtor) {
        console.error('venn GO chart missing Chart constructor');
        if (state.ui.goChartExport) state.ui.goChartExport.style.display = 'none';
        return;
      }
      applyGoChartDefaults(ChartCtor);
      state.analysis.goChart = new ChartCtor(ctx, config);
      debugLog('goChart.rendered', { bars: labels.length, limit }); // Debug: chart instantiated
    };

    if (typeof Shared.lazyChart === 'function') {
      Shared.lazyChart()
        .then(chartLib => {
          const ChartCtor = chartLib?.Chart || chartLib || global.Chart;
          instantiateChart(ChartCtor);
        })
        .catch(err => {
          console.error('venn GO chart failed to load Chart.js', err);
          if (state.ui.goChartExport) state.ui.goChartExport.style.display = 'none';
        });
      return;
    }

    if (global.Chart) {
      instantiateChart(global.Chart);
      return;
    }

    console.warn('Chart.js unavailable for GO chart rendering');
    if (state.ui.goChartExport) state.ui.goChartExport.style.display = 'none';
  }

  function renderGOResults(limit = 5) {
    if (!state.ui.goResults) return;
    if (!state.analysis.lastGOResult || !state.analysis.lastGOResult.length) {
      state.ui.goResults.innerHTML = '<div>No GO results</div>';
      return;
    }
    const items = state.analysis.lastGOResult.slice(0, limit).map(r => {
      const term = r.term_name || r.name || 'unknown term';
      const src = r.source || 'unknown source';
      return `<div>${term} [${src}] (p=${formatSharedPValue(r.p_value)})</div>`;
    }).join('');
    const fullUrl = `https://biit.cs.ut.ee/gprofiler/gost?organism=${state.analysis.lastGOOrganism}&query=${encodeURIComponent(state.analysis.lastGOFormatted.join('\n'))}`;
    const link = `<div><a href="${fullUrl}" target="_blank" rel="noopener">View full GO analysis</a>${
      state.analysis.lastGOResult.length > 5 ? ` | <button class="btn" id="toggleGoResults" data-state="${limit === 5 ? 'top5' : 'all'}">${
        limit === 5 ? 'Show all results' : 'Show top 5'}</button>` : ''}</div>`;
    state.ui.goResults.innerHTML = `<strong>${limit === 5 ? 'Top 5 GO terms' : 'All GO terms'}</strong>` + items + link;
    renderGOChart(limit);
  }

  function positionTooltip(x, y) {
    if (!state.ui.tooltip) return;
    const padding = 16;
    let left = x, top = y;
    state.ui.tooltip.style.left = left + 'px';
    state.ui.tooltip.style.top = top + 'px';
    const rect = state.ui.tooltip.getBoundingClientRect();
    const leftBound = window.scrollX + padding;
    const topBound = window.scrollY + padding;
    const rightBound = window.scrollX + window.innerWidth - padding;
    const bottomBound = window.scrollY + window.innerHeight - padding;
    if (rect.right > rightBound) { left = Math.max(leftBound, rightBound - rect.width); }
    if (rect.left < leftBound) { left = leftBound; }
    if (rect.bottom > bottomBound) { top = Math.max(topBound, bottomBound - rect.height); }
    if (rect.top < topBound) { top = topBound; }
    state.ui.tooltip.style.left = left + 'px';
    state.ui.tooltip.style.top = top + 'px';
  }

  async function fetchUniProtAnnotation(gene) {
    const service = Shared.uniprot;
    if (!service || typeof service.fetchFunctionAnnotation !== 'function') {
      console.warn('venn: Shared.uniprot.fetchFunctionAnnotation unavailable');
      return null;
    }
    return service.fetchFunctionAnnotation(gene, { fetch });
  }

  function getSignificanceCache() {
    if (!state.analysis.significanceCache) {
      const statsHelpers = Shared.stats || {};
      state.analysis.significanceCache = {
        logFactorial: typeof statsHelpers.createLogFactorialCache === 'function'
          ? statsHelpers.createLogFactorialCache()
          : null,
        lastUniverse: 0
      };
      debug('Debug: venn significance cache created'); // Debug: significance cache init
    }
    return state.analysis.significanceCache;
  }

  function makeCountsSignature(counts) {
    if (!counts) return null;
    const keys = ['nA', 'nB', 'nC', 'Aonly', 'Bonly', 'Conly', 'AB', 'AC', 'BC', 'ABC'];
    return keys.map(key => `${key}:${Number(counts[key]) || 0}`).join('|');
  }

  function calculateSignificance() {
    if (!state.analysis.lastCounts || !state.ui.significanceResults) {
      if (state.ui.significanceResults) state.ui.significanceResults.textContent = 'Draw a Venn diagram first.';
      return;
    }
    const total = +state.ui.totalGenesInput.value;
    if (!total || total < Math.max(state.analysis.lastCounts.nA, state.analysis.lastCounts.nB, state.analysis.lastCounts.nC)) {
      state.ui.significanceResults.textContent = 'Please enter a valid total gene count.';
      return;
    }
    const inputs = ensureInputs();
    const labels = { A: inputs.labelA.value || 'A', B: inputs.labelB.value || 'B', C: inputs.labelC.value || 'C' };
    const statsHelpers = Shared.stats || {};
    const significanceCache = getSignificanceCache();
    if (significanceCache && significanceCache.lastUniverse && total < significanceCache.lastUniverse) {
      if (significanceCache.logFactorial && typeof statsHelpers.trimLogFactorialCache === 'function') {
        statsHelpers.trimLogFactorialCache(significanceCache.logFactorial, total);
        debug('Debug: venn significance cache trimmed', { previous: significanceCache.lastUniverse, next: total }); // Debug: trim cache
      } else {
        significanceCache.logFactorial = null;
        debug('Debug: venn significance cache reset due to shrink'); // Debug: reset cache shrink
      }
    }
    if (!significanceCache.logFactorial && typeof statsHelpers.createLogFactorialCache === 'function') {
      significanceCache.logFactorial = statsHelpers.createLogFactorialCache();
      debug('Debug: venn significance cache allocated'); // Debug: allocate cache
    }
    if (significanceCache.logFactorial && typeof statsHelpers.ensureLogFactorialCache === 'function') {
      statsHelpers.ensureLogFactorialCache(significanceCache.logFactorial, total);
      debug('Debug: venn significance cache ensured', { total, maxComputed: significanceCache.logFactorial.maxComputed }); // Debug: ensure cache
    }
    significanceCache.lastUniverse = total;

    const computeHypergeom = (() => {
      if (typeof statsHelpers.computeHypergeometricRightTail === 'function') {
        return (successes, draws, observed) => statsHelpers.computeHypergeometricRightTail({
          populationSize: total,
          successPopulation: successes,
          draws,
          observedSuccesses: observed,
          cache: significanceCache
        });
      }
      const hypgeom = global.jStat?.hypgeom;
      if (hypgeom && typeof hypgeom.cdf === 'function') {
        return (successes, draws, observed) => {
          if (observed <= 0) {
            return 1;
          }
          const tail = 1 - hypgeom.cdf(observed - 1, total, successes, draws);
          return Number.isFinite(tail) ? Math.max(0, Math.min(1, tail)) : 0;
        };
      }
      debug('Debug: venn significance legacy hypergeom'); // Debug: fallback hypergeom start
      return (successes, draws, observed) => {
        let p = 0;
        const limit = Math.min(successes, draws);
        const denomLog = (typeof statsHelpers.logChooseWithCache === 'function' && significanceCache.logFactorial)
          ? statsHelpers.logChooseWithCache(total, draws, significanceCache.logFactorial)
          : null;
        const denominator = Number.isFinite(denomLog) ? Math.exp(denomLog) : null;
        if (!denominator || !Number.isFinite(denominator) || denominator === 0) {
          return 0;
        }
        for (let i = observed; i <= limit; i++) {
          const numerator = Math.exp(
            (typeof statsHelpers.logChooseWithCache === 'function' && significanceCache.logFactorial)
              ? statsHelpers.logChooseWithCache(successes, i, significanceCache.logFactorial) +
                statsHelpers.logChooseWithCache(total - successes, draws - i, significanceCache.logFactorial)
              : 0
          );
          p += numerator / denominator;
        }
        return Math.max(0, Math.min(1, p));
      };
    })();

    const res = [];
    const pAB = computeHypergeom(state.analysis.lastCounts.nA, state.analysis.lastCounts.nB, state.analysis.lastCounts.AB + state.analysis.lastCounts.ABC);
    res.push({ name: `${labels.A}∩${labels.B}`, p: pAB });
    if (state.analysis.lastCounts.nC > 0) {
      const pAC = computeHypergeom(state.analysis.lastCounts.nA, state.analysis.lastCounts.nC, state.analysis.lastCounts.AC + state.analysis.lastCounts.ABC);
      res.push({ name: `${labels.A}∩${labels.C}`, p: pAC });
      const pBC = computeHypergeom(state.analysis.lastCounts.nB, state.analysis.lastCounts.nC, state.analysis.lastCounts.BC + state.analysis.lastCounts.ABC);
      res.push({ name: `${labels.B}∩${labels.C}`, p: pBC });
      const pABC = computeHypergeom(state.analysis.lastCounts.AB + state.analysis.lastCounts.ABC, state.analysis.lastCounts.nC, state.analysis.lastCounts.ABC);
      res.push({ name: `${labels.A}∩${labels.B}∩${labels.C}`, p: pABC });
    }
    const hasRenderer = Shared.statsTable && typeof Shared.statsTable.render === 'function';
    const rows = res.map(r => ({
      overlap: r.name,
      pvalue: formatSharedPValue(r.p),
      significant: r.p < 0.05 ? 'yes' : 'no'
    }));
    if (hasRenderer) {
      Shared.statsTable.render({
        target: state.ui.significanceResults,
        columns: [
          { key: 'overlap', label: 'Overlap', align: 'left' },
          { key: 'pvalue', label: 'p-value', align: 'right' },
          { key: 'significant', label: 'Significant', align: 'center' }
        ],
        rows,
        caption: 'Overlap enrichment significance (hypergeometric test)',
        footnotes: [
          'Significance threshold: p < 0.05.',
          'Test: One-sided hypergeometric overlap enrichment.'
        ],
        options: {
          fileName: 'venn-significance',
          contextLabel: 'venn-significance'
        }
      });
    } else {
      state.ui.significanceResults.innerHTML = '<table><caption>Overlap enrichment significance (hypergeometric test)</caption><tr><th>Overlap</th><th>p-value</th><th>Significant</th></tr>' +
        rows.map(r => `<tr><td>${r.overlap}</td><td>${r.pvalue}</td><td>${r.significant}</td></tr>`).join('') +
        '</table><p class="stats-footnote">Significance threshold: p &lt; 0.05.<br>Test: One-sided hypergeometric overlap enrichment.</p>';
    }
    const countsSignature = makeCountsSignature(state.analysis.lastCounts);
    state.analysis.lastSignificance = { countsSignature, total };
    debugLog('calculateSignificance complete', { total, overlaps: res.length, countsSignature });
  }

  async function guessSpecies(genes, options = {}) {
    const detection = getSpeciesDetectionState();
    const { signal, cache = detection?.cache, cacheKey } = options || {};
    const geneList = Array.isArray(genes) ? genes : [];
    if (cache && cacheKey && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      debug('Debug: venn guessSpecies cache hit', { cacheKey, geneCount: geneList.length }); // Debug: guess cache hit
      return cached?.guess ?? null;
    }
    const counts = { hsapiens: 0, mmusculus: 0, dmelanogaster: 0, celegans: 0 };
    const taxMap = { '9606': 'hsapiens', '10090': 'mmusculus', '7227': 'dmelanogaster', '6239': 'celegans' };
    const sample = geneList.slice(0, 20);
    const maxConcurrent = 4;
    let aborted = false;
    debug('Debug: venn guessSpecies cache miss', { cacheKey, geneCount: geneList.length, sampleSize: sample.length }); // Debug: guess cache miss

    const fetchGene = async (rawGene) => {
      const gene = String(rawGene || '').trim();
      if (!gene) return;
      if (signal?.aborted) {
        throw createAbortError(signal.reason);
      }
      const url = `https://mygene.info/v3/query?q=${encodeURIComponent(gene)}&fields=symbol,taxid&species=9606,10090,7227,6239&size=5`;
      try {
        const resp = await fetch(url, signal ? { signal } : undefined);
        if (!resp?.ok) return;
        const data = await resp.json();
        const hit = data.hits?.find(h => h.symbol === gene) ||
          data.hits?.find(h => h.symbol?.toLowerCase() === gene.toLowerCase()) ||
          data.hits?.[0];
        const tax = hit?.taxid?.toString();
        const sp = taxMap[tax];
        if (sp) counts[sp] += 1;
      } catch (err) {
        if (err && err.name === 'AbortError') {
          aborted = true;
        } else {
          debug('Debug: venn guessSpecies fetch error', { gene, message: err && err.message }); // Debug: fetch failure
        }
      }
    };

    for (let i = 0; i < sample.length; i += maxConcurrent) {
      const chunk = sample.slice(i, i + maxConcurrent);
      await Promise.all(chunk.map(g => fetchGene(g)));
      if (signal?.aborted || aborted) {
        break;
      }
    }

    if (signal?.aborted || aborted) {
      throw createAbortError(signal?.reason || 'cancelled');
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const [best, bestScore] = Object.entries(counts).reduce((m, e) => e[1] > m[1] ? e : m, ['', 0]);
    const guess = total === 0 || (bestScore / (total || 1)) < 0.6 ? null : best;
    if (cache && cacheKey && !cache.has(cacheKey)) {
      cache.set(cacheKey, { guess, geneCount: geneList.length });
      debug('Debug: venn guessSpecies cache stored', { cacheKey, guess }); // Debug: guess cache store
    }
    return guess;
  }

  function getAllGenes() {
    const parsed = ensureParsedLists({ includeRegions: false, reason: 'getAllGenes' });
    const unique = parsed?.uniques?.combinedList || [];
    debugLog('getAllGenes resolved', { count: unique.length, signature: parsed?.signature });
    return unique.slice();
  }

  function setSpeciesIndicator(success) {
    if (!state.ui.speciesSelect) return;
    if (success === null) {
      state.ui.speciesSelect.style.backgroundColor = '';
      return;
    }
    const color = success ? '#b5d99c' : '#f28b82';
    state.ui.speciesSelect.style.backgroundColor = color;
  }

  async function recognizeSpeciesFromInput(options = {}) {
    const reason = options?.reason || 'auto';
    cancelPendingSpeciesDetection(reason);
    const detection = getSpeciesDetectionState();
    const genes = getAllGenes();
    if (!genes.length) {
      if (state.ui.speciesSelect) state.ui.speciesSelect.value = '';
      setSpeciesIndicator(null);
      detection.cache.set('0:0', { guess: null, geneCount: 0 });
      debug('Debug: venn species detect skipped empty', { reason }); // Debug: detection skipped for empty input
      return null;
    }
    const cacheKey = computeGeneSignature(genes);
    if (detection.cache.has(cacheKey)) {
      const cached = detection.cache.get(cacheKey);
      const guess = cached?.guess || null;
      if (state.ui.speciesSelect) state.ui.speciesSelect.value = guess || '';
      setSpeciesIndicator(guess ? true : false);
      debug('Debug: venn species cache hit', { reason, cacheKey, geneCount: genes.length, guess }); // Debug: detection cache hit
      return guess;
    }
    debug('Debug: venn species cache miss', { reason, cacheKey, geneCount: genes.length }); // Debug: detection cache miss
    if (detection.active?.controller) {
      try {
        detection.active.controller.abort('superseded');
      } catch (err) { /* noop */ }
    }
    const controller = new AbortController();
    detection.active = { controller, cacheKey, reason };
    setSpeciesIndicator(null);
    try {
      const guess = await guessSpecies(genes, { signal: controller.signal, cache: detection.cache, cacheKey });
      const entry = detection.cache.get(cacheKey) || { guess, geneCount: genes.length };
      if (!detection.cache.has(cacheKey)) {
        detection.cache.set(cacheKey, entry);
      }
      if (detection.active && detection.active.controller === controller) {
        detection.active = null;
        if (state.ui.speciesSelect) state.ui.speciesSelect.value = guess || '';
        setSpeciesIndicator(guess ? true : false);
        debug('Debug: venn species detect complete', { reason, cacheKey, guess }); // Debug: detection finished
      } else {
        debug('Debug: venn species detect result ignored', { reason, cacheKey }); // Debug: stale detection ignored
      }
      return guess || null;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        if (detection.active && detection.active.controller === controller) {
          detection.active = null;
          setSpeciesIndicator(null);
        }
        debug('Debug: venn species detect aborted', { reason, cacheKey }); // Debug: detection aborted
        throw err;
      }
      if (detection.active && detection.active.controller === controller) {
        detection.active = null;
      }
      console.warn('venn species detection error', err);
      if (state.ui.speciesSelect) state.ui.speciesSelect.value = '';
      setSpeciesIndicator(false);
      return null;
    }
  }

  async function runGOAnalysis(genes, organism) {
    const originTabId = resolveActiveVennTabId();
    const formatted = genes.map(g => g.trim().toUpperCase()).filter(x => x);
    if (!formatted.length) { if (state.ui.goResults) state.ui.goResults.innerHTML = '<i>No genes for analysis</i>'; return; }
    const org = organism || state.ui.speciesSelect.value;
    if (!org) {
      if (state.ui.goResults) state.ui.goResults.innerHTML = '<div>Please select a species before running GO analysis.</div>';
      return;
    }
    const sources = state.ui.goCategoryChecks.filter(cb => cb.checked).map(cb => cb.value);
    if (!sources.length) {
      if (state.ui.goResults) state.ui.goResults.innerHTML = '<div>Please select at least one GO category.</div>';
      return;
    }
    const service = Shared.goAnalysis;
    if (!service || typeof service.profile !== 'function') {
      console.warn('venn: Shared.goAnalysis.profile unavailable');
      if (state.ui.goResults) state.ui.goResults.innerHTML = '<div>GO analysis service unavailable.</div>';
      return;
    }
    state.analysis.lastGOFormatted = formatted;
    state.analysis.lastGOOrganism = org;
    state.analysis.lastGOResult = null;
    renderGOChart();
    if (state.ui.goResults) state.ui.goResults.innerHTML = '<i>Running GO analysis...</i>';
    let background;
    let domainScope;
    if (state.ui.goUseAllBackground?.checked) {
      const bg = getAllGenes().map(g => g.trim().toUpperCase()).filter(x => x);
      if (bg.length) {
        background = bg;
        domainScope = 'custom';
      }
    }
    try {
      const response = await service.profile({
        genes: formatted,
        organism: org,
        sources,
        background,
        domainScope,
        fetch
      });
      const results = response.result || [];
      const activeTabId = resolveActiveVennTabId();
      if (originTabId && activeTabId !== originTabId) {
        updateTabAnalysisPayload(originTabId, {
          goResult: results,
          goFormatted: formatted,
          goOrganism: org,
          goLimit: Math.min(5, results.length || 5)
        }, { reason: 'venn-go-analysis-background' });
        return;
      }
      state.analysis.lastGOResult = results;
      if (state.analysis.lastGOResult.length) {
        renderGOResults(5);
      } else if (state.ui.goResults) {
        state.ui.goResults.innerHTML = '<div>No GO results</div>';
      }
      syncActiveVennPayload('venn-go-analysis-complete');
    } catch (err) {
      console.error('runGOAnalysis error', err);
      const activeTabId = resolveActiveVennTabId();
      if (originTabId && activeTabId !== originTabId) {
        updateTabAnalysisPayload(originTabId, {
          goResult: null,
          goFormatted: formatted,
          goOrganism: org
        }, { reason: 'venn-go-analysis-error' });
        return;
      }
      if (state.ui.goResults) state.ui.goResults.innerHTML = '<div>Error fetching GO analysis</div>';
    }
    debugLog('runGOAnalysis invoked', { organism: org, geneCount: formatted.length });
  }

  async function runStringAnalysis(genes, organism) {
    const originTabId = resolveActiveVennTabId();
    const formatted = genes.map(g => g.trim().toUpperCase()).filter(x => x);
    if (!formatted.length) {
      if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '';
      if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<i>No genes for analysis</i>';
      if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
      return;
    }
    const org = organism || state.ui.speciesSelect.value;
    if (!org) {
      if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '';
      if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<div>Please select a species before running STRING analysis.</div>';
      if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
      return;
    }
    const service = Shared.stringAnalysis;
    if (!service || typeof service.fetchNetwork !== 'function' || typeof service.fetchEnrichment !== 'function') {
      console.warn('venn: Shared.stringAnalysis helpers unavailable');
      state.analysis.lastStringSVG = null;
      if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '<div>STRING services unavailable.</div>';
      if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<div>STRING services unavailable.</div>';
      if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
      return;
    }
    if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '<i>Loading STRING network...</i>';
    if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<i>Running STRING enrichment...</i>';
    if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
    const networkType = document.querySelector('input[name="stringNetworkType"]:checked')?.value || 'functional';
    const edgeMeaning = document.querySelector('input[name="stringEdgeMeaning"]:checked')?.value || 'evidence';
    const sources = [...document.querySelectorAll('.stringSource:checked')].map(el => el.value);
    const fallbackCode = state.ui.speciesSelect?.selectedOptions[0]?.dataset.string;
    const speciesCode = typeof service.resolveSpeciesCode === 'function'
      ? service.resolveSpeciesCode(org, fallbackCode)
      : (fallbackCode || { hsapiens: '9606', mmusculus: '10090', dmelanogaster: '7227', celegans: '6239' }[org] || '9606');
    const requestOptions = {
      genes: formatted,
      species: speciesCode,
      networkType,
      edgeMeaning,
      sources,
      fetch
    };
    try {
      const network = await service.fetchNetwork(requestOptions);
      const activeTabId = resolveActiveVennTabId();
      if (originTabId && activeTabId !== originTabId) {
        updateTabAnalysisPayload(originTabId, {
          stringSvg: network.svg
        }, { reason: 'venn-string-network-background' });
      } else {
        state.analysis.lastStringSVG = network.svg;
        renderStringNetwork(network.svg);
      }
    } catch (err) {
      console.error('runStringAnalysis network error', err);
      const activeTabId = resolveActiveVennTabId();
      if (originTabId && activeTabId !== originTabId) {
        updateTabAnalysisPayload(originTabId, {
          stringSvg: ''
        }, { reason: 'venn-string-network-error' });
        return;
      }
      state.analysis.lastStringSVG = null;
      state.analysis.lastStringEnrichment = null;
      if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '<div>Error loading STRING network</div>';
      if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
    }
    try {
      const enrichment = await service.fetchEnrichment(requestOptions);
      const items = Array.isArray(enrichment.items) ? enrichment.items : [];
      const activeTabId = resolveActiveVennTabId();
      if (originTabId && activeTabId !== originTabId) {
        updateTabAnalysisPayload(originTabId, {
          stringEnrichment: items,
          stringLimit: 5
        }, { reason: 'venn-string-enrichment-background' });
      } else {
        state.analysis.lastStringEnrichment = items;
        renderStringResults(items, 5);
      }
    } catch (err) {
      console.error('runStringAnalysis enrichment error', err);
      const activeTabId = resolveActiveVennTabId();
      if (originTabId && activeTabId !== originTabId) {
        updateTabAnalysisPayload(originTabId, {
          stringEnrichment: null
        }, { reason: 'venn-string-enrichment-error' });
        return;
      }
      state.analysis.lastStringEnrichment = null;
      if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<div>Error fetching STRING analysis</div>';
    }
    if (originTabId && originTabId === resolveActiveVennTabId()) {
      syncActiveVennPayload('venn-string-analysis-complete');
    }
    debugLog('runStringAnalysis invoked', {
      organism: org,
      geneCount: formatted.length,
      networkType,
      edgeMeaning,
      sourceCount: sources.length
    });
  }

  function buildGoChartSvgString() {
    if (!state.analysis.goChart) {
      debugLog('buildGoChartSvgString skipped', { reason: 'no chart' });
      return '';
    }
    const canvas = document.getElementById('goChart');
    if (!canvas) {
      debugLog('buildGoChartSvgString skipped', { reason: 'no canvas' });
      return '';
    }
    try {
      const { labels } = state.analysis.goChart.data;
      const values = state.analysis.goChart.data.datasets[0].data;
      const color = state.analysis.goChart.data.datasets[0].backgroundColor;
      const width = canvas.width;
      const height = canvas.height;
      const measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = '12px sans-serif';
      const labelWidths = labels.map(l => measureCtx.measureText(l).width);
      const maxLabelWidth = Math.ceil(Math.max(...labelWidths));
      const padding = { left: maxLabelWidth + 12, right: 20, top: 10, bottom: 30 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const barHeight = chartHeight / labels.length;
      const maxVal = Math.max(...values);
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
      svg += `<rect width="${width}" height="${height}" fill="none"/>`;
      for (let i = 0; i < labels.length; i++) {
        const y = padding.top + i * barHeight;
        const barWidth = (values[i] / maxVal) * chartWidth;
        svg += `<text x="4" y="${y + barHeight / 2}" dominant-baseline="middle" font-size="12">${labels[i]}</text>`;
        svg += `<rect x="${padding.left}" y="${y + barHeight * 0.1}" width="${barWidth}" height="${barHeight * 0.8}" fill="${color}"/>`;
        svg += `<text x="${padding.left + barWidth + 4}" y="${y + barHeight / 2}" dominant-baseline="middle" font-size="12">${values[i].toFixed(2)}</text>`;
      }
      const axisY = padding.top + chartHeight;
      svg += `<line x1="${padding.left}" y1="${axisY}" x2="${width - padding.right}" y2="${axisY}" stroke="black"/>`;
      svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${axisY}" stroke="black"/>`;
      const ticks = 5;
      for (let t = 0; t <= ticks; t++) {
        const v = (maxVal / ticks) * t;
        const x = padding.left + (v / maxVal) * chartWidth;
        svg += `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 5}" stroke="black"/>`;
        svg += `<text x="${x}" y="${axisY + 15}" font-size="12" text-anchor="middle">${v.toFixed(2)}</text>`;
      }
      svg += `<text x="${padding.left + chartWidth / 2}" y="${height - 5}" font-size="12" text-anchor="middle">-log10(p)</text>`;
      svg += '</svg>';
      debugLog('buildGoChartSvgString complete', { width, height, barCount: labels.length });
      return svg;
    } catch (err) {
      console.error('buildGoChartSvgString error', err);
      return '';
    }
  }

  async function exportGoChart(format) {
    if (!state.analysis.goChart) return;
    const exporter = Shared.exporter;
    if (!exporter) {
      console.warn('exportGoChart missing exporter');
      return;
    }
    if (format === 'png') {
      const canvas = document.getElementById('goChart');
      if (!canvas) return;
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) return;
      exporter.downloadBlob(blob, 'go_chart.png', 'go-chart');
    } else if (format === 'svg') {
      const svg = buildGoChartSvgString();
      if (!svg) return;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      exporter.downloadBlob(blob, 'go_chart.svg', 'go-chart');
    }
    debugLog('exportGoChart', { format });
  }

  async function downloadStringPNG() {
    if (!state.analysis.lastStringSVG) return;
    const exporter = Shared.exporter;
    if (!exporter || typeof exporter.svgStringToPngBlob !== 'function') {
      console.warn('downloadStringPNG missing exporter helpers');
      return;
    }
    try {
      const blob = await exporter.svgStringToPngBlob(state.analysis.lastStringSVG, { contextLabel: 'string-export' });
      if (!blob) return;
      exporter.downloadBlob(blob, 'string_network.png', 'string-export');
    } catch (err) {
      console.error('downloadStringPNG error', err);
    }
  }

  function downloadStringSVG() {
    if (!state.analysis.lastStringSVG) return;
    const exporter = Shared.exporter;
    if (!exporter) {
      console.warn('downloadStringSVG missing exporter helpers');
      return;
    }
    const blob = new Blob([state.analysis.lastStringSVG], { type: 'image/svg+xml' });
    exporter.downloadBlob(blob, 'string_network.svg', 'string-export');
  }

  function configureStage(style) {
    clearSVG();
    const stage = state.ui.stage;
    if (!stage) return null;
    if (typeof chartStyle.applySvgDefaults === 'function') {
      chartStyle.applySvgDefaults(stage);
    }
    if(stage?.dataset){
      stage.dataset.fontScope = 'venn';
    }
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(stage, { scopeId: 'venn' });
      debugLog('fontControls enableForSvg invoked', { width: stage.getAttribute('width'), height: stage.getAttribute('height') });
    } else {
      debugLog('fontControls enableForSvg missing', { hasFontControls: !!fontControls });
    }
    const svgBox = state.ui.svgBox || stage.closest?.('.svgbox') || state.ui.graphPanel?.querySelector?.('.svgbox') || null;
    if (!state.ui.svgBox && svgBox) {
      state.ui.svgBox = svgBox;
      debug('Debug: venn configureStage captured svgBox', { hasSvgBox: true });
    }
    const svgBoxRect = svgBox?.getBoundingClientRect?.();
    const dataset = svgBox?.dataset || {};
    const scaleInfo = style.scaleInfo || {};
    let stageWidth = parsePositiveFloat(scaleInfo.width);
    let stageHeight = parsePositiveFloat(scaleInfo.height);
    if (!Number.isFinite(stageWidth)) stageWidth = parsePositiveFloat(svgBoxRect?.width);
    if (!Number.isFinite(stageHeight)) stageHeight = parsePositiveFloat(svgBoxRect?.height);
    if (!Number.isFinite(stageWidth)) stageWidth = parsePositiveFloat(dataset.resizerWidth);
    if (!Number.isFinite(stageHeight)) stageHeight = parsePositiveFloat(dataset.resizerHeight);
    const defaultWidth = parsePositiveFloat(dataset.resizerDefaultWidth)
      || parsePositiveFloat(chartStyle.DEFAULT_WIDTH)
      || DEFAULT_STAGE_WIDTH;
    const defaultHeight = parsePositiveFloat(dataset.resizerDefaultHeight)
      || parsePositiveFloat(chartStyle.DEFAULT_HEIGHT)
      || DEFAULT_STAGE_HEIGHT;
    const aspectRatio = parsePositiveFloat(dataset.resizerAspectRatio)
      || (defaultWidth / (defaultHeight || defaultWidth))
      || DEFAULT_STAGE_RATIO;
    if (!Number.isFinite(stageWidth) || stageWidth <= 0) {
      stageWidth = defaultWidth;
    }
    if ((!Number.isFinite(stageHeight) || stageHeight <= 0) && Number.isFinite(stageWidth) && Number.isFinite(aspectRatio) && aspectRatio > 0) {
      stageHeight = stageWidth / aspectRatio;
    }
    if (!Number.isFinite(stageHeight) || stageHeight <= 0) {
      stageHeight = defaultHeight;
    }
    if (!Number.isFinite(stageWidth) || stageWidth <= 0) {
      stageWidth = DEFAULT_STAGE_WIDTH;
    }
    if (!Number.isFinite(stageHeight) || stageHeight <= 0) {
      stageHeight = DEFAULT_STAGE_HEIGHT;
    }
    stage.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`);
    stage.setAttribute('width', String(stageWidth));
    stage.setAttribute('height', String(stageHeight));
    debug('Debug: venn stage sizing resolved', {
      stageWidth,
      stageHeight,
      scaleWidth: scaleInfo.width,
      scaleHeight: scaleInfo.height,
      svgBoxWidth: svgBoxRect?.width,
      svgBoxHeight: svgBoxRect?.height,
      defaultWidth,
      defaultHeight,
      aspectRatio
    });
    const fontFamily = chartStyle.FONT_FAMILY || stage.getAttribute('font-family') || 'Arial, Helvetica, sans-serif';
    const textColor = chartStyle.TEXT_COLOR || '#000000';
    stage.setAttribute('font-family', fontFamily);
    stage.setAttribute('color', textColor);
    stage.setAttribute('font-size', String(style.fontSizePx));
    debug('Debug: venn stage font applied', {
      fontFamily,
      textColor,
      fontSizePx: style.fontSizePx,
      fontSizePt: style.fontPt
    }); // Debug: stage font sync
    return {
      stage,
      svgBox,
      svgBoxRect,
      stageWidth,
      stageHeight,
      fontFamily,
      textColor
    };
  }

  function renderPlotTitle({ stageWidth, stageHeight, fontFamily, textColor, fontSizePx, defaultText }) {
    const titlePadding = Math.max(fontSizePx * 2, 28);
    const defaultTitleX = stageWidth / 2;
    const defaultTitleY = Math.max(fontSizePx * 1.6, titlePadding * 0.55);
    const titlePos = state.labelPositions?.title;
    let absoluteTitleX = defaultTitleX;
    let absoluteTitleY = defaultTitleY;
    if (titlePos) {
      if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
        absoluteTitleX = titlePos.relX * stageWidth;
        absoluteTitleY = titlePos.relY * stageHeight;
      } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
        absoluteTitleX = titlePos.x;
        absoluteTitleY = titlePos.y;
      }
    }
    const titleText = makeEl('text', {
      x: absoluteTitleX,
      y: absoluteTitleY,
      'text-anchor': 'middle',
      'font-size': fontSizePx,
      fill: textColor,
      'font-family': fontFamily
    });
    const fallback = defaultText || DEFAULT_VENN_TITLE;
    titleText.textContent = state.titleText != null ? String(state.titleText) : fallback;
    markFontEditable(titleText, 'graphTitle', 'graphTitle');
    const applyTitle = value => {
      const nextValue = value != null ? String(value) : '';
      state.titleText = nextValue;
      if(titleText.textContent !== nextValue){
        titleText.textContent = nextValue;
      }
      if(typeof state.ui.scheduleDraw === 'function'){
        state.ui.scheduleDraw();
      }
    };
    makeEditable(titleText, txt => {
      const previousValue = state.titleText != null ? String(state.titleText) : '';
      const nextValue = txt != null ? String(txt) : '';
      if(previousValue === nextValue){
        return;
      }
      applyTitle(nextValue);
      recordVennTitleChange(previousValue, nextValue, applyTitle);
    });
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(titleText, state.ui.stage, {
        onDragEnd: pos => {
          const relX = pos.x / stageWidth;
          const relY = pos.y / stageHeight;
          state.labelPositions.title = {
            x: pos.x,
            y: pos.y,
            relX,
            relY
          };
          debugLog('venn title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    return { titleText, titlePadding };
  }

  function fitAndDraw(d, style, labels, counts) {
    const metrics = configureStage(style);
    if (!metrics) return;
    const { stage, svgBox, svgBoxRect, stageWidth, stageHeight, fontFamily, textColor } = metrics;
    const { titlePadding } = renderPlotTitle({
      stageWidth,
      stageHeight,
      fontFamily,
      textColor,
      fontSizePx: style.fontSizePx,
      defaultText: DEFAULT_VENN_TITLE
    });
    const tooltip = state.ui.tooltip;
    const W = stageWidth;
    const H = stageHeight;
    const layoutTop = titlePadding;
    const layoutHeight = Math.max(stageHeight - titlePadding, Math.max(stageHeight * 0.6, style.fontSizePx * 12));
    const pad = 20;
    const labelPad = style.fontSizePx * 2;
    const xs = [d.Ax - d.rA, d.Ax + d.rA, d.Bx - d.rB, d.Bx + d.rB];
    const ys = [d.Ay - d.rA, d.Ay + d.rA, d.By - d.rB, d.By + d.rB];
    if (counts.nC > 0) { xs.push(d.Cx - d.rC, d.Cx + d.rC); ys.push(d.Cy - d.rC, d.Cy + d.rC); }
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    const scale = Math.min((W - 2 * pad) / Math.max(1e-6, maxX - minX), (layoutHeight - 2 * labelPad) / Math.max(1e-6, maxY - minY));
    const tx = (W - scale * (minX + maxX)) / 2;
    const ty = layoutTop + (layoutHeight - 2 * labelPad - scale * (minY + maxY)) / 2 + labelPad;
    function toPx(x, y) { return { x: x * scale + tx, y: y * scale + ty }; }
    const circles = [{ id: 'A', x: d.Ax, y: d.Ay, r: d.rA, color: style.colorA }, { id: 'B', x: d.Bx, y: d.By, r: d.rB, color: style.colorB }];
    if (counts.nC > 0) circles.push({ id: 'C', x: d.Cx, y: d.Cy, r: d.rC, color: style.colorC });
    for (const c of circles) {
      const p = toPx(c.x, c.y);
      makeEl('circle', { cx: p.x, cy: p.y, r: c.r * scale, fill: c.color, 'fill-opacity': style.opacity, stroke: style.borderColor, 'stroke-width': style.borderWidth });
    }
    function addText(txt, x, y, regionCode, meta) {
      const t = makeEl('text', {
        x,
        y,
        'font-size': style.fontSizePx,
        'text-anchor': 'middle',
        fill: textColor,
        'font-family': fontFamily
      });
      t.textContent = txt;
      const resolvedRole = meta?.role || (regionCode ? 'regionLabel' : 'label');
      const resolvedKey = meta?.key || (regionCode ? `region-${regionCode}` : null);
      markFontEditable(t, resolvedRole, resolvedKey);
      if (regionCode && tooltip) {
        t.addEventListener('mouseenter', e => {
          const genes = getRegionText(regionCode).split(/\n/).filter(g => g);
          tooltip.innerHTML = genes.map(g => '<div>' + g + '</div>').join('');
          tooltip.style.fontSize = '12px';
          tooltip.style.maxHeight = 'none';
          tooltip.style.maxWidth = 'none';
          tooltip.style.overflow = 'visible';
          tooltip.style.width = 'auto';
          tooltip.style.height = 'auto';
          const lineHeight = parseFloat(getComputedStyle(tooltip).lineHeight);
          const tempSpan = document.createElement('span');
          tempSpan.style.visibility = 'hidden';
          tempSpan.style.position = 'absolute';
          tempSpan.style.fontSize = '12px';
          tempSpan.style.whiteSpace = 'pre';
          document.body.appendChild(tempSpan);
          let longestWidth = 0;
          genes.forEach(g => { tempSpan.textContent = g; const w = tempSpan.getBoundingClientRect().width; if (w > longestWidth) longestWidth = w; });
          document.body.removeChild(tempSpan);
          const columnGap = 12;
          const columnWidth = Math.ceil(longestWidth) + 16;
          const maxWidth = window.innerWidth - 16, maxHeight = window.innerHeight - 16;
          const maxCols = Math.max(1, Math.floor((maxWidth + columnGap) / (columnWidth + columnGap)));
          const maxRows = Math.max(1, Math.floor(maxHeight / lineHeight));
          let columns = Math.min(maxCols, Math.ceil(genes.length / maxRows));
          let rowsPerCol = Math.ceil(genes.length / columns);
          const width = columns * columnWidth + (columns - 1) * columnGap;
          const height = rowsPerCol * lineHeight;
          tooltip.style.columnCount = columns;
          tooltip.style.columnWidth = columnWidth + 'px';
          tooltip.style.columnGap = columnGap + 'px';
          tooltip.style.width = width + 'px';
          tooltip.style.height = height + 'px';
          const box = e.target.getBoundingClientRect();
          let left = box.right + window.scrollX + 8;
          let top = box.top + window.scrollY;
          tooltip.style.left = left + 'px';
          tooltip.style.top = top + 'px';
          tooltip.style.display = 'block';
          positionTooltip(left, top);
        });
        t.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });
      }
      enableDrag(t);
      return t;
    }
    const labelBoxes = [];
    function placeCircleLabel(circle, label, count) {
      const center = toPx(circle.x, circle.y);
      const others = circles.filter(c => c.id !== circle.id);
      const isTop = others.every(o => circle.y <= o.y);
      const margin = style.fontSizePx * 0.6;
      let y = center.y + (isTop ? -(circle.r * scale + margin) : (circle.r * scale + margin));
      const t = addText(label + ' (' + count + ')', center.x, y, null, { role: 'setLabel', key: circle?.id ? `set-${circle.id}` : 'setLabel' });
      let box = t.getBBox();
      for (const b of labelBoxes) {
        while (!(box.x + box.width < b.x || b.x + b.width < box.x || box.y + box.height < b.y || b.y + b.height < box.y)) {
          y += isTop ? -style.fontSizePx : style.fontSizePx;
          t.setAttribute('y', y);
          box = t.getBBox();
        }
      }
      const minYBound = style.fontSizePx;
      const maxYBound = H - style.fontSizePx;
      if (box.y < minYBound) {
        y += minYBound - box.y;
        t.setAttribute('y', y);
        box = t.getBBox();
      }
      if (box.y + box.height > maxYBound) {
        y -= box.y + box.height - maxYBound;
        t.setAttribute('y', y);
        box = t.getBBox();
      }
      labelBoxes.push(box);
    }
    placeCircleLabel({ id: 'A', x: d.Ax, y: d.Ay, r: d.rA }, labels.A, counts.nA);
    placeCircleLabel({ id: 'B', x: d.Bx, y: d.By, r: d.rB }, labels.B, counts.nB);
    if (counts.nC > 0) placeCircleLabel({ id: 'C', x: d.Cx, y: d.Cy, r: d.rC }, labels.C, counts.nC);
    const cA = toPx(d.Ax, d.Ay), cB = toPx(d.Bx, d.By), cC = toPx(d.Cx, d.Cy);
    const rAp = d.rA * scale, rBp = d.rB * scale, rCp = d.rC * scale;
    const hasC = counts.nC > 0;
    if (counts.Aonly) {
      const p = _findRegionLabelPoint('A', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.Aonly), p.x, p.y, 'A', { role: 'regionLabel', key: 'region-A' });
    }
    if (counts.Bonly) {
      const p = _findRegionLabelPoint('B', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.Bonly), p.x, p.y, 'B', { role: 'regionLabel', key: 'region-B' });
    }
    if (hasC && counts.Conly) {
      const p = _findRegionLabelPoint('C', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.Conly), p.x, p.y, 'C', { role: 'regionLabel', key: 'region-C' });
    }
    if (counts.AB) {
      const p = _findRegionLabelPoint('AB', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.AB), p.x, p.y, 'AB', { role: 'regionLabel', key: 'region-AB' });
    }
    if (hasC && counts.AC) {
      const p = _findRegionLabelPoint('AC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.AC), p.x, p.y, 'AC', { role: 'regionLabel', key: 'region-AC' });
    }
    if (hasC && counts.BC) {
      const p = _findRegionLabelPoint('BC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.BC), p.x, p.y, 'BC', { role: 'regionLabel', key: 'region-BC' });
    }
    if (hasC && counts.ABC) {
      const p = _findRegionLabelPoint('ABC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.ABC), p.x, p.y, 'ABC', { role: 'regionLabel', key: 'region-ABC' });
    }
    stage.onclick = (evt) => {
      const pt = stage.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY; const loc = pt.matrixTransform(stage.getScreenCTM().inverse());
      const inA = Math.hypot(loc.x - cA.x, loc.y - cA.y) <= rAp;
      const inB = Math.hypot(loc.x - cB.x, loc.y - cB.y) <= rBp;
      const inC = (counts.nC > 0) && Math.hypot(loc.x - cC.x, loc.y - cC.y) <= rCp;
      let region = null;
      if (inA && !inB && !inC) region = 'A';
      else if (!inA && inB && !inC) region = 'B';
      else if (!inA && !inB && inC) region = 'C';
      else if (inA && inB && !inC) region = 'AB';
      else if (inA && inC && !inB) region = 'AC';
      else if (inB && inC && !inA) region = 'BC';
      else if (inA && inB && inC) region = 'ABC';
      if (region && state.ui.regionSelect) {
        state.ui.regionSelect.value = region;
        populateRegion(region);
        syncActiveVennPayload('venn-region-hit');
      }
    };
    ensureGraphViewport(stage, { padding: Math.max(style.fontSizePx || 12, 20), debugLabel: 'venn-diagram' });
    if(typeof chartStyle.applyTextAspectCorrection === 'function'){
      chartStyle.applyTextAspectCorrection({
        svg: stage,
        svgBox,
        viewBoxWidth: stageWidth,
        viewBoxHeight: stageHeight,
        displayWidth: svgBoxRect?.width,
        displayHeight: svgBoxRect?.height,
        debugLabel: 'venn-text-correction'
      });
    }
  }

  function formatCount(value) {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    if (typeof chartStyle.formatAxisValue === 'function') {
      return chartStyle.formatAxisValue(value, { notation: 'decimal', maxDecimals: 0 });
    }
    return value.toLocaleString('en-US');
  }

  function getUpSetPalette() {
    const palette = Shared.palette = Shared.palette || {};
    if (typeof palette.ensureDefaultScatterColors !== 'function' && typeof require === 'function') {
      try {
        require('../shared/palette.js');
      } catch (err) {
        // ignore palette preload failures
      }
    }
    const fallback = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'];
    const resolved = typeof palette.ensureDefaultScatterColors === 'function'
      ? palette.ensureDefaultScatterColors()
      : (Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length
        ? palette.DEFAULT_SCATTER_COLORS
        : fallback);
    palette.DEFAULT_SCATTER_COLORS = resolved;
    return resolved;
  }

  function indexToSetKey(index) {
    if (Number.isInteger(index) && index >= 0 && index < 26) {
      return String.fromCharCode(65 + index);
    }
    if (Number.isInteger(index) && index >= 0) {
      return `S${index + 1}`;
    }
    return 'S';
  }

  function shouldUseLegacyIntersectionCodes(sets) {
    if (!Array.isArray(sets) || sets.length > 3 || sets.length === 0) {
      return false;
    }
    return sets.every((set, idx) => {
      const expected = String.fromCharCode(65 + idx);
      return set && typeof set.key === 'string' && set.key === expected;
    });
  }

  function buildUpSetSetsFromColumns(columns, caseSensitive, style) {
    const palette = getUpSetPalette();
    return (columns || []).map((column, idx) => {
      const values = Array.isArray(column?.values) ? column.values : [];
      const uniqueKeys = new Set();
      values.forEach(value => {
        const normalized = String(value).trim();
        if (!normalized) {
          return;
        }
        const key = caseSensitive ? normalized : normalized.toLowerCase();
        uniqueKeys.add(key);
      });
      let color = '#666666';
      if (idx === 0 && style.colorA) color = style.colorA;
      else if (idx === 1 && style.colorB) color = style.colorB;
      else if (idx === 2 && style.colorC) color = style.colorC;
      else if (palette.length) {
        const paletteIndex = idx >= 3 ? (idx - 3) : idx;
        color = palette[paletteIndex % palette.length];
      }
      return {
        key: indexToSetKey(idx),
        label: column?.label || `Set ${idx + 1}`,
        size: uniqueKeys.size,
        color,
        keys: uniqueKeys,
        sourceIndex: Number.isFinite(column?.index) ? column.index : idx
      };
    });
  }

  function buildUpSetIntersectionsFromCounts(counts, hasC) {
    const intersections = [
      { code: 'A', sets: ['A'], size: counts.Aonly },
      { code: 'B', sets: ['B'], size: counts.Bonly }
    ];
    if (hasC) {
      intersections.push({ code: 'C', sets: ['C'], size: counts.Conly });
    }
    intersections.push({ code: 'AB', sets: ['A', 'B'], size: counts.AB });
    if (hasC) {
      intersections.push({ code: 'AC', sets: ['A', 'C'], size: counts.AC });
      intersections.push({ code: 'BC', sets: ['B', 'C'], size: counts.BC });
      intersections.push({ code: 'ABC', sets: ['A', 'B', 'C'], size: counts.ABC });
    }
    return intersections.map(entry => ({
      ...entry,
      degree: entry.sets.length
    }));
  }

  function buildUpSetIntersectionsFromSets(sets, options = {}) {
    const setCount = Array.isArray(sets) ? sets.length : 0;
    if (!setCount) {
      return [];
    }
    const membership = new Map();
    sets.forEach((set, idx) => {
      const keys = set?.keys instanceof Set ? set.keys : null;
      if (!keys) return;
      keys.forEach(key => {
        const mask = membership.get(key) || 0n;
        membership.set(key, mask | (1n << BigInt(idx)));
      });
    });
    const intersectionMap = new Map();
    membership.forEach(mask => {
      if (mask === 0n) return;
      const key = mask.toString();
      const entry = intersectionMap.get(key) || { mask, size: 0 };
      entry.size += 1;
      intersectionMap.set(key, entry);
    });

    const showEmpty = options.showEmpty === true;
    if (showEmpty) {
      const maxEmptyCombos = Number.isFinite(options.maxEmptyCombos) ? options.maxEmptyCombos : 512;
      if (setCount <= 20) {
        const totalCombos = 1n << BigInt(setCount);
        if (totalCombos - 1n <= BigInt(maxEmptyCombos)) {
          for (let mask = 1n; mask < totalCombos; mask += 1n) {
            const key = mask.toString();
            if (!intersectionMap.has(key)) {
              intersectionMap.set(key, { mask, size: 0 });
            }
          }
        } else {
          debugLog('upset showEmpty limited', {
            setCount,
            totalCombos: totalCombos.toString(),
            maxEmptyCombos
          });
        }
      } else {
        debugLog('upset showEmpty skipped - too many sets', { setCount });
      }
    }

    const useLegacyCodes = shouldUseLegacyIntersectionCodes(sets);
    const intersections = [];
    intersectionMap.forEach(entry => {
      const activeKeys = [];
      const activeLabels = [];
      for (let idx = 0; idx < setCount; idx += 1) {
        if ((entry.mask >> BigInt(idx)) & 1n) {
          activeKeys.push(sets[idx].key);
          activeLabels.push(sets[idx].label);
        }
      }
      const code = useLegacyCodes ? activeKeys.join('') : activeKeys.join('&');
      const label = activeLabels.join(' & ');
      intersections.push({
        code,
        label,
        sets: activeKeys,
        size: entry.size,
        degree: activeKeys.length,
        mask: entry.mask.toString()
      });
    });
    return intersections;
  }

  function resolveUpSetTableData(parsed, labels, style) {
    const caseSensitive = parsed?.caseSensitive === true
      || (state.ui.inputs?.caseSensitive?.checked === true);
    const tableInfo = getUpSetTableColumns();
    let columns = tableInfo.columns || [];
    let source = tableInfo.source || 'table';
    if (!columns.length) {
      columns = [
        { index: 0, label: labels.A, values: (parsed?.lists?.A || []).map(item => item.val || item.key) },
        { index: 1, label: labels.B, values: (parsed?.lists?.B || []).map(item => item.val || item.key) },
        { index: 2, label: labels.C, values: (parsed?.lists?.C || []).map(item => item.val || item.key) }
      ];
      source = 'lists';
    }
    const sets = buildUpSetSetsFromColumns(columns, caseSensitive, style);
    debugLog('upset sets resolved', { source, setCount: sets.length });
    return {
      sets,
      needsIntersectionBuild: true,
      canSelectRegion: sets.length <= 3
    };
  }

  function drawUpSet(counts, labels, style, options = {}) {
    const metrics = configureStage(style);
    if (!metrics) return;
    const { stage, svgBox, svgBoxRect, stageWidth, stageHeight, fontFamily, textColor } = metrics;
    stage.onclick = null;
    const { titlePadding } = renderPlotTitle({
      stageWidth,
      stageHeight,
      fontFamily,
      textColor,
      fontSizePx: style.fontSizePx,
      defaultText: DEFAULT_UPSET_TITLE
    });
    const topPadding = Math.max(titlePadding, style.fontSizePx * 2.6 + 8);

    const settings = { ...DEFAULT_UPSET_SETTINGS, ...resolveUpSetSettings(), ...(style.upset || {}) };
    const upsetData = options?.upsetData || null;
    let sets = [];
    let allIntersections = [];
    let canSelectRegion = true;
    if (upsetData && Array.isArray(upsetData.sets) && upsetData.sets.length) {
      sets = upsetData.sets;
      canSelectRegion = upsetData.canSelectRegion !== false;
      if (upsetData.needsIntersectionBuild) {
        allIntersections = buildUpSetIntersectionsFromSets(sets, { showEmpty: settings.showEmpty });
      } else if (Array.isArray(upsetData.intersections)) {
        allIntersections = upsetData.intersections.slice();
      }
    } else {
      const hasC = !!(counts.nC || counts.AC || counts.BC || counts.ABC);
      sets = [
        { key: 'A', label: labels.A, size: counts.nA, color: style.colorA },
        { key: 'B', label: labels.B, size: counts.nB, color: style.colorB }
      ];
      if (hasC) {
        sets.push({ key: 'C', label: labels.C, size: counts.nC, color: style.colorC });
      }
      allIntersections = buildUpSetIntersectionsFromCounts(counts, hasC);
    }
    let intersections = allIntersections.slice();
    if (!(upsetData && upsetData.needsIntersectionBuild) && !settings.showEmpty) {
      intersections = allIntersections.filter(entry => entry.size > 0);
    }

    if (!intersections.length) {
      const emptyText = makeEl('text', {
        x: stageWidth / 2,
        y: stageHeight / 2,
        'text-anchor': 'middle',
        'font-size': style.fontSizePx * 1.1,
        fill: textColor
      });
      emptyText.textContent = 'No intersections to display';
      ensureGraphViewport(stage, { padding: Math.max(style.fontSizePx || 12, 20), debugLabel: 'upset-empty' });
      return;
    }

    const sortMode = settings.sort;
    if (sortMode && sortMode !== 'input') {
      intersections.sort((a, b) => {
        if (sortMode === 'size-asc') return a.size - b.size || a.degree - b.degree;
        if (sortMode === 'size-desc') return b.size - a.size || b.degree - a.degree;
        if (sortMode === 'degree-asc') return a.degree - b.degree || b.size - a.size;
        if (sortMode === 'degree-desc') return b.degree - a.degree || b.size - a.size;
        return 0;
      });
    }

    const maxIntersections = Number.isFinite(settings.maxIntersections) ? settings.maxIntersections : DEFAULT_UPSET_SETTINGS.maxIntersections;
    let limited = intersections;
    if (Number.isFinite(maxIntersections) && maxIntersections > 0 && intersections.length > maxIntersections) {
      limited = intersections.slice(0, maxIntersections);
    }

    const regionSelect = canSelectRegion ? state.ui.regionSelect : null;
    const regionOptions = regionSelect
      ? new Set(Array.from(regionSelect.options || []).map(option => option.value))
      : null;
    const selectedRegion = regionSelect && regionOptions?.has(regionSelect.value)
      ? regionSelect.value
      : '';
    if (selectedRegion) {
      const selectedEntry = allIntersections.find(entry => entry.code === selectedRegion);
      if (selectedEntry && !limited.some(entry => entry.code === selectedRegion)) {
        if (Number.isFinite(maxIntersections) && maxIntersections > 0 && limited.length >= maxIntersections) {
          limited[limited.length - 1] = selectedEntry;
        } else {
          limited.push(selectedEntry);
        }
      }
    }
    intersections = limited;

    const pad = 20;
    const gap = Math.max(style.fontSizePx * 0.8, 12);
    const setAxisHeight = Math.max(style.fontSizePx * 1.8, 18);
    const innerHeight = Math.max(stageHeight - topPadding - pad, style.fontSizePx * 10);
    const contentHeight = Math.max(innerHeight - setAxisHeight, style.fontSizePx * 8);

    let rowHeight = Math.max(settings.dotSize * 2.6, style.fontSizePx * 1.4);
    let matrixHeight = rowHeight * sets.length;
    let barChartHeight = contentHeight - matrixHeight - gap;
    if (barChartHeight < style.fontSizePx * 4) {
      barChartHeight = Math.max(style.fontSizePx * 4, contentHeight * 0.5);
      const remaining = Math.max(contentHeight - barChartHeight - gap, style.fontSizePx * 2);
      rowHeight = Math.max(remaining / sets.length, style.fontSizePx * 1.1);
      matrixHeight = rowHeight * sets.length;
    }

    const barTop = topPadding;
    const barBottom = barTop + barChartHeight;
    const matrixTop = barBottom + gap;
    const matrixBottom = matrixTop + matrixHeight;

    const contentWidth = Math.max(stageWidth - pad * 2, style.fontSizePx * 12);
    const labelFont = `${Math.round(style.fontSizePx * 0.9)}px ${fontFamily}`;
    const countFont = `${Math.round(style.fontSizePx * 0.8)}px ${fontFamily}`;
    const measure = (text, font) => {
      if (typeof chartStyle.measureText === 'function') {
        return chartStyle.measureText(text || '', font);
      }
      return (text || '').length * style.fontSizePx * 0.6;
    };
    const maxLabelWidth = Math.max(...sets.map(set => measure(set.label, labelFont)), 0);
    let labelAreaWidth = Math.min(Math.max(maxLabelWidth + 8, 50), contentWidth * 0.35);
    const maxSetSize = Math.max(...sets.map(set => set.size), 0);
    const countAreaWidth = settings.showSetCounts ? measure(formatCount(maxSetSize), countFont) + 6 : 0;
    const barLabelGap = 8;

    const minColumnWidth = Math.max(settings.dotSize * 2.6, style.fontSizePx * 1.4);
    const columnCount = Math.max(1, intersections.length);
    const minMatrixWidth = minColumnWidth * columnCount;

    let setBarAreaWidth = Math.min(Math.max(contentWidth * 0.2, 80), contentWidth * 0.4);
    let matrixWidth = contentWidth - setBarAreaWidth - labelAreaWidth - countAreaWidth - gap - barLabelGap;
    if (matrixWidth < minMatrixWidth) {
      const shortage = minMatrixWidth - matrixWidth;
      const reducibleSet = Math.max(0, setBarAreaWidth - 60);
      const reduceSet = Math.min(shortage, reducibleSet);
      setBarAreaWidth -= reduceSet;
      matrixWidth = contentWidth - setBarAreaWidth - labelAreaWidth - countAreaWidth - gap - barLabelGap;
    }
    if (matrixWidth < minMatrixWidth) {
      const shortage = minMatrixWidth - matrixWidth;
      const reducibleLabel = Math.max(0, labelAreaWidth - 40);
      const reduceLabel = Math.min(shortage, reducibleLabel);
      labelAreaWidth -= reduceLabel;
      matrixWidth = contentWidth - setBarAreaWidth - labelAreaWidth - countAreaWidth - gap - barLabelGap;
    }
    matrixWidth = Math.max(matrixWidth, minColumnWidth);
    const columnWidth = matrixWidth / columnCount;

    const barAreaWidth = Math.max(10, setBarAreaWidth);
    const countX = pad;
    const setBarX = countX + countAreaWidth;
    const labelX = setBarX + barAreaWidth + barLabelGap;
    const matrixX = labelX + labelAreaWidth + gap;

    const axisColor = chartStyle.TEXT_COLOR || '#000000';
    const axisMetrics = typeof chartStyle.createAxisMetrics === 'function'
      ? chartStyle.createAxisMetrics(style.fontSizePx)
      : {
          tickLength: 6,
          tickLabelGap: Math.max(3, Math.round(style.fontSizePx * 0.35)),
          axisTitleGap: Math.max(4, Math.round(style.fontSizePx * 0.75))
        };
    const tickLength = axisMetrics.tickLength ?? 6;
    const tickLabelGap = axisMetrics.tickLabelGap ?? Math.max(3, Math.round(style.fontSizePx * 0.35));
    const axisTitleGap = axisMetrics.axisTitleGap ?? Math.max(4, Math.round(style.fontSizePx * 0.75));
    const axisWidth = typeof chartStyle.scaleStrokeWidth === 'function'
      ? chartStyle.scaleStrokeWidth(1, style.scaleInfo, { min: 0.6, max: 2.5, context: 'upset-axis' })
      : 1;
    const activeMarkOpacity = clampNumber(style.opacity, 1, 0.05, 1);
    const setTickFontSize = Math.round(style.fontSizePx * 0.75);
    const setAxisLabelFontSize = Math.round(style.fontSizePx * 0.85);
    const setTickOffset = Math.max(1, Math.round(style.fontSizePx * 0.08));
    const setTitleGap = Math.max(2, Math.round((axisTitleGap + 1) * 0.45));
    const setTickTextHeight = Math.max(8, Math.round(setTickFontSize * 0.95));
    const setAxisLabelHeight = Math.max(9, Math.round(setAxisLabelFontSize * 0.95));
    const requiredSetAxisBottomSpace = tickLength + setTickOffset + setTickTextHeight + setTitleGap + setAxisLabelHeight + 4;
    const axisYPreferred = matrixBottom + setAxisHeight * 0.35;
    const axisYMin = matrixBottom + Math.max(2, Math.round(style.fontSizePx * 0.2));
    const axisYMax = stageHeight - requiredSetAxisBottomSpace;
    const axisY = axisYMax >= axisYMin
      ? Math.min(axisYMax, Math.max(axisYMin, axisYPreferred))
      : axisYMin;
    const setTickLabelY = axisY + tickLength + setTickOffset;
    const setAxisLabelY = setTickLabelY + setTickTextHeight + setTitleGap;

    if (settings.showGrid && settings.gridColor) {
      sets.forEach((set, idx) => {
        if (idx % 2 === 1) {
          makeEl('rect', {
            x: matrixX,
            y: matrixTop + idx * rowHeight,
            width: matrixWidth,
            height: rowHeight,
            fill: settings.gridColor,
            'fill-opacity': 0.25
          });
        }
      });
    }

    const maxIntersection = Math.max(...intersections.map(entry => entry.size), 0) || 1;
    const tickCount = 4;
    const tickValues = Array.from({ length: tickCount + 1 }, (_, i) => Math.round(maxIntersection * i / tickCount));
    const tickLabels = tickValues.map(v => formatCount(v));
    const maxTickLabelWidth = Math.max(...tickLabels.map(lbl => measure(lbl, countFont)), 0);
    const axisX = Math.max(pad + 6, matrixX - (tickLength + tickLabelGap + maxTickLabelWidth + 6));

    makeEl('line', {
      x1: axisX,
      y1: barTop,
      x2: axisX,
      y2: barBottom,
      stroke: axisColor,
      'stroke-width': axisWidth
    });

    tickValues.forEach((value, idx) => {
      const y = barBottom - (value / maxIntersection) * barChartHeight;
      makeEl('line', {
        x1: axisX,
        y1: y,
        x2: axisX - tickLength,
        y2: y,
        stroke: axisColor,
        'stroke-width': axisWidth
      });
      if (settings.showGrid && settings.gridColor) {
        makeEl('line', {
          x1: matrixX,
          y1: y,
          x2: matrixX + matrixWidth,
          y2: y,
          stroke: settings.gridColor,
          'stroke-width': 1
        });
      }
      const tickText = makeEl('text', {
        x: axisX - tickLength - tickLabelGap,
        y,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        'font-size': Math.round(style.fontSizePx * 0.8),
        fill: textColor
      });
      tickText.textContent = tickLabels[idx];
    });

    const axisLabelX = Math.max(
      pad * 0.5,
      axisX - (tickLength + tickLabelGap + maxTickLabelWidth + axisTitleGap + style.fontSizePx * 0.2)
    );
    const intersectionAxisLabelY = barTop + barChartHeight / 2;
    const axisLabel = makeEl('text', {
      x: axisLabelX,
      y: intersectionAxisLabelY,
      'text-anchor': 'middle',
      'font-size': Math.round(style.fontSizePx * 0.85),
      fill: textColor
    });
    axisLabel.textContent = 'Intersection Size';
    axisLabel.setAttribute('transform', `rotate(-90 ${axisLabelX} ${intersectionAxisLabelY})`);

    intersections.forEach((entry, idx) => {
      const columnCenter = matrixX + columnWidth * (idx + 0.5);
      const barWidth = Math.max(4, columnWidth * 0.6);
      const barHeight = (entry.size / maxIntersection) * barChartHeight;
      const barX = columnCenter - barWidth / 2;
      const barY = barBottom - barHeight;
      const isSelected = entry.code === selectedRegion;
      const canSelectEntry = !!(regionOptions && regionOptions.has(entry.code));
      if (isSelected) {
        makeEl('rect', {
          x: columnCenter - columnWidth / 2,
          y: barTop,
          width: columnWidth,
          height: matrixBottom - barTop,
          fill: settings.gridColor || '#cbd5f5',
          'fill-opacity': 0.18
        });
      }
      const bar = makeEl('rect', {
        x: barX,
        y: barY,
        width: barWidth,
        height: Math.max(0, barHeight),
        fill: settings.barColor,
        'fill-opacity': style.opacity,
        stroke: axisColor,
        'stroke-width': Math.max(0.5, axisWidth * 0.75),
        cursor: canSelectEntry ? 'pointer' : 'default'
      });
      const barTitle = document.createElementNS(NS, 'title');
      const entryLabel = entry.label || entry.code;
      barTitle.textContent = `${entryLabel}: ${formatCount(entry.size)}`;
      bar.appendChild(barTitle);
      if (canSelectEntry) {
        bar.addEventListener('click', () => {
          if (state.ui.regionSelect) {
            state.ui.regionSelect.value = entry.code;
            populateRegion(entry.code);
            syncActiveVennPayload('venn-upset-select');
          }
        });
      }
      if (settings.showCounts) {
        const valueText = makeEl('text', {
          x: columnCenter,
          y: barY - 4,
          'text-anchor': 'middle',
          'font-size': Math.round(style.fontSizePx * 0.8),
          fill: textColor
        });
        valueText.textContent = formatCount(entry.size);
      }

      const activeSetKeys = new Set(entry.sets || []);
      const activeIndices = [];
      sets.forEach((set, rowIdx) => {
        if (activeSetKeys.has(set.key)) {
          activeIndices.push(rowIdx);
        }
      });

      const primaryActiveIndex = activeIndices.length ? activeIndices[0] : -1;
      const activeColor = settings.useSetColors && primaryActiveIndex >= 0
        ? (sets[primaryActiveIndex]?.color || settings.dotColor)
        : settings.dotColor;

      sets.forEach((set, rowIdx) => {
        makeEl('circle', {
          cx: columnCenter,
          cy: matrixTop + rowIdx * rowHeight + rowHeight / 2,
          r: settings.dotSize,
          fill: settings.inactiveDotColor,
          opacity: 1
        });
      });

      if (activeIndices.length) {
        const activeGroup = makeEl('g', {
          color: activeColor,
          opacity: activeMarkOpacity
        });

        if (activeIndices.length > 1) {
          const y1 = matrixTop + activeIndices[0] * rowHeight + rowHeight / 2;
          const y2 = matrixTop + activeIndices[activeIndices.length - 1] * rowHeight + rowHeight / 2;
          const connectorWidth = Math.max(0.65, Math.min(settings.dotSize * 0.45, rowHeight * 0.2));
          makeEl('rect', {
            x: columnCenter - connectorWidth / 2,
            y: y1,
            width: connectorWidth,
            height: Math.max(0, y2 - y1),
            fill: 'currentColor',
            rx: connectorWidth / 2,
            ry: connectorWidth / 2
          }, activeGroup);
        }

        activeIndices.forEach(rowIdx => {
          const dot = makeEl('circle', {
            cx: columnCenter,
            cy: matrixTop + rowIdx * rowHeight + rowHeight / 2,
            r: settings.dotSize,
            fill: 'currentColor'
          }, activeGroup);
          if (canSelectEntry) {
            dot.setAttribute('cursor', 'pointer');
            dot.addEventListener('click', () => {
              if (state.ui.regionSelect) {
                state.ui.regionSelect.value = entry.code;
                populateRegion(entry.code);
                syncActiveVennPayload('venn-upset-select');
              }
            });
          }
        });
      }
    });

    sets.forEach((set, idx) => {
      const rowCenter = matrixTop + idx * rowHeight + rowHeight / 2;
      const label = makeEl('text', {
        x: labelX + 2,
        y: rowCenter,
        'text-anchor': 'start',
        'dominant-baseline': 'middle',
        'font-size': Math.round(style.fontSizePx * 0.9),
        fill: textColor
      });
      label.textContent = set.label;
      const barWidth = maxSetSize > 0 ? (set.size / maxSetSize) * barAreaWidth : 0;
      const barHeight = Math.max(settings.dotSize * 1.6, rowHeight * 0.6);
      const barY = rowCenter - barHeight / 2;
      const barFill = settings.useSetColors ? set.color : settings.setBarColor;
      const barX = setBarX + (barAreaWidth - barWidth);
      makeEl('rect', {
        x: barX,
        y: barY,
        width: Math.max(0, barWidth),
        height: barHeight,
        fill: barFill,
        'fill-opacity': style.opacity,
        stroke: axisColor,
        'stroke-width': Math.max(0.5, axisWidth * 0.75)
      });
      if (settings.showSetCounts) {
        const valueText = makeEl('text', {
          x: barX - 6,
          y: rowCenter,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          'font-size': Math.round(style.fontSizePx * 0.8),
          fill: textColor
        });
        valueText.textContent = formatCount(set.size);
      }
    });

    const setAxisX2 = setBarX + barAreaWidth;
    makeEl('line', {
      x1: setBarX,
      y1: axisY,
      x2: setAxisX2,
      y2: axisY,
      stroke: axisColor,
      'stroke-width': axisWidth
    });

    const setTickFractions = Array.from({ length: tickCount + 1 }, (_, i) => i / tickCount);
    setTickFractions.forEach(fraction => {
      const value = Math.round(maxSetSize * fraction);
      const x = setBarX + barAreaWidth - fraction * barAreaWidth;
      makeEl('line', {
        x1: x,
        y1: axisY,
        x2: x,
        y2: axisY + tickLength,
        stroke: axisColor,
        'stroke-width': axisWidth
      });
      const tickText = makeEl('text', {
        x,
        y: setTickLabelY,
        'text-anchor': 'middle',
        'dominant-baseline': 'text-before-edge',
        'font-size': setTickFontSize,
        fill: textColor
      });
      tickText.textContent = formatCount(value);
    });

    const setAxisLabel = makeEl('text', {
      x: setBarX + barAreaWidth / 2,
      y: setAxisLabelY,
      'text-anchor': 'middle',
      'dominant-baseline': 'text-before-edge',
      'font-size': setAxisLabelFontSize,
      fill: textColor
    });
    setAxisLabel.textContent = 'Set Size';

    ensureGraphViewport(stage, { padding: Math.max(style.fontSizePx || 12, 20), debugLabel: 'upset-plot' });
    if(typeof chartStyle.applyTextAspectCorrection === 'function'){
      chartStyle.applyTextAspectCorrection({
        svg: stage,
        svgBox,
        viewBoxWidth: stageWidth,
        viewBoxHeight: stageHeight,
        displayWidth: svgBoxRect?.width,
        displayHeight: svgBoxRect?.height,
        debugLabel: 'upset-text-correction'
      });
    }
    debugLog('drawUpSet complete', {
      intersections: intersections.length,
      sets: sets.length,
      maxIntersection,
      maxSetSize
    });
  }

  function drawFromLists() {
    const parsed = ensureParsedLists({ includeRegions: true, reason: 'drawFromLists' });
    const inputs = ensureInputs();
    const mode = parsed.mode;
    const cs = parsed.caseSensitive;
    const regions = parsed.regions || setsFromLists(parsed.lists.A, parsed.lists.B, parsed.lists.C, state.analysis.lastRegions);
    state.analysis.lastRegions = regions;
    state.analysis.lastDrawMode = 'lists';
    const counts = {
      nA: regions.A.size, nB: regions.B.size, nC: regions.C.size,
      Aonly: regions.Aonly.size, Bonly: regions.Bonly.size, Conly: regions.Conly.size,
      AB: regions.AB.size, AC: regions.AC.size, BC: regions.BC.size, ABC: regions.ABC.size
    };
    state.analysis.lastCounts = counts;
    const countsSignature = makeCountsSignature(counts);
    const lastSig = state.analysis.lastSignificance;
    const shouldClearSignificance = !lastSig || lastSig.countsSignature !== countsSignature;
    if (shouldClearSignificance) {
      if (state.ui.significanceResults) state.ui.significanceResults.innerHTML = '';
      state.analysis.lastSignificance = null;
      debugLog('significance invalidated after list draw', { countsSignature, hadPrevious: !!lastSig });
    } else {
      debugLog('significance preserved after list draw', { countsSignature });
    }
    refreshCounts(counts);
    const fontInfo = resolveFontInfo(inputs.fontsize.value);
    const borderWidthRaw = Number(inputs.borderWidth.value);
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, fontInfo.scaleInfo, { context: 'venn-border', min: 0 });
    const resolvedFontPx = Number.isFinite(fontInfo?.scaledPx) ? fontInfo.scaledPx : Number(fontInfo?.px);
    const fontSizePx = Number.isFinite(resolvedFontPx) ? resolvedFontPx : 12;
    const style = {
      colorA: inputs.colorA.value, colorB: inputs.colorB.value, colorC: inputs.colorC.value,
      opacity: inputs.opacity.value, fontSizePx, fontPt: Number.isFinite(fontInfo?.pt) ? fontInfo.pt : Number(inputs.fontsize.value) || 12,
      borderColor: inputs.borderColor.value, borderWidth: borderWidthPx, borderWidthRaw,
      scaleInfo: fontInfo.scaleInfo,
      fontInfo
    };
    debug('Debug: venn style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      fontScale: fontInfo?.scaleInfo?.styleScale,
      fontSizePx,
      textLocked: fontInfo?.scaleInfo?.textLocked
    });
    chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    const labels = { A: inputs.labelA.value || 'A', B: inputs.labelB.value || 'B', C: inputs.labelC.value || 'C' };
    updateCountLabels(labels);
    updateRegionSelect(labels, counts);
    updateColorLabels(labels);
    const plotType = getActivePlotType();
    if (plotType === 'upset') {
      style.upset = resolveUpSetSettings();
      const upsetData = resolveUpSetTableData(parsed, labels, style);
      drawUpSet(counts, labels, style, { upsetData });
    } else {
      const pairs = { nAB: counts.AB + counts.ABC, nAC: counts.AC + counts.ABC, nBC: counts.BC + counts.ABC };
      const L = layoutFromCounts(counts.nA, counts.nB, counts.nC, pairs.nAB, pairs.nAC, pairs.nBC);
      fitAndDraw(L, style, labels, counts);
    }
    if (state.ui.regionSelect) populateRegion(state.ui.regionSelect.value);
    scheduleSpeciesRecognition('draw-from-lists');
    debugLog('drawFromLists complete', { mode, caseSensitive: cs, counts, cacheSignature: parsed.signature });
  }

  function drawFromNumeric() {
    const inputs = ensureInputs();
    const nA = +inputs.counts.nA.value || 0, nB = +inputs.counts.nB.value || 0, nC = +inputs.counts.nC.value || 0;
    const nAB = +inputs.counts.nAB.value || 0, nAC = +inputs.counts.nAC.value || 0, nBC = +inputs.counts.nBC.value || 0, nABC = +inputs.counts.nABC.value || 0;
    const Aonly = Math.max(0, nA - (nAB + nAC - nABC));
    const Bonly = Math.max(0, nB - (nAB + nBC - nABC));
    const Conly = Math.max(0, nC - (nAC + nBC - nABC));
    const counts = {
      nA, nB, nC, Aonly, Bonly, Conly,
      AB: Math.max(0, nAB - nABC), AC: Math.max(0, nAC - nABC), BC: Math.max(0, nBC - nABC), ABC: nABC
    };
    state.analysis.lastRegions = {
      A: new Set(), B: new Set(), C: new Set(), Aonly: new Set(), Bonly: new Set(), Conly: new Set(),
      AB: new Set(), AC: new Set(), BC: new Set(), ABC: new Set()
    };
    state.analysis.lastDrawMode = 'numeric';
    state.analysis.lastCounts = counts;
    const countsSignature = makeCountsSignature(counts);
    const lastSig = state.analysis.lastSignificance;
    const shouldClearSignificance = !lastSig || lastSig.countsSignature !== countsSignature;
    if (shouldClearSignificance) {
      if (state.ui.significanceResults) state.ui.significanceResults.innerHTML = '';
      state.analysis.lastSignificance = null;
      debugLog('significance invalidated after numeric draw', { countsSignature, hadPrevious: !!lastSig });
    } else {
      debugLog('significance preserved after numeric draw', { countsSignature });
    }
    refreshCounts(counts);
    const fontInfo = resolveFontInfo(inputs.fontsize.value);
    const borderWidthRaw = Number(inputs.borderWidth.value);
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, fontInfo.scaleInfo, { context: 'venn-border', min: 0 });
    const resolvedFontPx = Number.isFinite(fontInfo?.scaledPx) ? fontInfo.scaledPx : Number(fontInfo?.px);
    const fontSizePx = Number.isFinite(resolvedFontPx) ? resolvedFontPx : 12;
    const style = {
      colorA: inputs.colorA.value, colorB: inputs.colorB.value, colorC: inputs.colorC.value,
      opacity: inputs.opacity.value, fontSizePx, fontPt: Number.isFinite(fontInfo?.pt) ? fontInfo.pt : Number(inputs.fontsize.value) || 12,
      borderColor: inputs.borderColor.value, borderWidth: borderWidthPx, borderWidthRaw,
      scaleInfo: fontInfo.scaleInfo,
      fontInfo
    };
    debug('Debug: venn style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      fontScale: fontInfo?.scaleInfo?.styleScale,
      fontSizePx,
      textLocked: fontInfo?.scaleInfo?.textLocked
    });
    chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    const labels = { A: inputs.labelA.value || 'A', B: inputs.labelB.value || 'B', C: inputs.labelC.value || 'C' };
    updateCountLabels(labels);
    updateRegionSelect(labels, counts);
    updateColorLabels(labels);
    const plotType = getActivePlotType();
    if (plotType === 'upset') {
      style.upset = resolveUpSetSettings();
      drawUpSet(counts, labels, style);
    } else {
      const L = layoutFromCounts(nA, nB, nC, nAB, nAC, nBC);
      fitAndDraw(L, style, labels, counts);
    }
    if (state.ui.regionSelect) populateRegion(state.ui.regionSelect.value);
    cancelPendingSpeciesDetection('draw-from-numeric', { abortActive: true, resetIndicator: true });
    debugLog('drawFromNumeric complete', { counts });
  }

  function hasListContent(inputs) {
    if (!inputs) return false;
    const present = ['A', 'B', 'C'].some(key => {
      const value = inputs[key]?.value || '';
      return typeof value === 'string' && value.trim().length > 0;
    });
    debug('Debug: venn hasListContent check', { present }); // Debug: list content detection
    return present;
  }

  function hasNumericContent(inputs) {
    if (!inputs) return false;
    const present = Object.values(inputs.counts || {}).some(input => {
      const raw = input?.value;
      if (raw === '' || raw === null || typeof raw === 'undefined') return false;
      const num = Number(raw);
      return Number.isFinite(num) && num > 0;
    });
    debug('Debug: venn hasNumericContent check', { present }); // Debug: numeric content detection
    return present;
  }

  function refreshDiagram() {
    const inputs = state.ui.inputs;
    if (!inputs) {
      console.warn('Debug: venn refreshDiagram called before init');
      return;
    }
    try {
      const hasLists = hasListContent(inputs);
      const hasNumeric = hasNumericContent(inputs);
      const hintedMode = state.analysis.lastDrawMode;
      const modePreference = (
        (hintedMode === 'lists' && hasLists) || (hintedMode === 'numeric' && hasNumeric)
      )
        ? hintedMode
        : null;
      const mode = modePreference || (hasLists ? 'lists' : (hasNumeric ? 'numeric' : null));
      if (!mode) {
        clearSVG();
        if (state.ui.regionList) state.ui.regionList.innerHTML = '';
        if (state.ui.copyRegionBtn) state.ui.copyRegionBtn.style.display = 'none';
        state.analysis.lastRegions = null;
        state.analysis.lastCounts = null;
        state.analysis.lastParsedLists = null;
        state.analysis.lastDrawMode = null;
        if (state.analysis.lastSignificance) {
          state.analysis.lastSignificance = null;
          if (state.ui.significanceResults) state.ui.significanceResults.innerHTML = '';
          debugLog('significance cleared during empty refresh');
        }
        debugLog('refreshDiagram skipped', { reason: 'no-data', hasLists, hasNumeric });
        return;
      }
      if (mode === 'numeric') {
        drawFromNumeric();
      } else {
        drawFromLists();
      }
      debugLog('refreshDiagram executed', { mode });
    } catch (err) {
      console.error('venn refreshDiagram error', err);
    }
  }

  function requestScheduledDraw(reason, modeOverride) {
    if (modeOverride) {
      state.analysis.lastDrawMode = modeOverride;
    }
    if (typeof state.ui.scheduleDraw === 'function') {
      debug('Debug: venn auto-redraw scheduled', { reason, mode: state.analysis.lastDrawMode }); // Debug: automatic redraw trigger
      state.ui.scheduleDraw();
    } else {
      debug('Debug: venn auto-redraw fallback', { reason, mode: state.analysis.lastDrawMode }); // Debug: fallback without scheduler
      refreshDiagram();
    }
  }

  const STYLE_KEY = 'vennStylePrefs';
  const STYLE_VERSION = 3;
  const LEGACY_DEFAULT_FONT_PT = 17;

  function loadStylePrefs() {
    const inputs = state.ui.inputs;
    if (!inputs) return;
    try {
      const raw = localStorage.getItem(STYLE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      const savedVersion = saved && Number.isFinite(Number(saved.version)) ? Number(saved.version) : 1;
      let migrated = false;
      let savedFontValue = saved && typeof saved.fontsize !== 'undefined' ? saved.fontsize : null;
      if (saved && savedVersion < STYLE_VERSION) {
        const numeric = Number(savedFontValue);
        const basePt = chartStyle.BASE_FONT_SIZE_PT || Number(inputs.fontsize.value) || 13;
        if (!Number.isFinite(numeric) || Math.round(numeric) === Math.round(LEGACY_DEFAULT_FONT_PT)) {
          savedFontValue = basePt;
          migrated = true;
          debug('Debug: venn loadStylePrefs font migrated', {
            savedFont: saved.fontsize,
            basePt,
            savedVersion,
            targetVersion: STYLE_VERSION
          }); // Debug: reset legacy default font to new baseline
        }
      }
      if (saved) {
        if (saved.colorA) inputs.colorA.value = saved.colorA;
        if (saved.colorB) inputs.colorB.value = saved.colorB;
        if (saved.colorC) inputs.colorC.value = saved.colorC;
        if (saved.opacity) inputs.opacity.value = saved.opacity;
        if (saved.borderColor) inputs.borderColor.value = saved.borderColor;
        if (saved.borderWidth) inputs.borderWidth.value = saved.borderWidth;
        if (saved.plotType && state.ui.plotType) {
          syncPlotMode(saved.plotType, { updateTitle: true });
        }
        if (saved.upset && state.ui.upset) {
          const upset = saved.upset || {};
          if (state.ui.upset.sort) state.ui.upset.sort.value = upset.sort || DEFAULT_UPSET_SETTINGS.sort;
          if (state.ui.upset.max) state.ui.upset.max.value = clampNumber(upset.maxIntersections, DEFAULT_UPSET_SETTINGS.maxIntersections, 1, 50);
          if (state.ui.upset.showEmpty) state.ui.upset.showEmpty.checked = !!upset.showEmpty;
          if (state.ui.upset.showCounts) state.ui.upset.showCounts.checked = upset.showCounts !== false;
          if (state.ui.upset.showSetCounts) state.ui.upset.showSetCounts.checked = upset.showSetCounts !== false;
          if (state.ui.upset.showGrid) {
            const showGrid = Object.prototype.hasOwnProperty.call(upset, 'showGrid')
              ? !!upset.showGrid
              : DEFAULT_UPSET_SETTINGS.showGrid;
            state.ui.upset.showGrid.checked = showGrid;
          }
          if (state.ui.upset.dotSize) state.ui.upset.dotSize.value = clampNumber(upset.dotSize, DEFAULT_UPSET_SETTINGS.dotSize, 2, 12);
          if (state.ui.upset.useSetColors) {
            const useSetColors = Object.prototype.hasOwnProperty.call(upset, 'useSetColors')
              ? !!upset.useSetColors
              : DEFAULT_UPSET_SETTINGS.useSetColors;
            state.ui.upset.useSetColors.checked = useSetColors;
          }
          if (state.ui.upset.barColor) state.ui.upset.barColor.value = sanitizeColor(upset.barColor, DEFAULT_UPSET_SETTINGS.barColor);
          if (state.ui.upset.setBarColor) state.ui.upset.setBarColor.value = sanitizeColor(upset.setBarColor, DEFAULT_UPSET_SETTINGS.setBarColor);
          if (state.ui.upset.dotColor) state.ui.upset.dotColor.value = sanitizeColor(upset.dotColor, DEFAULT_UPSET_SETTINGS.dotColor);
          if (state.ui.upset.inactiveDotColor) state.ui.upset.inactiveDotColor.value = sanitizeColor(upset.inactiveDotColor, DEFAULT_UPSET_SETTINGS.inactiveDotColor);
          if (state.ui.upset.connectorColor) state.ui.upset.connectorColor.value = sanitizeColor(upset.connectorColor, DEFAULT_UPSET_SETTINGS.connectorColor);
          if (state.ui.upset.gridColor) state.ui.upset.gridColor.value = sanitizeColor(upset.gridColor, DEFAULT_UPSET_SETTINGS.gridColor);
        }
        if (savedFontValue !== null && typeof savedFontValue !== 'undefined') {
          const fontInfo = resolveFontInfo(savedFontValue);
          inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
          chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
          debug('Debug: venn loadStylePrefs font applied', { saved: savedFontValue, fontInfo, savedVersion });
        }
      }
      if (!saved || typeof savedFontValue === 'undefined' || savedFontValue === null) {
        if (inputs.fontsize?.dataset) {
          inputs.fontsize.dataset.fontBasePt = String(inputs.fontsize.value || chartStyle.BASE_FONT_SIZE_PT || 13);
        }
        chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, pt: Number(inputs.fontsize.value), input: inputs.fontsize, manual: true });
        debug('Debug: venn loadStylePrefs font default', { fontSize: inputs.fontsize.value });
      }
      inputs.opacityVal.textContent = inputs.opacity.value;
      inputs.borderWidthVal.textContent = inputs.borderWidth.value;
      updateUpSetDotSizeOutput(state.ui?.upset?.dotSize?.value);
      syncPlotMode(state.ui?.plotType?.value || DEFAULT_PLOT_TYPE, { updateTitle: false });
      if (saved && (migrated || savedVersion < STYLE_VERSION)) {
        saveStylePrefs();
      }
    } catch (err) {
      console.warn('Debug: venn loadStylePrefs error', err);
    }
  }

  function saveStylePrefs() {
    const inputs = state.ui.inputs;
    if (!inputs) return;
    const prefs = {
      version: STYLE_VERSION,
      colorA: inputs.colorA.value,
      colorB: inputs.colorB.value,
      colorC: inputs.colorC.value,
      opacity: inputs.opacity.value,
      fontsize: inputs.fontsize.value,
      borderColor: inputs.borderColor.value,
      borderWidth: inputs.borderWidth.value,
      plotType: getActivePlotType(),
      upset: resolveUpSetSettings()
    };
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify(prefs));
    } catch (err) {
      console.warn('Debug: venn saveStylePrefs error', err);
    }
  }

  function initLayout() {
    const layoutFactory = Shared.componentLayout?.createStandardPanels;
    if (typeof layoutFactory !== 'function') {
      debugLog('initLayout skipped - missing factory', { hasFactory: typeof layoutFactory === 'function' });
      return;
    }
    const doc = global.document;
    const layout = layoutFactory({
      componentName: 'venn',
      selectors: {
        tablePanel: '#vennInputPanel',
        graphPanel: '#vennGraphPanel',
        panelResizer: '#vennPanelResizer',
        svgBox: () => doc?.querySelector('#vennGraphPanel .svgbox'),
        resizeTarget: () => doc?.querySelector('#vennGraphPanel .svgbox')
      },
      scheduleDraw: () => { state.ui.scheduleDraw?.(); },
      preserveGraphContent: false,
      panelSyncOptions: {
        disableAutoWidthClamp: true,
        lockGraphPanelWidth: false
      },
      resizableBoxOptions: {
        onResize: phase => {
          debugLog('layout onResize', { phase });
          if (phase !== 'observe') {
            state.ui.scheduleDraw?.();
          }
        }
      },
      onMinSvgWidth: value => {
        state.ui.minSvgWidth = Math.max(0, Number(value) || 0);
        debugLog('layout minSvgWidth update', { value: state.ui.minSvgWidth });
      },
      onAfterSync: ({ elements }) => {
        if (elements?.svgBox && elements.svgBox !== state.ui.svgBox) {
          state.ui.svgBox = elements.svgBox;
          debugLog('layout svgBox updated', { hasSvgBox: true });
        }
      }
    });
    if (!layout) {
      debugLog('initLayout returned falsy layout');
      return;
    }
    state.ui.layout = layout;
    state.ui.syncPanels = options => layout.syncPanels(options || {});
    state.ui.tablePanel = layout.elements.tablePanel || state.ui.tablePanel;
    state.ui.graphPanel = layout.elements.graphPanel || state.ui.graphPanel;
    state.ui.panelResizer = layout.elements.panelResizer || state.ui.panelResizer;
    state.ui.svgBox = layout.elements.svgBox || state.ui.svgBox;
    debugLog('layout initialized', {
      hasTable: !!state.ui.tablePanel,
      hasGraph: !!state.ui.graphPanel,
      hasResizer: !!state.ui.panelResizer,
      hasSvgBox: !!state.ui.svgBox
    });
  }

  function getVennGraphPayload(options = {}) {
    const inputs = state.ui.inputs;
    if (!inputs) {
      debug('Debug: venn.getPayload skipped - missing inputs reference');
      return null;
    }
    const includeAnalysis = options.includeAnalysis !== false;
    const goToggle = state.ui.goResults?.querySelector?.('#toggleGoResults');
    const goLimit = goToggle?.dataset?.state === 'all'
      ? (state.analysis.lastGOResult?.length || 5)
      : 5;
    const payload = {
      type: 'venn',
      data: {
        labelA: inputs.labelA.value,
        labelB: inputs.labelB.value,
        labelC: inputs.labelC.value,
        listA: inputs.A.value,
        listB: inputs.B.value,
        listC: inputs.C.value,
        nA: inputs.counts.nA.value,
        nB: inputs.counts.nB.value,
        nC: inputs.counts.nC.value,
        nAB: inputs.counts.nAB.value,
        nAC: inputs.counts.nAC.value,
        nBC: inputs.counts.nBC.value,
        nABC: inputs.counts.nABC.value
      },
      style: {
        plotType: getActivePlotType(),
        colorA: inputs.colorA.value,
        colorB: inputs.colorB.value,
        colorC: inputs.colorC.value,
        opacity: inputs.opacity.value,
        borderColor: inputs.borderColor.value,
        borderWidth: inputs.borderWidth.value,
        fontsize: inputs.fontsize.value,
        fontStyles: exportFontStyles('venn') || undefined,
        title: state.titleText,
        labelPositions: state.labelPositions || null,
        upset: resolveUpSetSettings()
      },
      analysis: includeAnalysis ? {
        goResult: state.analysis.lastGOResult ? cloneSimple(state.analysis.lastGOResult) : null,
        goFormatted: state.analysis.lastGOFormatted ? state.analysis.lastGOFormatted.slice() : [],
        goOrganism: state.analysis.lastGOOrganism || '',
        goLimit,
        stringSvg: state.analysis.lastStringSVG || '',
        stringEnrichment: state.analysis.lastStringEnrichment ? cloneSimple(state.analysis.lastStringEnrichment) : null,
        stringLimit: 5,
        regionSelectValue: state.ui.regionSelect ? state.ui.regionSelect.value || '' : ''
      } : null
    };
    debug('Debug: venn.getPayload captured state', {
      labelA: payload.data.labelA,
      labelB: payload.data.labelB,
      labelC: payload.data.labelC,
      opacity: payload.style.opacity
    });
    return payload;
  }
  venn.getPayload = getVennGraphPayload;
  venn.createEmptyPayload = function createEmptyVennPayload(){
    venn.ensure();
    ensureEmptyPayloadTemplate();
    const payload = cloneSimple(emptyPayloadTemplate) || { type: 'venn' };
    payload.type = 'venn';
    payload.data = {
      labelA: '',
      labelB: '',
      labelC: '',
      listA: '',
      listB: '',
      listC: '',
      nA: 0,
      nB: 0,
      nC: 0,
      nAB: 0,
      nAC: 0,
      nBC: 0,
      nABC: 0
    };
    payload.style = payload.style || {};
    payload.analysis = {
      goResult: null,
      goFormatted: [],
      goOrganism: '',
      goLimit: 5,
      stringSvg: '',
      stringEnrichment: null,
      stringLimit: 5,
      regionSelectValue: ''
    };
    return payload;
  };

  venn.save = async function () {
    const payload = getVennGraphPayload();
    if (!payload) return;
    debug('Debug: saveVennFile invoked', { hasHandle: !!state.persistence.fileHandle });
    if (!fileIO || typeof fileIO.saveGraphFile !== 'function') {
      console.error('saveVennFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'venn',
      fileHandle: state.persistence.fileHandle,
      payload,
      fileName: state.persistence.fileName,
      downloadFileName: state.persistence.fileName,
      setFileHandle: handle => { state.persistence.fileHandle = handle; },
      setFileName: name => { state.persistence.fileName = name; }
    });
    debug('Debug: venn.save result', result);
  };

  venn.saveAs = async function () {
    const payload = getVennGraphPayload();
    if (!payload) return;
    debug('Debug: saveAsVennFile invoked', { currentName: state.persistence.fileName });
    if (!fileIO || typeof fileIO.saveGraphFileAs !== 'function') {
      console.error('saveAsVennFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'venn',
      payload,
      fileName: state.persistence.fileName,
      downloadFileName: state.persistence.fileName,
      setFileHandle: handle => { state.persistence.fileHandle = handle; },
      setFileName: name => { state.persistence.fileName = name; }
    });
    debug('Debug: venn.saveAs result', result);
  };

  venn.open = async function () {
    debug('Debug: venn open invoked');
    if (!fileIO || typeof fileIO.openGraphFile !== 'function') {
      console.error('openVennFile missing fileIO.openGraphFile');
      return;
    }
    const previous = captureVennSnapshot();
    const result = await fileIO.openGraphFile({
      context: 'venn',
      setFileHandle: handle => { state.persistence.fileHandle = handle; },
      setFileName: name => { state.persistence.fileName = name; },
      loadFromFile: file => venn.loadFromFile(file, { undo: { previous } }),
      triggerInput: () => {
        const input = document.getElementById('vennGraphFile');
        if (input) {
          input.value = '';
          input.click();
        }
      }
    });
    debug('Debug: venn.open result', result);
  };

  function applyVennPayload(obj, meta = {}){
    if(!obj || typeof obj !== 'object'){
      console.error('venn payload missing or invalid', { meta });
      return false;
    }
    if(obj.type && obj.type !== 'venn'){
      console.error('Invalid graph type for venn payload', { type: obj.type, meta });
      return false;
    }
    const skipDraw = meta?.skipDraw === true;
    const inputs = state.ui.inputs;
    if(!inputs){
      console.warn('venn payload application skipped - inputs unavailable');
      return false;
    }
    const d = obj.data || {};
    inputs.labelA.value = d.labelA || '';
    inputs.labelB.value = d.labelB || '';
    inputs.labelC.value = d.labelC || '';
    inputs.A.value = d.listA || '';
    inputs.B.value = d.listB || '';
    inputs.C.value = d.listC || '';
    state.ui.syncTableFromInputs?.({ refresh: true });
    const c = inputs.counts;
    c.nA.value = d.nA || 0;
    c.nB.value = d.nB || 0;
    c.nC.value = d.nC || 0;
    c.nAB.value = d.nAB || 0;
    c.nAC.value = d.nAC || 0;
    c.nBC.value = d.nBC || 0;
    c.nABC.value = d.nABC || 0;
    const s = obj.style || {};
    const plotType = normalizePlotType(s.plotType || DEFAULT_PLOT_TYPE);
    syncPlotMode(plotType, { updateTitle: false });
    importFontStyles('venn', s.fontStyles || null);
    if(s.title !== undefined){
      state.titleText = s.title != null ? String(s.title) : '';
    }else{
      state.titleText = plotType === 'upset' ? DEFAULT_UPSET_TITLE : DEFAULT_VENN_TITLE;
    }
    inputs.colorA.value = s.colorA || inputs.colorA.value;
    inputs.colorB.value = s.colorB || inputs.colorB.value;
    inputs.colorC.value = s.colorC || inputs.colorC.value;
    inputs.opacity.value = s.opacity || inputs.opacity.value;
    inputs.opacityVal.textContent = inputs.opacity.value;
    inputs.borderColor.value = s.borderColor || inputs.borderColor.value;
    inputs.borderWidth.value = s.borderWidth || inputs.borderWidth.value;
    inputs.borderWidthVal.textContent = inputs.borderWidth.value;
    if (s.fontsize) {
      const fontInfo = resolveFontInfo(s.fontsize);
      inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
      chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
      debug('Debug: venn payload font applied', { saved: s.fontsize, fontInfo });
    } else {
      const fontInfo = resolveFontInfo(inputs.fontsize.value);
      inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
      chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
      debug('Debug: venn payload font fallback', { fontInfo });
    }
    if (state.ui.upset) {
      const upset = s.upset || {};
      if (state.ui.upset.sort) state.ui.upset.sort.value = upset.sort || DEFAULT_UPSET_SETTINGS.sort;
      if (state.ui.upset.max) state.ui.upset.max.value = clampNumber(upset.maxIntersections, DEFAULT_UPSET_SETTINGS.maxIntersections, 1, 50);
      if (state.ui.upset.showEmpty) state.ui.upset.showEmpty.checked = !!upset.showEmpty;
      if (state.ui.upset.showCounts) state.ui.upset.showCounts.checked = upset.showCounts !== false;
      if (state.ui.upset.showSetCounts) state.ui.upset.showSetCounts.checked = upset.showSetCounts !== false;
      if (state.ui.upset.showGrid) {
        const showGrid = Object.prototype.hasOwnProperty.call(upset, 'showGrid')
          ? !!upset.showGrid
          : DEFAULT_UPSET_SETTINGS.showGrid;
        state.ui.upset.showGrid.checked = showGrid;
      }
      if (state.ui.upset.dotSize) state.ui.upset.dotSize.value = clampNumber(upset.dotSize, DEFAULT_UPSET_SETTINGS.dotSize, 2, 12);
      updateUpSetDotSizeOutput(state.ui.upset.dotSize?.value);
      if (state.ui.upset.useSetColors) {
        const useSetColors = Object.prototype.hasOwnProperty.call(upset, 'useSetColors')
          ? !!upset.useSetColors
          : DEFAULT_UPSET_SETTINGS.useSetColors;
        state.ui.upset.useSetColors.checked = useSetColors;
      }
      if (state.ui.upset.barColor) state.ui.upset.barColor.value = sanitizeColor(upset.barColor, DEFAULT_UPSET_SETTINGS.barColor);
      if (state.ui.upset.setBarColor) state.ui.upset.setBarColor.value = sanitizeColor(upset.setBarColor, DEFAULT_UPSET_SETTINGS.setBarColor);
      if (state.ui.upset.dotColor) state.ui.upset.dotColor.value = sanitizeColor(upset.dotColor, DEFAULT_UPSET_SETTINGS.dotColor);
      if (state.ui.upset.inactiveDotColor) state.ui.upset.inactiveDotColor.value = sanitizeColor(upset.inactiveDotColor, DEFAULT_UPSET_SETTINGS.inactiveDotColor);
      if (state.ui.upset.connectorColor) state.ui.upset.connectorColor.value = sanitizeColor(upset.connectorColor, DEFAULT_UPSET_SETTINGS.connectorColor);
      if (state.ui.upset.gridColor) state.ui.upset.gridColor.value = sanitizeColor(upset.gridColor, DEFAULT_UPSET_SETTINGS.gridColor);
    }
    // Restore label positions if saved
    if(s.labelPositions){
      state.labelPositions = {
        title: s.labelPositions.title || null
      };
    }
    if(skipDraw){
      if(obj.analysis && typeof obj.analysis === 'object'){
        state.analysis.lastGOResult = obj.analysis.goResult ? cloneSimple(obj.analysis.goResult) : null;
        state.analysis.lastGOFormatted = Array.isArray(obj.analysis.goFormatted) ? obj.analysis.goFormatted.slice() : [];
        state.analysis.lastGOOrganism = obj.analysis.goOrganism || '';
        state.analysis.lastStringSVG = obj.analysis.stringSvg || '';
        state.analysis.lastStringEnrichment = obj.analysis.stringEnrichment ? cloneSimple(obj.analysis.stringEnrichment) : null;
        if(state.ui.regionSelect && Object.prototype.hasOwnProperty.call(obj.analysis, 'regionSelectValue')){
          state.ui.regionSelect.value = obj.analysis.regionSelectValue || '';
        }
      }else{
        state.analysis.lastGOResult = null;
        state.analysis.lastGOFormatted = [];
        state.analysis.lastGOOrganism = '';
        state.analysis.lastStringSVG = null;
        state.analysis.lastStringEnrichment = null;
      }
    }else{
      refreshDiagram();
      applyAnalysisPayload(obj.analysis);
    }
    if(meta.recordUndo !== false){
      const undoPrevious = meta.undoPrevious || captureVennSnapshot();
      const next = captureVennSnapshot();
      recordVennChange(meta.undoLabel || 'venn:load-file', undoPrevious, next);
    }
    debugLog('Debug: venn payload applied', { source: meta.source || 'unknown' });
    return true;
  }

  venn.loadFromFile = function (file, options = {}) {
    const undoPrevious = options?.undo?.previous || captureVennSnapshot();
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        if (file && typeof file.name === 'string') {
          state.persistence.fileName = file.name;
        }
        if(!applyVennPayload(obj, { source: 'file', undoPrevious, recordUndo: true, undoLabel: 'venn:load-file' })){
          console.warn('venn payload rejected from file', { hasType: !!obj?.type });
        }
      } catch (err) { console.error('loadVennGraph error', err); }
    };
    reader.readAsText(file);
  };

  venn.loadFromPayload = function loadVennFromPayload(payload, options = {}){
    const undoPrevious = options?.undo?.previous;
    const recordUndo = options?.recordUndo ?? false;
    if(!applyVennPayload(payload, { source: 'payload', undoPrevious, recordUndo, undoLabel: options?.undoLabel })){
      console.warn('venn payload application failed', { source: 'payload' });
    }
  };

  function handlePlainPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || global.clipboardData).getData('text/plain').replace(/\r/g, '').replace(/\u00A0/g, ' ');
    document.execCommand('insertText', false, text);
    debug('Debug: venn handlePlainPaste', { length: text.length }); // Debug: normalized paste text length
  }

  function handleOpacityInput(event) {
    const target = event?.currentTarget || state.ui.inputs.opacity;
    state.ui.inputs.opacityVal.textContent = state.ui.inputs.opacity.value;
    refreshDiagram();
    saveStylePrefs();
    debug('Debug: venn handleOpacityInput', { value: state.ui.inputs.opacity.value }); // Debug: opacity slider change
    commitVennUndo(target, 'venn:opacity');
    if (target) {
      prepareVennUndo(target, 'venn:opacity');
    }
  }

  function handleFontsizeInput(event) {
    const raw = state.ui.inputs.fontsize.value;
    if (state.ui.inputs.fontsize.dataset) {
      state.ui.inputs.fontsize.dataset.fontBasePt = String(raw);
      debug('Debug: venn font size base updated', { raw }); // Debug: manual slider update preserved
    }
    const fontInfo = resolveFontInfo(raw);
    state.ui.inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : state.ui.inputs.fontsize.value;
    chartStyle.renderFontSizeLabel({ element: state.ui.inputs.fontsizeVal, fontInfo, input: state.ui.inputs.fontsize });
    debug('Debug: venn fontsize slider change', { raw, fontInfo });
    refreshDiagram();
    saveStylePrefs();
    const target = event?.currentTarget || state.ui.inputs.fontsize;
    commitVennUndo(target, 'venn:fontsize');
    if (target) {
      prepareVennUndo(target, 'venn:fontsize');
    }
  }

  function handleColorInput(event) {
    refreshDiagram();
    saveStylePrefs();
    debug('Debug: venn handleColorInput'); // Debug: color change trigger
    const target = event?.currentTarget || null;
    const label = target?.id ? `venn:${target.id}` : 'venn:color';
    if (target) {
      commitVennUndo(target, label);
    }
  }

  function handleBorderColorInput(event) {
    refreshDiagram();
    saveStylePrefs();
    debug('Debug: venn handleBorderColorInput'); // Debug: border color update
    commitVennUndo(event?.currentTarget || state.ui.inputs.borderColor, 'venn:border-color');
  }

  function handleBorderWidthInput(event) {
    const target = event?.currentTarget || state.ui.inputs.borderWidth;
    state.ui.inputs.borderWidthVal.textContent = state.ui.inputs.borderWidth.value;
    refreshDiagram();
    saveStylePrefs();
    debug('Debug: venn handleBorderWidthInput', { value: state.ui.inputs.borderWidth.value }); // Debug: border width change
    commitVennUndo(target, 'venn:border-width');
    if (target) {
      prepareVennUndo(target, 'venn:border-width');
    }
  }

  function createLabelInputHandler(id) {
    return function labelInputHandler(event) {
      const labels = {
        A: state.ui.inputs.labelA.value || 'A',
        B: state.ui.inputs.labelB.value || 'B',
        C: state.ui.inputs.labelC.value || 'C'
      };
      updateColorLabels(labels);
      updateRegionSelect(labels, state.analysis.lastCounts);
      updateCountLabels(labels);
      requestScheduledDraw(`label-input-${id}`);
      debug('Debug: venn labelInputHandler', { id, labels }); // Debug: label input change
      const target = event?.currentTarget || state.ui.inputs[id];
      commitVennUndo(target, `venn:label-${id}`);
    };
  }

  function handleCaseSensitiveChange(event) {
    requestScheduledDraw('case-sensitive-toggle', 'lists');
    debug('Debug: venn handleCaseSensitiveChange'); // Debug: case sensitivity toggle
    commitVennUndo(event?.currentTarget || state.ui.inputs.caseSensitive, 'venn:case-sensitive');
  }

  function handlePlotTypeChange(event) {
    const target = event?.currentTarget || state.ui.plotType;
    const nextType = normalizePlotType(target?.value || DEFAULT_PLOT_TYPE);
    syncPlotMode(nextType, { updateTitle: true, syncPanels: true });
    requestScheduledDraw('plot-type-change');
    saveStylePrefs();
    debug('Debug: venn handlePlotTypeChange', { plot: nextType });
    commitVennUndo(target, 'venn:plot-type');
  }

  function handleUpSetControlChange(event) {
    requestScheduledDraw('upset-control-change');
    saveStylePrefs();
    const target = event?.currentTarget || null;
    const label = target?.id ? `venn:${target.id}` : 'venn:upset-control';
    debug('Debug: venn handleUpSetControlChange', { id: target?.id || null });
    commitVennUndo(target, label);
  }

  function handleUpSetDotSizeInput(event) {
    const target = event?.currentTarget || state.ui.upset?.dotSize;
    updateUpSetDotSizeOutput(target?.value);
    requestScheduledDraw('upset-dot-size');
    saveStylePrefs();
    debug('Debug: venn handleUpSetDotSizeInput', { value: target?.value });
    commitVennUndo(target, 'venn:upset-dot-size');
  }

  function initializeLabelState() {
    const labels = {
      A: state.ui.inputs.labelA.value || 'A',
      B: state.ui.inputs.labelB.value || 'B',
      C: state.ui.inputs.labelC.value || 'C'
    };
    updateColorLabels(labels);
    updateRegionSelect(labels, state.analysis.lastCounts);
    updateCountLabels(labels);
    debug('Debug: venn initializeLabelState', { labels }); // Debug: initial label synchronization
  }

  function handleRegionSelectChange() {
    populateRegion(state.ui.regionSelect.value);
    debug('Debug: venn handleRegionSelectChange', { value: state.ui.regionSelect.value }); // Debug: region selection change
    syncActiveVennPayload('venn-region-select');
  }

  function handleDocumentClick(e) {
    if (state.ui.tooltip && state.ui.tooltip.style.display === 'block' && !state.ui.tooltip.contains(e.target)) {
      state.ui.tooltip.style.display = 'none';
      debug('Debug: venn handleDocumentClick hideTooltip'); // Debug: tooltip dismissed via document click
    }
  }

  function handleCopyRegionClick() {
    const text = getRegionText(state.ui.regionSelect.value);
    navigator.clipboard.writeText(text).catch(() => { });
    debug('Debug: venn handleCopyRegionClick', { length: text.length }); // Debug: copy region length
  }

  function createToggleHandler(targetEl, label) {
    return function toggleHandler() {
      const show = targetEl.style.display === 'none';
      targetEl.style.display = show ? 'block' : 'none';
      debug('Debug: venn toggleHandler', { label, show }); // Debug: toggle state change
    };
  }

  function createListInputHandler(key) {
    return function listInputHandler(event) {
      if (state.ui.speciesSelect) { state.ui.speciesSelect.value = ''; }
      setSpeciesIndicator(null);
      requestScheduledDraw(`list-input-${key}`, 'lists');
      scheduleSpeciesRecognition(`list-input-${key}`);
      debug('Debug: venn listInputHandler', { key }); // Debug: list input change
      const target = event?.currentTarget || state.ui.inputs[key];
      commitVennUndo(target, `venn:list-${key}`);
    };
  }

  function createNumericInputHandler(key) {
    return function numericInputHandler(event) {
      requestScheduledDraw(`numeric-input-${key}`, 'numeric');
      cancelPendingSpeciesDetection(`numeric-input-${key}`, { abortActive: true, resetIndicator: true });
      debug('Debug: venn numericInputHandler', { key }); // Debug: numeric input change
      const target = event?.currentTarget || state.ui.inputs.counts[key];
      commitVennUndo(target, `venn:numeric-${key}`);
    };
  }

  async function handleRegionListMouseover(e) {
    const link = e.target.closest('.gene-link');
    if (link && state.ui.regionList.contains(link)) {
      const gene = link.dataset.gene;
      const fn = await fetchUniProtAnnotation(gene);
      if (state.ui.tooltip) {
        state.ui.tooltip.innerHTML = fn ? `<strong>${gene}</strong><br>${fn}` : `<strong>${gene}</strong><br><i>Function not found</i>`;
        state.ui.tooltip.style.fontSize = '12px';
        state.ui.tooltip.style.maxHeight = 'none';
        state.ui.tooltip.style.overflow = 'visible';
        state.ui.tooltip.style.columnCount = 1;
        state.ui.tooltip.style.columnWidth = 'auto';
        state.ui.tooltip.style.columnGap = '0';
        state.ui.tooltip.style.width = 'auto';
        state.ui.tooltip.style.height = 'auto';
        state.ui.tooltip.style.whiteSpace = 'normal';
        let left = e.pageX + 8;
        let top = e.pageY + 8;
        state.ui.tooltip.style.left = left + 'px';
        state.ui.tooltip.style.top = top + 'px';
        state.ui.tooltip.style.display = 'block';
        requestAnimationFrame(() => {
          const w = state.ui.tooltip.scrollWidth;
          const h = state.ui.tooltip.scrollHeight;
          const maxWidth = Math.max(0, window.innerWidth - 32);
          const maxHeight = Math.max(0, window.innerHeight - 32);
          state.ui.tooltip.style.maxWidth = maxWidth + 'px';
          state.ui.tooltip.style.maxHeight = maxHeight + 'px';
          state.ui.tooltip.style.overflow = 'auto';
          state.ui.tooltip.style.width = Math.min(w, maxWidth || w) + 'px';
          state.ui.tooltip.style.height = Math.min(h, maxHeight || h) + 'px';
          positionTooltip(left, top);
          const linkRect = link.getBoundingClientRect();
          let tipRect = state.ui.tooltip.getBoundingClientRect();
          const overlaps = !(tipRect.right < linkRect.left || tipRect.left > linkRect.right || tipRect.bottom < linkRect.top || tipRect.top > linkRect.bottom);
          if (overlaps) {
            left = linkRect.left + window.scrollX - tipRect.width - 8;
            top = linkRect.top + window.scrollY;
            state.ui.tooltip.style.left = left + 'px';
            state.ui.tooltip.style.top = top + 'px';
            positionTooltip(left, top);
            tipRect = state.ui.tooltip.getBoundingClientRect();
            const stillOverlaps = !(tipRect.right < linkRect.left || tipRect.left > linkRect.right || tipRect.bottom < linkRect.top || tipRect.top > linkRect.bottom);
            if (stillOverlaps) {
              left = linkRect.left + window.scrollX;
              top = linkRect.top + window.scrollY - tipRect.height - 8;
              state.ui.tooltip.style.left = left + 'px';
              state.ui.tooltip.style.top = top + 'px';
              positionTooltip(left, top);
            }
          }
        });
        debug('Debug: venn handleRegionListMouseover', { gene, hasFn: !!fn }); // Debug: tooltip gene lookup
      }
    }
  }

  function handleRegionListMouseout(e) {
    const link = e.target.closest('.gene-link');
    if (link && state.ui.regionList.contains(link) && state.ui.tooltip) {
      state.ui.tooltip.style.display = 'none';
      debug('Debug: venn handleRegionListMouseout', { gene: link.dataset.gene }); // Debug: tooltip mouseout
    }
  }

  async function handleRegionListClick(e) {
    const link = e.target.closest('.gene-link');
    if (link && state.ui.regionList.contains(link)) {
      const gene = link.dataset.gene;
      const taxId = state.ui.speciesSelect?.selectedOptions[0]?.dataset.string || '9606';
      const fallbackUrl = `https://www.uniprot.org/uniprotkb?query=gene_exact:${encodeURIComponent(gene)}+AND+reviewed:true`;
      let targetUrl = fallbackUrl;
      const service = Shared.uniprot;
      if (service && typeof service.resolveEntryUrl === 'function') {
        try {
          const lookup = await service.resolveEntryUrl({ gene, organismTaxId: taxId, fetch });
          if (lookup) {
            targetUrl = lookup.entryUrl || lookup.fallbackUrl || fallbackUrl;
            debugLog('geneLink navigate', { gene, taxId, accession: lookup.accession || null, targetUrl }); // Debug: gene link navigation result
          }
        } catch (err) {
          debugLog('geneLink navigateError', { gene, message: err && err.message }); // Debug: gene link navigation error
        }
      }
      window.open(targetUrl, '_blank', 'noopener');
    }
  }

  function handleGoBtnMouseEnter() {
    if (!state.ui.tooltip || !state.ui.goBtn) { return; }
    const goBtnTip = 'Sends the selected species and gene list to g:Profiler GOSt, returns all GO categories and default sources, and displays the top five terms by significance.';
    state.ui.tooltip.innerHTML = goBtnTip;
    state.ui.tooltip.style.fontSize = '12px';
    state.ui.tooltip.style.maxHeight = 'none';
    state.ui.tooltip.style.overflow = 'visible';
    state.ui.tooltip.style.columnCount = 1;
    state.ui.tooltip.style.columnWidth = 'auto';
    state.ui.tooltip.style.width = 'max-content';
    state.ui.tooltip.style.height = 'auto';
    state.ui.tooltip.style.visibility = 'hidden';
    state.ui.tooltip.style.display = 'block';
    const rect = state.ui.goBtn.getBoundingClientRect();
    let left = rect.right + window.scrollX + 8;
    let top = rect.top + window.scrollY;
    state.ui.tooltip.style.left = left + 'px';
    state.ui.tooltip.style.top = top + 'px';
    positionTooltip(left, top);
    let tRect = state.ui.tooltip.getBoundingClientRect();
    const overlaps = !(tRect.right < rect.left || tRect.left > rect.right || tRect.bottom < rect.top || tRect.top > rect.bottom);
    if (overlaps) {
      left = rect.left + window.scrollX;
      top = rect.bottom + window.scrollY + 8;
      state.ui.tooltip.style.left = left + 'px';
      state.ui.tooltip.style.top = top + 'px';
      positionTooltip(left, top);
      tRect = state.ui.tooltip.getBoundingClientRect();
      const stillOverlap = !(tRect.right < rect.left || tRect.left > rect.right || tRect.bottom < rect.top || tRect.top > rect.bottom);
      if (stillOverlap) {
        top = rect.top + window.scrollY - tRect.height - 8;
        state.ui.tooltip.style.left = left + 'px';
        state.ui.tooltip.style.top = top + 'px';
        positionTooltip(left, top);
      }
    }
    state.ui.tooltip.style.visibility = 'visible';
    debug('Debug: venn handleGoBtnMouseEnter'); // Debug: GO tooltip shown
  }

  function handleGoBtnMouseLeave() {
    if (state.ui.tooltip) {
      state.ui.tooltip.style.display = 'none';
      debug('Debug: venn handleGoBtnMouseLeave'); // Debug: GO tooltip hidden
    }
  }

  function handleGoResultsClick(e) {
    if (e.target.id === 'toggleGoResults') {
      const stateAttr = e.target.dataset.state;
      if (stateAttr === 'top5') { renderGOResults(state.analysis.lastGOResult.length); }
      else { renderGOResults(5); }
      debug('Debug: venn handleGoResultsClick', { stateAttr }); // Debug: GO results toggle
    }
  }

  function handleCalcSignificanceClick() {
    debug('Debug: venn significance click');
    calculateSignificance();
  }

  async function handleGoButtonClick() {
    try {
      const regionGenes = (getRegionText(state.ui.regionSelect.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
      let organism = state.ui.speciesSelect.value;
      if (!organism) {
        const allGenes = getAllGenes();
        const detection = getSpeciesDetectionState();
        const cacheKey = computeGeneSignature(allGenes);
        const guess = allGenes.length ? await guessSpecies(allGenes, { cache: detection.cache, cacheKey }) : null;
        if (guess) {
          state.ui.speciesSelect.value = organism = guess;
          setSpeciesIndicator(true);
        } else {
          setSpeciesIndicator(false);
          alert('Please select a species before running GO analysis.');
          return;
        }
      }
      runGOAnalysis(regionGenes, organism);
      debug('Debug: venn handleGoButtonClick', { geneCount: regionGenes.length, organism }); // Debug: GO click payload
    } catch (err) { console.error('goBtn error', err); }
  }

  async function handleStringButtonClick() {
    try {
      const regionGenes = (getRegionText(state.ui.regionSelect.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
      let organism = state.ui.speciesSelect.value;
      if (!organism) {
        const allGenes = getAllGenes();
        const detection = getSpeciesDetectionState();
        const cacheKey = computeGeneSignature(allGenes);
        const guess = allGenes.length ? await guessSpecies(allGenes, { cache: detection.cache, cacheKey }) : null;
        if (guess) {
          state.ui.speciesSelect.value = organism = guess;
          setSpeciesIndicator(true);
        } else {
          setSpeciesIndicator(false);
          alert('Please select a species before running STRING analysis.');
          return;
        }
      }
      runStringAnalysis(regionGenes, organism);
      debug('Debug: venn handleStringButtonClick', { geneCount: regionGenes.length, organism }); // Debug: STRING click payload
    } catch (err) { console.error('stringBtn error', err); }
  }

  function handleDetectSpeciesClick(evt) {
    if (evt && typeof evt.preventDefault === 'function') {
      evt.preventDefault();
    }
    cancelPendingSpeciesDetection('manual-detect');
    recognizeSpeciesFromInput({ reason: 'manual-button' }).catch(err => {
      if (err && err.name === 'AbortError') { return; }
      console.warn('venn manual detect error', err);
    });
    debug('Debug: venn handleDetectSpeciesClick'); // Debug: manual detect trigger
  }

  function handleGoBtnTooltipLeave() {
    handleGoBtnMouseLeave();
  }

  function handleUseNumericClick() {
    state.analysis.lastDrawMode = 'numeric';
    cancelPendingSpeciesDetection('manual-numeric', { abortActive: true, resetIndicator: true });
    drawFromNumeric();
    debug('Debug: venn handleUseNumericClick'); // Debug: numeric draw invocation
  }

  function handleGraphFileChange(e) {
    const f = e.target.files[0];
    if (f) {
      const previous = captureVennSnapshot();
      state.persistence.fileName = f.name;
      state.persistence.fileHandle = null;
      venn.loadFromFile(f, { undo: { previous } });
      debug('Debug: venn handleGraphFileChange', { fileName: f.name }); // Debug: graph file change
    }
  }

  function handleSampleClick() {
    const previous = captureVennSnapshot();
    state.ui.inputs.labelA.value = 'Transcriptomic';
    state.ui.inputs.labelB.value = 'Proteomic';
    state.ui.inputs.labelC.value = 'Phospho';
    state.ui.inputs.A.value = `BRCA1\nATM\nBAP1\nEZH2\nSUZ12\nRING1B`;
    state.ui.inputs.B.value = `BRCA1\nBAP1\nRING1B\nCBX2\nHDAC1\nPAXIP1\nHUWE1`;
    state.ui.inputs.C.value = `BRCA1\nPAXIP1\nCSNK2A1\nRING1B\nKAT7`;
    state.ui.syncTableFromInputs?.({ refresh: true });
    state.analysis.lastDrawMode = 'lists';
    if (state.ui.speciesSelect) state.ui.speciesSelect.value = '';
    setSpeciesIndicator(null);
    refreshDiagram();
    scheduleSpeciesRecognition('sample-data');
    const next = captureVennSnapshot();
    recordVennChange('venn:sample-data', previous, next);
    debug('Debug: venn handleSampleClick'); // Debug: sample data loaded
  }

  function initVennTable() {
    const wrapper = document.getElementById('vennHotWrapper');
    const container = document.getElementById('vennHot');
    state.ui.hotWrapper = wrapper;
    state.ui.hotContainer = container;
    if (!wrapper || !container || typeof Shared.hot?.createStandardTable !== 'function') {
      debugLog('venn table unavailable', {
        hasWrapper: !!wrapper,
        hasContainer: !!container,
        hasFactory: typeof Shared.hot?.createStandardTable === 'function'
      });
      return;
    }
    Shared.ensureHotWrapperStyles?.(wrapper);
    const data = Shared.createEmptyData?.(20, 3) || Array.from({ length: 20 }, () => ['', '', '']);
    if (!Array.isArray(data[0])) {
      data[0] = ['', '', ''];
    }
    data[0][0] = 'A';
    data[0][1] = 'B';
    data[0][2] = 'C';
    const handleTableStructureChange = (label) => {
      syncVennInputsFromTable({ scheduleDraw: true, scheduleSpecies: true });
      debugLog('venn table structure change', { label });
    };
    state.ui.hot = Shared.hot.createStandardTable(container, { rows: 20, cols: 3 }, () => {}, {
      debugLabel: 'venn',
      data,
        pinFirstRow: true,
      hotOptions: {
        afterChange(changes, source) {
          if (!changes || source === 'loadData') {
            return;
          }
          syncVennInputsFromTable({ scheduleDraw: true, scheduleSpecies: true });
        },
        afterCreateCol() {
          handleTableStructureChange('afterCreateCol');
        },
        afterRemoveCol() {
          handleTableStructureChange('afterRemoveCol');
        },
        afterColumnMove(_moved, _finalIndex, _dropIndex, _possible, orderChanged) {
          if (orderChanged) {
            handleTableStructureChange('afterColumnMove');
          }
        },
        afterCreateRow() {
          handleTableStructureChange('afterCreateRow');
        },
        afterRemoveRow() {
          handleTableStructureChange('afterRemoveRow');
        }
      }
    });
    state.ui.syncTableFromInputs = syncVennTableFromInputs;
    state.ui.syncInputsFromTable = syncVennInputsFromTable;
    syncVennInputsFromTable({ scheduleDraw: false, scheduleSpecies: false });
  }

  function registerEventHandlers() {
    const inputs = state.ui.inputs;
    bindEventHandlers([
      { elements: [inputs.A, inputs.B, inputs.C], type: 'paste', handler: handlePlainPaste, label: 'plain-paste' },
      { elements: inputs.opacity, type: 'input', handler: handleOpacityInput, label: 'opacity' },
      { elements: inputs.fontsize, type: 'input', handler: handleFontsizeInput, label: 'fontsize' },
      { elements: [inputs.colorA, inputs.colorB, inputs.colorC], type: 'input', handler: handleColorInput, label: 'fill-colors' },
      { elements: inputs.borderColor, type: 'input', handler: handleBorderColorInput, label: 'border-color' },
      { elements: inputs.borderWidth, type: 'input', handler: handleBorderWidthInput, label: 'border-width' },
      { elements: inputs.caseSensitive, type: 'change', handler: handleCaseSensitiveChange, label: 'case-sensitive' },
      { elements: state.ui.plotType, type: 'change', handler: handlePlotTypeChange, label: 'plot-type' },
      { elements: state.ui.upset?.sort, type: 'change', handler: handleUpSetControlChange, label: 'upset-sort' },
      { elements: state.ui.upset?.max, type: 'input', handler: handleUpSetControlChange, label: 'upset-max' },
      { elements: state.ui.upset?.showEmpty, type: 'change', handler: handleUpSetControlChange, label: 'upset-show-empty' },
      { elements: state.ui.upset?.showCounts, type: 'change', handler: handleUpSetControlChange, label: 'upset-show-counts' },
      { elements: state.ui.upset?.showSetCounts, type: 'change', handler: handleUpSetControlChange, label: 'upset-show-set-counts' },
      { elements: state.ui.upset?.showGrid, type: 'change', handler: handleUpSetControlChange, label: 'upset-show-grid' },
      { elements: state.ui.upset?.dotSize, type: 'input', handler: handleUpSetDotSizeInput, label: 'upset-dot-size' },
      { elements: state.ui.upset?.useSetColors, type: 'change', handler: handleUpSetControlChange, label: 'upset-use-set-colors' },
      { elements: [state.ui.upset?.barColor, state.ui.upset?.setBarColor, state.ui.upset?.dotColor, state.ui.upset?.inactiveDotColor, state.ui.upset?.connectorColor, state.ui.upset?.gridColor], type: 'input', handler: handleUpSetControlChange, label: 'upset-colors' },
      { elements: state.ui.regionSelect, type: 'change', handler: handleRegionSelectChange, label: 'region-select' },
      { elements: document, type: 'click', handler: handleDocumentClick, label: 'document-click' },
      { elements: state.ui.copyRegionBtn, type: 'click', handler: handleCopyRegionClick, label: 'copy-region' },
      { elements: state.ui.goBtn, type: 'click', handler: handleGoButtonClick, label: 'go-run' },
      { elements: state.ui.detectSpeciesBtn, type: 'click', handler: handleDetectSpeciesClick, label: 'detect-species' },
      { elements: state.ui.stringBtn, type: 'click', handler: handleStringButtonClick, label: 'string-run' },
      { elements: state.ui.goBtn, type: 'mouseenter', handler: handleGoBtnMouseEnter, label: 'go-tooltip-enter' },
      { elements: state.ui.goBtn, type: 'mouseleave', handler: handleGoBtnTooltipLeave, label: 'go-tooltip-leave' },
      { elements: state.ui.goResults, type: 'click', handler: handleGoResultsClick, label: 'go-results' },
      { elements: state.ui.calcSignificanceBtn, type: 'click', handler: handleCalcSignificanceClick, label: 'significance' },
      { selector: '#useNumeric', type: 'click', handler: handleUseNumericClick, label: 'use-numeric' },
      { selector: '#openVennGraph', type: 'click', handler: venn.open, label: 'open-venn' },
      { selector: '#saveVennGraph', type: 'click', handler: venn.save, label: 'save-venn' },
      { selector: '#saveAsVenn', type: 'click', handler: venn.saveAs, label: 'saveas-venn' },
      { selector: '#vennGraphFile', type: 'change', handler: handleGraphFileChange, label: 'graph-file' },
      { selector: '#sample', type: 'click', handler: handleSampleClick, label: 'sample' }
    ]);

    attachUndoLifecycle(inputs.A, 'venn:list-A');
    attachUndoLifecycle(inputs.B, 'venn:list-B');
    attachUndoLifecycle(inputs.C, 'venn:list-C');
    attachUndoLifecycle(inputs.labelA, 'venn:label-labelA');
    attachUndoLifecycle(inputs.labelB, 'venn:label-labelB');
    attachUndoLifecycle(inputs.labelC, 'venn:label-labelC');
    Object.entries(inputs.counts).forEach(([key, el]) => {
      attachUndoLifecycle(el, `venn:numeric-${key}`);
    });
    attachUndoLifecycle(inputs.opacity, 'venn:opacity');
    attachUndoLifecycle(inputs.fontsize, 'venn:fontsize');
    attachUndoLifecycle(inputs.borderWidth, 'venn:border-width');
    attachUndoLifecycle(inputs.borderColor, 'venn:border-color');
    attachUndoLifecycle(inputs.colorA, 'venn:colorA');
    attachUndoLifecycle(inputs.colorB, 'venn:colorB');
    attachUndoLifecycle(inputs.colorC, 'venn:colorC');
    attachUndoLifecycle(inputs.caseSensitive, 'venn:case-sensitive');
    attachUndoLifecycle(state.ui.plotType, 'venn:plot-type');
    if (state.ui.upset) {
      attachUndoLifecycle(state.ui.upset.sort, 'venn:upset-sort');
      attachUndoLifecycle(state.ui.upset.max, 'venn:upset-max');
      attachUndoLifecycle(state.ui.upset.showEmpty, 'venn:upset-show-empty');
      attachUndoLifecycle(state.ui.upset.showCounts, 'venn:upset-show-counts');
      attachUndoLifecycle(state.ui.upset.showSetCounts, 'venn:upset-show-set-counts');
      attachUndoLifecycle(state.ui.upset.showGrid, 'venn:upset-show-grid');
      attachUndoLifecycle(state.ui.upset.dotSize, 'venn:upset-dot-size');
      attachUndoLifecycle(state.ui.upset.useSetColors, 'venn:upset-use-set-colors');
      attachUndoLifecycle(state.ui.upset.barColor, 'venn:upset-bar-color');
      attachUndoLifecycle(state.ui.upset.setBarColor, 'venn:upset-set-bar-color');
      attachUndoLifecycle(state.ui.upset.dotColor, 'venn:upset-dot-color');
      attachUndoLifecycle(state.ui.upset.inactiveDotColor, 'venn:upset-inactive-dot-color');
      attachUndoLifecycle(state.ui.upset.connectorColor, 'venn:upset-connector-color');
      attachUndoLifecycle(state.ui.upset.gridColor, 'venn:upset-grid-color');
    }

    ['labelA', 'labelB', 'labelC'].forEach(id => {
      bindEventHandlers([{ elements: inputs[id], type: 'input', handler: createLabelInputHandler(id), label: `${id}-input` }]);
    });

    ['A', 'B', 'C'].forEach(key => {
      bindEventHandlers([{ elements: inputs[key], type: 'input', handler: createListInputHandler(key), label: `list-${key}` }]);
    });

    Object.entries(inputs.counts).forEach(([key, el]) => {
      bindEventHandlers([{ elements: el, type: 'input', handler: createNumericInputHandler(key), label: `numeric-${key}` }]);
    });

    if (state.ui.goOptsBtn && state.ui.goOptions) {
      bindEventHandlers([{ elements: state.ui.goOptsBtn, type: 'click', handler: createToggleHandler(state.ui.goOptions, 'go-options'), label: 'go-options-toggle' }]);
    }
    if (state.ui.stringOptsBtn && state.ui.stringOptions) {
      bindEventHandlers([{ elements: state.ui.stringOptsBtn, type: 'click', handler: createToggleHandler(state.ui.stringOptions, 'string-options'), label: 'string-options-toggle' }]);
    }

    if (state.ui.copyRegionBtn && !navigator.clipboard) {
      debug('Debug: venn copyRegionBtn clipboard fallback', { hasClipboard: !!navigator.clipboard }); // Debug: clipboard capability check
    }

    if (state.ui.regionList) {
      bindEventHandlers([
        { elements: state.ui.regionList, type: 'mouseover', handler: handleRegionListMouseover, label: 'region-list-mouseover' },
        { elements: state.ui.regionList, type: 'mouseout', handler: handleRegionListMouseout, label: 'region-list-mouseout' },
        { elements: state.ui.regionList, type: 'click', handler: handleRegionListClick, label: 'region-list-click' }
      ]);
    }

    debug('Debug: venn registerEventHandlers complete'); // Debug: event registration finished
  }

  venn.init = function init() {
    if (venn.ready) { debugLog('init skipped'); return; }
    const freshState = createInitialState();
    Object.assign(state.ui, freshState.ui);
    Object.assign(state.analysis, freshState.analysis);
    Object.assign(state.persistence, freshState.persistence);
    debug('Debug: venn init state refreshed'); // Debug: state reset before init wiring
    debugLog('init start');
    state.ui.scheduleDraw = Shared.debounceFrame(refreshDiagram);
    debug('Debug: venn scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    initLayout();
    state.ui.layout?.setScheduleDraw?.(state.ui.scheduleDraw);
    if (typeof state.ui.syncPanels === 'function') {
      debug('Debug: venn post-scheduler syncPanels'); // Debug: sync panels after scheduler setup
      state.ui.syncPanels({ skipSchedule: true });
    }
    if (global.Chart && global.Chart.defaults) {
      applyGoChartDefaults(global.Chart);
    } else {
      debugLog('goChart.defaults.defer', { hasChart: !!global.Chart }); // Debug: defer locale until lazy load
    }
    const $ = global.$;
    state.ui.stage = document.getElementById('stage');
    state.ui.inputs = {
      A: $('#listA'),
      B: $('#listB'),
      C: $('#listC'),
      labelA: $('#labelA'),
      labelB: $('#labelB'),
      labelC: $('#labelC'),
      colorA: $('#colorA'),
      colorB: $('#colorB'),
      colorC: $('#colorC'),
      opacity: $('#opacity'),
      fontsize: $('#fontsize'),
      borderColor: $('#borderColor'),
      borderWidth: $('#borderWidth'),
      opacityVal: $('#opacityVal'),
      fontsizeVal: $('#fontsizeVal'),
      borderWidthVal: $('#borderWidthVal'),
      caseSensitive: $('#caseSensitive'),
      counts: {
        nA: $('#nA'),
        nB: $('#nB'),
        nC: $('#nC'),
        nAB: $('#nAB'),
        nAC: $('#nAC'),
        nBC: $('#nBC'),
        nABC: $('#nABC')
      }
    };
    state.ui.countsUI = {
      A: $('#countA'),
      B: $('#countB'),
      C: $('#countC'),
      AB: $('#countAB'),
      AC: $('#countAC'),
      BC: $('#countBC'),
      ABC: $('#countABC')
    };
    state.ui.regionSelect = $('#regionSelect');
    state.ui.regionList = $('#regionList');
    state.ui.copyRegionBtn = $('#copyRegionBtn');
    state.ui.goBtn = $('#goBtn');
    state.ui.detectSpeciesBtn = $('#detectSpeciesBtn');
    state.ui.stringBtn = $('#stringBtn');
    state.ui.plotType = $('#vennPlotType');
    state.ui.upset = {
      sort: $('#upsetSort'),
      max: $('#upsetMax'),
      showEmpty: $('#upsetShowEmpty'),
      showCounts: $('#upsetShowCounts'),
      showSetCounts: $('#upsetShowSetCounts'),
      showGrid: $('#upsetShowGrid'),
      dotSize: $('#upsetDotSize'),
      dotSizeVal: $('#upsetDotSizeVal'),
      useSetColors: $('#upsetUseSetColors'),
      barColor: $('#upsetBarColor'),
      setBarColor: $('#upsetSetBarColor'),
      dotColor: $('#upsetDotColor'),
      inactiveDotColor: $('#upsetInactiveDotColor'),
      connectorColor: $('#upsetConnectorColor'),
      gridColor: $('#upsetGridColor')
    };
    state.ui.goResults = $('#goResults');
    state.ui.stringResults = $('#stringResults');
    state.ui.stringNetwork = $('#stringNetwork');
    state.ui.goChartExport = $('#goChartExport');
    state.ui.stringNetworkExport = $('#stringNetworkExport');
    state.ui.tooltip = $('#tooltip');
    state.ui.speciesSelect = $('#speciesSelect');
    state.ui.totalGenesInput = $('#totalGenes');
    state.ui.calcSignificanceBtn = $('#calcSignificance');
    state.ui.significanceResults = $('#significanceResults');
    const vennAutoSizeTargets = [
      state.ui.regionSelect,
      state.ui.speciesSelect,
      state.ui.plotType,
      state.ui.upset?.sort
    ];
    vennAutoSizeTargets.filter(Boolean).forEach(select => {
      attachVennSelectAutoSize(select, 'venn');
    });
    state.ui.goCategoryChecks = Array.from(document.querySelectorAll('.goCategory'));
    state.ui.goOptsBtn = $('#goOptsBtn');
    state.ui.goOptions = $('#goOptions');
    state.ui.goUseAllBackground = $('#goUseAllBackground');
    state.ui.stringOptsBtn = $('#stringOptsBtn');
    state.ui.stringOptions = $('#stringOptions');
    initVennTable();
    const exporter = Shared.exporter;
    if (exporter && typeof exporter.mountSvgControls === 'function') {
      exporter.mountSvgControls({
        container: '#vennExportControls',
        svgSelector: '#stage',
        fileName: 'venn',
        contextLabel: 'venn-export'
      });
      debug('Debug: venn export controls mounted', { hasExporter: true }); // Debug: venn export mount
    } else {
      debug('Debug: venn export controls unavailable', { hasExporter: !!exporter }); // Debug: venn export fallback
    }
    if (exporter && typeof exporter.mountCanvasControls === 'function') {
      exporter.mountCanvasControls({
        container: '#goChartExport',
        canvasSelector: '#goChart',
        fileName: 'go_chart',
        contextLabel: 'go-chart',
        getSvgString: () => buildGoChartSvgString()
      });
      debug('Debug: go chart export controls mounted', { hasExporter: true }); // Debug: go chart export mount
    } else {
      debug('Debug: go chart export controls unavailable', { hasExporter: !!exporter }); // Debug: go chart export fallback
    }
    if (exporter && typeof exporter.mountSvgStringControls === 'function') {
      exporter.mountSvgStringControls({
        container: '#stringNetworkExport',
        getSvgString: () => state.analysis.lastStringSVG || '',
        fileName: 'string_network',
        contextLabel: 'string-export'
      });
      debug('Debug: string export controls mounted', { hasExporter: true }); // Debug: string export mount
    } else {
      debug('Debug: string export controls unavailable', { hasExporter: !!exporter }); // Debug: string export fallback
    }
    loadStylePrefs();
    syncPlotMode(state.ui.plotType?.value || DEFAULT_PLOT_TYPE, { updateTitle: false });
    updateUpSetDotSizeOutput(state.ui.upset?.dotSize?.value);
    registerEventHandlers();
    initializeLabelState();
    ensureEmptyPayloadTemplate();
    venn.ready = true;
    debugLog('init complete');
  };

  Object.assign(venn, {
    parseList,
    setsFromLists,
    layoutFromCounts,
    fitAndDraw,
    refreshCounts,
    updateCountLabels,
    updateRegionSelect,
    updateColorLabels,
    getRegionText,
    getAllGenes,
    guessSpecies,
    setSpeciesIndicator,
    recognizeSpeciesFromInput,
    clearAnalysis,
    runGOAnalysis,
    runStringAnalysis,
    exportGoChart,
    downloadStringPNG,
    downloadStringSVG,
    calculateSignificance,
    drawFromLists,
    drawFromNumeric,
    refreshDiagram
  });

  venn.__testHooks = {
    state,
    populateRegion,
    clearAnalysis
  };

  function detachChildren(node){
    if(!node){ return null; }
    const doc = node.ownerDocument || global.document;
    const fragment = doc?.createDocumentFragment ? doc.createDocumentFragment() : null;
    if(!fragment){ return null; }
    let count = 0;
    while(node.firstChild){
      fragment.appendChild(node.firstChild);
      count += 1;
    }
    return { fragment, count };
  }

  function restoreChildren(node, payload){
    if(!node || !payload || !payload.fragment){ return false; }
    while(node.firstChild){
      node.removeChild(node.firstChild);
    }
    node.appendChild(payload.fragment);
    return true;
  }

  function captureCanvasSnapshot(canvas){
    if(!canvas || typeof canvas.toDataURL !== 'function'){
      return null;
    }
    try{
      const dataUrl = canvas.toDataURL();
      return {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        display: canvas.style.display || ''
      };
    }catch(err){
      debug('Debug: venn canvas snapshot failed', { message: err?.message || String(err) });
      return null;
    }
  }

  function restoreCanvasSnapshot(canvas, snapshot){
    if(!canvas || !snapshot){
      return false;
    }
    if(typeof snapshot.display === 'string'){
      canvas.style.display = snapshot.display;
    }
    if(Number.isFinite(snapshot.width)){
      canvas.width = snapshot.width;
    }
    if(Number.isFinite(snapshot.height)){
      canvas.height = snapshot.height;
    }
    if(snapshot.dataUrl){
      const ctx = canvas.getContext ? canvas.getContext('2d') : null;
      if(ctx){
        const img = new Image();
        img.onload = () => {
          try{
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          }catch(err){
            debug('Debug: venn canvas snapshot draw failed', { message: err?.message || String(err) });
          }
        };
        img.src = snapshot.dataUrl;
        return true;
      }
    }
    return false;
  }

  venn.captureRenderCache = function captureRenderCache(){
    const stageCache = detachChildren(state.ui.stage);
    const regionCache = detachChildren(state.ui.regionList);
    const significanceCache = detachChildren(state.ui.significanceResults);
    const goResultsCache = detachChildren(state.ui.goResults);
    const stringResultsCache = detachChildren(state.ui.stringResults);
    const stringNetworkCache = detachChildren(state.ui.stringNetwork);
    const regionSelectCache = detachChildren(state.ui.regionSelect);
    const goChartSnapshot = captureCanvasSnapshot(document.getElementById('goChart'));
    const uiState = {
      copyRegionBtnDisplay: state.ui.copyRegionBtn?.style?.display ?? null,
      goChartExportDisplay: state.ui.goChartExport?.style?.display ?? null,
      stringNetworkExportDisplay: state.ui.stringNetworkExport?.style?.display ?? null
    };
    const analysisState = {
      lastRegions: state.analysis.lastRegions,
      lastCounts: state.analysis.lastCounts,
      lastParsedLists: state.analysis.lastParsedLists,
      lastDrawMode: state.analysis.lastDrawMode,
      lastSignificance: state.analysis.lastSignificance
    };
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: venn render cache captured', {
        stageNodes: stageCache?.count || 0,
        regionNodes: regionCache?.count || 0,
        significanceNodes: significanceCache?.count || 0,
        goNodes: goResultsCache?.count || 0,
        stringNodes: stringResultsCache?.count || 0,
        networkNodes: stringNetworkCache?.count || 0,
        regionOptions: regionSelectCache?.count || 0,
        hasChart: !!goChartSnapshot
      });
    }
    return {
      stage: stageCache,
      regionList: regionCache,
      significance: significanceCache,
      goResults: goResultsCache,
      stringResults: stringResultsCache,
      stringNetwork: stringNetworkCache,
      regionOptions: regionSelectCache,
      goChart: goChartSnapshot,
      uiState,
      analysisState
    };
  };

  venn.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    const restoredStage = restoreChildren(state.ui.stage, cache.stage);
    const restoredRegion = restoreChildren(state.ui.regionList, cache.regionList);
    const restoredSignificance = restoreChildren(state.ui.significanceResults, cache.significance);
    const restoredGo = restoreChildren(state.ui.goResults, cache.goResults);
    const restoredString = restoreChildren(state.ui.stringResults, cache.stringResults);
    const restoredNetwork = restoreChildren(state.ui.stringNetwork, cache.stringNetwork);
    const restoredRegionOptions = restoreChildren(state.ui.regionSelect, cache.regionOptions);
    if(cache.uiState){
      if(state.ui.copyRegionBtn && typeof cache.uiState.copyRegionBtnDisplay === 'string'){
        state.ui.copyRegionBtn.style.display = cache.uiState.copyRegionBtnDisplay;
      }
      if(state.ui.goChartExport && typeof cache.uiState.goChartExportDisplay === 'string'){
        state.ui.goChartExport.style.display = cache.uiState.goChartExportDisplay;
      }
      if(state.ui.stringNetworkExport && typeof cache.uiState.stringNetworkExportDisplay === 'string'){
        state.ui.stringNetworkExport.style.display = cache.uiState.stringNetworkExportDisplay;
      }
    }
    if(cache.analysisState){
      state.analysis.lastRegions = cache.analysisState.lastRegions || null;
      state.analysis.lastCounts = cache.analysisState.lastCounts || null;
      state.analysis.lastParsedLists = cache.analysisState.lastParsedLists || null;
      state.analysis.lastDrawMode = cache.analysisState.lastDrawMode || null;
      state.analysis.lastSignificance = cache.analysisState.lastSignificance || null;
    }
    const inputs = state.ui.inputs;
    if(inputs){
      const labels = {
        A: inputs.labelA.value || 'A',
        B: inputs.labelB.value || 'B',
        C: inputs.labelC.value || 'C'
      };
      updateCountLabels(labels);
      updateColorLabels(labels);
      if(state.analysis.lastCounts){
        refreshCounts(state.analysis.lastCounts);
        updateRegionSelect(labels, state.analysis.lastCounts);
      }
    }
    if(state.analysis.goChart){
      try{ state.analysis.goChart.destroy(); }catch(e){}
      state.analysis.goChart = null;
    }
    const goChartRestored = restoreCanvasSnapshot(document.getElementById('goChart'), cache.goChart);
    const restored = restoredStage || restoredRegion || restoredSignificance || restoredGo || restoredString || restoredNetwork || restoredRegionOptions || goChartRestored;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: venn render cache restored', {
        restored,
        stage: restoredStage,
        regionList: restoredRegion,
        significance: restoredSignificance,
        go: restoredGo,
        string: restoredString,
        network: restoredNetwork,
        regionOptions: restoredRegionOptions,
        goChart: goChartRestored
      });
    }
    return restored;
  };

  venn.draw = function draw() {
    try {
      refreshDiagram();
    } catch (e) {
      console.error('venn.draw error', e);
    }
  };

  venn.ensure = function ensure() {
    if (!venn.ready) venn.init();
  };
})(window);
