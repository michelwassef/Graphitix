const path = require('path');
const { readSharedProductionSources } = require('../../test-support/componentTestBootstrap');
const { readProductionScriptManifest } = require('../../test-support/productionBootstrap');

test('isolated component bootstrap derives shared module order from production', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const productionSources = readProductionScriptManifest(rootDir)
    .filter(entry => entry.local)
    .map(entry => entry.source);

  expect(readSharedProductionSources(rootDir)).toEqual(
    productionSources.filter(source => source === 'js/vendor.js' || source.startsWith('js/shared/'))
  );
});
