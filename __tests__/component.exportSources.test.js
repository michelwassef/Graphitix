const fs = require('fs');
const path = require('path');

describe('component SVG export source wiring', () => {
  const components = ['box', 'scatter', 'heatmap'];

  test.each(components)('%s separates pure SVG and hybrid SVG sources', component => {
    const filePath = path.resolve(__dirname, `../js/components/${component}.js`);
    const source = fs.readFileSync(filePath, 'utf8');
    const mountIndex = source.indexOf('mountSvgControls');
    expect(mountIndex).toBeGreaterThan(-1);
    const snippet = source.slice(mountIndex, mountIndex + 1200);
    expect(snippet).toContain('getSvg:');
    expect(snippet).toContain('getHybridSvg:');
    expect(snippet).toContain('hybridOptions:');
  });
});
