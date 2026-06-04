const fs = require('fs');
const path = require('path');

describe('component table import bindings', () => {
  const components = [
    ['box', 'bindBoxControlHandler'],
    ['scatter', 'bindScatterControlHandler'],
    ['pca', 'bindPcaControlHandler'],
    ['pie', 'bindPieControlHandler'],
    ['line', 'bindLineControlHandler'],
    ['hist', 'bindHistControlHandler'],
    ['heatmap', 'bindHeatmapControlHandler'],
    ['roc', 'bindRocControlHandler'],
    ['survival', 'bindSurvivalControlHandler'],
    ['surface', 'bindSurfaceControlHandler']
  ];

  test.each(components)('%s table import controls use deduplicating handlers', (component, binder) => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', `${component}.js`), 'utf8');
    expect(source).toContain(`${binder}(`);
    expect(source).toMatch(new RegExp(`${binder}\\([^\\n]+,\\s*['"]click['"],\\s*['"]import-table['"]`));
    expect(source).toMatch(new RegExp(`${binder}\\([^\\n]+,\\s*['"]change['"],\\s*['"]import-file['"]`));
  });
});
