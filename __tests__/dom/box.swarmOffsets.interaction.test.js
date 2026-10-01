const { createBoxSwarmTestContext } = require('../../test-support/boxSwarmSuite');

describe('Box swarm offsets — interaction proxies', () => {
  const suite = createBoxSwarmTestContext();

  test('canvas-backed point lookup ignores hidden export geometry and keeps proxy size metadata', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.findBoxPointNodeForTrace).toBe('function');
    document.body.innerHTML = '<div id="boxPlot"></div>';
    const plot = document.getElementById('boxPlot');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-export-layer', 'box-points');
    group.setAttribute('data-trace', '3');
    group.__boxCanvasRenderState = { renderer: 'canvas-density' };
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-density');
    const exportPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    exportPath.setAttribute('data-box-export-geometry', '1');
    exportPath.style.display = 'none';

    const proxy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    proxy.setAttribute('data-point-proxy', '1');
    proxy.setAttribute('data-point-size', '1.4');
    group.appendChild(foreignObject);
    group.appendChild(exportPath);
    group.appendChild(proxy);
    svg.appendChild(group);
    plot.appendChild(svg);
    suite.bindBoxWorkspaceRoot(document.body);
    const node = suite.hooks.findBoxPointNodeForTrace('3', exportPath);
    expect(node).toBe(proxy);
    expect(suite.hooks.resolveBoxToolbarPointSizeValue({ size: 5, sizeMode: 'auto' }, node)).toBeCloseTo(0.7, 5);
    document.body.innerHTML = '';
  });

  test('interaction mask path is generated from binned density geometry', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.buildBoxPointInteractionMaskPath).toBe('function');
    const d = suite.hooks.buildBoxPointInteractionMaskPath({
      bins: [
        { coord: 100, halfWidth: 12 },
        { coord: 116, halfWidth: 18 }
      ],
      orientation: 'vertical',
      center: 240
    });
    expect(typeof d).toBe('string');
    expect(d).toContain('M 228 100 L 252 100');
    expect(d).toContain('M 222 116 L 258 116');
  });

  test('box preview svg returns the inactive owner cache source', () => {
    expect(window.Components?.box?.getPreviewSvg).toBeDefined();
    const frag = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-export-layer', 'box-points');
    group.setAttribute('data-trace', '0');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-preview');
    group.appendChild(foreignObject);
    group.__boxCanvasRenderState = {
      renderer: 'canvas-preview',
      points: [{ x: 10, y: 20 }, { x: 18, y: 24 }],
      pointRadius: 3,
      shape: 'circle',
      traceIndex: 0,
      style: {
        fill: '#111111',
        fillOpacity: 0.8,
        stroke: '#222222',
        strokeWidth: 1,
        strokeOpacity: 0.8
      }
    };
    svg.appendChild(group);
    frag.appendChild(svg);
    const previewSvg = window.Components.box.getPreviewSvg({
      id: 'workspace-preview-test',
      renderCache: {
        cache: {
          plot: { fragment: frag }
        }
      }
    });
    expect(previewSvg).toBe(svg);
    expect(previewSvg.querySelector('foreignObject')).toBe(foreignObject);
  });

});
