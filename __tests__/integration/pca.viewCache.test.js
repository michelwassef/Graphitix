jest.setTimeout(180000);

const { installPcaViewProductionFixture } = require('../../test-support/pcaViewFixture');
const { installSvgTextGeometry } = require('../setup/svgTextGeometry');

describe('PCA view cache controls', () => {
  let restoreSvgTextGeometry = null;
  const flush = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const flushAll = async (count = 10) => {
    for (let i = 0; i < count; i += 1) {
      await flush();
    }
  };
  const flushUntil = async (predicate, { limit = 50, step = 1 } = {}) => {
    for (let attempt = 0; attempt < limit; attempt += 1) {
      if (predicate()) {
        return true;
      }
      await flushAll(step);
    }
    throw new Error('flushUntil timed out');
  };
  const activateWorkspace = async (type) => {
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const result = graphSelection(type);
    if (result && typeof result.then === 'function') {
      await result;
    }
    await Promise.resolve();
  };

  beforeEach(async () => {
    jest.resetModules();
    installPcaViewProductionFixture();
    restoreSvgTextGeometry = installSvgTextGeometry();
    await activateWorkspace('pca');
    const activePcaTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    window.Components?.pca?.ensure?.({
      tabId: activePcaTabId,
      root: document.getElementById('pcaPage'),
      reason: 'pca-view-cache-test-ensure'
    });
    await flushAll();
  });

  afterEach(() => {
    restoreSvgTextGeometry?.();
    restoreSvgTextGeometry = null;
  });

  test('view-only styling updates and 3D rotation reuse cached PCA geometry', async () => {
    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();
    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Label point', true, false, false, false],
      ['Variable', 'S1', 'S2', 'S3', 'S4'],
      ['Var1', 1, 2, 3, 6],
      ['Var2', 2, 1, 4, 5],
      ['Var3', 3, 4, 1, 2],
      ['Var4', 6, 2, 5, 1]
    ]);
    const includeAllAxesToggle = document.getElementById('pcaIncludeNonRetainedAxes');
    expect(includeAllAxesToggle).toBeTruthy();
    includeAllAxesToggle.checked = true;
    includeAllAxesToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);
    await flushUntil(() => state.cachedRender?.dimensionMeta?.length >= 3, { limit: 80, step: 2 });
    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > 0, { limit: 80, step: 2 });

    const initialCache = state.cachedRender;
    expect(initialCache).toBeTruthy();
    const initialSvd = global.__svdCallCount;
    expect(initialSvd).toBeGreaterThan(0);
    let lastDrawTimestamp = state.performance?.draw?.timestamp || 0;
    const waitForDraw = async () => {
      await flushUntil(() => {
        const ts = state.performance?.draw?.timestamp || 0;
        return ts > lastDrawTimestamp;
      }, { limit: 80, step: 2 });
      lastDrawTimestamp = state.performance?.draw?.timestamp || lastDrawTimestamp;
    };
    const expectViewOnlyRefresh = (expectedReason) => {
      expect(global.__svdCallCount).toBe(initialSvd);
      expect(state.dataDirty).toBe(false);
      expect(state.viewDirty).toBe(false);
      expect(state.cachedRender).toBe(initialCache);
      const drawPerf = state.performance?.draw;
      expect(drawPerf).toBeTruthy();
      expect(drawPerf.viewOnly).toBe(true);
      expect(drawPerf.cacheReused).toBe(true);
      if (expectedReason) {
        expect(drawPerf.reason).toBe(expectedReason);
      }
    };

    const legendToggle = document.getElementById('pcaShowLegend');
    expect(legendToggle).toBeTruthy();
    const initialLegendState = legendToggle.checked;
    legendToggle.checked = !initialLegendState;
    legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForDraw();
    expectViewOnlyRefresh('legend-toggle');

    legendToggle.checked = initialLegendState;
    legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForDraw();
    expectViewOnlyRefresh('legend-toggle');

    const svg = document.querySelector('#pcaPlot svg');
    expect(svg).toBeTruthy();
    const axisLine = svg.querySelector('line[data-axis-control="1"]');
    expect(axisLine).toBeTruthy();
    axisLine.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUntil(() => {
      const panel = document.querySelector('.axis-controls-panel');
      return panel && panel.dataset.open === '1';
    }, { limit: 20, step: 1 });
    const panel = document.querySelector('.axis-controls-panel');
    expect(panel).toBeTruthy();
    const styleChip = panel.querySelector('.shared-border-style-chip');
    expect(styleChip).toBeTruthy();
    styleChip.click();
    const thicknessInput = document.querySelector(
      '.shared-color-picker__section--axis-style input[aria-label="Thickness"]'
    );
    expect(thicknessInput).toBeTruthy();
    thicknessInput.value = '2';
    thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForDraw();
    expectViewOnlyRefresh('axis-stroke-width');
    expect(state.axisSettings.strokeWidth).toBe(2);
    expect(thicknessInput.value).toBe('2');

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(2);

    const viewSelect = document.getElementById('pcaViewMode');
    expect(viewSelect).toBeTruthy();
    viewSelect.value = '3d';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForDraw();
    const svg3d = document.querySelector('#pcaPlot svg');
    expect(svg3d).toBeTruthy();
    expect(svg3d.dataset.viewMode).toBe('3d');
    expectViewOnlyRefresh('view-mode-change');

    const rotationBefore = { x: state.rotation.x, y: state.rotation.y, z: state.rotation.z };
    state.rotation = window.Shared.plot3d.createRotationState({
      x: rotationBefore.x + 0.2,
      y: rotationBefore.y,
      z: rotationBefore.z
    });
    state.rotationPending = true;
    state.viewDirty = true;
    state.scheduleDraw({ viewOnly: true, reason: 'rotation-test' });
    await waitForDraw();
    expectViewOnlyRefresh('rotation-test');
    expect(state.rotation.x).not.toBe(rotationBefore.x);
    expect(state.rotationPending).toBe(false);
  });
});
