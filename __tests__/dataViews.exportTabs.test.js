describe('data view tab export menu', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/vendor.js');
    require('../js/shared/dataViews.js');
    window.Shared.disableDebugLogging?.();
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
  });

  test('exports csv for selected view', async () => {
    const { wrapper } = createMountedManager();
    const downloads = [];
    window.Shared.exporter = {
      downloadBlob(blob, fileName) {
        downloads.push({ blob, fileName });
      }
    };

    const firstSave = wrapper.querySelector('.data-view-tabs__save[data-view-id="raw"]');
    firstSave.click();
    const csvItem = wrapper.querySelector('.data-view-tabs__export-item[data-format="csv"]');
    csvItem.click();
    await Promise.resolve();

    expect(downloads).toHaveLength(1);
    expect(downloads[0].fileName).toBe('raw.csv');
    expect(downloads[0].blob.type).toContain('text/csv');
    expect(downloads[0].blob.size).toBeGreaterThan(0);
  });

  test('exports xlsx for selected view', async () => {
    const { wrapper } = createMountedManager();
    const downloads = [];
    window.Shared.exporter = {
      downloadBlob(blob, fileName) {
        downloads.push({ blob, fileName });
      }
    };
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
    expect(downloads).toHaveLength(1);
    expect(downloads[0].fileName).toBe('log2-x-1.xlsx');
  });
});
