'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../js/shared/hot.js'),
  'utf8'
);

describe('Shared.hot heavy paste scheduling contract', () => {
  test('native AG Grid paste commits one table mutation and schedules one redraw', () => {
    expect(source).toContain('let pasteTransaction = null;');
    expect(source).toContain('onPasteStart(event)');
    expect(source).toContain('const changes = completePasteTransaction(event);');
    expect(source).toContain("syncActiveTabPayloadDataChanges(transaction.payloadChanges, 'table-paste'");
    expect(source).toContain("triggerSchedule('afterPaste', { source: 'paste', changes });");
    expect(source).toContain('if(isPasteMutation){');
    expect(source).not.toContain("triggerSchedule('afterChange', { source: event.source || 'edit', changes: visualChanges });");
  });

  test('large pastes request the component loading overlay before redraw', () => {
    expect(source).toContain("const HEAVY_TABLE_OVERLAY_CELL_THRESHOLD = 5000;");
    expect(source).toContain("if(reason !== 'afterPaste')");
    expect(source).toContain("payload.forceOverlay = true;");
    expect(source).toContain("payload.heavy = true;");
  });

  test('clipboard outlines use the visible perimeter and contiguous header groups', () => {
    expect(source).toContain("{ visiblePerimeter: true }");
    expect(source).toContain('const groupContiguousVisualIndexes = indexes =>');
    expect(source).toContain('buildSelectionRangesFromRows = rows => groupContiguousVisualIndexes(rows)');
    expect(source).toContain('buildSelectionRangesFromColumns = (columns, rowStart, rowEnd)=>groupContiguousVisualIndexes(columns)');
    expect(source).toContain('from: { row: group.start, col: 0 }');
    expect(source).toContain('to: { row: group.end, col: Math.max(0, colCount - 1) }');
    expect(source).toContain('from: { row: rowStart, col: group.start }');
    expect(source).toContain('to: { row: rowEnd, col: group.end }');
  });
});
