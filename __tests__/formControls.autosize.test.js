const loadSharedModules = () => {
  require('../js/vendor.js');
  require('../js/shared/fileIO.js');
  require('../js/shared/debounce.js');
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
};

const bootstrapApp = () => {
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
};

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

  test('autoSizeSelect applies width respecting minimum constraints', () => {
    loadSharedModules();
    const { formControls } = window.Shared;
    const measure = formControls.ensureSelectMeasure(document);
    Object.defineProperty(measure, 'offsetWidth', {
      configurable: true,
      get(){
        const length = (this.textContent || '').length;
        return length * 9;
      }
    });

    const select = document.createElement('select');
    select.dataset.minSelectWidth = '150';
    const optionA = document.createElement('option');
    optionA.textContent = 'A';
    select.appendChild(optionA);
    const optionB = document.createElement('option');
    optionB.textContent = 'B';
    select.appendChild(optionB);
    document.body.appendChild(select);

    formControls.autoSizeSelect(select);
    expect(select.style.width).toBe('150px');
    expect(select.style.minWidth).toBe('150px');

    select.removeAttribute('data-min-select-width');
    const optionLong = document.createElement('option');
    optionLong.textContent = 'Longest label here';
    select.appendChild(optionLong);
    formControls.autoSizeSelect(select);
    const measuredWidth = parseInt(select.style.width, 10);
    expect(Number.isNaN(measuredWidth)).toBe(false);
    expect(measuredWidth).toBeGreaterThanOrEqual(optionLong.textContent.length * 9 + 1);

    delete measure.offsetWidth;
  });

  test('components trigger select auto-size when values change', async () => {
    loadSharedModules();
    const { formControls } = window.Shared;
    const autoSizeSpy = jest.spyOn(formControls, 'autoSizeSelect');
    bootstrapApp();

    const ensureComponent = (name) => {
      const component = window.Components?.[name];
      if(!component){ return; }
      if(typeof component.ensure === 'function'){
        component.ensure();
        return;
      }
      if(typeof component.init === 'function'){
        component.init();
      }
    };

    const componentsToEnsure = ['scatter','line','box','venn','pca','heatmap','roc','pie','survival'];
    componentsToEnsure.forEach(ensureComponent);

    await new Promise(resolve => setTimeout(resolve, 0));
    autoSizeSpy.mockClear();

    const interactions = [
      { id: 'scatterGraphType', value: 'volcano' },
      { id: 'lineRegressionMode', value: 'quadratic' },
      { id: 'boxGraphType', value: 'violin' },
      { id: 'regionSelect', value: 'B' },
      { id: 'pcaViewMode', value: '3d' },
      { id: 'heatmapView', value: 'values' },
      { id: 'rocGraphType', value: 'pr' },
      { id: 'pieChartType', value: 'donut' }
    ];

    let survivalCovariateSelect = document.querySelector('#survivalCovariateControls select');
    if(!survivalCovariateSelect){
      const survivalState = window.Components?.survival?.__getState?.();
      if(survivalState?.hot?.loadData){
        survivalState.hot.loadData([
          ['A', 1, 1, 0, 10, '', ''],
          ['A', 2, 0, 0, 12, '', ''],
          ['B', 1.4, 1, 0, 9, '', ''],
          ['B', 3.1, 0, 0, 11, '', '']
        ]);
        window.Components?.survival?.draw?.();
        await new Promise(resolve => setTimeout(resolve, 0));
        survivalCovariateSelect = document.querySelector('#survivalCovariateControls select');
      }
    }
    if(survivalCovariateSelect){
      survivalCovariateSelect.value = survivalCovariateSelect.value === 'time' ? 'baseline' : 'time';
      survivalCovariateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    interactions.forEach(({ id, value }) => {
      const select = document.getElementById(id);
      expect(select).toBeTruthy();
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const scatterSelect = document.getElementById('scatterGraphType');
    const preMutationCalls = autoSizeSpy.mock.calls.length;
    const longOption = document.createElement('option');
    longOption.value = 'long-option';
    longOption.textContent = 'Extremely verbose scatter option label';
    scatterSelect.appendChild(longOption);

    await new Promise(resolve => setTimeout(resolve, 0));

    const expectedInteractionCount = interactions.length + (survivalCovariateSelect ? 1 : 0);
    expect(autoSizeSpy.mock.calls.length).toBeGreaterThanOrEqual(expectedInteractionCount + 1);
    expect(autoSizeSpy.mock.calls.length).toBeGreaterThan(preMutationCalls);
  }, 30000);
});
