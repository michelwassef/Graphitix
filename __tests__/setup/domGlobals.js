'use strict';

const { TextEncoder, TextDecoder } = require('util');

if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// Minimal browser namespace for DOM-unit tests. The fixture is supplied by
// each suite; index.html and integration vendor shims are deliberately absent.
global.Shared = global.window.Shared = {};
global.Components = global.window.Components = {};
global.Main = global.window.Main = {};
console.debug = () => {};
console.log = () => {};
console.warn = () => {};
const jStatModule = require('jstat');
global.jStat = global.window.jStat = jStatModule?.jStat || jStatModule;

// DOM-unit projections use the same deterministic frame boundary as the
// integration harness. This keeps frame-backed live edits flushable under
// fake timers without loading the full application setup.
(() => {
  let rafId = 0;
  const scheduled = new Map();
  const timerHost = global.window || global;
  const fastRaf = callback => {
    const id = ++rafId;
    const handle = timerHost.setTimeout(() => {
      scheduled.delete(id);
      callback(global.performance?.now?.() || Date.now());
    }, 0);
    scheduled.set(id, handle);
    return id;
  };
  const fastCancel = id => {
    const handle = scheduled.get(id);
    if (handle !== undefined) {
      timerHost.clearTimeout(handle);
      scheduled.delete(id);
    }
  };
  global.requestAnimationFrame = fastRaf;
global.cancelAnimationFrame = fastCancel;
  if (global.window && global.window !== global) {
    global.window.requestAnimationFrame = fastRaf;
    global.window.cancelAnimationFrame = fastCancel;
  }
})();

// Shared chart layout measures labels through a 2D canvas context. Keep that
// capability deterministic in the minimal DOM layer without loading the full
// application setup or the optional canvas package.
if (global.HTMLCanvasElement?.prototype) {
  const originalGetContext = global.HTMLCanvasElement.prototype.getContext;
  global.HTMLCanvasElement.prototype.getContext = function getContext(type) {
    if (String(type || '').toLowerCase() === '2d') {
      return {
        font: '10px sans-serif',
        measureText(text) {
          return { width: String(text || '').length * 8 };
        }
      };
    }
    return typeof originalGetContext === 'function'
      ? originalGetContext.call(this, type)
      : null;
  };
}
