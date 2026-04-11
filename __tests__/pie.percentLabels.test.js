describe('Pie percentage labels', () => {
  jest.setTimeout(240000);

  async function flushAsyncWork(iterations = 20){
    for(let index = 0; index < iterations; index += 1){
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  async function activateWorkspace(type){
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const result = graphSelection(type);
    if(result && typeof result.then === 'function'){
      await result;
    }
    await Promise.resolve();
  }

  function setFixedPiePlotDimensions(width, height){
    const plot = document.getElementById('piePlot');
    const svgBox = document.querySelector('#pieGraphPanel .svgbox');
    expect(plot).toBeTruthy();
    expect(svgBox).toBeTruthy();
    if(svgBox?.style){
      svgBox.style.width = `${width}px`;
      svgBox.style.height = `${height}px`;
    }
    const readWidth = () => Number.parseFloat(svgBox?.style?.width) || width;
    const readHeight = () => Number.parseFloat(svgBox?.style?.height) || height;
    Object.defineProperty(plot, 'clientWidth', {
      configurable: true,
      get: readWidth
    });
    Object.defineProperty(plot, 'clientHeight', {
      configurable: true,
      get: readHeight
    });
    plot.getBoundingClientRect = () => {
      const currentWidth = readWidth();
      const currentHeight = readHeight();
      return { width: currentWidth, height: currentHeight, top: 0, left: 0, right: currentWidth, bottom: currentHeight };
    };
    svgBox.getBoundingClientRect = () => {
      const currentWidth = readWidth();
      const currentHeight = readHeight();
      return { width: currentWidth, height: currentHeight, top: 0, left: 0, right: currentWidth, bottom: currentHeight };
    };
  }

  beforeEach(() => {
    jest.resetModules();
    if(typeof global.__restoreTestDebugLogs === 'function'){
      global.__restoreTestDebugLogs();
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }

    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/workspaceTabs.js');
    require('../js/shared/tabContext.js');
    require('../js/shared/undo.js');
    require('../js/shared/resizer.js');
    require('../js/shared/dom.js');
    require('../js/shared/exporter.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/graphSizing.js');
    require('../js/shared/regression.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    require('../js/main/components.js');
    if(window.Main?.components?.preloadAllBundlesSync){
      window.Main.components.preloadAllBundlesSync();
    }
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs.js');
    require('../js/main.js');
  });

  afterEach(() => {
    if(typeof global.__suppressTestDebugLogs === 'function'){
      global.__suppressTestDebugLogs();
    }
  });

  test('shared radial percentage auto-fit shrinks to the narrowest slice', () => {
    const hooks = window.Components?.pie?.__testHooks;
    expect(hooks).toBeTruthy();

    const fractions = [0.05, 0.15, 0.35, 0.45];
    let startAngle = 0;
    const slices = fractions.map((fraction, index) => {
      const endAngle = startAngle + (Math.PI * 2 * fraction);
      const slice = {
        seriesIndex: 0,
        sliceIndex: index,
        text: `${(fraction * 100).toFixed(1)}%`,
        cx: 120,
        cy: 120,
        startAngle,
        endAngle,
        innerRadius: 0,
        outerRadius: 64,
        preferredRadius: 38
      };
      startAngle = endAngle;
      return slice;
    });

    const layout = hooks.computeRadialPercentLabelLayout({
      slices,
      baseFontSize: 12,
      fontScale: 1
    });

    expect(layout).toBeTruthy();
    expect(layout.placements).toHaveLength(4);
    expect(layout.fontSize).toBeLessThan(12);
    expect(layout.fontSize).toBeGreaterThan(0);
  });

  test('pie draw renders percentage labels in a dedicated top layer with one common font size', async () => {
    await activateWorkspace('pie');
    setFixedPiePlotDimensions(760, 360);

    window.Components.pie.loadFromPayload({
      type: 'pie',
      data: [
        ['Category', 'Observed', 'Expected'],
        ['A', 5, 25],
        ['B', 15, 25],
        ['C', 35, 25],
        ['D', 45, 25]
      ],
      config: {
        title: 'Proportion graph',
        chartType: 'pie',
        showPercents: true,
        showFrame: false,
        showLegend: true,
        startAngle: '0',
        fontSize: '12'
      }
    });
    await flushAsyncWork(10);

    const svg = document.querySelector('#piePlot svg');
    expect(svg).toBeTruthy();

    const dataLayer = svg.querySelector('g[data-layer="pie-data"]');
    const labelLayer = svg.querySelector('g[data-layer="pie-labels"]');
    expect(dataLayer).toBeTruthy();
    expect(labelLayer).toBeTruthy();

    const children = Array.from(svg.children);
    expect(children.indexOf(labelLayer)).toBeGreaterThan(children.indexOf(dataLayer));

    const percentLabels = Array.from(labelLayer.querySelectorAll('text'))
      .filter(node => /%$/.test(node.textContent || ''));
    expect(percentLabels).toHaveLength(8);

    const fontSizes = new Set(percentLabels.map(node => node.getAttribute('font-size')));
    expect(fontSizes.size).toBe(1);
    percentLabels.forEach(node => {
      expect(node.parentNode).toBe(labelLayer);
    });
  });
});
