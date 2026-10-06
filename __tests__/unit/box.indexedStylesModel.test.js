const model = require('../../js/components/boxIndexedStylesModel.js');

function indexedState() {
  return {
    fillColors: ['red', 'green', 'blue'],
    borderColors: ['darkred', 'darkgreen', 'darkblue'],
    traceShapeStyles: {
      0: { fill: 'red' },
      2: { fill: 'blue' },
      retained: { fill: 'black' }
    },
    pointStyles: { 1: { size: 6 } },
    summaryStyles: { 2: { color: 'blue' } }
  };
}

describe('Box indexed styles model', () => {
  test('splices palette arrays and sparse style maps together without changing the source', () => {
    const before = indexedState();

    const after = model.splice(before, 1, 1, 2);

    expect(after).toEqual({
      fillColors: ['red', '', '', 'blue'],
      borderColors: ['darkred', '', '', 'darkblue'],
      traceShapeStyles: { 0: { fill: 'red' }, 3: { fill: 'blue' }, retained: { fill: 'black' } },
      pointStyles: {},
      summaryStyles: { 3: { color: 'blue' } }
    });
    expect(before).toEqual(indexedState());
  });

  test('restores a deleted slice across every indexed field', () => {
    const before = indexedState();
    const saved = model.captureSlice(before, 1, 2);
    const afterDelete = model.splice(before, 1, 2, 0);
    const afterUndo = model.restoreSlice(model.splice(afterDelete, 1, 0, 2), 1, saved);

    expect(afterUndo).toEqual(before);
    expect(afterUndo.traceShapeStyles[1]).toBeUndefined();
  });

  test('reorders arrays and indexed maps while preserving non-indexed map entries', () => {
    const before = indexedState();

    const after = model.reorder(before, [2, 0, 1]);

    expect(after.fillColors).toEqual(['blue', 'red', 'green']);
    expect(after.borderColors).toEqual(['darkblue', 'darkred', 'darkgreen']);
    expect(after.traceShapeStyles).toEqual({ 1: { fill: 'red' }, 0: { fill: 'blue' }, retained: { fill: 'black' } });
    expect(after.pointStyles).toEqual({ 2: { size: 6 } });
    expect(after.summaryStyles).toEqual({ 0: { color: 'blue' } });
  });

  test('normalizes sparse, short, and malformed inputs without mutating them', () => {
    expect(model.captureSlice(null, -2, 3)).toEqual({
      fillColors: [],
      borderColors: [],
      traceShapeStyles: {},
      pointStyles: {},
      summaryStyles: {}
    });
    expect(model.splice({ fillColors: ['only'] }, 4, -1, 1).fillColors).toEqual(['only', '', '', '', '']);
    expect(model.restoreValuesSlice({ 0: { color: 'old' } }, -4, { 0: { color: 'new' } }))
      .toEqual({ 0: { color: 'new' } });
  });
});
