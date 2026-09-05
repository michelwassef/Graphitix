// Smoke tests for js/shared/axisControls.js.
// The module is a DOM-driven UI panel; these tests verify it loads without error,
// exposes its public API, and that API calls are safe when no DOM panel exists.

function loadModule() {
  jest.resetModules();
  delete window.Shared;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  require('../js/shared/axisControls.js');
  console.error.mockRestore();
  return window.Shared.axisControls;
}

describe('axisControls — module shape', () => {
  let ac;
  beforeEach(() => { ac = loadModule(); });

  test('exposes axisControls namespace on window.Shared', () => {
    expect(window.Shared).toBeDefined();
    expect(typeof window.Shared.axisControls).toBe('object');
    expect(window.Shared.axisControls).not.toBeNull();
  });

  test('public API functions exist', () => {
    expect(typeof ac.ensurePanel).toBe('function');
    expect(typeof ac.registerAxisElement).toBe('function');
    expect(typeof ac.rehydrateAxisElements).toBe('function');
    expect(typeof ac.getAxisElementMetadata).toBe('function');
    expect(typeof ac.isAxisElementBound).toBe('function');
    expect(typeof ac.measureRenderedAxes).toBe('function');
    expect(typeof ac.refreshActivePanel).toBe('function');
    expect(typeof ac.close).toBe('function');
  });
});

describe('axisControls — rendered axis measurement', () => {
  test('measures projected 3D x/y axis lines independently of their angle', () => {
    const ac = loadModule();
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.getBoundingClientRect = () => ({ width: 200, height: 300, left: 0, top: 0, right: 200, bottom: 300 });
    const addAxis = (key, x2, y2) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('data-axis-line', '1');
      line.setAttribute('data-axis-key', key);
      svg.appendChild(line);
    };
    addAxis('x', 100, 50);
    addAxis('y', 20, 100);
    root.appendChild(svg);

    const measured = ac.measureRenderedAxes(root);
    expect(measured.x).toBeCloseTo(Math.hypot(100, 50) * 2, 9);
    expect(measured.y).toBeCloseTo(Math.hypot(20, 100) * 2, 9);
  });
});

describe('axisControls — effective tick interval', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('shows the rendered automatic interval and increments from it', () => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', '0');
    axis.setAttribute('y1', '10');
    axis.setAttribute('x2', '100');
    axis.setAttribute('y2', '10');
    svg.appendChild(axis);
    document.body.appendChild(svg);

    let storedInterval = null;
    window.Shared.axisControls.registerAxisElement(axis, {
      axis: 'x',
      scopeId: 'test',
      getTickInterval: () => storedInterval,
      getEffectiveTickInterval: () => 5,
      onTickIntervalChange: value => { storedInterval = value; },
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {},
      isTickIntervalEnabled: () => true
    });

    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = host.querySelector('.axis-controls-panel__field--numeric input[type="number"]');
    expect(input).toBeTruthy();
    expect(input.value).toBe('5');
    expect(input.dataset.usesDefault).toBe('1');

    input.stepUp();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(storedInterval).toBe(6);
    expect(input.value).toBe('6');
    expect(input.dataset.usesDefault).toBe('0');

    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', '0');
    yAxis.setAttribute('y1', '0');
    yAxis.setAttribute('x2', '0');
    yAxis.setAttribute('y2', '100');
    svg.appendChild(yAxis);
    let storedYInterval = null;
    window.Shared.axisControls.registerAxisElement(yAxis, {
      axis: 'y',
      scopeId: 'test',
      getTickInterval: () => storedYInterval,
      getEffectiveTickInterval: () => 0.025,
      onTickIntervalChange: value => { storedYInterval = value; },
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {},
      isTickIntervalEnabled: () => true
    });
    yAxis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(input.value).toBe('0.025');
    expect(input.step).toBe('1');
    input.stepUp();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(storedYInterval).toBeCloseTo(1.025, 12);
    input.stepDown();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(storedYInterval).toBeCloseTo(0.025, 12);
  });
});


describe('axisControls — generic numeric wheel editing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    window.Shared?.workspaceToolbar?.flushNumericWheelGesture?.({ commit: false, reason: 'test-cleanup' });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('hover-wheel treats tick interval and tick length bursts as one undoable edit each', () => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/styleUndo.js');

    const recorded = [];
    window.Shared.undoManager = {
      recordStateChange: entry => recorded.push(entry)
    };
    require('../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);

    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(axis);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    let tickInterval = 10;
    let tickLength = 6;
    window.Shared.axisControls.registerAxisElement(axis, {
      axis: 'y',
      scopeId: 'test',
      getTickInterval: () => tickInterval,
      getEffectiveTickInterval: () => tickInterval,
      onTickIntervalChange: value => { tickInterval = value; },
      isTickIntervalEnabled: () => true,
      getMajorTickLength: () => tickLength,
      onMajorTickLengthChange: value => { tickLength = value; },
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {}
    });

    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const intervalInput = host.querySelector(
      '.axis-controls-panel__field--tick-interval input[type="number"]'
    );
    const tickLengthInput = host.querySelector(
      '.axis-controls-panel__field--major-tick-length input[type="number"]'
    );
    const toolbarApi = window.Shared.workspaceToolbar;
    expect(intervalInput.value).toBe('10');
    expect(tickLengthInput.value).toBe('6');

    const wheelEvent = deltaY => ({ deltaY, preventDefault: jest.fn() });
    toolbarApi.handleNumericWheelEvent(wheelEvent(-100), intervalInput);
    toolbarApi.handleNumericWheelEvent(wheelEvent(-100), intervalInput);
    expect(intervalInput.value).toBe('12');
    expect(tickInterval).toBe(10);
    jest.advanceTimersByTime(0);
    expect(tickInterval).toBe(12);
    expect(recorded).toHaveLength(0);

    // Starting a gesture on another control commits the previous one first.
    toolbarApi.handleNumericWheelEvent(wheelEvent(100), tickLengthInput);
    expect(recorded.map(entry => entry.label)).toEqual(['axis:test:y:tick']);
    expect(tickLengthInput.value).toBe('5');
    jest.advanceTimersByTime(0);
    expect(tickLength).toBe(5);
    expect(recorded).toHaveLength(1);

    jest.advanceTimersByTime(toolbarApi.numericWheelCommitDelayMs);
    expect(recorded.map(entry => entry.label)).toEqual([
      'axis:test:y:tick',
      'axis:test:y:majorTickLength'
    ]);
    expect(recorded[0].from).toBe(10);
    expect(recorded[0].to).toBe(12);
    expect(recorded[1].from).toBe(6);
    expect(recorded[1].to).toBe(5);
  });
});


describe('axisControls — X tick label angle editing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    window.Shared?.workspaceToolbar?.flushNumericWheelGesture?.({ commit: false, reason: 'test-cleanup' });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('shows the angle control only for supported X axes and records one undoable wheel edit', () => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/styleUndo.js');
    require('../js/shared/chartStyle.js');

    const recorded = [];
    window.Shared.undoManager = {
      recordStateChange: entry => recorded.push(entry)
    };
    require('../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);

    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const xAxis = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(xAxis);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    let labelAngle = null;
    window.Shared.axisControls.registerAxisElement(xAxis, {
      axis: 'x',
      scopeId: 'test',
      tabId: 'tab-a',
      getTickInterval: () => null,
      onTickIntervalChange: () => {},
      getTickLabelAngle: () => labelAngle,
      onTickLabelAngleChange: value => { labelAngle = value; },
      isTickLabelAngleSupported: () => true,
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {}
    });

    xAxis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const angleField = host.querySelector('.axis-controls-panel__field--tick-label-angle');
    const angleInput = angleField?.querySelector('input[type="number"]');
    expect(angleField?.hidden).toBe(false);
    expect(angleInput).toBeTruthy();
    expect(angleInput.value).toBe('');
    expect(angleInput.placeholder).toBe('Auto');
    expect(angleInput.min).toBe('-90');
    expect(angleInput.max).toBe('90');

    labelAngle = 0;
    expect(window.Shared.axisControls.refreshActivePanel()).toBe(true);
    jest.advanceTimersByTime(0);
    expect(angleInput.value).toBe('0');

    const toolbarApi = window.Shared.workspaceToolbar;
    toolbarApi.handleNumericWheelEvent({ deltaY: 100, preventDefault: jest.fn() }, angleInput);
    expect(angleInput.value).toBe('-5');
    jest.advanceTimersByTime(0);
    expect(labelAngle).toBe(-5);
    jest.advanceTimersByTime(toolbarApi.numericWheelCommitDelayMs);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('axis:test:x:tickLabelAngle');
    expect(recorded[0].from).toBe(0);
    expect(recorded[0].to).toBe(-5);
  });
});


describe('axisControls — thickness wheel commit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    window.Shared?.workspaceToolbar?.flushNumericWheelGesture?.({ commit: false, reason: 'test-cleanup' });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('wheel thickness uses the declared quarter-pixel step and records one edit for the burst', () => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/styleUndo.js');

    const recorded = [];
    window.Shared.undoManager = {
      recordStateChange: entry => recorded.push(entry)
    };
    require('../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);

    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(axis);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    let thickness = 1;
    window.Shared.axisControls.registerAxisElement(axis, {
      axis: 'y',
      scopeId: 'test',
      getThickness: () => thickness,
      getColor: () => '#000000',
      onThicknessChange: value => { thickness = value; },
      onColorChange: () => {}
    });

    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const chip = host.querySelector('.shared-border-style-chip');
    expect(chip).toBeTruthy();

    for(let i = 0; i < 3; i += 1){
      chip.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    }

    expect(thickness).toBe(1);
    jest.advanceTimersByTime(0);
    expect(thickness).toBe(1.75);
    expect(recorded).toHaveLength(0);

    jest.advanceTimersByTime(window.Shared.workspaceToolbar.numericWheelCommitDelayMs);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('axis:test:y:thickness');
    expect(recorded[0].from).toBe(1);
    expect(recorded[0].to).toBe(1.75);

    recorded[0].apply(recorded[0].from, 'undo');
    expect(thickness).toBe(1);
    recorded[0].apply(recorded[0].to, 'redo');
    expect(thickness).toBe(1.75);
  });
});


describe('axisControls — axis length wheel gesture', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    window.Shared?.workspaceToolbar?.flushNumericWheelGesture?.({ commit: false, reason: 'test-cleanup' });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('forced axis-length proportions stay checked and cannot be disabled by the toolbar', () => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/styleUndo.js');
    require('../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);

    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(axis);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    const requests = [];
    window.Shared.axisControls.registerAxisElement(axis, {
      axis: 'x',
      scopeId: 'test',
      tabId: 'tab-a',
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {},
      getAxisLength: () => 120,
      getAxisLengthBounds: () => ({ min: 20, max: 600, step: 1 }),
      onAxisLengthChange: (value, _axis, options = {}) => requests.push({ value: Number(value), preserveProportions: options.preserveProportions }),
      isAxisLengthProportionLocked: () => true
    });

    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const preserve = host.querySelector('.axis-controls-panel__length-preserve input[type="checkbox"]');
    const input = host.querySelector('.axis-controls-panel__field--length input[type="number"]');
    expect(preserve).toBeTruthy();
    expect(preserve.checked).toBe(true);
    expect(preserve.disabled).toBe(true);

    preserve.checked = false;
    preserve.dispatchEvent(new Event('change', { bubbles: true }));
    expect(preserve.checked).toBe(true);

    input.value = '140';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(requests).toEqual([{ value: 140, preserveProportions: true }]);
  });

  test('proportional axis-length refinement scales the frame instead of assuming a 1:1 pixel response', () => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/styleUndo.js');
    require('../js/shared/axisControls.js');

    const compute = window.Shared.axisControls.computeAxisLengthResizeRequest;
    expect(typeof compute).toBe('function');

    // Synthetic PCA-like geometry: a square outer frame drives Y directly,
    // while metric X is 2.6x Y. The former additive correction diverges here
    // because +1 frame px moves X by >2 px. Measured secant refinement converges.
    const inset = 160;
    const metricAspect = 2.6;
    const requested = 760;
    let size = { width: 427, height: 427 };
    const measureX = current => metricAspect * (current.height - inset);

    let previousSample = null;
    for(let pass = 0; pass < 3; pass += 1){
      const measured = measureX(size);
      if(Math.abs(measured - requested) < 0.25){
        break;
      }
      const currentBasis = size.width;
      const plan = compute({
        axis: 'x',
        requestedLength: requested,
        currentAxisLength: measured,
        currentSize: size,
        preserveProportions: true,
        previousSample
      });
      expect(plan).toBeTruthy();
      expect(plan.axis).toBe('both');
      expect(plan.width / plan.height).toBeCloseTo(1, 12);
      previousSample = { basis: currentBasis, length: measured };
      size = { width: plan.width, height: plan.height };
    }

    expect(Math.abs(measureX(size) - requested)).toBeLessThan(0.25);
  });

  test('coalesces rapid wheel length changes and performs one final authoritative commit', () => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/styleUndo.js');

    const recorded = [];
    window.Shared.undoManager = {
      recordStateChange: entry => recorded.push(entry)
    };
    require('../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);

    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(axis);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    let axisLength = 100;
    let graphSize = { width: 400, height: 400 };
    const requests = [];
    window.Shared.axisControls.registerAxisElement(axis, {
      axis: 'y',
      scopeId: 'test',
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {},
      getAxisLength: () => axisLength,
      getAxisLengthBounds: () => ({ min: 20, max: 600, step: 1 }),
      getGraphSize: () => ({ ...graphSize }),
      onAxisLengthChange: (value, _axis, options = {}) => {
        const numeric = Number(value);
        requests.push({ value: numeric, reason: options.reason, refine: options.refine, axisBasisOffsetPx: options.axisBasisOffsetPx });
        graphSize = { ...graphSize, height: graphSize.height + (numeric - axisLength) };
        axisLength = numeric;
      },
      onGraphSizeChange: value => {
        graphSize = { width: Number(value.width), height: Number(value.height) };
      }
    });

    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const lengthField = host.querySelector('.axis-controls-panel__field--length');
    const input = lengthField?.querySelector('input[type="number"]');
    expect(input).toBeTruthy();
    expect(input.value).toBe('100');

    const toolbarApi = window.Shared.workspaceToolbar;
    for(let i = 0; i < 5; i += 1){
      toolbarApi.handleNumericWheelEvent({ deltaY: -100, preventDefault(){} }, input);
    }
    expect(input.value).toBe('105');
    expect(requests).toEqual([]);

    jest.advanceTimersByTime(0);
    expect(requests).toEqual([
      { value: 105, reason: 'axis-length-wheel-live', refine: false, axisBasisOffsetPx: 300 }
    ]);
    expect(graphSize.height).toBe(405);
    expect(recorded).toHaveLength(0);

    jest.advanceTimersByTime(toolbarApi.numericWheelCommitDelayMs);
    expect(requests).toEqual([
      { value: 105, reason: 'axis-length-wheel-live', refine: false, axisBasisOffsetPx: 300 },
      { value: 105, reason: 'axis-length-wheel-commit', refine: true, axisBasisOffsetPx: 300 }
    ]);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('axis:test:y:axisLengthSize');
    expect(recorded[0].from).toEqual({ width: 400, height: 400 });
    expect(recorded[0].to).toEqual({ width: 400, height: 405 });
  });

  test('fallback refinement is latest-wins and stale scheduled passes cannot overwrite a newer request', () => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/axisControls.js');

    const shared = window.Shared;
    const runtimeBuckets = new Map();
    const sharedControlStores = new Map();
    shared.workspaceTabs = {
      ensureRuntimeBucket(tabId, componentKey) {
        const key = `${tabId}:${componentKey}`;
        if(!runtimeBuckets.has(key)){
          runtimeBuckets.set(key, {});
        }
        return runtimeBuckets.get(key);
      },
      ensureSharedControlState(tabId, controlKey) {
        const key = `${tabId}:${controlKey}`;
        if(!sharedControlStores.has(key)){
          sharedControlStores.set(key, {});
        }
        return sharedControlStores.get(key);
      },
      getSharedControlState(tabId, controlKey) {
        return sharedControlStores.get(`${tabId}:${controlKey}`) || null;
      }
    };
    shared.componentLifecycle = {
      scheduleComponentFrame(_owner, _componentKey, _meta, callback) {
        return setTimeout(callback, 0);
      },
      scheduleComponentTimeout(_owner, _componentKey, _meta, callback, delay) {
        return setTimeout(callback, delay);
      }
    };

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);

    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const box = document.createElement('div');
    box.className = 'svgbox';
    // The fallback axis-length editor is available only on a real shared resizable
    // box. Mirror that production contract instead of exercising a disabled input.
    box.__sharedResizableBoxApi = {};
    let boxHeight = 120;
    let measuredAxisHeight = 90;
    box.getBoundingClientRect = () => ({
      width: 400,
      height: boxHeight,
      left: 0,
      top: 0,
      right: 400,
      bottom: boxHeight
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    axis.setAttribute('x1', '0');
    axis.setAttribute('x2', '0');
    axis.setAttribute('y1', '0');
    axis.setAttribute('y2', '100');
    axis.getBoundingClientRect = () => ({
      width: 1,
      height: measuredAxisHeight,
      left: 0,
      top: 0,
      right: 1,
      bottom: measuredAxisHeight
    });
    svg.appendChild(axis);
    box.appendChild(svg);
    ownerRoot.appendChild(box);
    document.body.appendChild(ownerRoot);

    const applied = [];
    shared.applyResizableBoxSize = (_target, request) => {
      if(Number.isFinite(Number(request.height))){
        boxHeight = Number(request.height);
      }
      if(String(request.reason || '').endsWith('-refine')){
        // Simulate the renderer publishing the requested geometry after the
        // first refinement pass. Immediate input resizes intentionally leave
        // the measured axis stale so a correction is required.
        measuredAxisHeight = 120;
      }
      applied.push({
        reason: request.reason,
        height: boxHeight,
        resizePhase: request.resizePhase || null
      });
      return { width: 400, height: boxHeight };
    };

    shared.axisControls.registerAxisElement(axis, {
      axis: 'y',
      scopeId: 'test',
      tabId: 'tab-a',
      componentKey: 'hist',
      getResizeTarget: () => box,
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {}
    });

    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = host.querySelector('.axis-controls-panel__field--length input[type="number"]');
    expect(input).toBeTruthy();

    // Wheel-live axis length uses the same live layout phase as a resize handle
    // and must not start a refinement chain before the burst commits.
    const toolbarApi = shared.workspaceToolbar;
    toolbarApi.handleNumericWheelEvent({ deltaY: -100, preventDefault(){} }, input);
    jest.advanceTimersByTime(0);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      reason: 'axis-length-wheel-live',
      resizePhase: 'move'
    });
    jest.advanceTimersByTime(50);
    expect(applied).toHaveLength(1);
    toolbarApi.flushNumericWheelGesture({ commit: false, reason: 'test-reset' });

    applied.length = 0;
    boxHeight = 120;
    measuredAxisHeight = 90;
    delete box.dataset.axisDesiredLengthY;
    delete box.dataset.axisDesiredLengthYTs;

    input.value = '110';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const firstRequestHeight = applied.at(-1).height;
    expect(firstRequestHeight).toBe(140);

    // The first render has not published its final axis geometry yet. A newer
    // request arrives while the first correction chain is still pending.
    measuredAxisHeight = 105;
    input.value = '120';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const secondRequestHeight = applied.at(-1).height;
    expect(secondRequestHeight).toBe(155);
    expect(secondRequestHeight).toBeGreaterThan(firstRequestHeight);

    jest.advanceTimersByTime(1000);

    const immediateRequests = applied.filter(item => item.reason === 'axis-length-input');
    expect(immediateRequests).toHaveLength(2);
    const refinementHeights = applied
      .filter(item => item.reason === 'axis-length-input-refine')
      .map(item => item.height);
    // If the first generation were still alive it would first correct toward
    // the obsolete 110 px request. Only the latest 120 px generation may run.
    expect(refinementHeights).toEqual([170]);
    expect(boxHeight).toBe(170);
  });

});

describe('axisControls — tab ownership', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('an open toolbar cannot mutate a different active tab', () => {
    jest.resetModules();
    delete window.Shared;
    let activeTabId = 'tab-a';
    window.Main = {
      session: {
        getActiveTab: () => ({ id: activeTabId })
      }
    };
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/axisControls.js');

    const host = document.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = 'test';
    document.body.appendChild(host);
    const ownerRoot = document.createElement('div');
    ownerRoot.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(axis);
    ownerRoot.appendChild(svg);
    document.body.appendChild(ownerRoot);

    let thickness = 1;
    window.Shared.axisControls.registerAxisElement(axis, {
      axis: 'x',
      scopeId: 'test',
      getThickness: () => thickness,
      getColor: () => '#000000',
      onThicknessChange: value => { thickness = value; },
      onColorChange: () => {}
    });
    axis.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = host.querySelector('.axis-controls-panel__field--style input[type="number"]');
    expect(input).toBeTruthy();

    activeTabId = 'tab-b';
    input.value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(thickness).toBe(1);

    activeTabId = 'tab-a';
    input.value = '3';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(thickness).toBe(3);
  });
});

describe('axisControls — safe calls with no DOM panel', () => {
  let ac;
  beforeEach(() => { ac = loadModule(); });

  test('refreshActivePanel with no active panel does not throw', () => {
    expect(() => ac.refreshActivePanel()).not.toThrow();
  });

  test('refreshActivePanel with string reason does not throw', () => {
    expect(() => ac.refreshActivePanel('resize')).not.toThrow();
  });

  test('refreshActivePanel with scopeId filter returns false (no match)', () => {
    const result = ac.refreshActivePanel({ scopeId: 'nonexistent', reason: 'test' });
    expect(result === false || result === undefined || result == null).toBe(true);
  });

  test('close does not throw when panel is not open', () => {
    expect(() => ac.close()).not.toThrow();
  });
});

describe('axisControls — render-cache interaction rehydration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/axisControls.js');
  });

  test('serialized axes recover semantic metadata, live handlers, and reuse the cached hit target', () => {
    const ac = window.Shared.axisControls;
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    axis.setAttribute('x1', '0');
    axis.setAttribute('y1', '10');
    axis.setAttribute('x2', '100');
    axis.setAttribute('y2', '10');
    svg.appendChild(axis);
    root.appendChild(svg);
    document.body.appendChild(root);

    expect(ac.registerAxisElement(axis, {
      axis: 'x',
      scopeId: 'box',
      tabId: 'tab-a',
      getAxisBounds: () => ({ min: -2, max: 12 }),
      getEffectiveTickInterval: () => 2,
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {}
    })).toBe(true);
    expect(root.querySelectorAll('[data-axis-hit-target="1"]')).toHaveLength(1);

    const cachedMarkup = svg.outerHTML;
    root.innerHTML = cachedMarkup;
    const restoredSvg = root.querySelector('svg');
    const restoredAxis = restoredSvg.querySelector('[data-axis-control="1"]:not([data-axis-hit-target="1"])');
    expect(ac.isAxisElementBound(restoredAxis)).toBe(false);
    expect(ac.getAxisElementMetadata(restoredAxis)).toEqual(expect.objectContaining({
      axis: 'x',
      scopeId: 'box',
      tabId: 'tab-a',
      bounds: { min: -2, max: 12 },
      effectiveTickInterval: 2
    }));

    const factory = jest.fn((axisKey, element, meta) => ({
      axis: axisKey,
      scopeId: meta.scopeId,
      tabId: meta.tabId,
      getAxisBounds: () => meta.bounds,
      getEffectiveTickInterval: () => meta.effectiveTickInterval,
      getThickness: () => 1,
      getColor: () => '#000000',
      onThicknessChange: () => {},
      onColorChange: () => {}
    }));

    expect(ac.rehydrateAxisElements(restoredSvg, factory)).toBe(true);
    expect(ac.isAxisElementBound(restoredAxis)).toBe(true);
    expect(restoredSvg.querySelectorAll('[data-axis-hit-target="1"]')).toHaveLength(1);

    expect(ac.rehydrateAxisElements(restoredSvg, factory)).toBe(true);
    expect(restoredSvg.querySelectorAll('[data-axis-hit-target="1"]')).toHaveLength(1);
    expect(factory).toHaveBeenCalledWith('x', restoredAxis, expect.objectContaining({
      bounds: { min: -2, max: 12 },
      effectiveTickInterval: 2
    }));
  });

  test('legacy cached axes without data-axis-key infer their axis from line geometry', () => {
    const ac = window.Shared.axisControls;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = `
      <line data-axis-control="1" x1="0" y1="20" x2="100" y2="20"></line>
      <line data-axis-control="1" x1="15" y1="0" x2="15" y2="100"></line>
    `;
    document.body.appendChild(svg);
    const seen = [];
    expect(ac.rehydrateAxisElements(svg, axisKey => {
      seen.push(axisKey);
      return {
        axis: axisKey,
        scopeId: 'legacy',
        getThickness: () => 1,
        getColor: () => '#000000',
        onThicknessChange: () => {},
        onColorChange: () => {}
      };
    })).toBe(true);
    expect(seen).toEqual(['x', 'y']);
    expect(Array.from(svg.querySelectorAll('[data-axis-control="1"]:not([data-axis-hit-target="1"])'))
      .every(node => ac.isAxisElementBound(node))).toBe(true);
  });
});
