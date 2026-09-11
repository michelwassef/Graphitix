'use strict';

const path = require('path');
const {
  REQUIRED_ORDER,
  readProductionScriptManifest,
  validateProductionScriptManifest
} = require('../../test-support/productionBootstrap.js');

describe('production bootstrap manifest', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const manifest = readProductionScriptManifest(rootDir);

  test('derives the ordered local script list from index.html', () => {
    expect(manifest.length).toBeGreaterThan(REQUIRED_ORDER.length);
    expect(validateProductionScriptManifest(manifest, rootDir)).toEqual([]);
    expect(manifest.at(-1).source).toBe('js/main.js');
  });

  test('does not accept a missing dependency or reordered main guard', () => {
    const broken = manifest.filter(entry => entry.source !== 'js/main/session.js');
    expect(validateProductionScriptManifest(broken, rootDir)).toEqual(expect.arrayContaining([
      expect.stringContaining('js/main/session.js before js/main/domControls.js')
    ]));
  });
});
