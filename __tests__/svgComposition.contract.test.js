const fs = require('fs');
const path = require('path');

function source(relativePath){
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8').replace(/\r\n/g, '\n');
}

describe('semantic SVG composition contracts', () => {
  test('svgGeometry loads before shared 3D rendering and the lazy component loader', () => {
    const html = source('index.html');
    const geometryIndex = html.indexOf('js/shared/svgGeometry.js');
    const plot3dIndex = html.indexOf('js/shared/plot3d.js');
    const componentLoaderIndex = html.indexOf('js/main/components.js');
    expect(geometryIndex).toBeGreaterThanOrEqual(0);
    expect(plot3dIndex).toBeGreaterThan(geometryIndex);
    expect(componentLoaderIndex).toBeGreaterThan(geometryIndex);
  });

  test.each([
    'js/components/box.js',
    'js/components/scatter.js',
    'js/components/line.js',
    'js/components/pca.js',
    'js/components/roc.js',
    'js/components/survival.js',
    'js/components/hist.js',
    'js/components/venn.js',
    'js/shared/plot3d.js'
  ])('%s uses the shared compound-path geometry authority', relativePath => {
    expect(source(relativePath)).toContain('svgGeometry.buildCompoundLinePath');
  });

  test('Box summary/whisker editing is element-type agnostic for compound paths', () => {
    const box = source('js/components/box.js');
    expect(box).toContain("plot.querySelector('[data-summary-line=\"1\"]')");
    expect(box).not.toContain("plot.querySelector('line[data-summary-line=\"1\"]')");
    expect(box).toMatch(/tagName === 'line' \|\| tagName === 'path' \|\| tagName === 'polyline'/);
    expect(box).toContain("'data-box-overlay-kind': 'box-whiskers'");
    expect(box).toContain("'data-box-overlay-kind': 'bar-error'");
  });

  test('Line and Scatter keep one independently styleable error path per observation', () => {
    const line = source('js/components/line.js');
    const scatter = source('js/components/scatter.js');
    expect(line).toContain("errorPath.setAttribute('data-line-error-bar','1')");
    expect(line).toContain("errorGroup.appendChild(errorPath)");
    expect(scatter).toContain("errorPath.setAttribute('data-scatter-error-bar', '1')");
    expect(scatter).toContain('errorBarFrag.appendChild(errorPath)');
  });

  test('Survival censor paths retain series color projection without becoming curve-toolbar targets', () => {
    const survival = source('js/components/survival.js');
    expect(survival).toContain("'data-survival-censor-mark': '1'");
    expect(survival).toContain("'[data-survival-series-color-target][data-group]'");
    expect(survival).toContain(':not([data-survival-censor-mark="1"])');
  });

  test('broken-axis domains remain line-based until the shared axis control is path-aware', () => {
    const axisControls = source('js/shared/axisControls.js');
    const issues = source('issues.txt');
    expect(axisControls).toContain('line[data-axis-line="1"]');
    expect(issues).toContain('Two-dimensional broken-axis domains and publication frames still encode some semantic multi-segment strokes');
  });
});
