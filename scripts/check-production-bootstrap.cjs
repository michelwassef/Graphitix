'use strict';

const path = require('path');
const {
  readProductionScriptManifest,
  validateProductionScriptManifest
} = require('../test-support/productionBootstrap.js');

const rootDir = path.resolve(__dirname, '..');
const manifest = readProductionScriptManifest(rootDir);
const failures = validateProductionScriptManifest(manifest, rootDir);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Production bootstrap checked: ${manifest.length} script tags`);
}
