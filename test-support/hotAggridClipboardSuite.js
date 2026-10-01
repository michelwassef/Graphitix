'use strict';

function setupHotAggridClipboardFixture() {
  let originalAgGrid;
  let capturedGridOptions;
  let capturedApi;
  let originalClipboard;
  let originalMain;
  let createdTables;

  beforeEach(() => {
    jest.resetModules();
    capturedGridOptions = null;
    capturedApi = null;
    createdTables = [];

    originalAgGrid = global.window?.agGrid;
    originalClipboard = global.window?.navigator?.clipboard;
    originalMain = global.window?.Main;
    const api = {
      refreshCells: jest.fn(),
      setRowData: jest.fn(next => {
        if (capturedGridOptions) capturedGridOptions.rowData = next;
      }),
      setColumnDefs: jest.fn(next => {
        if (capturedGridOptions) capturedGridOptions.columnDefs = next;
      }),
      destroy: jest.fn(),
      getFocusedCell: jest.fn(() => null)
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
    require('../js/shared/undo.js');
    require('../js/shared/agGridAdapter.js');
    require('../js/shared/hot.js');
    global.window?.Shared?.undoManager?.clear?.();
  });

  afterEach(() => {
    if (Array.isArray(createdTables)) {
      createdTables.forEach(table => {
        try {
          table?.destroy?.();
        } catch (_err) {
          // best-effort teardown
        }
      });
      createdTables.length = 0;
    }
    global.window?.Shared?.undoManager?.clear?.();
    global.window.agGrid = originalAgGrid;
    global.window.Main = originalMain;
    if (global.window?.navigator) {
      global.window.navigator.clipboard = originalClipboard;
    }
    if (global.document?.body) {
      global.document.body.innerHTML = '';
    }
    capturedGridOptions = null;
    capturedApi = null;
  });

  const waitForNextFrame = async () => {
    if (typeof global.window.requestAnimationFrame === 'function') {
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  };

  const createTable = (...args) => {
    const table = global.window.Shared.hot.createStandardTable(...args);
    createdTables.push(table);
    return table;
  };

  const undoUntil = (undoManager, predicate, maxSteps = 8) => {
    if (typeof predicate !== 'function') {
      return { reached: false, steps: 0 };
    }
    if (predicate()) {
      return { reached: true, steps: 0 };
    }
    let steps = 0;
    while (steps < maxSteps) {
      const didUndo = undoManager?.undo?.() === true;
      if (!didUndo) {
        return { reached: !!predicate(), steps };
      }
      steps += 1;
      if (predicate()) {
        return { reached: true, steps };
      }
    }
    return { reached: !!predicate(), steps };
  };

  const redoUntil = (undoManager, predicate, maxSteps = 8) => {
    if (typeof predicate !== 'function') {
      return { reached: false, steps: 0 };
    }
    if (predicate()) {
      return { reached: true, steps: 0 };
    }
    let steps = 0;
    while (steps < maxSteps) {
      const didRedo = undoManager?.redo?.() === true;
      if (!didRedo) {
        return { reached: !!predicate(), steps };
      }
      steps += 1;
      if (predicate()) {
        return { reached: true, steps };
      }
    }
    return { reached: !!predicate(), steps };
  };

  return {
    get originalAgGrid() { return originalAgGrid; },
    get capturedGridOptions() { return capturedGridOptions; },
    set capturedGridOptions(value) { capturedGridOptions = value; },
    get capturedApi() { return capturedApi; },
    set capturedApi(value) { capturedApi = value; },
    get originalClipboard() { return originalClipboard; },
    get originalMain() { return originalMain; },
    get createdTables() { return createdTables; },
    waitForNextFrame,
    createTable,
    undoUntil,
    redoUntil
  };
}

module.exports = { setupHotAggridClipboardFixture };
