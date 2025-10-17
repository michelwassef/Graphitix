(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const axisControls = Shared.axisControls = Shared.axisControls || {};

  const hostCache = new Map();
  let panelEl = null;
  let axisLabelEl = null;
  let tickFieldEl = null;
  let tickInput = null;
  let thicknessInput = null;
  let colorInput = null;
  let activeConfig = null;
  let activeHost = null;
  let hasDocListener = false;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function logDebug(message, payload){
    console.debug('Debug: axisControls ' + message, payload || {});
  }

  function clearHostSizing(host){
    if(!host){ return; }
    host.style.removeProperty('min-width');
    host.style.removeProperty('max-width');
    host.style.removeProperty('width');
    const dock = typeof host.closest === 'function' ? host.closest('.workspace-toolbar__dock') : null;
    if(dock){
      dock.style.removeProperty('min-width');
      dock.style.removeProperty('max-width');
      dock.style.removeProperty('width');
      logDebug('host sizing cleared',{ scopeId: host.dataset?.fontToolbarScope || null, hasDock: true });
    } else {
      logDebug('host sizing cleared',{ scopeId: host.dataset?.fontToolbarScope || null, hasDock: false });
    }
  }

  function ensureDocumentListener(){
    if(hasDocListener || !global.document){ return; }
    global.document.addEventListener('click', evt => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      if(panelEl.contains(evt.target)){ return; }
      if(evt.target?.dataset?.axisControl === '1'){ return; }
      closePanel('outside');
    });
    hasDocListener = true;
    logDebug('document listener attached');
  }

  function resolveToolbarHost(scopeId){
    if(!global.document){ return null; }
    const doc = global.document;
    const key = scopeId || '__global__';
    if(hostCache.has(key)){
      return hostCache.get(key);
    }
    let button = null;
    const preferredAnchorId = scopeId ? `${scopeId}FontHost` : null;
    if(preferredAnchorId){
      const preferredAnchor = doc.getElementById(preferredAnchorId);
      if(preferredAnchor){
        button = preferredAnchor;
        logDebug('resolveToolbarHost preferred anchor match',{ scopeId: key, anchorId: preferredAnchorId });
      }
    }
    const buttonId = !button && scopeId ? `${scopeId}LoadExample` : null;
    if(!button && buttonId){
      button = doc.getElementById(buttonId);
    }
    if(!button && scopeId){
      const fallbackIds = [];
      if(scopeId === 'venn'){ fallbackIds.push('sample'); }
      fallbackIds.push(`${scopeId}Example`, `${scopeId}Sample`, `${scopeId}FontHost`);
      for(let i = 0; i < fallbackIds.length && !button; i += 1){
        const candidateId = fallbackIds[i];
        if(!candidateId){ continue; }
        const candidate = doc.getElementById(candidateId);
        if(candidate){
          button = candidate;
          logDebug('host fallback matched',{ scopeId: key, candidateId });
        }
      }
    }
    if(!button && scopeId){
      const dataHost = doc.querySelector(`[data-font-toolbar-scope="${key}"]`);
      if(dataHost){
        button = dataHost;
        logDebug('host data attribute match',{ scopeId: key });
      }
    }
    let existingHost = doc.querySelector(`.font-toolbar-host[data-font-toolbar-scope="${key}"]`);
    if(existingHost){
      hostCache.set(key, existingHost);
      logDebug('host reused existing font toolbar',{ scopeId: key });
      return existingHost;
    }
    if(!button){
      logDebug('host missing button',{ scopeId: key });
      hostCache.set(key, null);
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    hostCache.set(key, host);
    logDebug('host created',{ scopeId: key, buttonId });
    return host;
  }

  function updateDockActiveState(host, shouldActivate){
    if(!host || !host.parentElement){ return; }
    const dock = host.parentElement;
    if(!dock.classList || !dock.classList.contains('workspace-toolbar__dock')){ return; }
    if(shouldActivate){
      dock.classList.add('workspace-toolbar__dock--active');
      return;
    }
    const hasVisibleHost = dock.querySelector('.font-toolbar-host.font-toolbar-host--visible');
    if(!hasVisibleHost){
      dock.classList.remove('workspace-toolbar__dock--active');
    }
  }

  function ensurePanel(){
    if(panelEl || !global.document){ return panelEl; }
    const doc = global.document;
    panelEl = doc.createElement('div');
    panelEl.className = 'axis-controls-panel';
    panelEl.setAttribute('role', 'toolbar');
    panelEl.setAttribute('aria-label', 'Axis controls');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.hidden = true;

    const axisGroup = doc.createElement('div');
    axisGroup.className = 'axis-controls-panel__summary';
    const axisLabelTitle = doc.createElement('span');
    axisLabelTitle.className = 'axis-controls-panel__summary-label';
    axisLabelTitle.textContent = 'Axis';
    axisLabelEl = doc.createElement('span');
    axisLabelEl.className = 'axis-controls-panel__summary-value';
    axisGroup.appendChild(axisLabelTitle);
    axisGroup.appendChild(axisLabelEl);
    panelEl.appendChild(axisGroup);

    const tickField = doc.createElement('label');
    tickField.className = 'axis-controls-panel__field';
    tickField.classList.add('axis-controls-panel__field--numeric');
    const tickLabel = doc.createElement('span');
    tickLabel.className = 'axis-controls-panel__field-label';
    tickLabel.textContent = 'Tick Interval';
    tickInput = doc.createElement('input');
    tickInput.type = 'number';
    tickInput.min = '0';
    tickInput.step = '0.1';
    tickInput.placeholder = 'Auto';
    tickInput.className = 'axis-controls-panel__input';
    tickInput.classList.add('axis-controls-panel__input--small');
    tickField.appendChild(tickLabel);
    tickField.appendChild(tickInput);
    panelEl.appendChild(tickField);
    tickFieldEl = tickField;

    const thicknessField = doc.createElement('label');
    thicknessField.className = 'axis-controls-panel__field';
    thicknessField.classList.add('axis-controls-panel__field--numeric');
    const thicknessLabel = doc.createElement('span');
    thicknessLabel.className = 'axis-controls-panel__field-label';
    thicknessLabel.textContent = 'Thickness';
    thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0.25';
    thicknessInput.max = '10';
    thicknessInput.step = '0.25';
    thicknessInput.placeholder = '1';
    thicknessInput.className = 'axis-controls-panel__input';
    thicknessInput.classList.add('axis-controls-panel__input--small');
    thicknessField.appendChild(thicknessLabel);
    thicknessField.appendChild(thicknessInput);
    panelEl.appendChild(thicknessField);

    const colorField = doc.createElement('label');
    colorField.className = 'axis-controls-panel__field';
    colorField.classList.add('axis-controls-panel__field--color');
    const colorLabel = doc.createElement('span');
    colorLabel.className = 'axis-controls-panel__field-label';
    colorLabel.textContent = 'Color';
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'axis-controls-panel__color-input';
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorInput);
    panelEl.appendChild(colorField);

    if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(colorInput);
    }

    tickInput.addEventListener('change', () => {
      if(!activeConfig || tickInput.disabled){ return; }
      const raw = tickInput.value;
      const value = raw === '' ? null : Number(raw);
      logDebug('tick interval change',{ raw, value, axis: activeConfig.axis });
      if(activeConfig.onTickIntervalChange){
        activeConfig.onTickIntervalChange(value, activeConfig.axis);
      }
      const nextValue = activeConfig.getTickInterval ? activeConfig.getTickInterval(activeConfig.axis) : null;
      if(nextValue === null || typeof nextValue === 'undefined' || Number.isNaN(nextValue)){
        tickInput.value = '';
      } else {
        tickInput.value = String(nextValue);
      }
    });

    thicknessInput.addEventListener('change', () => {
      if(!activeConfig){ return; }
      const raw = thicknessInput.value;
      const numeric = raw === '' ? null : Number(raw);
      logDebug('thickness change',{ raw, numeric });
      if(activeConfig.onThicknessChange){
        activeConfig.onThicknessChange(numeric);
      }
      const nextThickness = activeConfig.getThickness ? activeConfig.getThickness() : null;
      if(nextThickness === null || typeof nextThickness === 'undefined' || Number.isNaN(nextThickness)){
        thicknessInput.value = '';
      } else {
        thicknessInput.value = String(nextThickness);
      }
    });

    colorInput.addEventListener('input', () => {
      if(!activeConfig){ return; }
      const value = colorInput.value || null;
      logDebug('color change',{ value });
      if(activeConfig.onColorChange){
        activeConfig.onColorChange(value);
      }
    });

    ensureDocumentListener();
    logDebug('panel created');
    return panelEl;
  }

  function updateOverlayBounds(target, overlay, padding){
    if(!target || !overlay || typeof target.getBBox !== 'function'){ return null; }
    let bbox;
    try {
      bbox = target.getBBox();
    } catch(err){
      logDebug('overlay bbox failed',{ error: err && err.message });
      return null;
    }
    if(!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)){ return null; }
    const pad = Number.isFinite(padding) ? padding : 5;
    const inflate = Math.max(2, pad);
    const width = Math.max(1, bbox.width + inflate * 2);
    const height = Math.max(1, bbox.height + inflate * 2);
    overlay.setAttribute('x', String(bbox.x - inflate));
    overlay.setAttribute('y', String(bbox.y - inflate));
    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    return { width, height, inflate };
  }

  function ensureAxisOverlay(axisElement){
    if(!axisElement || axisElement.__axisControlOverlay){
      if(axisElement && axisElement.__axisControlOverlay){
        const info = axisElement.__axisControlOverlay;
        updateOverlayBounds(axisElement, info.element, info.padding);
        return info;
      }
      return null;
    }
    const svg = axisElement.ownerSVGElement;
    if(!svg || typeof svg.ownerDocument?.createElementNS !== 'function'){ return null; }
    const overlay = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
    overlay.setAttribute('fill', 'transparent');
    overlay.setAttribute('pointer-events', 'fill');
    overlay.dataset.axisControl = '1';
    overlay.style.cursor = 'pointer';
    const parent = axisElement.parentNode;
    if(parent && typeof parent.insertBefore === 'function'){
      parent.insertBefore(overlay, axisElement.nextSibling);
    } else {
      logDebug('overlay missing parent',{ hasParent: !!parent });
      return null;
    }
    const padding = 6;
    const bounds = updateOverlayBounds(axisElement, overlay, padding);
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { updateOverlayBounds(axisElement, overlay, padding); })
      : null;
    if(observer){
      observer.observe(axisElement, { attributes: true, attributeFilter: ['x1','y1','x2','y2','transform','x','y','width','height'] });
    }
    let removalObserver = null;
    if(parent && typeof MutationObserver === 'function'){
      removalObserver = new MutationObserver(records => {
        for(let i = 0; i < records.length; i += 1){
          const record = records[i];
          if(record.type !== 'childList'){ continue; }
          const removed = Array.from(record.removedNodes || []);
          if(removed.includes(axisElement) || removed.includes(overlay)){
            if(observer){ observer.disconnect(); }
            if(removalObserver){ removalObserver.disconnect(); }
            overlay.remove();
            axisElement.__axisControlOverlay = null;
            return;
          }
        }
      });
      removalObserver.observe(parent, { childList: true });
    }
    const overlayInfo = {
      element: overlay,
      observer,
      removalObserver,
      padding,
      meta: bounds
    };
    axisElement.__axisControlOverlay = overlayInfo;
    logDebug('axis overlay ensured',{ inflate: bounds ? bounds.inflate : null });
    return overlayInfo;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    panelEl.style.display = 'none';
    panelEl.hidden = true;
    panelEl.dataset.open = '0';
    if(activeHost){
      activeHost.classList.remove('font-toolbar-host--axis');
      const fontPanel = activeHost.querySelector('.font-controls-panel');
      if(!fontPanel || fontPanel.dataset.open !== '1'){
        activeHost.classList.remove('font-toolbar-host--visible');
        activeHost.style.display = 'none';
        updateDockActiveState(activeHost, false);
      }
    }
    logDebug('panel closed',{ reason });
    activeConfig = null;
    activeHost = null;
  }

  function openPanel(config){
    ensurePanel();
    if(!panelEl){ return; }
    try {
      const fontControls = global.Shared?.fontControls;
      if(fontControls && typeof fontControls.close === 'function'){
        fontControls.close('axis-open');
        logDebug('font controls closed before axis open');
      }
    } catch(fontErr){
      console.error('axisControls openPanel fontControls.close error', fontErr);
    }
    activeConfig = config;
    const host = resolveToolbarHost(config.scopeId);
    if(host){
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      clearHostSizing(host);
      host.style.display = 'block';
      host.classList.add('font-toolbar-host--visible');
      host.classList.add('font-toolbar-host--axis');
      updateDockActiveState(host, true);
      activeHost = host;
    } else {
      activeHost = null;
      logDebug('host unavailable for open',{ scopeId: config.scopeId });
    }
    const axisName = config.axis === 'y' ? 'Y axis' : 'X axis';
    axisLabelEl.textContent = axisName;
    const tickSupported = config.isTickIntervalEnabled ? !!config.isTickIntervalEnabled(config.axis) : true;
    const tickDisabledMessage = config.getTickIntervalDisabledMessage
      ? config.getTickIntervalDisabledMessage(config.axis)
      : (config.tickIntervalDisabledMessage || 'Tick interval available only for numeric axes.');
    if(tickSupported){
      if(config.axis === 'x'){
        tickInput.step = '1';
        tickInput.min = '1';
      } else {
        tickInput.step = '0.1';
        tickInput.min = '0';
      }
      tickInput.disabled = false;
      tickInput.placeholder = config.tickPlaceholder || 'Auto';
      tickInput.title = '';
      if(tickFieldEl){ tickFieldEl.dataset.disabled = '0'; }
      const tickValue = config.getTickInterval ? config.getTickInterval(config.axis) : null;
      if(tickValue === null || typeof tickValue === 'undefined' || tickValue === ''){
        tickInput.value = '';
      } else {
        tickInput.value = String(tickValue);
      }
    } else {
      tickInput.disabled = true;
      tickInput.value = '';
      tickInput.placeholder = 'Not available';
      tickInput.title = tickDisabledMessage || '';
      if(tickFieldEl){ tickFieldEl.dataset.disabled = '1'; }
      logDebug('tick interval disabled',{ axis: config.axis, scopeId: config.scopeId, reason: tickDisabledMessage });
    }
    const thicknessValue = config.getThickness ? config.getThickness() : null;
    if(thicknessValue === null || typeof thicknessValue === 'undefined' || Number.isNaN(thicknessValue)){
      thicknessInput.value = '';
    } else {
      thicknessInput.value = String(thicknessValue);
    }
    const colorValue = config.getColor ? config.getColor() : null;
    colorInput.value = colorValue || '#000000';
    panelEl.style.display = 'flex';
    panelEl.hidden = false;
    panelEl.dataset.open = '1';
    logDebug('panel opened',{ axis: config.axis, scopeId: config.scopeId });
  }

  function registerAxisElement(element, config){
    if(!element || !config){ return; }
    element.dataset.axisControl = '1';
    element.style.cursor = 'pointer';
    const overlayInfo = ensureAxisOverlay(element);
    const handler = evt => {
      evt.preventDefault();
      evt.stopPropagation();
      logDebug('axis clicked',{ axis: config.axis, scopeId: config.scopeId });
      openPanel({
        axis: config.axis,
        scopeId: config.scopeId,
        getTickInterval: config.getTickInterval,
        getThickness: config.getThickness,
        getColor: config.getColor,
        isTickIntervalEnabled: config.isTickIntervalEnabled,
        getTickIntervalDisabledMessage: config.getTickIntervalDisabledMessage,
        tickIntervalDisabledMessage: config.tickIntervalDisabledMessage,
        tickPlaceholder: config.tickPlaceholder,
        onTickIntervalChange: config.onTickIntervalChange,
        onThicknessChange: config.onThicknessChange,
        onColorChange: config.onColorChange
      });
    };
    element.addEventListener('click', handler);
    if(overlayInfo){
      overlayInfo.element.addEventListener('click', handler);
    }
    logDebug('axis element registered',{ axis: config.axis, scopeId: config.scopeId, overlay: overlayInfo ? overlayInfo.meta : null });
  }

  axisControls.ensurePanel = ensurePanel;
  axisControls.registerAxisElement = registerAxisElement;
  axisControls.close = closePanel;
})(typeof window !== 'undefined' ? window : globalThis);
