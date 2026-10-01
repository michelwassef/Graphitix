'use strict';
const { setupHotAggridBindingFixture } = require('../../test-support/hotAggridBindingSuite');

describe('Shared.hot AG Grid binding', () => {
  setupHotAggridBindingFixture();

  test('applyFilters keeps header rows visible and narrows analysis data', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotFilters';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-filters',
        data: [
          ['Label', 'Value'],
          ['A', 1],
          ['B', 2],
          ['C', 3]
        ]
      }
    );

    hot.applyFilters({
      version: 1,
      columns: {
        c1: {
          kind: 'condition',
          operator: 'greaterThan',
          value: '1',
          columnType: 'numeric'
        }
      }
    }, { schedule: false });

    expect(hot.countRows()).toBe(3);
    expect(hot.getDataAtCell(0, 0)).toBe('Label');
    expect(hot.getDataAtCell(1, 0)).toBe('B');
    expect(hot.getDataAtCell(2, 0)).toBe('C');

    const analysis = hot.getAnalysisData();
    expect(analysis.rowCount).toBe(3);
    expect(analysis.data.map(row => row.slice(0, 2))).toEqual([
      ['Label', 'Value'],
      ['B', 2],
      ['C', 3]
    ]);
    expect(hot.getIncludedDataMatrix().map(row => row.slice(0, 2))).toEqual([
      ['Label', 'Value'],
      ['B', 2],
      ['C', 3]
    ]);
  });

  test('exportFilters can be cleared and reapplied', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotFilterRoundTrip';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-filter-roundtrip',
        data: [
          ['Label', 'Value'],
          ['A', 1],
          ['B', 2],
          ['C', 2]
        ]
      }
    );

    hot.applyFilters({
      version: 1,
      columns: {
        c1: {
          kind: 'condition',
          operator: 'equals',
          value: '2',
          columnType: 'numeric'
        }
      }
    }, { schedule: false });

    const exported = hot.exportFilters();
    expect(exported).toEqual({
      version: 1,
      columns: {
        c1: {
          kind: 'condition',
          operator: 'equals',
          value: '2',
          columnType: 'numeric'
        }
      }
    });
    expect(hot.countRows()).toBe(3);

    hot.clearFilters({ schedule: false });
    expect(hot.countRows()).toBe(4);

    hot.applyFilters(exported, { schedule: false });
    expect(hot.countRows()).toBe(3);
    expect(hot.getDataAtCell(1, 0)).toBe('B');
    expect(hot.getDataAtCell(2, 0)).toBe('C');
  });

  test('analysis ignores titled columns that contain no data below the pinned row', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'test-ag-grid-empty-analysis-column',
        pinFirstRow: true,
        data: [
          ['Sample', 'Value', 'Empty titled column'],
          ['A', 1, ''],
          ['B', 2, null],
          ['C', 3, '   ']
        ]
      }
    );

    const analysis = hot.getAnalysisData();
    expect(analysis.pinnedRowCount).toBe(1);
    expect(analysis.ignoredEmptyColumns).toContain(2);
    expect(analysis.isColumnExcluded(2)).toBe(true);
    expect(analysis.getColumnValues(2, { skipHeader: true })).toEqual([]);
    expect(analysis.data.map(row => row[2])).toEqual([null, null, null, null]);
    expect(hot.getIncludedDataMatrix().map(row => row[2])).toEqual([null, null, null, null]);
    expect(analysis.isColumnExcluded(1)).toBe(false);
    expect(analysis.getColumnValues(1, { skipHeader: true })).toEqual([1, 2, 3]);
  });

  test('analysis treats formula columns with empty displayed results as inactive', () => {
    const sourceData = [
      ['Sample', 'Formula-only empty column'],
      ['A', '=EMPTY_RESULT'],
      ['B', '=EMPTY_RESULT']
    ];
    const instance = {
      countRows: () => sourceData.length,
      countCols: () => sourceData[0].length,
      getSettings: () => ({ fixedRowsTop: 1 }),
      getSourceData: () => sourceData,
      toPhysicalRow: row => row,
      toPhysicalColumn: col => col,
      getDataAtCell: (row, col) => sourceData[row]?.[col],
      __hotGetDisplayDataAtCell: (row, col) => col === 1 && row > 0 ? '' : sourceData[row]?.[col]
    };

    const analysis = window.Shared.hot.getAnalysisData(instance);

    expect(analysis.ignoredEmptyColumns).toContain(1);
    expect(analysis.inactiveAnalysisColumns).toContain(1);
    expect(analysis.isColumnExcluded(1)).toBe(true);
    expect(analysis.data.map(row => row[1])).toEqual([null, null, null]);
  });

  test('manual trailing blank columns persist without redraw while schema-shifting inserts redraw once', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const scheduleDraw = jest.fn();
    const afterCreateCol = jest.fn();

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      scheduleDraw,
      {
        debugLabel: 'test-ag-grid-manual-blank-column-insert',
        pinFirstRow: true,
        data: [
          ['A', 'B', 'C'],
          [1, 2, 3],
          [4, 5, 6]
        ],
        hotOptions: { afterCreateCol }
      }
    );
    scheduleDraw.mockClear();
    afterCreateCol.mockClear();

    const previousColumnCount = hot.countCols();
    hot.alter('insert_col_end', previousColumnCount - 1, 1, 'insert_col_end');

    expect(hot.countCols()).toBe(previousColumnCount + 1);
    expect(afterCreateCol).toHaveBeenCalledWith(previousColumnCount, 1, 'insert_col_end');
    expect(scheduleDraw).not.toHaveBeenCalled();

    afterCreateCol.mockClear();
    hot.alter('insert_col_left', 1, 1, 'insert_col_left');

    expect(afterCreateCol).toHaveBeenCalledWith(1, 1, 'insert_col_left');
    expect(scheduleDraw).toHaveBeenCalledTimes(1);
    expect(scheduleDraw).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'afterCreateCol',
      source: 'insert_col_left',
      invalidate: 'data',
      userInitiated: true
    }));
  });

  test('automatic empty-column growth is structural only and does not notify graph owners', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const scheduleDraw = jest.fn();
    const afterCreateCol = jest.fn();

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      scheduleDraw,
      {
        debugLabel: 'test-ag-grid-silent-auto-growth',
        pinFirstRow: true,
        data: [
          ['A', 'B', 'C'],
          [1, 2, 3],
          [4, 5, 6]
        ],
        hotOptions: { afterCreateCol }
      }
    );
    scheduleDraw.mockClear();
    afterCreateCol.mockClear();

    const previousColumnCount = hot.countCols();
    hot.alter('insert_col_end', previousColumnCount - 1, 1, 'autoGrow');

    expect(hot.countCols()).toBe(previousColumnCount + 1);
    expect(afterCreateCol).not.toHaveBeenCalled();
    expect(scheduleDraw).not.toHaveBeenCalled();

    hot.setDataAtCell(0, previousColumnCount, 'New title', 'edit');
    expect(hot.getDataAtCell(0, previousColumnCount)).toBe('New title');
    expect(scheduleDraw).not.toHaveBeenCalled();

    hot.setDataAtCell(1, previousColumnCount, 7, 'edit');
    expect(scheduleDraw).toHaveBeenCalledTimes(1);
    expect(scheduleDraw).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'afterChange',
      userInitiated: true
    }));
  });

  test('user cell edits schedule a userInitiated draw while programmatic loads stay non-user', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotUserInitiated';
    document.body.appendChild(container);

    const scheduleCalls = [];
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      meta => scheduleCalls.push(meta),
      {
        debugLabel: 'test-ag-grid-user-initiated',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ]
      }
    );
    expect(hot).toBeTruthy();

    // A programmatic load (the shape used during file reopen / payload apply) must
    // NOT be flagged userInitiated, so the post-render-cache-restore guard can keep
    // restore invisible.
    hot.loadData([
      ['Label', 'X Value'],
      ['Cat', 4.5]
    ], { source: 'loadData' });
    const loadCall = scheduleCalls.find(call => call && call.reason === 'afterLoadData');
    expect(loadCall).toBeTruthy();
    expect(loadCall.userInitiated).not.toBe(true);

    // A genuine user cell edit (AG grid 'edit' source) must be flagged userInitiated
    // so it redraws even while the post-restore guard is still active after reopen.
    scheduleCalls.length = 0;
    hot.setDataAtCell(0, 1, 'X_NEW', 'edit');
    const editCall = scheduleCalls.find(call => call && call.reason === 'afterChange');
    expect(editCall).toBeTruthy();
    expect(editCall.userInitiated).toBe(true);
  });
});
