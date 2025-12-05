/**
 * Tests for scatter SVG export optimization.
 * Validates that large scatter datasets are optimized using path-based circle
 * representation to reduce SVG file size.
 */

describe('Scatter SVG export optimization', () => {
  let exporter;
  let document;

  beforeAll(() => {
    // Load the exporter module
    require('../js/shared/exporter.js');
    exporter = window.Shared?.exporter;
    document = global.document;
  });

  beforeEach(() => {
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  /**
   * Helper to create an SVG with scatter points
   */
  function createScatterSvg(pointCount, options = {}) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '800');
    svg.setAttribute('height', '600');
    svg.setAttribute('viewBox', '0 0 800 600');

    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('data-export-layer', 'scatter-points');
    layer.setAttribute('data-layer', 'points');

    const radius = options.radius || '3';
    const fill = options.fill || '#377eb8';
    const stroke = options.stroke || null;
    const strokeWidth = options.strokeWidth || null;

    for (let i = 0; i < pointCount; i++) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(100 + Math.random() * 600));
      circle.setAttribute('cy', String(100 + Math.random() * 400));
      circle.setAttribute('r', radius);
      circle.setAttribute('fill', fill);
      if (stroke) circle.setAttribute('stroke', stroke);
      if (strokeWidth) circle.setAttribute('stroke-width', strokeWidth);
      layer.appendChild(circle);
    }

    svg.appendChild(layer);
    return svg;
  }

  test('optimizeScatterPoints function is exposed', () => {
    expect(exporter).toBeDefined();
    expect(typeof exporter.optimizeScatterPoints).toBe('function');
  });

  test('SCATTER_OPTIMIZATION_THRESHOLD constant is exposed', () => {
    expect(typeof exporter.SCATTER_OPTIMIZATION_THRESHOLD).toBe('number');
    expect(exporter.SCATTER_OPTIMIZATION_THRESHOLD).toBeGreaterThan(0);
  });

  test('does not optimize when below threshold', () => {
    const svg = createScatterSvg(100); // Below threshold
    const stats = exporter.optimizeScatterPoints(svg);
    
    expect(stats.optimized).toBe(false);
    expect(stats.originalCount).toBe(100);
    
    // Original circles should still be present
    const circles = svg.querySelectorAll('circle');
    expect(circles.length).toBe(100);
    
    // No symbols should be created
    const symbols = svg.querySelectorAll('symbol');
    expect(symbols.length).toBe(0);
  });

  test('optimizes when above threshold', () => {
    const threshold = exporter.SCATTER_OPTIMIZATION_THRESHOLD;
    const svg = createScatterSvg(threshold + 100);
    const stats = exporter.optimizeScatterPoints(svg);
    
    expect(stats.optimized).toBe(true);
    expect(stats.originalCount).toBe(threshold + 100);
    expect(stats.groupsCreated).toBeGreaterThan(0);
    
    // Original circles should be replaced with path elements
    const circles = svg.querySelectorAll('[data-export-layer="scatter-points"] circle');
    expect(circles.length).toBe(0);
    
    // Path elements should be created for each style group
    const paths = svg.querySelectorAll('[data-export-layer="scatter-points"] path');
    expect(paths.length).toBeGreaterThan(0);
    
    // Path should have 'd' attribute with arc commands (spaces, no commas)
    const firstPath = paths[0];
    expect(firstPath.getAttribute('d')).toMatch(/^M.*a.*0 1 0/);
  });

  test('creates one path per style group', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 600');
    
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('data-export-layer', 'scatter-points');
    
    // Create circles with different radii
    const radii = ['2', '3', '5'];
    const countPerRadius = 200;
    
    radii.forEach(r => {
      for (let i = 0; i < countPerRadius; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(Math.random() * 800));
        circle.setAttribute('cy', String(Math.random() * 600));
        circle.setAttribute('r', r);
        circle.setAttribute('fill', '#377eb8');
        layer.appendChild(circle);
      }
    });
    
    svg.appendChild(layer);
    
    const stats = exporter.optimizeScatterPoints(svg);
    
    expect(stats.optimized).toBe(true);
    expect(stats.groupsCreated).toBe(3); // One path per radius
    
    // Should have 3 path elements
    const paths = svg.querySelectorAll('[data-export-layer="scatter-points"] path');
    expect(paths.length).toBe(3);
  });

  test('groups elements by style into separate paths', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 600');
    
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('data-export-layer', 'scatter-points');
    
    // Create circles with different colors but same radius
    const colors = ['#ff0000', '#00ff00', '#0000ff'];
    const countPerColor = 200;
    
    colors.forEach(fill => {
      for (let i = 0; i < countPerColor; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(Math.random() * 800));
        circle.setAttribute('cy', String(Math.random() * 600));
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', fill);
        layer.appendChild(circle);
      }
    });
    
    svg.appendChild(layer);
    
    const stats = exporter.optimizeScatterPoints(svg);
    
    expect(stats.optimized).toBe(true);
    expect(stats.groupsCreated).toBe(3); // One path per color
    
    // Each path should have the fill attribute
    const paths = svg.querySelectorAll('[data-export-layer="scatter-points"] path');
    expect(paths.length).toBe(3);
    
    const pathFills = Array.from(paths).map(p => p.getAttribute('fill'));
    colors.forEach(color => {
      expect(pathFills).toContain(color);
    });
  });

  test('preserves layer attributes after optimization', () => {
    const svg = createScatterSvg(exporter.SCATTER_OPTIMIZATION_THRESHOLD + 50);
    
    exporter.optimizeScatterPoints(svg);
    
    const layer = svg.querySelector('[data-export-layer="scatter-points"]');
    expect(layer).not.toBeNull();
    expect(layer.getAttribute('data-layer')).toBe('points');
    expect(layer.getAttribute('data-optimized')).toBe('true');
  });

  test('handles empty layer gracefully', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('data-export-layer', 'scatter-points');
    svg.appendChild(layer);
    
    const stats = exporter.optimizeScatterPoints(svg);
    
    expect(stats.optimized).toBe(false);
    expect(stats.originalCount).toBe(0);
  });

  test('handles missing layer gracefully', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    
    const stats = exporter.optimizeScatterPoints(svg);
    
    expect(stats.optimized).toBe(false);
    expect(stats.originalCount).toBe(0);
  });

  test('reduces coordinate precision in path data', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 600');
    
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('data-export-layer', 'scatter-points');
    
    // Create circles with high precision coordinates
    for (let i = 0; i < exporter.SCATTER_OPTIMIZATION_THRESHOLD + 10; i++) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '123.456789012345');
      circle.setAttribute('cy', '789.987654321098');
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', '#377eb8');
      layer.appendChild(circle);
    }
    
    svg.appendChild(layer);
    
    exporter.optimizeScatterPoints(svg);
    
    const paths = svg.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
    
    // Check that coordinates in path are rounded
    const pathData = paths[0].getAttribute('d');
    
    // Path should contain rounded coordinates (integer precision)
    // The path format is: M(cx-r) cy a r r 0 1 0 2r 0a r r 0 1 0 -2r 0
    // For cx=123, cy=790, r=3: M120 790a3 3 0 1 0 6 0a3 3 0 1 0 -6 0
    expect(pathData).toMatch(/M120 790a3/);
  });

  test('estimates size savings correctly', () => {
    const svg = createScatterSvg(1000);
    const stats = exporter.optimizeScatterPoints(svg);
    
    expect(stats.optimized).toBe(true);
    expect(stats.estimatedSavingsPercent).toBeGreaterThan(0);
    expect(stats.estimatedSavingsPercent).toBeLessThanOrEqual(100);
  });

  test('serialized SVG is significantly smaller after optimization', () => {
    const pointCount = 2000;
    
    // Create original SVG (not optimized)
    const svgOriginal = createScatterSvg(pointCount);
    const originalXml = new XMLSerializer().serializeToString(svgOriginal);
    
    // Create and optimize another SVG with same points
    const svgOptimized = createScatterSvg(pointCount);
    exporter.optimizeScatterPoints(svgOptimized);
    const optimizedXml = new XMLSerializer().serializeToString(svgOptimized);
    
    // Optimized should be significantly smaller
    const sizeDiff = originalXml.length - optimizedXml.length;
    const reductionPercent = (sizeDiff / originalXml.length) * 100;
    
    expect(reductionPercent).toBeGreaterThan(20); // At least 20% reduction
    
    console.log(`Size reduction: ${reductionPercent.toFixed(1)}% (${originalXml.length} -> ${optimizedXml.length} bytes)`);
  });

  test('path-based optimization produces valid SVG paths', () => {
    const svg = createScatterSvg(exporter.SCATTER_OPTIMIZATION_THRESHOLD + 10);
    
    exporter.optimizeScatterPoints(svg);
    
    // Should have path elements
    const paths = svg.querySelectorAll('[data-export-layer="scatter-points"] path');
    expect(paths.length).toBeGreaterThan(0);
    
    // Each path should have valid 'd' attribute with arc commands
    paths.forEach(path => {
      const d = path.getAttribute('d');
      expect(d).toBeTruthy();
      // Should contain arc commands (a) for drawing circles
      // Format: a3 3 0 1 0 6 0 (with spaces, no commas for compactness)
      expect(d).toMatch(/a[0-9.]+ [0-9.]+ 0 1 0/);
    });
  });

  test('preserves original SVG structure outside points layer', () => {
    const svg = createScatterSvg(exporter.SCATTER_OPTIMIZATION_THRESHOLD + 10);
    
    // Add some other elements
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.textContent = 'Test Title';
    title.setAttribute('id', 'test-title');
    svg.appendChild(title);
    
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('id', 'test-rect');
    rect.setAttribute('width', '100');
    rect.setAttribute('height', '50');
    svg.appendChild(rect);
    
    exporter.optimizeScatterPoints(svg);
    
    // Other elements should still be present
    expect(svg.querySelector('#test-title')).not.toBeNull();
    expect(svg.querySelector('#test-rect')).not.toBeNull();
  });
});
