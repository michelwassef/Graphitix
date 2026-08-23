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
  const svgGeometry = Shared.svgGeometry = Shared.svgGeometry || {};
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
  if(typeof svgGeometry.buildCompoundLinePath !== 'function' && typeof require === 'function'){
    try{
      require('../shared/svgGeometry.js');
    }catch(err){
      debug('Debug: venn component svgGeometry helper require failed', { message: err?.message || String(err) });
    }
  }
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
  const VENN_DIAGRAM_LAYOUT = Object.freeze({
    outerPaddingPx: chartStyle.resolveGraphHorizontalEdgePadding
      ? chartStyle.resolveGraphHorizontalEdgePadding()
      : 8,
    titleGapEm: 0.8,
    labelGapEm: 0.65,
    collisionGapEm: 0.28,
    verticalBias: 0.58,
    maxLabelOffsetRatio: 0.42,
    overflowAreaEpsilon: 1e-7,
    score: Object.freeze({
      horizontalOffsetWeight: 0.15,
      nonPreferredSidePenalty: 1800,
      scaleReward: 5000
    })
  });
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
    axisWidth: 1,
    xMajorTickLength: null,
    yMajorTickLength: null
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
  const VENN_LEGACY_TABLE_COLUMNS = Object.freeze([
    Object.freeze({ labelKey: 'labelA', listKey: 'listA' }),
    Object.freeze({ labelKey: 'labelB', listKey: 'listB' }),
    Object.freeze({ labelKey: 'labelC', listKey: 'listC' })
  ]);

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
      tabId: getVennProjectionTabId() || null
    }) === true;
    if(typeof formatter === 'function'){
      return formatter(value, { scientific, forceScientific: scientific });
    }
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    const numeric = Number(value);
    if(scientific){ return Shared.formatters?.formatScientificNumber?.(numeric, { fractionalDigits: 5 }) || String(numeric); }
    return numeric >= 0 && numeric <= 0.0001 ? '<0.0001' : numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  };

  const formatSharedPExpression = value => {
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.formatPValueExpression === 'function'){
      return reporting.formatPValueExpression(value, {
        label: 'p',
        target: state.ui.significanceResults || global.document?.getElementById?.('significanceResults') || null,
        tabId: getVennProjectionTabId() || null
      });
    }
    const display = String(formatSharedPValue(value));
    const match = /^(<=|>=|≤|≥|<|>)\s*(.*)$/.exec(display);
    return match ? `p ${match[1]} ${match[2]}` : `p = ${display}`;
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
    const activeTabId = String(getVennProjectionTabId() || '').trim();
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
    const activeTabId = normalizeVennTabId(getVennProjectionTabId() || null);
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

  function syncVennAspectControls(reason, options = {}) {
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
      const svgBox = state.ui?.svgBox || lockRatioCheckbox.closest('.svgbox');
      const resizerApi = svgBox?.__sharedResizableBoxApi;
      if (enforceLockRatio) {
        resizerApi?.setAspectLocked?.(true, { reason: 'venn-forced-lock-ratio' });
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
        const savedAspectLock = options.restoreSavedPreference === true
          ? getVennSavedAspectLockPreference()
          : null;
        const shouldProjectPreference = restoreValue !== null
          || savedAspectLock !== null
          || options.applyUpSetDefault === true;
        if (shouldProjectPreference) {
          const targetValue = restoreValue !== null
            ? restoreValue
            : (savedAspectLock !== null ? savedAspectLock : false);
          if (restoreValue !== null) {
            setVennLockRatioPrevious(null);
          }
          resizerApi?.setAspectLocked?.(targetValue, { reason: 'venn-restore-lock-ratio' });
        }
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
    const page = state.ui?.root || resolveVennRoot(getVennProjectionTabId() || null);
    const previous = normalizePlotType(page?.dataset?.plot || DEFAULT_PLOT_TYPE);
    const modeChanged = previous !== normalized;
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
    syncVennSetLimitWarning();
    if (options.updateTitle !== false) {
      const swapped = maybeSwapDefaultTitle(normalized);
      if (swapped) {
        debugLog('plot type title swap', { plot: normalized });
      }
    }
    syncVennAspectControls('plot-mode-sync', {
      restoreSavedPreference: options.restoreAspectLock === true,
      applyUpSetDefault: normalized === 'upset'
        && modeChanged
        && options.restoreAspectLock !== true
    });
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
        pendingTabId: null,
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

  function cancelPendingSpeciesDetection(
    reason,
    { abortActive = false, resetIndicator = false, tabId = null } = {}
  ) {
    const detection = getSpeciesDetectionState();
    const targetTabId = normalizeVennTabId(tabId || null);
    const pendingTabId = normalizeVennTabId(detection.pendingTabId || null);
    const pendingMatches = !targetTabId || !pendingTabId || pendingTabId === targetTabId;
    if (detection.pendingTimeoutId && pendingMatches) {
      Shared.componentLifecycle?.clearComponentTimeout?.(venn, detection.pendingTimeoutId);
      detection.pendingTimeoutId = null;
      detection.pendingReason = null;
      detection.pendingTabId = null;
      debug('Debug: venn species detect pending cleared', {
        reason,
        tabId: pendingTabId || targetTabId || null
      }); // Debug: pending timer cleared
    }
    if (pendingMatches) {
      const pendingOwner = pendingTabId
        ? getVennSession(pendingTabId, { tabId: pendingTabId, reason: reason || 'species-detection-cancel' }, { create: false })
        : getActiveVennSessionForState();
      if (pendingOwner) {
        pendingOwner.timers.pendingSpeciesDetection = null;
        pendingOwner.updatedAt = Date.now();
      }
    }

    const activeTabId = normalizeVennTabId(detection.active?.tabId || null);
    const activeMatches = !targetTabId || !activeTabId || activeTabId === targetTabId;
    if (abortActive && detection.active?.controller && activeMatches) {
      const activeOwner = activeTabId
        ? getVennSession(activeTabId, { tabId: activeTabId, reason: reason || 'species-detection-abort' }, { create: false })
        : getActiveVennSessionForState();
      try {
        detection.active.controller.abort(reason || 'cancelled');
      } catch (err) { /* noop */ }
      if (activeOwner?.cache?.asyncRequests) {
        activeOwner.cache.asyncRequests.species = null;
        activeOwner.updatedAt = Date.now();
      }
      debug('Debug: venn species detect active abort requested', {
        reason,
        tabId: activeTabId || activeOwner?.tabId || targetTabId || null
      }); // Debug: abort requested
    }
    if (!detection.pendingTimeoutId && !detection.active) {
      detection.pendingReason = null;
      detection.pendingTabId = null;
    }
    if (resetIndicator && activeMatches) {
      setSpeciesIndicator(null);
    }
  }

  function clearVennPendingDrawState(session = null, reason = 'venn-draw-pending-clear') {
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if (!owner) {
      return false;
    }
    const hadPending = !!(owner.state.drawPending || owner.timers.pendingDrawOptions);
    owner.state.drawPending = false;
    owner.timers.pendingDrawOptions = null;
    owner.updatedAt = Date.now();
    if (isVennSessionActiveForModuleState(owner)) {
      state.drawPending = false;
    }
    if (hadPending) {
      debug('Debug: venn pending draw state cleared', {
        tabId: owner.tabId || null,
        reason
      });
    }
    return hadPending;
  }

  function collectVennPayloadGenes(payload) {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const genes = [];
    ['listA', 'listB', 'listC'].forEach(key => {
      String(data[key] || '').split(/\r?\n/).forEach(raw => {
        const gene = raw.trim();
        if (gene) {
          genes.push(gene);
        }
      });
    });
    return genes;
  }

  function primeVennSpeciesAutoDetectionBaseline(session = null, payload = null, reason = 'venn-species-restore-baseline') {
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if (!owner) {
      return false;
    }
    const storedPayload = payload || owner.state?.snapshot?.payload || getStoredVennPayloadForTab(owner.tabId) || null;
    const speciesValue = String(storedPayload?.analysis?.speciesValue || owner.results?.speciesValue || '').trim();
    owner.cache.suppressSpeciesAutoDetection = !!speciesValue;
    owner.cache.speciesAutoDetectionBaselineSignature = speciesValue
      ? computeGeneSignature(collectVennPayloadGenes(storedPayload))
      : null;
    owner.updatedAt = Date.now();
    debug('Debug: venn species auto-detection baseline primed', {
      tabId: owner.tabId || null,
      reason,
      suppressed: owner.cache.suppressSpeciesAutoDetection,
      signature: owner.cache.speciesAutoDetectionBaselineSignature || null
    });
    return owner.cache.suppressSpeciesAutoDetection;
  }

  function shouldSuppressVennSpeciesRecognition(session = null) {
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    const cache = owner?.cache || null;
    if (!cache?.suppressSpeciesAutoDetection) {
      return false;
    }
    const currentSignature = computeGeneSignature(getAllGenes());
    const baselineSignature = String(cache.speciesAutoDetectionBaselineSignature || '');
    if (currentSignature === baselineSignature) {
      return true;
    }
    cache.suppressSpeciesAutoDetection = false;
    cache.speciesAutoDetectionBaselineSignature = null;
    owner.updatedAt = Date.now();
    debug('Debug: venn species auto-detection suppression released by input change', {
      tabId: owner.tabId || null,
      previousSignature: baselineSignature || null,
      currentSignature
    });
    return false;
  }

  function isManualSpeciesDetectionReason(reason) {
    const normalized = String(reason || '').toLowerCase();
    return normalized.includes('manual');
  }

  function cancelAutomaticSpeciesDetectionForSnapshot(meta = {}) {
    const detection = getSpeciesDetectionState();
    const targetTabId = normalizeVennTabId(meta?.tabId || meta?.tab || getVennProjectionTabId() || null);
    const pendingTabId = normalizeVennTabId(detection.pendingTabId || null);
    const activeTabId = normalizeVennTabId(detection.active?.tabId || null);
    const pendingManual = isManualSpeciesDetectionReason(detection.pendingReason);
    const activeManual = isManualSpeciesDetectionReason(detection.active?.reason);
    const pendingBelongsToTarget = !targetTabId || !pendingTabId || pendingTabId === targetTabId;
    const activeBelongsToTarget = !targetTabId || !activeTabId || activeTabId === targetTabId;
    if (pendingManual || activeManual || (!pendingBelongsToTarget && !activeBelongsToTarget)) {
      return false;
    }
    const hadAutomaticWork = !!(
      (detection.pendingTimeoutId && pendingBelongsToTarget)
      || (detection.active && activeBelongsToTarget)
    );
    if (hadAutomaticWork) {
      cancelPendingSpeciesDetection(meta.reason || 'snapshot-ready', {
        abortActive: true,
        resetIndicator: false,
        tabId: targetTabId
      });
      detection.pendingReason = null;
      if (activeBelongsToTarget) {
        detection.active = null;
      }
      debug('Debug: venn automatic species detection cancelled for snapshot', {
        tabId: targetTabId || null,
        reason: meta.reason || 'snapshot-ready'
      });
    }
    return hadAutomaticWork;
  }

  function scheduleSpeciesRecognition(reason = 'auto-detect') {
    const detection = getSpeciesDetectionState();
    const inputs = state.ui.inputs;
    if (!inputs) {
      return false;
    }
    const activeSession = getActiveVennSessionForState();
    if (isProjectingVennSession()) {
      debug('Debug: venn species detect scheduling suppressed during session projection', { reason });
      return false;
    }
    if (!isManualSpeciesDetectionReason(reason) && shouldSuppressVennSpeciesRecognition(activeSession)) {
      debug('Debug: venn species detect scheduling suppressed for restored input baseline', {
        reason,
        tabId: activeSession?.tabId || null
      });
      return false;
    }
    if (!hasListContent(inputs)) {
      cancelPendingSpeciesDetection(reason, { abortActive: true, resetIndicator: true });
      debug('Debug: venn species detect skipped scheduling', { reason, hasLists: false }); // Debug: schedule skipped
      return false;
    }
    const tabId = getVennProjectionTabId() || null;
    if (!tabId || typeof Shared.componentLifecycle?.createAsyncScope !== 'function') {
      console.warn('venn species detection scheduling skipped without explicit tab async scope', { reason, tabId });
      return false;
    }
    const owner = getVennCallbackOwner({ tabId, reason: `species-detection:${reason}` });
    if(!isVennCallbackOwnerActive(owner)){
      return false;
    }
    const delay = Number.isFinite(detection.delayMs) ? detection.delayMs : 1200;
    if (detection.pendingTimeoutId) {
      cancelPendingSpeciesDetection('species-detection-superseded', {
        tabId: detection.pendingTabId || null
      });
    }
    const scope = venn.__asyncScope || Shared.componentLifecycle.createAsyncScope('venn');
    venn.__asyncScope = scope;
    detection.pendingReason = reason;
    detection.pendingTabId = tabId;
    detection.pendingTimeoutId = scope.setTimeout({
      tabId,
      reason: `species-detection:${reason}`
    }, () => {
      detection.pendingTimeoutId = null;
      detection.pendingReason = null;
      detection.pendingTabId = null;
      const ownerSession = getVennSession(tabId, { tabId, reason: `species-detection:${reason}` }, { create: false });
      if (ownerSession) {
        ownerSession.timers.pendingSpeciesDetection = null;
        ownerSession.updatedAt = Date.now();
      }
      if(!isVennCallbackOwnerActive(owner)){
        debug('Debug: venn species detect schedule skipped stale owner', { reason, tabId });
        return;
      }
      recognizeSpeciesFromInput({ reason: `scheduled-${reason}`, owner }).catch(err => {
        if (err && err.name === 'AbortError') {
          debug('Debug: venn species detect schedule aborted', { reason }); // Debug: scheduled detection aborted
        } else if (err) {
          console.warn('venn species detection schedule error', err);
        }
      });
    }, delay);
    if (activeSession) {
      activeSession.timers.pendingSpeciesDetection = detection.pendingTimeoutId || null;
      activeSession.updatedAt = Date.now();
    }
    debug('Debug: venn species detect scheduled', { reason, delayMs: delay }); // Debug: detection scheduled
    return true;
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
        const wrapped = event => runVennEventOwnerCallback(event, label, owner => cfg.handler(event, owner));
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
   * @property {HTMLElement|null} setLimitWarning - Inline warning shown when Venn mode ignores data in columns beyond the first three.
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
        setLimitWarning: null,
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
        lastAnalysisTableSignature: null,
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
          pendingTabId: null,
          active: null,
          delayMs: 1200
        },
        upsetAxis: {
          color: DEFAULT_UPSET_SETTINGS.axisColor,
          width: DEFAULT_UPSET_SETTINGS.axisWidth,
          xMajorTickLength: DEFAULT_UPSET_SETTINGS.xMajorTickLength,
          yMajorTickLength: DEFAULT_UPSET_SETTINGS.yMajorTickLength
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
  // Transient visible-DOM projection bridge. Durable state belongs to the owner session map.
  let projectedVennSession = null;

  // Compatibility bridge: visible-DOM projection tab id. Delete after every projection entrypoint receives explicit owner tab metadata.
  function getVennProjectionTabId(){
    return Shared.componentLifecycle?.resolveProjectionTabId?.(venn, projectedVennSession) || String(venn.__boundTabId || projectedVennSession?.tabId || '').trim();
  }

  function getVennProjectionSession(meta = {}, options = {}){
    const tabId = getVennProjectionTabId();
    if(!tabId){ return null; }
    return getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-projection-session' }, { create: options.create !== false });
  }

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
      || getVennProjectionTabId()
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

  function hasVennAnalysisProjectionBaseline(analysis = {}){
    const source = analysis && typeof analysis === 'object' ? analysis : {};
    return hasVennGoResultsState(source)
      || hasVennStringResultsState(source)
      || hasVennSignificanceResultsState(source)
      || String(source.regionSelectValue || '').trim().length > 0
      || String(source.totalGenes || '').trim().length > 0
      || String(source.speciesValue || '').trim().length > 0;
  }

  function setVennAnalysisProjectionBaselinePending(session = null, analysis = {}, reason = 'analysis-projection-baseline'){
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if(!owner?.cache){ return false; }
    const pending = hasVennAnalysisProjectionBaseline(analysis);
    owner.cache.analysisProjectionBaselinePending = pending;
    owner.updatedAt = Date.now();
    debugLog('venn analysis projection baseline updated', { tabId: owner.tabId || null, pending, reason });
    return pending;
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
      setLimitWarning: null,
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
        diagramLayoutSignature: null,
        diagramLayout: null,
        upsetRenderModel: null,
        upsetTextMeasurements: new Map(),
        asyncRequests: {
          go: null,
          string: null,
          species: null,
          stringOverlay: null
        },
        autoAnalysisRefreshTimer: null,
        autoAnalysisRefreshToken: null,
        suppressAnalysisAutoRefresh: false,
        analysisAutoRefreshBaselineSignature: null,
        suppressSpeciesAutoDetection: false,
        speciesAutoDetectionBaselineSignature: null,
        analysisProjectionBaselinePending: false
      },
      listeners: new Map(),
      timers: {
        scheduleDraw: null,
        pendingDrawOptions: null,
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
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'diagramLayoutSignature')){ session.cache.diagramLayoutSignature = null; }
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'diagramLayout')){ session.cache.diagramLayout = null; }
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'upsetRenderModel')){ session.cache.upsetRenderModel = null; }
    session.cache.upsetTextMeasurements = session.cache.upsetTextMeasurements instanceof Map
      ? session.cache.upsetTextMeasurements
      : new Map();
    if(!session.cache.asyncRequests || typeof session.cache.asyncRequests !== 'object'){
      session.cache.asyncRequests = { go: null, string: null, species: null, stringOverlay: null };
    }
    if(!Object.prototype.hasOwnProperty.call(session.cache.asyncRequests, 'species')){
      session.cache.asyncRequests.species = null;
    }
    if(!Object.prototype.hasOwnProperty.call(session.cache.asyncRequests, 'stringOverlay')){
      session.cache.asyncRequests.stringOverlay = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'autoAnalysisRefreshTimer')) {
      session.cache.autoAnalysisRefreshTimer = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'autoAnalysisRefreshToken')) {
      session.cache.autoAnalysisRefreshToken = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'suppressAnalysisAutoRefresh')) {
      session.cache.suppressAnalysisAutoRefresh = false;
    }
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'analysisAutoRefreshBaselineSignature')) {
      session.cache.analysisAutoRefreshBaselineSignature = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'suppressSpeciesAutoDetection')) {
      session.cache.suppressSpeciesAutoDetection = false;
    }
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'speciesAutoDetectionBaselineSignature')) {
      session.cache.speciesAutoDetectionBaselineSignature = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'analysisProjectionBaselinePending')) {
      session.cache.analysisProjectionBaselinePending = false;
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
    return String(Shared.componentLifecycle?.resolveWorkspaceActiveTabId?.('venn') || '').trim();
  }

  function getActiveVennSessionForState(){
    return Shared.componentLifecycle?.resolveActiveSessionForComponent?.({
      componentKey: 'venn',
      component: venn,
      projectedSession: projectedVennSession,
      getSession: getVennSession,
      ensureSession: ensureVennSessionOwnershipShape,
      create: true,
      reason: 'active-venn-session'
    }) || null;
  }

  function getVennTabIdFromTarget(target = null){
    return String(Shared.componentLifecycle?.resolveTabIdFromTarget?.(target) || '').trim();
  }

  function getVennActiveTabId(){
    return String(Shared.componentLifecycle?.resolveActiveComponentTabId?.('venn', venn, projectedVennSession) || '').trim();
  }

  function getVennCallbackOwner(meta = {}){
    const target = meta?.target || meta?.event?.currentTarget || meta?.event?.target || null;
    const tabId = String(meta?.tabId || getVennTabIdFromTarget(target) || getVennActiveTabId() || '').trim();
    const session = tabId
      ? getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-callback-owner' }, { create: true })
      : getActiveVennSessionForState();
    const resolvedTabId = String(tabId || session?.tabId || '').trim();
    const workspaceMeta = resolvedTabId && typeof Shared.workspaceTabs?.buildSessionMeta === 'function'
      ? Shared.workspaceTabs.buildSessionMeta('venn', {
          tabId: resolvedTabId,
          reason: meta?.reason || 'venn-callback-owner'
        })
      : null;
    const sessionGeneration = Number(workspaceMeta?.sessionGeneration);
    return {
      tabId: resolvedTabId,
      session,
      sessionGeneration: Number.isFinite(sessionGeneration) && sessionGeneration > 0 ? sessionGeneration : 0
    };
  }

  function isVennCallbackOwnerCurrent(owner = null){
    const ownerTabId = String(owner?.tabId || owner?.session?.tabId || '').trim();
    if(!ownerTabId || !owner?.session){
      return false;
    }
    const currentSession = getVennSession(ownerTabId, {
      tabId: ownerTabId,
      reason: 'venn-callback-owner-current'
    }, { create: false });
    if(!currentSession || currentSession !== owner.session){
      return false;
    }
    const expectedGeneration = Number(owner.sessionGeneration);
    if(Number.isFinite(expectedGeneration) && expectedGeneration > 0 && typeof Shared.workspaceTabs?.buildSessionMeta === 'function'){
      const currentMeta = Shared.workspaceTabs.buildSessionMeta('venn', {
        tabId: ownerTabId,
        reason: 'venn-callback-owner-current'
      });
      const currentGeneration = Number(currentMeta?.sessionGeneration);
      if(!Number.isFinite(currentGeneration) || currentGeneration !== expectedGeneration){
        return false;
      }
    }
    return !!getVennTabById(ownerTabId);
  }

  function isVennCallbackOwnerActive(owner = null){
    const ownerTabId = String(owner?.tabId || owner?.session?.tabId || '').trim();
    return !!(
      ownerTabId
      && isVennCallbackOwnerCurrent(owner)
      && owner?.session
      && isVennSessionActiveForModuleState(owner.session)
    );
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
    if(!session || typeof session !== 'object' || !String(session.tabId || '').trim()){ return false; }
    return Shared.componentLifecycle?.canOwnerUseLiveProjection?.('venn', session, {
      component: venn,
      projectedSession: projectedVennSession,
      session,
      root: state.ui.root || null
    }) === true;
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
    const activeTabId = getVennProjectionTabId() || activeSession?.tabId || null;
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      return getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-deactivate-target-session' }, { create: false });
    }
    return activeSession || (tabId ? getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-deactivate-active-session' }, { create: false }) : null);
  }

  function captureVennSessionForDeactivation(tab, meta = {}){
    const tabId = getVennDeactivationTabId(tab, meta);
    const activeSession = getActiveVennSessionForState();
    const activeTabId = getVennProjectionTabId() || activeSession?.tabId || null;
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
    const shaped = ensureVennSessionOwnershipShape(session || projectedVennSession || getActiveVennSessionForState());
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
      setLimitWarning: state.ui.setLimitWarning || null,
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
    const shaped = ensureVennSessionOwnershipShape(session || projectedVennSession || getActiveVennSessionForState());
    if(!shaped){ return null; }
    shaped.managers.hot = state.ui.hot || shaped.managers.hot || null;
    shaped.managers.layout = state.ui.layout || shaped.managers.layout || null;
    shaped.managers.fileHandle = state.persistence.fileHandle ?? null;
    shaped.timers.scheduleDraw = state.ui.scheduleDraw || shaped.timers.scheduleDraw || null;
    shaped.timers.pendingSpeciesDetection = state.analysis.speciesDetection?.pendingTimeoutId || null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  const VENN_DRAW_OPTION_LIVE_KEYS = new Set([
    'tab', 'event', 'target', 'currentTarget', 'srcElement', 'ownerDocument',
    'session', 'root', 'hot', 'hotInstance', 'manager', 'dataViews', 'scheduler'
  ]);

  function isVennSerializableRecord(value){
    if(!value || typeof value !== 'object'){
      return false;
    }
    const tag = Object.prototype.toString.call(value);
    return tag === '[object Object]';
  }

  function sanitizeVennDrawValue(value, seen = new WeakSet(), depth = 0){
    if(value == null){
      return value;
    }
    const type = typeof value;
    if(type === 'string' || type === 'boolean'){
      return value;
    }
    if(type === 'number'){
      return Number.isFinite(value) ? value : undefined;
    }
    if(type === 'bigint'){
      return value.toString();
    }
    if(type === 'function' || type === 'symbol' || type === 'undefined' || depth > 8){
      return undefined;
    }
    if(typeof value.nodeType === 'number'
      || typeof value.addEventListener === 'function'
      || typeof value.preventDefault === 'function'
      || typeof value.stopPropagation === 'function'
      || value.window === value
      || value.document === value
      || value.ownerDocument){
      return undefined;
    }
    if(seen.has(value)){
      return undefined;
    }
    seen.add(value);
    if(Array.isArray(value)){
      const sanitizedArray = value
        .map(item => sanitizeVennDrawValue(item, seen, depth + 1))
        .filter(item => item !== undefined);
      seen.delete(value);
      return sanitizedArray;
    }
    if(!isVennSerializableRecord(value)){
      seen.delete(value);
      return undefined;
    }
    const sanitizedRecord = {};
    Object.keys(value).forEach(key => {
      if(VENN_DRAW_OPTION_LIVE_KEYS.has(key)){
        return;
      }
      const sanitized = sanitizeVennDrawValue(value[key], seen, depth + 1);
      if(sanitized !== undefined){
        sanitizedRecord[key] = sanitized;
      }
    });
    seen.delete(value);
    return sanitizedRecord;
  }

  function sanitizeVennScheduleOptions(options = {}, session = null){
    const source = options && typeof options === 'object' ? options : {};
    const owner = {
      tabId: session?.tabId || source.tabId || null,
      sessionGeneration: session?.generation || session?.sessionGeneration || null,
      reason: source.reason || 'venn-session-draw'
    };
    const sharedSanitized = Shared.componentLifecycle?.sanitizeComponentDrawOptions?.('venn', source, owner);
    const sanitized = sharedSanitized && typeof sharedSanitized === 'object'
      ? sharedSanitized
      : (sanitizeVennDrawValue(source) || {});
    const tabId = String(owner.tabId || '').trim();
    if(tabId){
      sanitized.tabId = tabId;
    }else{
      delete sanitized.tabId;
    }
    delete sanitized.workspaceTabId;
    const generation = Number(owner.sessionGeneration);
    if(Number.isFinite(generation) && generation > 0){
      sanitized.sessionGeneration = generation;
    }
    sanitized.reason = String(owner.reason || 'venn-session-draw').trim() || 'venn-session-draw';
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
    shaped.timers.pendingDrawOptions = scheduleOptions;
    shaped.state.drawPending = true;
    if (isVennSessionActiveForModuleState(shaped)) {
      state.drawPending = true;
    }
    shaped.updatedAt = Date.now();
    const scheduled = scheduler(scheduleOptions);
    if (scheduled == null || scheduled === false) {
      clearVennPendingDrawState(shaped, 'venn-draw-schedule-rejected');
      return false;
    }
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
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    const currentPositions = owner?.state?.labelPositions || state.labelPositions;
    const nextPositions = normalizeVennLabelPositions({
      ...normalizeVennLabelPositions(currentPositions),
      [key]: value || null
    });
    return patchVennVisualState(owner, { labelPositions: nextPositions }, meta);
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
          fileHandle: Object.prototype.hasOwnProperty.call(shaped.managers || {}, 'fileHandle')
            ? shaped.managers.fileHandle
            : (durable.snapshot.fileHandle ?? null)
        });
      }else if(durable.runtime){
        applyVennRuntimeStateSnapshot(durable.runtime, shaped);
      }
      applyVennResultsStateToActive(shaped.results || {});
    });
    state.persistence.fileName = durable.fileName || durable.snapshot?.fileName || state.persistence.fileName || 'venn.graph';
    state.persistence.fileHandle = Object.prototype.hasOwnProperty.call(shaped.managers || {}, 'fileHandle')
      ? shaped.managers.fileHandle
      : (durable.snapshot?.fileHandle ?? durable.runtime?.persistence?.fileHandle ?? null);
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
    if(projectedVennSession && projectedVennSession.tabId && projectedVennSession.tabId !== tabId){
      captureVennSessionStateFromActive(projectedVennSession, {
        reason: meta?.reason || 'venn-session-switch-capture'
      });
    }
    const session = getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-session-bind' }, { create: true });
    if(!session){ return null; }

    // Bind the owner compatibility bridge before hydrating or projecting it.
    // Hydration helpers may consult the component's projected owner, and the
    // architecture requires that owner binding precede every DOM projection.
    projectedVennSession = session;
    venn.__vennSessionTabId = session.tabId;
    if(options.passiveBound !== false){
      venn.__boundTabId = session.tabId;
    }

    const activeWorkspaceTabId = String(global.Main?.session?.workspaceState?.activeTabId || '').trim();
    if(options.apply === true && activeWorkspaceTabId === tabId && !session.state?.snapshot?.payload){
      const ownerPayload = getVennWorkspaceTab(tabId)?.payload || null;
      if(ownerPayload && typeof ownerPayload === 'object'){
        hydrateVennSessionFromPayload(ownerPayload, {
          ...(meta || {}),
          tabId,
          reason: meta?.reason || 'venn-session-bind-payload-hydrate'
        });
      }
    }
    const root = meta?.root || resolveVennRoot(tabLike || tabId || null) || session.root || null;
    session.root = root || session.root || null;
    session.refs.root = root || session.refs.root || null;
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
    const session = getVennSession(meta?.tab || meta?.tabId || getVennProjectionTabId() || null, meta, { create: true });
    if(!session){
      return null;
    }
    session.state = createDefaultVennDurableState({
      ...(session.state || {}),
      runtime: record,
      fileName: record.persistence?.fileName || session.state?.fileName || 'venn.graph'
    });
    const ownerTab = getVennWorkspaceTab(session.tabId);
    const ownerAnalysis = ownerTab?.payload?.analysis && typeof ownerTab.payload.analysis === 'object'
      ? ownerTab.payload.analysis
      : {};
    session.results = createVennResultsStateForPatch(session.results || {}, ownerAnalysis, {
      // GO/STRING and the selected result tab are durable payload state; the
      // runtime snapshot intentionally owns only transient/significance data.
      activeResultsTab: ownerAnalysis.activeResultsTab,
      lastSignificance: record.analysis?.lastSignificance,
      significancePanelModel: record.analysis?.significancePanelModel
    });
    if(record.persistence && Object.prototype.hasOwnProperty.call(record.persistence, 'fileHandle')){
      session.managers.fileHandle = record.persistence.fileHandle ?? null;
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
    state.analysis.lastRegionSignature = null;
    state.analysis.lastRegionCode = null;
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
      : (Array.isArray(cloned.data) ? { table: cloneVennTableMatrix(cloned.data) } : {});
    if(Array.isArray(data.table)){
      data.table = cloneVennTableMatrix(data.table);
    }
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
    const data = normalized.data && typeof normalized.data === 'object' && !Array.isArray(normalized.data)
      ? normalized.data
      : {};
    const tableLegacy = Array.isArray(data.table) ? getVennLegacyDataFromTable(data.table) : null;
    const sourceValue = key => hasOwnVennDataField(data, key) ? data[key] : tableLegacy?.[key];
    const sourceLabels = ['labelA', 'labelB', 'labelC'].map(sourceValue);
    const sourceLists = ['listA', 'listB', 'listC'].map(sourceValue);
    const hasListContent = sourceLists.some(value => normalizeVennTextPayloadValue(value).trim() !== '');
    const hasOnlyLegacyDefaultLabels = !hasListContent && sourceLabels.every((value, index) => {
      const label = normalizeVennTextPayloadValue(value).trim();
      return !label || isLegacyVennDefaultLabel(label, index);
    });
    const legacyData = {
      labelA: hasOnlyLegacyDefaultLabels ? getDefaultVennLabel(0) : getNormalizedVennLabel(sourceLabels[0], 0),
      labelB: hasOnlyLegacyDefaultLabels ? getDefaultVennLabel(1) : getNormalizedVennLabel(sourceLabels[1], 1),
      labelC: hasOnlyLegacyDefaultLabels ? getDefaultVennLabel(2) : getNormalizedVennLabel(sourceLabels[2], 2),
      listA: normalizeVennTextPayloadValue(sourceLists[0]),
      listB: normalizeVennTextPayloadValue(sourceLists[1]),
      listC: normalizeVennTextPayloadValue(sourceLists[2])
    };
    const explicitLegacyKeys = new Set(
      VENN_LEGACY_TABLE_COLUMNS.flatMap(({ labelKey, listKey }) => [labelKey, listKey])
        .filter(key => hasOwnVennDataField(data, key))
    );
    normalized.type = 'venn';
    normalized.data = {
      ...data,
      ...legacyData,
      table: reconcileVennTableWithLegacyData(data.table, legacyData, explicitLegacyKeys)
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
    const tabId = String(meta?.tabId || meta?.tab || getVennProjectionTabId() || resolveActiveVennTabId() || '').trim();
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
      reason: meta?.reason || meta?.source || 'venn-payload-normalized'
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
    const tabId = String(meta?.tabId || meta?.tab || getVennProjectionTabId() || resolveActiveVennTabId() || '').trim();
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
    setVennAnalysisProjectionBaselinePending(session, analysis, meta?.reason || 'venn-payload-hydrate');
    session.notes = createDefaultVennNotesState(payload?.notes || session.notes || {});
    cancelVennAnalysisAutoRefresh(session, meta?.reason || 'venn-payload-hydrate');
    cancelPendingSpeciesDetection(meta?.reason || 'venn-payload-hydrate', {
      abortActive: true,
      resetIndicator: false,
      tabId: session.tabId
    });
    primeVennAnalysisAutoRefreshBaseline(session, meta?.reason || 'venn-payload-hydrate');
    primeVennSpeciesAutoDetectionBaseline(session, payload, meta?.reason || 'venn-payload-hydrate');
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
    const ownerTabId = String(tabId || meta?.tabId || meta?.tab || getVennProjectionTabId() || resolveActiveVennTabId() || '').trim();
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
      || getVennProjectionTabId()
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
    loadVennTableFromPayloadData(data, {
      refresh: true,
      exclusions: snapshot.payload.exclusions,
      source: 'venn-snapshot-restore'
    });
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
      pendingTabId: null,
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

  function applyVennRuntimeStateSnapshot(snapshot, session = null){
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
    detection.pendingTabId = null;
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
    setVennAnalysisProjectionBaselinePending(session || getActiveVennSessionForState(), {
      ...analysis,
      ...ui
    }, 'venn-runtime-apply');
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
    const scheduled = Shared.componentLifecycle?.scheduleComponentFrame?.(venn, 'venn', {
      tabId: getVennProjectionTabId() || null,
      reason
    }, run);
    if(!scheduled){
      run();
    }
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

  function hasOwnVennDataField(data, key) {
    return !!data && Object.prototype.hasOwnProperty.call(data, key);
  }

  function cloneVennTableMatrix(matrix) {
    if (!Array.isArray(matrix)) {
      return null;
    }
    return matrix.map(row => (
      Array.isArray(row)
        ? row.map(value => value === undefined ? null : value)
        : []
    ));
  }

  function getVennTableColumnCount(matrix) {
    if (!Array.isArray(matrix)) {
      return 0;
    }
    return matrix.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  }

  function hasIgnoredVennTableData(matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) {
      return false;
    }
    const colCount = getVennTableColumnCount(matrix);
    for (let col = 3; col < colCount; col += 1) {
      for (let row = 1; row < matrix.length; row += 1) {
        if (normalizeTableCellValue(matrix[row]?.[col])) {
          return true;
        }
      }
    }
    return false;
  }

  function syncVennSetLimitWarning(matrix = null) {
    const warning = state.ui?.setLimitWarning || null;
    if (!warning) {
      return false;
    }
    const table = Array.isArray(matrix) ? matrix : (getLiveVennTableMatrix() || []);
    const shouldShow = getActivePlotType() === 'venn' && hasIgnoredVennTableData(table);
    warning.hidden = !shouldShow;
    return shouldShow;
  }

  function ensureVennTableShape(matrix, minRows = 1, minCols = 3) {
    const next = cloneVennTableMatrix(matrix) || [];
    const rowCount = Math.max(1, Number.isFinite(Number(minRows)) ? Math.round(Number(minRows)) : 1, next.length);
    const colCount = Math.max(3, Number.isFinite(Number(minCols)) ? Math.round(Number(minCols)) : 3, getVennTableColumnCount(next));
    while (next.length < rowCount) {
      next.push([]);
    }
    next.forEach(row => {
      while (row.length < colCount) {
        row.push('');
      }
    });
    return next;
  }

  function getVennLegacyDataFromTable(matrix) {
    const table = ensureVennTableShape(matrix, 1, 3);
    const header = table[0] || [];
    return {
      labelA: getNormalizedVennLabel(header[0], 0),
      labelB: getNormalizedVennLabel(header[1], 1),
      labelC: getNormalizedVennLabel(header[2], 2),
      listA: getColumnValuesFromTable(table, 0).join('\n'),
      listB: getColumnValuesFromTable(table, 1).join('\n'),
      listC: getColumnValuesFromTable(table, 2).join('\n')
    };
  }

  function createVennTableFromLegacyData(data = {}) {
    const columns = VENN_LEGACY_TABLE_COLUMNS.map(({ listKey }) => tokenizeListForTable(data[listKey], 'auto'));
    const maxLen = Math.max(1, ...columns.map(values => values.length));
    return Array.from({ length: maxLen + 1 }, (_, row) => {
      if (row === 0) {
        return VENN_LEGACY_TABLE_COLUMNS.map(({ labelKey }, index) => getNormalizedVennLabel(data[labelKey], index));
      }
      const valueIndex = row - 1;
      return columns.map(values => values[valueIndex] || '');
    });
  }

  function replaceVennLegacyColumnInTable(matrix, columnIndex, label, listText) {
    const values = tokenizeListForTable(listText, 'auto');
    const next = ensureVennTableShape(matrix, values.length + 1, Math.max(3, columnIndex + 1));
    next[0][columnIndex] = getNormalizedVennLabel(label, columnIndex);
    for (let row = 1; row < next.length; row += 1) {
      next[row][columnIndex] = values[row - 1] || '';
    }
    return next;
  }

  function reconcileVennTableWithLegacyData(matrix, legacyData = {}, explicitLegacyKeys = null) {
    let next = cloneVennTableMatrix(matrix);
    if (!next) {
      return createVennTableFromLegacyData(legacyData);
    }
    next = ensureVennTableShape(next, 1, 3);
    const tableLegacy = getVennLegacyDataFromTable(next);
    const explicit = explicitLegacyKeys instanceof Set
      ? explicitLegacyKeys
      : new Set(VENN_LEGACY_TABLE_COLUMNS.flatMap(({ labelKey, listKey }) => [labelKey, listKey]));

    VENN_LEGACY_TABLE_COLUMNS.forEach(({ labelKey, listKey }, index) => {
      const labelChanged = explicit.has(labelKey)
        && getNormalizedVennLabel(legacyData[labelKey], index) !== getNormalizedVennLabel(tableLegacy[labelKey], index);
      const listChanged = explicit.has(listKey)
        && normalizeVennTextPayloadValue(legacyData[listKey]) !== normalizeVennTextPayloadValue(tableLegacy[listKey]);
      if (labelChanged || listChanged) {
        next = replaceVennLegacyColumnInTable(
          next,
          index,
          legacyData[labelKey],
          legacyData[listKey]
        );
      }
    });
    return next;
  }

  function createVennDataPayloadFromTable(existingData, matrix) {
    const data = existingData && typeof existingData === 'object' && !Array.isArray(existingData)
      ? { ...existingData }
      : {};
    const table = ensureVennTableShape(matrix, 1, 3);
    return {
      ...data,
      ...getVennLegacyDataFromTable(table),
      table
    };
  }

  function getLiveVennTableMatrix() {
    const hot = state.ui?.hot || null;
    if (!hot || typeof hot.getData !== 'function') {
      return null;
    }
    return cloneVennTableMatrix(hot.getData());
  }

  function getVennAnalysisTableMatrix() {
    const hot = state.ui?.hot || null;
    if (!hot) {
      return null;
    }
    if (typeof Shared.hot?.getAnalysisData === 'function') {
      const analysis = Shared.hot.getAnalysisData(hot);
      return Array.isArray(analysis?.data) ? cloneVennTableMatrix(analysis.data) : null;
    }
    return getLiveVennTableMatrix();
  }

  function getVennAnalysisListSources() {
    const matrix = getVennAnalysisTableMatrix();
    if (matrix) {
      return {
        A: getColumnValuesFromTable(matrix, 0).join('\n'),
        B: getColumnValuesFromTable(matrix, 1).join('\n'),
        C: getColumnValuesFromTable(matrix, 2).join('\n')
      };
    }
    const inputs = ensureInputs();
    return {
      A: inputs.A.value || '',
      B: inputs.B.value || '',
      C: inputs.C.value || ''
    };
  }

  function loadVennTableFromPayloadData(data, options = {}) {
    const hot = options.hotInstance || state.ui?.hot || null;
    if (!hot || typeof hot.loadData !== 'function') {
      return false;
    }
    const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const explicitLegacyKeys = new Set(
      VENN_LEGACY_TABLE_COLUMNS.flatMap(({ labelKey, listKey }) => [labelKey, listKey])
        .filter(key => hasOwnVennDataField(source, key))
    );
    const table = reconcileVennTableWithLegacyData(source.table, source, explicitLegacyKeys);
    hot.loadData(table);
    hot.applyExclusions?.(options.exclusions || {}, {
      silent: true,
      source: options.source || 'venn-payload-load'
    });
    if (options.refresh !== false) {
      hot.refreshLayout?.();
    }
    state.analysis.lastTableSignature = makeTableSignature(table);
    state.analysis.lastAnalysisTableSignature = makeTableSignature(getVennAnalysisTableMatrix() || table);
    syncVennSetLimitWarning(table);
    return true;
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
    syncVennSetLimitWarning(matrix);
    const tableSignature = makeTableSignature(matrix);
    const tableChanged = tableSignature !== state.analysis.lastTableSignature;
    state.analysis.lastTableSignature = tableSignature;
    const analysisMatrix = getVennAnalysisTableMatrix() || matrix;
    const analysisTableSignature = makeTableSignature(analysisMatrix);
    const analysisChanged = analysisTableSignature !== state.analysis.lastAnalysisTableSignature;
    state.analysis.lastAnalysisTableSignature = analysisTableSignature;
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
    const changed = inputsChanged || tableChanged || analysisChanged;
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
        analysisChanged,
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
    const legacyData = {
      labelA: getNormalizedVennLabel(inputs.labelA.value, 0),
      labelB: getNormalizedVennLabel(inputs.labelB.value, 1),
      labelC: getNormalizedVennLabel(inputs.labelC.value, 2),
      listA: normalizeVennTextPayloadValue(inputs.A.value),
      listB: normalizeVennTextPayloadValue(inputs.B.value),
      listC: normalizeVennTextPayloadValue(inputs.C.value)
    };
    const preserveAdditionalColumns = options.preserveAdditionalColumns !== false;
    const sourceTable = preserveAdditionalColumns && typeof hot.getData === 'function'
      ? hot.getData()
      : null;
    const explicitLegacyKeys = new Set(
      VENN_LEGACY_TABLE_COLUMNS.flatMap(({ labelKey, listKey }) => [labelKey, listKey])
    );
    const matrix = reconcileVennTableWithLegacyData(sourceTable, legacyData, explicitLegacyKeys);
    hot.loadData?.(matrix);
    if (options.refresh !== false) {
      hot.refreshLayout?.();
    }
    state.analysis.lastTableSignature = makeTableSignature(matrix);
    state.analysis.lastAnalysisTableSignature = makeTableSignature(getVennAnalysisTableMatrix() || matrix);
    // Programmatic input sync is a user intent. Persist the owning payload now so
    // table structure and the legacy A/B/C mirrors cannot diverge before a tab switch.
    if (options.skipPayloadSync !== true) {
      try { persistActiveVennUserChange('venn-inputs-sync'); } catch (err) { /* swallow */ }
    }
    debugLog('inputs synced to table', {
      rows: matrix.length,
      cols: getVennTableColumnCount(matrix),
      preserveAdditionalColumns
    });
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
    const sources = getVennAnalysisListSources();
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

  function normalizeVennRect(rect) {
    if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y)
      || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
      return null;
    }
    return {
      x: rect.x,
      y: rect.y,
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height)
    };
  }

  function expandVennRect(rect, padding = 0) {
    const normalized = normalizeVennRect(rect);
    if (!normalized) return null;
    const pad = Math.max(0, Number(padding) || 0);
    return {
      x: normalized.x - pad,
      y: normalized.y - pad,
      width: normalized.width + pad * 2,
      height: normalized.height + pad * 2
    };
  }

  function vennRectOverlapArea(a, b) {
    const left = normalizeVennRect(a);
    const right = normalizeVennRect(b);
    if (!left || !right) return 0;
    const width = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
    const height = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
    return width > 0 && height > 0 ? width * height : 0;
  }

  function vennRectsOverlap(a, b, gap = 0) {
    const left = expandVennRect(a, Math.max(0, Number(gap) || 0) / 2);
    const right = expandVennRect(b, Math.max(0, Number(gap) || 0) / 2);
    return vennRectOverlapArea(left, right) > 0;
  }

  function vennRectOverflowArea(rect, bounds) {
    const normalized = normalizeVennRect(rect);
    const normalizedBounds = normalizeVennRect(bounds);
    if (!normalized || !normalizedBounds) return 0;
    const area = normalized.width * normalized.height;
    const containedArea = vennRectOverlapArea(normalized, normalizedBounds);
    const overflowArea = Math.max(0, area - containedArea);
    return overflowArea > VENN_DIAGRAM_LAYOUT.overflowAreaEpsilon ? overflowArea : 0;
  }

  function measureVennTextMetrics(text, fontSize, fontFamily) {
    const resolvedSize = Math.max(1, Number(fontSize) || 12);
    const resolvedFamily = fontFamily || chartStyle.FONT_FAMILY || 'Arial, Helvetica, sans-serif';
    const font = `${resolvedSize}px ${resolvedFamily}`;
    const rawWidth = typeof chartStyle.measureText === 'function'
      ? chartStyle.measureText(String(text || ''), font)
      : String(text || '').length * resolvedSize * 0.6;
    return {
      width: Math.max(resolvedSize * 0.75, Number(rawWidth) || 0),
      height: Math.max(resolvedSize, resolvedSize * 1.18)
    };
  }

  function measureVennTextNodeBox(node, fallbackFontSize, fallbackFontFamily) {
    if (node && typeof node.getBBox === 'function') {
      try {
        const measured = normalizeVennRect(node.getBBox());
        if (measured) return measured;
      } catch (err) {
        debugLog('venn text getBBox fallback', { message: err?.message || String(err) });
      }
    }
    const metrics = measureVennTextMetrics(
      node?.textContent || '',
      fallbackFontSize,
      node?.getAttribute?.('font-family') || fallbackFontFamily
    );
    const x = Number(node?.getAttribute?.('x')) || 0;
    const y = Number(node?.getAttribute?.('y')) || 0;
    const anchor = node?.getAttribute?.('text-anchor') || 'start';
    const left = anchor === 'middle' ? x - metrics.width / 2 : (anchor === 'end' ? x - metrics.width : x);
    return {
      x: left,
      y: y - metrics.height,
      width: metrics.width,
      height: metrics.height
    };
  }

  function buildVennLabelSideAssignments(circles) {
    const ids = (circles || []).map(circle => circle.id);
    const assignments = [];
    const visit = (index, current) => {
      if (index >= ids.length) {
        assignments.push({ ...current });
        return;
      }
      const id = ids[index];
      current[id] = 'top';
      visit(index + 1, current);
      current[id] = 'bottom';
      visit(index + 1, current);
      delete current[id];
    };
    visit(0, {});
    return assignments;
  }

  function resolvePreferredVennLabelSides(circles) {
    const result = {};
    const list = Array.isArray(circles) ? circles.slice() : [];
    if (!list.length) return result;
    if (list.length === 2) {
      list.forEach(circle => { result[circle.id] = 'top'; });
      return result;
    }
    const minY = Math.min(...list.map(circle => circle.y));
    const maxY = Math.max(...list.map(circle => circle.y));
    const maxRadius = Math.max(1e-6, ...list.map(circle => circle.r));
    if ((maxY - minY) <= maxRadius * 0.14) {
      const ordered = list.slice().sort((a, b) => a.x - b.x || String(a.id).localeCompare(String(b.id)));
      ordered.forEach((circle, index) => {
        result[circle.id] = index === Math.floor(ordered.length / 2) ? 'bottom' : 'top';
      });
      return result;
    }
    const centerY = list.reduce((sum, circle) => sum + circle.y, 0) / list.length;
    list.forEach(circle => {
      result[circle.id] = circle.y > centerY ? 'bottom' : 'top';
    });
    return result;
  }

  function scoreVennLabelBoxAgainstCircle(box, circle, gap) {
    const normalized = normalizeVennRect(box);
    if (!normalized || !circle) return 0;
    const nearestX = Math.max(normalized.x, Math.min(circle.x, normalized.x + normalized.width));
    const nearestY = Math.max(normalized.y, Math.min(circle.y, normalized.y + normalized.height));
    const distance = Math.hypot(nearestX - circle.x, nearestY - circle.y);
    const intrusion = circle.r + Math.max(0, Number(gap) || 0) - distance;
    return intrusion > 0 ? intrusion * intrusion : 0;
  }

  function createVennLayoutQuality() {
    return {
      stageOverflowCount: 0,
      labelCollisionCount: 0,
      circleIntrusionCount: 0,
      stageOverflowArea: 0,
      labelCollisionArea: 0,
      circleIntrusion: 0,
      softScore: 0
    };
  }

  function cloneVennLayoutQuality(quality) {
    return { ...quality };
  }

  function compareVennLayoutQuality(left, right) {
    if (!right) return -1;
    if (!left) return 1;
    const priority = [
      'stageOverflowCount',
      'labelCollisionCount',
      'circleIntrusionCount',
      'stageOverflowArea',
      'labelCollisionArea',
      'circleIntrusion',
      'softScore'
    ];
    for (const key of priority) {
      const difference = (Number(left[key]) || 0) - (Number(right[key]) || 0);
      if (Math.abs(difference) > 1e-9) return difference < 0 ? -1 : 1;
    }
    return 0;
  }

  function resolveVennDiagramLayout(options = {}) {
    const stageWidth = Math.max(1, Number(options.stageWidth) || DEFAULT_STAGE_WIDTH);
    const stageHeight = Math.max(1, Number(options.stageHeight) || DEFAULT_STAGE_HEIGHT);
    const fontSize = Math.max(1, Number(options.fontSize) || 12);
    const rawCircles = (options.circles || []).filter(Boolean).map(circle => ({
      id: String(circle.id),
      x: Number(circle.x) || 0,
      y: Number(circle.y) || 0,
      r: Math.max(0, Number(circle.r) || 0)
    }));
    const labelMetrics = options.labelMetrics || {};
    const outerPadding = VENN_DIAGRAM_LAYOUT.outerPaddingPx;
    const labelGap = Math.max(5, fontSize * VENN_DIAGRAM_LAYOUT.labelGapEm);
    const collisionGap = Math.max(2, fontSize * VENN_DIAGRAM_LAYOUT.collisionGapEm);
    // Automatic diagram geometry is based on the reserved title band, never on
    // the title's user-moved display position. Manual title movement is a pure
    // presentation edit and must not reflow either Venn or UpSet geometry.
    const titleBandBottom = Math.max(outerPadding, Number(options.titleBandBottom) || 0);
    if (!rawCircles.length) {
      return {
        circles: [],
        labels: {},
        titleBandBottom,
        scale: 1,
        transform: { scale: 1, tx: 0, ty: 0 },
        sideAssignment: {}
      };
    }

    const minX = Math.min(...rawCircles.map(circle => circle.x - circle.r));
    const maxX = Math.max(...rawCircles.map(circle => circle.x + circle.r));
    const minY = Math.min(...rawCircles.map(circle => circle.y - circle.r));
    const maxY = Math.max(...rawCircles.map(circle => circle.y + circle.r));
    const rawWidth = Math.max(1e-6, maxX - minX);
    const rawHeight = Math.max(1e-6, maxY - minY);
    const preferredSides = resolvePreferredVennLabelSides(rawCircles);
    const assignments = buildVennLabelSideAssignments(rawCircles);
    const stageBounds = {
      x: outerPadding,
      y: outerPadding,
      width: Math.max(1, stageWidth - outerPadding * 2),
      height: Math.max(1, stageHeight - outerPadding * 2)
    };
    const scoreWeights = VENN_DIAGRAM_LAYOUT.score;
    let best = null;

    for (const sideAssignment of assignments) {
      const topMetrics = rawCircles
        .filter(circle => sideAssignment[circle.id] === 'top')
        .map(circle => labelMetrics[circle.id]?.height || fontSize * 1.18);
      const bottomMetrics = rawCircles
        .filter(circle => sideAssignment[circle.id] === 'bottom')
        .map(circle => labelMetrics[circle.id]?.height || fontSize * 1.18);
      const topReserve = topMetrics.length ? Math.max(...topMetrics) + labelGap * 1.45 : labelGap * 0.45;
      const bottomReserve = bottomMetrics.length ? Math.max(...bottomMetrics) + labelGap * 1.45 : labelGap * 0.45;
      const plotTop = titleBandBottom + topReserve;
      const plotBottom = stageHeight - outerPadding - bottomReserve;
      const availableHeight = Math.max(1, plotBottom - plotTop);
      const availableWidth = Math.max(1, stageWidth - outerPadding * 2);
      const scale = Math.max(1e-6, Math.min(availableWidth / rawWidth, availableHeight / rawHeight));
      const scaledWidth = rawWidth * scale;
      const scaledHeight = rawHeight * scale;
      const horizontalSlack = Math.max(0, availableWidth - scaledWidth);
      const verticalSlack = Math.max(0, availableHeight - scaledHeight);
      const tx = outerPadding + horizontalSlack / 2 - minX * scale;
      const ty = plotTop + verticalSlack * VENN_DIAGRAM_LAYOUT.verticalBias - minY * scale;
      const circles = rawCircles.map(circle => ({
        id: circle.id,
        x: circle.x * scale + tx,
        y: circle.y * scale + ty,
        r: circle.r * scale
      }));
      const circleById = new Map(circles.map(circle => [circle.id, circle]));
      const centerX = circles.reduce((sum, circle) => sum + circle.x, 0) / circles.length;
      const labelCandidates = [];

      for (const rawCircle of rawCircles) {
        const circle = circleById.get(rawCircle.id);
        const metrics = labelMetrics[rawCircle.id] || { width: fontSize * 4, height: fontSize * 1.18 };
        const side = sideAssignment[rawCircle.id];
        const outwardSign = circle.x < centerX - 0.5 ? -1 : (circle.x > centerX + 0.5 ? 1 : 0);
        const maxOffset = Math.min(circle.r * VENN_DIAGRAM_LAYOUT.maxLabelOffsetRatio, metrics.width * 0.45);
        const primaryOffset = outwardSign * Math.min(maxOffset, Math.max(fontSize, circle.r * 0.24));
        const offsets = outwardSign === 0
          ? [0, -maxOffset * 0.55, maxOffset * 0.55]
          : [primaryOffset, 0, outwardSign * maxOffset, -outwardSign * maxOffset * 0.35];
        const y = side === 'top'
          ? circle.y - circle.r - labelGap
          : circle.y + circle.r + labelGap + metrics.height;
        const candidates = offsets.map(offset => {
          const unclampedX = circle.x + offset;
          const x = Math.max(
            outerPadding + metrics.width / 2,
            Math.min(stageWidth - outerPadding - metrics.width / 2, unclampedX)
          );
          return {
            id: rawCircle.id,
            x,
            y,
            side,
            anchorX: circle.x + primaryOffset,
            box: {
              x: x - metrics.width / 2,
              y: y - metrics.height,
              width: metrics.width,
              height: metrics.height
            }
          };
        });
        labelCandidates.push(candidates);
      }

      let bestLabels = null;
      const initialQuality = createVennLayoutQuality();
      initialQuality.softScore = -scale * scoreWeights.scaleReward;
      const choose = (index, chosen, quality) => {
        if (index >= labelCandidates.length) {
          if (!bestLabels || compareVennLayoutQuality(quality, bestLabels.quality) < 0) {
            bestLabels = { quality, chosen: chosen.slice() };
          }
          return;
        }
        const candidates = labelCandidates[index];
        for (const candidate of candidates) {
          const nextQuality = cloneVennLayoutQuality(quality);
          nextQuality.softScore += Math.pow(candidate.x - candidate.anchorX, 2)
            * scoreWeights.horizontalOffsetWeight;
          if (candidate.side !== preferredSides[candidate.id]) {
            nextQuality.softScore += scoreWeights.nonPreferredSidePenalty;
          }

          const overflowArea = vennRectOverflowArea(candidate.box, stageBounds);
          if (overflowArea > 0) {
            nextQuality.stageOverflowCount += 1;
            nextQuality.stageOverflowArea += overflowArea;
          }
          for (const previous of chosen) {
            if (!vennRectsOverlap(candidate.box, previous.box, collisionGap)) continue;
            nextQuality.labelCollisionCount += 1;
            nextQuality.labelCollisionArea += vennRectOverlapArea(
              expandVennRect(candidate.box, collisionGap),
              expandVennRect(previous.box, collisionGap)
            );
          }
          for (const diagramCircle of circles) {
            const intrusion = scoreVennLabelBoxAgainstCircle(candidate.box, diagramCircle, collisionGap);
            if (intrusion <= 0) continue;
            nextQuality.circleIntrusionCount += 1;
            nextQuality.circleIntrusion += intrusion;
          }
          choose(index + 1, chosen.concat(candidate), nextQuality);
        }
      };
      choose(0, [], initialQuality);
      const chosenLabels = bestLabels?.chosen || [];
      const candidateQuality = bestLabels?.quality || initialQuality;
      if (!best || compareVennLayoutQuality(candidateQuality, best.quality) < 0) {
        best = {
          score: candidateQuality.softScore,
          quality: candidateQuality,
          scale,
          circles,
          transform: { scale, tx, ty },
          labels: Object.fromEntries(chosenLabels.map(label => [label.id, label])),
          sideAssignment: { ...sideAssignment },
          titleBandBottom
        };
      }
    }
    return best || { circles: [], labels: {}, titleBandBottom, scale: 1, transform: { scale: 1, tx: 0, ty: 0 }, sideAssignment: {} };
  }

  function normalizeVennLayoutSignatureNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric * 1e4) / 1e4 : null;
  }

  function createVennDiagramLayoutSignature(options = {}) {
    const circles = (options.circles || []).filter(Boolean).map(circle => ({
      id: String(circle.id || ''),
      x: normalizeVennLayoutSignatureNumber(circle.x),
      y: normalizeVennLayoutSignatureNumber(circle.y),
      r: normalizeVennLayoutSignatureNumber(circle.r)
    }));
    const labelMetrics = Object.fromEntries(circles.map(circle => {
      const metrics = options.labelMetrics?.[circle.id] || {};
      return [circle.id, {
        width: normalizeVennLayoutSignatureNumber(metrics.width),
        height: normalizeVennLayoutSignatureNumber(metrics.height)
      }];
    }));
    return JSON.stringify({
      stageWidth: normalizeVennLayoutSignatureNumber(options.stageWidth),
      stageHeight: normalizeVennLayoutSignatureNumber(options.stageHeight),
      fontSize: normalizeVennLayoutSignatureNumber(options.fontSize),
      titleBandBottom: normalizeVennLayoutSignatureNumber(options.titleBandBottom),
      circles,
      labelMetrics
    });
  }

  function resolveVennDiagramLayoutForSession(session, options = {}) {
    const owner = ensureVennSessionOwnershipShape(session);
    if (!owner) {
      return resolveVennDiagramLayout(options);
    }
    const signature = createVennDiagramLayoutSignature(options);
    if (owner.cache.diagramLayoutSignature === signature && owner.cache.diagramLayout) {
      return owner.cache.diagramLayout;
    }
    const layout = resolveVennDiagramLayout(options);
    owner.cache.diagramLayoutSignature = signature;
    owner.cache.diagramLayout = layout;
    return layout;
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

  const markFontEditable = (node, role, key, options = {}) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if(options.register !== false && fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'venn', role, key });
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'venn';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
      if(fontControls && typeof fontControls.applySavedStyle === 'function'){
        fontControls.applySavedStyle(node);
      }
    }
    if(role && role.indexOf('region') !== -1){ return; }
    debugLog('font mark applied', payload);
  };

  function ensureUpSetFontBindings(stage, options = {}) {
    if (!stage) return;
    const textNodes = Array.from(stage.querySelectorAll('text'));
    let boundCount = 0;
    textNodes.forEach((node, idx) => {
      if (!node || node.dataset?.fontEditable === '0') return;
      const role = node.dataset?.fontRole || 'upsetLabel';
      const key = node.dataset?.fontKey || `upset-text-${idx + 1}`;
      const needsBinding = node.dataset?.fontEditable !== '1' || !node.dataset?.fontKey;
      if (needsBinding) {
        markFontEditable(node, role, key, options);
        boundCount += 1;
      }
    });
    debugLog('upset font bindings ensured', {
      textCount: textNodes.length,
      boundCount
    });
  }

  let activeVennRenderParent = null;

  function makeEl(tag, attrs = {}, parent) {
    const stage = state.ui.stage;
    if (!parent) parent = activeVennRenderParent || stage;
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

  function normalizeUpSetAxisStyle(source = {}) {
    const axis = source && typeof source === 'object' ? source : {};
    const own = key => Object.prototype.hasOwnProperty.call(axis, key);
    const xMajorTickLength = own('xMajorTickLength') ? axis.xMajorTickLength : axis.majorTickLengthX;
    const yMajorTickLength = own('yMajorTickLength') ? axis.yMajorTickLength : axis.majorTickLengthY;
    return {
      color: sanitizeColor(axis.color ?? axis.axisColor, DEFAULT_UPSET_SETTINGS.axisColor),
      width: clampNumber(axis.width ?? axis.axisWidth, DEFAULT_UPSET_SETTINGS.axisWidth, 0.25, 10),
      xMajorTickLength: chartStyle.normalizeOptionalMajorTickLength(xMajorTickLength),
      yMajorTickLength: chartStyle.normalizeOptionalMajorTickLength(yMajorTickLength)
    };
  }

  function resolveUpSetSettings() {
    const ui = state.ui?.upset || {};
    const axisState = normalizeUpSetAxisStyle(state.analysis?.upsetAxis);
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
      axisColor: axisState.color,
      axisWidth: axisState.width,
      xMajorTickLength: axisState.xMajorTickLength,
      yMajorTickLength: axisState.yMajorTickLength,
      traceStyles: cloneUpSetTraceStyles(state.analysis?.upsetTraceStyles)
    };
    debug('Debug: venn upset settings resolved', settings);
    return settings;
  }

  function updateUpSetAxisStyle(next = {}) {
    const current = state.analysis?.upsetAxis || {};
    state.analysis.upsetAxis = normalizeUpSetAxisStyle({ ...current, ...next });
    debug('Debug: venn upset axis style updated', state.analysis.upsetAxis);
    requestScheduledDraw('upset-axis-style');
    syncActiveVennPayload('venn-upset-axis-style');
  }

  function createUpSetAxisControlConfig(axis, ownerSession = null) {
    const owner = ensureVennSessionOwnershipShape(ownerSession || getActiveVennSessionForState());
    return {
      axis,
      scopeId: 'venn',
      tabId: owner?.tabId || null,
      getTickInterval: () => null,
      getMajorTickLength: () => {
        const value = axis === 'x' ? state.analysis?.upsetAxis?.xMajorTickLength : state.analysis?.upsetAxis?.yMajorTickLength;
        if(value === null || value === undefined || value === ''){ return null; }
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
      },
      onMajorTickLengthChange: value => updateUpSetAxisStyle(axis === 'x' ? { xMajorTickLength: value } : { yMajorTickLength: value }),
      isMajorTickLengthSupported: () => true,
      majorTickLengthPlaceholder: 'Auto',
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

  function resolveVennStageDimensions(stage = state.ui.stage) {
    const viewBox = stage?.viewBox?.baseVal || null;
    const width = Number(stage?.dataset?.vennLayoutWidth)
      || Number(viewBox?.width)
      || Number(stage?.getAttribute?.('width'))
      || DEFAULT_STAGE_WIDTH;
    const height = Number(stage?.dataset?.vennLayoutHeight)
      || Number(viewBox?.height)
      || Number(stage?.getAttribute?.('height'))
      || DEFAULT_STAGE_HEIGHT;
    return {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
  }

  function resolveVennSavedLabelPosition(key, stageWidth, stageHeight) {
    const saved = key ? state.labelPositions?.[key] : null;
    if (!saved || typeof saved !== 'object') return null;
    let x = Number(saved.x);
    let y = Number(saved.y);
    if (Number.isFinite(Number(saved.relX)) && Number.isFinite(Number(saved.relY))) {
      x = Number(saved.relX) * stageWidth;
      y = Number(saved.relY) * stageHeight;
    }
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function createVennSavedLabelPosition(x, y, stageWidth, stageHeight) {
    return {
      x,
      y,
      relX: stageWidth > 0 ? x / stageWidth : 0,
      relY: stageHeight > 0 ? y / stageHeight : 0
    };
  }

  function applyVennSavedLabelPosition(node, key, options = {}) {
    if (!node || !key) return false;
    const stageWidth = Math.max(1, Number(options.stageWidth) || resolveVennStageDimensions().width);
    const stageHeight = Math.max(1, Number(options.stageHeight) || resolveVennStageDimensions().height);
    const saved = resolveVennSavedLabelPosition(key, stageWidth, stageHeight);
    if (!saved) return false;
    const fallback = {
      x: Number(node.getAttribute('x')) || 0,
      y: Number(node.getAttribute('y')) || 0
    };
    node.setAttribute('x', String(saved.x));
    node.setAttribute('y', String(saved.y));
    const fontSize = Math.max(1, Number(options.fontSize) || 12);
    const box = measureVennTextNodeBox(node, fontSize, options.fontFamily);
    const outsideStage = box.x < 0 || box.y < 0 || box.x + box.width > stageWidth || box.y + box.height > stageHeight;
    if (outsideStage) {
      node.setAttribute('x', String(fallback.x));
      node.setAttribute('y', String(fallback.y));
      return false;
    }
    node.dataset.vennManualPosition = 'true';
    return true;
  }

  function constrainVennDraggedLabelPosition(node, position, fallbackPosition, stage) {
    const dimensions = resolveVennStageDimensions(stage);
    const fontSize = Math.max(1, Number(node?.getAttribute?.('font-size')) || 12);
    const outerPadding = VENN_DIAGRAM_LAYOUT.outerPaddingPx;
    let x = Number(position?.x);
    let y = Number(position?.y);
    if (!node || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { ...fallbackPosition };
    }

    const currentX = Number(node.getAttribute('x')) || 0;
    const currentY = Number(node.getAttribute('y')) || 0;
    const proposedBox = measureVennTextNodeBox(node, fontSize, node.getAttribute('font-family'));
    const leftOffset = proposedBox.x - currentX;
    const rightOffset = leftOffset + proposedBox.width;
    const topOffset = proposedBox.y - currentY;
    const bottomOffset = topOffset + proposedBox.height;
    const minAnchorX = outerPadding - leftOffset;
    const maxAnchorX = dimensions.width - outerPadding - rightOffset;
    const minAnchorY = outerPadding - topOffset;
    const maxAnchorY = dimensions.height - outerPadding - bottomOffset;
    x = minAnchorX <= maxAnchorX
      ? Math.max(minAnchorX, Math.min(maxAnchorX, x))
      : dimensions.width / 2;
    y = minAnchorY <= maxAnchorY
      ? Math.max(minAnchorY, Math.min(maxAnchorY, y))
      : fallbackPosition.y;
    return { x, y };
  }

  function enableVennTextDrag(el, options = {}) {
    const stage = state.ui.stage;
    if (!el || !stage || typeof Shared.enableLabelDrag !== 'function') return;
    const key = String(options.key || el.dataset?.fontKey || '').trim();
    const owner = getVennCallbackOwner({ target: el, reason: `venn-label-drag-bind:${key || 'label'}` });
    const fallbackPosition = {
      x: Number(options.fallbackPosition?.x ?? el.getAttribute('x')) || 0,
      y: Number(options.fallbackPosition?.y ?? el.getAttribute('y')) || 0
    };
    const persistPosition = pos => {
      runVennOwnedCallback(owner, resolvedOwner => {
        const dimensions = resolveVennStageDimensions(stage);
        const x = Number(pos?.x);
        const y = Number(pos?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (key) {
          patchVennLabelPosition(resolvedOwner.session, key, createVennSavedLabelPosition(x, y, dimensions.width, dimensions.height), {
            reason: `venn-${key}-position`
          });
        }
      }, { target: el, reason: `venn-label-position:${key || 'label'}` });
    };
    Shared.enableLabelDrag(el, stage, {
      tabId: owner.tabId || getVennProjectionTabId() || null,
      scope: 'vennGraphPanel',
      normalizePosition: pos => constrainVennDraggedLabelPosition(
        el,
        pos,
        fallbackPosition,
        stage
      ),
      onPositionChange: persistPosition
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
    const owner = options.owner?.session
      ? options.owner
      : getVennCallbackOwner({
          tabId: options.tabId || null,
          target: options.target || null,
          event: options.event || null,
          reason: options.reason || 'venn-analysis-organism'
        });
    if(!isVennCallbackOwnerCurrent(owner)){
      debugLog('venn analysis organism skipped stale owner', {
        tabId: owner?.tabId || null,
        reason: options.reason || 'venn-analysis-organism'
      });
      return '';
    }
    const organism = String(options.organism ?? state.ui.speciesSelect?.value ?? '').trim();
    if(organism){
      return organism;
    }
    const allGenes = Array.isArray(options.genes) ? options.genes.slice() : getAllGenes();
    const detection = getSpeciesDetectionState();
    const cacheKey = computeGeneSignature(allGenes);
    const requestKind = String(options.requestKind || 'analysisSpecies').trim() || 'analysisSpecies';
    const speciesOwner = beginVennAnalysisRequest(requestKind, {
      owner,
      reason: options.reason || 'venn-analysis-organism'
    });
    if(!speciesOwner?.token){
      return '';
    }
    try{
      const guess = allGenes.length
        ? await guessSpecies(allGenes, { cache: detection.cache, cacheKey })
        : null;
      if(!isVennAnalysisRequestCurrent(speciesOwner, requestKind)){
        debugLog('venn analysis organism ignored stale completion', {
          tabId: owner.tabId,
          cacheKey,
          reason: options.reason || 'venn-analysis-organism'
        });
        return '';
      }
      commitVennSpeciesSelection(speciesOwner, guess || '', guess ? true : false, {
        reason: guess ? 'venn-analysis-species-detected' : 'venn-analysis-species-missing'
      });
      if(guess){
        return guess;
      }
      if(options.alertMessage && isVennAnalysisOwnerActive(speciesOwner)){
        alert(options.alertMessage);
      }
      return '';
    }finally{
      finishVennAnalysisRequest(speciesOwner, requestKind);
    }
  }

  function cancelVennAnalysisAutoRefresh(session = null, reason = 'venn-analysis-auto-refresh-cancel') {
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    const cache = owner?.cache || null;
    if (!cache) {
      return false;
    }
    if (cache.autoAnalysisRefreshTimer) {
      Shared.componentLifecycle?.clearComponentTimeout?.(venn, cache.autoAnalysisRefreshTimer);
    }
    const hadPending = !!(cache.autoAnalysisRefreshTimer || cache.autoAnalysisRefreshToken);
    cache.autoAnalysisRefreshTimer = null;
    cache.autoAnalysisRefreshToken = null;
    if (hadPending) {
      owner.updatedAt = Date.now();
      debug('Debug: venn analysis auto-refresh cancelled', {
        tabId: owner.tabId || null,
        reason
      });
    }
    return hadPending;
  }

  function primeVennAnalysisAutoRefreshBaseline(session = null, reason = 'venn-analysis-restore-baseline') {
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    if (!owner) {
      return false;
    }
    const hasRestoredAnalysis = !!(
      owner.results?.goPerformed
      || owner.results?.stringPerformed
    );
    owner.cache.suppressAnalysisAutoRefresh = hasRestoredAnalysis;
    owner.cache.analysisAutoRefreshBaselineSignature = hasRestoredAnalysis
      ? String(isVennSessionActiveForModuleState(owner) ? (state.analysis?.lastRegionSignature || '') : '')
      : null;
    owner.updatedAt = Date.now();
    debug('Debug: venn analysis refresh baseline primed', {
      tabId: owner.tabId || null,
      reason,
      suppressed: hasRestoredAnalysis,
      signature: owner.cache.analysisAutoRefreshBaselineSignature || null
    });
    return hasRestoredAnalysis;
  }

  function shouldSuppressVennAnalysisAutoRefresh(session = null) {
    const owner = ensureVennSessionOwnershipShape(session || getActiveVennSessionForState());
    const cache = owner?.cache || null;
    if (!cache?.suppressAnalysisAutoRefresh) {
      return false;
    }
    const currentSignature = String(state.analysis?.lastRegionSignature || '');
    const baselineSignature = String(cache.analysisAutoRefreshBaselineSignature || '');
    if (!baselineSignature) {
      cache.analysisAutoRefreshBaselineSignature = currentSignature;
      return true;
    }
    if (currentSignature === baselineSignature) {
      return true;
    }
    cache.suppressAnalysisAutoRefresh = false;
    cache.analysisAutoRefreshBaselineSignature = null;
    owner.updatedAt = Date.now();
    debug('Debug: venn analysis refresh suppression released by region change', {
      tabId: owner.tabId || null,
      previousSignature: baselineSignature,
      currentSignature
    });
    return false;
  }

  function scheduleVennAnalysisAutoRefresh(intent, reason = 'venn-analysis-auto-refresh') {
    const normalized = {
      ...captureVennAnalysisAutoRefreshIntent(),
      ...(intent || {}),
      activeResultsTab: normalizeAnalysisResultsTab(intent?.activeResultsTab || state.analysis.activeResultsTab || 'go')
    };
    if (!hasVennAnalysisAutoRefreshIntent(normalized) || isProjectingVennSession()) {
      return false;
    }
    const session = getActiveVennSessionForState();
    if (!session?.tabId) {
      return false;
    }
    const owner = getVennCallbackOwner({
      tabId: session.tabId,
      reason: `${reason}-owner`
    });
    if(!isVennCallbackOwnerActive(owner)){
      return false;
    }
    if (shouldSuppressVennAnalysisAutoRefresh(session)) {
      debug('Debug: venn analysis auto-refresh suppressed for restored baseline', {
        reason,
        tabId: session.tabId,
        signature: session.cache?.analysisAutoRefreshBaselineSignature || null
      });
      return false;
    }
    const cache = session.cache || (session.cache = {});
    if (cache.autoAnalysisRefreshTimer) {
      Shared.componentLifecycle?.clearComponentTimeout?.(venn, cache.autoAnalysisRefreshTimer);
      cache.autoAnalysisRefreshTimer = null;
    }
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    cache.autoAnalysisRefreshToken = token;
    cache.autoAnalysisRefreshTimer = Shared.componentLifecycle?.scheduleComponentTimeout?.(venn, 'venn', {
      tabId: session.tabId,
      reason: 'venn-analysis-auto-refresh'
    }, () => {
      if (session.cache?.autoAnalysisRefreshToken !== token) {
        return;
      }
      session.cache.autoAnalysisRefreshTimer = null;
      if (!isVennCallbackOwnerActive(owner)) {
        session.cache.autoAnalysisRefreshToken = null;
        return;
      }
      session.cache.autoAnalysisRefreshToken = null;
      refreshVennAnalysesForCurrentRegion(normalized, reason, owner).catch(err => {
        console.error('venn analysis auto-refresh error', err);
      });
    }, 80) || null;
    if (!cache.autoAnalysisRefreshTimer) {
      cache.autoAnalysisRefreshToken = null;
      if(isVennCallbackOwnerActive(owner)){
        refreshVennAnalysesForCurrentRegion(normalized, reason, owner).catch(err => {
          console.error('venn analysis auto-refresh error', err);
        });
      }
    }
    debug('Debug: venn analysis auto-refresh scheduled', {
      reason,
      tabId: session.tabId,
      go: normalized.go,
      string: normalized.string,
      activeResultsTab: normalized.activeResultsTab
    });
    return true;
  }

  async function refreshVennAnalysesForCurrentRegion(intent, reason = 'venn-analysis-auto-refresh', callbackOwner = null) {
    const owner = callbackOwner?.session
      ? callbackOwner
      : getVennCallbackOwner({ reason: `${reason}-owner` });
    if(!isVennCallbackOwnerActive(owner)){
      debug('Debug: venn analysis auto-refresh skipped', { reason, cause: 'stale-owner', tabId: owner?.tabId || null });
      return;
    }
    const normalized = {
      ...(intent || {}),
      activeResultsTab: normalizeAnalysisResultsTab(intent?.activeResultsTab || state.analysis.activeResultsTab || 'go')
    };
    if (!hasVennAnalysisAutoRefreshIntent(normalized)) {
      return;
    }
    const genes = (getRegionText(state.ui.regionSelect?.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
    const speciesGenes = getAllGenes();
    const goOptions = normalized.go ? captureVennGoAnalysisOptions() : null;
    const stringOptions = normalized.string ? captureVennStringAnalysisOptions() : null;
    if (!genes.length) {
      debug('Debug: venn analysis auto-refresh skipped', { reason, cause: 'empty-region' });
      return;
    }
    const organism = await resolveVennAnalysisOrganism({
      owner,
      genes: speciesGenes,
      reason: `${reason}-species`,
      requestKind: 'autoRefreshSpecies'
    });
    if (!organism || !isVennCallbackOwnerCurrent(owner)) {
      debug('Debug: venn analysis auto-refresh skipped', { reason, cause: organism ? 'stale-owner' : 'missing-organism' });
      return;
    }
    if (normalized.stringOverlay && isVennCallbackOwnerActive(owner)) {
      state.analysis.stringOverlay = normalizeStringOverlayModel(normalized.stringOverlay);
      syncStringOverlayControls();
    }
    if (normalized.go) {
      runGOAnalysis(genes, organism, {
        owner,
        activeResultsTab: normalized.activeResultsTab,
        autoRefresh: true,
        requestConfig: goOptions
      });
    }
    if (normalized.string) {
      runStringAnalysis(genes, organism, {
        owner,
        activeResultsTab: normalized.activeResultsTab,
        autoRefresh: true,
        requestConfig: stringOptions
      });
    }
    debug('Debug: venn analysis auto-refresh started', {
      reason,
      tabId: owner.tabId,
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
    const ownerSession = getActiveVennSessionForState();
    const hasProjectedAnalysisResults = hasVennGoResultsState(state.analysis) || hasVennStringResultsState(state.analysis);
    const hasPendingAnalysisBaseline = !previousSignature && ownerSession?.cache?.analysisProjectionBaselinePending === true;
    const isInitialRegionProjection = !previousSignature && (hasProjectedAnalysisResults || hasPendingAnalysisBaseline);
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
    if(hasPendingAnalysisBaseline && ownerSession?.cache){
      ownerSession.cache.analysisProjectionBaselinePending = false;
      ownerSession.updatedAt = Date.now();
    }
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
    const ownerTabId = getVennProjectionTabId() || null;
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
    const scheduled = Shared.componentLifecycle?.scheduleComponentFrame?.(venn, 'venn', { tabId: ownerTabId, reason }, runOwnerReflow);
    if(!scheduled){
      runOwnerReflow();
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
      && (!owner || isVennSessionActiveForModuleState(owner));
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
    captureVennSessionStateFromActive(projectedVennSession, { reason: resolvedReason });
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
    const callbackOwner = meta?.owner?.session
      ? meta.owner
      : getVennCallbackOwner({
          ...(meta || {}),
          tabId: meta?.tabId || null,
          reason: meta.reason || `venn-${kind}-request`
        });
    if(!isVennCallbackOwnerCurrent(callbackOwner)){
      return {
        tabId: callbackOwner?.tabId || null,
        session: callbackOwner?.session || null,
        sessionGeneration: Number(callbackOwner?.sessionGeneration) || 0,
        token: null
      };
    }
    const tabId = callbackOwner.tabId;
    const session = callbackOwner.session;
    const cache = session.cache || (session.cache = {});
    const asyncRequests = cache.asyncRequests || (cache.asyncRequests = {
      go: null,
      string: null,
      species: null,
      stringOverlay: null
    });
    const token = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    asyncRequests[kind] = token;
    session.updatedAt = Date.now();
    return {
      tabId,
      session,
      sessionGeneration: Number(callbackOwner.sessionGeneration) || 0,
      token
    };
  }

  function isVennAnalysisRequestCurrent(owner, kind) {
    if (!owner || !owner.session || !owner.token || !isVennCallbackOwnerCurrent(owner)) {
      return false;
    }
    const session = getVennSession(owner.tabId || owner.session.tabId || null, { tabId: owner.tabId || owner.session.tabId || null, reason: `venn-${kind}-request-check` }, { create: false });
    return !!(session && session === owner.session && session.cache?.asyncRequests?.[kind] === owner.token);
  }

  function finishVennAnalysisRequest(owner, kind) {
    if (!owner?.token || !kind) {
      return false;
    }
    const session = getVennSession(owner.tabId || owner.session?.tabId || null, {
      tabId: owner.tabId || owner.session?.tabId || null,
      reason: `venn-${kind}-request-finish`
    }, { create: false }) || owner.session || null;
    if (!session?.cache?.asyncRequests || session.cache.asyncRequests[kind] !== owner.token) {
      return false;
    }
    session.cache.asyncRequests[kind] = null;
    session.updatedAt = Date.now();
    debugLog('venn async request finished', {
      tabId: session.tabId || owner.tabId || null,
      kind
    });
    return true;
  }

  function commitVennAnalysisPatch(owner, patch, meta = {}) {
    if (!owner || !owner.session || !owner.tabId || !patch || typeof patch !== 'object' || !isVennCallbackOwnerCurrent(owner)) {
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
    return !!(owner?.tabId && isVennCallbackOwnerCurrent(owner) && owner.tabId === resolveActiveVennTabId());
  }

  function getSpeciesIndicatorColor(success) {
    if (success === null) {
      return '';
    }
    return success ? '#b5d99c' : '#f28b82';
  }

  function commitVennSpeciesSelection(owner, speciesValue, indicatorSuccess, meta = {}) {
    if (!owner || !owner.tabId || !isVennCallbackOwnerCurrent(owner)) {
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
      captureVennSessionStateFromActive(ownerSession || projectedVennSession, {
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
    const scheduled = Shared.componentLifecycle?.scheduleComponentFrame?.(venn, 'venn', {
      tabId: getVennProjectionTabId() || null,
      reason
    }, rerender);
    if(!scheduled){
      rerender();
    }
  }

  function commitStringOverlayPayload(reason, callbackOwner = null, overlayModel = state.analysis.stringOverlay){
    const owner = callbackOwner?.session
      ? callbackOwner
      : getVennCallbackOwner({ reason: reason || 'venn-string-overlay' });
    if(owner?.tabId && isVennCallbackOwnerCurrent(owner)){
      return commitVennAnalysisPatch(owner, {
        stringOverlay: normalizeStringOverlayModel(overlayModel)
      }, { reason: reason || 'venn-string-overlay', origin: 'user' });
    }
    return false;
  }

  function handleStringOverlayFileButtonClick(event){
    event?.preventDefault?.();
    if(state.ui.stringOverlayFile){
      state.ui.stringOverlayFile.value = '';
      state.ui.stringOverlayFile.click();
    }
  }

  async function handleStringOverlayFileChange(event, callbackOwner = null){
    const file = event?.target?.files?.[0];
    if(!file){ return; }
    const owner = callbackOwner?.session
      ? callbackOwner
      : getVennCallbackOwner({
          event,
          target: event?.currentTarget || event?.target || null,
          reason: 'venn-string-overlay-file'
        });
    if(!isVennCallbackOwnerActive(owner)){
      return;
    }
    const fileDisplayName = getStringOverlayFileDisplayName(file, event?.target?.value || '');
    const baseModel = readStringOverlayControls();
    const requestOwner = beginVennAnalysisRequest('stringOverlay', {
      owner,
      reason: 'venn-string-overlay-file'
    });
    if(!requestOwner?.token){
      return;
    }
    setStringOverlayFileName(fileDisplayName || file.name, true);
    setStringOverlayStatus(`Loading ${fileDisplayName || file.name}...`);
    try{
      const rows = await readStringOverlayRows(file);
      if(!isVennAnalysisRequestCurrent(requestOwner, 'stringOverlay')){
        debugLog('string overlay file completion ignored for stale owner', {
          tabId: owner.tabId,
          fileName: file.name
        });
        return;
      }
      const edges = parseStringOverlayRows(rows);
      const overlayModel = normalizeStringOverlayModel({
        ...baseModel,
        fileName: file.name,
        fileDisplayName,
        edges
      });
      commitStringOverlayPayload('venn-string-overlay-file', requestOwner, overlayModel);
      if(isVennAnalysisOwnerActive(requestOwner)){
        state.analysis.stringOverlay = overlayModel;
        syncStringOverlayControls();
        rerenderStringOverlay();
      }
      debugLog('string overlay file loaded', {
        tabId: owner.tabId,
        fileName: file.name,
        fileDisplayName,
        rows: rows.length,
        edges: edges.length
      });
    }catch(err){
      console.error('venn string overlay import error', err);
      if(isVennAnalysisRequestCurrent(requestOwner, 'stringOverlay') && isVennAnalysisOwnerActive(requestOwner)){
        setStringOverlayStatus(`Failed to load ${fileDisplayName || file.name}`);
      }
    }finally{
      finishVennAnalysisRequest(requestOwner, 'stringOverlay');
      const targetTabId = getVennTabIdFromTarget(event?.target || null);
      if(event?.target && isVennCallbackOwnerCurrent(requestOwner) && targetTabId && targetTabId === requestOwner.tabId){
        event.target.value = '';
      }
    }
  }

  function handleStringOverlayControlInput(){
    state.analysis.stringOverlay = readStringOverlayControls();
    rerenderStringOverlay('venn-string-overlay-controls-live');
  }

  function handleStringOverlayControlChange(event, callbackOwner = null){
    state.analysis.stringOverlay = readStringOverlayControls();
    rerenderStringOverlay('venn-string-overlay-controls');
    commitStringOverlayPayload('venn-string-overlay-controls', callbackOwner, state.analysis.stringOverlay);
    const target = event?.currentTarget || null;
    commitVennUndo(target, target?.id ? `venn:${target.id}` : 'venn:string-overlay-controls');
  }

  function serializeVennAuxiliarySvg(svgEl, contextLabel){
    if(!svgEl){ return ''; }
    const clone = svgEl.cloneNode(true);
    if(!clone.getAttribute('xmlns')){
      clone.setAttribute('xmlns', NS);
    }
    if(!clone.getAttribute('xmlns:xlink')){
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }
    const projectionApi = Shared.exportProjection;
    if(typeof projectionApi?.resolve === 'function' && typeof projectionApi?.applyToSvg === 'function'){
      projectionApi.attachSource?.(clone, svgEl);
      const projection = projectionApi.resolve(svgEl, {
        componentName: 'venn-analysis',
        contextLabel
      });
      if(projection){
        projectionApi.applyToSvg(clone, projection);
      }
    }
    return new XMLSerializer().serializeToString(clone);
  }

  function buildStringNetworkSvgString(){
    const svgEl = state.ui.stringNetwork?.querySelector?.('svg');
    if(!svgEl){ return state.analysis.lastStringSVG || ''; }
    return serializeVennAuxiliarySvg(svgEl, 'string-export');
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
      return Shared.formatters?.formatScientificNumber?.(numeric, { fractionalDigits: 2 }) || String(numeric);
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
      bar.appendChild(createSvgNode('title', {}, `${row.label}\n${row.source}\n${row.pValue == null ? 'p = n/a' : formatSharedPExpression(row.pValue)}\n−log₁₀(p) = ${formatGoChartNumber(row.value)}`));
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
    }, '−log₁₀(p)'));

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
      row.textContent = `${term} [${source}] (${formatSharedPExpression(result?.p_value)})`;
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

  function validateVennSignificanceCounts(counts, universeSize) {
    const total = Number(universeSize);
    if (!Number.isFinite(total) || !Number.isInteger(total) || total <= 0) {
      return { valid: false, reason: 'Total universe size must be a positive integer.' };
    }
    const keys = ['nA', 'nB', 'nC', 'Aonly', 'Bonly', 'Conly', 'AB', 'AC', 'BC', 'ABC'];
    const normalized = {};
    for (const key of keys) {
      const value = Number(counts?.[key] ?? 0);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        return { valid: false, reason: `Venn count ${key} must be a non-negative integer.` };
      }
      normalized[key] = value;
    }
    const isThreeSet = normalized.nC > 0 || normalized.Conly > 0 || normalized.AC > 0 || normalized.BC > 0 || normalized.ABC > 0;
    const expectedA = normalized.Aonly + normalized.AB + (isThreeSet ? normalized.AC + normalized.ABC : 0);
    const expectedB = normalized.Bonly + normalized.AB + (isThreeSet ? normalized.BC + normalized.ABC : 0);
    const expectedC = isThreeSet ? normalized.Conly + normalized.AC + normalized.BC + normalized.ABC : 0;
    if (normalized.nA !== expectedA || normalized.nB !== expectedB || (isThreeSet && normalized.nC !== expectedC)) {
      return { valid: false, reason: 'Set totals are inconsistent with the mutually exclusive Venn regions.' };
    }
    const union = normalized.Aonly + normalized.Bonly + normalized.AB
      + (isThreeSet ? normalized.Conly + normalized.AC + normalized.BC + normalized.ABC : 0);
    if (total < union) {
      return { valid: false, reason: `Total universe size must be at least the observed union (${union}).` };
    }
    return { valid: true, reason: null, counts: normalized, union, setCount: isThreeSet ? 3 : 2 };
  }

  function probabilityDisplayFromLog(logPValue) {
    const numericLog = Number(logPValue);
    if (numericLog === -Infinity) return '< 5 × 10⁻³²⁴';
    if (!Number.isFinite(numericLog)) return 'n/a';
    if (numericLog < Math.log(Number.MIN_VALUE)) return '< 5 × 10⁻³²⁴';
    return formatSharedPValue(Math.min(1, Math.max(0, Math.exp(numericLog))));
  }

  function formatProbabilityExpressionFromLog(logPValue, label = 'p') {
    const display = probabilityDisplayFromLog(logPValue);
    const match = /^(<=|>=|≤|≥|<|>)\s*(.*)$/.exec(String(display));
    if(match){
      const operator = match[1] === '<=' ? '≤' : (match[1] === '>=' ? '≥' : match[1]);
      return `${label} ${operator} ${match[2]}`;
    }
    return `${label} = ${display}`;
  }

  function computeVennSignificanceResults(inputCounts, universeSize, inputLabels, options = {}) {
    const validation = validateVennSignificanceCounts(inputCounts, universeSize);
    if (!validation.valid) {
      return { valid: false, reason: validation.reason, validation, results: [], rows: [] };
    }
    const total = Number(universeSize);
    const counts = validation.counts;
    const labels = {
      A: String(inputLabels?.A || 'A'),
      B: String(inputLabels?.B || 'B'),
      C: String(inputLabels?.C || 'C')
    };
    const statsHelpers = options.statsHelpers || Shared.stats || {};
    const significanceCache = options.cache || {
      logFactorial: typeof statsHelpers.createLogFactorialCache === 'function'
        ? statsHelpers.createLogFactorialCache()
        : null,
      lastUniverse: 0
    };
    if (significanceCache.lastUniverse && total < significanceCache.lastUniverse) {
      if (significanceCache.logFactorial && typeof statsHelpers.trimLogFactorialCache === 'function') {
        statsHelpers.trimLogFactorialCache(significanceCache.logFactorial, total);
      } else {
        significanceCache.logFactorial = null;
      }
    }
    if (!significanceCache.logFactorial && typeof statsHelpers.createLogFactorialCache === 'function') {
      significanceCache.logFactorial = statsHelpers.createLogFactorialCache();
    }
    significanceCache.lastUniverse = total;

    const computeHypergeom = (successes, draws, observed) => {
      if (typeof statsHelpers.computeHypergeometricRightTailDetails === 'function') {
        return statsHelpers.computeHypergeometricRightTailDetails({
          populationSize: total,
          successPopulation: successes,
          draws,
          observedSuccesses: observed,
          cache: significanceCache
        });
      }
      const pValue = typeof statsHelpers.computeHypergeometricRightTail === 'function'
        ? statsHelpers.computeHypergeometricRightTail({
            populationSize: total,
            successPopulation: successes,
            draws,
            observedSuccesses: observed,
            cache: significanceCache
          })
        : NaN;
      return Number.isFinite(pValue) && pValue >= 0 && pValue <= 1
        ? { valid: true, pValue, logPValue: pValue === 0 ? -Infinity : Math.log(pValue), underflow: pValue === 0, reason: null }
        : { valid: false, pValue: NaN, logPValue: NaN, underflow: false, reason: 'Hypergeometric probability could not be evaluated.' };
    };

    const requests = [
      { name: `${labels.A}∩${labels.B}`, successes: counts.nA, draws: counts.nB, observed: counts.AB + counts.ABC }
    ];
    if (validation.setCount === 3) {
      requests.push(
        { name: `${labels.A}∩${labels.C}`, successes: counts.nA, draws: counts.nC, observed: counts.AC + counts.ABC },
        { name: `${labels.B}∩${labels.C}`, successes: counts.nB, draws: counts.nC, observed: counts.BC + counts.ABC },
        { name: `${labels.A}∩${labels.B}∩${labels.C}`, successes: counts.AB + counts.ABC, draws: counts.nC, observed: counts.ABC }
      );
    }
    const results = requests.map(request => ({
      ...request,
      detail: computeHypergeom(request.successes, request.draws, request.observed)
    }));
    const invalid = results.find(entry => (
      !entry.detail?.valid
      || !(Number.isFinite(entry.detail?.logPValue) || entry.detail?.logPValue === -Infinity)
    ));
    if (invalid) {
      return {
        valid: false,
        reason: invalid.detail?.reason || `Could not evaluate ${invalid.name}.`,
        validation,
        results: [],
        rows: []
      };
    }
    const rawLogs = results.map(entry => entry.detail.logPValue);
    const adjustedLogs = typeof statsHelpers.adjustHolmLogPValues === 'function'
      ? statsHelpers.adjustHolmLogPValues(rawLogs)
      : (typeof statsHelpers.adjustPValues === 'function'
          ? statsHelpers.adjustPValues(results.map(entry => entry.detail.pValue), { method: 'holm' })
              .map(value => Number.isFinite(value) && value > 0 ? Math.log(value) : (value === 0 ? -Infinity : null))
          : rawLogs.slice());
    results.forEach((entry, index) => {
      entry.rawLogPValue = rawLogs[index];
      entry.adjustedLogPValue = Number(adjustedLogs[index]);
      entry.rawPValue = entry.detail.pValue;
      entry.adjustedPValue = Number.isFinite(entry.adjustedLogPValue) && entry.adjustedLogPValue >= Math.log(Number.MIN_VALUE)
        ? Math.exp(entry.adjustedLogPValue)
        : 0;
      entry.significant = entry.adjustedLogPValue < Math.log(0.05);
    });
    const rows = results.map(entry => ({
      overlap: entry.name,
      rawPValue: probabilityDisplayFromLog(entry.rawLogPValue),
      adjustedPValue: probabilityDisplayFromLog(entry.adjustedLogPValue),
      significant: entry.significant ? 'yes' : 'no'
    }));
    return { valid: true, reason: null, validation, total, counts, results, rows, cache: significanceCache };
  }

  function calculateSignificance() {
    if (!state.analysis.lastCounts || !state.ui.significanceResults) {
      if (state.ui.significanceResults) state.ui.significanceResults.textContent = 'Draw a Venn diagram first.';
      return;
    }
    ensureInputs();
    const labels = getCurrentVennLabelMap();
    const significance = computeVennSignificanceResults(
      state.analysis.lastCounts,
      Number(state.ui.totalGenesInput.value),
      labels,
      { cache: getSignificanceCache(), statsHelpers: Shared.stats || {} }
    );
    if (!significance.valid) {
      state.ui.significanceResults.textContent = significance.reason;
      return;
    }
    const { validation, total, counts, results, rows } = significance;
    if (Shared.statsTable && typeof Shared.statsTable.render === 'function') {
      Shared.statsTable.render({
        target: state.ui.significanceResults,
        columns: [
          { key: 'overlap', label: 'Overlap', align: 'left' },
          { key: 'rawPValue', label: 'Raw p-value', align: 'right' },
          { key: 'adjustedPValue', label: 'Holm-adjusted p-value', align: 'right' },
          { key: 'significant', label: 'Significant', align: 'center' }
        ],
        rows,
        caption: 'Overlap enrichment significance (hypergeometric test)',
        footnotes: [
          'Significance threshold: Holm-adjusted p < 0.05 across the displayed overlap family.',
          'Test: One-sided hypergeometric overlap enrichment.'
        ],
        options: { fileName: 'venn-significance', contextLabel: 'venn-significance' }
      });
    } else {
      state.ui.significanceResults.innerHTML = '<table><caption>Overlap enrichment significance (hypergeometric test)</caption><tr><th>Overlap</th><th>Raw p-value</th><th>Holm-adjusted p-value</th><th>Significant</th></tr>'
        + rows.map(row => `<tr><td>${row.overlap}</td><td>${row.rawPValue}</td><td>${row.adjustedPValue}</td><td>${row.significant}</td></tr>`).join('')
        + '</table><p class="stats-footnote">Significance threshold: Holm-adjusted p &lt; 0.05 across the displayed overlap family.<br>Test: One-sided hypergeometric overlap enrichment.</p>';
    }
    if (Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function') {
      const best = results.reduce((current, entry) => (!current || entry.adjustedLogPValue < current.adjustedLogPValue ? entry : current), null);
      Shared.statsReporting.appendReportPanel(state.ui.significanceResults, {
        methodsText: `Venn overlap enrichment was tested with one-sided upper-tail hypergeometric tests using a user-specified universe size of ${total}. Set sizes and overlap counts came from the currently drawn ${validation.setCount === 3 ? 'three-set' : 'two-set'} Venn diagram. The displayed family was adjusted with Holm's method and the reporting threshold was adjusted p < 0.05.`,
        resultsText: [
          `${results.length} overlap enrichment test${results.length === 1 ? ' was' : 's were'} evaluated.`,
          best ? `Smallest Holm-adjusted p-value: ${best.name}, ${formatProbabilityExpressionFromLog(best.adjustedLogPValue, 'adjusted p')}.` : null
        ].filter(Boolean).join(' '),
        analysisSpec: {
          component: 'venn',
          test: 'one-sided hypergeometric overlap enrichment',
          correction: 'Holm',
          universeSize: total,
          observedUnion: validation.union,
          setCount: validation.setCount,
          significanceThreshold: 0.05,
          counts: cloneSimple(counts) || null,
          overlaps: results.map(entry => ({
            name: entry.name,
            rawPValue: Number.isFinite(entry.rawPValue) ? entry.rawPValue : null,
            rawLogPValue: entry.rawLogPValue,
            adjustedPValue: Number.isFinite(entry.adjustedPValue) ? entry.adjustedPValue : null,
            adjustedLogPValue: entry.adjustedLogPValue,
            significant: entry.significant
          }))
        }
      }, { title: 'Reporting and reproducibility' });
    }
    const countsSignature = makeCountsSignature(counts);
    state.analysis.lastSignificance = {
      countsSignature,
      total,
      union: validation.union,
      correction: 'holm',
      results: results.map(entry => ({
        name: entry.name,
        rawPValue: entry.rawPValue,
        rawLogPValue: entry.rawLogPValue,
        adjustedPValue: entry.adjustedPValue,
        adjustedLogPValue: entry.adjustedLogPValue,
        significant: entry.significant
      }))
    };
    captureVennSignificancePanelModel();
    captureVennSessionStateFromActive(projectedVennSession, { reason: 'venn-significance-calculated' });
    debugLog('calculateSignificance complete', { total, overlaps: results.length, countsSignature });
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
    const callbackOwner = options.owner?.session
      ? options.owner
      : getVennCallbackOwner({
          tabId: options.tabId || null,
          reason: `venn-species-${reason}`
        });
    if(!isVennCallbackOwnerCurrent(callbackOwner)){
      return null;
    }
    cancelPendingSpeciesDetection(reason, { tabId: callbackOwner.tabId || null });
    const detection = getSpeciesDetectionState();
    const genes = Array.isArray(options.genes) ? options.genes.slice() : getAllGenes();
    const owner = beginVennAnalysisRequest('species', {
      owner: callbackOwner,
      reason: `venn-species-${reason}`
    });
    if(!owner?.token){
      return null;
    }
    try {
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
      detection.active = {
        controller,
        cacheKey,
        reason,
        tabId: owner.tabId || null
      };
      if(isVennAnalysisOwnerActive(owner)){
        setSpeciesIndicator(null);
      }
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
            if(isVennAnalysisOwnerActive(owner)){
              setSpeciesIndicator(null);
            }
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
    } finally {
      finishVennAnalysisRequest(owner, 'species');
    }
  }

  function captureVennGoAnalysisOptions(){
    const sources = state.ui.goCategoryChecks.filter(cb => cb.checked).map(cb => cb.value);
    let background;
    let domainScope;
    if(state.ui.goUseAllBackground?.checked){
      const bg = getAllGenes().map(g => g.trim().toUpperCase()).filter(Boolean);
      if(bg.length){
        background = bg;
        domainScope = 'custom';
      }
    }
    return {
      sources: sources.slice(),
      background: Array.isArray(background) ? background.slice() : undefined,
      domainScope
    };
  }

  function captureVennStringAnalysisOptions(){
    return {
      networkType: queryVennRoot('input[name="stringNetworkType"]:checked')?.value || 'functional',
      edgeMeaning: queryVennRoot('input[name="stringEdgeMeaning"]:checked')?.value || 'evidence',
      sources: [...(resolveVennRoot()?.querySelectorAll?.('.stringSource:checked') || [])].map(el => el.value),
      fallbackCode: state.ui.speciesSelect?.selectedOptions?.[0]?.dataset?.string || ''
    };
  }

  async function runGOAnalysis(genes, organism, options = {}) {
    const callbackOwner = options.owner?.session
      ? options.owner
      : getVennCallbackOwner({ tabId: options.tabId || null, reason: 'venn-go-analysis-start' });
    const requestConfig = options.requestConfig && typeof options.requestConfig === 'object'
      ? {
          sources: Array.isArray(options.requestConfig.sources) ? options.requestConfig.sources.slice() : [],
          background: Array.isArray(options.requestConfig.background) ? options.requestConfig.background.slice() : undefined,
          domainScope: options.requestConfig.domainScope || undefined
        }
      : (isVennCallbackOwnerActive(callbackOwner) ? captureVennGoAnalysisOptions() : null);
    const owner = beginVennAnalysisRequest('go', { owner: callbackOwner, reason: 'venn-go-analysis-start' });
    if(!owner?.token){
      return;
    }
    try {
      const activeResultsTab = normalizeAnalysisResultsTab(options.activeResultsTab || 'go');
      const formatted = (Array.isArray(genes) ? genes : []).map(g => String(g || '').trim().toUpperCase()).filter(Boolean);
      if (!formatted.length) {
        if (isVennAnalysisOwnerActive(owner) && state.ui.goResults) state.ui.goResults.innerHTML = '<i>No genes for analysis</i>';
        return;
      }
      const org = String(organism || owner.session?.results?.speciesValue || (isVennAnalysisOwnerActive(owner) ? state.ui.speciesSelect?.value : '') || '').trim();
      if (!org) {
        if (isVennAnalysisOwnerActive(owner) && state.ui.goResults) state.ui.goResults.innerHTML = '<div>Please select a species before running GO analysis.</div>';
        return;
      }
      const sources = requestConfig?.sources || [];
      if (!sources.length) {
        if (isVennAnalysisOwnerActive(owner) && state.ui.goResults) state.ui.goResults.innerHTML = '<div>Please select at least one GO category.</div>';
        return;
      }
      const service = Shared.goAnalysis;
      if (!service || typeof service.profile !== 'function') {
        console.warn('venn: Shared.goAnalysis.profile unavailable');
        if (isVennAnalysisOwnerActive(owner) && state.ui.goResults) state.ui.goResults.innerHTML = '<div>GO analysis service unavailable.</div>';
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
      const background = requestConfig?.background;
      const domainScope = requestConfig?.domainScope;
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
    } finally {
      finishVennAnalysisRequest(owner, 'go');
    }
  }

  async function runStringAnalysis(genes, organism, options = {}) {
    const callbackOwner = options.owner?.session
      ? options.owner
      : getVennCallbackOwner({ tabId: options.tabId || null, reason: 'venn-string-analysis-start' });
    const requestConfig = options.requestConfig && typeof options.requestConfig === 'object'
      ? {
          networkType: options.requestConfig.networkType || 'functional',
          edgeMeaning: options.requestConfig.edgeMeaning || 'evidence',
          sources: Array.isArray(options.requestConfig.sources) ? options.requestConfig.sources.slice() : [],
          fallbackCode: options.requestConfig.fallbackCode || ''
        }
      : (isVennCallbackOwnerActive(callbackOwner) ? captureVennStringAnalysisOptions() : null);
    const owner = beginVennAnalysisRequest('string', { owner: callbackOwner, reason: 'venn-string-analysis-start' });
    if(!owner?.token){
      return;
    }
    try {
      const activeResultsTab = normalizeAnalysisResultsTab(options.activeResultsTab || 'string');
      const formatted = (Array.isArray(genes) ? genes : []).map(g => String(g || '').trim().toUpperCase()).filter(Boolean);
      if (!formatted.length) {
        if (isVennAnalysisOwnerActive(owner)) {
          if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '';
          if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<i>No genes for analysis</i>';
          if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
        }
        return;
      }
      const org = String(organism || owner.session?.results?.speciesValue || (isVennAnalysisOwnerActive(owner) ? state.ui.speciesSelect?.value : '') || '').trim();
      if (!org) {
        if (isVennAnalysisOwnerActive(owner)) {
          if (state.ui.stringNetwork) state.ui.stringNetwork.innerHTML = '';
          if (state.ui.stringResults) state.ui.stringResults.innerHTML = '<div>Please select a species before running STRING analysis.</div>';
          if (state.ui.stringNetworkExport) state.ui.stringNetworkExport.style.display = 'none';
        }
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
      const networkType = requestConfig?.networkType || 'functional';
      const edgeMeaning = requestConfig?.edgeMeaning || 'evidence';
      const sources = requestConfig?.sources || [];
      const fallbackCode = requestConfig?.fallbackCode || '';
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
    } finally {
      finishVennAnalysisRequest(owner, 'string');
    }
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
      const serialized = serializeVennAuxiliarySvg(currentSvg, 'go-chart');
      debugLog('buildGoChartSvgString complete', {
        width: currentSvg.getAttribute('width') || null,
        height: currentSvg.getAttribute('height') || null
      });
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

  function configureStage(style, options = {}) {
    if (options.preserveContent !== true) {
      clearSVG();
    }
    hideVennEmptyPlotNotice();
    const stage = state.ui.stage;
    if (!stage) return null;
    if (typeof chartStyle.prepareSvg === 'function') {
      chartStyle.prepareSvg(stage, { scopeId: 'venn' });
    }
    if(stage?.dataset){
      stage.dataset.fontScope = 'venn';
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
    if (stage.dataset) {
      stage.dataset.vennLayoutWidth = String(stageWidth);
      stage.dataset.vennLayoutHeight = String(stageHeight);
    }
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

  function bindVennTitleInlineInteraction(node, ownerSession = null){
    const owner = ensureVennSessionOwnershipShape(ownerSession || getActiveVennSessionForState());
    if(!node || !owner || typeof makeEditable !== 'function'){ return false; }
    makeEditable(node, txt => {
      const previous = owner.state?.titleText != null ? String(owner.state.titleText) : '';
      const nextValue = txt != null ? String(txt) : '';
      if(previous === nextValue){ return; }
      const apply = value => {
        const normalized = value != null ? String(value) : '';
        patchVennVisualState(owner, { titleText: normalized }, { reason: 'venn-title-edit' });
        if(node.textContent !== normalized){ node.textContent = normalized; }
        scheduleVennDrawForSession(owner, { reason: 'venn-title-edit' });
      };
      apply(nextValue);
      recordVennTitleChange(previous, nextValue, apply);
    });
    return true;
  }

  function rehydrateVennInlineTextInteractions(stage, ownerSession = null){
    const title = stage?.querySelector?.('[data-font-role="graphTitle"]') || null;
    return title ? bindVennTitleInlineInteraction(title, ownerSession) : true;
  }

  function renderPlotTitle({ stageWidth, stageHeight, fontFamily, textColor, fontSizePx, defaultText, interactive = true }) {
    const minimumTitleBand = Math.max(fontSizePx * 2, 28);
    const defaultTitleX = stageWidth / 2;
    const defaultTitleY = Math.max(fontSizePx * 1.6, minimumTitleBand * 0.55);
    const savedPosition = resolveVennSavedLabelPosition('title', stageWidth, stageHeight);
    const absoluteTitleX = savedPosition?.x ?? defaultTitleX;
    const absoluteTitleY = savedPosition?.y ?? defaultTitleY;
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
    markFontEditable(titleText, 'graphTitle', 'graphTitle', { register: interactive });
    if(interactive){
      bindVennTitleInlineInteraction(titleText, getVennProjectionSession({ reason: 'venn-title-bind' }));
      enableVennTextDrag(titleText, {
        key: 'title',
        fallbackPosition: { x: defaultTitleX, y: defaultTitleY }
      });
    }
    const hasVisibleTitle = String(titleText.textContent || '').trim().length > 0;
    const displayedTitleBounds = hasVisibleTitle
      ? measureVennTextNodeBox(titleText, fontSizePx, fontFamily)
      : null;
    const titleAnchorOffsetY = displayedTitleBounds
      ? displayedTitleBounds.y - absoluteTitleY
      : -fontSizePx;
    const layoutTitleTop = defaultTitleY + titleAnchorOffsetY;
    const layoutTitleHeight = displayedTitleBounds?.height || fontSizePx * 1.2;
    const titleBandBottom = hasVisibleTitle
      ? Math.max(
        minimumTitleBand,
        layoutTitleTop + layoutTitleHeight + fontSizePx * VENN_DIAGRAM_LAYOUT.titleGapEm
      )
      : VENN_DIAGRAM_LAYOUT.outerPaddingPx;
    return { titleText, titleBandBottom };
  }

  function measureVennStyledSetLabel(text, key, style, fontFamily, textColor) {
    const probe = makeEl('text', {
      x: -10000,
      y: -10000,
      'font-size': style.fontSizePx,
      'text-anchor': 'middle',
      fill: textColor,
      'font-family': fontFamily,
      visibility: 'hidden',
      'pointer-events': 'none'
    });
    probe.textContent = text;
    markFontEditable(probe, 'setLabel', key, { register: false });
    const box = measureVennTextNodeBox(probe, style.fontSizePx, fontFamily);
    probe.remove();
    return { width: box.width, height: box.height };
  }

  function fitAndDraw(d, style, labels, counts) {
    const metrics = configureStage(style);
    if (!metrics) return;
    const { stage, svgBox, svgBoxRect, stageWidth, stageHeight, fontFamily, textColor } = metrics;
    const { titleBandBottom } = renderPlotTitle({
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
    const rawCircles = [
      { id: 'A', x: d.Ax, y: d.Ay, r: d.rA, color: style.colorA },
      { id: 'B', x: d.Bx, y: d.By, r: d.rB, color: style.colorB }
    ];
    if (counts.nC > 0) {
      rawCircles.push({ id: 'C', x: d.Cx, y: d.Cy, r: d.rC, color: style.colorC });
    }
    const labelTextById = {
      A: `${labels.A} (${counts.nA})`,
      B: `${labels.B} (${counts.nB})`,
      C: `${labels.C} (${counts.nC})`
    };
    const labelMetrics = Object.fromEntries(rawCircles.map(circle => [
      circle.id,
      measureVennStyledSetLabel(
        labelTextById[circle.id],
        `set-${circle.id}`,
        style,
        fontFamily,
        textColor
      )
    ]));
    const layoutOwner = getVennProjectionSession({ reason: 'venn-diagram-layout' });
    const diagramLayout = resolveVennDiagramLayoutForSession(layoutOwner, {
      stageWidth,
      stageHeight,
      fontSize: style.fontSizePx,
      circles: rawCircles,
      labelMetrics,
      titleBandBottom
    });
    const circleById = new Map(diagramLayout.circles.map(circle => [circle.id, circle]));
    const transform = diagramLayout.transform || { scale: diagramLayout.scale || 1, tx: 0, ty: 0 };
    const scale = transform.scale;
    function toPx(x, y) {
      return { x: x * scale + transform.tx, y: y * scale + transform.ty };
    }
    const circles = rawCircles.map(circle => ({ ...circle, ...(circleById.get(circle.id) || {}) }));
    for (const c of circles) {
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
        cx: c.x,
        cy: c.y,
        r: c.r,
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
      const fallbackPosition = { x, y };
      if (resolvedKey) {
        t.dataset.vennLabelKey = resolvedKey;
        if (meta?.side) t.dataset.vennLabelSide = meta.side;
        if (resolvedRole === 'setLabel') t.dataset.vennSetLabel = regionCode || resolvedKey.replace(/^set-/, '');
        applyVennSavedLabelPosition(t, resolvedKey, {
          stageWidth: W,
          stageHeight: H,
          fontSize: style.fontSizePx,
          fontFamily
        });
      }
      enableVennTextDrag(t, { key: resolvedKey, fallbackPosition });
      return t;
    }
    for (const circle of rawCircles) {
      const placement = diagramLayout.labels?.[circle.id];
      const renderedCircle = circleById.get(circle.id);
      if (!placement || !renderedCircle) continue;
      addText(labelTextById[circle.id], placement.x, placement.y, null, {
        role: 'setLabel',
        key: `set-${circle.id}`,
        side: placement.side
      });
    }
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
    const viewportOptions = {
      padding: 0,
      debugLabel: 'venn-diagram',
      baseViewport: { width: stageWidth, height: stageHeight },
      preserveAspectRatio: 'xMidYMid meet',
      remeasure: false
    };
    ensureGraphViewport(stage, viewportOptions);
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
      ensureGraphViewport(stage, viewportOptions);
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
      const sourceIndex = Number.isFinite(column?.index) ? column.index : idx;
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
      if (sourceIndex === 0 && style.colorA) color = style.colorA;
      else if (sourceIndex === 1 && style.colorB) color = style.colorB;
      else if (sourceIndex === 2 && style.colorC) color = style.colorC;
      else if (palette.length) {
        const paletteIndex = sourceIndex >= 3 ? (sourceIndex - 3) : sourceIndex;
        color = palette[paletteIndex % palette.length];
      }
      return {
        key: indexToSetKey(sourceIndex),
        label: column?.label || `Set ${idx + 1}`,
        size: uniqueKeys.size,
        color,
        keys: uniqueKeys,
        keyToDisplay,
        sourceIndex
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

  function getUpSetRuntimeCache() {
    const session = ensureVennSessionOwnershipShape(getActiveVennSessionForState());
    return session?.cache || null;
  }

  function isCompleteUpSetRenderModel(model) {
    return !!model
      && Array.isArray(model.sets)
      && model.sets.length > 0
      && model.sets.every(set => Number.isFinite(set?.size))
      && Array.isArray(model.intersections)
      && model.intersections.every(entry => (
        Number.isFinite(entry?.size)
        && Array.isArray(entry?.sets)
      ));
  }

  function getCachedUpSetRenderModel() {
    const model = getUpSetRuntimeCache()?.upsetRenderModel || null;
    return isCompleteUpSetRenderModel(model) ? model : null;
  }

  function rememberUpSetRenderModel(sets, intersections) {
    const cache = getUpSetRuntimeCache();
    if (!cache) return;
    const model = {
      sets: Array.isArray(sets) ? sets.slice() : [],
      intersections: Array.isArray(intersections) ? intersections.slice() : [],
      needsIntersectionBuild: false
    };
    cache.upsetRenderModel = isCompleteUpSetRenderModel(model) ? model : null;
  }

  function measureUpSetText(text, font, fallbackFontSize) {
    const value = String(text || '');
    const cache = getUpSetRuntimeCache()?.upsetTextMeasurements || null;
    const key = `${font}\u0000${value}`;
    if (cache?.has(key)) {
      return cache.get(key);
    }
    const measured = typeof chartStyle.measureText === 'function'
      ? chartStyle.measureText(value, font)
      : value.length * fallbackFontSize * 0.6;
    const width = Number.isFinite(measured) ? measured : value.length * fallbackFontSize * 0.6;
    if (cache) {
      if (cache.size >= 256) {
        cache.delete(cache.keys().next().value);
      }
      cache.set(key, width);
    }
    return width;
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
    const drawOptions = options?.drawOptions || {};
    const resizePreview = drawOptions?.resizePhase === 'move';
    const metrics = configureStage(style, { preserveContent: true });
    if (!metrics) return;
    const { stage, svgBox, svgBoxRect, stageWidth, stageHeight, defaultWidth, defaultHeight, fontFamily, textColor } = metrics;
    const previousRenderParent = activeVennRenderParent;
    const renderGroup = document.createElementNS(NS, 'g');
    renderGroup.dataset.upsetStagedFrame = 'true';
    renderGroup.style.visibility = 'hidden';
    renderGroup.style.pointerEvents = 'none';
    stage.appendChild(renderGroup);
    activeVennRenderParent = renderGroup;
    let frameCommitted = false;
    const commitUpSetFrame = () => {
      if (frameCommitted) return;
      Array.from(stage.childNodes || []).forEach(node => {
        if (node !== renderGroup && node.parentNode === stage) {
          stage.removeChild(node);
        }
      });
      delete renderGroup.dataset.upsetStagedFrame;
      renderGroup.style.removeProperty('visibility');
      renderGroup.style.removeProperty('pointer-events');
      frameCommitted = true;
    };
    try {
    stage.onclick = null;
    const { titleBandBottom } = renderPlotTitle({
      stageWidth,
      stageHeight,
      fontFamily,
      textColor,
      fontSizePx: style.fontSizePx,
      defaultText: DEFAULT_UPSET_TITLE,
      interactive: !resizePreview
    });
    const topPadding = Math.max(titleBandBottom, style.fontSizePx * 2.6 + 8);

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
    if (!resizePreview) {
      rememberUpSetRenderModel(sets, allIntersections);
    }
    let intersections = allIntersections.slice();
    if (!(upsetData && upsetData.needsIntersectionBuild) && !settings.showEmpty) {
      intersections = allIntersections.filter(entry => entry.size > 0);
    }

    if (!intersections.length) {
      if (!resizePreview) {
        updateUpSetRegionContext(sets, [], '');
      }
      const emptyText = makeEl('text', {
        x: stageWidth / 2,
        y: stageHeight / 2,
        'text-anchor': 'middle',
        'font-size': style.fontSizePx * 1.1,
        fill: textColor
      });
      emptyText.textContent = 'No intersections to display';
      commitUpSetFrame();
      ensureUpSetFontBindings(stage);
      ensureGraphViewport(stage, {
        padding: 0,
        debugLabel: 'upset-empty',
        baseViewport: { width: stageWidth, height: stageHeight },
        remeasure: false,
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
    if (!resizePreview) {
      updateUpSetRegionContext(sets, intersections, preferredRegionCode);
    }
    const regionOptions = regionSelect
      ? new Set(Array.from(regionSelect.options || []).map(option => option.value))
      : null;

    const pad = Math.max(8, Math.min(20, stageWidth * 0.045, stageHeight * 0.045));
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
    const gap = Math.max(style.fontSizePx * 0.65, 10);
    const setAxisHeight = Math.max(style.fontSizePx * 3.4, 52);
    const innerHeight = Math.max(1, stageHeight - topPadding - pad);
    const contentHeight = Math.max(1, innerHeight - setAxisHeight);
    const sharedPanelHeight = Math.max(1, contentHeight - gap);
    const minRowHeight = Math.max(dotSizePx * 2.4, style.fontSizePx * 1.15);
    const minMatrixHeight = minRowHeight * sets.length;
    const minBarChartHeight = Math.max(style.fontSizePx * 4, 48);
    const matrixShare = clampNumber(
      0.28 + Math.max(0, sets.length - 3) * 0.025,
      0.28,
      0.28,
      0.48
    );
    let matrixHeight;
    let barChartHeight;
    if (sharedPanelHeight >= minMatrixHeight + minBarChartHeight) {
      matrixHeight = Math.max(minMatrixHeight, sharedPanelHeight * matrixShare);
      matrixHeight = Math.min(matrixHeight, sharedPanelHeight - minBarChartHeight);
      barChartHeight = sharedPanelHeight - matrixHeight;
    } else {
      const minimumTotal = Math.max(1, minMatrixHeight + minBarChartHeight);
      matrixHeight = sharedPanelHeight * (minMatrixHeight / minimumTotal);
      barChartHeight = Math.max(1, sharedPanelHeight - matrixHeight);
    }
    const rowHeight = matrixHeight / Math.max(sets.length, 1);

    const barTop = topPadding;
    const barBottom = barTop + barChartHeight;
    const matrixTop = barBottom + gap;
    const matrixBottom = matrixTop + matrixHeight;

    const contentWidth = Math.max(1, stageWidth - pad * 2);
    const setLabelFontSize = Math.max(10, Math.round(style.fontSizePx));
    const axisTickFontSize = Math.max(10, Math.round(style.fontSizePx));
    const axisLabelFontSize = Math.max(10, Math.round(style.fontSizePx));
    const valueLabelFontSize = Math.max(9, Math.round(style.fontSizePx * 0.9));
    const labelFont = `${setLabelFontSize}px ${fontFamily}`;
    const countFont = `${axisTickFontSize}px ${fontFamily}`;
    const measure = (text, font) => measureUpSetText(text, font, style.fontSizePx);
    const fitLabelToWidth = (value, maxWidth, font) => {
      const text = String(value ?? '');
      if (!text || maxWidth <= 0) return '';
      if (measure(text, font) <= maxWidth) return text;
      const ellipsis = '\u2026';
      const ellipsisWidth = measure(ellipsis, font);
      if (ellipsisWidth > maxWidth) return '';
      let low = 0;
      let high = text.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (measure(`${text.slice(0, middle)}${ellipsis}`, font) <= maxWidth) {
          low = middle;
        } else {
          high = middle - 1;
        }
      }
      return `${text.slice(0, low)}${ellipsis}`;
    };
    const buildIntegerTicks = (maximum, desiredIntervalCount) => {
      const limit = Math.max(0, Math.round(maximum));
      if (!limit) return [0];
      const intervalCount = Math.max(1, Math.min(limit, Math.floor(desiredIntervalCount) || 1));
      return Array.from(
        new Set(Array.from({ length: intervalCount + 1 }, (_, index) => (
          Math.round(limit * index / intervalCount)
        )))
      );
    };
    const maxLabelWidth = Math.max(...sets.map(set => measure(set.label, labelFont)), 0);
    const maxSetSize = Math.max(...sets.map(set => set.size), 0);
    const maxIntersection = Math.max(...intersections.map(entry => entry.size), 0) || 1;
    const countAreaWidth = settings.showSetCounts ? measure(formatCount(maxSetSize), countFont) + 6 : 0;
    const barLabelGap = Math.max(4, style.fontSizePx * 0.4);

    const columnCount = Math.max(1, intersections.length);
    const maxIntersectionLabelWidth = settings.showCounts
      ? measure(formatCount(maxIntersection), `${valueLabelFontSize}px ${fontFamily}`)
      : 0;
    const minColumnWidth = Math.max(
      dotSizePx * 2.35,
      maxIntersectionLabelWidth + 4,
      7
    );
    const minMatrixWidth = minColumnWidth * columnCount;
    const desiredLabelAreaWidth = Math.max(maxLabelWidth + 8, 36);
    const minSetBarAreaWidth = Math.max(32, style.fontSizePx * 2.4);
    const desiredSetBarAreaWidth = Math.min(
      Math.max(contentWidth * 0.22, minSetBarAreaWidth),
      Math.max(minSetBarAreaWidth, contentWidth * 0.34)
    );
    const fixedHorizontalSpace = countAreaWidth + gap + barLabelGap;
    const flexibleWidth = Math.max(1, contentWidth - fixedHorizontalSpace);
    let setBarAreaWidth = desiredSetBarAreaWidth;
    let labelAreaWidth = desiredLabelAreaWidth;
    let matrixWidth = flexibleWidth - setBarAreaWidth - labelAreaWidth;
    if (matrixWidth < minMatrixWidth) {
      const setBarReduction = Math.min(
        minMatrixWidth - matrixWidth,
        Math.max(0, setBarAreaWidth - minSetBarAreaWidth)
      );
      setBarAreaWidth -= setBarReduction;
      matrixWidth += setBarReduction;
    }
    if (matrixWidth < minMatrixWidth) {
      const labelReduction = Math.min(
        minMatrixWidth - matrixWidth,
        Math.max(0, labelAreaWidth)
      );
      labelAreaWidth -= labelReduction;
      matrixWidth += labelReduction;
    }
    if (matrixWidth < minMatrixWidth) {
      const matrixScale = Math.max(0.45, matrixWidth / Math.max(minMatrixWidth, 1));
      setBarAreaWidth = Math.max(20, setBarAreaWidth * matrixScale);
      matrixWidth = Math.max(1, flexibleWidth - setBarAreaWidth - labelAreaWidth);
    }
    matrixWidth = Math.max(1, matrixWidth);
    const columnWidth = matrixWidth / columnCount;
    const matrixDotRadius = Math.max(
      0.75,
      Math.min(dotSizePx, rowHeight * 0.32, columnWidth * 0.32)
    );

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
    const xMajorTickLength = settings.xMajorTickLength ?? tickLength;
    const yMajorTickLength = settings.yMajorTickLength ?? tickLength;
    const tickLabelGap = axisMetrics.tickLabelGap ?? Math.max(3, Math.round(style.fontSizePx * 0.35));
    const axisTitleGap = axisMetrics.axisTitleGap ?? Math.max(4, Math.round(style.fontSizePx * 0.75));
    const axisWidthBase = clampNumber(settings.axisWidth, DEFAULT_UPSET_SETTINGS.axisWidth, 0.25, 10);
    const axisWidth = typeof chartStyle.scaleStrokeWidth === 'function'
      ? chartStyle.scaleStrokeWidth(axisWidthBase, style.scaleInfo, { min: 0, max: 8, context: 'upset-axis', exact: true })
      : axisWidthBase;
    const activeMarkOpacity = clampNumber(style.opacity, 1, 0.05, 1);
    const barBorderColor = sanitizeColor(style.borderColor, axisColor);
    const barBorderWidth = clampNumber(style.borderWidth, Math.max(0.5, axisWidth * 0.75), 0);

    const setTickFontSize = axisTickFontSize;
    const setAxisLabelFontSize = axisLabelFontSize;
    const setTickBaselineDy = '0.8em';
    const setAxisLabelBaselineDy = '0.8em';
    const setTickOffset = Math.max(4, Math.round(style.fontSizePx * 0.32));
    const setTitleGap = Math.max(2, Math.round((axisTitleGap + 1) * 0.4));
    const setTickTextHeight = Math.max(8, Math.round(setTickFontSize * 0.95));
    const setAxisLabelHeight = Math.max(9, Math.round(setAxisLabelFontSize * 0.95));
    const requiredSetAxisBottomSpace = xMajorTickLength + setTickOffset + setTickTextHeight + setTitleGap + setAxisLabelHeight + 4;
    const axisYPreferred = matrixBottom + setAxisHeight * 0.35;
    const axisYMin = matrixBottom + Math.max(2, Math.round(style.fontSizePx * 0.2));
    const axisYMax = stageHeight - requiredSetAxisBottomSpace;
    const axisY = axisYMax >= axisYMin
      ? Math.min(axisYMax, Math.max(axisYMin, axisYPreferred))
      : axisYMin;
    let setTickLabelY = axisY + xMajorTickLength + setTickOffset;
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

    const intersectionTickIntervals = Math.max(
      1,
      Math.min(4, Math.floor(barChartHeight / Math.max(axisTickFontSize * 2.2, 20)))
    );
    const tickValues = buildIntegerTicks(maxIntersection, intersectionTickIntervals);
    const tickLabels = tickValues.map(v => formatCount(v));
    const maxTickLabelWidth = Math.max(...tickLabels.map(lbl => measure(lbl, countFont)), 0);
    const axisX = Math.max(pad + 6, matrixX - (yMajorTickLength + tickLabelGap + maxTickLabelWidth + 6));
    const intersectionLayout = intersections.map((entry, idx) => {
      const columnCenter = matrixX + columnWidth * (idx + 0.5);
      const barWidth = Math.max(0.75, columnWidth * 0.6);
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
        x2: axisX - yMajorTickLength,
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
        const horizontalGridSegments = [];
        occlusionRanges.forEach(([rangeStart, rangeEnd]) => {
          if (rangeStart > (cursorX + 0.5)) {
            horizontalGridSegments.push({
              x1: cursorX,
              y1: y,
              x2: rangeStart,
              y2: y
            });
          }
          if (rangeEnd > cursorX) {
            cursorX = rangeEnd;
          }
        });
        if (cursorX < (gridEndX - 0.5)) {
          horizontalGridSegments.push({
            x1: cursorX,
            y1: y,
            x2: gridEndX,
            y2: y
          });
        }
        const horizontalGridPathData = svgGeometry.buildCompoundLinePath(horizontalGridSegments);
        if(horizontalGridPathData){
          makeEl('path', {
            d: horizontalGridPathData,
            fill: 'none',
            stroke: settings.gridColor,
            'stroke-width': 1,
            'data-venn-upset-horizontal-grid': '1',
            'data-venn-upset-horizontal-grid-segment-count': horizontalGridSegments.length
          });
        }else{
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
        x: axisX - yMajorTickLength - tickLabelGap,
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
      axisX - (yMajorTickLength + tickLabelGap + maxTickLabelWidth + axisTitleGap + style.fontSizePx * 0.2)
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
      if (!resizePreview) {
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
          r: matrixDotRadius,
          fill: settings.inactiveDotColor,
          opacity: 1,
          'data-upset-matrix-cell': entry.code,
          'data-upset-column-code': entry.code,
          'data-upset-set-key': set.key
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
        const activeDotSizePx = Math.max(
          0.75,
          Math.min(
            clampNumber(matrixStyle.size, settings.dotSize, 2, 12) * geometryScale,
            rowHeight * 0.38,
            columnWidth * 0.38
          )
        );
        const activeGroup = makeEl('g', {
          color: sanitizeColor(matrixStyle.fill, activeColor),
          opacity: clampNumber(matrixStyle.opacity, activeMarkOpacity, 0, 1),
          cursor: 'pointer',
          'data-upset-trace-kind': 'matrix',
          'data-upset-trace-id': entry.code
        });
        if (!resizePreview) {
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
        }

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
        fill: textColor,
        'data-upset-set-label': set.key,
        'data-upset-full-label': set.label,
        'aria-label': set.label
      });
      const fittedLabel = fitLabelToWidth(set.label, Math.max(0, labelAreaWidth - 4), labelFont);
      label.textContent = fittedLabel;
      if (fittedLabel !== set.label) {
        const labelTitle = document.createElementNS(NS, 'title');
        labelTitle.textContent = set.label;
        label.appendChild(labelTitle);
      }
      const barWidth = maxSetSize > 0 ? (set.size / maxSetSize) * barAreaWidth : 0;
      const barHeight = Math.min(
        rowHeight * 0.72,
        Math.max(matrixDotRadius * 1.6, rowHeight * 0.5)
      );
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
      if (!resizePreview) {
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
      }
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
      'stroke-width': axisWidth,
      'data-upset-axis': 'set-x'
    });

    const maxSetTickWidth = Math.max(
      measure(formatCount(0), countFont),
      measure(formatCount(maxSetSize), countFont)
    );
    const setTickIntervals = Math.max(
      1,
      Math.min(4, Math.floor(barAreaWidth / Math.max(maxSetTickWidth + 12, 28)))
    );
    const setTickValues = buildIntegerTicks(maxSetSize, setTickIntervals);
    setTickValues.forEach(value => {
      const x = maxSetSize > 0
        ? setBarX + barAreaWidth - (value / maxSetSize) * barAreaWidth
        : setBarX + barAreaWidth;
      makeEl('line', {
        x1: x,
        y1: axisY,
        x2: x,
        y2: axisY + xMajorTickLength,
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
    const yAxisLine = makeEl('line', {
      ...yAxisLineAttrs,
      'data-upset-axis': 'intersection-y'
    });
    const xAxisLine = makeEl('line', {
      ...xAxisLineAttrs,
      'data-upset-axis': 'intersection-x'
    });
    if (!resizePreview && axisControls && typeof axisControls.registerAxisElement === 'function') {
      const axisOwner = getVennProjectionSession({ reason: 'venn-upset-axis-bind' });
      axisControls.registerAxisElement(yAxisLine, createUpSetAxisControlConfig('y', axisOwner));
      axisControls.registerAxisElement(xAxisLine, createUpSetAxisControlConfig('x', axisOwner));
    }
    debugLog('upset axes rendered in foreground', {
      axisX,
      axisY: barBottom,
      axisWidth
    });

    commitUpSetFrame();
    ensureUpSetFontBindings(stage, { register: !resizePreview });
    const viewportOptions = {
      padding: 0,
      debugLabel: 'upset-plot',
      baseViewport: { width: stageWidth, height: stageHeight },
      preserveAspectRatio: 'xMidYMid meet',
      remeasure: false
    };
    ensureGraphViewport(stage, viewportOptions);
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
      ensureGraphViewport(stage, viewportOptions);
    }
    debugLog('drawUpSet complete', {
      intersections: intersections.length,
      sets: sets.length,
      maxIntersection,
      maxSetSize
    });
    } finally {
      activeVennRenderParent = previousRenderParent;
      if (!frameCommitted && renderGroup.parentNode === stage) {
        stage.removeChild(renderGroup);
      }
    }
  }

  function drawFromLists(drawOptions = {}) {
    const resizePreview = drawOptions?.resizePhase === 'move';
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
    if (!resizePreview) {
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
    }
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
    if (!resizePreview) {
      chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    }
    const labels = getCurrentVennLabelMap();
    const plotType = getActivePlotType();
    if (!resizePreview) {
      updateCountLabels(labels);
      if (plotType !== 'upset') {
        updateRegionSelect(labels, counts);
      }
      updateColorLabels(labels);
    }
    if (plotType === 'upset') {
      style.upset = resolveUpSetSettings();
      const upsetData = (resizePreview && getCachedUpSetRenderModel())
        || resolveUpSetTableData(parsed, labels, style);
      drawUpSet(counts, labels, style, { upsetData, drawOptions });
    } else {
      ensureVennRegionOptions();
      state.analysis.lastUpSetRegionMap = null;
      state.analysis.lastUpSetIntersections = null;
      const pairs = { nAB: counts.AB + counts.ABC, nAC: counts.AC + counts.ABC, nBC: counts.BC + counts.ABC };
      const L = layoutFromCounts(counts.nA, counts.nB, counts.nC, pairs.nAB, pairs.nAC, pairs.nBC);
      fitAndDraw(L, style, labels, counts);
    }
    if (!resizePreview) {
      if (state.ui.regionSelect) populateRegion(state.ui.regionSelect.value);
      scheduleSpeciesRecognition('draw-from-lists');
    }
    debugLog('drawFromLists complete', { mode, caseSensitive: cs, counts, cacheSignature: parsed.signature });
  }

  function drawFromNumeric(drawOptions = {}) {
    const resizePreview = drawOptions?.resizePhase === 'move';
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
    if (!resizePreview) {
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
    }
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
    if (!resizePreview) {
      chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    }
    const labels = getCurrentVennLabelMap();
    const plotType = getActivePlotType();
    if (!resizePreview) {
      updateCountLabels(labels);
      if (plotType !== 'upset') {
        updateRegionSelect(labels, counts);
      }
      updateColorLabels(labels);
    }
    if (plotType === 'upset') {
      style.upset = resolveUpSetSettings();
      const upsetData = resizePreview ? getCachedUpSetRenderModel() : null;
      drawUpSet(counts, labels, style, { upsetData, drawOptions });
    } else {
      ensureVennRegionOptions();
      state.analysis.lastUpSetRegionMap = null;
      state.analysis.lastUpSetIntersections = null;
      const L = layoutFromCounts(nA, nB, nC, nAB, nAC, nBC);
      fitAndDraw(L, style, labels, counts);
    }
    if (!resizePreview) {
      if (state.ui.regionSelect) populateRegion(state.ui.regionSelect.value);
      cancelPendingSpeciesDetection('draw-from-numeric', { abortActive: true, resetIndicator: true });
    }
    debugLog('drawFromNumeric complete', { counts });
  }

  function hasListContent(inputs) {
    if (!inputs) return false;
    const sources = getVennAnalysisListSources();
    const present = ['A', 'B', 'C'].some(key => {
      const value = sources[key] || '';
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

  function isVennOverlayHeavy(reason, options = {}) {
    if(options.heavy === true || options.forceOverlay === true){
      return true;
    }
    if(options.heavy === false || options.forceOverlay === false){
      return false;
    }
    const parsedLists = state.analysis?.lastParsedLists?.lists || null;
    const parsedCount = ['A', 'B', 'C'].reduce((total, key) => (
      total + (Array.isArray(parsedLists?.[key]) ? parsedLists[key].length : 0)
    ), 0);
    if(parsedCount >= 1000){
      return true;
    }
    const inputs = state.ui?.inputs || null;
    const textSize = ['A', 'B', 'C'].reduce((total, key) => (
      total + String(inputs?.[key]?.value || '').length
    ), 0);
    if(textSize >= 20000){
      return true;
    }
    const tableInfo = getUpSetTableColumns();
    return Array.isArray(tableInfo?.columns)
      && tableInfo.columns.reduce((total, column) => total + (Array.isArray(column?.values) ? column.values.length : 0), 0) >= 1000;
  }

  const vennOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'venn',
    message: 'Rendering Venn graph...',
    isHeavy: isVennOverlayHeavy,
    getTabId: () => getVennProjectionTabId() || null,
    getHost: () => state.ui?.svgBox || queryVennRoot('#vennGraphPanel .svgbox') || queryVennRoot('#vennGraphPanel')
  });

  async function refreshDiagram(drawOptions = {}) {
    const resizePreview = drawOptions?.resizePhase === 'move';
    bindVennSessionForTab(getVennProjectionTabId() || null, { reason: 'venn-refresh-bind', root: state.ui.root || null }, { apply: false });
    const inputs = state.ui.inputs;
    if (!inputs) {
      console.warn('Debug: venn refreshDiagram called before init');
      return;
    }
    const drawTabId = drawOptions?.tabId || getVennProjectionTabId() || null;
    const execution = Shared.jobs?.createExecutionContext?.({ component: 'venn', tabId: drawTabId || '', kind: 'graph', budgetMs: 10 }) || null;
    const checkpoint = async () => {
      try{ await execution?.checkpoint?.(); }
      catch(err){
        if(execution?.signal?.aborted || execution?.isCurrent?.() === false){ return false; }
        throw err;
      }
      return execution?.isCurrent?.() !== false;
    };
    try {
      const plotType = getActivePlotType();
      const hintedMode = state.analysis.lastDrawMode;
      let mode = null;
      let hasLists = false;
      let hasNumeric = false;
      let hasUpSetLists = false;
      if (resizePreview && (hintedMode === 'lists' || hintedMode === 'numeric')) {
        mode = hintedMode;
      } else {
        hasLists = hasListContent(inputs);
        hasNumeric = hasNumericContent(inputs);
        hasUpSetLists = plotType === 'upset' ? hasUpSetContent(inputs) : hasLists;
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
          captureVennSessionStateFromActive(projectedVennSession, { reason: 'venn-refresh-empty' });
        }
        return;
      }
      if (mode === 'numeric') {
        drawFromNumeric(drawOptions);
      } else {
        drawFromLists(drawOptions);
      }
      if(!(await checkpoint())){
        return false;
      }
      if(!resizePreview && !isProjectingVennSession()){
        captureVennSessionStateFromActive(projectedVennSession, { reason: 'venn-refresh-complete' });
      }
      debugLog('refreshDiagram executed', { mode });
    } catch (err) {
      console.error('venn refreshDiagram error', err);
    }
  }

  function requestScheduledDraw(reason, modeOverride, drawOptions = {}) {
    if (modeOverride) {
      state.analysis.lastDrawMode = modeOverride;
    }
    const session = getActiveVennSessionForState();
    if(session){
      session.timers.scheduleDraw = state.ui.scheduleDraw || session.timers.scheduleDraw || null;
      session.updatedAt = Date.now();
    }
    debug('Debug: venn auto-redraw scheduled', { reason, mode: state.analysis.lastDrawMode }); // Debug: automatic redraw trigger
    const scheduleOptions = {
      ...(drawOptions && typeof drawOptions === 'object' ? drawOptions : {}),
      reason: reason || 'venn-auto-redraw',
      mode: state.analysis.lastDrawMode || null
    };
    if(!scheduleActiveVennDraw(scheduleOptions)){
      debug('Debug: venn auto-redraw fallback', { reason, mode: state.analysis.lastDrawMode }); // Debug: fallback without scheduler
      refreshDiagram(scheduleOptions);
    }
  }

  function createVennResizableBoxOptions(){
    return {
      onResize: phase => {
        debugLog('layout onResize', { phase });
        const resizePhase = typeof phase === 'string' ? phase : '';
        if (resizePhase !== 'start' && resizePhase !== 'observe' && resizePhase !== 'zoom') {
          scheduleActiveVennDraw({
            reason: 'resize',
            source: 'venn-view-refresh',
            viewOnly: true,
            silentOverlay: true,
            force: true,
            resizePhase: resizePhase || null,
            userInitiated: true
          });
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
      tabId: getVennProjectionTabId() || resolveActiveVennTabId() || undefined,
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
      skipScheduleOnResizePhases: () => true,
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
    const legacyData = {
      labelA: inputs.labelA.value,
      labelB: inputs.labelB.value,
      labelC: inputs.labelC.value,
      listA: inputs.A.value,
      listB: inputs.B.value,
      listC: inputs.C.value
    };
    const explicitLegacyKeys = new Set(
      VENN_LEGACY_TABLE_COLUMNS.flatMap(({ labelKey, listKey }) => [labelKey, listKey])
    );
    const liveTable = getLiveVennTableMatrix();
    const payload = {
      type: 'venn',
      exclusions: state.ui.hot?.exportExclusions?.() || { rows: [], cols: [], cells: [] },
      data: {
        ...legacyData,
        table: reconcileVennTableWithLegacyData(liveTable, legacyData, explicitLegacyKeys),
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
    payload.exclusions = { rows: [], cols: [], cells: [] };
    payload.data = {
      labelA: DEFAULT_VENN_LABEL_MAP.A,
      labelB: DEFAULT_VENN_LABEL_MAP.B,
      labelC: DEFAULT_VENN_LABEL_MAP.C,
      listA: '',
      listB: '',
      listC: '',
      table: createVennTableFromLegacyData({
        labelA: DEFAULT_VENN_LABEL_MAP.A,
        labelB: DEFAULT_VENN_LABEL_MAP.B,
        labelC: DEFAULT_VENN_LABEL_MAP.C,
        listA: '',
        listB: '',
        listC: ''
      }),
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
    nextPayload.type = 'venn';
    nextPayload.data = createVennDataPayloadFromTable(existingData, matrix);
    return nextPayload;
  };

  venn.applyTablePayloadData = function applyVennTablePayloadData(payload, matrix, meta = {}){
    if (!Array.isArray(matrix)) {
      return null;
    }
    const nextPayload = payload && typeof payload === 'object'
      ? payload
      : venn.createEmptyPayload();
    const ownerData = meta.tab?.payload?.data;
    const existingData = ownerData && typeof ownerData === 'object' && !Array.isArray(ownerData)
      ? ownerData
      : (nextPayload.data && typeof nextPayload.data === 'object' && !Array.isArray(nextPayload.data)
        ? nextPayload.data
        : {});
    nextPayload.type = 'venn';
    nextPayload.data = createVennDataPayloadFromTable(existingData, matrix);
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
    const operationSession = projectedVennSession;
    const result = await fileIO.saveGraphFile({
      context: 'venn',
      owner: { component: 'venn', tabId: operationSession?.tabId || getVennProjectionTabId() || null },
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
    const operationSession = projectedVennSession;
    const result = await fileIO.saveGraphFileAs({
      context: 'venn',
      owner: { component: 'venn', tabId: operationSession?.tabId || getVennProjectionTabId() || null },
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
    const operationSession = projectedVennSession;
    const operationTabId = String(operationSession?.tabId || getVennProjectionTabId() || '').trim() || null;
    const result = await fileIO.openGraphFile({
      context: 'venn',
      owner: { component: 'venn', tabId: operationTabId },
      setFileHandle: handle => setVennFileHandleForSession(handle, operationSession),
      setFileName: name => setVennFileNameForSession(name, operationSession),
      loadFromFile: (file, operation) => venn.loadFromFile(file, {
        undo: { previous },
        session: operationSession,
        operation,
        tabId: operationTabId
      }),
      triggerInput: () => {
        const input = getVennNodeById('vennGraphFile');
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
      loadVennTableFromPayloadData(d, {
        refresh: true,
        exclusions: normalizedPayload.exclusions,
        source: 'venn-payload-apply'
      });
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
    syncPlotMode(plotType, { updateTitle: false, restoreAspectLock: true });
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
      state.analysis.upsetAxis = normalizeUpSetAxisStyle(upset);
      state.analysis.upsetTraceStyles = cloneUpSetTraceStyles(upset.traceStyles);
    }
    // Restore label positions if saved
    if(s.labelPositions){
      state.labelPositions = normalizeVennLabelPositions(s.labelPositions);
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
    primeVennAnalysisAutoRefreshBaseline(hydratedSession || projectedVennSession, meta?.reason || meta?.source || 'venn-payload-apply');
    primeVennSpeciesAutoDetectionBaseline(hydratedSession || projectedVennSession, normalizedPayload, meta?.reason || meta?.source || 'venn-payload-apply');
    if(meta.recordUndo !== false){
      const undoPrevious = meta.undoPrevious || captureVennSnapshot();
      const next = captureVennSnapshot();
      recordVennChange(meta.undoLabel || 'venn:load-file', undoPrevious, next);
    }
    captureVennSessionStateFromActive(hydratedSession || projectedVennSession, { reason: meta?.source ? `venn-payload-${meta.source}` : 'venn-payload-apply' });
    debugLog('Debug: venn payload applied', { source: meta.source || 'unknown' });
    return true;
  }

  venn.loadFromFile = function (file, options = {}) {
    const operationSession = options.session || projectedVennSession;
    const ownerTabId = String(options?.tabId || options?.operation?.tabId || operationSession?.tabId || '').trim() || null;
    const ownerIsActive = !ownerTabId || String(getVennProjectionTabId() || '') === ownerTabId;
    const undoPrevious = options?.undo?.previous || (ownerIsActive ? captureVennSnapshot() : null);
    const operation = fileIO?.createGraphOpenOperation?.({
      context: 'venn',
      owner: { component: 'venn', tabId: ownerTabId },
      operation: options?.operation
    }) || options?.operation || null;
    const applyPayload = obj => {
      if(typeof fileIO?.routeGraphOpenPayload === 'function'){
        const routed = fileIO.routeGraphOpenPayload({
          context: 'venn',
          component: 'venn',
          operation,
          owner: { component: 'venn', tabId: ownerTabId },
          payload: obj,
          apply: value => applyVennPayload(value, {
            source: 'file',
            tabId: ownerTabId,
            undoPrevious,
            recordUndo: true,
            undoLabel: 'venn:load-file'
          }),
          reason: 'venn-graph-file-open'
        });
        return routed?.value === true;
      }
      const fallbackOwnerIsCurrent = !ownerTabId || String(getVennProjectionTabId() || '') === ownerTabId;
      return fallbackOwnerIsCurrent && applyVennPayload(obj, {
        source: 'file',
        tabId: ownerTabId,
        undoPrevious,
        recordUndo: true,
        undoLabel: 'venn:load-file'
      });
    };
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        if(!applyPayload(obj)){
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
    const previousType = normalizePlotType(state.ui?.root?.dataset?.plot || DEFAULT_PLOT_TYPE);
    if (previousType === 'upset' && nextType === 'venn') {
      const lockRatioCheckbox = getVennLockRatioCheckbox();
      if (lockRatioCheckbox) {
        setVennLockRatioPrevious(!!lockRatioCheckbox.checked);
      }
    }
    syncPlotMode(nextType, { updateTitle: true, syncPanels: true });
    requestScheduledDraw('plot-type-change', null, Shared.componentLifecycle.createStructuralDrawOptions('plot-type-change'));
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
    captureVennSessionStateFromActive(projectedVennSession, { reason: 'venn-species-select-change' });
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
          tabId: getVennProjectionTabId() || null,
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

  async function handleGoButtonClick(event, callbackOwner = null) {
    const owner = callbackOwner?.session
      ? callbackOwner
      : getVennCallbackOwner({ event, target: event?.currentTarget || event?.target || null, reason: 'venn-go-run' });
    if(!isVennCallbackOwnerActive(owner)){
      return;
    }
    try {
      setActiveAnalysisResultsTab('go', { reason: 'venn-go-run', owner, tabId: owner.tabId });
      const regionGenes = (getRegionText(state.ui.regionSelect.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
      const speciesGenes = getAllGenes();
      const requestConfig = captureVennGoAnalysisOptions();
      const organism = await resolveVennAnalysisOrganism({
        owner,
        genes: speciesGenes,
        reason: 'venn-go-run-species',
        requestKind: 'goSpecies',
        alertMessage: 'Please select a species before running GO analysis.'
      });
      if (!organism || !isVennCallbackOwnerCurrent(owner)) { return; }
      runGOAnalysis(regionGenes, organism, { owner, requestConfig, activeResultsTab: 'go' });
      debug('Debug: venn handleGoButtonClick', { tabId: owner.tabId, geneCount: regionGenes.length, organism }); // Debug: GO click payload
    } catch (err) { console.error('goBtn error', err); }
  }

  async function handleStringButtonClick(event, callbackOwner = null) {
    const owner = callbackOwner?.session
      ? callbackOwner
      : getVennCallbackOwner({ event, target: event?.currentTarget || event?.target || null, reason: 'venn-string-run' });
    if(!isVennCallbackOwnerActive(owner)){
      return;
    }
    try {
      setActiveAnalysisResultsTab('string', { reason: 'venn-string-run', owner, tabId: owner.tabId });
      const regionGenes = (getRegionText(state.ui.regionSelect.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
      const speciesGenes = getAllGenes();
      const requestConfig = captureVennStringAnalysisOptions();
      const organism = await resolveVennAnalysisOrganism({
        owner,
        genes: speciesGenes,
        reason: 'venn-string-run-species',
        requestKind: 'stringSpecies',
        alertMessage: 'Please select a species before running STRING analysis.'
      });
      if (!organism || !isVennCallbackOwnerCurrent(owner)) { return; }
      runStringAnalysis(regionGenes, organism, { owner, requestConfig, activeResultsTab: 'string' });
      debug('Debug: venn handleStringButtonClick', { tabId: owner.tabId, geneCount: regionGenes.length, organism }); // Debug: STRING click payload
    } catch (err) { console.error('stringBtn error', err); }
  }

  function handleDetectSpeciesClick(evt, callbackOwner = null) {
    if (evt && typeof evt.preventDefault === 'function') {
      evt.preventDefault();
    }
    cancelPendingSpeciesDetection('manual-detect');
    const owner = callbackOwner?.session
      ? callbackOwner
      : getVennCallbackOwner({ event: evt, target: evt?.currentTarget || evt?.target || null, reason: 'manual-detect' });
    recognizeSpeciesFromInput({ reason: 'manual-button', owner }).catch(err => {
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
    const f = e.target.files?.[0] || null;
    if (f) {
      const owner = getVennCallbackOwner({
        event: e,
        target: e?.currentTarget || e?.target || null,
        reason: 'venn-graph-file-input'
      });
      const operationSession = owner?.session || projectedVennSession;
      const operationTabId = owner?.tabId || operationSession?.tabId || null;
      const previous = isVennCallbackOwnerActive(owner) ? captureVennSnapshot() : null;
      setVennFileNameForSession(f.name, operationSession);
      setVennFileHandleForSession(null, operationSession);
      venn.loadFromFile(f, {
        undo: previous ? { previous } : null,
        session: operationSession,
        tabId: operationTabId
      });
      debug('Debug: venn handleGraphFileChange', { fileName: f.name, tabId: operationTabId || null }); // Debug: graph file change
    }
  }

  function handleSampleClick() {
    const previous = captureVennSnapshot();
    const exampleRecord = Shared.exampleDatasets?.get?.('venn');
    const labels = exampleRecord?.data?.labels;
    const sets = exampleRecord?.data?.sets;
    if(!Array.isArray(labels) || labels.length < 3 || !Array.isArray(sets) || sets.length < 3){
      console.warn('venn example load skipped: biomedical example registry unavailable');
      return;
    }
    state.ui.inputs.labelA.value = labels[0];
    state.ui.inputs.labelB.value = labels[1];
    state.ui.inputs.labelC.value = labels[2];
    state.ui.inputs.A.value = Array.isArray(sets[0]) ? sets[0].join('\n') : '';
    state.ui.inputs.B.value = Array.isArray(sets[1]) ? sets[1].join('\n') : '';
    state.ui.inputs.C.value = Array.isArray(sets[2]) ? sets[2].join('\n') : '';
    Shared.exampleDatasets?.applyNotesState?.(notesState, exampleRecord);
    state.ui.syncTableFromInputs?.({ refresh: true, preserveAdditionalColumns: false });
    state.analysis.lastDrawMode = 'lists';
    if (state.ui.speciesSelect) state.ui.speciesSelect.value = '';
    setSpeciesIndicator(null);
    refreshDiagram();
    scheduleSpeciesRecognition('sample-data');
    captureVennSessionStateFromActive(projectedVennSession, { reason: 'venn-sample-data' });
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
    // Shared.hot owns table mutation classification and invokes this callback once
    // for graph-relevant edits, including undo/redo, paste, and structural changes.
    const scheduleVennTableDraw = (payload) => {
      if (payload && payload.source === 'loadData') {
        return;
      }
      syncVennInputsFromTable({ scheduleDraw: true, scheduleSpecies: true });
    };
    const createVennTableInstance = targetContainer => Shared.hot.createStandardTable(targetContainer, { rows: 20, cols: 3 }, scheduleVennTableDraw, {
      debugLabel: 'venn',
      data,
      pinFirstRow: true
    });
    const tabId = getVennProjectionTabId() || normalizeVennSessionTabId(null, { reason: 'venn-table-init' }) || null;
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

  function getVennRootTabId(root = state.ui.root || null){
    if(!root){
      return null;
    }
    const directId = String(
      root?.dataset?.workspaceTabId
      || root?.dataset?.tabId
      || root?.getAttribute?.('data-workspace-tab-id')
      || root?.getAttribute?.('data-tab-id')
      || ''
    ).trim();
    if(directId){
      return directId;
    }
    const ownerRoot = typeof root.closest === 'function'
      ? root.closest('[data-workspace-tab-id], [data-tab-id]')
      : null;
    return String(
      ownerRoot?.dataset?.workspaceTabId
      || ownerRoot?.dataset?.tabId
      || ownerRoot?.getAttribute?.('data-workspace-tab-id')
      || ownerRoot?.getAttribute?.('data-tab-id')
      || ''
    ).trim() || null;
  }

  function normalizeVennTabId(tabLike = null){
    if(tabLike && typeof tabLike === 'object'){
      return tabLike.id || tabLike.tabId || null;
    }
    return tabLike || getVennProjectionTabId() || null;
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
    state.ui.setLimitWarning = $root('#vennSetLimitWarning');
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
    notesState.control = Shared.componentLifecycle?.ensureOwnedNotesControl?.({
      componentKey: 'venn',
      ownerTabId: getVennProjectionTabId() || null,
      container: stack,
      notesState,
      control: notesState.control,
      id: 'venn-notes',
      scopeId: 'venn',
      fontKey: 'notes',
      canUseControl: control => !!(control?.root && control.root.isConnected && stack.contains(control.root)),
      unavailableMessage: 'venn notes helper unavailable',
      debugLog: debug,
      applyToControl: control => {
        control.setValue(notesState.text || '');
        control.setOpen(!!notesState.open);
      },
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
    }) || notesState.control || null;
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
          previousTabId: getVennProjectionTabId() || null,
          targetTabId: tabId,
          hasRoot: !!nextRoot,
          passive: meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true
        });
        if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
          venn.__boundTabId = tabId || getVennProjectionTabId() || null;
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
          debugLog('passive DOM rebind', { tabId: getVennProjectionTabId() || null });
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
      bindVennSessionForTab(targetTabId || getVennProjectionTabId() || null, { root: mountedRoot || state.ui.root || null, reason: options?.reason || 'venn-init-same-tab' }, { apply: false });
      syncVennSessionRefsFromActive();
      syncVennSessionManagersFromActive();
      debugLog('init skipped', { tabId: getVennProjectionTabId() || null });
      return;
    }
    if(venn.ready){
      captureVennSessionStateFromActive(projectedVennSession, { reason: options?.reason || 'venn-init-rebind-capture' });
      debugLog('init rebinding', { previousTabId: getVennProjectionTabId() || null, targetTabId, reason: options?.reason || 'init' });
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
    const runVennDrawCycle = async (drawOptions = {}) => {
      const drawTabId = normalizeVennSessionTabId(drawOptions?.tabId || getVennProjectionTabId() || null, drawOptions || {});
      try{
        return await refreshDiagram(drawOptions);
      }finally{
        const owner = drawTabId
          ? getVennSession(drawTabId, { tabId: drawTabId, reason: 'venn-draw-complete' }, { create: false })
          : getActiveVennSessionForState();
        clearVennPendingDrawState(owner, 'venn-draw-complete');
        vennOverlayController?.resolve({ reason: 'complete', tabId: drawTabId || getVennProjectionTabId() || null });
      }
    };
    const scheduleVennBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(venn, 'venn', runVennDrawCycle, { reason: 'venn-draw-frame' })
      : runVennDrawCycle;
    const scheduleVennInstrumented = drawOptions => {
      const nextOptions = drawOptions || {};
      if(((nextOptions.force === true || nextOptions.forceOverlay === true) && nextOptions.silentOverlay !== true) || nextOptions.importTransactionFinal === true){
        vennOverlayController?.force(nextOptions.reason || 'render', {
          tabId: nextOptions.tabId || getVennProjectionTabId() || null,
          message: 'Rendering Venn graph...'
        });
      }
      const runSchedule = () => scheduleVennBase(nextOptions);
      if(Shared.componentLifecycle?.runDrawWithOverlayPaintGate?.({
        component: venn,
        componentKey: 'venn',
        options: nextOptions,
        tabId: nextOptions.tabId || getVennProjectionTabId() || null,
        reason: nextOptions.reason || 'render',
        overlayController: vennOverlayController,
        delayForOverlay: nextOptions.silentOverlay !== true,
        debugLog: debug,
        run: runSchedule
      })){
        return true;
      }
      return runSchedule();
    };
    state.ui.scheduleDraw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'venn',
          debugLabel: 'venn',
          getTabId: () => getVennProjectionTabId() || null,
          scheduleRaw: scheduleVennInstrumented
        })
      : scheduleVennInstrumented;
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
    captureVennSessionStateFromActive(projectedVennSession, { reason: options?.reason || 'venn-init-complete' });
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
      // Inactive/lazy owners without an existing runtime snapshot remain
      // payload-led. Never bind the mounted sibling just to manufacture one.
      return null;
    }
    const session = bindVennSessionForTab(requestedTabId || meta?.tab || meta?.tabId || getVennProjectionTabId() || null, { ...(meta || {}), reason: meta.reason || 'venn-runtime-capture-bind' }, { apply: false });
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
    const requestedTabId = normalizeVennSessionTabId(meta?.tab || meta?.tabId || null, meta || {});
    const session = setVennSessionStateFromRuntimeRecord(resolvedSnapshot, {
      ...(meta || {}),
      tabId: requestedTabId || meta?.tabId || undefined
    });
    rememberVennOwnedRuntimeRecord(meta?.tab || requestedTabId || null, resolvedSnapshot, {
      ...(meta || {}),
      tabId: requestedTabId || meta?.tabId || undefined,
      reason: meta.reason || 'apply-runtime-state'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(venn, resolvedSnapshot, {
      ...(meta || {}),
      tabId: requestedTabId || meta?.tabId || undefined,
      reason: meta.reason || 'apply-runtime-state'
    });

    if(requestedTabId && !canCaptureLiveVennPayloadForTab(requestedTabId)){
      // The runtime belongs to an inactive owner. It is stored above and will
      // be projected only after normal activation binds that owner first.
      return true;
    }

    applyVennRuntimeStateSnapshot(resolvedSnapshot, session);
    if(session){
      projectedVennSession = session;
      venn.__vennSessionTabId = session.tabId;
      venn.__boundTabId = session.tabId;
      applyVennSessionStateToActive(session, { restoreEmptyPayload: false });
    }
    debugLog('runtime state applied', {
      reason: meta.reason || 'apply-runtime-state',
      hasSnapshot: !!resolvedSnapshot
    });
    return true;
  };

  function syncVennActivationState(meta = {}){
    bindVennSessionForTab(meta?.tab || meta?.tabId || getVennProjectionTabId() || null, { ...(meta || {}), root: resolveVennRoot(meta?.tab || meta?.tabId || null) || state.ui.root || null, reason: meta.reason || 'venn-activate-session' }, { apply: true });
    if(typeof state.ui.syncPanels === 'function'){
      state.ui.syncPanels({ skipSchedule: true });
      debugLog('tab activated panel sync', {
        reason: meta.reason || 'activate-tab',
        tabId: getVennProjectionTabId() || null
      });
    }
    ensureVennSvgBoxControls('tab-activation');
    syncVennAspectControls('tab-activation', { restoreSavedPreference: true });
    syncVennSetLimitWarning();
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
    const previousBoundTabId = getVennProjectionTabId() || null;
    const rebound = ensureVennDomBindings(targetTabId, meta || {});
    const currentRootTabId = getVennRootTabId(state.ui.root);
    const rootMismatch = !!targetTabId && !!currentRootTabId && String(currentRootTabId) !== String(targetTabId);
    venn.__boundTabId = targetTabId || getVennProjectionTabId() || null;
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
      const owner = captureVennSessionForDeactivation(_tab, meta);
      cancelVennAnalysisAutoRefresh(owner, meta.reason || 'deactivate-tab');
      clearVennPendingDrawState(owner, meta.reason || 'deactivate-tab');
      cancelPendingSpeciesDetection(meta.reason || 'deactivate-tab', {
        abortActive: true,
        resetIndicator: false,
        tabId: owner?.tabId || getVennDeactivationTabId(_tab, meta)
      });
    }
  }) || function deactivateTab(_tab, meta = {}){
    const owner = captureVennSessionForDeactivation(_tab, meta);
    cancelVennAnalysisAutoRefresh(owner, meta.reason || 'deactivate-tab');
    clearVennPendingDrawState(owner, meta.reason || 'deactivate-tab');
    cancelPendingSpeciesDetection(meta.reason || 'deactivate-tab', {
      abortActive: true,
      resetIndicator: false,
      tabId: owner?.tabId || getVennDeactivationTabId(_tab, meta)
    });
    debugLog('tab deactivated', {
      reason: meta.reason || 'deactivate-tab'
    });
    return true;
  };

  venn.disposeTab = function disposeTab(_tab, meta = {}){
    const tabId = normalizeVennSessionTabId(_tab || meta?.tabId || null, meta);
    if(tabId){
      const owner = getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'dispose-tab' }, { create: false });
      cancelVennAnalysisAutoRefresh(owner, meta.reason || 'dispose-tab');
      clearVennPendingDrawState(owner, meta.reason || 'dispose-tab');
      cancelPendingSpeciesDetection(meta.reason || 'dispose-tab', {
        abortActive: true,
        resetIndicator: false,
        tabId
      });
      vennSessionsByTabId.delete(tabId);
      if(projectedVennSession?.tabId === tabId){
        projectedVennSession = null;
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
    resolveDiagramLayout: options => resolveVennDiagramLayout(options),
    resolveDiagramLayoutForSession: (session, options) => resolveVennDiagramLayoutForSession(session, options),
    createDiagramLayoutSignature: options => createVennDiagramLayoutSignature(options),
    measureTextMetrics: (text, fontSize, fontFamily) => measureVennTextMetrics(text, fontSize, fontFamily),
    populateRegion,
    clearAnalysis,
    getUpSetTableColumns,
    resolveUpSetTableData,
    getSession: tabId => getVennSession(tabId, { tabId, reason: 'test-get-session' }, { create: false }),
    scheduleDrawForSession: (session, options) => scheduleVennDrawForSession(session, options),
    captureRuntimeState: meta => venn.captureRuntimeState(meta),
    applyRuntimeState: (snapshot, meta) => venn.applyRuntimeState(snapshot, meta)
  });

  function detachChildren(node){
    return Shared.componentLifecycle?.detachCacheableChildren?.(node) || null;
  }

  function restoreChildren(node, payload){
    if(!node || !payload || !payload.fragment){ return false; }
    const count = Number(payload.count);
    const hasChildren = Number(payload.fragment?.childNodes?.length || 0) > 0;
    if(Number.isFinite(count) && count <= 0 && !hasChildren){ return false; }
    while(node.firstChild){
      node.removeChild(node.firstChild);
    }
    node.appendChild(payload.fragment);
    return true;
  }

  function getVennRenderCacheMetadata(cache){
    return cache?.__graphitixRenderCache && typeof cache.__graphitixRenderCache === 'object'
      ? cache.__graphitixRenderCache
      : null;
  }

  const VENN_PUBLISHED_TRACE_SELECTOR = [
    '[data-venn-trace-id]',
    '[data-upset-trace-kind][data-upset-trace-id]'
  ].join(', ');

  function hasVennSemanticGraphMarks(container){
    return !!container?.querySelector?.(VENN_PUBLISHED_TRACE_SELECTOR);
  }

  function vennFragmentPayloadHasGraph(payload){
    if(!payload || typeof payload !== 'object'){
      return false;
    }
    const fragment = payload.fragment || null;
    if(fragment && typeof fragment.querySelector === 'function'){
      return hasVennSemanticGraphMarks(fragment);
    }
    if(payload.__graphitixKind === 'fragment-payload' && Array.isArray(payload.nodes)){
      return payload.nodes.some(node => {
        const markup = String(node?.markup || '');
        return /\bdata-venn-trace-id\s*=/i.test(markup)
          || (/\bdata-upset-trace-kind\s*=/i.test(markup) && /\bdata-upset-trace-id\s*=/i.test(markup));
      });
    }
    return false;
  }

  function hasVennPublishedGraph(root = null){
    const ownerRoot = root || resolveVennRoot(getVennProjectionTabId() || null) || state.ui.root || null;
    const stage = ownerRoot?.querySelector?.('#stage') || state.ui.stage || null;
    // Publication is a semantic renderer contract, not a layout measurement. SVG
    // geometry can legitimately report zero while a tab is being deactivated and
    // always does under JSDOM, but the renderer-owned trace markers remain exact.
    return hasVennSemanticGraphMarks(stage);
  }

  function captureVennRenderCacheMetadata(meta = {}){
    const ownerTabId = getVennProjectionTabId() || normalizeVennTabId(meta?.tab || meta?.tabId || null) || null;
    return Shared.renderCacheSchema?.createMetadata?.({ component: 'venn', tabId: ownerTabId, complete: false })
      || { version: 2, component: 'venn', type: 'venn', tabId: ownerTabId, complete: false };
  }

  function isCompleteVennRenderCache(cache){
    if(!cache || typeof cache !== 'object' || !vennFragmentPayloadHasGraph(cache.stage)){
      return false;
    }
    const cacheMeta = getVennRenderCacheMetadata(cache);
    return cacheMeta?.complete === true && cacheMeta?.type === 'venn';
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
    const root = state.ui.root || resolveVennRoot(getVennProjectionTabId() || null) || null;
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
        contextLabel: 'venn-export',
        componentName: 'venn'
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
        contextLabel: 'go-chart',
        componentName: 'venn-go'
      });
      debug('Debug: go chart export controls mounted', { hasExporter: true });
    }else{
      debug('Debug: go chart export controls unavailable', { hasExporter: true, hasHost: !!goChartExport });
    }
    if(typeof exporter.mountSvgStringControls === 'function' && stringNetworkExport){
      exporter.mountSvgStringControls({
        container: stringNetworkExport,
        getSvgString: () => buildStringNetworkSvgString(),
        getSourceSvg: () => state.ui.stringNetwork?.querySelector?.('svg') || root.querySelector('#stringNetwork svg'),
        fileName: 'string_network',
        contextLabel: 'string-export',
        componentName: 'venn-string'
      });
      debug('Debug: string export controls mounted', { hasExporter: true });
    }else{
      debug('Debug: string export controls unavailable', { hasExporter: true, hasHost: !!stringNetworkExport });
    }
    return !!exportHost;
  }

  venn.captureRenderCache = function captureRenderCache(meta = {}){
    const targetTabId = normalizeVennTabId(meta?.tab || meta?.tabId || null);
    ensureVennDomBindings(targetTabId);
    const ownerRoot = resolveVennRoot(targetTabId || null) || state.ui.root || null;
    const rootTabId = getVennRootTabId(ownerRoot);
    if(targetTabId && rootTabId && String(rootTabId) !== String(targetTabId)){
      console.warn('venn render cache capture skipped stale root', { targetTabId, rootTabId });
      return null;
    }
    const stage = ownerRoot?.querySelector?.('#stage') || state.ui.stage || null;
    if(!stage || !hasVennPublishedGraph(ownerRoot)){
      debugLog('Debug: venn render cache capture skipped', {
        reason: !stage ? 'missing-stage' : 'graph-not-published',
        tabId: targetTabId || null
      });
      return null;
    }
    const emptyNotice = captureVennEmptyNoticeState();
    const stageRootState = captureSvgRootState(stage);
    const stageCache = detachChildren(stage);
    if(!vennFragmentPayloadHasGraph(stageCache)){
      restoreChildren(stage, stageCache);
      debugLog('Debug: venn render cache capture skipped', {
        reason: 'empty-graph-fragment',
        tabId: targetTabId || null
      });
      return null;
    }
    const cacheMeta = captureVennRenderCacheMetadata({ ...meta, tabId: targetTabId || meta?.tabId || null });
    cacheMeta.complete = true;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: venn render cache captured', {
        stageNodes: stageCache?.count || 0,
        hasStageRootState: !!stageRootState,
        tabId: targetTabId || null
      });
    }
    return {
      stage: stageCache,
      emptyNotice,
      stageRootState,
      graphOnly: true,
      __graphitixRenderCache: cacheMeta
    };
  };

  venn.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    if(!isCompleteVennRenderCache(cache)){
      return false;
    }
    const cacheMeta = getVennRenderCacheMetadata(cache);
    const targetTabId = normalizeVennTabId(meta?.tab || meta?.tabId || null);
    if(cacheMeta?.tabId && targetTabId && String(cacheMeta.tabId) !== String(targetTabId)){
      return false;
    }
    return Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'venn',
      graph: {
        selectors: ['[data-venn-trace-id]', '[data-upset-trace-kind][data-upset-trace-id]'],
        markupPattern: /(?:\bdata-venn-trace-id\s*=|(?=[\s\S]*\bdata-upset-trace-kind\s*=)(?=[\s\S]*\bdata-upset-trace-id\s*=))/i
      },
      requiredSections: [],
      requireGraph: true
    }) ?? true;
  };

  venn.isIdleForSnapshot = function isIdleForSnapshot(meta = {}) {
    const tabId = normalizeVennSessionTabId(meta?.tabId || meta?.tab || getVennProjectionTabId() || null, meta || {});
    const owner = tabId
      ? getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-snapshot-idle' }, { create: false })
      : getActiveVennSessionForState();
    const detection = state.analysis?.speciesDetection || null;
    const asyncRequests = owner?.cache?.asyncRequests || {};
    const pendingSpeciesOwned = !!detection?.pendingTimeoutId
      && (!tabId || !detection.pendingTabId || String(detection.pendingTabId) === String(tabId));
    const activeSpeciesOwned = !!detection?.active
      && (!tabId || !detection.active?.tabId || String(detection.active.tabId) === String(tabId));
    return !(
      owner?.state?.drawPending
      || owner?.timers?.pendingDrawOptions
      || owner?.timers?.pendingSpeciesDetection
      || owner?.cache?.autoAnalysisRefreshTimer
      || owner?.cache?.autoAnalysisRefreshToken
      || asyncRequests.go
      || asyncRequests.string
      || asyncRequests.species
      || pendingSpeciesOwned
      || activeSpeciesOwned
    );
  };

  venn.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    cancelAutomaticSpeciesDetectionForSnapshot(meta);
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(venn, {
      ...meta,
      componentKey: 'venn',
      timeoutMs: Number.isFinite(Number(meta.timeoutMs)) ? Number(meta.timeoutMs) : 30000,
      settleFrames: Number.isFinite(Number(meta.settleFrames)) ? Number(meta.settleFrames) : 3
    }) || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  function bindVennTraceFormatInteraction(node){
    if(!node || node.__graphitixVennTraceFormatBound === true){ return false; }
    node.setAttribute?.('cursor', 'pointer');
    node.addEventListener('click', event => {
      try{ event.stopPropagation(); }catch(_err){}
      const traceId = node.getAttribute?.('data-venn-trace-id') || null;
      showVennTraceSymbolToolbar(node, { traceId });
    });
    node.__graphitixVennTraceFormatBound = true;
    return true;
  }

  function bindUpSetTraceFormatInteraction(node){
    if(!node || node.__graphitixUpSetTraceFormatBound === true){ return false; }
    node.setAttribute?.('cursor', 'pointer');
    node.addEventListener('click', event => {
      try{ event.stopPropagation(); }catch(_err){}
      const kind = node.getAttribute?.('data-upset-trace-kind') || null;
      const traceId = node.getAttribute?.('data-upset-trace-id') || null;
      if((kind === 'intersectionBars' || kind === 'matrix') && traceId && state.ui.regionSelect){
        const option = Array.from(state.ui.regionSelect.options || []).find(item => item.value === traceId);
        if(option){
          state.ui.regionSelect.value = traceId;
          populateRegion(traceId);
          syncActiveVennPayload('venn-upset-select');
        }
      }
      showUpSetTraceSymbolToolbar(node, { kind, traceId });
    });
    node.__graphitixUpSetTraceFormatBound = true;
    return true;
  }

  venn.rehydrateGraphInteractions = function rehydrateGraphInteractions(meta = {}){
    const owner = getVennSession(meta.session || meta.tab || meta.tabId || null, meta, { create: false }) || getActiveVennSessionForState();
    const root = meta.root || resolveVennRoot(owner?.tabId || meta.tab || meta.tabId || null) || state.ui.root || null;
    const stage = root?.querySelector?.('#stage') || state.ui.stage || meta.svgs?.[0] || null;
    if(!owner || !stage){ return false; }
    const axesReady = axisControls?.rehydrateAxisElements?.(stage, axis => createUpSetAxisControlConfig(axis, owner)) !== false;
    const textReady = rehydrateVennInlineTextInteractions(stage, owner);
    stage.querySelectorAll?.('[data-venn-trace-id]').forEach(bindVennTraceFormatInteraction);
    stage.querySelectorAll?.('[data-upset-trace-kind][data-upset-trace-id]').forEach(bindUpSetTraceFormatInteraction);
    return axesReady && textReady;
  };

  venn.restoreRenderCache = function restoreRenderCache(cache, meta = {}){
    if(!isCompleteVennRenderCache(cache)){ return false; }
    const targetTabId = normalizeVennTabId(meta?.tab || meta?.tabId || null);
    ensureVennDomBindings(targetTabId);
    const ownerRoot = resolveVennRoot(targetTabId || null) || state.ui.root || null;
    const stage = ownerRoot?.querySelector?.('#stage') || state.ui.stage || null;
    restoreSvgRootState(stage, cache.stageRootState);
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.stage || cache?.plot || cache?.preview || cache?.graph || cache?.svg;
    const restoredStage = restoreChildren(stage, graphCachePayload);
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
      if (state.ui.regionSelect) {
        populateRegion(state.ui.regionSelect.value, {
          skipClear: true,
          skipAnalysisRefresh: true
        });
      }
    }
    primeVennAnalysisAutoRefreshBaseline(getActiveVennSessionForState(), meta?.reason || 'render-cache-restore');
    primeVennSpeciesAutoDetectionBaseline(getActiveVennSessionForState(), null, meta?.reason || 'render-cache-restore');
    applyVennStageTheme(stage);
    const svgBoxControlsReady = ensureVennSvgBoxControls('render-cache-restore');
    const controlsMounted = mountVennExportControls();
    const ownerSession = getActiveVennSessionForState();
    if(ownerSession?.results){
      applyVennResultsStateToActive(ownerSession.results);
    }
    const restored = restoredStage || restoredEmptyNotice;
    const visuallyReady = !!restoredStage && hasVennPublishedGraph(ownerRoot);
    setActiveAnalysisResultsTab(state.analysis.activeResultsTab || 'go', { syncPayload: false });
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: venn render cache restored', {
        restored,
        visuallyReady,
        stage: restoredStage,
        emptyNotice: restoredEmptyNotice,
        svgBoxControlsReady,
        controlsMounted,
        stageRootState: !!cache.stageRootState
      });
    }
    return visuallyReady;
  };

  venn.hasRenderedGraph = function hasRenderedGraph(meta = {}){
    const root = meta?.root
      || Shared.workspaceTabs?.getMountedRoot?.(meta?.tab || meta?.tabId || null, 'venn')
      || resolveVennRoot(meta?.tab || meta?.tabId || null)
      || null;
    return hasVennPublishedGraph(root);
  };

  venn.draw = async function draw(meta = {}) {
    try {
      const nextReason = meta?.reason || 'venn-draw';
      if(Shared.componentLifecycle?.shouldSuppressDraw?.('venn', { ...(meta || {}), tabId: meta?.tabId || getVennProjectionTabId() || null, reason: nextReason })){
        debug('Debug: venn draw suppressed by lifecycle', { reason: nextReason, tabId: meta?.tabId || getVennProjectionTabId() || null });
        Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'venn', tabId: meta?.tabId || getVennProjectionTabId() || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'venn.draw' } });
        return;
      }
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'venn', tabId: meta?.tabId || getVennProjectionTabId() || null, action: 'draw-executed', reason: nextReason, details: { source: 'venn.draw' } });
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
      const overlayTabId = targetTabId || getVennProjectionTabId() || null;
      const overlayRequested = (meta?.force === true || meta?.forceOverlay === true) && meta?.silentOverlay !== true;
      const overlayForced = overlayRequested && !vennOverlayController?.isActive?.({ tabId: overlayTabId })
        ? vennOverlayController?.force(nextReason, { tabId: overlayTabId })
        : false;
      if(overlayForced){
        await Shared.jobs?.nextFrame?.();
        await Shared.jobs?.nextFrame?.();
      }
      try{
        return await refreshDiagram(meta);
      }finally{
        vennOverlayController?.resolve({ reason: 'complete', tabId: targetTabId || getVennProjectionTabId() || null });
      }
    } catch (e) {
      console.error('venn.draw error', e);
    }
  };

  venn.cancelCurrentDraw = function cancelCurrentDraw(meta = {}){
    const tabId = meta?.tabId || getVennProjectionTabId() || null;
    const owner = tabId
      ? getVennSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'venn-draw-cancel' }, { create: false })
      : getActiveVennSessionForState();
    try{ venn.__asyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'venn-draw-cancel'); }catch(_err){}
    cancelVennAnalysisAutoRefresh(owner, meta?.reason || 'venn-draw-cancel');
    clearVennPendingDrawState(owner, meta?.reason || 'venn-draw-cancel');
    vennOverlayController?.resolve({ reason: meta?.reason || 'cancelled', tabId });
    return true;
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

  venn.__statsTestHooks = Object.freeze({
    validateVennSignificanceCounts,
    computeVennSignificanceResults,
    probabilityDisplayFromLog
  });

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
