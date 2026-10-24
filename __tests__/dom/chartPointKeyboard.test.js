describe('shared chart point keyboard behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <section id="plot" aria-label="Existing plot">
        <svg>
          <circle id="left" data-point="left"></circle>
          <circle id="right" data-point="right"></circle>
          <circle id="lower" data-point="lower"></circle>
        </svg>
      </section>
    `;
    require('../../js/shared/plot3d.js');
    require('../../js/shared/chartPointKeyboard.js');
  });

  function setup(owner = 'tab-a') {
    const root = document.getElementById('plot');
    let activeOwner = owner;
    const controller = window.Shared.chartPointKeyboard.attach(root, {
      componentLabel: 'Test chart',
      instructions: 'Arrow keys navigate points.',
      pointSelector: '[data-point]',
      ownerTabId: owner,
      getCurrentOwnerTabId: () => activeOwner,
      getPointKey: data => data.id,
      describePoint: data => data.name
    });
    const points = ['left', 'right', 'lower'].map(id => document.getElementById(id));
    points.forEach(point => controller.registerPoint(point, { id: point.id, name: `Point ${point.id}` }));
    return { root, controller, points, setOwner: value => { activeOwner = value; } };
  }

  function press(target, key, modifiers = {}){
    const event = new KeyboardEvent('keydown', { key, ...modifiers, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  function setRect(point, x, y){
    point.getBoundingClientRect = () => ({ x, y, left:x, top:y, right:x + 8, bottom:y + 8, width:8, height:8 });
  }

  test('keeps one named plot tab stop and adds point semantics only on keyboard entry', () => {
    const { root, controller, points } = setup();
    expect(window.Shared.chartPointKeyboard.attach(root, { pointSelector: '[data-point]' })).toBe(controller);
    expect(root.tabIndex).toBe(0);
    expect(root.getAttribute('role')).toBe('group');
    expect(root.getAttribute('aria-label')).toBe('Test chart chart');
    expect(root.getAttribute('aria-description')).toBe('Arrow keys navigate points.');
    expect(points.map(point => point.getAttribute('tabindex'))).toEqual([null, null, null]);
    expect(points.map(point => point.getAttribute('role'))).toEqual([null, null, null]);
    expect(points.map(point => point.getAttribute('aria-label'))).toEqual([null, null, null]);
    points.forEach((point, index) => setRect(point, index * 20, 0));
    root.focus();
    press(root, 'ArrowRight');
    expect(document.activeElement).toBe(points[0]);
    expect(points[0].getAttribute('tabindex')).toBe('-1');
    expect(points[0].getAttribute('role')).toBe('button');
    expect(points[0].getAttribute('aria-label')).toBe('Point left');
    expect(points.slice(1).every(point => !point.hasAttribute('aria-label'))).toBe(true);
  });

  test('enters from the chart root and follows spatial arrows plus Home and End', () => {
    const { root, points } = setup();
    setRect(points[0], 10, 10);
    setRect(points[1], 40, 10);
    setRect(points[2], 10, 40);
    root.focus();

    expect(press(root, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(points[0]);
    press(points[0], 'ArrowRight');
    expect(document.activeElement).toBe(points[1]);
    expect(points[0].hasAttribute('aria-label')).toBe(false);
    expect(points[1].getAttribute('aria-label')).toBe('Point right');
    press(points[1], 'ArrowDown');
    expect(document.activeElement).toBe(points[2]);
    press(points[2], 'Home');
    expect(document.activeElement).toBe(points[0]);
    press(points[0], 'End');
    expect(document.activeElement).toBe(points[2]);
  });

  test('keeps horizontal and vertical series paths reachable with a zero-size bounding axis', () => {
    const { root, controller } = setup();
    const svg = root.querySelector('svg');
    const horizontal = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    horizontal.setAttribute('data-point', 'horizontal');
    horizontal.getBoundingClientRect = () => ({ left: 10, top: 10, right: 90, bottom: 10, width: 80, height: 0 });
    const vertical = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    vertical.setAttribute('data-point', 'vertical');
    vertical.getBoundingClientRect = () => ({ left: 20, top: 20, right: 20, bottom: 100, width: 0, height: 80 });
    svg.append(horizontal, vertical);
    controller.registerPoint(horizontal, { id: 'horizontal', name: 'Horizontal series' });
    controller.registerPoint(vertical, { id: 'vertical', name: 'Vertical series' });
    root.focus();

    press(root, 'ArrowRight');
    expect(document.activeElement).toBe(horizontal);
    press(horizontal, 'ArrowDown');
    expect(document.activeElement).toBe(vertical);
  });

  test('Enter and Space activate the focused point once', () => {
    const { root, points } = setup();
    const click = jest.fn();
    setRect(points[0], 10, 10);
    points[0].addEventListener('click', click);
    root.focus();
    press(root, 'ArrowRight');
    expect(press(points[0], 'Enter').defaultPrevented).toBe(true);
    expect(press(points[0], ' ').defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);
  });

  test('Shift+Arrow rotates an attached 3D view without taking chart-point navigation focus', () => {
    const { root } = setup();
    const svg = root.querySelector('svg');
    const state = window.Shared.plot3d.createRotationState();
    const before = { x: state.x, y: state.y, z: state.z };
    window.Shared.plot3d.attachRotationControls(svg, { state });
    root.focus();

    const event = press(root, 'ArrowRight', { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(root);
    expect({ x: state.x, y: state.y, z: state.z }).not.toEqual(before);
    expect(root.getAttribute('aria-keyshortcuts')).toContain('Shift+ArrowRight');
    expect(root.getAttribute('aria-description')).toMatch(/Arrow keys navigate points.*rotate/i);
  });

  test('ignores keyboard input after the chart owner changes', () => {
    const { root, setOwner } = setup();
    root.focus();
    setOwner('tab-b');
    const event = press(root, 'ArrowRight');
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(root);
  });
});
