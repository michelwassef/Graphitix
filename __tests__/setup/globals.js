// Global test setup that runs before modules are loaded.
// - Provides DOM-related polyfills and library stubs used by js/main.js

const { TextEncoder, TextDecoder } = require('util');

// Console noise control: keep debug but mark clearly
// (Developers can filter these in CI if needed)
const origDebug = console.debug;
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
let allowDebugLogging = true;
global.__restoreTestDebugLogs = () => { allowDebugLogging = true; };
global.__suppressTestDebugLogs = () => { allowDebugLogging = false; };
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

// Polyfills that jsdom may not provide by default
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// requestAnimationFrame/cancelAnimationFrame - immediate flush
if (!global.requestAnimationFrame) {
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}
if (!global.cancelAnimationFrame) {
  global.cancelAnimationFrame = (id) => clearTimeout(id);
}

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

// Handsontable stub with basic grid behavior and call tracking
const HT_CALLS = [];
class HandsontableInstance {
  constructor(container, opts = {}) {
    this._container = container;
    this._data = (opts && opts.data) || [];
    this._settings = opts || {};
    this._selected = null;
    this.rootElement = container;
    HT_CALLS.push({ type: 'construct', containerId: container?.id, opts });
  }
  loadData(d) { this._data = d; HT_CALLS.push({ type: 'loadData', containerId: this._container?.id, rows: d?.length, firstRow: Array.isArray(d?.[0]) ? d[0] : null }); }
  getData() { return this._data; }
  countRows() { return this._data?.length || 0; }
  countCols() { return Array.isArray(this._data?.[0]) ? this._data[0].length : 0; }
  getSelectedLast() { return this._selected; }
  getDataAtRow(r) { return this._data?.[r] || []; }
  getDataAtCell(r, c) {
    const value = this._data?.[r]?.[c];
    console.debug('Debug: Handsontable stub getDataAtCell',{ row: r, col: c, value });
    return value;
  }
  getDataAtCol(c) { return (this._data || []).map(row => row?.[c]); }
  updateSettings({ data, minRows, minCols } = {}) {
    if (data) {
      this._data = data;
    }
    if (typeof minRows === 'number') {
      this._settings.minRows = minRows;
    }
    if (typeof minCols === 'number') {
      this._settings.minCols = minCols;
    }
    HT_CALLS.push({
      type: 'updateSettings',
      containerId: this._container?.id,
      hasData: !!data,
      minRows: this._settings.minRows,
      minCols: this._settings.minCols
    });
  }
  getSettings() { return Object.assign({}, this._settings); }
  setDataAtCell(rowOrChanges, col, value, source) {
    let entries = [];
    if (Array.isArray(rowOrChanges)) {
      if (Array.isArray(rowOrChanges[0])) {
        entries = rowOrChanges;
        source = col;
      } else if (typeof col === 'number') {
        entries = [[rowOrChanges, col, value]];
      }
    }
    entries.forEach(([r, c, val]) => {
      if (!Array.isArray(this._data[r])) {
        const cols = Math.max(this.countCols(), (this._settings.minCols || 0));
        this._data[r] = Array.from({ length: cols }, () => '');
      }
      if (this._data[r][c] === undefined) {
        this._data[r][c] = '';
      }
      this._data[r][c] = val;
    });
    HT_CALLS.push({ type: 'setDataAtCell', containerId: this._container?.id, entries, source });
  }
  populateFromArray(row, col, input, endRow, endCol, _method, source) {
    const rows = input || [];
    const entries = [];
    for (let r = 0; r < rows.length; r += 1) {
      const srcRow = rows[r] || [];
      for (let c = 0; c < srcRow.length; c += 1) {
        const destRow = row + r;
        const destCol = col + c;
        if (!Array.isArray(this._data[destRow])) {
          const cols = Math.max(this.countCols(), (this._settings.minCols || 0), (endCol || destCol) + 1);
          this._data[destRow] = Array.from({ length: cols }, () => '');
        }
        this._data[destRow][destCol] = srcRow[c];
        entries.push([destRow, destCol, srcRow[c]]);
      }
    }
    HT_CALLS.push({ type: 'populateFromArray', containerId: this._container?.id, entries, source });
  }
  alter(action, index, amount = 1, source) {
    const size = Math.max(0, amount);
    if (action === 'insert_row') {
      for (let i = 0; i < size; i += 1) {
        const cols = Math.max(this.countCols(), this._settings.minCols || 0);
        this._data.splice(index, 0, Array.from({ length: cols }, () => ''));
      }
    } else if (action === 'remove_row') {
      this._data.splice(index, size);
    } else if (action === 'insert_col') {
      const rows = Math.max(this.countRows(), this._settings.minRows || 0);
      for (let r = 0; r < rows; r += 1) {
        if (!Array.isArray(this._data[r])) {
          this._data[r] = [];
        }
        this._data[r].splice(index, 0, ...Array.from({ length: size }, () => ''));
      }
    } else if (action === 'remove_col') {
      for (let r = 0; r < this.countRows(); r += 1) {
        if (Array.isArray(this._data[r])) {
          this._data[r].splice(index, size);
        }
      }
    }
    HT_CALLS.push({ type: 'alter', containerId: this._container?.id, action, index, amount: size, source });
  }
  batch(cb) {
    HT_CALLS.push({ type: 'batch.start', containerId: this._container?.id });
    try {
      cb();
    } finally {
      HT_CALLS.push({ type: 'batch.end', containerId: this._container?.id });
    }
  }
  render() {
    HT_CALLS.push({ type: 'render', containerId: this._container?.id });
  }
}
function Handsontable(container, opts) {
  return new HandsontableInstance(container, opts);
}
Handsontable.helper = {
  createEmptySpreadsheetData(rows = 0, cols = 0) {
    const out = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
    return out;
  }
};
Handsontable.renderers = {
  TextRenderer: function() {}
};
Handsontable.plugins = Handsontable.plugins || {};
HandsontableInstance.prototype.constructor = Handsontable;
global.Handsontable = Handsontable;

// Expose tracking for tests
global.__HT_CALLS__ = HT_CALLS;
global.__resetHT__ = () => { HT_CALLS.splice(0, HT_CALLS.length); };

