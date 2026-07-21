const fs = require('fs');
const path = require('path');

describe('graph export controls alignment', () => {
  test('aligns every main graph Download and Copy row to the left', () => {
    const componentIds = [
      'venn', 'box', 'scatter', 'pca', 'surface', 'line',
      'heatmap', 'roc', 'survival', 'hist', 'pie'
    ];

    componentIds.forEach(component => {
      const controls = document.getElementById(`${component}ExportControls`);
      expect(controls).toBeTruthy();
      expect(controls.classList.contains('idx-inline-004')).toBe(true);
    });

    const css = fs.readFileSync(path.resolve(__dirname, '../css/style.css'), 'utf8');
    expect(css).toMatch(/\.idx-inline-004\s*\{[^}]*justify-content:\s*flex-start;/);
  });
});
