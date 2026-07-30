describe('exporter hybrid SVG source selection', () => {
  test('hybrid SVG action uses the hybrid source getter', async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="testExportControls"></div>
      <svg id="vectorSvg" viewBox="0 0 10 10"><g data-export-layer="points"><path d="M0 0L1 1"></path></g></svg>
      <svg id="liveSvg" viewBox="0 0 10 10"><g data-export-layer="points"><foreignObject><canvas></canvas></foreignObject></g></svg>
    `;
    require('../js/shared/exporter.js');
    const vectorGetter = jest.fn(() => document.getElementById('vectorSvg'));
    const hybridGetter = jest.fn(() => document.getElementById('liveSvg'));

    window.Shared.exporter.mountSvgControls({
      container: '#testExportControls',
      fileName: 'test-chart',
      getSvg: vectorGetter,
      getHybridSvg: hybridGetter,
      hybridOptions: {
        label: 'SVG (points as PNG)',
        layers: [{ selector: '[data-export-layer="points"]', label: 'points' }]
      }
    });

    const downloadSelect = document.querySelector('.export-select-wrapper[data-action-key="download"] select');
    downloadSelect.value = 'svg-hybrid';
    downloadSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(hybridGetter).toHaveBeenCalled();
  });

  test('standard SVG copy enters the clipboard API before resolving a heavy export source', async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="testExportControls"></div>
      <svg id="exportSvg" viewBox="0 0 10 10"><path d="M0 0L1 1"></path></svg>
    `;
    const originalClipboard = global.navigator.clipboard;
    const originalClipboardItem = global.ClipboardItem;
    const writeMock = jest.fn(() => Promise.resolve());
    class TestClipboardItem {
      constructor(items){
        this.items = items;
      }
      static supports(){
        return true;
      }
    }
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: { write: writeMock }
    });
    global.ClipboardItem = TestClipboardItem;
    try{
      require('../js/shared/exporter.js');
      const sourceGetter = jest.fn(() => document.getElementById('exportSvg'));
      window.Shared.exporter.mountSvgControls({
        container: '#testExportControls',
        fileName: 'test-chart',
        getSvg: sourceGetter
      });

      const copySelect = document.querySelector('.export-select-wrapper[data-action-key="copy"] select');
      copySelect.value = 'svg';
      copySelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();

      expect(writeMock).toHaveBeenCalledTimes(1);
      expect(sourceGetter).not.toHaveBeenCalled();
      const clipboardItem = writeMock.mock.calls[0][0][0];
      expect(clipboardItem.items['image/svg+xml']).toBeInstanceOf(Promise);

      await Promise.resolve();
      await Promise.resolve();
      expect(sourceGetter).toHaveBeenCalledTimes(1);
    }finally{
      Object.defineProperty(global.navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard
      });
      global.ClipboardItem = originalClipboardItem;
    }
  });

});
