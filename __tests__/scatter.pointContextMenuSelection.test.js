describe('scatter point context menu selection helpers', () => {
  beforeAll(() => {
    require('../js/components/scatter.js');
  });

  test('toggleRowSelected selects matching row without clearing selection', () => {
    const hooks = window.Components?.scatter?.__testHooks;
    expect(hooks).toBeDefined();

    const calls = [];
    const makeNode = (rowIndex) => {
      let selected = false;
      return {
        rowIndex,
        isSelected: () => selected,
        setSelected: (value, clearSelection) => {
          calls.push({ rowIndex, value: !!value, clearSelection: !!clearSelection });
          selected = !!value;
        }
      };
    };

    const node1 = makeNode(1);
    const node2 = makeNode(2);
    const gridApi = {
      forEachNode: (cb) => [node1, node2].forEach(cb),
      ensureIndexVisible: jest.fn()
    };
    const hotInstance = { gridApi };

    hooks.toggleRowSelected(hotInstance, 2, { ensureVisible: true });

    expect(node2.isSelected()).toBe(true);
    expect(calls).toEqual([{ rowIndex: 2, value: true, clearSelection: false }]);
    expect(gridApi.ensureIndexVisible).toHaveBeenCalled();
  });

  test('toggleRowSelected deselects matching row without clearing selection', () => {
    const hooks = window.Components?.scatter?.__testHooks;
    expect(hooks).toBeDefined();

    const calls = [];
    const makeNode = (rowIndex, selectedInitial) => {
      let selected = !!selectedInitial;
      return {
        rowIndex,
        isSelected: () => selected,
        setSelected: (value, clearSelection) => {
          calls.push({ rowIndex, value: !!value, clearSelection: !!clearSelection });
          selected = !!value;
        }
      };
    };

    const node1 = makeNode(1, false);
    const node2 = makeNode(2, true);
    const gridApi = {
      forEachNode: (cb) => [node1, node2].forEach(cb),
      ensureIndexVisible: jest.fn()
    };
    const hotInstance = { gridApi };

    hooks.toggleRowSelected(hotInstance, 2, { ensureVisible: true });

    expect(node2.isSelected()).toBe(false);
    expect(calls).toEqual([{ rowIndex: 2, value: false, clearSelection: false }]);
    expect(gridApi.ensureIndexVisible).not.toHaveBeenCalled();
  });
});

