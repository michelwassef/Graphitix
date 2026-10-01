'use strict';

function setupHotAggridBindingFixture() {
  let originalAgGrid;

  let capturedGridOptions;

  let capturedApi;

  const dispatchTouchPointerEvent = (target, type, overrides = {}) => {
    const event = new global.window.Event(type, { bubbles: true, cancelable: true });
    const payload = Object.assign({
      pointerType: 'touch',
      pointerId: 1,
      clientX: 16,
      clientY: 16
    }, overrides);
    Object.entries(payload).forEach(([key, value]) => {
      Object.defineProperty(event, key, {
        configurable: true,
        value
      });
    });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    jest.resetModules();
    capturedGridOptions = null;
    capturedApi = null;

    originalAgGrid = global.window?.agGrid;
    const api = {
      refreshHeader: jest.fn(),
      refreshCells: jest.fn(),
      setRowData: jest.fn(next => {
        if (capturedGridOptions) {
          capturedGridOptions.rowData = next;
        }
      }),
      setColumnDefs: jest.fn(next => {
        if (capturedGridOptions) {
          capturedGridOptions.columnDefs = next;
        }
      }),
      startEditingCell: jest.fn(),
      destroy: jest.fn(),
      getFocusedCell: jest.fn(() => null),
      getEditingCells: jest.fn(() => [])
    };
    capturedApi = api;

    global.window.agGrid = {
      createGrid: (container, gridOptions) => {
        capturedGridOptions = gridOptions;
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    require('../js/vendor.js');
    require('../js/shared/agGridAdapter.js');
    require('../js/shared/undo.js');
    require('../js/shared/formulaEngine.js');
    require('../js/shared/hot.js');

    const manager = global.window?.Shared?.undoManager;
    if(manager && typeof manager.clear === 'function'){
      manager.clear();
    }
  });

  afterEach(() => {
    global.window.agGrid = originalAgGrid;
    delete global.window.Main;
    delete global.window.Components;
    capturedGridOptions = null;
    capturedApi = null;
  });
  return {
    get originalAgGrid() { return originalAgGrid; },
    get capturedGridOptions() { return capturedGridOptions; },
    set capturedGridOptions(value) { capturedGridOptions = value; },
    get capturedApi() { return capturedApi; },
    set capturedApi(value) { capturedApi = value; },
    dispatchTouchPointerEvent
  };
}

module.exports = { setupHotAggridBindingFixture };
