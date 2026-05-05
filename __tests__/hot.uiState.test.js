describe('Shared.hot UI state helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/hot.js');
  });

  afterEach(() => {
    delete window.Shared;
  });

  test('captureHotUiState returns null for falsy instance', () => {
    expect(window.Shared.hot.captureHotUiState(null)).toBeNull();
    expect(window.Shared.hot.captureHotUiState(undefined)).toBeNull();
  });

  test('captureHotUiState reads firstDisplayedRow + selection from instance', () => {
    const instance = {
      gridApi: {
        getFirstDisplayedRowIndex: () => 42,
        getVerticalPixelRange: () => ({ top: 800, bottom: 1200 })
      },
      getSelectedRangeLast: () => ({
        from: { row: 5, col: 1 },
        to: { row: 8, col: 3 }
      })
    };
    const captured = window.Shared.hot.captureHotUiState(instance);
    expect(captured).toEqual({
      firstDisplayedRow: 42,
      scrollTopPx: 800,
      selection: { from: { row: 5, col: 1 }, to: { row: 8, col: 3 } }
    });
  });

  test('captureHotUiState returns null when nothing meaningful is found', () => {
    expect(window.Shared.hot.captureHotUiState({})).toBeNull();
  });

  test('applyHotUiState invokes ensureIndexVisible and selectCell when state present', () => {
    const ensureIndexVisible = jest.fn();
    const selectCell = jest.fn();
    const instance = {
      gridApi: { ensureIndexVisible },
      selectCell
    };
    const applied = window.Shared.hot.applyHotUiState(instance, {
      firstDisplayedRow: 17,
      selection: { from: { row: 1, col: 0 }, to: { row: 3, col: 2 } }
    }, { reason: 'unit-test' });
    expect(applied).toBe(true);
    expect(ensureIndexVisible).toHaveBeenCalledWith(17, 'top');
    expect(selectCell).toHaveBeenCalledWith(1, 0, 3, 2);
  });

  test('applyHotUiState ignores fields whose targets are unavailable', () => {
    const instance = { gridApi: {}, selectCell: undefined };
    const applied = window.Shared.hot.applyHotUiState(instance, {
      firstDisplayedRow: 99,
      selection: { from: { row: 0, col: 0 }, to: { row: 0, col: 0 } }
    });
    expect(applied).toBe(false);
  });
});
