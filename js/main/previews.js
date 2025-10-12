(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.previews = Main.previews || {};

  const TAB_PREVIEW_TARGET_WIDTH = 220;
  const TAB_PREVIEW_MIN_HEIGHT = 120;
  const TAB_PREVIEW_MAX_HEIGHT = 220;
  const TAB_PREVIEW_MAX_CHARS = 120000;

  let tabPreviewTooltipEl = null;
  let tabPreviewActiveId = null;
  let tabPreviewMeasureRaf = null;

  function captureWorkspacePreview(config, tab) {
    if (!config || !config.element) {
      console.debug('Debug: preview capture skipped', { reason: 'no-config-element', type: config?.type || null, tabId: tab?.id || null });
      return null;
    }
    let svg = config.element.querySelector('.svgbox svg');
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
    const clone = svg.cloneNode(true);
    const viewBoxRaw = clone.getAttribute('viewBox');
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
    let widthAttr = Number.parseFloat(clone.getAttribute('width'));
    let heightAttr = Number.parseFloat(clone.getAttribute('height'));
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
    clone.setAttribute('width', String(targetWidth));
    clone.setAttribute('height', String(targetHeight));
    if (!clone.hasAttribute('preserveAspectRatio')) {
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    if (!clone.hasAttribute('viewBox') && Number.isFinite(boxW) && Number.isFinite(boxH)) {
      clone.setAttribute('viewBox', `${Number.isFinite(minX) ? minX : 0} ${Number.isFinite(minY) ? minY : 0} ${boxW} ${boxH}`);
    }
    if (!clone.querySelector('[data-preview-bg="true"]')) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(Number.isFinite(minX) ? minX : 0));
      rect.setAttribute('y', String(Number.isFinite(minY) ? minY : 0));
      rect.setAttribute('width', Number.isFinite(boxW) ? String(boxW) : '100%');
      rect.setAttribute('height', Number.isFinite(boxH) ? String(boxH) : '100%');
      rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('data-preview-bg', 'true');
      let insertTarget = clone.firstChild;
      while (insertTarget && insertTarget.nodeType === 1 && insertTarget.nodeName.toLowerCase() === 'defs') {
        insertTarget = insertTarget.nextSibling;
      }
      if (insertTarget) {
        clone.insertBefore(rect, insertTarget);
      } else {
        clone.appendChild(rect);
      }
    }
    const serializer = new XMLSerializer();
    const markup = serializer.serializeToString(clone);
    if (!markup) {
      console.debug('Debug: preview capture skipped', { reason: 'serialize-empty', type: config.type, tabId: tab?.id || null });
      return null;
    }
    if (markup.length > TAB_PREVIEW_MAX_CHARS) {
      console.debug('Debug: preview capture skipped', { reason: 'oversize', length: markup.length, type: config.type, tabId: tab?.id || null });
      return null;
    }
    console.debug('Debug: preview capture success', {
      tabId: tab?.id || null,
      type: config.type,
      length: markup.length,
      width: targetWidth,
      height: targetHeight
    });
    return { markup, width: targetWidth, height: targetHeight, size: markup.length };
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
    const shouldCapture = meta.forceCapture
      || !tab.previewMarkup
      || !tab.previewSignature
      || (payloadSignature && tab.previewSignature !== payloadSignature);
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
    console.debug('Debug: preview tooltip hidden', { reason });
  }

  function showTabPreviewTooltip(tab, anchorEl) {
    const tooltip = ensureTabPreviewTooltipElement();
    if (!tooltip || !tab || !anchorEl) {
      return;
    }
    tooltip.innerHTML = tab.previewMarkup;
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
    tabPreviewMeasureRaf = requestAnimationFrame(() => {
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
