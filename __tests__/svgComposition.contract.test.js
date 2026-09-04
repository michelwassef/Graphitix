const fs = require('fs');
const path = require('path');
const { expectSource } = require('./helpers/sourceContract');

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
    expectSource(source(relativePath), relativePath).toContain('svgGeometry.buildCompoundLinePath');
  });

  test('Box summary/whisker editing is element-type agnostic for compound paths', () => {
    const box = source('js/components/box.js');
    expectSource(box, 'box.js').toContain("plot.querySelector('[data-summary-line=\"1\"]')");
    expectSource(box, 'box.js').not.toContain("plot.querySelector('line[data-summary-line=\"1\"]')");
    expectSource(box, 'box.js').toMatch(/tagName === 'line' \|\| tagName === 'path' \|\| tagName === 'polyline'/);
    expectSource(box, 'box.js').toContain("'data-box-overlay-kind': 'box-whiskers'");
    expectSource(box, 'box.js').toContain("'data-box-overlay-kind': 'bar-error'");
  });

  test('Line and Scatter keep one independently styleable error path per observation', () => {
    const line = source('js/components/line.js');
    const scatter = source('js/components/scatter.js');
    expectSource(line, 'line.js').toContain("errorPath.setAttribute('data-line-error-bar','1')");
    expectSource(line, 'line.js').toContain("errorGroup.appendChild(errorPath)");
    expectSource(scatter, 'scatter.js').toContain("errorPath.setAttribute('data-scatter-error-bar', '1')");
    expectSource(scatter, 'scatter.js').toContain('errorBarFrag.appendChild(errorPath)');
  });

  test('Survival censor paths retain series color projection without becoming curve-toolbar targets', () => {
    const survival = source('js/components/survival.js');
    expectSource(survival, 'survival.js').toContain("'data-survival-censor-mark': '1'");
    expectSource(survival, 'survival.js').toContain("'[data-survival-series-color-target][data-group]'");
    expectSource(survival, 'survival.js').toContain(':not([data-survival-censor-mark="1"])');
  });

  test('broken-axis domains remain line-based until the shared axis control is path-aware', () => {
    const axisControls = source('js/shared/axisControls.js');
    const issues = source('issues.txt');
    expectSource(axisControls, 'axisControls.js').toContain('line[data-axis-line="1"]');
    expectSource(issues, 'issues.txt').toContain('Shared axis-control discovery still has a geometry fallback tied to SVG');
  });
});
