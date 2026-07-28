const fs = require('fs');
const path = require('path');

describe('axis toolbar layout contract', () => {
  const axisControls = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'axisControls.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

  test('uses sentence case labels', () => {
    for (const label of ['Tick interval', 'Tick length', 'Axis length', 'Dataset spacing', 'Minor ticks', 'Number format']) {
      expect(axisControls).toContain(`textContent = '${label}'`);
    }
    expect(axisControls).not.toContain("textContent = 'Major Tick Length'");
  });

  test('marks Axis length as one compound section with a top bracket only', () => {
    expect(css).toMatch(/\.axis-controls-panel__field--length::before\s*\{[^}]*border-top:1px solid #cbd5e1;[^}]*border-left:1px solid #cbd5e1;[^}]*border-right:1px solid #cbd5e1;[^}]*pointer-events:none;/s);
    expect(css).toMatch(/\.axis-controls-panel__field--length > \.axis-controls-panel__field-label\s*\{[^}]*background:#fff;/s);
    expect(css).not.toMatch(/\.axis-controls-panel__field--length::before\s*\{[^}]*border-bottom:/s);
  });

  test('sizes each axis item from its widest label or control and uses one row gap', () => {
    expect(css).toMatch(/\.axis-controls-panel__field\s*\{[^}]*width:max-content;[^}]*max-width:none;/s);
    expect(css).toMatch(/\.axis-controls-panel__field--numeric\s*\{[^}]*width:max-content;[^}]*min-width:0;[^}]*max-width:none;/s);
    expect(css).toMatch(/\.axis-controls-panel__field--length\s*\{[^}]*width:max-content;[^}]*min-width:0;[^}]*max-width:none;/s);
    expect(css).toMatch(/\.axis-controls-panel \.axis-controls-panel__row\.additional-line-controls-panel__row\s*\{\s*gap:0 var\(--axis-toolbar-section-gap\);/s);
    expect(css).not.toMatch(/\.axis-controls-panel__field--additional-ticks\{[^}]*margin-left:8px/s);
    expect(css).not.toMatch(/\.axis-controls-panel__field--broken-axis\{[^}]*margin-left:8px/s);
  });
});
