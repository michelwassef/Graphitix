'use strict';

let lifecycle;

beforeEach(() => {
  jest.resetModules();
  delete global.Shared;
  global.Shared = {};
  require('../../js/shared/componentLifecycle.js');
  lifecycle = global.Shared.componentLifecycle;
});

describe('componentLifecycle session shape guard', () => {
  test('normalizes each owner field once and re-normalizes explicit replacement', () => {
    const normalizeState = jest.fn(value => ({
      value: Number(value?.value) || 0,
      normalized: true
    }));
    const guard = lifecycle.createSessionShapeGuard({
      getOwnerKey: session => session.tabId,
      fields: [
        { key: 'state', normalize: normalizeState }
      ]
    });
    const session = { tabId: 'tab-a', state: { value: 3 } };

    expect(guard(session)).toBe(session);
    const firstState = session.state;
    expect(normalizeState).toHaveBeenCalledTimes(1);

    expect(guard(session)).toBe(session);
    expect(session.state).toBe(firstState);
    expect(normalizeState).toHaveBeenCalledTimes(1);

    session.state = { value: 7 };
    guard(session);
    expect(session.state).not.toBe(firstState);
    expect(session.state.value).toBe(7);
    expect(normalizeState).toHaveBeenCalledTimes(2);

    guard(session);
    expect(normalizeState).toHaveBeenCalledTimes(2);
  });

  test('re-shapes fields when the owner key changes', () => {
    const normalize = jest.fn(value => ({ value: value?.value || 0 }));
    const guard = lifecycle.createSessionShapeGuard({
      getOwnerKey: session => session.tabId,
      fields: [{ key: 'state', normalize }]
    });
    const session = { tabId: 'tab-a', state: { value: 1 } };

    guard(session);
    const firstState = session.state;
    session.tabId = 'tab-b';
    guard(session);

    expect(session.state).not.toBe(firstState);
    expect(normalize).toHaveBeenCalledTimes(2);
  });
});
