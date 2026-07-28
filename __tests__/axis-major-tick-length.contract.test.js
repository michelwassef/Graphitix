const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('shared major tick length axis contract', () => {
  test('axis controls expose a tab-owned major tick length editor', () => {
    const source = read('js/shared/axisControls.js');
    expect(source).toContain("majorTickLengthLabel.textContent = 'Tick length'");
    expect(source).toContain("recordAxisStateChange(\n          config,\n          'majorTickLength'");
    expect(source).toContain('getMajorTickLength: config.getMajorTickLength');
    expect(source).toContain('onMajorTickLengthChange: config.onMajorTickLengthChange');
  });

  test.each([
    ['box', 'js/components/box.js'],
    ['scatter', 'js/components/scatter.js'],
    ['line', 'js/components/line.js'],
    ['pca', 'js/components/pca.js'],
    ['roc', 'js/components/roc.js'],
    ['hist', 'js/components/hist.js'],
    ['survival', 'js/components/survival.js'],
    ['pie', 'js/components/pie.js'],
    ['venn', 'js/components/venn.js']
  ])('%s owns and persists per-axis major tick lengths', (_name, relativePath) => {
    const source = read(relativePath);
    expect(source).toContain('getMajorTickLength:');
    expect(source).toContain('onMajorTickLengthChange:');
    expect(source).toMatch(/xMajorTickLength|majorTickLengthX/);
    expect(source).toMatch(/yMajorTickLength|majorTickLengthY/);
  });

  test.each([
    ['box', 'js/components/box.js'],
    ['scatter', 'js/components/scatter.js'],
    ['line', 'js/components/line.js'],
    ['pca', 'js/components/pca.js'],
    ['roc', 'js/components/roc.js'],
    ['hist', 'js/components/hist.js'],
    ['survival', 'js/components/survival.js'],
    ['pie', 'js/components/pie.js'],
    ['venn', 'js/components/venn.js']
  ])('%s does not coerce an unset tick length to zero', (_name, relativePath) => {
    const source = read(relativePath);
    expect(source).toMatch(/(?:storedValue|value) === null \|\| (?:storedValue|value) === undefined \|\| (?:storedValue|value) === ''/);
  });

  test('an unset editor is seeded from the renderer default before native stepper interaction', () => {
    const controls = read('js/shared/axisControls.js');
    const chartStyle = read('js/shared/chartStyle.js');
    expect(chartStyle).toContain('chartStyle.DEFAULT_MAJOR_TICK_LENGTH = DEFAULT_MAJOR_TICK_LENGTH');
    expect(controls).toContain('const displayedMajorTickLength = storedMajorTickLength ?? resolveDefaultMajorTickLength(config)');
    expect(controls).toContain("majorTickLengthInput.value = String(displayedMajorTickLength)");
  });

  test('shared normalization preserves an unset value instead of coercing it to zero', () => {
    const chartStyle = read('js/shared/chartStyle.js');
    expect(chartStyle).toContain("if(value === null || value === undefined || value === '')");
    expect(chartStyle).toContain('chartStyle.normalizeOptionalMajorTickLength');
  });

  test('scatter passes both resolved major tick lengths into its extracted axes renderer', () => {
    const source = read('js/components/scatter.js');
    expect(source).toMatch(/function renderScatter2dAxes\(context\)[\s\S]*?xMajorTickLength,[\s\S]*?yMajorTickLength,/);
    expect(source).toMatch(/renderScatter2dAxes\(\{[\s\S]*?xMajorTickLength,[\s\S]*?yMajorTickLength,/);
  });

  test.each([
    'js/components/box.js',
    'js/components/scatter.js',
    'js/components/line.js',
    'js/components/pca.js',
    'js/components/roc.js',
    'js/components/hist.js',
    'js/components/survival.js',
    'js/components/pie.js',
    'js/components/venn.js'
  ])('%s uses the shared null-safe persisted-value normalizer', relativePath => {
    const source = read(relativePath);
    expect(source).toContain('chartStyle.normalizeOptionalMajorTickLength');
  });

  test.each([
    ['scatter', 'js/components/scatter.js', 'applyScatterAxisSettings(c.axis)'],
    ['line', 'js/components/line.js', 'applyLineAxisSettings(c.axis, payloadStateSession'],
    ['hist', 'js/components/hist.js', 'applyAxisSettings(axisConfig)'],
    ['venn', 'js/components/venn.js', 'state.analysis.upsetAxis = normalizeUpSetAxisStyle(upset)']
  ])('%s reopen uses its complete canonical axis normalizer', (_name, relativePath, expectedCall) => {
    expect(read(relativePath)).toContain(expectedCall);
  });

});
