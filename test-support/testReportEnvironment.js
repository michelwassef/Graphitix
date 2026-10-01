'use strict';

const VENDOR_MODES = Object.freeze(['fake', 'real-npm', 'committed-browser-assets', 'mixed']);

function resolveVendorMode(scope) {
  const value = String(scope || '').trim();
  if (value === 'vendor') return 'real-npm';
  if (value === 'full') return 'mixed';
  if (value === 'full-jest' || value === 'coverage' || (!value.startsWith('e2e-') && !value.startsWith('full-'))) {
    return 'fake';
  }
  return 'committed-browser-assets';
}

function buildTestEnvironment(vendorMode) {
  if (!VENDOR_MODES.includes(vendorMode)) {
    throw new Error(`Unsupported test report vendor mode: ${String(vendorMode)}`);
  }
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    ci: process.env.CI === 'true',
    vendorMode
  };
}

module.exports = {
  VENDOR_MODES,
  resolveVendorMode,
  buildTestEnvironment
};
