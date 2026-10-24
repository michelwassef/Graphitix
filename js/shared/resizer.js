// Shared resizer utility for .svgbox containers
// Usage: Shared.attachResizableBox(container)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  function debugLog(...args){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug(...args);
    }
  }
  const aspectLockNS = Shared.aspectLock = Shared.aspectLock || {};
  let resizerScopeCounter = 0;

  function parseAspectLockToken(value){
    if(value === true || value === 'true'){
      return 'true';
    }
    if(value === false || value === 'false'){
      return 'false';
    }
    return null;
  }

  function resolveAspectLockState(dataset, options = {}){
    const live = dataset && typeof dataset === 'object' ? dataset : {};
    const snapshot = options.snapshotDataset && typeof options.snapshotDataset === 'object'
      ? options.snapshotDataset
      : {};
    const fallbackToken = parseAspectLockToken(options.fallback);
    const candidates = [
      { source: 'resizer', token: parseAspectLockToken(live.resizerAspectLocked) },
      { source: 'graph', token: parseAspectLockToken(live.graphAspectLocked) },
      { source: 'legacy', token: parseAspectLockToken(live.aspectLocked) },
      { source: 'snapshot-resizer', token: parseAspectLockToken(snapshot.resizerAspectLocked) },
      { source: 'snapshot-graph', token: parseAspectLockToken(snapshot.graphAspectLocked) },
      { source: 'snapshot-legacy', token: parseAspectLockToken(snapshot.aspectLocked) },
      { source: 'fallback', token: fallbackToken }
    ];
    for(let i = 0; i < candidates.length; i += 1){
      const entry = candidates[i];
      if(entry.token === 'true' || entry.token === 'false'){
        return {
          token: entry.token,
          locked: entry.token === 'true',
          source: entry.source,
          hasExplicit: entry.source !== 'fallback'
        };
      }
    }
    return {
      token: fallbackToken || 'false',
      locked: fallbackToken === 'true',
      source: 'fallback',
      hasExplicit: false
    };
  }

  function applyAspectLockState(dataset, locked, options = {}){
    if(!dataset || typeof dataset !== 'object'){
      return 'false';
    }
    const token = locked ? 'true' : 'false';
    dataset.resizerAspectLocked = token;
    if(options.syncGraph !== false){
      dataset.graphAspectLocked = token;
      dataset.aspectLocked = token;
    }
    return token;
  }

  aspectLockNS.resolve = resolveAspectLockState;
  aspectLockNS.resolveLocked = function resolveAspectLocked(dataset, options = {}){
    return resolveAspectLockState(dataset, options).locked;
  };
  aspectLockNS.apply = applyAspectLockState;
  aspectLockNS.parseToken = parseAspectLockToken;
  aspectLockNS.hasExplicit = function hasExplicitAspectLock(dataset, options = {}){
    return resolveAspectLockState(dataset, options).hasExplicit;
  };

  function clampDimension(value, min, max){
    if(!Number.isFinite(value)) return NaN;
    let result = Math.round(value);
    if(Number.isFinite(min)){
      result = Math.max(min, result);
    }
    if(Number.isFinite(max)){
      result = Math.min(max, result);
    }
    return result;
  }

  function parsePositive(value){
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : NaN;
  }

  function normalizeTabId(value){
    const text = typeof value === 'string' ? value.trim() : String(value || '').trim();
    return text || '';
  }

  function extractTabIdFromScope(scopeId){
    const scope = typeof scopeId === 'string' ? scopeId.trim() : '';
    if(!scope){
      return '';
    }
    const marker = '::@tab:';
    const markerIndex = scope.lastIndexOf(marker);
    if(markerIndex < 0){
      return '';
    }
    const rawToken = scope.slice(markerIndex + marker.length).trim();
    if(!rawToken){
      return '';
    }
    const separatorIndex = rawToken.indexOf('::');
    const token = separatorIndex >= 0 ? rawToken.slice(0, separatorIndex) : rawToken;
    return normalizeTabId(token);
  }

  function resolveScopeTabIdFromNode(node){
    if(!node || typeof node !== 'object'){
      return '';
    }
    const directScopeTabId = extractTabIdFromScope(node?.dataset?.resizerProportionalFontResizeScope || '');
    if(directScopeTabId){
      return directScopeTabId;
    }
    if(typeof node.closest === 'function'){
      const closestSvgBox = node.closest('.svgbox');
      const closestScopeTabId = extractTabIdFromScope(closestSvgBox?.dataset?.resizerProportionalFontResizeScope || '');
      if(closestScopeTabId){
        return closestScopeTabId;
      }
    }
    if(typeof node.querySelector === 'function'){
      const nestedSvgBox = node.querySelector('.svgbox');
      const nestedScopeTabId = extractTabIdFromScope(nestedSvgBox?.dataset?.resizerProportionalFontResizeScope || '');
      if(nestedScopeTabId){
        return nestedScopeTabId;
      }
    }
    return '';
  }

  function resolveResizerTab(container, opts = {}){
    const scopedTabFromScope = resolveScopeTabIdFromNode(container);
    if(scopedTabFromScope){
      return Shared.workspaceTabs?.resolveTab?.(scopedTabFromScope) || { id: scopedTabFromScope, type: opts.componentName || null };
    }
    const optionScopeTabId = extractTabIdFromScope(opts.scopeId || opts.proportionalFontResizeScope || '');
    if(optionScopeTabId){
      return Shared.workspaceTabs?.resolveTab?.(optionScopeTabId) || { id: optionScopeTabId, type: opts.componentName || null };
    }
    const dataset = container?.dataset || {};
    const dataTabId = normalizeTabId(dataset.workspaceTabId || dataset.tabId);
    if(dataTabId){
      return Shared.workspaceTabs?.resolveTab?.(dataTabId) || { id: dataTabId, type: opts.componentName || dataset.workspaceComponent || null };
    }
    const scopedRoot = container?.closest?.('[data-workspace-tab-id],[data-tab-id]');
    const scopedTabId = normalizeTabId(scopedRoot?.dataset?.workspaceTabId || scopedRoot?.dataset?.tabId);
    if(scopedTabId){
      return Shared.workspaceTabs?.resolveTab?.(scopedTabId) || { id: scopedTabId, type: opts.componentName || scopedRoot?.dataset?.workspaceComponent || null };
    }
    const explicitTabId = normalizeTabId(opts.tabId || opts.workspaceTabId || opts.activeTabId);
    if(explicitTabId){
      return Shared.workspaceTabs?.resolveTab?.(explicitTabId) || { id: explicitTabId, type: opts.componentName || null };
    }
    const activeTab = Shared.workspaceTabs?.resolveTab?.(null) || global.Main?.session?.getActiveTab?.() || null;
    const activeTabId = normalizeTabId(activeTab?.id);
    const activeTabType = normalizeTabId(activeTab?.type).toLowerCase();
    const componentName = normalizeTabId(opts.componentName).toLowerCase();
    const containerRect = container?.getBoundingClientRect?.() || null;
    const containerVisible = !!(containerRect && Number(containerRect.width) > 0 && Number(containerRect.height) > 0);
    // A concrete, unowned element is not safe to associate with the active tab:
    // it may be a stale same-component projection. Callers must provide an owner
    // stamp or an explicit tab id before a user mutation can be persisted.
    if(container){
      return null;
    }
    if(activeTabId && containerVisible && (!componentName || componentName === activeTabType)){
      return activeTab;
    }
    return Shared.workspaceTabs?.resolveTab?.(null) || global.Main?.session?.getActiveTab?.() || null;
  }

  function markResizerTabUserModified(container, opts = {}, reason = 'resizer-change'){
    try{
      const tab = resolveResizerTab(container, opts);
      const session = global.Main?.session || null;
      if(!tab || typeof session?.markTabUserModified !== 'function'){
        return false;
      }
      const marked = session.markTabUserModified(tab, reason, {
        origin: 'user',
        affectsPayload: false,
        captureCanonical: false
      });
      if(marked && typeof session.captureUserModifiedTabLayout === 'function'){
        session.captureUserModifiedTabLayout(tab, { reason });
      }
      return marked;
    }catch(err){
      console.error('Shared.resizer mark tab modified error', err);
      return false;
    }
  }

  function commitResizerPanelLayout(container, opts = {}, reason = 'panel-resizer-change'){
    try{
      const tab = resolveResizerTab(container, opts);
      const session = global.Main?.session || null;
      if(!tab || tab.isWelcome || !tab.type || !session){
        return false;
      }
      if(typeof session.markTabUserModified === 'function'){
        session.markTabUserModified(tab, reason, {
          origin: 'user',
          affectsPayload: false,
          captureCanonical: false
        });
      }
      if(typeof session.captureUserModifiedTabLayout !== 'function'){
        return false;
      }
      return session.captureUserModifiedTabLayout(tab, { reason }) === true;
    }catch(err){
      console.error('Shared.resizer commit panel layout error', err);
      return false;
    }
  }

  function invalidateResizerTabRenderCaches(container, opts = {}, reason = 'resizer-start'){
    try{
      const tab = resolveResizerTab(container, opts);
      const session = global.Main?.session || null;
      if(!tab || !session){
        return false;
      }
      let invalidated = false;
      if(typeof session.clearTabRenderCache === 'function'){
        invalidated = session.clearTabRenderCache(tab, {
          tabId: tab.id || null,
          reason
        }) || invalidated;
      }
      if(typeof session.clearTabArchiveRenderCache === 'function'){
        invalidated = session.clearTabArchiveRenderCache(tab, {
          tabId: tab.id || null,
          reason
        }) || invalidated;
      }
      if(invalidated){
        debugLog('Debug: resizer start cache invalidation applied', {
          tabId: tab.id || null,
          component: opts.componentName || tab.type || null,
          reason
        });
      }
      return invalidated;
    }catch(err){
      console.error('Shared.resizer invalidate tab render cache error', err);
      return false;
    }
  }

  function persistAspectLockToTab(container, opts, aspectLockedValue, reason){
    const tab = resolveResizerTab(container, opts);
    const tabId = normalizeTabId(tab?.id);
    if(!tabId){
      return false;
    }
    const componentName = opts.componentName || tab.type || null;
    const syncChange = reason === 'sync-change';
    const restoreTransactionActive = reason !== 'checkbox-change'
      && componentName
      && Shared.componentLifecycle?.isRestoreTransactionActive?.(componentName, {
        tabId,
        reason: reason || 'resizer-aspect-lock'
      }) === true;
    if(restoreTransactionActive){
      debugLog('Debug: resizer aspect lock tab persistence skipped during restore transaction', {
        tabId,
        component: componentName,
        aspectLocked: !!aspectLockedValue,
        reason: reason || 'resizer-aspect-lock'
      });
      return false;
    }
    const existingLayoutAspect = tab.layoutState?.svgBox?.dataset?.resizerAspectLocked;
    const hasExplicitLayoutAspect = existingLayoutAspect === 'true' || existingLayoutAspect === 'false';
    const payloadAspect = tab.payload?.meta?.graphSizing?.display?.aspectLocked;
    const hasMatchingPayloadAspect = typeof payloadAspect === 'boolean'
      && payloadAspect === (existingLayoutAspect === 'true');
    if(syncChange
      && tab.loadedFromArchive === true
      && tab.userModified !== true
      && tab.payloadDirty !== true
      && hasExplicitLayoutAspect
      && hasMatchingPayloadAspect
      && existingLayoutAspect !== (aspectLockedValue ? 'true' : 'false')){
      debugLog('Debug: resizer aspect lock clean archive layout preserved from synthetic sync', {
        tabId,
        component: componentName,
        requestedAspectLocked: !!aspectLockedValue,
        preservedAspectLocked: existingLayoutAspect === 'true',
        reason: reason || 'resizer-aspect-lock'
      });
      return false;
    }
    if(!tab.sharedState || typeof tab.sharedState !== 'object'){
      tab.sharedState = {};
    }
    if(!tab.sharedState.layout || typeof tab.sharedState.layout !== 'object'){
      tab.sharedState.layout = {};
    }
    if(!tab.sharedState.layout.resizer || typeof tab.sharedState.layout.resizer !== 'object'){
      tab.sharedState.layout.resizer = {};
    }
    tab.sharedState.layout.resizer.aspectLocked = !!aspectLockedValue;
    tab.sharedState.layout.resizer.updatedAt = Date.now();
    tab.sharedState.layout.resizer.reason = reason || 'resizer-aspect-lock';

    if(tab.layoutState && typeof tab.layoutState === 'object'){
      tab.layoutState.svgBox = tab.layoutState.svgBox || {};
      tab.layoutState.svgBox.dataset = tab.layoutState.svgBox.dataset || {};
      tab.layoutState.svgBox.dataset.resizerAspectLocked = aspectLockedValue ? 'true' : 'false';
      if(container?.dataset?.resizerAspectRatio){
        tab.layoutState.svgBox.dataset.resizerAspectRatio = String(container.dataset.resizerAspectRatio);
        tab.sharedState.layout.resizer.aspectRatio = String(container.dataset.resizerAspectRatio);
      }
    }
    if(tab.payload && typeof Shared.graphSizing?.setPayloadSizing === 'function'){
      const currentSizing = Shared.graphSizing.getPayloadSizing?.(tab.payload, {
        context: 'resizer-aspect-lock-read'
      }) || {};
      tab.payload = Shared.graphSizing.setPayloadSizing(tab.payload, {
        ...currentSizing,
        display: {
          ...(currentSizing.display || {}),
          aspectLocked: !!aspectLockedValue,
          aspectRatio: Number(container?.dataset?.resizerAspectRatio) || currentSizing.display?.aspectRatio
        }
      }, {
        context: 'resizer-aspect-lock-write',
        type: componentName
      });
    }
    debugLog('Debug: resizer aspect lock persisted to tab', {
      tabId,
      component: componentName,
      aspectLocked: !!aspectLockedValue,
      reason: reason || 'resizer-aspect-lock'
    });
    if(reason === 'checkbox-change'){
      markResizerTabUserModified(container, opts, 'resizer-aspect-lock');
    }
    return true;
  }

  function persistLockedGeometryToTab(container, opts, geometry){
    const tab = resolveResizerTab(container, opts);
    if(!normalizeTabId(tab?.id)){
      return false;
    }
    const componentName = opts.componentName || tab.type || null;
    if(componentName && Shared.componentLifecycle?.isRestoreTransactionActive?.(componentName, {
      tabId: tab.id,
      reason: 'resizer-locked-geometry'
    }) === true){
      return false;
    }
    const keys = [
      'resizerLockedGeometryRatio',
      'resizerLockedConstraintRatio',
      'resizerLockedGeometryInsetX',
      'resizerLockedGeometryInsetY',
      'resizerCartesianUserWidth',
      'resizerCartesianUserHeight',
      'resizerCartesianAxisXCount',
      'resizerCartesianAxisXFixed',
      'resizerCartesianAxisXMinimum',
      'resizerCartesianAxisYCount',
      'resizerCartesianAxisYFixed',
      'resizerCartesianAxisYMinimum',
      'resizerCartesianInsetLeft',
      'resizerCartesianInsetTop',
      'resizerCartesianInsetRight',
      'resizerCartesianInsetBottom'
    ];
    // A layoutState is a complete, authoritative layout snapshot. Locked
    // geometry may patch an existing snapshot, but must not create a partial
    // one: workspace hydration would otherwise reset the resizer defaults and
    // reinterpret the graph as an auto-filled panel.
    let layoutDataset = null;
    if(tab.layoutState && typeof tab.layoutState === 'object'){
      tab.layoutState.svgBox = tab.layoutState.svgBox && typeof tab.layoutState.svgBox === 'object'
        ? tab.layoutState.svgBox
        : {};
      tab.layoutState.svgBox.dataset = tab.layoutState.svgBox.dataset && typeof tab.layoutState.svgBox.dataset === 'object'
        ? tab.layoutState.svgBox.dataset
        : {};
      layoutDataset = tab.layoutState.svgBox.dataset;
    }
    tab.sharedState = tab.sharedState && typeof tab.sharedState === 'object' ? tab.sharedState : {};
    tab.sharedState.layout = tab.sharedState.layout && typeof tab.sharedState.layout === 'object' ? tab.sharedState.layout : {};
    tab.sharedState.layout.resizer = tab.sharedState.layout.resizer && typeof tab.sharedState.layout.resizer === 'object'
      ? tab.sharedState.layout.resizer
      : {};
    keys.forEach(key => {
      const value = geometry ? container?.dataset?.[key] : null;
      if(value !== undefined && value !== null && value !== ''){
        if(layoutDataset){
          layoutDataset[key] = String(value);
        }
        tab.sharedState.layout.resizer[key] = String(value);
      }else{
        if(layoutDataset){
          delete layoutDataset[key];
        }
        delete tab.sharedState.layout.resizer[key];
      }
    });
    tab.sharedState.layout.resizer.updatedAt = Date.now();
    return true;
  }

  const undoManager = Shared.undoManager;
  const resizerNamespace = Shared.resizer = Shared.resizer || {};
  function normalizeGraphView(view, legacyZoom = 1){
    if(view?.mode === 'fit') return { version: 1, mode: 'fit' };
    return { version: 1, mode: 'manual', zoomLevel: parsePositive(view?.zoomLevel) || parsePositive(legacyZoom) || 1 };
  }

  // The owner session holds viewing intent. Automatic fit scale is a local
  // projection and must never become saved figure geometry or viewing intent.
  resizerNamespace.getGraphViewState = function getGraphViewState(tabLike){
    if(!normalizeTabId(typeof tabLike === 'object' ? tabLike?.id : tabLike)) return null;
    const tab = Shared.workspaceTabs?.resolveTab?.(tabLike);
    if(!tab?.id || !tab.type) return null;
    const record = Shared.workspaceTabs.ensureSessionRecord?.(tab, tab.type, { reason: 'graph-view' });
    if(!record) return null;
    if(!record.runtime.graphView){
      const layout = tab.layoutState;
      record.runtime.graphView = layout
        ? normalizeGraphView(layout.graphView, layout.svgBox?.dataset?.resizerZoomLevel || layout.svgBox?.dataset?.resizerZoom)
        : { version: 1, mode: 'fit' };
    }
    return record.runtime.graphView;
  };

  resizerNamespace.restoreGraphViewState = function restoreGraphViewState(tabLike, layout){
    if(!normalizeTabId(typeof tabLike === 'object' ? tabLike?.id : tabLike)) return null;
    const tab = Shared.workspaceTabs?.resolveTab?.(tabLike);
    if(!tab?.id || !tab.type) return null;
    const record = Shared.workspaceTabs.ensureSessionRecord?.(tab, tab.type, { reason: 'graph-view-hydrate' });
    if(!record) return null;
    record.runtime.graphView = normalizeGraphView(layout?.graphView, layout?.svgBox?.dataset?.resizerZoomLevel || layout?.svgBox?.dataset?.resizerZoom);
    return record.runtime.graphView;
  };
  const displayOnlyZoomResizeRegistry = new WeakMap();
  const matchesDisplayOnlyZoomResize = (target, size = {}) => {
    const expected = target ? displayOnlyZoomResizeRegistry.get(target) : null;
    if(!expected){
      return false;
    }
    const expectedWidth = Number(expected.width);
    const expectedHeight = Number(expected.height);
    if(!Number.isFinite(expectedWidth) || !Number.isFinite(expectedHeight)){
      return false;
    }
    const width = Number(size.width);
    const height = Number(size.height);
    const matches = Number.isFinite(width)
      && Number.isFinite(height)
      && Math.abs(width - expectedWidth) <= 0.5
      && Math.abs(height - expectedHeight) <= 0.5;
    return matches;
  };
  resizerNamespace.isDisplayOnlyZoomResize = matchesDisplayOnlyZoomResize;
  resizerNamespace.consumeDisplayOnlyZoomResize = function consumeDisplayOnlyZoomResize(target, size = {}){
    const matches = matchesDisplayOnlyZoomResize(target, size);
    if(matches){
      displayOnlyZoomResizeRegistry.delete(target);
    }
    return matches;
  };

  function parseLayerMetric(svg, key){
    const value = Number(svg?.dataset?.[key]);
    return Number.isFinite(value) ? value : NaN;
  }

  function copyCanvasBitmap(sourceRoot, targetRoot){
    const sourceCanvases = Array.from(sourceRoot?.querySelectorAll?.('canvas') || []);
    const targetCanvases = Array.from(targetRoot?.querySelectorAll?.('canvas') || []);
    if(!sourceCanvases.length || sourceCanvases.length !== targetCanvases.length){
      return false;
    }
    let copied = false;
    for(let i = 0; i < sourceCanvases.length; i += 1){
      const source = sourceCanvases[i];
      const target = targetCanvases[i];
      const width = Number(source?.width) || 0;
      const height = Number(source?.height) || 0;
      if(!source || !target || !(width > 0) || !(height > 0)){
        return false;
      }
      target.width = width;
      target.height = height;
      target.style.width = source.style.width || target.style.width;
      target.style.height = source.style.height || target.style.height;
      const ctx = target?.getContext?.('2d');
      if(!source || !ctx || typeof ctx.drawImage !== 'function'){
        return false;
      }
      try{
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(source, 0, 0);
        copied = true;
      }catch(_err){
        return false;
      }
    }
    return copied;
  }

  resizerNamespace.reuseLayerDuringLiveResize = function reuseLayerDuringLiveResize(options = {}){
    const targetGroup = options.targetGroup || null;
    const previousSvg = options.previousSvg || null;
    const sourceSelector = typeof options.sourceSelector === 'string' ? options.sourceSelector : '';
    if(!targetGroup || !previousSvg || !sourceSelector || typeof previousSvg.querySelector !== 'function'){
      return false;
    }
    const sourceGroup = previousSvg.querySelector(sourceSelector);
    if(!sourceGroup){
      return false;
    }
    const shouldCopyCanvas = options.copyCanvas === true;
    if(shouldCopyCanvas && !sourceGroup.querySelector?.('canvas')){
      return false;
    }
    const metricKeys = options.metricKeys || {};
    const prevLeft = parseLayerMetric(previousSvg, metricKeys.left || 'plotLeft');
    const prevTop = parseLayerMetric(previousSvg, metricKeys.top || 'plotTop');
    const prevW = parseLayerMetric(previousSvg, metricKeys.width || 'plotW');
    const prevH = parseLayerMetric(previousSvg, metricKeys.height || 'plotH');
    const nextLeft = Number(options.nextMargin?.left);
    const nextTop = Number(options.nextMargin?.top);
    const nextW = Number(options.nextPlotW);
    const nextH = Number(options.nextPlotH);
    if(![prevLeft, prevTop, prevW, prevH, nextLeft, nextTop, nextW, nextH].every(Number.isFinite)
      || prevW <= 0 || prevH <= 0 || nextW <= 0 || nextH <= 0){
      return false;
    }
    const clone = sourceGroup.cloneNode(true);
    if(shouldCopyCanvas && !copyCanvasBitmap(sourceGroup, clone)){
      return false;
    }
    const scaleX = nextW / prevW;
    const scaleY = nextH / prevH;
    const translateX = nextLeft - prevLeft * scaleX;
    const translateY = nextTop - prevTop * scaleY;
    while(targetGroup.firstChild){
      targetGroup.removeChild(targetGroup.firstChild);
    }
    clone.setAttribute('transform', `translate(${translateX} ${translateY}) scale(${scaleX} ${scaleY})`);
    clone.setAttribute('data-render-mode', 'canvas-resize-reused');
    clone.setAttribute('data-resize-reused', 'true');
    targetGroup.appendChild(clone);
    targetGroup.setAttribute('data-render-mode', 'canvas-resize-reused');
    targetGroup.setAttribute('data-resize-reused', 'true');
    return true;
  };

  resizerNamespace.reuseCanvasLayerDuringLiveResize = function reuseCanvasLayerDuringLiveResize(options = {}){
    return resizerNamespace.reuseLayerDuringLiveResize({
      ...options,
      copyCanvas: true
    });
  };

  resizerNamespace.attachPanelDragResizer = function attachPanelDragResizer(opts = {}){
    const {
      panelResizer,
      tablePanel,
      graphPanel,
      configPanel,
      debugLabel,
      syncPanels,
      computeMinSvgWidth,
      onMinSvgWidth,
      diagramSelector = '.diagram-area'
    } = opts || {};
    const label = debugLabel || panelResizer?.id || tablePanel?.id || 'panel';
    if(!panelResizer || !tablePanel || !graphPanel){
      debugLog('Debug: Shared.resizer.attachPanelDragResizer skipped', {
        label,
        hasPanelResizer: !!panelResizer,
        hasTable: !!tablePanel,
        hasGraph: !!graphPanel
      }); // Debug: guard invalid wiring inputs
      return { detach(){ /* no-op */ } };
    }
    const doc = global.document;
    if(!doc){
      debugLog('Debug: Shared.resizer.attachPanelDragResizer skipped (no document)', { label });
      return { detach(){ /* no-op */ } };
    }
    const resolveActiveResizeOwner = () => {
      const ownerTab = resolveResizerTab(graphPanel || panelResizer || tablePanel, opts);
      const activeTabId = normalizeTabId(
        Shared.workspaceTabs?.resolveTab?.(null)?.id
        || global.Main?.session?.workspaceState?.activeTabId
        || global.Main?.session?.getActiveTab?.()?.id
      );
      const page = panelResizer.closest?.('.workspace-page') || null;
      if(!ownerTab?.id || !activeTabId || normalizeTabId(ownerTab.id) !== activeTabId || page?.hidden){
        return null;
      }
      return ownerTab;
    };
    const isVerticalPanelSplit = () => {
      if(typeof global.getComputedStyle !== 'function'){ return false; }
      try{
        return String(global.getComputedStyle(panelResizer.parentElement)?.flexDirection || '').toLowerCase() === 'column';
      }catch(_err){ return false; }
    };
    const resolvePanelSplitCapacity = (tableWidth, graphWidth) => {
      if(isVerticalPanelSplit()){ return 0; }
      const wrap = panelResizer.parentElement;
      if(wrap && typeof global.getComputedStyle === 'function'){
        try{
          const wrapStyle = global.getComputedStyle(wrap);
          const padding = (Number.parseFloat(wrapStyle.paddingLeft) || 0)
            + (Number.parseFloat(wrapStyle.paddingRight) || 0);
          const childGap = Number.parseFloat(wrapStyle.columnGap || wrapStyle.gap) || 0;
          const wrapWidth = Number(wrap.clientWidth)
            || Number(wrap.getBoundingClientRect?.()?.width);
          const dividerWidth = Number(panelResizer.getBoundingClientRect?.()?.width);
          const measured = wrapWidth - padding - (Number.isFinite(dividerWidth) ? dividerWidth : 0) - childGap * 2;
          if(measured > 0){ return measured; }
        }catch(_err){ /* use measured panel widths below */ }
      }
      const paneWidths = Number(tableWidth) + Number(graphWidth);
      const dividerRectWidth = Number(panelResizer.getBoundingClientRect?.()?.width) || 0;
      const dividerStyle = global.getComputedStyle ? global.getComputedStyle(panelResizer) : null;
      const margins = (Number.parseFloat(dividerStyle?.marginLeft) || 0)
        + (Number.parseFloat(dividerStyle?.marginRight) || 0);
      return paneWidths + dividerRectWidth + margins;
    };
    const resolveConfiguredDividerGap = () => {
      if(typeof global.getComputedStyle !== 'function'){ return 0; }
      try{
        const style = global.getComputedStyle(panelResizer);
        const token = Number.parseFloat(style?.getPropertyValue?.('--panel-resizer-gap'));
        if(Number.isFinite(token) && token >= 0){ return token; }
        return Math.max(0, Number.parseFloat(style?.marginRight) || 0);
      }catch(_err){ return 0; }
    };
    const resolveSplitBounds = capacity => ({
      minTable: 0,
      maxTable: Math.max(0, Number(capacity) || 0),
      minPercent: 0,
      maxPercent: 100,
      valid: Number.isFinite(Number(capacity)) && Number(capacity) > 0
    });
    const updateSeparatorValue = (tableWidth, graphWidth) => {
      const total = resolvePanelSplitCapacity(tableWidth, graphWidth);
      if(!(total > 0)){ return; }
      const value = Math.max(0, Math.min(100, Math.round(Number(tableWidth) / total * 100)));
      Shared.componentLayout?.projectWorkspacePanelSplit?.(tablePanel, graphPanel, Number(tableWidth) / total);
      panelResizer.setAttribute('aria-valuemin', '0');
      panelResizer.setAttribute('aria-valuemax', '100');
      panelResizer.setAttribute('aria-valuenow', String(value));
      panelResizer.setAttribute('aria-valuetext', `Table ${value} percent; graph ${100 - value} percent`);
    };
    const applyPanelSizes = (context, proposedTable, reason) => {
      const bounds = resolveSplitBounds(context.capacity);
      if(!bounds.valid){ return null; }
      const { maxTable } = bounds;
      const newTable = Math.max(0, Math.min(maxTable, proposedTable));
      const remaining = maxTable - newTable;
      const resizerGap = Math.min(context.resizerGap, remaining);
      const newGraph = Math.max(0, remaining - resizerGap);
      const tablePx = `${Math.round(newTable)}px`;
      const graphPx = `${Math.round(newGraph)}px`;
      Object.assign(tablePanel.style, {
        flex: `0 0 ${tablePx}`,
        flexBasis: tablePx,
        width: tablePx,
        minWidth: '0px',
        maxWidth: 'none'
      });
      Object.assign(graphPanel.style, {
        flex: `0 0 ${graphPx}`,
        flexBasis: graphPx,
        width: graphPx,
        minWidth: '0px',
        maxWidth: 'none'
      });
      panelResizer.style.marginRight = `${resizerGap}px`;
      Shared.componentLayout?.projectWorkspacePanelSplit?.(tablePanel, graphPanel, newTable / context.capacity);
      tablePanel.dataset.panelManualWidth = 'true';
      tablePanel.dataset.panelMinWidth = '0';
      graphPanel.dataset.panelManualWidth = 'true';
      if(typeof syncPanels === 'function'){
        try{
          syncPanels({
            phase: 'drag',
            source: context.source,
            reason,
            minSvgWidth: context.minSvgWidth,
            newTable,
            newGraph,
            minTable: 0
          });
        }catch(err){
          console.error('Shared.resizer.attachPanelDragResizer syncPanels error', err);
        }
      }
      const actualTable = Number(tablePanel.getBoundingClientRect?.()?.width);
      const actualGraph = Number(graphPanel.getBoundingClientRect?.()?.width);
      updateSeparatorValue(actualTable, actualGraph);
      return { newTable, newGraph };
    };
    const finishPanelResize = context => {
      if(typeof syncPanels === 'function'){
        try{
          syncPanels({
            phase: 'end',
            source: context.source,
            reason: `${label}-${context.source}-end`,
            minSvgWidth: context.minSvgWidth
          });
        }catch(err){
          console.error('Shared.resizer.attachPanelDragResizer syncPanels end error', err);
        }
      }
      updateSeparatorValue(
        Number(tablePanel.getBoundingClientRect?.()?.width),
        Number(graphPanel.getBoundingClientRect?.()?.width)
      );
      const layoutCommitted = commitResizerPanelLayout(
        graphPanel || panelResizer || tablePanel,
        opts,
        `${label}-${context.source}`
      );
      if(undoManager && typeof undoManager.captureTabState === 'function' && typeof undoManager.recordTabStateChange === 'function' && context.activeTabId && context.beforeTabState){
        const afterTabState = undoManager.captureTabState(context.activeTabId, {
          reason: `${label}-${context.source}-post`,
          persistActive: true,
          forcePreviewCapture: true
        });
        if(afterTabState){
          undoManager.recordTabStateChange({
            tabId: context.activeTabId,
            label: `panel-layout:${label}`,
            scope: label,
            from: context.beforeTabState,
            to: afterTabState,
            undoReason: `${label}-${context.source}-undo`,
            redoReason: `${label}-${context.source}-redo`
          });
        }
      }
      debugLog('Debug: Shared.resizer.attachPanelDragResizer resize end', {
        label,
        tabId: context.activeTabId || null,
        source: context.source,
        layoutCommitted
      });
    };
    const handlePointerDown = (event) => {
      const resolvedPanelTab = resolveActiveResizeOwner();
      if(!resolvedPanelTab){ return; }
      try{
        if(event?.preventDefault){ event.preventDefault(); }
      }catch(err){
        console.error('Shared.resizer.attachPanelDragResizer preventDefault error', err);
      }
      const rectTable = tablePanel.getBoundingClientRect?.();
      const rectGraph = graphPanel.getBoundingClientRect?.();
      const startTable = rectTable?.width;
      const startGraph = rectGraph?.width;
      if(!Number.isFinite(startTable) || !Number.isFinite(startGraph)){
        debugLog('Debug: Shared.resizer.attachPanelDragResizer invalid start sizes', {
          label,
          startTable,
          startGraph
        }); // Debug: abort when DOM widths are missing
        return;
      }
      const startX = Number(event?.clientX) || 0;
      const activeTabId = normalizeTabId(resolvedPanelTab?.id) || undoManager?.getActiveTabId?.() || null;
      const beforeTabState = (undoManager && typeof undoManager.captureTabState === 'function' && activeTabId)
        ? undoManager.captureTabState(activeTabId, {
            reason: `${label}-panel-drag-pre`,
            persistActive: true,
            forcePreviewCapture: true
          })
        : null;
      let gap = 0;
      if(diagramSelector){
        const diagramArea = graphPanel.querySelector?.(diagramSelector);
        if(diagramArea && global.getComputedStyle){
          try{
            const style = global.getComputedStyle(diagramArea);
            gap = Number.parseFloat(style?.gap || 0) || 0;
          }catch(err){
            console.error('Shared.resizer.attachPanelDragResizer gap error', err);
          }
        }
      }
      let minSvgWidth = 0;
      if(typeof computeMinSvgWidth === 'function'){
        try{
          const computed = computeMinSvgWidth({ tablePanel, graphPanel, configPanel, debugLabel: label });
          if(Number.isFinite(computed) && computed > 0){
            minSvgWidth = computed;
          }
        }catch(err){
          console.error('Shared.resizer.attachPanelDragResizer computeMinSvgWidth error', err);
        }
      }
      if(typeof onMinSvgWidth === 'function'){
        try{
          onMinSvgWidth(minSvgWidth);
        }catch(err){
          console.error('Shared.resizer.attachPanelDragResizer onMinSvgWidth error', err);
        }
      }
      const capacity = resolvePanelSplitCapacity(startTable, startGraph);
      const resizerGap = resolveConfiguredDividerGap();
      const tableDataset = tablePanel.dataset || {};
      if(startTable > 0 && (!Number.isFinite(Number.parseFloat(tableDataset.panelDefaultWidth)) || Number.parseFloat(tableDataset.panelDefaultWidth) <= 0)){
        tableDataset.panelDefaultWidth = String(Math.round(startTable));
        debugLog('Debug: Shared.resizer.attachPanelDragResizer stored default', { label, defaultTableWidth: tableDataset.panelDefaultWidth }); // Debug: capture default width
      }
      tableDataset.panelMinWidth = '0';
      const context = { activeTabId, beforeTabState, minSvgWidth, capacity, resizerGap, source: 'panel-drag' };
      debugLog('Debug: Shared.resizer.attachPanelDragResizer drag start', {
        label,
        startTable,
        startGraph,
        gap,
        minSvgWidth,
        capacity,
        resizerGap
      });
      const onMove = (ev) => {
        const clientX = Number(ev?.clientX) || 0;
        const dx = clientX - startX;
        const growRight = dx >= 0;
        const proposedTable = startTable + dx;
        const sizes = applyPanelSizes(context, proposedTable, `${label}-panel-drag`);
        if(!sizes){ return; }
        const { newTable, newGraph } = sizes;
        const clampedBase = Math.min(capacity, proposedTable);
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled() && clampedBase !== proposedTable){
          debugLog('Debug: Shared.resizer.attachPanelDragResizer table clamp', {
            label,
            proposedTable,
            clampedTable: clampedBase,
            capacity,
            newTable,
            newGraph
          });
        }
        debugLog('Debug: Shared.resizer.attachPanelDragResizer drag move', {
          label,
          dx,
          proposedTable,
          newTable,
          newGraph,
          growRight,
          minTable: 0,
          minSvgWidth
        });
      };
      const onUp = () => {
        doc.removeEventListener('pointermove', onMove);
        doc.removeEventListener('pointerup', onUp);
        finishPanelResize(context);
      };
      doc.addEventListener('pointermove', onMove);
      doc.addEventListener('pointerup', onUp);
    };
    panelResizer.addEventListener('pointerdown', handlePointerDown);
    const handleKeyDown = event => {
      if(event.target !== panelResizer || event.altKey || event.ctrlKey || event.metaKey){ return; }
      const step = event.shiftKey ? 0.1 : 0.02;
      let targetFraction;
      if(event.key === 'ArrowLeft' || event.key === 'ArrowRight'){
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        targetFraction = direction * step;
      }else if(event.key !== 'Home' && event.key !== 'End'){
        return;
      }
      const ownerTab = resolveActiveResizeOwner();
      if(!ownerTab){ return; }
      event.preventDefault();
      const currentTabId = normalizeTabId(ownerTab.id);
      const startTable = Number(tablePanel.getBoundingClientRect?.()?.width);
      const startGraph = Number(graphPanel.getBoundingClientRect?.()?.width);
      if(!Number.isFinite(startTable) || !Number.isFinite(startGraph)){ return; }
      const capacity = resolvePanelSplitCapacity(startTable, startGraph);
      const resizerGap = resolveConfiguredDividerGap();
      const splitBounds = resolveSplitBounds(capacity);
      const { minTable, maxTable } = splitBounds;
      if(!splitBounds.valid){ return; }
      let minSvgWidth = 0;
      if(typeof computeMinSvgWidth === 'function'){
        try{
          const computed = computeMinSvgWidth({ tablePanel, graphPanel, configPanel, debugLabel: label });
          if(Number.isFinite(computed) && computed > 0){ minSvgWidth = computed; }
        }catch(err){
          console.error('Shared.resizer.attachPanelDragResizer computeMinSvgWidth error', err);
        }
      }
      if(typeof onMinSvgWidth === 'function'){
        try{ onMinSvgWidth(minSvgWidth); }
        catch(err){ console.error('Shared.resizer.attachPanelDragResizer onMinSvgWidth error', err); }
      }
      const tableDataset = tablePanel.dataset || {};
      if(startTable > 0 && (!Number.isFinite(Number.parseFloat(tableDataset.panelDefaultWidth)) || Number.parseFloat(tableDataset.panelDefaultWidth) <= 0)){
        tableDataset.panelDefaultWidth = String(Math.round(startTable));
      }
      tableDataset.panelMinWidth = '0';
      const beforeTabState = undoManager?.captureTabState?.(currentTabId, {
        reason: `${label}-panel-keyboard-pre`,
        persistActive: true,
        forcePreviewCapture: true
      }) || null;
      const context = {
        activeTabId: currentTabId,
        beforeTabState,
        minSvgWidth,
        capacity,
        resizerGap,
        minTable: 0,
        source: 'panel-keyboard'
      };
      const currentFraction = startTable / capacity;
      const proposedTable = event.key === 'Home'
        ? minTable
        : (event.key === 'End' ? maxTable : Math.round(capacity * (currentFraction + targetFraction)));
      const nextTable = Math.max(minTable, Math.min(maxTable, proposedTable));
      if(Math.abs(nextTable - startTable) < 1 && panelResizer.dataset.panelSplitEdge !== (nextTable === 0 ? 'start' : (nextTable === capacity ? 'end' : ''))){ return; }
      applyPanelSizes(context, nextTable, `${label}-panel-keyboard`);
      finishPanelResize(context);
    };
    panelResizer.addEventListener('keydown', handleKeyDown);
    let separatorResizeObserver = null;
    if(typeof global.ResizeObserver === 'function'){
      separatorResizeObserver = new global.ResizeObserver(() => updateSeparatorValue(
        Number(tablePanel.getBoundingClientRect?.()?.width),
        Number(graphPanel.getBoundingClientRect?.()?.width)
      ));
      separatorResizeObserver.observe(tablePanel);
      separatorResizeObserver.observe(graphPanel);
    }
    updateSeparatorValue(
      Number(tablePanel.getBoundingClientRect?.()?.width),
      Number(graphPanel.getBoundingClientRect?.()?.width)
    );
    debugLog('Debug: Shared.resizer.attachPanelDragResizer attached', {
      label,
      hasSync: typeof syncPanels === 'function'
    }); // Debug: confirm helper wiring
    return {
      detach(){
        panelResizer.removeEventListener('pointerdown', handlePointerDown);
        panelResizer.removeEventListener('keydown', handleKeyDown);
        separatorResizeObserver?.disconnect?.();
        debugLog('Debug: Shared.resizer.attachPanelDragResizer detached', { label }); // Debug: helper detach
      }
    };
  };

  function closeSiblingOptionsMenus(control){
    const tray = control?.parentElement;
    if(!tray){
      return;
    }
    Array.from(tray.querySelectorAll('.resizer-options-control[open]')).forEach(openControl => {
      if(openControl !== control){
        openControl.removeAttribute('open');
      }
    });
  }

  function createGraphOptionsIcon(doc){
    if(!doc){
      return null;
    }
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'resizer-options-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const tracks = doc.createElementNS(svgNs, 'path');
    tracks.setAttribute('d', 'M4 6h16M4 12h16M4 18h16');
    svg.appendChild(tracks);

    [[8, 6], [15, 12], [11, 18]].forEach(([x, y]) => {
      const knob = doc.createElementNS(svgNs, 'circle');
      knob.setAttribute('class', 'resizer-options-icon-knob');
      knob.setAttribute('cx', String(x));
      knob.setAttribute('cy', String(y));
      knob.setAttribute('r', '1.75');
      svg.appendChild(knob);
    });
    return svg;
  }

  function openAxesLengthOptionsInMenu(menu){
    if(!menu){
      return;
    }
    Array.from(menu.querySelectorAll('.resizer-axeslength-control')).forEach(control => {
      control.setAttribute('open', '');
    });
  }

  function resetGraphOptionsMenuViewportOffset(menu){
    if(!menu?.style){
      return;
    }
    menu.style.removeProperty('--resizer-options-shift-x');
    menu.style.removeProperty('--resizer-options-shift-y');
  }

  function updateGraphOptionsMenuViewportOffset(menu){
    if(!menu?.style || typeof menu.getBoundingClientRect !== 'function'){
      return;
    }
    const getViewportCorrection = Shared.menuPosition?.getViewportCorrection;
    if(typeof getViewportCorrection !== 'function'){
      return;
    }
    const doc = menu.ownerDocument;
    const win = doc?.defaultView || global;
    const viewportWidth = Number(win.innerWidth || doc?.documentElement?.clientWidth || 0);
    const viewportHeight = Number(win.innerHeight || doc?.documentElement?.clientHeight || 0);
    if(viewportWidth <= 0 || viewportHeight <= 0){
      return;
    }

    resetGraphOptionsMenuViewportOffset(menu);
    const rect = menu.getBoundingClientRect();
    const correction = getViewportCorrection(rect, { viewportWidth, viewportHeight });
    menu.style.setProperty('--resizer-options-shift-x', `${correction.x}px`);
    menu.style.setProperty('--resizer-options-shift-y', `${correction.y}px`);
  }

  function syncGraphOptionsMenuViewportTracking(control, doc, open){
    if(!control){
      return;
    }
    const win = doc?.defaultView || global;
    if(!control.__resizerOptionsViewportHandler){
      control.__resizerOptionsViewportHandler = () => {
        const menu = control.querySelector('.resizer-options-menu');
        if(control.hasAttribute('open')){
          updateGraphOptionsMenuViewportOffset(menu);
        }else{
          resetGraphOptionsMenuViewportOffset(menu);
        }
      };
      control.__resizerOptionsViewportWindow = win;
    }
    const handler = control.__resizerOptionsViewportHandler;
    const viewportWindow = control.__resizerOptionsViewportWindow || win;
    if(open && !control.__resizerOptionsViewportTracking){
      viewportWindow.addEventListener('resize', handler);
      viewportWindow.addEventListener('scroll', handler, true);
      control.__resizerOptionsViewportTracking = true;
    }else if(!open){
      if(control.__resizerOptionsViewportTracking){
        viewportWindow.removeEventListener('resize', handler);
        viewportWindow.removeEventListener('scroll', handler, true);
        control.__resizerOptionsViewportTracking = false;
      }
      resetGraphOptionsMenuViewportOffset(control.querySelector('.resizer-options-menu'));
    }
  }

  const AXIS_TITLE_ROLES = ['xTitle', 'yTitle', 'zTitle'];
  const AXIS_TITLE_SELECTOR = AXIS_TITLE_ROLES
    .map(role => `text[data-font-role="${role}"]`)
    .join(', ');

  function resolveTitleVisibilityTabId(svgBox, opts){
    const explicit = String(opts?.tabId || '').trim();
    if(explicit){
      return explicit;
    }
    const owner = svgBox?.closest?.('[data-workspace-tab-id], [data-tab-id]');
    return String(owner?.dataset?.workspaceTabId || owner?.dataset?.tabId || '').trim() || null;
  }

  function hasAxisTitles(svgBox){
    return !!svgBox?.querySelector?.(AXIS_TITLE_SELECTOR);
  }

  function syncTitleVisibilityControls(svgBox, opts, menu){
    const fontControls = Shared.fontControls;
    const scopeId = String(opts?.componentName || '').trim();
    if(!svgBox || !scopeId || typeof fontControls?.areRolesVisible !== 'function'){
      return;
    }
    const tabId = resolveTitleVisibilityTabId(svgBox, opts);
    const graphInput = menu.querySelector('.resizer-graph-title-checkbox');
    const axesInput = menu.querySelector('.resizer-axes-title-checkbox');
    const axesControl = axesInput?.closest('.resizer-title-control');
    if(graphInput){
      graphInput.checked = fontControls.areRolesVisible(scopeId, 'graphTitle', { tabId });
    }
    if(axesInput){
      axesInput.checked = fontControls.areRolesVisible(scopeId, AXIS_TITLE_ROLES, { tabId });
    }
    if(axesControl){
      axesControl.hidden = !hasAxisTitles(svgBox);
    }
  }

  function ensureAxisTitleApplicabilityObserver(svgBox, optionsControl){
    if(
      !svgBox
      || !optionsControl
      || optionsControl.__resizerAxisTitleObserver
      || typeof global.MutationObserver !== 'function'
    ){
      return;
    }
    const observer = new global.MutationObserver(() => {
      optionsControl.__resizerTitleVisibilitySync?.();
    });
    observer.observe(svgBox, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-font-role']
    });
    optionsControl.__resizerAxisTitleObserver = observer;
  }

  function ensureTitleVisibilityControls(svgBox, doc, opts){
    const scopeId = String(opts?.componentName || '').trim();
    const fontControls = Shared.fontControls;
    if(
      !svgBox
      || !doc
      || !scopeId
      || typeof fontControls?.setRoleVisibility !== 'function'
      || typeof fontControls?.areRolesVisible !== 'function'
    ){
      return;
    }
    const setup = ensureGraphOptionsMenu(svgBox, doc, {
      debugLabel: `${scopeId}-title-options`,
      title: 'Graph options',
      controlsHost: opts?.controlsHost
    });
    if(!setup?.menu){
      return;
    }
    const ensureControl = (className, labelText, roles) => {
      let control = setup.menu.querySelector(`.${className}`);
      if(!control){
        control = doc.createElement('label');
        control.className = `resizer-title-control ${className}`;
        const input = doc.createElement('input');
        input.type = 'checkbox';
        input.className = className === 'resizer-graph-title-control'
          ? 'resizer-graph-title-checkbox'
          : 'resizer-axes-title-checkbox';
        input.setAttribute('aria-label', labelText);
        const text = doc.createElement('span');
        text.textContent = labelText;
        control.appendChild(input);
        control.appendChild(text);
        setup.menu.appendChild(control);
      }
      const input = control.querySelector('input[type="checkbox"]');
      if(input?.__resizerTitleVisibilityHandler){
        input.removeEventListener('change', input.__resizerTitleVisibilityHandler);
      }
      const onChange = () => {
        const tabId = resolveTitleVisibilityTabId(svgBox, opts);
        const next = !!input.checked;
        fontControls.setRoleVisibility(scopeId, roles, next, {
          tabId,
          recordUndo: true,
          undoLabel: `title-visibility:${className === 'resizer-graph-title-control' ? 'graph' : 'axes'}`,
          undoScope: svgBox.closest?.('.panel')?.id || scopeId
        });
        syncTitleVisibilityControls(svgBox, opts, setup.menu);
      };
      input?.addEventListener('change', onChange);
      if(input){
        input.__resizerTitleVisibilityHandler = onChange;
      }
      return control;
    };
    ensureControl('resizer-graph-title-control', 'Show graph title', 'graphTitle');
    ensureControl('resizer-axes-title-control', 'Show axes titles', AXIS_TITLE_ROLES);
    normalizeGraphOptionsMenuOrder(setup);
    setup.control.__resizerTitleVisibilitySync = () => syncTitleVisibilityControls(svgBox, opts, setup.menu);
    ensureAxisTitleApplicabilityObserver(svgBox, setup.control);
    syncTitleVisibilityControls(svgBox, opts, setup.menu);
  }

  const GRAPH_OPTIONS_ORDER = Object.freeze([
    ['.resizer-aspect-control', 10],
    ['.resizer-fontresize-control', 20],
    ['.resizer-graph-title-control', 30],
    ['.resizer-axes-title-control', 40],
    ['.resizer-legend-control', 50],
    ['.resizer-axeslength-control', 60]
  ]);

  function getGraphOptionOrderRank(control){
    if(!control || typeof control.matches !== 'function'){
      return null;
    }
    for(const [selector, rank] of GRAPH_OPTIONS_ORDER){
      if(control.matches(selector)){
        return rank;
      }
    }
    return null;
  }

  function normalizeGraphOptionsMenuOrder(setup){
    const menu = setup?.menu;
    if(!menu){
      return;
    }
    const knownControls = Array.from(menu.children)
      .filter(control => getGraphOptionOrderRank(control) !== null);
    if(knownControls.length < 2){
      return;
    }
    const orderedControls = knownControls.slice().sort((left, right) => (
      getGraphOptionOrderRank(left) - getGraphOptionOrderRank(right)
    ));
    if(orderedControls.every((control, index) => control === knownControls[index])){
      return;
    }

    const document = menu.ownerDocument || global.document;
    const markers = knownControls.map(() => document.createComment('resizer-graph-option-order'));
    knownControls.forEach((control, index) => {
      menu.replaceChild(markers[index], control);
    });
    markers.forEach((marker, index) => {
      marker.parentNode?.replaceChild(orderedControls[index], marker);
    });
  }

  function resolveGraphControlsHost(svgBox, opts = {}){
    if(opts.controlsHost && typeof opts.controlsHost.querySelector === 'function'){
      return opts.controlsHost;
    }
    const frame = svgBox?.closest?.('.graph-frame');
    return frame?.querySelector?.(':scope > .graph-controls-header') || svgBox;
  }

  function resolveGraphControlTray(svgBox, opts = {}){
    const host = resolveGraphControlsHost(svgBox, opts);
    return host?.querySelector?.(':scope > .resizer-control-tray') || null;
  }

  function syncGraphResizeBoundary(svgBox){
    const frame = svgBox?.closest?.('.graph-frame');
    if(!frame){ return; }
    const boxRect = svgBox.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const reserve = side => Number.parseFloat(svgBox.style.getPropertyValue(`--graph-content-extra-${side}`)) || 0;
    // The header is outside the resize surface. Compare its other three edges
    // with the already-published content envelope, never with SVG text bounds.
    const detached = boxRect.width > 0 && frameRect.width > 0 && (
      Math.abs(boxRect.left - reserve('left') - frameRect.left) > 1.5
      || Math.abs(boxRect.right + reserve('right') - frameRect.right) > 1.5
      || Math.abs(boxRect.bottom + reserve('bottom') - frameRect.bottom) > 1.5
    );
    frame.toggleAttribute('data-graph-resize-detached', detached);
  }

  function syncGraphFramePresentation(svgBox){
    const frame = svgBox?.closest?.('.graph-frame');
    if(!frame || !svgBox){
      return;
    }
    const background = global.getComputedStyle?.(svgBox)?.backgroundColor;
    // A transparent graph body uses the standard white frame surface.
    const surface = background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent'
      ? background
      : '#ffffff';
    frame.style.setProperty('--graph-frame-surface', surface);
    const exportControls = frame.nextElementSibling?.classList?.contains('graph-export-controls')
      ? frame.nextElementSibling
      : null;
    exportControls?.style?.setProperty('--graph-export-seam-color', surface);
    syncGraphResizeBoundary(svgBox);
  }

  function ensureGraphOptionsMenu(svgBox, doc, opts = {}){
    if(!svgBox || !doc){
      return null;
    }
    const controlsHost = resolveGraphControlsHost(svgBox, opts);
    let tray = resolveGraphControlTray(svgBox, opts);
    if(!tray){
      tray = doc.createElement('div');
      tray.className = 'resizer-control-tray';
      controlsHost.appendChild(tray);
      debugLog('Debug: resizer options tray created', {
        label: opts.debugLabel || null,
        trayChildren: tray.childElementCount
      });
    }
    let control = tray.querySelector(':scope > .resizer-options-control');
    if(!control){
      control = doc.createElement('details');
      control.className = 'resizer-options-control';
      const summary = doc.createElement('summary');
      summary.className = 'resizer-options-summary';
      summary.title = opts.title || 'Graph options';
      summary.setAttribute('aria-label', opts.title || 'Graph options');
      const icon = createGraphOptionsIcon(doc);
      if(icon){
        summary.appendChild(icon);
      }
      const menu = doc.createElement('div');
      menu.className = 'resizer-options-menu';
      control.appendChild(summary);
      control.appendChild(menu);
      tray.insertBefore(control, tray.firstChild || null);
      debugLog('Debug: resizer options menu created', {
        label: opts.debugLabel || null,
        trayChildren: tray.childElementCount
      });
    }else if(control.parentNode !== tray){
      tray.insertBefore(control, tray.firstChild || null);
    }else if(tray.firstChild !== control){
      tray.insertBefore(control, tray.firstChild || null);
    }
    const menu = control.querySelector('.resizer-options-menu');
    if(!menu){
      const newMenu = doc.createElement('div');
      newMenu.className = 'resizer-options-menu';
      control.appendChild(newMenu);
    }
    if(!control.__resizerOptionsToggleHandler){
      const onToggle = () => {
        if(control.hasAttribute('open')){
          closeSiblingOptionsMenus(control);
          control.__resizerSyncGraphSizeControls?.();
          openAxesLengthOptionsInMenu(control.querySelector('.resizer-options-menu'));
          control.__resizerTitleVisibilitySync?.();
          syncGraphOptionsMenuViewportTracking(control, doc, true);
          control.__resizerOptionsViewportHandler?.();
        }else{
          syncGraphOptionsMenuViewportTracking(control, doc, false);
        }
      };
      control.addEventListener('toggle', onToggle);
      control.__resizerOptionsToggleHandler = onToggle;
    }
    if(!control.__resizerOptionsKeyHandler){
      const onKeyDown = (event) => {
        if(event?.key === 'Escape' && control.hasAttribute('open')){
          control.removeAttribute('open');
          const summary = control.querySelector('.resizer-options-summary');
          if(summary && typeof summary.focus === 'function'){
            summary.focus();
          }
        }
      };
      control.addEventListener('keydown', onKeyDown);
      control.__resizerOptionsKeyHandler = onKeyDown;
    }
    if(!control.__resizerOptionsOutsideHandler){
      const onOutsidePointerDown = (event) => {
        if(!control.hasAttribute('open')){
          return;
        }
        const target = event?.target || null;
        if(target && control.contains(target)){
          return;
        }
        control.removeAttribute('open');
      };
      doc.addEventListener('pointerdown', onOutsidePointerDown, true);
      control.__resizerOptionsOutsideHandler = onOutsidePointerDown;
    }
    const setup = {
      tray,
      controlsHost,
      control,
      summary: control.querySelector('.resizer-options-summary'),
      menu: control.querySelector('.resizer-options-menu')
    };
    moveKnownGraphOptionsIntoMenu(svgBox, setup, opts);
    normalizeGraphOptionsMenuOrder(setup);
    if(!tray.__resizerOptionsObserver && global.MutationObserver){
      const observer = new global.MutationObserver(() => {
        moveKnownGraphOptionsIntoMenu(svgBox, setup, opts);
        normalizeGraphOptionsMenuOrder(setup);
      });
      observer.observe(tray, { childList: true });
      tray.__resizerOptionsObserver = observer;
    }
    if(setup.menu && !control.__resizerOptionsMenuSizeObserver && typeof global.ResizeObserver === 'function'){
      const observer = new global.ResizeObserver(() => {
        if(control.hasAttribute('open')){
          updateGraphOptionsMenuViewportOffset(setup.menu);
        }
      });
      observer.observe(setup.menu);
      control.__resizerOptionsMenuSizeObserver = observer;
    }
    return setup;
  }

  function moveGraphOptionIntoMenu(svgBox, optionControl, opts = {}){
    if(!svgBox || !optionControl){
      return null;
    }
    const doc = svgBox.ownerDocument || global.document;
    const setup = ensureGraphOptionsMenu(svgBox, doc, opts);
    if(!setup?.menu){
      return null;
    }
    if(optionControl.parentNode !== setup.menu){
      setup.menu.appendChild(optionControl);
      if(optionControl.classList?.contains('resizer-axeslength-control')){
        optionControl.setAttribute('open', '');
      }
      debugLog('Debug: resizer option moved into menu', {
        label: opts.debugLabel || null,
        className: optionControl.className || null,
        menuChildren: setup.menu.childElementCount
      });
    }
    normalizeGraphOptionsMenuOrder(setup);
    return setup;
  }

  function moveKnownGraphOptionsIntoMenu(svgBox, setup, opts = {}){
    const menu = setup?.menu;
    if(!svgBox || !menu){
      return;
    }
    const tray = setup.tray || resolveGraphControlTray(svgBox, opts);
    if(!tray){
      return;
    }
    GRAPH_OPTIONS_ORDER.map(([selector]) => selector).forEach(selector => {
      Array.from(tray.querySelectorAll(selector)).forEach(control => {
        if(control.closest('.resizer-options-control') === setup.control){
          return;
        }
        menu.appendChild(control);
        if(control.classList?.contains('resizer-axeslength-control') && setup.control?.hasAttribute('open')){
          openAxesLengthOptionsInMenu(menu);
        }
        debugLog('Debug: resizer known option moved into menu', {
          label: opts.debugLabel || null,
          selector,
          menuChildren: menu.childElementCount
        });
      });
    });
  }

  resizerNamespace.ensureGraphOptionsMenu = function ensureGraphOptionsMenuPublic(options){
    const opts = options || {};
    const svgBox = opts.svgBox;
    const doc = svgBox?.ownerDocument || global.document;
    const setup = ensureGraphOptionsMenu(svgBox, doc, opts);
    const controls = Array.isArray(opts.controls) ? opts.controls : [];
    controls.forEach(control => {
      moveGraphOptionIntoMenu(svgBox, control, opts);
    });
    return setup;
  };

  resizerNamespace.getGraphControlsHost = function getGraphControlsHost(options = {}){
    return resolveGraphControlsHost(options.svgBox || null, options);
  };

  resizerNamespace.getGraphControlTray = function getGraphControlTray(options = {}){
    return resolveGraphControlTray(options.svgBox || null, options);
  };

  resizerNamespace.syncGraphFramePresentation = syncGraphFramePresentation;

  resizerNamespace.closeTransientUiForRoot = function closeTransientUiForRoot(root){
    if(!root || typeof root.querySelectorAll !== 'function'){
      return 0;
    }
    const selector = '.resizer-options-control[open], .resizer-axeslength-control[open]';
    const openControls = [];
    if(root.matches?.(selector)){
      openControls.push(root);
    }
    openControls.push(...Array.from(root.querySelectorAll(selector)));
    openControls.forEach(control => control.removeAttribute('open'));
    return openControls.length;
  };

  resizerNamespace.ensureLegendControlPlacement = function ensureLegendControlPlacement(options){
    const opts = options || {};
    const svgBox = opts.svgBox;
    const control = opts.control;
    if(!svgBox || !control){
      return null;
    }
    const setup = moveGraphOptionIntoMenu(svgBox, control, {
      debugLabel: opts.debugLabel || 'legend-option',
      title: 'Graph options',
      controlsHost: opts.controlsHost
    });
    if(!setup){
      return null;
    }
    control.classList.remove('config-panel__checkbox', 'config-panel__checkbox--inline');
    control.classList.add('resizer-legend-control');
    if(!control.title){
      control.title = opts.title || 'Toggle legend visibility';
    }
    normalizeGraphOptionsMenuOrder(setup);
    const legacyTray = svgBox.querySelector('.resizer-bottom-tray');
    if(legacyTray && legacyTray.childElementCount === 0){
      legacyTray.remove();
    }
    return setup.menu;
  };

  function resolveSquareSize(label){
    const style = Shared.chartStyle || {};
    const widthCandidate = Number(style.DEFAULT_WIDTH);
    if(Number.isFinite(widthCandidate) && widthCandidate > 0){
      debugLog('Debug: resizer resolveSquareSize using chartStyle', { label, widthCandidate }); // Debug: use chartStyle width
      return widthCandidate;
    }
    return 360;
  }

  function enforceAspectRatio(opts){
    const {
      width,
      height,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      ratio,
      axis,
      fallbackWidth,
      fallbackHeight,
      label
    } = opts || {};
    const debugLabel = label || 'resizer';
    if(!Number.isFinite(ratio) || ratio <= 0){
      debugLog('Debug: enforceAspectRatio skipped', { debugLabel, ratio }); // Debug: invalid ratio guard
      return {
        width: clampDimension(width, minWidth, maxWidth),
        height: clampDimension(height, minHeight, maxHeight)
      };
    }
    const clampWidth = (val) => clampDimension(val, minWidth, maxWidth);
    const clampHeight = (val) => clampDimension(val, minHeight, maxHeight);
    let widthCandidate = Number.isFinite(width) ? clampWidth(width) : NaN;
    let heightCandidate = Number.isFinite(height) ? clampHeight(height) : NaN;

    if(axis === 'y' && Number.isFinite(heightCandidate)){
      widthCandidate = clampWidth(heightCandidate * ratio);
    }else if(axis === 'x' && Number.isFinite(widthCandidate)){
      heightCandidate = clampHeight(widthCandidate / ratio);
    }else{
      if(!Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
        widthCandidate = clampWidth(heightCandidate * ratio);
      }
      if(!Number.isFinite(heightCandidate) && Number.isFinite(widthCandidate)){
        heightCandidate = clampHeight(widthCandidate / ratio);
      }
      if(Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
        const widthDrivenHeight = clampHeight(widthCandidate / ratio);
        const heightDrivenWidth = clampWidth(heightCandidate * ratio);
        const widthError = Math.abs(widthDrivenHeight - heightCandidate);
        const heightError = Math.abs(heightDrivenWidth - widthCandidate);
        if(heightError < widthError){
          widthCandidate = heightDrivenWidth;
          heightCandidate = clampHeight(widthCandidate / ratio);
        }else{
          heightCandidate = widthDrivenHeight;
          widthCandidate = clampWidth(heightCandidate * ratio);
        }
      }
    }

    if(!Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
      widthCandidate = clampWidth(heightCandidate * ratio);
    }
    if(!Number.isFinite(heightCandidate) && Number.isFinite(widthCandidate)){
      heightCandidate = clampHeight(widthCandidate / ratio);
    }
    if(!Number.isFinite(widthCandidate) && !Number.isFinite(heightCandidate)){
      if(Number.isFinite(fallbackWidth)){
        widthCandidate = clampWidth(fallbackWidth);
        heightCandidate = clampHeight(widthCandidate / ratio);
      }else if(Number.isFinite(fallbackHeight)){
        heightCandidate = clampHeight(fallbackHeight);
        widthCandidate = clampWidth(heightCandidate * ratio);
      }
    }
    if(!Number.isFinite(widthCandidate) || !Number.isFinite(heightCandidate)){
      debugLog('Debug: enforceAspectRatio fallback insufficient', {
        debugLabel,
        width,
        height,
        fallbackWidth,
        fallbackHeight,
        ratio
      }); // Debug: insufficient data to enforce
      return { width: widthCandidate, height: heightCandidate };
    }

    for(let i = 0; i < 3; i += 1){
      const idealHeight = clampHeight(widthCandidate / ratio);
      const idealWidth = clampWidth(idealHeight * ratio);
      const adjustedHeight = clampHeight(idealWidth / ratio);
      if(Math.abs(idealWidth - widthCandidate) <= 1 && Math.abs(adjustedHeight - idealHeight) <= 1){
        widthCandidate = idealWidth;
        heightCandidate = adjustedHeight;
        break;
      }
      widthCandidate = idealWidth;
      heightCandidate = adjustedHeight;
    }

    debugLog('Debug: enforceAspectRatio result', {
      debugLabel,
      axis,
      output: { width: widthCandidate, height: heightCandidate },
      ratio,
      bounds: { minWidth, maxWidth, minHeight, maxHeight }
    }); // Debug: aspect ratio enforcement result

    return { width: widthCandidate, height: heightCandidate };
  }

  function px(n){ return Math.round(n) + 'px'; }

  const RESIZER_ZOOM_MIN = 0.5;
  const RESIZER_ZOOM_MAX = 3;
  const RESIZER_ZOOM_EPSILON = 0.0001;

  function normalizeZoomLevel(value, bounds = {}){
    const min = Number.isFinite(bounds.min) && bounds.min > 0 ? bounds.min : RESIZER_ZOOM_MIN;
    const maxCandidate = Number.isFinite(bounds.max) && bounds.max > 0 ? bounds.max : RESIZER_ZOOM_MAX;
    const max = Math.max(min, maxCandidate);
    const fallbackCandidate = Number.isFinite(bounds.fallback) && bounds.fallback > 0 ? bounds.fallback : 1;
    const fallback = Math.min(max, Math.max(min, fallbackCandidate));
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
    const clamped = Math.min(max, Math.max(min, resolved));
    return Math.round(clamped * 100) / 100;
  }

  function formatZoomLevel(level){
    const percent = Math.round((Number(level) || 1) * 100);
    return `${percent}%`;
  }

  function shouldSkipZoomTargetElement(element){
    if(!element || element.nodeType !== 1){
      return true;
    }
    const classList = element.classList;
    if(classList && (
      classList.contains('resizer')
      || classList.contains('resizer-control-tray')
      || classList.contains('resizer-bottom-tray')
      || classList.contains('resizer-options-control')
      || classList.contains('resizer-zoom-control')
      || classList.contains('resizer-zoom-viewport')
    )){
      return true;
    }
    return false;
  }

  function resolveZoomTargetElement(container){
    if(!container || !container.children){
      return null;
    }
    const children = Array.from(container.children);
    const existingViewport = children.find(child => child.classList && child.classList.contains('resizer-zoom-viewport')) || null;
    if(existingViewport){
      const existingContent = Array.from(existingViewport.children).find(child => child.classList && child.classList.contains('resizer-zoom-content')) || null;
      const existingTarget = existingContent
        ? (Array.from(existingContent.children).find(child => child?.dataset?.resizerZoomTarget === 'true')
          || Array.from(existingContent.children).find(child => child.nodeType === 1)
          || null)
        : null;
      if(existingContent && existingTarget){
        return {
          viewport: existingViewport,
          content: existingContent,
          target: existingTarget,
          wrapped: true,
          created: false
        };
      }
    }
    const target = children.find(child => !shouldSkipZoomTargetElement(child)) || null;
    if(!target){
      return null;
    }
    return {
      viewport: null,
      content: null,
      target,
      wrapped: false,
      created: false
    };
  }

  function ensureZoomViewport(container, doc){
    if(!container || !doc){
      return null;
    }
    const resolved = resolveZoomTargetElement(container);
    if(!resolved || !resolved.target){
      return null;
    }
    if(resolved.viewport && resolved.content){
      return resolved;
    }
    const viewport = doc.createElement('div');
    viewport.className = 'resizer-zoom-viewport';
    const content = doc.createElement('div');
    content.className = 'resizer-zoom-content';
    if(resolved.target.dataset){
      resolved.target.dataset.resizerZoomTarget = 'true';
    }
    const parent = resolved.target.parentNode;
    if(!parent){
      return null;
    }
    parent.insertBefore(viewport, resolved.target);
    content.appendChild(resolved.target);
    viewport.appendChild(content);
    return {
      viewport,
      content,
      target: resolved.target,
      wrapped: true,
      created: true
    };
  }

  Shared.attachResizableBox = function attachResizableBox(container, opts={}){
    if(!container) return;
    const rect = container.getBoundingClientRect();
    const data = container.dataset || {};
    const chartStyle = Shared.chartStyle || {};
    const graphSizing = Shared.graphSizing || null;
    const resizeMinScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
    const resizeMaxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
    const helperContext = opts.debugLabel || container?.id || container?.className || 'resizer';
    if(graphSizing && typeof graphSizing.ensureCssVariables === 'function'){
      graphSizing.ensureCssVariables({ context: helperContext });
    }
    let helperSizing = null;
    if(graphSizing && typeof graphSizing.getSizing === 'function'){
      try{
        helperSizing = graphSizing.getSizing({ context: helperContext });
      }catch(err){
        console.error('Shared.attachResizableBox graphSizing error', err);
      }
    }
    if(helperSizing){
      debugLog('Debug: attachResizableBox helper sizing applied', { context: helperContext, helperSizing });
    }
    const fallbackLabel = helperContext;
    const squareFallback = Number.isFinite(helperSizing?.width) && helperSizing.width > 0
      ? helperSizing.width
      : resolveSquareSize(fallbackLabel);
    const defaultWidthRaw = Number(chartStyle.DEFAULT_WIDTH);
    const defaultHeightRaw = Number(chartStyle.DEFAULT_HEIGHT);
    const defaultWidthFallback = Number.isFinite(defaultWidthRaw) && defaultWidthRaw > 0
      ? defaultWidthRaw
      : (Number.isFinite(helperSizing?.width) && helperSizing.width > 0 ? helperSizing.width : squareFallback);
    const defaultHeightFallback = Number.isFinite(defaultHeightRaw) && defaultHeightRaw > 0
      ? defaultHeightRaw
      : (Number.isFinite(helperSizing?.height) && helperSizing.height > 0 ? helperSizing.height : defaultWidthFallback);
    const parsedDefaultWidth = Number(opts.defaultWidth);
    const parsedDefaultHeight = Number(opts.defaultHeight);
    let defaultWidth = Number.isFinite(parsedDefaultWidth) && parsedDefaultWidth > 0
      ? parsedDefaultWidth
      : Number(data.resizerDefaultWidth);
    if(!Number.isFinite(defaultWidth) || defaultWidth <= 0){
      const rectWidth = Math.round(rect.width);
      defaultWidth = rectWidth > 0 ? rectWidth : defaultWidthFallback;
    }
    let defaultHeight = Number.isFinite(parsedDefaultHeight) && parsedDefaultHeight > 0
      ? parsedDefaultHeight
      : Number(data.resizerDefaultHeight);
    if(!Number.isFinite(defaultHeight) || defaultHeight <= 0){
      const rectHeight = Math.round(rect.height);
      defaultHeight = rectHeight > 0 ? rectHeight : defaultHeightFallback;
    }
    const minFromDefaultWidth = Number.isFinite(helperSizing?.minWidth) && helperSizing.minWidth > 0
      ? Math.round(helperSizing.minWidth)
      : Math.max(1, Math.round(defaultWidth * resizeMinScale));
    const minFromDefaultHeight = Number.isFinite(helperSizing?.minHeight) && helperSizing.minHeight > 0
      ? Math.round(helperSizing.minHeight)
      : Math.max(1, Math.round(defaultHeight * resizeMinScale));
    const maxFromDefaultWidth = Number.isFinite(helperSizing?.maxWidth) && helperSizing.maxWidth > 0
      ? Math.round(Math.max(helperSizing.maxWidth, defaultWidth))
      : Math.max(defaultWidth, Math.round(defaultWidth * resizeMaxScale));
    const maxFromDefaultHeight = Number.isFinite(helperSizing?.maxHeight) && helperSizing.maxHeight > 0
      ? Math.round(Math.max(helperSizing.maxHeight, defaultHeight))
      : Math.max(defaultHeight, Math.round(defaultHeight * resizeMaxScale));
    const parsedMinWidth = Number(opts.minWidth);
    const parsedMinHeight = Number(opts.minHeight);
    const labelFromOpts = typeof opts.debugLabel === 'string' ? opts.debugLabel : null;
    const closestPanel = typeof container.closest === 'function' ? container.closest('.panel') : null;
    const panelId = closestPanel && closestPanel.id ? closestPanel.id : null;
    const containerLabel = labelFromOpts || container.id || panelId || container.className || 'svgbox';
    const previousApi = container.__sharedResizableBoxApi;
    if(previousApi && typeof previousApi.destroy === 'function'){
      try{
        previousApi.destroy({ reason: 'reattach' });
        debugLog('Debug: resizer previous api destroyed', { container: containerLabel });
      }catch(err){
        console.error('Shared.attachResizableBox previous api destroy error', err);
      }
    }
    let MIN_W = Number.isFinite(parsedMinWidth) && parsedMinWidth > 0 ? parsedMinWidth : Number(data.resizerMinWidth);
    if(!Number.isFinite(MIN_W) || MIN_W <= 0){
      MIN_W = minFromDefaultWidth;
    }
    MIN_W = Math.max(MIN_W, minFromDefaultWidth);
    let MIN_H = Number.isFinite(parsedMinHeight) && parsedMinHeight > 0 ? parsedMinHeight : Number(data.resizerMinHeight);
    if(!Number.isFinite(MIN_H) || MIN_H <= 0){
      MIN_H = minFromDefaultHeight;
    }
    MIN_H = Math.max(MIN_H, minFromDefaultHeight);
    let BASE_MIN_W = MIN_W;
    let BASE_MIN_H = MIN_H;
    const parsedMaxWidth = Number(opts.maxWidth);
    const parsedMaxHeight = Number(opts.maxHeight);
    const helperMaxWidth = Number.isFinite(helperSizing?.maxWidth) && helperSizing.maxWidth > 0;
    const helperMaxHeight = Number.isFinite(helperSizing?.maxHeight) && helperSizing.maxHeight > 0;
    const hasExplicitMaxWidth = Number.isFinite(parsedMaxWidth) && parsedMaxWidth > 0;
    const hasExplicitMaxHeight = Number.isFinite(parsedMaxHeight) && parsedMaxHeight > 0;
    const allowUnlimitedOverride = opts.allowUnlimitedWidth === true;
    const allowUnlimitedWidth = allowUnlimitedOverride || (!hasExplicitMaxWidth && opts.allowUnlimitedWidth !== false);
    const allowUnlimitedHeightOverride = opts.allowUnlimitedHeight === true;
    const allowUnlimitedHeight = allowUnlimitedHeightOverride
      || (!hasExplicitMaxHeight && opts.allowUnlimitedHeight !== false && allowUnlimitedWidth);
    let MAX_W;
    if(allowUnlimitedWidth){
      MAX_W = Number.POSITIVE_INFINITY;
      debugLog('Debug: attachResizableBox unlimited width enabled', {
        container: containerLabel,
        helperMaxWidth,
        hasExplicitMaxWidth,
        ignoringHelperMaxWidth: helperMaxWidth,
        allowUnlimitedOverride
      }); // Debug: trace unlimited width flag
    }else{
      const storedMaxWidthRaw = data.resizerMaxWidth;
      const storedMaxWidth = Number(storedMaxWidthRaw);
      MAX_W = hasExplicitMaxWidth
        ? parsedMaxWidth
        : (Number.isFinite(storedMaxWidth) && storedMaxWidth > 0 ? storedMaxWidth : NaN);
      if(!Number.isFinite(MAX_W) || MAX_W <= 0){
        MAX_W = maxFromDefaultWidth;
      }
      MAX_W = Math.max(MAX_W, defaultWidth);
      MAX_W = Math.min(MAX_W, Math.max(defaultWidth, maxFromDefaultWidth));
    }
    let MAX_H;
    if(allowUnlimitedHeight){
      MAX_H = Number.POSITIVE_INFINITY;
      debugLog('Debug: attachResizableBox unlimited height enabled', {
        container: containerLabel,
        helperMaxHeight,
        hasExplicitMaxHeight,
        ignoringHelperMaxHeight: helperMaxHeight,
        allowUnlimitedHeightOverride
      }); // Debug: trace unlimited height flag
    }else{
      MAX_H = hasExplicitMaxHeight ? parsedMaxHeight : Number(data.resizerMaxHeight);
      if(!Number.isFinite(MAX_H) || MAX_H <= 0){
        MAX_H = maxFromDefaultHeight;
      }
      MAX_H = Math.max(MAX_H, defaultHeight);
      MAX_H = Math.min(MAX_H, Math.max(defaultHeight, maxFromDefaultHeight));
    }
    data.resizerDefaultWidth = String(defaultWidth);
    data.resizerDefaultHeight = String(defaultHeight);
    data.resizerMinWidth = String(MIN_W);
    data.resizerMinHeight = String(MIN_H);
    data.resizerUnlimitedWidth = allowUnlimitedWidth ? 'true' : 'false';
    data.resizerUnlimitedHeight = allowUnlimitedHeight ? 'true' : 'false';
    data.resizerMaxWidth = Number.isFinite(MAX_W) ? String(MAX_W) : 'Infinity';
    data.resizerMaxHeight = Number.isFinite(MAX_H) ? String(MAX_H) : 'Infinity';
    data.resizerResized = data.resizerResized || 'false';
    const parsedZoomMin = Number(opts.zoomMin);
    const parsedZoomMax = Number(opts.zoomMax);
    const zoomBounds = {
      min: Number.isFinite(parsedZoomMin) && parsedZoomMin > 0 ? parsedZoomMin : RESIZER_ZOOM_MIN,
      max: Number.isFinite(parsedZoomMax) && parsedZoomMax > 0 ? parsedZoomMax : RESIZER_ZOOM_MAX,
      fallback: 1
    };
    zoomBounds.max = Math.max(zoomBounds.min, zoomBounds.max);
    const persistedZoomLevel = normalizeZoomLevel(data.resizerZoomLevel || data.resizerZoom, zoomBounds);
    const graphView = () => resizerNamespace.getGraphViewState(resolveResizerTab(container, opts));
    const getFitZoomLevel = () => normalizeZoomLevel(
      Math.floor(chartStyle.getDefaultGraphViewScale() * 1000) / 1000,
      zoomBounds
    );
    let zoomLevel = graphView()?.mode === 'fit' ? getFitZoomLevel() : persistedZoomLevel;
    data.resizerZoom = String(zoomLevel);
    data.resizerZoomLevel = String(zoomLevel);
    // Existing inline dimensions still use the persisted scale. Fit zoom is a
    // viewport projection and must not change the canonical base frame.
    const zoomScaleForBase = Number.isFinite(persistedZoomLevel) && persistedZoomLevel > 0 ? persistedZoomLevel : 1;
    const initialBaseWidth = (parsePositive(rect.width) || defaultWidth) / zoomScaleForBase;
    const initialBaseHeight = (parsePositive(rect.height) || defaultHeight) / zoomScaleForBase;
    if(!parsePositive(data.resizerBaseWidth)){
      data.resizerBaseWidth = String(Math.round(initialBaseWidth));
    }
    if(!parsePositive(data.resizerBaseHeight)){
      data.resizerBaseHeight = String(Math.round(initialBaseHeight));
    }
    const isZoomDebugEnabled = () => typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const logZoom = (message, payload = {}) => {
      if(!isZoomDebugEnabled()){
        return;
      }
      debugLog(`Debug: resizer zoom ${message}`, Object.assign({
        container: containerLabel,
        zoomLevel
      }, payload));
    };
    let zoomTarget = null;
    let zoomControl = null;
    let zoomValue = null;
    let suppressObserveResizeUntil = 0;
    let manualResizeActive = false;
    let resizeObserver = null;
    let lastResizeNotificationSize = null;
    let graphWidthInput = null;
    let graphHeightInput = null;
    let graphOptionsControl = null;
    let graphSizeControlBindings = [];
    let userResizeTransaction = null;
    let graphFrame = null;
    let resizeBoundaryObserver = null;
    let fitFrame = null;
    let fitObserver = null;
    let fitMutationObserver = null;
    let destroyed = false;
    let fitButton = null;
    let actualButton = null;
    const fitPanel = opts.graphPanel || container.closest('[id$="GraphPanel"]');

    function syncGraphSizeControls(){
      if(!graphWidthInput || !graphHeightInput){
        return;
      }
      const rect = container.getBoundingClientRect?.();
      if(!Number.isFinite(rect?.width) || !Number.isFinite(rect?.height)){
        return;
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const dimensions = [
        { input: graphWidthInput, value: rect.width, minimum: MIN_W },
        { input: graphHeightInput, value: rect.height, minimum: MIN_H }
      ];
      dimensions.forEach(({ input, value, minimum }) => {
        input.min = String(Math.ceil(minimum));
        if(global.document?.activeElement !== input){
          input.value = String(Math.round(value / zoomScale));
        }
      });
    }

    function clearGraphSizeControlBindings(){
      graphSizeControlBindings.forEach(({ input, type, handler }) => {
        input.removeEventListener(type, handler);
      });
      graphSizeControlBindings = [];
    }

    function beginManualResizeTransaction(axis, rect, startW, startH, reason){
      const view = graphView();
      if(view){
        view.mode = 'manual';
        view.zoomLevel = zoomLevel;
        syncZoomControls();
      }
      invalidateResizerTabRenderCaches(container, opts, `resizer-start-${axis}`);
      if(aspectLocked){
        captureLockedGeometry({ resetRatio: false });
      }
      const usesCartesianLayout = isCartesianLayoutTransactionEnabled();
      if(aspectLocked && usesCartesianLayout && (committedCartesianPlan || readPersistedCartesianTransaction())){
        const transactionPlan = committedCartesianPlan || readPersistedCartesianTransaction()?.plan;
        const frameChrome = resolveCartesianFrameChrome(transactionPlan, rect);
        activeCartesianResizeTransaction = {
          plan: transactionPlan,
          plotRatio: readCartesianPlotRatio(transactionPlan),
          frameChromeWidth: frameChrome.width,
          frameChromeHeight: frameChrome.height
        };
      }else{
        activeCartesianResizeTransaction = null;
      }
      manualResizeActive = true;
      suppressObserverResize(220);
      if(!usesCartesianLayout){
        markOrthogonalViewportLock(axis, reason, { durationMs: 6000 });
      }
      container.style.boxSizing = 'border-box';
      container.style.width = px(startW);
      container.style.height = px(startH);
      container.style.flex = '0 0 auto';
      container.style.maxWidth = 'none';
      container.style.maxHeight = 'none';
      container.dataset.resizerResized = 'true';
      container.dataset.resizerWidth = container.style.width;
      container.dataset.resizerHeight = container.style.height;
      if(!usesCartesianLayout
        && shouldApplyLiveViewportLock(axis)
        && Shared.graphViewport && typeof Shared.graphViewport.applyLiveResizeLock === 'function'){
        try{
          Shared.graphViewport.applyLiveResizeLock(container, { axis, reason });
        }catch(err){
          console.error('resizer graph viewport live lock error', err);
        }
      }
      debugLog('Debug: resizer drag start', { axis, startW, startH, MIN_W, MIN_H });
      notifyResize('start');
      return true;
    }

    function finishManualResizeTransaction(axis, snapshot, finishReason, mode, trigger, dirtyReason){
      manualResizeActive = false;
      suppressObserverResize(320);
      debugLog('Debug: resizer drag end');
      markOrthogonalViewportLock(axis, finishReason, { capture: false, durationMs: 6000 });
      const endSnapshot = makeResizeSnapshot(finishReason);
      const changed = resizeSnapshotsDiffer(snapshot, endSnapshot);
      notifyUndoableResize(mode, snapshot, endSnapshot, trigger);
      if(changed){
        markResizerTabUserModified(container, opts, dirtyReason);
      }
      notifyResize('end');
      return changed;
    }

    function beginUserResize(axis){
      const ownerTab = resolveResizerTab(container, opts);
      const ownerTabId = normalizeTabId(ownerTab?.id);
      const activeTabId = normalizeTabId(
        Shared.workspaceTabs?.resolveTab?.(null)?.id
        || global.Main?.session?.workspaceState?.activeTabId
        || global.Main?.session?.getActiveTab?.()?.id
      );
      if(!ownerTabId || !activeTabId || ownerTabId !== activeTabId){
        return false;
      }
      const rect = container.getBoundingClientRect();
      if(!(rect.width > 0) || !(rect.height > 0)){
        return false;
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const startW = Math.min(MAX_W, Math.max(MIN_W, rect.width / zoomScale)) * zoomScale;
      const startH = Math.min(MAX_H, Math.max(MIN_H, rect.height / zoomScale)) * zoomScale;
      const snapshot = makeResizeSnapshot('keyboard-start');
      if(!beginManualResizeTransaction(axis, rect, startW, startH, `keyboard-start-${axis}`)){
        return false;
      }
      userResizeTransaction = { axis, snapshot, ownerTabId };
      return true;
    }

    function updateUserResize(axis, value){
      const dimension = Number(value);
      if(!Number.isFinite(dimension) || dimension <= 0){
        return false;
      }
      if(userResizeTransaction && userResizeTransaction.axis !== axis){
        finishUserResize('keyboard-axis-change');
      }
      if(!userResizeTransaction && !beginUserResize(axis)){
        return false;
      }
      const activeTabId = normalizeTabId(
        Shared.workspaceTabs?.resolveTab?.(null)?.id
        || global.Main?.session?.workspaceState?.activeTabId
        || global.Main?.session?.getActiveTab?.()?.id
      );
      if(activeTabId !== userResizeTransaction.ownerTabId){
        finishUserResize('keyboard-owner-change');
        return false;
      }
      const size = dimension;
      const applied = applyProgrammaticResize({
        axis,
        width: axis === 'x' ? size : undefined,
        height: axis === 'y' ? size : undefined,
        forceExact: false,
        preserveAspectLock: true,
        updateAspectRatio: false,
        resizePhase: 'move',
        reason: `keyboard-resize-${axis}`
      });
      syncGraphSizeControls();
      return applied?.changed === true;
    }

    function finishUserResize(reason = 'keyboard-end'){
      const transaction = userResizeTransaction;
      if(!transaction){
        return false;
      }
      userResizeTransaction = null;
      const changed = finishManualResizeTransaction(
        transaction.axis,
        transaction.snapshot,
        reason,
        `keyboard-${transaction.axis}`,
        'keyboard',
        `resizer-keyboard-${transaction.axis}`
      );
      syncGraphSizeControls();
      return changed;
    }

    function notifyResize(phase, errorLabel = 'resizer onResize error'){
      if(typeof opts.onResize !== 'function'){
        return;
      }
      const normalizedPhase = typeof phase === 'string' ? phase : '';
      if(activeCartesianResizeTransaction){
        activeCartesianResizeTransaction.phase = normalizedPhase;
        activeCartesianResizeTransaction.awaitingCommit = normalizedPhase === 'end';
      }
      try{
        opts.onResize(phase);
      }catch(err){
        console.error(errorLabel, err);
      }finally{
        try{
          Shared.componentLifecycle?.emitLifecycleEvent?.({
            action: 'resize-phase',
            componentKey: opts.componentName || container.dataset.workspaceComponent || null,
            tabId: activeResizerTabId || normalizeTabId(opts.tabId),
            phase: normalizedPhase,
            reason: `resizer-${normalizedPhase || 'unknown'}`
          });
        }catch(err){
          console.error('resizer resize-phase lifecycle event error', err);
        }
      }
      const rect = container.getBoundingClientRect?.();
      if(Number.isFinite(rect?.width) && Number.isFinite(rect?.height)){
        lastResizeNotificationSize = { width: rect.width, height: rect.height };
      }
      syncGraphSizeControls();
    }

    const activeResizerTab = resolveResizerTab(container, opts);
    const activeResizerTabId = normalizeTabId(activeResizerTab?.id);
    const existingScope = data.resizerProportionalFontResizeScope || null;
    const optionScope = typeof opts.scopeId === 'string' && opts.scopeId.trim() ? opts.scopeId.trim()
      : (typeof opts.proportionalFontResizeScope === 'string' && opts.proportionalFontResizeScope.trim() ? opts.proportionalFontResizeScope.trim() : null);
    const baseScope = optionScope || panelId || container.id || (labelFromOpts ? `${labelFromOpts}-scope` : null);
    const canonicalTabScope = activeResizerTabId && baseScope
      ? `${baseScope}::@tab:${activeResizerTabId}`
      : null;
    let fontResizeScope = existingScope || canonicalTabScope || baseScope;
    if(canonicalTabScope && fontResizeScope !== canonicalTabScope){
      fontResizeScope = canonicalTabScope;
    }
    if(!fontResizeScope){
      resizerScopeCounter += 1;
      fontResizeScope = `svgbox-scope-${resizerScopeCounter}`;
    }
    data.resizerProportionalFontResizeScope = fontResizeScope;
    if(typeof data.resizerProportionalFontResize !== 'string'){
      let initialProportionalResize = false;
      if(chartStyle && typeof chartStyle.isProportionalFontResizeEnabled === 'function'){
        try {
          initialProportionalResize = !!chartStyle.isProportionalFontResizeEnabled({ scopeId: fontResizeScope, svgBox: container });
        } catch(scopeErr){
          console.error('resizer proportional font resize initial state error', scopeErr);
        }
      }
      data.resizerProportionalFontResize = initialProportionalResize ? 'true' : 'false';
    }
    debugLog('Debug: resizer proportional font resize scope resolved', {
      container: containerLabel,
      scope: fontResizeScope,
      existingScope,
      canonicalTabScope,
      tabId: activeResizerTabId || null,
      fromOption: optionScope,
      fromPanel: panelId,
      labelFromOpts
    }); // Debug: resizer scope trace
    const ratioFromDefaults = (Number.isFinite(defaultWidth) && defaultWidth > 0 && Number.isFinite(defaultHeight) && defaultHeight > 0)
      ? (defaultWidth / defaultHeight)
      : (Number.isFinite(helperSizing?.aspectRatio) && helperSizing.aspectRatio > 0 ? helperSizing.aspectRatio : NaN);
    const rectWidthVal = parsePositive(rect.width);
    const rectHeightVal = parsePositive(rect.height);
    const ratioFromRect = (Number.isFinite(rectWidthVal) && Number.isFinite(rectHeightVal) && rectHeightVal > 0)
      ? (rectWidthVal / rectHeightVal)
      : NaN;
    let aspectRatio = parsePositive(data.resizerAspectRatio);
    const overrideAspectRatio = parsePositive(opts.aspectRatio);
    if(!Number.isFinite(aspectRatio) && Number.isFinite(overrideAspectRatio) && overrideAspectRatio > 0){
      aspectRatio = overrideAspectRatio;
      debugLog('Debug: resizer aspect ratio override', { container: containerLabel, overrideAspectRatio }); // Debug: aspect ratio override applied
    }
    if(!Number.isFinite(aspectRatio)){
      aspectRatio = Number.isFinite(ratioFromRect) ? ratioFromRect : ratioFromDefaults;
    }
    if(!Number.isFinite(aspectRatio) || aspectRatio <= 0){
      aspectRatio = Number.isFinite(ratioFromDefaults) ? ratioFromDefaults : 1;
    }
    const forcedAspectLocked = typeof opts.forceAspectLocked === 'boolean' ? opts.forceAspectLocked : null;
    const showAspectControl = opts.showAspectControl !== false;
    const liveViewportLockAxes = new Set(
      Array.isArray(opts.liveViewportLockAxes)
        ? opts.liveViewportLockAxes.filter(axis => axis === 'x' || axis === 'y')
        : ['x', 'y']
    );
    const shouldApplyLiveViewportLock = axis => liveViewportLockAxes.has(axis);
    const lockState = resolveAspectLockState(data);
    const hasPersistedAspectLock = lockState.hasExplicit;
    let aspectLocked = lockState.locked;
    if(!hasPersistedAspectLock && helperSizing && helperSizing.aspectLocked === false){
      aspectLocked = false;
    }
    const defaultAspectLocked = typeof opts.defaultAspectLocked === 'boolean'
      ? opts.defaultAspectLocked
      : (typeof opts.aspectLocked === 'boolean' ? opts.aspectLocked : undefined);
    if(!hasPersistedAspectLock && typeof defaultAspectLocked === 'boolean'){
      aspectLocked = defaultAspectLocked;
      debugLog('Debug: resizer aspect lock default applied', { container: containerLabel, aspectLocked }); // Debug: aspect lock default applied
    }
    if(forcedAspectLocked !== null){
      aspectLocked = forcedAspectLocked;
      debugLog('Debug: resizer aspect lock forced', { container: containerLabel, aspectLocked }); // Debug: aspect lock forced
    }
    if(aspectLocked && (!Number.isFinite(aspectRatio) || aspectRatio <= 0)){
      aspectLocked = false;
    }
    applyAspectLockState(data, aspectLocked, { syncGraph: false });

    let committedCartesianPlan = null;
    let activeCartesianResizeTransaction = null;
    let refreshCartesianRatioOnCommit = false;
    const persistedCartesianKeys = [
      'resizerCartesianUserWidth', 'resizerCartesianUserHeight',
      'resizerCartesianAxisXCount', 'resizerCartesianAxisXFixed', 'resizerCartesianAxisXMinimum',
      'resizerCartesianAxisYCount', 'resizerCartesianAxisYFixed', 'resizerCartesianAxisYMinimum',
      'resizerCartesianInsetLeft', 'resizerCartesianInsetTop',
      'resizerCartesianInsetRight', 'resizerCartesianInsetBottom'
    ];

    function clearPersistedCartesianFrame(){
      persistedCartesianKeys.forEach(key => { delete data[key]; });
    }

    function isCartesianLayoutTransactionEnabled(){
      const configured = opts.cartesianLayoutTransactionEnabled;
      if(typeof configured === 'function'){
        try{
          return configured({
            container,
            tabId: normalizeTabId(opts.tabId),
            componentName: opts.componentName || null
          }) === true;
        }catch(err){
          console.error('Shared.attachResizableBox Cartesian transaction capability error', err);
          return false;
        }
      }
      return configured === true;
    }

    function readCartesianPlotRatio(plan = committedCartesianPlan){
      const stored = parsePositive(data.resizerCartesianPlotRatio);
      if(Number.isFinite(stored) && stored > 0){
        return stored;
      }
      const width = Number(plan?.axisLengths?.x ?? plan?.plotRect?.width);
      const height = Number(plan?.axisLengths?.y ?? plan?.plotRect?.height);
      return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
        ? width / height
        : NaN;
    }

    function readPersistedCartesianTransaction(){
      if(!aspectLocked) return null;
      const targetRatio = parsePositive(data.resizerCartesianPlotRatio);
      const userWidth = parsePositive(data.resizerCartesianUserWidth);
      const userHeight = parsePositive(data.resizerCartesianUserHeight);
      const axisXCount = parsePositive(data.resizerCartesianAxisXCount);
      const axisXFixed = Number(data.resizerCartesianAxisXFixed);
      const axisXMinimum = parsePositive(data.resizerCartesianAxisXMinimum);
      const axisYCount = parsePositive(data.resizerCartesianAxisYCount);
      const axisYFixed = Number(data.resizerCartesianAxisYFixed);
      const axisYMinimum = parsePositive(data.resizerCartesianAxisYMinimum);
      const insetLeft = Number(data.resizerCartesianInsetLeft);
      const insetTop = Number(data.resizerCartesianInsetTop);
      const insetRight = Number(data.resizerCartesianInsetRight);
      const insetBottom = Number(data.resizerCartesianInsetBottom);
      if(![targetRatio, userWidth, userHeight, axisXCount, axisXFixed, axisXMinimum, axisYCount, axisYFixed, axisYMinimum, insetLeft, insetTop, insetRight, insetBottom]
        .every(Number.isFinite)
        || targetRatio <= 0 || userWidth <= 0 || userHeight <= 0
        || axisXCount <= 0 || axisYCount <= 0
        || axisXFixed < 0 || axisYFixed < 0
        || axisXMinimum <= 0 || axisYMinimum <= 0
        || insetLeft < 0 || insetTop < 0 || insetRight < 0 || insetBottom < 0){
        return null;
      }
      return {
        plan: {
          userFrame: { width: userWidth, height: userHeight },
          plotRect: {
            x: insetLeft,
            y: insetTop,
            width: Math.max(1, userWidth - axisXFixed),
            height: Math.max(1, userHeight - axisYFixed)
          },
          axisFrameModel: {
            x: { count: axisXCount, fixed: axisXFixed, minimum: axisXMinimum },
            y: { count: axisYCount, fixed: axisYFixed, minimum: axisYMinimum }
          },
          minimumPlot: { width: axisXMinimum, height: axisYMinimum },
          lock: {
            enabled: true,
            targetRatio,
            frameInsets: {
              horizontal: axisXFixed,
              vertical: axisYFixed,
              left: insetLeft,
              top: insetTop,
              right: insetRight,
              bottom: insetBottom
            }
          }
        },
        plotRatio: targetRatio,
        persisted: true
      };
    }

    function resolveCartesianFrameChrome(plan, rect = container.getBoundingClientRect()){
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const borderWidth = parsePositive(rect?.width) / zoomScale;
      const borderHeight = parsePositive(rect?.height) / zoomScale;
      const userWidth = Number(plan?.userFrame?.width);
      const userHeight = Number(plan?.userFrame?.height);
      return {
        width: Number.isFinite(borderWidth) && Number.isFinite(userWidth)
          ? Math.max(0, borderWidth - userWidth)
          : 0,
        height: Number.isFinite(borderHeight) && Number.isFinite(userHeight)
          ? Math.max(0, borderHeight - userHeight)
          : 0
      };
    }

    function setCartesianPlotRatio(nextRatio){
      if(!Number.isFinite(nextRatio) || nextRatio <= 0){
        delete data.resizerCartesianPlotRatio;
        return false;
      }
      data.resizerCartesianPlotRatio = String(nextRatio);
      return true;
    }

    function canCommitCartesianLayout(plan, ownerContext = {}){
      if(!isCartesianLayoutTransactionEnabled() || !plan || typeof plan !== 'object'){
        return false;
      }
      const expectedTabId = normalizeTabId(opts.tabId);
      const expectedComponent = String(opts.componentName || '').trim().toLowerCase() || null;
      const actualTabId = normalizeTabId(ownerContext.tabId || plan?.publication?.owner?.tabId);
      const actualComponent = String(ownerContext.componentName || ownerContext.component || plan?.publication?.owner?.component || '').trim().toLowerCase() || null;
      if((expectedTabId && actualTabId !== expectedTabId)
        || (expectedComponent && actualComponent !== expectedComponent)){
        return false;
      }
      const userWidth = Number(plan?.userFrame?.width);
      const userHeight = Number(plan?.userFrame?.height);
      const plotWidth = Number(plan?.axisLengths?.x ?? plan?.plotRect?.width);
      const plotHeight = Number(plan?.axisLengths?.y ?? plan?.plotRect?.height);
      const insets = plan?.lock?.frameInsets;
      return [userWidth, userHeight, plotWidth, plotHeight].every(value => Number.isFinite(value) && value > 0)
        && !!insets
        && Number.isFinite(Number(insets.horizontal))
        && Number.isFinite(Number(insets.vertical));
    }

    function commitCartesianLayout(plan, ownerContext = {}){
      const preflightApproved = ownerContext?.__cartesianPreflightPlan === plan;
      if(!preflightApproved && !canCommitCartesianLayout(plan, ownerContext)){
        console.warn('Shared.attachResizableBox rejected Cartesian layout publication for a different owner or invalid plan', {
          expectedTabId: normalizeTabId(opts.tabId) || null,
          actualTabId: normalizeTabId(ownerContext.tabId || plan?.publication?.owner?.tabId) || null,
          expectedComponent: String(opts.componentName || '').trim().toLowerCase() || null,
          actualComponent: String(ownerContext.componentName || ownerContext.component || plan?.publication?.owner?.component || '').trim().toLowerCase() || null
        });
        return false;
      }
      const plotWidth = Number(plan?.axisLengths?.x ?? plan?.plotRect?.width);
      const plotHeight = Number(plan?.axisLengths?.y ?? plan?.plotRect?.height);
      committedCartesianPlan = plan;
      if(aspectLocked){
        const plannedTarget = Number(plan?.lock?.targetRatio);
        const renderedRatio = plotWidth / plotHeight;
        const planRatio = Number.isFinite(plannedTarget) && plannedTarget > 0 ? plannedTarget : renderedRatio;
        // Metric renderers own their coordinate-span ratio; ordinary ratio
        // locks retain the ratio chosen by the user across layout changes.
        if(opts.cartesianRatioSource === 'layout' || refreshCartesianRatioOnCommit || !parsePositive(data.resizerCartesianPlotRatio)){
          setCartesianPlotRatio(planRatio);
          refreshCartesianRatioOnCommit = false;
        }
        const axisModel = plan?.axisFrameModel || {};
        const frameInsets = plan?.lock?.frameInsets || {};
        const persisted = {
          resizerCartesianUserWidth: plan?.userFrame?.width,
          resizerCartesianUserHeight: plan?.userFrame?.height,
          resizerCartesianAxisXCount: axisModel.x?.count,
          resizerCartesianAxisXFixed: axisModel.x?.fixed,
          resizerCartesianAxisXMinimum: axisModel.x?.minimum,
          resizerCartesianAxisYCount: axisModel.y?.count,
          resizerCartesianAxisYFixed: axisModel.y?.fixed,
          resizerCartesianAxisYMinimum: axisModel.y?.minimum,
          resizerCartesianInsetLeft: frameInsets.left,
          resizerCartesianInsetTop: frameInsets.top,
          resizerCartesianInsetRight: frameInsets.right,
          resizerCartesianInsetBottom: frameInsets.bottom
        };
        Object.entries(persisted).forEach(([key, value]) => {
          if(Number.isFinite(Number(value))) data[key] = String(value);
        });
        persistLockedGeometryToTab(container, opts, true);
      }
      if(activeCartesianResizeTransaction?.awaitingCommit === true
        && String(ownerContext.resizePhase || '').toLowerCase() === 'end'){
        activeCartesianResizeTransaction = null;
      }
      return true;
    }

    function clearCartesianLayout(ownerContext = {}){
      const expectedTabId = normalizeTabId(opts.tabId);
      const expectedComponent = String(opts.componentName || '').trim().toLowerCase() || null;
      const actualTabId = normalizeTabId(ownerContext.tabId);
      const actualComponent = String(ownerContext.componentName || ownerContext.component || '').trim().toLowerCase() || null;
      if((expectedTabId && actualTabId && actualTabId !== expectedTabId)
        || (expectedComponent && actualComponent && actualComponent !== expectedComponent)){
        return false;
      }
      committedCartesianPlan = null;
      activeCartesianResizeTransaction = null;
      refreshCartesianRatioOnCommit = false;
      delete data.resizerCartesianPlotRatio;
      clearPersistedCartesianFrame();
      persistLockedGeometryToTab(container, opts, null);
      return true;
    }

    function setAspectRatio(nextRatio){
      if(!Number.isFinite(nextRatio) || nextRatio <= 0) return;
      aspectRatio = nextRatio;
      data.resizerAspectRatio = String(nextRatio);
      debugLog('Debug: resizer aspect ratio set', { container: containerLabel, aspectRatio }); // Debug: aspect ratio set
    }

    function getActiveRatio(){
      if(Number.isFinite(aspectRatio) && aspectRatio > 0){
        return aspectRatio;
      }
      const fallback = Number.isFinite(ratioFromDefaults) && ratioFromDefaults > 0 ? ratioFromDefaults : 1;
      setAspectRatio(fallback);
      debugLog('Debug: resizer aspect ratio fallback', { container: containerLabel, fallback }); // Debug: aspect ratio fallback
      return aspectRatio;
    }

    function readRectRatio(){
      const liveRect = container.getBoundingClientRect();
      const liveWidth = parsePositive(liveRect.width);
      const liveHeight = parsePositive(liveRect.height);
      if(Number.isFinite(liveWidth) && Number.isFinite(liveHeight) && liveHeight > 0){
        const ratio = liveWidth / liveHeight;
        setAspectRatio(ratio);
        debugLog('Debug: resizer aspect ratio from rect', { container: containerLabel, ratio }); // Debug: aspect ratio from rect
        return ratio;
      }
      return getActiveRatio();
    }

    function captureLockedGeometry(options = {}){
      let measurement = null;
      if(typeof opts.measureLockedGeometry === 'function'){
        try{
          measurement = opts.measureLockedGeometry({ container, zoomLevel }) || null;
        }catch(err){
          console.error('Shared.attachResizableBox locked geometry measurement error', err);
        }
      }
      if(!measurement){
        measurement = Shared.axisControls?.measureRenderedAxes?.(container, {
          includeUnregistered: true
        }) || null;
      }
      if(!measurement){
        return null;
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const liveRect = container.getBoundingClientRect();
      const frameWidth = parsePositive(liveRect.width) / zoomScale;
      const frameHeight = parsePositive(liveRect.height) / zoomScale;
      const geometryWidth = (parsePositive(measurement.width) || parsePositive(measurement.x)) / zoomScale;
      const geometryHeight = (parsePositive(measurement.height) || parsePositive(measurement.y)) / zoomScale;
      const constraintWidth = (parsePositive(measurement.constraintWidth) || geometryWidth * zoomScale) / zoomScale;
      const constraintHeight = (parsePositive(measurement.constraintHeight) || geometryHeight * zoomScale) / zoomScale;
      if(![frameWidth, frameHeight, geometryWidth, geometryHeight, constraintWidth, constraintHeight].every(Number.isFinite)){
        return null;
      }
      const measuredRatio = geometryWidth / geometryHeight;
      const storedRatio = parsePositive(data.resizerLockedGeometryRatio);
      const ratio = options.resetRatio === true || !Number.isFinite(storedRatio)
        ? measuredRatio
        : storedRatio;
      const measuredConstraintRatio = constraintWidth / constraintHeight;
      const storedConstraintRatio = parsePositive(data.resizerLockedConstraintRatio);
      const constraintRatio = options.resetRatio === true || !Number.isFinite(storedConstraintRatio)
        ? measuredConstraintRatio
        : storedConstraintRatio;
      data.resizerLockedGeometryRatio = String(ratio);
      data.resizerLockedConstraintRatio = String(constraintRatio);
      data.resizerLockedGeometryInsetX = String(Math.max(0, frameWidth - constraintWidth));
      data.resizerLockedGeometryInsetY = String(Math.max(0, frameHeight - constraintHeight));
      persistLockedGeometryToTab(container, opts, true);
      return {
        ratio,
        measuredRatio,
        constraintRatio,
        measuredConstraintRatio,
        insetX: Number(data.resizerLockedGeometryInsetX),
        insetY: Number(data.resizerLockedGeometryInsetY)
      };
    }

    function calibrateLockedGeometryConstraint(){
      if(isCartesianLayoutTransactionEnabled()){
        return false;
      }
      if(!aspectLocked){
        return false;
      }
      const geometry = captureLockedGeometry({ resetRatio: false });
      if(!geometry){
        return false;
      }
      const correctedConstraintRatio = geometry.measuredConstraintRatio * geometry.ratio / geometry.measuredRatio;
      if(!Number.isFinite(correctedConstraintRatio) || correctedConstraintRatio <= 0){
        return false;
      }
      data.resizerLockedConstraintRatio = String(correctedConstraintRatio);
      persistLockedGeometryToTab(container, opts, true);
      return Math.abs(geometry.measuredRatio / geometry.ratio - 1) > 0.001;
    }

    function captureZoomEnvelopeBase(previousZoomScale = 1){
      const zoomSetup = ensureZoomElements();
      if(!zoomSetup){
        return;
      }
      const svg = zoomSetup.target?.matches?.('svg')
        ? zoomSetup.target
        : zoomSetup.target?.querySelector?.('svg');
      const renderedScaleX = Number(svg?.dataset?.graphContentRenderedScaleX);
      const renderedScaleY = Number(svg?.dataset?.graphContentRenderedScaleY);
      const sides = ['left', 'top', 'right', 'bottom'];
      const values = {};
      sides.forEach(side => {
        const property = `--graph-content-extra-${side}`;
        const current = Number.parseFloat(container.style.getPropertyValue(property));
        const reserve = Number(svg?.dataset?.[`graphContentReserve${side[0].toUpperCase()}${side.slice(1)}`]);
        const renderedScale = side === 'left' || side === 'right' ? renderedScaleX : renderedScaleY;
        const fromPublishedViewport = Number.isFinite(reserve) && reserve >= 0
          ? reserve * (Number.isFinite(renderedScale) && renderedScale > 0 ? renderedScale : 1)
          : NaN;
        values[side] = {
          present: Number.isFinite(fromPublishedViewport) || Number.isFinite(current),
          value: Number.isFinite(fromPublishedViewport)
            ? fromPublishedViewport
            : (Number.isFinite(current) ? current / Math.max(0.01, previousZoomScale) : 0)
        };
      });
      return values;
    }

    function syncZoomContentEnvelope(zoomScale, values){
      if(!values){
        return;
      }
      ['left', 'top', 'right', 'bottom'].forEach(side => {
        const property = `--graph-content-extra-${side}`;
        const entry = values[side];
        if(entry?.present){
          container.style.setProperty(property, px(entry.value * zoomScale));
        }else{
          container.style.removeProperty(property);
        }
      });
      syncGraphFramePresentation(container);
    }

    function syncZoomPresentation(){
      const zoomSetup = ensureZoomElements();
      if(!zoomSetup){
        return;
      }
      if(zoomSetup.viewport){
        zoomSetup.viewport.style.flex = '1 1 auto';
        zoomSetup.viewport.style.width = '100%';
        zoomSetup.viewport.style.height = '100%';
        zoomSetup.viewport.style.minWidth = '0';
        zoomSetup.viewport.style.minHeight = '0';
      }
      if(zoomSetup.content){
        zoomSetup.content.style.flex = '';
        zoomSetup.content.style.width = '';
        zoomSetup.content.style.height = '';
        zoomSetup.content.style.minWidth = '';
        zoomSetup.content.style.minHeight = '';
        // Keep graph geometry at its base dimensions and magnify only its
        // rendered footprint. The outer frame uses the same zoom scale.
        const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
        zoomSetup.content.style.setProperty('--resizer-content-zoom', String(zoomScale));
        container.style.setProperty('--resizer-view-scale', String(zoomScale));
      }
    }

    function suppressObserverResize(ms){
      const duration = Number.isFinite(ms) && ms > 0 ? ms : 220;
      suppressObserveResizeUntil = Math.max(suppressObserveResizeUntil, Date.now() + duration);
      logZoom('observer-suppress', { until: suppressObserveResizeUntil, duration });
    }

    function shouldSuppressObserverResize(){
      if(manualResizeActive){
        logZoom('observer-skipped-manual-resize', { active: true });
        return true;
      }
      if(Date.now() <= suppressObserveResizeUntil){
        logZoom('observer-skipped', { suppressObserveResizeUntil });
        return true;
      }
      return false;
    }

    function applyResize({ width, height, axis, fallbackWidth, fallbackHeight, reason, aspectLockedOverride, graphAuthority }){
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const writesGraphAuthority = graphAuthority !== false && !/^zoom(?:-|$)/.test(String(reason || ''));
      const minimumWidth = MIN_W;
      if(!/^zoom(?:-|$)/.test(String(reason || ''))){
        displayOnlyZoomResizeRegistry.delete(container);
      }
      const requestedBaseWidth = Number.isFinite(width) ? (width / zoomScale) : NaN;
      const requestedBaseHeight = Number.isFinite(height) ? (height / zoomScale) : NaN;
      const fallbackBaseWidth = Number.isFinite(fallbackWidth) ? (fallbackWidth / zoomScale) : NaN;
      const fallbackBaseHeight = Number.isFinite(fallbackHeight) ? (fallbackHeight / zoomScale) : NaN;
      let finalBaseWidth = NaN;
      let finalBaseHeight = NaN;
      const effectiveAspectLocked = typeof aspectLockedOverride === 'boolean'
        ? aspectLockedOverride
        : aspectLocked;
      const usesCartesianLayout = isCartesianLayoutTransactionEnabled();
      if(!writesGraphAuthority){
        // Viewing projects the canonical frame. Resize constraints must not
        // solve a different frame while applying display-only magnification.
        finalBaseWidth = requestedBaseWidth;
        finalBaseHeight = requestedBaseHeight;
      }else if(effectiveAspectLocked && usesCartesianLayout){
        const cartesianLayout = Shared.cartesianLayout;
        const transaction = activeCartesianResizeTransaction;
        const cartesianPlan = transaction?.plan || committedCartesianPlan || readPersistedCartesianTransaction()?.plan;
        const plotRatio = Number.isFinite(transaction?.plotRatio) && transaction.plotRatio > 0
          ? transaction.plotRatio
          : readCartesianPlotRatio(cartesianPlan);
        if(cartesianPlan
          && cartesianLayout
          && typeof cartesianLayout.solveLockedUserFrame === 'function'
          && Number.isFinite(plotRatio)
          && plotRatio > 0){
          // Resizer dimensions are the .svgbox border box; Cartesian plans use
          // the canonical drawable/content box. Solve in one coordinate system
          // and add the current box chrome back exactly once afterwards.
          const liveFrameChrome = transaction ? null : resolveCartesianFrameChrome(cartesianPlan);
          const frameChromeWidth = transaction ? transaction.frameChromeWidth : liveFrameChrome.width;
          const frameChromeHeight = transaction ? transaction.frameChromeHeight : liveFrameChrome.height;
          const toUserWidth = value => Number.isFinite(value) ? Math.max(1, value - frameChromeWidth) : NaN;
          const toUserHeight = value => Number.isFinite(value) ? Math.max(1, value - frameChromeHeight) : NaN;
          const solved = cartesianLayout.solveLockedUserFrame({
            userFrame: cartesianPlan.userFrame,
            proposal: {
              width: toUserWidth(Number.isFinite(requestedBaseWidth) ? requestedBaseWidth : fallbackBaseWidth),
              height: toUserHeight(Number.isFinite(requestedBaseHeight) ? requestedBaseHeight : fallbackBaseHeight)
            },
            frameInsets: cartesianPlan.lock?.frameInsets,
            axisFrameModel: cartesianPlan.axisFrameModel,
            targetRatio: plotRatio,
            drive: axis === 'x' ? 'width' : (axis === 'y' ? 'height' : 'both'),
            bounds: { minWidth: Math.max(1, minimumWidth - frameChromeWidth), minHeight: Math.max(1, MIN_H - frameChromeHeight), maxWidth: Math.max(1, MAX_W - frameChromeWidth), maxHeight: Math.max(1, MAX_H - frameChromeHeight) },
            minimumPlot: cartesianPlan.minimumPlot
          });
          if(solved?.valid !== false
            && Number.isFinite(Number(solved?.userFrame?.width))
            && Number.isFinite(Number(solved?.userFrame?.height))){
            finalBaseWidth = Number(solved.userFrame.width) + frameChromeWidth;
            finalBaseHeight = Number(solved.userFrame.height) + frameChromeHeight;
          }
        }
        if(!Number.isFinite(finalBaseWidth) || !Number.isFinite(finalBaseHeight)){
          // A migrated locked chart must never reinterpret a pointer move with
          // the legacy frame ratio or stale measured insets. Until its owner has
          // committed a current plan, hold the existing canonical user frame.
          const currentRect = container.getBoundingClientRect();
          finalBaseWidth = parsePositive(currentRect.width) / zoomScale;
          finalBaseHeight = parsePositive(currentRect.height) / zoomScale;
          if(!Number.isFinite(finalBaseWidth)){
            finalBaseWidth = Number(cartesianPlan?.userFrame?.width) || defaultWidth;
          }
          if(!Number.isFinite(finalBaseHeight)){
            finalBaseHeight = Number(cartesianPlan?.userFrame?.height) || defaultHeight;
          }
        }
      }else if(effectiveAspectLocked){
        const geometryRatio = parsePositive(data.resizerLockedConstraintRatio)
          || parsePositive(data.resizerLockedGeometryRatio);
        const geometryInsetX = Number(data.resizerLockedGeometryInsetX);
        const geometryInsetY = Number(data.resizerLockedGeometryInsetY);
        const hasGeometryConstraint = Number.isFinite(geometryRatio)
          && geometryRatio > 0
          && Number.isFinite(geometryInsetX)
          && geometryInsetX >= 0
          && Number.isFinite(geometryInsetY)
          && geometryInsetY >= 0;
        if(hasGeometryConstraint){
          const enforcedPlot = enforceAspectRatio({
            width: Number.isFinite(requestedBaseWidth) ? Math.max(1, requestedBaseWidth - geometryInsetX) : NaN,
            height: Number.isFinite(requestedBaseHeight) ? Math.max(1, requestedBaseHeight - geometryInsetY) : NaN,
            minWidth: Math.max(1, minimumWidth - geometryInsetX),
            maxWidth: Number.isFinite(MAX_W) ? Math.max(1, MAX_W - geometryInsetX) : MAX_W,
            minHeight: Math.max(1, MIN_H - geometryInsetY),
            maxHeight: Number.isFinite(MAX_H) ? Math.max(1, MAX_H - geometryInsetY) : MAX_H,
            ratio: geometryRatio,
            axis,
            fallbackWidth: Number.isFinite(fallbackBaseWidth) ? Math.max(1, fallbackBaseWidth - geometryInsetX) : NaN,
            fallbackHeight: Number.isFinite(fallbackBaseHeight) ? Math.max(1, fallbackBaseHeight - geometryInsetY) : NaN,
            label: `${containerLabel} locked geometry`
          });
          finalBaseWidth = Number.isFinite(enforcedPlot.width) ? enforcedPlot.width + geometryInsetX : NaN;
          finalBaseHeight = Number.isFinite(enforcedPlot.height) ? enforcedPlot.height + geometryInsetY : NaN;
        }else{
          const enforced = enforceAspectRatio({
            width: requestedBaseWidth,
            height: requestedBaseHeight,
            minWidth: minimumWidth,
            maxWidth: MAX_W,
            minHeight: MIN_H,
            maxHeight: MAX_H,
            ratio: getActiveRatio(),
            axis,
            fallbackWidth: fallbackBaseWidth,
            fallbackHeight: fallbackBaseHeight,
            label: containerLabel
          });
          finalBaseWidth = enforced.width;
          finalBaseHeight = enforced.height;
        }
      }
      if(!Number.isFinite(finalBaseWidth) && axis !== 'y'){
        finalBaseWidth = clampDimension(requestedBaseWidth, minimumWidth, MAX_W);
      }
      if(!Number.isFinite(finalBaseHeight) && axis !== 'x'){
        finalBaseHeight = clampDimension(requestedBaseHeight, MIN_H, MAX_H);
      }
      const finalWidth = Number.isFinite(finalBaseWidth) ? finalBaseWidth * zoomScale : NaN;
      const finalHeight = Number.isFinite(finalBaseHeight) ? finalBaseHeight * zoomScale : NaN;
      const previousWidth = container.style.width;
      const previousHeight = container.style.height;
      if(Number.isFinite(finalWidth)){
        container.style.width = px(finalWidth);
        container.dataset.resizerWidth = container.style.width;
        container.dataset.resizerBaseWidth = String(Math.round(finalBaseWidth));
        if(writesGraphAuthority){
          container.dataset.graphWidthPx = String(Math.round(finalBaseWidth));
          container.dataset.svgWidth = String(Math.round(finalBaseWidth));
        }
      }
      if(Number.isFinite(finalHeight)){
        container.style.height = px(finalHeight);
        container.dataset.resizerHeight = container.style.height;
        container.dataset.resizerBaseHeight = String(Math.round(finalBaseHeight));
        if(writesGraphAuthority){
          container.dataset.graphHeightPx = String(Math.round(finalBaseHeight));
          container.dataset.svgHeight = String(Math.round(finalBaseHeight));
        }
      }
      if(writesGraphAuthority && effectiveAspectLocked && Number.isFinite(finalBaseWidth) && Number.isFinite(finalBaseHeight) && finalBaseHeight > 0){
        // resizerAspectRatio remains the historical frame-ratio mirror. Migrated
        // Cartesian charts keep their rendered-axis target separately.
        setAspectRatio(finalBaseWidth / finalBaseHeight);
      }
      const normalizedAxis = (axis === 'x' || axis === 'y') ? axis : 'both';
      container.dataset.resizerLastAxis = normalizedAxis;
      if(usesCartesianLayout){
        delete data.resizerAxisViewportLockAxis;
        delete data.resizerAxisViewportLockUntil;
      }else{
        markOrthogonalViewportLock(normalizedAxis, reason || 'resize-apply', { capture: false });
        if(shouldApplyLiveViewportLock(normalizedAxis)
          && Shared.graphViewport && typeof Shared.graphViewport.applyLiveResizeLock === 'function'){
          try{
            Shared.graphViewport.applyLiveResizeLock(container, {
              axis: normalizedAxis,
              reason: reason || 'resize-apply'
            });
          }catch(err){
            console.error('resizer graph viewport live lock error', err);
          }
        }
      }
      // Aspect-lock flows can temporarily impose tight max-size constraints.
      // When unlocked, always restore the configured bounds so axis-length edits
      // are not blocked by stale maxHeight/maxWidth values.
      if(!effectiveAspectLocked){
        container.style.maxWidth = Number.isFinite(MAX_W) ? px(MAX_W * zoomScale) : 'none';
        container.style.maxHeight = Number.isFinite(MAX_H) ? px(MAX_H * zoomScale) : 'none';
      }
      syncZoomPresentation();
      const changed = (Number.isFinite(finalWidth) && container.style.width !== previousWidth)
        || (Number.isFinite(finalHeight) && container.style.height !== previousHeight);
      debugLog('Debug: resizer applyResize helper', {
        container: containerLabel,
        reason,
        axis,
        zoomScale,
        aspectLocked: effectiveAspectLocked,
        aspectLockedBase: aspectLocked,
        finalBaseWidth,
        finalBaseHeight,
        finalWidth,
        finalHeight,
        changed,
        graphAuthority: writesGraphAuthority
      }); // Debug: apply resize helper
      return {
        width: finalWidth,
        height: finalHeight,
        baseWidth: finalBaseWidth,
        baseHeight: finalBaseHeight,
        changed
      };
    }

    if(Number.isFinite(aspectRatio) && aspectRatio > 0){
      setAspectRatio(aspectRatio);
    }else{
      data.resizerAspectRatio = '';
    }

    function syncAspectCheckboxState(){
      if(aspectCheckbox){
        aspectCheckbox.checked = !!aspectLocked;
      }
    }

    function syncUnlockedStyleScaleBase(reason){
      if(aspectLocked){
        delete data.resizerUnlockedStyleScaleBase;
        return;
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const rect = container.getBoundingClientRect();
      const baseWidth = parsePositive(rect.width) ? (rect.width / zoomScale) : parsePositive(data.resizerBaseWidth) || defaultWidth;
      const baseHeight = parsePositive(rect.height) ? (rect.height / zoomScale) : parsePositive(data.resizerBaseHeight) || defaultHeight;
      const scaleX = baseWidth / (defaultWidth || 1);
      const scaleY = baseHeight / (defaultHeight || 1);
      const rawStyleScaleBase = Math.sqrt(Math.max(scaleX * scaleY, 0));
      const lockedStyleScaleBase = parsePositive(data.resizerLockedStyleScaleBase);
      const renderedStyleScale = parsePositive(data.resizerRenderedStyleScale);
      const styleScaleBase = Number.isFinite(renderedStyleScale)
        ? renderedStyleScale
        : (Number.isFinite(lockedStyleScaleBase) && lockedStyleScaleBase > 0
          ? rawStyleScaleBase / lockedStyleScaleBase
          : 1);
      if(Number.isFinite(styleScaleBase) && styleScaleBase > 0){
        data.resizerUnlockedStyleScaleBase = String(styleScaleBase);
        debugLog('Debug: resizer unlocked style scale base synced', {
          container: containerLabel,
          reason: reason || 'sync',
          styleScaleBase,
          rawStyleScaleBase,
          lockedStyleScaleBase: Number.isFinite(lockedStyleScaleBase) ? lockedStyleScaleBase : null,
          baseWidth,
          baseHeight
        });
      }
    }

    function syncLockedStyleScaleBase(reason){
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const rect = container.getBoundingClientRect();
      const baseWidth = parsePositive(rect.width) ? (rect.width / zoomScale) : parsePositive(data.resizerBaseWidth) || defaultWidth;
      const baseHeight = parsePositive(rect.height) ? (rect.height / zoomScale) : parsePositive(data.resizerBaseHeight) || defaultHeight;
      const scaleX = baseWidth / (defaultWidth || 1);
      const scaleY = baseHeight / (defaultHeight || 1);
      const outerRawStyleScale = Math.sqrt(Math.max(scaleX * scaleY, 0));
      const renderedRawStyleScale = parsePositive(data.resizerRenderedRawStyleScale);
      const renderedStyleScale = parsePositive(data.resizerRenderedStyleScale);
      const rawStyleScaleBase = Number.isFinite(renderedRawStyleScale)
        ? renderedRawStyleScale
        : outerRawStyleScale;
      const currentStyleScale = Number.isFinite(renderedStyleScale)
        ? renderedStyleScale
        : (parsePositive(data.resizerUnlockedStyleScaleBase) || rawStyleScaleBase);
      const lockedStyleScaleBase = Number.isFinite(rawStyleScaleBase) && rawStyleScaleBase > 0 && Number.isFinite(currentStyleScale) && currentStyleScale > 0
        ? rawStyleScaleBase / currentStyleScale
        : NaN;
      if(Number.isFinite(lockedStyleScaleBase) && lockedStyleScaleBase > 0){
        data.resizerLockedStyleScaleBase = String(lockedStyleScaleBase);
        debugLog('Debug: resizer locked style scale base synced', {
          container: containerLabel,
          reason: reason || 'sync',
          lockedStyleScaleBase,
          rawStyleScaleBase,
          currentStyleScale,
          outerRawStyleScale,
          baseWidth,
          baseHeight
        });
      }
    }

    function markOrthogonalViewportLock(axis, reason, options = {}){
      const normalizedAxis = axis === 'x' || axis === 'y' ? axis : 'both';
      const isOneAxisUnlockedResize = !aspectLocked && (normalizedAxis === 'x' || normalizedAxis === 'y');
      if(!isOneAxisUnlockedResize){
        delete data.resizerAxisViewportLockAxis;
        delete data.resizerAxisViewportLockUntil;
        return;
      }
      const durationMs = Number.isFinite(options.durationMs) && options.durationMs > 0
        ? options.durationMs
        : 6000;
      data.resizerAxisViewportLockAxis = normalizedAxis;
      data.resizerAxisViewportLockUntil = String(Date.now() + durationMs);
      if(options.capture !== false && Shared.graphViewport && typeof Shared.graphViewport.captureStableAxes === 'function'){
        try{
          Shared.graphViewport.captureStableAxes(container, {
            axis: normalizedAxis,
            reason: reason || 'resizer-axis-lock'
          });
        }catch(err){
          console.error('resizer graph viewport stable capture error', err);
        }
      }
      debugLog('Debug: resizer orthogonal viewport lock marked', {
        container: containerLabel,
        axis: normalizedAxis,
        reason: reason || null,
        until: data.resizerAxisViewportLockUntil
      });
    }

    function applyProgrammaticResize(options = {}){
      const requestedWidth = parsePositive(options.width);
      const requestedHeight = parsePositive(options.height);
      const requestedDefaultWidth = parsePositive(options.defaultWidth);
      const requestedDefaultHeight = parsePositive(options.defaultHeight);
      const requestedAxis = typeof options.axis === 'string' && options.axis ? options.axis : 'both';
      const requestedSimulateAspectLock = typeof options.simulateAspectLock === 'boolean'
        ? options.simulateAspectLock
        : null;
      // Immutable aspect policy is authoritative over programmatic resize hints.
      // Axis-length controls may request a temporary lock state, but they must
      // never bypass a component configured with forceAspectLocked.
      const simulateAspectLock = forcedAspectLocked !== null && requestedSimulateAspectLock !== null
        ? forcedAspectLocked
        : requestedSimulateAspectLock;
      const hasSimulatedAspectLock = typeof simulateAspectLock === 'boolean';
      const updateDefaults = options.updateDefaults === true;
      const updateAspectRatio = options.updateAspectRatio !== false;
      const preserveAspectLock = options.preserveAspectLock !== false;
      const forceExact = options.forceExact !== false;
      const reason = options.reason || 'programmatic';
      const requestedResizePhase = String(options.resizePhase || '').trim().toLowerCase();
      const notifyPhase = requestedResizePhase === 'move' ? 'move' : 'programmatic';
      const authorityMode = options.authorityMode === 'transient' ? 'transient' : 'authoritative';
      const preserveManualResizeState = authorityMode === 'transient';
      const originalAspectLocked = aspectLocked;
      const hadAspectLock = aspectLocked;
      if(hasSimulatedAspectLock){
        aspectLocked = !!simulateAspectLock;
        data.resizerAspectLocked = aspectLocked ? 'true' : 'false';
        if(aspectLocked){
          delete data.resizerUnlockedStyleScaleBase;
        }else{
          syncUnlockedStyleScaleBase('programmatic-simulated-unlock');
        }
        syncAspectCheckboxState();
        debugLog('Debug: resizer programmatic simulated aspect lock', {
          container: containerLabel,
          reason,
          requestedSimulateAspectLock,
          simulateAspectLock,
          forcedAspectLocked,
          previousAspectLocked: originalAspectLocked
        });
      }
      const nextRatio = (Number.isFinite(requestedWidth) && requestedWidth > 0 && Number.isFinite(requestedHeight) && requestedHeight > 0)
        ? (requestedWidth / requestedHeight)
        : NaN;
      if(updateAspectRatio && Number.isFinite(nextRatio) && nextRatio > 0){
        setAspectRatio(nextRatio);
      }
      if(!hasSimulatedAspectLock && forceExact && hadAspectLock && requestedAxis === 'both' && Number.isFinite(requestedWidth) && Number.isFinite(requestedHeight)){
        aspectLocked = false;
        data.resizerAspectLocked = 'false';
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      // forceExact must override the intrinsic min-size floor so the caller's exact
      // dimensions are applied. The next content draw re-applies the appropriate
      // content-based constraint via updateIntrinsicMinSize.
      if(forceExact && !hasSimulatedAspectLock){
        if(Number.isFinite(requestedWidth) && requestedWidth > 0 && requestedWidth < MIN_W){
          MIN_W = Math.max(BASE_MIN_W, Math.round(requestedWidth));
          data.resizerMinWidth = String(MIN_W);
          container.style.minWidth = px(MIN_W * zoomScale);
        }
        if(Number.isFinite(requestedHeight) && requestedHeight > 0 && requestedHeight < MIN_H){
          MIN_H = Math.max(BASE_MIN_H, Math.round(requestedHeight));
          data.resizerMinHeight = String(MIN_H);
          container.style.minHeight = px(MIN_H * zoomScale);
        }
      }
      const liveRect = container.getBoundingClientRect();
      const fallbackWidth = parsePositive(liveRect.width) || (defaultWidth * zoomScale);
      const fallbackHeight = parsePositive(liveRect.height) || (defaultHeight * zoomScale);
      container.style.flex = '0 0 auto';
      if(!preserveManualResizeState){
        container.dataset.resizerResized = 'true';
      }
      const applied = applyResize({
        axis: requestedAxis,
        width: Number.isFinite(requestedWidth) ? (requestedWidth * zoomScale) : fallbackWidth,
        height: Number.isFinite(requestedHeight) ? (requestedHeight * zoomScale) : fallbackHeight,
        fallbackWidth,
        fallbackHeight,
        reason,
        aspectLockedOverride: hasSimulatedAspectLock ? simulateAspectLock : null
      });
      if(updateDefaults){
        const nextDefaultWidth = Number.isFinite(requestedDefaultWidth) ? requestedDefaultWidth : requestedWidth;
        const nextDefaultHeight = Number.isFinite(requestedDefaultHeight) ? requestedDefaultHeight : requestedHeight;
        if(Number.isFinite(nextDefaultWidth) && nextDefaultWidth > 0){
          defaultWidth = Math.round(nextDefaultWidth);
          data.resizerDefaultWidth = String(defaultWidth);
        }
        if(Number.isFinite(nextDefaultHeight) && nextDefaultHeight > 0){
          defaultHeight = Math.round(nextDefaultHeight);
          data.resizerDefaultHeight = String(defaultHeight);
        }
      }
      if(!hasSimulatedAspectLock && forceExact && preserveAspectLock && hadAspectLock){
        aspectLocked = true;
        data.resizerAspectLocked = 'true';
        delete data.resizerUnlockedStyleScaleBase;
      }
      syncAspectCheckboxState();
      debugLog('Debug: resizer applyProgrammaticResize', {
        container: containerLabel,
        reason,
        authorityMode,
        notifyPhase,
        requestedAxis,
        requestedWidth,
        requestedHeight,
        requestedDefaultWidth,
        requestedDefaultHeight,
        requestedSimulateAspectLock,
        simulateAspectLock,
        hasSimulatedAspectLock,
        forcedAspectLocked,
        originalAspectLocked,
        applied,
        updateDefaults,
        preserveAspectLock,
        finalAspectLocked: aspectLocked
      });
      if(options.suppressOnResize !== true){
        if(notifyPhase === 'move'){
          // Programmatic continuous interactions (for example axis-length wheel
          // gestures) must participate in the same live layout phase as a drag
          // handle without acquiring pointer/manual-resize state.
          suppressObserverResize(180);
        }
        notifyResize(notifyPhase, `resizer onResize ${notifyPhase} error`);
      }else{
        // Passive layout restore already owns this geometry. Its observer
        // notification must not turn the projection into a component redraw.
        const rect = container.getBoundingClientRect?.();
        if(Number.isFinite(rect?.width) && Number.isFinite(rect?.height)){
          lastResizeNotificationSize = { width: rect.width, height: rect.height };
        }
      }
      return applied;
    }

    const doc = global.document;
    function resolveZoomScale(candidate){
      const numeric = Number(candidate);
      if(Number.isFinite(numeric) && numeric > 0){
        return numeric;
      }
      return Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
    }

    function toBaseDimension(displayValue, scaleOverride){
      const numeric = Number(displayValue);
      if(!Number.isFinite(numeric)){
        return NaN;
      }
      return numeric / resolveZoomScale(scaleOverride);
    }

    function toDisplayDimension(baseValue, scaleOverride){
      const numeric = Number(baseValue);
      if(!Number.isFinite(numeric)){
        return NaN;
      }
      return numeric * resolveZoomScale(scaleOverride);
    }

    function applyZoomBoundsStyles(){
      const scale = resolveZoomScale();
      container.style.minWidth = px(MIN_W * scale);
      container.style.minHeight = px(MIN_H * scale);
      container.style.maxWidth = Number.isFinite(MAX_W) ? px(MAX_W * scale) : 'none';
      container.style.maxHeight = Number.isFinite(MAX_H) ? px(MAX_H * scale) : 'none';
    }

    function ensureZoomElements(){
      const zoomSetup = ensureZoomViewport(container, doc);
      if(!zoomSetup){
        return null;
      }
      zoomTarget = zoomSetup.target;
      if(zoomSetup.created){
        logZoom('viewport-created', {
          target: zoomTarget?.id || zoomTarget?.tagName || null
        });
      }
      return zoomSetup;
    }

    function syncZoomControls(){
      const bounds = zoomBounds;
      const view = graphView();
      if(fitButton){
        fitButton.setAttribute('aria-pressed', view?.mode === 'fit' ? 'true' : 'false');
      }
      if(actualButton){
        const isActualSize = view?.mode === 'manual'
          && Math.abs((parsePositive(view.zoomLevel) || 1) - 1) <= RESIZER_ZOOM_EPSILON;
        actualButton.setAttribute('aria-pressed', isActualSize ? 'true' : 'false');
      }
      if(zoomValue){
        zoomValue.min = String(Math.ceil(bounds.min * 100));
        const displayPercent = String(Math.round(zoomLevel * 100));
        if(zoomValue.tagName === 'INPUT'){
          if(doc.activeElement !== zoomValue){
            zoomValue.value = displayPercent;
          }
        }else{
          zoomValue.textContent = formatZoomLevel(zoomLevel);
        }
      }
      if(zoomControl){
        zoomControl.setAttribute('aria-label', `Graph zoom ${formatZoomLevel(zoomLevel)}`);
      }
    }

    function applyDisplayOnlyZoomResize(baseWidth, baseHeight, options = {}){
      const reason = options.reason || 'zoom';
      const changed = options.changed === true;
      const forceLayout = options.forceLayout === true;
      const shouldApplySize = changed || forceLayout || Math.abs(zoomLevel - 1) > RESIZER_ZOOM_EPSILON;
      if(!shouldApplySize){
        return null;
      }
      // Give ResizeObserver enough time to settle after the display-only size update.
      const observerSuppressMs = Number.isFinite(options.suppressObserverMs) ? options.suppressObserverMs : 450;
      suppressObserverResize(observerSuppressMs);
      container.style.flex = '0 0 auto';
      const nextDisplayWidth = toDisplayDimension(baseWidth);
      const nextDisplayHeight = toDisplayDimension(baseHeight);
      displayOnlyZoomResizeRegistry.set(container, {
        width: nextDisplayWidth,
        height: nextDisplayHeight
      });
      return applyResize({
        axis: 'both',
        width: nextDisplayWidth,
        height: nextDisplayHeight,
        fallbackWidth: nextDisplayWidth,
        fallbackHeight: nextDisplayHeight,
        reason: `zoom-${reason}`,
        graphAuthority: false
      });
    }

    function applyZoomLevel(nextLevel, options = {}){
      const reason = options.reason || 'zoom';
      const view = graphView();
      const manualChange = options.mode === 'manual'
        || reason === 'input' || reason === 'wheel-live';
      const ownerTab = resolveResizerTab(container, opts);
      if(manualChange && ownerTab?.id && global.Main?.session?.workspaceState?.activeTabId !== ownerTab.id) return zoomLevel;
      const previousMode = view?.mode;
      const previousZoom = resolveZoomScale();
      const currentRect = container.getBoundingClientRect();
      const baseWidth = parsePositive(data.graphWidthPx || data.svgWidth || data.graphDefaultWidth)
        || parsePositive(data.resizerBaseWidth)
        || toBaseDimension(parsePositive(currentRect.width), previousZoom)
        || defaultWidth;
      const baseHeight = parsePositive(data.graphHeightPx || data.svgHeight || data.graphDefaultHeight)
        || parsePositive(data.resizerBaseHeight)
        || toBaseDimension(parsePositive(currentRect.height), previousZoom)
        || defaultHeight;
      const zoomEnvelopeBase = captureZoomEnvelopeBase(previousZoom);
      const normalized = normalizeZoomLevel(nextLevel, zoomBounds);
      if(manualChange && view){
        view.mode = 'manual';
        view.zoomLevel = normalized;
      }
      const changed = Math.abs(normalized - zoomLevel) > RESIZER_ZOOM_EPSILON;
      zoomLevel = normalized;
      data.resizerZoom = String(zoomLevel);
      data.resizerZoomLevel = String(zoomLevel);
      const applied = applyDisplayOnlyZoomResize(baseWidth, baseHeight, {
        reason,
        changed,
        forceLayout: options.forceLayout === true,
        suppressObserverMs: options.suppressObserverMs
      });
      syncZoomPresentation();
      // Only a zoom change scales the published envelope. Manual resizing
      // leaves it owned by the renderer until the next frame is committed.
      syncZoomContentEnvelope(zoomLevel, zoomEnvelopeBase);
      applyZoomBoundsStyles();
      syncZoomControls();
      if(changed || options.forceLayout === true){
        // Zoom only changes the display envelope; component draw callbacks are
        // suppressed by componentLayout for the zoom phase.
        notifyResize('zoom', 'resizer onResize zoom error');
      }
      if(changed || options.logUnchanged){
        logZoom(changed ? 'applied' : 'unchanged', {
          reason,
          previousZoom,
          nextZoom: zoomLevel,
          appliedWidth: applied?.width || null,
          appliedHeight: applied?.height || null
        });
      }
      const markUserModified = options.markUserModified === true
        || (manualChange && previousMode === 'fit')
        || (changed && reason === 'input');
      if(markUserModified){
        markResizerTabUserModified(container, opts, 'resizer-zoom-change');
      }
      return zoomLevel;
    }

    function refreshFit(){
      const tab = resolveResizerTab(container, opts);
      const activeId = global.Main?.session?.workspaceState?.activeTabId;
      if(destroyed || !tab?.id || activeId !== tab.id || graphView()?.mode !== 'fit'
        || manualResizeActive || !container.isConnected || !fitPanel) return;
      const panelRect = fitPanel.getBoundingClientRect();
      if(!(panelRect.width > 0) || fitPanel.hidden || fitPanel.inert) return;
      const baseWidth = parsePositive(data.graphWidthPx || data.resizerBaseWidth) || defaultWidth;
      const baseHeight = parsePositive(data.graphHeightPx || data.resizerBaseHeight) || defaultHeight;
      const envelope = captureZoomEnvelopeBase(zoomLevel);
      const nextScale = getFitZoomLevel();
      const envelopeMatches = ['left', 'top', 'right', 'bottom'].every(side => {
        const current = Number.parseFloat(container.style.getPropertyValue(`--graph-content-extra-${side}`)) || 0;
        return Math.abs(current - (envelope?.[side]?.value || 0) * nextScale) <= 0.5;
      });
      const rect = container.getBoundingClientRect();
      if(Math.abs(nextScale - zoomLevel) <= RESIZER_ZOOM_EPSILON && envelopeMatches
        && Math.abs(rect.width - Math.round(baseWidth * nextScale)) <= 0.5
        && Math.abs(rect.height - Math.round(baseHeight * nextScale)) <= 0.5) return;
      applyZoomLevel(nextScale, { reason: 'auto-fit' });
    }

    function requestFit(){
      if(destroyed || fitFrame !== null || graphView()?.mode !== 'fit') return;
      const ownerTabId = resolveResizerTab(container, opts)?.id;
      if(!ownerTabId) return;
      fitFrame = global.requestAnimationFrame(() => {
        fitFrame = null;
        if(resolveResizerTab(container, opts)?.id === ownerTabId) refreshFit();
      });
    }

    function setViewMode(mode){
      const tab = resolveResizerTab(container, opts);
      if(!tab?.id || global.Main?.session?.workspaceState?.activeTabId !== tab.id) return;
      const view = graphView();
      if(!view) return;
      view.mode = mode === 'fit' ? 'fit' : 'manual';
      if(view.mode === 'fit'){
        delete view.zoomLevel;
        refreshFit();
      }else{
        view.zoomLevel = 1;
        applyZoomLevel(1, { mode: 'manual', reason: 'actual-size' });
      }
      syncZoomControls();
      markResizerTabUserModified(container, opts, 'resizer-zoom-change');
    }

    function commitZoomFromInput(rawValue, options = {}){
      const numeric = Number.parseFloat(String(rawValue ?? '').replace('%', '').trim());
      if(!Number.isFinite(numeric) || numeric <= 0){
        syncZoomControls();
        return zoomLevel;
      }
      return applyZoomLevel(numeric / 100, {
        reason: options.reason || 'input',
        markUserModified: options.markUserModified === true
      });
    }

    function updateIntrinsicMinSize(bounds = {}, options = {}){
      const nextMinWidth = parsePositive(bounds.minWidth ?? bounds.minWidthPx);
      const nextMinHeight = parsePositive(bounds.minHeight ?? bounds.minHeightPx);
      const reason = options.reason || 'intrinsic-min-size';
      let changed = false;
      if(Number.isFinite(nextMinWidth) && nextMinWidth > 0 && Math.round(nextMinWidth) !== Math.round(MIN_W)){
        MIN_W = Math.max(BASE_MIN_W, Math.round(nextMinWidth));
        data.resizerMinWidth = String(MIN_W);
        changed = true;
      }
      if(Number.isFinite(nextMinHeight) && nextMinHeight > 0 && Math.round(nextMinHeight) !== Math.round(MIN_H)){
        MIN_H = Math.max(BASE_MIN_H, Math.round(nextMinHeight));
        data.resizerMinHeight = String(MIN_H);
        changed = true;
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      if(options.enforce !== false){
        container.style.minWidth = px(MIN_W * zoomScale);
        container.style.minHeight = px(MIN_H * zoomScale);
      }
      const liveRect = container.getBoundingClientRect?.() || null;
      const currentBaseWidth = parsePositive(liveRect?.width) ? parsePositive(liveRect.width) / zoomScale : defaultWidth;
      const currentBaseHeight = parsePositive(liveRect?.height) ? parsePositive(liveRect.height) / zoomScale : defaultHeight;
      if(options.enforce === false){
        // advisory: don't raise style.minWidth above current rendered size (respects explicit programmatic shrinks)
        const cappedMinW = currentBaseWidth > 0 ? Math.min(MIN_W, Math.max(BASE_MIN_W, Math.round(currentBaseWidth))) : MIN_W;
        const cappedMinH = currentBaseHeight > 0 ? Math.min(MIN_H, Math.max(BASE_MIN_H, Math.round(currentBaseHeight))) : MIN_H;
        container.style.minWidth = px(cappedMinW * zoomScale);
        container.style.minHeight = px(cappedMinH * zoomScale);
      }
      let resized = null;
      if(options.enforce !== false && (currentBaseWidth + 0.5 < MIN_W || currentBaseHeight + 0.5 < MIN_H)){
        const targetHeight = Math.max(currentBaseHeight || MIN_H, MIN_H);
        const targetWidth = aspectLocked
          ? Math.max(currentBaseWidth || MIN_W, targetHeight * (Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1), MIN_W)
          : Math.max(currentBaseWidth || MIN_W, MIN_W);
        resized = applyProgrammaticResize({
          axis: 'both',
          width: targetWidth,
          height: targetHeight,
          forceExact: true,
          preserveAspectLock: true,
          updateAspectRatio: false,
          updateDefaults: false,
          reason
        });
      }
      debugLog('Debug: resizer intrinsic min size updated', {
        container: containerLabel,
        reason,
        minWidth: MIN_W,
        minHeight: MIN_H,
        changed,
        enforced: !!resized
      });
      return { changed, minWidth: MIN_W, minHeight: MIN_H, enforced: !!resized, resize: resized };
    }

    let aspectCheckbox = null;
    const setAspectLockedState = (nextLocked, options = {}) => {
      const workspaceActiveTabId = normalizeTabId(global.Main?.session?.workspaceState?.activeTabId);
      if(options.reason !== 'checkbox-change'
        && activeResizerTabId
        && workspaceActiveTabId
        && activeResizerTabId !== workspaceActiveTabId){
        return false;
      }
      const requested = !!nextLocked;
      const next = forcedAspectLocked !== null ? forcedAspectLocked : requested;
      const changed = aspectLocked !== next;
      const ownerTab = resolveResizerTab(container, opts);
      const projectionMatches = data.resizerAspectLocked === (next ? 'true' : 'false')
        && (!aspectCheckbox || aspectCheckbox.checked === next);
      const sessionMatches = ownerTab?.sharedState?.layout?.resizer?.aspectLocked === next;
      const layoutMatches = ownerTab?.layoutState?.svgBox?.dataset?.resizerAspectLocked === (next ? 'true' : 'false');
      if(!changed && projectionMatches && sessionMatches && layoutMatches && options.resetAxisRatio !== true){
        return false;
      }
      const beforeAspect = options.recordUndo === true ? makeResizeSnapshot('aspect-toggle-before') : null;
      aspectLocked = next;
      data.resizerAspectLocked = next ? 'true' : 'false';
      if(aspectCheckbox){
        aspectCheckbox.checked = next;
      }
      persistAspectLockToTab(container, opts, next, options.reason || 'sync-change');
      if(next){
        if(isCartesianLayoutTransactionEnabled()){
          delete data.resizerAxisViewportLockAxis;
          delete data.resizerAxisViewportLockUntil;
          delete data.resizerLockedGeometryRatio;
          delete data.resizerLockedConstraintRatio;
          delete data.resizerLockedGeometryInsetX;
          delete data.resizerLockedGeometryInsetY;
          clearPersistedCartesianFrame();
          const planRatio = readCartesianPlotRatio(committedCartesianPlan);
          if((changed || options.resetAxisRatio === true) && Number.isFinite(planRatio) && planRatio > 0){
            setCartesianPlotRatio(planRatio);
          }else if(!Number.isFinite(planRatio)){
            refreshCartesianRatioOnCommit = true;
          }
          persistLockedGeometryToTab(container, opts, null);
          syncLockedStyleScaleBase(options.reason || 'aspect-lock');
        }else if(options.preserveGeometry === true){
          syncLockedStyleScaleBase(options.reason || 'aspect-lock-restore');
        }else if(changed || options.resetAxisRatio === true){
          delete data.resizerAxisViewportLockAxis;
          delete data.resizerAxisViewportLockUntil;
          readRectRatio();
          captureLockedGeometry({ resetRatio: true });
          syncLockedStyleScaleBase(options.reason || 'aspect-lock');
        }else if(!parsePositive(data.resizerLockedGeometryRatio)){
          captureLockedGeometry({ resetRatio: true });
        }
      }else if(changed || data.resizerLockedGeometryRatio || data.resizerLockedConstraintRatio || data.resizerCartesianPlotRatio || persistedCartesianKeys.some(key => data[key] != null)){
        activeCartesianResizeTransaction = null;
        delete data.resizerLockedGeometryRatio;
        delete data.resizerLockedConstraintRatio;
        delete data.resizerLockedGeometryInsetX;
        delete data.resizerLockedGeometryInsetY;
        delete data.resizerCartesianPlotRatio;
        clearPersistedCartesianFrame();
        refreshCartesianRatioOnCommit = false;
        persistLockedGeometryToTab(container, opts, null);
        syncUnlockedStyleScaleBase(options.reason || 'aspect-unlock');
        delete data.resizerLockedStyleScaleBase;
        if(Shared.graphViewport && typeof Shared.graphViewport.captureStableAxes === 'function'){
          try{
            Shared.graphViewport.captureStableAxes(container, {
              axis: 'both',
              reason: options.reason || 'aspect-unlock'
            });
          }catch(err){
            console.error('resizer aspect-toggle viewport capture error', err);
          }
        }
      }
      if(options.recordUndo === true){
        const afterAspect = makeResizeSnapshot('aspect-toggle-after');
        notifyUndoableResize('aspect-toggle', beforeAspect, afterAspect, 'checkbox');
      }
      debugLog('Debug: resizer aspect state applied', {
        container: containerLabel,
        aspectLocked,
        changed,
        requestedAspectLocked: requested,
        forcedAspectLocked,
        reason: options.reason || null
      });
      return changed;
    };

    function restoreSizingState(snapshot = {}, options = {}){
      const nextDefaultWidth = parsePositive(snapshot.defaultWidth);
      const nextDefaultHeight = parsePositive(snapshot.defaultHeight);
      const nextMinWidth = parsePositive(snapshot.minWidth);
      const nextMinHeight = parsePositive(snapshot.minHeight);
      const nextAspectRatio = parsePositive(snapshot.aspectRatio);
      const unlimitedWidth = snapshot.allowUnlimitedWidth === true || snapshot.maxWidth === Number.POSITIVE_INFINITY;
      const unlimitedHeight = snapshot.allowUnlimitedHeight === true || snapshot.maxHeight === Number.POSITIVE_INFINITY;
      const nextMaxWidth = unlimitedWidth ? Number.POSITIVE_INFINITY : parsePositive(snapshot.maxWidth);
      const nextMaxHeight = unlimitedHeight ? Number.POSITIVE_INFINITY : parsePositive(snapshot.maxHeight);
      if(Number.isFinite(nextDefaultWidth)){
        defaultWidth = Math.round(nextDefaultWidth);
      }
      if(Number.isFinite(nextDefaultHeight)){
        defaultHeight = Math.round(nextDefaultHeight);
      }
      if(Number.isFinite(nextMinWidth)){
        BASE_MIN_W = Math.round(nextMinWidth);
        MIN_W = BASE_MIN_W;
      }
      if(Number.isFinite(nextMinHeight)){
        BASE_MIN_H = Math.round(nextMinHeight);
        MIN_H = BASE_MIN_H;
      }
      if(unlimitedWidth || Number.isFinite(nextMaxWidth)){
        MAX_W = unlimitedWidth ? Number.POSITIVE_INFINITY : Math.max(defaultWidth, Math.round(nextMaxWidth));
      }
      if(unlimitedHeight || Number.isFinite(nextMaxHeight)){
        MAX_H = unlimitedHeight ? Number.POSITIVE_INFINITY : Math.max(defaultHeight, Math.round(nextMaxHeight));
      }
      if(Number.isFinite(nextAspectRatio)){
        setAspectRatio(nextAspectRatio);
      }
      data.resizerDefaultWidth = String(defaultWidth);
      data.resizerDefaultHeight = String(defaultHeight);
      data.resizerMinWidth = String(MIN_W);
      data.resizerMinHeight = String(MIN_H);
      data.resizerMaxWidth = Number.isFinite(MAX_W) ? String(MAX_W) : 'Infinity';
      data.resizerMaxHeight = Number.isFinite(MAX_H) ? String(MAX_H) : 'Infinity';
      data.resizerUnlimitedWidth = unlimitedWidth ? 'true' : 'false';
      data.resizerUnlimitedHeight = unlimitedHeight ? 'true' : 'false';
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      container.style.minWidth = px(MIN_W * zoomScale);
      container.style.minHeight = px(MIN_H * zoomScale);
      container.style.maxWidth = Number.isFinite(MAX_W) ? px(MAX_W * zoomScale) : 'none';
      container.style.maxHeight = Number.isFinite(MAX_H) ? px(MAX_H * zoomScale) : 'none';
      debugLog('Debug: resizer sizing state restored', {
        container: containerLabel,
        reason: options.reason || null,
        defaultWidth,
        defaultHeight,
        minWidth: MIN_W,
        minHeight: MIN_H,
        maxWidth: MAX_W,
        maxHeight: MAX_H,
        aspectRatio
      });
      return {
        defaultWidth,
        defaultHeight,
        minWidth: MIN_W,
        minHeight: MIN_H,
        maxWidth: MAX_W,
        maxHeight: MAX_H,
        aspectRatio,
        aspectLocked
      };
    }

    container.__sharedResizableBoxApi = {
      applySize: applyProgrammaticResize,
      beginUserResize,
      updateUserResize,
      finishUserResize,
      restoreSizingState,
      setAspectLocked: setAspectLockedState,
      setIntrinsicMinSize: updateIntrinsicMinSize,
      setZoomLevel: (level, options = {}) => applyZoomLevel(level, { mode: 'manual', ...options }),
      getZoomLevel: () => zoomLevel,
      getFitZoomLevel,
      refreshFit: requestFit,
      setViewMode,
      getViewState: () => graphView(),
      getState: () => ({
        defaultWidth,
        defaultHeight,
        minWidth: MIN_W,
        minHeight: MIN_H,
        maxWidth: MAX_W,
        maxHeight: MAX_H,
        aspectRatio,
        aspectLocked,
        forcedAspectLocked,
        allowUnlimitedWidth,
        allowUnlimitedHeight,
        zoomLevel
      }),
      calibrateLockedGeometryConstraint,
      canCommitCartesianLayout,
      commitCartesianLayout,
      clearCartesianLayout,
      getCartesianLayoutPlan: () => committedCartesianPlan || readPersistedCartesianTransaction()?.plan || null,
      getCartesianLayoutTransaction: (options = {}) => {
        const transaction = activeCartesianResizeTransaction || readPersistedCartesianTransaction();
        if(!transaction) return null;
        const requestedPhase = String(options.phase || options.resizePhase || '').trim().toLowerCase();
        if(transaction.awaitingCommit === true && requestedPhase !== 'end') return null;
        if(requestedPhase && String(transaction.phase || '').toLowerCase() !== requestedPhase) return null;
        return {
          plan: transaction.plan,
          plotRatio: transaction.plotRatio,
          frameChromeWidth: transaction.frameChromeWidth,
          frameChromeHeight: transaction.frameChromeHeight,
          phase: transaction.phase || null,
          awaitingCommit: transaction.awaitingCommit === true
        };
      },
      isCartesianLayoutTransactionEnabled,
      destroy(options = {}){
        destroyed = true;
        resizeBoundaryObserver?.disconnect();
        graphFrame?.removeAttribute('data-graph-resize-active');
        if(fitFrame !== null) global.cancelAnimationFrame(fitFrame);
        fitObserver?.disconnect();
        fitMutationObserver?.disconnect();
        global.removeEventListener('resize', requestFit);
        if(userResizeTransaction){
          finishUserResize('destroy');
        }
        clearGraphSizeControlBindings();
        if(graphOptionsControl?.__resizerSyncGraphSizeControls === syncGraphSizeControls){
          delete graphOptionsControl.__resizerSyncGraphSizeControls;
        }
        displayOnlyZoomResizeRegistry.delete(container);
        if(resizeObserver){
          try{
            resizeObserver.disconnect();
          }catch(err){
            console.error('Shared.attachResizableBox observer destroy error', err);
          }
          resizeObserver = null;
        }
        committedCartesianPlan = null;
        activeCartesianResizeTransaction = null;
        refreshCartesianRatioOnCommit = false;
        if(container.__sharedResizableBoxApi === this){
          delete container.__sharedResizableBoxApi;
        }
        debugLog('Debug: resizer api destroyed', {
          container: containerLabel,
          reason: options?.reason || null
        });
      }
    };
    Shared.applyResizableBoxSize = function applyResizableBoxSize(target, options = {}){
      const api = target && target.__sharedResizableBoxApi;
      if(!api || typeof api.applySize !== 'function'){
        debugLog('Debug: Shared.applyResizableBoxSize skipped', {
          hasTarget: !!target,
          hasApi: !!api
        });
        return null;
      }
      return api.applySize(options);
    };
    Shared.applyResizableBoxZoom = function applyResizableBoxZoom(target, options = {}){
      const api = target && target.__sharedResizableBoxApi;
      const requestedLevel = options.level;
      if(!api || typeof api.setZoomLevel !== 'function'){
        if(isZoomDebugEnabled()){
          debugLog('Debug: Shared.applyResizableBoxZoom skipped', {
            hasTarget: !!target,
            hasApi: !!api
          });
        }
        return null;
      }
      return api.setZoomLevel(requestedLevel, options);
    };

    debugLog('Debug: attachResizableBox defaults', {
      defaultWidth,
      defaultHeight,
      MIN_W,
      MIN_H,
      MAX_W,
      MAX_H,
      resizeMinScale,
      resizeMaxScale,
      aspectLocked,
      aspectRatio
    }); // Debug: resizer defaults

    if(doc){
      let controlTray = resolveGraphControlTray(container, opts);
      if(!controlTray){
        controlTray = doc.createElement('div');
        controlTray.className = 'resizer-control-tray';
        resolveGraphControlsHost(container, opts).appendChild(controlTray);
        debugLog('Debug: resizer control tray created', { container: containerLabel }); // Debug: tray creation trace
      }
      let aspectControl = controlTray.querySelector('.resizer-aspect-control');
      if(!showAspectControl){
        if(aspectControl){
          aspectControl.remove();
        }
        aspectControl = null;
        aspectCheckbox = null;
        debugLog('Debug: resizer aspect control suppressed', { container: containerLabel }); // Debug: control suppression
      }else{
        if(!aspectControl){
          aspectControl = doc.createElement('label');
          aspectControl.className = 'resizer-aspect-control';
          aspectControl.title = 'Lock width/height ratio';
          const checkbox = doc.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'resizer-aspect-checkbox';
          checkbox.setAttribute('aria-label', 'Lock width and height ratio');
          const textSpan = doc.createElement('span');
          textSpan.className = 'resizer-aspect-text';
          textSpan.textContent = 'Lock ratio';
          aspectControl.appendChild(checkbox);
          aspectControl.appendChild(textSpan);
          controlTray.appendChild(aspectControl);
          debugLog('Debug: resizer aspect control created', { container: containerLabel }); // Debug: control creation
          aspectCheckbox = checkbox;
        }else{
          if(aspectControl.parentNode !== controlTray){
            controlTray.appendChild(aspectControl);
          }
          aspectCheckbox = aspectControl.querySelector('input[type="checkbox"]');
        }
        if(aspectCheckbox){
          aspectCheckbox.setAttribute('data-undo-ignore', '1');
          aspectCheckbox.checked = aspectLocked;
          if(aspectCheckbox.__resizerAspectHandler){
            aspectCheckbox.removeEventListener('change', aspectCheckbox.__resizerAspectHandler);
          }
          const onAspectChange = event => {
            const aspectPersistReason = event?.isTrusted ? 'checkbox-change' : 'sync-change';
            setAspectLockedState(!!aspectCheckbox.checked, {
              reason: aspectPersistReason,
              recordUndo: true,
              resetAxisRatio: true
            });
          };
          aspectCheckbox.addEventListener('change', onAspectChange);
          aspectCheckbox.__resizerAspectHandler = onAspectChange;
        }
      }

      let fontResizeControl = controlTray.querySelector('.resizer-fontresize-control');
      let fontResizeCheckbox = fontResizeControl ? fontResizeControl.querySelector('input[type="checkbox"]') : null;
      if(!fontResizeControl){
        fontResizeControl = doc.createElement('label');
        fontResizeControl.className = 'resizer-fontresize-control';
        fontResizeControl.title = 'Resize fonts proportionally with graph resizing';
        const fontCheckbox = doc.createElement('input');
        fontCheckbox.type = 'checkbox';
        fontCheckbox.className = 'resizer-fontresize-checkbox';
        fontCheckbox.setAttribute('aria-label', 'Proportional font resize');
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-fontresize-text';
        textSpan.textContent = 'Proportional font resize';
        fontResizeControl.appendChild(fontCheckbox);
        fontResizeControl.appendChild(textSpan);
        controlTray.appendChild(fontResizeControl);
        fontResizeCheckbox = fontCheckbox;
        debugLog('Debug: resizer proportional font resize control created', { container: containerLabel }); // Debug: proportional font resize control creation
      }else{
        if(fontResizeControl.parentNode !== controlTray){
          controlTray.appendChild(fontResizeControl);
        }
        fontResizeCheckbox = fontResizeControl.querySelector('input[type="checkbox"]');
      }
      if(fontResizeCheckbox){
        if(fontResizeCheckbox.dataset){
          fontResizeCheckbox.dataset.proportionalFontResizeScope = fontResizeScope;
        }
        if(typeof chartStyle.registerProportionalFontResizeControl === 'function'){
          chartStyle.registerProportionalFontResizeControl(fontResizeCheckbox, {
            origin: `${containerLabel}-resizer`,
            scopeId: fontResizeScope,
            svgBox: container
          });
          debugLog('Debug: resizer proportional font resize registered', { container: containerLabel, scope: fontResizeScope }); // Debug: proportional font resize registration
        }else{
          if(typeof chartStyle.isProportionalFontResizeEnabled === 'function'){
            try {
              fontResizeCheckbox.checked = !!chartStyle.isProportionalFontResizeEnabled({ scopeId: fontResizeScope, svgBox: container });
            } catch(stateErr){
              console.error('resizer proportional font resize state sync error', stateErr);
            }
          }
          if(fontResizeCheckbox.__resizerProportionalFontResizeHandler){
            fontResizeCheckbox.removeEventListener('change', fontResizeCheckbox.__resizerProportionalFontResizeHandler);
          }
          const onProportionalFontResizeChange = () => {
            const enabled = !!fontResizeCheckbox.checked;
            container.dataset.resizerProportionalFontResize = enabled ? 'true' : 'false';
            debugLog('Debug: resizer proportional font resize fallback change', { container: containerLabel, enabled, scope: fontResizeScope }); // Debug: fallback handler
            if(typeof chartStyle.setProportionalFontResize === 'function'){
              chartStyle.setProportionalFontResize(enabled, { origin: `${containerLabel}-fallback`, scopeId: fontResizeScope, svgBox: container });
            }
          };
          fontResizeCheckbox.addEventListener('change', onProportionalFontResizeChange);
          fontResizeCheckbox.__resizerProportionalFontResizeHandler = onProportionalFontResizeChange;
          if(typeof chartStyle.onProportionalFontResizeChange === 'function'){
            chartStyle.onProportionalFontResizeChange((enabledValue, eventOrigin) => {
              if(eventOrigin === `${containerLabel}-fallback`) return;
              const scoped = !!enabledValue;
              fontResizeCheckbox.checked = scoped;
              container.dataset.resizerProportionalFontResize = scoped ? 'true' : 'false';
              debugLog('Debug: resizer proportional font resize fallback sync', {
                container: containerLabel,
                origin: eventOrigin,
                scope: fontResizeScope,
                enabled: scoped
              }); // Debug: fallback sync listener
            }, { origin: `${containerLabel}-fallback-listener`, scopeId: fontResizeScope });
          }
        }
      }

      const optionsSetup = ensureGraphOptionsMenu(container, doc, {
        debugLabel: `${containerLabel}-options`,
        title: 'Graph options',
        controlsHost: opts.controlsHost
      });
      controlTray = optionsSetup?.tray || controlTray;
      graphOptionsControl = optionsSetup?.control || null;
      if(optionsSetup?.menu){
        let sizeGroup = optionsSetup.menu.querySelector(':scope > .resizer-size-control-group');
        if(!sizeGroup){
          sizeGroup = doc.createElement('div');
          sizeGroup.className = 'resizer-size-control-group';
          sizeGroup.setAttribute('role', 'group');
          sizeGroup.setAttribute('aria-label', 'Graph size controls');
          optionsSetup.menu.insertBefore(sizeGroup, optionsSetup.menu.firstChild || null);
        }
        const createSizeField = (axis, labelText, accessibleName) => {
          const fieldClass = axis === 'x' ? 'resizer-size-width' : 'resizer-size-height';
          let field = sizeGroup.querySelector(`input.${fieldClass}`);
          if(!field){
            const label = doc.createElement('label');
            label.className = 'resizer-size-field';
            const caption = doc.createElement('span');
            caption.className = 'resizer-size-label';
            caption.textContent = labelText;
            field = doc.createElement('input');
            field.type = 'number';
            field.className = fieldClass;
            field.step = '10';
            field.setAttribute('aria-label', accessibleName);
            const unit = doc.createElement('span');
            unit.className = 'resizer-size-unit';
            unit.textContent = 'px';
            label.append(caption, field, unit);
            sizeGroup.appendChild(label);
          }
          return field;
        };
        graphWidthInput = createSizeField('x', 'Width', 'Graph width in pixels');
        graphHeightInput = createSizeField('y', 'Height', 'Graph height in pixels');
        optionsSetup.menu.insertBefore(sizeGroup, optionsSetup.menu.firstChild || null);
        if(graphOptionsControl){
          graphOptionsControl.__resizerSyncGraphSizeControls = syncGraphSizeControls;
        }
        clearGraphSizeControlBindings();
        const bindSizeField = (input, axis) => {
          const onInput = () => updateUserResize(axis, input.valueAsNumber);
          const onCommit = () => finishUserResize('keyboard-end');
          const onKeyDown = event => {
            if(event.key === 'Enter'){
              finishUserResize('keyboard-enter');
            }
          };
          [['input', onInput], ['change', onCommit], ['blur', onCommit], ['keydown', onKeyDown]]
            .forEach(([type, handler]) => {
              input.addEventListener(type, handler);
              graphSizeControlBindings.push({ input, type, handler });
            });
        };
        bindSizeField(graphWidthInput, 'x');
        bindSizeField(graphHeightInput, 'y');
        syncGraphSizeControls();
      }
      if(aspectControl){
        moveGraphOptionIntoMenu(container, aspectControl, { debugLabel: `${containerLabel}-aspect-option` });
      }
      if(fontResizeControl){
        moveGraphOptionIntoMenu(container, fontResizeControl, { debugLabel: `${containerLabel}-font-resize-option` });
      }
      ensureTitleVisibilityControls(container, doc, opts);

      const zoomSetup = ensureZoomElements();
      if(zoomSetup){
        zoomControl = controlTray?.querySelector('.resizer-zoom-control')
          || container.querySelector('.resizer-zoom-control');
        if(!zoomControl){
          zoomControl = doc.createElement('div');
          zoomControl.className = 'resizer-zoom-control';
          zoomControl.setAttribute('role', 'group');
          zoomControl.setAttribute('aria-label', 'Graph zoom controls');
          if(controlTray){
            controlTray.insertBefore(
              zoomControl,
              optionsSetup?.control ? optionsSetup.control.nextSibling : (controlTray.firstChild || null)
            );
          }else{
            container.appendChild(zoomControl);
          }
          logZoom('control-created');
        }else if(controlTray){
          if(zoomControl.parentNode !== controlTray){
            controlTray.insertBefore(
              zoomControl,
              optionsSetup?.control ? optionsSetup.control.nextSibling : (controlTray.firstChild || null)
            );
          }else if(optionsSetup?.control && zoomControl.previousSibling !== optionsSetup.control){
            controlTray.insertBefore(zoomControl, optionsSetup.control.nextSibling);
          }else if(!optionsSetup?.control && controlTray.firstChild !== zoomControl){
            controlTray.insertBefore(zoomControl, controlTray.firstChild || null);
          }
        }
        let zoomValueNode = zoomControl.querySelector('input.resizer-zoom-value');
        if(!zoomValueNode){
          const legacyNode = zoomControl.querySelector('.resizer-zoom-value');
          if(legacyNode){
            legacyNode.remove();
          }
          zoomValueNode = doc.createElement('input');
          zoomValueNode.type = 'number';
          zoomValueNode.className = 'resizer-zoom-value resizer-zoom-input';
          zoomValueNode.setAttribute('inputmode', 'decimal');
          zoomValueNode.setAttribute('aria-label', 'Zoom level percent');
          zoomValueNode.min = String(Math.round(zoomBounds.min * 100));
          zoomValueNode.max = String(Math.round(zoomBounds.max * 100));
          zoomValueNode.step = '10';
          zoomControl.appendChild(zoomValueNode);
        }
        let zoomUnitNode = zoomControl.querySelector('.resizer-zoom-unit');
        if(!zoomUnitNode){
          zoomUnitNode = doc.createElement('span');
          zoomUnitNode.className = 'resizer-zoom-unit';
          zoomUnitNode.textContent = '%';
          zoomControl.appendChild(zoomUnitNode);
        }
        let zoomValueControl = zoomControl.querySelector('.resizer-zoom-value-control');
        if(!zoomValueControl){
          zoomValueControl = doc.createElement('span');
          zoomValueControl.className = 'resizer-zoom-value-control';
        }
        if(zoomValueNode && zoomUnitNode){
          zoomValueControl.appendChild(zoomValueNode);
          zoomValueControl.appendChild(zoomUnitNode);
          if(zoomValueNode.__resizerZoomCommitHandler){
            zoomValueNode.removeEventListener('change', zoomValueNode.__resizerZoomCommitHandler);
            zoomValueNode.removeEventListener('blur', zoomValueNode.__resizerZoomCommitHandler);
          }
          if(zoomValueNode.__resizerZoomInputHandler){
            zoomValueNode.removeEventListener('input', zoomValueNode.__resizerZoomInputHandler);
          }
          if(zoomValueNode.__resizerZoomKeyHandler){
            zoomValueNode.removeEventListener('keydown', zoomValueNode.__resizerZoomKeyHandler);
          }
          const getNumericWheelPhase = () => {
            const toolbarApi = Shared.getWorkspaceToolbarApi?.() || Shared.workspaceToolbar || null;
            return toolbarApi?.getNumericWheelPhase?.(zoomValueNode) || null;
          };
          const onZoomInput = () => {
            if(getNumericWheelPhase() !== 'live'){
              return;
            }
            const numeric = Number.parseFloat(String(zoomValueNode.value ?? '').replace('%', '').trim());
            if(!Number.isFinite(numeric) || numeric <= 0){
              return;
            }
            applyZoomLevel(numeric / 100, { reason: 'wheel-live' });
          };
          const onZoomCommit = () => {
            const wheelCommit = getNumericWheelPhase() === 'commit';
            commitZoomFromInput(zoomValueNode.value, {
              reason: wheelCommit ? 'wheel-commit' : 'input',
              markUserModified: wheelCommit
            });
          };
          const onZoomKeyDown = (event) => {
            if(event?.key === 'Enter'){
              if(event?.preventDefault){ event.preventDefault(); }
              commitZoomFromInput(zoomValueNode.value);
              zoomValueNode.blur();
            }else if(event?.key === 'Escape'){
              syncZoomControls();
              zoomValueNode.blur();
            }
          };
          zoomValueNode.addEventListener('input', onZoomInput);
          zoomValueNode.addEventListener('change', onZoomCommit);
          zoomValueNode.addEventListener('blur', onZoomCommit);
          zoomValueNode.addEventListener('keydown', onZoomKeyDown);
          zoomValueNode.__resizerZoomInputHandler = onZoomInput;
          zoomValueNode.__resizerZoomCommitHandler = onZoomCommit;
          zoomValueNode.__resizerZoomKeyHandler = onZoomKeyDown;
          zoomValue = zoomValueNode;
          applyZoomLevel(zoomLevel, { reason: 'init', logUnchanged: true });
          fitButton = zoomControl.querySelector('.resizer-zoom-fit');
          if(!fitButton){
            fitButton = doc.createElement('button');
            fitButton.type = 'button';
            fitButton.className = 'resizer-zoom-fit resizer-view-button';
            fitButton.textContent = 'Fit';
            fitButton.setAttribute('aria-label', 'Fit graph to window');
            zoomControl.appendChild(fitButton);
          }
          fitButton.onclick = () => setViewMode('fit');
          actualButton = zoomControl.querySelector('.resizer-zoom-actual');
          if(!actualButton){
            actualButton = doc.createElement('button');
            actualButton.type = 'button';
            actualButton.className = 'resizer-zoom-actual resizer-view-button';
            actualButton.textContent = '100%';
            actualButton.setAttribute('aria-label', 'View graph at actual size');
            zoomControl.appendChild(actualButton);
          }
          actualButton.onclick = () => setViewMode('manual');
          [zoomValueControl, fitButton, actualButton]
            .forEach(control => zoomControl.appendChild(control));
          syncZoomControls();
        }
      }else{
        logZoom('target-missing', { reason: 'init' });
      }
    }

    if(!aspectLocked){
      syncUnlockedStyleScaleBase('init-unlocked');
    }

    const vHandle = container.querySelector('.resizer-vertical');
    const hHandle = container.querySelector('.resizer-horizontal');
    const cHandle = container.querySelector('.resizer-corner');
    graphFrame = container.closest('.graph-frame');
    resizeBoundaryObserver = graphFrame && global.ResizeObserver
      ? new global.ResizeObserver(() => syncGraphResizeBoundary(container))
      : null;
    resizeBoundaryObserver?.observe(graphFrame);
    resizeBoundaryObserver?.observe(container);
    syncGraphResizeBoundary(container);
    debugLog('Debug: attachResizableBox on', containerLabel); // Debug: resizer attach
    applyZoomBoundsStyles();

    const hasUndo = undoManager && typeof undoManager.record === 'function';

    const parseStylePx = (value) => {
      if(typeof value !== 'string') return NaN;
      const num = Number.parseFloat(value);
      return Number.isFinite(num) ? num : NaN;
    };

    const RESIZE_SNAPSHOT_DATA_KEYS = [
      'resizerWidth',
      'resizerHeight',
      'resizerBaseWidth',
      'resizerBaseHeight',
      'resizerAspectLocked',
      'resizerAspectRatio',
      'resizerCartesianPlotRatio',
      'resizerCartesianUserWidth',
      'resizerCartesianUserHeight',
      'resizerCartesianAxisXCount',
      'resizerCartesianAxisXFixed',
      'resizerCartesianAxisXMinimum',
      'resizerCartesianAxisYCount',
      'resizerCartesianAxisYFixed',
      'resizerCartesianAxisYMinimum',
      'resizerCartesianInsetLeft',
      'resizerCartesianInsetTop',
      'resizerCartesianInsetRight',
      'resizerCartesianInsetBottom',
      'resizerLockedGeometryRatio',
      'resizerLockedConstraintRatio',
      'resizerLockedGeometryInsetX',
      'resizerLockedGeometryInsetY',
      'resizerLastAxis',
      'resizerResized',
      'resizerProportionalFontResize',
      'resizerProportionalFontResizeScope',
      'resizerFontResizeBaseWidth',
      'resizerFontResizeBaseHeight',
      'fontBasePt',
      'fontDisplayPt',
      'resizerUnlockedStyleScaleBase',
      'resizerLockedStyleScaleBase',
      'resizerRenderedRawStyleScale',
      'resizerRenderedStyleScale',
      'resizerZoom',
      'resizerZoomLevel',
      'graphWidthPx',
      'graphHeightPx',
      'svgWidth',
      'svgHeight',
      'graphDefaultWidth',
      'graphDefaultHeight',
      'graphViewportStableMinX',
      'graphViewportStableMinY',
      'graphViewportStableWidth',
      'graphViewportStableHeight',
      'graphViewportStableRenderedWidth',
      'graphViewportStableRenderedHeight',
      'graphViewportStableReason'
    ];

    const captureResizeDataset = () => {
      const snapshot = {};
      RESIZE_SNAPSHOT_DATA_KEYS.forEach(key => {
        if(Object.prototype.hasOwnProperty.call(data, key)){
          snapshot[key] = data[key];
        }
      });
      return snapshot;
    };

    const restoreResizeDataset = (snapshot = {}) => {
      RESIZE_SNAPSHOT_DATA_KEYS.forEach(key => {
        if(Object.prototype.hasOwnProperty.call(snapshot, key)){
          data[key] = snapshot[key];
        }else{
          delete data[key];
        }
      });
    };

    const makeResizeSnapshot = (tag) => {
      const liveRect = container.getBoundingClientRect();
      const rectWidth = parsePositive(liveRect.width);
      const rectHeight = parsePositive(liveRect.height);
      const snapshotZoom = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const view = graphView();
      const snapshot = {
        tag,
        width: Number.isFinite(rectWidth) ? Math.round(rectWidth) : parseStylePx(container.style.width),
        height: Number.isFinite(rectHeight) ? Math.round(rectHeight) : parseStylePx(container.style.height),
        baseWidth: parsePositive(data.graphWidthPx || data.svgWidth || data.resizerBaseWidth)
          || (Number.isFinite(rectWidth) ? Math.round(rectWidth / snapshotZoom) : NaN),
        baseHeight: parsePositive(data.graphHeightPx || data.svgHeight || data.resizerBaseHeight)
          || (Number.isFinite(rectHeight) ? Math.round(rectHeight / snapshotZoom) : NaN),
        styleWidth: container.style.width,
        styleHeight: container.style.height,
        minWidthStyle: container.style.minWidth,
        minHeightStyle: container.style.minHeight,
        maxWidthStyle: container.style.maxWidth,
        maxHeightStyle: container.style.maxHeight,
        flexStyle: container.style.flex,
        boxSizingStyle: container.style.boxSizing,
        aspectLocked: !!aspectLocked,
        aspectChecked: !!aspectLocked,
        aspectRatio: Number.isFinite(aspectRatio) ? aspectRatio : Number(data.resizerAspectRatio),
        zoomLevel,
        graphView: view ? { ...view } : null,
        dataset: captureResizeDataset()
      };
      debugLog('Debug: resizer snapshot captured', {
        container: containerLabel,
        tag,
        width: snapshot.width,
        height: snapshot.height,
        aspectLocked: snapshot.aspectLocked
      });
      return snapshot;
    };

    const resizeSnapshotsDiffer = (before, after) => {
      if(!before || !after) return;
      const widthChanged = (() => {
        if(Number.isFinite(before.width) && Number.isFinite(after.width)){
          return Math.round(before.width) !== Math.round(after.width);
        }
        if(before.styleWidth && after.styleWidth){
          return before.styleWidth !== after.styleWidth;
        }
        return false;
      })();
      const heightChanged = (() => {
        if(Number.isFinite(before.height) && Number.isFinite(after.height)){
          return Math.round(before.height) !== Math.round(after.height);
        }
        if(before.styleHeight && after.styleHeight){
          return before.styleHeight !== after.styleHeight;
        }
        return false;
      })();
      const aspectChanged = before.aspectLocked !== after.aspectLocked
        || before.aspectChecked !== after.aspectChecked
        || (Number.isFinite(before.aspectRatio) && Number.isFinite(after.aspectRatio) && Math.abs(before.aspectRatio - after.aspectRatio) > 1e-9);
      const zoomChanged = Number.isFinite(before.zoomLevel)
        && Number.isFinite(after.zoomLevel)
        && Math.abs(before.zoomLevel - after.zoomLevel) > RESIZER_ZOOM_EPSILON;
      const datasetChanged = (() => {
        const beforeDataset = before.dataset || {};
        const afterDataset = after.dataset || {};
        return RESIZE_SNAPSHOT_DATA_KEYS.some(key => (beforeDataset[key] || '') !== (afterDataset[key] || ''));
      })();
      const viewChanged = before.graphView?.mode !== after.graphView?.mode
        || before.graphView?.zoomLevel !== after.graphView?.zoomLevel;
      return widthChanged || heightChanged || aspectChanged || zoomChanged || datasetChanged || viewChanged;
    };

    const notifyUndoableResize = (mode, before, after, trigger) => {
      if(!hasUndo) return;
      if(!resizeSnapshotsDiffer(before, after)) return;
      const resolvedTab = resolveResizerTab(container, opts);
      const resolvedTabId = normalizeTabId(resolvedTab?.id);
      undoManager.record({
        label: `resize:${containerLabel}:${mode}`,
        scope: containerLabel,
        tabId: resolvedTabId,
        target: container,
        element: container,
        undo: () => {
          debugLog('Debug: resizer undo snapshot apply', { container: containerLabel, mode, trigger });
          applySnapshot(before, 'undo');
          notifyResize('undo', 'resizer onResize undo error');
        },
        redo: () => {
          debugLog('Debug: resizer redo snapshot apply', { container: containerLabel, mode, trigger });
          applySnapshot(after, 'redo');
          notifyResize('redo', 'resizer onResize redo error');
        }
      });
    };

    function applySnapshot(snapshot, reason){
      if(!snapshot) return;
      if(snapshot.graphView){
        resizerNamespace.restoreGraphViewState(resolveResizerTab(container, opts), { graphView: snapshot.graphView });
      }
      const snapshotDataset = snapshot.dataset && typeof snapshot.dataset === 'object' ? snapshot.dataset : {};
      const snapshotAspectLocked = typeof snapshot.aspectLocked === 'boolean'
        ? snapshot.aspectLocked
        : snapshotDataset.resizerAspectLocked === 'true';
      aspectLocked = forcedAspectLocked !== null ? forcedAspectLocked : !!snapshotAspectLocked;
      data.resizerAspectLocked = aspectLocked ? 'true' : 'false';
      if(aspectCheckbox){
        aspectCheckbox.checked = aspectLocked;
      }
      const snapshotRatio = Number(snapshot.aspectRatio);
      if(Number.isFinite(snapshotRatio) && snapshotRatio > 0){
        setAspectRatio(snapshotRatio);
      }else if(Number.isFinite(Number(snapshotDataset.resizerAspectRatio)) && Number(snapshotDataset.resizerAspectRatio) > 0){
        setAspectRatio(Number(snapshotDataset.resizerAspectRatio));
      }
      delete data.resizerAxisViewportLockAxis;
      delete data.resizerAxisViewportLockUntil;
      if(Number.isFinite(Number(snapshot.zoomLevel)) && snapshot.zoomLevel > 0){
        zoomLevel = normalizeZoomLevel(snapshot.zoomLevel, zoomBounds);
        data.resizerZoom = String(zoomLevel);
        data.resizerZoomLevel = String(zoomLevel);
      }
      const widthTarget = Number.isFinite(snapshot.baseWidth)
        ? snapshot.baseWidth
        : (Number.isFinite(snapshot.width) ? (snapshot.width / (Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1)) : (parseStylePx(snapshot.styleWidth) / (Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1)));
      const heightTarget = Number.isFinite(snapshot.baseHeight)
        ? snapshot.baseHeight
        : (Number.isFinite(snapshot.height) ? (snapshot.height / (Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1)) : (parseStylePx(snapshot.styleHeight) / (Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1)));
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const applied = applyResize({
        axis: 'both',
        width: Number.isFinite(widthTarget) ? widthTarget * zoomScale : NaN,
        height: Number.isFinite(heightTarget) ? heightTarget * zoomScale : NaN,
        fallbackWidth: Number.isFinite(widthTarget) ? widthTarget * zoomScale : (defaultWidth * zoomScale),
        fallbackHeight: Number.isFinite(heightTarget) ? heightTarget * zoomScale : (defaultHeight * zoomScale),
        reason: reason || 'snapshot',
        aspectLockedOverride: aspectLocked
      });
      if(typeof snapshot.styleWidth === 'string' && snapshot.styleWidth.length){
        container.style.width = snapshot.styleWidth;
      }
      if(typeof snapshot.styleHeight === 'string' && snapshot.styleHeight.length){
        container.style.height = snapshot.styleHeight;
      }
      if(typeof snapshot.flexStyle === 'string' && snapshot.flexStyle.length){
        container.style.flex = snapshot.flexStyle;
      }
      if(typeof snapshot.boxSizingStyle === 'string' && snapshot.boxSizingStyle.length){
        container.style.boxSizing = snapshot.boxSizingStyle;
      }
      if(typeof snapshot.maxWidthStyle === 'string' && snapshot.maxWidthStyle.length){
        container.style.maxWidth = snapshot.maxWidthStyle;
      }else{
        container.style.maxWidth = '';
      }
      if(typeof snapshot.maxHeightStyle === 'string' && snapshot.maxHeightStyle.length){
        container.style.maxHeight = snapshot.maxHeightStyle;
      }else{
        container.style.maxHeight = '';
      }
      if(typeof snapshot.minWidthStyle === 'string' && snapshot.minWidthStyle.length){
        container.style.minWidth = snapshot.minWidthStyle;
      }else{
        container.style.minWidth = '';
      }
      if(typeof snapshot.minHeightStyle === 'string' && snapshot.minHeightStyle.length){
        container.style.minHeight = snapshot.minHeightStyle;
      }else{
        container.style.minHeight = '';
      }
      restoreResizeDataset(snapshotDataset);
      data.resizerAspectLocked = aspectLocked ? 'true' : 'false';
      if(Number.isFinite(aspectRatio) && aspectRatio > 0){
        data.resizerAspectRatio = String(aspectRatio);
      }
      if(Number.isFinite(zoomLevel) && zoomLevel > 0){
        data.resizerZoom = String(zoomLevel);
        data.resizerZoomLevel = String(zoomLevel);
      }
      data.resizerLastAxis = 'both';
      syncZoomPresentation();
      syncZoomControls();
      requestFit();
      debugLog('Debug: resizer applySnapshot complete', {
        container: containerLabel,
        reason,
        widthApplied: applied.width,
        heightApplied: applied.height,
        aspectLocked
      });
    }

    function attachDrag(handle, axis){
      if(!handle) return;
      const dragBindingStore = handle.__resizerDragBindings || (handle.__resizerDragBindings = {});
      const existingBinding = dragBindingStore[axis];
      if(existingBinding){
        if(typeof existingBinding.pointerdown === 'function'){
          handle.removeEventListener('pointerdown', existingBinding.pointerdown);
        }
        if(typeof existingBinding.dblclick === 'function'){
          handle.removeEventListener('dblclick', existingBinding.dblclick);
        }
      }
      let startX=0, startY=0, startW=0, startH=0, pointerId=null;
      let startSnapshot = null;
      const onPointerDown = (e) => {
        e.preventDefault();
        graphFrame?.setAttribute('data-graph-resize-active', '');
        pointerId = e.pointerId;
        try { handle.setPointerCapture(pointerId); } catch(_) {}
        const rect = container.getBoundingClientRect();
        const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
        const startBaseWidth = Math.min(MAX_W, Math.max(MIN_W, rect.width / zoomScale));
        const startBaseHeight = Math.min(MAX_H, Math.max(MIN_H, rect.height / zoomScale));
        startW = startBaseWidth * zoomScale;
        startH = startBaseHeight * zoomScale;
        startX = e.clientX;
        startY = e.clientY;
        startSnapshot = makeResizeSnapshot('pointer-start');
        let pointerResizeStarted = false;
        const beginPointerResize = () => {
          if(pointerResizeStarted){
            return;
          }
          pointerResizeStarted = true;
          beginManualResizeTransaction(axis, rect, startW, startH, 'pointer-start');
          document.documentElement.style.userSelect = 'none';
          document.documentElement.style.touchAction = 'none';
        };
        const onPointerMove = (ev) => {
          ev.preventDefault();
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const activeDelta = axis === 'x' ? dx : (axis === 'y' ? dy : Math.max(Math.abs(dx), Math.abs(dy)));
          if(activeDelta === 0){
            return;
          }
          beginPointerResize();
          const tentativeWidth = startW + dx;
          const tentativeHeight = startH + dy;
          suppressObserverResize(180);
          const applied = applyResize({
            axis,
            width: axis === 'y' ? startW : tentativeWidth,
            height: axis === 'x' ? startH : tentativeHeight,
            fallbackWidth: startW,
            fallbackHeight: startH,
            reason: 'pointer-move'
          });
          debugLog('Debug: resizer drag move', {
            axis,
            dx,
            dy,
            aspectLocked,
            width: container.style.width,
            height: container.style.height,
            limits: { MIN_W, MAX_W, MIN_H, MAX_H }
          }); // Debug: resizer drag move
          if(!applied.changed){
            return;
          }
          notifyResize('move');
        };
        let pointerFinished = false;
        let unregisterPointerGesture = () => {};
        const finishPointerResize = (finishReason = 'pointer-end') => {
          if(pointerFinished){
            return;
          }
          pointerFinished = true;
          graphFrame?.removeAttribute('data-graph-resize-active');
          try { handle.releasePointerCapture(pointerId); } catch(_) {}
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          document.removeEventListener('pointercancel', onPointerCancel);
          unregisterPointerGesture();
          unregisterPointerGesture = () => {};
          if(!pointerResizeStarted){
            activeCartesianResizeTransaction = null;
            startSnapshot = null;
            return;
          }
          document.documentElement.style.userSelect = '';
          document.documentElement.style.touchAction = '';
          if(startSnapshot){
            finishManualResizeTransaction(
              axis,
              startSnapshot,
              finishReason,
              `drag-${axis}`,
              'pointer',
              `resizer-drag-${axis}`
            );
            startSnapshot = null;
          }
        };
        const onPointerUp = () => {
          finishPointerResize('pointer-end');
        };
        const onPointerCancel = () => {
          finishPointerResize('pointer-cancel');
        };
        unregisterPointerGesture = Shared.registerSvgPointerGestureForTab?.(
          resolveResizerTab(container, opts),
          () => finishPointerResize('owner-deactivation')
        ) || (() => {});
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerCancel);
      };
      handle.addEventListener('pointerdown', onPointerDown);
      const onDoubleClick = (ev) => {
        ev.preventDefault();
        const beforeReset = makeResizeSnapshot('dblclick-before');
        container.style.flex = '0 0 auto';
        container.dataset.resizerResized = 'true';
        const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
        const usesCartesianLayout = isCartesianLayoutTransactionEnabled();
        const automaticFrameReserves = !usesCartesianLayout && typeof opts.resolveAutomaticFrameReserves === 'function'
          ? opts.resolveAutomaticFrameReserves({
              container,
              tabId: normalizeTabId(opts.tabId),
              componentName: opts.componentName || null,
              defaultWidth,
              defaultHeight,
              zoomScale,
              reason: 'dblclick-reset'
            })
          : null;
        const resetFrameSize = typeof opts.resolveResetFrameSize === 'function'
          ? opts.resolveResetFrameSize({
              container,
              tabId: normalizeTabId(opts.tabId),
              componentName: opts.componentName || null,
              defaultWidth,
              defaultHeight,
              zoomScale,
              reason: 'dblclick-reset'
            })
          : null;
        const resolvedDefaultWidth = parsePositive(resetFrameSize?.widthPx) || defaultWidth;
        const resolvedDefaultHeight = parsePositive(resetFrameSize?.heightPx) || defaultHeight;
        const reserveWidth = Number(automaticFrameReserves?.widthPx);
        const reserveHeight = Number(automaticFrameReserves?.heightPx);
        const resetBaseWidth = resolvedDefaultWidth + (usesCartesianLayout ? 0 : (Number.isFinite(reserveWidth) ? Math.max(0, reserveWidth) : 0));
        const resetBaseHeight = resolvedDefaultHeight + (usesCartesianLayout ? 0 : (Number.isFinite(reserveHeight) ? Math.max(0, reserveHeight) : 0));
        const resetWidth = resetBaseWidth * zoomScale;
        const resetHeight = resetBaseHeight * zoomScale;
        if(usesCartesianLayout && aspectLocked){
          refreshCartesianRatioOnCommit = true;
        }
        const applied = applyResize({
          axis: 'both',
          width: resetWidth,
          height: resetHeight,
          fallbackWidth: resetWidth,
          fallbackHeight: resetHeight,
          reason: 'dblclick-reset',
          aspectLockedOverride: usesCartesianLayout ? false : null
        });
        applyZoomBoundsStyles();
        if(aspectLocked && !usesCartesianLayout){
          readRectRatio();
        }
        const afterReset = makeResizeSnapshot('dblclick-after');
        notifyUndoableResize('reset', beforeReset, afterReset, 'dblclick');
        if(applied?.changed){
          markResizerTabUserModified(container, opts, 'resizer-reset');
        }
        debugLog('Debug: resizer size reset', {
          width: container.style.width,
          height: container.style.height,
          automaticFrameReserves: {
            widthPx: resetBaseWidth - resolvedDefaultWidth,
            heightPx: resetBaseHeight - resolvedDefaultHeight
          },
          resetFrameSize: {
            widthPx: resolvedDefaultWidth,
            heightPx: resolvedDefaultHeight
          },
          applied
        }); // Debug: resizer reset
        notifyResize('reset');
      };
      handle.addEventListener('dblclick', onDoubleClick);
      dragBindingStore[axis] = {
        pointerdown: onPointerDown,
        dblclick: onDoubleClick
      };
    }

    attachDrag(vHandle, 'x');
    attachDrag(hHandle, 'y');
    attachDrag(cHandle, 'both');
    if (global.ResizeObserver) {
      const initialObservedRect = container.getBoundingClientRect?.();
      if(Number.isFinite(initialObservedRect?.width) && Number.isFinite(initialObservedRect?.height)){
        lastResizeNotificationSize = {
          width: initialObservedRect.width,
          height: initialObservedRect.height
        };
      }
      resizeObserver = new ResizeObserver(() => {
        if(shouldSuppressObserverResize()){
          return;
        }
        const rect = container.getBoundingClientRect?.();
        if(resizerNamespace.isDisplayOnlyZoomResize?.(container, rect)){
          return;
        }
        if(
          lastResizeNotificationSize
          && Number.isFinite(rect?.width)
          && Number.isFinite(rect?.height)
          && Math.abs(rect.width - lastResizeNotificationSize.width) <= 0.25
          && Math.abs(rect.height - lastResizeNotificationSize.height) <= 0.25
        ){
          return;
        }
        debugLog('Debug: resizer observer triggered'); // Debug: resize observer
        notifyResize('observe');
      });
      resizeObserver.observe(container);
    }
    if(fitPanel){
      if(global.ResizeObserver){
        fitObserver = new global.ResizeObserver(requestFit);
        fitObserver.observe(fitPanel);
        if(zoomControl) fitObserver.observe(zoomControl);
      }
      if(global.MutationObserver){
        fitMutationObserver = new global.MutationObserver(requestFit);
        fitMutationObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['width', 'height', 'viewBox', 'style'] });
      }
      global.addEventListener('resize', requestFit);
      requestFit();
    }
  };

  Shared.syncPanelWidths = function syncPanelWidths(tablePanel, graphPanel, configPanel, scheduleDraw, opts={}){
    const debugLabel = opts.debugLabel || 'panel';
    const preserveGraphContent = opts.preserveGraphContent === true;
    const preserveSvgBoxPresentation = opts.preserveSvgBoxPresentation === true;
    const disableAutoWidthClamp = opts.disableAutoWidthClamp === true;
    const forceDefaultWidth = opts.forceDefaultWidth === true;
    if(!tablePanel || !graphPanel || !configPanel){
      debugLog('Debug: Shared.syncPanelWidths skipped', {
        label: debugLabel,
        hasTable: !!tablePanel,
        hasGraph: !!graphPanel,
        hasConfig: !!configPanel
      });
      return null;
    }
    const requestedWorkspaceRaw = opts.workspaceSplit?.tableFraction
      ?? opts.workspaceTableFraction;
    const requestedWorkspaceFraction = requestedWorkspaceRaw == null ? NaN : Number(requestedWorkspaceRaw);
    const hasWorkspaceSplit = Number.isFinite(requestedWorkspaceFraction)
      && requestedWorkspaceFraction >= 0
      && requestedWorkspaceFraction <= 1;
    const hasManualPanelSizing = tablePanel.dataset?.panelManualWidth === 'true'
      || graphPanel.dataset?.panelManualWidth === 'true';
    const docBody = global.document && global.document.body;
    const STYLE_EPSILON = 0.5;
    let layoutMutated = false;
    const isFiniteNumber = value => Number.isFinite(value);
    const nearlyEqual = (a, b, epsilon = STYLE_EPSILON) => isFiniteNumber(a) && isFiniteNumber(b) && Math.abs(a - b) <= epsilon;
    const parseInlinePx = value => {
      if(value == null || value === '') return NaN;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : NaN;
    };
    const setStyleValueIfChanged = (style, prop, value) => {
      if(!style) return false;
      const next = value == null ? '' : String(value);
      const current = style[prop] == null ? '' : String(style[prop]);
      if(current === next) return false;
      style[prop] = next;
      layoutMutated = true;
      return true;
    };
    const setStylePxIfChanged = (style, prop, value, epsilon = STYLE_EPSILON) => {
      if(!style || !Number.isFinite(value)) return false;
      const rounded = Math.round(value);
      const currentInline = parseInlinePx(style[prop]);
      if(nearlyEqual(currentInline, rounded, epsilon) && style[prop]){
        return false;
      }
      style[prop] = rounded + 'px';
      layoutMutated = true;
      return true;
    };
    const panelWrap = graphPanel.parentElement || tablePanel.parentElement || null;
    let stackedPanelLayout = false;
    if(panelWrap && global.getComputedStyle){
      try{
        stackedPanelLayout = String(global.getComputedStyle(panelWrap)?.flexDirection || '').toLowerCase() === 'column';
      }catch(err){
        console.error('Shared.syncPanelWidths panel direction error', err);
      }
    }
    if(stackedPanelLayout){
      const panelLayoutStyles = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'flex', 'flexBasis'];
      [tablePanel, graphPanel].forEach(panel => {
        panelLayoutStyles.forEach(prop => setStyleValueIfChanged(panel.style, prop, ''));
      });
      if(panelWrap.dataset?.panelMinWidthLocked === 'true'){
        setStyleValueIfChanged(panelWrap.style, 'minWidth', '');
        delete panelWrap.dataset.panelMinWidthLocked;
      }
    }
    const lockGraphPanelWidth = opts.lockGraphPanelWidth !== false
      && !(hasWorkspaceSplit && !stackedPanelLayout)
      && !hasManualPanelSizing;
    const applyWorkspaceSplit = () => {
      // Persisted split state outranks stale pixel-sizing markers from the
      // divider drag that originally produced that split.
      if(!hasWorkspaceSplit){
        return false;
      }
      const fraction = requestedWorkspaceFraction;
      const graphFraction = 1 - fraction;
      const wrap = graphPanel?.parentElement || tablePanel?.parentElement || null;
      let vertical = false;
      if(wrap && global.getComputedStyle){
        try{
          vertical = String(global.getComputedStyle(wrap)?.flexDirection || '').toLowerCase() === 'column';
        }catch(_err){
          vertical = false;
        }
      }
      const panelStyleProps = [
        'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
        'flex', 'flexBasis'
      ];
      [tablePanel, graphPanel].forEach(panel => {
        if(panel?.style){
          panelStyleProps.forEach(prop => setStyleValueIfChanged(panel.style, prop, ''));
        }
        if(panel?.dataset){
          delete panel.dataset.panelManualWidth;
          delete panel.dataset.panelDefaultWidth;
          delete panel.dataset.panelMinWidth;
        }
      });
      if(svgBox?.dataset){
        delete svgBox.dataset.resizerTableWidth;
      }
      if(wrap?.dataset?.panelMinWidthLocked === 'true'){
        setStyleValueIfChanged(wrap.style, 'minWidth', '');
        delete wrap.dataset.panelMinWidthLocked;
      }
      if(vertical){
        return false;
      }
      if(tablePanel?.style){
        setStyleValueIfChanged(tablePanel.style, 'flex', `${fraction} 1 0px`);
        setStyleValueIfChanged(tablePanel.style, 'flexBasis', '0px');
        setStyleValueIfChanged(tablePanel.style, 'minWidth', '0px');
        setStyleValueIfChanged(tablePanel.style, 'maxWidth', 'none');
      }
      if(graphPanel?.style){
        setStyleValueIfChanged(graphPanel.style, 'flex', `${graphFraction} 1 0px`);
        setStyleValueIfChanged(graphPanel.style, 'flexBasis', '0px');
        setStyleValueIfChanged(graphPanel.style, 'minWidth', '0px');
        setStyleValueIfChanged(graphPanel.style, 'maxWidth', 'none');
      }
      Shared.componentLayout?.projectWorkspacePanelSplit?.(tablePanel, graphPanel, fraction);
      const resizer = opts.panelResizer || Array.from(wrap?.children || []).find(child => child?.classList?.contains('panel-resizer'));
      if(resizer?.style){ resizer.style.marginRight = ''; }
      return true;
    };
    if(!lockGraphPanelWidth && !hasManualPanelSizing && !hasWorkspaceSplit && graphPanel?.style){
      const needsReset = graphPanel.style.width || graphPanel.style.minWidth || graphPanel.style.flexBasis || graphPanel.style.flex;
      if(needsReset){
        setStyleValueIfChanged(graphPanel.style, 'width', '');
        setStyleValueIfChanged(graphPanel.style, 'minWidth', '');
        setStyleValueIfChanged(graphPanel.style, 'flexBasis', '');
        setStyleValueIfChanged(graphPanel.style, 'flex', '');
      }
    }
    if(!lockGraphPanelWidth && !hasManualPanelSizing){
      const wrapEl = graphPanel?.parentElement || null;
      if(wrapEl?.style && wrapEl?.dataset?.panelMinWidthLocked === 'true'){
        if(wrapEl.style.minWidth){
          setStyleValueIfChanged(wrapEl.style, 'minWidth', '');
        }
        delete wrapEl.dataset.panelMinWidthLocked;
      }
    }
    const svgBox = opts.svgBox || graphPanel.querySelector(opts.svgSelector || '.svgbox');
    const usesCartesianLayoutTransaction = svgBox?.__sharedResizableBoxApi
      ?.isCartesianLayoutTransactionEnabled?.() === true;
    const diagramSelector = opts.diagramSelector || '.diagram-area';
    const diagramArea = graphPanel.querySelector(diagramSelector);
    const isElementHidden = (el) => {
      if (!el) return true;
      if (typeof el.offsetParent === 'undefined') {
        try {
          const style = global.getComputedStyle ? global.getComputedStyle(el) : null;
          return style ? style.display === 'none' : false;
        } catch (err) {
          console.error('Shared.syncPanelWidths hidden detection error', err);
          return false;
        }
      }
      return el.offsetParent === null && el !== docBody;
    };
    const tableHidden = isElementHidden(tablePanel);
    const graphHidden = isElementHidden(graphPanel);
    if (tableHidden || graphHidden) {
      debugLog('Debug: Shared.syncPanelWidths skipped (hidden)', {
        label: debugLabel,
        tableHidden,
        graphHidden
      }); // Debug: skip adjustments for hidden panels
      return null;
    }
    applyWorkspaceSplit();
    let gap = 0;
    if(diagramArea){
      try{
        const style = (global.getComputedStyle ? global.getComputedStyle(diagramArea) : null) || {};
        gap = parseFloat(style.gap || 0) || 0;
      }catch(err){
        console.error('Shared.syncPanelWidths gap error', err);
      }
    }
    const svgDataset = svgBox && svgBox.dataset ? svgBox.dataset : null;
    const isUnlimitedToken = value => typeof value === 'string' && /^(infinity|none)$/i.test(value.trim());
    const unlimitedWidth = !!(svgDataset && (svgDataset.resizerUnlimitedWidth === 'true' || isUnlimitedToken(svgDataset.resizerMaxWidth)));
    const unlimitedHeight = !!(svgDataset && (svgDataset.resizerUnlimitedHeight === 'true' || isUnlimitedToken(svgDataset.resizerMaxHeight)));
    const storedTableWidth = svgDataset ? Number(svgDataset.resizerTableWidth) : NaN;
    const isManualResize = svgDataset ? svgDataset.resizerResized === 'true' : false;
    const zoomScale = svgDataset ? (parsePositive(svgDataset.resizerZoomLevel || svgDataset.resizerZoom) || 1) : 1;
    const toDisplayDimension = (value) => (Number.isFinite(value) ? value * zoomScale : NaN);
    const datasetMinWidthRaw = svgDataset ? parsePositive(svgDataset.resizerMinWidth) : NaN;
    const datasetMaxWidthRaw = (svgDataset && !unlimitedWidth) ? parsePositive(svgDataset.resizerMaxWidth) : NaN;
    const datasetMinHeightRaw = svgDataset ? parsePositive(svgDataset.resizerMinHeight) : NaN;
    const datasetMaxHeightRaw = (svgDataset && !unlimitedHeight) ? parsePositive(svgDataset.resizerMaxHeight) : NaN;
    const datasetDefaultWidthRaw = svgDataset ? parsePositive(svgDataset.resizerDefaultWidth) : NaN;
    const datasetDefaultHeightRaw = svgDataset ? parsePositive(svgDataset.resizerDefaultHeight) : NaN;
    const datasetMinWidth = toDisplayDimension(datasetMinWidthRaw);
    const datasetMaxWidth = toDisplayDimension(datasetMaxWidthRaw);
    const datasetMinHeight = toDisplayDimension(datasetMinHeightRaw);
    const datasetMaxHeight = toDisplayDimension(datasetMaxHeightRaw);
    const datasetDefaultWidth = toDisplayDimension(datasetDefaultWidthRaw);
    const datasetDefaultHeight = toDisplayDimension(datasetDefaultHeightRaw);
    const storedAutoWidth = (!isManualResize && svgDataset)
      ? parsePositive(svgDataset.resizerWidth)
      : NaN;
    const aspectLocked = svgDataset ? svgDataset.resizerAspectLocked === 'true' : false;
    const storedAspectRatio = svgDataset ? parsePositive(svgDataset.resizerAspectRatio) : NaN;
    const svgRect = svgBox ? svgBox.getBoundingClientRect() : null;
    const svgCurrentWidth = svgRect ? svgRect.width : NaN;
    const svgCurrentHeight = svgRect ? svgRect.height : NaN;
    let cssDefaultWidth = NaN;
    if(!Number.isFinite(datasetDefaultWidth) && svgBox && global.getComputedStyle){
      try {
        const computed = global.getComputedStyle(svgBox);
        cssDefaultWidth = parsePositive(computed.getPropertyValue('--graph-default-width'));
        if(Number.isFinite(cssDefaultWidth)){
          cssDefaultWidth = cssDefaultWidth * zoomScale;
        }
      } catch(defaultErr){
        console.error('Shared.syncPanelWidths default width css error', defaultErr);
      }
    }
    const autoDefaultWidth = Number.isFinite(datasetDefaultWidth) && datasetDefaultWidth > 0
      ? datasetDefaultWidth
      : cssDefaultWidth;
    const preferredAutoWidth = Number.isFinite(autoDefaultWidth) && autoDefaultWidth > 0
      ? autoDefaultWidth
      : (Number.isFinite(storedAutoWidth) && storedAutoWidth > 0 ? storedAutoWidth : NaN);
    const shouldForceDefaultWidth = forceDefaultWidth && !isManualResize && Number.isFinite(preferredAutoWidth) && preferredAutoWidth > 0;
    const tableWidth = tablePanel.getBoundingClientRect().width;
    const tableDataset = tablePanel.dataset || {};
    let defaultTableWidth = parsePositive(tableDataset.panelDefaultWidth);
    if(!Number.isFinite(defaultTableWidth) || defaultTableWidth <= 0){
      const measuredDefault = Number.isFinite(tableWidth) && tableWidth > 0 ? Math.round(tableWidth) : NaN;
      if(Number.isFinite(measuredDefault)){
        defaultTableWidth = measuredDefault;
        tableDataset.panelDefaultWidth = String(defaultTableWidth);
        debugLog('Debug: Shared.syncPanelWidths default width captured', {
          label: debugLabel,
          defaultTableWidth
        }); // Debug: capture table default width during sync
      }
    }
    const minTableHint = parsePositive(opts.minTableWidth);
    const sanitizedMinTableHint = Number.isFinite(minTableHint) && minTableHint >= 0 ? minTableHint : NaN;
    let computedTableMin = NaN;
    if((!Number.isFinite(sanitizedMinTableHint) || sanitizedMinTableHint < 0) && tablePanel && typeof global.getComputedStyle === 'function'){
      try{
        computedTableMin = parsePositive(global.getComputedStyle(tablePanel).minWidth);
      }catch(err){
        console.error('Shared.syncPanelWidths table min compute error', err);
      }
    }
    const baseMinTable = Number.isFinite(sanitizedMinTableHint) && sanitizedMinTableHint >= 0
      ? sanitizedMinTableHint
      : (Number.isFinite(computedTableMin) && computedTableMin >= 0 ? computedTableMin : 0);
    let storedMinTableWidth = parsePositive(tableDataset.panelMinWidth);
    if(!Number.isFinite(storedMinTableWidth)){
      storedMinTableWidth = baseMinTable;
      tableDataset.panelMinWidth = String(storedMinTableWidth);
      debugLog('Debug: Shared.syncPanelWidths table min stored', {
        label: debugLabel,
        storedMinTableWidth,
        minTableHint: sanitizedMinTableHint
      }); // Debug: persist computed min width baseline
    }else if(Number.isFinite(baseMinTable) && storedMinTableWidth < baseMinTable){
      storedMinTableWidth = baseMinTable;
      tableDataset.panelMinWidth = String(storedMinTableWidth);
      debugLog('Debug: Shared.syncPanelWidths table min normalized', {
        label: debugLabel,
        storedMinTableWidth,
        minTableHint: sanitizedMinTableHint
      }); // Debug: normalize stored min width to hint
    }
    const effectiveMinTable = Number.isFinite(storedMinTableWidth) ? storedMinTableWidth : baseMinTable;
    const minPx = Math.max(0, Math.round(effectiveMinTable));
    if(setStylePxIfChanged(tablePanel.style, 'minWidth', minPx)){
      debugLog('Debug: Shared.syncPanelWidths table min enforced', {
        label: debugLabel,
        minPx
      }); // Debug: enforce locked min width style
    }
    if(minPx > 0 && Number.isFinite(tableWidth) && tableWidth > 0 && tableWidth < minPx - 0.5){
      setStyleValueIfChanged(tablePanel.style, 'flex', '0 0 ' + minPx + 'px');
      setStylePxIfChanged(tablePanel.style, 'flexBasis', minPx);
      setStylePxIfChanged(tablePanel.style, 'width', minPx);
      debugLog('Debug: Shared.syncPanelWidths table width corrected', {
        label: debugLabel,
        minPx,
        tableWidth
      }); // Debug: bump table width back to min when compressed
    }
    const graphRect = graphPanel.getBoundingClientRect();
    const graphWidth = graphRect.width;
    const configWidth = configPanel.getBoundingClientRect().width;
    let graphInset = 0;
    let graphContentWidth = Number.isFinite(graphWidth) ? graphWidth : NaN;
    const readNumeric = (val) => {
      const num = Number.parseFloat(val);
      return Number.isFinite(num) ? num : 0;
    };
    if(Number.isFinite(graphWidth) && global.getComputedStyle){
      try{
        const graphStyle = global.getComputedStyle(graphPanel);
        const pad = readNumeric(graphStyle.paddingLeft) + readNumeric(graphStyle.paddingRight);
        const border = readNumeric(graphStyle.borderLeftWidth) + readNumeric(graphStyle.borderRightWidth);
        graphInset = pad + border;
        graphContentWidth = Math.max(0, graphWidth - graphInset);
        debugLog('Debug: Shared.syncPanelWidths graph inset', {
          label: debugLabel,
          graphWidth,
          graphContentWidth,
          graphInset,
          pad,
          border
        }); // Debug: layout inset calculation
      }catch(insetErr){
        console.error('Shared.syncPanelWidths inset error', insetErr);
      }
    }
    const resizerEl = opts.panelResizer || (graphPanel.parentElement ? Array.from(graphPanel.parentElement.children).find(el => el.classList && el.classList.contains('panel-resizer')) : null);
    const resizerWidth = resizerEl ? resizerEl.getBoundingClientRect().width : 0;
    let resizerMargin = 0;
    if(resizerEl && global.getComputedStyle){
      try{
        const resizerStyle = global.getComputedStyle(resizerEl);
        resizerMargin = readNumeric(resizerStyle.marginLeft) + readNumeric(resizerStyle.marginRight);
      }catch(resizerErr){
        console.error('Shared.syncPanelWidths resizer margin error', resizerErr);
      }
    }
    const resizerSpace = (Number.isFinite(resizerWidth) ? resizerWidth : 0) + (Number.isFinite(resizerMargin) ? resizerMargin : 0);
    const baseContentWidth = Number.isFinite(graphContentWidth) ? graphContentWidth : NaN;
    const baseAvailableWidth = Number.isFinite(baseContentWidth) ? baseContentWidth - gap : NaN;
    let availableRaw = Number.isFinite(baseContentWidth) ? baseContentWidth - configWidth - gap : NaN;
    const preserveAutoWidth = preserveGraphContent && !hasManualPanelSizing && !isManualResize;
    if(preserveAutoWidth && Number.isFinite(baseAvailableWidth)){
      availableRaw = baseAvailableWidth;
    }
    const manualWidth = isManualResize && Number.isFinite(svgCurrentWidth) ? svgCurrentWidth : NaN;
    if(isManualResize && Number.isFinite(manualWidth)){
      if(!Number.isFinite(availableRaw) || manualWidth > availableRaw){
        availableRaw = manualWidth;
      }
    }
    let maxAvailable = Number.isFinite(availableRaw) ? Math.max(0, availableRaw) : NaN;
    if(isManualResize && Number.isFinite(manualWidth)){
      maxAvailable = Math.max(manualWidth, maxAvailable || 0);
    }
    if((!Number.isFinite(availableRaw) || maxAvailable <= 0) && !(isManualResize && Number.isFinite(manualWidth) && manualWidth > 0) && !shouldForceDefaultWidth){
      debugLog('Debug: Shared.syncPanelWidths skipped (no width available)', {
        label: debugLabel,
        available: availableRaw,
        maxAvailable,
        manualWidth
      }); // Debug: guard against zero-width calculations
      return null;
    }
    if(isManualResize && Number.isFinite(manualWidth) && manualWidth > 0){
      availableRaw = Math.max(manualWidth, availableRaw || 0);
      maxAvailable = Math.max(manualWidth, maxAvailable || 0);
    }
    let minSvgWidth = Number.isFinite(opts.minSvgWidth) ? Math.max(0, opts.minSvgWidth) : 0;
    if(Number.isFinite(datasetMinWidth) && datasetMinWidth > 0){
      minSvgWidth = Math.max(minSvgWidth, datasetMinWidth);
    }
    let baseWidth;
    if(isManualResize && Number.isFinite(svgCurrentWidth) && svgCurrentWidth > 0){
      baseWidth = svgCurrentWidth;
    }else{
      const fallbackWidth = Number.isFinite(tableWidth) && tableWidth > 0 ? tableWidth : svgCurrentWidth;
      if(shouldForceDefaultWidth){
        baseWidth = preferredAutoWidth;
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          debugLog('Debug: Shared.syncPanelWidths force default width', {
            label: debugLabel,
            preferredAutoWidth,
            baseWidth
          });
        }
      }else if(Number.isFinite(maxAvailable) && maxAvailable > 0){
        baseWidth = maxAvailable;
        if(!disableAutoWidthClamp && !isManualResize && Number.isFinite(preferredAutoWidth) && preferredAutoWidth > 0){
          baseWidth = Math.min(baseWidth, preferredAutoWidth);
          debugLog('Debug: Shared.syncPanelWidths auto default clamp', {
            label: debugLabel,
            preferredAutoWidth,
            maxAvailable,
            clampedWidth: baseWidth
          });
        }
        debugLog('Debug: Shared.syncPanelWidths baseWidth auto-fill', {
          label: debugLabel,
          baseWidth,
          maxAvailable,
          availableRaw,
          fallbackWidth
        }); // Debug: initial auto width uses full graph space
      }else if(Number.isFinite(availableRaw)){
        if(Number.isFinite(fallbackWidth) && fallbackWidth > 0){
          baseWidth = Math.min(fallbackWidth, availableRaw);
        }else{
          baseWidth = availableRaw;
        }
        if(!disableAutoWidthClamp && !isManualResize && Number.isFinite(preferredAutoWidth) && preferredAutoWidth > 0){
          baseWidth = Math.min(baseWidth, preferredAutoWidth);
          debugLog('Debug: Shared.syncPanelWidths auto fallback clamp', {
            label: debugLabel,
            preferredAutoWidth,
            availableRaw,
            fallbackWidth,
            clampedWidth: baseWidth
          });
        }
      }else{
        baseWidth = fallbackWidth;
      }
    }
    if(!Number.isFinite(baseWidth) || baseWidth <= 0){
      if(Number.isFinite(svgCurrentWidth) && svgCurrentWidth > 0){
        baseWidth = svgCurrentWidth;
      }else if(!isManualResize && Number.isFinite(preferredAutoWidth) && preferredAutoWidth > 0){
        baseWidth = preferredAutoWidth;
      }else if(Number.isFinite(datasetDefaultWidth) && datasetDefaultWidth > 0){
        baseWidth = datasetDefaultWidth;
      }else if(Number.isFinite(minSvgWidth) && minSvgWidth > 0){
        baseWidth = minSvgWidth;
      }else if(Number.isFinite(maxAvailable) && maxAvailable > 0){
        baseWidth = maxAvailable;
      }else{
        baseWidth = 0;
      }
    }
    const allowOverflow = unlimitedWidth || shouldForceDefaultWidth;
    let appliedWidth = baseWidth;
    if(!allowOverflow && Number.isFinite(maxAvailable)){
      appliedWidth = Math.min(appliedWidth, maxAvailable);
    }
    const minTarget = Number.isFinite(minSvgWidth) && minSvgWidth > 0 ? minSvgWidth : 0;
    if(!allowOverflow && Number.isFinite(maxAvailable) && maxAvailable >= 0 && maxAvailable < minTarget){
      appliedWidth = maxAvailable;
    }else if(appliedWidth < minTarget){
      appliedWidth = minTarget;
    }
    if(svgBox && Number.isFinite(appliedWidth) && appliedWidth > 0){
      let minWidthConstraint = Number.isFinite(datasetMinWidth) ? datasetMinWidth : NaN;
      if(Number.isFinite(minSvgWidth) && minSvgWidth > 0){
        minWidthConstraint = Number.isFinite(minWidthConstraint) ? Math.max(minWidthConstraint, minSvgWidth) : minSvgWidth;
      }
      let maxWidthConstraint = Number.isFinite(datasetMaxWidth) ? datasetMaxWidth : NaN;
      if(!allowOverflow && Number.isFinite(maxAvailable) && maxAvailable > 0){
        maxWidthConstraint = Number.isFinite(maxWidthConstraint) ? Math.min(maxWidthConstraint, maxAvailable) : maxAvailable;
      }
      if(Number.isFinite(minWidthConstraint) && Number.isFinite(maxWidthConstraint) && maxWidthConstraint < minWidthConstraint){
        maxWidthConstraint = minWidthConstraint;
      }
      let widthToApply = Math.round(appliedWidth);
      let heightToApply = NaN;
      let activeRatio = storedAspectRatio;
      if(aspectLocked && !usesCartesianLayoutTransaction){
        const ratioFromDefaults = (Number.isFinite(datasetDefaultWidth) && Number.isFinite(datasetDefaultHeight) && datasetDefaultHeight > 0)
          ? (datasetDefaultWidth / datasetDefaultHeight)
          : NaN;
        const ratioFromCurrent = (Number.isFinite(svgCurrentWidth) && Number.isFinite(svgCurrentHeight) && svgCurrentHeight > 0)
          ? (svgCurrentWidth / svgCurrentHeight)
          : NaN;
        activeRatio = Number.isFinite(activeRatio) ? activeRatio : (Number.isFinite(ratioFromCurrent) ? ratioFromCurrent : ratioFromDefaults);
        if(!Number.isFinite(activeRatio) || activeRatio <= 0){
          activeRatio = Number.isFinite(ratioFromDefaults) && ratioFromDefaults > 0 ? ratioFromDefaults : 1;
        }
        const enforced = enforceAspectRatio({
          width: widthToApply,
          height: svgCurrentHeight,
          minWidth: minWidthConstraint,
          maxWidth: maxWidthConstraint,
          minHeight: datasetMinHeight,
          maxHeight: datasetMaxHeight,
          ratio: activeRatio,
          axis: 'x',
          fallbackWidth: widthToApply,
          fallbackHeight: datasetDefaultHeight,
          label: debugLabel + ' sync'
        });
        if(Number.isFinite(enforced.width)){
          widthToApply = enforced.width;
        }
        if(Number.isFinite(enforced.height)){
          heightToApply = enforced.height;
        }
        if(Number.isFinite(enforced.width) && Number.isFinite(enforced.height) && enforced.height > 0){
          activeRatio = enforced.width / enforced.height;
        }
      }
      if(Number.isFinite(minWidthConstraint)){
        widthToApply = Math.max(widthToApply, Math.round(minWidthConstraint));
      }
      if(!unlimitedWidth && Number.isFinite(maxWidthConstraint)){
        widthToApply = Math.min(widthToApply, Math.round(maxWidthConstraint));
      }
      if(!preserveSvgBoxPresentation){
        setStylePxIfChanged(svgBox.style, 'width', widthToApply);
        if(allowOverflow){
          setStyleValueIfChanged(svgBox.style, 'maxWidth', 'none');
        }else{
          setStylePxIfChanged(svgBox.style, 'maxWidth', Math.max(widthToApply, Number.isFinite(datasetDefaultWidth) ? datasetDefaultWidth : widthToApply));
        }
        if(svgDataset){
          svgDataset.resizerWidth = svgBox.style.width;
        }
      }
      if(aspectLocked && !usesCartesianLayoutTransaction){
        let ratioForHeight = Number.isFinite(activeRatio) && activeRatio > 0 ? activeRatio : NaN;
        if(!Number.isFinite(ratioForHeight) || ratioForHeight <= 0){
          ratioForHeight = Number.isFinite(storedAspectRatio) && storedAspectRatio > 0 ? storedAspectRatio : NaN;
        }
        if(!Number.isFinite(heightToApply) && Number.isFinite(ratioForHeight) && ratioForHeight > 0){
          heightToApply = Math.round(widthToApply / ratioForHeight);
        }
        if(Number.isFinite(heightToApply)){
          if(Number.isFinite(datasetMinHeight)){
            heightToApply = Math.max(heightToApply, Math.round(datasetMinHeight));
          }
          if(Number.isFinite(datasetMaxHeight)){
            heightToApply = Math.min(heightToApply, Math.round(datasetMaxHeight));
          }
          if(!preserveSvgBoxPresentation){
            setStylePxIfChanged(svgBox.style, 'height', heightToApply);
            setStylePxIfChanged(svgBox.style, 'maxHeight', Math.max(heightToApply, Number.isFinite(datasetDefaultHeight) ? datasetDefaultHeight : heightToApply));
            if(svgDataset){
              svgDataset.resizerHeight = svgBox.style.height;
            }
          }
          debugLog('Debug: Shared.syncPanelWidths aspect enforcement', {
            label: debugLabel,
            aspectLocked,
            widthToApply,
            heightToApply,
            ratio: ratioForHeight,
            minWidthConstraint,
            maxWidthConstraint
          }); // Debug: aspect lock enforcement in sync
        }
        appliedWidth = widthToApply;
      }
    }
    if(isManualResize && !hasWorkspaceSplit && !hasManualPanelSizing && !stackedPanelLayout){
      const safeAppliedWidth = Number.isFinite(appliedWidth) && appliedWidth > 0 ? appliedWidth : manualWidth;
      const liveTableWidth = Number.isFinite(tableWidth) && tableWidth > 0 ? tableWidth : (tablePanel.getBoundingClientRect().width || 0);
      const lockedTableWidth = Number.isFinite(liveTableWidth) && liveTableWidth > 0
        ? liveTableWidth
        : (Number.isFinite(storedTableWidth) && storedTableWidth > 0 ? storedTableWidth : liveTableWidth);
      const minTablePx = Math.max(0, Math.round(minPx));
      const finalTableWidth = Math.max(minTablePx, Math.round(lockedTableWidth));
      if(svgDataset && finalTableWidth > 0){
        svgDataset.resizerTableWidth = String(finalTableWidth);
      }
      if(tablePanel && finalTableWidth > 0){
        setStyleValueIfChanged(tablePanel.style, 'flex', '0 0 ' + finalTableWidth + 'px');
        setStylePxIfChanged(tablePanel.style, 'width', finalTableWidth);
        setStylePxIfChanged(tablePanel.style, 'minWidth', minTablePx);
        setStyleValueIfChanged(tablePanel.style, 'maxWidth', 'none');
      }
      const targetGraphWidth = Number.isFinite(configWidth) ? safeAppliedWidth + configWidth + gap : safeAppliedWidth;
      const finalGraphWidth = Math.max(0, Math.round(targetGraphWidth));
      if(lockGraphPanelWidth && graphPanel && finalGraphWidth > 0){
        setStyleValueIfChanged(graphPanel.style, 'flex', '0 0 auto');
        setStyleValueIfChanged(graphPanel.style, 'maxWidth', 'none');
        setStylePxIfChanged(graphPanel.style, 'minWidth', finalGraphWidth);
        setStylePxIfChanged(graphPanel.style, 'width', finalGraphWidth);
      }
      if(configPanel){
        setStyleValueIfChanged(configPanel.style, 'flex', '0 0 auto');
      }
      const wrap = graphPanel?.parentElement || null;
      if(lockGraphPanelWidth && wrap && wrap.style){
        const wrapMin = Math.max(0, finalTableWidth + finalGraphWidth + graphInset + resizerSpace);
        if(wrapMin > 0){
          setStylePxIfChanged(wrap.style, 'minWidth', wrapMin);
        }else{
          setStyleValueIfChanged(wrap.style, 'minWidth', '');
        }
        if(wrap.dataset){
          wrap.dataset.panelMinWidthLocked = 'true';
        }
      }
      const latestGraphWidth = graphPanel?.getBoundingClientRect()?.width || finalGraphWidth;
      debugLog('Debug: Shared.syncPanelWidths manual lock', {
        label: debugLabel,
        appliedWidth: safeAppliedWidth,
        tableWidth: finalTableWidth,
        graphWidth: latestGraphWidth,
        configWidth,
        gap
      });
      if(typeof opts.onWidthApplied === 'function'){
        try{ opts.onWidthApplied(safeAppliedWidth); }catch(err){ console.error('Shared.syncPanelWidths onWidthApplied error', err); }
      }
      const shouldSchedule = opts.forceSchedule === true || layoutMutated;
      if(!opts.skipSchedule && shouldSchedule && typeof scheduleDraw === 'function'){
        try{ scheduleDraw(); }catch(err){ console.error(debugLabel + ' sync schedule error', err); }
      }
      return {
        layoutChanged: layoutMutated,
        tableWidth: finalTableWidth,
        graphWidth: latestGraphWidth,
        configWidth,
        gap,
        available: availableRaw,
        minSvgWidth,
        appliedWidth: safeAppliedWidth,
        graphInset,
        graphContentWidth,
        isManualResize,
        manualWidth: safeAppliedWidth
      };
    }
    const targetGraphWidth = Number.isFinite(appliedWidth) && Number.isFinite(configWidth)
      ? appliedWidth + configWidth + gap
      : null;
    if(!stackedPanelLayout && lockGraphPanelWidth && graphPanel && Number.isFinite(targetGraphWidth) && targetGraphWidth > 0){
      setStyleValueIfChanged(graphPanel.style, 'flex', '0 0 auto');
      setStyleValueIfChanged(graphPanel.style, 'maxWidth', 'none');
      setStylePxIfChanged(graphPanel.style, 'minWidth', targetGraphWidth);
      let contentDiff = Number.isFinite(graphContentWidth)
        ? Math.abs(graphContentWidth - targetGraphWidth)
        : Infinity;
      if(isManualResize){
        contentDiff = Infinity;
      }
      if(!Number.isFinite(graphContentWidth) || contentDiff > 1){
        setStylePxIfChanged(graphPanel.style, 'width', targetGraphWidth);
        debugLog('Debug: Shared.syncPanelWidths graph width applied', {
          label: debugLabel,
          targetGraphWidth,
          existingGraphWidth: graphWidth,
          graphContentWidth,
          contentDiff
        }); // Debug: graph width adjustment
      }
    }
    const wrap = graphPanel?.parentElement || null;
    if(!stackedPanelLayout && lockGraphPanelWidth && wrap && Number.isFinite(tableWidth) && Number.isFinite(targetGraphWidth)){
        const wrapMin = tableWidth + targetGraphWidth + graphInset + resizerSpace;
        if(Number.isFinite(wrapMin) && wrapMin > 0){
          setStylePxIfChanged(wrap.style, 'minWidth', wrapMin);
          if(wrap.dataset){
            wrap.dataset.panelMinWidthLocked = 'true';
          }
          debugLog('Debug: Shared.syncPanelWidths wrap minWidth', {
            label: debugLabel,
            wrapMin,
          tableWidth,
          targetGraphWidth,
          graphInset,
          resizerWidth,
          resizerMargin,
          resizerSpace
        }); // Debug: wrap width enforcement
      }
    }
    debugLog('Debug: Shared.syncPanelWidths manual state', {
      label: debugLabel,
      isManualResize,
      datasetMinWidth,
      datasetDefaultWidth,
      svgCurrentWidth,
      baseWidth,
      appliedWidth,
      maxAvailable,
      graphInset,
      graphContentWidth,
      available: availableRaw,
      manualWidth,
      minTarget
    }); // Debug: resizer manual state
    if(typeof opts.onWidthApplied === 'function'){
      try{
        opts.onWidthApplied(appliedWidth);
      }catch(err){
        console.error('Shared.syncPanelWidths onWidthApplied error', err);
      }
    }
    const shouldSchedule = opts.forceSchedule === true || layoutMutated;
    if(!opts.skipSchedule && shouldSchedule && typeof scheduleDraw === 'function'){
      try{
        scheduleDraw();
      }catch(err){
        console.error(debugLabel + ' sync schedule error', err);
      }
    }
    debugLog('Debug: Shared.syncPanelWidths applied', {
      label: debugLabel,
      tableWidth,
      graphWidth,
      configWidth,
      gap,
      available: availableRaw,
      minSvgWidth,
      appliedWidth,
      graphInset,
      graphContentWidth,
      isManualResize,
      manualWidth
    });
    return {
      layoutChanged: layoutMutated,
      tableWidth,
      graphWidth,
      configWidth,
      gap,
      available: availableRaw,
      minSvgWidth,
      appliedWidth,
      graphInset,
      graphContentWidth,
      isManualResize
    };
  };
})(window);
