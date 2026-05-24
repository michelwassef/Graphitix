const COMPONENTS = [
  { key: 'venn', modulePath: '../js/components/venn.js', plotId: 'stage', pageId: 'vennPage', panelId: 'vennGraphPanel', tag: 'svg' },
  { key: 'line', modulePath: '../js/components/line.js', plotId: 'linePlot', pageId: 'linePage', panelId: 'lineGraphPanel' },
  { key: 'scatter', modulePath: '../js/components/scatter.js', plotId: 'scatterPlot', pageId: 'scatterPage', panelId: 'scatterGraphPanel' },
  { key: 'pca', modulePath: '../js/components/pca.js', plotId: 'pcaPlot', pageId: 'pcaPage', panelId: 'pcaGraphPanel' },
  { key: 'pie', modulePath: '../js/components/pie.js', plotId: 'piePlot', pageId: 'piePage', panelId: 'pieGraphPanel' },
  { key: 'roc', modulePath: '../js/components/roc.js', plotId: 'rocPlot', pageId: 'rocPage', panelId: 'rocGraphPanel' },
  { key: 'survival', modulePath: '../js/components/survival.js', plotId: 'survivalPlot', pageId: 'survivalPage', panelId: 'survivalGraphPanel' },
  { key: 'heatmap', modulePath: '../js/components/heatmap.js', plotId: 'heatmapSvg', pageId: 'heatmapPage', panelId: 'heatmapGraphPanel', tag: 'svg' },
  { key: 'surface', modulePath: '../js/components/surface.js', plotId: 'surfaceSvg', pageId: 'surfacePage', panelId: 'surfaceGraphPanel', tag: 'svg' }
];

function loadComponent({ key, modulePath, plotId, pageId, panelId, tag = 'div' }){
  jest.resetModules();
  document.body.innerHTML = `
    <div id="${pageId}">
      <div id="${panelId}">
        <div class="svgbox" data-resizer-zoom-level="1">
          <div class="resizer-zoom-viewport">
            <div class="resizer-zoom-content">
              <${tag} id="${plotId}"></${tag}>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  window.Shared = {
    isDebugEnabled: () => false,
    chartStyle: {},
    componentLifecycle: {}
  };
  window.Components = {};
  require('../js/shared/componentLayout.js');
  require(modulePath);

  const component = window.Components[key];
  const hook = component?.__testHooks?.resolveDrawableFrame;
  if(typeof hook !== 'function'){
    throw new Error(`${key} does not expose __testHooks.resolveDrawableFrame`);
  }
  return {
    hook,
    plot: document.getElementById(plotId),
    viewport: document.querySelector('.resizer-zoom-viewport')
  };
}

describe('component drawable frame authority', () => {
  test.each(COMPONENTS)('$key uses the shared zoom viewport as drawable authority', componentConfig => {
    const { hook, plot, viewport } = loadComponent(componentConfig);
    Object.defineProperty(plot, 'clientWidth', { configurable: true, get: () => 900 });
    Object.defineProperty(plot, 'clientHeight', { configurable: true, get: () => 680 });
    viewport.getBoundingClientRect = () => ({
      width: 540,
      height: 360,
      top: 0,
      left: 0,
      right: 540,
      bottom: 360
    });

    const frame = hook(plot);

    expect(frame.source).toBe('zoom-viewport');
    expect(frame.width).toBe(540);
    expect(frame.height).toBe(360);
    expect(frame.rawWidth).toBe(900);
    expect(frame.rawHeight).toBe(680);
    expect(frame.constrained).toBe(true);
  });
});
