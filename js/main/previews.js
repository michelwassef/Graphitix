(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.previews = Main.previews || {};

  const TAB_PREVIEW_TARGET_WIDTH = 220;
  const TAB_PREVIEW_MIN_HEIGHT = 120;
  const TAB_PREVIEW_MAX_HEIGHT = 220;
  const TAB_PREVIEW_MAX_CHARS = 120000;
  const TAB_PREVIEW_MAX_CHARS_HYBRID = 600000;
  const TAB_PREVIEW_NS = 'http://www.w3.org/2000/svg';
  const TAB_PREVIEW_CANVAS_BITMAP_MAX_DIMENSION = 180;

  let tabPreviewTooltipEl = null;
  let tabPreviewActiveId = null;
  let tabPreviewMeasureRaf = null;
  let tabPreviewLastAnchorRect = null;
  const tabPreviewHybridRequests = new Map();

  function resolvePreviewRoot(config, tab) {
    const type = String(tab?.type || config?.type || '').trim();
    const mounted = window.Shared?.workspaceTabs?.getMountedRoot?.(tab || null, type) || null;
    if (mounted && typeof mounted.querySelector === 'function') {
      return mounted;
    }
    if (config?.activeElement && typeof config.activeElement.querySelector === 'function') {
      return config.activeElement;
    }
    if (config?.element && typeof config.element.querySelector === 'function') {
      return config.element;
    }
    return null;
  }

  function buildPreviewPlaceholder(width, height, meta = {}) {
    if (!document) {
      return null;
    }
    const safeWidth = Number.isFinite(width) && width > 0 ? width : TAB_PREVIEW_TARGET_WIDTH;
    const safeHeight = Number.isFinite(height) && height > 0 ? height : TAB_PREVIEW_MIN_HEIGHT;
    const svg = document.createElementNS(TAB_PREVIEW_NS, 'svg');
    svg.setAttribute('width', String(safeWidth));
    svg.setAttribute('height', String(safeHeight));
    svg.setAttribute('viewBox', `0 0 ${safeWidth} ${safeHeight}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('data-preview-placeholder', 'true');
    const bg = document.createElementNS(TAB_PREVIEW_NS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(safeWidth));
    bg.setAttribute('height', String(safeHeight));
    bg.setAttribute('fill', '#ffffff');
    bg.setAttribute('stroke', 'rgba(0, 0, 0, 0.08)');
    bg.setAttribute('stroke-width', '1');
    svg.appendChild(bg);
    const label = document.createElementNS(TAB_PREVIEW_NS, 'text');
    label.setAttribute('x', String(Math.round(safeWidth / 2)));
    label.setAttribute('y', String(Math.round(safeHeight / 2) - 6));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '12');
    label.setAttribute('fill', '#555555');
    label.textContent = meta.message || 'Preview simplified';
    svg.appendChild(label);
    const sublabel = document.createElementNS(TAB_PREVIEW_NS, 'text');
    sublabel.setAttribute('x', String(Math.round(safeWidth / 2)));
    sublabel.setAttribute('y', String(Math.round(safeHeight / 2) + 10));
    sublabel.setAttribute('text-anchor', 'middle');
    sublabel.setAttribute('font-size', '10');
    sublabel.setAttribute('fill', '#777777');
    sublabel.textContent = meta.detail || 'Large dataset';
    svg.appendChild(sublabel);
    return new XMLSerializer().serializeToString(svg);
  }

  function isPreviewPlaceholderMarkup(markup) {
    if (typeof markup !== 'string' || !markup) {
      return false;
    }
    return markup.includes('data-preview-placeholder')
      || markup.includes('Preparing preview')
      || markup.includes('Preview too large');
  }

  function resolvePreviewSizing(svg) {
    const viewBoxRaw = svg?.getAttribute ? svg.getAttribute('viewBox') : null;
    let minX = 0;
    let minY = 0;
    let boxW = NaN;
    let boxH = NaN;
    if (typeof viewBoxRaw === 'string' && viewBoxRaw.trim()) {
      const parts = viewBoxRaw.trim().split(/[\s,]+/).map(part => Number.parseFloat(part));
      if (parts.length === 4 && parts.every(num => Number.isFinite(num))) {
        [minX, minY, boxW, boxH] = parts;
      }
    }
    let widthAttr = Number.parseFloat(svg?.getAttribute ? svg.getAttribute('width') : NaN);
    let heightAttr = Number.parseFloat(svg?.getAttribute ? svg.getAttribute('height') : NaN);
    if (!Number.isFinite(widthAttr) || widthAttr <= 0) {
      if (Number.isFinite(boxW) && boxW > 0) {
        widthAttr = boxW;
      } else {
        widthAttr = TAB_PREVIEW_TARGET_WIDTH;
      }
    }
    if (!Number.isFinite(heightAttr) || heightAttr <= 0) {
      if (Number.isFinite(boxH) && boxH > 0) {
        heightAttr = boxH;
      } else {
        heightAttr = widthAttr * 0.68;
      }
    }
    if (!Number.isFinite(boxW) || boxW <= 0) {
      boxW = widthAttr;
    }
    if (!Number.isFinite(boxH) || boxH <= 0) {
      boxH = heightAttr;
    }
    const ratio = widthAttr > 0 ? Math.max(0.25, Math.min(heightAttr / widthAttr, 3)) : 0.68;
    const targetWidth = TAB_PREVIEW_TARGET_WIDTH;
    const targetHeight = Math.round(
      Math.max(TAB_PREVIEW_MIN_HEIGHT, Math.min(targetWidth * ratio, TAB_PREVIEW_MAX_HEIGHT))
    );
    return {
      minX,
      minY,
      boxW,
      boxH,
      widthAttr,
      heightAttr,
      targetWidth,
      targetHeight
    };
  }

  function applyPreviewSizing(svg, sizing) {
    if (!svg || !sizing) {
      return;
    }
    svg.setAttribute('width', String(sizing.targetWidth));
    svg.setAttribute('height', String(sizing.targetHeight));
    // Force aspect-preserving thumbnails. Some workspace SVGs intentionally use
    // preserveAspectRatio="none" for live panel fill, which distorts tab previews.
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svg.hasAttribute('viewBox') && Number.isFinite(sizing.boxW) && Number.isFinite(sizing.boxH)) {
      svg.setAttribute('viewBox', `${Number.isFinite(sizing.minX) ? sizing.minX : 0} ${Number.isFinite(sizing.minY) ? sizing.minY : 0} ${sizing.boxW} ${sizing.boxH}`);
    }
  }

  function ensurePreviewBackground(svg, sizing) {
    if (!svg || svg.querySelector('[data-preview-bg="true"]')) {
      return;
    }
    const rect = document.createElementNS(TAB_PREVIEW_NS, 'rect');
    rect.setAttribute('x', String(Number.isFinite(sizing.minX) ? sizing.minX : 0));
    rect.setAttribute('y', String(Number.isFinite(sizing.minY) ? sizing.minY : 0));
    rect.setAttribute('width', Number.isFinite(sizing.boxW) ? String(sizing.boxW) : '100%');
    rect.setAttribute('height', Number.isFinite(sizing.boxH) ? String(sizing.boxH) : '100%');
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('data-preview-bg', 'true');
    let insertTarget = svg.firstChild;
    while (insertTarget && insertTarget.nodeType === 1 && insertTarget.nodeName.toLowerCase() === 'defs') {
      insertTarget = insertTarget.nextSibling;
    }
    if (insertTarget) {
      svg.insertBefore(rect, insertTarget);
    } else {
      svg.appendChild(rect);
    }
  }

  function ensurePreviewImageLinks(svg) {
    if (!svg || typeof svg.querySelectorAll !== 'function') {
      return;
    }
    const images = Array.from(svg.querySelectorAll('image'));
    if (!images.length) {
      return;
    }
    if (!svg.getAttribute('xmlns')) {
      svg.setAttribute('xmlns', TAB_PREVIEW_NS);
    }
    if (!svg.getAttribute('xmlns:xlink')) {
      svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }
    images.forEach(node => {
      if (!node) {
        return;
      }
      const href = node.getAttribute('href');
      const xlinkHref = node.getAttribute('xlink:href')
        || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      const value = href || xlinkHref;
      if (!value) {
        return;
      }
      node.setAttribute('href', value);
      node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', value);
    });
  }

  function getHybridPreviewOptions(type) {
    if (type === 'scatter') {
      return {
        label: 'SVG (points as PNG)',
        fileNameSuffix: '-light',
        rasterScale: 1,
        pngScale: 1,
        layers: [
          {
            selector: '[data-export-layer="scatter-points"]',
            label: 'scatter-points',
            padding: 2,
            scale: 1
          }
        ]
      };
    }
    if (type === 'box') {
      return {
        label: 'SVG (points as PNG)',
        fileNameSuffix: '-light',
        rasterScale: 1,
        pngScale: 1,
        layers: [
          {
            selector: '[data-export-layer="box-points"]',
            label: 'box-points',
            padding: 2,
            scale: 1
          }
        ]
      };
    }
    if (type === 'heatmap') {
      return {
        label: 'SVG (matrix as PNG)',
        fileNameSuffix: '-light',
        rasterScale: 1,
        pngScale: 1,
        layers: [
          {
            selector: '[data-export-layer="heatmap-cells"]',
            label: 'heatmap-cells',
            padding: 2,
            scale: 1
          }
        ]
      };
    }
    return null;
  }

  function shouldForceHybridPreviewCapture(svg, type) {
    if (!svg || typeof svg.querySelector !== 'function') {
      return false;
    }
    if (!getHybridPreviewOptions(type)) {
      return false;
    }
    return !!svg.querySelector('foreignObject[data-point-renderer], foreignobject[data-point-renderer]');
  }

  function readPreviewNumber(node, attr, fallback) {
    const raw = node?.getAttribute ? Number.parseFloat(node.getAttribute(attr)) : NaN;
    return Number.isFinite(raw) ? raw : fallback;
  }

  function appendScatterCanvasPreviewGlyphs(layer, box) {
    const doc = layer?.ownerDocument || document;
    const width = Math.max(1, Number(box.width) || 1);
    const height = Math.max(1, Number(box.height) || 1);
    const minX = Number(box.x) || 0;
    const minY = Number(box.y) || 0;
    const count = 56;
    const group = doc.createElementNS(TAB_PREVIEW_NS, 'g');
    group.setAttribute('data-preview-canvas-simplified', 'scatter');
    group.setAttribute('opacity', '0.75');
    for (let idx = 0; idx < count; idx += 1) {
      const t = count <= 1 ? 0 : idx / (count - 1);
      const wave = Math.sin(idx * 2.17) * 0.18 + Math.cos(idx * 0.73) * 0.12;
      const cx = minX + width * (0.08 + 0.84 * t);
      const cy = minY + height * Math.max(0.08, Math.min(0.92, 0.66 - 0.38 * t + wave));
      const dot = doc.createElementNS(TAB_PREVIEW_NS, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', String(Math.max(0.8, Math.min(width, height) * 0.009)));
      dot.setAttribute('fill', '#4f7fd9');
      group.appendChild(dot);
    }
    layer.appendChild(group);
  }

  function appendBoxCanvasPreviewGlyph(layer, box) {
    const doc = layer?.ownerDocument || document;
    const width = Math.max(1, Number(box.width) || 1);
    const height = Math.max(1, Number(box.height) || 1);
    const minX = Number(box.x) || 0;
    const minY = Number(box.y) || 0;
    const midY = minY + height * 0.5;
    const path = doc.createElementNS(TAB_PREVIEW_NS, 'path');
    path.setAttribute('data-preview-canvas-simplified', 'box');
    path.setAttribute('d', `M ${minX} ${midY} C ${minX + width * 0.22} ${minY + height * 0.18} ${minX + width * 0.78} ${minY + height * 0.82} ${minX + width} ${midY}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#4f7fd9');
    path.setAttribute('stroke-width', String(Math.max(1, Math.min(width, height) * 0.018)));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', '0.78');
    layer.appendChild(path);
  }

  function collectPreviewCanvases(node) {
    if (!node) {
      return [];
    }
    const nodes = [];
    if (String(node.tagName || '').toLowerCase() === 'canvas') {
      nodes.push(node);
    }
    if (typeof node.querySelectorAll === 'function') {
      nodes.push(...Array.from(node.querySelectorAll('canvas')));
    }
    return nodes;
  }

  function canvasToPreviewDataUrl(canvas) {
    if (!canvas || typeof canvas.toDataURL !== 'function') {
      return '';
    }
    const width = Math.max(1, Number(canvas.width) || 1);
    const height = Math.max(1, Number(canvas.height) || 1);
    const maxDim = TAB_PREVIEW_CANVAS_BITMAP_MAX_DIMENSION;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    if (scale >= 0.999) {
      try {
        return canvas.toDataURL('image/png');
      } catch (_err) {
        return '';
      }
    }
    const doc = canvas.ownerDocument || document;
    const previewCanvas = doc.createElement('canvas');
    previewCanvas.width = Math.max(1, Math.round(width * scale));
    previewCanvas.height = Math.max(1, Math.round(height * scale));
    const ctx = previewCanvas.getContext?.('2d');
    if (!ctx || typeof ctx.clearRect !== 'function' || typeof ctx.drawImage !== 'function') {
      try {
        return canvas.toDataURL('image/png');
      } catch (_err) {
        return '';
      }
    }
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
    try {
      return previewCanvas.toDataURL('image/png');
    } catch (_err) {
      return '';
    }
  }

  function hydrateCanvasBitmapsForPreview(sourceSvg, cloneSvg) {
    if (!sourceSvg || !cloneSvg) {
      return 0;
    }
    const sourceCanvases = collectPreviewCanvases(sourceSvg);
    const cloneCanvases = collectPreviewCanvases(cloneSvg);
    const count = Math.min(sourceCanvases.length, cloneCanvases.length);
    let hydrated = 0;
    for (let idx = 0; idx < count; idx += 1) {
      const sourceCanvas = sourceCanvases[idx];
      const cloneCanvas = cloneCanvases[idx];
      const dataUrl = canvasToPreviewDataUrl(sourceCanvas);
      if (!dataUrl || !cloneCanvas?.parentNode) {
        continue;
      }
      const doc = cloneCanvas.ownerDocument || document;
      const img = doc.createElement('img');
      img.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      img.setAttribute('src', dataUrl);
      img.setAttribute('data-preview-canvas-bitmap', 'true');
      img.setAttribute('width', cloneCanvas.getAttribute('width') || String(sourceCanvas.width || 1));
      img.setAttribute('height', cloneCanvas.getAttribute('height') || String(sourceCanvas.height || 1));
      const style = cloneCanvas.getAttribute('style');
      if (style) {
        img.setAttribute('style', style);
      }
      img.style.display = cloneCanvas.style?.display || 'block';
      img.style.width = cloneCanvas.style?.width || `${sourceCanvas.width || 1}px`;
      img.style.height = cloneCanvas.style?.height || `${sourceCanvas.height || 1}px`;
      img.style.background = cloneCanvas.style?.background || 'transparent';
      img.style.pointerEvents = 'none';
      cloneCanvas.parentNode.replaceChild(img, cloneCanvas);
      hydrated += 1;
    }
    if (hydrated) {
      cloneSvg.setAttribute('data-preview-canvas-bitmap', String(hydrated));
    }
    return hydrated;
  }

  function resolvePreviewFallbackBox(svg, sizing) {
    const source = sizing || resolvePreviewSizing(svg);
    const minX = Number.isFinite(source?.minX) ? source.minX : 0;
    const minY = Number.isFinite(source?.minY) ? source.minY : 0;
    const width = Number.isFinite(source?.boxW) && source.boxW > 0 ? source.boxW : TAB_PREVIEW_TARGET_WIDTH;
    const height = Number.isFinite(source?.boxH) && source.boxH > 0 ? source.boxH : TAB_PREVIEW_MIN_HEIGHT;
    return {
      x: minX + width * 0.14,
      y: minY + height * 0.17,
      width: Math.max(1, width * 0.64),
      height: Math.max(1, height * 0.58)
    };
  }

  function resolvePreviewNodeBox(node, svg, sizing) {
    if (node && typeof node.getBBox === 'function') {
      try {
        const box = node.getBBox();
        if (Number.isFinite(box?.x) && Number.isFinite(box?.y) && Number.isFinite(box?.width) && Number.isFinite(box?.height) && box.width > 0 && box.height > 0) {
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }
      } catch (_err) {
        // Detached preview clones often cannot report getBBox; fall back to viewport proportions.
      }
    }
    const foreignObject = node?.querySelector?.('foreignObject[data-point-renderer], foreignobject[data-point-renderer]') || null;
    if (foreignObject) {
      return {
        x: readPreviewNumber(foreignObject, 'x', 0),
        y: readPreviewNumber(foreignObject, 'y', 0),
        width: Math.max(1, readPreviewNumber(foreignObject, 'width', 1)),
        height: Math.max(1, readPreviewNumber(foreignObject, 'height', 1))
      };
    }
    return resolvePreviewFallbackBox(svg, sizing);
  }

  function getPreviewPointLayerSelector(type) {
    if (type === 'box') {
      return '[data-export-layer="box-points"]';
    }
    if (type === 'scatter') {
      return '[data-export-layer="scatter-points"]';
    }
    return '';
  }

  function measurePreviewPointLayerComplexity(layer) {
    if (!layer || typeof layer.querySelectorAll !== 'function') {
      return { nodeCount: 0, pathChars: 0, hasCanvasRenderer: false };
    }
    const nodes = Array.from(layer.querySelectorAll('circle, rect, path, use, foreignObject, foreignobject'));
    let pathChars = 0;
    nodes.forEach(node => {
      if (String(node.tagName || '').toLowerCase() === 'path') {
        const d = node.getAttribute?.('d') || '';
        pathChars += d.length;
      }
    });
    return {
      nodeCount: nodes.length,
      pathChars,
      hasCanvasRenderer: !!layer.querySelector('foreignObject[data-point-renderer], foreignobject[data-point-renderer]')
    };
  }

  function shouldSimplifyPreviewPointLayer(layer, type, options = {}) {
    if (options.force) {
      return true;
    }
    if (!layer || layer.querySelector?.('[data-preview-canvas-simplified]')) {
      return false;
    }
    if (layer.querySelector?.('[data-preview-canvas-bitmap]')) {
      return false;
    }
    const complexity = measurePreviewPointLayerComplexity(layer);
    return complexity.hasCanvasRenderer
      || complexity.nodeCount > 400
      || complexity.pathChars > 20000
      || (type === 'box' && !!layer.querySelector?.('[data-box-export-geometry="1"], [data-box-approx-symbol-geometry="1"]'));
  }

  function simplifyPointLayerForPreview(layer, type, svg, sizing) {
    if (!layer || typeof layer.appendChild !== 'function') {
      return false;
    }
    const box = resolvePreviewNodeBox(layer, svg, sizing);
    while (layer.firstChild) {
      layer.removeChild(layer.firstChild);
    }
    if (type === 'box') {
      appendBoxCanvasPreviewGlyph(layer, box);
    } else {
      appendScatterCanvasPreviewGlyphs(layer, box);
    }
    return true;
  }

  function simplifyHeavyPointLayersForPreview(svg, type, sizing, options = {}) {
    const selector = getPreviewPointLayerSelector(type);
    if (!svg || !selector || typeof svg.querySelectorAll !== 'function') {
      return 0;
    }
    const layers = Array.from(svg.querySelectorAll(selector));
    let simplified = 0;
    layers.forEach(layer => {
      if (!shouldSimplifyPreviewPointLayer(layer, type, options)) {
        return;
      }
      if (simplifyPointLayerForPreview(layer, type, svg, sizing)) {
        simplified += 1;
      }
    });
    if (simplified) {
      svg.setAttribute('data-preview-canvas-simplified', String(simplified));
    }
    return simplified;
  }

  function simplifyCanvasLayersForPreview(svg, type) {
    if (!svg || typeof svg.querySelectorAll !== 'function') {
      return 0;
    }
    const objects = Array.from(svg.querySelectorAll('foreignObject[data-point-renderer], foreignobject[data-point-renderer]'));
    let simplified = 0;
    objects.forEach(node => {
      const layer = node.closest?.('[data-export-layer]') || node.parentNode;
      if (!layer || typeof layer.appendChild !== 'function') {
        return;
      }
      const box = {
        x: readPreviewNumber(node, 'x', 0),
        y: readPreviewNumber(node, 'y', 0),
        width: Math.max(1, readPreviewNumber(node, 'width', 1)),
        height: Math.max(1, readPreviewNumber(node, 'height', 1))
      };
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
      if (type === 'box') {
        appendBoxCanvasPreviewGlyph(layer, box);
      } else {
        appendScatterCanvasPreviewGlyphs(layer, box);
      }
      simplified += 1;
    });
    if (simplified) {
      svg.setAttribute('data-preview-canvas-simplified', String(simplified));
    }
    return simplified;
  }

  function getRenderCacheSequence(tab) {
    const seq = Number(tab?.renderCache?.captureSequence);
    return Number.isFinite(seq) && seq > 0 ? seq : 0;
  }

  function scheduleHybridPreviewCapture(tab, svg, sizing, meta = {}) {
    const Shared = window.Shared || {};
    const exporter = Shared.exporter;
    const doc = svg?.ownerDocument || document;
    if (!tab || !svg || !exporter || typeof exporter.buildHybridSvg !== 'function' || !doc?.body) {
      return false;
    }
    const hybridOptions = getHybridPreviewOptions(tab.type);
    if (!hybridOptions) {
      return false;
    }
    const signature = meta.payloadSignature || tab.payloadSignature || null;
    const existing = tabPreviewHybridRequests.get(tab.id);
    if (existing && existing.signature === signature) {
      return true;
    }
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    tabPreviewHybridRequests.set(tab.id, { id: requestId, signature });
    exporter.buildHybridSvg(svg, {
      ...hybridOptions,
      baseFileName: 'tab-preview',
      contextLabel: `tab-preview-${tab.type || 'unknown'}`
    }).then(hybrid => {
      const current = tabPreviewHybridRequests.get(tab.id);
      if (!current || current.id !== requestId) {
        return;
      }
      tabPreviewHybridRequests.delete(tab.id);
      if (!hybrid?.svg) {
        console.debug('Debug: preview hybrid missing svg', { tabId: tab.id, type: tab.type });
        return;
      }
      const hybridSvg = hybrid.svg;
      const sizingResolved = sizing || resolvePreviewSizing(hybridSvg);
      applyPreviewSizing(hybridSvg, sizingResolved);
      ensurePreviewBackground(hybridSvg, sizingResolved);
      ensurePreviewImageLinks(hybridSvg);
      const serializer = new XMLSerializer();
      const markup = serializer.serializeToString(hybridSvg);
      if (!markup || markup.length > TAB_PREVIEW_MAX_CHARS_HYBRID) {
        console.debug('Debug: preview hybrid oversize', {
          tabId: tab.id,
          type: tab.type,
          length: markup ? markup.length : 0
        });
        return;
      }
      tab.previewMarkup = markup;
      tab.previewSignature = signature;
      tab.previewMeta = {
        width: sizingResolved.targetWidth,
        height: sizingResolved.targetHeight,
        size: markup.length,
        hybrid: true,
        renderCacheSequence: getRenderCacheSequence(tab),
        updatedAt: Date.now(),
        reason: meta.reason || 'hybrid'
      };
      syncTabPreviewIndicator(tab);
      if (tabPreviewTooltipEl && tabPreviewTooltipEl.dataset.tabId === tab.id && tabPreviewTooltipEl.style.display !== 'none') {
        renderTabPreviewTooltipContent(tabPreviewTooltipEl, markup);
        if (tabPreviewMeasureRaf) {
          cancelAnimationFrame(tabPreviewMeasureRaf);
        }
        tabPreviewMeasureRaf = requestAnimationFrame(() => {
          positionTabPreviewTooltip(tab, tabPreviewLastAnchorRect);
        });
      }
      console.debug('Debug: preview hybrid stored', {
        tabId: tab.id,
        type: tab.type,
        length: markup.length,
        width: sizingResolved.targetWidth,
        height: sizingResolved.targetHeight
      });
    }).catch(err => {
      tabPreviewHybridRequests.delete(tab.id);
      console.debug('Debug: preview hybrid error', { tabId: tab.id, type: tab.type, err: err?.message || String(err) });
    });
    return true;
  }

  function captureWorkspacePreview(config, tab) {
    const previewRoot = resolvePreviewRoot(config, tab);
    if (!config) {
      console.debug('Debug: preview capture skipped', { reason: 'no-config', type: config?.type || null, tabId: tab?.id || null });
      return null;
    }
    if (!previewRoot) {
      console.debug('Debug: preview capture continuing without mounted root', { type: config?.type || null, tabId: tab?.id || null });
    }
    let svg = null;
    let svgFromGetter = false;
    if (typeof config.getPreviewSvg === 'function') {
      try {
        svg = config.getPreviewSvg(tab) || null;
        svgFromGetter = !!svg;
      } catch (err) {
        console.debug('Debug: preview getPreviewSvg failed', {
          type: config.type,
          tabId: tab?.id || null,
          message: err?.message || String(err)
        });
      }
    }
    const isUiIconSvg = node => {
      if (!node || String(node.nodeName || '').toLowerCase() !== 'svg') {
        return false;
      }
      const className = String(node.getAttribute?.('class') || '').toLowerCase();
      if (className.includes('resizer-options-icon')) {
        return true;
      }
      const ariaHidden = String(node.getAttribute?.('aria-hidden') || '').toLowerCase() === 'true';
      const focusable = String(node.getAttribute?.('focusable') || '').toLowerCase() === 'false';
      const hasExportLayer = !!node.querySelector?.('[data-export-layer], [data-layer], [data-venn-trace-id], [data-upset-trace-id]');
      if (ariaHidden && focusable && !hasExportLayer) {
        return true;
      }
      if (node.closest?.('.workspace-toolbar, .resizer-control-tray, .resizer-options, .resizer-options-menu, button')) {
        return true;
      }
      return false;
    };
    const rootContainsSvg = node => !!(node && previewRoot && typeof previewRoot.contains === 'function' && previewRoot.contains(node));
    const isLikelyPlotSvg = node => {
      if (!node || String(node.nodeName || '').toLowerCase() !== 'svg') {
        return false;
      }
      if (isUiIconSvg(node)) {
        return false;
      }
      if (node.getAttribute?.('data-preview-source') === 'true') {
        return true;
      }
      if (node.id && /(?:^|[-_])(pieSvg|stage)(?:$|[-_])/i.test(node.id)) {
        return true;
      }
      if (node.querySelector?.('[data-layer="pie-data"], [data-layer="pie-axis"], [data-layer="pie-labels"], [data-venn-trace-id], [data-upset-trace-id]')) {
        return true;
      }
      const vb = node.getAttribute?.('viewBox') || '';
      const parts = vb.trim().split(/[\s,]+/).map(v => Number.parseFloat(v));
      if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
        if (parts[2] < 80 || parts[3] < 80) {
          return false;
        }
      }
      const w = Number.parseFloat(node.getAttribute?.('width'));
      const h = Number.parseFloat(node.getAttribute?.('height'));
      if (Number.isFinite(w) && Number.isFinite(h) && (w < 80 || h < 80)) {
        return false;
      }
      return true;
    };
    if (svg && !isLikelyPlotSvg(svg)) {
      console.debug('Debug: preview getter svg rejected', {
        tabId: tab?.id || null,
        type: config.type,
        className: svg.getAttribute?.('class') || '',
        id: svg.id || null
      });
      svg = null;
      svgFromGetter = false;
    }
    if ((!svg || (!svgFromGetter && !rootContainsSvg(svg))) && previewRoot) {
      const primary = previewRoot.querySelector('.svgbox svg:not(.resizer-options-icon)');
      svg = isLikelyPlotSvg(primary) ? primary : null;
    }
    if (!svg && previewRoot) {
      const tagged = previewRoot.querySelector('svg[data-preview-source="true"]');
      if (isLikelyPlotSvg(tagged)) {
        svg = tagged;
      } else {
        const candidates = Array.from(previewRoot.querySelectorAll('svg'));
        svg = candidates.find(node => isLikelyPlotSvg(node) && !node.closest('.workspace-toolbar'))
          || candidates.find(node => isLikelyPlotSvg(node))
          || null;
      }
    }
    if (!svg) {
      console.debug('Debug: preview capture skipped', { reason: 'no-svg', type: config.type, tabId: tab?.id || null });
      svg = resolvePreviewSvgFromTabRenderCache(tab, config.type);
      if (!svg) {
        return null;
      }
    }
    const rawMarkup = typeof svg.innerHTML === 'string' ? svg.innerHTML.trim() : '';
    if (!rawMarkup) {
      console.debug('Debug: preview capture skipped', { reason: 'empty-svg', type: config.type, tabId: tab?.id || null });
      const cacheSvg = resolvePreviewSvgFromTabRenderCache(tab, config.type);
      if (!cacheSvg) {
        return null;
      }
      svg = cacheSvg;
    }
    const sizing = resolvePreviewSizing(svg);
    const clone = svg.cloneNode(true);
    const hydratedCanvasLayers = hydrateCanvasBitmapsForPreview(svg, clone);
    const simplifiedCanvasLayers = hydratedCanvasLayers ? 0 : simplifyCanvasLayersForPreview(clone, config.type);
    const simplifiedHeavyPointLayers = hydratedCanvasLayers ? 0 : simplifyHeavyPointLayersForPreview(clone, config.type, sizing);
    const simplifiedLayerCount = simplifiedCanvasLayers + simplifiedHeavyPointLayers;
    const forceHybrid = !hydratedCanvasLayers && !simplifiedLayerCount && shouldForceHybridPreviewCapture(clone, config.type);
    if (forceHybrid) {
      const scheduled = scheduleHybridPreviewCapture(tab, svg, sizing, {
        reason: 'canvas-layer',
        payloadSignature: tab?.payloadSignature || null
      });
      const placeholder = buildPreviewPlaceholder(sizing.targetWidth, sizing.targetHeight, {
        message: scheduled ? 'Preparing preview' : 'Preview simplified',
        detail: scheduled ? 'Rendering composite' : 'Canvas layer'
      });
      if (placeholder) {
        console.debug('Debug: preview hybrid forced', {
          tabId: tab?.id || null,
          type: config.type,
          hybridScheduled: scheduled
        });
        return { markup: placeholder, width: sizing.targetWidth, height: sizing.targetHeight, size: placeholder.length, simplified: true };
      }
    }
    applyPreviewSizing(clone, sizing);
    ensurePreviewBackground(clone, sizing);
    const serializer = new XMLSerializer();
    let markup = serializer.serializeToString(clone);
    let previewSimplified = simplifiedLayerCount > 0;
    if (!markup) {
      console.debug('Debug: preview capture skipped', { reason: 'serialize-empty', type: config.type, tabId: tab?.id || null });
      return null;
    }
    if (markup.length > TAB_PREVIEW_MAX_CHARS) {
      console.debug('Debug: preview oversize detected', { length: markup.length, type: config.type, tabId: tab?.id || null });
      if (hydratedCanvasLayers && markup.length <= TAB_PREVIEW_MAX_CHARS_HYBRID) {
        console.debug('Debug: preview canvas bitmap accepted above vector budget', {
          tabId: tab?.id || null,
          type: config.type,
          length: markup.length,
          bitmapLayers: hydratedCanvasLayers
        });
        return {
          markup,
          width: sizing.targetWidth,
          height: sizing.targetHeight,
          size: markup.length,
          simplified: previewSimplified,
          canvasSimplified: false,
          canvasBitmap: true
        };
      }
      const forcedSimplified = hydratedCanvasLayers ? 0 : simplifyHeavyPointLayersForPreview(clone, config.type, sizing, { force: config.type === 'box' || config.type === 'scatter' });
      if (forcedSimplified) {
        markup = serializer.serializeToString(clone);
        previewSimplified = true;
        if (markup && markup.length <= TAB_PREVIEW_MAX_CHARS) {
          console.debug('Debug: preview oversize simplified', {
            tabId: tab?.id || null,
            type: config.type,
            length: markup.length,
            simplifiedLayers: forcedSimplified
          });
          return { markup, width: sizing.targetWidth, height: sizing.targetHeight, size: markup.length, simplified: true, canvasSimplified: true, canvasBitmap: hydratedCanvasLayers > 0 };
        }
      }
      if (config.type === 'box' || config.type === 'scatter') {
        const placeholder = buildPreviewPlaceholder(sizing.targetWidth, sizing.targetHeight, {
          message: 'Preview simplified',
          detail: 'Large dataset'
        });
        if (placeholder) {
          return { markup: placeholder, width: sizing.targetWidth, height: sizing.targetHeight, size: placeholder.length, simplified: true, canvasSimplified: true, canvasBitmap: false };
        }
      }
      const scheduled = scheduleHybridPreviewCapture(tab, svg, sizing, {
        reason: 'oversize',
        payloadSignature: tab?.payloadSignature || null
      });
      const placeholder = buildPreviewPlaceholder(sizing.targetWidth, sizing.targetHeight, {
        message: scheduled ? 'Preparing preview' : 'Preview too large',
        detail: scheduled ? 'Rendering composite' : 'Large dataset'
      });
      if (placeholder) {
        console.debug('Debug: preview capture placeholder', {
          tabId: tab?.id || null,
          type: config.type,
          length: placeholder.length,
          hybridScheduled: scheduled
        });
        return { markup: placeholder, width: sizing.targetWidth, height: sizing.targetHeight, size: placeholder.length, simplified: scheduled };
      }
      console.debug('Debug: preview capture skipped', { reason: 'oversize', length: markup.length, type: config.type, tabId: tab?.id || null });
      return null;
    }
    console.debug('Debug: preview capture success', {
      tabId: tab?.id || null,
      type: config.type,
      length: markup.length,
      width: sizing.targetWidth,
      height: sizing.targetHeight
    });
    return {
      markup,
      width: sizing.targetWidth,
      height: sizing.targetHeight,
      size: markup.length,
      simplified: previewSimplified,
      canvasSimplified: simplifiedLayerCount > 0,
      canvasBitmap: hydratedCanvasLayers > 0
    };
  }

  function resolvePreviewSvgFromTabRenderCache(tab, type) {
    const cache = tab?.archiveRenderCache?.cache
      || tab?.archiveRenderCache
      || tab?.renderCache?.cache
      || null;
    if (!cache) {
      return null;
    }
    const doc = window.document || document;
    if (!doc || typeof doc.createElementNS !== 'function') {
      return null;
    }
    const NS = 'http://www.w3.org/2000/svg';
    const materializePayloadFragment = payload => {
      if (!payload) {
        return null;
      }
      if (payload.fragment && typeof payload.fragment.cloneNode === 'function') {
        return payload.fragment.cloneNode(true);
      }
      if (payload.__graphitixKind === 'fragment-payload' && Array.isArray(payload.nodes)) {
        const fragment = doc.createDocumentFragment();
        payload.nodes.forEach(spec => {
          const markup = typeof spec?.markup === 'string' ? spec.markup.trim() : '';
          if (!markup) {
            return;
          }
          const template = doc.createElement('template');
          template.innerHTML = markup;
          const node = template.content?.firstChild || null;
          if (node) {
            fragment.appendChild(node);
          }
        });
        return fragment;
      }
      return null;
    };
    const fromFragment = payload => {
      const fragment = materializePayloadFragment(payload);
      if (!fragment || typeof fragment.cloneNode !== 'function') {
        return null;
      }
      const clone = fragment;
      if (!clone) {
        return null;
      }
      if (clone.nodeType === 1 && String(clone.nodeName || '').toLowerCase() === 'svg') {
        return clone;
      }
      if (typeof clone.querySelector === 'function') {
        return clone.querySelector('svg') || null;
      }
      return null;
    };
    const stageState = cache.stageRootState || null;
    const stagePayload = cache.stage || null;
    const stageFragment = materializePayloadFragment(stagePayload);
    if ((type === 'venn' || stageState || stagePayload) && stageFragment) {
      const svg = doc.createElementNS(NS, 'svg');
      const attrs = stageState?.attributes || null;
      const styles = stageState?.style || null;
      if (attrs && typeof attrs === 'object') {
        Object.keys(attrs).forEach(name => {
          try {
            svg.setAttribute(name, String(attrs[name]));
          } catch (_) {}
        });
      }
      if (styles && typeof styles === 'object' && svg.style) {
        Object.keys(styles).forEach(name => {
          try {
            svg.style[name] = String(styles[name]);
          } catch (_) {}
        });
      }
      svg.appendChild(stageFragment);
      if (!svg.getAttribute('viewBox')) {
        const width = Number.parseFloat(svg.getAttribute('width')) || 427;
        const height = Number.parseFloat(svg.getAttribute('height')) || 427;
        svg.setAttribute('viewBox', `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`);
      }
      if (typeof svg.innerHTML === 'string' && svg.innerHTML.trim()) {
        console.debug('Debug: preview cache svg reconstructed', { tabId: tab?.id || null, type: type || null, source: 'stage' });
        return svg;
      }
    }
    const plotSvg = fromFragment(cache.plot);
    if (plotSvg && typeof plotSvg.innerHTML === 'string' && plotSvg.innerHTML.trim()) {
      console.debug('Debug: preview cache svg reconstructed', { tabId: tab?.id || null, type: type || null, source: 'plot-fragment' });
      return plotSvg;
    }
    return null;
  }

  function syncTabPreviewIndicator(tab) {
    const session = Main.session;
    if (!tab || !document || !session) {
      return;
    }
    const workspaceState = session.workspaceState;
    const domList = document.getElementById('workspaceTabsList');
    if (!domList) {
      return;
    }
    const selector = `[data-tab-id="${tab.id}"]`;
    const btn = domList.querySelector(selector);
    if (!btn) {
      return;
    }
    if (tab.previewMarkup) {
      btn.dataset.hasPreview = 'true';
    } else {
      delete btn.dataset.hasPreview;
    }
    console.debug('Debug: preview indicator synced', { tabId: tab.id, hasPreview: !!tab.previewMarkup });
  }

  function updateTabPreviewFromWorkspace(tab, config, meta = {}) {
    if (!tab || tab.isWelcome || !tab.type || !config) {
      console.debug('Debug: preview update skipped', { reason: 'invalid-tab', tabId: tab?.id || null, type: tab?.type || null, meta });
      return false;
    }
    const session = Main.session;
    const hasStableTabState = !!(
      tab?.payloadSignature
      || tab?.renderCache
      || tab?.archiveRenderCache
      || tab?.previewMarkup
    );
    const hasData = meta.forceCapture
      ? true
      : !!(session?.tabHasTableData?.(tab) || hasStableTabState);
    if (!hasData) {
      const reasonText = String(meta?.reason || '').trim().toLowerCase();
      const preserveExistingPreview = !!tab.previewMarkup && (
        reasonText === 'hover-inactive'
        || reasonText.includes('activate-switch')
        || reasonText.includes('deactivate')
        || reasonText.includes('persist-active')
        || reasonText.includes('recovery-interval')
        || reasonText.includes('archive-snapshot')
      );
      if (preserveExistingPreview) {
        console.debug('Debug: preview no-data during hover, preserving stored preview', {
          tabId: tab.id,
          type: tab.type,
          reason: meta?.reason || 'no-data-preserve'
        });
        return false;
      }
      if (tab.previewMarkup || tab.previewSignature || tab.previewMeta) {
        tab.previewMarkup = null;
        tab.previewSignature = null;
        tab.previewMeta = null;
        syncTabPreviewIndicator(tab);
        console.debug('Debug: preview cleared', { tabId: tab.id, reason: 'no-data', meta });
        return true;
      }
      console.debug('Debug: preview update skipped', { reason: 'no-data', tabId: tab.id, meta });
      return false;
    }
    const payloadSignature = tab.payloadSignature || null;
    const layoutSignature = tab.layoutSignature || null;
    const liveSvg = typeof config.getPreviewSvg === 'function'
      ? (() => {
          try {
            return config.getPreviewSvg(tab) || null;
          } catch (err) {
            console.debug('Debug: preview live svg resolve failed', {
              type: config.type,
              tabId: tab.id,
              message: err?.message || String(err)
            });
            return null;
          }
        })()
      : null;
    const previewRoot = resolvePreviewRoot(config, tab);
    const rootSvg = previewRoot?.querySelector?.('.svgbox svg') || null;
    const renderCacheSequence = getRenderCacheSequence(tab);
    const needsHybridRefresh = shouldForceHybridPreviewCapture(liveSvg || rootSvg || null, config.type)
      && !tab.previewMeta?.hybrid
      && !tab.previewMeta?.canvasBitmap
      && !tab.previewMeta?.canvasSimplified;
    const needsRenderCacheRefresh = renderCacheSequence > 0
      && Number(tab.previewMeta?.renderCacheSequence || 0) !== renderCacheSequence;
    const needsLayoutRefresh = layoutSignature
      && tab.previewMeta?.layoutSignature !== layoutSignature;
    const needsPlaceholderRefresh = isPreviewPlaceholderMarkup(tab.previewMarkup)
      && !tab.previewMeta?.hybrid
      && !tab.previewMeta?.canvasBitmap
      && !tab.previewMeta?.canvasSimplified;
    const needsLegacyCanvasGlyphRefresh = !!tab.previewMeta?.canvasSimplified
      && !tab.previewMeta?.canvasBitmap
      && typeof tab.previewMarkup === 'string'
      && tab.previewMarkup.includes('data-preview-canvas-simplified')
      && (tab.type === 'box' || tab.type === 'scatter');
    const shouldCapture = meta.forceCapture
      || !tab.previewMarkup
      || !tab.previewSignature
      || (payloadSignature && tab.previewSignature !== payloadSignature)
      || needsHybridRefresh
      || needsRenderCacheRefresh
      || needsLayoutRefresh
      || needsPlaceholderRefresh
      || needsLegacyCanvasGlyphRefresh;
    if (!shouldCapture) {
      console.debug('Debug: preview reuse', { tabId: tab.id, signature: tab.previewSignature, meta });
      return false;
    }
    const preview = captureWorkspacePreview(config, tab);
    if (preview && preview.markup) {
      tab.previewMarkup = preview.markup;
      tab.previewSignature = payloadSignature;
      tab.previewMeta = {
        width: preview.width,
        height: preview.height,
        size: preview.size,
        simplified: !!preview.simplified,
        canvasSimplified: !!preview.canvasSimplified,
        canvasBitmap: !!preview.canvasBitmap,
        hybrid: !!preview.hybrid,
        renderCacheSequence,
        layoutSignature,
        updatedAt: Date.now(),
        reason: meta.reason || 'capture'
      };
      syncTabPreviewIndicator(tab);
      console.debug('Debug: preview stored', {
        tabId: tab.id,
        signature: payloadSignature,
        width: preview.width,
        height: preview.height,
        size: preview.size,
        meta
      });
      return true;
    }
    const preserveExistingPreview = (String(meta?.reason || '').toLowerCase().startsWith('hover-inactive')) && !!tab.previewMarkup;
    if (preserveExistingPreview) {
      console.debug('Debug: preview capture failed, preserving existing preview', {
        tabId: tab.id,
        reason: meta?.reason || 'capture-failed'
      });
      return false;
    }
    if (tab.previewMarkup || tab.previewSignature || tab.previewMeta) {
      tab.previewMarkup = null;
      tab.previewSignature = null;
      tab.previewMeta = null;
      syncTabPreviewIndicator(tab);
      console.debug('Debug: preview cleared', { tabId: tab.id, reason: 'capture-failed', meta });
      return true;
    }
    console.debug('Debug: preview capture unavailable', { tabId: tab.id, meta });
    return false;
  }

  function ensureTabPreviewTooltipElement() {
    if (tabPreviewTooltipEl) {
      return tabPreviewTooltipEl;
    }
    const tooltip = document.createElement('div');
    tooltip.className = 'workspace-tab__preview-tooltip';
    tooltip.setAttribute('role', 'presentation');
    tooltip.style.position = 'fixed';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.background = '#ffffff';
    tooltip.style.border = '1px solid rgba(0, 0, 0, 0.15)';
    tooltip.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.18)';
    tooltip.style.padding = '8px';
    tooltip.style.borderRadius = '8px';
    tooltip.style.zIndex = '1200';
    tooltip.style.maxWidth = `${TAB_PREVIEW_TARGET_WIDTH + 24}px`;
    tooltip.style.transition = 'opacity 120ms ease-out';
    document.body.appendChild(tooltip);
    tabPreviewTooltipEl = tooltip;
    console.debug('Debug: preview tooltip element created');
    return tooltip;
  }

  function renderTabPreviewTooltipContent(tooltip, markup) {
    if (!tooltip) {
      return;
    }
    tooltip.innerHTML = '';
    if (!markup) {
      return;
    }
    const trimmed = typeof markup === 'string' ? markup.trim() : '';
    if (!trimmed) {
      return;
    }
    if (trimmed.startsWith('<svg')) {
      try {
        if (typeof DOMParser !== 'function') {
          tooltip.innerHTML = trimmed;
          return;
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(trimmed, 'image/svg+xml');
        const svg = doc?.documentElement;
        if (svg && svg.nodeName && svg.nodeName.toLowerCase() === 'svg') {
          const imported = document.importNode(svg, true);
          tooltip.appendChild(imported);
          return;
        }
      } catch (err) {
        console.debug('Debug: preview tooltip svg parse failed', { err: err?.message || String(err) });
      }
    }
    tooltip.innerHTML = trimmed;
  }

  function hideTabPreviewTooltip(reason = 'hide') {
    if (tabPreviewMeasureRaf) {
      cancelAnimationFrame(tabPreviewMeasureRaf);
      tabPreviewMeasureRaf = null;
    }
    if (!tabPreviewTooltipEl) {
      return;
    }
    tabPreviewTooltipEl.style.display = 'none';
    tabPreviewTooltipEl.style.opacity = '0';
    tabPreviewTooltipEl.innerHTML = '';
    tabPreviewTooltipEl.dataset.tabId = '';
    tabPreviewActiveId = null;
    tabPreviewLastAnchorRect = null;
    console.debug('Debug: preview tooltip hidden', { reason });
  }

  function positionTabPreviewTooltip(tab, rect) {
    if (!tabPreviewTooltipEl || !tab) {
      return;
    }
    const tooltip = tabPreviewTooltipEl;
    const tooltipWidth = tooltip.offsetWidth || (tab.previewMeta?.width || TAB_PREVIEW_TARGET_WIDTH);
    const tooltipHeight = tooltip.offsetHeight || (tab.previewMeta?.height || TAB_PREVIEW_MIN_HEIGHT);
    let left = rect ? rect.left + (rect.width / 2) - (tooltipWidth / 2) : 12;
    let top = rect ? rect.top - tooltipHeight - 12 : 12;
    if (rect && (top < 8 || (rect.top - tooltipHeight) < 8)) {
      top = rect.bottom + 12;
    }
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (left + tooltipWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - tooltipWidth - 8);
    }
    if (left < 8) {
      left = 8;
    }
    if (top + tooltipHeight > viewportHeight - 8) {
      top = Math.max(8, viewportHeight - tooltipHeight - 8);
    }
    if (top < 8) {
      top = 8;
    }
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.opacity = '1';
    console.debug('Debug: preview tooltip positioned', {
      tabId: tab.id,
      left: Math.round(left),
      top: Math.round(top),
      width: tooltipWidth,
      height: tooltipHeight
    });
  }

  function showTabPreviewTooltip(tab, anchorEl) {
    const tooltip = ensureTabPreviewTooltipElement();
    if (!tooltip || !tab || !anchorEl) {
      return;
    }
    renderTabPreviewTooltipContent(tooltip, tab.previewMarkup);
    tooltip.dataset.tabId = tab.id;
    tooltip.style.display = 'block';
    tooltip.style.opacity = '0';
    tabPreviewActiveId = tab.id;
    if (tabPreviewMeasureRaf) {
      cancelAnimationFrame(tabPreviewMeasureRaf);
    }
    const rect = typeof anchorEl.getBoundingClientRect === 'function'
      ? anchorEl.getBoundingClientRect()
      : null;
    tabPreviewLastAnchorRect = rect;
    tabPreviewMeasureRaf = requestAnimationFrame(() => {
      positionTabPreviewTooltip(tab, rect);
    });
  }

  function handleTabPreviewEnter(event, tab) {
    const session = Main.session;
    const workspaceState = session?.workspaceState;
    const components = Main.components;
    const resolvedTab = (() => {
      const tabId = tab?.id || null;
      if (!tabId || !Array.isArray(workspaceState?.tabs)) {
        return tab || null;
      }
      return workspaceState.tabs.find(item => item && item.id === tabId) || tab;
    })();
    if (!resolvedTab || resolvedTab.isWelcome || !resolvedTab.type) {
      hideTabPreviewTooltip('enter-invalid');
      return;
    }
    if (resolvedTab.isRenaming) {
      hideTabPreviewTooltip('renaming');
      return;
    }
    console.debug('Debug: preview hover enter', { tabId: resolvedTab.id, type: resolvedTab.type });
    const isActive = resolvedTab.id === workspaceState?.activeTabId;
    if (isActive) {
      hideTabPreviewTooltip('active-tab');
      console.debug('Debug: preview hover skipped for active tab', { tabId: resolvedTab.id, type: resolvedTab.type });
      return;
    }
    const config = components?.registry?.[resolvedTab.type];
    if (config) {
      updateTabPreviewFromWorkspace(resolvedTab, config, { reason: 'hover-inactive' });
      if (!resolvedTab.previewMarkup) {
        updateTabPreviewFromWorkspace(resolvedTab, config, {
          reason: 'hover-inactive-force',
          forceCapture: true
        });
      }
    }
    console.debug('Debug: preview hover using stored inactive preview', {
      tabId: resolvedTab.id,
      hasPreview: !!resolvedTab.previewMarkup
    });
    if (!resolvedTab.previewMarkup) {
      hideTabPreviewTooltip('no-preview');
      return;
    }
    if (tabPreviewActiveId === resolvedTab.id && tabPreviewTooltipEl && tabPreviewTooltipEl.style.display !== 'none') {
      console.debug('Debug: preview hover reuse tooltip', { tabId: resolvedTab.id });
      return;
    }
    const anchorEl = event?.currentTarget || event?.target || null;
    showTabPreviewTooltip(resolvedTab, anchorEl);
  }

  function handleTabPreviewLeave(reason = 'leave') {
    hideTabPreviewTooltip(reason);
  }

  namespace.captureWorkspacePreview = captureWorkspacePreview;
  namespace.syncTabPreviewIndicator = syncTabPreviewIndicator;
  namespace.updateTabPreviewFromWorkspace = updateTabPreviewFromWorkspace;
  namespace.ensureTabPreviewTooltipElement = ensureTabPreviewTooltipElement;
  namespace.hideTabPreviewTooltip = hideTabPreviewTooltip;
  namespace.showTabPreviewTooltip = showTabPreviewTooltip;
  namespace.handleTabPreviewEnter = handleTabPreviewEnter;
  namespace.handleTabPreviewLeave = handleTabPreviewLeave;
  namespace.constants = {
    TAB_PREVIEW_TARGET_WIDTH,
    TAB_PREVIEW_MIN_HEIGHT,
    TAB_PREVIEW_MAX_HEIGHT,
    TAB_PREVIEW_MAX_CHARS
  };
  console.debug('Debug: Main previews module initialized', { constants: namespace.constants });
})();
