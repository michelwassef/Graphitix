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
    expect(state).toEqual({ x: 1, y: 2 });
    state.x = Math.PI;
    state.y = 4 * Math.PI;
    plot3d.normalizeRotation(state);
    expect(state.x).toBeCloseTo(Math.PI);
    expect(state.y).toBeCloseTo(0, 10);
    const rotated = plot3d.rotatePoint({ x: 1, y: 0, z: 0 }, state);
    expect(rotated.z).toBeCloseTo(0, 10);
    expect(rotated.x).toBeLessThanOrEqual(1);
  });

  it('applies orientation-aware yaw and pitch updates while dragging', () => {
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
    const expectedYawSign = Math.cos(initialRotationX) >= 0 ? 1 : -1;
    expect(state.y).toBeCloseTo(firstDx * rotationScale * expectedYawSign);
    const beforeVertical = state.x;
    const dy = -10;
    svg.dispatchEvent(createPointerEvent('pointermove', { pointerId: 1, clientX: firstDx, clientY: dy }));
    expect(state.x).toBeCloseTo(beforeVertical + dy * rotationScale);
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
    backEdges.forEach((line) => {
      expect(line.getAttribute('stroke-dasharray')).toBe('5 3');
      expect(Number(line.getAttribute('stroke-opacity'))).toBeCloseTo(0.25);
    });
    frontEdges.forEach((line) => {
      expect(line.getAttribute('stroke-dasharray')).toBeNull();
    });
  });
});
