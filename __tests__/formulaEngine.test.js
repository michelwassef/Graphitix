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

  test('supports absolute references in formula evaluation', () => {
    const model = window.Shared.formulaEngine.createModel({
      headerRows: 1,
      a1RowOffset: 1
    });
    model.rebuildFromMatrix([
      ['A', 'B', 'C'],
      ['5', '2', '=SUM($A1,B$1,$A$1)']
    ]);
    expect(model.getResolvedAt(1, 2)).toBe(12);
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

  test('normalizes floating artifacts for division as well', () => {
    const model = window.Shared.formulaEngine.createModel({
      headerRows: 1,
      a1RowOffset: 1
    });
    model.rebuildFromMatrix([
      ['A', 'B'],
      ['=0.3/0.1', '=0.1/0.2']
    ]);
    expect(model.getResolvedAt(1, 0)).toBe(3);
    expect(model.getResolvedAt(1, 1)).toBe(0.5);
  });

  test('returns #ERROR! for malformed numeric formulas', () => {
    const model = window.Shared.formulaEngine.createModel({
      headerRows: 0,
      a1RowOffset: 0
    });
    model.rebuildFromMatrix([
      ['=1..2+3', '=1.2.3', '=SUM(A1']
    ]);
    expect(model.getResolvedAt(0, 0)).toBe('#ERROR!');
    expect(model.getResolvedAt(0, 1)).toBe('#ERROR!');
    expect(model.getResolvedAt(0, 2)).toBe('#ERROR!');
  });

  test('supports batched setCellsRaw updates', () => {
    const model = window.Shared.formulaEngine.createModel({
      headerRows: 0,
      a1RowOffset: 0
    });
    model.rebuildFromMatrix([
      ['1', '2', '=A1+B1']
    ]);
    model.setCellsRaw([
      { row: 0, col: 0, value: '10' },
      { row: 0, col: 1, value: '20' }
    ]);
    expect(model.getResolvedAt(0, 2)).toBe(30);
  });
});
