/*
 * Shared resizer contracts.
 * These tests exercise one focused concern through a shared DOM harness.
 */

const { createResizerOptionsMenuHarness } = require('../../test-support/resizerOptionsMenuSuite');

describe('Shared resizer aspect and geometry contracts', () => {
  const harness = createResizerOptionsMenuHarness();

  beforeEach(harness.setup);

  test('supports an immutable aspect policy without exposing a Lock ratio control', () => {
    const box = harness.createSvgBox();
    box.dataset.resizerAspectLocked = 'false';

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      forceAspectLocked: true,
      showAspectControl: false
    });

    expect(box.querySelector('.resizer-aspect-control')).toBeNull();
    expect(box.querySelector('.resizer-aspect-checkbox')).toBeNull();
    expect(box.dataset.resizerAspectLocked).toBe('true');
    expect(box.__sharedResizableBoxApi.getState().aspectLocked).toBe(true);

    box.__sharedResizableBoxApi.setAspectLocked(false, { reason: 'test-forced-policy' });
    expect(box.dataset.resizerAspectLocked).toBe('true');
    expect(box.__sharedResizableBoxApi.getState().aspectLocked).toBe(true);
  });

  test('immutable aspect policy cannot be bypassed by a programmatic simulated unlock', () => {
    const box = harness.createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      forceAspectLocked: true,
      showAspectControl: false
    });

    box.__sharedResizableBoxApi.applySize({
      axis: 'x',
      width: 500,
      reason: 'test-forced-programmatic-axis-resize',
      updateAspectRatio: false,
      preserveAspectLock: true,
      forceExact: true,
      simulateAspectLock: false
    });

    const state = box.__sharedResizableBoxApi.getState();
    expect(state.forcedAspectLocked).toBe(true);
    expect(state.aspectLocked).toBe(true);
    expect(box.dataset.resizerAspectLocked).toBe('true');
  });

  test('lock ratio toggle is geometry-neutral and does not request a redraw', () => {
    const box = harness.createSvgBox();
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
    const box = harness.createSvgBox();
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
    const box = harness.createSvgBox();
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

  test('Cartesian live drag keeps its starting layout transaction across redraw publications', () => {
    const box = harness.createSvgBox();
    box.style.width = '500px';
    box.style.height = '400px';
    let replacementPlan = null;
    const onResize = jest.fn(phase => {
      if(phase === 'move' && replacementPlan){
        window.Shared.cartesianLayout.publishCartesianLayout(box, replacementPlan, {
          tabId: 'tab-a', component: 'box', generation: 2
        });
      }
    });

    window.Shared.attachResizableBox(box, {
      componentName: 'box', tabId: 'tab-a',
      defaultWidth: 500, defaultHeight: 400,
      minWidth: 120, minHeight: 90,
      maxWidth: 1200, maxHeight: 1000,
      aspectLocked: true,
      cartesianLayoutTransactionEnabled: true,
      onResize
    });
    const startingPlan = window.Shared.cartesianLayout.planCartesianLayout({
      owner: { tabId: 'tab-a', component: 'box', generation: 1 },
      userFrame: { width: 500, height: 400 },
      baselineMargins: { top: 30, right: 20, bottom: 60, left: 70 },
      requiredMargins: { top: 30, right: 20, bottom: 110, left: 120 },
      lock: { enabled: true, targetRatio: 1.5, drive: 'width' },
      minimumPlot: { width: 20, height: 20 }
    });
    replacementPlan = window.Shared.cartesianLayout.planCartesianLayout({
      owner: { tabId: 'tab-a', component: 'box', generation: 2 },
      userFrame: { width: 460, height: 360 },
      baselineMargins: { top: 90, right: 70, bottom: 150, left: 160 },
      requiredMargins: { top: 90, right: 70, bottom: 150, left: 160 },
      lock: { enabled: true, targetRatio: 0.75, drive: 'width' },
      minimumPlot: { width: 20, height: 20 }
    });
    expect(window.Shared.cartesianLayout.publishCartesianLayout(box, startingPlan, {
      tabId: 'tab-a', component: 'box', generation: 1
    })).toBe(true);

    const vertical = box.querySelector('.resizer-vertical');
    vertical.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 200 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 460, clientY: 200 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 430, clientY: 200 }));

    const expected = window.Shared.cartesianLayout.solveLockedUserFrame({
      userFrame: startingPlan.userFrame,
      proposal: { width: 430, height: 400 },
      frameInsets: startingPlan.lock.frameInsets,
      axisFrameModel: startingPlan.axisFrameModel,
      targetRatio: startingPlan.lock.targetRatio,
      drive: 'width',
      bounds: { minWidth: 120, minHeight: 90, maxWidth: 1200, maxHeight: 1000 },
      minimumPlot: startingPlan.minimumPlot
    });
    expect(Number.parseFloat(box.style.width)).toBe(Math.round(expected.userFrame.width));
    expect(Number.parseFloat(box.style.height)).toBe(Math.round(expected.userFrame.height));

    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 430, clientY: 200 }));
  });

  test('migrated locked resize holds the canonical frame until an owner-scoped plan is published', () => {
    const box = harness.createSvgBox();
    box.style.width = '500px';
    box.style.height = '400px';
    window.Shared.axisControls = { measureRenderedAxes: jest.fn(() => ({ x: 300, y: 150 })) };

    window.Shared.attachResizableBox(box, {
      componentName: 'line',
      tabId: 'tab-a',
      defaultWidth: 500,
      defaultHeight: 400,
      minWidth: 180,
      minHeight: 160,
      aspectLocked: true,
      cartesianLayoutTransactionEnabled: true
    });

    window.Shared.applyResizableBoxSize(box, { axis: 'x', width: 750, forceExact: false });
    expect(box.style.width).toBe('500px');
    expect(box.style.height).toBe('400px');
    expect(window.Shared.axisControls.measureRenderedAxes).not.toHaveBeenCalled();
    expect(box.__sharedResizableBoxApi.calibrateLockedGeometryConstraint()).toBe(false);
  });

  test('Cartesian lock toggle captures the published rendered-axis ratio without changing geometry', () => {
    const box = harness.createSvgBox();
    box.style.width = '500px';
    box.style.height = '400px';
    const onResize = jest.fn();
    window.Shared.attachResizableBox(box, {
      componentName: 'line', tabId: 'tab-a',
      defaultWidth: 500, defaultHeight: 400, minWidth: 180, minHeight: 160,
      aspectLocked: false, cartesianLayoutTransactionEnabled: true, onResize
    });
    const plan = window.Shared.cartesianLayout.planCartesianLayout({
      owner: { tabId: 'tab-a', component: 'line', generation: 4 },
      userFrame: { width: 500, height: 400 },
      baselineMargins: { top: 30, right: 20, bottom: 60, left: 70 },
      axisLengths: { x: 360, y: 240 },
      minimumPlot: { width: 20, height: 20 }
    });
    expect(window.Shared.cartesianLayout.publishCartesianLayout(box, plan, {
      tabId: 'tab-a', component: 'line', generation: 4
    })).toBe(true);
    const before = { width: box.style.width, height: box.style.height };
    const checkbox = box.querySelector('.resizer-aspect-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.style.width).toBe(before.width);
    expect(box.style.height).toBe(before.height);
    expect(Number(box.dataset.resizerCartesianPlotRatio)).toBeCloseTo(1.5, 9);
    expect(onResize).not.toHaveBeenCalled();
  });

  test('Cartesian reset uses only the orientation-specific user frame and never adds legacy automatic reserves', () => {
    const box = harness.createSvgBox();
    box.style.width = '700px';
    box.style.height = '500px';
    const resolveResetFrameSize = jest.fn(() => ({ widthPx: 310, heightPx: 470 }));
    const resolveAutomaticFrameReserves = jest.fn(() => ({ widthPx: 90, heightPx: 60 }));

    window.Shared.attachResizableBox(box, {
      componentName: 'box', tabId: 'tab-a',
      defaultWidth: 420, defaultHeight: 320, minWidth: 120, minHeight: 90,
      cartesianLayoutTransactionEnabled: true,
      resolveResetFrameSize,
      resolveAutomaticFrameReserves
    });

    box.querySelector('.resizer-corner').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(box.style.width).toBe('310px');
    expect(box.style.height).toBe('470px');
    expect(resolveResetFrameSize).toHaveBeenCalledTimes(1);
    expect(resolveAutomaticFrameReserves).not.toHaveBeenCalled();
  });

  test('clearing a Cartesian publication clears the resizer-owned plan and lock target', () => {
    const box = harness.createSvgBox();
    window.Shared.attachResizableBox(box, {
      componentName: 'line', tabId: 'tab-a',
      defaultWidth: 500, defaultHeight: 400, minWidth: 180, minHeight: 160,
      aspectLocked: true, cartesianLayoutTransactionEnabled: true
    });
    const plan = window.Shared.cartesianLayout.planCartesianLayout({
      owner: { tabId: 'tab-a', component: 'line', generation: 5 },
      userFrame: { width: 500, height: 400 },
      baselineMargins: { top: 30, right: 20, bottom: 60, left: 70 },
      minimumPlot: { width: 20, height: 20 }
    });
    expect(window.Shared.cartesianLayout.publishCartesianLayout(box, plan, {
      tabId: 'tab-a', component: 'line', generation: 5
    })).toBe(true);
    expect(box.__sharedResizableBoxApi.getCartesianLayoutPlan()).toBe(plan);
    expect(window.Shared.cartesianLayout.clearPublishedLayout(box, { tabId: 'tab-a', component: 'line' })).toBe(true);
    expect(box.__sharedResizableBoxApi.getCartesianLayoutPlan()).toBeNull();
    expect(box.dataset.resizerCartesianPlotRatio).toBeUndefined();
  });

  test('locked resize accepts component-owned non-axis geometry', () => {
    const box = harness.createSvgBox();
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
    require('../../js/shared/resizer.js');
    let now = 1_000;
    const dateNow = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const box = harness.createSvgBox();
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
    const box = harness.createSvgBox();
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
    const box = harness.createSvgBox();
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

  test('double-click reset adds automatic frame reserves exactly once', () => {
    const box = harness.createSvgBox();
    box.style.width = '700px';
    box.style.height = '500px';
    const onResize = jest.fn();
    const resolveAutomaticFrameReserves = jest.fn(() => ({ widthPx: 80, heightPx: 40 }));

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      resolveAutomaticFrameReserves,
      onResize
    });

    const corner = box.querySelector('.resizer-corner');
    corner.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(box.style.width).toBe('500px');
    expect(box.style.height).toBe('360px');

    corner.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(box.style.width).toBe('500px');
    expect(box.style.height).toBe('360px');
    expect(resolveAutomaticFrameReserves).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenNthCalledWith(1, 'reset');
    expect(onResize).toHaveBeenNthCalledWith(2, 'reset');
  });

  test('double-click reset uses a component orientation frame before adding reserves', () => {
    const box = harness.createSvgBox();
    box.style.width = '700px';
    box.style.height = '500px';
    const resolveResetFrameSize = jest.fn(() => ({ widthPx: 300, heightPx: 460 }));

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      resolveResetFrameSize,
      resolveAutomaticFrameReserves: () => ({ widthPx: 30, heightPx: 20 })
    });

    box.querySelector('.resizer-corner').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(box.style.width).toBe('330px');
    expect(box.style.height).toBe('480px');
    expect(resolveResetFrameSize).toHaveBeenCalledTimes(1);
  });

  test('double-click reset remains unchanged without automatic frame reserves', () => {
    const box = harness.createSvgBox();
    box.style.width = '700px';
    box.style.height = '500px';

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90
    });

    box.querySelector('.resizer-corner').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(box.style.width).toBe('420px');
    expect(box.style.height).toBe('320px');
  });

  test('programmatic lock enforcement updates resizer state even when the checkbox projection already looks locked', () => {
    const box = harness.createSvgBox();
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
    const box = harness.createSvgBox();
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
});

