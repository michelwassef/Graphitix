(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const exporter = Shared.exporter = Shared.exporter || {};
  const doc = global.document;
  const openStates = new Set();
  let listenersBound = false;

  const logDebug = (label, payload) => {
    try {
      console.debug(`Debug: exporter ${label}` , payload || {}); // Debug: exporter trace
    } catch (err) {
      // Ignore logging errors to avoid crashing export flows.
    }
  };

  const warn = (label, payload) => {
    try {
      console.warn(`exporter ${label}`, payload || {});
    } catch (err) {
      // Ignore warnings that fail to serialize.
    }
  };

  const parseDimension = value => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.endsWith('%')) {
        return null;
      }
      const num = Number.parseFloat(trimmed);
      return Number.isFinite(num) ? num : null;
    }
    return Number.isFinite(value) ? value : null;
  };

  const DEFAULT_FONT_STACK = 'Arial, Helvetica, sans-serif';
  const NUMERIC_VALUE_RE = /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i;
  const SVG_MIME_TYPE = 'image/svg+xml';
  const EMF_MIME_TYPE = 'image/emf';
  const EMF_MIME_FALLBACK = 'image/x-emf';
  const EMR_HEADER = 0x00000001;
  const EMR_STRETCHDIBITS = 0x00000051;
  const EMR_EOF = 0x0000000E;
  const EMR_SETBKMODE = 0x00000012;
  const EMR_SETPOLYFILLMODE = 0x00000013;
  const EMR_SELECTOBJECT = 0x00000025;
  const EMR_CREATEPEN = 0x00000026;
  const EMR_CREATEBRUSHINDIRECT = 0x00000027;
  const EMR_DELETEOBJECT = 0x00000028;
  const EMR_RECTANGLE = 0x0000002B;
  const EMR_POLYPOLYLINE = 0x00000007;
  const EMR_POLYPOLYGON = 0x00000008;
  const EMR_EXTCREATEFONTINDIRECTW = 0x00000052;
  const EMR_EXTTEXTOUTW = 0x00000054;
  const EMR_SETTEXTCOLOR = 0x00000018;
  const SRCCOPY = 0x00CC0020;
  const DIB_RGB_COLORS = 0x00000000;

  const TRANSPARENT_VALUES = new Set(['transparent', 'rgba(0, 0, 0, 0)', 'rgba(0,0,0,0)']);
  const DEG_TO_RAD = Math.PI / 180;
  const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0];
  const GEOMETRY_EPSILON = 1e-6;
  const NULL_BRUSH_HANDLE = 0x80000005;
  const NULL_PEN_HANDLE = 0x80000009;
  const SETPOLYFILLMODE_ALTERNATE = 1;
  const SETPOLYFILLMODE_WINDING = 2;

  function isDebugEnabled() {
    try {
      return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    } catch (err) {
      return false;
    }
  }

  function debugLog(label, payload) {
    if (!isDebugEnabled()) return;
    try {
      console.debug(`Debug: exporter ${label}`, payload || {});
    } catch (err) {
      // Guard against logging serialization issues.
    }
  }

  function multiplyMatrices(a, b) {
    if (!a) return b || IDENTITY_MATRIX;
    if (!b) return a || IDENTITY_MATRIX;
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5]
    ];
  }

  function applyMatrixToPoint(matrix, x, y) {
    if (!matrix) {
      return { x, y };
    }
    return {
      x: matrix[0] * x + matrix[2] * y + matrix[4],
      y: matrix[1] * x + matrix[3] * y + matrix[5]
    };
  }

  function parseSvgNumber(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    const num = Number.parseFloat(String(value));
    return Number.isFinite(num) ? num : fallback;
  }

  function parseOpacity(value, fallback = 1) {
    const num = parseSvgNumber(value, fallback);
    if (num === null || num === undefined) return fallback;
    if (!Number.isFinite(num)) return fallback;
    if (num <= 0) return 0;
    if (num >= 1) return 1;
    return num;
  }

  function parseDashArray(value) {
    if (!value) return null;
    if (typeof value !== 'string') return null;
    if (value === 'none') return null;
    const parts = value.split(/[\s,]+/g).map(part => parseSvgNumber(part, null)).filter(num => num !== null && Number.isFinite(num));
    return parts.length ? parts : null;
  }

  function isTransparentColor(value) {
    if (!value) return true;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return true;
    if (TRANSPARENT_VALUES.has(normalized)) return true;
    if (normalized === 'none' || normalized === 'initial') return true;
    return false;
  }

  function removeAxisInteractionHandles(svgNode) {
    if (!svgNode || !svgNode.querySelectorAll) {
      return 0;
    }
    const candidates = svgNode.querySelectorAll('[data-axis-control="1"]');
    let removed = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      const node = candidates[i];
      if (!node || typeof node.tagName !== 'string') {
        continue;
      }
      const tag = node.tagName.toLowerCase();
      if (tag !== 'rect') {
        continue;
      }
      const fillAttr = node.getAttribute('fill');
      const styleFill = node.style ? node.style.fill : null;
      const pointerEvents = (node.getAttribute('pointer-events') || '').toLowerCase();
      const stroke = node.getAttribute('stroke') || (node.style ? node.style.stroke : null);
      const opacityRaw = node.getAttribute('opacity');
      const styleOpacity = node.style ? node.style.opacity : null;
      const opacitySource = styleOpacity != null && styleOpacity !== '' ? styleOpacity : opacityRaw;
      const hasOpacity = opacitySource != null && opacitySource !== '';
      const opacityValue = hasOpacity ? Number.parseFloat(opacitySource) : null;
      const transparent = isTransparentColor(styleFill || fillAttr)
        && (!hasOpacity || (Number.isFinite(opacityValue) ? opacityValue <= 0 : true));
      const pointerMatch = pointerEvents === 'fill' || pointerEvents === 'all' || pointerEvents === 'visiblefill' || pointerEvents === 'visiblepainted';
      const isOverlay = pointerMatch && (!stroke || isTransparentColor(stroke)) && transparent;
      if (!isOverlay) {
        continue;
      }
      if (typeof node.remove === 'function') {
        node.remove();
        removed += 1;
      }
    }
    return removed;
  }

  function applyStyleString(target, styleString) {
    if (!styleString || typeof styleString !== 'string') {
      return;
    }
    styleString.split(';').forEach(chunk => {
      const idx = chunk.indexOf(':');
      if (idx <= 0) return;
      const key = chunk.slice(0, idx).trim().toLowerCase();
      const value = chunk.slice(idx + 1).trim();
      if (!key) return;
      target[key] = value;
    });
  }

  function tokenizePathData(d) {
    const tokens = [];
    if (!d || typeof d !== 'string') {
      return tokens;
    }
    const regex = /([a-zA-Z])|([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)/g;
    let match;
    while ((match = regex.exec(d)) !== null) {
      if (match[1]) {
        tokens.push({ type: 'command', value: match[1] });
      } else if (match[2]) {
        tokens.push({ type: 'number', value: Number.parseFloat(match[2]) });
      }
    }
    return tokens;
  }

  function parsePathData(d) {
    const tokens = tokenizePathData(d);
    const commands = [];
    let index = 0;
    let current = null;
    const isCommandToken = token => token?.type === 'command';
    const readNumber = () => {
      if (index >= tokens.length) return null;
      const token = tokens[index];
      if (token.type === 'command') {
        return null;
      }
      index++;
      return token.value;
    };
    while (index < tokens.length) {
      if (isCommandToken(tokens[index])) {
        current = tokens[index++].value;
      }
      if (!current) {
        index++;
        continue;
      }
      const absolute = current === current.toUpperCase();
      const cmd = current.toUpperCase();
      switch (cmd) {
        case 'M': {
          const x = readNumber();
          const y = readNumber();
          if (x === null || y === null) {
            return commands;
          }
          commands.push({ cmd: absolute ? 'M' : 'm', x, y });
          current = absolute ? 'L' : 'l';
          while (index < tokens.length && !isCommandToken(tokens[index])) {
            const lx = readNumber();
            const ly = readNumber();
            if (lx === null || ly === null) break;
            commands.push({ cmd: absolute ? 'L' : 'l', x: lx, y: ly });
          }
          break;
        }
        case 'L':
        case 'T': {
          while (index < tokens.length) {
            const x = readNumber();
            const y = readNumber();
            if (x === null || y === null) break;
            commands.push({ cmd: absolute ? cmd : cmd.toLowerCase(), x, y });
            if (isCommandToken(tokens[index])) break;
          }
          break;
        }
        case 'H':
        case 'V': {
          while (index < tokens.length) {
            const value = readNumber();
            if (value === null) break;
            commands.push({ cmd: absolute ? cmd : cmd.toLowerCase(), value });
            if (isCommandToken(tokens[index])) break;
          }
          break;
        }
        case 'C': {
          while (index < tokens.length) {
            const x1 = readNumber();
            const y1 = readNumber();
            const x2 = readNumber();
            const y2 = readNumber();
            const x = readNumber();
            const y = readNumber();
            if ([x1, y1, x2, y2, x, y].some(v => v === null)) break;
            commands.push({ cmd: absolute ? 'C' : 'c', x1, y1, x2, y2, x, y });
            if (isCommandToken(tokens[index])) break;
          }
          break;
        }
        case 'S': {
          while (index < tokens.length) {
            const x2 = readNumber();
            const y2 = readNumber();
            const x = readNumber();
            const y = readNumber();
            if ([x2, y2, x, y].some(v => v === null)) break;
            commands.push({ cmd: absolute ? 'S' : 's', x2, y2, x, y });
            if (isCommandToken(tokens[index])) break;
          }
          break;
        }
        case 'Q': {
          while (index < tokens.length) {
            const x1 = readNumber();
            const y1 = readNumber();
            const x = readNumber();
            const y = readNumber();
            if ([x1, y1, x, y].some(v => v === null)) break;
            commands.push({ cmd: absolute ? 'Q' : 'q', x1, y1, x, y });
            if (isCommandToken(tokens[index])) break;
          }
          break;
        }
        case 'A': {
          while (index < tokens.length) {
            const rx = readNumber();
            const ry = readNumber();
            const angle = readNumber();
            const largeArc = readNumber();
            const sweep = readNumber();
            const x = readNumber();
            const y = readNumber();
            if ([rx, ry, angle, largeArc, sweep, x, y].some(v => v === null)) break;
            commands.push({ cmd: absolute ? 'A' : 'a', rx, ry, angle, largeArc: largeArc ? 1 : 0, sweep: sweep ? 1 : 0, x, y });
            if (isCommandToken(tokens[index])) break;
          }
          break;
        }
        case 'Z':
          commands.push({ cmd: absolute ? 'Z' : 'z' });
          break;
        default:
          break;
      }
    }
    return commands;
  }

  function distanceBetween(p0, p1) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function approximateCubic(p0, p1, p2, p3) {
    const total = distanceBetween(p0, p1) + distanceBetween(p1, p2) + distanceBetween(p2, p3);
    const segments = Math.max(4, Math.ceil(total / 8));
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const t2 = t * t;
      const x = mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x;
      const y = mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y;
      points.push({ x, y });
    }
    return points;
  }

  function approximateQuadratic(p0, p1, p2) {
    const total = distanceBetween(p0, p1) + distanceBetween(p1, p2);
    const segments = Math.max(3, Math.ceil(total / 8));
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
      const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
      points.push({ x, y });
    }
    return points;
  }

  function angleBetween(uX, uY, vX, vY) {
    const dot = uX * vX + uY * vY;
    const mag = Math.sqrt((uX * uX + uY * uY) * (vX * vX + vY * vY));
    if (mag === 0) return 0;
    let cos = dot / mag;
    cos = Math.min(1, Math.max(-1, cos));
    const sign = uX * vY - uY * vX < 0 ? -1 : 1;
    return Math.acos(cos) * sign;
  }

  function approximateArc(p0, rx, ry, angle, largeArc, sweep, p1) {
    if (rx === 0 || ry === 0) {
      return [p0, p1];
    }
    const rad = angle * DEG_TO_RAD;
    const cosAngle = Math.cos(rad);
    const sinAngle = Math.sin(rad);
    const dx2 = (p0.x - p1.x) / 2;
    const dy2 = (p0.y - p1.y) / 2;
    const x1p = cosAngle * dx2 + sinAngle * dy2;
    const y1p = -sinAngle * dx2 + cosAngle * dy2;
    let rxSq = rx * rx;
    let rySq = ry * ry;
    let lambda = (x1p * x1p) / rxSq + (y1p * y1p) / rySq;
    if (lambda > 1) {
      const scale = Math.sqrt(lambda);
      rx *= scale;
      ry *= scale;
      rxSq = rx * rx;
      rySq = ry * ry;
    }
    const sign = largeArc === sweep ? -1 : 1;
    const numerator = rxSq * rySq - rxSq * y1p * y1p - rySq * x1p * x1p;
    const denom = rxSq * y1p * y1p + rySq * x1p * x1p;
    const factor = denom === 0 ? 0 : sign * Math.sqrt(Math.max(0, numerator / denom));
    const cxp = factor * (rx * y1p) / ry;
    const cyp = factor * -(ry * x1p) / rx;
    const cx = cosAngle * cxp - sinAngle * cyp + (p0.x + p1.x) / 2;
    const cy = sinAngle * cxp + cosAngle * cyp + (p0.y + p1.y) / 2;
    const ux = (x1p - cxp) / rx;
    const uy = (y1p - cyp) / ry;
    const vx = (-x1p - cxp) / rx;
    const vy = (-y1p - cyp) / ry;
    let startAngle = angleBetween(1, 0, ux, uy);
    let deltaAngle = angleBetween(ux, uy, vx, vy);
    if (!sweep && deltaAngle > 0) {
      deltaAngle -= Math.PI * 2;
    } else if (sweep && deltaAngle < 0) {
      deltaAngle += Math.PI * 2;
    }
    const segments = Math.max(1, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2)));
    const step = deltaAngle / segments;
    const points = [p0];
    for (let i = 1; i <= segments; i++) {
      const theta = startAngle + step * i;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);
      const x = cosAngle * rx * cosTheta - sinAngle * ry * sinTheta + cx;
      const y = sinAngle * rx * cosTheta + cosAngle * ry * sinTheta + cy;
      points.push({ x, y });
    }
    return points;
  }

  function flattenPath(commands) {
    const subpaths = [];
    let currentPoint = { x: 0, y: 0 };
    let startPoint = { x: 0, y: 0 };
    let prevCubicControl = null;
    let prevQuadraticControl = null;
    let currentSubpath = null;

    const ensureSubpath = () => {
      if (!currentSubpath) {
        currentSubpath = { points: [], closed: false };
        subpaths.push(currentSubpath);
      }
      return currentSubpath;
    };

    const addPoint = point => {
      const subpath = ensureSubpath();
      const last = subpath.points[subpath.points.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) {
        subpath.points.push({ x: point.x, y: point.y });
      }
    };

    const closeSubpath = () => {
      if (currentSubpath) {
        currentSubpath.closed = true;
        if (currentSubpath.points.length && (currentSubpath.points[0].x !== currentPoint.x || currentSubpath.points[0].y !== currentPoint.y)) {
          currentSubpath.points.push({ x: currentSubpath.points[0].x, y: currentSubpath.points[0].y });
        }
      }
    };

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const code = command.cmd;
      const absolute = code === code.toUpperCase();
      switch (code) {
        case 'M':
        case 'm': {
          const x = absolute ? command.x : currentPoint.x + command.x;
          const y = absolute ? command.y : currentPoint.y + command.y;
          currentPoint = { x, y };
          startPoint = { x, y };
          currentSubpath = { points: [{ x, y }], closed: false };
          subpaths.push(currentSubpath);
          prevCubicControl = null;
          prevQuadraticControl = null;
          break;
        }
        case 'L':
        case 'l': {
          const x = absolute ? command.x : currentPoint.x + command.x;
          const y = absolute ? command.y : currentPoint.y + command.y;
          currentPoint = { x, y };
          addPoint(currentPoint);
          prevCubicControl = null;
          prevQuadraticControl = null;
          break;
        }
        case 'H':
        case 'h': {
          const x = absolute ? command.value : currentPoint.x + command.value;
          currentPoint = { x, y: currentPoint.y };
          addPoint(currentPoint);
          prevCubicControl = null;
          prevQuadraticControl = null;
          break;
        }
        case 'V':
        case 'v': {
          const y = absolute ? command.value : currentPoint.y + command.value;
          currentPoint = { x: currentPoint.x, y };
          addPoint(currentPoint);
          prevCubicControl = null;
          prevQuadraticControl = null;
          break;
        }
        case 'C':
        case 'c': {
          const x1 = absolute ? command.x1 : currentPoint.x + command.x1;
          const y1 = absolute ? command.y1 : currentPoint.y + command.y1;
          const x2 = absolute ? command.x2 : currentPoint.x + command.x2;
          const y2 = absolute ? command.y2 : currentPoint.y + command.y2;
          const x = absolute ? command.x : currentPoint.x + command.x;
          const y = absolute ? command.y : currentPoint.y + command.y;
          const points = approximateCubic(currentPoint, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y });
          for (let p = 1; p < points.length; p++) {
            addPoint(points[p]);
          }
          currentPoint = { x, y };
          prevCubicControl = { x: x2, y: y2 };
          prevQuadraticControl = null;
          break;
        }
        case 'S':
        case 's': {
          const reflected = prevCubicControl
            ? { x: 2 * currentPoint.x - prevCubicControl.x, y: 2 * currentPoint.y - prevCubicControl.y }
            : { x: currentPoint.x, y: currentPoint.y };
          const x2 = absolute ? command.x2 : currentPoint.x + command.x2;
          const y2 = absolute ? command.y2 : currentPoint.y + command.y2;
          const x = absolute ? command.x : currentPoint.x + command.x;
          const y = absolute ? command.y : currentPoint.y + command.y;
          const points = approximateCubic(currentPoint, reflected, { x: x2, y: y2 }, { x, y });
          for (let p = 1; p < points.length; p++) {
            addPoint(points[p]);
          }
          currentPoint = { x, y };
          prevCubicControl = { x: x2, y: y2 };
          prevQuadraticControl = null;
          break;
        }
        case 'Q':
        case 'q': {
          const x1 = absolute ? command.x1 : currentPoint.x + command.x1;
          const y1 = absolute ? command.y1 : currentPoint.y + command.y1;
          const x = absolute ? command.x : currentPoint.x + command.x;
          const y = absolute ? command.y : currentPoint.y + command.y;
          const points = approximateQuadratic(currentPoint, { x: x1, y: y1 }, { x, y });
          for (let p = 1; p < points.length; p++) {
            addPoint(points[p]);
          }
          currentPoint = { x, y };
          prevQuadraticControl = { x: x1, y: y1 };
          prevCubicControl = null;
          break;
        }
        case 'T':
        case 't': {
          const control = prevQuadraticControl
            ? { x: 2 * currentPoint.x - prevQuadraticControl.x, y: 2 * currentPoint.y - prevQuadraticControl.y }
            : { x: currentPoint.x, y: currentPoint.y };
          const x = absolute ? command.x : currentPoint.x + command.x;
          const y = absolute ? command.y : currentPoint.y + command.y;
          const points = approximateQuadratic(currentPoint, control, { x, y });
          for (let p = 1; p < points.length; p++) {
            addPoint(points[p]);
          }
          currentPoint = { x, y };
          prevQuadraticControl = control;
          prevCubicControl = null;
          break;
        }
        case 'A':
        case 'a': {
          const rx = command.rx;
          const ry = command.ry;
          const angle = command.angle;
          const largeArc = command.largeArc;
          const sweep = command.sweep;
          const x = absolute ? command.x : currentPoint.x + command.x;
          const y = absolute ? command.y : currentPoint.y + command.y;
          const points = approximateArc(currentPoint, rx, ry, angle, largeArc, sweep, { x, y });
          for (let p = 1; p < points.length; p++) {
            addPoint(points[p]);
          }
          currentPoint = { x, y };
          prevCubicControl = null;
          prevQuadraticControl = null;
          break;
        }
        case 'Z':
        case 'z': {
          closeSubpath();
          currentPoint = { x: startPoint.x, y: startPoint.y };
          prevCubicControl = null;
          prevQuadraticControl = null;
          currentSubpath = null;
          break;
        }
        default:
          break;
      }
    }
    return subpaths.filter(sp => sp && sp.points.length >= 2);
  }

  function parsePointsAttribute(value) {
    if (!value || typeof value !== 'string') {
      return [];
    }
    const parts = value.trim().split(/[\s,]+/g);
    const points = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const x = Number.parseFloat(parts[i]);
      const y = Number.parseFloat(parts[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push({ x, y });
      }
    }
    return points;
  }

  function transformSubpaths(subpaths, matrix) {
    if (!matrix || matrix === IDENTITY_MATRIX) {
      return subpaths;
    }
    return subpaths.map(subpath => ({
      closed: subpath.closed,
      points: subpath.points.map(pt => applyMatrixToPoint(matrix, pt.x, pt.y))
    }));
  }

  function transformPoints(points, matrix) {
    if (!matrix || matrix === IDENTITY_MATRIX) {
      return points.slice();
    }
    return points.map(pt => applyMatrixToPoint(matrix, pt.x, pt.y));
  }

  function normalizeRect(rect) {
    if (!rect) return null;
    const left = Math.min(rect.left, rect.right);
    const right = Math.max(rect.left, rect.right);
    const top = Math.min(rect.top, rect.bottom);
    const bottom = Math.max(rect.top, rect.bottom);
    if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
      return null;
    }
    if (right - left <= GEOMETRY_EPSILON || bottom - top <= GEOMETRY_EPSILON) {
      return null;
    }
    return { left, right, top, bottom };
  }

  function transformRectPoints(rect, matrix) {
    if (!rect) return null;
    const corners = [
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.top },
      { x: rect.right, y: rect.bottom },
      { x: rect.left, y: rect.bottom }
    ];
    const transformed = corners.map(pt => applyMatrixToPoint(matrix, pt.x, pt.y));
    const xs = transformed.map(pt => pt.x);
    const ys = transformed.map(pt => pt.y);
    return normalizeRect({
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys)
    });
  }

  function resolveClipPathReference(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'none') {
      return null;
    }
    const match = trimmed.match(/^url\((['"]?)#([^'"\)]+)\1\)$/);
    if (!match) {
      return null;
    }
    return match[2] ? match[2].trim() : null;
  }

  function clipSegmentToRect(x0, y0, x1, y1, rect) {
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;

    const update = (p, q) => {
      if (Math.abs(p) < GEOMETRY_EPSILON) {
        return q >= 0;
      }
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };

    if (!update(-dx, x0 - rect.left)) return null;
    if (!update(dx, rect.right - x0)) return null;
    if (!update(-dy, y0 - rect.top)) return null;
    if (!update(dy, rect.bottom - y0)) return null;

    return {
      x0: x0 + t0 * dx,
      y0: y0 + t0 * dy,
      x1: x0 + t1 * dx,
      y1: y0 + t1 * dy
    };
  }

  function pointsInsideRect(points, rect, closed) {
    if (!points || !points.length || !rect) {
      return false;
    }
    const end = closed && points.length > 1 ? points.length - 1 : points.length;
    for (let i = 0; i < end; i++) {
      const pt = points[i];
      if (pt.x < rect.left - GEOMETRY_EPSILON || pt.x > rect.right + GEOMETRY_EPSILON ||
          pt.y < rect.top - GEOMETRY_EPSILON || pt.y > rect.bottom + GEOMETRY_EPSILON) {
        return false;
      }
    }
    return true;
  }

  function clipPolygon(points, rect) {
    if (!points || points.length === 0) {
      return [];
    }
    const clipAgainst = (input, isInside, intersect) => {
      const output = [];
      if (!input.length) {
        return output;
      }
      let prev = input[input.length - 1];
      let prevInside = isInside(prev);
      for (let i = 0; i < input.length; i++) {
        const current = input[i];
        const inside = isInside(current);
        if (inside) {
          if (!prevInside) {
            output.push(intersect(prev, current));
          }
          output.push(current);
        } else if (prevInside) {
          output.push(intersect(prev, current));
        }
        prev = current;
        prevInside = inside;
      }
      return output;
    };

    let output = points;
    output = clipAgainst(output, pt => pt.x >= rect.left, (p1, p2) => {
      const t = (rect.left - p1.x) / (p2.x - p1.x);
      return { x: rect.left, y: p1.y + (p2.y - p1.y) * t };
    });
    output = clipAgainst(output, pt => pt.x <= rect.right, (p1, p2) => {
      const t = (rect.right - p1.x) / (p2.x - p1.x);
      return { x: rect.right, y: p1.y + (p2.y - p1.y) * t };
    });
    output = clipAgainst(output, pt => pt.y >= rect.top, (p1, p2) => {
      const t = (rect.top - p1.y) / (p2.y - p1.y);
      return { x: p1.x + (p2.x - p1.x) * t, y: rect.top };
    });
    output = clipAgainst(output, pt => pt.y <= rect.bottom, (p1, p2) => {
      const t = (rect.bottom - p1.y) / (p2.y - p1.y);
      return { x: p1.x + (p2.x - p1.x) * t, y: rect.bottom };
    });
    return output;
  }

  function pointsRoughlyEqual(a, b) {
    return Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(a.y - b.y) <= GEOMETRY_EPSILON;
  }

  function clipPolyline(points, rect) {
    if (!points || points.length < 2) {
      return [];
    }
    const results = [];
    let current = null;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const clipped = clipSegmentToRect(prev.x, prev.y, curr.x, curr.y, rect);
      if (!clipped) {
        if (current && current.points.length > 1) {
          results.push(current);
        }
        current = null;
        continue;
      }
      if (!current) {
        current = { closed: false, points: [] };
        current.points.push({ x: clipped.x0, y: clipped.y0 });
      } else {
        const last = current.points[current.points.length - 1];
        if (!pointsRoughlyEqual(last, { x: clipped.x0, y: clipped.y0 })) {
          current.points.push({ x: clipped.x0, y: clipped.y0 });
        }
      }
      current.points.push({ x: clipped.x1, y: clipped.y1 });
    }
    if (current && current.points.length > 1) {
      results.push(current);
    }
    return results;
  }

  function clipSubpathsToRect(subpaths, rect) {
    if (!rect || !subpaths || !subpaths.length) {
      return subpaths;
    }
    const normalizedRect = normalizeRect(rect);
    if (!normalizedRect) {
      return subpaths;
    }
    let changed = false;
    const result = [];
    for (const subpath of subpaths) {
      if (!subpath || !subpath.points || !subpath.points.length) {
        continue;
      }
      if (subpath.closed) {
        if (pointsInsideRect(subpath.points, normalizedRect, true)) {
          result.push(subpath);
          continue;
        }
        const rawPoints = subpath.points;
        const basePoints = rawPoints.length > 1 && pointsRoughlyEqual(rawPoints[0], rawPoints[rawPoints.length - 1])
          ? rawPoints.slice(0, rawPoints.length - 1)
          : rawPoints.slice();
        const clipped = clipPolygon(basePoints, normalizedRect);
        if (clipped.length < 3) {
          changed = true;
          continue;
        }
        const closedPoints = clipped.slice();
        const first = closedPoints[0];
        const last = closedPoints[closedPoints.length - 1];
        if (!pointsRoughlyEqual(first, last)) {
          closedPoints.push({ x: first.x, y: first.y });
        }
        result.push({ closed: true, points: closedPoints });
        changed = true;
      } else {
        if (pointsInsideRect(subpath.points, normalizedRect, false)) {
          result.push(subpath);
          continue;
        }
        const segments = clipPolyline(subpath.points, normalizedRect);
        if (!segments.length) {
          changed = true;
          continue;
        }
        for (const seg of segments) {
          if (seg.points.length >= 2) {
            result.push({ closed: false, points: seg.points });
          }
        }
        changed = true;
      }
    }
    return changed ? result : subpaths;
  }

  function computeScaleFromMatrix(matrix) {
    if (!matrix) return 1;
    const sx = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1]);
    const sy = Math.sqrt(matrix[2] * matrix[2] + matrix[3] * matrix[3]);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      return 1;
    }
    if (sx === 0 && sy === 0) return 1;
    if (sx === 0) return sy;
    if (sy === 0) return sx;
    return (sx + sy) / 2;
  }

  function transformStrokeWidth(matrix, width) {
    if (!matrix || matrix === IDENTITY_MATRIX) {
      return width;
    }
    const scale = computeScaleFromMatrix(matrix);
    return width * scale;
  }

  function parseViewBox(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const parts = value.trim().split(/[\s,]+/g);
    if (parts.length !== 4) {
      return null;
    }
    const numbers = parts.map(part => Number.parseFloat(part));
    if (numbers.some(num => !Number.isFinite(num))) {
      return null;
    }
    return { minX: numbers[0], minY: numbers[1], width: numbers[2], height: numbers[3] };
  }

  function computeViewBoxMatrix(svgElement, width, height, viewBox) {
    if (!viewBox || !width || !height) {
      return IDENTITY_MATRIX;
    }
    const preserve = (svgElement.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
    if (!preserve || preserve === 'none') {
      const sx = width / viewBox.width;
      const sy = height / viewBox.height;
      const tx = -viewBox.minX * sx;
      const ty = -viewBox.minY * sy;
      return [sx, 0, 0, sy, tx, ty];
    }
    const parts = preserve.split(/\s+/);
    const align = parts[0] || 'xMidYMid';
    const meetOrSlice = parts[1] || 'meet';
    const scaleX = width / viewBox.width;
    const scaleY = height / viewBox.height;
    let scale = meetOrSlice === 'slice' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    if (!Number.isFinite(scale) || scale === 0) {
      scale = 1;
    }
    const viewWidth = viewBox.width * scale;
    const viewHeight = viewBox.height * scale;
    let tx = -viewBox.minX * scale;
    let ty = -viewBox.minY * scale;
    if (align.includes('xMid')) {
      tx += (width - viewWidth) / 2;
    } else if (align.includes('xMax')) {
      tx += width - viewWidth;
    }
    if (align.includes('YMid')) {
      ty += (height - viewHeight) / 2;
    } else if (align.includes('YMax')) {
      ty += height - viewHeight;
    }
    return [scale, 0, 0, scale, tx, ty];
  }

  function resolveSvgDimensions(svgElement, options) {
    let width = parseDimension(svgElement.getAttribute('width'));
    let height = parseDimension(svgElement.getAttribute('height'));
    const viewBox = parseViewBox(svgElement.getAttribute('viewBox'));
    if ((!width || !height) && viewBox) {
      width = width || viewBox.width;
      height = height || viewBox.height;
    }
    if (!width && options?.width) {
      width = parseDimension(options.width);
    }
    if (!height && options?.height) {
      height = parseDimension(options.height);
    }
    if (!width || !height) {
      return null;
    }
    return { width, height, viewBox };
  }

  function parseSvgDocument(xml) {
    if (!xml || typeof xml !== 'string') {
      return null;
    }
    if (typeof global.DOMParser !== 'function') {
      return null;
    }
    let svgDoc;
    try {
      const parser = new global.DOMParser();
      svgDoc = parser.parseFromString(xml, 'image/svg+xml');
    } catch (err) {
      warn('parseSvgDocument parse error', { message: err?.message });
      return null;
    }
    if (!svgDoc || !svgDoc.documentElement) {
      return null;
    }
    const errorNode = svgDoc.getElementsByTagName('parsererror')[0];
    if (errorNode) {
      warn('parseSvgDocument parser error node', { text: errorNode.textContent });
      return null;
    }
    const svgElement = svgDoc.documentElement;
    if (!svgElement || svgElement.tagName?.toLowerCase() !== 'svg') {
      return null;
    }
    return svgElement;
  }

  function collectClipPaths(svgElement) {
    const clipMap = new Map();
    let unsupported = false;
    if (!svgElement || typeof svgElement.getElementsByTagName !== 'function') {
      return { map: clipMap, unsupported: false };
    }
    const nodes = svgElement.getElementsByTagName('clipPath');
    for (let i = 0; i < nodes.length; i++) {
      const clipPath = nodes[i];
      const id = clipPath.getAttribute('id');
      if (!id) {
        continue;
      }
      const units = (clipPath.getAttribute('clipPathUnits') || 'userSpaceOnUse').trim();
      if (units && units !== 'userSpaceOnUse') {
        unsupported = true;
        clipMap.set(id, { unsupported: true });
        continue;
      }
      const clipTransform = parseTransformAttribute(clipPath.getAttribute('transform'));
      let rect = null;
      let rectTransform = clipTransform || IDENTITY_MATRIX;
      for (let child = clipPath.firstElementChild; child; child = child.nextElementChild) {
        const tag = child.tagName ? child.tagName.toLowerCase() : '';
        if (tag === 'rect') {
          const x = parseSvgNumber(child.getAttribute('x'), 0);
          const y = parseSvgNumber(child.getAttribute('y'), 0);
          const width = parseSvgNumber(child.getAttribute('width'), 0);
          const height = parseSvgNumber(child.getAttribute('height'), 0);
          if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            continue;
          }
          rect = { left: x, top: y, right: x + width, bottom: y + height };
          const childTransform = parseTransformAttribute(child.getAttribute('transform'));
          if (childTransform && childTransform !== IDENTITY_MATRIX) {
            rectTransform = multiplyMatrices(rectTransform, childTransform);
          }
          break;
        }
      }
      if (!rect) {
        unsupported = true;
        clipMap.set(id, { unsupported: true });
        continue;
      }
      clipMap.set(id, { type: 'rect', rect, transform: rectTransform });
    }
    return { map: clipMap, unsupported };
  }

  function buildVectorSceneFromSvg(xml, options = {}) {
    const svgElement = parseSvgDocument(xml);
    if (!svgElement) {
      return null;
    }
    const dims = resolveSvgDimensions(svgElement, options);
    if (!dims) {
      warn('buildVectorSceneFromSvg missing dimensions');
      return null;
    }
    const rootMatrix = computeViewBoxMatrix(svgElement, dims.width, dims.height, dims.viewBox);
    const shapes = [];
    const visited = new Set();
    const clipRegistry = collectClipPaths(svgElement);
    const clipPaths = clipRegistry.map;
    let vectorUnsupported = clipRegistry.unsupported;

    const resolveClipRect = (style, matrix) => {
      if (!style?.clipPath) {
        return null;
      }
      const ref = resolveClipPathReference(style.clipPath);
      if (!ref) {
        return null;
      }
      const def = clipPaths.get(ref);
      if (!def || def.unsupported) {
        vectorUnsupported = true;
        return null;
      }
      if (def.type !== 'rect') {
        vectorUnsupported = true;
        return null;
      }
      const effectiveMatrix = matrix
        ? multiplyMatrices(matrix, def.transform || IDENTITY_MATRIX)
        : (def.transform || IDENTITY_MATRIX);
      return transformRectPoints(def.rect, effectiveMatrix);
    };

    const traverse = (node, matrix, style) => {
      if (!node || node.nodeType !== 1) {
        return;
      }
      const tag = node.tagName?.toLowerCase();
      if (!tag) return;
      if (tag === 'defs' || tag === 'clipPath' || tag === 'mask' || tag === 'pattern' || tag === 'metadata' || tag === 'title' || tag === 'desc' || tag === 'script' || tag === 'style') {
        return;
      }
      const nextStyle = deriveElementStyle(node, style);
      if (!nextStyle) {
        return;
      }
      if (nextStyle.display === 'none' || nextStyle.visibility === 'hidden' || nextStyle.opacity <= 0) {
        return;
      }
      const transformAttr = node.getAttribute('transform');
      const combinedMatrix = transformAttr ? multiplyMatrices(matrix, parseTransformAttribute(transformAttr)) : matrix;

      if (tag === 'g' || tag === 'svg' || tag === 'symbol' || tag === 'a') {
        for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
          traverse(child, combinedMatrix, nextStyle);
        }
        return;
      }

      if (tag === 'use') {
        const href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (href && href.startsWith('#')) {
          const id = href.slice(1);
          const referenced = svgElement.getElementById(id);
          if (referenced && !visited.has(referenced)) {
            visited.add(referenced);
            const tx = parseSvgNumber(node.getAttribute('x'), 0);
            const ty = parseSvgNumber(node.getAttribute('y'), 0);
            const useMatrix = tx || ty ? multiplyMatrices(combinedMatrix, [1, 0, 0, 1, tx, ty]) : combinedMatrix;
            traverse(referenced, useMatrix, nextStyle);
            visited.delete(referenced);
          }
        }
        return;
      }

      const clipRect = resolveClipRect(nextStyle, combinedMatrix);
      const pushPathShape = subpaths => {
        if (!subpaths || !subpaths.length) return;
        const transformed = transformSubpaths(subpaths, combinedMatrix);
        const clipped = clipRect ? clipSubpathsToRect(transformed, clipRect) : transformed;
        if (!clipped || !clipped.length) {
          return;
        }
        const scale = computeScaleFromMatrix(combinedMatrix);
        const strokeWidth = transformStrokeWidth(combinedMatrix, nextStyle.strokeWidth || 0);
        const dashArray = nextStyle.strokeDasharray ? nextStyle.strokeDasharray.map(value => value * scale) : null;
        const dashOffset = nextStyle.strokeDashoffset ? nextStyle.strokeDashoffset * scale : 0;
        shapes.push({
          type: 'path',
          subpaths: clipped,
          fill: nextStyle.fill,
          fillOpacity: nextStyle.fillOpacity,
          stroke: nextStyle.stroke,
          strokeOpacity: nextStyle.strokeOpacity,
          strokeWidth,
          strokeLinecap: nextStyle.strokeLinecap,
          strokeLinejoin: nextStyle.strokeLinejoin,
          strokeMiterlimit: nextStyle.strokeMiterlimit,
          strokeDasharray: dashArray,
          strokeDashoffset: dashOffset,
          fillRule: nextStyle.fillRule || 'nonzero',
          opacity: nextStyle.opacity,
          color: nextStyle.color
        });
      };

      switch (tag) {
        case 'path': {
          const d = node.getAttribute('d');
          if (!d) return;
          const commands = parsePathData(d);
          const subpaths = flattenPath(commands);
          pushPathShape(subpaths);
          break;
        }
        case 'rect': {
          const x = parseSvgNumber(node.getAttribute('x'), 0);
          const y = parseSvgNumber(node.getAttribute('y'), 0);
          const width = parseSvgNumber(node.getAttribute('width'), 0);
          const height = parseSvgNumber(node.getAttribute('height'), 0);
          if (!width || !height) return;
          let rx = parseSvgNumber(node.getAttribute('rx'), 0) || 0;
          let ry = parseSvgNumber(node.getAttribute('ry'), 0) || 0;
          if (rx && !ry) ry = rx;
          if (ry && !rx) rx = ry;
          rx = Math.min(rx, width / 2);
          ry = Math.min(ry, height / 2);
          if (rx <= 0 && ry <= 0) {
            const subpaths = [{
              closed: true,
              points: [
                { x, y },
                { x: x + width, y },
                { x: x + width, y: y + height },
                { x, y: y + height },
                { x, y }
              ]
            }];
            pushPathShape(subpaths);
          } else {
            const subpaths = flattenPath([
              { cmd: 'M', x: x + rx, y },
              { cmd: 'L', x: x + width - rx, y },
              { cmd: 'A', rx, ry, angle: 0, largeArc: 0, sweep: 1, x: x + width, y: y + ry },
              { cmd: 'L', x: x + width, y: y + height - ry },
              { cmd: 'A', rx, ry, angle: 0, largeArc: 0, sweep: 1, x: x + width - rx, y: y + height },
              { cmd: 'L', x: x + rx, y: y + height },
              { cmd: 'A', rx, ry, angle: 0, largeArc: 0, sweep: 1, x, y: y + height - ry },
              { cmd: 'L', x, y: y + ry },
              { cmd: 'A', rx, ry, angle: 0, largeArc: 0, sweep: 1, x: x + rx, y },
              { cmd: 'Z' }
            ]);
            pushPathShape(subpaths);
          }
          break;
        }
        case 'circle':
        case 'ellipse': {
          const cx = parseSvgNumber(node.getAttribute('cx'), 0);
          const cy = parseSvgNumber(node.getAttribute('cy'), 0);
          const rx = tag === 'ellipse' ? parseSvgNumber(node.getAttribute('rx'), 0) : parseSvgNumber(node.getAttribute('r'), 0);
          const ry = tag === 'ellipse' ? parseSvgNumber(node.getAttribute('ry'), 0) : parseSvgNumber(node.getAttribute('r'), 0);
          if (!rx || !ry) return;
          const steps = 16;
          const points = [];
          for (let i = 0; i <= steps; i++) {
            const angle = (2 * Math.PI * i) / steps;
            points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
          }
          const subpaths = [{ closed: true, points }];
          pushPathShape(subpaths);
          break;
        }
        case 'line': {
          const x1 = parseSvgNumber(node.getAttribute('x1'), 0);
          const y1 = parseSvgNumber(node.getAttribute('y1'), 0);
          const x2 = parseSvgNumber(node.getAttribute('x2'), 0);
          const y2 = parseSvgNumber(node.getAttribute('y2'), 0);
          const subpaths = [{ closed: false, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] }];
          pushPathShape(subpaths);
          break;
        }
        case 'polyline':
        case 'polygon': {
          const pts = parsePointsAttribute(node.getAttribute('points'));
          if (pts.length < 2) return;
          if (tag === 'polygon' && (pts[0].x !== pts[pts.length - 1].x || pts[0].y !== pts[pts.length - 1].y)) {
            pts.push({ x: pts[0].x, y: pts[0].y });
          }
          const subpaths = [{ closed: tag === 'polygon', points: pts }];
          pushPathShape(subpaths);
          break;
        }
        case 'text': {
          const raw = node.textContent;
          if (!raw) return;
          const text = raw.replace(/\s+/g, ' ').trim();
          if (!text) return;
          const x = parseSvgNumber(node.getAttribute('x'), 0) + parseSvgNumber(node.getAttribute('dx'), 0);
          const y = parseSvgNumber(node.getAttribute('y'), 0) + parseSvgNumber(node.getAttribute('dy'), 0);
          const fontSize = Number.isFinite(nextStyle.fontSize) ? nextStyle.fontSize : 12;
          const font = buildFontString(nextStyle);
          const width = measureTextWidth(text, font) || fontSize * text.length * 0.6;
          let anchorOffset = 0;
          if (nextStyle.textAnchor === 'middle') anchorOffset = width / 2;
          else if (nextStyle.textAnchor === 'end') anchorOffset = width;
          const anchorX = x - anchorOffset;
          const position = applyMatrixToPoint(combinedMatrix, anchorX, y);
          const scaleX = Math.sqrt(combinedMatrix[0] * combinedMatrix[0] + combinedMatrix[1] * combinedMatrix[1]) || 1;
          const scaleY = Math.sqrt(combinedMatrix[2] * combinedMatrix[2] + combinedMatrix[3] * combinedMatrix[3]) || 1;
          const shear = combinedMatrix[0] * combinedMatrix[2] + combinedMatrix[1] * combinedMatrix[3];
          if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || Math.abs(shear) > 1e-3) {
            warn('buildVectorSceneFromSvg text skipped due to shear', { shear });
            return;
          }
          const rotation = Math.atan2(combinedMatrix[1], combinedMatrix[0]);
          const ascent = fontSize * 0.8;
          const descent = fontSize * 0.2;
          shapes.push({
            type: 'text',
            text,
            position,
            scaleX,
            scaleY,
            rotation,
            fontFamily: nextStyle.fontFamily || getDefaultFontFamily(),
            fontSize,
            fontWeight: nextStyle.fontWeight || '400',
            fontStyle: nextStyle.fontStyle || 'normal',
            fill: nextStyle.fill,
            fillOpacity: nextStyle.fillOpacity,
            opacity: nextStyle.opacity,
            color: nextStyle.color,
            width,
            ascent,
            descent
          });
          break;
        }
        default:
          break;
      }
    };

    const baseStyle = createInitialSvgStyle();
    traverse(svgElement, rootMatrix, baseStyle);

    if (vectorUnsupported) {
      debugLog('buildVectorSceneFromSvg fallback', { reason: 'unsupported-clip-path' });
      return null;
    }

    return { width: dims.width, height: dims.height, shapes };
  }

  function clampByte(value) {
    const num = Math.round(value);
    if (num < 0) return 0;
    if (num > 255) return 255;
    return num;
  }

  function parseBackgroundColor(colorValue) {
    const parsed = parseCssColor(colorValue);
    if (!parsed) {
      return { r: 255, g: 255, b: 255 };
    }
    return { r: parsed.r, g: parsed.g, b: parsed.b };
  }

  function resolvePaintColor(value, componentOpacity, overallOpacity, currentColor, background) {
    if (!value || value === 'none' || value === 'transparent') {
      return null;
    }
    const resolvedValue = value === 'currentColor' ? currentColor : value;
    if (!resolvedValue || resolvedValue === 'none') {
      return null;
    }
    const parsed = parseCssColor(resolvedValue);
    if (!parsed) {
      return null;
    }
    const alpha = ((parsed.a ?? 255) / 255) * (componentOpacity ?? 1) * (overallOpacity ?? 1);
    if (alpha <= 0) {
      return null;
    }
    if (alpha >= 0.999) {
      return { r: parsed.r, g: parsed.g, b: parsed.b };
    }
    const bg = background || { r: 255, g: 255, b: 255 };
    const blend = 1 - alpha;
    return {
      r: clampByte(parsed.r * alpha + bg.r * blend),
      g: clampByte(parsed.g * alpha + bg.g * blend),
      b: clampByte(parsed.b * alpha + bg.b * blend)
    };
  }

  function encodeColorRef(color) {
    return (color.b << 16) | (color.g << 8) | color.r;
  }

  function createEmfWriter(width, height, dpiX, dpiY) {
    const state = {
      width,
      height,
      dpiX,
      dpiY,
      records: [],
      recordCount: 0,
      totalSize: 0,
      nextHandle: 1,
      maxHandle: 0,
      brushCache: new Map(),
      penCache: new Map(),
      fontCache: new Map(),
      createdHandles: [],
      currentBrush: null,
      currentPen: null,
      currentFont: null,
      currentPolyFill: SETPOLYFILLMODE_WINDING
    };

    const headerBuffer = new ArrayBuffer(108);
    const headerView = new DataView(headerBuffer);
    headerView.setUint32(0, EMR_HEADER, true);
    headerView.setUint32(4, 108, true);
    state.records.push(new Uint8Array(headerBuffer));
    state.recordCount = 1;
    state.totalSize = 108;

    const addRecord = (type, size, writer) => {
      const buffer = new ArrayBuffer(size);
      const view = new DataView(buffer);
      view.setUint32(0, type, true);
      view.setUint32(4, size, true);
      if (typeof writer === 'function') {
        writer(view, 8);
      }
      state.records.push(new Uint8Array(buffer));
      state.recordCount += 1;
      state.totalSize += size;
    };

    const ensureBrush = colorRef => {
      if (colorRef === null || colorRef === undefined) {
        return NULL_BRUSH_HANDLE;
      }
      const key = `b${colorRef}`;
      if (state.brushCache.has(key)) {
        return state.brushCache.get(key);
      }
      const handle = state.nextHandle++;
      state.maxHandle = Math.max(state.maxHandle, handle);
      addRecord(EMR_CREATEBRUSHINDIRECT, 24, (view, offset) => {
        view.setUint32(offset, handle, true); // ihBrush
        offset += 4;
        view.setUint32(offset, 0, true); // BS_SOLID
        offset += 4;
        view.setUint32(offset, colorRef >>> 0, true); // COLORREF
        offset += 4;
        view.setUint32(offset, 0, true); // lbHatch
      });
      state.createdHandles.push(handle);
      state.brushCache.set(key, handle);
      return handle;
    };

    const ensurePen = (colorRef, width) => {
      const effectiveWidth = Math.max(1, Math.round(width || 1));
      const key = `p${colorRef}_${effectiveWidth}`;
      if (state.penCache.has(key)) {
        return state.penCache.get(key);
      }
      const handle = state.nextHandle++;
      state.maxHandle = Math.max(state.maxHandle, handle);
      addRecord(EMR_CREATEPEN, 28, (view, offset) => {
        view.setUint32(offset, handle, true); // ihPen
        offset += 4;
        view.setUint32(offset, 0, true); // PS_SOLID
        offset += 4;
        view.setInt32(offset, effectiveWidth, true); // width.x
        offset += 4;
        view.setInt32(offset, 0, true); // width.y
        offset += 4;
        view.setUint32(offset, colorRef >>> 0, true); // COLORREF
      });
      state.createdHandles.push(handle);
      state.penCache.set(key, handle);
      return handle;
    };

    const ensureFont = descriptor => {
      const key = `${descriptor.fontFamily}|${descriptor.fontSize}|${descriptor.fontWeight}|${descriptor.fontStyle}|${descriptor.escapement}`;
      if (state.fontCache.has(key)) {
        return state.fontCache.get(key);
      }
      const handle = state.nextHandle++;
      state.maxHandle = Math.max(state.maxHandle, handle);
      addRecord(EMR_EXTCREATEFONTINDIRECTW, 108, (view, offset) => {
        view.setUint32(offset, handle, true);
        offset += 4;
        view.setInt32(offset, -Math.max(1, Math.round(descriptor.fontSize)), true); // lfHeight
        offset += 4;
        view.setInt32(offset, 0, true); // lfWidth
        offset += 4;
        view.setInt32(offset, descriptor.escapement, true); // lfEscapement
        offset += 4;
        view.setInt32(offset, descriptor.escapement, true); // lfOrientation
        offset += 4;
        view.setInt32(offset, descriptor.fontWeight, true); // lfWeight
        offset += 4;
        view.setUint8(offset, descriptor.fontStyle === 'italic' ? 1 : 0); // lfItalic
        offset += 1;
        view.setUint8(offset, 0); // lfUnderline
        offset += 1;
        view.setUint8(offset, 0); // lfStrikeOut
        offset += 1;
        view.setUint8(offset, 1); // lfCharSet DEFAULT
        offset += 1;
        view.setUint8(offset, 0); // lfOutPrecision
        offset += 1;
        view.setUint8(offset, 0); // lfClipPrecision
        offset += 1;
        view.setUint8(offset, 4); // lfQuality CLEARTYPE
        offset += 1;
        view.setUint8(offset, 0); // lfPitchAndFamily
        offset += 1;
        const face = (descriptor.fontFamily || '').slice(0, 31);
        for (let i = 0; i < 32; i++) {
          const code = i < face.length ? face.charCodeAt(i) : 0;
          view.setUint16(offset, code, true);
          offset += 2;
        }
      });
      state.createdHandles.push(handle);
      state.fontCache.set(key, handle);
      return handle;
    };

    const selectObject = handle => {
      if (handle === null || handle === undefined) return;
      addRecord(EMR_SELECTOBJECT, 12, (view, offset) => {
        view.setUint32(offset, handle >>> 0, true);
      });
    };

    const setPolyFillMode = mode => {
      if (state.currentPolyFill === mode) {
        return;
      }
      addRecord(EMR_SETPOLYFILLMODE, 12, (view, offset) => {
        view.setUint32(offset, mode >>> 0, true);
      });
      state.currentPolyFill = mode;
    };

    const setBkMode = mode => {
      addRecord(EMR_SETBKMODE, 12, (view, offset) => {
        view.setUint32(offset, mode >>> 0, true);
      });
    };

    const drawRectangle = (brushHandle, left, top, right, bottom) => {
      selectObject(NULL_PEN_HANDLE);
      selectObject(brushHandle);
      addRecord(EMR_RECTANGLE, 24, (view, offset) => {
        view.setInt32(offset, Math.round(left), true); offset += 4;
        view.setInt32(offset, Math.round(top), true); offset += 4;
        view.setInt32(offset, Math.round(right), true); offset += 4;
        view.setInt32(offset, Math.round(bottom), true);
      });
    };

    const emitPolyPolygon = (subpaths, brushHandle, fillMode) => {
      if (!subpaths || !subpaths.length) return;
      setPolyFillMode(fillMode);
      selectObject(NULL_PEN_HANDLE);
      selectObject(brushHandle);
      const polygons = subpaths.filter(sp => sp.closed && sp.points.length >= 3);
      if (!polygons.length) return;
      let totalPoints = 0;
      polygons.forEach(sp => { totalPoints += sp.points.length; });
      const size = 8 + 16 + 4 + 4 + 4 * polygons.length + 8 * totalPoints;
      addRecord(EMR_POLYPOLYGON, size, (view, offset) => {
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        polygons.forEach(sp => {
          sp.points.forEach(pt => {
            if (pt.x < left) left = pt.x;
            if (pt.y < top) top = pt.y;
            if (pt.x > right) right = pt.x;
            if (pt.y > bottom) bottom = pt.y;
          });
        });
        view.setInt32(offset, Math.floor(left), true); offset += 4;
        view.setInt32(offset, Math.floor(top), true); offset += 4;
        view.setInt32(offset, Math.ceil(right), true); offset += 4;
        view.setInt32(offset, Math.ceil(bottom), true); offset += 4;
        view.setUint32(offset, polygons.length, true); offset += 4;
        view.setUint32(offset, totalPoints, true); offset += 4;
        polygons.forEach(sp => {
          view.setUint32(offset, sp.points.length, true);
          offset += 4;
        });
        polygons.forEach(sp => {
          sp.points.forEach(pt => {
            view.setInt32(offset, Math.round(pt.x), true); offset += 4;
            view.setInt32(offset, Math.round(pt.y), true); offset += 4;
          });
        });
      });
    };

    const emitPolyPolyline = (subpaths, penHandle) => {
      const polylines = subpaths.filter(sp => sp.points.length >= 2);
      if (!polylines.length) return;
      selectObject(penHandle);
      selectObject(NULL_BRUSH_HANDLE);
      let totalPoints = 0;
      polylines.forEach(sp => { totalPoints += sp.points.length; });
      const size = 8 + 16 + 4 + 4 + 4 * polylines.length + 8 * totalPoints;
      addRecord(EMR_POLYPOLYLINE, size, (view, offset) => {
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        polylines.forEach(sp => {
          sp.points.forEach(pt => {
            if (pt.x < left) left = pt.x;
            if (pt.y < top) top = pt.y;
            if (pt.x > right) right = pt.x;
            if (pt.y > bottom) bottom = pt.y;
          });
        });
        view.setInt32(offset, Math.floor(left), true); offset += 4;
        view.setInt32(offset, Math.floor(top), true); offset += 4;
        view.setInt32(offset, Math.ceil(right), true); offset += 4;
        view.setInt32(offset, Math.ceil(bottom), true); offset += 4;
        view.setUint32(offset, polylines.length, true); offset += 4;
        view.setUint32(offset, totalPoints, true); offset += 4;
        polylines.forEach(sp => {
          view.setUint32(offset, sp.points.length, true);
          offset += 4;
        });
        polylines.forEach(sp => {
          sp.points.forEach(pt => {
            view.setInt32(offset, Math.round(pt.x), true); offset += 4;
            view.setInt32(offset, Math.round(pt.y), true); offset += 4;
          });
        });
      });
    };

    const emitText = (descriptor, fontHandle, colorRef) => {
      addRecord(EMR_SETTEXTCOLOR, 12, (view, offset) => {
        view.setUint32(offset, colorRef >>> 0, true);
      });
      selectObject(NULL_BRUSH_HANDLE);
      selectObject(fontHandle);
      selectObject(NULL_PEN_HANDLE);
      const text = descriptor.text;
      const length = text.length;
      const textBytes = new Uint16Array(length);
      for (let i = 0; i < length; i++) {
        textBytes[i] = text.charCodeAt(i);
      }
      const stringSize = textBytes.byteLength;
      const alignedStringSize = (stringSize + 3) & ~3;
      const recordSize = 8 + 16 + 4 + 4 + 4 + 40 + alignedStringSize;
      addRecord(EMR_EXTTEXTOUTW, recordSize, (view, offset) => {
        const width = Math.max(0, descriptor.width);
        const ascent = Math.max(0, descriptor.ascent);
        const descent = Math.max(0, descriptor.descent);
        const rotation = -(descriptor.rotation || 0);
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const originX = descriptor.position.x;
        const originY = descriptor.position.y;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        const updateBounds = (x, y) => {
          if (x < left) left = x;
          if (y < top) top = y;
          if (x > right) right = x;
          if (y > bottom) bottom = y;
        };
        const corners = [
          { x: 0, y: -ascent },
          { x: width, y: -ascent },
          { x: width, y: descent },
          { x: 0, y: descent }
        ];
        for (const corner of corners) {
          const px = originX + corner.x * cos - corner.y * sin;
          const py = originY + corner.x * sin + corner.y * cos;
          updateBounds(px, py);
        }
        if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
          left = originX;
          top = originY - ascent;
          right = originX + width;
          bottom = originY + descent;
        }
        left = Math.floor(left);
        top = Math.floor(top);
        right = Math.ceil(right);
        bottom = Math.ceil(bottom);
        view.setInt32(offset, left, true); offset += 4;
        view.setInt32(offset, top, true); offset += 4;
        view.setInt32(offset, right, true); offset += 4;
        view.setInt32(offset, bottom, true); offset += 4;
        view.setUint32(offset, 1, true); offset += 4; // GM_COMPATIBLE
        view.setFloat32(offset, 1, true); offset += 4;
        view.setFloat32(offset, 1, true); offset += 4;
        view.setInt32(offset, Math.round(descriptor.position.x), true); offset += 4;
        view.setInt32(offset, Math.round(descriptor.position.y), true); offset += 4;
        view.setUint32(offset, length, true); offset += 4;
        const stringOffset = 8 + 16 + 4 + 4 + 4 + 40;
        view.setUint32(offset, stringOffset, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4; // fOptions
        view.setInt32(offset, left, true); offset += 4;
        view.setInt32(offset, top, true); offset += 4;
        view.setInt32(offset, right, true); offset += 4;
        view.setInt32(offset, bottom, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4; // offDx
        const bytes = new Uint8Array(view.buffer, view.byteOffset + stringOffset, alignedStringSize);
        bytes.fill(0);
        bytes.set(new Uint8Array(textBytes.buffer));
      });
    };

    const deleteHandles = () => {
      for (let i = state.createdHandles.length - 1; i >= 0; i--) {
        const handle = state.createdHandles[i];
        addRecord(EMR_DELETEOBJECT, 12, (view, offset) => {
          view.setUint32(offset, handle >>> 0, true);
        });
      }
    };

    const finalize = () => {
      deleteHandles();
      addRecord(EMR_EOF, 20, (view, offset) => {
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, 20, true);
      });
      const dpiX = state.dpiX;
      const dpiY = state.dpiY;
      const frameWidth = Math.round((state.width * 2540) / dpiX);
      const frameHeight = Math.round((state.height * 2540) / dpiY);
      const mmWidth = Math.round((state.width * 25.4) / dpiX);
      const mmHeight = Math.round((state.height * 25.4) / dpiY);
      const microWidth = Math.round((state.width * 25400) / dpiX);
      const microHeight = Math.round((state.height * 25400) / dpiY);
      headerView.setInt32(8, 0, true);
      headerView.setInt32(12, 0, true);
      headerView.setInt32(16, Math.round(state.width), true);
      headerView.setInt32(20, Math.round(state.height), true);
      headerView.setInt32(24, 0, true);
      headerView.setInt32(28, 0, true);
      headerView.setInt32(32, frameWidth, true);
      headerView.setInt32(36, frameHeight, true);
      headerView.setUint32(40, 0x464D4520, true);
      headerView.setUint32(44, 0x00010000, true);
      headerView.setUint32(48, state.totalSize, true);
      headerView.setUint32(52, state.recordCount, true);
      headerView.setUint16(56, Math.max(1, state.maxHandle + 1), true);
      headerView.setUint16(58, 0, true);
      headerView.setUint32(60, 0, true);
      headerView.setUint32(64, 0, true);
      headerView.setUint32(68, 0, true);
      headerView.setInt32(72, Math.round(state.width), true);
      headerView.setInt32(76, Math.round(state.height), true);
      headerView.setInt32(80, mmWidth, true);
      headerView.setInt32(84, mmHeight, true);
      headerView.setUint32(88, 0, true);
      headerView.setUint32(92, 0, true);
      headerView.setUint32(96, 0, true);
      headerView.setInt32(100, microWidth, true);
      headerView.setInt32(104, microHeight, true);
    };

    return {
      state,
      addRecord,
      ensureBrush,
      ensurePen,
      ensureFont,
      selectObject,
      setBkMode,
      emitPolyPolygon,
      emitPolyPolyline,
      drawRectangle,
      emitText,
      finalize
    };
  }

  function normalizeFontWeight(value) {
    if (typeof value === 'number') {
      const rounded = Math.round(value);
      return Number.isFinite(rounded) ? Math.max(100, Math.min(900, rounded)) : 400;
    }
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (!lower) return 400;
      if (lower === 'bold') return 700;
      if (lower === 'normal') return 400;
      const parsed = Number.parseInt(lower, 10);
      if (Number.isFinite(parsed)) {
        return Math.max(100, Math.min(900, parsed));
      }
    }
    return 400;
  }

  function vectorSceneToEmfBlob(scene, options = {}) {
    if (!scene || !Array.isArray(scene.shapes)) {
      return null;
    }
    const dpiX = resolveDpiValue(options.dpiX || options.dpi);
    const dpiY = resolveDpiValue(options.dpiY || options.dpi);
    const background = parseBackgroundColor(options.backgroundColor || '#ffffff');
    const writer = createEmfWriter(scene.width, scene.height, dpiX, dpiY);
    writer.setBkMode(1);
    const backgroundBrush = writer.ensureBrush(encodeColorRef(background));
    writer.drawRectangle(backgroundBrush, 0, 0, scene.width, scene.height);

    for (const shape of scene.shapes) {
      if (shape.type === 'path') {
        const fillColor = resolvePaintColor(shape.fill, shape.fillOpacity, shape.opacity, shape.color, background);
        const strokeColor = resolvePaintColor(shape.stroke, shape.strokeOpacity, shape.opacity, shape.color, background);
        if (fillColor) {
          const brushHandle = writer.ensureBrush(encodeColorRef(fillColor));
          const fillMode = shape.fillRule === 'evenodd' ? SETPOLYFILLMODE_ALTERNATE : SETPOLYFILLMODE_WINDING;
          writer.emitPolyPolygon(shape.subpaths, brushHandle, fillMode);
        }
        if (strokeColor && shape.strokeWidth > 0) {
          const penHandle = writer.ensurePen(encodeColorRef(strokeColor), shape.strokeWidth);
          writer.emitPolyPolyline(shape.subpaths, penHandle);
        }
      } else if (shape.type === 'text') {
        const fillColor = resolvePaintColor(shape.fill, shape.fillOpacity, shape.opacity, shape.color, background);
        if (!fillColor) {
          continue;
        }
        const scaleX = Math.abs(shape.scaleX || 1);
        const scaleY = Math.abs(shape.scaleY || 1);
        const rawFontScale = scaleY > GEOMETRY_EPSILON ? scaleY : scaleX;
        const fontScale = rawFontScale > GEOMETRY_EPSILON ? rawFontScale : 1;
        const fontHandle = writer.ensureFont({
          fontFamily: shape.fontFamily,
          fontSize: shape.fontSize * (fontScale || 1),
          fontWeight: normalizeFontWeight(shape.fontWeight),
          fontStyle: shape.fontStyle,
          escapement: Math.round((-shape.rotation * 1800) / Math.PI)
        });
        writer.emitText({
          text: shape.text,
          position: shape.position,
          rotation: shape.rotation,
          width: shape.width * scaleX,
          ascent: shape.ascent * fontScale,
          descent: shape.descent * fontScale
        }, fontHandle, encodeColorRef(fillColor));
      }
    }

    writer.finalize();
    try {
      return new Blob(writer.state.records, { type: EMF_MIME_TYPE });
    } catch (err) {
      console.error('exporter vectorSceneToEmfBlob blob error', err);
      return null;
    }
  }

  function parseTransformAttribute(value) {
    if (!value || typeof value !== 'string') {
      return IDENTITY_MATRIX;
    }
    let index = 0;
    const length = value.length;
    let matrix = IDENTITY_MATRIX;
    const numberPattern = /[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g;
    while (index < length) {
      while (index < length && /[\s,]/.test(value[index])) index++;
      if (index >= length) break;
      const start = index;
      while (index < length && /[a-zA-Z]/.test(value[index])) index++;
      const fn = value.slice(start, index).toLowerCase();
      while (index < length && value[index] !== '(') index++;
      if (index >= length) break;
      index++;
      numberPattern.lastIndex = index;
      const args = [];
      let match;
      while ((match = numberPattern.exec(value)) && match.index < length) {
        args.push(Number.parseFloat(match[0]));
        index = numberPattern.lastIndex;
        if (value[index - 1] === ')') break;
      }
      while (index < length && value[index] !== ')') index++;
      if (index < length && value[index] === ')') index++;
      let local = IDENTITY_MATRIX;
      switch (fn) {
        case 'matrix':
          if (args.length === 6) {
            local = [args[0], args[1], args[2], args[3], args[4], args[5]];
          }
          break;
        case 'translate':
          if (args.length >= 1) {
            const tx = args[0];
            const ty = args.length >= 2 ? args[1] : 0;
            local = [1, 0, 0, 1, tx, ty];
          }
          break;
        case 'scale':
          if (args.length >= 1) {
            const sx = args[0];
            const sy = args.length >= 2 ? args[1] : sx;
            local = [sx, 0, 0, sy, 0, 0];
          }
          break;
        case 'rotate':
          if (args.length >= 1) {
            const angle = args[0] * DEG_TO_RAD;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            if (args.length >= 3) {
              const cx = args[1];
              const cy = args[2];
              local = multiplyMatrices([1, 0, 0, 1, cx, cy], multiplyMatrices([cos, sin, -sin, cos, 0, 0], [1, 0, 0, 1, -cx, -cy]));
            } else {
              local = [cos, sin, -sin, cos, 0, 0];
            }
          }
          break;
        case 'skewx':
          if (args.length >= 1) {
            const tan = Math.tan(args[0] * DEG_TO_RAD);
            local = [1, 0, tan, 1, 0, 0];
          }
          break;
        case 'skewy':
          if (args.length >= 1) {
            const tanY = Math.tan(args[0] * DEG_TO_RAD);
            local = [1, tanY, 0, 1, 0, 0];
          }
          break;
        default:
          break;
      }
      matrix = multiplyMatrices(matrix, local);
    }
    return matrix;
  }

  const parseCssColor = (() => {
    let ctx = null;
    return color => {
      if (!color || typeof color !== 'string') {
        return null;
      }
      if (!ctx) {
        if (!doc?.createElement) return null;
        const canvas = doc.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        ctx = canvas.getContext('2d');
        if (!ctx) return null;
      }
      try {
        ctx.fillStyle = '#000';
        ctx.fillStyle = color;
      } catch (err) {
        warn('parseCssColor invalid color', { color, error: err?.message });
        return null;
      }
      const computed = ctx.fillStyle;
      if (!computed || TRANSPARENT_VALUES.has(computed)) {
        return null;
      }
      if (computed.startsWith('#')) {
        const hex = computed.slice(1);
        if (hex.length === 6 || hex.length === 8) {
          const r = Number.parseInt(hex.slice(0, 2), 16);
          const g = Number.parseInt(hex.slice(2, 4), 16);
          const b = Number.parseInt(hex.slice(4, 6), 16);
          const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255;
          return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)
            ? null
            : { css: computed, r, g, b, a };
        }
      }
      const match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/i);
      if (match) {
        const r = Number.parseInt(match[1], 10);
        const g = Number.parseInt(match[2], 10);
        const b = Number.parseInt(match[3], 10);
        const alpha = match[4] !== undefined ? Math.max(0, Math.min(1, Number.parseFloat(match[4]))) : 1;
        if ([r, g, b].some(v => !Number.isFinite(v))) {
          return null;
        }
        const a = Math.round(alpha * 255);
        if (a <= 0) {
          return null;
        }
        return { css: computed, r, g, b, a };
      }
      return null;
    };
  })();

  let textMeasureCtx = null;

  function measureTextWidth(text, font) {
    if (!text || !font) {
      return 0;
    }
    if (!doc?.createElement) {
      return 0;
    }
    if (!textMeasureCtx) {
      const canvas = doc.createElement('canvas');
      textMeasureCtx = canvas.getContext('2d');
    }
    if (!textMeasureCtx) {
      return 0;
    }
    textMeasureCtx.font = font;
    try {
      const metrics = textMeasureCtx.measureText(text);
      return Number.isFinite(metrics?.width) ? metrics.width : 0;
    } catch (err) {
      warn('measureTextWidth error', { message: err?.message });
      return 0;
    }
  }

  function buildFontString(style) {
    const weight = typeof style.fontWeight === 'string' ? style.fontWeight : String(style.fontWeight || '400');
    const fontSize = Number.isFinite(style.fontSize) ? style.fontSize : 12;
    const family = style.fontFamily || getDefaultFontFamily();
    const fontStyle = style.fontStyle || 'normal';
    return `${fontStyle} ${weight} ${fontSize}px ${family}`;
  }

  const clipboardTypeSupports = type => {
    if (!type || typeof type !== 'string') return false;
    if (typeof global.ClipboardItem?.supports === 'function') {
      try {
        return global.ClipboardItem.supports(type);
      } catch (err) {
        warn('clipboardTypeSupports error', { type, error: err?.message });
      }
    }
    const normalized = type.toLowerCase();
    return normalized === 'text/plain' || normalized === 'text/html' || normalized === SVG_MIME_TYPE || normalized === 'image/png';
  };

  function resolveBackgroundColor(explicitColor, element) {
    if (explicitColor) {
      return explicitColor;
    }
    if (!element || typeof global.getComputedStyle !== 'function') {
      return null;
    }
    try {
      const computed = global.getComputedStyle(element);
      if (computed?.backgroundColor && !TRANSPARENT_VALUES.has(computed.backgroundColor)) {
        return computed.backgroundColor;
      }
    } catch (err) {
      warn('resolveBackgroundColor error', { error: err?.message });
    }
    return null;
  }

  const getDefaultFontFamily = () => {
    const sharedFont = Shared?.chartStyle?.FONT_FAMILY;
    const chosen = typeof sharedFont === 'string' && sharedFont.trim() ? sharedFont.trim() : DEFAULT_FONT_STACK;
    console.debug('Debug: exporter.resolveFontFamily', { chosen, sharedFont }); // Debug: font family resolution trace
    return chosen;
  };

  function createInitialSvgStyle() {
    return {
      fill: '#000000',
      fillOpacity: 1,
      stroke: 'none',
      strokeOpacity: 1,
      strokeWidth: 1,
      strokeLinecap: 'butt',
      strokeLinejoin: 'miter',
      strokeMiterlimit: 4,
      strokeDasharray: null,
      strokeDashoffset: 0,
      fillRule: 'nonzero',
      opacity: 1,
      visibility: 'visible',
      display: 'inline',
      fontFamily: getDefaultFontFamily(),
      fontSize: 12,
      fontWeight: '400',
      fontStyle: 'normal',
      textAnchor: 'start',
      color: '#000000',
      clipPath: null
    };
  }

  const normalizeFontString = value => {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toLowerCase() : '';
  };

  const ensurePxValue = value => {
    if (value === undefined || value === null) return null;
    let trimmed = String(value).trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    let important = '';
    if (lower.endsWith('!important')) {
      important = ' !important';
      trimmed = trimmed.slice(0, lower.lastIndexOf('!important')).trim();
    }
    if (/px$/i.test(trimmed)) {
      return `${trimmed}${important}`;
    }
    if (NUMERIC_VALUE_RE.test(trimmed)) {
      if (trimmed === '0' || trimmed === '+0' || trimmed === '-0') {
        return `0px${important}`;
      }
      return `${trimmed}px${important}`;
    }
    return null;
  };

  function deriveElementStyle(element, parentStyle) {
    const style = parentStyle ? { ...parentStyle } : null;
    const overrides = {};
    applyStyleString(overrides, element.getAttribute('style'));
    const getValue = key => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }
      const attrValue = element.getAttribute(key);
      return attrValue !== null ? attrValue : null;
    };
    const ensureStyleObject = () => {
      if (style) return style;
      return createInitialSvgStyle();
    };

    const assignString = (key, attrName) => {
      const value = getValue(attrName);
      if (value === null || value === undefined || value === '' || value === 'inherit') {
        return;
      }
      const target = ensureStyleObject();
      target[key] = value;
    };

    const assignOpacity = (key, attrName) => {
      const value = getValue(attrName);
      if (value === null || value === undefined || value === 'inherit') {
        return;
      }
      const target = ensureStyleObject();
      target[key] = parseOpacity(value, target[key]);
    };

    const assignNumber = (key, attrName) => {
      const value = getValue(attrName);
      if (value === null || value === undefined || value === 'inherit') {
        return;
      }
      const target = ensureStyleObject();
      const parsed = parseSvgNumber(value, target[key]);
      if (parsed !== null && Number.isFinite(parsed)) {
        target[key] = parsed;
      }
    };

    const assignDashArray = attrName => {
      const value = getValue(attrName);
      if (value === null || value === undefined || value === 'inherit') {
        return;
      }
      const target = ensureStyleObject();
      target.strokeDasharray = parseDashArray(value);
    };

    assignString('fill', 'fill');
    assignOpacity('fillOpacity', 'fill-opacity');
    assignString('stroke', 'stroke');
    assignOpacity('strokeOpacity', 'stroke-opacity');
    assignNumber('strokeWidth', 'stroke-width');
    assignString('strokeLinecap', 'stroke-linecap');
    assignString('strokeLinejoin', 'stroke-linejoin');
    assignNumber('strokeMiterlimit', 'stroke-miterlimit');
    assignDashArray('stroke-dasharray');
    assignNumber('strokeDashoffset', 'stroke-dashoffset');
    assignString('fillRule', 'fill-rule');
    assignOpacity('opacity', 'opacity');
    assignString('display', 'display');
    assignString('visibility', 'visibility');
    assignString('fontFamily', 'font-family');
    assignNumber('fontSize', 'font-size');
    assignString('fontWeight', 'font-weight');
    assignString('fontStyle', 'font-style');
    assignString('textAnchor', 'text-anchor');
    assignString('color', 'color');
    assignString('clipPath', 'clip-path');

    return style || createInitialSvgStyle();
  }

  function applyNumericAttrWithPx(node, attr, counters, counterKey) {
    if (!node?.getAttribute || !node?.setAttribute) return false;
    const raw = node.getAttribute(attr);
    if (raw === null || raw === undefined) return false;
    const normalized = ensurePxValue(raw);
    if (!normalized || normalized === raw) return false;
    node.setAttribute(attr, normalized);
    if (counters && counterKey) {
      counters[counterKey] = (counters[counterKey] || 0) + 1;
    }
    return true;
  }

  function hasExplicitFontFamily(node) {
    if (!node || typeof node.getAttribute !== 'function') {
      return false;
    }
    const attr = node.getAttribute('font-family');
    if (attr && attr.trim()) {
      return true;
    }
    const styleAttr = node.getAttribute('style') || '';
    if (styleAttr) {
      const match = styleAttr.match(/font-family\s*:\s*([^;]+)/i);
      if (match && match[1] && match[1].trim()) {
        return true;
      }
    }
    if (node.style && node.style.fontFamily && node.style.fontFamily.trim()) {
      return true;
    }
    return false;
  }

  function applyFontFamilyAttr(node, fontFamily, counters, counterKey) {
    if (!node?.setAttribute || !fontFamily) return false;
    if (hasExplicitFontFamily(node)) {
      logDebug('applyFontFamilyAttr preserved explicit font', {
        tag: node.tagName || null,
        fontFamily: node.getAttribute('font-family') || node.style?.fontFamily || null
      });
      return false;
    }
    const current = node.getAttribute('font-family');
    if (normalizeFontString(current) === normalizeFontString(fontFamily)) {
      return false;
    }
    node.setAttribute('font-family', fontFamily);
    if (counters && counterKey) {
      counters[counterKey] = (counters[counterKey] || 0) + 1;
    }
    return true;
  }

  function prepareSvgForExport(svgNode, contextLabel) {
    if (!svgNode) {
      logDebug('prepareSvgForExport skipped', { contextLabel, reason: 'no svg node' });
      return null;
    }
    const counters = {
      namespaceAdded: 0,
      rootFontApplied: false,
      textFontApplied: 0,
      widthAttrNormalized: 0,
      heightAttrNormalized: 0,
      axisHandlesRemoved: 0
    };
    try {
      const defaultFont = getDefaultFontFamily();
      if (svgNode.setAttribute) {
        if (!svgNode.getAttribute('xmlns')) {
          svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          counters.namespaceAdded += 1;
        }
        if (!svgNode.getAttribute('xmlns:xlink')) {
          svgNode.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
          counters.namespaceAdded += 1;
        }
        if (defaultFont && applyFontFamilyAttr(svgNode, defaultFont)) {
          counters.rootFontApplied = true;
        }
      }

      applyNumericAttrWithPx(svgNode, 'width', counters, 'widthAttrNormalized');
      applyNumericAttrWithPx(svgNode, 'height', counters, 'heightAttrNormalized');

      const textNodes = svgNode.querySelectorAll ? svgNode.querySelectorAll('text, tspan, textPath') : [];
      if (defaultFont) {
        textNodes.forEach(node => {
          applyFontFamilyAttr(node, defaultFont, counters, 'textFontApplied');
        });
      }

      counters.axisHandlesRemoved = removeAxisInteractionHandles(svgNode);

      logDebug('prepareSvgForExport applied', {
        contextLabel,
        defaultFont,
        textNodeCount: textNodes.length,
        counters
      });
    } catch (err) {
      console.error('exporter prepareSvgForExport error', err);
    }
    return counters;
  }

  function resolveElement(ref) {
    if (!ref || !doc) return null;
    if (typeof ref === 'string') {
      const trimmed = ref.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('#') && doc.getElementById) {
        const byId = doc.getElementById(trimmed.slice(1));
        if (byId) return byId;
      }
      try {
        return doc.querySelector(trimmed);
      } catch (err) {
        warn('resolveElement selector error', { selector: trimmed, error: err?.message });
        return null;
      }
    }
    return ref || null;
  }

  function computeSvgDimensions(svgEl, fallbackWidth = 800, fallbackHeight = 400) {
    if (!svgEl) {
      return { width: fallbackWidth, height: fallbackHeight };
    }
    const viewBox = svgEl.viewBox?.baseVal;
    const widthCandidates = [
      viewBox?.width,
      svgEl.width?.baseVal?.value,
      parseDimension(svgEl.getAttribute?.('width')),
      svgEl.clientWidth,
      fallbackWidth
    ];
    const heightCandidates = [
      viewBox?.height,
      svgEl.height?.baseVal?.value,
      parseDimension(svgEl.getAttribute?.('height')),
      svgEl.clientHeight,
      fallbackHeight
    ];
    const width = widthCandidates.find(v => Number.isFinite(v) && v > 0) || fallbackWidth;
    const height = heightCandidates.find(v => Number.isFinite(v) && v > 0) || fallbackHeight;
    logDebug('computeSvgDimensions', {
      width,
      height,
      viewBoxWidth: viewBox?.width,
      viewBoxHeight: viewBox?.height,
      nodeId: svgEl.id || svgEl.getAttribute?.('data-name') || svgEl.tagName
    });
    return { width, height };
  }

  function blobToDataUrl(blob) {
    const Reader = global.FileReader || (typeof FileReader !== 'undefined' ? FileReader : null);
    if (!Reader) {
      warn('blobToDataUrl missing FileReader', {});
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      const reader = new Reader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = err => reject(err);
      reader.readAsDataURL(blob);
    });
  }

  function computeCombinedBBox(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    let bounds = null;
    nodes.forEach(node => {
      let box = null;
      try {
        box = typeof node?.getBBox === 'function' ? node.getBBox() : null;
      } catch (err) {
        debugLog('combineBBox getBBox error', { error: err?.message });
      }
      if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
        return;
      }
      if (!bounds) {
        bounds = { x: box.x, y: box.y, width: box.width, height: box.height };
        return;
      }
      const minX = Math.min(bounds.x, box.x);
      const minY = Math.min(bounds.y, box.y);
      const maxX = Math.max(bounds.x + bounds.width, box.x + box.width);
      const maxY = Math.max(bounds.y + bounds.height, box.y + box.height);
      bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    });
    return bounds;
  }

  function inflateBox(box, padding = 0) {
    const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
    const width = Math.max(1, (box?.width ?? 0) + pad * 2);
    const height = Math.max(1, (box?.height ?? 0) + pad * 2);
    return {
      x: (box?.x ?? 0) - pad,
      y: (box?.y ?? 0) - pad,
      width,
      height
    };
  }

  function collectDefs(svgEl) {
    if (!svgEl || typeof svgEl.querySelectorAll !== 'function') return [];
    const defs = svgEl.querySelectorAll('defs');
    return Array.from(defs || []);
  }

  async function buildHybridSvg(svgEl, options = {}) {
    if (!svgEl) {
      logDebug('buildHybridSvg skipped', { contextLabel: options.contextLabel, reason: 'no element' });
      return null;
    }
    const layers = Array.isArray(options.layers) ? options.layers : [];
    if (!layers.length) {
      logDebug('buildHybridSvg skipped', { contextLabel: options.contextLabel, reason: 'no layers' });
      return null;
    }
    const baseDoc = svgEl.ownerDocument || doc;
    const NS = 'http://www.w3.org/2000/svg';
    const defsTemplates = collectDefs(svgEl);
    const paddingDefault = Number.isFinite(options.padding) ? Math.max(0, options.padding) : 0;
    const scaleDefault = Number.isFinite(options.rasterScale) && options.rasterScale > 0 ? options.rasterScale : 1;
    const hybridSvg = typeof svgEl.cloneNode === 'function' ? svgEl.cloneNode(true) : null;
    if (!hybridSvg) {
      warn('buildHybridSvg clone failed', { contextLabel: options.contextLabel });
      return null;
    }
    const layerSummaries = [];
    for (const layer of layers) {
      const selector = typeof layer?.selector === 'string' ? layer.selector : '';
      if (!selector) {
        warn('buildHybridSvg layer missing selector', { contextLabel: options.contextLabel });
        continue;
      }
      let targets = [];
      try {
        targets = Array.from(svgEl.querySelectorAll(selector));
      } catch (err) {
        warn('buildHybridSvg selector error', { contextLabel: options.contextLabel, selector, error: err?.message });
        continue;
      }
      if (!targets.length) {
        debugLog('buildHybridSvg layer empty', { contextLabel: options.contextLabel, selector });
        continue;
      }
      const bbox = computeCombinedBBox(targets);
      if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) {
        warn('buildHybridSvg invalid bbox', { contextLabel: options.contextLabel, selector });
        continue;
      }
      const padding = Number.isFinite(layer.padding) ? Math.max(0, layer.padding) : paddingDefault;
      const scale = Number.isFinite(layer.scale) && layer.scale > 0 ? layer.scale : scaleDefault;
      const padded = inflateBox(bbox, padding);
      const rasterSvg = baseDoc?.createElementNS ? baseDoc.createElementNS(NS, 'svg') : null;
      if (!rasterSvg) {
        warn('buildHybridSvg raster svg unavailable', { contextLabel: options.contextLabel });
        break;
      }
      rasterSvg.setAttribute('xmlns', NS);
      rasterSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      rasterSvg.setAttribute('viewBox', `${padded.x} ${padded.y} ${padded.width} ${padded.height}`);
      rasterSvg.setAttribute('width', String(Math.max(1, padded.width * scale)));
      rasterSvg.setAttribute('height', String(Math.max(1, padded.height * scale)));
      defsTemplates.forEach(def => {
        try {
          rasterSvg.appendChild(def.cloneNode(true));
        } catch (err) {
          debugLog('buildHybridSvg defs clone error', { error: err?.message });
        }
      });
      const layerGroup = baseDoc.createElementNS(NS, 'g');
      const label = layer?.label || selector;
      layerGroup.setAttribute('data-export-raster-source', label);
      targets.forEach(node => {
        try {
          layerGroup.appendChild(node.cloneNode(true));
        } catch (err) {
          debugLog('buildHybridSvg node clone error', { error: err?.message });
        }
      });
      rasterSvg.appendChild(layerGroup);
      const pngBlob = await svgElementToPngBlob(rasterSvg, {
        fallbackWidth: padded.width * scale,
        fallbackHeight: padded.height * scale,
        contextLabel: `${options.contextLabel || 'hybrid-svg'}-${label}`,
        dpi: options.dpi,
        dpiX: options.dpiX,
        dpiY: options.dpiY
      });
      if (!pngBlob) {
        warn('buildHybridSvg raster blob missing', { contextLabel: options.contextLabel, label });
        continue;
      }
      const dataUrl = await blobToDataUrl(pngBlob).catch(err => {
        warn('buildHybridSvg dataurl error', { contextLabel: options.contextLabel, error: err?.message });
        return null;
      });
      if (!dataUrl) {
        continue;
      }
      const imageNode = baseDoc.createElementNS(NS, 'image');
      imageNode.setAttribute('x', String(padded.x));
      imageNode.setAttribute('y', String(padded.y));
      imageNode.setAttribute('width', String(padded.width));
      imageNode.setAttribute('height', String(padded.height));
      imageNode.setAttribute('preserveAspectRatio', 'none');
      imageNode.setAttribute('data-export-raster', label);
      imageNode.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
      imageNode.setAttribute('href', dataUrl);
      const cloneTargets = Array.from(hybridSvg.querySelectorAll(selector));
      const parent = cloneTargets[0]?.parentNode || hybridSvg;
      parent.insertBefore(imageNode, cloneTargets[0] || null);
      cloneTargets.forEach(node => {
        if (node?.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
      layerSummaries.push({
        label,
        selector,
        nodeCount: targets.length,
        bbox,
        paddedBBox: padded,
        scale,
        pngBytes: pngBlob.size
      });
    }
    if (!layerSummaries.length) {
      warn('buildHybridSvg no layers rasterized', { contextLabel: options.contextLabel });
      return null;
    }
    debugLog('buildHybridSvg complete', { contextLabel: options.contextLabel, layers: layerSummaries });
    return { svg: hybridSvg, layers: layerSummaries };
  }

  async function buildHybridSvgExportPayload(svgEl, options = {}) {
    const hybrid = await buildHybridSvg(svgEl, options);
    if (!hybrid?.svg) {
      return null;
    }
    const contextLabel = options.contextLabel || 'hybrid-svg';
    const baseName = options.fileName || `${options.baseFileName || 'chart'}${options.fileNameSuffix || '-hybrid'}`;
    const xml = svgToXml(hybrid.svg, `${contextLabel}-xml`);
    if (!xml) {
      return null;
    }
    const payload = buildSvgExportPayload(xml, {
      fileName: baseName,
      contextLabel: `${contextLabel}-payload`,
      includeHtmlPreview: options.includeHtmlPreview !== false
    });
    if (payload) {
      payload.layers = hybrid.layers;
    }
    return payload;
  }

  function getSerializeFn() {
    if (typeof Shared.serializeCleanSVG === 'function') {
      return Shared.serializeCleanSVG;
    }
    if (typeof global.serializeCleanSVG === 'function') {
      return global.serializeCleanSVG;
    }
    const Serializer = global.XMLSerializer || (typeof XMLSerializer !== 'undefined' ? XMLSerializer : null);
    const serializer = Serializer ? new Serializer() : null;
    return svgEl => serializer ? serializer.serializeToString(svgEl) : '';
  }
  
  // Groups all drawable children into a single <g> so paste into Inkscape keeps them together.
  // Keeps <defs>, <title>, <desc> at the top level, and wraps everything else.
  // Keeps the grouping lightweight so stroke widths render identically between preview and export.
  function groupNodeForPaste(svgEl, opts = {}) {
    if (!svgEl || typeof svgEl.querySelectorAll !== 'function') return { grouped: false, moved: 0 };
    // Opt-out flag if you ever want to disable this quickly.
    const enabled = opts.enabled ?? (Shared?.exporter?.GROUP_FOR_PASTE ?? true);
    if (!enabled) return { grouped: false, moved: 0 };

    // If already has a single top-level <g> that holds all drawable nodes, skip.
    const topGroups = Array.from(svgEl.children).filter(n => n.tagName && n.tagName.toLowerCase() === 'g');
    const nonMeta = Array.from(svgEl.children).filter(n => !/^(defs|title|desc)$/i.test(n.tagName || ''));
    if (topGroups.length === 1 && topGroups[0] === nonMeta[0]) {
      logDebug('groupNodeForPaste skipped existing top-level group', { moved: 0 });
      return { grouped: false, moved: 0 };
    }

    const g = svgEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', 'export-group');

    let moved = 0;
    // Move every child except defs/title/desc into the group, preserving order
    const toMove = Array.from(svgEl.childNodes).filter(n => {
      const t = (n.tagName || '').toLowerCase();
      return !(t === 'defs' || t === 'title' || t === 'desc');
    });
    toMove.forEach(n => {
      g.appendChild(n); // this removes from svgEl
      moved += 1;
    });

    // Insert group at end so defs stay first
    svgEl.appendChild(g);

    logDebug('groupNodeForPaste complete', { moved, hasDefs: !!svgEl.querySelector('defs') });
    return { grouped: true, moved };
  }


  function svgToXml(svgEl, contextLabel) {
    if (!svgEl) {
      logDebug('svgToXml skipped', { contextLabel, reason: 'no element' });
      return '';
    }
    try {
      const serialize = getSerializeFn();
      const canUseOptions = serialize === Shared.serializeCleanSVG || serialize === global.serializeCleanSVG;
      let xml = '';
      let prepStats = null;

      const runPrepare = node => {
        try {
          // Your existing normalization
          prepStats = prepareSvgForExport(node, contextLabel) || null;
          // NEW — group all drawable children so paste into Inkscape keeps consistent stroke widths
          const grp = groupNodeForPaste(node, { enabled: Shared?.exporter?.GROUP_FOR_PASTE ?? true });
          logDebug('svgToXml group-for-paste', { contextLabel, grouped: grp.grouped, moved: grp.moved });
        } catch (prepErr) {
          console.error('exporter svgToXml prepare error', prepErr);
        }
      };

      if (canUseOptions) {
        // If your serializer supports hooks, do the grouping on the live node it serializes
        xml = serialize(svgEl, { beforeSanitize: runPrepare });
      } else {
        // Fallback — clone then prepare and group the clone
        const clone = typeof svgEl.cloneNode === 'function' ? svgEl.cloneNode(true) : svgEl;
        if (clone === svgEl) {
          logDebug('svgToXml using original element clone fallback', { contextLabel });
        }
        runPrepare(clone);
        xml = serialize(clone);
      }
      logDebug('svgToXml complete', { contextLabel, length: xml?.length || 0, prepareStats: prepStats });
      return xml;
    } catch (err) {
      console.error('exporter svgToXml error', err);
      return '';
    }
  }

  function ensureSvgFileName(name) {
    const base = typeof name === 'string' ? name.trim() : '';
    if (!base) {
      console.debug('Debug: exporter ensureSvgFileName fallback', { provided: name }); // Debug: filename fallback trace
      return 'chart.svg';
    }
    const lower = base.toLowerCase();
    if (lower.endsWith('.svg')) {
      return base;
    }
    return `${base}.svg`;
  }

  function escapeHtmlAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildSvgExportPayload(xml, options = {}) {
    if (!xml) {
      logDebug('buildSvgExportPayload skipped', { contextLabel: options.contextLabel, reason: 'no xml' });
      return null;
    }
    const { fileName = 'chart.svg', contextLabel = 'svg-export', includeHtmlPreview = true } = options;
    const safeName = ensureSvgFileName(fileName);
    const mime = `${SVG_MIME_TYPE};charset=utf-8`;
    const FileCtor = global.File || (typeof File !== 'undefined' ? File : null);
    const BlobCtor = global.Blob || (typeof Blob !== 'undefined' ? Blob : null);
    let svgBlob = null;
    if (FileCtor) {
      try {
        svgBlob = new FileCtor([xml], safeName, { type: mime });
        console.debug('Debug: exporter buildSvgExportPayload file created', { contextLabel, name: safeName, size: svgBlob.size }); // Debug: svg file payload trace
      } catch (err) {
        console.debug('Debug: exporter buildSvgExportPayload file fallback', { contextLabel, error: err?.message }); // Debug: svg file fallback trace
      }
    }
    if (!svgBlob && BlobCtor) {
      svgBlob = new BlobCtor([xml], { type: mime });
      console.debug('Debug: exporter buildSvgExportPayload blob created', { contextLabel, size: svgBlob?.size || 0 }); // Debug: svg blob payload trace
    }
    if (!svgBlob) {
      warn('buildSvgExportPayload blob unavailable', { contextLabel });
      return null;
    }
    const clipboardMap = { [SVG_MIME_TYPE]: svgBlob };
    if (BlobCtor) {
      try {
        clipboardMap['text/plain'] = new BlobCtor([xml], { type: 'text/plain' });
      } catch (err) {
        warn('buildSvgExportPayload text blob error', { contextLabel, error: err?.message });
      }
    } else {
      warn('buildSvgExportPayload text blob skipped', { contextLabel });
    }
    if (includeHtmlPreview && BlobCtor) {
      try {
        const encoded = encodeURIComponent(xml);
        const alt = escapeHtmlAttr(safeName);
        const html = `<img src="data:${SVG_MIME_TYPE};charset=utf-8,${encoded}" alt="${alt}">`;
        clipboardMap['text/html'] = new BlobCtor([html], { type: 'text/html' });
      } catch (err) {
        warn('buildSvgExportPayload html blob error', { contextLabel, error: err?.message });
      }
    }
    logDebug('buildSvgExportPayload ready', {
      contextLabel,
      fileName: safeName,
      includeHtmlPreview,
      xmlLength: xml.length,
      mapTypes: Object.keys(clipboardMap)
    });
    return { fileName: safeName, svgBlob, clipboardMap };
  }

  async function renderSvgStringToCanvas(xml, options = {}) {
    const { width, height, fallbackWidth = 800, fallbackHeight = 400, contextLabel } = options;
    if (!xml) {
      logDebug('renderSvgStringToCanvas skipped', { contextLabel, reason: 'empty xml' });
      return null;
    }
    if (!global.Image || !doc?.createElement) {
      warn('renderSvgStringToCanvas unsupported', { contextLabel });
      return null;
    }
    const img = new Image();
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const loadPromise = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = err => reject(err || new Error('image decode error'));
    });
    img.src = svgUrl;
    if (typeof img.decode === 'function') {
      try {
        await img.decode();
      } catch (err) {
        console.error('exporter renderSvg decode error', err);
        try {
          await loadPromise;
        } catch (loadErr) {
          console.error('exporter renderSvg image load error', loadErr);
          return null;
        }
      }
    } else {
      try {
        await loadPromise;
      } catch (err) {
        console.error('exporter renderSvg image load error', err);
        return null;
      }
    }
    const resolvedWidth = Number.isFinite(width) && width > 0 ? width : (img.width || fallbackWidth);
    const resolvedHeight = Number.isFinite(height) && height > 0 ? height : (img.height || fallbackHeight);
    const canvas = doc.createElement('canvas');
    canvas.width = resolvedWidth;
    canvas.height = resolvedHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      warn('renderSvgStringToCanvas missing context', { contextLabel });
      canvas.width = 0;
      canvas.height = 0;
      return null;
    }
    if (options.backgroundColor) {
      const parsed = parseCssColor(options.backgroundColor);
      if (parsed?.css) {
        ctx.save();
        ctx.fillStyle = parsed.css;
        ctx.fillRect(0, 0, resolvedWidth, resolvedHeight);
        ctx.restore();
      }
    }
    ctx.drawImage(img, 0, 0, resolvedWidth, resolvedHeight);
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      console.debug('Debug: exporter renderSvgStringToCanvas ready', {
        contextLabel,
        width: resolvedWidth,
        height: resolvedHeight
      });
    }
    const release = () => {
      canvas.width = 0;
      canvas.height = 0;
    };
    return { canvas, width: resolvedWidth, height: resolvedHeight, release };
  }

  function resolveDpiValue(value) {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 96;
  }

  function toPixelsPerMeter(dpi) {
    const resolved = resolveDpiValue(dpi);
    return Math.max(1, Math.round(resolved / 0.0254));
  }

  function createDibFromCanvas(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    const width = canvas.width | 0;
    const height = canvas.height | 0;
    if (width <= 0 || height <= 0) {
      return null;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (err) {
      console.error('exporter createDibFromCanvas imageData error', err);
      return null;
    }
    const src = imageData.data;
    const rowStride = width * 4;
    const dest = new Uint8Array(rowStride * height);
    const bg = options.backgroundColor ? parseCssColor(options.backgroundColor) : null;
    const bgR = bg?.r ?? 255;
    const bgG = bg?.g ?? 255;
    const bgB = bg?.b ?? 255;
    const applyBackground = !!bg && bg.a > 0;
    for (let y = 0; y < height; y += 1) {
      const srcOffset = y * rowStride;
      const destOffset = (height - 1 - y) * rowStride;
      for (let x = 0; x < rowStride; x += 4) {
        const sIndex = srcOffset + x;
        const dIndex = destOffset + x;
        if (applyBackground) {
          const alpha = src[sIndex + 3] / 255;
          const inv = 1 - alpha;
          const r = Math.round(src[sIndex] * alpha + bgR * inv);
          const g = Math.round(src[sIndex + 1] * alpha + bgG * inv);
          const b = Math.round(src[sIndex + 2] * alpha + bgB * inv);
          dest[dIndex] = b;
          dest[dIndex + 1] = g;
          dest[dIndex + 2] = r;
          dest[dIndex + 3] = 255;
        } else {
          dest[dIndex] = src[sIndex + 2];
          dest[dIndex + 1] = src[sIndex + 1];
          dest[dIndex + 2] = src[sIndex];
          dest[dIndex + 3] = src[sIndex + 3];
        }
      }
    }
    const headerBuffer = new ArrayBuffer(40);
    const header = new DataView(headerBuffer);
    header.setUint32(0, 40, true);
    header.setInt32(4, width, true);
    header.setInt32(8, height, true);
    header.setUint16(12, 1, true);
    header.setUint16(14, 32, true);
    header.setUint32(16, 0, true);
    header.setUint32(20, dest.byteLength, true);
    const ppmX = toPixelsPerMeter(options.dpiX || options.dpi);
    const ppmY = toPixelsPerMeter(options.dpiY || options.dpi);
    header.setInt32(24, ppmX, true);
    header.setInt32(28, ppmY, true);
    header.setUint32(32, 0, true);
    header.setUint32(36, 0, true);
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      console.debug('Debug: exporter createDibFromCanvas', { width, height, ppmX, ppmY });
    }
    return {
      width,
      height,
      headerBytes: new Uint8Array(headerBuffer),
      pixelBytes: dest
    };
  }

  function canvasToEmfBlob(canvas, options = {}) {
    if (!canvas || typeof Blob !== 'function') {
      return null;
    }
    const dib = createDibFromCanvas(canvas, options);
    if (!dib) {
      return null;
    }
    const { width, height, headerBytes, pixelBytes } = dib;
    const dibHeaderSize = headerBytes.byteLength;
    const dibBitsSize = pixelBytes.byteLength;
    const stretchRecordSize = 80 + dibHeaderSize + dibBitsSize;
    const eofRecordSize = 20;
    const headerSize = 108;
    const totalSize = headerSize + stretchRecordSize + eofRecordSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;
    const dpiX = resolveDpiValue(options.dpiX || options.dpi);
    const dpiY = resolveDpiValue(options.dpiY || options.dpi);
    const frameWidth = Math.round((width * 2540) / dpiX);
    const frameHeight = Math.round((height * 2540) / dpiY);
    const mmWidth = Math.round((width * 25.4) / dpiX);
    const mmHeight = Math.round((height * 25.4) / dpiY);
    const microWidth = Math.round((width * 25400) / dpiX);
    const microHeight = Math.round((height * 25400) / dpiY);
    const writeUint32 = value => {
      view.setUint32(offset, value >>> 0, true);
      offset += 4;
    };
    const writeInt32 = value => {
      view.setInt32(offset, value | 0, true);
      offset += 4;
    };
    const writeUint16 = value => {
      view.setUint16(offset, value & 0xFFFF, true);
      offset += 2;
    };
    writeUint32(EMR_HEADER);
    writeUint32(headerSize);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width);
    writeInt32(height);
    writeInt32(0);
    writeInt32(0);
    writeInt32(frameWidth);
    writeInt32(frameHeight);
    writeUint32(0x464D4520);
    writeUint32(0x00010000);
    writeUint32(totalSize);
    writeUint32(3);
    writeUint16(1);
    writeUint16(0);
    writeUint32(0);
    writeUint32(0);
    writeUint32(0);
    writeInt32(width);
    writeInt32(height);
    writeInt32(mmWidth);
    writeInt32(mmHeight);
    writeUint32(0);
    writeUint32(0);
    writeUint32(0);
    writeInt32(microWidth);
    writeInt32(microHeight);
    const stretchOffset = offset;
    writeUint32(EMR_STRETCHDIBITS);
    writeUint32(stretchRecordSize);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width);
    writeInt32(height);
    writeInt32(0);
    writeInt32(0);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width);
    writeInt32(height);
    writeUint32(80);
    writeUint32(dibHeaderSize);
    const bitsOffset = 80 + dibHeaderSize;
    writeUint32(bitsOffset);
    writeUint32(dibBitsSize);
    writeUint32(DIB_RGB_COLORS);
    writeUint32(SRCCOPY);
    writeInt32(width);
    writeInt32(height);
    new Uint8Array(buffer, stretchOffset + 80, dibHeaderSize).set(headerBytes);
    new Uint8Array(buffer, stretchOffset + bitsOffset, dibBitsSize).set(pixelBytes);
    offset = stretchOffset + stretchRecordSize;
    writeUint32(EMR_EOF);
    writeUint32(eofRecordSize);
    writeUint32(0);
    writeUint32(0);
    writeUint32(eofRecordSize);
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      console.debug('Debug: exporter canvasToEmfBlob complete', { width, height, totalSize });
    }
    try {
      return new Blob([buffer], { type: EMF_MIME_TYPE });
    } catch (err) {
      console.error('exporter canvasToEmfBlob blob error', err);
      return null;
    }
  }

  async function svgStringToEmfBlob(xml, options = {}) {
    const scene = buildVectorSceneFromSvg(xml, options);
    if (scene) {
      const vectorBlob = vectorSceneToEmfBlob(scene, options);
      if (vectorBlob) {
        debugLog('svgStringToEmfBlob vector', { width: scene.width, height: scene.height });
        return vectorBlob;
      }
      debugLog('svgStringToEmfBlob vector fallback', { reason: 'vector blob unavailable' });
    }
    const rendered = await renderSvgStringToCanvas(xml, options);
    if (!rendered) {
      return null;
    }
    try {
      return canvasToEmfBlob(rendered.canvas, options);
    } finally {
      rendered.release();
    }
  }

  async function svgStringToPngBlob(xml, options = {}) {
    const rendered = await renderSvgStringToCanvas(xml, options);
    if (!rendered) {
      return null;
    }
    let blob = null;
    try {
      blob = await new Promise((resolve, reject) => {
        rendered.canvas.toBlob(b => {
          if (b) resolve(b);
          else reject(new Error('canvas toBlob produced empty blob'));
        }, 'image/png');
      });
    } catch (err) {
      console.error('exporter canvas toBlob error', err);
      blob = null;
    } finally {
      rendered.release();
    }
    logDebug('svgStringToPngBlob complete', {
      contextLabel: options.contextLabel,
      width: rendered?.width,
      height: rendered?.height,
      hasBlob: !!blob
    });
    return blob;
  }

  async function svgElementToPngBlob(svgEl, options = {}) {
    if (!svgEl) {
      logDebug('svgElementToPngBlob skipped', { contextLabel: options.contextLabel, reason: 'no element' });
      return null;
    }
    const xml = svgToXml(svgEl, options.contextLabel);
    if (!xml) return null;
    const dims = computeSvgDimensions(svgEl, options.fallbackWidth, options.fallbackHeight);
    return svgStringToPngBlob(xml, {
      width: dims.width,
      height: dims.height,
      fallbackWidth: dims.width,
      fallbackHeight: dims.height,
      contextLabel: options.contextLabel,
      dpi: options.dpi,
      dpiX: options.dpiX,
      dpiY: options.dpiY
    });
  }

  async function svgElementToEmfBlob(svgEl, options = {}) {
    if (!svgEl) {
      logDebug('svgElementToEmfBlob skipped', { contextLabel: options.contextLabel, reason: 'no element' });
      return null;
    }
    const xml = svgToXml(svgEl, options.contextLabel);
    if (!xml) return null;
    const dims = computeSvgDimensions(svgEl, options.fallbackWidth, options.fallbackHeight);
    let backgroundColor = resolveBackgroundColor(options.backgroundColor, svgEl);
    if (!backgroundColor) {
      backgroundColor = '#ffffff';
    }
    return svgStringToEmfBlob(xml, {
      width: dims.width,
      height: dims.height,
      fallbackWidth: dims.width,
      fallbackHeight: dims.height,
      contextLabel: options.contextLabel,
      dpi: options.dpi,
      dpiX: options.dpiX,
      dpiY: options.dpiY,
      backgroundColor
    });
  }

  function downloadBlob(blob, fileName, contextLabel) {
    if (!blob) {
      logDebug('downloadBlob skipped', { contextLabel, reason: 'no blob' });
      return;
    }
    if (!doc?.createElement || !doc.body) {
      warn('downloadBlob unavailable', { contextLabel });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName || 'download';
    doc.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout?.(() => URL.revokeObjectURL(url), 4000);
    logDebug('downloadBlob triggered', { contextLabel, fileName });
  }

  async function copyBlobMap(blobMap, contextLabel) {
    if (!blobMap || !Object.keys(blobMap).length) {
      logDebug('copyBlobMap skipped', { contextLabel, reason: 'empty map' });
      return false;
    }
    const nav = global.navigator;
    if (!nav?.clipboard?.write || typeof global.ClipboardItem !== 'function') {
      warn('copyBlobMap clipboard unavailable', { contextLabel });
      return false;
    }
    const supportedEntries = Object.entries(blobMap).filter(([type]) => clipboardTypeSupports(type));
    if (!supportedEntries.length) {
      warn('copyBlobMap no supported types', { contextLabel, requestedTypes: Object.keys(blobMap) });
      return false;
    }
    const filteredMap = Object.fromEntries(supportedEntries);
    let success = false;
    try {
      const item = new global.ClipboardItem(filteredMap);
      await nav.clipboard.write([item]);
      success = true;
    } catch (err) {
      console.error('exporter clipboard write error', err);
      success = false;
    }
    if (success) {
      logDebug('copyBlobMap success', { contextLabel, types: Object.keys(filteredMap) });
    }
    return success;
  }

  function closeAllMenus(exceptState) {
    Array.from(openStates).forEach(state => {
      if (state !== exceptState) {
        setMenuOpen(state, false);
      }
    });
  }

  function setMenuOpen(state, open) {
    if (!state) return;
    if (open) {
      closeAllMenus(state);
      state.wrapper.classList.add('is-open');
      state.menu.hidden = false;
      state.trigger.setAttribute('aria-expanded', 'true');
      openStates.add(state);
    } else {
      state.wrapper.classList.remove('is-open');
      state.menu.hidden = true;
      state.trigger.setAttribute('aria-expanded', 'false');
      openStates.delete(state);
    }
    logDebug('menuToggle', { contextLabel: state.contextLabel, actionKey: state.actionKey, open });
  }

  function ensureDocumentListeners() {
    if (listenersBound || !doc?.addEventListener) return;
    doc.addEventListener('click', event => {
      for (const state of Array.from(openStates)) {
        if (state.wrapper.contains(event.target)) {
          continue;
        }
        setMenuOpen(state, false);
      }
    });
    doc.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeAllMenus();
      }
    });
    listenersBound = true;
    logDebug('documentListeners bound', {});
  }

  function createDropdown(container, action, contextLabel) {
    if (!doc?.createElement) return null;
    const wrapper = doc.createElement('div');
    wrapper.className = 'export-dropdown';
    wrapper.dataset.actionKey = action.key;
    wrapper.dataset.contextLabel = contextLabel;

    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn export-trigger';
    trigger.textContent = `${action.label} \u25BE`;
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');

    const menu = doc.createElement('div');
    menu.className = 'export-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    action.formats.forEach(format => {
      const optionBtn = doc.createElement('button');
      optionBtn.type = 'button';
      optionBtn.className = 'btn export-option';
      optionBtn.textContent = format.label;
      optionBtn.setAttribute('role', 'menuitem');
      optionBtn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        closeAllMenus();
        logDebug('optionSelected', { contextLabel, action: action.key, format: format.key });
        Promise.resolve()
          .then(() => format.handler())
          .catch(err => console.error('exporter option handler error', err));
      });
      menu.appendChild(optionBtn);
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    const state = { wrapper, trigger, menu, contextLabel, actionKey: action.key };
    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = !wrapper.classList.contains('is-open');
      setMenuOpen(state, nextOpen);
    });

    container.appendChild(wrapper);
    return state;
  }

  function mountControls({ container, actions, contextLabel }) {
    const host = resolveElement(container);
    if (!host) {
      logDebug('mountControls skipped', { contextLabel, reason: 'no host' });
      return;
    }
    ensureDocumentListeners();
    host.innerHTML = '';
    host.classList.add('export-control-host');
    const states = [];
    actions.forEach(action => {
      const state = createDropdown(host, action, contextLabel);
      if (state) states.push(state);
    });
    logDebug('mountControls complete', { contextLabel, dropdowns: states.length });
  }

  function createSvgActions(config) {
    const {
      getSvg,
      fileName = 'chart',
      contextLabel = 'svg-export',
      fallbackWidth,
      fallbackHeight,
      dpi,
      dpiX,
      dpiY,
      hybridOptions
    } = config;
    const hybridConfig = hybridOptions && Array.isArray(hybridOptions.layers) && hybridOptions.layers.length
      ? hybridOptions
      : null;
    const resolveSvg = () => {
      try {
        return typeof getSvg === 'function' ? getSvg() : null;
      } catch (err) {
        console.error('exporter getSvg error', err);
        return null;
      }
    };
    async function handle(mode, format) {
      const svgEl = resolveSvg();
      if (!svgEl) {
        logDebug('svgActions missing element', { contextLabel, format, mode });
        return;
      }
      if (format === 'png') {
        const blob = await svgElementToPngBlob(svgEl, {
          contextLabel: `${contextLabel}-png`,
          fallbackWidth,
          fallbackHeight,
          dpi,
          dpiX,
          dpiY
        });
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.png`, `${contextLabel}-png`);
        } else {
          const copied = await copyBlobMap({ 'image/png': blob }, `${contextLabel}-png`);
          if (!copied) {
            warn('svgActions png copy unavailable', { contextLabel: `${contextLabel}-png` });
          }
        }
      } else if (format === 'svg') {
        const xml = svgToXml(svgEl, `${contextLabel}-svg`);
        if (!xml) return;
        const payload = buildSvgExportPayload(xml, {
          fileName: `${fileName}.svg`,
          contextLabel: `${contextLabel}-svg`,
          includeHtmlPreview: true
        });
        if (!payload) return;
        console.debug('Debug: exporter svg action payload ready', {
          contextLabel: `${contextLabel}-svg`,
          mode,
          name: payload.fileName,
          clipboardTypes: Object.keys(payload.clipboardMap || {})
        }); // Debug: svg action payload trace
        if (mode === 'download') {
          downloadBlob(payload.svgBlob, payload.fileName, `${contextLabel}-svg`);
        } else {
          const copied = await copyBlobMap(payload.clipboardMap, `${contextLabel}-svg`);
          if (!copied) {
            warn('svgActions svg copy unavailable', { contextLabel: `${contextLabel}-svg` });
          }
        }
      } else if (format === 'svg-hybrid') {
        if (!hybridConfig) {
          warn('svgActions hybrid missing config', { contextLabel });
          return;
        }
        if (mode !== 'download') {
          warn('svgActions hybrid copy unsupported', { contextLabel });
          return;
        }
        const payload = await buildHybridSvgExportPayload(svgEl, {
          ...hybridConfig,
          baseFileName: hybridConfig.baseFileName || fileName,
          contextLabel: `${contextLabel}-hybrid`
        });
        if (!payload) {
          warn('svgActions hybrid payload missing', { contextLabel });
          return handle(mode, 'svg');
        }
        downloadBlob(payload.svgBlob, payload.fileName, `${contextLabel}-hybrid`);
      } else if (format === 'emf') {
        const blob = await svgElementToEmfBlob(svgEl, {
          contextLabel: `${contextLabel}-emf`,
          fallbackWidth,
          fallbackHeight,
          dpi,
          dpiX,
          dpiY
        });
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.emf`, `${contextLabel}-emf`);
        } else {
          const map = { [EMF_MIME_TYPE]: blob, [EMF_MIME_FALLBACK]: blob };
          const copied = await copyBlobMap(map, `${contextLabel}-emf`);
          if (!copied) {
            warn('svgActions emf copy unsupported', { contextLabel: `${contextLabel}-emf` });
            downloadBlob(blob, `${fileName}.emf`, `${contextLabel}-emf`);
            if (typeof global.alert === 'function') {
              global.alert('Copying EMF images to the clipboard is not supported in this browser. The EMF file was downloaded instead.');
            }
          }
        }
      }
    }
    return [
      {
        key: 'download',
        label: 'Download',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('download', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('download', 'svg') },
          ...(hybridConfig ? [{ key: 'svg-hybrid', label: hybridConfig.label || 'SVG (rasterized)', handler: () => handle('download', 'svg-hybrid') }] : []),
          { key: 'emf', label: 'EMF', handler: () => handle('download', 'emf') }
        ]
      },
      {
        key: 'copy',
        label: 'Copy',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('copy', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('copy', 'svg') },
          { key: 'emf', label: 'EMF', handler: () => handle('copy', 'emf') }
        ]
      }
    ];
  }

  function createCanvasActions(config) {
    const { getCanvas, getSvgString, fileName = 'chart', contextLabel = 'canvas-export', dpi, dpiX, dpiY } = config;
    const resolveCanvas = () => {
      try {
        return typeof getCanvas === 'function' ? getCanvas() : null;
      } catch (err) {
        console.error('exporter getCanvas error', err);
        return null;
      }
    };
    const resolveSvgString = async () => {
      if (typeof getSvgString !== 'function') {
        warn('canvasActions missing getSvgString', { contextLabel });
        return '';
      }
      try {
        return await Promise.resolve(getSvgString());
      } catch (err) {
        console.error('exporter canvas getSvgString error', err);
        return '';
      }
    };
    async function getPngBlob() {
      const canvas = resolveCanvas();
      if (!canvas) {
        logDebug('canvasActions missing canvas', { contextLabel });
        return null;
      }
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => {
          if (b) resolve(b);
          else reject(new Error('canvas toBlob produced empty blob'));
        }, 'image/png');
      }).catch(err => {
        console.error('exporter canvas toBlob error', err);
        return null;
      });
      if (blob) logDebug('canvasActions png ready', { contextLabel });
      return blob;
    }
    async function getEmfBlob() {
      const canvas = resolveCanvas();
      if (!canvas) {
        logDebug('canvasActions missing canvas', { contextLabel, format: 'emf' });
        return null;
      }
      let backgroundSource = config.backgroundColor;
      if (!backgroundSource && typeof config.getBackgroundColor === 'function') {
        backgroundSource = config.getBackgroundColor();
      }
      let backgroundColor = resolveBackgroundColor(backgroundSource, canvas);
      if (!backgroundColor) {
        backgroundColor = '#ffffff';
      }
      const blob = canvasToEmfBlob(canvas, { dpi, dpiX, dpiY, backgroundColor });
      if (blob && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
        console.debug('Debug: exporter canvasActions emf ready', { contextLabel });
      }
      return blob;
    }

    async function handle(mode, format) {
      if (format === 'png') {
        const blob = await getPngBlob();
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.png`, `${contextLabel}-png`);
        } else {
          const copied = await copyBlobMap({ 'image/png': blob }, `${contextLabel}-png`);
          if (!copied) {
            warn('canvasActions png copy unavailable', { contextLabel: `${contextLabel}-png` });
          }
        }
      } else if (format === 'svg') {
        const xml = await resolveSvgString();
        if (!xml) return;
        const payload = buildSvgExportPayload(xml, {
          fileName: `${fileName}.svg`,
          contextLabel: `${contextLabel}-svg`,
          includeHtmlPreview: true
        });
        if (!payload) return;
        console.debug('Debug: exporter canvas svg payload ready', {
          contextLabel: `${contextLabel}-svg`,
          mode,
          name: payload.fileName,
          clipboardTypes: Object.keys(payload.clipboardMap || {})
        }); // Debug: canvas svg payload trace
        if (mode === 'download') {
          downloadBlob(payload.svgBlob, payload.fileName, `${contextLabel}-svg`);
        } else {
          const copied = await copyBlobMap(payload.clipboardMap, `${contextLabel}-svg`);
          if (!copied) {
            warn('canvasActions svg copy unavailable', { contextLabel: `${contextLabel}-svg` });
          }
        }
      } else if (format === 'emf') {
        const blob = await getEmfBlob();
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.emf`, `${contextLabel}-emf`);
        } else {
          const map = { [EMF_MIME_TYPE]: blob, [EMF_MIME_FALLBACK]: blob };
          const copied = await copyBlobMap(map, `${contextLabel}-emf`);
          if (!copied) {
            warn('canvasActions emf copy unsupported', { contextLabel: `${contextLabel}-emf` });
            downloadBlob(blob, `${fileName}.emf`, `${contextLabel}-emf`);
            if (typeof global.alert === 'function') {
              global.alert('Copying EMF images to the clipboard is not supported in this browser. The EMF file was downloaded instead.');
            }
          }
        }
      }
    }
    return [
      {
        key: 'download',
        label: 'Download',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('download', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('download', 'svg') },
          { key: 'emf', label: 'EMF', handler: () => handle('download', 'emf') }
        ]
      },
      {
        key: 'copy',
        label: 'Copy',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('copy', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('copy', 'svg') },
          { key: 'emf', label: 'EMF', handler: () => handle('copy', 'emf') }
        ]
      }
    ];
  }

  function createSvgStringActions(config) {
    const { getSvgString, getDimensions, fileName = 'chart', contextLabel = 'svg-string', dpi, dpiX, dpiY } = config;
    const resolveBackground = () => {
      if (config.backgroundColor) {
        return config.backgroundColor;
      }
      if (typeof config.getBackgroundColor === 'function') {
        try {
          return config.getBackgroundColor();
        } catch (err) {
          console.error('exporter svgString getBackgroundColor error', err);
        }
      }
      return null;
    };
    const resolveSvgString = async () => {
      if (typeof getSvgString !== 'function') {
        warn('svgStringActions missing getSvgString', { contextLabel });
        return '';
      }
      try {
        return await Promise.resolve(getSvgString());
      } catch (err) {
        console.error('exporter svgString getSvgString error', err);
        return '';
      }
    };
    const resolveDims = async () => {
      if (typeof getDimensions !== 'function') return {};
      try {
        const dims = await Promise.resolve(getDimensions());
        return dims || {};
      } catch (err) {
        console.error('exporter svgString getDimensions error', err);
        return {};
      }
    };
    async function handle(mode, format) {
      if (format === 'png') {
        const xml = await resolveSvgString();
        if (!xml) return;
        const dims = await resolveDims();
        const blob = await svgStringToPngBlob(xml, {
          width: dims.width,
          height: dims.height,
          contextLabel: `${contextLabel}-png`,
          dpi,
          dpiX,
          dpiY
        });
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.png`, `${contextLabel}-png`);
        } else {
          const copied = await copyBlobMap({ 'image/png': blob }, `${contextLabel}-png`);
          if (!copied) {
            warn('svgStringActions png copy unavailable', { contextLabel: `${contextLabel}-png` });
          }
        }
      } else if (format === 'svg') {
        const xml = await resolveSvgString();
        if (!xml) return;
        const payload = buildSvgExportPayload(xml, {
          fileName: `${fileName}.svg`,
          contextLabel: `${contextLabel}-svg`,
          includeHtmlPreview: true
        });
        if (!payload) return;
        console.debug('Debug: exporter svgString svg payload ready', {
          contextLabel: `${contextLabel}-svg`,
          mode,
          name: payload.fileName,
          clipboardTypes: Object.keys(payload.clipboardMap || {})
        }); // Debug: svg string payload trace
        if (mode === 'download') {
          downloadBlob(payload.svgBlob, payload.fileName, `${contextLabel}-svg`);
        } else {
          const copied = await copyBlobMap(payload.clipboardMap, `${contextLabel}-svg`);
          if (!copied) {
            warn('svgStringActions svg copy unavailable', { contextLabel: `${contextLabel}-svg` });
          }
        }
      } else if (format === 'emf') {
        const xml = await resolveSvgString();
        if (!xml) return;
        const dims = await resolveDims();
        const backgroundColor = resolveBackground() || '#ffffff';
        const blob = await svgStringToEmfBlob(xml, {
          width: dims.width,
          height: dims.height,
          fallbackWidth: dims.width,
          fallbackHeight: dims.height,
          contextLabel: `${contextLabel}-emf`,
          dpi,
          dpiX,
          dpiY,
          backgroundColor
        });
        if (!blob) return;
        if (mode === 'download') {
          downloadBlob(blob, `${fileName}.emf`, `${contextLabel}-emf`);
        } else {
          const map = { [EMF_MIME_TYPE]: blob, [EMF_MIME_FALLBACK]: blob };
          const copied = await copyBlobMap(map, `${contextLabel}-emf`);
          if (!copied) {
            warn('svgStringActions emf copy unsupported', { contextLabel: `${contextLabel}-emf` });
            downloadBlob(blob, `${fileName}.emf`, `${contextLabel}-emf`);
            if (typeof global.alert === 'function') {
              global.alert('Copying EMF images to the clipboard is not supported in this browser. The EMF file was downloaded instead.');
            }
          }
        }
      }
    }
    return [
      {
        key: 'download',
        label: 'Download',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('download', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('download', 'svg') },
          { key: 'emf', label: 'EMF', handler: () => handle('download', 'emf') }
        ]
      },
      {
        key: 'copy',
        label: 'Copy',
        formats: [
          { key: 'png', label: 'PNG', handler: () => handle('copy', 'png') },
          { key: 'svg', label: 'SVG', handler: () => handle('copy', 'svg') },
          { key: 'emf', label: 'EMF', handler: () => handle('copy', 'emf') }
        ]
      }
    ];
  }

  exporter.mountSvgControls = function mountSvgControls(config) {
    const actions = createSvgActions({
      getSvg: typeof config.getSvg === 'function' ? config.getSvg : () => resolveElement(config.svgSelector),
      fileName: config.fileName,
      contextLabel: config.contextLabel,
      fallbackWidth: config.fallbackWidth,
      fallbackHeight: config.fallbackHeight,
      dpi: config.dpi,
      dpiX: config.dpiX,
      dpiY: config.dpiY,
      hybridOptions: config.hybridOptions
    });
    mountControls({ container: config.container, actions, contextLabel: config.contextLabel || config.fileName || 'svg-export' });
  };

  exporter.mountCanvasControls = function mountCanvasControls(config) {
    const actions = createCanvasActions({
      getCanvas: typeof config.getCanvas === 'function' ? config.getCanvas : () => resolveElement(config.canvasSelector),
      getSvgString: config.getSvgString,
      fileName: config.fileName,
      contextLabel: config.contextLabel || config.fileName || 'canvas-export',
      dpi: config.dpi,
      dpiX: config.dpiX,
      dpiY: config.dpiY
    });
    mountControls({ container: config.container, actions, contextLabel: config.contextLabel || config.fileName || 'canvas-export' });
  };

  exporter.mountSvgStringControls = function mountSvgStringControls(config) {
    const actions = createSvgStringActions({
      getSvgString: config.getSvgString,
      getDimensions: config.getDimensions,
      fileName: config.fileName,
      contextLabel: config.contextLabel || config.fileName || 'svg-string',
      dpi: config.dpi,
      dpiX: config.dpiX,
      dpiY: config.dpiY
    });
    mountControls({ container: config.container, actions, contextLabel: config.contextLabel || config.fileName || 'svg-string' });
  };

  exporter.svgElementToPngBlob = svgElementToPngBlob;
  exporter.svgElementToEmfBlob = svgElementToEmfBlob;
  exporter.svgElementToXml = svgToXml;
  exporter.svgStringToPngBlob = svgStringToPngBlob;
  exporter.svgStringToEmfBlob = svgStringToEmfBlob;
  exporter.canvasToEmfBlob = canvasToEmfBlob;
  exporter.downloadBlob = downloadBlob;
  exporter.copyBlobMap = copyBlobMap;
  exporter.buildHybridSvg = buildHybridSvg;
  exporter.buildHybridSvgExportPayload = buildHybridSvgExportPayload;

  logDebug('module ready', {
    hasClipboardWrite: !!(global.navigator?.clipboard?.write),
    hasSerialize: typeof (Shared.serializeCleanSVG || global.serializeCleanSVG) === 'function'
  });
})(typeof window !== 'undefined' ? window : globalThis);
