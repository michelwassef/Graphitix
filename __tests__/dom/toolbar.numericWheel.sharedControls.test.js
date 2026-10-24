describe('shared toolbar numeric wheel transactions', () => {
  function wheel(target, deltaY) {
    target.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY
    }));
  }

  function flushLiveFrame() {
    jest.advanceTimersByTime(0);
  }

  function finishGesture() {
    jest.advanceTimersByTime(window.Shared.workspaceToolbar.numericWheelCommitDelayMs);
  }

  function installSharedModules(modulePath) {
    jest.resetModules();
    delete window.Shared;
    window.Shared = {};
    window.Main = { session: { getActiveTab: () => ({ id: 'tab-a' }) } };
    require('../../js/shared/workspaceToolbarAccess.js');
    require('../../js/shared/workspaceToolbar.js');
    require('../../js/shared/styleUndo.js');
    const recorded = [];
    window.Shared.undoManager = {
      recordStateChange(entry) {
        recorded.push(entry);
      }
    };
    require(modulePath);
    return recorded;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    window.Shared?.workspaceToolbar?.flushNumericWheelGesture?.({ commit: false, reason: 'test-cleanup' });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
    delete window.Main;
  });

  test('grid line width uses its declared step, updates live once per frame, and records one undo entry', () => {
    const recorded = installSharedModules('../../js/shared/gridControls.js');
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'hist';
    host.dataset.workspaceTabId = 'tab-a';
    document.body.appendChild(host);

    let style = { color: '#dddddd', thickness: 1, pattern: 'solid', transparency: 0 };
    const applied = [];
    window.Shared.gridControls.show({
      scopeId: 'hist',
      ownerTabId: 'tab-a',
      host,
      target: host,
      controls: { thicknessStep: 0.25 },
      getStyle: () => ({ ...style }),
      onStyleChange(next) {
        style = { ...next };
        applied.push(style.thickness);
      }
    });

    const chip = host.querySelector('.grid-controls-panel .shared-border-style-chip');
    expect(chip).toBeTruthy();
    const panel = host.querySelector('.grid-controls-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.style.display).toBe('');
    for(let i = 0; i < 4; i += 1){
      wheel(chip, -100);
    }
    expect(style.thickness).toBe(1);

    flushLiveFrame();
    expect(style.thickness).toBe(2);
    expect(applied).toEqual([2]);
    expect(recorded).toHaveLength(0);

    finishGesture();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('grid:hist:thickness');
    expect(recorded[0].from).toBe(1);
    expect(recorded[0].to).toBe(2);
  });

  test('shared line style chips round fractional pixel widths without changing the value', () => {
    installSharedModules('../../js/shared/gridControls.js');
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'hist';
    host.dataset.workspaceTabId = 'tab-a';
    document.body.appendChild(host);

    const style = { color: '#dddddd', thickness: 1.8391, pattern: 'solid', transparency: 0 };
    window.Shared.gridControls.show({
      scopeId: 'hist',
      ownerTabId: 'tab-a',
      host,
      target: host,
      controls: { thicknessStep: 0.5 },
      getStyle: () => ({ ...style }),
      onStyleChange: () => {}
    });

    const value = host.querySelector('.grid-controls-panel .shared-border-style-chip-value');
    expect(value?.textContent).toBe('1.84px');
    expect(style.thickness).toBe(1.8391);
  });

  test('tab-owned numeric drag stops before a delayed pointer event can reach the next owner', () => {
    installSharedModules('../../js/shared/gridControls.js');
    const surface = document.createElement('button');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.25';
    input.value = '1';
    document.body.append(surface, input);
    const ownerA = {};
    const ownerB = {};
    let owner = { tabId: 'tab-a', token: ownerA };
    let activeTabId = 'tab-a';
    window.Main = { session: { getActiveTab: () => ({ id: activeTabId }) } };
    const events = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    input.addEventListener(window.Shared.workspaceToolbar.numericWheelEndEventName, event => {
      events.push(`end:${event.detail.committed}:${event.detail.reason}`);
    });

    window.Shared.workspaceToolbar.bindTabOwnedNumericDrag(surface, input, {
      resolveOwner: () => owner,
      calculateValue: ({ startValue, deltaX, step }) =>
        startValue + (Math.round(deltaX / 8) * step)
    });
    surface.dispatchEvent(new MouseEvent('mousedown', {
      altKey: true,
      button: 0,
      clientX: 160,
      bubbles: true,
      cancelable: true
    }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 168 }));
    expect(input.value).toBe('1.25');
    expect(events).toEqual(['input']);

    activeTabId = 'tab-b';
    owner = { tabId: 'tab-b', token: ownerB };
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 176 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176 }));
    expect(input.value).toBe('1.25');
    expect(events).toEqual(['input', 'end:false:stale-owner']);
  });

  test('tab-owned numeric drag commits its captured owner when that panel deactivates', () => {
    installSharedModules('../../js/shared/gridControls.js');
    const surface = document.createElement('button');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.25';
    input.value = '1';
    document.body.append(surface, input);
    const ownerA = {};
    let owner = { tabId: 'tab-a', token: ownerA };
    let activeTabId = 'tab-a';
    window.Main = { session: { getActiveTab: () => ({ id: activeTabId }) } };
    const events = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    input.addEventListener(window.Shared.workspaceToolbar.numericWheelEndEventName, event => {
      events.push(`end:${event.detail.committed}:${event.detail.reason}`);
    });

    window.Shared.workspaceToolbar.bindTabOwnedNumericDrag(surface, input, {
      resolveOwner: () => owner,
      calculateValue: ({ startValue, deltaX, step }) =>
        startValue + (Math.round(deltaX / 8) * step)
    });
    surface.dispatchEvent(new MouseEvent('mousedown', {
      altKey: true,
      button: 0,
      clientX: 160,
      bubbles: true,
      cancelable: true
    }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 168 }));
    expect(window.Shared.workspaceToolbar.finishTabOwnedNumericDrag('tab-a', {
      commit: true,
      reason: 'owner-deactivation'
    })).toBe(true);
    activeTabId = 'tab-b';
    owner = { tabId: 'tab-b', token: {} };
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 176 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176 }));

    expect(input.value).toBe('1.25');
    expect(events).toEqual(['input', 'change', 'end:true:owner-deactivation']);
  });

  test('additional-line width keeps the configured tenth-pixel step instead of a hard-coded half-pixel step', () => {
    const recorded = installSharedModules('../../js/shared/additionalLineControls.js');
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'box';
    host.dataset.workspaceTabId = 'tab-a';
    document.body.appendChild(host);

    let thickness = 2;
    window.Shared.additionalLineControls.show({
      scopeId: 'box',
      host,
      target: host,
      controls: {
        showSummary: false,
        showScope: false,
        showPattern: false,
        showTransparency: false,
        thicknessStep: 0.1
      },
      getThickness: () => thickness,
      onThicknessChange(value) {
        thickness = Number(value);
      },
      getColor: () => '#000000',
      onColorChange: () => {}
    });

    const panel = host.querySelector('.additional-line-controls-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.style.display).toBe('');
    const chip = host.querySelector('.additional-line-controls-panel .shared-border-style-chip');
    expect(chip).toBeTruthy();
    for(let i = 0; i < 3; i += 1){
      wheel(chip, -100);
    }
    flushLiveFrame();
    expect(thickness).toBeCloseTo(2.3, 8);
    expect(recorded).toHaveLength(0);

    finishGesture();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('additionalLine:box:thickness');
    expect(recorded[0].from).toBe(2);
    expect(recorded[0].to).toBeCloseTo(2.3, 8);
  });

  test('significance thickness keeps one owner-scoped undo transaction across a wheel burst', () => {
    const recorded = installSharedModules('../../js/shared/significanceControls.js');
    let activeTabId = 'tab-a';
    window.Main = {
      session: {
        getActiveTab: () => ({ id: activeTabId })
      }
    };

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'box';
    document.body.appendChild(host);
    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(line);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    let thickness = 1;
    window.Shared.significanceControls.registerSignificanceElement(line, {
      orientation: 'vertical',
      scopeId: 'box',
      disableOverlay: true,
      getThickness: () => thickness,
      getColor: () => '#000000',
      getWhiskers: () => true,
      onThicknessChange(value) {
        thickness = Number(value);
      },
      onColorChange: () => {},
      onWhiskersChange: () => {}
    });
    line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const panel = host.querySelector('.significance-controls-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.style.display).toBe('');
    const chip = host.querySelector('.significance-controls-panel .shared-border-style-chip');
    expect(chip).toBeTruthy();
    expect(host.dataset.workspaceTabId).toBe('tab-a');

    wheel(chip, -100);
    wheel(chip, -100);
    flushLiveFrame();
    expect(thickness).toBe(1.5);
    expect(recorded).toHaveLength(0);

    finishGesture();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('significance:box:vertical:thickness');
    expect(recorded[0].from).toBe(1);
    expect(recorded[0].to).toBe(1.5);

    activeTabId = 'tab-b';
    recorded[0].apply(recorded[0].from, 'undo');
    // Undo targets the original owner callback, while panel synchronization is
    // owner-scoped and must not repoint the visible toolbar at tab B.
    expect(thickness).toBe(1);
    expect(host.dataset.workspaceTabId).toBe('tab-a');
  });

  test('significance toolbar owns one Label control before scientific formatting', () => {
    installSharedModules('../../js/shared/significanceControls.js');
    window.Main = { session: { getActiveTab: () => ({ id: 'tab-a' }) } };
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'box';
    document.body.appendChild(host);

    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(line);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    window.Shared.significanceControls.registerSignificanceElement(line, {
      orientation: 'vertical',
      scopeId: 'box',
      disableOverlay: true,
      getLabelMode: () => 'p',
      getThickness: () => 1,
      getColor: () => '#000000',
      getWhiskers: () => true,
      getWhiskerMode: () => 'adaptive',
      getPScientific: () => false,
      getPDecimals: () => 2
    });
    line.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const fields = Array.from(host.querySelectorAll('.significance-controls-panel__field'))
      .map(field => field.querySelector('.significance-controls-panel__field-label')?.textContent);
    expect(fields).toEqual(['Style', 'Whiskers', 'Whisker style', 'Label', 'Scientific', 'Decimals']);
    const select = host.querySelector('[data-significance-label-mode]');
    expect(select.value).toBe('p');
    expect(host.querySelectorAll('[data-significance-label-mode]')).toHaveLength(1);
  });

  test('label, delayed color and drag edits keep their initiating owner', () => {
    let picker;
    const recorded = installSharedModules('../../js/shared/significanceControls.js');
    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'box';
    document.body.appendChild(host);
    window.Shared.openColorPicker = config => {
      picker = config;
      return document.createElement('div');
    };
    let active = 'tab-a';
    window.Main = { session: { getActiveTab: () => ({ id: active }) } };
    const settings = { 'tab-a': { mode: 'decision', thickness: 1, color: '#000000' }, 'tab-b': { mode: 'p', thickness: 2, color: '#ff0000' } };
    const lines = {};
    for(const id of Object.keys(settings)){
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const line = document.createElementNS(svg.namespaceURI, 'line');
      svg.appendChild(line);
      document.body.appendChild(svg);
      lines[id] = line;
      window.Shared.significanceControls.registerSignificanceElement(line, {
        scopeId: 'box', orientation: 'vertical', ownerTabId: id, disableOverlay: true,
        getLabelMode: () => settings[id].mode,
        onLabelModeChange: value => { settings[id].mode = value; },
        getThickness: () => settings[id].thickness,
        onThicknessChange: value => { settings[id].thickness = value; },
        getColor: () => settings[id].color,
        onColorChange: value => { settings[id].color = value; }
      });
    }
    lines['tab-a'].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const panel = document.querySelector('.significance-controls-panel');
    const select = panel.querySelector('[data-significance-label-mode]');
    select.value = 'p';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(settings['tab-a'].mode).toBe('p');
    expect(recorded.at(-1).label).toBe('significance:box:vertical:label-mode');
    const chip = panel.querySelector('.shared-border-style-chip');
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, altKey: true, button: 0, clientX: 0 }));
    active = 'tab-b';
    lines['tab-b'].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.querySelectorAll('[data-significance-label-mode]')).toHaveLength(1);
    picker.onInput('#00ff00');
    picker.onChange('#00ff00');
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 80 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(settings['tab-b']).toEqual({ mode: 'p', thickness: 2, color: '#ff0000' });
    recorded[0].apply(recorded[0].from, 'undo');
    expect(settings['tab-a'].mode).toBe('decision');
    expect(select.value).toBe('p');
  });
});
