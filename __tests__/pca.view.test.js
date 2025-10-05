describe('PCA view controls', () => {
  const flush = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const flushAll = async (count = 10) => {
    for (let i = 0; i < count; i += 1) {
      await flush();
    }
  };

  beforeEach(async () => {
    jest.resetModules();
    global.SVDJS = {
      SVD(matrix = []) {
        const rows = Array.isArray(matrix) ? matrix.length : 0;
        const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
        const componentCount = Math.max(1, Math.min(rows, cols, 3));
        const q = Array.from({ length: componentCount }, (_, idx) => componentCount - idx + 1);
        const u = Array.from({ length: rows }, (_, r) =>
          Array.from({ length: componentCount }, (_, k) => ((r + 1) / (componentCount + k + 1)))
        );
        const v = Array.from({ length: cols }, (_, c) =>
          Array.from({ length: componentCount }, (_, k) => ((c + 1) / (componentCount + k + 1)))
        );
        return { u, v, q };
      }
    };
    global.jStat = {
      mean(values = []) {
        const filtered = values.filter(v => typeof v === 'number');
        if (!filtered.length) return 0;
        const sum = filtered.reduce((acc, v) => acc + v, 0);
        return sum / filtered.length;
      },
      stdev(values = [], flag) {
        const filtered = values.filter(v => typeof v === 'number');
        if (filtered.length < 2) return 0;
        const mean = filtered.reduce((acc, v) => acc + v, 0) / filtered.length;
        const variance = filtered.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
          (flag ? filtered.length : filtered.length - 1);
        return Math.sqrt(variance);
      }
    };
    require('../js/vendor.js');
    require('../js/shared/debounce.js');
    require('../js/shared/resizer.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/dom.js');
    require('../js/components/pca.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main.js');
    window.Components?.pca?.ensure?.();
    await flushAll();
  });

  test('PCA loadings render and 3D view persists in payload', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll();

    const loadingsContainer = document.getElementById('pcaLoadingsContainer');
    expect(loadingsContainer).toBeTruthy();
    expect(loadingsContainer.hidden).toBe(false);
    const initialTable = loadingsContainer.querySelector('#pcaLoadingsTable table');
    expect(initialTable).toBeTruthy();

    const viewSelect = document.getElementById('pcaViewMode');
    expect(viewSelect).toBeTruthy();
    viewSelect.value = '3d';
    viewSelect.dispatchEvent(new Event('change'));

    window.Components?.pca?.draw?.();
    await flushAll();

    const statsText = document.getElementById('pcaStatsResults')?.textContent || '';
    expect(statsText).not.toEqual('');
    const svg = document.querySelector('#pcaPlot svg');
    expect(svg).toBeTruthy();
    expect(svg.dataset.viewMode).toBe('3d');

    const table = document.querySelector('#pcaLoadingsTable table');
    expect(table).toBeTruthy();
    const headers = Array.from(table.querySelectorAll('th')).map(el => el.textContent.trim());
    expect(headers).toEqual(expect.arrayContaining(['Variable', 'PC1', 'PC2', 'PC3']));

    const payload = window.Components.pca.getPayload();
    expect(payload.config.viewMode).toBe('3d');
  });

  test('PCA scree data and eigen table export are generated for example dataset', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll();

    const screeContainer = document.getElementById('pcaScreeContainer');
    expect(screeContainer).toBeTruthy();
    expect(screeContainer.hidden).toBe(false);
    expect(screeContainer.querySelector('svg')).toBeTruthy();

    const varianceCard = document.getElementById('pcaVarianceSummary');
    expect(varianceCard).toBeTruthy();
    expect(varianceCard.hidden).toBe(false);
    const varianceItems = Array.from(varianceCard.querySelectorAll('li'));
    expect(varianceItems.length).toBeGreaterThan(0);

    const eigenContainer = document.getElementById('pcaEigenTableContainer');
    expect(eigenContainer).toBeTruthy();
    expect(eigenContainer.hidden).toBe(false);
    const eigenTable = document.querySelector('#pcaEigenTableWrapper table');
    expect(eigenTable).toBeTruthy();
    const exportBtn = document.getElementById('pcaExportEigenTable');
    expect(exportBtn).toBeTruthy();
    expect(exportBtn.disabled).toBe(false);

    const payload = window.Components.pca.getPayload();
    expect(payload.stats).toBeTruthy();
    expect(Array.isArray(payload.stats.eigenSummary)).toBe(true);
    expect(Array.isArray(payload.stats.scree)).toBe(true);
    expect(payload.stats.eigenSummary.length).toBeGreaterThan(0);
    expect(payload.stats.scree.length).toBe(payload.stats.eigenSummary.length);
    const firstEntry = payload.stats.eigenSummary[0];
    expect(firstEntry.component).toBe(1);
    expect(firstEntry.variancePercent).toBeGreaterThan(0);
    expect(varianceItems[0].textContent).toContain(`PC${firstEntry.component}`);
    const cumulative = payload.stats.eigenSummary.map(item => item.cumulativeVariancePercent);
    const sorted = [...cumulative].sort((a, b) => a - b);
    expect(cumulative).toEqual(sorted);
    const screeFirst = payload.stats.scree[0];
    expect(screeFirst.variancePercent).toBeCloseTo(firstEntry.variancePercent, 5);
  });
});

