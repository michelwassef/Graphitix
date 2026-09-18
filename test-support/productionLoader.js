'use strict';

const path = require('path');
const {
  readProductionScriptManifest,
  validateProductionScriptManifest
} = require('./productionBootstrap.js');

const VENDOR_MODES = Object.freeze(['fake', 'real']);
const DEFAULT_ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = readProductionScriptManifest(DEFAULT_ROOT_DIR);

function isVendorScript(source) {
  return /^libs\//i.test(String(source || ''));
}

function resolveScriptPath(rootDir, source) {
  return path.join(rootDir, ...String(source || '').split('/'));
}

function resetProductionNamespaces() {
  const targets = typeof window !== 'undefined' && globalThis !== window
    ? [window, globalThis]
    : [globalThis];
  for (const target of targets) {
    delete target.Main;
    delete target.Components;
    delete target.Shared;
  }
}

function hasPreseededWorkspaceSession() {
  const session = globalThis.window?.Main?.session;
  const workspace = session?.workspaceState;
  return !!workspace && (
    (Array.isArray(workspace.tabs) && workspace.tabs.length > 0)
    || !!workspace.activeTabId
  );
}

function loadProductionBootstrap(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT_DIR);
  const vendorMode = options.vendorMode || 'fake';
  const includeMain = options.includeMain !== false;
  const stopBefore = options.stopBefore ? String(options.stopBefore) : null;
  if (!VENDOR_MODES.includes(vendorMode)) {
    throw new Error(`Unsupported production test vendor mode: ${String(vendorMode)}`);
  }
  if (includeMain && options.rejectPreseededSession === true && hasPreseededWorkspaceSession()) {
    throw new Error('Production full-app bootstrap rejects a preseeded workspace session; reset the test owner first.');
  }

  const manifest = rootDir === DEFAULT_ROOT_DIR
    ? DEFAULT_MANIFEST
    : readProductionScriptManifest(rootDir);
  const preloadComponents = Array.isArray(options.preloadComponents)
    ? options.preloadComponents.map(type => String(type || '').trim()).filter(Boolean)
    : [];
  const failures = validateProductionScriptManifest(manifest, rootDir);
  if (failures.length) {
    throw new Error(`Invalid production bootstrap manifest:\n${failures.join('\n')}`);
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Production browser bootstrap requires a DOM environment');
  }

  const loaded = [];
  let beforeMainCalled = false;
  for (const entry of manifest) {
    if (!entry.local || entry.type !== 'text/javascript') {
      continue;
    }
    const source = entry.source;
    if (stopBefore && source === stopBefore) {
      break;
    }
    if (vendorMode === 'fake' && isVendorScript(source)) {
      continue;
    }
    if (source === 'js/main.js' && !beforeMainCalled) {
      beforeMainCalled = true;
      if (preloadComponents.length > 0) {
        // Component tests must declare only the bundles they exercise. The
        // default is lazy application loading; all-bundle preloading is kept
        // available only for deliberate cross-component setup.
        const componentLoader = globalThis.window?.Main?.components?.loadComponentBundle;
        if (typeof componentLoader !== 'function') {
          throw new Error('Production component preload requires Main.components.loadComponentBundle.');
        }
        preloadComponents.forEach(type => {
          componentLoader(type, { forceRequire: true });
        });
      }
      if (typeof options.beforeMain === 'function') {
        options.beforeMain({ rootDir, manifest, loaded: loaded.slice() });
      }
    }
    if (source === 'js/main.js' && !includeMain) {
      continue;
    }
    require(resolveScriptPath(rootDir, source));
    loaded.push(source);
  }

  const metadata = Object.freeze({
    mode: 'production-derived',
    vendorMode,
    includeMain: loaded.includes('js/main.js'),
    stoppedBefore: stopBefore,
    preloadedComponents: Object.freeze(preloadComponents.slice()),
    loadedSources: Object.freeze(loaded.slice())
  });
  window.__GRAPHITIX_TEST_BOOTSTRAP__ = metadata;
  return metadata;
}

module.exports = {
  VENDOR_MODES,
  hasPreseededWorkspaceSession,
  isVendorScript,
  loadProductionBootstrap,
  resetProductionNamespaces
};
