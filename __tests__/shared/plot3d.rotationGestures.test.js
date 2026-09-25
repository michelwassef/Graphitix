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

