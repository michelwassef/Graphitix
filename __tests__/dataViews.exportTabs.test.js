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
});
