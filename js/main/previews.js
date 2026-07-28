(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.previews = Main.previews || {};

  const TAB_PREVIEW_TARGET_WIDTH = 220;
  const TAB_PREVIEW_MIN_HEIGHT = 120;
  const TAB_PREVIEW_MAX_HEIGHT = 220;
  const TAB_PREVIEW_MAX_CHARS = 120000;
  const TAB_PREVIEW_NS = 'http://www.w3.org/2000/svg';

  let tabPreviewTooltipEl = null;
  let tabPreviewActiveId = null;
  let tabPreviewMeasureRaf = null;
  let tabPreviewLastAnchorRect = null;
  const tabPreviewPngRequests = new Map();

  function getElementTabToken(node) {
    let current = node || null;
    const doc = document || null;
    while (current && current !== doc && current.nodeType === 1) {
      const token = current.getAttribute?.('data-workspace-tab-id')
        || current.getAttribute?.('data-tab-id')
        || current.getAttribute?.('data-tab-token')
        || current.dataset?.workspaceTabId
        || current.dataset?.tabId
        || current.dataset?.tabToken
        || null;
      if (token) {
        return String(token);
      }
      current = current.parentElement || null;
    }
    return null;
  }

  function getActiveWorkspaceTabId() {
    try {
      return Main.session?.getActiveTab?.()?.id || null;
    } catch (_) {
      return null;
    }
  }

  function elementBelongsToTab(node, tab) {
    if (!node || !tab?.id) {
      return false;
    }
    const token = getElementTabToken(node);
    if (token) {
      return token === String(tab.id);
    }
    // Untagged component roots/SVGs are only safe when we are capturing the currently
    // active tab. Inactive same-component tabs must never reuse the active component's
    // untagged live DOM, because that is the root cause of duplicated reopened previews.
    const activeId = getActiveWorkspaceTabId();
    return !!(activeId && String(activeId) === String(tab.id));
  }

  function resolvePreviewRoot(config, tab) {
    const type = String(tab?.type || config?.type || '').trim();
    const mounted = window.Shared?.workspaceTabs?.getMountedRoot?.(tab || null, type) || null;
    if (mounted && typeof mounted.querySelector === 'function') {
      return mounted;
    }
    const candidates = [config?.activeElement, config?.element];
    for (const candidate of candidates) {
      if (candidate && typeof candidate.querySelector === 'function' && elementBelongsToTab(candidate, tab)) {
        return candidate;
      }
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
      || markup.includes('Preview too large')
      || markup.includes('Preview simplified')
      || markup.includes('Large dataset');
  }

  function hasUsableStoredPreview(tab) {
    const markup = typeof tab?.previewMarkup === 'string' ? tab.previewMarkup.trim() : '';
    if (!markup
      || isPreviewPlaceholderMarkup(markup)
      || tab?.previewMeta?.format === 'pending-png'
      || markup.includes('data-preview-canvas-bitmap')
      || markup.includes('data-preview-canvas-simplified')) {
      return false;
    }
    return markup.startsWith('<svg')
      || (markup.startsWith('<img') && markup.includes('data-tab-preview-format="png"'));
  }

  function parsePreviewViewBox(svg) {
    const viewBoxRaw = svg?.getAttribute ? svg.getAttribute('viewBox') : null;
    if (typeof viewBoxRaw !== 'string' || !viewBoxRaw.trim()) {
      return null;
    }
    const parts = viewBoxRaw.trim().split(/[\s,]+/).map(part => Number.parseFloat(part));
    if (parts.length !== 4 || !parts.every(num => Number.isFinite(num)) || parts[2] <= 0 || parts[3] <= 0) {
      return null;
    }
    return { minX: parts[0], minY: parts[1], boxW: parts[2], boxH: parts[3] };
  }

  function readPreviewSvgBBox(svg) {
    if (!svg || typeof svg.getBBox !== 'function') {
      return null;
    }
    try {
      const bbox = svg.getBBox();
      if (Number.isFinite(bbox?.x)
        && Number.isFinite(bbox?.y)
        && Number.isFinite(bbox?.width)
        && Number.isFinite(bbox?.height)
        && bbox.width > 0
        && bbox.height > 0) {
        return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
      }
    } catch (_err) {
      // Detached render-cache fragments cannot always be measured; fall back to their viewBox/attributes.
    }
    return null;
  }

  function resolvePreviewSizing(svg) {
    const parsedViewBox = parsePreviewViewBox(svg);
    let minX = Number.isFinite(parsedViewBox?.minX) ? parsedViewBox.minX : 0;
    let minY = Number.isFinite(parsedViewBox?.minY) ? parsedViewBox.minY : 0;
    let boxW = Number.isFinite(parsedViewBox?.boxW) && parsedViewBox.boxW > 0 ? parsedViewBox.boxW : NaN;
    let boxH = Number.isFinite(parsedViewBox?.boxH) && parsedViewBox.boxH > 0 ? parsedViewBox.boxH : NaN;

    let widthAttr = Number.parseFloat(svg?.getAttribute ? svg.getAttribute('width') : NaN);
    let heightAttr = Number.parseFloat(svg?.getAttribute ? svg.getAttribute('height') : NaN);
    if (!Number.isFinite(widthAttr) || widthAttr <= 0) {
      widthAttr = Number.isFinite(boxW) && boxW > 0 ? boxW : TAB_PREVIEW_TARGET_WIDTH;
    }
    if (!Number.isFinite(heightAttr) || heightAttr <= 0) {
      heightAttr = Number.isFinite(boxH) && boxH > 0 ? boxH : widthAttr * 0.68;
    }
    if (!Number.isFinite(boxW) || boxW <= 0) {
      boxW = widthAttr;
    }
    if (!Number.isFinite(boxH) || boxH <= 0) {
      boxH = heightAttr;
    }

    const bbox = readPreviewSvgBBox(svg);
    if (bbox) {
      const padding = 2;
      const baseMinX = Number.isFinite(minX) ? minX : 0;
      const baseMinY = Number.isFinite(minY) ? minY : 0;
      const baseMaxX = baseMinX + (Number.isFinite(boxW) && boxW > 0 ? boxW : widthAttr);
      const baseMaxY = baseMinY + (Number.isFinite(boxH) && boxH > 0 ? boxH : heightAttr);
      const bboxMinX = bbox.x - padding;
      const bboxMinY = bbox.y - padding;
      const bboxMaxX = bbox.x + bbox.width + padding;
      const bboxMaxY = bbox.y + bbox.height + padding;
      minX = Math.min(baseMinX, bboxMinX);
      minY = Math.min(baseMinY, bboxMinY);
      boxW = Math.max(1, Math.max(baseMaxX, bboxMaxX) - minX);
      boxH = Math.max(1, Math.max(baseMaxY, bboxMaxY) - minY);
    }

    const ratio = boxW > 0 ? Math.max(0.25, Math.min(boxH / boxW, 3)) : 0.68;
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
    if (Number.isFinite(sizing.boxW) && sizing.boxW > 0 && Number.isFinite(sizing.boxH) && sizing.boxH > 0) {
      svg.setAttribute('viewBox', `${Number.isFinite(sizing.minX) ? sizing.minX : 0} ${Number.isFinite(sizing.minY) ? sizing.minY : 0} ${sizing.boxW} ${sizing.boxH}`);
    }
  }

  function ensurePreviewBackground(svg, sizing) {
    if (!svg || svg.querySelector('[data-preview-bg="true"]')) {
      return;
    }
    const schemeId = String(svg.getAttribute?.('data-color-scheme') || '').trim().toLowerCase();
    const explicitBg = String(svg.getAttribute?.('data-color-scheme-bg-color') || '').trim();
    const isDark = schemeId === 'dark';
    const previewBg = isDark ? (explicitBg || '#000000') : '#ffffff';
    const rect = document.createElementNS(TAB_PREVIEW_NS, 'rect');
    rect.setAttribute('x', String(Number.isFinite(sizing.minX) ? sizing.minX : 0));
    rect.setAttribute('y', String(Number.isFinite(sizing.minY) ? sizing.minY : 0));
    rect.setAttribute('width', Number.isFinite(sizing.boxW) ? String(sizing.boxW) : '100%');
    rect.setAttribute('height', Number.isFinite(sizing.boxH) ? String(sizing.boxH) : '100%');
    rect.setAttribute('fill', previewBg);
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

  function getRenderCacheSequence(tab) {
    const seq = Number(tab?.renderCache?.captureSequence);
    return Number.isFinite(seq) && seq > 0 ? seq : 0;
  }

  function buildPngPreviewMarkup(dataUrl, tab, sizing) {
    if (!dataUrl || !tab?.id || !sizing) {
      return '';
    }
    const escapedUrl = String(dataUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const escapedTabId = String(tab.id).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const escapedType = String(tab.type || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `<img src="${escapedUrl}" width="${sizing.targetWidth}" height="${sizing.targetHeight}" alt="" data-tab-preview-format="png" data-preview-owner-tab-id="${escapedTabId}" data-preview-component="${escapedType}">`;
  }

  function resolveCurrentPreviewOwner(tab) {
    const tabs = Main.session?.workspaceState?.tabs;
    if (!tab?.id || !Array.isArray(tabs)) {
      return tab || null;
    }
    return tabs.find(candidate => candidate?.id === tab.id) || null;
  }

  function previewRequestStillMatches(tab, request) {
    const currentTab = resolveCurrentPreviewOwner(tab);
    return !!(
      currentTab === tab
      && currentTab.type === request.type
      && (currentTab.payloadSignature || null) === request.payloadSignature
      && (currentTab.layoutSignature || null) === request.layoutSignature
      && Number(currentTab.payloadVersion || 0) === request.payloadVersion
      && Number(currentTab.layoutVersion || 0) === request.layoutVersion
      && tabPreviewPngRequests.get(tab.id)?.id === request.id
    );
  }

  function updateVisiblePreviewTooltip(tab, markup) {
    if (!tabPreviewTooltipEl
      || tabPreviewTooltipEl.dataset.tabId !== tab.id
      || tabPreviewTooltipEl.style.display === 'none') {
      return;
    }
    renderTabPreviewTooltipContent(tabPreviewTooltipEl, markup);
    if (tabPreviewMeasureRaf) {
      cancelAnimationFrame(tabPreviewMeasureRaf);
    }
    tabPreviewMeasureRaf = requestAnimationFrame(() => {
      positionTabPreviewTooltip(tab, tabPreviewLastAnchorRect);
    });
  }

  function schedulePngPreviewCapture(tab, svg, sizing, meta = {}) {
    const Shared = window.Shared || {};
    const exporter = Shared.exporter;
    if (!tab
      || !svg
      || !exporter
      || typeof exporter.svgElementToPngBlob !== 'function'
      || typeof exporter.blobToDataUrl !== 'function') {
      return false;
    }
    const request = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tab,
      type: tab.type || null,
      payloadSignature: meta.payloadSignature ?? tab.payloadSignature ?? null,
      layoutSignature: meta.layoutSignature ?? tab.layoutSignature ?? null,
      payloadVersion: Number(meta.payloadVersion ?? tab.payloadVersion ?? 0),
      layoutVersion: Number(meta.layoutVersion ?? tab.layoutVersion ?? 0),
      renderCacheSequence: Number(meta.renderCacheSequence ?? getRenderCacheSequence(tab)),
      sizing,
      reason: meta.reason || 'png'
    };
    const existing = tabPreviewPngRequests.get(tab.id);
    if (existing
      && existing.payloadSignature === request.payloadSignature
      && existing.layoutSignature === request.layoutSignature
      && existing.payloadVersion === request.payloadVersion
      && existing.layoutVersion === request.layoutVersion
      && existing.renderCacheSequence === request.renderCacheSequence) {
      return true;
    }
    tabPreviewPngRequests.set(tab.id, request);
    request.promise = new Promise(resolve => setTimeout(resolve, 0))
      .then(async () => {
        if (!previewRequestStillMatches(tab, request)) {
          return null;
        }
        const fontsReady = svg.ownerDocument?.fonts?.ready;
        if (fontsReady && typeof fontsReady.then === 'function') {
          await fontsReady;
        }
        if (!previewRequestStillMatches(tab, request)) {
          return null;
        }
        return exporter.svgElementToPngBlob(svg, {
          pngScale: 1,
          backgroundColor: '#ffffff',
          contextLabel: `tab-preview-${tab.type || 'unknown'}`
        });
      })
      .then(blob => blob ? exporter.blobToDataUrl(blob) : null)
      .then(dataUrl => {
        if (!dataUrl || !previewRequestStillMatches(tab, request)) {
          return false;
        }
        const markup = buildPngPreviewMarkup(dataUrl, tab, sizing);
        if (!markup) {
          return false;
        }
        tab.previewMarkup = markup;
        tab.previewSignature = request.payloadSignature;
        tab.previewMeta = {
          width: sizing.targetWidth,
          height: sizing.targetHeight,
          size: markup.length,
          format: 'png',
          rasterized: true,
          renderCacheSequence: getRenderCacheSequence(tab),
          layoutSignature: request.layoutSignature,
          payloadVersion: request.payloadVersion,
          layoutVersion: request.layoutVersion,
          updatedAt: Date.now(),
          reason: request.reason
        };
        syncTabPreviewIndicator(tab);
        updateVisiblePreviewTooltip(tab, markup);
        try {
          Main.session?.markTabRenderCommitted?.(tab, { reason: request.reason });
        } catch (err) {
          console.debug('Debug: PNG preview render commit mark skipped', {
            tabId: tab.id,
            type: tab.type,
            message: err?.message || String(err)
          });
        }
        console.debug('Debug: PNG preview stored', {
          tabId: tab.id,
          type: tab.type,
          length: markup.length,
          width: sizing.targetWidth,
          height: sizing.targetHeight
        });
        return true;
      })
      .catch(err => {
        console.debug('Debug: PNG preview error', {
          tabId: tab.id,
          type: tab.type,
          message: err?.message || String(err)
        });
        return false;
      })
      .finally(() => {
        if (tabPreviewPngRequests.get(tab.id)?.id === request.id) {
          tabPreviewPngRequests.delete(tab.id);
        }
      });
    tabPreviewPngRequests.set(tab.id, request);
    return true;
  }

  async function awaitPendingCaptures(tabIds = null) {
    const filter = Array.isArray(tabIds) ? new Set(tabIds.map(String)) : null;
    while (true) {
      const pending = Array.from(tabPreviewPngRequests.entries())
        .filter(([tabId]) => !filter || filter.has(String(tabId)))
        .map(([, request]) => request.promise)
        .filter(Boolean);
      if (!pending.length) {
        return;
      }
      await Promise.allSettled(pending);
    }
  }

  function captureWorkspacePreview(config, tab, meta = {}) {
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
    const rejectGetterSvgIfNotTabOwned = () => {
      if (!svg || !svgFromGetter) {
        return;
      }
      const insideRoot = rootContainsSvg(svg);
      const token = getElementTabToken(svg);
      const tokenMatches = !!(token && tab?.id && token === String(tab.id));
      const safeWithoutRoot = !previewRoot && elementBelongsToTab(svg, tab);
      if (!insideRoot && !tokenMatches && !safeWithoutRoot) {
        console.debug('Debug: preview getter svg ignored outside target tab', {
          type: config.type,
          tabId: tab?.id || null,
          candidateToken: token || null,
          hasPreviewRoot: !!previewRoot
        });
        svg = null;
        svgFromGetter = false;
      }
    };
    rejectGetterSvgIfNotTabOwned();
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
      if (tab?.previewMarkup && shouldPreserveExistingPreviewWithoutLiveSource(tab, meta, { hasLivePreviewSource: false })) {
        console.debug('Debug: preview cache fallback skipped to preserve existing preview', {
          tabId: tab?.id || null,
          type: config.type,
          reason: meta?.reason || 'no-svg-preserve'
        });
        return null;
      }
      svg = resolvePreviewSvgFromTabRenderCache(tab, config.type);
      if (!svg) {
        return null;
      }
    }
    const rawMarkup = typeof svg.innerHTML === 'string' ? svg.innerHTML.trim() : '';
    if (!rawMarkup) {
      console.debug('Debug: preview capture skipped', { reason: 'empty-svg', type: config.type, tabId: tab?.id || null });
      if (tab?.previewMarkup && shouldPreserveExistingPreviewWithoutLiveSource(tab, meta, { hasLivePreviewSource: false })) {
        console.debug('Debug: preview cache fallback skipped to preserve existing preview', {
          tabId: tab?.id || null,
          type: config.type,
          reason: meta?.reason || 'empty-svg-preserve'
        });
        return null;
      }
      const cacheSvg = resolvePreviewSvgFromTabRenderCache(tab, config.type);
      if (!cacheSvg) {
        return null;
      }
      svg = cacheSvg;
    }
    const sizing = resolvePreviewSizing(svg);
    const clone = svg.cloneNode(true);
    applyPreviewSizing(clone, sizing);
    ensurePreviewBackground(clone, sizing);
    ensurePreviewImageLinks(clone);
    const serializer = new XMLSerializer();
    const markup = serializer.serializeToString(clone);
    if (!markup) {
      console.debug('Debug: preview capture skipped', { reason: 'serialize-empty', type: config.type, tabId: tab?.id || null });
      return null;
    }
    const hasCanvas = !!svg.querySelector?.('canvas, foreignObject[data-point-renderer], foreignobject[data-point-renderer]');
    const hasArchivedCanvasBitmap = !!svg.querySelector?.(
      '[data-graphitix-render-cache-canvas-bitmap="true"], [data-preview-canvas-bitmap="true"]'
    );
    if (hasCanvas || hasArchivedCanvasBitmap || markup.length > TAB_PREVIEW_MAX_CHARS) {
      const reason = hasCanvas || hasArchivedCanvasBitmap ? 'canvas-backed-svg' : 'oversized-svg';
      const scheduled = schedulePngPreviewCapture(tab, svg, sizing, {
        reason,
        payloadSignature: tab?.payloadSignature || null,
        layoutSignature: tab?.layoutSignature || null,
        payloadVersion: Number(tab?.payloadVersion || 0),
        layoutVersion: Number(tab?.layoutVersion || 0),
        renderCacheSequence: getRenderCacheSequence(tab)
      });
      const placeholder = buildPreviewPlaceholder(sizing.targetWidth, sizing.targetHeight, {
        message: scheduled ? 'Preparing preview' : 'Preview too large',
        detail: scheduled ? 'Rendering image' : 'Large dataset'
      });
      if (placeholder) {
        console.debug('Debug: PNG preview scheduled', {
          tabId: tab?.id || null,
          type: config.type,
          sourceLength: markup.length,
          scheduled,
          reason
        });
        return {
          markup: placeholder,
          width: sizing.targetWidth,
          height: sizing.targetHeight,
          size: placeholder.length,
          pendingPng: scheduled
        };
      }
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
      format: 'svg'
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
    const cacheOwnerTabId = cache.__graphitixRenderCache?.tabId || null;
    const cacheOwnerType = cache.__graphitixRenderCache?.component || cache.__graphitixRenderCache?.type || null;
    if (cacheOwnerTabId && tab?.id && String(cacheOwnerTabId) !== String(tab.id)) {
      console.debug('Debug: preview cache fallback rejected owner mismatch', {
        tabId: tab.id,
        type: type || null,
        cacheOwnerTabId
      });
      return null;
    }
    if (cacheOwnerType && type && String(cacheOwnerType) !== String(type)) {
      console.debug('Debug: preview cache fallback rejected type mismatch', {
        tabId: tab?.id || null,
        type: type || null,
        cacheOwnerType
      });
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
    const metaGraphicKey = typeof cache.__graphitixRenderCache?.graphicKey === 'string'
      ? cache.__graphitixRenderCache.graphicKey
      : null;
    const fromGraphicKey = metaGraphicKey ? fromFragment(cache[metaGraphicKey]) : null;
    if(fromGraphicKey && typeof fromGraphicKey.innerHTML === 'string' && fromGraphicKey.innerHTML.trim()){
      console.debug('Debug: preview cache svg reconstructed', { tabId: tab?.id || null, type: type || null, source: `metadata-${metaGraphicKey}` });
      return fromGraphicKey;
    }
    const previewSvg = fromFragment(cache.preview || cache.graph);
    if (previewSvg && typeof previewSvg.innerHTML === 'string' && previewSvg.innerHTML.trim()) {
      console.debug('Debug: preview cache svg reconstructed', { tabId: tab?.id || null, type: type || null, source: cache.preview ? 'preview-fragment' : 'graph-fragment' });
      return previewSvg;
    }
    const svgCacheSvg = fromFragment(cache.svg);
    if (svgCacheSvg && typeof svgCacheSvg.innerHTML === 'string' && svgCacheSvg.innerHTML.trim()) {
      console.debug('Debug: preview cache svg reconstructed', { tabId: tab?.id || null, type: type || null, source: 'svg-fragment' });
      return svgCacheSvg;
    }
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

  function previewSvgHasRenderableContent(svg) {
    if (!svg || String(svg.nodeName || '').toLowerCase() !== 'svg') {
      return false;
    }
    const inner = typeof svg.innerHTML === 'string' ? svg.innerHTML.trim() : '';
    if (inner) {
      return true;
    }
    const childCount = Number(svg.childNodes?.length || 0);
    return childCount > 0;
  }

  function isPreviewRefreshSafeWithoutLiveSource(meta = {}) {
    const reason = String(meta?.reason || '').toLowerCase();
    return reason.startsWith('hover-inactive')
      || reason.includes('activate-switch')
      || reason.includes('deactivate')
      || reason.includes('persist-active')
      || reason.includes('workspace-view')
      || reason.includes('recovery-interval')
      || reason.includes('archive-snapshot')
      || reason.includes('archive-save')
      || reason.includes('save')
      || reason.includes('snapshot')
      || reason.includes('reopen')
      || reason.includes('load')
      || reason.includes('regression');
  }

  function shouldPreserveExistingPreviewWithoutLiveSource(tab, meta = {}, details = {}) {
    if (!tab?.previewMarkup) {
      return false;
    }
    if (details?.hasLivePreviewSource) {
      return false;
    }
    // Force captures are still allowed for active tabs with a real live SVG. When there is no
    // tab-owned live SVG, falling back to a component/render cache can silently copy the previous
    // same-component tab's graph into this tab's preview. Preserve the already serialized preview
    // instead. This is especially important after reopening a .graph file where each tab already
    // carries an authoritative preview from the archive.
    return isPreviewRefreshSafeWithoutLiveSource(meta);
  }

  function hasComponentAwarePreviewReadiness(tab, config, session) {
    if (!tab || !config) {
      return false;
    }
    if (typeof config.isPreviewReady === 'function') {
      try {
        if (config.isPreviewReady(tab) === true) {
          return true;
        }
      } catch (err) {
        console.debug('Debug: preview readiness hook failed', {
          tabId: tab?.id || null,
          type: tab?.type || null,
          message: err?.message || String(err)
        });
      }
    }
    const hasRenderState = !!(
      tab.renderCache
      || tab.archiveRenderCache
      || tab.previewMarkup
      || tab.payloadSignature
      || tab.layoutSignature
    );
    if (hasRenderState) {
      return true;
    }
    return !!session?.tabHasTableData?.(tab);
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
      : !!(hasComponentAwarePreviewReadiness(tab, config, session) || hasStableTabState);
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
        if (tab.previewMarkup && meta?.allowPreviewClear !== true) {
          console.debug('Debug: preview no-data capture preserved existing preview', {
            tabId: tab.id,
            type: tab.type,
            reason: meta?.reason || 'no-data-preserve-existing'
          });
          syncTabPreviewIndicator(tab);
          return false;
        }
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
    const previewRoot = resolvePreviewRoot(config, tab);
    const rootSvg = previewRoot?.querySelector?.('.svgbox svg') || null;
    const liveSvg = typeof config.getPreviewSvg === 'function'
      ? (() => {
          try {
            const candidate = config.getPreviewSvg(tab) || null;
            if (!candidate) {
              return null;
            }
            // Component getters are often backed by the currently bound module instance.
            // For inactive same-component tabs, the getter can point at the wrong tab.
            // Accept it only when it belongs to the mounted root for this tab, or when no
            // mounted root is available and the SVG carries this tab's token.
            const insidePreviewRoot = !!(previewRoot && typeof previewRoot.contains === 'function' && previewRoot.contains(candidate));
            const token = getElementTabToken(candidate);
            const tokenMatches = !!(token && String(token) === String(tab.id));
            const safeWithoutRoot = !previewRoot && elementBelongsToTab(candidate, tab);
            if (!insidePreviewRoot && !tokenMatches && !safeWithoutRoot) {
              console.debug('Debug: preview live svg ignored outside tab root', {
                type: config.type,
                tabId: tab.id,
                candidateToken: token || null,
                hasPreviewRoot: !!previewRoot
              });
              return null;
            }
            return candidate;
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
    const hasLivePreviewSource = previewSvgHasRenderableContent(rootSvg) || previewSvgHasRenderableContent(liveSvg);
    const renderCacheSequence = getRenderCacheSequence(tab);
    const payloadVersion = Number(tab.payloadVersion || 0);
    const layoutVersion = Number(tab.layoutVersion || 0);
    const needsRenderCacheRefresh = renderCacheSequence > 0
      && Number(tab.previewMeta?.renderCacheSequence || 0) !== renderCacheSequence;
    const needsLayoutRefresh = layoutSignature
      && tab.previewMeta?.layoutSignature !== layoutSignature;
    const needsPayloadVersionRefresh = Number(tab.previewMeta?.payloadVersion || 0) !== payloadVersion;
    const needsLayoutVersionRefresh = Number(tab.previewMeta?.layoutVersion || 0) !== layoutVersion;
    const needsPlaceholderRefresh = isPreviewPlaceholderMarkup(tab.previewMarkup)
      && hasLivePreviewSource
      && !tabPreviewPngRequests.has(tab.id);
    const needsLegacyMixedPreviewRefresh = !!tab.previewMarkup
      && tab.previewMeta?.format !== 'png'
      && (
        tab.previewMarkup.includes('data-preview-canvas-bitmap')
        || tab.previewMarkup.includes('data-preview-canvas-simplified')
        || tab.previewMeta?.hybrid
        || tab.previewMeta?.canvasBitmap
        || tab.previewMeta?.canvasSimplified
      );
    const shouldCapture = meta.forceCapture
      || !tab.previewMarkup
      || !tab.previewSignature
      || (payloadSignature && tab.previewSignature !== payloadSignature)
      || needsRenderCacheRefresh
      || needsLayoutRefresh
      || needsPayloadVersionRefresh
      || needsLayoutVersionRefresh
      || needsPlaceholderRefresh
      || needsLegacyMixedPreviewRefresh;
    if (shouldCapture && shouldPreserveExistingPreviewWithoutLiveSource(tab, meta, { hasLivePreviewSource })) {
      console.debug('Debug: preview refresh skipped to preserve existing tab preview', {
        tabId: tab.id,
        type: tab.type,
        reason: meta?.reason || 'preserve-existing-no-live-source',
        needsRenderCacheRefresh,
        needsLayoutRefresh,
        needsPlaceholderRefresh,
        forceCapture: !!meta.forceCapture
      });
      return false;
    }
    if (!shouldCapture) {
      console.debug('Debug: preview reuse', { tabId: tab.id, signature: tab.previewSignature, meta });
      return false;
    }
    const preview = captureWorkspacePreview(config, tab, meta);
    if (preview && preview.markup) {
      tab.previewMarkup = preview.markup;
      tab.previewSignature = payloadSignature;
      tab.previewMeta = {
        width: preview.width,
        height: preview.height,
        size: preview.size,
        format: preview.format || (preview.pendingPng ? 'pending-png' : 'svg'),
        pendingPng: !!preview.pendingPng,
        renderCacheSequence,
        layoutSignature,
        payloadVersion,
        layoutVersion,
        updatedAt: Date.now(),
        reason: meta.reason || 'capture'
      };
      try {
        session?.markTabRenderCommitted?.(tab, { reason: meta.reason || 'preview-capture' });
      } catch (err) {
        console.debug('Debug: preview render commit mark skipped', {
          tabId: tab.id,
          type: tab.type,
          message: err?.message || String(err)
        });
      }
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
    const preserveExistingPreview = !!tab.previewMarkup && meta?.allowPreviewClear !== true;
    if (preserveExistingPreview) {
      console.debug('Debug: preview capture failed, preserving existing preview', {
        tabId: tab.id,
        type: tab.type,
        reason: meta?.reason || 'capture-failed'
      });
      syncTabPreviewIndicator(tab);
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
    tooltip.style.boxSizing = 'border-box';
    tooltip.style.maxWidth = `${TAB_PREVIEW_TARGET_WIDTH + 18}px`;
    tooltip.style.maxHeight = `${TAB_PREVIEW_MAX_HEIGHT + 18}px`;
    tooltip.style.overflow = 'hidden';
    tooltip.style.transition = 'opacity 120ms ease-out';
    document.body.appendChild(tooltip);
    tabPreviewTooltipEl = tooltip;
    console.debug('Debug: preview tooltip element created');
    return tooltip;
  }

  function readTooltipSvgSize(svg) {
    const width = Number.parseFloat(svg?.getAttribute?.('width'));
    const height = Number.parseFloat(svg?.getAttribute?.('height'));
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return { width, height };
    }
    const parsedViewBox = parsePreviewViewBox(svg);
    if (Number.isFinite(parsedViewBox?.boxW) && parsedViewBox.boxW > 0 && Number.isFinite(parsedViewBox?.boxH) && parsedViewBox.boxH > 0) {
      return { width: parsedViewBox.boxW, height: parsedViewBox.boxH };
    }
    return { width: TAB_PREVIEW_TARGET_WIDTH, height: TAB_PREVIEW_MIN_HEIGHT };
  }

  function fitTooltipPreviewSvg(svg) {
    if (!svg || !svg.style) {
      return;
    }
    const size = readTooltipSvgSize(svg);
    const maxWidth = TAB_PREVIEW_TARGET_WIDTH;
    const maxHeight = TAB_PREVIEW_MAX_HEIGHT;
    const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height);
    const targetWidth = Math.max(1, Math.round(size.width * scale));
    const targetHeight = Math.max(1, Math.round(size.height * scale));
    svg.style.display = 'block';
    svg.style.width = `${targetWidth}px`;
    svg.style.height = `${targetHeight}px`;
    svg.style.maxWidth = `${maxWidth}px`;
    svg.style.maxHeight = `${maxHeight}px`;
    svg.style.flex = '0 0 auto';
  }

  function fitTooltipPreviewImage(img) {
    if (!img?.style) {
      return;
    }
    const width = Number.parseFloat(img.getAttribute?.('width')) || TAB_PREVIEW_TARGET_WIDTH;
    const height = Number.parseFloat(img.getAttribute?.('height')) || TAB_PREVIEW_MIN_HEIGHT;
    const scale = Math.min(1, TAB_PREVIEW_TARGET_WIDTH / width, TAB_PREVIEW_MAX_HEIGHT / height);
    img.style.display = 'block';
    img.style.width = `${Math.max(1, Math.round(width * scale))}px`;
    img.style.height = `${Math.max(1, Math.round(height * scale))}px`;
    img.style.maxWidth = `${TAB_PREVIEW_TARGET_WIDTH}px`;
    img.style.maxHeight = `${TAB_PREVIEW_MAX_HEIGHT}px`;
    img.style.objectFit = 'contain';
    img.style.flex = '0 0 auto';
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
          const fallbackSvg = tooltip.querySelector?.('svg') || null;
          fitTooltipPreviewSvg(fallbackSvg);
          return;
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(trimmed, 'image/svg+xml');
        const svg = doc?.documentElement;
        if (svg && svg.nodeName && svg.nodeName.toLowerCase() === 'svg') {
          const imported = document.importNode(svg, true);
          fitTooltipPreviewSvg(imported);
          tooltip.appendChild(imported);
          return;
        }
      } catch (err) {
        console.debug('Debug: preview tooltip svg parse failed', { err: err?.message || String(err) });
      }
    }
    tooltip.innerHTML = trimmed;
    const svg = tooltip.querySelector?.('svg') || null;
    fitTooltipPreviewSvg(svg);
    fitTooltipPreviewImage(tooltip.querySelector?.('img[data-tab-preview-format="png"]') || null);
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
  namespace.awaitPendingCaptures = awaitPendingCaptures;
  namespace.hasUsableStoredPreview = hasUsableStoredPreview;
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
