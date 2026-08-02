describe('Shared resizer graph options menu', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/resizer.js');
  });

  function createSvgBox(){
    const box = document.createElement('div');
    box.className = 'svgbox';
    box.getBoundingClientRect = () => {
      const width = Number.parseFloat(box.style.width) || 420;
      const height = Number.parseFloat(box.style.height) || 320;
      return { width, height, top: 0, left: 0, right: width, bottom: height };
    };

    const vertical = document.createElement('div');
    vertical.className = 'resizer resizer-vertical';
    const horizontal = document.createElement('div');
    horizontal.className = 'resizer resizer-horizontal';
    const corner = document.createElement('div');
    corner.className = 'resizer resizer-corner';
    const plot = document.createElement('div');
    plot.id = 'testPlot';

    box.appendChild(vertical);
    box.appendChild(horizontal);
    box.appendChild(corner);
    box.appendChild(plot);
    document.body.appendChild(box);
    return box;
  }

  test('keeps zoom visible and moves standard graph options into a cog menu', () => {
    const box = createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize: jest.fn()
    });

    const tray = box.querySelector('.resizer-control-tray');
    const options = tray?.querySelector(':scope > .resizer-options-control');
    const zoom = tray?.querySelector(':scope > .resizer-zoom-control');
    const menu = options?.querySelector('.resizer-options-menu');

    expect(options).toBeTruthy();
    expect(zoom).toBeTruthy();
    expect(tray.firstElementChild).toBe(options);
    expect(zoom.previousElementSibling).toBe(options);
    expect(options?.querySelector('svg.resizer-options-icon path')).toBeTruthy();
    expect(menu?.querySelector('.resizer-aspect-control')).toBeTruthy();
    expect(menu?.querySelector('.resizer-fontresize-control')).toBeTruthy();
    expect(tray.querySelector(':scope > .resizer-aspect-control')).toBeNull();
    expect(tray.querySelector(':scope > .resizer-fontresize-control')).toBeNull();
  });

  test('adds tab-scoped graph and axes title controls when font controls are available', () => {
    const setRoleVisibility = jest.fn(() => true);
    const recordStateChange = jest.fn();
    window.Shared.fontControls = {
      areRolesVisible: jest.fn(() => true),
      setRoleVisibility
    };
    window.Shared.styleUndo = { recordStateChange };
    const box = createSvgBox();
    box.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const xTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xTitle.dataset.fontRole = 'xTitle';
    svg.appendChild(xTitle);
    box.appendChild(svg);

    window.Shared.attachResizableBox(box, {
      componentName: 'scatter',
      tabId: 'tab-a',
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90
    });

    const graphInput = box.querySelector('.resizer-graph-title-checkbox');
    const axesInput = box.querySelector('.resizer-axes-title-checkbox');
    expect(graphInput).toBeTruthy();
    expect(axesInput).toBeTruthy();
    expect(axesInput.closest('label').hidden).toBe(false);

    graphInput.checked = false;
    graphInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setRoleVisibility).toHaveBeenCalledWith(
      'scatter',
      'graphTitle',
      false,
      expect.objectContaining({
        tabId: 'tab-a',
        recordUndo: true,
        undoLabel: 'title-visibility:graph'
      })
    );
    expect(recordStateChange).not.toHaveBeenCalled();
  });

  test('tracks axis-title applicability from the active rendered graph', async () => {
    window.Shared.fontControls = {
      areRolesVisible: jest.fn(() => true),
      setRoleVisibility: jest.fn(() => true)
    };
    const box = createSvgBox();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    box.appendChild(svg);

    window.Shared.attachResizableBox(box, {
      componentName: 'pie',
      tabId: 'tab-a',
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90
    });

    const axesControl = box.querySelector('.resizer-axes-title-control');
    expect(axesControl.hidden).toBe(true);

    const yTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yTitle.dataset.fontRole = 'yTitle';
    svg.appendChild(yTitle);
    await Promise.resolve();

    expect(axesControl.hidden).toBe(false);

    yTitle.remove();
    await Promise.resolve();

    expect(axesControl.hidden).toBe(true);
  });

  test('lock ratio toggle is geometry-neutral and does not request a redraw', () => {
    const box = createSvgBox();
    const onResize = jest.fn();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      aspectLocked: true,
      onResize
    });

    const checkbox = box.querySelector('.resizer-aspect-checkbox');
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);

    const before = {
      width: box.style.width,
      height: box.style.height,
      aspectRatio: box.dataset.resizerAspectRatio
    };
    onResize.mockClear();

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onResize).not.toHaveBeenCalled();
    expect(box.style.width).toBe(before.width);
    expect(box.style.height).toBe(before.height);
    expect(box.dataset.resizerAspectLocked).toBe('false');
    expect(box.dataset.resizerUnlockedStyleScaleBase).toBeTruthy();
    expect(Number(box.dataset.resizerUnlockedStyleScaleBase)).toBeCloseTo(1, 6);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onResize).not.toHaveBeenCalled();
    expect(box.style.width).toBe(before.width);
    expect(box.style.height).toBe(before.height);
    expect(box.dataset.resizerAspectLocked).toBe('true');
    expect(Number(box.dataset.resizerAspectRatio)).toBeCloseTo(420 / 320, 6);
    expect(Number(box.dataset.resizerAspectRatio)).toBeCloseTo(Number(before.aspectRatio), 6);
  });

  test('lock transitions preserve the renderer style baseline and handle clicks remain no-ops', () => {
    const box = createSvgBox();
    const onResize = jest.fn();
    box.style.width = '494px';
    box.style.height = '405px';

    window.Shared.attachResizableBox(box, {
      defaultWidth: 427,
      defaultHeight: 427,
      minWidth: 120,
      minHeight: 90,
      aspectLocked: false,
      onResize
    });

    const renderedRawScale = Math.sqrt((463.3333435058594 / 427) * (316.3333435058594 / 427));
    const renderedStyleScale = 0.9494858648816641;
    box.dataset.resizerRenderedRawStyleScale = String(renderedRawScale);
    box.dataset.resizerRenderedStyleScale = String(renderedStyleScale);
    box.dataset.resizerUnlockedStyleScaleBase = String(renderedStyleScale);

    const checkbox = box.querySelector('.resizer-aspect-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(Number(box.dataset.resizerLockedStyleScaleBase))
      .toBeCloseTo(renderedRawScale / renderedStyleScale, 9);

    const vertical = box.querySelector('.resizer-vertical');
    vertical.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 494, clientY: 200 }));
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 494, clientY: 200 }));

    expect(onResize).not.toHaveBeenCalled();
    expect(box.style.width).toBe('494px');
    expect(box.style.height).toBe('405px');

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(Number(box.dataset.resizerUnlockedStyleScaleBase)).toBeCloseTo(renderedStyleScale, 9);
    vertical.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 494, clientY: 200 }));
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 494, clientY: 200 }));

    expect(onResize).not.toHaveBeenCalled();
    expect(box.style.width).toBe('494px');
    expect(box.style.height).toBe('405px');
  });

  test('locked resize preserves the rendered x-axis to y-axis ratio', () => {
    const box = createSvgBox();
    const onResize = jest.fn();
    window.Shared.axisControls = {
      measureRenderedAxes: jest.fn(() => ({ x: 300, y: 200, ratio: 1.5 }))
    };
    box.style.width = '500px';
    box.style.height = '360px';

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      aspectLocked: false,
      aspectRatio: 1,
      onResize
    });

    const checkbox = box.querySelector('.resizer-aspect-checkbox');
    const before = { width: box.style.width, height: box.style.height };
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.style.width).toBe(before.width);
    expect(box.style.height).toBe(before.height);
    expect(Number(box.dataset.resizerLockedGeometryRatio)).toBeCloseTo(1.5, 9);
    expect(Number(box.dataset.resizerLockedGeometryInsetX)).toBeCloseTo(200, 9);
    expect(Number(box.dataset.resizerLockedGeometryInsetY)).toBeCloseTo(160, 9);

    window.Shared.applyResizableBoxSize(box, {
      axis: 'x',
      width: 650,
      updateAspectRatio: false,
      forceExact: false
    });

    const nextWidth = Number.parseFloat(box.style.width);
    const nextHeight = Number.parseFloat(box.style.height);
    expect((nextWidth - 200) / (nextHeight - 160)).toBeCloseTo(1.5, 6);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith('programmatic');
  });

  test('locked resize accepts component-owned non-axis geometry', () => {
    const box = createSvgBox();
    let measurement = {
      width: 280,
      height: 175,
      constraintWidth: 440,
      constraintHeight: 300
    };
    const measureLockedGeometry = jest.fn(() => measurement);
    box.style.width = '500px';
    box.style.height = '360px';

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      aspectLocked: false,
      measureLockedGeometry
    });
    const checkbox = box.querySelector('.resizer-aspect-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(measureLockedGeometry).toHaveBeenCalled();
    expect(Number(box.dataset.resizerLockedGeometryRatio)).toBeCloseTo(1.6, 9);
    expect(Number(box.dataset.resizerLockedConstraintRatio)).toBeCloseTo(440 / 300, 9);
    expect(Number(box.dataset.resizerLockedGeometryInsetX)).toBeCloseTo(60, 9);
    expect(Number(box.dataset.resizerLockedGeometryInsetY)).toBeCloseTo(60, 9);

    measurement = {
      width: 260,
      height: 175,
      constraintWidth: 450,
      constraintHeight: 300
    };
    expect(box.__sharedResizableBoxApi.calibrateLockedGeometryConstraint()).toBe(true);
    expect(Number(box.dataset.resizerLockedConstraintRatio))
      .toBeCloseTo((450 / 300) * 1.6 / (260 / 175), 9);
  });

  test('ResizeObserver ignores geometry already delivered by an explicit resize phase', () => {
    const originalResizeObserver = window.ResizeObserver;
    let observerCallback = null;
    window.ResizeObserver = class ResizeObserverMock {
      constructor(callback){ observerCallback = callback; }
      observe(){}
      disconnect(){}
    };
    jest.resetModules();
    window.Shared = {};
    require('../js/shared/resizer.js');
    let now = 1_000;
    const dateNow = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const box = createSvgBox();
    const onResize = jest.fn();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize
    });
    observerCallback?.();
    expect(onResize).not.toHaveBeenCalled();

    window.Shared.applyResizableBoxSize(box, { width: 460, height: 340, axis: 'both' });
    expect(onResize).toHaveBeenLastCalledWith('programmatic');
    now += 1_000;
    observerCallback?.();
    expect(onResize).toHaveBeenCalledTimes(1);

    box.style.width = '470px';
    observerCallback?.();
    expect(onResize).toHaveBeenLastCalledWith('observe');
    dateNow.mockRestore();
    window.ResizeObserver = originalResizeObserver;
  });

  test('transient programmatic sizing preserves the manual-resize state', () => {
    const box = createSvgBox();
    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90
    });

    expect(box.dataset.resizerResized).toBe('false');
    window.Shared.applyResizableBoxSize(box, {
      width: 440,
      height: 330,
      axis: 'both',
      authorityMode: 'transient'
    });
    expect(box.dataset.resizerResized).toBe('false');

    window.Shared.applyResizableBoxSize(box, { width: 450, height: 340, axis: 'both' });
    expect(box.dataset.resizerResized).toBe('true');
    window.Shared.applyResizableBoxSize(box, {
      width: 460,
      height: 350,
      axis: 'both',
      authorityMode: 'transient'
    });
    expect(box.dataset.resizerResized).toBe('true');
  });

  test('attaching an already locked graph never normalizes its current geometry', () => {
    const box = createSvgBox();
    box.style.width = '510px';
    box.style.height = '330px';
    box.dataset.resizerAspectLocked = 'true';
    box.dataset.resizerAspectRatio = String(510 / 330);

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      aspectRatio: 1,
      onResize: jest.fn()
    });

    expect(box.style.width).toBe('510px');
    expect(box.style.height).toBe('330px');
    expect(Number(box.dataset.resizerAspectRatio)).toBeCloseTo(510 / 330, 9);
  });

  test('programmatic lock enforcement updates resizer state even when the checkbox projection already looks locked', () => {
    const box = createSvgBox();
    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      aspectLocked: false
    });

    const checkbox = box.querySelector('.resizer-aspect-checkbox');
    checkbox.checked = true;
    box.dataset.resizerAspectLocked = 'true';
    expect(box.__sharedResizableBoxApi.getState().aspectLocked).toBe(false);

    box.__sharedResizableBoxApi.setAspectLocked(true, { reason: 'test-forced-lock' });

    expect(box.__sharedResizableBoxApi.getState().aspectLocked).toBe(true);
    expect(checkbox.checked).toBe(true);
    expect(box.dataset.resizerAspectLocked).toBe('true');
  });

  test('default aspect lock does not overwrite a persisted tab value on reattach', () => {
    const box = createSvgBox();
    box.dataset.resizerAspectLocked = 'false';

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      aspectLocked: true,
      onResize: jest.fn()
    });

    const checkbox = box.querySelector('.resizer-aspect-checkbox');
    expect(box.dataset.resizerAspectLocked).toBe('false');
    expect(checkbox?.checked).toBe(false);

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      defaultAspectLocked: true,
      onResize: jest.fn()
    });

    const reattachedCheckbox = box.querySelector('.resizer-aspect-checkbox');
    expect(box.dataset.resizerAspectLocked).toBe('false');
    expect(reattachedCheckbox?.checked).toBe(false);
  });

  test('places component graph options in the shared menu', async () => {
    const box = createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize: jest.fn()
    });

    const legend = document.createElement('label');
    legend.className = 'config-panel__checkbox config-panel__checkbox--inline';
    legend.innerHTML = '<input type="checkbox" checked><span>Show legend</span>';

    window.Shared.resizer.ensureLegendControlPlacement({
      svgBox: box,
      control: legend,
      debugLabel: 'test-legend'
    });

    const tray = box.querySelector('.resizer-control-tray');
    const axes = document.createElement('details');
    axes.className = 'resizer-axeslength-control';
    const summary = document.createElement('summary');
    summary.className = 'resizer-axeslength-summary';
    summary.textContent = 'Axes length';
    axes.appendChild(summary);
    tray.appendChild(axes);
    await Promise.resolve();

    const menu = box.querySelector('.resizer-options-menu');
    expect(menu?.querySelector('.resizer-legend-control')).toBe(legend);
    expect(menu?.querySelector('.resizer-axeslength-control')).toBe(axes);
    expect(axes.hasAttribute('open')).toBe(true);
    expect(tray.querySelector(':scope > .resizer-legend-control')).toBeNull();
    expect(tray.querySelector(':scope > .resizer-axeslength-control')).toBeNull();
  });

  test('reopens axes length options whenever the cog menu opens', async () => {
    const box = createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize: jest.fn()
    });

    const tray = box.querySelector('.resizer-control-tray');
    const axes = document.createElement('details');
    axes.className = 'resizer-axeslength-control';
    const summary = document.createElement('summary');
    summary.className = 'resizer-axeslength-summary';
    summary.textContent = 'Axes length';
    axes.appendChild(summary);
    tray.appendChild(axes);
    await Promise.resolve();

    const options = box.querySelector('.resizer-options-control');
    axes.removeAttribute('open');
    options.setAttribute('open', '');
    options.dispatchEvent(new Event('toggle'));

    expect(axes.hasAttribute('open')).toBe(true);
  });

  test('closes the cog menu when clicking outside it', () => {
    const box = createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize: jest.fn()
    });

    const options = box.querySelector('.resizer-options-control');
    const menu = box.querySelector('.resizer-options-menu');
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    options.setAttribute('open', '');
    menu.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(options.hasAttribute('open')).toBe(true);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(options.hasAttribute('open')).toBe(false);
  });
});
