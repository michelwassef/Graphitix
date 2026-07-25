describe('data view tab export menu', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/vendor.js');
    require('../js/shared/dataViews.js');
    window.Shared.disableDebugLogging?.();
    window.Main = window.Main || {};
    window.Main.session = {
      getActiveTab: () => ({ title: 'test' })
    };
  });

  function createMountedManager() {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    manager.initialize([
      ['Gene', 'Value'],
      ['A', 1],
      ['B', 2]
    ]);

    manager.createDerivedView({
      title: 'log2(x+1)',
      data: [
        ['Gene', 'Value'],
        ['A', 1],
        ['B', 1.58]
      ],
      activate: false
    });

    const wrapper = document.createElement('div');
    const tableContainer = document.createElement('div');
    document.body.appendChild(wrapper);
    wrapper.appendChild(tableContainer);
    manager.mount({ wrapper, tableContainer });
    return { manager, wrapper };
  }

  test('renders save icon for raw and derived views', () => {
    const { wrapper } = createMountedManager();
    const saveButtons = wrapper.querySelectorAll('.data-view-tabs__save');
    expect(saveButtons.length).toBe(2);
    expect(wrapper.querySelectorAll('.data-view-tabs__close').length).toBe(1);
    const exportLabel = wrapper.querySelector('.data-view-tabs__export-label');
    expect(exportLabel?.textContent).toBe('Save as:');
  });

  test('exports csv for selected view with save-as', async () => {
    const { wrapper } = createMountedManager();
    const saveGraphFileAs = jest.fn().mockResolvedValue({ status: 'saved', via: 'picker' });
    window.Shared.fileIO = { saveGraphFileAs };

    const firstSave = wrapper.querySelector('.data-view-tabs__save[data-view-id="raw"]');
    firstSave.click();
    const csvItem = wrapper.querySelector('.data-view-tabs__export-item[data-format="csv"]');
    csvItem.click();
    await Promise.resolve();

    expect(saveGraphFileAs).toHaveBeenCalledTimes(1);
    const call = saveGraphFileAs.mock.calls[0][0];
    expect(call.fileName).toBe('test_Raw.csv');
    expect(call.downloadFileName).toBe('test_Raw.csv');
    expect(call.payload.type).toContain('text/csv');
    expect(call.payload.size).toBeGreaterThan(0);
  });

  test('exports xlsx for selected view with save-as', async () => {
    const { wrapper } = createMountedManager();
    const saveGraphFileAs = jest.fn().mockResolvedValue({ status: 'saved', via: 'picker' });
    window.Shared.fileIO = { saveGraphFileAs };
    window.Shared.lazyXlsx = jest.fn().mockResolvedValue({
      utils: {
        book_new: () => ({ sheets: [] }),
        aoa_to_sheet: data => ({ data }),
        book_append_sheet: (book, sheet, sheetName) => {
          book.sheets.push({ sheet, sheetName });
        }
      },
      write: () => new Uint8Array([1, 2, 3])
    });

    const save = wrapper.querySelector('.data-view-tabs__save[data-view-id="view-2"]');
    save.click();
    const xlsxItem = wrapper.querySelector('.data-view-tabs__export-item[data-format="xlsx"]');
    xlsxItem.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.Shared.lazyXlsx).toHaveBeenCalledTimes(1);
    expect(saveGraphFileAs).toHaveBeenCalledTimes(1);
    const call = saveGraphFileAs.mock.calls[0][0];
    expect(call.fileName).toBe('test_log2(x+1).xlsx');
    expect(call.payload.type).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  test('serializes and restores active view filters without sharing references', () => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    manager.initialize([
      ['Gene', 'Value'],
      ['A', 1],
      ['B', 2]
    ]);

    const filters = {
      version: 1,
      columns: {
        c1: {
          kind: 'condition',
          operator: 'greaterThan',
          value: '1',
          columnType: 'numeric'
        }
      }
    };
    manager.updateActiveFilters(filters);
    filters.columns.c1.value = '99';

    const serialized = manager.serialize({ includeData: false });
    expect(serialized.views[0].filters).toEqual({
      version: 1,
      columns: {
        c1: {
          kind: 'condition',
          operator: 'greaterThan',
          value: '1',
          columnType: 'numeric'
        }
      }
    });

    const restored = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    restored.deserialize(serialized, {
      fallbackData: [
        ['Gene', 'Value'],
        ['A', 1],
        ['B', 2]
      ],
      silent: true,
      activate: false
    });
    expect(restored.getActiveView()?.filters).toEqual(serialized.views[0].filters);
  });

  test('keeps exclusions shared across existing, new, and restored views', () => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    manager.initialize([
      ['Gene', 'Value'],
      ['A', 1]
    ]);
    manager.createDerivedView({
      title: 'CPM',
      data: [
        ['Gene', 'Value'],
        ['A', 1000000]
      ],
      activate: false
    });

    const exclusions = { rows: [1], cols: [0], cells: [[1, 1]] };
    manager.updateSharedExclusions(exclusions);
    exclusions.rows.push(99);

    const sharedExclusions = manager.getSharedExclusions();
    expect(sharedExclusions).toEqual({ rows: [1], cols: [0], cells: [[1, 1]] });
    sharedExclusions.rows.push(88);
    expect(manager.getSharedExclusions()).toEqual({ rows: [1], cols: [0], cells: [[1, 1]] });
    expect(manager.getViews().map(view => view.exclusions)).toEqual([
      { rows: [1], cols: [0], cells: [[1, 1]] },
      { rows: [1], cols: [0], cells: [[1, 1]] }
    ]);

    const newView = manager.createDerivedView({
      title: 'log2(x+1)',
      data: [
        ['Gene', 'Value'],
        ['A', 19.93]
      ],
      activate: false
    });
    expect(newView.exclusions).toEqual({ rows: [1], cols: [0], cells: [[1, 1]] });

    const restored = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    restored.deserialize(manager.serialize(), { silent: true, activate: false });
    expect(restored.getViews().every(view => (
      JSON.stringify(view.exclusions) === JSON.stringify({ rows: [1], cols: [0], cells: [[1, 1]] })
    ))).toBe(true);
  });


  test('isolates exclusions for schema-changing views without losing Raw/derived exclusions', () => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    manager.initialize([
      ['Gene', 'Value'],
      ['A', 1],
      ['B', 2]
    ]);
    const cpm = manager.createDerivedView({
      title: 'CPM',
      data: [
        ['Gene', 'Value'],
        ['A', 333333],
        ['B', 666667]
      ],
      sourceViewId: 'raw',
      activate: false
    });
    const frequency = manager.createDerivedView({
      title: 'Frequency table',
      data: [
        ['Bin', 'Count'],
        ['0-1', 1]
      ],
      sourceViewId: 'raw',
      shareExclusions: false,
      activate: false
    });

    manager.updateSharedExclusions({ rows: [2], cols: [], cells: [] });
    expect(cpm.shareExclusions).toBe(true);
    expect(cpm.exclusions).toEqual({ rows: [2], cols: [], cells: [] });
    expect(frequency.shareExclusions).toBe(false);
    expect(frequency.exclusions).toBeNull();

    manager.activateView(frequency.id, { silent: true });
    manager.updateActiveExclusions({ rows: [1], cols: [], cells: [] });
    expect(frequency.exclusions).toEqual({ rows: [1], cols: [], cells: [] });
    expect(manager.getSharedExclusions()).toEqual({ rows: [2], cols: [], cells: [] });

    manager.activateView(cpm.id, { silent: true });
    manager.updateActiveExclusions({ rows: [1], cols: [0], cells: [] });
    expect(manager.getSharedExclusions()).toEqual({ rows: [1], cols: [0], cells: [] });
    expect(manager.getView('raw').exclusions).toEqual({ rows: [1], cols: [0], cells: [] });
    expect(frequency.exclusions).toEqual({ rows: [1], cols: [], cells: [] });

    const serialized = manager.serialize();
    expect(serialized.version).toBe(3);
    const restored = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    restored.deserialize(serialized, { silent: true, activate: false });
    expect(restored.getView('raw').exclusions).toEqual({ rows: [1], cols: [0], cells: [] });
    expect(restored.getView(cpm.id).exclusions).toEqual({ rows: [1], cols: [0], cells: [] });
    expect(restored.getView(frequency.id).shareExclusions).toBe(false);
    expect(restored.getView(frequency.id).exclusions).toEqual({ rows: [1], cols: [], cells: [] });
  });

  test('infers isolated exclusions for legacy schema-changing views and preserves archived Raw data', () => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    manager.deserialize({
      version: 2,
      activeViewId: 'view-2',
      sharedExclusions: { rows: [1], cols: [], cells: [] },
      views: [
        {
          id: 'raw',
          kind: 'raw',
          title: 'Raw',
          data: [['Gene', 'Value'], ['A', 1]],
          exclusions: { rows: [1], cols: [], cells: [] }
        },
        {
          id: 'view-2',
          kind: 'derived',
          title: 'Frequency table',
          sourceViewId: 'raw',
          data: [['Bin', 'Count'], ['0-1', 1], ['1-2', 0]],
          exclusions: null
        }
      ]
    }, { silent: true, activate: false });

    expect(manager.getView('raw').data).toEqual([['Gene', 'Value'], ['A', 1]]);
    expect(manager.getView('raw').shareExclusions).toBe(true);
    expect(manager.getView('view-2').shareExclusions).toBe(false);
    expect(manager.getView('view-2').exclusions).toBeNull();
  });

  test('restores legacy shared exclusions from the active compatible view when Raw has none', () => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    manager.deserialize({
      version: 1,
      activeViewId: 'view-2',
      views: [
        {
          id: 'raw',
          kind: 'raw',
          title: 'Raw',
          data: [['A'], [1]],
          exclusions: null
        },
        {
          id: 'view-2',
          kind: 'derived',
          title: 'CPM',
          sourceViewId: 'raw',
          data: [['A'], [1000000]],
          exclusions: { rows: [1], cols: [], cells: [] }
        }
      ]
    }, { silent: true, activate: false });

    expect(manager.getSharedExclusions()).toEqual({ rows: [1], cols: [], cells: [] });
    expect(manager.getView('raw').exclusions).toEqual({ rows: [1], cols: [], cells: [] });
    expect(manager.getView('view-2').exclusions).toEqual({ rows: [1], cols: [], cells: [] });
  });

  test('view projection is atomic and snapshots target view state before synchronous load hooks', () => {
    const targetExclusions = { rows: [2], cols: [1], cells: [] };
    const targetFilters = { version: 1, columns: { c1: { kind: 'condition', value: 'A' } } };
    const view = {
      data: [['Name', 'Value'], ['A', 1]],
      exclusions: targetExclusions,
      filters: targetFilters
    };
    const projectionStates = [];
    const table = {
      loadData: jest.fn(() => {
        projectionStates.push(window.Shared.dataViews.isTableProjectionActive(table));
        // Simulate a synchronous component hook mutating the active view while
        // loadData is still projecting the previous table state.
        view.exclusions = { rows: [99], cols: [], cells: [] };
        view.filters = null;
      }),
      applyExclusions: jest.fn(() => {
        projectionStates.push(window.Shared.dataViews.isTableProjectionActive(table));
      }),
      applyFilters: jest.fn(() => {
        projectionStates.push(window.Shared.dataViews.isTableProjectionActive(table));
      })
    };

    window.Shared.dataViews.applyViewToTable(table, view);

    expect(projectionStates).toEqual([true, true, true]);
    expect(window.Shared.dataViews.isTableProjectionActive(table)).toBe(false);
    expect(table.applyExclusions).toHaveBeenCalledWith(targetExclusions, expect.objectContaining({ silent: true }));
    expect(table.applyFilters).toHaveBeenCalledWith(targetFilters, expect.objectContaining({ schedule: false }));
  });

  test('uses fallback Raw data only when serialized DataViews omit matrices', () => {
    const fallbackData = [['Gene', 'Value'], ['A', 7]];
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    manager.deserialize({
      version: 3,
      activeViewId: 'raw',
      sharedExclusions: { rows: [1], cols: [], cells: [] },
      views: [{
        id: 'raw',
        kind: 'raw',
        title: 'Raw',
        shareExclusions: true,
        exclusions: { rows: [1], cols: [], cells: [] }
      }]
    }, { fallbackData, silent: true, activate: false });

    expect(manager.getView('raw').data).toEqual(fallbackData);
    expect(manager.getView('raw').exclusions).toEqual({ rows: [1], cols: [], cells: [] });
  });

  test('view projection suppresses intermediate redraws unless a specialized view opts out', () => {
    const table = {
      loadData: jest.fn(),
      applyExclusions: jest.fn(),
      applyFilters: jest.fn()
    };
    const view = {
      data: [['A'], [1]],
      exclusions: null,
      filters: null
    };

    window.Shared.dataViews.applyViewToTable(table, view, {
      loadOptions: { source: 'ordinary-view' }
    });
    expect(table.loadData).toHaveBeenLastCalledWith(view.data, {
      source: 'ordinary-view',
      suppressSchedule: true
    });

    window.Shared.dataViews.applyViewToTable(table, view, {
      loadOptions: { source: 'specialized-view' },
      suppressLoadSchedule: false
    });
    expect(table.loadData).toHaveBeenLastCalledWith(view.data, {
      source: 'specialized-view',
      suppressSchedule: false
    });
  });

  test('normalizes legacy per-view exclusions and clears table state on view switch', () => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit' });
    manager.deserialize({
      version: 1,
      activeViewId: 'view-2',
      views: [
        {
          id: 'raw',
          kind: 'raw',
          title: 'Raw',
          data: [['A'], [1]],
          exclusions: { rows: [1], cols: [], cells: [] }
        },
        {
          id: 'view-2',
          kind: 'derived',
          title: 'CPM',
          data: [['A'], [1000000]],
          exclusions: null
        }
      ]
    }, { silent: true, activate: false });

    expect(manager.getViews().map(view => view.exclusions)).toEqual([
      { rows: [1], cols: [], cells: [] },
      { rows: [1], cols: [], cells: [] }
    ]);

    const table = {
      loadData: jest.fn(),
      applyExclusions: jest.fn(),
      applyFilters: jest.fn()
    };
    window.Shared.dataViews.applyViewToTable(table, {
      data: [['A'], [2]],
      exclusions: null,
      filters: null
    }, {
      loadOptions: { source: 'unit-view-switch' }
    });

    expect(table.loadData).toHaveBeenCalledWith([['A'], [2]], {
      source: 'unit-view-switch',
      suppressSchedule: true
    });
    expect(table.applyExclusions).toHaveBeenCalledWith(null, {
      silent: true,
      source: 'data-view-switch'
    });
    expect(table.applyFilters).toHaveBeenCalledWith(null, {
      schedule: false,
      reason: 'data-view-switch'
    });
  });
});
