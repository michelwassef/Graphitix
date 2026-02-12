(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const additionalLineControls = Shared.additionalLineControls = Shared.additionalLineControls || {};

  const hostCache = new Map();
  let panelEl = null;
  let summaryValueEl = null;
  let thicknessInput = null;
  let colorInput = null;
  let patternSelect = null;
  let transparencyInput = null;
  let transparencyValueEl = null;
  let activeConfig = null;
  let activeHost = null;
  let hasDocListener = false;
  let applyingFromUndo = false;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: additionalLineControls ' + message, payload || {});
    }
  }

  function getUndoManager(){
    const manager = global.Shared?.undoManager;
    if(manager && typeof manager.recordStateChange === 'function'){
      return manager;
    }
    return null;
  }

  function sanitizeThicknessValue(value){
    if(value === null || value === undefined || value === ''){
      return null;
    }
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return null;
    }
    return numeric;
  }

  function sanitizeColorValue(value){
    if(typeof value !== 'string'){
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function normalizeColorForCompare(value){
    const sanitized = sanitizeColorValue(value);
    return sanitized ? sanitized.toLowerCase() : '';
  }

  function sanitizePatternValue(value){
    if(typeof value !== 'string'){
      return 'dotted';
    }
    const normalized = value.trim().toLowerCase();
    if(normalized === 'solid' || normalized === 'continuous'){
      return 'solid';
    }
    if(normalized === 'dotted' || normalized === 'dots'){
      return 'dotted';
    }
    if(normalized === 'dashed'){
      return 'dashed';
    }
    return 'dotted';
  }

  function sanitizeTransparencyValue(value){
    if(value === null || value === undefined || value === ''){
      return 0;
    }
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 0;
    }
    if(numeric < 0){
      return 0;
    }
    if(numeric > 100){
      return 100;
    }
    return numeric;
  }

  function toColorInputValue(value){
    const sanitized = sanitizeColorValue(value);
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

  function formatSummary(config){
    const axis = (config?.axis || '').toUpperCase() || '?';
    const rawValue = config && typeof config.getValue === 'function' ? Number(config.getValue()) : NaN;
    if(Number.isFinite(rawValue)){
      return `${axis} @ ${Number.parseFloat(rawValue.toPrecision(6))}`;
    }
    return `${axis} line`;
  }

  function updatePanelInputs(config){
    if(!panelEl || !config || !thicknessInput || !colorInput || !patternSelect || !transparencyInput){
      return;
    }
    if(summaryValueEl){
      summaryValueEl.textContent = formatSummary(config);
    }
    const thicknessValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
    thicknessInput.value = thicknessValue === null ? '' : String(thicknessValue);
    const colorValue = sanitizeColorValue(config.getColor ? config.getColor() : null);
    colorInput.value = toColorInputValue(colorValue);
    patternSelect.value = sanitizePatternValue(config.getPattern ? config.getPattern() : 'dotted');
    const transparencyValue = sanitizeTransparencyValue(config.getTransparency ? config.getTransparency() : 0);
    transparencyInput.value = String(Math.round(transparencyValue));
    if(transparencyValueEl){
      transparencyValueEl.textContent = `${Math.round(transparencyValue)}%`;
    }
  }

  function syncPanelInputsFromConfig(config){
    if(!panelEl || panelEl.dataset.open !== '1' || !config){ return; }
    if(activeConfig !== config){ return; }
    updatePanelInputs(activeConfig);
  }

  function recordStyleStateChange(config, type, previousValue, nextValue, applyFn, equals){
    const manager = getUndoManager();
    if(!manager){ return; }
    const compare = typeof equals === 'function'
      ? equals
      : ((a, b) => (a === b) || (a === null && b === null));
    if(compare(previousValue, nextValue)){ return; }
    const parts = ['additionalLine'];
    if(config?.scopeId){ parts.push(config.scopeId); }
    if(config?.axis){ parts.push(config.axis); }
    if(Number.isInteger(config?.index)){ parts.push(String(config.index)); }
    parts.push(type);
    manager.recordStateChange({
      label: parts.join(':'),
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
    }
  }

  function ensureDocumentListener(){
    if(hasDocListener || !global.document){ return; }
    global.document.addEventListener('click', evt => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      if(panelEl.contains(evt.target)){ return; }
      if(evt.target?.dataset?.additionalLineControl === '1'){ return; }
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
        }
      }
    }
    if(!button && scopeId){
      const dataHost = doc.querySelector(`[data-font-toolbar-scope="${key}"]`);
      if(dataHost){
        button = dataHost;
      }
    }
    let existingHost = doc.querySelector(`.font-toolbar-host[data-font-toolbar-scope="${key}"]`);
    if(existingHost){
      hostCache.set(key, existingHost);
      return existingHost;
    }
    if(!button){
      hostCache.set(key, null);
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    hostCache.set(key, host);
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
    panelEl.className = 'additional-line-controls-panel';
    panelEl.setAttribute('role', 'toolbar');
    panelEl.setAttribute('aria-label', 'Additional line controls');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.hidden = true;

    const summary = doc.createElement('div');
    summary.className = 'additional-line-controls-panel__summary';
    const summaryLabel = doc.createElement('span');
    summaryLabel.className = 'additional-line-controls-panel__summary-label';
    summaryLabel.textContent = 'Line';
    summaryValueEl = doc.createElement('span');
    summaryValueEl.className = 'additional-line-controls-panel__summary-value';
    summary.appendChild(summaryLabel);
    summary.appendChild(summaryValueEl);
    panelEl.appendChild(summary);

    const thicknessField = doc.createElement('label');
    thicknessField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--numeric';
    const thicknessLabel = doc.createElement('span');
    thicknessLabel.className = 'additional-line-controls-panel__field-label';
    thicknessLabel.textContent = 'Thickness';
    thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0.25';
    thicknessInput.max = '10';
    thicknessInput.step = '0.25';
    thicknessInput.placeholder = 'Auto';
    thicknessInput.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--small';
    thicknessInput.setAttribute('data-undo-ignore','1');
    thicknessField.appendChild(thicknessLabel);
    thicknessField.appendChild(thicknessInput);
    panelEl.appendChild(thicknessField);

    const colorField = doc.createElement('label');
    colorField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--color';
    const colorLabel = doc.createElement('span');
    colorLabel.className = 'additional-line-controls-panel__field-label';
    colorLabel.textContent = 'Color';
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'additional-line-controls-panel__color-input';
    colorInput.setAttribute('data-undo-ignore','1');
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorInput);
    panelEl.appendChild(colorField);

    if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(colorInput);
    }

    const patternField = doc.createElement('label');
    patternField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--pattern';
    const patternLabel = doc.createElement('span');
    patternLabel.className = 'additional-line-controls-panel__field-label';
    patternLabel.textContent = 'Pattern';
    patternSelect = doc.createElement('select');
    patternSelect.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--select';
    patternSelect.setAttribute('data-undo-ignore','1');
    const options = [
      { value: 'solid', label: 'Continuous' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' }
    ];
    options.forEach(opt => {
      const optionEl = doc.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      patternSelect.appendChild(optionEl);
    });
    patternField.appendChild(patternLabel);
    patternField.appendChild(patternSelect);
    panelEl.appendChild(patternField);

    const transparencyField = doc.createElement('label');
    transparencyField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--transparency';
    const transparencyLabel = doc.createElement('span');
    transparencyLabel.className = 'additional-line-controls-panel__field-label';
    transparencyLabel.textContent = 'Transparency';
    const transparencyWrap = doc.createElement('div');
    transparencyWrap.className = 'additional-line-controls-panel__range';
    transparencyInput = doc.createElement('input');
    transparencyInput.type = 'range';
    transparencyInput.min = '0';
    transparencyInput.max = '100';
    transparencyInput.step = '1';
    transparencyInput.className = 'additional-line-controls-panel__transparency-input';
    transparencyInput.setAttribute('data-undo-ignore','1');
    transparencyValueEl = doc.createElement('span');
    transparencyValueEl.className = 'additional-line-controls-panel__range-value';
    transparencyValueEl.textContent = '0%';
    transparencyWrap.appendChild(transparencyInput);
    transparencyWrap.appendChild(transparencyValueEl);
    transparencyField.appendChild(transparencyLabel);
    transparencyField.appendChild(transparencyWrap);
    panelEl.appendChild(transparencyField);

    thicknessInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || typeof activeConfig.onThicknessChange !== 'function'){ return; }
      const config = activeConfig;
      const previousValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
      const requested = sanitizeThicknessValue(thicknessInput.value);
      config.onThicknessChange(requested);
      const nextValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
      syncPanelInputsFromConfig(config);
      recordStyleStateChange(
        config,
        'thickness',
        previousValue,
        nextValue,
        value => config.onThicknessChange(sanitizeThicknessValue(value))
      );
    });

    colorInput.addEventListener('input', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || typeof activeConfig.onColorChange !== 'function'){ return; }
      const config = activeConfig;
      const previousValue = sanitizeColorValue(config.getColor ? config.getColor() : null);
      const requested = sanitizeColorValue(colorInput.value || null);
      config.onColorChange(requested);
      const nextValue = sanitizeColorValue(config.getColor ? config.getColor() : null);
      syncPanelInputsFromConfig(config);
      recordStyleStateChange(
        config,
        'color',
        previousValue,
        nextValue,
        value => config.onColorChange(sanitizeColorValue(value)),
        (a, b) => normalizeColorForCompare(a) === normalizeColorForCompare(b)
      );
    });

    patternSelect.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || typeof activeConfig.onPatternChange !== 'function'){ return; }
      const config = activeConfig;
      const previousValue = sanitizePatternValue(config.getPattern ? config.getPattern() : null);
      const requested = sanitizePatternValue(patternSelect.value);
      config.onPatternChange(requested);
      const nextValue = sanitizePatternValue(config.getPattern ? config.getPattern() : requested);
      syncPanelInputsFromConfig(config);
      recordStyleStateChange(
        config,
        'pattern',
        previousValue,
        nextValue,
        value => config.onPatternChange(sanitizePatternValue(value))
      );
    });

    transparencyInput.addEventListener('input', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || typeof activeConfig.onTransparencyChange !== 'function'){ return; }
      const config = activeConfig;
      const previousValue = sanitizeTransparencyValue(config.getTransparency ? config.getTransparency() : 0);
      const requested = sanitizeTransparencyValue(transparencyInput.value);
      config.onTransparencyChange(requested);
      const nextValue = sanitizeTransparencyValue(config.getTransparency ? config.getTransparency() : requested);
      syncPanelInputsFromConfig(config);
      recordStyleStateChange(
        config,
        'transparency',
        previousValue,
        nextValue,
        value => config.onTransparencyChange(sanitizeTransparencyValue(value))
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
      logDebug('overlay bbox failed',{ error: err?.message || String(err) });
      return null;
    }
    if(!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)){ return null; }
    const pad = Number.isFinite(padding) ? padding : 5;
    const inflate = Math.max(3, pad);
    const width = Math.max(6, bbox.width + inflate * 2);
    const height = Math.max(6, bbox.height + inflate * 2);
    overlay.setAttribute('x', String(bbox.x - inflate));
    overlay.setAttribute('y', String(bbox.y - inflate));
    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    return { width, height, inflate };
  }

  function ensureLineOverlay(element){
    if(!element){
      return null;
    }
    if(element.__additionalLineControlOverlay){
      const info = element.__additionalLineControlOverlay;
      updateOverlayBounds(element, info.element, info.padding);
      return info;
    }
    const svg = element.ownerSVGElement;
    if(!svg || typeof svg.ownerDocument?.createElementNS !== 'function'){
      return null;
    }
    const overlay = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
    overlay.setAttribute('fill', 'none');
    overlay.setAttribute('stroke', 'none');
    overlay.setAttribute('pointer-events', 'all');
    overlay.dataset.additionalLineControl = '1';
    overlay.dataset.additionalLineOverlay = '1';
    overlay.style.cursor = 'pointer';
    const parent = element.parentNode;
    if(!parent || typeof parent.insertBefore !== 'function'){
      return null;
    }
    parent.insertBefore(overlay, element.nextSibling);
    const padding = 6;
    const bounds = updateOverlayBounds(element, overlay, padding);
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { updateOverlayBounds(element, overlay, padding); })
      : null;
    if(observer){
      observer.observe(element, { attributes: true, attributeFilter: ['x1','y1','x2','y2','transform','x','y','width','height'] });
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
            element.__additionalLineControlOverlay = null;
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
    element.__additionalLineControlOverlay = overlayInfo;
    return overlayInfo;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    panelEl.style.display = 'none';
    panelEl.hidden = true;
    panelEl.dataset.open = '0';
    if(activeHost){
      activeHost.classList.remove('font-toolbar-host--additional-line');
      const fontPanel = activeHost.querySelector('.font-controls-panel');
      const axisPanel = activeHost.querySelector('.axis-controls-panel');
      const significancePanel = activeHost.querySelector('.significance-controls-panel');
      const dendrogramPanel = activeHost.querySelector('.dendrogram-controls-panel');
      if((!fontPanel || fontPanel.dataset.open !== '1')
        && (!axisPanel || axisPanel.dataset.open !== '1')
        && (!significancePanel || significancePanel.dataset.open !== '1')
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
        dendrogramControls.close('additional-line-open');
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
      host.classList.add('font-toolbar-host--additional-line');
      updateDockActiveState(host, true);
      activeHost = host;
    }else{
      activeHost = null;
      logDebug('host unavailable for open',{ scopeId: config.scopeId });
    }
    updatePanelInputs(config);
    panelEl.style.display = 'grid';
    panelEl.hidden = false;
    panelEl.dataset.open = '1';
    logDebug('panel opened',{ axis: config.axis, index: config.index, scopeId: config.scopeId });
  }

  function registerAdditionalLineElement(element, config){
    if(!element || !config){ return; }
    element.dataset.additionalLineControl = '1';
    element.style.cursor = 'pointer';
    const overlayInfo = ensureLineOverlay(element);
    const handler = evt => {
      evt.preventDefault();
      evt.stopPropagation();
      logDebug('line clicked',{ scopeId: config.scopeId, axis: config.axis, index: config.index });
      openPanel({
        scopeId: config.scopeId,
        undoScope: config.undoScope,
        axis: config.axis,
        index: config.index,
        getValue: config.getValue,
        getColor: config.getColor,
        getThickness: config.getThickness,
        getPattern: config.getPattern,
        getTransparency: config.getTransparency,
        onColorChange: config.onColorChange,
        onThicknessChange: config.onThicknessChange,
        onPatternChange: config.onPatternChange,
        onTransparencyChange: config.onTransparencyChange
      });
    };
    if(!element.__additionalLineControlHandler){
      element.addEventListener('click', handler);
      element.__additionalLineControlHandler = handler;
    }
    if(overlayInfo && !overlayInfo.element.__additionalLineControlHandler){
      overlayInfo.element.addEventListener('click', handler);
      overlayInfo.element.__additionalLineControlHandler = handler;
    }
  }

  additionalLineControls.ensurePanel = ensurePanel;
  additionalLineControls.registerAdditionalLineElement = registerAdditionalLineElement;
  additionalLineControls.close = closePanel;
  additionalLineControls.updateOverlayBounds = updateOverlayBounds;
})(typeof window !== 'undefined' ? window : globalThis);
