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

  test('configured resize phases can skip internal schedule while keeping user callbacks', () => {
    const syncPanelSpy = jest.fn((table, graph, config, scheduleDraw, options) => {
      if(typeof scheduleDraw === 'function'){
        scheduleDraw();
      }
      return { table, graph, config, options };
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
      skipScheduleOnResizePhases: ['programmatic'],
      resizableBoxOptions: {
        onResize: userResize
      }
    });

    const svgBox = layout.elements.svgBox;
    scheduleDraw.mockClear();
    userResize.mockClear();
    syncPanelSpy.mockClear();

    window.Shared.applyResizableBoxSize(svgBox, {
      width: 520,
      height: 460,
      reason: 'programmatic-test'
    });

    expect(scheduleDraw).not.toHaveBeenCalled();
    expect(userResize).toHaveBeenCalledWith('programmatic', expect.any(Object));

    expect(syncPanelSpy).toHaveBeenCalled();
    const lastSyncCall = syncPanelSpy.mock.calls[syncPanelSpy.mock.calls.length - 1];
    expect(lastSyncCall[4]?.skipSchedule).toBe(true);
  });

  test('layout registry is scoped by component type and tab id', () => {
    document.body.innerHTML = `
      <div id="tabA" data-workspace-tab-id="scatter-a">
        <div id="scatterTablePanel" class="panel"></div>
        <div id="scatterGraphPanel" class="panel">
          <div id="scatterSvgBox" class="svgbox" data-resizer-aspect-locked="false"><div></div></div>
          <div id="scatterConfigPanel" class="config-options"></div>
        </div>
      </div>
      <div id="tabB" data-workspace-tab-id="scatter-b">
        <div id="scatterTablePanelB" class="panel"></div>
        <div id="scatterGraphPanelB" class="panel">
          <div id="scatterSvgBoxB" class="svgbox" data-resizer-aspect-locked="true"><div></div></div>
          <div id="scatterConfigPanelB" class="config-options"></div>
        </div>
      </div>
    `;
    const tabA = document.getElementById('tabA');
    const tabB = document.getElementById('tabB');
    [tabA, tabB].forEach(root => {
      root.querySelectorAll('.panel,.svgbox').forEach(setVisible);
    });
    const svgA = document.getElementById('scatterSvgBox');
    const svgB = document.getElementById('scatterSvgBoxB');
    svgA.getBoundingClientRect = () => ({ width: 400, height: 300 });
    svgB.getBoundingClientRect = () => ({ width: 500, height: 250 });
    window.Shared.syncPanelWidths = jest.fn();

    window.Shared.componentLayout.createStandardPanels({
      componentName: 'scatter',
      tabId: 'scatter-a',
      selectors: {
        tablePanel: '#tabA #scatterTablePanel',
        graphPanel: '#tabA #scatterGraphPanel',
        configPanel: '#tabA #scatterConfigPanel',
        svgBox: '#tabA #scatterSvgBox',
        resizeTarget: '#tabA #scatterSvgBox'
      }
    });
    window.Shared.componentLayout.createStandardPanels({
      componentName: 'scatter',
      tabId: 'scatter-b',
      selectors: {
        tablePanel: '#tabB #scatterTablePanelB',
        graphPanel: '#tabB #scatterGraphPanelB',
        configPanel: '#tabB #scatterConfigPanelB',
        svgBox: '#tabB #scatterSvgBoxB',
        resizeTarget: '#tabB #scatterSvgBoxB'
      }
    });

    const stateA = window.Shared.componentLayout.captureStateFor('scatter', { tabId: 'scatter-a' });
    const stateB = window.Shared.componentLayout.captureStateFor('scatter', { tabId: 'scatter-b' });

    expect(stateA?.svgBox?.dataset?.resizerAspectLocked).toBe('false');
    expect(stateB?.svgBox?.dataset?.resizerAspectLocked).toBe('true');
  });

  test('pending schedule suppression applies when layout is created after restore begins', () => {
    const syncPanelSpy = jest.fn((table, graph, config, scheduleDraw, options) => {
      if(typeof scheduleDraw === 'function'){
        scheduleDraw();
      }
      return { table, graph, config, options };
    });
    window.Shared.syncPanelWidths = syncPanelSpy;
    const scheduleDraw = jest.fn();

    expect(window.Shared.componentLayout.suppressNextScheduleFor('line', {
      tabId: 'line-restore-tab',
      reason: 'render-cache-restore-prepare',
      delayMs: 5000,
      count: 2
    })).toBe(true);

    const layout = window.Shared.componentLayout.createStandardPanels({
      componentName: 'line',
      tabId: 'line-restore-tab',
      selectors: {
        tablePanel: '#lineTablePanel',
        graphPanel: '#lineGraphPanel',
        configPanel: '#lineConfigPanel',
        panelResizer: '#linePanelResizer',
        svgBox: '#lineSvgBox',
        resizeTarget: '#lineSvgBox'
      },
      scheduleDraw
    });

    expect(scheduleDraw).not.toHaveBeenCalled();
    expect(syncPanelSpy).toHaveBeenCalled();
    expect(syncPanelSpy.mock.calls[0][4]?.skipSchedule).toBe(true);

    layout.syncPanels();
    expect(scheduleDraw).not.toHaveBeenCalled();
    const lastSyncCall = syncPanelSpy.mock.calls[syncPanelSpy.mock.calls.length - 1];
    expect(lastSyncCall[4]?.skipSchedule).toBe(true);
  });
});
