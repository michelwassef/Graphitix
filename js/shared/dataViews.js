(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const dataViews = Shared.dataViews = Shared.dataViews || {};
  const VERSION = 1;
  const DEFAULT_MAX_VIEWS = 12;

  function debugLog(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: dataViews ' + message, payload || {});
    }
  }

  function nowMs(){
    if(global.performance && typeof global.performance.now === 'function'){
      return global.performance.now();
    }
    return Date.now();
  }

  function shapeOfMatrix(matrix){
    if(Shared.dataTransforms && typeof Shared.dataTransforms.matrixShape === 'function'){
      return Shared.dataTransforms.matrixShape(matrix);
    }
    if(!Array.isArray(matrix)){
      return { rows: 0, cols: 0 };
    }
    let cols = 0;
    for(let i = 0; i < matrix.length; i += 1){
      const row = matrix[i];
      if(Array.isArray(row) && row.length > cols){
        cols = row.length;
      }
    }
    return { rows: matrix.length, cols };
  }

  function cloneSimple(value){
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      return value;
    }
  }

  function truncateLabel(label, maxLength){
    const text = String(label || '').trim();
    const limit = Number.isFinite(maxLength) ? Math.max(8, Math.floor(maxLength)) : 40;
    if(text.length <= limit){
      return text;
    }
    return `${text.slice(0, Math.max(4, limit - 3))}...`;
  }

  function normalizeTitle(value, fallback){
    const text = String(value || '').trim();
    return text || fallback;
  }

  function nextDerivedTitle(views){
    let count = 1;
    const source = Array.isArray(views) ? views : [];
    for(let i = 0; i < source.length; i += 1){
      const view = source[i];
      if(view && view.kind === 'derived'){
        count += 1;
      }
    }
    return `Derived ${count}`;
  }

  function normalizeViewRecord(input, fallbackKind){
    const source = input && typeof input === 'object' ? input : {};
    const kind = source.kind === 'raw' ? 'raw' : (fallbackKind === 'raw' ? 'raw' : 'derived');
    const id = kind === 'raw' ? 'raw' : String(source.id || '').trim();
    return {
      id: id || null,
      kind,
      title: normalizeTitle(source.title, kind === 'raw' ? 'Raw' : 'Derived'),
      data: Array.isArray(source.data) ? source.data : [],
      sourceViewId: source.sourceViewId == null ? null : String(source.sourceViewId),
      transformSpec: source.transformSpec || null,
      summary: source.summary || null,
      exclusions: source.exclusions || null,
      createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : nowMs()
    };
  }

  function defaultLabelForTransform(spec){
    const normalized = Shared.dataTransforms?.normalizeTransformSpec
      ? Shared.dataTransforms.normalizeTransformSpec(spec)
      : (spec || {});
    const type = String(normalized.type || '').toLowerCase();
    if(type === 'cpm'){ return 'CPM'; }
    if(type === 'log'){
      const base = Number(normalized.base) || 2;
      const pseudo = Number(normalized.pseudoCount) || 0;
      if(pseudo === 1){
        return `log${base}(x+1)`;
      }
      if(pseudo){
        return `log${base}(x+${pseudo})`;
      }
      return `log${base}(x)`;
    }
    if(type === 'scale'){
      return `x*${normalized.factor}`;
    }
    if(type === 'divide'){
      return `x/${normalized.divisor}`;
    }
    if(type === 'add'){
      return `x+${normalized.value}`;
    }
    if(type === 'subtract'){
      return `x-${normalized.value}`;
    }
    if(type === 'custom'){
      return truncateLabel(normalized.expression, 28);
    }
    if(type === 'centerrows'){
      return normalized.method === 'median' ? 'Center rows (median)' : 'Center rows (mean)';
    }
    if(type === 'centercolumns'){
      return normalized.method === 'median' ? 'Center cols (median)' : 'Center cols (mean)';
    }
    if(type === 'normalizerows'){ return 'Normalize Rows'; }
    if(type === 'normalizecolumns'){ return 'Normalize Columns'; }
    return type || 'Derived';
  }

  function defaultLabelForPipeline(specs){
    const source = Array.isArray(specs) ? specs : [];
    const labels = source
      .map(spec => defaultLabelForTransform(spec))
      .filter(label => typeof label === 'string' && label.trim().length > 0);
    if(!labels.length){
      return 'Pipeline';
    }
    const joined = labels.join(' + ');
    return joined.length > 64 ? `${joined.slice(0, 61)}...` : joined;
  }

  function createManager(options){
    const settings = options && typeof options === 'object' ? options : {};
    const componentKey = String(settings.componentKey || '').trim();
    const maxViews = Math.max(2, Number(settings.maxViews) || DEFAULT_MAX_VIEWS);
    const onActiveViewChanged = typeof settings.onActiveViewChanged === 'function'
      ? settings.onActiveViewChanged
      : null;
    const onViewsChanged = typeof settings.onViewsChanged === 'function'
      ? settings.onViewsChanged
      : null;
    const onInteraction = typeof settings.onInteraction === 'function'
      ? settings.onInteraction
      : null;

    let mounted = null;
    let views = [];
    let activeViewId = 'raw';
    let nextIdCounter = 1;
    let inActiveCallback = false;

    const manager = {};

    function findViewIndex(viewId){
      const id = String(viewId || '').trim();
      if(!id){
        return -1;
      }
      for(let i = 0; i < views.length; i += 1){
        if(views[i]?.id === id){
          return i;
        }
      }
      return -1;
    }

    function getView(viewId){
      const targetId = viewId == null ? activeViewId : viewId;
      const index = findViewIndex(targetId);
      if(index < 0){
        return null;
      }
      return views[index];
    }

    function emitViewsChanged(reason){
      if(!onViewsChanged){
        return;
      }
      try{
        onViewsChanged({
          reason: reason || 'unknown',
          activeViewId,
          viewCount: views.length,
          views: views.map(view => ({
            id: view.id,
            kind: view.kind,
            title: view.title,
            summary: view.summary || null,
            sourceViewId: view.sourceViewId || null,
            shape: shapeOfMatrix(view.data)
          }))
        });
      }catch(err){
        debugLog('views changed callback failed', { message: err?.message || String(err) });
      }
    }

    function emitActiveChanged(reason, previousViewId){
      if(!onActiveViewChanged || inActiveCallback){
        return;
      }
      const active = getView(activeViewId);
      if(!active){
        return;
      }
      inActiveCallback = true;
      try{
        onActiveViewChanged(active, {
          reason: reason || 'activate',
          previousViewId: previousViewId || null,
          componentKey
        });
      }catch(err){
        debugLog('active view callback failed', { message: err?.message || String(err) });
      }finally{
        inActiveCallback = false;
      }
    }

    function buildViewId(){
      nextIdCounter += 1;
      return `view-${nextIdCounter}`;
    }

    function ensureRawView(rawData){
      if(views.length){
        const first = views[0];
        if(first && first.kind === 'raw'){
          if(Array.isArray(rawData)){
            first.data = rawData;
          }
          if(!first.id){
            first.id = 'raw';
          }
          return first;
        }
      }
      const raw = {
        id: 'raw',
        kind: 'raw',
        title: 'Raw',
        data: Array.isArray(rawData) ? rawData : [],
        sourceViewId: null,
        transformSpec: null,
        summary: null,
        exclusions: null,
        createdAt: nowMs()
      };
      views.unshift(raw);
      return raw;
    }

    function toSerializableRecord(view){
      return {
        id: view.id,
        kind: view.kind,
        title: view.title,
        data: view.data,
        sourceViewId: view.sourceViewId || null,
        transformSpec: view.transformSpec || null,
        summary: view.summary || null,
        exclusions: view.exclusions || null,
        createdAt: view.createdAt
      };
    }

    function renderTabs(){
      if(!mounted?.tabs){
        return;
      }
      const tabs = mounted.tabs;
      while(tabs.firstChild){
        tabs.removeChild(tabs.firstChild);
      }
      const doc = tabs.ownerDocument || global.document;
      views.forEach(view => {
        const item = doc.createElement('div');
        item.className = 'data-view-tabs__item';
        if(view.id === activeViewId){
          item.classList.add('data-view-tabs__item--active');
        }

        const tab = doc.createElement('button');
        tab.type = 'button';
        tab.className = 'data-view-tabs__tab';
        if(view.id === activeViewId){
          tab.classList.add('data-view-tabs__tab--active');
        }
        tab.dataset.viewId = view.id;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', view.id === activeViewId ? 'true' : 'false');
        tab.textContent = view.title;
        if(view.summary?.transform){
          tab.title = `${view.title} (${view.summary.transform})`;
        }else{
          tab.title = view.title;
        }
        item.appendChild(tab);

        if(view.kind !== 'raw'){
          const close = doc.createElement('button');
          close.type = 'button';
          close.className = 'data-view-tabs__close';
          close.dataset.viewId = view.id;
          close.setAttribute('aria-label', `Close ${view.title}`);
          close.textContent = '\u00D7';
          item.appendChild(close);
        }
        tabs.appendChild(item);
      });
    }

    function pruneToMaxViews(){
      if(views.length < maxViews){
        return;
      }
      let candidateIndex = -1;
      let candidateTime = Number.POSITIVE_INFINITY;
      for(let i = 0; i < views.length; i += 1){
        const view = views[i];
        if(!view || view.kind !== 'derived'){
          continue;
        }
        if(view.id === activeViewId){
          continue;
        }
        const createdAt = Number.isFinite(Number(view.createdAt)) ? Number(view.createdAt) : Number.POSITIVE_INFINITY;
        if(createdAt < candidateTime){
          candidateTime = createdAt;
          candidateIndex = i;
        }
      }
      if(candidateIndex < 0){
        for(let i = 0; i < views.length; i += 1){
          const view = views[i];
          if(!view || view.kind !== 'derived'){
            continue;
          }
          const createdAt = Number.isFinite(Number(view.createdAt)) ? Number(view.createdAt) : Number.POSITIVE_INFINITY;
          if(createdAt < candidateTime){
            candidateTime = createdAt;
            candidateIndex = i;
          }
        }
      }
      if(candidateIndex >= 0){
        const removed = views.splice(candidateIndex, 1)[0];
        if(removed?.id && removed.id === activeViewId){
          activeViewId = 'raw';
        }
        debugLog('derived view evicted', { id: removed?.id, title: removed?.title, maxViews });
      }
    }

    function mount(params){
      const wrapper = params?.wrapper || null;
      const tableContainer = params?.tableContainer || null;
      if(!wrapper || !tableContainer){
        return false;
      }
      if(mounted && mounted.wrapper === wrapper && mounted.tableContainer === tableContainer){
        renderTabs();
        return true;
      }
      manager.unmount();
      const existingOwner = wrapper.__dataViewsOwner || null;
      if(existingOwner && existingOwner !== manager && typeof existingOwner.unmount === 'function'){
        existingOwner.unmount();
      }
      const doc = wrapper.ownerDocument || global.document;
      const tabs = doc.createElement('div');
      tabs.className = 'data-view-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Input data views');
      tabs.dataset.componentKey = componentKey || '';

      const clickHandler = event => {
        const closeButton = event.target?.closest?.('.data-view-tabs__close[data-view-id]');
        if(closeButton){
          event.preventDefault();
          event.stopPropagation();
          const viewId = closeButton.dataset.viewId || '';
          manager.removeView(viewId, { reason: 'tab-close' });
          if(onInteraction){
            onInteraction({ reason: 'tab-close', viewId });
          }
          return;
        }
        const tabButton = event.target?.closest?.('.data-view-tabs__tab[data-view-id]');
        if(!tabButton){
          return;
        }
        const viewId = tabButton.dataset.viewId || '';
        if(!viewId){
          return;
        }
        manager.activateView(viewId, { reason: 'tab-click' });
        if(onInteraction){
          onInteraction({ reason: 'tab-click', viewId });
        }
      };

      tabs.addEventListener('click', clickHandler);
      if(tableContainer.parentNode !== wrapper){
        wrapper.appendChild(tableContainer);
      }
      wrapper.insertBefore(tabs, tableContainer);
      wrapper.classList.add('data-view-host');
      tableContainer.classList.add('data-view-host__table');
      wrapper.__dataViewsOwner = manager;
      mounted = {
        wrapper,
        tableContainer,
        tabs,
        clickHandler
      };
      renderTabs();
      return true;
    }

    function unmount(){
      if(!mounted){
        return;
      }
      const { wrapper, tableContainer, tabs, clickHandler } = mounted;
      if(tabs && clickHandler){
        tabs.removeEventListener('click', clickHandler);
      }
      if(tabs && tabs.parentNode){
        tabs.parentNode.removeChild(tabs);
      }
      wrapper?.classList?.remove('data-view-host');
      tableContainer?.classList?.remove('data-view-host__table');
      if(wrapper && wrapper.__dataViewsOwner === manager){
        delete wrapper.__dataViewsOwner;
      }
      mounted = null;
    }

    function initialize(rawData, options){
      const rawTitle = normalizeTitle(options?.rawTitle, 'Raw');
      views = [{
        id: 'raw',
        kind: 'raw',
        title: rawTitle,
        data: Array.isArray(rawData) ? rawData : [],
        sourceViewId: null,
        transformSpec: null,
        summary: null,
        exclusions: null,
        createdAt: nowMs()
      }];
      activeViewId = 'raw';
      nextIdCounter = 1;
      renderTabs();
      emitViewsChanged('initialize');
      return views[0];
    }

    function activateView(viewId, options){
      const targetId = String(viewId || '').trim();
      const next = getView(targetId);
      if(!next){
        return null;
      }
      const previous = activeViewId;
      activeViewId = next.id;
      renderTabs();
      emitViewsChanged('activate');
      if(options?.silent !== true && previous !== activeViewId){
        emitActiveChanged(options?.reason || 'activate', previous);
      }
      return next;
    }

    function updateActiveData(data, options){
      const active = getView(activeViewId);
      if(!active){
        return false;
      }
      active.data = Array.isArray(data) ? data : [];
      if(options && Object.prototype.hasOwnProperty.call(options, 'summary')){
        active.summary = options.summary || null;
      }
      return true;
    }

    function updateActiveExclusions(exclusions){
      const active = getView(activeViewId);
      if(!active){
        return false;
      }
      active.exclusions = exclusions || null;
      return true;
    }

    function createDerivedView(params){
      const source = params && typeof params === 'object' ? params : {};
      const data = Array.isArray(source.data) ? source.data : [];
      pruneToMaxViews();
      const record = {
        id: buildViewId(),
        kind: 'derived',
        title: normalizeTitle(source.title, nextDerivedTitle(views)),
        data,
        sourceViewId: source.sourceViewId == null ? activeViewId : String(source.sourceViewId),
        transformSpec: source.transformSpec || null,
        summary: source.summary || null,
        exclusions: source.exclusions || null,
        createdAt: nowMs()
      };
      views.push(record);
      renderTabs();
      emitViewsChanged('create-derived');
      if(source.activate !== false){
        activateView(record.id, { reason: source.reason || 'create-derived' });
      }
      return record;
    }

    function removeView(viewId, options){
      const index = findViewIndex(viewId);
      if(index < 0){
        return false;
      }
      const target = views[index];
      if(!target || target.kind === 'raw'){
        return false;
      }
      const wasActive = target.id === activeViewId;
      views.splice(index, 1);
      if(wasActive){
        activeViewId = 'raw';
      }
      renderTabs();
      emitViewsChanged(options?.reason || 'remove');
      if(wasActive && options?.silent !== true){
        emitActiveChanged(options?.reason || 'remove', target.id);
      }
      return true;
    }

    function applyTransform(transformSpec, options){
      const sourceView = getView(options?.sourceViewId || activeViewId);
      if(!sourceView){
        return { ok: false, error: 'No source view selected.' };
      }
      const transformsApi = Shared.dataTransforms;
      if(!transformsApi || typeof transformsApi.applyTransform !== 'function'){
        return { ok: false, error: 'Shared.dataTransforms.applyTransform is unavailable.' };
      }
      const transformResult = transformsApi.applyTransform(
        sourceView.data,
        transformSpec,
        options?.transformOptions || {}
      );
      if(!transformResult?.ok){
        return { ok: false, error: transformResult?.error || 'Transform failed.', result: transformResult || null };
      }
      const title = normalizeTitle(options?.title, defaultLabelForTransform(transformResult.spec));
      const view = createDerivedView({
        title,
        data: transformResult.data,
        sourceViewId: sourceView.id,
        transformSpec: transformResult.spec,
        summary: transformResult.summary || null,
        activate: options?.activate !== false,
        reason: options?.reason || 'transform'
      });
      return {
        ok: true,
        view,
        result: transformResult
      };
    }

    function applyPipeline(transformSpecs, options){
      const sourceView = getView(options?.sourceViewId || activeViewId);
      if(!sourceView){
        return { ok: false, error: 'No source view selected.' };
      }
      const transformsApi = Shared.dataTransforms;
      if(!transformsApi || typeof transformsApi.applyPipeline !== 'function'){
        return { ok: false, error: 'Shared.dataTransforms.applyPipeline is unavailable.' };
      }
      const pipelineResult = transformsApi.applyPipeline(
        sourceView.data,
        Array.isArray(transformSpecs) ? transformSpecs : [],
        options?.transformOptions || {}
      );
      if(!pipelineResult?.ok){
        const failedStep = Array.isArray(pipelineResult?.steps) ? pipelineResult.steps.find(step => step && step.ok === false) : null;
        return {
          ok: false,
          error: failedStep?.error || 'Pipeline transform failed.',
          result: pipelineResult || null
        };
      }
      const steps = Array.isArray(pipelineResult.steps) ? pipelineResult.steps : [];
      const normalizedSpecs = steps.map(step => step?.spec).filter(Boolean);
      const finalStep = steps.length ? steps[steps.length - 1] : null;
      const title = normalizeTitle(options?.title, defaultLabelForPipeline(normalizedSpecs));
      const summary = {
        transform: 'pipeline',
        steps: normalizedSpecs.map(spec => defaultLabelForTransform(spec)),
        stepCount: normalizedSpecs.length,
        rows: shapeOfMatrix(pipelineResult.data).rows,
        cols: shapeOfMatrix(pipelineResult.data).cols,
        changedCells: Number(finalStep?.summary?.changedCells) || 0,
        numericCells: Number(finalStep?.summary?.numericCells) || 0,
        skippedCells: Number(finalStep?.summary?.skippedCells) || 0,
        warnings: steps.reduce((acc, step) => {
          if(Array.isArray(step?.warnings)){
            return acc.concat(step.warnings);
          }
          if(Array.isArray(step?.summary?.warnings)){
            return acc.concat(step.summary.warnings);
          }
          return acc;
        }, []).slice(0, 8)
      };
      const view = createDerivedView({
        title,
        data: pipelineResult.data,
        sourceViewId: sourceView.id,
        transformSpec: {
          type: 'pipeline',
          specs: normalizedSpecs
        },
        summary,
        activate: options?.activate !== false,
        reason: options?.reason || 'pipeline'
      });
      return {
        ok: true,
        view,
        result: pipelineResult
      };
    }

    function serialize(options){
      const includeData = options?.includeData !== false;
      return {
        version: VERSION,
        activeViewId,
        views: views.map(view => {
          const record = {
            id: view.id,
            kind: view.kind,
            title: view.title,
            sourceViewId: view.sourceViewId || null,
            transformSpec: view.transformSpec || null,
            summary: view.summary || null,
            exclusions: view.exclusions || null,
            createdAt: view.createdAt
          };
          if(includeData){
            record.data = view.data;
          }
          return record;
        })
      };
    }

    function deserialize(payload, options){
      const source = payload && typeof payload === 'object' ? payload : null;
      const incomingViews = Array.isArray(source?.views) ? source.views : [];
      const fallbackData = Array.isArray(options?.fallbackData) ? options.fallbackData : [];

      if(!incomingViews.length){
        initialize(fallbackData, { rawTitle: options?.rawTitle || 'Raw' });
        return false;
      }

      const restored = [];
      let hasRaw = false;
      let localCounter = 1;
      for(let i = 0; i < incomingViews.length; i += 1){
        const isRaw = !hasRaw && (
          incomingViews[i]?.kind === 'raw'
          || String(incomingViews[i]?.id || '').trim().toLowerCase() === 'raw'
          || i === 0
        );
        const normalized = normalizeViewRecord(incomingViews[i], isRaw ? 'raw' : 'derived');
        if(normalized.kind === 'raw'){
          normalized.id = 'raw';
          hasRaw = true;
        }else{
          normalized.id = normalized.id || `view-${i + 2}`;
          const match = normalized.id.match(/^view-(\d+)$/);
          if(match){
            const numericId = Number(match[1]);
            if(Number.isFinite(numericId) && numericId > localCounter){
              localCounter = numericId;
            }
          }
        }
        restored.push(normalized);
      }

      if(!hasRaw){
        restored.unshift({
          id: 'raw',
          kind: 'raw',
          title: normalizeTitle(options?.rawTitle, 'Raw'),
          data: fallbackData,
          sourceViewId: null,
          transformSpec: null,
          summary: null,
          exclusions: null,
          createdAt: nowMs()
        });
      }

      views = restored;
      ensureRawView(fallbackData);
      nextIdCounter = Math.max(1, localCounter);
      const requestedActive = String(options?.activeViewId || source?.activeViewId || 'raw').trim();
      activeViewId = findViewIndex(requestedActive) >= 0 ? requestedActive : 'raw';
      renderTabs();
      emitViewsChanged('deserialize');
      if(options?.silent !== true && options?.activate !== false){
        emitActiveChanged('deserialize', null);
      }
      return true;
    }

    function getViews(){
      return views.map(view => toSerializableRecord(view));
    }

    manager.mount = mount;
    manager.unmount = unmount;
    manager.initialize = initialize;
    manager.ensureRawView = ensureRawView;
    manager.activateView = activateView;
    manager.getActiveView = () => getView(activeViewId);
    manager.getActiveViewId = () => activeViewId;
    manager.getView = getView;
    manager.getViews = getViews;
    manager.updateActiveData = updateActiveData;
    manager.updateActiveExclusions = updateActiveExclusions;
    manager.createDerivedView = createDerivedView;
    manager.removeView = removeView;
    manager.applyTransform = applyTransform;
    manager.applyPipeline = applyPipeline;
    manager.serialize = serialize;
    manager.deserialize = deserialize;
    manager.defaultLabelForTransform = defaultLabelForTransform;
    manager.refresh = renderTabs;
    manager.destroy = function destroy(){
      manager.unmount();
      views = [];
      activeViewId = 'raw';
    };

    if(Array.isArray(settings.initialViews) && settings.initialViews.length){
      manager.deserialize({
        version: VERSION,
        activeViewId: settings.initialActiveViewId || 'raw',
        views: cloneSimple(settings.initialViews)
      }, {
        fallbackData: settings.fallbackData || [],
        silent: true,
        activate: false
      });
    }else{
      manager.initialize(Array.isArray(settings.initialData) ? settings.initialData : [], {
        rawTitle: settings.rawTitle || 'Raw'
      });
    }

    debugLog('manager created', { componentKey, views: views.length, maxViews });
    return manager;
  }

  dataViews.createManager = createManager;
  dataViews.VERSION = VERSION;
})(window);
