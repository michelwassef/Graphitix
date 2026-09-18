'use strict';

const fs = require('fs');
const path = require('path');
const { loadComponentTestBootstrap } = require('../../test-support/componentTestBootstrap');

const COMPONENTS = Object.freeze([
  { type: 'pie', source: 'pie.js' },
  { type: 'surface', source: 'surface.js' },
  { type: 'survival', source: 'survival.js' },
  { type: 'venn', source: 'venn.js' }
]);

describe.each(COMPONENTS)('$type render-impact contract', ({ type, source: sourceFile }) => {
  let hooks;

  beforeEach(() => {
    jest.resetModules();
    loadComponentTestBootstrap(type);
    hooks = window.Components?.[type]?.__testHooks;
  });

  test('explicit impact wins over legacy compatibility flags', () => {
    expect(hooks?.resolveRenderImpact).toBeTruthy();
    expect(hooks.resolveRenderImpact({ renderImpact: 'paint', viewOnly: false })).toBe('paint');
    expect(hooks.resolveRenderImpact({ renderImpact: 'analysis', viewOnly: true })).toBe('analysis');
    expect(hooks.resolveRenderImpact({ structural: true })).toBe('structural');
    expect(hooks.resolveRenderImpact({ invalidate: 'style' })).toBe('paint');
    expect(hooks.resolveRenderImpact({ viewOnly: true })).toBe('layout');
  });

  test('sanitized draw options derive compatibility viewOnly from semantic impact', () => {
    expect(hooks?.sanitizeDrawOptions).toBeTruthy();
    expect(hooks.sanitizeDrawOptions({ renderImpact: 'paint', viewOnly: false })).toMatchObject({
      renderImpact: 'paint',
      viewOnly: true
    });
    expect(hooks.sanitizeDrawOptions({ renderImpact: 'analysis', viewOnly: true })).toMatchObject({
      renderImpact: 'analysis',
      viewOnly: false
    });
  });

  test('the production scheduler contains explicit impact boundaries', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../js/components', sourceFile),
      'utf8'
    ).replace(/\r\n/g, '\n');
    expect(source).toContain("renderImpact: 'paint'");
    expect(source).toContain("renderImpact: 'layout'");
    expect(source).toContain("renderImpact: 'analysis'");
    expect(source).toContain("renderImpact: 'structural'");
    expect(source).toContain(`source: '${type}.draw'`);
  });
});
