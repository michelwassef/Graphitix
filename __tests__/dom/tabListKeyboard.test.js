describe('shared tab-list keyboard navigation', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="tabs" role="tablist" aria-label="Results">
        <button id="first" role="tab" aria-selected="true" tabindex="0" aria-controls="panel-first">First</button>
        <button id="second" role="tab" aria-selected="false" tabindex="-1" aria-controls="panel-second">Second</button>
        <button id="third" role="tab" aria-selected="false" tabindex="-1" aria-controls="panel-third">Third</button>
      </div>
      <div id="panel-first" role="tabpanel"></div>
      <div id="panel-second" role="tabpanel" hidden></div>
      <div id="panel-third" role="tabpanel" hidden></div>
    `;
    require('../../js/shared/tabListKeyboard.js');
  });

  function press(tab, key, options = {}){
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options
    });
    tab.dispatchEvent(event);
    return event;
  }

  test('moves focus and the tab stop without activating the next panel', () => {
    const tabList = document.getElementById('tabs');
    const [first, second, third] = tabList.querySelectorAll('[role="tab"]');
    window.Shared.tabListKeyboard.attach(tabList);

    first.focus();
    const arrow = press(first, 'ArrowRight');
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(second.getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('panel-first').hidden).toBe(false);
    expect(document.getElementById('panel-second').hidden).toBe(true);

    press(second, 'ArrowRight');
    expect(document.activeElement).toBe(third);
    press(third, 'ArrowRight');
    expect(document.activeElement).toBe(first);
    press(first, 'ArrowLeft');
    expect(document.activeElement).toBe(third);
  });

  test('Home and End move focus to the first and last available tabs', () => {
    const tabList = document.getElementById('tabs');
    const [first, , third] = tabList.querySelectorAll('[role="tab"]');
    window.Shared.tabListKeyboard.attach(tabList);

    first.focus();
    press(first, 'End');
    expect(document.activeElement).toBe(third);
    press(third, 'Home');
    expect(document.activeElement).toBe(first);
  });

  test('skips disabled tabs and attaches only one listener set per tablist', () => {
    const tabList = document.getElementById('tabs');
    const [first, second, third] = tabList.querySelectorAll('[role="tab"]');
    second.disabled = true;
    const detach = window.Shared.tabListKeyboard.attach(tabList);
    expect(window.Shared.tabListKeyboard.attach(tabList)).toBe(detach);

    first.focus();
    press(first, 'ArrowRight');
    expect(document.activeElement).toBe(third);
    detach();
    first.focus();
    const unhandled = press(first, 'ArrowRight');
    expect(unhandled.defaultPrevented).toBe(false);
  });

  test('uses vertical arrows and leaves modified shortcuts alone', () => {
    const tabList = document.getElementById('tabs');
    tabList.setAttribute('aria-orientation', 'vertical');
    const [first, second, third] = tabList.querySelectorAll('[role="tab"]');
    window.Shared.tabListKeyboard.attach(tabList);

    first.focus();
    press(first, 'ArrowDown');
    expect(document.activeElement).toBe(second);
    const modified = press(second, 'ArrowDown', { ctrlKey: true });
    expect(modified.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(second);
    press(second, 'ArrowUp');
    expect(document.activeElement).toBe(first);
    expect(third.getAttribute('aria-selected')).toBe('false');
  });

  test('reverses horizontal arrow direction in right-to-left content', () => {
    const tabList = document.getElementById('tabs');
    tabList.setAttribute('dir', 'rtl');
    const [first, second] = tabList.querySelectorAll('[role="tab"]');
    window.Shared.tabListKeyboard.attach(tabList);

    first.focus();
    press(first, 'ArrowRight');
    expect(document.activeElement).toBe(document.getElementById('third'));
    press(document.activeElement, 'ArrowLeft');
    expect(document.activeElement).toBe(first);
    expect(second.getAttribute('aria-selected')).toBe('false');
  });
});
