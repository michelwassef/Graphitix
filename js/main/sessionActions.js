(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.sessionActions = Main.sessionActions || {};

  function debug(context, message, payload) {
    const Shared = context?.Shared || window.Shared;
    if (!(typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled())) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('Debug: sessionActions.' + message, payload || {});
    }
  }

  function ensureGraphArchiveApi(Shared) {
    if (Shared?.graphArchive && typeof Shared.graphArchive.parseFile === 'function') {
      return Shared.graphArchive;
    }
    if (typeof require === 'function') {
      try {
        require('../shared/graphArchive.js');
      } catch (err) {
        // no-op; browser builds and some tests do not expose require paths
      }
    }
    if (Shared?.graphArchive && typeof Shared.graphArchive.parseFile === 'function') {
      return Shared.graphArchive;
    }
    return null;
  }

  function ensureGraphFileName(context, name, fallback) {
    const Shared = context?.Shared || window.Shared;
    const helper = Shared?.graphArchive?.ensureGraphFileName;
    if (typeof helper === 'function') {
      return helper(name, fallback || 'workspace.graph');
    }
    const base = String(name || fallback || 'workspace.graph').trim() || 'workspace.graph';
    return /\.graph$/i.test(base) ? base : `${base}.graph`;
  }

  function canLoadFile(context) {
    const { session, withSessionContext } = context || {};
    return !!session
      && typeof session.applySessionData === 'function'
      && typeof withSessionContext === 'function';
  }

  function getGraphTabsFromWorkspaceState(workspaceState) {
    if (!Array.isArray(workspaceState?.tabs)) {
      return [];
    }
    return workspaceState.tabs.filter(tab => tab && !tab.isWelcome && typeof tab.type === 'string' && tab.type.length > 0);
  }

  function findTabById(workspaceState, tabId) {
    if (!tabId || !Array.isArray(workspaceState?.tabs)) {
      return null;
    }
    return workspaceState.tabs.find(tab => tab && tab.id === tabId) || null;
  }

  function cloneWithSession(session, value) {
    const cloneFn = session?.fastClonePayload || session?.clonePayload;
    if (typeof cloneFn === 'function') {
      return cloneFn.call(session, value);
    }
    return value;
  }

  function cloneSnapshotIntent(intent) {
    if (!intent || typeof intent !== 'object') {
      return {};
    }
    return { ...intent };
  }

  function resolvePersistSnapshotIntent(options = {}) {
    const explicit = cloneSnapshotIntent(options.snapshotIntent);
    if (Object.keys(explicit).length) {
      return explicit;
    }
    const kind = String(options.snapshotKind || '').trim().toLowerCase();
    switch (kind) {
      case 'archive-save':
      case 'document-snapshot':
      case 'append-existing':
        return {
          saveLike: true,
          captureLivePayload: true,
          allowSkipLivePayloadCapture: false,
          runSkippedPayloadDriftProbe: true,
          promoteSkippedPayloadDrift: true,
          reasonSkippable: false
        };
      case 'warmup-cache':
        return {
          saveLike: false,
          captureLivePayload: false,
          skipLivePayloadCapture: true,
          allowSkipLivePayloadCapture: true,
          lifecycleSnapshot: true,
          runSkippedPayloadDriftProbe: false,
          promoteSkippedPayloadDrift: false,
          reasonSkippable: true
        };
      case 'autosave':
        return {
          saveLike: false,
          allowSkipLivePayloadCapture: true,
          lifecycleSnapshot: true,
          runSkippedPayloadDriftProbe: false,
          promoteSkippedPayloadDrift: false,
          reasonSkippable: true
        };
      case 'lifecycle-checkpoint':
      default:
        return {
          saveLike: false,
          allowSkipLivePayloadCapture: true,
          lifecycleSnapshot: true,
          runSkippedPayloadDriftProbe: false,
          promoteSkippedPayloadDrift: false,
          reasonSkippable: true
        };
    }
  }


  function rehomeArchiveValue(session, value, tabId) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof session?.rehomeTabScopedState === 'function') {
      return session.rehomeTabScopedState(value, tabId);
    }
    return cloneWithSession(session, value);
  }

  function rehomeArchiveString(session, value, tabId) {
    if (typeof value !== 'string') {
      return value;
    }
    if (typeof session?.remapRuntimeWorkspaceString === 'function') {
      return session.remapRuntimeWorkspaceString(value, tabId);
    }
    return value.replace(/workspace-\d+/g, String(tabId || ''));
  }

  const ARCHIVE_RENDER_CACHE_SECTIONS = {
    box: {
      graphicKey: 'plot',
      sections: {
        plot: '#boxPlot'
      },
      requireGraphSvg: true
    },
    scatter: {
      graphicKey: 'plot',
      sections: {
        plot: '#scatterPlot',
        stats: '#scatterStatsResults'
      },
      requireGraphSvg: true
    },
    line: {
      graphicKey: 'plot',
      sections: {
        plot: '#linePlot',
        stats: '#lineStatsResults'
      },
      requireGraphSvg: true
    },
    hist: {
      graphicKey: 'plot',
      sections: {
        plot: '#histPlot',
        stats: '#histStatsResults'
      },
      requireGraphSvg: true
    },
    heatmap: {
      graphicKey: 'plot',
      sections: {
        plot: '#heatmapSvg',
        stats: '#heatmapStatsContent'
      },
      requireGraphSvg: false,
      svgRoot: '#heatmapSvg'
    },
    pca: {
      graphicKey: 'plot',
      sections: {
        plot: '#pcaPlot',
        stats: '#pcaStatsResults',
        summary: '#pcaStatsSummary',
        scree: '#pcaScreePlot'
      },
      requireGraphSvg: true
    },
    pie: {
      graphicKey: 'plot',
      sections: {
        plot: '#piePlot',
        stats: '#pieStatsResults'
      },
      requireGraphSvg: true
    },
    roc: {
      graphicKey: 'plot',
      sections: {
        plot: '#rocPlot',
        stats: '#rocStatsResults'
      },
      requireGraphSvg: true
    },
    survival: {
      graphicKey: 'plot',
      sections: {
        plot: '#survivalPlot',
        summary: '#survivalStatsSummary',
        logRank: '#survivalStatsLogRank',
        hazard: '#survivalStatsHazardRatios',
        cox: '#survivalStatsCox'
      },
      requireGraphSvg: true
    },
    venn: {
      graphicKey: 'stage',
      sections: {
        stage: '#stage',
        regionList: '#regionList',
        significance: '#significanceResults',
        goResults: '#goResults',
        stringResults: '#stringResults',
        stringNetwork: '#stringNetwork',
        regionOptions: '#regionSelect'
      },
      requireGraphSvg: false,
      svgRoot: '#stage'
    },
    surface: {
      graphicKey: 'plot',
      sections: {
        plot: '#surfaceSvg',
        stats: '#surfaceStatsSummary',
        message: '#surfaceMessage'
      },
      requireGraphSvg: false,
      svgRoot: '#surfaceSvg'
    }
  };

  function resolveArchiveCacheRoot(tab) {
    const Shared = window.Shared || null;
    const root = Shared?.workspaceTabs?.getMountedRoot?.(tab, tab?.type || null) || null;
    if (root && typeof root.querySelector === 'function') {
      return root;
    }
    return null;
  }

  function cloneChildNodesToFragment(node) {
    const doc = node?.ownerDocument || window.document || null;
    if (!node || !doc) {
      return null;
    }
    const fragment = doc.createDocumentFragment();
    let count = 0;
    const nodeName = String(node.nodeName || '').toLowerCase();
    const includeSelf = nodeName === 'svg' || nodeName === 'canvas';
    const children = includeSelf ? [node] : Array.from(node.childNodes || []);
    children.forEach(child => {
      try {
        fragment.appendChild(child.cloneNode(true));
        count += 1;
      } catch (err) {
        console.warn('cloneChildNodesToFragment skipped child', { err });
      }
    });
    return { fragment, count };
  }

  function captureSvgRootStateForArchive(svg) {
    if (!svg || !svg.attributes) {
      return null;
    }
    const attributes = {};
    Array.from(svg.attributes || []).forEach(attr => {
      if (attr && typeof attr.name === 'string') {
        attributes[attr.name] = attr.value || '';
      }
    });
    const style = {};
    const styleNames = ['display'];
    styleNames.forEach(name => {
      const value = svg.style?.[name];
      if (typeof value === 'string' && value.length) {
        style[name] = value;
      }
    });
    return {
      attributes: Object.keys(attributes).length ? attributes : null,
      style: Object.keys(style).length ? style : null
    };
  }

  function graphFragmentLooksRenderable(payload) {
    const fragment = payload?.fragment || null;
    if (!fragment || Number(payload?.count || 0) <= 0) {
      return false;
    }
    if (typeof fragment.querySelector !== 'function') {
      return true;
    }
    return !!(
      fragment.querySelector('svg')
      || fragment.querySelector('path, rect, circle, line, polyline, polygon, text, g, image, canvas')
      || fragment.childNodes?.length
    );
  }

  function captureMountedTabRenderCacheForArchive(context, tab, config, meta = {}) {
    const spec = ARCHIVE_RENDER_CACHE_SECTIONS[tab?.type || ''];
    const root = resolveArchiveCacheRoot(tab);
    if (!spec || !root) {
      return null;
    }
    const cache = {};
    let graphPayload = null;
    let totalNodes = 0;
    Object.entries(spec.sections || {}).forEach(([key, selector]) => {
      const node = selector && root.querySelector?.(selector);
      const payload = cloneChildNodesToFragment(node);
      if (!payload || payload.count <= 0) {
        return;
      }
      cache[key] = payload;
      totalNodes += payload.count;
      if (key === spec.graphicKey) {
        graphPayload = payload;
      }
    });
    if (!graphPayload || !graphFragmentLooksRenderable(graphPayload)) {
      debug(context, 'generic archive render cache skipped', {
        tabId: tab?.id || null,
        type: tab?.type || null,
        reason: !graphPayload ? 'missing-graph-fragment' : 'empty-graph-fragment',
        source: meta.reason || 'archive-snapshot'
      });
      return null;
    }
    if (spec.requireGraphSvg && !graphPayload.fragment.querySelector?.('svg')) {
      debug(context, 'generic archive render cache skipped', {
        tabId: tab?.id || null,
        type: tab?.type || null,
        reason: 'missing-svg-in-graph-fragment',
        source: meta.reason || 'archive-snapshot'
      });
      return null;
    }
    if (spec.svgRoot) {
      const svg = root.querySelector?.(spec.svgRoot) || null;
      const svgRootState = captureSvgRootStateForArchive(svg);
      if (svgRootState) {
        if (tab.type === 'venn') {
          cache.stageRootState = svgRootState;
        } else {
          cache.svgRootState = svgRootState;
        }
      }
    }
    cache.__graphitixRenderCache = {
      version: 2,
      component: tab?.type || null,
      type: tab?.type || null,
      tabId: tab?.id || null,
      complete: true,
      graphicKey: spec.graphicKey,
      previewKey: spec.graphicKey,
      captureMode: 'mounted-root-clone',
      capturedAt: Date.now(),
      reason: meta.reason || 'archive-snapshot-mounted-root'
    };
    cache.graphicKey = spec.graphicKey;
    debug(context, 'generic archive render cache captured', {
      tabId: tab?.id || null,
      type: tab?.type || null,
      graphicKey: spec.graphicKey,
      totalNodes,
      sections: Object.keys(cache).filter(key => key !== '__graphitixRenderCache')
    });
    return cache;
  }

  function persistActiveTabIfNeeded(context, options = {}) {
    const { session, withSessionContext, workspaceState } = context || {};
    if (!session || typeof session.getActiveTab !== 'function' || typeof session.persistActiveTabState !== 'function') {
      return;
    }
    const active = session.getActiveTab();
    if (!active || active.isWelcome || !active.type) {
      return;
    }
    const reason = options.reason || 'archive-save';
    const snapshotIntent = resolvePersistSnapshotIntent(options);
    const shouldCaptureRenderCache = options.captureRenderCache === true;
    const preserveRenderCacheTabIds = Array.isArray(options.preserveRenderCacheTabIds)
      ? options.preserveRenderCacheTabIds.filter(Boolean)
      : [active.id];
    session.persistActiveTabState(active, withSessionContext({
      reason,
      forcePreviewCapture: true,
      captureRenderCache: shouldCaptureRenderCache,
      preserveRenderCacheTabIds,
      disableRenderCachePrune: true,
      origin: 'lifecycle',
      snapshotIntent
    }));
  }

  function buildArchiveTabSnapshot(context, tab) {
    const { session, workspaces } = context || {};
    if (!tab || tab.isWelcome || !tab.type) {
      return null;
    }
    // Funnel through the shared enrichment helper so that the live save path produces the
    // same payload/layout shape as the legacy buildSessionPayload (including the
    // graphSizing enrich/merge for non-box types). Falls back to a plain clone if the
    // session module is mocked in a test that doesn't expose the helper.
    let payload;
    let layout;
    if (typeof session?.enrichTabSnapshotForArchive === 'function') {
      const enriched = session.enrichTabSnapshotForArchive(tab, { contextLabel: 'archive-snapshot' });
      payload = enriched?.payload ?? cloneWithSession(session, tab.payload || null);
      layout = enriched?.layout ?? cloneWithSession(session, tab.layoutState || null);
    } else {
      payload = cloneWithSession(session, tab.payload || null);
      layout = cloneWithSession(session, tab.layoutState || null);
    }
    const activeId = session?.getActiveTab?.()?.id || null;
    const config = workspaces?.[tab.type] || null;
    let lifecycleSnapshot = null;
    if (config && tab.id === activeId && Shared.componentLifecycle?.snapshotWorkspaceSync) {
      try {
        lifecycleSnapshot = Shared.componentLifecycle.snapshotWorkspaceSync(config, tab, {
          tabId: tab.id,
          type: tab.type,
          componentKey: tab.type,
          reason: 'archive-save-lifecycle-snapshot'
        });
        if (lifecycleSnapshot?.payload) {
          payload = cloneWithSession(session, lifecycleSnapshot.payload);
        }
        if (lifecycleSnapshot?.layoutState) {
          layout = cloneWithSession(session, lifecycleSnapshot.layoutState);
        }
        debug(context, 'buildArchiveTabSnapshot.lifecycleSnapshot', {
          tabId: tab.id,
          type: tab.type,
          hasPayload: !!lifecycleSnapshot?.payload,
          hasLayout: !!lifecycleSnapshot?.layoutState,
          hasRenderCache: !!lifecycleSnapshot?.renderCache
        });
      } catch (err) {
        console.error('buildArchiveTabSnapshot lifecycle snapshot error', { tabId: tab.id, type: tab.type, err });
      }
    }

    const archivePayloadForSignature = rehomeArchiveValue(session, payload, tab.id);
    const archiveLayoutForSignature = rehomeArchiveValue(session, layout, tab.id);
    const archivePayloadSignature = typeof session?.serializePayloadSignature === 'function'
      ? session.serializePayloadSignature(archivePayloadForSignature || null)
      : (tab.payloadSignature || null);
    const archiveLayoutSignature = typeof session?.serializePayloadSignature === 'function'
      ? session.serializePayloadSignature(archiveLayoutForSignature || null)
      : (tab.layoutSignature || null);

    let archiveRenderCache = tab.renderCache?.cache
      ? (typeof session?.serializeRenderCacheForArchive === 'function'
          ? session.serializeRenderCacheForArchive(tab.renderCache.cache)
          : null)
      : (tab.archiveRenderCache && typeof tab.archiveRenderCache === 'object'
          ? cloneWithSession(session, tab.archiveRenderCache)
          : null);
    let archiveRenderCacheSignature = archiveRenderCache ? archivePayloadSignature : null;
    let archiveRenderCacheLayoutSignature = archiveRenderCache ? archiveLayoutSignature : null;

    // Only fall back to a live captureRenderCache for the active tab. For inactive tabs
    // the live DOM holds the active tab's content (per-tab DOM instances), so the live
    // capture would record the wrong fragment. Pre-save warmup is responsible for
    // populating tab.renderCache.cache on inactive tabs before this point.
    if (!archiveRenderCache && lifecycleSnapshot?.renderCache && typeof session?.serializeRenderCacheForArchive === 'function') {
      archiveRenderCache = session.serializeRenderCacheForArchive(lifecycleSnapshot.renderCache);
      archiveRenderCacheSignature = archivePayloadSignature;
      archiveRenderCacheLayoutSignature = archiveLayoutSignature;
    }

    if (!archiveRenderCache && config && typeof config.captureRenderCache === 'function' && tab.id === activeId) {
      try {
        const captured = config.captureRenderCache({
          tabId: tab.id,
          type: tab.type,
          reason: 'archive-save-active'
        });
        if (captured && typeof session?.serializeRenderCacheForArchive === 'function') {
          archiveRenderCache = session.serializeRenderCacheForArchive(captured);
          archiveRenderCacheSignature = archivePayloadSignature;
          archiveRenderCacheLayoutSignature = archiveLayoutSignature;
        }
        if (captured && typeof config.restoreRenderCache === 'function') {
          try {
            config.restoreRenderCache(captured, {
              tabId: tab.id,
              type: tab.type,
              reason: 'archive-save-active-restore',
              temporaryRestore: true
            });
          } catch (err) {
            console.error('buildArchiveTabSnapshot restoreRenderCache error', {
              tabId: tab.id,
              type: tab.type,
              err
            });
          }
        }
      } catch (err) {
        console.error('buildArchiveTabSnapshot captureRenderCache error', {
          tabId: tab.id,
          type: tab.type,
          err
        });
      }
    }

    if (!archiveRenderCache) {
      const mountedRootCache = captureMountedTabRenderCacheForArchive(context, tab, config, {
        reason: 'archive-save-mounted-root-fallback'
      });
      if (mountedRootCache && typeof session?.serializeRenderCacheForArchive === 'function') {
        archiveRenderCache = session.serializeRenderCacheForArchive(mountedRootCache);
        archiveRenderCacheSignature = archivePayloadSignature;
        archiveRenderCacheLayoutSignature = archiveLayoutSignature;
      }
    }

    if ((!tab.previewMarkup || !String(tab.previewMarkup).trim()) && archiveRenderCache && config && context?.previews?.updateTabPreviewFromWorkspace) {
      const previousRenderCache = tab.renderCache || null;
      const previousRenderCacheSignature = tab.renderCacheSignature || null;
      const previousRenderCacheLayoutSignature = tab.renderCacheLayoutSignature || null;
      const previousRenderCacheTabId = tab.renderCacheTabId || null;
      try {
        tab.renderCache = {
          cache: archiveRenderCache,
          tabId: tab.id,
          type: tab.type || null,
          payloadSignature: archivePayloadSignature || tab.payloadSignature || null,
          layoutSignature: archiveLayoutSignature || tab.layoutSignature || null,
          capturedAt: Date.now(),
          captureSequence: Number(previousRenderCache?.captureSequence || 0)
        };
        tab.renderCacheSignature = archivePayloadSignature || tab.payloadSignature || null;
        tab.renderCacheLayoutSignature = archiveLayoutSignature || tab.layoutSignature || null;
        tab.renderCacheTabId = tab.id;
        context.previews.updateTabPreviewFromWorkspace(tab, config, {
          reason: 'archive-save-preview-from-render-cache',
          forceCapture: true,
          allowPreviewClear: false
        });
      } catch (err) {
        console.debug('Debug: archive preview fallback from render cache failed', {
          tabId: tab.id,
          type: tab.type,
          message: err?.message || String(err)
        });
      } finally {
        if (previousRenderCache) {
          tab.renderCache = previousRenderCache;
          tab.renderCacheSignature = previousRenderCacheSignature;
          tab.renderCacheLayoutSignature = previousRenderCacheLayoutSignature;
          tab.renderCacheTabId = previousRenderCacheTabId;
        }
      }
    }

    return {
      title: tab.title || 'Workspace',
      type: tab.type || tab?.payload?.type || null,
      runtimeTabId: tab.id || null,
      payload: archivePayloadForSignature,
      layout: archiveLayoutForSignature,
      previewMarkup: typeof tab.previewMarkup === 'string' ? rehomeArchiveString(session, tab.previewMarkup, tab.id) : null,
      previewSignature: tab.previewSignature || null,
      previewMeta: rehomeArchiveValue(session, tab.previewMeta || null, tab.id),
      archiveRenderCache: archiveRenderCache && typeof archiveRenderCache === 'object'
        ? rehomeArchiveValue(session, archiveRenderCache, tab.id)
        : null,
      archiveRenderCacheSignature: archiveRenderCache ? archiveRenderCacheSignature : null,
      archiveRenderCacheLayoutSignature: archiveRenderCache ? archiveRenderCacheLayoutSignature : null,
      uiState: tab.uiState && typeof tab.uiState === 'object'
        ? rehomeArchiveValue(session, tab.uiState, tab.id)
        : null
    };
  }

  function buildScopeSnapshot(context, scope, options = {}) {
    const { session, workspaceState, withSessionContext } = context || {};
    if (!session || !workspaceState || typeof withSessionContext !== 'function') {
      return null;
    }
    persistActiveTabIfNeeded(context, {
      reason: options.reason || 'archive-save',
      snapshotKind: options.snapshotKind || 'archive-save',
      snapshotIntent: options.snapshotIntent || null,
      captureRenderCache: options.captureRenderCache === true,
      preserveRenderCacheTabIds: options.preserveRenderCacheTabIds
    });

    if (scope === 'workspace') {
      const graphTabs = getGraphTabsFromWorkspaceState(workspaceState);
      const activeId = session.getActiveTab?.()?.id || null;
      const activeIndex = graphTabs.findIndex(tab => tab.id === activeId);
      return {
        activeIndex: activeIndex >= 0 ? activeIndex : (graphTabs.length ? 0 : -1),
        tabs: graphTabs.map(tab => buildArchiveTabSnapshot(context, tab)).filter(Boolean)
      };
    }

    const targetTabId = options.targetTabId || session.getActiveTab?.()?.id || null;
    const tab = findTabById(workspaceState, targetTabId);
    const snapshot = buildArchiveTabSnapshot(context, tab);
    if (!snapshot) {
      return null;
    }
    return {
      activeIndex: 0,
      tabs: [snapshot]
    };
  }

  function resolveArchiveNameForScope(context, scope, options = {}) {
    const { session, workspaceState } = context || {};
    const existingName = workspaceState?.sessionFileName || '';
    if (scope === 'workspace') {
      return ensureGraphFileName(context, options.fileName || existingName, 'workspace.graph');
    }
    const active = options.targetTabId
      ? findTabById(workspaceState, options.targetTabId)
      : (typeof session?.getActiveTab === 'function' ? session.getActiveTab() : null);
    const tabTitle = String(active?.title || '').trim();
    const safeTitle = tabTitle.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'workspace';
    return ensureGraphFileName(context, options.fileName || existingName, `${safeTitle}.graph`);
  }

  function shouldConfirmWorkspaceReplacement(context) {
    const { session, workspaceState } = context || {};
    if (!session || !workspaceState) {
      return false;
    }
    const isDirty = !!workspaceState.sessionUserDirty;
    const hasData = typeof session.graphTabsHaveData === 'function'
      ? !!session.graphTabsHaveData()
      : getGraphTabsFromWorkspaceState(workspaceState).length > 0;
    return isDirty && hasData;
  }

  function confirmWorkspaceReplacement(context) {
    if (!shouldConfirmWorkspaceReplacement(context)) {
      return true;
    }
    const message = 'This will replace your current workspace tabs. Continue without saving first?';
    if (typeof window.confirm === 'function') {
      const confirmed = window.confirm(message);
      debug(context, 'confirmWorkspaceReplacement', { confirmed });
      return confirmed;
    }
    return true;
  }

  function awaitDelay(ms) {
    return new Promise(resolve => {
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(resolve, ms);
      } else {
        setTimeout(resolve, ms);
      }
    });
  }

  async function awaitWithTimeout(promise, timeoutMs, label, details = {}) {
    const ms = Math.max(250, Number(timeoutMs) || 0);
    let timer = null;
    let timedOut = false;
    const timerApi = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? { set: window.setTimeout.bind(window), clear: window.clearTimeout.bind(window) }
      : { set: setTimeout, clear: clearTimeout };
    const timeout = new Promise(resolve => {
      timer = timerApi.set(() => {
        timedOut = true;
        console.warn('Debug: sessionActions async step timed out', {
          label,
          timeoutMs: ms,
          ...details
        });
        resolve({ timedOut: true, label });
      }, ms);
    });
    try {
      const value = await Promise.race([Promise.resolve(promise), timeout]);
      return timedOut ? { timedOut: true, label } : { timedOut: false, value };
    } finally {
      if (timer !== null) {
        try { timerApi.clear(timer); } catch (_err) {}
      }
    }
  }



  async function awaitWorkspaceReadyForSnapshot(context, tab, options = {}) {
    const { workspaces } = context || {};
    if (!tab || !tab.type || !workspaces) {
      return { skipped: true, reason: 'missing-tab-or-workspaces' };
    }
    const config = workspaces[tab.type] || null;
    if (!config || typeof config.awaitReadyForSnapshot !== 'function') {
      return { skipped: true, reason: 'missing-hook' };
    }
    try {
      const timeoutMs = Number.isFinite(Number(options.timeoutMs))
        ? Math.max(250, Number(options.timeoutMs))
        : 4500;
      const outcome = await awaitWithTimeout(config.awaitReadyForSnapshot({
        tab,
        tabId: tab.id,
        type: tab.type,
        componentKey: tab.type,
        reason: options.reason || 'snapshot-ready',
        timeoutMs: Math.min(timeoutMs, 3500)
      }), timeoutMs, 'awaitWorkspaceReadyForSnapshot', {
        tabId: tab.id,
        type: tab.type,
        reason: options.reason || 'snapshot-ready'
      });
      if (outcome?.timedOut) {
        return { ok: false, timedOut: true, reason: 'snapshot-ready-timeout' };
      }
      const result = outcome?.value || { ok: true };
      debug(context, 'awaitWorkspaceReadyForSnapshot.complete', {
        tabId: tab.id,
        type: tab.type,
        reason: options.reason || 'snapshot-ready',
        ok: result?.ok !== false,
        skipped: !!result?.skipped
      });
      return result || { ok: true };
    } catch (err) {
      console.error('awaitWorkspaceReadyForSnapshot error', { tabId: tab.id, type: tab.type, err });
      return { ok: false, error: err?.message || String(err) };
    }
  }

  function tabHasLiveRenderCache(tab) {
    return !!(tab && tab.renderCache && tab.renderCache.cache);
  }

  function isComponentReadyForWarmup(type) {
    if (!type || typeof window === 'undefined') {
      return false;
    }
    const component = window.Components ? window.Components[type] : null;
    return !!(component && component.ready === true);
  }

  // Run config.ensure() for each unique tab type so the component bundle is loaded and
  // its setup() has run against the default (non-per-tab) DOM root before we start the
  // visible-activation warmup loop. This decouples bundle-load + first-init races (the
  // class of bug we were avoiding via Option B's cold-component skip) from the rapid
  // tab-activation cycle. After this returns, every component listed in `types` has
  // ready === true (or has logged an error and is excluded from the returned set).
  async function ensureComponentsBeforeWarmup(context, types, options = {}) {
    const { workspaces } = context || {};
    if (!workspaces || !Array.isArray(types) || !types.length) {
      return new Set();
    }
    const ready = new Set();
    const uniqueTypes = Array.from(new Set(types.filter(Boolean)));
    await Promise.all(uniqueTypes.map(async type => {
      if (isComponentReadyForWarmup(type)) {
        ready.add(type);
        return;
      }
      const config = workspaces[type];
      if (!config || typeof config.ensure !== 'function') {
        return;
      }
      try {
        const ensureResult = config.ensure();
        if (ensureResult && typeof ensureResult.then === 'function') {
          const outcome = await awaitWithTimeout(ensureResult, 12000, 'ensureComponentsBeforeWarmup', {
            type,
            reason: options.reason || 'pre-warmup-ensure'
          });
          if (outcome?.timedOut) {
            return;
          }
        }
      } catch (err) {
        console.error('ensureComponentsBeforeWarmup error', { type, err, reason: options.reason || 'pre-warmup-ensure' });
        return;
      }
      // Re-check readiness after ensure resolved. A few component bundles set
      // component.ready inside an internal async path; if it's still false, exclude this
      // type from the warmup so we never call activateTab for a half-constructed bundle.
      if (isComponentReadyForWarmup(type)) {
        ready.add(type);
      } else {
        console.debug('Debug: ensureComponentsBeforeWarmup component still cold after ensure', {
          type,
          reason: options.reason || 'pre-warmup-ensure'
        });
      }
    }));
    return ready;
  }

  async function warmTabRenderCaches(context, options = {}) {
    const { session, workspaceState, withSessionContext, activateTab } = context || {};
    if (!session || !workspaceState || typeof activateTab !== 'function' || typeof withSessionContext !== 'function') {
      return { warmed: 0, reason: 'missing-context' };
    }
    const reasonBase = options.reason || 'render-cache-warmup';
    const finalTabId = options.finalTabId
      || (typeof session.getActiveTab === 'function' ? session.getActiveTab()?.id : null);
    if (!finalTabId) {
      return { warmed: 0, reason: 'no-final-tab' };
    }
    const graphTabs = getGraphTabsFromWorkspaceState(workspaceState);
    // Phase 1: ensure every component bundle is loaded and its setup() has run, so the
    // upcoming activation loop never triggers cold setup against a per-tab clone.
    const candidateTypes = graphTabs
      .filter(tab => tab.id !== finalTabId && !tabHasLiveRenderCache(tab))
      .map(tab => tab.type);
    const readyTypes = await ensureComponentsBeforeWarmup(context, candidateTypes, { reason: reasonBase });
    const tabsToWarm = [];
    let skippedColdComponents = 0;
    for (let i = 0; i < graphTabs.length; i += 1) {
      const tab = graphTabs[i];
      if (tab.id === finalTabId || tabHasLiveRenderCache(tab)) {
        continue;
      }
      if (!readyTypes.has(tab.type) && !isComponentReadyForWarmup(tab.type)) {
        skippedColdComponents += 1;
        continue;
      }
      tabsToWarm.push(tab);
    }
    if (!tabsToWarm.length) {
      return { warmed: 0, reason: 'all-warm', skippedColdComponents };
    }
    if (typeof session.setRenderCachePruneSuspended === 'function') {
      session.setRenderCachePruneSuspended(true);
    }
    // Hide the rapid tab activations behind a loading overlay so the user does not see
    // each tab flash. Resolved lazily so tests that don't expose Shared.loadingOverlay
    // (or DOM hosts) keep working.
    const Shared = context?.Shared || (typeof window !== 'undefined' ? window.Shared : null);
    const overlayHost = (() => {
      if (!Shared?.loadingOverlay || typeof Shared.loadingOverlay.show !== 'function') {
        return null;
      }
      if (options.overlayHost) {
        return options.overlayHost;
      }
      if (typeof document === 'undefined' || !document.getElementById) {
        return null;
      }
      return document.getElementById('workspacePages') || document.body || null;
    })();
    const overlayHandle = overlayHost
      ? Shared.loadingOverlay.show(overlayHost, {
          reason: reasonBase,
          component: 'render-cache-warmup',
          message: options.overlayMessage || 'Preparing tabs…'
        })
      : null;
    const stepDelayMs = Number.isFinite(options.stepDelayMs) ? Math.max(80, options.stepDelayMs) : 220;
    let warmed = 0;
    try {
      for (let i = 0; i < tabsToWarm.length; i += 1) {
        const tab = tabsToWarm[i];
        try {
          const activation = activateTab(tab.id, withSessionContext({
            reason: `${reasonBase}-step`,
            silent: true
          }));
          if (activation && typeof activation.then === 'function') {
            const activationOutcome = await awaitWithTimeout(activation, 15000, 'warmTabRenderCaches.activate', {
              tabId: tab.id,
              type: tab.type,
              reason: `${reasonBase}-step`
            });
            if (activationOutcome?.timedOut) {
              console.warn('warmTabRenderCaches activate timeout', { tabId: tab.id, type: tab.type, reason: `${reasonBase}-step` });
              await awaitDelay(stepDelayMs);
              continue;
            }
          }
        } catch (err) {
          console.error('warmTabRenderCaches activate error', { tabId: tab.id, err });
          await awaitDelay(stepDelayMs);
          continue;
        }
        await awaitWorkspaceReadyForSnapshot(context, tab, { reason: `${reasonBase}-step-ready` });
        try {
          if (typeof session.persistActiveTabState === 'function') {
            session.persistActiveTabState(tab, withSessionContext({
              reason: `${reasonBase}-capture-cache`,
              origin: 'lifecycle',
              snapshotKind: 'warmup-cache',
              snapshotIntent: resolvePersistSnapshotIntent({ snapshotKind: 'warmup-cache' }),
              captureRenderCache: true,
              preserveRenderCacheTabIds: graphTabs.map(item => item && item.id).filter(Boolean),
              disableRenderCachePrune: true
            }));
          }
        } catch (err) {
          console.error('warmTabRenderCaches cache capture error', { tabId: tab.id, type: tab.type, err });
        }
        await awaitDelay(stepDelayMs);
        warmed += 1;
      }
      let finalTab = null;
      try {
        const finalActivation = activateTab(finalTabId, withSessionContext({
          reason: `${reasonBase}-finish`,
          silent: true
        }));
        if (finalActivation && typeof finalActivation.then === 'function') {
          const finalOutcome = await awaitWithTimeout(finalActivation, 15000, 'warmTabRenderCaches.finalActivate', {
            tabId: finalTabId,
            reason: `${reasonBase}-finish`
          });
          if (finalOutcome?.timedOut) {
            console.warn('warmTabRenderCaches final activate timeout', { tabId: finalTabId, reason: `${reasonBase}-finish` });
          }
        }
        finalTab = graphTabs.find(item => item && item.id === finalTabId) || null;
      } catch (err) {
        console.error('warmTabRenderCaches final-activate error', { tabId: finalTabId, err });
      }
      if (finalTab) {
        await awaitWorkspaceReadyForSnapshot(context, finalTab, { reason: `${reasonBase}-finish-ready` });
        try {
          if (typeof session.persistActiveTabState === 'function') {
            session.persistActiveTabState(finalTab, withSessionContext({
              reason: `${reasonBase}-finish-capture-cache`,
              origin: 'lifecycle',
              snapshotKind: 'warmup-cache',
              snapshotIntent: resolvePersistSnapshotIntent({ snapshotKind: 'warmup-cache' }),
              captureRenderCache: true,
              preserveRenderCacheTabIds: graphTabs.map(item => item && item.id).filter(Boolean),
              disableRenderCachePrune: true
            }));
          }
        } catch (err) {
          console.error('warmTabRenderCaches final cache capture error', { tabId: finalTab.id, type: finalTab.type, err });
        }
      }
      await awaitDelay(stepDelayMs);
    } finally {
      if (typeof session.setRenderCachePruneSuspended === 'function') {
        session.setRenderCachePruneSuspended(false);
      }
      if (overlayHandle && Shared?.loadingOverlay?.hide) {
        try {
          Shared.loadingOverlay.hide(overlayHandle, {
            reason: reasonBase,
            component: 'render-cache-warmup'
          });
        } catch (err) {
          console.error('warmTabRenderCaches overlay hide error', err);
        }
      }
    }
    debug(context, 'warmTabRenderCaches.complete', {
      warmed,
      tabCount: graphTabs.length,
      finalTabId,
      stepDelayMs,
      skippedColdComponents,
      overlayUsed: !!overlayHandle
    });
    return { warmed, reason: null, skippedColdComponents, overlayUsed: !!overlayHandle };
  }

  namespace.warmTabRenderCaches = warmTabRenderCaches;
  namespace.awaitWorkspaceReadyForSnapshot = awaitWorkspaceReadyForSnapshot;

  let pendingPostLoadWarmup = null;
  function schedulePostLoadWarmup(context, reason) {
    if (pendingPostLoadWarmup && pendingPostLoadWarmup.cancel) {
      try { pendingPostLoadWarmup.cancel(); } catch (err) { /* no-op */ }
    }
    const session = context?.session;
    if (!session || typeof session.getActiveTab !== 'function') {
      pendingPostLoadWarmup = null;
      return null;
    }
    let cancelled = false;
    let timerId = null;
    let resolveWarmup = null;
    const token = `post-load-warmup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const promise = new Promise(resolve => {
      resolveWarmup = resolve;
    });
    const finish = result => {
      if (pendingPostLoadWarmup?.token === token) {
        pendingPostLoadWarmup = null;
      }
      if (typeof resolveWarmup === 'function') {
        resolveWarmup(result || { ok: true, reason: 'post-load-warmup-complete' });
        resolveWarmup = null;
      }
    };
    const startup = async () => {
      if (cancelled) {
        finish({ ok: true, cancelled: true, reason: 'post-load-warmup-cancelled-before-start' });
        return;
      }
      // Resolve finalTabId at warmup START, not at schedule time. If the user clicked a
      // different tab during the 250 ms gap, we honour their navigation by warming around
      // their new selection. Tests can await this promise so the warmup does not race
      // against explicit tab-switch checks.
      const finalTabId = session.getActiveTab()?.id || null;
      if (!finalTabId) {
        finish({ ok: true, skipped: true, reason: 'post-load-warmup-no-final-tab' });
        return;
      }
      try {
        const result = await warmTabRenderCaches(context, {
          reason,
          finalTabId
        });
        finish({ ok: true, result, reason: 'post-load-warmup-complete' });
      } catch (err) {
        console.error('schedulePostLoadWarmup error', err);
        finish({ ok: false, error: err?.message || String(err), reason: 'post-load-warmup-error' });
      }
    };
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      timerId = window.setTimeout(startup, 250);
    } else {
      startup();
    }
    pendingPostLoadWarmup = {
      token,
      promise,
      cancel: () => {
        cancelled = true;
        if (timerId !== null && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          window.clearTimeout(timerId);
          timerId = null;
        }
        finish({ ok: true, cancelled: true, reason: 'post-load-warmup-cancelled' });
      }
    };
    return pendingPostLoadWarmup;
  }

  async function awaitPostLoadWarmup(options = {}) {
    const pending = pendingPostLoadWarmup;
    if (!pending || !pending.promise || typeof pending.promise.then !== 'function') {
      return { ok: true, skipped: true, reason: 'no-pending-post-load-warmup' };
    }
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : 60000;
    const outcome = await awaitWithTimeout(pending.promise, timeoutMs, 'awaitPostLoadWarmup', {
      reason: options.reason || 'await-post-load-warmup'
    });
    if (outcome?.timedOut) {
      return { ok: false, timedOut: true, reason: 'post-load-warmup-timeout', timeoutMs };
    }
    return outcome?.value || { ok: true, reason: 'post-load-warmup-complete' };
  }

  namespace.awaitPostLoadWarmup = awaitPostLoadWarmup;

  async function applyParsedSession(context, parsed, meta = {}) {
    if (!canLoadFile(context)) {
      throw new Error('Session load unavailable: missing applySessionData context.');
    }
    const { session, withSessionContext, hideDuplicatePrompt, renderTabs, activateTab, showGraphSelection, workspaceState } = context;
    const sessionPayload = parsed?.session;
    if (!sessionPayload || !Array.isArray(sessionPayload.tabs)) {
      throw new Error('Invalid parsed archive payload: missing tabs.');
    }
    const loadMode = meta.loadMode === 'append' ? 'append' : 'replace';
    const requestedScope = sessionPayload.scope === 'workspace' || sessionPayload.scope === 'tab'
      ? sessionPayload.scope
      : null;
    const parsedScope = requestedScope || (sessionPayload.tabs.length > 1 ? 'workspace' : (sessionPayload.tabs.length === 1 ? 'tab' : null));

    let payloadToApply = sessionPayload;
    let fileScope = parsedScope;
    let fileHandle = meta.fileHandle || null;
    let fileName = meta.fileName || '';
    let existingTabCount = 0;
    let addedTabCount = sessionPayload.tabs.length;

    if (loadMode === 'append') {
      const existingSnapshot = buildScopeSnapshot(context, 'workspace', {
        reason: meta.reason || 'graph-load-append-existing',
        snapshotKind: 'append-existing',
        captureRenderCache: true,
        preserveRenderCacheTabIds: getGraphTabsFromWorkspaceState(workspaceState).map(tab => tab && tab.id).filter(Boolean)
      });
      const existingTabs = Array.isArray(existingSnapshot?.tabs) ? existingSnapshot.tabs : [];
      existingTabCount = existingTabs.length;
      const incomingTabs = Array.isArray(sessionPayload.tabs) ? sessionPayload.tabs : [];
      const incomingActiveIndex = Number.isFinite(sessionPayload?.activeIndex)
        && sessionPayload.activeIndex >= 0
        && sessionPayload.activeIndex < incomingTabs.length
        ? sessionPayload.activeIndex
        : 0;
      addedTabCount = incomingTabs.length;
      const mergedTabs = [];
      existingTabs.forEach(tab => {
        mergedTabs.push({
          title: tab?.title || 'Workspace',
          type: tab?.type || tab?.payload?.type || null,
          payload: cloneWithSession(session, tab?.payload || null),
          layout: cloneWithSession(session, tab?.layout || null),
          previewMarkup: typeof tab?.previewMarkup === 'string' ? tab.previewMarkup : null,
          previewSignature: tab?.previewSignature || null,
          previewMeta: cloneWithSession(session, tab?.previewMeta || null),
          archiveRenderCache: cloneWithSession(session, tab?.archiveRenderCache || null),
          archiveRenderCacheSignature: tab?.archiveRenderCacheSignature || null,
          archiveRenderCacheLayoutSignature: tab?.archiveRenderCacheLayoutSignature || null,
          uiState: cloneWithSession(session, tab?.uiState || null)
        });
      });
      incomingTabs.forEach(tab => {
        mergedTabs.push({
          title: tab?.title || 'Workspace',
          type: tab?.type || tab?.payload?.type || null,
          payload: cloneWithSession(session, tab?.payload || null),
          layout: cloneWithSession(session, tab?.layout || null),
          previewMarkup: typeof tab?.previewMarkup === 'string' ? tab.previewMarkup : null,
          previewSignature: tab?.previewSignature || null,
          previewMeta: cloneWithSession(session, tab?.previewMeta || null),
          archiveRenderCache: cloneWithSession(session, tab?.archiveRenderCache || null),
          archiveRenderCacheSignature: tab?.archiveRenderCacheSignature || null,
          archiveRenderCacheLayoutSignature: tab?.archiveRenderCacheLayoutSignature || null,
          uiState: cloneWithSession(session, tab?.uiState || null)
        });
      });
      payloadToApply = {
        ...sessionPayload,
        activeIndex: existingTabs.length + incomingActiveIndex,
        tabs: mergedTabs,
        scope: 'workspace'
      };
      fileScope = 'workspace';
      fileHandle = null;
      fileName = '';
    }

    const loadOptions = withSessionContext({
      reason: meta.reason || 'graph-load',
      fileHandle,
      fileName,
      fileScope,
      hideDuplicatePrompt,
      renderTabs,
      activateTab,
      showGraphSelection
    });
    session.applySessionData(payloadToApply, loadOptions);
    if (loadMode === 'append') {
      if (workspaceState) {
        workspaceState.sessionFileHandle = null;
        workspaceState.sessionFileName = ensureGraphFileName(context, '', 'workspace.graph');
        workspaceState.sessionFileScope = 'workspace';
      }
      if (existingTabCount > 0 && typeof session.markSessionDirty === 'function') {
        session.markSessionDirty('graph-load-append', { existingTabCount, addedTabCount, origin: 'user' });
      }
    }
    debug(context, 'applyParsedSession.complete', {
      loadMode,
      scope: fileScope,
      existingTabCount,
      addedTabCount,
      tabCount: payloadToApply.tabs.length
    });
    if (meta.skipWarmup !== true && payloadToApply.tabs.length > 1) {
      schedulePostLoadWarmup(context, meta.reason || 'post-load-warmup');
    }
    return {
      status: 'loaded',
      scope: fileScope,
      tabCount: payloadToApply.tabs.length,
      source: parsed?.source || 'unknown',
      loadMode,
      addedTabCount
    };
  }

  namespace.loadWorkspaceFile = async function loadWorkspaceFile(context, file, meta = {}) {
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      throw new Error('Shared.graphArchive.parseFile is unavailable.');
    }
    const parsed = await graphArchive.parseFile(file, {
      fileName: meta.fileName || file?.name || ''
    });
    debug(context, 'loadWorkspaceFile.parsed', {
      source: parsed?.source || 'unknown',
      tabCount: parsed?.session?.tabs?.length || 0
    });
    return applyParsedSession(context, parsed, meta);
  };

  namespace.saveWorkspaceArchiveWithScope = async function saveWorkspaceArchiveWithScope(context, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const { session, workspaceState, sessionFileTypes } = context || {};
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!Shared?.fileIO || !graphArchive) {
      throw new Error('Save unavailable: missing Shared.fileIO or Shared.graphArchive.');
    }
    if (!session || !workspaceState) {
      throw new Error('Save unavailable: missing session context.');
    }

    const scope = options.scope === 'workspace' ? 'workspace' : 'tab';
    const rememberFile = options.rememberFile !== false;
    if (scope === 'workspace' && options.skipWarmup !== true) {
      try {
        await warmTabRenderCaches(context, { reason: 'pre-save-warmup' });
      } catch (err) {
        console.error('saveWorkspaceArchiveWithScope warmup error', err);
      }
    }
    try {
      const activeForSnapshot = typeof session.getActiveTab === 'function' ? session.getActiveTab() : null;
      if (activeForSnapshot && !activeForSnapshot.isWelcome && activeForSnapshot.type) {
        await awaitWorkspaceReadyForSnapshot(context, activeForSnapshot, { reason: 'pre-save-active-ready' });
      }
    } catch (err) {
      console.error('saveWorkspaceArchiveWithScope active ready error', err);
    }
    const snapshotKind = options.snapshotKind
      || (options.reason === 'autosave' ? 'autosave' : 'archive-save');
    const captureRenderCache = options.captureRenderCacheBeforeSnapshot !== false
      && snapshotKind !== 'autosave';
    const preserveRenderCacheTabIds = captureRenderCache
      ? getGraphTabsFromWorkspaceState(workspaceState).map(tab => tab && tab.id).filter(Boolean)
      : [session.getActiveTab?.()?.id || null].filter(Boolean);
    const snapshot = buildScopeSnapshot(context, scope, {
      ...options,
      snapshotKind,
      captureRenderCache,
      preserveRenderCacheTabIds
    });
    if (!snapshot || !Array.isArray(snapshot.tabs) || !snapshot.tabs.length) {
      debug(context, 'saveWorkspaceArchiveWithScope.skip', { scope, reason: 'no-tabs' });
      return { status: 'cancelled', reason: 'no-tabs' };
    }

    const fileName = resolveArchiveNameForScope(context, scope, options);
    let archiveBlobPromise = null;
    const getArchiveBlob = async () => {
      if (!archiveBlobPromise) {
        archiveBlobPromise = graphArchive.buildArchiveBlob({
          tabs: snapshot.tabs,
          activeIndex: snapshot.activeIndex,
          fileName,
          scope,
          compression: options.compression || 'STORE',
          payloadMode: options.payloadMode || 'full'
        }).then(blob => {
          debug(context, 'saveWorkspaceArchiveWithScope.archiveBuilt', {
            scope,
            tabCount: snapshot.tabs.length,
            bytes: blob?.size || 0,
            fileName
          });
          return blob;
        });
      }
      return archiveBlobPromise;
    };

    const canReuseHandle = !options.forcePicker
      && !!workspaceState.sessionFileHandle
      && workspaceState.sessionFileScope === scope;
    const saveFn = canReuseHandle
      ? Shared.fileIO.saveGraphFile
      : Shared.fileIO.saveGraphFileAs;
    const result = await saveFn({
      context: 'workspace',
      fileHandle: canReuseHandle ? workspaceState.sessionFileHandle : null,
      getPayload: getArchiveBlob,
      fileName,
      downloadFileName: fileName,
      fileTypes: sessionFileTypes,
      mimeType: 'application/zip',
      allowFallback: options.allowFallback !== false,
      setFileHandle: handle => {
        if (rememberFile) {
          workspaceState.sessionFileHandle = handle || null;
          workspaceState.sessionFilePath = handle?.__desktopFilePath || '';
          workspaceState.sessionFileScope = scope;
        }
        debug(context, 'save.handleStored', { hasHandle: !!handle, scope });
      },
      setFileName: name => {
        if (rememberFile) {
          workspaceState.sessionFileName = ensureGraphFileName(context, name || fileName, fileName);
          workspaceState.sessionFileScope = scope;
        }
        debug(context, 'save.fileNameStored', { name: rememberFile ? workspaceState.sessionFileName : name, scope, rememberFile });
      }
    });

    if (result && (result.status === 'saved' || result.status === 'downloaded')) {
      if (rememberFile && typeof session.clearSessionDirty === 'function') {
        session.clearSessionDirty('graph-save-success');
      }
      if (rememberFile) {
        workspaceState.sessionFileName = ensureGraphFileName(context, result.fileName || workspaceState.sessionFileName || fileName, fileName);
        workspaceState.sessionFilePath = result.filePath || workspaceState.sessionFileHandle?.__desktopFilePath || workspaceState.sessionFilePath || '';
        workspaceState.sessionFileScope = scope;
      }
      window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
        detail: {
          type: rememberFile ? 'saved' : 'saved-copy',
          dirty: rememberFile ? false : !!workspaceState.sessionUserDirty,
          userDirty: rememberFile ? false : !!workspaceState.sessionUserDirty,
          fileName: rememberFile ? workspaceState.sessionFileName : (result.fileName || fileName),
          filePath: rememberFile ? workspaceState.sessionFilePath : (result.filePath || ''),
          fileScope: scope,
          reason: options.reason || 'graph-save-success'
        }
      }));
    }

    debug(context, 'saveWorkspaceArchiveWithScope.result', {
      scope,
      status: result?.status || null,
      via: result?.via || null
    });
    return Object.assign({ scope }, result || {});
  };

  namespace.handleSessionSaveClick = async function handleSessionSaveClick(context, options = {}) {
    const scope = options.scope === 'tab' ? 'tab' : 'workspace';
    debug(context, 'handleSessionSaveClick.scope', { scope, explicit: options.scope || null });

    return namespace.saveWorkspaceArchiveWithScope(context, {
      ...options,
      scope
    });
  };

  namespace.handleSessionLoadClick = async function handleSessionLoadClick(context, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const { workspaceState, sessionFileTypes, dom } = context || {};
    if (!Shared?.fileIO || typeof Shared.fileIO.openGraphFile !== 'function') {
      console.warn('Load unavailable: missing Shared.fileIO.openGraphFile');
      dom?.sessionFileInput?.click?.();
      return { status: 'error', reason: 'no-open-handler' };
    }
    if (!confirmWorkspaceReplacement(context)) {
      return { status: 'cancelled', reason: 'replace-denied' };
    }

    let lastHandle = null;
    let lastName = '';
    try {
      const result = await Shared.fileIO.openGraphFile({
        context: 'workspace',
        setFileHandle: handle => {
          lastHandle = handle || null;
          workspaceState.sessionFileHandle = handle || null;
          workspaceState.sessionFilePath = handle?.__desktopFilePath || '';
          debug(context, 'load.handleCaptured', { hasHandle: !!handle });
        },
        setFileName: name => {
          lastName = String(name || '').trim();
          workspaceState.sessionFileName = lastName;
          debug(context, 'load.fileNameCaptured', { name: lastName });
        },
        fileTypes: sessionFileTypes,
        loadFromFile: async file => {
          await namespace.loadWorkspaceFile(context, file, {
            reason: options.reason || 'graph-load-picker',
            fileHandle: lastHandle,
            fileName: file?.name || lastName
          });
        },
        triggerInput: () => {
          if (dom?.sessionFileInput) {
            dom.sessionFileInput.value = '';
            dom.sessionFileInput.click();
          }
        }
      });
      debug(context, 'handleSessionLoadClick.result', {
        status: result?.status || null,
        via: result?.via || null
      });
      return result;
    } catch (err) {
      console.error('handleSessionLoadClick error', err);
      return { status: 'error', error: err };
    }
  };

  namespace.handleDesktopOpenFilePath = async function handleDesktopOpenFilePath(context, filePath, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const { workspaceState } = context || {};
    const normalizedPath = String(filePath || '').trim();
    if (!normalizedPath) {
      return { status: 'error', reason: 'missing-file-path' };
    }
    if (!Shared?.fileIO || typeof Shared.fileIO.openGraphFilePath !== 'function') {
      console.warn('Desktop file open unavailable: missing Shared.fileIO.openGraphFilePath');
      return { status: 'error', reason: 'no-desktop-path-open-handler' };
    }
    if (!confirmWorkspaceReplacement(context)) {
      return { status: 'cancelled', reason: 'replace-denied' };
    }

    let lastHandle = null;
    let lastName = '';
    try {
      const result = await Shared.fileIO.openGraphFilePath({
        context: 'desktop-file-association',
        filePath: normalizedPath,
        setFileHandle: handle => {
          lastHandle = handle || null;
          if (workspaceState) {
            workspaceState.sessionFileHandle = handle || null;
            workspaceState.sessionFilePath = handle?.__desktopFilePath || normalizedPath;
          }
          debug(context, 'desktopOpen.handleCaptured', { hasHandle: !!handle });
        },
        setFileName: name => {
          lastName = String(name || '').trim();
          if (workspaceState) {
            workspaceState.sessionFileName = lastName;
          }
          debug(context, 'desktopOpen.fileNameCaptured', { name: lastName });
        },
        loadFromFile: async file => {
          await namespace.loadWorkspaceFile(context, file, {
            reason: options.reason || 'desktop-file-association',
            fileHandle: lastHandle,
            fileName: file?.name || lastName,
            filePath: normalizedPath
          });
        }
      });
      debug(context, 'handleDesktopOpenFilePath.result', {
        status: result?.status || null,
        via: result?.via || null,
        filePath: normalizedPath
      });
      return result;
    } catch (err) {
      console.error('handleDesktopOpenFilePath error', { filePath: normalizedPath, err });
      return { status: 'error', filePath: normalizedPath, error: err };
    }
  };

  namespace.handleSessionInputChange = function handleSessionInputChange(context, event) {
    const { workspaceState } = context || {};
    const input = event?.target;
    const file = input?.files && input.files[0];
    if (!file) {
      debug(context, 'handleSessionInputChange.noFile');
      return;
    }
    if (!confirmWorkspaceReplacement(context)) {
      if (input) {
        input.value = '';
      }
      return;
    }
    workspaceState.sessionFileHandle = null;
    workspaceState.sessionFileName = String(file.name || '').trim();
    namespace.loadWorkspaceFile(context, file, {
      reason: 'graph-load-input',
      fileHandle: null,
      fileName: workspaceState.sessionFileName
    }).catch(err => {
      console.error('handleSessionInputChange load error', err);
    }).finally(() => {
      if (input) {
        input.value = '';
      }
    });
  };

  namespace.shouldWarnBeforeUnload = function shouldWarnBeforeUnload(context) {
    const { session, workspaceState, withSessionContext } = context || {};
    if (!session || !workspaceState || typeof withSessionContext !== 'function') {
      return false;
    }
    let persistedActive = false;
    try {
      const active = session.getActiveTab?.();
      if (active && !active.isWelcome) {
        persistedActive = !!session.persistActiveTabState(active, withSessionContext({
          reason: 'beforeunload',
          origin: 'lifecycle',
          snapshotKind: 'lifecycle-checkpoint',
          snapshotIntent: resolvePersistSnapshotIntent({ snapshotKind: 'lifecycle-checkpoint' }),
          captureRenderCache: false
        }));
      }
    } catch (err) {
      console.error('beforeunload persist error', err);
    }
    const hasData = typeof session.graphTabsHaveData === 'function'
      ? !!session.graphTabsHaveData()
      : getGraphTabsFromWorkspaceState(workspaceState).length > 0;
    const shouldWarn = !!workspaceState.sessionUserDirty && hasData;
    debug(context, 'shouldWarnBeforeUnload', {
      shouldWarn,
      dirty: !!workspaceState.sessionDirty,
      userDirty: !!workspaceState.sessionUserDirty,
      hasData,
      persistedActive
    });
    return shouldWarn;
  };

  namespace.buildWorkspaceArchiveBlob = async function buildWorkspaceArchiveBlob(context, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.buildArchiveBlob !== 'function') {
      throw new Error('Shared.graphArchive.buildArchiveBlob is unavailable.');
    }
    const snapshotScope = options.scope === 'tab' ? 'tab' : 'workspace';
    const snapshotKind = options.snapshotKind || 'document-snapshot';
    const preserveRenderCacheTabIds = getGraphTabsFromWorkspaceState(context?.workspaceState || null)
      .map(tab => tab && tab.id)
      .filter(Boolean);
    if (!preserveRenderCacheTabIds.length) {
      const activeId = context?.session?.getActiveTab?.()?.id || null;
      if (activeId) {
        preserveRenderCacheTabIds.push(activeId);
      }
    }
    const snapshot = buildScopeSnapshot(context, snapshotScope, {
      ...options,
      reason: options.reason || 'document-snapshot',
      snapshotKind,
      captureRenderCache: options.captureRenderCacheBeforeSnapshot !== false,
      preserveRenderCacheTabIds
    });
    if (!snapshot || !Array.isArray(snapshot.tabs) || !snapshot.tabs.length) {
      return null;
    }
    const fileName = resolveArchiveNameForScope(context, options.scope === 'tab' ? 'tab' : 'workspace', options);
    return graphArchive.buildArchiveBlob({
      tabs: snapshot.tabs,
      activeIndex: snapshot.activeIndex,
      fileName,
      scope: options.scope === 'tab' ? 'tab' : 'workspace',
      compression: options.compression || 'STORE',
      payloadMode: options.payloadMode || 'full',
      useWorker: options.useWorker !== false
    });
  };

  namespace.applyArchiveBlob = async function applyArchiveBlob(context, blob, meta = {}) {
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      throw new Error('Shared.graphArchive.parseFile is unavailable.');
    }
    const parsed = await graphArchive.parseFile(blob, {
      fileName: meta.fileName || blob?.name || 'recovered.graph'
    });
    return applyParsedSession(context, parsed, {
      ...meta,
      reason: meta.reason || 'recovery-restore',
      fileHandle: meta.fileHandle || null,
      fileName: meta.fileName || '',
      loadMode: meta.loadMode || 'replace',
      skipWarmup: meta.skipWarmup === true
    });
  };

  namespace.autosaveWorkspace = async function autosaveWorkspace(context, options = {}) {
    const { workspaceState, session } = context || {};
    if (!workspaceState || !session) {
      return { status: 'error', reason: 'missing-context' };
    }
    if (!workspaceState.sessionUserDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const handle = workspaceState.sessionFileHandle;
    if (handle?.__desktopFilePath) {
      return namespace.saveWorkspaceArchiveWithScope(context, {
        ...options,
        reason: options.reason || 'autosave',
        snapshotKind: 'autosave',
        captureRenderCacheBeforeSnapshot: false,
        scope: workspaceState.sessionFileScope === 'tab' ? 'tab' : 'workspace',
        forcePicker: false,
        allowFallback: false
      });
    }
    if (handle && typeof handle.queryPermission === 'function') {
      try {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          return namespace.saveWorkspaceArchiveWithScope(context, {
            ...options,
            reason: options.reason || 'autosave',
            snapshotKind: 'autosave',
            captureRenderCacheBeforeSnapshot: false,
            scope: workspaceState.sessionFileScope === 'tab' ? 'tab' : 'workspace',
            forcePicker: false,
            allowFallback: false
          });
        }
      } catch (err) {
        debug(context, 'autosaveWorkspace.permissionCheckFailed', { message: err?.message || String(err) });
      }
    }
    return { status: 'skipped', reason: 'no-file-target' };
  };

  console.debug('Debug: sessionActions.js wiring complete', { exports: Object.keys(namespace) });
})();
