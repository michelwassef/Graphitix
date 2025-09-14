// Global test setup that runs before modules are loaded.
// - Provides DOM-related polyfills and library stubs used by js/main.js

const { TextEncoder, TextDecoder } = require('util');

// Console noise control: keep debug but mark clearly
// (Developers can filter these in CI if needed)
const origDebug = console.debug;
console.debug = (...args) => origDebug('[test-debug]', ...args); // Debug: test wrapper for debug logs

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
    HT_CALLS.push({ type: 'construct', containerId: container?.id, opts });
  }
  loadData(d) { this._data = d; HT_CALLS.push({ type: 'loadData', containerId: this._container?.id, rows: d?.length, firstRow: Array.isArray(d?.[0]) ? d[0] : null }); }
  getData() { return this._data; }
  countRows() { return this._data?.length || 0; }
  countCols() { return Array.isArray(this._data?.[0]) ? this._data[0].length : 0; }
  getSelectedLast() { return this._selected; }
  getDataAtRow(r) { return this._data?.[r] || []; }
  getDataAtCol(c) { return (this._data || []).map(row => row?.[c]); }
  updateSettings({ data, minRows, minCols } = {}) {
    if (data) this._data = data;
    // no-op for minRows/minCols, but keep API compatible
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

