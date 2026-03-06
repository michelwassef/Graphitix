describe('componentLayout zoom behavior contract', () => {
  const setVisible = (el) => {
    if(!el){ return; }
    Object.defineProperty(el, 'offsetParent', {
      configurable: true,
      get(){ return document.body; }
    });
    el.getClientRects = () => [{ width: 1, height: 1 }];
  };

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="linePage" class="workspace-page">
        <div class="wrap">
          <div id="lineTablePanel" class="panel"></div>
          <div id="linePanelResizer" class="panel-resizer"></div>
          <div id="lineGraphPanel" class="panel">
            <div class="diagram-area">
              <div id="lineSvgBox" class="svgbox">
                <div id="linePlot"></div>
              </div>
              <div id="lineConfigPanel" class="config-options"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    window.Shared = {
      chartStyle: {
        DEFAULT_WIDTH: 640,
        DEFAULT_HEIGHT: 640,
        RESIZE_MIN_SCALE: 0.3,
        RESIZE_MAX_SCALE: 3,
        DEFAULT_ASPECT_RATIO: 1,
        DEFAULT_ASPECT_LOCKED: true,
        isTextSizeLocked: () => false,
        registerTextSizeLockControl: () => {}
      },
      graphSizing: {
        ensureCssVariables: () => {},
        getSizing: () => ({
          width: 400,
          height: 400,
          minWidth: 120,
          minHeight: 120,
          maxWidth: 1200,
          maxHeight: 1200,
          aspectRatio: 1,
          aspectLocked: false
        })
      },
      axisControls: {
        refreshActivePanel: jest.fn()
      },
      isDebugEnabled: () => false
    };

    const tablePanel = document.getElementById('lineTablePanel');
    const graphPanel = document.getElementById('lineGraphPanel');
    const configPanel = document.getElementById('lineConfigPanel');
    const svgBox = document.getElementById('lineSvgBox');
    [tablePanel, graphPanel, configPanel, svgBox].forEach(setVisible);

    tablePanel.getBoundingClientRect = () => ({ width: 360, height: 640 });
    graphPanel.getBoundingClientRect = () => ({ width: 980, height: 640 });
    configPanel.getBoundingClientRect = () => ({ width: 260, height: 640 });
    svgBox.getBoundingClientRect = () => ({
      width: Number.parseFloat(svgBox.style.width) || 400,
      height: Number.parseFloat(svgBox.style.height) || 400
    });

    require('../js/shared/resizer.js');
    require('../js/shared/componentLayout.js');
  });

  test('zoom resize phase is layout-only (no scheduleDraw / no user onResize callback)', () => {
    const syncPanelSpy = jest.fn((table, graph, config, scheduleDraw) => {
      if(typeof scheduleDraw === 'function'){
        scheduleDraw();
      }
      return { table, graph, config };
    });
    window.Shared.syncPanelWidths = syncPanelSpy;

    const scheduleDraw = jest.fn();
    const userResize = jest.fn();

    const layout = window.Shared.componentLayout.createStandardPanels({
      componentName: 'line',
      selectors: {
        tablePanel: '#lineTablePanel',
        graphPanel: '#lineGraphPanel',
        configPanel: '#lineConfigPanel',
        panelResizer: '#linePanelResizer',
        svgBox: '#lineSvgBox',
        resizeTarget: '#lineSvgBox'
      },
      scheduleDraw,
      resizableBoxOptions: {
        onResize: userResize
      }
    });

    const svgBox = layout.elements.svgBox;
    scheduleDraw.mockClear();
    userResize.mockClear();
    syncPanelSpy.mockClear();
    window.Shared.applyResizableBoxZoom(svgBox, { level: 1.4, reason: 'zoom-test' });

    const zoomContent = svgBox.querySelector('.resizer-zoom-content');
    expect(zoomContent).toBeTruthy();
    expect(zoomContent.style.getPropertyValue('--resizer-content-zoom')).toBe('1.4');
    expect(scheduleDraw).not.toHaveBeenCalled();
    expect(userResize).not.toHaveBeenCalled();

    expect(syncPanelSpy).toHaveBeenCalled();
    const lastSyncCall = syncPanelSpy.mock.calls[syncPanelSpy.mock.calls.length - 1];
    expect(lastSyncCall[4]?.skipSchedule).toBe(true);
  });
});
