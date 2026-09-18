'use strict';

let lifecycle;

function createNode(){
  const listeners = new Map();
  return {
    addEventListener(type, handler, options){
      const entries = listeners.get(type) || [];
      entries.push({ handler, options });
      listeners.set(type, entries);
    },
    removeEventListener(type, handler, options){
      const entries = listeners.get(type) || [];
      listeners.set(type, entries.filter(entry => entry.handler !== handler || entry.options !== options));
    },
    dispatch(type, event = {}){
      const current = { ...event, currentTarget: this, target: event.target || this };
      (listeners.get(type) || []).slice().forEach(entry => entry.handler(current));
    },
    count(type){
      return (listeners.get(type) || []).length;
    }
  };
}

beforeEach(() => {
  jest.resetModules();
  delete global.Shared;
  global.Shared = {};
  require('../../js/shared/componentLifecycle.js');
  lifecycle = global.Shared.componentLifecycle;
});

describe('componentLifecycle owner control binding', () => {
  test('replaces one owner handler without disturbing another component handler', () => {
    const node = createNode();
    const first = jest.fn();
    const replacement = jest.fn();
    const otherComponent = jest.fn();
    const binder = lifecycle.createOwnerControlBinder({ componentKey: 'alpha' });
    const otherBinder = lifecycle.createOwnerControlBinder({ componentKey: 'beta' });

    binder(node, 'change', 'value', first);
    binder(node, 'change', 'value', replacement);
    otherBinder(node, 'change', 'value', otherComponent);
    node.dispatch('change');

    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(otherComponent).toHaveBeenCalledTimes(1);
    expect(node.count('change')).toBe(2);
    expect(lifecycle.hasOwnerControlHandlers(node, 'alpha')).toBe(true);
    expect(lifecycle.hasOwnerControlHandlers(node, 'beta')).toBe(true);
  });

  test('removes a replaced listener with the original event options', () => {
    const node = createNode();
    const options = { capture: true };
    const first = jest.fn();
    const second = jest.fn();
    const binder = lifecycle.createOwnerControlBinder({ componentKey: 'alpha' });

    binder(node, 'click', 'open', first, options);
    binder(node, 'click', 'open', second, options);
    node.dispatch('click');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(node.count('click')).toBe(1);
  });

  test('resolves the target owner and blocks inactive callbacks', () => {
    const node = createNode();
    const handler = jest.fn();
    const owner = { tabId: 'tab-a' };
    let active = false;
    const binder = lifecycle.createOwnerControlBinder({
      componentKey: 'alpha',
      resolveOwner: () => owner,
      isOwnerActive: value => active && value === owner
    });

    binder(node, 'input', 'value', handler);
    node.dispatch('input');
    expect(handler).not.toHaveBeenCalled();

    active = true;
    node.dispatch('input');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.instances[0]).toBe(node);
    expect(handler.mock.calls[0][1]).toBe(owner);
  });

  test('keeps specialized owner runners as the component hook', () => {
    const node = createNode();
    const handler = jest.fn();
    const runner = jest.fn((event, reason, invoke) => invoke({ tabId: 'tab-a' }));
    const binder = lifecycle.createOwnerControlBinder({
      componentKey: 'alpha',
      runOwnerCallback: runner
    });

    binder(node, 'click', 'open', handler);
    node.dispatch('click');

    expect(runner).toHaveBeenCalledWith(expect.any(Object), 'alpha-control-open', expect.any(Function), expect.objectContaining({ componentKey: 'alpha' }));
    expect(handler).toHaveBeenCalledWith(expect.any(Object), { tabId: 'tab-a' });
  });

  test('keeps the strongest queued redraw impact for one owner frame', () => {
    const previousRequestAnimationFrame = global.requestAnimationFrame;
    const frames = [];
    global.requestAnimationFrame = callback => {
      frames.push(callback);
      return frames.length;
    };
    try{
      const component = {};
      const draw = jest.fn();
      const schedule = lifecycle.createTabScopedFrameDebouncer(component, 'alpha', draw);

      schedule({
        tabId: 'tab-a',
        viewOnly: false,
        renderImpact: 'analysis',
        reason: 'data-change'
      });
      schedule({
        tabId: 'tab-a',
        viewOnly: true,
        renderImpact: 'paint',
        reason: 'style-change'
      });

      expect(frames).toHaveLength(1);
      frames[0]();
      expect(draw).toHaveBeenCalledWith(expect.objectContaining({
        tabId: 'tab-a',
        viewOnly: false,
        renderImpact: 'analysis',
        reason: 'style-change'
      }));
    }finally{
      global.requestAnimationFrame = previousRequestAnimationFrame;
    }
  });

  test('assigns a conservative impact to every sanitized draw request', () => {
    expect(lifecycle.sanitizeDrawOptions({ tabId: 'tab-a', viewOnly: true }))
      .toEqual(expect.objectContaining({ tabId: 'tab-a', renderImpact: 'layout' }));
    expect(lifecycle.sanitizeDrawOptions({ tabId: 'tab-a', force: true }))
      .toEqual(expect.objectContaining({ tabId: 'tab-a', renderImpact: 'analysis' }));
    expect(lifecycle.sanitizeDrawOptions({ tabId: 'tab-a', viewOnly: true, renderImpact: 'paint' }))
      .toEqual(expect.objectContaining({ tabId: 'tab-a', renderImpact: 'paint' }));
    expect(lifecycle.createStructuralDrawOptions('mode-change', { tabId: 'tab-a' }))
      .toEqual(expect.objectContaining({ tabId: 'tab-a', structural: true, renderImpact: 'structural' }));
  });
});
