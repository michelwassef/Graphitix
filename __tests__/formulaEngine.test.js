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
});
