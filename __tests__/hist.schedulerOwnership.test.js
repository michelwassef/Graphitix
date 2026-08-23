describe('hist owner draw scheduler ownership', () => {
  let hist;
  let hooks;
  let state;
  let lifecycle;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {
      isDebugEnabled: () => false
    };
    window.Components = {};
    require('../js/shared/componentLifecycle.js');
    lifecycle = window.Shared.componentLifecycle;
    require('../js/components/hist.js');
    hist = window.Components.hist;
    hooks = hist.__testHooks;
    const stateTarget = hist.__internalStateBridge?.targets?.find(target => target.key === 'state');
    state = stateTarget?.get?.() || null;
    expect(state).toBeTruthy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('active owner draw uses the live projection scheduler instead of a stale session mirror', () => {
    const liveScheduler = jest.fn();
    const staleSessionScheduler = jest.fn();
    state.scheduleDraw = liveScheduler;

    const session = {
      componentKey: 'hist',
      tabId: 'hist-a',
      timers: {
        scheduleDraw: staleSessionScheduler,
        pendingDrawOptions: null
      }
    };
    hist.__boundTabId = session.tabId;
    jest.spyOn(lifecycle, 'canOwnerUseLiveProjection').mockImplementation((componentKey, owner) => (
      componentKey === 'hist' && owner === session
    ));

    const scheduled = hooks.scheduleOwnerDraw({ session }, {
      reason: 'resize',
      viewOnly: true,
      force: true
    });

    expect(scheduled).toBe(true);
    expect(lifecycle.canOwnerUseLiveProjection).toHaveBeenCalledWith(
      'hist',
      session,
      expect.objectContaining({ component: hist, session })
    );
    expect(liveScheduler).toHaveBeenCalledTimes(1);
    expect(staleSessionScheduler).not.toHaveBeenCalled();
    expect(session.timers.pendingDrawOptions).toMatchObject({
      reason: 'resize',
      viewOnly: true,
      force: true
    });
  });
});
