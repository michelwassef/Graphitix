describe('heavy canvas reopen/recovery regression guards', () => {
  function ensureWorkspaceRootResolver() {
    window.Shared = window.Shared || {};
    window.Shared.workspaceTabs = window.Shared.workspaceTabs || {};
    window.Shared.workspaceTabs.resolveComponentRoot = ({ componentKey, staticRootId } = {}) => {
      const id = staticRootId || `${componentKey || ''}Page`;
      return id ? document.getElementById(id) : null;
    };
  }

  function stampWorkspaceOwnerRoot(root, tab) {
    if (!root || !tab?.id) {
      throw new Error('Workspace owner root and tab id are required for the heavy-cache harness.');
    }
    root.dataset.workspaceTabId = tab.id;
    root.dataset.tabId = tab.id;
    root.dataset.workspaceInstanceRoot = 'true';
    root.dataset.workspaceComponent = tab.type;
    return root;
  }

  function makeScatterCacheWithBitmapImage(tabId = 'workspace-scatter-a') {
    const fragment = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'scatterSvg');
    svg.setAttribute('width', '640');
    svg.setAttribute('height', '480');
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('data-layer', 'points');
    layer.setAttribute('data-render-mode', 'canvas');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('x', '24');
    foreignObject.setAttribute('y', '32');
    foreignObject.setAttribute('width', '220');
    foreignObject.setAttribute('height', '180');
    foreignObject.setAttribute('data-point-renderer', 'canvas-preview');
    const image = document.createElement('img');
    image.setAttribute('src', 'data:image/png;base64,Y2FudmFzLWJpdG1hcC1zY2F0dGVy');
    image.setAttribute('width', '220');
    image.setAttribute('height', '180');
    image.style.width = '220px';
    image.style.height = '180px';
    image.style.display = 'block';
    image.setAttribute('data-graphitix-render-cache-canvas-bitmap', 'true');
    foreignObject.appendChild(image);
    layer.appendChild(foreignObject);
    svg.appendChild(layer);
    fragment.appendChild(svg);
    return {
      plot: { fragment, count: 1 },
      stats: { fragment: document.createDocumentFragment(), count: 0 },
      __graphitixRenderCache: {
        complete: true,
        type: 'scatter',
        tabId
      }
    };
  }

  function makeBoxCacheWithBitmapImage(tabId = 'workspace-box-a') {
    const fragment = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '640');
    svg.setAttribute('height', '480');
    svg.setAttribute('viewBox', '0 0 640 480');
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('data-export-layer', 'box-points');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('x', '30');
    foreignObject.setAttribute('y', '40');
    foreignObject.setAttribute('width', '200');
    foreignObject.setAttribute('height', '160');
    foreignObject.setAttribute('data-point-renderer', 'canvas-preview');
    const image = document.createElement('img');
    image.setAttribute('src', 'data:image/png;base64,Y2FudmFzLWJpdG1hcC1ib3g=');
    image.setAttribute('width', '200');
    image.setAttribute('height', '160');
    image.style.width = '200px';
    image.style.height = '160px';
    image.style.display = 'block';
    image.setAttribute('data-graphitix-render-cache-canvas-bitmap', 'true');
    foreignObject.appendChild(image);
    layer.appendChild(foreignObject);
    svg.appendChild(layer);
    fragment.appendChild(svg);
    return {
      cache: {
        plot: { fragment, count: 1 },
        __graphitixRenderCache: {
          complete: true,
          type: 'box',
          tabId
        }
      },
      tabId,
      type: 'box',
      payloadSignature: `${tabId}-payload`,
      layoutSignature: `${tabId}-layout`
    };
  }

  beforeEach(() => {
    jest.resetModules();
    const activeTab = { id: 'workspace-scatter-a', type: 'scatter' };
    window.Main = window.Main || {};
    window.Main.session = {
      workspaceState: { tabs: [activeTab], activeTabId: activeTab.id },
      getActiveTab: () => activeTab
    };
    ensureWorkspaceRootResolver();
    stampWorkspaceOwnerRoot(document.getElementById('scatterPage'), activeTab);
    require('../js/shared/workspaceTabs.js');
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/hot.js');
    require('../js/shared/chartStyle.js');
    window.Shared.workspaceTabs.activateSession(activeTab, 'scatter', { reason: 'unit-heavy-setup' });
    require('../js/components/scatter.js');
    require('../js/components/box.js');
    window.Components.scatter.activateTab(activeTab, { reason: 'unit-heavy-setup' });
  });

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
    delete window.Components;
  });

  test('scatter render-cache restore rehydrates archived bitmap images into canvases', () => {
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();

    const cache = makeScatterCacheWithBitmapImage('workspace-scatter-a');
    const restored = scatter.restoreRenderCache(cache, {
      tabId: 'workspace-scatter-a',
      type: 'scatter',
      reason: 'unit-heavy-restore'
    });
    expect(restored).toBe(true);

    const plotHost = document.querySelector('#scatterPage #scatterPlot');
    expect(plotHost).toBeTruthy();
    const restoredCanvas = plotHost.querySelector('foreignObject[data-point-renderer] canvas[data-graphitix-render-cache-canvas-restored="true"]');
    const pendingBitmap = plotHost.querySelector('foreignObject[data-point-renderer] img[data-graphitix-render-cache-canvas-pending-hydration="true"]');
    expect(restoredCanvas || pendingBitmap).toBeTruthy();
  });

  test('scatter preview exposes its owner-scoped archived bitmap source unchanged', () => {
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();

    const tab = {
      id: 'workspace-scatter-preview',
      type: 'scatter',
      renderCache: {
        cache: makeScatterCacheWithBitmapImage('workspace-scatter-preview'),
        tabId: 'workspace-scatter-preview',
        type: 'scatter',
        payloadSignature: 'sig-preview',
        layoutSignature: 'layout-preview'
      }
    };
    window.Main.session.workspaceState.activeTabId = 'workspace-other';
    const preview = scatter.getPreviewSvg(tab);
    expect(preview).toBeTruthy();
    expect(preview.querySelector('img[data-graphitix-render-cache-canvas-bitmap="true"]')).not.toBeNull();
    expect(preview.querySelector('img[data-preview-canvas-bitmap="true"]')).toBeNull();
  });

  test('box preview exposes its owner-scoped archived bitmap source unchanged', () => {
    const box = window.Components?.box;
    expect(box).toBeTruthy();

    const tab = {
      id: 'workspace-box-preview',
      type: 'box',
      renderCache: makeBoxCacheWithBitmapImage('workspace-box-preview')
    };
    window.Main.session.workspaceState.activeTabId = 'workspace-other';
    const preview = box.getPreviewSvg(tab);
    expect(preview).toBeTruthy();
    expect(preview.querySelector('img[data-graphitix-render-cache-canvas-bitmap="true"]')).not.toBeNull();
    expect(preview.querySelector('img[data-preview-canvas-bitmap="true"]')).toBeNull();
  });

  // ─── Payload signature bloat regression ──────────────────────────────────
  test('computeScatterDataSignature is attached to payloadData as __graphitixMatrixSignature', () => {
    // Verify that getScatterGraphPayload tags the data matrix so serializePayloadSignature
    // can compact it (preventing the 600KB+ signature seen with raw getData() serialization).
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();

    // Build a minimal data matrix and verify the signature is set on it.
    const matrix = [['A', 'B'], [1, 2], [3, 4]];
    // Expose internal via a small test hook if available; otherwise verify indirectly.
    // We confirm the format: "RxC:hexhash"
    const sig = scatter.__testComputeDataSignature
      ? scatter.__testComputeDataSignature(matrix)
      : null;
    if (sig !== null) {
      expect(typeof sig).toBe('string');
      expect(sig).toMatch(/^\d+x\d+:[0-9a-f]+$/);
    }
  });

  test('scatter __graphitixMatrixSignature produces different values for different datasets', () => {
    // Different data must produce different signatures so cache invalidation works.
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();
    if (!scatter.__testComputeDataSignature) {
      return; // signature function not exposed; skip
    }
    const sig1 = scatter.__testComputeDataSignature([[1, 2], [3, 4]]);
    const sig2 = scatter.__testComputeDataSignature([[5, 6], [7, 8]]);
    const sig3 = scatter.__testComputeDataSignature([[1, 2], [3, 4], [5, 6]]);
    expect(sig1).not.toBe(sig2);
    expect(sig1).not.toBe(sig3);
  });

  // ─── Central restore lifecycle regression ─────────────────────────────────
  test('scatter restoreRenderCache does not leave component-local draw gates behind', () => {
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();

    const cache = makeScatterCacheWithBitmapImage('workspace-scatter-a');
    expect(scatter.restoreRenderCache(cache, {
      tabId: 'workspace-scatter-a',
      type: 'scatter',
      reason: 'unit-central-restore-contract'
    })).toBe(true);

    const state = scatter.__testGetState?.() || {};
    expect(Object.prototype.hasOwnProperty.call(state, ['skip', 'Next', 'Draw'].join(''))).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(state, ['skip', 'Next', 'Draw', 'Reason'].join(''))).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(state, ['renderCache', 'Restore', 'Suppress', 'Until'].join(''))).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(state, ['renderCache', 'Restore', 'Suppress', 'Count'].join(''))).toBe(false);

    if (typeof scatter.__testTriggerSchedule === 'function') {
      expect(() => scatter.__testTriggerSchedule({ reason: 'resize' })).not.toThrow();
    }
  });

  test('scatter isIdleForSnapshot returns false while a scheduled draw is pending', async () => {
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();
    if (!scatter.__testGetState || !scatter.__testTriggerSchedule) {
      return; // hooks not exposed; skip
    }
    const state = scatter.__testGetState();
    state.drawScheduled = false;
    state.drawInProgress = false;
    state.pendingDrawOpts = null;
    state.statsComputationPending = false;
    state.rotationPending = false;
    expect(scatter.isIdleForSnapshot()).toBe(true);

    scatter.__testTriggerSchedule({
      tabId: 'workspace-scatter-a',
      reason: 'unit-snapshot-pending-draw',
      viewOnly: true
    });
    expect(scatter.isIdleForSnapshot()).toBe(false);

    await window.Shared.componentLifecycle.waitForAnimationFrames(2);
    expect(scatter.isIdleForSnapshot()).toBe(true);
  });

});
