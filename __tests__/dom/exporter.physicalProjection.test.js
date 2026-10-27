function readBlobBuffer(blob) {
  if (blob && typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsArrayBuffer(blob);
  });
}

function readBlobText(blob) {
  return readBlobBuffer(blob).then(buffer => new TextDecoder('latin1').decode(new Uint8Array(buffer)));
}

function makeRasterCanvas(width, height) {
  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) })
    })
  };
}

function parsePngResolution(bytes) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    const length = view.getUint32(0, false);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'pHYs' && length === 9) {
      return {
        ppmX: view.getUint32(8, false),
        ppmY: view.getUint32(12, false),
        unit: bytes[offset + 16]
      };
    }
    offset += 12 + length;
  }
  return null;
}

function makeMinimalPngBlob() {
  const bytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0, 73, 69, 78, 68,
    0, 0, 0, 0
  ]);
  return new Blob([bytes], { type: 'image/png' });
}

describe('exporter physical projection across formats', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    require('../../js/shared/exportProjection.js');
    require('../../js/shared/exporter.js');
    require('../../js/shared/svgGeometry.js');
  });

  test('inward borders keep canonical geometry, semantic thickness and independent clip definitions after cloning', () => {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10 10H60V60H10Z" stroke-width="3"/></svg>';
    const svg = document.querySelector('svg');
    const path = svg.querySelector('path');
    const geometry = window.Shared.svgGeometry;
    geometry.applyInnerStroke(path);
    expect(path.getAttribute('d')).toBe('M10 10H60V60H10Z');
    expect(path.getAttribute('stroke-width')).toBe('6');
    expect(geometry.getStrokeWidth(path)).toBe(3);
    geometry.setStrokeWidth(path, 12);
    geometry.applyInnerStroke(path);
    expect(path.getAttribute('stroke-width')).toBe('24');
    expect(svg.querySelectorAll('clipPath')).toHaveLength(1);
    geometry.setStrokeWidth(path, 0);
    expect(path.getAttribute('clip-path')).toBe('none');
    geometry.setStrokeWidth(path, 12);
    expect(path.getAttribute('clip-path')).toBe(`url(#${svg.querySelector('clipPath').id})`);
    const clone = svg.cloneNode(true);
    document.body.appendChild(clone);
    geometry.applyInnerStroke(clone.querySelector('path:not(clipPath path)'));
    expect(clone.querySelector('clipPath').id).not.toBe(svg.querySelector('clipPath').id);
  });

  test('nested transformed curved clips remain native PDF and EMF paths and restore clipping before siblings', async () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <defs>
        <clipPath id="outer"><rect x="0" y="0" width="80" height="80"/></clipPath>
        <clipPath id="curve"><path d="M10 10Q50 0 70 40L40 70Z" clip-rule="evenodd" transform="translate(2 3)"/></clipPath>
      </defs>
      <g clip-path="url(#outer)" transform="translate(5 7)">
        <path clip-path="url(#curve)" d="M10 10Q50 0 70 40L40 70Z" fill="#888888" stroke="#000000" stroke-width="20"/>
        <text x="10" y="20">Clipped text</text>
      </g>
      <path d="M85 85H95V95H85Z" fill="#ff0000"/>
    </svg>`;
    const pdf = await readBlobText(await window.Shared.exporter.svgStringToPdfBlob(xml));
    expect(pdf).not.toContain('/Subtype /Image');
    expect(pdf).toContain('W*\nn');
    expect(pdf).toContain('W\nn');
    expect(pdf).toContain('12.75 60 m'); // Parent, clip-child and physical-frame transforms compose once.
    const emf = new DataView(await readBlobBuffer(await window.Shared.exporter.svgStringToEmfBlob(xml)));
    const records = [];
    const stockObjects = [];
    for(let offset = 0; offset + 8 <= emf.byteLength;){
      const type = emf.getUint32(offset, true);
      const size = emf.getUint32(offset + 4, true);
      records.push(type);
      if(type === 37) stockObjects.push(emf.getUint32(offset + 8, true));
      expect(size).toBeGreaterThanOrEqual(8);
      offset += size;
    }
    expect(records).not.toContain(81); // EMR_STRETCHDIBITS would be a raster fallback.
    expect(stockObjects).toContain(0x80000008); // MS-EMF NULL_PEN; no accidental background/fill outline.
    expect(stockObjects).not.toContain(0x80000009);
    expect(records.filter(type => type === 67)).toHaveLength(3); // Two path clips, one inherited text clip.
    expect(records.filter(type => type === 33)).toHaveLength(2);
    expect(records.filter(type => type === 34)).toHaveLength(2);
    expect(records.lastIndexOf(34)).toBeLessThan(records.lastIndexOf(8)); // The unclipped sibling is drawn afterwards.
  });

  test('SVG serialization materializes the logical viewBox into the owner-frame coordinate system', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 50');
    svg.setAttribute('width', '1000');
    svg.setAttribute('height', '500');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '0');
    line.setAttribute('x2', '100');
    line.setAttribute('y2', '50');
    svg.appendChild(line);

    const xml = window.Shared.exporter.svgElementToXml(svg, 'projection-svg', {
      ownerFrame: { width: 400, height: 200 }
    });
    const exported = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;

    expect(exported.getAttribute('viewBox')).toBe('0 0 400 200');
    expect(exported.getAttribute('data-export-logical-view-box')).toBe('0 0 100 50');
    expect(Number(exported.getAttribute('width'))).toBeCloseTo(400, 6);
    expect(Number(exported.getAttribute('height'))).toBeCloseTo(200, 6);
    expect(exported.querySelector('g#export-group')?.getAttribute('transform'))
      .toBe('matrix(4 0 0 4 0 0)');
  });

  test('PDF and EMF use the same 96-DPI physical frame', async () => {
    const xml = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
        <path d="M10 10H390" fill="none" stroke="#000" stroke-width="1" />
      </svg>`;
    const ownerFrame = { width: 400, height: 200 };

    const pdf = await window.Shared.exporter.svgStringToPdfBlob(xml, { ownerFrame });
    const pdfText = await readBlobText(pdf);
    expect(pdfText).toContain('/MediaBox [0 0 300 150]');

    const emf = await window.Shared.exporter.svgStringToEmfBlob(xml, { ownerFrame });
    const emfBuffer = await readBlobBuffer(emf);
    const emfView = new DataView(emfBuffer);
    expect(emfView.getInt32(32, true)).toBeCloseTo(Math.round((400 * 2540) / 96), 0);
    expect(emfView.getInt32(36, true)).toBeCloseTo(Math.round((200 * 2540) / 96), 0);
  });

  test('a 1pt non-scaling stroke remains exactly 1pt in PDF and EMF vector output', async () => {
    const xml = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
        <g transform="scale(2)">
          <path d="M5 5H45" fill="none" stroke="#000000" stroke-width="1pt" vector-effect="non-scaling-stroke" />
        </g>
      </svg>`;
    const ownerFrame = { width: 400, height: 200 };

    const pdf = await window.Shared.exporter.svgStringToPdfBlob(xml, { ownerFrame });
    const pdfText = await readBlobText(pdf);
    expect(pdfText).toMatch(/(?:^|\n)1 w(?:\n|$)/);

    const emf = await window.Shared.exporter.svgStringToEmfBlob(xml, { ownerFrame });
    const emfBuffer = await readBlobBuffer(emf);
    const view = new DataView(emfBuffer);
    const penWidths = [];
    let offset = 108;
    while (offset + 8 <= view.byteLength) {
      const type = view.getUint32(offset, true);
      const size = view.getUint32(offset + 4, true);
      if (!size || offset + size > view.byteLength) break;
      if (type === 0x00000026) {
        penWidths.push(view.getInt32(offset + 16, true));
      }
      offset += size;
    }
    expect(penWidths).toContain(16); // 1pt = 4/3 CSS px; 4/3 * EMF coordinate scale 12 = 16.
  });

  test('a 12pt font remains exactly 12pt in PDF and EMF vector output', async () => {
    const xml = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
        <text x="20" y="40" font-family="Arial" font-size="12pt">A</text>
      </svg>`;
    const ownerFrame = { width: 400, height: 200 };

    const pdf = await window.Shared.exporter.svgStringToPdfBlob(xml, { ownerFrame });
    const pdfText = await readBlobText(pdf);
    expect(pdfText).toMatch(/\/F\d+\s+12 Tf/);

    const emf = await window.Shared.exporter.svgStringToEmfBlob(xml, { ownerFrame });
    const emfBuffer = await readBlobBuffer(emf);
    const view = new DataView(emfBuffer);
    const fontHeights = [];
    let offset = 108;
    while (offset + 8 <= view.byteLength) {
      const type = view.getUint32(offset, true);
      const size = view.getUint32(offset + 4, true);
      if (!size || offset + size > view.byteLength) break;
      if (type === 0x00000052) {
        fontHeights.push(view.getInt32(offset + 12, true));
      }
      offset += size;
    }
    expect(fontHeights).toContain(-192); // 12pt = 16 CSS px; 16 * EMF coordinate scale 12 = 192.
  });

  test('PNG resolution metadata reflects raster scale rather than changing physical size', async () => {
    const rewritten = await window.Shared.exporter.rewritePngResolution(makeMinimalPngBlob(), 192, 192);
    const bytes = new Uint8Array(await readBlobBuffer(rewritten));
    const resolution = parsePngResolution(bytes);

    expect(resolution).not.toBeNull();
    expect(resolution.unit).toBe(1);
    expect(resolution.ppmX).toBeCloseTo(Math.round(192 / 0.0254), 0);
    expect(resolution.ppmY).toBeCloseTo(Math.round(192 / 0.0254), 0);
  });

  test('TIFF and raster EMF metadata preserve a 400x200 CSS-pixel physical frame at 2x raster scale', async () => {
    const canvas = makeRasterCanvas(800, 400);

    const tiff = window.Shared.exporter.canvasToTiffBlob(canvas, { dpiX: 192, dpiY: 192 });
    const tiffBuffer = await readBlobBuffer(tiff);
    const tiffView = new DataView(tiffBuffer);
    const ifdOffset = tiffView.getUint32(4, true);
    const entryCount = tiffView.getUint16(ifdOffset, true);
    let xResolution = null;
    let yResolution = null;
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = ifdOffset + 2 + index * 12;
      const tag = tiffView.getUint16(entryOffset, true);
      if (tag !== 282 && tag !== 283) continue;
      const valueOffset = tiffView.getUint32(entryOffset + 8, true);
      const numerator = tiffView.getUint32(valueOffset, true);
      const denominator = tiffView.getUint32(valueOffset + 4, true);
      if (tag === 282) xResolution = numerator / denominator;
      if (tag === 283) yResolution = numerator / denominator;
    }
    expect(xResolution).toBe(192);
    expect(yResolution).toBe(192);
    expect(800 / xResolution).toBeCloseTo(400 / 96, 12);
    expect(400 / yResolution).toBeCloseTo(200 / 96, 12);

    const emf = window.Shared.exporter.canvasToEmfBlob(canvas, { dpiX: 192, dpiY: 192 });
    const emfBuffer = await readBlobBuffer(emf);
    const emfView = new DataView(emfBuffer);
    expect(emfView.getInt32(32, true)).toBeCloseTo(Math.round((400 * 2540) / 96), 0);
    expect(emfView.getInt32(36, true)).toBeCloseTo(Math.round((200 * 2540) / 96), 0);
  });
});
