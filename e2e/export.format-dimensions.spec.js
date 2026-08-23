const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, registerIssueCollectors } = require('./helpers/workspaceHarness');

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
    document.body.appendChild(svg);

    const ownerFrame = { width: 400, height: 200, authority: 'e2e-owner-frame' };
    const exporter = window.Shared.exporter;
    const options = { ownerFrame, contextLabel: 'e2e-format-dimensions' };

    const svgXml = exporter.svgElementToXml(svg, 'e2e-format-svg', options);
    const svgRoot = new DOMParser().parseFromString(svgXml, 'image/svg+xml').documentElement;

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
        if ((tag === 256 || tag === 257 || tag === 296) && itemCount === 1) {
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
        dpiX: values[282],
        dpiY: values[283],
        resolutionUnit: values[296]
      };
    };

    const pngMeta = parsePng(png);
    const tiffMeta = parseTiff(tiff);
    const pdfText = new TextDecoder('latin1').decode(pdf);
    const pdfMediaBox = pdfText.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    const emfView = new DataView(emf.buffer, emf.byteOffset, emf.byteLength);

    return {
      svg: {
        width: Number.parseFloat(svgRoot.getAttribute('width')),
        height: Number.parseFloat(svgRoot.getAttribute('height')),
        viewBox: svgRoot.getAttribute('viewBox'),
        logicalViewBox: svgRoot.getAttribute('data-export-logical-view-box'),
        pasteTransform: svgRoot.querySelector('g#export-group')?.getAttribute('transform') || null
      },
      png: pngMeta,
      tiff: tiffMeta,
      pdf: {
        widthPt: pdfMediaBox ? Number(pdfMediaBox[1]) : null,
        heightPt: pdfMediaBox ? Number(pdfMediaBox[2]) : null
      },
      emf: {
        frameWidth01mm: emfView.getInt32(32, true),
        frameHeight01mm: emfView.getInt32(36, true)
      }
    };
  });

  expect(result.svg.width).toBeCloseTo(400, 3);
  expect(result.svg.height).toBeCloseTo(200, 3);
  expect(result.svg.viewBox).toBe('0 0 400 200');
  expect(result.svg.logicalViewBox).toBe('0 0 100 50');
  expect(result.svg.pasteTransform).toBe('matrix(4 0 0 4 0 0)');

  expect(result.png.width).toBe(1250);
  expect(result.png.height).toBe(625);
  expect(result.png.ppmX).toBeCloseTo(Math.round(300 / 0.0254), 0);
  expect(result.png.ppmY).toBeCloseTo(Math.round(300 / 0.0254), 0);

  expect(result.tiff.width).toBe(800);
  expect(result.tiff.height).toBe(400);
  expect(result.tiff.dpiX).toBe(192);
  expect(result.tiff.dpiY).toBe(192);
  expect(result.tiff.resolutionUnit).toBe(2);

  expect(result.pdf.widthPt).toBeCloseTo(300, 3);
  expect(result.pdf.heightPt).toBeCloseTo(150, 3);

  expect(result.emf.frameWidth01mm).toBeCloseTo(Math.round((400 * 2540) / 96), 0);
  expect(result.emf.frameHeight01mm).toBeCloseTo(Math.round((200 * 2540) / 96), 0);
  expect(issues.critical).toEqual([]);
});
