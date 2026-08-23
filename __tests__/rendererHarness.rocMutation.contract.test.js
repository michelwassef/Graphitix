const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, 'tab-isolation-regression', 'renderer-harness.js'),
  'utf8'
);

describe('renderer regression ROC fixture contract', () => {
  test('generic data variation preserves the categorical class column', () => {
    expect(source).toContain("const matrixOptions = { preserveFirstColumn: type === 'roc' };");
    expect(source).toContain("if(options.preserveFirstColumn === true && r > 0 && c === 0) continue;");
    expect(source).toContain('mutateMatrix(p[key], variant, matrixOptions)');
    expect(source).toContain('mutateMatrix(obj, variant, matrixOptions)');
  });
});
