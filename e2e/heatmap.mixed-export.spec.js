const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, registerIssueCollectors } = require('./helpers/workspaceHarness');

test('mixed Heatmap copy exports retain the matrix and enter the clipboard before heavy projection work', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    !!window.Components?.heatmap?.__testHooks?.buildExportSvgFromSource
    && !!window.Shared?.exporter?.mountSvgControls
  ));

  const result = await page.evaluate(async () => {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const source = document.createElementNS(SVG_NS, 'svg');
    source.setAttribute('viewBox', '0 0 120 100');
    source.setAttribute('width', '120');
    source.setAttribute('height', '100');
    source.setAttribute('preserveAspectRatio', 'none');
    source.dataset.heatmapSceneMode = 'normalized-canvas';
    source.dataset.heatmapSceneWidth = '120';
    source.dataset.heatmapSceneHeight = '100';
    source.dataset.heatmapModelType = 'values';
    source.dataset.heatmapCellRenderMode = 'canvas';

    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('width', '120');
    background.setAttribute('height', '100');
    background.setAttribute('fill', '#ffffff');
    source.appendChild(background);

    const cellLayer = document.createElementNS(SVG_NS, 'g');
    cellLayer.setAttribute('data-export-layer', 'heatmap-cells');
    cellLayer.setAttribute('data-render-mode', 'canvas');
    cellLayer.setAttribute('data-heatmap-data-start-x', '20');
    cellLayer.setAttribute('data-heatmap-data-start-y', '10');
    cellLayer.setAttribute('data-heatmap-width', '80');
    cellLayer.setAttribute('data-heatmap-height', '80');

    const foreignObject = document.createElementNS(SVG_NS, 'foreignObject');
    foreignObject.setAttribute('x', '20');
    foreignObject.setAttribute('y', '10');
    foreignObject.setAttribute('width', '80');
    foreignObject.setAttribute('height', '80');
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 40, 80);
    context.fillStyle = '#00ff00';
    context.fillRect(40, 0, 40, 80);
    foreignObject.appendChild(canvas);
    cellLayer.appendChild(foreignObject);
    cellLayer.__heatmapCanvasVectorExportState = {
      orderedCells: [[{ fill: '#ff0000' }, { fill: '#00ff00' }]],
      rowCount: 1,
      columnCount: 2,
      cellSize: 40,
      cellWidth: 40,
      cellHeight: 80,
      dataStartX: 20,
      dataStartY: 10,
      heatmapWidth: 80,
      heatmapHeight: 80,
      cellValueFontSize: 8,
      showCellText: false,
      showCellGrid: false
    };
    source.appendChild(cellLayer);

    const controls = document.createElement('div');
    document.body.appendChild(controls);
    const copyRecords = [];
    const order = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write(items){
          order.push('write');
          copyRecords.push(items[0]);
          return Promise.resolve();
        }
      }
    });
    window.ClipboardItem = class TestClipboardItem {
      constructor(items){
        this.items = items;
      }
      static supports(){
        return true;
      }
    };

    window.Shared.exporter.mountSvgControls({
      container: controls,
      fileName: 'heatmap-mixed-export',
      contextLabel: 'heatmap-mixed-export',
      getSvg: () => {
        order.push('getSvg');
        return window.Components.heatmap.__testHooks.buildExportSvgFromSource(source);
      }
    });

    const copySelect = controls.querySelector('[data-action-key="copy"] select');
    copySelect.value = 'png';
    copySelect.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    const pngOrderAfterDispatch = order.slice();
    const pngItem = copyRecords[0];
    const pngWasDeferred = pngItem?.items?.['image/png'] instanceof Promise;
    const pngBlob = await pngItem.items['image/png'];
    const bitmap = await createImageBitmap(pngBlob);
    const raster = document.createElement('canvas');
    raster.width = bitmap.width;
    raster.height = bitmap.height;
    const rasterContext = raster.getContext('2d');
    rasterContext.drawImage(bitmap, 0, 0);
    const pixel = (logicalX, logicalY) => Array.from(rasterContext.getImageData(
      Math.round(bitmap.width * logicalX / 120),
      Math.round(bitmap.height * logicalY / 100),
      1,
      1
    ).data);

    order.length = 0;
    copySelect.value = 'svg';
    copySelect.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    const svgOrderAfterDispatch = order.slice();
    const svgItem = copyRecords[1];
    const svgWasDeferred = svgItem?.items?.['image/svg+xml'] instanceof Promise;
    const svgBlob = await svgItem.items['image/svg+xml'];
    const svgText = await svgBlob.text();

    return {
      pngOrderAfterDispatch,
      pngWasDeferred,
      pngType: pngBlob.type,
      pngSize: pngBlob.size,
      red: pixel(40, 50),
      green: pixel(80, 50),
      svgOrderAfterDispatch,
      svgWasDeferred,
      svgType: svgBlob.type,
      svgHasVectorMatrix: svgText.includes('data-heatmap-export-projection="vector-matrix"')
        && svgText.includes('data-heatmap-vector-cell-count="2"'),
      svgHasCanvasMarkup: /<(?:canvas|foreignObject)\b/i.test(svgText)
    };
  });

  expect(result.pngOrderAfterDispatch).toEqual(['write']);
  expect(result.pngWasDeferred).toBe(true);
  expect(result.pngType).toBe('image/png');
  expect(result.pngSize).toBeGreaterThan(100);
  expect(result.red[0]).toBeGreaterThan(200);
  expect(result.red[1]).toBeLessThan(40);
  expect(result.green[0]).toBeLessThan(40);
  expect(result.green[1]).toBeGreaterThan(200);

  expect(result.svgOrderAfterDispatch).toEqual(['write']);
  expect(result.svgWasDeferred).toBe(true);
  expect(result.svgType).toBe('image/svg+xml');
  expect(result.svgHasVectorMatrix).toBe(true);
  expect(result.svgHasCanvasMarkup).toBe(false);
  expect(issues.critical).toEqual([]);
});
