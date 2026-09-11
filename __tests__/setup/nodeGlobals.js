'use strict';

// Node-layer modules in this application publish CommonJS-style namespaces on
// window because production scripts run in a browser.  This is only a small
// namespace bridge; it intentionally provides no DOM, HTML fixture, vendor
// fake, timer shim, or application bootstrap.
global.window = global;
global.self = global;
global.Shared = {};
global.Components = {};
global.Main = {};

// Keep lightweight layers quiet by default. Intentional log assertions can
// install a spy after beforeEach without inheriting application debug noise.
console.debug = () => {};
console.log = () => {};
console.warn = () => {};

const jStatModule = require('jstat');
global.jStat = jStatModule?.jStat || jStatModule;

if (typeof global.Blob === 'undefined') {
  global.Blob = class Blob {
    constructor(parts = [], options = {}) {
      this.parts = parts;
      this.type = options.type || '';
    }
  };
}
