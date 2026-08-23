const fs = require('fs');
const path = require('path');

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
    expect(source).toContain('mountSvgControls');
    expect(source).toMatch(/componentName:\s*['"][^'"]+['"]/);
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
    expect(source).toContain("componentName: 'venn'");
    expect(source).toContain("componentName: 'venn-go'");
    expect(source).toContain("componentName: 'venn-string'");
    expect(source).toContain('getSourceSvg:');
    expect(source).toContain('Shared.exportProjection');
  });

  test('Line, Scatter and Heatmap no longer choose export root physical dimensions independently', () => {
    const line = readComponent('line');
    const scatter = readComponent('scatter');
    const heatmap = readComponent('heatmap');

    const lineExportStart = line.indexOf('function buildLineExportSvg');
    const lineExportEnd = line.indexOf('\n  function ', lineExportStart + 1);
    const lineExport = line.slice(lineExportStart, lineExportEnd > lineExportStart ? lineExportEnd : lineExportStart + 2000);
    expect(lineExport).toContain('exportProjection');
    expect(lineExport).not.toMatch(/setAttribute\(['"](?:width|height)['"]/);

    const scatterExportStart = scatter.indexOf('function buildScatterExportSvgFromSource');
    const scatterExportEnd = scatter.indexOf('\n  function ', scatterExportStart + 1);
    const scatterExport = scatter.slice(scatterExportStart, scatterExportEnd > scatterExportStart ? scatterExportEnd : scatterExportStart + 2400);
    expect(scatterExport).toContain('exportProjection');
    expect(scatterExport).not.toMatch(/setAttribute\(['"](?:width|height)['"]/);

    const heatmapExportStart = heatmap.indexOf('function buildHeatmapExportSvgFromSource');
    const heatmapPreviewStart = heatmap.indexOf('function buildHeatmapPreviewSvgFromSource', heatmapExportStart);
    const heatmapExport = heatmap.slice(heatmapExportStart, heatmapPreviewStart);
    expect(heatmapExport).toContain('exportProjection');
    expect(heatmapExport).not.toMatch(/setAttribute\(['"](?:width|height)['"]/);

    const heatmapPreviewProjection = heatmap.slice(
      heatmap.indexOf('function cloneHeatmapPreviewProjection'),
      heatmap.indexOf('function buildHeatmapExportSvgFromSource')
    );
    expect(heatmapPreviewProjection).toMatch(/setAttribute\(['"]width['"]/);
    expect(heatmapPreviewProjection).toMatch(/setAttribute\(['"]height['"]/);
  });
});
