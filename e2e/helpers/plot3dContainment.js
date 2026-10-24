const { expect } = require('@playwright/test');

async function readContainment(page, selector) {
  return page.evaluate(svgSelector => {
    const svg = document.querySelector(svgSelector);
    if (!svg) return null;
    const view = String(svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
    const inverse = svg.getScreenCTM?.()?.inverse?.() || null;
    const toSvgPoint = (x, y) => {
      if (!inverse) return null;
      const point = svg.createSVGPoint?.();
      if (!point) return null;
      point.x = x;
      point.y = y;
      return point.matrixTransform(inverse);
    };
    const renderedNodes = Array.from(svg.querySelectorAll('text, line, circle, ellipse, path, polygon, polyline, rect'))
      .filter(node => !node.closest('defs'))
      .map(node => {
        const rect = node.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return null;
        const points = [
          toSvgPoint(rect.left, rect.top),
          toSvgPoint(rect.right, rect.top),
          toSvgPoint(rect.left, rect.bottom),
          toSvgPoint(rect.right, rect.bottom)
        ].filter(Boolean);
        if (points.length !== 4) return null;
        return {
          tag: node.tagName,
          role: node.getAttribute('data-font-role') || node.getAttribute('data-role') || '',
          className: String(node.getAttribute('class') || ''),
          text: String(node.textContent || '').trim().slice(0, 48),
          left: Math.min(...points.map(point => point.x)),
          top: Math.min(...points.map(point => point.y)),
          right: Math.max(...points.map(point => point.x)),
          bottom: Math.max(...points.map(point => point.y))
        };
      })
      .filter(Boolean);
    const content = renderedNodes.reduce((bounds, rect) => ({
      left: Math.min(bounds.left, rect.left),
      top: Math.min(bounds.top, rect.top),
      right: Math.max(bounds.right, rect.right),
      bottom: Math.max(bounds.bottom, rect.bottom)
    }), {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    });
    const glyphCorners = node => {
      const box = node.getBBox();
      const matrix = node.getScreenCTM();
      return [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]].map(([x, y]) => {
        const point = svg.createSVGPoint(); point.x = x; point.y = y;
        const screen = point.matrixTransform(matrix);
        return toSvgPoint(screen.x, screen.y);
      });
    };
    const annotations = Array.from(svg.querySelectorAll('[data-axis-label], [data-axis-tick-label]')).filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map(node => {
      return { axis: node.dataset.axisKey, text: node.textContent, corners: glyphCorners(node), title: node.hasAttribute('data-axis-label') };
    });
    const titleClearances = annotations.filter(annotation => annotation.title).map(title => {
      const line = svg.querySelector(`[data-axis-line][data-axis-key="${title.axis}"]`);
      const matrix = line.getScreenCTM();
      const endpoints = ['1', '2'].map(suffix => {
        const point = svg.createSVGPoint();
        point.x = Number(line.getAttribute(`x${suffix}`));
        point.y = Number(line.getAttribute(`y${suffix}`));
        const screen = point.matrixTransform(matrix);
        return toSvgPoint(screen.x, screen.y);
      });
      const dx = endpoints[1].x - endpoints[0].x, dy = endpoints[1].y - endpoints[0].y;
      const length = Math.hypot(dx, dy);
      let normal = { x: -dy / length, y: dx / length };
      const midpoint = { x: (endpoints[0].x + endpoints[1].x) / 2, y: (endpoints[0].y + endpoints[1].y) / 2 };
      const center = title.corners.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
      if ((center.x - midpoint.x) * normal.x + (center.y - midpoint.y) * normal.y < 0) normal = { x: -normal.x, y: -normal.y };
      const project = point => point.x * normal.x + point.y * normal.y;
      // Placement precedes collision filtering: measure the complete tick
      // envelope, including ticks hidden at this particular camera angle.
      const ticks = Array.from(svg.querySelectorAll(`[data-axis-tick-label][data-axis-key="${title.axis}"]`)).flatMap(node => {
        const display = node.getAttribute('display');
        node.removeAttribute('display');
        const corners = glyphCorners(node);
        if (display !== null) node.setAttribute('display', display);
        return corners;
      });
      return { axis: title.axis, gap: Math.min(...title.corners.map(project)) - Math.max(...ticks.map(project)) };
    });
    const intersects = (a, b) => {
      for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i += 1) {
        const next = polygon[(i + 1) % polygon.length];
        const dx = next.x - polygon[i].x, dy = next.y - polygon[i].y;
        const length = Math.hypot(dx, dy);
        if (!length) continue;
        const project = points => points.map(point => (point.x * -dy + point.y * dx) / length);
        const first = project(a), second = project(b);
        if (Math.min(Math.max(...first), Math.max(...second)) - Math.max(Math.min(...first), Math.min(...second)) <= 0.5) return false;
      }
      return true;
    };
    const collisions = [];
    annotations.forEach((a, i) => annotations.slice(i + 1).forEach(b => {
      if (intersects(a.corners, b.corners)) collisions.push([`${a.axis}: ${a.text}`, `${b.axis}: ${b.text}`]);
    }));
    const legendCollisions = [];
    for (const legend of svg.querySelectorAll('[data-legend-viewport-content="true"], g.surface-legend')) {
      const rect = legend.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) continue;
      const corners = [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]].map(([x, y]) => toSvgPoint(x, y));
      for (const annotation of annotations) {
        if (intersects(annotation.corners, corners)) legendCollisions.push(`${annotation.axis}: ${annotation.text}`);
      }
    }
    const collapsedAnnotations = Array.from(svg.querySelectorAll('[data-axis-line]')).filter(line => Math.hypot(Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')), Number(line.getAttribute('y2')) - Number(line.getAttribute('y1'))) < 1e-6).flatMap(line => annotations.filter(annotation => annotation.axis === line.dataset.axisKey).map(annotation => annotation.text));
    return {
      view,
      graphSize: [Number(svg.dataset.plot3dCanonicalWidth), Number(svg.dataset.plot3dCanonicalHeight)],
      legendWidth: Number(svg.dataset.plot3dLegendReserveWidth),
      content,
      collisions,
      legendCollisions,
      collapsedAnnotations,
      titleClearances,
      overflow: renderedNodes.filter(rect => rect.left < view[0] - 1 || rect.top < view[1] - 1 || rect.right > view[0] + view[2] + 1 || rect.bottom > view[1] + view[3] + 1),
      marker: svg.dataset.plot3dViewport || null,
      reserves: ['left', 'top', 'right', 'bottom'].map(side => svg.dataset[`plot3dReserve${side[0].toUpperCase()}${side.slice(1)}`] || null),
      envelope: svg.closest('.svgbox') ? [
        svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-left'),
        svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-top'),
        svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-right'),
        svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-bottom')
      ] : []
    };
  }, selector);
}

function expectContained(result, label) {
  expect(result, `${label} should expose a viewport`).not.toBeNull();
  expect(result.marker, `${label} should use the shared 3D viewport contract`).toBe('true');
  expect(result.reserves.every(value => Number(value) > 0), `${label} should persist positive rotation-safe reserves`).toBe(true);
  expect(result.overflow, `${label} should contain every rendered glyph`).toEqual([]);
  expect(result.collapsedAnnotations, `${label} should omit annotations on a collapsed axis`).toEqual([]);
  expect(result.collisions, `${label} should keep visible axis annotations legible`).toEqual([]);
  expect(result.legendCollisions, `${label} should keep axis annotations outside the legend`).toEqual([]);
  for (const clearance of result.titleClearances) {
    expect(clearance.gap, `${label} ${clearance.axis} title should have compact tick clearance`).toBeGreaterThanOrEqual(1.5);
    expect(clearance.gap, `${label} ${clearance.axis} title should have compact tick clearance`).toBeLessThanOrEqual(4.5);
  }
  const [minX, minY, width, height] = result.view;
  expect(width, `${label} should publish the legend outside the canonical graph width`).toBeCloseTo(result.graphSize[0] + result.legendWidth, 2);
  expect(height, `${label} should preserve canonical graph height`).toBeCloseTo(result.graphSize[1], 2);
  const content = result.content;
  expect(content.left, `${label} content should not cross the left viewport edge`).toBeGreaterThanOrEqual(minX - 1);
  expect(content.top, `${label} content should not cross the top viewport edge`).toBeGreaterThanOrEqual(minY - 1);
  expect(content.right, `${label} content should not cross the right viewport edge`).toBeLessThanOrEqual(minX + width + 1);
  expect(content.bottom, `${label} content should not cross the bottom viewport edge`).toBeLessThanOrEqual(minY + height + 1);
}

module.exports = { readContainment, expectContained };
