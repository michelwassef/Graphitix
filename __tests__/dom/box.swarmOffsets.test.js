const { createBoxSwarmTestContext } = require('../../test-support/boxSwarmSuite');

describe('Box swarm offsets — density model and gates', () => {
  const suite = createBoxSwarmTestContext();

  test('dense point canvas preview is restricted to large traces or explicit renderer requests', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.shouldUseBoxPointCanvasPreview).toBe('function');
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'resize' }, { pointCount: 100 })).toBe(false);
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'resize-live' }, { pointCount: 100 })).toBe(false);
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'resize-observe' }, { pointCount: 100 })).toBe(false);
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ viewOnly: false, reason: 'resize' }, { pointCount: 1800, threshold: 1200 })).toBe(true);
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'significance-viewport-extension' }, { pointCount: 1800, threshold: 1200 })).toBe(true);
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'font-style-change' }, { pointCount: 100, threshold: 1200 })).toBe(false);
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ viewOnly: false, reason: 'resize-live' }, { pointCount: 100, threshold: 1200 })).toBe(false);
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ pointRenderer: 'canvas' })).toBe(true);
    expect(suite.hooks.shouldUseBoxPointCanvasPreview({ pointRenderer: 'svg', viewOnly: false, reason: 'resize' }, { pointCount: 1800, threshold: 1200 })).toBe(false);
  });

  test('swarm worker gate only enables for large traces when workers are supported', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.shouldUseBoxSwarmWorker).toBe('function');
    const shared = window.Shared = window.Shared || {};
    const originalWorkers = shared.Workers;
    try{
      shared.Workers = {
        runTask: jest.fn(),
        isSupported: () => true
      };
      expect(suite.hooks.shouldUseBoxSwarmWorker(999)).toBe(false);
      expect(suite.hooks.shouldUseBoxSwarmWorker(1000)).toBe(true);
      shared.Workers = {
        runTask: jest.fn(),
        isSupported: () => false
      };
      expect(suite.hooks.shouldUseBoxSwarmWorker(5000)).toBe(false);
      shared.Workers = {
        isSupported: () => true
      };
      expect(suite.hooks.shouldUseBoxSwarmWorker(5000)).toBe(false);
    }finally{
      shared.Workers = originalWorkers;
    }
  });

  test('huge-trace density canvas gate only enables for very large non-indexed traces', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.shouldUseBoxDensityPointCanvas).toBe('function');
    expect(suite.hooks.shouldUseBoxDensityPointCanvas({ pointCount: 8000, threshold: 8000 })).toBe(false);
    expect(suite.hooks.shouldUseBoxDensityPointCanvas({ pointCount: 9001, threshold: 8000 })).toBe(true);
    expect(suite.hooks.shouldUseBoxDensityPointCanvas({
      pointCount: 12000,
      threshold: 8000,
      collectsPointByRow: true
    })).toBe(false);
  });

  test('huge-trace density bins compress dense point clouds deterministically', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.buildBoxDensityPointLayout).toBe('function');
    const pointCount = 12000;
    const coords = new Float64Array(pointCount);
    const raws = new Float64Array(pointCount);
    for(let idx = 0; idx < pointCount; idx += 1){
      const band = idx % 240;
      coords[idx] = 100 + band * 0.28;
      raws[idx] = 50 + band * 0.5;
    }
    const layout = suite.hooks.buildBoxDensityPointLayout({
      coords,
      raws,
      orientation: 'vertical',
      radius: 3,
      maxHalfWidth: 48,
      widthScaleMode: 'density'
    });
    expect(layout).toBeTruthy();
    expect(layout.orientation).toBe('vertical');
    expect(Array.isArray(layout.bins)).toBe(true);
    expect(layout.bins.length).toBeGreaterThan(0);
    expect(layout.bins.length).toBeLessThan(pointCount / 10);
    expect(Number.isFinite(Number(layout.thickness))).toBe(true);
    expect(Number(layout.thickness)).toBeGreaterThan(0);
    expect(Number.isFinite(Number(layout.maxOffsetUsed))).toBe(true);
    expect(Number(layout.maxOffsetUsed)).toBeGreaterThan(0);
    expect(layout.bins[0].coord).toBeLessThanOrEqual(layout.bins[layout.bins.length - 1].coord);
  });

  test('huge-trace density layout stores one offset per source point', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.buildBoxDensityPointLayout).toBe('function');
    const coords = new Float64Array(9000);
    for(let idx = 0; idx < coords.length; idx += 1){
      coords[idx] = 160 + Math.sin(idx / 90) * 18 + ((idx % 300) - 150) * 0.035;
    }
    const layout = suite.hooks.buildBoxDensityPointLayout({
      coords,
      raws: coords,
      orientation: 'vertical',
      radius: 1,
      maxHalfWidth: 32,
      widthScaleMode: 'density'
    });
    expect(layout).toBeTruthy();
    expect(ArrayBuffer.isView(layout.offsets)).toBe(true);
    expect(layout.offsets.length).toBe(coords.length);
    expect(layout.bins.length).toBeLessThan(coords.length / 10);
    expect(Number(layout.bandwidth)).toBeGreaterThan(Number(layout.binSize));
    expect(Number(layout.maxOffsetUsed)).toBeGreaterThan(1);
  });

  test('huge-trace density layout tapers sparse tails instead of enforcing a chimney floor', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.buildBoxDensityPointLayout).toBe('function');
    const coords = new Float64Array(9001);
    for(let idx = 0; idx < 9000; idx += 1){
      coords[idx] = 220 + Math.sin(idx / 50) * 28 + ((idx % 240) - 120) * 0.04;
    }
    coords[9000] = 1050;
    const layout = suite.hooks.buildBoxDensityPointLayout({
      coords,
      raws: coords,
      orientation: 'vertical',
      radius: 1,
      maxHalfWidth: 36,
      widthScaleMode: 'density'
    });
    expect(layout).toBeTruthy();
    const coreMax = layout.bins.reduce((max, bin) => Math.max(max, Number(bin.halfWidth) || 0), 0);
    const outlierBin = layout.bins.reduce((closest, bin) => {
      if(!closest){ return bin; }
      return Math.abs(Number(bin.coord) - 1050) < Math.abs(Number(closest.coord) - 1050) ? bin : closest;
    }, null);
    expect(coreMax).toBeGreaterThan(20);
    expect(Number(outlierBin?.halfWidth) || 0).toBeLessThan(0.5);
    expect(Math.abs(Number(layout.offsets[9000]) || 0)).toBeLessThan(0.01);
  });

  test('huge-trace density layout tapers at observed data boundaries', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.buildBoxDensityPointLayout).toBe('function');
    const coords = new Float64Array(10000);
    for(let idx = 0; idx < coords.length; idx += 1){
      coords[idx] = 100 + Math.pow(idx / (coords.length - 1), 1.6) * 420;
    }
    const layout = suite.hooks.buildBoxDensityPointLayout({
      coords,
      raws: coords,
      orientation: 'vertical',
      radius: 1,
      maxHalfWidth: 40,
      widthScaleMode: 'density'
    });
    expect(layout).toBeTruthy();
    const minCoord = 100;
    const edgeBin = layout.bins.reduce((closest, bin) => {
      if(!closest){ return bin; }
      return Math.abs(Number(bin.coord) - minCoord) < Math.abs(Number(closest.coord) - minCoord) ? bin : closest;
    }, null);
    const interiorCoord = minCoord + Number(layout.bandwidth);
    const interiorBin = layout.bins.reduce((closest, bin) => {
      if(!closest){ return bin; }
      return Math.abs(Number(bin.coord) - interiorCoord) < Math.abs(Number(closest.coord) - interiorCoord) ? bin : closest;
    }, null);
    expect(Number(edgeBin?.halfWidth) || 0).toBeLessThan(0.5);
    expect(Number(interiorBin?.halfWidth) || 0).toBeGreaterThan(Number(edgeBin?.halfWidth) || 0);
    expect(Math.abs(Number(layout.offsets[0]) || 0)).toBeLessThan(0.01);
    expect(Math.abs(Number(layout.offsets[layout.offsets.length - 1]) || 0)).toBeLessThan(0.01);
  });

  test('huge-trace density centers preserve selected symbol geometry', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.buildBoxDensityPointCenters).toBe('function');
    const centers = suite.hooks.buildBoxDensityPointCenters({
      bins: [
        { coord: 100, halfWidth: 12, count: 20 },
        { coord: 116, halfWidth: 6, count: 4 }
      ],
      orientation: 'vertical',
      center: 240,
      radius: 3
    });
    expect(Array.isArray(centers)).toBe(true);
    expect(centers.length).toBeGreaterThan(2);
    expect(centers.some(point => point.x < 240)).toBe(true);
    expect(centers.some(point => point.x > 240)).toBe(true);
    expect(centers.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });

  test('huge-trace density center count is independent from visual point size', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.buildBoxDensityPointCenters).toBe('function');
    const bins = [{ coord: 100, halfWidth: 24, count: 100 }];
    const small = suite.hooks.buildBoxDensityPointCenters({
      bins,
      orientation: 'vertical',
      center: 200,
      radius: 1,
      spacingRadius: 1
    });
    const large = suite.hooks.buildBoxDensityPointCenters({
      bins,
      orientation: 'vertical',
      center: 200,
      radius: 6,
      spacingRadius: 1
    });
    expect(small.length).toBeGreaterThan(1);
    expect(large.length).toBe(small.length);
  });

  test('canvas-density renderer draws every source datum', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.renderStoredBoxCanvasPointGroup).toBe('function');
    const originalGetContext = window.HTMLCanvasElement.prototype.getContext;
    let arcCount = 0;
    window.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      setTransform: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      arc: jest.fn(() => { arcCount += 1; }),
      fill: jest.fn(),
      stroke: jest.fn(),
      set fillStyle(_value) {},
      set strokeStyle(_value) {},
      set lineWidth(_value) {},
      set globalAlpha(_value) {},
      set lineCap(_value) {},
      set lineJoin(_value) {}
    }));
    try{
      const coords = new Float64Array([100, 100, 100, 100, 100, 100, 100]);
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('data-export-layer', 'box-points');
      group.__boxCanvasRenderState = {
        renderer: 'canvas-density',
        bins: [{ coord: 100, halfWidth: 12, count: coords.length, binIndex: 100 }],
        hitBins: [{ coord: 100, halfWidth: 12, count: coords.length, binIndex: 100 }],
        orientation: 'vertical',
        center: 200,
        thickness: 2,
        traceIndex: 0,
        pointRadius: 2,
        shape: 'circle',
        hitCenter: 200,
        hitOrientation: 'vertical',
        hitStrokeWidth: 20,
        approximation: {
          coords,
          raws: coords,
          maxHalfWidth: 12,
          layoutRadius: 1,
          binSize: 1,
          widthScaleMode: 'density'
        },
        style: {
          fill: '#111111',
          fillOpacity: 1,
          stroke: '#222222',
          strokeWidth: 0,
          strokeOpacity: 1
        }
      };
      expect(suite.hooks.renderStoredBoxCanvasPointGroup(group)).toBe(true);
      expect(arcCount).toBe(coords.length);
      expect(group.querySelector('foreignObject[data-point-renderer="canvas-density"]')).toBeTruthy();
    }finally{
      window.HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test('canvas-density source layout interpolates density width between bins', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.resolveBoxDensityHalfWidthForCoord).toBe('function');
    const config = {
      bins: [
        { coord: 0, halfWidth: 10 },
        { coord: 10, halfWidth: 30 }
      ],
      binSize: 10
    };
    expect(suite.hooks.resolveBoxDensityHalfWidthForCoord(config, 0)).toBeCloseTo(10, 5);
    expect(suite.hooks.resolveBoxDensityHalfWidthForCoord(config, 5)).toBeCloseTo(20, 5);
    expect(suite.hooks.resolveBoxDensityHalfWidthForCoord(config, 10)).toBeCloseTo(30, 5);
  });

  test('canvas-density live shape and size changes update render state without rebuilding density layout', () => {
    expect(suite.hooks).toBeDefined();
    expect(typeof suite.hooks.applyBoxCanvasPointGroupStyleLive).toBe('function');
    const originalGetContext = window.HTMLCanvasElement.prototype.getContext;
    const ops = [];
    window.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      setTransform: jest.fn(),
      beginPath: jest.fn(() => ops.push('begin')),
      moveTo: jest.fn((x, y) => ops.push(['moveTo', x, y])),
      lineTo: jest.fn((x, y) => ops.push(['lineTo', x, y])),
      closePath: jest.fn(() => ops.push('close')),
      arc: jest.fn((x, y, radius) => ops.push(['arc', x, y, radius])),
      rect: jest.fn((x, y, width, height) => ops.push(['rect', x, y, width, height])),
      fill: jest.fn(() => ops.push('fill')),
      stroke: jest.fn(() => ops.push('stroke')),
      set fillStyle(value){ ops.push(['fillStyle', value]); },
      set strokeStyle(value){ ops.push(['strokeStyle', value]); },
      set lineWidth(value){ ops.push(['lineWidth', value]); },
      set globalAlpha(value){ ops.push(['globalAlpha', value]); },
      set lineCap(value){ ops.push(['lineCap', value]); },
      set lineJoin(value){ ops.push(['lineJoin', value]); }
    }));
    try{
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('data-export-layer', 'box-points');
      group.setAttribute('data-trace', '0');
      const coords = new Float64Array(120);
      for(let idx = 0; idx < coords.length; idx += 1){
        coords[idx] = 100 + idx * 0.25;
      }
      const initial = suite.hooks.buildBoxDensityPointLayout({
        coords,
        raws: coords,
        orientation: 'vertical',
        radius: 3,
        maxHalfWidth: 20,
        widthScaleMode: 'density'
      });
      const initialCenterCount = suite.hooks.buildBoxDensityPointCenters({
        bins: initial.bins,
        orientation: 'vertical',
        center: 200,
        radius: 3,
        spacingRadius: 3
      }).length;
      group.__boxCanvasRenderState = {
        renderer: 'canvas-density',
        bins: initial.bins,
        hitBins: initial.bins,
        orientation: 'vertical',
        center: 200,
        thickness: initial.thickness,
        traceIndex: 0,
        pointRadius: 3,
        shape: 'circle',
        hitCenter: 200,
        hitOrientation: 'vertical',
        hitStrokeWidth: 20,
        approximation: {
          coords,
          raws: coords,
          maxHalfWidth: 20,
          layoutRadius: 3,
          widthScaleMode: 'density'
        },
        style: {
          fill: '#111111',
          fillOpacity: 1,
          stroke: '#222222',
          strokeWidth: 1,
          strokeOpacity: 1
        }
      };
      const applied = suite.hooks.applyBoxCanvasPointGroupStyleLive(group, { shape: 'diamond', size: 6 });
      expect(applied).toBe(true);
      expect(group.__boxCanvasRenderState.shape).toBe('diamond');
      expect(group.__boxCanvasRenderState.pointRadius).toBe(6);
      expect(group.__boxCanvasRenderState.thickness).toBeCloseTo(initial.thickness, 5);
      expect(group.__boxCanvasRenderState.bins).toBe(initial.bins);
      expect(suite.hooks.buildBoxDensityPointCenters({
        bins: group.__boxCanvasRenderState.bins,
        orientation: 'vertical',
        center: 200,
        radius: 6,
        spacingRadius: group.__boxCanvasRenderState.approximation.layoutRadius
      }).length).toBe(initialCenterCount);
      expect(group.getAttribute('data-shape')).toBe('diamond');
      expect(group.getAttribute('data-point-size')).toBe('12');
      expect(ops.some(entry => Array.isArray(entry) && entry[0] === 'lineTo')).toBe(true);
      expect(ops.some(entry => Array.isArray(entry) && entry[0] === 'arc')).toBe(false);
    }finally{
      window.HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

});
