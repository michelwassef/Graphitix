describe('exporter hybrid SVG source selection', () => {
  test.each([false, true])('SVG-string downloads honor transparent background %s', async transparentBackground => {
    jest.resetModules();
    require('../../js/shared/menuKeyboard.js');
    require('../../js/shared/menuPosition.js');
    require('../../js/shared/exporter.js');
    document.body.innerHTML = '<div id="exports"></div>';
    const originalMain = window.Main;
    const originalPicker = window.showSaveFilePicker;
    let blob;
    try {
      const owner = { id: 'owner', uiState: { export: { transparentBackground } } };
      window.Main = { session: { getActiveTab: () => owner } };
      window.showSaveFilePicker = jest.fn().mockResolvedValue({ createWritable: async () => ({
        write: value => { blob = value; }, close: () => {}
      }) });
      window.Shared.exporter.mountSvgStringControls({
        container: '#exports',
        getSvgString: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" data-color-scheme="dark" style="background:black"><circle cx="10" cy="10" r="2" fill="red"/></svg>'
      });
      document.querySelector('[data-action-key="download"] button.export-select').click();
      document.querySelector('[data-action-key="download"] [data-format="svg"]').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const text = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(blob);
      });
      const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
      expect(svg.querySelectorAll('rect')).toHaveLength(transparentBackground ? 0 : 1);
      expect(svg.querySelectorAll('#export-group')).toHaveLength(1);
      expect(svg.style.background).toBe('');
      if (!transparentBackground) expect(svg.querySelector('rect').getAttribute('fill')).toBe('#000000');
    } finally {
      window.Main = originalMain;
      window.showSaveFilePicker = originalPicker;
    }
  });

  test.each(['light', 'dark'])('explicit %s background policy covers the viewport without changing the live graph', appearance => {
    jest.resetModules();
    require('../../js/shared/exporter.js');
    document.body.innerHTML = `<svg viewBox="-10 -20 100 50" data-export-viewbox="off" data-color-scheme="${appearance}" style="background-color:black">
      <rect data-color-scheme-background="1" x="0" y="0" width="10" height="10" fill="black"/>
      <circle cx="40" cy="10" r="5" fill="red"/>
    </svg>`;
    const svg = document.querySelector('svg');
    const original = svg.outerHTML;
    for (const transparentBackground of [false, true]) {
      const xml = window.Shared.exporter.svgElementToXml(svg, 'background-contract', { transparentBackground });
      const exported = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
      expect(exported.querySelectorAll('#export-group')).toHaveLength(1);
      const drawableChildren = Array.from(exported.children).filter(node => !['defs', 'style', 'title', 'desc', 'metadata'].includes(node.localName));
      expect(drawableChildren).toHaveLength(1);
      const backgrounds = exported.querySelectorAll('rect');
      expect(backgrounds).toHaveLength(transparentBackground ? 0 : 1);
      expect(exported.style.backgroundColor).toBe('');
      if (!transparentBackground) {
        expect(backgrounds[0].getAttribute('fill')).toBe(appearance === 'dark' ? '#000000' : '#ffffff');
        expect(['x', 'y', 'width', 'height'].map(key => backgrounds[0].getAttribute(key))).toEqual(['-10', '-20', '100', '50']);
      }
      expect(exported.querySelector('circle').getAttribute('fill')).toBe('red');
      expect(svg.outerHTML).toBe(original);
    }
  });

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
      require('../../js/shared/menuKeyboard.js');
    require('../../js/shared/menuPosition.js');
    require('../../js/shared/exporter.js');
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

      const downloadMenu = document.querySelector('.export-select-wrapper[data-action-key="download"]');
      downloadMenu.querySelector('[data-format=\"svg-hybrid\"]').click();
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
      require('../../js/shared/menuKeyboard.js');
    require('../../js/shared/menuPosition.js');
    require('../../js/shared/exporter.js');
      const sourceGetter = jest.fn(() => document.getElementById('exportSvg'));
      window.Shared.exporter.mountSvgControls({
        container: '#testExportControls',
        fileName: 'test-chart',
        getSvg: sourceGetter
      });

      const copyMenu = document.querySelector('.export-select-wrapper[data-action-key="copy"]');
      copyMenu.querySelector('[data-format=\"svg\"]').click();
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
      require('../../js/shared/exportProjection.js');
      require('../../js/shared/menuKeyboard.js');
    require('../../js/shared/menuPosition.js');
    require('../../js/shared/exporter.js');
      window.Shared.exporter.mountSvgControls({
        container: '#testExportControls',
        fileName: 'test-chart',
        getSvg: () => document.getElementById('exportSvg'),
        ownerFrame: { width: 400, height: 200 }
      });

      const downloadMenu = document.querySelector('.export-select-wrapper[data-action-key="download"]');
      downloadMenu.querySelector('[data-format=\"svg\"]').click();
      await new Promise(resolve => setTimeout(resolve, 0));

      const copyMenu = document.querySelector('.export-select-wrapper[data-action-key="copy"]');
      copyMenu.querySelector('[data-format=\"svg\"]').click();
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
