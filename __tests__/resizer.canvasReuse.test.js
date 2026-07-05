describe('Shared.resizer canvas reuse', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = { isDebugEnabled: () => false };
    require('../js/shared/resizer.js');
  });

  test('reuses a previous canvas layer by copying bitmap and scaling to the next plot', () => {
    const NS = 'http://www.w3.org/2000/svg';
    const drawImage = jest.fn();
    const clearRect = jest.fn();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({ drawImage, clearRect }));

    const previousSvg = document.createElementNS(NS, 'svg');
    previousSvg.dataset.boxPlotLeft = '20';
    previousSvg.dataset.boxPlotTop = '30';
    previousSvg.dataset.boxPlotW = '200';
    previousSvg.dataset.boxPlotH = '100';

    const sourceGroup = document.createElementNS(NS, 'g');
    sourceGroup.setAttribute('data-export-layer', 'box-points');
    sourceGroup.setAttribute('data-trace', '0');
    const foreignObject = document.createElementNS(NS, 'foreignObject');
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 20;
    sourceCanvas.height = 10;
    foreignObject.appendChild(sourceCanvas);
    sourceGroup.appendChild(foreignObject);
    previousSvg.appendChild(sourceGroup);

    const targetGroup = document.createElementNS(NS, 'g');
    const reused = window.Shared.resizer.reuseCanvasLayerDuringLiveResize({
      targetGroup,
      previousSvg,
      sourceSelector: 'g[data-export-layer="box-points"][data-trace="0"]',
      metricKeys: {
        left: 'boxPlotLeft',
        top: 'boxPlotTop',
        width: 'boxPlotW',
        height: 'boxPlotH'
      },
      nextMargin: { left: 30, top: 40 },
      nextPlotW: 300,
      nextPlotH: 50
    });

    expect(reused).toBe(true);
    expect(targetGroup.getAttribute('data-render-mode')).toBe('canvas-resize-reused');
    expect(targetGroup.querySelector('g')?.getAttribute('transform')).toBe('translate(0 25) scale(1.5 0.5)');
    expect(targetGroup.querySelectorAll('canvas')).toHaveLength(1);
    expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0);
  });
});
