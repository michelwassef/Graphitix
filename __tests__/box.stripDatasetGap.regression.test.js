const fs = require('fs');
const path = require('path');

describe('Box strip inter-dataset spacing regression', () => {
  let hooks;

  function parseCsvColumns(filePath, maxRows = Infinity){
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if(!lines.length){
      return [];
    }
    const headers = lines[0].split(',');
    const cols = headers.map(() => []);
    const limit = Math.max(0, Math.floor(Number(maxRows)));
    const maxLineIndex = Number.isFinite(limit) ? Math.min(lines.length - 1, limit) : (lines.length - 1);
    for(let i = 1; i <= maxLineIndex; i += 1){
      const parts = lines[i].split(',');
      for(let c = 0; c < cols.length; c += 1){
        const value = Number(parts[c]);
        if(Number.isFinite(value)){
          cols[c].push(value);
        }
      }
    }
    return cols;
  }

  function linearPixelMapper(values){
    let min = Infinity;
    let max = -Infinity;
    for(let i = 0; i < values.length; i += 1){
      const value = Number(values[i]);
      if(!Number.isFinite(value)){
        continue;
      }
      if(value < min){ min = value; }
      if(value > max){ max = value; }
    }
    if(!Number.isFinite(min) || !Number.isFinite(max) || max <= min){
      return () => 0;
    }
    const spanPx = 251.33333333333334;
    return value => spanPx * (1 - (value - min) / (max - min));
  }

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('side-by-side strip traces keep 20% gap by shrinking radius and cloud width', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeSwarmOffsets).toBe('function');
    expect(typeof hooks.computeStripHalfExtentLimit).toBe('function');
    expect(typeof hooks.computeStripSpreadScale).toBe('function');

    const source = parseCsvColumns(path.resolve(__dirname, 'test-box.csv'), 45);
    expect(source.length).toBeGreaterThanOrEqual(3);
    const baseTraces = source.slice(0, 3);
    const traces = [];
    for(let rep = 0; rep < 3; rep += 1){
      for(let i = 0; i < baseTraces.length; i += 1){
        traces.push(baseTraces[i].slice());
      }
    }
    expect(traces.length).toBe(9);

    const allValues = [];
    for(let i = 0; i < traces.length; i += 1){
      const values = traces[i];
      for(let j = 0; j < values.length; j += 1){
        allValues.push(values[j]);
      }
    }
    const toPx = linearPixelMapper(allValues);

    const pointRadius = 5;
    const baseHalfWidth = Math.max(6, pointRadius * 2.6);
    const plotW = 315.11423746744794;
    const axisCount = traces.length;
    const rawBand = plotW / axisCount;
    const datasetGapPx = Math.max(2, Math.min(40, rawBand * 0.06));
    const band = (plotW - datasetGapPx * Math.max(0, axisCount - 1)) / axisCount;
    const minCenterPitch = band + datasetGapPx;

    const halfExtentLimit = hooks.computeStripHalfExtentLimit({
      minCenterPitch,
      gapFactor: 0.20,
      minGapPx: 4
    });
    expect(Number.isFinite(halfExtentLimit)).toBe(true);
    expect(halfExtentLimit).toBeGreaterThan(0);

    const baselineHalfExtent = pointRadius + baseHalfWidth;
    const pitchScale = baselineHalfExtent > halfExtentLimit
      ? Math.max(0.1, halfExtentLimit / baselineHalfExtent)
      : 1;
    const constrainedRadius = pointRadius * pitchScale;
    const constrainedHalfWidth = baseHalfWidth * pitchScale;

    let widestHalfExtent = 0;
    for(let i = 0; i < traces.length; i += 1){
      const values = traces[i];
      const coords = new Float64Array(values.length);
      const raws = new Float64Array(values.length);
      for(let j = 0; j < values.length; j += 1){
        raws[j] = values[j];
        coords[j] = toPx(values[j]);
      }
      const swarm = hooks.computeSwarmOffsets(
        { coords, raws },
        {
          axisSpacing: Math.max(1, constrainedHalfWidth / 0.36),
          pointRadius: constrainedRadius,
          sampleSize: values.length,
          orientation: 'vertical',
          widthScaleMode: 'density',
          maxHalfWidth: constrainedHalfWidth,
          hardMaxHalfWidth: constrainedHalfWidth,
          allowRadiusAdjustment: false,
          skipBucketCentering: false,
          enforceNonOverlap: true
        }
      );
      const spreadScale = hooks.computeStripSpreadScale({
        minCenterPitch,
        effectiveRadius: constrainedRadius,
        maxOffsetUsed: Number(swarm?.maxOffsetUsed),
        gapFactor: 0.20,
        minGapPx: 4
      });
      const halfExtent = constrainedRadius + (Number(swarm?.maxOffsetUsed) || 0) * spreadScale;
      if(halfExtent > widestHalfExtent){
        widestHalfExtent = halfExtent;
      }
    }

    expect(widestHalfExtent).toBeLessThanOrEqual(Number(halfExtentLimit) + 1e-6);
    const achievedGap = minCenterPitch - 2 * widestHalfExtent;
    const requiredGapByFactor = 0.2 * (2 * widestHalfExtent);
    const requiredGap = Math.max(requiredGapByFactor, 4);
    expect(achievedGap).toBeGreaterThanOrEqual(requiredGap - 1e-6);
  });
});
