describe('tableImport owner projection transaction', () => {
  let originalAgGrid;
  let originalRequestAnimationFrame;
  let capturedGridOptions;
  let capturedGridApi;

  beforeEach(() => {
    jest.resetModules();
    originalAgGrid = window.agGrid;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    capturedGridOptions = null;
    capturedGridApi = null;
    window.agGrid = {
      createGrid: (_container, options) => {
        capturedGridOptions = options;
        capturedGridApi = {
          setRowData: jest.fn(rows => { options.rowData = rows; }),
          setColumnDefs: jest.fn(columns => { options.columnDefs = columns; }),
          refreshCells: jest.fn(),
          destroy: jest.fn(),
          getFocusedCell: jest.fn(() => null),
          getEditingCells: jest.fn(() => [])
        };
        options.onGridReady?.({ api: capturedGridApi, columnApi: {} });
        return capturedGridApi;
      }
    };
    require('../js/vendor.js');
    require('../js/shared/agGridAdapter.js');
    require('../js/shared/undo.js');
    require('../js/shared/formulaEngine.js');
    require('../js/shared/hot.js');
    require('../js/shared/tableImport.js');
    require('../js/main/session.js');
  });

  afterEach(() => {
    window.agGrid = originalAgGrid;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    capturedGridOptions = null;
    capturedGridApi = null;
    delete window.Main;
    delete window.Components;
  });

  function createPcaTab(title, data) {
    const session = window.Main.session;
    const tab = session.createTab({
      title,
      type: 'pca',
      payload: { type: 'pca', data }
    });
    session.workspaceState.tabs.push(tab);
    return tab;
  }

  function createCsvInput(text) {
    const input = document.createElement('input');
    input.type = 'file';
    const file = new window.File([text], 'large.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    return input;
  }

  test('commits once, yields two paints, then schedules one final graph draw', async () => {
    const session = window.Main.session;
    const tab = createPcaTab('PCA', [['old']]);
    session.workspaceState.activeTabId = tab.id;
    const events = [];
    window.requestAnimationFrame = callback => window.setTimeout(() => {
      events.push('paint');
      callback();
    }, 0);
    const container = document.createElement('div');
    container.dataset.workspaceTabId = tab.id;
    container.dataset.componentType = 'pca';
    document.body.appendChild(container);
    const hot = window.Shared.hot.createStandardTable(container, { rows: 1, cols: 1 }, () => {}, {
      debugLabel: 'pca',
      data: [['old']]
    });
    await new Promise(resolve => window.setTimeout(resolve, 0));
    events.length = 0;
    const updatePayload = jest.spyOn(session, 'updateTabPayload');
    const commitPayload = jest.spyOn(session, 'commitTabPayload');
    const scheduleDraw = jest.fn(meta => events.push(`draw:${meta.reason}`));
    const onBeforeCompleted = jest.fn(() => {
      hot.setDataAtCell(2, 1, 'normalized', 'import-normalization');
      if(!window.Shared.hot.shouldDeferOwnerProjectionDraw(tab, { reason: 'import-normalization' })){
        scheduleDraw({ reason: 'import-normalization' });
      }
      events.push('normalized');
    });
    const onCompleted = jest.fn(() => events.push('completed'));

    const result = await window.Shared.tableImport.openFile(createCsvInput('Gene,S1\nA,1\nB,2'), {
      hot,
      minRows: 1,
      minCols: 1,
      importOptionsConfirmed: true,
      scheduleDraw,
      onBeforeCompleted,
      onCompleted
    });

    expect(result.rows).toBe(3);
    expect(tab.payload.data.map(row => row.slice(0, 2))).toEqual([['Gene', 'S1'], ['A', '1'], ['B', 'normalized']]);
    expect(tab.payloadDirty).toBe(false);
    expect(updatePayload).not.toHaveBeenCalled();
    expect(commitPayload).toHaveBeenCalledTimes(1);
    expect(onBeforeCompleted).toHaveBeenCalledTimes(1);
    expect(scheduleDraw).toHaveBeenCalledTimes(1);
    expect(scheduleDraw).toHaveBeenCalledWith(expect.objectContaining({
      tabId: tab.id,
      importTransactionFinal: true
    }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['normalized', 'paint', 'paint', 'draw:import-load', 'completed']);
    expect(window.Shared.hot.getLastOwnerProjectionTransaction(tab)).toEqual(expect.objectContaining({
      tabId: tab.id,
      projected: true,
      deferredDrawCount: 1,
      finalProjectionRequests: 1,
      paintWaitMs: expect.any(Number),
      totalMs: expect.any(Number)
    }));
  });

  test('commits to its owner but rejects final projection after a same-component tab switch', async () => {
    const session = window.Main.session;
    const ownerTab = createPcaTab('Owner', [['owner-old']]);
    const otherTab = createPcaTab('Other', [['other-stays']]);
    session.workspaceState.activeTabId = ownerTab.id;
    window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
    const container = document.createElement('div');
    container.dataset.workspaceTabId = ownerTab.id;
    container.dataset.componentType = 'pca';
    document.body.appendChild(container);
    const hot = window.Shared.hot.createStandardTable(container, { rows: 1, cols: 1 }, () => {}, {
      debugLabel: 'pca',
      data: [['owner-old']]
    });
    const scheduleDraw = jest.fn();
    const onCompleted = jest.fn();
    const onOwnerInactive = jest.fn();

    await window.Shared.tableImport.openFile(createCsvInput('Gene,S1\nA,7'), {
      hot,
      minRows: 1,
      minCols: 1,
      importOptionsConfirmed: true,
      scheduleDraw,
      onProcessed: () => { session.workspaceState.activeTabId = otherTab.id; },
      onCompleted,
      onOwnerInactive
    });

    expect(ownerTab.payload.data).toEqual([['Gene', 'S1'], ['A', '7']]);
    expect(otherTab.payload.data).toEqual([['other-stays']]);
    expect(scheduleDraw).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onOwnerInactive).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      tabId: ownerTab.id
    }));
    expect(window.Shared.hot.getLastOwnerProjectionTransaction(ownerTab)).toEqual(expect.objectContaining({
      projected: false,
      finalProjectionRequests: 0
    }));
  });

  test('first user paste supersedes the pending import transaction and remains canonical', async () => {
    const session = window.Main.session;
    const tab = createPcaTab('Heatmap-like owner', [['old']]);
    session.workspaceState.activeTabId = tab.id;
    window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
    const container = document.createElement('div');
    container.dataset.workspaceTabId = tab.id;
    container.dataset.componentType = 'pca';
    document.body.appendChild(container);
    const scheduleDraw = jest.fn();
    const hot = window.Shared.hot.createStandardTable(container, { rows: 2, cols: 2 }, scheduleDraw, {
      debugLabel: 'pca',
      data: [['Label', 'Value'], ['row-1', 'original']]
    });
    const onCompleted = jest.fn();
    let interruptedTransaction = null;

    const result = await window.Shared.tableImport.openFile(createCsvInput('Gene,S1\nA,1'), {
      hot,
      minRows: 1,
      minCols: 1,
      importOptionsConfirmed: true,
      scheduleDraw,
      onBeforeCompleted: (_result, meta) => {
        interruptedTransaction = meta.ownerProjectionTransaction;
        expect(window.Shared.hot.isOwnerProjectionTransactionCurrent(interruptedTransaction)).toBe(true);
        capturedGridOptions.onPasteStart({ source: 'paste' });
        hot.getSourceData()[1][1] = 'pasted';
        capturedGridOptions.onCellValueChanged({
          node: { rowIndex: 1 },
          rowIndex: 1,
          column: { getColId: () => 'c1' },
          oldValue: '1',
          newValue: 'pasted',
          source: 'paste',
          api: capturedGridApi
        });
        capturedGridOptions.onPasteEnd({
          source: 'paste',
          data: [['pasted']],
          api: capturedGridApi
        });
      },
      onCompleted
    });

    expect(result.rows).toBe(2);
    expect(interruptedTransaction).toBeTruthy();
    expect(window.Shared.hot.isOwnerProjectionTransactionCurrent(interruptedTransaction)).toBe(false);
    expect(window.Shared.hot.getLastOwnerProjectionTransaction(tab)).toEqual(expect.objectContaining({
      interruptedByUserMutation: true,
      interruptionReason: 'table-paste-start'
    }));
    expect(tab.payload.data[1][1]).toBe('pasted');
    expect(tab.userDirty).toBe(true);
    expect(onCompleted).not.toHaveBeenCalled();
    expect(scheduleDraw).toHaveBeenCalledWith(expect.objectContaining({ reason: 'afterPaste' }));
    expect(window.Shared.hot.shouldDeferOwnerProjectionDraw(tab, { reason: 'afterPaste' })).toBe(false);

    const staleCommit = window.Shared.hot.syncOwnerTabPayloadFullData(
      [['Gene', 'S1'], ['A', 'stale-import']],
      'table-import',
      {
        hotInstance: hot,
        source: 'table-import',
        ownerProjectionTransaction: interruptedTransaction
      }
    );
    expect(staleCommit).toBe(false);
    expect(tab.payload.data[1][1]).toBe('pasted');
  });

});
