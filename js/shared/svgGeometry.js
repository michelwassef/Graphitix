(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const svgGeometry = Shared.svgGeometry = Shared.svgGeometry || {};

  function finiteCoordinate(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeLineSegment(segment){
    if(!segment || typeof segment !== 'object'){
      return null;
    }
    const x1 = finiteCoordinate(segment.x1);
    const y1 = finiteCoordinate(segment.y1);
    const x2 = finiteCoordinate(segment.x2);
    const y2 = finiteCoordinate(segment.y2);
    if(x1 == null || y1 == null || x2 == null || y2 == null){
      return null;
    }
    return { x1, y1, x2, y2 };
  }

  /**
   * Build one axis-aligned spine plus optional perpendicular end caps.
   * Segment direction is preserved from start -> end, which keeps dash phase
   * identical to the source <line> representation when a dashed style is used.
   */
  function buildOrthogonalCappedLineSegments(options){
    const opts = options || {};
    const orientation = opts.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    const start = finiteCoordinate(opts.start);
    const end = finiteCoordinate(opts.end);
    const cross = finiteCoordinate(opts.cross);
    const capSizeRaw = finiteCoordinate(opts.capSize);
    if(start == null || end == null || cross == null || capSizeRaw == null){
      return [];
    }
    const halfCap = Math.abs(capSizeRaw) / 2;
    const capAtStart = opts.capAtStart !== false;
    const capAtEnd = opts.capAtEnd !== false;
    const segments = [];
    if(orientation === 'horizontal'){
      segments.push({ x1: start, y1: cross, x2: end, y2: cross });
      if(capAtStart){
        segments.push({ x1: start, y1: cross - halfCap, x2: start, y2: cross + halfCap });
      }
      if(capAtEnd){
        segments.push({ x1: end, y1: cross - halfCap, x2: end, y2: cross + halfCap });
      }
    }else{
      segments.push({ x1: cross, y1: start, x2: cross, y2: end });
      if(capAtStart){
        segments.push({ x1: cross - halfCap, y1: start, x2: cross + halfCap, y2: start });
      }
      if(capAtEnd){
        segments.push({ x1: cross - halfCap, y1: end, x2: cross + halfCap, y2: end });
      }
    }
    return segments;
  }

  function buildCrossSegments(options){
    const opts = options || {};
    const x = finiteCoordinate(opts.x);
    const y = finiteCoordinate(opts.y);
    const sizeRaw = finiteCoordinate(opts.size);
    if(x == null || y == null || sizeRaw == null){
      return [];
    }
    const halfSize = Math.abs(sizeRaw) / 2;
    return [
      { x1: x - halfSize, y1: y, x2: x + halfSize, y2: y },
      { x1: x, y1: y - halfSize, x2: x, y2: y + halfSize }
    ];
  }

  /**
   * Build one SVG path from independent straight-line subpaths.
   *
   * Every source segment starts with its own move command. This is deliberate:
   * line caps, dash phase, and endpoint geometry therefore remain identical to
   * the equivalent collection of <line> elements while the SVG renderer paints
   * the compound stroke as one graphical object.
   */
  function buildCompoundLinePath(segments){
    if(!Array.isArray(segments) || !segments.length){
      return '';
    }
    const commands = [];
    for(let index = 0; index < segments.length; index += 1){
      const segment = normalizeLineSegment(segments[index]);
      if(!segment){
        continue;
      }
      commands.push(`M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`);
    }
    return commands.join(' ');
  }

  svgGeometry.normalizeLineSegment = normalizeLineSegment;
  svgGeometry.buildOrthogonalCappedLineSegments = buildOrthogonalCappedLineSegments;
  svgGeometry.buildCrossSegments = buildCrossSegments;
  svgGeometry.buildCompoundLinePath = buildCompoundLinePath;
})(typeof window !== 'undefined' ? window : globalThis);
