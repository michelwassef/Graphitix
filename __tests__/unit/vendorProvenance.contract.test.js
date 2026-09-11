const fs = require('fs');
const path = require('path');
const { BROWSER_VENDOR_VERSIONS, VENDOR_MANIFEST } = require('../../test-support/vendorManifest.js');

describe('vendor provenance contract', () => {
  test('pins browser assets and Jest packages to one version set', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const lockfile = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
    for (const entry of VENDOR_MANIFEST) {
      const version = BROWSER_VENDOR_VERSIONS[entry.packageName];
      expect(packageJson.devDependencies[entry.packageName]).toBe(version);
      expect(lockfile.packages[`node_modules/${entry.packageName}`].version).toBe(version);
      expect(fs.existsSync(path.join(rootDir, entry.assetPath))).toBe(true);
    }
  });
});
