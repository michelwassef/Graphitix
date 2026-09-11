'use strict';

const fs = require('fs');
const path = require('path');
const { BROWSER_VENDOR_VERSIONS, VENDOR_MANIFEST } = require('../test-support/vendorManifest.js');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
const helperText = fs.readFileSync(path.join(rootDir, 'e2e/helpers/vendorOverrides.js'), 'utf8');
const failures = [];

for (const entry of VENDOR_MANIFEST) {
  const expected = BROWSER_VENDOR_VERSIONS[entry.packageName];
  const declared = packageJson.devDependencies?.[entry.packageName];
  const locked = lockfile.packages?.[`node_modules/${entry.packageName}`]?.version;
  if (declared !== expected) {
    failures.push(`${entry.packageName} package.json must pin ${expected}; found ${declared || '(missing)'}`);
  }
  if (locked !== expected) {
    failures.push(`${entry.packageName} package-lock must resolve ${expected}; found ${locked || '(missing)'}`);
  }
  if (!fs.existsSync(path.join(rootDir, entry.assetPath))) {
    failures.push(`${entry.packageName} committed browser asset is missing: ${entry.assetPath}`);
  }
  if (!helperText.includes('BROWSER_VENDOR_VERSIONS')) {
    failures.push('E2E CDN overrides must consume test-support/vendorManifest.js');
    break;
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Vendor provenance passed: ${VENDOR_MANIFEST.length} pinned browser/npm vendors`);
}
