(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.publicationStyles = Shared.publicationStyles || {};

  const TYPE_TO_PAGE = Object.freeze({
    venn: { pageId: 'vennPage', panelSelector: '.config-options' },
    box: { pageId: 'boxPage', panelSelector: '.config-options' },
    scatter: { pageId: 'scatterPage', panelSelector: '.config-panel' },
    pca: { pageId: 'pcaPage', panelSelector: '.config-options' },
    line: { pageId: 'linePage', panelSelector: '.config-options' },
    heatmap: { pageId: 'heatmapPage', panelSelector: '.config-options' },
    surface: { pageId: 'surfacePage', panelSelector: '.config-options' },
    roc: { pageId: 'rocPage', panelSelector: '.config-options' },
    survival: { pageId: 'survivalPage', panelSelector: '.config-options' },
    hist: { pageId: 'histPage', panelSelector: '.config-options' },
    pie: { pageId: 'piePage', panelSelector: '.config-options' }
  });

  const PRESETS = Object.freeze({
    npg_single: Object.freeze({
      id: 'npg_single',
      label: 'Nature / NPG (single-column)'
    })
  });

  // 89mm single-column at 96 dpi.
  const NPG_SINGLE = Object.freeze({
    targetWidthPx: 336,
    targetHeightPx: 300,
    fontFamily: 'Arial',
    fontSizePt: 6,
    axisColor: '#000000',
    axisStrokeWidth: 1,
    pointSize: 4,
    pointBorderWidth: 1,
    summaryColor: '#000000',
    significanceColor: '#000000',
    schemeId: 'colorblind',
    showGrid: false,
    showFrame: false
  });

  const state = {
    initialized: false,
    controlsByType: {},
    monitorTimer: null,
    lastActiveSignature: null
  };

  function isDebugEnabled(){
    try{
      return typeof Shared.isDebugEnabled !== 'function' || Shared.isDebugEnabled();
    }catch(err){
      return true;
    }
  }

  function debugLog(message, payload){
    if(!isDebugEnabled()) return;
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    }
  }

  function cloneValue(value){
    if(value == null) return value;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      return value;
    }
  }

  function ensureObject(value){
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function ptToPxToken(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return '';
    }
    const px = Math.round((numeric * (96 / 72)) * 100) / 100;
    return `${String(px).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')}px`;
  }

  function setDeep(obj, path, value){
    if(!obj || typeof obj !== 'object') return;
    const parts = Array.isArray(path) ? path : String(path).split('.');
    let cur = obj;
    for(let i=0;i<parts.length-1;i++){
      const key = parts[i];
      if(!cur[key] || typeof cur[key] !== 'object'){
        cur[key] = {};
      }
      cur = cur[key];
    }
    cur[parts[parts.length-1]] = value;
  }

  function getActiveTab(){
    const session = global.Main?.session;
    if(!session || typeof session.getActiveTab !== 'function') return null;
    return session.getActiveTab();
  }

  function getActiveSignature(){
    const tab = getActiveTab();
    if(!tab || !tab.type || tab.isWelcome) return null;
    return `${tab.id}::${tab.type}`;
  }

  function findPanelForType(type){
    const descriptor = TYPE_TO_PAGE[type];
    if(!descriptor) return null;
    const page = global.document?.getElementById(descriptor.pageId);
    if(!page) return null;
    return page.querySelector(descriptor.panelSelector);
  }

  function findFieldset(panel){
    if(!panel || typeof panel.querySelector !== 'function') return null;
    return panel.querySelector('[data-publication-style-fieldset="1"]');
  }

  function resolveInsertAnchor(panel){
    if(!panel || typeof panel.querySelector !== 'function') return null;
    // Prefer inserting after the color scheme controls if present.
    const schemeFieldset = panel.querySelector('[data-color-scheme-fieldset="1"]');
    return schemeFieldset || panel.firstChild || null;
  }


  function captureDefaultState(type, session, domControls, workspace){
    const snapshot = {
      defaultPayload: null,
      emptyPayloadTemplate: null
    };
    try{
      if(domControls && typeof domControls.ensureDefaultPayload === 'function'){
        snapshot.defaultPayload = cloneValue(domControls.ensureDefaultPayload(session, type, workspace));
      }
    }catch(err){
      console.error('publicationStyles capture default payload error', { type, err });
    }
    try{
      if(workspace && typeof workspace.captureEmptyPayloadTemplate === 'function'){
        snapshot.emptyPayloadTemplate = cloneValue(workspace.captureEmptyPayloadTemplate());
      }
    }catch(err){
      console.error('publicationStyles capture empty payload template error', { type, err });
    }
    debugLog('Debug: publicationStyles captured defaults', {
      type,
      hasDefaultPayload: !!snapshot.defaultPayload,
      hasEmptyPayloadTemplate: !!snapshot.emptyPayloadTemplate
    });
    return snapshot;
  }

  function restoreDefaultState(type, session, domControls, workspace, snapshot, reason){
    const nextSnapshot = snapshot || {};
    try{
      if(nextSnapshot.defaultPayload && domControls && typeof domControls.setWorkspaceDefaultPayload === 'function'){
        domControls.setWorkspaceDefaultPayload(session, type, cloneValue(nextSnapshot.defaultPayload));
      }
    }catch(err){
      console.error('publicationStyles restore default payload error', { type, reason, err });
    }
    try{
      if(nextSnapshot.emptyPayloadTemplate && workspace && typeof workspace.restoreEmptyPayloadTemplate === 'function'){
        workspace.restoreEmptyPayloadTemplate(cloneValue(nextSnapshot.emptyPayloadTemplate), {
          reason: reason || 'publication-style-restore'
        });
      }
    }catch(err){
      console.error('publicationStyles restore empty payload template error', { type, reason, err });
    }
    debugLog('Debug: publicationStyles restored defaults', {
      type,
      reason: reason || 'publication-style-restore',
      hasDefaultPayload: !!nextSnapshot.defaultPayload,
      hasEmptyPayloadTemplate: !!nextSnapshot.emptyPayloadTemplate
    });
  }

  function applySizingToActiveSvgBox(type, payload, sizing){
    const graphSizing = Shared.graphSizing || null;
    if(graphSizing && typeof graphSizing.applyPayloadSizingForType === 'function'){
      graphSizing.applyPayloadSizingForType(type, payload, {
        context: `publication-style-${type}`,
        updateDefaults: false,
        updateAspectRatio: true,
        preserveAspectLock: true,
        forceExact: true
      });
      const appliedSizing = graphSizing.getPayloadSizing(payload, {
        context: `publication-style-${type}-read`
      });
      debugLog('Debug: publicationStyles applied payload sizing', {
        type,
        widthPx: appliedSizing?.display?.widthPx || null,
        heightPx: appliedSizing?.display?.heightPx || null,
        manualLikeResize: true
      });
      return;
    }
    const descriptor = TYPE_TO_PAGE[type];
    if(!descriptor) return;
    const page = global.document?.getElementById(descriptor.pageId);
    if(!page) return;
    const box = page.querySelector('.svgbox');
    if(!box) return;
    const w = Number(sizing?.targetWidthPx);
    const h = Number(sizing?.targetHeightPx);
    if(typeof Shared.applyResizableBoxSize === 'function'){
      const result = Shared.applyResizableBoxSize(box, {
        width: w,
        height: h,
        axis: 'both',
        reason: `publication-style-${type}-fallback`,
        updateDefaults: false,
        updateAspectRatio: true,
        preserveAspectLock: true,
        forceExact: true
      });
      if(result){
        debugLog('Debug: publicationStyles applied svgbox sizing via resizer helper', { type, widthPx: w, heightPx: h });
        return;
      }
    }
    if(!box.style) return;
    if(Number.isFinite(w) && w > 0){
      box.style.width = `${Math.round(w)}px`;
    }
    if(Number.isFinite(h) && h > 0){
      box.style.height = `${Math.round(h)}px`;
    }
    debugLog('Debug: publicationStyles applied svgbox sizing fallback', { type, widthPx: w, heightPx: h });
  }


  function buildSizingRecordForPreset(type, payload, preset){
    const graphSizing = Shared.graphSizing || null;
    const chartStyle = Shared.chartStyle || {};
    const targetWidthPx = Math.max(1, Math.round(Number(preset?.targetWidthPx) || 1));
    const targetHeightPx = Math.max(1, Math.round(Number(preset?.targetHeightPx) || 1));
    const existing = (graphSizing && typeof graphSizing.getPayloadSizing === 'function'
      ? graphSizing.getPayloadSizing(payload, { context: `publication-style-${type}-existing` })
      : null)
      || (graphSizing && typeof graphSizing.captureSvgBoxForType === 'function'
        ? graphSizing.captureSvgBoxForType(type, { context: `publication-style-${type}-capture` })
        : null);
    const existingDisplay = existing?.display || {};
    const minScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
    const maxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
    const aspectRatio = targetWidthPx > 0 && targetHeightPx > 0 ? (targetWidthPx / targetHeightPx) : 1;
    const minWidthPx = Number.isFinite(existingDisplay.minWidthPx) && existingDisplay.minWidthPx > 0
      ? Math.min(existingDisplay.minWidthPx, targetWidthPx)
      : Math.max(1, Math.round(targetWidthPx * minScale));
    const minHeightPx = Number.isFinite(existingDisplay.minHeightPx) && existingDisplay.minHeightPx > 0
      ? Math.min(existingDisplay.minHeightPx, targetHeightPx)
      : Math.max(1, Math.round(targetHeightPx * minScale));
    const maxWidthPx = Number.isFinite(existingDisplay.maxWidthPx) && existingDisplay.maxWidthPx > 0
      ? Math.max(existingDisplay.maxWidthPx, targetWidthPx)
      : Math.max(targetWidthPx, Math.round(targetWidthPx * maxScale));
    const maxHeightPx = Number.isFinite(existingDisplay.maxHeightPx) && existingDisplay.maxHeightPx > 0
      ? Math.max(existingDisplay.maxHeightPx, targetHeightPx)
      : Math.max(targetHeightPx, Math.round(targetHeightPx * maxScale));
    const sizing = {
      display: {
        widthPx: targetWidthPx,
        heightPx: targetHeightPx,
        minWidthPx,
        minHeightPx,
        maxWidthPx,
        maxHeightPx,
        aspectRatio,
        aspectLocked: existingDisplay.aspectLocked === true,
        allowUnlimitedWidth: existingDisplay.allowUnlimitedWidth !== false
      },
      export: {
        widthPx: targetWidthPx,
        heightPx: targetHeightPx
      }
    };
    debugLog('Debug: publicationStyles computed sizing record', {
      type,
      widthPx: targetWidthPx,
      heightPx: targetHeightPx,
      minWidthPx,
      minHeightPx,
      maxWidthPx,
      maxHeightPx,
      allowUnlimitedWidth: sizing.display.allowUnlimitedWidth,
      aspectLocked: sizing.display.aspectLocked
    });
    return sizing;
  }

  function patchCommonPayload(type, payload, preset){
    let next = cloneValue(payload) || { type, config: {} };
    next.type = type;

    // Recolor first, using existing color scheme logic if available.
    const cs = Shared.colorSchemes;
    if(cs && typeof cs.applyToPayload === 'function'){
      next = cs.applyToPayload(type, next, preset.schemeId);
    }else{
      next.config = ensureObject(next.config);
      next.config.colorScheme = preset.schemeId;
    }

    // Common config knobs.
    next.config = ensureObject(next.config);

    if('showGrid' in next.config){
      next.config.showGrid = !!preset.showGrid;
    }
    if('showFrame' in next.config){
      next.config.showFrame = !!preset.showFrame;
    }

    // Typography.
    if('fontSize' in next.config){
      next.config.fontSize = String(preset.fontSizePt);
    }
    const fontStyles = ensureObject(next.config.fontStyles);
    const graphFont = ensureObject(fontStyles.__graph__);
    graphFont.fontFamily = preset.fontFamily;
    graphFont.fill = preset.axisColor;
    graphFont.fontSize = ptToPxToken(preset.fontSizePt);
    fontStyles.__graph__ = graphFont;
    next.config.fontStyles = fontStyles;

    // Axis.
    if(next.config.axis && typeof next.config.axis === 'object'){
      if('strokeWidth' in next.config.axis){
        next.config.axis.strokeWidth = preset.axisStrokeWidth;
      }
      if('color' in next.config.axis){
        next.config.axis.color = preset.axisColor;
      }
    }else{
      // Some graphs store axis settings differently, so do not force-create unless
      // the graph already uses an axis object.
    }

    return next;
  }

  function patchTypeSpecific(type, payload, preset){
    const next = payload;
    const cfg = next.config = ensureObject(next.config);

    if(type === 'box'){
      // Summary overlays and points.
      cfg.summaryGlobalStyle = ensureObject(cfg.summaryGlobalStyle);
      cfg.summaryGlobalStyle.color = preset.summaryColor;

      cfg.significance = ensureObject(cfg.significance);
      cfg.significance.color = preset.significanceColor;
      if('thickness' in cfg.significance){
        cfg.significance.thickness = Math.max(1, Number(cfg.significance.thickness) || 1);
      }

      cfg.pointGlobalStyle = ensureObject(cfg.pointGlobalStyle);
      cfg.pointGlobalStyle.size = preset.pointSize;
    }

    if(type === 'scatter' || type === 'pca' || type === 'line' || type === 'roc' || type === 'survival'){
      // Many of these graphs have marker styles under labelStyles and/or a global marker.
      // We only apply conservative defaults if the structures exist.
      if(cfg.pointGlobalStyle && typeof cfg.pointGlobalStyle === 'object'){
        cfg.pointGlobalStyle.size = preset.pointSize;
      }
      if(cfg.marker && typeof cfg.marker === 'object'){
        if('size' in cfg.marker){ cfg.marker.size = preset.pointSize; }
        if('strokeWidth' in cfg.marker){ cfg.marker.strokeWidth = preset.pointBorderWidth; }
        if('stroke' in cfg.marker){ cfg.marker.stroke = preset.axisColor; }
      }
    }

    if(type === 'pie'){
      // Ensure slice borders remain visible and neutral.
      if('borderColor' in cfg){
        cfg.borderColor = '#ffffff';
      }
    }

    return next;
  }

  function applyPresetToActiveTab(type, presetId){
    const preset = presetId === PRESETS.npg_single.id ? NPG_SINGLE : null;
    if(!preset){
      debugLog('Debug: publicationStyles apply skipped', { reason: 'unknown-preset', type, presetId });
      return false;
    }

    const main = global.Main || {};
    const session = main.session;
    const domControls = main.domControls;
    const components = main.components;
    if(!session || !domControls || !components){
      debugLog('Debug: publicationStyles apply skipped', { reason: 'missing-main-modules', type });
      return false;
    }

    const tab = getActiveTab();
    if(!tab || tab.type !== type){
      debugLog('Debug: publicationStyles apply skipped', { reason: 'inactive-type-mismatch', type, activeType: tab?.type || null });
      return false;
    }

    const workspace = typeof components.get === 'function' ? components.get(type) : null;
    if(!workspace){
      debugLog('Debug: publicationStyles apply skipped', { reason: 'missing-workspace', type });
      return false;
    }

    const preservedDefaults = captureDefaultState(type, session, domControls, workspace);

    try{
      if(typeof session.persistActiveTabState === 'function'){
        session.persistActiveTabState(tab, { reason: `publication-style-pre-${type}` });
      }
    }catch(err){
      console.error('publicationStyles pre-persist error', { type, err });
    }

    const sourcePayload = cloneValue(tab.payload)
      || (typeof workspace.getPayload === 'function' ? workspace.getPayload() : null)
      || (typeof workspace.createEmptyPayload === 'function' ? workspace.createEmptyPayload() : { type, config: {} });

    let nextPayload = patchCommonPayload(type, sourcePayload, preset);
    nextPayload = patchTypeSpecific(type, nextPayload, preset);
    if(Shared.graphSizing && typeof Shared.graphSizing.setPayloadSizing === 'function'){
      nextPayload = Shared.graphSizing.setPayloadSizing(nextPayload, buildSizingRecordForPreset(type, sourcePayload, preset), {
        type,
        context: `publication-style-payload-${type}`
      });
    }

    // Persist payload and redraw.
    if(typeof session.assignTabPayload === 'function'){
      session.assignTabPayload(tab, cloneValue(nextPayload), { reason: `publication-style-${type}` });
    }else{
      tab.payload = cloneValue(nextPayload);
    }
    if(typeof domControls.applyWorkspacePayload === 'function'){
      domControls.applyWorkspacePayload(workspace, cloneValue(nextPayload), {
        reason: `publication-style-${type}`,
        skipPayloadSizing: true
      });
    }

    // Apply the persisted sizing immediately to the active svg box using the same resize route.
    applySizingToActiveSvgBox(type, nextPayload, preset);

    restoreDefaultState(type, session, domControls, workspace, preservedDefaults, 'publication-style-post-immediate');
    global.setTimeout(() => restoreDefaultState(type, session, domControls, workspace, preservedDefaults, 'publication-style-post-deferred'), 0);
    global.setTimeout(() => restoreDefaultState(type, session, domControls, workspace, preservedDefaults, 'publication-style-post-stabilize'), 180);

    try{
      if(typeof session.persistActiveTabState === 'function'){
        session.persistActiveTabState(tab, { reason: `publication-style-post-${type}`, forcePreviewCapture: true });
      }
    }catch(err){
      console.error('publicationStyles post-persist error', { type, err });
    }

    if(typeof session.markSessionDirty === 'function'){
      session.markSessionDirty('publication-style-applied', { type, tabId: tab.id, preset: presetId });
    }

    debugLog('Debug: publicationStyles applied to active tab', { type, tabId: tab.id, preset: presetId });
    return true;
  }

  function renderControlForType(type, descriptor){
    const panel = findPanelForType(type);
    if(!panel){
      debugLog('Debug: publicationStyles render skipped', { type, reason: 'missing-panel' });
      return;
    }
    if(findFieldset(panel)){
      return;
    }

    const fieldset = global.document.createElement('fieldset');
    fieldset.className = 'config-section';
    fieldset.dataset.publicationStyleFieldset = '1';

    const legend = global.document.createElement('legend');
    legend.textContent = 'Publication style';
    fieldset.appendChild(legend);

    const row = global.document.createElement('div');
    row.className = 'config-row';

    const label = global.document.createElement('label');
    label.textContent = 'Preset';
    label.style.marginRight = '8px';

    const select = global.document.createElement('select');
    select.dataset.publicationStyleSelect = '1';
    Object.values(PRESETS).forEach(p => {
      const opt = global.document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      select.appendChild(opt);
    });

    const applyBtn = global.document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn-secondary';
    applyBtn.textContent = 'Apply style';
    applyBtn.style.marginLeft = '8px';

    applyBtn.addEventListener('click', () => {
      const presetId = String(select.value || PRESETS.npg_single.id);
      const ok = applyPresetToActiveTab(type, presetId);
      debugLog('Debug: publicationStyles apply click', { type, presetId, ok });
    });

    row.appendChild(label);
    row.appendChild(select);
    row.appendChild(applyBtn);
    fieldset.appendChild(row);

    const hint = global.document.createElement('div');
    hint.className = 'config-hint';
    hint.textContent = 'Applies a publication preset to the current graph only.';
    fieldset.appendChild(hint);

    const anchor = resolveInsertAnchor(panel);
    if(anchor && anchor.parentNode === panel && anchor.dataset?.colorSchemeFieldset === '1'){
      // Insert after the color scheme fieldset.
      if(anchor.nextSibling){
        panel.insertBefore(fieldset, anchor.nextSibling);
      }else{
        panel.appendChild(fieldset);
      }
    }else{
      panel.insertBefore(fieldset, panel.firstChild || null);
    }

    if(Shared.formControls && typeof Shared.formControls.autoSizeSelect === 'function'){
      Shared.formControls.autoSizeSelect(select);
    }

    state.controlsByType[type] = { select, applyBtn };
    debugLog('Debug: publicationStyles control mounted', { type, pageId: descriptor.pageId });
  }

  function syncActiveTabVisuals(reason){
    const tab = getActiveTab();
    if(!tab || !tab.type || tab.isWelcome) return;
    const control = state.controlsByType[tab.type]?.select || null;
    if(!control) return;
    // Currently we do not persist the selected preset per-tab. Keep default.
    if(!control.value){
      control.value = PRESETS.npg_single.id;
    }
    debugLog('Debug: publicationStyles visuals synced', { reason, tabId: tab.id, type: tab.type });
  }

  function startActiveMonitor(){
    if(state.monitorTimer) return;
    state.monitorTimer = global.setInterval(() => {
      const signature = getActiveSignature();
      if(signature !== state.lastActiveSignature){
        state.lastActiveSignature = signature;
        if(signature){
          syncActiveTabVisuals('tab-change');
        }
      }
    }, 400);
  }

  namespace.init = function init(){
    if(state.initialized){
      debugLog('Debug: publicationStyles.init skipped - already initialized');
      return namespace;
    }
    Object.keys(TYPE_TO_PAGE).forEach(type => {
      renderControlForType(type, TYPE_TO_PAGE[type]);
    });
    startActiveMonitor();
    syncActiveTabVisuals('init');
    state.initialized = true;
    debugLog('Debug: publicationStyles.init complete', { types: Object.keys(TYPE_TO_PAGE) });
    return namespace;
  };
})(window);
