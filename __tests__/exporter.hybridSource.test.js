describe('exporter hybrid SVG source selection', () => {
  test('hybrid SVG action uses the hybrid source getter', async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="testExportControls"></div>
      <svg id="vectorSvg" viewBox="0 0 10 10"><g data-export-layer="points"><path d="M0 0L1 1"></path></g></svg>
      <svg id="liveSvg" viewBox="0 0 10 10"><g data-export-layer="points"><foreignObject><canvas></canvas></foreignObject></g></svg>
    `;
    const originalCreateObjectURL = global.URL.createObjectURL;
    const originalRevokeObjectURL = global.URL.revokeObjectURL;
    const originalAnchorClick = global.HTMLAnchorElement.prototype.click;
    global.URL.createObjectURL = jest.fn(() => 'blob:graphitix-hybrid-test');
    global.URL.revokeObjectURL = jest.fn();
    global.HTMLAnchorElement.prototype.click = jest.fn();

    try{
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
      expect(global.HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    }finally{
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;
      global.HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
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

  test('SVG download and SVG copy serialize the same physical projection', async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="testExportControls"></div>
      <svg id="exportSvg" viewBox="0 0 100 50"><path d="M0 0L100 50"></path></svg>
    `;
    const originalClipboard = global.navigator.clipboard;
    const originalClipboardItem = global.ClipboardItem;
    const originalCreateObjectURL = global.URL.createObjectURL;
    const originalRevokeObjectURL = global.URL.revokeObjectURL;
    const originalAnchorClick = global.HTMLAnchorElement.prototype.click;
    let downloadedBlob = null;
    let copiedItem = null;
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: {
        write: jest.fn(items => {
          copiedItem = items[0];
          return Promise.resolve();
        })
      }
    });
    global.ClipboardItem = class TestClipboardItem {
      constructor(items){
        this.items = items;
      }
      static supports(){
        return true;
      }
    };
    global.URL.createObjectURL = jest.fn(blob => {
      downloadedBlob = blob;
      return 'blob:graphitix-test';
    });
    global.URL.revokeObjectURL = jest.fn();
    global.HTMLAnchorElement.prototype.click = jest.fn();

    const readText = blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('blob read failed'));
      reader.readAsText(blob);
    });

    try{
      window.Shared = {};
      require('../js/shared/exportProjection.js');
      require('../js/shared/exporter.js');
      window.Shared.exporter.mountSvgControls({
        container: '#testExportControls',
        fileName: 'test-chart',
        getSvg: () => document.getElementById('exportSvg'),
        ownerFrame: { width: 400, height: 200 }
      });

      const downloadSelect = document.querySelector('.export-select-wrapper[data-action-key="download"] select');
      downloadSelect.value = 'svg';
      downloadSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));

      const copySelect = document.querySelector('.export-select-wrapper[data-action-key="copy"] select');
      copySelect.value = 'svg';
      copySelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      const copiedBlob = await copiedItem.items['image/svg+xml'];

      expect(downloadedBlob).toBeTruthy();
      expect(await readText(downloadedBlob)).toBe(await readText(copiedBlob));
    }finally{
      Object.defineProperty(global.navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard
      });
      global.ClipboardItem = originalClipboardItem;
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;
      global.HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
  });

});
