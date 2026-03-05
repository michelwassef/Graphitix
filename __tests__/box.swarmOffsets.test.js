describe('Box swarm offset constraints', () => {
  let hooks;

  function hasOverlap(result, coordsInput){
    const offsets = Array.isArray(result?.offsets) ? result.offsets : [];
    const coords = (Array.isArray(coordsInput) || ArrayBuffer.isView(coordsInput)) ? coordsInput : [];
    const radius = Number(result?.adjustedRadius);
    if(!offsets.length || !Number.isFinite(radius) || radius <= 0){
      return false;
    }
    const minDistance = radius * 2 - 1e-6;
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

  test('hard max half-width keeps strict swarm capped without overlaps', () => {
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
    expect(hasOverlap(result, coords)).toBe(false);
  });

  test('strict spacing behaves consistently around sample-size boundary', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeSwarmOffsets).toBe('function');
    const cap = 10;
    [19, 20].forEach(pointCount => {
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
      expect(hasOverlap(result, coords)).toBe(false);
    });
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

});
