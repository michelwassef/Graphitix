describe('Shared.hot exclusion persistence ownership', () => {
  let originalAgGrid;
  let createdTables;
  let session;
  let activeTab;
  let ownerTab;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    createdTables = [];
    activeTab = {
      id: 'workspace-active',
      type: 'heatmap',
      payload: { type: 'heatmap', data: [['A'], [1]], exclusions: { rows: [], cols: [], cells: [] } }
    };
    ownerTab = {
      id: 'workspace-owner',
      type: 'heatmap',
      payload: { type: 'heatmap', data: [['B'], [2]], exclusions: { rows: [], cols: [], cells: [] } }
    };
    session = {
      workspaceState: {
        tabs: [activeTab, ownerTab],
        activeTabId: activeTab.id,
        sessionRevision: 10
      },
      getActiveTab: jest.fn(() => activeTab),
      updateTabPayload: jest.fn((tab, mutator, meta) => {
        const draft = JSON.parse(JSON.stringify(tab.payload || {}));
        const next = mutator(draft) || draft;
        tab.payload = next;
        tab.payloadDirty = false;
        tab.userModified = meta?.origin === 'user';
        session.workspaceState.sessionRevision += 1;
        return true;
      })
    };
    window.Main = { session, components: { registry: {} } };
    window.Shared = {};

    originalAgGrid = window.agGrid;
    const api = {
      refreshCells: jest.fn(),
      setRowData: jest.fn(),
      setColumnDefs: jest.fn(),
      destroy: jest.fn(),
      getFocusedCell: jest.fn(() => null)
    };
    window.agGrid = {
      createGrid: (_container, gridOptions) => {
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    require('../js/vendor.js');
    require('../js/shared/undo.js');
    require('../js/shared/agGridAdapter.js');
    require('../js/shared/hot.js');
  });

  afterEach(() => {
    createdTables.forEach(table => {
      try { table.destroy?.(); } catch (_err) { /* best effort */ }
    });
    window.agGrid = originalAgGrid;
    document.body.innerHTML = '';
    delete window.Main;
    delete window.Shared;
  });

  function createOwnedTable(tab, scheduleDraw = jest.fn()) {
    const container = document.createElement('div');
    container.dataset.workspaceTabId = tab.id;
    container.dataset.componentType = tab.type;
    container.id = `${tab.id}-hot`;
    document.body.appendChild(container);
    const table = window.Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 4 },
      scheduleDraw,
      {
        debugLabel: `${tab.id}-table`,
        data: [['A', 'B'], [1, 2], [3, 4], [5, 6]],
        exclusions: tab.payload.exclusions
      }
    );
    createdTables.push(table);
    return { table, scheduleDraw };
  }

  test('cell, row, and column exclusions commit to the exact owning tab, not the active sibling', () => {
    const { table, scheduleDraw } = createOwnedTable(ownerTab);
    const initialRevision = session.workspaceState.sessionRevision;

    table.__hotExclusionController.markCells([{ row: 2, col: 1 }], true);
    table.__hotExclusionController.markRows([3], true);
    table.__hotExclusionController.markColumns([0], true);

    expect(ownerTab.payload.exclusions).toEqual({
      rows: [3],
      cols: [0],
      cells: [[2, 1]]
    });
    expect(activeTab.payload.exclusions).toEqual({ rows: [], cols: [], cells: [] });
    expect(session.updateTabPayload).toHaveBeenCalledTimes(3);
    expect(session.updateTabPayload).toHaveBeenLastCalledWith(
      ownerTab,
      expect.any(Function),
      expect.objectContaining({ origin: 'user', reason: 'table-exclusions-column' })
    );
    expect(session.workspaceState.sessionRevision).toBe(initialRevision + 3);
    expect(scheduleDraw).toHaveBeenCalledTimes(3);
  });

  test('structural exclusion shifts write through without scheduling a duplicate graph redraw', () => {
    const { table, scheduleDraw } = createOwnedTable(ownerTab);
    table.applyExclusions({ rows: [1], cols: [], cells: [[2, 1]] }, { source: 'archive-restore' });
    session.updateTabPayload.mockClear();
    scheduleDraw.mockClear();
    const initialRevision = session.workspaceState.sessionRevision;

    table.__hotExclusionController.shiftRowsForInsert(1, 1);

    expect(table.exportExclusions()).toEqual({ rows: [2], cols: [], cells: [[3, 1]] });
    expect(ownerTab.payload.exclusions).toEqual({ rows: [2], cols: [], cells: [[3, 1]] });
    expect(session.updateTabPayload).toHaveBeenCalledTimes(1);
    expect(session.workspaceState.sessionRevision).toBe(initialRevision + 1);
    expect(scheduleDraw).not.toHaveBeenCalled();
  });

  test('restore-time exclusion hydration is silent and does not create a user revision', () => {
    const { table, scheduleDraw } = createOwnedTable(ownerTab);
    const initialRevision = session.workspaceState.sessionRevision;

    table.applyExclusions({ rows: [1], cols: [2], cells: [[3, 0]] }, {
      source: 'archive-restore'
    });

    expect(table.exportExclusions()).toEqual({ rows: [1], cols: [2], cells: [[3, 0]] });
    expect(session.updateTabPayload).not.toHaveBeenCalled();
    expect(session.workspaceState.sessionRevision).toBe(initialRevision);
    expect(scheduleDraw).not.toHaveBeenCalled();
  });
});
