describe('workspace toolbar numeric wheel editing', () => {
  function wheel(target, deltaY, init = {}) {
    target.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY,
      ...init
    }));
  }

  function mountNumber(surfaceClass, attrs = {}) {
    const surface = document.createElement('div');
    surface.className = surfaceClass;
    const input = document.createElement('input');
    input.type = 'number';
    Object.entries(attrs).forEach(([key, value]) => {
      input[key] = String(value);
    });
    surface.appendChild(input);
    document.body.appendChild(surface);
    return { surface, input };
  }

  function toolbarApi() {
    return window.Shared.workspaceToolbar;
  }

  test.each([
    [1.8391, 0.5, '1.84'],
    [1.236789, 0.5, '1.24'],
    [0.25, 0.5, '0.25'],
    [1.2, 0.1, '1.2']
  ])('formats px display values to at most two decimals (%s)', (value, step, expected) => {
    expect(toolbarApi().formatPxDisplayValue(value, step)).toBe(expected);
    expect(toolbarApi().formatNumericValue(value, step)).toBe(String(value));
  });

  test('rounds a numeric popup projection without changing its canonical input', () => {
    const canonicalInput = document.createElement('input');
    canonicalInput.type = 'number';
    canonicalInput.min = '0';
    canonicalInput.max = '10';
    canonicalInput.step = '0.5';
    canonicalInput.value = '1.8391';
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);

    const cleanup = toolbarApi().attachColorPickerNumericSection(overlay, {
      canonicalInput,
      title: 'Line width'
    });
    const mirrorInput = overlay.querySelector('input[type="number"]');

    expect(mirrorInput.value).toBe('1.84');
    expect(canonicalInput.value).toBe('1.8391');

    cleanup();
  });

  function flushLiveFrame() {
    jest.advanceTimersByTime(0);
  }

  function finishIdleGesture() {
    jest.advanceTimersByTime(toolbarApi().numericWheelCommitDelayMs);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => (
      window.setTimeout(() => callback(performance.now()), 0)
    ));
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => window.clearTimeout(handle));
  });

  afterEach(() => {
    toolbarApi().flushNumericWheelGesture({ commit: false, reason: 'test-cleanup' });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  test.each([
    '.workspace-toolbar',
    '.font-toolbar-host',
    '.workspace-toolbar__panel',
    '.workspace-toolbar__menu-list',
    '.workspace-toolbar__transform-custom-dropdown',
    '.shared-color-picker',
    '.resizer-control-tray',
    '.resizer-options',
    '.resizer-options-menu'
  ])('wheel burst adjusts numeric inputs in %s live and commits once', surfaceClass => {
    const { input } = mountNumber(surfaceClass.slice(1), {
      value: 5,
      min: 0,
      max: 10,
      step: 0.5
    });
    const events = [];
    input.addEventListener('input', () => events.push(`input:${input.value}`));
    input.addEventListener('change', () => events.push(`change:${input.value}`));

    wheel(input, -100);
    wheel(input, -100);
    expect(input.value).toBe('6');
    expect(events).toEqual([]);

    flushLiveFrame();
    expect(events).toEqual(['input:6']);
    jest.advanceTimersByTime(toolbarApi().numericWheelCommitDelayMs - 1);
    expect(events).toEqual(['input:6']);
    jest.advanceTimersByTime(1);
    expect(events).toEqual(['input:6', 'change:6']);

    wheel(input, 100);
    expect(input.value).toBe('5.5');
    flushLiveFrame();
    finishIdleGesture();
    expect(events).toEqual(['input:6', 'change:6', 'input:5.5', 'change:5.5']);
  });

  test('starts wheel idle timing after live projection so slow redraws cannot commit re-entrantly', () => {
    const { input } = mountNumber('workspace-toolbar__panel', {
      value: 1,
      min: 0,
      max: 10,
      step: 0.25
    });
    const events = [];
    input.addEventListener('input', () => {
      events.push(`input:${toolbarApi().getNumericWheelPhase(input)}`);
      // Model a costly synchronous graph redraw. The idle timer must not already
      // be aging while this live projection is still executing.
      jest.advanceTimersByTime(toolbarApi().numericWheelCommitDelayMs + 50);
      events.push(`input-end:${toolbarApi().getNumericWheelPhase(input)}`);
    });
    input.addEventListener('change', () => {
      events.push(`change:${toolbarApi().getNumericWheelPhase(input)}`);
    });

    wheel(input, -1);
    flushLiveFrame();

    expect(events).toEqual(['input:live', 'input-end:live']);
    expect(toolbarApi().getNumericWheelPhase(input)).toBe('active');
    jest.advanceTimersByTime(toolbarApi().numericWheelCommitDelayMs - 1);
    expect(events).toEqual(['input:live', 'input-end:live']);
    jest.advanceTimersByTime(1);
    expect(events).toEqual(['input:live', 'input-end:live', 'change:commit']);
  });

  test('does not resurrect a wheel gesture closed synchronously by its live input handler', () => {
    const { input } = mountNumber('workspace-toolbar__panel', {
      value: 1,
      min: 0,
      max: 10,
      step: 0.25
    });
    const events = [];
    input.addEventListener('input', () => {
      events.push(`input:${toolbarApi().getNumericWheelPhase(input)}`);
      toolbarApi().flushNumericWheelGesture({ commit: false, reason: 'test-live-close' });
      events.push(`input-end:${toolbarApi().getNumericWheelPhase(input) || 'none'}`);
    });
    input.addEventListener('change', () => events.push('change'));

    wheel(input, -1);
    flushLiveFrame();

    expect(events).toEqual(['input:live', 'input-end:none']);
    expect(toolbarApi().getNumericWheelPhase(input)).toBeNull();
    jest.advanceTimersByTime(toolbarApi().numericWheelCommitDelayMs * 2);
    expect(events).toEqual(['input:live', 'input-end:none']);
  });

  test('coalesces rapid wheel events to at most one live input event per animation frame', () => {
    const { input } = mountNumber('workspace-toolbar__panel', {
      value: 1,
      min: 0,
      max: 10,
      step: 0.25
    });
    const liveValues = [];
    input.addEventListener('input', () => liveValues.push(Number(input.value)));

    for(let i = 0; i < 6; i += 1){
      wheel(input, -1);
    }
    expect(input.value).toBe('2.5');
    expect(liveValues).toEqual([]);

    flushLiveFrame();
    expect(liveValues).toEqual([2.5]);

    wheel(input, -1);
    wheel(input, -1);
    flushLiveFrame();
    expect(liveValues).toEqual([2.5, 3]);
  });

  test('switching numeric controls commits the first gesture before starting the second', () => {
    const first = mountNumber('workspace-toolbar__panel', { value: 1, step: 1 }).input;
    const second = mountNumber('workspace-toolbar__panel', { value: 10, step: 2 }).input;
    const events = [];
    first.addEventListener('input', () => events.push(`first-input:${first.value}`));
    first.addEventListener('change', () => events.push(`first-change:${first.value}`));
    second.addEventListener('input', () => events.push(`second-input:${second.value}`));
    second.addEventListener('change', () => events.push(`second-change:${second.value}`));

    wheel(first, -1);
    wheel(second, -1);

    expect(events).toEqual(['first-input:2', 'first-change:2']);
    expect(second.value).toBe('12');
    flushLiveFrame();
    finishIdleGesture();
    expect(events).toEqual([
      'first-input:2',
      'first-change:2',
      'second-input:12',
      'second-change:12'
    ]);
  });

  test('wheel adjusts the font-size numeric text field using its declared half-point step', () => {
    const surface = document.createElement('div');
    surface.className = 'font-toolbar-host';
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('inputmode', 'decimal');
    input.min = '5';
    input.max = '96';
    input.step = '0.5';
    input.value = '14';
    surface.appendChild(input);
    document.body.appendChild(surface);

    const events = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));

    wheel(input, -1);
    expect(input.value).toBe('14.5');
    flushLiveFrame();
    expect(events).toEqual(['input']);
    finishIdleGesture();
    expect(events).toEqual(['input', 'change']);
  });

  test('uses value precision for step=any toolbar inputs', () => {
    const { input } = mountNumber('workspace-toolbar__panel', {
      value: 0.25,
      step: 'any'
    });

    wheel(input, -1);
    expect(input.value).toBe('0.26');
    flushLiveFrame();
    finishIdleGesture();

    wheel(input, 1);
    expect(input.value).toBe('0.25');
  });

  test('respects native min/max and leaves non-toolbar numeric inputs alone', () => {
    const { input: toolbarInput } = mountNumber('workspace-toolbar__panel', {
      value: 2,
      min: 0,
      max: 2,
      step: 1
    });
    const events = [];
    toolbarInput.addEventListener('input', () => events.push('input'));
    toolbarInput.addEventListener('change', () => events.push('change'));

    wheel(toolbarInput, -1);
    expect(toolbarInput.value).toBe('2');
    finishIdleGesture();
    expect(events).toEqual([]);

    const outside = document.createElement('input');
    outside.type = 'number';
    outside.value = '5';
    outside.step = '1';
    document.body.appendChild(outside);
    wheel(outside, -1);
    expect(outside.value).toBe('5');
  });


  test('drops a pending wheel commit when its toolbar owner tab is no longer active', () => {
    const previousMain = window.Main;
    let activeTabId = 'tab-a';
    window.Main = {
      session: {
        getActiveTab: () => ({ id: activeTabId })
      }
    };
    try{
      const { surface, input } = mountNumber('font-toolbar-host', {
        value: 1,
        step: 0.25
      });
      toolbarApi().showHost(surface, { ownerTabId: 'tab-a' });
      expect(surface.dataset.workspaceTabId).toBe('tab-a');

      const events = [];
      input.addEventListener('input', () => events.push(`input:${input.value}`));
      input.addEventListener('change', () => events.push(`change:${input.value}`));

      wheel(input, -1);
      expect(input.value).toBe('1.25');
      activeTabId = 'tab-b';
      flushLiveFrame();
      finishIdleGesture();

      expect(events).toEqual([]);
      expect(toolbarApi().getNumericWheelPhase(input)).toBeNull();
    } finally {
      window.Main = previousMain;
    }
  });


  test('hiding an unrelated toolbar host does not terminate another host wheel gesture', () => {
    const first = mountNumber('font-toolbar-host', { value: 1, step: 0.25 });
    const secondHost = document.createElement('div');
    secondHost.className = 'font-toolbar-host';
    document.body.appendChild(secondHost);
    toolbarApi().showHost(first.surface, { ownerTabId: 'tab-a' });
    toolbarApi().showHost(secondHost, { ownerTabId: 'tab-a' });

    const events = [];
    first.input.addEventListener('input', () => events.push(`input:${first.input.value}`));
    first.input.addEventListener('change', () => events.push(`change:${first.input.value}`));

    wheel(first.input, -1);
    expect(first.input.value).toBe('1.25');
    toolbarApi().hideHost(secondHost);
    expect(events).toEqual([]);
    expect(toolbarApi().getNumericWheelPhase(first.input)).toBe('active');

    toolbarApi().hideHost(first.surface);
    expect(events).toEqual(['input:1.25', 'change:1.25']);
    expect(toolbarApi().getNumericWheelPhase(first.input)).toBeNull();
  });

  test('emits an explicit non-committed wheel-end signal when owner validation cancels a gesture', () => {
    const previousMain = window.Main;
    let activeTabId = 'tab-a';
    window.Main = {
      session: {
        getActiveTab: () => ({ id: activeTabId })
      }
    };
    try{
      const { surface, input } = mountNumber('font-toolbar-host', {
        value: 1,
        step: 0.25
      });
      toolbarApi().showHost(surface, { ownerTabId: 'tab-a' });
      const endings = [];
      input.addEventListener(toolbarApi().numericWheelEndEventName, event => endings.push(event.detail));

      wheel(input, -1);
      activeTabId = 'tab-b';
      flushLiveFrame();
      finishIdleGesture();

      expect(endings).toHaveLength(1);
      expect(endings[0]).toMatchObject({
        committed: false,
        changed: true,
        ownerTabId: 'tab-a',
        reason: 'idle'
      });
    } finally {
      window.Main = previousMain;
    }
  });

  test('numeric mirrors forward one live value, one commit, and cancellation to the canonical control', () => {
    const mirror = mountNumber('shared-color-picker', {
      value: 1,
      step: 0.25
    }).input;
    const canonicalSurface = document.createElement('div');
    canonicalSurface.className = 'workspace-toolbar__panel';
    const canonical = document.createElement('input');
    canonical.type = 'number';
    canonical.value = '1';
    canonicalSurface.appendChild(canonical);
    document.body.appendChild(canonicalSurface);

    const events = [];
    const phases = [];
    canonical.addEventListener('input', () => {
      phases.push(toolbarApi().getNumericWheelPhase(canonical));
      events.push(`input:${canonical.value}`);
    });
    canonical.addEventListener('change', () => {
      phases.push(toolbarApi().getNumericWheelPhase(canonical));
      events.push(`change:${canonical.value}`);
    });
    canonical.addEventListener(toolbarApi().numericWheelEndEventName, event => {
      events.push(`end:${event.detail.committed}:${event.detail.reason}`);
    });
    const cleanup = toolbarApi().bindNumericInputMirror(mirror, canonical);

    wheel(mirror, -1);
    wheel(mirror, -1);
    flushLiveFrame();
    expect(canonical.value).toBe('1.5');
    expect(events).toEqual(['input:1.5']);
    finishIdleGesture();
    expect(events).toEqual(['input:1.5', 'change:1.5', 'end:true:idle']);
    expect(phases).toEqual(['live', 'commit']);

    wheel(mirror, -1);
    flushLiveFrame();
    expect(canonical.value).toBe('1.75');
    toolbarApi().flushNumericWheelGesture({ commit: false, reason: 'mirror-cancel' });
    expect(events).toEqual([
      'input:1.5',
      'change:1.5',
      'end:true:idle',
      'input:1.75',
      'end:false:mirror-cancel'
    ]);
    cleanup();
  });

  test('does not intercept modified wheel gestures or disabled inputs', () => {
    const { input } = mountNumber('workspace-toolbar__panel', {
      value: 5,
      step: 1
    });

    wheel(input, -1, { ctrlKey: true });
    expect(input.value).toBe('5');
    wheel(input, -1, { shiftKey: true });
    expect(input.value).toBe('5');

    input.disabled = true;
    wheel(input, -1);
    expect(input.value).toBe('5');
  });
});
