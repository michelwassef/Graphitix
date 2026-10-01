'use strict';
const { setupHotAggridBindingFixture } = require('../../test-support/hotAggridBindingSuite');

describe('Shared.hot AG Grid binding', () => {
  const fixture = setupHotAggridBindingFixture();

  test('title edits in data-empty columns persist without redraw or render-cache invalidation', () => {
    require('../../js/main/session.js');
    const session = global.window.Main.session;
    const tab = session.createTab({
      title: 'PCA Matrix',
      type: 'pca',
      payload: {
        type: 'pca',
        data: [
          ['Sample', 'Value', ''],
          ['A', 1, ''],
          ['B', 2, '']
        ],
        config: {}
      }
    });
    session.workspaceState.tabs.push(tab);
    session.workspaceState.activeTabId = tab.id;
    const renderCache = { payloadSignature: tab.payloadSignature, fragment: { kind: 'unit' } };
    tab.renderCache = renderCache;
    tab.renderCacheSignature = tab.payloadSignature;

    const Shared = global.window.Shared;
    const clearSpy = jest.fn();
    const releaseSpy = jest.fn();
    const previousLifecycle = Shared.componentLifecycle;
    const previousLayout = Shared.componentLayout;
    Shared.componentLifecycle = Object.assign({}, previousLifecycle, { clearPostRestoreDrawSuppression: clearSpy });
    Shared.componentLayout = Object.assign({}, previousLayout, { releaseSuppressedSchedulesFor: releaseSpy });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const scheduleDraw = jest.fn();
    try {
      const hot = Shared.hot.createStandardTable(
        container,
        { rows: 3, cols: 3 },
        scheduleDraw,
        {
          debugLabel: 'pca',
          pinFirstRow: true,
          data: [
            ['Sample', 'Value', ''],
            ['A', 1, ''],
            ['B', 2, '']
          ]
        }
      );
      scheduleDraw.mockClear();
      clearSpy.mockClear();
      releaseSpy.mockClear();

      hot.setDataAtCell(0, 2, 'Unused title', 'edit');

      expect(tab.payload.data[0][2]).toBe('Unused title');
      expect(scheduleDraw).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      expect(releaseSpy).not.toHaveBeenCalled();
      expect(tab.renderCache).toBe(renderCache);
      expect(tab.renderCacheSignature).toBe(tab.payloadSignature);
    } finally {
      Shared.componentLifecycle = previousLifecycle;
      Shared.componentLayout = previousLayout;
    }
  });

  test('component table payload hook preserves non-matrix payload data shapes', () => {
    require('../../js/main/session.js');
    const session = global.window.Main.session;
    const applyTablePayloadChanges = jest.fn((payload, changes) => {
      payload.data = {
        kind: 'custom-object',
        firstChange: changes[0]
      };
      return payload;
    });
    global.window.Main.components = {
      registry: {
        customTable: {
          createEmptyPayload: () => ({ type: 'customTable', data: { kind: 'from-registry' } })
        }
      }
    };
    global.window.Components = {
      customTable: {
        createEmptyPayload: () => ({ type: 'customTable', data: { kind: 'empty' } }),
        applyTablePayloadChanges
      }
    };
    const tab = session.createTab({
      title: 'Custom Table',
      type: 'customTable',
      payload: {
        type: 'customTable',
        data: { kind: 'initial' }
      }
    });
    session.workspaceState.tabs.push(tab);
    session.workspaceState.activeTabId = tab.id;

    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'payload-sync-custom-table',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ]
      }
    );

    hot.setDataAtCell(1, 1, 'D2', 'edit');

    expect(applyTablePayloadChanges).toHaveBeenCalled();
    expect(Array.isArray(tab.payload.data)).toBe(false);
    expect(tab.payload.data).toEqual({
      kind: 'custom-object',
      firstChange: { row: 1, col: 1, value: 'D2' }
    });
    expect(tab.payloadDirty).toBe(false);
    expect(session.workspaceState.sessionUserDirty).toBe(true);
  });

  test('defaults to double-click editing even when the browser reports touch capability', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotTouchHeuristic';
    document.body.appendChild(container);

    const originalMatchMedia = global.window.matchMedia;
    const maxTouchPointsDescriptor = Object.getOwnPropertyDescriptor(global.window.navigator, 'maxTouchPoints');

    global.window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: query === '(pointer: coarse)' || query === '(hover: none)',
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => false)
    }));
    Object.defineProperty(global.window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5
    });

    try {
      Shared.hot.createStandardTable(
        container,
        { rows: 2, cols: 2 },
        () => {},
        {
          debugLabel: 'test-ag-grid-touch-heuristic',
          data: [
            ['A', 'B'],
            ['C', 'D']
          ]
        }
      );

      expect(fixture.capturedGridOptions).toBeTruthy();
      expect(fixture.capturedGridOptions.singleClickEdit).toBe(false);
    } finally {
      if (typeof originalMatchMedia === 'function') {
        global.window.matchMedia = originalMatchMedia;
      } else {
        delete global.window.matchMedia;
      }
      if (maxTouchPointsDescriptor) {
        Object.defineProperty(global.window.navigator, 'maxTouchPoints', maxTouchPointsDescriptor);
      } else {
        delete global.window.navigator.maxTouchPoints;
      }
    }
  });

  test('touch editing requires a second tap on the same cell', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotTouchDoubleTap';
    document.body.appendChild(container);

    Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-touch-double-tap',
        data: [
          ['Label', 'Value'],
          ['A', '1'],
          ['B', '2']
        ]
      }
    );

    container.innerHTML = `
      <div class="ag-row" row-index="1">
        <div class="ag-cell" row-index="1" col-id="c0"></div>
      </div>
    `;
    const cell = container.querySelector('.ag-cell');
    expect(cell).toBeTruthy();

    fixture.dispatchTouchPointerEvent(cell, 'pointerdown', { pointerId: 11 });
    fixture.dispatchTouchPointerEvent(cell, 'pointerup', { pointerId: 11 });
    expect(fixture.capturedApi.startEditingCell).not.toHaveBeenCalled();

    fixture.dispatchTouchPointerEvent(cell, 'pointerdown', { pointerId: 12 });
    fixture.dispatchTouchPointerEvent(cell, 'pointerup', { pointerId: 12 });
    expect(fixture.capturedApi.startEditingCell).toHaveBeenCalledWith({
      rowIndex: 1,
      colKey: 'c0',
      rowPinned: null
    });
  });

  test('loadData with recordUndo can be undone and redone', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotUndo';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-undo',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ]
      }
    );

    hot.loadData(
      [
        ['X', 'Y'],
        ['Z', 'W']
      ],
      {
        source: 'example-load',
        recordUndo: true,
        undoLabel: 'table:test-ag-grid-undo:example-load'
      }
    );

    expect(hot.getDataAtCell(0, 0)).toBe('X');
    expect(hot.getDataAtCell(1, 1)).toBe('W');

    const manager = Shared.undoManager;
    expect(manager.undo()).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('A');
    expect(hot.getDataAtCell(1, 1)).toBe('D');

    expect(manager.redo()).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('X');
    expect(hot.getDataAtCell(1, 1)).toBe('W');
  });

  test('inline axis-title header sync does not outrank its title undo entry', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotInlineAxisUndo';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-inline-axis-undo',
        data: [
          ['Sample', 'Axis label'],
          ['A', 1]
        ]
      }
    );
    const manager = Shared.undoManager;
    const before = manager.getTabHistoryInfo();

    hot.setDataAtCell(0, 1, 'Axis label draft', 'scatter-y-axis-inline-draft');
    hot.setDataAtCell(0, 1, 'Axis label final', 'surface-axis-inline-edit');

    expect(hot.getDataAtCell(0, 1)).toBe('Axis label final');
    expect(manager.getTabHistoryInfo()).toMatchObject({
      stackLength: before.stackLength,
      pointer: before.pointer
    });

    hot.setDataAtCell(1, 1, 2, 'edit');
    expect(manager.getTabHistoryInfo().stackLength).toBe(before.stackLength + 1);
  });
});
