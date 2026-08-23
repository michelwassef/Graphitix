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

// Rotation gestures are owned by the bound 3D control, not by the generic
// restored-graph edit interceptor. Interactive graph elements remain excluded.
describe('Shared.plot3d managed rotation gestures', () => {
  beforeAll(() => {
    if (!global.Shared?.plot3d) {
      require('../../js/shared/plot3d.js');
    }
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    // Detached owners must be reconciled as part of the registry contract; this
    // also guarantees test isolation when an assertion interrupts a gesture.
    global.Shared?.plot3d?.getActiveRotationGestureCount?.();
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
  });

  function pointerEvent(type, props = {}) {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.entries(props).forEach(([key, value]) => {
      Object.defineProperty(event, key, { configurable: true, value });
    });
    return event;
  }

  afterEach(() => {
    // Close any gesture left open by a failed assertion before Jest moves on to
    // the next case. The shared registry is process-global within this module.
    document.querySelectorAll('svg').forEach(svg => {
      const control = svg.__plot3dRotationControl;
      if(!control?.pointerState?.active){
        return;
      }
      svg.dispatchEvent(pointerEvent('pointercancel', {
        pointerId: control.pointerState.pointerId,
        clientX: control.pointerState.lastX || 0,
        clientY: control.pointerState.lastY || 0
      }));
    });
    document.body.innerHTML = '';
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
  });

  test('recognizes only opted-in non-interactive targets and reports actual movement', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const editable = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    editable.dataset.fontEditable = '1';
    const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legend.dataset.legendKey = 'group-a';
    svg.append(point, editable, legend);
    document.body.appendChild(svg);
    svg.setPointerCapture = jest.fn();
    svg.releasePointerCapture = jest.fn();
    const onEnd = jest.fn();

    plot3d.attachRotationControls(svg, {
      state: plot3d.createRotationState(),
      managesGraphEditGesture: true,
      shouldIgnorePointer: event => plot3d.isInteractivePointerTarget(event?.target),
      onEnd
    });

    expect(plot3d.isManagedRotationGestureTarget(point)).toBe(true);
    expect(plot3d.isManagedRotationGestureTarget(svg)).toBe(true);
    expect(plot3d.isManagedRotationGestureTarget(editable)).toBe(false);
    expect(plot3d.isManagedRotationGestureTarget(legend)).toBe(false);

    point.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 10, clientY: 10 }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 30, clientY: 20 }));
    svg.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 30, clientY: 20 }));
    expect(onEnd).toHaveBeenLastCalledWith(expect.anything(), expect.any(Object), expect.objectContaining({ didMove: true }));
    expect(plot3d.consumeManagedRotationClick(point)).toBe(true);
    expect(plot3d.consumeManagedRotationClick(point)).toBe(false);

    point.dispatchEvent(pointerEvent('pointerdown', { pointerId: 8, clientX: 15, clientY: 15 }));
    svg.dispatchEvent(pointerEvent('pointerup', { pointerId: 8, clientX: 15, clientY: 15 }));
    expect(onEnd).toHaveBeenLastCalledWith(expect.anything(), expect.any(Object), expect.objectContaining({ didMove: false }));
    expect(plot3d.consumeManagedRotationClick(point)).toBe(false);

    point.dispatchEvent(pointerEvent('pointerdown', { pointerId: 9, clientX: 5, clientY: 5 }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 9, clientX: 20, clientY: 5 }));
    svg.dispatchEvent(pointerEvent('pointerleave', { pointerId: 9, clientX: 20, clientY: 5 }));
    expect(svg.__plot3dRotationControl.pointerState.active).toBe(true);
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 9, clientX: 30, clientY: 5 }));
    svg.dispatchEvent(pointerEvent('pointerup', { pointerId: 9, clientX: 30, clientY: 5 }));
    expect(onEnd).toHaveBeenLastCalledWith(expect.anything(), expect.any(Object), expect.objectContaining({
      didMove: true,
      reason: 'pointerup',
      canceled: false
    }));
    expect(plot3d.consumeManagedRotationClick(point)).toBe(true);
  });

  test('cancels and rolls back on pointerleave only when pointer capture is unavailable', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    svg.setPointerCapture = jest.fn(() => { throw new Error('capture unavailable'); });
    const state = plot3d.createRotationState({ x: 0.1, y: 0.2, z: 0.3 });
    const initial = { x: state.x, y: state.y, z: state.z, quaternion: { ...state.quaternion } };
    const onChange = jest.fn();
    const onEnd = jest.fn();
    plot3d.attachRotationControls(svg, { state, onChange, onEnd });

    svg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 12, clientX: 0, clientY: 0 }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 12, clientX: 20, clientY: 10 }));
    svg.dispatchEvent(pointerEvent('pointerleave', { pointerId: 12, clientX: 20, clientY: 10 }));

    expect(svg.__plot3dRotationControl.pointerState.active).toBe(false);
    expect(state).toEqual(initial);
    expect(onChange).toHaveBeenLastCalledWith(expect.anything(), state, expect.objectContaining({ rollback: true }));
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), state, expect.objectContaining({
      reason: 'pointerleave',
      didMove: true,
      canceled: true,
      rolledBack: true
    }));
  });

  test('expires an unconsumed synthetic-click exemption on the next frame', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    svg.appendChild(point);
    document.body.appendChild(svg);
    svg.setPointerCapture = jest.fn();
    svg.releasePointerCapture = jest.fn();
    const callbacks = [];
    const previousRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };

    try {
      plot3d.attachRotationControls(svg, {
        state: plot3d.createRotationState(),
        managesGraphEditGesture: true
      });
      point.dispatchEvent(pointerEvent('pointerdown', { pointerId: 11, clientX: 0, clientY: 0 }));
      svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 11, clientX: 20, clientY: 0 }));
      svg.dispatchEvent(pointerEvent('pointerup', { pointerId: 11, clientX: 20, clientY: 0 }));

      expect(callbacks).toHaveLength(1);
      callbacks[0]();
      expect(plot3d.consumeManagedRotationClick(point)).toBe(false);
    } finally {
      window.requestAnimationFrame = previousRequestAnimationFrame;
    }
  });

  test('cancels an active gesture before rebinding the SVG to new state and callbacks', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    svg.appendChild(point);
    document.body.appendChild(svg);
    svg.setPointerCapture = jest.fn();
    svg.releasePointerCapture = jest.fn();
    const firstState = plot3d.createRotationState();
    const secondState = plot3d.createRotationState();
    const firstEnd = jest.fn();
    const secondChange = jest.fn();

    plot3d.attachRotationControls(svg, {
      state: firstState,
      managesGraphEditGesture: true,
      onEnd: firstEnd
    });
    point.dispatchEvent(pointerEvent('pointerdown', { pointerId: 21, clientX: 0, clientY: 0 }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 21, clientX: 20, clientY: 0 }));
    expect(document.body.style.userSelect).toBe('none');

    plot3d.attachRotationControls(svg, {
      state: secondState,
      managesGraphEditGesture: true,
      onChange: secondChange
    });

    expect(firstEnd).toHaveBeenCalledWith(null, firstState, expect.objectContaining({
      reason: 'rebind',
      didMove: true,
      canceled: true
    }));
    expect(svg.releasePointerCapture).toHaveBeenCalledWith(21);
    expect(document.body.style.userSelect).toBe('');
    expect(svg.__plot3dRotationControl.pointerState.active).toBe(false);

    const secondBefore = { x: secondState.x, y: secondState.y, z: secondState.z };
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 21, clientX: 50, clientY: 0 }));
    expect(secondChange).not.toHaveBeenCalled();
    expect({ x: secondState.x, y: secondState.y, z: secondState.z }).toEqual(secondBefore);

    point.dispatchEvent(pointerEvent('pointerdown', { pointerId: 22, clientX: 0, clientY: 0 }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 22, clientX: 20, clientY: 0 }));
    expect(secondChange).toHaveBeenCalledTimes(1);
    svg.dispatchEvent(pointerEvent('pointerup', { pointerId: 22, clientX: 20, clientY: 0 }));
  });

  test('keeps an active gesture alive when the same owner is harmlessly rebound', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    svg.setPointerCapture = jest.fn();
    svg.releasePointerCapture = jest.fn();
    const state = plot3d.createRotationState();
    const ownerSession = {
      tabId: 'tab-a',
      componentKey: 'line',
      root: document.body,
      refs: { root: document.body, rotationSvg: svg }
    };
    const firstChange = jest.fn();
    const firstEnd = jest.fn();
    const secondChange = jest.fn();
    plot3d.attachRotationControls(svg, {
      state,
      ownerSession,
      componentKey: 'line',
      onChange: firstChange,
      onEnd: firstEnd
    });

    svg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 23, clientX: 0, clientY: 0 }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 23, clientX: 10, clientY: 0 }));
    plot3d.attachRotationControls(svg, {
      state,
      ownerSession,
      componentKey: 'line',
      onChange: secondChange
    });

    expect(svg.__plot3dRotationControl.pointerState.active).toBe(true);
    expect(firstEnd).not.toHaveBeenCalled();
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 23, clientX: 20, clientY: 0 }));
    expect(firstChange).toHaveBeenCalledTimes(2);
    expect(secondChange).not.toHaveBeenCalled();
    svg.dispatchEvent(pointerEvent('pointerup', { pointerId: 23, clientX: 20, clientY: 0 }));
  });

  test('retires detached stale gestures before publishing the next active count', () => {
    const { plot3d } = global.Shared;
    const staleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(staleSvg);
    staleSvg.setPointerCapture = jest.fn();
    staleSvg.releasePointerCapture = jest.fn();
    plot3d.attachRotationControls(staleSvg, { state: plot3d.createRotationState() });
    staleSvg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 23, clientX: 0, clientY: 0 }));
    staleSvg.remove();

    const freshSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(freshSvg);
    freshSvg.setPointerCapture = jest.fn();
    freshSvg.releasePointerCapture = jest.fn();
    const events = [];
    const listener = event => events.push(event.detail);
    window.addEventListener('graphitix:plot3d-rotation-gesture', listener);
    try {
      plot3d.attachRotationControls(freshSvg, { state: plot3d.createRotationState() });
      freshSvg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 24, clientX: 0, clientY: 0 }));
      expect(events.map(event => event.phase)).toEqual(['end', 'start']);
      expect(events[0]).toEqual(expect.objectContaining({ activeCount: 0, reason: 'owner-detached', canceled: true }));
      expect(events[1]).toEqual(expect.objectContaining({ activeCount: 1 }));
      expect(plot3d.getActiveRotationGestureCount()).toBe(1);
      freshSvg.dispatchEvent(pointerEvent('pointerup', { pointerId: 24, clientX: 0, clientY: 0 }));
      expect(plot3d.hasActiveRotationGesture()).toBe(false);
    } finally {
      window.removeEventListener('graphitix:plot3d-rotation-gesture', listener);
    }
  });

  test('publishes one active-gesture registry across start, rollback, and end', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    svg.setPointerCapture = jest.fn();
    svg.releasePointerCapture = jest.fn();
    const state = plot3d.createRotationState();
    const events = [];
    const listener = event => events.push(event.detail);
    window.addEventListener('graphitix:plot3d-rotation-gesture', listener);
    try {
      plot3d.attachRotationControls(svg, { state });
      svg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 24, clientX: 0, clientY: 0 }));
      expect(plot3d.hasActiveRotationGesture()).toBe(true);
      expect(plot3d.getActiveRotationGestureCount()).toBe(1);
      svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 24, clientX: 20, clientY: 0 }));
      svg.dispatchEvent(pointerEvent('pointercancel', { pointerId: 24, clientX: 20, clientY: 0 }));
      expect(plot3d.hasActiveRotationGesture()).toBe(false);
      expect(events).toEqual([
        expect.objectContaining({ phase: 'start', activeCount: 1 }),
        expect.objectContaining({ phase: 'end', activeCount: 0, canceled: true, rolledBack: true })
      ]);
    } finally {
      window.removeEventListener('graphitix:plot3d-rotation-gesture', listener);
    }
  });

  test('restores selection and closes the owner gesture when pointer capture is lost', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    svg.setPointerCapture = jest.fn();
    svg.releasePointerCapture = jest.fn();
    const onEnd = jest.fn();
    plot3d.attachRotationControls(svg, {
      state: plot3d.createRotationState(),
      managesGraphEditGesture: true,
      onEnd
    });

    svg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 31, clientX: 0, clientY: 0 }));
    expect(document.body.style.userSelect).toBe('none');
    svg.dispatchEvent(pointerEvent('lostpointercapture', { pointerId: 31 }));

    expect(document.body.style.userSelect).toBe('');
    expect(svg.__plot3dRotationControl.pointerState.active).toBe(false);
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), expect.any(Object), expect.objectContaining({
      reason: 'lostpointercapture',
      canceled: true
    }));
  });

  test('does not claim gestures for controls that did not opt in', () => {
    const { plot3d } = global.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    svg.appendChild(point);
    document.body.appendChild(svg);
    plot3d.attachRotationControls(svg, { state: plot3d.createRotationState() });
    expect(plot3d.isManagedRotationGestureTarget(point)).toBe(false);
  });

  test('accepts asynchronous rotation frames only for the exact active tab and mounted SVG', () => {
    const { plot3d } = global.Shared;
    const root = document.createElement('section');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.workspaceTabId = 'workspace-2';
    root.appendChild(svg);
    document.body.appendChild(root);
    const owner = {
      componentKey: 'pca',
      tabId: 'workspace-2',
      root,
      refs: { root, svg }
    };
    const previousMain = window.Main;
    const workspaceTabs = global.Shared.workspaceTabs = global.Shared.workspaceTabs || {};
    const previousGetMountedRoot = workspaceTabs.getMountedRoot;
    workspaceTabs.getMountedRoot = jest.fn(() => root);
    window.Main = {
      ...(previousMain || {}),
      session: {
        ...(previousMain?.session || {}),
        workspaceState: {
          activeTabId: 'workspace-2',
          tabs: [{ id: 'workspace-2', type: 'pca' }]
        }
      }
    };

    try {
      plot3d.attachRotationControls(svg, {
        state: plot3d.createRotationState(),
        managesGraphEditGesture: true,
        ownerSession: owner,
        componentKey: 'pca'
      });
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(true);
      expect(plot3d.isManagedRotationGestureTarget(svg)).toBe(true);

      const siblingSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      siblingSvg.dataset.workspaceTabId = 'workspace-2';
      root.appendChild(siblingSvg);
      owner.refs.svg = siblingSvg;
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(false);
      expect(plot3d.isManagedRotationGestureTarget(svg)).toBe(false);
      owner.refs.svg = svg;

      owner.componentKey = 'scatter';
      expect(plot3d.isManagedRotationGestureTarget(svg)).toBe(false);
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(false);
      owner.componentKey = 'pca';

      window.Main.session.workspaceState.activeTabId = null;
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(false);

      window.Main.session.workspaceState.activeTabId = 'workspace-3';
      window.Main.session.workspaceState.tabs.push({ id: 'workspace-3', type: 'pca' });
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(false);

      window.Main.session.workspaceState.tabs[1].type = 'scatter';
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(false);

      window.Main.session.workspaceState.activeTabId = 'workspace-2';
      window.Main.session.workspaceState.tabs[0].type = 'scatter';
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(false);

      window.Main.session.workspaceState.tabs[0].type = 'pca';
      svg.dataset.workspaceTabId = 'workspace-9';
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(false);

      svg.dataset.workspaceTabId = 'workspace-2';
      const foreignRoot = document.createElement('section');
      document.body.appendChild(foreignRoot);
      workspaceTabs.getMountedRoot.mockReturnValue(foreignRoot);
      expect(plot3d.isRotationOwnerActive(owner, 'pca', svg)).toBe(false);
    } finally {
      if (previousGetMountedRoot) {
        workspaceTabs.getMountedRoot = previousGetMountedRoot;
      } else {
        delete workspaceTabs.getMountedRoot;
      }
      window.Main = previousMain;
    }
  });
});
