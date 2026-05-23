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

  test('scatter preview rebuild converts archived bitmap markers into canvas layers', () => {
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
    expect(preview.querySelector('canvas[data-graphitix-render-cache-canvas-restored="true"]')).toBeTruthy();
    expect(preview.querySelector('img[data-graphitix-render-cache-canvas-bitmap="true"]')).toBeNull();
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
});
