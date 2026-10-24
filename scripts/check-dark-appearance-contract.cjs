#!/usr/bin/env node
'use strict';

// Standalone appearance/data-color contract; no build, DOM or test runner required.
const assert = require('node:assert/strict');
global.window = global;
require('../js/shared/colorSchemes.js');
const cs = global.Shared.colorSchemes;
const clone = value => structuredClone(value);
const fixtures = {
  box: { data: [['A', 'B'], [2, 4]], config: {
    colors: ['#000000', '#abcdef'], borderColors: ['#010203', '#445566'],
    shapeGlobalStyle: { fill: '#123456', stroke: '#654321' },
    shapeStyles: { 0: { fill: '#103050', stroke: '#000000' } },
    pointGlobalStyle: { markerFill: '#99aabb', markerStroke: '#222222' },
    pointStyles: { 1: { fill: '#ddddee', borderColor: '#eeeeff' } },
    summaryGlobalStyle: { color: '#aabbcc' },
    summaryStyles: { 0: { color: '#765432' } }
  } },
  scatter: { data: [['Label', 'X', 'Y'], ['A', 1, 2]], config: {
    densityPalette: 'magma', labelColors: { A: '#abcdef' }, fill: '#000000',
    labelStyles: { A: { fill: '#123456', borderColor: '#000000' } },
    overlayStyles: { trend: { color: '#ad1234' } }
  } },
  pca: { data: [['Variable', 'A'], ['Var1', 1]], config: {
    grouped: { colors: ['#123456', '#abcdef'] },
    labelColors: { A: '#00aabb' },
    pointStyleScopes: { global: { fill: '#ffffff' }, groups: { X: { fill: '#000000' } }, points: { 'label:A': { fill: '#654321' } } },
    labelPointStyles: { A: { fill: '#102030' } }
  } },
  line: { data: [['X', 'A'], [1, 4]], config: {
    labelColors: { A: '#123456' }, border: '#102030',
    seriesStyles: { A: { fill: '#aabbcc', lineStroke: '#334455', markerStroke: '#665544' } },
    overlayStyles: { trend: { color: '#abcdef' } }
  } },
  hist: { data: [['A'], [1]], config: {
    seriesColors: { 'col-0': '#abcdef' }, fill: '#123456', border: '#102030',
    distributions: { options: [{ key: 'normal', color: '#cafeba' }] },
    overlayStyles: { confidence: { color: '#abcdef' } }
  } },
  pie: { data: [['Label', 'Value'], ['A', 4]], config: {
    colors: { A: '#102030' }, borderColor: '#ffffff' }
  },
  roc: { data: [['Label', 'A'], [0, 1]], config: { labelColors: { A: '#234567' } } },
  survival: { data: [['Group', 'Time', 'Event'], ['A', 3, 1]], config: { labelColors: { A: '#234567' } } },
  heatmap: { config: { colors: { negative: '#123456', zero: '#010203', positive: '#654321' }, dendrogram: { color: '#006600' } } },
  surface: { config: { settings: { colorRamp: 'magma', axisColor: '#112233', textColor: '#abcdef', backgroundColor: '#010203' } } },
  venn: { style: { colorA: '#000000', colorB: '#abcdef', colorC: '#aabbcc', borderColor: '#123456',
    upset: { barColor: '#010101', setBarColor: '#222222', dotColor: '#111111', gridColor: '#dddddd' } } }
};
let checked = 0;
for(const [type, fixture] of Object.entries(fixtures)){
  const paletteId = type === 'surface' ? 'surface-plasma' : type === 'box' ? 'grayscale' : 'normal';
  const input = { ...clone(fixture), type };
  const built = cs.applyToPayload(type, input, paletteId);
  // Reassert a variety of explicit user paints after the palette is assigned.
  if(type === 'box') Object.assign(built.config, clone(fixture.config));
  const before = clone(built);
  const dark = cs.applyAppearanceToPayload(type, built, 'dark');
  const key = type === 'venn' ? dark.style.colorScheme : dark.config.colorScheme;
  assert.deepEqual(cs.getSchemeIdentity(key), { paletteId, appearance: 'dark' }, `${type}: identity`);
  const restored = cs.applyAppearanceToPayload(type, clone(dark), 'light');
  assert.deepEqual(restored, before, `${type}: round-trip loss`);
  assert.deepEqual(built, before, `${type}: source mutated`);
  assert.deepEqual(cs.applyAppearanceToPayload(type, dark, 'dark'), dark, `${type}: idempotent`);
  checked++;
}
const schemes = cs.getSchemes();
for(const palette of ['normal', 'scientific', 'soft', 'grayscale', 'colorblind',
  'dark', 'surface-viridis', 'surface-plasma', 'surface-magma', 'surface-turbo',
  'surface-bluered', 'surface-grayscale']){
  const a = schemes[palette === 'dark' ? 'dark-light' : palette];
  const b = schemes[palette === 'dark' ? 'dark' : `${palette}-dark`];
  for(const name of ['categorical', 'sequential', 'diverging']){
    assert.deepEqual(b[name], a[name], `${palette}: ${name} changes with appearance`);
  }
}
assert.deepEqual(cs.resolveCategoricalPaletteForType('box', { schemeId: 'grayscale-dark' }),
  cs.resolveCategoricalPaletteForType('box', { schemeId: 'grayscale' }));
const boxDark = cs.applyToPayload('box', { type: 'box', data: [['A','B'], [1,2]], config: {} }, 'dark');
assert.notDeepEqual(boxDark.config.colors[0], '#ffffff', 'Pastel must not force white Box fills');
console.log(`PASS: ${checked} component appearance round-trips, 12 palette-pair contracts, Box defaults`);

// Verify the SVG presentation adapter without jsdom: explicit colors survive,
// default black labels get contrast, and dark-time edits survive light restore.
require('../js/shared/theme/themeRuntime.js');
const runtime = global.Shared.themeRuntime;
class TextNode {
  constructor(attrs = {}) { this.attrs = new Map(Object.entries(attrs)); }
  getAttribute(key) { return this.attrs.has(key) ? this.attrs.get(key) : null; }
  hasAttribute(key) { return this.attrs.has(key); }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  removeAttribute(key) { this.attrs.delete(key); }
}
const defaultLabel = new TextNode({ fill: '#000000' });
const customLabel = new TextNode({ fill: '#aabbcc' });
const svg = { querySelectorAll(selector) {
  return selector.includes('[data-color-scheme-text-themed')
    ? [defaultLabel, customLabel].filter(node => node.hasAttribute('data-color-scheme-text-themed'))
    : [defaultLabel, customLabel];
} };
runtime.applyDarkTextTheme(svg, '#f2f2f2');
assert.equal(defaultLabel.getAttribute('fill'), '#f2f2f2');
assert.equal(customLabel.getAttribute('fill'), '#aabbcc');
defaultLabel.setAttribute('fill', '#123456');
runtime.applyDarkTextTheme(svg, '#f2f2f2');
runtime.restoreTextTheme(svg);
assert.equal(defaultLabel.getAttribute('fill'), '#123456');
assert.equal(customLabel.getAttribute('fill'), '#aabbcc');
console.log('PASS: SVG default/custom text colors and Dark-time edit preservation');
