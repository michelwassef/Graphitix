describe('chartStyle X-axis endpoint margins', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/chartStyle.js');
  });

  test('reserves half of a centered final tick label plus the outer gutter', () => {
    const chartStyle = window.Shared.chartStyle;
    chartStyle.measureText = jest.fn(text => String(text).length * 10);

    const margin = chartStyle.computeBaseMargins({
      fontSize: 12,
      maxYLabelWidth: 20,
      hasYTitle: true,
      xTickLabels: ['0', '250'],
      xTickMeasureFont: '12px Arial'
    });

    expect(margin.right).toBe(chartStyle.GRAPH_HORIZONTAL_EDGE_PADDING_PX + 15);
    expect(margin.left).toBeGreaterThanOrEqual(chartStyle.GRAPH_HORIZONTAL_EDGE_PADDING_PX + 5);
  });

  test('subtracts categorical endpoint inset before reserving outer margin', () => {
    const chartStyle = window.Shared.chartStyle;
    chartStyle.measureText = jest.fn(() => 40);

    const margins = chartStyle.computeXAxisEndpointLabelMargins({
      labels: ['First', 'Last'],
      labelMeasureFont: '12px Arial',
      startInset: 18,
      endInset: 18
    });

    expect(margins.left).toBe(chartStyle.GRAPH_HORIZONTAL_EDGE_PADDING_PX + 2);
    expect(margins.right).toBe(chartStyle.GRAPH_HORIZONTAL_EDGE_PADDING_PX + 2);
  });
});
