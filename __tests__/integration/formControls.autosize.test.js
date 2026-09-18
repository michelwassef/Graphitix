const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(90_000);

const INTERACTIONS = Object.freeze([
  { component: 'scatter', id: 'scatterGraphType', value: 'volcano' },
  { component: 'line', id: 'lineRegressionMode', value: 'quadratic' },
  { component: 'box', id: 'boxGraphType', value: 'violin' },
  { component: 'venn', id: 'regionSelect', value: 'B' },
  { component: 'pca', id: 'pcaViewMode', value: '3d' },
  { component: 'heatmap', id: 'heatmapView', value: 'values' },
  { component: 'roc', id: 'rocGraphType', value: 'pr' },
  { component: 'pie', id: 'pieChartType', value: 'donut' }
]);

async function flushAsyncWork(iterations = 2) {
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function activateWorkspace(type) {
  const selectGraph = window.Main?.tabs?.handleGraphSelection;
  expect(typeof selectGraph).toBe('function');
  const maybePromise = selectGraph(type, { reason: 'form-controls-autosize-test' });
  if (maybePromise && typeof maybePromise.then === 'function') {
    await maybePromise;
  }
  const duplicatePrompt = document.getElementById('duplicatePrompt');
  if (duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')) {
    const emptyButton = document.getElementById('duplicateEmpty');
    expect(emptyButton).toBeTruthy();
    emptyButton.click();
  }
  await flushAsyncWork();
}

function ensureComponent(name) {
  const component = window.Components?.[name];
  expect(component).toBeTruthy();
  const ensure = component.ensure || component.init;
  expect(typeof ensure).toBe('function');
  ensure.call(component);
}

async function prepareSurvivalCovariateSelect() {
  await activateWorkspace('survival');
  let select = document.querySelector('#survivalCovariateControls select');
  if (!select) {
    const state = window.Components?.survival?.__getState?.();
    expect(state?.hot?.loadData).toBeInstanceOf(Function);
    state.hot.loadData([
      ['A', 1, 1, 0, 10, '', ''],
      ['A', 2, 0, 0, 12, '', ''],
      ['B', 1.4, 1, 0, 9, '', ''],
      ['B', 3.1, 0, 0, 11, '', '']
    ]);
    window.Components.survival.draw();
    await flushAsyncWork(2);
    select = document.querySelector('#survivalCovariateControls select');
  }
  expect(select).toBeTruthy();
  return select;
}

describe('Shared formControls auto-sizing', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test.each(INTERACTIONS)('$component select changes trigger auto-size', async ({ component, id, value }) => {
    loadProductionBootstrap({ vendorMode: 'fake' });
    const autoSizeSpy = jest.spyOn(window.Shared.formControls, 'autoSizeSelect');

    await activateWorkspace(component);
    ensureComponent(component);
    const select = document.getElementById(id);
    expect(select).toBeTruthy();
    const callsBeforeChange = autoSizeSpy.mock.calls.length;

    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork();

    expect(autoSizeSpy.mock.calls.length).toBeGreaterThan(callsBeforeChange);
  });

  test('survival covariate changes trigger auto-size after data creates the control', async () => {
    loadProductionBootstrap({ vendorMode: 'fake' });
    const autoSizeSpy = jest.spyOn(window.Shared.formControls, 'autoSizeSelect');
    const select = await prepareSurvivalCovariateSelect();
    const callsBeforeChange = autoSizeSpy.mock.calls.length;

    select.value = select.value === 'time' ? 'baseline' : 'time';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork();

    expect(autoSizeSpy.mock.calls.length).toBeGreaterThan(callsBeforeChange);
  });

  test('adding a long Scatter option triggers auto-size without broad component preload', async () => {
    loadProductionBootstrap({ vendorMode: 'fake' });
    const autoSizeSpy = jest.spyOn(window.Shared.formControls, 'autoSizeSelect');
    await activateWorkspace('scatter');
    ensureComponent('scatter');
    const select = document.getElementById('scatterGraphType');
    expect(select).toBeTruthy();
    const callsBeforeMutation = autoSizeSpy.mock.calls.length;

    const option = document.createElement('option');
    option.value = 'long-option';
    option.textContent = 'Extremely verbose scatter option label';
    select.appendChild(option);
    await flushAsyncWork();

    expect(autoSizeSpy.mock.calls.length).toBeGreaterThan(callsBeforeMutation);
  });
});
