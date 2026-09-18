(function initVennGeometryModel(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.vennGeometryModel = Shared.vennGeometryModel || {};
  const OVERFLOW_AREA_EPSILON = 1e-7;

  function debugLog(label, payload){
    if(typeof Shared.debug === 'function'){
      Shared.debug(`Debug: venn ${label}`, payload || {});
      return;
    }
    if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      console.debug(`Debug: venn ${label}`, payload || {});
    }
  }

  function circleIntersectionArea(r1, r2, d) {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
    const a = 2 * Math.acos((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d));
    const b = 2 * Math.acos((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d));
    return 0.5 * r1 * r1 * (a - Math.sin(a)) + 0.5 * r2 * r2 * (b - Math.sin(b));
  }

  function distanceForOverlap(r1, r2, target) {
    const maxA = Math.PI * Math.min(r1, r2) ** 2;
    const t = Math.max(0, Math.min(target, maxA));
    let lo = Math.max(0, Math.abs(r1 - r2));
    let hi = r1 + r2;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      const area = circleIntersectionArea(r1, r2, m);
      if (area > t) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  function trilaterate(dAB, dAC, dBC) {
    const x = (dAB * dAB + dAC * dAC - dBC * dBC) / (2 * (dAB || 1e-6));
    const y2 = dAC * dAC - x * x;
    return { Ax: 0, Ay: 0, Bx: dAB, By: 0, Cx: x, Cy: Math.sqrt(Math.max(0, y2)) };
  }

  function layoutFromCounts(nA, nB, nC, nAB, nAC, nBC) {
    const rA = Math.sqrt(Math.max(nA, 0) / Math.PI);
    const rB = Math.sqrt(Math.max(nB, 0) / Math.PI);
    const rC = Math.sqrt(Math.max(nC, 0) / Math.PI);
    const dAB = distanceForOverlap(rA, rB, Math.max(nAB, 0));
    const dAC = distanceForOverlap(rA, rC, Math.max(nAC, 0));
    const dBC = distanceForOverlap(rB, rC, Math.max(nBC, 0));
    const result = { ...trilaterate(dAB, dAC, dBC), rA, rB, rC, dAB, dAC, dBC };
    debugLog('layoutFromCounts', { nA, nB, nC, nAB, nAC, nBC, radii: { rA, rB, rC }, distances: { dAB, dAC, dBC } });
    return result;
  }

  function normalizeVennRect(rect) {
    if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y)
      || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
      return null;
    }
    return {
      x: rect.x,
      y: rect.y,
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height)
    };
  }

  function expandVennRect(rect, padding = 0) {
    const normalized = normalizeVennRect(rect);
    if (!normalized) return null;
    const pad = Math.max(0, Number(padding) || 0);
    return {
      x: normalized.x - pad,
      y: normalized.y - pad,
      width: normalized.width + pad * 2,
      height: normalized.height + pad * 2
    };
  }

  function vennRectOverlapArea(a, b) {
    const left = normalizeVennRect(a);
    const right = normalizeVennRect(b);
    if (!left || !right) return 0;
    const width = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
    const height = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
    return width > 0 && height > 0 ? width * height : 0;
  }

  function vennRectsOverlap(a, b, gap = 0) {
    const left = expandVennRect(a, Math.max(0, Number(gap) || 0) / 2);
    const right = expandVennRect(b, Math.max(0, Number(gap) || 0) / 2);
    return vennRectOverlapArea(left, right) > 0;
  }

  function vennRectOverflowArea(rect, bounds) {
    const normalized = normalizeVennRect(rect);
    const normalizedBounds = normalizeVennRect(bounds);
    if (!normalized || !normalizedBounds) return 0;
    const area = normalized.width * normalized.height;
    const containedArea = vennRectOverlapArea(normalized, normalizedBounds);
    const overflowArea = Math.max(0, area - containedArea);
    return overflowArea > OVERFLOW_AREA_EPSILON ? overflowArea : 0;
  }

  Object.assign(namespace, {
    circleIntersectionArea,
    distanceForOverlap,
    trilaterate,
    layoutFromCounts,
    normalizeVennRect,
    expandVennRect,
    vennRectOverlapArea,
    vennRectsOverlap,
    vennRectOverflowArea
  });

  if(typeof module !== 'undefined' && module.exports){
    module.exports = namespace;
  }
})(typeof window !== 'undefined' ? window : globalThis);
