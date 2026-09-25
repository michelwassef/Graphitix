describe('Shared.plot3d helper', () => {
  beforeAll(() => {
    require('../../js/shared/plot3d.js');
  });

  function createPointerEvent(type, props){
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    if(props){
      Object.keys(props).forEach((key) => {
        event[key] = props[key];
      });
    }
    return event;
  }

  it('creates, normalizes, and rotates using rotation state', () => {
    const { plot3d } = global.Shared;
    const state = plot3d.createRotationState({ x: 1, y: 2 });
    const target = plot3d.createRotationState({ x: Math.PI, y: 4 * Math.PI, z: -3 * Math.PI });
    state.quaternion = { ...target.quaternion };
    plot3d.normalizeRotation(state);
    const source = { x: 1, y: 2, z: 3 };
    const rotatedState = plot3d.rotatePoint(source, state);
    const rotatedTarget = plot3d.rotatePoint(source, target);
    expect(rotatedState.x).toBeCloseTo(rotatedTarget.x, 10);
    expect(rotatedState.y).toBeCloseTo(rotatedTarget.y, 10);
    expect(rotatedState.z).toBeCloseTo(rotatedTarget.z, 10);
  });

  it('keeps exact zero Euler axes canonical after quaternion normalization', () => {
    const state = global.Shared.plot3d.createRotationState({ x: -0.55, y: 0.75, z: 0 });
    expect(state.z).toBe(0);
  });

  it('uses the complete drawable rectangle when both frame dimensions are available', () => {
    const { plot3d } = global.Shared;
    expect(plot3d.resolveFrameDimensions({
      availableWidth: 482,
      availableHeight: 456,
      fallbackWidth: 480,
      fallbackHeight: 360
    })).toMatchObject({ width: 482, height: 456 });
    expect(plot3d.resolveFrameDimensions({
      availableWidth: 482,
      availableHeight: 0,
      fallbackWidth: 480,
      fallbackHeight: 360
    })).toMatchObject({ width: 482, height: 362 });
  });

  it('uses one default title anchor for all 3D Cartesian renderers', () => {
    const { plot3d } = global.Shared;
    expect(plot3d.resolveDefaultTitlePosition({
      margin: { left: 24, top: 48 },
      plotWidth: 260,
      fontSize: 12
    })).toMatchObject({ x: 154 });
    expect(plot3d.resolveDefaultTitlePosition({
      margin: { left: 24, top: 48 },
      plotWidth: 260,
      fontSize: 12
    }).y).toBeCloseTo(19.2);
  });

  it('keeps the rotation hit surface on the canonical 3D graph when the SVG has an outward summary reserve', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '311');
    svg.setAttribute('height', '387.2');
    svg.dataset.plot3dBaseWidth = '285';
    svg.dataset.plot3dBaseHeight = '285';
    svg.dataset.statsFigureSummaryReserveBottom = '102.2';

    const hitSurface = plot3d.ensureRotationHitSurface(svg, { debugLabel:'summary-reserve' });

    expect(hitSurface.getAttribute('width')).toBe('285');
    expect(hitSurface.getAttribute('height')).toBe('285');
  });

  it('reserves one rotation-safe envelope from titles, ticks, stroke, and limits', () => {
    const { plot3d } = global.Shared;
    const chartStyle = {
      makeFont: size => `${size}px Test`,
      measureText: (text, font) => String(text).length * Number.parseFloat(font) * 0.7,
      resolveTickLabelGap: () => 4
    };
    const safe = plot3d.resolveRotationSafeViewport({
      width: 311,
      height: 233,
      axisLabels: { x: 'PSD95_N', y: 'SYP_N', z: 'CaNA_N' },
      axisTicks: { x: [-100, 0, 100], y: [-1000, 0, 1000], z: [-1, 0, 1] },
      fontSize: 12,
      tickFontSize: 12,
      axisStrokeWidth: 3,
      chartStyle,
      rotationLimits: { x: { min: -1, max: 1 }, y: { min: -2, max: 2 }, z: { min: 0, max: 0.5 } }
    });

    expect(safe.minX).toBeLessThan(0);
    expect(safe.minY).toBeLessThan(0);
    expect(safe.maxX).toBeGreaterThan(311);
    expect(safe.maxY).toBeGreaterThan(233);
    expect(safe.width).toBe(safe.baseWidth + safe.left + safe.right);
    expect(safe.height).toBe(safe.baseHeight + safe.top + safe.bottom);
    expect(safe.rotationLimits.y).toEqual({ min: -2, max: 2 });
    expect(safe.diagnostics.axis.y.maxTick).toBeGreaterThan(safe.diagnostics.axis.z.maxTick);

    const repeat = plot3d.resolveRotationSafeViewport({
      width: 311,
      height: 233,
      axisLabels: { x: 'PSD95_N', y: 'SYP_N', z: 'CaNA_N' },
      axisTicks: { x: [-100, 0, 100], y: [-1000, 0, 1000], z: [-1, 0, 1] },
      fontSize: 12,
      tickFontSize: 12,
      axisStrokeWidth: 3,
      chartStyle,
      rotationLimits: { x: { min: -1, max: 1 }, y: { min: -2, max: 2 }, z: { min: 0, max: 0.5 } }
    });
    expect(repeat).toEqual(safe);
  });

  it('uses the safe viewport reserve once when sizing the projector margins', () => {
    const { plot3d } = global.Shared;
    const safe = plot3d.resolveRotationSafeViewport({
      width: 320,
      height: 240,
      axisLabels: { x: 'X', y: 'Y', z: 'Z' },
      axisTicks: { x: [-1, 0, 1], y: [-1, 0, 1], z: [-1, 0, 1] },
      fontSize: 12,
      chartStyle: { measureText: text => String(text).length * 7 }
    });

    expect(plot3d.resolveRotationSafeMargin({
      margin: { top: 1, right: 2, bottom: 3, left: 4 },
      safeViewport: safe
    })).toEqual({
      top: safe.reserve,
      right: safe.reserve,
      bottom: safe.reserve,
      left: safe.reserve
    });
  });

  it('applies screen-space yaw and pitch updates while dragging', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    const initialRotationX = Math.PI * 0.6;
    const rotationScale = 0.01;
    const state = plot3d.createRotationState({ x: initialRotationX, y: 0 });
    plot3d.attachRotationControls(svg, { state, rotationScale, debugLabel: 'test-drag' });
    svg.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    const firstDx = 10;
    svg.dispatchEvent(createPointerEvent('pointermove', { pointerId: 1, clientX: firstDx, clientY: 0 }));
    expect(state.y).toBeGreaterThan(0);
    const beforeVertical = state.x;
    const dy = -10;
    svg.dispatchEvent(createPointerEvent('pointermove', { pointerId: 1, clientX: firstDx, clientY: dy }));
    const deltaPitch = state.x - beforeVertical;
    expect(Math.abs(deltaPitch)).toBeGreaterThan(0.05);
    svg.dispatchEvent(createPointerEvent('pointerup', { pointerId: 1, clientX: firstDx, clientY: dy }));
  });

  it('keeps horizontal rotation responsive after steep pitch', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    const rotationScale = 0.02;
    const state = plot3d.createRotationState();
    plot3d.attachRotationControls(svg, { state, rotationScale, debugLabel: 'steep-drag' });
    svg.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 7, clientX: 0, clientY: 0 }));
    const pitchDy = Math.PI / rotationScale / 2;
    svg.dispatchEvent(createPointerEvent('pointermove', { pointerId: 7, clientX: 0, clientY: pitchDy }));
    const beforeQuat = { ...state.quaternion };
    svg.dispatchEvent(createPointerEvent('pointermove', { pointerId: 7, clientX: 40, clientY: pitchDy }));
    const dot =
      beforeQuat.w * state.quaternion.w +
      beforeQuat.x * state.quaternion.x +
      beforeQuat.y * state.quaternion.y +
      beforeQuat.z * state.quaternion.z;
    expect(Math.abs(dot)).toBeLessThan(0.99);
    svg.dispatchEvent(createPointerEvent('pointerup', { pointerId: 7, clientX: 40, clientY: pitchDy }));
  });

  it('projects rotated points within expected bounds', () => {
    const { plot3d } = global.Shared;
    const rotatedPoints = [
      { x: -1, y: -1, z: -1 },
      { x: 1, y: 1, z: 1 }
    ];
    const rotatedCorners = [
      { x: -1, y: -1, z: -1 },
      { x: 1, y: -1, z: -1 },
      { x: -1, y: 1, z: -1 },
      { x: 1, y: 1, z: -1 },
      { x: -1, y: -1, z: 1 },
      { x: 1, y: -1, z: 1 },
      { x: -1, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 }
    ];
    const projector = plot3d.createProjector({
      rotatedPoints,
      rotatedCorners,
      width: 300,
      height: 200,
      margin: { top: 10, right: 15, bottom: 20, left: 25 }
    });
    expect(projector.bounds.minX).toBeCloseTo(-1);
    expect(projector.bounds.maxY).toBeCloseTo(1);
    const projectedA = projector.project(rotatedPoints[0]);
    const projectedB = projector.project(rotatedPoints[1]);
    expect(projectedA.x).toBeGreaterThanOrEqual(25);
    expect(projectedA.y).toBeGreaterThanOrEqual(10);
    expect(projectedB.x).toBeLessThanOrEqual(300 - 15);
    expect(projectedB.y).toBeLessThanOrEqual(200 - 20);
  });

  it('centers projected points within the available vertical plot area', () => {
    const { plot3d } = global.Shared;
    const projector = plot3d.createProjector({
      rotatedPoints: [
        { x: -4, y: -1, z: 0 },
        { x: 4, y: 1, z: 0 }
      ],
      width: 300,
      height: 300,
      margin: { top: 20, right: 20, bottom: 20, left: 20 }
    });

    const low = projector.project({ x: -4, y: -1, z: 0 });
    const high = projector.project({ x: 4, y: 1, z: 0 });

    expect(high.y).toBeCloseTo(117.5);
    expect(low.y).toBeCloseTo(182.5);
    expect(projector.offsets.y).toBeCloseTo(117.5);
  });

  it('styles frame edges differently for foreground and background', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axisGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(axisGroup);
    const axisRanges = {
      x: { min: -1, max: 1 },
      y: { min: -1, max: 1 },
      z: { min: -1, max: 1 }
    };
    const allCorners = [
      { x: axisRanges.x.min, y: axisRanges.y.min, z: axisRanges.z.min },
      { x: axisRanges.x.max, y: axisRanges.y.min, z: axisRanges.z.min },
      { x: axisRanges.x.min, y: axisRanges.y.max, z: axisRanges.z.min },
      { x: axisRanges.x.max, y: axisRanges.y.max, z: axisRanges.z.min },
      { x: axisRanges.x.min, y: axisRanges.y.min, z: axisRanges.z.max },
      { x: axisRanges.x.max, y: axisRanges.y.min, z: axisRanges.z.max },
      { x: axisRanges.x.min, y: axisRanges.y.max, z: axisRanges.z.max },
      { x: axisRanges.x.max, y: axisRanges.y.max, z: axisRanges.z.max }
    ];
    const rotation = { x: Math.PI / 5, y: Math.PI / 4 };
    const rotatePoint = (pt) => plot3d.rotatePoint(pt, rotation);
    const rotatedCorners = allCorners.map(rotatePoint);
    const projector = plot3d.createProjector({
      rotatedCorners,
      width: 320,
      height: 240,
      margin: { top: 12, right: 12, bottom: 12, left: 12 }
    });
    plot3d.renderAxesAndGrid({
      svg,
      rotation,
      rotatePoint,
      project: projector.project,
      axisRanges,
      axisTicks: {},
      axisLabels: {},
      showGrid: false,
      showPanes: false,
      axisTarget: axisGroup,
      showFrame: true,
      frameBackDash: [5, 3],
      frameBackOpacity: 0.25,
      debugLabel: 'frame-style-test'
    });
    const frameLines = Array.from(axisGroup.querySelectorAll('line')).filter((line) => line.getAttribute('data-frame-edge'));
    const frontEdges = frameLines.filter((line) => line.getAttribute('data-frame-edge') === 'front');
    const backEdges = frameLines.filter((line) => line.getAttribute('data-frame-edge') === 'back');
    expect(frontEdges.length).toBeGreaterThan(0);
    expect(backEdges.length).toBeGreaterThan(0);
    expect(axisGroup.querySelector('line[data-axis-line="1"][data-axis-key="x"]')).not.toBeNull();
    expect(axisGroup.querySelector('line[data-axis-line="1"][data-axis-key="y"]')).not.toBeNull();
    expect(axisGroup.querySelector('line[data-axis-line="1"][data-axis-key="z"]')).not.toBeNull();
    backEdges.forEach((line) => {
      expect(line.getAttribute('stroke-dasharray')).toBe('5 3');
      expect(Number(line.getAttribute('stroke-opacity'))).toBeCloseTo(0.25);
    });
    frontEdges.forEach((line) => {
      expect(line.getAttribute('stroke-dasharray')).toBeNull();
    });
  });

  it('renders each homogeneous 3D grid class as compound paths while keeping frame and axis lines independent', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const gridTarget = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const axisTarget = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(gridTarget);
    svg.appendChild(axisTarget);
    const axisRanges = {
      x: { min: -1, max: 1 },
      y: { min: -1, max: 1 },
      z: { min: -1, max: 1 }
    };

    plot3d.renderAxesAndGrid({
      svg,
      rotatePoint: point => point,
      project: point => ({ x: 100 + point.x * 25 + point.z * 5, y: 100 - point.y * 25 - point.z * 5, depth: point.z }),
      axisRanges,
      axisTicks: { x: [-1, 0, 1], y: [-1, 0, 1], z: [-1, 0, 1] },
      axisLabels: { x: 'X', y: 'Y', z: 'Z' },
      gridTarget,
      axisTarget,
      showGrid: true,
      showFrame: true,
      showPanes: false
    });

    const gridPaths = Array.from(gridTarget.querySelectorAll('path[data-grid-control="1"][data-plot3d-grid-role]'));
    expect(gridPaths.length).toBe(18);
    expect(gridTarget.querySelectorAll('line[data-grid-control="1"]').length).toBe(0);
    gridPaths.forEach(path => {
      const d = String(path.getAttribute('d') || '');
      const commandCount = (d.match(/\bM\s/g) || []).length;
      expect(commandCount).toBe(Number(path.getAttribute('data-plot3d-compound-segment-count')));
      expect(commandCount).toBeGreaterThan(0);
    });
    expect(axisTarget.querySelectorAll('line[data-frame-edge]').length).toBeGreaterThan(0);
    expect(axisTarget.querySelectorAll('line[data-axis-line="1"]').length).toBeGreaterThanOrEqual(3);
  });

  it('exposes 3D axis tick labels before final collision layout so components can bind graph font controls', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axisRanges = {
      x: { min: -1, max: 1 },
      y: { min: -1, max: 1 },
      z: { min: -1, max: 1 }
    };
    const markedTicks = [];

    plot3d.renderAxesAndGrid({
      svg,
      rotatePoint: point => point,
      project: point => ({ x: 100 + point.x * 25, y: 100 - point.y * 25, depth: point.z }),
      axisRanges,
      axisTicks: { x: [-1, 0, 1], y: [-1, 0, 1], z: [-1, 0, 1] },
      axisLabels: { x: 'X', y: 'Y', z: 'Z' },
      fontSize: 12,
      tickFontSize: 10,
      showGrid: false,
      showFrame: false,
      showPanes: false,
      onAxisTickLabel: (node, axisKey, labelText, tickValue) => {
        node.dataset.boundTickRole = `${axisKey}Tick`;
        node.setAttribute('font-size', '21px');
        markedTicks.push({ node, axisKey, labelText, tickValue });
      }
    });

    const tickLabels = Array.from(svg.querySelectorAll('[data-axis-tick-label]'));
    expect(tickLabels.length).toBe(markedTicks.length);
    expect(tickLabels.length).toBeGreaterThan(0);
    tickLabels.forEach(node => {
      expect(node.dataset.boundTickRole).toMatch(/^[xyz]Tick$/);
      expect(node.getAttribute('font-size')).toBe('21px');
    });
  });

  it('keeps axis titles and tick labels inside the requested label layer', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const labelLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(labelLayer);

    plot3d.renderAxesAndGrid({
      svg,
      rotatePoint: point => point,
      project: point => ({ x: 100 + point.x * 25, y: 100 - point.y * 25, depth: point.z }),
      axisRanges: {
        x: { min: -1, max: 1 },
        y: { min: -1, max: 1 },
        z: { min: -1, max: 1 }
      },
      axisTicks: { x: [-1, 0, 1], y: [-1, 0, 1], z: [-1, 0, 1] },
      axisLabels: { x: 'X', y: 'Y', z: 'Z' },
      labelTarget: labelLayer,
      showGrid: false,
      showFrame: false,
      showPanes: false
    });

    expect(labelLayer.querySelectorAll('[data-axis-label]').length).toBe(3);
    expect(labelLayer.querySelectorAll('[data-axis-tick-label]').length).toBeGreaterThan(0);
    expect(svg.querySelectorAll(':scope > [data-axis-label]').length).toBe(0);
    expect(svg.querySelectorAll(':scope > [data-axis-tick-label]').length).toBe(0);
  });

});
