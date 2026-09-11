'use strict';

let lifecycle;

beforeEach(() => {
  jest.resetModules();
  delete global.Shared;
  global.Shared = {};
  require('../../js/shared/componentLifecycle.js');
  lifecycle = global.Shared.componentLifecycle;
});

describe('componentLifecycle payload renderability model', () => {
  test('null / non-object → false', () => {
    expect(lifecycle.payloadHasRenderableContent(null)).toBe(false);
    expect(lifecycle.payloadHasRenderableContent(undefined)).toBe(false);
    expect(lifecycle.payloadHasRenderableContent('string')).toBe(false);
    expect(lifecycle.payloadHasRenderableContent(42)).toBe(false);
  });

  test('count > 0 → true', () => {
    expect(lifecycle.payloadHasRenderableContent({ count: 1 })).toBe(true);
    expect(lifecycle.payloadHasRenderableContent({ count: 0 })).toBe(false);
  });

  test('markup containing SVG tag → true', () => {
    expect(lifecycle.payloadHasRenderableContent({ markup: '<svg width="100"></svg>' })).toBe(true);
    expect(lifecycle.payloadHasRenderableContent({ markup: '<canvas id="c"></canvas>' })).toBe(true);
    expect(lifecycle.payloadHasRenderableContent({ markup: '<table><tr><td>x</td></tr></table>' })).toBe(true);
  });

  test('markup without known element tags → false', () => {
    expect(lifecycle.payloadHasRenderableContent({ markup: 'hello world' })).toBe(false);
    expect(lifecycle.payloadHasRenderableContent({ markup: '<span>x</span>' })).toBe(false);
  });

  test('html string with known element → true', () => {
    expect(lifecycle.payloadHasRenderableContent({ html: '<div class="chart"></div>' })).toBe(true);
  });

  test('svg string → true', () => {
    expect(lifecycle.payloadHasRenderableContent({ svg: '<svg><path d="M0 0"/></svg>' })).toBe(true);
  });

  test('fragment-payload with renderable node → true', () => {
    const payload = {
      __graphitixKind: 'fragment-payload',
      nodes: [{ markup: '<svg></svg>' }]
    };
    expect(lifecycle.payloadHasRenderableContent(payload)).toBe(true);
  });

  test('fragment-payload with no renderable nodes → false', () => {
    const payload = {
      __graphitixKind: 'fragment-payload',
      nodes: [{ markup: 'just text' }, { markup: '' }]
    };
    expect(lifecycle.payloadHasRenderableContent(payload)).toBe(false);
  });

  test('custom markupPattern option', () => {
    const options = { markupPattern: /CUSTOM_MARKER/i };
    expect(lifecycle.payloadHasRenderableContent({ markup: 'has CUSTOM_MARKER here' }, options)).toBe(true);
    expect(lifecycle.payloadHasRenderableContent({ markup: '<svg></svg>' }, options)).toBe(false);
  });
});
