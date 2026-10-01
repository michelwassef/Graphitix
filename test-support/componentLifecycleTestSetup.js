'use strict';

function loadFreshLifecycle() {
  window.Shared?.componentLifecycle?.uninstallGraphEditIntentListener?.();
  jest.resetModules();
  delete window.Shared;
  require('../js/shared/componentLifecycle.js');
  return window.Shared.componentLifecycle;
}

module.exports = { loadFreshLifecycle };
