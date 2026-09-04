const fs = require('fs');
const path = require('path');
const { expectSource } = require('./helpers/sourceContract');

const COMPONENTS = [
  'venn',
  'box',
  'scatter',
  'pca',
  'line',
  'heatmap',
  'surface',
  'roc',
  'survival',
  'hist',
  'pie'
];

function readComponent(name) {
  return fs.readFileSync(path.resolve(__dirname, `../js/components/${name}.js`), 'utf8');
}

describe('component export projection wiring', () => {
  test.each(COMPONENTS)('%s declares its component identity on shared SVG export controls', component => {
    const source = readComponent(component);
    expectSource(source, `${component}.js`).toContain('mountSvgControls');
    expectSource(source, `${component}.js`).toMatch(/componentName:\s*['"][^'"]+['"]/);
  });

  test.each(['box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'])(
    '%s resolves its primary SVG without relying only on a document-global selector',
    component => {
      const source = readComponent(component);
      const mountIndex = source.indexOf('mountSvgControls');
      expect(mountIndex).toBeGreaterThan(-1);
      const snippet = source.slice(mountIndex, mountIndex + 1800);
      expect(snippet).toContain('getSvg:');
    }
  );

  test('Venn covers main, GO and STRING auxiliary export targets with the shared projection contract', () => {
    const source = readComponent('venn');
    expectSource(source, 'venn.js').toContain("componentName: 'venn'");
    expectSource(source, 'venn.js').toContain("componentName: 'venn-go'");
    expectSource(source, 'venn.js').toContain("componentName: 'venn-string'");
    expectSource(source, 'venn.js').toContain('getSourceSvg:');
    expectSource(source, 'venn.js').toContain('Shared.exportProjection');
  });

  test('Line, Scatter and Heatmap no longer choose export root physical dimensions independently', () => {
    const line = readComponent('line');
    const scatter = readComponent('scatter');
    const heatmap = readComponent('heatmap');

    const lineExportStart = line.indexOf('function buildLineExportSvg');
    const lineExportEnd = line.indexOf('\n  // PART: DRAW', lineExportStart + 1);
    const lineExport = line.slice(lineExportStart, lineExportEnd > lineExportStart ? lineExportEnd : lineExportStart + 2000);
    expectSource(lineExport, 'line export').toContain('exportProjection');
    expectSource(lineExport, 'line export').not.toMatch(/setAttribute\(['"](?:width|height)['"]/);

    const scatterExportStart = scatter.indexOf('function buildScatterExportSvgFromSource');
    const scatterExportEnd = scatter.indexOf('\n  function ', scatterExportStart + 1);
    const scatterExport = scatter.slice(scatterExportStart, scatterExportEnd > scatterExportStart ? scatterExportEnd : scatterExportStart + 2400);
    expectSource(scatterExport, 'scatter export').toContain('exportProjection');
    expectSource(scatterExport, 'scatter export').not.toMatch(/setAttribute\(['"](?:width|height)['"]/);

    const heatmapExportStart = heatmap.indexOf('function buildHeatmapExportSvgFromSource');
    const heatmapPreviewStart = heatmap.indexOf('function buildHeatmapPreviewSvgFromSource', heatmapExportStart);
    const heatmapExport = heatmap.slice(heatmapExportStart, heatmapPreviewStart);
    expectSource(heatmapExport, 'heatmap export').toContain('exportProjection');
    expectSource(heatmapExport, 'heatmap export').not.toMatch(/setAttribute\(['"](?:width|height)['"]/);

    const heatmapPreviewProjection = heatmap.slice(
      heatmap.indexOf('function cloneHeatmapPreviewProjection'),
      heatmap.indexOf('function buildHeatmapExportSvgFromSource')
    );
    expectSource(heatmapPreviewProjection, 'heatmap preview projection').toMatch(/setAttribute\(['"]width['"]/);
    expectSource(heatmapPreviewProjection, 'heatmap preview projection').toMatch(/setAttribute\(['"]height['"]/);
  });
});
