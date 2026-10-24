describe('shared menu keyboard behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <button id="trigger" type="button">Actions</button>
      <div id="menu" role="menu" hidden>
        <button id="first" type="button" role="menuitem">First</button>
        <button id="disabled" type="button" role="menuitem" disabled>Unavailable</button>
        <button id="second" type="button" role="menuitem">Second</button>
        <div id="nested" role="menu"><button id="nested-item" role="menuitem">Nested</button></div>
      </div>
    `;
    require('../../js/shared/menuKeyboard.js');
    require('../../js/shared/menuPosition.js');
  });

  function press(target, key){
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  test('opens with one active item and navigates without activating actions', () => {
    const trigger = document.getElementById('trigger');
    const menu = document.getElementById('menu');
    const first = document.getElementById('first');
    const second = document.getElementById('second');
    const click = jest.fn();
    first.addEventListener('click', click);

    const controller = window.Shared.menuKeyboard.attach(menu);
    expect(window.Shared.menuKeyboard.attach(menu)).toBe(controller);
    expect(controller.open(trigger)).toBe(true);
    expect(menu.hidden).toBe(false);
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('menu');
    expect(document.activeElement).toBe(first);
    expect(first.tabIndex).toBe(0);
    expect(second.tabIndex).toBe(-1);

    press(first, 'ArrowDown');
    expect(document.activeElement).toBe(second);
    press(second, 'ArrowDown');
    expect(document.activeElement).toBe(first);
    press(first, 'ArrowUp');
    expect(document.activeElement).toBe(second);
    press(second, 'Home');
    expect(document.activeElement).toBe(first);
    press(first, 'End');
    expect(document.activeElement).toBe(second);
    expect(click).not.toHaveBeenCalled();
  });

  test('Escape closes the menu and restores focus to its trigger', () => {
    const trigger = document.getElementById('trigger');
    const menu = document.getElementById('menu');
    const first = document.getElementById('first');
    const closed = jest.fn();
    const controller = window.Shared.menuKeyboard.attach(menu, { onClose: closed });
    controller.open(trigger);

    const escape = press(first, 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'escape', trigger, menu }));
  });

  test('Tab closes the menu and returns focus before native tab order continues', () => {
    const trigger = document.getElementById('trigger');
    const menu = document.getElementById('menu');
    const first = document.getElementById('first');
    const controller = window.Shared.menuKeyboard.attach(menu);
    controller.open(trigger);

    const tab = press(first, 'Tab');
    expect(tab.defaultPrevented).toBe(false);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  test('supports owner-managed trigger state and detaches cleanly', () => {
    const trigger = document.getElementById('trigger');
    const menu = document.getElementById('menu');
    const controller = window.Shared.menuKeyboard.attach(menu, { manageTriggerState: false });
    controller.open(trigger);
    expect(trigger.hasAttribute('aria-expanded')).toBe(false);
    controller.close({ restoreFocus: false, reason: 'outside-click' });
    expect(menu.hidden).toBe(true);
    controller.destroy();
    expect(controller.open(trigger)).toBe(false);
    expect(menu.hidden).toBe(true);
    expect(press(document.getElementById('first'), 'Escape').defaultPrevented).toBe(false);
  });

  test('computes shared offsets for menus that overflow any viewport edge', () => {
    expect(window.Shared.menuPosition.getViewportCorrection({
      left: 280,
      top: 380,
      right: 350,
      bottom: 430
    }, {
      viewportWidth: 320,
      viewportHeight: 400
    })).toEqual({ x: -36, y: -36 });
    expect(window.Shared.menuPosition.getViewportCorrection({
      left: -4,
      top: -2,
      right: 66,
      bottom: 28
    }, {
      viewportWidth: 320,
      viewportHeight: 400
    })).toEqual({ x: 10, y: 8 });
  });

  test('measures hidden menus before clamping and restores their visibility state', () => {
    const menu = document.getElementById('menu');
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 320 },
      innerHeight: { configurable: true, value: 400 },
      scrollX: { configurable: true, value: 40 },
      scrollY: { configurable: true, value: 25 }
    });
    const measuredHiddenStates = [];
    menu.getBoundingClientRect = () => {
      measuredHiddenStates.push(menu.hidden);
      const left = Number.parseFloat(menu.style.left) - window.scrollX;
      const top = Number.parseFloat(menu.style.top) - window.scrollY;
      return { left, top, right: left + 70, bottom: top + 30 };
    };

    expect(window.Shared.menuPosition.placeAtPagePoint(menu, 370, 420)).toBe(true);
    expect(measuredHiddenStates).toEqual([false]);
    expect(menu.hidden).toBe(true);
    expect(menu.style.left).toBe('284px');
    expect(menu.style.top).toBe('389px');

    menu.hidden = false;
    expect(window.Shared.menuPosition.placeAtPagePoint(menu, 40, 20)).toBe(true);
    expect(measuredHiddenStates).toEqual([false, false]);
    expect(menu.hidden).toBe(false);
    expect(menu.style.left).toBe('46px');
    expect(menu.style.top).toBe('31px');
  });
});
