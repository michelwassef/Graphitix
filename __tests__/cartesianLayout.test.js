describe('Cartesian layout transaction', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    require('../js/shared/cartesianLayout.js');
  });

  const planner = () => window.Shared.cartesianLayout;
  const baseInput = () => ({
    owner: { tabId: 'tab-a', component: 'line', generation: 7 },
    userFrame: { width: 500, height: 400 },
    baselineMargins: { top: 30, right: 20, bottom: 60, left: 70 },
    requiredMargins: { top: 30, right: 20, bottom: 60, left: 70 },
    minimumPlot: { width: 20, height: 20 }
  });

  test('measured reserves extend the envelope without mutating user frame or plot rectangle', () => {
    const short = planner().planCartesianLayout(baseInput());
    const long = planner().planCartesianLayout({
      ...baseInput(),
      requiredMargins: { top: 30, right: 20, bottom: 105, left: 115 }
    });

    expect(long.userFrame).toEqual(short.userFrame);
    expect(long.plotRect).toEqual(short.plotRect);
    expect(long.automaticReserves.outwardBySide).toEqual({ top: 0, right: 0, bottom: 45, left: 45 });
    expect(long.contentEnvelope).toEqual(expect.objectContaining({
      minX: -45,
      maxY: 445,
      width: 545,
      height: 445
    }));
  });

  test('composes stack, max, external, and metric reserves without double counting', () => {
    const composed = planner().composeAutomaticReserves({
      baselineMargins: { top: 10, right: 10, bottom: 20, left: 20 },
      requiredMargins: { top: 15, right: 10, bottom: 30, left: 20 },
      auxiliaryReserves: {
        category: { side: 'bottom', amount: 12, behavior: 'stack' },
        sigA: { side: 'top', amount: 20, behavior: 'max', group: 'annotation' },
        sigB: { side: 'top', amount: 30, behavior: 'max', group: 'annotation' },
        legend: { side: 'right', amount: 80, behavior: 'external' },
        metricRail: { side: 'left', amount: 8, behavior: 'metric' }
      },
      externalExtensions: { bottom: 11 }
    });

    expect(composed.outwardBySide).toEqual({ top: 35, right: 0, bottom: 22, left: 8 });
    expect(composed.externalBySide).toEqual({ top: 0, right: 80, bottom: 11, left: 0 });
    expect(composed.metricBySide.left).toBe(8);
    expect(composed.bySource.sigA.amount).toBe(20);
    expect(composed.bySource.sigB.amount).toBe(30);
  });


  test('max reserves share one rail while independent stack reserves remain additive', () => {
    const composed = planner().composeAutomaticReserves({
      baselineMargins: { top: 0, right: 0, bottom: 0, left: 0 },
      auxiliaryReserves: [
        { name: 'category', side: 'bottom', amount: 24, behavior: 'max', group: 'labels' },
        { name: 'endpoint', side: 'bottom', amount: 31, behavior: 'max', group: 'labels' },
        { name: 'title', side: 'bottom', amount: 14, behavior: 'stack' }
      ]
    });

    expect(composed.outwardBySide.bottom).toBe(45);
  });

  test('transposes semantic sides, frame, minimum plot, and lock target together', () => {
    const transposed = planner().transposeCartesianLayout({
      userFrame: { width: 600, height: 400 },
      baselineMargins: { top: 10, right: 20, bottom: 30, left: 40 },
      requiredMargins: { top: 11, right: 22, bottom: 33, left: 44 },
      auxiliaryReserves: {
        category: { side: 'bottom', amount: 25, behavior: 'stack' }
      },
      externalExtensions: { top: 1, right: 2, bottom: 3, left: 4 },
      minimumPlot: { width: 100, height: 80 },
      lock: { enabled: true, targetRatio: 2, drive: 'width' },
      plotConstraint: { type: 'ratio', ratio: 4, fit: 'width-extend' },
      axisFrameModel: {
        x: { count: 3, fixed: 90, minimum: 70 },
        y: { count: 2, fixed: 60, minimum: 50 }
      },
      axisLengths: { x: 120, y: 80 },
      orientation: 'normal'
    });

    expect(transposed.userFrame).toEqual({ width: 400, height: 600 });
    expect(transposed.baselineMargins).toEqual({ top: 40, right: 10, bottom: 20, left: 30 });
    expect(transposed.minimumPlot).toEqual({ width: 80, height: 100 });
    expect(transposed.lock).toEqual(expect.objectContaining({ targetRatio: 0.5, drive: 'height' }));
    expect(transposed.plotConstraint).toEqual(expect.objectContaining({ ratio: 0.25, fit: 'height-extend' }));
    expect(transposed.axisFrameModel).toEqual({
      x: { count: 2, fixed: 60, minimum: 50 },
      y: { count: 3, fixed: 90, minimum: 70 }
    });
    expect(transposed.axisLengths).toEqual({ x: 80, y: 120 });
    expect(transposed.auxiliaryReserves[0]).toEqual(expect.objectContaining({ side: 'left', amount: 25 }));
  });

  test('reports minimum plot bounds without silently expanding the user frame', () => {
    const plan = planner().planCartesianLayout({
      ...baseInput(),
      userFrame: { width: 100, height: 90 },
      minimumPlot: { width: 40, height: 30 }
    });

    expect(plan.userFrame).toEqual({ width: 100, height: 90 });
    expect(plan.minimumPlotSatisfied).toBe(false);
    expect(plan.diagnostics).toContain('minimum-plot-not-satisfied');
  });

  test.each([
    ['width', { width: 700, height: 410 }],
    ['height', { width: 520, height: 650 }],
    ['both', { width: 710, height: 530 }]
  ])('solves locked rendered-axis ratio for %s-driven resize from published insets', (drive, proposal) => {
    const plan = planner().planCartesianLayout(baseInput());
    const solved = planner().solveLockedUserFrame({
      userFrame: plan.userFrame,
      proposal,
      frameInsets: plan.lock.frameInsets,
      targetRatio: 1.5,
      drive,
      minimumPlot: { width: 20, height: 20 },
      bounds: { minWidth: 200, minHeight: 180, maxWidth: 1000, maxHeight: 900 }
    });

    expect(solved.valid).toBe(true);
    expect(solved.plotRatio).toBeCloseTo(1.5, 6);
  });

  test('derives renderer margins from the locked axis-frame transaction', () => {
    const start = planner().planCartesianLayout({
      ...baseInput(),
      lock: { enabled: true, targetRatio: 1.5, drive: 'width' }
    });
    const solved = planner().solveLockedUserFrame({
      userFrame: start.userFrame,
      proposal: { width: 310, height: 285 },
      axisFrameModel: start.axisFrameModel,
      targetRatio: 1.5,
      drive: 'width',
      minimumPlot: start.minimumPlot,
      bounds: { minWidth: 100, minHeight: 100, maxWidth: 600, maxHeight: 600 }
    });
    const geometry = planner().resolveLockedRenderGeometry({
      userFrame: solved.userFrame,
      transaction: { plan: start, plotRatio: 1.5 }
    });

    expect(geometry.valid).toBe(true);
    expect(geometry.axisLengths.x / geometry.axisLengths.y).toBeCloseTo(1.5, 6);
    expect(geometry.margins.left).toBe(start.lock.frameInsets.left);
    expect(geometry.margins.top).toBe(start.lock.frameInsets.top);
  });

  test('solves a repeated-track rendered-axis model without treating the whole SVG as one axis', () => {
    const plan = planner().planCartesianLayout({
      ...baseInput(),
      axisFrameModel: {
        x: { count: 3, fixed: 140, minimum: 30 },
        y: { count: 2, fixed: 100, minimum: 30 }
      }
    });
    const solved = planner().solveLockedUserFrame({
      userFrame: plan.userFrame,
      proposal: { width: 800, height: 520 },
      axisFrameModel: plan.axisFrameModel,
      targetRatio: 1.25,
      drive: 'width',
      minimumPlot: { width: 30, height: 30 },
      bounds: { minWidth: 230, minHeight: 160, maxWidth: 1200, maxHeight: 1000 }
    });

    expect(solved.valid).toBe(true);
    expect(solved.axisLengths.x / solved.axisLengths.y).toBeCloseTo(1.25, 6);
    expect(solved.userFrame.width).toBeCloseTo(140 + 3 * solved.axisLengths.x, 6);
    expect(solved.userFrame.height).toBeCloseTo(100 + 2 * solved.axisLengths.y, 6);
  });

  test('reports a bounds conflict instead of silently violating the locked rendered-axis ratio', () => {
    const solved = planner().solveLockedUserFrame({
      userFrame: { width: 500, height: 400 },
      proposal: { width: 900, height: 400 },
      axisFrameModel: {
        x: { count: 1, fixed: 100, minimum: 40 },
        y: { count: 1, fixed: 100, minimum: 40 }
      },
      targetRatio: 4,
      drive: 'width',
      minimumPlot: { width: 40, height: 40 },
      bounds: { minWidth: 800, minHeight: 200, maxWidth: 900, maxHeight: 260 }
    });

    expect(solved.valid).toBe(false);
    expect(solved.reason).toBe('bounds-conflict');
    expect(solved.plotRatio).toBeNull();
  });

  test('no-movement locked solve is geometry-neutral when proposal already matches target', () => {
    const plan = planner().planCartesianLayout(baseInput());
    const target = plan.plotRect.width / plan.plotRect.height;
    const solved = planner().solveLockedUserFrame({
      userFrame: plan.userFrame,
      proposal: plan.userFrame,
      frameInsets: plan.lock.frameInsets,
      targetRatio: target,
      drive: 'both',
      minimumPlot: { width: 20, height: 20 }
    });

    expect(solved.userFrame.width).toBeCloseTo(500, 6);
    expect(solved.userFrame.height).toBeCloseTo(400, 6);
  });

  test('external right content is staged after a metric plot that extends beyond the user frame', () => {
    const plan = planner().planCartesianLayout({
      ...baseInput(),
      plotConstraint: { type: 'ratio', ratio: 2, fit: 'height-extend', anchor: 'top-left' },
      externalExtensions: { right: 80 }
    });

    const plotRight = plan.plotRect.x + plan.plotRect.width;
    const basePlotRight = plan.basePlotRect.x + plan.basePlotRect.width;
    const metricOverflow = plotRight - basePlotRight;
    expect(plotRight).toBeGreaterThan(plan.userFrame.width);
    expect(metricOverflow).toBeGreaterThan(0);
    expect(plan.contentEnvelope.maxX).toBeCloseTo(plan.userFrame.width + metricOverflow + 80, 6);
  });

  test('content-only changes do not change locked axis lengths', () => {
    const input = {
      ...baseInput(),
      lock: { enabled: true, targetRatio: 1.5, drive: 'width' }
    };
    const short = planner().planCartesianLayout(input);
    const long = planner().planCartesianLayout({
      ...input,
      requiredMargins: { top: 80, right: 60, bottom: 130, left: 160 },
      externalExtensions: { right: 120, bottom: 40 }
    });

    expect(long.axisLengths).toEqual(short.axisLengths);
    expect(long.lock.renderedRatio).toEqual(short.lock.renderedRatio);
    expect(long.contentEnvelope.width).toBeGreaterThan(short.contentEnvelope.width);
  });

  test.each([
    ['contain', 1],
    ['width', 1.2],
    ['height', 0.8],
    ['height-extend', 2],
    ['width-extend', 0.5]
  ])('supports ratio plot constraint fit %s', (fit, ratio) => {
    const plan = planner().planCartesianLayout({
      ...baseInput(),
      plotConstraint: { type: 'ratio', ratio, fit, anchor: 'center' }
    });
    expect(plan.userFrame).toEqual({ width: 500, height: 400 });
    expect(plan.plotRect.width / plan.plotRect.height).toBeCloseTo(ratio, 6);
    expect(plan.plotConstraint.applied).toBe(true);
  });

  test('is deterministic, immutable, and does not mutate its input snapshot', () => {
    const input = {
      ...baseInput(),
      requiredMargins: { top: 35, right: 25, bottom: 90, left: 95 },
      auxiliaryReserves: [{ name: 'risk', side: 'bottom', amount: 50, behavior: 'stack' }],
      externalExtensions: { right: 70 },
      rounding: { mode: 'round', precision: 3 }
    };
    const before = JSON.stringify(input);
    const first = planner().planCartesianLayout(input);
    const second = planner().planCartesianLayout(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.plotRect)).toBe(true);
  });

  test('publication is owner-generation guarded and commits frame, presentation, and resizer in one order', () => {
    const plan = planner().planCartesianLayout(baseInput());
    const order = [];
    const target = {
      dataset: {},
      __sharedResizableBoxApi: {
        canCommitCartesianLayout: jest.fn(() => { order.push('preflight'); return true; }),
        commitCartesianLayout: jest.fn(() => { order.push('resizer'); return true; })
      }
    };

    expect(planner().publishCartesianLayout(target, plan, {
      tabId: 'tab-a', component: 'line', generation: 6
    })).toBe(false);
    expect(target.dataset.cartesianLayoutComplete).toBeUndefined();
    expect(target.__sharedResizableBoxApi.commitCartesianLayout).not.toHaveBeenCalled();

    expect(planner().publishCartesianLayout(target, plan, {
      tabId: 'tab-a', component: 'line', generation: 7,
      payloadSignature: 'payload-a', layoutSignature: 'layout-a', canCommit: () => true,
      commitFrame: () => { order.push('frame'); return true; },
      commitPresentation: () => { order.push('presentation'); return true; }
    })).toBe(true);
    expect(order).toEqual(['preflight', 'frame', 'presentation', 'resizer']);
    expect(target.dataset).toEqual(expect.objectContaining({
      cartesianLayoutComplete: 'true',
      cartesianLayoutTabId: 'tab-a',
      cartesianLayoutComponent: 'line',
      cartesianLayoutGeneration: '7',
      cartesianPayloadSignature: 'payload-a',
      cartesianLayoutSignature: 'layout-a'
    }));
  });

  test('publication provenance can be captured by owner identity without requiring the old generation', () => {
    const plan = planner().planCartesianLayout(baseInput());
    const target = { dataset: {} };
    expect(planner().publishCartesianLayout(target, plan, {
      tabId: 'tab-a', component: 'line', generation: 7,
      payloadSignature: 'payload-a', layoutSignature: 'layout-a'
    })).toBe(true);

    expect(planner().capturePublicationProvenance(target, {
      tabId: 'tab-a', component: 'line'
    })).toEqual(expect.objectContaining({
      publicationGeneration: 7,
      payloadSignature: 'payload-a',
      layoutSignature: 'layout-a',
      complete: true
    }));
    expect(planner().capturePublicationProvenance(target, { tabId: 'tab-b', component: 'line' })).toBeNull();
  });

  test('publication provenance rejects mismatched embedded signatures but permits owner-only publications for cache certification', () => {
    const plan = planner().planCartesianLayout(baseInput());
    const target = { dataset: {} };
    expect(planner().publishCartesianLayout(target, plan, {
      tabId: 'tab-a', component: 'line', generation: 7,
      payloadSignature: 'payload-a', layoutSignature: 'layout-a'
    })).toBe(true);

    expect(planner().capturePublicationProvenance(target, {
      tabId: 'tab-a', component: 'line',
      payloadSignature: 'payload-b', layoutSignature: 'layout-a'
    })).toBeNull();
    expect(planner().capturePublicationProvenance(target, {
      tabId: 'tab-a', component: 'line',
      payloadSignature: 'payload-a', layoutSignature: 'layout-b'
    })).toBeNull();

    delete target.dataset.cartesianPayloadSignature;
    delete target.dataset.cartesianLayoutSignature;
    expect(planner().capturePublicationProvenance(target, {
      tabId: 'tab-a', component: 'line',
      payloadSignature: 'payload-a', layoutSignature: 'layout-a'
    })).toEqual(expect.objectContaining({
      owner: expect.objectContaining({ tabId: 'tab-a', component: 'line' }),
      publicationGeneration: 7,
      payloadSignature: null,
      layoutSignature: null,
      complete: true
    }));
  });

  test('same-owner clear removes stale-generation projection metadata and the committed resizer plan only for that owner', () => {
    const plan = planner().planCartesianLayout(baseInput());
    const child = { dataset: {} };
    const clearCartesianLayout = jest.fn(() => true);
    const target = {
      dataset: {},
      __sharedResizableBoxApi: {
        commitCartesianLayout: jest.fn(() => true),
        clearCartesianLayout
      },
      querySelectorAll: jest.fn(() => [child])
    };
    expect(planner().publishCartesianLayout(target, plan, {
      tabId: 'tab-a', component: 'line', generation: 7, projectionTarget: child
    })).toBe(true);

    expect(planner().clearPublishedLayout(target, {
      tabId: 'tab-a', component: 'line', generation: 99
    })).toBe(true);
    expect(target.__cartesianLayoutPlan).toBeUndefined();
    expect(child.__cartesianLayoutPlan).toBeUndefined();
    expect(target.dataset.cartesianLayoutComplete).toBeUndefined();
    expect(child.dataset.cartesianLayoutComplete).toBeUndefined();
    expect(clearCartesianLayout).toHaveBeenCalledTimes(1);
  });

  test('foreign-owner clear is rejected without deleting the current publication', () => {
    const plan = planner().planCartesianLayout(baseInput());
    const target = { dataset: {} };
    expect(planner().publishCartesianLayout(target, plan, {
      tabId: 'tab-a', component: 'line', generation: 7
    })).toBe(true);

    expect(planner().clearPublishedLayout(target, { tabId: 'tab-b', component: 'line' })).toBe(false);
    expect(target.__cartesianLayoutPlan).toBe(plan);
    expect(target.dataset.cartesianLayoutComplete).toBe('true');
  });

  test('cache rehydration rebinds derived geometry without changing cached user-frame authority', () => {
    const plan = planner().planCartesianLayout(baseInput());
    const source = { dataset: {} };
    expect(planner().publishCartesianLayout(source, plan, {
      tabId: 'tab-a', component: 'line', generation: 7,
      payloadSignature: 'p', layoutSignature: 'l'
    })).toBe(true);
    const target = { dataset: {}, __sharedResizableBoxApi: { commitCartesianLayout: jest.fn(() => true) } };

    expect(planner().rehydratePublishedLayout(target, source, {
      tabId: 'tab-a', component: 'line', generation: 9,
      payloadSignature: 'p', layoutSignature: 'l'
    })).toBe(true);
    const restored = target.__cartesianLayoutPlan;
    expect(restored.userFrame).toEqual(plan.userFrame);
    expect(restored.plotRect).toEqual(plan.plotRect);
    expect(restored.publication.rehydrated).toBe(true);
    expect(restored.publication.sourceGeneration).toBe(7);
    expect(restored.owner.generation).toBe(9);

    const unsignedSource = { dataset: { ...source.dataset } };
    delete unsignedSource.dataset.cartesianPayloadSignature;
    delete unsignedSource.dataset.cartesianLayoutSignature;
    const unsignedTarget = { dataset: {}, __sharedResizableBoxApi: { commitCartesianLayout: jest.fn(() => true) } };
    expect(planner().rehydratePublishedLayout(unsignedTarget, unsignedSource, {
      tabId: 'tab-a', component: 'line', generation: 10,
      payloadSignature: 'p', layoutSignature: 'l'
    })).toBe(true);
  });
});
