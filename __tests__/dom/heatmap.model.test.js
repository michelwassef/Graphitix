'use strict';

const { loadComponentTestBootstrap } = require('../../test-support/componentTestBootstrap');

describe('Heatmap model and layout helpers', () => {
  let hooks;

  beforeEach(() => {
    jest.resetModules();
    global.Shared = window.Shared = {};
    global.Components = window.Components = {};
    global.Main = window.Main = {};
    loadComponentTestBootstrap('heatmap');
    hooks = global.Components.heatmap.__testHooks;
  });

  test('Data-values colors and legend share one canonical numeric domain', () => {
    const palette = { negative: '#0000ff', zero: '#ffffff', positive: '#ff0000' };
    const resolved = hooks.resolveValueScaleStats({ min: -2.62, max: 4.95 }, {});
    const scale = hooks.createValueColorScale(resolved, palette, 2);
    const mapper = hooks.createValueColorMapper(resolved, palette);

    expect(resolved).toMatchObject({
      min: -2.62,
      max: 4.95,
      domainMin: -4.95,
      domainMax: 4.95,
      domainMode: 'diverging'
    });
    expect(scale.ticks[0].value).toBe(-4.95);
    expect(scale.ticks.at(-1).value).toBe(4.95);
    expect(scale.valueToRatio(-4.95)).toBe(0);
    expect(scale.valueToRatio(4.95)).toBe(1);
    expect(mapper(-4.95)).toBe('rgb(0,0,255)');
    expect(mapper(4.95)).toBe('rgb(255,0,0)');
  });

  test('custom and all-negative Data-values domains keep endpoints, ticks, and colors aligned', () => {
    const palette = { negative: '#0000ff', zero: '#ffffff', positive: '#ff0000' };
    const custom = hooks.resolveValueScaleStats(
      { min: -10, max: 8 },
      { min: -2, max: 4 }
    );
    expect(custom).toMatchObject({ min: -2, max: 4, domainMin: -4, domainMax: 4 });

    const negative = hooks.resolveValueScaleStats({ min: -10, max: -2 }, {});
    const scale = hooks.createValueColorScale(negative, palette, 2);
    const mapper = hooks.createValueColorMapper(negative, palette);
    expect(scale.ticks.map(tick => tick.value)).toEqual([-10, -8, -6, -4, -2]);
    expect(scale.valueToRatio(-10)).toBe(0);
    expect(scale.valueToRatio(-2)).toBe(1);
    expect(mapper(-10)).toBe('rgb(0,0,255)');
    expect(mapper(-2)).toBe('rgb(255,255,255)');

    const positive = hooks.resolveValueScaleStats({ min: 2, max: 10 }, {});
    const positiveScale = hooks.createValueColorScale(positive, palette, 2);
    const positiveMapper = hooks.createValueColorMapper(positive, palette);
    expect(positiveScale.ticks.map(tick => tick.value)).toEqual([2, 4, 6, 8, 10]);
    expect(positiveMapper(2)).toBe('rgb(255,255,255)');
    expect(positiveMapper(10)).toBe('rgb(255,0,0)');
  });

  test('heavy Data-values canvas scene uses bounded display geometry', () => {
    const layout = hooks.resolveHeavySceneLayout({
      frameWidth: 396,
      frameHeight: 338,
      rowCount: 7358,
      columnCount: 3,
      maxRowLabelWidth: 70,
      maxColumnLabelWidth: 90,
      maxRowLabelFontSize: 16,
      maxColumnLabelFontSize: 16,
      titleFontSize: 16,
      showRowDendrogram: true,
      showColumnDendrogram: true
    });

    expect(layout.normalized).toBe(true);
    expect(layout.totalWidth).toBe(396);
    expect(layout.totalHeight).toBe(338);
    expect(layout.heatmapWidth).toBeGreaterThan(40);
    expect(layout.heatmapHeight).toBeGreaterThan(60);
    expect(layout.cellWidth).toBeCloseTo(layout.heatmapWidth / 3, 8);
    expect(layout.cellHeight).toBeCloseTo(layout.heatmapHeight / 7358, 8);
    expect(layout.labelPaddingX).toBeCloseTo(layout.labelPaddingY, 8);
    expect(layout.labelMatrixGapDisplayPx).toBeCloseTo(layout.labelPaddingY, 8);
    expect(layout.scaleGapDisplayPx).toBeGreaterThanOrEqual(20);
    expect(layout.scaleGapDisplayPx).toBeLessThanOrEqual(30);
    expect(layout.dataStartX + layout.heatmapWidth + layout.labelColumnWidth + layout.scalePadding + layout.scaleWidth + layout.scaleLabelGap)
      .toBeLessThanOrEqual(layout.totalWidth);
    expect(layout.dataStartX - layout.rowDendroWidth).toBe(layout.matrixLeft);
    expect(layout.dataStartY + layout.heatmapHeight + layout.columnDendroHeight + layout.dendrogramPadding)
      .toBeLessThanOrEqual(layout.totalHeight);
  });

  test('correlation legend title reflects the plotted metric', () => {
    const resolveTitle = hooks.resolveCorrelationLegendTitle;
    expect(resolveTitle).toBeTruthy();
    expect(resolveTitle('pearson')).toEqual({
      method: 'pearson',
      text: 'Pearson correlation',
      lines: ['Pearson', 'correlation']
    });
    expect(resolveTitle('spearman')).toEqual({
      method: 'spearman',
      text: 'Spearman correlation',
      lines: ['Spearman', 'correlation']
    });
  });

  test('render-runtime ownership clones cached models unless live retention is explicit', () => {
    const model = {
      type: 'values',
      rowLabels: ['R1'],
      cells: [[{ value: 1 }]]
    };
    const isolated = hooks.createRenderRuntime({ lastRenderModel: model });
    expect(isolated.lastRenderModel).toEqual(model);
    expect(isolated.lastRenderModel).not.toBe(model);
    expect(isolated.lastRenderModel.cells).not.toBe(model.cells);

    model.cells[0][0].value = 9;
    expect(isolated.lastRenderModel.cells[0][0].value).toBe(1);

    const retained = hooks.createRenderRuntime({ lastRenderModel: model }, { retainModel: true });
    expect(retained.lastRenderModel).toBe(model);
  });
});
