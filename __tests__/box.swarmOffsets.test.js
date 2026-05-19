const { ensureMainSession, ensureWorkspaceTabs, initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('Box swarm offset constraints', () => {
  let hooks;

  function bindBoxWorkspaceRoot(root, tabId = 'workspace-test'){
    ensureWorkspaceTabs({
      getMountedRoot: () => root
    });
    const { session } = ensureMainSession({
      workspaceState: { tabs: [], activeTabId: tabId },
      activeTab: { id: tabId, type: 'box' }
    });
    session.getActiveTab.mockReturnValue({ id: tabId, type: 'box' });
    if(window.Components?.box){
      window.Components.box.__boundTabId = tabId;
    }
  }

  function hasOverlap(result, coordsInput, minDistanceFactor = 2){
    const offsets = Array.isArray(result?.offsets) ? result.offsets : [];
    const coords = (Array.isArray(coordsInput) || ArrayBuffer.isView(coordsInput)) ? coordsInput : [];
    const radius = Number(result?.adjustedRadius);
    if(!offsets.length || !Number.isFinite(radius) || radius <= 0){
      return false;
    }
    const spacingFactor = Number.isFinite(Number(minDistanceFactor)) && Number(minDistanceFactor) > 0
      ? Number(minDistanceFactor)
      : 2;
    const minDistance = radius * spacingFactor - 1e-6;
    const minDistanceSq = minDistance * minDistance;
    for(let i = 0; i < offsets.length; i += 1){
      const ax = Number(offsets[i]) || 0;
      const ay = Number(coords[i]) || 0;
      for(let j = i + 1; j < offsets.length; j += 1){
        const bx = Number(offsets[j]) || 0;
        const by = Number(coords[j]) || 0;
        const dx = bx - ax;
        const dy = by - ay;
        if(dx * dx + dy * dy < minDistanceSq){
          return true;
        }
      }
    }
    return false;
  }

  beforeAll(() => {
    jest.resetModules();
    initializeWorkspaceHarness();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('spacing profile is continuous across sample sizes', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeSwarmSpacingProfile).toBe('function');
    const p19 = hooks.computeSwarmSpacingProfile({
      sampleSize: 19,
      enforceNonOverlap: true
    });
    const p20 = hooks.computeSwarmSpacingProfile({
      sampleSize: 20,
      enforceNonOverlap: true
    });
    expect(Number.isFinite(p19?.collisionGapFactor)).toBe(true);
    expect(Number.isFinite(p20?.collisionGapFactor)).toBe(true);
    expect(Math.abs(p19.collisionGapFactor - p20.collisionGapFactor)).toBeLessThan(0.05);
  });

  test('strip min radius floor decays smoothly from low to medium density', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveStripMinRadiusFloor).toBe('function');
    const baseRadius = 5;
    const r11 = Number(hooks.resolveStripMinRadiusFloor(11, baseRadius));
    const r140 = Number(hooks.resolveStripMinRadiusFloor(140, baseRadius));
    expect(r11).toBeCloseTo(5, 4);
    expect(r140).toBeCloseTo(2, 2);
    const r140Scaled = Number(hooks.resolveStripMinRadiusFloor(140, 8));
    expect(r140Scaled).toBeGreaterThan(r140);
    const sampleSizes = [11, 20, 40, 80, 140, 300, 1000];
    const radii = sampleSizes.map(size => Number(hooks.resolveStripMinRadiusFloor(size, baseRadius)));
    for(let i = 1; i < radii.length; i += 1){
      expect(radii[i]).toBeLessThanOrEqual(radii[i - 1] + 1e-6);
    }
    const r139 = Number(hooks.resolveStripMinRadiusFloor(139, baseRadius));
    const r141 = Number(hooks.resolveStripMinRadiusFloor(141, baseRadius));
    expect(Math.abs(r141 - r139)).toBeLessThan(0.1);
  });

  test('responsive point radius reacts to horizontal and vertical resize', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveResponsivePointRadius).toBe('function');
    const base = 5;
    const unit = Number(hooks.resolveResponsivePointRadius(base, {
      scaleW: 1,
      scaleH: 1,
      styleScale: 1,
      styleUnclamped: 1
    }, { min: 0.75, context: 'test-point' }));
    expect(unit).toBeCloseTo(base, 4);
    const shrunkBoth = Number(hooks.resolveResponsivePointRadius(base, {
      scaleW: 0.64,
      scaleH: 0.56,
      styleScale: Math.sqrt(0.64 * 0.56),
      styleUnclamped: Math.sqrt(0.64 * 0.56)
    }, { min: 0.75, context: 'test-point' }));
    expect(shrunkBoth).toBeLessThan(unit * 0.8);
    const anisotropic = Number(hooks.resolveResponsivePointRadius(base, {
      scaleW: 2,
      scaleH: 0.5,
      styleScale: Math.sqrt(2 * 0.5),
      styleUnclamped: Math.sqrt(2 * 0.5)
    }, { min: 0.75, context: 'test-point' }));
    expect(anisotropic).toBeLessThan(unit);
    const grownBoth = Number(hooks.resolveResponsivePointRadius(base, {
      scaleW: 1.5,
      scaleH: 1.4,
      styleScale: Math.sqrt(1.5 * 1.4),
      styleUnclamped: Math.sqrt(1.5 * 1.4)
    }, { min: 0.75, context: 'test-point' }));
    expect(grownBoth).toBeGreaterThan(unit);
  });

  test('hard max half-width keeps strict swarm capped without collapsing points', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeSwarmOffsets).toBe('function');
    const pointCount = 12;
    const coords = new Float64Array(pointCount);
    const raws = new Float64Array(pointCount);
    for(let i = 0; i < pointCount; i += 1){
      coords[i] = 42;
      raws[i] = 42;
    }
    const cap = 8;
    const result = hooks.computeSwarmOffsets(
      { coords, raws },
      {
        axisSpacing: 60,
        pointRadius: 4,
        sampleSize: pointCount,
        orientation: 'vertical',
        widthScaleMode: 'density',
        maxHalfWidth: cap,
        hardMaxHalfWidth: cap,
        allowRadiusAdjustment: true,
        skipBucketCentering: false,
        enforceNonOverlap: true
      }
    );
    expect(Array.isArray(result?.offsets)).toBe(true);
    expect(result.maxOffsetUsed).toBeLessThanOrEqual(cap + 1e-6);
    expect(Number.isFinite(Number(result?.adjustedRadius))).toBe(true);
    expect(Number(result.adjustedRadius)).toBeGreaterThan(0.1);
    const distinct = new Set((result.offsets || []).map(v => Math.round((Number(v) || 0) * 1000)));
    expect(distinct.size).toBeGreaterThan(2);
  });

  test('strict spacing behaves consistently around sample-size boundary', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeSwarmOffsets).toBe('function');
    const cap = 10;
    const results = [19, 20].map(pointCount => {
      const coords = new Float64Array(pointCount);
      const raws = new Float64Array(pointCount);
      for(let i = 0; i < pointCount; i += 1){
        coords[i] = 30;
        raws[i] = 30;
      }
      const result = hooks.computeSwarmOffsets(
        { coords, raws },
        {
          axisSpacing: 72,
          pointRadius: 4,
          sampleSize: pointCount,
          orientation: 'vertical',
          widthScaleMode: 'density',
          maxHalfWidth: cap,
          hardMaxHalfWidth: cap,
          allowRadiusAdjustment: true,
          skipBucketCentering: false,
          enforceNonOverlap: true
        }
      );
      expect(result.maxOffsetUsed).toBeLessThanOrEqual(cap + 1e-6);
      return result;
    });
    const radius19 = Number(results[0]?.adjustedRadius);
    const radius20 = Number(results[1]?.adjustedRadius);
    expect(Number.isFinite(radius19)).toBe(true);
    expect(Number.isFinite(radius20)).toBe(true);
    expect(Math.abs(radius19 - radius20)).toBeLessThan(0.35);
  });

  test('capped swarm offsets remain centered around zero', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeSwarmOffsets).toBe('function');
    const pointCount = 11;
    const coords = new Float64Array(pointCount);
    const raws = new Float64Array(pointCount);
    for(let i = 0; i < pointCount; i += 1){
      coords[i] = 10;
      raws[i] = 10;
    }
    const result = hooks.computeSwarmOffsets(
      { coords, raws },
      {
        axisSpacing: 56,
        pointRadius: 3.5,
        sampleSize: pointCount,
        orientation: 'vertical',
        widthScaleMode: 'density',
        maxHalfWidth: 7.5,
        hardMaxHalfWidth: 7.5,
        allowRadiusAdjustment: true,
        skipBucketCentering: false,
        enforceNonOverlap: true
      }
    );
    const offsets = Array.isArray(result?.offsets) ? result.offsets : [];
    const mean = offsets.length
      ? offsets.reduce((sum, value) => sum + (Number(value) || 0), 0) / offsets.length
      : 0;
    expect(Math.abs(mean)).toBeLessThan(0.5);
  });

  test('strip spread scale keeps full spread when pitch is sufficient', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeStripSpreadScale).toBe('function');
    const scale = hooks.computeStripSpreadScale({
      minCenterPitch: 40,
      effectiveRadius: 2,
      maxOffsetUsed: 8,
      gapFactor: 0.10
    });
    expect(scale).toBeCloseTo(1, 6);
  });

  test('strip spread scale compresses when pitch is tight', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeStripSpreadScale).toBe('function');
    const scale = hooks.computeStripSpreadScale({
      minCenterPitch: 20,
      effectiveRadius: 2,
      maxOffsetUsed: 8,
      gapFactor: 0.10
    });
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1);
  });

  test('pitch boundary can force narrower clouds with smaller radius', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeStripHalfExtentLimit).toBe('function');
    expect(typeof hooks.computeSwarmOffsets).toBe('function');
    const pointCount = 120;
    const coords = new Float64Array(pointCount);
    const raws = new Float64Array(pointCount);
    for(let i = 0; i < pointCount; i += 1){
      coords[i] = 30;
      raws[i] = 30;
    }
    const pointRadius = 4;
    const halfExtentLimit = hooks.computeStripHalfExtentLimit({
      minCenterPitch: 20,
      gapFactor: 0.10,
      minGapPx: 4
    });
    expect(Number.isFinite(halfExtentLimit)).toBe(true);
    expect(halfExtentLimit).toBeGreaterThan(0);
    const maxHalfWidth = Math.max(0, Number(halfExtentLimit) - pointRadius);
    const result = hooks.computeSwarmOffsets(
      { coords, raws },
      {
        axisSpacing: 60,
        pointRadius,
        sampleSize: pointCount,
        orientation: 'vertical',
        widthScaleMode: 'density',
        maxHalfWidth,
        hardMaxHalfWidth: maxHalfWidth,
        allowRadiusAdjustment: true,
        skipBucketCentering: false,
        enforceNonOverlap: true,
        radiusCountExponent: 0.85
      }
    );
    expect(Number.isFinite(Number(result?.adjustedRadius))).toBe(true);
    expect(Number(result.adjustedRadius)).toBeLessThanOrEqual(pointRadius);
    const combinedHalfExtent = (Number(result?.maxOffsetUsed) || 0) + (Number(result?.adjustedRadius) || 0);
    expect(combinedHalfExtent).toBeLessThanOrEqual(Number(halfExtentLimit) + 1e-6);
  });

  test('dense point canvas preview is restricted to large traces or explicit renderer requests', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.shouldUseBoxPointCanvasPreview).toBe('function');
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'resize' }, { pointCount: 100 })).toBe(false);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'resize-live' }, { pointCount: 100 })).toBe(false);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'resize-observe' }, { pointCount: 100 })).toBe(false);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: false, reason: 'resize' }, { pointCount: 1800, threshold: 1200 })).toBe(true);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'significance-viewport-extension' }, { pointCount: 1800, threshold: 1200 })).toBe(true);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'font-style-change' }, { pointCount: 100, threshold: 1200 })).toBe(false);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: false, reason: 'resize-live' }, { pointCount: 100, threshold: 1200 })).toBe(false);
    expect(hooks.shouldUseBoxPointCanvasPreview({ pointRenderer: 'canvas' })).toBe(true);
    expect(hooks.shouldUseBoxPointCanvasPreview({ pointRenderer: 'svg', viewOnly: false, reason: 'resize' }, { pointCount: 1800, threshold: 1200 })).toBe(false);
  });

  test('swarm worker gate only enables for large traces when workers are supported', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.shouldUseBoxSwarmWorker).toBe('function');
    const shared = window.Shared = window.Shared || {};
    const originalWorkers = shared.Workers;
    try{
      shared.Workers = {
        runTask: jest.fn(),
        isSupported: () => true
      };
      expect(hooks.shouldUseBoxSwarmWorker(999)).toBe(false);
      expect(hooks.shouldUseBoxSwarmWorker(1000)).toBe(true);
      shared.Workers = {
        runTask: jest.fn(),
        isSupported: () => false
      };
      expect(hooks.shouldUseBoxSwarmWorker(5000)).toBe(false);
      shared.Workers = {
        isSupported: () => true
      };
      expect(hooks.shouldUseBoxSwarmWorker(5000)).toBe(false);
    }finally{
      shared.Workers = originalWorkers;
    }
  });

  test('huge-trace density canvas gate only enables for very large non-indexed traces', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.shouldUseBoxDensityPointCanvas).toBe('function');
    expect(hooks.shouldUseBoxDensityPointCanvas({ pointCount: 8000, threshold: 8000 })).toBe(false);
    expect(hooks.shouldUseBoxDensityPointCanvas({ pointCount: 9001, threshold: 8000 })).toBe(true);
    expect(hooks.shouldUseBoxDensityPointCanvas({
      pointCount: 12000,
      threshold: 8000,
      collectsPointByRow: true
    })).toBe(false);
  });

  test('huge-trace density bins compress dense point clouds deterministically', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxDensityPointLayout).toBe('function');
    const pointCount = 12000;
    const coords = new Float64Array(pointCount);
    const raws = new Float64Array(pointCount);
    for(let idx = 0; idx < pointCount; idx += 1){
      const band = idx % 240;
      coords[idx] = 100 + band * 0.28;
      raws[idx] = 50 + band * 0.5;
    }
    const layout = hooks.buildBoxDensityPointLayout({
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
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxDensityPointLayout).toBe('function');
    const coords = new Float64Array(9000);
    for(let idx = 0; idx < coords.length; idx += 1){
      coords[idx] = 160 + Math.sin(idx / 90) * 18 + ((idx % 300) - 150) * 0.035;
    }
    const layout = hooks.buildBoxDensityPointLayout({
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
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxDensityPointLayout).toBe('function');
    const coords = new Float64Array(9001);
    for(let idx = 0; idx < 9000; idx += 1){
      coords[idx] = 220 + Math.sin(idx / 50) * 28 + ((idx % 240) - 120) * 0.04;
    }
    coords[9000] = 1050;
    const layout = hooks.buildBoxDensityPointLayout({
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
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxDensityPointLayout).toBe('function');
    const coords = new Float64Array(10000);
    for(let idx = 0; idx < coords.length; idx += 1){
      coords[idx] = 100 + Math.pow(idx / (coords.length - 1), 1.6) * 420;
    }
    const layout = hooks.buildBoxDensityPointLayout({
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
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxDensityPointCenters).toBe('function');
    const centers = hooks.buildBoxDensityPointCenters({
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
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxDensityPointCenters).toBe('function');
    const bins = [{ coord: 100, halfWidth: 24, count: 100 }];
    const small = hooks.buildBoxDensityPointCenters({
      bins,
      orientation: 'vertical',
      center: 200,
      radius: 1,
      spacingRadius: 1
    });
    const large = hooks.buildBoxDensityPointCenters({
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
    expect(hooks).toBeDefined();
    expect(typeof hooks.renderStoredBoxCanvasPointGroup).toBe('function');
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
      expect(hooks.renderStoredBoxCanvasPointGroup(group)).toBe(true);
      expect(arcCount).toBe(coords.length);
      expect(group.querySelector('foreignObject[data-point-renderer="canvas-density"]')).toBeTruthy();
    }finally{
      window.HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test('canvas-density source layout interpolates density width between bins', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveBoxDensityHalfWidthForCoord).toBe('function');
    const config = {
      bins: [
        { coord: 0, halfWidth: 10 },
        { coord: 10, halfWidth: 30 }
      ],
      binSize: 10
    };
    expect(hooks.resolveBoxDensityHalfWidthForCoord(config, 0)).toBeCloseTo(10, 5);
    expect(hooks.resolveBoxDensityHalfWidthForCoord(config, 5)).toBeCloseTo(20, 5);
    expect(hooks.resolveBoxDensityHalfWidthForCoord(config, 10)).toBeCloseTo(30, 5);
  });

  test('canvas-density live shape and size changes update render state without rebuilding density layout', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.applyBoxCanvasPointGroupStyleLive).toBe('function');
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
      const initial = hooks.buildBoxDensityPointLayout({
        coords,
        raws: coords,
        orientation: 'vertical',
        radius: 3,
        maxHalfWidth: 20,
        widthScaleMode: 'density'
      });
      const initialCenterCount = hooks.buildBoxDensityPointCenters({
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
      const applied = hooks.applyBoxCanvasPointGroupStyleLive(group, { shape: 'diamond', size: 6 });
      expect(applied).toBe(true);
      expect(group.__boxCanvasRenderState.shape).toBe('diamond');
      expect(group.__boxCanvasRenderState.pointRadius).toBe(6);
      expect(group.__boxCanvasRenderState.thickness).toBeCloseTo(initial.thickness, 5);
      expect(group.__boxCanvasRenderState.bins).toBe(initial.bins);
      expect(hooks.buildBoxDensityPointCenters({
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

  test('box point toolbar size reports rendered auto-sized canvas radius', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveBoxToolbarPointSizeValue).toBe('function');
    const proxy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    proxy.setAttribute('data-point-size', '1.6');
    expect(hooks.resolveBoxToolbarPointSizeValue({ size: 5 }, proxy)).toBeCloseTo(0.8, 5);
    expect(hooks.resolveBoxToolbarPointSizeValue({ size: 3.2 }, proxy)).toBeCloseTo(3.2, 5);
  });

  test('box point toolbar border width enables the selected default stroke color', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveBoxToolbarPointBorderWidthPatch).toBe('function');
    expect(typeof hooks.resolveBoxToolbarPointBorderColorValue).toBe('function');
    expect(typeof hooks.normalizeBoxPointStylePatch).toBe('function');
    const proxy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    proxy.setAttribute('data-point-stroke', '#ffffff');
    proxy.setAttribute('data-point-stroke-width', '0');
    expect(hooks.resolveBoxToolbarPointBorderColorValue({}, proxy)).toBe('#000000');
    const patch = hooks.resolveBoxToolbarPointBorderWidthPatch({ stroke: 'none' }, proxy, 1.5);
    expect(patch).toEqual({
      borderWidth: 1.5,
      strokeWidth: 1.5,
      stroke: '#000000',
      borderColor: '#000000'
    });
    proxy.setAttribute('data-point-stroke-width', '2');
    expect(hooks.resolveBoxToolbarPointBorderColorValue({}, proxy)).toBe('#ffffff');
    expect(hooks.resolveBoxToolbarPointBorderWidthPatch({ stroke: '#123456' }, proxy, 0)).toEqual({
      borderWidth: 0,
      strokeWidth: 0
    });
    expect(hooks.normalizeBoxPointStylePatch({ stroke: '#000000', borderWidth: 1.5 })).toEqual({
      stroke: '#000000',
      borderWidth: 1.5,
      borderColor: '#000000',
      strokeWidth: 1.5
    });
  });

  test('explicit point border width survives redraw stroke cap for tiny dense points', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveBoxPointStrokeWidthForRender).toBe('function');
    expect(typeof hooks.hasExplicitBoxPointBorderWidth).toBe('function');
    expect(hooks.resolveBoxPointStrokeWidthForRender(1.5, 0.4, { explicit: false })).toBe(0);
    expect(hooks.resolveBoxPointStrokeWidthForRender(1.5, 0.4, { explicit: true })).toBe(1.5);
    expect(hooks.hasExplicitBoxPointBorderWidth({ borderWidth: 1.5 })).toBe(true);
    expect(hooks.hasExplicitBoxPointBorderWidth({ strokeWidth: 1.5 })).toBe(true);
    expect(hooks.hasExplicitBoxPointBorderWidth({})).toBe(false);
  });

  test('canvas-backed point groups expose an interaction proxy for toolbar selection', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.findBoxPointNodeForTrace).toBe('function');
    document.body.innerHTML = '<div id="boxPlot"><svg><g data-export-layer="box-points" data-trace="7"><path data-point-proxy="1" data-trace="7"></path></g></svg></div>';
    bindBoxWorkspaceRoot(document.body);
    const node = hooks.findBoxPointNodeForTrace('7', null);
    expect(node).toBeTruthy();
    expect(node.getAttribute('data-point-proxy')).toBe('1');
    document.body.innerHTML = '';
  });

  test('canvas-backed point lookup ignores hidden export geometry and keeps proxy size metadata', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.findBoxPointNodeForTrace).toBe('function');
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
    bindBoxWorkspaceRoot(document.body);
    const node = hooks.findBoxPointNodeForTrace('3', exportPath);
    expect(node).toBe(proxy);
    expect(hooks.resolveBoxToolbarPointSizeValue({ size: 5 }, node)).toBeCloseTo(0.7, 5);
    document.body.innerHTML = '';
  });

  test('interaction mask path is generated from binned density geometry', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxPointInteractionMaskPath).toBe('function');
    const d = hooks.buildBoxPointInteractionMaskPath({
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

  test('box preview svg rebuilds canvas-backed point groups from cached render state', () => {
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
    expect(previewSvg).toBeTruthy();
    expect(previewSvg.querySelector('foreignObject')).toBeNull();
    expect(previewSvg.querySelector('path')).toBeTruthy();
  });

  test('box preview svg rebuilds canvas-backed point groups from the active plot svg', () => {
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
    bindBoxWorkspaceRoot(document.body);
    const previewSvg = window.Components.box.getPreviewSvg();
    expect(previewSvg).toBeTruthy();
    expect(previewSvg.querySelector('foreignObject')).toBeNull();
    expect(previewSvg.getAttribute('width')).toBe('480');
    expect(previewSvg.getAttribute('height')).toBe('360');
    expect(previewSvg.querySelectorAll('g[data-export-layer="box-points"] path').length).toBeGreaterThan(0);
    document.body.innerHTML = '';
  });

  test('unlocked box resize uses the resizer viewport instead of inflated plot height', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.syncBoxPlotResizeZone).toBe('function');
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
    bindBoxWorkspaceRoot(document.getElementById('boxPage'));
    svgBox.getBoundingClientRect = () => ({ width: 303, height: 428, top: 0, left: 0, right: 303, bottom: 428 });
    viewport.getBoundingClientRect = () => ({ width: 303, height: 428, top: 0, left: 0, right: 303, bottom: 428 });
    Object.defineProperty(plot, 'clientWidth', { configurable: true, get: () => 303 });
    Object.defineProperty(plot, 'clientHeight', { configurable: true, get: () => 558 });

    const zone = hooks.syncBoxPlotResizeZone({ reason: 'resize', resizePhase: 'move' });

    expect(zone.height).toBe(428);
    expect(zone.rawHeight).toBe(558);
    expect(zone.constrained).toBe(true);
    expect(plot.style.height).toBe('428px');
    expect(plot.style.maxHeight).toBe('428px');
    expect(plot.style.overflow).toBe('hidden');
    document.body.innerHTML = '';
  });

  test('unlocked vertical box resize can grow after a previous shrink', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.syncBoxPlotResizeZone).toBe('function');
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
    bindBoxWorkspaceRoot(document.getElementById('boxPage'));
    plot.style.height = '263px';
    plot.style.maxHeight = '263px';
    Object.defineProperty(plot, 'clientWidth', { configurable: true, get: () => 472 });
    Object.defineProperty(plot, 'clientHeight', { configurable: true, get: () => 263 });
    viewport.getBoundingClientRect = () => ({ width: 472, height: 383, top: 0, left: 0, right: 472, bottom: 383 });

    const zone = hooks.syncBoxPlotResizeZone({ reason: 'resize', resizePhase: 'move' });

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
    bindBoxWorkspaceRoot(document.body);

    const previewSvg = window.Components.box.getPreviewSvg();
    const rebuiltPath = previewSvg.querySelector('g[data-export-layer="box-points"] path:not([data-point-proxy="1"])');
    expect(rebuiltPath).toBeTruthy();
    expect(rebuiltPath.getAttribute('fill')).toBe('#ff0000');
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
    const rebuiltPath = previewSvg.querySelector('g[data-export-layer="box-points"] path:not([data-point-proxy="1"])');
    expect(rebuiltPath).toBeTruthy();
    expect(rebuiltPath.getAttribute('fill')).toBe('#ff0000');
    expect(rebuiltPath.getAttribute('stroke')).toBe('#00ff00');
    expect(rebuiltPath.getAttribute('fill-opacity')).toBe('0.9');
    expect(rebuiltPath.getAttribute('stroke-opacity')).toBe('0.8');
    expect(rebuiltPath.getAttribute('stroke-width')).toBe('3');
    expect(rebuiltPath.getAttribute('data-shape')).toBe('square');
  });

  test('box preview svg rebuilds large canvas-density traces from group style metadata', () => {
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
    const rebuiltPaths = Array.from(previewSvg.querySelectorAll('g[data-export-layer="box-points"] path:not([data-point-proxy="1"])'));
    expect(rebuiltPaths.length).toBeGreaterThan(0);
    expect(rebuiltPaths.some(node => node.getAttribute('fill') === '#ff0000')).toBe(true);
    expect(rebuiltPaths.some(node => node.getAttribute('fill') === '#111111')).toBe(false);
    const rebuiltPathData = rebuiltPaths.map(node => node.getAttribute('d') || '').join(' ');
    expect((rebuiltPathData.match(/ a /g) || []).length).toBe(coords.length * 2);
  });

  test('box preview svg ignores stale hidden export geometry styles for large canvas-density traces', () => {
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
    const rebuiltPaths = Array.from(previewSvg.querySelectorAll('g[data-export-layer="box-points"] path:not([data-point-proxy="1"])'));
    expect(rebuiltPaths.length).toBeGreaterThan(0);
    expect(rebuiltPaths.some(node => node.getAttribute('fill') === '#ff0000')).toBe(true);
    expect(rebuiltPaths.some(node => node.getAttribute('d') === 'M 10 10 L 20 20')).toBe(false);
  });

  test('box preview svg omits large-trace outline geometry when symbol border width is zero', () => {
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
    const rebuiltPaths = Array.from(previewSvg.querySelectorAll('g[data-export-layer="box-points"] path:not([data-point-proxy="1"])'));
    expect(rebuiltPaths.length).toBe(1);
    expect(rebuiltPaths[0].getAttribute('fill')).toBe('#ff0000');
    expect(rebuiltPaths[0].getAttribute('stroke')).toBeNull();
  });

  test('box preview svg ignores child geometry styles for canvas-density and uses group attrs when border is zero', () => {
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
    const rebuiltPaths = Array.from(previewSvg.querySelectorAll('g[data-export-layer="box-points"] path:not([data-point-proxy="1"])'));
    expect(rebuiltPaths.length).toBe(1);
    expect(rebuiltPaths[0].getAttribute('fill')).toBe('#ff0000');
    expect(rebuiltPaths[0].getAttribute('stroke')).toBeNull();
  });

  test('fast strip auto-size estimator activates for dense datasets', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveFastStripAutoSizeProfile).toBe('function');
    const light = hooks.resolveFastStripAutoSizeProfile({
      pointCounts: [200, 300],
      baseRadius: 5,
      radiusStep: 0.1,
      threshold: 1200
    });
    expect(light).toBe(null);
    const dense = hooks.resolveFastStripAutoSizeProfile({
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

  test('previous box frame is retained for view-only redraws', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.shouldRetainPreviousBoxFrame).toBe('function');
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: true, reason: 'resize' })).toBe(true);
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: true, reason: 'resize-settled' })).toBe(false);
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: true, reason: 'resize-observe' })).toBe(false);
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: true, reason: 'significance-viewport-extension' })).toBe(true);
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: false, reason: 'resize' })).toBe(false);
  });

});
