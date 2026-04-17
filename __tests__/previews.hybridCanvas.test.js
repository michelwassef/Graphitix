describe('preview hybrid capture for canvas-backed layers', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="workspaceTabsList"></div>';
    window.Main = {
      session: {
        workspaceState: {},
        tabHasTableData: () => true
      }
    };
    window.Shared = {
      exporter: {
        buildHybridSvg: jest.fn(() => new Promise(() => {}))
      }
    };
    require('../js/main/previews.js');
  });

  test('box previews force hybrid capture when point layer uses canvas foreignObject', () => {
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
    const tab = {
      id: 'box-tab-1',
      type: 'box',
      payloadSignature: 'sig-1'
    };
    const result = previews.captureWorkspacePreview({
      type: 'box',
      element
    }, tab);
    expect(result).toBeTruthy();
    expect(result.simplified).toBe(true);
    expect(result.markup).toContain('Preparing preview');
    expect(window.Shared.exporter.buildHybridSvg).toHaveBeenCalledTimes(1);
  });

  test('scatter previews force hybrid capture when point layer uses canvas foreignObject', () => {
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
    const tab = {
      id: 'scatter-tab-1',
      type: 'scatter',
      payloadSignature: 'scatter-sig-1'
    };
    const result = previews.captureWorkspacePreview({
      type: 'scatter',
      element
    }, tab);
    expect(result).toBeTruthy();
    expect(result.simplified).toBe(true);
    expect(result.markup).toContain('Preparing preview');
    expect(window.Shared.exporter.buildHybridSvg).toHaveBeenCalledTimes(1);
  });

  test('inactive hover refreshes box preview when hybrid canvas capture is needed', () => {
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
    window.Main.components = {
      registry: {
        box: {
          type: 'box',
          element
        }
      }
    };
    window.Main.session.workspaceState.activeTabId = 'workspace-1';
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
    expect(window.Shared.exporter.buildHybridSvg).toHaveBeenCalledTimes(1);
    expect(tab.previewMarkup).toContain('Preparing preview');
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
    window.Main.session.workspaceState.activeTabId = 'workspace-1';
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
});
