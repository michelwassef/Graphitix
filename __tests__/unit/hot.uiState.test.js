describe('Shared.hot UI state helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../../js/shared/hot.js');
  });

  afterEach(() => {
    delete window.Shared;
  });

  test('captureHotUiState returns null for falsy instance', () => {
    expect(window.Shared.hot.captureHotUiState(null)).toBeNull();
    expect(window.Shared.hot.captureHotUiState(undefined)).toBeNull();
  });

  test('captureHotUiState reads viewport, selection, and column widths', () => {
    const instance = {
      gridApi: {
        getFirstDisplayedRowIndex: () => 42,
        getVerticalPixelRange: () => ({ top: 800, bottom: 1200 })
      },
      getSelectedRangeLast: () => ({
        from: { row: 5, col: 1 },
        to: { row: 8, col: 3 }
      }),
      getColumnWidths: () => ({ c0: 96, c1: 222 })
    };
    const captured = window.Shared.hot.captureHotUiState(instance);
    expect(captured).toEqual({
      firstDisplayedRow: 42,
      scrollTopPx: 800,
      selection: { from: { row: 5, col: 1 }, to: { row: 8, col: 3 } },
      columnWidths: { c0: 96, c1: 222 }
    });
  });

  test('the internal adapter captures plain UI data without resolving workspace ownership', () => {
    const adapter = window.Shared.hotUiStateAdapter.createHotUiStateAdapter();
    const instance = {
      __workspaceTabId: 'tab-a',
      gridApi: { getFirstDisplayedRowIndex: () => 9 },
      getSelectedRangeLast: () => ({
        from: { row: 2, col: 1 },
        to: { row: 4, col: 3 }
      })
    };

    expect(adapter.capture(instance)).toEqual({
      firstDisplayedRow: 9,
      selection: { from: { row: 2, col: 1 }, to: { row: 4, col: 3 } }
    });
  });

  test('captureHotUiState returns null when nothing meaningful is found', () => {
    expect(window.Shared.hot.captureHotUiState({})).toBeNull();
  });

  test('applyHotUiState invokes ensureIndexVisible and selectCell when state present', () => {
    const ensureIndexVisible = jest.fn();
    const setVerticalScrollPosition = jest.fn();
    const selectCell = jest.fn();
    const applyColumnWidths = jest.fn(() => true);
    const instance = {
      gridApi: { ensureIndexVisible, setVerticalScrollPosition },
      selectCell,
      applyColumnWidths
    };
    const applied = window.Shared.hot.applyHotUiState(instance, {
      firstDisplayedRow: 17,
      scrollTopPx: 812,
      columnWidths: { c0: 144, c1: 288 },
      selection: { from: { row: 1, col: 0 }, to: { row: 3, col: 2 } }
    }, { reason: 'unit-test' });
    expect(applied).toBe(true);
    expect(ensureIndexVisible).toHaveBeenCalledWith(17, 'top');
    expect(setVerticalScrollPosition).toHaveBeenCalledWith(812);
    expect(applyColumnWidths).toHaveBeenCalledWith({ c0: 144, c1: 288 });
    expect(selectCell).toHaveBeenCalledWith(1, 0, 3, 2);
  });

  test('table UI hooks enforce the requested tab owner during restore', () => {
    const hot = {
      gridApi: { ensureIndexVisible: jest.fn() }
    };
    const hooks = window.Shared.hot.makeTableUiStateHooks(() => hot, 'unit');

    expect(hooks.apply({ table: { tabId: 'tab-a', firstDisplayedRow: 2 } }, { tabId: 'tab-b' })).toBe(false);
    expect(hot.gridApi.ensureIndexVisible).not.toHaveBeenCalled();
  });

  test('applyHotUiState ignores fields whose targets are unavailable', () => {
    const instance = { gridApi: {}, selectCell: undefined };
    const applied = window.Shared.hot.applyHotUiState(instance, {
      firstDisplayedRow: 99,
      selection: { from: { row: 0, col: 0 }, to: { row: 0, col: 0 } }
    });
    expect(applied).toBe(false);
  });

  test('the internal adapter applies only when the facade supplies a matching owner', () => {
    const debug = jest.fn();
    const adapter = window.Shared.hotUiStateAdapter.createHotUiStateAdapter({ debug });
    const ensureIndexVisible = jest.fn();
    const instance = { gridApi: { ensureIndexVisible } };
    const state = { tabId: 'tab-a', firstDisplayedRow: 6 };

    expect(adapter.apply(instance, state, { ownerTabId: 'tab-b' })).toBe(false);
    expect(ensureIndexVisible).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(
      'Debug: Shared.hot.applyHotUiState skipped due to tab ownership mismatch',
      { stateTabId: 'tab-a', ownerTabId: 'tab-b', reason: 'apply-hot-uiState' }
    );

    expect(adapter.apply(instance, state, { ownerTabId: 'tab-a', reason: 'restore-a' })).toBe(true);
    expect(ensureIndexVisible).toHaveBeenCalledWith(6, 'top');
  });
});
