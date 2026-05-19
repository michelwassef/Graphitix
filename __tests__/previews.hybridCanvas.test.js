const { bindElementToTab, initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('preview hybrid capture for canvas-backed layers', () => {
  beforeEach(() => {
    jest.resetModules();
    initializeWorkspaceHarness({ html: '<div id="workspaceTabsList"></div>' });
    window.Shared = {
      ...(window.Shared || {}),
      exporter: {
        buildHybridSvg: jest.fn(() => new Promise(() => {}))
      }
    };
    require('../js/main/previews.js');
  });

  test('box previews hydrate canvas point layers synchronously', () => {
    const previews = window.Main.previews;
    expect(previews).toBeTruthy();
    const element = document.createElement('div');
    element.innerHTML = `
      <div class="svgbox">
        <svg width="640" height="480" viewBox="0 0 640 480">
          <g data-export-layer="box-points" data-trace="0">
            <foreignObject x="10" y="20" width="200" height="180" data-point-renderer="canvas-approx">
              <canvas xmlns="http://www.w3.org/1999/xhtml"></canvas>
            </foreignObject>
          </g>
        </svg>
      </div>
    `;
    document.body.appendChild(element);
    element.querySelector('canvas').toDataURL = jest.fn(() => 'data:image/png;base64,Ym94LXByZXZpZXc=');
    const tab = {
      id: 'box-tab-1',
      type: 'box',
      payloadSignature: 'sig-1'
    };
    bindElementToTab(element, tab.id);
    const result = previews.captureWorkspacePreview({
      type: 'box',
      element
    }, tab);
    expect(result).toBeTruthy();
    expect(result.canvasBitmap).toBe(true);
    expect(result.markup).toContain('data-preview-canvas-bitmap="true"');
    expect(result.markup).toContain('data:image/png;base64,Ym94LXByZXZpZXc=');
    expect(result.markup).toContain('foreignObject');
    expect(result.markup).not.toContain('Preparing preview');
    expect(window.Shared.exporter.buildHybridSvg).not.toHaveBeenCalled();
  });

  test('scatter previews hydrate canvas point layers synchronously', () => {
    const previews = window.Main.previews;
    expect(previews).toBeTruthy();
    const element = document.createElement('div');
    element.innerHTML = `
      <div class="svgbox">
        <svg width="640" height="480" viewBox="0 0 640 480">
          <g data-export-layer="scatter-points" data-layer="points" data-render-mode="canvas">
            <foreignObject x="10" y="20" width="200" height="180" data-point-renderer="canvas-preview">
              <canvas xmlns="http://www.w3.org/1999/xhtml"></canvas>
            </foreignObject>
          </g>
        </svg>
      </div>
    `;
    document.body.appendChild(element);
    element.querySelector('canvas').toDataURL = jest.fn(() => 'data:image/png;base64,c2NhdHRlci1wcmV2aWV3');
    const tab = {
      id: 'scatter-tab-1',
      type: 'scatter',
      payloadSignature: 'scatter-sig-1'
    };
    bindElementToTab(element, tab.id);
    const result = previews.captureWorkspacePreview({
      type: 'scatter',
      element
    }, tab);
    expect(result).toBeTruthy();
    expect(result.canvasBitmap).toBe(true);
    expect(result.markup).toContain('data-preview-canvas-bitmap="true"');
    expect(result.markup).toContain('data:image/png;base64,c2NhdHRlci1wcmV2aWV3');
    expect(result.markup).toContain('foreignObject');
    expect(result.markup).not.toContain('Preparing preview');
    expect(window.Shared.exporter.buildHybridSvg).not.toHaveBeenCalled();
  });

  test('inactive hover refreshes box preview synchronously when canvas hydration is needed', () => {
    const previews = window.Main.previews;
    const element = document.createElement('div');
    element.innerHTML = `
      <div class="svgbox">
        <svg width="640" height="480" viewBox="0 0 640 480">
          <g data-export-layer="box-points" data-trace="0">
            <foreignObject x="10" y="20" width="200" height="180" data-point-renderer="canvas-preview">
              <canvas xmlns="http://www.w3.org/1999/xhtml"></canvas>
            </foreignObject>
          </g>
        </svg>
      </div>
    `;
    document.body.appendChild(element);
    element.querySelector('canvas').toDataURL = jest.fn(() => 'data:image/png;base64,aW5hY3RpdmUtYm94');
    window.Main.components = {
      registry: {
        box: {
          type: 'box',
          element
        }
      }
    };
    bindElementToTab(element, 'workspace-2');
    window.Main.session.workspaceState.activeTabId = 'workspace-1';
    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-1' });
    const tab = {
      id: 'workspace-2',
      type: 'box',
      payloadSignature: 'sig-2',
      previewMarkup: '<svg width="10" height="10"></svg>',
      previewSignature: 'sig-2',
      previewMeta: { hybrid: false, width: 10, height: 10 }
    };
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({ left: 40, top: 200, width: 120, height: 24, bottom: 224 });
    document.body.appendChild(anchor);
    previews.handleTabPreviewEnter({ currentTarget: anchor }, tab);
    expect(window.Shared.exporter.buildHybridSvg).not.toHaveBeenCalled();
    expect(tab.previewMarkup).toContain('data-preview-canvas-bitmap="true"');
    expect(tab.previewMarkup).toContain('data:image/png;base64,aW5hY3RpdmUtYm94');
    expect(tab.previewMarkup).not.toContain('Preparing preview');
    expect(tab.previewMeta.canvasBitmap).toBe(true);
  });

  test('matching-signature legacy placeholder is replaced by fast canvas preview', () => {
    const previews = window.Main.previews;
    const element = document.createElement('div');
    element.innerHTML = `
      <div class="svgbox">
        <svg width="640" height="480" viewBox="0 0 640 480">
          <g data-export-layer="box-points" data-trace="0">
            <foreignObject x="10" y="20" width="200" height="180" data-point-renderer="canvas-preview">
              <canvas xmlns="http://www.w3.org/1999/xhtml"></canvas>
            </foreignObject>
          </g>
        </svg>
      </div>
    `;
    document.body.appendChild(element);
    element.querySelector('canvas').toDataURL = jest.fn(() => 'data:image/png;base64,bGVnYWN5LWJveA==');
    window.Main.components = {
      registry: {
        box: {
          type: 'box',
          element
        }
      }
    };
    bindElementToTab(element, 'workspace-2');
    window.Main.session.workspaceState.activeTabId = 'workspace-1';
    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-1' });
    const tab = {
      id: 'workspace-2',
      type: 'box',
      payloadSignature: 'same-sig',
      previewMarkup: '<svg data-preview-placeholder="true"><text>Preparing preview</text></svg>',
      previewSignature: 'same-sig',
      previewMeta: { simplified: true, hybrid: false, width: 10, height: 10 }
    };
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({ left: 40, top: 200, width: 120, height: 24, bottom: 224 });
    document.body.appendChild(anchor);

    previews.handleTabPreviewEnter({ currentTarget: anchor }, tab);

    expect(window.Shared.exporter.buildHybridSvg).not.toHaveBeenCalled();
    expect(tab.previewMarkup).toContain('data-preview-canvas-bitmap="true"');
    expect(tab.previewMarkup).toContain('data:image/png;base64,bGVnYWN5LWJveA==');
    expect(tab.previewMarkup).not.toContain('Preparing preview');
    expect(tab.previewSignature).toBe('same-sig');
    expect(tab.previewMeta.canvasBitmap).toBe(true);
  });

  test('oversized vectorized box point layer is simplified instead of hybrid-rasterized', () => {
    const previews = window.Main.previews;
    const element = document.createElement('div');
    const hugePath = `M ${Array.from({ length: 5000 }, (_, idx) => `${idx} ${idx % 200}`).join(' L ')}`;
    element.innerHTML = `
      <div class="svgbox">
        <svg width="640" height="480" viewBox="0 0 640 480">
          <g data-export-layer="box-points" data-trace="0">
            <path data-box-export-geometry="1" d="${hugePath}" fill="#4f7fd9"></path>
          </g>
        </svg>
      </div>
    `;
    document.body.appendChild(element);
    const tab = {
      id: 'workspace-vector-box',
      type: 'box',
      payloadSignature: 'vector-sig'
    };
    bindElementToTab(element, tab.id);

    const result = previews.captureWorkspacePreview({
      type: 'box',
      element
    }, tab);

    expect(result).toBeTruthy();
    expect(result.canvasSimplified).toBe(true);
    expect(result.markup).toContain('data-preview-canvas-simplified="box"');
    expect(result.markup).not.toContain('Preparing preview');
    expect(result.markup).not.toContain('data-box-export-geometry');
    expect(result.size).toBeLessThan(120000);
    expect(window.Shared.exporter.buildHybridSvg).not.toHaveBeenCalled();
  });

  test('render cache sequence invalidates stale inactive preview even with matching payload signature', () => {
    const previews = window.Main.previews;
    const element = document.createElement('div');
    const cleanSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cleanSvg.setAttribute('width', '640');
    cleanSvg.setAttribute('height', '480');
    cleanSvg.innerHTML = '<g data-export-layer="box-points"><path d="M 10 10 L 40 10" stroke="#000"></path></g>';
    window.Main.components = {
      registry: {
        box: {
          type: 'box',
          element,
          getPreviewSvg: jest.fn(() => cleanSvg)
        }
      }
    };
    bindElementToTab(element, 'workspace-2');
    cleanSvg.setAttribute('data-workspace-tab-id', 'workspace-2');
    window.Main.session.workspaceState.activeTabId = 'workspace-1';
    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-1' });
    const tab = {
      id: 'workspace-2',
      type: 'box',
      payloadSignature: 'sig-3',
      previewMarkup: '<svg width="10" height="10"></svg>',
      previewSignature: 'sig-3',
      previewMeta: { hybrid: false, width: 10, height: 10, renderCacheSequence: 1 },
      renderCache: { captureSequence: 2 }
    };
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({ left: 40, top: 200, width: 120, height: 24, bottom: 224 });
    document.body.appendChild(anchor);
    previews.handleTabPreviewEnter({ currentTarget: anchor }, tab);
    expect(window.Main.components.registry.box.getPreviewSvg).toHaveBeenCalledWith(tab);
    expect(tab.previewMarkup).toContain('<svg');
    expect(tab.previewMeta.renderCacheSequence).toBe(2);
  });

  test('layout signature invalidates stale inactive preview even with matching payload signature', () => {
    const previews = window.Main.previews;
    const element = document.createElement('div');
    const cleanSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cleanSvg.setAttribute('width', '356');
    cleanSvg.setAttribute('height', '356');
    cleanSvg.innerHTML = '<g data-export-layer="scatter-points"><circle cx="20" cy="20" r="2"></circle></g>';
    const getPreviewSvg = jest.fn(() => cleanSvg);
    window.Main.components = {
      registry: {
        scatter: {
          type: 'scatter',
          element,
          getPreviewSvg
        }
      }
    };
    bindElementToTab(element, 'workspace-3');
    cleanSvg.setAttribute('data-workspace-tab-id', 'workspace-3');
    window.Main.session.workspaceState.activeTabId = 'workspace-1';
    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-1' });
    const tab = {
      id: 'workspace-3',
      type: 'scatter',
      payloadSignature: 'same-payload',
      layoutSignature: 'layout-new',
      previewMarkup: '<svg width="220" height="120"></svg>',
      previewSignature: 'same-payload',
      previewMeta: { hybrid: false, width: 220, height: 120, layoutSignature: 'layout-old' }
    };
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({ left: 40, top: 200, width: 120, height: 24, bottom: 224 });
    document.body.appendChild(anchor);

    previews.handleTabPreviewEnter({ currentTarget: anchor }, tab);

    expect(getPreviewSvg).toHaveBeenCalledWith(tab);
    expect(tab.previewSignature).toBe('same-payload');
    expect(tab.previewMeta.layoutSignature).toBe('layout-new');
    expect(tab.previewMarkup).toContain('circle');
  });

  test('active tab hover skips preview capture and hides any visible tooltip', () => {
    const previews = window.Main.previews;
    const element = document.createElement('div');
    const cleanSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cleanSvg.setAttribute('width', '640');
    cleanSvg.setAttribute('height', '480');
    cleanSvg.innerHTML = '<g data-export-layer="box-points"><path d="M 10 10 L 40 10" stroke="#000"></path></g>';
    const getPreviewSvg = jest.fn(() => cleanSvg);
    window.Main.components = {
      registry: {
        box: {
          type: 'box',
          element,
          getPreviewSvg
        }
      }
    };
    bindElementToTab(element, 'workspace-2');
    window.Main.session.workspaceState.activeTabId = 'workspace-2';
    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-2' });
    const tab = {
      id: 'workspace-2',
      type: 'box',
      payloadSignature: 'sig-active',
      previewMarkup: '<svg width="10" height="10"></svg>',
      previewSignature: 'sig-active',
      previewMeta: { hybrid: false, width: 10, height: 10, renderCacheSequence: 1 }
    };
    const tooltip = previews.ensureTabPreviewTooltipElement();
    tooltip.style.display = 'block';
    tooltip.style.opacity = '1';
    tooltip.innerHTML = '<svg width="10" height="10"></svg>';
    tooltip.dataset.tabId = tab.id;

    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({ left: 40, top: 200, width: 120, height: 24, bottom: 224 });
    document.body.appendChild(anchor);

    previews.handleTabPreviewEnter({ currentTarget: anchor }, tab);

    expect(getPreviewSvg).not.toHaveBeenCalled();
    expect(tooltip.style.display).toBe('none');
    expect(tooltip.style.opacity).toBe('0');
    expect(tooltip.innerHTML).toBe('');
    expect(tooltip.dataset.tabId).toBe('');
  });
});
