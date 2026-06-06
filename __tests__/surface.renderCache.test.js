describe('Surface render cache redraw', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function flushMany(count = 10) {
    for (let i = 0; i < count; i += 1) {
      await flush();
    }
  }

  function parseViewBox(svg) {
    return String(svg.getAttribute('viewBox') || '')
      .trim()
      .split(/\s+/)
      .map(value => Number(value));
  }

  async function handleGraphSelection(Main, type) {
    const maybe = Main.tabs.handleGraphSelection(type, { reason: 'test-selection' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    const prompt = document.getElementById('duplicatePrompt');
    if (prompt && !prompt.hasAttribute('hidden')) {
      const emptyBtn = document.getElementById('duplicateEmpty');
      if (emptyBtn && typeof emptyBtn.click === 'function') {
        emptyBtn.click();
      }
    }
    await flushMany(4);
  }

  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/tabContext.js');
    require('../js/shared/undo.js');
    require('../js/shared/resizer.js');
    require('../js/shared/dom.js');
    require('../js/shared/exporter.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/plot3d.js');
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
    if (window.Main?.components?.preloadAllBundlesSync) {
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
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('surface redraw after render cache restore does not duplicate geometry', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'surface');

    const surface = window.Components?.surface;
    expect(surface).toBeTruthy();
    expect(surface.__getState().settings.axisStroke).toBe(1);
    expect(document.getElementById('surfaceAxisStroke')?.value).toBe('1');

    const exampleBtn = document.getElementById('surfaceLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushMany(12);

    surface.draw();
    await flushMany(8);

    const svg = document.getElementById('surfaceSvg');
    expect(svg).toBeTruthy();
    svg.getBBox = jest.fn(() => ({ x: -42, y: -26, width: 720, height: 520 }));
    surface.draw();
    await flushMany(8);

    const originalFaceCount = svg.querySelectorAll('g.surface-faces polygon').length;
    const originalPointCount = svg.querySelectorAll('g.surface-points circle').length;
    expect(originalFaceCount).toBeGreaterThan(0);
    const frontFrameEdge = svg.querySelector('[data-frame-edge="front"]');
    expect(frontFrameEdge).toBeTruthy();
    expect(Number(frontFrameEdge.getAttribute('stroke-width'))).toBeCloseTo(1);

    const cache = surface.captureRenderCache();
    expect(cache).toBeTruthy();
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.getAttribute('height')).toBe('100%');
    let viewBox = parseViewBox(svg);
    expect(viewBox[0]).toBeLessThan(0);
    expect(viewBox[1]).toBeLessThan(0);
    expect(cache.svgRootState.attributes['data-surface-base-width']).toBeTruthy();
    expect(cache.svgRootState.attributes['data-surface-base-height']).toBeTruthy();
    cache.svgRootState.attributes.viewBox = '0 0 120 80';
    cache.svgRootState.attributes.width = '120';
    cache.svgRootState.attributes.height = '80';
    cache.svgRootState.attributes.preserveAspectRatio = 'none';

    const state = surface.__getState();
    state.svgBox.dataset.resizerAspectRatio = '1';
    state.svgBox.getBoundingClientRect = jest.fn(() => ({
      width: 1000,
      height: 500,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 500
    }));
    const cappedFrame = surface.__testHooks.resolve3dFrame({ width: 1000, height: 500 });
    expect(cappedFrame.width).toBe(500);
    expect(cappedFrame.height).toBe(500);

    state._facePool = [];
    state._pointPool = [];
    state._facePoolUsed = 0;
    state._pointPoolUsed = 0;

    const restored = surface.restoreRenderCache(cache);
    expect(restored).toBe(true);
    expect(svg.dataset.rotationControlsAttached).toBe('true');
    expect(svg.__plot3dRotationControl).toBeTruthy();
    expect(svg.__plot3dRotationControl.state).toBe(state.rotation);
    expect(typeof svg.__plot3dRotationControl.onChange).toBe('function');
    expect(svg.querySelectorAll('g.surface-faces polygon').length).toBe(originalFaceCount);
    expect(svg.querySelectorAll('g.surface-points circle').length).toBe(originalPointCount);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.getAttribute('height')).toBe('100%');
    viewBox = parseViewBox(svg);
    expect(viewBox[0]).toBeLessThan(0);
    expect(viewBox[1]).toBeLessThan(0);
    expect(svg.getAttribute('data-surface-base-width')).toBe('500');
    expect(svg.getAttribute('data-surface-base-height')).toBe('500');

    surface.draw();
    await flushMany(8);

    expect(svg.querySelectorAll('g.surface-faces polygon').length).toBe(originalFaceCount);
    expect(svg.querySelectorAll('g.surface-points circle').length).toBe(originalPointCount);
  });
});
