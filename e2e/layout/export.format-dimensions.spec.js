const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');

test('SVG, PNG, TIFF, PDF and EMF share one physical projection', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.Shared?.exportProjection && !!window.Shared?.exporter);

  const result = await page.evaluate(async () => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 50');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('data-export-viewbox', 'off');
    const background = document.createElementNS(NS, 'rect');
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', '100');
    background.setAttribute('height', '50');
    background.setAttribute('fill', '#ffffff');
    svg.appendChild(background);
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('d', 'M10 10H90');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#000000');
    line.setAttribute('stroke-width', '1pt');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(line);
    const title = document.createElementNS(NS, 'text');
    title.setAttribute('data-font-role', 'graphTitle');
    title.setAttribute('data-font-key', 'graphTitle');
    title.setAttribute('data-title-block-text', 'First line\\nSecond line');
    title.setAttribute('font-family', 'Arial, sans-serif');
    title.setAttribute('font-size', '6');
    title.setAttribute('fill', '#000000');
    title.setAttribute('text-anchor', 'middle');
    const firstLine = document.createElementNS(NS, 'tspan');
    firstLine.setAttribute('data-title-line', '1');
    firstLine.setAttribute('x', '50');
    firstLine.setAttribute('y', '17');
    const firstRun = document.createElementNS(NS, 'tspan');
    firstRun.setAttribute('font-weight', 'bold');
    firstRun.textContent = 'First line';
    firstLine.appendChild(firstRun);
    const secondLine = document.createElementNS(NS, 'tspan');
    secondLine.setAttribute('data-title-line', '1');
    secondLine.setAttribute('x', '50');
    secondLine.setAttribute('y', '34');
    secondLine.textContent = 'Second line';
    title.append(firstLine, secondLine);
    svg.appendChild(title);
    document.body.appendChild(svg);

    const ownerFrame = { width: 400, height: 200, authority: 'e2e-owner-frame' };
    const exporter = window.Shared.exporter;
    const options = { ownerFrame, contextLabel: 'e2e-format-dimensions' };

    const svgXml = exporter.svgElementToXml(svg, 'e2e-format-svg', options);
    const svgRoot = new DOMParser().parseFromString(svgXml, 'image/svg+xml').documentElement;
    const svgTitleLines = Array.from(svgRoot.querySelectorAll('text > tspan[x][y]'));

    const [pngBlob, tiffBlob, pdfBlob, emfBlob] = await Promise.all([
      exporter.svgElementToPngBlob(svg, options),
      exporter.svgElementToTiffBlob(svg, options),
      exporter.svgElementToPdfBlob(svg, options),
      exporter.svgElementToEmfBlob(svg, options)
    ]);

    const toBytes = async blob => new Uint8Array(await blob.arrayBuffer());
    const png = await toBytes(pngBlob);
    const tiff = await toBytes(tiffBlob);
    const pdf = await toBytes(pdfBlob);
    const emf = await toBytes(emfBlob);

    const parsePng = bytes => {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      let ppmX = null;
      let ppmY = null;
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset, false);
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        if (type === 'pHYs' && length === 9) {
          ppmX = view.getUint32(offset + 8, false);
          ppmY = view.getUint32(offset + 12, false);
          break;
        }
        offset += 12 + length;
      }
      return { width, height, ppmX, ppmY };
    };

    const parseTiff = bytes => {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const ifdOffset = view.getUint32(4, true);
      const count = view.getUint16(ifdOffset, true);
      const values = {};
      for (let index = 0; index < count; index += 1) {
        const offset = ifdOffset + 2 + index * 12;
        const tag = view.getUint16(offset, true);
        const type = view.getUint16(offset + 2, true);
        const itemCount = view.getUint32(offset + 4, true);
        const valueOrOffset = view.getUint32(offset + 8, true);
        if ((tag === 256 || tag === 257 || tag === 273 || tag === 279 || tag === 296) && itemCount === 1) {
          values[tag] = type === 3 ? view.getUint16(offset + 8, true) : valueOrOffset;
        }
        if ((tag === 282 || tag === 283) && itemCount === 1) {
          const numerator = view.getUint32(valueOrOffset, true);
          const denominator = view.getUint32(valueOrOffset + 4, true);
          values[tag] = numerator / denominator;
        }
      }
      return {
        width: values[256],
        height: values[257],
        stripOffset: values[273],
        stripByteCount: values[279],
        dpiX: values[282],
        dpiY: values[283],
        resolutionUnit: values[296]
      };
    };

    const countDarkPixels = (width, height, getRgb) => {
      const bands = [[0.25, 0.40], [0.59, 0.75]];
      return bands.map(([start, end]) => {
        let count = 0;
        for (let y = Math.floor(height * start); y < Math.ceil(height * end); y += 1) {
          for (let x = 0; x < width; x += 1) {
            const [r, g, b] = getRgb(x, y);
            if (r < 220 && g < 220 && b < 220) count += 1;
          }
        }
        return count;
      });
    };
    const scanImageBlob = async blob => {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      bitmap.close?.();
      return {
        width: canvas.width,
        height: canvas.height,
        titleLineInk: countDarkPixels(canvas.width, canvas.height, (x, y) => {
          const offset = (y * canvas.width + x) * 4;
          return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
        })
      };
    };

    const pngMeta = parsePng(png);
    const tiffMeta = parseTiff(tiff);
    const pdfText = new TextDecoder('latin1').decode(pdf);
    const pdfMediaBox = pdfText.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    const pdfImageStart = pdf.findIndex((byte, index) => byte === 0xFF && pdf[index + 1] === 0xD8);
    const pdfImageEnd = pdf.findIndex((byte, index) => index > pdfImageStart && byte === 0xFF && pdf[index + 1] === 0xD9);
    const pdfImage = pdfImageStart >= 0 && pdfImageEnd > pdfImageStart
      ? await scanImageBlob(new Blob([pdf.subarray(pdfImageStart, pdfImageEnd + 2)], { type: 'image/jpeg' }))
      : null;
    const emfView = new DataView(emf.buffer, emf.byteOffset, emf.byteLength);
    let emfRasterStart = -1;
    let emfTextRecords = 0;
    for (let offset = 108; offset + 8 <= emf.length;) {
      const type = emfView.getUint32(offset, true);
      const size = emfView.getUint32(offset + 4, true);
      if (type === 0x00000051) emfRasterStart = offset;
      if (type === 0x00000054) emfTextRecords += 1;
      if (size < 8) break;
      offset += size;
    }
    let emfTitleLineInk = null;
    if (emfRasterStart >= 0) {
      const dibOffset = emfRasterStart + 80;
      const dibWidth = emfView.getInt32(dibOffset + 4, true);
      const dibHeight = emfView.getInt32(dibOffset + 8, true);
      const bitsOffset = emfRasterStart + emfView.getUint32(emfRasterStart + 56, true);
      emfTitleLineInk = countDarkPixels(dibWidth, dibHeight, (x, y) => {
        const offset = bitsOffset + ((dibHeight - 1 - y) * dibWidth + x) * 4;
        return [emf[offset + 2], emf[offset + 1], emf[offset]];
      });
    }
    const pngImage = await scanImageBlob(new Blob([png], { type: 'image/png' }));
    const tiffTitleLineInk = countDarkPixels(tiffMeta.width, tiffMeta.height, (x, y) => {
      const offset = tiffMeta.stripOffset + (y * tiffMeta.width + x) * 3;
      return [tiff[offset], tiff[offset + 1], tiff[offset + 2]];
    });

    return {
      svg: {
        width: Number.parseFloat(svgRoot.getAttribute('width')),
        height: Number.parseFloat(svgRoot.getAttribute('height')),
        viewBox: svgRoot.getAttribute('viewBox'),
        logicalViewBox: svgRoot.getAttribute('data-export-logical-view-box'),
        pasteTransform: svgRoot.querySelector('g#export-group')?.getAttribute('transform') || null,
        titleLines: svgTitleLines.map(row => ({ text: row.textContent, x: row.getAttribute('x'), y: row.getAttribute('y') }))
      },
      png: { ...pngMeta, titleLineInk: pngImage.titleLineInk },
      tiff: { ...tiffMeta, titleLineInk: tiffTitleLineInk },
      pdf: {
        widthPt: pdfMediaBox ? Number(pdfMediaBox[1]) : null,
        heightPt: pdfMediaBox ? Number(pdfMediaBox[2]) : null,
        rasterImage: pdfImage,
        hasRasterImage: pdfText.includes('/Subtype /Image'),
        hasVectorText: /\/[A-F]\d+\s+-?[\d.]+\s+Tf/.test(pdfText)
      },
      emf: {
        frameWidth01mm: emfView.getInt32(32, true),
        frameHeight01mm: emfView.getInt32(36, true),
        rasterTitleLineInk: emfTitleLineInk,
        rasterRecord: emfRasterStart >= 0,
        textRecords: emfTextRecords
      }
    };
  });

  expect(result.svg.width).toBeCloseTo(400, 3);
  expect(result.svg.height).toBeCloseTo(200, 3);
  expect(result.svg.viewBox).toBe('0 0 400 200');
  expect(result.svg.logicalViewBox).toBe('0 0 100 50');
  expect(result.svg.pasteTransform).toBe('matrix(4 0 0 4 0 0)');
  expect(result.svg.titleLines).toEqual([
    { text: 'First line', x: '50', y: '17' },
    { text: 'Second line', x: '50', y: '34' }
  ]);

  expect(result.png.width).toBe(1250);
  expect(result.png.height).toBe(625);
  expect(result.png.ppmX).toBeCloseTo(Math.round(300 / 0.0254), 0);
  expect(result.png.ppmY).toBeCloseTo(Math.round(300 / 0.0254), 0);
  expect(result.png.titleLineInk.every(count => count > 0)).toBe(true);

  expect(result.tiff.width).toBe(800);
  expect(result.tiff.height).toBe(400);
  expect(result.tiff.dpiX).toBe(192);
  expect(result.tiff.dpiY).toBe(192);
  expect(result.tiff.resolutionUnit).toBe(2);
  expect(result.tiff.titleLineInk.every(count => count > 0)).toBe(true);

  expect(result.pdf.widthPt).toBeCloseTo(300, 3);
  expect(result.pdf.heightPt).toBeCloseTo(150, 3);
  expect(result.pdf.hasRasterImage).toBe(true);
  expect(result.pdf.hasVectorText).toBe(false);
  expect(result.pdf.rasterImage.titleLineInk.every(count => count > 0)).toBe(true);

  expect(result.emf.frameWidth01mm).toBeCloseTo(Math.round((400 * 2540) / 96), 0);
  expect(result.emf.frameHeight01mm).toBeCloseTo(Math.round((200 * 2540) / 96), 0);
  expect(result.emf.rasterRecord).toBe(true);
  expect(result.emf.textRecords).toBe(0);
  expect(result.emf.rasterTitleLineInk.every(count => count > 0), JSON.stringify(result.emf)).toBe(true);
  expect(issues.critical).toEqual([]);
});

test('hybrid SVG rasterizes graph marks while preserving positioned multiline title text', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.Shared?.exporter?.buildHybridSvgExportPayload);

  const result = await page.evaluate(async () => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '50');
    svg.setAttribute('viewBox', '0 0 100 50');

    const title = document.createElementNS(NS, 'text');
    title.setAttribute('font-family', 'Arial, sans-serif');
    title.setAttribute('font-size', '8');
    title.setAttribute('fill', '#000000');
    title.setAttribute('text-anchor', 'end');
    const firstLine = document.createElementNS(NS, 'tspan');
    firstLine.setAttribute('x', '50');
    firstLine.setAttribute('y', '18');
    firstLine.textContent = 'First line';
    const secondLine = document.createElementNS(NS, 'tspan');
    secondLine.setAttribute('x', '50');
    secondLine.setAttribute('y', '34');
    secondLine.textContent = 'Second line';
    title.append(firstLine, secondLine);
    svg.appendChild(title);

    const rasterLayer = document.createElementNS(NS, 'g');
    rasterLayer.setAttribute('id', 'raster-points');
    rasterLayer.setAttribute('data-export-layer', 'scatter-points');
    const point = document.createElementNS(NS, 'circle');
    point.setAttribute('cx', '80');
    point.setAttribute('cy', '25');
    point.setAttribute('r', '6');
    point.setAttribute('fill', '#cc0000');
    rasterLayer.appendChild(point);
    svg.appendChild(rasterLayer);
    document.body.appendChild(svg);

    const payload = await window.Shared.exporter.buildHybridSvgExportPayload(svg, {
      contextLabel: 'e2e-multiline-hybrid-title',
      includeHtmlPreview: false,
      layers: [{ selector: '#raster-points', label: 'scatter-points', scale: 2, pngScale: 1 }]
    });
    const xml = await payload.svgBlob.text();
    const output = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
    const outputTitle = Array.from(output.querySelectorAll('text')).find(node => node.textContent.includes('First line'));
    const outputLines = Array.from(outputTitle?.querySelectorAll('tspan[x][y]') || []);
    const rasterImage = Array.from(output.querySelectorAll('image')).find(node =>
      String(node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '').startsWith('data:image/png')
    );
    return {
      lines: outputLines.map(line => ({ text: line.textContent, x: line.getAttribute('x'), y: line.getAttribute('y') })),
      anchor: outputTitle?.getAttribute('text-anchor') || null,
      rasterImage: !!rasterImage,
      originalRasterLayer: !!output.querySelector('#raster-points')
    };
  });

  expect(result.lines).toEqual([
    { text: 'First line', x: '50', y: '18' },
    { text: 'Second line', x: '50', y: '34' }
  ]);
  expect(result.anchor).toBe('end');
  expect(result.rasterImage).toBe(true);
  expect(result.originalRasterLayer).toBe(false);
  expect(issues.critical).toEqual([]);
});
