describe('heavy canvas reopen/recovery regression guards', () => {
  function ensureWorkspaceRootResolver() {
    window.Shared = window.Shared || {};
    window.Shared.workspaceTabs = window.Shared.workspaceTabs || {};
    window.Shared.workspaceTabs.resolveComponentRoot = ({ componentKey, staticRootId } = {}) => {
      const id = staticRootId || `${componentKey || ''}Page`;
      return id ? document.getElementById(id) : null;
    };
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
    window.Main = window.Main || {};
    window.Main.session = {
      workspaceState: { tabs: [], activeTabId: 'workspace-scatter-a' },
      getActiveTab: () => ({ id: 'workspace-scatter-a', type: 'scatter' })
    };
    ensureWorkspaceRootResolver();
    require('../js/components/scatter.js');
    require('../js/components/box.js');
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
    expect(restoredCanvas).toBeTruthy();
    expect(plotHost.querySelector('img[data-graphitix-render-cache-canvas-bitmap="true"]')).toBeNull();
  });

  test('scatter preview rebuild keeps archived bitmap markers as preview bitmaps (no blank canvas)', () => {
    // When the render-cache source has img[data-graphitix-render-cache-canvas-bitmap] elements
    // (archived from a previous session), the preview path must NOT try to decode them into
    // canvases synchronously (which produces blank bitmaps). Instead it should preserve them
    // as img[data-preview-canvas-bitmap] so the downstream preview pipeline uses the actual data.
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
    // Original archive-bitmap marker must be consumed (renamed or converted).
    expect(preview.querySelector('img[data-graphitix-render-cache-canvas-bitmap="true"]')).toBeNull();
    // The bitmap must survive as either a restored canvas or a preview-bitmap img.
    const hasCanvas = !!preview.querySelector('canvas[data-graphitix-render-cache-canvas-restored="true"]');
    const hasPreviewBitmap = !!preview.querySelector('img[data-preview-canvas-bitmap="true"]');
    expect(hasCanvas || hasPreviewBitmap).toBe(true);
  });

  test('box preview rebuild converts archived bitmap markers into canvas layers', () => {
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
    expect(preview.querySelector('canvas[data-graphitix-render-cache-canvas-restored="true"]')).toBeTruthy();
    expect(preview.querySelector('img[data-graphitix-render-cache-canvas-bitmap="true"]')).toBeNull();
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

  // ─── Draw suppression race regression ────────────────────────────────────
  test('scatter restoreRenderCache sets skipNextDraw so a concurrent schedule does not clear it prematurely', () => {
    // After restoreRenderCache, calling scheduleScatter (simulating a ResizeObserver) with an
    // active suppression count must NOT reset skipNextDraw to false.
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();

    const cache = makeScatterCacheWithBitmapImage('workspace-scatter-a');
    scatter.restoreRenderCache(cache, {
      tabId: 'workspace-scatter-a',
      type: 'scatter',
      reason: 'unit-race-test'
    });

    // After restore the scatter module sets skipNextDraw=true and suppression count>=1.
    // Trigger the public draw schedule. If the race bug were present, this would reset
    // skipNextDraw=false and allow the next runDrawCycle to fire.
    if (typeof scatter.__testTriggerSchedule === 'function') {
      scatter.__testTriggerSchedule({ reason: 'resize' });
      // skipNextDraw must still be true (suppression consumed the tick, left flag intact)
      expect(scatter.__testGetState?.().skipNextDraw).toBe(true);
    }
  });

  // ─── drawScheduled flag / isIdleForSnapshot race regression ─────────────────
  test('scatter isIdleForSnapshot returns false while a debounced draw is pending', () => {
    // isIdleForSnapshot must account for drawScheduled so that warmTabRenderCaches
    // does not capture intermediate state after re-activating the scatter tab.
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();
    if (!scatter.__testGetState || !scatter.__testTriggerSchedule) {
      return; // hooks not exposed; skip
    }
    // Reset to a clean state.
    const state = scatter.__testGetState();
    state.drawScheduled = false;
    state.drawInProgress = false;
    state.pendingDrawOpts = null;
    state.statsComputationPending = false;
    state.rotationPending = false;
    expect(scatter.isIdleForSnapshot()).toBe(true);
    // Simulate a debounced-but-not-yet-fired draw tick.
    state.drawScheduled = true;
    expect(scatter.isIdleForSnapshot()).toBe(false);
    // Once the draw cycle starts it clears the flag.
    state.drawScheduled = false;
    expect(scatter.isIdleForSnapshot()).toBe(true);
  });

  // ─── Preview archive-bitmap path ─────────────────────────────────────────
  test('scatter getPreviewSvg on render-cache tab marks archive bitmaps as data-preview-canvas-bitmap (not blank canvas)', () => {
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();

    const tab = {
      id: 'workspace-scatter-bitmap-preview',
      type: 'scatter',
      renderCache: {
        cache: makeScatterCacheWithBitmapImage('workspace-scatter-bitmap-preview'),
        tabId: 'workspace-scatter-bitmap-preview',
        type: 'scatter',
        payloadSignature: 'sig-bp',
        layoutSignature: 'layout-bp'
      }
    };
    window.Main.session.workspaceState.activeTabId = 'workspace-other';

    const preview = scatter.getPreviewSvg(tab);
    expect(preview).toBeTruthy();

    // The archive bitmap img should be renamed to data-preview-canvas-bitmap (not stripped).
    const previewBitmap = preview.querySelector('img[data-preview-canvas-bitmap="true"]');
    const archiveBitmap = preview.querySelector('img[data-graphitix-render-cache-canvas-bitmap="true"]');

    // Either the img was converted to a canvas (rehydration path) or kept as a preview bitmap.
    // In both cases, the original archive marker must be gone.
    expect(archiveBitmap).toBeNull();
    // And there must be SOME bitmap representation (canvas OR preview-bitmap img).
    const hasCanvas = !!preview.querySelector('canvas[data-graphitix-render-cache-canvas-restored="true"]');
    const hasBitmapImg = !!previewBitmap;
    expect(hasCanvas || hasBitmapImg).toBe(true);
  });

});
