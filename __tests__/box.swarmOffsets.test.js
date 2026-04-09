describe('Box swarm offset constraints', () => {
  let hooks;

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

  test('dense point canvas preview is restricted to resize preview reasons', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.shouldUseBoxPointCanvasPreview).toBe('function');
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'resize-live' }, { pointCount: 100 })).toBe(true);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'resize-observe' }, { pointCount: 100 })).toBe(true);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: false, reason: 'resize-settled' }, { pointCount: 1800, threshold: 1200 })).toBe(true);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'significance-viewport-extension' }, { pointCount: 1800, threshold: 1200 })).toBe(true);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: true, reason: 'font-style-change' }, { pointCount: 100, threshold: 1200 })).toBe(false);
    expect(hooks.shouldUseBoxPointCanvasPreview({ viewOnly: false, reason: 'resize-live' }, { pointCount: 100, threshold: 1200 })).toBe(false);
    expect(hooks.shouldUseBoxPointCanvasPreview({ pointRenderer: 'canvas' })).toBe(true);
    expect(hooks.shouldUseBoxPointCanvasPreview({ pointRenderer: 'svg', viewOnly: false, reason: 'resize-settled' }, { pointCount: 1800, threshold: 1200 })).toBe(false);
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

  test('huge-trace approximation gate only enables for very large non-indexed traces', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.shouldUseBoxApproximatePointCanvas).toBe('function');
    expect(hooks.shouldUseBoxApproximatePointCanvas({ pointCount: 8000, threshold: 8000 })).toBe(false);
    expect(hooks.shouldUseBoxApproximatePointCanvas({ pointCount: 9001, threshold: 8000 })).toBe(true);
    expect(hooks.shouldUseBoxApproximatePointCanvas({
      pointCount: 12000,
      threshold: 8000,
      collectsPointByRow: true
    })).toBe(false);
  });

  test('huge-trace approximation bins compress dense point clouds deterministically', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxApproximatePointBins).toBe('function');
    const pointCount = 12000;
    const coords = new Float64Array(pointCount);
    const raws = new Float64Array(pointCount);
    for(let idx = 0; idx < pointCount; idx += 1){
      const band = idx % 240;
      coords[idx] = 100 + band * 0.28;
      raws[idx] = 50 + band * 0.5;
    }
    const layout = hooks.buildBoxApproximatePointBins({
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
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: true, reason: 'resize-settled' })).toBe(true);
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: true, reason: 'resize-observe' })).toBe(true);
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: true, reason: 'significance-viewport-extension' })).toBe(true);
    expect(hooks.shouldRetainPreviousBoxFrame({ viewOnly: false, reason: 'resize-settled' })).toBe(false);
  });

});
