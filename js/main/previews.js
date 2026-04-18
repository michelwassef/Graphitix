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

  let tabPreviewTooltipEl = null;
  let tabPreviewActiveId = null;
  let tabPreviewMeasureRaf = null;
  let tabPreviewLastAnchorRect = null;
  const tabPreviewHybridRequests = new Map();

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
    if (!svg.hasAttribute('preserveAspectRatio')) {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
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
    if (!config || !config.element) {
      console.debug('Debug: preview capture skipped', { reason: 'no-config-element', type: config?.type || null, tabId: tab?.id || null });
      return null;
    }
    let svg = null;
    if (typeof config.getPreviewSvg === 'function') {
      try {
        svg = config.getPreviewSvg(tab) || null;
      } catch (err) {
        console.debug('Debug: preview getPreviewSvg failed', {
          type: config.type,
          tabId: tab?.id || null,
          message: err?.message || String(err)
        });
      }
    }
    if (!svg) {
      svg = config.element.querySelector('.svgbox svg');
    }
    if (!svg) {
      const tagged = config.element.querySelector('svg[data-preview-source="true"]');
      if (tagged) {
        svg = tagged;
      } else {
        const candidates = Array.from(config.element.querySelectorAll('svg'));
        svg = candidates.find(node => !node.closest('.workspace-toolbar')) || candidates[0] || null;
      }
    }
    if (!svg) {
      console.debug('Debug: preview capture skipped', { reason: 'no-svg', type: config.type, tabId: tab?.id || null });
      return null;
    }
    const rawMarkup = typeof svg.innerHTML === 'string' ? svg.innerHTML.trim() : '';
    if (!rawMarkup) {
      console.debug('Debug: preview capture skipped', { reason: 'empty-svg', type: config.type, tabId: tab?.id || null });
      return null;
    }
    const sizing = resolvePreviewSizing(svg);
    const forceHybrid = shouldForceHybridPreviewCapture(svg, config.type);
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
    const clone = svg.cloneNode(true);
    applyPreviewSizing(clone, sizing);
    ensurePreviewBackground(clone, sizing);
    const serializer = new XMLSerializer();
    let markup = serializer.serializeToString(clone);
    let previewSimplified = false;
    if (!markup) {
      console.debug('Debug: preview capture skipped', { reason: 'serialize-empty', type: config.type, tabId: tab?.id || null });
      return null;
    }
    if (markup.length > TAB_PREVIEW_MAX_CHARS) {
      console.debug('Debug: preview oversize detected', { length: markup.length, type: config.type, tabId: tab?.id || null });
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
    return { markup, width: sizing.targetWidth, height: sizing.targetHeight, size: markup.length, simplified: previewSimplified };
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
    const hasData = meta.forceCapture ? true : session?.tabHasTableData?.(tab);
    if (!hasData) {
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
    const renderCacheSequence = getRenderCacheSequence(tab);
    const needsHybridRefresh = shouldForceHybridPreviewCapture(liveSvg || config.element?.querySelector?.('.svgbox svg') || null, config.type)
      && !tab.previewMeta?.hybrid;
    const needsRenderCacheRefresh = renderCacheSequence > 0
      && Number(tab.previewMeta?.renderCacheSequence || 0) !== renderCacheSequence;
    const shouldCapture = meta.forceCapture
      || !tab.previewMarkup
      || !tab.previewSignature
      || (payloadSignature && tab.previewSignature !== payloadSignature)
      || needsHybridRefresh
      || needsRenderCacheRefresh;
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
        hybrid: !!preview.hybrid,
        renderCacheSequence,
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
    if (!tab || tab.isWelcome || !tab.type) {
      hideTabPreviewTooltip('enter-invalid');
      return;
    }
    if (tab.isRenaming) {
      hideTabPreviewTooltip('renaming');
      return;
    }
    console.debug('Debug: preview hover enter', { tabId: tab.id, type: tab.type });
    const isActive = tab.id === workspaceState?.activeTabId;
    if (isActive) {
      const config = components?.registry?.[tab.type];
      if (config) {
        updateTabPreviewFromWorkspace(tab, config, { reason: 'hover-active', forceCapture: true });
      }
      hideTabPreviewTooltip('active-tab');
      console.debug('Debug: preview hover suppressed for active tab', { tabId: tab.id });
      return;
    }
    const config = components?.registry?.[tab.type];
    if (config) {
      updateTabPreviewFromWorkspace(tab, config, { reason: 'hover-inactive' });
    }
    if (!tab.previewMarkup) {
      hideTabPreviewTooltip('no-preview');
      return;
    }
    if (tabPreviewActiveId === tab.id && tabPreviewTooltipEl && tabPreviewTooltipEl.style.display !== 'none') {
      console.debug('Debug: preview hover reuse tooltip', { tabId: tab.id });
      return;
    }
    const anchorEl = event?.currentTarget || event?.target || null;
    showTabPreviewTooltip(tab, anchorEl);
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
