(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const significanceControls = Shared.significanceControls = Shared.significanceControls || {};

  const hostCache = new Map();
  let panelEl = null;
  let summaryValueEl = null;
  let thicknessInput = null;
  let colorInput = null;
  let whiskerToggleInput = null;
  let whiskerModeField = null;
  let whiskerModeSelect = null;
  let activeConfig = null;
  let activeHost = null;
  let hasDocListener = false;
  let applyingFromUndo = false;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: significanceControls ' + message, payload || {});
    }
  }

  function getUndoManager(){
    const manager = global.Shared?.undoManager;
    if(manager && typeof manager.recordStateChange === 'function'){
      return manager;
    }
    return null;
  }

  function configsMatch(a, b){
    if(!a || !b){ return false; }
    const orientationA = a.orientation || '';
    const orientationB = b.orientation || '';
    if(orientationA !== orientationB){ return false; }
    const scopeA = a.scopeId || '';
    const scopeB = b.scopeId || '';
    return scopeA === scopeB;
  }

  function sanitizeThicknessValue(value){
    if(value === null || value === undefined || value === ''){ return null; }
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){ return null; }
    return numeric;
  }

  function sanitizeColorState(value){
    if(typeof value !== 'string'){ return null; }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function normalizeColorForCompare(value){
    const sanitized = sanitizeColorState(value);
    return sanitized ? sanitized.toLowerCase() : '';
  }

  function toColorInputValue(value){
    const sanitized = sanitizeColorState(value);
    if(!sanitized){ return '#000000'; }
    const normalized = sanitized.toLowerCase();
    if(/^#([0-9a-f]{6})$/.test(normalized)){
      return normalized;
    }
    if(/^#([0-9a-f]{3})$/.test(normalized)){
      const hex = normalized.slice(1);
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    return '#000000';
  }

  function sanitizeWhiskerValue(value){
    return value !== false;
  }

  function sanitizeWhiskerMode(value){
    if(typeof value !== 'string'){ return 'fixed'; }
    const trimmed = value.trim().toLowerCase();
    return trimmed === 'adaptive' ? 'adaptive' : 'fixed';
  }

  function getUndoScope(config){
    if(!config){ return null; }
    if(typeof config.undoScope === 'string' && config.undoScope){
      return config.undoScope;
    }
    if(typeof config.scopeId === 'string' && config.scopeId){
      return `${config.scopeId}GraphPanel`;
    }
    return null;
  }

  function updatePanelInputs(config){
    if(!panelEl || !config || !thicknessInput || !colorInput || !whiskerToggleInput){ return; }
    const orientationLabel = config.orientation === 'horizontal' ? 'Horizontal Bars' : 'Vertical Bars';
    if(summaryValueEl){
      summaryValueEl.textContent = orientationLabel;
    }
    const thicknessValueRaw = config.getThickness ? config.getThickness() : null;
    const thicknessValue = sanitizeThicknessValue(thicknessValueRaw);
    thicknessInput.value = thicknessValue === null ? '' : String(thicknessValue);
    const colorValueRaw = config.getColor ? config.getColor() : null;
    colorInput.value = toColorInputValue(colorValueRaw);
    const whiskerValueRaw = config.getWhiskers ? config.getWhiskers() : true;
    whiskerToggleInput.checked = sanitizeWhiskerValue(whiskerValueRaw);

    const hasWhiskerMode = !!(whiskerModeField && whiskerModeSelect && (config.getWhiskerMode || config.onWhiskerModeChange));
    if(hasWhiskerMode){
      whiskerModeField.style.display = '';
      const whiskerModeRaw = config.getWhiskerMode ? config.getWhiskerMode() : 'fixed';
      whiskerModeSelect.value = sanitizeWhiskerMode(whiskerModeRaw);
    }else if(whiskerModeField){
      whiskerModeField.style.display = 'none';
    }
  }

  function syncPanelInputsFromConfig(config){
    if(!panelEl || panelEl.dataset.open !== '1'){ return; }
    if(!configsMatch(activeConfig, config)){ return; }
    updatePanelInputs(activeConfig);
  }

  function recordSignificanceStateChange(config, type, previousValue, nextValue, applyFn, equals){
    const manager = getUndoManager();
    if(!manager){ return; }
    const compare = typeof equals === 'function'
      ? equals
      : ((a, b) => (a === b) || (a === null && b === null));
    if(compare(previousValue, nextValue)){ return; }
    const parts = ['significance'];
    if(config?.scopeId){ parts.push(config.scopeId); }
    if(config?.orientation){ parts.push(config.orientation); }
    parts.push(type);
    const label = parts.filter(Boolean).join(':');
    manager.recordStateChange({
      label,
      scope: getUndoScope(config),
      from: previousValue,
      to: nextValue,
      equals: compare,
      apply(value){
        applyingFromUndo = true;
        try{
          if(typeof applyFn === 'function'){
            applyFn(value);
          }
        }finally{
          applyingFromUndo = false;
        }
        syncPanelInputsFromConfig(config);
        return true;
      }
    });
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
      if(evt.target?.dataset?.significanceControl === '1'){ return; }
      if(evt.target?.closest && evt.target.closest('.shared-color-picker')){ return; }
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
    panelEl.className = 'significance-controls-panel';
    panelEl.setAttribute('role', 'toolbar');
    panelEl.setAttribute('aria-label', 'Significance bar controls');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.hidden = true;

    const summary = doc.createElement('div');
    summary.className = 'significance-controls-panel__summary';
    const summaryLabel = doc.createElement('span');
    summaryLabel.className = 'significance-controls-panel__summary-label';
    summaryLabel.textContent = 'Significance';
    summaryValueEl = doc.createElement('span');
    summaryValueEl.className = 'significance-controls-panel__summary-value';
    summary.appendChild(summaryLabel);
    summary.appendChild(summaryValueEl);
    panelEl.appendChild(summary);

    const thicknessField = doc.createElement('label');
    thicknessField.className = 'significance-controls-panel__field significance-controls-panel__field--numeric';
    const thicknessLabel = doc.createElement('span');
    thicknessLabel.className = 'significance-controls-panel__field-label';
    thicknessLabel.textContent = 'Thickness';
    thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0.25';
    thicknessInput.max = '10';
    thicknessInput.step = '0.25';
    thicknessInput.placeholder = '1';
    thicknessInput.className = 'significance-controls-panel__input significance-controls-panel__input--small';
    thicknessInput.setAttribute('data-undo-ignore','1');
    thicknessField.appendChild(thicknessLabel);
    thicknessField.appendChild(thicknessInput);
    panelEl.appendChild(thicknessField);

    const colorField = doc.createElement('label');
    colorField.className = 'significance-controls-panel__field significance-controls-panel__field--color';
    const colorLabel = doc.createElement('span');
    colorLabel.className = 'significance-controls-panel__field-label';
    colorLabel.textContent = 'Color';
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'significance-controls-panel__color-input';
    colorInput.setAttribute('data-undo-ignore','1');
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorInput);
    panelEl.appendChild(colorField);

    if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(colorInput);
    }

    const whiskerField = doc.createElement('label');
    whiskerField.className = 'significance-controls-panel__field significance-controls-panel__field--toggle';
    const whiskerLabel = doc.createElement('span');
    whiskerLabel.className = 'significance-controls-panel__field-label';
    whiskerLabel.textContent = 'Whiskers';
    whiskerField.appendChild(whiskerLabel);
    const toggleRow = doc.createElement('div');
    toggleRow.className = 'significance-controls-panel__toggle-row';
    const whiskerSwitch = doc.createElement('label');
    whiskerSwitch.className = 'config-panel__checkbox';
    whiskerSwitch.dataset.checked = '0';
    whiskerToggleInput = doc.createElement('input');
    whiskerToggleInput.type = 'checkbox';
    whiskerToggleInput.setAttribute('aria-label', 'Toggle significance whiskers');
    whiskerToggleInput.setAttribute('data-undo-ignore','1');
    whiskerSwitch.appendChild(whiskerToggleInput);
    toggleRow.appendChild(whiskerSwitch);
    whiskerField.appendChild(toggleRow);
    panelEl.appendChild(whiskerField);

    whiskerModeField = doc.createElement('label');
    whiskerModeField.className = 'significance-controls-panel__field significance-controls-panel__field--numeric';
    const whiskerModeLabel = doc.createElement('span');
    whiskerModeLabel.className = 'significance-controls-panel__field-label';
    whiskerModeLabel.textContent = 'Whisker Style';
    whiskerModeSelect = doc.createElement('select');
    whiskerModeSelect.className = 'significance-controls-panel__input significance-controls-panel__input--square';
    whiskerModeSelect.setAttribute('aria-label', 'Significance whisker style');
    whiskerModeSelect.setAttribute('data-undo-ignore','1');
    const optionFixed = doc.createElement('option');
    optionFixed.value = 'fixed';
    optionFixed.textContent = 'Fixed';
    const optionAdaptive = doc.createElement('option');
    optionAdaptive.value = 'adaptive';
    optionAdaptive.textContent = 'Adaptive';
    whiskerModeSelect.appendChild(optionFixed);
    whiskerModeSelect.appendChild(optionAdaptive);
    whiskerModeField.appendChild(whiskerModeLabel);
    whiskerModeField.appendChild(whiskerModeSelect);
    whiskerModeField.style.display = 'none';
    panelEl.appendChild(whiskerModeField);

    thicknessInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      const raw = thicknessInput.value;
      const previousValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
      const requestedValue = sanitizeThicknessValue(raw);
      logDebug('thickness change',{ raw, numeric: requestedValue });
      if(config.onThicknessChange){
        config.onThicknessChange(requestedValue);
      }
      const nextValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'thickness',
        previousValue,
        nextValue,
        value => {
          if(config.onThicknessChange){
            config.onThicknessChange(value);
          }
        }
      );
    });

    colorInput.addEventListener('input', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      const previousValue = sanitizeColorState(config.getColor ? config.getColor() : null);
      const raw = colorInput.value || null;
      const requestedValue = sanitizeColorState(raw);
      logDebug('color change',{ value: requestedValue });
      if(config.onColorChange){
        config.onColorChange(requestedValue);
      }
      const nextValue = sanitizeColorState(config.getColor ? config.getColor() : null);
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'color',
        previousValue,
        nextValue,
        value => {
          if(config.onColorChange){
            config.onColorChange(value);
          }
        },
        (a, b) => normalizeColorForCompare(a) === normalizeColorForCompare(b)
      );
    });

    whiskerToggleInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      const previousValue = sanitizeWhiskerValue(config.getWhiskers ? config.getWhiskers() : null);
      const nextValue = sanitizeWhiskerValue(whiskerToggleInput.checked);
      logDebug('whisker toggle change',{ value: nextValue });
      if(config.onWhiskersChange){
        config.onWhiskersChange(nextValue);
      }
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'whiskers',
        previousValue,
        nextValue,
        value => {
          if(config.onWhiskersChange){
            config.onWhiskersChange(value);
          }
        }
      );
    });

    whiskerModeSelect.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      if(!config.getWhiskerMode && !config.onWhiskerModeChange){ return; }
      const previousValue = sanitizeWhiskerMode(config.getWhiskerMode ? config.getWhiskerMode() : null);
      const nextValue = sanitizeWhiskerMode(whiskerModeSelect.value);
      logDebug('whisker mode change',{ value: nextValue });
      if(config.onWhiskerModeChange){
        config.onWhiskerModeChange(nextValue);
      }
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'whisker-mode',
        previousValue,
        nextValue,
        value => {
          if(config.onWhiskerModeChange){
            config.onWhiskerModeChange(sanitizeWhiskerMode(value));
          }
        }
      );
    });

    ensureDocumentListener();
    logDebug('panel created');
    return panelEl;
  }

  function updateOverlayBounds(target, overlay, padding){
    if(!target || !overlay || typeof target.getBBox !== 'function'){ return null; }
    let bbox;
    try{
      bbox = target.getBBox();
    }catch(err){
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

  function ensureSignificanceOverlay(element){
    if(!element || element.__significanceControlOverlay){
      if(element && element.__significanceControlOverlay){
        const info = element.__significanceControlOverlay;
        updateOverlayBounds(element, info.element, info.padding);
        return info;
      }
      return null;
    }
    const svg = element.ownerSVGElement;
    if(!svg || typeof svg.ownerDocument?.createElementNS !== 'function'){ return null; }
    const overlay = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
    overlay.setAttribute('fill', 'transparent');
    overlay.setAttribute('pointer-events', 'fill');
    overlay.dataset.significanceControl = '1';
    overlay.style.cursor = 'pointer';
    const parent = element.parentNode;
    if(parent && typeof parent.insertBefore === 'function'){
      parent.insertBefore(overlay, element.nextSibling);
    }else{
      logDebug('overlay missing parent',{ hasParent: !!parent });
      return null;
    }
    const padding = 6;
    const bounds = updateOverlayBounds(element, overlay, padding);
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { updateOverlayBounds(element, overlay, padding); })
      : null;
    if(observer){
      observer.observe(element, { attributes: true, subtree: true, childList: true });
    }
    let removalObserver = null;
    if(parent && typeof MutationObserver === 'function'){
      removalObserver = new MutationObserver(records => {
        for(let i = 0; i < records.length; i += 1){
          const record = records[i];
          if(record.type !== 'childList'){ continue; }
          const removed = Array.from(record.removedNodes || []);
          if(removed.includes(element) || removed.includes(overlay)){
            if(observer){ observer.disconnect(); }
            if(removalObserver){ removalObserver.disconnect(); }
            overlay.remove();
            element.__significanceControlOverlay = null;
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
    element.__significanceControlOverlay = overlayInfo;
    logDebug('significance overlay ensured',{ inflate: bounds ? bounds.inflate : null });
    return overlayInfo;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    panelEl.style.display = 'none';
    panelEl.hidden = true;
    panelEl.dataset.open = '0';
    if(activeHost){
      activeHost.classList.remove('font-toolbar-host--significance');
      const fontPanel = activeHost.querySelector('.font-controls-panel');
      const axisPanel = activeHost.querySelector('.axis-controls-panel');
      const dendrogramPanel = activeHost.querySelector('.dendrogram-controls-panel');
      if((!fontPanel || fontPanel.dataset.open !== '1')
        && (!axisPanel || axisPanel.dataset.open !== '1')
        && (!dendrogramPanel || dendrogramPanel.dataset.open !== '1')){
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
    try{
      if(Shared && typeof Shared.hideAllFormatControls === 'function'){
        try{ Shared.hideAllFormatControls(); }catch(e){}
      }
    }catch(e){}
    try{
      const dendrogramControls = global.Shared?.dendrogramControls;
      if(dendrogramControls && typeof dendrogramControls.close === 'function'){
        dendrogramControls.close('significance-open');
      }
    }catch(err){
      logDebug('dendrogram close failed',{ error: err?.message || String(err) });
    }
    activeConfig = config;
    const host = resolveToolbarHost(config.scopeId);
    if(host){
      try{
        host.querySelectorAll('.workspace-toolbar__form, .box-point-controls, [data-point-controls="1"]').forEach(n => n.remove());
      }catch(e){}
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      clearHostSizing(host);
      host.style.display = 'block';
      host.classList.add('font-toolbar-host--visible');
      host.classList.add('font-toolbar-host--significance');
      updateDockActiveState(host, true);
      activeHost = host;
    }else{
      activeHost = null;
      logDebug('host unavailable for open',{ scopeId: config.scopeId });
    }
    updatePanelInputs(config);
    panelEl.style.display = 'flex';
    panelEl.hidden = false;
    panelEl.dataset.open = '1';
    logDebug('panel opened',{ orientation: config.orientation, scopeId: config.scopeId });
  }

  function registerSignificanceElement(element, config){
    if(!element || !config){ return; }
    element.dataset.significanceControl = '1';
    element.style.cursor = 'pointer';
    const overlayInfo = ensureSignificanceOverlay(element);
    const handler = evt => {
      evt.preventDefault();
      evt.stopPropagation();
      logDebug('significance clicked',{ orientation: config.orientation, scopeId: config.scopeId });
      openPanel({
        orientation: config.orientation,
        scopeId: config.scopeId,
        undoScope: config.undoScope,
        getThickness: config.getThickness,
        getColor: config.getColor,
        getWhiskers: config.getWhiskers,
        getWhiskerMode: config.getWhiskerMode,
        onThicknessChange: config.onThicknessChange,
        onColorChange: config.onColorChange,
        onWhiskersChange: config.onWhiskersChange,
        onWhiskerModeChange: config.onWhiskerModeChange
      });
    };
    if(!element.__significanceControlHandler){
      element.addEventListener('click', handler);
      element.__significanceControlHandler = handler;
    }
    if(overlayInfo && !overlayInfo.element.__significanceControlHandler){
      overlayInfo.element.addEventListener('click', handler);
      overlayInfo.element.__significanceControlHandler = handler;
    }
    logDebug('significance element registered',{ orientation: config.orientation, scopeId: config.scopeId, overlay: overlayInfo ? overlayInfo.meta : null });
  }

  significanceControls.ensurePanel = ensurePanel;
  significanceControls.registerSignificanceElement = registerSignificanceElement;
  significanceControls.close = closePanel;
  significanceControls.updateOverlayBounds = updateOverlayBounds;
})(typeof window !== 'undefined' ? window : globalThis);
