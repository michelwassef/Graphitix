describe('Shared.styleUndo', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    global.Shared = window.Shared;
    require('../js/shared/undo.js');
    require('../js/shared/styleUndo.js');
    window.Shared.undoManager.clear?.();
  });

  test('records aggregate undo as per-target restore and redo as aggregate apply', () => {
    const { Shared } = window;
    const state = { A: '#111111', B: '#222222' };
    const scopeOptions = [
      { value: 'global', label: 'Global' },
      { value: 'series::A', label: 'A', scopeDataset: 'A', scopeKind: 'series' },
      { value: 'series::B', label: 'B', scopeDataset: 'B', scopeKind: 'series' }
    ];
    const context = { scope: 'global', scopeValue: 'global', scopeDataset: null };
    const snapshots = Shared.styleUndo.captureScopedValues({
      context,
      scopeOptions,
      snapshotContext: ctx => ({ ...ctx }),
      buildContextFromScopeOption(option){
        const [scope, dataset] = String(option.value).split('::');
        return {
          scope,
          scopeValue: option.value,
          scopeDataset: dataset || null
        };
      },
      getter(ctx){
        return ctx.scope === 'series' ? state[ctx.scopeDataset] : state.A;
      }
    });

    state.A = '#ffaa00';
    state.B = '#ffaa00';
    Shared.styleUndo.recordStateChange({
      label: 'test:aggregate-style',
      from: '#111111',
      to: '#ffaa00',
      scopedFrom: snapshots,
      context,
      restoreContext: snapshot => snapshot || context,
      apply(value, applyContext){
        if(applyContext?.scope === 'series'){
          state[applyContext.scopeDataset] = value;
          return;
        }
        state.A = value;
        state.B = value;
      }
    });

    expect(Shared.undoManager.undo()).toBe(true);
    expect(state).toEqual({ A: '#111111', B: '#222222' });
    expect(Shared.undoManager.redo()).toBe(true);
    expect(state).toEqual({ A: '#ffaa00', B: '#ffaa00' });
  });
});
