describe('exporter Save As downloads', () => {
  const originalPicker = window.showSaveFilePicker;

  function mountSvgDownload() {
    document.body.innerHTML = '<div id="exports"></div><svg id="chart" viewBox="0 0 10 10"><circle cx="5" cy="5" r="2"/></svg>';
    jest.resetModules();
    require('../../js/shared/menuKeyboard.js');
    require('../../js/shared/menuPosition.js');
    require('../../js/shared/exporter.js');
    window.Shared.exporter.mountSvgControls({
      container: '#exports',
      getSvg: () => document.getElementById('chart'),
      fileName: 'my-chart',
      contextLabel: 'save-picker-test'
    });
    return document.querySelector('.export-select-wrapper[data-action-key="download"]');
  }

  async function choose(menu, format) {
    menu.querySelector(`[data-format="${format}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  afterEach(() => {
    window.showSaveFilePicker = originalPicker;
    delete window.desktop;
    jest.restoreAllMocks();
  });

  test('opens the native picker with the suggested image name and writes the chosen file', async () => {
    const write = jest.fn();
    const close = jest.fn();
    const createWritable = jest.fn().mockResolvedValue({ write, close });
    window.showSaveFilePicker = jest.fn().mockResolvedValue({ createWritable });
    const menu = mountSvgDownload();

    await choose(menu, 'svg');

    expect(window.showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'my-chart.svg',
      types: [{ description: 'SVG image', accept: { 'image/svg+xml': ['.svg'] } }]
    });
    expect(createWritable).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.any(Blob));
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('cancelling the picker does not create a download', async () => {
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    window.showSaveFilePicker = jest.fn().mockRejectedValue(abort);
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const menu = mountSvgDownload();

    await choose(menu, 'png');

    expect(clickSpy).not.toHaveBeenCalled();
  });

  test('a delayed picker cannot export another tab after an owner switch', async () => {
    const originalMain = window.Main;
    const first = { id: 'first' };
    let active = first;
    let finishPicker;
    const createWritable = jest.fn();
    window.showSaveFilePicker = jest.fn(() => new Promise(resolve => { finishPicker = resolve; }));
    try {
      window.Main = { session: { getActiveTab: () => active } };
      const menu = mountSvgDownload();
      menu.querySelector('button.export-select').click();
      menu.querySelector('[data-format="svg"]').click();
      active = { id: 'second' };
      finishPicker({ createWritable });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(createWritable).not.toHaveBeenCalled();
    } finally {
      window.Main = originalMain;
    }
  });

  test('uses the desktop Save As dialog and selected path', async () => {
    window.showSaveFilePicker = undefined;
    window.desktop = {
      showSaveDialog: jest.fn().mockResolvedValue({ canceled: false, filePath: 'C:\\Exports\\renamed.svg' }),
      writeFile: jest.fn().mockResolvedValue(undefined)
    };
    const menu = mountSvgDownload();

    await choose(menu, 'svg');

    expect(window.desktop.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'my-chart.svg'
    }));
    expect(window.desktop.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'C:\\Exports\\renamed.svg',
      dataBase64: expect.any(String)
    }));
  });
});
