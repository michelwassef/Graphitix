const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('focus modality bootstrap', () => {
  test('loads in a non-browser shared-module bootstrap with keyboard as the default', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'js', 'shared', 'focusModality.js'),
      'utf8'
    );
    const context = {};

    vm.runInNewContext(source, context, { filename: 'focusModality.js' });

    expect(context.Shared.focusModality.getCurrentModality()).toBe('keyboard');
  });
});
