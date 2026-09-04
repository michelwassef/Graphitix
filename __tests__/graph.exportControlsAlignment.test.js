const fs = require('fs');
const path = require('path');

describe('graph export controls alignment', () => {
  test('places every primary graph export row after its svgbox in the plot stack', () => {
    const componentIds = [
      'venn', 'box', 'scatter', 'pca', 'surface', 'line',
      'heatmap', 'roc', 'survival', 'hist', 'pie'
    ];

    componentIds.forEach(component => {
      const controls = document.getElementById(`${component}ExportControls`);
      const svgBox = document.querySelector(`#${component}GraphPanel .svgbox`);
      const stack = svgBox?.parentElement;
      expect(controls).toBeTruthy();
      expect(svgBox).toBeTruthy();
      expect(stack?.classList.contains(`${component}-plot-stack`)).toBe(true);
      expect(controls.parentElement).toBe(stack);
      expect(svgBox.contains(controls)).toBe(false);
      expect(svgBox.nextElementSibling).toBe(controls);
      expect(controls.classList.contains('graph-export-controls')).toBe(true);
    });

    const css = fs.readFileSync(path.resolve(__dirname, '../css/style.css'), 'utf8');
    expect(css).toMatch(/\.graph-export-controls\s*\{[^}]*justify-content:\s*flex-start;/);
    expect(css).not.toMatch(/\.svgbox\[data-graph-content-envelope="true"\]\s*>\s*\[id\$="ExportControls"\]/);
  });
});
