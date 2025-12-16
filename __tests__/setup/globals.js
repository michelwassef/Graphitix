// Global test setup that runs before modules are loaded.
// - Provides DOM-related polyfills and library stubs used by js/main.js

const { TextEncoder, TextDecoder } = require('util');

// Console noise control: keep debug but mark clearly
// (Developers can filter these in CI if needed)
const origDebug = console.debug;
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
const origTime = console.time;
const origTimeEnd = console.timeEnd;
let debugLoggingDefault = process.env.TEST_DEBUG_LOGS === '1';
let allowDebugLogging = debugLoggingDefault;
global.__restoreTestDebugLogs = () => {
  allowDebugLogging = debugLoggingDefault;
  return allowDebugLogging;
};
global.__suppressTestDebugLogs = () => { allowDebugLogging = false; };
global.__setTestDebugLoggingDefault = (value) => {
  debugLoggingDefault = !!value;
  allowDebugLogging = debugLoggingDefault;
};
console.debug = (...args) => {
  if (!allowDebugLogging) {
    return;
  }
  origDebug('[test-debug]', ...args);
}; // Debug: test wrapper for debug logs
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
console.error = (...args) => {
  if (!allowDebugLogging) {
    return;
  }
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
