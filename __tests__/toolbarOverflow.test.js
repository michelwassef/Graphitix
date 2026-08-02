const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;
const mountedNodes = new Set();

function mountNodes(...nodes) {
  nodes.forEach(node => {
    document.body.appendChild(node);
    mountedNodes.add(node);
  });
}

function flushFrames() {
  return new Promise(resolve => setTimeout(resolve, 5));
}

function defineMetric(element, property, value) {
  Object.defineProperty(element, property, {
    configurable: true,
    get: () => value
  });
}

function createToolbarFixture() {
  const toolbar = document.createElement('div');
  toolbar.className = 'workspace-toolbar';
  toolbar.dataset.toolbarKey = 'overflow-test';
  toolbar.dataset.workspaceTabId = 'tab-a';

  const section = document.createElement('div');
  section.className = 'workspace-toolbar__section workspace-toolbar__section--active';
  section.dataset.toolbarSectionId = 'overflow-test-general';
  section.setAttribute('aria-label', 'General actions');

  const buttons = document.createElement('div');
  buttons.className = 'workspace-toolbar__buttons';
  const controls = Array.from({ length: 6 }, (_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Action ${index + 1}`;
    buttons.appendChild(button);
    return button;
  });
  section.appendChild(buttons);
  toolbar.appendChild(section);
  mountNodes(toolbar);
  return { toolbar, section, buttons, controls };
}

describe('Shared.toolbarOverflow', () => {
  afterEach(() => {
    mountedNodes.forEach(node => {
      if (node.matches?.('.workspace-toolbar')) {
        window.Shared.toolbarOverflow.detach(node);
      }
      node.remove();
    });
    mountedNodes.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
  });

  test('wraps controls once without cloning them and restores the original DOM on detach', async () => {
    const fixture = createToolbarFixture();
    const firstControl = fixture.controls[0];

    const state = window.Shared.toolbarOverflow.attach(fixture.toolbar);
    await flushFrames();

    expect(state.sections.size).toBe(1);
    expect(fixture.section.querySelectorAll('[data-toolbar-overflow-shell="1"]')).toHaveLength(1);
    expect(fixture.section.querySelectorAll('[data-toolbar-overflow-track="1"]')).toHaveLength(1);
    expect(fixture.section.querySelector('[data-toolbar-overflow-fade]')).toBeNull();
    expect(fixture.section.querySelector('[data-toolbar-overflow-direction="next"]').dataset.sessionIgnoreDirty).toBe('1');
    expect(fixture.section.querySelector('[data-toolbar-overflow-direction="next"]').dataset.sessionAffectsPayload).toBe('0');
    expect(fixture.section.contains(firstControl)).toBe(true);
    expect(fixture.section.querySelector('button:not(.workspace-toolbar__overflow-button)')).toBe(firstControl);
    expect(firstControl.closest('.workspace-toolbar__section')).toBe(fixture.section);

    window.Shared.toolbarOverflow.attach(fixture.toolbar);
    expect(fixture.section.querySelectorAll('[data-toolbar-overflow-shell="1"]')).toHaveLength(1);

    const lateControl = document.createElement('button');
    lateControl.type = 'button';
    lateControl.textContent = 'Late action';
    fixture.section.appendChild(lateControl);
    window.Shared.toolbarOverflow.refresh(fixture.section);
    await flushFrames();
    expect(lateControl.closest('[data-toolbar-overflow-track="1"]')).not.toBeNull();

    expect(window.Shared.toolbarOverflow.detach(fixture.toolbar)).toBe(true);
    expect(fixture.section.querySelector('[data-toolbar-overflow-shell="1"]')).toBeNull();
    expect(fixture.section.firstElementChild).toBe(fixture.buttons);
    expect(fixture.buttons.firstElementChild).toBe(firstControl);
  });

  test('shows only the available scroll direction and resets on owner changes', async () => {
    const { toolbar, section } = createToolbarFixture();
    window.Shared.toolbarOverflow.attach(toolbar);
    const shell = section.querySelector('[data-toolbar-overflow-shell="1"]');
    const viewport = section.querySelector('[data-toolbar-overflow-viewport="1"]');
    const track = section.querySelector('[data-toolbar-overflow-track="1"]');
    const previous = section.querySelector('[data-toolbar-overflow-direction="previous"]');
    const next = section.querySelector('[data-toolbar-overflow-direction="next"]');

    defineMetric(shell, 'clientWidth', 320);
    defineMetric(track, 'scrollWidth', 640);
    defineMetric(viewport, 'clientWidth', 250);
    defineMetric(viewport, 'scrollWidth', 640);
    viewport.scrollTo = jest.fn(({ left }) => {
      viewport.scrollLeft = left;
      viewport.dispatchEvent(new Event('scroll'));
    });

    window.Shared.toolbarOverflow.refresh(section);
    await flushFrames();

    expect(shell.dataset.toolbarOverflow).toBe('1');
    expect(previous.hidden).toBe(false);
    expect(previous.disabled).toBe(true);
    expect(next.hidden).toBe(false);
    expect(next.disabled).toBe(false);

    const bubbledClick = jest.fn();
    section.addEventListener('click', bubbledClick);
    next.click();
    await flushFrames();
    expect(viewport.scrollLeft).toBeGreaterThan(0);
    expect(previous.disabled).toBe(false);
    expect(bubbledClick).not.toHaveBeenCalled();

    window.Shared.toolbarOverflow.activateSection(toolbar, section, { ownerId: 'tab-a' });
    viewport.scrollLeft = 130;
    window.Shared.toolbarOverflow.activateSection(toolbar, section, { ownerId: 'tab-b' });
    expect(viewport.scrollLeft).toBe(0);
  });

  test('reveals a focused control without translating ordinary vertical wheel input', async () => {
    const { toolbar, section, controls } = createToolbarFixture();
    window.Shared.toolbarOverflow.attach(toolbar);
    const shell = section.querySelector('[data-toolbar-overflow-shell="1"]');
    const viewport = section.querySelector('[data-toolbar-overflow-viewport="1"]');
    const track = section.querySelector('[data-toolbar-overflow-track="1"]');

    defineMetric(shell, 'clientWidth', 260);
    defineMetric(track, 'scrollWidth', 620);
    defineMetric(viewport, 'clientWidth', 190);
    defineMetric(viewport, 'scrollWidth', 620);
    viewport.getBoundingClientRect = () => ({ left: 35, right: 225, top: 0, bottom: 70, width: 190, height: 70 });
    controls[5].getBoundingClientRect = () => ({ left: 470, right: 550, top: 10, bottom: 55, width: 80, height: 45 });
    viewport.scrollTo = jest.fn(({ left }) => { viewport.scrollLeft = left; });

    window.Shared.toolbarOverflow.refresh(section);
    await flushFrames();
    controls[5].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(viewport.scrollLeft).toBeGreaterThan(0);

    const ordinaryWheel = new WheelEvent('wheel', { deltaY: 80, cancelable: true });
    viewport.dispatchEvent(ordinaryWheel);
    expect(ordinaryWheel.defaultPrevented).toBe(false);

    const shiftedWheel = new WheelEvent('wheel', { deltaY: 80, shiftKey: true, cancelable: true });
    const before = viewport.scrollLeft;
    viewport.dispatchEvent(shiftedWheel);
    expect(shiftedWheel.defaultPrevented).toBe(true);
    expect(viewport.scrollLeft).toBeGreaterThan(before);
  });

  test('removes overflow affordances and recenters when content fits', async () => {
    const { toolbar, section } = createToolbarFixture();
    window.Shared.toolbarOverflow.attach(toolbar);
    const shell = section.querySelector('[data-toolbar-overflow-shell="1"]');
    const viewport = section.querySelector('[data-toolbar-overflow-viewport="1"]');
    const track = section.querySelector('[data-toolbar-overflow-track="1"]');
    const previous = section.querySelector('[data-toolbar-overflow-direction="previous"]');
    const next = section.querySelector('[data-toolbar-overflow-direction="next"]');

    defineMetric(shell, 'clientWidth', 700);
    defineMetric(track, 'scrollWidth', 420);
    defineMetric(viewport, 'clientWidth', 700);
    defineMetric(viewport, 'scrollWidth', 420);
    viewport.scrollLeft = 75;

    window.Shared.toolbarOverflow.refresh(section);
    await flushFrames();

    expect(shell.dataset.toolbarOverflow).toBe('0');
    expect(previous.hidden).toBe(true);
    expect(next.hidden).toBe(true);
    expect(previous.classList.contains('workspace-toolbar__overflow-button--visible')).toBe(false);
    expect(next.classList.contains('workspace-toolbar__overflow-button--visible')).toBe(false);
    expect(viewport.scrollLeft).toBe(0);
  });

  test('positions floating toolbar popups inside the viewport and restores inline styles', () => {
    const anchor = document.createElement('button');
    const popup = document.createElement('div');
    popup.style.left = '12px';
    popup.style.maxWidth = '500px';
    mountNodes(anchor, popup);

    anchor.getBoundingClientRect = () => ({
      left: 390,
      right: 430,
      top: 20,
      bottom: 50,
      width: 40,
      height: 30
    });
    popup.getBoundingClientRect = () => {
      const width = Math.min(600, parseFloat(popup.style.maxWidth) || 600);
      return {
        left: 0,
        right: width,
        top: 0,
        bottom: 200,
        width,
        height: 200
      };
    };
    defineMetric(popup, 'offsetWidth', 600);
    defineMetric(popup, 'offsetHeight', 200);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 420 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 320 });

    expect(window.Shared.toolbarOverflow.positionPopup(popup, anchor, {
      align: 'start',
      minWidth: 360,
      offset: 6
    })).toBe(true);
    expect(popup.dataset.toolbarFloatingOverlay).toBe('1');
    expect(popup.style.position).toBe('fixed');
    expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(6);
    expect(parseFloat(popup.style.maxWidth)).toBe(408);
    expect(parseFloat(popup.style.minWidth)).toBe(360);
    expect(parseFloat(popup.style.left) + 408).toBeLessThanOrEqual(414);

    expect(window.Shared.toolbarOverflow.clearPopup(popup)).toBe(true);
    expect(popup.dataset.toolbarFloatingOverlay).toBeUndefined();
    expect(popup.style.position).toBe('');
    expect(popup.style.left).toBe('12px');
    expect(parseFloat(popup.style.maxWidth)).toBe(500);
  });

  test('rejects invalid popup geometry without retaining floating state', () => {
    const anchor = document.createElement('button');
    const popup = document.createElement('div');
    mountNodes(anchor, popup);
    anchor.getBoundingClientRect = () => ({ left: NaN, top: NaN });

    expect(window.Shared.toolbarOverflow.positionPopup(popup, anchor)).toBe(false);
    expect(popup.dataset.toolbarFloatingOverlay).toBeUndefined();
    expect(window.Shared.toolbarOverflow.clearPopup(popup)).toBe(false);
  });
});
