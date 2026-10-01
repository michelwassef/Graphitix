const { createBoxSwarmTestContext } = require('../../test-support/boxSwarmSuite');

describe('Box swarm offsets — preview and resize', () => {
  const suite = createBoxSwarmTestContext();

  test('box preview svg returns the active owner plot source', () => {
    expect(window.Components?.box?.getPreviewSvg).toBeDefined();
    document.body.innerHTML = '<div id="boxPlot"></div>';
    const plot = document.getElementById('boxPlot');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('data-box-base-width', '480');
    svg.setAttribute('data-box-base-height', '360');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-export-layer', 'box-points');
    group.setAttribute('data-trace', '1');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-density');
    group.appendChild(foreignObject);
    group.__boxCanvasRenderState = {
      renderer: 'canvas-density',
      orientation: 'vertical',
      center: 140,
      bins: [
        { coord: 100, halfWidth: 14 },
        { coord: 120, halfWidth: 10 }
      ],
      thickness: 5,
      traceIndex: 1,
      style: {
        fill: '#555555',
        fillOpacity: 0.7,
        stroke: '#222222',
        strokeWidth: 1,
        strokeOpacity: 0.8
      }
    };
    svg.appendChild(group);
    plot.appendChild(svg);
    suite.bindBoxWorkspaceRoot(document.body);
    const previewSvg = window.Components.box.getPreviewSvg();
    expect(previewSvg).toBe(svg);
    expect(previewSvg.querySelector('foreignObject')).toBe(foreignObject);
    expect(previewSvg.getAttribute('width')).toBe('100%');
    expect(previewSvg.getAttribute('height')).toBe('100%');
    document.body.innerHTML = '';
  });

  test('unlocked box resize uses the resizer viewport instead of inflated plot height', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.syncBoxPlotResizeZone).toBe('function');
    document.body.innerHTML = [
      '<div id="boxPage">',
      '<div id="boxGraphPanel">',
      '<div class="svgbox" data-resizer-aspect-locked="false" data-resizer-zoom-level="1">',
      '<div class="resizer-zoom-viewport"><div class="resizer-zoom-content"><div id="boxPlot"></div></div></div>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');
    const svgBox = document.querySelector('.svgbox');
    const viewport = document.querySelector('.resizer-zoom-viewport');
    const plot = document.getElementById('boxPlot');
    suite.bindBoxWorkspaceRoot(document.getElementById('boxPage'));
    svgBox.getBoundingClientRect = () => ({ width: 303, height: 428, top: 0, left: 0, right: 303, bottom: 428 });
    viewport.getBoundingClientRect = () => ({ width: 303, height: 428, top: 0, left: 0, right: 303, bottom: 428 });
    Object.defineProperty(plot, 'clientWidth', { configurable: true, get: () => 303 });
    Object.defineProperty(plot, 'clientHeight', { configurable: true, get: () => 558 });

    const zone = suite.hooks.syncBoxPlotResizeZone({ reason: 'resize', resizePhase: 'move' });

    expect(zone.height).toBe(428);
    expect(zone.rawHeight).toBe(558);
    expect(zone.constrained).toBe(true);
    expect(plot.style.height).toBe('428px');
    expect(plot.style.maxHeight).toBe('428px');
    expect(plot.style.overflow).toBe('hidden');
    document.body.innerHTML = '';
  });

  test('unlocked vertical box resize can grow after a previous shrink', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.syncBoxPlotResizeZone).toBe('function');
    document.body.innerHTML = [
      '<div id="boxPage">',
      '<div id="boxGraphPanel">',
      '<div class="svgbox" data-resizer-aspect-locked="false" data-resizer-zoom-level="1">',
      '<div class="resizer-zoom-viewport"><div class="resizer-zoom-content"><div id="boxPlot"></div></div></div>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');
    const viewport = document.querySelector('.resizer-zoom-viewport');
    const plot = document.getElementById('boxPlot');
    suite.bindBoxWorkspaceRoot(document.getElementById('boxPage'));
    plot.style.height = '263px';
    plot.style.maxHeight = '263px';
    Object.defineProperty(plot, 'clientWidth', { configurable: true, get: () => 472 });
    Object.defineProperty(plot, 'clientHeight', { configurable: true, get: () => 263 });
    viewport.getBoundingClientRect = () => ({ width: 472, height: 383, top: 0, left: 0, right: 472, bottom: 383 });

    const zone = suite.hooks.syncBoxPlotResizeZone({ reason: 'resize', resizePhase: 'move' });

    expect(zone.height).toBe(383);
    expect(zone.rawHeight).toBe(263);
    expect(zone.constrained).toBe(true);
    expect(plot.style.height).toBe('383px');
    expect(plot.style.maxHeight).toBe('383px');
    document.body.innerHTML = '';
  });

  test('box preview svg prefers the committed visible plot frame over hidden pending frames', () => {
    expect(window.Components?.box?.getPreviewSvg).toBeDefined();
    document.body.innerHTML = '<div id="boxPlot"></div>';
    const plot = document.getElementById('boxPlot');
    const staleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    staleSvg.setAttribute('aria-hidden', 'true');
    staleSvg.setAttribute('data-box-pending-render', '1');
    staleSvg.style.opacity = '0';
    const staleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    staleGroup.setAttribute('data-export-layer', 'box-points');
    staleGroup.setAttribute('data-trace', '0');
    const staleForeignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    staleForeignObject.setAttribute('data-point-renderer', 'canvas-preview');
    staleGroup.appendChild(staleForeignObject);
    staleGroup.__boxCanvasRenderState = {
      renderer: 'canvas-preview',
      points: [{ x: 10, y: 20 }],
      pointRadius: 3,
      shape: 'circle',
      traceIndex: 0,
      style: { fill: '#111111', fillOpacity: 1, stroke: '#111111', strokeWidth: 1, strokeOpacity: 1 }
    };
    staleSvg.appendChild(staleGroup);
    plot.appendChild(staleSvg);

    const liveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const liveGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    liveGroup.setAttribute('data-export-layer', 'box-points');
    liveGroup.setAttribute('data-trace', '0');
    const liveForeignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    liveForeignObject.setAttribute('data-point-renderer', 'canvas-preview');
    const liveProxy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    liveProxy.setAttribute('data-point-proxy', '1');
    liveProxy.setAttribute('data-point-fill', '#ff0000');
    liveGroup.appendChild(liveForeignObject);
    liveGroup.appendChild(liveProxy);
    liveGroup.__boxCanvasRenderState = {
      renderer: 'canvas-preview',
      points: [{ x: 10, y: 20 }],
      pointRadius: 3,
      shape: 'circle',
      traceIndex: 0,
      style: { fill: '#ff0000', fillOpacity: 1, stroke: '#ff0000', strokeWidth: 1, strokeOpacity: 1 }
    };
    liveSvg.appendChild(liveGroup);
    plot.appendChild(liveSvg);
    suite.bindBoxWorkspaceRoot(document.body);

    const previewSvg = window.Components.box.getPreviewSvg();
    expect(previewSvg).toBe(liveSvg);
    expect(previewSvg.querySelector('[data-point-proxy="1"]')?.getAttribute('data-point-fill')).toBe('#ff0000');
    document.body.innerHTML = '';
  });

  test('box preview svg prefers current proxy style over stale canvas render state', () => {
    expect(window.Components?.box?.getPreviewSvg).toBeDefined();
    const frag = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-export-layer', 'box-points');
    group.setAttribute('data-trace', '0');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-preview');
    const proxy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    proxy.setAttribute('data-point-proxy', '1');
    proxy.setAttribute('data-point-fill', '#ff0000');
    proxy.setAttribute('data-point-stroke', '#00ff00');
    proxy.setAttribute('data-point-fill-opacity', '0.9');
    proxy.setAttribute('data-point-stroke-opacity', '0.8');
    proxy.setAttribute('data-point-stroke-width', '3');
    proxy.setAttribute('data-point-size', '12');
    proxy.setAttribute('data-shape', 'square');
    group.appendChild(foreignObject);
    group.appendChild(proxy);
    group.__boxCanvasRenderState = {
      renderer: 'canvas-preview',
      points: [{ x: 10, y: 20 }, { x: 18, y: 24 }],
      pointRadius: 3,
      shape: 'circle',
      traceIndex: 0,
      style: {
        fill: '#111111',
        fillOpacity: 0.3,
        stroke: '#222222',
        strokeWidth: 1,
        strokeOpacity: 0.4
      }
    };
    svg.appendChild(group);
    frag.appendChild(svg);
    const previewSvg = window.Components.box.getPreviewSvg({
      id: 'workspace-preview-style-test',
      renderCache: {
        cache: {
          plot: { fragment: frag }
        }
      }
    });
    expect(previewSvg).toBe(svg);
    expect(previewSvg.querySelector('[data-point-proxy="1"]')).toBe(proxy);
  });

  test('box preview source preserves large canvas-density group metadata for shared rasterization', () => {
    expect(window.Components?.box?.getPreviewSvg).toBeDefined();
    const frag = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-export-layer', 'box-points');
    group.setAttribute('data-trace', '0');
    group.setAttribute('data-point-fill', '#ff0000');
    group.setAttribute('data-point-stroke', '#ff0000');
    group.setAttribute('data-point-fill-opacity', '1');
    group.setAttribute('data-point-stroke-opacity', '1');
    group.setAttribute('data-point-stroke-width', '0');
    group.setAttribute('data-point-size', '8');
    group.setAttribute('data-shape', 'circle');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-density');
    group.appendChild(foreignObject);
    const coords = new Float64Array([100, 100, 100, 100, 100, 100, 100]);
    group.__boxCanvasRenderState = {
      renderer: 'canvas-density',
      orientation: 'vertical',
      center: 140,
      bins: [
        { coord: 100, halfWidth: 14, count: coords.length, binIndex: 100 }
      ],
      thickness: 5,
      pointRadius: 4,
      traceIndex: 0,
      approximation: {
        coords,
        raws: coords,
        binSize: 1,
        layoutRadius: 1,
        maxHalfWidth: 14,
        widthScaleMode: 'density'
      },
      style: {
        fill: '#111111',
        fillOpacity: 1,
        stroke: '#111111',
        strokeWidth: 2,
        strokeOpacity: 1
      }
    };
    svg.appendChild(group);
    frag.appendChild(svg);
    const previewSvg = window.Components.box.getPreviewSvg({
      id: 'workspace-preview-canvas-density-style-test',
      renderCache: {
        cache: {
          plot: { fragment: frag }
        }
      }
    });
    expect(previewSvg).toBe(svg);
    expect(previewSvg.querySelector('foreignObject')).toBe(foreignObject);
    expect(group.getAttribute('data-point-fill')).toBe('#ff0000');
  });

  test('box preview source leaves hidden export geometry cleanup to the shared preview pipeline', () => {
    expect(window.Components?.box?.getPreviewSvg).toBeDefined();
    const frag = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-export-layer', 'box-points');
    group.setAttribute('data-trace', '0');
    group.setAttribute('data-point-fill', '#ff0000');
    group.setAttribute('data-point-stroke', '#ff0000');
    group.setAttribute('data-point-fill-opacity', '1');
    group.setAttribute('data-point-stroke-opacity', '1');
    group.setAttribute('data-point-stroke-width', '0');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-density');
    const staleExportPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    staleExportPath.setAttribute('data-box-export-geometry', '1');
    staleExportPath.setAttribute('d', 'M 10 10 L 20 20');
    staleExportPath.setAttribute('stroke', '#111111');
    staleExportPath.style.display = 'none';
    group.appendChild(foreignObject);
    group.appendChild(staleExportPath);
    group.__boxCanvasRenderState = {
      renderer: 'canvas-density',
      orientation: 'vertical',
      center: 140,
      bins: [
        { coord: 100, halfWidth: 14 },
        { coord: 120, halfWidth: 10 }
      ],
      thickness: 5,
      traceIndex: 0,
      style: {
        fill: '#111111',
        fillOpacity: 1,
        stroke: '#111111',
        strokeWidth: 2,
        strokeOpacity: 1
      }
    };
    svg.appendChild(group);
    frag.appendChild(svg);
    const previewSvg = window.Components.box.getPreviewSvg({
      id: 'workspace-preview-canvas-density-stale-export-style-test',
      renderCache: {
        cache: {
          plot: { fragment: frag }
        }
      }
    });
    expect(previewSvg).toBe(svg);
    expect(staleExportPath.style.display).toBe('none');
    expect(group.getAttribute('data-point-fill')).toBe('#ff0000');
  });

  test('box preview source preserves zero-border group metadata for shared rasterization', () => {
    expect(window.Components?.box?.getPreviewSvg).toBeDefined();
    const frag = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-export-layer', 'box-points');
    group.setAttribute('data-trace', '0');
    group.setAttribute('data-point-fill', '#ff0000');
    group.setAttribute('data-point-stroke', '#000000');
    group.setAttribute('data-point-fill-opacity', '1');
    group.setAttribute('data-point-stroke-opacity', '1');
    group.setAttribute('data-point-stroke-width', '0');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-density');
    group.appendChild(foreignObject);
    group.__boxCanvasRenderState = {
      renderer: 'canvas-density',
      orientation: 'vertical',
      center: 140,
      bins: [
        { coord: 100, halfWidth: 14 },
        { coord: 120, halfWidth: 10 }
      ],
      thickness: 5,
      traceIndex: 0,
      style: {
        fill: '#111111',
        fillOpacity: 1,
        stroke: '#000000',
        strokeWidth: 0,
        strokeOpacity: 1
      }
    };
    svg.appendChild(group);
    frag.appendChild(svg);
    const previewSvg = window.Components.box.getPreviewSvg({
      id: 'workspace-preview-canvas-density-zero-border-test',
      renderCache: {
        cache: {
          plot: { fragment: frag }
        }
      }
    });
    expect(previewSvg).toBe(svg);
    expect(group.getAttribute('data-point-fill')).toBe('#ff0000');
    expect(group.getAttribute('data-point-stroke-width')).toBe('0');
  });

  test('box preview source keeps canonical zero-border group attributes', () => {
    expect(window.Components?.box?.getPreviewSvg).toBeDefined();
    const frag = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-export-layer', 'box-points');
    group.setAttribute('data-trace', '0');
    group.setAttribute('data-point-fill', '#ff0000');
    group.setAttribute('data-point-stroke', '#000000');
    group.setAttribute('data-point-fill-opacity', '1');
    group.setAttribute('data-point-stroke-opacity', '1');
    group.setAttribute('data-point-stroke-width', '0');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-density');
    const staleChild = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    staleChild.setAttribute('stroke', '#111111');
    staleChild.setAttribute('stroke-width', '9');
    staleChild.setAttribute('fill', 'none');
    group.appendChild(foreignObject);
    group.appendChild(staleChild);
    group.__boxCanvasRenderState = {
      renderer: 'canvas-density',
      orientation: 'vertical',
      center: 140,
      bins: [
        { coord: 100, halfWidth: 14 },
        { coord: 120, halfWidth: 10 }
      ],
      thickness: 5,
      traceIndex: 0,
      style: {
        fill: '#111111',
        fillOpacity: 1,
        stroke: '#000000',
        strokeWidth: 4,
        strokeOpacity: 1
      }
    };
    svg.appendChild(group);
    frag.appendChild(svg);
    const previewSvg = window.Components.box.getPreviewSvg({
      id: 'workspace-preview-canvas-density-group-attrs-priority-test',
      renderCache: {
        cache: {
          plot: { fragment: frag }
        }
      }
    });
    expect(previewSvg).toBe(svg);
    expect(group.getAttribute('data-point-fill')).toBe('#ff0000');
    expect(group.getAttribute('data-point-stroke-width')).toBe('0');
  });

  test('fast strip auto-size estimator activates for dense datasets', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.resolveFastStripAutoSizeProfile).toBe('function');
    const light = suite.hooks.resolveFastStripAutoSizeProfile({
      pointCounts: [200, 300],
      baseRadius: 5,
      radiusStep: 0.1,
      threshold: 1200
    });
    expect(light).toBe(null);
    const dense = suite.hooks.resolveFastStripAutoSizeProfile({
      pointCounts: [1400, 900],
      baseRadius: 5,
      radiusStep: 0.1,
      threshold: 1200
    });
    expect(dense).toBeTruthy();
    expect(dense.strategy).toBe('density-floor-fast');
    expect(Number.isFinite(Number(dense.radius))).toBe(true);
    expect(Number(dense.radius)).toBeGreaterThan(0);
    expect(Number(dense.radius)).toBeLessThanOrEqual(5);
  });

  test('live resize phases are identified consistently', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.isBoxLiveResize).toBe('function');
    expect(suite.hooks.isBoxLiveResize({ reason: 'resize', resizePhase: 'start' })).toBe(true);
    expect(suite.hooks.isBoxLiveResize({ reason: 'resize', resizePhase: 'move' })).toBe(true);
    expect(suite.hooks.isBoxLiveResize({ reason: 'resize', resizePhase: 'end' })).toBe(true);
    expect(suite.hooks.isBoxLiveResize({ reason: 'resize', resizePhase: 'end' }, { includeEnd: false })).toBe(false);
    expect(suite.hooks.isBoxLiveResize({ reason: 'resize', resizePhase: 'observe' })).toBe(false);
    expect(suite.hooks.isBoxLiveResize({ reason: 'point-mode-change', resizePhase: 'move' })).toBe(false);
  });

});
