describe('Shared.formulaEngine', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = window.Shared || {};
    require('../js/shared/formulaEngine.js');
  });

  test('supports Excel-style A1 refs with row offset', () => {
    const model = window.Shared.formulaEngine.createModel({
      headerRows: 1,
      a1RowOffset: 1
    });
    model.rebuildFromMatrix([
      ['Control', 'Treatment', 'Result'],
      ['1', '2', '=A1+B1']
    ]);
    expect(model.getResolvedAt(1, 2)).toBe(3);
  });

  test('keeps default A1 behavior when no offset is provided', () => {
    const model = window.Shared.formulaEngine.createModel({
      headerRows: 1
    });
    model.rebuildFromMatrix([
      ['10', '20', 'Header'],
      ['1', '2', '=A1+B1']
    ]);
    expect(model.getResolvedAt(1, 2)).toBe(30);
  });

  test('shifts formula references for fill operations', () => {
    const shiftedDown = window.Shared.formulaEngine.shiftFormulaReferences('=A1+B1', { rowDelta: 1, colDelta: 0 });
    const shiftedRight = window.Shared.formulaEngine.shiftFormulaReferences('=SUM(A1:B2)', { rowDelta: 0, colDelta: 1 });
    expect(shiftedDown).toBe('=A2+B2');
    expect(shiftedRight).toBe('=SUM(B1:C2)');
  });

  test('honors absolute references when shifting formulas', () => {
    const shifted = window.Shared.formulaEngine.shiftFormulaReferences('=$A1+B$1+$C$3', { rowDelta: 2, colDelta: 4 });
    expect(shifted).toBe('=$A3+F$1+$C$3');
  });

  test('formats A1 refs from physical row/col with offset', () => {
    const ref = window.Shared.formulaEngine.toA1(1, 2, { a1RowOffset: 1 });
    const none = window.Shared.formulaEngine.toA1(0, 0, { a1RowOffset: 1 });
    expect(ref).toBe('C1');
    expect(none).toBeNull();
  });

  test('normalizes floating arithmetic artifacts in formula outputs', () => {
    const model = window.Shared.formulaEngine.createModel({
      headerRows: 1,
      a1RowOffset: 1
    });
    model.rebuildFromMatrix([
      ['A', 'B', 'C', 'D'],
      ['17.3', '16.6', '=A1+B1', '=0.1+0.2']
    ]);
    expect(model.getResolvedAt(1, 2)).toBe(33.9);
    expect(model.getResolvedAt(1, 3)).toBe(0.3);
  });
});
