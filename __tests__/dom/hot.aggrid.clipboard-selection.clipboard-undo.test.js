'use strict';
const { setupHotAggridClipboardFixture } = require('../../test-support/hotAggridClipboardSuite');

describe('Shared.hot AG Grid clipboard + selection behaviors', () => {
  const fixture = setupHotAggridClipboardFixture();

  test('undo after cut+paste restores both source and destination', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agUndoMoveHot';
    document.body.appendChild(container);

    let clipboardText = '';
    global.window.navigator.clipboard = {
      writeText: jest.fn(async text => {
        clipboardText = text;
      })
    };

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-undo-move',
        data: [
          ['H1', 'H2', 'H3'],
          ['A', '', ''],
          ['', '', '']
        ]
      }
    );

    hot.selectCell(1, 0);

    const cutEvt = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x',
      ctrlKey: true
    });
    container.dispatchEvent(cutEvt);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(clipboardText.trim()).toBe('A');
    expect(hot.getDataAtCell(1, 0)).toBe('');

    hot.selectCell(1, 1);
    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => clipboardText };
    container.dispatchEvent(pasteEvt);

    expect(hot.getDataAtCell(1, 1)).toBe('A');
    expect(hot.getDataAtCell(1, 0)).toBe('');

    expect(typeof hot.undo).toBe('function');
    const undoResult = fixture.undoUntil(Shared.undoManager, () => (
      hot.getDataAtCell(1, 0) === 'A'
      && hot.getDataAtCell(1, 1) === ''
    ));
    expect(undoResult.reached).toBe(true);
  });

  test('undo after cut without paste restores the cleared source range', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agUndoCutOnlyHot';
    document.body.appendChild(container);

    global.window.navigator.clipboard = {
      writeText: jest.fn(async () => {})
    };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-undo-cut-only',
        data: [
          ['H1', 'H2', 'H3', 'H4'],
          ['A', 'B', '', ''],
          ['C', 'D', '', ''],
          ['', '', '', '']
        ]
      }
    );

    hot.selectCell(1, 0, 2, 1);

    const cutEvt = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x',
      ctrlKey: true
    });
    container.dispatchEvent(cutEvt);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(hot.getDataAtCell(1, 1)).toBe('');
    expect(hot.getDataAtCell(2, 0)).toBe('');
    expect(hot.getDataAtCell(2, 1)).toBe('');

    const undoResult = fixture.undoUntil(Shared.undoManager, () => (
      hot.getDataAtCell(1, 0) === 'A'
      && hot.getDataAtCell(1, 1) === 'B'
      && hot.getDataAtCell(2, 0) === 'C'
      && hot.getDataAtCell(2, 1) === 'D'
    ));
    expect(undoResult.reached).toBe(true);
  });

  test('global undo after cut+paste restores the moved block as a single step', async () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agUndoMoveGlobalHot';
    document.body.appendChild(container);

    let clipboardText = '';
    global.window.navigator.clipboard = {
      writeText: jest.fn(async text => {
        clipboardText = text;
      })
    };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-undo-move-global',
        data: [
          ['H1', 'H2', 'H3', 'H4'],
          ['A', 'B', '', ''],
          ['C', 'D', '', ''],
          ['', '', '', '']
        ]
      }
    );

    hot.selectCell(1, 0, 2, 1);

    const cutEvt = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x',
      ctrlKey: true
    });
    container.dispatchEvent(cutEvt);
    await new Promise(resolve => setTimeout(resolve, 0));

    hot.selectCell(1, 2);
    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => clipboardText };
    container.dispatchEvent(pasteEvt);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(hot.getDataAtCell(1, 1)).toBe('');
    expect(hot.getDataAtCell(2, 0)).toBe('');
    expect(hot.getDataAtCell(2, 1)).toBe('');
    expect(hot.getDataAtCell(1, 2)).toBe('A');
    expect(hot.getDataAtCell(1, 3)).toBe('B');
    expect(hot.getDataAtCell(2, 2)).toBe('C');
    expect(hot.getDataAtCell(2, 3)).toBe('D');

    const undoResult = fixture.undoUntil(undoManager, () => (
      hot.getDataAtCell(1, 0) === 'A'
      && hot.getDataAtCell(1, 1) === 'B'
      && hot.getDataAtCell(2, 0) === 'C'
      && hot.getDataAtCell(2, 1) === 'D'
      && hot.getDataAtCell(1, 2) === ''
      && hot.getDataAtCell(1, 3) === ''
      && hot.getDataAtCell(2, 2) === ''
      && hot.getDataAtCell(2, 3) === ''
    ));
    expect(undoResult.reached).toBe(true);

    const redoResult = fixture.redoUntil(undoManager, () => (
      hot.getDataAtCell(1, 0) === ''
      && hot.getDataAtCell(1, 1) === ''
      && hot.getDataAtCell(2, 0) === ''
      && hot.getDataAtCell(2, 1) === ''
      && hot.getDataAtCell(1, 2) === 'A'
      && hot.getDataAtCell(1, 3) === 'B'
      && hot.getDataAtCell(2, 2) === 'C'
      && hot.getDataAtCell(2, 3) === 'D'
    ));
    expect(redoResult.reached).toBe(true);
  });

  test('Ctrl+Z inside the grid follows the shared global undo order', async () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agUndoBridgeHot';
    document.body.appendChild(container);

    let clipboardText = '';
    global.window.navigator.clipboard = {
      writeText: jest.fn(async text => {
        clipboardText = text;
      })
    };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-undo-bridge',
        data: [
          ['H1', 'H2', 'H3', 'H4'],
          ['A', 'B', '', ''],
          ['C', 'D', '', ''],
          ['', '', '', '']
        ]
      }
    );

    hot.selectCell(1, 0, 2, 1);
    container.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x',
      ctrlKey: true
    }));
    await new Promise(resolve => setTimeout(resolve, 0));

    hot.selectCell(1, 2);
    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => clipboardText };
    container.dispatchEvent(pasteEvt);

    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(hot.getDataAtCell(1, 2)).toBe('A');

    let marker = 'after';
    undoManager.record({
      label: 'manual:later-entry',
      scope: 'manual',
      undo: () => {
        marker = 'before';
        return true;
      },
      redo: () => {
        marker = 'after';
        return true;
      }
    });

    expect(undoManager.performCommand('undo', { target: container })).toBe(true);

    expect(marker).toBe('before');
    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(hot.getDataAtCell(1, 2)).toBe('A');

    const undoMoveResult = fixture.undoUntil(undoManager, () => (
      hot.getDataAtCell(1, 0) === 'A'
      && hot.getDataAtCell(1, 1) === 'B'
      && hot.getDataAtCell(2, 0) === 'C'
      && hot.getDataAtCell(2, 1) === 'D'
      && hot.getDataAtCell(1, 2) === ''
      && hot.getDataAtCell(1, 3) === ''
      && hot.getDataAtCell(2, 2) === ''
      && hot.getDataAtCell(2, 3) === ''
    ));
    expect(undoMoveResult.reached).toBe(true);
  });
});
