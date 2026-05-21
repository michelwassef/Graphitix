// Global test setup that runs before modules are loaded.
// - Provides DOM-related polyfills and library stubs used by js/main.js

const { TextEncoder, TextDecoder } = require('util');
const { createJStatTestStub } = require('../helpers/jstatTestStub');
require('../../js/shared/palette.js');
require('../../js/shared/performance.js');
require('../../js/shared/workspaceToolbarAccess.js');
require('../../js/shared/workspaceToolbar.js');

// Console noise control.
// - console.error: tracked and fails tests by default unless explicitly mocked/allowed.
// - console.warn/log/debug/time: suppressed by default to keep test output clean.
const origDebug = console.debug;
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
const origTime = console.time;
const origTimeEnd = console.timeEnd;
let debugLoggingDefault = process.env.TEST_DEBUG_LOGS === '1';
let allowDebugLogging = debugLoggingDefault;
const strictConsoleErrors = process.env.TEST_STRICT_CONSOLE_ERRORS !== '0';
let unexpectedConsoleErrors = [];
global.__restoreTestDebugLogs = () => {
  allowDebugLogging = debugLoggingDefault;
  return allowDebugLogging;
};
global.__suppressTestDebugLogs = () => { allowDebugLogging = false; };
global.__setTestDebugLoggingDefault = (value) => {
  debugLoggingDefault = !!value;
  allowDebugLogging = debugLoggingDefault;
};
global.__clearUnexpectedConsoleErrors = () => {
  unexpectedConsoleErrors = [];
};
global.__consumeUnexpectedConsoleErrors = () => {
  const consumed = unexpectedConsoleErrors.slice();
  unexpectedConsoleErrors = [];
  return consumed;
};
global.__isStrictConsoleErrorsEnabled = () => strictConsoleErrors;
console.debug = (...args) => {
  if (!allowDebugLogging) {
    return;
  }
  origDebug('[test-debug]', ...args);
};
console.log = (...args) => {
  if (!allowDebugLogging) {
    return;
  }
  origLog(...args);
};
console.warn = (...args) => {
  if (!allowDebugLogging) {
    return;
  }
  origWarn(...args);
};
// Tests that intentionally trigger errors should use:
//   jest.spyOn(console, 'error').mockImplementation(() => {});
console.error = (...args) => {
  unexpectedConsoleErrors.push(args);
  origError(...args);
};
console.time = (label) => {
  if (!allowDebugLogging) {
    return;
  }
  origTime(label);
};
console.timeEnd = (label) => {
  if (!allowDebugLogging) {
    return;
  }
  origTimeEnd(label);
};

// Polyfills that jsdom may not provide by default
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// requestAnimationFrame/cancelAnimationFrame - fast microtask implementation
(() => {
  const now = () => (global.performance && typeof global.performance.now === 'function'
    ? global.performance.now()
    : Date.now());
  let rafId = 0;
  const scheduled = new Map();
  const schedule = (cb) => setTimeout(cb, 0);
  const fastRaf = (cb) => {
    const id = ++rafId;
    const handle = schedule(() => {
      scheduled.delete(id);
      try {
        cb(now());
      } catch (err) {
        origError('requestAnimationFrame callback error', err);
      }
    });
    scheduled.set(id, handle);
    return id;
  };
  const fastCancel = (id) => {
    const handle = scheduled.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      scheduled.delete(id);
    }
  };
  global.requestAnimationFrame = fastRaf;
  global.cancelAnimationFrame = fastCancel;
})();

// ResizeObserver minimal stub
class RO {
  constructor(cb) { this._cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!global.ResizeObserver) {
  global.ResizeObserver = RO;
}

// URL.createObjectURL stub for export flows
if (!global.URL) global.URL = {};
if (!global.URL.createObjectURL) {
  global.URL.createObjectURL = () => 'blob://test';
}
if (!global.URL.revokeObjectURL) {
  global.URL.revokeObjectURL = () => {};
}

// Image.decode stub
global.Image = class ImageStub {
  set src(v) { this._src = v; }
  async decode() { return; }
};

if(global.HTMLCanvasElement){
  const originalGetContext = global.HTMLCanvasElement.prototype.getContext;
  global.HTMLCanvasElement.prototype.getContext = function(type){
    const normalizedType = String(type || '');
    if(normalizedType.toLowerCase() === '2d'){
      const ctx = {
        font: '10px sans-serif',
        measureText(text){
          const content = String(text || '');
          const width = content.length * 8;
          console.debug('Debug: canvas measureText stub', { text: content, width }); // Debug: canvas measurement fallback
          return { width };
        }
      };
      console.debug('Debug: canvas getContext stub created', { type: normalizedType }); // Debug: canvas context stub creation
      return ctx;
    }
    if(typeof originalGetContext === 'function'){
      return originalGetContext.call(this, type);
    }
    console.debug('Debug: canvas getContext stub ignored', { type: normalizedType }); // Debug: canvas stub non-2d request
    return null;
  };
}

// Minimal Chart.js stub to satisfy Chart.defaults and new Chart(...)
const ChartStub = function Chart(ctx, config) {
  this.ctx = ctx;
  this.config = config;
  this.data = config?.data || {};
  this.destroy = () => {};
};
ChartStub.defaults = { locale: 'en-US' }; // will be reassigned by main.js
global.Chart = ChartStub;

// Minimal XLSX namespace stub (only accessed dynamically; keep soft)
global.XLSX = undefined; // main.js loads it dynamically when needed

// Minimal SVD-JS stub for PCA/MDS paths in integration suites.
if (!global.SVDJS) {
  global.SVDJS = {
    SVD(matrix = []) {
      const rows = Array.isArray(matrix) ? matrix.length : 0;
      const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
      const components = Math.max(1, Math.min(rows || 1, cols || 1, 3));
      const q = Array.from({ length: components }, (_, idx) => components - idx + 1);
      const u = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: components }, (_, k) => ((r + 1) / (components + k + 1)))
      );
      const v = Array.from({ length: cols }, (_, c) =>
        Array.from({ length: components }, (_, k) => ((c + 1) / (components + k + 1)))
      );
      return { u, v, q };
    }
  };
}
if (global.window && !global.window.SVDJS) {
  global.window.SVDJS = global.SVDJS;
}

if (!global.jStat) {
  global.jStat = createJStatTestStub();
}
if (global.window && !global.window.jStat) {
  global.window.jStat = global.jStat;
}

// AG Grid stub with basic grid behavior and call tracking
const GRID_CALLS = [];
const createGridApi = (options = {}) => {
  const api = {
    _columnDefs: options.columnDefs || [],
    _rowData: Array.isArray(options.rowData) ? options.rowData : [],
    setColumnDefs(defs) {
      this._columnDefs = defs || [];
      GRID_CALLS.push({ type: 'setColumnDefs' });
    },
    setRowData(rows) {
      this._rowData = Array.isArray(rows) ? rows : [];
      GRID_CALLS.push({ type: 'setRowData', rows: this._rowData.length });
    },
    setGridOption(key, value) {
      if (key === 'columnDefs') { this.setColumnDefs(value); return; }
      if (key === 'rowData') { this.setRowData(value); return; }
      this[key] = value;
    },
    applyTransaction(tx = {}) {
      if (Array.isArray(tx.add) && tx.add.length) {
        this._rowData.push(...tx.add);
        GRID_CALLS.push({ type: 'applyTransaction', add: tx.add.length });
      }
      return { add: tx.add || [] };
    },
    refreshCells() { GRID_CALLS.push({ type: 'refreshCells' }); },
    setHeaderHeight(h) { this._headerHeight = h; GRID_CALLS.push({ type: 'setHeaderHeight', h }); },
    getDisplayedRowAtIndex(index) { const data = this._rowData?.[index]; return data ? { data, rowIndex: index } : null; },
    getDisplayedRowCount() { return Array.isArray(this._rowData) ? this._rowData.length : 0; },
    ensureIndexVisible() {},
    destroy() { GRID_CALLS.push({ type: 'destroy' }); }
  };
  api.columnApi = api;
  return api;
};

const createGrid = (container, options = {}) => {
  const api = createGridApi(options);
  GRID_CALLS.push({ type: 'construct', containerId: container?.id || null });
  if (typeof options.onGridReady === 'function') {
    options.onGridReady({ api, columnApi: api });
  }
  return api;
};

global.agGrid = {
  createGrid,
  Grid: function Grid(container, options) { return createGrid(container, options); },
  ModuleRegistry: { registeredModules: [] }
};
if (global.window && !global.window.agGrid) {
  global.window.agGrid = global.agGrid;
}
global.__GRID_CALLS__ = GRID_CALLS;
global.__resetGrid__ = () => { GRID_CALLS.splice(0, GRID_CALLS.length); };

// Shared polling helper available in all test suites.
// Polls predicate every `interval` ms until truthy or timeout expires.
global.waitFor = async function waitFor(predicate, { timeout = 8000, interval = 30 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  const final = predicate();
  if (final) return final;
  throw new Error(`waitFor timed out after ${timeout}ms`);
};
