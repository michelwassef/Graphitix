(function() {
  'use strict';
  const Main = window.Main = window.Main || {};
  const api = Main.workspacePresentation = {};
  const history = new Map();
  const MESSAGE_THRESHOLD_MS = 120;
  const MAX_HISTORY = 64;
  let presentation = null;

  // Predictions contain workload metadata only. Never retain a payload, root,
  // session or tab in timing history, and never use a prediction for readiness.
  api.predict = function predict(tab, plan = {}) {
    const data = tab.payload?.data;
    const views = tab.payload?.dataViews;
    const activeData = views?.views?.find(view => view.id === views.activeViewId)?.data;
    const rows = Array.isArray(activeData) ? activeData
      : (Array.isArray(data) ? data : (Array.isArray(data?.table) ? data.table : []));
    const sampled = rows.slice(0, 64);
    const columns = Math.max(1, ...sampled.map(row => Array.isArray(row) ? row.length : 1));
    const cells = rows.length * columns;
    const path = plan.restoreRenderCache ? 'cache' : 'draw';
    const preparedBytes = Math.max(0, Number(plan.preparedBytes) || 0);
    const size = cells >= 20000 || preparedBytes >= 8 * 1024 * 1024 ? 'large'
      : (cells >= 2000 || preparedBytes >= 1024 * 1024 ? 'medium' : 'small');
    const key = [tab.type, path, size, !!plan.bundleRequired, !!plan.prepared].join(':');
    let estimateMs;
    if (plan.bundleRequired) estimateMs = 250;
    // Cached graph fragments do not contain the interactive grid. Grid
    // reconstruction remains synchronous on first activation. Its cost scales
    // with rows as well as cells: the profiled 100-row tables exceeded the
    // paint-yield threshold even at only two columns.
    else if (path === 'cache') {
      const gridWorkMs = Math.max(cells / 10, rows.length * 1.5);
      estimateMs = (plan.prepared ? 25 : 60) + gridWorkMs + preparedBytes / 131072;
    }
    else estimateMs = cells ? 150 + cells / 100 : 30;
    const learned = history.get(key);
    if (learned !== undefined) estimateMs = Math.max(estimateMs, learned);
    return { key, path, size, estimateMs, showMessage: estimateMs >= MESSAGE_THRESHOLD_MS };
  };

  function refreshTabs() {
    Main.tabs?.renderTabs?.();
  }

  function releaseRoot(item) {
    item.cancelPaint?.();
    if (!item.root) return;
    item.root.classList.remove('workspace-restoring');
    if (item.busy === null) item.root.removeAttribute('aria-busy');
    else item.root.setAttribute('aria-busy', item.busy);
    item.root.inert = item.inert;
    item.root = null;
  }

  // This is a visual copy, never a mounted component or a cache/state source.
  // Shadow DOM keeps every copied id, control and grid outside document queries.
  // Copy only the displayed subtree, not the eleven inactive workspace templates.
  function retainView(source, host) {
    if (!source || !host?.contains(source)) return null;
    const viewport = document.createElement('div');
    viewport.className = 'workspace-restore-preview';
    viewport.inert = true;
    viewport.setAttribute('aria-hidden', 'true');
    const shadow = viewport.attachShadow({ mode: 'open' });
    for (const sheet of document.styleSheets) {
      const style = document.createElement('style');
      style.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
      shadow.append(style);
    }
    const copy = source.cloneNode(true);
    const originals = [source, ...source.querySelectorAll('*')];
    const copies = [copy, ...copy.querySelectorAll('*')];
    const positions = originals.map(node => [node.scrollTop, node.scrollLeft]);
    originals.forEach((node, index) => {
      const clone = copies[index];
      for (const attr of Array.from(clone.attributes)) {
        if (/^on/i.test(attr.name) || attr.name === 'autofocus') clone.removeAttribute(attr.name);
      }
      if (node.tagName === 'INPUT' && node.type !== 'file') {
        clone.value = node.value;
        clone.checked = node.checked;
        clone.indeterminate = node.indeterminate;
      } else if (node.tagName === 'TEXTAREA') clone.value = node.value;
      else if (node.tagName === 'OPTION') clone.selected = node.selected;
      if (node.tagName === 'CANVAS' && node.width && node.height) {
        clone.getContext('2d')?.drawImage(node, 0, 0);
      }
    });
    copy.querySelectorAll('script').forEach(node => node.remove());
    let branch = copy;
    for (let parent = source.parentElement; parent; parent = parent.parentElement) {
      const frame = parent.cloneNode(false);
      frame.append(branch);
      branch = frame;
      if (parent === host.parentElement) break;
    }
    shadow.append(branch);
    return { viewport, restoreScroll() {
      positions.forEach(([top, left], index) => {
        copies[index].scrollTop = top;
        copies[index].scrollLeft = left;
      });
    } };
  }

  api.stage = function stage(tab, options = {}) {
    if (presentation?.tab === tab) return;
    const previous = presentation;
    const state = Main.session?.workspaceState;
    const cold = tab.loadedFromArchive === true && !state?.loadedWorkspaces?.[tab.id];
    if (!cold) { api.cancel(); return; }
    const host = options.host || document.getElementById('workspaceMain');
    if (!host) return;
    // During rapid switches the last committed view is still the one on screen.
    // Transfer that surface, not the partially restored intermediate destination.
    const retained = previous?.retained || retainView(options.source
      || Array.from(host.querySelectorAll('.workspace-page, #welcomeScreen'))
        .find(root => !root.hidden && getComputedStyle(root).display !== 'none'), host);
    const displayedTab = previous?.displayedTab || options.previousTab || null;
    if (previous) releaseRoot(previous);
    const surface = previous?.surface || document.createElement('div');
    surface.className = 'workspace-restore-status';
    const message = previous?.message || document.createElement('div');
    message.className = 'workspace-restore-message';
    message.setAttribute('role', 'status');
    message.textContent = '';
    message.hidden = true;
    if (retained && !retained.viewport.isConnected) surface.append(retained.viewport);
    if (!message.isConnected) surface.append(message);
    if (!surface.isConnected) host.append(surface);
    retained?.restoreScroll();
    presentation = { tab, displayedTab, surface, retained, message, root: null };
  };

  api.getDisplayedTabId = function getDisplayedTabId(state) {
    return presentation?.retained && state.tabs.includes(presentation.displayedTab)
      ? presentation.displayedTab.id : state.activeTabId;
  };

  api.beginActivation = function beginActivation(tab, root, plan = {}) {
    api.stage(tab, { host: root.parentElement });
    if (!presentation || presentation.tab !== tab) return () => {};
    releaseRoot(presentation);
    // Every activation receives a new identity, including ABA/restarts for one tab.
    const item = { ...presentation };
    presentation = item;
    item.root = root;
    item.busy = root.getAttribute('aria-busy');
    item.inert = root.inert;
    root.classList.add('workspace-restoring');
    root.setAttribute('aria-busy', 'true');
    root.inert = true;
    item.prediction = api.predict(tab, plan);
    item.started = performance.now();
    item.message.textContent = item.prediction.showMessage ? `Restoring ${tab.title || 'workspace'}…` : '';
    item.message.setAttribute('role', 'status');
    item.message.hidden = !item.prediction.showMessage;
    refreshTabs();
    return (message, options = {}) => {
      if (presentation !== item) return;
      if (message) {
        item.message.textContent = message;
        item.message.hidden = false;
        item.message.setAttribute('role', 'alert');
        return;
      }
      if (options.retainPresentation === true) {
        releaseRoot(item);
        presentation = { ...item, root: null };
        return;
      }
      if (options.completed === true) {
        const elapsed = performance.now() - item.started;
        const old = history.get(item.prediction.key);
        history.delete(item.prediction.key);
        history.set(item.prediction.key, old === undefined ? elapsed : old * 0.5 + elapsed * 0.5);
        if (history.size > MAX_HISTORY) history.delete(history.keys().next().value);
      }
      api.cancel();
    };
  };

  // Let an immediate message reach the screen before synchronous grid/graph
  // construction can occupy the main thread. Fast paths do not yield. This is
  // a paint opportunity, not a time delay or a minimum message duration.
  api.run = function run(tab, activate) {
    const item = presentation;
    if (item?.tab !== tab || !item.prediction?.showMessage || document.hidden
      || typeof window.requestAnimationFrame !== 'function') return activate();
    return new Promise(resolve => {
      let frame;
      const clear = () => {
        window.cancelAnimationFrame(frame);
        document.removeEventListener('visibilitychange', onVisibility);
        item.cancelPaint = null;
      };
      const proceed = () => {
        clear();
        resolve(presentation === item ? Promise.resolve().then(activate) : false);
      };
      const onVisibility = () => { if (document.hidden) proceed(); };
      item.cancelPaint = () => { clear(); resolve(false); };
      document.addEventListener('visibilitychange', onVisibility);
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(proceed);
      });
    });
  };

  api.cancel = function cancel() {
    if (!presentation) return;
    releaseRoot(presentation);
    presentation.surface.remove();
    presentation = null;
    refreshTabs();
  };
  api.disposeTab = tab => { if (presentation?.tab === tab) api.cancel(); };
  api.reset = () => { api.cancel(); history.clear(); };
})();
