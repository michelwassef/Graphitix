const fs = require('fs');
const path = require('path');

describe('Box strip auto-size radius regression', () => {
  let hooks;

  function parseCsvColumns(filePath){
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if(!lines.length){
      return [];
    }
    const header = lines[0].split(',');
    const cols = header.map(() => []);
    for(let i = 1; i < lines.length; i += 1){
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

  function estimateSwarmOverlapCount(coordsInput, distance){
    const coords = (Array.isArray(coordsInput) || ArrayBuffer.isView(coordsInput)) ? coordsInput : null;
    if(!coords || !coords.length || !Number.isFinite(distance) || distance <= 0){
      return 0;
    }
    const sorted = new Array(coords.length);
    for(let i = 0; i < coords.length; i += 1){
      const value = Number(coords[i]);
      sorted[i] = Number.isFinite(value) ? value : 0;
    }
    sorted.sort((a, b) => a - b);
    let maxCount = 0;
    let start = 0;
    for(let i = 0; i < sorted.length; i += 1){
      const coord = sorted[i];
      while(start < i && coord - sorted[start] > distance){
        start += 1;
      }
      const count = i - start + 1;
      if(count > maxCount){
        maxCount = count;
      }
    }
    return maxCount;
  }

  function linearPixelMapper(values){
    let min = Infinity;
    let max = -Infinity;
    for(let i = 0; i < values.length; i += 1){
      const v = Number(values[i]);
      if(!Number.isFinite(v)){
        continue;
      }
      if(v < min){ min = v; }
      if(v > max){ max = v; }
    }
    if(!Number.isFinite(min) || !Number.isFinite(max) || max <= min){
      return () => 0;
    }
    const spanPx = 251.33333333333334;
    return value => spanPx * (1 - (value - min) / (max - min));
  }

  function computeAutoRadius(columns){
    const pointRadius = 5;
    const referenceHalfWidth = Math.max(6, pointRadius * 2.6);
    const referenceBand = Math.max(1, referenceHalfWidth / 0.36);
    const baseOverlapDistance = Math.max(0.5, pointRadius * 2.1);
    const allValues = [];
    columns.forEach(col => {
      for(let i = 0; i < col.length; i += 1){
        allValues.push(col[i]);
      }
    });
    const toPx = linearPixelMapper(allValues);
    let selectedIndex = null;
    let selectedCount = 0;
    let selectedOverlapCount = 0;
    let selectedValues = null;
    let selectedCoords = null;
    for(let i = 0; i < columns.length; i += 1){
      const values = columns[i];
      if(!Array.isArray(values) || values.length <= 1){
        continue;
      }
      const coords = new Float64Array(values.length);
      for(let j = 0; j < values.length; j += 1){
        coords[j] = toPx(values[j]);
      }
      const overlapCount = estimateSwarmOverlapCount(coords, baseOverlapDistance);
      const better = selectedIndex == null
        || overlapCount > selectedOverlapCount
        || (overlapCount === selectedOverlapCount && values.length > selectedCount);
      if(!better){
        continue;
      }
      selectedIndex = i;
      selectedCount = values.length;
      selectedOverlapCount = overlapCount;
      selectedValues = values;
      selectedCoords = coords;
    }
    expect(selectedValues).toBeTruthy();
    const swarm = hooks.computeSwarmOffsets(
      { coords: selectedCoords, raws: selectedValues },
      {
        axisSpacing: referenceBand,
        pointRadius,
        sampleSize: selectedCount,
        orientation: 'vertical',
        widthScaleMode: 'density',
        maxHalfWidth: referenceHalfWidth,
        hardMaxHalfWidth: referenceHalfWidth,
        allowRadiusAdjustment: true,
        enforceNonOverlap: true,
        radiusCountExponent: 0.85
      }
    );
    const adjusted = Number(swarm?.adjustedRadius);
    const sampleCompression = Math.max(0, Math.min(1, Math.log10(selectedCount + 1) / 3));
    const minResolvedRadius = Math.max(0.2, pointRadius * (0.12 + (0.26 - 0.12) * (1 - sampleCompression)));
    const computeStripRadiusCapForLargeSamples = (sampleSize, baseRadius) => {
      const count = Number(sampleSize) || 0;
      const radius = Number(baseRadius);
      if(!Number.isFinite(radius) || radius <= 0){
        return null;
      }
      if(!Number.isFinite(count) || count <= 300){
        return null;
      }
      const startLog = Math.log10(300);
      const endLog = Math.log10(10000);
      const countLog = Math.log10(Math.max(301, count));
      const normRaw = (countLog - startLog) / (endLog - startLog);
      const norm = Math.max(0, Math.min(1, normRaw));
      const capScaleMax = 0.35;
      const capScaleMin = 0.14;
      const capScale = capScaleMax - (capScaleMax - capScaleMin) * norm;
      return Math.max(0.2, radius * capScale);
    };
    const countRadiusCap = computeStripRadiusCapForLargeSamples(selectedCount, pointRadius);
    const rawResolvedRadius = Number.isFinite(adjusted) && adjusted > 0
      ? adjusted
      : null;
    const cappedRadius = Number.isFinite(rawResolvedRadius) && Number.isFinite(countRadiusCap)
      ? Math.min(rawResolvedRadius, countRadiusCap)
      : rawResolvedRadius;
    const resolvedRadius = Number.isFinite(cappedRadius) && cappedRadius > 0
      ? Math.max(minResolvedRadius, cappedRadius)
      : null;
    return {
      pointCount: selectedCount,
      overlapCount: selectedOverlapCount,
      adjustedRadius: adjusted,
      countRadiusCap,
      resolvedRadius
    };
  }

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('large dataset does not get larger auto radius than medium dataset', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.computeSwarmOffsets).toBe('function');
    const mediumPath = path.resolve(__dirname, 'test-box-medium.csv');
    const largePath = path.resolve(__dirname, 'test-box-large.csv');
    const mediumColumns = parseCsvColumns(mediumPath);
    const largeColumns = parseCsvColumns(largePath);
    const medium = computeAutoRadius(mediumColumns);
    const large = computeAutoRadius(largeColumns);
    expect(Number.isFinite(medium.resolvedRadius)).toBe(true);
    expect(Number.isFinite(large.resolvedRadius)).toBe(true);
    expect(large.resolvedRadius).toBeLessThanOrEqual(medium.resolvedRadius + 1e-6);
  });
});
