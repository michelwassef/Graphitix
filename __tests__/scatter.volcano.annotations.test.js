const fs = require('fs');
const path = require('path');

function loadVolcanoPoints(options = {}){
  const filePath = path.join(__dirname, 'test-volcano.csv');
  const contents = fs.readFileSync(filePath, 'utf8');
  const lines = contents.trim().split(/\r?\n/);
  const header = lines.shift();
  if(!header || !header.startsWith('gene,')){
    throw new Error('Unexpected volcano CSV header');
  }
  const log2Threshold = Number.isFinite(options.log2Threshold) ? options.log2Threshold : 1;
  const negLogPThreshold = Number.isFinite(options.negLogPThreshold) ? options.negLogPThreshold : 1.3;
  const points = [];
  lines.forEach(line => {
    if(!line){
      return;
    }
    const [gene, logFcRaw, pRaw] = line.split(',');
    const logFc = parseFloat(logFcRaw);
    const pValue = parseFloat(pRaw);
    if(!Number.isFinite(logFc) || !Number.isFinite(pValue)){
      return;
    }
    const negLogP = pValue > 0 ? -Math.log10(pValue) : Number.POSITIVE_INFINITY;
    const isSignificant = Math.abs(logFc) >= log2Threshold && negLogP >= negLogPThreshold;
    points.push({
      x: logFc,
      y: negLogP,
      label: isSignificant ? gene : '',
      isSignificant
    });
  });
  return points;
}

function computeAxisMidpoint(points){
  let minX = Infinity;
  let maxX = -Infinity;
  points.forEach(point => {
    if(!Number.isFinite(point.x)){
      return;
    }
    if(point.x < minX){ minX = point.x; }
    if(point.x > maxX){ maxX = point.x; }
  });
  if(!Number.isFinite(minX) || !Number.isFinite(maxX)){
    return 0;
  }
  return (minX + maxX) / 2;
}

const TEST_LABEL_LINE_HEIGHT = 1.35;
const TEST_LABEL_PADDING = 2;

function buildLabelRect(entry, fontSize){
  const lineHeight = fontSize * TEST_LABEL_LINE_HEIGHT;
  const half = lineHeight / 2;
  const padding = TEST_LABEL_PADDING;
  let x1;
  let x2;
  if(entry.textAnchor === 'end'){
    x2 = entry.textX + padding;
    x1 = entry.textX - entry.textWidth - padding;
  }else{
    x1 = entry.textX - padding;
    x2 = entry.textX + entry.textWidth + padding;
  }
  return {
    x1,
    x2,
    y1: entry.anchorY - half - padding,
    y2: entry.anchorY + half + padding
  };
}

function rectanglesOverlap(a, b){
  if(!a || !b){ return false; }
  return !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
}

function pointInRect(point, rect){
  if(!rect || !point){ return false; }
  return point.x >= rect.x1 && point.x <= rect.x2 && point.y >= rect.y1 && point.y <= rect.y2;
}

function buildSegment(entry){
  return {
    x1: entry.pointX,
    y1: entry.pointY,
    x2: entry.attachX,
    y2: entry.anchorY
  };
}

function segmentLength(segment){
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  return Math.hypot(dx, dy);
}

function orientation(p, q, r){
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if(Math.abs(val) < 1e-6){ return 0; }
  return val > 0 ? 1 : 2;
}

function onSegment(p, q, r){
  return q.x <= Math.max(p.x, r.x) + 1e-6 && q.x + 1e-6 >= Math.min(p.x, r.x)
    && q.y <= Math.max(p.y, r.y) + 1e-6 && q.y + 1e-6 >= Math.min(p.y, r.y);
}

function segmentsIntersect(a, b){
  if(!a || !b){ return false; }
  const p1 = { x: a.x1, y: a.y1 };
  const q1 = { x: a.x2, y: a.y2 };
  const p2 = { x: b.x1, y: b.y1 };
  const q2 = { x: b.x2, y: b.y2 };
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  if(o1 !== o2 && o3 !== o4){ return true; }
  if(o1 === 0 && onSegment(p1, p2, q1)){ return true; }
  if(o2 === 0 && onSegment(p1, q2, q1)){ return true; }
  if(o3 === 0 && onSegment(p2, p1, q2)){ return true; }
  if(o4 === 0 && onSegment(p2, q1, q2)){ return true; }
  return false;
}

function segmentIntersectsRect(segment, rect){
  if(!segment || !rect){ return false; }
  const rectEdges = [
    { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y1 },
    { x1: rect.x2, y1: rect.y1, x2: rect.x2, y2: rect.y2 },
    { x1: rect.x2, y1: rect.y2, x2: rect.x1, y2: rect.y2 },
    { x1: rect.x1, y1: rect.y2, x2: rect.x1, y2: rect.y1 }
  ];
  if(pointInRect({ x: segment.x1, y: segment.y1 }, rect)){ return true; }
  if(pointInRect({ x: segment.x2, y: segment.y2 }, rect)){ return true; }
  return rectEdges.some(edge => segmentsIntersect(segment, edge));
}

function detectLayoutConflict(layout, fontSize){
  const rects = layout.map(entry => buildLabelRect(entry, fontSize));
  const segments = layout.map(buildSegment);
  for(let i = 0; i < layout.length; i += 1){
    for(let j = i + 1; j < layout.length; j += 1){
      if(rectanglesOverlap(rects[i], rects[j])){
        return { type: 'label', pair: [i, j] };
      }
      if(segmentIntersectsRect(segments[i], rects[j]) || segmentIntersectsRect(segments[j], rects[i])){
        return { type: 'leader-label', pair: [i, j] };
      }
      if(segmentsIntersect(segments[i], segments[j])){
        return { type: 'leader', pair: [i, j] };
      }
    }
  }
  return null;
}

describe('Scatter volcano annotations', () => {
  let scatter;
  let hooks;
  let buildAnnotationRequests;
  let layoutAnnotations;
  let defaultAnnotationCap;
  let volcanoPoints;
  let axisMid;

  beforeAll(() => {
    require('../js/components/scatter.js');
    scatter = window.Components?.scatter;
    hooks = scatter?.__testHooks || {};
    buildAnnotationRequests = hooks.buildAnnotationRequests;
    layoutAnnotations = hooks.layoutAnnotations;
    defaultAnnotationCap = hooks.constants?.MAX_SIGNIFICANT_ANNOTATIONS;
    volcanoPoints = loadVolcanoPoints();
    axisMid = computeAxisMidpoint(volcanoPoints);
  });

  test('volcano dataset has more significant genes than the default cap', () => {
    expect(Array.isArray(volcanoPoints)).toBe(true);
    const significantCount = volcanoPoints.filter(point => point.isSignificant).length;
    expect(significantCount).toBeGreaterThan(0);
    expect(defaultAnnotationCap).toBeGreaterThan(0);
    expect(significantCount).toBeGreaterThan(defaultAnnotationCap);
  });

  test('annotation builder still caps output when no override is provided', () => {
    const { requests } = buildAnnotationRequests(volcanoPoints, {
      enabled: true,
      axisMid,
      fontSize: 10
    });
    const significantCount = volcanoPoints.filter(point => point.isSignificant).length;
    const expected = Math.min(significantCount, defaultAnnotationCap);
    expect(requests.length).toBe(expected);
  });

  test('volcano override includes every significant gene label', () => {
    const { requests } = buildAnnotationRequests(volcanoPoints, {
      enabled: true,
      axisMid,
      fontSize: 10,
      maxAnnotations: volcanoPoints.length
    });
    const significantCount = volcanoPoints.filter(point => point.isSignificant).length;
    expect(requests.length).toBe(significantCount);
    const labels = requests.map(entry => entry.label);
    expect(labels).toContain('MROH1');
    expect(labels).toContain('SLIT3');
  });

  test('annotation layout avoids overlaps and crossing leaders', () => {
    expect(typeof layoutAnnotations).toBe('function');
    const fontSize = 12;
    const maxLeaderLength = 110;
    const requests = [
      { pointIndex: 0, label: 'GENE_A', side: 'right', textWidth: 90 },
      { pointIndex: 1, label: 'GENE_B', side: 'right', textWidth: 100 },
      { pointIndex: 2, label: 'GENE_C', side: 'left', textWidth: 80 }
    ];
    const pointGeometry = [
      { cx: 360, cy: 200 },
      { cx: 340, cy: 225 },
      { cx: 210, cy: 210 }
    ];
    const layout = layoutAnnotations({
      requests,
      pointGeometry,
      margin: { top: 30, left: 40 },
      plotW: 520,
      plotH: 360,
      fontSize,
      leaderPadding: 14,
      leaderGap: 14,
      textPadding: 4,
      axisPadding: 24,
      verticalPadding: 10,
      maxLeaderLength
    });
    expect(layout.length).toBe(requests.length);
    const right = layout.filter(entry => entry.side === 'right');
    const left = layout.filter(entry => entry.side === 'left');
    expect(right.length).toBe(2);
    expect(left.length).toBe(1);
    const rightRects = right.map(entry => buildLabelRect(entry, fontSize));
    expect(rectanglesOverlap(rightRects[0], rightRects[1])).toBe(false);
    const rightSegments = right.map(buildSegment);
    expect(segmentsIntersect(rightSegments[0], rightSegments[1])).toBe(false);
    const leftRect = buildLabelRect(left[0], fontSize);
    rightSegments.forEach(segment => {
      expect(segmentIntersectsRect(segment, leftRect)).toBe(false);
    });
    const leftSegment = buildSegment(left[0]);
    rightRects.forEach(rect => {
      expect(segmentIntersectsRect(leftSegment, rect)).toBe(false);
    });
    rightSegments.concat(leftSegment).forEach(segment => {
      expect(segmentLength(segment)).toBeLessThanOrEqual(maxLeaderLength + 1);
    });
  });

  test('annotation layout enforces explicit leader length caps', () => {
    expect(typeof layoutAnnotations).toBe('function');
    const fontSize = 11;
    const baseRequests = () => ([
      { pointIndex: 0, label: 'WIDE_LABEL', side: 'right', textWidth: 160 }
    ]);
    const pointGeometry = [
      { cx: 260, cy: 180 }
    ];
    const shared = {
      pointGeometry,
      margin: { top: 20, left: 35 },
      plotW: 640,
      plotH: 360,
      fontSize,
      leaderPadding: 80,
      leaderGap: 20,
      textPadding: 4,
      axisPadding: 28,
      verticalPadding: 12
    };
    const unlimited = layoutAnnotations({
      requests: baseRequests(),
      ...shared,
      maxLeaderLength: 400
    })[0];
    const limitedMax = 70;
    const limited = layoutAnnotations({
      requests: baseRequests(),
      ...shared,
      maxLeaderLength: limitedMax
    })[0];
    const unlimitedLength = segmentLength(buildSegment(unlimited));
    const limitedLength = segmentLength(buildSegment(limited));
    expect(unlimitedLength - limitedLength).toBeGreaterThan(0.5);
    expect(limitedLength).toBeLessThanOrEqual(limitedMax + 0.5);
  });

  test('dense right-side annotations remain disjoint', () => {
    expect(typeof layoutAnnotations).toBe('function');
    const fontSize = 11;
    const count = 14;
    const requests = Array.from({ length: count }).map((_, idx) => ({
      pointIndex: idx,
      label: `GENE_${idx + 1}`,
      side: 'right',
      textWidth: 70 + (idx % 5) * 12
    }));
    const pointGeometry = requests.map((_, idx) => ({
      cx: 300 + (idx % 3) * 6,
      cy: 120 + idx * 9
    }));
    const maxLeaderLength = 85;
    const layout = layoutAnnotations({
      requests,
      pointGeometry,
      margin: { top: 30, left: 40 },
      plotW: 540,
      plotH: 360,
      fontSize,
      leaderPadding: 14,
      leaderGap: 14,
      textPadding: 4,
      axisPadding: 26,
      verticalPadding: 10,
      maxLeaderLength
    });
    expect(layout.length).toBe(count);
    const conflict = detectLayoutConflict(layout, fontSize);
    if(conflict){
      const segA = buildSegment(layout[conflict.pair[0]]);
      const segB = buildSegment(layout[conflict.pair[1]]);
      throw new Error(JSON.stringify({ conflict, layout, segA, segB }));
    }
    layout.forEach(entry => {
      const len = segmentLength(buildSegment(entry));
      expect(len).toBeLessThanOrEqual(maxLeaderLength + 0.5);
    });
  });
});
