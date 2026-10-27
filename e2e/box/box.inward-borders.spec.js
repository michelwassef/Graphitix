const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');

for (const horizontal of [false, true]) {
  test(`Box borders preserve painted bounds (${horizontal ? 'horizontal' : 'vertical'})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1800, height: 1200 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
    const root = page.locator('#boxPage:not([hidden])');
    const settle = () => waitForComponentOwnerReady(page, 'box', { requirePublished: true, requireIdle: true });
    await root.locator('#boxGraphType').selectOption('box');
    await root.locator('#boxPointMode').selectOption('none');
    await root.locator('#boxFlipAxes').setChecked(horizontal);
    await settle();
    const body = () => root.locator('#boxSvg [data-box-shape="body"][data-trace="1"]:not(line):not([data-box-violin-summary]):not([data-summary-line])');
    const snapshot = () => body().evaluate(async node => {
      const svg = node.ownerSVGElement;
      const bbox = node.getBBox();
      const isolated = document.createElementNS(svg.namespaceURI, 'svg');
      isolated.setAttribute('xmlns', svg.namespaceURI);
      isolated.setAttribute('width', '800');
      isolated.setAttribute('height', '800');
      isolated.setAttribute('viewBox', `${bbox.x - 20} ${bbox.y - 20} ${bbox.width + 40} ${bbox.height + 40}`);
      for (const defs of svg.querySelectorAll('defs')) isolated.appendChild(defs.cloneNode(true));
      const copy = node.cloneNode(true);
      copy.setAttribute('fill', '#888888');
      copy.setAttribute('stroke', '#000000');
      copy.setAttribute('fill-opacity', '1');
      copy.setAttribute('stroke-opacity', '1');
      isolated.appendChild(copy);
      const xml = new XMLSerializer().serializeToString(isolated);
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(xml)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 800;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, 800, 800).data;
      let left = 800, top = 800, right = -1, bottom = -1;
      for (let y = 0; y < 800; y++) for (let x = 0; x < 800; x++) {
        if (pixels[(y * 800 + x) * 4 + 3] > 127) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      return { bbox: [bbox.x, bbox.y, bbox.width, bbox.height], ink: [left, top, right, bottom], xml, png: canvas.toDataURL('image/png').split(',')[1],
        semanticWidth: window.Shared.svgGeometry.getStrokeWidth(node), renderedWidth: Number(node.getAttribute('stroke-width')), stroke: getComputedStyle(node).stroke };
    });
    const thickness = async width => {
      await body().scrollIntoViewIfNeeded();
      // Locator quads include the double stroke outside the clipped silhouette.
      // Find an actual painted hit target, avoiding summary marks on top.
      const point = await body().evaluate(node => {
        const b = node.getBBox();
        for(const fx of [0.4, 0.6, 0.25, 0.75]) for(const fy of [0.35, 0.65, 0.25, 0.75]) {
          const p = new DOMPoint(b.x + b.width * fx, b.y + b.height * fy).matrixTransform(node.getScreenCTM());
          if(document.elementFromPoint(p.x, p.y) === node) return { x: p.x, y: p.y };
        }
        return null;
      });
      expect(point).not.toBeNull();
      await page.mouse.click(point.x, point.y);
      await page.locator('.box-shape-controls .shared-border-style-chip').click();
      const input = page.locator('.shared-color-picker[data-visible="1"] input[aria-label="Border thickness"]');
      await input.fill(String(width));
      await input.press('Enter');
      await page.keyboard.press('Escape');
      await settle();
    };
    const expectSamePaintedBounds = (a, b) => {
      // KDE tips are subpixel-thin: fill and clip antialiasing can cross the
      // alpha threshold differently. Keep gap-facing bounds pixel-exact and
      // limit value-axis coverage differences to half a canonical CSS pixel.
      const scale = Math.min(800 / (a.bbox[2] + 40), 800 / (a.bbox[3] + 40));
      for (const i of horizontal ? [1, 3] : [0, 2]) expect(Math.abs(a.ink[i] - b.ink[i])).toBeLessThanOrEqual(1);
      for (const i of horizontal ? [0, 2] : [1, 3]) expect(Math.abs(a.ink[i] - b.ink[i]) / scale).toBeLessThanOrEqual(0.5);
    };
    for (const kind of ['bar', 'box', 'notched', 'violin']) {
      await root.locator('#boxGraphType').selectOption(kind);
      await settle();
      await thickness(0);
      const before = await snapshot();
      await thickness(12);
      const after = await snapshot();
      fs.mkdirSync('artifacts/box-inward-borders', { recursive: true });
      const name = `${kind}-${horizontal ? 'horizontal' : 'vertical'}`;
      fs.writeFileSync(`artifacts/box-inward-borders/${name}-before.png`, Buffer.from(before.png, 'base64'));
      fs.writeFileSync(`artifacts/box-inward-borders/${name}.png`, Buffer.from(after.png, 'base64'));
      fs.writeFileSync(`artifacts/box-inward-borders/${name}-metrics.json`, JSON.stringify({ before: { bbox: before.bbox, ink: before.ink }, after: { bbox: after.bbox, ink: after.ink } }));
      expect(after.semanticWidth).toBe(12);
      expect(after.renderedWidth).toBe(24);
      expect(after.stroke).not.toBe('none');
      expect(after.bbox).toEqual(before.bbox);
      expectSamePaintedBounds(before, after);
      // A structural redraw must preserve the same canonical outline and clipping.
      await page.evaluate(() => window.Components.box.draw({ force: true, reason: 'inward-border-redraw-contract' }));
      await settle();
      const redrawn = await snapshot();
      expect(redrawn.bbox).toEqual(after.bbox);
      expect(redrawn.ink).toEqual(after.ink);
      const formats = await page.evaluate(async xml => {
        const exporter = window.Shared.exporter;
        const pdf = await exporter.svgStringToPdfBlob(xml);
        const emf = await exporter.svgStringToEmfBlob(xml);
        const base64 = async blob => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
        };
        return { pdf: await base64(pdf), emf: await base64(emf) };
      }, after.xml);
      fs.writeFileSync(`artifacts/box-inward-borders/${name}.svg`, after.xml);
      fs.writeFileSync(`artifacts/box-inward-borders/${name}.png`, Buffer.from(after.png, 'base64'));
      for (const format of ['pdf', 'emf']) fs.writeFileSync(`artifacts/box-inward-borders/${name}.${format}`, Buffer.from(formats[format], 'base64'));
      expect(Buffer.from(formats.pdf, 'base64').toString('latin1')).not.toContain('/Subtype /Image');
    }
    const saved = await snapshot();
    expect(await page.evaluate(() => {
      const box = window.Components.box;
      const tabId = window.Main.session.workspaceState.activeTabId;
      const cache = box.captureRenderCache({ tabId });
      if (!cache) return false;
      delete cache.__graphitixRenderCache.renderGeometryVersion;
      return box.restoreRenderCache(cache, { tabId }) === false;
    })).toBe(true);
    const archive = await buildWorkspaceArchive(page, { scope: 'workspace', reason: 'inward-border-reopen', useWorker: true });
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'box' });
    await settle();
    const reopened = await snapshot();
    expect(reopened.semanticWidth).toBe(12);
    expect(reopened.bbox).toEqual(saved.bbox);
    expect(reopened.ink).toEqual(saved.ink);
    const handle = root.locator(horizontal ? '.svgbox .resizer-horizontal' : '.svgbox .resizer-vertical').first();
    const bounds = await handle.boundingBox();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (horizontal ? 0 : 70), y + (horizontal ? 70 : 0), { steps: 6 });
    await page.mouse.up();
    await settle();
    const resized = await snapshot();
    expect(resized.semanticWidth).toBe(12);
    expect(resized.bbox[horizontal ? 3 : 2]).toBeGreaterThan(reopened.bbox[horizontal ? 3 : 2]);
    await thickness(0);
    const resizedWithoutBorder = await snapshot();
    expect(resizedWithoutBorder.bbox).toEqual(resized.bbox);
    expectSamePaintedBounds(resized, resizedWithoutBorder);
    await page.screenshot({ path: `artifacts/box-inward-borders/${horizontal ? 'horizontal' : 'vertical'}.png` });
  });
}
