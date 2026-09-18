const fs = require('fs');
const path = require('path');

describe('Histogram statistics control typography', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'style.css'), 'utf8');

  test('uses the shared statistics control and label rules', () => {
    const controlSelector = css.match(/:where\(([\s\S]*?)\) \.control,\s*#rocStatsControls\{/);
    const labelSelector = css.match(/:where\(([\s\S]*?)\) label\{/);
    const selectSelector = css.match(/:where\(([\s\S]*?)\) select\{/);

    expect(controlSelector?.[1]).toContain('#histStats');
    expect(labelSelector?.[1]).toContain('#histStats');
    expect(selectSelector?.[1]).toContain('#histStats');
  });
});
