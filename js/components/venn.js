(function(global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_VENN_TABLE_HEADERS = ['Set 1', 'Set 2', 'Set 3'];
  const LEGACY_VENN_TABLE_HEADERS = ['A', 'B', 'C'];
  const DEFAULT_VENN_LABEL_MAP = {
    A: DEFAULT_VENN_TABLE_HEADERS[0],
    B: DEFAULT_VENN_TABLE_HEADERS[1],
    C: DEFAULT_VENN_TABLE_HEADERS[2]
  };
  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      if(typeof console !== 'undefined' && typeof console.debug === 'function'){
        console.debug('Debug: venn component notes helper require failed', { message: err?.message || String(err) });
      }
    }
  }
  const notesState = { text: '', open: false, control: null };
  const symbolToolbar = Shared.symbolToolbar = Shared.symbolToolbar || {};
  if(typeof symbolToolbar.show !== 'function' && typeof require === 'function'){
    try{
      require('../shared/symbolToolbar.js');
    }catch(err){
      if(typeof console !== 'undefined' && typeof console.debug === 'function'){
        console.debug('Debug: venn component symbolToolbar helper require failed', { message: err?.message || String(err) });
      }
    }
  }
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
  let vennSessionProjectionDepth = 0;
  let stringOverlayRerenderToken = 0;

  function isProjectingVennSession(){
    return vennSessionProjectionDepth > 0;
  }

  function withVennSessionProjection(callback){
    vennSessionProjectionDepth += 1;
    try{
      return typeof callback === 'function' ? callback() : undefined;
    }finally{
      vennSessionProjectionDepth = Math.max(0, vennSessionProjectionDepth - 1);
    }
  }

  function getVennRuntimeOwner(){
    return Shared.componentLifecycle?.createRuntimeOwner?.(venn, { componentKey: 'venn' }) || null;
  }

  function rememberVennOwnedRuntimeRecord(tabLike = null, snapshot = null, meta = {}){
    if(!snapshot || typeof snapshot !== 'object'){
      return null;
    }
    setVennSessionStateFromRuntimeRecord(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      reason: meta?.reason || 'venn-owned-runtime-remember-session'
    });
    return getVennRuntimeOwner()?.capture(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'venn',
      reason: meta?.reason || 'venn-owned-runtime-remember'
    }) || snapshot;
  }

  function resolveVennOwnedRuntimeSnapshot(snapshot = null, meta = {}){
    return getVennRuntimeOwner()?.bind(snapshot || null, {
      ...(meta || {}),
      componentKey: 'venn',
      reason: meta?.reason || 'venn-owned-runtime-resolve'
    }) || null;
  }

  function applyExistingVennOwnedRuntimeRecord(tabLike = null, meta = {}){
    const snapshot = getVennRuntimeOwner()?.bind(null, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'venn',
      reason: meta?.reason || 'venn-owned-runtime-activate-apply'
    });
    if(!snapshot || typeof venn.applyRuntimeState !== 'function'){
      return false;
    }
    return venn.applyRuntimeState(snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'venn-owned-runtime-activate-apply'
    });
  }


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
    gridColor: '#e5e7eb',
    axisColor: '#000000',
    axisWidth: 1
  };
  const DEFAULT_REGION_OPTIONS = [
    { value: 'A', label: `${DEFAULT_VENN_LABEL_MAP.A} only` },
    { value: 'B', label: `${DEFAULT_VENN_LABEL_MAP.B} only` },
    { value: 'C', label: `${DEFAULT_VENN_LABEL_MAP.C} only` },
    { value: 'AB', label: `${DEFAULT_VENN_LABEL_MAP.A}∩${DEFAULT_VENN_LABEL_MAP.B} only` },
    { value: 'AC', label: `${DEFAULT_VENN_LABEL_MAP.A}∩${DEFAULT_VENN_LABEL_MAP.C} only` },
    { value: 'BC', label: `${DEFAULT_VENN_LABEL_MAP.B}∩${DEFAULT_VENN_LABEL_MAP.C} only` },
    { value: 'ABC', label: `${DEFAULT_VENN_LABEL_MAP.A}∩${DEFAULT_VENN_LABEL_MAP.B}∩${DEFAULT_VENN_LABEL_MAP.C}` }
  ];
  const VENN_COUNT_KEYS = ['nA', 'nB', 'nC', 'nAB', 'nAC', 'nBC', 'nABC'];

  const DEFAULT_STRING_OVERLAY = Object.freeze({
    enabled: true,
    fileName: '',
    fileDisplayName: '',
    threshold: 0.75,
    mode: 'absolute',
    color: '#d62728',
    thickness: 3,
    edges: []
  });
  const STRING_OVERLAY_LAYER_ID = 'graphitix-string-overlay-layer';
  const STRING_NETWORK_BASE_VIEWBOX_ATTR = 'data-graphitix-string-base-viewbox';

  function parseStringOverlayControlNumber(value){
    if(typeof value === 'number'){
      return Number.isFinite(value) ? value : NaN;
    }
    return parseStringOverlayNumber(value);
  }

  function normalizeStringOverlayModel(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    const threshold = parseStringOverlayControlNumber(src.threshold);
    const thickness = parseStringOverlayControlNumber(src.thickness);
    const mode = ['absolute', 'positive', 'negative'].includes(String(src.mode || '').toLowerCase())
      ? String(src.mode).toLowerCase()
      : DEFAULT_STRING_OVERLAY.mode;
    const color = /^#[0-9a-f]{6}$/i.test(String(src.color || '')) ? String(src.color) : DEFAULT_STRING_OVERLAY.color;
    const edges = Array.isArray(src.edges) ? src.edges.map(edge => {
      const value = Number(edge?.value);
      const sourceLabel = String(edge?.source || '').trim();
      const targetLabel = String(edge?.target || '').trim();
      return sourceLabel && targetLabel && Number.isFinite(value)
        ? { source: sourceLabel, target: targetLabel, value }
        : null;
    }).filter(Boolean) : [];
    const fileName = String(src.fileName || '').trim();
    const rawDisplayName = String(src.fileDisplayName || '').trim();
    const fileDisplayName = rawDisplayName && !isLikelyShortDosFileName(rawDisplayName) ? rawDisplayName : '';
    return {
      enabled: src.enabled !== false,
      fileName,
      fileDisplayName,
      threshold: Number.isFinite(threshold) ? threshold : DEFAULT_STRING_OVERLAY.threshold,
      mode,
      color,
      thickness: Number.isFinite(thickness) && thickness > 0 ? thickness : DEFAULT_STRING_OVERLAY.thickness,
      edges
    };
  }


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
    const scientific = Shared.statsReporting?.getPValueFormatScientific?.({
      target: state.ui.significanceResults || global.document?.getElementById?.('significanceResults') || null,
      tabId: venn.__boundTabId || null
    }) === true;
    if(typeof formatter === 'function'){
      return formatter(value, { scientific, forceScientific: scientific });
    }
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    const numeric = Number(value);
    if(scientific) return numeric.toExponential(5);
    return numeric >= 0 && numeric <= 0.0001 ? '<0.0001' : numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
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

  function getVennLockRatioCheckbox() {
    const activeTabId = String(venn.__boundTabId || '').trim();
    const isOwnedByActiveTab = node => {
      if (!node || !node.isConnected) {
        return false;
      }
      const ownerTabId = String(getVennRootTabId(node) || '').trim();
      return !activeTabId || !ownerTabId || ownerTabId === activeTabId;
    };
    if (vennLockRatioInput && isOwnedByActiveTab(vennLockRatioInput)) {
      return vennLockRatioInput;
    }
    vennLockRatioInput = null;
    let svgBox = state.ui?.svgBox && isOwnedByActiveTab(state.ui.svgBox)
      ? state.ui.svgBox
      : null;
    if (!svgBox) {
      svgBox = queryVennRoot('#vennGraphPanel .svgbox', activeTabId || null);
    }
    if (!svgBox) {
      return null;
    }
    const checkbox = svgBox.querySelector('.resizer-aspect-checkbox');
    if (checkbox && isOwnedByActiveTab(checkbox)) {
      vennLockRatioInput = checkbox;
      return checkbox;
    }
    return null;
  }

  function getVennLockRatioPrevious() {
    const value = state.ui?.lockRatioPrevious;
    if (value === true || value === false) {
      return !!value;
    }
    const session = getActiveVennSessionForState?.();
    const sessionValue = session?.state?.lockRatioPrevious;
    return (sessionValue === true || sessionValue === false) ? !!sessionValue : null;
  }

  function setVennLockRatioPrevious(value) {
    const normalized = (value === true || value === false) ? !!value : null;
    if (state.ui) {
      state.ui.lockRatioPrevious = normalized;
    }
    const session = getActiveVennSessionForState?.();
    if (session?.state) {
      session.state.lockRatioPrevious = normalized;
      session.updatedAt = Date.now();
    }
    return normalized;
  }

  function getVennSavedAspectLockPreference() {
    const activeTabId = normalizeVennTabId(venn.__boundTabId || null);
    const tab = activeTabId ? global.Main?.session?.workspaceState?.tabs?.find?.(item => String(item?.id || '') === String(activeTabId)) : null;
    const layoutValue = tab?.layoutState?.svgBox?.dataset?.resizerAspectLocked;
    if (layoutValue === 'true' || layoutValue === 'false') {
      return layoutValue === 'true';
    }
    const payloadValue = tab?.payload?.meta?.graphSizing?.display?.aspectLocked;
    if (payloadValue === true || payloadValue === false) {
      return !!payloadValue;
    }
    return null;
  }

  function syncVennAspectControls(reason) {
    if (vennAspectSyncing) {
      return;
    }
    vennAspectSyncing = true;
    try {
      const plotType = getActivePlotType();
      const enforceLockRatio = plotType === 'venn';
      const lockRatioCheckbox = getVennLockRatioCheckbox();
      if (!lockRatioCheckbox) {
        return;
      }
      const lockLabel = lockRatioCheckbox.closest('label');
      if (enforceLockRatio) {
        if (getVennLockRatioPrevious() === null) {
          setVennLockRatioPrevious(!!lockRatioCheckbox.checked);
        }
        if (!lockRatioCheckbox.checked) {
          lockRatioCheckbox.checked = true;
          lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        lockRatioCheckbox.disabled = true;
        if (lockLabel) {
          if (!lockLabel.__vennOriginalTitle) {
            lockLabel.__vennOriginalTitle = lockLabel.title || '';
          }
          lockLabel.title = 'Locked for Venn diagram mode';
        }
      } else {
        lockRatioCheckbox.disabled = false;
        if (lockLabel && lockLabel.__vennOriginalTitle !== undefined) {
          lockLabel.title = lockLabel.__vennOriginalTitle;
          delete lockLabel.__vennOriginalTitle;
        }
        const restoreValue = getVennLockRatioPrevious();
        const savedAspectLock = getVennSavedAspectLockPreference();
        const targetValue = savedAspectLock !== null ? savedAspectLock : restoreValue;
        if (targetValue !== null) {
          setVennLockRatioPrevious(null);
          if (lockRatioCheckbox.checked !== targetValue) {
            lockRatioCheckbox.checked = targetValue;
            lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
      const svgBox = state.ui?.svgBox || lockRatioCheckbox.closest('.svgbox');
      if (svgBox?.dataset) {
        svgBox.dataset.resizerAspectLocked = lockRatioCheckbox.checked ? 'true' : 'false';
      }
      debugLog('aspect controls synced', {
        plotType,
        enforceLockRatio,
        checked: !!lockRatioCheckbox.checked,
        disabled: !!lockRatioCheckbox.disabled,
        reason: reason || null
      });
    } finally {
      vennAspectSyncing = false;
    }
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
    const page = getVennNodeById('vennPage');
    if (page && page.dataset) {
      page.dataset.plot = normalized;
    }
    const stage = state.ui?.stage || getVennNodeById('stage');
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
    syncVennAspectControls('plot-mode-sync');
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
      Shared.componentLifecycle?.clearComponentTimeout?.(venn, detection.pendingTimeoutId);
      detection.pendingTimeoutId = null;
      debug('Debug: venn species detect pending cleared', { reason }); // Debug: pending timer cleared
    }
    const session = getActiveVennSessionForState();
    if(session){
      session.timers.pendingSpeciesDetection = detection.pendingTimeoutId || null;
      session.updatedAt = Date.now();
    }
    if (venn.__boundTabId && venn.__asyncScope?.cancelAllForTab) {
      try {
        venn.__asyncScope.cancelAllForTab(venn.__boundTabId, reason || 'species-detection-cancel');
      } catch (err) {
        console.warn('venn species detection async cancel error', err);
      }
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
      Shared.componentLifecycle?.clearComponentTimeout?.(venn, detection.pendingTimeoutId);
    }
    const tabId = venn.__boundTabId || null;
    if (!tabId || typeof Shared.componentLifecycle?.createAsyncScope !== 'function') {
      console.warn('venn species detection scheduling skipped without explicit tab async scope', { reason, tabId });
      return;
    }
    const scope = venn.__asyncScope || Shared.componentLifecycle.createAsyncScope('venn');
    venn.__asyncScope = scope;
    detection.pendingReason = reason;
    detection.pendingTimeoutId = scope.setTimeout({
      tabId,
      reason: `species-detection:${reason}`
    }, () => {
      detection.pendingTimeoutId = null;
      const session = getActiveVennSessionForState();
      if(session){
        session.timers.pendingSpeciesDetection = null;
        session.updatedAt = Date.now();
      }
      recognizeSpeciesFromInput({ reason: `scheduled-${reason}` }).catch(err => {
        if (err && err.name === 'AbortError') {
          debug('Debug: venn species detect schedule aborted', { reason }); // Debug: scheduled detection aborted
        } else if (err) {
          console.warn('venn species detection schedule error', err);
        }
      });
    }, delay);
    const session = getActiveVennSessionForState();
    if(session){
      session.timers.pendingSpeciesDetection = detection.pendingTimeoutId || null;
      session.updatedAt = Date.now();
    }
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
      const queryRoot = state.ui?.root && typeof state.ui.root.querySelectorAll === 'function'
        ? state.ui.root
        : document;
      const nodes = Array.from(queryRoot.querySelectorAll(target));
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
        if (!target.__vennEventHandlers) {
          try {
            Object.defineProperty(target, '__vennEventHandlers', {
              value: Object.create(null),
              configurable: true
            });
          } catch (_err) {
            target.__vennEventHandlers = Object.create(null);
          }
        }
        const key = `${cfg.type}:${label}`;
        const previous = target.__vennEventHandlers?.[key];
        if (previous) {
          target.removeEventListener(cfg.type, previous, cfg.options);
        }
        const wrapped = event => runVennEventOwnerCallback(event, label, () => cfg.handler(event));
        target.__vennEventHandlers[key] = wrapped;
        target.addEventListener(cfg.type, wrapped, cfg.options);
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
   * @property {HTMLElement|null} analysisResultsTabs - Tablist wrapper for analysis results.
   * @property {HTMLButtonElement|null} analysisTabGo - Tab button for GO analysis results.
   * @property {HTMLButtonElement|null} analysisTabString - Tab button for STRING analysis results.
   * @property {HTMLElement|null} goResults - Container for GO analysis results.
   * @property {HTMLElement|null} stringResults - Container for STRING analysis results.
   * @property {HTMLElement|null} stringNetwork - Container for STRING network SVG content.
   * @property {HTMLElement|null} analysisPanelGo - Panel wrapping GO analysis outputs.
   * @property {HTMLElement|null} analysisPanelString - Panel wrapping STRING analysis outputs.
   * @property {SVGSVGElement|null} goChart - SVG renderer for GO enrichment bars.
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
   * @property {HTMLInputElement|null} stringOverlayFile - Hidden file input for custom STRING edge matrices.
   * @property {HTMLButtonElement|null} stringOverlayFileButton - Button that opens the custom edge file chooser.
   * @property {HTMLElement|null} stringOverlayFileName - Display label for the selected custom edge file.
   * @property {HTMLInputElement|null} stringOverlayEnabled - Toggle for custom STRING edge overlay visibility.
   * @property {HTMLInputElement|null} stringOverlayThreshold - Numeric threshold for custom STRING edges.
   * @property {HTMLSelectElement|null} stringOverlayMode - Threshold mode for custom STRING edge values.
   * @property {HTMLInputElement|null} stringOverlayColor - Stroke color for custom STRING edges.
   * @property {HTMLInputElement|null} stringOverlayThickness - Stroke width for custom STRING edges.
   * @property {HTMLElement|null} stringOverlayStatus - Status line for custom STRING edge overlay.
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
   * @property {string|null} lastStringSVG - Cached STRING network SVG markup.
   * @property {Object} stringOverlay - Tab-owned custom edge overlay model for STRING SVGs.
   * @property {Object|null} lastRegions - Cached region-to-gene map from last draw.
   * @property {Object|null} lastCounts - Cached counts from the last successful draw.
   * @property {string|null} lastDrawMode - Indicator of whether list or numeric draw was last used.
   * @property {Array|null} lastGOResult - Cached GO API response entries.
   * @property {string[]} lastGOFormatted - Cached formatted genes submitted to GO.
   * @property {number} goDisplayLimit - Number of GO terms projected in the SVG chart.
   * @property {string} lastGOOrganism - Organism code used for the last GO request.
   * @property {boolean} goPerformed - Whether GO analysis has been run for the current state.
   * @property {boolean} stringPerformed - Whether STRING analysis has been run for the current state.
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
        analysisResultsTabs: null,
        analysisTabGo: null,
        analysisTabString: null,
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
          gridColor: null
        },
        goResults: null,
        stringResults: null,
        stringNetwork: null,
        analysisPanelGo: null,
        analysisPanelString: null,
        goChart: null,
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
        stringOverlayFile: null,
        stringOverlayFileButton: null,
        stringOverlayFileName: null,
        stringOverlayEnabled: null,
        stringOverlayThreshold: null,
        stringOverlayMode: null,
        stringOverlayColor: null,
        stringOverlayThickness: null,
        stringOverlayStatus: null,
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
        emptyNotice: null,
        layout: null,
        minSvgWidth: 0,
        lockRatioPrevious: null,
      },
      analysis: {
        lastStringSVG: null,
        lastStringEnrichment: null,
        stringOverlay: normalizeStringOverlayModel(),
        lastRegions: null,
        lastCounts: null,
        lastDrawMode: null,
        lastParsedLists: null,
        lastTableSignature: null,
        lastUpSetRegionMap: null,
        lastUpSetIntersections: null,
        lastGOResult: null,
        lastGOFormatted: [],
        goDisplayLimit: 5,
        lastGOOrganism: 'hsapiens',
        goPerformed: false,
        stringPerformed: false,
        activeResultsTab: 'go',
        lastRegionSignature: null,
        lastRegionCode: null,
        lastSignificance: null,
        significancePanelModel: null,
        significanceCache: null,
        speciesDetection: {
          cache: new Map(),
          pendingTimeoutId: null,
          pendingReason: null,
          active: null,
          delayMs: 1200
        },
        upsetAxis: {
          color: DEFAULT_UPSET_SETTINGS.axisColor,
          width: DEFAULT_UPSET_SETTINGS.axisWidth
        },
        upsetTraceStyles: {
          intersectionBars: { global: {}, traces: {} },
          setBars: { global: {}, traces: {} },
          matrix: { global: {}, traces: {} }
        },
        vennTraceStyles: {
          traces: {}
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
  const vennSessionsByTabId = new Map();
  let activeVennSession = null;

  function normalizeVennSessionTabId(tabLike = null, meta = {}){
    const direct = typeof tabLike === 'string' || typeof tabLike === 'number' ? tabLike : null;
    const objectTabId = tabLike && typeof tabLike === 'object'
      ? (tabLike.id || tabLike.tabId || tabLike.workspaceTabId || null)
      : null;
    const resolved = direct
      || objectTabId
      || meta?.tabId
      || meta?.workspaceTabId
      || meta?.tab?.id
      || meta?.__workspaceSessionMeta?.tabId
      || Shared.workspaceTabs?.getActiveSessionInfo?.('venn')?.tabId
      || venn.__boundTabId
      || '';
    return String(resolved || '').trim();
  }

  function createDefaultVennNotesState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      text: src.text == null ? '' : String(src.text),
      open: !!src.open
    };
  }

  function captureVennNotesMirror(){
    const noteControl = notesState.control || null;
    const text = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : notesState.text;
    const open = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : notesState.open;
    notesState.text = text == null ? '' : String(text);
    notesState.open = !!open;
    return createDefaultVennNotesState(notesState);
  }

  function cloneVennSessionSnapshot(snapshot){
    if(!snapshot || typeof snapshot !== 'object'){
      return null;
    }
    return {
      payload: cloneVennPayload(snapshot.payload) || null,
      lastDrawMode: snapshot.lastDrawMode || null,
      speciesValue: snapshot.speciesValue || '',
      speciesIndicator: snapshot.speciesIndicator || '',
      totalGenes: snapshot.totalGenes || '',
      significanceHtml: snapshot.significanceHtml || '',
      significanceModel: normalizeVennSignificancePanelModel(snapshot.significanceModel || {}),
      lastSignificance: cloneSimple(snapshot.lastSignificance) || null,
      regionSelectValue: snapshot.regionSelectValue || '',
      fileName: snapshot.fileName || 'venn.graph',
      fileHandle: snapshot.fileHandle || null
    };
  }

  function cloneVennRuntimeSnapshot(snapshot){
    if(!snapshot || typeof snapshot !== 'object'){
      return null;
    }
    const persistence = snapshot.persistence && typeof snapshot.persistence === 'object'
      ? snapshot.persistence
      : {};
    const analysis = snapshot.analysis && typeof snapshot.analysis === 'object'
      ? snapshot.analysis
      : {};
    const ui = snapshot.ui && typeof snapshot.ui === 'object'
      ? snapshot.ui
      : {};
    return {
      persistence: {
        fileHandle: persistence.fileHandle || null,
        fileName: persistence.fileName || 'venn.graph'
      },
      analysis: {
        significanceCache: cloneSimple(analysis.significanceCache) || null,
        lastSignificance: cloneSimple(analysis.lastSignificance) || null,
        significancePanelModel: normalizeVennSignificancePanelModel(analysis.significancePanelModel || {}),
        speciesDetection: {
          cacheEntries: Array.isArray(analysis.speciesDetection?.cacheEntries)
            ? analysis.speciesDetection.cacheEntries.map(entry => Array.isArray(entry) ? [entry[0], cloneSimple(entry[1]) || entry[1]] : entry)
            : [],
          delayMs: Number.isFinite(analysis.speciesDetection?.delayMs)
            ? analysis.speciesDetection.delayMs
            : 1200
        }
      },
      ui: {
        speciesValue: ui.speciesValue || '',
        speciesIndicator: ui.speciesIndicator || '',
        totalGenes: ui.totalGenes || '',
        regionSelectValue: ui.regionSelectValue || ''
      }
    };
  }

  function createDefaultVennResultsState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    const own = key => Object.prototype.hasOwnProperty.call(src, key);
    const goResult = own('goResult') ? src.goResult : src.lastGOResult;
    const goFormatted = own('goFormatted') ? src.goFormatted : src.lastGOFormatted;
    const goOrganism = own('goOrganism')
      ? src.goOrganism
      : (own('lastGOOrganism') ? src.lastGOOrganism : 'hsapiens');
    const stringSvg = own('stringSvg') ? src.stringSvg : src.lastStringSVG;
    const stringEnrichment = own('stringEnrichment') ? src.stringEnrichment : src.lastStringEnrichment;
    const stringOverlay = own('stringOverlay') ? src.stringOverlay : src.lastStringOverlay;
    return {
      lastGOResult: cloneSimple(goResult) || null,
      lastGOFormatted: Array.isArray(goFormatted)
        ? goFormatted.slice()
        : [],
      lastGOOrganism: goOrganism == null ? '' : String(goOrganism),
      goPerformed: !!src.goPerformed,
      lastStringSVG: stringSvg == null ? '' : String(stringSvg),
      lastStringEnrichment: cloneSimple(stringEnrichment) || null,
      stringOverlay: normalizeStringOverlayModel(stringOverlay),
      stringPerformed: !!src.stringPerformed,
      activeResultsTab: normalizeAnalysisResultsTab(src.activeResultsTab || 'go'),
      lastSignificance: cloneSimple(src.lastSignificance) || null,
      significancePanelModel: normalizeVennSignificancePanelModel(src.significancePanelModel || {})
    };
  }

  function hasVennGoResultsState(results = {}){
    const r = createDefaultVennResultsState(results);
    return !!(r.goPerformed
      || Array.isArray(r.lastGOResult));
  }

  function hasVennStringResultsState(results = {}){
    const r = createDefaultVennResultsState(results);
    return !!(r.stringPerformed
      || r.lastStringSVG
      || (Array.isArray(r.lastStringEnrichment) && r.lastStringEnrichment.length));
  }

  function hasVennSignificanceResultsState(results = {}){
    const r = createDefaultVennResultsState(results);
    return !!(r.lastSignificance || vennSignificancePanelModelHasContent(r.significancePanelModel));
  }

  function resolveVennResultsForCapture(session = null){
    const stored = createDefaultVennResultsState(session?.results || {});
    const active = captureVennResultsStateFromActive();
    const useActiveGo = hasVennGoResultsState(active) || !hasVennGoResultsState(stored);
    const useActiveString = hasVennStringResultsState(active) || !hasVennStringResultsState(stored);
    const useActiveSignificance = hasVennSignificanceResultsState(active) || !hasVennSignificanceResultsState(stored);
    return createDefaultVennResultsState({
      goResult: useActiveGo ? active.lastGOResult : stored.lastGOResult,
      goFormatted: useActiveGo ? active.lastGOFormatted : stored.lastGOFormatted,
      goOrganism: useActiveGo ? active.lastGOOrganism : stored.lastGOOrganism,
      goPerformed: useActiveGo ? active.goPerformed : stored.goPerformed,
      stringSvg: useActiveString ? active.lastStringSVG : stored.lastStringSVG,
      stringEnrichment: useActiveString ? active.lastStringEnrichment : stored.lastStringEnrichment,
      stringOverlay: useActiveString ? active.stringOverlay : stored.stringOverlay,
      stringPerformed: useActiveString ? active.stringPerformed : stored.stringPerformed,
      activeResultsTab: active.activeResultsTab || stored.activeResultsTab || 'go',
      lastSignificance: useActiveSignificance ? active.lastSignificance : stored.lastSignificance,
      significancePanelModel: useActiveSignificance ? active.significancePanelModel : stored.significancePanelModel
    });
  }

  function copyOwnVennResultPatchValue(target, source, targetKey, keys){
    if(!target || !source || typeof source !== 'object'){
      return;
    }
    const key = keys.find(candidate => Object.prototype.hasOwnProperty.call(source, candidate));
    if(key){
      target[targetKey] = source[key];
    }
  }

  function createVennResultsStateForPatch(sessionResults = {}, payloadAnalysis = {}, patch = {}){
    const stored = createDefaultVennResultsState(sessionResults || {});
    const payload = createDefaultVennResultsState(payloadAnalysis || {});
    const hasStoredGo = hasVennGoResultsState(stored);
    const hasStoredString = hasVennStringResultsState(stored);
    const hasStoredSignificance = hasVennSignificanceResultsState(stored);
    const base = {
      goResult: hasStoredGo ? stored.lastGOResult : payload.lastGOResult,
      goFormatted: hasStoredGo ? stored.lastGOFormatted : payload.lastGOFormatted,
      goOrganism: hasStoredGo ? stored.lastGOOrganism : payload.lastGOOrganism,
      goPerformed: hasStoredGo ? stored.goPerformed : payload.goPerformed,
      stringSvg: hasStoredString ? stored.lastStringSVG : payload.lastStringSVG,
      stringEnrichment: hasStoredString ? stored.lastStringEnrichment : payload.lastStringEnrichment,
      stringOverlay: hasStoredString ? stored.stringOverlay : payload.stringOverlay,
      stringPerformed: hasStoredString ? stored.stringPerformed : payload.stringPerformed,
      activeResultsTab: stored.activeResultsTab || payload.activeResultsTab || 'go',
      lastSignificance: hasStoredSignificance ? stored.lastSignificance : payload.lastSignificance,
      significancePanelModel: hasStoredSignificance ? stored.significancePanelModel : payload.significancePanelModel
    };
    copyOwnVennResultPatchValue(base, patch, 'goResult', ['goResult', 'lastGOResult']);
    copyOwnVennResultPatchValue(base, patch, 'goFormatted', ['goFormatted', 'lastGOFormatted']);
    copyOwnVennResultPatchValue(base, patch, 'goOrganism', ['goOrganism', 'lastGOOrganism']);
    copyOwnVennResultPatchValue(base, patch, 'goPerformed', ['goPerformed']);
    copyOwnVennResultPatchValue(base, patch, 'stringSvg', ['stringSvg', 'lastStringSVG']);
    copyOwnVennResultPatchValue(base, patch, 'stringEnrichment', ['stringEnrichment', 'lastStringEnrichment']);
    copyOwnVennResultPatchValue(base, patch, 'stringOverlay', ['stringOverlay', 'lastStringOverlay']);
    copyOwnVennResultPatchValue(base, patch, 'stringPerformed', ['stringPerformed']);
    copyOwnVennResultPatchValue(base, patch, 'activeResultsTab', ['activeResultsTab']);
    copyOwnVennResultPatchValue(base, patch, 'lastSignificance', ['lastSignificance']);
    copyOwnVennResultPatchValue(base, patch, 'significancePanelModel', ['significancePanelModel']);
    return createDefaultVennResultsState(base);
  }

  function createVennAnalysisUiStateForPatch(payloadAnalysis = {}, patch = {}){
    const source = payloadAnalysis && typeof payloadAnalysis === 'object' ? payloadAnalysis : {};
    const next = {};
    ['goLimit', 'stringLimit', 'regionSelectValue', 'totalGenes', 'speciesValue', 'speciesIndicator'].forEach(key => {
      next[key] = Object.prototype.hasOwnProperty.call(patch, key) ? patch[key] : source[key];
    });
    next.activeResultsTab = Object.prototype.hasOwnProperty.call(patch, 'activeResultsTab')
      ? patch.activeResultsTab
      : source.activeResultsTab;
    return next;
  }

  function createVennAnalysisPayloadFromResults(results = {}, uiState = {}){
    const normalized = createDefaultVennResultsState(results);
    const hasGoResult = Array.isArray(normalized.lastGOResult);
    const hasStringResult = !!normalized.lastStringSVG || Array.isArray(normalized.lastStringEnrichment);
    return {
      ...createDefaultVennAnalysisPayload(),
      goResult: normalized.lastGOResult ? cloneSimple(normalized.lastGOResult) : null,
      goFormatted: normalized.lastGOFormatted.slice(),
      goOrganism: normalized.lastGOOrganism || '',
      goLimit: Number.isFinite(uiState.goLimit) && uiState.goLimit > 0 ? uiState.goLimit : 5,
      goPerformed: !!normalized.goPerformed || hasGoResult,
      activeResultsTab: normalizeAnalysisResultsTab(normalized.activeResultsTab || uiState.activeResultsTab || 'go'),
      stringSvg: normalized.lastStringSVG || '',
      stringEnrichment: normalized.lastStringEnrichment ? cloneSimple(normalized.lastStringEnrichment) : null,
      stringOverlay: normalizeStringOverlayModel(normalized.stringOverlay),
      stringLimit: Number.isFinite(uiState.stringLimit) && uiState.stringLimit > 0 ? uiState.stringLimit : 5,
      stringPerformed: !!normalized.stringPerformed || hasStringResult,
      regionSelectValue: uiState.regionSelectValue || '',
      totalGenes: uiState.totalGenes || '',
      speciesValue: uiState.speciesValue || '',
      speciesIndicator: uiState.speciesIndicator || '',
      lastSignificance: normalized.lastSignificance ? cloneSimple(normalized.lastSignificance) : null,
      significancePanelModel: normalizeVennSignificancePanelModel(normalized.significancePanelModel || {})
    };
  }

  function createClearedVennResultsState(activeResultsTab = 'go', options = {}){
    const preservedOverlay = options && Object.prototype.hasOwnProperty.call(options, 'stringOverlay')
      ? normalizeStringOverlayModel(options.stringOverlay)
      : normalizeStringOverlayModel();
    return createDefaultVennResultsState({
      goResult: null,
      goFormatted: [],
      goOrganism: '',
      goPerformed: false,
      activeResultsTab: normalizeAnalysisResultsTab(activeResultsTab),
      stringSvg: '',
      stringEnrichment: null,
      stringOverlay: preservedOverlay,
      stringPerformed: false,
      lastSignificance: null,
      significancePanelModel: {}
    });
  }

  function createClearedVennAnalysisPatch(activeResultsTab = 'go', options = {}){
    return createVennAnalysisPayloadFromResults(createClearedVennResultsState(activeResultsTab, options), {
      activeResultsTab: normalizeAnalysisResultsTab(activeResultsTab),
      goLimit: 5,
      stringLimit: 5
    });
  }

  function clearVennSessionAnalysisResults(reason = 'venn-analysis-clear', options = {}){
    const owner = getActiveVennSessionForState();
    if(!owner?.tabId){
      return false;
    }
    const activeResultsTab = normalizeAnalysisResultsTab(state.analysis.activeResultsTab || owner.results?.activeResultsTab || 'go');
    owner.results = createClearedVennResultsState(activeResultsTab, options);
    owner.updatedAt = Date.now();
    return updateTabAnalysisPayload(owner.tabId, createClearedVennAnalysisPatch(activeResultsTab, options), {
      reason,
      origin: 'user'
    });
  }

  function createDefaultVennDurableState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    const hasSnapshotSource = !!(src.snapshot || src.payload || src.lastDrawMode || src.speciesValue || src.significanceHtml || src.regionSelectValue);
    const snapshotSource = src.snapshot || (hasSnapshotSource ? src : null);
    return {
      snapshot: snapshotSource ? (cloneVennSessionSnapshot(snapshotSource) || null) : null,
      runtime: cloneVennRuntimeSnapshot(src.runtime) || null,
      fileName: src.fileName || src.snapshot?.fileName || 'venn.graph',
      titleText: src.titleText || src.snapshot?.payload?.style?.title || DEFAULT_VENN_TITLE,
      labelPositions: cloneSimple(src.labelPositions || src.snapshot?.payload?.style?.labelPositions) || { title: null },
      lockRatioPrevious: (src.lockRatioPrevious === true || src.lockRatioPrevious === false)
        ? !!src.lockRatioPrevious
        : null,
      notes: createDefaultVennNotesState(src.notes || src.snapshot?.payload?.notes || {}),
      drawPending: src.drawPending === true
    };
  }

  function createDefaultVennRefs(root = null){
    return {
      root: root || null,
      stage: null,
      inputs: null,
      countsUI: null,
      regionSelect: null,
      regionList: null,
      copyRegionBtn: null,
      vennExportControls: null,
      goBtn: null,
      detectSpeciesBtn: null,
      stringBtn: null,
      analysisResultsTabs: null,
      analysisTabGo: null,
      analysisTabString: null,
      plotType: null,
      upset: null,
      goResults: null,
      stringResults: null,
      stringNetwork: null,
      analysisPanelGo: null,
      analysisPanelString: null,
      goChart: null,
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
      stringOverlayFile: null,
      stringOverlayFileButton: null,
      stringOverlayFileName: null,
      stringOverlayEnabled: null,
      stringOverlayThreshold: null,
      stringOverlayMode: null,
      stringOverlayColor: null,
      stringOverlayThickness: null,
      stringOverlayStatus: null,
      analysisResults: null,
      useNumericBtn: null,
      openVennGraphBtn: null,
      saveVennGraphBtn: null,
      saveAsVennBtn: null,
      vennGraphFileInput: null,
      sampleBtn: null,
      tablePanel: null,
      graphPanel: null,
      panelResizer: null,
      hotWrapper: null,
      hotContainer: null,
      svgBox: null,
      emptyNotice: null,
      notesControl: null
    };
  }

  function createVennSession({ tabId, root = null, initialState = null } = {}){
    const normalizedTabId = String(tabId || '').trim();
    const source = initialState && typeof initialState === 'object' ? initialState : {};
    const durableSource = source.state && typeof source.state === 'object' ? source.state : source;
    return {
      componentKey: 'venn',
      tabId: normalizedTabId,
      root: root || null,
      state: createDefaultVennDurableState(durableSource),
      results: createDefaultVennResultsState(source.results || durableSource.results || durableSource.snapshot?.payload?.analysis || {}),
      refs: createDefaultVennRefs(root || null),
      cache: {
        emptyPayloadTemplate: null,
        parsedDerivedCache: null,
        asyncRequests: {
          go: null,
          string: null
        }
      },
      listeners: new Map(),
      timers: {
        scheduleDraw: null,
        pendingSpeciesDetection: null
      },
      workers: new Map(),
      managers: {
        hot: null,
        layout: null,
        fileHandle: null
      },
      notes: createDefaultVennNotesState(source.notes || durableSource.notes || {}),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function ensureVennSessionOwnershipShape(session){
    if(!session || typeof session !== 'object'){
      return null;
    }
    session.componentKey = 'venn';
    session.tabId = String(session.tabId || '').trim();
    session.root = session.root || null;
    session.state = createDefaultVennDurableState(session.state || {});
    session.results = createDefaultVennResultsState(session.results || session.state?.snapshot?.payload?.analysis || {});
    session.refs = session.refs && typeof session.refs === 'object' ? session.refs : createDefaultVennRefs(session.root || null);
    session.refs.root = session.refs.root || session.root || null;
    session.cache = session.cache && typeof session.cache === 'object' ? session.cache : {};
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'emptyPayloadTemplate')){ session.cache.emptyPayloadTemplate = null; }
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'parsedDerivedCache')){ session.cache.parsedDerivedCache = null; }
    if(!session.cache.asyncRequests || typeof session.cache.asyncRequests !== 'object'){
      session.cache.asyncRequests = { go: null, string: null, species: null };
    }
    if(!Object.prototype.hasOwnProperty.call(session.cache.asyncRequests, 'species')){
      session.cache.asyncRequests.species = null;
    }
    session.listeners = session.listeners instanceof Map ? session.listeners : new Map();
    session.timers = session.timers && typeof session.timers === 'object' ? session.timers : {};
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'scheduleDraw')){ session.timers.scheduleDraw = null; }
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'pendingDrawOptions')){ session.timers.pendingDrawOptions = null; }
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'pendingSpeciesDetection')){ session.timers.pendingSpeciesDetection = null; }
    session.workers = session.workers instanceof Map ? session.workers : new Map();
    session.managers = session.managers && typeof session.managers === 'object' ? session.managers : {};
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'hot')){ session.managers.hot = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'layout')){ session.managers.layout = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'fileHandle')){ session.managers.fileHandle = null; }
    session.notes = createDefaultVennNotesState(session.notes || session.state?.notes || {});
    return session;
  }

  function getVennSession(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeVennSessionTabId(tabLike, meta);
    if(!tabId){
      return null;
    }
    let session = vennSessionsByTabId.get(tabId) || null;
    if(!session && options.create !== false){
      session = createVennSession({
        tabId,
        root: meta?.root || resolveVennRoot(tabLike || tabId || null) || null,
        initialState: options.initialState || null
      });
      vennSessionsByTabId.set(tabId, session);
    }
    return ensureVennSessionOwnershipShape(session);
  }

  function getVennWorkspaceActiveTabId(){
    const workspaceInfo = Shared.workspaceTabs?.getActiveSessionInfo?.('venn') || null;
    if(workspaceInfo?.tabId){
      return String(workspaceInfo.tabId).trim();
    }
    const workspace = global.Main?.session?.workspaceState || null;
    const activeId = workspace?.activeTabId || null;
    if(activeId && Array.isArray(workspace?.tabs)){
      const activeTab = workspace.tabs.find(tab => tab && String(tab.id || '') === String(activeId));
      if(activeTab?.type === 'venn'){
        return String(activeId).trim();
      }
    }
    return '';
  }

  function getActiveVennSessionForState(){
    const workspaceActiveTabId = getVennWorkspaceActiveTabId();
    if(workspaceActiveTabId){
      return getVennSession(workspaceActiveTabId, { tabId: workspaceActiveTabId, reason: 'active-venn-session-workspace' }, { create: true });
    }
    if(activeVennSession && (!venn.__boundTabId || String(activeVennSession.tabId || '') === String(venn.__boundTabId || ''))){
      return ensureVennSessionOwnershipShape(activeVennSession);
    }
    const tabId = venn.__boundTabId || normalizeVennSessionTabId(null, {}) || null;
    return tabId ? getVennSession(tabId, { tabId, reason: 'active-venn-session' }, { create: true }) : null;
  }

  function getVennTabIdFromTarget(target = null){
    if(!target || typeof target.closest !== 'function'){
      return '';
    }
    const owner = target.closest('[data-workspace-tab-id], [data-tab-id], [data-workspace-instance-root="true"]');
    return String(
      owner?.dataset?.workspaceTabId
      || owner?.dataset?.tabId
      || owner?.getAttribute?.('data-workspace-tab-id')
      || owner?.getAttribute?.('data-tab-id')
      || ''
    ).trim();
  }

  function getVennActiveTabId(){
    return String(getVennWorkspaceActiveTabId() || venn.__boundTabId || '').trim();
  }

  function getVennCallbackOwner(meta = {}){
    const target = meta?.target || meta?.event?.currentTarget || meta?.event?.target || null;
    const tabId = String(meta?.tabId || getVennTabIdFromTarget(target) || getVennActiveTabId() || '').trim();
    return {
      tabId,
      session: tabId
        ? getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-callback-owner' }, { create: true })
        : getActiveVennSessionForState()
    };
  }

  function isVennCallbackOwnerActive(owner = null){
    const ownerTabId = String(owner?.tabId || owner?.session?.tabId || '').trim();
    const activeTabId = getVennActiveTabId();
    return !!(!ownerTabId || (activeTabId && ownerTabId === activeTabId));
  }

  function runVennOwnedCallback(owner, callback, meta = {}){
    if(typeof callback !== 'function'){
      return undefined;
    }
    const resolvedOwner = owner?.session || owner?.tabId
      ? owner
      : getVennCallbackOwner(meta);
    if(!isVennCallbackOwnerActive(resolvedOwner)){
      debugLog('venn callback skipped for inactive owner', {
        ownerTabId: resolvedOwner?.tabId || resolvedOwner?.session?.tabId || null,
        activeTabId: getVennActiveTabId() || null,
        reason: meta?.reason || 'venn-owned-callback'
      });
      return undefined;
    }
    return callback(resolvedOwner);
  }

  function runVennEventOwnerCallback(event, reason, callback){
    const owner = getVennCallbackOwner({ event, target: event?.currentTarget || event?.target || null, reason });
    return runVennOwnedCallback(owner, callback, { event, reason });
  }

  function isVennSessionActiveForModuleState(session){
    if(!session || typeof session !== 'object'){
      return false;
    }
    const tabId = String(session.tabId || '').trim();
    if(!tabId){ return false; }
    const workspaceActiveTabId = getVennWorkspaceActiveTabId();
    if(workspaceActiveTabId){
      return workspaceActiveTabId === tabId;
    }
    const boundTabId = String(venn.__boundTabId || '').trim();
    return !boundTabId || boundTabId === tabId;
  }

  function setVennFileHandleForSession(handle, session = null){
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if(owner){
      owner.managers.fileHandle = handle || null;
    }
    if(!owner || isVennSessionActiveForModuleState(owner)){
      state.persistence.fileHandle = handle || null;
    }
  }

  function setVennFileNameForSession(name, session = null){
    const normalized = (typeof name === 'string' && name.trim()) ? name.trim() : 'venn.graph';
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if(owner){
      owner.state.fileName = normalized;
    }
    if(!owner || isVennSessionActiveForModuleState(owner)){
      state.persistence.fileName = normalized;
    }
  }


  function getVennDeactivationTabId(tab, meta = {}){
    return normalizeVennSessionTabId((tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null, meta);
  }

  function getVennDeactivationSession(tab, meta = {}){
    const tabId = getVennDeactivationTabId(tab, meta);
    const activeSession = getActiveVennSessionForState();
    const activeTabId = venn.__boundTabId || activeSession?.tabId || null;
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      return getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-deactivate-target-session' }, { create: false });
    }
    return activeSession || (tabId ? getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-deactivate-active-session' }, { create: false }) : null);
  }

  function captureVennSessionForDeactivation(tab, meta = {}){
    const tabId = getVennDeactivationTabId(tab, meta);
    const activeSession = getActiveVennSessionForState();
    const activeTabId = venn.__boundTabId || activeSession?.tabId || null;
    const targetSession = getVennDeactivationSession(tab, meta);
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      debugLog('inactive-tab deactivate skipped active mirror capture', {
        tabId,
        activeTabId,
        reason: meta?.reason || 'venn-deactivate-capture'
      });
      return targetSession;
    }
    if(targetSession){
      captureVennSessionStateFromActive(targetSession, { ...(meta || {}), reason: meta?.reason || 'venn-deactivate-capture' });
    }
    return targetSession;
  }

  function syncVennSessionRefsFromActive(session = null){
    const shaped = ensureVennSessionOwnershipShape(session || activeVennSession || getActiveVennSessionForState());
    if(!shaped){ return null; }
    shaped.root = state.ui.root || shaped.root || null;
    shaped.refs = Object.assign(createDefaultVennRefs(shaped.root || null), shaped.refs || {}, {
      root: state.ui.root || shaped.root || null,
      stage: state.ui.stage || null,
      inputs: state.ui.inputs || null,
      countsUI: state.ui.countsUI || null,
      regionSelect: state.ui.regionSelect || null,
      regionList: state.ui.regionList || null,
      copyRegionBtn: state.ui.copyRegionBtn || null,
      goBtn: state.ui.goBtn || null,
      detectSpeciesBtn: state.ui.detectSpeciesBtn || null,
      stringBtn: state.ui.stringBtn || null,
      analysisResultsTabs: state.ui.analysisResultsTabs || null,
      analysisTabGo: state.ui.analysisTabGo || null,
      analysisTabString: state.ui.analysisTabString || null,
      plotType: state.ui.plotType || null,
      upset: state.ui.upset || null,
      goResults: state.ui.goResults || null,
      stringResults: state.ui.stringResults || null,
      stringNetwork: state.ui.stringNetwork || null,
      analysisPanelGo: state.ui.analysisPanelGo || null,
      analysisPanelString: state.ui.analysisPanelString || null,
      goChart: state.ui.goChart || null,
      goChartExport: state.ui.goChartExport || null,
      stringNetworkExport: state.ui.stringNetworkExport || null,
      tooltip: state.ui.tooltip || null,
      speciesSelect: state.ui.speciesSelect || null,
      totalGenesInput: state.ui.totalGenesInput || null,
      significanceResults: state.ui.significanceResults || null,
      calcSignificanceBtn: state.ui.calcSignificanceBtn || null,
      goCategoryChecks: Array.isArray(state.ui.goCategoryChecks) ? state.ui.goCategoryChecks.slice() : [],
      goOptsBtn: state.ui.goOptsBtn || null,
      goOptions: state.ui.goOptions || null,
      goUseAllBackground: state.ui.goUseAllBackground || null,
      stringOptsBtn: state.ui.stringOptsBtn || null,
      stringOptions: state.ui.stringOptions || null,
      stringOverlayFile: state.ui.stringOverlayFile || null,
      stringOverlayFileButton: state.ui.stringOverlayFileButton || null,
      stringOverlayFileName: state.ui.stringOverlayFileName || null,
      stringOverlayEnabled: state.ui.stringOverlayEnabled || null,
      stringOverlayThreshold: state.ui.stringOverlayThreshold || null,
      stringOverlayMode: state.ui.stringOverlayMode || null,
      stringOverlayColor: state.ui.stringOverlayColor || null,
      stringOverlayThickness: state.ui.stringOverlayThickness || null,
      stringOverlayStatus: state.ui.stringOverlayStatus || null,
      analysisResults: state.ui.analysisResults || null,
      useNumericBtn: state.ui.useNumericBtn || null,
      openVennGraphBtn: state.ui.openVennGraphBtn || null,
      saveVennGraphBtn: state.ui.saveVennGraphBtn || null,
      saveAsVennBtn: state.ui.saveAsVennBtn || null,
      vennGraphFileInput: state.ui.vennGraphFileInput || null,
      sampleBtn: state.ui.sampleBtn || null,
      tablePanel: state.ui.tablePanel || state.ui.layout?.elements?.tablePanel || null,
      graphPanel: state.ui.graphPanel || state.ui.layout?.elements?.graphPanel || null,
      panelResizer: state.ui.panelResizer || state.ui.layout?.elements?.panelResizer || null,
      hotWrapper: state.ui.hotWrapper || null,
      hotContainer: state.ui.hotContainer || null,
      svgBox: state.ui.svgBox || state.ui.layout?.elements?.svgBox || null,
      emptyNotice: state.ui.emptyNotice || null,
      notesControl: notesState.control || null
    });
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function syncVennSessionManagersFromActive(session = null){
    const shaped = ensureVennSessionOwnershipShape(session || activeVennSession || getActiveVennSessionForState());
    if(!shaped){ return null; }
    shaped.managers.hot = state.ui.hot || shaped.managers.hot || null;
    shaped.managers.layout = state.ui.layout || shaped.managers.layout || null;
    shaped.managers.fileHandle = state.persistence.fileHandle || shaped.managers.fileHandle || null;
    shaped.timers.scheduleDraw = state.ui.scheduleDraw || shaped.timers.scheduleDraw || null;
    shaped.timers.pendingSpeciesDetection = state.analysis.speciesDetection?.pendingTimeoutId || null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function sanitizeVennScheduleValue(value, depth = 0){
    if(value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'){
      return value;
    }
    if(depth > 4){
      return undefined;
    }
    if(typeof value === 'function'){
      return undefined;
    }
    if(value && typeof value === 'object'){
      if(value.nodeType || value.currentTarget || value.target || value.componentKey || value.refs || value.managers){
        return undefined;
      }
      if(Array.isArray(value)){
        const arr = value
          .map(item => sanitizeVennScheduleValue(item, depth + 1))
          .filter(item => item !== undefined);
        return arr.length ? arr : undefined;
      }
      const proto = Object.getPrototypeOf(value);
      if(proto !== Object.prototype && proto !== null){
        return undefined;
      }
      const out = {};
      Object.keys(value).forEach(key => {
        const sanitized = sanitizeVennScheduleValue(value[key], depth + 1);
        if(sanitized !== undefined){
          out[key] = sanitized;
        }
      });
      return Object.keys(out).length ? out : undefined;
    }
    return undefined;
  }

  function sanitizeVennScheduleOptions(options = {}, session = null){
    const source = options && typeof options === 'object' ? options : {};
    const sanitized = {};
    Object.keys(source).forEach(key => {
      const value = sanitizeVennScheduleValue(source[key], 0);
      if(value !== undefined){
        sanitized[key] = value;
      }
    });
    sanitized.tabId = String(session?.tabId || source.tabId || '').trim() || undefined;
    sanitized.reason = String(source.reason || sanitized.reason || 'venn-session-draw');
    return sanitized;
  }

  function scheduleVennDrawForSession(session = null, options = {}){
    const shaped = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if(!shaped){
      return false;
    }
    const scheduleOptions = sanitizeVennScheduleOptions(options || {}, shaped);
    if(!isVennSessionActiveForModuleState(shaped)){
      shaped.timers.pendingDrawOptions = scheduleOptions;
      shaped.state.drawPending = true;
      shaped.updatedAt = Date.now();
      return false;
    }
    const scheduler = typeof state.ui.scheduleDraw === 'function'
      ? state.ui.scheduleDraw
      : (typeof shaped.timers.scheduleDraw === 'function' ? shaped.timers.scheduleDraw : null);
    if(typeof scheduler !== 'function'){
      return false;
    }
    shaped.timers.scheduleDraw = scheduler;
    shaped.timers.pendingDrawOptions = null;
    shaped.state.drawPending = false;
    shaped.updatedAt = Date.now();
    scheduler(scheduleOptions);
    return true;
  }

  function scheduleActiveVennDraw(options = {}){
    return scheduleVennDrawForSession(getActiveVennSessionForState(), options);
  }

  function normalizeVennLabelPositions(value){
    return cloneSimple(value) || { title: null };
  }

  function patchVennVisualState(session = null, patch = {}, meta = {}){
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    const hasTitle = Object.prototype.hasOwnProperty.call(patch || {}, 'titleText');
    const hasPositions = Object.prototype.hasOwnProperty.call(patch || {}, 'labelPositions');
    const nextTitle = hasTitle ? String(patch.titleText == null ? '' : patch.titleText) : state.titleText;
    const nextPositions = hasPositions ? normalizeVennLabelPositions(patch.labelPositions) : normalizeVennLabelPositions(state.labelPositions);
    if(owner?.state){
      if(hasTitle){ owner.state.titleText = nextTitle || DEFAULT_VENN_TITLE; }
      if(hasPositions){ owner.state.labelPositions = nextPositions; }
      owner.updatedAt = Date.now();
      debugLog('venn visual state patched to owner session', {
        tabId: owner.tabId || null,
        reason: meta?.reason || null,
        title: hasTitle,
        labelPositions: hasPositions
      });
    }
    if(!owner || isVennSessionActiveForModuleState(owner)){
      if(hasTitle){ state.titleText = nextTitle; }
      if(hasPositions){ state.labelPositions = nextPositions; }
    }
    return { titleText: nextTitle, labelPositions: nextPositions };
  }

  function patchVennLabelPosition(session = null, key, value, meta = {}){
    const nextPositions = normalizeVennLabelPositions({
      ...normalizeVennLabelPositions(state.labelPositions),
      [key]: value || null
    });
    return patchVennVisualState(session, { labelPositions: nextPositions }, meta);
  }

  function captureVennResultsStateFromActive(){
    return createDefaultVennResultsState({
      lastGOResult: state.analysis.lastGOResult,
      lastGOFormatted: state.analysis.lastGOFormatted,
      lastGOOrganism: state.analysis.lastGOOrganism,
      goPerformed: state.analysis.goPerformed,
      lastStringSVG: state.analysis.lastStringSVG,
      lastStringEnrichment: state.analysis.lastStringEnrichment,
      stringOverlay: state.analysis.stringOverlay,
      stringPerformed: state.analysis.stringPerformed,
      activeResultsTab: state.analysis.activeResultsTab,
      lastSignificance: state.analysis.lastSignificance,
      significancePanelModel: captureVennSignificancePanelModel()
    });
  }

  function captureVennSessionStateFromActive(session = null, meta = {}){
    const shaped = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if(!shaped){ return null; }
    const ownerTabId = String(shaped.tabId || '').trim();
    const rootTabId = String(
      state.ui.root?.dataset?.workspaceTabId
      || state.ui.root?.dataset?.tabId
      || state.ui.root?.getAttribute?.('data-workspace-tab-id')
      || state.ui.root?.getAttribute?.('data-tab-id')
      || ''
    ).trim();
    const activeTabId = getVennActiveTabId();
    if(ownerTabId && ((activeTabId && ownerTabId !== activeTabId) || (rootTabId && ownerTabId !== rootTabId))){
      shaped.updatedAt = Date.now();
      debugLog('session capture skipped for inactive or mismatched Venn owner', {
        reason: meta?.reason || 'venn-capture-owner-guard',
        ownerTabId,
        activeTabId: activeTabId || null,
        rootTabId: rootTabId || null
      });
      return shaped;
    }
    const snapshot = captureVennSnapshot({
      tabId: shaped.tabId,
      skipDomRebind: true
    });
    const runtime = captureVennRuntimeStateSnapshot();
    const notes = captureVennNotesMirror();
    shaped.state = createDefaultVennDurableState({
      snapshot,
      runtime,
      fileName: state.persistence.fileName || 'venn.graph',
      titleText: state.titleText || DEFAULT_VENN_TITLE,
      labelPositions: state.labelPositions || { title: null },
      lockRatioPrevious: state.ui.lockRatioPrevious,
      notes,
      drawPending: state.drawPending === true
    });
    shaped.results = resolveVennResultsForCapture(shaped);
    shaped.notes = notes;
    syncVennSessionRefsFromActive(shaped);
    syncVennSessionManagersFromActive(shaped);
    shaped.updatedAt = Date.now();
    debugLog('session captured', { reason: meta?.reason || 'unspecified', tabId: shaped.tabId || null });
    return shaped;
  }

  function applyVennResultsStateToActive(results = {}){
    const normalized = createDefaultVennResultsState(results || {});
    state.analysis.lastGOResult = normalized.lastGOResult;
    state.analysis.lastGOFormatted = normalized.lastGOFormatted.slice();
    state.analysis.lastGOOrganism = normalized.lastGOOrganism || 'hsapiens';
    state.analysis.goPerformed = !!normalized.goPerformed;
    state.analysis.lastStringSVG = normalized.lastStringSVG || '';
    state.analysis.lastStringEnrichment = normalized.lastStringEnrichment;
    state.analysis.stringOverlay = normalizeStringOverlayModel(normalized.stringOverlay);
    syncStringOverlayControls();
    state.analysis.stringPerformed = !!normalized.stringPerformed;
    state.analysis.activeResultsTab = normalizeAnalysisResultsTab(normalized.activeResultsTab || 'go');
    const hasRestoredSignificance = !!normalized.lastSignificance
      || vennSignificancePanelModelHasContent(normalized.significancePanelModel);
    if(hasRestoredSignificance){
      state.analysis.lastSignificance = normalized.lastSignificance;
      state.analysis.significancePanelModel = normalizeVennSignificancePanelModel(normalized.significancePanelModel || {});
      restoreVennSignificancePanelModel(state.analysis.significancePanelModel);
    }
    if(Array.isArray(state.analysis.lastGOResult) && state.analysis.lastGOResult.length){
      renderGOResults(Math.min(5, state.analysis.lastGOResult.length));
    }else if(state.ui.goResults && state.analysis.goPerformed){
      state.ui.goResults.innerHTML = '<div>No GO results</div>';
      renderGOChart();
    }
    if(state.analysis.lastStringSVG){
      renderStringNetwork(state.analysis.lastStringSVG);
    }else if(state.ui.stringNetwork && state.analysis.stringPerformed){
      state.ui.stringNetwork.innerHTML = '';
      if(state.ui.stringNetworkExport){
        state.ui.stringNetworkExport.style.display = 'none';
      }
    }
    if(Array.isArray(state.analysis.lastStringEnrichment)){
      renderStringResults(state.analysis.lastStringEnrichment, 5);
    }else if(state.ui.stringResults && state.analysis.stringPerformed){
      state.ui.stringResults.innerHTML = '<div>No STRING results</div>';
    }
    updateAnalysisResultsVisibility();
  }

  function applyVennSessionStateToActive(session = null, options = {}){
    const shaped = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if(!shaped){ return false; }
    const durable = createDefaultVennDurableState(shaped.state || {});
    notesState.text = shaped.notes?.text == null ? durable.notes.text : shaped.notes.text;
    notesState.open = shaped.notes?.open == null ? durable.notes.open : !!shaped.notes.open;
    if(notesState.control){
      notesState.control.setValue(notesState.text || '');
      notesState.control.setOpen(!!notesState.open);
    }
    withVennSessionProjection(() => {
      if(durable.snapshot?.payload && state.ui.inputs){
        applyVennSnapshot({
          ...durable.snapshot,
          fileHandle: shaped.managers?.fileHandle || durable.snapshot.fileHandle || null
        });
      }else if(durable.runtime){
        applyVennRuntimeStateSnapshot(durable.runtime);
      }
      applyVennResultsStateToActive(shaped.results || {});
    });
    state.persistence.fileName = durable.fileName || durable.snapshot?.fileName || state.persistence.fileName || 'venn.graph';
    state.persistence.fileHandle = shaped.managers?.fileHandle || durable.snapshot?.fileHandle || durable.runtime?.persistence?.fileHandle || state.persistence.fileHandle || null;
    state.titleText = durable.titleText || state.titleText || DEFAULT_VENN_TITLE;
    state.labelPositions = cloneSimple(durable.labelPositions) || state.labelPositions || { title: null };
    state.ui.lockRatioPrevious = durable.lockRatioPrevious;
    state.drawPending = durable.drawPending === true;
    if(!state.ui.root && shaped.root){
      state.ui.root = shaped.root;
    }
    shaped.updatedAt = Date.now();
    return true;
  }

  function bindVennSessionForTab(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeVennSessionTabId(tabLike, meta);
    if(!tabId){ return null; }
    if(activeVennSession && activeVennSession.tabId && activeVennSession.tabId !== tabId){
      captureVennSessionStateFromActive(activeVennSession, {
        reason: meta?.reason || 'venn-session-switch-capture'
      });
    }
    const session = getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-session-bind' }, { create: true });
    if(!session){ return null; }
    const root = meta?.root || resolveVennRoot(tabLike || tabId || null) || session.root || null;
    session.root = root || session.root || null;
    session.refs.root = root || session.refs.root || null;
    activeVennSession = session;
    venn.__vennSessionTabId = session.tabId;
    if(options.passiveBound !== false){
      venn.__boundTabId = session.tabId;
    }
    if(options.apply === true){
      applyVennSessionStateToActive(session, options);
    }
    syncVennSessionRefsFromActive(session);
    syncVennSessionManagersFromActive(session);
    return session;
  }

  function setVennSessionStateFromRuntimeRecord(record, meta = {}){
    if(!record || typeof record !== 'object'){
      return null;
    }
    const session = getVennSession(meta?.tab || meta?.tabId || venn.__boundTabId || null, meta, { create: true });
    if(!session){
      return null;
    }
    session.state = createDefaultVennDurableState({
      ...(session.state || {}),
      runtime: record,
      fileName: record.persistence?.fileName || session.state?.fileName || 'venn.graph'
    });
    session.results = createDefaultVennResultsState({
      ...(session.results || {}),
      lastSignificance: record.analysis?.lastSignificance,
      significancePanelModel: record.analysis?.significancePanelModel
    });
    if(record.persistence?.fileHandle){
      session.managers.fileHandle = record.persistence.fileHandle;
    }
    session.updatedAt = Date.now();
    return session;
  }

  function createVennParsedDerivedCache(tabId = null){
    const suffix = tabId ? `:${String(tabId)}` : '';
    return Shared.componentLifecycle?.derivedCache?.create
      ? Shared.componentLifecycle.derivedCache.create(`venn:parsed-lists${suffix}`, { serializable: false })
      : {
          map: new Map(),
          get(signature){ return this.map.get(String(signature || '')) || null; },
          set(signature, value){ if(signature){ this.map.set(String(signature), value); } return value; },
          getOrBuild(signature, builder){
            const key = String(signature || '');
            if(key && this.map.has(key)){ return this.map.get(key); }
            const value = typeof builder === 'function' ? builder() : null;
            if(key && value != null){ this.map.set(key, value); }
            return value;
          },
          clear(){ const size = this.map.size; this.map.clear(); return size; }
        };
  }

  function getVennParsedDerivedCache(session = null){
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if(owner?.cache){
      if(!owner.cache.parsedDerivedCache){
        owner.cache.parsedDerivedCache = createVennParsedDerivedCache(owner.tabId || null);
      }
      return owner.cache.parsedDerivedCache;
    }
    return createVennParsedDerivedCache(null);
  }

  function clearVennDerivedCaches(reason = 'clear-derived-cache'){
    const session = getActiveVennSessionForState();
    try{ getVennParsedDerivedCache(session).clear(reason); }catch(_err){}
    state.analysis.lastParsedLists = null;
    state.analysis.lastRegions = null;
    state.analysis.lastUpSetRegionMap = null;
    state.analysis.lastUpSetIntersections = null;
    if(session){
      session.cache.parsedDerivedCache = null;
      session.updatedAt = Date.now();
    }
    debugLog('venn derived caches cleared', { reason });
  }
  const vennBoundRoots = new WeakSet();
  const vennTableBindingsByRoot = new WeakMap();
  let vennDocumentHandlersBound = false;
  let vennLockRatioInput = null;
  let vennAspectSyncing = false;

  function getVennSchemeId() {
    const active = global.Main?.session?.getActiveTab?.();
    if (active?.type === 'venn') {
      const payloadScheme = String(active.payload?.style?.colorScheme || '').trim().toLowerCase();
      if (payloadScheme) {
        return payloadScheme;
      }
    }
    const uiScheme = String(state.ui?.activeColorScheme || '').trim().toLowerCase();
    return uiScheme || 'scientific';
  }

  function isVennDarkScheme() {
    const resolved = Shared.colorSchemes?.resolveThemeState?.('venn', { style: { colorScheme: getVennSchemeId() } });
    return resolved ? resolved.isDark === true : getVennSchemeId() === 'dark';
  }

  function applyVennStageTheme(stage) {
    if (!stage) return;
    const dark = isVennDarkScheme();
    const backgroundColor = dark ? '#000000' : '#ffffff';
    stage.setAttribute('data-color-scheme', dark ? 'dark' : 'scientific');
    if (state.ui?.svgBox?.style) {
      if (dark) {
        state.ui.svgBox.style.backgroundColor = backgroundColor;
      } else {
        state.ui.svgBox.style.removeProperty('background-color');
      }
    }
    const staleBackgroundRect = stage.querySelector('[data-color-scheme-background="1"]');
    if (staleBackgroundRect && staleBackgroundRect.parentNode) {
      staleBackgroundRect.parentNode.removeChild(staleBackgroundRect);
    }
    if (dark) {
      stage.setAttribute('data-color-scheme-bg-color', backgroundColor);
      if (stage.style) {
        stage.style.backgroundColor = backgroundColor;
      }
    } else {
      stage.removeAttribute('data-color-scheme-bg-color');
      if (stage.style) {
        stage.style.removeProperty('background-color');
      }
    }
  }

  function createDefaultVennStyleState(){
    return {
      plotType: normalizePlotType(DEFAULT_PLOT_TYPE),
      colorA: '#e74c3c',
      colorB: '#2ecc71',
      colorC: '#3498db',
      opacity: '0.75',
      borderColor: '#999999',
      borderWidth: '1.2',
      fontsize: '12',
      title: DEFAULT_VENN_TITLE,
      labelPositions: { title: null },
      upset: {
        ...DEFAULT_UPSET_SETTINGS,
        traceStyles: {
          intersectionBars: { global: {}, traces: {} },
          setBars: { global: {}, traces: {} },
          matrix: { global: {}, traces: {} }
        }
      },
      vennTraceStyles: cloneVennTraceStyles(null)
    };
  }

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
    const session = getActiveVennSessionForState();
    if(session?.cache?.emptyPayloadTemplate){
      return;
    }
    if(session?.cache){
      session.cache.emptyPayloadTemplate = { type: 'venn' };
      session.updatedAt = Date.now();
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
    const cloned = cloneSimple(payload) || { ...payload };
    const data = cloned.data && typeof cloned.data === 'object' && !Array.isArray(cloned.data)
      ? { ...cloned.data }
      : {};
    const style = cloned.style && typeof cloned.style === 'object' && !Array.isArray(cloned.style)
      ? { ...cloned.style }
      : {};
    const notes = cloned.notes && typeof cloned.notes === 'object'
      ? { text: cloned.notes.text == null ? '' : String(cloned.notes.text), open: !!cloned.notes.open }
      : null;
    const analysis = cloned.analysis ? cloneSimple(cloned.analysis) : null;
    if(style.fontStyles){
      style.fontStyles = cloneFontStyles(style.fontStyles);
    }
    if(style.vennTraceStyles){
      style.vennTraceStyles = cloneVennTraceStyles(style.vennTraceStyles);
    }
    return {
      ...cloned,
      type: cloned.type || 'venn',
      data,
      style,
      notes,
      analysis
    };
  }

  function normalizeVennTextPayloadValue(value){
    return value == null ? '' : String(value);
  }

  function normalizeVennCountPayloadValue(value){
    return value ? String(value) : '0';
  }

  function createDefaultVennAnalysisPayload(){
    return {
      goResult: null,
      goFormatted: [],
      goOrganism: '',
      goLimit: 5,
      goPerformed: false,
      activeResultsTab: 'go',
      stringSvg: '',
      stringEnrichment: null,
      stringOverlay: normalizeStringOverlayModel(),
      stringLimit: 5,
      stringPerformed: false,
      regionSelectValue: '',
      totalGenes: '',
      speciesValue: '',
      speciesIndicator: '',
      lastSignificance: null,
      significancePanelModel: normalizeVennSignificancePanelModel({})
    };
  }

  function normalizeVennPayloadForLiveCaptureShape(payload){
    const normalized = cloneVennPayload(payload) || { type: 'venn' };
    const data = normalized.data && typeof normalized.data === 'object' ? normalized.data : {};
    const hasListContent = [data.listA, data.listB, data.listC].some(value => normalizeVennTextPayloadValue(value).trim() !== '');
    const hasOnlyLegacyDefaultLabels = !hasListContent && [data.labelA, data.labelB, data.labelC].every((value, index) => {
      const label = normalizeVennTextPayloadValue(value).trim();
      return !label || isLegacyVennDefaultLabel(label, index);
    });
    normalized.type = 'venn';
    normalized.data = {
      ...data,
      labelA: hasOnlyLegacyDefaultLabels ? getDefaultVennLabel(0) : getNormalizedVennLabel(data.labelA, 0),
      labelB: hasOnlyLegacyDefaultLabels ? getDefaultVennLabel(1) : getNormalizedVennLabel(data.labelB, 1),
      labelC: hasOnlyLegacyDefaultLabels ? getDefaultVennLabel(2) : getNormalizedVennLabel(data.labelC, 2),
      listA: normalizeVennTextPayloadValue(data.listA),
      listB: normalizeVennTextPayloadValue(data.listB),
      listC: normalizeVennTextPayloadValue(data.listC)
    };
    VENN_COUNT_KEYS.forEach(key => {
      normalized.data[key] = normalizeVennCountPayloadValue(data[key]);
    });

    const defaultStyle = createDefaultVennStyleState();
    const style = normalized.style && typeof normalized.style === 'object' ? normalized.style : {};
    normalized.style = {
      plotType: normalizePlotType(style.plotType || defaultStyle.plotType),
      colorScheme: String(style.colorScheme || state.ui?.activeColorScheme || '').trim().toLowerCase() || 'scientific',
      colorA: style.colorA ?? defaultStyle.colorA,
      colorB: style.colorB ?? defaultStyle.colorB,
      colorC: style.colorC ?? defaultStyle.colorC,
      opacity: style.opacity ?? defaultStyle.opacity,
      borderColor: style.borderColor ?? defaultStyle.borderColor,
      borderWidth: style.borderWidth ?? defaultStyle.borderWidth,
      fontsize: style.fontsize ?? defaultStyle.fontsize,
      fontStyles: style.fontStyles ? cloneFontStyles(style.fontStyles) : undefined,
      vennTraceStyles: cloneVennTraceStyles(style.vennTraceStyles),
      title: style.title !== undefined ? style.title : defaultStyle.title,
      labelPositions: cloneSimple(style.labelPositions || defaultStyle.labelPositions) || { title: null },
      upset: {
        ...defaultStyle.upset,
        ...(style.upset && typeof style.upset === 'object' ? style.upset : {})
      },
      ...Object.keys(style).reduce((extra, key) => {
        if(!['colorScheme','plotType','colorA','colorB','colorC','opacity','borderColor','borderWidth','fontsize','fontStyles','vennTraceStyles','title','labelPositions','upset'].includes(key)){
          extra[key] = style[key];
        }
        return extra;
      }, {})
    };
    if(!normalized.style.fontStyles){
      delete normalized.style.fontStyles;
    }

    normalized.notes = normalized.notes && typeof normalized.notes === 'object'
      ? { text: normalized.notes.text == null ? '' : String(normalized.notes.text), open: !!normalized.notes.open }
      : { text: '', open: false };

    const analysis = normalized.analysis && typeof normalized.analysis === 'object' ? normalized.analysis : {};
    normalized.analysis = {
      ...createDefaultVennAnalysisPayload(),
      ...cloneSimple(analysis),
      goFormatted: Array.isArray(analysis.goFormatted) ? analysis.goFormatted.slice() : [],
      stringOverlay: normalizeStringOverlayModel(analysis.stringOverlay),
      activeResultsTab: normalizeAnalysisResultsTab(analysis.activeResultsTab),
      significancePanelModel: normalizeVennSignificancePanelModel(analysis.significancePanelModel || {})
    };
    return normalized;
  }

  function assignNormalizedVennPayloadToOwner(normalizedPayload, meta = {}){
    const session = global.Main?.session;
    if(!session || typeof session.assignTabPayload !== 'function' || !normalizedPayload){
      return false;
    }
    const tabId = String(meta?.tabId || meta?.tab || venn.__boundTabId || resolveActiveVennTabId() || '').trim();
    const tab = tabId ? getVennTabById(tabId) : null;
    if(!tab){
      return false;
    }
    const ownerPayload = enrichVennPayloadForOwnerStorage(normalizedPayload, tabId, meta);
    const serialize = typeof session.serializePayloadSignature === 'function' ? session.serializePayloadSignature : null;
    if(serialize && serialize(tab.payload || null) === serialize(ownerPayload)){
      return false;
    }
    const changed = session.assignTabPayload(tab, ownerPayload, {
      reason: meta?.reason || meta?.source || 'venn-payload-normalized',
      preserveRuntimeCacheOnPayloadChange: true
    });
    debugLog('venn normalized restored payload assigned', {
      tabId,
      changed,
      reason: meta?.reason || meta?.source || 'venn-payload-normalized'
    });
    return changed;
  }

  function hydrateVennSessionFromPayload(normalizedPayload, meta = {}){
    if(!normalizedPayload || typeof normalizedPayload !== 'object'){
      return null;
    }
    const tabId = String(meta?.tabId || meta?.tab || venn.__boundTabId || resolveActiveVennTabId() || '').trim();
    const session = tabId
      ? getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-payload-hydrate-session' }, { create: true })
      : getActiveVennSessionForState();
    if(!session){
      return null;
    }
    const payload = enrichVennPayloadForOwnerStorage(normalizedPayload, tabId, meta);
    const analysis = payload?.analysis && typeof payload.analysis === 'object' ? payload.analysis : {};
    const previousSnapshot = session.state?.snapshot || {};
    const snapshot = cloneVennSessionSnapshot({
      ...previousSnapshot,
      payload,
      lastDrawMode: previousSnapshot.lastDrawMode || null,
      speciesValue: analysis.speciesValue || previousSnapshot.speciesValue || '',
      speciesIndicator: analysis.speciesIndicator || previousSnapshot.speciesIndicator || '',
      totalGenes: analysis.totalGenes || previousSnapshot.totalGenes || '',
      significanceModel: analysis.significancePanelModel || previousSnapshot.significanceModel || {},
      lastSignificance: analysis.lastSignificance || previousSnapshot.lastSignificance || null,
      regionSelectValue: analysis.regionSelectValue || previousSnapshot.regionSelectValue || '',
      fileName: session.state?.fileName || previousSnapshot.fileName || 'venn.graph',
      fileHandle: session.managers?.fileHandle || previousSnapshot.fileHandle || null
    });
    session.state = createDefaultVennDurableState({
      ...(session.state || {}),
      snapshot,
      fileName: snapshot?.fileName || session.state?.fileName || 'venn.graph',
      titleText: payload?.style?.title || session.state?.titleText || DEFAULT_VENN_TITLE,
      labelPositions: payload?.style?.labelPositions || session.state?.labelPositions || { title: null },
      notes: payload?.notes || session.state?.notes || {}
    });
    session.results = createDefaultVennResultsState(analysis);
    session.notes = createDefaultVennNotesState(payload?.notes || session.notes || {});
    session.updatedAt = Date.now();
    assignNormalizedVennPayloadToOwner(payload, {
      ...meta,
      tabId: session.tabId,
      reason: meta?.reason || (meta?.source ? `venn-payload-${meta.source}-normalized` : 'venn-payload-normalized')
    });
    debugLog('venn session hydrated from payload', {
      tabId: session.tabId || null,
      reason: meta?.reason || meta?.source || 'payload'
    });
    return session;
  }

  function getVennWorkspaceTab(tabId = null){
    const id = String(tabId || '').trim();
    if(!id){ return null; }
    const tabs = global.Main?.session?.workspaceState?.tabs || [];
    return Array.isArray(tabs)
      ? tabs.find(tab => tab && tab.type === 'venn' && String(tab.id || '') === id) || null
      : null;
  }

  function enrichVennPayloadForOwnerStorage(payload, tabId = null, meta = {}){
    let next = cloneVennPayload(payload);
    if(!next || typeof next !== 'object'){
      return next;
    }
    const ownerTabId = String(tabId || meta?.tabId || meta?.tab || venn.__boundTabId || resolveActiveVennTabId() || '').trim();
    const ownerTab = ownerTabId ? getVennWorkspaceTab(ownerTabId) : null;
    const ownerLayout = ownerTab?.layoutState || null;
    if(ownerLayout && Shared.graphSizing?.enrichPayloadWithLayout){
      try{
        next = Shared.graphSizing.enrichPayloadWithLayout('venn', next, ownerLayout, {
          context: meta?.reason ? `venn-owner-payload-${meta.reason}` : 'venn-owner-payload'
        });
      }catch(err){
        console.error('venn owner payload graph sizing enrich error', { tabId: ownerTabId || null, err });
      }
    }
    return next;
  }

  function getVennRootTabId(root = state.ui.root || null){
    return String(
      root?.dataset?.workspaceTabId
      || root?.dataset?.tabId
      || root?.getAttribute?.('data-workspace-tab-id')
      || root?.getAttribute?.('data-tab-id')
      || ''
    ).trim();
  }

  function canCaptureLiveVennPayloadForTab(tabId = null){
    const requestedTabId = String(tabId || '').trim();
    if(!requestedTabId){ return true; }
    const activeTabId = getVennActiveTabId();
    const rootTabId = getVennRootTabId();
    return (!activeTabId || activeTabId === requestedTabId)
      && (!rootTabId || rootTabId === requestedTabId);
  }

  function getStoredVennPayloadForTab(tabId = null){
    const requestedTabId = String(tabId || '').trim();
    if(!requestedTabId){ return null; }
    const session = getVennSession(requestedTabId, { tabId: requestedTabId, reason: 'venn-stored-payload' }, { create: false });
    const sessionPayload = session?.state?.snapshot?.payload || null;
    if(sessionPayload){
      return cloneVennPayload(sessionPayload);
    }
    const tabPayload = getVennWorkspaceTab(requestedTabId)?.payload || null;
    return tabPayload ? cloneVennPayload(tabPayload) : null;
  }

  function captureVennSnapshot(options = {}){
    const payload = getVennGraphPayload?.(options);
    if(!payload){
      return null;
    }
    const tabId = normalizeVennSessionTabId(options?.tabId || options?.tab || null, options || {})
      || resolveActiveVennTabId()
      || venn.__boundTabId
      || '';
    const snapshot = {
      payload: enrichVennPayloadForOwnerStorage(payload, tabId, options || {}),
      lastDrawMode: state.analysis.lastDrawMode || null,
      speciesValue: state.ui.speciesSelect ? state.ui.speciesSelect.value || '' : '',
      speciesIndicator: state.ui.speciesSelect ? state.ui.speciesSelect.style?.backgroundColor || '' : '',
      totalGenes: state.ui.totalGenesInput ? state.ui.totalGenesInput.value || '' : '',
      significanceHtml: state.ui.significanceResults ? state.ui.significanceResults.innerHTML || '' : '',
      significanceModel: captureVennSignificancePanelModel(),
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
    state.ui.syncTableFromInputs?.({ refresh: true, skipPayloadSync: true });
    if(counts.nA) counts.nA.value = data.nA != null ? String(data.nA) : '';
    if(counts.nB) counts.nB.value = data.nB != null ? String(data.nB) : '';
    if(counts.nC) counts.nC.value = data.nC != null ? String(data.nC) : '';
    if(counts.nAB) counts.nAB.value = data.nAB != null ? String(data.nAB) : '';
    if(counts.nAC) counts.nAC.value = data.nAC != null ? String(data.nAC) : '';
    if(counts.nBC) counts.nBC.value = data.nBC != null ? String(data.nBC) : '';
    if(counts.nABC) counts.nABC.value = data.nABC != null ? String(data.nABC) : '';
    const style = snapshot.payload.style || {};
    importFontStyles('venn', style.fontStyles || null);
    state.analysis.vennTraceStyles = cloneVennTraceStyles(style.vennTraceStyles);
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
    state.analysis.significancePanelModel = normalizeVennSignificancePanelModel(snapshot.significanceModel || {});
    if(!restoreVennSignificancePanelModel(state.analysis.significancePanelModel) && state.ui.significanceResults){
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
    state.analysis.significancePanelModel = normalizeVennSignificancePanelModel(snapshot.significanceModel || state.analysis.significancePanelModel || {});
    if(!restoreVennSignificancePanelModel(state.analysis.significancePanelModel) && state.ui.significanceResults){
      state.ui.significanceResults.innerHTML = snapshot.significanceHtml || '';
    }
    state.analysis.lastSignificance = snapshot.lastSignificance ? { ...snapshot.lastSignificance } : null;
    if(state.ui.speciesSelect){
      state.ui.speciesSelect.value = snapshot.speciesValue || '';
      state.ui.speciesSelect.style.backgroundColor = snapshot.speciesIndicator || '';
    }
    return true;
  }

  function cloneMapEntries(map){
    if(!(map instanceof Map)){
      return [];
    }
    return Array.from(map.entries()).map(([key, value]) => {
      const cloned = cloneSimple(value);
      return [key, cloned !== null ? cloned : value];
    });
  }

  function restoreMapEntries(entries){
    const next = new Map();
    if(!Array.isArray(entries)){
      return next;
    }
    entries.forEach(entry => {
      if(!Array.isArray(entry) || entry.length < 2){
        return;
      }
      const key = entry[0];
      const value = cloneSimple(entry[1]);
      next.set(key, value !== null ? value : entry[1]);
    });
    return next;
  }

  function normalizeVennSet(value){
    if(value instanceof Set){
      return value;
    }
    if(Array.isArray(value)){
      return new Set(value.map(item => String(item || '').trim()).filter(Boolean));
    }
    if(value && typeof value === 'object' && Array.isArray(value.values)){
      return new Set(value.values.map(item => String(item || '').trim()).filter(Boolean));
    }
    return new Set();
  }

  function normalizeVennRegionSetMap(value){
    if(!value || typeof value !== 'object'){
      return null;
    }
    const next = {};
    Object.keys(value).forEach(key => {
      next[key] = normalizeVennSet(value[key]);
    });
    return next;
  }

  function normalizeVennRegions(value){
    const normalized = normalizeVennRegionSetMap(value);
    if(!normalized){
      return null;
    }
    ['A','B','C','Aonly','Bonly','Conly','AB','AC','BC','ABC'].forEach(key => {
      if(!(normalized[key] instanceof Set)){
        normalized[key] = new Set();
      }
    });
    return normalized;
  }

  function normalizeVennIntersections(value){
    return Array.isArray(value) ? value.map(entry => ({
      ...entry,
      items: Array.isArray(entry?.items) ? entry.items.map(item => String(item || '').trim()).filter(Boolean) : []
    })) : null;
  }

  function resetVennRuntimeState(){
    cancelPendingSpeciesDetection('runtime-reset', { abortActive: true, resetIndicator: false });
    state.persistence.fileHandle = null;
    state.persistence.fileName = 'venn.graph';
    clearVennDerivedCaches('runtime-reset');
    state.analysis.significanceCache = null;
    state.analysis.speciesDetection = {
      cache: new Map(),
      pendingTimeoutId: null,
      pendingReason: null,
      active: null,
      delayMs: 1200
    };
    if(state.ui.speciesSelect){
      state.ui.speciesSelect.value = '';
      state.ui.speciesSelect.style.backgroundColor = '';
    }
  }

  function captureVennRuntimeStateSnapshot(){
    const detection = getSpeciesDetectionState();
    return {
      persistence: {
        fileHandle: state.persistence.fileHandle || null,
        fileName: state.persistence.fileName || 'venn.graph'
      },
      analysis: {
        significanceCache: cloneSimple(state.analysis.significanceCache),
        lastSignificance: cloneSimple(state.analysis.lastSignificance),
        significancePanelModel: captureVennSignificancePanelModel(),
        speciesDetection: {
          cacheEntries: cloneMapEntries(detection.cache),
          delayMs: Number.isFinite(detection.delayMs) ? detection.delayMs : 1200
        }
      },
      ui: {
        speciesValue: state.ui.speciesSelect ? (state.ui.speciesSelect.value || '') : '',
        speciesIndicator: state.ui.speciesSelect ? (state.ui.speciesSelect.style?.backgroundColor || '') : '',
        totalGenes: state.ui.totalGenesInput ? (state.ui.totalGenesInput.value || '') : '',
        regionSelectValue: state.ui.regionSelect ? (state.ui.regionSelect.value || '') : ''
      }
    };
  }

  function applyVennRuntimeStateSnapshot(snapshot){
    resetVennRuntimeState();
    const next = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const persistence = next.persistence && typeof next.persistence === 'object'
      ? next.persistence
      : {};
    const analysis = next.analysis && typeof next.analysis === 'object'
      ? next.analysis
      : {};
    const ui = next.ui && typeof next.ui === 'object'
      ? next.ui
      : {};
    state.persistence.fileHandle = persistence.fileHandle || null;
    state.persistence.fileName = persistence.fileName || 'venn.graph';
    clearVennDerivedCaches('runtime-apply');
    state.analysis.significanceCache = analysis.significanceCache ? cloneSimple(analysis.significanceCache) : null;
    state.analysis.lastSignificance = analysis.lastSignificance ? cloneSimple(analysis.lastSignificance) : null;
    state.analysis.significancePanelModel = normalizeVennSignificancePanelModel(analysis.significancePanelModel || {});
    const detection = getSpeciesDetectionState();
    const detectionSnapshot = analysis.speciesDetection && typeof analysis.speciesDetection === 'object'
      ? analysis.speciesDetection
      : {};
    detection.cache = restoreMapEntries(detectionSnapshot.cacheEntries);
    detection.pendingTimeoutId = null;
    detection.pendingReason = null;
    detection.active = null;
    detection.delayMs = Number.isFinite(detectionSnapshot.delayMs) ? detectionSnapshot.delayMs : 1200;
    if(state.ui.speciesSelect){
      state.ui.speciesSelect.value = ui.speciesValue || '';
      state.ui.speciesSelect.style.backgroundColor = ui.speciesIndicator || '';
    }
    if(state.ui.totalGenesInput){
      state.ui.totalGenesInput.value = ui.totalGenes || '';
    }
    if(state.ui.regionSelect && ui.regionSelectValue){
      state.ui.regionSelect.value = ui.regionSelectValue;
    }
    restoreVennSignificancePanelModel(state.analysis.significancePanelModel);
    return true;
  }

  function normalizeVennSignificancePanelModel(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return Shared.statsReporting && typeof Shared.statsReporting.normalizeSavedPanelModel === 'function'
      ? Shared.statsReporting.normalizeSavedPanelModel(src)
      : {
        resultsModel: cloneSimple(src.resultsModel) || null,
        reportModel: cloneSimple(src.reportModel) || null
      };
  }

  function captureVennSignificancePanelModel(fallback = null){
    const previous = normalizeVennSignificancePanelModel(fallback || state.analysis.significancePanelModel || {});
    if(!state.ui.significanceResults || !Shared.statsReporting || typeof Shared.statsReporting.capturePanelModel !== 'function'){
      state.analysis.significancePanelModel = previous;
      return state.analysis.significancePanelModel;
    }
    state.analysis.significancePanelModel = normalizeVennSignificancePanelModel(Shared.statsReporting.capturePanelModel(state.ui.significanceResults) || previous);
    return state.analysis.significancePanelModel;
  }

  function vennSignificancePanelModelHasContent(model){
    const normalized = normalizeVennSignificancePanelModel(model);
    return !!(normalized.resultsModel || normalized.reportModel);
  }

  function restoreVennSignificancePanelModel(model){
    const normalized = normalizeVennSignificancePanelModel(model);
    if(!state.ui.significanceResults || !vennSignificancePanelModelHasContent(normalized)){
      return false;
    }
    if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function'){
      Shared.statsReporting.restorePanelModel(state.ui.significanceResults, normalized, { clearMainWhenMissing: false });
      state.analysis.significancePanelModel = normalized;
      Shared.statsTable?.rehydrateExportControls?.(state.ui.significanceResults);
      return true;
    }
    return false;
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
    const vennTraceStylesA = cloneVennTraceStyles(styleA.vennTraceStyles || null);
    const vennTraceStylesB = cloneVennTraceStyles(styleB.vennTraceStyles || null);
    if(JSON.stringify(vennTraceStylesA) !== JSON.stringify(vennTraceStylesB)){
      return false;
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
    const recorder = Shared.styleUndo?.recordStateChange || (opts => vennUndoManager.recordStateChange(opts));
    recorder({
      manager: vennUndoManager,
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

  function resolveVennDrawableFrame(targetEl) {
    const target = targetEl || state.ui?.stage || getVennNodeById('stage');
    const svgBox = state.ui?.svgBox
      || target?.closest?.('.svgbox')
      || state.ui?.graphPanel?.querySelector?.('.svgbox')
      || queryVennRoot('#vennGraphPanel .svgbox')
      || null;
    const frame = Shared.componentLayout?.resolveDrawableFrame?.({
      componentName: 'venn',
      plot: target,
      svgBox,
      graphPanel: state.ui?.graphPanel || queryVennRoot('#vennGraphPanel')
    });
    if(frame){
      return frame;
    }
    return {
      width: Math.max(0, Number(target?.clientWidth) || 0),
      height: Math.max(0, Number(target?.clientHeight) || 0),
      rawWidth: Math.max(0, Number(target?.clientWidth) || 0),
      rawHeight: Math.max(0, Number(target?.clientHeight) || 0),
      constrained: false,
      source: 'plot-fallback',
      authority: 'plot-fallback',
      svgBox,
      viewport: null,
      zoomScale: 1
    };
  }

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

  function readStringNetworkBaseViewport(svgEl){
    if(!svgEl){ return null; }
    const stored = parseViewBox(svgEl.getAttribute(STRING_NETWORK_BASE_VIEWBOX_ATTR));
    if(stored && Number.isFinite(stored.width) && Number.isFinite(stored.height)){
      return stored;
    }
    const viewBox = parseViewBox(svgEl.getAttribute('viewBox'));
    const widthAttr = parsePositiveFloat(svgEl.getAttribute('width'));
    const heightAttr = parsePositiveFloat(svgEl.getAttribute('height'));
    const width = Number.isFinite(viewBox?.width) ? viewBox.width : widthAttr;
    const height = Number.isFinite(viewBox?.height) ? viewBox.height : heightAttr;
    if(!Number.isFinite(width) || !Number.isFinite(height)){
      return null;
    }
    const base = {
      x: Number.isFinite(viewBox?.x) ? viewBox.x : 0,
      y: Number.isFinite(viewBox?.y) ? viewBox.y : 0,
      width,
      height
    };
    svgEl.setAttribute(STRING_NETWORK_BASE_VIEWBOX_ATTR, `${base.x} ${base.y} ${base.width} ${base.height}`);
    return base;
  }

  function padStringNetworkViewport(svgEl, options = {}) {
    if (!svgEl) {
      return;
    }
    const exportHost = options.exportHost || null;
    const exportRect = exportHost?.getBoundingClientRect?.();
    const exportHeight = Number.isFinite(exportRect?.height) ? exportRect.height : 0;
    const padding = Math.max(24, Math.round(exportHeight + 12));
    const base = readStringNetworkBaseViewport(svgEl);
    if (!base) {
      return;
    }
    let minX = base.x;
    let minY = base.y;
    let maxX = base.x + base.width;
    let maxY = base.y + base.height;
    try {
      const box = svgEl.getBBox?.();
      if (box && Number.isFinite(box.x) && Number.isFinite(box.y) && Number.isFinite(box.width) && Number.isFinite(box.height)) {
        const contentPadding = 12;
        minX = Math.min(minX, box.x - contentPadding);
        minY = Math.min(minY, box.y - contentPadding);
        maxX = Math.max(maxX, box.x + box.width + contentPadding);
        maxY = Math.max(maxY, box.y + box.height + contentPadding);
      }
    } catch (_err) {
      // Keep STRING's native viewport when bbox measurement is unavailable.
    }
    maxY += padding;
    const nextWidth = Math.max(1, Math.ceil(maxX - minX));
    const nextHeight = Math.max(1, Math.ceil(maxY - minY));
    svgEl.setAttribute('viewBox', `${minX} ${minY} ${nextWidth} ${nextHeight}`);
    svgEl.setAttribute('height', String(nextHeight));
    svgEl.style.setProperty('overflow', 'visible');
    svgEl.setAttribute('overflow', 'visible');
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    if (debugEnabled) {
      debug('Debug: venn string network viewport padded', {
        padding,
        exportHeight,
        baseWidth: base.width,
        baseHeight: base.height,
        nextWidth,
        nextHeight,
        hasBaseViewBox: true
      });
    }
  }

  function scheduleStringNetworkViewport(svgEl = state.ui.stringNetwork?.querySelector?.('svg'), reason = 'venn-string-network-viewport'){
    if(!svgEl){ return; }
    const run = () => padStringNetworkViewport(svgEl, { exportHost: state.ui.stringNetworkExport });
    Shared.componentLifecycle?.scheduleComponentFrame?.(venn, 'venn', {
      tabId: venn.__boundTabId || null,
      reason
    }, run) || global.requestAnimationFrame?.(run) || global.setTimeout(run, 0);
  }

  // --- Core Functions ---

  function ensureInputs() {
    if (!state.ui.inputs) throw new Error('Venn inputs not initialized');
    return state.ui.inputs;
  }

  function getVennInputValue(inputs, key, fallback) {
    const el = inputs?.[key];
    if (el && typeof el.value !== 'undefined') {
      return String(el.value);
    }
    return fallback;
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

  function ensureVennDefaultTableHeaders(hotInstance) {
    const hot = hotInstance || state.ui?.hot;
    if (!hot || typeof hot.getData !== 'function' || typeof hot.setDataAtCell !== 'function') {
      return false;
    }
    const matrix = hot.getData?.() || [];
    const header = Array.isArray(matrix[0]) ? matrix[0] : [];
    const hasBodyData = matrix.slice(1).some(row => Array.isArray(row) && row.some(value => value != null && String(value).trim() !== ''));
    if (hasBodyData) {
      return false;
    }
    const changes = [];
    for (let col = 0; col < DEFAULT_VENN_TABLE_HEADERS.length; col += 1) {
      const current = header[col] != null ? String(header[col]).trim() : '';
      if (!current || current === LEGACY_VENN_TABLE_HEADERS[col]) {
        changes.push([0, col, DEFAULT_VENN_TABLE_HEADERS[col]]);
      }
    }
    if (!changes.length) {
      return false;
    }
    hot.setDataAtCell(changes, 'venn-default-header-seed');
    return true;
  }

  function getDefaultVennLabel(index) {
    return DEFAULT_VENN_TABLE_HEADERS[index] || `Set ${index + 1}`;
  }

  function isLegacyVennDefaultLabel(value, index) {
    return String(value == null ? '' : value).trim() === (LEGACY_VENN_TABLE_HEADERS[index] || '');
  }

  function getNormalizedVennLabel(value, index) {
    return String(value == null ? '' : value).trim() || getDefaultVennLabel(index);
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
    const hasRequiredInputs = !!(
      inputs.labelA && inputs.labelB && inputs.labelC
      && inputs.A && inputs.B && inputs.C
    );
    if(!hasRequiredInputs){
      debugLog('table sync skipped: missing venn inputs', {
        hasLabelA: !!inputs.labelA,
        hasLabelB: !!inputs.labelB,
        hasLabelC: !!inputs.labelC,
        hasA: !!inputs.A,
        hasB: !!inputs.B,
        hasC: !!inputs.C
      });
      return;
    }
    const matrix = hot.getData?.() || [];
    const tableSignature = makeTableSignature(matrix);
    const tableChanged = tableSignature !== state.analysis.lastTableSignature;
    state.analysis.lastTableSignature = tableSignature;
    const header = matrix[0] || [];
    const next = {
      labelA: getNormalizedVennLabel(header[0], 0),
      labelB: getNormalizedVennLabel(header[1], 1),
      labelC: getNormalizedVennLabel(header[2], 2),
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
          getNormalizedVennLabel(inputs.labelA.value, 0),
          getNormalizedVennLabel(inputs.labelB.value, 1),
          getNormalizedVennLabel(inputs.labelC.value, 2)
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
    // Programmatic input sync (e.g. paste-into-textarea, sample-data load) is a user
    // intent — flush it through the authoritative payload immediately so the next
    // lifecycle persist sees a dirty tab and captures the new state. Without this,
    // the activate-switch-on-clean-tab skip would drop the change on the floor.
    if (options.skipPayloadSync !== true) {
      try { persistActiveVennUserChange('venn-inputs-sync'); } catch (err) { /* swallow */ }
    }
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
    const derivedCache = getVennParsedDerivedCache();
    let parsed = derivedCache.get(signature) || state.analysis.lastParsedLists;
    const parsedMaps = parsed && parsed.maps;
    const parsedMapsValid = parsedMaps && parsedMaps.A instanceof Map && parsedMaps.B instanceof Map && parsedMaps.C instanceof Map;
    if (parsed && parsed.signature === signature && !parsedMapsValid) {
      // Parsed-list caches are derived, non-serializable state. If a stale
      // JSON-cloned object reaches this path, clear the derived cache and
      // rebuild from payload/input text rather than trying to use plain objects
      // as Maps/Sets.
      try { derivedCache.clear('invalid-parsed-list-cache'); } catch (_err) {}
      if (state.analysis.lastParsedLists === parsed) {
        state.analysis.lastParsedLists = null;
      }
      parsed = null;
      debugLog('parsed lists cache invalidated before rebuild', { signature, reason });
    }
    if (parsed && parsed.signature === signature && parsedMapsValid) {
      if (includeRegions && !parsed.regions) {
        parsed.regions = populateRegionSets(parsed.maps, parsed.regions);
        debugLog('parsed lists region cache hydrated', { signature, reason });
      } else {
        debugLog('parsed lists derived cache hit', { signature, includeRegions, reason });
      }
      state.analysis.lastParsedLists = parsed;
      return parsed;
    }

    parsed = derivedCache.getOrBuild(signature, () => {
      const lists = {
        A: parseList(sources.A, caseSensitive, mode),
        B: parseList(sources.B, caseSensitive, mode),
        C: parseList(sources.C, caseSensitive, mode)
      };
      const maps = buildMapsFromLists(lists);
      const uniques = buildUniqueSetsFromMaps(maps);
      const regions = includeRegions ? populateRegionSets(maps, null) : null;
      return { signature, mode, caseSensitive, lists, maps, uniques, regions };
    }, { reason });
    if(includeRegions && parsed && !parsed.regions){
      parsed.regions = populateRegionSets(parsed.maps, null);
    }
    state.analysis.lastParsedLists = parsed;
    const refreshedLists = parsed?.lists || { A: [], B: [], C: [] };
    const refreshedRegions = parsed?.regions || null;
    debugLog('parsed lists cache refreshed', {
      signature,
      includeRegions,
      counts: {
        A: Array.isArray(refreshedLists.A) ? refreshedLists.A.length : 0,
        B: Array.isArray(refreshedLists.B) ? refreshedLists.B.length : 0,
        C: Array.isArray(refreshedLists.C) ? refreshedLists.C.length : 0
      }
    });
    if (refreshedRegions) {
      debugLog('parsed lists regions populated', {
        signature,
        sizes: {
          A: refreshedRegions.A?.size || 0,
          B: refreshedRegions.B?.size || 0,
          C: refreshedRegions.C?.size || 0,
          Aonly: refreshedRegions.Aonly?.size || 0,
          Bonly: refreshedRegions.Bonly?.size || 0,
          Conly: refreshedRegions.Conly?.size || 0,
          AB: refreshedRegions.AB?.size || 0,
          AC: refreshedRegions.AC?.size || 0,
          BC: refreshedRegions.BC?.size || 0,
          ABC: refreshedRegions.ABC?.size || 0
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

  function ensureVennEmptyNoticeElement() {
    const stage = state.ui.stage;
    const svgBox = state.ui.svgBox || stage?.closest?.('.svgbox') || state.ui.graphPanel?.querySelector?.('.svgbox') || null;
    if (!state.ui.svgBox && svgBox) {
      state.ui.svgBox = svgBox;
    }
    if (!svgBox) return null;
    let noticeEl = state.ui.emptyNotice;
    if (noticeEl && noticeEl.isConnected) {
      return noticeEl;
    }
    noticeEl = svgBox.querySelector('#vennMessage');
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.id = 'vennMessage';
      noticeEl.className = 'venn-message plot-empty-notice';
      noticeEl.setAttribute('role', 'status');
      noticeEl.setAttribute('aria-live', 'polite');
      noticeEl.hidden = true;
      svgBox.appendChild(noticeEl);
    }
    state.ui.emptyNotice = noticeEl;
    return noticeEl;
  }

  function hideVennEmptyPlotNotice() {
    const noticeEl = state.ui.emptyNotice || ensureVennEmptyNoticeElement();
    if (!noticeEl) return;
    noticeEl.textContent = '';
    noticeEl.hidden = true;
  }

  function renderVennEmptyPlotNotice(message) {
    const noticeEl = ensureVennEmptyNoticeElement();
    if (!noticeEl) return;
    const noticeMessage = (Shared.getEmptyPlotNoticeMessage
      ? Shared.getEmptyPlotNoticeMessage(message)
      : (String(message || '').trim() || 'Add data to the input table to generate a plot.'));
    noticeEl.hidden = false;
    if (typeof Shared.renderPlotNotice === 'function') {
      Shared.renderPlotNotice(noticeEl, noticeMessage, { resetAspect: false, show: true });
      return;
    }
    while (noticeEl.firstChild) noticeEl.removeChild(noticeEl.firstChild);
    const notice = document.createElement('i');
    notice.textContent = noticeMessage;
    noticeEl.appendChild(notice);
  }

  function captureVennEmptyNoticeState(){
    const noticeEl = state.ui.emptyNotice || state.ui.svgBox?.querySelector?.('#vennMessage') || null;
    if(!noticeEl){
      return null;
    }
    return {
      hidden: noticeEl.hidden !== false,
      html: noticeEl.innerHTML || '',
      text: noticeEl.textContent || ''
    };
  }

  function applyVennEmptyNoticeState(snapshot = null, options = {}){
    const hasSnapshot = !!(snapshot && typeof snapshot === 'object');
    if(!hasSnapshot){
      if(options.hideWhenMissing === true){
        hideVennEmptyPlotNotice();
      }
      return false;
    }
    const noticeEl = ensureVennEmptyNoticeElement();
    if(!noticeEl){
      return false;
    }
    if(typeof snapshot.html === 'string'){
      noticeEl.innerHTML = snapshot.html;
    }else{
      noticeEl.textContent = snapshot.text == null ? '' : String(snapshot.text);
    }
    noticeEl.hidden = snapshot.hidden !== false;
    return true;
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

  function ensureUpSetFontBindings(stage) {
    if (!stage) return;
    const textNodes = Array.from(stage.querySelectorAll('text'));
    let boundCount = 0;
    textNodes.forEach((node, idx) => {
      if (!node || node.dataset?.fontEditable === '0') return;
      const role = node.dataset?.fontRole || 'upsetLabel';
      const key = node.dataset?.fontKey || `upset-text-${idx + 1}`;
      const needsBinding = node.dataset?.fontEditable !== '1' || !node.dataset?.fontKey;
      if (needsBinding) {
        markFontEditable(node, role, key);
        boundCount += 1;
      }
    });
    debugLog('upset font bindings ensured', {
      textCount: textNodes.length,
      boundCount
    });
  }

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
        const textColor = isVennDarkScheme() ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000');
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
    const fontInput = inputs.fontsize || state.ui.inputs?.fontsize || getVennNodeById('fontsize');
    if(fontInput && fontInput.dataset && typeof fontInput.dataset.fontBasePt === 'undefined'){
      fontInput.dataset.fontBasePt = String(fontInput.value || rawSize || '');
      debug('Debug: venn font size base ensured', { value: fontInput.value }); // Debug: ensure base dataset
    }
    const drawableFrame = resolveVennDrawableFrame(stageEl);
    const dataset = svgBox?.dataset || {};
    const parsedDefaultWidth = parsePositiveFloat(chartStyle.DEFAULT_WIDTH);
    const parsedDefaultHeight = parsePositiveFloat(chartStyle.DEFAULT_HEIGHT);
    const defaultWidth = parsePositiveFloat(dataset.resizerDefaultWidth)
      || (Number.isFinite(parsedDefaultWidth) ? parsedDefaultWidth : DEFAULT_STAGE_WIDTH);
    const defaultHeight = parsePositiveFloat(dataset.resizerDefaultHeight)
      || (Number.isFinite(parsedDefaultHeight) ? parsedDefaultHeight : DEFAULT_STAGE_HEIGHT);
    const storedWidth = parsePositiveFloat(dataset.resizerWidth);
    const storedHeight = parsePositiveFloat(dataset.resizerHeight);
    const frameWidth = parsePositiveFloat(drawableFrame.width);
    const frameHeight = parsePositiveFloat(drawableFrame.height);
    const effectiveWidth = Number.isFinite(frameWidth) ? frameWidth : storedWidth;
    const effectiveHeight = Number.isFinite(frameHeight) ? frameHeight : storedHeight;
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
        styleScale: info?.scaleInfo?.styleScale
      });
      return info;
    }
    let normalized = null;
    if (typeof chartStyle.normalizeFontSize === 'function') {
      normalized = chartStyle.normalizeFontSize(rawSize);
    } else {
      const basePt = chartStyle.BASE_FONT_SIZE_PT || 12;
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
      textScale: 1
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

  function cloneVennTraceStyles(styles){
    const source = styles && typeof styles === 'object' ? styles : {};
    const sourceTraces = source.traces && typeof source.traces === 'object'
      ? source.traces
      : {};
    const traces = {};
    Object.keys(sourceTraces).forEach(traceId => {
      const traceStyle = sourceTraces[traceId];
      if(!traceStyle || typeof traceStyle !== 'object'){
        return;
      }
      const nextTraceStyle = {};
      if(Object.prototype.hasOwnProperty.call(traceStyle, 'fill')){
        nextTraceStyle.fill = sanitizeColor(traceStyle.fill, '#2f2f2f');
      }
      if(Object.prototype.hasOwnProperty.call(traceStyle, 'borderColor')){
        nextTraceStyle.borderColor = sanitizeColor(traceStyle.borderColor, '#000000');
      }
      if(Object.prototype.hasOwnProperty.call(traceStyle, 'borderWidth')){
        nextTraceStyle.borderWidth = clampNumber(traceStyle.borderWidth, 0, 0);
      }
      if(Object.prototype.hasOwnProperty.call(traceStyle, 'opacity')){
        nextTraceStyle.opacity = clampNumber(traceStyle.opacity, 1, 0, 1);
      }
      if(Object.keys(nextTraceStyle).length){
        traces[traceId] = nextTraceStyle;
      }
    });
    return { traces };
  }

  function ensureVennTraceStyles(){
    state.analysis.vennTraceStyles = cloneVennTraceStyles(state.analysis?.vennTraceStyles);
    return state.analysis.vennTraceStyles;
  }

  function resolveVennTraceBaseStyle(traceId, fallback = {}){
    const inputs = state.ui?.inputs || {};
    const traceKey = traceId ? `color${traceId}` : null;
    const fallbackFill = sanitizeColor(fallback.fill, '#2f2f2f');
    const fillValue = traceKey && inputs[traceKey]
      ? sanitizeColor(inputs[traceKey].value, fallbackFill)
      : fallbackFill;
    return {
      fill: fillValue,
      borderColor: sanitizeColor(inputs.borderColor?.value, sanitizeColor(fallback.borderColor, '#999999')),
      borderWidth: clampNumber(inputs.borderWidth?.value, clampNumber(fallback.borderWidth, 1.2, 0), 0),
      opacity: clampNumber(inputs.opacity?.value, clampNumber(fallback.opacity, 0.75, 0, 1), 0, 1)
    };
  }

  function getVennTraceStyle(traceId, fallback = {}){
    const styles = ensureVennTraceStyles();
    const traceStyle = traceId && styles.traces && styles.traces[traceId] && typeof styles.traces[traceId] === 'object'
      ? styles.traces[traceId]
      : {};
    return Object.assign({}, fallback, traceStyle);
  }

  function updateVennTraceStyle(scope, traceId, patch){
    if(!patch || typeof patch !== 'object'){
      return;
    }
    const inputs = state.ui?.inputs || {};
    const styles = ensureVennTraceStyles();
    const safeScope = scope === 'global' ? 'global' : 'trace';
    const normalizedPatch = {};
    if(Object.prototype.hasOwnProperty.call(patch, 'fill')){
      normalizedPatch.fill = sanitizeColor(patch.fill, '#2f2f2f');
    }
    if(Object.prototype.hasOwnProperty.call(patch, 'borderColor')){
      normalizedPatch.borderColor = sanitizeColor(patch.borderColor, '#000000');
    }
    if(Object.prototype.hasOwnProperty.call(patch, 'borderWidth')){
      normalizedPatch.borderWidth = clampNumber(patch.borderWidth, clampNumber(inputs.borderWidth?.value, 1.2, 0), 0);
    }
    if(Object.prototype.hasOwnProperty.call(patch, 'opacity')){
      normalizedPatch.opacity = clampNumber(patch.opacity, clampNumber(inputs.opacity?.value, 0.75, 0, 1), 0, 1);
    }
    const patchKeys = Object.keys(normalizedPatch);
    if(!patchKeys.length){
      return;
    }
    let labelsChanged = false;
    if(safeScope === 'global'){
      if(Object.prototype.hasOwnProperty.call(normalizedPatch, 'fill')){
        ['colorA', 'colorB', 'colorC'].forEach(key => {
          if(inputs[key]){
            inputs[key].value = normalizedPatch.fill;
            labelsChanged = true;
          }
        });
      }
      if(Object.prototype.hasOwnProperty.call(normalizedPatch, 'borderColor') && inputs.borderColor){
        inputs.borderColor.value = normalizedPatch.borderColor;
      }
      if(Object.prototype.hasOwnProperty.call(normalizedPatch, 'borderWidth') && inputs.borderWidth){
        inputs.borderWidth.value = String(normalizedPatch.borderWidth);
        if(inputs.borderWidthVal){
          inputs.borderWidthVal.textContent = inputs.borderWidth.value;
        }
      }
      if(Object.prototype.hasOwnProperty.call(normalizedPatch, 'opacity') && inputs.opacity){
        inputs.opacity.value = String(normalizedPatch.opacity);
        if(inputs.opacityVal){
          inputs.opacityVal.textContent = inputs.opacity.value;
        }
      }
      if(styles.traces && typeof styles.traces === 'object'){
        let clearedStyleCount = 0;
        let removedTraceCount = 0;
        Object.keys(styles.traces).forEach(currentTraceId => {
          const traceStyle = styles.traces[currentTraceId];
          if(!traceStyle || typeof traceStyle !== 'object'){
            delete styles.traces[currentTraceId];
            removedTraceCount += 1;
            return;
          }
          const nextTraceStyle = { ...traceStyle };
          let traceChanged = false;
          patchKeys.forEach(styleKey => {
            if(Object.prototype.hasOwnProperty.call(nextTraceStyle, styleKey)){
              delete nextTraceStyle[styleKey];
              clearedStyleCount += 1;
              traceChanged = true;
            }
          });
          if(!traceChanged){
            return;
          }
          if(Object.keys(nextTraceStyle).length){
            styles.traces[currentTraceId] = nextTraceStyle;
          }else{
            delete styles.traces[currentTraceId];
            removedTraceCount += 1;
          }
        });
        if(clearedStyleCount || removedTraceCount){
          debugLog('venn global trace overrides cleared', {
            traceId,
            clearedStyleCount,
            removedTraceCount,
            keys: patchKeys
          });
        }
      }
    }else if(traceId){
      if(Object.prototype.hasOwnProperty.call(normalizedPatch, 'fill')){
        const fillKey = `color${traceId}`;
        if(inputs[fillKey]){
          inputs[fillKey].value = normalizedPatch.fill;
          labelsChanged = true;
        }
      }
      const tracePatch = { ...normalizedPatch };
      if(Object.keys(tracePatch).length){
        styles.traces = styles.traces || {};
        styles.traces[traceId] = Object.assign({}, styles.traces[traceId] || {}, tracePatch);
      }
    }
    if(labelsChanged){
      updateColorLabels(getCurrentVennLabelMap());
    }
    requestScheduledDraw('venn-trace-style');
    syncActiveVennPayload('venn-trace-style');
  }

  function cloneUpSetTraceStyles(styles){
    const source = styles && typeof styles === 'object' ? styles : {};
    const normalizeBucket = bucket => {
      const value = bucket && typeof bucket === 'object' ? bucket : {};
      return {
        global: value.global && typeof value.global === 'object' ? { ...value.global } : {},
        traces: value.traces && typeof value.traces === 'object' ? { ...value.traces } : {}
      };
    };
    return {
      intersectionBars: normalizeBucket(source.intersectionBars),
      setBars: normalizeBucket(source.setBars),
      matrix: normalizeBucket(source.matrix)
    };
  }

  function ensureUpSetTraceStyles(){
    state.analysis.upsetTraceStyles = cloneUpSetTraceStyles(state.analysis?.upsetTraceStyles);
    return state.analysis.upsetTraceStyles;
  }

  function getUpSetTraceStyle(kind, traceId, fallback = {}){
    const styles = ensureUpSetTraceStyles();
    const bucket = styles[kind] || { global: {}, traces: {} };
    const globalStyle = bucket.global && typeof bucket.global === 'object' ? bucket.global : {};
    const traceStyle = traceId && bucket.traces && bucket.traces[traceId] && typeof bucket.traces[traceId] === 'object'
      ? bucket.traces[traceId]
      : {};
    return Object.assign({}, fallback, globalStyle, traceStyle);
  }

  function updateUpSetTraceStyle(kind, scope, traceId, patch){
    if(!kind || !patch || typeof patch !== 'object'){
      return;
    }
    const styles = ensureUpSetTraceStyles();
    const bucket = styles[kind] || (styles[kind] = { global: {}, traces: {} });
    const safeScope = scope === 'global' ? 'global' : 'trace';
    const normalizedPatch = {};
    if(Object.prototype.hasOwnProperty.call(patch, 'fill')){
      normalizedPatch.fill = sanitizeColor(patch.fill, '#2f2f2f');
    }
    if(Object.prototype.hasOwnProperty.call(patch, 'borderColor')){
      normalizedPatch.borderColor = sanitizeColor(patch.borderColor, '#000000');
    }
    if(Object.prototype.hasOwnProperty.call(patch, 'borderWidth')){
      normalizedPatch.borderWidth = clampNumber(patch.borderWidth, 0, 0);
    }
    if(Object.prototype.hasOwnProperty.call(patch, 'opacity')){
      normalizedPatch.opacity = clampNumber(patch.opacity, 1, 0, 1);
    }
    if(Object.prototype.hasOwnProperty.call(patch, 'size')){
      normalizedPatch.size = clampNumber(patch.size, DEFAULT_UPSET_SETTINGS.dotSize, 2, 12);
    }
    const patchKeys = Object.keys(normalizedPatch);
    if(!patchKeys.length){
      return;
    }
    if(safeScope === 'global'){
      bucket.global = Object.assign({}, bucket.global || {}, normalizedPatch);
      // Global edits should become the new baseline for every trace.
      // Remove overlapping trace-level keys so prior per-trace edits do not shadow the global update.
      if(bucket.traces && typeof bucket.traces === 'object'){
        let clearedStyleCount = 0;
        let removedTraceCount = 0;
        Object.keys(bucket.traces).forEach(currentTraceId => {
          const traceStyle = bucket.traces[currentTraceId];
          if(!traceStyle || typeof traceStyle !== 'object'){
            delete bucket.traces[currentTraceId];
            removedTraceCount += 1;
            return;
          }
          const nextTraceStyle = { ...traceStyle };
          let traceChanged = false;
          patchKeys.forEach(styleKey => {
            if(Object.prototype.hasOwnProperty.call(nextTraceStyle, styleKey)){
              delete nextTraceStyle[styleKey];
              clearedStyleCount += 1;
              traceChanged = true;
            }
          });
          if(!traceChanged){
            return;
          }
          if(Object.keys(nextTraceStyle).length){
            bucket.traces[currentTraceId] = nextTraceStyle;
          }else{
            delete bucket.traces[currentTraceId];
            removedTraceCount += 1;
          }
        });
        if(clearedStyleCount || removedTraceCount){
          debugLog('upset global trace overrides cleared', {
            kind,
            clearedStyleCount,
            removedTraceCount,
            keys: patchKeys
          });
        }
      }
      if(Object.prototype.hasOwnProperty.call(normalizedPatch, 'fill') && state.ui?.upset){
        if(kind === 'intersectionBars' && state.ui.upset.barColor){
          state.ui.upset.barColor.value = normalizedPatch.fill;
        }else if(kind === 'setBars' && state.ui.upset.setBarColor){
          state.ui.upset.setBarColor.value = normalizedPatch.fill;
        }else if(kind === 'matrix' && state.ui.upset.dotColor){
          state.ui.upset.dotColor.value = normalizedPatch.fill;
        }
      }
      if(kind === 'matrix' && Object.prototype.hasOwnProperty.call(normalizedPatch, 'size') && state.ui?.upset?.dotSize){
        state.ui.upset.dotSize.value = String(normalizedPatch.size);
        updateUpSetDotSizeOutput(normalizedPatch.size);
      }
    }else if(traceId){
      bucket.traces = bucket.traces || {};
      bucket.traces[traceId] = Object.assign({}, bucket.traces[traceId] || {}, normalizedPatch);
    }
    requestScheduledDraw('upset-trace-style');
    syncActiveVennPayload('venn-upset-trace-style');
  }

  function resolveVennSymbolToolbarAnchor(doc){
    return getVennNodeById('vennFontHost')
      || getVennNodeById('sample')
      || null;
  }

  function getCurrentVennLabelMap(){
    const inputs = state.ui?.inputs || {};
    const labelA = getNormalizedVennLabel(inputs.labelA?.value, 0);
    const labelB = getNormalizedVennLabel(inputs.labelB?.value, 1);
    const labelC = getNormalizedVennLabel(inputs.labelC?.value, 2);
    return { A: labelA, B: labelB, C: labelC };
  }

  function resolveVennTraceDisplayLabel(traceId){
    const key = String(traceId == null ? '' : traceId).trim();
    if(!key){
      return 'Trace';
    }
    const labelMap = getCurrentVennLabelMap();
    return labelMap[key] || key;
  }

  function resolveUpSetTraceDisplayLabel(kind, traceId){
    const key = String(traceId == null ? '' : traceId).trim();
    if(!key){
      return 'Trace';
    }
    const intersections = Array.isArray(state.analysis?.lastUpSetIntersections)
      ? state.analysis.lastUpSetIntersections
      : [];
    const intersection = intersections.find(entry => String(entry?.code || '').trim() === key);
    if(intersection && String(intersection.label || '').trim()){
      return String(intersection.label).trim();
    }
    if(kind === 'setBars'){
      const sets = Array.isArray(state.analysis?.lastUpSetSets)
        ? state.analysis.lastUpSetSets
        : [];
      const setMatch = sets.find(entry => String(entry?.key || '').trim() === key);
      if(setMatch && String(setMatch.label || '').trim()){
        return String(setMatch.label).trim();
      }
    }
    const labelMap = getCurrentVennLabelMap();
    if(labelMap[key]){
      return labelMap[key];
    }
    if(/^[A-Z]{2,}$/.test(key)){
      const mapped = key.split('').map(token => labelMap[token] || token);
      if(mapped.length){
        return mapped.join(' & ');
      }
    }
    return key;
  }

  function showVennTraceSymbolToolbar(target, options = {}){
    if(!target || !symbolToolbar || typeof symbolToolbar.show !== 'function'){
      return;
    }
    const doc = global.document;
    if(!doc){ return; }
    const anchor = resolveVennSymbolToolbarAnchor(doc);
    if(!anchor){ return; }
    let traceId = options.traceId || null;
    const knownTraceIds = () => {
      const keys = new Set();
      const addKey = value => {
        const normalized = String(value == null ? '' : value).trim();
        if(normalized){
          keys.add(normalized);
        }
      };
      addKey(traceId);
      doc.querySelectorAll('[data-venn-trace-id]').forEach(node => addKey(node.getAttribute('data-venn-trace-id')));
      return Array.from(keys);
    };
    const orderedTraceIds = () => {
      const keys = knownTraceIds();
      if(!traceId){
        return keys;
      }
      return [traceId].concat(keys.filter(key => key !== traceId));
    };
    const scopeOptions = (() => {
      const optionsList = [{ value: 'global', label: 'Global', disabled: false }];
      const keys = orderedTraceIds();
      if(keys.length){
        keys.forEach(name => {
          const displayLabel = resolveVennTraceDisplayLabel(name);
          optionsList.push({
            value: 'trace',
            label: displayLabel,
            datasetLabel: displayLabel,
            scopeDataset: name,
            scopeKind: 'trace',
            disabled: false
          });
        });
      }else{
        const fallbackLabel = resolveVennTraceDisplayLabel(traceId || 'Trace');
        optionsList.push({
          value: 'trace',
          label: fallbackLabel,
          datasetLabel: fallbackLabel,
          scopeDataset: traceId || '',
          scopeKind: 'trace',
          disabled: !traceId
        });
      }
      return optionsList;
    })();
    const fallback = options.fallback && typeof options.fallback === 'object'
      ? options.fallback
      : resolveVennTraceBaseStyle(traceId);
    debugLog('venn trace toolbar open requested', { traceId });
    const getStyle = ctx => {
      const scopedTraceId = ctx?.scope === 'trace'
        ? (String(ctx?.scopeDataset || '').trim() || traceId)
        : null;
      const baseTraceId = scopedTraceId || traceId;
      const baseStyle = resolveVennTraceBaseStyle(baseTraceId, fallback);
      return getVennTraceStyle(scopedTraceId, baseStyle);
    };
    symbolToolbar.show({
      document: doc,
      target,
      anchor,
      scopeId: 'venn',
      panelTitle: 'Trace',
      formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls venn-upset-trace-controls',
      scope: {
        label: 'Scope',
        options: scopeOptions,
        value: traceId ? 'trace' : 'global',
        onChange(nextScope, ctx){
          if(nextScope === 'trace'){
            const scopedTraceId = String(ctx?.scopeDataset || '').trim();
            if(scopedTraceId){
              traceId = scopedTraceId;
            }
          }
        }
      },
      fillShape: {
        label: 'Fill',
        showShapePicker: false,
        shapeOptions: [{ value: 'square', label: 'Square' }],
        getColor(ctx){ return getStyle(ctx).fill || '#2f2f2f'; },
        getShape(){ return 'square'; },
        onColorInput(value, ctx){ updateVennTraceStyle(ctx?.scope, traceId, { fill: value }); },
        onColorChange(value, ctx){ updateVennTraceStyle(ctx?.scope, traceId, { fill: value }); }
      },
      border: {
        label: 'Border',
        getColor(ctx){ return getStyle(ctx).borderColor || '#000000'; },
        onColorInput(value, ctx){ updateVennTraceStyle(ctx?.scope, traceId, { borderColor: value }); },
        onColorChange(value, ctx){ updateVennTraceStyle(ctx?.scope, traceId, { borderColor: value }); },
        getWidth(ctx){ return clampNumber(getStyle(ctx).borderWidth, 0, 0); },
        onWidthChange(value, ctx){ updateVennTraceStyle(ctx?.scope, traceId, { borderWidth: value }); }
      },
      size: {
        enabled: false
      },
      transparency: {
        enabled: true,
        scale: 'fraction',
        label: 'Transparency',
        get(ctx){
          const opacity = clampNumber(getStyle(ctx).opacity, 1, 0, 1);
          return 1 - opacity;
        },
        onChange(value, ctx){
          const transparency = clampNumber(value, 0, 0, 1);
          updateVennTraceStyle(ctx?.scope, traceId, { opacity: 1 - transparency });
        }
      }
    });
  }

  function showUpSetTraceSymbolToolbar(target, options = {}){
    if(!target || !symbolToolbar || typeof symbolToolbar.show !== 'function'){
      return;
    }
    const doc = global.document;
    if(!doc){ return; }
    const anchor = resolveVennSymbolToolbarAnchor(doc);
    if(!anchor){ return; }
    const kind = options.kind;
    let traceId = options.traceId || null;
    const knownTraceIds = () => {
      const keys = new Set();
      const addKey = value => {
        const normalized = String(value == null ? '' : value).trim();
        if(normalized){
          keys.add(normalized);
        }
      };
      addKey(traceId);
      const scopedSelector = kind
        ? `[data-upset-trace-kind="${kind}"][data-upset-trace-id]`
        : '[data-upset-trace-id]';
      const scopedNodes = Array.from(doc.querySelectorAll(scopedSelector));
      if(scopedNodes.length){
        scopedNodes.forEach(node => addKey(node.getAttribute('data-upset-trace-id')));
      }else{
        doc.querySelectorAll('[data-upset-trace-id]').forEach(node => addKey(node.getAttribute('data-upset-trace-id')));
      }
      return Array.from(keys);
    };
    const orderedTraceIds = () => {
      const keys = knownTraceIds();
      if(!traceId){
        return keys;
      }
      return [traceId].concat(keys.filter(key => key !== traceId));
    };
    const scopeOptions = (() => {
      const optionsList = [{ value: 'global', label: 'Global', disabled: false }];
      const keys = orderedTraceIds();
      if(keys.length){
        keys.forEach(name => {
          const displayLabel = resolveUpSetTraceDisplayLabel(kind, name);
          optionsList.push({
            value: 'trace',
            label: displayLabel,
            datasetLabel: displayLabel,
            scopeDataset: name,
            scopeKind: 'trace',
            disabled: false
          });
        });
      }else{
        const fallbackLabel = resolveUpSetTraceDisplayLabel(kind, traceId || 'Trace');
        optionsList.push({
          value: 'trace',
          label: fallbackLabel,
          datasetLabel: fallbackLabel,
          scopeDataset: traceId || '',
          scopeKind: 'trace',
          disabled: !traceId
        });
      }
      return optionsList;
    })();
    const fallback = options.fallback && typeof options.fallback === 'object' ? options.fallback : {};
    debugLog('upset trace toolbar open requested', { kind, traceId });
    const getStyle = ctx => getUpSetTraceStyle(
      kind,
      ctx?.scope === 'trace' ? (String(ctx?.scopeDataset || '').trim() || traceId) : null,
      fallback
    );
    symbolToolbar.show({
      document: doc,
      target,
      anchor,
      scopeId: 'venn',
      panelTitle: 'Trace',
      formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls venn-upset-trace-controls',
      scope: {
        label: 'Scope',
        options: scopeOptions,
        value: traceId ? 'trace' : 'global',
        onChange(nextScope, ctx){
          if(nextScope === 'trace'){
            const scopedTraceId = String(ctx?.scopeDataset || '').trim();
            if(scopedTraceId){
              traceId = scopedTraceId;
            }
          }
        }
      },
      fillShape: {
        label: 'Fill',
        showShapePicker: false,
        shapeOptions: [{ value: 'square', label: 'Square' }],
        getColor(ctx){ return getStyle(ctx).fill || '#2f2f2f'; },
        getShape(){ return 'square'; },
        onColorInput(value, ctx){ updateUpSetTraceStyle(kind, ctx?.scope, traceId, { fill: value }); },
        onColorChange(value, ctx){ updateUpSetTraceStyle(kind, ctx?.scope, traceId, { fill: value }); }
      },
      border: {
        label: 'Border',
        getColor(ctx){ return getStyle(ctx).borderColor || '#000000'; },
        onColorInput(value, ctx){ updateUpSetTraceStyle(kind, ctx?.scope, traceId, { borderColor: value }); },
        onColorChange(value, ctx){ updateUpSetTraceStyle(kind, ctx?.scope, traceId, { borderColor: value }); },
        getWidth(ctx){ return clampNumber(getStyle(ctx).borderWidth, 0, 0); },
        onWidthChange(value, ctx){ updateUpSetTraceStyle(kind, ctx?.scope, traceId, { borderWidth: value }); }
      },
      size: {
        enabled: kind === 'matrix',
        get(ctx){ return clampNumber(getStyle(ctx).size, DEFAULT_UPSET_SETTINGS.dotSize, 2, 12); },
        onChange(value, ctx){ updateUpSetTraceStyle(kind, ctx?.scope, traceId, { size: value }); }
      },
      transparency: {
        enabled: true,
        scale: 'fraction',
        label: 'Transparency',
        get(ctx){
          const opacity = clampNumber(getStyle(ctx).opacity, 1, 0, 1);
          return 1 - opacity;
        },
        onChange(value, ctx){
          const transparency = clampNumber(value, 0, 0, 1);
          updateUpSetTraceStyle(kind, ctx?.scope, traceId, { opacity: 1 - transparency });
        }
      }
    });
  }

  function resolveUpSetSettings() {
    const ui = state.ui?.upset || {};
    const axisState = state.analysis?.upsetAxis || {};
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
      gridColor: sanitizeColor(ui.gridColor?.value, defaults.gridColor),
      axisColor: sanitizeColor(axisState.color, defaults.axisColor),
      axisWidth: clampNumber(axisState.width, defaults.axisWidth, 0.25, 10),
      traceStyles: cloneUpSetTraceStyles(state.analysis?.upsetTraceStyles)
    };
    debug('Debug: venn upset settings resolved', settings);
    return settings;
  }

  function updateUpSetAxisStyle(next = {}) {
    const defaults = DEFAULT_UPSET_SETTINGS;
    const current = state.analysis?.upsetAxis || {};
    const color = Object.prototype.hasOwnProperty.call(next, 'color')
      ? sanitizeColor(next.color, current.color || defaults.axisColor)
      : sanitizeColor(current.color, defaults.axisColor);
    const width = Object.prototype.hasOwnProperty.call(next, 'width')
      ? clampNumber(next.width, current.width || defaults.axisWidth, 0.25, 10)
      : clampNumber(current.width, defaults.axisWidth, 0.25, 10);
    state.analysis.upsetAxis = { color, width };
    debug('Debug: venn upset axis style updated', state.analysis.upsetAxis);
    requestScheduledDraw('upset-axis-style');
    syncActiveVennPayload('venn-upset-axis-style');
  }

  function createUpSetAxisControlConfig(axis) {
    return {
      axis,
      scopeId: 'venn',
      getTickInterval: () => null,
      getThickness: () => clampNumber(state.analysis?.upsetAxis?.width, DEFAULT_UPSET_SETTINGS.axisWidth, 0.25, 10),
      getColor: () => sanitizeColor(state.analysis?.upsetAxis?.color, DEFAULT_UPSET_SETTINGS.axisColor),
      isTickIntervalEnabled: () => false,
      getTickIntervalDisabledMessage: () => 'Tick interval is not available for UpSet axes.',
      tickPlaceholder: 'N/A',
      onTickIntervalChange: () => {},
      getMinorTicksEnabled: () => false,
      onMinorTicksChange: () => {},
      isMinorTicksSupported: () => false,
      getMinorTickSubdivisions: () => 4,
      onMinorTickSubdivisionsChange: () => {},
      onThicknessChange: value => updateUpSetAxisStyle({ width: value }),
      onColorChange: value => updateUpSetAxisStyle({ color: value }),
      getNotationMode: () => 'auto',
      onNotationChange: () => {},
      isNotationSupported: () => false,
      isAdditionalTicksSupported: () => false,
      getAdditionalTicks: () => [],
      onAdditionalTickChange: () => {},
      onAdditionalTickAdd: () => {},
      onAdditionalTickRemove: () => {},
      isBrokenAxisSupported: () => false
    };
  }

  function updateUpSetDotSizeOutput(value) {
    const output = state.ui?.upset?.dotSizeVal;
    if (!output) return;
    const clamped = clampNumber(value, DEFAULT_UPSET_SETTINGS.dotSize, 2, 12);
    output.textContent = String(clamped);
  }

  function enableVennTextDrag(el) {
    const stage = state.ui.stage;
    if (!el || !stage || typeof Shared.enableLabelDrag !== 'function') return;
    Shared.enableLabelDrag(el, stage, {
      tabId: venn.__boundTabId || null,
      scope: 'vennGraphPanel'
    });
  }

  function setVennStageRegionClickHandler(stage, handler, reason = 'stage-region-click'){
    if(!stage || typeof handler !== 'function'){
      return false;
    }
    if(stage.__vennRegionClickHandler){
      stage.removeEventListener('click', stage.__vennRegionClickHandler);
    }
    const wrapped = event => runVennEventOwnerCallback(event, reason, () => handler(event));
    stage.__vennRegionClickHandler = wrapped;
    stage.onclick = null;
    stage.addEventListener('click', wrapped);
    return true;
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
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(size) || size <= 0) {
      console.warn('venn polylabel skipped invalid bounding box', { bbox, width, height, size });
      return null;
    }
    const h0 = size / 2;
    const nInit = 4;
    const step = size / nInit;
    if (!Number.isFinite(step) || step <= 0) {
      console.warn('venn polylabel skipped invalid step', { bbox, width, height, size, step });
      return null;
    }
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
    let iterations = 0;
    const maxIterations = 12000;
    while (queue.size()) {
      iterations += 1;
      if (iterations > maxIterations) {
        console.warn('venn polylabel iteration guard reached', {
          iterations,
          queueSize: queue.size(),
          bbox,
          tolerancePx,
          bestDistance: best?.d
        });
        break;
      }
      const cell = pop();
      if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y) || !Number.isFinite(cell.h) || !Number.isFinite(cell.max)) {
        console.warn('venn polylabel skipped invalid cell', { cell, bbox, tolerancePx });
        continue;
      }
      if (Number.isFinite(cell.d) && (!Number.isFinite(best.d) || cell.d > best.d)) best = cell;
      if (!Number.isFinite(cell.max - best.d) || cell.max - best.d <= tolerancePx) continue;
      const h = cell.h / 2;
      if (!Number.isFinite(h) || h <= 0) continue;
      push(makeCell(cell.x - h, cell.y - h, h));
      push(makeCell(cell.x + h, cell.y - h, h));
      push(makeCell(cell.x - h, cell.y + h, h));
      push(makeCell(cell.x + h, cell.y + h, h));
    }
    return best && Number.isFinite(best.x) && Number.isFinite(best.y) ? { x: best.x, y: best.y } : null;
  }

  function _findRegionLabelPoint(code, cA, rA, cB, rB, cC, rC, hasC, tolerancePx) {
    const spec = _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC);
    const bbox = _bboxForSpec(spec);
    if (!bbox) return null;
    const tol = Math.max(0.25, tolerancePx || 0.5);
    return _polylabelRegion(spec, bbox, tol);
  }

  function ensureVennRegionOptions() {
    const select = state.ui.regionSelect;
    if (!select) return;
    const currentValues = Array.from(select.options || []).map(option => option.value);
    const expectedValues = DEFAULT_REGION_OPTIONS.map(option => option.value);
    const isCurrentDefault = currentValues.length === expectedValues.length
      && currentValues.every((value, idx) => value === expectedValues[idx]);
    if (isCurrentDefault) {
      return;
    }
    const previousValue = select.value;
    select.innerHTML = '';
    DEFAULT_REGION_OPTIONS.forEach(entry => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      select.appendChild(option);
    });
    if (expectedValues.includes(previousValue)) {
      select.value = previousValue;
    } else if (select.options.length) {
      select.value = select.options[0].value;
    } else {
      select.value = '';
    }
    if (typeof formControls.autoSizeSelect === 'function') {
      formControls.autoSizeSelect(select);
    }
    debugLog('venn region options restored', {
      previousValue,
      selected: select.value
    });
  }

  function updateUpSetRegionContext(sets, intersections, preferredCode) {
    const select = state.ui.regionSelect;
    const entries = Array.isArray(intersections) ? intersections : [];
    const setLabelByKey = new Map((sets || []).map(set => [set.key, set.label]));
    state.analysis.lastUpSetSets = Array.isArray(sets)
      ? sets.map(set => ({
          key: String(set?.key || '').trim(),
          label: String(set?.label || '').trim()
        })).filter(set => !!set.key)
      : [];
    const normalized = entries.map((entry, idx) => {
      const code = String(entry?.code || '');
      const label = entry?.label
        || (Array.isArray(entry?.sets) && entry.sets.length
          ? entry.sets.map(key => setLabelByKey.get(key) || key).join(' & ')
          : code || `Intersection ${idx + 1}`);
      const size = Number.isFinite(entry?.size) ? entry.size : 0;
      const items = Array.isArray(entry?.items)
        ? entry.items.map(value => String(value || '').trim()).filter(Boolean)
        : [];
      return { code, label, size, items };
    }).filter(entry => !!entry.code);

    const regionMap = {};
    normalized.forEach(entry => {
      regionMap[entry.code] = new Set(entry.items);
    });
    state.analysis.lastUpSetRegionMap = regionMap;
    state.analysis.lastUpSetIntersections = normalized;

    if (!select) return;
    const previousValue = typeof preferredCode === 'string' ? preferredCode : select.value;
    select.innerHTML = '';
    normalized.forEach(entry => {
      const option = document.createElement('option');
      option.value = entry.code;
      option.textContent = `${entry.label} (${formatCount(entry.size)})`;
      select.appendChild(option);
    });
    const availableValues = new Set(normalized.map(entry => entry.code));
    if (availableValues.has(previousValue)) {
      select.value = previousValue;
    } else if (select.options.length) {
      select.value = select.options[0].value;
    } else {
      select.value = '';
    }
    if (typeof formControls.autoSizeSelect === 'function') {
      formControls.autoSizeSelect(select);
    }
    debugLog('upset region options updated', {
      optionCount: normalized.length,
      previousValue,
      selected: select.value
    });
  }

  function getRegionText(code) {
    const plotType = getActivePlotType();
    if (plotType === 'upset' && state.analysis.lastUpSetRegionMap) {
      const genes = [...(state.analysis.lastUpSetRegionMap[code] || new Set())];
      return genes.join('\n');
    }
    const regions = ensureVennRegionsForLookup();
    if (!regions) return '';
    const map = {
      A: regions.Aonly,
      B: regions.Bonly,
      C: regions.Conly,
      AB: regions.AB,
      AC: regions.AC,
      BC: regions.BC,
      ABC: regions.ABC
    };
    const genes = [...(map[code] || new Set())];
    return genes.join('\n');
  }

  function rebuildUpSetAnalysisStateFromData(reason) {
    if (getActivePlotType() !== 'upset') {
      return false;
    }
    syncVennInputsFromTable({ scheduleDraw: false, scheduleSpecies: false });
    const parsed = ensureParsedLists({ includeRegions: true, reason: reason || 'upset-analysis-rebuild' });
    if (!parsed || !parsed.lists) {
      return false;
    }
    const labels = getCurrentVennLabelMap();
    const regions = parsed.regions || setsFromLists(parsed.lists.A || [], parsed.lists.B || [], parsed.lists.C || [], state.analysis.lastRegions);
    state.analysis.lastRegions = regions;
    state.analysis.lastDrawMode = 'lists';
    state.analysis.lastCounts = {
      nA: regions.A.size, nB: regions.B.size, nC: regions.C.size,
      Aonly: regions.Aonly.size, Bonly: regions.Bonly.size, Conly: regions.Conly.size,
      AB: regions.AB.size, AC: regions.AC.size, BC: regions.BC.size, ABC: regions.ABC.size
    };
    const inputs = ensureInputs();
    const defaultStyle = createDefaultVennStyleState();
    const style = {
      colorA: getVennInputValue(inputs, 'colorA', defaultStyle.colorA),
      colorB: getVennInputValue(inputs, 'colorB', defaultStyle.colorB),
      colorC: getVennInputValue(inputs, 'colorC', defaultStyle.colorC),
      upset: resolveUpSetSettings()
    };
    const upsetData = resolveUpSetTableData(parsed, labels, style);
    if (!upsetData || !Array.isArray(upsetData.sets) || !upsetData.sets.length) {
      return false;
    }
    const settings = { ...DEFAULT_UPSET_SETTINGS, ...resolveUpSetSettings(), ...(style.upset || {}) };
    let allIntersections = upsetData.needsIntersectionBuild
      ? buildUpSetIntersectionsFromSets(upsetData.sets, { showEmpty: settings.showEmpty })
      : (Array.isArray(upsetData.intersections) ? upsetData.intersections.slice() : []);
    let intersections = allIntersections.slice();
    if (!(upsetData && upsetData.needsIntersectionBuild) && !settings.showEmpty) {
      intersections = allIntersections.filter(entry => entry.size > 0);
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
    if (Number.isFinite(maxIntersections) && maxIntersections > 0 && intersections.length > maxIntersections) {
      intersections = intersections.slice(0, maxIntersections);
    }
    const preferredRegionCode = state.ui.regionSelect ? String(state.ui.regionSelect.value || '') : '';
    if (preferredRegionCode) {
      const selectedEntry = allIntersections.find(entry => entry.code === preferredRegionCode);
      if (selectedEntry && !intersections.some(entry => entry.code === preferredRegionCode)) {
        if (Number.isFinite(maxIntersections) && maxIntersections > 0 && intersections.length >= maxIntersections) {
          intersections[intersections.length - 1] = selectedEntry;
        } else {
          intersections.push(selectedEntry);
        }
      }
    }
    updateUpSetRegionContext(upsetData.sets, intersections, preferredRegionCode);
    if (state.ui.regionSelect) {
      populateRegion(state.ui.regionSelect.value, { skipClear: true });
    }
    debugLog('upset analysis state rebuilt from data', {
      reason: reason || null,
      intersections: intersections.length,
      setCount: upsetData.sets.length
    });
    return true;
  }

  // Region Sets/Counts are derived from the gene lists and are not persisted (Map/Set do
  // not survive JSON archives). Rebuild them from the current table inputs on demand so
  // overlap-group switching and the count summary work after a reopen/recovery, where the
  // render cache restores only the diagram DOM. Returns true if state was (re)built.
  function ensureVennAnalysisStateFromData(reason) {
    if (getActivePlotType() === 'upset') {
      return false;
    }
    if (state.analysis.lastRegions && state.analysis.lastCounts) {
      return false;
    }
    // Mirror the just-restored table into the text inputs before parsing.
    syncVennInputsFromTable({ scheduleDraw: false, scheduleSpecies: false });
    const parsed = ensureParsedLists({ includeRegions: true, reason: reason || 'venn-analysis-rebuild' });
    const regions = parsed && parsed.regions ? parsed.regions : null;
    if (!regions) {
      return false;
    }
    state.analysis.lastRegions = regions;
    if (!state.analysis.lastDrawMode) {
      state.analysis.lastDrawMode = 'lists';
    }
    state.analysis.lastCounts = {
      nA: regions.A.size, nB: regions.B.size, nC: regions.C.size,
      Aonly: regions.Aonly.size, Bonly: regions.Bonly.size, Conly: regions.Conly.size,
      AB: regions.AB.size, AC: regions.AC.size, BC: regions.BC.size, ABC: regions.ABC.size
    };
    debugLog('venn analysis state rebuilt from data', { reason: reason || null });
    return true;
  }

  function ensureVennRegionsForLookup() {
    if (getActivePlotType() === 'upset') {
      return state.analysis.lastUpSetRegionMap || null;
    }
    if (!state.analysis.lastRegions) {
      ensureVennAnalysisStateFromData('region-lookup');
    }
    return state.analysis.lastRegions || null;
  }

  function captureVennAnalysisAutoRefreshIntent(){
    return {
      go: !!state.analysis.goPerformed,
      string: !!state.analysis.stringPerformed,
      activeResultsTab: normalizeAnalysisResultsTab(state.analysis.activeResultsTab || 'go'),
      stringOverlay: normalizeStringOverlayModel(state.analysis.stringOverlay)
    };
  }

  function hasVennAnalysisAutoRefreshIntent(intent){
    return !!(intent && (intent.go || intent.string));
  }

  async function resolveVennAnalysisOrganism(options = {}){
    let organism = state.ui.speciesSelect?.value || '';
    if(organism){ return organism; }
    const allGenes = getAllGenes();
    const detection = getSpeciesDetectionState();
    const cacheKey = computeGeneSignature(allGenes);
    const guess = allGenes.length ? await guessSpecies(allGenes, { cache: detection.cache, cacheKey }) : null;
    if(guess){
      if(state.ui.speciesSelect){ state.ui.speciesSelect.value = guess; }
      setSpeciesIndicator(true);
      return guess;
    }
    setSpeciesIndicator(false);
    if(options.alertMessage){ alert(options.alertMessage); }
    return '';
  }

  function scheduleVennAnalysisAutoRefresh(intent, reason = 'venn-analysis-auto-refresh'){
    const normalized = {
      ...captureVennAnalysisAutoRefreshIntent(),
      ...(intent || {}),
      activeResultsTab: normalizeAnalysisResultsTab(intent?.activeResultsTab || state.analysis.activeResultsTab || 'go')
    };
    if(!hasVennAnalysisAutoRefreshIntent(normalized) || isProjectingVennSession()){
      return false;
    }
    const session = getActiveVennSessionForState();
    if(!session?.tabId){ return false; }
    const cache = session.cache || (session.cache = {});
    if(cache.autoAnalysisRefreshTimer){
      global.clearTimeout(cache.autoAnalysisRefreshTimer);
    }
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    cache.autoAnalysisRefreshToken = token;
    cache.autoAnalysisRefreshTimer = global.setTimeout(() => {
      if(session.cache?.autoAnalysisRefreshToken !== token || session.tabId !== resolveActiveVennTabId()){
        return;
      }
      session.cache.autoAnalysisRefreshTimer = null;
      refreshVennAnalysesForCurrentRegion(normalized, reason).catch(err => {
        console.error('venn analysis auto-refresh error', err);
      });
    }, 80);
    debug('Debug: venn analysis auto-refresh scheduled', {
      reason,
      tabId: session.tabId,
      go: normalized.go,
      string: normalized.string,
      activeResultsTab: normalized.activeResultsTab
    });
    return true;
  }

  async function refreshVennAnalysesForCurrentRegion(intent, reason = 'venn-analysis-auto-refresh'){
    const normalized = {
      ...(intent || {}),
      activeResultsTab: normalizeAnalysisResultsTab(intent?.activeResultsTab || state.analysis.activeResultsTab || 'go')
    };
    if(!hasVennAnalysisAutoRefreshIntent(normalized)){ return; }
    const genes = (getRegionText(state.ui.regionSelect?.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
    if(!genes.length){
      debug('Debug: venn analysis auto-refresh skipped', { reason, cause: 'empty-region' });
      return;
    }
    const organism = await resolveVennAnalysisOrganism();
    if(!organism){
      debug('Debug: venn analysis auto-refresh skipped', { reason, cause: 'missing-organism' });
      return;
    }
    if(normalized.stringOverlay){
      state.analysis.stringOverlay = normalizeStringOverlayModel(normalized.stringOverlay);
      syncStringOverlayControls();
    }
    if(normalized.go){
      runGOAnalysis(genes, organism, { activeResultsTab: normalized.activeResultsTab, autoRefresh: true });
    }
    if(normalized.string){
      runStringAnalysis(genes, organism, { activeResultsTab: normalized.activeResultsTab, autoRefresh: true });
    }
    debug('Debug: venn analysis auto-refresh started', {
      reason,
      geneCount: genes.length,
      organism,
      go: normalized.go,
      string: normalized.string,
      activeResultsTab: normalized.activeResultsTab
    });
  }

  function populateRegion(code, options = {}) {
    if (!state.ui.regionList) {
      debug('Debug: venn populateRegion skipped', { hasRegionList: false });
      return;
    }
    const plotType = getActivePlotType();
    let arr = [];
    if (plotType === 'upset' && state.analysis.lastUpSetRegionMap) {
      arr = [...(state.analysis.lastUpSetRegionMap[code] || new Set())].sort();
    } else {
      const regions = ensureVennRegionsForLookup();
      if (!regions) {
        debug('Debug: venn populateRegion skipped', { hasRegions: false });
        return;
      }
      const map = {
        A: regions.Aonly,
        B: regions.Bonly,
        C: regions.Conly,
        AB: regions.AB,
        AC: regions.AC,
        BC: regions.BC,
        ABC: regions.ABC
      };
      arr = [...(map[code] || new Set())].sort();
    }
    const signature = `${code || ''}::${arr.join('|')}`;
    const previousSignature = state.analysis.lastRegionSignature;
    const shouldClear = signature !== previousSignature;
    const autoRefreshIntent = captureVennAnalysisAutoRefreshIntent();
    const hasProjectedAnalysisResults = hasVennGoResultsState(state.analysis) || hasVennStringResultsState(state.analysis);
    const isInitialRegionProjection = !previousSignature && hasProjectedAnalysisResults;
    const shouldAutoRefresh = shouldClear
      && !options.skipAnalysisRefresh
      && hasVennAnalysisAutoRefreshIntent(autoRefreshIntent)
      && !isInitialRegionProjection
      && !isProjectingVennSession();
    if (shouldClear && !options.skipClear && !isInitialRegionProjection) {
      if(!isProjectingVennSession()){
        clearAnalysis({ preserveStringOverlay: true, stringOverlay: autoRefreshIntent.stringOverlay });
        debug('Debug: venn populateRegion invalidated analysis', {
          code,
          geneCount: arr.length,
          previousSignature,
          nextSignature: signature,
          autoRefresh: shouldAutoRefresh
        });
      }else{
        debug('Debug: venn populateRegion retained session-projected analysis', {
          code,
          geneCount: arr.length,
          previousSignature,
          nextSignature: signature
        });
      }
    } else if (isInitialRegionProjection) {
      debug('Debug: venn populateRegion primed restored analysis region', {
        code,
        geneCount: arr.length,
        signature
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
    if(shouldAutoRefresh){
      scheduleVennAnalysisAutoRefresh(autoRefreshIntent, 'venn-region-data-change');
    }
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
    const labelA = getVennNodeById('labelAName');
    const labelB = getVennNodeById('labelBName');
    const labelC = getVennNodeById('labelCName');
    const labelAB = getVennNodeById('labelABName');
    const labelAC = getVennNodeById('labelACName');
    const labelBC = getVennNodeById('labelBCName');
    const labelABC = getVennNodeById('labelABCName');
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
    ensureVennRegionOptions();
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
    const colorLabelA = getVennNodeById('colorLabelA');
    const colorLabelB = getVennNodeById('colorLabelB');
    const colorLabelC = getVennNodeById('colorLabelC');
    if (colorLabelA) colorLabelA.textContent = labels.A;
    if (colorLabelB) colorLabelB.textContent = labels.B;
    if (colorLabelC) colorLabelC.textContent = labels.C;
  }

  function clearAnalysis(options = {}) {
    const preserveStringOverlay = !!options.preserveStringOverlay;
    const preservedStringOverlay = preserveStringOverlay
      ? normalizeStringOverlayModel(options.stringOverlay || state.analysis.stringOverlay)
      : normalizeStringOverlayModel();
    if (state.ui.goResults) state.ui.goResults.innerHTML = '';
    if (state.ui.stringResults) state.ui.stringResults.innerHTML = '';
    if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '';
    clearGoChartSvg();
    state.analysis.lastGOResult = null;
    state.analysis.lastGOFormatted = [];
    state.analysis.goDisplayLimit = 5;
    state.analysis.lastStringSVG = null;
    state.analysis.lastStringEnrichment = null;
    state.analysis.stringOverlay = preservedStringOverlay;
    syncStringOverlayControls();
    state.analysis.goPerformed = false;
    state.analysis.stringPerformed = false;
    if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
    if(!isProjectingVennSession()){
      clearVennSessionAnalysisResults('venn-analysis-clear', preserveStringOverlay ? { stringOverlay: preservedStringOverlay } : {});
    }
    debug('Debug: venn clearAnalysis invoked', { preserveStringOverlay }); // Debug: analysis outputs cleared
  }

  function normalizeAnalysisResultsTab(tabName) {
    return String(tabName || '').trim().toLowerCase() === 'string' ? 'string' : 'go';
  }

  function getGoChartSvg() {
    const cached = state.ui.goChart;
    if (cached && String(cached.tagName || '').toLowerCase() === 'svg') {
      return cached;
    }
    const node = getVennNodeById('goChart');
    return node && String(node.tagName || '').toLowerCase() === 'svg' ? node : null;
  }

  function setGoChartExportVisible(visible) {
    if (state.ui.goChartExport) {
      state.ui.goChartExport.style.display = visible ? 'flex' : 'none';
    }
  }

  function clearGoChartSvg() {
    const svg = getGoChartSvg();
    if (svg) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.style.display = 'none';
      svg.removeAttribute('viewBox');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      delete svg.dataset.goChartSignature;
      delete svg.dataset.goChartRenderWidth;
      delete svg.dataset.goChartRenderHeight;
    }
    setGoChartExportVisible(false);
    return true;
  }

  function hasGoChartData() {
    return Array.isArray(state.analysis.lastGOResult) && state.analysis.lastGOResult.length > 0;
  }

  const GO_CHART_SVG_CONFIG = Object.freeze({
    defaultWidth: 900,
    minWidth: 640,
    maxWidth: 1400,
    minHeight: 300,
    top: 18,
    right: 34,
    bottom: 54,
    labelGap: 14,
    leftMin: 150,
    leftMax: 380,
    leftFraction: 0.46,
    labelFontPx: 16,
    axisFontPx: 16,
    axisTitleFontPx: 16,
    barFill: '#808080',
    textColor: '#222222',
    labelColor: '#666666',
    axisColor: '#111111',
    axisStrokeWidth: 1.25,
    tickLength: 5
  });

  function resolveGoChartBarHeight(limit) {
    const resolvedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5;
    return resolvedLimit > 5 ? 18 : 30;
  }

  function computeGoChartHeight(limit, itemCount = state.analysis.lastGOResult?.length || 0) {
    const resolvedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5;
    const visibleCount = Math.max(0, Math.min(itemCount, resolvedLimit));
    if (!visibleCount) return GO_CHART_SVG_CONFIG.minHeight;
    const rowPitch = resolvedLimit > 5 ? 28 : 48;
    return Math.max(
      GO_CHART_SVG_CONFIG.minHeight,
      GO_CHART_SVG_CONFIG.top + GO_CHART_SVG_CONFIG.bottom + visibleCount * rowPitch
    );
  }

  function resolveGoChartDisplayWidth(svg) {
    if (!svg || typeof svg.getBoundingClientRect !== 'function') return 0;
    const rectWidth = Number(svg.getBoundingClientRect().width);
    if (Number.isFinite(rectWidth) && rectWidth > 0) return Math.round(rectWidth);
    const offsetWidth = Number(svg.offsetWidth);
    if (Number.isFinite(offsetWidth) && offsetWidth > 0) return Math.round(offsetWidth);
    const clientWidth = Number(svg.clientWidth);
    if (Number.isFinite(clientWidth) && clientWidth > 0) return Math.round(clientWidth);
    return 0;
  }

  function resolveGoChartLayoutWidth(svg) {
    const displayWidth = resolveGoChartDisplayWidth(svg);
    if (displayWidth > 0) return Math.max(GO_CHART_SVG_CONFIG.minWidth, Math.min(GO_CHART_SVG_CONFIG.maxWidth, displayWidth));
    const hosts = [svg?.parentElement, state.ui.analysisPanelGo, state.ui.analysisResults].filter(Boolean);
    for (const host of hosts) {
      if (typeof host.getBoundingClientRect !== 'function') continue;
      const width = Number(host.getBoundingClientRect().width || host.clientWidth || host.offsetWidth);
      if (Number.isFinite(width) && width > 0) {
        return Math.max(GO_CHART_SVG_CONFIG.minWidth, Math.min(GO_CHART_SVG_CONFIG.maxWidth, Math.round(width)));
      }
    }
    return GO_CHART_SVG_CONFIG.defaultWidth;
  }

  function isGoChartSvgInSync(svg) {
    if (!svg || !hasGoChartData()) return false;
    const existingSignature = svg.dataset?.goChartSignature || '';
    if (!existingSignature) return false;
    const displayWidth = resolveGoChartDisplayWidth(svg);
    if (!displayWidth) return true;
    const renderedWidth = Number(svg.dataset.goChartRenderWidth);
    return Number.isFinite(renderedWidth) && Math.abs(renderedWidth - displayWidth) <= 2;
  }

  function scheduleVisibleGoChartReflow(reason = 'venn-go-chart-visible-reflow') {
    if (!hasGoChartData()) return false;
    const ownerTabId = activeVennSession?.tabId || venn.__boundTabId || null;
    const runOwnerReflow = () => {
      const owner = ownerTabId
        ? getVennSession(ownerTabId, { tabId: ownerTabId, reason }, { create: false })
        : getActiveVennSessionForState();
      if (owner && !isVennSessionActiveForModuleState(owner)) {
        owner.timers.pendingDrawOptions = cloneSimple({ tabId: owner.tabId, reason }) || {};
        owner.state.drawPending = true;
        owner.updatedAt = Date.now();
        return;
      }
      const svg = getGoChartSvg();
      if (!isGoChartSvgInSync(svg)) {
        renderGOChart(state.analysis.goDisplayLimit || 5, { reason });
      }
    };
    if (Shared.componentLifecycle?.scheduleComponentFrame) {
      Shared.componentLifecycle.scheduleComponentFrame(venn, 'venn', { tabId: ownerTabId, reason }, runOwnerReflow);
    } else if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(runOwnerReflow);
    } else {
      setTimeout(runOwnerReflow, 0);
    }
    return true;
  }

  function updateAnalysisResultsVisibility() {
    const hasGo = !!state.analysis.goPerformed;
    const hasString = !!state.analysis.stringPerformed;
    const showTabs = hasGo && hasString;
    if (state.ui.analysisResultsTabs) {
      state.ui.analysisResultsTabs.hidden = !showTabs;
    }
    let visibleTab = normalizeAnalysisResultsTab(state.analysis.activeResultsTab);
    if (showTabs) {
      if (visibleTab === 'string' && !hasString) visibleTab = 'go';
      if (visibleTab === 'go' && !hasGo) visibleTab = 'string';
    } else if (hasString) {
      visibleTab = 'string';
    } else {
      visibleTab = 'go';
    }
    const showGoPanel = showTabs ? visibleTab === 'go' : hasGo;
    const showStringPanel = showTabs ? visibleTab === 'string' : hasString;
    if (state.ui.analysisPanelGo) {
      state.ui.analysisPanelGo.classList.toggle('is-active', showGoPanel);
      state.ui.analysisPanelGo.hidden = !showGoPanel;
    }
    if (state.ui.analysisPanelString) {
      state.ui.analysisPanelString.classList.toggle('is-active', showStringPanel);
      state.ui.analysisPanelString.hidden = !showStringPanel;
    }
    if (state.ui.analysisTabGo) {
      state.ui.analysisTabGo.classList.toggle('is-active', showTabs && visibleTab === 'go');
      state.ui.analysisTabGo.setAttribute('aria-selected', showTabs && visibleTab === 'go' ? 'true' : 'false');
      state.ui.analysisTabGo.tabIndex = showTabs && visibleTab === 'go' ? 0 : -1;
    }
    if (state.ui.analysisTabString) {
      state.ui.analysisTabString.classList.toggle('is-active', showTabs && visibleTab === 'string');
      state.ui.analysisTabString.setAttribute('aria-selected', showTabs && visibleTab === 'string' ? 'true' : 'false');
      state.ui.analysisTabString.tabIndex = showTabs && visibleTab === 'string' ? 0 : -1;
    }
    if (showGoPanel) {
      scheduleVisibleGoChartReflow('venn-go-chart-visible-tab');
    }
    return { hasGo, hasString, showTabs, visibleTab };
  }

  function setActiveAnalysisResultsTab(tabName, options = {}) {
    const nextTab = normalizeAnalysisResultsTab(tabName);
    const ownerTabId = String(options.tabId || options.owner?.tabId || options.owner?.session?.tabId || '').trim();
    const owner = ensureVennSessionOwnershipShape(
      options.owner?.session
      || (ownerTabId ? getVennSession(ownerTabId, { tabId: ownerTabId, reason: options.reason || 'venn-analysis-tab-owner' }, { create: true }) : null)
      || getActiveVennSessionForState()
    );
    const shouldProjectOwner = options.projectResults !== false
      && (!owner || isVennSessionActiveForModuleState(owner) || ownerTabId === getVennRootTabId(state.ui.root));
    if(owner?.results){
      owner.results = createDefaultVennResultsState({
        ...owner.results,
        activeResultsTab: nextTab
      });
      owner.updatedAt = Date.now();
      if(shouldProjectOwner){
        applyVennResultsStateToActive(owner.results);
      }
    }
    let visibility = { hasGo: false, hasString: false, showTabs: false, visibleTab: nextTab };
    if(shouldProjectOwner){
      state.analysis.activeResultsTab = nextTab;
      visibility = updateAnalysisResultsVisibility();
    }
    if (options.syncPayload !== false) {
      const targetTabId = owner?.tabId || ownerTabId || resolveActiveVennTabId();
      if(targetTabId){
        updateTabAnalysisPayload(targetTabId, { activeResultsTab: nextTab }, {
          reason: options.reason || 'venn-analysis-tab',
          origin: 'user'
        });
      }else{
        syncActiveVennPayload(options.reason || 'venn-analysis-tab');
      }
    }
    debug('Debug: venn analysis results tab set', {
      tab: nextTab,
      visibleTab: visibility.visibleTab,
      showTabs: visibility.showTabs,
      synced: options.syncPayload !== false
    });
    return nextTab;
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
    if (!tab) return false;
    const payload = getVennGraphPayload();
    const resolvedReason = reason || 'venn-analysis-sync';
    let changed = false;
    if (typeof session.updateTabPayload === 'function') {
      changed = session.updateTabPayload(tab, () => payload, {
        reason: resolvedReason,
        origin: 'user'
      });
    } else if (typeof session.assignTabPayload === 'function') {
      changed = session.assignTabPayload(tab, payload, { reason: resolvedReason });
      if (changed && typeof session.markTabUserModified === 'function') {
        session.markTabUserModified(tab, resolvedReason, { origin: 'user' });
      }
    } else {
      return false;
    }
    debugLog('venn tab payload synced', { tabId: active, reason: resolvedReason, changed });
    captureVennSessionStateFromActive(activeVennSession, { reason: resolvedReason });
    return changed;
  }

  function persistActiveVennUserChange(reason) {
    return syncActiveVennPayload(reason || 'venn-user-change');
  }

  function updateTabAnalysisPayload(tabId, analysisPatch, meta = {}) {
    const session = global.Main?.session;
    if (!session || !tabId || !analysisPatch || typeof analysisPatch !== 'object') return false;
    const tab = getVennTabById(tabId);
    if (!tab) return false;
    const cloneFn = session.fastClonePayload || session.clonePayload;
    let payload = tab.payload ? (cloneFn ? cloneFn(tab.payload) : cloneSimple(tab.payload)) : null;
    if (!payload && typeof venn.createEmptyPayload === 'function') {
      payload = venn.createEmptyPayload();
    }
    if (!payload) return false;
    const previousAnalysis = payload.analysis && typeof payload.analysis === 'object' ? payload.analysis : {};
    const resolvedReason = meta.reason || 'venn-analysis-update';
    const ownerSession = getVennSession(tabId, { tabId, reason: resolvedReason }, { create: true });
    const canonicalResults = createVennResultsStateForPatch(
      ownerSession?.results || {},
      previousAnalysis,
      analysisPatch
    );
    if(ownerSession){
      ownerSession.results = canonicalResults;
      ownerSession.updatedAt = Date.now();
    }
    const uiState = createVennAnalysisUiStateForPatch(previousAnalysis, analysisPatch);
    payload.analysis = createVennAnalysisPayloadFromResults(canonicalResults, uiState);
    let changed = false;
    if (typeof session.updateTabPayload === 'function') {
      changed = session.updateTabPayload(tab, () => payload, {
        reason: resolvedReason,
        origin: meta.origin || 'user'
      });
    } else if (typeof session.assignTabPayload === 'function') {
      changed = session.assignTabPayload(tab, payload, { reason: resolvedReason });
      if (changed && typeof session.markTabUserModified === 'function') {
        session.markTabUserModified(tab, resolvedReason, { origin: meta.origin || 'user' });
      }
    } else {
      return false;
    }
    debugLog('venn tab analysis patched', {
      tabId,
      reason: resolvedReason,
      keys: Object.keys(analysisPatch || {}),
      changed
    });
    return changed;
  }

  function beginVennAnalysisRequest(kind, meta = {}) {
    const tabId = normalizeVennSessionTabId(meta?.tabId || resolveActiveVennTabId() || null, meta);
    const session = getVennSession(tabId, { ...(meta || {}), tabId, reason: meta.reason || `venn-${kind}-request` }, { create: true });
    if (!session) {
      return { tabId: tabId || null, session: null, token: null };
    }
    const cache = session.cache || (session.cache = {});
    const asyncRequests = cache.asyncRequests || (cache.asyncRequests = { go: null, string: null });
    const token = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    asyncRequests[kind] = token;
    session.updatedAt = Date.now();
    return { tabId: session.tabId || tabId || null, session, token };
  }

  function isVennAnalysisRequestCurrent(owner, kind) {
    if (!owner || !owner.session || !owner.token) {
      return false;
    }
    const session = getVennSession(owner.tabId || owner.session.tabId || null, { tabId: owner.tabId || owner.session.tabId || null, reason: `venn-${kind}-request-check` }, { create: false })
      || owner.session;
    return !!(session?.cache?.asyncRequests && session.cache.asyncRequests[kind] === owner.token);
  }

  function commitVennAnalysisPatch(owner, patch, meta = {}) {
    if (!owner || !owner.session || !owner.tabId || !patch || typeof patch !== 'object') {
      return false;
    }
    const session = getVennSession(owner.tabId, { tabId: owner.tabId, reason: meta.reason || 'venn-analysis-session-commit' }, { create: true })
      || owner.session;
    session.results = createDefaultVennResultsState({
      ...(session.results || {}),
      ...patch
    });
    session.updatedAt = Date.now();
    updateTabAnalysisPayload(owner.tabId, patch, {
      reason: meta.reason || 'venn-analysis-session-commit',
      origin: meta.origin || 'user'
    });
    return true;
  }

  function isVennAnalysisOwnerActive(owner) {
    return !!(owner?.tabId && owner.tabId === resolveActiveVennTabId());
  }

  function getSpeciesIndicatorColor(success) {
    if (success === null) {
      return '';
    }
    return success ? '#b5d99c' : '#f28b82';
  }

  function commitVennSpeciesSelection(owner, speciesValue, indicatorSuccess, meta = {}) {
    if (!owner || !owner.tabId) {
      return false;
    }
    const value = speciesValue == null ? '' : String(speciesValue);
    const indicator = getSpeciesIndicatorColor(indicatorSuccess);
    const ownerSession = getVennSession(owner.tabId, {
      tabId: owner.tabId,
      reason: meta.reason || 'venn-species-commit'
    }, { create: true }) || owner.session || null;
    if (ownerSession) {
      const snapshot = ownerSession.state?.snapshot || null;
      if (snapshot) {
        snapshot.speciesValue = value;
        snapshot.speciesIndicator = indicator;
      }
      const runtime = ownerSession.state?.runtime || null;
      if (runtime) {
        runtime.ui = runtime.ui && typeof runtime.ui === 'object' ? runtime.ui : {};
        runtime.ui.speciesValue = value;
        runtime.ui.speciesIndicator = indicator;
      }
      ownerSession.updatedAt = Date.now();
    }
    updateTabAnalysisPayload(owner.tabId, {
      speciesValue: value,
      speciesIndicator: indicator
    }, {
      reason: meta.reason || 'venn-species-commit',
      origin: meta.origin || 'user'
    });
    if (isVennAnalysisOwnerActive(owner)) {
      if (state.ui.speciesSelect) {
        state.ui.speciesSelect.value = value;
        state.ui.speciesSelect.style.backgroundColor = indicator;
      }
      captureVennSessionStateFromActive(ownerSession || activeVennSession, {
        reason: meta.reason || 'venn-species-commit'
      });
    }
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

  function normalizeStringOverlayName(value){
    return String(value ?? '')
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  const STRING_OVERLAY_ALIAS_PAIRS = [
    ['RING1B', 'RNF2'],
    ['RING1A', 'RING1']
  ];
  const STRING_OVERLAY_ALIAS_MAP = STRING_OVERLAY_ALIAS_PAIRS.reduce((map, pair) => {
    const a = normalizeStringOverlayName(pair[0]);
    const b = normalizeStringOverlayName(pair[1]);
    if(a && b){
      map.set(a, b);
      map.set(b, a);
    }
    return map;
  }, new Map());

  function addStringOverlayNameKey(keys, value){
    const key = normalizeStringOverlayName(value);
    if(!key){ return; }
    keys.add(key);
    const alias = STRING_OVERLAY_ALIAS_MAP.get(key);
    if(alias){ keys.add(alias); }
  }

  function getStringOverlayNameKeys(value){
    const raw = String(value ?? '').replace(/^\uFEFF/, '').trim();
    const keys = new Set();
    addStringOverlayNameKey(keys, raw);
    const expanded = raw
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[_-](HUMAN|MOUSE|RAT|YEAST|ARATH|DROME|CAEEL)$/i, ' ')
      .replace(/\b(HUMAN|MOUSE|RAT|YEAST|ARATH|DROME|CAEEL)\b/ig, ' ');
    expanded
      .split(/[;,|/\s_:-]+/)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => addStringOverlayNameKey(keys, part));
    return Array.from(keys);
  }

  function parseStringOverlayNumber(value){
    if(typeof value === 'number'){
      return Number.isFinite(value) ? value : NaN;
    }
    let text = String(value ?? '')
      .replace(/^\uFEFF/, '')
      .replace(/[\u00A0\u202F\s]+/g, '')
      .replace(/[−–—]/g, '-')
      .trim();
    if(!text){ return NaN; }
    const percent = text.endsWith('%');
    if(percent){ text = text.slice(0, -1); }

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if(lastComma >= 0 && lastDot >= 0){
      const decimal = lastComma > lastDot ? ',' : '.';
      const thousands = decimal === ',' ? '.' : ',';
      text = text.split(thousands).join('');
      if(decimal === ','){
        text = text.replace(',', '.');
      }
    }else if(lastComma >= 0){
      text = text.replace(',', '.');
    }

    const numeric = Number(text);
    return Number.isFinite(numeric) ? (percent ? numeric / 100 : numeric) : NaN;
  }

  function parseStringOverlayDelimited(text, delimiter){
    const sep = delimiter || ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const pushCell = () => {
      row.push(cell);
      cell = '';
    };
    const pushRow = () => {
      pushCell();
      if(row.some(value => String(value ?? '').trim() !== '')){
        rows.push(row);
      }
      row = [];
    };

    const src = String(text || '');
    for(let i = 0; i < src.length; i += 1){
      const ch = src[i];
      if(quoted){
        if(ch === '"'){
          if(src[i + 1] === '"'){
            cell += '"';
            i += 1;
          }else{
            quoted = false;
          }
        }else{
          cell += ch;
        }
        continue;
      }
      if(ch === '"' && cell.trim() === ''){
        quoted = true;
        cell = cell.trimStart();
      }else if(ch === sep){
        pushCell();
      }else if(ch === '\n' || ch === '\r'){
        pushRow();
        if(ch === '\r' && src[i + 1] === '\n'){
          i += 1;
        }
      }else{
        cell += ch;
      }
    }
    if(cell !== '' || row.length){
      pushRow();
    }
    return rows;
  }

  function detectStringOverlayDelimiter(text){
    const sample = String(text || '').split(/\r?\n/).slice(0, 25).join('\n');
    const candidates = ['\t', ';', ','];
    let best = candidates[0];
    let bestScore = -Infinity;
    candidates.forEach(delimiter => {
      const rows = parseStringOverlayDelimited(sample, delimiter).slice(0, 12);
      const widths = rows.map(row => row.length).filter(width => width > 1);
      if(!widths.length){ return; }
      const maxWidth = Math.max(...widths);
      const commonWidth = widths.reduce((counts, width) => {
        counts.set(width, (counts.get(width) || 0) + 1);
        return counts;
      }, new Map());
      const consistency = Math.max(...Array.from(commonWidth.values()));
      const numericCells = rows.reduce((count, row) => count + row.filter(cell => Number.isFinite(parseStringOverlayNumber(cell))).length, 0);
      const score = maxWidth * 10 + consistency * 25 + numericCells;
      if(score > bestScore){
        bestScore = score;
        best = delimiter;
      }
    });
    return best;
  }

  function readStringOverlayFileText(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(String(event.target?.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  function readStringOverlayFileBuffer(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target?.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  async function readStringOverlayRows(file){
    const ext = String(file?.name || '').split('.').pop().toLowerCase();
    if(['xls', 'xlsx', 'ods'].includes(ext)){
      const loader = Shared.lazyXlsx;
      if(typeof loader !== 'function'){
        throw new Error('Spreadsheet loader is unavailable');
      }
      const XLSX = await loader();
      const buffer = await readStringOverlayFileBuffer(file);
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheetName = workbook.SheetNames?.[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : null;
      return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) : [];
    }
    const text = await readStringOverlayFileText(file);
    const delimiter = ext === 'tsv' ? '\t' : detectStringOverlayDelimiter(text);
    return parseStringOverlayDelimited(text, delimiter);
  }

  function normalizeStringOverlayMatrixLabel(value){
    return String(value ?? '')
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/^"|"$/g, '')
      .replace(/\s+/g, ' ');
  }

  function normalizeStringOverlayMatrixKey(value){
    return normalizeStringOverlayName(normalizeStringOverlayMatrixLabel(value));
  }

  function makeStringOverlayMatrixEdgeKey(sourceLabel, targetLabel){
    const sourceKey = normalizeStringOverlayMatrixKey(sourceLabel);
    const targetKey = normalizeStringOverlayMatrixKey(targetLabel);
    if(!sourceKey || !targetKey || sourceKey === targetKey){ return ''; }
    return [sourceKey, targetKey].sort().join('\u0000');
  }

  function upsertStringOverlayEdge(edgeMap, sourceLabel, targetLabel, value){
    const source = normalizeStringOverlayMatrixLabel(sourceLabel);
    const target = normalizeStringOverlayMatrixLabel(targetLabel);
    const edgeKey = makeStringOverlayMatrixEdgeKey(source, target);
    if(!edgeKey || !Number.isFinite(value)){ return; }
    const existing = edgeMap.get(edgeKey);
    if(!existing || Math.abs(value) > Math.abs(existing.value)){
      edgeMap.set(edgeKey, { source, target, value });
    }
  }

  function cleanStringOverlayRows(rows){
    return (Array.isArray(rows) ? rows : [])
      .map(row => Array.isArray(row)
        ? row.map(value => String(value ?? '').replace(/^\uFEFF/, '').trim())
        : [])
      .filter(row => row.some(value => value !== ''));
  }

  function findStringOverlayHeaderIndex(header, aliases){
    const keys = header.map(value => normalizeStringOverlayName(value).replace(/[^A-Z0-9]+/g, ''));
    return keys.findIndex(key => aliases.includes(key));
  }

  function parseStringOverlayLongRows(cleaned){
    const header = cleaned[0] || [];
    const sourceIndex = findStringOverlayHeaderIndex(header, ['SOURCE', 'FROM', 'GENE1', 'PROTEIN1', 'NODE1']);
    const targetIndex = findStringOverlayHeaderIndex(header, ['TARGET', 'TO', 'GENE2', 'PROTEIN2', 'NODE2']);
    const valueIndex = findStringOverlayHeaderIndex(header, ['VALUE', 'SCORE', 'WEIGHT', 'CORRELATION', 'CORR', 'R', 'EDGEVALUE']);
    if(sourceIndex < 0 || targetIndex < 0 || valueIndex < 0){
      return null;
    }
    const edgeMap = new Map();
    cleaned.slice(1).forEach(row => {
      upsertStringOverlayEdge(edgeMap, row[sourceIndex], row[targetIndex], parseStringOverlayNumber(row[valueIndex]));
    });
    return Array.from(edgeMap.values());
  }

  function parseStringOverlayMatrixRows(cleaned){
    const header = cleaned[0] || [];
    if(header.length < 2){ return []; }
    const firstHeaderKey = normalizeStringOverlayName(header[0]).replace(/[^A-Z0-9]+/g, '');
    const headerHasLabelColumn = !firstHeaderKey || ['GENE', 'GENES', 'PROTEIN', 'PROTEINS', 'NAME', 'NAMES', 'ID', 'SYMBOL'].includes(firstHeaderKey);
    const labelColumn = 0;
    const dataStart = headerHasLabelColumn ? 1 : 1;
    const columns = header
      .map((label, index) => ({ label: normalizeStringOverlayMatrixLabel(label), index }))
      .slice(dataStart)
      .filter(column => column.label);
    if(!columns.length){ return []; }

    const edgeMap = new Map();
    cleaned.slice(1).forEach(row => {
      const sourceLabel = normalizeStringOverlayMatrixLabel(row[labelColumn]);
      if(!sourceLabel){ return; }
      columns.forEach(column => {
        upsertStringOverlayEdge(edgeMap, sourceLabel, column.label, parseStringOverlayNumber(row[column.index]));
      });
    });
    return Array.from(edgeMap.values());
  }

  function parseStringOverlayRows(rows){
    const cleaned = cleanStringOverlayRows(rows);
    if(cleaned.length < 2){
      return [];
    }
    const longEdges = parseStringOverlayLongRows(cleaned);
    const edges = longEdges || parseStringOverlayMatrixRows(cleaned);
    debugLog('string overlay matrix extracted', {
      format: longEdges ? 'edge-table' : 'matrix',
      rows: cleaned.length,
      edges: edges.length
    });
    return edges;
  }

  function edgePassesStringOverlay(edge, model){
    const value = Number(edge?.value);
    if(!Number.isFinite(value)){ return false; }
    const threshold = Number(model.threshold);
    const limit = Math.abs(Number.isFinite(threshold) ? threshold : DEFAULT_STRING_OVERLAY.threshold);
    if(model.mode === 'positive'){
      return value >= limit;
    }
    if(model.mode === 'negative'){
      return value <= -limit;
    }
    return Math.abs(value) >= limit;
  }

  function getStringOverlayNodePriorityMap(nodes){
    if(!nodes.__graphitixPriorities){
      Object.defineProperty(nodes, '__graphitixPriorities', { value: new Map(), enumerable: false });
    }
    return nodes.__graphitixPriorities;
  }

  function registerStringOverlayNode(nodes, key, node, priority = 0){
    if(!key || !node){ return; }
    const priorities = getStringOverlayNodePriorityMap(nodes);
    const existingPriority = priorities.has(key) ? priorities.get(key) : -Infinity;
    if(!nodes.has(key) || priority > existingPriority){
      nodes.set(key, node);
      priorities.set(key, priority);
    }
  }

  function registerStringOverlayLabel(nodes, label, node, priority = 0){
    const raw = String(label || '').trim();
    if(!raw || !node){ return; }
    const direct = normalizeStringOverlayName(raw);
    if(direct){
      registerStringOverlayNode(nodes, direct, node, priority);
      const alias = STRING_OVERLAY_ALIAS_MAP.get(direct);
      if(alias){ registerStringOverlayNode(nodes, alias, node, priority - 1); }
    }
    getStringOverlayNameKeys(raw).forEach(key => {
      if(key !== direct){ registerStringOverlayNode(nodes, key, node, priority - 10); }
    });
  }

  function extractStringNetworkNodes(svgEl){
    const nodes = new Map();
    const nodeList = [];
    Array.from(svgEl?.querySelectorAll?.('.nwnodecontainer') || []).forEach(container => {
      const labels = [
        container.getAttribute('data-safe_div_label'),
        container.getAttribute('data-safe_label'),
        container.getAttribute('data-label'),
        container.getAttribute('aria-label'),
        container.getAttribute('title'),
        ...Array.from(container.attributes || [])
          .filter(attr => /^data-/i.test(attr.name) && /label|name|preferred|query|display/i.test(attr.name))
          .map(attr => attr.value),
        ...Array.from(container.querySelectorAll('title,text')).map(text => text.textContent || '')
      ].map(value => String(value || '').trim()).filter(Boolean);
      const displayLabel = labels.find(label => label) || '';
      const x = Number(container.getAttribute('data-x_pos'));
      const y = Number(container.getAttribute('data-y_pos'));
      const radius = Number(container.getAttribute('data-radius')) || 20;
      if(!Number.isFinite(x) || !Number.isFinite(y)){
        return;
      }
      const node = {
        id: container.getAttribute('id') || `string-node-${nodeList.length + 1}`,
        label: displayLabel,
        labels: new Set(labels),
        x,
        y,
        radius
      };
      nodeList.push(node);
      labels.forEach(label => registerStringOverlayLabel(nodes, label, node, 100));
    });

    Array.from(svgEl?.querySelectorAll?.('text') || []).forEach(text => {
      const label = String(text.textContent || '').trim();
      if(!label || !nodeList.length){ return; }
      const x = Number(text.getAttribute('x'));
      const y = Number(text.getAttribute('y'));
      if(!Number.isFinite(x) || !Number.isFinite(y)){ return; }
      let best = null;
      let bestDistance = Infinity;
      nodeList.forEach(node => {
        const distance = Math.hypot(x - node.x, y - node.y);
        if(distance < bestDistance){
          best = node;
          bestDistance = distance;
        }
      });
      if(best && bestDistance <= Math.max(90, (best.radius || 20) * 4.5)){
        best.labels.add(label);
        registerStringOverlayLabel(nodes, label, best, 40);
      }
    });
    return nodes;
  }

  function getStringOverlayNodeCenter(nodes){
    const values = Array.from(new Set(Array.from(nodes?.values?.() || [])));
    if(!values.length){ return null; }
    const totals = values.reduce((acc, node) => {
      acc.x += node.x;
      acc.y += node.y;
      return acc;
    }, { x: 0, y: 0 });
    return { x: totals.x / values.length, y: totals.y / values.length };
  }

  function buildOffsetStringOverlayPath(source, target, width, networkCenter){
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    let nx = -uy;
    let ny = ux;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    if(networkCenter){
      const outwardX = midX - networkCenter.x;
      const outwardY = midY - networkCenter.y;
      if((nx * outwardX + ny * outwardY) < 0){
        nx = -nx;
        ny = -ny;
      }
    }else if(ny < 0 || (ny === 0 && nx < 0)){
      nx = -nx;
      ny = -ny;
    }
    const stroke = Math.max(0.5, Number(width) || DEFAULT_STRING_OVERLAY.thickness);
    const sideBias = Math.min(1.45, Math.max(0.95, 1.08 + stroke * 0.035));
    const sourceDirLen = Math.hypot(ux + nx * sideBias, uy + ny * sideBias) || 1;
    const targetDirLen = Math.hypot(-ux + nx * sideBias, -uy + ny * sideBias) || 1;
    const sourceRadius = (source.radius || 20) + stroke * 0.5 + 1;
    const targetRadius = (target.radius || 20) + stroke * 0.5 + 1;
    const x1 = source.x + ((ux + nx * sideBias) / sourceDirLen) * sourceRadius;
    const y1 = source.y + ((uy + ny * sideBias) / sourceDirLen) * sourceRadius;
    const x2 = target.x + ((-ux + nx * sideBias) / targetDirLen) * targetRadius;
    const y2 = target.y + ((-uy + ny * sideBias) / targetDirLen) * targetRadius;
    const curveOffset = Math.min(96, Math.max(36, length * 0.28) + stroke * 2);
    const cx = (x1 + x2) / 2 + nx * curveOffset;
    const cy = (y1 + y2) / 2 + ny * curveOffset;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  function setStringOverlayStatus(message){
    if(state.ui.stringOverlayStatus){
      state.ui.stringOverlayStatus.textContent = message || '';
    }
  }

  function getStringOverlayBaseName(value){
    return String(value || '').replace(/^\uFEFF/, '').split(/[\\/]/).pop().trim();
  }

  function isLikelyShortDosFileName(value){
    const base = getStringOverlayBaseName(value).replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
    if(!base || !base.includes('~')){ return false; }
    const stem = base.split('.')[0] || base;
    return /^[A-Z0-9_$ -]{1,8}~\d+$/i.test(stem);
  }

  function getStringOverlayFileDisplayName(file, inputValue = ''){
    const candidates = [
      getStringOverlayBaseName(file?.name),
      getStringOverlayBaseName(file?.webkitRelativePath),
      getStringOverlayBaseName(inputValue)
    ].filter(Boolean);
    if(!candidates.length){ return ''; }
    return candidates.find(candidate => !isLikelyShortDosFileName(candidate)) || '';
  }

  function getStringOverlayModelFileLabel(model){
    const normalized = normalizeStringOverlayModel(model);
    const candidates = [normalized.fileDisplayName, normalized.fileName].filter(Boolean);
    return candidates.find(candidate => !isLikelyShortDosFileName(candidate)) || '';
  }

  function setStringOverlayFileName(fileName, hasFile = false){
    if(state.ui.stringOverlayFileName){
      const label = String(fileName || '').trim();
      const display = label && !isLikelyShortDosFileName(label)
        ? label
        : (hasFile || label ? 'Selected matrix file' : 'No file selected');
      state.ui.stringOverlayFileName.textContent = display;
      state.ui.stringOverlayFileName.title = label && label !== display ? label : '';
    }
  }

  function getStringOverlayCandidateText(model){
    const count = normalizeStringOverlayModel(model).edges.length;
    return `${count} custom edge candidate${count === 1 ? '' : 's'} loaded`;
  }

  function findStringOverlayNode(nodes, label){
    for(const key of getStringOverlayNameKeys(label)){
      const node = nodes.get(key);
      if(node){ return node; }
    }
    return null;
  }

  function applyStringOverlayToSvg(svgEl){
    const existing = svgEl?.querySelector?.(`#${STRING_OVERLAY_LAYER_ID}`);
    existing?.remove?.();
    const model = normalizeStringOverlayModel(state.analysis.stringOverlay);
    state.analysis.stringOverlay = model;
    if(!svgEl){
      setStringOverlayStatus(model.fileName ? getStringOverlayCandidateText(model) : 'No custom edge data loaded');
      return { drawn: 0, missing: 0 };
    }
    if(!model.enabled){
      setStringOverlayStatus(model.fileName ? 'Overlay hidden' : 'No custom edge data loaded');
      return { drawn: 0, missing: 0 };
    }
    if(!model.edges.length){
      setStringOverlayStatus(model.fileName ? 'No valid custom edges found' : 'No custom edge data loaded');
      return { drawn: 0, missing: 0 };
    }
    const nodes = extractStringNetworkNodes(svgEl);
    const networkCenter = getStringOverlayNodeCenter(nodes);
    const layer = document.createElementNS(NS, 'g');
    layer.setAttribute('id', STRING_OVERLAY_LAYER_ID);
    layer.setAttribute('class', 'graphitix-string-overlay');
    layer.setAttribute('pointer-events', 'none');

    const missing = new Set();
    const matchedEdgeMap = new Map();
    model.edges.forEach(edge => {
      const source = findStringOverlayNode(nodes, edge.source);
      const target = findStringOverlayNode(nodes, edge.target);
      if(!source || !target){
        if(source || target){
          if(!source){ missing.add(edge.source); }
          if(!target){ missing.add(edge.target); }
        }
        return;
      }
      if(source === target){ return; }
      const pairKey = [source.id || `${source.x},${source.y}`, target.id || `${target.x},${target.y}`].sort().join('\u0000');
      const candidate = { edge, source, target };
      const existing = matchedEdgeMap.get(pairKey);
      if(!existing || Math.abs(Number(edge.value) || 0) > Math.abs(Number(existing.edge.value) || 0)){
        matchedEdgeMap.set(pairKey, candidate);
      }
    });
    const matchedEdges = Array.from(matchedEdgeMap.values());

    let drawn = 0;
    const drawnEdges = [];
    matchedEdges.forEach(({ edge, source, target }) => {
      if(!edgePassesStringOverlay(edge, model)){ return; }
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', buildOffsetStringOverlayPath(source, target, model.thickness, networkCenter));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', model.color);
      path.setAttribute('stroke-width', String(model.thickness));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-opacity', '0.95');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('data-source', edge.source);
      path.setAttribute('data-target', edge.target);
      path.setAttribute('data-value', String(edge.value));
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${edge.source} - ${edge.target}: ${edge.value}`;
      path.appendChild(title);
      layer.appendChild(path);
      drawn += 1;
      drawnEdges.push(`${edge.source}-${edge.target}:${edge.value}`);
    });
    const edgeHost = svgEl.querySelector('#edges') || svgEl;
    edgeHost.appendChild(layer);
    const missingText = missing.size ? `; ${missing.size} partially matched protein${missing.size === 1 ? '' : 's'}` : '';
    setStringOverlayStatus(`${drawn} edge${drawn === 1 ? '' : 's'} drawn${missingText}`);
    debugLog('string overlay applied', {
      threshold: model.threshold,
      mode: model.mode,
      matchedEdges: matchedEdges.length,
      drawn,
      drawnEdges: drawnEdges.slice(0, 20),
      matchedEdgeValues: matchedEdges
        .map(({ edge }) => `${edge.source}-${edge.target}:${edge.value}`)
        .slice(0, 40),
      nodeKeys: Array.from(nodes.keys()).slice(0, 50)
    });
    return { drawn, missing: missing.size };
  }

  function syncStringOverlayControls(){
    const model = normalizeStringOverlayModel(state.analysis.stringOverlay);
    state.analysis.stringOverlay = model;
    setStringOverlayFileName(getStringOverlayModelFileLabel(model), !!(model.fileName || model.edges.length));
    if(state.ui.stringOverlayEnabled){ state.ui.stringOverlayEnabled.checked = model.enabled; }
    if(state.ui.stringOverlayThreshold){ state.ui.stringOverlayThreshold.value = String(model.threshold); }
    if(state.ui.stringOverlayMode){ state.ui.stringOverlayMode.value = model.mode; }
    if(state.ui.stringOverlayColor){ state.ui.stringOverlayColor.value = model.color; }
    if(state.ui.stringOverlayThickness){ state.ui.stringOverlayThickness.value = String(model.thickness); }
    setStringOverlayStatus(model.fileName ? getStringOverlayCandidateText(model) : 'No custom edge data loaded');
  }

  function readStringOverlayControls(){
    const current = normalizeStringOverlayModel(state.analysis.stringOverlay);
    return normalizeStringOverlayModel({
      ...current,
      enabled: state.ui.stringOverlayEnabled ? state.ui.stringOverlayEnabled.checked : current.enabled,
      threshold: state.ui.stringOverlayThreshold && state.ui.stringOverlayThreshold.value !== '' ? state.ui.stringOverlayThreshold.value : current.threshold,
      mode: state.ui.stringOverlayMode ? state.ui.stringOverlayMode.value : current.mode,
      color: state.ui.stringOverlayColor ? state.ui.stringOverlayColor.value : current.color,
      thickness: state.ui.stringOverlayThickness && state.ui.stringOverlayThickness.value !== '' ? state.ui.stringOverlayThickness.value : current.thickness
    });
  }

  function applyStringOverlayToRenderedNetwork(reason = 'venn-string-overlay-viewport'){
    const svgEl = state.ui.stringNetwork?.querySelector?.('svg');
    if(!svgEl){
      syncStringOverlayControls();
      return null;
    }
    const result = applyStringOverlayToSvg(svgEl);
    scheduleStringNetworkViewport(svgEl, reason);
    return result;
  }

  function rerenderStringOverlay(reason = 'venn-string-overlay-rerender'){
    applyStringOverlayToRenderedNetwork(reason);
    const token = ++stringOverlayRerenderToken;
    const rerender = () => {
      if(token === stringOverlayRerenderToken){
        applyStringOverlayToRenderedNetwork(reason);
      }
    };
    Shared.componentLifecycle?.scheduleComponentFrame?.(venn, 'venn', {
      tabId: venn.__boundTabId || null,
      reason
    }, rerender) || global.requestAnimationFrame?.(rerender) || global.setTimeout(rerender, 0);
  }

  function commitStringOverlayPayload(reason){
    const owner = getActiveVennSessionForState();
    const tabId = owner?.tabId || resolveActiveVennTabId();
    if(tabId){
      return commitVennAnalysisPatch({ tabId, session: owner }, {
        stringOverlay: state.analysis.stringOverlay
      }, { reason: reason || 'venn-string-overlay', origin: 'user' });
    }
    return syncActiveVennPayload(reason || 'venn-string-overlay');
  }

  function handleStringOverlayFileButtonClick(event){
    event?.preventDefault?.();
    if(state.ui.stringOverlayFile){
      state.ui.stringOverlayFile.value = '';
      state.ui.stringOverlayFile.click();
    }
  }

  async function handleStringOverlayFileChange(event){
    const file = event?.target?.files?.[0];
    if(!file){ return; }
    const fileDisplayName = getStringOverlayFileDisplayName(file, event?.target?.value || '');
    setStringOverlayFileName(fileDisplayName || file.name, true);
    setStringOverlayStatus(`Loading ${fileDisplayName || file.name}...`);
    try{
      const rows = await readStringOverlayRows(file);
      const edges = parseStringOverlayRows(rows);
      state.analysis.stringOverlay = normalizeStringOverlayModel({
        ...readStringOverlayControls(),
        fileName: file.name,
        fileDisplayName,
        edges
      });
      syncStringOverlayControls();
      rerenderStringOverlay();
      commitStringOverlayPayload('venn-string-overlay-file');
      debugLog('string overlay file loaded', { fileName: file.name, fileDisplayName, rows: rows.length, edges: edges.length });
    }catch(err){
      console.error('venn string overlay import error', err);
      setStringOverlayStatus(`Failed to load ${fileDisplayName || file.name}`);
    }finally{
      if(event?.target){ event.target.value = ''; }
    }
  }

  function handleStringOverlayControlInput(){
    state.analysis.stringOverlay = readStringOverlayControls();
    rerenderStringOverlay('venn-string-overlay-controls-live');
  }

  function handleStringOverlayControlChange(event){
    state.analysis.stringOverlay = readStringOverlayControls();
    rerenderStringOverlay('venn-string-overlay-controls');
    commitStringOverlayPayload('venn-string-overlay-controls');
    const target = event?.currentTarget || null;
    commitVennUndo(target, target?.id ? `venn:${target.id}` : 'venn:string-overlay-controls');
  }

  function buildStringNetworkSvgString(){
    const svgEl = state.ui.stringNetwork?.querySelector?.('svg');
    if(!svgEl){ return state.analysis.lastStringSVG || ''; }
    const clone = svgEl.cloneNode(true);
    if(!clone.getAttribute('xmlns')){
      clone.setAttribute('xmlns', NS);
    }
    if(!clone.getAttribute('xmlns:xlink')){
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }
    return new XMLSerializer().serializeToString(clone);
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
    readStringNetworkBaseViewport(svgEl);
    applyStringOverlayToSvg(svgEl);
    state.ui.stringNetwork.appendChild(svgEl);
    if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'flex';
    scheduleStringNetworkViewport(svgEl, 'venn-string-network-viewport');
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
      setActiveAnalysisResultsTab(state.analysis.activeResultsTab || 'go', { syncPayload: false });
      return;
    }
    state.analysis.stringOverlay = normalizeStringOverlayModel(analysis.stringOverlay);
    syncStringOverlayControls();
    const goResult = Array.isArray(analysis.goResult) ? analysis.goResult : null;
    state.analysis.goPerformed = !!analysis.goPerformed || Array.isArray(goResult);
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
    state.analysis.stringPerformed = !!analysis.stringPerformed
      || (typeof analysis.stringSvg === 'string' && analysis.stringSvg.length > 0)
      || Array.isArray(analysis.stringEnrichment);
    if (Array.isArray(analysis.stringEnrichment)) {
      state.analysis.lastStringEnrichment = cloneSimple(analysis.stringEnrichment) || analysis.stringEnrichment;
      renderStringResults(state.analysis.lastStringEnrichment, analysis.stringLimit || 5);
    }
    state.analysis.lastSignificance = analysis.lastSignificance ? cloneSimple(analysis.lastSignificance) : null;
    state.analysis.significancePanelModel = normalizeVennSignificancePanelModel(analysis.significancePanelModel || {});
    if(state.ui.totalGenesInput && Object.prototype.hasOwnProperty.call(analysis, 'totalGenes')){
      state.ui.totalGenesInput.value = analysis.totalGenes || '';
    }
    if(state.ui.speciesSelect && Object.prototype.hasOwnProperty.call(analysis, 'speciesValue')){
      state.ui.speciesSelect.value = analysis.speciesValue || '';
      state.ui.speciesSelect.style.backgroundColor = analysis.speciesIndicator || '';
    }
    restoreVennSignificancePanelModel(state.analysis.significancePanelModel);
    setActiveAnalysisResultsTab(analysis.activeResultsTab || state.analysis.activeResultsTab || 'go', { syncPayload: false });
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

  function normalizeGoChartLimit(limit) {
    const numeric = Number(limit);
    if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
    return 5;
  }

  function buildGoChartRows(limit = 5) {
    if (!hasGoChartData()) return [];
    const rows = state.analysis.lastGOResult.slice(0, normalizeGoChartLimit(limit)).map((entry, index) => {
      const rawPValue = Number(entry?.p_value);
      const finitePValue = Number.isFinite(rawPValue) && rawPValue > 0 ? rawPValue : null;
      return {
        index,
        label: String(entry?.term_name || entry?.name || 'Unknown term'),
        source: String(entry?.source || 'unknown source'),
        pValue: finitePValue,
        value: finitePValue ? -Math.log10(finitePValue) : Number.POSITIVE_INFINITY
      };
    });
    const finiteValues = rows.map(row => row.value).filter(Number.isFinite);
    const finiteMax = finiteValues.length ? Math.max(...finiteValues) : 0;
    const fallbackInfinityValue = Math.max(1, finiteMax > 0 ? finiteMax * 1.08 : 1);
    rows.forEach(row => {
      if (!Number.isFinite(row.value)) row.value = fallbackInfinityValue;
    });
    return rows;
  }

  function formatGoChartNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    if (chartStyle && typeof chartStyle.formatScientific === 'function') {
      return chartStyle.formatScientific(numeric, { maxDecimals: 2 });
    }
    if (Math.abs(numeric) >= 1000 || (Math.abs(numeric) > 0 && Math.abs(numeric) < 0.01)) {
      return numeric.toExponential(2).replace(/\.00e/, 'e');
    }
    return numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  function measureGoChartText(text, fontPx = GO_CHART_SVG_CONFIG.labelFontPx) {
    const value = String(text || '');
    if (!value) return 0;
    try {
      const canvas = measureGoChartText.canvas || (measureGoChartText.canvas = global.document?.createElement?.('canvas'));
      const ctx = canvas?.getContext?.('2d');
      if (ctx) {
        ctx.font = `${fontPx}px Arial, Helvetica, sans-serif`;
        return ctx.measureText(value).width;
      }
    } catch (err) {
      // Fall through to a deterministic approximation when canvas is unavailable.
    }
    return value.length * fontPx * 0.55;
  }

  function truncateGoChartLabel(label, maxWidth, fontPx = GO_CHART_SVG_CONFIG.labelFontPx) {
    const text = String(label || '');
    if (!text || measureGoChartText(text, fontPx) <= maxWidth) return text;
    const ellipsis = '…';
    let low = 0;
    let high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const candidate = text.slice(0, mid).trimEnd() + ellipsis;
      if (measureGoChartText(candidate, fontPx) <= maxWidth) low = mid;
      else high = mid - 1;
    }
    return text.slice(0, Math.max(1, low)).trimEnd() + ellipsis;
  }

  function niceGoChartNumber(value, round) {
    const numeric = Math.max(0, Number(value) || 0);
    if (numeric <= 0) return 1;
    const exponent = Math.floor(Math.log10(numeric));
    const fraction = numeric / Math.pow(10, exponent);
    let niceFraction;
    if (round) {
      if (fraction < 1.5) niceFraction = 1;
      else if (fraction < 3) niceFraction = 2;
      else if (fraction < 7) niceFraction = 5;
      else niceFraction = 10;
    } else if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * Math.pow(10, exponent);
  }

  function buildGoChartTicks(maxValue, desiredCount = 5) {
    const safeMax = Math.max(1, Number(maxValue) || 1);
    const count = Math.max(2, Math.min(8, Math.floor(desiredCount) || 5));
    const range = niceGoChartNumber(safeMax, false);
    const step = niceGoChartNumber(range / (count - 1), true);
    const tickMax = Math.max(step, Math.ceil(safeMax / step) * step);
    const ticks = [];
    for (let value = 0, guard = 0; value <= tickMax + step * 0.5 && guard < 20; value += step, guard += 1) {
      ticks.push(Number(value.toFixed(12)));
    }
    if (ticks[ticks.length - 1] < safeMax) ticks.push(tickMax);
    return { ticks, tickMax };
  }

  function createSvgNode(tagName, attrs = {}, text = null) {
    const node = global.document.createElementNS(NS, tagName);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || typeof value === 'undefined') return;
      node.setAttribute(key, String(value));
    });
    if (text !== null && typeof text !== 'undefined') node.textContent = String(text);
    return node;
  }

  function renderGOChart(limit = 5, options = {}) {
    const svg = getGoChartSvg();
    if (!svg) return false;
    if (!hasGoChartData()) {
      clearGoChartSvg();
      return false;
    }
    const rows = buildGoChartRows(limit);
    if (!rows.length) {
      clearGoChartSvg();
      return false;
    }
    state.analysis.goDisplayLimit = normalizeGoChartLimit(limit);
    const config = GO_CHART_SVG_CONFIG;
    const width = resolveGoChartLayoutWidth(svg);
    const height = computeGoChartHeight(state.analysis.goDisplayLimit, rows.length);
    const maxLabelWidth = rows.reduce((max, row) => Math.max(max, measureGoChartText(row.label, config.labelFontPx)), 0);
    const leftLimit = Math.min(config.leftMax, Math.max(config.leftMin, width * config.leftFraction));
    const labelWidth = Math.max(config.leftMin - config.labelGap, Math.min(maxLabelWidth, leftLimit - config.labelGap));
    const plotLeft = Math.round(Math.max(config.leftMin, labelWidth + config.labelGap));
    const plotRight = Math.max(plotLeft + 60, width - config.right);
    const plotTop = config.top;
    const plotBottom = height - config.bottom;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const rowBand = plotHeight / rows.length;
    const barHeight = Math.max(8, Math.min(resolveGoChartBarHeight(state.analysis.goDisplayLimit), rowBand * 0.62));
    const maxValue = Math.max(...rows.map(row => row.value), 1);
    const { ticks, tickMax } = buildGoChartTicks(maxValue, 5);
    const valueToX = value => plotLeft + (Math.max(0, Number(value) || 0) / tickMax) * plotWidth;
    const signature = [
      state.analysis.goDisplayLimit,
      rows.length,
      Math.round(width),
      Math.round(height),
      rows.map(row => `${row.label}:${row.value.toFixed(6)}`).join('|')
    ].join('::');

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    svg.setAttribute('aria-label', 'GO enrichment bar plot');
    svg.dataset.goChartSignature = signature;
    svg.dataset.goChartRenderWidth = String(width);
    svg.dataset.goChartRenderHeight = String(height);

    svg.appendChild(createSvgNode('title', {}, 'GO enrichment bar plot'));
    const plotGroup = createSvgNode('g', { 'data-go-chart-layer': 'plot' });
    svg.appendChild(plotGroup);

    rows.forEach((row, index) => {
      const centerY = plotTop + rowBand * (index + 0.5);
      const barTop = centerY - barHeight / 2;
      const barEnd = valueToX(row.value);
      const visibleLabel = truncateGoChartLabel(row.label, labelWidth, config.labelFontPx);
      const labelNode = createSvgNode('text', {
        x: plotLeft - config.labelGap,
        y: centerY,
        'font-family': 'Arial, Helvetica, sans-serif',
        'font-size': config.labelFontPx,
        fill: config.labelColor,
        'text-anchor': 'end',
        'dominant-baseline': 'middle'
      }, visibleLabel);
      if (visibleLabel !== row.label) labelNode.appendChild(createSvgNode('title', {}, row.label));
      plotGroup.appendChild(labelNode);
      const bar = createSvgNode('rect', {
        x: plotLeft,
        y: barTop,
        width: Math.max(0, barEnd - plotLeft),
        height: barHeight,
        fill: config.barFill,
        'shape-rendering': 'crispEdges',
        'data-go-term-index': row.index
      });
      bar.appendChild(createSvgNode('title', {}, `${row.label}\n${row.source}\np=${row.pValue == null ? '0' : formatSharedPValue(row.pValue)}\n-log10(p)=${formatGoChartNumber(row.value)}`));
      plotGroup.appendChild(bar);
    });

    const axisAttrs = {
      stroke: config.axisColor,
      'stroke-width': config.axisStrokeWidth,
      'vector-effect': 'non-scaling-stroke',
      'shape-rendering': 'crispEdges'
    };
    plotGroup.appendChild(createSvgNode('line', { ...axisAttrs, x1: plotLeft, y1: plotTop, x2: plotLeft, y2: plotBottom }));
    plotGroup.appendChild(createSvgNode('line', { ...axisAttrs, x1: plotLeft, y1: plotBottom, x2: plotRight, y2: plotBottom }));

    ticks.forEach(tick => {
      const x = valueToX(tick);
      plotGroup.appendChild(createSvgNode('line', {
        ...axisAttrs,
        x1: x,
        y1: plotBottom,
        x2: x,
        y2: plotBottom + config.tickLength
      }));
      plotGroup.appendChild(createSvgNode('text', {
        x,
        y: plotBottom + config.tickLength + config.axisFontPx,
        'font-family': 'Arial, Helvetica, sans-serif',
        'font-size': config.axisFontPx,
        fill: config.textColor,
        'text-anchor': 'middle'
      }, formatGoChartNumber(tick)));
    });

    plotGroup.appendChild(createSvgNode('text', {
      x: plotLeft + plotWidth / 2,
      y: height - 8,
      'font-family': 'Arial, Helvetica, sans-serif',
      'font-size': config.axisTitleFontPx,
      fill: config.textColor,
      'text-anchor': 'middle'
    }, '-log10(p)'));

    setGoChartExportVisible(true);
    debugLog('goChart.svg.rendered', {
      bars: rows.length,
      limit: state.analysis.goDisplayLimit,
      width,
      height,
      reason: options.reason || 'go-chart-render'
    });
    return true;
  }

  function renderGOResults(limit = 5) {
    if (!state.ui.goResults) return;
    const doc = state.ui.goResults.ownerDocument || global.document;
    state.ui.goResults.textContent = '';
    if (!state.analysis.lastGOResult || !state.analysis.lastGOResult.length) {
      const empty = doc.createElement('div');
      empty.textContent = 'No GO results';
      state.ui.goResults.appendChild(empty);
      clearGoChartSvg();
      return;
    }
    const normalizedLimit = normalizeGoChartLimit(limit);
    const title = doc.createElement('strong');
    title.textContent = normalizedLimit === 5 ? 'Top 5 GO terms' : 'All GO terms';
    state.ui.goResults.appendChild(title);
    state.analysis.lastGOResult.slice(0, normalizedLimit).forEach(result => {
      const row = doc.createElement('div');
      const term = result?.term_name || result?.name || 'unknown term';
      const source = result?.source || 'unknown source';
      row.textContent = `${term} [${source}] (p=${formatSharedPValue(result?.p_value)})`;
      state.ui.goResults.appendChild(row);
    });
    const actions = doc.createElement('div');
    const fullUrl = `https://biit.cs.ut.ee/gprofiler/gost?organism=${encodeURIComponent(state.analysis.lastGOOrganism || 'hsapiens')}&query=${encodeURIComponent(state.analysis.lastGOFormatted.join('\n'))}`;
    const link = doc.createElement('a');
    link.href = fullUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'View full GO analysis';
    actions.appendChild(link);
    if (state.analysis.lastGOResult.length > 5) {
      actions.appendChild(doc.createTextNode(' | '));
      const toggle = doc.createElement('button');
      toggle.className = 'btn';
      toggle.id = 'toggleGoResults';
      toggle.type = 'button';
      toggle.dataset.state = normalizedLimit === 5 ? 'top5' : 'all';
      toggle.textContent = normalizedLimit === 5 ? 'Show all results' : 'Show top 5';
      actions.appendChild(toggle);
    }
    state.ui.goResults.appendChild(actions);
    renderGOChart(normalizedLimit);
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
    const labels = getCurrentVennLabelMap();
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
    if (Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function') {
      const best = res.reduce((current, entry) => (!current || Number(entry.p) < Number(current.p) ? entry : current), null);
      Shared.statsReporting.appendReportPanel(state.ui.significanceResults, {
        methodsText: `Venn overlap enrichment was tested with one-sided upper-tail hypergeometric tests using a user-specified universe size of ${total}. Set sizes and overlap counts came from the currently drawn ${state.analysis.lastCounts.nC > 0 ? 'three-set' : 'two-set'} Venn diagram. Each reported P value is the probability of observing at least the displayed overlap by chance under independent sampling from the same universe; the reporting threshold was p < 0.05.`,
        resultsText: [
          `${res.length} overlap enrichment test${res.length === 1 ? ' was' : 's were'} evaluated.`,
          best ? `Smallest P value: ${best.name}, p = ${formatSharedPValue(best.p)}.` : null
        ].filter(Boolean).join(' '),
        resultsParts: [
          `${res.length} overlap enrichment test${res.length === 1 ? ' was' : 's were'} evaluated.`,
          best ? [' Smallest P value: ', best.name, ', p = ', { type: 'pValue', value: best.p, fallback: String(formatSharedPValue(best.p)) }, '.'] : null
        ].filter(Boolean),
        analysisSpec: {
          component: 'venn',
          test: 'one-sided hypergeometric overlap enrichment',
          universeSize: total,
          setCount: state.analysis.lastCounts.nC > 0 ? 3 : 2,
          significanceThreshold: 0.05,
          counts: cloneSimple(state.analysis.lastCounts) || null,
          overlaps: res.map(entry => ({ name: entry.name, pValue: Number.isFinite(entry.p) ? entry.p : null }))
        }
      }, { title: 'Reporting and reproducibility' });
    }
    const countsSignature = makeCountsSignature(state.analysis.lastCounts);
    state.analysis.lastSignificance = { countsSignature, total };
    captureVennSignificancePanelModel();
    captureVennSessionStateFromActive(activeVennSession, { reason: 'venn-significance-calculated' });
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
    state.ui.speciesSelect.style.backgroundColor = getSpeciesIndicatorColor(success);
  }

  async function recognizeSpeciesFromInput(options = {}) {
    const reason = options?.reason || 'auto';
    cancelPendingSpeciesDetection(reason);
    const detection = getSpeciesDetectionState();
    const genes = getAllGenes();
    const owner = beginVennAnalysisRequest('species', { reason: `venn-species-${reason}` });
    if (!genes.length) {
      if (isVennAnalysisRequestCurrent(owner, 'species')) {
        commitVennSpeciesSelection(owner, '', null, { reason: 'venn-species-empty' });
      }
      detection.cache.set('0:0', { guess: null, geneCount: 0 });
      debug('Debug: venn species detect skipped empty', { reason }); // Debug: detection skipped for empty input
      return null;
    }
    const cacheKey = computeGeneSignature(genes);
    if (detection.cache.has(cacheKey)) {
      const cached = detection.cache.get(cacheKey);
      const guess = cached?.guess || null;
      if (isVennAnalysisRequestCurrent(owner, 'species')) {
        commitVennSpeciesSelection(owner, guess || '', guess ? true : false, { reason: 'venn-species-cache-hit' });
      }
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
      if (detection.active && detection.active.controller === controller && isVennAnalysisRequestCurrent(owner, 'species')) {
        detection.active = null;
        commitVennSpeciesSelection(owner, guess || '', guess ? true : false, { reason: 'venn-species-detect-complete' });
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
      if (isVennAnalysisRequestCurrent(owner, 'species')) {
        commitVennSpeciesSelection(owner, '', false, { reason: 'venn-species-error' });
      }
      return null;
    }
  }

  async function runGOAnalysis(genes, organism, options = {}) {
    const owner = beginVennAnalysisRequest('go', { reason: 'venn-go-analysis-start' });
    const activeResultsTab = normalizeAnalysisResultsTab(options.activeResultsTab || 'go');
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
    commitVennAnalysisPatch(owner, {
      goResult: null,
      goFormatted: formatted,
      goOrganism: org,
      goPerformed: true,
      activeResultsTab
    }, { reason: 'venn-go-analysis-start' });
    if (isVennAnalysisOwnerActive(owner)) {
      state.analysis.lastGOFormatted = formatted;
      state.analysis.lastGOOrganism = org;
      state.analysis.lastGOResult = null;
      state.analysis.goPerformed = true;
      state.analysis.activeResultsTab = activeResultsTab;
      renderGOChart();
      if (state.ui.goResults) state.ui.goResults.innerHTML = '<i>Running GO analysis...</i>';
      updateAnalysisResultsVisibility();
    }
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
        fetch: typeof global.fetch === 'function' ? global.fetch.bind(global) : undefined
      });
      const results = response.result || [];
      if (!isVennAnalysisRequestCurrent(owner, 'go')) {
        debugLog('runGOAnalysis stale result ignored', { organism: org, geneCount: formatted.length });
        return;
      }
      const patch = {
        goResult: results,
        goFormatted: formatted,
        goOrganism: org,
        goPerformed: true,
        goLimit: Math.min(5, results.length || 5),
        activeResultsTab
      };
      commitVennAnalysisPatch(owner, patch, { reason: 'venn-go-analysis-complete' });
      if (!isVennAnalysisOwnerActive(owner)) {
        return;
      }
      state.analysis.lastGOResult = results;
      state.analysis.lastGOFormatted = formatted;
      state.analysis.lastGOOrganism = org;
      state.analysis.goPerformed = true;
      state.analysis.activeResultsTab = activeResultsTab;
      if (state.analysis.lastGOResult.length) {
        renderGOResults(5);
      } else if (state.ui.goResults) {
        state.ui.goResults.innerHTML = '<div>No GO results</div>';
      }
      updateAnalysisResultsVisibility();
    } catch (err) {
      console.error('runGOAnalysis error', err);
      if (!isVennAnalysisRequestCurrent(owner, 'go')) {
        debugLog('runGOAnalysis stale error ignored', { organism: org, geneCount: formatted.length });
        return;
      }
      commitVennAnalysisPatch(owner, {
        goResult: null,
        goFormatted: formatted,
        goOrganism: org,
        goPerformed: true,
        activeResultsTab
      }, { reason: 'venn-go-analysis-error' });
      if (!isVennAnalysisOwnerActive(owner)) {
        return;
      }
      if (state.ui.goResults) state.ui.goResults.innerHTML = '<div>Error fetching GO analysis</div>';
      updateAnalysisResultsVisibility();
    }
    debugLog('runGOAnalysis invoked', { organism: org, geneCount: formatted.length });
  }

  async function runStringAnalysis(genes, organism, options = {}) {
    const owner = beginVennAnalysisRequest('string', { reason: 'venn-string-analysis-start' });
    const activeResultsTab = normalizeAnalysisResultsTab(options.activeResultsTab || 'string');
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
      commitVennAnalysisPatch(owner, {
        stringSvg: '',
        stringEnrichment: null,
        stringPerformed: true,
        activeResultsTab
      }, { reason: 'venn-string-service-unavailable' });
      if (isVennAnalysisOwnerActive(owner)) {
        state.analysis.lastStringSVG = null;
        if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '<div>STRING services unavailable.</div>';
        if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<div>STRING services unavailable.</div>';
        if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
      }
      return;
    }
    commitVennAnalysisPatch(owner, {
      stringSvg: '',
      stringEnrichment: null,
      stringPerformed: true,
      activeResultsTab
    }, { reason: 'venn-string-analysis-start' });
    if (isVennAnalysisOwnerActive(owner)) {
      if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '<i>Loading STRING network...</i>';
      if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<i>Running STRING enrichment...</i>';
      if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
      state.analysis.stringPerformed = true;
      state.analysis.activeResultsTab = activeResultsTab;
      updateAnalysisResultsVisibility();
    }
    const networkType = queryVennRoot('input[name="stringNetworkType"]:checked')?.value || 'functional';
    const edgeMeaning = queryVennRoot('input[name="stringEdgeMeaning"]:checked')?.value || 'evidence';
    const sources = [...(resolveVennRoot()?.querySelectorAll?.('.stringSource:checked') || [])].map(el => el.value);
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
      fetch: typeof global.fetch === 'function' ? global.fetch.bind(global) : undefined
    };
    try {
      const network = await service.fetchNetwork(requestOptions);
      if (!isVennAnalysisRequestCurrent(owner, 'string')) {
        debugLog('runStringAnalysis stale network ignored', { organism: org, geneCount: formatted.length });
        return;
      }
      commitVennAnalysisPatch(owner, {
        stringSvg: network.svg,
        stringPerformed: true,
        activeResultsTab
      }, { reason: 'venn-string-network-complete' });
      if (isVennAnalysisOwnerActive(owner)) {
        state.analysis.lastStringSVG = network.svg;
        state.analysis.stringPerformed = true;
        state.analysis.activeResultsTab = activeResultsTab;
        renderStringNetwork(network.svg);
        updateAnalysisResultsVisibility();
      }
    } catch (err) {
      console.error('runStringAnalysis network error', err);
      if (!isVennAnalysisRequestCurrent(owner, 'string')) {
        debugLog('runStringAnalysis stale network error ignored', { organism: org, geneCount: formatted.length });
        return;
      }
      commitVennAnalysisPatch(owner, {
        stringSvg: '',
        stringPerformed: true,
        activeResultsTab
      }, { reason: 'venn-string-network-error' });
      if (isVennAnalysisOwnerActive(owner)) {
        state.analysis.lastStringSVG = null;
        state.analysis.lastStringEnrichment = null;
        if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '<div>Error loading STRING network</div>';
        if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
        updateAnalysisResultsVisibility();
      }
    }
    try {
      const enrichment = await service.fetchEnrichment(requestOptions);
      const items = Array.isArray(enrichment.items) ? enrichment.items : [];
      if (!isVennAnalysisRequestCurrent(owner, 'string')) {
        debugLog('runStringAnalysis stale enrichment ignored', { organism: org, geneCount: formatted.length });
        return;
      }
      commitVennAnalysisPatch(owner, {
        stringEnrichment: items,
        stringPerformed: true,
        stringLimit: 5,
        activeResultsTab
      }, { reason: 'venn-string-enrichment-complete' });
      if (isVennAnalysisOwnerActive(owner)) {
        state.analysis.lastStringEnrichment = items;
        state.analysis.stringPerformed = true;
        state.analysis.activeResultsTab = activeResultsTab;
        renderStringResults(items, 5);
        updateAnalysisResultsVisibility();
      }
    } catch (err) {
      console.error('runStringAnalysis enrichment error', err);
      if (!isVennAnalysisRequestCurrent(owner, 'string')) {
        debugLog('runStringAnalysis stale enrichment error ignored', { organism: org, geneCount: formatted.length });
        return;
      }
      commitVennAnalysisPatch(owner, {
        stringEnrichment: null,
        stringPerformed: true,
        activeResultsTab
      }, { reason: 'venn-string-enrichment-error' });
      if (isVennAnalysisOwnerActive(owner)) {
        state.analysis.lastStringEnrichment = null;
        if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<div>Error fetching STRING analysis</div>';
        updateAnalysisResultsVisibility();
      }
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
    const svg = getGoChartSvg();
    if (!svg || !svg.firstChild) {
      if (hasGoChartData()) {
        renderGOChart(state.analysis.goDisplayLimit || 5, { reason: 'go-chart-export-render' });
      }
    }
    const currentSvg = getGoChartSvg();
    if (!currentSvg || !currentSvg.firstChild) {
      debugLog('buildGoChartSvgString skipped', { reason: 'no svg content' });
      return '';
    }
    try {
      const clone = currentSvg.cloneNode(true);
      const width = clone.getAttribute('width') || currentSvg.getAttribute('width') || '900';
      const height = clone.getAttribute('height') || currentSvg.getAttribute('height') || '300';
      clone.setAttribute('xmlns', NS);
      clone.setAttribute('width', width);
      clone.setAttribute('height', height);
      clone.style.display = 'block';
      clone.style.width = `${width}px`;
      clone.style.height = `${height}px`;
      const serialized = new XMLSerializer().serializeToString(clone);
      debugLog('buildGoChartSvgString complete', { width, height });
      return serialized;
    } catch (err) {
      console.error('buildGoChartSvgString error', err);
      return '';
    }
  }

  async function exportGoChart(format) {
    const exporter = Shared.exporter;
    if (!exporter) {
      console.warn('exportGoChart missing exporter');
      return;
    }
    const svgString = buildGoChartSvgString();
    if (!svgString) return;
    if (format === 'png') {
      if (typeof exporter.svgStringToPngBlob !== 'function') {
        console.warn('exportGoChart missing SVG-to-PNG helper');
        return;
      }
      const blob = await exporter.svgStringToPngBlob(svgString, { contextLabel: 'go-chart' });
      if (!blob) return;
      exporter.downloadBlob(blob, 'go_chart.png', 'go-chart');
    } else if (format === 'svg') {
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      exporter.downloadBlob(blob, 'go_chart.svg', 'go-chart');
    }
    debugLog('exportGoChart', { format });
  }

  async function downloadStringPNG() {
    const svgString = buildStringNetworkSvgString();
    if (!svgString) return;
    const exporter = Shared.exporter;
    if (!exporter || typeof exporter.svgStringToPngBlob !== 'function') {
      console.warn('downloadStringPNG missing exporter helpers');
      return;
    }
    try {
      const blob = await exporter.svgStringToPngBlob(svgString, { contextLabel: 'string-export' });
      if (!blob) return;
      exporter.downloadBlob(blob, 'string_network.png', 'string-export');
    } catch (err) {
      console.error('downloadStringPNG error', err);
    }
  }

  function downloadStringSVG() {
    const svgString = buildStringNetworkSvgString();
    if (!svgString) return;
    const exporter = Shared.exporter;
    if (!exporter) {
      console.warn('downloadStringSVG missing exporter helpers');
      return;
    }
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    exporter.downloadBlob(blob, 'string_network.svg', 'string-export');
  }

  function configureStage(style) {
    clearSVG();
    hideVennEmptyPlotNotice();
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
    const drawableFrame = resolveVennDrawableFrame(stage);
    const svgBoxRect = {
      width: drawableFrame.width,
      height: drawableFrame.height
    };
    const dataset = svgBox?.dataset || {};
    const scaleInfo = style.scaleInfo || {};
    let stageWidth = parsePositiveFloat(scaleInfo.width);
    let stageHeight = parsePositiveFloat(scaleInfo.height);
    if (!Number.isFinite(stageWidth)) stageWidth = parsePositiveFloat(drawableFrame.width);
    if (!Number.isFinite(stageHeight)) stageHeight = parsePositiveFloat(drawableFrame.height);
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
    applyVennStageTheme(stage);
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
    const textColor = isVennDarkScheme() ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000');
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
      defaultWidth,
      defaultHeight,
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
      patchVennVisualState(getActiveVennSessionForState(), { titleText: nextValue }, { reason: 'venn-title-edit' });
      if(titleText.textContent !== nextValue){
        titleText.textContent = nextValue;
      }
      scheduleActiveVennDraw({ reason: 'venn-title-edit' });
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
          patchVennLabelPosition(getActiveVennSessionForState(), 'title', {
            x: pos.x,
            y: pos.y,
            relX,
            relY
          }, { reason: 'venn-title-position' });
          debugLog('venn title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    return { titleText, titlePadding };
  }

  function fitAndDraw(d, style, labels, counts) {
    const metrics = configureStage(style);
    if (!metrics) return;
    const { stage, svgBox, svgBoxRect, stageWidth, stageHeight, defaultWidth, defaultHeight, fontFamily, textColor } = metrics;
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
      const fallbackStyle = resolveVennTraceBaseStyle(c.id, {
        fill: c.color,
        borderColor: style.borderColor,
        borderWidth: style.borderWidthRaw,
        opacity: style.opacity
      });
      const circleStyle = getVennTraceStyle(c.id, fallbackStyle);
      const strokeWidthRaw = clampNumber(circleStyle.borderWidth, clampNumber(style.borderWidthRaw, 1.2, 0), 0);
      const strokeWidth = chartStyle.scaleStrokeWidth(strokeWidthRaw, style.scaleInfo, { context: 'venn-border', min: 0 });
      const circle = makeEl('circle', {
        cx: p.x,
        cy: p.y,
        r: c.r * scale,
        fill: sanitizeColor(circleStyle.fill, c.color),
        'fill-opacity': clampNumber(circleStyle.opacity, clampNumber(style.opacity, 0.75, 0, 1), 0, 1),
        stroke: sanitizeColor(circleStyle.borderColor, style.borderColor),
        'stroke-width': strokeWidth,
        'data-venn-trace-id': c.id
      });
      circle.setAttribute('cursor', 'pointer');
      circle.addEventListener('click', (event) => {
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        showVennTraceSymbolToolbar(circle, {
          traceId: c.id,
          fallback: fallbackStyle
        });
      });
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
      enableVennTextDrag(t);
      return t;
    }
    function measureTextBox(node, fallbackFontSize) {
      if (node && typeof node.getBBox === 'function') {
        try {
          const box = node.getBBox();
          if (box && Number.isFinite(box.x) && Number.isFinite(box.y) && Number.isFinite(box.width) && Number.isFinite(box.height)) {
            return box;
          }
        } catch (err) {
          debugLog('venn text getBBox fallback', { message: err?.message || String(err) });
        }
      }
      const fontSize = Number(fallbackFontSize) || 12;
      const fontFamilyAttr = node?.getAttribute?.('font-family') || fontFamily || 'Arial, sans-serif';
      const font = `${fontSize}px ${fontFamilyAttr}`;
      const text = node?.textContent || '';
      const measuredWidth = chartStyle.measureText
        ? chartStyle.measureText(text, font)
        : text.length * fontSize * 0.6;
      const width = Math.max(fontSize, Number(measuredWidth) || 0);
      const height = Math.max(fontSize, fontSize * 1.2);
      const x = Number(node?.getAttribute?.('x')) || 0;
      const y = Number(node?.getAttribute?.('y')) || 0;
      const anchor = node?.getAttribute?.('text-anchor') || 'start';
      const left = anchor === 'middle' ? x - width / 2 : (anchor === 'end' ? x - width : x);
      return {
        x: left,
        y: y - height,
        width,
        height
      };
    }
    const labelBoxes = [];
    function placeCircleLabel(circle, label, count) {
      const center = toPx(circle.x, circle.y);
      const others = circles.filter(c => c.id !== circle.id);
      const isTop = others.every(o => circle.y <= o.y);
      const margin = style.fontSizePx * 0.6;
      let y = center.y + (isTop ? -(circle.r * scale + margin) : (circle.r * scale + margin));
      const t = addText(label + ' (' + count + ')', center.x, y, null, { role: 'setLabel', key: circle?.id ? `set-${circle.id}` : 'setLabel' });
      let box = measureTextBox(t, style.fontSizePx);
      const overlaps = (a, b) => !!(
        a && b
        && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.width) && Number.isFinite(a.height)
        && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height)
        && !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
      );
      for (const b of labelBoxes) {
        let attempts = 0;
        const maxAttempts = 40;
        while (overlaps(box, b) && attempts < maxAttempts) {
          attempts += 1;
          y += isTop ? -style.fontSizePx : style.fontSizePx;
          t.setAttribute('y', y);
          box = measureTextBox(t, style.fontSizePx);
        }
        if (attempts >= maxAttempts && overlaps(box, b)) {
          console.warn('venn set label placement guard reached', {
            label,
            count,
            attempts,
            tabId: Shared.hot?.resolveActiveTabId?.() || null,
            previousBox: b,
            currentBox: box
          });
          break;
        }
      }
      const minYBound = style.fontSizePx;
      const maxYBound = H - style.fontSizePx;
      if (box.y < minYBound) {
        y += minYBound - box.y;
        t.setAttribute('y', y);
        box = measureTextBox(t, style.fontSizePx);
      }
      if (box.y + box.height > maxYBound) {
        y -= box.y + box.height - maxYBound;
        t.setAttribute('y', y);
        box = measureTextBox(t, style.fontSizePx);
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
    setVennStageRegionClickHandler(stage, evt => {
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
    }, 'venn-region-hit');
    ensureGraphViewport(stage, {
      padding: Math.max(style.fontSizePx || 12, 20),
      debugLabel: 'venn-diagram',
      preserveAspectRatio: 'xMidYMid meet'
    });
    stage.setAttribute('preserveAspectRatio', 'xMidYMid meet');
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
    const fallback = ['#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080', '#00a6d6', '#8b4513', '#ff1493', '#666666'];
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
      const keyToDisplay = new Map();
      values.forEach(value => {
        const normalized = String(value).trim();
        if (!normalized) {
          return;
        }
        const key = caseSensitive ? normalized : normalized.toLowerCase();
        uniqueKeys.add(key);
        if (!keyToDisplay.has(key)) {
          keyToDisplay.set(key, normalized);
        }
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
        keyToDisplay,
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
      items: [],
      degree: entry.sets.length
    }));
  }

  function buildUpSetIntersectionsFromSets(sets, options = {}) {
    const setCount = Array.isArray(sets) ? sets.length : 0;
    if (!setCount) {
      return [];
    }
    const membership = new Map();
    const keyToDisplay = new Map();
    sets.forEach((set, idx) => {
      const keys = set?.keys instanceof Set ? set.keys : null;
      const displayMap = set?.keyToDisplay instanceof Map ? set.keyToDisplay : null;
      if (!keys) return;
      keys.forEach(key => {
        const mask = membership.get(key) || 0n;
        membership.set(key, mask | (1n << BigInt(idx)));
        if (!keyToDisplay.has(key)) {
          const displayValue = displayMap ? displayMap.get(key) : null;
          keyToDisplay.set(key, displayValue || key);
        }
      });
    });
    const intersectionMap = new Map();
    membership.forEach((mask, memberKey) => {
      if (mask === 0n) return;
      const key = mask.toString();
      const entry = intersectionMap.get(key) || { mask, size: 0, items: [] };
      entry.size += 1;
      const displayValue = keyToDisplay.get(memberKey) || memberKey;
      entry.items.push(displayValue);
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
              intersectionMap.set(key, { mask, size: 0, items: [] });
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
        items: Array.isArray(entry.items) ? entry.items.slice() : [],
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
      needsIntersectionBuild: true
    };
  }

  function drawUpSet(counts, labels, style, options = {}) {
    const metrics = configureStage(style);
    if (!metrics) return;
    const { stage, svgBox, svgBoxRect, stageWidth, stageHeight, defaultWidth, defaultHeight, fontFamily, textColor } = metrics;
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
    if (upsetData && Array.isArray(upsetData.sets) && upsetData.sets.length) {
      sets = upsetData.sets;
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
      updateUpSetRegionContext(sets, [], '');
      const emptyText = makeEl('text', {
        x: stageWidth / 2,
        y: stageHeight / 2,
        'text-anchor': 'middle',
        'font-size': style.fontSizePx * 1.1,
        fill: textColor
      });
      emptyText.textContent = 'No intersections to display';
      ensureUpSetFontBindings(stage);
      ensureGraphViewport(stage, {
        padding: Math.max(style.fontSizePx || 12, 20),
        debugLabel: 'upset-empty',
        preserveAspectRatio: 'xMidYMid meet'
      });
      stage.setAttribute('preserveAspectRatio', 'xMidYMid meet');
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

    const regionSelect = state.ui.regionSelect;
    const preferredRegionCode = regionSelect ? String(regionSelect.value || '') : '';
    if (preferredRegionCode) {
      const selectedEntry = allIntersections.find(entry => entry.code === preferredRegionCode);
      if (selectedEntry && !limited.some(entry => entry.code === preferredRegionCode)) {
        if (Number.isFinite(maxIntersections) && maxIntersections > 0 && limited.length >= maxIntersections) {
          limited[limited.length - 1] = selectedEntry;
        } else {
          limited.push(selectedEntry);
        }
      }
    }
    intersections = limited;
    updateUpSetRegionContext(sets, intersections, preferredRegionCode);
    const regionOptions = regionSelect
      ? new Set(Array.from(regionSelect.options || []).map(option => option.value))
      : null;

    const pad = 20;
    const scaleX = Number.isFinite(defaultWidth) && defaultWidth > 0 ? stageWidth / defaultWidth : 1;
    const scaleY = Number.isFinite(defaultHeight) && defaultHeight > 0 ? stageHeight / defaultHeight : 1;
    const geometryScaleRaw = Math.sqrt(Math.max(scaleX * scaleY, 0));
    const geometryScale = clampNumber(geometryScaleRaw, 1, 0.35, 4);
    const dotSizePx = clampNumber(settings.dotSize * geometryScale, settings.dotSize, 1.5, 48);
    debugLog('upset geometry scale resolved', {
      stageWidth,
      stageHeight,
      defaultWidth,
      defaultHeight,
      scaleX,
      scaleY,
      geometryScale,
      dotSizeBase: settings.dotSize,
      dotSizePx
    });
    const gap = Math.max(style.fontSizePx * 0.8, 12);
    const setAxisHeight = Math.max(style.fontSizePx * 1.8, 18);
    const innerHeight = Math.max(stageHeight - topPadding - pad, style.fontSizePx * 10);
    const contentHeight = Math.max(innerHeight - setAxisHeight, style.fontSizePx * 8);

    let rowHeight = Math.max(dotSizePx * 2.6, style.fontSizePx * 1.4);
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
    const setLabelFontSize = Math.max(10, Math.round(style.fontSizePx));
    const axisTickFontSize = Math.max(10, Math.round(style.fontSizePx));
    const axisLabelFontSize = Math.max(10, Math.round(style.fontSizePx));
    const valueLabelFontSize = Math.max(9, Math.round(style.fontSizePx * 0.9));
    const labelFont = `${setLabelFontSize}px ${fontFamily}`;
    const countFont = `${axisTickFontSize}px ${fontFamily}`;
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

    const minColumnWidth = Math.max(dotSizePx * 2.6, style.fontSizePx * 1.4);
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

    const axisColor = sanitizeColor(settings.axisColor, chartStyle.TEXT_COLOR || '#000000');
    const axisBaseFontPx = (typeof chartStyle.ptToPx === 'function' && Number.isFinite(style.fontPt))
      ? chartStyle.ptToPx(style.fontPt)
      : style.fontSizePx;
    const axisMetrics = typeof chartStyle.createAxisMetrics === 'function'
      ? chartStyle.createAxisMetrics(axisBaseFontPx, style.scaleInfo)
      : {
          tickLength: 6,
          tickLabelGap: Math.max(3, Math.round(style.fontSizePx * 0.35)),
          axisTitleGap: Math.max(4, Math.round(style.fontSizePx * 0.75))
        };
    const tickLength = axisMetrics.tickLength ?? 6;
    const tickLabelGap = axisMetrics.tickLabelGap ?? Math.max(3, Math.round(style.fontSizePx * 0.35));
    const axisTitleGap = axisMetrics.axisTitleGap ?? Math.max(4, Math.round(style.fontSizePx * 0.75));
    const axisWidthBase = clampNumber(settings.axisWidth, DEFAULT_UPSET_SETTINGS.axisWidth, 0.25, 10);
    const axisWidth = typeof chartStyle.scaleStrokeWidth === 'function'
      ? chartStyle.scaleStrokeWidth(axisWidthBase, style.scaleInfo, { min: 0, max: 8, context: 'upset-axis', exact: true })
      : axisWidthBase;
    const activeMarkOpacity = clampNumber(style.opacity, 1, 0.05, 1);
    const barBorderColor = sanitizeColor(style.borderColor, axisColor);
    const barBorderWidth = clampNumber(style.borderWidth, Math.max(0.5, axisWidth * 0.75), 0);
    const barStroke = barBorderWidth > 0 ? barBorderColor : 'none';
    const setTickFontSize = axisTickFontSize;
    const setAxisLabelFontSize = axisLabelFontSize;
    const setTickBaselineDy = '0.8em';
    const setAxisLabelBaselineDy = '0.8em';
    const setTickOffset = Math.max(4, Math.round(style.fontSizePx * 0.32));
    const setTitleGap = Math.max(2, Math.round((axisTitleGap + 1) * 0.4));
    const setTickTextHeight = Math.max(8, Math.round(setTickFontSize * 0.95));
    const setAxisLabelHeight = Math.max(9, Math.round(setAxisLabelFontSize * 0.95));
    const requiredSetAxisBottomSpace = tickLength + setTickOffset + setTickTextHeight + setTitleGap + setAxisLabelHeight + 4;
    const axisYPreferred = matrixBottom + setAxisHeight * 0.35;
    const axisYMin = matrixBottom + Math.max(2, Math.round(style.fontSizePx * 0.2));
    const axisYMax = stageHeight - requiredSetAxisBottomSpace;
    const axisY = axisYMax >= axisYMin
      ? Math.min(axisYMax, Math.max(axisYMin, axisYPreferred))
      : axisYMin;
    let setTickLabelY = axisY + tickLength + setTickOffset;
    let setAxisLabelY = setTickLabelY + setTickTextHeight + setTitleGap;
    const maxSetAxisLabelY = stageHeight - setAxisLabelHeight - 2;
    if (setAxisLabelY > maxSetAxisLabelY) {
      setAxisLabelY = maxSetAxisLabelY;
    }
    debugLog('upset typography resolved', {
      baseFontSize: style.fontSizePx,
      setLabelFontSize,
      axisTickFontSize,
      axisLabelFontSize,
      valueLabelFontSize,
      axisY,
      setTickLabelY,
      setAxisLabelY,
      barBorderColor,
      barBorderWidth
    });

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
    const intersectionLayout = intersections.map((entry, idx) => {
      const columnCenter = matrixX + columnWidth * (idx + 0.5);
      const barWidth = Math.max(4, columnWidth * 0.6);
      const barHeight = (entry.size / maxIntersection) * barChartHeight;
      const barX = columnCenter - barWidth / 2;
      const barY = barBottom - barHeight;
      return {
        entry,
        columnCenter,
        barWidth,
        barHeight,
        barX,
        barY
      };
    });

    const yAxisLineAttrs = {
      x1: axisX,
      y1: barTop,
      x2: axisX,
      y2: barBottom,
      stroke: axisColor,
      'stroke-width': axisWidth
    };
    const xAxisLineAttrs = {
      x1: axisX,
      y1: barBottom,
      x2: matrixX + matrixWidth,
      y2: barBottom,
      stroke: axisColor,
      'stroke-width': axisWidth,
      'stroke-linecap': 'square'
    };

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
      const drawHorizontalGridLine = settings.showGrid
        && settings.gridColor
        && y < (barBottom - 0.5);
      if (drawHorizontalGridLine) {
        const gridStartX = axisX;
        const gridEndX = matrixX + matrixWidth;
        const occlusionPadding = Math.max(0.5, axisWidth * 0.5);
        const occlusionRanges = intersectionLayout
          .filter(layout => y >= (layout.barY - occlusionPadding) && y <= (barBottom + occlusionPadding))
          .map(layout => {
            const start = Math.max(gridStartX, layout.barX - occlusionPadding);
            const end = Math.min(gridEndX, layout.barX + layout.barWidth + occlusionPadding);
            return [start, end];
          })
          .filter(range => (range[1] - range[0]) > 0.5)
          .sort((a, b) => a[0] - b[0]);
        let cursorX = gridStartX;
        let segmentCount = 0;
        occlusionRanges.forEach(([rangeStart, rangeEnd]) => {
          if (rangeStart > (cursorX + 0.5)) {
            makeEl('line', {
              x1: cursorX,
              y1: y,
              x2: rangeStart,
              y2: y,
              stroke: settings.gridColor,
              'stroke-width': 1
            });
            segmentCount += 1;
          }
          if (rangeEnd > cursorX) {
            cursorX = rangeEnd;
          }
        });
        if (cursorX < (gridEndX - 0.5)) {
          makeEl('line', {
            x1: cursorX,
            y1: y,
            x2: gridEndX,
            y2: y,
            stroke: settings.gridColor,
            'stroke-width': 1
          });
          segmentCount += 1;
        }
        if (!segmentCount) {
          debugLog('upset horizontal grid fully occluded', {
            tickIndex: idx,
            value,
            y,
            occlusionCount: occlusionRanges.length
          });
        }
      } else if (settings.showGrid && settings.gridColor) {
        debugLog('upset horizontal grid line skipped', {
          reason: 'overlaps-x-axis',
          tickIndex: idx,
          value,
          y,
          axisY: barBottom
        });
      }
      const tickText = makeEl('text', {
        x: axisX - tickLength - tickLabelGap,
        y,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        'font-size': axisTickFontSize,
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
      'font-size': axisLabelFontSize,
      fill: textColor
    });
    axisLabel.textContent = 'Intersection Size';
    axisLabel.setAttribute('transform', `rotate(-90 ${axisLabelX} ${intersectionAxisLabelY})`);

    intersectionLayout.forEach(layout => {
      const { entry, columnCenter, barWidth, barHeight, barX, barY } = layout;
      const canSelectEntry = !!(regionOptions && regionOptions.has(entry.code));
      const intersectionStyle = getUpSetTraceStyle('intersectionBars', entry.code, {
        fill: settings.barColor,
        borderColor: barBorderColor,
        borderWidth: barBorderWidth,
        opacity: style.opacity
      });
      const bar = makeEl('rect', {
        x: barX,
        y: barY,
        width: barWidth,
        height: Math.max(0, barHeight),
        fill: sanitizeColor(intersectionStyle.fill, settings.barColor),
        'fill-opacity': clampNumber(intersectionStyle.opacity, style.opacity, 0, 1),
        stroke: clampNumber(intersectionStyle.borderWidth, barBorderWidth, 0) > 0
          ? sanitizeColor(intersectionStyle.borderColor, barBorderColor)
          : 'none',
        'stroke-width': clampNumber(intersectionStyle.borderWidth, barBorderWidth, 0),
        'data-upset-trace-kind': 'intersectionBars',
        'data-upset-trace-id': entry.code,
        cursor: canSelectEntry ? 'pointer' : 'default'
      });
      const barTitle = document.createElementNS(NS, 'title');
      const entryLabel = entry.label || entry.code;
      barTitle.textContent = `${entryLabel}: ${formatCount(entry.size)}`;
      bar.appendChild(barTitle);
      if (canSelectEntry) {
        bar.addEventListener('click', (event) => {
          if (event && typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
          if (state.ui.regionSelect) {
            state.ui.regionSelect.value = entry.code;
            populateRegion(entry.code);
            syncActiveVennPayload('venn-upset-select');
          }
          showUpSetTraceSymbolToolbar(bar, {
            kind: 'intersectionBars',
            traceId: entry.code,
            fallback: {
              fill: settings.barColor,
              borderColor: barBorderColor,
              borderWidth: barBorderWidth,
              opacity: style.opacity
            }
          });
        });
      } else {
        bar.addEventListener('click', (event) => {
          if (event && typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
          showUpSetTraceSymbolToolbar(bar, {
            kind: 'intersectionBars',
            traceId: entry.code,
            fallback: {
              fill: settings.barColor,
              borderColor: barBorderColor,
              borderWidth: barBorderWidth,
              opacity: style.opacity
            }
          });
        });
      }
      if (settings.showCounts) {
        const valueText = makeEl('text', {
          x: columnCenter,
          y: barY - 4,
          'text-anchor': 'middle',
          'font-size': valueLabelFontSize,
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
          r: dotSizePx,
          fill: settings.inactiveDotColor,
          opacity: 1
        });
      });

      if (activeIndices.length) {
        const matrixStyle = getUpSetTraceStyle('matrix', entry.code, {
          fill: activeColor,
          borderColor: activeColor,
          borderWidth: 0,
          opacity: activeMarkOpacity,
          size: settings.dotSize
        });
        const activeDotSizePx = clampNumber(clampNumber(matrixStyle.size, settings.dotSize, 2, 12) * geometryScale, dotSizePx, 1.5, 48);
        const activeGroup = makeEl('g', {
          color: sanitizeColor(matrixStyle.fill, activeColor),
          opacity: clampNumber(matrixStyle.opacity, activeMarkOpacity, 0, 1),
          cursor: 'pointer',
          'data-upset-trace-kind': 'matrix',
          'data-upset-trace-id': entry.code
        });
        activeGroup.addEventListener('click', (event) => {
          if (event && typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
          if (canSelectEntry && state.ui.regionSelect) {
            state.ui.regionSelect.value = entry.code;
            populateRegion(entry.code);
            syncActiveVennPayload('venn-upset-select');
          }
          showUpSetTraceSymbolToolbar(activeGroup, {
            kind: 'matrix',
            traceId: entry.code,
            fallback: {
              fill: activeColor,
              borderColor: activeColor,
              borderWidth: 0,
              opacity: activeMarkOpacity,
              size: settings.dotSize
            }
          });
        });

        if (activeIndices.length > 1) {
          const y1 = matrixTop + activeIndices[0] * rowHeight + rowHeight / 2;
          const y2 = matrixTop + activeIndices[activeIndices.length - 1] * rowHeight + rowHeight / 2;
          const connectorWidth = Math.max(0.65, Math.min(activeDotSizePx * 0.45, rowHeight * 0.2));
          makeEl('rect', {
            x: columnCenter - connectorWidth / 2,
            y: y1,
            width: connectorWidth,
            height: Math.max(0, y2 - y1),
            fill: 'currentColor',
            rx: connectorWidth / 2,
            ry: connectorWidth / 2,
            stroke: clampNumber(matrixStyle.borderWidth, 0, 0) > 0 ? sanitizeColor(matrixStyle.borderColor, activeColor) : 'none',
            'stroke-width': clampNumber(matrixStyle.borderWidth, 0, 0),
            'data-upset-trace-kind': 'matrix',
            'data-upset-trace-id': entry.code
          }, activeGroup);
        }

        activeIndices.forEach(rowIdx => {
          const dot = makeEl('circle', {
            cx: columnCenter,
            cy: matrixTop + rowIdx * rowHeight + rowHeight / 2,
            r: activeDotSizePx,
            fill: 'currentColor',
            stroke: clampNumber(matrixStyle.borderWidth, 0, 0) > 0 ? sanitizeColor(matrixStyle.borderColor, activeColor) : 'none',
            'stroke-width': clampNumber(matrixStyle.borderWidth, 0, 0),
            'data-upset-trace-kind': 'matrix',
            'data-upset-trace-id': entry.code
          }, activeGroup);
          dot.setAttribute('cursor', 'pointer');
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
        'font-size': setLabelFontSize,
        fill: textColor
      });
      label.textContent = set.label;
      const barWidth = maxSetSize > 0 ? (set.size / maxSetSize) * barAreaWidth : 0;
      const barHeight = Math.max(dotSizePx * 1.6, rowHeight * 0.6);
      const barY = rowCenter - barHeight / 2;
      const barFill = settings.useSetColors ? set.color : settings.setBarColor;
      const barX = setBarX + (barAreaWidth - barWidth);
      const setBarStyle = getUpSetTraceStyle('setBars', set.key, {
        fill: barFill,
        borderColor: barBorderColor,
        borderWidth: barBorderWidth,
        opacity: style.opacity
      });
      const setBar = makeEl('rect', {
        x: barX,
        y: barY,
        width: Math.max(0, barWidth),
        height: barHeight,
        fill: sanitizeColor(setBarStyle.fill, barFill),
        'fill-opacity': clampNumber(setBarStyle.opacity, style.opacity, 0, 1),
        stroke: clampNumber(setBarStyle.borderWidth, barBorderWidth, 0) > 0
          ? sanitizeColor(setBarStyle.borderColor, barBorderColor)
          : 'none',
        'stroke-width': clampNumber(setBarStyle.borderWidth, barBorderWidth, 0),
        cursor: 'pointer',
        'data-upset-trace-kind': 'setBars',
        'data-upset-trace-id': set.key
      });
      setBar.addEventListener('click', (event) => {
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        showUpSetTraceSymbolToolbar(setBar, {
          kind: 'setBars',
          traceId: set.key,
          fallback: {
            fill: barFill,
            borderColor: barBorderColor,
            borderWidth: barBorderWidth,
            opacity: style.opacity
          }
        });
      });
      if (settings.showSetCounts) {
        const valueText = makeEl('text', {
          x: barX - 6,
          y: rowCenter,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          'font-size': valueLabelFontSize,
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
        dy: setTickBaselineDy,
        'font-size': setTickFontSize,
        fill: textColor
      });
      tickText.textContent = formatCount(value);
    });

    const setAxisLabel = makeEl('text', {
      x: setBarX + barAreaWidth / 2,
      y: setAxisLabelY,
      'text-anchor': 'middle',
      dy: setAxisLabelBaselineDy,
      'font-size': setAxisLabelFontSize,
      fill: textColor
    });
    setAxisLabel.textContent = 'Set Size';

    // Keep intersection axes in the foreground so bars/dots never hide them.
    const yAxisLine = makeEl('line', yAxisLineAttrs);
    const xAxisLine = makeEl('line', xAxisLineAttrs);
    if (axisControls && typeof axisControls.registerAxisElement === 'function') {
      axisControls.registerAxisElement(yAxisLine, createUpSetAxisControlConfig('y'));
      axisControls.registerAxisElement(xAxisLine, createUpSetAxisControlConfig('x'));
    }
    debugLog('upset axes rendered in foreground', {
      axisX,
      axisY: barBottom,
      axisWidth
    });

    ensureUpSetFontBindings(stage);
    ensureGraphViewport(stage, {
      padding: Math.max(style.fontSizePx || 12, 20),
      debugLabel: 'upset-plot',
      preserveAspectRatio: 'xMidYMid meet'
    });
    stage.setAttribute('preserveAspectRatio', 'xMidYMid meet');
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
    if (!parsed || !parsed.lists || !parsed.maps) {
      console.warn('Debug: venn drawFromLists skipped - parsed lists unavailable', { hasParsed: !!parsed });
      clearSVG();
      renderVennEmptyPlotNotice();
      return;
    }
    const mode = parsed.mode;
    const cs = parsed.caseSensitive;
    const regions = parsed.regions || setsFromLists(parsed.lists.A || [], parsed.lists.B || [], parsed.lists.C || [], state.analysis.lastRegions);
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
      state.analysis.significancePanelModel = null;
      debugLog('significance invalidated after list draw', { countsSignature, hadPrevious: !!lastSig });
    } else {
      debugLog('significance preserved after list draw', { countsSignature });
    }
    refreshCounts(counts);
    const defaultStyle = createDefaultVennStyleState();
    const fontInputValue = getVennInputValue(inputs, 'fontsize', defaultStyle.fontsize);
    const fontInfo = resolveFontInfo(fontInputValue);
    const borderWidthRaw = Number(getVennInputValue(inputs, 'borderWidth', defaultStyle.borderWidth));
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, fontInfo.scaleInfo, { context: 'venn-border', min: 0 });
    const resolvedFontPx = Number.isFinite(fontInfo?.scaledPx) ? fontInfo.scaledPx : Number(fontInfo?.px);
    const fontSizePx = Number.isFinite(resolvedFontPx) ? resolvedFontPx : 12;
    const style = {
      colorA: getVennInputValue(inputs, 'colorA', defaultStyle.colorA),
      colorB: getVennInputValue(inputs, 'colorB', defaultStyle.colorB),
      colorC: getVennInputValue(inputs, 'colorC', defaultStyle.colorC),
      opacity: getVennInputValue(inputs, 'opacity', defaultStyle.opacity),
      fontSizePx,
      fontPt: Number.isFinite(fontInfo?.pt) ? fontInfo.pt : Number(fontInputValue) || 12,
      borderColor: getVennInputValue(inputs, 'borderColor', defaultStyle.borderColor),
      borderWidth: borderWidthPx,
      borderWidthRaw,
      scaleInfo: fontInfo.scaleInfo,
      fontInfo
    };
    debug('Debug: venn style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      fontScale: fontInfo?.scaleInfo?.styleScale,
      fontSizePx
    });
    chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    const labels = getCurrentVennLabelMap();
    const plotType = getActivePlotType();
    updateCountLabels(labels);
    if (plotType !== 'upset') {
      updateRegionSelect(labels, counts);
    }
    updateColorLabels(labels);
    if (plotType === 'upset') {
      style.upset = resolveUpSetSettings();
      const upsetData = resolveUpSetTableData(parsed, labels, style);
      drawUpSet(counts, labels, style, { upsetData });
    } else {
      ensureVennRegionOptions();
      state.analysis.lastUpSetRegionMap = null;
      state.analysis.lastUpSetIntersections = null;
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
      state.analysis.significancePanelModel = null;
      debugLog('significance invalidated after numeric draw', { countsSignature, hadPrevious: !!lastSig });
    } else {
      debugLog('significance preserved after numeric draw', { countsSignature });
    }
    refreshCounts(counts);
    const defaultStyle = createDefaultVennStyleState();
    const fontInputValue = getVennInputValue(inputs, 'fontsize', defaultStyle.fontsize);
    const fontInfo = resolveFontInfo(fontInputValue);
    const borderWidthRaw = Number(getVennInputValue(inputs, 'borderWidth', defaultStyle.borderWidth));
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, fontInfo.scaleInfo, { context: 'venn-border', min: 0 });
    const resolvedFontPx = Number.isFinite(fontInfo?.scaledPx) ? fontInfo.scaledPx : Number(fontInfo?.px);
    const fontSizePx = Number.isFinite(resolvedFontPx) ? resolvedFontPx : 12;
    const style = {
      colorA: getVennInputValue(inputs, 'colorA', defaultStyle.colorA),
      colorB: getVennInputValue(inputs, 'colorB', defaultStyle.colorB),
      colorC: getVennInputValue(inputs, 'colorC', defaultStyle.colorC),
      opacity: getVennInputValue(inputs, 'opacity', defaultStyle.opacity),
      fontSizePx,
      fontPt: Number.isFinite(fontInfo?.pt) ? fontInfo.pt : Number(fontInputValue) || 12,
      borderColor: getVennInputValue(inputs, 'borderColor', defaultStyle.borderColor),
      borderWidth: borderWidthPx,
      borderWidthRaw,
      scaleInfo: fontInfo.scaleInfo,
      fontInfo
    };
    debug('Debug: venn style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      fontScale: fontInfo?.scaleInfo?.styleScale,
      fontSizePx
    });
    chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    const labels = getCurrentVennLabelMap();
    const plotType = getActivePlotType();
    updateCountLabels(labels);
    if (plotType !== 'upset') {
      updateRegionSelect(labels, counts);
    }
    updateColorLabels(labels);
    if (plotType === 'upset') {
      style.upset = resolveUpSetSettings();
      drawUpSet(counts, labels, style);
    } else {
      ensureVennRegionOptions();
      state.analysis.lastUpSetRegionMap = null;
      state.analysis.lastUpSetIntersections = null;
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

  function hasUpSetContent(inputs) {
    const tableInfo = getUpSetTableColumns();
    const tableHasValues = Array.isArray(tableInfo?.columns)
      && tableInfo.columns.some(column => Array.isArray(column?.values) && column.values.length > 0);
    if (tableHasValues) {
      debug('Debug: venn hasUpSetContent table', {
        columns: tableInfo.columns.length
      });
      return true;
    }
    const fallback = hasListContent(inputs);
    debug('Debug: venn hasUpSetContent fallback', {
      fallback
    });
    return fallback;
  }

  function refreshDiagram() {
    bindVennSessionForTab(venn.__boundTabId || null, { reason: 'venn-refresh-bind', root: state.ui.root || null }, { apply: false });
    const inputs = state.ui.inputs;
    if (!inputs) {
      console.warn('Debug: venn refreshDiagram called before init');
      return;
    }
    try {
      const plotType = getActivePlotType();
      const hasLists = hasListContent(inputs);
      const hasNumeric = hasNumericContent(inputs);
      const hasUpSetLists = plotType === 'upset' ? hasUpSetContent(inputs) : hasLists;
      const hintedMode = state.analysis.lastDrawMode;
      let mode = null;
      if (plotType === 'upset') {
        if (hintedMode === 'lists' && hasUpSetLists) {
          mode = 'lists';
        } else if (hintedMode === 'numeric' && hasNumeric && !hasUpSetLists) {
          mode = 'numeric';
        } else {
          mode = hasUpSetLists ? 'lists' : (hasNumeric ? 'numeric' : null);
        }
      } else {
        const modePreference = (
          (hintedMode === 'lists' && hasLists) || (hintedMode === 'numeric' && hasNumeric)
        )
          ? hintedMode
          : null;
        mode = modePreference || (hasLists ? 'lists' : (hasNumeric ? 'numeric' : null));
      }
      if (!mode) {
        clearSVG();
        renderVennEmptyPlotNotice();
        if (state.ui.regionList) state.ui.regionList.innerHTML = '';
        if (state.ui.copyRegionBtn) state.ui.copyRegionBtn.style.display = 'none';
        state.analysis.lastRegions = null;
        state.analysis.lastUpSetRegionMap = null;
        state.analysis.lastUpSetIntersections = null;
        state.analysis.lastCounts = null;
        state.analysis.lastParsedLists = null;
        state.analysis.lastDrawMode = null;
        if (state.analysis.lastSignificance) {
          state.analysis.lastSignificance = null;
          state.analysis.significancePanelModel = null;
          if (state.ui.significanceResults) state.ui.significanceResults.innerHTML = '';
          debugLog('significance cleared during empty refresh');
        }
        debugLog('refreshDiagram skipped', {
          reason: 'no-data',
          plotType,
          hasLists,
          hasUpSetLists,
          hasNumeric
        });
        if(!isProjectingVennSession()){
          captureVennSessionStateFromActive(activeVennSession, { reason: 'venn-refresh-empty' });
        }
        return;
      }
      if (mode === 'numeric') {
        drawFromNumeric();
      } else {
        drawFromLists();
      }
      if(!isProjectingVennSession()){
        captureVennSessionStateFromActive(activeVennSession, { reason: 'venn-refresh-complete' });
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
    const session = getActiveVennSessionForState();
    if(session){
      session.timers.scheduleDraw = state.ui.scheduleDraw || session.timers.scheduleDraw || null;
      session.updatedAt = Date.now();
    }
    debug('Debug: venn auto-redraw scheduled', { reason, mode: state.analysis.lastDrawMode }); // Debug: automatic redraw trigger
    if(!scheduleActiveVennDraw({ reason: reason || 'venn-auto-redraw', mode: state.analysis.lastDrawMode || null })){
      debug('Debug: venn auto-redraw fallback', { reason, mode: state.analysis.lastDrawMode }); // Debug: fallback without scheduler
      refreshDiagram();
    }
  }

  function createVennResizableBoxOptions(){
    return {
      onResize: phase => {
        debugLog('layout onResize', { phase });
        if (phase !== 'observe') {
          scheduleActiveVennDraw({ reason: 'venn-layout-resize' });
        }
      }
    };
  }

  function ensureVennSvgBoxControls(reason = 'venn-controls-ensure'){
    const svgBox = state.ui.svgBox
      || state.ui.graphPanel?.querySelector?.('.svgbox')
      || queryVennRoot('#vennGraphPanel .svgbox')
      || null;
    if(!svgBox || typeof Shared.attachResizableBox !== 'function'){
      return false;
    }
    state.ui.svgBox = svgBox;
    const hasTray = !!svgBox.querySelector?.('.resizer-control-tray');
    const hasOptions = !!svgBox.querySelector?.('.resizer-options-control');
    const hasZoom = !!svgBox.querySelector?.('.resizer-zoom-control');
    if(hasTray && hasOptions && hasZoom){
      return true;
    }
    Shared.attachResizableBox(svgBox, {
      componentName: 'venn',
      tabId: venn.__boundTabId || resolveActiveVennTabId() || undefined,
      allowUnlimitedWidth: true,
      allowUnlimitedHeight: true,
      debugLabel: 'venn',
      ...createVennResizableBoxOptions()
    });
    syncVennAspectControls(reason);
    debugLog('venn svgbox controls ensured', {
      reason,
      hadTray: hasTray,
      hadOptions: hasOptions,
      hadZoom: hasZoom
    });
    return !!svgBox.querySelector?.('.resizer-control-tray')
      && !!svgBox.querySelector?.('.resizer-options-control')
      && !!svgBox.querySelector?.('.resizer-zoom-control');
  }

  function initLayout(root, options = {}) {
    const layoutFactory = Shared.componentLayout?.createStandardPanels;
    if (typeof layoutFactory !== 'function') {
      debugLog('initLayout skipped - missing factory', { hasFactory: typeof layoutFactory === 'function' });
      return;
    }
    const queryRoot = root && typeof root.querySelector === 'function' ? root : global.document;
    const layout = layoutFactory({
      componentName: 'venn',
      tabId: options?.tabId || undefined,
      root: root || undefined,
      reason: options?.reason || 'venn-init-layout',
      selectors: {
        tablePanel: '#vennInputPanel',
        graphPanel: '#vennGraphPanel',
        panelResizer: '#vennPanelResizer',
        svgBox: () => queryRoot?.querySelector('#vennGraphPanel .svgbox'),
        resizeTarget: () => queryRoot?.querySelector('#vennGraphPanel .svgbox')
      },
      scheduleDraw: options => scheduleActiveVennDraw(options && typeof options === 'object' ? options : {}),
      preserveGraphContent: false,
      panelSyncOptions: {
        disableAutoWidthClamp: true,
        lockGraphPanelWidth: false
      },
      resizableBoxOptions: createVennResizableBoxOptions(),
      onMinSvgWidth: value => {
        state.ui.minSvgWidth = Math.max(0, Number(value) || 0);
        debugLog('layout minSvgWidth update', { value: state.ui.minSvgWidth });
      },
      onAfterSync: ({ elements }) => {
        if (elements?.svgBox && elements.svgBox !== state.ui.svgBox) {
          state.ui.svgBox = elements.svgBox;
          debugLog('layout svgBox updated', { hasSvgBox: true });
        }
        syncVennAspectControls('layout-after-sync');
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
    syncVennAspectControls('layout-init');
    debugLog('layout initialized', {
      hasTable: !!state.ui.tablePanel,
      hasGraph: !!state.ui.graphPanel,
      hasResizer: !!state.ui.panelResizer,
      hasSvgBox: !!state.ui.svgBox
    });
  }

  function getVennGraphPayload(options = {}) {
    const requestedTabId = normalizeVennSessionTabId(options?.tabId || options?.tab || null, options || {});
    if(requestedTabId && options.forceLive !== true && !canCaptureLiveVennPayloadForTab(requestedTabId)){
      const storedPayload = getStoredVennPayloadForTab(requestedTabId);
      if(storedPayload){
        debugLog('venn.getPayload returned stored owner payload', {
          tabId: requestedTabId,
          activeTabId: getVennActiveTabId() || null,
          rootTabId: getVennRootTabId() || null,
          reason: options?.reason || 'stored-payload'
        });
        return storedPayload;
      }
    }
    if(options.skipDomRebind !== true){
      ensureVennDomBindings(requestedTabId || null);
    }
    const inputs = state.ui.inputs;
    if (!inputs) {
      debug('Debug: venn.getPayload skipped - missing inputs reference');
      return null;
    }
    const noteControl = notesState.control || null;
    const notesText = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const notesOpen = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = notesText;
    notesState.open = notesOpen;
    const includeAnalysis = options.includeAnalysis !== false;
    const payloadOwnerSession = requestedTabId
      ? (getVennSession(requestedTabId, { ...(options || {}), tabId: requestedTabId, reason: options?.reason || 'venn-payload-capture-session' }, { create: false }) || getActiveVennSessionForState())
      : getActiveVennSessionForState();
    const analysisResults = includeAnalysis ? resolveVennResultsForCapture(payloadOwnerSession) : null;
    const goToggle = state.ui.goResults?.querySelector?.('#toggleGoResults');
    const goLimit = goToggle?.dataset?.state === 'all'
      ? (analysisResults?.lastGOResult?.length || 5)
      : 5;
    const defaultStyle = createDefaultVennStyleState();
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
        colorScheme: getVennSchemeId(),
        colorA: getVennInputValue(inputs, 'colorA', defaultStyle.colorA),
        colorB: getVennInputValue(inputs, 'colorB', defaultStyle.colorB),
        colorC: getVennInputValue(inputs, 'colorC', defaultStyle.colorC),
        opacity: getVennInputValue(inputs, 'opacity', defaultStyle.opacity),
        borderColor: getVennInputValue(inputs, 'borderColor', defaultStyle.borderColor),
        borderWidth: getVennInputValue(inputs, 'borderWidth', defaultStyle.borderWidth),
        fontsize: getVennInputValue(inputs, 'fontsize', defaultStyle.fontsize),
        fontStyles: exportFontStyles('venn') || undefined,
        vennTraceStyles: cloneVennTraceStyles(state.analysis?.vennTraceStyles),
        title: state.titleText,
        labelPositions: state.labelPositions || null,
        upset: resolveUpSetSettings()
      },
      notes: {
        text: notesText,
        open: notesOpen
      },
      analysis: includeAnalysis ? createVennAnalysisPayloadFromResults(analysisResults, {
        goLimit,
        stringLimit: 5,
        activeResultsTab: state.analysis.activeResultsTab,
        regionSelectValue: state.ui.regionSelect ? state.ui.regionSelect.value || '' : '',
        totalGenes: state.ui.totalGenesInput ? state.ui.totalGenesInput.value || '' : '',
        speciesValue: state.ui.speciesSelect ? state.ui.speciesSelect.value || '' : '',
        speciesIndicator: state.ui.speciesSelect ? state.ui.speciesSelect.style?.backgroundColor || '' : ''
      }) : null
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
  venn.captureEmptyPayloadTemplate = function captureVennEmptyPayloadTemplate(){
    const snapshot = venn.createEmptyPayload();
    const session = getActiveVennSessionForState();
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(snapshot) || snapshot;
      session.updatedAt = Date.now();
    }
    console.debug('Debug: venn empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  venn.restoreEmptyPayloadTemplate = function restoreVennEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: venn empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    const session = getActiveVennSessionForState();
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(template) || template;
      session.updatedAt = Date.now();
    }
    console.debug('Debug: venn empty payload template restored', { hasTemplate: !!session?.cache?.emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!session?.cache?.emptyPayloadTemplate;
  };

  venn.createEmptyPayload = function createEmptyVennPayload(){
    const payload = { type: 'venn' };
    payload.type = 'venn';
    payload.data = {
      labelA: DEFAULT_VENN_LABEL_MAP.A,
      labelB: DEFAULT_VENN_LABEL_MAP.B,
      labelC: DEFAULT_VENN_LABEL_MAP.C,
      listA: '',
      listB: '',
      listC: '',
      nA: '0',
      nB: '0',
      nC: '0',
      nAB: '0',
      nAC: '0',
      nBC: '0',
      nABC: '0'
    };
    payload.style = createDefaultVennStyleState();
    payload.notes = { text: '', open: false };
    payload.analysis = {
      goResult: null,
      goFormatted: [],
      goOrganism: '',
      goLimit: 5,
      goPerformed: false,
      activeResultsTab: 'go',
      stringSvg: '',
      stringEnrichment: null,
      stringLimit: 5,
      stringPerformed: false,
      regionSelectValue: '',
      totalGenes: '',
      speciesValue: '',
      speciesIndicator: '',
      lastSignificance: null,
      significancePanelModel: normalizeVennSignificancePanelModel({})
    };
    return payload;
  };

  venn.applyTablePayloadChanges = function applyVennTablePayloadChanges(payload, _changes, meta = {}){
    const hot = meta.hotInstance || state.ui.hot || null;
    const matrix = hot && typeof hot.getData === 'function' ? hot.getData() : null;
    if (!Array.isArray(matrix)) {
      return null;
    }
    const nextPayload = payload && typeof payload === 'object'
      ? payload
      : venn.createEmptyPayload();
    const existingData = nextPayload.data && typeof nextPayload.data === 'object' && !Array.isArray(nextPayload.data)
      ? nextPayload.data
      : {};
    const header = matrix[0] || [];
    nextPayload.type = 'venn';
    nextPayload.data = {
      ...existingData,
      labelA: getNormalizedVennLabel(header[0], 0),
      labelB: getNormalizedVennLabel(header[1], 1),
      labelC: getNormalizedVennLabel(header[2], 2),
      listA: getColumnValuesFromTable(matrix, 0).join('\n'),
      listB: getColumnValuesFromTable(matrix, 1).join('\n'),
      listC: getColumnValuesFromTable(matrix, 2).join('\n')
    };
    return nextPayload;
  };

  venn.save = async function () {
    const payload = getVennGraphPayload();
    if (!payload) return;
    debug('Debug: saveVennFile invoked', { hasHandle: !!state.persistence.fileHandle });
    if (!fileIO || typeof fileIO.saveGraphFile !== 'function') {
      console.error('saveVennFile missing fileIO.saveGraphFile');
      return;
    }
    const operationSession = activeVennSession;
    const result = await fileIO.saveGraphFile({
      context: 'venn',
      fileHandle: state.persistence.fileHandle,
      payload,
      fileName: state.persistence.fileName,
      downloadFileName: state.persistence.fileName,
      setFileHandle: handle => setVennFileHandleForSession(handle, operationSession),
      setFileName: name => setVennFileNameForSession(name, operationSession)
    });
    captureVennSessionStateFromActive(operationSession, { reason: 'venn-save-complete' });
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
    const operationSession = activeVennSession;
    const result = await fileIO.saveGraphFileAs({
      context: 'venn',
      payload,
      fileName: state.persistence.fileName,
      downloadFileName: state.persistence.fileName,
      setFileHandle: handle => setVennFileHandleForSession(handle, operationSession),
      setFileName: name => setVennFileNameForSession(name, operationSession)
    });
    captureVennSessionStateFromActive(operationSession, { reason: 'venn-save-as-complete' });
    debug('Debug: venn.saveAs result', result);
  };

  venn.open = async function () {
    debug('Debug: venn open invoked');
    if (!fileIO || typeof fileIO.openGraphFile !== 'function') {
      console.error('openVennFile missing fileIO.openGraphFile');
      return;
    }
    const previous = captureVennSnapshot();
    const operationSession = activeVennSession;
    const result = await fileIO.openGraphFile({
      context: 'venn',
      setFileHandle: handle => setVennFileHandleForSession(handle, operationSession),
      setFileName: name => setVennFileNameForSession(name, operationSession),
      loadFromFile: file => venn.loadFromFile(file, { undo: { previous }, session: operationSession }),
      triggerInput: () => {
        const input = getVennNodeById('vennGraphFile');
        if (input) {
          input.value = '';
          input.click();
        }
      }
    });
    captureVennSessionStateFromActive(activeVennSession, { reason: 'venn-open-complete' });
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
    const normalizedPayload = normalizeVennPayloadForLiveCaptureShape(obj);
    const targetTabId = normalizeVennSessionTabId(meta?.tabId || meta?.tab || null, meta || {});
    const activeTabId = getVennActiveTabId();
    const targetIsInactive = !!targetTabId && !!activeTabId && String(targetTabId) !== String(activeTabId);
    const hydratedSession = !meta?.styleOnly && !meta?.colorSchemeOnly
      ? hydrateVennSessionFromPayload(normalizedPayload, {
        ...meta,
        tabId: targetTabId || meta?.tabId || null,
        reason: meta?.reason || (meta?.source ? `venn-payload-${meta.source}-hydrate` : 'venn-payload-hydrate')
      })
      : null;
    if(targetIsInactive || meta?.projectDom === false){
      debugLog('venn payload hydrated without DOM projection', {
        tabId: targetTabId || null,
        activeTabId: activeTabId || null,
        source: meta?.source || null
      });
      return !!hydratedSession;
    }
    const skipDraw = meta?.skipDraw === true;
    const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
    const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
    const inputs = state.ui.inputs;
    if(!inputs){
      console.warn('venn payload application skipped - inputs unavailable');
      return false;
    }
    const d = normalizedPayload.data || {};
    if(!skipDataLoad){
      clearVennDerivedCaches(meta?.source ? `payload:${meta.source}` : 'payload');
      inputs.labelA.value = d.labelA;
      inputs.labelB.value = d.labelB;
      inputs.labelC.value = d.labelC;
      inputs.A.value = d.listA;
      inputs.B.value = d.listB;
      inputs.C.value = d.listC;
      state.ui.syncTableFromInputs?.({ refresh: true, skipPayloadSync: true });
      const c = inputs.counts;
      c.nA.value = d.nA;
      c.nB.value = d.nB;
      c.nC.value = d.nC;
      c.nAB.value = d.nAB;
      c.nAC.value = d.nAC;
      c.nBC.value = d.nBC;
      c.nABC.value = d.nABC;
    }
    const defaultStyle = createDefaultVennStyleState();
    const s = normalizedPayload.style && typeof normalizedPayload.style === 'object'
      ? { ...defaultStyle, ...normalizedPayload.style }
      : defaultStyle;
    state.ui.activeColorScheme = String(s.colorScheme || '').trim().toLowerCase() || 'scientific';
    const notesConfig = (obj.notes && typeof obj.notes === 'object')
      ? obj.notes
      : (s.notes && typeof s.notes === 'object' ? s.notes : null);
    if(notesConfig){
      notesState.text = notesConfig.text == null ? '' : String(notesConfig.text);
      notesState.open = !!notesConfig.open;
    }else{
      notesState.text = '';
      notesState.open = false;
    }
    if(notesState.control){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    const plotType = normalizePlotType(s.plotType || DEFAULT_PLOT_TYPE);
    syncPlotMode(plotType, { updateTitle: false });
    importFontStyles('venn', s.fontStyles || null);
    state.analysis.vennTraceStyles = cloneVennTraceStyles(s.vennTraceStyles);
    if(s.title !== undefined){
      state.titleText = s.title != null ? String(s.title) : '';
    }else{
      state.titleText = plotType === 'upset' ? DEFAULT_UPSET_TITLE : DEFAULT_VENN_TITLE;
    }
    if (inputs.colorA) {
      inputs.colorA.value = sanitizeColor(s.colorA, defaultStyle.colorA);
    }
    if (inputs.colorB) {
      inputs.colorB.value = sanitizeColor(s.colorB, defaultStyle.colorB);
    }
    if (inputs.colorC) {
      inputs.colorC.value = sanitizeColor(s.colorC, defaultStyle.colorC);
    }
    if (inputs.opacity) {
      inputs.opacity.value = String(clampNumber(s.opacity, Number(defaultStyle.opacity), 0, 1));
      if (inputs.opacityVal) {
        inputs.opacityVal.textContent = inputs.opacity.value;
      }
    }
    if (inputs.borderColor) {
      inputs.borderColor.value = sanitizeColor(s.borderColor, defaultStyle.borderColor);
    }
    if (inputs.borderWidth) {
      inputs.borderWidth.value = String(clampNumber(s.borderWidth, Number(defaultStyle.borderWidth), 0));
      if (inputs.borderWidthVal) {
        inputs.borderWidthVal.textContent = inputs.borderWidth.value;
      }
    }
    if (inputs.fontsize) {
      if (s.fontsize !== undefined && s.fontsize !== null) {
        const fontInfo = resolveFontInfo(s.fontsize);
        inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
        chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
        debug('Debug: venn payload font applied', { saved: s.fontsize, fontInfo });
      } else {
        const fontInfo = resolveFontInfo(defaultStyle.fontsize);
        inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
        chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
        debug('Debug: venn payload font fallback', { fontInfo });
      }
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
      if (state.ui.upset.gridColor) state.ui.upset.gridColor.value = sanitizeColor(upset.gridColor, DEFAULT_UPSET_SETTINGS.gridColor);
      state.analysis.upsetAxis = {
        color: sanitizeColor(upset.axisColor, DEFAULT_UPSET_SETTINGS.axisColor),
        width: clampNumber(upset.axisWidth, DEFAULT_UPSET_SETTINGS.axisWidth, 0.25, 10)
      };
      state.analysis.upsetTraceStyles = cloneUpSetTraceStyles(upset.traceStyles);
    }
    // Restore label positions if saved
    if(s.labelPositions){
      state.labelPositions = {
        title: s.labelPositions.title || null
      };
    }
    if(skipDraw){
      if(normalizedPayload.analysis && typeof normalizedPayload.analysis === 'object'){
        state.analysis.lastGOResult = normalizedPayload.analysis.goResult ? cloneSimple(normalizedPayload.analysis.goResult) : null;
        state.analysis.lastGOFormatted = Array.isArray(normalizedPayload.analysis.goFormatted) ? normalizedPayload.analysis.goFormatted.slice() : [];
        state.analysis.lastGOOrganism = normalizedPayload.analysis.goOrganism || '';
        state.analysis.goPerformed = !!normalizedPayload.analysis.goPerformed || Array.isArray(normalizedPayload.analysis.goResult);
        state.analysis.activeResultsTab = normalizeAnalysisResultsTab(normalizedPayload.analysis.activeResultsTab);
        state.analysis.lastSignificance = normalizedPayload.analysis.lastSignificance ? cloneSimple(normalizedPayload.analysis.lastSignificance) : null;
        state.analysis.significancePanelModel = normalizeVennSignificancePanelModel(normalizedPayload.analysis.significancePanelModel || {});
        if(state.ui.totalGenesInput && Object.prototype.hasOwnProperty.call(normalizedPayload.analysis, 'totalGenes')){
          state.ui.totalGenesInput.value = normalizedPayload.analysis.totalGenes || '';
        }
        if(state.ui.speciesSelect && Object.prototype.hasOwnProperty.call(normalizedPayload.analysis, 'speciesValue')){
          state.ui.speciesSelect.value = normalizedPayload.analysis.speciesValue || '';
          state.ui.speciesSelect.style.backgroundColor = normalizedPayload.analysis.speciesIndicator || '';
        }
        restoreVennSignificancePanelModel(state.analysis.significancePanelModel);
        state.analysis.lastStringSVG = normalizedPayload.analysis.stringSvg || '';
        state.analysis.lastStringEnrichment = normalizedPayload.analysis.stringEnrichment ? cloneSimple(normalizedPayload.analysis.stringEnrichment) : null;
        state.analysis.stringOverlay = normalizeStringOverlayModel(normalizedPayload.analysis.stringOverlay);
        syncStringOverlayControls();
        state.analysis.stringPerformed = !!normalizedPayload.analysis.stringPerformed
          || (typeof normalizedPayload.analysis.stringSvg === 'string' && normalizedPayload.analysis.stringSvg.length > 0)
          || Array.isArray(normalizedPayload.analysis.stringEnrichment);
        if(state.ui.regionSelect && Object.prototype.hasOwnProperty.call(normalizedPayload.analysis, 'regionSelectValue')){
          state.ui.regionSelect.value = normalizedPayload.analysis.regionSelectValue || '';
        }
      }else{
        state.analysis.lastGOResult = null;
        state.analysis.lastGOFormatted = [];
        state.analysis.lastGOOrganism = '';
        state.analysis.goPerformed = false;
        state.analysis.activeResultsTab = 'go';
        state.analysis.lastStringSVG = null;
        state.analysis.lastStringEnrichment = null;
        state.analysis.stringOverlay = normalizeStringOverlayModel();
        syncStringOverlayControls();
        state.analysis.stringPerformed = false;
      }
    }else{
      withVennSessionProjection(() => {
        refreshDiagram();
        applyAnalysisPayload(normalizedPayload.analysis);
      });
    }
    setActiveAnalysisResultsTab(state.analysis.activeResultsTab || 'go', { syncPayload: false });
    if(meta.recordUndo !== false){
      const undoPrevious = meta.undoPrevious || captureVennSnapshot();
      const next = captureVennSnapshot();
      recordVennChange(meta.undoLabel || 'venn:load-file', undoPrevious, next);
    }
    captureVennSessionStateFromActive(hydratedSession || activeVennSession, { reason: meta?.source ? `venn-payload-${meta.source}` : 'venn-payload-apply' });
    debugLog('Debug: venn payload applied', { source: meta.source || 'unknown' });
    return true;
  }

  venn.loadFromFile = function (file, options = {}) {
    const undoPrevious = options?.undo?.previous || captureVennSnapshot();
    const operationSession = options.session || activeVennSession;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        if (file && typeof file.name === 'string') {
          setVennFileNameForSession(file.name, operationSession);
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
    if(!applyVennPayload(payload, { ...options, source: options?.source || 'payload', undoPrevious, recordUndo, undoLabel: options?.undoLabel })){
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
    persistActiveVennUserChange('venn-opacity-change');
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
    persistActiveVennUserChange('venn-fontsize-change');
    const target = event?.currentTarget || state.ui.inputs.fontsize;
    commitVennUndo(target, 'venn:fontsize');
    if (target) {
      prepareVennUndo(target, 'venn:fontsize');
    }
  }

  function handleColorInput(event) {
    refreshDiagram();
    persistActiveVennUserChange('venn-color-change');
    debug('Debug: venn handleColorInput'); // Debug: color change trigger
    const target = event?.currentTarget || null;
    const label = target?.id ? `venn:${target.id}` : 'venn:color';
    if (target) {
      commitVennUndo(target, label);
    }
  }

  function handleBorderColorInput(event) {
    refreshDiagram();
    persistActiveVennUserChange('venn-border-color-change');
    debug('Debug: venn handleBorderColorInput'); // Debug: border color update
    commitVennUndo(event?.currentTarget || state.ui.inputs.borderColor, 'venn:border-color');
  }

  function handleBorderWidthInput(event) {
    const target = event?.currentTarget || state.ui.inputs.borderWidth;
    state.ui.inputs.borderWidthVal.textContent = state.ui.inputs.borderWidth.value;
    refreshDiagram();
    persistActiveVennUserChange('venn-border-width-change');
    debug('Debug: venn handleBorderWidthInput', { value: state.ui.inputs.borderWidth.value }); // Debug: border width change
    commitVennUndo(target, 'venn:border-width');
    if (target) {
      prepareVennUndo(target, 'venn:border-width');
    }
  }

  function createLabelInputHandler(id) {
    return function labelInputHandler(event) {
      const labels = getCurrentVennLabelMap();
      updateColorLabels(labels);
      if (getActivePlotType() !== 'upset') {
        updateRegionSelect(labels, state.analysis.lastCounts);
      }
      updateCountLabels(labels);
      requestScheduledDraw(`label-input-${id}`);
      persistActiveVennUserChange(`venn-label-${id}-change`);
      debug('Debug: venn labelInputHandler', { id, labels }); // Debug: label input change
      const target = event?.currentTarget || state.ui.inputs[id];
      commitVennUndo(target, `venn:label-${id}`);
    };
  }

  function handleCaseSensitiveChange(event) {
    requestScheduledDraw('case-sensitive-toggle', 'lists');
    persistActiveVennUserChange('venn-case-sensitive-change');
    debug('Debug: venn handleCaseSensitiveChange'); // Debug: case sensitivity toggle
    commitVennUndo(event?.currentTarget || state.ui.inputs.caseSensitive, 'venn:case-sensitive');
  }

  function handlePlotTypeChange(event) {
    const target = event?.currentTarget || state.ui.plotType;
    const nextType = normalizePlotType(target?.value || DEFAULT_PLOT_TYPE);
    syncPlotMode(nextType, { updateTitle: true, syncPanels: true });
    requestScheduledDraw('plot-type-change');
    persistActiveVennUserChange('venn-plot-type-change');
    debug('Debug: venn handlePlotTypeChange', { plot: nextType });
    commitVennUndo(target, 'venn:plot-type');
  }

  function handleUpSetControlChange(event) {
    requestScheduledDraw('upset-control-change');
    const target = event?.currentTarget || null;
    const label = target?.id ? `venn:${target.id}` : 'venn:upset-control';
    persistActiveVennUserChange('venn-upset-control-change');
    debug('Debug: venn handleUpSetControlChange', { id: target?.id || null });
    commitVennUndo(target, label);
  }

  function handleUpSetDotSizeInput(event) {
    const target = event?.currentTarget || state.ui.upset?.dotSize;
    updateUpSetDotSizeOutput(target?.value);
    requestScheduledDraw('upset-dot-size');
    persistActiveVennUserChange('venn-upset-dot-size-change');
    debug('Debug: venn handleUpSetDotSizeInput', { value: target?.value });
    commitVennUndo(target, 'venn:upset-dot-size');
  }

  function initializeLabelState() {
    const labels = getCurrentVennLabelMap();
    updateColorLabels(labels);
    if (getActivePlotType() !== 'upset') {
      updateRegionSelect(labels, state.analysis.lastCounts);
    }
    updateCountLabels(labels);
    debug('Debug: venn initializeLabelState', { labels }); // Debug: initial label synchronization
  }

  function handleRegionSelectChange() {
    populateRegion(state.ui.regionSelect.value);
    debug('Debug: venn handleRegionSelectChange', { value: state.ui.regionSelect.value }); // Debug: region selection change
    syncActiveVennPayload('venn-region-select');
  }

  function handleSpeciesSelectChange() {
    captureVennSessionStateFromActive(activeVennSession, { reason: 'venn-species-select-change' });
    syncActiveVennPayload('venn-species-select');
    debug('Debug: venn handleSpeciesSelectChange', { value: state.ui.speciesSelect?.value || '' });
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
      if(!targetEl){ return; }
      const hidden = global.getComputedStyle?.(targetEl).display === 'none';
      targetEl.style.display = hidden ? 'block' : 'none';
      debug('Debug: venn toggleHandler', { label, show: hidden }); // Debug: toggle state change
    };
  }

  function createListInputHandler(key) {
    return function listInputHandler(event) {
      if (state.ui.speciesSelect) { state.ui.speciesSelect.value = ''; }
      setSpeciesIndicator(null);
      requestScheduledDraw(`list-input-${key}`, 'lists');
      scheduleSpeciesRecognition(`list-input-${key}`);
      persistActiveVennUserChange(`venn-list-${key}-change`);
      debug('Debug: venn listInputHandler', { key }); // Debug: list input change
      const target = event?.currentTarget || state.ui.inputs[key];
      commitVennUndo(target, `venn:list-${key}`);
    };
  }

  function createNumericInputHandler(key) {
    return function numericInputHandler(event) {
      requestScheduledDraw(`numeric-input-${key}`, 'numeric');
      cancelPendingSpeciesDetection(`numeric-input-${key}`, { abortActive: true, resetIndicator: true });
      persistActiveVennUserChange(`venn-numeric-${key}-change`);
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
        Shared.componentLifecycle?.scheduleComponentFrame?.(venn, 'venn', {
          tabId: venn.__boundTabId || null,
          reason: 'venn-tooltip-size'
        }, () => {
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

  function handleAnalysisResultsTabClick(e) {
    const button = e?.currentTarget;
    if (!button) {
      return;
    }
    const owner = getVennCallbackOwner({
      event: e,
      target: button,
      reason: 'venn-analysis-tab-click'
    });
    setActiveAnalysisResultsTab(button.id === 'analysisTabString' ? 'string' : 'go', {
      reason: 'venn-analysis-tab-click',
      owner,
      tabId: owner?.tabId || null
    });
  }

  function handleCalcSignificanceClick() {
    debug('Debug: venn significance click');
    calculateSignificance();
  }

  async function handleGoButtonClick() {
    try {
      setActiveAnalysisResultsTab('go', { reason: 'venn-go-run' });
      const regionGenes = (getRegionText(state.ui.regionSelect.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
      const organism = await resolveVennAnalysisOrganism({ alertMessage: 'Please select a species before running GO analysis.' });
      if (!organism) { return; }
      runGOAnalysis(regionGenes, organism);
      debug('Debug: venn handleGoButtonClick', { geneCount: regionGenes.length, organism }); // Debug: GO click payload
    } catch (err) { console.error('goBtn error', err); }
  }

  async function handleStringButtonClick() {
    try {
      setActiveAnalysisResultsTab('string', { reason: 'venn-string-run' });
      const regionGenes = (getRegionText(state.ui.regionSelect.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
      const organism = await resolveVennAnalysisOrganism({ alertMessage: 'Please select a species before running STRING analysis.' });
      if (!organism) { return; }
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
      const operationSession = activeVennSession;
      setVennFileNameForSession(f.name, operationSession);
      setVennFileHandleForSession(null, operationSession);
      venn.loadFromFile(f, { undo: { previous }, session: operationSession });
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
    captureVennSessionStateFromActive(activeVennSession, { reason: 'venn-sample-data' });
    const next = captureVennSnapshot();
    recordVennChange('venn:sample-data', previous, next);
    debug('Debug: venn handleSampleClick'); // Debug: sample data loaded
  }

  function initVennTable(root) {
    const queryRoot = root && typeof root.querySelector === 'function' ? root : document;
    const existing = vennTableBindingsByRoot.get(queryRoot);
    if (existing && existing.hot) {
      state.ui.hotWrapper = existing.hotWrapper || null;
      state.ui.hotContainer = existing.hotContainer || null;
      state.ui.hot = existing.hot;
      state.ui.syncTableFromInputs = syncVennTableFromInputs;
      state.ui.syncInputsFromTable = syncVennInputsFromTable;
      ensureVennDefaultTableHeaders(state.ui.hot);
      syncVennSessionManagersFromActive();
      return;
    }
    const wrapper = queryRoot.querySelector('#vennHotWrapper');
    const container = queryRoot.querySelector('#vennHot');
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
    data[0][0] = DEFAULT_VENN_TABLE_HEADERS[0];
    data[0][1] = DEFAULT_VENN_TABLE_HEADERS[1];
    data[0][2] = DEFAULT_VENN_TABLE_HEADERS[2];
    const handleTableStructureChange = (label) => {
      syncVennInputsFromTable({ scheduleDraw: true, scheduleSpecies: true });
      debugLog('venn table structure change', { label });
    };
    // The hot wrapper invokes this draw callback for every table mutation it applies,
    // including undo/redo, fill, and structural changes — not only direct cell edits (which
    // also fire the afterChange hook below). Routing it through syncVennInputsFromTable so
    // those paths redraw the diagram normalizes venn to scatter/box/line, which pass their
    // real draw proxy here. A no-op was the reason undo did not update the graph.
    const scheduleVennTableDraw = (payload) => {
      if (payload && payload.source === 'loadData') {
        return;
      }
      syncVennInputsFromTable({ scheduleDraw: true, scheduleSpecies: true });
    };
    const createVennTableInstance = targetContainer => Shared.hot.createStandardTable(targetContainer, { rows: 20, cols: 3 }, scheduleVennTableDraw, {
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
    const tabId = venn.__boundTabId || normalizeVennSessionTabId(null, { reason: 'venn-table-init' }) || null;
    const tableEntry = tabId && typeof Shared.hot.mountTableForTab === 'function'
      ? Shared.hot.mountTableForTab({
          type: 'venn',
          tabId,
          wrapper,
          templateContainer: container,
          createInstance: createVennTableInstance
        })
      : null;
    state.ui.hotContainer = tableEntry?.container || container;
    state.ui.hot = tableEntry?.instance || createVennTableInstance(state.ui.hotContainer);
    ensureVennDefaultTableHeaders(state.ui.hot);
    state.ui.syncTableFromInputs = syncVennTableFromInputs;
    state.ui.syncInputsFromTable = syncVennInputsFromTable;
    syncVennInputsFromTable({ scheduleDraw: false, scheduleSpecies: false });
    vennTableBindingsByRoot.set(queryRoot, {
      hotWrapper: wrapper,
      hotContainer: container,
      hot: state.ui.hot
    });
    syncVennSessionManagersFromActive();
  }

  function registerEventHandlers() {
    const inputs = state.ui.inputs;
    const eventBindings = [
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
      { elements: [state.ui.upset?.barColor, state.ui.upset?.setBarColor, state.ui.upset?.dotColor, state.ui.upset?.inactiveDotColor, state.ui.upset?.gridColor], type: 'input', handler: handleUpSetControlChange, label: 'upset-colors' },
      { elements: state.ui.regionSelect, type: 'change', handler: handleRegionSelectChange, label: 'region-select' },
      { elements: state.ui.copyRegionBtn, type: 'click', handler: handleCopyRegionClick, label: 'copy-region' },
      { elements: state.ui.speciesSelect, type: 'change', handler: handleSpeciesSelectChange, label: 'species-select' },
      { elements: state.ui.goBtn, type: 'click', handler: handleGoButtonClick, label: 'go-run' },
      { elements: state.ui.detectSpeciesBtn, type: 'click', handler: handleDetectSpeciesClick, label: 'detect-species' },
      { elements: state.ui.stringBtn, type: 'click', handler: handleStringButtonClick, label: 'string-run' },
      { elements: state.ui.stringOverlayFileButton, type: 'click', handler: handleStringOverlayFileButtonClick, label: 'string-overlay-file-button' },
      { elements: state.ui.stringOverlayFile, type: 'change', handler: handleStringOverlayFileChange, label: 'string-overlay-file' },
      { elements: [state.ui.stringOverlayThreshold, state.ui.stringOverlayColor, state.ui.stringOverlayThickness], type: 'input', handler: handleStringOverlayControlInput, label: 'string-overlay-controls-live' },
      { elements: [state.ui.stringOverlayThreshold, state.ui.stringOverlayColor, state.ui.stringOverlayThickness, state.ui.stringOverlayEnabled, state.ui.stringOverlayMode], type: 'change', handler: handleStringOverlayControlChange, label: 'string-overlay-control-change' },
      { elements: state.ui.analysisTabGo, type: 'click', handler: handleAnalysisResultsTabClick, label: 'analysis-tab-go' },
      { elements: state.ui.analysisTabString, type: 'click', handler: handleAnalysisResultsTabClick, label: 'analysis-tab-string' },
      { elements: state.ui.goBtn, type: 'mouseenter', handler: handleGoBtnMouseEnter, label: 'go-tooltip-enter' },
      { elements: state.ui.goBtn, type: 'mouseleave', handler: handleGoBtnTooltipLeave, label: 'go-tooltip-leave' },
      { elements: state.ui.goResults, type: 'click', handler: handleGoResultsClick, label: 'go-results' },
      { elements: state.ui.calcSignificanceBtn, type: 'click', handler: handleCalcSignificanceClick, label: 'significance' },
      { elements: state.ui.useNumericBtn, type: 'click', handler: handleUseNumericClick, label: 'use-numeric' },
      { elements: state.ui.openVennGraphBtn, type: 'click', handler: venn.open, label: 'open-venn' },
      { elements: state.ui.saveVennGraphBtn, type: 'click', handler: venn.save, label: 'save-venn' },
      { elements: state.ui.saveAsVennBtn, type: 'click', handler: venn.saveAs, label: 'saveas-venn' },
      { elements: state.ui.vennGraphFileInput, type: 'change', handler: handleGraphFileChange, label: 'graph-file' },
      { elements: state.ui.sampleBtn, type: 'click', handler: handleSampleClick, label: 'sample' }
    ];
    bindEventHandlers(eventBindings);
    if(!vennDocumentHandlersBound){
      bindEventHandlers([
        { elements: document, type: 'click', handler: handleDocumentClick, label: 'document-click' }
      ]);
      vennDocumentHandlersBound = true;
    }

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
    attachUndoLifecycle(state.ui.stringOverlayEnabled, 'venn:string-overlay-enabled');
    attachUndoLifecycle(state.ui.stringOverlayThreshold, 'venn:string-overlay-threshold');
    attachUndoLifecycle(state.ui.stringOverlayMode, 'venn:string-overlay-mode');
    attachUndoLifecycle(state.ui.stringOverlayColor, 'venn:string-overlay-color');
    attachUndoLifecycle(state.ui.stringOverlayThickness, 'venn:string-overlay-thickness');
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

  function getVennRootTabId(root){
    if(!root || typeof root.getAttribute !== 'function'){
      return null;
    }
    return root.getAttribute('data-workspace-tab-id')
      || root?.dataset?.workspaceTabId
      || root?.closest?.('[data-workspace-tab-id]')?.getAttribute?.('data-workspace-tab-id')
      || null;
  }

  function normalizeVennTabId(tabLike = null){
    if(tabLike && typeof tabLike === 'object'){
      return tabLike.id || tabLike.tabId || null;
    }
    return tabLike || venn.__boundTabId || null;
  }

  function resolveVennRoot(tabLike = null){
    const activeTabId = normalizeVennTabId(tabLike);
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(activeTabId, 'venn') || null;
    if(mountedRoot){
      return mountedRoot;
    }
    const currentRoot = state.ui.root || null;
    const currentRootTabId = getVennRootTabId(currentRoot);
    if(currentRoot && (!activeTabId || !currentRootTabId || String(currentRootTabId) === String(activeTabId))){
      return currentRoot;
    }
    const staticRoot = global.Main?.components?.workspaces?.venn?.element || null;
    const staticRootTabId = getVennRootTabId(staticRoot);
    if(staticRoot && (!activeTabId || !staticRootTabId || String(staticRootTabId) === String(activeTabId))){
      return staticRoot;
    }
    debugLog('resolveVennRoot refused stale root fallback', {
      requestedTabId: activeTabId || null,
      currentRootTabId: currentRootTabId || null,
      staticRootTabId: staticRootTabId || null
    });
    return null;
  }

  function queryVennRoot(selector, tabLike = null){
    const root = resolveVennRoot(tabLike);
    if(!selector || !root || typeof root.querySelector !== 'function'){
      return null;
    }
    return root.querySelector(selector);
  }

  function getVennNodeById(id, tabLike = null){
    if(!id){
      return null;
    }
    const root = resolveVennRoot(tabLike);
    if(root && typeof root.getElementById === 'function'){
      const byId = root.getElementById(id);
      if(byId){
        return byId;
      }
    }
    return queryVennRoot(`#${id}`, tabLike);
  }

  function bindUiToRoot(mountedRoot){
    const root = mountedRoot && typeof mountedRoot.querySelector === 'function'
      ? mountedRoot
      : resolveVennRoot();
    const $root = selector => {
      if(!selector){
        return null;
      }
      if(root && typeof root.querySelector === 'function'){
        return root.querySelector(selector);
      }
      return queryVennRoot(selector);
    };
    state.ui.root = root;
    state.ui.stage = $root('#stage');
    state.ui.inputs = {
      A: $root('#listA'),
      B: $root('#listB'),
      C: $root('#listC'),
      labelA: $root('#labelA'),
      labelB: $root('#labelB'),
      labelC: $root('#labelC'),
      colorA: $root('#colorA'),
      colorB: $root('#colorB'),
      colorC: $root('#colorC'),
      opacity: $root('#opacity'),
      fontsize: $root('#fontsize'),
      borderColor: $root('#borderColor'),
      borderWidth: $root('#borderWidth'),
      opacityVal: $root('#opacityVal'),
      fontsizeVal: $root('#fontsizeVal'),
      borderWidthVal: $root('#borderWidthVal'),
      caseSensitive: $root('#caseSensitive'),
      counts: {
        nA: $root('#nA'),
        nB: $root('#nB'),
        nC: $root('#nC'),
        nAB: $root('#nAB'),
        nAC: $root('#nAC'),
        nBC: $root('#nBC'),
        nABC: $root('#nABC')
      }
    };
    state.ui.countsUI = {
      A: $root('#countA'),
      B: $root('#countB'),
      C: $root('#countC'),
      AB: $root('#countAB'),
      AC: $root('#countAC'),
      BC: $root('#countBC'),
      ABC: $root('#countABC')
    };
    state.ui.regionSelect = $root('#regionSelect');
    state.ui.regionList = $root('#regionList');
    state.ui.copyRegionBtn = $root('#copyRegionBtn');
    state.ui.goBtn = $root('#goBtn');
    state.ui.detectSpeciesBtn = $root('#detectSpeciesBtn');
    state.ui.stringBtn = $root('#stringBtn');
    state.ui.analysisResultsTabs = $root('#analysisResultsTabs');
    state.ui.analysisTabGo = $root('#analysisTabGo');
    state.ui.analysisTabString = $root('#analysisTabString');
    state.ui.plotType = $root('#vennPlotType');
    state.ui.upset = {
      sort: $root('#upsetSort'),
      max: $root('#upsetMax'),
      showEmpty: $root('#upsetShowEmpty'),
      showCounts: $root('#upsetShowCounts'),
      showSetCounts: $root('#upsetShowSetCounts'),
      showGrid: $root('#upsetShowGrid'),
      dotSize: $root('#upsetDotSize'),
      dotSizeVal: $root('#upsetDotSizeVal'),
      useSetColors: $root('#upsetUseSetColors'),
      barColor: $root('#upsetBarColor'),
      setBarColor: $root('#upsetSetBarColor'),
      dotColor: $root('#upsetDotColor'),
      inactiveDotColor: $root('#upsetInactiveDotColor'),
      gridColor: $root('#upsetGridColor')
    };
    state.ui.goResults = $root('#goResults');
    state.ui.stringResults = $root('#stringResults');
    state.ui.stringNetwork = $root('#stringNetwork');
    state.ui.analysisPanelGo = $root('#analysisPanelGo');
    state.ui.analysisPanelString = $root('#analysisPanelString');
    state.ui.vennExportControls = $root('#vennExportControls');
    state.ui.goChart = $root('#goChart');
    state.ui.goChartExport = $root('#goChartExport');
    state.ui.stringNetworkExport = $root('#stringNetworkExport');
    state.ui.tooltip = $root('#tooltip');
    state.ui.speciesSelect = $root('#speciesSelect');
    state.ui.totalGenesInput = $root('#totalGenes');
    state.ui.calcSignificanceBtn = $root('#calcSignificance');
    state.ui.significanceResults = $root('#significanceResults');
    state.ui.goCategoryChecks = Array.from(root?.querySelectorAll?.('.goCategory') || []);
    state.ui.goOptsBtn = $root('#goOptsBtn');
    state.ui.goOptions = $root('#goOptions');
    state.ui.goUseAllBackground = $root('#goUseAllBackground');
    state.ui.stringOptsBtn = $root('#stringOptsBtn');
    state.ui.stringOptions = $root('#stringOptions');
    state.ui.stringOverlayFile = $root('#stringOverlayFile');
    state.ui.stringOverlayFileButton = $root('#stringOverlayFileButton');
    state.ui.stringOverlayFileName = $root('#stringOverlayFileName');
    state.ui.stringOverlayEnabled = $root('#stringOverlayEnabled');
    state.ui.stringOverlayThreshold = $root('#stringOverlayThreshold');
    state.ui.stringOverlayMode = $root('#stringOverlayMode');
    state.ui.stringOverlayColor = $root('#stringOverlayColor');
    state.ui.stringOverlayThickness = $root('#stringOverlayThickness');
    state.ui.stringOverlayStatus = $root('#stringOverlayStatus');
    syncStringOverlayControls();
    state.ui.useNumericBtn = $root('#useNumeric');
    state.ui.openVennGraphBtn = $root('#openVennGraph');
    state.ui.saveVennGraphBtn = $root('#saveVennGraph');
    state.ui.saveAsVennBtn = $root('#saveAsVenn');
    state.ui.vennGraphFileInput = $root('#vennGraphFile');
    state.ui.sampleBtn = $root('#sample');
    [state.ui.regionSelect, state.ui.speciesSelect, state.ui.plotType, state.ui.upset?.sort]
      .filter(Boolean)
      .forEach(select => attachVennSelectAutoSize(select, 'venn'));
    initNotes(root);
    initVennTable(root);
    if(root && !vennBoundRoots.has(root)){
      registerEventHandlers();
      vennBoundRoots.add(root);
    }
    syncVennSessionRefsFromActive();
    syncVennSessionManagersFromActive();
  }

  function initNotes(root){
    const queryRoot = root && typeof root.querySelector === 'function'
      ? root
      : global.document;
    const documentRef = queryRoot?.ownerDocument || global.document;
    const diagramArea = queryRoot?.querySelector?.('#vennGraphPanel .diagram-area') || null;
    const graphPanel = queryRoot?.querySelector?.('#vennGraphPanel') || null;
    let stack = queryRoot?.querySelector?.('#vennGraphPanel .venn-plot-stack') || null;
    if(!stack && diagramArea){
      const svgBox = diagramArea.querySelector('.svgbox');
      if(svgBox){
        stack = documentRef.createElement('div');
        stack.className = 'venn-plot-stack';
        const configOptions = diagramArea.querySelector('.config-panel');
        if(configOptions){
          diagramArea.insertBefore(stack, configOptions);
        }else{
          diagramArea.appendChild(stack);
        }
        stack.appendChild(svgBox);
      }
    }
    if(!stack){
      stack = diagramArea || graphPanel;
    }
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        debug('Debug: venn notes mount skipped', { reason: 'missing-stack' });
      }
      return;
    }
    const misplaced = graphPanel?.querySelector?.('[data-notes-id="venn-notes"]');
    if(misplaced && misplaced.parentElement !== stack){
      misplaced.remove();
    }
    const helper = Shared.notes;
    if(!helper || typeof helper.mountFoldable !== 'function'){
      console.warn('venn notes helper unavailable', { hasSharedNotes: !!helper });
      return;
    }
    if(notesState.control?.root && notesState.control.root.isConnected && stack.contains(notesState.control.root)){
      notesState.control.setValue(notesState.text || '');
      notesState.control.setOpen(!!notesState.open);
      return;
    }
    notesState.control = helper.mountFoldable({
      container: stack,
      id: 'venn-notes',
      title: 'Notes',
      placeholder: 'Write notes about the data being analyzed...',
      richText: true,
      scopeId: 'venn',
      fontKey: 'notes',
      value: notesState.text || '',
      open: !!notesState.open,
      onChange: value => {
        notesState.text = value == null ? '' : String(value);
        const session = getActiveVennSessionForState();
        if(session){
          session.notes = createDefaultVennNotesState(notesState);
          session.state.notes = createDefaultVennNotesState(notesState);
          session.updatedAt = Date.now();
        }
      },
      onToggle: open => {
        notesState.open = !!open;
        const session = getActiveVennSessionForState();
        if(session){
          session.notes = createDefaultVennNotesState(notesState);
          session.state.notes = createDefaultVennNotesState(notesState);
          session.updatedAt = Date.now();
        }
      }
    });
    syncVennSessionRefsFromActive();
  }

  function ensureVennDomBindings(tabLike = null, meta = {}){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
      return false;
    }
    const result = Shared.workspaceTabs.ensureActiveDomBindings({
      componentKey: 'venn',
      tabLike: tabLike || null,
      meta,
      sentinelSelector: '#vennHot',
      getCurrentRoot: () => state.ui.root || null,
      getCurrentSentinel: () => state.ui.hotContainer || null,
      rebind: ({ root, tab, tabId: infoTabId, mountedSentinel }) => {
        const tabId = tab?.id || infoTabId || normalizeVennTabId(tabLike) || null;
        const nextRoot = root || resolveVennRoot(tab || tabId || null) || state.ui.root || null;
        debugLog('active DOM binding rebind', {
          previousTabId: venn.__boundTabId || null,
          targetTabId: tabId,
          hasRoot: !!nextRoot,
          passive: meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true
        });
        if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
          venn.__boundTabId = tabId || venn.__boundTabId || null;
          bindUiToRoot(nextRoot);
          bindVennSessionForTab(tab || tabId || null, {
            ...(meta || {}),
            tabId: tabId || null,
            root: state.ui.root || nextRoot || null,
            reason: meta?.reason || 'venn-passive-dom-rebind'
          }, { apply: false });
          syncVennSessionRefsFromActive();
          syncVennSessionManagersFromActive();
          venn.__domSentinel = mountedSentinel || state.ui.hotContainer || getVennNodeById('vennHot');
          venn.ready = true;
          debugLog('passive DOM rebind', { tabId: venn.__boundTabId || null });
          return;
        }
        venn.ready = false;
        venn.init({
          root: nextRoot || undefined,
          tabId,
          reason: 'active-dom-binding-rebind'
        });
      }
    });
    return !!result?.rebound;
  }

  venn.init = function init(options = {}) {
    const targetTabId = normalizeVennTabId(options?.tabId || null);
    const mountedRoot = options?.root
      || Shared.workspaceTabs?.getMountedRoot?.(targetTabId || null, 'venn')
      || global.Main?.components?.workspaces?.venn?.element
      || resolveVennRoot(targetTabId || null)
      || null;
    if (venn.ready && (!targetTabId || venn.__boundTabId === targetTabId)) {
      bindVennSessionForTab(targetTabId || venn.__boundTabId || null, { root: mountedRoot || state.ui.root || null, reason: options?.reason || 'venn-init-same-tab' }, { apply: false });
      syncVennSessionRefsFromActive();
      syncVennSessionManagersFromActive();
      debugLog('init skipped', { tabId: venn.__boundTabId || null });
      return;
    }
    if(venn.ready){
      captureVennSessionStateFromActive(activeVennSession, { reason: options?.reason || 'venn-init-rebind-capture' });
      debugLog('init rebinding', { previousTabId: venn.__boundTabId || null, targetTabId, reason: options?.reason || 'init' });
      venn.ready = false;
    }
    venn.__boundTabId = targetTabId || null;
    const initSession = bindVennSessionForTab(targetTabId || null, { root: mountedRoot || null, reason: options?.reason || 'venn-init-session' }, { apply: false });
    const freshState = createInitialState();
    Object.assign(state.ui, freshState.ui);
    Object.assign(state.analysis, freshState.analysis);
    Object.assign(state.persistence, freshState.persistence);
    debug('Debug: venn init state refreshed'); // Debug: state reset before init wiring
    debugLog('init start');
    const scheduleVennBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(venn, 'venn', refreshDiagram, { reason: 'venn-draw-frame' })
      : refreshDiagram;
    state.ui.scheduleDraw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'venn',
          debugLabel: 'venn',
          getTabId: () => venn.__boundTabId || null,
          scheduleRaw: scheduleVennBase
        })
      : scheduleVennBase;
    debug('Debug: venn scheduleDraw configured via tab-scoped lifecycle frame'); // Debug: scheduler setup
    initLayout(mountedRoot, { tabId: targetTabId || undefined, reason: options?.reason || 'venn-init' });
    state.ui.layout?.setScheduleDraw?.(options => scheduleActiveVennDraw(options && typeof options === 'object' ? options : {}));
    if (typeof state.ui.syncPanels === 'function') {
      debug('Debug: venn post-scheduler syncPanels'); // Debug: sync panels after scheduler setup
      state.ui.syncPanels({ skipSchedule: true });
    }
    bindUiToRoot(mountedRoot);
    mountVennExportControls();
    syncPlotMode(state.ui.plotType?.value || DEFAULT_PLOT_TYPE, { updateTitle: false });
    setActiveAnalysisResultsTab(state.analysis.activeResultsTab || 'go', { syncPayload: false });
    updateUpSetDotSizeOutput(state.ui.upset?.dotSize?.value);
    initializeLabelState();
    ensureEmptyPayloadTemplate();
    if(initSession){
      applyVennSessionStateToActive(initSession, { restoreEmptyPayload: true });
      syncVennSessionRefsFromActive(initSession);
      syncVennSessionManagersFromActive(initSession);
    }
    venn.ready = true;
    captureVennSessionStateFromActive(activeVennSession, { reason: options?.reason || 'venn-init-complete' });
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

  venn.captureRuntimeState = function captureRuntimeState(meta = {}){
    const requestedTabId = normalizeVennSessionTabId(meta?.tab || meta?.tabId || null, meta || {});
    const existingSession = requestedTabId
      ? getVennSession(requestedTabId, { ...(meta || {}), tabId: requestedTabId, reason: meta.reason || 'venn-runtime-capture-existing' }, { create: false })
      : null;
    if(requestedTabId && !canCaptureLiveVennPayloadForTab(requestedTabId)){
      const storedRuntime = cloneVennRuntimeSnapshot(existingSession?.state?.runtime || null);
      if(storedRuntime){
        rememberVennOwnedRuntimeRecord(requestedTabId, storedRuntime, {
          ...(meta || {}),
          tabId: requestedTabId,
          reason: meta.reason || 'capture-runtime-state-stored'
        });
        return Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(venn, storedRuntime, {
          ...(meta || {}),
          tabId: requestedTabId,
          reason: meta.reason || 'capture-runtime-state-stored'
        }) || storedRuntime;
      }
    }
    const session = bindVennSessionForTab(requestedTabId || meta?.tab || meta?.tabId || venn.__boundTabId || null, { ...(meta || {}), reason: meta.reason || 'venn-runtime-capture-bind' }, { apply: false });
    const snapshot = captureVennRuntimeStateSnapshot();
    if(session){
      session.state = createDefaultVennDurableState({ ...(session.state || {}), runtime: snapshot });
      session.results = resolveVennResultsForCapture(session);
      syncVennSessionManagersFromActive(session);
    }
    rememberVennOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, snapshot, {
      ...(meta || {}),
      reason: meta.reason || 'capture-runtime-state'
    });
    const ownedSnapshot = Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(venn, snapshot, {
      ...(meta || {}),
      reason: meta.reason || 'capture-runtime-state'
    }) || snapshot;
    debugLog('runtime state captured', {
      reason: meta.reason || 'capture-runtime-state',
      hasParsedLists: !!snapshot?.analysis?.lastParsedLists,
      speciesCacheSize: snapshot?.analysis?.speciesDetection?.cacheEntries?.length || 0
    });
    return ownedSnapshot;
  };

  venn.applyRuntimeState = function applyRuntimeState(snapshot, meta = {}){
    const resolvedSnapshot = resolveVennOwnedRuntimeSnapshot(snapshot, meta)
      || Shared.componentLifecycle?.resolveComponentRuntimeSnapshot?.(venn, snapshot, meta)
      || snapshot;
    if(!resolvedSnapshot || typeof resolvedSnapshot !== 'object'){
      return false;
    }
    const session = setVennSessionStateFromRuntimeRecord(resolvedSnapshot, meta);
    applyVennRuntimeStateSnapshot(resolvedSnapshot);
    if(session){
      activeVennSession = session;
      applyVennSessionStateToActive(session, { restoreEmptyPayload: false });
    }
    rememberVennOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'apply-runtime-state'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(venn, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'apply-runtime-state'
    });
    debugLog('runtime state applied', {
      reason: meta.reason || 'apply-runtime-state',
      hasSnapshot: !!resolvedSnapshot
    });
    return true;
  };

  function syncVennActivationState(meta = {}){
    bindVennSessionForTab(meta?.tab || meta?.tabId || venn.__boundTabId || null, { ...(meta || {}), root: resolveVennRoot(meta?.tab || meta?.tabId || null) || state.ui.root || null, reason: meta.reason || 'venn-activate-session' }, { apply: true });
    if(typeof state.ui.syncPanels === 'function'){
      state.ui.syncPanels({ skipSchedule: true });
      debugLog('tab activated panel sync', {
        reason: meta.reason || 'activate-tab',
        tabId: venn.__boundTabId || null
      });
    }
    scheduleActiveVennDraw({ reason: meta.reason || 'venn-activate-tab' });
    syncVennSessionRefsFromActive();
    syncVennSessionManagersFromActive();
  }

  venn.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: venn,
    componentKey: 'venn',
    resolveRoot: tabLike => Shared.workspaceTabs?.getMountedRoot?.(tabLike || null, 'venn')
      || resolveVennRoot(tabLike || null)
      || state.ui.root
      || null,
    setRoot: root => { bindUiToRoot(root || state.ui.root || null); },
    ensureBindings: (tabLike, meta) => ensureVennDomBindings(tabLike, meta),
    init: options => venn.init(options),
    afterReady: (_tabLike, meta = {}) => {
      if(!venn.ready){
        return;
      }
      bindVennSessionForTab(_tabLike || meta?.tabId || null, { ...(meta || {}), reason: meta?.reason || 'venn-activate-bind-session' }, { apply: true });
      applyExistingVennOwnedRuntimeRecord(_tabLike || meta?.tabId || null, { ...(meta || {}), reason: meta?.reason || 'venn-activate-apply-owned-runtime' });
      syncVennActivationState(meta);
    },
    getSentinel: () => state.ui.hotContainer || null
  }) || function activateTab(_tab, meta = {}){
    const targetTabId = normalizeVennTabId((_tab && typeof _tab === 'object' ? _tab.id : _tab) || meta?.tabId || null);
    const previousBoundTabId = venn.__boundTabId || null;
    const rebound = ensureVennDomBindings(targetTabId, meta || {});
    const currentRootTabId = getVennRootTabId(state.ui.root);
    const rootMismatch = !!targetTabId && !!currentRootTabId && String(currentRootTabId) !== String(targetTabId);
    venn.__boundTabId = targetTabId || venn.__boundTabId || null;
    if(!venn.ready || rootMismatch){
      debugLog('activateTab forcing init for target root', {
        previousBoundTabId,
        targetTabId,
        currentRootTabId: currentRootTabId || null,
        rebound,
        reason: meta?.reason || 'activate-tab'
      });
      venn.init({ tabId: targetTabId || null, reason: meta?.reason || 'activate-tab' });
    }else if(!rebound){
      const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(targetTabId || null, 'venn')
        || resolveVennRoot(targetTabId || null)
        || null;
      bindUiToRoot(mountedRoot);
    }
    syncVennActivationState({ ...meta, tabId: targetTabId || null });
    return true;
  };

  venn.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: venn,
    componentKey: 'venn',
    cancel: (_tab, meta = {}) => {
      captureVennSessionForDeactivation(_tab, meta);
      cancelPendingSpeciesDetection(meta.reason || 'deactivate-tab', {
        abortActive: true,
        resetIndicator: false
      });
    }
  }) || function deactivateTab(_tab, meta = {}){
    captureVennSessionForDeactivation(_tab, meta);
    cancelPendingSpeciesDetection(meta.reason || 'deactivate-tab', {
      abortActive: true,
      resetIndicator: false
    });
    debugLog('tab deactivated', {
      reason: meta.reason || 'deactivate-tab'
    });
    return true;
  };

  venn.disposeTab = function disposeTab(_tab, meta = {}){
    const tabId = normalizeVennSessionTabId(_tab || meta?.tabId || null, meta);
    if(tabId){
      vennSessionsByTabId.delete(tabId);
      if(activeVennSession?.tabId === tabId){
        activeVennSession = null;
      }
    }
    debugLog('tab disposed', {
      reason: meta.reason || 'dispose-tab'
    });
    return true;
  };

  venn.__getState = function __getState(){
    return state;
  };

  venn.__testHooks = Object.assign({}, venn.__testHooks, {
    state,
    resolveDrawableFrame: targetEl => resolveVennDrawableFrame(targetEl),
    populateRegion,
    clearAnalysis,
    getSession: tabId => getVennSession(tabId, { tabId, reason: 'test-get-session' }, { create: false }),
    scheduleDrawForSession: (session, options) => scheduleVennDrawForSession(session, options),
    captureRuntimeState: meta => venn.captureRuntimeState(meta),
    applyRuntimeState: (snapshot, meta) => venn.applyRuntimeState(snapshot, meta)
  });

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

  function captureSvgRootState(svg){
    if(!svg){
      return null;
    }
    const attributeNames = ['width', 'height', 'viewBox', 'preserveAspectRatio', 'font-family', 'color', 'font-size', 'aria-label'];
    const styleNames = ['display'];
    const attributes = {};
    const style = {};
    attributeNames.forEach(name => {
      const value = typeof svg.getAttribute === 'function' ? svg.getAttribute(name) : null;
      if(typeof value === 'string' && value.length){
        attributes[name] = value;
      }
    });
    styleNames.forEach(name => {
      const value = svg.style?.[name];
      if(typeof value === 'string' && value.length){
        style[name] = value;
      }
    });
    return {
      attributes: Object.keys(attributes).length ? attributes : null,
      style: Object.keys(style).length ? style : null
    };
  }

  function restoreSvgRootState(svg, snapshot){
    if(!svg){
      return false;
    }
    const attributeNames = ['width', 'height', 'viewBox', 'preserveAspectRatio', 'font-family', 'color', 'font-size', 'aria-label'];
    const styleNames = ['display'];
    attributeNames.forEach(name => {
      try{
        if(typeof svg.removeAttribute === 'function'){
          svg.removeAttribute(name);
        }
      }catch(err){
        console.error('venn restore svg attribute reset error', { name, err });
      }
    });
    styleNames.forEach(name => {
      try{
        if(svg.style){
          svg.style[name] = '';
        }
      }catch(err){
        console.error('venn restore svg style reset error', { name, err });
      }
    });
    if(!snapshot || typeof snapshot !== 'object'){
      return true;
    }
    const attributes = snapshot.attributes && typeof snapshot.attributes === 'object'
      ? snapshot.attributes
      : null;
    const style = snapshot.style && typeof snapshot.style === 'object'
      ? snapshot.style
      : null;
    if(attributes){
      Object.entries(attributes).forEach(([name, value]) => {
        try{
          if(value == null || value === ''){
            svg.removeAttribute?.(name);
          }else{
            svg.setAttribute?.(name, String(value));
          }
        }catch(err){
          console.error('venn restore svg attribute error', { name, value, err });
        }
      });
    }
    if(style){
      Object.entries(style).forEach(([name, value]) => {
        try{
          if(svg.style){
            svg.style[name] = value || '';
          }
        }catch(err){
          console.error('venn restore svg style error', { name, value, err });
        }
      });
    }
    return true;
  }

  function mountVennExportControls(){
    const exporter = Shared.exporter;
    if(!exporter){
      debug('Debug: venn export controls unavailable', { hasExporter: false });
      return false;
    }
    const root = state.ui.root || resolveVennRoot(venn.__boundTabId || null) || null;
    if(!root || root === global.document || typeof root.querySelector !== 'function'){
      debug('Debug: venn export controls unavailable', { hasExporter: true, hasRoot: false });
      return false;
    }
    const exportHost = state.ui.vennExportControls || root?.querySelector?.('#vennExportControls') || null;
    const stage = state.ui.stage || root?.querySelector?.('#stage') || null;
    const goChartExport = state.ui.goChartExport || root?.querySelector?.('#goChartExport') || null;
    const stringNetworkExport = state.ui.stringNetworkExport || root?.querySelector?.('#stringNetworkExport') || null;
    if(typeof exporter.mountSvgControls === 'function' && exportHost){
      exporter.mountSvgControls({
        container: exportHost,
        getSvg: () => stage || state.ui.stage || root?.querySelector?.('#stage') || null,
        fileName: 'venn',
        contextLabel: 'venn-export'
      });
      debug('Debug: venn export controls mounted', { hasExporter: true });
    }else{
      debug('Debug: venn export controls unavailable', { hasExporter: true, hasHost: !!exportHost });
    }
    if(typeof exporter.mountSvgControls === 'function' && goChartExport){
      exporter.mountSvgControls({
        container: goChartExport,
        getSvg: () => state.ui.goChart || root.querySelector('#goChart'),
        fileName: 'go_chart',
        contextLabel: 'go-chart'
      });
      debug('Debug: go chart export controls mounted', { hasExporter: true });
    }else{
      debug('Debug: go chart export controls unavailable', { hasExporter: true, hasHost: !!goChartExport });
    }
    if(typeof exporter.mountSvgStringControls === 'function' && stringNetworkExport){
      exporter.mountSvgStringControls({
        container: stringNetworkExport,
        getSvgString: () => buildStringNetworkSvgString(),
        fileName: 'string_network',
        contextLabel: 'string-export'
      });
      debug('Debug: string export controls mounted', { hasExporter: true });
    }else{
      debug('Debug: string export controls unavailable', { hasExporter: true, hasHost: !!stringNetworkExport });
    }
    return !!exportHost;
  }

  venn.captureRenderCache = function captureRenderCache(meta = {}){
    const targetTabId = normalizeVennTabId(meta?.tabId || null);
    ensureVennDomBindings(targetTabId);
    const rootTabId = getVennRootTabId(state.ui.root);
    if(targetTabId && rootTabId && String(rootTabId) !== String(targetTabId)){
      console.warn('venn render cache capture skipped stale root', { targetTabId, rootTabId });
      return null;
    }
    const stageCache = detachChildren(state.ui.stage);
    const emptyNotice = captureVennEmptyNoticeState();
    const stageRootState = captureSvgRootState(state.ui.stage);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: venn render cache captured', {
        stageNodes: stageCache?.count || 0,
        hasStageRootState: !!stageRootState
      });
    }
    return {
      stage: stageCache,
      emptyNotice,
      stageRootState,
      graphOnly: true
    };
  };

  venn.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    return Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'venn',
      graph: { selectors: ['#stage', 'svg', 'canvas'], markupPattern: /(<svg\b|id=["']stage["']|<canvas\b)/i },
      requiredSections: [],
      requireGraph: true
    }) ?? !!cache;
  };

  venn.isIdleForSnapshot = function isIdleForSnapshot(){
    const detection = state.analysis?.speciesDetection || null;
    return !(detection?.pendingTimeoutId || detection?.active);
  };

  venn.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(venn, { ...meta, componentKey: 'venn' })
      || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  venn.restoreRenderCache = function restoreRenderCache(cache, _meta = {}){
    if(!cache){ return false; }
    restoreSvgRootState(state.ui.stage, cache.stageRootState);
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.stage || cache?.plot || cache?.preview || cache?.graph || cache?.svg;
    const restoredStage = restoreChildren(state.ui.stage, graphCachePayload);
    const restoredEmptyNotice = applyVennEmptyNoticeState(cache.emptyNotice, {
      hideWhenMissing: !!restoredStage
    });
    const inputs = state.ui.inputs;
    if(inputs){
      const labels = getCurrentVennLabelMap();
      updateCountLabels(labels);
      updateColorLabels(labels);
      if(!state.analysis.lastCounts){
        ensureVennAnalysisStateFromData('render-cache-restore');
      }
      if(getActivePlotType() === 'upset' && (!state.analysis.lastUpSetRegionMap || !state.analysis.lastUpSetIntersections)){
        rebuildUpSetAnalysisStateFromData('render-cache-restore');
      }
      if(state.analysis.lastCounts){
        refreshCounts(state.analysis.lastCounts);
        if (getActivePlotType() !== 'upset') {
          updateRegionSelect(labels, state.analysis.lastCounts);
        }
      }
    }
    applyVennStageTheme(state.ui.stage);
    const svgBoxControlsReady = ensureVennSvgBoxControls('render-cache-restore');
    const controlsMounted = mountVennExportControls();
    const ownerSession = getActiveVennSessionForState();
    if(ownerSession?.results){
      applyVennResultsStateToActive(ownerSession.results);
    }
    const restored = restoredStage || restoredEmptyNotice;
    setActiveAnalysisResultsTab(state.analysis.activeResultsTab || 'go', { syncPayload: false });
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: venn render cache restored', {
        restored,
        stage: restoredStage,
        emptyNotice: restoredEmptyNotice,
        svgBoxControlsReady,
        controlsMounted,
        stageRootState: !!cache.stageRootState
      });
    }
    return restored;
  };

  venn.draw = function draw(meta = {}) {
    try {
      const nextReason = meta?.reason || 'venn-draw';
      if(Shared.componentLifecycle?.shouldSuppressDraw?.('venn', { ...(meta || {}), tabId: meta?.tabId || venn.__boundTabId || null, reason: nextReason })){
        debug('Debug: venn draw suppressed by lifecycle', { reason: nextReason, tabId: meta?.tabId || venn.__boundTabId || null });
        Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'venn', tabId: meta?.tabId || venn.__boundTabId || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'venn.draw' } });
        return;
      }
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'venn', tabId: meta?.tabId || venn.__boundTabId || null, action: 'draw-executed', reason: nextReason, details: { source: 'venn.draw' } });
      const targetTabId = normalizeVennTabId(meta?.tabId || null);
      ensureVennDomBindings(targetTabId);
      const rootTabId = getVennRootTabId(state.ui.root);
      if(targetTabId && rootTabId && String(rootTabId) !== String(targetTabId)){
        console.warn('venn.draw skipped stale root', {
          targetTabId,
          rootTabId,
          reason: meta?.reason || 'draw'
        });
        return;
      }
      refreshDiagram();
    } catch (e) {
      console.error('venn.draw error', e);
    }
  };

  function resolveVennPreviewSourceSvg(tab){
    const targetTabId = normalizeVennTabId(tab?.id || tab || null);
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(targetTabId || null, 'venn')
      || resolveVennRoot(targetTabId || null)
      || null;
    if(!mountedRoot || typeof mountedRoot.querySelector !== 'function'){
      const stageRootTabId = getVennRootTabId(state.ui.stage?.closest?.('[data-workspace-tab-id]') || state.ui.root || null);
      return (!targetTabId || !stageRootTabId || String(stageRootTabId) === String(targetTabId)) ? (state.ui.stage || null) : null;
    }
    return mountedRoot.querySelector('#vennPlot #stage')
      || mountedRoot.querySelector('#stage')
      || state.ui.stage
      || null;
  }

  venn.getThumbnailSvg = function getThumbnailSvg(tab){
    return resolveVennPreviewSourceSvg(tab);
  };

  venn.getPreviewSvg = function getPreviewSvg(tab){
    return resolveVennPreviewSourceSvg(tab);
  };

  venn.ensure = function ensure(options = {}) {
    const targetTabId = normalizeVennTabId(options?.tabId || null);
    if(ensureVennDomBindings(targetTabId, options || {})){
      return;
    }
    if (!venn.ready) venn.init({ tabId: targetTabId || null, reason: options?.reason || 'ensure' });
  };


  Shared.componentLifecycle?.installInternalStateBridge?.(venn, {
    componentKey: 'venn',
    targets: [
      { key: 'state', get: () => state, excludeKeys: ['hot', 'root', 'ui', 'analysis', 'derivedCache'] },
      { key: 'notesState', get: () => notesState, excludeKeys: ['control'] }
    ]
  });
})(window);
